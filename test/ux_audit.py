# v6.6: UX-audit in de demomodus: per rol en schermbreedte elk scherm langs met axe-core (WCAG 2.2 AA), tikdoelen,
# horizontale scroll, afgekapte tekst, lege schermen en consolefouten. Schrijft test/shots/ux/audit.json en screenshots.
# Gebruik: python3 test/ux_audit.py [--axe <pad naar axe.min.js>] [--label voor|na]. Zonder axe slaat hij die stap over.
import os, sys, json, time, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
arg = sys.argv[1:]
LABEL = arg[arg.index('--label') + 1] if '--label' in arg else 'nu'
AXE = arg[arg.index('--axe') + 1] if '--axe' in arg else ''
OUT = os.path.join(ROOT, 'test', 'shots', 'ux', LABEL); os.makedirs(OUT, exist_ok=True)
POORT = 8768

class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
server = socketserver.TCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None
axe_bron = open(AXE).read() if AXE and os.path.isfile(AXE) else ''

# rol → (beschrijving, desktopschermen); de telefoon doorloopt de tabbalk en de chips daarin
ROLLEN = {
    'sophie': ('management', ['home', 'contacten', 'taken', 'agenda', 'pipeline', 'projecten', 'bezetting', 'talent', 'facturatie', 'financien', 'rapporten', 'doelen', 'brein', 'review', 'huisstijl']),
    'lars': ('consultant', ['home', 'contacten', 'taken', 'agenda', 'pipeline', 'projecten', 'financien', 'rapporten', 'doelen', 'brein', 'review']),
    'femke': ('accountmanager', ['home', 'contacten', 'taken', 'projecten', 'facturatie', 'financien', 'rapporten', 'doelen']),
    'sem': ('talentscout', ['home', 'taken', 'projecten', 'bezetting', 'talent', 'rapporten', 'doelen']),
}
TELEFOON = [('vandaag', None), ('relaties', 'scholen'), ('relaties', 'personen'), ('relaties', 'pipeline'), ('relaties', 'taken'), ('relaties', 'rapport'),
            ('brein', None), ('review', None), ('huisstijl', None), ('trajecten', None)]

METING = r"""(function (min) {
  var uit = { overflow: document.documentElement.scrollWidth > innerWidth + 1, klein: [], afgekapt: [], leeg: false };
  function zichtbaar(e) { var r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.left < innerWidth; }
  function naam(e) { return (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.id || e.className || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40); }
  var doel = document.querySelectorAll('button, a[href], a[data-crm-open], a[data-desk], [role=button], input:not([type=hidden]), select, textarea, [data-crm-open], .chip, summary');
  Array.prototype.forEach.call(doel, function (e) {
    if (!zichtbaar(e)) return; var r = e.getBoundingClientRect();
    if (e.tagName === 'A' && getComputedStyle(e).display === 'inline') return;  // links in lopende tekst zijn uitgezonderd (WCAG 2.5.8)
    if (r.height < min || r.width < Math.min(min, 24)) uit.klein.push(naam(e) + ' (' + Math.round(r.width) + '×' + Math.round(r.height) + ')');
  });
  Array.prototype.forEach.call(document.querySelectorAll('h1,h2,h3,button,.r-naam,.r-titel,.chip,label,th'), function (e) {
    if (!zichtbaar(e)) return; var s = getComputedStyle(e);
    if ((s.overflow === 'hidden' || s.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 2) uit.afgekapt.push(naam(e));
  });
  var actief = document.querySelector('.view.actief') || document.body; uit.leeg = actief.innerText.replace(/\s+/g, '').length < 30;
  uit.tekst = actief.innerText.slice(0, 200).replace(/\s+/g, ' ');
  return uit;
})"""

def axe(page):
    if not axe_bron: return []
    if not page.evaluate('!!window.axe'): page.add_script_tag(content=axe_bron)
    r = page.evaluate("axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }).then(function (r) { return r.violations.map(function (v) { return { id: v.id, impact: v.impact, help: v.help, aantal: v.nodes.length, voorbeeld: v.nodes.slice(0, 3).map(function (n) { return n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\\n').slice(1, 2).join(''); }) }; }); })")
    return r

