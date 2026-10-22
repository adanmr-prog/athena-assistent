# v7.2: storingstest — hoe gedraagt de app zich als de backend wegvalt, traag is, onzin terugstuurt of de koppelcode afkeurt,
# en hoe verloopt een update van de service worker. Playwright (Chromium uit /opt/pw-browsers) tegen test/mock_backend.py op poort 8786
# (de test start en stopt de mock zelf). Scenario's:
#   A  elke POST /api → HTTP 500        toast met leesbare melding, geen spinner > 5 s, app blijft bedienbaar, geen pageerror
#   B  /api antwoordt pas na 8 s        tekst blijft in het veld tot het antwoord er is (of komt terug bij een fout), geen dubbele verzending
#   C  offline                          Home uit aa_cache_home, een actie geeft een toast, na online werkt het weer zonder herladen
#   D  {"ok":false,"fout":"secret"}     koppelscherm precies één keer, geen lus van verzoeken
#   E  antwoord is geen JSON (HTML)     nette toast, geen pageerror (met status 503 en met status 200)
#   F  sw.js met een andere CACHE       nieuwe shell in de nieuwe cache, oude cache weg, na reload de nieuwe versie
# Gebruik: python3 test/storing.py [--poort 8786]. Screenshots: test/shots/robuust/storing_<X>.png. Eindigt met ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1).
# Grens: de totale looptijd blijft onder 6 minuten; de wachttijden zijn 8 s (B, traag) en 5 s (D, tellen). Niets anders is weggelaten.
import os, sys, re, json, time, subprocess, urllib.request
os.environ.setdefault('PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS', '1')  # Chromium: ook de verzoeken van de service worker via context.route (nodig voor F)
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
arg = sys.argv[1:]
POORT = int(arg[arg.index('--poort') + 1]) if '--poort' in arg else int(os.environ.get('STORING_POORT') or 8786)
OUT = os.path.join(ROOT, 'test', 'shots', 'robuust'); os.makedirs(OUT, exist_ok=True)
BASIS = 'http://127.0.0.1:%d/' % POORT
API_RE = re.compile(r'/api(\?|$)')  # alleen POST /api(?app=1), niet /api/config
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None
T0 = time.time()

fouten = []; checks = 0; metingen = {}
def ok(naam, voorwaarde, detail=''):
    global checks; checks += 1
    if voorwaarde: print('ok   ' + naam + ((' — ' + detail) if detail else ''))
    else: fouten.append(naam + ((' — ' + detail) if detail else '')); print('FOUT ' + naam + ((' — ' + detail) if detail else ''))
    sys.stdout.flush()

