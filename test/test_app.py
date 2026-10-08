# Browsertest van alle zes schermen tegen test/mock_backend.py (Playwright, Chromium uit /opt/pw-browsers).
import os, sys, json
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots'); os.makedirs(OUT, exist_ok=True)  # draai eerst: python3 test/mock_backend.py
meldingen = []
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
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
    page.click('[data-klaar="a1"]'); page.wait_for_timeout(300)
    page.fill('#actieInput', 'Testactie uit de browser'); page.press('#actieInput', 'Enter'); page.wait_for_timeout(600)
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
    assert page.locator('.p-groep h3:has-text("Lopende trajecten")').count() == 1 and page.locator('[data-crm-open="project:t3"]').count() == 0, 'alleen eigen projecten'
    page.screenshot(path=OUT + '/07a_projecten_am.png', full_page=True)
    page.click('#projectAms [data-pam=""]'); page.wait_for_selector('[data-crm-open="project:t3"]')
    page.click('.p-groep h3:has-text("Afgelopen")'); page.wait_for_selector('[data-crm-open="project:t5"]')
    page.click('[data-pweergave="verlenging"]'); page.wait_for_selector('.p-groep h3:has-text("Voorstel verstuurd")'); assert page.locator('[data-crm-open="project:t5"]').count() == 0, 'verlenging: alleen het huidige schooljaar'  # v4.1
    assert 'schooljaar 2026-2027' in page.inner_text('#trajectTelling'), 'telling noemt het schooljaar'
    page.screenshot(path=OUT + '/07b_projecten_verlenging.png', full_page=True)
    page.click('[data-pweergave="examen"]'); page.wait_for_selector('[data-crm-open="project:t6"]'); assert page.locator('[data-crm-open="project:t1"]').count() == 0, 'alleen examentraining'
    page.select_option('[data-pveld="status"][data-pid="t6"]', 'bezig'); page.wait_for_selector('select.pill.p-bezig[data-pid="t6"]')
    page.click('[data-pweergave="am"]'); page.click('#projectAms [data-pam="Menno"]'); page.wait_for_selector('[data-crm-open="project:t1"]')
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
    assert '1/3' in page.inner_text('[data-dtab="bezetting"]'), 'tab telt de bezetting'
    page.locator('.vac-kaart:has-text("Taalcoach") [data-kandidaat]:not([data-kandidaat="nieuw"])').first.click(); page.wait_for_selector('#venster.aan [data-kopieerxps]'); page.click('#venster [data-cf-annuleer]')
    page.screenshot(path=OUT + '/07f_project_bezetting.png', full_page=True)
    assert page.locator('[data-kopieerxpsproject]').count() == 1, 'knop Kopieer voor XPS op het project'  # v4.1
    page.click('[data-crm-terug]'); page.wait_for_selector('#view-trajecten.actief .vac-kaart'); page.click('[data-pweergave="am"]'); page.wait_for_selector('[data-crm-open="project:t1"]')
    page.click('[data-crm-open="project:t1"]'); page.wait_for_selector('.d-naam h2:has-text("Onderwijsondersteuning")')
    page.select_option('.d-links [data-pveld="gefactureerd"]', 'nee'); page.wait_for_selector('.d-links select.pill.p-nee')
    page.locator('[data-composer="notitie"]').first.click(); page.fill('#crmComposer #cf-tekst', 'Update van de accountmanager'); page.click('#crmComposer [data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("Update van de accountmanager")')
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
    page.click('[data-composer="gesprek"]'); page.fill('#cf-onderwerp', 'Evaluatie periode 1'); page.fill('#cf-tekst', 'Tevreden over de ondersteuner.'); page.click('[data-cf-opslaan]')
    page.wait_for_selector('.t-item:has-text("Evaluatie periode 1")'); page.wait_for_timeout(200)
    page.locator('.t-item:has-text("Evaluatie periode 1") [data-actbewerk]').click(); page.wait_for_selector('#venster.aan #vf-onderwerp')  # v3.7
    page.fill('#vf-onderwerp', 'Evaluatie periode 1 (bijgesteld)'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("(bijgesteld)")')
    page.screenshot(path=OUT + '/12b_tijdlijn_bewerken.png', full_page=True)
    page.click('[data-composer="notitie"]'); page.fill('#crmComposer #cf-tekst', 'Notitie naast het venster')  # v3.7: een open formulier blijft werken na het venster
    page.locator('.t-item [data-actbewerk]').first.click(); page.wait_for_selector('#venster.aan'); page.click('#venster [data-cf-annuleer]')
    page.click('#crmComposer [data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("Notitie naast het venster")')
    page.screenshot(path=OUT + '/12_school_detail.png', full_page=True)
    page.click('[data-dtab="projecten"]'); page.wait_for_selector('#dTab [data-crm-open^="project:"]'); page.click('[data-dtab="historie"]')  # v3.8: tabs, samenvatting, filters
    page.click('[data-samenvatting]'); page.wait_for_selector('.samenvatting')
    page.select_option('[data-tl="type"]', 'gesprek'); n = page.locator('#tlLijst .t-item').count(); assert n >= 1 and n == page.locator('#tlLijst .t-ic.gesprek').count(), 'filter op soort'
    page.select_option('[data-tl="type"]', ''); page.fill('[data-tl="zoek"]', 'Tevreden'); page.wait_for_timeout(100); assert page.locator('#tlLijst .t-item').count() == 1, 'zoeken in historie'
    page.fill('[data-tl="zoek"]', '')
    page.click('[data-composer="afspraak"]'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.t-item:has-text("Gesprek Voorbeeldcollege Zuid")'); page.wait_for_timeout(100)
    page.locator('.t-item:has-text("Gesprek Voorbeeldcollege Zuid") [data-actbewerk]').first.click(); page.wait_for_selector('#venster.aan [data-actweg]'); page.click('#venster [data-actweg]')  # v3.7: verwijderen
    page.wait_for_selector('.t-item:has-text("Gesprek Voorbeeldcollege Zuid")', state='detached')
    page.click('[data-composer="persoon"]'); page.fill('#cf-voornaam', 'Dirk'); page.fill('#cf-achternaam', 'Smit'); page.click('[data-cf-opslaan]'); page.wait_for_timeout(400)
    page.click('[data-dtab="personen"]'); page.wait_for_selector('#dTab .rij:has-text("Dirk Smit")'); page.click('[data-dtab="historie"]')
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
    page.click('[data-taakklaar="tk1"]'); page.wait_for_timeout(500)
    page.click('[data-crmnieuw="taak"]'); page.fill('#cf-tekst', 'Offerte surveillance maken'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.rij:has-text("Offerte surveillance maken")'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/15_taken.png', full_page=True)
    page.click('.rij [data-taakbewerk]:has-text("Offerte surveillance maken")'); page.wait_for_selector('#venster.aan #vf-tekst')  # v3.7
    page.screenshot(path=OUT + '/15b_taak_venster.png', full_page=True)
    page.fill('#vf-tekst', 'Offerte surveillance versturen'); page.select_option('#vf-prio', 'hoog'); page.click('#venster [data-cf-opslaan]')
    page.wait_for_selector('.rij:has-text("Offerte surveillance versturen")', timeout=1500)  # meteen zichtbaar, zonder te herladen
    page.click('[data-taakbewerk="tk1"]'); page.wait_for_selector('#venster.aan [data-taakheropen]'); page.click('[data-taakheropen]'); page.wait_for_selector('[data-taakklaar="tk1"]')
    page.click('[data-taakbewerk="tk2"]'); page.wait_for_selector('#venster.aan [data-taakweg]'); page.click('[data-taakweg]'); page.wait_for_selector('[data-taakbewerk="tk2"]', state='detached')
    page.click('[data-crmtab="rapport"]'); page.wait_for_selector('.tabel'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/16_rapport.png', full_page=True)
    print('horizontale scroll (rapport):', page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    page.wait_for_selector('#rapportActiviteit .t-item')  # v3.3: activiteit per gebruiker
    page.click('[data-beheer="gebruikers"]'); page.wait_for_selector('#cf-naam'); page.fill('#cf-naam', 'Sanne'); page.fill('#cf-email', 'sanne@voorbeeld.nl'); page.select_option('#cf-team', 'consultancy'); page.select_option('#cf-rol', 'teamlead'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.codevak'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/17_beheer_gebruikers.png', full_page=True)
    page.click('[data-gbewerk="g1"]'); page.wait_for_selector('#venster.aan #vf-naam'); page.fill('#vf-naam', 'Mees de Jong'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#crmBeheer:has-text("Mees de Jong")')  # v3.7
    page.click('[data-beheer="keuzelijsten"]'); page.wait_for_selector('#le-schoolStatussen .le-rij'); page.locator('#le-schoolStatussen .le-rij input').first.fill('nieuw'); page.fill('#cf-schooljaar', '2027-2028'); page.click('#crmBeheer [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Keuzelijsten opgeslagen")')
    page.click('[data-beheer="mijlpalen"]'); page.wait_for_selector('#leMijlpalen .le-rij'); page.click('[data-le-erbij="leMijlpalen"]'); inp = page.locator('#leMijlpalen .le-rij').last.locator('input')
    inp.nth(0).fill('Scholen'); inp.nth(1).fill('contract'); inp.nth(2).fill('90'); inp.nth(3).fill('5'); page.screenshot(path=OUT + '/17b_beheer_mijlpalen.png', full_page=True); page.click('#crmBeheer [data-cf-opslaan]'); page.wait_for_selector('#toast.aan:has-text("Mijlpalen opgeslagen")')
    page.click('[data-beheer="tags"]'); page.wait_for_selector('#crmBeheer [data-hernoem]')
    page.click('[data-beheer="doelen"]'); page.wait_for_selector('#venster.aan [data-doelbewerk]'); page.locator('[data-doelbewerk]').first.click(); page.wait_for_selector('#venster.aan #vf-doel'); page.fill('#vf-doel', '12'); page.click('#venster [data-cf-opslaan]'); page.wait_for_selector('#venster.aan [data-doelbewerk]'); page.click('#venster [data-cf-annuleer]')
    page.click('[data-beheer="capsule"]'); page.wait_for_selector('#crmBeheer:has-text("klaar")', timeout=8000)
    page.click('[data-crmtab="scholen"]'); page.click('[data-crmnieuw="school"]'); page.fill('#cf-naam', 'Testschool Noord'); page.fill('#cf-plaats', 'Groningen'); page.click('[data-cf-opslaan]'); page.wait_for_selector('.d-naam h2:has-text("Testschool Noord")')
    page.click('[data-composer="kans"]'); page.fill('#cf-naam', 'Studentdocenten'); page.fill('#cf-waarde', '8000'); page.click('[data-cf-opslaan]'); page.wait_for_selector('[data-kansfase]')
    page.select_option('[data-kansfase]', 'gewonnen'); page.wait_for_selector('.t-item:has-text("→ gewonnen")'); page.wait_for_timeout(150)
    page.wait_for_selector('.d-links [data-crm-open^="project:"]'); page.click('.d-links [data-crm-open^="project:"]'); page.wait_for_selector('.t-item:has-text("Overdracht")')  # v3.8: gewonnen = project met overdracht
    page.go_back(); page.wait_for_selector('[data-kansfase]')
    page.screenshot(path=OUT + '/18_kans_gewonnen.png', full_page=True)
    page.click('nav button[data-view="vandaag"]'); page.wait_for_selector('#kansenLijst [data-crm-open]'); page.click('#kansenLijst [data-crm-open="kans:k2"]'); page.wait_for_selector('[data-kansfase]'); page.wait_for_timeout(150)
    assert page.locator('#view-relaties.actief').count() == 1, 'kans vanuit Vandaag opent in Relaties'
    page.click('#instellingenKnop'); page.wait_for_selector('#statusInfo .k-rij'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/09_instellingen.png', full_page=True)
    page.click('#koppelSluit')
    # v3.0: desktopweergave (zijbalk, Capsule-opbouw)
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    assert page.locator('body.desk #zijbalk').is_visible(), 'zijbalk op desktop'
    page.click('.zb-item[data-desk="home"]'); page.wait_for_selector('#homeInhoud .hkaart'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/20_desk_home.png')
    page.click('.zb-item[data-desk="contacten"]'); page.wait_for_selector('.dtabel tr.klik'); page.wait_for_timeout(150)
    page.click('th[data-sorteer="plaats"]'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/21_desk_contacten.png')
    page.click('#crmBalk [data-crmtab="personen"]'); page.wait_for_selector('.dtabel tr[data-crm-open^="persoon:"]')
    page.click('#crmBalk [data-crmtab="scholen"]'); page.click('.dtabel tr[data-crm-open="school:s1"]'); page.wait_for_selector('.detail-3'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/22_desk_school.png')
    page.click('.zb-item[data-desk="taken"]'); page.wait_for_selector('.dtabel [data-taakklaar]'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/23_desk_taken.png')
    page.locator('.dtabel tr[data-taakbewerk] td:nth-child(2)').first.click(); page.wait_for_selector('#venster.aan #vf-tekst'); page.screenshot(path=OUT + '/23b_desk_taak_venster.png'); page.click('#venster [data-cf-annuleer]')  # v3.7
    page.click('.zb-item[data-desk="agenda"]'); page.wait_for_selector('.maand .dag'); page.wait_for_timeout(200)
    page.screenshot(path=OUT + '/24_desk_agenda.png')
    page.click('[data-agnav="1"]'); page.wait_for_timeout(300); page.click('[data-agnav="0"]'); page.wait_for_selector('.maand .dag.vandaag')
    page.click('[data-agendaplan]'); page.wait_for_selector('#agendaForm #cf-schoolId'); page.select_option('#cf-schoolId', 's1'); page.fill('#cf-titel', 'Evaluatie'); page.click('#agendaForm [data-cf-opslaan]'); page.wait_for_timeout(500)
    page.click('.zb-item[data-desk="pipeline"]'); page.wait_for_selector('.kolom'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/25_desk_pipeline.png')
    page.click('.zb-item[data-desk="projecten"]'); page.wait_for_selector('.ftabel [data-crm-open="project:t1"]'); page.wait_for_timeout(150)  # v4.0: bord per accountmanager
    page.select_option('.ftabel [data-pveld="verlenging"][data-pid="t2"]', 'verlengd'); page.wait_for_selector('.ftabel select.pill.p-verlengd[data-pid="t2"]')
    assert page.locator('.ftabel a.p-link[href^="https://docs.google.com"]').count() >= 1, 'link naar samenwerkingsvoorstel'
    page.screenshot(path=OUT + '/26_desk_projecten.png')
    page.click('.zb-item[data-desk="bezetting"]'); page.wait_for_selector('.vac-grid .vac-kaart'); page.wait_for_timeout(150)  # v4.1
    assert page.locator('.zb-item.aan[data-desk="bezetting"]').count() == 1, 'zijbalk: Bezetting actief'
    page.screenshot(path=OUT + '/26c_desk_bezetting.png')
    page.click('.zb-item[data-desk="projecten"]'); page.wait_for_selector('.ftabel [data-crm-open="project:t1"]')
    page.click('[data-pweergave="huidig"]'); page.wait_for_timeout(200); assert 'schooljaar 2027-2028' in page.inner_text('#trajectTelling'), 'ingesteld schooljaar wordt gebruikt'
    page.click('[data-pweergave="bord"]'); page.wait_for_selector('.kaartje[data-crm-open^="project:"]'); page.wait_for_timeout(150)
    page.screenshot(path=OUT + '/26a_desk_projecten_bord.png')
    page.click('.kaartje[data-crm-open="project:t1"]'); page.wait_for_selector('.d-naam h2:has-text("Onderwijsondersteuning")'); assert page.locator('.zb-item.aan[data-desk="projecten"]').count() == 1
    page.screenshot(path=OUT + '/26b_desk_project.png')
    page.click('.zb-item[data-desk="facturatie"]'); page.wait_for_selector('.ftabel [data-pveld="gefactureerd"]')  # v3.8: facturatiebord
    page.select_option('.ftabel [data-pveld="gefactureerd"][data-pid="t2"]', 'ja'); page.wait_for_selector('.ftabel select.pill.p-ja[data-pid="t2"]')
    page.click('[data-factopen="t1"]'); page.wait_for_selector('tr.f-sub [data-fstatus="f2"]'); page.select_option('[data-fstatus="f2"]', 'aangemaakt'); page.wait_for_timeout(300)
    page.fill('.ftabel [data-pveld="factuurnummer"][data-pid="t2"]', '20210010'); page.press('.ftabel [data-pveld="factuurnummer"][data-pid="t2"]', 'Tab'); page.wait_for_timeout(300)
    page.screenshot(path=OUT + '/29_desk_facturatie.png')
    page.click('.zb-item[data-desk="rapporten"]'); page.wait_for_selector('.tabel'); page.wait_for_timeout(150)
    page.click('.zb-item[data-desk="doelen"]'); page.wait_for_selector('.doel-rij'); page.wait_for_timeout(150)
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
    page.click('[data-composer="notitie"]'); page.fill('#cf-tekst', 'Half getypt')
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
    assert tl.locator('.zb-item[data-desk="bezetting"]').is_visible() and not tl.locator('.zb-item[data-desk="pipeline"]').is_visible() and not tl.locator('.zb-item[data-desk="facturatie"]').is_visible(), 'menu talent'
    tl.click('.zb-item[data-desk="projecten"]'); tl.wait_for_selector('.vac-grid .vac-kaart'); assert tl.locator('#projectWeergaven .chip.aan[data-pweergave="bezetting"]').count() == 1, 'talent begint bij bezetting'
    tl.locator('.vac-kaart a[data-crm-open="project:t4"]').first.click(); tl.wait_for_selector('#dTab .vac-kaart'); assert tl.locator('[data-dtab="bezetting"].aan').count() == 1, 'project opent bij de bezetting'
    assert tl.locator('.d-links .kop:has-text("Facturatie")').count() == 0, 'talent ziet geen facturatie'
    tl.screenshot(path=OUT + '/43_talent_project.png')
    ctx3.close()
    b.close()
print('meldingen:', json.dumps(meldingen, indent=1, ensure_ascii=False) if meldingen else 'geen')
