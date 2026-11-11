# Browsertest van alle zes schermen tegen test/mock_backend.py (Playwright, Chromium uit /opt/pw-browsers).
# v7.3 (FL-1): de test start de mock zelf op poort 8765 (MOCK_CSP=1) als die poort vrij is en stopt hem aan het eind; draait er al een mock, dan
# zet hij die eerst terug op de seed ({"fn":"_reset"}), zodat een tweede run dezelfde uitgangsstand ziet. Los starten (CLAUDE.md) blijft werken.
# v7.3 (FL-7): eindigt met ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1); een mislukte assert geeft een traceback en exitcode 1.
import os, sys, json, time, atexit, subprocess, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'shots'); os.makedirs(OUT, exist_ok=True)
POORT = 8765; BASIS = 'http://127.0.0.1:%d' % POORT
meldingen = []
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
T0 = time.time()

# ---- v7.3 (FL-1): mock starten of terugzetten ---------------------------------------------------------------------------
def mock_post(body):  # de testhulpen van de mock (_reset, _faal) spreken zonder koppelcode
    with urllib.request.urlopen(urllib.request.Request(BASIS + '/api', data=json.dumps(body).encode(), method='POST'), timeout=5) as r: return json.loads(r.read())
def mock_antwoordt():
    try:
        with urllib.request.urlopen(BASIS + '/api', timeout=1) as r: return r.status == 200 and 'mock' in json.loads(r.read()).get('app', '')
    except Exception: return False
mock_proc = None; KLAAR = {'ok': False}
def _einde():  # bij elk einde, ook na een uitzondering: de eigen mock stoppen en de uitslag afmaken
    if mock_proc is not None:
        try: mock_proc.terminate(); mock_proc.wait(timeout=5)
        except Exception: pass
    if not KLAAR['ok']: print('FOUTEN: 1 (de test brak af met een uitzondering, zie hierboven; %.0f s)' % (time.time() - T0))
atexit.register(_einde)
if mock_antwoordt():
    r = mock_post({'fn': '_reset'})
    if not r.get('ok'): print('FOUT de mock op poort %d kent geen _reset (oude mock?): herstart hem — %s' % (POORT, r)); sys.exit(1)
    print('mock op poort %d draait al: gegevens teruggezet op de seed (%s tabellen)' % (POORT, r.get('tabellen')))
