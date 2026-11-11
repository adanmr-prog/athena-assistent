#!/usr/bin/env python3
# v7.6: prestatiebudgetten als norm (docs/prestatie-v7.6.md). Eindigt met ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1).
#
# Deel 1 — start en api-ketens, tegen test/mock_backend.py (vaste seed) zoals een echte host hem stuurt: MOCK_GZIP (index.html 165 kB over de lijn
# in plaats van 609 kB), MOCK_ETAG (ETag/304, HTTP/1.1) en MOCK_PACE (trage 4G in de server zelf: 150 ms per aanvraag en 1,6 Mbit/s als één gedeelde
# pijp, zodat ook de fetches van de service worker geremd zijn; de netwerkrem van CDP op de pagina raakt die niet). MOCK_VERTRAAG_MS (--vertraag,
# standaard 600) is het model voor de Apps Script-latentie per aanroep ⚠️ aanname tot het productielogboek er is; --vertraag 0 meet de ketens zonder
# model. MOCK_HTML_VERTRAAG_MS=10000 bootst een hangende server na (?traag=1). Telefoon 390x844, is_mobile, CPU 4x trager; desktop 1280x800 zonder
# CPU-rem (alleen de ketens). Koud = verse browsercontext (geen cache, geen service worker); warm = dezelfde context na de installatie van de
# service worker, herladen.
# Deel 2 — render op praktijkschaal in de demo (?demo=1&schaal=groot&kaal=1&rol=sophie, dezelfde server), telefoon 4x CPU: tik tot getekend per
# scherm (gevuld plus twee frames) tegen een regressiegrens van ongeveer twee keer de nulmeting van v7.6 (CPU-gebonden met 4x rem: de spreiding op een
# gedeelde machine is tot ±40 %, en storing van buiten telt alleen op).
# Vijf runs per maat: de mediaan moet binnen het budget blijven; p95 (= max bij vijf) staat erbij. Verschillen onder 10 % zijn ruis; de machine
# (nproc, loadavg) staat in de uitvoer, want andere processen vertragen vooral de CPU-gebonden maten (deel 2).
# De ms-budgetten krijgen --marge (standaard 10 %) als meetruis van de gedeelde machine: pas daarboven is het een regressie.
# Gebruik: python3 test/prestatie.py [--runs 5] [--poort 8797] [--vertraag 600] [--marge 10] [--deel 1,2] [--json <pad>]
import sys, os, json, time, subprocess, socket, statistics, argparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None

# Budgetten (mediaan van vijf runs). Deel 1 op de telefoon met --vertraag als api-model; deel 2 in de demo op praktijkschaal.
BUDGET = {
    'koud': (2000, 'ms', 'Vandaag koud bruikbaar (telefoon, 4G, 4x CPU, api +vertraag)'),
    'warm': (600, 'ms', 'Vandaag warm bruikbaar (service worker, aa_cache_vandaag)'),
    'warm_traag': (1500, 'ms', 'Vandaag warm bij een hangende server (?traag=1)'),
    'diepte': (1, 'rondreizen', 'api-rondreizen achter elkaar per schermwissel (Rapporten: 2)'),
    'fouten': (0, 'fouten', 'onafgevangen JS-fouten en console.error'),
}
DIEPTE_UITZ = {'Rapporten': 2}  # apiTeamRapport → apiActiviteiten gebruikt de periode uit het eerste antwoord
RENDER_BUDGET = [  # (naam, klik-selector, voorwaarde dat het scherm gevuld is, budget ms) — telefoon, demo groot, sophie; de stappen volgen elkaar op in één pagina
    ('Relaties lijst', 'nav button[data-view="relaties"]', '#crmInhoud .rij[data-crm-open^="school:"]', 300),
    ('Taken', '#crmTabs [data-crmtab="taken"]', '#crmInhoud .rij .vink, #crmInhoud .leeg', 325),
    ('Projecten per AM', 'nav button[data-view="trajecten"]', '#trajectLijst .p-groep .p-rij, #trajectLijst .p-groep h3, #trajectLijst .leeg', 450),
    ('Bezetting per vacature', '[data-pweergave="bezetting"]', '#trajectLijst .vac-grid .vac-kaart, #trajectLijst .leeg', 500),
    ('Bezetting alle vacatures', '[data-bopen="0"]', '[data-bopen="0"].aan', 1000),  # v7.8: alle kaarten met al hun kandidaatrijen (±740 statuspillen; vóór v7.8 selects: 1,4 s, nu ±0,7 s → budget 1,5× de nameting, zodat een terugval naar de selects rood wordt)
    ('Financiën', '[data-naarfinancien]', '#finInhoud table.fin tbody, #finInhoud .leeg', 1050),
]
# v7.9: de render van het MT-overzicht op praktijkschaal (desktop, zonder CPU-rem; de cijfers rekent de demo-backend in dezelfde pagina). Nameting v7.9:
# mediaan 60–90 ms over vijf runs; budget ±3× die nameting, zodat een terugval (bijvoorbeeld de cijfers per regel opnieuw rekenen) rood wordt
RENDER_DESKTOP = [('Rapporten MT', '[data-rweergave="mt"]', '.mt .mt-blok', 250)]
STAPPEN_TELEFOON = [('Relaties', 'nav button[data-view="relaties"]'), ('Taken', '#crmTabs [data-crmtab="taken"]'), ('Rapporten', '#crmTabs [data-crmtab="rapport"]'), ('Rapporten Week', '[data-rweergave="week"]'),  # v7.9: Week = één aanroep apiSturing
                    ('Projecten', 'nav button[data-view="trajecten"]'), ('Bezetting', '[data-pweergave="bezetting"]'), ('Vandaag', 'nav button[data-view="vandaag"]')]
