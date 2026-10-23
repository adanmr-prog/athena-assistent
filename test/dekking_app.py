# v7.2: dekkingsmeting van index.html in de demomodus. Per rol (sophie, lars, femke, sem) en breedte (1440, 390) opent hij alle
# schermen (desktopmenu via deskNaar, telefoontabs, weergavechips) en alle detailschermen (school, persoon, kans, project, talent)
# met al hun tabs, met dezelfde navigatie als test/ux_rust.py, en meet met CDP welke CSS-regels (CSS.startRuleUsageTracking) en
# JS-functies en -blokken (Profiler.startPreciseCoverage, detailed) daarbij gebruikt zijn. Cumulatief over alle contexten: een
# regel, functie of teken telt als gebruikt zodra hij ergens gebruikt is.
# Rapport (test/shots/robuust/dekking.json en dekking.md):
#   (1) CSS-regels die op geen enkel scherm matchen, met selector, regelnummer, omringende @media en bytes;
#   (2) JS-functies met 0 dekking, gesplitst in "dood" (de naam komt buiten de eigen definitie nergens voor in index.html, ook niet
#       als string, en ook niet in Code.gs, demo/ of sw.js) en "interactie" (wel gerefereerd, alleen niet geraakt bij bekijken);
#       "keten" = alleen gerefereerd vanuit functies die zelf dood zijn;
#   (3) totaal bytes CSS en JS en het ongebruikte deel.
# Het is een meting: hij eindigt met ALLES GOED, tenzij de meting zelf misgaat (een context laadt niet, geen dekkingsgegevens,
# de bron in de browser komt niet overeen met index.html op schijf). Dan FOUTEN: n en exitcode 1.
# Gebruik: python3 test/dekking_app.py [--rollen sophie,lars] [--breedtes 1440,390] [--debug]. Eigen http.server op poort 8783.
# Looptijd: circa 4 tot 6 minuten voor alle acht contexten; boven de 540 s worden resterende contexten overgeslagen (wordt gemeld).
import os, sys, re, json, time, bisect, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
arg = sys.argv[1:]
def optie(naam, standaard):
    return arg[arg.index(naam) + 1] if naam in arg and arg.index(naam) + 1 < len(arg) else standaard
DEBUG = '--debug' in arg
POORT = 8783
TIJDSLIMIET = 540  # seconden; daarboven geen nieuwe context meer starten
OUT = os.path.join(ROOT, 'test', 'shots', 'robuust'); os.makedirs(OUT, exist_ok=True)
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None

# Dezelfde schermen als test/ux_rust.py (v7.1)
ROLLEN = {
    'sophie': ['home', 'contacten', 'taken', 'agenda', 'pipeline', 'projecten', 'bezetting', 'talent', 'facturatie', 'financien', 'rapporten', 'doelen', 'brein', 'review', 'huisstijl'],
    'lars': ['home', 'contacten', 'taken', 'agenda', 'pipeline', 'projecten', 'rapporten', 'doelen'],
    'femke': ['home', 'contacten', 'taken', 'projecten', 'facturatie', 'financien', 'rapporten', 'doelen'],
    'sem': ['home', 'taken', 'projecten', 'bezetting', 'talent', 'rapporten', 'doelen'],
}
TELEFOON = [('vandaag', None), ('relaties', 'scholen'), ('relaties', 'personen'), ('relaties', 'pipeline'), ('relaties', 'taken'), ('relaties', 'rapport'),
            ('brein', None), ('review', None), ('huisstijl', None), ('trajecten', None)]
# Chips die alleen een weergave of filter wisselen (geen schrijfactie); worden per scherm één keer aangeklikt
WEERGAVECHIPS = ['pweergave', 'bweergave', 'taakweergave', 'doelpreset', 'doelteam', 'rteam', 'rmetric', 'finkas', 'tstatus', 'typefilter', 'crmpreset', 'pam', 'bmijn', 'bopen', 'crmmijn', 'factmijn']
MAX_CHIPS_PER_ATTR, MAX_CHIPS_PER_SCHERM = 6, 24

ROLLEN_KEUZE = [r for r in optie('--rollen', ','.join(ROLLEN)).split(',') if r in ROLLEN]
BREEDTES = [int(b) for b in optie('--breedtes', '1440,390').split(',')]

class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
server = socketserver.ThreadingTCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()

FOUTEN = []
def ok(t): print('ok   ' + t)
def fout(t): FOUTEN.append(t); print('FOUT ' + t)

# --- navigatie (overgenomen uit test/ux_rust.py) ---
def wacht(page, ms=350):
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(ms)

