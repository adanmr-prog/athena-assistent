# v7.1: meting van visuele rust in de demomodus. Per rol, breedte en scherm (ook detailschermen en hun tabs) telt hij
# de gebruikte lettergroottes en -gewichten (berekende stijl van elk element met eigen tekst), hoofdletterteksten,
# knoppen, gevulde (primaire) knoppen en chips; daarnaast een blur-screenshot (6 px) voor de knijptest.
# Gebruik: python3 test/ux_rust.py [--label voor|na] [--snel]. Schrijft test/shots/rust/<label>/meting.json en de screenshots.
# Doel (v7.1): per scherm hoogstens 6 lettergroottes en 3 gewichten, één gevulde knop in de inhoud.
import os, sys, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
arg = sys.argv[1:]
LABEL = arg[arg.index('--label') + 1] if '--label' in arg else 'nu'
SNEL = '--snel' in arg  # alleen 1440 en 390, geen 1024
OUT = os.path.join(ROOT, 'test', 'shots', 'rust', LABEL); os.makedirs(OUT, exist_ok=True)
POORT = 8769

class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
server = socketserver.TCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None

ROLLEN = {
    'sophie': ['home', 'contacten', 'taken', 'agenda', 'pipeline', 'projecten', 'bezetting', 'talent', 'facturatie', 'financien', 'rapporten', 'doelen', 'brein', 'review', 'huisstijl'],
    'lars': ['home', 'contacten', 'taken', 'agenda', 'pipeline', 'projecten', 'rapporten', 'doelen'],
    'femke': ['home', 'contacten', 'taken', 'projecten', 'facturatie', 'financien', 'rapporten', 'doelen'],
    'sem': ['home', 'taken', 'projecten', 'bezetting', 'talent', 'rapporten', 'doelen'],
}
TELEFOON = [('vandaag', None), ('relaties', 'scholen'), ('relaties', 'personen'), ('relaties', 'pipeline'), ('relaties', 'taken'), ('relaties', 'rapport'),
            ('brein', None), ('review', None), ('huisstijl', None), ('trajecten', None)]

METING = r"""(function () {
  var wortel = document.querySelector('.view.actief') || document.body;
  function zichtbaar(e) { var r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; }
  function eigenTekst(e) { var t = ''; for (var i = 0; i < e.childNodes.length; i++) if (e.childNodes[i].nodeType === 3) t += e.childNodes[i].nodeValue; return t.replace(/\s+/g, ''); }
  var maten = {}, gewichten = {}, hoofd = [], combi = {};
  var alle = wortel.querySelectorAll('*');
  for (var i = 0; i < alle.length; i++) {
    var e = alle[i], t = eigenTekst(e); if (!t || e.closest('script,style,svg,.demo-balk,#demoBalk')) continue;
    if (!zichtbaar(e)) continue;
    var s = getComputedStyle(e), m = Math.round(parseFloat(s.fontSize) * 2) / 2, w = s.fontWeight;
    maten[m] = (maten[m] || 0) + t.length; gewichten[w] = (gewichten[w] || 0) + t.length;
    combi[m + '/' + w] = (combi[m + '/' + w] || 0) + t.length;
    if (s.textTransform === 'uppercase' && t.length > 2) hoofd.push(t.slice(0, 24));
  }
  var knoppen = 0, gevuld = [], chips = 0;
  Array.prototype.forEach.call(wortel.querySelectorAll('button, a.knop, .knop, .knop-mini, [role=button], select.pill'), function (e) {
    if (!zichtbaar(e)) return; knoppen++;
    var s = getComputedStyle(e), bg = s.backgroundColor, m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(bg);
    if (m && (m[4] === undefined || Number(m[4]) > .5)) { var r = +m[1], g = +m[2], b = +m[3], licht = (r * 299 + g * 587 + b * 114) / 1000; if (licht < 140 && !e.classList.contains('pill')) gevuld.push((e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24)); }
  });
  Array.prototype.forEach.call(wortel.querySelectorAll('.chip, .tag, .pill'), function (e) { if (zichtbaar(e)) chips++; });
  return { maten: maten, gewichten: gewichten, combi: combi, hoofdletters: hoofd, knoppen: knoppen, gevuld: gevuld, chips: chips, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
})()"""

