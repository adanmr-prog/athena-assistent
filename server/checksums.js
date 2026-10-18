/* Athena Assistent — v6.2 (go-live-review): een vingerafdruk per tabel van de database, om twee toestanden te vergelijken:
 * na twee migratieruns (moet gelijk zijn: de import is idempotent), vóór en na een back-up met restore, of productie tegenover een kopie.
 *   DATABASE_URL='postgres://…' node server/checksums.js            → regels "tabel  aantal  md5"
 *   ATHENA_DB=pglite:<map> node server/checksums.js                 → hetzelfde op pglite
 * De kolom rij (volgnummer) telt niet mee, zodat een restore met andere volgnummers dezelfde vingerafdruk geeft.
 * Vergelijken: twee keer draaien met > a.txt en > b.txt, dan diff a.txt b.txt (verwachte uitvoer: geen verschil). */
'use strict';
var schema = require('./schema.js'), brug = require('./sync.js'), A = require('./apps-script.js');
if (!process.env.DATABASE_URL && !process.env.ATHENA_DB) { console.error('Zet DATABASE_URL (Supabase, session pooler) of ATHENA_DB=pglite:<map>.'); process.exit(2); }
A.zorgTabel('Scholen');
var T = schema.tabellen(), uit = [];
Object.keys(T).concat(['eigenschappen']).forEach(function (tab) {
  var t = tab === 'eigenschappen' ? 'eigenschappen' : schema.q(schema.tabelNaam(tab)), sleutel = tab === 'eigenschappen' ? 'sleutel' : (schema.sleutelVan(tab) ? schema.kolomNaam(schema.sleutelVan(tab)) : 'nr');
  var r = brug.sql("select count(*)::int as n, coalesce(md5(string_agg((to_jsonb(x) - 'rij' - 'nr')::text, '|' order by " + schema.q(sleutel) + ")), '-') as md5 from " + t + ' x').rows[0];
  uit.push(tab.padEnd(24) + String(r.n).padStart(7) + '  ' + r.md5);
});
console.log(uit.join('\n'));
brug.stop();
