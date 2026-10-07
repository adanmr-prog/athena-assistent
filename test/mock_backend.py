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
    {'id': 't1', 'school': 'Voorbeeldcollege Zuid', 'plaats': 'Rotterdam', 'traject': 'Onderwijsondersteuning', 'schooljaar': '2026-2027', 'start': '2026-09-01', 'eind': '2027-05-31', 'status': 'actief', 'ondersteuners': 2, 'urenPerWeek': 30, 'tarief': 48.5, 'omzet': 40740, 'contactpersoon': 'A. de Vries', 'am': 'Menno', 'samenvatting': 'Lesopvang bij verlof, huiswerklokaal en klassenassistentie.', 'bijgewerkt': nu()},
    {'id': 't2', 'school': 'Lyceum Demo', 'plaats': 'Den Haag', 'traject': 'Huiswerkbegeleiding', 'schooljaar': '2026-2027', 'start': '2026-09-07', 'eind': '2027-06-30', 'status': 'actief', 'ondersteuners': 1, 'urenPerWeek': 8, 'tarief': 42, 'omzet': 12000, 'contactpersoon': 'B. Jansen', 'am': 'Menno', 'samenvatting': '', 'bijgewerkt': nu()},
    {'id': 't3', 'school': 'Montessori Demo', 'plaats': 'Utrecht', 'traject': 'Studentdocent', 'schooljaar': '2026-2027', 'start': '2026-08-24', 'eind': '2026-12-20', 'status': 'actief', 'ondersteuners': 1, 'urenPerWeek': 16, 'tarief': 45, 'omzet': 11520, 'contactpersoon': 'D. Visser', 'am': 'Mees', 'samenvatting': 'Duits, onderbouw.', 'bijgewerkt': nu()},
    {'id': 't4', 'school': 'ISK Voorbeeld', 'plaats': 'Delft', 'traject': 'NT2-ondersteuning', 'schooljaar': '2026-2027', 'start': '2026-11-02', 'eind': '2027-04-30', 'status': 'offerte', 'ondersteuners': 1, 'urenPerWeek': 16, 'tarief': 47, 'omzet': 15040, 'contactpersoon': 'C. Bakker', 'am': 'Menno', 'samenvatting': '', 'bijgewerkt': nu()},
    {'id': 't5', 'school': 'Voorbeeldcollege Zuid', 'plaats': 'Rotterdam', 'traject': 'Examentraining', 'schooljaar': '2025-2026', 'start': '2026-03-01', 'eind': '2026-05-15', 'status': 'afgerond', 'ondersteuners': 3, 'urenPerWeek': 12, 'tarief': 46, 'omzet': 8280, 'contactpersoon': 'A. de Vries', 'am': 'Menno', 'samenvatting': 'Wiskunde A en Nederlands, 42 leerlingen.', 'bijgewerkt': '2026-05-20 10:00'},
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
def act_uit(a):
    s, p, k = per_id(SCHOLEN).get(a.get('schoolId')), per_id(PERSONEN).get(a.get('persoonId')), per_id(CRMKANSEN).get(a.get('kansId'))
    return dict(a, school=s['naam'] if s else '', persoon=(p['voornaam'] + ' ' + p['achternaam']) if p else '', kans=k['naam'] if k else '', gepland=a['datum'] > nu())
def persoon_uit(p):
    s = per_id(SCHOLEN).get(p.get('schoolId')); return dict(p, naam=(p.get('voornaam', '') + ' ' + p.get('achternaam', '')).strip() or p.get('email', ''), school=s['naam'] if s else '')
def kans_uit(k):
    k = dict(k); k['gewogen'] = round((k.get('waarde') or 0) * (k.get('kans') or 0) / 100)
    m = [x for x in MIJLPALEN if x['mijlpaal'] == k['fase']]; k['stil'] = k['fase'] not in ('gewonnen', 'verloren') and k.get('dagenStil') is not None and k['dagenStil'] > (m[0]['dagenNorm'] if m else 7)
    return k
def taak_uit(t):
    s, p, k = per_id(SCHOLEN).get(t.get('schoolId')), per_id(PERSONEN).get(t.get('persoonId')), per_id(CRMKANSEN).get(t.get('kansId'))
    return dict(t, school=s['naam'] if s else '', persoon=persoon_uit(p)['naam'] if p else '', kans=k['naam'] if k else '')
