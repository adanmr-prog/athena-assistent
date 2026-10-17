/* Athena Assistent — v6.0: het Postgres-schema volgt TABELLEN uit backend/Code.gs.
 * Eén tabel per tabblad (naam in snake_case), kolommen zoals de kop (camelCase → snake_case), alles tekst behalve de
 * getalkolommen in NUMERIEK (zodat Code.gs getallen terugkrijgt, zoals uit een Sheet). Datums blijven tekst (yyyy-MM-dd
 * en yyyy-MM-dd HH:mm, zoals Code.gs ze schrijft); omzetten naar date/timestamptz is werk voor v6.x na een audit per kolom.
 * Elke tabel heeft een kolom rij (bigserial) voor de volgorde van invoegen, zoals de rijvolgorde in de Sheet.
 * Gebruik: node server/schema.js --sql  → de DDL (supabase/migrations/0001_init.sql); zorgSchema(sql) maakt ontbrekende
 * tabellen en kolommen aan, zodat een nieuwe kolom in TABELLEN vanzelf meekomt (zoals blad() in de Sheet). */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

var CODE_PAD = path.join(__dirname, '..', 'backend', 'Code.gs');
var _code = null;
function codeTekst() { if (_code === null) _code = fs.readFileSync(CODE_PAD, 'utf8'); return _code; }
function blok(naam, tekst) {
  var m = new RegExp('var ' + naam + ' = (\\{[\\s\\S]*?\\n\\});').exec(tekst || codeTekst());
  if (!m) throw new Error(naam + ' niet gevonden in Code.gs');
  return vm.runInNewContext('(' + m[1] + ')');
}
function lijstBlok(naam, tekst) {
  var m = new RegExp('var ' + naam + ' = (\\[[^\\]]*\\]);').exec(tekst || codeTekst());
  if (!m) throw new Error(naam + ' niet gevonden in Code.gs');
  return vm.runInNewContext('(' + m[1] + ')');
}
var _tab = null, _triggers = null, _versie = null;
function tabellen() { if (!_tab) _tab = blok('TABELLEN'); return _tab; }
function triggers() { if (!_triggers) _triggers = lijstBlok('TRIGGERS'); return _triggers; }
function versie() { if (_versie === null) { var m = /var VERSIE = '([^']+)'/.exec(codeTekst()); _versie = m ? m[1] : ''; } return _versie; }

// Getalkolommen: in een Sheet komen deze als getal terug, dus ook uit Postgres (numeric). Alle andere kolommen zijn tekst.
var NUMERIEK = {
  Scholen: ['leerlingen', 'lat', 'lon'],
  Trajecten: ['ondersteuners', 'urenPerWeek', 'tarief', 'omzet'],
  Kansen: ['waarde', 'kans'],
  Documenten: ['woorden'],
  Activiteiten: ['duurMin'], Activiteiten_archief: ['duurMin'],
  Mijlpalen: ['volgorde', 'kans', 'dagenNorm'],
  Doelen: ['doel'],
  Facturen: ['bedrag'],
  Vacatures: ['aantal', 'urenPerWeek'],
  Kandidaten: ['urenPerWeek'],
  Talenten: ['lat', 'lon', 'reisafstandKm', 'maxUrenWeek'],
  TalentUren: ['uren', 'diensten', 'noShows', 'lateAfmeldingen'], TalentUren_archief: ['uren', 'diensten', 'noShows', 'lateAfmeldingen']
};
// Sleutelkolom per tabblad; zonder sleutel (Aanmeldingen) telt de hele tabel als één geheel
var SLEUTEL = { Huisstijl: 'sleutel', Instellingen: 'sleutel', Aanmeldingen: null };
var INDEXEN = [['Activiteiten', 'schoolId'], ['Activiteiten', 'persoonId'], ['Activiteiten', 'talentId'], ['Activiteiten', 'datum'], ['Acties', 'status'], ['Acties', 'eigenaar'], ['Kandidaten', 'trajectId'], ['Kandidaten', 'talentId'], ['TalentUren', 'talentId'], ['Personen', 'schoolId'], ['Kansen', 'schoolId']];

