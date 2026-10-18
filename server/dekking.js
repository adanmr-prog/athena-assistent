/* Athena Assistent — v6.2 (go-live-review): dekking van het Apps Script-oppervlak door de server-adapter.
 * Leest backend/Code.gs als AST (acorn) en verzamelt (1) elke aanroep Dienst.methode(...) en elke eigenschap Dienst.X op de
 * Apps Script-globalen, en (2) elke methodenaam die ergens in Code.gs op een object wordt aangeroepen. Daartegenover staat
 * wat server/apps-script.js en server/google.js definiëren (statisch: objectsleutels met een functie, toewijzingen x.y = function,
 * namen uit ['a','b'].forEach(…)-lijsten; en dynamisch: de dienstobjecten van maakDiensten()), plus de JavaScript-ingebouwde
 * methoden en wat Code.gs zelf definieert. Wat overblijft is een gat (of een vals alarm dat je in UITLEG verklaart).
 * Gebruik: node server/dekking.js [--json] [--demo]   (--demo: ook de kolom voor demo/demo-backend.js)
 * Exitcode 1 bij een onverklaard gat. Vereist devDependency acorn (npm install). */
'use strict';
var fs = require('fs'), path = require('path');
var acorn = require('acorn');
var R = path.join(__dirname, '..');
var DIENSTEN = ['SpreadsheetApp', 'PropertiesService', 'CacheService', 'LockService', 'Utilities', 'Session', 'Logger', 'ContentService', 'MimeType', 'ScriptApp', 'UrlFetchApp', 'MailApp', 'GmailApp', 'CalendarApp', 'DriveApp', 'Drive', 'DocumentApp', 'HtmlService', 'Charts', 'FormApp', 'SlidesApp', 'LanguageApp', 'Maps', 'XmlService', 'Jdbc', 'GroupsApp', 'AdminDirectory', 'SitesApp', 'Browser', 'BigQuery', 'People', 'Tasks', 'YouTube'];
// Namen die wél als methode worden aangeroepen maar geen gat zijn, met de reden (gecontroleerd met de hand; houd deze lijst kort)
var UITLEG = {
  // (leeg: elk gat hoort hier verklaard te staan of in de adapter te worden gedicht)
};

function parse(src) { return acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
function loop(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  Object.keys(node).forEach(function (k) {
    if (k === 'loc' || k === 'type') return;
    var v = node[k];
    if (Array.isArray(v)) v.forEach(function (x) { if (x && typeof x.type === 'string') loop(x, fn); });
    else if (v && typeof v.type === 'string') loop(v, fn);
  });
}
function naam(prop, computed) { return computed ? null : (prop.type === 'Identifier' ? prop.name : prop.type === 'Literal' ? String(prop.value) : null); }
function pad(m) {  // MemberExpression → ['Drive','Files','copy'] of null als de wortel geen dienst is
  var delen = [], n = m;
  while (n && n.type === 'MemberExpression') { var p = naam(n.property, n.computed); if (!p) return null; delen.unshift(p); n = n.object; }
  if (!n || n.type !== 'Identifier' || DIENSTEN.indexOf(n.name) < 0) return null;
  delen.unshift(n.name); return delen;
}

function analyse() {
/* ----- 1. Code.gs ----- */
var codeSrc = fs.readFileSync(path.join(R, 'backend', 'Code.gs'), 'utf8'), codeAst = parse(codeSrc);
// maps zonder prototype: methodenamen als toString of hasOwnProperty zouden anders Object.prototype raken
function leeg() { return Object.create(null); }
var eersteHop = leeg(), eigenschappen = leeg(), methodeNamen = leeg(), eigenDefinities = leeg();
function tel(map, sleutel, regel) { (map[sleutel] = map[sleutel] || []).push(regel); }
loop(codeAst, function (n) {
  if (n.type === 'FunctionDeclaration' && n.id) eigenDefinities[n.id.name] = true;
  if (n.type === 'Property' && n.value && /Function/.test(n.value.type)) { var k = naam(n.key, n.computed); if (k) eigenDefinities[k] = true; }
  if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.right && /Function/.test(n.right.type)) { var a = naam(n.left.property, n.left.computed); if (a) eigenDefinities[a] = true; }
  if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
    var p = pad(n.callee), mn = naam(n.callee.property, n.callee.computed);
    if (p) tel(eersteHop, p.join('.'), n.loc.start.line);
    if (mn) tel(methodeNamen, mn, n.loc.start.line);
  } else if (n.type === 'MemberExpression') {
    var p2 = pad(n);
    if (p2 && p2.length >= 2) {
      // alleen de buitenste eigenschap zonder aanroep (ScriptApp.WeekDay.MONDAY, MimeType.PDF, Utilities.Charset.UTF_8)
      eigenschappen[p2.join('.')] = eigenschappen[p2.join('.')] || n.loc.start.line;
    }
  }
});
// eigenschappen die alleen een tussenstap van een aanroep zijn (Drive.Files in Drive.Files.copy) hoeven niet apart
Object.keys(eigenschappen).forEach(function (k) { if (Object.keys(eersteHop).some(function (e) { return e === k || e.indexOf(k + '.') === 0; }) || Object.keys(eigenschappen).some(function (e) { return e !== k && e.indexOf(k + '.') === 0; })) delete eigenschappen[k]; });

