# Mock van de Apps Script-backend voor lokaal testen van index.html (zelfde origin: repo-root statisch + /api). Start: python3 test/mock_backend.py
import json, datetime, uuid, copy, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial

SECRET = 'test123'
vandaag = datetime.date.today()
def d(n): return (vandaag + datetime.timedelta(days=n)).isoformat()
def nu(): return datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

ACTIES = [
    {'id': 'a1', 'tekst': 'Voorstel ISK Voorbeeld nabellen', 'bron': 'kans', 'prio': 'hoog', 'deadline': d(-1), 'link': '', 'over': 1},
    {'id': 'a2', 'tekst': 'Contract Lyceum Demo laten tekenen', 'bron': 'contract', 'prio': 'hoog', 'deadline': d(0), 'link': '', 'over': 0},
    {'id': 'a3', 'tekst': 'Rooster Voorbeeldcollege Zuid bevestigen', 'bron': 'handmatig', 'prio': 'midden', 'deadline': d(3), 'link': '', 'over': -3},
    {'id': 'a4', 'tekst': 'Evaluatiegesprek Montessori Demo inplannen', 'bron': 'review', 'prio': 'laag', 'deadline': '', 'link': '', 'over': None},
]
TRAJECTEN = [
    {'id': 't1', 'school': 'Voorbeeldcollege Zuid', 'plaats': 'Rotterdam', 'traject': 'Onderwijsondersteuning', 'schooljaar': '2026-2027', 'start': '2026-09-01', 'eind': '2027-05-31', 'status': 'bezig', 'ondersteuners': 2, 'urenPerWeek': 30, 'tarief': 48.5, 'omzet': 40740, 'contactpersoon': 'A. de Vries', 'am': 'Menno', 'samenvatting': 'Lesopvang bij verlof, huiswerklokaal en klassenassistentie.', 'bijgewerkt': nu()},
    {'id': 't2', 'school': 'Lyceum Demo', 'plaats': 'Den Haag', 'traject': 'Huiswerkbegeleiding', 'schooljaar': '2026-2027', 'start': '2026-09-07', 'eind': '2027-06-30', 'status': 'bezig', 'ondersteuners': 1, 'urenPerWeek': 8, 'tarief': 42, 'omzet': 12000, 'contactpersoon': 'B. Jansen', 'am': 'Menno', 'samenvatting': '', 'bijgewerkt': nu()},
    {'id': 't3', 'school': 'Montessori Demo', 'plaats': 'Utrecht', 'traject': 'Studentdocent', 'schooljaar': '2026-2027', 'start': '2026-08-24', 'eind': '2026-12-20', 'status': 'bezig', 'ondersteuners': 1, 'urenPerWeek': 16, 'tarief': 45, 'omzet': 11520, 'contactpersoon': 'D. Visser', 'am': 'Mees', 'samenvatting': 'Duits, onderbouw.', 'bijgewerkt': nu()},
    {'id': 't4', 'school': 'ISK Voorbeeld', 'plaats': 'Delft', 'traject': 'NT2-ondersteuning', 'schooljaar': '2026-2027', 'start': '2026-11-02', 'eind': '2027-04-30', 'status': 'opstart', 'ondersteuners': 1, 'urenPerWeek': 16, 'tarief': 47, 'omzet': 15040, 'contactpersoon': 'C. Bakker', 'am': 'Menno', 'samenvatting': '', 'bijgewerkt': nu()},
    {'id': 't5', 'school': 'Voorbeeldcollege Zuid', 'plaats': 'Rotterdam', 'traject': 'Examentraining', 'schooljaar': '2025-2026', 'start': '2026-03-01', 'eind': '2026-05-15', 'status': 'afgelopen', 'ondersteuners': 3, 'urenPerWeek': 12, 'tarief': 46, 'omzet': 8280, 'contactpersoon': 'A. de Vries', 'am': 'Menno', 'samenvatting': 'Wiskunde A en Nederlands, 42 leerlingen.', 'bijgewerkt': '2026-05-20 10:00'},
]
KANSEN = [
    {'id': 'k1', 'school': 'ISK Voorbeeld', 'traject': 'NT2-ondersteuning', 'fase': 'voorstel', 'waarde': 15040, 'volgendeActie': 'Voorstel nabellen', 'deadline': d(2), 'dagenStil': 9},
    {'id': 'k2', 'school': 'Lyceum Demo', 'traject': 'Examentraining', 'fase': 'gesprek', 'waarde': 9000, 'volgendeActie': 'Afspraak met teamleider', 'deadline': d(5), 'dagenStil': 2},
]
DOCS = [
    {'id': 'd1', 'titel': 'Overeenkomst onderwijsondersteuning Voorbeeldcollege Zuid 2026-27.pdf', 'type': 'contract', 'school': 'Voorbeeldcollege Zuid', 'url': 'https://drive.google.com/', 'gewijzigd': '2026-09-15 14:02', 'woorden': 2140},
    {'id': 'd2', 'titel': 'Werkwijze start traject (checklist AM)', 'type': 'werkwijze', 'school': '', 'url': 'https://drive.google.com/', 'gewijzigd': '2026-08-30 09:10', 'woorden': 860},
    {'id': 'd3', 'titel': 'Schooldossier Lyceum Demo', 'type': 'schooldossier', 'school': 'Lyceum Demo', 'url': 'https://drive.google.com/', 'gewijzigd': '2026-09-20 16:45', 'woorden': 1230},
    {'id': 'd4', 'titel': 'Samenwerkingsvoorstel NT2 ISK Voorbeeld 2026-27', 'type': 'voorstel', 'school': 'ISK Voorbeeld', 'url': 'https://drive.google.com/', 'gewijzigd': '2026-09-18 11:20', 'woorden': 1480},
    {'id': 'd5', 'titel': 'Prijzenlijst 2026-2027', 'type': 'prijslijst', 'school': '', 'url': 'https://drive.google.com/', 'gewijzigd': '2026-07-01 08:00', 'woorden': 320},
    {'id': 'd6', 'titel': 'Verzuimbeleid.pdf', 'type': 'overig', 'school': '', 'url': 'https://drive.google.com/', 'gewijzigd': '2026-06-11 08:00', 'woorden': 0},
]
REVIEW = {'id': 'r1', 'datum': d(0), 'gemaaktOp': d(0) + ' 05:02',
    'samenvatting': 'Goedemorgen Menno. Gisteren heb je drie dingen afgerond en vier mails verstuurd. Blijven liggen: het voorstel voor ISK Voorbeeld wacht al negen dagen op opvolging. Vandaag staat het gesprek met Lyceum Demo om 10:00, en de deadline voor het contract.',
    'gedaan': [{'tekst': 'Rooster Montessori Demo afgestemd', 'bron': 'actie'}, {'tekst': '4 mails verstuurd', 'bron': 'mail'}, {'tekst': 'Document bijgewerkt: Schooldossier Lyceum Demo', 'bron': 'document'}],
    'blijvenLiggen': [{'tekst': 'Kans ISK Voorbeeld (NT2-ondersteuning): 9 dagen geen contact — Voorstel nabellen', 'bron': 'kans', 'dagen': 9}, {'tekst': 'Mail van A. de Vries onbeantwoord: Rooster periode 2', 'bron': 'mail', 'dagen': 4, 'link': 'https://mail.google.com/'}],
    'vandaag': [{'tekst': '10:00 · Gesprek teamleider Lyceum Demo', 'bron': 'agenda'}, {'tekst': 'Deadline: Contract Lyceum Demo laten tekenen', 'bron': 'actie'}],
    'tellingen': {'gedaan': 3, 'blijvenLiggen': 2, 'vandaag': 2}}
HUIS = {'bedrijf': 'AthenaSchool', 'omschrijving': 'AthenaSchool levert onderwijsondersteuning aan scholen.', 'kleur_primair': '#66306E', 'kleur_accent': '#FAA11B', 'kleur_secundair': '#5D0095', 'kleur_tekst': '#241A28', 'kleur_achtergrond': '#FBF9F6', 'lettertype_kop': 'Nunito', 'lettertype_tekst': 'Nunito', 'lettertype_alternatief': 'Arial', 'logo_url': '',
    'toon': 'Warm en professioneel, in de wij-vorm.\nConcreet: wat we doen, voor wie, en wat het oplevert.\nGeen jargon, geen uitroeptekens.', 'zinnen': 'Vast gezicht | We koppelen een vaste ondersteuner aan de school.\nVOG | Onze medewerkers hebben een VOG.'}
