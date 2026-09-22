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

def handle(fn, args):
    if fn == 'apiOverzicht':
        open_ = [a for a in ACTIES]
        return {'datum': 'dinsdag 22 september', 'groet': 'Goedemorgen Menno', 'kpi': {'trajecten': 3, 'kansen': 2, 'scholen': 3, 'omzet': 64260, 'schooljaar': '2026-2027', 'pijplijn': 24040},
                'focus': open_[:3], 'aandacht': open_[3:], 'mails': [{'onderwerp': 'Rooster periode 2', 'van': 'A. de Vries', 'dagen': 4, 'link': 'https://mail.google.com/'}, {'onderwerp': 'Factuur september', 'van': 'Administratie Lyceum Demo', 'dagen': 2, 'link': 'https://mail.google.com/'}],
                'agenda': [{'tijd': '10:00', 'titel': 'Gesprek teamleider Lyceum Demo', 'duurMin': 60}, {'tijd': '14:30', 'titel': 'Intake ondersteuner', 'duurMin': 45}], 'kansen': KANSEN, 'tellingScholen': 4}
    if fn == 'apiActieKlaar':
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
        return {'versie': '1.0', 'sheetUrl': 'https://docs.google.com/', 'mapUrl': 'https://drive.google.com/', 'model': 'claude-opus-5', 'effort': 'medium', 'claudeIngesteld': True, 'driveApi': False, 'laatsteIndex': d(0) + ' 04:01', 'laatsteReview': d(0) + ' 05:02', 'rapportEmail': 'menno@voorbeeld.nl', 'reviewTrigger': True, 'indexTrigger': True, 'tijdzone': 'Europe/Amsterdam'}
    if fn == 'apiImporteer': return {'ingevoegd': len(args[1]), 'bijgewerkt': 0}
    raise ValueError('onbekende functie ' + fn)

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