STAPPEN_DESKTOP = [('Taken', '.zb-item[data-desk="taken"]'), ('Rapporten', '.zb-item[data-desk="rapporten"]'), ('Rapporten Week', '[data-rweergave="week"]'), ('Rapporten MT', '[data-rweergave="mt"]'),  # v7.9: Week en MT elk één aanroep (diepte 1)
                   ('Bezetting', '.zb-item[data-desk="bezetting"]'),
                   ('Projecten', '.zb-item[data-desk="projecten"]'), ('Contacten', '.zb-item[data-desk="contacten"]'), ('Home', '.zb-item[data-desk="home"]')]

# In de pagina: elke POST /api met fn, start en einde (performance.now), het moment dat Vandaag/Home gevuld is, en JS-fouten.
OBS = r"""(function () {
  var M = window.__m = { calls: [], pending: 0, lastEnd: 0, scherm: 'start', stapStart: 0, gevuld: 0, fouten: [] };
  var f = window.fetch;
  window.fetch = function (u, o) {
    var url = String(u && u.url || u); if (url.indexOf('/api') < 0) return f.apply(this, arguments);
    var fn = ''; try { fn = JSON.parse(o.body).fn || ''; } catch (e) {}
    var rec = { fn: fn, scherm: M.scherm, start: performance.now(), end: 0 }; M.calls.push(rec); M.pending++;
    var klaar = function () { if (!rec.end) { rec.end = performance.now(); M.pending--; M.lastEnd = rec.end; } };
    return f.apply(this, arguments).then(function (r) { return r.clone().text().then(function () { klaar(); return r; }, function () { klaar(); return r; }); }, function (e) { klaar(); throw e; });
  };
  window.addEventListener('error', function (e) { M.fouten.push(String(e.message || e)); });
  window.addEventListener('unhandledrejection', function (e) { M.fouten.push('rejection: ' + String(e.reason && e.reason.message || e.reason)); });
  new MutationObserver(function () {
    if (M.gevuld) return;
    var fl = document.getElementById('focusLijst'), h = document.getElementById('homeInhoud');
    if ((fl && fl.querySelector('.rij, .leeg')) || (h && h.querySelector('.hkaart'))) M.gevuld = performance.now();
  }).observe(document, { childList: true, subtree: true });  // document zelf: bij een init-script bestaat documentElement nog niet
})();"""

def poort_vrij(poort):
    s = socket.socket(); s.settimeout(0.2)
    try: s.connect(('127.0.0.1', poort)); return False
    except Exception: return True
    finally: s.close()