def basis():
    scholen = []
    for s in SCHOLEN:
        open_ = [k for k in CRMKANSEN if k['schoolId'] == s['id'] and k['fase'] not in ('gewonnen', 'verloren')]
        scholen.append(dict(s, personen=len([p for p in PERSONEN if p['schoolId'] == s['id']]), openKansen=len(open_), openWaarde=sum(k['waarde'] for k in open_)))
    return {'ik': {'naam': 'Menno', 'rol': 'beheerder'}, 'gebruikers': GEBRUIKERS_NAMEN, 'statussen': ['lead', 'prospect', 'klant', 'oud-klant'], 'mijlpalen': MIJLPALEN,
            'categorieen': ['bellen', 'mailen', 'afspraak', 'voorstel', 'opvolgen', 'overig'], 'activiteitTypes': ['notitie', 'gesprek', 'mail', 'afspraak'], 'tracks': TRACKS,
            'tags': sorted({t for s in SCHOLEN for t in s['tags']}), 'scholen': scholen, 'personen': [persoon_uit(p) for p in PERSONEN]}
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
        return {'school': s, 'personen': [persoon_uit(p) for p in ps], 'kansen': [kans_uit(k) for k in ks], 'trajecten': [t for t in TRAJECTEN if t['school'] == s['naam']],
                'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af' and (t['schoolId'] == s['id'] or t['persoonId'] in pids or t['kansId'] in kids)],
                'tijdlijn': tijdlijn(lambda a: a['schoolId'] == s['id'] or a['persoonId'] in pids), 'documenten': [x for x in DOCS if x['school'] == s['naam']]}
    if fn == 'apiPersoon':
        p = per_id(PERSONEN)[args[0]]; s = per_id(SCHOLEN).get(p['schoolId'])
        return {'persoon': persoon_uit(p), 'school': {'id': s['id'], 'naam': s['naam'], 'plaats': s['plaats']} if s else None, 'kansen': [kans_uit(k) for k in CRMKANSEN if k['persoonId'] == p['id']],
                'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af' and t['persoonId'] == p['id']], 'tijdlijn': tijdlijn(lambda a: a['persoonId'] == p['id'])}
    if fn == 'apiKans':
        k = per_id(CRMKANSEN)[args[0]]; s = per_id(SCHOLEN).get(k['schoolId']); p = per_id(PERSONEN).get(k['persoonId'])
        return {'kans': kans_uit(k), 'mijlpalen': MIJLPALEN, 'school': {'id': s['id'], 'naam': s['naam'], 'plaats': s['plaats']} if s else None, 'persoon': {'id': p['id'], 'naam': persoon_uit(p)['naam'], 'email': p['email']} if p else None,
                'personen': [{'id': x['id'], 'naam': persoon_uit(x)['naam']} for x in PERSONEN if s and x['schoolId'] == s['id']],
                'taken': [taak_uit(t) for t in TAKEN if t['status'] != 'af' and t['kansId'] == k['id']], 'tijdlijn': tijdlijn(lambda a: a['kansId'] == k['id'])}
    if fn == 'apiSchoolOpslaan':
        o = dict(args[0]); o['tags'] = [t.strip().lower() for t in str(o.get('tags', '')).split(',') if t.strip()] if isinstance(o.get('tags'), str) else o.get('tags', [])
        o.setdefault('velden', {}); new = not o.get('id')
        if new: o.update({'status': o.get('status') or 'lead', 'aangemaakt': nu(), 'laatsteContact': ''}); [o.setdefault(k, '') for k in ['plaats', 'type', 'bestuur', 'adres', 'website', 'leerlingen', 'telefoon', 'email', 'notities', 'eigenaar']]
        return opslaan(SCHOLEN, o, 's')
    if fn == 'apiPersoonOpslaan':
        o = dict(args[0]); o['tags'] = [t.strip() for t in str(o.get('tags', '')).split(',') if t.strip()] if isinstance(o.get('tags'), str) else o.get('tags', [])
        if not o.get('id'): [o.setdefault(k, '') for k in ['voornaam', 'achternaam', 'functie', 'schoolId', 'email', 'telefoon', 'linkedin', 'eigenaar', 'laatsteContact']]; o['aangemaakt'] = nu()
        return persoon_uit(opslaan(PERSONEN, o, 'p'))
    if fn == 'apiKansOpslaan':
        o = dict(args[0]); maak = len(args) > 1 and args[1]; oud = per_id(CRMKANSEN).get(o.get('id'))
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
        if wissel and k['fase'] == 'gewonnen' and maak:
            traject = {'id': uuid.uuid4().hex[:6], 'school': k['school'], 'plaats': '', 'traject': k['naam'], 'schooljaar': '2026-2027', 'start': '', 'eind': '', 'status': 'actief', 'ondersteuners': 0, 'urenPerWeek': 0, 'tarief': 0, 'omzet': k['waarde'], 'contactpersoon': '', 'am': k['eigenaar'], 'samenvatting': 'Uit gewonnen kans.', 'bijgewerkt': nu()}
            TRAJECTEN.insert(0, traject)
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
    if fn == 'apiPipeline': return {'mijlpalen': MIJLPALEN, 'pipelines': ['Scholen'], 'kansen': [kans_uit(k) for k in CRMKANSEN], 'verliesRedenen': ['Te duur']}
    if fn == 'apiTaken': return {'taken': [taak_uit(t) for t in TAKEN], 'categorieen': basis()['categorieen'], 'gebruikers': GEBRUIKERS_NAMEN, 'tracks': TRACKS}
    if fn == 'apiTaakOpslaan':
        o = dict(args[0]); o.update({'bron': 'crm', 'status': 'open', 'link': '', 'over': None, 'afgerond': ''}); [o.setdefault(k, '') for k in ['schoolId', 'persoonId', 'kansId', 'deadline', 'categorie', 'notitie']]
        return taak_uit(opslaan(TAKEN, o, 'tk'))
    if fn == 'apiTrackStart':
        t = per_id(TRACKS)[args[0]]; kop = args[1]
        for st in t['stappen']: TAKEN.append({'id': 'tk' + uuid.uuid4().hex[:5], 'tekst': st['tekst'], 'bron': 'track', 'prio': st['prio'], 'deadline': (datetime.date.fromisoformat(args[2]) + datetime.timedelta(days=st['dagenNaStart'])).isoformat(), 'link': '', 'over': None, 'categorie': st['categorie'], 'eigenaar': args[3] if len(args) > 3 else 'Menno', 'status': 'open', 'afgerond': '', 'notitie': '', 'schoolId': kop.get('schoolId', ''), 'persoonId': kop.get('persoonId', ''), 'kansId': kop.get('kansId', '')})
        return {'aantal': len(t['stappen']), 'track': t['naam']}
    if fn == 'apiTrackOpslaan': return TRACKS
    if fn == 'apiRapport':
        c = {'gesprekken': 4, 'mails': 11, 'afspraken': 2, 'notities': 3, 'nieuweKansen': 2, 'voorstellen': 1, 'gewonnen': 1, 'gewonnenWaarde': 12000, 'verloren': 1, 'takenAf': 6}
        c2 = {'gesprekken': 6, 'mails': 7, 'afspraken': 3, 'notities': 1, 'nieuweKansen': 1, 'voorstellen': 0, 'gewonnen': 0, 'gewonnenWaarde': 0, 'verloren': 0, 'takenAf': 4}
        team = {k: c[k] + c2[k] for k in c}
        return {'preset': args[0] or 'week', 'van': d(-2), 'tot': d(0), 'eigenaar': args[1] if len(args) > 1 else '', 'gebruikers': GEBRUIKERS_NAMEN, 'ik': {'naam': 'Menno', 'rol': 'beheerder'}, 'team': team,
                'perPersoon': [{'naam': 'Menno', 'cijfers': c, 'doelen': {}}, {'naam': 'Mees', 'cijfers': c2, 'doelen': {'gesprekken': 8}}], 'totaal': {'open': 3, 'waarde': 30040, 'gewogen': 10370},
                'forecast': [{'maand': d(30)[:7], 'waarde': 15040, 'gewogen': 7520, 'aantal': 1}, {'maand': d(60)[:7], 'waarde': 9000, 'gewogen': 2250, 'aantal': 1}, {'maand': 'zonder datum', 'waarde': 6000, 'gewogen': 600, 'aantal': 1}],
                'trechter': [{'mijlpaal': m['mijlpaal'], 'pipeline': 'Scholen', 'aantal': len([k for k in CRMKANSEN if k['fase'] == m['mijlpaal']]), 'waarde': sum(k['waarde'] for k in CRMKANSEN if k['fase'] == m['mijlpaal']), 'gewogen': sum(kans_uit(k)['gewogen'] for k in CRMKANSEN if k['fase'] == m['mijlpaal'])} for m in MIJLPALEN],
                'winst': {'gewonnen': 1, 'gewonnenWaarde': 12000, 'verloren': 1, 'verlorenWaarde': 4000, 'ratio': 50}, 'redenen': [{'reden': 'Te duur', 'aantal': 1}], 'stil': [kans_uit(k) for k in CRMKANSEN if kans_uit(k)['stil']]}
    if fn == 'apiDoelen': return {'doelen': DOELEN, 'metrics': ['gesprekken', 'mails', 'afspraken', 'nieuweKansen', 'voorstellen', 'gewonnen', 'gewonnenWaarde'], 'periodes': ['week', 'maand', 'kwartaal'], 'gebruikers': GEBRUIKERS_NAMEN}
    if fn == 'apiDoelOpslaan':
        o = args[0]; DOELEN[:] = [x for x in DOELEN if x['id'] != o['eigenaar'] + o['periode'] + o['metric']] + [dict(o, id=o['eigenaar'] + o['periode'] + o['metric'], doel=float(o.get('doel') or 0))]; return handle_crm('apiDoelen', [])
    if fn == 'apiMijlpalenOpslaan':
        MIJLPALEN[:] = [{'pipeline': m.get('pipeline') or 'Scholen', 'mijlpaal': m['mijlpaal'].lower(), 'volgorde': i + 1, 'kans': m['kans'], 'dagenNorm': m['dagenNorm']} for i, m in enumerate(args[0])]; return MIJLPALEN
    if fn == 'apiGebruikers': return {'gebruikers': GEBRUIKERS}
    if fn == 'apiGebruikerOpslaan':
        o = dict(args[0]); g = opslaan(GEBRUIKERS, dict(o, rol=o.get('rol') or 'am', actief=o.get('actief', 'ja') != 'nee', heeftCode=True), 'g')
        if g['naam'] not in GEBRUIKERS_NAMEN: GEBRUIKERS_NAMEN.append(g['naam'])
        return {'gebruiker': g, 'code': 'am' + uuid.uuid4().hex[:12] if (not o.get('id') or (len(args) > 1 and args[1])) else ''}
    if fn == 'apiCrmSync': return {'mails': 3, 'afspraken': 1, 'bijgewerkt': 0}
    if fn == 'apiCrmInrichten': return {'personen': 0, 'kansen': 0, 'trajecten': 0, 'notities': 1, 'eigenaren': 0}
    if fn == 'apiCapsuleMigratie':
        stappen = ['mijlpalen', 'partijen', 'kansen', 'projecten', 'taken', 'historie']; i = stappen.index(args[0])
        return {'stap': args[0], 'aantal': 3, 'volgende': {'stap': stappen[i + 1], 'pagina': 1} if i + 1 < len(stappen) else None}
    if fn == 'apiExport': return {'bestandsnaam': 'athena-' + args[0] + '.csv', 'csv': 'id,naam\ns1,Voorbeeldcollege Zuid'}
    if fn == 'apiVerwijder':
        lijst = {'school': SCHOLEN, 'persoon': PERSONEN, 'kans': CRMKANSEN, 'taak': TAKEN}[args[0]]; lijst[:] = [x for x in lijst if x['id'] != args[1]]; return None
    raise ValueError('onbekende functie ' + fn)

