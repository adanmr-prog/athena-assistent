# Mock van de Apps Script-backend voor lokaal testen van index.html (zelfde origin: repo-root statisch + /api). Start: python3 test/mock_backend.py
import json, datetime, uuid, copy, os, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from urllib.parse import urlparse, parse_qs

SECRET = 'test123'
# v6.0: met MOCK_GOOGLE=1 bootst de mock de eigen server na (api/config + Supabase Auth op /supa): de app logt dan in met Google in plaats van een koppelcode
MOCK_GOOGLE = os.environ.get('MOCK_GOOGLE') == '1'
POORT = int(os.environ.get('MOCK_POORT') or 8765)
SUPA_POORT = POORT + 1  # "Supabase" op een eigen origin, zoals echt: dan bemoeit de service worker van de app zich niet met de terugkeer na het inloggen
TOKENS = {'testtoken-menno': 'test123', 'testtoken-menno-vers': 'test123', 'testtoken-joris': 'am123'}
vandaag = datetime.date.today()
def d(n): return (vandaag + datetime.timedelta(days=n)).isoformat()
def nu(): return datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
FIN_MAAND = '2026-10'  # v7.2: de huidige maand van apiFinancien (maanden[2] van het standaardschooljaar); BEVRIEZING onthoudt de laatste bevriezing, zodat de knop "Prognose vastleggen" na één keer verdwijnt
BEVRIEZING = {'maand': ''}

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
    {'id': 'tk3', 'tekst': 'Evaluatie periode 1 inplannen', 'bron': 'crm', 'prio': 'laag', 'deadline': d(6), 'link': '', 'over': -6, 'categorie': 'afspraak', 'eigenaar': 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': 's1', 'persoonId': 'p1', 'kansId': '', 'tags': ['evaluatie']},
    # v4.6: twee subtaken onder tk3
    {'id': 'tk3a', 'tekst': 'Datum prikken met Anna', 'bron': 'crm', 'prio': 'midden', 'deadline': d(6), 'link': '', 'over': -6, 'categorie': 'bellen', 'eigenaar': 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': 's1', 'persoonId': 'p1', 'kansId': '', 'ouderId': 'tk3'},
    {'id': 'tk3b', 'tekst': 'Zaal reserveren', 'bron': 'crm', 'prio': 'laag', 'deadline': d(6), 'link': '', 'over': -6, 'categorie': 'overig', 'eigenaar': 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': 's1', 'persoonId': '', 'kansId': '', 'ouderId': 'tk3'},
    # v4.5: herhalende taak met tijd
    {'id': 'tk4', 'tekst': 'Weekstart team', 'bron': 'crm', 'prio': 'midden', 'deadline': d(5), 'link': '', 'over': -5, 'categorie': 'afspraak', 'eigenaar': 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': '', 'persoonId': '', 'kansId': '', 'tijd': '09:00', 'herhaling': {'eenheid': 'week', 'interval': 1, 'dagen': [1]}},
]
for _t in TAKEN: _t.setdefault('tijd', ''); _t.setdefault('herhaling', None); _t.setdefault('trajectId', ''); _t.setdefault('tags', []); _t.setdefault('ouderId', '')  # v4.6: tags, hoofdtaak
WEERGAVEN, HERINNERINGEN = {}, {}  # v4.6: opgeslagen weergaven en de herinneringsinstelling per koppelcode
def tags_lijst(v): return v if isinstance(v, list) else [x.strip().lower() for x in str(v or '').split(',') if x.strip()]
ACTIVITEITEN = [
    {'id': 'e1', 'type': 'mail', 'datum': d(-3) + ' 09:12', 'door': 'Menno', 'schoolId': 's1', 'persoonId': 'p1', 'kansId': '', 'onderwerp': 'Mail verstuurd: Rooster periode 2', 'tekst': 'Hoi Anna,\n\nHierbij het rooster voor periode 2.', 'duurMin': 0, 'bron': 'gmail-uit'},
    {'id': 'e2', 'type': 'gesprek', 'datum': d(-9) + ' 14:00', 'door': 'Menno', 'schoolId': 's3', 'persoonId': 'p3', 'kansId': 'k1', 'onderwerp': 'Toelichting voorstel', 'tekst': 'Positief over de aanpak, wacht op budget van het bestuur.', 'duurMin': 20, 'bron': 'app'},
    {'id': 'e3', 'type': 'fase', 'datum': d(-12) + ' 11:00', 'door': 'Menno', 'schoolId': 's3', 'persoonId': 'p3', 'kansId': 'k1', 'onderwerp': 'Mijlpaal: gesprek → voorstel', 'tekst': '', 'duurMin': 0, 'bron': 'app'},
    {'id': 'e4', 'type': 'afspraak', 'datum': d(2) + ' 10:00', 'door': 'Mees', 'schoolId': 's2', 'persoonId': 'p2', 'kansId': 'k2', 'onderwerp': 'Gesprek teamleider Lyceum Demo', 'tekst': '', 'duurMin': 60, 'bron': 'agenda'},
]
DOELEN = [{'id': 'mees-week-gesprekken', 'eigenaar': 'Mees', 'periode': 'week', 'metric': 'gesprekken', 'doel': 8},
          {'id': 'joris-maand-bezetting', 'eigenaar': 'Joris', 'periode': 'maand', 'metric': 'bezetting', 'doel': 100},
          {'id': 'bedrijf-schooljaar-omzet', 'eigenaar': 'bedrijf', 'periode': 'schooljaar', 'metric': 'omzet', 'doel': 250000}]
# v4.2: maatstaven per team (zoals METRIEKEN in Code.gs, ingekort)
METR = [{'id': 'gesprekken', 'team': 'consultancy', 'label': 'Gesprekken', 'kort': 'Gespr.', 'soort': 'aantal'}, {'id': 'gewonnenWaarde', 'team': 'consultancy', 'label': 'Gewonnen waarde', 'kort': 'Won €', 'soort': 'euro'},
        {'id': 'conversie', 'team': 'consultancy', 'label': 'Conversie (gewonnen van gesloten)', 'kort': 'Conv.', 'soort': 'procent'},
        {'id': 'lopendeProjecten', 'team': 'accountmanagement', 'label': 'Lopende projecten', 'kort': 'Lopend', 'soort': 'aantal'}, {'id': 'bezetting', 'team': 'accountmanagement', 'label': 'Bezetting (gevuld van nodig)', 'kort': 'Bezet', 'soort': 'procent'},
        {'id': 'dagenTotBezetting', 'team': 'accountmanagement', 'label': 'Dagen tot bezetting', 'kort': 'Dagen', 'soort': 'dagen', 'laagIsGoed': True},
        {'id': 'voordrachten', 'team': 'talent', 'label': 'Voordrachten', 'kort': 'Voordr.', 'soort': 'aantal'}, {'id': 'timeToFill', 'team': 'talent', 'label': 'Time-to-fill', 'kort': 'TTF', 'soort': 'dagen', 'laagIsGoed': True},
        {'id': 'omzet', 'team': 'bedrijf', 'label': 'Omzet schooljaar', 'kort': 'Omzet', 'soort': 'euro'}, {'id': 'verlengingspercentage', 'team': 'bedrijf', 'label': 'Verlengingspercentage', 'kort': 'Verl.', 'soort': 'procent'}]
TEAMLEDEN = {'consultancy': ['Menno'], 'accountmanagement': ['Joris', 'Mees'], 'talent': ['Lotte']}
CIJFERS = {'gesprekken': 4, 'gewonnenWaarde': 12000, 'conversie': 50, 'lopendeProjecten': 3, 'bezetting': 75, 'dagenTotBezetting': 12, 'voordrachten': 5, 'timeToFill': 9}
def doelen_van(periode, eig): return {x['metric']: x['doel'] for x in DOELEN if x['periode'] == periode and x['eigenaar'] == eig}
def bedrijf(): return {'schooljaar': '2026-2027', 'metrieken': [m for m in METR if m['team'] == 'bedrijf'], 'cijfers': {'omzet': 87580, 'verlengingspercentage': 50}, 'doelen': doelen_van('schooljaar', 'bedrijf')}
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
    for _v in ('contactgegevens', 'voorstelUrl', 'documentenUrl', 'verlenging', 'xpsProject'): _t.setdefault(_v, '')
TRAJECTEN[0].update({'contactgegevens': 'Anna de Vries\n06-12345678\na.devries@voorbeeldcollege.nl', 'voorstelUrl': 'https://docs.google.com/document/d/voorbeeld', 'documentenUrl': 'https://drive.google.com/drive/folders/voorbeeld', 'verlenging': 'voorstel verstuurd'})
TRAJECTEN[1].update({'verlenging': 'nog bespreken'})
TRAJECTEN[0].update({'soortFacturatie': 'vooraf', 'gefactureerd': 'ja', 'vakanties': 'doorbetaald', 'factuurnummer': '20210009', 'adviseur': 'Menno'})
TRAJECTEN[1].update({'soortFacturatie': 'achteraf', 'gefactureerd': 'nee', 'vakanties': 'niet doorbetaald', 'bijzonderheden': 'Wachten op akkoord'})
FACTUREN = [{'id': 'f1', 'trajectId': 't1', 'omschrijving': 'Factuur vooraf', 'bedrag': 20370, 'datum': d(-2), 'status': 'verzonden', 'factuurnummer': '20210009', 'bijzonderheden': 'op basis van 38 weken', 'exactId': '', 'door': 'Menno'},
            {'id': 'f2', 'trajectId': 't1', 'omschrijving': 'Januari', 'bedrag': 2037, 'datum': d(90), 'status': 'nog te doen', 'factuurnummer': '', 'bijzonderheden': '', 'exactId': '', 'door': 'Menno'}]
KEUZES = {'soortFacturatie': ['vooraf', 'achteraf'], 'gefactureerd': ['ja', 'nee', 'n.v.t.'], 'vakanties': ['doorbetaald', 'niet doorbetaald', 'n.v.t.'], 'factuurStatussen': ['nog te doen', 'aangemaakt', 'verzonden', 'betaald'], 'trajectStatussen': ['opstart', 'bezig', 'afgelopen', 'onduidelijk', 'gestopt'], 'verlenging': ['nog bespreken', 'voorstel verstuurd', 'verlengd', 'stopt']}
# v4.0: twee gebruikers. test123 = Menno (management), am123 = Joris (accountmanager): ziet geen pipeline, alleen zijn eigen projecten en facturatie
ALLES = {o: {'zien': 'alles', 'wijzigen': 'alles'} for o in ('relaties', 'pipeline', 'projecten', 'facturatie', 'vacatures', 'kandidaten', 'talenten', 'beoordelingen', 'financien')}  # v5.0: talenten, beoordelingen
IKKEN = {'test123': {'naam': 'Menno', 'team': 'management', 'rol': 'management', 'beheer': True, 'gekoppeld': True, 'rechten': dict(ALLES, beheer=True, teamlead=False, doelen=True)},
         'am123': {'naam': 'Joris', 'team': 'accountmanagement', 'rol': 'medewerker', 'beheer': False, 'gekoppeld': False, 'rechten': {'relaties': {'zien': 'alles', 'wijzigen': 'alles'}, 'pipeline': {'zien': 'geen', 'wijzigen': 'geen'},
                   'projecten': {'zien': 'eigen', 'wijzigen': 'eigen'}, 'facturatie': {'zien': 'eigen', 'wijzigen': 'eigen'}, 'vacatures': {'zien': 'eigen', 'wijzigen': 'eigen'}, 'kandidaten': {'zien': 'eigen', 'wijzigen': 'eigen'},
                   'talenten': {'zien': 'eigen', 'wijzigen': 'geen'}, 'beoordelingen': {'zien': 'eigen', 'wijzigen': 'eigen'}, 'financien': {'zien': 'eigen', 'wijzigen': 'geen'}, 'beheer': False, 'teamlead': False, 'doelen': False}},  # v6.5: financien
         # v4.1: talentscout Lotte (code talent123): bezetting, geen pipeline of facturatie; v5.0: het hele talentbestand
         'talent123': {'naam': 'Lotte', 'team': 'talent', 'rol': 'medewerker', 'beheer': False, 'gekoppeld': False, 'rechten': {'relaties': {'zien': 'alles', 'wijzigen': 'geen'}, 'pipeline': {'zien': 'geen', 'wijzigen': 'geen'},
                   'projecten': {'zien': 'opstart', 'wijzigen': 'geen'}, 'facturatie': {'zien': 'geen', 'wijzigen': 'geen'}, 'financien': {'zien': 'geen', 'wijzigen': 'geen'}, 'vacatures': {'zien': 'alles', 'wijzigen': 'alles'}, 'kandidaten': {'zien': 'alles', 'wijzigen': 'alles'},
                   'talenten': {'zien': 'alles', 'wijzigen': 'alles'}, 'beoordelingen': {'zien': 'alles', 'wijzigen': 'alles'}, 'beheer': False, 'teamlead': False, 'doelen': False}}}
HUIDIG = ['test123']
def ik(): return dict(IKKEN[HUIDIG[0]])
def beheer(): return ik()['beheer']
def eigen_project(t):
    if ik()['team'] == 'talent': return t.get('status') == 'opstart' or t.get('talentscout') == ik()['naam'] or any(v['trajectId'] == t['id'] and v['status'] == 'open' for v in VACATURES)  # v6.4: talentscout
    return beheer() or t.get('am') == ik()['naam']
# v4.1: vacatures, kandidaten, taskforce en meldingen
VACATURES = [{'id': 'v1', 'trajectId': 't4', 'titel': 'NT2-ondersteuner', 'aantal': 2, 'dagen': 'ma t/m do 9-15 uur', 'urenPerWeek': 16, 'start': '2026-11-02', 'eind': '2027-04-30', 'profiel': 'Ervaring met NT2, liefst pabo', 'status': 'open', 'door': 'Menno', 'aangemaakt': nu()},
             # v5.0: een vacature op het project van Joris, met een geplaatste kandidaat uit het talentbestand (Beoordelen)
             {'id': 'v2', 'trajectId': 't6', 'titel': 'Examentrainer wiskunde', 'aantal': 2, 'dagen': 'Woensdagmiddag', 'urenPerWeek': 10, 'start': '2027-03-01', 'eind': '2027-05-15', 'profiel': 'Wiskunde A op havo/vwo-niveau', 'status': 'open', 'door': 'Joris', 'aangemaakt': nu()}]
KANDIDATEN = [{'id': 'c1', 'vacatureId': 'v1', 'trajectId': 't4', 'naam': 'Eva de Wit', 'email': 'eva@voorbeeld.nl', 'telefoon': '', 'bron': 'talentbestand', 'xpsId': 'X123', 'afasNummer': '', 'status': 'voorgesteld', 'statusSinds': d(-2) + ' 10:00', 'gesprek': '', 'notitie': '', 'door': 'Lotte', 'talentId': 'tl1'},
              {'id': 'c2', 'vacatureId': 'v2', 'trajectId': 't6', 'naam': 'Noor Bakker', 'email': 'noor.bakker@voorbeeld.nl', 'telefoon': '', 'bron': 'talentbestand', 'xpsId': 'X124', 'afasNummer': '', 'status': 'geplaatst', 'statusSinds': d(-9) + ' 10:00', 'gesprek': '', 'notitie': '', 'door': 'Lotte', 'talentId': 'tl2', 'functie': 'Examentrainer wiskunde', 'start': d(-9), 'eind': '2027-05-15', 'urenPerWeek': 10, 'dagen': 'Woensdagmiddag'}]
MELDINGEN = [{'id': 'm1', 'voor': 'Menno', 'tekst': 'Nieuwe kandidaat voor NT2-ondersteuner bij ISK Voorbeeld: Eva de Wit. Plan het matchinggesprek.', 'link': 'project:t4', 'datum': nu(), 'gelezen': '', 'door': 'Lotte'},
             {'id': 'm2', 'voor': 'Lotte', 'tekst': 'Nieuwe vacature: NT2-ondersteuner (2×) bij ISK Voorbeeld', 'link': 'project:t4', 'datum': nu(), 'gelezen': '', 'door': 'Menno'}]
KSTATUS = ['voorgesteld', 'gesprek', 'geselecteerd', 'academy', 'contract', 'vog', 'klaar voor start', 'geplaatst', 'afgerond', 'gestopt', 'reserve', 'afgewezen']  # v5.0: geplaatst, afgerond, gestopt
GEVULD = ('klaar voor start', 'geplaatst'); VOORBIJ = ('afgerond', 'gestopt')
VRAGEN = [{'naam': 'hulpvraag', 'label': 'Hulpvraag van de school'}, {'naam': 'inzet', 'label': 'Inzet (aantal ondersteuners, rol)'}, {'naam': 'rooster', 'label': 'Rooster (dagen en tijden)'},
          {'naam': 'startdatum', 'label': 'Gewenste startdatum'}, {'naam': 'bijzonderheden', 'label': 'Bijzonderheden'}, {'naam': 'contactpersonen', 'label': 'Contactpersonen op school'}]
def kand_uit(k):
    t = per_id(TALENTEN).get(k.get('talentId') or '')  # v5.0: talentId en VOG-badge
    return dict({'talentId': '', 'functie': '', 'start': '', 'eind': '', 'urenPerWeek': '', 'dagen': '', 'xpsPlaatsingId': '', 'eindReden': ''}, **dict(k, dagenInStatus=2, vog=t['vogStatus'] if t else ''))
def vac_uit(v, met=True):
    ks = [k for k in KANDIDATEN if k['vacatureId'] == v['id']]
    u = dict(v, gevuld=len([k for k in ks if k['status'] in GEVULD]), inProces=len([k for k in ks if k['status'] not in ('afgewezen', 'reserve') + GEVULD + VOORBIJ]))
    if met: u['kandidaten'] = [kand_uit(k) for k in sorted(ks, key=lambda k: KSTATUS.index(k['status']))]
    return u
def bezetting_van(tid):
    vs = [vac_uit(v, False) for v in VACATURES if v['trajectId'] == tid and v['status'] != 'gesloten']
    return {'nodig': sum(v['aantal'] for v in vs), 'gevuld': sum(min(v['gevuld'], v['aantal']) for v in vs), 'inProces': sum(v['inProces'] for v in vs), 'openVacatures': len([v for v in vs if v['status'] == 'open'])}
def project_bezetting(t):
    return {'trajectId': t['id'], 'projectStatus': t['status'], 'vacatures': [dict(vac_uit(v), magBevestigen=ik()['team'] != 'talent') for v in VACATURES if v['trajectId'] == t['id']], 'bezetting': bezetting_van(t['id']),  # v6.4.2: magBevestigen
            'taskforce': t.get('taskforce') or {}, 'taskforceVragen': VRAGEN, 'afspraken': [{'id': x['id'], 'tekst': x['tekst'], 'eigenaar': x['eigenaar'], 'deadline': x['deadline'], 'status': x['status']} for x in TAKEN if x.get('trajectId') == t['id'] and x.get('bron') == 'taskforce'],
            'keuzesBezetting': {'kandidaatStatussen': KSTATUS, 'vacatureStatussen': ['concept', 'open', 'ingevuld', 'gesloten'], 'bronnen': ['XPS-bestand', 'LinkedIn', 'eigen netwerk', 'sollicitatie', 'anders']},
            'rechtenBezetting': {'vacatures': ik()['team'] != 'consultancy', 'kandidatenZien': True, 'kandidaten': True, 'taskforce': True, 'talentscout': ik()['team'] != 'talent', 'talentscoutZelf': ik()['team'] != 'talent' or not t.get('talentscout')},  # v6.4
            'talentscout': t.get('talentscout', ''), 'talentscouts': ['Lotte'], 'taskforceGepland': (t.get('taskforce') or {}).get('gepland', '')}  # v6.4
def meld(voor, tekst, link):
    if voor and voor != ik()['naam']: MELDINGEN.append({'id': 'm' + uuid.uuid4().hex[:5], 'voor': voor, 'tekst': tekst, 'link': link, 'datum': nu(), 'gelezen': '', 'door': ik()['naam']})
# v5.0: het talentbestand (fictief). tl1 hangt aan kandidaat c1 (project van Menno), tl2 aan c2 (project van Joris, geplaatst → Beoordelen)
DAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
def raster(o, m, a): return {dg: ([o, m, a] if dg not in ('za', 'zo') else [0, 0, 0]) for dg in DAGEN}
def talent(id, vn, an, plaats, functies, sectoren, status='actief', vog='groen', **k):
    t = {'id': id, 'voornaam': vn, 'achternaam': an, 'naam': vn + ' ' + an, 'email': (vn + '.' + an).lower().replace(' ', '.') + '@voorbeeld.nl', 'telefoon': '06-3000' + id[2:].zfill(4), 'postcode': '3011 AB', 'woonplaats': plaats, 'lat': 51.92, 'lon': 4.48,
         'functies': functies, 'sectoren': sectoren, 'vakken': [], 'opleiding': 'pabo, 3e jaar', 'bevoegdheid': 'geen', 'vervoer': 'ov', 'reisafstandKm': 25, 'maxUrenWeek': 24, 'beschikbaarVanaf': '', 'beschikbaarTot': '', 'beschikbaarheid': raster(2, 2, 0), 'uitzonderingen': [],
         'beschikbaarheidBevestigd': d(-5) + ' 08:00', 'laatstePeiling': '', 'contractvorm': 'min-max', 'status': status, 'statusSinds': d(-100) + ' 10:00', 'bron': 'website', 'xpsId': 'X' + id[2:], 'afasNummer': '', 'tags': [], 'velden': {}, 'toestemmingDatum': d(-100), 'toestemmingGrondslag': 'toestemming', 'bewarenTot': d(630),
         'portaalToken': '', 'portaalTokenTot': '', 'notitie': '', 'laatsteContact': d(-3), 'door': 'Lotte', 'aangemaakt': d(-100) + ' 10:00', 'bijgewerkt': nu(), 'vogStatus': vog}
    t.update(k); return t
TALENTEN = [talent('tl1', 'Eva', 'de Wit', 'Delft', ['nt2-ondersteuner', 'onderwijsondersteuner'], ['isk', 'vo'], email='eva@voorbeeld.nl', beschikbaarheid=raster(2, 0, 0), portaalToken='testtoken12345678901234', portaalTokenTot=d(60) + ' 09:00', vakken=['nederlands']),
            talent('tl2', 'Noor', 'Bakker', 'Rotterdam', ['onderwijsondersteuner', 'nt2-ondersteuner'], ['vo', 'po'], vog='oranje'),
            talent('tl3', 'Sam', 'Visser', 'Den Haag', ['nt2-ondersteuner'], ['isk'], status='aangemeld', vog='ontbreekt', beschikbaarheidBevestigd=''),
            talent('tl4', 'Lara', 'Smit', 'Leiden', ['huiswerkbegeleider', 'examentrainer'], ['vo'], status='slapend', vog='verlopen', laatstePeiling=d(-20) + ' 06:35')]
TALENTDOCS = [{'id': 'td1', 'talentId': 'tl1', 'soort': 'vog', 'afgifte': d(-40), 'geldigTot': '', 'status': 'geldig', 'heeftBestand': False, 'gecontroleerdDoor': 'Lotte', 'gecontroleerdOp': d(-38) + ' 10:00', 'notitie': '', 'door': 'Lotte', 'aangemaakt': d(-38) + ' 10:00'},
              {'id': 'td2', 'talentId': 'tl2', 'soort': 'vog', 'afgifte': d(-200), 'geldigTot': '', 'status': 'geldig', 'heeftBestand': True, 'gecontroleerdDoor': 'Lotte', 'gecontroleerdOp': d(-198) + ' 10:00', 'notitie': '', 'door': 'Lotte', 'aangemaakt': d(-198) + ' 10:00'}]
BEOORDELINGEN, TALENTSCHOOL = [], []
TALENTUREN = [{'week': '2026-W%02d' % w, 'talentId': 'tl2', 'uren': 10, 'diensten': 1, 'noShows': 0, 'lateAfmeldingen': 0, 'xpsProject': '10.880', 'project': 'Lyceum Demo · Examentraining'} for w in range(37, 41)]
TALENT_KEUZES = {'functies': ['onderwijsondersteuner', 'studentdocent', 'huiswerkbegeleider', 'examentrainer', 'nt2-ondersteuner', 'rekenondersteuner', 'surveillant'], 'sectoren': ['po', 'vo', 'mbo', 'so', 'isk'], 'vakken': ['nederlands', 'engels', 'wiskunde', 'rekenen'], 'statussen': ['aangemeld', 'gescreend', 'actief', 'slapend', 'uitgeschreven'],
                 'contractvormen': ['ovo', 'min-max', 'zzp', 'stage'], 'documentSoorten': ['vog', 'diploma', 'certificaat', 'bevoegdheid', 'overig'], 'bronnen': ['website', 'xps-bestand', 'linkedin', 'eigen netwerk', 'sollicitatie', 'anders'], 'vervoer': ['auto', 'ov', 'fiets'], 'criteria': ['punctualiteit', 'didactiek', 'samenwerking', 'communicatie'],
                 'oordelen': ['favoriet', 'goed', 'niet geschikt'], 'schoolStatussen': ['favoriet', 'neutraal', 'niet meer'], 'documentStatussen': ['geldig', 'verlopen', 'ontbreekt', 'in aanvraag'], 'dagen': DAGEN, 'dagdelen': ['ochtend', 'middag', 'avond']}
PUNTEN = {'favoriet': 3, 'goed': 2, 'niet geschikt': 1}
def talent_alles(): return ik()['rechten'].get('talenten', {}).get('zien') == 'alles'
def mijn_talenten(): return {k['talentId'] for k in KANDIDATEN if k.get('talentId') and eigen_project(per_id(TRAJECTEN)[k['trajectId']])}
def vog_van(t): return {'status': t.get('vogStatus', 'ontbreekt'), 'afgifte': next((x['afgifte'] for x in TALENTDOCS if x['talentId'] == t['id'] and x['soort'] == 'vog'), ''), 'geldigTot': ''}
def beo_samen(tid):
    l = sorted([b for b in BEOORDELINGEN if b['talentId'] == tid], key=lambda b: b['datum'], reverse=True)
    if not l: return {'aantal': 0, 'gem': None, 'laatste': None, 'favorieten': 0, 'nietGeschikt': 0}
    return {'aantal': len(l), 'gem': round(sum(PUNTEN[b['oordeel']] for b in l) / len(l), 1), 'laatste': {'oordeel': l[0]['oordeel'], 'datum': l[0]['datum'], 'door': l[0]['door']}, 'favorieten': len([b for b in l if b['oordeel'] == 'favoriet']), 'nietGeschikt': len([b for b in l if b['oordeel'] == 'niet geschikt'])}
def beo_uit(b):
    s = per_id(SCHOLEN).get(b.get('schoolId')); t = per_id(TRAJECTEN).get(b.get('trajectId'))
    return dict(b, school=s['naam'] if s else '', project=(t['traject'] + ' ' + t['schooljaar']) if t else '', magWijzigen=beheer() or b['door'] == ik()['naam'] or talent_alles())
def ts_uit(r): return dict(r, school=per_id(SCHOLEN)[r['schoolId']]['naam'])
def talent_uit(t, beperkt):
    u = {'id': t['id'], 'voornaam': t['voornaam'], 'achternaam': t['achternaam'], 'naam': t['naam'], 'functies': t['functies'], 'sectoren': t['sectoren'], 'vakken': t['vakken'], 'status': t['status'], 'statusSinds': t['statusSinds'], 'email': t['email'], 'telefoon': t['telefoon'], 'vog': vog_van(t), 'beoordeling': beo_samen(t['id']),
         'plaatsingen': len([k for k in KANDIDATEN if k.get('talentId') == t['id'] and k['status'] in GEVULD]), 'beschikbaarheidBevestigd': t['beschikbaarheidBevestigd'], 'beperkt': beperkt, 'compleetheid': 87 if t['beschikbaarheidBevestigd'] else 60, 'woonplaats': t['woonplaats']}
    if beperkt: return u
    u.update({k: t[k] for k in ('postcode', 'lat', 'lon', 'opleiding', 'bevoegdheid', 'vervoer', 'reisafstandKm', 'maxUrenWeek', 'beschikbaarVanaf', 'beschikbaarTot', 'beschikbaarheid', 'uitzonderingen', 'laatstePeiling', 'contractvorm', 'bron', 'xpsId', 'afasNummer', 'tags', 'velden', 'toestemmingDatum', 'toestemmingGrondslag', 'bewarenTot', 'notitie', 'laatsteContact', 'door', 'aangemaakt', 'bijgewerkt')})
    u['portaal'] = bool(t['portaalToken']); u['ontbreekt'] = [] if t['beschikbaarheidBevestigd'] else ['beschikbaarheid', 'vervoer']
    return u
def talent_rechten(): return {'wijzigen': talent_alles(), 'vol': talent_alles(), 'beheer': beheer()}
def plaatsingen_van(t, vol):
    tm, vm, uit = per_id(TRAJECTEN), per_id(VACATURES), []
    for k in KANDIDATEN:
        if k.get('talentId') != t['id']: continue
        tr = tm.get(k['trajectId'], {}); v = vm.get(k['vacatureId'], {})
        if not vol and not eigen_project(tr): continue
        uit.append({'id': k['id'], 'vacatureId': k['vacatureId'], 'trajectId': k['trajectId'], 'school': tr.get('school', ''), 'schoolId': tr.get('schoolId', ''), 'traject': tr.get('traject', ''), 'schooljaar': tr.get('schooljaar', ''), 'am': tr.get('am', ''), 'vacature': v.get('titel', ''), 'functie': k.get('functie') or v.get('titel', ''), 'status': k['status'], 'statusSinds': k.get('statusSinds', ''),
                    'start': k.get('start') or v.get('start', ''), 'eind': k.get('eind') or v.get('eind', ''), 'urenPerWeek': k.get('urenPerWeek') or v.get('urenPerWeek', ''), 'dagen': k.get('dagen') or v.get('dagen', ''), 'eindReden': k.get('eindReden', ''), 'door': k.get('door', ''), 'magBeoordelen': vol or k['status'] in GEVULD + VOORBIJ})
    return uit
def handle_talent(fn, args):
    if fn == 'apiTalenten':
        if ik()['rechten'].get('talenten', {}).get('zien', 'geen') == 'geen': geen_toegang()
        vol = talent_alles(); lijst = TALENTEN if vol else [t for t in TALENTEN if t['id'] in mijn_talenten()]; act = [t for t in lijst if t['status'] == 'actief']
        return {'talenten': [talent_uit(t, not vol) for t in lijst], 'ik': ik(), 'keuzes': TALENT_KEUZES,
                'tellingen': {'totaal': len(lijst), 'actief': len(act), 'slapend': len([t for t in lijst if t['status'] == 'slapend']), 'aangemeld': len([t for t in lijst if t['status'] == 'aangemeld']), 'gescreend': 0, 'vogGroen': len([t for t in act if t['vogStatus'] == 'groen']), 'compleet': len(lijst) - 1},
                'rechten': talent_rechten(), 'scholen': [{'id': s['id'], 'naam': s['naam'], 'lat': 52.0, 'lon': 4.5} for s in SCHOLEN] if vol else [],
                'benaderen': [{'id': 'tl4', 'naam': 'Lara Smit', 'redenen': ['peiling niet beantwoord', 'VOG verlopen']}, {'id': 'tl3', 'naam': 'Sam Visser', 'redenen': ['aanmelding wacht al 8 dagen op screening']}] if vol else []}
    if fn == 'apiTalent':
        t = per_id(TALENTEN).get(args[0]); vol = talent_alles()
        if not t: raise ValueError('Talent niet gevonden.')
        if not vol and t['id'] not in mijn_talenten(): geen_toegang()
        return {'talent': talent_uit(t, not vol), 'documenten': [x for x in TALENTDOCS if x['talentId'] == t['id']] if vol else [], 'beoordelingen': [beo_uit(b) for b in BEOORDELINGEN if b['talentId'] == t['id']],
                'scholen': [ts_uit(r) for r in TALENTSCHOOL if r['talentId'] == t['id']] if vol else [], 'plaatsingen': plaatsingen_van(t, vol), 'uren': [u for u in TALENTUREN if u['talentId'] == t['id']] if vol else [],
                'tijdlijn': tijdlijn(lambda a: a.get('talentId') == t['id']) if vol else [], 'keuzes': TALENT_KEUZES, 'rechten': {'wijzigen': vol, 'vol': vol, 'beoordelen': vol or t['id'] in mijn_talenten(), 'beheer': beheer()}}
    if fn == 'apiTalentOpslaan':
        if not talent_alles(): geen_toegang()
        o = dict(args[0]); o.pop('_oud', None); forceer = o.pop('forceer', False); oud = per_id(TALENTEN).get(o.get('id') or '')
        email = (o.get('email') or (oud or {}).get('email') or '').lower(); tel = o.get('telefoon') or (oud or {}).get('telefoon') or ''
        dub = next((t for t in TALENTEN if t is not oud and t['status'] != 'uitgeschreven' and ((email and t['email'].lower() == email) or (tel and t['telefoon'] == tel))), None)
        if dub and not forceer: raise ValueError('Er is al een profiel met dit e-mailadres of telefoonnummer: ' + dub['naam'] + ' [talent:' + dub['id'] + ']')
        if not oud:
            if not o.get('toestemmingDatum'): raise ValueError('Leg de toestemming vast: de datum waarop deze persoon akkoord ging met opname in het talentbestand.')
            t = talent('tl' + uuid.uuid4().hex[:5], o.get('voornaam', ''), o.get('achternaam', ''), o.get('woonplaats', ''), o.get('functies') or [], o.get('sectoren') or [], status='aangemeld', vog='ontbreekt', email=email, telefoon=tel, door=ik()['naam'], aangemaakt=nu(), statusSinds=nu(), beschikbaarheidBevestigd='', beschikbaarheid=raster(0, 0, 0))
            for k in ('postcode', 'vakken', 'opleiding', 'bevoegdheid', 'vervoer', 'reisafstandKm', 'maxUrenWeek', 'contractvorm', 'bron', 'xpsId', 'afasNummer', 'notitie', 'toestemmingDatum', 'toestemmingGrondslag'):
                if k in o: t[k] = o[k]
            t['tags'] = tags_lijst(o.get('tags', [])); t['velden'] = o.get('velden') or {}; TALENTEN.append(t)
            ACTIVITEITEN.append({'id': 'e' + uuid.uuid4().hex[:5], 'type': 'notitie', 'datum': nu(), 'door': ik()['naam'], 'schoolId': '', 'persoonId': '', 'kansId': '', 'talentId': t['id'], 'onderwerp': 'Profiel aangemaakt', 'tekst': '', 'duurMin': 0, 'bron': 'app'})
        else:
            if 'tags' in o: o['tags'] = tags_lijst(o['tags'])
            oud.update({k: v for k, v in o.items() if k != 'id'}); oud['naam'] = (oud['voornaam'] + ' ' + oud['achternaam']).strip(); t = oud
        u = talent_uit(t, False)
        if t.get('contractvorm') == 'zzp': u['waarschuwing'] = 'Let op: zzp in het onderwijs geldt volgens de Wet DBA meestal als schijnzelfstandigheid. Overleg met de administratie.'
        return u
    if fn == 'apiTalentBeschikbaarheidOpslaan':
        t = per_id(TALENTEN)[args[0]]
        if args[1]: t['beschikbaarheid'] = {dg: [int(x) if str(x) in ('1', '2') else 0 for x in (args[1].get(dg) or [0, 0, 0])] for dg in DAGEN}
        if len(args) > 2 and args[2] is not None: t['uitzonderingen'] = args[2]
        t['beschikbaarheidBevestigd'] = nu(); return talent_uit(t, False)
    if fn == 'apiTalentPortaalLink':
        t = per_id(TALENTEN)[args[0]]; t['portaalToken'] = 'tok' + uuid.uuid4().hex[:37]; t['portaalTokenTot'] = d(90) + ' 09:00'
        link = 'http://127.0.0.1:8765/?t=' + t['portaalToken'] + '&api=http%3A%2F%2F127.0.0.1%3A8765%2Fapi'
        return {'link': link, 'bevestigLink': link.replace('&api=', '&actie=bevestig&api='), 'tot': t['portaalTokenTot'], 'gemaild': bool(args[1]) if len(args) > 1 else False}
    if fn == 'apiTalentDocumentOpslaan':
        o = dict(args[0]); bestand = args[1] if len(args) > 1 else None; oud = per_id(TALENTDOCS).get(o.get('id') or '')
        if (o.get('soort') or (oud or {}).get('soort')) == 'vog' and not (o.get('afgifte') or (oud or {}).get('afgifte')): raise ValueError('Vul de afgiftedatum van de VOG in.')
        if oud: oud.update({k: v for k, v in o.items() if k not in ('id', 'gecontroleerd')}); doc = oud
        else:
            doc = {'id': 'td' + uuid.uuid4().hex[:5], 'talentId': o['talentId'], 'soort': o.get('soort', 'vog'), 'afgifte': o.get('afgifte', ''), 'geldigTot': o.get('geldigTot', ''), 'status': o.get('status') or 'geldig', 'heeftBestand': bool(bestand), 'gecontroleerdDoor': ik()['naam'] if o.get('gecontroleerd') else '', 'gecontroleerdOp': nu() if o.get('gecontroleerd') else '', 'notitie': o.get('notitie', ''), 'door': ik()['naam'], 'aangemaakt': nu()}
            TALENTDOCS.append(doc)
        if bestand: doc['heeftBestand'] = True
        t = per_id(TALENTEN)[doc['talentId']]
        if doc['soort'] == 'vog': t['vogStatus'] = 'groen'
        return {'document': doc, 'vog': vog_van(t)}
    if fn == 'apiTalentDocumentLink':
        if not talent_alles(): geen_toegang()
        return {'url': 'https://drive.google.com/file/d/mock-' + args[0]}
    if fn == 'apiTalentSchoolOpslaan':
        o = args[0]; s = per_id(SCHOLEN)[o['schoolId']]
        TALENTSCHOOL[:] = [r for r in TALENTSCHOOL if not (r['talentId'] == o['talentId'] and r['schoolId'] == o['schoolId'] and r.get('richting', 'school') == o.get('richting', 'school'))]
        TALENTSCHOOL.append({'id': 'ts' + uuid.uuid4().hex[:5], 'talentId': o['talentId'], 'schoolId': o['schoolId'], 'status': o.get('status', 'neutraal'), 'richting': o.get('richting', 'school'), 'reden': o.get('reden', ''), 'door': ik()['naam'], 'datum': nu()})
        return [ts_uit(r) for r in TALENTSCHOOL if r['talentId'] == o['talentId']]
    if fn == 'apiBeoordelingOpslaan':
        o = dict(args[0]); oud = per_id(BEOORDELINGEN).get(o.get('id') or ''); talentteam = talent_alles(); kand = per_id(KANDIDATEN).get(o.get('kandidaatId') or (oud or {}).get('kandidaatId') or '')
        if not talentteam and not kand: raise ValueError('Kies de plaatsing waarover je oordeelt.')
        tr = per_id(TRAJECTEN).get(kand['trajectId']) if kand else None
        if oud: oud.update({k: v for k, v in o.items() if k not in ('id', 'talentId')}); b = oud
        else:
            b = {'id': 'b' + uuid.uuid4().hex[:5], 'talentId': o['talentId'], 'kandidaatId': kand['id'] if kand else '', 'trajectId': tr['id'] if tr else '', 'schoolId': tr['schoolId'] if tr else o.get('schoolId', ''), 'door': ik()['naam'], 'rol': 'talent' if talentteam else 'am', 'datum': nu(), 'oordeel': o.get('oordeel', ''), 'criteria': o.get('criteria') or {}, 'tekst': o.get('tekst', ''), 'zichtbaarheid': 'intern', 'wederhoor': o.get('wederhoor', ''), 'aangemaakt': nu()}
            BEOORDELINGEN.append(b)
            if b['oordeel'] == 'niet geschikt': meld('Lotte', per_id(TALENTEN)[b['talentId']]['naam'] + ' is door ' + ik()['naam'] + ' beoordeeld als niet geschikt.', 'talent:' + b['talentId'])
        s = per_id(SCHOLEN).get(b['schoolId'])
        return {'beoordeling': beo_uit(b), 'voorstelNietMeer': {'schoolId': b['schoolId'], 'school': s['naam'] if s else ''} if (not oud and b['oordeel'] == 'niet geschikt' and b['schoolId']) else None}
    if fn == 'apiMatch':
        if not talent_alles(): raise ValueError('Voorstellen uit het talentbestand doet het talentteam.')
        v = per_id(VACATURES)[args[0]]; t = per_id(TRAJECTEN)[v['trajectId']]; al = {k.get('talentId') for k in KANDIDATEN if k['vacatureId'] == v['id']}; kands, uit = [], []
        for tl in TALENTEN:
            if tl['status'] != 'actief': uit.append({'talentId': tl['id'], 'naam': tl['naam'], 'status': tl['status'], 'reden': 'status ' + tl['status']}); continue
            if 'nt2-ondersteuner' not in tl['functies'] and 'onderwijsondersteuner' not in tl['functies']: uit.append({'talentId': tl['id'], 'naam': tl['naam'], 'status': tl['status'], 'reden': 'functie past niet (' + ', '.join(tl['functies']) + ')'}); continue
            top = tl['id'] == 'tl1'
            onderdelen = [{'naam': 'rol', 'punten': 20, 'max': 25, 'uitleg': 'functie nt2-ondersteuner'}, {'naam': 'relatie met de school', 'punten': 8, 'max': 20, 'uitleg': 'nog niet eerder op deze school'}, {'naam': 'beschikbaarheid', 'punten': 15 if top else 8, 'max': 15, 'uitleg': 'beschikbaar op alle gevraagde dagdelen, bevestigd 5 dagen geleden' if top else 'deels "liever niet"'},
                          {'naam': 'afstand', 'punten': 15 if top else 11, 'max': 15, 'uitleg': '4 km hemelsbreed' if top else '16 km hemelsbreed'}, {'naam': 'betrouwbaarheid', 'punten': 6, 'max': 10, 'uitleg': 'nog geen uren uit XPS'}, {'naam': 'beoordeling en VOG', 'punten': 5 if top else 3, 'max': 10, 'uitleg': 'nog niet beoordeeld, VOG ' + tl['vogStatus']}, {'naam': 'voorkeur', 'punten': 3 if top else 0, 'max': 5, 'uitleg': 'uren passen'}]
            kands.append({'talentId': tl['id'], 'naam': tl['naam'], 'score': sum(x['punten'] for x in onderdelen), 'onderdelen': onderdelen, 'waarschuwingen': [] if tl['vogStatus'] == 'groen' else ['VOG ' + tl['vogStatus']], 'vog': tl['vogStatus'], 'afstandKm': 4 if top else 16, 'vastGezicht': False, 'alVoorgedragen': tl['id'] in al, 'functies': tl['functies'], 'woonplaats': tl['woonplaats'], 'beschikbaarheidBevestigd': tl['beschikbaarheidBevestigd'], 'beoordeling': beo_samen(tl['id'])})
        kands.sort(key=lambda k: -k['score'])
        return {'vacature': vac_uit(v, False), 'project': {'id': t['id'], 'school': t['school'], 'schoolId': t['schoolId'], 'traject': t['traject']}, 'functie': 'nt2-ondersteuner', 'sector': 'isk', 'roosterHerkend': True, 'dagdelen': ['ma ochtend', 'di ochtend', 'wo ochtend', 'do ochtend'], 'kandidaten': kands, 'totaal': len(kands), 'uitgesloten': uit}
    if fn == 'apiVoorstellen':
        if not talent_alles(): raise ValueError('Voorstellen uit het talentbestand doet het talentteam.')
        v = per_id(VACATURES)[args[0]]; t = per_id(TRAJECTEN)[v['trajectId']]; al = {k.get('talentId') for k in KANDIDATEN if k['vacatureId'] == v['id']}; namen = []
        for tid in args[1]:
            if tid in al: continue
            tl = per_id(TALENTEN)[tid]
            KANDIDATEN.append({'id': 'c' + uuid.uuid4().hex[:5], 'vacatureId': v['id'], 'trajectId': t['id'], 'talentId': tid, 'naam': tl['naam'], 'email': tl['email'], 'telefoon': tl['telefoon'], 'bron': 'talentbestand', 'xpsId': tl['xpsId'], 'afasNummer': '', 'status': 'voorgesteld', 'statusSinds': nu(), 'gesprek': '', 'notitie': args[2] if len(args) > 2 else '', 'door': ik()['naam'], 'functie': v['titel'], 'start': v.get('start', ''), 'eind': v.get('eind', ''), 'urenPerWeek': v.get('urenPerWeek', ''), 'dagen': v.get('dagen', '')})
            TAKEN.append({'id': 'tk' + uuid.uuid4().hex[:5], 'tekst': 'Matchinggesprek met ' + tl['naam'] + ' (' + t['school'] + ', ' + v['titel'] + ')', 'bron': 'bezetting', 'prio': 'hoog', 'deadline': d(3), 'link': 'talent:' + tid, 'over': -3, 'categorie': 'afspraak', 'eigenaar': t['am'], 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': t['schoolId'], 'persoonId': '', 'kansId': '', 'trajectId': t['id']})
            namen.append(tl['naam'])
        if namen: meld(t['am'], str(len(namen)) + ' kandidaten voorgedragen voor ' + v['titel'] + ' bij ' + t['school'] + ': ' + ', '.join(namen) + '. Plan de matchinggesprekken.', 'project:' + t['id'])
        r = project_bezetting(t); r['aantal'] = len(namen); r['overgeslagen'] = len(args[1]) - len(namen); return r
    if fn == 'apiTalentRapport':
        if not talent_alles(): geen_toegang()
        c = {'aanmeldingen': 3, 'gescreend': 2, 'voordrachten': 5, 'plaatsingen': 2, 'beoordelingen': len(BEOORDELINGEN), 'beoordelingGem': 2.5, 'reactiePeiling': 3}
        return {'preset': args[0] or 'maand', 'stap': 0, 'van': d(-20), 'tot': d(0), 'label': 'oktober 2026', 'lopend': True, 'vergelijk': {'label': 'vorige periode', 'kort': 'vorige', 'cijfers': {k: (x - 1 if isinstance(x, int) else x) for k, x in c.items()}}, 'cijfers': c, 'reeksLabels': ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
                'reeks': {'aanmeldingen': [1, 2, 1, 3, 2, 3], 'voordrachten': [2, 3, 4, 3, 5, 5], 'plaatsingen': [0, 1, 1, 2, 1, 2]}, 'pool': {'aangemeld': 1, 'gescreend': 0, 'actief': 2, 'slapend': 1, 'uitgeschreven': 0}, 'actief': 2, 'vogGroen': 1, 'vogCompliance': 50, 'compleet': 3,
                'dekking': [{'functie': f, 'totaal': 2 if f in ('nt2-ondersteuner', 'onderwijsondersteuner') else 0, 'dagdelen': [2, 1, 0] if f in ('nt2-ondersteuner', 'onderwijsondersteuner') else [0, 0, 0]} for f in TALENT_KEUZES['functies']], 'perSector': [{'sector': s, 'aantal': 1} for s in TALENT_KEUZES['sectoren']], 'dagdelen': TALENT_KEUZES['dagdelen']}
    if fn == 'apiTalentExport': return {'bestandsnaam': 'inzage-' + args[0] + '.json', 'tekst': json.dumps({'profiel': talent_uit(per_id(TALENTEN)[args[0]], False)})}
    if fn == 'apiTalentAnonimiseer':
        t = per_id(TALENTEN)[args[0]]; t.update({'voornaam': 'Verwijderd', 'achternaam': 'profiel', 'naam': 'Verwijderd profiel', 'email': '', 'telefoon': '', 'postcode': '', 'notitie': '', 'status': 'uitgeschreven'}); return talent_uit(t, False)
    if fn == 'apiTalentRunNu': return {'vog': 'niet vandaag (1 mei en 1 juni)', 'peiling': 0, 'slapend': 0, 'bewaartermijn': 0, 'geocoderen': 0, 'aanmeldingen': '0 nieuw, 0 bestaand, 0 mails'}
    if fn == 'apiTalentUrenImport': return {'bestanden': 1, 'regels': 12, 'weken': 1, 'onbekend': [], 'kandidatenBijgewerkt': 0, 'overgeslagen': []}
    return None
def handle_portaal(token, fn, args):
    t = next((x for x in TALENTEN if x['portaalToken'] and x['portaalToken'] == token), None)
    if fn not in ('apiPortaalToon', 'apiPortaalBeschikbaarheid'): return {'ok': False, 'fout': 'onbekende functie ' + str(fn)}
    if not t: return {'ok': False, 'fout': 'Deze link is verlopen; vraag een nieuwe aan bij het talentteam.'}
    if fn == 'apiPortaalToon': return {'ok': True, 'result': {'naam': t['voornaam'], 'functies': t['functies'], 'beschikbaarheid': t['beschikbaarheid'], 'uitzonderingen': t['uitzonderingen'], 'beschikbaarheidBevestigd': t['beschikbaarheidBevestigd'], 'bedrijf': 'AthenaSchool', 'dagen': DAGEN, 'dagdelen': TALENT_KEUZES['dagdelen']}}
    alleen = len(args) > 2 and args[2]
    if not alleen and args and args[0]: t['beschikbaarheid'] = args[0]
    if not alleen and len(args) > 1 and args[1] is not None: t['uitzonderingen'] = args[1]
    t['beschikbaarheidBevestigd'] = nu(); weer = t['status'] == 'slapend'
    if weer: t['status'] = 'actief'
    return {'ok': True, 'result': {'ok': True, 'beschikbaarheidBevestigd': t['beschikbaarheidBevestigd'], 'beschikbaarheid': t['beschikbaarheid'], 'uitzonderingen': t['uitzonderingen'], 'weerActief': weer}}
def geen_toegang(): raise ValueError('Daar heb je geen toegang toe.')
def project_uit(t): return dict(t, facturen=[f for f in FACTUREN if f['trajectId'] == t['id']])
def projectnaam(tid):
    t = per_id(TRAJECTEN).get(tid); return (t['traject'] + ' ' + t['schooljaar']) if t else ''
VORM_VAN_TYPE = {'notitie': 'notitie', 'gesprek': 'call', 'mail': 'mail', 'afspraak': 'afspraak-fysiek'}  # v7.1
TYPE_VAN_VORM = {'notitie': 'notitie', 'call': 'gesprek', 'mail': 'mail', 'whatsapp': 'gesprek', 'afspraak-online': 'afspraak', 'afspraak-fysiek': 'afspraak', 'evaluatie-online': 'afspraak', 'evaluatie-fysiek': 'afspraak'}
def act_uit(a):
    s, p, k = per_id(SCHOLEN).get(a.get('schoolId')), per_id(PERSONEN).get(a.get('persoonId')), per_id(CRMKANSEN).get(a.get('kansId'))
    return dict(a, vorm=a.get('vorm') or VORM_VAN_TYPE.get(a.get('type'), ''), school=s['naam'] if s else '', persoon=(p['voornaam'] + ' ' + p['achternaam']) if p else '', kans=k['naam'] if k else '', gepland=a['datum'] > nu(), trajectId=a.get('trajectId', ''), project=projectnaam(a.get('trajectId')))
def persoon_uit(p):
    s = per_id(SCHOLEN).get(p.get('schoolId')); return dict(p, naam=(p.get('voornaam', '') + ' ' + p.get('achternaam', '')).strip() or p.get('email', ''), school=s['naam'] if s else '')
def kans_uit(k):
    k = dict(k); k['gewogen'] = round((k.get('waarde') or 0) * (k.get('kans') or 0) / 100)
    m = [x for x in MIJLPALEN if x['mijlpaal'] == k['fase']]; k['stil'] = k['fase'] not in ('gewonnen', 'verloren') and k.get('dagenStil') is not None and k['dagenStil'] > (m[0]['dagenNorm'] if m else 7)
    return k
def taak_uit(t):
    s, p, k = per_id(SCHOLEN).get(t.get('schoolId')), per_id(PERSONEN).get(t.get('persoonId')), per_id(CRMKANSEN).get(t.get('kansId'))
    kinderen = [x for x in TAKEN if x.get('ouderId') == t['id']]; ouder = per_id(TAKEN).get(t.get('ouderId') or '')
    return dict(t, school=s['naam'] if s else '', persoon=persoon_uit(p)['naam'] if p else '', kans=k['naam'] if k else '', trajectId=t.get('trajectId', ''), project=projectnaam(t.get('trajectId')),
                tijd=t.get('tijd', ''), herhaling=t.get('herhaling') or None, bijgewerkt=nu(),  # v4.5
                tags=tags_lijst(t.get('tags')), ouderId=t.get('ouderId', ''), ouder=ouder['tekst'] if ouder else '', subtaken={'aantal': len(kinderen), 'af': len([x for x in kinderen if x['status'] == 'af'])})  # v4.6
def volgende_instantie(t):  # v4.5: zoals volgendeInstantie in Code.gs, versimpeld: een week later
    n = dict(t, id='tk' + uuid.uuid4().hex[:5], status='open', afgerond='', deadline=(datetime.date.fromisoformat(t['deadline'] or d(0)) + datetime.timedelta(days=7)).isoformat()); TAKEN.append(n); return n
def basis():
    scholen = []
    for s in SCHOLEN:
        open_ = [k for k in CRMKANSEN if k['schoolId'] == s['id'] and k['fase'] not in ('gewonnen', 'verloren')]
        scholen.append(dict(s, personen=len([p for p in PERSONEN if p['schoolId'] == s['id']]), openKansen=len(open_), openWaarde=sum(k['waarde'] for k in open_)))
    return {'ik': ik(), 'gebruikers': GEBRUIKERS_NAMEN, 'teams': {'management': ['Menno'], 'accountmanagement': ['Joris', 'Mees'], 'consultancy': [], 'talent': ['Lotte']},
            'meldingen': len([m for m in MELDINGEN if m['voor'] == ik()['naam'] and not m['gelezen']]), 'schooljaar': INSTELLINGEN.get('schooljaarHandmatig') or '2026-2027', 'statussen': INSTELLINGEN['schoolStatussen'], 'mijlpalen': MIJLPALEN,
            'categorieen': ['bellen', 'mailen', 'afspraak', 'voorstel', 'opvolgen', 'overig'], 'activiteitTypes': ['notitie', 'gesprek', 'mail', 'afspraak'], 'activiteitVormen': list(TYPE_VAN_VORM), 'tracks': TRACKS,
            'tags': sorted({t for s in SCHOLEN for t in s['tags']}), 'trajectStatussen': INSTELLINGEN['trajectStatussen'], 'keuzes': KEUZES,
            'projecten': [{'id': t['id'], 'naam': t['traject'] + ' ' + t['schooljaar'], 'schoolId': t['schoolId'], 'school': t['school'], 'kansId': t['kansId'], 'status': t['status'], 'am': t['am']} for t in TRAJECTEN if eigen_project(t)], 'scholen': scholen, 'personen': [persoon_uit(p) for p in PERSONEN],
            'kansenKort': [{'id': k['id'], 'naam': k['naam'], 'school': k['school'], 'schoolId': k['schoolId']} for k in CRMKANSEN if k['fase'] not in ('gewonnen', 'verloren')]}  # v4.5
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
                'facturen': [f for f in FACTUREN if f['trajectId'] == t['id']] if ik()['team'] != 'talent' else None, 'keuzes': KEUZES,
                'rechten': {'wijzigen': ik()['team'] != 'talent', 'facturatie': ik()['team'] != 'talent', 'facturatieWijzigen': ik()['team'] != 'talent'}, **project_bezetting(t)}
    if fn == 'apiFinancien':  # v6.5: vaste vorm zoals de echte backend (bedragen in centen); de rekenregels test test/node_rooktest.js tegen Code.gs
        if ik()['team'] == 'talent': geen_toegang()
        sj = args[0] if args and args[0] else '2026-2027'; j = int(sj[:4]); maanden = [str(j + (7 + i) // 12) + '-' + str((7 + i) % 12 + 1).zfill(2) for i in range(12)]
        def r(**k):
            u = {x: [0] * 12 for x in ['prognose', 'prognoseKas', 'gefactureerd', 'ontvangen', 'geleverd', 'prognoseToen']}
            for x, v in k.items(): u[x] = v
            return u
        pr = r(prognose=[0, 486000] + [486000] * 10, prognoseKas=[0, 0] + [486000] * 10, gefactureerd=[0, 486000, 486000] + [0] * 9, ontvangen=[0, 0, 486000] + [0] * 9, prognoseToen=[0, 0, 450000] + [0] * 9)
        proj = {'id': 't1', 'traject': 'Onderwijsondersteuning', 'schooljaar': sj, 'status': 'bezig', 'am': 'Menno', 'adviseur': '', 'soortFacturatie': 'achteraf', 'bron': 'termijnen', 'reeksen': pr, 'contract': 5346000, 'ongepland': 0,
                'gefactureerd': 972000, 'ontvangen': 486000, 'nogTeFactureren': 4374000, 'openstaand': 486000, 'ouderdom': {'0-30': 486000, '31-60': 0, '60+': 0}, 'signalen': ['€ 4.860 van het contract staat nog niet in termijnen'], 'geschat': False, 'gemBetaaltijd': 21}
        school = dict({k: proj[k] for k in ['contract', 'gefactureerd', 'ontvangen', 'nogTeFactureren', 'openstaand', 'ouderdom', 'geschat', 'gemBetaaltijd']}, schoolId='s1', naam='Testschool Noord', betaaltermijn=30, reeksen=pr, projecten=[proj])
        return {'schooljaar': sj, 'schooljaren': ['2026-2027', '2025-2026'], 'maanden': maanden, 'huidigeMaand': maanden[2], 'scholen': [school], 'reeksen': pr,
                'totalen': dict({k: proj[k] for k in ['contract', 'gefactureerd', 'ontvangen', 'nogTeFactureren', 'openstaand', 'ouderdom', 'gemBetaaltijd']}), 'geschat': False, 'standaardBetaaltermijn': 30,
                'laatsteBevriezing': BEVRIEZING['maand'] or maanden[1], 'exactKolommen': {'factuurnummer': 'Factuurnummer', 'datum': 'Factuurdatum', 'bedrag': 'Bedrag', 'betaald': 'Betaaldatum'}, 'magImporteren': beheer(), 'ik': ik()}
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
        od = args[0].get('overdracht') if wissel and o['fase'] == 'gewonnen' else None  # v6.4: winformulier
        if od is not None and (not od.get('startdatum') or int(od.get('aantal') or 0) < 1): raise ValueError('Vul het aantal ondersteuners en de gewenste startdatum in.')
        if wissel and k['fase'] == 'gewonnen' and not any(t.get('kansId') == k['id'] for t in TRAJECTEN):  # v3.8: altijd een project
            traject = {'id': 'p' + uuid.uuid4().hex[:5], 'schoolId': k['schoolId'], 'school': k['school'], 'plaats': '', 'traject': k['naam'], 'schooljaar': '2026-2027', 'start': '', 'eind': '', 'status': 'opstart', 'ondersteuners': 0, 'urenPerWeek': 0, 'tarief': 0, 'omzet': k['waarde'], 'contactpersoon': '', 'am': k.get('am', ''), 'adviseur': k['eigenaar'], 'kansId': k['id'], 'samenvatting': '', 'bijgewerkt': nu(),
                       'soortFacturatie': '', 'gefactureerd': '', 'factuurDatum': '', 'vakanties': '', 'bijzonderheden': '', 'factuurnummer': ''}
            if od:  # v6.4: taskforce vooringevuld, conceptvacature voor het talentteam
                traject['start'] = od['startdatum']; traject['taskforce'] = {'inzet': str(od['aantal']) + ' × ' + (od.get('rol') or 'Onderwijsondersteuner'), 'rooster': od.get('rooster', ''), 'startdatum': od['startdatum'], 'bijzonderheden': od.get('bijzonderheden', ''), 'door': k['eigenaar'], 'bron': 'winformulier'}
                VACATURES.append({'id': 'v' + uuid.uuid4().hex[:5], 'trajectId': traject['id'], 'titel': od.get('rol') or 'Onderwijsondersteuner', 'aantal': int(od['aantal']), 'dagen': od.get('rooster', ''), 'urenPerWeek': '', 'start': od['startdatum'], 'eind': '', 'profiel': od.get('bijzonderheden', ''), 'status': 'concept', 'door': k['eigenaar'], 'aangemaakt': nu()})
            meld('Lotte', 'Nieuw project: ' + k['naam'] + '. De conceptvacature staat op het bord Bezetting.', 'project:' + traject['id'])
            TRAJECTEN.insert(0, traject)
            ACTIVITEITEN.append({'id': 'e' + uuid.uuid4().hex[:5], 'type': 'notitie', 'datum': nu(), 'door': k['eigenaar'], 'schoolId': k['schoolId'], 'persoonId': k.get('persoonId', ''), 'kansId': k['id'], 'trajectId': traject['id'], 'onderwerp': 'Overdracht naar ' + (k.get('am') or 'de accountmanager'), 'tekst': 'Kans gewonnen.', 'duurMin': 0, 'bron': 'app'})
            TAKEN.append({'id': 'tk' + uuid.uuid4().hex[:5], 'tekst': 'Startgesprek plannen', 'bron': 'project', 'prio': 'hoog', 'deadline': d(3), 'link': '', 'over': -3, 'categorie': 'afspraak', 'eigenaar': k.get('am') or 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': k['schoolId'], 'persoonId': '', 'kansId': k['id'], 'trajectId': traject['id']})
        return {'kans': kans_uit(k), 'traject': traject}
    if fn == 'apiActiviteitToevoegen':
        o = dict(args[0])
        if o.get('vorm') in TYPE_VAN_VORM: o['type'] = TYPE_VAN_VORM[o['vorm']]  # v7.1
        o.update({'id': 'e' + uuid.uuid4().hex[:5], 'door': 'Menno', 'bron': 'app', 'datum': (o.get('datum') or nu()).replace('T', ' '), 'duurMin': int(float(o.get('duurMin') or 0))})
        for k in ('schoolId', 'persoonId', 'kansId'): o.setdefault(k, '')
        if not o['schoolId'] and o['persoonId']: o['schoolId'] = per_id(PERSONEN)[o['persoonId']]['schoolId']
        if not o['schoolId'] and o['kansId']: o['schoolId'] = per_id(CRMKANSEN)[o['kansId']]['schoolId']
        o.setdefault('onderwerp', ''); ACTIVITEITEN.append(o); return act_uit(o)
    if fn == 'apiAfspraakPlannen':
        o = dict(args[0]); a = {'id': 'e' + uuid.uuid4().hex[:5], 'type': 'afspraak', 'datum': o['start'].replace('T', ' '), 'door': 'Menno', 'schoolId': o.get('schoolId', ''), 'persoonId': o.get('persoonId', ''), 'kansId': o.get('kansId', ''), 'onderwerp': o['titel'], 'tekst': o.get('notitie', ''), 'duurMin': int(float(o.get('duurMin') or 60)), 'bron': 'app'}
        ACTIVITEITEN.append(a); return act_uit(a)
    if fn == 'apiPipeline' and not beheer(): geen_toegang()
    if fn == 'apiPipeline': return {'mijlpalen': MIJLPALEN, 'pipelines': ['Scholen'], 'kansen': [kans_uit(k) for k in CRMKANSEN], 'verliesRedenen': ['Te duur']}
    if fn == 'apiTaken': return {'taken': [taak_uit(t) for t in TAKEN], 'categorieen': basis()['categorieen'], 'gebruikers': GEBRUIKERS_NAMEN, 'tracks': TRACKS,
                                 'tags': sorted({x for t in TAKEN for x in tags_lijst(t.get('tags'))}), 'weergaven': WEERGAVEN.get(HUIDIG[0], []), 'herinneringen': HERINNERINGEN.get(HUIDIG[0], True)}  # v4.6
    if fn == 'apiTaakOpslaan':
        o = dict(args[0]); o.pop('_oud', None); o.pop('snel', None)
        if o.get('herhaling') == '': o['herhaling'] = None  # v4.5
        if 'tags' in o: o['tags'] = tags_lijst(o['tags'])  # v4.6
        if not o.get('id'): o.update({'bron': o.get('bron') or 'crm', 'status': 'open', 'link': '', 'over': None, 'afgerond': ''}); [o.setdefault(k, '') for k in ['schoolId', 'persoonId', 'kansId', 'trajectId', 'deadline', 'tijd', 'categorie', 'notitie', 'eigenaar', 'ouderId']]; o.setdefault('herhaling', None); o.setdefault('tags', [])
        return taak_uit(opslaan(TAKEN, o, 'tk'))
    if fn == 'apiTaakWeergavenOpslaan': WEERGAVEN[HUIDIG[0]] = list(args[0]); return WEERGAVEN[HUIDIG[0]]  # v4.6
    if fn == 'apiHerinneringenZetten': HERINNERINGEN[HUIDIG[0]] = bool(args[0]); return {'aan': bool(args[0])}  # v4.6
    if fn == 'apiTaak': return taak_uit(per_id(TAKEN)[args[0]])  # v4.5
    if fn == 'apiTaakHeropen':  # v3.7
        t = per_id(TAKEN)[args[0]]; t.update({'status': 'open', 'afgerond': '', 'herhaling': None}); return taak_uit(t)
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
        if o.get('vorm') in TYPE_VAN_VORM: o['type'] = TYPE_VAN_VORM[o['vorm']]  # v7.1
        a = per_id(ACTIVITEITEN)[o['id']]; a.update(o); return dict(act_uit(a), agendaBijgewerkt=bool(a.get('agenda')))
    if fn == 'apiInstellingen': return dict(INSTELLINGEN, schooljaar=INSTELLINGEN.get('schooljaarHandmatig') or '2026-2027', schooljaarOpDatum='2026-2027', schooljaarHandmatig=INSTELLINGEN.get('schooljaarHandmatig', ''),
                                            verlenging=KEUZES['verlenging'], kandidaatBronnen=['talentbestand', 'XPS-bestand', 'LinkedIn', 'eigen netwerk', 'sollicitatie', 'anders'],
                                            talentFuncties=TALENT_KEUZES['functies'], sectoren=TALENT_KEUZES['sectoren'], vakken=TALENT_KEUZES['vakken'], documentSoorten=TALENT_KEUZES['documentSoorten'], contractvormen=TALENT_KEUZES['contractvormen'], beoordelingsCriteria=TALENT_KEUZES['criteria'], talentBronnen=TALENT_KEUZES['bronnen'])  # v5.0
    if fn == 'apiSchooljaarOpslaan': INSTELLINGEN['schooljaarHandmatig'] = args[0]; return {'schooljaar': args[0] or '2026-2027'}  # v4.1
    if fn == 'apiMeldingen': return sorted([m for m in MELDINGEN if m['voor'] == ik()['naam']], key=lambda m: m['datum'], reverse=True)
    if fn == 'apiMeldingenGelezen':
        n = 0
        for m in MELDINGEN:
            if m['voor'] == ik()['naam'] and not m['gelezen']: m['gelezen'] = nu(); n += 1
        return {'aantal': n}
    if fn == 'apiBezetting':
        tm = per_id(TRAJECTEN); l = []
        for v in VACATURES:
            t = tm[v['trajectId']]
            if not (beheer() or ik()['team'] == 'talent' or t['am'] == ik()['naam']): continue
            u = vac_uit(v); u['project'] = {'id': t['id'], 'school': t['school'], 'traject': t['traject'], 'schooljaar': t['schooljaar'], 'status': t['status'], 'am': t['am'], 'adviseur': t.get('adviseur', ''), 'start': t['start'], 'talentscout': t.get('talentscout', '')}  # v6.4
            u['magWijzigen'] = True; u['magKandidaten'] = True; u['magBevestigen'] = ik()['team'] != 'talent'; l.append(u)  # v6.4.2
        tel = {'openVacatures': len([v for v in l if v['status'] == 'open']), 'openPlekken': sum(max(0, v['aantal'] - v['gevuld']) for v in l if v['status'] == 'open'), 'inProces': sum(v['inProces'] for v in l), 'klaar': sum(v['gevuld'] for v in l), 'concept': len([v for v in l if v['status'] == 'concept'])}  # v6.4
        return {'vacatures': l, 'tellingen': tel, 'keuzes': project_bezetting(TRAJECTEN[0])['keuzesBezetting'], 'ik': ik()}
    if fn == 'apiVacatureOpslaan':
        o = dict(args[0]); o.pop('_oud', None)
        if not o.get('id'): o.update({'status': 'open', 'door': ik()['naam'], 'aangemaakt': nu()}); o['aantal'] = int(o.get('aantal') or 1); [o.setdefault(k, '') for k in ['dagen', 'urenPerWeek', 'start', 'eind', 'profiel']]; meld('Lotte', 'Nieuwe vacature: ' + o.get('titel', ''), 'project:' + o['trajectId'])
        elif 'aantal' in o: o['aantal'] = int(o['aantal'] or 1)
        if o.get('id') and o.get('status') == 'open' and per_id(VACATURES)[o['id']]['status'] == 'concept':  # v6.4: bevestigen na de taskforce
            tb = per_id(TRAJECTEN)[per_id(VACATURES)[o['id']]['trajectId']]; meld(tb.get('talentscout') or 'Lotte', 'Vacature bevestigd: ' + per_id(VACATURES)[o['id']]['titel'], 'project:' + tb['id'])
        v = opslaan(VACATURES, o, 'v'); return project_bezetting(per_id(TRAJECTEN)[v['trajectId']])
    if fn == 'apiTalentscoutToewijzen':  # v6.4
        t = per_id(TRAJECTEN)[args[0]]
        if ik()['team'] == 'talent' and (t.get('talentscout') or args[1] != ik()['naam']): geen_toegang()
        t['talentscout'] = args[1]; meld(args[1], 'Je bent talentscout van ' + t['school'], 'project:' + t['id'])
        ACTIVITEITEN.append({'id': uuid.uuid4().hex[:6], 'type': 'taak', 'datum': nu(), 'door': ik()['naam'], 'schoolId': t['schoolId'], 'persoonId': '', 'kansId': '', 'trajectId': t['id'], 'onderwerp': 'Talentscout: ' + args[1], 'tekst': '', 'duurMin': 0, 'bron': 'overdracht'})
        return project_bezetting(t)
    if fn == 'apiTaskforcePlannen':  # v6.4
        t = per_id(TRAJECTEN)[args[0]]; o = args[1]; tf = dict(t.get('taskforce') or {}); tf['gepland'] = o['start'].replace('T', ' '); tf['datum'] = o['start'][:10]; t['taskforce'] = tf
        ACTIVITEITEN.append({'id': uuid.uuid4().hex[:6], 'type': 'afspraak', 'datum': tf['gepland'], 'door': ik()['naam'], 'schoolId': t['schoolId'], 'persoonId': '', 'kansId': '', 'trajectId': t['id'], 'onderwerp': 'Taskforce ' + t['school'], 'tekst': '', 'duurMin': int(o.get('duurMin') or 45), 'bron': 'app'})
        r = project_bezetting(t); r['zonderEmail'] = [] if t.get('talentscout') else []; return r
    if fn == 'apiKandidaatOpslaan':
        o = dict(args[0]); o.pop('_oud', None)
        tl = per_id(TALENTEN).get(o.get('talentId') or '')  # v5.0: uit het talentbestand → naam en contact van het profiel
        if tl and not o.get('id'): o.update({'naam': tl['naam'], 'email': tl['email'], 'telefoon': tl['telefoon'], 'xpsId': tl['xpsId'], 'bron': 'talentbestand'})
        if o.get('status') in VOORBIJ and not (o.get('eindReden') or per_id(KANDIDATEN).get(o.get('id') or '', {}).get('eindReden')): raise ValueError('Geef de reden waarom de inzet is ' + o['status'] + '.')
        if not o.get('id'): o.update({'status': o.get('status') or 'voorgesteld', 'door': ik()['naam'], 'statusSinds': nu()}); [o.setdefault(k, '') for k in ['email', 'telefoon', 'bron', 'xpsId', 'afasNummer', 'gesprek', 'notitie', 'talentId', 'functie', 'start', 'eind', 'urenPerWeek', 'dagen', 'eindReden']]
        if o.get('vacatureId') or not o.get('id'): o['trajectId'] = per_id(VACATURES)[o['vacatureId']]['trajectId']
        k = opslaan(KANDIDATEN, o, 'c'); t = per_id(TRAJECTEN)[k['trajectId']]
        if not args[0].get('id'): meld(t['am'], 'Nieuwe kandidaat: ' + k['naam'], 'project:' + t['id'])
        for v in VACATURES:
            u = vac_uit(v, False)
            if v['status'] == 'open' and u['gevuld'] >= v['aantal']: v['status'] = 'ingevuld'
        b = bezetting_van(t['id'])
        if t['status'] == 'opstart' and b['nodig'] and b['gevuld'] >= b['nodig']: t['status'] = 'bezig'
        return project_bezetting(t)
    if fn == 'apiTaskforceOpslaan':
        t = per_id(TRAJECTEN)[args[0]]; o = dict(args[1]); af = o.pop('afspraken', [])
        t['taskforce'] = dict(t.get('taskforce') or {}, **o, bijgewerkt=nu())
        for a in af: TAKEN.append({'id': 'tk' + uuid.uuid4().hex[:5], 'tekst': a['tekst'], 'bron': 'taskforce', 'prio': 'midden', 'deadline': a.get('deadline', ''), 'link': '', 'over': None, 'categorie': 'overig', 'eigenaar': a.get('eigenaar') or ik()['naam'], 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': t['schoolId'], 'persoonId': '', 'kansId': '', 'trajectId': t['id']})
        ACTIVITEITEN.append({'id': uuid.uuid4().hex[:6], 'type': 'notitie', 'datum': nu(), 'door': ik()['naam'], 'schoolId': t['schoolId'], 'persoonId': '', 'kansId': '', 'trajectId': t['id'], 'onderwerp': 'Taskforce', 'tekst': o.get('hulpvraag', ''), 'duurMin': 0, 'bron': 'app'})
        return project_bezetting(t)
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
    if fn == 'apiDoelen':  # v4.2: ook team- en bedrijfsdoelen
        eig = ([{'waarde': 'bedrijf', 'label': 'Bedrijf (iedereen)', 'team': 'bedrijf'}] if beheer() else []) + [y for t in TEAMLEDEN for y in [{'waarde': 'team:' + t, 'label': 'Team ' + t, 'team': t}] + [{'waarde': n, 'label': n, 'team': t} for n in TEAMLEDEN[t]]] if beheer() else []
        return {'doelen': DOELEN, 'metrics': [m['id'] for m in METR], 'metrieken': METR, 'periodes': ['week', 'maand', 'kwartaal', 'halfjaar', 'jaar', 'schooljaar'], 'gebruikers': GEBRUIKERS_NAMEN, 'eigenaren': eig,
                'teamNamen': {'consultancy': 'Team onderwijsconsultants', 'accountmanagement': 'Team accountmanagers', 'talent': 'Team talent'}, 'magZetten': beheer()}
    if fn == 'apiTeamRapport':  # v4.4: periode met stap, vergelijking, reeks en 'alle' teams voor het management
        echt = ['consultancy', 'accountmanagement', 'talent'] if beheer() else [ik()['team']] if ik()['team'] in TEAMLEDEN else []
        teams = (['alle'] + echt) if beheer() else echt
        team = args[1] if len(args) > 1 and args[1] in teams else (echt[0] if echt else ''); preset = args[0] or 'maand'
        stap = min(0, int(args[3] or 0)) if len(args) > 3 and args[3] not in (None, '') else 0
        labels = {'week': 'week 41', 'maand': 'oktober 2026', 'kwartaal': 'Q4 2026', 'halfjaar': 'tweede helft 2026', 'jaar': '2026', 'schooljaar': 'schooljaar 2026-2027'}
        n_reeks = {'week': 8, 'maand': 6, 'kwartaal': 4, 'halfjaar': 4, 'jaar': 3, 'schooljaar': 3}.get(preset, 6)
        def bundel(defs, schaal=1.0):
            cij = {m['id']: CIJFERS.get(m['id']) for m in defs}
            vor = {m['id']: (None if m.get('stand') or CIJFERS.get(m['id']) is None else round(CIJFERS[m['id']] * 0.8)) for m in defs}
            reeks = {m['id']: [None if CIJFERS.get(m['id']) is None else round(CIJFERS[m['id']] * schaal * (0.6 + 0.1 * i)) for i in range(n_reeks - 1)] + [cij[m['id']]] for m in defs if not m.get('stand')}
            return {'cijfers': cij, 'vorige': vor, 'reeks': reeks}
        uit = {'preset': preset, 'stap': stap, 'van': d(-20 + 30 * stap), 'tot': d(0 + 30 * stap), 'eind': d(10), 'lopend': stap == 0, 'label': labels.get(preset, '') + ('' if stap == 0 else ' (' + str(stap) + ')'),
               'vergelijk': {'van': d(-50 + 30 * stap), 'tot': d(-30 + 30 * stap), 'label': 'vorige periode', 'kort': 'vorige'}, 'reeksLabels': ['p' + str(i + 1) for i in range(n_reeks)],
               'team': team, 'teams': teams, 'metrieken': [], 'perPersoon': [], 'totaal': {'cijfers': {}, 'doelen': {}, 'vorige': {}, 'reeks': {}}, 'bedrijf': bedrijf(), 'ik': ik(), 'eigenaar': '', 'kiesbaar': []}
        if team == 'alle':
            uit['alle'] = [dict(team=t, metrieken=[m for m in METR if m['team'] == t], leden=len(TEAMLEDEN.get(t, [])), totaal=dict(bundel([m for m in METR if m['team'] == t]), doelen=doelen_van(preset, 'team:' + t))) for t in echt]
            return uit
        defs = [m for m in METR if m['team'] == team]
        leden = TEAMLEDEN.get(team, []) if beheer() else [ik()['naam']]
        if len(args) > 2 and args[2] in leden: leden = [args[2]]; uit['eigenaar'] = args[2]
        uit.update({'metrieken': defs, 'perPersoon': [dict(bundel(defs, 0.5), naam=n, doelen=doelen_van(preset, n)) for n in leden],
                    'totaal': dict(bundel(defs), doelen=doelen_van(preset, 'team:' + team)), 'kiesbaar': TEAMLEDEN.get(team, []) if beheer() else []})
        return uit
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
        return {'groet': 'Goedemorgen Menno', 'datum': 'dinsdag 22 september', 'ik': ik(), 'bedrijf': bedrijf(), 'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af'], 'afgerondWeek': len([t for t in TAKEN if t['status'] == 'af']), 'streak': 2,  # v4.6
                'kerncijfers': {'lopendeProjecten': 3, 'teFactureren': 12500, 'openVacatures': 2, 'teBezetten': 3},  # v7.1
                'agenda': [{'id': 'g1', 'sleutel': 'g1', 'titel': 'Gesprek teamleider Lyceum Demo', 'start': d(1) + ' 10:00', 'eind': d(1) + ' 11:00', 'heleDag': False, 'locatie': ''}, {'id': 'g2', 'sleutel': 'g2', 'titel': 'Teamoverleg', 'start': d(3) + ' 09:00', 'eind': d(3) + ' 10:00', 'heleDag': False, 'locatie': 'Kantoor'}], 'gekoppeld': True,
                'pipeline': {'open': len(open_), 'waarde': sum(k['waarde'] for k in open_), 'gewogen': sum(k['gewogen'] for k in open_), 'stil': [k for k in open_ if k['stil']]},
                'recent': [act_uit(a) for a in sorted(ACTIVITEITEN, key=lambda a: a['datum'], reverse=True) if a['datum'] <= nu()], 'mails': [{'onderwerp': 'Rooster periode 2', 'van': 'A. de Vries', 'dagen': 4, 'threadId': 'th1', 'link': 'https://mail.google.com/'}]}
    if fn == 'apiActiviteiten':  # v3.3
        door = args[0] if args else ''; l = [act_uit(a) for a in sorted(ACTIVITEITEN, key=lambda a: a['datum'], reverse=True) if (not door or a['door'] == door) and a['datum'] <= nu()]
        pt = {}
        pv = {}
        for a in l: pt[a['type']] = pt.get(a['type'], 0) + 1; pv[a['vorm']] = pv.get(a['vorm'], 0) + 1
        return {'door': door, 'totaal': len(l), 'perType': pt, 'perVorm': pv, 'tijdlijn': l}
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
        lijst = {'school': SCHOLEN, 'persoon': PERSONEN, 'kans': CRMKANSEN, 'taak': TAKEN, 'activiteit': ACTIVITEITEN, 'traject': TRAJECTEN, 'doel': DOELEN, 'content': CONTENT, 'factuur': FACTUREN, 'vacature': VACATURES, 'kandidaat': KANDIDATEN,
                 'talent': TALENTEN, 'beoordeling': BEOORDELINGEN, 'talentdocument': TALENTDOCS, 'talentschool': TALENTSCHOOL}.get(args[0])  # v5.0
        if lijst is None:  # notitie (Historie)
            for l in NOTITIES.values(): l[:] = [x for x in l if x['id'] != args[1]]
            return None
        if args[0] == 'taak':  # v4.6: subtaken mee verwijderen of losmaken
            opties = args[2] if len(args) > 2 and isinstance(args[2], dict) else {}
            if opties.get('metSubtaken'): TAKEN[:] = [t for t in TAKEN if t.get('ouderId') != args[1]]
            else:
                for t in TAKEN:
                    if t.get('ouderId') == args[1]: t['ouderId'] = ''
        lijst[:] = [x for x in lijst if x['id'] != args[1]]; return None
    r = handle_talent(fn, args)  # v5.0
    if r is not None: return r
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
        volgende, ouder_klaar = None, False
        for t in TAKEN:
            if t['id'] == args[0] and t['status'] != 'af':
                t['status'] = 'af'; t['afgerond'] = nu()
                if t.get('herhaling'): volgende = taak_uit(volgende_instantie(t))  # v4.5: de volgende instantie van een reeks
                for k in TAKEN:  # v4.6: open subtaken gaan mee af
                    if k.get('ouderId') == t['id'] and k['status'] != 'af': k['status'] = 'af'; k['afgerond'] = nu()
                if t.get('ouderId'): ouder_klaar = all(k['status'] == 'af' for k in TAKEN if k.get('ouderId') == t['ouderId'])  # v4.6
        ACTIES[:] = [a for a in ACTIES if a['id'] != args[0]]; return {'id': args[0], 'status': 'af', 'afgerond': nu(), 'volgende': volgende, 'ouderKlaar': ouder_klaar}
    if fn == 'apiActieToevoegen':  # v4.5: extra velden uit de snelinvoer; de taak komt ook in de takenlijst
        extra = args[3] if len(args) > 3 and isinstance(args[3], dict) else {}
        o = {'tekst': args[0], 'bron': 'handmatig', 'prio': args[1] or 'midden', 'deadline': args[2] if len(args) > 2 else ''}
        for k in ('tijd', 'herhaling', 'categorie', 'eigenaar', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'notitie'): o[k] = extra.get(k) or ('' if k != 'herhaling' else None)
        o['eigenaar'] = o['eigenaar'] or ik()['naam']
        t = handle_crm('apiTaakOpslaan', [o]); ACTIES.append(dict(t, over=None)); return t
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
        ts = [dict(t, updates=len([a for a in ACTIVITEITEN if a.get('trajectId') == t['id']]), magWijzigen=eigen_project(t) and ik()['team'] != 'talent', bezetting=bezetting_van(t['id'])) for t in TRAJECTEN if eigen_project(t)]  # v4.0
        return {'trajecten': ts, 'am': ['Joris', 'Mees', 'Menno'], 'ik': ik(), 'gebruikers': GEBRUIKERS_NAMEN, 'schooljaar': INSTELLINGEN.get('schooljaarHandmatig') or '2026-2027',
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
                'gebruiker': ik(), 'crmSyncTrigger': True, 'laatsteCrmSync': nu(), 'capsuleToken': True, 'capsuleMigratie': '',
                'herinneringTrigger': True, 'herinneringen': HERINNERINGEN.get(HUIDIG[0], True), 'email': 'menno@voorbeeld.nl',  # v4.6
                'talentTrigger': True, 'urenTrigger': True, 'xpsExportMap': True, 'laatsteUrenImport': d(-1) + ' 06:05'}  # v5.0
    if fn == 'apiImporteer': return {'ingevoegd': len(args[1]), 'bijgewerkt': 0}
    # v7.2: Financiën — prognose vastleggen en de Exact-afstemming, met de vorm van financienBevriezen en apiExactImport in Code.gs (de app leest al/maand resp. van, tot, gekoppeld, toegepast en de vier lijsten)
    if fn == 'apiFinancienBevriezen':
        if not beheer(): geen_toegang()
        al = BEVRIEZING['maand'] == FIN_MAAND; BEVRIEZING['maand'] = FIN_MAAND
        return {'maand': FIN_MAAND, 'rijen': 0 if al else 3, 'al': al}
    if fn == 'apiExactImport':
        if not beheer(): geen_toegang()
        if not str(args[0] if args else '').strip(): raise ValueError('Het bestand is leeg.')
        o = args[1] if len(args) > 1 and isinstance(args[1], dict) else {}
        return {'van': d(-30), 'tot': d(-1), 'gekoppeld': 2, 'toegepast': bool(o.get('toepassen')),
                'bijgewerkt': [{'nummer': 'F2026-001', 'waar': 'Lyceum Demo · termijn 1', 'wat': 'verzonden, betaald'}],
                'afwijkend': [], 'alleenAthena': [], 'alleenExact': [{'nummer': 'F9999', 'datum': d(-3), 'bedrag': 125000}]}
    return handle_crm(fn, args)

# v6.2: met MOCK_CSP=1 gaat de Content-Security-Policy uit vercel.json mee met de app (zoals Vercel die stuurt), met de nep-Supabase
# erbij in connect-src; de browsertests melden dan elke schending als console-fout. Niet op ?demo=1 (de demo draait Code.gs met eval).
MOCK_CSP = os.environ.get('MOCK_CSP') == '1'
def csp_waarde():
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'vercel.json')) as f: cfg = json.load(f)
        for h in cfg.get('headers', []):
            for kv in h.get('headers', []):
                if kv.get('key') == 'Content-Security-Policy': return kv['value'].replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:%d" % SUPA_POORT)
    except Exception: pass
    return ''
CSP = csp_waarde() if MOCK_CSP else ''

class H(SimpleHTTPRequestHandler):
    _csp = False
    def log_message(self, *a): pass
    def json(self, obj, status=200):
        data = json.dumps(obj).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):  # v6.0: de eigen server nagebootst (api/config, Supabase Auth); de rest zijn de bestanden van de repo
        p = urlparse(self.path); pad = p.path; qs = parse_qs(p.query)
        if pad == '/api/config':
            if not MOCK_GOOGLE: return self.json({'ok': False, 'fout': 'geen inlogconfiguratie'}, 404)
            return self.json({'ok': True, 'inloggen': 'google', 'supabaseUrl': 'http://127.0.0.1:%d/supa' % SUPA_POORT, 'anonKey': 'anon-test', 'versie': '6.0'})
        if pad == '/api': return self.json({'ok': True, 'app': 'Athena Assistent (mock)', 'versie': '6.0'})
        if pad == '/supa/auth/v1/authorize':
            terug = (qs.get('redirect_to') or ['/'])[0]
            self.send_response(302); self.send_header('Location', terug + '#access_token=testtoken-menno&expires_in=3600&expires_at=%d&refresh_token=refresh-1&token_type=bearer' % (int(time.time()) + 3600)); self.end_headers(); return
        self._csp = bool(CSP) and pad in ('/', '/index.html') and 'demo' not in qs  # v6.2
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); ruw = self.rfile.read(n) or b'{}'
        if self.path.startswith('/supa/auth/v1/token'): return self.json({'access_token': 'testtoken-menno-vers', 'refresh_token': 'refresh-2', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer'})  # v6.0: token vernieuwen
        if self.path.startswith('/supa/auth/v1/logout'): self.send_response(204); self.end_headers(); return
        body = json.loads(ruw)
        if body.get('portaal'): out = handle_portaal(str(body['portaal']), body.get('fn'), body.get('args') or [])  # v5.0: het portaal kent geen koppelcode
        else:
            code = TOKENS.get(body['token']) if body.get('token') else body.get('secret')  # v6.0: een sessietoken van de eigen server, of de koppelcode
            if code not in IKKEN: out = {'ok': False, 'fout': 'secret'}
            else:
                HUIDIG[0] = code
                try: out = {'ok': True, 'result': handle(body.get('fn'), body.get('args') or [])}
                except Exception as e: out = {'ok': False, 'fout': str(e)}
        self.json(out)
    def do_OPTIONS(self):  # v6.0: de preflight van het tokenverzoek naar "Supabase" (andere origin, JSON-header)
        self.send_response(204); self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization'); self.end_headers()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); self.send_header('Access-Control-Allow-Origin', '*')
        if self._csp: self.send_header('Content-Security-Policy', CSP); self._csp = False  # v6.2
        super().end_headers()

_maak = partial(H, directory=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if MOCK_GOOGLE:
    import threading
    threading.Thread(target=ThreadingHTTPServer(('127.0.0.1', SUPA_POORT), _maak).serve_forever, daemon=True).start()
ThreadingHTTPServer(('127.0.0.1', POORT), _maak).serve_forever()
