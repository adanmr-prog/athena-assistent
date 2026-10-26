// v7.2: kruistabel van het API-oppervlak, puur uit de broncode (geen backend, geen browser).
// Bronnen: (1) de app: run('apiX' …) en runPortaal('apiX' …) in index.html, ook namen die via een variabele of naamlijst lopen
//          (laadTab('apiTaken'), { school: 'apiSchool' }, soort === 'tag' ? 'apiTagHernoem' : …);
//          (2) de backend: function apiX( in backend/Code.gs, plus PORTAAL_FUNCTIES, de assistent-tools BREIN_LEES/BREIN_ACTIES en TRIGGERS;
//          (3) de mock: if fn == 'apiX' in test/mock_backend.py;
//          (4) de tests: elke 'apiX' in test/*.py, test/*.js, test/handig/*.py, server/test/*.js, server/vergelijk.js en server/dekking.js,
//          gesplitst in direct (een gerichte aanroep met controle) en indirect (de golden master van vergelijk.js en lussen over alle rollen).
// Rapport: app-aanroepen zonder backendfunctie (bug), backendfuncties die de app nooit aanroept (trigger/intern/server of dood),
//          app-aanroepen zonder mock, api's zonder enige test, api's die alleen indirect geraakt worden.
// Gebruik: node test/kruistabel.js  → "ALLES GOED" (exitcode 0) als geen enkele app-aanroep een backendfunctie mist, anders "FOUTEN: n" (exitcode 1).
//          Schrijft test/shots/robuust/kruistabel.md en kruistabel.json.
var fs = require('fs'), path = require('path'), R = path.join(__dirname, '..'), begin = Date.now();
var UIT_MAP = path.join(R, 'test', 'shots', 'robuust');
var fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function info(wat) { console.log('info ' + wat); }
function lees(p) { return fs.readFileSync(path.join(R, p), 'utf8'); }
function regels(t) { return t.split('\n'); }
function uniek(l) { var z = {}; return l.filter(function (x) { if (z[x]) return false; z[x] = 1; return true; }); }
function sorteer(l) { return l.slice().sort(); }
function bestandenIn(map, patroon) {
  var vol = path.join(R, map); if (!fs.existsSync(vol)) return [];
  return fs.readdirSync(vol).filter(function (n) { return patroon.test(n); }).sort().map(function (n) { return map + '/' + n; });
}
var TOKEN_BRON = "(['\"])(api[A-Z][A-Za-z0-9_]*)\\1";  // 'apiX' of "apiX" als stringliteral
function tokens(regel) { var r = new RegExp(TOKEN_BRON, 'g'), m, uit = []; while ((m = r.exec(regel))) uit.push({ naam: m[2], positie: m.index }); return uit; }
// Tekst zonder stringinhoud en zonder //-commentaar, om functieaanroepen te herkennen zonder dat een URL of een commentaarregel meetelt
function kaal(regel) {
  var uit = '', i = 0, n = regel.length;
  while (i < n) {
    var c = regel[i];
    if (c === "'" || c === '"') { var q = c; i++; while (i < n && regel[i] !== q) { if (regel[i] === '\\') i++; i++; } i++; uit += '""'; continue; }
    if (c === '/' && regel[i + 1] === '/') break;
    uit += c; i++;
  }
  return uit;
}