# ---- mock starten -----------------------------------------------------------------------------------------------------
log = open(os.path.join(OUT, 'storing_mock.log'), 'w')
env = dict(os.environ, MOCK_POORT=str(POORT), MOCK_CSP='1')
mock = subprocess.Popen([sys.executable, os.path.join(ROOT, 'test', 'mock_backend.py')], env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
def mock_klaar():
    for _ in range(50):
        try:
            with urllib.request.urlopen(BASIS + 'api', timeout=1) as r: return r.status == 200
        except Exception: time.sleep(0.2)
    return False
def mock_stop():
    subprocess.call(['fuser', '-k', '%d/tcp' % POORT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try: mock.kill()
    except Exception: pass
if not mock_klaar():
    print('FOUT mock start niet op poort %d' % POORT); mock_stop(); print('FOUTEN: 1'); sys.exit(1)

# ---- de nagebootste storing: één route op POST /api met een schakelaar ------------------------------------------------
HTML_FOUT = '<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Service Unavailable</h1><p>The service is temporarily unavailable. Please try again later.</p></body></html>'
MODUS = {'m': 'door', 'vast': [], 'tel': 0, 'log': []}
def api_route(route, request):
    if request.method != 'POST': return route.continue_()
    fn = ''
    try: fn = json.loads(request.post_data or '{}').get('fn', '')
    except Exception: pass
    MODUS['tel'] += 1; MODUS['log'].append((round(time.time() - T0, 2), MODUS['m'], fn))
    m = MODUS['m']
    if m == '500': return route.fulfill(status=500, content_type='text/plain', body='Internal Server Error')
    if m == 'secret': return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': False, 'fout': 'secret'}))
    if m == 'html200': return route.fulfill(status=200, content_type='text/html', body=HTML_FOUT)
    if m == 'html503': return route.fulfill(status=503, content_type='text/html', body=HTML_FOUT)
    if m == 'vasthouden' and fn == 'apiActiviteitToevoegen': MODUS['vast'].append(route); return  # blijft hangen tot de test hem loslaat
    return route.continue_()

# ---- hulpjes --------------------------------------------------------------------------------------------------------------
ONLEESBAAR = ['undefined', 'null', '[object', 'TypeError', 'SyntaxError', 'Unexpected token', 'JSON', 'Failed to fetch', 'NetworkError', 'Load failed', 'serverfout 5']
def leesbaar(t):
    t = (t or '').strip()
    if not t: return False
    return not any(w in t for w in ONLEESBAAR[:-1]) and (ONLEESBAAR[-1] not in t or 'serverfout' in t)  # 'serverfout 500' is kort maar wel leesbaar
def nederlands(t):
    return bool(t) and not any(w in t for w in ['Failed to fetch', 'NetworkError', 'Load failed', 'Unexpected token', 'is not valid JSON', 'TypeError'])
def toast_wis(pg): pg.evaluate("(function(){var t=document.getElementById('toast'); t.classList.remove('aan'); t.textContent='';})()")
def toast_wacht(pg, ms=6000):
    try: pg.wait_for_selector('#toast.aan', timeout=ms)
    except Exception: return ''
    t = pg.inner_text('#toast'); pg.wait_for_timeout(300)
    t2 = pg.inner_text('#toast') if pg.locator('#toast.aan').count() else ''
    return t2 if t2 and t2 != t else t  # de laatste toast wint (meerdere mislukte verzoeken overschrijven elkaar)
def spinner_zichtbaar(pg):
    return pg.evaluate("Array.prototype.filter.call(document.querySelectorAll('.spinner'), function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !!e.offsetParent; }).map(function (e) { return (e.textContent || '').trim(); })")
def spinner_weg(pg, max_ms=5000):
    t = time.time()
    while time.time() - t < max_ms / 1000.0:
        s = spinner_zichtbaar(pg)
        if not s: return round((time.time() - t) * 1000)
        pg.wait_for_timeout(200)
    return None  # nog steeds een spinner na max_ms
def shot(pg, naam):
    try: pg.screenshot(path=os.path.join(OUT, 'storing_%s.png' % naam))
    except Exception as e: print('     (screenshot %s mislukt: %s)' % (naam, str(e).split('\n')[0]))
def opslag(pg, k): return pg.evaluate("(function(k){try{return localStorage.getItem(k)}catch(e){return null}})(%r)" % k)

pageerrors = []; consolefouten = []
def scenario(naam, fn, pg, ctx):
    del pageerrors[:]
    try: fn()
    except Exception as e:
        ok('%s loopt door zonder uitzondering in de test' % naam, False, str(e).split('\n')[0][:200])
        shot(pg, naam + '_uitzondering')
    # herstel voor het volgende scenario
    MODUS['m'] = 'door'
    for r in MODUS['vast']:
        try: r.continue_()
        except Exception: pass
    del MODUS['vast'][:]
    try: ctx.set_offline(False)
    except Exception: pass
    ok('%s geen pageerror' % naam, not pageerrors, '; '.join(pageerrors)[:300])

def naar(pg, item):
    pg.click('#zijbalk .zb-item[data-desk="%s"]' % item)
def open_school(pg, n=0):
    naar(pg, 'contacten'); pg.wait_for_selector('#crmInhoud [data-crm-open^="school:"]', timeout=10000)
    pg.locator('#crmInhoud [data-crm-open^="school:"]').nth(n).click()
    pg.wait_for_selector('#crmDetailScherm .d-naam h2', timeout=10000)
    return pg.inner_text('#crmDetailScherm .d-naam h2')
def notitie_openen(pg, tekst):
    pg.select_option('#crmDetailScherm [data-logvorm]', 'notitie'); pg.wait_for_selector('#crmComposer #cf-tekst', timeout=5000)
    pg.fill('#crmComposer #cf-tekst', tekst)

try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: pageerrors.append(str(e).split('\n')[0]))
    pg.on('console', lambda m: consolefouten.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.route(API_RE, api_route)
    ctx.route(re.compile(r'^https?://(?!127\.0\.0\.1)'), lambda route, request: route.abort())  # geen Google Fonts: de test is onafhankelijk van het internet
    BEZIG = set()
    pg.on('request', lambda r: BEZIG.add(r) if r.method == 'POST' and API_RE.search(r.url) else None)
    pg.on('requestfinished', lambda r: BEZIG.discard(r)); pg.on('requestfailed', lambda r: BEZIG.discard(r))
    def rust(ms=10000):  # wachten tot er geen API-verzoek meer onderweg is (in plaats van networkidle, dat op externe fonts kan blijven hangen)
        t = time.time()
        while BEZIG and time.time() - t < ms / 1000.0: pg.wait_for_timeout(100)
        pg.wait_for_timeout(250)

    # ---- start: koppelen als management (test123), Home laden, service worker klaar ----
    pg.goto(BASIS); pg.wait_for_selector('#koppel.aan #apiInput', timeout=10000)
    pg.fill('#apiInput', BASIS + 'api'); pg.fill('#codeInput', 'test123'); pg.click('#codeOpslaan')
    pg.wait_for_selector('#homeInhoud .hkaart', timeout=15000); rust()
    ok('start Home geladen (desktop, management)', pg.locator('#homeInhoud .hkaart').count() > 0 and pg.locator('body.desk').count() == 1)
    SW_CACHE = re.search(r"var CACHE = '([^']+)'", open(os.path.join(ROOT, 'sw.js')).read()).group(1)
    sw_ok = False
    for _ in range(40):
        st = pg.evaluate("""(async function (naam) {
          var reg = await navigator.serviceWorker.getRegistration(); var keys = await caches.keys();
          var hit = await caches.match('./index.html');
          return { reg: !!reg, actief: !!(reg && reg.active), controller: !!navigator.serviceWorker.controller, keys: keys, shell: !!hit };
        })(%r)""" % SW_CACHE)
        if st['actief'] and st['shell'] and SW_CACHE in st['keys']: sw_ok = True; break
        pg.wait_for_timeout(250)
    ok('start service worker actief met shell in cache %s' % SW_CACHE, sw_ok, json.dumps(st))
    ok('start aa_cache_home gevuld', bool(opslag(pg, 'aa_cache_home')) and 'taken' in (opslag(pg, 'aa_cache_home') or ''))
    tel_start = MODUS['tel']; metingen['verzoeken_start'] = tel_start

    # ================================================================ A: elke POST /api → HTTP 500
    def scen_a():
        school = open_school(pg, 0)  # het detail staat open vóór de storing, zodat Vastpinnen (lokaal) te testen is
        MODUS['m'] = '500'; toast_wis(pg)
        pg.click('#crmDetailScherm [data-pin]'); t = toast_wacht(pg)
        ok('A vastpinnen werkt lokaal tijdens de storing', 'Vastgepind' in t and pg.locator('#zbPins .zb-pin').count() == 1, t)
        toast_wis(pg); tekst = 'Storingstest A: notitie tijdens 500'
        notitie_openen(pg, tekst); pg.click('#crmComposer [data-cf-opslaan]')
        t = toast_wacht(pg); shot(pg, 'A')
        ok('A toast bij het loggen van een activiteit', 'Niet gelukt' in t, t)
        ok('A melding leesbaar', leesbaar(t), t)
        ok('A tekst blijft in het veld na de fout', pg.input_value('#crmComposer #cf-tekst') == tekst)
        pg.wait_for_timeout(300)
        ok('A knop Opslaan weer bruikbaar', pg.locator('#crmComposer [data-cf-opslaan]:not([disabled])').count() == 1)
        w = spinner_weg(pg); ok('A geen spinner > 5 s (detail)', w is not None, 'spinners: %s' % spinner_zichtbaar(pg))
        # nog een school openen terwijl alles faalt
        toast_wis(pg); naar(pg, 'contacten'); pg.wait_for_timeout(600)
        ok('A Contacten toont de lijst uit het geheugen', pg.locator('#crmInhoud [data-crm-open^="school:"]').count() > 0)
        pg.locator('#crmInhoud [data-crm-open^="school:"]').nth(1).click(); t = toast_wacht(pg)
        w = spinner_weg(pg); ok('A geen spinner > 5 s (school openen)', w is not None, 'spinners: %s' % spinner_zichtbaar(pg))
        ok('A detail meldt dat het niet kon laden, met Terug', 'Kon dit niet laden' in pg.inner_text('#crmDetailScherm') and pg.locator('#crmDetailScherm [data-crm-terug]').count() == 1)
        ok('A toast bij school openen', 'Niet gelukt' in t and leesbaar(t), t)
        pg.click('#crmDetailScherm [data-crm-terug]'); pg.wait_for_timeout(400)
        ok('A terug naar de lijst werkt', pg.locator('#crmLijstScherm').is_visible() and pg.locator('#crmInhoud [data-crm-open^="school:"]').count() > 0)
        naar(pg, 'home'); pg.wait_for_timeout(600)
        ok('A Home blijft staan tijdens de storing', pg.locator('#homeInhoud .hkaart').count() > 0)
        w = spinner_weg(pg); ok('A geen spinner > 5 s (Home)', w is not None, 'spinners: %s' % spinner_zichtbaar(pg))
        ok('A toast zegt niet "undefined" of iets technisch', all(leesbaar(x) for x in [t]), t)
    scenario('A', scen_a, pg, ctx)

    # ================================================================ B: /api antwoordt pas na 8 s
    def scen_b():
        open_school(pg, 0)
        tekst = 'Storingstest B: trage notitie van acht seconden'
        notitie_openen(pg, tekst)
        MODUS['m'] = 'vasthouden'; del MODUS['vast'][:]; toast_wis(pg)
        knop = pg.locator('#crmComposer [data-cf-opslaan]'); bb = knop.bounding_box(); x, y = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
        t_klik = time.time(); pg.mouse.click(x, y); pg.mouse.click(x, y)  # twee keer klikken, zoals een ongeduldige gebruiker
        pg.wait_for_timeout(1000)
        ok('B één verzoek na twee keer klikken', len(MODUS['vast']) == 1, '%d verzoeken vastgehouden' % len(MODUS['vast']))
        ok('B tekst blijft in het veld tijdens het wachten', pg.input_value('#crmComposer #cf-tekst') == tekst)
        ok('B knop Opslaan uitgeschakeld tijdens het wachten', pg.locator('#crmComposer [data-cf-opslaan][disabled]').count() == 1)
        shot(pg, 'B')
        rest = 8.0 - (time.time() - t_klik)
        if rest > 0: pg.wait_for_timeout(int(rest * 1000))
        ok('B tekst staat er na 8 s nog', pg.input_value('#crmComposer #cf-tekst') == tekst)
        for r in MODUS['vast']: r.continue_()
        del MODUS['vast'][:]
        pg.wait_for_selector('#crmDetailScherm .t-item:has-text("%s")' % tekst, timeout=10000)
        ok('B notitie staat precies één keer in de tijdlijn', pg.locator('#crmDetailScherm .t-item:has-text("%s")' % tekst).count() == 1)
        ok('B composer leeg na succes', pg.locator('#crmComposer #cf-tekst').count() == 0)
        # B2: traag en dan een fout → de tekst moet blijven staan
        tekst2 = 'Storingstest B2: fout na vertraging'
        notitie_openen(pg, tekst2); MODUS['m'] = 'vasthouden'; toast_wis(pg)
        pg.click('#crmComposer [data-cf-opslaan]'); pg.wait_for_timeout(3000)
        ok('B2 verzoek onderweg', len(MODUS['vast']) == 1)
        for r in MODUS['vast']: r.fulfill(status=500, content_type='text/plain', body='Internal Server Error')
        del MODUS['vast'][:]; MODUS['m'] = 'door'
        t = toast_wacht(pg)
        ok('B2 toast na de late fout', 'Niet gelukt' in t, t)
        ok('B2 tekst komt niet verloren bij een fout', pg.input_value('#crmComposer #cf-tekst') == tekst2)
        pg.wait_for_timeout(300)
        ok('B2 opnieuw opslaan kan', pg.locator('#crmComposer [data-cf-opslaan]:not([disabled])').count() == 1)
        pg.click('#crmComposer [data-cf-opslaan]'); pg.wait_for_selector('#crmDetailScherm .t-item:has-text("%s")' % tekst2, timeout=10000)
        ok('B2 tweede poging slaat op', pg.locator('#crmDetailScherm .t-item:has-text("%s")' % tekst2).count() == 1)
    scenario('B', scen_b, pg, ctx)

    # ================================================================ C: offline
    def scen_c():
        naar(pg, 'home'); pg.wait_for_selector('#homeInhoud .hkaart'); rust()
        cache = opslag(pg, 'aa_cache_home'); ok('C aa_cache_home aanwezig vóór offline', bool(cache) and 'taken' in cache)
        # markeer de bewaarde Home, zodat zichtbaar is dat de app die toont en niet verse gegevens
        pg.evaluate("(function(){var h=JSON.parse(localStorage.getItem('aa_cache_home')); h.groet='Offline-groet uit de cache'; localStorage.setItem('aa_cache_home', JSON.stringify(h));})()")
        ctx.set_offline(True); toast_wis(pg)
        herladen = True
        try: pg.reload(wait_until='domcontentloaded', timeout=15000)
        except Exception as e: herladen = False; ok('C app start offline (shell uit de service worker)', False, str(e).split('\n')[0][:160])
        if herladen:
            try: pg.wait_for_selector('#homeInhoud .hkaart', timeout=10000); kaart = True
            except Exception: kaart = False
            ok('C app start offline en toont Home uit aa_cache_home', kaart and pg.inner_text('#homeGroet') == 'Offline-groet uit de cache', 'groet: %r, hkaarten: %d' % (pg.inner_text('#homeGroet') if pg.locator('#homeGroet').count() else '', pg.locator('#homeInhoud .hkaart').count()))
            t = toast_wacht(pg); metingen['toast_offline'] = t
            ok('C toast bij het laden zonder netwerk', 'Niet gelukt' in t, t)
            ok('C melding offline in gewoon Nederlands', nederlands(t), t)
            w = spinner_weg(pg); ok('C geen spinner > 5 s', w is not None, 'spinners: %s' % spinner_zichtbaar(pg))
        else:
            ctx.set_offline(False); pg.reload(); pg.wait_for_selector('#homeInhoud .hkaart', timeout=15000); ctx.set_offline(True)
        # een actie offline
        toast_wis(pg); naar(pg, 'contacten'); pg.wait_for_timeout(500)
        ok('C Contacten offline uit aa_cache_crm', pg.locator('#crmInhoud [data-crm-open^="school:"]').count() > 0)
        pg.locator('#crmInhoud [data-crm-open^="school:"]').first.click(); t = toast_wacht(pg)
        ok('C actie offline geeft een toast', 'Niet gelukt' in t, t)
        shot(pg, 'C')
        w = spinner_weg(pg); ok('C geen spinner > 5 s na actie offline', w is not None, 'spinners: %s' % spinner_zichtbaar(pg))
        # weer online: zonder herladen
        ctx.set_offline(False); pg.wait_for_timeout(300)
        if pg.locator('#crmDetailScherm [data-crm-terug]').count(): pg.click('#crmDetailScherm [data-crm-terug]'); pg.wait_for_timeout(300)
        pg.locator('#crmInhoud [data-crm-open^="school:"]').first.click()
        try: pg.wait_for_selector('#crmDetailScherm .d-naam h2', timeout=10000); detail = True
        except Exception: detail = False
        ok('C na online werkt een school openen zonder herladen', detail)
        naar(pg, 'home'); pg.wait_for_timeout(800)
        ok('C na online verse Home (groet uit de backend)', pg.inner_text('#homeGroet') != 'Offline-groet uit de cache' and pg.locator('#homeInhoud .hkaart').count() > 0, pg.inner_text('#homeGroet'))
    scenario('C', scen_c, pg, ctx)

    # ================================================================ D: {"ok":false,"fout":"secret"}
    def scen_d():
        pg.evaluate("""(function(){ window.__koppelAan = 0; var k = document.getElementById('koppel'), was = k.classList.contains('aan');
          new MutationObserver(function () { var nu = k.classList.contains('aan'); if (nu && !was) window.__koppelAan++; was = nu; }).observe(k, { attributes: true, attributeFilter: ['class'] }); })()""")
        tel0 = MODUS['tel']; MODUS['m'] = 'secret'; toast_wis(pg)
        naar(pg, 'home')  # apiHome + apiHomeMails
        pg.wait_for_selector('#koppel.aan', timeout=5000)
        t = toast_wacht(pg); pg.wait_for_timeout(1000); tel1 = MODUS['tel'] - tel0
        pg.wait_for_timeout(5000); tel6 = MODUS['tel'] - tel0
        metingen['verzoeken_secret_1s'] = tel1; metingen['verzoeken_secret_6s'] = tel6
        ok('D koppelscherm verschijnt', pg.locator('#koppel.aan').is_visible() and pg.locator('#koppelCode').is_visible())
        ok('D koppelscherm precies één keer getoond', pg.evaluate('window.__koppelAan') == 1, '%s keer' % pg.evaluate('window.__koppelAan'))
        ok('D geen lus van verzoeken (na 1 s: %d, na 6 s: %d)' % (tel1, tel6), tel6 == tel1 and tel1 <= 4, str([x for x in MODUS['log'] if x[1] == 'secret']))
        ok('D koppelcode gewist', not opslag(pg, 'aa_secret'))
        ok('D toast legt uit wat er is', 'Koppelcode klopt niet' in t, t)
        shot(pg, 'D')
        # opnieuw koppelen voor E en F
        MODUS['m'] = 'door'; pg.fill('#apiInput', BASIS + 'api'); pg.fill('#codeInput', 'test123'); pg.click('#codeOpslaan')
        pg.wait_for_selector('#homeInhoud .hkaart', timeout=15000); rust()
        ok('D opnieuw koppelen werkt', not pg.locator('#koppel.aan').count())
    scenario('D', scen_d, pg, ctx)

    # ================================================================ E: antwoord is geen JSON (HTML "Service Unavailable")
    def scen_e():
        naar(pg, 'contacten'); pg.wait_for_selector('#crmInhoud [data-crm-open^="school:"]', timeout=10000); rust()
        MODUS['m'] = 'html503'; toast_wis(pg)
        pg.locator('#crmInhoud [data-crm-open^="school:"]').first.click(); t = toast_wacht(pg); metingen['toast_html503'] = t
        ok('E HTML met status 503: nette toast', 'Niet gelukt' in t and leesbaar(t) and nederlands(t), t)
        w = spinner_weg(pg); ok('E geen spinner > 5 s (503)', w is not None)
        pg.click('#crmDetailScherm [data-crm-terug]'); pg.wait_for_timeout(300)
        MODUS['m'] = 'html200'; toast_wis(pg)
        pg.locator('#crmInhoud [data-crm-open^="school:"]').first.click(); t = toast_wacht(pg); metingen['toast_html200'] = t
        shot(pg, 'E')
        ok('E HTML met status 200: toast', 'Niet gelukt' in t, t)
        ok('E HTML met status 200: melding leesbaar (geen "Unexpected token")', leesbaar(t) and nederlands(t), t)
        w = spinner_weg(pg); ok('E geen spinner > 5 s (200)', w is not None)
        pg.click('#crmDetailScherm [data-crm-terug]'); pg.wait_for_timeout(300); MODUS['m'] = 'door'
    scenario('E', scen_e, pg, ctx)

    # ================================================================ F: update van de service worker (nieuwe versie)
    # Chromium haalt sw.js bij een update-controle op in het browserproces: dat verzoek is niet te onderscheppen met page.route, context.route
    # (ook niet met PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS) of CDP Fetch op browserniveau — allemaal geprobeerd, geen van alle ziet het.
    # Een gewijzigde sw.js (CACHE 'v-test') aanbieden kan dus niet zonder sw.js op schijf te wijzigen. Daarom doorloopt de test dezelfde
    # levenscyclus met een nieuwe script-URL (sw.js?v=test = voor de browser een nieuwe worker: install → skipWaiting → activate → claim),
    # plant vooraf een oude cache 'athena-assistent-v-oud' om de opruiming in activate te zien, en zet een marker in de shell die de install
    # opnieuw ophaalt (de fetches van de worker zelf gaan wél door context.route). Zo is controleerbaar: nieuwe shell in de cache, oude cache weg,
    # de open pagina draait door op de oude versie, na reload draait de nieuwe. Wat ontbreekt: de CACHE-naamwissel zelf (zie samenvatting).
    def scen_f():
        shell_hits = []
        def shell_route(route, request):
            shell_hits.append((request.url, bool(request.service_worker)))
            resp = route.fetch(); body = resp.text().replace('</head>', '<meta name="aa-test-versie" content="v-test"></head>', 1)
            route.fulfill(response=resp, body=body)
        SHELL_RE = re.compile(r'^http://127\.0\.0\.1:%d/(index\.html)?$' % POORT)
        ctx.route(SHELL_RE, shell_route)
        naar(pg, 'home'); pg.wait_for_selector('#homeInhoud .hkaart'); rust(); toast_wis(pg)
        voor = pg.evaluate("""(async function(){ var c = await caches.open('athena-assistent-v-oud'); await c.put('./oud.txt', new Response('oud'));
          window.__cc = 0; navigator.serviceWorker.addEventListener('controllerchange', function () { window.__cc++; });
          return { keys: await caches.keys(), script: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL }; })()""")
        ok('F uitgangspunt: worker %s actief, geplante oude cache aanwezig' % SW_CACHE, SW_CACHE in voor['keys'] and 'athena-assistent-v-oud' in voor['keys'] and (voor['script'] or '').endswith('/sw.js'), json.dumps(voor))
        pg.evaluate("navigator.serviceWorker.register('sw.js?v=test').then(function(){ window.__reg = 'ok'; }, function (e) { window.__reg = 'fout ' + e; })")  # nieuwe worker, zoals bij een gewijzigde sw.js
        na = None
        for _ in range(60):
            na = pg.evaluate("(async function(){ var reg = await navigator.serviceWorker.getRegistration(); var keys = await caches.keys(); var hit = await caches.match('./index.html'); var txt = hit ? await hit.text() : '';"
                             " return { keys: keys, cc: window.__cc, reg: window.__reg, actief: reg && reg.active && reg.active.scriptURL, wachtend: !!(reg && reg.waiting), installing: !!(reg && reg.installing),"
                             " controller: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL, shellNieuw: txt.indexOf('aa-test-versie') >= 0 }; })()")
            if 'athena-assistent-v-oud' not in na['keys'] and na['cc'] >= 1 and na['shellNieuw']: break
            pg.wait_for_timeout(250)
        metingen['sw_voor'] = voor; metingen['sw_na'] = na; metingen['sw_shell_verzoeken'] = shell_hits[:6]
        ok('F nieuwe worker geïnstalleerd en actief', na['reg'] == 'ok' and (na['actief'] or '').endswith('sw.js?v=test') and not na['wachtend'], json.dumps(na))
        ok('F nieuwe worker neemt meteen over (skipWaiting + clients.claim → controllerchange)', na['cc'] >= 1 and (na['controller'] or '').endswith('sw.js?v=test'), json.dumps(na))
        ok('F install haalt de shell opnieuw op (nieuwe index.html in de cache)', na['shellNieuw'] and any(h[1] for h in shell_hits), 'shell met marker: %s, verzoeken: %s' % (na['shellNieuw'], shell_hits[:4]))
        ok('F activate ruimt oude caches op (athena-assistent-v-oud weg)', 'athena-assistent-v-oud' not in na['keys'] and SW_CACHE in na['keys'], json.dumps(na['keys']))
        ok('F de open pagina draait door op de oude versie, zonder melding', pg.locator('meta[name="aa-test-versie"]').count() == 0 and not pg.locator('#toast.aan').count() and pg.locator('#homeInhoud .hkaart').count() > 0,
           'marker: %d, toast: %r, hkaarten: %d' % (pg.locator('meta[name="aa-test-versie"]').count(), pg.inner_text('#toast') if pg.locator('#toast.aan').count() else '', pg.locator('#homeInhoud .hkaart').count()))
        pg.reload(wait_until='domcontentloaded'); pg.wait_for_selector('#homeInhoud .hkaart', timeout=15000)
        ok('F na reload gebruikt de app de nieuwe shell', pg.locator('meta[name="aa-test-versie"]').count() == 1)
        ok('F na reload geen koppelscherm, gegevens geladen', not pg.locator('#koppel.aan').count())
        shot(pg, 'F')
        ctx.unroute(SHELL_RE)
        print('info F update: sw.js wordt bij elke start/navigatie gecontroleerd; een nieuwe versie installeert, neemt meteen over (skipWaiting + clients.claim) en ruimt oude caches op; de open pagina blijft de oude index.html tot de gebruiker herlaadt of de app opnieuw opent; index.html zelf is network-first (3 s), dus de volgende start haalt de nieuwe versie los van de worker.')
    scenario('F', scen_f, pg, ctx)

    metingen['verzoeken_totaal'] = MODUS['tel']; metingen['consolefouten'] = consolefouten[:10]
    b.close()
finally:
    mock_stop(); log.close()

looptijd = round(time.time() - T0, 1)
with open(os.path.join(OUT, 'storing_meting.json'), 'w') as f: json.dump({'looptijd_s': looptijd, 'checks': checks, 'fouten': fouten, 'metingen': metingen, 'verzoeken': MODUS['log']}, f, indent=1, ensure_ascii=False)
print('looptijd %.1f s, %d controles' % (looptijd, checks))
if fouten: print('FOUTEN: %d' % len(fouten)); sys.exit(1)
print('ALLES GOED')
