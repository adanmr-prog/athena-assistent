/* Athena Assistent — v6.0: de app en de API lokaal draaien, zonder Vercel. Serveert de repo statisch en /api via server/handler.js.
 *   ATHENA_DB=pglite:server/.pglite node server/migratie.js --demo      (één keer: demogegevens in een lokale Postgres)
 *   ATHENA_DB=pglite:server/.pglite EIGENAAR_EMAIL=sophie@athena.example node server/lokaal.js
 * Open http://localhost:3000 en koppel met de koppelcode demo-sophie (inloggen met Google vraagt een Supabase-project; zet dan
 * SUPABASE_URL, SUPABASE_ANON_KEY en SUPABASE_JWT_SECRET, en DATABASE_URL in plaats van ATHENA_DB). */
'use strict';
process.env.TZ = 'Europe/Amsterdam';
var http = require('http'), fs = require('fs'), path = require('path'), handler = require('./handler.js');
var ROOT = path.join(__dirname, '..'), POORT = Number(process.env.POORT) || 3000;
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css', '.gs': 'text/javascript; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml' };
http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://localhost'), pad = u.pathname;
  if (/^\/api(\/|$)/.test(pad)) {
    var delen = [];
    req.on('data', function (d) { delen.push(d); });
    req.on('end', function () {
      var query = {}; u.searchParams.forEach(function (v, k) { query[k] = v; });
      handler.verwerk({ methode: req.method, pad: pad, query: query, headers: req.headers, body: Buffer.concat(delen).toString('utf8') }).then(function (uit) {
        res.writeHead(uit.status, uit.headers); res.end(uit.body);
      }).catch(function (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, fout: String(e && e.message || e) })); });
    });
    return;
  }
  var bestand = path.normalize(path.join(ROOT, pad === '/' ? 'index.html' : pad));
  if (bestand.indexOf(ROOT) !== 0 || !fs.existsSync(bestand) || fs.statSync(bestand).isDirectory()) { res.writeHead(404); res.end('niet gevonden'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(bestand)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(bestand).pipe(res);
}).listen(POORT, function () { console.log('Athena Assistent lokaal: http://localhost:' + POORT + '  (API op /api; database ' + (process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.ATHENA_DB || 'ontbreekt: zet ATHENA_DB=pglite:server/.pglite') + ')'); });
