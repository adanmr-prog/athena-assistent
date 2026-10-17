/* Athena Assistent — v6.0: de HTTP-afhandeling, los van Vercel (api/*.js roept verwerk() aan; de tests ook).
 * Routes: POST /api  {fn, args, secret | token | portaal} → zoals doPost in Code.gs ({ok, result | fout});
 *         GET  /api  → {ok, app, versie};  GET /api/config → inlogconfiguratie voor de app (Supabase Auth met Google);
 *         GET  /api/cron/<taak> met Authorization: Bearer <CRON_SECRET> → draait een trigger uit Code.gs (de cron van Vercel).
 * Een token is een Supabase-sessietoken (Google-login): na controle gaat het e-mailadres als SERVER_LOGIN naar Code.gs, dat de
 * gebruiker opzoekt (de eigenaar via EIGENAAR_EMAIL, anderen in Gebruikers). Zonder token werkt de koppelcode zoals altijd.
 * v6.2 (go-live-review): een token telt alleen met aud 'authenticated' en de issuer van het project; geen CORS-header tenzij
 * ATHENA_CORS_ORIGIN is gezet (de app staat op hetzelfde domein); na AUTH_MAX mislukte inlogpogingen per IP binnen AUTH_MINUTEN
 * een 429 (teller in de cachetabel, zoals het portaalbudget); /api/config noemt de maximale bestandsgrootte van Vercel. */
'use strict';
var code = require('./code.js'), schema = require('./schema.js'), brug = require('./sync.js'), A = require('./apps-script.js');

var MAX_BESTAND = 3 * 1024 * 1024;  // Vercel accepteert 4,5 MB per verzoek: 3 MB bestand = 4 MB base64 + de rest van de JSON (Apps Script houdt zijn 8 MB)
var AUTH_MAX = 20, AUTH_MINUTEN = 10;

var jwks = null;
async function emailUitToken(token, env) {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  var jose = require('jose'), claims = null;
  var opties = { audience: 'authenticated' };  // de anon- en service-sleutel zijn ook JWT's met hetzelfde geheim, maar met een andere aud en zonder e-mailadres
  if (env.SUPABASE_URL) opties.issuer = env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1';
  if (env.SUPABASE_JWT_SECRET) {
    try { claims = (await jose.jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), Object.assign({ algorithms: ['HS256'] }, opties))).payload; } catch (e) { claims = null; }
  }
  if (!claims && env.SUPABASE_URL) {
    try { if (!jwks) jwks = jose.createRemoteJWKSet(new URL(opties.issuer + '/.well-known/jwks.json')); claims = (await jose.jwtVerify(token, jwks, opties)).payload; } catch (e2) { claims = null; }
  }
  if (!claims) return null;
  var email = claims.email || (claims.user_metadata && claims.user_metadata.email) || '';
  return email ? String(email).toLowerCase() : null;
}
function corsVoor(env) { var o = env.ATHENA_CORS_ORIGIN; return o ? { 'Access-Control-Allow-Origin': o, 'Vary': 'Origin' } : {}; }
function antwoord(status, obj, extra) {
  var headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (extra) Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
  return { status: status, headers: headers, body: typeof obj === 'string' ? obj : JSON.stringify(obj) };
}
function padVan(v) { return String(v.pad || '/').replace(/\?.*$/, '').replace(/\/+$/, '') || '/'; }
function ipVan(v) { var h = v.headers || {}; return String(h['x-forwarded-for'] || h['X-Forwarded-For'] || h['x-real-ip'] || '').split(',')[0].trim().slice(0, 64); }
// Een storing in de database of de brug is geen fout van de gebruiker: 503 met een leesbare melding (de technische tekst gaat naar het log van Vercel)
var DB_FOUT = /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|terminated|Connection terminated|password authentication|SASL|DATABASE_URL ontbreekt|Geen antwoord van de achtergrondtaak|too many (clients|connections)|remaining connection slots/i;
function dbStoring(fout) { return DB_FOUT.test(String(fout || '')); }
function storingAntwoord(fout, cors) { console.error('[athena] databasestoring: ' + String(fout).slice(0, 300)); return antwoord(503, { ok: false, fout: 'De database is even niet bereikbaar. Probeer het zo opnieuw; je wijziging is niet opgeslagen.' }, cors); }
// Mislukte inlogpogingen (verkeerde koppelcode of ongeldig token) per IP tellen; vanaf AUTH_MAX binnen AUTH_MINUTEN een 429.
// Apps Script had de quota van Google als rem; op een eigen domein kost een raadpoging anders niets.
function authGeblokkeerd(ip) {
  if (!ip) return false;
  A.zorgTabel('Scholen');
  var r = brug.sql('select waarde from cache where sleutel = $1 and verloopt > now()', ['athena-auth-fout-' + ip]).rows[0];
  return !!r && Number(r.waarde) >= AUTH_MAX;
}
function authMislukt(ip) {
  if (!ip) return;
  brug.sql("insert into cache (sleutel, waarde, verloopt) values ($1, '1', now() + ($2 || ' minutes')::interval) on conflict (sleutel) do update set waarde = case when cache.verloopt > now() then (cache.waarde::int + 1)::text else '1' end, verloopt = case when cache.verloopt > now() then cache.verloopt else now() + ($2 || ' minutes')::interval end", ['athena-auth-fout-' + ip, String(AUTH_MINUTEN)]);
}