CONTENT = [{'id': 'c1', 'datum': d(-1) + ' 14:10', 'type': 'linkedin', 'typeNaam': 'LinkedIn-post', 'onderwerp': 'Start huiswerklokaal', 'tekst': 'Vanaf deze week draait op het Voorbeeldcollege een huiswerklokaal met een vaste begeleider.\n\nRust, structuur en iemand die je vragen beantwoordt. Zo simpel is het soms.\n\n#onderwijs #onderwijsondersteuning'}]
NOTITIES = {'t1': [{'id': 'n1', 'datum': '2026-09-10 09:12', 'tekst': 'Tweede ondersteuner start na de herfstvakantie.'}]}


# v2.0: CRM (fictieve scholen en personen)
GEBRUIKERS_NAMEN = ['Menno', 'Mees']
MIJLPALEN = [{'pipeline': 'Scholen', 'mijlpaal': 'lead', 'volgorde': 1, 'kans': 10, 'dagenNorm': 14}, {'pipeline': 'Scholen', 'mijlpaal': 'gesprek', 'volgorde': 2, 'kans': 25, 'dagenNorm': 10},
             {'pipeline': 'Scholen', 'mijlpaal': 'voorstel', 'volgorde': 3, 'kans': 50, 'dagenNorm': 7}, {'pipeline': 'Scholen', 'mijlpaal': 'onderhandeling', 'volgorde': 4, 'kans': 75, 'dagenNorm': 7}]
TRACKS = [{'id': 'std-lead', 'naam': 'Nieuwe lead opvolgen', 'omschrijving': '', 'stappen': [{'tekst': 'Kennismakingsmail sturen', 'categorie': 'mailen', 'dagenNaStart': 0, 'prio': 'hoog'}, {'tekst': 'Nabellen', 'categorie': 'bellen', 'dagenNaStart': 3, 'prio': 'midden'}]},
          {'id': 'std-voorstel', 'naam': 'Voorstel opvolgen', 'omschrijving': '', 'stappen': [{'tekst': 'Voorstel nabellen', 'categorie': 'bellen', 'dagenNaStart': 3, 'prio': 'hoog'}, {'tekst': 'Beslismoment vastleggen', 'categorie': 'opvolgen', 'dagenNaStart': 14, 'prio': 'hoog'}]}]