function snake(k) { return String(k).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/__+/g, '_').toLowerCase(); }
function tabelNaam(tab) { return snake(tab); }
function kolomNaam(kolom) { return snake(kolom); }
function sleutelVan(tab) { return SLEUTEL.hasOwnProperty(tab) ? SLEUTEL[tab] : 'id'; }
function isNumeriek(tab, kolom) { return (NUMERIEK[tab] || []).indexOf(kolom) >= 0; }
function q(naam) { return '"' + String(naam).replace(/"/g, '""') + '"'; }

function kolomType(tab, kolom) { return isNumeriek(tab, kolom) ? 'numeric' : 'text'; }
function tabelDdl(tab) {
  var kop = tabellen()[tab], sleutel = sleutelVan(tab), regels = [];
  if (!sleutel) regels.push('  nr bigserial primary key');
  kop.forEach(function (k) { regels.push('  ' + q(kolomNaam(k)) + ' ' + kolomType(tab, k) + (k === sleutel ? ' primary key' : '')); });
  regels.push('  rij bigserial');
  return 'create table if not exists ' + q(tabelNaam(tab)) + ' (\n' + regels.join(',\n') + '\n);';
}
function extraDdl() {
  return [
    '-- scripteigenschappen (PropertiesService) en de korte cache (CacheService)',
    'create table if not exists eigenschappen (sleutel text primary key, waarde text);',
    'create table if not exists cache (sleutel text primary key, waarde text, verloopt timestamptz);'
  ].join('\n');
}
function ddl() {
  var T = tabellen(), uit = ['-- Athena Assistent v6.0 — gegenereerd uit TABELLEN in backend/Code.gs met: node server/schema.js --sql', '-- Niet met de hand aanpassen: pas Code.gs aan en genereer opnieuw (de test controleert of dit bestand actueel is).', ''];
  Object.keys(T).forEach(function (tab) { uit.push(tabelDdl(tab)); });
  uit.push(extraDdl());
  INDEXEN.forEach(function (ix) { var t = tabelNaam(ix[0]), k = kolomNaam(ix[1]); uit.push('create index if not exists ' + q('ix_' + t + '_' + k) + ' on ' + q(t) + ' (' + q(k) + ');'); });
  uit.push('-- Row Level Security aan zonder policies: alleen de service role (de server) kan erbij; de app praat nooit rechtstreeks met Postgres.');
  Object.keys(T).map(tabelNaam).concat(['eigenschappen', 'cache']).forEach(function (t) { uit.push('alter table ' + q(t) + ' enable row level security;'); });
  return uit.join('\n') + '\n';
}
// Maakt ontbrekende tabellen en kolommen aan (idempotent). sql(tekst, params) → { rows }
// v6.2: eerst kijken of er iets ontbreekt; alleen dan de DDL, onder een advisory lock. Elke nieuwe serverinstantie (koude start op
// Vercel) doet dit bij zijn eerste verzoek; meerdere tegelijk gaven "deadlock detected" op de create index/enable row level
// security-statements (server/test/fouten_test.js). In de regel ontbreekt er niets en kost de controle één query.
var SCHEMA_LOCK = 7311;
function ontbrekend(sql) {
  var T = tabellen(), bestaand = {}, mist = [];
  sql("select table_name, column_name from information_schema.columns where table_schema = 'public'").rows.forEach(function (r) { (bestaand[r.table_name] = bestaand[r.table_name] || {})[r.column_name] = true; });
  Object.keys(T).forEach(function (tab) {
    var t = tabelNaam(tab), kolommen = bestaand[t];
    if (!kolommen) { mist.push(t); return; }
    T[tab].forEach(function (k) { if (!kolommen[kolomNaam(k)]) mist.push(t + '.' + kolomNaam(k)); });
    if (!kolommen.rij) mist.push(t + '.rij');
  });
  ['eigenschappen', 'cache'].forEach(function (t) { if (!bestaand[t]) mist.push(t); });
  var indexen = {}; sql("select indexname from pg_indexes where schemaname = 'public'").rows.forEach(function (r) { indexen[r.indexname] = true; });
  INDEXEN.forEach(function (ix) { var n = 'ix_' + tabelNaam(ix[0]) + '_' + kolomNaam(ix[1]); if (!indexen[n]) mist.push('index ' + n); });
  return mist;
}
function zorgSchema(sql) {
  if (!ontbrekend(sql).length) return;
  var T = tabellen();
  sql('select pg_advisory_lock($1)', [SCHEMA_LOCK]);
  try {
    if (!ontbrekend(sql).length) return;  // een andere instantie was net eerder
    sql(ddl());
    var bestaand = {};
    sql("select table_name, column_name from information_schema.columns where table_schema = 'public'").rows.forEach(function (r) { (bestaand[r.table_name] = bestaand[r.table_name] || {})[r.column_name] = true; });
    Object.keys(T).forEach(function (tab) {
      var t = tabelNaam(tab), kolommen = bestaand[t] || {};
      T[tab].forEach(function (k) { if (!kolommen[kolomNaam(k)]) sql('alter table ' + q(t) + ' add column if not exists ' + q(kolomNaam(k)) + ' ' + kolomType(tab, k)); });
      if (!kolommen.rij) sql('alter table ' + q(t) + ' add column if not exists rij bigserial');
    });
  } finally { try { sql('select pg_advisory_unlock($1)', [SCHEMA_LOCK]); } catch (e) {} }
}

module.exports = { codeTekst: codeTekst, tabellen: tabellen, triggers: triggers, versie: versie, NUMERIEK: NUMERIEK, snake: snake, tabelNaam: tabelNaam, kolomNaam: kolomNaam, sleutelVan: sleutelVan, isNumeriek: isNumeriek, q: q, ddl: ddl, zorgSchema: zorgSchema, ontbrekend: ontbrekend, CODE_PAD: CODE_PAD };

if (require.main === module) {
  if (process.argv.indexOf('--sql') >= 0) process.stdout.write(ddl());
  else console.log(Object.keys(tabellen()).map(function (t) { return tabelNaam(t) + ' (' + tabellen()[t].length + ' kolommen, sleutel ' + (sleutelVan(t) || 'nr') + ')'; }).join('\n'));
}
