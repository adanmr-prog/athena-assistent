# v7.9 (pakket 3, docs/sturing-v7.9.md): de app van release v7.9 in de demo, met de echte backend/Code.gs. Elke nieuwe handeling één keer, met een
# zichtbaar effect en (waar het telt) de aanroep die de app doet: de werkelijke datum vóór de keuze in de kansdetail (toekomst geweigerd zonder aanroep,
# vóór het vorige schooljaar eerst bevestigen), de melding met Ongedaan maken (index 0) en Andere datum (index 1), ongedaan maken als vlag (ook na het
# heropenen van een gewonnen kans, B2), bron toets en bulk, bulk met sturingVerplicht (één samenvatting), het voorstelvenster vóór de aanroep (R14), het
# winformulier en het verlorenvenster, een nieuwe kans (direct, klant- en schooljaarvoorstel, productsoort), BRIN, mijlpalen met rol, de overstap, de
# keuzelijsten, weekdoelen, de weergaven Week en MT, datakwaliteit, het register, jaardoel en aannames, werkelijke datums importeren, de actiekaart van
# de assistent, de definities op Home, Financiën en Rapporten, en de telefoon (390 px).
# De selectors staan letterlijk (als `data-…`) in dit bestand: test/handelingen.js grept ze.
# Gebruik: python3 test/handig/golf5.py — per controle "ok   …" of "FOUT …", eindigt met ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1).
# Eigen server op poort 8799; elke rol begint met een verse context (de demo schrijft in sessionStorage). Mislukte stappen: test/shots/robuust/golf5_<stap>.png.
import os, sys, time, json, datetime, threading, functools, http.server, socketserver
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
def detail(hash_):
    pg.evaluate("routeHash(%r)" % hash_); pg.wait_for_selector('#crmDetailScherm .d-naam h2'); pg.wait_for_timeout(500)
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
        pg.fill('#vf-aantal', '2'); pg.fill('#vf-startdatum', dag(20)); pg.click('#venster [data-cf-opslaan]'); toast('getekende contractwaarde')
        pg.fill('#vf-contractwaarde', '23100'); pg.fill('#vf-akkoorddatum', dag(2)); n0 = n_calls(); pg.click('#venster [data-cf-opslaan]'); toast('in de toekomst')
        ok('winformulier: akkoorddatum in de toekomst geweigerd zonder aanroep', not calls('apiKansOpslaan', n0))
        pg.fill('#vf-akkoorddatum', dag(-1)); pg.click('#venster [data-cf-opslaan]'); toast('Gewonnen'); pg.wait_for_timeout(600)
        k = kans('k7'); ok('winformulier: waarde = getekende waarde, gesloten = akkoorddatum, project met contractwaarde', k['kans']['waarde'] == 23100 and k['kans']['gesloten'] == dag(-1) and k['project'] and k['project'].get('contractwaarde') == 23100, [k['kans']['waarde'], k['kans']['gesloten'], k['project'] and k['project'].get('contractwaarde')])
    stap('g5_winformulier', g5_winformulier)

    def g5_verloren():  # punt 15: geen prompt; datum, reden uit de keuzelijst, toelichting
        detail('kans:k10'); d0 = len(DIALOGEN); pg.select_option('[data-kansfase="k10"]', 'verloren'); venster_open('#vf-verliesReden')
        pg.click('#venster [data-cf-opslaan]'); toast('Kies een reden')
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
        pg.emulate_media(media='print'); ok('mt: print verbergt zijbalk en knoppen, toont de kop van het maanddocument', not pg.locator('#zijbalk').is_visible() and not pg.locator('[data-mtprint]').is_visible() and pg.locator('.mt-print-kop').is_visible()); pg.emulate_media(media='screen')
        pg.click('[data-mtlink]'); pg.wait_for_timeout(400)
        try: kl = pg.evaluate("navigator.clipboard.readText()")
        except Exception: kl = ''
        ok('mt: Link kopiëren zet #rapport:mt:<stand> op het klembord', kl.endswith('#rapport:mt:' + dag(0)), kl)
        pg.select_option('#mtStand', ''); pg.wait_for_selector('.mt .hint:has-text("live")')
    stap('g5_rapport_mt', g5_rapport_mt)

    def g5_datakwaliteit_sophie():  # punt 11: management ziet iedereen en kan opnieuw rekenen; de melding rapport:datakwaliteit opent het blok
        pg.click('#crmBalk [data-rweergave="teams"]'); pg.wait_for_selector('#dqBlok'); ok('datakwaliteit (Sophie): Nu opnieuw rekenen', pg.locator('[data-dqvers]').count() == 1)
        pg.click('[data-dqvers]'); toast('opnieuw gerekend'); pg.wait_for_timeout(300)
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
        pg.evaluate("""(function () { S.chat.push({ rol: 'bot', tekst: 'Voorstel', acties: [{ id: 'g5', soort: 'wijzig_kans', titel: 'Kans bijwerken', invoer: { kansId: 'k8', fase: 'gesprek' } }] }); saveChat(); })()""")
        desk('brein', '#breinBerichten .actiekaart'); pg.wait_for_selector('.actiekaart:has-text("Datum mijlpaal")')
        pg.locator('.actiekaart:has-text("Datum mijlpaal") [data-ak="aanpassen"]').click(); pg.wait_for_selector('.actiekaart.bewerken [data-akveld="werkelijkeDatum"][type="date"]')
        pg.fill('.actiekaart.bewerken [data-akveld="werkelijkeDatum"]', dag(-1)); pg.click('.actiekaart.bewerken [data-ak="uitvoeren"]'); pg.wait_for_selector('.actiekaart.uitgevoerd', timeout=8000)
        l = wissels('k8'); ok('assistent: een wissel met bron assistent en de gekozen datum', l[-1]['bron'] == 'assistent' and l[-1]['werkelijkeDatum'] == dag(-1), l[-1])
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
        ok('telefoon: Week als kaarten zonder horizontale scroll; geen MT op de telefoon', pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth") and pg.locator('[data-rweergave="mt"]').count() == 0)
        h = pg.evaluate("[].map.call(document.querySelectorAll('#crmBalk [data-rweergave], #crmBalk [data-defs]'), function (b) { return b.getBoundingClientRect().height; })")
        ok('telefoon: de chips Week en Definities zijn minstens 36 px hoog', h and all(x >= 36 for x in h), h)
        pg.click('#crmBalk [data-rweergave="teams"]'); pg.wait_for_selector('#crmInhoud .tabel, #crmInhoud .tegel')
    stap('g5_telefoon', g5_telefoon)
    c.close()
    b.close()

srv.shutdown()
if pageerrors: ok('geen JS-fouten in de pagina', False, '; '.join(pageerrors[:3]))
print('%d controles, %.0f s' % (aantal, time.time() - START))
print('ALLES GOED' if not fouten else 'FOUTEN: %d' % fouten)
sys.exit(1 if fouten else 0)
