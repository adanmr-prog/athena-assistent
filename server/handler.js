/* Athena Assistent — v6.0: de HTTP-afhandeling, los van Vercel (api/*.js roept verwerk() aan; de tests ook).
 * Routes: POST /api  {fn, args, secret | token | portaal} → zoals doPost in Code.gs ({ok, result | fout});
 *         GET  /api  → {ok, app, versie};  GET /api/config → inlogconfiguratie voor de app (Supabase Auth met Google);
 *         GET  /api/cron/<taak> met Authorization: Bearer <CRON_SECRET> → draait een trigger uit Code.gs (de cron van Vercel).
 * Een token is een Supabase-sessietoken (Google-login): na controle gaat het e-mailadres als SERVER_LOGIN naar Code.gs, dat de
 * gebruiker opzoekt (de eigenaar via EIGENAAR_EMAIL, anderen in Gebruikers). Zonder token werkt de koppelcode zoals altijd. */
'use strict';
var code = require('./code.js'), schema = require('./schema.js');

var jwks = null;
async function emailUitToken(token, env) {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  var jose = require('jose'), claims = null;
  if (env.SUPABASE_JWT_SECRET) {
    try { claims = (await jose.jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), { algorithms: ['HS256'] })).payload; } catch (e) { claims = null; }
  }
  if (!claims && env.SUPABASE_URL) {
    try { if (!jwks) jwks = jose.createRemoteJWKSet(new URL(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/.well-known/jwks.json')); claims = (await jose.jwtVerify(token, jwks)).payload; } catch (e2) { claims = null; }
  }
  if (!claims) return null;
  var email = claims.email || (claims.user_metadata && claims.user_metadata.email) || '';
  return email ? String(email).toLowerCase() : null;
}
function antwoord(status, obj, extra) {
  var headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
  if (extra) Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
  return { status: status, headers: headers, body: typeof obj === 'string' ? obj : JSON.stringify(obj) };
}
function padVan(v) { return String(v.pad || '/').replace(/\?.*$/, '').replace(/\/+$/, '') || '/'; }

async function verwerk(v) {
  var env = v.env || process.env, methode = String(v.methode || 'GET').toUpperCase(), pad = padVan(v);
  if (methode === 'OPTIONS') return { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' }, body: '' };
  try {
    if (/^\/api\/config$/.test(pad)) {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return antwoord(404, { ok: false, fout: 'Geen inlogconfiguratie: zet SUPABASE_URL en SUPABASE_ANON_KEY.' });
      return antwoord(200, { ok: true, inloggen: 'google', supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ''), anonKey: env.SUPABASE_ANON_KEY, versie: schema.versie(), app: 'Athena Assistent' });
    }
    var cron = /^\/api\/cron(?:\/([A-Za-z]\w*))?$/.exec(pad);
    if (cron) {
      var taak = cron[1] || (v.query && v.query.taak) || '';
      if (!env.CRON_SECRET) return antwoord(503, { ok: false, fout: 'CRON_SECRET ontbreekt in de omgeving; de cron staat uit.' });
      var auth = String((v.headers && (v.headers.authorization || v.headers.Authorization)) || '');
      if (auth !== 'Bearer ' + env.CRON_SECRET) return antwoord(401, { ok: false, fout: 'geen toegang' });
      if (schema.triggers().indexOf(taak) < 0) return antwoord(400, { ok: false, fout: 'onbekende taak ' + taak + '; kies uit ' + schema.triggers().join(', ') });
      var C = code.start({ env: env }), begin = Date.now(), uit;
      try { uit = C.api[taak](); } finally { C.diensten.flush(); }
      return antwoord(200, { ok: true, taak: taak, resultaat: uit === undefined ? null : uit, ms: Date.now() - begin, waarschuwingen: C.diensten.waarschuwingen });
    }
    if (!/^\/api(\/index)?$/.test(pad)) return antwoord(404, { ok: false, fout: 'onbekend pad ' + pad });
    if (methode === 'GET') return antwoord(200, { ok: true, app: 'Athena Assistent', versie: schema.versie(), melding: 'Backend actief (Vercel + Supabase). De app gebruikt dit adres zelf.' });
    if (methode !== 'POST') return antwoord(405, { ok: false, fout: 'alleen GET en POST' });
    var req = {};
    try { req = JSON.parse(v.body || '{}') || {}; } catch (e) { return antwoord(400, { ok: false, fout: 'geen geldige JSON' }); }
    var login = null;
    if (req.token && !req.portaal) {
      login = await emailUitToken(String(req.token), env);
      if (!login) return antwoord(200, { ok: false, fout: 'secret' });  // verlopen of ongeldig: de app logt opnieuw in
      delete req.token; delete req.secret;
    }
    var S = code.start({ env: env, login: login }), tekst;
    try { tekst = S.api.doPost({ postData: { contents: JSON.stringify(req) } }); }
    catch (e2) { try { S.diensten.flush(); } catch (e3) {} return antwoord(200, { ok: false, fout: String((e2 && e2.message) || e2) }); }
    try { S.diensten.flush(); }
    catch (e4) { return antwoord(200, { ok: false, fout: 'Opslaan in de database mislukt: ' + String((e4 && e4.message) || e4) }); }
    return antwoord(200, String(tekst));
  } catch (e5) {
    return antwoord(500, { ok: false, fout: 'Serverfout: ' + String((e5 && e5.message) || e5) });
  }
}
module.exports = { verwerk: verwerk, emailUitToken: emailUitToken };
