# v6.6: taakmetingen in de demomodus (cognitive walkthrough als script). Per taak en schermbreedte: gelukt, aantal handelingen
# (tik, typ, kies), hoe vaak het doel eerst buiten beeld lag (scrollen) en de tijd. Zelfde taken voor en na een verbeterronde.
# Gebruik: python3 test/ux_taken.py [--label voor|na] → test/shots/ux/<label>/taken.json en een tabel op stdout.
# v7.3 (FL-7): eindigt met ALLES GOED (exitcode 0) als elke taak lukte zonder pageerror, anders FOUTEN: n (exitcode 1) met de mislukte regels.
import os, sys, json, time, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
arg = sys.argv[1:]
LABEL = arg[arg.index('--label') + 1] if '--label' in arg else 'nu'
OUT = os.path.join(ROOT, 'test', 'shots', 'ux', LABEL); os.makedirs(OUT, exist_ok=True)
POORT = 8769

class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
server = socketserver.TCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None

class Meter:
    def __init__(self, page, telefoon):
        self.page, self.telefoon, self.handelingen, self.scrolls = page, telefoon, 0, 0
    def _doel(self, sel):
        loc = self.page.locator(sel).locator('visible=true').first
        loc.wait_for(state='visible', timeout=8000)
        box = loc.bounding_box(); vh = self.page.viewport_size['height']
        if box and (box['y'] < 0 or box['y'] + box['height'] > vh): self.scrolls += 1
        return loc
    def tik(self, sel):
        self._doel(sel).click(); self.handelingen += 1; self.page.wait_for_timeout(250)
    def typ(self, sel, tekst):
        self._doel(sel).fill(tekst); self.handelingen += 1
    def toets(self, sel, toets):
        self._doel(sel).press(toets); self.handelingen += 1; self.page.wait_for_timeout(250)
    def kies(self, sel, waarde):
        self._doel(sel).select_option(waarde); self.handelingen += 1; self.page.wait_for_timeout(250)
    def nav(self, desk_item, view, chip=None):
        # naar een scherm zoals een gebruiker dat doet: de zijbalk op desktop, de tabbalk (en een chip) op de telefoon
        if not self.telefoon: self.tik('.zb-item[data-desk="%s"]' % desk_item)
        else:
            self.tik('nav button[data-view="%s"]' % view)
            if chip: self.tik(chip)
    def wacht(self, sel, ms=8000):
        self.page.locator(sel).locator('visible=true').first.wait_for(state='visible', timeout=ms)

# ---- taken: (id, omschrijving, rol, functie(m)) ----
def t_snelinvoer(m):
    m.nav('taken', 'relaties', '#crmTabs [data-crmtab="taken"]')
    m.typ('#taakSnel', 'Bel Marieke morgen om 14:00 !')
    m.toets('#taakSnel', 'Enter')
    m.wacht('text=Bel Marieke')

def t_afvinken_ongedaan(m):
    m.nav('taken', 'relaties', '#crmTabs [data-crmtab="taken"]')
    m.tik('#crmInhoud [data-taakklaar]')
    m.tik('#toast.aan [data-toastactie]')
    m.wacht('#crmInhoud [data-taakklaar]')

def t_school_zoeken(m):
    if m.telefoon:
        m.tik('nav button[data-view="relaties"]'); m.tik('#crmTabs [data-crmtab="scholen"]')
        m.typ('#crmZoek', 'esdoorn'); m.tik('#crmInhoud [data-crm-open="school:s1"]')
    else:
        m.typ('#zbZoek', 'esdoorn'); m.tik('#zbResultaten a')
    m.wacht('.d-naam h2')

def t_kans_gewonnen(m):
    if m.telefoon: m.tik('nav button[data-view="relaties"]'); m.tik('#crmTabs [data-crmtab="pipeline"]')
    else: m.tik('.zb-item[data-desk="pipeline"]')
    m.tik('[data-crm-open^="kans:"]')
    m.kies('[data-kansfase]', 'gewonnen')
    m.typ('#vf-aantal', '2'); m.typ('#vf-startdatum', '2026-11-02')
    m.tik('#venster [data-cf-opslaan]')
    m.wacht('.t-item:has-text("gewonnen")')

def t_termijn_betaald(m):
    if m.telefoon:
        m.tik('nav button[data-view="trajecten"]'); m.tik('[data-crm-open="project:t1"]')
        m.kies('[data-fstatus]', 'betaald')
    else:
        m.tik('.zb-item[data-desk="facturatie"]'); m.tik('[data-factopen="t1"]')
        m.kies('tr.f-sub [data-fstatus]', 'betaald')
    m.page.wait_for_timeout(600)
    assert m.page.locator('[data-fstatus] >> visible=true').first.input_value() == 'betaald'