SCHOLEN = [
    {'id': 's1', 'naam': 'Voorbeeldcollege Zuid', 'plaats': 'Rotterdam', 'type': 'VO', 'bestuur': 'Stichting Voorbeeld', 'adres': 'Schoolstraat 1, 3000 AA Rotterdam', 'website': 'voorbeeldcollege.nl', 'leerlingen': 1200, 'telefoon': '010 123 45 67', 'email': 'info@voorbeeldcollege.nl', 'status': 'klant', 'eigenaar': 'Menno', 'tags': ['vo', 'rotterdam'], 'velden': {'Sector': 'havo/vwo'}, 'laatsteContact': d(-3), 'aangemaakt': '2025-09-01 10:00', 'notities': ''},
    {'id': 's2', 'naam': 'Lyceum Demo', 'plaats': 'Den Haag', 'type': 'VO', 'bestuur': '', 'adres': '', 'website': 'lyceumdemo.nl', 'leerlingen': 900, 'telefoon': '', 'email': '', 'status': 'klant', 'eigenaar': 'Mees', 'tags': ['vo'], 'velden': {}, 'laatsteContact': d(-2), 'aangemaakt': '2025-10-01 10:00', 'notities': ''},
    {'id': 's3', 'naam': 'ISK Voorbeeld', 'plaats': 'Delft', 'type': 'ISK', 'bestuur': '', 'adres': '', 'website': '', 'leerlingen': '', 'telefoon': '', 'email': '', 'status': 'prospect', 'eigenaar': 'Menno', 'tags': ['nt2'], 'velden': {}, 'laatsteContact': d(-9), 'aangemaakt': '2026-06-01 10:00', 'notities': ''},
    {'id': 's4', 'naam': 'Montessori Demo', 'plaats': 'Utrecht', 'type': 'PO', 'bestuur': '', 'adres': '', 'website': '', 'leerlingen': 300, 'telefoon': '', 'email': '', 'status': 'lead', 'eigenaar': 'Mees', 'tags': [], 'velden': {}, 'laatsteContact': '', 'aangemaakt': '2026-09-01 10:00', 'notities': ''},
]
PERSONEN = [
    {'id': 'p1', 'voornaam': 'Anna', 'achternaam': 'de Vries', 'functie': 'Teamleider onderbouw', 'schoolId': 's1', 'email': 'a.devries@voorbeeldcollege.nl', 'telefoon': '06 12345678', 'linkedin': '', 'eigenaar': 'Menno', 'tags': [], 'velden': {}, 'laatsteContact': d(-3), 'aangemaakt': '2025-09-01 10:00'},
    {'id': 'p2', 'voornaam': 'Bram', 'achternaam': 'Jansen', 'functie': 'Directeur', 'schoolId': 's2', 'email': 'b.jansen@lyceumdemo.nl', 'telefoon': '', 'linkedin': '', 'eigenaar': 'Mees', 'tags': [], 'velden': {}, 'laatsteContact': d(-2), 'aangemaakt': '2025-10-01 10:00'},
    {'id': 'p3', 'voornaam': 'Cor', 'achternaam': 'Bakker', 'functie': 'Coördinator NT2', 'schoolId': 's3', 'email': 'c.bakker@iskvoorbeeld.nl', 'telefoon': '', 'linkedin': '', 'eigenaar': 'Menno', 'tags': [], 'velden': {}, 'laatsteContact': d(-9), 'aangemaakt': '2026-06-01 10:00'},
]
CRMKANSEN = [
    {'id': 'k1', 'naam': 'NT2-ondersteuning', 'school': 'ISK Voorbeeld', 'schoolId': 's3', 'persoonId': 'p3', 'traject': 'NT2-ondersteuning', 'fase': 'voorstel', 'pipeline': 'Scholen', 'waarde': 15040, 'kans': 50, 'volgendeActie': 'Voorstel nabellen', 'deadline': d(2), 'verwachteSluiting': d(30), 'gesloten': '', 'verliesReden': '', 'eigenaar': 'Menno', 'tags': [], 'velden': {}, 'notities': '', 'aangemaakt': d(-40) + ' 10:00', 'dagenStil': 9},
    {'id': 'k2', 'naam': 'Examentraining', 'school': 'Lyceum Demo', 'schoolId': 's2', 'persoonId': 'p2', 'traject': 'Examentraining', 'fase': 'gesprek', 'pipeline': 'Scholen', 'waarde': 9000, 'kans': 25, 'volgendeActie': 'Afspraak met teamleider', 'deadline': d(5), 'verwachteSluiting': d(60), 'gesloten': '', 'verliesReden': '', 'eigenaar': 'Mees', 'tags': [], 'velden': {}, 'notities': '', 'aangemaakt': d(-5) + ' 10:00', 'dagenStil': 2},
    {'id': 'k3', 'naam': 'Huiswerkbegeleiding', 'school': 'Montessori Demo', 'schoolId': 's4', 'persoonId': '', 'traject': 'Huiswerkbegeleiding', 'fase': 'lead', 'pipeline': 'Scholen', 'waarde': 6000, 'kans': 10, 'volgendeActie': '', 'deadline': '', 'verwachteSluiting': '', 'gesloten': '', 'verliesReden': '', 'eigenaar': 'Mees', 'tags': [], 'velden': {}, 'notities': '', 'aangemaakt': d(-2) + ' 10:00', 'dagenStil': None},
    {'id': 'k4', 'naam': 'Surveillance', 'school': 'Voorbeeldcollege Zuid', 'schoolId': 's1', 'persoonId': 'p1', 'traject': 'Surveillance', 'fase': 'verloren', 'pipeline': 'Scholen', 'waarde': 4000, 'kans': 0, 'volgendeActie': '', 'deadline': '', 'verwachteSluiting': '', 'gesloten': d(-4), 'verliesReden': 'Te duur', 'eigenaar': 'Menno', 'tags': [], 'velden': {}, 'notities': '', 'aangemaakt': d(-50) + ' 10:00', 'dagenStil': 20},
]
TAKEN = [
    {'id': 'tk1', 'tekst': 'Voorstel NT2 nabellen', 'bron': 'crm', 'prio': 'hoog', 'deadline': d(-1), 'link': '', 'over': 1, 'categorie': 'bellen', 'eigenaar': 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': 's3', 'persoonId': 'p3', 'kansId': 'k1'},
    {'id': 'tk2', 'tekst': 'Kennismakingsmail Montessori Demo', 'bron': 'track', 'prio': 'midden', 'deadline': d(0), 'link': '', 'over': 0, 'categorie': 'mailen', 'eigenaar': 'Mees', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': 's4', 'persoonId': '', 'kansId': 'k3'},
    {'id': 'tk3', 'tekst': 'Evaluatie periode 1 inplannen', 'bron': 'crm', 'prio': 'laag', 'deadline': d(6), 'link': '', 'over': -6, 'categorie': 'afspraak', 'eigenaar': 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': 's1', 'persoonId': 'p1', 'kansId': ''},
]
ACTIVITEITEN = [
    {'id': 'e1', 'type': 'mail', 'datum': d(-3) + ' 09:12', 'door': 'Menno', 'schoolId': 's1', 'persoonId': 'p1', 'kansId': '', 'onderwerp': 'Mail verstuurd: Rooster periode 2', 'tekst': 'Hoi Anna,\n\nHierbij het rooster voor periode 2.', 'duurMin': 0, 'bron': 'gmail-uit'},
    {'id': 'e2', 'type': 'gesprek', 'datum': d(-9) + ' 14:00', 'door': 'Menno', 'schoolId': 's3', 'persoonId': 'p3', 'kansId': 'k1', 'onderwerp': 'Toelichting voorstel', 'tekst': 'Positief over de aanpak, wacht op budget van het bestuur.', 'duurMin': 20, 'bron': 'app'},
    {'id': 'e3', 'type': 'fase', 'datum': d(-12) + ' 11:00', 'door': 'Menno', 'schoolId': 's3', 'persoonId': 'p3', 'kansId': 'k1', 'onderwerp': 'Mijlpaal: gesprek → voorstel', 'tekst': '', 'duurMin': 0, 'bron': 'app'},
    {'id': 'e4', 'type': 'afspraak', 'datum': d(2) + ' 10:00', 'door': 'Mees', 'schoolId': 's2', 'persoonId': 'p2', 'kansId': 'k2', 'onderwerp': 'Gesprek teamleider Lyceum Demo', 'tekst': '', 'duurMin': 60, 'bron': 'agenda'},
]
DOELEN = [{'id': 'mees-week-gesprekken', 'eigenaar': 'Mees', 'periode': 'week', 'metric': 'gesprekken', 'doel': 8}]
GEBRUIKERS = [{'id': 'g1', 'naam': 'Mees', 'email': 'mees@voorbeeld.nl', 'rol': 'am', 'actief': True, 'heeftCode': True}]

def per_id(lijst): return {x['id']: x for x in lijst}
# v3.8: projecten aan scholen koppelen en facturatievelden geven
_NAAR_ID = {x['naam']: x['id'] for x in SCHOLEN}
for _t in TRAJECTEN:
    _t.setdefault('schoolId', _NAAR_ID.get(_t['school'], '')); _t.setdefault('kansId', ''); _t.setdefault('adviseur', '')
    for _v in ('soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer'): _t.setdefault(_v, '')
# v4.0: projectenbord zoals monday, en een project van accountmanager Joris (tweede koppelcode)
TRAJECTEN.append({'id': 't6', 'school': 'Lyceum Demo', 'plaats': 'Den Haag', 'traject': 'Examentraining', 'schooljaar': '2026-2027', 'start': '2027-03-01', 'eind': '2027-05-15', 'status': 'opstart', 'ondersteuners': 2, 'urenPerWeek': 10, 'tarief': 46, 'omzet': 6400, 'contactpersoon': 'B. Jansen', 'am': 'Joris', 'samenvatting': '', 'bijgewerkt': nu(), 'schoolId': 's2', 'kansId': 'k2', 'adviseur': 'Mees'})
for _t in TRAJECTEN:
    for _v in ('contactgegevens', 'voorstelUrl', 'documentenUrl', 'verlenging'): _t.setdefault(_v, '')
TRAJECTEN[0].update({'contactgegevens': 'Anna de Vries\n06-12345678\na.devries@voorbeeldcollege.nl', 'voorstelUrl': 'https://docs.google.com/document/d/voorbeeld', 'documentenUrl': 'https://drive.google.com/drive/folders/voorbeeld', 'verlenging': 'voorstel verstuurd'})
TRAJECTEN[1].update({'verlenging': 'nog bespreken'})
TRAJECTEN[0].update({'soortFacturatie': 'vooraf', 'gefactureerd': 'ja', 'vakanties': 'doorbetaald', 'factuurnummer': '20210009', 'adviseur': 'Menno'})
TRAJECTEN[1].update({'soortFacturatie': 'achteraf', 'gefactureerd': 'nee', 'vakanties': 'niet doorbetaald', 'bijzonderheden': 'Wachten op akkoord'})
FACTUREN = [{'id': 'f1', 'trajectId': 't1', 'omschrijving': 'Factuur vooraf', 'bedrag': 20370, 'datum': d(-2), 'status': 'verzonden', 'factuurnummer': '20210009', 'bijzonderheden': 'op basis van 38 weken', 'exactId': '', 'door': 'Menno'},
            {'id': 'f2', 'trajectId': 't1', 'omschrijving': 'Januari', 'bedrag': 2037, 'datum': d(90), 'status': 'nog te doen', 'factuurnummer': '', 'bijzonderheden': '', 'exactId': '', 'door': 'Menno'}]
KEUZES = {'soortFacturatie': ['vooraf', 'achteraf'], 'gefactureerd': ['ja', 'nee', 'n.v.t.'], 'vakanties': ['doorbetaald', 'niet doorbetaald', 'n.v.t.'], 'factuurStatussen': ['nog te doen', 'aangemaakt', 'verzonden', 'betaald'], 'trajectStatussen': ['opstart', 'bezig', 'afgelopen', 'onduidelijk', 'gestopt'], 'verlenging': ['nog bespreken', 'voorstel verstuurd', 'verlengd', 'stopt']}
# v4.0: twee gebruikers. test123 = Menno (management), am123 = Joris (accountmanager): ziet geen pipeline, alleen zijn eigen projecten en facturatie
ALLES = {o: {'zien': 'alles', 'wijzigen': 'alles'} for o in ('relaties', 'pipeline', 'projecten', 'facturatie')}
IKKEN = {'test123': {'naam': 'Menno', 'team': 'management', 'rol': 'management', 'beheer': True, 'gekoppeld': True, 'rechten': dict(ALLES, beheer=True, teamlead=False, doelen=True)},
         'am123': {'naam': 'Joris', 'team': 'accountmanagement', 'rol': 'medewerker', 'beheer': False, 'gekoppeld': False, 'rechten': {'relaties': {'zien': 'alles', 'wijzigen': 'alles'}, 'pipeline': {'zien': 'geen', 'wijzigen': 'geen'},
                   'projecten': {'zien': 'eigen', 'wijzigen': 'eigen'}, 'facturatie': {'zien': 'eigen', 'wijzigen': 'eigen'}, 'beheer': False, 'teamlead': False, 'doelen': False}}}
HUIDIG = ['test123']
def ik(): return dict(IKKEN[HUIDIG[0]])
def beheer(): return ik()['beheer']
def eigen_project(t): return beheer() or t.get('am') == ik()['naam']
def geen_toegang(): raise ValueError('Daar heb je geen toegang toe.')
def project_uit(t): return dict(t, facturen=[f for f in FACTUREN if f['trajectId'] == t['id']])
def projectnaam(tid):
    t = per_id(TRAJECTEN).get(tid); return (t['traject'] + ' ' + t['schooljaar']) if t else ''
def act_uit(a):
    s, p, k = per_id(SCHOLEN).get(a.get('schoolId')), per_id(PERSONEN).get(a.get('persoonId')), per_id(CRMKANSEN).get(a.get('kansId'))
    return dict(a, school=s['naam'] if s else '', persoon=(p['voornaam'] + ' ' + p['achternaam']) if p else '', kans=k['naam'] if k else '', gepland=a['datum'] > nu(), trajectId=a.get('trajectId', ''), project=projectnaam(a.get('trajectId')))
def persoon_uit(p):
    s = per_id(SCHOLEN).get(p.get('schoolId')); return dict(p, naam=(p.get('voornaam', '') + ' ' + p.get('achternaam', '')).strip() or p.get('email', ''), school=s['naam'] if s else '')
def kans_uit(k):
    k = dict(k); k['gewogen'] = round((k.get('waarde') or 0) * (k.get('kans') or 0) / 100)
    m = [x for x in MIJLPALEN if x['mijlpaal'] == k['fase']]; k['stil'] = k['fase'] not in ('gewonnen', 'verloren') and k.get('dagenStil') is not None and k['dagenStil'] > (m[0]['dagenNorm'] if m else 7)
    return k
def taak_uit(t):
    s, p, k = per_id(SCHOLEN).get(t.get('schoolId')), per_id(PERSONEN).get(t.get('persoonId')), per_id(CRMKANSEN).get(t.get('kansId'))
    return dict(t, school=s['naam'] if s else '', persoon=persoon_uit(p)['naam'] if p else '', kans=k['naam'] if k else '', trajectId=t.get('trajectId', ''), project=projectnaam(t.get('trajectId')))
def basis():
    scholen = []
    for s in SCHOLEN:
        open_ = [k for k in CRMKANSEN if k['schoolId'] == s['id'] and k['fase'] not in ('gewonnen', 'verloren')]
        scholen.append(dict(s, personen=len([p for p in PERSONEN if p['schoolId'] == s['id']]), openKansen=len(open_), openWaarde=sum(k['waarde'] for k in open_)))
    return {'ik': ik(), 'gebruikers': GEBRUIKERS_NAMEN, 'teams': {'management': ['Menno'], 'accountmanagement': ['Joris', 'Mees'], 'consultancy': [], 'talent': []}, 'statussen': INSTELLINGEN['schoolStatussen'], 'mijlpalen': MIJLPALEN,
            'categorieen': ['bellen', 'mailen', 'afspraak', 'voorstel', 'opvolgen', 'overig'], 'activiteitTypes': ['notitie', 'gesprek', 'mail', 'afspraak'], 'tracks': TRACKS,
            'tags': sorted({t for s in SCHOLEN for t in s['tags']}), 'trajectStatussen': INSTELLINGEN['trajectStatussen'], 'keuzes': KEUZES,
            'projecten': [{'id': t['id'], 'naam': t['traject'] + ' ' + t['schooljaar'], 'schoolId': t['schoolId'], 'school': t['school'], 'kansId': t['kansId'], 'status': t['status'], 'am': t['am']} for t in TRAJECTEN if eigen_project(t)], 'scholen': scholen, 'personen': [persoon_uit(p) for p in PERSONEN]}
def tijdlijn(f): return [act_uit(a) for a in sorted([a for a in ACTIVITEITEN if f(a)], key=lambda a: a['datum'], reverse=True)]
def opslaan(lijst, o, prefix):
    o = dict(o)
    if o.get('id'):
        for x in lijst:
            if x['id'] == o['id']: x.update(o); return x
    o['id'] = prefix + uuid.uuid4().hex[:6]; lijst.append(o); return o
def handle_crm(fn, args):
    if fn == 'apiCrm': return basis()
    if fn == 'apiSchool':
        s = per_id(SCHOLEN)[args[0]]; ps = [p for p in PERSONEN if p['schoolId'] == s['id']]; ks = [k for k in CRMKANSEN if k['schoolId'] == s['id']]
        pids, kids = {p['id'] for p in ps}, {k['id'] for k in ks}
        tr = [t for t in TRAJECTEN if t['schoolId'] == s['id']]; tids = {t['id'] for t in tr}
        return {'school': s, 'personen': [persoon_uit(p) for p in ps], 'kansen': [kans_uit(k) for k in ks], 'trajecten': tr,
                'cijfers': {'laatsteContact': s.get('laatsteContact') or d(-2), 'openProjecten': len([t for t in tr if t['status'] not in ('afgelopen', 'afgerond', 'gestopt')]), 'pipeline': sum(k['waarde'] for k in ks if k['fase'] not in ('gewonnen', 'verloren')), 'gewonnen': sum(k['waarde'] for k in ks if k['fase'] == 'gewonnen')},
                'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af' and (t['schoolId'] == s['id'] or t['persoonId'] in pids or t['kansId'] in kids)],
                'tijdlijn': tijdlijn(lambda a: a['schoolId'] == s['id'] or a['persoonId'] in pids or a.get('trajectId') in tids), 'documenten': [x for x in DOCS if x['school'] == s['naam']]}
    if fn == 'apiProject':  # v3.8
        t = per_id(TRAJECTEN)[args[0]]; s = per_id(SCHOLEN).get(t['schoolId']); k = per_id(CRMKANSEN).get(t.get('kansId'))
        if not eigen_project(t): geen_toegang()
        hoort = lambda a: a.get('trajectId') == t['id'] or (k and a.get('kansId') == k['id'])
        return {'project': t, 'school': {'id': s['id'], 'naam': s['naam'], 'plaats': s['plaats'], 'email': s.get('email', ''), 'telefoon': s.get('telefoon', '')} if s else None, 'kans': kans_uit(k) if k else None,
                'personen': [persoon_uit(p) for p in PERSONEN if s and p['schoolId'] == s['id']], 'taken': [taak_uit(x) for x in TAKEN if x['status'] != 'af' and hoort(x)],
                'tijdlijn': tijdlijn(hoort), 'losseMails': [act_uit(a) for a in ACTIVITEITEN if s and a['type'] == 'mail' and not a.get('trajectId') and a['schoolId'] == s['id']],
                'facturen': [f for f in FACTUREN if f['trajectId'] == t['id']], 'keuzes': KEUZES, 'rechten': {'wijzigen': True, 'facturatie': True, 'facturatieWijzigen': True}}
    if fn == 'apiFacturatie':
        return {'projecten': [dict(project_uit(t), magWijzigen=True) for t in sorted(TRAJECTEN, key=lambda t: (t['am'], t['school'])) if eigen_project(t)], 'keuzes': KEUZES, 'gebruikers': GEBRUIKERS_NAMEN, 'ik': ik()}
    if fn == 'apiFactuurOpslaan':
        o = dict(args[0]); o.pop('_oud', None)
        if 'bedrag' in o: o['bedrag'] = float(str(o['bedrag']).replace(',', '.') or 0)
        if not o.get('id'): o.setdefault('status', 'nog te doen')
        return opslaan(FACTUREN, o, 'f')
    if fn == 'apiFacturenMaken':
        t = per_id(TRAJECTEN)[args[0]]; maanden = ['September', 'Oktober', 'November'] if (args[1] or {}).get('per') != 'eenmalig' else ['Factuur vooraf']
        for m in maanden: FACTUREN.append({'id': 'f' + uuid.uuid4().hex[:5], 'trajectId': t['id'], 'omschrijving': m, 'bedrag': 1000, 'datum': d(30), 'status': 'nog te doen', 'factuurnummer': '', 'bijzonderheden': '', 'exactId': '', 'door': 'Menno'})
        return [f for f in FACTUREN if f['trajectId'] == t['id']]
    if fn == 'apiFacturenExport':
        rij = [f for f in FACTUREN if f['status'] == (args[0] if args else 'aangemaakt')]
        return {'bestandsnaam': 'facturen.csv', 'csv': 'Factuurdatum;Debiteur\n' + '\n'.join(f['datum'] + ';x' for f in rij), 'aantal': len(rij)}
    if fn == 'apiSchoolSamenvatting':
        return {'tekst': '- Klant sinds 2025, twee lopende projecten.\n- Open kans NT2 (€ 15.040), voorstel ligt er.\n- Laatste contact 2 dagen geleden (mail Anna de Vries).', 'gemaakt': nu()}
    if fn == 'apiPersoon':
        p = per_id(PERSONEN)[args[0]]; s = per_id(SCHOLEN).get(p['schoolId'])
        return {'persoon': persoon_uit(p), 'school': {'id': s['id'], 'naam': s['naam'], 'plaats': s['plaats']} if s else None, 'kansen': [kans_uit(k) for k in CRMKANSEN if k['persoonId'] == p['id']],
                'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af' and t['persoonId'] == p['id']], 'tijdlijn': tijdlijn(lambda a: a['persoonId'] == p['id'])}
    if fn == 'apiKans':
        k = per_id(CRMKANSEN)[args[0]]; s = per_id(SCHOLEN).get(k['schoolId']); p = per_id(PERSONEN).get(k['persoonId'])
        return {'alleenLezen': not beheer(), 'kans': kans_uit(k), 'mijlpalen': MIJLPALEN, 'school': {'id': s['id'], 'naam': s['naam'], 'plaats': s['plaats']} if s else None, 'persoon': {'id': p['id'], 'naam': persoon_uit(p)['naam'], 'email': p['email']} if p else None,
                'personen': [{'id': x['id'], 'naam': persoon_uit(x)['naam']} for x in PERSONEN if s and x['schoolId'] == s['id']],
                'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af' and t['kansId'] == k['id']], 'tijdlijn': tijdlijn(lambda a: a['kansId'] == k['id']),
                'project': next((t for t in TRAJECTEN if t.get('kansId') == k['id']), None)}
    if fn == 'apiSchoolOpslaan':
        o = dict(args[0]); oud = o.pop('_oud', None)
        if oud and o.get('id'):  # v3.3: conflictcontrole zoals de echte backend
            cur = per_id(SCHOLEN)[o['id']]; norm = lambda v: ', '.join(v).lower() if isinstance(v, list) else json.dumps(v) if isinstance(v, dict) else str(v if v is not None else '').strip()
            botst = [k for k in oud if norm(cur.get(k)) != norm(oud[k]) and norm(cur.get(k)) != norm(o.get(k))]
            if botst: raise ValueError('Intussen gewijzigd: ' + ', '.join(botst) + ' (laatst bewerkt door Mees om 14:02). Het scherm is ververst; voer je wijziging opnieuw in.')
        if 'tags' in o or not o.get('id'): o['tags'] = [t.strip().lower() for t in str(o.get('tags', '')).split(',') if t.strip()] if isinstance(o.get('tags'), str) else o.get('tags', [])
        o.setdefault('velden', {}); new = not o.get('id')
        if new: o.update({'status': o.get('status') or 'lead', 'aangemaakt': nu(), 'laatsteContact': ''}); [o.setdefault(k, '') for k in ['plaats', 'type', 'bestuur', 'adres', 'website', 'leerlingen', 'telefoon', 'email', 'notities', 'eigenaar']]
        return opslaan(SCHOLEN, o, 's')
    if fn == 'apiPersoonOpslaan':
        o = dict(args[0]); o.pop('_oud', None); o['tags'] = [t.strip() for t in str(o.get('tags', '')).split(',') if t.strip()] if isinstance(o.get('tags'), str) else o.get('tags', [])
        if not o.get('id'): [o.setdefault(k, '') for k in ['voornaam', 'achternaam', 'functie', 'schoolId', 'email', 'telefoon', 'linkedin', 'eigenaar', 'laatsteContact']]; o['aangemaakt'] = nu()
        return persoon_uit(opslaan(PERSONEN, o, 'p'))
    if fn == 'apiKansOpslaan':
        o = dict(args[0]); o.pop('_oud', None); maak = len(args) > 1 and args[1]; oud = per_id(CRMKANSEN).get(o.get('id'))
        if o.get('schoolId'): o['school'] = per_id(SCHOLEN)[o['schoolId']]['naam']
        for k in ('waarde', 'kans'):
            if o.get(k) not in (None, ''): o[k] = float(o[k])
        if not oud:
            o.update({'fase': o.get('fase') or 'lead', 'aangemaakt': nu(), 'dagenStil': 0, 'gesloten': '', 'verliesReden': '', 'pipeline': 'Scholen', 'tags': [], 'velden': {}, 'notities': '', 'volgendeActie': '', 'deadline': ''})
            o.setdefault('persoonId', ''); o.setdefault('verwachteSluiting', ''); o['kans'] = next((m['kans'] for m in MIJLPALEN if m['mijlpaal'] == o['fase']), 10)
        wissel = oud and o.get('fase') and o['fase'] != oud['fase']
        if wissel:
            o['kans'] = 100 if o['fase'] == 'gewonnen' else 0 if o['fase'] == 'verloren' else next((m['kans'] for m in MIJLPALEN if m['mijlpaal'] == o['fase']), 0)
            o['gesloten'] = d(0) if o['fase'] in ('gewonnen', 'verloren') else ''
            ACTIVITEITEN.append({'id': 'e' + uuid.uuid4().hex[:5], 'type': 'fase', 'datum': nu(), 'door': 'Menno', 'schoolId': oud['schoolId'], 'persoonId': oud['persoonId'], 'kansId': oud['id'], 'onderwerp': 'Mijlpaal: ' + oud['fase'] + ' → ' + o['fase'], 'tekst': o.get('verliesReden', ''), 'duurMin': 0, 'bron': 'app'})
        k = opslaan(CRMKANSEN, o, 'k'); traject = None
        if wissel and k['fase'] == 'gewonnen' and not any(t.get('kansId') == k['id'] for t in TRAJECTEN):  # v3.8: altijd een project
            traject = {'id': 'p' + uuid.uuid4().hex[:5], 'schoolId': k['schoolId'], 'school': k['school'], 'plaats': '', 'traject': k['naam'], 'schooljaar': '2026-2027', 'start': '', 'eind': '', 'status': 'opstart', 'ondersteuners': 0, 'urenPerWeek': 0, 'tarief': 0, 'omzet': k['waarde'], 'contactpersoon': '', 'am': k.get('am', ''), 'adviseur': k['eigenaar'], 'kansId': k['id'], 'samenvatting': '', 'bijgewerkt': nu(),
                       'soortFacturatie': '', 'gefactureerd': '', 'factuurDatum': '', 'vakanties': '', 'bijzonderheden': '', 'factuurnummer': ''}
            TRAJECTEN.insert(0, traject)
            ACTIVITEITEN.append({'id': 'e' + uuid.uuid4().hex[:5], 'type': 'notitie', 'datum': nu(), 'door': k['eigenaar'], 'schoolId': k['schoolId'], 'persoonId': k.get('persoonId', ''), 'kansId': k['id'], 'trajectId': traject['id'], 'onderwerp': 'Overdracht naar ' + (k.get('am') or 'de accountmanager'), 'tekst': 'Kans gewonnen.', 'duurMin': 0, 'bron': 'app'})
            TAKEN.append({'id': 'tk' + uuid.uuid4().hex[:5], 'tekst': 'Startgesprek plannen', 'bron': 'project', 'prio': 'hoog', 'deadline': d(3), 'link': '', 'over': -3, 'categorie': 'afspraak', 'eigenaar': k.get('am') or 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': k['schoolId'], 'persoonId': '', 'kansId': k['id'], 'trajectId': traject['id']})
        return {'kans': kans_uit(k), 'traject': traject}
    if fn == 'apiActiviteitToevoegen':
        o = dict(args[0]); o.update({'id': 'e' + uuid.uuid4().hex[:5], 'door': 'Menno', 'bron': 'app', 'datum': (o.get('datum') or nu()).replace('T', ' '), 'duurMin': int(float(o.get('duurMin') or 0))})
        for k in ('schoolId', 'persoonId', 'kansId'): o.setdefault(k, '')
        if not o['schoolId'] and o['persoonId']: o['schoolId'] = per_id(PERSONEN)[o['persoonId']]['schoolId']
        if not o['schoolId'] and o['kansId']: o['schoolId'] = per_id(CRMKANSEN)[o['kansId']]['schoolId']
        o.setdefault('onderwerp', ''); ACTIVITEITEN.append(o); return act_uit(o)
    if fn == 'apiAfspraakPlannen':
        o = dict(args[0]); a = {'id': 'e' + uuid.uuid4().hex[:5], 'type': 'afspraak', 'datum': o['start'].replace('T', ' '), 'door': 'Menno', 'schoolId': o.get('schoolId', ''), 'persoonId': o.get('persoonId', ''), 'kansId': o.get('kansId', ''), 'onderwerp': o['titel'], 'tekst': o.get('notitie', ''), 'duurMin': int(float(o.get('duurMin') or 60)), 'bron': 'app'}
        ACTIVITEITEN.append(a); return act_uit(a)
    if fn == 'apiPipeline' and not beheer(): geen_toegang()
    if fn == 'apiPipeline': return {'mijlpalen': MIJLPALEN, 'pipelines': ['Scholen'], 'kansen': [kans_uit(k) for k in CRMKANSEN], 'verliesRedenen': ['Te duur']}
    if fn == 'apiTaken': return {'taken': [taak_uit(t) for t in TAKEN], 'categorieen': basis()['categorieen'], 'gebruikers': GEBRUIKERS_NAMEN, 'tracks': TRACKS}
    if fn == 'apiTaakOpslaan':
        o = dict(args[0]); o.pop('_oud', None)
        if not o.get('id'): o.update({'bron': 'crm', 'status': 'open', 'link': '', 'over': None, 'afgerond': ''}); [o.setdefault(k, '') for k in ['schoolId', 'persoonId', 'kansId', 'deadline', 'categorie', 'notitie', 'eigenaar']]
        return taak_uit(opslaan(TAKEN, o, 'tk'))
    if fn == 'apiTaakHeropen':  # v3.7
        t = per_id(TAKEN)[args[0]]; t.update({'status': 'open', 'afgerond': ''}); return taak_uit(t)
    if fn == 'apiTrackStoppen':
        n = len([t for t in TAKEN if t.get('trackRunId') == args[0] and t['status'] != 'af']); TAKEN[:] = [t for t in TAKEN if not (t.get('trackRunId') == args[0] and t['status'] != 'af')]; return {'aantal': n}
    if fn == 'apiTrackVerwijderen':
        TRACKS[:] = [t for t in TRACKS if t['id'] != args[0]]; return TRACKS
    if fn == 'apiActiviteitOpslaan':
        o = dict(args[0]); o.pop('_oud', None); o.pop('agendaBijwerken', None)
        if 'datum' in o: o['datum'] = o['datum'].replace('T', ' ')
        if o['id'] not in per_id(ACTIVITEITEN):  # notitie uit Historie
            for l in NOTITIES.values():
                for n in l:
                    if n['id'] == o['id']: n['tekst'] = o.get('tekst', n['tekst'])
            return {'id': o['id']}
        a = per_id(ACTIVITEITEN)[o['id']]; a.update(o); return dict(act_uit(a), agendaBijgewerkt=bool(a.get('agenda')))
    if fn == 'apiInstellingen': return INSTELLINGEN
    if fn == 'apiKeuzelijstOpslaan':
        INSTELLINGEN[args[0]] = [x['waarde'].lower() for x in args[1]]
        if args[0] == 'schoolStatussen':
            for x in args[1]:
                for sc in SCHOLEN:
                    if x.get('oud') and sc['status'] == x['oud']: sc['status'] = x['waarde'].lower()
        return INSTELLINGEN
    if fn == 'apiVelden':
        tags = {}
        for sc in SCHOLEN:
            for t in sc['tags']: tags[t] = tags.get(t, 0) + 1
        return {'tags': [{'naam': k, 'aantal': v} for k, v in sorted(tags.items())], 'velden': [{'naam': 'Regio', 'aantal': 2}]}
    if fn == 'apiTagHernoem':
        n = 0
        for sc in SCHOLEN:
            if args[0] in sc['tags']: sc['tags'] = [args[1] if t == args[0] else t for t in sc['tags'] if args[1] or t != args[0]]; n += 1
        return {'aantal': n}
    if fn == 'apiVeldHernoem': return {'aantal': 2}
    if fn == 'apiTrackStart':
        t = per_id(TRACKS)[args[0]]; kop = args[1]
        for st in t['stappen']: TAKEN.append({'id': 'tk' + uuid.uuid4().hex[:5], 'tekst': st['tekst'], 'bron': 'track', 'prio': st['prio'], 'deadline': (datetime.date.fromisoformat(args[2]) + datetime.timedelta(days=st['dagenNaStart'])).isoformat(), 'link': '', 'over': None, 'categorie': st['categorie'], 'eigenaar': args[3] if len(args) > 3 else 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': kop.get('schoolId', ''), 'persoonId': kop.get('persoonId', ''), 'kansId': kop.get('kansId', '')})
        return {'aantal': len(t['stappen']), 'track': t['naam']}
    if fn == 'apiTrackOpslaan': return TRACKS
    if fn == 'apiRapport':
        c = {'gesprekken': 4, 'mails': 11, 'afspraken': 2, 'notities': 3, 'nieuweKansen': 2, 'voorstellen': 1, 'gewonnen': 1, 'gewonnenWaarde': 12000, 'verloren': 1, 'takenAf': 6}
        c2 = {'gesprekken': 6, 'mails': 7, 'afspraken': 3, 'notities': 1, 'nieuweKansen': 1, 'voorstellen': 0, 'gewonnen': 0, 'gewonnenWaarde': 0, 'verloren': 0, 'takenAf': 4}
        team = {k: c[k] + c2[k] for k in c}
        return {'preset': args[0] or 'week', 'van': d(-2), 'tot': d(0), 'eigenaar': args[1] if len(args) > 1 else '', 'gebruikers': GEBRUIKERS_NAMEN if beheer() else [ik()['naam']], 'ik': ik(), 'team': team,
                'perPersoon': [{'naam': 'Menno', 'cijfers': c, 'doelen': {}}, {'naam': 'Mees', 'cijfers': c2, 'doelen': {'gesprekken': 8}}], 'totaal': {'open': 3, 'waarde': 30040, 'gewogen': 10370},
                'forecast': [{'maand': d(30)[:7], 'waarde': 15040, 'gewogen': 7520, 'aantal': 1}, {'maand': d(60)[:7], 'waarde': 9000, 'gewogen': 2250, 'aantal': 1}, {'maand': 'zonder datum', 'waarde': 6000, 'gewogen': 600, 'aantal': 1}],
                'trechter': [{'mijlpaal': m['mijlpaal'], 'pipeline': 'Scholen', 'aantal': len([k for k in CRMKANSEN if k['fase'] == m['mijlpaal']]), 'waarde': sum(k['waarde'] for k in CRMKANSEN if k['fase'] == m['mijlpaal']), 'gewogen': sum(kans_uit(k)['gewogen'] for k in CRMKANSEN if k['fase'] == m['mijlpaal'])} for m in MIJLPALEN],
                'winst': {'gewonnen': 1, 'gewonnenWaarde': 12000, 'verloren': 1, 'verlorenWaarde': 4000, 'ratio': 50}, 'redenen': [{'reden': 'Te duur', 'aantal': 1}], 'stil': [kans_uit(k) for k in CRMKANSEN if kans_uit(k)['stil']]}
    if fn == 'apiDoelen': return {'doelen': DOELEN, 'metrics': ['gesprekken', 'mails', 'afspraken', 'nieuweKansen', 'voorstellen', 'gewonnen', 'gewonnenWaarde'], 'periodes': ['week', 'maand', 'kwartaal'], 'gebruikers': GEBRUIKERS_NAMEN}
    if fn == 'apiDoelOpslaan':
        o = args[0]; DOELEN[:] = [x for x in DOELEN if x['id'] != o['eigenaar'] + o['periode'] + o['metric'] and x['id'] != o.get('id')] + [dict(o, id=o['eigenaar'] + o['periode'] + o['metric'], doel=float(o.get('doel') or 0))]; return handle_crm('apiDoelen', [])
    if fn == 'apiMijlpalenOpslaan':
        MIJLPALEN[:] = [{'pipeline': m.get('pipeline') or 'Scholen', 'mijlpaal': m['mijlpaal'].lower(), 'volgorde': i + 1, 'kans': m['kans'], 'dagenNorm': m['dagenNorm']} for i, m in enumerate(args[0])]; return MIJLPALEN
    if fn == 'apiGebruikers': return {'gebruikers': GEBRUIKERS, 'rollen': ['medewerker', 'teamlead', 'management'], 'teams': ['management', 'consultancy', 'accountmanagement', 'talent']}
    if fn == 'apiGebruikerOpslaan':
        o = dict(args[0]); g = opslaan(GEBRUIKERS, dict(o, team=o.get('team') or 'accountmanagement', rol=o.get('rol') or 'medewerker', actief=o.get('actief', 'ja') != 'nee', heeftCode=True), 'g')
        if g['naam'] not in GEBRUIKERS_NAMEN: GEBRUIKERS_NAMEN.append(g['naam'])
        return {'gebruiker': g, 'code': 'am' + uuid.uuid4().hex[:12] if (not o.get('id') or (len(args) > 1 and args[1])) else ''}
    if fn == 'apiHome':  # v3.0
        open_ = [kans_uit(k) for k in CRMKANSEN if k['fase'] not in ('gewonnen', 'verloren')]
        return {'groet': 'Goedemorgen Menno', 'datum': 'dinsdag 22 september', 'ik': ik(), 'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af'],
                'agenda': [{'id': 'g1', 'sleutel': 'g1', 'titel': 'Gesprek teamleider Lyceum Demo', 'start': d(1) + ' 10:00', 'eind': d(1) + ' 11:00', 'heleDag': False, 'locatie': ''}, {'id': 'g2', 'sleutel': 'g2', 'titel': 'Teamoverleg', 'start': d(3) + ' 09:00', 'eind': d(3) + ' 10:00', 'heleDag': False, 'locatie': 'Kantoor'}], 'gekoppeld': True,
                'pipeline': {'open': len(open_), 'waarde': sum(k['waarde'] for k in open_), 'gewogen': sum(k['gewogen'] for k in open_), 'stil': [k for k in open_ if k['stil']]},
                'recent': [act_uit(a) for a in sorted(ACTIVITEITEN, key=lambda a: a['datum'], reverse=True) if a['datum'] <= nu()], 'mails': [{'onderwerp': 'Rooster periode 2', 'van': 'A. de Vries', 'dagen': 4, 'threadId': 'th1', 'link': 'https://mail.google.com/'}]}
    if fn == 'apiActiviteiten':  # v3.3
        door = args[0] if args else ''; l = [act_uit(a) for a in sorted(ACTIVITEITEN, key=lambda a: a['datum'], reverse=True) if (not door or a['door'] == door) and a['datum'] <= nu()]
        pt = {}
        for a in l: pt[a['type']] = pt.get(a['type'], 0) + 1
        return {'door': door, 'totaal': len(l), 'perType': pt, 'tijdlijn': l}
    if fn == 'apiArchiefTijdlijn':
        return [act_uit({'id': 'ar1', 'type': 'notitie', 'datum': '2025-03-01 10:00', 'door': 'Menno', 'schoolId': args[1], 'persoonId': '', 'kansId': '', 'onderwerp': 'Kennismaking (archief)', 'tekst': 'Eerste contact via de beurs.', 'duurMin': 0, 'bron': 'capsule'})]
    if fn == 'apiHomeMails': return [{'onderwerp': 'Rooster periode 2', 'van': 'A. de Vries', 'dagen': 4, 'threadId': 'th1', 'link': 'https://mail.google.com/'}]  # v3.2
    if fn == 'apiAgenda':  # v3.0
        van, tot = args[0], args[1]
        ev = [{'id': 'g1', 'sleutel': 'g1', 'titel': 'Gesprek teamleider Lyceum Demo', 'start': d(1) + ' 10:00', 'eind': d(1) + ' 11:00', 'heleDag': False, 'locatie': '', 'schoolId': 's2', 'kansId': '', 'school': 'Lyceum Demo'},
              {'id': 'g2', 'sleutel': 'g2', 'titel': 'Teamoverleg', 'start': d(3) + ' 09:00', 'eind': d(3) + ' 10:00', 'heleDag': False, 'locatie': 'Kantoor'}]
        return {'van': van, 'tot': tot, 'gekoppeld': True, 'events': [e for e in ev if van <= e['start'][:10] <= tot],
                'afspraken': [act_uit(a) for a in ACTIVITEITEN if a['type'] == 'afspraak' and van <= a['datum'][:10] <= tot],
                'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af' and t['deadline'] and van <= t['deadline'] <= tot]}
    if fn == 'apiCrmSync': return {'mails': 3, 'afspraken': 1, 'bijgewerkt': 0}
    if fn == 'apiCrmInrichten': return {'personen': 0, 'kansen': 0, 'trajecten': 0, 'notities': 1, 'eigenaren': 0}
    if fn == 'apiCapsuleMigratie':
        stappen = ['mijlpalen', 'partijen', 'kansen', 'projecten', 'taken', 'historie']; i = stappen.index(args[0])
        return {'stap': args[0], 'aantal': 3, 'volgende': {'stap': stappen[i + 1], 'pagina': 1} if i + 1 < len(stappen) else None}
    if fn == 'apiExport': return {'bestandsnaam': 'athena-' + args[0] + '.csv', 'csv': 'id,naam\ns1,Voorbeeldcollege Zuid'}
    if fn == 'apiVerwijder':
        lijst = {'school': SCHOLEN, 'persoon': PERSONEN, 'kans': CRMKANSEN, 'taak': TAKEN, 'activiteit': ACTIVITEITEN, 'traject': TRAJECTEN, 'doel': DOELEN, 'content': CONTENT, 'factuur': FACTUREN}.get(args[0])
        if lijst is None:  # notitie (Historie)
            for l in NOTITIES.values(): l[:] = [x for x in l if x['id'] != args[1]]
            return None
        lijst[:] = [x for x in lijst if x['id'] != args[1]]; return None
    raise ValueError('onbekende functie ' + fn)

BREIN_UITGEVOERD = []
INSTELLINGEN = {'schoolStatussen': ['lead', 'prospect', 'klant', 'oud-klant'], 'taakCategorieen': ['bellen', 'mailen', 'afspraak', 'voorstel', 'opvolgen', 'overig'], 'trajectStatussen': ['opstart', 'bezig', 'afgelopen', 'onduidelijk', 'gestopt']}


def handle(fn, args):
    if fn == 'apiOverzicht':
        open_ = [a for a in ACTIES]
        return {'datum': 'dinsdag 22 september', 'groet': 'Goedemorgen Menno', 'kpi': {'trajecten': 3, 'kansen': 2, 'scholen': 3, 'omzet': 64260, 'schooljaar': '2026-2027', 'pijplijn': 24040},
                'focus': open_[:3], 'aandacht': open_[3:], 'mails': [{'onderwerp': 'Rooster periode 2', 'van': 'A. de Vries', 'dagen': 4, 'threadId': 'th1', 'link': 'https://mail.google.com/'}, {'onderwerp': 'Factuur september', 'van': 'Administratie Lyceum Demo', 'dagen': 2, 'link': 'https://mail.google.com/'}],
                'agenda': [{'tijd': '10:00', 'titel': 'Gesprek teamleider Lyceum Demo', 'duurMin': 60}, {'tijd': '14:30', 'titel': 'Intake ondersteuner', 'duurMin': 45}], 'kansen': [kans_uit(k) for k in CRMKANSEN if k['fase'] not in ('gewonnen', 'verloren')], 'tellingScholen': 4}
    if fn == 'apiActieKlaar':
        for t in TAKEN:
            if t['id'] == args[0]: t['status'] = 'af'; t['afgerond'] = nu()
        ACTIES[:] = [a for a in ACTIES if a['id'] != args[0]]; return {'id': args[0], 'status': 'af', 'afgerond': nu()}
    if fn == 'apiActieToevoegen':
        a = {'id': uuid.uuid4().hex[:6], 'tekst': args[0], 'bron': 'handmatig', 'prio': args[1] or 'midden', 'deadline': args[2] if len(args) > 2 else '', 'link': '', 'over': None}; ACTIES.append(a); return a
    if fn == 'apiKennisbank':
        t = {k: 0 for k in ['contract', 'werkwijze', 'schooldossier', 'voorstel', 'prijslijst', 'overig']}
        for x in DOCS: t[x['type']] += 1
        return {'tellingen': t, 'documenten': DOCS, 'laatsteIndex': d(0) + ' 04:01', 'mapUrl': 'https://drive.google.com/'}
    if fn == 'apiIndexeer': return {'aantal': 6, 'nieuw': 0, 'bijgewerkt': 1, 'verwijderd': 0}
    if fn == 'apiBrein':  # v3.5: assistent met voorgestelde acties
        v = str(args[0]).lower()
        if 'offerte' in v:
            return {'antwoord': 'Ik heb een offerte voor Voorbeeldcollege Zuid klaargezet: 2 ondersteuners, ma t/m vr van 10 tot 16 uur, tegen het tarief uit de prijzenlijst [2]. Bevestig hieronder.',
                    'bronnen': [{'titel': 'Prijzenlijst 2026-2027', 'url': 'https://drive.google.com/', 'type': 'prijslijst'}],
                    'acties': [{'id': 'tu1', 'soort': 'maak_offerte', 'titel': 'Offerte maken', 'invoer': {'titel': 'Onderwijsondersteuning', 'school': 'Voorbeeldcollege Zuid', 'hulpvraag': 'De school zoekt dagelijkse ondersteuning in het leerplein.', 'aanpak': 'Twee ondersteuners per dag.', 'rooster': 'Maandag t/m vrijdag 10:00-16:00.', 'kosten': '2 x 6 uur x 5 dagen x EUR 42 = EUR 2.520 per week.', 'schoolId': 's1'}},
                               {'id': 'tu2', 'soort': 'maak_taak', 'titel': 'Taak aanmaken', 'invoer': {'tekst': 'Offerte Voorbeeldcollege nabellen', 'deadline': d(5), 'prio': 'midden', 'schoolId': 's1'}}]}
        if 'concept' in v:
            return {'antwoord': 'Ik heb een conceptreactie klaargezet.', 'bronnen': [], 'acties': [{'id': 'tu3', 'soort': 'maak_conceptmail', 'titel': 'Conceptmail', 'invoer': {'threadId': 'th1', 'tekst': 'Beste mevrouw De Vries,\n\nDank voor uw mail over het rooster.'}}]}
        return {'antwoord': 'Het uurtarief voor huiswerkbegeleiding bij Lyceum Demo is **€ 42** per uur [1].', 'bronnen': [{'titel': 'Schooldossier Lyceum Demo', 'url': 'https://drive.google.com/', 'type': 'schooldossier'}], 'acties': []}
    if fn == 'apiBreinUitvoeren':
        a = args[0]; BREIN_UITGEVOERD.append(a)
        if a['soort'] == 'maak_offerte': return {'melding': 'Offerte staat klaar in Drive.', 'url': 'https://docs.google.com/document/d/x'}
        if a['soort'] == 'maak_conceptmail': return {'melding': 'Concept staat klaar in Gmail.', 'url': 'https://mail.google.com/mail/#drafts'}
        return {'melding': 'Taak aangemaakt: ' + a['invoer'].get('tekst', '')}
    if fn == 'apiVraag':
        return {'antwoord': 'Het uurtarief voor huiswerkbegeleiding bij Lyceum Demo is **€ 42** per uur, bij 8 uur per week [1]. In de prijzenlijst 2026-2027 staat een range van € 40 tot € 45 [2].', 'bronnen': [{'titel': 'Schooldossier Lyceum Demo', 'url': 'https://drive.google.com/', 'type': 'schooldossier'}, {'titel': 'Prijzenlijst 2026-2027', 'url': 'https://drive.google.com/', 'type': 'prijslijst'}]}
    if fn == 'apiReview':
        eerder = copy.deepcopy(REVIEW); eerder['datum'] = d(-1); eerder['samenvatting'] = 'Goedemorgen Menno. Een rustige dag gisteren.'
        return {'laatste': REVIEW, 'eerdere': [{'id': 'r0', 'datum': eerder['datum'], 'gemaaktOp': d(-1) + ' 05:01', 'samenvatting': eerder['samenvatting'], 'tellingen': {'gedaan': 1, 'blijvenLiggen': 0, 'vandaag': 3}}]}
    if fn == 'apiReviewNu':
        REVIEW['gemaaktOp'] = nu(); return REVIEW
    if fn == 'apiHuisstijl':
        return {'velden': HUIS, 'kleuren': [{'naam': 'Paars', 'hex': HUIS['kleur_primair'], 'gebruik': 'primair'}, {'naam': 'Oranje', 'hex': HUIS['kleur_accent'], 'gebruik': 'accent'}, {'naam': 'Diep paars', 'hex': '#5D0095', 'gebruik': 'secundair'}, {'naam': 'Inkt', 'hex': '#241A28', 'gebruik': 'tekst'}, {'naam': 'Achtergrond', 'hex': '#FBF9F6', 'gebruik': 'achtergrond'}],
                'toon': HUIS['toon'].split('\n'), 'zinnen': [{'titel': z.split('|')[0].strip(), 'tekst': z.split('|')[1].strip()} for z in HUIS['zinnen'].split('\n')],
                'types': [{'id': 'linkedin', 'naam': 'LinkedIn-post'}, {'id': 'mail', 'naam': 'E-mail aan een school'}, {'id': 'nieuwsbrief', 'naam': 'Nieuwsbriefitem'}, {'id': 'vacature', 'naam': 'Vacaturetekst'}, {'id': 'voorstel', 'naam': 'Intro voor een samenwerkingsvoorstel'}], 'recent': [dict(c, magWijzigen=True) for c in CONTENT], 'magBewerken': True}
    if fn == 'apiHuisstijlOpslaan':  # v3.7
        HUIS.update(args[0]); return handle('apiHuisstijl', [])
    if fn == 'apiContentOpslaan':
        c = per_id(CONTENT)[args[0]['id']]; c.update({k: v for k, v in args[0].items() if k in ('onderwerp', 'tekst')}); return dict(c, magWijzigen=True)
    if fn == 'apiDocumentOpslaan':
        dd = per_id(DOCS)[args[0]]; dd.update(args[1]); return dd
    if fn == 'apiZetHuisstijl':
        HUIS[args[0]] = args[1]; return None
    if fn == 'apiMaakContent':
        c = {'id': uuid.uuid4().hex[:6], 'datum': nu(), 'type': args[0], 'typeNaam': {'linkedin': 'LinkedIn-post', 'mail': 'E-mail aan een school'}.get(args[0], args[0]), 'onderwerp': args[1], 'tekst': 'Onderwerp: ' + args[1] + '\n\nBeste [naam],\n\nDit is een voorbeeldtekst uit de mock-backend, in de toon van AthenaSchool.\n\nMet vriendelijke groet,\nMenno Adan\nAthenaSchool'}
        CONTENT.insert(0, c); return c
    if fn == 'apiTrajecten':
        ts = [dict(t, updates=len([a for a in ACTIVITEITEN if a.get('trajectId') == t['id']]), magWijzigen=eigen_project(t)) for t in TRAJECTEN if eigen_project(t)]  # v4.0
        return {'trajecten': ts, 'am': ['Joris', 'Mees', 'Menno'], 'ik': ik(), 'gebruikers': GEBRUIKERS_NAMEN,
                'filters': {'schooljaren': ['2026-2027', '2025-2026'], 'trajecten': sorted({t['traject'] for t in ts}), 'statussen': KEUZES['trajectStatussen'], 'verlenging': KEUZES['verlenging']}}
    if fn == 'apiTraject':
        t = [x for x in TRAJECTEN if x['id'] == args[0]][0]
        return {'traject': t, 'documenten': [x for x in DOCS if x['school'] == t['school']], 'notities': [dict(n, soort='activiteit', door='Menno', onderwerp='', ruw=n['tekst']) for n in NOTITIES.get(t['id'], [])], 'kansen': [k for k in KANSEN if k['school'] == t['school']], 'school': {'naam': t['school'], 'plaats': t['plaats'], 'contactpersoon': t['contactpersoon'], 'email': 'contact@voorbeeld.nl', 'telefoon': '', 'status': 'klant', 'am': t['am']}}
    if fn == 'apiTrajectOpslaan':
        o = args[0]
        if o.get('id'):
            for t in TRAJECTEN:
                if t['id'] == o['id']:
                    if not eigen_project(t): geen_toegang()
                    o = {k: v for k, v in o.items() if k != '_oud'}; t.update(o)
                    if o.get('schoolId'): t['school'] = per_id(SCHOLEN)[o['schoolId']]['naam']
                    return t
        o = dict(o); o['id'] = uuid.uuid4().hex[:6]; o.setdefault('omzet', 0); o['bijgewerkt'] = nu()
        if o.get('schoolId'): o['school'] = per_id(SCHOLEN)[o['schoolId']]['naam']
        for _v in ('kansId', 'adviseur', 'soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer', 'am', 'schoolId', 'plaats', 'contactpersoon', 'samenvatting', 'start', 'eind'): o.setdefault(_v, '')
        TRAJECTEN.insert(0, o); return o
    if fn == 'apiNotitieToevoegen':
        n = {'id': uuid.uuid4().hex[:6], 'datum': nu(), 'tekst': args[1]}; NOTITIES.setdefault(args[0], []).insert(0, n); return dict(n, soort='activiteit', door='Menno', ruw=args[1], onderwerp='')
    if fn == 'apiStatus':
        return {'versie': '2.0', 'sheetUrl': 'https://docs.google.com/', 'mapUrl': 'https://drive.google.com/', 'model': 'claude-opus-5', 'effort': 'medium', 'claudeIngesteld': True, 'driveApi': False, 'laatsteIndex': d(0) + ' 04:01', 'laatsteReview': d(0) + ' 05:02', 'rapportEmail': 'menno@voorbeeld.nl', 'reviewTrigger': True, 'indexTrigger': True, 'tijdzone': 'Europe/Amsterdam',
                'gebruiker': ik(), 'crmSyncTrigger': True, 'laatsteCrmSync': nu(), 'capsuleToken': True, 'capsuleMigratie': ''}
    if fn == 'apiImporteer': return {'ingevoegd': len(args[1]), 'bijgewerkt': 0}
    return handle_crm(fn, args)

class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); body = json.loads(self.rfile.read(n) or b'{}')
        if body.get('secret') not in IKKEN: out = {'ok': False, 'fout': 'secret'}
        else:
            HUIDIG[0] = body.get('secret')
            try: out = {'ok': True, 'result': handle(body.get('fn'), body.get('args') or [])}
            except Exception as e: out = {'ok': False, 'fout': str(e)}
        data = json.dumps(out).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()

ThreadingHTTPServer(('127.0.0.1', 8765), partial(H, directory=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))).serve_forever()
