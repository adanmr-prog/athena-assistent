# v7.2: toetsenbordtest op desktop (1440×900) in de demomodus, rol sophie en daarna kort femke.
# Per scherm uit de zijbalk (deskNaar) en per detailscherm (school, persoon, kans, project, talent) tabt hij vanaf het begin
# van het actieve scherm tot de focus het scherm verlaat (of 400 keer) en controleert:
#   (1-2) elk zichtbaar interactief element in .view.actief (button, a[href], [data-crm-open], [tabindex="0"], select, input,
#         textarea, .chip, summary) is met Tab bereikt;
#   (3)   het gefocuste element heeft een zichtbare focusstijl: outline-style ≠ none met outline-width > 0 (en niet transparant),
#         of een box-shadow/border-color die verschilt van de niet-gefocuste stijl;
#   (4)   Enter op een gefocuste rij/kaart met data-crm-open opent het detail; Escape sluit een venster of de commandobalk en
#         geeft de focus terug aan het element dat hem opende; (4b, iOS-review R2) Enter op een sleepbare taakrij in de weekweergave
#         vult het bewerkvenster precies één keer (twee handlers luisteren naar Enter; vóór de fix opende de taak twee keer);
#   (5)   Ctrl+K opent de commandobalk, typen filtert, pijl omlaag + Enter kiest, Escape sluit;
#   (6)   geen focus-val: na Escape of sluiten kun je verder tabben;
#   (7)   v7.3 (TB-8, TB-9): na Enter op een rij/kaart staat de focus in de detailkop (#crmDetailScherm .d-naam) en komt hij na Enter op
#         Terug terug op die rij; een bewerkvenster (+ Taak, Enter op een taakrij, Bewerken bij een project) krijgt bij openen de focus,
#         30× Tab en 10× Shift+Tab blijven binnen #venster (focus-trap) en bereiken meer dan één element, Escape zet de focus terug op de
#         knop of rij die het venster opende; (DEK-8) statusKlasse maakt van "in aanvraag" één klasse (in-aanvraag) met een eigen kleur;
#   (8)   v7.3 (iOS-review): R1 herlaadDetail laat de focus staan (op dezelfde tab in het detail, op de zijbalk erbuiten, en na Opslaan in het
#         bewerkvenster van een project terug op Bewerken); O1 een click() zonder focus (zoals een tik op iOS) maakt de knop toch de opener van het
#         venster; O2 het venster heeft een naam (aria-labelledby op de titel, aria-label bij een spinner); O3 een venster dat met een spinner opent
#         (meldingen, doelen) heeft meteen Annuleren, bereikbaar met Tab, en een laat antwoord opent het gesloten venster niet opnieuw; O4 focusStil
#         zet de scrollpositie terug als focus() de optie preventScroll negeert (nagebootst door focus() zonder opties).
# Gebruik: python3 test/toetsenbord.py — print per controle "ok   …" of "FOUT …" en eindigt met ALLES GOED (exitcode 0) of
# FOUTEN: n (exitcode 1). Uitvoer: test/shots/robuust/toetsenbord.json (alles per scherm) en screenshots
# test/shots/robuust/toets_<rol>_<scherm>_<n>.png van gefocuste elementen zonder zichtbare focus (hoogstens 3 per scherm).
# Een .chip zonder enige handeling (span als label of legenda) telt niet als interactief en staat als "statisch" in de json.
# Bewust weggelaten (looptijd ±1 min, plafond 8 min): per detailscherm alleen de standaardtab (niet alle data-dtab-tabs), femke
# alleen de wandeling per scherm (geen Enter/Escape/Ctrl+K-proeven en geen detailschermen), hoogstens 3 screenshots per scherm;
# duurt sophie onverwacht langer dan 400 s, dan slaat hij femke over en zegt dat.
import os, sys, json, time, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POORT = 8789
OUT = os.path.join(ROOT, 'test', 'shots', 'robuust'); os.makedirs(OUT, exist_ok=True)
MAX_TAB = 400
MAX_SHOTS = 3  # screenshots per scherm
EXE = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None
T0 = time.time()