def mock_start(poort, vertraag):
    for _ in range(50):  # een vorige run kan nog aan het stoppen zijn
        if poort_vrij(poort): break
        time.sleep(0.2)
    else: raise SystemExit('poort %d is al bezet' % poort)
    env = dict(os.environ, MOCK_POORT=str(poort), MOCK_CSP='1', MOCK_GZIP='1', MOCK_ETAG='1', MOCK_PACE='1', MOCK_VERTRAAG_MS=str(vertraag), MOCK_HTML_VERTRAAG_MS='10000')
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, 'test', 'mock_backend.py')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        if p.poll() is not None: raise SystemExit('de mock stopte meteen (poort %d bezet?)' % poort)
        if not poort_vrij(poort): time.sleep(0.3); return p
        time.sleep(0.1)
    p.terminate(); raise SystemExit('de mock is niet gestart')

def mediaan(l): return round(statistics.median(l)) if l else None
def p95(l): return round(sorted(l)[max(0, int(round(0.95 * len(l))) - 1)]) if l else None
def belasting(): return [round(x, 2) for x in os.getloadavg()]

def diepte(calls):  # langste keten van aanroepen die pas starten als een vorige klaar is (opeenvolgend = elkaar afwachten)
    calls = sorted([c for c in calls if c['end']], key=lambda c: c['start']); d = []
    for i, c in enumerate(calls):
        d.append(1 + max([d[j] for j in range(i) if calls[j]['end'] <= c['start'] + 1] or [0]))
    return max(d) if d else 0

def wacht_gevuld(pg, timeout=60000):
    pg.wait_for_function('() => window.__m && window.__m.gevuld > 0', timeout=timeout)  # een functie, geen tekst: de CSP van de mock verbiedt eval
    return pg.evaluate('window.__m.gevuld')

def stap(pg, naam, sel, timeout=45000):
    """Klik in de pagina zelf (geen Playwright-overhead), wacht tot er 800 ms geen api-aanroep meer loopt of eindigt; geeft de aanroepen van deze stap."""
    pg.evaluate("(function (n, s) { var M = window.__m; M.scherm = n; M.stapStart = performance.now(); var e = document.querySelector(s); if (!e) throw new Error('geen ' + s); e.click(); })(%s, %s)" % (json.dumps(naam), json.dumps(sel)))
    pg.wait_for_function("() => { var M = window.__m, nu = performance.now(); return nu - M.stapStart > 1000 && M.pending === 0 && nu - Math.max(M.lastEnd, M.stapStart) > 800; }", timeout=timeout, polling=100)
    return pg.evaluate("window.__m.calls.filter(function (c) { return c.scherm === %s; })" % json.dumps(naam))

def fouten_van(pg, console):
    return list(pg.evaluate('window.__m ? window.__m.fouten : []')) + console

def context_maken(b, base, telefoon, console, demo=False):
    ctx = b.new_context(viewport={'width': 390, 'height': 844} if telefoon else {'width': 1280, 'height': 800}, is_mobile=telefoon, has_touch=telefoon, locale='nl-NL')
    ctx.route(lambda url: not url.startswith('http://127.0.0.1'), lambda route: route.abort())  # geen netwerk naar buiten (fonts)
    ctx.add_init_script(OBS)
    if not demo: ctx.add_init_script("try { localStorage.setItem('aa_api', '%s/api'); localStorage.setItem('aa_secret', 'test123'); } catch (e) {}" % base)
    pg = ctx.new_page()
    pg.on('console', lambda m: console.append(m.text) if m.type == 'error' and 'fonts.g' not in (m.location or {}).get('url', '') and 'ERR_FAILED' not in m.text else None)
    if telefoon: ctx.new_cdp_session(pg).send('Emulation.setCPUThrottlingRate', {'rate': 4})
    return ctx, pg

