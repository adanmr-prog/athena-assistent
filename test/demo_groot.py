# v7.4: browsertest van het demoprofiel "groot" (?demo=1&schaal=groot, demo/demo-groot.js): verzonnen gegevens op de schaal van de praktijk.
# Sophie op 1440 px langs alle desktopschermen (deskNaar over de zijbalk) en op 390 px Home, Taken en Projecten; Femke en Sem op Home.
# Eisen: geen pageerror en geen console-error, Home gevuld binnen 4 s na het openen (inclusief het opbouwen van het profiel in de demo),
# een wijziging blijft na herladen staan terwijl sessionStorage alleen de wijzigingen bewaart, en de gewone demo laadt demo-groot.js niet.
# Per scherm één schermafbeelding in test/shots/demo_groot/ (gitignored).
# Gebruik: python3 test/demo_groot.py [--fonts <map met nunito-lokaal.css>]  (of NUNITO_DIR=<map>); zonder fonts krijgt de pagina een lege
# Google Fonts-css (geen netwerk) en tekent hij met het systeemlettertype. Start zelf een server op poort 8796.
# v7.4 (iOS-review): op 390 px de talentweergave (hoogstens 200 rijen, zoeken tekent pas na een pauze), de projectlijst (begrensd) en het
# kandidatenbord bij "Alle vacatures" (per kolom begrensd); op 1024 px (iPad in landschap) het lege peildatumveld van Exact; de demobalk
# meldt een stand van een andere dag en een volle opslag (de oude stand gaat dan weg) en bewaart bij visibilitychange naar hidden.
# Eindigt met ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1).
import os, json, re, sys, time, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'shots', 'demo_groot'); os.makedirs(OUT, exist_ok=True)
POORT = 8796
arg = sys.argv[1:]
FONTS = arg[arg.index('--fonts') + 1] if '--fonts' in arg else os.environ.get('NUNITO_DIR', '')
SLEUTEL = 'athena_demo_groot_v7.4'

class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True; allow_reuse_address = True
server = Server(('127.0.0.1', POORT), functools.partial(Stil, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None

fouten = 0
def ok(wat, goed):
    global fouten
    print(('ok   ' if goed else 'FOUT ') + wat); sys.stdout.flush()
    if not goed: fouten += 1

CSS = ''
if FONTS and os.path.isfile(os.path.join(FONTS, 'nunito-lokaal.css')):
    CSS = open(os.path.join(FONTS, 'nunito-lokaal.css')).read()
    CSS = re.sub(r'url\(([^)]+?\.woff2)\)', lambda m: 'url(https://fonts.gstatic.com/lokaal/%s)' % os.path.basename(m.group(1).strip('\'"')), CSS)
def fontroute(ctx):
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=CSS, headers={'Access-Control-Allow-Origin': '*'}))
    def gstatic(r):
        pad = os.path.join(FONTS, os.path.basename(r.request.url.split('?')[0])) if FONTS else ''
        if pad and os.path.isfile(pad): r.fulfill(status=200, content_type='font/woff2', body=open(pad, 'rb').read(), headers={'Access-Control-Allow-Origin': '*'})
        else: r.fulfill(status=404, body='')
    ctx.route('https://fonts.gstatic.com/**', gstatic)

GEEN_SPINNER = """() => !Array.prototype.some.call(document.querySelectorAll('.spinner'), function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })"""
def url(rol, extra='&schaal=groot'):
    return 'http://127.0.0.1:%d/?demo=1&kaal=1&rol=%s%s' % (POORT, rol, extra)

def nieuw(b, rol, telefoon=False):
    c = b.new_context(viewport={'width': 390, 'height': 844} if telefoon else {'width': 1440, 'height': 900}, device_scale_factor=2 if telefoon else 1,
                      is_mobile=telefoon, has_touch=telefoon, locale='nl-NL', timezone_id='Europe/Amsterdam')
    fontroute(c)
    pg = c.new_page(); meldingen = []; verzoeken = []
    pg.on('console', lambda m: meldingen.append('console-%s: %s' % (m.type, m.text)) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: meldingen.append('pageerror: %s' % e))
    pg.on('request', lambda r: verzoeken.append(r.url))
    return c, pg, meldingen, verzoeken