KIES = r"""(function (soort) {
  var B = CRM.basis || {};
  if (soort === 'school') { var p = (B.projecten || [])[0]; if (p && p.schoolId) return p.schoolId; return (B.scholen || [])[0] && B.scholen[0].id; }
  if (soort === 'persoon') return (B.personen || [])[0] && B.personen[0].id;
  var e = document.querySelector('.view.actief [data-crm-open^="' + soort + ':"], .view.actief [data-sleep^="' + soort + ':"]');
  if (e) { var w = e.getAttribute('data-crm-open') || e.getAttribute('data-sleep'); return w.slice(soort.length + 1); }
  if (soort === 'project') { var t = (B.projecten || [])[0]; return t && t.id; }
  if (soort === 'kans') { var k = (B.kansenKort || [])[0]; return k && k.id; }
  return '';
})"""
CHIPS_ZOEK = r"""(function (attrs, maxPer) {
  var uit = [];
  attrs.forEach(function (a) {
    var gezien = {}, n = 0;
    Array.prototype.forEach.call(document.querySelectorAll('button.chip[data-' + a + ']'), function (b) {
      var r = b.getBoundingClientRect(); if (!r.width || !r.height || n >= maxPer) return;
      var v = b.getAttribute('data-' + a); if (gezien[v]) return; gezien[v] = 1; n++; uit.push([a, v]);
    });
  });
  return uit;
})"""
CHIP_KLIK = r"""(function (p) { var b = document.querySelector('button.chip[data-' + p[0] + '="' + p[1].replace(/"/g, '\\"') + '"]'); if (!b) return false; b.click(); return true; })"""

def weergavechips(page, schermen, naam):
    """Klikt op elk scherm één keer op elke zichtbare weergave- of filterchip (whitelist), zodat ook die varianten meetellen."""
    paren = page.evaluate(CHIPS_ZOEK + '(%s, %d)' % (json.dumps(WEERGAVECHIPS), MAX_CHIPS_PER_ATTR))[:MAX_CHIPS_PER_SCHERM]
    for p in paren:
        if page.evaluate(CHIP_KLIK + '(%s)' % json.dumps(p)):
            page.wait_for_timeout(220); schermen.append(naam + '@' + p[0] + '=' + str(p[1]))

def details(page, rol, telefoon, schermen):
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
        page.evaluate("(function (w) { var a = document.createElement('a'); a.setAttribute('data-crm-open', w); (document.querySelector('.view.actief') || document.body).appendChild(a); a.click(); a.remove(); })(%r)" % (soort + ':' + id_)); wacht(page, 700)
        if not page.locator('#crmDetailScherm .d-naam').count(): continue
        tabs = page.evaluate("Array.prototype.map.call(document.querySelectorAll('#crmDetailScherm [data-dtab]'), function (b) { return b.getAttribute('data-dtab'); })") or ['']
        for tab in tabs:
            if tab:
                page.locator('#crmDetailScherm [data-dtab="%s"]' % tab).first.click(); wacht(page, 350)
            schermen.append('detail:%s/%s' % (soort, tab or '-'))
        page.evaluate('CRM.terugNaar = ""; sluitDetail()'); wacht(page, 200)

def doorloop(page, rol, telefoon):
    schermen = []
    if not telefoon:
        for s in ROLLEN[rol]:
            page.evaluate('deskNaar(%r)' % s); wacht(page); schermen.append(s)
            weergavechips(page, schermen, s)
    else:
        for view, sub in TELEFOON:
            knop = page.locator('nav button[data-view="%s"]' % view)
            if not knop.is_visible(): continue
            knop.click(); page.wait_for_timeout(300)
            if sub:
                c = page.locator('#crmTabs [data-crmtab="%s"]' % sub)
                if not c.count() or not c.first.is_visible(): continue
                c.first.click()
            wacht(page); schermen.append(view + (':' + sub if sub else ''))
            weergavechips(page, schermen, view + (':' + sub if sub else ''))
    details(page, rol, telefoon, schermen)
    return schermen

# --- CSS: stijlregels uit de tekst van een stylesheet (offsets blijven gelijk aan die van CDP) ---
GROEP_AT = ('@media', '@supports', '@layer', '@container', '@scope', '@document')
def ontleed_css(text):
    """Geeft de stijlregels (met selector) als dicts met start (eerste teken van de selector), open ({), sluit (}) en context (omringende @-regels)."""
    t = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group(0)), text, flags=re.S)
    n = len(t); i = 0; stack = []; regels = []; prelude_start = 0
    while i < n:
        c = t[i]
        if c in '"\'':
            j = i + 1
            while j < n and t[j] != c:
                if t[j] == '\\': j += 1
                j += 1
            i = j + 1; continue
        if c == '{':
            ruw = t[prelude_start:i]; prelude = ruw.strip(); ps = prelude_start + (len(ruw) - len(ruw.lstrip()))
            if prelude.startswith('@'):
                naam = prelude.split(None, 1)[0].lower()
                soort = 'groep' if naam in GROEP_AT else 'keyframes' if naam.endswith('keyframes') else 'decl'
                stack.append([soort, prelude, i, ps])
            else:
                in_kf = any(s[0] == 'keyframes' for s in stack)
                stack.append(['kf' if in_kf else 'regel', prelude, i, ps])
            prelude_start = i + 1; i += 1; continue
        if c == '}':
            if stack:
                s = stack.pop()
                if s[0] == 'regel':
                    ctx = ' › '.join(' '.join(x[1].split()) for x in stack if x[0] == 'groep')
                    regels.append({'selector': ' '.join(s[1].split()), 'start': s[3], 'open': s[2], 'sluit': i, 'context': ctx})
            prelude_start = i + 1; i += 1; continue
        if c == ';': prelude_start = i + 1
        i += 1
    regels.sort(key=lambda r: r['open'])
    return regels

INTERACTIE_CSS = re.compile(r':hover|:focus|:active|:checked|:disabled|:invalid|:placeholder-shown|::selection|\.sleep|\.sleept|-over\b|\.toets|\.aan\b|\.open\b|\.bezig\b|\.fout\b|print')