def handle(fn, args):
    if fn == 'apiOverzicht':
        open_ = [a for a in ACTIES]
        return {'datum': 'dinsdag 22 september', 'groet': 'Goedemorgen Menno', 'kpi': {'trajecten': 3, 'kansen': 2, 'scholen': 3, 'omzet': 64260, 'schooljaar': '2026-2027', 'pijplijn': 24040},
                'focus': open_[:3], 'aandacht': open_[3:], 'mails': [{'onderwerp': 'Rooster periode 2', 'van': 'A. de Vries', 'dagen': 4, 'link': 'https://mail.google.com/'}, {'onderwerp': 'Factuur september', 'van': 'Administratie Lyceum Demo', 'dagen': 2, 'link': 'https://mail.google.com/'}],
                'agenda': [{'tijd': '10:00', 'titel': 'Gesprek teamleider Lyceum Demo', 'duurMin': 60}, {'tijd': '14:30', 'titel': 'Intake ondersteuner', 'duurMin': 45}], 'kansen': [kans_uit(k) for k in CRMKANSEN if k['fase'] not in ('gewonnen', 'verloren')], 'tellingScholen': 4}
    if fn == 'apiActieKlaar':
        for t in TAKEN:
            if t['id'] == args[0]: t['status'] = 'af'; t['afgerond'] = nu()
        ACTIES[:] = [a for a in ACTIES if a['id'] != args[0]]; return None
    if fn == 'apiActieToevoegen':
        a = {'id': uuid.uuid4().hex[:6], 'tekst': args[0], 'bron': 'handmatig', 'prio': args[1] or 'midden', 'deadline': args[2] if len(args) > 2 else '', 'link': '', 'over': None}; ACTIES.append(a); return a
    if fn == 'apiKennisbank':
        t = {k: 0 for k in ['contract', 'werkwijze', 'schooldossier', 'voorstel', 'prijslijst', 'overig']}
        for x in DOCS: t[x['type']] += 1
        return {'tellingen': t, 'documenten': DOCS, 'laatsteIndex': d(0) + ' 04:01', 'mapUrl': 'https://drive.google.com/'}
    if fn == 'apiIndexeer': return {'aantal': 6, 'nieuw': 0, 'bijgewerkt': 1, 'verwijderd': 0}
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
                'types': [{'id': 'linkedin', 'naam': 'LinkedIn-post'}, {'id': 'mail', 'naam': 'E-mail aan een school'}, {'id': 'nieuwsbrief', 'naam': 'Nieuwsbriefitem'}, {'id': 'vacature', 'naam': 'Vacaturetekst'}, {'id': 'voorstel', 'naam': 'Intro voor een samenwerkingsvoorstel'}], 'recent': CONTENT}
    if fn == 'apiZetHuisstijl':
        HUIS[args[0]] = args[1]; return None
    if fn == 'apiMaakContent':
        c = {'id': uuid.uuid4().hex[:6], 'datum': nu(), 'type': args[0], 'typeNaam': {'linkedin': 'LinkedIn-post', 'mail': 'E-mail aan een school'}.get(args[0], args[0]), 'onderwerp': args[1], 'tekst': 'Onderwerp: ' + args[1] + '\n\nBeste [naam],\n\nDit is een voorbeeldtekst uit de mock-backend, in de toon van AthenaSchool.\n\nMet vriendelijke groet,\nMenno Adan\nAthenaSchool'}
        CONTENT.insert(0, c); return c
    if fn == 'apiTrajecten':
        return {'trajecten': TRAJECTEN, 'filters': {'schooljaren': ['2026-2027', '2025-2026'], 'trajecten': sorted({t['traject'] for t in TRAJECTEN}), 'statussen': ['offerte', 'actief', 'afgerond', 'gestopt']}}
    if fn == 'apiTraject':
        t = [x for x in TRAJECTEN if x['id'] == args[0]][0]
        return {'traject': t, 'documenten': [x for x in DOCS if x['school'] == t['school']], 'notities': NOTITIES.get(t['id'], []), 'kansen': [k for k in KANSEN if k['school'] == t['school']], 'school': {'naam': t['school'], 'plaats': t['plaats'], 'contactpersoon': t['contactpersoon'], 'email': 'contact@voorbeeld.nl', 'telefoon': '', 'status': 'klant', 'am': t['am']}}
    if fn == 'apiTrajectOpslaan':
        o = args[0]
        if o.get('id'):
            for t in TRAJECTEN:
                if t['id'] == o['id']: t.update(o); return t
        o = dict(o); o['id'] = uuid.uuid4().hex[:6]; o.setdefault('omzet', 0); o['bijgewerkt'] = nu(); TRAJECTEN.insert(0, o); return o
    if fn == 'apiNotitieToevoegen':
        n = {'id': uuid.uuid4().hex[:6], 'datum': nu(), 'tekst': args[1]}; NOTITIES.setdefault(args[0], []).insert(0, n); return n
    if fn == 'apiStatus':
        return {'versie': '2.0', 'sheetUrl': 'https://docs.google.com/', 'mapUrl': 'https://drive.google.com/', 'model': 'claude-opus-5', 'effort': 'medium', 'claudeIngesteld': True, 'driveApi': False, 'laatsteIndex': d(0) + ' 04:01', 'laatsteReview': d(0) + ' 05:02', 'rapportEmail': 'menno@voorbeeld.nl', 'reviewTrigger': True, 'indexTrigger': True, 'tijdzone': 'Europe/Amsterdam',
                'gebruiker': {'naam': 'Menno', 'rol': 'beheerder'}, 'crmSyncTrigger': True, 'laatsteCrmSync': nu(), 'capsuleToken': True, 'capsuleMigratie': ''}
    if fn == 'apiImporteer': return {'ingevoegd': len(args[1]), 'bijgewerkt': 0}
    return handle_crm(fn, args)

class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); body = json.loads(self.rfile.read(n) or b'{}')
        if body.get('secret') != SECRET: out = {'ok': False, 'fout': 'secret'}
        else:
            try: out = {'ok': True, 'result': handle(body.get('fn'), body.get('args') or [])}
            except Exception as e: out = {'ok': False, 'fout': str(e)}
        data = json.dumps(out).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()

ThreadingHTTPServer(('127.0.0.1', 8765), partial(H, directory=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))).serve_forever()
