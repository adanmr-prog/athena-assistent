# v6.6: laadprestatie zoals een gebruiker die ervaart, tegen de mock-backend (niet de demo: die draait Code.gs in de browser).
# Telefoon 390 px, trage 4G (150 ms RTT, 1,6 Mbit/s) en 4x tragere CPU. Meet: eerste tekst (FCP), grootste element (LCP),
# verschuiving (CLS) en wanneer Vandaag gevuld is. Koude start (lege cache) en warme start (tweede bezoek).
# Gebruik: start de mock (python3 test/mock_backend.py) en dan python3 test/ux_prestatie.py [poort].
import sys, os, json
from playwright.sync_api import sync_playwright

POORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None
OBS = """window.__cls = 0; window.__lcp = 0;
new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) window.__cls += e.value; }); }).observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver(function (l) { var e = l.getEntries(); window.__lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });"""

def meet(page, cdp, base):
    page.goto(base + '/'); page.wait_for_selector('#focusLijst .rij, #focusLijst .leeg', timeout=60000)
    klaar = page.evaluate('performance.now()'); page.wait_for_timeout(1500)
    fcp = page.evaluate("(performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0")
    return {'fcp_ms': round(fcp), 'lcp_ms': round(page.evaluate('window.__lcp')), 'cls': round(page.evaluate('window.__cls'), 3), 'vandaag_gevuld_ms': round(klaar)}

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=3, locale='nl-NL')
    ctx.add_init_script(OBS)
    base = 'http://127.0.0.1:%d' % POORT
    ctx.add_init_script("try { localStorage.setItem('aa_api', '%s/api'); localStorage.setItem('aa_secret', 'test123'); } catch (e) {}" % base)
    page = ctx.new_page(); cdp = ctx.new_cdp_session(page)
    cdp.send('Network.enable'); cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6 * 1024 * 1024 / 8, 'uploadThroughput': 750 * 1024 / 8})
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    koud = meet(page, cdp, base)
    warm = meet(page, cdp, base)
    print(json.dumps({'koud': koud, 'warm': warm}))