# --- JS: functies in de bron en de koppeling met de dekkingsrecords ---
RE_FUNC = re.compile(r'function\s+([A-Za-z_$][\w$]*)\s*\(')
RE_METH = re.compile(r'([A-Za-z_$][\w$]*)\s*:\s*(function)\s*\(')
RE_VAR = re.compile(r'([A-Za-z_$][\w$]*)\s*=\s*(function)\s*\(')

def code_eenheden(s):
    """V8- en CSS-offsets zijn UTF-16-eenheden; Python telt codepunten. Geeft (py→cu lijst of None bij gelijkheid)."""
    if not any(ord(c) > 0xFFFF for c in s): return None
    cu = [0] * (len(s) + 1); acc = 0
    for i, c in enumerate(s):
        cu[i] = acc; acc += 2 if ord(c) > 0xFFFF else 1
    cu[len(s)] = acc
    return cu

def functie_definities(bron):
    """Alle 'function naam(' / 'naam: function (' / 'naam = function (' in de bron, gesleuteld op de positie van het woord function."""
    defs = {}
    def voeg(pos, naam, naampos, soort):
        d = defs.setdefault(pos, {'pos': pos, 'naam': naam, 'namen': [], 'naamposities': [], 'soort': soort})
        if naam not in d['namen']: d['namen'].append(naam); d['naamposities'].append(naampos)
    for m in RE_FUNC.finditer(bron): voeg(m.start(), m.group(1), m.start(1), 'declaratie')
    for m in RE_METH.finditer(bron): voeg(m.start(2), m.group(1), m.start(1), 'methode')
    for m in RE_VAR.finditer(bron): voeg(m.start(2), m.group(1), m.start(1), 'variabele')
    return defs

def js_bitmap(n, functies):
    """Per teken 1 (uitgevoerd) of 0, zoals DevTools: alle bereiken op (start op, eind af) gesorteerd en na elkaar toegepast, zodat geneste bereiken winnen."""
    bereiken = []
    for f in functies:
        for r in f['ranges']: bereiken.append((r['startOffset'], r['endOffset'], 1 if r['count'] > 0 else 0))
    bereiken.sort(key=lambda b: (b[0], -b[1]))
    bm = bytearray(n)
    for a, b, w in bereiken:
        a = max(0, a); b = min(n, b)
        if b > a: bm[a:b] = bytes([w]) * (b - a)
    return bm

def regel_in_html(html_pos, html):
    return html.count('\n', 0, html_pos) + 1

def functie_eind(bron, pos, grens):
    """Einde (exclusief) van de functie die bij pos begint, door accolades te tellen (strings en commentaar overgeslagen); nooit verder dan grens."""
    n = min(len(bron), grens); i = bron.find('{', pos)
    if i < 0 or i >= n: return grens
    diepte = 0
    while i < n:
        c = bron[i]
        if c in '"\'':
            j = i + 1
            while j < n and bron[j] != c and bron[j] != '\n':
                if bron[j] == '\\': j += 1
                j += 1
            i = j + 1; continue
        if c == '/' and i + 1 < n and bron[i + 1] == '/': i = bron.find('\n', i); i = n if i < 0 else i; continue
        if c == '/' and i + 1 < n and bron[i + 1] == '*': i = bron.find('*/', i); i = n if i < 0 else i + 2; continue
        if c == '{': diepte += 1
        elif c == '}':
            diepte -= 1
            if diepte == 0: return i + 1
        i += 1
    return grens