def wacht(page, ms=600):
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(ms)

def meet(page, rol, breedte, scherm, shots):
    wacht(page)
    m = page.evaluate(METING); m.update({'rol': rol, 'breedte': breedte, 'scherm': scherm})
    if shots:
        naam = '%s_%s_%s' % (rol, breedte, scherm.replace(':', '-').replace('/', '-'))
        page.screenshot(path=os.path.join(OUT, naam + '.png'))
        page.add_style_tag(content='html.rust-blur body > *:not(.toast) { filter: blur(6px); }')
        page.evaluate("document.documentElement.classList.add('rust-blur')")
        page.screenshot(path=os.path.join(OUT, naam + '_blur.png'))
        page.evaluate("document.documentElement.classList.remove('rust-blur')")
    return m

KIES = r"""(function (soort) {
  var B = CRM.basis || {}, ids = [];
  if (soort === 'school') { var p = (B.projecten || [])[0]; if (p && p.schoolId) return p.schoolId; return (B.scholen || [])[0] && B.scholen[0].id; }
  if (soort === 'persoon') return (B.personen || [])[0] && B.personen[0].id;
  var e = document.querySelector('.view.actief [data-crm-open^="' + soort + ':"], .view.actief [data-sleep^="' + soort + ':"]');
  if (e) { var w = e.getAttribute('data-crm-open') || e.getAttribute('data-sleep'); return w.slice(soort.length + 1); }
  if (soort === 'project') { var t = (B.projecten || [])[0]; return t && t.id; }
  if (soort === 'kans') { var k = (B.kansenKort || [])[0]; return k && k.id; }
  return '';
})"""

def details(page, rol, breedte, telefoon, shots, uit):
    # (scherm om een id te vinden, soort)
    plan = [('contacten', 'school'), ('contacten', 'persoon'), ('pipeline', 'kans'), ('projecten', 'project'), ('talent', 'talent')]
    for scherm, soort in plan:
        if telefoon:
            v = {'contacten': 'relaties', 'pipeline': 'relaties', 'projecten': 'trajecten', 'talent': 'trajecten'}[scherm]
            knop = page.locator('nav button[data-view="%s"]' % v)
            if not knop.is_visible(): continue
            knop.click(); wacht(page, 300)
            if scherm == 'pipeline':
                c = page.locator('#crmTabs [data-crmtab="pipeline"]')
                if not c.count(): continue
                c.first.click(); wacht(page, 300)
            if scherm == 'talent':
                c = page.locator('[data-pweergave="talent"]')
                if not c.count() or not c.first.is_visible(): continue
                c.first.click(); wacht(page, 300)
        else:
            if scherm not in ROLLEN[rol]: continue
            page.evaluate('deskNaar(%r)' % scherm); wacht(page, 300)
        id_ = page.evaluate(KIES + '(%r)' % soort)
        if not id_: continue
        # zoals een klik op een link in de app (die kiest zelf het juiste scherm)
        page.evaluate("(function (w) { var a = document.createElement('a'); a.setAttribute('data-crm-open', w); (document.querySelector('.view.actief') || document.body).appendChild(a); a.click(); a.remove(); })(%r)" % (soort + ':' + id_)); wacht(page, 800)
        if not page.locator('#crmDetailScherm .d-naam').count(): continue
        tabs = page.evaluate("Array.prototype.map.call(document.querySelectorAll('#crmDetailScherm [data-dtab]'), function (b) { return b.getAttribute('data-dtab'); })") or ['']
        for tab in tabs:
            if tab:
                page.locator('#crmDetailScherm [data-dtab="%s"]' % tab).first.click(); wacht(page, 400)
            uit.append(meet(page, rol, breedte, 'detail:%s/%s' % (soort, tab or '-'), shots))
        page.evaluate('CRM.terugNaar = ""; sluitDetail()'); wacht(page, 200)

