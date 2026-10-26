// v7.2: inventaris van de data-*-handelingen in index.html. Welke attributen vangt een listener af (closest/matches/querySelector(All)/dataset
// in click-, change-, input-, keydown- en pointer-handlers), welke zendt de app uit (HTML-strings in het script, de statische HTML, setAttribute,
// dataset-schrijven), welke raken de tests aan (grep van data-xxx in test/*.py, test/handig/*.py, test/*.js) en hoe is de dekking per sectie
// (de /* ===== ... ===== */-koppen van het script, op basis van de functie waarin de string staat).
// Gebruik: node test/handelingen.js  → test/shots/robuust/handelingen.md en handelingen.json; per controle "ok   ..." of "FOUT ...";
// eindigt met "ALLES GOED" (exitcode 0) of "FOUTEN: n" (exitcode 1). Een FOUT is een dode handler: afgevangen in een listener, nergens uitgezonden,
// of (v7.3, H4/H5) meer dan MAX_ZONDER_TEST handelingen zonder enige test; de lijst zonder test wordt altijd geprint (test/handig/golf4.py doorloopt
// de handelingen die geen andere test raakt). Dood markup (uitgezonden, nergens afgevangen) is informatie, geen fout.
// Geen afhankelijkheden: eigen tokenizer (strings, commentaar, regex-literals, accolades). Staat acorn toevallig in node_modules, dan dient hij
// alleen als kruiscontrole van de tokenizer.
'use strict';
var fs = require('fs'), path = require('path');
var R = path.join(__dirname, '..'), UIT = path.join(R, 'test/shots/robuust');
var START = Date.now(), fouten = 0, waarschuwingen = [];
var MAX_ZONDER_TEST = 20;  // v7.3 (H4/H5): drempel voor handelingen zonder enige test (was 58 van 157 vóór golf4.py)
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function info(wat) { console.log('info ' + wat); }
function waarschuw(wat) { waarschuwingen.push(wat); console.log('let  ' + wat); }

var SELECTOR_METHODEN = { closest: 1, matches: 1, querySelector: 1, querySelectorAll: 1 };
var LEES_METHODEN = { getAttribute: 1, hasAttribute: 1 };
var REGEX_VOOR = { '(': 1, ',': 1, '=': 1, ':': 1, '[': 1, '!': 1, '&': 1, '|': 1, '?': 1, '{': 1, '}': 1, ';': 1, '+': 1, '-': 1, '*': 1, '%': 1, '<': 1, '>': 1, '~': 1, '^': 1, '&&': 1, '||': 1, '==': 1, '===': 1, '!=': 1, '!==': 1, '<=': 1, '>=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '?:': 1 };
var REGEX_NA_WOORD = { 'return': 1, 'typeof': 1, 'case': 1, 'do': 1, 'else': 1, 'in': 1, 'instanceof': 1, 'new': 1, 'delete': 1, 'void': 1, 'throw': 1 };
var PUNCT = ['>>>=', '===', '!==', '>>>', '<<=', '>>=', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>'];

/* ---- bron inlezen ---- */
var html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
var regelStarts = [0]; for (var ri = 0; ri < html.length; ri++) if (html.charCodeAt(ri) === 10) regelStarts.push(ri + 1);
function regelVan(offset) { var lo = 0, hi = regelStarts.length - 1; while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (regelStarts[mid] <= offset) lo = mid; else hi = mid - 1; } return lo + 1; }
function kebab(naam) { return naam.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }

/* ---- tokenizer: ws, commentaar, string, regex, getal, ident, punct; verliesvrij (tokens aaneen = bron) ---- */
function tokeniseer(src, basis) {
  var toks = [], i = 0, n = src.length, laatste = null;  // laatste = laatste betekenisvolle token (geen ws/commentaar)
  function voeg(type, start, eind) { var t = { type: type, waarde: src.slice(start, eind), start: basis + start, eind: basis + eind }; toks.push(t); if (type !== 'ws' && type !== 'commentaar') laatste = t; return t; }
  function regexMag() {
    if (!laatste) return true;
    if (laatste.type === 'punct') return !!REGEX_VOOR[laatste.waarde];
    if (laatste.type === 'ident') return !!REGEX_NA_WOORD[laatste.waarde];
    return false;  // na getal, string of regex: delen
  }
  while (i < n) {
    var c = src[i], d = src[i + 1], s = i;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { while (i < n && /\s/.test(src[i])) i++; voeg('ws', s, i); continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; voeg('commentaar', s, i); continue; }
    if (c === '/' && d === '*') { var e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; voeg('commentaar', s, i); continue; }
    if (c === '"' || c === "'") { i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; if (src[i] === '\n') break; i++; } i++; voeg('string', s, Math.min(i, n)); continue; }
    if (c === '/' && regexMag()) {
      var j = i + 1, inKlasse = false, goed = false;
      while (j < n) { var cj = src[j]; if (cj === '\\') { j += 2; continue; } if (cj === '\n') break; if (inKlasse) { if (cj === ']') inKlasse = false; } else if (cj === '[') inKlasse = true; else if (cj === '/') { goed = true; break; } j++; }
      if (goed) { j++; while (j < n && /[a-z]/i.test(src[j])) j++; i = j; voeg('regex', s, i); continue; }
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(d || ''))) { i++; while (i < n && /[0-9a-zA-Z._]/.test(src[i])) i++; voeg('getal', s, i); continue; }
    if (/[A-Za-z_$]/.test(c)) { i++; while (i < n && /[A-Za-z0-9_$]/.test(src[i])) i++; voeg('ident', s, i); continue; }
    var p = null; for (var k = 0; k < PUNCT.length; k++) if (src.substr(i, PUNCT[k].length) === PUNCT[k]) { p = PUNCT[k]; break; }
    i += p ? p.length : 1; voeg('punct', s, i);
  }
  return toks;
}