async function verwerk(v) {
  var env = v.env || process.env, methode = String(v.methode || 'GET').toUpperCase(), pad = padVan(v), cors = corsVoor(env);
  if (methode === 'OPTIONS') return { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' }, cors), body: '' };
  try {
    if (/^\/api\/config$/.test(pad)) {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return antwoord(404, { ok: false, fout: 'Geen inlogconfiguratie: zet SUPABASE_URL en SUPABASE_ANON_KEY.' }, cors);
      return antwoord(200, { ok: true, inloggen: 'google', supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ''), anonKey: env.SUPABASE_ANON_KEY, versie: schema.versie(), app: 'Athena Assistent', maxBestand: MAX_BESTAND }, cors);
    }
    var cron = /^\/api\/cron(?:\/([A-Za-z]\w*))?$/.exec(pad);
    if (cron) {
      var taak = cron[1] || (v.query && v.query.taak) || '';
      if (!env.CRON_SECRET) return antwoord(503, { ok: false, fout: 'CRON_SECRET ontbreekt in de omgeving; de cron staat uit.' }, cors);
      var auth = String((v.headers && (v.headers.authorization || v.headers.Authorization)) || '');
      if (auth !== 'Bearer ' + env.CRON_SECRET) return antwoord(401, { ok: false, fout: 'geen toegang' }, cors);
      if (schema.triggers().indexOf(taak) < 0) return antwoord(400, { ok: false, fout: 'onbekende taak ' + taak + '; kies uit ' + schema.triggers().join(', ') }, cors);
      var C = code.start({ env: env }), begin = Date.now(), uit;
      try { uit = C.api[taak](); } finally { C.diensten.flush(); }
      return antwoord(200, { ok: true, taak: taak, resultaat: uit === undefined ? null : uit, ms: Date.now() - begin, waarschuwingen: C.diensten.waarschuwingen }, cors);
    }
    if (!/^\/api(\/index)?$/.test(pad)) return antwoord(404, { ok: false, fout: 'onbekend pad ' + pad }, cors);
    if (methode === 'GET') return antwoord(200, { ok: true, app: 'Athena Assistent', versie: schema.versie(), melding: 'Backend actief (Vercel + Supabase). De app gebruikt dit adres zelf.' }, cors);
    if (methode !== 'POST') return antwoord(405, { ok: false, fout: 'alleen GET en POST' }, cors);
    var req = {};
    // De body is altijd JSON, ook zonder Content-Type: de app stuurt (net als naar Apps Script) geen headers, dus de browser zet text/plain. api/index.js heeft daarom bodyParser uit.
    try { req = JSON.parse(v.body || '{}') || {}; } catch (e) { return antwoord(400, { ok: false, fout: 'geen geldige JSON' }, cors); }
    var ip = req.portaal ? '' : ipVan(v);  // het portaal heeft zijn eigen budget per token (Code.gs)
    if (ip && authGeblokkeerd(ip)) return antwoord(429, { ok: false, fout: 'Te veel mislukte inlogpogingen vanaf dit adres. Probeer het over ' + AUTH_MINUTEN + ' minuten opnieuw.' }, cors);
    var login = null;
    if (req.token && !req.portaal) {
      login = await emailUitToken(String(req.token), env);
      if (!login) { authMislukt(ip); return antwoord(200, { ok: false, fout: 'secret' }, cors); }  // verlopen of ongeldig: de app logt opnieuw in
      delete req.token; delete req.secret;
    }
    var S = code.start({ env: env, login: login }), tekst;
    try { tekst = S.api.doPost({ postData: { contents: JSON.stringify(req) } }); }
    catch (e2) { try { S.diensten.flush(); } catch (e3) {} return dbStoring(e2 && e2.message) ? storingAntwoord(e2.message, cors) : antwoord(200, { ok: false, fout: String((e2 && e2.message) || e2) }, cors); }
    try { S.diensten.flush(); }
    catch (e4) { return dbStoring(e4 && e4.message) ? storingAntwoord(e4.message, cors) : antwoord(200, { ok: false, fout: 'Opslaan in de database mislukt: ' + String((e4 && e4.message) || e4) }, cors); }
    tekst = String(tekst);
    if (ip && tekst === '{"ok":false,"fout":"secret"}') authMislukt(ip);  // zo antwoordt doPost op een onbekende koppelcode
    if (tekst.indexOf('{"ok":false,"fout":"') === 0) { var dF = null; try { dF = JSON.parse(tekst); } catch (e6) {} if (dF && dbStoring(dF.fout)) return storingAntwoord(dF.fout, cors); }  // doPost vangt alles, ook een databasefout
    return antwoord(200, tekst, cors);
  } catch (e5) {
    if (dbStoring(e5 && e5.message)) return storingAntwoord(e5.message, cors);
    return antwoord(500, { ok: false, fout: 'Serverfout: ' + String((e5 && e5.message) || e5) }, cors);
  }
}
module.exports = { verwerk: verwerk, emailUitToken: emailUitToken, MAX_BESTAND: MAX_BESTAND, AUTH_MAX: AUTH_MAX, AUTH_MINUTEN: AUTH_MINUTEN };
