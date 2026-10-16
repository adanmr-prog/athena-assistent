/* Athena Assistent — v6.0: synchrone brug naar een worker-thread.
 * Code.gs is geschreven voor Apps Script, waar alles synchroon is (een Sheet lezen, een mail zoeken, een URL ophalen).
 * In Node zijn Postgres en fetch asynchroon. Deze brug laat de hoofdthread wachten (Atomics.wait) terwijl een worker
 * het werk doet, zodat Code.gs ongewijzigd kan draaien. Eén worker per proces; de aanroepen lopen één voor één.
 * Soorten: sql {tekst, params} → {rows}; fetch {url, methode, headers, body, alsBase64} → {status, headers, body};
 * fetchVeel [fetch…] → [antwoord|{fout}] (parallel in de worker); sleep {ms}. */
'use strict';
var wt = require('worker_threads'), path = require('path');

var worker = null, poort = null, int32 = null, teller = 0;
function start() {
  if (worker) return;
  var sab = new SharedArrayBuffer(4), kanaal = new wt.MessageChannel();
  int32 = new Int32Array(sab);
  worker = new wt.Worker(path.join(__dirname, 'sync-worker.js'), { workerData: { sab: sab, poort: kanaal.port2 }, transferList: [kanaal.port2] });
  worker.on('error', function (e) { console.error('sync-worker:', e); worker = null; });
  worker.on('exit', function () { worker = null; });
  worker.unref();
  poort = kanaal.port1; poort.unref();
}
// Blokkeert tot de worker antwoordt; gooit bij een fout in de worker of als er binnen timeoutMs niets komt.
function roep(soort, data, timeoutMs) {
  start();
  var id = ++teller, wacht = timeoutMs || 120000, begin = Date.now();
  Atomics.store(int32, 0, 0);
  poort.postMessage({ id: id, soort: soort, data: data });
  for (;;) {
    var rest = wacht - (Date.now() - begin);
    if (rest <= 0) throw new Error('Geen antwoord van de achtergrondtaak (' + soort + ') binnen ' + wacht + ' ms');
    var r = Atomics.wait(int32, 0, 0, rest);
    if (r === 'timed-out') throw new Error('Geen antwoord van de achtergrondtaak (' + soort + ') binnen ' + wacht + ' ms');
    Atomics.store(int32, 0, 0);
    var m;
    while ((m = wt.receiveMessageOnPort(poort))) {
      var a = m.message;
      if (a.id !== id) continue;  // een laat antwoord op een eerdere, verlopen aanroep
      if (a.ok) return a.result;
      var fout = new Error(a.fout || 'onbekende fout in de achtergrondtaak'); fout.code = a.code; throw fout;
    }
  }
}
function sql(tekst, params) { return roep('sql', { tekst: tekst, params: params || [] }); }
function fetch(url, opties) { return roep('fetch', Object.assign({ url: url }, opties || {}), (opties && opties.timeoutMs) || 120000); }
function fetchVeel(lijst) { return roep('fetchVeel', lijst, 180000); }
function sleep(ms) { roep('sleep', { ms: ms }, ms + 5000); }
function stop() { if (worker) { worker.terminate(); worker = null; } }

module.exports = { roep: roep, sql: sql, fetch: fetch, fetchVeel: fetchVeel, sleep: sleep, stop: stop };