# --- meting ---
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
script_start = html.index('<script>') + len('<script>'); script_eind = html.index('</script>', script_start)
bron_schijf = html[script_start:script_eind]
t0 = time.time()
contexten = []
css_tekst = {}     # sleutel (startLine, startColumn) -> tekst
css_gebruikt = {}  # sleutel -> set(open-offsets)
css_header = {}
css_overig = {}    # bladen die niet meetellen (extern, user-agent, injected)
js_bron = None; js_cum = None; js_cov = {}  # cu-start -> {'count', 'end', 'naam'}
js_alle_records = []  # (start, end, count, functionName) cumulatief voor 'via ouder'
overgeslagen = []

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)
    for rol in ROLLEN_KEUZE:
        for breedte in BREEDTES:
            if time.time() - t0 > TIJDSLIMIET:
                overgeslagen.append('%s/%d' % (rol, breedte)); print('info overgeslagen wegens tijdslimiet: %s/%d' % (rol, breedte)); continue
            tc = time.time(); telefoon = breedte < 1024
            ctx = b.new_context(viewport={'width': breedte, 'height': 844 if telefoon else 900}, is_mobile=telefoon, has_touch=telefoon, locale='nl-NL', timezone_id='Europe/Amsterdam')
            page = ctx.new_page()
            cdp = ctx.new_cdp_session(page)
            bladen = {}
            cdp.on('CSS.styleSheetAdded', lambda e, bladen=bladen: bladen.__setitem__(e['header']['styleSheetId'], e['header']))
            cdp.send('DOM.enable'); cdp.send('CSS.enable'); cdp.send('CSS.startRuleUsageTracking')
            cdp.send('Profiler.enable'); cdp.send('Profiler.startPreciseCoverage', {'callCount': False, 'detailed': True})
            basis = 'http://127.0.0.1:%d/?demo=1&kaal=1&rol=%s' % (POORT, rol)
            schermen = []; melding = ''
            try:
                page.goto(basis); page.wait_for_selector('#zijbalk' if not telefoon else 'nav'); wacht(page, 600)
                schermen = doorloop(page, rol, telefoon)
            except Exception as e:
                melding = str(e).split('\n')[0][:160]
            # --- JS ---
            try:
                bron = page.evaluate("Array.prototype.filter.call(document.scripts, function (s) { return !s.src; })[0].textContent")
                cov = cdp.send('Profiler.takePreciseCoverage')
                cu_map = code_eenheden(bron); n_cu = cu_map[-1] if cu_map else len(bron)
                kand = [s for s in cov['result'] if s.get('url', '').split('#')[0] == basis]
                script = None
                for s in kand:
                    top = s['functions'][0]['ranges'][0] if s['functions'] else None
                    if top and top['endOffset'] == n_cu: script = s
                if script is None and kand: script = max(kand, key=lambda s: s['functions'][0]['ranges'][0]['endOffset'] if s['functions'] else 0)
                if script is None: raise RuntimeError('geen dekkingsrecord voor het inline script (%d scripts met deze url)' % len(kand))
                if js_bron is None:
                    js_bron = bron
                    if bron != bron_schijf: fout('bron van het inline script in de browser komt niet overeen met index.html op schijf')
                elif bron != js_bron: fout('%s/%d: inline script verschilt van de eerste context' % (rol, breedte))
                bm = js_bitmap(n_cu, script['functions'])
                js_cum = bm if js_cum is None else bytearray((int.from_bytes(js_cum, 'big') | int.from_bytes(bm, 'big')).to_bytes(n_cu, 'big'))
                for f in script['functions']:
                    r0 = f['ranges'][0]; st = r0['startOffset']
                    rec = js_cov.setdefault(st, {'count': 0, 'end': r0['endOffset'], 'naam': f['functionName']})
                    rec['count'] = max(rec['count'], r0['count'])
                    js_alle_records.append((st, r0['endOffset'], r0['count']))
                js_pct = 100.0 * sum(bm) / max(1, n_cu)
            except Exception as e:
                fout('%s/%d JS-dekking: %s' % (rol, breedte, str(e).split('\n')[0][:160])); js_pct = -1
            # --- CSS ---
            try:
                gebruik = []
                try: gebruik += cdp.send('CSS.takeCoverageDelta').get('coverage', [])
                except Exception: pass
                gebruik += cdp.send('CSS.stopRuleUsageTracking').get('ruleUsage', [])
                ids = set(bladen) | set(u['styleSheetId'] for u in gebruik)
                sleutel_van = {}
                for sid in ids:
                    h = bladen.get(sid) or {}
                    eigen = h.get('isInline') and str(h.get('sourceURL', '')).split('#')[0] == basis and h.get('origin', 'regular') == 'regular'
                    if not eigen:
                        css_overig[str(h.get('sourceURL') or sid)] = {'origin': h.get('origin'), 'isInline': h.get('isInline'), 'lengte': h.get('length')}; continue
                    sl = (h.get('startLine', 0), h.get('startColumn', 0)); sleutel_van[sid] = sl
                    tekst = cdp.send('CSS.getStyleSheetText', {'styleSheetId': sid})['text']
                    if sl not in css_tekst: css_tekst[sl] = tekst; css_header[sl] = h; css_gebruikt[sl] = set()
                    elif css_tekst[sl] != tekst: fout('%s/%d: stylesheet %s verschilt van de eerste context' % (rol, breedte, sl))
                n_used = 0; n_false = 0; gebruikt_nu = set()
                for u in gebruik:
                    sl = sleutel_van.get(u['styleSheetId'])
                    if sl is None: continue
                    if not u.get('used', True): n_false += 1; continue
                    gebruikt_nu.add((sl, u['startOffset'], u['endOffset'])); n_used += 1
                # koppel aan de stijlregels: een gebruikt bereik omsluit { en } van precies die regel
                geraakt = 0; ongekoppeld = []
                for sl in css_tekst:
                    regels = ontleed_css(css_tekst[sl]); opens = [r['open'] for r in regels]
                    for (sl2, a, bb) in gebruikt_nu:
                        if sl2 != sl: continue
                        i = bisect.bisect_left(opens, a); hit = False
                        while i < len(regels) and regels[i]['open'] < bb:
                            if regels[i]['sluit'] < bb: css_gebruikt[sl].add(regels[i]['open']); geraakt += 1; hit = True
                            i += 1
                        if not hit and '{' in css_tekst[sl][a:bb]: ongekoppeld.append(css_tekst[sl][a:bb][:100])  # een @media-kop zonder blok meldt Chromium apart; die telt niet
                if ongekoppeld: fout('%s/%d: %d gebruikte CSS-bereiken niet aan een stijlregel te koppelen, bv. %r' % (rol, breedte, len(ongekoppeld), ongekoppeld[0]))
                css_pct = 100.0 * geraakt / max(1, sum(len(ontleed_css(css_tekst[sl])) for sl in css_tekst))
                if DEBUG:
                    print('debug bladen:', {str(k): (v.get('origin'), v.get('isInline'), v.get('startLine'), v.get('length')) for k, v in bladen.items()})
                    print('debug gebruikte bereiken: %d (uniek %d), used=false: %d, gekoppeld: %d' % (n_used, len(gebruikt_nu), n_false, geraakt))
                    for (sl, a, bb) in sorted(gebruikt_nu)[:3]: print('debug voorbeeld bereik:', repr(css_tekst[sl][a:bb][:80]))
            except Exception as e:
                fout('%s/%d CSS-dekking: %s' % (rol, breedte, str(e).split('\n')[0][:160])); css_pct = -1
            ctx.close()
            duur = time.time() - tc
            contexten.append({'rol': rol, 'breedte': breedte, 'schermen': schermen, 'aantal_schermen': len(schermen), 'css_pct': round(css_pct, 1), 'js_pct': round(js_pct, 1), 'duur_s': round(duur, 1), 'fout': melding})
            if melding: fout('%s/%d navigatie: %s (na %d schermen)' % (rol, breedte, melding, len(schermen)))
            else: ok('%s/%d: %d schermen · CSS %.1f%% · JS %.1f%% · %.0f s' % (rol, breedte, len(schermen), css_pct, js_pct, duur))
    b.close()