/* ----- 2. de adapter (statisch + dynamisch) en de demo (statisch) ----- */
function definities(bestand) {
  var src = fs.readFileSync(bestand, 'utf8'), ast = parse(src), uit = leeg();
  loop(ast, function (n) {
    if (n.type === 'Property' && n.value && /Function/.test(n.value.type)) { var k = naam(n.key, n.computed); if (k) uit[k] = true; }
    if (n.type === 'Property' && n.value && n.value.type === 'Identifier') { var k2 = naam(n.key, n.computed); if (k2) uit[k2] = true; }  // sleutel: hulpfunctie (getLastColumn: breedte)
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression') { var a = naam(n.left.property, n.left.computed); if (a) uit[a] = true; }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && naam(n.callee.property, n.callee.computed) === 'forEach' && n.callee.object.type === 'ArrayExpression') {
      n.callee.object.elements.forEach(function (e) { if (e && e.type === 'Literal' && typeof e.value === 'string') uit[e.value] = true; });  // ['timeBased', …].forEach(n → t[n] = function)
    }
    if (n.type === 'FunctionDeclaration' && n.id) uit[n.id.name] = true;
  });
  return uit;
}
var adapterStatisch = Object.assign(leeg(), definities(path.join(R, 'server', 'apps-script.js')), definities(path.join(R, 'server', 'google.js')));
var demoStatisch = definities(path.join(R, 'demo', 'demo-backend.js'));
var diensten = null;
try {
  process.env.ATHENA_DB = process.env.ATHENA_DB || 'pglite';
  diensten = require('./apps-script.js').maakDiensten({ env: Object.assign({}, process.env, { GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', GOOGLE_REFRESH_TOKEN: 'x' }) });
} catch (e) { console.error('maakDiensten() kon niet worden aangemaakt voor de dynamische controle: ' + e.message); }
function dynamisch(padDelen) {  // 'function' | 'object' | 'waarde' | null
  if (!diensten) return null;
  var o = diensten;
  for (var i = 0; i < padDelen.length; i++) { if (o == null) return null; o = o[padDelen[i]]; }
  return o === undefined ? null : typeof o === 'function' ? 'function' : typeof o === 'object' ? 'object' : 'waarde';
}

/* ----- 3. ingebouwde JavaScript-methoden ----- */
var ingebouwd = leeg();
[Object, Array, String, Number, Boolean, Date, RegExp, Function, Math, JSON, Promise, Map, Set, Error, Symbol, ArrayBuffer, Uint8Array].forEach(function (C) {
  Object.getOwnPropertyNames(C).forEach(function (k) { ingebouwd[k] = true; });
  if (C.prototype) Object.getOwnPropertyNames(C.prototype).forEach(function (k) { ingebouwd[k] = true; });
});
['apply', 'call', 'bind', 'then', 'catch', 'finally', 'normalize', 'padStart', 'padEnd', 'localeCompare', 'toLocaleString', 'toLocaleDateString'].forEach(function (k) { ingebouwd[k] = true; });

/* ----- 4. rapport ----- */
var metDemo = process.argv.indexOf('--demo') >= 0;
var matrix = Object.keys(eersteHop).sort().map(function (k) {
  var delen = k.split('.'), laatst = delen[delen.length - 1];
  var dyn = dynamisch(delen), stat = !!adapterStatisch[laatst];
  return { aanroep: k + '()', regels: eersteHop[k], adapter: dyn === 'function' ? 'ja' : (stat ? 'ja (statisch)' : 'NEE'), demo: metDemo ? (demoStatisch[laatst] ? 'ja' : 'nee') : undefined };
});
var eigenschapRijen = Object.keys(eigenschappen).sort().map(function (k) {
  var dyn = dynamisch(k.split('.'));
  return { aanroep: k, regels: [eigenschappen[k]], adapter: dyn ? 'ja' : 'NEE' };
});
var rest = Object.keys(methodeNamen).filter(function (m) { return !ingebouwd[m] && !eigenDefinities[m] && !adapterStatisch[m]; }).sort();
var gaten = matrix.filter(function (r) { return r.adapter === 'NEE'; }).concat(eigenschapRijen.filter(function (r) { return r.adapter === 'NEE'; }));
var onverklaard = rest.filter(function (m) { return !UITLEG[m]; });
return { matrix: matrix, eigenschappen: eigenschapRijen, rest: rest, gaten: gaten, onverklaard: onverklaard, methodeNamen: methodeNamen, eigenDefinities: eigenDefinities, adapterStatisch: adapterStatisch, ingebouwd: ingebouwd, dynamisch: !!diensten, metDemo: metDemo };
}
module.exports = { analyse: analyse, UITLEG: UITLEG };

if (require.main === module) {
  var A = analyse(), json = process.argv.indexOf('--json') >= 0;
  if (json) { console.log(JSON.stringify({ matrix: A.matrix, eigenschappen: A.eigenschappen, rest: A.rest.map(function (m) { return { methode: m, regels: A.methodeNamen[m], uitleg: UITLEG[m] || null }; }), gaten: A.gaten, onverklaard: A.onverklaard }, null, 1)); }
  else {
    console.log('Apps Script-oppervlak van backend/Code.gs tegenover server/apps-script.js + server/google.js' + (A.dynamisch ? ' (dynamisch gecontroleerd op de dienstobjecten)' : ' (alleen statisch)'));
    console.log('\n| Aanroep in Code.gs | regels | adapter |' + (A.metDemo ? ' demo |' : '') + '\n|---|---|---|' + (A.metDemo ? '---|' : ''));
    A.matrix.forEach(function (r) { console.log('| `' + r.aanroep + '` | ' + r.regels.length + ' (eerste: ' + r.regels[0] + ') | ' + r.adapter + ' |' + (A.metDemo ? ' ' + r.demo + ' |' : '')); });
    console.log('\nEigenschappen (geen aanroep):');
    A.eigenschappen.forEach(function (r) { console.log('- `' + r.aanroep + '` (regel ' + r.regels[0] + '): ' + r.adapter); });
    console.log('\nMethodenamen in Code.gs die niet ingebouwd zijn, niet in Code.gs zelf staan en niet in de adapter voorkomen: ' + (A.rest.length ? '' : 'geen'));
    A.rest.forEach(function (m) { console.log('- `.' + m + '()` regels ' + A.methodeNamen[m].slice(0, 6).join(', ') + (A.methodeNamen[m].length > 6 ? ', …' : '') + (UITLEG[m] ? '  → ' + UITLEG[m] : '  → ONVERKLAARD')); });
    console.log('\nSamenvatting: ' + A.matrix.length + ' aanroepen Dienst.methode, ' + A.eigenschappen.length + ' eigenschappen, ' + A.gaten.length + ' gaten in de eerste hop, ' + A.onverklaard.length + ' onverklaarde methodenamen.');
  }
  process.exit(A.gaten.length || A.onverklaard.length ? 1 : 0);
}
