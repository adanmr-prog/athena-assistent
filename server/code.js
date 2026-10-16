/* Athena Assistent — v6.0: backend/Code.gs laden en per verzoek draaien met de nagebootste diensten (server/apps-script.js).
 * Code.gs wordt één keer gecompileerd als functie met de dienstnamen als parameters; elke aanroep van die functie is een
 * vers "Apps Script-verzoek": eigen globalen (GEBRUIKER, _LEES, …), eigen diensten. Binnen Code.gs wijst `globalThis` naar
 * een object met alle functies van Code.gs, zodat doPost's globalThis[fn] werkt. Alles draait in één realm (geen vm),
 * dus instanceof Date/Array in Code.gs klopt ook voor waarden uit de adapter. */
'use strict';
process.env.TZ = 'Europe/Amsterdam';  // Code.gs rekent met lokale datums (new Date(y, m, d), getHours); Vercel staat op UTC
var schema = require('./schema.js'), diensten = require('./apps-script.js');

var DIENSTEN = ['SpreadsheetApp', 'PropertiesService', 'CacheService', 'LockService', 'Utilities', 'Session', 'Logger', 'ContentService', 'MimeType', 'ScriptApp', 'UrlFetchApp', 'MailApp', 'GmailApp', 'CalendarApp', 'DriveApp', 'Drive', 'DocumentApp', 'HtmlService'];
var _fabriek = null;
function functieNamen(src) { var uit = {}, m, re = /^function ([A-Za-z_$][\w$]*)\s*\(/gm; while ((m = re.exec(src))) uit[m[1]] = true; return Object.keys(uit); }
function fabriek() {
  if (_fabriek) return _fabriek;
  var src = schema.codeTekst(), namen = functieNamen(src);
  var staart = namen.map(function (n) { return 'globalThis.' + n + ' = ' + n + ';'; }).join('\n');
  _fabriek = new Function(['globalThis', 'SERVER_LOGIN'].concat(DIENSTEN), src + '\n' + staart + '\nreturn globalThis;');  // eslint-disable-line no-new-func
  return _fabriek;
}
// Een vers Code.gs-exemplaar: { api: alle functies van Code.gs, diensten (met flush) }
function start(opties) {
  opties = opties || {};
  var D = diensten.maakDiensten({ env: opties.env }), g = {};
  var args = [g, opties.login || undefined].concat(DIENSTEN.map(function (n) { return D[n]; }));
  fabriek().apply(null, args);
  return { api: g, diensten: D };
}
module.exports = { start: start, fabriek: fabriek, functieNamen: functieNamen, versie: schema.versie };