resultaat = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)
    breedtes = [1440, 390] if SNEL else [1440, 1024, 390]
    for rol, schermen in ROLLEN.items():
        for breedte in breedtes:
            telefoon = breedte < 1024; shots = breedte != 1024
            ctx = b.new_context(viewport={'width': breedte, 'height': 844 if telefoon else 900}, is_mobile=telefoon, has_touch=telefoon, locale='nl-NL', timezone_id='Europe/Amsterdam')
            page = ctx.new_page()
            page.goto('http://127.0.0.1:%d/?demo=1&kaal=1&rol=%s' % (POORT, rol)); page.wait_for_selector('#zijbalk' if not telefoon else 'nav'); wacht(page)
            if not telefoon:
                for s in schermen:
                    page.evaluate('deskNaar(%r)' % s); resultaat.append(meet(page, rol, breedte, s, shots))
            else:
                for view, sub in TELEFOON:
                    knop = page.locator('nav button[data-view="%s"]' % view)
                    if not knop.is_visible(): continue
                    knop.click(); page.wait_for_timeout(300)
                    if sub:
                        c = page.locator('#crmTabs [data-crmtab="%s"]' % sub)
                        if not c.count() or not c.first.is_visible(): continue
                        c.first.click()
                    resultaat.append(meet(page, rol, breedte, view + (':' + sub if sub else ''), shots))
            details(page, rol, breedte, telefoon, shots, resultaat)
            ctx.close()
    server.shutdown()

json.dump(resultaat, open(os.path.join(OUT, 'meting.json'), 'w'), ensure_ascii=False, indent=1)
alle_maten, alle_gew = {}, {}
for m in resultaat:
    for k, v in m['maten'].items(): alle_maten[float(k)] = alle_maten.get(float(k), 0) + v
    for k, v in m['gewichten'].items(): alle_gew[k] = alle_gew.get(k, 0) + v
print('schermen gemeten:', len(resultaat))
print('lettergroottes in de hele app (px → tekens):', ', '.join('%g:%d' % (k, alle_maten[k]) for k in sorted(alle_maten)))
print('gewichten in de hele app:', ', '.join('%s:%d' % (k, alle_gew[k]) for k in sorted(alle_gew)))
n = [len(m['maten']) for m in resultaat]; g = [len(m['gewichten']) for m in resultaat]
print('per scherm: groottes gem %.1f max %d · gewichten gem %.1f max %d' % (sum(n) / len(n), max(n), sum(g) / len(g), max(g)))
print('schermen met > 6 groottes:', sum(1 for x in n if x > 6), 'van', len(n), '· met > 3 gewichten:', sum(1 for x in g if x > 3))
print('hoofdletterteksten gem per scherm: %.1f' % (sum(len(m['hoofdletters']) for m in resultaat) / len(resultaat)))
print('gevulde knoppen in de inhoud: gem %.1f, schermen met > 1: %d' % (sum(len(m['gevuld']) for m in resultaat) / len(resultaat), sum(1 for m in resultaat if len(m['gevuld']) > 1)))
print('knoppen gem per scherm: %.1f · chips/tags gem: %.1f' % (sum(m['knoppen'] for m in resultaat) / len(resultaat), sum(m['chips'] for m in resultaat) / len(resultaat)))
print('horizontale scroll:', [m['rol'] + '/' + str(m['breedte']) + '/' + m['scherm'] for m in resultaat if m['overflow']] or 'geen')
print()
print('%-8s %-5s %-34s %4s %4s %4s %4s %4s' % ('rol', 'br', 'scherm', 'grt', 'gew', 'HFD', 'knp', 'gev'))
for m in resultaat:
    print('%-8s %-5s %-34s %4d %4d %4d %4d %4d' % (m['rol'], m['breedte'], m['scherm'][:34], len(m['maten']), len(m['gewichten']), len(m['hoofdletters']), m['knoppen'], len(m['gevuld'])))