server.shutdown()

# --- CSS-rapport ---
# Statische controle, conservatief: een klasse, id of data-attribuut uit de selector telt als gerefereerd zodra het woord ergens buiten de
# stylesheets in index.html voorkomt (opmaak of JS-string), of als een voorvoegsel met koppelteken als string wordt samengesteld ('status-' + …).
html_zonder_css = re.sub(r'<style>.*?</style>', lambda m: ' ' * len(m.group(0)), html, flags=re.S)
def css_tokens(selector):
    s = re.sub(r':not\([^)]*\)|::?[a-z-]+(\([^)]*\))?|\[[^\]]*\]', lambda m: ' ' if not m.group(0).startswith('[') else ' ' + m.group(0) + ' ', selector)
    toks = set('.' + c for c in re.findall(r'\.([A-Za-z_-][\w-]*)', s)) | set('#' + c for c in re.findall(r'#([A-Za-z_-][\w-]*)', s)) | set(re.findall(r'\[(data-[\w-]+)', s))
    return toks
_ref_cache = {}
def css_token_gerefereerd(tok):
    if tok in _ref_cache: return _ref_cache[tok]
    naam = tok.lstrip('.#')
    uit = bool(re.search(r'(?<![\w-])' + re.escape(naam) + r'(?![\w-])', html_zonder_css))
    if not uit and '-' in naam:
        delen = naam.split('-')
        uit = any(("%s-'" % '-'.join(delen[:i])) in html_zonder_css or ('%s-"' % '-'.join(delen[:i])) in html_zonder_css for i in range(1, len(delen)))
    m = re.match(r'^([A-Za-z_-]+?)(\d+)$', naam)  # b0/b1/b2 uit 'b' + v
    if not uit and m: uit = bool(re.search(r"['\"]%s['\"]\s*\+" % re.escape(m.group(1)), html_zonder_css))
    _ref_cache[tok] = uit; return uit
css_regels_uit = []; css_tot = 0; css_bytes = 0; css_ongebruikt_bytes = 0; css_ongebruikt = 0
for sl in sorted(css_tekst):
    tekst = css_tekst[sl]; h = css_header[sl]; regels = ontleed_css(tekst)
    css_tot += len(regels); css_bytes += len(tekst.encode('utf-8'))
    for r in regels:
        if r['open'] in css_gebruikt[sl]: continue
        stuk = tekst[r['start']:r['sluit'] + 1]; by = len(stuk.encode('utf-8'))
        css_ongebruikt += 1; css_ongebruikt_bytes += by
        ontbrekend = sorted(t for t in css_tokens(r['selector']) if not css_token_gerefereerd(t))
        css_regels_uit.append({'selector': r['selector'], 'context': r['context'], 'regel': h.get('startLine', 0) + 1 + tekst.count('\n', 0, r['start']), 'bytes': by,
                               'mogelijk_interactie': bool(INTERACTIE_CSS.search(r['selector'] + ' ' + r['context'])), 'statisch_dood': bool(ontbrekend), 'niet_gevonden': ontbrekend})
css_regels_uit.sort(key=lambda r: (not r['statisch_dood'], -r['bytes']))

