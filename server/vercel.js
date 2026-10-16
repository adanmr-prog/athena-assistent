/* Athena Assistent — v6.0: van een Vercel-request (Node runtime) naar verwerk() in server/handler.js en terug. */
'use strict';
function leesBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise(function (ok, nee) {
    var delen = [];
    req.on('data', function (d) { delen.push(d); }); req.on('end', function () { ok(Buffer.concat(delen).toString('utf8')); }); req.on('error', nee);
  });
}
function functie(verwerk, pad) {
  return async function (req, res) {
    var body = req.method === 'POST' ? await leesBody(req) : '';
    var uit = await verwerk({ methode: req.method, pad: typeof pad === 'function' ? pad(req) : pad, query: req.query || {}, headers: req.headers || {}, body: body });
    res.statusCode = uit.status;
    Object.keys(uit.headers || {}).forEach(function (k) { res.setHeader(k, uit.headers[k]); });
    res.end(uit.body);
  };
}
module.exports = { functie: functie, leesBody: leesBody };
