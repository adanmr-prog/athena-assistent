/* Athena Assistent — v6.0: de worker achter server/sync.js. Houdt één databaseverbinding open en doet de fetch-aanroepen.
 * Database: DATABASE_URL (Postgres; bij Supabase de session pooler op poort 5432: de transaction pooler op 6543 kent geen
 * advisory locks en de directe verbinding is alleen IPv6) of ATHENA_DB=pglite[:map] (Postgres in WASM, voor tests en lokaal werken).
 * ATHENA_GOOGLE_NEP=1 beantwoordt googleapis.com en oauth2.googleapis.com met vaste antwoorden (tests). */
'use strict';
var wt = require('worker_threads');
var poort = wt.workerData.poort, int32 = new Int32Array(wt.workerData.sab);

var db = null;
async function verbinding() {
  if (db) return db;
  var spec = process.env.ATHENA_DB || '';
  if (/^pglite/.test(spec)) {
    var PG = require('@electric-sql/pglite').PGlite, map = spec.split(':')[1];
    var p = map ? new PG(map) : new PG();
    await p.waitReady;
    // zonder parameters via exec: dan mag een script met meerdere statements (het schema)
    db = { query: async function (t, a) { if (a && a.length) return p.query(t, a); var alle = await p.exec(t); return alle[alle.length - 1] || { rows: [] }; }, soort: 'pglite' };
  } else {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ontbreekt (of ATHENA_DB=pglite voor tests)');
    var pg = require('pg');
    pg.types.setTypeParser(1700, Number); pg.types.setTypeParser(20, Number);  // numeric en bigint als getal
    var client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
    await client.connect();
    client.on('error', function () { db = null; });
    db = { query: async function (t, a) { var r = (a && a.length) ? await client.query(t, a) : await client.query(t); return Array.isArray(r) ? (r[r.length - 1] || { rows: [] }) : r; }, soort: 'pg' };  // zonder parameters: simple protocol, meerdere statements toegestaan
  }
  return db;
}
async function sql(d) {
  var c = await verbinding();
  try { var r = await c.query(d.tekst, d.params || []); return { rows: r.rows || [], rowCount: r.rowCount == null ? (r.affectedRows || 0) : r.rowCount }; }
  catch (e) { if (/terminated|ECONNRESET|closed/i.test(String(e && e.message))) db = null; throw e; }
}