def deel1_telefoon(b, base, runs, uit):
    for i in range(runs):
        console = []; ctx, pg = context_maken(b, base, True, console)
        pg.goto(base + '/'); uit['koud'].append(wacht_gevuld(pg))
        # service worker klaar en de shell in de cache, zodat de warme start hem gebruikt (de installatie loopt over dezelfde trage pijp)
        pg.wait_for_function("async () => { var r = await navigator.serviceWorker.getRegistration(); if (!(r && r.active)) return false; return !!(await caches.match('./index.html')); }", timeout=60000, polling=250)
        # pas als de worker de pagina bestuurt (clients.claim) gaat een herlading door de cache; zo niet binnen 5 s, dan één ongetelde navigatie
        try: pg.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=5000, polling=250)
        except Exception: pg.goto(base + '/'); wacht_gevuld(pg)
        pg.wait_for_timeout(500)
        pg.reload(); uit['warm'].append(wacht_gevuld(pg))
        pg.goto(base + '/?traag=1'); uit['warm_traag'].append(wacht_gevuld(pg))
        pg.wait_for_timeout(1500)  # apiOverzicht binnen vóór de wissels
        for naam, sel in STAPPEN_TELEFOON:
            calls = stap(pg, naam, sel); uit['ketens'].setdefault('telefoon ' + naam, []).append({'diepte': diepte(calls), 'aanroepen': [c['fn'] for c in calls]})
        uit['fouten'].extend(fouten_van(pg, console)); uit['load'].append(belasting()); ctx.close()
        print('  deel 1 telefoon run %d/%d: koud %d warm %d traag %d ms, load %s' % (i + 1, runs, uit['koud'][-1], uit['warm'][-1], uit['warm_traag'][-1], uit['load'][-1]), flush=True)

def deel1_desktop(b, base, runs, uit):
    for i in range(runs):
        console = []; ctx, pg = context_maken(b, base, False, console)
        pg.goto(base + '/'); wacht_gevuld(pg); pg.wait_for_timeout(2500)  # apiHome, apiHomeMails en apiCrm binnen
        for naam, sel in STAPPEN_DESKTOP:
            calls = stap(pg, naam, sel); uit['ketens'].setdefault('desktop ' + naam, []).append({'diepte': diepte(calls), 'aanroepen': [c['fn'] for c in calls]})
        uit['fouten'].extend(fouten_van(pg, console)); ctx.close()
        print('  deel 1 desktop run %d/%d: %s' % (i + 1, runs, ', '.join('%s %d' % (n, uit['ketens']['desktop ' + n][-1]['diepte']) for n, _ in STAPPEN_DESKTOP)), flush=True)

