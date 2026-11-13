# v7.9 (pakket 3, docs/sturing-v7.9.md): de app van release v7.9 in de demo, met de echte backend/Code.gs. Elke nieuwe handeling één keer, met een
# zichtbaar effect en (waar het telt) de aanroep die de app doet: de werkelijke datum vóór de keuze in de kansdetail (toekomst geweigerd zonder aanroep,
# vóór het vorige schooljaar eerst bevestigen), de melding met Ongedaan maken (index 0) en Andere datum (index 1), ongedaan maken als vlag (ook na het
# heropenen van een gewonnen kans, B2), bron toets en bulk, bulk met sturingVerplicht (één samenvatting), het voorstelvenster vóór de aanroep (R14), het
# winformulier en het verlorenvenster, een nieuwe kans (direct, klant- en schooljaarvoorstel, productsoort), BRIN, mijlpalen met rol, de overstap, de
# keuzelijsten, weekdoelen, de weergaven Week en MT, datakwaliteit, het register, jaardoel en aannames, werkelijke datums importeren, de actiekaart van
# de assistent, de definities op Home, Financiën en Rapporten, en de telefoon (390 px). v7.9.2: fase 5b bijna rond (secties 7 en 8; review r1: sectie 9, de assistent
# na een eerder uitgevoerde actie op de telefoon en het startdatumvenster op de iPad). v7.9.3 (review r2): + Kans met een trage aanroep (I-R1), de focus na het
# venster op een touch-apparaat (I-R2), alle velden 44 px op de iPad (I-N1), bezig… tijdens het laden van de basis (I-N2), de fout in het venster (I-N3), de
# legenda (I-N4) en de naam van het vinkje Vraagt startdatum (I-N5); in de stap fasen een hernoemde fase (staat zo) en twee mijlpalen voor één fase (C-R1).
# Review r1: de proefdraai noemt wat verdwijnt en een eigen rij die 5b wordt; het vinkje heeft een eigen aria-label (`data-le-naam`, `data-le-label`).
# Review r2: de focus terug op Uitvoeren na het laden van de basis (iOS-R1), de melding niet over het venster (iOS-R2), win- en verlorenvenster 44 px op de iPad
# met de fout onder het veld (iOS-N1) en een nieuwe proefdraai na een andere fasekeuze zolang de onderbouwing die van de proefdraai is (C-N3).
# Review r3 (sectie 10): de melding met knoppen nooit over titel, veld of fout van het venster op telefoon en iPad (R1), een veldfout schuift in beeld (N1),
# geen oude veldfout na een weigering van de backend (N2) en Toepassen uit tijdens de proefdraai van de stap fasen (R2).
# Review r4 (sectie 10, `g5_r4_liggend`): liggend met het toetsenbord open geen reserve boven de sheet, zodat label en veld in beeld blijven (IOS4-R1).
# Review r5 (sectie 10, `g5_r5_tik_melding`, `g5_r5_tik_ipad`): een tik op de melding in de reserve boven de sheet sluit het venster niet (IOS5-R1).
# De selectors staan letterlijk (als `data-…`) in dit bestand: test/handelingen.js grept ze.
# Gebruik: python3 test/handig/golf5.py — per controle "ok   …" of "FOUT …", eindigt met ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1).
# Eigen server op poort 8799; elke rol begint met een verse context (de demo schrijft in sessionStorage). Mislukte stappen: test/shots/robuust/golf5_<stap>.png.
import os, re, sys, time, json, shutil, datetime, tempfile, threading, functools, subprocess, http.server, socketserver
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(R, 'test', 'shots', 'robuust'); os.makedirs(OUT, exist_ok=True)
POORT = 8799
class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=R))
threading.Thread(target=srv.serve_forever, daemon=True).start()
U = 'http://127.0.0.1:%d/?demo=1&kaal=1&rol=' % POORT
START = time.time(); fouten = 0; aantal = 0; pageerrors = []; pg = None; HUIDIG = ''
DIALOGEN = []  # (type, tekst) van elke dialoog; ANTWOORD bepaalt of een confirm wordt geaccepteerd
ANTWOORD = {'confirm': True}
def dag(n): return (datetime.date.today() + datetime.timedelta(days=n)).isoformat()

def ok(naam, v, extra=''):
    global fouten, aantal
    aantal += 1
    print(('ok   ' if v else 'FOUT ') + naam + ((' — ' + str(extra)[:220]) if extra and not v else ''))
    if not v:
        fouten += 1
        try: pg.screenshot(path=os.path.join(OUT, 'golf5_' + HUIDIG + '.png'))
        except Exception: pass
def stap(naam, fn):
    global HUIDIG
    HUIDIG = naam
    try: fn()
    except Exception as e: ok(naam + ' (uitzondering)', False, str(e).split('\n')[0])
def dialoog(d):
    DIALOGEN.append((d.type, d.message))
    if d.type == 'confirm' and not ANTWOORD['confirm']: d.dismiss()
    else: d.accept()
VOLG = """(function () { if (window.__calls) return; window.__calls = []; var D = window.AthenaDemo, o = D.run;
  D.run = function (fn, args) { window.__calls.push({ fn: fn, args: JSON.parse(JSON.stringify(args || [])) }); return o.apply(D, arguments); }; })()"""
# v7.9.3: een trage of mislukte aanroep in de demo nabootsen (buiten VOLG: de aanroep komt pas na de vertraging in __calls); __faal[fn] = n geeft n keer
# het antwoord van een backendfout, __traag[fn] = ms vertraagt elke aanroep van fn
TRAAG = """(function () { if (window.__traag) return; window.__traag = {}; window.__faal = {}; var D = window.AthenaDemo, o = D.run;
  D.run = function (fn, args) { var self = this, a = arguments;
    if (window.__faal[fn] > 0) { window.__faal[fn]--; return Promise.resolve({ ok: false, fout: 'Storing (golf5)' }); }
    if (window.__traag[fn]) return new Promise(function (r) { setTimeout(r, window.__traag[fn]); }).then(function () { return o.apply(self, a); });
    return o.apply(self, a); }; })()"""
def nieuw(b, rol, tel=False):
    c = b.new_context(viewport={'width': 390, 'height': 844} if tel else {'width': 1440, 'height': 900}, is_mobile=tel, has_touch=tel)
    try: c.grant_permissions(['clipboard-read', 'clipboard-write'])
    except Exception: pass
    p = c.new_page(); p.on('pageerror', lambda e: pageerrors.append(rol + ': ' + str(e))); p.on('dialog', dialoog)
    p.goto(U + rol); p.wait_for_selector('nav' if tel else '#zijbalk'); p.wait_for_load_state('networkidle'); p.wait_for_timeout(500)
    p.evaluate(VOLG)
    return c, p
def calls(fn=None, vanaf=0): return [x for x in pg.evaluate('window.__calls')[vanaf:] if fn is None or x['fn'] == fn]
def n_calls(): return len(pg.evaluate('window.__calls'))
def api(fn, *args): return pg.evaluate("(function (a) { return run.apply(null, a); })(%s)" % json.dumps([fn] + list(args)))
def desk(item, wacht):
    pg.click('.zb-item[data-desk="%s"]' % item); pg.wait_for_selector(wacht); pg.wait_for_timeout(300)
def toast(tekst, ms=6000): pg.wait_for_selector('#toast.aan:has-text("%s")' % tekst, timeout=ms); return True
def venster_open(sel='#vensterInhoud'): pg.wait_for_selector('#venster.aan ' + sel, timeout=6000)
def venster_dicht(): pg.wait_for_selector('#venster.aan', state='hidden', timeout=6000)
# v7.9.3 (review r2, iOS-N1): een fout in het venster staat onder het veld (vensterFout: role=alert, aria-invalid), niet als melding over de sheet
def vfout(tekst, veld):
    try: pg.wait_for_selector('#vensterInhoud #vf-fout[role="alert"]:has-text("%s")' % tekst, timeout=4000)
    except Exception: return False
    return pg.evaluate("(function (n) { var i = document.getElementById('vf-' + n), f = document.getElementById('vf-fout'), t = document.getElementById('toast'); return !!(i && f && i.getAttribute('aria-invalid') === 'true' && f.closest('.veld') === i.closest('.veld')) && !(t.classList.contains('aan') && t.textContent.indexOf(f.textContent) >= 0); })(%s)" % json.dumps(veld))
def detail(hash_):
    pg.evaluate("routeHash(%r)" % hash_); pg.wait_for_selector('#crmDetailScherm .d-naam h2'); pg.wait_for_timeout(500)
# v7.9 (iOS-review): de pdf van het MT-overzicht nakijken: pagina's tellen in de bytes, de tekst via pdftotext of pypdf (wat er is; None = geen van beide)
def pdf_paginas(pdf): return len(re.findall(rb'/Type\s*/Page(?![A-Za-z])', pdf))
def pdf_tekst(pdf):
    if shutil.which('pdftotext'):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, 'mt.pdf'); open(f, 'wb').write(pdf)
            r = subprocess.run(['pdftotext', '-enc', 'UTF-8', f, '-'], capture_output=True)
            if r.returncode == 0: return r.stdout.decode('utf8', 'replace')
    try:
        import io, pypdf
        return '\n'.join((x.extract_text() or '') for x in pypdf.PdfReader(io.BytesIO(pdf)).pages)
    except Exception: return None
def zonder_wit(t): return re.sub(r'\s+', '', t or '')
def kol(sel): return pg.evaluate("(function(){var k=document.querySelector(%r);return k?k.closest('[data-sleepdoel]').getAttribute('data-sleepdoel'):null})()" % sel)
def muis(sel, doel, dy=60):
    a = pg.locator(sel).first.bounding_box(); b = pg.locator(doel).first.bounding_box()
    pg.mouse.move(a['x'] + 12, a['y'] + 10); pg.mouse.down(); pg.mouse.move(a['x'] + 30, a['y'] + 25, steps=4)
    pg.mouse.move(b['x'] + b['width'] / 2, b['y'] + min(dy, b['height'] / 2), steps=12); pg.wait_for_timeout(100); pg.mouse.up(); pg.wait_for_timeout(1200)