# --- JS-rapport ---
js = {}
if js_bron is not None and js_cum is not None:
    cu_map = code_eenheden(js_bron); n_cu = len(js_cum)
    def cu(p): return cu_map[p] if cu_map else p
    def py(c):
        if not cu_map: return c
        return bisect.bisect_right(cu_map, c) - 1
    defs = functie_definities(js_bron)
    js_alle_records.sort(key=lambda r: (r[0], -r[1]))
    def omsluitend(c):
        """Innerste dekkingsrecord dat positie c bevat; (start, eind, maxcount) of None."""
        best = None
        for st, en, cnt in js_alle_records:
            if st <= c < en and (best is None or (en - st) < (best[1] - best[0])): best = [st, en, cnt]
            elif best is not None and st <= c < en and (en - st) == (best[1] - best[0]): best[2] = max(best[2], cnt)
        return best
    # cumulatieve count per record-start (max over contexten) is al js_cov; voor 'via ouder' telt de max over alle contexten
    max_per_bereik = {}
    for st, en, cnt in js_alle_records: max_per_bereik[(st, en)] = max(max_per_bereik.get((st, en), 0), cnt)
    extern_bestanden = ['backend/Code.gs', 'demo/demo.js', 'demo/demo-backend.js', 'sw.js']
    extern_tekst = {}
    for bn in extern_bestanden:
        pad = os.path.join(ROOT, bn)
        if os.path.isfile(pad): extern_tekst[bn] = open(pad, encoding='utf-8', errors='replace').read()
    nul = []; zonder_record = []; uitgevoerd = 0
    for pos in sorted(defs):
        d = defs[pos]; c = cu(pos); rec = js_cov.get(c)
        if rec is None:
            om = omsluitend(c)
            if om is None or max_per_bereik.get((om[0], om[1]), 0) > 0:
                zonder_record.append({'naam': d['naam'], 'regel': regel_in_html(script_start + pos, html)}); continue
            d['count'] = 0; d['eind'] = functie_eind(js_bron, pos, py(om[1])); d['via_ouder'] = True  # eigen einde door accolades: het record is van de ouder
        else:
            d['count'] = rec['count']; d['eind'] = py(rec['end']); d['via_ouder'] = False
        if d['count'] > 0: uitgevoerd += 1
        else: nul.append(d)
    # statische referenties: naam (woordgrens) buiten de eigen definitie en het eigen lichaam, in heel index.html; en in Code.gs, demo, sw.js
    def referenties(d):
        eigen = (script_start + d['pos'], script_start + d['eind'])
        naamposities = set(script_start + np for np in d['naamposities'])
        posities = []
        for naam in d['namen']:
            for m in re.finditer(r'(?<![\w$])' + re.escape(naam) + r'(?![\w$])', html):
                if m.start() in naamposities or eigen[0] <= m.start() < eigen[1]: continue
                posities.append(m.start())
        extern = [bn for bn in extern_tekst if any(re.search(r'(?<![\w$])' + re.escape(naam) + r'(?![\w$])', extern_tekst[bn]) for naam in d['namen'])]
        return posities, extern
    for d in nul:
        d['refs'], d['extern'] = referenties(d)
        d['status'] = 'dood' if not d['refs'] and not d['extern'] else 'interactie'; d['via'] = 'direct' if d['status'] == 'dood' else ''
    # keten: alleen gerefereerd vanuit functies die zelf dood zijn (en niets extern)
    veranderd = True
    while veranderd:
        veranderd = False
        dode = [(script_start + x['pos'], script_start + x['eind'], x['naam']) for x in nul if x['status'] == 'dood']
        for d in nul:
            if d['status'] != 'interactie' or d['extern']: continue
            bronnen = set()
            for pos in d['refs']:
                hit = [nm for (a, bb, nm) in dode if a <= pos < bb]
                if not hit: bronnen = None; break
                bronnen.add(hit[0])
            if bronnen:
                d['status'] = 'dood'; d['via'] = 'keten via ' + ', '.join(sorted(bronnen)); veranderd = True
    def record(d):
        stuk = js_bron[d['pos']:d['eind']]
        return {'naam': d['naam'], 'namen': d['namen'], 'soort': d['soort'], 'regel': regel_in_html(script_start + d['pos'], html), 'tekens': len(stuk), 'bytes': len(stuk.encode('utf-8')),
                'referenties_in_index': len(d['refs']), 'extern': d['extern'], 'via': d['via'], 'binnen_niet_uitgevoerde_ouder': d['via_ouder']}
    dood = [record(d) for d in nul if d['status'] == 'dood']; interactie = [record(d) for d in nul if d['status'] == 'interactie']
    # totalen in tekens en bytes; ongebruikte regels (regels met inhoud waarvan geen teken is uitgevoerd)
    tot_cu = n_cu; gebruikt_cu = sum(js_cum)
    ongebruikt_bytes = 0; i = 0; segmenten = []
    while i < n_cu:
        if js_cum[i]: i += 1; continue
        j = i
        while j < n_cu and not js_cum[j]: j += 1
        stuk = js_bron[py(i):py(j)]; ongebruikt_bytes += len(stuk.encode('utf-8')); segmenten.append((i, j)); i = j
    regels_tot = 0; regels_uit = 0; lijnstart = 0
    for lijn in js_bron.split('\n'):
        l2 = lijnstart + len(lijn)
        if lijn.strip():
            regels_tot += 1
            a, bb = cu(lijnstart), cu(l2)
            if not any(js_cum[a:bb]): regels_uit += 1
        lijnstart = l2 + 1
    anoniem_nul = sum(1 for st, rec in js_cov.items() if rec['count'] == 0 and st not in set(cu(p) for p in defs))
    grootste = sorted(segmenten, key=lambda s: -(s[1] - s[0]))[:15]
    js = {'tekens': tot_cu, 'bytes': len(js_bron.encode('utf-8')), 'tekens_gebruikt': gebruikt_cu, 'bytes_ongebruikt': ongebruikt_bytes, 'pct_ongebruikt': round(100.0 * ongebruikt_bytes / max(1, len(js_bron.encode('utf-8'))), 1),
          'regels_met_inhoud': regels_tot, 'regels_ongebruikt': regels_uit, 'functies_gedefinieerd': len(defs), 'functies_uitgevoerd': uitgevoerd, 'functies_0': len(nul),
          'dood': dood, 'interactie': interactie, 'zonder_record': zonder_record, 'anonieme_functies_0': anoniem_nul, 'dekkingsrecords': len(js_cov),
          'grootste_ongebruikte_blokken': [{'regel': regel_in_html(script_start + py(a), html), 'tekens': bb - a, 'begin': js_bron[py(a):py(a) + 90].strip()} for a, bb in grootste]}
    if not js_cov: fout('geen JS-dekkingsrecords verzameld')
    if len(defs) and len(zonder_record) > 0.05 * len(defs): fout('%d van %d functiedefinities zonder dekkingsrecord' % (len(zonder_record), len(defs)))