def deel2_demo(b, base, runs, uit):
    url = base + '/?demo=1&schaal=groot&kaal=1&rol=sophie'
    for i in range(runs):
        console = []; ctx, pg = context_maken(b, base, True, console, demo=True)
        pg.goto(url); pg.wait_for_selector('#focusLijst .rij, #focusLijst .leeg', timeout=120000); pg.wait_for_timeout(1500)
        for naam, sel, cond, _ in RENDER_BUDGET:
            t0 = pg.evaluate("(function (s) { var e = document.querySelector(s); if (!e) throw new Error('geen ' + s); var t = performance.now(); e.click(); return t; })(%s)" % json.dumps(sel))
            pg.wait_for_function("(s) => !!document.querySelector(s)", arg=cond, timeout=60000)
            t1 = pg.evaluate("new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { r(performance.now()); }); }); })")
            uit['render'].setdefault(naam, []).append(t1 - t0)
        uit['fouten'].extend(fouten_van(pg, console)); uit['load'].append(belasting()); ctx.close()
        # v7.9: het MT-overzicht (alleen desktop) op praktijkschaal
        console = []; ctx, pg = context_maken(b, base, False, console, demo=True)
        pg.goto(url); pg.wait_for_selector('#homeInhoud .hkaart', timeout=120000); pg.wait_for_timeout(1500)
        pg.click('.zb-item[data-desk="rapporten"]'); pg.wait_for_selector('#crmInhoud .tabel', timeout=60000); pg.wait_for_timeout(800)
        for naam, sel, cond, _ in RENDER_DESKTOP:
            t0 = pg.evaluate("(function (s) { var e = document.querySelector(s); if (!e) throw new Error('geen ' + s); var t = performance.now(); e.click(); return t; })(%s)" % json.dumps(sel))
            pg.wait_for_function("(s) => !!document.querySelector(s)", arg=cond, timeout=60000)
            t1 = pg.evaluate("new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { r(performance.now()); }); }); })")
            uit['render'].setdefault(naam, []).append(t1 - t0)
        uit['fouten'].extend(fouten_van(pg, console)); ctx.close()
        print('  deel 2 demo run %d/%d: %s, load %s' % (i + 1, runs, ', '.join('%s %d' % (n, uit['render'][n][-1]) for n, _, _, _ in RENDER_BUDGET + RENDER_DESKTOP), uit['load'][-1]), flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, default=5); ap.add_argument('--poort', type=int, default=8797); ap.add_argument('--vertraag', type=int, default=600)
    ap.add_argument('--deel', default='1,2'); ap.add_argument('--json', default=''); ap.add_argument('--marge', type=float, default=10, help='toegestane meetruis boven een ms-budget, in procenten')
    a = ap.parse_args(); delen = a.deel.split(',')
    base = 'http://127.0.0.1:%d' % a.poort
    uit = {'meta': {'runs': a.runs, 'vertraag_ms': a.vertraag, 'nproc': os.cpu_count(), 'load_start': belasting(), 'datum': time.strftime('%Y-%m-%d %H:%M')},
           'koud': [], 'warm': [], 'warm_traag': [], 'ketens': {}, 'render': {}, 'fouten': [], 'load': []}
    print('prestatie v7.6 — mock op %d (gzip, ETag, 4G-pijp, api +%d ms), %d runs, nproc %s, load %s' % (a.poort, a.vertraag, a.runs, uit['meta']['nproc'], uit['meta']['load_start']))
    mock = mock_start(a.poort, a.vertraag); fouten = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=EXE, headless=True) if EXE else p.chromium.launch(headless=True)
            if '1' in delen: deel1_telefoon(b, base, a.runs, uit); deel1_desktop(b, base, a.runs, uit)
            if '2' in delen: deel2_demo(b, base, a.runs, uit)
            b.close()
    finally:
        mock.terminate()
        try: mock.wait(timeout=10)
        except Exception: mock.kill()
    def oordeel(ok, regel):
        print(('  OK    ' if ok else '  FOUT  ') + regel)
        if not ok: fouten.append(regel)
    print('\nBudgetten (mediaan van %d runs; p95 = max):' % a.runs)
    for k in ('koud', 'warm', 'warm_traag'):
        if uit[k]:
            grens, eenheid, oms = BUDGET[k]; m = mediaan(uit[k])
            oordeel(m <= grens * (1 + a.marge / 100), '%-56s mediaan %5d %s  p95 %5d  budget %d (+%d %%)' % (oms, m, eenheid, p95(uit[k]), grens, a.marge))
    if uit['ketens']:
        slecht = []
        for naam, lijst in uit['ketens'].items():
            grens = DIEPTE_UITZ.get(naam.split(' ', 1)[1], BUDGET['diepte'][0]); d = max(x['diepte'] for x in lijst); n = max(len(x['aanroepen']) for x in lijst)
            if d > grens: slecht.append('%s %d (%s)' % (naam, d, ', '.join(lijst[-1]['aanroepen'])))
            print('        %-24s diepte %d (budget %d), %d api-aanroepen: %s' % (naam, d, grens, n, ', '.join(lijst[-1]['aanroepen']) or '—'))
        oordeel(not slecht, '%-56s %s' % (BUDGET['diepte'][2], 'te diep: ' + '; '.join(slecht) if slecht else 'alle schermen binnen het budget'))
    for naam, _, _, grens in RENDER_BUDGET + RENDER_DESKTOP:
        if naam in uit['render']:
            m = mediaan(uit['render'][naam]); oordeel(m <= grens * (1 + a.marge / 100), '%-56s mediaan %5d ms  p95 %5d  budget %d (+%d %%)' % (('demo groot, desktop: ' if (naam, ) in [(x[0], ) for x in RENDER_DESKTOP] else 'demo groot, telefoon: ') + naam, m, p95(uit['render'][naam]), grens, a.marge))
    oordeel(not uit['fouten'], '%-56s %d%s' % (BUDGET['fouten'][2], len(uit['fouten']), (': ' + '; '.join(uit['fouten'][:3])) if uit['fouten'] else ''))
    if a.json:
        with open(a.json, 'w') as f: json.dump(uit, f, ensure_ascii=False, indent=1)
    print('\nALLES GOED' if not fouten else '\nFOUTEN: %d' % len(fouten))
    sys.exit(0 if not fouten else 1)

if __name__ == '__main__': main()
