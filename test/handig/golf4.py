# v7.3 (H4/H5 uit docs/robuust-v7.2.md §5): elke handeling die in test/shots/robuust/handelingen.json nog "zonder test" stond, één keer
# uitvoeren in de demo en een zichtbaar effect controleren: alle verwijder- en stopknoppen (confirm), de Exact-flow met het voorbeeldbestand,
# facturatie-export, beheer (codes, actief, tracks, lijsteditor), huisstijl (kopiëren, velden), talent (status, peiling, documenten, relaties,
# export, forceer, anonimiseren), desktop (bulk, tijdlijngreep, doelpreset, agenda, zoekvak) en de telefoon (snelinvoer met keuzechip, naar
# facturatie, CSV in twee tikken). Daarbij de DEK-8-controle: een document "in aanvraag" krijgt de klasse in-aanvraag en een oranje achtergrond.
# De selectors staan letterlijk (als `data-…`) in dit bestand: test/handelingen.js grept ze en bewaakt de drempel (hoogstens 20 zonder test).
# Gebruik: python3 test/handig/golf4.py — per controle "ok   …" of "FOUT …", eindigt met ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1).
# Mislukte stappen krijgen een screenshot in test/shots/robuust/golf4_<stap>.png. Eigen server op poort 8781; elke rol begint met een verse
# context (de demo schrijft in sessionStorage), zodat verwijderen veilig is.
#
# Niet rechtstreeks bereikbaar in de demo, hier anders gedaan (met reden):
# - data-weekopnieuw: verschijnt alleen als de week niet laadt. Hier laat de test AthenaDemo.run één keer falen voor apiAgenda (gesimuleerde storing);
#   de echte mockstoring staat in test/test_app.py (H2).
# - data-getal: de demo-Claude geeft alleen het voorstel maak_taak zonder getalveld. Hier krijgt de chat een voorstel met een getalveld via S.chat
#   (dezelfde weg als saveChat/leesChat), zodat Aanpassen → Uitvoeren de komma-naar-getal-omzetting doorloopt.
# - data-walog: de WhatsApp-link opent wa.me in een nieuw venster; de test onderdrukt de navigatie (preventDefault) en controleert alleen de logregel.
# - data-doclink: geen enkel demodocument heeft een bestand; de test voegt eerst een document met een bestand toe (set_input_files) en opent dat.
import os, sys, time, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(R, 'test', 'shots', 'robuust'); os.makedirs(OUT, exist_ok=True)
POORT = 8781
class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=R))
threading.Thread(target=srv.serve_forever, daemon=True).start()
U = 'http://127.0.0.1:%d/?demo=1&kaal=1&rol=' % POORT
START = time.time(); fouten = 0; aantal = 0; pageerrors = []; pg = None; HUIDIG = ''

def ok(naam, v, extra=''):
    global fouten, aantal
    aantal += 1
    print(('ok   ' if v else 'FOUT ') + naam + ((' — ' + str(extra)[:160]) if extra and not v else ''))
    if not v:
        fouten += 1
        try: pg.screenshot(path=os.path.join(OUT, 'golf4_' + HUIDIG + '.png'))
        except Exception: pass
def stap(naam, fn):
    global HUIDIG
    HUIDIG = naam
    try: fn()
    except Exception as e: ok(naam + ' (uitzondering)', False, str(e).split('\n')[0])
def nieuw(b, rol, tel=False):
    c = b.new_context(viewport={'width': 390, 'height': 844} if tel else {'width': 1440, 'height': 900}, is_mobile=tel, has_touch=tel, accept_downloads=True)
    try: c.grant_permissions(['clipboard-read', 'clipboard-write'])
    except Exception: pass
    p = c.new_page(); p.on('pageerror', lambda e: pageerrors.append(rol + ': ' + str(e))); p.on('dialog', lambda d: d.accept())
    p.goto(U + rol); p.wait_for_selector('nav' if tel else '#zijbalk'); p.wait_for_load_state('networkidle'); p.wait_for_timeout(400)
    return c, p
def desk(item, wacht):
    pg.click('.zb-item[data-desk="%s"]' % item); pg.wait_for_selector(wacht); pg.wait_for_timeout(300)
def toast(tekst, ms=5000):
    pg.wait_for_selector('#toast.aan:has-text("%s")' % tekst, timeout=ms); return True
def venster_open(): pg.wait_for_selector('#venster.aan #vensterInhoud', timeout=5000)
def venster_dicht(): pg.wait_for_selector('#venster.aan', state='hidden', timeout=6000)
def opslaan(): pg.click('#venster [data-cf-opslaan]')
def klembord(): return pg.evaluate("navigator.clipboard.readText()")
def detail(hash_):
    pg.evaluate("routeHash(%r)" % hash_); pg.wait_for_selector('#crmDetailScherm .d-naam h2'); pg.wait_for_timeout(500)