else:
    fout('geen JS-dekking gemeten')
if not css_tekst: fout('geen eigen stylesheet gevonden')

css = {'bladen': [{'sleutel': list(sl), 'regel_in_html': css_header[sl].get('startLine', 0) + 1, 'tekens': len(css_tekst[sl]), 'bytes': len(css_tekst[sl].encode('utf-8')), 'stijlregels': len(ontleed_css(css_tekst[sl])), 'gebruikt': len(css_gebruikt[sl])} for sl in sorted(css_tekst)],
       'overige_bladen': css_overig, 'stijlregels': css_tot, 'stijlregels_gebruikt': css_tot - css_ongebruikt, 'stijlregels_ongebruikt': css_ongebruikt,
       'bytes': css_bytes, 'bytes_ongebruikt': css_ongebruikt_bytes, 'pct_ongebruikt_bytes': round(100.0 * css_ongebruikt_bytes / max(1, css_bytes), 1),
       'ongebruikt_mogelijk_interactie': sum(1 for r in css_regels_uit if r['mogelijk_interactie']), 'ongebruikt_statisch_dood': sum(1 for r in css_regels_uit if r['statisch_dood']),
       'bytes_statisch_dood': sum(r['bytes'] for r in css_regels_uit if r['statisch_dood']), 'ongebruikte_regels': css_regels_uit}
looptijd = round(time.time() - t0, 1)
resultaat = {'datum': time.strftime('%Y-%m-%d %H:%M'), 'looptijd_s': looptijd, 'rollen': ROLLEN_KEUZE, 'breedtes': BREEDTES, 'overgeslagen': overgeslagen, 'contexten': contexten, 'css': css, 'js': js, 'fouten': FOUTEN,
             'methode': 'CDP CSS.startRuleUsageTracking/stopRuleUsageTracking en Profiler.startPreciseCoverage(callCount:false, detailed:true); cumulatief over rollen en breedtes; een regel of functie telt als gebruikt zodra hij in één context gebruikt is. '
                        '"dood" = de naam komt buiten de eigen definitie (en het eigen lichaam) nergens voor in index.html, Code.gs, demo/ of sw.js; "keten" = alleen vanuit dode functies; "interactie" = wel gerefereerd, alleen niet geraakt bij bekijken.'}
json.dump(resultaat, open(os.path.join(OUT, 'dekking.json'), 'w'), ensure_ascii=False, indent=1)

# --- markdown ---
def tabel(koppen, rijen):
    uit = ['| ' + ' | '.join(koppen) + ' |', '|' + '|'.join('---' for _ in koppen) + '|']
    for r in rijen: uit.append('| ' + ' | '.join(str(x).replace('|', '\\|') for x in r) + ' |')
    return '\n'.join(uit)
md = ['# Dekking van index.html (CSS en JS) in de demomodus', '', 'Gemeten %s · looptijd %.0f s · rollen %s · breedtes %s · %d contexten%s' % (resultaat['datum'], looptijd, ', '.join(ROLLEN_KEUZE), ', '.join(map(str, BREEDTES)), len(contexten), (' · overgeslagen: ' + ', '.join(overgeslagen)) if overgeslagen else ''), '',
      resultaat['methode'], '', '## Contexten', '', tabel(['rol', 'breedte', 'schermen', 'CSS-regels gebruikt', 'JS-tekens gebruikt', 'duur'], [[c['rol'], c['breedte'], c['aantal_schermen'], '%.1f%%' % c['css_pct'], '%.1f%%' % c['js_pct'], '%.0f s' % c['duur_s']] for c in contexten]), '']
md += ['## Totalen', '', tabel(['', 'totaal', 'ongebruikt', 'aandeel'], [
    ['CSS-bytes', css['bytes'], css['bytes_ongebruikt'], '%.1f%%' % css['pct_ongebruikt_bytes']],
    ['CSS-stijlregels', css['stijlregels'], css['stijlregels_ongebruikt'], '%.1f%%' % (100.0 * css['stijlregels_ongebruikt'] / max(1, css['stijlregels']))],
    ['JS-bytes', js.get('bytes', 0), js.get('bytes_ongebruikt', 0), '%.1f%%' % js.get('pct_ongebruikt', 0)],
    ['JS-regels met inhoud', js.get('regels_met_inhoud', 0), js.get('regels_ongebruikt', 0), '%.1f%%' % (100.0 * js.get('regels_ongebruikt', 0) / max(1, js.get('regels_met_inhoud', 1)))],
    ['JS-functies (benoemd)', js.get('functies_gedefinieerd', 0), js.get('functies_0', 0), '%.1f%%' % (100.0 * js.get('functies_0', 0) / max(1, js.get('functies_gedefinieerd', 1)))],
    ['  waarvan dood (nergens gerefereerd)', '', len(js.get('dood', [])), ''], ['  waarvan interactie (wel gerefereerd)', '', len(js.get('interactie', [])), ''],
    ['  anonieme functies met 0 dekking', '', js.get('anonieme_functies_0', 0), ''], ['  definities zonder dekkingsrecord', '', len(js.get('zonder_record', [])), '']]), '']
