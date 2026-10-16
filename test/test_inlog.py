# v6.0: de inlogflow van de eigen server (Vercel + Supabase Auth met Google) in de browser, tegen de mock met MOCK_GOOGLE=1.
# Start zelf de mock op poort 8767. Gebruik: python3 test/test_inlog.py → "meldingen: geen" (exitcode 0) of de meldingen.
import os, sys, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'shots'); os.makedirs(OUT, exist_ok=True)
POORT = 8767; BASIS = 'http://127.0.0.1:%d' % POORT
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
meldingen = []

proc = subprocess.Popen([sys.executable, os.path.join(ROOT, 'test', 'mock_backend.py')], env=dict(os.environ, MOCK_GOOGLE='1', MOCK_POORT=str(POORT)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(50):
    try: urllib.request.urlopen(BASIS + '/api/config', timeout=1); break
    except Exception: time.sleep(0.2)
else: print('mock start niet'); proc.terminate(); sys.exit(1)

def opslag(page, k): return page.evaluate("k => localStorage.getItem(k)", k)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, headless=True)
        ctx = b.new_context(viewport={'width': 1280, 'height': 800}, locale='nl-NL', timezone_id='Europe/Amsterdam'); page = ctx.new_page()
        page.on('console', lambda m: meldingen.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: meldingen.append(('pageerror', str(e))))
        page.on('response', lambda r: meldingen.append(('http', str(r.status) + ' ' + r.url)) if r.status >= 400 else None)
        # 1. zonder koppeling op de eigen server: inloggen met Google, geen koppelcodevelden
        page.goto(BASIS + '/'); page.wait_for_selector('#koppel.aan #inloggenGoogle')
        assert not page.locator('#apiInput').is_visible() and not page.locator('#codeInput').is_visible(), 'de koppelcodevelden blijven verborgen op de eigen server'
        page.screenshot(path=OUT + '/60_inloggen_google.png')
        page.click('#inloggenGoogle'); page.wait_for_selector('#zbNaam:has-text("Menno")')
        assert opslag(page, 'aa_token') == 'testtoken-menno' and opslag(page, 'aa_secret') is None and opslag(page, 'aa_api') is None and 'access_token' not in page.evaluate('location.hash'), 'na de terugkeer van Google: token bewaard, geen koppelcode, token uit de hash'
        page.wait_for_selector('.tegel'); page.screenshot(path=OUT + '/61_ingelogd_home.png')
        # 2. een token dat bijna verloopt wordt stil vernieuwd
        page.evaluate("localStorage.setItem('aa_token_tot', '1')"); page.reload(); page.wait_for_selector('#zbNaam:has-text("Menno")')
        page.wait_for_function("localStorage.getItem('aa_token') === 'testtoken-menno-vers'"); assert opslag(page, 'aa_refresh') == 'refresh-2', 'vernieuwen via het refresh-token'
        # 3. instellingen: status noemt de eigen server; uitloggen brengt het inlogscherm terug
        page.click('#zbInstellingen'); page.wait_for_selector('#koppel.aan #uitloggen:visible'); page.wait_for_selector('#statusInfo .k-rij')
        assert 'eigen server' in page.inner_text('#statusInfo') and 'Database' in page.inner_text('#statusInfo'), 'de status noemt de eigen server'
        page.screenshot(path=OUT + '/62_instellingen_server.png')
        page.click('#uitloggen'); page.wait_for_selector('#koppel.aan #inloggenGoogle'); assert opslag(page, 'aa_token') is None and opslag(page, 'aa_refresh') is None, 'uitloggen wist de tokens'
        # 4. een token dat de server niet meer kent → opnieuw inloggen
        page.evaluate("localStorage.setItem('aa_token', 'onbekend-token'); localStorage.setItem('aa_token_tot', String(Date.now() + 3600000)); localStorage.setItem('aa_refresh', '')"); page.reload()
        page.wait_for_selector('#koppel.aan #inloggenGoogle'); page.wait_for_selector('#toast.aan:has-text("opnieuw in")'); assert opslag(page, 'aa_token') is None, 'een ongeldig token wordt gewist'
        ctx.close(); b.close()
finally:
    proc.terminate()
meldingen = [m for m in meldingen if not (m[0] == 'http' and '/api/config' in m[1] and ' 404 ' in m[1])]
print('\n'.join('%s: %s' % m for m in meldingen) or 'meldingen: geen')
sys.exit(1 if meldingen else 0)
