/* Athena Assistent — v6.0: de gegevens van de Google Sheet naar Postgres.
 * Bron: de draaiende Apps Script-backend (apiExportAlles, alleen met de koppelcode van het management), een JSON-bestand van
 * een eerdere export, of de demogegevens (--demo, om de server lokaal te proberen). Doel: DATABASE_URL (Supabase) of
 * ATHENA_DB=pglite:<map> (lokaal). Importeren is een upsert op de sleutelkolom: opnieuw draaien is veilig.
 *
 *   node server/migratie.js --bron https://script.google.com/macros/s/…/exec --code <koppelcode> [--alleen Scholen,Acties] [--bewaar export.json]
 *   node server/migratie.js --json export.json
 *   node server/migratie.js --demo
 *
 * Daarna telt het script per tabel de rijen in de bron en in de database. Scripteigenschappen gaan mee (zonder ANTHROPIC_API_KEY
 * en CAPSULE_TOKEN; die horen in de omgeving van de server). */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var schema = require('./schema.js'), brug = require('./sync.js'), A = require('./apps-script.js');

function importeerTabel(tab, rijen, waarschuw) {
  var kop = schema.tabellen()[tab]; if (!kop) throw new Error('Onbekend tabblad ' + tab);
  A.zorgTabel(tab);
  var t = schema.q(schema.tabelNaam(tab)), sleutel = schema.sleutelVan(tab), kolommen = kop.map(function (k) { return schema.q(schema.kolomNaam(k)); });
  var params = function (r) { return kop.map(function (k) { return A.naarDb(tab, k, r[k], waarschuw); }); };
  var geldig = (rijen || []).filter(function (r) { return r && (!sleutel || (r[sleutel] !== '' && r[sleutel] != null)); }), n = 0;
  if (!sleutel) brug.sql('delete from ' + t);
  for (var i = 0; i < geldig.length; i += 100) {
    var deel = geldig.slice(i, i + 100), w = [], m = 0;
    var vals = deel.map(function (r) { return '(' + params(r).map(function (v) { w.push(v); return '$' + (++m); }).join(', ') + ')'; });
    var zet = sleutel ? ' on conflict (' + schema.q(schema.kolomNaam(sleutel)) + ') do update set ' + kop.filter(function (k) { return k !== sleutel; }).map(function (k) { var c = schema.q(schema.kolomNaam(k)); return c + ' = excluded.' + c; }).join(', ') : '';
    brug.sql('insert into ' + t + ' (' + kolommen.join(', ') + ') values ' + vals.join(', ') + zet, w);
    n += deel.length;
  }
  return { bron: (rijen || []).length, geimporteerd: n, overgeslagen: (rijen || []).length - geldig.length, inDatabase: Number(brug.sql('select count(*)::int as n from ' + t).rows[0].n) };
}
function importeerEigenschappen(obj) {
  A.zorgTabel('Scholen');
  var n = 0;
  Object.keys(obj || {}).forEach(function (k) { if (['ANTHROPIC_API_KEY', 'CAPSULE_TOKEN'].indexOf(k) >= 0) return; brug.sql('insert into eigenschappen (sleutel, waarde) values ($1, $2) on conflict (sleutel) do update set waarde = excluded.waarde', [k, String(obj[k] == null ? '' : obj[k])]); n++; });
  return n;
}
// export = { tabellen: { Scholen: [rij-objecten], … }, eigenschappen: {…} }
function importeer(exp, opties) {
  opties = opties || {};
  var uit = { tabellen: {}, eigenschappen: 0, waarschuwingen: [] }, waarschuw = function (s) { uit.waarschuwingen.push(s); };
  var T = schema.tabellen(), alleen = opties.alleen || null;
  Object.keys(T).forEach(function (tab) {
    if (alleen && alleen.indexOf(tab) < 0) return;
    if (!exp.tabellen || !exp.tabellen[tab]) return;
    uit.tabellen[tab] = importeerTabel(tab, exp.tabellen[tab], waarschuw);
  });
  if (exp.eigenschappen && !alleen) uit.eigenschappen = importeerEigenschappen(exp.eigenschappen);
  return uit;
}