else:
    mock_proc = subprocess.Popen([sys.executable, os.path.join(ROOT, 'test', 'mock_backend.py')], env=dict(os.environ, MOCK_POORT=str(POORT), MOCK_CSP='1'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(50):
        if mock_antwoordt(): break
        time.sleep(0.2)
    else: print('FOUT de mock start niet op poort %d' % POORT); sys.exit(1)
    print('mock gestart op poort %d (MOCK_CSP=1); wordt aan het eind gestopt' % POORT)

API_LOG = []  # v7.3: elk POST /api van de hoofdpagina als {fn, args}, voor de scenario's die tellen welke api's de app aanroept
# v7.8 (review C1/I3): staat de gefocuste optie van de statuskeuzelijst binnen het zichtbare deel van #kpilMenu, en scrolt het menu?
KPIL_IN_BEELD = """() => { var m = document.getElementById('kpilMenu'), o = document.activeElement, mr = m.getBoundingClientRect(), r = o.getBoundingClientRect();
  return { optie: o.getAttribute('data-kkies'), inBeeld: r.top >= mr.top - 0.5 && r.bottom <= mr.bottom + 0.5, scrolt: m.scrollHeight > m.clientHeight, scrollTop: m.scrollTop }; }"""
# v7.8 (review I1): het midden van de eerste kandidaatrij of tabknop die helemaal buiten het open menu ligt (om met de vinger "weg te tikken")
KPIL_WEGTIK = """() => { var m = document.getElementById('kpilMenu').getBoundingClientRect(), l = document.querySelectorAll('.r-body.klik[data-kandidaat], nav button[data-view]');
  for (var i = 0; i < l.length; i++) { var r = l[i].getBoundingClientRect(); if (r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && (r.bottom < m.top || r.top > m.bottom)) return { x: r.left + r.width / 2, y: r.top + r.height / 2, wat: l[i].getAttribute('data-kandidaat') || l[i].getAttribute('data-view') }; } return null; }"""
def log_api(r):
    if r.method == 'POST' and r.url.startswith(BASIS + '/api'):
        try: API_LOG.append(json.loads(r.post_data or '{}'))
        except Exception: pass
def api_vanaf(n, *fns): return [x for x in API_LOG[n:] if x.get('fn') in fns]
def eerste_arg(x): return x['args'][0] if isinstance(x.get('args'), list) and x['args'] and isinstance(x['args'][0], dict) else {}
import datetime as _dt
def dag(n): return (_dt.date.today() + _dt.timedelta(days=n)).isoformat()  # v7.9: datums relatief aan vandaag (zoals de mock)
DIALOGEN = []  # v7.9: elk dialoogtype op de hoofdpagina; verloren gaat niet meer via window.prompt

def sleep_naar(pg, kaart, kolom):  # v6.7: kaart met de muis naar een andere kolom slepen
    a = pg.locator(kaart).bounding_box(); b = pg.locator(kolom).bounding_box()
    pg.mouse.move(a['x'] + 20, a['y'] + 15); pg.mouse.down(); pg.mouse.move(a['x'] + 40, a['y'] + 30, steps=4)
    pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + 80, steps=10); pg.mouse.up(); pg.wait_for_timeout(500)

# ---- v7.3: scenario's voor de gefixte hotspots H2, H3 en H4 (docs/robuust-v7.2.md §5) ---------------------------------------
def scenario_week_opnieuw(pg):
    # v7.3 (H2): de mock laat één apiAgenda-aanroep mislukken → de weekweergave toont "Kon de week niet laden" met Opnieuw proberen
    # (data-weekopnieuw) in plaats van een eeuwige spinner; klikken laadt de week alsnog. Zonder data-weekopnieuw (v4.6) blijft dit hangen.
    assert mock_post({'fn': '_faal', 'args': ['apiAgenda', 1]}).get('ok'), 'de mock kent _faal'
    n0 = len(API_LOG)
    pg.click('[data-weeknav="0"]'); pg.wait_for_selector('#crmInhoud [data-weekopnieuw]')
    assert pg.locator('.weekblok').count() == 0 and pg.locator('#crmInhoud .spinner').count() == 0 and 'Kon de week niet laden' in pg.inner_text('#crmInhoud'), 'bij een fout geen weekblokken en geen spinner, wel de melding'
    assert pg.locator('[data-weeknav]').count() == 3, 'de weeknavigatie blijft staan bij een fout'
    pg.click('#crmInhoud [data-weekopnieuw]'); pg.wait_for_selector('.weekblok'); pg.wait_for_timeout(200)
    assert pg.locator('.weekblok').count() == 7 and pg.locator('[data-weekopnieuw]').count() == 0, 'Opnieuw proberen rendert de week'
    assert len(api_vanaf(n0, 'apiAgenda')) == 2, 'één mislukte en één geslaagde aanroep van apiAgenda: ' + repr([x['fn'] for x in API_LOG[n0:]])
    pg.screenshot(path=OUT + '/15e_taken_week_opnieuw.png', full_page=True)

def scenario_rapport_cache(pg):
    # v7.3 (H3): renderRapport toont .rteams voor het management en haalt de activiteit (apiActiviteiten) uit de cache bij een andere maatstaf
    # (0 extra aanroepen); een andere periode haalt hem precies één keer opnieuw. Wordt gedraaid op het team consultancy, periode maand.
    assert pg.locator('#crmBalk .rteams').count() == 1 and pg.locator('#crmBalk .rteams [data-rteam]').count() == 4, '.rteams voor het management: Alle teams en drie teams'
    n0 = len(API_LOG)
    pg.click('#crmInhoud [data-rmetric="conversie"]'); pg.wait_for_selector('#crmInhoud .kop:has-text("Verloop") small:has-text("Conversie")'); pg.wait_for_selector('#rapportActiviteit .t-item'); pg.wait_for_timeout(400)
    assert len(api_vanaf(n0, 'apiActiviteiten')) == 0, 'een andere maatstaf haalt de activiteit niet opnieuw op (cache): ' + repr([x['fn'] for x in API_LOG[n0:]])
    n1 = len(API_LOG)
    pg.click('[data-crmpreset="kwartaal"]'); pg.wait_for_selector('.periode-nav .p-label:has-text("Q4")'); pg.wait_for_selector('#rapportActiviteit .t-item'); pg.wait_for_timeout(400)
    n_act = len(api_vanaf(n1, 'apiActiviteiten'))
    assert n_act == 1, 'een andere periode haalt de activiteit één keer opnieuw op, kreeg %d: %s' % (n_act, repr([x['fn'] for x in API_LOG[n1:]]))
    assert pg.locator('#crmBalk .rteams .chip.aan[data-rteam="consultancy"]').count() == 1, 'het gekozen team blijft aan na de periodewissel'
    pg.click('[data-crmpreset="maand"]'); pg.wait_for_selector('#crmInhoud .kop:has-text("Verloop per maand")'); pg.wait_for_selector('#rapportActiviteit .t-item')  # terug naar maand voor de stappen hierna

def scenario_venster_boven_composer(pg):
    # v7.3 (H4): opslaan vanuit een bewerkvenster bóven een gevulde inline composer in het schooldetail: het venster voert zíjn actie uit
    # (VENSTER.actie → apiTaakOpslaan met het id van de taak) en niet die van de composer (formActie → apiActiviteitToevoegen); daarna slaat de
    # composer de notitie op via zijn eigen api en staat de activiteit in de tijdlijn. Zonder de v3.7-fix deelden venster en pagina één formActie.
    # Na het opslaan hertekent de app het hele detail (taakLokaal → herteken → renderDetail); sinds v7.3 bewaart composerBewaar/composerHerstel de open
    # composer met zijn tekst over dat hertekenen heen (zonder die fix kwam de composer leeg terug en was de half getypte notitie weg).
    pg.select_option('[data-logvorm]', 'notitie'); pg.wait_for_selector('#crmComposer #cf-tekst'); pg.fill('#crmComposer #cf-tekst', 'Notitie begonnen vóór het venster')
    n0 = len(API_LOG)
    pg.locator('#crmDetailScherm [data-taakbewerk="tk3b"]').click(); pg.wait_for_selector('#venster.aan #vf-tekst')
    assert pg.input_value('#venster #vf-tekst') == 'Zaal reserveren', 'het venster toont de subtaak'
    pg.fill('#venster #vf-tekst', 'Zaal reserveren (uit het venster)'); pg.click('#venster [data-cf-opslaan]')
    pg.wait_for_selector('#venster.aan', state='detached'); pg.wait_for_selector('#toast.aan:has-text("Taak opgeslagen")'); pg.wait_for_selector('#crmDetailScherm .rij:has-text("(uit het venster)")')
    pg.wait_for_timeout(300)
    aanroepen = [(x['fn'], eerste_arg(x).get('id')) for x in api_vanaf(n0, 'apiTaakOpslaan', 'apiActiviteitToevoegen')]
    assert aanroepen == [('apiTaakOpslaan', 'tk3b')], 'het venster slaat alleen de taak op, de notitie niet: ' + repr(aanroepen)
    assert pg.locator('#crmComposer #cf-tekst').count() == 1, 'de composer staat na het opslaan van de taak nog open (v7.3: composerHerstel na renderDetail)'
    assert pg.input_value('#crmComposer #cf-tekst') == 'Notitie begonnen vóór het venster', 'de notitietekst staat na het opslaan van de taak nog in de composer: ' + repr(pg.input_value('#crmComposer #cf-tekst'))
    assert pg.get_attribute('#crmComposer', 'data-soort') == 'log:notitie' and pg.locator('#venster.aan').count() == 0, 'de herstelde composer is dezelfde soort en het venster is dicht'
    n1 = len(API_LOG)
    pg.click('#crmComposer [data-cf-opslaan]'); pg.wait_for_selector('.t-item:has-text("Notitie begonnen vóór het venster")'); pg.wait_for_timeout(200)
    aanroepen = [(x['fn'], eerste_arg(x).get('tekst')) for x in api_vanaf(n1, 'apiTaakOpslaan', 'apiActiviteitToevoegen')]
    assert aanroepen == [('apiActiviteitToevoegen', 'Notitie begonnen vóór het venster')], 'de composer slaat de notitie op via zijn eigen api: ' + repr(aanroepen)
    assert pg.locator('#crmComposer #cf-tekst').count() == 0, 'de composer sluit na het opslaan'

def scenario_nieuw_naast_venster(pg):
    # v7.3 (H4): het formulier op de pagina (#crmNieuw, nieuwe taak) overleeft een bewerkvenster dat ernaast opent én opslaat, en houdt zijn eigen
    # Opslaan-actie: eerst slaat het venster tk2 op (met id), daarna maakt het paginaformulier de nieuwe taak (zonder id, met de getypte tekst).
    pg.click('[data-crmnieuw="taak"]'); pg.wait_for_selector('#crmNieuw #cf-tekst'); pg.fill('#crmNieuw #cf-tekst', 'Half getypte taak naast het venster')
    n0 = len(API_LOG)
    pg.click('[data-taakbewerk="tk2"]'); pg.wait_for_selector('#venster.aan #vf-tekst'); pg.fill('#venster #vf-tekst', 'Kennismakingsmail Montessori Demo (venster)'); pg.click('#venster [data-cf-opslaan]')
    pg.wait_for_selector('#venster.aan', state='detached'); pg.wait_for_selector('#crmInhoud .rij:has-text("(venster)")')
    assert pg.input_value('#crmNieuw #cf-tekst') == 'Half getypte taak naast het venster', 'het paginaformulier overleeft het venster met zijn tekst'
    pg.click('#crmNieuw [data-cf-opslaan]'); pg.wait_for_selector('#crmInhoud .rij:has-text("Half getypte taak naast het venster")'); pg.wait_for_timeout(300)
    aanroepen = [(eerste_arg(x).get('id') or None, eerste_arg(x).get('tekst')) for x in api_vanaf(n0, 'apiTaakOpslaan')]
    assert aanroepen == [('tk2', 'Kennismakingsmail Montessori Demo (venster)'), (None, 'Half getypte taak naast het venster')], 'venster en pagina slaan elk hun eigen taak op: ' + repr(aanroepen)
    assert pg.locator('#crmNieuw #cf-tekst').count() == 0, 'het paginaformulier sluit na het opslaan'

def scenario_bezetting_per_project(b):
    # v7.5: Bezetting → Per project, in een eigen context (eigen localStorage, zodat de rest van de test bij Per vacature blijft): één regel per project
    # (een knop in een h3 met aria-expanded, aria-controls en een korte naam via aria-labelledby); tikken klapt de vacatures eronder uit op de plek zelf
    # (dezelfde knop blijft bestaan) met de link naar de projectpagina; de statuspil en "Vacature bewerken" werken in een uitgeklapt project, het project
    # blijft open na het opslaan (bezettingLokaal) en de volgorde verschuift niet; daarna werkt een andere projectweergave (S.trajecten is dan gewist);
    # Tab bereikt de regel, Enter klapt in en Spatie weer uit met de focus op dezelfde knop; Alles uitklappen/inklappen; een zoekterm klapt de passende
    # projecten vanzelf uit en de statusregel zegt hoeveel; na herladen staat de keuze nog (aa_bweergave); een vacature die na het eigen opslaan buiten
    # het filter valt, blijft staan tot de volgende filterkeuze. Werkt op de seed én op de stand aan het eind van deze test.
    c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); pg = c.new_page()
    pg.on('pageerror', lambda e: meldingen.append(('pageerror per project', str(e))))
    pg.goto(BASIS + '/'); pg.wait_for_selector('#apiInput'); pg.fill('#apiInput', BASIS + '/api'); pg.fill('#codeInput', 'test123'); pg.click('#codeOpslaan'); pg.wait_for_selector('#kpis .tegel')
    def naar_bezetting():
        pg.click('nav button[data-view="trajecten"]'); pg.wait_for_selector('#projectWeergaven [data-pweergave="bezetting"]'); pg.click('[data-pweergave="bezetting"]'); pg.wait_for_selector('[data-bweergave="project"]')
        if pg.locator('#projectAms [data-pam=""]:not(.aan)').count(): pg.click('#projectAms [data-pam=""]'); pg.wait_for_timeout(200)  # iedereen: ook het project van Joris (t6)
    naar_bezetting()
    assert pg.locator('[data-bweergave="vacature"].aan').count() == 1 and pg.locator('.bp-rij').count() == 0, 'zonder keuze begint de bezetting bij Per vacature'
    assert pg.locator('[role="group"][aria-label="Weergave"] [data-bweergave]').count() == 3 and pg.get_attribute('[data-bweergave="vacature"]', 'aria-pressed') == 'true' and pg.get_attribute('[data-bopen="1"]', 'aria-pressed') == 'true', 'weergaven en filters in eigen groepen met aria-pressed'
    # v7.5 (iOS-review r3, B): in Per vacature heeft elke kaart van een project een eigen projectlink. Terug van de link op de tweede kaart geeft diezelfde
    # link de focus (in beeld) en de lijst springt niet; ook na project → talent → Terug → Terug (niet de talentlink). De seed heeft geen project met
    # twee vacatures: een kopie van v1 (t4) staat achteraan, na v2 (t6); daarna weer weg. Zonder de fix kreeg de link op de eerste kaart de focus en
    # sprong de lijst daarheen.
    L = '#trajectLijst a[data-crm-open="project:t4"]'
    LPOS = "(function (s) { var m = document.querySelector('main'), mt = m.getBoundingClientRect().top, l = document.querySelectorAll(s), a = document.activeElement, r = a.getBoundingClientRect(); return { st: Math.round(m.scrollTop), eerste: Math.round(l[0].getBoundingClientRect().top - mt), tweede: Math.round(l[1].getBoundingClientRect().top - mt), focusNr: Array.prototype.indexOf.call(l, a), focusW: a.getAttribute('data-crm-open'), binnen: r.top >= mt && r.bottom <= m.getBoundingClientRect().bottom }; })('%s')" % L
    pg.evaluate("S.bezetting.vacatures.push(Object.assign({}, zoekVacature('v1'), { id: 'v1_kopie' })); renderBezetting(); document.getElementById('view-trajecten').style.paddingBottom = '900px'")
    assert pg.locator(L).count() == 2, 'twee kaarten met de link naar t4'
    pg.evaluate("(function (s) { var m = document.querySelector('main'), a = document.querySelectorAll(s)[1]; m.scrollTop += a.getBoundingClientRect().top - m.getBoundingClientRect().top - 120; })('%s')" % L); pg.wait_for_timeout(100)
    v = pg.evaluate(LPOS); assert v['eerste'] < 0 <= v['tweede'] < 600, 'vooraf: de tweede link in beeld, de eerste erboven: ' + repr(v)
    for keten in (False, True):
        pg.locator(L).nth(1).click(); pg.wait_for_selector('#crmDetailScherm .d-naam h2')
        if keten:  # project → talent (Eva de Wit, tab Bezetting) → Terug naar het project
            pg.click('#crmDetailScherm [data-dtab="bezetting"]'); pg.click('#crmDetailScherm a[data-crm-open="talent:tl1"]'); pg.wait_for_function("CRM.detail && CRM.detail.soort === 'talent'")
            pg.click('#crmDetailScherm [data-crm-terug]'); pg.wait_for_function("CRM.detail && CRM.detail.soort === 'project'"); pg.wait_for_selector('#crmDetailScherm .d-naam h2')
        with pg.expect_response(lambda r: r.url.startswith(BASIS + '/api') and 'apiTrajecten' in (r.request.post_data or '')):
            pg.click('#crmDetailScherm [data-crm-terug]')
        pg.wait_for_selector(L); pg.wait_for_timeout(400); n = pg.evaluate(LPOS)
        assert n['focusNr'] == 1 and n['binnen'] and abs(n['st'] - v['st']) <= 1, ('na project → talent → Terug → Terug' if keten else 'na Terug') + ': de focus op de link van de tweede kaart, in beeld, en de lijst springt niet: %r -> %r' % (v, n)
    pg.evaluate("S.bezetting.vacatures = S.bezetting.vacatures.filter(function (v) { return v.id !== 'v1_kopie'; }); document.getElementById('view-trajecten').style.paddingBottom = ''; document.querySelector('main').scrollTop = 0; renderBezetting()")
    pg.click('[data-bweergave="project"]'); pg.wait_for_selector('.bp-rij[data-bproject="t4"]')
    assert pg.locator('[data-bweergave="project"].aan').count() == 1 and pg.get_attribute('[data-bweergave="project"]', 'aria-pressed') == 'true' and pg.locator('.vac-kaart').count() == 0, 'Per project: alles ingeklapt, geen vacaturekaarten'
    n = pg.evaluate("new Set(S.bezetting.vacatures.filter(function (v) { return v.status === 'open' || v.status === 'concept'; }).map(function (v) { return v.project.id; })).size")  # seed: t4 en t6; aan het eind ook het project uit het winformulier
    assert n >= 2 and pg.locator('.bp-rij').count() == n and pg.inner_text('.bp-teller') == '%d projecten' % n and pg.locator('.bp-rij[data-bproject="t6"]').count() == 1, 'een regel per project met de teller: ' + pg.inner_text('.bp-balk')
    assert pg.locator('#trajectLijst .tegels').count() == 0 and 'plekken open' in pg.inner_text('.bp-balk'), 'telefoon: de tegels als één regel in de balk'
    t4 = '.bp-rij[data-bproject="t4"]'
    assert pg.get_attribute(t4, 'aria-expanded') == 'false' and pg.get_attribute(t4, 'aria-controls') == 'bp-t4' and pg.locator('#bp-t4').is_hidden(), 'ingeklapt, aria-controls wijst naar het paneel'
    assert pg.locator('h3.bp-kop > ' + t4).count() == 1 and pg.get_by_role('heading', level=3, name='ISK Voorbeeld').count() == 1, 'elk project is een kop (h3) met de knop erin'
    naam = pg.evaluate("(function (k) { return k.getAttribute('aria-labelledby').split(' ').map(function (i) { return document.getElementById(i).textContent; }).join(' '); })(document.querySelector('%s'))" % t4)
    assert 'ISK Voorbeeld' in naam and 'plekken open' in naam and 'AM' not in naam, 'korte toegankelijke naam (school, project, open plekken): ' + naam
    tekst = pg.inner_text(t4)
    assert 'ISK Voorbeeld' in tekst and ' open' in tekst and 'gevuld' in tekst and 'in proces' in tekst and 'NT2-ondersteuner' in tekst, 'open plekken, gevuld, open functies en kandidaten als tekst in de regel: ' + tekst
    assert pg.locator(t4).bounding_box()['height'] >= 44, 'tikdoel van de projectregel ≥ 44 px'
    pg.evaluate("window.__bp = document.querySelector('%s')" % t4)
    pg.click(t4); pg.wait_for_selector('#bp-t4 .vac-kaart:has-text("NT2-ondersteuner")')
    assert pg.get_attribute(t4, 'aria-expanded') == 'true' and pg.locator('#bp-t4 a[data-crm-open="project:t4"]').count() == 1, 'uitgeklapt, met de link naar de projectpagina'
    assert pg.evaluate("window.__bp === document.querySelector('%s') && window.__bp.isConnected" % t4), 'op de plek zelf uitgeklapt: dezelfde knop (VoiceOver houdt zijn cursor)'
    assert pg.locator('#bp-t4 .vac-kaart a[data-crm-open^="project:"]').count() == 0 and pg.locator('#bp-t6 .vac-kaart').count() == 0, 'de kaarten zonder eigen projectregel; t6 blijft dicht'
    pg.screenshot(path=OUT + '/07i_bezetting_per_project.png', full_page=True)
    volgorde = pg.evaluate("S.bVolgorde.join()")
    with pg.expect_response(lambda r: r.url.startswith(BASIS + '/api') and 'apiKandidaatOpslaan' in (r.request.post_data or '')):
        pg.click('#bp-t4 [data-kpil="c1"]'); pg.wait_for_selector('#kpilMenu [data-kkies]'); pg.click('#kpilMenu [data-kkies="geselecteerd"]')  # v7.8: de statuspil opent een keuzelijst
    pg.wait_for_selector('#bp-t4 .pill.p-geselecteerd[data-kpil="c1"]'); pg.wait_for_timeout(300)
    assert pg.get_attribute(t4, 'aria-expanded') == 'true' and pg.inner_text('#bp-t4 [data-kpil="c1"]').strip() == 'geselecteerd', 'de statuspil slaat op en het project blijft open na bezettingLokaal'
    assert pg.evaluate("S.bVolgorde.join()") == volgorde and pg.evaluate("S.trajecten") is None, 'na het opslaan verschuift er niets (en S.trajecten is gewist)'
    pg.click('#bp-t4 .vac-kaart:has-text("NT2-ondersteuner") [data-vacature]'); pg.wait_for_selector('#venster.aan #vf-titel')
    assert pg.input_value('#venster #vf-titel') == 'NT2-ondersteuner', 'Vacature bewerken opent de vacature uit het uitgeklapte project'
    pg.click('#venster [data-cf-annuleer]'); pg.wait_for_selector('#venster.aan', state='detached')
    # review: zonder S.trajecten werkt een andere projectweergave toch (laadTrajecten), en terug naar Bezetting staat t4 nog open
    pg.click('#projectWeergaven [data-pweergave="lijst"]'); pg.wait_for_selector('#projectWeergaven [data-pweergave="lijst"].aan'); pg.wait_for_selector('#trajectLijst .rij[data-crm-open]')
    pg.click('#projectWeergaven [data-pweergave="bezetting"]'); pg.wait_for_selector(t4 + '[aria-expanded="true"]')
    pg.click('[data-bopen="0"]'); pg.wait_for_selector('[data-bopen="0"].aan'); assert pg.get_attribute(t4, 'aria-expanded') == 'true' and pg.get_attribute('[data-bopen="0"]', 'aria-pressed') == 'true', 'een ander filter laat het project open'
    pg.click('[data-bopen="1"]'); pg.wait_for_selector('[data-bopen="1"].aan')
    pg.click('[data-balles="uit"]'); pg.wait_for_selector('[data-balles="in"]:has-text("Alles inklappen")')
    assert pg.locator('.bp-rij[aria-expanded="true"]').count() == n and pg.locator('#bp-t6 .vac-kaart:has-text("Examentrainer wiskunde")').count() == 1, 'Alles uitklappen'
    assert pg.evaluate("document.activeElement === document.querySelector('[data-balles]') || document.activeElement === document.body"), 'de Alles-knop blijft bestaan (op de plek zelf bijgewerkt)'
    # toetsenbord: Tab vanaf de Alles-knop bereikt de eerste regel; Enter klapt in, Spatie weer uit, en de focus blijft op dezelfde knop
    pg.focus('[data-balles]'); pg.keyboard.press('Tab')
    eerste = pg.evaluate("document.activeElement.getAttribute('data-bproject')"); assert eerste, 'Tab gaat van de Alles-knop naar de eerste projectregel'
    k = '.bp-rij[data-bproject="%s"]' % eerste
    pg.keyboard.press('Enter'); pg.wait_for_selector(k + '[aria-expanded="false"]'); assert pg.locator('#bp-' + eerste).is_hidden(), 'Enter klapt in'
    assert pg.evaluate("document.activeElement.getAttribute('data-bproject')") == eerste and pg.locator('[data-balles="uit"]').count() == 1, 'na Enter staat de focus weer op dezelfde knop; de Alles-knop zegt weer uitklappen'
    pg.keyboard.press('Space'); pg.wait_for_selector(k + '[aria-expanded="true"]')
    assert pg.evaluate("document.activeElement.getAttribute('data-bproject')") == eerste, 'Spatie klapt weer uit, met de focus op dezelfde knop'
    pg.click('[data-balles="in"]'); pg.wait_for_selector('[data-balles="uit"]'); assert pg.locator('.bp-rij[aria-expanded="true"]').count() == 0 and pg.locator('.vac-kaart').count() == 0, 'Alles inklappen'
    # v7.5 (iOS-review r2, punt 1): een open project inklappen terwijl zijn kop bovenaan plakt (halverwege het paneel): daarna staat de regel bovenaan
    # in beeld in plaats van erboven. Een lange lijst eronder is nagebootst met ruimte onder de lijst (anders klemt main de scrollpositie toch al).
    POS = "(function (s) { var m = document.querySelector('main'), k = document.querySelector(s), mt = m.getBoundingClientRect().top; return { st: Math.round(m.scrollTop), rij: Math.round(k.getBoundingClientRect().top - mt), kop: Math.round(k.closest('.bp-kop').getBoundingClientRect().top - mt), wrap: Math.round(k.closest('.bp-project').getBoundingClientRect().top - mt) }; })('%s')"
    pg.evaluate("document.getElementById('view-trajecten').style.paddingBottom = '1500px'")
    pg.click(t4); pg.wait_for_selector(t4 + '[aria-expanded="true"]')
    pg.evaluate("(function () { var m = document.querySelector('main'), p = document.getElementById('bp-t4'); m.scrollTop += p.getBoundingClientRect().top - m.getBoundingClientRect().top + p.offsetHeight / 2; })()"); pg.wait_for_timeout(100)
    v = pg.evaluate(POS % t4)
    assert abs(v['kop']) <= 1 and v['wrap'] < -40, 'vooraf plakt de kop van t4 bovenaan en ligt het begin van het project erboven: ' + repr(v)
    pg.click(t4); pg.wait_for_selector(t4 + '[aria-expanded="false"]'); pg.wait_for_timeout(100)
    n = pg.evaluate(POS % t4)
    assert -1 <= n['rij'] <= 1 and n['st'] < v['st'], 'na inklappen staat de regel bovenaan in beeld: %r -> %r' % (v, n)
    pg.evaluate("document.getElementById('view-trajecten').style.paddingBottom = ''; document.querySelector('main').scrollTop = 0")
    pg.fill('#trajectZoek', 'Eva de Wit'); pg.wait_for_selector(t4 + '[aria-expanded="true"]'); pg.wait_for_timeout(250)  # kandidaat c1, alleen op t4 (Noor Bakker staat aan het eind ook op t4)
    assert pg.locator('.bp-rij').count() == 1 and pg.locator('#bp-t4 .vac-kaart .rij:has-text("Eva de Wit")').count() == 1, 'een zoekterm (ook een kandidaatnaam) klapt het passende project vanzelf uit'
    assert pg.text_content('#bpStatus') == '1 project, uitgeklapt' and pg.get_attribute('#bpStatus', 'role') == 'status' and pg.locator('#trajectLijst #bpStatus').count() == 0, 'de statusregel buiten de lijst zegt hoeveel projecten er overblijven'
    pg.fill('#trajectZoek', ''); pg.wait_for_selector('.bp-rij[data-bproject="t4"]'); pg.wait_for_timeout(250)
    assert pg.locator('.bp-rij[aria-expanded="true"]').count() == 0 and pg.text_content('#bpStatus') == '', 'zonder zoekterm weer ingeklapt'
    assert pg.evaluate("localStorage.getItem('aa_bweergave')") == 'project', 'de keuze staat in localStorage'
    # v7.5 (iOS-review r2, punt 3): Open de projectpagina → Terug zet de scrollpositie terug, houdt de volgorde vast (ook als het project intussen op
    # de projectpagina is ingevuld; nagebootst met het antwoord van de backend, de mock verandert niet) en geeft de link de focus terug, in beeld.
    # Zonder de fix stond main na Terug op 0, was t4 weggefilterd en stond de focus buiten beeld. Het herladen hieronder zet alles weer terug.
    FOCUS = "(function (s) { var a = document.activeElement, m = document.querySelector('main').getBoundingClientRect(), r = a.getBoundingClientRect(); return { link: a.matches(s), binnen: r.top >= m.top && r.bottom <= m.bottom, top: Math.round(r.top - m.top) }; })('%s')"
    pg.evaluate("document.getElementById('view-trajecten').style.paddingBottom = '600px'")
    pg.click(t4); pg.wait_for_selector('#bp-t4 a.bp-link')
    pg.evaluate("(function () { var m = document.querySelector('main'), k = document.querySelector('%s'); m.scrollTop += k.getBoundingClientRect().top - m.getBoundingClientRect().top - 60; })()" % t4); pg.wait_for_timeout(100)
    v = pg.evaluate(POS % t4); volgorde3 = pg.evaluate("S.bVolgorde.join()")
    assert v['st'] > 0, 'vooraf is de lijst gescrold: ' + repr(v)
    pg.click('#bp-t4 a.bp-link'); pg.wait_for_selector('#crmDetailScherm .d-naam h2')
    pg.evaluate("bezettingLokaal({ trajectId: 't4', vacatures: [Object.assign({}, zoekVacature('v1'), { status: 'ingevuld', gevuld: zoekVacature('v1').aantal, inProces: 0 })] })")
    with pg.expect_response(lambda r: r.url.startswith(BASIS + '/api') and 'apiTrajecten' in (r.request.post_data or '')):
        pg.click('#crmDetailScherm [data-crm-terug]')
    pg.wait_for_selector(t4); pg.wait_for_timeout(400)
    n = pg.evaluate(POS % t4); f = pg.evaluate(FOCUS % '#bp-t4 a.bp-link')
    assert pg.evaluate("S.bVolgorde.join()") == volgorde3 and abs(n['st'] - v['st']) <= 1 and abs(n['rij'] - v['rij']) <= 1, 'na Terug dezelfde volgorde en scrollpositie: %r -> %r' % (v, n)
    assert pg.get_attribute(t4, 'aria-expanded') == 'true' and 'vacature ingevuld' in pg.inner_text(t4), 't4 staat er nog, open en met de melding (de volgorde is vastgehouden)'
    assert f['link'] and f['binnen'], 'de focus staat weer op de link naar de projectpagina, in beeld: ' + repr(f)
    # v7.5 (iOS-review r3, A): scrol je na Terug zelf terwijl apiTrajecten nog laadt (nagebootst: 800 ms vertraging in run; Apps Script doet er 1-3 s
    # over), dan zet het antwoord de lijst niet meer terug naar de oude plek. Het gebaar zijn echte touch-events via CDP (veeg omhoog, met momentum).
    # Zonder eigen gebaar zet het antwoord hem wel terug (de stap hierboven). Zonder de fix sprong main na het antwoord terug naar st1.
    pg.evaluate("document.getElementById('view-trajecten').style.paddingBottom = '1500px'")
    pg.evaluate("window.__runOrig = run; run = function (fn) { var a = arguments; return fn !== 'apiTrajecten' ? window.__runOrig.apply(null, a) : new Promise(function (r) { setTimeout(r, 800); }).then(function () { window.__trajKlaar = true; return window.__runOrig.apply(null, a); }); }; window.__trajKlaar = false")
    cdp = c.new_cdp_session(pg); MAIN = "document.querySelector('main')"
    pg.click('#bp-t4 a.bp-link'); pg.wait_for_selector('#crmDetailScherm .d-naam h2')
    with pg.expect_response(lambda r: r.url.startswith(BASIS + '/api') and 'apiTrajecten' in (r.request.post_data or ''), timeout=5000):
        pg.click('#crmDetailScherm [data-crm-terug]'); st1 = pg.evaluate(MAIN + '.scrollTop')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 195, 'y': 600}]})
        for i in range(1, 11): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 195, 'y': 600 - 40 * i}]}); pg.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(100)
        st_eigen = pg.evaluate(MAIN + '.scrollTop'); vroeg = pg.evaluate("!window.__trajKlaar")  # het antwoord is er nog niet
    pg.wait_for_timeout(500); st2 = pg.evaluate(MAIN + '.scrollTop')
    assert vroeg and st_eigen - st1 > 100 and st2 >= st_eigen - 2, 'zelf gescrold tijdens het laden: het antwoord laat de eigen positie staan (na Terug %d, eigen %d, na het antwoord %d)' % (st1, st_eigen, st2)
    assert pg.evaluate("!S.bScroll && !S.bScrollLos"), 'geen terugzet en geen luisteraars meer'
    pg.evaluate("(function () { run = window.__runOrig; })()"); cdp.detach()  # (een uitdrukking die een functie oplevert, roept Playwright aan)
    pg.reload(); pg.wait_for_selector('#kpis .tegel'); naar_bezetting(); pg.wait_for_selector('.bp-rij[data-bproject="t4"]')
    assert pg.locator('[data-bweergave="project"].aan').count() == 1, 'na herladen staat Per project nog aan'
    pg.set_viewport_size({'width': 1280, 'height': 800}); pg.wait_for_selector('body.desk'); pg.click('.zb-item[data-desk="bezetting"]'); pg.wait_for_selector('.bp-rij[data-bproject="t4"]'); pg.wait_for_timeout(200)
    xs = pg.eval_on_selector_all('.bp-rij .bp-hoofd', 'l => l.map(e => Math.round(e.getBoundingClientRect().right))')
    assert len(set(xs)) == 1 and pg.eval_on_selector('.bp-raster', 'e => getComputedStyle(e).display') == 'grid' and pg.locator('#trajectLijst .tegels').count() == 1, 'desktop: de kolommen staan recht onder elkaar (en de tegels staan er): ' + repr(xs)
    pg.click(t4); pg.wait_for_selector('#bp-t4 .vac-grid .vac-kaart'); pg.screenshot(path=OUT + '/26e_desk_bezetting_per_project.png')
    # v7.5 (iOS-review r2, punt 3) ook op desktop: Terug van de projectpagina laat t4 open op zijn plek, met de focus op de link (in beeld)
    volgorde3 = pg.evaluate("S.bVolgorde.join()")
    pg.click('#bp-t4 a.bp-link'); pg.wait_for_selector('#crmDetailScherm .d-naam h2')
    with pg.expect_response(lambda r: r.url.startswith(BASIS + '/api') and 'apiTrajecten' in (r.request.post_data or '')):
        pg.click('#crmDetailScherm [data-crm-terug]')
    pg.wait_for_selector(t4 + '[aria-expanded="true"]'); pg.wait_for_timeout(400); f = pg.evaluate(FOCUS % '#bp-t4 a.bp-link')
    assert f['link'] and f['binnen'] and pg.evaluate("S.bVolgorde.join()") == volgorde3 and pg.locator('.zb-item.aan[data-desk="bezetting"]').count() == 1, 'desktop: na Terug staat t4 open met de focus op de link: ' + repr(f)
    # review: een vacature die na het eigen opslaan vol is (ingevuld) valt buiten "Open en concept", maar blijft tot de volgende filterkeuze staan
    # (nagebootst met het antwoord van de backend, zodat de mock zelf niet verandert; daarna weer opnieuw geladen)
    pg.evaluate("bezettingLokaal({ trajectId: 't4', vacatures: [Object.assign({}, zoekVacature('v1'), { status: 'ingevuld', gevuld: zoekVacature('v1').aantal, inProces: 0 })] })"); pg.wait_for_timeout(200)
    assert pg.evaluate("S.bVolgorde.join()") == volgorde and pg.locator(t4 + '[aria-expanded="true"]').count() == 1 and 'vacature ingevuld' in pg.inner_text(t4) and pg.locator('#bp-t4 .hint:has-text("buiten deze selectie")').count() == 1, 'ingevuld: blijft op zijn plek staan met een melding'
    pg.click('[data-bopen="1"]'); pg.wait_for_timeout(200)
    assert pg.locator(t4).count() == 0, 'bij de volgende filterkeuze valt het ingevulde project weg'
    pg.evaluate("S.bezetting = null; laadBezetting()"); pg.wait_for_selector(t4)
    c.close()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('console', lambda m: meldingen.append((m.type, m.text, m.location.get('url', ''))) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: meldingen.append(('pageerror', str(e))))
    page.on('response', lambda r: meldingen.append(('http', str(r.status) + ' ' + r.url)) if r.status >= 400 else None)
    page.on('request', log_api)  # v7.3
    page.goto('http://127.0.0.1:8765/'); page.wait_for_timeout(800)
    page.screenshot(path=OUT + '/00_koppel.png')
    page.fill('#apiInput', 'http://127.0.0.1:8765/api'); page.fill('#codeInput', 'test123'); page.click('#codeOpslaan')
    page.wait_for_selector('#kpis .tegel'); page.wait_for_timeout(500)
    page.screenshot(path=OUT + '/01_vandaag.png', full_page=True)
    # v7.9 "v7.9 labels" (punt 17): één definitie per naam — contractwaarde (niet omzet) en open waarde (niet "in de pijplijn"); runKern stuurt v mee
    assert page.locator('#kpis .tegel:has-text("Contractwaarde 2026-2027")').count() == 1 and 'open waarde' in page.inner_text('#pijplijn'), 'Vandaag: Contractwaarde en open waarde'
    assert all(x.get('v') == '7.9' for x in API_LOG if x.get('fn') == 'apiOverzicht'), 'runKern stuurt v: APP_VERSIE in de body'
    page.click('[data-klaar="a1"]'); page.wait_for_selector('#toast.aan:has-text("Ongedaan maken")')  # v4.5: afvinken met ongedaan maken
    assert page.locator('[data-klaar="a1"]').count() == 0, 'afgevinkte actie meteen weg'
    # v4.5: snelinvoer in het Nederlands met een chip die laat zien wat begrepen is
    page.fill('#actieInput', 'Bel Marieke morgen om 14:00 !'); page.wait_for_selector('#actieChip span.tijd:has-text("14:00")'); assert page.locator('#actieChip span.prio:has-text("hoog")').count() == 1, 'chip toont de prioriteit'
    page.screenshot(path=OUT + '/02a_vandaag_snelinvoer.png', full_page=True)
    page.press('#actieInput', 'Enter'); page.wait_for_selector('#focusLijst .rij:has-text("Bel Marieke")'); page.wait_for_selector('#toast.aan:has-text("Taak toegevoegd")')
    assert page.input_value('#actieInput') == '' and '14:00' in page.locator('#focusLijst .rij:has-text("Bel Marieke") .r-meta').inner_text(), 'veld leeg, tijd in de regel'
    page.screenshot(path=OUT + '/02_vandaag_na.png', full_page=True)
    page.click('nav button[data-view="brein"]'); page.wait_for_selector('#breinTegels .tegel'); page.wait_for_timeout(300)
    page.fill('#vraagInput', 'Wat is het uurtarief voor huiswerkbegeleiding?'); page.click('#vraagKnop'); page.wait_for_selector('.bron'); page.wait_for_timeout(200)
    # v3.5: assistent met actiekaarten — offerte aanpassen en uitvoeren, taak annuleren
    page.fill('#vraagInput', 'Schrijf offerte onderwijsondersteuning voor Voorbeeldcollege, 2 ondersteuners per dag van 10-16u'); page.click('#vraagKnop')
    page.wait_for_selector('.actiekaart'); assert page.locator('.actiekaart').count() == 2
    kaart = page.locator('.actiekaart').first
    kaart.locator('[data-ak="aanpassen"]').click(); page.locator('.actiekaart').first.locator('[data-akveld="titel"]').fill('Onderwijsondersteuning leerplein')
    page.screenshot(path=OUT + '/03b_brein_aanpassen.png', full_page=True)
    page.locator('.actiekaart').first.locator('[data-ak="uitvoeren"]').click(); page.wait_for_selector('.actiekaart.uitgevoerd')
    assert 'Openen' in page.locator('.actiekaart.uitgevoerd').inner_text()
    page.locator('.actiekaart').nth(1).locator('[data-ak="annuleren"]').click(); page.wait_for_selector('.actiekaart.geannuleerd')
    uit = page.evaluate("JSON.parse(localStorage.getItem('aa_chat')).slice(-1)[0].acties.map(function(a){return a.status + ':' + (a.invoer.titel||'')})")
    assert uit == ['uitgevoerd:Onderwijsondersteuning leerplein', 'geannuleerd:'], uit
    page.screenshot(path=OUT + '/03c_brein_acties.png', full_page=True)
    page.click('[data-typefilter="contract"]'); page.wait_for_timeout(200)
    page.click('[data-typefilter=""]'); page.locator('#docLijst [data-docbewerk]').first.click(); page.wait_for_selector('#venster.aan #vf-type')  # v3.7
    page.select_option('#vf-type', 'voorstel'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#venster.aan', state='detached'); page.wait_for_selector('#toast.aan:has-text("Document bijgewerkt")')
    page.click('[data-typefilter="contract"]'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/03_brein.png', full_page=True)
    page.click('#indexeerKnop'); page.wait_for_timeout(700)
    page.click('nav button[data-view="review"]'); page.wait_for_selector('.quote'); page.wait_for_timeout(200)
    page.click('#reviewEerdere [data-recent]'); page.wait_for_timeout(100)
    page.screenshot(path=OUT + '/04_review.png', full_page=True)
    page.click('#reviewNu'); page.wait_for_timeout(700)
    page.click('nav button[data-view="huisstijl"]'); page.wait_for_selector('.swatch'); page.wait_for_timeout(200)
    page.fill('#contentOnderwerp', 'Start huiswerkbegeleiding op Lyceum Demo'); page.click('#maakContent'); page.wait_for_selector('#contentTekst'); page.wait_for_timeout(400)
    page.screenshot(path=OUT + '/05_huisstijl.png', full_page=True)
    page.locator('#recentContent .recent').first.click(); page.locator('#recentContent [data-contentbewerk]').first.click(); page.wait_for_selector('#venster.aan #vf-tekst')  # v3.7
    page.fill('#vf-tekst', 'Aangepaste tekst uit de test'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#recentContent:has-text("Aangepaste tekst uit de test")')
    page.click('#huisBewerk'); page.fill('#hToon', 'Nieuwe toonregel\nTweede regel'); page.fill('#hBedrijf', 'AthenaSchool BV'); page.click('#huisOpslaan'); page.wait_for_selector('#toast.aan:has-text("Huisstijl opgeslagen")')
    page.screenshot(path=OUT + '/05b_huisstijl_na_bewerken.png', full_page=True)
    page.click('nav button[data-view="trajecten"]'); page.wait_for_selector('[data-crm-open="project:t1"]'); page.wait_for_timeout(200)  # v3.8: projectpagina
    # v4.0: projectenbord zoals monday — eigen bord, iedereen, verlenging, examentraining
    assert page.locator('#projectAms .chip.aan[data-pam="Menno"]').count() == 1, 'begint bij het eigen bord'
    assert page.locator('.p-groep h3:has-text("Lopende projecten")').count() == 1 and page.locator('[data-crm-open="project:t3"]').count() == 0, 'alleen eigen projecten'
    page.screenshot(path=OUT + '/07a_projecten_am.png', full_page=True)
    page.click('#projectAms [data-pam=""]'); page.wait_for_selector('[data-crm-open="project:t3"]')
    page.click('.p-groep h3:has-text("Afgelopen")'); page.wait_for_selector('[data-crm-open="project:t5"]')
    page.click('[data-pweergave="verlenging"]'); page.wait_for_selector('.p-groep h3:has-text("Voorstel verstuurd")'); assert page.locator('[data-crm-open="project:t5"]').count() == 0, 'verlenging: alleen het huidige schooljaar'  # v4.1
    assert 'schooljaar 2026-2027' in page.inner_text('#trajectTelling'), 'telling noemt het schooljaar'
    page.screenshot(path=OUT + '/07b_projecten_verlenging.png', full_page=True)
    page.click('[data-pweergave="examen"]'); page.wait_for_selector('[data-crm-open="project:t6"]'); assert page.locator('[data-crm-open="project:t1"]').count() == 0, 'alleen examentraining'
    page.select_option('[data-pveld="status"][data-pid="t6"]', 'bezig'); page.wait_for_selector('select.pill.p-bezig[data-pid="t6"]')
    page.click('[data-pweergave="am"]'); page.click('#projectAms [data-pam="Menno"]'); page.wait_for_selector('[data-crm-open="project:t1"]')
    # v5.0: het talentbestand op de telefoon (weergave Talent), het profiel met tabs, terug naar de lijst
    page.click('[data-pweergave="talent"]'); page.wait_for_selector('.rij[data-crm-open="talent:tl1"]'); assert page.locator('#trajectLijst .vog').count() >= 1, 'VOG-badge in de lijst'
    page.screenshot(path=OUT + '/07g_talent_lijst.png', full_page=True)
    page.click('.rij[data-crm-open="talent:tl1"]'); page.wait_for_selector('.d-naam h2:has-text("Eva de Wit")'); assert page.locator('[data-dtab="beschikbaarheid"].aan').count() == 1 and page.locator('.raster button').count() == 21, 'profiel opent bij de beschikbaarheid met een raster van 7 × 3'
    page.click('[data-dtab="documenten"]'); page.wait_for_selector('#dTab .rij:has-text("vog")'); page.click('[data-dtab="plaatsingen"]'); page.wait_for_selector('#dTab .rij:has-text("NT2-ondersteuning")')
    page.screenshot(path=OUT + '/07h_talent_profiel.png', full_page=True)
    page.click('[data-crm-terug]'); page.wait_for_selector('#view-trajecten.actief .rij[data-crm-open="talent:tl1"]'); page.click('[data-pweergave="am"]'); page.wait_for_selector('[data-crm-open="project:t1"]')
    # v4.1: bezettingsbord, meldingen, taskforce, vacature en kandidaat
    page.click('[data-pweergave="bezetting"]'); page.wait_for_selector('.vac-kaart:has-text("NT2-ondersteuner")')
    page.click('[data-kpil="c1"]'); page.wait_for_selector('#kpilMenu [data-kkies]'); page.click('[data-kkies="gesprek"]'); page.wait_for_selector('.pill.p-gesprek[data-kpil="c1"]'); page.wait_for_timeout(300)  # v7.8: pil met keuzelijst in plaats van een select
    # v7.8: de keuzelijst met het toetsenbord: Enter opent (focus op de huidige status), ArrowDown, Enter kiest (opslaan, hertekenen, focus terug op de
    # pil); Enter opent weer en Escape sluit zonder een venster te raken, met de focus op de pil; een klik buiten het menu sluit het ook
    page.focus('[data-kpil="c1"]'); page.keyboard.press('Enter'); page.wait_for_selector('#kpilMenu.aan [data-kkies][aria-selected="true"]')
    assert page.get_attribute('[data-kpil="c1"]', 'aria-expanded') == 'true' and page.get_attribute('#kpilMenu', 'role') == 'listbox' and page.evaluate("document.activeElement.getAttribute('data-kkies')") == 'gesprek', 'Enter opent de keuzelijst (listbox) met de focus op de huidige status'
    page.keyboard.press('ArrowDown'); volgende = page.evaluate("document.activeElement.getAttribute('data-kkies')"); assert volgende == 'geselecteerd', 'ArrowDown gaat naar de volgende status: ' + str(volgende)
    with page.expect_response(lambda r: r.url.startswith(BASIS + '/api') and 'apiKandidaatOpslaan' in (r.request.post_data or '')):
        page.keyboard.press('Enter')
    page.wait_for_selector('.pill.p-geselecteerd[data-kpil="c1"]'); page.wait_for_timeout(300)
    assert page.locator('#kpilMenu.aan').count() == 0 and page.evaluate("document.activeElement && document.activeElement.getAttribute('data-kpil')") == 'c1', 'Enter kiest, het menu sluit en de focus staat na het hertekenen weer op de pil'
    page.keyboard.press('Enter'); page.wait_for_selector('#kpilMenu.aan [data-kkies]'); page.keyboard.press('Escape'); page.wait_for_timeout(100)
    assert page.locator('#kpilMenu.aan').count() == 0 and page.get_attribute('[data-kpil="c1"]', 'aria-expanded') == 'false' and page.evaluate("document.activeElement.getAttribute('data-kpil')") == 'c1' and not page.locator('#venster.aan').count(), 'Escape sluit de keuzelijst (geen venster) en zet de focus op de pil'
    page.click('[data-kpil="c1"]'); page.wait_for_selector('#kpilMenu.aan [data-kkies]'); page.mouse.click(195, 30); page.wait_for_timeout(200)
    assert page.locator('#kpilMenu.aan').count() == 0 and page.get_attribute('[data-kpil="c1"]', 'aria-expanded') == 'false', 'een klik buiten het menu sluit het'
    # v7.8 (review I1): een wegtik met de vinger buiten het menu sluit het alleen; de click erachter gaat niet door naar de kandidaatrij of tabknop eronder
    page.click('[data-kpil="c1"]'); page.wait_for_selector('#kpilMenu.aan [data-kkies]'); doel = page.evaluate(KPIL_WEGTIK)
    assert doel, 'een kandidaatrij of tabknop buiten het open menu om op te tikken'
    page.touchscreen.tap(doel['x'], doel['y']); page.wait_for_timeout(400)
    assert page.locator('#kpilMenu.aan').count() == 0 and page.locator('#venster.aan').count() == 0 and page.locator('#view-trajecten.actief').count() == 1, 'de wegtik (op %s) sluit het menu en opent niets eronder' % doel['wat']
    # v7.8 (review C1/I3): op een laag scherm is het menu afgeknipt en scrolt het; de gefocuste optie komt in beeld (End, Home) en bij openen staat de
    # huidige status in beeld, ook een late (reserve: End, ArrowUp, Enter slaat op; daarna terug naar gesprek)
    page.set_viewport_size({'width': 390, 'height': 500}); page.wait_for_timeout(200); page.evaluate("document.querySelector('[data-kpil=\"c1\"]').scrollIntoView({ block: 'center' })")
    page.focus('[data-kpil="c1"]'); page.keyboard.press('Enter'); page.wait_for_selector('#kpilMenu.aan [data-kkies]')
    page.keyboard.press('End'); r = page.evaluate(KPIL_IN_BEELD); assert r['scrolt'] and r['inBeeld'] and r['optie'] == 'afgewezen', 'End: de laatste optie staat in beeld in het scrollende menu: ' + str(r)
    page.keyboard.press('Home'); r = page.evaluate(KPIL_IN_BEELD); assert r['inBeeld'] and r['optie'] == 'voorgesteld' and r['scrollTop'] == 0, 'Home: de eerste optie in beeld, het menu bovenaan: ' + str(r)
    page.keyboard.press('End'); page.keyboard.press('ArrowUp')
    with page.expect_response(lambda r: r.url.startswith(BASIS + '/api') and 'apiKandidaatOpslaan' in (r.request.post_data or '')):
        page.keyboard.press('Enter')
    page.wait_for_selector('.pill.p-reserve[data-kpil="c1"]'); page.wait_for_timeout(300)
    page.keyboard.press('Enter'); page.wait_for_selector('#kpilMenu.aan [data-kkies][aria-selected="true"]'); r = page.evaluate(KPIL_IN_BEELD)
    assert r['scrolt'] and r['inBeeld'] and r['optie'] == 'reserve', 'bij openen staat de huidige status (laat in de lijst) in beeld: ' + str(r)
    page.keyboard.press('Escape'); page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(200)
    assert page.evaluate("kandidaatPil({ id: 'x', naam: 'Test', status: 'gesprek' }, false)") == '<span class="pill kpil-vast p-gesprek"><span class="vh">Status van Test: </span>gesprek</span>', 'zonder wijzigrecht is de status een span zonder aria-label, met de naam als verborgen tekst (review C3/I7; geen rol in de mock heeft kandidatenZien zonder kandidaten, dus direct via kandidaatPil)'
    page.click('[data-kpil="c1"]'); page.wait_for_selector('#kpilMenu [data-kkies]'); page.click('[data-kkies="gesprek"]'); page.wait_for_selector('.pill.p-gesprek[data-kpil="c1"]'); page.wait_for_timeout(300)  # terug naar gesprek voor de rest van de test
    page.screenshot(path=OUT + '/07c_bezetting.png', full_page=True)
    assert page.inner_text('#meldTeller') == '1', 'bel telt ongelezen meldingen'
    page.click('#meldKnop'); page.wait_for_selector('#venster.aan .rij.nieuw[data-crm-open="project:t4"]'); page.screenshot(path=OUT + '/07d_meldingen.png')
    page.click('#venster .rij[data-crm-open="project:t4"]'); page.wait_for_selector('.d-naam h2:has-text("NT2-ondersteuning")'); assert not page.locator('#venster.aan').count(), 'venster dicht na openen melding'
    assert page.locator('#meldTeller').is_hidden(), 'bel leeg na lezen'
    page.click('[data-dtab="taskforce"]'); page.click('[data-taskforce]'); page.wait_for_selector('#venster.aan #vf-hulpvraag')
    page.fill('#vf-hulpvraag', 'NT2-lessen voor de ISK-klassen'); page.fill('#vf-rooster', 'ma t/m do 9-15'); page.locator('#le-tf [data-le="tekst"]').first.fill('Vacature invullen'); page.locator('#le-tf [data-le="eigenaar"]').first.fill('Joris')
    page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('.tf-vraag:has-text("NT2-lessen voor de ISK-klassen")'); page.wait_for_selector('#dTab .rij:has-text("Vacature invullen")')
    page.screenshot(path=OUT + '/07e_taskforce.png', full_page=True)
    page.click('[data-dtab="bezetting"]'); page.click('[data-vacature="nieuw"]'); page.wait_for_selector('#venster.aan #vf-titel'); page.fill('#vf-titel', 'Taalcoach'); page.fill('#vf-aantal', '1'); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('.vac-kaart:has-text("Taalcoach")'); page.locator('.vac-kaart:has-text("Taalcoach") [data-kandidaat="nieuw"]').click(); page.wait_for_selector('#venster.aan #vf-naam')
    page.fill('#vf-naam', 'Ali Bakker'); page.select_option('#vf-bron', 'LinkedIn'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('.vac-kaart:has-text("Ali Bakker")')
    page.locator('.vac-kaart:has-text("Taalcoach") [data-kpil]').click(); page.wait_for_selector('#kpilMenu [data-kkies]'); page.click('[data-kkies="klaar voor start"]')  # v7.8: ook op de projectpagina een pil met keuzelijst
    page.wait_for_selector('.vac-kaart:has-text("Taalcoach") .pill.p-klaar-voor-start[data-kpil]'); page.wait_for_selector('.vac-kaart:has-text("Taalcoach") .vac-teller.vol')
    page.wait_for_timeout(300); assert '1/3' in page.inner_text('[data-dtab="bezetting"]'), 'tab telt de bezetting: ' + page.inner_text('[data-dtab="bezetting"]')
    assert page.evaluate("document.activeElement && document.activeElement.getAttribute('data-kpil')") == page.get_attribute('.vac-kaart:has-text("Taalcoach") [data-kpil]', 'data-kpil'), 'v7.8 (review C5): op de projecttab houdt de statuspil de focus na het kiezen en hertekenen'
    page.locator('.vac-kaart:has-text("Taalcoach") [data-kandidaat]:not([data-kandidaat="nieuw"])').first.click(); page.wait_for_selector('#venster.aan [data-kopieerxps]'); page.click('#venster [data-cf-annuleer]')
    page.screenshot(path=OUT + '/07f_project_bezetting.png', full_page=True)
    assert page.locator('[data-kopieerxpsproject]').count() == 1, 'knop Kopieer voor XPS op het project'  # v4.1
    page.click('[data-crm-terug]'); page.wait_for_selector('#view-trajecten.actief .vac-kaart'); page.click('[data-pweergave="am"]'); page.wait_for_selector('[data-crm-open="project:t1"]')
    page.click('[data-crm-open="project:t1"]'); page.wait_for_selector('.d-naam h2:has-text("Onderwijsondersteuning")')
    page.select_option('.d-links [data-pveld="gefactureerd"]', 'nee'); page.wait_for_selector('.d-links select.pill.p-nee')
    page.select_option('#dTab [data-logvorm]', 'notitie'); page.fill('#crmComposer #cf-tekst', 'Update van de accountmanager'); page.click('#crmComposer [data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("Update van de accountmanager")')  # v7.1: Activiteit loggen is een keuzelijst
    page.locator('[data-koppelmail]').first.click(); page.wait_for_selector('#toast.aan:has-text("gekoppeld")')
    page.locator('[data-termijn="nieuw"]').first.click(); page.wait_for_selector('#venster.aan #vf-omschrijving'); page.fill('#vf-omschrijving', 'Extra workshop'); page.fill('#vf-bedrag', '450'); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('.d-links .rij:has-text("Extra workshop")'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/06_project_detail.png', full_page=True)
    page.click('[data-crm-terug]'); page.wait_for_selector('#view-trajecten.actief [data-crm-open="project:t1"]')
    page.click('[data-pweergave="lijst"]'); page.fill('#trajectZoek', 'demo'); page.wait_for_timeout(200); page.select_option('#fStatus', 'bezig'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/07_trajecten_filter.png', full_page=True)
    page.fill('#trajectZoek', ''); page.select_option('#fStatus', ''); page.wait_for_timeout(100); page.click('[data-pweergave="am"]')
    page.locator('[data-nieuwproject]').first.click(); page.wait_for_selector('#venster.aan #vf-schoolId'); page.select_option('#vf-schoolId', 's2'); page.fill('#vf-traject', 'Surveillance'); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('.d-naam h2:has-text("Surveillance")'); page.click('[data-crm-terug]'); page.wait_for_selector('#view-trajecten.actief')
    page.screenshot(path=OUT + '/08_trajecten_nieuw.png', full_page=True)
    # v2.0: Relaties (CRM)
    page.on('dialog', lambda dl: (DIALOGEN.append(dl.type), dl.accept()))  # v7.9: de prompt bij verloren vervalt (verlorenvenster); alleen confirm blijft
    page.click('nav button[data-view="relaties"]'); page.wait_for_selector('#crmInhoud [data-crm-open="school:s1"]'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/11_relaties_scholen.png', full_page=True)
    page.fill('#crmZoek', 'lyceum'); page.wait_for_timeout(150); assert page.locator('#crmInhoud [data-crm-open^="school:"]').count() == 1, 'zoeken op school'
    page.fill('#crmZoek', ''); page.wait_for_timeout(100)
    page.click('[data-crm-open="school:s1"]'); page.wait_for_selector('.d-naam h2'); page.wait_for_timeout(200)
    # v7.1: één keuzelijst met acht soorten in plaats van de knoppenrij; Afspraak, Taak, Kans en Persoon staan rechts of in hun tab
    assert page.locator('[data-logvorm] option:not([disabled])').count() == 8, 'acht soorten in Activiteit loggen'
    assert page.locator('#dTab .d-acties [data-composer="persoon"], #dTab .d-acties [data-composer="kans"]').count() == 0, 'geen knoppenrij meer in de historie'
    page.select_option('[data-logvorm]', 'call'); page.fill('#cf-onderwerp', 'Evaluatie periode 1'); page.fill('#cf-tekst', 'Tevreden over de ondersteuner.'); page.click('[data-cf-opslaan]')
    page.wait_for_selector('.t-item:has-text("Evaluatie periode 1")'); page.wait_for_timeout(200)
    assert page.locator('.t-item:has-text("Evaluatie periode 1") .t-ic.gesprek').count() == 1 and 'Call' in page.inner_text('.t-item:has-text("Evaluatie periode 1") .r-meta'), 'call telt als gesprek en toont zijn soort'
    page.select_option('[data-logvorm]', 'evaluatie-online'); page.wait_for_selector('#crmComposer #cf-onderwerp'); assert page.input_value('#crmComposer #cf-onderwerp').startswith('Evaluatie'), 'evaluatiegesprek vult het onderwerp'
    page.fill('#crmComposer #cf-tekst', 'Online evaluatie met de directie'); page.click('#crmComposer [data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("Online evaluatie met de directie") .t-ic.afspraak.evaluatie')
    page.locator('.t-item:has-text("Evaluatie periode 1") [data-actbewerk]').click(); page.wait_for_selector('#venster.aan #vf-onderwerp')  # v3.7
    page.fill('#vf-onderwerp', 'Evaluatie periode 1 (bijgesteld)'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("(bijgesteld)")')
    page.screenshot(path=OUT + '/12b_tijdlijn_bewerken.png', full_page=True)
    page.select_option('[data-logvorm]', 'notitie'); page.fill('#crmComposer #cf-tekst', 'Notitie naast het venster')  # v3.7: een open formulier blijft werken na het venster
    page.locator('.t-item [data-actbewerk]').first.click(); page.wait_for_selector('#venster.aan'); page.click('#venster [data-cf-annuleer]')
    page.click('#crmComposer [data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("Notitie naast het venster")')
    scenario_venster_boven_composer(page)  # v7.3 (H4): opslaan vanuit het venster bóven een gevulde composer
    page.screenshot(path=OUT + '/12_school_detail.png', full_page=True)
    page.click('[data-dtab="projecten"]'); page.wait_for_selector('#dTab [data-crm-open^="project:"]'); page.click('[data-dtab="historie"]')  # v3.8: tabs, samenvatting, filters
    page.click('[data-samenvatting]'); page.wait_for_selector('.samenvatting')
    page.select_option('[data-tl="type"]', 'call'); n = page.locator('#tlLijst .t-item').count(); assert n >= 1 and n == page.locator('#tlLijst .t-ic.gesprek').count(), 'filter op soort (v7.1: vorm)'
    page.select_option('[data-tl="type"]', ''); page.fill('[data-tl="zoek"]', 'Tevreden'); page.wait_for_timeout(100); assert page.locator('#tlLijst .t-item').count() == 1, 'zoeken in historie'
    page.fill('[data-tl="zoek"]', '')
    page.click('[data-composer="afspraak"]'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("Gesprek Voorbeeldcollege Zuid")'); page.wait_for_timeout(100)
    page.locator('.t-item:has-text("Gesprek Voorbeeldcollege Zuid") [data-actbewerk]').first.click(); page.wait_for_selector('#venster.aan [data-actweg]'); page.click('#venster [data-actweg]')  # v3.7: verwijderen
    page.wait_for_selector('.t-item:has-text("Gesprek Voorbeeldcollege Zuid")', state='detached')
    page.click('[data-dtab="personen"]'); page.click('#dTab [data-composer="persoon"]'); page.fill('#cf-voornaam', 'Dirk'); page.fill('#cf-achternaam', 'Smit'); page.click('[data-cf-opslaan]'); page.wait_for_timeout(400)  # v7.1: + Persoon staat in de tab
    page.wait_for_selector('#dTab .rij:has-text("Dirk Smit")'); page.click('[data-dtab="historie"]')
    # v3.3: bewerken stuurt alleen gewijzigde velden; een gelijktijdige wijziging van hetzelfde veld geeft een melding
    page.click('[data-composer="bewerk"]'); page.fill('#cf-plaats', 'Schiedam')
    page.evaluate("() => run('apiSchoolOpslaan', { id: 's1', plaats: 'Vlaardingen', _oud: { plaats: 'Rotterdam' } })")  # een collega was net eerder
    page.wait_for_timeout(300); page.click('[data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Intussen gewijzigd")'); page.wait_for_timeout(600)
    assert 'Vlaardingen' in page.inner_text('.d-sub'), 'scherm ververst met de wijziging van de collega'
    page.click('[data-composer="bewerk"]'); page.fill('#cf-bestuur', 'Stichting Nieuw'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.d-sub:has-text("Stichting Nieuw")')
    # v7.9 (punt 6) "v7.9 BRIN in het schoolvenster": een ongeldige BRIN geeft een Nederlandse melding; kleine letters worden hoofdletters, de vestiging 00
    page.click('[data-composer="bewerk"]'); page.fill('#cf-brin', '9z'); page.click('[data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("BRIN-nummer is twee cijfers")')
    page.fill('#cf-brin', '99zq'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.d-links:has-text("99ZQ-00")')
    page.click('[data-archief]'); page.wait_for_selector('#archiefTijdlijn .t-item')
    page.go_back(); page.wait_for_selector('#crmLijstScherm [data-crmtab]'); page.wait_for_timeout(150)
    page.click('[data-crmtab="pipeline"]'); page.wait_for_selector('.kolom'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/13_pipeline.png', full_page=True)
    assert [page.inner_text('#crmInhoud .tegels.drie .tegel:nth-child(%d) .t-label' % i) for i in (1, 2, 3)] == ['Open kansen', 'Open waarde', 'Gewogen pijplijn'], 'v7.9 (punt 17): pipelinebord met open en gewogen'
    page.click('.kaartje[data-crm-open="kans:k1"]'); page.wait_for_selector('[data-kansfase]'); page.wait_for_timeout(150)
    # v7.9 (punt 2) "v7.9 werkelijke datum in de kansdetail": het datumveld staat vóór de keuzelijst (die slaat meteen op); de wissel krijgt die datum en bron detail
    assert page.evaluate("(function () { var d = document.querySelector('[data-kansfasedatum=\"k1\"]'), s = document.querySelector('[data-kansfase=\"k1\"]'); return !!(d && s && (d.compareDocumentPosition(s) & 4)); })()"), 'het datumveld staat vóór de keuzelijst'
    assert page.get_attribute('[data-kansfasedatum="k1"]', 'max') == dag(0) and page.input_value('[data-kansfasedatum="k1"]') == dag(0), 'datumveld: standaard vandaag, max vandaag'
    n0 = len(API_LOG); page.fill('[data-kansfasedatum="k1"]', dag(1)); page.select_option('[data-kansfase]', 'onderhandeling'); page.wait_for_selector('#toast.aan:has-text("in de toekomst")'); page.wait_for_timeout(200)
    assert not api_vanaf(n0, 'apiKansOpslaan') and page.input_value('[data-kansfase]') == 'voorstel', 'een datum in de toekomst: melding zonder aanroep, de keuze terug'
    page.fill('[data-kansfasedatum="k1"]', dag(-1)); n0 = len(API_LOG)
    page.select_option('[data-kansfase]', 'onderhandeling'); page.wait_for_selector('.t-item:has-text("voorstel → onderhandeling")'); page.wait_for_timeout(150)
    w = eerste_arg(api_vanaf(n0, 'apiKansOpslaan')[0]).get('wissel') or {}; assert w.get('datum') == dag(-1) and w.get('bron') == 'detail', 'de wissel krijgt de datum uit het veld en bron detail: %s' % w
    page.wait_for_selector('#toast.aan [data-toastactie="1"]'); assert page.locator('#toast.aan [data-toastactie]').count() == 2 and 'Andere datum' in page.inner_text('#toast [data-toastactie="1"]'), 'de melding heeft Ongedaan maken en Andere datum'
    page.click('#toast.aan [data-toastactie="1"]'); page.wait_for_selector('#venster.aan #vf-datum'); page.fill('#vf-datum', dag(-2)); n0 = len(API_LOG); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Datum van de mijlpaal")')
    a = api_vanaf(n0, 'apiFasewisselDatum'); assert a and a[0]['args'][1] == dag(-2), 'Andere datum roept apiFasewisselDatum aan met de nieuwe datum: %s' % a
    page.wait_for_selector('.fw-lijst [data-fwdatum]'); assert page.locator('.fw-lijst .fw-regel').count() >= 3, 'de kansdetail toont de mijlpalen als gebeurtenissen'
    page.click('[data-composer="track"]'); page.click('[data-cf-opslaan]'); page.wait_for_timeout(500)
    page.screenshot(path=OUT + '/14_kans_detail.png', full_page=True)
    page.click('[data-crm-terug]'); page.wait_for_selector('.kolom'); page.wait_for_timeout(100)
    page.click('[data-crmtab="taken"]'); page.wait_for_selector('[data-taakklaar]'); page.wait_for_timeout(150)
    # v4.5: weergaven zoals Todoist, snelinvoer in de lijst, ongedaan maken, herhalende taken
    page.click('[data-taakweergave="komende"]'); page.wait_for_selector('#crmInhoud .kop.dagkop'); assert page.locator('#crmBalk .chip.aan[data-taakweergave="komende"]').count() == 1, 'weergave Komende met een kop per dag'
    page.screenshot(path=OUT + '/15a_taken_komende.png', full_page=True)
    page.click('[data-taakweergave="alles"]'); page.wait_for_selector('[data-taakklaar="tk1"]')
    page.click('[data-taakklaar="tk1"]'); page.wait_for_selector('#toast.aan:has-text("Ongedaan maken")'); page.click('#toast [data-toastactie]'); page.wait_for_selector('[data-taakklaar="tk1"]')  # ongedaan maken
    page.click('[data-taakklaar="tk1"]'); page.wait_for_selector('#toast.aan:has-text("Ongedaan maken")'); page.wait_for_timeout(200)
    page.click('[data-taakklaar="tk4"]'); page.wait_for_selector('#toast.aan:has-text("Volgende keer")'); assert page.locator('.rij:has-text("Weekstart team") .herhaal').count() == 1, 'herhalende taak krijgt een volgende instantie'
    page.fill('#taakSnel', 'Teamuitje plannen vr 16:00 @afspraak'); page.wait_for_selector('#taakSnelChip span.tijd:has-text("16:00")'); page.press('#taakSnel', 'Enter'); page.wait_for_selector('.rij:has-text("Teamuitje plannen")')
    page.fill('#taakSnel', 'Nog een taak'); page.click('[data-taakweergave="laat"]'); page.wait_for_selector('#crmBalk .chip.aan[data-taakweergave="laat"]')
    assert page.input_value('#taakSnel') == 'Nog een taak', 'de snelinvoer overleeft een hertekening van de lijst'  # v4.5: het veld staat buiten #crmInhoud
    page.fill('#taakSnel', ''); page.click('[data-taakweergave="alles"]'); page.wait_for_selector('[data-taakklaar="tk3"]')
    # v4.6: subtaken onder de hoofdtaak, tags als filter, opgeslagen weergaven, weekweergave
    assert page.locator('.rij.sub:has-text("Datum prikken met Anna")').count() == 1 and 'subtaken' in page.locator('.rij:has-text("Evaluatie periode 1 inplannen") .r-meta').inner_text(), 'subtaken ingesprongen onder de hoofdtaak, met teller'
    assert page.locator('#tfTag').count() == 0, 'filterbalk op de telefoon ingeklapt'; page.click('[data-filtertoon]'); page.wait_for_selector('#tfTag')  # v4.6: filters achter één chip
    page.select_option('#tfTag', 'evaluatie'); page.wait_for_selector('.rij:has-text("Evaluatie periode 1 inplannen")'); page.wait_for_timeout(100)
    assert 'Filter (1)' in page.locator('[data-filtertoon]').inner_text(), 'de chip telt de actieve filters'
    assert page.locator('.rij:has-text("Teamuitje plannen")').count() == 0, 'tagfilter verbergt taken zonder die tag'
    page.click('[data-weergave-opslaan]'); page.wait_for_selector('#venster.aan #vf-naam'); page.fill('#vf-naam', 'Evaluaties'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('.opgeslagen .chip.aan:has-text("Evaluaties")')
    page.select_option('#tfTag', ''); page.wait_for_selector('.rij:has-text("Teamuitje plannen")'); assert page.locator('.opgeslagen .chip.aan').count() == 0, 'een filter wijzigen maakt de opgeslagen weergave niet-actief'
    page.click('.opgeslagen [data-weergave-kies="0"]'); page.wait_for_selector('.opgeslagen .chip.aan'); page.wait_for_timeout(100); assert page.locator('.rij:has-text("Teamuitje plannen")').count() == 0, 'opgeslagen weergave zet het tagfilter terug'
    page.screenshot(path=OUT + '/15c_taken_filter.png', full_page=True)
    page.select_option('#tfTag', ''); page.wait_for_selector('.rij:has-text("Teamuitje plannen")')
    page.click('[data-taakweergave="week"]'); page.wait_for_selector('.weekblok'); page.wait_for_timeout(200); assert page.locator('.weekblok').count() == 7 and page.locator('[data-filtertoon]').count() == 1, 'weekweergave met zeven dagblokken en de filterchip'
    page.select_option('#tfTag', 'evaluatie'); page.wait_for_timeout(200); assert page.locator('.weekblok .rij:has-text("Teamuitje plannen")').count() == 0 and page.locator('.weekblok').count() == 7, 'de weekweergave volgt het tagfilter'; page.select_option('#tfTag', ''); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/15d_taken_week.png', full_page=True)
    page.click('[data-weeknav="1"]'); page.wait_for_selector('.weekblok'); page.click('[data-weeknav="0"]'); page.wait_for_selector('.weekblok'); assert page.locator('.weekblok').count() == 7, 'weeknavigatie'
    scenario_week_opnieuw(page)  # v7.3 (H2): mislukte weekaanroep → Opnieuw proberen
    page.click('[data-taakweergave="alles"]'); page.wait_for_selector('[data-taakklaar="tk3"]')
    scenario_nieuw_naast_venster(page)  # v7.3 (H4): het paginaformulier overleeft een venster dat opslaat
    page.click('[data-crmnieuw="taak"]'); page.fill('#cf-snel', 'Offerte surveillance maken morgen om 11:00'); page.wait_for_timeout(100)
    assert page.input_value('#cf-tekst') == 'Offerte surveillance maken' and page.input_value('#cf-tijd') == '11:00', 'snelinvoer vult de velden van het formulier'
    page.click('[data-cf-opslaan]'); page.wait_for_selector('.rij:has-text("Offerte surveillance maken")'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/15_taken.png', full_page=True)
    page.click('.rij [data-taakbewerk]:has-text("Offerte surveillance maken")'); page.wait_for_selector('#venster.aan #vf-tekst')  # v3.7
    assert page.locator('#venster #vf-kansId').count() == 1 and page.locator('#venster #vf-trajectId').count() == 1 and page.locator('#venster #vf-snel').count() == 0, 'kans en project in het venster; geen snelinvoer bij een bestaande taak'  # v4.5
    page.screenshot(path=OUT + '/15b_taak_venster.png', full_page=True)
    page.fill('#vf-tekst', 'Offerte surveillance versturen'); page.select_option('#vf-prio', 'hoog'); page.fill('#vf-herhaling', 'elke maandag'); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('.rij:has-text("Offerte surveillance versturen") .herhaal', timeout=1500)  # meteen zichtbaar, zonder te herladen; met herhaling
    page.click('[data-taakbewerk="tk1"]'); page.wait_for_selector('#venster.aan [data-taakheropen]'); page.click('[data-taakheropen]'); page.wait_for_selector('[data-taakklaar="tk1"]')
    page.click('[data-taakbewerk="tk2"]'); page.wait_for_selector('#venster.aan [data-taakweg]'); page.click('[data-taakweg]'); page.wait_for_selector('[data-taakbewerk="tk2"]', state='detached')
    page.click('[data-crmtab="rapport"]'); page.wait_for_selector('.tabel'); page.wait_for_timeout(200)
    assert page.locator('#crmInhoud .kop:has-text("Bedrijfsdoelen")').count() == 1, 'bedrijfsdoelen in het rapport'  # v4.2
    page.click('[data-rteam="accountmanagement"]'); page.wait_for_selector('#crmInhoud .tegel:has-text("Bezetting (gevuld van nodig)")')
    page.wait_for_selector('#crmInhoud .rapport-tabel td:has-text("Joris")')  # v4.5: de tegel staat ook in de weergave van alle teams; wacht tot de teamtabel er echt is
    assert page.locator('#crmInhoud .rapport-tabel td:has-text("Joris")').count() == 1, 'per persoon in het AM-team'  # v4.4: Joris staat ook in het verloop
    page.screenshot(path=OUT + '/16a_rapport_am.png', full_page=True)
    page.click('[data-rteam="talent"]'); page.wait_for_selector('#rapportTalent .tegel'); page.wait_for_selector('#rapportTalent .dekking td'); assert page.locator('#rapportTalent .tegel:has-text("VOG op orde")').count() == 1, 'talentrapport met VOG-compliance en dekking'  # v5.0
    page.screenshot(path=OUT + '/16c_rapport_talent.png', full_page=True)
    page.click('[data-rteam="consultancy"]'); page.wait_for_selector('#crmInhoud .kop:has-text("Forecast")')
    page.screenshot(path=OUT + '/16_rapport.png', full_page=True)
    print('horizontale scroll (rapport):', page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    page.wait_for_selector('#rapportActiviteit .t-item')  # v3.3: activiteit per gebruiker
    scenario_rapport_cache(page)  # v7.3 (H3): .rteams en de activiteit-cache in renderRapport
    # v4.4: periodes met stap, verschil met de periode ervoor, verloop per periode en alle teams
    assert page.locator('#crmBalk [data-crmpreset]').count() == 6, 'zes periodes'
    assert page.locator('#crmInhoud .tegel .t-verschil').count() > 0, 'verschil met de vorige periode op de tegels'
    page.wait_for_selector('#crmInhoud .reeks-tabel tr.r-team'); n_rijen = page.locator('#crmInhoud .reeks-tabel tr').count()
    page.click('#crmInhoud [data-rmetric="gewonnenWaarde"]'); page.wait_for_selector('#crmInhoud .kop:has-text("Verloop per maand") small:has-text("Gewonnen waarde")')
    page.click('[data-crmpreset="halfjaar"]'); page.wait_for_selector('.periode-nav .p-label:has-text("helft")')
    assert page.locator('.periode-nav [data-rstap="1"]').is_disabled(), 'niet verder dan nu'
    page.click('.periode-nav [data-rstap="-1"]'); page.wait_for_selector('.periode-nav [data-rstap="nu"]')
    assert '(-1)' in page.locator('.periode-nav .p-label').inner_text(), 'vorige periode'
    page.click('.periode-nav [data-rstap="nu"]'); page.wait_for_selector('.periode-nav [data-rstap="nu"]', state='detached')
    page.click('#crmBalk [data-rteam="alle"]'); page.wait_for_selector('#crmInhoud .alle-team')
    assert page.locator('#crmInhoud .alle-team').count() == 3 and page.locator('#crmREigenaar').count() == 0, 'alle teams naast elkaar, zonder persoonkeuze'
    page.screenshot(path=OUT + '/16b_rapport_alle_teams.png', full_page=True)
    page.click('#crmBalk [data-rteam="consultancy"]'); page.wait_for_selector('#crmInhoud .kop:has-text("Forecast")')
    page.click('[data-crmpreset="maand"]'); page.wait_for_selector('#crmInhoud .kop:has-text("Verloop per maand")')
    # v7.9 "v7.9 Rapporten: weergaven" (punt 19, 8): Teams en Week op de telefoon (MT alleen op desktop); de schakelaar Definities zonder herladen
    assert page.locator('#crmBalk [data-rweergave]').count() == 2 and page.get_attribute('#crmBalk [data-rweergave="teams"]', 'aria-pressed') == 'true' and page.locator('#crmBalk [role="group"] [data-rweergave="week"]').count() == 1, 'weergaven Teams en Week (role=group, aria-pressed)'
    assert page.locator('#crmInhoud .kop:has-text("Open waarde per mijlpaal")').count() == 1, 'v7.9 (punt 17): open waarde per mijlpaal'
    n0 = len(API_LOG); page.click('#crmBalk [data-defs]'); page.wait_for_selector('body.defs-aan .doel-rij .t-def:has-text("contractwaarde")'); assert not api_vanaf(n0, 'apiCijfers', 'apiTeamRapport'), 'Definities aan zonder nieuwe aanroep (het register kwam één keer per sessie)'
    assert len(api_vanaf(0, 'apiCijfers')) == 1 and api_vanaf(0, 'apiCijfers')[0]['args'][0].get('kort') is True, 'het register één keer per sessie, kort'
    # "v7.9 datakwaliteit in Rapporten" (punt 11): per eigenaar, met een doorklik (tabindex 0, role link); management kan opnieuw rekenen
    page.wait_for_selector('#dqBlok'); assert page.locator('.dq-eigenaar').count() >= 1 and page.locator('.dq-regel[data-crm-open][tabindex="0"][role="link"]').count() >= 1, 'datakwaliteit per eigenaar met doorklik'
    page.locator('.dq-eigenaar summary').first.click(); page.click('[data-dqvers]'); page.wait_for_selector('#toast.aan:has-text("opnieuw gerekend")')
    assert eerste_arg({'args': api_vanaf(0, 'apiSturing')[-1]['args'][1:]}).get('vers') is True, 'Nu opnieuw rekenen vraagt vers'
    page.click('#crmBalk [data-rweergave="week"]'); page.wait_for_selector('#crmInhoud .week-kaart'); assert page.locator('#crmInhoud .week-kaart').count() >= 2 and page.locator('#crmInhoud .week-kaart.team').count() == 1, 'Week: per OC een kaart en het teamtotaal'
    assert page.locator('#crmInhoud .week-kaart .t-def:has-text("contactvorm")').count() >= 1 and page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), 'Week: definities zichtbaar, geen horizontale scroll op 390 px'
    page.click('.periode-nav [data-rstap="-1"]'); page.wait_for_selector('.periode-nav [data-rstap="nu"]'); assert api_vanaf(0, 'apiSturing')[-1]['args'][1].get('stap') == -1, 'Week: bladeren naar de vorige week'
    page.click('.periode-nav [data-rstap="nu"]'); page.wait_for_selector('.periode-nav [data-rstap="nu"]', state='detached')
    page.screenshot(path=OUT + '/16d_rapport_week.png', full_page=True)
    page.click('#crmBalk [data-defs]'); page.wait_for_selector('body:not(.defs-aan)'); page.click('#crmBalk [data-rweergave="teams"]'); page.wait_for_selector('#crmInhoud .kop:has-text("Forecast")')
    page.click('[data-beheer="gebruikers"]'); page.wait_for_selector('#cf-naam'); page.fill('#cf-naam', 'Sanne'); page.fill('#cf-email', 'sanne@voorbeeld.nl'); page.select_option('#cf-team', 'consultancy'); page.select_option('#cf-rol', 'teamlead'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.codevak'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/17_beheer_gebruikers.png', full_page=True)
    page.click('[data-gbewerk="g1"]'); page.wait_for_selector('#venster.aan #vf-naam'); page.fill('#vf-naam', 'Mees de Jong'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#crmBeheer:has-text("Mees de Jong")')  # v3.7
    page.click('[data-beheer="keuzelijsten"]'); page.wait_for_selector('#le-schoolStatussen .le-rij'); page.locator('#le-schoolStatussen .le-rij input').first.fill('nieuw'); page.fill('#cf-schooljaar', '2027-2028'); page.click('#crmBeheer [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Keuzelijsten opgeslagen")')
    page.click('[data-beheer="mijlpalen"]'); page.wait_for_selector('#leMijlpalen .le-rij'); page.click('[data-le-erbij="leMijlpalen"]'); inp = page.locator('#leMijlpalen .le-rij').last.locator('input')
    inp.nth(0).fill('Scholen'); inp.nth(1).fill('contract'); inp.nth(2).fill('90'); inp.nth(3).fill('5'); page.screenshot(path=OUT + '/17b_beheer_mijlpalen.png', full_page=True)
    assert page.locator('#leMijlpalen [data-le="rol"]').count() >= 5 and page.locator('#crmBeheer datalist#dl-rollen option').count() == 4, 'v7.9 (punt 3): een kolom Rol met de keuzes lead, ap, ad, voorstel'
    page.click('#crmBeheer [data-cf-opslaan]'); page.wait_for_selector('#venster.aan #vf-onderbouwing')  # v7.9 (N6): een nieuw gewicht vraagt eerst onderbouwing en besluitdatum
    page.fill('#vf-onderbouwing', 'Testgewicht voor de mijlpaal contract'); n0 = len(API_LOG); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Mijlpalen opgeslagen")')
    a = api_vanaf(n0, 'apiMijlpalenOpslaan'); assert a and a[0]['args'][1].get('onderbouwing') and a[0]['args'][1].get('besluitdatum') == dag(0) and all('rol' in m for m in a[0]['args'][0]), 'mijlpalen met rol, onderbouwing en besluitdatum: %s' % a[0]['args'][1]
    page.click('[data-beheer="tags"]'); page.wait_for_selector('#crmBeheer [data-hernoem]')
    page.click('[data-beheer="talentrun"]'); page.wait_for_selector('#toast.aan:has-text("Talentrun klaar")')  # v5.0
    # v7.7: Talenten importeren uit XPS (management via de Beheer-kaart: de uitkomst in een venster)
    assert page.locator('#statusInfo [data-beheer="talentimport"]').count() == 0, 'talentimport: na het sluiten van Instellingen staan de importknoppen niet meer in de DOM (R11)'  # v7.7
    page.click('[data-beheer="talentimport"]'); page.wait_for_selector('#venster.aan #talentImportKaart'); tekst = page.inner_text('#vensterInhoud')
    assert '2 nieuw' in tekst and '1 aangevuld' in tekst and 'conciërge' in tekst and 'xps-diensten-week.csv' in tekst and 'IBAN' in tekst and 'twee keer in het bestand' in tekst, 'talentimport: tellingen, niet herkende functie, overgeslagen urenexport, genegeerde kolom en reden: ' + tekst[:300]
    assert 'account niet actief in XPS' in tekst and 'tegenstrijdig accountnummer' in tekst and 'Gebruikte kolommen' in tekst and 'Mobiel' in tekst and 'Pien van der Berg' in tekst, 'talentimport: niet actief, conflict met lijst en gebruikte kolommen (B1, B3, B4): ' + tekst[:400]  # v7.7
    page.click('#venster [data-cf-annuleer]'); page.wait_for_selector('#venster.aan', state='hidden')
    page.click('[data-beheer="doelen"]'); page.wait_for_selector('#venster.aan [data-doelbewerk]'); page.locator('[data-doelbewerk]').first.click(); page.wait_for_selector('#venster.aan #vf-doel'); page.fill('#vf-doel', '12'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#venster.aan [data-doelbewerk]')
    page.select_option('#vf-eigenaar', 'team:talent'); page.select_option('#vf-metric', 'timeToFill'); page.fill('#vf-doel', '14'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#venster.aan .rij:has-text("Team talent")')  # v4.2: teamdoel
    page.screenshot(path=OUT + '/18_doelen_beheer.png'); page.click('#venster [data-cf-annuleer]')
    page.click('[data-beheer="capsule"]'); page.wait_for_selector('#crmBeheer:has-text("klaar")', timeout=8000)
    page.click('[data-crmtab="scholen"]'); page.click('[data-crmnieuw="school"]'); page.fill('#cf-naam', 'Testschool Noord'); page.fill('#cf-plaats', 'Groningen'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.d-naam h2:has-text("Testschool Noord")')
    page.click('[data-dtab="kansen"]'); page.click('#dTab [data-composer="kans"]'); page.fill('#cf-naam', 'Studentdocenten'); page.fill('#cf-waarde', '8000'); page.click('[data-cf-opslaan]'); page.wait_for_selector('[data-kansfase]')  # v7.1: + Kans staat in de tab Kansen
    # v6.4: gewonnen opent eerst het winformulier (aantal en startdatum verplicht); annuleren laat de kans staan
    page.select_option('[data-kansfase]', 'gewonnen'); page.wait_for_selector('#venster.aan #vf-aantal')
    page.click('#venster [data-cf-annuleer]'); page.wait_for_timeout(400); assert page.locator('.t-item:has-text("→ gewonnen")').count() == 0, 'annuleren wint de kans niet'
    page.wait_for_selector('[data-kansfase]'); page.select_option('[data-kansfase]', 'gewonnen'); page.wait_for_selector('#venster.aan #vf-aantal')
    page.click('#venster [data-cf-opslaan]'); page.wait_for_timeout(200); assert page.locator('#venster.aan #vf-aantal').count() == 1, 'zonder aantal en startdatum blijft het formulier open'
    # v7.9 (punt 4) "v7.9 winformulier met getekende waarde": eerst zonder getekende waarde (melding, venster blijft open), dan met; de akkoorddatum staat op vandaag
    assert page.input_value('#vf-akkoorddatum') == dag(0) and page.get_attribute('#vf-akkoorddatum', 'max') == dag(0), 'akkoorddatum: standaard vandaag, max vandaag'
    page.fill('#vf-aantal', '2'); page.fill('#vf-startdatum', '2026-11-16'); page.fill('#vf-rooster', 'di en do 9-13 uur'); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('#toast.aan:has-text("getekende contractwaarde")'); assert page.locator('#venster.aan #vf-contractwaarde').count() == 1, 'zonder getekende waarde blijft het winformulier open'
    page.fill('#vf-contractwaarde', '8250'); n0 = len(API_LOG); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('.t-item:has-text("→ gewonnen")'); page.wait_for_timeout(150)
    od = eerste_arg(api_vanaf(n0, 'apiKansOpslaan')[0]).get('overdracht') or {}; assert od.get('contractwaarde') == 8250 and od.get('akkoorddatum') == dag(0), 'het winformulier stuurt de getekende waarde en de akkoorddatum: %s' % od
    page.wait_for_selector('.d-links [data-crm-open^="project:"]'); page.click('.d-links [data-crm-open^="project:"]'); page.wait_for_selector('.t-item:has-text("Overdracht")')  # v3.8: gewonnen = project met overdracht
    page.click('[data-dtab="taskforce"]'); page.wait_for_selector('#dTab .hint:has-text("winformulier")'); assert 'di en do 9-13 uur' in page.inner_text('#dTab'), 'taskforce vooringevuld uit het winformulier'
    page.click('[data-tfplannen]'); page.wait_for_selector('#venster.aan #vf-start'); page.fill('#vf-start', '2026-10-28T10:00'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#dTab .hint:has-text("Gepland")')
    page.click('[data-dtab="bezetting"]'); page.wait_for_selector('#dTab .vac-kaart .tag.concept'); assert page.locator('#dTab [data-kandidaat="nieuw"]').count() == 0, 'op een concept geen + Kandidaat'
    page.click('#dTab [data-vacbevestig]'); page.wait_for_selector('#dTab .vac-kaart .tag.open')
    page.click('[data-tscout="kies"]'); page.wait_for_selector('#venster.aan #vf-talentscout'); page.select_option('#vf-talentscout', 'Lotte'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('.d-links:has-text("Lotte")')
    page.screenshot(path=OUT + '/18b_project_na_winst.png', full_page=True)
    page.go_back(); page.wait_for_selector('[data-kansfase]')
    page.screenshot(path=OUT + '/18_kans_gewonnen.png', full_page=True)
    page.click('nav button[data-view="vandaag"]'); page.wait_for_selector('#kansenLijst [data-crm-open]'); page.click('#kansenLijst [data-crm-open="kans:k2"]'); page.wait_for_selector('[data-kansfase]'); page.wait_for_timeout(150)
    assert page.locator('#view-relaties.actief').count() == 1, 'kans vanuit Vandaag opent in Relaties'
    # v7.9 (punt 15) "v7.9 verlorenvenster": geen window.prompt meer, maar een venster met datum, een reden uit de keuzelijst (verplicht) en een toelichting
    page.select_option('[data-kansfase]', 'verloren'); page.wait_for_selector('#venster.aan #vf-verliesReden')
    assert 'opgeschoond' in page.inner_text('#vf-verliesReden') and page.input_value('#vf-datum') == dag(0), 'redenen uit de keuzelijst (met opgeschoond), datum standaard vandaag'
    page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Kies een reden")'); page.select_option('#vf-verliesReden', 'te duur'); page.fill('#vf-verliesToelichting', 'Budget naar volgend jaar'); n0 = len(API_LOG)
    page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("verloren")'); page.wait_for_selector('#toast.aan [data-toastactie="1"]')
    o = eerste_arg(api_vanaf(n0, 'apiKansOpslaan')[0]); assert o.get('verliesReden') == 'te duur' and o.get('verliesToelichting') == 'Budget naar volgend jaar' and (o.get('wissel') or {}).get('datum') == dag(0), 'verloren: reden, toelichting en datum: %s' % o
    assert 'prompt' not in DIALOGEN, 'geen window.prompt bij verloren'
    page.click('#toast.aan [data-toastactie="0"]'); page.wait_for_selector('#toast.aan:has-text("Teruggezet naar gesprek")'); page.wait_for_function("() => (document.querySelector('[data-kansfase]') || {}).value === 'gesprek'")  # B2: Ongedaan maken zet de vlag
    page.click('#instellingenKnop'); page.wait_for_selector('#statusInfo .k-rij'); page.wait_for_timeout(200)
    page.click('#statusInfo [data-herinneringen="0"]'); page.wait_for_selector('#statusInfo [data-herinneringen="1"]:has-text("Uit")')  # v4.6: herinneringsmail uitzetten
    page.click('#statusInfo [data-herinneringen="1"]'); page.wait_for_selector('#statusInfo [data-herinneringen="0"]:has-text("Aan")')
    st_rij = page.locator('#statusInfo .k-rij:has-text("Sturing (dagelijks 06:45)")'); assert st_rij.count() == 1 and 'ja' in st_rij.inner_text() and 'laatst ' in st_rij.inner_text(), 'v7.9 (review T8): het statuspaneel toont de dagelijkse sturing met de laatste run'
    # v7.6: Beheer → Metingen (alleen management): tabel per api met aantal, p50, p95 en fout %, de traagste bovenaan; JS-fouten; Vernieuwen haalt opnieuw op
    page.wait_for_selector('#metingenInhoud table.metingen tbody tr'); assert page.locator('#metingenInhoud tbody tr').first.inner_text().startswith('apiCrm'), 'traagste api (p95) bovenaan'
    assert '1900 ms' in page.inner_text('#metingenInhoud tbody tr:first-child') and 'JS-fouten' in page.inner_text('#metingenInhoud'), 'p95 en de JS-foutregel in de metingen'
    n_metingen = len(api_vanaf(0, 'apiMetingen')); page.click('#statusInfo [data-metingen="vernieuwen"]'); page.wait_for_selector('#metingenInhoud table.metingen tbody tr'); page.wait_for_timeout(100)
    assert len(api_vanaf(0, 'apiMetingen')) == n_metingen + 1, 'Vernieuwen haalt apiMetingen opnieuw op'
    # de app heeft intussen haar eigen metingen aangeleverd (stil, na de eerste geslaagde aanroep): gebundeld per dag en api, zonder argumenten
    bundels = api_vanaf(0, 'apiMetingenOpslaan'); assert bundels and all(isinstance(b['args'][0], list) and all(set(r) >= {'dag', 'fn', 'aantal', 'b250', 'somMs', 'maxMs'} and r['aantal'] >= 1 for r in b['args'][0]) for b in bundels), 'apiMetingenOpslaan: gebundelde rijen per dag en api'
    page.screenshot(path=OUT + '/09_instellingen.png', full_page=True)
    page.click('#koppelSluit')
    # v3.0: desktopweergave (zijbalk, Capsule-opbouw)
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    assert page.locator('body.desk #zijbalk').is_visible(), 'zijbalk op desktop'
    page.click('.zb-item[data-desk="home"]'); page.wait_for_selector('#homeInhoud .hkaart'); page.wait_for_timeout(200)
    # v7.1: hoogstens vier tegels per functie (management: Te laat, Open kansen, Gewogen pijplijn, Lopende projecten); geen streak meer
    assert page.locator('#homeInhoud .tegels .tegel').count() == 4, 'vier tegels op Home'
    assert page.locator('#homeInhoud .tegel:has-text("Lopende projecten")').count() == 1 and page.locator('#homeInhoud .tegel:has-text("op rij")').count() == 0, 'tegels per functie'
    page.screenshot(path=OUT + '/20_desk_home.png')
    page.click('#homeInhoud .tegel[data-kpi="laat"]'); page.wait_for_timeout(500)
    assert page.locator('#crmBalk .chip.aan[data-taakweergave="laat"]').count() == 1, 'tegel Te laat opent Taken in de weergave Te laat'
    page.click('#crmBalk [data-taakweergave="alles"]'); page.wait_for_timeout(200)  # terug naar Alles voor de rest van de test
    page.click('.zb-item[data-desk="home"]'); page.wait_for_selector('#homeInhoud .hkaart'); page.wait_for_timeout(200)
    page.click('.zb-item[data-desk="contacten"]'); page.wait_for_selector('.dtabel tr.klik'); page.wait_for_timeout(150)
    page.click('th[data-sorteer="plaats"]'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/21_desk_contacten.png')
    page.click('#crmBalk [data-crmtab="personen"]'); page.wait_for_selector('.dtabel tr[data-crm-open^="persoon:"]')
    page.click('#crmBalk [data-crmtab="scholen"]'); page.click('.dtabel tr[data-crm-open="school:s1"]'); page.wait_for_selector('.detail-3'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/22_desk_school.png')
    page.click('.zb-item[data-desk="taken"]'); page.wait_for_selector('.dtabel [data-taakklaar]'); page.wait_for_timeout(150)
    assert page.locator('.dtabel th:has-text("Tijd")').count() >= 1 and page.locator('#crmInhoud .sneltoetsen').count() == 1, 'kolom Tijd en de sneltoetsenhint'  # v4.5
    page.click('th[data-taaksorteer="deadline"]'); page.wait_for_selector('th[data-taaksorteer="deadline"]:has-text("▲")'); assert page.locator('.dtabel th:has-text("Tags")').count() >= 1 and page.locator('.dtabel tr.sub').count() == 0, 'kop Deadline sorteert (subtaken dan niet ingesprongen), kolom Tags'  # v4.6
    page.click('th[data-taaksorteer="deadline"]'); page.wait_for_selector('th[data-taaksorteer="deadline"]:has-text("▼")')
    page.screenshot(path=OUT + '/23_desk_taken.png')
    page.locator('.dtabel tr[data-taakbewerk] td:nth-child(2)').first.click(); page.wait_for_selector('#venster.aan #vf-tekst'); page.screenshot(path=OUT + '/23b_desk_taak_venster.png'); page.click('#venster [data-cf-annuleer]')  # v3.7
    page.locator('.dtabel tr[data-taakbewerk="tk3"]').focus(); page.keyboard.press('1'); page.wait_for_selector('.dtabel tr[data-taakbewerk="tk3"] .tag.hoog')  # v4.5: sneltoets 1 = hoog
    page.keyboard.press('n'); page.wait_for_selector('#crmNieuw #cf-tekst'); page.click('#crmNieuw [data-cf-annuleer]')  # v4.5: n = nieuwe taak
    page.goto('http://127.0.0.1:8765/#taak:tk3'); page.wait_for_selector('#venster.aan #vf-tekst'); assert page.input_value('#vf-tekst') == 'Evaluatie periode 1 inplannen', 'deeplink #taak:<id> opent de taak'; page.click('#venster [data-cf-annuleer]')  # v4.5
    page.click('.zb-item[data-desk="agenda"]'); page.wait_for_selector('.maand .dag'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/24_desk_agenda.png')
    page.click('[data-agnav="1"]'); page.wait_for_timeout(300); page.click('[data-agnav="0"]'); page.wait_for_selector('.maand .dag.vandaag')
    page.click('[data-agendaplan]'); page.wait_for_selector('#agendaForm #cf-schoolId'); page.select_option('#cf-schoolId', 's1'); page.fill('#cf-titel', 'Evaluatie'); page.click('#agendaForm [data-cf-opslaan]'); page.wait_for_timeout(500)
    page.click('.zb-item[data-desk="pipeline"]'); page.wait_for_selector('.kolom'); page.wait_for_timeout(150)
    k = page.locator('[data-sleepdoel^="kans:"] .kaartje.sleepbaar').first; kid = k.get_attribute('data-sleep'); van = k.evaluate("e => e.closest('[data-sleepdoel]').getAttribute('data-sleepdoel')")
    naar = [d for d in page.eval_on_selector_all('[data-sleepdoel^="kans:"]', "l => l.map(e => e.getAttribute('data-sleepdoel'))") if d != van][0]
    sleep_naar(page, '[data-sleep="%s"]' % kid, '[data-sleepdoel="%s"]' % naar)
    assert page.locator('[data-sleepdoel="%s"] [data-sleep="%s"]' % (naar, kid)).count() == 1 and page.locator('#crmDetailScherm .d-naam h2').count() == 0, 'v6.7: kans naar een andere mijlpaal slepen (opent de kans niet)'
    page.wait_for_selector('#toast.aan:has-text("→") [data-toastactie]'); page.click('#toast.aan [data-toastactie]'); page.wait_for_timeout(500)
    assert page.locator('[data-sleepdoel="%s"] [data-sleep="%s"]' % (van, kid)).count() == 1, 'v6.8: slepen ongedaan maken'
    page.locator('[data-sleep="%s"]' % kid).focus(); page.keyboard.press('ArrowRight' if page.eval_on_selector_all('[data-sleepdoel^="kans:"]', "l => l.map(e => e.getAttribute('data-sleepdoel'))").index(van) == 0 else 'ArrowLeft'); page.wait_for_timeout(500)
    assert page.locator('[data-sleepdoel="%s"] [data-sleep="%s"]' % (van, kid)).count() == 0, 'v6.8: kaart met de pijltjestoetsen verplaatsen'
    page.screenshot(path=OUT + '/25_desk_pipeline.png')
    # v7.9 (punt 5, R14) "v7.9 voorstelvenster na slepen": k3 (zonder tekendatum) naar voorstel: het venster opent vóór de aanroep met de kaart voorlopig in de
    # nieuwe kolom; Annuleren zet hem terug zonder aanroep; Overslaan doet één aanroep met alleen de fase en bron slepen; de focus staat daarna op de kaart
    page.wait_for_timeout(600); n0 = len(API_LOG)
    sleep_naar(page, '[data-sleep="kans:k3"]', '[data-sleepdoel="kans:voorstel"]'); page.wait_for_selector('#venster.aan #vf-verwachteSluiting')
    assert page.locator('[data-sleepdoel="kans:voorstel"] [data-sleep="kans:k3"]').count() == 1 and page.locator('#venster #vf-waarde').count() == 0 and not api_vanaf(n0, 'apiKansOpslaan'), 'voorstelvenster vóór de aanroep, alleen het lege veld, kaart voorlopig verplaatst'
    page.click('#venster [data-cf-annuleer]'); page.wait_for_selector('#venster.aan', state='hidden'); page.wait_for_timeout(300)
    assert page.locator('[data-sleepdoel="kans:voorstel"] [data-sleep="kans:k3"]').count() == 0 and not api_vanaf(n0, 'apiKansOpslaan'), 'Annuleren: kaart terug, geen aanroep'
    sleep_naar(page, '[data-sleep="kans:k3"]', '[data-sleepdoel="kans:voorstel"]'); page.wait_for_selector('#venster.aan [data-voorstelovers]'); page.click('#venster [data-voorstelovers]')
    page.wait_for_selector('#toast.aan:has-text("→ voorstel")'); page.wait_for_timeout(300); a = api_vanaf(n0, 'apiKansOpslaan')
    assert len(a) == 1 and eerste_arg(a[0]).get('wissel', {}).get('bron') == 'slepen' and 'verwachteSluiting' not in eerste_arg(a[0]), 'Overslaan: één aanroep met fase en bron slepen: %s' % a
    assert page.evaluate("document.activeElement && document.activeElement.getAttribute('data-sleep')") == 'kans:k3', 'na het venster de focus op de kaart in het nieuwe bord'
    page.click('.zb-item[data-desk="projecten"]'); page.wait_for_selector('.ftabel [data-crm-open="project:t1"]'); page.wait_for_timeout(150)  # v4.0: bord per accountmanager
    page.select_option('.ftabel [data-pveld="verlenging"][data-pid="t2"]', 'verlengd'); page.wait_for_selector('.ftabel select.pill.p-verlengd[data-pid="t2"]')
    assert page.locator('.ftabel a.p-link[href^="https://docs.google.com"]').count() >= 1, 'link naar samenwerkingsvoorstel'
    page.screenshot(path=OUT + '/26_desk_projecten.png')
    page.click('.zb-item[data-desk="bezetting"]'); page.wait_for_selector('.vac-grid .vac-kaart'); page.wait_for_timeout(150)  # v4.1
    assert page.locator('.zb-item.aan[data-desk="bezetting"]').count() == 1, 'zijbalk: Bezetting actief'
    page.screenshot(path=OUT + '/26c_desk_bezetting.png')
    page.click('.zb-item[data-desk="talent"]'); page.wait_for_selector('.dtabel tr[data-crm-open="talent:tl1"]'); assert page.locator('.zb-item.aan[data-desk="talent"]').count() == 1 and page.locator('.dtabel th:has-text("VOG")').count() == 1, 'zijbalk Talent: tabel met VOG-kolom'  # v5.0
    page.select_option('#tVog', 'oranje'); page.wait_for_timeout(150); assert page.locator('.dtabel tr[data-crm-open^="talent:"]').count() == 1, 'filter op VOG'; page.select_option('#tVog', ''); page.wait_for_timeout(100)
    page.screenshot(path=OUT + '/26d_desk_talent.png')
    page.click('.zb-item[data-desk="projecten"]'); page.wait_for_selector('.ftabel [data-crm-open="project:t1"]')
    page.click('[data-pweergave="huidig"]'); page.wait_for_timeout(200); assert 'schooljaar 2027-2028' in page.inner_text('#trajectTelling'), 'ingesteld schooljaar wordt gebruikt'
    page.click('[data-pweergave="bord"]'); page.wait_for_selector('.kaartje[data-crm-open^="project:"]'); page.wait_for_timeout(150)
    k = page.locator('.kaartje.sleepbaar[data-sleep^="project:"]').first; pid = k.get_attribute('data-sleep'); van = k.evaluate("e => e.closest('[data-sleepdoel]').getAttribute('data-sleepdoel')")
    naar = [d for d in page.eval_on_selector_all('[data-sleepdoel^="project:"]', "l => l.map(e => e.getAttribute('data-sleepdoel'))") if d != van][0]
    sleep_naar(page, '[data-sleep="%s"]' % pid, '[data-sleepdoel="%s"]' % naar)
    assert page.locator('[data-sleepdoel="%s"] [data-sleep="%s"]' % (naar, pid)).count() == 1, 'v6.7: project naar een andere status slepen'
    sleep_naar(page, '[data-sleep="%s"]' % pid, '[data-sleepdoel="%s"]' % van)  # terug, zodat de rest van de test dezelfde stand ziet
    page.screenshot(path=OUT + '/26a_desk_projecten_bord.png')
    page.click('.kaartje[data-crm-open="project:t1"]'); page.wait_for_selector('.d-naam h2:has-text("Onderwijsondersteuning")'); assert page.locator('.zb-item.aan[data-desk="projecten"]').count() == 1
    page.screenshot(path=OUT + '/26b_desk_project.png')
    page.click('.zb-item[data-desk="facturatie"]'); page.wait_for_selector('.ftabel [data-pveld="gefactureerd"]')  # v3.8: facturatiebord
    page.select_option('.ftabel [data-pveld="gefactureerd"][data-pid="t2"]', 'ja'); page.wait_for_selector('.ftabel select.pill.p-ja[data-pid="t2"]')
    page.click('[data-factopen="t1"]'); page.wait_for_selector('tr.f-sub [data-fstatus="f2"]'); page.select_option('[data-fstatus="f2"]', 'aangemaakt'); page.wait_for_timeout(300)
    page.fill('.ftabel [data-pveld="factuurnummer"][data-pid="t2"]', '99990002'); page.press('.ftabel [data-pveld="factuurnummer"][data-pid="t2"]', 'Tab'); page.wait_for_timeout(300)
    page.screenshot(path=OUT + '/29_desk_facturatie.png')
    # v6.5: Financiën per schooljaar, school en project
    page.click('.zb-item[data-desk="financien"]'); page.wait_for_selector('table.fin [data-finopen]')
    page.click('table.fin [data-finopen]'); page.wait_for_selector('table.fin td.fin-project'); page.wait_for_timeout(150)
    assert page.locator('[data-finexact]').is_visible(), 'financien: Exact-knop voor management'
    # v7.2: prognose vastleggen en de Exact-afstemming (controleren, toepassen) doorlopen; de mock geeft de vorm van Code.gs terug
    page.click('[data-finbevries]'); page.wait_for_selector('[data-finbevries]', state='hidden'); page.wait_for_selector('table.fin [data-finopen]')
    page.click('[data-finexact]'); page.wait_for_selector('#venster.aan #vf-exactbestand')
    page.set_input_files('#vf-exactbestand', {'name': 'exact.csv', 'mimeType': 'text/csv', 'buffer': b'Factuurnummer;Factuurdatum;Debiteur;Bedrag;Betaaldatum\nF2026-001;01-10-2026;Lyceum Demo;1.950,00;15-10-2026\n'})
    page.wait_for_selector('#venster [data-exactcontrole]:not([disabled])'); page.click('#venster [data-exactcontrole]'); page.wait_for_selector('#exactUit .kaart')
    assert 'gekoppeld' in page.inner_text('#exactUit') and 'F9999' in page.inner_text('#exactUit'), 'financien: uitkomst van de Exact-controle'
    # v7.7: na Controleren staat per factuur zonder termijn wat er zou gebeuren; het vinkje "aanmaken" gaat mee met Toepassen en levert het blok Aangemaakt
    uit = page.inner_text('#exactUit'); assert 'termijn mogelijk onder Lyceum Demo' in uit and 'geen school met deze debiteur' in uit and 'Aangemaakt onder een project' not in uit, 'exact: reden per factuur na controleren: ' + uit[:300]
    assert not page.locator('#vf-exactaanmaken').is_disabled(), 'exact: het vinkje aanmaken is na controleren te kiezen'
    vk = page.evaluate("(function () { var i = document.getElementById('vf-exactaanmaken'), r = i.getBoundingClientRect(), l = i.closest('label').getBoundingClientRect(); return [r.width, r.height, l.height]; })()")
    assert vk[0] >= 22 and vk[1] >= 22 and vk[2] >= 44, 'exact: het vinkje is 22 px en het label 44 px hoog (iOS-review v7.7): %s' % vk  # v7.7 (iOS-review)
    page.check('#vf-exactaanmaken')
    page.click('#venster [data-exacttoepassen]'); page.wait_for_selector('#exactUit .kaart:has-text("1 bijgewerkt.")')  # de confirm wordt door de dialoog-handler hierboven geaccepteerd
    uit = page.inner_text('#exactUit'); assert 'Aangemaakt onder een project' in uit and 'F9999' in uit and 'F9998' in uit and page.locator('#vf-exactaanmaken').is_disabled(), 'exact: na toepassen met aanmaken het blok Aangemaakt en F9998 met reden: ' + uit[:300]
    assert [a for a in api_vanaf(0, 'apiExactImport') if a['args'][1].get('aanmaken')][-1]['args'][1]['toepassen'] is True, 'exact: aanmaken gaat alleen mee met toepassen'
    page.click('#venster [data-cf-annuleer]'); page.wait_for_selector('#venster.aan', state='hidden'); page.wait_for_selector('table.fin [data-finopen]')
    page.click('[data-finkas="1"]'); page.wait_for_selector('[data-finkas="1"].aan')
    page.screenshot(path=OUT + '/29b_desk_financien.png')
    page.click('.zb-item[data-desk="rapporten"]'); page.wait_for_selector('.tabel'); page.wait_for_timeout(150)
    # v7.9 (punt 20, 21): het MT-overzicht (alleen desktop) met de definitie bij elk cijfer, geblokkeerd zonder jaardoel, een tussenstand, de maandstand, afdrukken en de link
    page.click('#crmBalk [data-rweergave="mt"]'); page.wait_for_selector('.mt .mt-blok'); assert page.locator('.mt .mt-regel .t-def').count() == page.locator('.mt .mt-regel').count(), 'MT: elk cijfer met zijn definitie'
    assert page.locator('.mt .mt-regel:has(.mt-m:text-is("M01")) .mt-geblokkeerd:has-text("besluit jaardoel")').count() == 1 and page.locator('.mt .mt-regel:has(.mt-m:text-is("M01")) .mt-waarde').count() == 0 and page.locator('.mt .tag.geblokkeerd').count() >= 1, 'MT: zonder jaardoel geblokkeerd, nooit een geschat getal'
    page.click('[data-mtbevries]'); page.wait_for_selector('#toast.aan:has-text("Tussenstand")'); page.wait_for_selector('#mtStand option[value="%s"]' % dag(0), state='attached'); assert page.locator('[data-mtbevries]').count() == 0, 'MT: hoogstens één tussenstand per dag'
    page.select_option('#mtStand', '2026-10'); page.wait_for_selector('.mt .hint:has-text("bevroren maandstand")')
    page.evaluate("window.print = function () { window.__geprint = (window.__geprint || 0) + 1; }"); page.click('[data-mtprint]'); assert (page.evaluate("window.__geprint") or 0) >= 1, 'MT: Afdrukken'
    page.emulate_media(media='print'); assert not page.locator('#zijbalk').is_visible() and page.locator('.mt-print-kop').is_visible(), 'print: zonder zijbalk, met de kop van het maanddocument'; page.emulate_media(media='screen')
    page.click('[data-mtlink]'); page.wait_for_timeout(300)
    page.screenshot(path=OUT + '/30_desk_mt.png', full_page=True)
    page.select_option('#mtStand', ''); page.wait_for_selector('.mt .hint:has-text("live")'); page.click('#crmBalk [data-rweergave="teams"]'); page.wait_for_selector('.tabel')
    page.click('.zb-item[data-desk="doelen"]'); page.wait_for_selector('#doelenInhoud .doel-rij'); page.wait_for_timeout(150)
    page.click('#doelenInhoud [data-doelteam="accountmanagement"]'); page.wait_for_selector('#doelenInhoud .hkaart:has-text("Joris") .doel-rij')  # v4.2: doelen per team
    page.screenshot(path=OUT + '/27_desk_doelen.png')
    page.fill('#zbZoek', 'lyceum'); page.wait_for_selector('#zbResultaten.aan a'); page.click('#zbResultaten a'); page.wait_for_selector('.detail-3 h2:has-text("Lyceum Demo")')
    page.click('#zbNieuwKnop'); page.click('[data-desknieuw="taak"]'); page.wait_for_selector('#crmNieuw #cf-tekst')
    page.click('.zb-item[data-desk="home"]'); page.wait_for_selector('#homeMails [data-concept]'); page.click('#homeMails [data-concept]')  # v3.5
    page.wait_for_selector('.actiekaart:has-text("Conceptmail")'); assert page.locator('#view-brein').is_visible()
    page.screenshot(path=OUT + '/28_desk_brein_concept.png')
    page.click('.zb-item[data-desk="brein"]'); page.wait_for_selector('#breinTegels .tegel')
    for breedte in (1280, 1024):
        page.set_viewport_size({'width': breedte, 'height': 800}); page.wait_for_timeout(200)
        print('horizontale scroll desktop', breedte, page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    page.click('.zb-item[data-desk="contacten"]'); page.click('.dtabel tr[data-crm-open="school:s1"]'); page.wait_for_selector('.detail-3')
    page.select_option('[data-logvorm]', 'notitie'); page.fill('#cf-tekst', 'Half getypt')
    page.set_viewport_size({'width': 900, 'height': 800}); page.wait_for_timeout(200); page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(200)
    assert page.input_value('#cf-tekst') == 'Half getypt', 'concept blijft bij wisselen van breedte'
    page.click('[data-cf-annuleer]')
    page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(300)
    assert not page.locator('#zijbalk').is_visible() and page.locator('nav').is_visible(), 'terug naar mobiel'
    page.set_viewport_size({'width': 1100, 'height': 800}); page.wait_for_timeout(300); page.click('.zb-item[data-desk="home"]'); page.wait_for_selector('#homeInhoud .hkaart'); page.wait_for_timeout(300)
    page.screenshot(path=OUT + '/10_desktop.png', full_page=True)
    # v3.2: met een trage backend (2 s) moet Home na herladen meteen gevuld zijn uit de bewaarde gegevens
    def traag(route):
        import time; time.sleep(2); route.continue_()
    page.route('**/api*', traag)
    page.reload(); page.wait_for_selector('#homeInhoud .hkaart', timeout=1500)
    print('home direct uit bewaarde gegevens: ja')
    page.wait_for_selector('#homeMails .rij', timeout=15000); page.unroute('**/api*', traag)
    print('sw-registraties:', page.evaluate("() => navigator.serviceWorker.getRegistrations().then(r => r.length)"))
    print('--paars:', page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--paars')"))
    print('localStorage:', page.evaluate("() => Object.keys(localStorage)"))
    print('horizontale scroll:', page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    # v4.0: accountmanager Joris (code am123) ziet geen pipeline, alleen zijn eigen projecten en facturatie
    ctx2 = b.new_context(viewport={'width': 1280, 'height': 800}); am = ctx2.new_page()
    am.on('pageerror', lambda e: meldingen.append(('pageerror am', str(e))))
    am.goto('http://127.0.0.1:8765/'); am.wait_for_timeout(500)
    am.fill('#apiInput', 'http://127.0.0.1:8765/api'); am.fill('#codeInput', 'am123'); am.click('#codeOpslaan')
    am.wait_for_selector('#zbNaam:has-text("Joris · accountmanager")')
    assert not am.locator('.zb-item[data-desk="pipeline"]').is_visible() and am.locator('.zb-item[data-desk="facturatie"]').is_visible(), 'menu per rechten'
    am.click('#zbNieuwKnop'); assert not am.locator('[data-desknieuw="kans"]').is_visible() and am.locator('[data-desknieuw="taak"]').is_visible(), 'geen nieuwe kans'; am.click('#zbNieuwKnop')
    am.goto('http://127.0.0.1:8765/#pipeline'); am.wait_for_selector('#homeInhoud .hkaart'); assert am.locator('.zb-item.aan[data-desk="home"]').count() == 1, 'pipeline via de adresbalk gaat naar Home'
    am.click('.zb-item[data-desk="projecten"]'); am.wait_for_selector('.ftabel [data-crm-open="project:t6"]')
    assert am.locator('#trajectLijst [data-crm-open="project:t1"]').count() == 0, 'alleen eigen projecten'
    am.screenshot(path=OUT + '/40_am_projecten.png')
    am.click('.ftabel a[data-crm-open="project:t6"]'); am.wait_for_selector('.d-naam h2:has-text("Examentraining")'); am.locator('.d-links [data-crm-open^="kans:"]').first.click()
    am.wait_for_selector('.d-naam h2'); assert am.locator('.d-naam [data-composer="bewerk"]').count() == 0 and am.locator('[data-kansfase]').count() == 0, 'kans van eigen project alleen lezen'
    am.screenshot(path=OUT + '/41_am_kans_lezen.png')
    am.click('.zb-item[data-desk="financien"]'); am.wait_for_selector('table.fin [data-finopen]'); assert not am.locator('[data-finexact]').is_visible(), 'am: geen Exact-import'
    am.click('#zbInstellingen'); am.wait_for_selector('#statusInfo .k-rij'); am.wait_for_timeout(300); assert am.locator('#statusInfo [data-metingen]').count() == 0, 'am: geen metingen in Beheer (v7.6; op desktop via de zijbalk)'; am.click('#koppelSluit')
    # v5.0: de accountmanager beoordeelt zijn geplaatste kandidaat en ziet een beperkt profiel (geen documenten, geen adres)
    am.click('.zb-item[data-desk="projecten"]'); am.wait_for_selector('.ftabel [data-crm-open="project:t6"]'); am.click('.ftabel a[data-crm-open="project:t6"]'); am.wait_for_selector('.d-naam h2:has-text("Examentraining")')
    am.click('[data-dtab="bezetting"]'); am.wait_for_selector('#dTab .rij:has-text("Noor Bakker") [data-beoordeel]'); assert am.locator('#dTab .rij:has-text("Noor Bakker") .vog.oranje').count() == 1, 'VOG-badge op de kandidaatregel'
    am.click('#dTab .rij:has-text("Noor Bakker") [data-beoordeel]'); am.wait_for_selector('#venster.aan [data-oordeel="favoriet"]'); am.click('#venster [data-oordeel="favoriet"]'); am.click('#venster [data-crit="punctualiteit"][data-punt="3"]'); am.fill('#vf-tekst', 'Rustig en duidelijk voor de klas.')
    am.screenshot(path=OUT + '/44_am_beoordelen.png'); am.click('#venster [data-cf-opslaan]'); am.wait_for_selector('#toast.aan:has-text("Beoordeling opgeslagen")')
    am.click('#dTab .rij:has-text("Noor Bakker") a[data-crm-open="talent:tl2"]'); am.wait_for_selector('.d-naam h2:has-text("Noor Bakker")')
    assert am.locator('[data-dtab="documenten"]').count() == 0 and '3011' not in am.inner_text('.d-links'), 'beperkt profiel voor de accountmanager: geen documenten, geen adres'
    am.click('[data-dtab="beoordelingen"]'); am.wait_for_selector('#dTab .rij .tag.favoriet'); am.screenshot(path=OUT + '/45_am_talent_beperkt.png')
    am.set_viewport_size({'width': 390, 'height': 844}); am.wait_for_timeout(300); am.click('nav button[data-view="relaties"]'); am.wait_for_selector('#crmTabs [data-crmtab="scholen"]')
    assert am.locator('#crmTabs [data-crmtab="pipeline"]').count() == 0, 'geen pipeline-tab op de telefoon'
    am.screenshot(path=OUT + '/42_am_relaties.png', full_page=True)
    ctx2.close()
    # v4.1: talentscout Lotte (code talent123) begint bij de bezetting, zonder pipeline en facturatie
    ctx3 = b.new_context(viewport={'width': 1280, 'height': 800}); tl = ctx3.new_page()
    tl.on('pageerror', lambda e: meldingen.append(('pageerror talent', str(e))))
    tl.goto('http://127.0.0.1:8765/'); tl.wait_for_timeout(500)
    tl.fill('#apiInput', 'http://127.0.0.1:8765/api'); tl.fill('#codeInput', 'talent123'); tl.click('#codeOpslaan')
    tl.wait_for_selector('#zbNaam:has-text("Lotte · talentscout")')
    assert tl.locator('.zb-item[data-desk="bezetting"]').is_visible() and not tl.locator('.zb-item[data-desk="pipeline"]').is_visible() and not tl.locator('.zb-item[data-desk="facturatie"]').is_visible() and not tl.locator('.zb-item[data-desk="financien"]').is_visible(), 'menu talent'
    # v6.4: op desktop wisselt de zijbalk van scherm; Projecten toont de projecten (ook voor talent), Bezetting het bord zonder projectchips
    tl.click('.zb-item[data-desk="projecten"]'); tl.wait_for_selector('#projectWeergaven .chip.aan[data-pweergave="am"]'); assert tl.locator('.vac-grid').count() == 0 and tl.locator('#projectWeergaven [data-pweergave="bezetting"]').count() == 0, 'talent: Projecten toont projecten, zonder Bezetting-chip'
    tl.click('.zb-item[data-desk="bezetting"]'); tl.wait_for_selector('.vac-grid .vac-kaart'); assert tl.locator('#projectWeergaven .chip').count() == 0 and tl.locator('.zb-item.aan[data-desk="bezetting"]').count() == 1, 'Bezetting via de zijbalk, zonder projectchips'
    tl.click('[data-bmijn]'); tl.wait_for_timeout(200); assert tl.locator('.vac-kaart').count() == 0 or 'TS Lotte' in tl.inner_text('#trajectLijst'), 'filter Mijn projecten'; tl.click('[data-bmijn]'); tl.wait_for_selector('.vac-grid .vac-kaart')
    tl.locator('.vac-kaart a[data-crm-open="project:t4"]').first.click(); tl.wait_for_selector('#dTab .vac-kaart'); assert tl.locator('[data-dtab="bezetting"].aan').count() == 1, 'project opent bij de bezetting'
    assert tl.locator('.d-links .kop:has-text("Facturatie")').count() == 0, 'talent ziet geen facturatie'
    tl.screenshot(path=OUT + '/43_talent_project.png')
    # v5.0: talentteam — het bestand, een nieuw profiel met dubbelcontrole, het beschikbaarheidsraster, een VOG, voorstellen met matchscore en de VOG-badge op de kandidaatregel
    tl.click('.zb-item[data-desk="talent"]'); tl.wait_for_selector('.dtabel tr[data-crm-open="talent:tl1"]'); assert tl.locator('#trajectLijst .kop:has-text("Vandaag benaderen")').count() == 1, 'lijst vandaag benaderen voor het talentteam'
    tl.screenshot(path=OUT + '/46_talent_bestand.png')
    tl.click('#deskActies [data-talentnieuw]'); tl.wait_for_selector('#venster.aan #vf-voornaam'); tl.fill('#vf-voornaam', 'Test'); tl.fill('#vf-achternaam', 'Persoon'); tl.fill('#vf-email', 'eva@voorbeeld.nl'); tl.check('#venster .vink-chips input[data-cf="f_huiswerkbegeleider"]'); tl.check('#venster .vink-chips input[data-cf="s_vo"]')
    tl.click('#venster [data-cf-opslaan]'); tl.wait_for_selector('#dubbelHint'); assert tl.locator('#dubbelHint [data-crm-open="talent:tl1"]').count() == 1, 'dubbelcontrole toont het bestaande profiel'
    tl.fill('#vf-email', 'test.persoon@voorbeeld.nl'); tl.click('#venster [data-cf-opslaan]'); tl.wait_for_selector('.d-naam h2:has-text("Test Persoon")'); assert tl.locator('[data-dtab="beschikbaarheid"].aan').count() == 1, 'nieuw profiel opent bij de beschikbaarheid'
    tl.click('[data-rcel="ma:0"]'); assert tl.locator('[data-rcel="ma:0"].b2').count() == 1, 'tik zet een dagdeel op ja'; tl.click('[data-rcel="ma:0"]'); assert tl.locator('[data-rcel="ma:0"].b1').count() == 1, 'tweede tik: liever niet'
    tl.click('[data-rasteropslaan]'); tl.wait_for_selector('#toast.aan:has-text("Beschikbaarheid opgeslagen")'); tl.wait_for_selector('[data-rcel="ma:0"].b1')
    tl.screenshot(path=OUT + '/47_talent_profiel.png')
    tl.click('[data-dtab="documenten"]'); tl.click('[data-talentdoc="nieuw"]'); tl.wait_for_selector('#venster.aan #vf-soort'); tl.fill('#vf-afgifte', '2026-09-01'); tl.check('#vf-gecontroleerd'); tl.click('#venster [data-cf-opslaan]'); tl.wait_for_selector('#dTab .rij:has-text("vog")'); tl.wait_for_selector('.cijfers .vog.groen')
    # v7.7: het talentteam importeert de accountexport zelf: Instellingen → Talenten importeren uit XPS → de uitkomst inline (het venster ligt daar achter de overlay)
    tl.click('#zbInstellingen'); tl.wait_for_selector('#statusInfo [data-beheer="talentimport"]'); assert tl.locator('#statusInfo [data-beheer="urenimport"]').count() == 1, 'talent: ook de urenimport in Instellingen'
    tl.click('#statusInfo [data-beheer="talentimport"]'); tl.wait_for_selector('#xpsImportUit #talentImportKaart'); tekst = tl.inner_text('#xpsImportUit')
    assert '2 nieuw' in tekst and '3 ongewijzigd' in tekst and 'conciërge' in tekst and tl.locator('#xpsImportUit [data-cf-annuleer]').count() == 0, 'talent: talentimport inline met de tellingen, zonder Sluiten-knop: ' + tekst[:200]
    kn = tl.evaluate("(function () { var a = document.querySelector('#statusInfo [data-beheer=\"urenimport\"]').getBoundingClientRect(), b = document.querySelector('#statusInfo [data-beheer=\"talentimport\"]').getBoundingClientRect(); return [Math.abs(a.top - b.top) < 2 ? b.left - a.right : b.top - a.bottom, a.height, b.height]; })()")
    assert kn[0] >= 8 and kn[1] >= 24 and kn[2] >= 24, 'talent: de twee importknoppen staan met minstens 8 px tussenruimte en zijn op desktop minstens 24 px hoog (iOS-review v7.7; op de telefoon 40 px via .knop.klein): %s' % kn  # v7.7 (iOS-review)
    tl.click('#statusInfo [data-beheer="urenimport"]'); tl.wait_for_function("() => /XPS-uren ingelezen/.test((document.querySelector('#xpsImportUit') || {}).innerText || '')"); assert 'Accountexports overgeslagen' in tl.inner_text('#xpsImportUit'), 'talent: de urenimport meldt een overgeslagen accountexport (R4)'  # v7.7
    sh = tl.evaluate("Array.from(document.querySelectorAll('#xpsImportUit summary')).map(function (s) { return s.getBoundingClientRect().height; })")
    assert sh and all(h >= 32 for h in sh), 'talent: de uitklapregels van de urenimport hebben hun padding (zonder ±20 px, met ±36 px op desktop en 44 px op de telefoon; iOS-review v7.7): %s' % sh  # v7.7 (iOS-review)
    tl.click('#koppelSluit'); tl.wait_for_selector('#koppel.aan', state='hidden'); assert tl.locator('#statusInfo [data-beheer]').count() == 0, 'talent: na Sluiten is #statusInfo leeg (R11)'  # v7.7
    tl.click('.zb-item[data-desk="bezetting"]'); tl.wait_for_selector('.vac-kaart:has-text("NT2-ondersteuner") [data-voorstellen]'); tl.click('.vac-kaart:has-text("NT2-ondersteuner") [data-voorstellen]')
    tl.wait_for_selector('#venster.aan .match-rij'); assert tl.locator('#venster .match-rij').count() >= 2 and tl.locator('#venster .match-rij:has-text("Eva de Wit") [data-mkies]').is_disabled(), 'matchlijst; de al voorgedragene is niet aan te vinken'
    tl.click('#venster .match-rij:has-text("Noor Bakker") [data-mtoggle]'); assert tl.locator('#venster .match-rij.open .m-uitleg .b-rij').count() == 7, 'uitleg per onderdeel van de score'
    tl.screenshot(path=OUT + '/48_voorstellen.png')
    tl.check('#venster .match-rij:has-text("Noor Bakker") [data-mkies]'); tl.wait_for_selector('#venster [data-voordragen]:has-text("Voordragen (1)")'); tl.click('#venster [data-voordragen]')
    tl.wait_for_selector('#toast.aan:has-text("voorgedragen")'); tl.wait_for_selector('.vac-kaart:has-text("NT2-ondersteuner") .rij:has-text("Noor Bakker") .vog.oranje')
    tl.screenshot(path=OUT + '/49_bezetting_na_voordracht.png')
    ctx3.close()
    # v5.0: het portaal voor talenten: beschikbaarheid bevestigen via de link uit de mail, zonder koppelscherm en zonder iets in localStorage
    ctx4 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); pp = ctx4.new_page()
    pp.on('pageerror', lambda e: meldingen.append(('pageerror portaal', str(e))))
    pp.goto('http://127.0.0.1:8765/?t=testtoken12345678901234&api=http%3A%2F%2F127.0.0.1%3A8765%2Fapi'); pp.wait_for_selector('#view-portaal.actief .raster button')
    assert pp.locator('#koppel.aan').count() == 0 and not pp.locator('nav').is_visible() and 'Eva' in pp.inner_text('#portaalKop'), 'portaal zonder koppelscherm en navigatie, met de voornaam'
    pp.click('[data-rcel="vr:1"]'); pp.click('[data-pbevestig]'); pp.wait_for_selector('#toast.aan:has-text("bevestigd")')
    assert pp.evaluate("() => Object.keys(localStorage).filter(k => k.indexOf('aa_') === 0).length") == 0, 'het portaal schrijft niets in localStorage'
    pp.screenshot(path=OUT + '/50_portaal.png', full_page=True)
    pp.click('[data-popslaan]'); pp.wait_for_selector('#toast.aan:has-text("Opgeslagen")')
    pp.goto('http://127.0.0.1:8765/?t=verkeerdtoken12345678&api=http%3A%2F%2F127.0.0.1%3A8765%2Fapi'); pp.wait_for_selector('#portaalKop:has-text("werkt niet meer")')
    ctx4.close()
    scenario_bezetting_per_project(b)  # v7.5: eigen context, zodat de keuze Per project (localStorage) de stappen hierboven niet raakt
    # v7.9 (R13) "v7.9 oude backend": apiCrm zonder backendVersie (Code.gs nog 7.8) → de app verbergt Week, MT en de Beheer-knoppen van v7.9, zonder foutmelding
    assert mock_post({'fn': '_backendVersie', 'args': ['7.8']}).get('ok'), 'de mock kent _backendVersie'
    c8 = b.new_context(viewport={'width': 1280, 'height': 800}); p8 = c8.new_page(); fouten8 = []
    p8.on('pageerror', lambda e: meldingen.append(('pageerror oude backend', str(e))))
    p8.goto(BASIS + '/'); p8.wait_for_selector('#apiInput'); p8.fill('#apiInput', BASIS + '/api'); p8.fill('#codeInput', 'test123'); p8.click('#codeOpslaan'); p8.wait_for_selector('#homeInhoud .hkaart'); p8.wait_for_timeout(800)
    p8.click('.zb-item[data-desk="rapporten"]'); p8.wait_for_selector('#crmInhoud .tabel'); p8.wait_for_timeout(500)
    assert p8.locator('[data-rweergave]').count() == 0 and p8.locator('[data-beheer="cijfers"], [data-beheer="aannames"], [data-beheer="v79"], [data-beheer="werkelijkedatums"]').count() == 0 and p8.locator('#dqBlok').count() == 0, 'oude backend: geen Week, MT, datakwaliteit of v7.9-beheer'
    assert p8.locator('#toast.aan:has-text("Niet gelukt")').count() == 0, 'oude backend: geen foutmelding'
    # v7.9 (iOS-review): antwoordt de backend "Herlaad de app" (eisNieuweApp), dan de balk #updateBalk met Herladen en Later en een update-check van de
    # worker, want in standalone heeft de toast geen herlaadknop; nooit vanzelf herladen. v7.9 (iOS-review, tweede ronde): de balk komt pas ná de
    # update-check (anders gaf Herladen de oude index.html uit de cache); hier vertraagt de test r.update() met 800 ms. Op de mock staat geen nieuwe
    # worker, dus na de check meteen de balk (met een nieuwe worker toont controllerchange hem; dat zit niet in deze suite)
    assert mock_post({'fn': '_faal', 'args': ['apiHome', 1, 'Herlaad de app: er is een nieuwe versie. Sluit de app en open hem opnieuw.']}).get('ok'), 'de mock kent _faal met een eigen melding'
    assert p8.evaluate("() => navigator.serviceWorker.ready.then(function (r) { return !!r.active; })"), 'Herlaad de app: de worker is actief (er is een registratie om te updaten)'
    p8.evaluate("""() => { window.__blijft = 1; window.__swUpdate = 0; window.__updateKlaar = 0; window.__balkOp = 0; var sw = navigator.serviceWorker, g = sw.getRegistration.bind(sw);
      sw.getRegistration = function () { return g().then(function (r) { if (r && !r.__gevolgd) { r.__gevolgd = 1; var u = r.update.bind(r);
        r.update = function () { window.__swUpdate++; return new Promise(function (ok) { setTimeout(ok, 800); }).then(function () { return u(); }).then(function (x) { window.__updateKlaar = performance.now(); return x; }); }; } return r; }); };
      var balk = document.getElementById('updateBalk'); new MutationObserver(function () { if (!balk.hidden && !window.__balkOp) window.__balkOp = performance.now(); }).observe(balk, { attributes: true }); }""")
    p8.evaluate("() => run('apiHome').catch(function () {})"); p8.wait_for_selector('#toast.aan:has-text("Sluit de app en open hem opnieuw")', timeout=5000); p8.wait_for_timeout(300)
    assert p8.locator('#updateBalk:not([hidden])').count() == 0 and p8.evaluate("window.__swUpdate") == 1 and not p8.evaluate("window.__updateKlaar"), 'Herlaad de app: tijdens de update-check nog geen balk'
    p8.wait_for_selector('#updateBalk:not([hidden])', timeout=5000); p8.wait_for_timeout(300)
    assert p8.locator('#updateBalk [data-update="herladen"]').is_visible() and p8.evaluate("window.__swUpdate") == 1 and p8.evaluate("window.__updateKlaar > 0 && window.__balkOp >= window.__updateKlaar") and p8.evaluate("window.__blijft") == 1, 'Herlaad de app: de balk Nieuwe versie met Herladen pas na de update-check, en geen automatisch herladen'
    p8.click('#updateBalk [data-update="later"]'); assert p8.locator('#updateBalk:not([hidden])').count() == 0 and p8.evaluate("window.__blijft") == 1, 'Herlaad de app: Later verbergt de balk'
    c8.close(); mock_post({'fn': '_reset'})
    b.close()
meldingen = [m for m in meldingen if '/api/config' not in ' '.join(m)]  # v6.1: zonder eigen server (GitHub Pages, deze mock) geeft api/config een 404; die is verwacht
print('meldingen:', json.dumps(meldingen, indent=1, ensure_ascii=False) if meldingen else 'geen')
print('api-aanroepen van de hoofdpagina: %d, looptijd %.0f s' % (len(API_LOG), time.time() - T0))
KLAAR['ok'] = True
print('ALLES GOED' if not meldingen else 'FOUTEN: %d' % len(meldingen))  # v7.3 (FL-7)
sys.exit(1 if meldingen else 0)