def t_voorstellen(m):
    if m.telefoon: m.tik('nav button[data-view="trajecten"]'); m.tik('[data-pweergave="bezetting"]')
    else: m.tik('.zb-item[data-desk="bezetting"]')
    m.tik('.vac-kaart:has-text("NT2-ondersteuner") [data-voorstellen]')
    m.tik('#venster [data-mkies]:not([disabled])')
    m.tik('#venster [data-voordragen]')
    m.wacht('#toast.aan')

def t_financien(m):
    if m.telefoon: m.tik('nav button[data-view="trajecten"]'); m.tik('[data-naarfinancien]')
    else: m.tik('.zb-item[data-desk="financien"]')
    m.tik('table.fin [data-finopen]')
    m.wacht('table.fin td.fin-project')

def t_assistent(m):
    m.nav('brein', 'brein')
    m.typ('#vraagInput', 'Maak een taak om Kompas College terug te bellen over de factuur'); m.tik('#vraagKnop')
    m.wacht('.actiekaart [data-ak="uitvoeren"]', 20000); m.tik('.actiekaart [data-ak="uitvoeren"]')
    m.wacht('.actiekaart.uitgevoerd')

def t_melding(m):
    m.tik('#zbMeld' if not m.telefoon else '#meldKnop')
    m.tik('#vensterInhoud .rij.klik')
    m.wacht('.d-naam h2, #venster.aan')

TAKEN = [
    ('T1', 'Taak invoeren met snelinvoer', ['sophie', 'femke'], t_snelinvoer),
    ('T2', 'Taak afvinken en ongedaan maken', ['femke'], t_afvinken_ongedaan),
    ('T3', 'School zoeken en openen', ['lars', 'femke'], t_school_zoeken),
    ('T4', 'Kans op gewonnen met winformulier', ['lars'], t_kans_gewonnen),
    ('T5', 'Termijn op betaald zetten', ['femke'], t_termijn_betaald),
    ('T6', 'Talent voorstellen op een vacature', ['sem'], t_voorstellen),
    ('T7', 'Financiën: school openklappen', ['sophie'], t_financien),
    ('T8', 'Assistent: voorgestelde taak uitvoeren', ['lars'], t_assistent),
    ('T9', 'Melding openen', ['femke'], t_melding),
]

uitkomst = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)
    for tid, oms, rollen, fn in TAKEN:
        for rol in rollen:
            for telefoon in (False, True):
                ctx = b.new_context(viewport={'width': 390, 'height': 844} if telefoon else {'width': 1440, 'height': 900}, is_mobile=telefoon, has_touch=telefoon, locale='nl-NL', timezone_id='Europe/Amsterdam')
                page = ctx.new_page(); fouten = []
                page.on('pageerror', lambda e, f=fouten: f.append(str(e)[:160]))
                page.goto('http://127.0.0.1:%d/?demo=1&kaal=1&rol=%s' % (POORT, rol)); page.wait_for_selector('#zijbalk' if not telefoon else 'nav'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(500)
                m = Meter(page, telefoon); begin = time.time(); gelukt, fout = True, ''
                try: fn(m)
                except Exception as e: gelukt, fout = False, str(e).split('\n')[0][:200]
                if not gelukt: page.screenshot(path=os.path.join(OUT, 'taak_%s_%s_%d.png' % (tid, rol, 390 if telefoon else 1440)))
                uitkomst.append({'taak': tid, 'omschrijving': oms, 'rol': rol, 'breedte': 390 if telefoon else 1440, 'gelukt': gelukt, 'handelingen': m.handelingen,
                                 'scrolls': m.scrolls, 'seconden': round(time.time() - begin, 1), 'fout': fout, 'pageerrors': fouten})
                ctx.close()
    server.shutdown()

json.dump(uitkomst, open(os.path.join(OUT, 'taken.json'), 'w'), ensure_ascii=False, indent=1)
print('| taak | rol | breedte | gelukt | handelingen | scrolls | s | fout |')
print('|---|---|---|---|---|---|---|---|')
for u in uitkomst:
    print('| %s %s | %s | %d | %s | %d | %d | %.1f | %s |' % (u['taak'], u['omschrijving'], u['rol'], u['breedte'], 'ja' if u['gelukt'] else 'NEE', u['handelingen'], u['scrolls'], u['seconden'], (u['fout'] or '; '.join(u['pageerrors']))[:90]))
# v7.3 (FL-7): een mislukte taak of een pageerror maakt de suite rood (voorheen altijd exitcode 0)
mislukt = [u for u in uitkomst if not u['gelukt'] or u['pageerrors']]
for u in mislukt: print('FOUT %s %s (%s, %d px): %s' % (u['taak'], u['omschrijving'], u['rol'], u['breedte'], (u['fout'] or '; '.join(u['pageerrors']))[:200]))
print('%d taakmetingen, %d mislukt' % (len(uitkomst), len(mislukt)))
print('ALLES GOED' if not mislukt else 'FOUTEN: %d' % len(mislukt))
sys.exit(1 if mislukt else 0)
