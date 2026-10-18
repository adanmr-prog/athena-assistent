/* Athena Assistent — v6.2 (go-live-review): antwoordtijden van de server meten zoals de app ze ziet (p50/p95 per api).
 *   node server/meet.js --server https://<domein-of-preview> --code <koppelcode> [--n 20] [--api apiHome,apiCrm,apiTaken,apiTrajecten,apiTalenten]
 * Elke api wordt n keer na elkaar aangeroepen (de eerste aanroep apart als koude start). Vergelijk een preview in fra1 met een
 * preview in iad1 (vercel.json → regions) vanaf dezelfde plek: het verschil is de afstand tot de database.
 * Verwachting (go-live-criterium): fra1 p95 van apiHome onder 800 ms met de productiegegevens; iad1 ligt daar ruim boven. */
'use strict';
var argv = process.argv.slice(2), opt = {};
for (var i = 0; i < argv.length; i++) { if (argv[i].indexOf('--') === 0) { var k = argv[i].slice(2); if (argv[i + 1] && argv[i + 1].indexOf('--') !== 0) opt[k] = argv[++i]; else opt[k] = true; } }
if (!opt.server || !opt.code) { console.error('Gebruik: node server/meet.js --server <url> --code <koppelcode> [--n 20] [--api apiHome,apiCrm]'); process.exit(2); }
var server = String(opt.server).replace(/\/+$/, '').replace(/\/api$/, ''), N = Number(opt.n) || 20;
var apis = String(opt.api || 'apiHome,apiCrm,apiTaken,apiTrajecten,apiPipeline,apiTalenten').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
function pct(lijst, p) { var s = lijst.slice().sort(function (a, b) { return a - b; }); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
async function een(fn) {
  var begin = Date.now(), r = await fetch(server + '/api', { method: 'POST', body: JSON.stringify({ fn: fn, args: [], secret: String(opt.code) }) }), tekst = await r.text(), d;
  try { d = JSON.parse(tekst); } catch (e) { d = { ok: false, fout: 'HTTP ' + r.status }; }
  return { ms: Date.now() - begin, ok: !!d.ok, fout: d.fout || '', kb: Math.round(tekst.length / 1024) };
}
(async function () {
  var ping = []; for (var p = 0; p < 5; p++) { var b = Date.now(); await fetch(server + '/api'); ping.push(Date.now() - b); }
  console.log('Server ' + server + ' · GET /api p50 ' + pct(ping, 0.5) + ' ms (netwerk + functie zonder database)\n');
  console.log('| api | koud (1e) | p50 | p95 | max | kB | fouten |\n|---|---|---|---|---|---|---|');
  for (var a = 0; a < apis.length; a++) {
    var fn = apis[a], tijden = [], fouten = 0, kb = 0, koud = await een(fn); if (!koud.ok) fouten++;
    for (var n = 0; n < N; n++) { var r = await een(fn); tijden.push(r.ms); kb = r.kb; if (!r.ok) fouten++; }
    console.log('| ' + fn + ' | ' + koud.ms + ' | ' + pct(tijden, 0.5) + ' | ' + pct(tijden, 0.95) + ' | ' + Math.max.apply(null, tijden) + ' | ' + kb + ' | ' + fouten + (fouten ? ' (' + (koud.fout || r.fout).slice(0, 40) + ')' : '') + ' |');
  }
})().catch(function (e) { console.error('Meten mislukt: ' + e.message); process.exit(1); });