def download_via(sel):
    with pg.expect_download(timeout=8000) as dl: pg.click(sel)
    return dl.value.suggested_filename

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')

    # ===== 1. Sophie (management) op desktop: Home, Assistent, Studio, Beheer, Doelen, Agenda, zoekvak =====
    c, pg = nieuw(b, 'sophie')
    def home_concept():  # data-concept draagt data-onderwerp en data-van mee naar de vraag aan de assistent
        k = pg.locator('[data-concept]').first; ond = k.get_attribute('data-onderwerp'); van = k.get_attribute('data-van')
        k.click(); pg.wait_for_selector('#breinBerichten .msg.ik'); pg.wait_for_timeout(600)
        tekst = pg.locator('#breinBerichten .msg.ik').last.inner_text()
        ok('home: Concept-knop vraagt de assistent om de mail (onderwerp en afzender in de vraag)', ond in tekst and van.split('<')[0].strip()[:8] in tekst, tekst[:120])
    stap('home_concept', home_concept)
    def brein_kaart():  # data-akmsg/data-akidx: het voorstel maak_taak uit de demo-Claude, Aanpassen en Uitvoeren
        pg.wait_for_selector('#breinBerichten .msg.bot', timeout=8000); pg.wait_for_timeout(500)
        pg.fill('#vraagInput', 'Maak een taak: administratie bellen'); pg.click('#vraagKnop'); pg.wait_for_selector('.actiekaart[data-akmsg][data-akidx]', timeout=10000)
        pg.click('.actiekaart [data-ak="aanpassen"]'); pg.wait_for_selector('.actiekaart.bewerken [data-akveld="tekst"]')
        pg.fill('.actiekaart.bewerken [data-akveld="tekst"]', 'Administratie Kompas College terugbellen (aangepast)')
        pg.click('.actiekaart.bewerken [data-ak="uitvoeren"]'); toast('Taak aangemaakt')
        ok('assistent: voorstelkaart aanpassen en uitvoeren (data-akmsg/data-akidx)', pg.locator('.actiekaart.uitgevoerd .ak-klaar:has-text("aangepast")').count() == 1)
    stap('brein_kaart', brein_kaart)
    def brein_getal():  # data-getal: een getalveld met komma wordt een getal
        pg.evaluate("S.chat.push({ rol: 'bot', tekst: 'Zal ik dit zo klaarzetten?', acties: [{ soort: 'maak_taak', titel: 'Taak met bedrag', invoer: { tekst: 'Offerte nabellen', bedrag: 100 } }] }); saveChat(); herrenderChat();")
        pg.wait_for_selector('.actiekaart:has-text("Taak met bedrag")'); pg.click('.actiekaart:has-text("Taak met bedrag") [data-ak="aanpassen"]')
        pg.wait_for_selector('.actiekaart.bewerken [data-akveld="bedrag"][data-getal]'); pg.fill('.actiekaart.bewerken [data-akveld="bedrag"][data-getal]', '12,5')
        pg.click('.actiekaart.bewerken [data-ak="uitvoeren"]'); toast('Taak aangemaakt')
        ok('assistent: getalveld "12,5" wordt 12.5 (data-getal)', pg.evaluate("S.chat[S.chat.length - 1].acties[0].invoer.bedrag") == 12.5)
    stap('brein_getal', brein_getal)
    def studio_kopieer():  # data-cid klapt een recente tekst open, data-kopieer zet hem op het klembord
        desk('huisstijl', '#recentContent [data-cid]')
        rij = pg.locator('#recentContent .recent[data-cid]').first; cid = rij.get_attribute('data-cid')
        rij.click(); pg.wait_for_timeout(200)
        ok('studio: tik op een recente tekst klapt hem open (data-cid)', rij.evaluate("e => e.classList.contains('open') && e.querySelector('.c-knoppen').style.display === 'flex'"))
        pg.click('#recentContent [data-kopieer="%s"]' % cid); pg.wait_for_timeout(300)
        verwacht = pg.evaluate("S.huis.recent.filter(function (x) { return x.id === %r; })[0].tekst" % cid)
        ok('studio: Kopieer zet de tekst op het klembord (data-kopieer)', klembord() == verwacht and 'Gekopieerd' in pg.inner_text('#recentContent [data-kopieer="%s"]' % cid))
    stap('studio_kopieer', studio_kopieer)
    def studio_maak():  # data-kopieertekst en data-tekst op de uitvoer van "Maak tekst"
        pg.fill('#contentOnderwerp', 'Start huiswerkbegeleiding'); pg.click('#maakContent'); pg.wait_for_selector('#contentUitvoer [data-kopieertekst]', timeout=10000); pg.wait_for_timeout(300)
        tekst = pg.get_attribute('#contentUitvoer', 'data-tekst')
        pg.click('#contentUitvoer [data-kopieertekst]'); pg.wait_for_timeout(300)
        ok('studio: Kopieer op de nieuwe tekst (data-kopieertekst, data-tekst)', bool(tekst) and klembord() == tekst)
    stap('studio_maak', studio_maak)
    def studio_velden():  # data-huis: alle huisstijlvelden in één verzoek
        pg.click('#huisBewerk'); pg.wait_for_selector('#huisEdit [data-huis="bedrijf"]:visible')
        pg.fill('#huisEdit [data-huis="bedrijf"]', 'AthenaSchool (demo)'); pg.click('#huisOpslaan'); toast('Huisstijl opgeslagen')
        ok('studio: huisstijlveld opgeslagen (data-huis)', pg.evaluate("S.huis.velden.bedrijf") == 'AthenaSchool (demo)')
    stap('studio_velden', studio_velden)
    def studio_weg():  # data-contentweg via Wijzigen → Verwijderen
        n = pg.locator('#recentContent [data-cid]').count(); rij = pg.locator('#recentContent .recent[data-cid]').first; cid = rij.get_attribute('data-cid')
        if not rij.evaluate("e => e.classList.contains('open')"): rij.click(); pg.wait_for_timeout(200)  # de knoppen staan achter de open rij
        pg.click('#recentContent [data-contentbewerk="%s"]' % cid); venster_open()
        pg.click('#venster [data-contentweg="%s"]' % cid); toast('Tekst verwijderd'); venster_dicht()
        ok('studio: tekst verwijderd uit Recent gemaakt (data-contentweg)', pg.locator('#recentContent [data-cid]').count() == n - 1 and pg.locator('#recentContent [data-cid="%s"]' % cid).count() == 0)
    stap('studio_weg', studio_weg)
    def beheer_export():  # data-export: CSV-download uit Beheer
        desk('rapporten', '[data-beheer]')
        naam = download_via('[data-export="scholen"]')
        ok('beheer: CSV scholen gedownload (data-export): %s' % naam, naam.endswith('.csv'))
    stap('beheer_export', beheer_export)
    def beheer_gebruikers():  # data-gcode (confirm) → codekaart met data-kopieercode; data-gactief met data-waarde
        pg.click('[data-beheer="gebruikers"]'); pg.wait_for_selector('#crmBeheer [data-gcode]')
        g = pg.locator('#crmBeheer [data-gcode]').last; gid = g.get_attribute('data-gcode')
        g.click(); pg.wait_for_selector('#crmBeheer .codevak', timeout=6000); code = pg.inner_text('#crmBeheer .codevak').strip()
        ok('beheer: nieuwe koppelcode na bevestiging (data-gcode)', len(code) >= 6)
        pg.click('#crmBeheer [data-kopieercode]'); pg.wait_for_timeout(300)
        ok('beheer: Kopieer zet de code op het klembord (data-kopieercode)', klembord() == code)
        knop = pg.locator('#crmBeheer [data-gactief="%s"]' % gid); waarde = knop.get_attribute('data-waarde')
        knop.click(); pg.wait_for_timeout(1200); pg.wait_for_selector('#crmBeheer [data-gactief="%s"]' % gid)
        na = pg.get_attribute('#crmBeheer [data-gactief="%s"]' % gid, 'data-waarde')
        ok('beheer: gebruiker uit- of ingeschakeld (data-gactief, data-waarde %s → %s)' % (waarde, na), na != waarde and na in ('ja', 'nee'))
    stap('beheer_gebruikers', beheer_gebruikers)
    def beheer_tracks():  # data-trackbewerk kiest een track, data-trackweg verwijdert hem
        pg.click('[data-beheer="tracks"]'); pg.wait_for_selector('#crmBeheer [data-trackbewerk]')
        chips = pg.locator('#crmBeheer [data-trackbewerk]:not([data-trackbewerk=""])'); n = chips.count(); tid = chips.nth(1).get_attribute('data-trackbewerk') if n > 1 else chips.first.get_attribute('data-trackbewerk')
        pg.click('#crmBeheer [data-trackbewerk="%s"]' % tid); pg.wait_for_timeout(300)
        ok('beheer: track gekozen in de editor (data-trackbewerk)', pg.locator('#crmBeheer [data-trackbewerk="%s"].aan' % tid).count() == 1 and pg.input_value('#crmBeheer [data-cf="naam"]') != '')
        pg.click('#crmBeheer [data-trackweg="%s"]' % tid); toast('Track verwijderd')
        ok('beheer: track verwijderd (data-trackweg)', pg.evaluate("CRM.basis.tracks.some(function (t) { return t.id === %r; })" % tid) is False)
    stap('beheer_tracks', beheer_tracks)
    def beheer_lijsteditor():  # data-le-op en data-le-weg in de lijsteditor van de mijlpalen
        pg.click('[data-beheer="mijlpalen"]'); pg.wait_for_selector('#leMijlpalen .le-rij')
        volgorde = lambda: pg.evaluate("[].map.call(document.querySelectorAll('#leMijlpalen .le-rij [data-le=\"mijlpaal\"]'), function (i) { return i.value; })")
        voor = volgorde(); pg.click('#leMijlpalen .le-rij:nth-child(2) [data-le-op]'); na = volgorde()
        ok('beheer: regel omhoog in de lijsteditor (data-le-op)', na[0] == voor[1] and na[1] == voor[0])
        pg.click('#leMijlpalen .le-rij:first-child [data-le-weg]'); ok('beheer: regel weggehaald (data-le-weg)', volgorde() == na[1:])
        pg.click('#crmBeheer [data-cf-annuleer]')
    stap('beheer_lijsteditor', beheer_lijsteditor)
    def doelen():  # data-doelpreset, data-doelinstellen, data-doelweg (confirm)
        desk('doelen', '#deskActies [data-doelpreset]'); pg.wait_for_selector('#doelenInhoud .home-grid')
        pg.click('#deskActies [data-doelpreset="kwartaal"]'); pg.wait_for_timeout(800)
        ok('doelen: periode-chip kiest het kwartaal (data-doelpreset)', pg.locator('#deskActies [data-doelpreset="kwartaal"].aan').count() == 1 and pg.evaluate("DESK.doelPreset") == 'kwartaal')
        pg.click('[data-doelinstellen]'); venster_open(); pg.wait_for_selector('#venster [data-doelweg]')
        ok('doelen: Doelen beheren opent het beheervenster (data-doelinstellen)', 'Doelen' in pg.inner_text('#vensterInhoud .kop'))
        n = pg.locator('#venster [data-doelweg]').count(); did = pg.locator('#venster [data-doelweg]').last.get_attribute('data-doelweg')
        pg.click('#venster [data-doelweg="%s"]' % did); toast('Doel verwijderd'); pg.wait_for_timeout(600)
        ok('doelen: doel verwijderd na bevestiging (data-doelweg)', pg.locator('#venster [data-doelweg]').count() == n - 1)
        pg.keyboard.press('Escape')
    stap('doelen', doelen)
    def agenda():  # data-agdag kiest een dag
        desk('agenda', '.dag[data-agdag]')
        d = pg.locator('.dag[data-agdag]:not(.gekozen):not(.anders)').nth(3); k = d.get_attribute('data-agdag'); d.click(); pg.wait_for_timeout(300)
        ok('agenda: dag gekozen (data-agdag)', pg.locator('.dag.gekozen[data-agdag="%s"]' % k).count() == 1 and k in pg.inner_text('.hkaart .kop').lower() or pg.evaluate("DESK.gekozen") == k)
    stap('agenda', agenda)
    def zoekvak():  # data-zbsluit: een recent bekeken item uit het zoekvak opent en sluit de lijst
        detail('school:s1'); desk('home', '#view-home.actief')
        pg.click('#zbZoek'); pg.wait_for_selector('#zbResultaten.aan [data-zbsluit]')
        pg.click('#zbResultaten [data-zbsluit][data-crm-open="school:s1"]'); pg.wait_for_selector('#crmDetailScherm .d-naam h2'); pg.wait_for_timeout(300)
        ok('zoekvak: recent item opent de school en sluit de lijst (data-zbsluit)', 'Esdoorn' in pg.inner_text('#crmDetailScherm .d-naam h2') and pg.locator('#zbResultaten.aan').count() == 0)
    stap('zoekvak', zoekvak)
    c.close()

    # ===== 2. Sophie op desktop: Taken, Projecten, Facturatie, Financiën (Exact), Bezetting, detailpagina's =====
    c, pg = nieuw(b, 'sophie')
    def taken_mijn():  # data-crmmijn
        desk('taken', 'tr[data-taakbewerk]'); pg.click('[data-taakweergave="alles"]'); pg.wait_for_timeout(400)
        n = pg.locator('tr[data-taakbewerk]').count(); pg.click('#crmBalk [data-crmmijn]'); pg.wait_for_timeout(400)
        ok('taken: Alleen mijn filtert de lijst (data-crmmijn)', pg.locator('#crmBalk [data-crmmijn].aan').count() == 1 and pg.locator('tr[data-taakbewerk]').count() < n)
        pg.click('#crmBalk [data-crmmijn]'); pg.wait_for_timeout(300)
    stap('taken_mijn', taken_mijn)
    def taken_weergave():  # data-weergave-weg (confirm) na data-weergave-opslaan
        pg.click('[data-weergave-opslaan]'); venster_open(); pg.fill('#venster #vf-naam', 'Golf 4'); opslaan(); toast('Weergave opgeslagen'); pg.wait_for_selector('[data-weergave-weg]')
        pg.click('[data-weergave-weg]'); toast('Weergave verwijderd'); pg.wait_for_timeout(300)
        ok('taken: opgeslagen weergave verwijderd (data-weergave-weg)', pg.locator('[data-weergave-weg]').count() == 0)
    stap('taken_weergave', taken_weergave)
    def taken_herhaalstop():  # data-herhaalstop op de herhalende taak tk17
        pg.click('[data-taakweergave="alles"]'); pg.wait_for_selector('tr[data-taakbewerk="tk17"]')
        pg.click('tr[data-taakbewerk="tk17"] td:nth-child(2)'); venster_open(); pg.wait_for_selector('#venster [data-herhaalstop="tk17"]')
        pg.click('#venster [data-herhaalstop="tk17"]'); toast('Herhaling gestopt'); venster_dicht()
        ok('taken: herhaling gestopt, taak blijft staan (data-herhaalstop)', pg.locator('tr[data-taakbewerk="tk17"]').count() == 1 and not pg.evaluate("!!(REG.taak.tk17 && REG.taak.tk17.herhaling)"))
    stap('taken_herhaalstop', taken_herhaalstop)
    def taken_bulk():  # data-bulk: afvinken en wissen vanuit de selectiebalk
        rijen = pg.locator('tr[data-taakbewerk]:visible'); ids = [rijen.nth(i).get_attribute('data-taakbewerk') for i in range(2)]
        for i in ids: pg.click('tr[data-taakbewerk="%s"] td:nth-child(2)' % i, modifiers=['Control'])
        pg.wait_for_selector('#selectieBalk.aan [data-bulk="af"]'); pg.click('#selectieBalk [data-bulk="af"]'); toast('2 taken afgevinkt'); pg.wait_for_timeout(400)
        ok('taken: bulk afvinken (data-bulk)', all(pg.locator('tr[data-taakbewerk="%s"]' % i).count() == 0 for i in ids) and pg.locator('#selectieBalk.aan').count() == 0)
        rijen = pg.locator('tr[data-taakbewerk]:visible'); pg.click('tr[data-taakbewerk="%s"] td:nth-child(2)' % rijen.first.get_attribute('data-taakbewerk'), modifiers=['Control'])
        pg.wait_for_selector('#selectieBalk.aan [data-bulk="wis"]'); pg.click('#selectieBalk [data-bulk="wis"]'); pg.wait_for_timeout(200)
        ok('taken: Wissen maakt de selectie leeg (data-bulk)', pg.locator('#selectieBalk.aan').count() == 0 and pg.locator('.gekozen').count() == 0)
    stap('taken_bulk', taken_bulk)
    def taken_week_opnieuw():  # data-weekopnieuw na een gesimuleerde storing (één keer apiAgenda laten falen)
        pg.evaluate("(function () { var D = window.AthenaDemo, o = D.run, n = 0; D.run = function (fn, args) { if (fn === 'apiAgenda' && !n) { n++; return Promise.reject(new Error('storing (test)')); } return o.apply(this, arguments); }; })()")
        pg.click('[data-taakweergave="week"]'); pg.wait_for_selector('[data-weekopnieuw]', timeout=8000)
        ok('taken: week toont Opnieuw proberen bij een storing', pg.locator('.weekblok').count() == 0)
        pg.click('[data-weekopnieuw]'); pg.wait_for_selector('.weekblok', timeout=8000)
        ok('taken: Opnieuw proberen laadt de week (data-weekopnieuw)', pg.locator('.weekblok').count() == 7 and pg.locator('[data-weekopnieuw]').count() == 0)
    stap('taken_week_opnieuw', taken_week_opnieuw)
    def taken_kies():  # data-snel="form" en data-kies in het taakformulier (desktop: inline boven de lijst): #college past op meer scholen, de chip laat kiezen
        pg.click('#deskActies [data-crmnieuw="taak"]'); pg.wait_for_selector('#crmNieuw [data-snel="form"]')
        pg.fill('#crmNieuw [data-snel="form"]', 'Bel de rector #college morgen om 10:00'); pg.wait_for_selector('#crmNieuw .p-chip [data-kies]')
        n = pg.locator('#crmNieuw .p-chip [data-kies]').count(); keuze = pg.locator('#crmNieuw .p-chip [data-kies]').first.get_attribute('data-kies')
        pg.click('#crmNieuw .p-chip [data-kies="%s"]' % keuze); pg.wait_for_timeout(200)
        soort, kid = keuze.split(':')  # een project vult project én school, een school alleen de school
        gevuld = pg.input_value('#crmNieuw [data-cf="trajectId"]') == kid and pg.input_value('#crmNieuw [data-cf="schoolId"]') != '' if soort == 'project' else pg.input_value('#crmNieuw [data-cf="schoolId"]') == kid
        ok('taak: twijfelchips voor #college (%d) en de keuze %s vult de velden (data-kies, data-snel)' % (n, keuze), n >= 2 and pg.locator('#crmNieuw .p-chip [data-kies]').count() == 0 and gevuld and pg.input_value('#crmNieuw [data-cf="tijd"]') == '10:00')
        pg.click('#crmNieuw [data-cf-annuleer]')
    stap('taken_kies', taken_kies)
    def projecten_groep():  # data-pgroep klapt een groep dicht en open
        desk('projecten', '[data-pgroep]'); g = pg.locator('h3[data-pgroep]').first; sleutel = g.get_attribute('data-pgroep')
        had = pg.locator('h3[data-pgroep="%s"] + .tabel-scroll' % sleutel).count() == 1
        g.click(); pg.wait_for_timeout(300); dicht = pg.locator('h3[data-pgroep="%s"] + .tabel-scroll' % sleutel).count() == 0
        pg.click('h3[data-pgroep="%s"]' % sleutel); pg.wait_for_timeout(300)
        ok('projecten: groep dicht- en openklappen (data-pgroep)', had and dicht and pg.locator('h3[data-pgroep="%s"] + .tabel-scroll' % sleutel).count() == 1)
    stap('projecten_groep', projecten_groep)
    def projecten_greep():  # data-tlgreep: aan de rechterrand trekken verlengt alleen het eind
        pg.click('[data-pweergave="tijdlijn"]'); pg.wait_for_selector('.tl-balk[data-tlbalk] [data-tlgreep="r"]')
        bal = pg.locator('.tl-balk[data-tlbalk]').first; pid = bal.get_attribute('data-tlbalk'); voor = pg.evaluate("(function (t) { return [t.start, t.eind]; })(projectenLokaal(%r)[0])" % pid)
        g = pg.locator('[data-tlbalk="%s"] [data-tlgreep="r"]' % pid); a = g.bounding_box(); baan = pg.evaluate("document.querySelector('[data-tlbalk=\"%s\"]').parentNode.getBoundingClientRect().width" % pid)
        x, y = a['x'] + a['width'] / 2, a['y'] + a['height'] / 2; pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 12 * baan / 365.0, y, steps=8); pg.mouse.up(); pg.wait_for_timeout(1500)
        na = pg.evaluate("(function (t) { return [t.start, t.eind]; })(projectenLokaal(%r)[0])" % pid)
        ok('projecten: rechtergreep verlengt alleen het eind (data-tlgreep) %s → %s' % (voor, na), na[0] == voor[0] and na[1] > voor[1])
    stap('projecten_greep', projecten_greep)
    def facturatie():  # data-factmijn, data-factexport (download op desktop), data-fveld, data-termijnen, data-factuurweg
        desk('facturatie', '[data-factopen]')
        n = pg.locator('tr:has([data-factopen])').count(); pg.click('#factBalk [data-factmijn]'); pg.wait_for_timeout(400)
        ok('facturatie: Alleen mijn (data-factmijn)', pg.locator('#factBalk [data-factmijn].aan').count() == 1 and pg.locator('tr:has([data-factopen])').count() <= n)
        pg.click('#factBalk [data-factmijn]'); pg.wait_for_timeout(300)
        naam = download_via('#deskActies [data-factexport="aangemaakt"]')
        ok('facturatie: CSV voor Exact gedownload (data-factexport): %s' % naam, naam.endswith('.csv'))
        pg.click('[data-factopen="t6"]'); pg.wait_for_selector('tr.f-sub [data-fveld="bijzonderheden"]')
        f = pg.locator('tr.f-sub [data-fveld="bijzonderheden"]').first; fid = f.evaluate("e => e.getAttribute('data-fid')")
        f.fill('Golf 4 controle'); f.press('Tab'); pg.wait_for_timeout(900)
        ok('facturatie: termijnveld opgeslagen (data-fveld)', pg.evaluate("(factuurLokaal(%r) || {}).bijzonderheden" % fid) == 'Golf 4 controle')
        voor = pg.locator('tr.f-sub [data-factuurweg]').count()
        pg.click('tr.f-sub [data-termijnen="t6"]'); venster_open(); pg.wait_for_selector('#venster #vf-per')
        pg.select_option('#venster #vf-per', 'eenmalig'); pg.fill('#venster #vf-bedrag', '1200'); opslaan(); toast('termijnen voor dit project'); venster_dicht(); pg.wait_for_timeout(600)
        na = pg.locator('tr.f-sub [data-factuurweg]').count()
        ok('facturatie: Termijnen maken voegt een termijn toe (data-termijnen) %d → %d' % (voor, na), na == voor + 1)
        pg.click('tr.f-sub [data-factuurweg="%s"]' % fid); toast('Termijn verwijderd'); pg.wait_for_timeout(600)
        ok('facturatie: termijn verwijderd na bevestiging (data-factuurweg)', pg.locator('tr.f-sub [data-factuurweg="%s"]' % fid).count() == 0 and pg.locator('tr.f-sub [data-factuurweg]').count() == na - 1)
    stap('facturatie', facturatie)
    def exact():  # de Exact-flow met het echte voorbeeldbestand: kiezen, controleren, toepassen (confirm)
        desk('financien', '[data-finexact]'); pg.click('[data-finexact]'); venster_open(); pg.wait_for_selector('#venster #vf-exactbestand')
        pg.set_input_files('#venster #vf-exactbestand', os.path.join(R, 'test', 'voorbeelden', 'exact_verkoopfacturen.csv'))
        pg.wait_for_selector('#venster [data-exactcontrole]:not([disabled])'); pg.click('#venster [data-exactcontrole]'); pg.wait_for_selector('#exactUit .kaart', timeout=8000)
        uit = pg.inner_text('#exactUit')
        ok('financiën: Exact-controle koppelt de voorbeeldfacturen op nummer', 'facturen gekoppeld' in uit and '99990001' in uit and not uit.startswith('0 '), uit[:120])
        pg.click('#venster [data-exacttoepassen]'); toast('bijgewerkt uit Exact', 8000); pg.wait_for_selector('#exactUit .kaart:has-text("bijgewerkt.")')
        ok('financiën: Exact toepassen werkt de termijnen bij', pg.locator('#venster [data-exacttoepassen][disabled]').count() == 1)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('exact', exact)
    def bezetting():  # data-bopen, data-kandidaatweg (confirm), data-vacatureweg (confirm; de conceptvacature v7 heeft geen kandidaten)
        desk('bezetting', '[data-bopen]'); n = pg.locator('.vac-kaart').count()
        pg.click('[data-bopen="0"]'); pg.wait_for_timeout(500)
        ok('bezetting: Alle vacatures toont meer kaarten (data-bopen)', pg.locator('[data-bopen="0"].aan').count() == 1 and pg.locator('.vac-kaart').count() >= n)
        k = pg.locator('.r-body.klik[data-kandidaat]').first; kid = k.get_attribute('data-kandidaat'); k.click(); venster_open(); pg.wait_for_selector('#venster [data-kandidaatweg="%s"]' % kid)
        pg.click('#venster [data-kandidaatweg="%s"]' % kid); toast('Kandidaat verwijderd'); venster_dicht(); pg.wait_for_timeout(800)
        ok('bezetting: kandidaat verwijderd na bevestiging (data-kandidaatweg)', pg.locator('[data-kandidaat="%s"]' % kid).count() == 0)
        pg.wait_for_selector('[data-vacature="v7"]'); pg.click('[data-vacature="v7"]'); venster_open(); pg.wait_for_selector('#venster [data-vacatureweg="v7"]')
        pg.click('#venster [data-vacatureweg="v7"]'); toast('Vacature verwijderd'); venster_dicht(); pg.wait_for_timeout(800)
        ok('bezetting: vacature verwijderd na bevestiging (data-vacatureweg)', pg.locator('[data-vacature="v7"]').count() == 0)
    stap('bezetting', bezetting)
    def detail_uitklap():  # data-uitklap: een lange notitie wordt ingekort en klapt open
        detail('school:s1')
        if pg.locator('.t-item.kort [data-uitklap]').count() == 0:
            pg.select_option('#crmDetailScherm [data-logvorm]', 'notitie'); pg.wait_for_selector('#crmComposer [data-cf="tekst"]')
            pg.fill('#crmComposer [data-cf="tekst"]', ('Afspraken over het rooster van periode 2 en de evaluatie met de teamleider. ' * 5).strip())
            pg.click('#crmComposer [data-cf-opslaan]'); toast('vastgelegd'); pg.wait_for_selector('.t-item.kort [data-uitklap]', timeout=8000)
        item = pg.locator('.t-item.kort').first.element_handle(); item.query_selector('[data-uitklap]').click(); pg.wait_for_timeout(200)
        ok('detail: lange tekst klapt open (data-uitklap)', item.evaluate("e => !e.classList.contains('kort')"))
    stap('detail_uitklap', detail_uitklap)
    def detail_track():  # data-trackstop: een track starten en de rest stoppen (confirm)
        pg.click('#crmDetailScherm [data-composer="track"]'); pg.wait_for_selector('#crmComposer [data-cf="trackId"]'); pg.click('#crmComposer [data-cf-opslaan]'); toast('Track gestart'); pg.wait_for_selector('#crmDetailScherm [data-trackstop]', timeout=8000)
        rid = pg.locator('#crmDetailScherm [data-trackstop]').first.get_attribute('data-trackstop')
        pg.click('#crmDetailScherm [data-trackstop="%s"]' % rid); toast('open taken weggehaald'); pg.wait_for_timeout(800)
        ok('detail: rest van de track gestopt (data-trackstop)', pg.locator('#crmDetailScherm [data-trackstop="%s"]' % rid).count() == 0)
    stap('detail_track', detail_track)
    def detail_verwijder():  # data-crmverwijder (confirm) sluit het detail; data-trajectweg via Bewerken van een project
        detail('kans:k6'); naam = pg.inner_text('#crmDetailScherm .d-naam h2')
        pg.click('#crmDetailScherm [data-crmverwijder="kans:k6"]'); toast('Verwijderd'); pg.wait_for_timeout(600)
        ok('detail: kans verwijderd en detail dicht (data-crmverwijder) — %s' % naam, pg.evaluate("document.getElementById('crmDetailScherm').style.display") == 'none')
        detail('project:t8'); pg.click('#crmDetailScherm [data-composer="bewerk"]'); venster_open(); pg.wait_for_selector('#venster [data-trajectweg="t8"]')
        pg.click('#venster [data-trajectweg="t8"]'); toast('Project verwijderd'); venster_dicht(); pg.wait_for_timeout(600)
        ok('detail: project verwijderd via het bewerkvenster (data-trajectweg)', pg.evaluate("document.getElementById('crmDetailScherm').style.display") == 'none')
    stap('detail_verwijder', detail_verwijder)
    c.close()

    # ===== 3. Sophie op desktop: het talentbestand =====
    c, pg = nieuw(b, 'sophie')
    def talent_status():  # data-tstatus filtert de lijst
        desk('talent', '[data-tstatus]'); n = pg.evaluate("TAL.data.talenten.length")
        pg.click('[data-tstatus="slapend"]'); pg.wait_for_timeout(400)
        ok('talent: statuschip filtert (data-tstatus)', pg.locator('[data-tstatus="slapend"].aan').count() == 1 and pg.inner_text('#trajectTelling').startswith('2 van %d' % n))
        pg.click('[data-tstatus=""]'); pg.wait_for_timeout(300)
    stap('talent_status', talent_status)
    def talent_forceer():  # data-talentforceer: tweede profiel met hetzelfde e-mailadres, na de waarschuwing toch aanmaken (vóór een profiel open stond: dan opent het nieuwe profiel)
        pg.click('#deskActies [data-talentnieuw]'); venster_open(); pg.wait_for_selector('#venster #vf-email')
        pg.fill('#venster #vf-voornaam', 'Ali'); pg.fill('#venster #vf-achternaam', 'Yilmaz (2)'); pg.fill('#venster #vf-email', 'ali.yilmaz@mail.example'); opslaan()
        pg.wait_for_selector('#venster [data-talentforceer]', timeout=6000)
        ok('talent: dubbel e-mailadres geeft de waarschuwing met "Toch een nieuw profiel maken"', pg.locator('#venster #dubbelHint [data-crm-open="talent:tl2"]').count() == 1)
        pg.click('#venster [data-talentforceer]'); toast('Talent toegevoegd'); pg.wait_for_selector('#crmDetailScherm .d-naam h2'); pg.wait_for_timeout(400)
        ok('talent: profiel toch aangemaakt (data-talentforceer)', 'Yilmaz (2)' in pg.inner_text('#crmDetailScherm .d-naam h2') and pg.evaluate("TAL.forceer") is True)
    stap('talent_forceer', talent_forceer)
    def talent_walog():  # data-walog logt het WhatsApp-contact op de tijdlijn (de link zelf opent niet in de test)
        detail('talent:tl2'); pg.click('[data-dtab="historie"]'); pg.wait_for_timeout(300); voor = pg.locator('#dTab .t-item').count()
        pg.evaluate("document.querySelector('[data-walog]').addEventListener('click', function (e) { e.preventDefault(); })")
        pg.click('[data-walog="tl2"]'); pg.wait_for_timeout(1200); pg.click('[data-dtab="historie"]'); pg.wait_for_timeout(300)
        ok('talent: WhatsApp-klik staat op de tijdlijn (data-walog)', pg.locator('#dTab .t-item:has-text("WhatsApp geopend")').count() >= 1 and pg.locator('#dTab .t-item').count() == voor + 1)
    stap('talent_walog', talent_walog)
    def talent_peiling():  # data-peiling mail (toast) en link (venster met data-kopieercode)
        pg.click('[data-dtab="beschikbaarheid"]'); pg.wait_for_selector('[data-peiling="mail"]')
        pg.click('[data-peiling="mail"]'); toast('Peilingmail verstuurd'); pg.wait_for_timeout(600)
        ok('talent: peiling gemaild (data-peiling)', 'laatste peiling' in pg.inner_text('#dTab .hint').lower())
        pg.click('[data-peiling="link"]'); venster_open(); pg.wait_for_selector('#venster [data-kopieercode]'); link = pg.get_attribute('#venster [data-kopieercode]', 'data-kopieercode')
        pg.click('#venster [data-kopieercode]'); pg.wait_for_timeout(300)
        ok('talent: portaallink gemaakt en gekopieerd (data-peiling, data-kopieercode)', '?t=' in link and klembord() == link)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('talent_peiling', talent_peiling)
    def talent_relatie():  # data-talentschool (+ Relatie) en data-talentschoolweg (confirm)
        pg.click('[data-talentschool]'); venster_open(); pg.wait_for_selector('#venster #vf-schoolId'); pg.select_option('#venster #vf-schoolId', 's3'); pg.fill('#venster #vf-reden', 'Golf 4'); opslaan(); toast('Relatie opgeslagen'); venster_dicht(); pg.wait_for_selector('[data-talentschoolweg]')
        ok('talent: relatie met een school toegevoegd (data-talentschool)', pg.locator('.blok:has(.blok-kop:has-text("Relaties")) .rij:has-text("Golf 4")').count() == 1)
        rid = pg.locator('[data-talentschoolweg]').first.get_attribute('data-talentschoolweg'); pg.click('[data-talentschoolweg="%s"]' % rid); toast('Relatie verwijderd'); pg.wait_for_timeout(600)
        ok('talent: relatie verwijderd na bevestiging (data-talentschoolweg)', pg.locator('[data-talentschoolweg="%s"]' % rid).count() == 0)
    stap('talent_relatie', talent_relatie)
    def talent_documenten():  # nieuw document met bestand en status in aanvraag → DEK-8-tag, data-doclink, data-talentdocweg (confirm)
        pg.click('[data-dtab="documenten"]'); pg.wait_for_selector('[data-talentdoc="nieuw"]'); voor = pg.locator('#dTab [data-talentdocweg]').count()
        pg.click('[data-talentdoc="nieuw"]'); venster_open(); pg.wait_for_selector('#venster #vf-bestand')
        pg.set_input_files('#venster #vf-bestand', {'name': 'diploma.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 golf4'})
        pg.select_option('#venster #vf-soort', 'diploma'); pg.select_option('#venster #vf-status', 'in aanvraag'); pg.fill('#venster #vf-notitie', 'Golf 4 document'); opslaan(); toast('Document toegevoegd'); venster_dicht(); pg.wait_for_timeout(800)
        rij = pg.locator('#dTab .rij:has-text("Golf 4 document")'); tag = rij.locator('.tag.in-aanvraag')
        gewoon = pg.evaluate("(function () { var s = document.createElement('span'); s.className = 'tag'; document.body.appendChild(s); var k = getComputedStyle(s).backgroundColor; s.remove(); return k; })()")
        kleur = tag.evaluate("e => getComputedStyle(e).backgroundColor") if tag.count() else ''
        ok('DEK-8: document "in aanvraag" krijgt de klasse in-aanvraag en een oranje achtergrond (%s, gewone tag %s)' % (kleur, gewoon), tag.count() == 1 and tag.inner_text() == 'in aanvraag' and kleur == 'rgb(254, 243, 224)' and kleur != gewoon)
        did = rij.locator('[data-talentdocweg]').get_attribute('data-talentdocweg')
        pg.click('#dTab [data-doclink="%s"]' % did); venster_open(); pg.wait_for_selector('#venster a.knop[href*="drive.google.com"]')
        ok('talent: Openen toont de Drive-link in een venster (data-doclink)', True); pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        pg.evaluate("herlaadDetail()"); pg.wait_for_timeout(800); pg.click('[data-dtab="historie"]'); pg.wait_for_timeout(300)  # de logregel komt uit de backend; het profiel opnieuw laden
        ok('talent: het openen staat gelogd op de tijdlijn', pg.locator('#dTab .t-item:has-text("Document geopend")').count() >= 1)
        pg.click('[data-dtab="documenten"]'); pg.wait_for_selector('#dTab [data-talentdocweg="%s"]' % did)
        pg.click('#dTab [data-talentdocweg="%s"]' % did); toast('Document verwijderd'); pg.wait_for_timeout(800)
        ok('talent: document verwijderd na bevestiging (data-talentdocweg)', pg.locator('#dTab [data-talentdocweg="%s"]' % did).count() == 0 and pg.locator('#dTab [data-talentdocweg]').count() == voor)
    stap('talent_documenten', talent_documenten)
    def talent_beoordeling():  # data-beoordeelwijzig (management mag elke beoordeling wijzigen)
        pg.click('[data-dtab="beoordelingen"]'); pg.wait_for_selector('[data-beoordeelwijzig]')
        pg.click('[data-beoordeelwijzig]'); venster_open(); pg.wait_for_selector('#venster .oordeel button.aan')
        ok('talent: Wijzigen opent de beoordeling met het huidige oordeel (data-beoordeelwijzig)', 'Beoordeling wijzigen' in pg.inner_text('#vensterInhoud') and pg.locator('#venster #vf-wederhoor').count() == 1)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('talent_beoordeling', talent_beoordeling)
    def talent_export():  # data-talentexport: inzage-export als download
        detail('talent:tl2'); naam = download_via('[data-talentexport="tl2"]')
        ok('talent: inzage-export gedownload (data-talentexport): %s' % naam, naam.endswith('.json'))
    stap('talent_export', talent_export)
    def talent_forceer_detail():  # v7.3: hetzelfde, maar nú met het profiel van Ali (tl2) open: het nieuwe profiel moet opengaan, niet het oude herladen
        ok('talent: het profiel van Ali Yilmaz staat open', pg.evaluate("CRM.detail && CRM.detail.soort + ':' + CRM.detail.id") == 'talent:tl2')
        pg.click('#deskActies [data-talentnieuw]'); venster_open(); pg.wait_for_selector('#venster #vf-email')
        pg.fill('#venster #vf-voornaam', 'Ali'); pg.fill('#venster #vf-achternaam', 'Yilmaz (3)'); pg.fill('#venster #vf-email', 'ali.yilmaz@mail.example'); opslaan()
        pg.wait_for_selector('#venster [data-talentforceer]', timeout=6000); pg.click('#venster [data-talentforceer]'); toast('Talent toegevoegd'); venster_dicht()
        pg.wait_for_selector('#crmDetailScherm .d-naam h2:has-text("Yilmaz (3)")', timeout=6000); pg.wait_for_timeout(300)
        nieuw_id = pg.evaluate("CRM.detail ? CRM.detail.id : ''")
        ok('talent: na "Toch een nieuw profiel maken" vanuit een open profiel staat het níeuwe profiel open (data-talentforceer, %s)' % nieuw_id,
           'Yilmaz (3)' in pg.inner_text('#crmDetailScherm .d-naam h2') and nieuw_id not in ('', 'tl2') and pg.evaluate("CRM.detail.soort") == 'talent')
    stap('talent_forceer_detail', talent_forceer_detail)
    def talent_anonimiseer():  # data-talentanonimiseer (confirm) als laatste: het profiel verliest zijn naam
        detail('talent:tl21'); pg.click('[data-talentanonimiseer="tl21"]'); toast('Profiel geanonimiseerd'); pg.wait_for_timeout(800)
        ok('talent: profiel geanonimiseerd (data-talentanonimiseer)', 'Smits' not in pg.inner_text('#crmDetailScherm .d-naam h2'))
    stap('talent_anonimiseer', talent_anonimiseer)
    c.close()

    # ===== 4. Femke (accountmanager): haar eigen beoordeling wijzigen, facturatie Alleen mijn =====
    c, pg = nieuw(b, 'femke')
    def femke_beoordeling():
        detail('talent:tl1'); pg.click('[data-dtab="beoordelingen"]'); pg.wait_for_selector('[data-beoordeelwijzig]')
        ok('femke: alleen haar eigen beoordeling heeft Wijzigen', pg.locator('[data-beoordeelwijzig]').count() == 1)
        pg.click('[data-beoordeelwijzig]'); venster_open(); pg.wait_for_selector('#venster #vf-tekst'); pg.fill('#venster #vf-tekst', 'Vast gezicht in de onderbouw; aangepast in golf 4.'); opslaan(); toast('Beoordeling gewijzigd'); venster_dicht(); pg.wait_for_timeout(600)
        ok('femke: beoordeling gewijzigd (data-beoordeelwijzig)', pg.locator('#dTab .rij:has-text("aangepast in golf 4")').count() == 1)
    stap('femke_beoordeling', femke_beoordeling)
    def femke_facturatie():
        desk('facturatie', '[data-factopen]'); pg.click('#factBalk [data-factmijn]'); pg.wait_for_timeout(400)
        groepen = pg.locator('.f-groep h3').count()
        ok('femke: Alleen mijn laat alleen haar projecten over (data-factmijn)', pg.locator('#factBalk [data-factmijn].aan').count() == 1 and groepen >= 1 and pg.locator('.f-groep h3:has-text("Femke")').count() == groepen)
    stap('femke_facturatie', femke_facturatie)
    c.close()

    # ===== 5. Sem (talentscout): DEK-8 op een bestaand document (Ali Yilmaz, vog-tl2 → in aanvraag) =====
    c, pg = nieuw(b, 'sem')
    def sem_dek8():
        pg.evaluate("openTalent('tl2')"); pg.wait_for_selector('#crmDetailScherm .d-naam h2'); pg.click('[data-dtab="documenten"]'); pg.wait_for_selector('#dTab [data-talentdoc="vog-tl2"]')
        pg.click('#dTab [data-talentdoc="vog-tl2"]'); venster_open(); pg.wait_for_selector('#venster #vf-status'); pg.select_option('#venster #vf-status', 'in aanvraag'); opslaan(); venster_dicht(); pg.wait_for_timeout(800)
        tag = pg.locator('#crmDetailScherm #dTab [data-talentdoc="vog-tl2"] .tag.in-aanvraag'); kleur = tag.evaluate("e => getComputedStyle(e).backgroundColor") if tag.count() else ''
        ok('DEK-8 (sem): VOG "in aanvraag" → klasse in-aanvraag, achtergrond %s' % kleur, tag.count() == 1 and tag.inner_text() == 'in aanvraag' and kleur == 'rgb(254, 243, 224)')
    stap('sem_dek8', sem_dek8)
    c.close()

    # ===== 6. Sophie op de telefoon: snelinvoer met keuzechip, naar Facturatie, CSV in twee tikken =====
    c, pg = nieuw(b, 'sophie', True)
    def tel_snel():  # data-snel="actieChip" op Vandaag en data-kies in de chip
        pg.fill('#actieInput[data-snel="actieChip"]', 'Bel de rector #lyceum morgen'); pg.wait_for_selector('#actieChip [data-kies]')
        pg.press('#actieInput', 'Enter'); toast('Tik eerst op de school'); n = pg.locator('#actieChip [data-kies]').count()
        chip = pg.locator('#actieChip [data-kies]').first; keuze = chip.get_attribute('data-kies'); naam = chip.inner_text().strip('#? ')
        chip.click(); pg.wait_for_timeout(200)
        ok('telefoon: #lyceum geeft keuzechips (%d), zonder keuze geen taak, de keuze %s staat in de chip (data-kies)' % (n, keuze), n >= 2 and pg.locator('#actieChip [data-kies]').count() == 0 and naam in pg.inner_text('#actieChip'))
        pg.press('#actieInput', 'Enter'); toast('Taak toegevoegd'); pg.wait_for_timeout(400)
        ok('telefoon: na de keuze maakt Enter de taak (data-snel)', pg.locator('#focusLijst .rij:has-text("Bel de rector")').count() == 1 and pg.input_value('#actieInput') == '')
    stap('tel_snel', tel_snel)
    def tel_facturatie():  # data-naarfacturatie en data-factexport in twee tikken (iOS: delen moet uit een tik komen)
        pg.click('nav button[data-view="trajecten"]'); pg.wait_for_selector('[data-naarfacturatie]'); pg.click('[data-naarfacturatie]'); pg.wait_for_selector('#factBalk [data-factexport]')
        ok('telefoon: knop Facturatie opent het facturatiescherm (data-naarfacturatie)', pg.locator('#view-facturatie.actief').count() == 1)
        pg.click('#factBalk [data-factexport="aangemaakt"]'); toast('Tik nog een keer')
        naam = download_via('#factBalk [data-factexport="aangemaakt"]')
        ok('telefoon: tweede tik bewaart de CSV (data-factexport): %s' % naam, naam.endswith('.csv'))
    stap('tel_facturatie', tel_facturatie)
    c.close()
    b.close()
srv.shutdown()
for e in pageerrors: ok('pageerror: ' + e[:140], False)
print('looptijd: %.1f s · %d controles' % (time.time() - START, aantal))
if fouten: print('FOUTEN: %d' % fouten); sys.exit(1)
print('ALLES GOED')