/* ---- scriptblokken, stijlblokken en de statische HTML uit index.html ---- */
var scripts = [], stijlen = [], m, re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
while ((m = re.exec(html))) if (!/\bsrc=/.test(m[1])) scripts.push({ start: m.index + m[0].indexOf('>') + 1, tekst: m[2] });
re = /<style\b[^>]*>([\s\S]*?)<\/style>/g; while ((m = re.exec(html))) stijlen.push({ start: m.index, tekst: m[1] });
eis(scripts.length >= 1, 'index.html: ' + scripts.length + ' inline scriptblok(ken), ' + stijlen.length + ' stijlblok(ken), ' + regelStarts.length + ' regels');

var ATTR = {};  // naam → { emissies: [], consumpties: [], stijl: 0, tests: {} }
function attr(naam) { return ATTR[naam] || (ATTR[naam] = { emissies: [], consumpties: [], stijl: 0, tests: {}, testTotaal: 0 }); }
var SECTIES = [];  // { regel, naam, sub } uit de commentaarkoppen
function sectieKort(tekst) {  // "6. Relaties (v2.0): het eigen CRM — …" → "6. Relaties"; "v3.7: alles aanpasbaar — één …" → "alles aanpasbaar (v3.7)"
  var t = tekst.replace(/^[\s=\-*/]+|[\s=\-*/]+$/g, '').replace(/\s+/g, ' '), versie = /^(v\d+(?:\.\d+)*):\s*/.exec(t);
  if (versie) t = t.slice(versie[0].length);
  var nr = /^(\d+\.\s+)?([\s\S]*)$/.exec(t), kort = (nr[1] || '') + nr[2].split(/ — | - |: | \(|\. /)[0];
  if (kort.length > 48) kort = kort.slice(0, 46) + '…';
  return (kort || t.slice(0, 40)) + (versie ? ' (' + versie[1] + ')' : '');
}
function sectieBij(regel) {
  var hoofd = null, sub = null;
  for (var i = 0; i < SECTIES.length; i++) { if (SECTIES[i].regel > regel) break; if (SECTIES[i].sub) sub = SECTIES[i]; else { hoofd = SECTIES[i]; sub = null; } }
  return { sectie: hoofd ? hoofd.naam : 'algemeen (script vóór de eerste kop)', sub: sub ? sub.naam : '' };
}

var totaalTokens = 0, stringsMetData = 0, regexTokens = 0, scriptVermeldingenRuw = 0;
scripts.forEach(function (sc) {
  var toks = tokeniseer(sc.tekst, sc.start);
  totaalTokens += toks.length;
  eis(toks.map(function (t) { return t.waarde; }).join('') === sc.tekst, 'tokenizer verliesvrij (scriptblok op regel ' + regelVan(sc.start) + ')');
  scriptVermeldingenRuw += (sc.tekst.match(/data-[a-z0-9-]+/gi) || []).length;
  var sig = toks.filter(function (t) { return t.type !== 'ws' && t.type !== 'commentaar'; });
  toks.forEach(function (t) {
    if (t.type === 'regex') regexTokens++;
    if (t.type === 'string' && /data-[a-z0-9-]+/i.test(t.waarde)) stringsMetData++;
    if (t.type === 'commentaar') { var k = /^\/\*\s*(={3,}|-{3,})\s*([\s\S]*?)\s*(?:={3,}|-{3,})\s*\*\/$/.exec(t.waarde.trim()); if (k) SECTIES.push({ regel: regelVan(t.start), naam: sectieKort(k[2]), sub: k[1][0] === '-' }); }
  });
  SECTIES.sort(function (a, b) { return a.regel - b.regel; });

  // listeners op naam: addEventListener('event', naam) en addListener(naam)
  var listenersOpNaam = {};
  for (var i = 0; i + 4 < sig.length; i++) {
    if (sig[i].type === 'ident' && sig[i].waarde === 'addEventListener' && sig[i + 1].waarde === '(' && sig[i + 2].type === 'string' && sig[i + 3].waarde === ',' && sig[i + 4].type === 'ident' && sig[i + 4].waarde !== 'function') listenersOpNaam[sig[i + 4].waarde] = sig[i + 2].waarde.slice(1, -1);
    if (sig[i].type === 'ident' && sig[i].waarde === 'addListener' && sig[i + 1].waarde === '(' && sig[i + 2].type === 'ident' && sig[i + 3].waarde === ')') listenersOpNaam[sig[i + 2].waarde] = 'change';
  }
  function haakjeTerug(k) { var diepte = 0; for (var j = k; j >= 0; j--) { if (sig[j].waarde === ')') diepte++; else if (sig[j].waarde === '(') { diepte--; if (diepte === 0) return j; } } return -1; }
  function frameVoor(k) {  // k = index van '{' in sig
    var f = { soort: 'blok', naam: null, event: null, doel: null, regel: regelVan(sig[k].start) }, p;
    if (k > 0 && sig[k - 1].waarde === ')' && (p = haakjeTerug(k - 1)) > 0) {
      var a = sig[p - 1], b = sig[p - 2], c = sig[p - 3];
      if (a.type === 'ident' && a.waarde === 'function') {  // anonieme functie
        f.soort = 'functie';
        if (b && b.waarde === ',' && c && c.type === 'string' && sig[p - 4] && sig[p - 4].waarde === '(' && sig[p - 5] && sig[p - 5].waarde === 'addEventListener') {
          f.soort = 'listener'; f.event = c.waarde.slice(1, -1);
          var dl = sig[p - 6] && sig[p - 6].waarde === '.' ? sig[p - 7] : null;
          if (dl && dl.type === 'ident') f.doel = dl.waarde;
          else if (dl && dl.waarde === ')') { var q = haakjeTerug(p - 7); f.doel = q > 0 ? sc.tekst.slice(sig[q - 1].start - sc.start, dl.eind - sc.start) : '?'; }
        } else if (b && b.waarde === '=' && c && c.type === 'ident') f.naam = c.waarde;      // naam = function (
        else if (b && b.waarde === ':' && c && c.type === 'ident') f.naam = c.waarde;      // naam: function (
      } else if (a.type === 'ident' && b && b.type === 'ident' && b.waarde === 'function') { f.soort = 'functie'; f.naam = a.waarde; }  // function naam(
    }
    return f;
  }
  var stapel = [];
  function context(regel) {
    var functie = null, listener = null, listenerRegel = 0, viaNaam = false;
    for (var j = stapel.length - 1; j >= 0; j--) {
      var fr = stapel[j];
      if (!functie && fr.soort === 'functie' && fr.naam) functie = fr.naam;
      if (!listener && fr.soort === 'listener') { listener = fr.event; listenerRegel = fr.regel; }
      if (!listener && fr.soort === 'functie' && fr.naam && listenersOpNaam[fr.naam]) { listener = listenersOpNaam[fr.naam]; listenerRegel = fr.regel; viaNaam = true; }
    }
    var s = sectieBij(regel);
    return { functie: functie, listener: listener, listenerRegel: listenerRegel, viaNaam: viaNaam, sectie: s.sectie, sub: s.sub, label: functie || (listener ? 'listener ' + listener + ' @' + listenerRegel : 'script') };
  }
  function methodeVoor(k) { return sig[k - 1] && sig[k - 1].waarde === '(' && sig[k - 2] && sig[k - 2].type === 'ident' ? sig[k - 2].waarde : null; }
  for (i = 0; i < sig.length; i++) {
    var t = sig[i], regel = regelVan(t.start);
    if (t.type === 'punct' && t.waarde === '{') { stapel.push(frameVoor(i)); continue; }
    if (t.type === 'punct' && t.waarde === '}') { if (!stapel.length) waarschuw('accolade sluit zonder opening op regel ' + regel); else stapel.pop(); continue; }
    if (t.type === 'string') {
      var binnen = t.waarde.slice(1, -1), methode = methodeVoor(i), rx = /data-([a-z0-9-]*)/gi, mm;
      while ((mm = rx.exec(binnen))) {
        var naam = mm[1].toLowerCase(), vorig = binnen[mm.index - 1], volgend = binnen[mm.index + mm[0].length], ctx = context(regel);
        if (!naam) { waarschuw('dynamische attribuutnaam ("data-" + …) op regel ' + regel + ' in ' + ctx.label + '; ontsnapt aan deze inventaris'); continue; }
        if (vorig === '[') attr(naam).consumpties.push({ wijze: SELECTOR_METHODEN[methode] ? methode : 'selector', regel: regel, functie: ctx.functie, listener: ctx.listener, listenerRegel: ctx.listenerRegel, label: ctx.label });
        else if (methode && LEES_METHODEN[methode]) attr(naam).consumpties.push({ wijze: methode, regel: regel, functie: ctx.functie, listener: ctx.listener, listenerRegel: ctx.listenerRegel, label: ctx.label });
        else if (methode === 'setAttribute') attr(naam).emissies.push({ bron: 'setAttribute', regel: regel, functie: ctx.functie, label: ctx.label, sectie: ctx.sectie, sub: ctx.sub });
        else if (methode === 'removeAttribute') attr(naam).consumpties.push({ wijze: 'removeAttribute', regel: regel, functie: ctx.functie, listener: ctx.listener, listenerRegel: ctx.listenerRegel, label: ctx.label });
        else if (volgend === '=' || ((volgend === undefined || /[\s>\/]/.test(volgend)) && (vorig === undefined || /\s/.test(vorig)))) attr(naam).emissies.push({ bron: 'string', regel: regel, functie: ctx.functie, label: ctx.label, sectie: ctx.sectie, sub: ctx.sub });
        else waarschuw('onduidelijke vermelding data-' + naam + ' in een string op regel ' + regel + ' (' + ctx.label + '): ' + JSON.stringify(binnen.slice(Math.max(0, mm.index - 12), mm.index + naam.length + 14)));
      }
      continue;
    }
    if (t.type === 'ident' && t.waarde === 'dataset') {
      var ctx2 = context(regel);
      if (sig[i + 1] && sig[i + 1].waarde === '.' && sig[i + 2] && sig[i + 2].type === 'ident') {
        var dn = kebab(sig[i + 2].waarde), na = sig[i + 3];
        if (na && na.type === 'punct' && /^([-+*/%&|^]?=)$/.test(na.waarde)) attr(dn).emissies.push({ bron: 'dataset-schrijf', regel: regel, functie: ctx2.functie, label: ctx2.label, sectie: ctx2.sectie, sub: ctx2.sub });
        else attr(dn).consumpties.push({ wijze: 'dataset', regel: regel, functie: ctx2.functie, listener: ctx2.listener, listenerRegel: ctx2.listenerRegel, label: ctx2.label });
      } else if (sig[i + 1] && sig[i + 1].waarde === '[') waarschuw('dynamische dataset[…]-toegang op regel ' + regel + ' in ' + ctx2.label + '; ontsnapt aan deze inventaris');
    }
  }
  eis(stapel.length === 0, 'accolades in balans (scriptblok op regel ' + regelVan(sc.start) + ')' + (stapel.length ? ': ' + stapel.length + ' open' : ''));
});

// Kruiscontrole met acorn als die toevallig in node_modules staat (afhankelijkheid van pglite); anders alleen melden.
(function kruiscontrole() {
  var acorn; try { acorn = require('acorn'); } catch (e) { info('acorn niet gevonden; kruiscontrole van de tokenizer overgeslagen'); return; }
  var aStrings = 0, aRegex = 0;
  try {
    scripts.forEach(function (sc) {
      for (var tk, it = acorn.tokenizer(sc.tekst, { ecmaVersion: 2020 }); (tk = it.getToken()).type.label !== 'eof';) {
        if (tk.type.label === 'string' && /data-[a-z0-9-]+/i.test(String(tk.value))) aStrings++;
        if (tk.type.label === 'regexp') aRegex++;
      }
    });
  } catch (e) { info('acorn-kruiscontrole mislukt (' + e.message + '); overgeslagen'); return; }
  eis(aStrings === stringsMetData && aRegex === regexTokens, 'kruiscontrole acorn: ' + aStrings + ' strings met data-* en ' + aRegex + ' regex-literals (eigen tokenizer: ' + stringsMetData + ' / ' + regexTokens + ')');
})();

/* ---- statische HTML: attributen op elementen buiten script en style ---- */
var htmlZonder = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, function (s) { return s.replace(/[^\n]/g, ' '); })
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, function (s) { return s.replace(/[^\n]/g, ' '); })
  .replace(/<!--[\s\S]*?-->/g, function (s) { return s.replace(/[^\n]/g, ' '); });