/* ===== 1. De app ===== */
var APP = {};  // naam -> { direct: [regel], portaal: [regel], indirect: [{ regel, context }], element: [regel] }
(function () {
  var lijnen = regels(lees('index.html'));
  lijnen.forEach(function (l, i) {
    tokens(l).forEach(function (t) {
      var voor = l.slice(Math.max(0, t.positie - 60), t.positie), soort;
      if (/\brunPortaal\(\s*$/.test(voor)) soort = 'portaal';
      else if (/\brun\(\s*$/.test(voor)) soort = 'direct';
      else if (/\bel\(\s*$|getElementById\(\s*$|\b(id|for|name|aria-[a-z]+)=$/.test(voor)) soort = 'element';  // een element-id zoals apiInput, geen api
      else soort = 'indirect';
      var a = APP[t.naam] || (APP[t.naam] = { direct: [], portaal: [], indirect: [], element: [] });
      if (soort === 'indirect') a.indirect.push({ regel: i + 1, context: voor.replace(/\s+/g, ' ').trim().slice(-45) });
      else a[soort].push(i + 1);
    });
  });
})();
function appRoept(naam) { var a = APP[naam]; return !!a && (a.direct.length + a.indirect.length + a.portaal.length) > 0; }
var APP_NAMEN = sorteer(Object.keys(APP).filter(appRoept));
var APP_PORTAAL = APP_NAMEN.filter(function (n) { return APP[n].portaal.length > 0; });
var APP_RUN = APP_NAMEN.filter(function (n) { return APP[n].direct.length + APP[n].indirect.length > 0; });

/* ===== 2. De backend ===== */
var CODE = lees('backend/Code.gs'), CODE_REGELS = regels(CODE);
var BACKEND = {};        // naam -> regel van function apiX(
var GENEST = [];         // function apiX( die niet op kolom 0 staat (niet bereikbaar via globalThis)
var TOP = [];            // alle top-level functies [{ naam, regel }] voor "aangeroepen vanuit"
CODE_REGELS.forEach(function (l, i) {
  var m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(l);
  if (m) { TOP.push({ naam: m[1], regel: i + 1 }); if (/^api[A-Z]/.test(m[1])) BACKEND[m[1]] = i + 1; return; }
  var g = /^\s+function\s+(api[A-Z]\w*)\s*\(/.exec(l); if (g) GENEST.push({ naam: g[1], regel: i + 1 });
});
function omvattendeFunctie(regel) { var f = null; for (var i = 0; i < TOP.length && TOP[i].regel <= regel; i++) f = TOP[i]; return f ? f.naam : '(buiten een functie)'; }
function functieBody(naam) {  // regels van een top-level functie tot de volgende top-level functie
  for (var i = 0; i < TOP.length; i++) if (TOP[i].naam === naam) return CODE_REGELS.slice(TOP[i].regel - 1, i + 1 < TOP.length ? TOP[i + 1].regel - 1 : CODE_REGELS.length);
  return [];
}
function lijstUit(txt, naam) {
  var m = new RegExp('var\\s+' + naam + '\\s*=\\s*\\[([^\\]]*)\\]').exec(txt); if (!m) return null;
  var uit = [], r = /['"]([^'"]+)['"]/g, x; while ((x = r.exec(m[1]))) uit.push(x[1]); return uit;
}
// De sleutels op het eerste niveau van een objectliteral (var NAAM = { a: {…}, b: {…} }), met strings en //-commentaar overgeslagen
function sleutelsUit(txt, naam) {
  var start = txt.indexOf('var ' + naam + ' = {'); if (start < 0) return null;
  var i = txt.indexOf('{', start), n = txt.length, diepte = 0, sleutels = [], verwacht = false;
  for (; i < n; i++) {
    var c = txt[i];
    if (c === '/' && txt[i + 1] === '/') { i = txt.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === "'" || c === '"') { var q = c; i++; while (i < n && txt[i] !== q) { if (txt[i] === '\\') i++; i++; } continue; }
    if (c === '{' || c === '[' || c === '(') { diepte++; if (diepte === 1) verwacht = true; continue; }
    if (c === '}' || c === ']' || c === ')') { diepte--; if (diepte === 0) break; continue; }
    if (diepte === 1 && c === ',') { verwacht = true; continue; }
    if (diepte === 1 && verwacht && /[A-Za-z_$]/.test(c)) { var m = /^([A-Za-z_$][\w$]*)\s*:/.exec(txt.slice(i, i + 80)); if (m) { sleutels.push(m[1]); i += m[1].length - 1; } verwacht = false; }
  }
  return sleutels;
}
var PORTAAL_FUNCTIES = lijstUit(CODE, 'PORTAAL_FUNCTIES') || [];
var TRIGGERS = lijstUit(CODE, 'TRIGGERS') || [];
var BREIN_LEES = sleutelsUit(CODE, 'BREIN_LEES') || [], BREIN_ACTIES = sleutelsUit(CODE, 'BREIN_ACTIES') || [];
var DISPATCH = []; CODE_REGELS.forEach(function (l, i) { if (/globalThis\[fn\]/.test(l)) DISPATCH.push(i + 1); });
// Interne aanroepen: apiX( op een andere regel dan de eigen definitie, buiten strings en commentaar; met de omvattende functie
var INTERN = {};  // naam -> [{ regel, vanuit }]
CODE_REGELS.forEach(function (l, i) {
  var k = kaal(l), r = /\b(api[A-Z][A-Za-z0-9_]*)\s*\(/g, m;
  while ((m = r.exec(k))) {
    if (BACKEND[m[1]] === i + 1) continue;  // de definitie zelf
    if (/^\s*function\s/.test(l) && new RegExp('function\\s+' + m[1] + '\\s*\\(').test(l)) continue;  // een geneste definitie
    (INTERN[m[1]] || (INTERN[m[1]] = [])).push({ regel: i + 1, vanuit: omvattendeFunctie(i + 1) });
  }
});
function soortAanroeper(naam) { if (TRIGGERS.indexOf(naam) >= 0 || /Trigger$/.test(naam)) return 'trigger'; if (/^apiBrein/.test(naam) || /^brein/.test(naam)) return 'brein'; return 'intern'; }
// Welke api-functies de assistent-acties uitvoeren (apiBreinUitvoeren) en waar elke tool wordt afgehandeld
function toolAfhandeling(functie, variabele, sleutels) {
  var body = functieBody(functie), uit = {};
  sleutels.forEach(function (s) { uit[s] = { afgehandeld: false, roept: [] }; });
  var huidig = null;
  body.forEach(function (l) {
    var k = kaal(l), m = new RegExp('\\b' + variabele + "\\s*===\\s*'([a-z_]+)'").exec(l);
    if (m && sleutels.indexOf(m[1]) >= 0 && !/&&|\|\|/.test(k.split('if')[1] || '')) { huidig = m[1]; uit[huidig].afgehandeld = true; }
    else if (m && sleutels.indexOf(m[1]) >= 0) { uit[m[1]].afgehandeld = uit[m[1]].afgehandeld || /return|throw/.test(k) && !/throw/.test(k); }
    if (huidig) { var r = /\b(api[A-Z][A-Za-z0-9_]*)\s*\(/g, x; while ((x = r.exec(k))) if (uit[huidig].roept.indexOf(x[1]) < 0) uit[huidig].roept.push(x[1]); }
  });
  return uit;
}
var LEES_AFH = toolAfhandeling('breinLees', 'naam', BREIN_LEES), ACTIE_AFH = toolAfhandeling('apiBreinUitvoeren', 'soort', BREIN_ACTIES);

/* ===== 3. De mock ===== */
var MOCK = {};  // naam -> { regels: [], in: [def-naam] }
(function () {
  var lijnen = regels(lees('test/mock_backend.py')), def = '(module)';
  lijnen.forEach(function (l, i) {
    var d = /^def\s+(\w+)\s*\(/.exec(l); if (d) def = d[1];
    if (!/\bfn\s*(==|!=|in\b|not\s+in\b)/.test(l)) return;  // if fn == 'apiX':, elif fn == …, fn in (…), fn not in (…)
    tokens(l).forEach(function (t) { var m = MOCK[t.naam] || (MOCK[t.naam] = { regels: [], in: [] }); m.regels.push(i + 1); if (m.in.indexOf(def) < 0) m.in.push(def); });
  });
})();
function mockHeeft(naam) { return !!MOCK[naam]; }
var MOCK_PORTAAL = Object.keys(MOCK).filter(function (n) { return MOCK[n].in.indexOf('handle_portaal') >= 0; }).sort();

/* ===== 4. De tests ===== */
var TEST_BESTANDEN = [].concat(
  bestandenIn('test', /\.(py|js)$/).filter(function (p) { return !/mock_backend\.py$|kruistabel\.js$/.test(p); }),
  bestandenIn('test/handig', /\.py$/), bestandenIn('server/test', /\.js$/), ['server/vergelijk.js', 'server/dekking.js']);
var ROLLEN_LUS = /\[\s*(['"])demo-[a-z]+\1(\s*,\s*(['"])demo-[a-z]+\3)+\s*\]\s*\.forEach/;  // een lus over alle rollen: "laadt het als iedereen", geen gerichte controle
var TESTS = {};  // naam -> { direct: { bestand: [regels] }, indirect: {…}, uitgesloten: {…} }
TEST_BESTANDEN.forEach(function (b) {
  if (!fs.existsSync(path.join(R, b))) return;
  var golden = /server\/vergelijk\.js$/.test(b);
  regels(lees(b)).forEach(function (l, i) {
    var soort = golden ? (/^\s*var\s+NIET_VERGELEKEN\b/.test(l) ? 'uitgesloten' : 'indirect') : (ROLLEN_LUS.test(l) ? 'indirect' : 'direct');
    tokens(l).forEach(function (t) {
      var e = TESTS[t.naam] || (TESTS[t.naam] = { direct: {}, indirect: {}, uitgesloten: {} });
      (e[soort][b] || (e[soort][b] = [])).push(i + 1);
    });
  });
});
function testSoorten(naam) { var e = TESTS[naam]; return { direct: e ? Object.keys(e.direct) : [], indirect: e ? Object.keys(e.indirect) : [], uitgesloten: e ? Object.keys(e.uitgesloten) : [] }; }

/* ===== 5. Overige code en het contract (extra, niet in de eindcontrole) ===== */
var OVERIG = {};  // naam -> ['server/migratie.js:62', …] — code buiten app, backend, mock en tests
[].concat(bestandenIn('server', /\.js$/), bestandenIn('api', /\.js$/), bestandenIn('demo', /\.js$/)).filter(function (p) { return !/server\/(vergelijk|dekking)\.js$/.test(p); }).forEach(function (b) {
  regels(lees(b)).forEach(function (l, i) { tokens(l).forEach(function (t) { (OVERIG[t.naam] || (OVERIG[t.naam] = [])).push(b + ':' + (i + 1)); }); });
});
var CONTRACT = { skill: {}, readme: {} };
(function () {
  var s = '.claude/skills/athena-backend-api/SKILL.md', r = 'backend/README.md', woord = /\bapi[A-Z][A-Za-z0-9_]*\b/g, m;
  var PLAATSHOUDER = /^api(Naam|X|Xxx|Functie|Iets)$/;  // voorbeeldnamen in de uitleg, geen functies
  if (fs.existsSync(path.join(R, s))) { var ts = lees(s); while ((m = woord.exec(ts))) if (!PLAATSHOUDER.test(m[0])) CONTRACT.skill[m[0]] = 1; }
  if (fs.existsSync(path.join(R, r))) { var tr = lees(r); woord.lastIndex = 0; while ((m = woord.exec(tr))) if (!PLAATSHOUDER.test(m[0])) CONTRACT.readme[m[0]] = 1; }
})();

/* ===== De kruistabel ===== */
var ALLE = sorteer(uniek(APP_NAMEN.concat(Object.keys(BACKEND), Object.keys(MOCK), Object.keys(TESTS), PORTAAL_FUNCTIES)));
var TABEL = {};
ALLE.forEach(function (n) {
  var a = APP[n] || { direct: [], portaal: [], indirect: [], element: [] }, ts = testSoorten(n), intern = INTERN[n] || [];
  var rij = {
    app: { direct: a.direct, indirect: a.indirect, portaal: a.portaal, roept: appRoept(n) },
    backend: BACKEND[n] ? { regel: BACKEND[n], portaal: PORTAAL_FUNCTIES.indexOf(n) >= 0, internAangeroepen: intern } : null,
    mock: MOCK[n] || null,
    tests: TESTS[n] || { direct: {}, indirect: {}, uitgesloten: {} },
    overigeCode: OVERIG[n] || [],
    contract: { skill: !!CONTRACT.skill[n], readme: !!CONTRACT.readme[n] },
    status: []
  };
  var viaRun = a.direct.length + a.indirect.length > 0, viaPortaal = a.portaal.length > 0;
  if (viaRun && (!BACKEND[n] || PORTAAL_FUNCTIES.indexOf(n) >= 0)) rij.status.push('BUG: app roept aan, backend ' + (BACKEND[n] ? 'weigert (portaalfunctie via koppelcode)' : 'kent de functie niet'));
  if (viaPortaal && PORTAAL_FUNCTIES.indexOf(n) < 0) rij.status.push('BUG: runPortaal, maar niet in PORTAAL_FUNCTIES');
  if (BACKEND[n] && !appRoept(n)) {
    var via = uniek(intern.map(function (x) { return x.vanuit; })), soorten = uniek(via.map(soortAanroeper));
    if (via.length) rij.status.push((soorten.indexOf('trigger') >= 0 ? 'trigger' : soorten.indexOf('brein') >= 0 ? 'brein' : 'intern') + ' (vanuit ' + via.join(', ') + ')');
    if (rij.overigeCode.length) rij.status.push('server/overige code (' + uniek(rij.overigeCode.map(function (x) { return x.split(':')[0]; })).join(', ') + ')');
    if (!via.length && !rij.overigeCode.length) rij.status.push('dood? (geen aanroep in app, backend of server; wel in ' + [MOCK[n] ? 'mock' : '', ts.direct.length + ts.indirect.length ? 'tests' : '', ts.uitgesloten.length ? 'NIET_VERGELEKEN' : '', rij.contract.skill || rij.contract.readme ? 'docs' : ''].filter(Boolean).join('/') + ')');
  }
  if (appRoept(n) && !MOCK[n]) rij.status.push('geen mock');
  if (BACKEND[n] && !ts.direct.length && !ts.indirect.length) rij.status.push('geen test' + (MOCK[n] && appRoept(n) ? ' (mock aanwezig: mogelijk via de UI in test_app.py)' : ''));
  else if (BACKEND[n] && !ts.direct.length) rij.status.push('alleen indirect');
  if (!BACKEND[n] && !appRoept(n)) rij.status.push('alleen in mock/tests, geen backend');
  TABEL[n] = rij;
});

var RAPPORT = {
  appZonderBackend: ALLE.filter(function (n) { return TABEL[n].status.some(function (s) { return /^BUG/.test(s); }); }),
  backendZonderApp: Object.keys(BACKEND).sort().filter(function (n) { return !appRoept(n); }).map(function (n) { return { naam: n, regel: BACKEND[n], status: TABEL[n].status.filter(function (s) { return !/^geen test|^alleen indirect|^geen mock/.test(s); }).join('; ') || '—', tests: testSoorten(n), mock: mockHeeft(n) }; }),
  appZonderMock: APP_NAMEN.filter(function (n) { return !mockHeeft(n); }),
  zonderTest: Object.keys(BACKEND).sort().filter(function (n) { var t = testSoorten(n); return !t.direct.length && !t.indirect.length; }).map(function (n) { return { naam: n, app: appRoept(n), mock: mockHeeft(n), uitgesloten: testSoorten(n).uitgesloten.length > 0 }; }),
  alleenIndirect: Object.keys(BACKEND).sort().filter(function (n) { var t = testSoorten(n); return !t.direct.length && t.indirect.length > 0; }).map(function (n) { return { naam: n, via: testSoorten(n).indirect }; }),
  genesteDefinities: GENEST,
  mockZonderBackend: Object.keys(MOCK).sort().filter(function (n) { return !BACKEND[n]; }),
  testsZonderBackend: Object.keys(TESTS).sort().filter(function (n) { return !BACKEND[n]; }),
  contract: {
    backendNietInSkill: Object.keys(BACKEND).sort().filter(function (n) { return !CONTRACT.skill[n]; }),
    backendNietInReadme: Object.keys(BACKEND).sort().filter(function (n) { return !CONTRACT.readme[n]; }),
    skillZonderBackend: Object.keys(CONTRACT.skill).sort().filter(function (n) { return !BACKEND[n]; }),
    readmeZonderBackend: Object.keys(CONTRACT.readme).sort().filter(function (n) { return !BACKEND[n]; })
  }
};
var TRIGGER_INFO = TRIGGERS.map(function (t) {
  var gedef = TOP.some(function (f) { return f.naam === t; }), inTests = {};
  TEST_BESTANDEN.forEach(function (b) { if (fs.existsSync(path.join(R, b)) && new RegExp('\\b' + t + '\\b').test(lees(b))) inTests[b] = 1; });
  // elke verwijzing naar een top-level functie in de body telt: ook als referentie (metLock(indexeerDocumenten), [['vog', vogRun], …])
  var roept = []; functieBody(t).forEach(function (l) { var r = /\b([A-Za-z_$][\w$]*)\b/g, m, k = kaal(l); while ((m = r.exec(k))) if (m[1] !== t && TOP.some(function (f) { return f.naam === m[1]; }) && roept.indexOf(m[1]) < 0) roept.push(m[1]); });
  return { naam: t, gedefinieerd: gedef, roept: roept, tests: Object.keys(inTests), mock: /\b/.test(t) && new RegExp("'" + t.replace(/Trigger$/, '') + "'|'" + t + "'").test(lees('test/mock_backend.py')) };
});
var TRIGGER_ONGEDEF = TRIGGERS.filter(function (t) { return !TOP.some(function (f) { return f.naam === t; }); });
var TRIGGER_LOS = TOP.filter(function (f) { return /Trigger$/.test(f.naam) && TRIGGERS.indexOf(f.naam) < 0; }).map(function (f) { return f.naam; });
var BREIN_INFO = {
  lees: BREIN_LEES.map(function (k) { return { tool: k, via: 'apiBrein → breinLees', afgehandeld: LEES_AFH[k].afgehandeld, roept: LEES_AFH[k].roept, tests: TEST_BESTANDEN.filter(function (b) { return fs.existsSync(path.join(R, b)) && new RegExp("'" + k + "'").test(lees(b)); }), mock: new RegExp("'" + k + "'").test(lees('test/mock_backend.py')) }; }),
  acties: BREIN_ACTIES.map(function (k) { return { tool: k, via: 'apiBreinUitvoeren', afgehandeld: ACTIE_AFH[k].afgehandeld, roept: ACTIE_AFH[k].roept, tests: TEST_BESTANDEN.filter(function (b) { return fs.existsSync(path.join(R, b)) && new RegExp("'" + k + "'").test(lees(b)); }), mock: new RegExp("'" + k + "'").test(lees('test/mock_backend.py')) }; })
};

/* ===== Controles ===== */
console.log('Kruistabel API-oppervlak · ' + new Date().toISOString().slice(0, 16) + 'Z');
info('app: ' + APP_NAMEN.length + ' api-namen (' + APP_RUN.length + ' via run, ' + APP_PORTAAL.length + ' via runPortaal; ' + Object.keys(APP).filter(function (n) { return !appRoept(n); }).length + ' element-id\'s overgeslagen: ' + Object.keys(APP).filter(function (n) { return !appRoept(n); }).join(', ') + ')');
info('backend: ' + Object.keys(BACKEND).length + ' api-functies, ' + PORTAAL_FUNCTIES.length + ' portaalfuncties, ' + TRIGGERS.length + ' triggers, ' + BREIN_LEES.length + ' leestools, ' + BREIN_ACTIES.length + ' acties; dispatch via globalThis[fn] op regel ' + DISPATCH.join(', '));
info('mock: ' + Object.keys(MOCK).length + ' functies (' + MOCK_PORTAAL.length + ' in handle_portaal)');
info('tests: ' + TEST_BESTANDEN.filter(function (b) { return fs.existsSync(path.join(R, b)); }).length + ' bestanden, ' + Object.keys(TESTS).length + ' api-namen genoemd');

eis(RAPPORT.appZonderBackend.length === 0, 'elke app-aanroep heeft een backendfunctie die doPost toelaat' + (RAPPORT.appZonderBackend.length ? ': ' + RAPPORT.appZonderBackend.map(function (n) { return n + ' (' + TABEL[n].status.filter(function (s) { return /^BUG/.test(s); }).join('; ') + ')'; }).join(', ') : ''));
eis(APP_PORTAAL.every(function (n) { return PORTAAL_FUNCTIES.indexOf(n) >= 0; }) && PORTAAL_FUNCTIES.every(function (n) { return !!BACKEND[n]; }), 'runPortaal-namen ⊆ PORTAAL_FUNCTIES ⊆ backend (' + APP_PORTAAL.join(', ') + ' | ' + PORTAAL_FUNCTIES.join(', ') + ')');
eis(GENEST.length === 0, 'geen function apiX( buiten kolom 0 (anders onbereikbaar via globalThis)' + (GENEST.length ? ': ' + GENEST.map(function (g) { return g.naam + ' r' + g.regel; }).join(', ') : ''));
eis(TRIGGER_ONGEDEF.length === 0, 'elke naam in TRIGGERS is een top-level functie' + (TRIGGER_ONGEDEF.length ? ': ontbreekt ' + TRIGGER_ONGEDEF.join(', ') : ' (' + TRIGGERS.length + ')'));
eis(BREIN_LEES.length > 0 && BREIN_LEES.every(function (k) { return LEES_AFH[k].afgehandeld; }), 'elke BREIN_LEES-tool wordt in breinLees afgehandeld (' + BREIN_LEES.join(', ') + ')');
eis(BREIN_ACTIES.length > 0 && BREIN_ACTIES.every(function (k) { return ACTIE_AFH[k].afgehandeld; }), 'elke BREIN_ACTIES-actie wordt in apiBreinUitvoeren uitgevoerd (' + BREIN_ACTIES.map(function (k) { return k + (ACTIE_AFH[k].roept.length ? '→' + ACTIE_AFH[k].roept.join('+') : ''); }).join(', ') + ')');
eis(ACTIE_AFH && BREIN_ACTIES.every(function (k) { return ACTIE_AFH[k].roept.every(function (f) { return !!BACKEND[f]; }); }), 'de api-functies die de assistent-acties aanroepen bestaan');

info('backendfuncties die de app nooit aanroept: ' + RAPPORT.backendZonderApp.length + ' → ' + RAPPORT.backendZonderApp.map(function (x) { return x.naam + ' [' + x.status + ']'; }).join('; '));
info('app-aanroepen zonder mock (test_app.py kan ze niet raken): ' + RAPPORT.appZonderMock.length + (RAPPORT.appZonderMock.length ? ' → ' + RAPPORT.appZonderMock.join(', ') : ''));
info('api\'s zonder enige test: ' + RAPPORT.zonderTest.length + (RAPPORT.zonderTest.length ? ' → ' + RAPPORT.zonderTest.map(function (x) { return x.naam + (x.uitgesloten ? ' (NIET_VERGELEKEN)' : x.mock && x.app ? ' (mock: mogelijk via UI)' : ''); }).join(', ') : ''));
info('api\'s die alleen indirect geraakt worden (golden master / lus over rollen): ' + RAPPORT.alleenIndirect.length + (RAPPORT.alleenIndirect.length ? ' → ' + RAPPORT.alleenIndirect.map(function (x) { return x.naam; }).join(', ') : ''));
if (RAPPORT.mockZonderBackend.length) info('mock kent functies zonder backend: ' + RAPPORT.mockZonderBackend.join(', '));
if (RAPPORT.testsZonderBackend.length) info('tests noemen functies zonder backend: ' + RAPPORT.testsZonderBackend.join(', '));
if (TRIGGER_LOS.length) info('functies op *Trigger die niet in TRIGGERS staan: ' + TRIGGER_LOS.join(', '));
info('contract: niet in SKILL.md ' + (RAPPORT.contract.backendNietInSkill.join(', ') || '—') + ' · niet in backend/README.md ' + (RAPPORT.contract.backendNietInReadme.join(', ') || '—') + ' · in SKILL.md zonder backend ' + (RAPPORT.contract.skillZonderBackend.join(', ') || '—') + ' · in README zonder backend ' + (RAPPORT.contract.readmeZonderBackend.join(', ') || '—'));

/* ===== Markdown en json ===== */
function kort(b) { return b.replace(/^test\//, '').replace(/^server\//, 'server/').replace(/\.(py|js)$/, ''); }
function testCel(obj) { var k = Object.keys(obj); return k.length ? k.map(function (b) { return kort(b) + ' ×' + obj[b].length; }).join(', ') : '—'; }
function appCel(a) { var d = []; if (a.direct.length) d.push('run ×' + a.direct.length); if (a.indirect.length) d.push('indirect ×' + a.indirect.length); if (a.portaal.length) d.push('runPortaal ×' + a.portaal.length); return d.join(', ') || '—'; }
var md = [];
md.push('# Kruistabel API-oppervlak (v7.3)', '', 'Gemaakt ' + new Date().toISOString().slice(0, 16) + 'Z door `node test/kruistabel.js`, puur uit de broncode.', '',  // v7.3: apiVraag, apiZetHuisstijl, apiTraject en apiNotitieToevoegen zijn weg (K2); de rooktest dekt de schrijfpaden (K3)
  '- App (`index.html`): ' + APP_NAMEN.length + ' api-namen, waarvan ' + APP_RUN.length + ' via `run()` (direct of via een variabele/naamlijst) en ' + APP_PORTAAL.length + ' via `runPortaal()`.',
  '- Backend (`backend/Code.gs`): ' + Object.keys(BACKEND).length + ' `function api…(`; `PORTAAL_FUNCTIES` = ' + PORTAAL_FUNCTIES.join(', ') + '; ' + TRIGGERS.length + ' triggers; assistent: ' + BREIN_LEES.length + ' leestools en ' + BREIN_ACTIES.length + ' acties.',
  '- Mock (`test/mock_backend.py`): ' + Object.keys(MOCK).length + ' functies met `if fn == …`.',
  '- Tests: ' + TEST_BESTANDEN.filter(function (b) { return fs.existsSync(path.join(R, b)); }).map(function (b) { return '`' + b + '`'; }).join(', ') + '.',
  '- Direct = een gerichte aanroep met controle; indirect = de golden master (`server/vergelijk.js`, alle lees-api\'s per rol) of een lus over alle rollen (`[\'demo-sophie\', …].forEach`).', '',
  '## Samenvatting', '',
  '| controle | aantal |', '|---|---|',
  '| app-aanroepen zonder backendfunctie (bug) | ' + RAPPORT.appZonderBackend.length + ' |',
  '| backendfuncties die de app nooit aanroept | ' + RAPPORT.backendZonderApp.length + ' |',
  '| app-aanroepen zonder mock | ' + RAPPORT.appZonderMock.length + ' |',
  '| api\'s zonder enige test | ' + RAPPORT.zonderTest.length + ' |',
  '| api\'s die alleen indirect geraakt worden | ' + RAPPORT.alleenIndirect.length + ' |', '');
md.push('## Kruistabel', '', '| api | app | backend | mock | tests direct | tests indirect | status |', '|---|---|---|---|---|---|---|');
ALLE.forEach(function (n) {
  var r = TABEL[n];
  md.push('| `' + n + '` | ' + appCel(r.app) + ' | ' + (r.backend ? 'r' + r.backend.regel + (r.backend.portaal ? ' (portaal)' : '') + (r.backend.internAangeroepen.length ? ' ← ' + uniek(r.backend.internAangeroepen.map(function (x) { return x.vanuit; })).join(', ') : '') : '—') +
    ' | ' + (r.mock ? 'r' + r.mock.regels.join(', r') + (r.mock.in.indexOf('handle_portaal') >= 0 ? ' (portaal)' : '') : '—') + ' | ' + testCel(r.tests.direct) + ' | ' + testCel(r.tests.indirect) + (Object.keys(r.tests.uitgesloten).length ? ' (NIET_VERGELEKEN)' : '') + ' | ' + (r.status.join('; ') || 'ok') + ' |');
});
md.push('', '## 1. App-aanroepen zonder backendfunctie (bug)', '', RAPPORT.appZonderBackend.length ? RAPPORT.appZonderBackend.map(function (n) { var a = APP[n]; return '- `' + n + '`: index.html r' + a.direct.concat(a.portaal, a.indirect.map(function (x) { return x.regel; })).join(', r') + ' — ' + TABEL[n].status.filter(function (s) { return /^BUG/.test(s); }).join('; '); }).join('\n') : 'Geen.');
md.push('', '## 2. Backendfuncties die de app nooit aanroept', '', '| api | regel | hoe wel gebruikt | mock | tests |', '|---|---|---|---|---|');
RAPPORT.backendZonderApp.forEach(function (x) { md.push('| `' + x.naam + '` | r' + x.regel + ' | ' + x.status + ' | ' + (x.mock ? 'ja' : '—') + ' | ' + (x.tests.direct.map(kort).concat(x.tests.indirect.map(function (b) { return kort(b) + ' (indirect)'; })).join(', ') || '—') + ' |'); });
md.push('', '## 3. App-aanroepen zonder mock (test_app.py kan ze niet raken)', '', RAPPORT.appZonderMock.length ? RAPPORT.appZonderMock.map(function (n) { var a = APP[n]; return '- `' + n + '`: index.html r' + a.direct.concat(a.portaal, a.indirect.map(function (x) { return x.regel; })).join(', r'); }).join('\n') : 'Geen.');
md.push('', '## 4. Api\'s zonder enige test', '', RAPPORT.zonderTest.length ? '| api | app | mock | opmerking |\n|---|---|---|---|\n' + RAPPORT.zonderTest.map(function (x) { return '| `' + x.naam + '` | ' + (x.app ? 'ja' : '—') + ' | ' + (x.mock ? 'ja' : '—') + ' | ' + (x.uitgesloten ? 'bewust buiten de golden master (NIET_VERGELEKEN)' : x.mock && x.app ? 'mock aanwezig: mogelijk via de UI in test_app.py, niet aantoonbaar uit de bron' : '') + ' |'; }).join('\n') : 'Geen.');
md.push('', '## 5. Api\'s die alleen indirect geraakt worden', '', RAPPORT.alleenIndirect.length ? RAPPORT.alleenIndirect.map(function (x) { return '- `' + x.naam + '`: ' + x.via.join(', '); }).join('\n') : 'Geen.');
md.push('', '## Portaal', '', '- `runPortaal` in de app: ' + (APP_PORTAAL.join(', ') || '—'), '- `PORTAAL_FUNCTIES` in Code.gs: ' + PORTAAL_FUNCTIES.join(', '), '- `handle_portaal` in de mock: ' + (MOCK_PORTAAL.join(', ') || '—'));
md.push('', '## Triggers (`TRIGGERS`)', '', '| trigger | gedefinieerd | roept (top-level) | in tests | in mock (apiStatus) |', '|---|---|---|---|---|');
TRIGGER_INFO.forEach(function (t) { md.push('| `' + t.naam + '` | ' + (t.gedefinieerd ? 'ja' : 'NEE') + ' | ' + (t.roept.join(', ') || '—') + ' | ' + (t.tests.map(kort).join(', ') || '—') + ' | ' + (t.mock ? 'ja' : '—') + ' |'); });
if (TRIGGER_LOS.length) md.push('', 'Functies op `*Trigger` buiten `TRIGGERS`: ' + TRIGGER_LOS.join(', '));
md.push('', '## Assistent-tools (`BREIN_LEES`, `BREIN_ACTIES`)', '', '| tool | via | afgehandeld | roept api | in tests | in mock |', '|---|---|---|---|---|---|');
BREIN_INFO.lees.concat(BREIN_INFO.acties).forEach(function (t) { md.push('| `' + t.tool + '` | ' + t.via + ' | ' + (t.afgehandeld ? 'ja' : 'NEE') + ' | ' + (t.roept.join(', ') || '—') + ' | ' + (t.tests.map(kort).join(', ') || '—') + ' | ' + (t.mock ? 'ja' : '—') + ' |'); });
md.push('', '## Contract (extra): `.claude/skills/athena-backend-api/SKILL.md` en `backend/README.md`', '',
  '- Backendfuncties niet in SKILL.md: ' + (RAPPORT.contract.backendNietInSkill.join(', ') || '—'),
  '- Backendfuncties niet in backend/README.md: ' + (RAPPORT.contract.backendNietInReadme.join(', ') || '—'),
  '- In SKILL.md zonder backendfunctie: ' + (RAPPORT.contract.skillZonderBackend.join(', ') || '—'),
  '- In backend/README.md zonder backendfunctie: ' + (RAPPORT.contract.readmeZonderBackend.join(', ') || '—'), '');
fs.mkdirSync(UIT_MAP, { recursive: true });
fs.writeFileSync(path.join(UIT_MAP, 'kruistabel.md'), md.join('\n'));
fs.writeFileSync(path.join(UIT_MAP, 'kruistabel.json'), JSON.stringify({
  gemaakt: new Date().toISOString(), looptijdMs: Date.now() - begin,
  cijfers: { app: APP_NAMEN.length, appRun: APP_RUN.length, appPortaal: APP_PORTAAL.length, backend: Object.keys(BACKEND).length, mock: Object.keys(MOCK).length, testsGenoemd: Object.keys(TESTS).length,
    appZonderBackend: RAPPORT.appZonderBackend.length, backendZonderApp: RAPPORT.backendZonderApp.length, appZonderMock: RAPPORT.appZonderMock.length, zonderTest: RAPPORT.zonderTest.length, alleenIndirect: RAPPORT.alleenIndirect.length },
  portaal: { app: APP_PORTAAL, backend: PORTAAL_FUNCTIES, mock: MOCK_PORTAAL }, triggers: TRIGGER_INFO, triggersLos: TRIGGER_LOS, brein: BREIN_INFO, dispatch: DISPATCH,
  rapport: RAPPORT, tabel: TABEL
}, null, 1));
info('geschreven: test/shots/robuust/kruistabel.md en kruistabel.json (' + (Date.now() - begin) + ' ms)');
if (fouten) { console.log('FOUTEN: ' + fouten); process.exit(1); }
console.log('ALLES GOED');