class Stil(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
server = socketserver.TCPServer(('127.0.0.1', POORT), functools.partial(Stil, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()

INTERACTIEF = 'button, a[href], [data-crm-open], [tabindex="0"], select, input, textarea, .chip, summary'

regels = []; fouten = 0; rapport = []; jsfouten = []
def ok(t): regels.append('ok   ' + t); print('ok   ' + t, flush=True)
def fout(t):
    global fouten; fouten += 1; regels.append('FOUT ' + t); print('FOUT ' + t, flush=True)
def info(t): regels.append('info ' + t); print('info ' + t, flush=True)
def kort(e):
    """Eén regel voor een element: tag#id.klasse 'tekst' [data-…]."""
    s = e['tag'] + ('#' + e['id'] if e['id'] else '') + ('.' + e['cls'].replace(' ', '.') if e['cls'] else '')
    if e['tekst']: s += " '" + e['tekst'][:40] + "'"
    if e['crm']: s += ' [' + e['crm'] + ']'
    elif e['data']: s += ' [' + e['data'] + ']'
    return s

# --- JavaScript dat in de pagina draait -------------------------------------------------------------------------------
HULP = r"""
var INTERACTIEF = %s;
function zichtbaar(e) { var r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }
function beschrijf(e) {
  var t = (e.getAttribute('aria-label') || e.textContent || e.value || e.getAttribute('placeholder') || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
  var data = Array.prototype.map.call(e.attributes, function (a) { return a.name; }).filter(function (n) { return n.indexOf('data-') === 0 && n !== 'data-tb' && n !== 'data-tb-laatst'; });
  return { tag: e.tagName.toLowerCase(), id: e.id || '', cls: (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter(Boolean).slice(0, 3).join(' '), tekst: t.slice(0, 60),
           crm: e.getAttribute('data-crm-open') || '', data: data.slice(0, 4).join(' '), tabindex: e.getAttribute('tabindex'), href: e.getAttribute('href') || '' };
}
function schoon() { document.querySelectorAll('[data-tb],[data-tb-laatst]').forEach(function (e) { e.removeAttribute('data-tb'); e.removeAttribute('data-tb-laatst'); }); }
""" % json.dumps(INTERACTIEF)

# zet de focus aan het begin van het actieve scherm: het scherm zelf krijgt tabindex -1 en de focus, Tab gaat dan naar het eerste element erin
START = HULP + r"""(function () { schoon(); var v = document.querySelector('.view.actief'); if (!v) return ''; v.setAttribute('tabindex', '-1'); v.focus({ preventScroll: true }); return v.id; })()"""

# na één Tab: waar staat de focus, en is die zichtbaar?
STAP = HULP + r"""(function () {
  var v = document.querySelector('.view.actief'), a = document.activeElement;
  if (!a || a === document.body || a === v || !v.contains(a)) return { binnen: false, waar: !a || a === document.body ? 'body (buiten het document)' : (a.id || (typeof a.className === 'string' && a.className) || a.tagName) };
  if (a.getAttribute('data-tb')) return { binnen: true, zelfde: !!a.getAttribute('data-tb-laatst'), lus: !a.getAttribute('data-tb-laatst'), el: beschrijf(a) };  // zelfde: deelvelden van een datum-/tijdveld
  document.querySelectorAll('[data-tb-laatst]').forEach(function (e) { e.removeAttribute('data-tb-laatst'); });
  a.setAttribute('data-tb', '1'); a.setAttribute('data-tb-laatst', '1');
  var s = getComputedStyle(a), fv = a.matches(':focus-visible');
  function alfa(c) { var m = /rgba?\(\s*\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?\)/.exec(c || ''); return m ? (m[1] === undefined ? 1 : parseFloat(m[1])) : (c === 'transparent' ? 0 : 1); }
  var met = { outlineStyle: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth) || 0, outlineColor: s.outlineColor, boxShadow: s.boxShadow, borderColor: s.borderColor, background: s.backgroundColor };
  var omlijnd = met.outlineStyle !== 'none' && met.outlineWidth > 0 && alfa(met.outlineColor) > 0;
  var zonder = null, anders = false;
  if (!omlijnd) {  // geen omlijning: vergelijk met de stijl zonder focus
    a.blur(); var u = getComputedStyle(a);
    zonder = { boxShadow: u.boxShadow, borderColor: u.borderColor, background: u.backgroundColor, outlineStyle: u.outlineStyle };
    anders = u.boxShadow !== met.boxShadow || u.borderColor !== met.borderColor;
    a.focus({ preventScroll: true });
  }
  var r = a.getBoundingClientRect();
  return { binnen: true, el: beschrijf(a), focusVisible: fv, zichtbaar: omlijnd || anders, hoe: omlijnd ? 'outline' : (anders ? 'rand/schaduw' : 'geen'), met: met, zonder: zonder,
           rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inBeeld: r.bottom > 0 && r.top < innerHeight, interactief: a.matches(INTERACTIEF) };
})()"""

# na de wandeling: welke zichtbare interactieve elementen zijn niet bereikt?
EIND = HULP + r"""(function () {
  var v = document.querySelector('.view.actief'); if (!v) return { onbereikbaar: [], statisch: [], totaal: 0 };
  v.removeAttribute('tabindex');
  var onb = [], stat = [], totaal = 0;
  v.querySelectorAll(INTERACTIEF).forEach(function (e) {
    if (!zichtbaar(e) || e.disabled || e.type === 'hidden' || e.closest('[aria-hidden="true"]')) return;
    totaal++;
    if (e.getAttribute('data-tb') || e.getAttribute('tabindex') === '-1') return;
    var veldTag = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(e.tagName), ouder = e.parentElement && e.parentElement.closest('[data-tb]');
    if (!veldTag && ouder && /^(A|BUTTON|LABEL|SUMMARY)$/.test(ouder.tagName)) return;  // onderdeel van een bereikte knop/link (bijv. een span.chip in een link); een rij in een bereikte scrollregio telt wél
    if (e.tagName === 'LABEL' && (e.querySelector('[data-tb]') || (e.control && e.control.getAttribute('data-tb')))) return;  // het veld van het label is bereikt
    var echt = veldTag || e.hasAttribute('tabindex') || e.hasAttribute('role') || e.hasAttribute('onclick') || (e.tagName === 'LABEL' && e.control) ||
      Array.prototype.some.call(e.attributes, function (a) { return a.name.indexOf('data-') === 0 && a.name !== 'data-tb' && a.name !== 'data-tb-laatst'; });
    (echt ? onb : stat).push(beschrijf(e));
  });
  schoon();
  return { onbereikbaar: onb, statisch: stat, totaal: totaal };
})()"""

FOCUS_NU = HULP + r"""(function () { var a = document.activeElement; return (a && a !== document.body) ? Object.assign(beschrijf(a), { zichtbaar: zichtbaar(a) }) : null; })()"""

# korte tekst in de hoek van een screenshot, zodat het probleemgeval terug te vinden is
LABEL_AAN = r"""(function (t) { var d = document.createElement('div'); d.id = 'tbLabel'; d.textContent = t; d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;background:#c00;color:#fff;font:600 13px/1.3 sans-serif;padding:6px 10px;border-radius:6px;max-width:60vw'; document.body.appendChild(d); })"""
LABEL_UIT = r"""(function () { var d = document.getElementById('tbLabel'); if (d) d.remove(); })()"""

def wacht(page, ms=350):
    """Demo-aanroepen lopen in de pagina zelf (geen netwerk): wacht tot de spinner weg is, met een plafond."""
    page.wait_for_timeout(ms)
    try: page.wait_for_function("!document.querySelector('.view.actief .spinner')", timeout=4000)
    except Exception: pass
    page.wait_for_timeout(150)

def nieuw(b, rol):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='nl-NL', timezone_id='Europe/Amsterdam')
    page = ctx.new_page(); page.on('pageerror', lambda e: jsfouten.append(rol + ': ' + str(e).split('\n')[0][:160]))
    page.goto('http://127.0.0.1:%d/?demo=1&kaal=1&rol=%s' % (POORT, rol)); page.wait_for_selector('#zijbalk'); wacht(page, 800)
    return ctx, page

def zijbalk_items(page):
    return page.evaluate("Array.prototype.filter.call(document.querySelectorAll('.zb-item[data-desk]'), function (b) { return b.offsetParent !== null && b.style.display !== 'none'; }).map(function (b) { return b.getAttribute('data-desk'); })")

def wandel(page, rol, scherm):
    """Tab vanaf het begin van het actieve scherm tot de focus het verlaat; verzamelt bereikte elementen en hun focusstijl."""
    naam = '%s/%s' % (rol, scherm)
    view = page.evaluate(START)
    gezien = []; zonder = []; lus = None; reden = '%d tabs' % MAX_TAB; shots = []; zelfde = 0
    for i in range(MAX_TAB):
        page.keyboard.press('Tab')
        st = page.evaluate(STAP)
        if not st['binnen']: reden = 'focus verliet het scherm naar ' + str(st['waar'])[:40]; break
        if st.get('zelfde'):  # deelvelden van een datum-/tijdveld; blijft Tab hangen, dan is dat een focus-val
            zelfde += 1
            if zelfde > 6: lus = st['el']; reden = 'Tab blijft hangen op ' + kort(st['el']); break
            continue
        zelfde = 0
        if st.get('lus'): lus = st['el']; reden = 'lus: focus terug bij ' + kort(st['el']); break
        gezien.append(st)
        if not st['zichtbaar']:
            zonder.append(st)
            if len(shots) < MAX_SHOTS:
                pad = os.path.join(OUT, 'toets_%s_%s_%d.png' % (rol, scherm.replace(':', '-').replace('/', '-'), len(shots) + 1))
                page.evaluate(LABEL_AAN + '(%s)' % json.dumps('geen zichtbare focus: ' + kort(st['el'])))
                page.screenshot(path=pad); page.evaluate(LABEL_UIT); shots.append(os.path.relpath(pad, ROOT))
    e = page.evaluate(EIND)
    r = {'rol': rol, 'scherm': scherm, 'view': view, 'tabs': len(gezien), 'einde': reden, 'totaalInteractief': e['totaal'], 'bereikt': [g['el'] for g in gezien],
         'onbereikbaar': e['onbereikbaar'], 'statisch': e['statisch'], 'zonderFocus': [{'el': z['el'], 'met': z['met'], 'zonder': z['zonder']} for z in zonder],
         'buitenSelector': [g['el'] for g in gezien if not g['interactief']], 'screenshots': shots, 'toetsen': {}}
    rapport.append(r)
    if lus: fout('%s: focus-val, na %d tabs komt de focus terug bij %s' % (naam, len(gezien), kort(lus)))
    if not gezien and e['totaal']: fout('%s: geen enkel element bereikt met Tab (%d zichtbare interactieve elementen; %s)' % (naam, e['totaal'], reden))
    if e['onbereikbaar']:
        soorten = {}
        for x in e['onbereikbaar']: k = x['tag'] + ('.' + x['cls'].split(' ')[0] if x['cls'] else ''); soorten[k] = soorten.get(k, 0) + 1
        fout('%s: %d van %d zichtbare interactieve elementen niet bereikbaar met Tab (%s): %s' % (naam, len(e['onbereikbaar']), e['totaal'], ', '.join('%s×%d' % (k, n) for k, n in sorted(soorten.items(), key=lambda kv: -kv[1])[:5]), '; '.join(kort(x) for x in e['onbereikbaar'][:6]) + (' …' if len(e['onbereikbaar']) > 6 else '')))
    else: ok('%s: alle %d zichtbare interactieve elementen bereikt (%d tabs, %s)' % (naam, e['totaal'], len(gezien), reden))
    if zonder:
        fout('%s: %d gefocuste elementen zonder zichtbare focusstijl: %s' % (naam, len(zonder), '; '.join(kort(z['el']) + ' (outline %s %spx)' % (z['met']['outlineStyle'], z['met']['outlineWidth']) for z in zonder[:6]) + (' …' if len(zonder) > 6 else '')))
    elif gezien: ok('%s: focus zichtbaar op alle %d bereikte elementen' % (naam, len(gezien)))
    if e['statisch']: info('%s: %d .chip-elementen zonder handeling (statisch, niet geteld): %s' % (naam, len(e['statisch']), '; '.join(kort(x) for x in e['statisch'][:4])))
    return r

def tab_tot(page, test):
    """Tab vanaf het begin van het scherm tot activeElement aan `test` (JS-expressie over a) voldoet; geeft de beschrijving of None."""
    page.evaluate(START)
    js = HULP + "(function () { var v = document.querySelector('.view.actief'), a = document.activeElement; if (!a || a === document.body || !v.contains(a)) return 'buiten'; return (%s) ? beschrijf(a) : ''; })()" % test
    for i in range(MAX_TAB):
        page.keyboard.press('Tab')
        r = page.evaluate(js)
        if r == 'buiten': break
        if r: page.evaluate(HULP + 'schoon()'); return r
    page.evaluate(HULP + "schoon(); var v = document.querySelector('.view.actief'); if (v) v.removeAttribute('tabindex');")
    return None

def focus_is(page, el):
    """Staat de focus op het element met deze beschrijving (zelfde tag, id, data-crm-open/data-attributen en tekst)?"""
    nu = page.evaluate(FOCUS_NU)
    return bool(nu) and nu['tag'] == el['tag'] and nu['id'] == el['id'] and nu['crm'] == el['crm'] and nu['tekst'] == el['tekst'] and nu['data'] == el['data']

def verder_tabben(page, naam, r):
    """(6) na sluiten: één Tab moet een zichtbaar element focussen."""
    page.keyboard.press('Tab'); nu = page.evaluate(FOCUS_NU)
    goed = bool(nu) and nu['zichtbaar']
    r['toetsen']['verderTabben'] = nu
    (ok if goed else fout)('%s: na sluiten verder tabben → %s' % (naam, kort(nu) if nu else 'niets (focus op body)'))

IN_VENSTER = "(function () { var a = document.activeElement, v = document.getElementById('venster'); return !!(a && v && v.contains(a)); })()"
IN_DETAILKOP = "(function () { var a = document.activeElement, k = document.querySelector('#crmDetailScherm .d-naam'); return !!(a && k && k.contains(a)); })()"

def toets_enter_kaart(page, rol, scherm, r):
    """(4) Enter op een gefocuste rij/kaart met data-crm-open opent het detail; (7, v7.3 TB-9) de focus staat dan in de detailkop en
    komt na Enter op de Terug-knop terug op de rij (ook als de lijst opnieuw getekend is)."""
    naam = '%s/%s' % (rol, scherm)
    el = tab_tot(page, "a.getAttribute('data-crm-open') && a.tagName !== 'BUTTON' && a.tagName !== 'A'")
    if not el: el = tab_tot(page, "a.getAttribute('data-crm-open')")
    if not el: fout('%s: Enter-proef: geen enkele rij/kaart met data-crm-open krijgt focus met Tab' % naam); r['toetsen']['enterKaart'] = None; return
    page.keyboard.press('Enter'); wacht(page, 500)
    open_ = page.evaluate("CRM.detail ? CRM.detail.soort + ':' + CRM.detail.id : ''")
    na = page.evaluate(FOCUS_NU); in_kop = page.evaluate(IN_DETAILKOP)
    r['toetsen']['enterKaart'] = {'kaart': el, 'open': open_, 'focusNa': na, 'focusInKop': in_kop}
    (ok if open_ == el['crm'] else fout)('%s: Enter op %s → detail %s' % (naam, kort(el), open_ or 'niet geopend'))
    if open_:
        (ok if in_kop else fout)('%s: focus na openen van het detail in de detailkop → %s' % (naam, kort(na) if na else 'body (verloren)'))
        # v7.3 (TB-9): Terug met het toetsenbord — de Terug-knop krijgt focus, Enter sluit het detail; de focus hoort terug op de rij
        page.evaluate("(function () { var b = document.querySelector('#crmDetailScherm [data-crm-terug]'); if (b) b.focus(); })()")
        page.keyboard.press('Enter'); wacht(page, 700)
        dicht = page.evaluate('!CRM.detail'); terug = focus_is(page, el); nu = page.evaluate(FOCUS_NU)
        r['toetsen']['enterKaart'].update({'terugSluit': dicht, 'focusTerug': terug, 'focusNaTerug': nu})
        (ok if dicht else fout)('%s: Enter op Terug sluit het detail' % naam)
        (ok if terug else fout)('%s: focus na Terug terug op %s → %s' % (naam, kort(el), 'ja' if terug else (kort(nu) if nu else 'body (verloren)')))
    page.evaluate("CRM.terugNaar = ''; if (CRM.detail) sluitDetail();"); wacht(page, 300)

def tab_rond(page, naam, r, label, n=30):
    """(7, v7.3 TB-8) n× Tab en n/3× Shift+Tab blijven binnen het open venster en bereiken meer dan één element (focus-trap die rondloopt)."""
    buiten = 0; gezien = []
    for i in range(n):
        page.keyboard.press('Tab')
        if not page.evaluate(IN_VENSTER): buiten += 1
        nu = page.evaluate(FOCUS_NU); k = kort(nu) if nu else 'body'
        if k not in gezien: gezien.append(k)
    for i in range(n // 3):
        page.keyboard.press('Shift+Tab')
        if not page.evaluate(IN_VENSTER): buiten += 1
    r['toetsen'][label + 'TabRond'] = {'buiten': buiten, 'elementen': gezien}
    (ok if buiten == 0 and len(gezien) >= 2 else fout)('%s: %d× Tab en %d× Shift+Tab blijven in het venster (%d keer buiten, %d verschillende elementen%s)' % (naam, n, n // 3, buiten, len(gezien), '' if buiten == 0 else '; buiten o.a. ' + ', '.join(x for x in gezien if x == 'body' or 'venster' not in x)[:120]))

def toets_venster(page, rol, scherm, r, opener_js, label):
    """(4)(6)(7) Enter op een knop/rij die een venster opent; de focus staat dan in het venster, Tab loopt rond; Escape sluit het en de
    focus komt terug op de opener; daarna verder tabben."""
    naam = '%s/%s' % (rol, scherm)
    el = page.evaluate(HULP + "(function () { var o = %s; if (!o) return null; o.focus(); return beschrijf(o); })()" % opener_js)
    if not el: info('%s: %s niet gevonden, venster-proef overgeslagen' % (naam, label)); return
    page.keyboard.press('Enter'); wacht(page, 500)
    venster = page.locator('#venster.aan').count() > 0
    inline = page.locator('.view.actief form:visible, .view.actief .composer:visible input').count() > 0
    binnen = page.evaluate(IN_VENSTER)
    na_open = page.evaluate(FOCUS_NU)
    r['toetsen'][label] = {'opener': el, 'venster': venster, 'inline': inline, 'focusInVenster': binnen, 'focusNaOpenen': na_open}
    if not venster:
        (ok if inline else fout)('%s: Enter op %s → %s' % (naam, kort(el), 'formulier op de pagina (geen venster, Escape-proef niet van toepassing)' if inline else 'er opent niets'))
        if inline: page.evaluate("var c = document.querySelector('#venster.aan'); if (c) sluitVenster(); var n = document.getElementById('crmNieuw'); if (n) n.innerHTML = '';")
        return
    ok('%s: Enter op %s opent het venster' % (naam, kort(el)))
    (ok if binnen else fout)('%s: focus na openen van het venster in het venster → %s' % (naam, kort(na_open) if na_open else 'body (verloren)'))  # v7.3 (TB-8)
    toets_venster_naam(page, naam, r, label)  # v7.3 (iOS-review O2)
    tab_rond(page, naam, r, label)
    page.keyboard.press('Escape'); page.wait_for_timeout(250)
    dicht = page.locator('#venster.aan').count() == 0
    terug = focus_is(page, el); nu = page.evaluate(FOCUS_NU)
    r['toetsen'][label].update({'escapeSluit': dicht, 'focusTerug': terug, 'focusNaEscape': nu})
    (ok if dicht else fout)('%s: Escape sluit het venster' % naam)
    (ok if terug else fout)('%s: focus na Escape terug op %s → %s' % (naam, kort(el), 'ja' if terug else (kort(nu) if nu else 'body (verloren)')))
    if not dicht: page.evaluate('sluitVenster()')
    verder_tabben(page, naam, r)

VENSTER_NAAM = "(function () { var v = document.getElementById('venster'), id = v.getAttribute('aria-labelledby'), e = id && document.getElementById(id); return { id: id || '', tekst: e ? e.textContent.replace(/\\s+/g, ' ').trim() : '', label: v.getAttribute('aria-label') || '' }; })()"

def toets_venster_naam(page, naam, r, label):
    """(8, v7.3 iOS-review O2) het open venster (role=dialog) heeft een naam: aria-labelledby wijst naar de titel met tekst."""
    n = page.evaluate(VENSTER_NAAM)
    r['toetsen'][label + 'Naam'] = n
    (ok if n['id'] and n['tekst'] else fout)('%s: het venster heeft een naam voor de schermlezer → %s' % (naam, repr(n['tekst']) if n['tekst'] else ('aria-labelledby %r zonder tekst' % n['id'] if n['id'] else ('alleen aria-label %r' % n['label'] if n['label'] else 'geen'))))

def toets_herlaad_focus(page, rol, soort, r):
    """(8, v7.3 iOS-review R1) herlaadDetail (na opslaan, afvinken, een venster) laat de focus waar hij was: op dezelfde tab in het detail, en buiten
    het detail (zijbalk) blijft hij staan. Vóór de wijziging sprong hij elke keer naar de naam in de detailkop."""
    naam = '%s/detail:%s' % (rol, soort)
    tab = page.evaluate(HULP + "schoon(); (function () { var l = document.querySelectorAll('#crmDetailScherm [data-dtab]'), b = l[l.length - 1]; if (!b) return null; b.focus(); return beschrijf(b); })()")
    if not tab: info('%s: geen tabs in het detail, herlaad-proef overgeslagen' % naam); return
    page.evaluate('herlaadDetail()'); wacht(page, 600)
    nu = page.evaluate(FOCUS_NU); terug = focus_is(page, tab)
    r['toetsen']['herlaadTab'] = {'tab': tab, 'focusTerug': terug, 'focusNa': nu}
    (ok if terug else fout)('%s: focus na herlaadDetail terug op de tab %s → %s' % (naam, kort(tab), 'ja' if terug else (kort(nu) if nu else 'body (verloren)')))
    zb = page.evaluate(HULP + "(function () { var b = document.querySelector('.zb-item[data-desk=\"home\"]'); if (!b) return null; b.focus(); return beschrijf(b); })()")
    if not zb: return
    page.evaluate('herlaadDetail()'); wacht(page, 600)
    nu = page.evaluate(FOCUS_NU); blijft = focus_is(page, zb)
    r['toetsen']['herlaadZijbalk'] = {'el': zb, 'focusBlijft': blijft, 'focusNa': nu}
    (ok if blijft else fout)('%s: focus buiten het detail (zijbalk) blijft staan na herlaadDetail → %s' % (naam, 'ja' if blijft else (kort(nu) if nu else 'body (verloren)')))

def toets_opslaan_focus(page, rol, r):
    """(8, v7.3 iOS-review R1) Opslaan in het bewerkvenster van een project: het venster sluit, het detail herlaadt en de focus komt terug op de knop
    Bewerken (niet op de naam in de kop, niet op body)."""
    naam = rol + '/detail:project'
    el = page.evaluate(HULP + "schoon(); (function () { var o = document.querySelector('#crmDetailScherm [data-composer=\"bewerk\"]'); if (!o) return null; o.focus(); return beschrijf(o); })()")
    if not el: info('%s: knop Bewerken niet gevonden, opslaan-proef overgeslagen' % naam); return
    page.keyboard.press('Enter'); wacht(page, 500)
    if page.locator('#venster.aan').count() == 0: fout('%s: Enter op Bewerken opent geen venster (opslaan-proef)' % naam); return
    veld = page.locator('#venster #vf-contactpersoon')
    if veld.count() == 0: info('%s: geen veld Contactpersoon in het venster, opslaan-proef overgeslagen' % naam); page.evaluate('sluitVenster()'); return
    veld.fill((veld.input_value() + ' x').strip())
    page.click('#venster [data-cf-opslaan]'); wacht(page, 900)
    dicht = page.locator('#venster.aan').count() == 0
    terug = focus_is(page, el); nu = page.evaluate(FOCUS_NU)
    r['toetsen']['opslaanFocus'] = {'opener': el, 'venster_dicht': dicht, 'focusTerug': terug, 'focusNa': nu}
    (ok if dicht else fout)('%s: Opslaan in het bewerkvenster sluit het venster' % naam)
    (ok if terug else fout)('%s: focus na Opslaan (venster dicht, detail herladen) terug op %s → %s' % (naam, kort(el), 'ja' if terug else (kort(nu) if nu else 'body (verloren)')))

def toets_ios_tik(page, rol, r):
    """(8, v7.3 iOS-review O1) in iOS Safari geeft een tik een knop geen focus (activeElement blijft body of main). Nagebootst met click() zonder
    focus: de knop Bewerken moet toch de opener van het venster worden, zodat de focus na Escape op Bewerken terugkomt."""
    naam = rol + '/detail:project'
    el = page.evaluate(HULP + "schoon(); (function () { var o = document.querySelector('#crmDetailScherm [data-composer=\"bewerk\"]'); if (!o) return null; document.querySelector('main').focus(); o.click(); return beschrijf(o); })()")
    if not el: info('%s: knop Bewerken niet gevonden, tik-proef overgeslagen' % naam); return
    wacht(page, 500)
    open_ = page.locator('#venster.aan').count() > 0
    opener = page.evaluate("VENSTER.opener ? (VENSTER.opener.getAttribute('data-composer') || VENSTER.opener.tagName) : ''")
    (ok if open_ and opener == 'bewerk' else fout)('%s: click() zonder focus (zoals een tik op iOS) opent het venster met Bewerken als opener → venster %s, opener %r' % (naam, 'open' if open_ else 'dicht', opener))
    page.keyboard.press('Escape'); page.wait_for_timeout(250)
    terug = focus_is(page, el); nu = page.evaluate(FOCUS_NU)
    r['toetsen']['iosTik'] = {'opener': opener, 'focusTerug': terug, 'focusNa': nu}
    (ok if terug else fout)('%s: focus na Escape terug op Bewerken hoewel de tik geen focus gaf → %s' % (naam, 'ja' if terug else (kort(nu) if nu else 'body (verloren)')))
    if page.locator('#venster.aan').count(): page.evaluate('sluitVenster()')

def toets_scroll_focus(page, rol, r):
    """(8, v7.3 iOS-review O4) focusStil zet de scrollpositie van main terug als focus() toch scrolt (Safari vóór 15 negeert preventScroll zonder
    fout). Nagebootst: focus() op het prototype laat de opties weg, zodat Chromium scrolt zoals oud Safari; de viewport is tijdelijk laag."""
    naam = rol + '/detail:school'
    page.set_viewport_size({'width': 1440, 'height': 480}); page.wait_for_timeout(250)
    res = page.evaluate("""(function () { var m = document.querySelector('main'); m.scrollTop = 0;
      var d = document.getElementById('crmDetailScherm'), l = d.querySelectorAll('button, [tabindex="0"], a[href]'), e = null;
      for (var i = l.length - 1; i >= 0; i--) { var r = l[i].getBoundingClientRect(); if (r.height > 0 && r.top > innerHeight) { e = l[i]; break; } }
      if (!e) return { geen: true, scrollbaar: m.scrollHeight > m.clientHeight };
      var orig = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function () { return orig.call(this); };
      var gezet = focusStil(e), top = m.scrollTop; HTMLElement.prototype.focus = orig;
      var zonder; m.scrollTop = 0; e.blur(); orig.call(e); zonder = m.scrollTop; m.scrollTop = 0;  // zo ver scrolt een gewone focus(): de proef moet iets te meten hebben
      return { gezet: gezet, top: top, zonder: zonder, el: e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '') + (e.getAttribute('data-composer') ? '[data-composer]' : '') }; })()""")
    page.set_viewport_size({'width': 1440, 'height': 900}); page.wait_for_timeout(250)
    r['toetsen']['scrollFocus'] = res
    if res.get('geen'): info('%s: geen bedienbaar element onder de vouw (scrollbaar: %s), scrollproef overgeslagen' % (naam, res.get('scrollbaar'))); return
    (ok if res['gezet'] and res['top'] == 0 and res['zonder'] > 0 else fout)('%s: focusStil op %s onder de vouw met een focus() die preventScroll negeert: main blijft op 0 (nu %s; een gewone focus() scrolt naar %s), focus gezet: %s' % (naam, res['el'], res['top'], res['zonder'], res['gezet']))

def toets_spinner_venster(page, rol, r):
    """(8, v7.3 iOS-review O3) meldingen (de bel) en doelen openen een venster met alleen een spinner; die heeft meteen Annuleren (Tab bereikt hem,
    Enter sluit) en een laat antwoord opent het gesloten venster niet opnieuw. run() wordt tijdelijk vastgehouden voor apiMeldingen en apiDoelen."""
    naam = rol + '/home'
    page.evaluate("deskNaar('home')"); wacht(page)
    page.evaluate("""(function () { var orig = run; window.__runOud = orig; window.__los = null;
      window.run = function (fn) { var args = arguments, zelf = this;
        if (fn === 'apiMeldingen' || fn === 'apiDoelen') return new Promise(function (ok, nee) { window.__los = function () { orig.apply(zelf, args).then(ok, nee); }; });
        return orig.apply(zelf, args); }; })()""")
    page.click('#zbMeld'); page.wait_for_timeout(400)
    spinner = page.locator('#venster.aan #meldLaden').count() == 1; knop = page.locator('#venster.aan [data-cf-annuleer]')
    n = page.evaluate(VENSTER_NAAM)
    r['toetsen']['spinnerMeldingen'] = {'spinner': spinner, 'annuleer': knop.count(), 'naam': n}
    (ok if spinner and knop.count() == 1 else fout)('%s: meldingen laden → venster met spinner én de knop Annuleren (%d knoppen)' % (naam, knop.count()))
    (ok if n['label'] == 'Laden' and not n['id'] else fout)('%s: het ladende venster heet naar zijn spinnertekst (aria-label %r)' % (naam, n['label']))  # O2
    page.keyboard.press('Tab'); nu = page.evaluate(FOCUS_NU)
    op_knop = bool(nu) and nu['data'] == 'data-cf-annuleer' and page.evaluate(IN_VENSTER)
    (ok if op_knop else fout)('%s: Tab in het ladende venster komt op Annuleren → %s' % (naam, kort(nu) if nu else 'body'))
    page.keyboard.press('Enter'); page.wait_for_timeout(250)
    dicht = page.locator('#venster.aan').count() == 0
    (ok if dicht else fout)('%s: Enter op Annuleren sluit het ladende venster' % naam)
    if not dicht: page.evaluate('sluitVenster()')
    page.evaluate('window.__los && window.__los()'); page.wait_for_timeout(500)
    (ok if page.locator('#venster.aan').count() == 0 else fout)('%s: het late antwoord opent het gesloten meldingenvenster niet opnieuw' % naam)
    page.evaluate("deskNaar('doelen')"); wacht(page)
    if page.locator('.view.actief [data-doelinstellen]').count():
        page.evaluate('window.__los = null'); page.click('.view.actief [data-doelinstellen]'); page.wait_for_timeout(400)
        knop = page.locator('#venster.aan [data-cf-annuleer]'); spinner = page.locator('#venster.aan #doelLaden').count() == 1
        (ok if spinner and knop.count() == 1 else fout)('%s: doelen laden → venster met spinner én Annuleren (%d knoppen)' % (rol + '/doelen', knop.count()))
        if knop.count(): knop.first.click(); page.wait_for_timeout(250)
        dicht = page.locator('#venster.aan').count() == 0
        (ok if dicht else fout)('%s: Annuleren sluit het ladende doelenvenster' % (rol + '/doelen'))
        if not dicht: page.evaluate('sluitVenster()')
        page.evaluate('window.__los && window.__los()'); page.wait_for_timeout(600)
        (ok if page.locator('#venster.aan').count() == 0 else fout)('%s: het late antwoord opent het gesloten doelenvenster niet opnieuw' % (rol + '/doelen'))
    else: info('%s: geen knop Doelen beheren, doelen-proef overgeslagen' % (rol + '/doelen'))
    page.evaluate('window.run = window.__runOud; if (document.querySelector("#venster.aan")) sluitVenster();')

def toets_palet(page, rol, r):
    """(5)(4)(6) Ctrl+K: openen, filteren, kiezen, sluiten, focus terug, verder tabben."""
    naam = rol + '/commandobalk'
    opener = page.evaluate(HULP + "(function () { var b = document.querySelector('.zb-item[data-desk=\"home\"]'); b.focus(); return beschrijf(b); })()")
    page.keyboard.press('Control+k'); page.wait_for_timeout(300)
    aan = page.locator('#palet.aan').count() == 1; in_invoer = page.evaluate("document.activeElement && document.activeElement.id === 'paletInvoer'")
    (ok if aan and in_invoer else fout)('%s: Ctrl+K opent de commandobalk met de focus in het invoerveld (%s)' % (naam, 'ja' if aan and in_invoer else ('open' if aan else 'dicht') + ', focus ' + str(page.evaluate("document.activeElement && (document.activeElement.id || document.activeElement.tagName)"))))
    n0 = page.locator('#paletLijst .palet-rij').count()
    page.keyboard.type('proj'); page.wait_for_timeout(250)
    rijen = page.evaluate("Array.prototype.map.call(document.querySelectorAll('#paletLijst .palet-rij'), function (x) { return x.textContent.trim(); })")
    filtert = 0 < len(rijen) < n0 and all('proj' in x.lower() for x in rijen)
    (ok if filtert else fout)('%s: typen filtert (%d → %d rijen: %s)' % (naam, n0, len(rijen), ' | '.join(x[:30] for x in rijen[:4])))
    page.keyboard.press('ArrowDown'); page.wait_for_timeout(100)
    keus = page.evaluate("(function () { var a = document.querySelector('#paletLijst .palet-rij.aan'); return a ? a.getAttribute('data-palet') + ':' + a.textContent.trim() : ''; })()")
    page.keyboard.press('Enter'); wacht(page, 500)
    item = page.evaluate('DESK.item'); dicht = page.locator('#palet.aan').count() == 0
    koos = dicht and keus.startswith('1:') and ('Projecten' in keus and item == 'projecten' or 'Project' in keus and (page.locator('#venster.aan').count() > 0 or page.locator('.view.actief form:visible').count() > 0))
    (ok if koos else fout)('%s: pijl omlaag + Enter kiest de tweede rij (%s) → scherm %s, commandobalk %s' % (naam, keus[:40], item, 'dicht' if dicht else 'nog open'))
    r['toetsen']['palet'] = {'open': aan and in_invoer, 'filtert': filtert, 'rijen': rijen, 'keus': keus, 'naKeuze': item}
    page.evaluate("if (document.querySelector('#venster.aan')) sluitVenster(); var n = document.getElementById('crmNieuw'); if (n) n.innerHTML = '';")
    # Escape: sluit en focus terug op wat de balk opende
    page.evaluate("document.querySelector('.zb-item[data-desk=\"home\"]').focus()")
    page.keyboard.press('Control+k'); page.wait_for_timeout(250); page.keyboard.press('Escape'); page.wait_for_timeout(200)
    dicht = page.locator('#palet.aan').count() == 0; terug = focus_is(page, opener); nu = page.evaluate(FOCUS_NU)
    r['toetsen']['palet'].update({'escapeSluit': dicht, 'focusTerug': terug, 'focusNaEscape': nu})
    (ok if dicht else fout)('%s: Escape sluit de commandobalk' % naam)
    (ok if terug else fout)('%s: focus na Escape terug op %s → %s' % (naam, kort(opener), 'ja' if terug else (kort(nu) if nu else 'body (verloren)')))
    verder_tabben(page, naam, r)

KIES = r"""(function (soort) {
  var B = CRM.basis || {};
  if (soort === 'school') { var p = (B.projecten || [])[0]; if (p && p.schoolId) return p.schoolId; return (B.scholen || [])[0] && B.scholen[0].id; }
  if (soort === 'persoon') return (B.personen || [])[0] && B.personen[0].id;
  var e = document.querySelector('.view.actief [data-crm-open^="' + soort + ':"], .view.actief [data-sleep^="' + soort + ':"]');
  if (e) { var w = e.getAttribute('data-crm-open') || e.getAttribute('data-sleep'); return w.slice(soort.length + 1); }
  if (soort === 'project') { var t = (B.projecten || [])[0]; return t && t.id; }
  if (soort === 'kans') { var k = (B.kansenKort || [])[0]; return k && k.id; }
  return '';
})"""

def open_detail(page, scherm, soort):
    page.evaluate('deskNaar(%r)' % scherm); wacht(page)
    id_ = page.evaluate(KIES + '(%r)' % soort)
    if not id_: return False
    # zoals een klik op een link in de app (die kiest zelf het juiste scherm)
    page.evaluate("(function (w) { var a = document.createElement('a'); a.setAttribute('data-crm-open', w); (document.querySelector('.view.actief') || document.body).appendChild(a); a.click(); a.remove(); })(%r)" % (soort + ':' + id_)); wacht(page, 700)
    return page.locator('#crmDetailScherm .d-naam').count() > 0

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE, headless=True) if EXE else p.chromium.launch(headless=True)
    # --- sophie: alle schermen, toetsproeven en detailschermen ---
    ctx, page = nieuw(b, 'sophie')
    items = zijbalk_items(page)
    info('sophie: zijbalk heeft %d items: %s' % (len(items), ', '.join(items)))
    for s in items:
        page.evaluate('deskNaar(%r)' % s); wacht(page)
        wandel(page, 'sophie', s)
    # (4) Enter op kaart (pipeline-bord) en op een rij (projecten) met data-crm-open
    for s in ('pipeline', 'projecten', 'contacten'):
        if s in items:
            page.evaluate('deskNaar(%r)' % s); wacht(page)
            r = next(x for x in rapport if x['rol'] == 'sophie' and x['scherm'] == s)
            toets_enter_kaart(page, 'sophie', s, r)
    # (4)(6) venster via de knop "+ Taak" in de kop van Taken en via Enter op een taakrij
    if 'taken' in items:
        page.evaluate("deskNaar('taken')"); wacht(page)
        r = next(x for x in rapport if x['rol'] == 'sophie' and x['scherm'] == 'taken')
        toets_venster(page, 'sophie', 'taken', r, "document.querySelector('#deskActies [data-crmnieuw=\"taak\"]')", 'knopNieuweTaak')
        page.evaluate("deskNaar('taken')"); wacht(page)
        rij = tab_tot(page, "a.getAttribute('data-taakbewerk')")
        if rij:
            page.keyboard.press('Enter'); wacht(page, 400)
            venster = page.locator('#venster.aan').count() > 0
            r['toetsen']['enterTaakrij'] = {'rij': rij, 'venster': venster}
            (ok if venster else fout)('sophie/taken: Enter op de gefocuste taakrij %s → %s' % (kort(rij), 'bewerkvenster open' if venster else 'er gebeurt niets (alleen de sneltoets E opent de taak)'))
            if not venster:  # de gedocumenteerde sneltoets E opent het bewerkvenster: daarmee de venster-proef (Escape, focus terug, verder tabben)
                page.keyboard.press('e'); wacht(page, 400); venster = page.locator('#venster.aan').count() > 0
                (ok if venster else fout)('sophie/taken: sneltoets E op de taakrij opent het bewerkvenster → %s' % ('ja' if venster else 'nee'))
            if venster:
                binnen = page.evaluate(IN_VENSTER)
                na_open = page.evaluate(FOCUS_NU)
                (ok if binnen else fout)('sophie/taken: focus na openen van het venster vanaf de taakrij in het venster → %s' % (kort(na_open) if na_open else 'body (verloren)'))  # v7.3 (TB-8)
                toets_venster_naam(page, 'sophie/taken', r, 'vensterTaakrij')  # v7.3 (iOS-review O2)
                tab_rond(page, 'sophie/taken', r, 'vensterTaakrij')
                page.keyboard.press('Escape'); page.wait_for_timeout(250)
                dicht = page.locator('#venster.aan').count() == 0
                terug = focus_is(page, rij); nu = page.evaluate(FOCUS_NU)
                r['toetsen']['vensterTaakrij'] = {'focusInVenster': binnen, 'focusNaOpenen': na_open, 'escapeSluit': dicht, 'focusTerug': terug, 'focusNaEscape': nu}
                (ok if dicht else fout)('sophie/taken: Escape sluit het bewerkvenster')
                (ok if terug else fout)('sophie/taken: focus na Escape terug op de taakrij → %s' % ('ja' if terug else (kort(nu) if nu else 'body (verloren)')))
                if not dicht: page.evaluate('sluitVenster()')
                verder_tabben(page, 'sophie/taken', r)
        else: fout('sophie/taken: geen taakrij krijgt focus met Tab')
        # (4b) v7.2 (iOS-review R2): een sleepbare taakrij (data-sleep, weekweergave en desktop-agenda) heeft twee Enter-handlers: de sneltoetsen
        # en de kaart-handler. Tel hoe vaak het venster gevuld wordt: precies één keer. openVenster is een globale functie; de teller vervangt hem tijdelijk.
        page.evaluate("deskNaar('taken')"); wacht(page)
        page.evaluate("CRM.taakWeergave = 'week'; zetOpslag('aa_taakweergave', 'week'); renderCrm();"); wacht(page, 500)
        rij = page.evaluate(HULP + """(function () { var r = document.querySelector('.view.actief .rij[data-sleep^="taak:"]'); if (!r) return null;
          window.__vensterVul = 0; var ov = openVenster; window.__openVensterOud = ov; window.openVenster = function (h) { window.__vensterVul++; return ov(h); };
          r.focus(); return beschrijf(r); })()""")
        if rij:
            page.keyboard.press('Enter'); wacht(page, 500)
            vul = page.evaluate('window.__vensterVul'); venster = page.locator('#venster.aan').count() > 0
            r['toetsen']['enterSleepbareRij'] = {'rij': rij, 'venster': venster, 'vensterGevuld': vul}
            (ok if venster and vul == 1 else fout)('sophie/taken (week): Enter op de sleepbare taakrij %s → venster %s, %d keer gevuld (verwacht precies 1)' % (kort(rij), 'open' if venster else 'dicht', vul))
            page.evaluate("window.openVenster = window.__openVensterOud; if (document.querySelector('#venster.aan')) sluitVenster();")
        else: fout('sophie/taken (week): geen sleepbare taakrij (.rij[data-sleep^="taak:"]) in de weekweergave')
        page.evaluate("CRM.taakWeergave = 'alles'; zetOpslag('aa_taakweergave', 'alles'); renderCrm();"); wacht(page, 300)
    # (5) commandobalk
    page.evaluate("deskNaar('home')"); wacht(page)
    r = next(x for x in rapport if x['rol'] == 'sophie' and x['scherm'] == 'home')
    toets_palet(page, 'sophie', r)
    toets_spinner_venster(page, 'sophie', r)  # v7.3 (iOS-review O3, O2)
    # detailschermen: één per soort, de standaardtab
    for scherm, soort in (('contacten', 'school'), ('contacten', 'persoon'), ('pipeline', 'kans'), ('projecten', 'project'), ('talent', 'talent')):
        if scherm not in items: info('sophie: %s niet in de zijbalk, detail %s overgeslagen' % (scherm, soort)); continue
        if not open_detail(page, scherm, soort): fout('sophie: detail %s kon niet geopend worden' % soort); continue
        r = wandel(page, 'sophie', 'detail:' + soort)
        if soort in ('school', 'project'):  # Bewerken in de detailkop → venster (project) of formulier op de pagina (school) → Escape → focus terug; v7.3: ook project
            toets_venster(page, 'sophie', 'detail:' + soort, r, "document.querySelector('#crmDetailScherm [data-composer=\"bewerk\"]')", 'knopBewerken')
        if soort == 'school':  # v7.3 (iOS-review R1, O4)
            toets_herlaad_focus(page, 'sophie', soort, r)
            toets_scroll_focus(page, 'sophie', r)
        if soort == 'project':  # v7.3 (iOS-review R1, O1)
            toets_opslaan_focus(page, 'sophie', r)
            toets_ios_tik(page, 'sophie', r)
        if soort == 'talent':  # v7.3 (DEK-8): een documentstatus met een spatie ("in aanvraag") wordt één klasse en kleurt anders dan een gewone tag
            d8 = page.evaluate("""(function () { var k = statusKlasse('in aanvraag'), a = document.createElement('span'), b = document.createElement('span');
              a.className = 'tag ' + k; b.className = 'tag'; a.textContent = 'x'; b.textContent = 'x'; document.body.appendChild(a); document.body.appendChild(b);
              var ka = getComputedStyle(a).backgroundColor, kb = getComputedStyle(b).backgroundColor; a.remove(); b.remove(); return { klasse: k, kleur: ka, gewoon: kb }; })()""")
            r['toetsen']['documentstatus'] = d8
            (ok if d8['klasse'] == 'in-aanvraag' and d8['kleur'] != d8['gewoon'] else fout)('sophie/detail:talent: documentstatus "in aanvraag" → klasse %s, achtergrond %s (gewone tag %s)' % (d8['klasse'], d8['kleur'], d8['gewoon']))
        page.evaluate('CRM.terugNaar = ""; if (CRM.detail) sluitDetail();'); wacht(page, 200)
    ctx.close()
    # --- femke (accountmanager): kort, alleen de wandeling per scherm ---
    if time.time() - T0 < 400:
        ctx, page = nieuw(b, 'femke')
        items = zijbalk_items(page)
        info('femke: zijbalk heeft %d items: %s' % (len(items), ', '.join(items)))
        for s in items:
            page.evaluate('deskNaar(%r)' % s); wacht(page)
            wandel(page, 'femke', s)
            if time.time() - T0 > 440: info('femke: tijdslimiet nadert, resterende schermen overgeslagen na %s' % s); break
        ctx.close()
    else: info('femke overgeslagen: sophie duurde al %d s' % (time.time() - T0))
    b.close()
server.shutdown()

if jsfouten: fout('JS-fouten in de pagina: %s' % '; '.join(jsfouten[:5]))
else: ok('geen JS-fouten in de pagina')
duur = time.time() - T0
json.dump({'duur_s': round(duur, 1), 'fouten': fouten, 'regels': regels, 'schermen': rapport, 'jsfouten': jsfouten}, open(os.path.join(OUT, 'toetsenbord.json'), 'w'), ensure_ascii=False, indent=1)
print('\nschermen: %d · tabs totaal: %d · onbereikbaar: %d · zonder zichtbare focus: %d · looptijd %.0f s' % (len(rapport), sum(r['tabs'] for r in rapport), sum(len(r['onbereikbaar']) for r in rapport), sum(len(r['zonderFocus']) for r in rapport), duur))
print('ALLES GOED' if not fouten else 'FOUTEN: %d' % fouten)
sys.exit(1 if fouten else 0)
