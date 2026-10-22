# Browsertest van alle zes schermen tegen test/mock_backend.py (Playwright, Chromium uit /opt/pw-browsers).
import os, sys, json
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots'); os.makedirs(OUT, exist_ok=True)  # draai eerst: python3 test/mock_backend.py
meldingen = []
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
def sleep_naar(pg, kaart, kolom):  # v6.7: kaart met de muis naar een andere kolom slepen
    a = pg.locator(kaart).bounding_box(); b = pg.locator(kolom).bounding_box()
    pg.mouse.move(a['x'] + 20, a['y'] + 15); pg.mouse.down(); pg.mouse.move(a['x'] + 40, a['y'] + 30, steps=4)
    pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + 80, steps=10); pg.mouse.up(); pg.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('console', lambda m: meldingen.append((m.type, m.text, m.location.get('url', ''))) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: meldingen.append(('pageerror', str(e))))
    page.on('response', lambda r: meldingen.append(('http', str(r.status) + ' ' + r.url)) if r.status >= 400 else None)
    page.goto('http://127.0.0.1:8765/'); page.wait_for_timeout(800)
    page.screenshot(path=OUT + '/00_koppel.png')
    page.fill('#apiInput', 'http://127.0.0.1:8765/api'); page.fill('#codeInput', 'test123'); page.click('#codeOpslaan')
    page.wait_for_selector('#kpis .tegel'); page.wait_for_timeout(500)
    page.screenshot(path=OUT + '/01_vandaag.png', full_page=True)
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
    page.select_option('[data-kstatus="c1"]', 'gesprek'); page.wait_for_selector('select.pill.p-gesprek[data-kstatus="c1"]'); page.wait_for_timeout(300)
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
    ali = page.locator('.vac-kaart:has-text("Taalcoach") [data-kstatus]'); ali.select_option('klaar voor start'); page.wait_for_selector('.vac-kaart:has-text("Taalcoach") .vac-teller.vol')
    page.wait_for_timeout(300); assert '1/3' in page.inner_text('[data-dtab="bezetting"]'), 'tab telt de bezetting: ' + page.inner_text('[data-dtab="bezetting"]')
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
    page.on('dialog', lambda dl: dl.accept('Te duur') if dl.type == 'prompt' else dl.accept())
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
    page.click('[data-archief]'); page.wait_for_selector('#archiefTijdlijn .t-item')
    page.go_back(); page.wait_for_selector('#crmLijstScherm [data-crmtab]'); page.wait_for_timeout(150)
    page.click('[data-crmtab="pipeline"]'); page.wait_for_selector('.kolom'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/13_pipeline.png', full_page=True)
    page.click('.kaartje[data-crm-open="kans:k1"]'); page.wait_for_selector('[data-kansfase]'); page.wait_for_timeout(150)
    page.select_option('[data-kansfase]', 'onderhandeling'); page.wait_for_selector('.t-item:has-text("voorstel → onderhandeling")'); page.wait_for_timeout(150)
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
    page.click('[data-taakweergave="alles"]'); page.wait_for_selector('[data-taakklaar="tk3"]')
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
    page.click('[data-beheer="gebruikers"]'); page.wait_for_selector('#cf-naam'); page.fill('#cf-naam', 'Sanne'); page.fill('#cf-email', 'sanne@voorbeeld.nl'); page.select_option('#cf-team', 'consultancy'); page.select_option('#cf-rol', 'teamlead'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.codevak'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/17_beheer_gebruikers.png', full_page=True)
    page.click('[data-gbewerk="g1"]'); page.wait_for_selector('#venster.aan #vf-naam'); page.fill('#vf-naam', 'Mees de Jong'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#crmBeheer:has-text("Mees de Jong")')  # v3.7
    page.click('[data-beheer="keuzelijsten"]'); page.wait_for_selector('#le-schoolStatussen .le-rij'); page.locator('#le-schoolStatussen .le-rij input').first.fill('nieuw'); page.fill('#cf-schooljaar', '2027-2028'); page.click('#crmBeheer [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Keuzelijsten opgeslagen")')
    page.click('[data-beheer="mijlpalen"]'); page.wait_for_selector('#leMijlpalen .le-rij'); page.click('[data-le-erbij="leMijlpalen"]'); inp = page.locator('#leMijlpalen .le-rij').last.locator('input')
    inp.nth(0).fill('Scholen'); inp.nth(1).fill('contract'); inp.nth(2).fill('90'); inp.nth(3).fill('5'); page.screenshot(path=OUT + '/17b_beheer_mijlpalen.png', full_page=True); page.click('#crmBeheer [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Mijlpalen opgeslagen")')
    page.click('[data-beheer="tags"]'); page.wait_for_selector('#crmBeheer [data-hernoem]')
    page.click('[data-beheer="talentrun"]'); page.wait_for_selector('#toast.aan:has-text("Talentrun klaar")')  # v5.0
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
    page.fill('#vf-aantal', '2'); page.fill('#vf-startdatum', '2026-11-16'); page.fill('#vf-rooster', 'di en do 9-13 uur'); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('.t-item:has-text("→ gewonnen")'); page.wait_for_timeout(150)
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
    page.click('#instellingenKnop'); page.wait_for_selector('#statusInfo .k-rij'); page.wait_for_timeout(200)
    page.click('#statusInfo [data-herinneringen="0"]'); page.wait_for_selector('#statusInfo [data-herinneringen="1"]:has-text("Uit")')  # v4.6: herinneringsmail uitzetten
    page.click('#statusInfo [data-herinneringen="1"]'); page.wait_for_selector('#statusInfo [data-herinneringen="0"]:has-text("Aan")')
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
    page.fill('.ftabel [data-pveld="factuurnummer"][data-pid="t2"]', '20210010'); page.press('.ftabel [data-pveld="factuurnummer"][data-pid="t2"]', 'Tab'); page.wait_for_timeout(300)
    page.screenshot(path=OUT + '/29_desk_facturatie.png')
    # v6.5: Financiën per schooljaar, school en project
    page.click('.zb-item[data-desk="financien"]'); page.wait_for_selector('table.fin [data-finopen]')
    page.click('table.fin [data-finopen]'); page.wait_for_selector('table.fin td.fin-project'); page.wait_for_timeout(150)
    assert page.locator('[data-finexact]').is_visible(), 'financien: Exact-knop voor management'
    page.click('[data-finkas="1"]'); page.wait_for_selector('[data-finkas="1"].aan')
    page.screenshot(path=OUT + '/29b_desk_financien.png')
    page.click('.zb-item[data-desk="rapporten"]'); page.wait_for_selector('.tabel'); page.wait_for_timeout(150)
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
    b.close()
meldingen = [m for m in meldingen if '/api/config' not in ' '.join(m)]  # v6.1: zonder eigen server (GitHub Pages, deze mock) geeft api/config een 404; die is verwacht
print('meldingen:', json.dumps(meldingen, indent=1, ensure_ascii=False) if meldingen else 'geen')