function b64(buf) { return Buffer.from(buf).toString('base64'); }
async function doeFetch(d) {
  if (process.env.ATHENA_GOOGLE_NEP === '1') {  // tests: geen netwerk; Google, PDOK en Claude krijgen vaste antwoorden
    if (/googleapis\.com|googleusercontent\.com/.test(d.url)) return nepGoogle(d);
    if (/api\.pdok\.nl/.test(d.url)) return { status: 200, headers: {}, body: JSON.stringify({ response: { numFound: 1, docs: [{ centroide_ll: 'POINT(5.1214 52.0907)' }] } }) };
    if (/api\.anthropic\.com/.test(d.url)) return { status: 503, headers: {}, body: JSON.stringify({ error: { message: 'Claude staat uit in de test.' } }) };
  }
  var opties = { method: (d.methode || 'GET').toUpperCase(), headers: d.headers || {}, redirect: 'follow' };
  if (d.body != null && opties.method !== 'GET' && opties.method !== 'HEAD') opties.body = d.bodyBase64 ? Buffer.from(d.body, 'base64') : d.body;
  var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, d.timeoutMs || 110000); opties.signal = ac.signal;
  try {
    var r = await fetch(d.url, opties), headers = {};
    r.headers.forEach(function (v, k) { headers[k] = v; });
    var body = d.alsBase64 ? b64(await r.arrayBuffer()) : await r.text();
    return { status: r.status, headers: headers, body: body };
  } finally { clearTimeout(t); }
}
// Vaste antwoorden in plaats van Google (tests): genoeg om de wrappers in server/google.js te laten lopen
function nepGoogle(d) {
  var u = d.url, m = (d.methode || 'GET').toUpperCase(), json = function (o, status) { return { status: status || 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) }; };
  if (/oauth2\.googleapis\.com\/token/.test(u)) return json({ access_token: 'nep-token', expires_in: 3600 });
  // v6.2 (tests): ATHENA_GOOGLE_NEP_FOUT=429|500|403 laat elke Google-API falen, om te zien hoe Code.gs daarop reageert
  var fout = Number(process.env.ATHENA_GOOGLE_NEP_FOUT || 0); if (fout) return json({ error: { message: 'nep-fout ' + fout, status: 'NEP' } }, fout);
  // v6.2 (tests): het antwoordblad van een Google Form (FORM_SHEET_ID=nep-form), met de tijdstempel als serieel getal zoals de Sheets-API hem geeft
  if (/spreadsheets\/nep-form\/values\//.test(u) && m === 'GET') return json({ values: [['Tijdstempel', 'Voornaam', 'Achternaam', 'Mobiel', 'E-mailadres', 'Postcode', 'Functie', 'Sector', 'Beschikbaar', 'Toestemming'], [46266.5, 'Noor', 'Formulier', '0612345678', 'noor.formulier@voorbeeld.nl', '1234 AB', 'surveillant', 'vo', 'ma ochtend, di middag', 'Ja']] });
  if (/spreadsheets\/nep-form\/values\//.test(u)) return json({ updatedCells: 1 });  // verwerkt/talentId terugschrijven
  if (/spreadsheets\/nep-form\?/.test(u)) return json({ properties: { title: 'Nep-formulier' }, sheets: [{ properties: { title: 'Formulierreacties 1' } }] });
  if (/gmail\/v1\/users\/me\/threads\?/.test(u)) return json({ threads: [] });
  if (/gmail\/v1\/users\/me\/messages\/send/.test(u)) return json({ id: 'nep-bericht', threadId: 'nep-thread' });
  if (/gmail\/v1\/users\/me\/drafts/.test(u)) return json({ id: 'nep-concept', message: { id: 'nep-concept-bericht' } });
  if (/calendar\/v3\/calendars\/primary\/events\?/.test(u) && m === 'GET') return json({ items: [] });
  if (/calendar\/v3\/calendars\/primary\/events/.test(u) && m === 'POST') return json({ id: 'nepevent' + Date.now(), iCalUID: 'nepevent@google.com' });
  if (/drive\/v3\/files\?/.test(u) && m === 'GET') return json({ files: [] });
  if (/upload\/drive\/v3\/files/.test(u)) return json({ id: 'nep-bestand-' + Date.now(), name: 'bestand' });
  if (/drive\/v3\/files\/[^/?]+\/copy/.test(u)) return json({ id: 'nep-kopie-' + Date.now() });
  if (/drive\/v3\/files\/[^/?]+\/permissions/.test(u)) return json({ id: 'nep-recht' });
  if (/drive\/v3\/files\/[^/?]+/.test(u) && m === 'GET') return json({ id: 'nep-id', name: 'Nep', mimeType: 'application/vnd.google-apps.folder', webViewLink: 'https://drive.google.com/drive/folders/nep-id' });
  if (/drive\/v3\/files/.test(u) && m === 'POST') return json({ id: 'nep-map-' + Date.now(), name: 'Nieuw' });
  if (/drive\/v3\/files\/[^/?]+/.test(u) && m === 'PATCH') return json({ id: 'nep-id' });
  if (/docs\/v1\/documents\/[^/:]+:batchUpdate/.test(u)) return json({ replies: [] });
  if (/docs\/v1\/documents\/[^/?]+/.test(u) && m === 'GET') return json({ documentId: 'nep-doc', title: 'Nep', body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Neptekst {{hulpvraag}}\n' } }] } }] } });
  if (/docs\/v1\/documents/.test(u) && m === 'POST') return json({ documentId: 'nep-doc-' + Date.now() });
  if (/\/v4\/spreadsheets\/[^/]+\/values/.test(u)) return json({ values: [] });  // v6.2: de host is sheets.googleapis.com/v4/…, niet …/sheets/v4
  if (/\/v4\/spreadsheets\//.test(u)) return json({ sheets: [] });
  return json({ error: { message: 'nep: onbekende Google-URL ' + u } }, 404);
}
async function afhandel(soort, d) {
  if (soort === 'sql') return sql(d);
  if (soort === 'fetch') return doeFetch(d);
  if (soort === 'fetchVeel') return Promise.all(d.map(function (x) { return doeFetch(x).catch(function (e) { return { fout: String((e && e.message) || e) }; }); }));
  if (soort === 'sleep') return new Promise(function (ok) { setTimeout(ok, Math.min(Number(d.ms) || 0, 30000)); });
  throw new Error('onbekende soort ' + soort);
}
poort.on('message', async function (m) {
  var antwoord;
  try { antwoord = { id: m.id, ok: true, result: await afhandel(m.soort, m.data) }; }
  catch (e) { antwoord = { id: m.id, ok: false, fout: String((e && e.message) || e), code: e && e.code }; }
  poort.postMessage(antwoord);
  Atomics.store(int32, 0, 1); Atomics.notify(int32, 0);
});