var schermen = [], rs = /<(aside|header|nav|footer|main|div)\b([^>]*)>/g;  // schermlabel: het dichtstbijzijnde view-blok (id="view-…"), anders aside/header/nav/footer/main
while ((m = rs.exec(htmlZonder))) {
  var idm = /\sid="([^"]+)"/.exec(m[2]);
  if (m[1] === 'div') { if (/\sclass="view\b/.test(m[2]) && idm) schermen.push({ offset: m.index, naam: idm[1] }); }
  else schermen.push({ offset: m.index, naam: idm ? idm[1] : m[1] });
}
function schermBij(offset) { var s = 'html'; for (var i = 0; i < schermen.length; i++) { if (schermen[i].offset > offset) break; s = schermen[i].naam; } return s; }
var htmlEmissies = 0, rt = /<[a-zA-Z][^>]*>/g;
while ((m = rt.exec(htmlZonder))) {
  var tag = m[0], ra = /\sdata-([a-z0-9-]+)(?:\s*=\s*("[^"]*"|'[^']*'))?/gi, ma;
  while ((ma = ra.exec(tag))) { htmlEmissies++; var sch = schermBij(m.index); attr(ma[1].toLowerCase()).emissies.push({ bron: 'html', regel: regelVan(m.index + ma.index), functie: null, label: 'HTML ' + sch, sectie: 'HTML · ' + sch, sub: '' }); }
}

/* ---- CSS: [data-xxx] in de stijlblokken ---- */
var cssSelectors = 0;
stijlen.forEach(function (st) { var rc = /\[data-([a-z0-9-]+)/gi, mc; while ((mc = rc.exec(st.tekst))) { cssSelectors++; attr(mc[1].toLowerCase()).stijl++; } });

/* ---- tests: grep van data-xxx (en dataset.xxx) in test/*.py, test/handig/*.py, test/*.js ---- */
var testBestanden = [];
['test', 'test/handig'].forEach(function (map) {
  fs.readdirSync(path.join(R, map)).forEach(function (b) {
    if (map === 'test' && !/\.(py|js)$/.test(b)) return;
    if (map === 'test/handig' && !/\.py$/.test(b)) return;
    if (b === 'handelingen.js') return;  // niet zichzelf meetellen
    testBestanden.push(map + '/' + b);
  });
});
testBestanden.sort();
testBestanden.forEach(function (tb) {
  var tekst = fs.readFileSync(path.join(R, tb), 'utf8'), rx = /data-([a-z0-9-]+)/gi, mt, tel = {};
  while ((mt = rx.exec(tekst))) tel[mt[1].toLowerCase()] = (tel[mt[1].toLowerCase()] || 0) + 1;
  rx = /dataset\.([A-Za-z0-9_]+)/g; while ((mt = rx.exec(tekst))) tel[kebab(mt[1])] = (tel[kebab(mt[1])] || 0) + 1;
  Object.keys(tel).forEach(function (naam) { if (ATTR[naam]) { ATTR[naam].tests[tb] = tel[naam]; ATTR[naam].testTotaal += tel[naam]; } else waarschuw('test ' + tb + ' noemt data-' + naam + ', dat index.html niet kent (verouderde test?)'); });
});

/* ---- classificatie per attribuut ---- */
function isHandelingConsumptie(c) { return !!c.listener && (c.wijze === 'dataset' || c.wijze === 'selector' || SELECTOR_METHODEN[c.wijze]); }
var namen = Object.keys(ATTR).sort(), SOORT_UITLEG = {
  handeling: 'afgevangen in een listener (closest/matches/querySelector/dataset) en uitgezonden',
  'dode-handler': 'afgevangen in een listener, maar nergens uitgezonden (FOUT)',
  gebruikt: 'in JS gelezen (getAttribute/dataset) of geselecteerd buiten een listener, en uitgezonden: parameter of toestand, geen handeling',
  'dode-lezer': 'in JS gelezen, maar nergens uitgezonden (waarschuwing)',
  stijl: 'uitgezonden en alleen in CSS gebruikt',
  'dood-markup': 'uitgezonden, maar nergens in JS of CSS gebruikt (waarschuwing)',
  'losse-css': 'alleen in CSS, nooit uitgezonden (waarschuwing)'
};
namen.forEach(function (naam) {
  var a = ATTR[naam], uit = a.emissies.length > 0, hand = a.consumpties.filter(isHandelingConsumptie), ander = a.consumpties.filter(function (c) { return !isHandelingConsumptie(c) && c.wijze !== 'removeAttribute'; });
  a.handelingConsumpties = hand.length; a.andereConsumpties = ander.length;
  // vorm: 'selector' = de listener zoekt het element op dit attribuut (closest/matches/querySelector); 'dataset' = alleen gelezen als dataset.xxx
  // in een listener (meestal een sleutel of parameter op het al gevonden element, zoals data-akidx of data-waarde)
  a.vorm = hand.some(function (c) { return c.wijze !== 'dataset'; }) ? 'selector' : (hand.length ? 'dataset' : '');
  if (hand.length) a.soort = uit ? 'handeling' : 'dode-handler';
  else if (ander.length) a.soort = uit ? 'gebruikt' : 'dode-lezer';
  else if (uit) a.soort = a.stijl ? 'stijl' : 'dood-markup';
  else a.soort = a.stijl ? 'losse-css' : 'onbekend';
  a.listeners = hand.reduce(function (acc, c) { var k = c.listener + (c.viaNaam ? ' (op naam)' : ''); if (acc.indexOf(k) < 0) acc.push(k); return acc; }, []).sort();
});

/* ---- secties: dekking per sectie en per functie (op basis van waar de handeling wordt uitgezonden) ---- */
var SECTIE_TABEL = {};
namen.forEach(function (naam) {
  var a = ATTR[naam]; if (a.soort !== 'handeling') return;
  var gezien = {};
  a.emissies.forEach(function (e) {
    var sleutel = e.sectie; if (gezien[sleutel]) return; gezien[sleutel] = true;
    var s = SECTIE_TABEL[sleutel] || (SECTIE_TABEL[sleutel] = { naam: sleutel, handelingen: [], getest: [], zonderTest: [], functies: {} });
    s.handelingen.push(naam); (a.testTotaal ? s.getest : s.zonderTest).push(naam);
  });
  a.emissies.forEach(function (e) { var s = SECTIE_TABEL[e.sectie], f = s.functies[e.label] || (s.functies[e.label] = []); if (f.indexOf(naam) < 0) f.push(naam); });
});
var secties = Object.keys(SECTIE_TABEL).map(function (k) { var s = SECTIE_TABEL[k]; s.dekking = s.handelingen.length ? Math.round(100 * s.getest.length / s.handelingen.length) : 100; return s; });
secties.sort(function (a, b) { return a.dekking - b.dekking || b.handelingen.length - a.handelingen.length || (a.naam < b.naam ? -1 : 1); });

/* ---- resultaten ---- */
var per = {}; namen.forEach(function (n) { per[ATTR[n].soort] = (per[ATTR[n].soort] || 0) + 1; });
var handelingen = namen.filter(function (n) { return ATTR[n].soort === 'handeling'; });
var dodeHandlers = namen.filter(function (n) { return ATTR[n].soort === 'dode-handler'; });
var doodMarkup = namen.filter(function (n) { return ATTR[n].soort === 'dood-markup'; });
var dodeLezers = namen.filter(function (n) { return ATTR[n].soort === 'dode-lezer'; });
var losseCss = namen.filter(function (n) { return ATTR[n].soort === 'losse-css'; });
var zonderTest = handelingen.filter(function (n) { return !ATTR[n].testTotaal; });
var gebruiktZonderTest = namen.filter(function (n) { return ATTR[n].soort === 'gebruikt' && !ATTR[n].testTotaal; });

eis(scriptVermeldingenRuw > 0 && namen.length > 0, namen.length + ' verschillende data-attributen; ' + scriptVermeldingenRuw + ' vermeldingen in het script, ' + htmlEmissies + ' in de statische HTML, ' + cssSelectors + ' CSS-selectors, ' + testBestanden.length + ' testbestanden');
info('per soort: ' + Object.keys(per).sort().map(function (k) { return k + ' ' + per[k]; }).join(', '));
if (!dodeHandlers.length) eis(true, 'geen dode handlers (elk in een listener afgevangen attribuut wordt ook uitgezonden)');
dodeHandlers.forEach(function (n) {
  var c = ATTR[n].consumpties.filter(isHandelingConsumptie)[0];
  eis(false, 'dode handler data-' + n + ': afgevangen via ' + c.wijze + ' in de ' + c.listener + '-listener (regel ' + c.regel + ', ' + c.label + '), maar nergens uitgezonden');
});
info('dood markup (uitgezonden, nergens in JS of CSS gebruikt): ' + doodMarkup.length + (doodMarkup.length ? ' → ' + doodMarkup.map(function (n) { return 'data-' + n + ' (regel ' + ATTR[n].emissies[0].regel + ')'; }).join(', ') : ''));
if (dodeLezers.length) info('dode lezers (in JS gelezen, nergens uitgezonden): ' + dodeLezers.map(function (n) { return 'data-' + n; }).join(', '));
if (losseCss.length) info('losse CSS-selectors (nooit uitgezonden): ' + losseCss.map(function (n) { return 'data-' + n; }).join(', '));
info('handelingen zonder enige test: ' + zonderTest.length + ' van ' + handelingen.length + ' (' + Math.round(100 * (handelingen.length - zonderTest.length) / Math.max(1, handelingen.length)) + '% gedekt); via selector ' + handelingen.filter(function (n) { return ATTR[n].vorm === 'selector' && !ATTR[n].testTotaal; }).length + ' van ' + handelingen.filter(function (n) { return ATTR[n].vorm === 'selector'; }).length + ', alleen dataset ' + handelingen.filter(function (n) { return ATTR[n].vorm === 'dataset' && !ATTR[n].testTotaal; }).length + ' van ' + handelingen.filter(function (n) { return ATTR[n].vorm === 'dataset'; }).length);
// v7.3 (H4/H5): de lijst altijd printen en de drempel bewaken; een nieuwe handeling hoort meteen een test te krijgen (meestal in test/handig/golf4.py)
eis(zonderTest.length <= MAX_ZONDER_TEST, 'hoogstens ' + MAX_ZONDER_TEST + ' handelingen zonder test: nu ' + zonderTest.length + (zonderTest.length ? ' → ' + zonderTest.map(function (n) { return 'data-' + n; }).join(', ') : ''));
info('secties met de laagste dekking (minstens 3 handelingen): ' + secties.filter(function (s) { return s.handelingen.length >= 3; }).slice(0, 4).map(function (s) { return s.naam + ' ' + s.dekking + '% (' + s.getest.length + '/' + s.handelingen.length + ')'; }).join('; '));

/* ---- schrijven: json en markdown ---- */
var looptijd = (Date.now() - START) / 1000;
var viaSelector = handelingen.filter(function (n) { return ATTR[n].vorm === 'selector'; }), viaDataset = handelingen.filter(function (n) { return ATTR[n].vorm === 'dataset'; });
var cijfers = {
  attributen: namen.length, handelingen: handelingen.length, handelingen_via_selector: viaSelector.length, handelingen_alleen_dataset: viaDataset.length,
  handelingen_zonder_test: zonderTest.length, handelingen_via_selector_zonder_test: viaSelector.filter(function (n) { return !ATTR[n].testTotaal; }).length,
  dekking_handelingen_pct: Math.round(100 * (handelingen.length - zonderTest.length) / Math.max(1, handelingen.length)),
  dode_handlers: dodeHandlers.length, dood_markup: doodMarkup.length, dode_lezers: dodeLezers.length, losse_css: losseCss.length, gebruikt: per.gebruikt || 0, gebruikt_zonder_test: gebruiktZonderTest.length, stijl: per.stijl || 0,
  vermeldingen_script: scriptVermeldingenRuw, emissies_html: htmlEmissies, css_selectors: cssSelectors, secties: secties.length, testbestanden: testBestanden.length, waarschuwingen: waarschuwingen.length, tokens: totaalTokens
};
function uitgezondenIn(a) { var g = {}; a.emissies.forEach(function (e) { var k = e.label + ' r' + e.regel + (e.bron === 'string' ? '' : ' [' + e.bron + ']'); g[k] = 1; }); return Object.keys(g); }
function afgevangenIn(a) { var g = {}; a.consumpties.forEach(function (c) { var k = c.wijze + (c.listener ? ' in ' + c.listener + '-listener' : '') + ' r' + c.regel; g[k] = 1; }); return Object.keys(g); }
var json = {
  gemeten: new Date().toISOString(), bron: 'index.html', looptijd_s: looptijd, cijfers: cijfers,
  soorten: SOORT_UITLEG,
  dode_handlers: dodeHandlers.map(function (n) { return { attribuut: 'data-' + n, afgevangen: afgevangenIn(ATTR[n]) }; }),
  dood_markup: doodMarkup.map(function (n) { return { attribuut: 'data-' + n, uitgezonden: uitgezondenIn(ATTR[n]) }; }),
  dode_lezers: dodeLezers.map(function (n) { return { attribuut: 'data-' + n, gelezen: afgevangenIn(ATTR[n]) }; }),
  losse_css: losseCss.map(function (n) { return 'data-' + n; }),
  handelingen_zonder_test: zonderTest.map(function (n) { var a = ATTR[n]; return { attribuut: 'data-' + n, vorm: a.vorm, listeners: a.listeners, uitgezonden: uitgezondenIn(a), afgevangen: afgevangenIn(a), secties: a.emissies.map(function (e) { return e.sectie; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }) }; }),
  secties: secties.map(function (s) { return { sectie: s.naam, handelingen: s.handelingen.length, getest: s.getest.length, dekking_pct: s.dekking, zonder_test: s.zonderTest.map(function (n) { return 'data-' + n; }), functies: Object.keys(s.functies).sort().map(function (f) { return { functie: f, handelingen: s.functies[f].map(function (n) { return 'data-' + n; }), zonder_test: s.functies[f].filter(function (n) { return !ATTR[n].testTotaal; }).map(function (n) { return 'data-' + n; }) }; }) }; }),
  attributen: namen.map(function (n) { var a = ATTR[n]; return { attribuut: 'data-' + n, soort: a.soort, vorm: a.vorm, listeners: a.listeners, emissies: a.emissies, consumpties: a.consumpties, css: a.stijl, tests: a.tests, test_totaal: a.testTotaal }; }),
  testbestanden: testBestanden, waarschuwingen: waarschuwingen
};
fs.mkdirSync(UIT, { recursive: true });
fs.writeFileSync(path.join(UIT, 'handelingen.json'), JSON.stringify(json, null, 1));

function rij(cellen) { return '| ' + cellen.map(function (c) { return String(c).replace(/\|/g, '\\|'); }).join(' | ') + ' |'; }
function code(n) { return '`data-' + n + '`'; }
var md = [];
md.push('# Handelingen in index.html (data-*-attributen)', '', 'Gemeten ' + json.gemeten.slice(0, 16).replace('T', ' ') + ' · `node test/handelingen.js` · looptijd ' + looptijd.toFixed(2) + ' s', '');
md.push('Een **handeling** is een data-attribuut dat een listener afvangt (closest/matches/querySelector(All) of dataset in een click-, change-, input-, keydown- of pointer-handler) én dat de app uitzendt (HTML-string in het script, statische HTML, setAttribute of dataset-schrijven). Tests: `data-xxx` gegrept in `test/*.py`, `test/handig/*.py` en `test/*.js`.', '');
md.push('## Kerncijfers', '', rij(['cijfer', 'waarde']), rij(['---', '---']));
Object.keys(cijfers).forEach(function (k) { md.push(rij([k, cijfers[k]])); });
md.push('', 'Soorten: ' + Object.keys(SOORT_UITLEG).map(function (k) { return '**' + k + '** (' + (per[k] || 0) + '): ' + SOORT_UITLEG[k]; }).join('; ') + '.', '');
md.push('## Dode handlers (afgevangen, nooit uitgezonden) — ' + (dodeHandlers.length ? 'FOUT' : 'geen'), '');
if (dodeHandlers.length) { md.push(rij(['attribuut', 'afgevangen in']), rij(['---', '---'])); dodeHandlers.forEach(function (n) { md.push(rij([code(n), afgevangenIn(ATTR[n]).join('; ')])); }); md.push(''); }
md.push('## Dood markup (uitgezonden, nergens in JS of CSS gebruikt) — ' + doodMarkup.length, '');
if (doodMarkup.length) { md.push(rij(['attribuut', 'uitgezonden in']), rij(['---', '---'])); doodMarkup.forEach(function (n) { md.push(rij([code(n), uitgezondenIn(ATTR[n]).join('; ')])); }); md.push(''); }
if (dodeLezers.length) { md.push('## Dode lezers (in JS gelezen, nergens uitgezonden) — ' + dodeLezers.length, '', rij(['attribuut', 'gelezen in']), rij(['---', '---'])); dodeLezers.forEach(function (n) { md.push(rij([code(n), afgevangenIn(ATTR[n]).join('; ')])); }); md.push(''); }
if (losseCss.length) md.push('## Losse CSS-selectors (nooit uitgezonden) — ' + losseCss.length, '', losseCss.map(code).join(', '), '');
md.push('## Handelingen zonder enige test — ' + zonderTest.length + ' van ' + handelingen.length, '');
md.push('Vorm: *selector* = de listener zoekt het element op dit attribuut (de echte handeling); *dataset* = alleen als `dataset.xxx` gelezen in een listener (sleutel of parameter op het al gevonden element).', '');
md.push(rij(['attribuut', 'vorm', 'listener', 'uitgezonden in', 'afgevangen in', 'sectie']), rij(['---', '---', '---', '---', '---', '---']));
zonderTest.forEach(function (n) { var a = ATTR[n]; md.push(rij([code(n), a.vorm, a.listeners.join(', '), uitgezondenIn(a).slice(0, 4).join('; ') + (uitgezondenIn(a).length > 4 ? ' …' : ''), afgevangenIn(a).filter(function (s) { return /listener/.test(s); }).slice(0, 3).join('; '), a.emissies.map(function (e) { return e.sectie; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(', ')])); });
md.push('', '## Dekking per sectie (waar de handeling wordt uitgezonden)', '');
md.push(rij(['sectie', 'handelingen', 'getest', 'dekking', 'zonder test']), rij(['---', '---', '---', '---', '---']));
secties.forEach(function (s) { md.push(rij([s.naam, s.handelingen.length, s.getest.length, s.dekking + '%', s.zonderTest.map(code).join(', ') || '—'])); });
md.push('', '### Per functie', '');
md.push(rij(['sectie', 'functie', 'handelingen', 'zonder test']), rij(['---', '---', '---', '---']));
secties.forEach(function (s) { Object.keys(s.functies).sort().forEach(function (f) { var zt = s.functies[f].filter(function (n) { return !ATTR[n].testTotaal; }); md.push(rij([s.naam, '`' + f + '`', s.functies[f].length, zt.map(code).join(', ') || '—'])); }); });
if (gebruiktZonderTest.length) md.push('', '## Gelezen attributen (parameter/toestand) zonder test — ' + gebruiktZonderTest.length, '', gebruiktZonderTest.map(code).join(', '));
md.push('', '## Alle attributen', '');
md.push(rij(['attribuut', 'soort', 'vorm', 'listeners', 'uitgezonden', 'afgevangen/gelezen', 'css', 'tests']), rij(['---', '---', '---', '---', '---', '---', '---', '---']));
namen.forEach(function (n) { var a = ATTR[n]; md.push(rij([code(n), a.soort, a.vorm || '—', a.listeners.join(', ') || '—', a.emissies.length, a.consumpties.length, a.stijl, a.testTotaal + (a.testTotaal ? ' (' + Object.keys(a.tests).length + ' best.)' : '')])); });
if (waarschuwingen.length) md.push('', '## Waarschuwingen', '', waarschuwingen.map(function (w) { return '- ' + w; }).join('\n'));
md.push('');
fs.writeFileSync(path.join(UIT, 'handelingen.md'), md.join('\n'));
eis(fs.existsSync(path.join(UIT, 'handelingen.md')) && fs.existsSync(path.join(UIT, 'handelingen.json')), 'rapport geschreven: test/shots/robuust/handelingen.md en handelingen.json');

console.log('looptijd: ' + looptijd.toFixed(2) + ' s');
if (fouten) { console.log('FOUTEN: ' + fouten); process.exit(1); }
console.log('ALLES GOED');
