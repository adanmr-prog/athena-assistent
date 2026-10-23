# v7.2: toetsenbordtest op desktop (1440×900) in de demomodus, rol sophie en daarna kort femke.
# Per scherm uit de zijbalk (deskNaar) en per detailscherm (school, persoon, kans, project, talent) tabt hij vanaf het begin
# van het actieve scherm tot de focus het scherm verlaat (of 400 keer) en controleert:
#   (1-2) elk zichtbaar interactief element in .view.actief (button, a[href], [data-crm-open], [tabindex="0"], select, input,
#         textarea, .chip, summary) is met Tab bereikt;
#   (3)   het gefocuste element heeft een zichtbare focusstijl: outline-style ≠ none met outline-width > 0 (en niet transparant),
#         of een box-shadow/border-color die verschilt van de niet-gefocuste stijl;
#   (4)   Enter op een gefocuste rij/kaart met data-crm-open opent het detail; Escape sluit een venster of de commandobalk en
#         geeft de focus terug aan het element dat hem opende;
#   (5)   Ctrl+K opent de commandobalk, typen filtert, pijl omlaag + Enter kiest, Escape sluit;
#   (6)   geen focus-val: na Escape of sluiten kun je verder tabben.
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

def toets_enter_kaart(page, rol, scherm, r):
    """(4) Enter op een gefocuste rij/kaart met data-crm-open opent het detail."""
    naam = '%s/%s' % (rol, scherm)
    el = tab_tot(page, "a.getAttribute('data-crm-open') && a.tagName !== 'BUTTON' && a.tagName !== 'A'")
    if not el: el = tab_tot(page, "a.getAttribute('data-crm-open')")
    if not el: fout('%s: Enter-proef: geen enkele rij/kaart met data-crm-open krijgt focus met Tab' % naam); r['toetsen']['enterKaart'] = None; return
    page.keyboard.press('Enter'); wacht(page, 500)
    open_ = page.evaluate("CRM.detail ? CRM.detail.soort + ':' + CRM.detail.id : ''")
    na = page.evaluate(FOCUS_NU)
    r['toetsen']['enterKaart'] = {'kaart': el, 'open': open_, 'focusNa': na}
    (ok if open_ == el['crm'] else fout)('%s: Enter op %s → detail %s' % (naam, kort(el), open_ or 'niet geopend'))
    if open_: info('%s: focus na openen van het detail staat op %s' % (naam, kort(na) if na else 'body (verloren)'))
    page.evaluate("CRM.terugNaar = ''; if (CRM.detail) sluitDetail();"); wacht(page, 300)

def toets_venster(page, rol, scherm, r, opener_js, label):
    """(4)(6) Enter op een knop/rij die een venster opent; Escape sluit het en de focus komt terug op de opener; daarna verder tabben."""
    naam = '%s/%s' % (rol, scherm)
    el = page.evaluate(HULP + "(function () { var o = %s; if (!o) return null; o.focus(); return beschrijf(o); })()" % opener_js)
    if not el: info('%s: %s niet gevonden, venster-proef overgeslagen' % (naam, label)); return
    page.keyboard.press('Enter'); wacht(page, 500)
    venster = page.locator('#venster.aan').count() > 0
    inline = page.locator('.view.actief form:visible, .view.actief .composer:visible input').count() > 0
    binnen = page.evaluate("(function () { var a = document.activeElement, v = document.getElementById('venster'); return !!(a && v && v.contains(a)); })()")
    na_open = page.evaluate(FOCUS_NU)
    r['toetsen'][label] = {'opener': el, 'venster': venster, 'inline': inline, 'focusInVenster': binnen, 'focusNaOpenen': na_open}
    if not venster:
        (ok if inline else fout)('%s: Enter op %s → %s' % (naam, kort(el), 'formulier op de pagina (geen venster, Escape-proef niet van toepassing)' if inline else 'er opent niets'))
        if inline: page.evaluate("var c = document.querySelector('#venster.aan'); if (c) sluitVenster(); var n = document.getElementById('crmNieuw'); if (n) n.innerHTML = '';")
        return
    ok('%s: Enter op %s opent het venster' % (naam, kort(el)))
    info('%s: focus na openen van het venster: %s%s' % (naam, 'in het venster' if binnen else 'NIET in het venster', ' (' + kort(na_open) + ')' if na_open else ' (body)'))
    page.keyboard.press('Escape'); page.wait_for_timeout(250)
    dicht = page.locator('#venster.aan').count() == 0
    terug = focus_is(page, el); nu = page.evaluate(FOCUS_NU)
    r['toetsen'][label].update({'escapeSluit': dicht, 'focusTerug': terug, 'focusNaEscape': nu})
    (ok if dicht else fout)('%s: Escape sluit het venster' % naam)
    (ok if terug else fout)('%s: focus na Escape terug op %s → %s' % (naam, kort(el), 'ja' if terug else (kort(nu) if nu else 'body (verloren)')))
    if not dicht: page.evaluate('sluitVenster()')
    verder_tabben(page, naam, r)

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
                binnen = page.evaluate("(function () { var a = document.activeElement, v = document.getElementById('venster'); return !!(a && v && v.contains(a)); })()")
                na_open = page.evaluate(FOCUS_NU)
                info('sophie/taken: focus na openen van het venster: %s%s' % ('in het venster' if binnen else 'NIET in het venster', ' (' + kort(na_open) + ')' if na_open else ' (body)'))
                page.keyboard.press('Escape'); page.wait_for_timeout(250)
                dicht = page.locator('#venster.aan').count() == 0
                terug = focus_is(page, rij); nu = page.evaluate(FOCUS_NU)
                r['toetsen']['vensterTaakrij'] = {'focusInVenster': binnen, 'focusNaOpenen': na_open, 'escapeSluit': dicht, 'focusTerug': terug, 'focusNaEscape': nu}
                (ok if dicht else fout)('sophie/taken: Escape sluit het bewerkvenster')
                (ok if terug else fout)('sophie/taken: focus na Escape terug op de taakrij → %s' % ('ja' if terug else (kort(nu) if nu else 'body (verloren)')))
                if not dicht: page.evaluate('sluitVenster()')
                verder_tabben(page, 'sophie/taken', r)
        else: fout('sophie/taken: geen taakrij krijgt focus met Tab')
    # (5) commandobalk
    page.evaluate("deskNaar('home')"); wacht(page)
    r = next(x for x in rapport if x['rol'] == 'sophie' and x['scherm'] == 'home')
    toets_palet(page, 'sophie', r)
    # detailschermen: één per soort, de standaardtab
    for scherm, soort in (('contacten', 'school'), ('contacten', 'persoon'), ('pipeline', 'kans'), ('projecten', 'project'), ('talent', 'talent')):
        if scherm not in items: info('sophie: %s niet in de zijbalk, detail %s overgeslagen' % (scherm, soort)); continue
        if not open_detail(page, scherm, soort): fout('sophie: detail %s kon niet geopend worden' % soort); continue
        r = wandel(page, 'sophie', 'detail:' + soort)
        if soort == 'school':  # Bewerken in de detailkop → venster → Escape → focus terug
            toets_venster(page, 'sophie', 'detail:school', r, "document.querySelector('#crmDetailScherm [data-composer=\"bewerk\"]')", 'knopBewerken')
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