def meet(page, rol, breedte, scherm, telefoon, fouten):
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(700)
    m = page.evaluate(METING + '(%d)' % (44 if telefoon else 24))
    m['axe'] = axe(page); m['fouten'] = fouten[:]; fouten[:] = []
    m['rol'] = rol; m['breedte'] = breedte; m['scherm'] = scherm
    page.screenshot(path=os.path.join(OUT, '%s_%s_%s.png' % (rol, breedte, scherm.replace(':', '-'))), full_page=False)
    return m

resultaat = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)
    for rol, (wie, schermen) in ROLLEN.items():
        for telefoon in (False, True):
            breedte = 390 if telefoon else 1440
            ctx = b.new_context(viewport={'width': breedte, 'height': 844 if telefoon else 900}, is_mobile=telefoon, has_touch=telefoon, locale='nl-NL', timezone_id='Europe/Amsterdam')
            page = ctx.new_page(); fouten = []
            page.on('console', lambda m, f=fouten: f.append(m.text[:160]) if m.type == 'error' else None)
            page.on('pageerror', lambda e, f=fouten: f.append('pageerror ' + str(e)[:160]))
            begin = time.time()
            page.goto('http://127.0.0.1:%d/?demo=1&kaal=1&rol=%s' % (POORT, rol)); page.wait_for_selector('#zijbalk' if not telefoon else 'nav')
            page.wait_for_load_state('networkidle'); laad = round(time.time() - begin, 2)
            if not telefoon:
                for s in schermen:
                    page.evaluate('deskNaar(%r)' % s); m = meet(page, rol, breedte, s, False, fouten)
                    if s == 'home': m['laadtijd'] = laad
                    resultaat.append(m)
            else:
                for view, sub in TELEFOON:
                    knop = page.locator('nav button[data-view="%s"]' % view)
                    if not knop.is_visible(): continue
                    knop.click(); page.wait_for_timeout(300)
                    if sub:
                        c = page.locator('#crmTabs [data-crmtab="%s"]' % sub)
                        if not c.count() or not c.first.is_visible(): continue
                        c.first.click()
                    m = meet(page, rol, breedte, view + (':' + sub if sub else ''), True, fouten)
                    if view == 'vandaag': m['laadtijd'] = laad
                    resultaat.append(m)
            ctx.close()
    server.shutdown()

json.dump(resultaat, open(os.path.join(OUT, 'audit.json'), 'w'), ensure_ascii=False, indent=1)
# samenvatting
axe_tel = {}
for m in resultaat:
    for v in m['axe']:
        k = (v['id'], v['impact']); axe_tel[k] = axe_tel.get(k, 0) + 1
print('schermen:', len(resultaat))
print('horizontale scroll:', [m['rol'] + '/' + str(m['breedte']) + '/' + m['scherm'] for m in resultaat if m['overflow']] or 'geen')
print('consolefouten:', [(m['scherm'], m['fouten']) for m in resultaat if m['fouten']] or 'geen')
print('lege schermen:', [m['rol'] + '/' + m['scherm'] for m in resultaat if m['leeg']] or 'geen')
print('axe (id, impact) → aantal schermen:')
for k, n in sorted(axe_tel.items(), key=lambda x: -x[1]): print('  ', k, n)
import re
def maat(x):
    g = re.search(r'\((\d+)×(\d+)\)$', x); return (int(g.group(1)), int(g.group(2))) if g else (99, 99)
onder24 = [(m['rol'], m['breedte'], m['scherm'], x) for m in resultaat for x in m['klein'] if min(maat(x)) < 24]
tel44 = [(m['scherm'], x) for m in resultaat if m['breedte'] == 390 for x in m['klein'] if min(maat(x)) >= 24 and not (maat(x)[1] >= 36)]
print('tikdoelen < 24 px (WCAG 2.5.8):', len(onder24))
for x in sorted(set(o[3].split(' (')[0] + ' (' + o[3].split(' (')[-1] for o in onder24))[:25]: print('   ', x)
print('telefoon 24-35 px hoog (onder de 36/44-norm):', len(tel44))
for x in sorted(set(t[1].split(' (')[0][:30] + ' (' + t[1].split(' (')[-1] for t in tel44))[:25]: print('   ', x)
print('afgekapte tekst, totaal:', sum(len(m['afgekapt']) for m in resultaat))