def wacht(pg, sel, ms=15000):
    try: pg.wait_for_selector(sel, timeout=ms); return True
    except Exception: return False

def rust(pg, ms=400):
    try: pg.wait_for_function(GEEN_SPINNER, timeout=10000)
    except Exception: pass
    pg.wait_for_timeout(ms)

def shot(pg, naam):
    pg.screenshot(path=os.path.join(OUT, naam + '.png'))

def open_home(b, rol, telefoon=False):
    c, pg, meld, verz = nieuw(b, rol, telefoon)
    t0 = time.time()
    pg.goto(url(rol))
    sel = '#kpis:not([aria-busy])' if telefoon else '#homeInhoud .hkaart'
    gevuld = wacht(pg, sel)
    ms = int((time.time() - t0) * 1000)
    ok('%s%s: Home gevuld binnen 4 s (%d ms)' % (rol, ' telefoon' if telefoon else '', ms), gevuld and ms < 4000)
    return c, pg, meld, verz

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)

    # ---- Sophie, desktop: alle schermen in de zijbalk ----
    c, pg, meld, verz = open_home(b, 'sophie')
    ok('sophie: demo-groot.js geladen', any(u.endswith('/demo/demo-groot.js') for u in verz))
    rust(pg); shot(pg, 'sophie_home')
    tegels = pg.eval_on_selector_all('#homeInhoud .tegel .t-cijfer', 'l => l.map(e => e.textContent.trim())')
    ok('sophie: Home toont kerncijfers op schaal (%s)' % ', '.join(tegels), len(tegels) >= 3)
    items = pg.eval_on_selector_all('#zijbalk .zb-item[data-desk]', 'l => l.filter(e => e.offsetParent !== null).map(e => e.dataset.desk)')
    ok('sophie: zijbalk met %d schermen' % len(items), len(items) >= 12)
    for item in items:
        if item == 'home': continue
        voor = len(meld)
        pg.evaluate('deskNaar(%r)' % item); rust(pg, 500)
        tekst = pg.evaluate("(document.querySelector('.view.actief') || document.body).innerText.length")
        ok('sophie: %s zonder fout en met inhoud (%d tekens)' % (item, tekst), len(meld) == voor and tekst > 80)
        shot(pg, 'sophie_' + item)
    # schaal zichtbaar: projecten en talenten
    n = pg.evaluate("run('apiTrajecten').then(function (r) { return r.trajecten.length; })")
    t = pg.evaluate("run('apiTalenten', {}).then(function (r) { return r.talenten.length; })")
    ok('sophie: %d projecten en %d talenten in de demo' % (n, t), n > 150 and t > 600)
    # bewaren: sessionStorage houdt alleen de wijzigingen vast, en die blijven na herladen staan
    taak = pg.evaluate("run('apiTaken').then(function (r) { var t = r.taken.filter(function (x) { return /^gtk/.test(x.id); })[0]; return t ? { id: t.id, tekst: t.tekst } : null; })")
    ok('sophie: een taak uit het grote profiel', bool(taak))
    if taak:
        pg.evaluate("run('apiTaakOpslaan', { id: %r, tekst: 'Bewaard in de groot-demo', _oud: { tekst: %r } })" % (taak['id'], taak['tekst'])); pg.wait_for_timeout(900)
        lengte = pg.evaluate("(sessionStorage.getItem(%r) || '').length" % SLEUTEL)
        ok('sophie: sessionStorage bewaart alleen de wijzigingen (%d tekens)' % lengte, 0 < lengte < 100000)
        ok('sophie: de gewone demosleutel blijft leeg', pg.evaluate("sessionStorage.getItem('athena_demo_data_v4.3')") is None)
        pg.goto(url('sophie'))  # zelfde tab, zonder #scherm: de demo bouwt de basis opnieuw op en legt de bewaarde wijzigingen erover
        terug = pg.evaluate("run('apiTaak', %r).then(function (t) { return t.tekst; })" % taak['id']) if wacht(pg, '#homeInhoud .hkaart') else None
        ok('sophie: na herladen staat de wijziging er nog (%s)' % terug, terug == 'Bewaard in de groot-demo')
    ok('sophie desktop: geen pageerror of console-error' + (': ' + ' | '.join(meld[:4]) if meld else ''), not meld)
    c.close()

    # ---- Sophie, telefoon: Home, Taken en Projecten ----
    c, pg, meld, verz = open_home(b, 'sophie', True)
    rust(pg); shot(pg, 'sophie_tel_home')
    pg.click('nav button[data-view="relaties"]'); rust(pg, 300); pg.click('#crmTabs [data-crmtab="taken"]'); rust(pg, 600)
    ok('sophie telefoon: Taken met rijen', pg.locator('#view-relaties [data-sleep^="taak:"], #view-relaties .taak, #view-relaties .rij').count() > 3); shot(pg, 'sophie_tel_taken')
    pg.click('nav button[data-view="trajecten"]'); rust(pg, 800)
    ok('sophie telefoon: Projecten met inhoud', pg.evaluate("document.getElementById('view-trajecten').innerText.length") > 200); shot(pg, 'sophie_tel_projecten')
    breed = pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    ok('sophie telefoon: geen horizontale scroll', breed)
    # v7.4 (iOS-review): de talentweergave tekent hoogstens 200 rijen, en zoeken tekent pas na een korte pauze (niet bij elke toetsaanslag)
    pg.click('#projectWeergaven [data-pweergave="talent"]')
    if wacht(pg, '#trajectLijst .rij .avatar'):
        rust(pg, 300)
        rijen = pg.locator('#trajectLijst .rij .avatar').count(); telling = pg.inner_text('#trajectTelling')
        totaal = int(re.match(r'\s*(\d+)', telling).group(1)) if re.match(r'\s*(\d+)', telling) else 0
        ok('sophie telefoon: talentweergave toont hoogstens 200 van %d talenten (%d rijen)' % (totaal, rijen), 0 < rijen <= 200 and totaal > 200)
        ok('sophie telefoon: onder de lijst de hint om te zoeken', pg.locator('#trajectLijst .hint:has-text("De eerste 200")').count() == 1)
        shot(pg, 'sophie_tel_talent')
        pg.evaluate("""() => { window.__tekenTeller = 0; window.__tekenObs = new MutationObserver(function () { window.__tekenTeller++; });
            window.__tekenObs.observe(document.getElementById('trajectLijst'), { childList: true }); }""")
        pg.locator('#trajectZoek').press_sequentially('utre', delay=40); pg.wait_for_timeout(600)
        keer = pg.evaluate('window.__tekenTeller'); pg.evaluate('window.__tekenObs.disconnect()')
        na = pg.locator('#trajectLijst .rij .avatar').count(); telling2 = pg.inner_text('#trajectTelling')
        ok('sophie telefoon: zoeken (4 toetsen) tekent de lijst %d keer, niet per toets' % keer, 1 <= keer <= 2)
        ok('sophie telefoon: zoeken vindt een deel (%s, %d rijen)' % (telling2, na), 0 < na < rijen or (0 < na <= 200 and telling2 != telling))
        pg.fill('#trajectZoek', ''); pg.wait_for_timeout(400)
    else: ok('sophie telefoon: talentweergave geladen', False)
    # de projectlijst is ook begrensd (het profiel heeft er minder dan 200, dus hier tijdelijk verdubbeld in het geheugen van de app)
    pg.click('#projectWeergaven [data-pweergave="lijst"]'); rust(pg, 300)
    lp = pg.evaluate("""() => { var T = S.trajecten.trajecten, n = T.length; S.trajecten.trajecten = T.concat(T.map(function (t) { var x = {}; for (var k in t) x[k] = t[k]; x.id = t.id + '-kopie'; return x; }));
        renderTrajecten(); var r = { n: S.trajecten.trajecten.length, rijen: document.querySelectorAll('#trajectLijst > .rij').length, hint: !!document.querySelector('#trajectLijst > .hint') }; S.trajecten.trajecten = T; renderTrajecten(); return r; }""")
    ok('sophie telefoon: projectlijst toont hoogstens 200 van %d (%d rijen, hint %s)' % (lp['n'], lp['rijen'], lp['hint']), lp['n'] > 200 and lp['rijen'] == 200 and lp['hint'])
    # het kandidatenbord bij "Alle vacatures": per kolom begrensd, de teller blijft het totaal
    pg.click('#projectWeergaven [data-pweergave="bezetting"]')
    if wacht(pg, '#trajectLijst [data-bopen="0"]'):
        pg.click('#trajectLijst [data-bopen="0"]'); rust(pg, 200); pg.click('#trajectLijst [data-bweergave="status"]'); rust(pg, 400)
        kb = pg.evaluate("""() => { var k = Array.prototype.slice.call(document.querySelectorAll('#trajectLijst .bord .kolom')); return { kolommen: k.length,
            kaarten: k.map(function (x) { return x.querySelectorAll('.kaartje').length; }), som: k.map(function (x) { return Number((x.querySelector('.k-som') || {}).textContent) || 0; }),
            hints: document.querySelectorAll('#trajectLijst .bord .kolom .hint').length }; }""")
        tot, getoond = sum(kb['som']), sum(kb['kaarten'])
        ok('sophie telefoon: kandidatenbord "Alle vacatures" toont %d van %d kandidaten, hoogstens 30 per kolom (max %d)' % (getoond, tot, max(kb['kaarten'] or [0])), tot > 300 and 0 < getoond < tot and max(kb['kaarten'] or [99]) <= 30)
        ok('sophie telefoon: kolommen met meer kandidaten noemen de rest (%d hints)' % kb['hints'], kb['hints'] == len([1 for a, b in zip(kb['kaarten'], kb['som']) if b > a]) and kb['hints'] > 0)
        shot(pg, 'sophie_tel_kandidatenbord')
        pg.click('#trajectLijst [data-bweergave="vacature"]'); pg.click('#trajectLijst [data-bopen="1"]'); rust(pg, 200)
    else: ok('sophie telefoon: bezetting geladen', False)
    ok('sophie telefoon: na lijsten en zoeken geen horizontale scroll', pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    ok('sophie telefoon: geen pageerror of console-error' + (': ' + ' | '.join(meld[:4]) if meld else ''), not meld)
    c.close()

    # ---- Femke (accountmanager) en Sem (talentscout): Home ----
    for rol in ['femke', 'sem']:
        c, pg, meld, verz = open_home(b, rol)
        rust(pg); shot(pg, rol + '_home')
        ok('%s: geen pageerror of console-error' % rol + (': ' + ' | '.join(meld[:4]) if meld else ''), not meld)
        c.close()

    # ---- demobalk: wisselen van rol en terug uit het portaal houden het profiel vast ----
    c, pg, meld, verz = nieuw(b, 'sophie')
    pg.goto('http://127.0.0.1:%d/?demo=1&rol=sophie&schaal=groot' % POORT)
    if wacht(pg, '#demoBalk select'):
        ok('demobalk noemt het profiel', 'groot' in pg.inner_text('#demoBalk span'))
        with pg.expect_navigation(): pg.select_option('#demoBalk select', 'femke')
        ok('rol wisselen houdt schaal=groot vast (%s)' % pg.evaluate('location.search'), 'schaal=groot' in pg.url and 'rol=femke' in pg.url)
    else: ok('demobalk zichtbaar', False)
    pg.goto('http://127.0.0.1:%d/?demo=1&schaal=groot&t=demotokenali0000000000000000000000000001' % POORT)
    if wacht(pg, '#demoBalk button'):
        with pg.expect_navigation(): pg.click('#demoBalk button')
        ok('terug uit het portaal houdt schaal=groot vast', 'schaal=groot' in pg.url)
    else: ok('portaal met demobalk', False)
    ok('demobalk: geen pageerror of console-error' + (': ' + ' | '.join(meld[:4]) if meld else ''), not meld)
    c.close()

    # ---- v7.4 (iOS-review): iPad in landschap (1024 px, body.desk): het lege peildatumveld van Exact even hoog als een tekstveld ----
    c = b.new_context(viewport={'width': 1024, 'height': 768}, has_touch=True, locale='nl-NL', timezone_id='Europe/Amsterdam'); fontroute(c)
    pg = c.new_page(); meld = []
    pg.on('pageerror', lambda e: meld.append('pageerror: %s' % e)); pg.on('console', lambda m: meld.append('console-error: %s' % m.text) if m.type == 'error' else None)
    pg.goto(url('sophie'))
    if wacht(pg, '#homeInhoud .hkaart'):
        pg.evaluate("deskNaar('financien')")
        if wacht(pg, '[data-finexact]'):
            pg.click('[data-finexact]'); wacht(pg, '#venster #vf-exactpeil')
            dv = pg.evaluate("""() => { var d = document.getElementById('vf-exactpeil'), t = document.querySelector('#venster [data-exactkol]'), c = getComputedStyle(d);
                return { leeg: !d.value, desk: document.body.classList.contains('desk'), hD: d.getBoundingClientRect().height, hT: t.getBoundingClientRect().height, min: c.minHeight, app: c.webkitAppearance || c.appearance }; }""")
            ok('ipad: leeg peildatumveld met de iOS-regel (min-height %s, appearance %s; %d px naast een tekstveld van %d px)' % (dv['min'], dv['app'], dv['hD'], dv['hT']),
               dv['leeg'] and dv['desk'] and dv['app'] == 'none' and abs(float(dv['min'].replace('px', '') or 0) - dv['hT']) <= 1 and dv['hD'] >= dv['hT'] - 1)
            shot(pg, 'ipad_exact_peildatum'); pg.click('#venster [data-cf-annuleer]')
        else: ok('ipad: Financiën met de Exact-knop', False)
    else: ok('ipad: Home gevuld', False)
    ok('ipad: geen pageerror of console-error' + (': ' + ' | '.join(meld[:4]) if meld else ''), not meld)
    c.close()

    # ---- v7.4 (iOS-review): demobalk: een stand van een andere dag, een volle opslag, en bewaren bij visibilitychange ----
    c, pg, meld, verz = nieuw(b, 'sophie')
    BALK_URL = 'http://127.0.0.1:%d/?demo=1&rol=sophie&schaal=groot' % POORT
    pg.goto(BALK_URL)
    if wacht(pg, '#homeInhoud .hkaart') and wacht(pg, '#demoBalk select'):
        # een stand van een andere dag (zoals na een nacht met de tab open); gezet ná het bewaren van demo.js bij pagehide en visibilitychange
        # (Chromium: eerst pagehide, dan visibilitychange), anders overschrijft de demo hem bij het herladen
        oud = json.dumps({'profiel': 'groot', 'versie': 1, 'dag': '2000-01-01', 'bladen': {'Acties': {'rijen': [], 'weg': []}}, 'props': {}})
        pg.evaluate("(a) => { var zet = function () { sessionStorage.setItem(a[0], a[1]); }; window.addEventListener('pagehide', zet); document.addEventListener('visibilitychange', zet); }", [SLEUTEL, oud])
        pg.reload()
        if wacht(pg, '#homeInhoud .hkaart'):
            rust(pg, 500)
            mt = pg.evaluate("(document.getElementById('demoMelding') || {}).textContent || ''")
            ss = pg.evaluate("sessionStorage.getItem(%r)" % SLEUTEL)
            ok('demobalk: een stand van een andere dag geeft een verse demo met melding (%s)' % mt, 'opnieuw opgebouwd' in mt)
            ok('demobalk: de oude stand is weg', ss is None or json.loads(ss).get('dag') != '2000-01-01')
            shot(pg, 'demobalk_vernieuwd')
        else: ok('demobalk: Home na herladen', False)
        taak = pg.evaluate("run('apiTaken').then(function (r) { var t = r.taken.filter(function (x) { return /^gtk/.test(x.id); })[0]; return t ? { id: t.id, tekst: t.tekst } : null; })")
        if taak:
            pg.evaluate("run('apiTaakOpslaan', { id: %r, tekst: 'Eerste stand', _oud: { tekst: %r } })" % (taak['id'], taak['tekst'])); pg.wait_for_timeout(900)
            ok('demobalk: eerst wordt gewoon bewaard', 'Eerste stand' in (pg.evaluate("sessionStorage.getItem(%r)" % SLEUTEL) or ''))
            # opslag vol: setItem gooit voor de demosleutel; de oude stand mag dan niet blijven staan
            pg.evaluate("""(k) => { window.__echtSet = Storage.prototype.setItem; Storage.prototype.setItem = function (a, v) { if (a === k) throw new DOMException('vol', 'QuotaExceededError'); return window.__echtSet.call(this, a, v); }; }""", SLEUTEL)
            pg.evaluate("run('apiTaakOpslaan', { id: %r, tekst: 'Tweede stand', _oud: { tekst: 'Eerste stand' } })" % taak['id']); pg.wait_for_timeout(900)
            ss = pg.evaluate("sessionStorage.getItem(%r)" % SLEUTEL); mt = pg.evaluate("(document.getElementById('demoMelding') || {}).textContent || ''")
            ok('demobalk: bij een volle opslag is de oude stand weg (geen stille terugval na herladen)', ss is None)
            ok('demobalk: bij een volle opslag meldt de balk het (%s)' % mt, 'opslag vol' in mt)
            shot(pg, 'demobalk_opslagvol')
            pg.evaluate("() => { Storage.prototype.setItem = window.__echtSet; }")
            # visibilitychange naar hidden bewaart meteen (de timer van 300 ms loopt op iOS dan niet meer)
            st = pg.evaluate("""(a) => run('apiTaakOpslaan', { id: a[0], tekst: 'Derde stand', _oud: { tekst: 'Tweede stand' } }).then(function () {
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'hidden'; } });
                document.dispatchEvent(new Event('visibilitychange'));
                var s = sessionStorage.getItem(a[1]); delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); return s; })""", [taak['id'], SLEUTEL])
            ok('demobalk: visibilitychange naar hidden bewaart meteen', 'Derde stand' in (st or ''))
            mt = pg.evaluate("(document.getElementById('demoMelding') || {}).textContent || ''")
            ok('demobalk: na een gelukte bewaarbeurt is de melding weg (%r)' % mt, 'opslag vol' not in mt)
        else: ok('demobalk: een taak uit het grote profiel', False)
    else: ok('demobalk: groot-demo met balk', False)
    ok('demobalk (opslag): geen pageerror of console-error' + (': ' + ' | '.join(meld[:4]) if meld else ''), not meld)
    c.close()

    # ---- de gewone demo blijft de gewone demo ----
    c, pg, meld, verz = nieuw(b, 'sophie')
    pg.goto(url('sophie', '')); ok('gewone demo: Home gevuld', wacht(pg, '#homeInhoud .hkaart'))
    ok('gewone demo: demo-groot.js niet geladen', not any('demo-groot' in u for u in verz))
    n0 = pg.evaluate("run('apiTalenten', {}).then(function (r) { return r.talenten.length; })")
    ok('gewone demo: de standaardseed (%d talenten)' % n0, n0 == 25)
    ok('gewone demo: geen pageerror of console-error' + (': ' + ' | '.join(meld[:4]) if meld else ''), not meld)
    c.close()
    b.close()

server.shutdown()
print('schermafbeeldingen in ' + OUT)
print('ALLES GOED' if not fouten else 'FOUTEN: %d' % fouten)
sys.exit(1 if fouten else 0)