def kans(id_): return api('apiKans', id_)
def wissels(id_): return kans(id_)['fasewissels']
def pipeline():
    desk('pipeline', '.bord .kaartje.sleepbaar'); pg.wait_for_timeout(300)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')

    # ===== 1. Sophie (management) op desktop =====
    c, pg = nieuw(b, 'sophie')

    def g5_kansdetail_datum():  # punt 2, N7: het datumveld staat vóór de keuzelijst; toekomst = melding zonder aanroep; vóór het vorige schooljaar = confirm
        detail('kans:k8')
        ok('kansdetail: [data-kansfasedatum] staat vóór de keuzelijst', pg.evaluate("(function () { var d = document.querySelector('[data-kansfasedatum=\"k8\"]'), s = document.querySelector('[data-kansfase=\"k8\"]'); return !!(d && s && (d.compareDocumentPosition(s) & 4)); })()"))
        ok('kansdetail: standaard vandaag, max vandaag', pg.input_value('[data-kansfasedatum="k8"]') == dag(0) and pg.get_attribute('[data-kansfasedatum="k8"]', 'max') == dag(0))
        n0 = n_calls(); pg.fill('[data-kansfasedatum="k8"]', dag(1)); pg.select_option('[data-kansfase="k8"]', 'onderhandeling'); toast('in de toekomst')
        ok('kansdetail: een datum in de toekomst geeft een melding en geen aanroep', not calls('apiKansOpslaan', n0) and pg.input_value('[data-kansfase="k8"]') == 'gesprek')
        ANTWOORD['confirm'] = False; d0 = len(DIALOGEN)
        pg.fill('[data-kansfasedatum="k8"]', '2023-09-15'); pg.select_option('[data-kansfase="k8"]', 'onderhandeling'); pg.wait_for_timeout(500); ANTWOORD['confirm'] = True
        ok('kansdetail: vóór het vorige schooljaar eerst bevestigen (confirm), Annuleren doet niets', any(t == 'confirm' and 'vorige schooljaar' in m for t, m in DIALOGEN[d0:]) and not calls('apiKansOpslaan', n0) and pg.input_value('[data-kansfase="k8"]') == 'gesprek')
        pg.fill('[data-kansfasedatum="k8"]', dag(-2)); pg.select_option('[data-kansfase="k8"]', 'onderhandeling'); pg.wait_for_selector('#toast.aan [data-toastactie="1"]'); pg.wait_for_timeout(600)
        w = calls('apiKansOpslaan', n0)[-1]['args'][0].get('wissel') or {}
        ok('kansdetail: de wissel gaat met de datum uit het veld en bron detail', w.get('datum') == dag(-2) and w.get('bron') == 'detail', w)
        l = wissels('k8'); ok('kansdetail: de backend legt de werkelijke datum vast', l[-1]['naar'] == 'onderhandeling' and l[-1]['werkelijkeDatum'] == dag(-2), l[-1])
    stap('g5_kansdetail_datum', g5_kansdetail_datum)

    def g5_datum_verouderd():  # review I2: een kansdetail die sinds gisteren openstaat: een onaangeroerd datumveld gaat als vandaag mee; visibilitychange ververst het veld
        pg.evaluate("window.__echtNu = Date.now; Date.now = function () { return window.__echtNu.call(Date) - 86400000; }")
        detail('kans:k11'); ok('verouderd: het veld is getekend met de dag van toen (gisteren)', pg.input_value('[data-kansfasedatum="k11"]') == dag(-1))
        pg.evaluate("Date.now = window.__echtNu"); n0 = n_calls()
        pg.select_option('[data-kansfase="k11"]', 'lead'); pg.wait_for_selector('#toast.aan [data-toastactie="1"]'); pg.wait_for_timeout(400)
        w = calls('apiKansOpslaan', n0)[-1]['args'][0].get('wissel') or {}
        ok('verouderd: een onaangeroerd veld gaat als vandaag mee, niet als de dag van het tekenen', w.get('datum') == dag(0), w)
        pg.evaluate("Date.now = function () { return window.__echtNu.call(Date) - 86400000; }"); detail('kans:k6'); pg.evaluate("Date.now = window.__echtNu")
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(100)
        ok('verouderd: weer in beeld (visibilitychange) krijgt het onaangeroerde veld vandaag als waarde en max', pg.input_value('[data-kansfasedatum="k6"]') == dag(0) and pg.get_attribute('[data-kansfasedatum="k6"]', 'max') == dag(0))
    stap('g5_datum_verouderd', g5_datum_verouderd)

    def g5_fwdatum():  # punt 2: per wissel in de kansdetail een potlood (data-fwdatum) voor een andere datum
        detail('kans:k8'); pg.wait_for_selector('.fw-lijst [data-fwdatum]')
        pg.locator('.fw-lijst [data-fwdatum]').first.click(); venster_open('#vf-datum'); pg.fill('#vf-datum', dag(-3)); n0 = n_calls(); pg.click('#venster [data-cf-opslaan]'); toast('Datum van de mijlpaal')
        c0 = calls('apiFasewisselDatum', n0); ok('fwdatum: apiFasewisselDatum met de nieuwe datum', c0 and c0[0]['args'][1] == dag(-3), c0)
    stap('g5_fwdatum', g5_fwdatum)

    def g5_slepen_anderedatum():  # punt 2: na slepen de melding met twee knoppen; Andere datum opent het datumvenster
        pipeline(); n0 = n_calls()
        muis('[data-sleep="kans:k16"]', '[data-sleepdoel="kans:lead"]'); pg.wait_for_selector('#toast.aan [data-toastactie="1"]')
        ok('slepen: melding met Ongedaan maken (0) en Andere datum (1)', pg.locator('#toast.aan [data-toastactie]').count() == 2 and 'Andere datum' in pg.inner_text('#toast.aan [data-toastactie="1"]'))
        w = calls('apiKansOpslaan', n0)[-1]['args'][0].get('wissel') or {}; ok('slepen: bron slepen', w.get('bron') == 'slepen', w)
        pg.click('#toast.aan [data-toastactie="1"]'); venster_open('#vf-datum'); pg.fill('#vf-datum', dag(-1)); pg.click('#venster [data-cf-opslaan]'); toast('Datum van de mijlpaal')
        l = wissels('k16'); ok('slepen: Andere datum zet de werkelijke datum', l[-1]['naar'] == 'lead' and l[-1]['werkelijkeDatum'] == dag(-1), l[-1])
        ok('slepen: na Opslaan staat de focus op de kaart (review I4), niet in de melding', pg.evaluate("document.activeElement && document.activeElement.getAttribute('data-sleep')") == 'kans:k16')
    stap('g5_slepen_anderedatum', g5_slepen_anderedatum)

    def g5_ongedaan():  # B2: Ongedaan maken = de vlag op de wissel, geen tweede gebeurtenis; ook na het heropenen van een gewonnen kans
        pipeline(); voor = len(wissels('k16'))
        muis('[data-sleep="kans:k16"]', '[data-sleepdoel="kans:gesprek"]'); pg.wait_for_selector('#toast.aan [data-toastactie="0"]'); pg.click('#toast.aan [data-toastactie="0"]'); pg.wait_for_timeout(1200)
        l = wissels('k16'); ok('ongedaan: kaart terug in lead', kol('[data-sleep="kans:k16"]') == 'kans:lead')
        ok('ongedaan: één wissel erbij (de wissel zelf), met de vlag; geen tweede gebeurtenis', len(l) == voor + 1 and l[-1]['ongedaan'] is True, [len(l), voor, l[-1]])
        detail('kans:k5'); gesl = kans('k5')['kans']['gesloten']
        pg.select_option('[data-kansfase="k5"]', 'lead'); pg.wait_for_selector('#toast.aan [data-toastactie="0"]'); pg.wait_for_timeout(300)
        ok('heropenen: geen winformulier', pg.locator('#venster.aan').count() == 0)
        pg.click('#toast.aan [data-toastactie="0"]'); toast('Teruggezet naar gewonnen'); k = kans('k5')['kans']
        ok('heropenen ongedaan: weer gewonnen, gesloten = de oorspronkelijke datum, geen nieuw project', k['fase'] == 'gewonnen' and k['gesloten'] == gesl and pg.locator('#venster.aan').count() == 0, k)
    stap('g5_ongedaan', g5_ongedaan)

    def g5_anderedatum_focus():  # review I4: Andere datum uit de melding en dan Escape: de focus terug op de kaart, niet op de vervaagde knop in de melding
        pipeline(); muis('[data-sleep="kans:k16"]', '[data-sleepdoel="kans:gesprek"]'); pg.wait_for_selector('#toast.aan [data-toastactie="1"]')
        pg.click('#toast.aan [data-toastactie="1"]'); venster_open('#vf-datum'); pg.keyboard.press('Escape'); venster_dicht(); pg.wait_for_timeout(200)
        f = pg.evaluate("(function () { var a = document.activeElement; return { sleep: a && a.getAttribute('data-sleep'), inToast: !!(a && a.closest && a.closest('#toast')) }; })()")
        ok('andere datum: na Escape staat de focus op de kaart, niet in de melding', f['sleep'] == 'kans:k16' and not f['inToast'], f)
        if pg.locator('#toast.aan [data-toastactie="0"]').count(): pg.click('#toast.aan [data-toastactie="0"]'); pg.wait_for_timeout(1000)
    stap('g5_anderedatum_focus', g5_anderedatum_focus)

    def g5_toets():  # punt 1: een pijltoets op een kaart geeft bron toets
        pipeline(); n0 = n_calls()
        pg.locator('[data-sleep="kans:k8"]').focus(); pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(1500)  # k8 staat in onderhandeling (de laatste kolom)
        w = (calls('apiKansOpslaan', n0) or [{'args': [{}]}])[-1]['args'][0].get('wissel') or {}
        ok('toets: bron toets', w.get('bron') == 'toets', w); ok('toets: focus blijft op de kaart', pg.evaluate("document.activeElement.getAttribute('data-sleep')") == 'kans:k8')
    stap('g5_toets', g5_toets)

    def g5_bulk():  # punt 1: slepen met een selectie en de selectiebalk "Verplaats naar" geven bron bulk
        pipeline(); n0 = n_calls()
        pg.click('[data-sleep="kans:k9"]', modifiers=['Shift']); pg.click('[data-sleep="kans:k12"]', modifiers=['Shift']); pg.wait_for_selector('#selectieBalk.aan')
        muis('[data-sleep="kans:k9"]', '[data-sleepdoel="kans:gesprek"]'); toast('verplaatst naar gesprek', 8000)
        b0 = calls('apiKansOpslaan', n0); ok('bulk (slepen): twee aanroepen met bron bulk', len(b0) == 2 and all((x['args'][0].get('wissel') or {}).get('bron') == 'bulk' for x in b0), b0)
        n1 = n_calls(); pg.click('[data-sleep="kans:k9"]', modifiers=['Shift']); pg.click('[data-sleep="kans:k12"]', modifiers=['Shift']); pg.wait_for_selector('#selectieBalk.aan [data-bulkveld="kolom"]')
        pg.select_option('#selectieBalk [data-bulkveld="kolom"]', 'lead'); toast('verplaatst naar lead', 8000)
        b1 = calls('apiKansOpslaan', n1); ok('bulk (selectiebalk): bron bulk', len(b1) == 2 and all((x['args'][0].get('wissel') or {}).get('bron') == 'bulk' for x in b1), b1)
    stap('g5_bulk', g5_bulk)

    def g5_bulk_verplicht():  # R14, K6: met sturingVerplicht gaan kansen zonder waarde of tekendatum niet mee; één samenvatting, geen venster of toast per kans
        api('apiAannameOpslaan', 'sturingVerplicht', {'waarde': True, 'onderbouwing': 'Test golf5', 'besluitdatum': dag(0)})
        api('apiKansOpslaan', {'id': 'k12', 'verwachteSluiting': '', '_oud': {}})  # k12 zonder tekendatum (lead: mag)
        pg.evaluate("crmVerouderd(); laadCrmBasis()"); pg.wait_for_timeout(600); pipeline(); n0 = n_calls()
        pg.click('[data-sleep="kans:k9"]', modifiers=['Shift']); pg.click('[data-sleep="kans:k12"]', modifiers=['Shift']); pg.wait_for_selector('#selectieBalk.aan [data-bulkveld="kolom"]')
        pg.select_option('#selectieBalk [data-bulkveld="kolom"]', 'voorstel'); toast('overgeslagen: waarde of tekendatum ontbreekt', 8000)
        b0 = calls('apiKansOpslaan', n0); ok('bulk verplicht: alleen de kans met tekendatum gaat mee, één samenvatting en geen venster', len(b0) == 1 and b0[0]['args'][0]['id'] == 'k9' and pg.locator('#venster.aan').count() == 0, b0)
        api('apiAannameOpslaan', 'sturingVerplicht', {'waarde': False, 'onderbouwing': 'Test golf5 terug', 'besluitdatum': dag(0)}); pg.evaluate("crmVerouderd(); laadCrmBasis()"); pg.wait_for_timeout(400)
    stap('g5_bulk_verplicht', g5_bulk_verplicht)

    def g5_voorstelvenster():  # punt 5, R14: venster vóór de aanroep met de kaart voorlopig verplaatst; Annuleren zonder aanroep; Overslaan; Opslaan; focus op de kaart
        pipeline(); n0 = n_calls()
        muis('[data-sleep="kans:k12"]', '[data-sleepdoel="kans:voorstel"]'); venster_open('#vf-verwachteSluiting')
        ok('voorstelvenster: opent vóór de aanroep, alleen het lege veld, kaart voorlopig in voorstel', not calls('apiKansOpslaan', n0) and pg.locator('#venster #vf-waarde').count() == 0 and kol('[data-sleep="kans:k12"]') == 'kans:voorstel')
        ok('voorstelvenster: Overslaan staat er (sturingVerplicht uit)', pg.locator('#venster [data-voorstelovers]').count() == 1)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht(); pg.wait_for_timeout(400)
        ok('voorstelvenster: Annuleren zet de kaart terug zonder aanroep', kol('[data-sleep="kans:k12"]') == 'kans:lead' and not calls('apiKansOpslaan', n0))
        muis('[data-sleep="kans:k12"]', '[data-sleepdoel="kans:voorstel"]'); venster_open('[data-voorstelovers]'); pg.click('#venster [data-voorstelovers]')
        pg.wait_for_selector('#toast.aan:has-text("→ voorstel")'); pg.wait_for_timeout(500); a = calls('apiKansOpslaan', n0)
        ok('voorstelvenster: Overslaan = één aanroep met alleen fase en wissel (bron slepen)', len(a) == 1 and 'verwachteSluiting' not in a[0]['args'][0] and a[0]['args'][0].get('fase') == 'voorstel' and (a[0]['args'][0].get('wissel') or {}).get('bron') == 'slepen', a)
        ok('voorstelvenster: de focus staat daarna op de kaart in het nieuwe bord', pg.evaluate("document.activeElement && document.activeElement.getAttribute('data-sleep')") == 'kans:k12')
        api('apiKansOpslaan', {'id': 'k12', 'fase': 'lead', '_oud': {'fase': 'voorstel'}}); pg.evaluate("crmVerouderd()"); pipeline(); n1 = n_calls()
        muis('[data-sleep="kans:k12"]', '[data-sleepdoel="kans:voorstel"]'); venster_open('#vf-verwachteSluiting'); pg.fill('#vf-verwachteSluiting', dag(40)); pg.click('#venster [data-cf-opslaan]')
        pg.wait_for_selector('#toast.aan:has-text("→ voorstel")'); pg.wait_for_timeout(500); a = calls('apiKansOpslaan', n1)
        ok('voorstelvenster: Opslaan = één aanroep met fase, wissel en de tekendatum', len(a) == 1 and a[0]['args'][0].get('verwachteSluiting') == dag(40) and a[0]['args'][0].get('fase') == 'voorstel', a)
    stap('g5_voorstelvenster', g5_voorstelvenster)

    def g5_winformulier():  # punt 4: getekende contractwaarde en akkoorddatum verplicht; een akkoorddatum in de toekomst wordt geweigerd
        detail('kans:k7'); pg.select_option('[data-kansfase="k7"]', 'gewonnen'); venster_open('#vf-contractwaarde')
        ok('winformulier: akkoorddatum standaard vandaag', pg.input_value('#vf-akkoorddatum') == dag(0))
        pg.fill('#vf-aantal', '2'); pg.fill('#vf-startdatum', dag(20)); pg.click('#venster [data-cf-opslaan]'); f1 = vfout('getekende contractwaarde', 'contractwaarde')
        pg.fill('#vf-contractwaarde', '23100'); pg.fill('#vf-akkoorddatum', dag(2)); n0 = n_calls(); pg.click('#venster [data-cf-opslaan]'); f2 = vfout('in de toekomst', 'akkoorddatum')
        ok('winformulier: akkoorddatum in de toekomst geweigerd zonder aanroep', not calls('apiKansOpslaan', n0))
        ok('winformulier (r2, iOS-N1): de fouten staan in het venster onder het veld, niet als melding', f1 and f2, [f1, f2])
        pg.fill('#vf-akkoorddatum', dag(-1)); pg.click('#venster [data-cf-opslaan]'); toast('Gewonnen'); pg.wait_for_timeout(600)
        k = kans('k7'); ok('winformulier: waarde = getekende waarde, gesloten = akkoorddatum, project met contractwaarde', k['kans']['waarde'] == 23100 and k['kans']['gesloten'] == dag(-1) and k['project'] and k['project'].get('contractwaarde') == 23100, [k['kans']['waarde'], k['kans']['gesloten'], k['project'] and k['project'].get('contractwaarde')])
    stap('g5_winformulier', g5_winformulier)

    def g5_verloren():  # punt 15: geen prompt; datum, reden uit de keuzelijst, toelichting
        detail('kans:k10'); d0 = len(DIALOGEN); pg.select_option('[data-kansfase="k10"]', 'verloren'); venster_open('#vf-verliesReden')
        pg.click('#venster [data-cf-opslaan]'); ok('verloren (r2, iOS-N1): "Kies een reden" staat in het venster onder de keuzelijst, niet als melding', vfout('Kies een reden', 'verliesReden'))
        pg.select_option('#vf-verliesReden', 'andere aanbieder'); pg.fill('#vf-verliesToelichting', 'Koos een partij uit de regio'); pg.click('#venster [data-cf-opslaan]'); toast('verloren'); pg.wait_for_timeout(500)
        k = kans('k10')['kans']; ok('verloren: reden en toelichting vastgelegd, geen prompt', k['fase'] == 'verloren' and k['verliesReden'] == 'andere aanbieder' and k['verliesToelichting'] == 'Koos een partij uit de regio' and not any(t == 'prompt' for t, _ in DIALOGEN[d0:]), k)
        l = wissels('k10'); ok('verloren: de wissel heeft de reden', l[-1]['naar'] == 'verloren' and l[-1]['bron'] == 'verloren', l[-1])
    stap('g5_verloren', g5_verloren)

    def g5_kans_aanmaken():  # punt 7, 16, 23, 2: direct in een latere fase, klantvoorstel, schooljaarvoorstel uit de tekendatum, productsoort, datum van de mijlpaal
        pipeline(); pg.click('#deskActies [data-crmnieuw="kans"]'); pg.wait_for_selector('#crmNieuw #cf-klant')
        pg.fill('#cf-naam', 'Leesbegeleiding golf5'); pg.select_option('#cf-schoolId', 's1'); pg.dispatch_event('#cf-schoolId', 'change'); pg.wait_for_timeout(200)
        ok('nieuwe kans: klantvoorstel bestaand bij een school die vorig schooljaar klant was', 'voorstel: bestaand' in pg.inner_text('label[for="cf-klant"]') and pg.input_value('#cf-klant') == 'bestaand', pg.inner_text('label[for="cf-klant"]'))
        sj0 = pg.input_value('#cf-schooljaar'); j = int(sj0[:4]); volgend = '%d-%d' % (j + 1, j + 2)
        pg.fill('#cf-verwachteSluiting', '%d-05-15' % (j + 2)); pg.dispatch_event('#cf-verwachteSluiting', 'change'); pg.wait_for_timeout(200)
        ok('nieuwe kans: schooljaarvoorstel volgt de tekendatum', pg.input_value('#cf-schooljaar') == volgend and ('voorstel: ' + volgend) in pg.inner_text('label[for="cf-schooljaar"]'), [pg.input_value('#cf-schooljaar'), volgend])
        pg.select_option('#cf-fase', 'gesprek'); pg.select_option('#cf-productsoort', 'overig'); pg.fill('#cf-wisselDatum', dag(-1)); pg.fill('#cf-waarde', '5000'); n0 = n_calls()
        pg.click('#crmNieuw [data-cf-opslaan]'); toast('direct in gesprek'); pg.wait_for_selector('#crmDetailScherm .d-naam h2:has-text("Leesbegeleiding golf5")')
        o = calls('apiKansOpslaan', n0)[0]['args'][0]
        ok('nieuwe kans: klant, schooljaar, productsoort en de wissel met datum gaan mee', o.get('klant') == 'bestaand' and o.get('schooljaar') == volgend and o.get('productsoort') == 'overig' and (o.get('wissel') or {}).get('datum') == dag(-1), o)
        ok('nieuwe kans: de mijlpalenlijst toont "direct"', pg.locator('.fw-lijst .fw-regel:has-text("direct")').count() == 1)
    stap('g5_kans_aanmaken', g5_kans_aanmaken)

    def g5_school_brin():  # punt 6: ongeldige BRIN → melding; geldige → hoofdletters en vestiging 00; de chip "Zonder BRIN" filtert
        detail('school:s11'); pg.click('#crmDetailScherm [data-composer="bewerk"]'); pg.wait_for_selector('#crmComposer #cf-brin')
        pg.fill('#cf-brin', '1x'); pg.click('#crmComposer [data-cf-opslaan]'); toast('BRIN-nummer is twee cijfers')
        pg.fill('#cf-brin', '98zz'); pg.click('#crmComposer [data-cf-opslaan]'); pg.wait_for_selector('.d-links:has-text("98ZZ-00")')
        ok('BRIN: hoofdletters en vestiging 00', True)
        desk('contacten', '.dtabel tr.klik'); n_alle = pg.locator('.dtabel tr[data-crm-open^="school:"]').count()
        pg.click('#crmBalk [data-crmbrin]'); pg.wait_for_timeout(300); n_zonder = pg.locator('.dtabel tr[data-crm-open^="school:"]').count()
        ok('BRIN: Zonder BRIN filtert de lijst (aria-pressed)', n_zonder < n_alle and pg.get_attribute('#crmBalk [data-crmbrin]', 'aria-pressed') == 'true', [n_alle, n_zonder])
        pg.click('#crmBalk [data-crmbrin]'); pg.wait_for_timeout(200)
    stap('g5_school_brin', g5_school_brin)

    def g5_keuzelijsten():  # punt 15, 23: verliesredenen (opgeschoond blijft altijd) en productsoorten
        desk('rapporten', '#crmInhoud [data-beheer="keuzelijsten"]'); pg.click('[data-beheer="keuzelijsten"]'); pg.wait_for_selector('#le-verliesRedenen .le-rij')
        ok('keuzelijsten: verliesredenen met opgeschoond en productsoorten', pg.locator('#le-verliesRedenen input[value="opgeschoond"]').count() == 1 and pg.locator('#le-productsoorten .le-rij').count() >= 5)
        pg.locator('#le-verliesRedenen .le-rij:has(input[value="opgeschoond"]) [data-le-weg]').click(); pg.click('#crmBeheer [data-cf-opslaan]'); toast('opgeschoond')
        ok('keuzelijsten: een lijst zonder opgeschoond wordt geweigerd', 'opgeschoond' in pg.inner_text('#toast'))
        pg.click('#crmBeheer [data-cf-annuleer]')
    stap('g5_keuzelijsten', g5_keuzelijsten)

    def g5_mijlpalen_rol():  # punt 3, N6: kolom Rol; een nieuwe mijlpaal met rol ad (gewicht → onderbouwing); daarna Rollen opnieuw toepassen; de week kent AD
        desk('rapporten', '#crmInhoud [data-beheer="mijlpalen"]'); pg.click('[data-beheer="mijlpalen"]'); pg.wait_for_selector('#leMijlpalen .le-rij [data-le="rol"]')
        pg.click('[data-le-erbij="leMijlpalen"]'); r = pg.locator('#leMijlpalen .le-rij').last
        r.locator('[data-le="pipeline"]').fill('Scholen'); r.locator('[data-le="mijlpaal"]').fill('ap gehouden'); r.locator('[data-le="kans"]').fill('35'); r.locator('[data-le="dagenNorm"]').fill('10'); r.locator('[data-le="rol"]').fill('ad')
        r.locator('[data-le-op]').click(); pg.locator('#leMijlpalen .le-rij').nth(3).locator('[data-le-op]').click()  # tussen gesprek (ap) en voorstel
        pg.click('#crmBeheer [data-cf-opslaan]'); venster_open('#vf-onderbouwing'); pg.fill('#vf-onderbouwing', 'Nieuwe mijlpaal AP gehouden, gewicht uit de demo'); pg.click('#venster [data-cf-opslaan]'); toast('Mijlpalen opgeslagen')
        pg.wait_for_selector('#crmBeheer [data-rollentoepassen]'); pg.click('#crmBeheer [data-rollentoepassen]'); pg.wait_for_timeout(1500)
        ok('mijlpalen: Rollen opnieuw toepassen draait de stap wissels', any(x['args'][0] == 'wissels' for x in calls('apiMigratieV79')))
        ms = api('apiCrm')['mijlpalen']; ok('mijlpalen: de nieuwe mijlpaal heeft rol ad, tussen ap en voorstel', [m['rol'] for m in ms if m['pipeline'] == 'Scholen'][:4] == ['lead', 'ap', 'ad', 'voorstel'], [(m['mijlpaal'], m['rol']) for m in ms])
        w = api('apiSturing', 'week', {}); ok('mijlpalen: de weekweergave kent AD', 'ad' not in w['rolOntbreekt'], w['rolOntbreekt'])
        f = [x for x in api('apiAannames')['aannames'] if x['naam'] == 'fasegewichten'][0]; ok('mijlpalen: het gewijzigde gewicht is een versie van fasegewichten (N6)', f['huidig'] and 'AP gehouden' in f['huidig']['onderbouwing'], f['huidig'])
    stap('g5_mijlpalen_rol', g5_mijlpalen_rol)

    def g5_v79():  # §2.5: de overstap; eerst alle rollen leeg (eigen rijen zonder rol), dan rollen voorstellen en toepassen; wissels; redenen koppelen
        desk('rapporten', '#crmInhoud [data-beheer="mijlpalen"]'); pg.click('[data-beheer="mijlpalen"]'); pg.wait_for_selector('#leMijlpalen [data-le="rol"]')
        for i in range(pg.locator('#leMijlpalen [data-le="rol"]').count()): pg.locator('#leMijlpalen [data-le="rol"]').nth(i).fill('')
        pg.click('#crmBeheer [data-cf-opslaan]'); toast('Mijlpalen opgeslagen'); pg.wait_for_timeout(600)
        api('apiImporteer', 'kansen', [{'id': 'k14', 'verliesReden': 'Eigen oplossing gevonden'}])  # een oude vrije reden
        pg.evaluate("crmVerouderd(); laadCrmBasis()"); pg.wait_for_timeout(500); desk('rapporten', '#crmInhoud [data-beheer="v79"]')
        pg.click('[data-beheer="v79"]'); venster_open('[data-v79="rollen:proef"]'); ok('overstap: de status zegt dat de rollen niet zijn ingesteld', 'nog niet ingesteld' in pg.inner_text('#v79Lijst'))
        pg.click('[data-v79="rollen:proef"]'); pg.wait_for_selector('#venster [data-v79rol]')
        ok('overstap: per mijlpaal een voorgestelde rol', pg.locator('#venster [data-v79rol]').count() >= 4 and pg.locator('#venster [data-v79rol] option[value="ap"]:checked').count() >= 1)
        pg.click('[data-v79="rollen:toepassen"]'); toast('rollen toegepast'); pg.wait_for_timeout(500)
        ok('overstap: daarna zijn de rollen ingesteld', api('apiCrm')['rollenIngesteld'] is True)
        pg.click('[data-v79="wissels:proef"]'); pg.wait_for_selector('#v79Lijst .r-meta:has-text("Proefdraai")'); ok('overstap: proefdraai wissels geeft tellingen', 'bekeken' in pg.inner_text('#v79Lijst'))
        pg.click('[data-v79="wissels:toepassen"]'); toast('wissels toegepast')
        pg.click('[data-v79="redenen:proef"]'); pg.wait_for_selector('#venster [data-v79reden]')
        ok('overstap: oude reden met voorstel uit de lijst', pg.input_value('#venster [data-v79reden="0"]') == 'eigen oplossing')
        pg.click('[data-v79="redenen:toepassen"]'); toast('redenen toegepast'); pg.wait_for_timeout(400)
        ok('overstap: de reden is gekoppeld', kans('k14')['kans']['verliesReden'] == 'eigen oplossing')
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_v79', g5_v79)

    def g5_register():  # punt 8: register van cijfers; een nieuwe conceptversie en aftekenen
        desk('rapporten', '#crmInhoud [data-beheer="cijfers"]'); pg.click('[data-beheer="cijfers"]'); venster_open('[data-cijferversie]')
        ok('register: elk cijfer met status (statusKlasse) en versie', pg.locator('#cijferLijst .aanname .tag').count() >= 30)
        pg.click('[data-cijferversie="contactmomenten"]'); venster_open('#vf-definitie'); pg.fill('#vf-definitie', 'Calls, mails met een maker, WhatsApp, afspraken en evaluaties met een school, maandag t/m vrijdag (golf5).')
        pg.click('#venster [data-cf-opslaan]'); toast('conceptversie'); venster_open('[data-cijferaf="contactmomenten:2"]')
        pg.click('[data-cijferaf="contactmomenten:2"]'); toast('Afgetekend')
        c0 = [x for x in api('apiCijfers', {})['cijfers'] if x['id'] == 'contactmomenten'][0]; ok('register: versie 2 afgetekend en leidend', c0['versie'] == 2 and c0['status'] == 'afgetekend', c0)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_register', g5_register)

    def g5_aannames():  # punt 13, besluit 2: eerst de scope, dan het jaardoel; daarna rekent het MT-overzicht de dekking
        desk('rapporten', '#crmInhoud [data-beheer="aannames"]'); pg.click('[data-beheer="aannames"]'); venster_open('[data-aanname="jaardoel"]')
        ok('aannames: het jaardoel staat op nog niet vastgesteld', 'nog niet vastgesteld' in pg.inner_text('#aannameLijst .aanname:has([data-aanname="jaardoel"])'))
        pg.click('[data-aanname="scope"]'); venster_open('#vf-onderbouwing'); pg.fill('#vf-onderbouwing', 'Particulier valt buiten het jaardoel (test).'); pg.click('#venster [data-cf-opslaan]'); toast('nieuwe versie vastgelegd')
        venster_open('[data-aanname="jaardoel"]'); pg.click('[data-aanname="jaardoel"]'); venster_open('#vf-soort')
        ok('aannames: de velden van het contracteerdoel alleen bij die noemer', not pg.locator('#vf-cdWaarde').is_visible())
        pg.select_option('#vf-soort', 'contractwaarde'); pg.select_option('#vf-periode', 'schooljaar'); pg.select_option('#vf-scope', 'scope v1'); pg.select_option('#vf-noemer', 'jaardoel')
        pg.fill('#vf-waarde', '400000'); pg.select_option('#vf-schooljaar', index=1); pg.fill('#vf-onderbouwing', 'Jaardoel test golf5'); pg.click('#venster [data-cf-opslaan]'); toast('nieuwe versie vastgelegd')
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        desk('rapporten', '#crmBalk [data-rweergave="mt"]'); pg.click('#crmBalk [data-rweergave="mt"]'); pg.wait_for_selector('.mt .mt-blok')
        ok('aannames: met een volledig jaardoel rekent het MT-overzicht de dekking (M07)', pg.locator('.mt .mt-regel:has(.mt-m:text-is("M07")) .mt-waarde').count() == 1, pg.inner_text('.mt .mt-blok').split('\n')[:12])
        pg.click('#crmBalk [data-rweergave="teams"]'); pg.wait_for_selector('#crmInhoud .tabel')
    stap('g5_aannames', g5_aannames)

    def g5_werkelijke_datums():  # punt 22: bestand kiezen, proefdraaien, toepassen; alleen tellingen
        desk('rapporten', '#crmInhoud [data-beheer="werkelijkedatums"]'); pg.click('[data-beheer="werkelijkedatums"]'); venster_open('#vf-fwbestand')
        pg.set_input_files('#vf-fwbestand', os.path.join(R, 'test', 'voorbeelden', 'werkelijke_datums.csv')); pg.wait_for_selector('[data-fwimport="proef"]:not([disabled])')
        pg.click('[data-fwimport="proef"]'); pg.wait_for_selector('#fwUit .kaart:has-text("Proefdraai")'); ok('werkelijke datums: de proefdraai toont tellingen', 'regels gelezen' in pg.inner_text('#fwUit'))
        pg.click('[data-fwimport="toepassen"]'); pg.wait_for_selector('#fwUit .kaart:has-text("Toegepast")'); toast('toegepast')
        ok('werkelijke datums: toegepast (en een tweede proefdraai verdubbelt niets)', api('apiFasewisselsImport', open(os.path.join(R, 'test', 'voorbeelden', 'werkelijke_datums.csv'), encoding='utf8').read(), {})['nieuw'] == 0)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_werkelijke_datums', g5_werkelijke_datums)

    def g5_weekdoelen():  # punt 14, M17: het raster in het bewerkvenster, deze of volgende week, één aanroep
        desk('doelen', '#doelenInhoud .doel-rij, #doelenInhoud .leeg'); pg.click('#doelenInhoud [data-doelteam="consultancy"]'); pg.wait_for_selector('#doelenInhoud [data-weekdoelen]')
        pg.click('#doelenInhoud [data-weekdoelen]'); venster_open('.wd-raster input'); pg.click('#venster [data-weekdoelweek="1"]'); pg.wait_for_selector('#venster [data-weekdoelweek="1"][aria-pressed="true"]')
        pg.locator('#venster .wd-raster input').first.fill('14'); n0 = n_calls(); pg.click('#venster [data-cf-opslaan]'); toast('Weekdoelen voor')
        a = calls('apiWeekdoelenOpslaan', n0); ok('weekdoelen: één aanroep voor de volgende week met alle regels', len(a) == 1 and a[0]['args'][0] == api('apiDoelen')['sleutels']['week'][1]['waarde'] and any(x['doel'] == 14 for x in a[0]['args'][1]), a)
    stap('g5_weekdoelen', g5_weekdoelen)

    def g5_rapport_week():  # punt 19 (desktop): tabel per OC, bladeren, definities
        desk('rapporten', '#crmBalk [data-rweergave="week"]'); pg.click('#crmBalk [data-rweergave="week"]'); pg.wait_for_selector('#crmInhoud .week-tabel')
        ok('week (desktop): een tabel met een regel per OC, de beheerder apart en het teamtotaal', pg.locator('.week-tabel tr').count() >= 4 and pg.locator('.week-tabel td:has-text("niet in het teamtotaal")').count() == 1 and pg.locator('.week-tabel tr.r-team').count() == 1)
        ok('week (desktop): de legenda Definities en de definitie op de kolomkop', pg.locator('#crmInhoud .legenda-defs').count() == 1 and 'contact' in (pg.get_attribute('.week-tabel th:nth-child(2)', 'title') or '').lower())
        pg.click('.periode-nav [data-rstap="-1"]'); pg.wait_for_selector('.periode-nav [data-rstap="nu"]'); pg.click('.periode-nav [data-rstap="nu"]'); pg.wait_for_selector('.periode-nav [data-rstap="nu"]', state='detached')
        ok('week (desktop): bladeren en terug naar nu', True)
    stap('g5_rapport_week', g5_rapport_week)

    def g5_rapport_mt():  # punt 20, 21: tussenstand, de keuze van standen, afdrukken (print-CSS) en de link
        pg.click('#crmBalk [data-rweergave="mt"]'); pg.wait_for_selector('.mt .mt-blok')
        if pg.locator('[data-mtbevries]').count(): pg.click('[data-mtbevries]'); toast('Tussenstand')
        pg.wait_for_selector('#mtStand option[value="%s"]' % dag(0), state='attached'); ok('mt: een tussenstand van vandaag in de keuze; hoogstens één per dag', pg.locator('[data-mtbevries]').count() == 0)
        pg.select_option('#mtStand', dag(0)); pg.wait_for_selector('.mt .hint:has-text("bevroren tussenstand")'); ok('mt: de tussenstand toont de bevroren definities', pg.locator('.mt .t-def').count() >= 10)
        pg.evaluate("window.print = function () { window.__geprint = (window.__geprint || 0) + 1; }"); pg.click('[data-mtprint]'); ok('mt: Afdrukken', (pg.evaluate("window.__geprint") or 0) >= 1)
        titels = pg.eval_on_selector_all('.mt .mt-blok h3', 'function (l) { return l.map(function (x) { return x.textContent; }); }')
        # review I1: echt afdrukken met de schermopmaak. De breedte van het papier laat (min-width: 1024px) omklappen terwijl matchMedia('print') niets
        # meldt (zoals in omgevingen die print niet in matchMedia melden); dan houdt alleen de vlag AFDRUKKEN (beforeprint) deskWissel tegen.
        pg.emulate_media(media='screen'); n0 = n_calls(); pdf = pg.pdf(format='A4'); pg.wait_for_timeout(300)
        ok('mt: afdrukken (pdf, schermopmaak) laat het MT-overzicht staan: geen terugval naar Teams, body.desk en MT blijven, geen nieuwe apiTeamRapport, apiSturing of apiCrm (review I1)', len(pdf) > 1000 and pg.locator('.mt .mt-blok').count() > 0 and pg.locator('#crmBalk [data-rweergave="mt"][aria-pressed="true"], #crmBalk [data-rweergave="mt"].aan').count() > 0 and pg.evaluate("document.body.classList.contains('desk')") and not calls('apiTeamRapport', n0) and not calls('apiSturing', n0) and not calls('apiCrm', n0), [x['fn'] for x in calls(None, n0)])
        # v7.9 (iOS-review): de print-opmaak. De echte bewaker van de print-fix is de computed style van html en body hieronder (display block, overflow
        # visible, geen vaste hoogte): zonder de regel in @media print zijn ze flex, hidden en 100 %. De pdf-controle erna (meer dan één pagina, het laatste
        # MT-blok in de tekst) is alleen een rooktest: Chromium drukt ook zonder de fix alles af, alleen iOS WebKit niet.
        pg.emulate_media(media='print'); ok('mt: print verbergt zijbalk en knoppen, toont de kop van het maanddocument en de inforegel (live of bevroren, schooljaar, scope; review I5)', not pg.locator('#zijbalk').is_visible() and not pg.locator('[data-mtprint]').is_visible() and pg.locator('.mt-print-kop').is_visible() and pg.locator('.mt .mt-info').is_visible() and 'bevroren' in pg.inner_text('.mt .mt-info'))
        cs = pg.evaluate("[document.documentElement, document.body].map(function (x) { var c = getComputedStyle(x); return [c.display, c.overflow, c.height, x.style.height]; }).concat([[window.innerHeight + 'px']])")
        ok('mt: print zet html en body los: display block, overflow visible, geen vaste hoogte (de bewaker van de print-fix; iOS-review)', all(x[0] == 'block' and x[1] == 'visible' and x[2] != cs[-1][0] and not x[3] for x in cs[:2]), cs)
        n0 = n_calls(); pdf = pg.pdf(format='A4'); pg.wait_for_timeout(300)
        pg.emulate_media(media='screen')
        tekst = pdf_tekst(pdf); laatste = zonder_wit(titels[-1] if titels else '')[:16]
        ok('mt: de tekst van de pdf is te lezen (pdftotext of pypdf)', tekst is not None, 'geen pdftotext en geen pypdf')
        ok('mt: rooktest: de pdf (print-opmaak) heeft meer dan één pagina en het laatste MT-blok staat erin', pdf_paginas(pdf) > 1 and bool(laatste) and tekst is not None and laatste in zonder_wit(tekst), 'pagina\'s %d, laatste blok %r, tekst %s' % (pdf_paginas(pdf), laatste, 'onbekend' if tekst is None else len(tekst)))
        ok('mt: ook met de print-opmaak geen terugval en geen aanroep', pg.locator('.mt .mt-blok').count() > 0 and pg.evaluate("document.body.classList.contains('desk')") and not calls('apiTeamRapport', n0) and not calls('apiSturing', n0) and not calls('apiCrm', n0), [x['fn'] for x in calls(None, n0)])
        pg.click('[data-mtlink]'); pg.wait_for_timeout(400)
        try: kl = pg.evaluate("navigator.clipboard.readText()")
        except Exception: kl = ''
        ok('mt: Link kopiëren zet #rapport:mt:<stand> op het klembord', kl.endswith('#rapport:mt:' + dag(0)), kl)
        pg.select_option('#mtStand', ''); pg.wait_for_selector('.mt .hint:has-text("live")')
    stap('g5_rapport_mt', g5_rapport_mt)

    def g5_afdrukvlag():  # v7.9 (iOS-review, tweede ronde): beforeprint zonder afterprint (een geannuleerd printvenster op iOS); daarna moet deskWissel weer werken
        def breed(w): pg.set_viewport_size({'width': w, 'height': 900}); pg.wait_for_timeout(400)
        def is_desk(): return pg.evaluate("document.body.classList.contains('desk')")
        pg.evaluate("window.dispatchEvent(new Event('beforeprint'))"); ok('afdrukvlag: beforeprint zet AFDRUKKEN', pg.evaluate("AFDRUKKEN === true"))
        n0 = n_calls(); breed(900); d = is_desk(); breed(1440)
        ok('afdrukvlag: zolang de vlag staat, wisselt een smallere breedte niet naar de telefoon en volgt er geen aanroep (review I1)', d and is_desk() and not calls(None, n0), [d, [x['fn'] for x in calls(None, n0)]])
        pg.emulate_media(media='print'); pg.wait_for_timeout(100); pg.emulate_media(media='screen'); pg.wait_for_timeout(200)
        ok('afdrukvlag: zonder afterprint zet het einde van print in matchMedia de vlag terug', pg.evaluate("AFDRUKKEN === false"))
        breed(900); ok('afdrukvlag: daarna werkt deskWissel weer (telefoonweergave op 900 px)', not is_desk())
        breed(1440); pg.wait_for_selector('#zijbalk', state='visible'); ok('afdrukvlag: en terug naar de desktopweergave', is_desk())
        pg.evaluate("window.dispatchEvent(new Event('beforeprint'))"); pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        ok('afdrukvlag: visibilitychange (weer in beeld) zet de vlag ook terug (in de demo met service worker; de listener staat in het deskMq-blok)', pg.evaluate("AFDRUKKEN === false"))
        desk('rapporten', '#crmBalk [data-rweergave="teams"]')
    stap('g5_afdrukvlag', g5_afdrukvlag)

    def g5_datakwaliteit_sophie():  # punt 11: management ziet iedereen en kan opnieuw rekenen; de melding rapport:datakwaliteit opent het blok
        pg.click('#crmBalk [data-rweergave="teams"]'); pg.wait_for_selector('#dqBlok'); ok('datakwaliteit (Sophie): Nu opnieuw rekenen', pg.locator('[data-dqvers]').count() == 1)
        pg.click('[data-dqvers]'); toast('opnieuw gerekend'); pg.wait_for_timeout(300)
        n1 = n_calls(); pg.click('.periode-nav [data-rstap="-1"]'); pg.wait_for_selector('.periode-nav [data-rstap="nu"]'); pg.wait_for_timeout(600)
        ok('datakwaliteit: bladeren haalt het blok van vandaag niet opnieuw op (review T7)', not [x for x in calls('apiSturing', n1) if x['args'] and x['args'][0] == 'datakwaliteit'] and len(calls('apiTeamRapport', n1)) >= 1 and pg.locator('#dqBlok').count() == 1)
        pg.click('.periode-nav [data-rstap="nu"]'); pg.wait_for_selector('.periode-nav [data-rstap="nu"]', state='detached'); pg.wait_for_selector('#dqBlok')
        ok('datakwaliteit (Sophie): meer eigenaren, regels met doorklik (tabindex 0, role link)', pg.locator('.dq-eigenaar').count() >= 2 and pg.locator('.dq-regel[data-crm-open][tabindex="0"][role="link"]').count() >= 1, pg.locator('.dq-eigenaar').count())
        pg.evaluate("routeHash('rapport:datakwaliteit')"); pg.wait_for_selector('#dqBlok'); pg.wait_for_timeout(400); ok('datakwaliteit: rapport:datakwaliteit opent het blok', pg.evaluate("document.activeElement && document.activeElement.id") == 'dqBlok')
    stap('g5_datakwaliteit_sophie', g5_datakwaliteit_sophie)

    def g5_defs():  # punt 8: de schakelaar Definities op Home, Financiën en Rapporten; het register kwam één keer per sessie
        desk('home', '#homeInhoud .hkaart'); n0 = n_calls(); pg.click('#homeInhoud [data-defs]'); pg.wait_for_selector('body.defs-aan #homeInhoud .tegel .t-def:not(:empty)')
        ok('definities (Home): zichtbaar zonder nieuwe aanroep', not calls(None, n0) and pg.get_attribute('#homeInhoud [data-defs]', 'aria-pressed') == 'true')
        desk('financien', '#finInhoud .tegel'); ok('definities (Financiën): onder de tegels', pg.locator('#finInhoud .tegel .t-def:not(:empty)').count() >= 3 and pg.locator('#finInhoud [data-defs]').count() == 1)
        desk('rapporten', '#crmBalk [data-defs]'); ok('definities (Rapporten): de chip staat aan, de tegels tonen hun definitie', pg.get_attribute('#crmBalk [data-defs]', 'aria-pressed') == 'true' and pg.locator('#crmInhoud .tegel .t-def:not(:empty)').count() >= 3)
        ok('definities: het register (kort) één keer per sessie', len([x for x in calls('apiCijfers') if x['args'] and isinstance(x['args'][0], dict) and x['args'][0].get('kort')]) <= 1)
        pg.click('#crmBalk [data-defs]'); pg.wait_for_selector('body:not(.defs-aan)')
    stap('g5_defs', g5_defs)

    def g5_assistent():  # punt 2: de actiekaart wijzig_kans toont de datum van de mijlpaal; uitvoeren legt een wissel met bron assistent vast
        pg.evaluate("""(function () { S.chat.push({ rol: 'bot', tekst: 'Voorstel', acties: [{ id: 'g5', soort: 'wijzig_kans', titel: 'Kans bijwerken', invoer: { kansId: 'k6', fase: 'gesprek' } }] }); saveChat(); })()""")
        desk('brein', '#breinBerichten .actiekaart'); pg.wait_for_selector('.actiekaart:has-text("Datum mijlpaal")')
        ok('assistent: de getoonde standaarddatum komt niet in het voorstel zelf (aa_chat, review I2)', pg.evaluate("(function () { var a = S.chat[S.chat.length - 1].acties[0]; return a.invoer.werkelijkeDatum === undefined; })()"))
        pg.locator('.actiekaart:has-text("Datum mijlpaal") [data-ak="aanpassen"]').click(); pg.wait_for_selector('.actiekaart.bewerken [data-akveld="werkelijkeDatum"][type="date"]')
        pg.fill('.actiekaart.bewerken [data-akveld="werkelijkeDatum"]', dag(-1)); pg.click('.actiekaart.bewerken [data-ak="uitvoeren"]'); pg.wait_for_selector('.actiekaart.uitgevoerd', timeout=8000)
        l = wissels('k6'); ok('assistent: een wissel met bron assistent en de gekozen datum (k6: geen wissel vandaag, review C1)', l[-1]['bron'] == 'assistent' and l[-1]['werkelijkeDatum'] == dag(-1), l[-1])
    stap('g5_assistent', g5_assistent)
    c.close()

    # ===== 2. Lars (OC) op desktop: alleen zijn eigen datakwaliteit, doorklik, Enter =====
    c, pg = nieuw(b, 'lars')
    def g5_datakwaliteit_lars():
        desk('rapporten', '#crmInhoud .tabel'); pg.wait_for_selector('#dqBlok')
        eig = [x.split('\n')[0].strip() for x in pg.locator('.dq-eigenaar summary').all_inner_texts()]
        ok('datakwaliteit (Lars): alleen zichzelf, geen Nu opnieuw rekenen', all(e.startswith('Lars') for e in eig) and pg.locator('[data-dqvers]').count() == 0, eig)
        if pg.locator('.dq-regel[data-crm-open]').count():
            pg.locator('.dq-eigenaar summary').first.click(); r = pg.locator('.dq-regel[data-crm-open]').first; r.focus(); pg.keyboard.press('Enter'); pg.wait_for_selector('#crmDetailScherm .d-naam h2')
            ok('datakwaliteit: Enter op een regel met focus opent het item', True)
        else: ok('datakwaliteit (Lars): geen afwijkingen met doorklik in de seed', True)
    stap('g5_datakwaliteit_lars', g5_datakwaliteit_lars)
    c.close()

    # ===== 3. De telefoon (390 px, Lars): datumveld ≥ 16 px en ≥ 44 px, de melding met twee knoppen past, Week zonder horizontale scroll =====
    c, pg = nieuw(b, 'lars', tel=True)
    def g5_telefoon():
        pg.evaluate("routeHash('kans:k16')"); pg.wait_for_selector('[data-kansfasedatum="k16"]'); pg.wait_for_timeout(400)
        m = pg.evaluate("(function () { var d = document.querySelector('[data-kansfasedatum=\"k16\"]').getBoundingClientRect(), s = document.querySelector('[data-kansfase=\"k16\"]').getBoundingClientRect(); return { fs: parseFloat(getComputedStyle(document.querySelector('[data-kansfasedatum=\"k16\"]')).fontSize), dh: d.height, sh: s.height, boven: d.bottom <= s.top + 1, breed: d.width > 300 }; })()")
        ok('telefoon: datumveld 16 px, 44 px hoog, boven de keuzelijst over de volle breedte', m['fs'] >= 16 and m['dh'] >= 44 and m['sh'] >= 44 and m['boven'] and m['breed'], m)
        pg.select_option('[data-kansfase="k16"]', 'lead'); pg.wait_for_selector('#toast.aan [data-toastactie="1"]'); pg.wait_for_timeout(400)
        t = pg.evaluate("(function () { var t = document.getElementById('toast').getBoundingClientRect(), k = [].map.call(document.querySelectorAll('#toast [data-toastactie]'), function (b) { var r = b.getBoundingClientRect(); return [r.left, r.right, r.height]; }); return { l: t.left, r: t.right, k: k, w: innerWidth }; })()")
        ok('telefoon: de melding met twee knoppen past op 390 px, knoppen 44 px', t['l'] >= 0 and t['r'] <= t['w'] and len(t['k']) == 2 and all(x[2] >= 44 and x[0] >= 0 and x[1] <= t['w'] for x in t['k']), t)
        pg.click('#toast.aan [data-toastactie="0"]'); pg.wait_for_timeout(800)
        pg.click('nav button[data-view="relaties"]'); pg.wait_for_timeout(300); pg.click('#crmTabs [data-crmtab="rapport"]'); pg.wait_for_selector('#crmBalk [data-rweergave="week"]')
        pg.click('#crmBalk [data-rweergave="week"]'); pg.wait_for_selector('#crmInhoud .week-kaart')
        ok('telefoon: Week als kaarten zonder horizontale scroll (main is de scrollcontainer, review I8); geen MT op de telefoon', pg.evaluate("document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth") and pg.locator('[data-rweergave="mt"]').count() == 0)
        ok('telefoon: Lars (team van drie) ziet geen teamtotaal maar de uitleg "te klein team" (review P5)', pg.locator('#crmInhoud .week-kaart.team').count() == 0 and pg.locator('#crmInhoud .week-teamuitleg').count() == 1)
        hs = pg.evaluate("[].map.call(document.querySelectorAll('#crmInhoud .legenda-defs summary'), function (x) { return x.getBoundingClientRect().height; })")
        ok('telefoon: de uitklapregel Definities is minstens 44 px hoog (review I8)', hs and all(x >= 44 for x in hs), hs)
        h = pg.evaluate("[].map.call(document.querySelectorAll('#crmBalk [data-rweergave], #crmBalk [data-defs]'), function (b) { return b.getBoundingClientRect().height; })")
        ok('telefoon: de chips Week en Definities zijn minstens 36 px hoog', h and all(x >= 36 for x in h), h)
        pg.click('#crmBalk [data-rweergave="teams"]'); pg.wait_for_selector('#crmInhoud .tabel, #crmInhoud .tegel')
        pg.wait_for_selector('#dqBlok', timeout=8000); hd = pg.evaluate("[].map.call(document.querySelectorAll('#crmInhoud .dq-eigenaar summary, #crmInhoud .legenda-defs summary'), function (x) { return x.getBoundingClientRect().height; })")
        ok('telefoon: de uitklapregels in Datakwaliteit (per eigenaar, Alle contracten) zijn minstens 44 px hoog (review I8)', hd and all(x >= 44 for x in hd), hd)
    stap('g5_telefoon', g5_telefoon)
    c.close()

    # ===== 4. iPad in landschap (1180×820, touch, review I3): body.desk met (hover: none) heeft tikdoelen als op de telefoon =====
    c = b.new_context(viewport={'width': 1180, 'height': 820}, is_mobile=True, has_touch=True)
    pg = c.new_page(); pg.on('pageerror', lambda e: pageerrors.append('ipad: ' + str(e))); pg.on('dialog', dialoog)
    pg.goto(U + 'sophie'); pg.wait_for_selector('#zijbalk'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(500); pg.evaluate(VOLG)
    def g5_ipad():
        ok('ipad: desktopweergave met (hover: none)', pg.evaluate("document.body.classList.contains('desk') && matchMedia('(hover: none)').matches"))
        detail('kans:k9'); m = pg.evaluate("[].map.call(document.querySelectorAll('.fasewissel-rij input[type=date], .fasewissel-rij select'), function (x) { return x.getBoundingClientRect().height; })")
        ok('ipad: datumveld en keuzelijst van de wissel minstens 44 px', len(m) == 2 and all(x >= 44 for x in m), m)
        pb = pg.evaluate("[].map.call(document.querySelectorAll('.fw-regel .t-bewerk'), function (x) { var r = x.getBoundingClientRect(); return Math.min(r.width, r.height); })")
        ok('ipad: het potlood naast een wissel minstens 44 × 44 px (iOS-review)', pb and all(x >= 44 for x in pb), pb)
        pg.select_option('[data-kansfase="k9"]', 'gesprek'); pg.wait_for_selector('#toast.aan [data-toastactie="1"]'); pg.wait_for_timeout(300)
        t = pg.evaluate("[].map.call(document.querySelectorAll('#toast [data-toastactie]'), function (x) { return x.getBoundingClientRect().height; })")
        ok('ipad: Ongedaan maken en Andere datum in de melding minstens 44 px', len(t) == 2 and all(x >= 44 for x in t), t)
        pg.click('#toast.aan [data-toastactie="0"]'); pg.wait_for_timeout(800)
        desk('rapporten', '#crmBalk [data-rweergave="mt"]'); pg.click('#crmBalk [data-rweergave="mt"]'); pg.wait_for_selector('.mt .mt-blok')
        k = pg.evaluate("[].map.call(document.querySelectorAll('.mt-kop .knop, .mt-kop select'), function (x) { return x.getBoundingClientRect().height; })")
        ch = pg.evaluate("[].map.call(document.querySelectorAll('#crmBalk [data-rweergave], #crmBalk [data-defs]'), function (x) { return x.getBoundingClientRect().height; })")
        ok('ipad: MT-kop (Afdrukken, Tussenstand, Link, Stand) minstens 44 px; chips Teams, Week, MT en Definities minstens 36 px', k and all(x >= 44 for x in k) and ch and all(x >= 36 for x in ch), [k, ch])
        pg.click('#crmBalk [data-rweergave="teams"]'); pg.wait_for_selector('#dqBlok', timeout=8000); pg.evaluate("document.querySelectorAll('#crmInhoud .dq-eigenaar').forEach(function (d) { d.open = true; })"); pg.wait_for_timeout(200)
        hd = pg.evaluate("[].map.call(document.querySelectorAll('#crmInhoud .dq-eigenaar summary, #crmInhoud .legenda-defs summary, #crmInhoud .dq-regel[data-crm-open]'), function (x) { return x.getBoundingClientRect().height; })")
        ok('ipad: uitklapregels en doorklikregels in Datakwaliteit minstens 44 px (iOS-review)', hd and all(x >= 44 for x in hd), hd)
        # v7.9.1 (review r2, R2): de stap fasen van de overstap: keuzelijsten, besluitdatum en Proefdraaien/Toepassen minstens 44 px
        pg.evaluate("beheerOverstap()"); venster_open('[data-v79="fasen:proef"]'); pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#venster [data-v79fase]')
        hv = pg.evaluate("[].map.call(document.querySelectorAll('#venster [data-v79fase], #v79-besluitdatum, #v79Lijst .v79-stap .balk .knop'), function (x) { return Math.round(x.getBoundingClientRect().height); })")
        ok('ipad: in de stap fasen zijn keuzelijsten, besluitdatum en de knoppen Proefdraaien en Toepassen minstens 44 px (review r2, R2)', len(hv) >= 4 + 1 + 2 and all(x >= 44 for x in hv), hv)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_ipad', g5_ipad)
    # v7.9.3 (review r2, iOS-N1): het winformulier en het verlorenvenster op de iPad: alle velden en knoppen 44 px; een fout staat onder het veld, niet als melding over de sheet
    def g5_ipad_win_verloren():
        def hoogtes(): return pg.evaluate("[].map.call(document.querySelectorAll('#venster .veld input:not([type=checkbox]), #venster .veld select, #venster .knop'), function (x) { return [x.id || x.textContent, Math.round(x.getBoundingClientRect().height)]; })")
        detail('kans:k9'); pg.select_option('[data-kansfase="k9"]', 'gewonnen'); venster_open('#vf-contractwaarde'); h = hoogtes()
        ok('ipad (r2, iOS-N1): in het winformulier alle velden en knoppen minstens 44 px', len(h) >= 8 and all(x[1] >= 44 for x in h), h)
        pg.tap('#venster [data-cf-opslaan]'); ok('ipad (r2, iOS-N1): zonder contractwaarde de fout onder het veld, geen melding over de sheet', vfout('getekende contractwaarde', 'contractwaarde'))
        pg.tap('#venster [data-cf-annuleer]'); venster_dicht(); pg.wait_for_timeout(600)
        pg.select_option('[data-kansfase="k9"]', 'verloren'); venster_open('#vf-verliesReden'); h = hoogtes()
        ok('ipad (r2, iOS-N1): in het verlorenvenster alle velden en knoppen minstens 44 px', len(h) >= 4 and all(x[1] >= 44 for x in h), h)
        pg.tap('#venster [data-cf-opslaan]'); ok('ipad (r2, iOS-N1): zonder reden de fout onder de keuzelijst', vfout('Kies een reden', 'verliesReden'))
        pg.tap('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_ipad_win_verloren', g5_ipad_win_verloren)
    c.close()

    # ===== 5. v7.9.1: Fasen zoals Capsule (Sophie, verse demo): proefdraai met een keuze per mijlpaal, toepassen met koppeling, onderbouwing en besluitdatum =====
    c, pg = nieuw(b, 'sophie')
    def g5_fasen():
        desk('rapporten', '#crmInhoud [data-beheer="v79"]'); pg.click('[data-beheer="v79"]'); venster_open('[data-v79="fasen:proef"]')
        ok('fasen: de stap Fasen zoals Capsule staat bovenaan, vóór de rollen', pg.evaluate("(function () { var f = document.querySelector('[data-v79=\"fasen:proef\"]'), r = document.querySelector('[data-v79=\"rollen:proef\"]'); return !!(f && r && (f.compareDocumentPosition(r) & 4)); })()") and 'nog niet overgenomen' in pg.inner_text('#v79Lijst'))
        ok('fasen: Toepassen kan pas na de proefdraai', pg.is_disabled('[data-v79="fasen:toepassen"]'))
        pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#venster [data-v79fase]')
        v = pg.evaluate("[].map.call(document.querySelectorAll('#venster [data-v79fase]'), function (s) { return [s.getAttribute('data-v79fase'), s.value, s.getAttribute('aria-label'), s.options.length]; })")
        ok('fasen: per mijlpaal een keuzelijst met label en zeven fasen (v7.9.2: met 5b) plus "kies een fase", voorgevuld (lead 1, gesprek 3, voorstel 5, onderhandeling 5)', [x[0] + '=' + x[1] for x in v] == ['scholen-lead=1', 'scholen-gesprek=3', 'scholen-voorstel=5', 'scholen-onderhandeling=5'] and all(x[2] and 'Fase in Capsule' in x[2] and x[3] == 8 for x in v), v)
        ok('fasen: fase 6 is deal/lopend traject (gewonnen)', 'deal/lopend traject (gewonnen)' in pg.inner_text('#venster [data-v79fase="scholen-lead"]'))
        # v7.9.1 (review r5, A1): na de proefdraai staat de focus op de titel van de stap; Tab en Shift+Tab blijven daarvandaan binnen het venster
        ok('fasen: na Proefdraaien heeft de titel van de stap de focus (review r4/r5)', pg.evaluate("(function () { var a = document.activeElement; return !!(a && a.classList.contains('r-titel') && a.closest('#v79stap-fasen')); })()"))
        pg.keyboard.press('Shift+Tab')
        ok('fasen: Shift+Tab vanaf de titel blijft in het venster (review r5, A1)', pg.evaluate("(function () { var a = document.activeElement; return !!(a && document.getElementById('venster').contains(a) && a !== document.getElementById('vensterInhoud')); })()"))
        pg.evaluate("document.querySelector('#v79stap-fasen .r-titel').focus()"); pg.keyboard.press('Tab')
        ok('fasen: Tab vanaf de titel gaat naar het eerste veld van de stap (review r5, A1)', pg.evaluate("(function () { var a = document.activeElement; return !!(a && a.matches('[data-v79fase]') && a.closest('#v79stap-fasen')); })()"))
        ok('fasen: onderbouwing en besluitdatum voorgevuld', 'Capsule' in pg.input_value('#v79-onderbouwing') and pg.input_value('#v79-besluitdatum') == dag(0))
        # v7.9.1 (review r2, F8): fase 6 voor onderhandeling: de melding wat er met de open kans gebeurt, en het vinkje voor de deal die in Athena naar die fase is gezet
        pg.select_option('#venster [data-v79fase="scholen-onderhandeling"]', '6'); pg.wait_for_selector('#v79-deal #v79-dealdatum'); pg.wait_for_selector('[data-v79="fasen:proef"]:not([disabled])')  # r2 (C-N3): de proefdraai die de keuze opnieuw draait
        ok('fasen: bij fase 6 zegt de stap dat de open kans gewonnen wordt en biedt hij het vinkje "vastleggen als deal op die datum" (F8)', '1 open kans wordt gewonnen' in pg.inner_text('#v79-deal') and 'vast als deal' in pg.inner_text('#v79-deal') and not pg.is_checked('#v79-dealdatum'), pg.inner_text('#v79-deal'))
        # R1: keuzes overleven het hertekenen door de proefdraai van een andere stap
        pg.check('#v79-dealdatum'); pg.fill('#v79-onderbouwing', 'Eigen onderbouwing (golf5 R1)'); pg.fill('#v79-besluitdatum', dag(-1))
        pg.click('[data-v79="kansen:proef"]'); pg.wait_for_selector('#v79Lijst .r-meta:has-text("Proefdraai")')
        ok('fasen: na de proefdraai van een andere stap staan de gekozen fase, het vinkje, de onderbouwing en de besluitdatum er nog (review r2, R1)',
           pg.input_value('#venster [data-v79fase="scholen-onderhandeling"]') == '6' and pg.is_checked('#v79-dealdatum') and pg.input_value('#v79-onderbouwing') == 'Eigen onderbouwing (golf5 R1)' and pg.input_value('#v79-besluitdatum') == dag(-1),
           [pg.input_value('#venster [data-v79fase="scholen-onderhandeling"]'), pg.input_value('#v79-onderbouwing'), pg.input_value('#v79-besluitdatum')])
        n0 = n_calls(); pg.click('[data-v79="fasen:proef"]'); pg.wait_for_function("(window.__calls || []).length > %d" % n0); pg.wait_for_selector('#venster [data-v79fase]'); pg.wait_for_timeout(300)
        a = (calls('apiMigratieV79', n0) or [{'args': ['', {}]}])[0]['args']
        ok('fasen: een nieuwe proefdraai stuurt de gekozen fasen mee (herzien telt met de keuze) en houdt de keuzes', a[0] == 'fasen' and (a[1].get('koppeling') or {}).get('scholen-onderhandeling') == '6' and not a[1].get('toepassen') and pg.input_value('#venster [data-v79fase="scholen-onderhandeling"]') == '6', a)
        pg.select_option('#venster [data-v79fase="scholen-onderhandeling"]', ''); pg.click('[data-v79="kansen:proef"]'); pg.wait_for_timeout(600)
        ok('fasen: een bewust lege keuze blijft leeg na hertekenen (geen voorstel terug)', pg.input_value('#venster [data-v79fase="scholen-onderhandeling"]') == '')
        pg.fill('#v79-besluitdatum', dag(0))
        n0 = n_calls(); pg.click('[data-v79="fasen:toepassen"]'); toast('Kies voor elke mijlpaal')
        ok('fasen: een mijlpaal zonder fase geeft een melding en geen aanroep', not calls('apiMigratieV79', n0))
        pg.select_option('#venster [data-v79fase="scholen-onderhandeling"]', '5'); pg.fill('#v79-onderbouwing', 'Rekenmodel van het MT-rapport (golf5)')
        n0 = n_calls(); pg.click('[data-v79="fasen:toepassen"]'); toast('fasen van Capsule'); pg.wait_for_selector('#v79Lijst:has-text("staat zo")')
        a = (calls('apiMigratieV79', n0) or [{'args': ['', {}]}])[0]['args']
        ok('fasen: Toepassen stuurt de koppeling, de onderbouwing en de besluitdatum (zonder fase 6 geen dealDatum)', a[0] == 'fasen' and a[1].get('toepassen') is True and a[1].get('koppeling') == {'scholen-lead': '1', 'scholen-gesprek': '3', 'scholen-voorstel': '5', 'scholen-onderhandeling': '5'} and a[1].get('onderbouwing') == 'Rekenmodel van het MT-rapport (golf5)' and a[1].get('besluitdatum') == dag(0) and 'dealDatum' not in a[1], a)
        ok('fasen: daarna laadt de status opnieuw (staat zo)', any(x['args'][0] == 'status' for x in calls('apiMigratieV79', n0)))
        ms = [m for m in api('apiCrm')['mijlpalen'] if m['pipeline'] == 'Scholen']
        ok('fasen: de pipeline Scholen heeft de zes open fasen (v7.9.2: met 5b bijna rond) met rollen', [m['mijlpaal'] for m in ms] == ['1. nog niet gebeld', '2. pre-ap', '3. ap (appointment planned)', '4. ad (appointment done)', '5. vo (voorstel / offerte)', '5b. bijna rond'] and [m['rol'] for m in ms] == ['lead', '', 'ap', 'ad', 'voorstel', ''] and [m['vraagtStart'] for m in ms] == [False] * 5 + [True], ms)
        ok('fasen: een open kans in gesprek staat nu in 3. ap', kans('k8')['kans']['fase'] == '3. ap (appointment planned)')
        f = [x for x in api('apiAannames')['aannames'] if x['naam'] == 'fasegewichten'][0]; ok('fasen: de gewichten zijn een versie van fasegewichten met de onderbouwing', f['huidig'] and 'golf5' in f['huidig']['onderbouwing'], f['huidig'])
        pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#v79Lijst .hint:has-text("al")')
        ok('fasen: een tweede proefdraai zegt dat het al zo staat; Toepassen blijft uit', pg.locator('#venster [data-v79fase]').count() == 0 and pg.is_disabled('[data-v79="fasen:toepassen"]'))
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        pipeline(); ok('fasen: het bord toont de kolommen van Capsule', pg.locator('.bord [data-sleepdoel="kans:2. pre-ap"]').count() == 1 and pg.locator('.bord [data-sleepdoel="kans:5. vo (voorstel / offerte)"]').count() == 1)
        # v7.9.3 (C-R1): na een eerdere keer blijft een in Beheer hernoemde fase staan ("staat zo"); twee mijlpalen voor één fase zijn een signaal in de proefdraai
        def scholen(): return [{'pipeline': m['pipeline'], 'mijlpaal': m['mijlpaal'], 'kans': m['kans'], 'dagenNorm': m['dagenNorm'], 'rol': m['rol'], 'vraagtStart': m['vraagtStart']} for m in api('apiCrm')['mijlpalen']]
        ms = scholen(); vo = [m for m in ms if m['mijlpaal'] == '5. vo (voorstel / offerte)'][0]
        vo['oud'] = {'pipeline': 'Scholen', 'mijlpaal': vo['mijlpaal']}; vo['mijlpaal'] = '5. offerte'; vo['kans'] = 65
        api('apiMijlpalenOpslaan', ms, {'onderbouwing': 'golf5 C-R1 (verzonnen)', 'besluitdatum': dag(0)})
        pg.evaluate("beheerOverstap()"); venster_open('[data-v79="fasen:proef"]'); pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#v79Lijst .hint:has-text("al")')
        ok('fasen (v7.9.3 C-R1): na een hernoeming in Beheer ("5. offerte", 65 %) staat de stap nog zo; Toepassen blijft uit', 'staat zo' in pg.inner_text('#v79stap-fasen .r-titel') and pg.is_disabled('[data-v79="fasen:toepassen"]') and pg.locator('#v79-dubbel').count() == 0)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        api('apiMijlpalenOpslaan', scholen() + [{'pipeline': 'Scholen', 'mijlpaal': 'onderhandeling', 'kans': 80, 'dagenNorm': 7, 'rol': '', 'vraagtStart': False}], {'onderbouwing': 'golf5 C-R1 dubbel (verzonnen)', 'besluitdatum': dag(0)})
        pg.evaluate("beheerOverstap()"); venster_open('[data-v79="fasen:proef"]'); pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#v79-dubbel')
        ok('fasen (v7.9.3 C-R1): twee mijlpalen voor fase 5 staan als signaal in de proefdraai', 'fase 5: 2 mijlpalen' in pg.inner_text('#v79-dubbel') and 'rekenmodel' in pg.inner_text('#v79-dubbel'), pg.inner_text('#v79-dubbel'))
        n0 = n_calls(); pg.select_option('#venster [data-v79fase][aria-label="Fase in Capsule voor onderhandeling"]', '5b'); pg.click('[data-v79="fasen:proef"]')
        pg.wait_for_function("(window.__calls || []).length > %d" % n0); pg.wait_for_selector('#venster [data-v79fase]'); pg.wait_for_timeout(300)
        ok('fasen (v7.9.3 C-R1): kiest de beheerder voor één ervan een andere fase, dan is het signaal weg', pg.locator('#v79-dubbel').count() == 0)
        # v7.9.3 (review r1): de proefdraai noemt wat verdwijnt (5b staat er al, dus "onderhandeling" gaat op in "5b. bijna rond") en een eigen rij die een fase wordt
        ok('fasen (v7.9.3 r1): de proefdraai noemt de rij die verdwijnt', pg.locator('#v79-nieuw').count() == 1 and 'Verdwijnt: onderhandeling' in pg.inner_text('#v79-nieuw'), pg.inner_text('#v79-nieuw') if pg.locator('#v79-nieuw').count() else '')
        hv = pg.evaluate("fasenGewichtenHtml({ overgenomen: [{ fase: '5b', mijlpaal: 'mondeling akkoord', vraagtStart: true }], nieuw: [], weg: [], gewichten: [] })")
        ok('fasen (v7.9.3 r1, C-R1-5b): een eigen rij die 5b wordt, staat als signaal met de startdatum', 'id="v79-overgenomen"' in hv and '"mondeling akkoord" wordt fase 5b en vraagt dan een startdatum' in hv.replace('&quot;', '"'), hv)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_fasen', g5_fasen)
    c.close()

    # ===== 5b. v7.9.1 (review r3): de signalen in de overstap: een eerder gewonnen kans in fase 6 (F1), een rol die niet bij de naam past (R4) =====
    c, pg = nieuw(b, 'sophie')
    def g5_fasen_r3():
        g1 = kans('k1')['kans']['gesloten']
        api('apiKansOpslaan', {'id': 'k1', 'fase': 'onderhandeling', '_oud': {'fase': 'gewonnen'}})
        ms = [{'pipeline': m['pipeline'], 'mijlpaal': m['mijlpaal'], 'kans': m['kans'], 'dagenNorm': m['dagenNorm'], 'rol': m['rol']} for m in api('apiCrm')['mijlpalen']]
        ms += [{'pipeline': 'Besturen', 'mijlpaal': 'intake', 'kans': 10, 'dagenNorm': 14, 'rol': 'lead'}, {'pipeline': 'Besturen', 'mijlpaal': 'gesprek', 'kans': 30, 'dagenNorm': 10, 'rol': 'ap'}, {'pipeline': 'Besturen', 'mijlpaal': 'voorstel', 'kans': 50, 'dagenNorm': 10, 'rol': 'ad'}]
        api('apiMijlpalenOpslaan', ms, {'onderbouwing': 'golf5 r3 (verzonnen)', 'besluitdatum': dag(0)})
        desk('rapporten', '#crmInhoud [data-beheer="v79"]'); pg.click('[data-beheer="v79"]'); venster_open('[data-v79="fasen:proef"]')
        ok('r3: de status van Rollen noemt een rol die niet bij de naam past (R4)', '1 rol past niet bij de naam' in pg.inner_text('#v79Lijst'), pg.inner_text('#v79Lijst')[:300])
        pg.click('[data-v79="rollen:proef"]'); pg.wait_for_selector('#v79-rolafwijkend')
        ok('r3: de proefdraai van Rollen toont het signaal met het voorstel (Besturen · voorstel heeft ad, op naam voorstel) en laat Beheer → Mijlpalen het rechtzetten', 'Besturen · voorstel heeft ad, op naam voorstel' in pg.inner_text('#v79-rolafwijkend') and 'Beheer → Mijlpalen' in pg.inner_text('#v79-rolafwijkend'))
        pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#venster [data-v79fase]')
        pg.select_option('#venster [data-v79fase="scholen-onderhandeling"]', '6'); pg.wait_for_selector('#v79-deal .hint'); pg.wait_for_selector('[data-v79="fasen:proef"]:not([disabled])')
        ok('r3: bij fase 6 noemt de stap de kans die eerder gewonnen was (telt weer als deal, F1)', '1 daarvan was eerder gewonnen en telt weer als deal' in pg.inner_text('#v79-deal') and 'Datakwaliteit' in pg.inner_text('#v79-deal'), pg.inner_text('#v79-deal'))
        n0 = n_calls(); pg.click('[data-v79="fasen:toepassen"]'); toast('eerder gewonnen'); pg.wait_for_selector('#v79Lijst:has-text("staat zo")')
        k1 = kans('k1')['kans']
        ok('r3: na toepassen is k1 gewonnen met gesloten = de datum van de eerdere winst (N8), en de melding noemt hem', k1['fase'] == 'gewonnen' and g1 and k1['gesloten'] == g1, [k1['fase'], k1['gesloten'], g1])
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_fasen_r3', g5_fasen_r3)
    c.close()

    # ===== 6. v7.9.1: de stap fasen op de telefoon (390 px): keuzelijsten 44 px en 16 px, geen horizontale scroll in het venster =====
    c, pg = nieuw(b, 'sophie', tel=True)
    def g5_fasen_telefoon():
        pg.evaluate("beheerOverstap()"); venster_open('[data-v79="fasen:proef"]'); pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#venster [data-v79fase]')
        m = pg.evaluate("[].map.call(document.querySelectorAll('#venster [data-v79fase], #v79-onderbouwing, #v79-besluitdatum'), function (x) { var r = x.getBoundingClientRect(); return [Math.round(r.height), parseFloat(getComputedStyle(x).fontSize)]; })")
        ok('telefoon: keuzelijsten minstens 44 px, alle velden 16 px', len(m) == 6 and all(x[1] >= 16 for x in m) and all(x[0] >= 44 for x in m[:4]), m)
        ok('telefoon: het venster scrolt niet horizontaal', pg.evaluate("(function () { var v = document.getElementById('vensterInhoud'); return v.scrollWidth <= v.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; })()"))
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_fasen_telefoon', g5_fasen_telefoon)
    c.close()

    # ===== 7. v7.9.2: fase 5b bijna rond (Sophie, verse demo, na stap fasen): het startdatumvenster bij de fasekeuze, slepen, ← →, bulk, + Kans en de
    # assistent (annuleren zet terug, zonder aanroep), de start op de kaart en in het kansdetail, het winformulier, het vinkje in Beheer → Mijlpalen =====
    VO, B5, AP = '5. vo (voorstel / offerte)', '5b. bijna rond', '3. ap (appointment planned)'
    def fasen_toepassen():
        pr = api('apiMigratieV79', 'fasen', {}); api('apiMigratieV79', 'fasen', {'toepassen': True, 'koppeling': {m['id']: m['voorstel'] for m in pr['mijlpalen']}})
        pg.evaluate("crmVerouderd(); laadCrmBasis()"); pg.wait_for_timeout(700)
    c, pg = nieuw(b, 'sophie')
    def g5_5b_detail():
        fasen_toepassen(); detail('kans:k6'); n0 = n_calls()
        ok('5b: de keuzelijst in het kansdetail kent 5b bijna rond', pg.locator('[data-kansfase="k6"] option[value="%s"]' % B5).count() == 1)
        pg.select_option('[data-kansfase="k6"]', B5); venster_open('#vf-verwachteStart')
        ok('5b detail: vóór de aanroep het venster "Verwachte startdatum" (verplicht, min vandaag, leeg zonder eerdere datum), zonder Overslaan', not calls('apiKansOpslaan', n0) and pg.inner_text('#vf-formkop') == 'Verwachte startdatum' and
           pg.get_attribute('#vf-verwachteStart', 'min') == dag(0) and pg.input_value('#vf-verwachteStart') == '' and pg.locator('#venster [data-voorstelovers]').count() == 0, pg.inner_text('#vensterInhoud')[:200])
        pg.click('#venster [data-cf-annuleer]'); venster_dicht(); pg.wait_for_timeout(300)
        ok('5b detail: Annuleren zet de keuze terug zonder aanroep; de focus terug op de keuzelijst', pg.input_value('[data-kansfase="k6"]') == VO and not calls('apiKansOpslaan', n0) and pg.evaluate("document.activeElement && document.activeElement.getAttribute('data-kansfase')") == 'k6')
        # v7.9.3 (I-N3): de fout staat in het venster onder het veld (role=alert, aria-invalid, aria-describedby), niet als melding over het veld
        def fout_in_venster(): return pg.evaluate("""(function () { var i = document.getElementById('vf-verwachteStart'), d = (i && i.getAttribute('aria-describedby')) || '', a = d && document.getElementById(d.split(' ')[0]);
          return { invalid: i && i.getAttribute('aria-invalid'), alert: !!(a && a.getAttribute('role') === 'alert' && /verwachte startdatum/.test(a.textContent) && document.getElementById('vensterInhoud').contains(a)),
            onder: !!(a && i && a.getBoundingClientRect().top >= i.getBoundingClientRect().bottom - 1 && a.closest('.veld') === i.closest('.veld')), toast: !!document.querySelector('#toast.aan') && /verwachte startdatum/.test(document.getElementById('toast').textContent) }; })()""")
        pg.select_option('[data-kansfase="k6"]', B5); venster_open('#vf-verwachteStart'); pg.click('#venster [data-cf-opslaan]'); pg.wait_for_timeout(300); f1 = fout_in_venster()
        pg.fill('#vf-verwachteStart', dag(-1)); pg.click('#venster [data-cf-opslaan]'); pg.wait_for_timeout(300); f2 = fout_in_venster()
        ok('5b detail: leeg of in het verleden geeft geen aanroep', not calls('apiKansOpslaan', n0) and pg.locator('#venster.aan').count() == 1)
        ok('5b detail (I-N3): de fout staat onder het veld in het venster (role=alert, aria-invalid, aria-describedby), geen melding over het veld', all(x['invalid'] == 'true' and x['alert'] and x['onder'] and not x['toast'] for x in (f1, f2)), [f1, f2])
        pg.fill('#vf-verwachteStart', dag(12)); pg.click('#venster [data-cf-opslaan]'); toast('Mijlpaal: ' + B5); pg.wait_for_timeout(600)
        a = calls('apiKansOpslaan', n0)
        ok('5b detail: één aanroep met fase, verwachteStart (met _oud) en de wissel (bron detail)', len(a) == 1 and a[0]['args'][0].get('fase') == B5 and a[0]['args'][0].get('verwachteStart') == dag(12) and (a[0]['args'][0].get('_oud') or {}).get('verwachteStart') == '' and (a[0]['args'][0].get('wissel') or {}).get('bron') == 'detail', a)
        ok('5b detail: het kansdetail toont de verwachte start', 'Verwachte start' in pg.inner_text('#crmDetailScherm') and kans('k6')['kans']['verwachteStart'] == dag(12))
        # het bewerkvenster kent het veld; het winformulier neemt de verwachte start over als gewenste startdatum
        pg.click('#crmDetailScherm [data-composer="bewerk"]'); pg.wait_for_selector('#cf-verwachteStart')
        ok('5b detail: het bewerkvenster heeft het veld Verwachte start (datum) met de opgeslagen waarde', pg.get_attribute('#cf-verwachteStart', 'type') == 'date' and pg.input_value('#cf-verwachteStart') == dag(12))
        pg.click('#crmComposer [data-cf-annuleer]'); pg.wait_for_timeout(200)
        pg.select_option('[data-kansfase="k6"]', 'gewonnen'); venster_open('#vf-startdatum')
        ok('5b detail: het winformulier vult de gewenste startdatum in met de verwachte start', pg.input_value('#vf-startdatum') == dag(12))
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_5b_detail', g5_5b_detail)

    def g5_5b_bord():
        pipeline(); n0 = n_calls()
        ok('5b bord: een kolom 5b bijna rond (90%)', pg.locator('.bord [data-sleepdoel="kans:%s"]' % B5).count() == 1 and '90%' in pg.inner_text('.bord [data-sleepdoel="kans:%s"] .k-som' % B5))
        ok('5b bord: de kaart in 5b toont de start', 'start ' in pg.inner_text('[data-sleep="kans:k6"]'), pg.inner_text('[data-sleep="kans:k6"]'))
        ok('5b bord (I-N4): de legenda noemt ook de ontbrekende of verstreken startdatum', 'Rood = langer stil dan de norm van de mijlpaal, of de startdatum ontbreekt of is voorbij.' in pg.inner_text('#crmInhoud'))
        muis('[data-sleep="kans:k10"]', '[data-sleepdoel="kans:%s"]' % B5); venster_open('#vf-verwachteStart')
        ok('5b slepen: het venster vóór de aanroep, de kaart voorlopig in 5b', not calls('apiKansOpslaan', n0) and kol('[data-sleep="kans:k10"]') == 'kans:' + B5)
        pg.keyboard.press('Escape'); venster_dicht(); pg.wait_for_timeout(400)
        ok('5b slepen: Escape zet de kaart terug zonder aanroep', kol('[data-sleep="kans:k10"]') == 'kans:' + VO and not calls('apiKansOpslaan', n0))
        pg.locator('[data-sleep="kans:k10"]').focus(); pg.keyboard.press('ArrowRight'); venster_open('#vf-verwachteStart')
        ok('5b ← →: een pijltoets naar 5b opent hetzelfde venster (de focus in het venster)', not calls('apiKansOpslaan', n0) and pg.evaluate("document.getElementById('venster').contains(document.activeElement)"))
        pg.fill('#vf-verwachteStart', dag(20)); pg.click('#venster [data-cf-opslaan]'); pg.wait_for_selector('#toast.aan:has-text("→ %s")' % B5); pg.wait_for_timeout(500)
        a = calls('apiKansOpslaan', n0)
        ok('5b ← →: één aanroep met verwachteStart en bron toets; de focus op de kaart in 5b', len(a) == 1 and a[0]['args'][0].get('verwachteStart') == dag(20) and (a[0]['args'][0].get('wissel') or {}).get('bron') == 'toets' and kol('[data-sleep="kans:k10"]') == 'kans:' + B5 and
           pg.evaluate("document.activeElement && document.activeElement.getAttribute('data-sleep')") == 'kans:k10', a)
        n1 = n_calls(); muis('[data-sleep="kans:k7"]', '[data-sleepdoel="kans:%s"]' % B5); venster_open('#vf-verwachteStart'); pg.fill('#vf-verwachteStart', dag(0)); pg.click('#venster [data-cf-opslaan]')
        pg.wait_for_selector('#toast.aan:has-text("→ %s")' % B5); pg.wait_for_timeout(500); a = calls('apiKansOpslaan', n1)
        ok('5b slepen: vandaag mag; één aanroep met bron slepen', len(a) == 1 and a[0]['args'][0].get('verwachteStart') == dag(0) and (a[0]['args'][0].get('wissel') or {}).get('bron') == 'slepen', a)
        # bulk: één venster (alleen de startdatum) voor de hele selectie; Annuleren verplaatst niets
        n2 = n_calls(); pg.click('[data-sleep="kans:k8"]', modifiers=['Shift']); pg.click('[data-sleep="kans:k11"]', modifiers=['Shift']); pg.wait_for_selector('#selectieBalk.aan [data-bulkveld="kolom"]')
        pg.select_option('#selectieBalk [data-bulkveld="kolom"]', B5); venster_open('#vf-verwachteStart')
        ok('5b bulk: één venster met alleen de startdatum, vóór de aanroepen', not calls('apiKansOpslaan', n2) and pg.locator('#venster [data-cf]').count() == 1)
        pg.click('#venster [data-cf-annuleer]'); toast('Niets verplaatst'); pg.wait_for_timeout(300)
        ok('5b bulk: Annuleren verplaatst niets (geen aanroep)', not calls('apiKansOpslaan', n2) and kol('[data-sleep="kans:k8"]') == 'kans:' + AP and kol('[data-sleep="kans:k11"]') == 'kans:' + AP)
        pg.click('[data-sleep="kans:k8"]', modifiers=['Shift']); pg.click('[data-sleep="kans:k11"]', modifiers=['Shift']); pg.wait_for_selector('#selectieBalk.aan [data-bulkveld="kolom"]')
        pg.select_option('#selectieBalk [data-bulkveld="kolom"]', B5); venster_open('#vf-verwachteStart'); pg.fill('#vf-verwachteStart', dag(30)); pg.click('#venster [data-cf-opslaan]'); toast('verplaatst naar ' + B5, 8000)
        a = calls('apiKansOpslaan', n2)
        ok('5b bulk: één datum voor de hele selectie, bron bulk', len(a) == 2 and all(x['args'][0].get('verwachteStart') == dag(30) and (x['args'][0].get('wissel') or {}).get('bron') == 'bulk' for x in a), a)
    stap('g5_5b_bord', g5_5b_bord)

    def g5_5b_aanmaken():
        pipeline(); pg.click('#deskActies [data-crmnieuw="kans"]'); pg.wait_for_selector('#crmNieuw #cf-fase')
        pg.fill('#cf-naam', 'Bijna rond golf5'); pg.select_option('#cf-schoolId', 's1'); pg.select_option('#cf-fase', B5); pg.fill('#cf-waarde', '7000'); n0 = n_calls()
        pg.click('#crmNieuw [data-cf-opslaan]'); venster_open('#vf-verwachteStart')
        ok('5b + Kans: in 5b eerst het startdatumvenster, nog geen aanroep', not calls('apiKansOpslaan', n0))
        pg.fill('#vf-verwachteStart', dag(5)); pg.click('#venster [data-cf-opslaan]'); toast('Kans aangemaakt'); pg.wait_for_selector('#crmDetailScherm .d-naam h2:has-text("Bijna rond golf5")')
        a = calls('apiKansOpslaan', n0)
        ok('5b + Kans: één aanroep met fase 5b en verwachteStart', len(a) == 1 and a[0]['args'][0].get('fase') == B5 and a[0]['args'][0].get('verwachteStart') == dag(5), a)
    stap('g5_5b_aanmaken', g5_5b_aanmaken)

    def g5_5b_aanmaken_traag():  # v7.9.3 (I-R1): + Kans in 5b met een trage apiKansOpslaan: Opslaan staat uit tot de aanroep klaar is; een tweede tik geeft geen tweede kans
        pg.evaluate(TRAAG); pipeline(); pg.click('#deskActies [data-crmnieuw="kans"]'); pg.wait_for_selector('#crmNieuw #cf-fase')
        pg.fill('#cf-naam', 'Traag golf5'); pg.select_option('#cf-schoolId', 's1'); pg.select_option('#cf-fase', B5); n0 = n_calls()
        pg.click('#crmNieuw [data-cf-opslaan]'); venster_open('#vf-verwachteStart'); pg.click('#venster [data-cf-annuleer]'); venster_dicht(); pg.wait_for_timeout(300)
        ok('5b + Kans (I-R1): na Annuleren staat Opslaan weer aan en heeft hij de focus; geen aanroep', not pg.is_disabled('#crmNieuw [data-cf-opslaan]') and pg.evaluate("document.activeElement === document.querySelector('#crmNieuw [data-cf-opslaan]')") and not calls('apiKansOpslaan', n0))
        pg.evaluate("window.__traag.apiKansOpslaan = 2500")
        pg.click('#crmNieuw [data-cf-opslaan]'); venster_open('#vf-verwachteStart'); pg.fill('#vf-verwachteStart', dag(4)); pg.click('#venster [data-cf-opslaan]'); venster_dicht()
        uit = pg.is_disabled('#crmNieuw [data-cf-opslaan]')
        pg.evaluate("document.querySelector('#crmNieuw [data-cf-opslaan]').click()"); pg.wait_for_timeout(300)  # de tweede tik terwijl de aanroep loopt
        if pg.locator('#venster.aan #vf-verwachteStart').count(): pg.fill('#vf-verwachteStart', dag(4)); pg.click('#venster [data-cf-opslaan]')  # vóór v7.9.3: een tweede venster en een tweede aanroep
        pg.wait_for_selector('#crmDetailScherm .d-naam h2:has-text("Traag golf5")', timeout=10000); pg.wait_for_timeout(3000); pg.evaluate("window.__traag = {}")
        n = len([k for k in api('apiPipeline')['kansen'] if k['naam'] == 'Traag golf5'])
        ok('5b + Kans (I-R1): tijdens de trage aanroep staat Opslaan uit; een tweede tik geeft één aanroep en één kans', uit and len(calls('apiKansOpslaan', n0)) == 1 and n == 1, [uit, len(calls('apiKansOpslaan', n0)), n])
    stap('g5_5b_aanmaken_traag', g5_5b_aanmaken_traag)

    def g5_5b_assistent():
        pg.evaluate("""(function () { S.chat.push({ rol: 'bot', tekst: 'Voorstel', acties: [{ id: 'g5b', soort: 'wijzig_kans', titel: 'Kans bijwerken', invoer: { kansId: 'k16', fase: '%s' } }] }); saveChat(); })()""" % B5)
        desk('brein', '#breinBerichten .actiekaart'); kaart = pg.locator('.actiekaart').last; n0 = n_calls()
        kaart.locator('[data-ak="uitvoeren"]').click(); venster_open('#vf-verwachteStart')
        ok('5b assistent: Uitvoeren naar 5b opent eerst het startdatumvenster', not calls('apiBreinUitvoeren', n0))
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        ok('5b assistent: Annuleren voert niets uit', not calls('apiBreinUitvoeren', n0) and pg.locator('.actiekaart').last.locator('[data-ak="uitvoeren"]').count() == 1)
        pg.locator('.actiekaart').last.locator('[data-ak="uitvoeren"]').click(); venster_open('#vf-verwachteStart'); pg.fill('#vf-verwachteStart', dag(9)); pg.click('#venster [data-cf-opslaan]')
        pg.wait_for_selector('.actiekaart.uitgevoerd:has-text("Verwachte start")', timeout=8000); a = calls('apiBreinUitvoeren', n0)
        l = wissels('k16')
        ok('5b assistent: één aanroep met verwachteStart; de wissel naar 5b heeft bron assistent', len(a) == 1 and a[0]['args'][0]['invoer'].get('verwachteStart') == dag(9) and l[-1]['naar'] == B5 and l[-1]['bron'] == 'assistent' and kans('k16')['kans']['verwachteStart'] == dag(9), a)
    stap('g5_5b_assistent', g5_5b_assistent)

    def g5_5b_beheer():
        desk('rapporten', '#crmInhoud [data-beheer="mijlpalen"]'); pg.click('[data-beheer="mijlpalen"]'); pg.wait_for_selector('#leMijlpalen .le-vink')
        v = pg.evaluate("[].map.call(document.querySelectorAll('#leMijlpalen .le-rij'), function (r) { var x = r.querySelector('[data-le=\"vraagtStart\"]'), l = r.querySelector('.le-vink'); return [r.querySelector('[data-le=\"mijlpaal\"]').value, !!(x && x.checked), l ? Math.round(l.getBoundingClientRect().height) : 0]; })")
        ok('5b beheer: per mijlpaal een vinkje Vraagt startdatum (44 px), alleen 5b aangevinkt', len(v) == 6 and [x[0] for x in v if x[1]] == [B5] and all(x[2] >= 44 for x in v), v)
        # v7.9.3 (I-N5): het vinkje heeft de mijlpaal in zijn toegankelijke naam (VoiceOver las zes keer "Vraagt startdatum"), ook na hernoemen
        def vink_namen(): return [l.strip() for l in pg.locator('#leMijlpalen').aria_snapshot().split('\n') if 'checkbox' in l]
        nm = vink_namen()
        ok('5b beheer (I-N5): elk vinkje heet "Vraagt startdatum" plus de mijlpaal', len(nm) == 6 and all('Vraagt startdatum' in l for l in nm) and any(B5 in l for l in nm) and any('1. nog niet gebeld' in l for l in nm), nm)
        pg.locator('#leMijlpalen .le-rij').nth(5).locator('[data-le="mijlpaal"]').fill('5b. bijna rond (golf5)'); nm2 = vink_namen()
        ok('5b beheer (I-N5): de naam volgt een hernoemde mijlpaal', any('5b. bijna rond (golf5)' in l for l in nm2), nm2)
        # v7.9.3 (review r1): de naam staat als eigen aria-label op het vinkje (WebKit neemt bij aria-labelledby naar het invoerveld diens aria-label "Mijlpaal")
        al = pg.evaluate("[].map.call(document.querySelectorAll('#leMijlpalen .le-rij'), function (r) { var x = r.querySelector('[data-le=\"vraagtStart\"]'); return [x.getAttribute('aria-label'), x.hasAttribute('aria-labelledby'), r.querySelector('[data-le=\"mijlpaal\"]').value]; })")
        ok('5b beheer (I-N5, r1): elk vinkje heeft het aria-label "Vraagt startdatum: <mijlpaal>" (geen aria-labelledby), ook na hernoemen', len(al) == 6 and all(x[0] == 'Vraagt startdatum: ' + x[2] and not x[1] for x in al) and al[5][2] == '5b. bijna rond (golf5)', al)
        pg.locator('#leMijlpalen .le-rij').nth(5).locator('[data-le="mijlpaal"]').fill(B5)
        pg.locator('#leMijlpalen .le-rij').nth(3).locator('[data-le="vraagtStart"]').check(); n0 = n_calls()
        pg.click('#crmBeheer [data-cf-opslaan]'); toast('Mijlpalen opgeslagen'); a = calls('apiMijlpalenOpslaan', n0)
        ok('5b beheer: Opslaan stuurt vraagtStart per mijlpaal (4. ad erbij); de backend bewaart het', a and [m.get('vraagtStart') for m in a[0]['args'][0]] == [False, False, False, True, False, True] and
           [m['vraagtStart'] for m in api('apiCrm')['mijlpalen'] if m['pipeline'] == 'Scholen'] == [False, False, False, True, False, True], a and [m.get('vraagtStart') for m in a[0]['args'][0]])
    stap('g5_5b_beheer', g5_5b_beheer)
    c.close()

    # ===== 7b. v7.9.3 (review r2, C-N3): verandert de beheerder na een proefdraai een fasekeuze terwijl de onderbouwing nog de tekst van die proefdraai is,
    # dan draait de proefdraai opnieuw met de keuzes (tekst en voorspelling kloppen weer); een zelf aangepaste tekst blijft staan, zonder nieuwe aanroep =====
    c, pg = nieuw(b, 'sophie')
    def g5_fasen_onderbouwing():
        fasen_toepassen()  # dan een in Beheer hernoemde fase 5 plus een extra mijlpaal: twee kandidaten voor fase 5 (dubbel), net als C-R1 in g5_fasen
        ms = [{'pipeline': m['pipeline'], 'mijlpaal': m['mijlpaal'], 'kans': m['kans'], 'dagenNorm': m['dagenNorm'], 'rol': m['rol'], 'vraagtStart': m['vraagtStart']} for m in api('apiCrm')['mijlpalen']]
        vo = [m for m in ms if m['mijlpaal'] == VO][0]; vo['oud'] = {'pipeline': 'Scholen', 'mijlpaal': VO}; vo['mijlpaal'] = '5. offerte'; vo['kans'] = 65
        api('apiMijlpalenOpslaan', ms + [{'pipeline': 'Scholen', 'mijlpaal': 'onderhandeling', 'kans': 80, 'dagenNorm': 7, 'rol': '', 'vraagtStart': False}], {'onderbouwing': 'golf5 C-N3 (verzonnen)', 'besluitdatum': dag(0)})
        pg.evaluate("beheerOverstap()"); venster_open('[data-v79="fasen:proef"]'); pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#v79-dubbel')
        t0 = pg.input_value('#v79-onderbouwing'); sel = '#venster [data-v79fase][aria-label="Fase in Capsule voor onderhandeling"]'
        n0 = n_calls(); pg.select_option(sel, '5b'); pg.wait_for_selector('[data-v79="fasen:proef"]:not([disabled])'); pg.wait_for_timeout(400)
        a = calls('apiMigratieV79', n0); t1 = pg.input_value('#v79-onderbouwing')
        ok('fasen (r2, C-N3): een andere fase na de proefdraai draait de proefdraai opnieuw met de keuze; de onderbouwing volgt (geen fase meer uit het rekenmodel)',
           len(a) == 1 and a[0]['args'][0] == 'fasen' and not a[0]['args'][1].get('toepassen') and list((a[0]['args'][1].get('koppeling') or {}).values()) == ['5b'] and 'twee mijlpalen' in t0 and t1 and 'twee mijlpalen' not in t1 and pg.locator('#v79-dubbel').count() == 0, [a, t0, t1])
        ok('fasen (r2, C-N3): de focus blijft op de keuzelijst', pg.evaluate("(function (s) { return document.activeElement === document.querySelector(s); })(%s)" % json.dumps(sel)))
        pg.fill('#v79-onderbouwing', 'Eigen onderbouwing (golf5 C-N3)'); n1 = n_calls(); pg.select_option(sel, '5'); pg.wait_for_timeout(600)
        ok('fasen (r2, C-N3): een zelf aangepaste onderbouwing blijft staan, zonder nieuwe proefdraai', not calls('apiMigratieV79', n1) and pg.input_value('#v79-onderbouwing') == 'Eigen onderbouwing (golf5 C-N3)')
        # integratie: wie de tekst precies terugzet op die van de proefdraai, krijgt bij een andere keuze de nieuwe tekst (niet de oude, bewaard als keuze)
        # (fase 4 geeft hier dezelfde tekst als 5b; daarna fase 5 = weer twee mijlpalen voor fase 5, dus een andere tekst)
        pg.fill('#v79-onderbouwing', t1); n2 = n_calls()
        for f in ('4', '5'): pg.select_option(sel, f); pg.wait_for_timeout(200); pg.wait_for_selector('[data-v79="fasen:proef"]:not([disabled])'); pg.wait_for_timeout(300)
        t2 = pg.input_value('#v79-onderbouwing'); p2 = pg.evaluate("V79.proef.fasen && V79.proef.fasen.onderbouwing")
        ok('fasen (r2, C-N3): de tekst van de proefdraai teruggezet = geen eigen tekst: een andere keuze geeft een nieuwe proefdraai met de nieuwe tekst', len(calls('apiMigratieV79', n2)) == 2 and t2 == p2 and 'twee mijlpalen' in t2, [len(calls('apiMigratieV79', n2)), t2 == p2, t2[:160]])
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_fasen_onderbouwing', g5_fasen_onderbouwing)
    c.close()

    # ===== 8. v7.9.2: het startdatumvenster en het vinkje op de telefoon (390 px): 16 px, 44 px, geen horizontale scroll =====
    c, pg = nieuw(b, 'sophie', tel=True)
    def g5_5b_telefoon():
        fasen_toepassen(); pg.evaluate("routeHash('kans:k6')"); pg.wait_for_selector('[data-kansfase="k6"]'); pg.wait_for_timeout(400)
        pg.select_option('[data-kansfase="k6"]', B5); venster_open('#vf-verwachteStart')
        m = pg.evaluate("(function () { var i = document.getElementById('vf-verwachteStart'), r = i.getBoundingClientRect(), k = [].map.call(document.querySelectorAll('#venster .balk .knop'), function (b) { return Math.round(b.getBoundingClientRect().height); }); return { fs: parseFloat(getComputedStyle(i).fontSize), h: Math.round(r.height), k: k, x: document.getElementById('vensterInhoud').scrollWidth <= document.getElementById('vensterInhoud').clientWidth + 1 }; })()")
        ok('telefoon: het startdatumveld 16 px en minstens 44 px hoog, knoppen 44 px, geen horizontale scroll', m['fs'] >= 16 and m['h'] >= 44 and m['k'] and all(x >= 44 for x in m['k']) and m['x'], m)
        pg.tap('#venster [data-cf-opslaan]'); pg.wait_for_timeout(400)
        f = pg.evaluate("(function () { var a = document.querySelector('#vensterInhoud [role=alert]'), i = document.getElementById('vf-verwachteStart'), t = document.getElementById('toast'); return { alert: !!(a && /verwachte startdatum/.test(a.textContent) && a.getBoundingClientRect().height > 0), toast: !!(t && t.classList.contains('aan')) && /verwachte startdatum/.test(t.textContent), invalid: i.getAttribute('aria-invalid') }; })()")
        ok('telefoon (I-N3): leeg Opslaan geeft de fout in de sheet onder het veld, geen melding over label en datumveld', f['alert'] and not f['toast'] and f['invalid'] == 'true', f)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        pg.click('nav button[data-view="relaties"]'); pg.wait_for_timeout(300); pg.click('#crmTabs [data-crmtab="rapport"]'); pg.wait_for_selector('[data-beheer="mijlpalen"]')
        pg.click('[data-beheer="mijlpalen"]'); pg.wait_for_selector('#leMijlpalen .le-vink')
        h = pg.evaluate("[].map.call(document.querySelectorAll('#leMijlpalen .le-vink'), function (l) { return Math.round(l.getBoundingClientRect().height); })")
        ok('telefoon: de vinkjes Vraagt startdatum zijn minstens 44 px hoog en de pagina scrolt niet horizontaal', len(h) == 6 and all(x >= 44 for x in h) and pg.evaluate("document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth + 1"), h)
        sc = pg.evaluate("[].map.call(document.querySelectorAll('#leMijlpalen .le-rij.met-vink'), function (r) { var s = getComputedStyle(r); return [parseFloat(s.borderBottomWidth) || 0, parseFloat(s.paddingBottom) || 0]; })")
        ok('telefoon (I-N5): elke regel met een vinkje heeft een zichtbare scheiding (onderrand en ruimte)', len(sc) == 6 and all(x[0] >= 1 and x[1] >= 4 for x in sc), sc)
    stap('g5_5b_telefoon', g5_5b_telefoon)
    # v7.9.3 (review r2, iOS-R2): na een wissel naar 5b staat de melding met Ongedaan maken en Andere datum 8 s; zet je meteen de volgende kans naar 5b, dan
    # ligt de melding niet over het datumveld van het venster (een tik startte anders de knop van de vorige kans), en Ongedaan maken blijft bereikbaar
    def g5_5b_toast_venster():
        pg.evaluate("routeHash('kans:k6')"); pg.wait_for_selector('[data-kansfase="k6"]'); pg.wait_for_timeout(400)
        pg.select_option('[data-kansfase="k6"]', B5); venster_open('#vf-verwachteStart'); pg.fill('#vf-verwachteStart', dag(12)); pg.tap('#venster [data-cf-opslaan]')
        pg.wait_for_selector('#toast.aan [data-toastactie="1"]'); pg.evaluate("routeHash('kans:k10')"); pg.wait_for_selector('[data-kansfase="k10"]'); pg.wait_for_timeout(300)
        pg.select_option('[data-kansfase="k10"]', B5); venster_open('#vf-verwachteStart'); pg.wait_for_timeout(300)
        m = pg.evaluate("""(function () { function midden(e) { var r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); }
          var t = document.getElementById('toast'), v = midden(document.getElementById('vf-verwachteStart')), o = document.querySelector('#toast [data-toastactie="0"]'), om = o && midden(o);
          return { toast: t.classList.contains('aan'), veldVrij: !!v && !t.contains(v), ongedaan: !!(o && om && o.contains(om)) }; })()""")
        ok('telefoon (r2, iOS-R2): met de melding van de vorige wissel in beeld ligt het midden van het datumveld in het venster niet onder de melding; Ongedaan maken blijft bereikbaar', m['toast'] and m['veldVrij'] and m['ongedaan'], m)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_5b_toast_venster', g5_5b_toast_venster)
    c.close()

    # ===== 9. v7.9.2 (review r1, R1): de assistent op de telefoon na een eerder uitgevoerde actie (CRM.basis leeg, geen bord of kansdetail geladen): eerst de
    # basis, dan het startdatumvenster vóór apiBreinUitvoeren; (R2) het startdatumvenster op de iPad in landschap: datumveld en knoppen 44 px =====
    c, pg = nieuw(b, 'sophie', tel=True)
    def g5_5b_assistent_na_actie():
        fasen_toepassen()
        pg.evaluate("""(function () { S.chat.push({ rol: 'bot', tekst: 'Voorstel', acties: [{ id: 'g5w', soort: 'wijzig_kans', titel: 'Waarde bijwerken', invoer: { kansId: 'k8', waarde: 4321 } },
          { id: 'g5s', soort: 'wijzig_kans', titel: 'Bijna rond', invoer: { kansId: 'k16', fase: '%s' } }] }); saveChat(); })()""" % B5)
        pg.click('nav button[data-view="brein"]'); pg.wait_for_selector('#breinBerichten .actiekaart'); pg.wait_for_timeout(300)
        pg.locator('.actiekaart').nth(-2).locator('[data-ak="uitvoeren"]').click(); pg.wait_for_selector('.actiekaart.uitgevoerd', timeout=8000); pg.wait_for_timeout(300)
        ok('5b assistent na een actie: de eerste actie is uitgevoerd en CRM.basis is leeg, zonder bord of kansdetail (de route uit de review)',
           pg.evaluate("CRM.basis === null && !(CRM.pipeline && CRM.pipeline.mijlpalen) && !(CRM.detail && CRM.detail.data && CRM.detail.data.mijlpalen)") and kans('k8')['kans']['waarde'] == 4321)
        # v7.9.3 (I-N2): tijdens het laden van de basis toont de kaart bezig… zonder knoppen (een tweede tik doet niet stil niets); na een fout weer het voorstel
        pg.evaluate(TRAAG); pg.evaluate("window.__faal.apiCrm = 1"); pg.locator('.actiekaart').last.locator('[data-ak="uitvoeren"]').click(); toast('Storing (golf5)'); pg.wait_for_timeout(300)
        k = pg.locator('.actiekaart').last
        ok('5b assistent (I-N2): na een fout bij het laden van de basis staat het voorstel er weer, met Uitvoeren', k.locator('[data-ak="uitvoeren"]').count() == 1 and 'bezig' not in k.inner_text() and pg.locator('#venster.aan').count() == 0, k.inner_text()[:120])
        def focus_uitvoeren(): return pg.locator('.actiekaart').last.evaluate("function (k) { return document.activeElement === k.querySelector('[data-ak=\"uitvoeren\"]'); }")
        ok('5b assistent (r2, iOS-R1): na de fout staat de focus weer op Uitvoeren van dezelfde kaart', focus_uitvoeren(), pg.evaluate("document.activeElement && document.activeElement.outerHTML.slice(0, 80)"))
        pg.evaluate("window.__traag.apiCrm = 1500")
        n0 = n_calls(); pg.locator('.actiekaart').last.locator('[data-ak="uitvoeren"]').click(); pg.wait_for_timeout(300); k = pg.locator('.actiekaart').last
        ok('5b assistent (I-N2): tijdens het laden van de basis toont de kaart bezig… en staan de knoppen uit', 'bezig…' in k.inner_text() and k.locator('[data-ak="uitvoeren"]').count() == 0, k.inner_text()[:120])
        venster_open('#vf-verwachteStart'); pg.evaluate("window.__traag = {}")
        ok('5b assistent na een actie: eerst apiCrm (de mijlpalen), dan het startdatumvenster; nog geen apiBreinUitvoeren', calls('apiCrm', n0) and not calls('apiBreinUitvoeren', n0), [x['fn'] for x in calls(None, n0)])
        pg.click('#venster [data-cf-annuleer]'); venster_dicht(); pg.wait_for_timeout(300)
        ok('5b assistent (r2, iOS-R1): na Annuleren van het venster dat na het laden van de basis opende, staat de focus weer op Uitvoeren (niet op main)', focus_uitvoeren() and not calls('apiBreinUitvoeren', n0), pg.evaluate("document.activeElement && document.activeElement.outerHTML.slice(0, 80)"))
        pg.locator('.actiekaart').last.locator('[data-ak="uitvoeren"]').click(); venster_open('#vf-verwachteStart')
        pg.fill('#vf-verwachteStart', dag(6)); pg.click('#venster [data-cf-opslaan]'); pg.wait_for_selector('.actiekaart.uitgevoerd:has-text("Verwachte start")', timeout=8000)
        a = calls('apiBreinUitvoeren', n0)
        ok('5b assistent na een actie: één aanroep met verwachteStart, geen foutmelding', len(a) == 1 and a[0]['args'][0]['invoer'].get('verwachteStart') == dag(6) and kans('k16')['kans']['verwachteStart'] == dag(6) and
           pg.locator('#toast.aan:has-text("startdatum (vandaag of later)")').count() == 0, a)
    stap('g5_5b_assistent_na_actie', g5_5b_assistent_na_actie)
    c.close()
    c = b.new_context(viewport={'width': 1180, 'height': 820}, is_mobile=True, has_touch=True)
    pg = c.new_page(); pg.on('pageerror', lambda e: pageerrors.append('ipad 5b: ' + str(e))); pg.on('dialog', dialoog)
    pg.goto(U + 'sophie'); pg.wait_for_selector('#zijbalk'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(500); pg.evaluate(VOLG)
    def g5_5b_ipad():
        fasen_toepassen(); detail('kans:k6'); pg.select_option('[data-kansfase="k6"]', B5); venster_open('#vf-verwachteStart')
        m = pg.evaluate("[].map.call(document.querySelectorAll('#vf-verwachteStart, #venster .balk .knop'), function (x) { return Math.round(x.getBoundingClientRect().height); })")
        ok('ipad: in het startdatumvenster het datumveld, Opslaan en Annuleren minstens 44 px (review r1, R2)', pg.evaluate("document.body.classList.contains('desk') && matchMedia('(hover: none)').matches") and len(m) == 3 and all(x >= 44 for x in m), m)
        # v7.9.3 (I-R2): na het venster nooit de focus op de keuzelijst op een touch-apparaat (iOS opent hem dan opnieuw): de naam in de detailkop
        def focus_na(): return pg.evaluate("(function () { var a = document.activeElement; return [a && a.tagName, !!(a && a.closest && a.closest('.d-naam'))]; })()")
        pg.tap('#venster [data-cf-annuleer]'); venster_dicht(); pg.wait_for_timeout(300); f1 = focus_na()
        ok('ipad (I-R2): na Annuleren (tik) staat de focus niet op de keuzelijst maar op de naam in de detailkop', f1[0] != 'SELECT' and f1[1] and pg.input_value('[data-kansfase="k6"]') == '5. vo (voorstel / offerte)', f1)
        pg.select_option('[data-kansfase="k6"]', B5); venster_open('#vf-verwachteStart'); pg.fill('#vf-verwachteStart', dag(3)); pg.tap('#venster [data-cf-opslaan]'); venster_dicht(); f2 = focus_na()
        toast('Mijlpaal: ' + B5); pg.wait_for_timeout(900); f3 = focus_na()
        ok('ipad (I-R2): na Opslaan (tik) ook niet, meteen en na het herladen van het detail', f2[0] != 'SELECT' and f3[0] != 'SELECT', [f2, f3])
        pg.click('#toast.aan [data-toastactie="0"]'); pg.wait_for_timeout(900)
        # v7.9.3 (I-N1): in het gecombineerde venster (tekendatum en startdatum) zijn alle velden 44 px op de iPad, niet alleen het startveld
        k6 = kans('k6')['kans']; api('apiKansOpslaan', {'id': 'k6', 'verwachteSluiting': '', 'waarde': 0, '_oud': {'verwachteSluiting': k6.get('verwachteSluiting') or '', 'waarde': k6.get('waarde')}})
        detail('kans:k6'); pg.select_option('[data-kansfase="k6"]', B5); venster_open('#vf-verwachteSluiting')
        m = pg.evaluate("[].map.call(document.querySelectorAll('#venster .veld input'), function (x) { return [x.id, Math.round(x.getBoundingClientRect().height)]; })")
        ok('ipad (I-N1): in het venster met waarde, tekendatum en startdatum zijn alle velden minstens 44 px', len(m) == 3 and all(x[1] >= 44 for x in m), m)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_5b_ipad', g5_5b_ipad)
    c.close()

    # ===== 10. v7.9.3 (review r3) =====
    # R1: met de melding van een wissel in beeld (Ongedaan maken, Andere datum) ligt hij op de telefoon en de iPad nooit over een titel, label, veld of fout in
    # het venster, ook niet na scrollen in de sheet; Ongedaan maken blijft raakbaar. Per element: naar de bovenkant van de sheet scrollen en de bovenrand prikken.
    BEDEKT = """(function () { var t = document.getElementById('toast'), b = document.getElementById('vensterInhoud'), uit = [];
      [].forEach.call(b.querySelectorAll('#vf-formkop, .veld label, .veld input, .veld select, .veld textarea, #vf-fout'), function (e) {
        try { e.scrollIntoView({ block: 'start' }); } catch (x) {}
        var r = e.getBoundingClientRect(), rb = b.getBoundingClientRect(); if (!r.width || !r.height || r.bottom <= rb.top) return;
        var y = Math.max(r.top, rb.top) + 3;
        [r.left + 4, r.left + r.width / 2, r.right - 4].forEach(function (x) { var h = document.elementFromPoint(x, y); if (h && t.contains(h) && uit.indexOf(e.id || e.textContent) < 0) uit.push(e.id || e.textContent.slice(0, 24)); }); });
      b.scrollTop = 0; var o = t.querySelector('[data-toastactie="0"]'), r0 = o && o.getBoundingClientRect(), h0 = o && document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
      return { toast: t.classList.contains('aan'), bedekt: uit, ongedaan: !!(o && h0 && o.contains(h0)), hoogte: Math.round(t.getBoundingClientRect().height), breed: Math.round(t.getBoundingClientRect().width) }; })()"""
    def melding_dan_win(k, naar):  # een wissel (melding met twee knoppen), dan meteen Gewonnen: het winformulier opent met de melding nog in beeld
        detail('kans:' + k); pg.select_option('[data-kansfase="%s"]' % k, naar); pg.wait_for_selector('#toast.aan [data-toastactie="1"]'); pg.wait_for_timeout(500)
        pg.select_option('[data-kansfase="%s"]' % k, 'gewonnen'); venster_open('#vf-contractwaarde'); pg.wait_for_timeout(300)
    c, pg = nieuw(b, 'sophie', tel=True); pg.set_viewport_size({'width': 375, 'height': 667}); pg.wait_for_timeout(300)
    def g5_r3_melding_telefoon():
        melding_dan_win('k9', 'gesprek'); pg.tap('#venster [data-cf-opslaan]'); pg.wait_for_selector('#vf-fout'); m = pg.evaluate(BEDEKT)
        ok('telefoon 375×667 (r3, R1): de melding met Ongedaan maken en Andere datum ligt over geen titel, label, veld of fout in het winformulier, ook na scrollen; Ongedaan maken raakbaar', m['toast'] and not m['bedekt'] and m['ongedaan'], m)
        ok('telefoon (r3, R1): de knoppen van de melding staan naast elkaar (geen halve breedte)', m['hoogte'] <= 90, m)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_r3_melding_telefoon', g5_r3_melding_telefoon)
    # N1: een fout onder een veld dat buiten de sheet ligt (toetsenbord open: 375×410) schuift in beeld; N2: slaagt de controle maar weigert de backend,
    # dan staat er geen oude veldfout meer (geen aria-invalid onder een ingevuld veld)
    def g5_r3_fout_in_beeld():
        pg.set_viewport_size({'width': 375, 'height': 410}); pg.wait_for_timeout(300); pg.evaluate(TRAAG)
        detail('kans:k7'); pg.select_option('[data-kansfase="k7"]', 'gewonnen'); venster_open('#vf-contractwaarde')
        pg.evaluate("(function (b) { b.scrollTop = b.scrollHeight; })(document.getElementById('vensterInhoud'))"); pg.wait_for_timeout(200)
        pg.evaluate("document.querySelector('#venster [data-cf-opslaan]').click()"); pg.wait_for_selector('#vf-fout'); pg.wait_for_timeout(400)
        m = pg.evaluate("(function () { var f = document.getElementById('vf-fout').getBoundingClientRect(), b = document.getElementById('vensterInhoud').getBoundingClientRect(); return { f: [Math.round(f.top), Math.round(f.bottom)], b: [Math.round(b.top), Math.round(b.bottom)] }; })()")
        ok('telefoon 375×410 (r3, N1): de fout onder de contractwaarde schuift in beeld in de sheet', m['f'][0] >= m['b'][0] and m['f'][1] <= m['b'][1], m)
        pg.fill('#vf-contractwaarde', '1000'); pg.fill('#vf-aantal', '1'); pg.fill('#vf-startdatum', dag(10)); pg.evaluate("window.__faal.apiKansOpslaan = 1")
        pg.evaluate("document.querySelector('#venster [data-cf-opslaan]').click()"); toast('Storing (golf5)'); pg.wait_for_timeout(200)
        m = pg.evaluate("({ fout: !!document.getElementById('vf-fout'), invalid: document.querySelectorAll('#vensterInhoud [aria-invalid]').length, open: document.getElementById('venster').classList.contains('aan') })")
        ok('telefoon (r3, N2): weigert de backend na een geslaagde controle, dan staat de oude veldfout er niet meer (geen aria-invalid)', m['open'] and not m['fout'] and m['invalid'] == 0, m)
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_r3_fout_in_beeld', g5_r3_fout_in_beeld)
    # r4 (IOS4-R1): liggend met het toetsenbord open (844×150, 667×130) is de zichtbare viewport te laag voor de reserve van 104 px boven de sheet; dan geen
    # reserve, zodat label en veld in de sheet passen. Liggend zonder toetsenbord (844×390) blijft de reserve, ook weer na het sluiten van het toetsenbord.
    LIGGEND = """(function () { var i = document.getElementById('vf-contractwaarde'), l = document.querySelector('label[for="vf-contractwaarde"]'), b = document.getElementById('vensterInhoud');
      try { l.scrollIntoView({ block: 'start' }); } catch (x) {}
      var rb = b.getBoundingClientRect(), rl = l.getBoundingClientRect(), ri = i.getBoundingClientRect();
      return { sheet: Math.round(rb.height), zichtbaar: rl.top >= rb.top - 1 && ri.bottom <= rb.bottom + 1 && ri.height > 0, pad: getComputedStyle(document.getElementById('venster')).paddingTop }; })()"""
    def g5_r4_liggend():
        pg.set_viewport_size({'width': 844, 'height': 390}); pg.wait_for_timeout(300)
        detail('kans:k7'); pg.select_option('[data-kansfase="k7"]', 'gewonnen'); venster_open('#vf-contractwaarde'); pg.focus('#vf-contractwaarde')
        m0 = pg.evaluate(LIGGEND)
        pg.set_viewport_size({'width': 844, 'height': 150}); pg.wait_for_timeout(300); m1 = pg.evaluate(LIGGEND)
        ok('telefoon liggend 844×150 met toetsenbord (r4, IOS4-R1): label en veld van de contractwaarde staan in de sheet', m1['zichtbaar'] and m1['sheet'] >= 120, m1)
        pg.set_viewport_size({'width': 667, 'height': 130}); pg.wait_for_timeout(300); m2 = pg.evaluate(LIGGEND)
        ok('telefoon liggend 667×130 met toetsenbord (r4, IOS4-R1): label en veld van de contractwaarde staan in de sheet', m2['zichtbaar'] and m2['sheet'] >= 100, m2)
        pg.set_viewport_size({'width': 844, 'height': 390}); pg.wait_for_timeout(300); m3 = pg.evaluate(LIGGEND)
        ok('telefoon liggend 844×390 zonder toetsenbord (r4, IOS4-R1): de reserve boven de sheet blijft, ook na het sluiten van het toetsenbord', m0['pad'] == '104px' and m3['pad'] == '104px' and m3['zichtbaar'], [m0, m3])
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_r4_liggend', g5_r4_liggend)
    # r5 (IOS5-R1): de reserve boven de sheet is geen achtergrond. Een tik op de melding (zonder knop: pointer-events none; of met knoppen tijdens het vervagen
    # na 8 s) laat het venster met de ingevulde waarde open; een tik tussen de reserve en de sheet sluit het venster nog zoals voorheen.
    PUNT = "(function (s) { var r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })(%s)"
    RESERVE = "(function () { var v = document.getElementById('venster'); return [v.getBoundingClientRect().top + (parseFloat(getComputedStyle(v).paddingTop) || 0), document.getElementById('vensterInhoud').getBoundingClientRect().top]; })()"
    def nog_open(): return pg.evaluate("[document.getElementById('venster').classList.contains('aan'), (document.getElementById('vf-contractwaarde') || {}).value || null]")
    def tik_na_vervagen():  # de melding met knoppen verdwijnt na 8 s; tik meteen daarna (hij vervaagt nog) waar Ongedaan maken stond
        xy = pg.evaluate(PUNT % json.dumps('#toast [data-toastactie="0"]'))
        pg.wait_for_function("!document.getElementById('toast').classList.contains('knop')", timeout=10000, polling=10)
        o = pg.evaluate("getComputedStyle(document.getElementById('toast')).opacity"); pg.touchscreen.tap(xy[0], xy[1]); pg.wait_for_timeout(400)
        return [round(xy[1]), o]
    def g5_r5_tik_melding():
        pg.set_viewport_size({'width': 375, 'height': 667}); pg.wait_for_timeout(300)
        detail('kans:k7'); pg.select_option('[data-kansfase="k7"]', 'gewonnen'); venster_open('#vf-contractwaarde')
        pg.fill('#vf-contractwaarde', '12500'); pg.fill('#vf-aantal', '1'); pg.fill('#vf-startdatum', dag(10)); pg.evaluate("window.__faal.apiKansOpslaan = 1")
        pg.evaluate("document.querySelector('#venster [data-cf-opslaan]').click()"); toast('Storing (golf5)'); pg.wait_for_timeout(400)
        xy = pg.evaluate(PUNT % json.dumps('#toast')); res = pg.evaluate(RESERVE); pg.touchscreen.tap(xy[0], xy[1]); pg.wait_for_timeout(400); m = nog_open()
        ok('telefoon 375×667 (r5, IOS5-R1): een tik op de foutmelding boven het winformulier sluit het venster niet; de contractwaarde staat er nog', xy[1] < res[0] and m == [True, '12500'], [xy, res, m])
        if m[0]: pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        melding_dan_win('k9', 'lead'); pg.fill('#vf-contractwaarde', '12500'); t = tik_na_vervagen(); m = nog_open()
        ok('telefoon 375×667 (r5, IOS5-R1): een tik op Ongedaan maken terwijl de melding vervaagt sluit het venster niet; de contractwaarde staat er nog', m == [True, '12500'], [t, m])
        if m[0]: pg.click('#venster [data-cf-annuleer]'); venster_dicht()
        detail('kans:k7'); pg.select_option('[data-kansfase="k7"]', 'gewonnen'); venster_open('#vf-contractwaarde'); pg.wait_for_timeout(300); res = pg.evaluate(RESERVE)
        pg.touchscreen.tap(20, (res[0] + res[1]) / 2); pg.wait_for_timeout(400)
        ok('telefoon 375×667 (r5, IOS5-R1): een tik op de achtergrond tussen de reserve en de sheet sluit het venster nog', res[1] - res[0] > 8 and not nog_open()[0], res)
        if nog_open()[0]: pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_r5_tik_melding', g5_r5_tik_melding)
    c.close()
    c = b.new_context(viewport={'width': 1180, 'height': 820}, is_mobile=True, has_touch=True)
    pg = c.new_page(); pg.on('pageerror', lambda e: pageerrors.append('ipad r3: ' + str(e))); pg.on('dialog', dialoog)
    pg.goto(U + 'sophie'); pg.wait_for_selector('#zijbalk'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(500); pg.evaluate(VOLG)
    def g5_r3_melding_ipad():
        melding_dan_win('k9', 'gesprek'); m = pg.evaluate(BEDEKT)
        ok('ipad landschap (r3, R1): de melding ligt niet over de titel of een veld van het winformulier; Ongedaan maken raakbaar', pg.evaluate("document.body.classList.contains('desk')") and m['toast'] and not m['bedekt'] and m['ongedaan'], m)
        pg.tap('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_r3_melding_ipad', g5_r3_melding_ipad)
    def g5_r5_tik_ipad():  # r5 (IOS5-R1): ook op de iPad liggend (body.desk, reserve) sluit een tik op de vervagende melding het venster niet
        melding_dan_win('k9', 'lead'); pg.fill('#vf-contractwaarde', '12500'); t = tik_na_vervagen(); m = nog_open()
        ok('ipad landschap (r5, IOS5-R1): een tik op Ongedaan maken terwijl de melding vervaagt sluit het venster niet; de contractwaarde staat er nog', m == [True, '12500'], [t, m])
        if m[0]: pg.tap('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_r5_tik_ipad', g5_r5_tik_ipad)
    c.close()
    # R2: tijdens de proefdraai die een andere fasekeuze start (Apps Script 1-3 s) staat Toepassen uit; meteen Toepassen stuurt dus nooit de nieuwe keuzes
    # met de onderbouwing van de vorige proefdraai. Een keuze die tijdens de vlucht valt, draait daarna nog een proefdraai (niets verloren). Desktop: geen
    # extra ruimte boven het venster (alleen telefoon en touch).
    c, pg = nieuw(b, 'sophie')
    def g5_r3_proef_race():
        fasen_toepassen()
        ms = [{'pipeline': m['pipeline'], 'mijlpaal': m['mijlpaal'], 'kans': m['kans'], 'dagenNorm': m['dagenNorm'], 'rol': m['rol'], 'vraagtStart': m['vraagtStart']} for m in api('apiCrm')['mijlpalen']]
        vo = [m for m in ms if m['mijlpaal'] == VO][0]; vo['oud'] = {'pipeline': 'Scholen', 'mijlpaal': VO}; vo['mijlpaal'] = '5. offerte'; vo['kans'] = 65
        api('apiMijlpalenOpslaan', ms + [{'pipeline': 'Scholen', 'mijlpaal': 'onderhandeling', 'kans': 80, 'dagenNorm': 7, 'rol': '', 'vraagtStart': False}], {'onderbouwing': 'golf5 r3 R2 (verzonnen)', 'besluitdatum': dag(0)})
        pg.evaluate("beheerOverstap()"); venster_open('[data-v79="fasen:proef"]'); pg.click('[data-v79="fasen:proef"]'); pg.wait_for_selector('#v79-dubbel')
        ok('desktop (r3, R1): geen extra ruimte boven het venster met een muis', pg.evaluate("getComputedStyle(document.getElementById('venster')).paddingTop") == '0px')
        t0 = pg.input_value('#v79-onderbouwing'); pg.evaluate(TRAAG); pg.evaluate("window.__traag.apiMigratieV79 = 1500"); n0 = n_calls()
        pg.select_option('#venster [data-v79fase][aria-label="Fase in Capsule voor onderhandeling"]', '5b')
        uit = pg.evaluate("document.querySelector('[data-v79=\"fasen:toepassen\"]').disabled")
        pg.evaluate("document.querySelector('[data-v79=\"fasen:toepassen\"]').click()")  # meteen Toepassen (ook als hij aan stond)
        pg.select_option('#venster [data-v79fase][aria-label="Fase in Capsule voor 2. pre-ap"]', '1')  # een keuze tijdens de vlucht
        pg.wait_for_function("(window.__calls || []).filter(function (c) { return c.fn === 'apiMigratieV79'; }).length >= %d" % (len(calls('apiMigratieV79')) + 2), timeout=10000)
        pg.wait_for_selector('[data-v79="fasen:proef"]:not([disabled])', timeout=8000); pg.wait_for_timeout(2500); pg.evaluate("window.__traag = {}")
        a = calls('apiMigratieV79', n0); tp = [x for x in a if x['args'][1].get('toepassen')]
        ok('fasen (r3, R2): tijdens de proefdraai na een andere fasekeuze staat Toepassen meteen uit; meteen Toepassen stuurt niets', uit and not tp, [uit, tp])
        laatste = [x for x in a if not x['args'][1].get('toepassen')][-1]['args'][1].get('koppeling') or {}
        st = pg.evaluate("[document.querySelector('[data-v79=\"fasen:toepassen\"]').disabled, document.getElementById('v79-onderbouwing').value === (V79.proef.fasen.onderbouwing || ''), document.querySelector('#venster [data-v79fase][aria-label=\"Fase in Capsule voor 2. pre-ap\"]').value]")
        ok('fasen (r3, R2): een keuze tijdens de vlucht geeft daarna nog een proefdraai met beide keuzes; dan staat Toepassen weer aan met de onderbouwing van die proefdraai',
           sorted(laatste.values()) == ['1', '5b'] and st == [False, True, '1'], [laatste, st])
        # ook via de knop Proefdraaien; mislukt de proefdraai, dan staat Toepassen weer zoals hij stond
        pg.evaluate("window.__traag.apiMigratieV79 = 800"); pg.click('[data-v79="fasen:proef"]')
        uit2 = pg.evaluate("document.querySelector('[data-v79=\"fasen:toepassen\"]').disabled"); pg.wait_for_selector('[data-v79="fasen:proef"]:not([disabled])', timeout=8000); pg.wait_for_timeout(300)
        pg.evaluate("window.__traag = {}; window.__faal.apiMigratieV79 = 1"); pg.click('[data-v79="fasen:proef"]'); toast('Storing (golf5)'); pg.wait_for_timeout(200)
        ok('fasen (r3, R2): ook Proefdraaien zet Toepassen uit; na een mislukte proefdraai staan Proefdraaien en Toepassen weer aan', uit2 and pg.evaluate("[document.querySelector('[data-v79=\"fasen:proef\"]').disabled, document.querySelector('[data-v79=\"fasen:toepassen\"]').disabled]") == [False, False])
        pg.click('#venster [data-cf-annuleer]'); venster_dicht()
    stap('g5_r3_proef_race', g5_r3_proef_race)
    c.close()
    b.close()

srv.shutdown()
if pageerrors: ok('geen JS-fouten in de pagina', False, '; '.join(pageerrors[:3]))
print('%d controles, %.0f s' % (aantal, time.time() - START))
print('ALLES GOED' if not fouten else 'FOUTEN: %d' % fouten)
sys.exit(1 if fouten else 0)