md += ['## 1. CSS-regels die op geen enkel scherm matchen', '', '%d van %d stijlregels (%d bytes). Bij %d regels (%d bytes) komt een klasse, id of data-attribuut uit de selector nergens buiten de stylesheet voor in index.html (kolom "niet gevonden"): waarschijnlijk echt dood. %d regels zien eruit als toestand of interactie (hover, focus, .aan, slepen, print) en zijn bij bekijken alleen niet geraakt. Eerst de statisch dode, dan op bytes; alles staat in dekking.json.' % (css['stijlregels_ongebruikt'], css['stijlregels'], css['bytes_ongebruikt'], css['ongebruikt_statisch_dood'], css['bytes_statisch_dood'], css['ongebruikt_mogelijk_interactie']), '',
       tabel(['regel', 'selector', 'binnen', 'bytes', 'niet gevonden', 'interactie?'], [[r['regel'], '`' + r['selector'][:90] + '`', r['context'][:40], r['bytes'], ' '.join(r['niet_gevonden']), 'ja' if r['mogelijk_interactie'] else ''] for r in css_regels_uit[:200]]), '']
if len(css_regels_uit) > 200: md.append('… en %d regels meer (zie dekking.json).\n' % (len(css_regels_uit) - 200))
md += ['## 2a. JS-functies met 0 dekking die nergens statisch gerefereerd zijn (dood)', '', 'De naam komt buiten de eigen definitie nergens voor in index.html (ook niet als string), Code.gs, demo/ of sw.js. "keten" = alleen aangeroepen vanuit een functie die zelf dood is.', '',
       tabel(['regel', 'naam', 'soort', 'bytes', 'via'], [[d['regel'], '`' + d['naam'] + '`', d['soort'], d['bytes'], d['via']] for d in js.get('dood', [])]) if js.get('dood') else '_geen_', '']
md += ['## 2b. JS-functies met 0 dekking die wel gerefereerd zijn (alleen niet geraakt bij bekijken)', '', 'Waarschijnlijk interactie (klikken, slepen, formulieren, foutpaden) of een andere rol. Gesorteerd op bytes.', '',
       tabel(['regel', 'naam', 'soort', 'bytes', 'refs in index.html', 'extern'], [[d['regel'], '`' + d['naam'] + '`', d['soort'], d['bytes'], d['referenties_in_index'], ', '.join(d['extern'])] for d in sorted(js.get('interactie', []), key=lambda d: -d['bytes'])]) if js.get('interactie') else '_geen_', '']
md += ['## 3. Grootste aaneengesloten ongebruikte JS-blokken', '', tabel(['regel', 'tekens', 'begin'], [[g['regel'], g['tekens'], '`' + g['begin'][:80].replace('`', "'") + '`'] for g in js.get('grootste_ongebruikte_blokken', [])]), '']
if js.get('zonder_record'): md += ['## Definities zonder dekkingsrecord', '', ', '.join('`%s` (r. %d)' % (z['naam'], z['regel']) for z in js['zonder_record']), '']
if FOUTEN: md += ['## Fouten in de meting', ''] + ['- ' + f for f in FOUTEN] + ['']
open(os.path.join(OUT, 'dekking.md'), 'w', encoding='utf-8').write('\n'.join(md))

print()
print('CSS: %d stijlregels, %d ongebruikt (%d van %d bytes, %.1f%%); %d daarvan statisch dood (%d bytes: klasse/id nergens in index.html), %d mogelijk interactie' % (css['stijlregels'], css['stijlregels_ongebruikt'], css['bytes_ongebruikt'], css['bytes'], css['pct_ongebruikt_bytes'], css['ongebruikt_statisch_dood'], css['bytes_statisch_dood'], css['ongebruikt_mogelijk_interactie']))
if css['ongebruikt_statisch_dood']: print('statisch dode CSS: ' + '; '.join('r. %d %s' % (r['regel'], r['selector'][:60]) for r in css_regels_uit if r['statisch_dood']))
if js:
    print('JS: %d bytes, %d ongebruikt (%.1f%%); %d van %d regels met inhoud ongebruikt' % (js['bytes'], js['bytes_ongebruikt'], js['pct_ongebruikt'], js['regels_ongebruikt'], js['regels_met_inhoud']))
    print('JS-functies: %d benoemd, %d met 0 dekking: %d dood (nergens gerefereerd), %d interactie (wel gerefereerd); %d anonieme functies met 0 dekking; %d zonder record' % (js['functies_gedefinieerd'], js['functies_0'], len(js['dood']), len(js['interactie']), js['anonieme_functies_0'], len(js['zonder_record'])))
    if js['dood']: print('dood: ' + ', '.join('%s (r. %d)' % (d['naam'], d['regel']) for d in js['dood']))
print('rapport: %s en %s · looptijd %.0f s' % (os.path.join(OUT, 'dekking.json'), os.path.join(OUT, 'dekking.md'), looptijd))
if FOUTEN: print('FOUTEN: %d' % len(FOUTEN)); sys.exit(1)
print('ALLES GOED')
