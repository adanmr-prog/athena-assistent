# v4.3: screenshots van de demomodus (?demo=1, fictieve gegevens) voor presentaties, plus een rooktest zonder backend.
# Gebruik: python3 test/demo_shots.py [rooktest]  → test/shots/demo/*.png. Start zelf een statische server op poort 8766.
import os, sys, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'shots', 'demo'); os.makedirs(OUT, exist_ok=True)
POORT = 8766
ALLEEN_ROOK = 'rooktest' in sys.argv[1:]

class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
server = socketserver.TCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()

exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
meldingen = []

def url(rol, extra=''):
    return 'http://127.0.0.1:%d/?demo=1&kaal=1&rol=%s%s' % (POORT, rol, extra)

def volg(page):
    page.on('console', lambda m: meldingen.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: meldingen.append(('pageerror', str(e))))
    page.on('response', lambda r: meldingen.append(('http', str(r.status) + ' ' + r.url)) if r.status >= 400 else None)

def rust(page, ms=600):
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(ms)

def shot(page, naam, vol=False):
    page.screenshot(path=os.path.join(OUT, naam + '.png'), full_page=vol)

def desk(page, item, ms=700):
    page.evaluate('deskNaar(%r)' % item); rust(page, ms)

def klik(page, sel, ms=700):
    page.locator(sel + ':visible').first.click(); rust(page, ms)

def context(b, telefoon=False):
    if telefoon:
        return b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True, locale='nl-NL', timezone_id='Europe/Amsterdam')
    return b.new_context(viewport={'width': 1600, 'height': 900}, device_scale_factor=1.5, locale='nl-NL', timezone_id='Europe/Amsterdam')

def open_rol(b, rol, telefoon=False):
    ctx = context(b, telefoon); page = ctx.new_page(); volg(page)
    page.goto(url(rol)); page.wait_for_selector('#zijbalk' if not telefoon else 'nav'); rust(page, 1200)
    return ctx, page

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True)

    # ---- Desktop, management: alle schermen ----
    ctx, page = open_rol(b, 'sophie')
    shot(page, 'm01_home')
    for item in ['contacten', 'taken', 'agenda', 'pipeline', 'projecten', 'bezetting', 'facturatie', 'rapporten', 'doelen', 'brein', 'review', 'huisstijl']:
        desk(page, item); shot(page, 'm_' + item)
    # v4.3: de demo mag de echte koppeling nooit aanraken, ook niet als een demorol niet meer kan inloggen
    page.evaluate("localStorage.setItem('aa_secret', 'ECHTE-CODE')")
    page.evaluate("run('apiGebruikerOpslaan', { id: 'g-lars', actief: 'nee' })"); rust(page, 400)
    page.goto(url('lars')); rust(page, 1200)
    assert page.evaluate("localStorage.getItem('aa_secret')") == 'ECHTE-CODE', 'demo wiste de echte koppelcode'
    page.goto('http://127.0.0.1:%d/?demo=1&rol=sophie' % POORT); page.wait_for_selector('#demoBalk select'); rust(page, 800)
    page.once('dialog', lambda d: d.accept()); page.click('#demoBalk button'); rust(page, 1500)
    page.evaluate("localStorage.removeItem('aa_secret')")
    meldingen[:] = [m for m in meldingen if 'Koppelcode' not in m[1]]
    if ALLEEN_ROOK:
        print('\n'.join('%s: %s' % m for m in meldingen) or 'meldingen: geen')
        server.shutdown(); sys.exit(1 if meldingen else 0)

    # school als Capsule-overzicht
    desk(page, 'contacten')
    klik(page, '[data-crm-open="school:s1"]', 1200); shot(page, 'm02_school')
    # projectenbord zoals monday en het project met taskforce en bezetting
    desk(page, 'projecten'); klik(page, '[data-pweergave="bord"]', 900); shot(page, 'm03_projecten_bord')
    klik(page, '[data-pweergave="verlenging"]', 900); shot(page, 'm03b_verlenging')
    klik(page, '[data-pweergave="am"]', 600)
    klik(page, '[data-crm-open="project:t4"]', 1200); shot(page, 'm04_project_historie')
    klik(page, '[data-dtab="taskforce"]', 700); shot(page, 'm04b_project_taskforce')
    klik(page, '[data-dtab="bezetting"]', 700); shot(page, 'm04c_project_bezetting')
    # rapporten: alle teams (v4.4), per team met verloop, een eerdere periode
    desk(page, 'rapporten'); shot(page, 'm05a_rapport_alle_teams')
    klik(page, '#crmBalk [data-rteam="consultancy"]', 1000); shot(page, 'm05d_rapport_verloop', True)
    klik(page, '.periode-nav [data-rstap="-1"]', 1000); shot(page, 'm05e_rapport_vorige_maand')
    klik(page, '[data-crmpreset="schooljaar"]', 1000); shot(page, 'm05_rapport_consultancy')
    klik(page, '#crmBalk [data-rteam="accountmanagement"]', 1000); shot(page, 'm05b_rapport_am')
    klik(page, '#crmBalk [data-rteam="talent"]', 1000); shot(page, 'm05c_rapport_talent')
    # meldingen (de bel)
    desk(page, 'home'); klik(page, '#zbMeld', 900); shot(page, 'm06_meldingen')
    page.keyboard.press('Escape'); rust(page, 300)
    # assistent: vraag en voorgestelde actie
    desk(page, 'brein')
    page.fill('#vraagInput', 'Maak een taak om de administratie van Kompas College terug te bellen over de factuur'); page.click('#vraagKnop')
    page.wait_for_selector('.actiekaart'); rust(page, 600); shot(page, 'm07_assistent_actie')
    page.locator('.actiekaart [data-ak="uitvoeren"]').first.click(); page.wait_for_selector('.actiekaart.uitgevoerd'); rust(page, 500); shot(page, 'm07b_assistent_uitgevoerd')
    ctx.close()

    # ---- Desktop, andere rollen ----
    for rol, schermen in [('femke', ['home', 'projecten', 'facturatie']), ('bas', ['home', 'rapporten']), ('lars', ['home', 'pipeline']), ('sem', ['home', 'bezetting', 'doelen'])]:
        ctx, page = open_rol(b, rol)
        for item in schermen:
            if item != 'home': desk(page, item)
            shot(page, 'r_%s_%s' % (rol, item))
        ctx.close()

    # ---- Telefoon ----
    for rol, views in [('sophie', ['vandaag', 'trajecten']), ('femke', ['vandaag', 'trajecten']), ('sem', ['vandaag'])]:
        ctx, page = open_rol(b, rol, telefoon=True)
        for v in views:
            if v != 'vandaag': klik(page, 'nav button[data-view="%s"]' % v, 1000)
            shot(page, 't_%s_%s' % (rol, v))
        ctx.close()
    server.shutdown()
print('\n'.join('%s: %s' % m for m in meldingen) or 'meldingen: geen')