// De export via de Apps Script-backend (asynchroon; alleen in dit script)
async function exportVanAppsScript(execUrl, code, alleen, log) {
  var roep = async function (fn, args) {
    var r = await fetch(execUrl + '?app=1', { method: 'POST', body: JSON.stringify({ fn: fn, args: args, secret: code }), redirect: 'follow' });
    var d = await r.json(); if (!d.ok) throw new Error(fn + ': ' + d.fout); return d.result;
  };
  var uit = { tabellen: {}, eigenschappen: {} }, T = schema.tabellen();
  for (var tab of Object.keys(T)) {
    if (alleen && alleen.indexOf(tab) < 0) continue;
    var rijen = [], vanaf = 0, totaal = 0;
    do { var d = await roep('apiExportAlles', [tab, vanaf, tab === 'Documenten' ? 50 : 300]); rijen = rijen.concat(d.rijen || []); totaal = d.totaal; vanaf = d.volgende; } while (vanaf !== null && vanaf !== undefined);
    uit.tabellen[tab] = rijen; if (log) log(tab + ': ' + rijen.length + ' van ' + totaal);
  }
  if (!alleen) uit.eigenschappen = (await roep('apiExportAlles', ['eigenschappen'])).rijen || {};
  return uit;
}
// De demogegevens als export: demo-backend.js + Code.gs in een vm, zoals test/node_rooktest.js
function exportUitDemo() {
  var R = path.join(__dirname, '..'), ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + schema.codeTekst(), ctx, { filename: 'demo.js' });
  ctx.demoStart('');
  var exp = JSON.parse(ctx.demoExport()), uit = { tabellen: {}, eigenschappen: exp.props || {} }, T = schema.tabellen();
  Object.keys(exp.bladen || {}).forEach(function (naam) {
    if (!T[naam]) return;
    var rijen = exp.bladen[naam], kop = rijen[0] || T[naam];
    uit.tabellen[naam] = rijen.slice(1).filter(function (r) { return r.some(function (x) { return x !== '' && x != null; }); }).map(function (r) { var o = {}; kop.forEach(function (k, i) { if (T[naam].indexOf(k) >= 0) o[k] = r[i] == null ? '' : r[i]; }); return o; });
  });
  uit.eigenschappen.EIGENAAR_EMAIL = uit.eigenschappen.EIGENAAR_EMAIL || 'sophie@athena.example';
  delete uit.eigenschappen.ANTHROPIC_API_KEY;
  return uit;
}

async function main() {
  var argv = process.argv.slice(2), opt = {};
  for (var i = 0; i < argv.length; i++) { if (argv[i].indexOf('--') === 0) { var k = argv[i].slice(2); if (argv[i + 1] && argv[i + 1].indexOf('--') !== 0) opt[k] = argv[++i]; else opt[k] = true; } }
  if (!process.env.DATABASE_URL && !process.env.ATHENA_DB) { console.error('Zet DATABASE_URL (Supabase, directe verbinding of session pooler) of ATHENA_DB=pglite:<map>.'); process.exit(2); }
  var alleen = opt.alleen ? String(opt.alleen).split(',').map(function (s) { return s.trim(); }) : null, exp;
  if (opt.demo) exp = exportUitDemo();
  else if (opt.json) exp = JSON.parse(fs.readFileSync(String(opt.json), 'utf8'));
  else if (opt.bron && opt.code) exp = await exportVanAppsScript(String(opt.bron).replace(/\?.*$/, ''), String(opt.code), alleen, function (s) { console.log('export ' + s); });
  else { console.error('Gebruik: --bron <exec-url> --code <koppelcode> | --json <bestand> | --demo  [--alleen Tab1,Tab2] [--bewaar export.json]'); process.exit(2); }
  if (opt.bewaar) { fs.writeFileSync(String(opt.bewaar), JSON.stringify(exp)); console.log('Export bewaard in ' + opt.bewaar); }
  var uit = importeer(exp, { alleen: alleen });
  console.log('\nTabel'.padEnd(24) + 'bron'.padStart(8) + 'geïmporteerd'.padStart(14) + 'in database'.padStart(13));
  Object.keys(uit.tabellen).forEach(function (t) { var s = uit.tabellen[t]; console.log(t.padEnd(23) + String(s.bron).padStart(8) + String(s.geimporteerd).padStart(14) + String(s.inDatabase).padStart(13) + (s.overgeslagen ? '   (' + s.overgeslagen + ' zonder sleutel overgeslagen)' : '')); });
  console.log('Eigenschappen: ' + uit.eigenschappen + (uit.waarschuwingen.length ? '\nWaarschuwingen:\n- ' + uit.waarschuwingen.slice(0, 30).join('\n- ') : ''));
  var mis = Object.keys(uit.tabellen).filter(function (t) { return uit.tabellen[t].inDatabase < uit.tabellen[t].geimporteerd; });
  console.log(mis.length ? 'LET OP: minder rijen in de database dan geïmporteerd bij ' + mis.join(', ') : 'Klaar: alle tabellen staan in de database.');
  brug.stop();
}
module.exports = { importeer: importeer, importeerTabel: importeerTabel, importeerEigenschappen: importeerEigenschappen, exportVanAppsScript: exportVanAppsScript, exportUitDemo: exportUitDemo };
if (require.main === module) main().catch(function (e) { console.error('Migratie mislukt: ' + ((e && e.message) || e)); process.exit(1); });
