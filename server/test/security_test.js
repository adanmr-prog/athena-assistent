// v6.2 (go-live-review): negatieftests op de buitenkant van de server, tegen pglite zonder netwerk.
// Gebruik: node server/test/security_test.js  → "ALLES GOED" of FOUT-regels (exitcode 1).
// Dekt: JWT's die niet mogen (alg none, verkeerd geheim, verlopen, gemanipuleerd, verkeerde aud, verkeerde issuer, anon-/service-sleutel),
// koppelcodes raden (na AUTH_MAX mislukte pogingen per IP een 429, ook voor een goede code vanaf dat IP; een ander IP werkt door;
// het portaal telt niet mee), CORS (geen header zonder ATHENA_CORS_ORIGIN) en onzin in de body.
'use strict';
process.env.ATHENA_DB = 'pglite'; process.env.ATHENA_GOOGLE_NEP = '1'; process.env.EIGENAAR_EMAIL = 'sophie@athena.example';
process.env.SUPABASE_JWT_SECRET = 'test-geheim-van-minstens-32-tekens-lang!'; process.env.CRON_SECRET = 'cron-geheim'; process.env.APP_API_URL = 'https://athena.example/api';
process.env.GOOGLE_CLIENT_ID = 'nep'; process.env.GOOGLE_CLIENT_SECRET = 'nep'; process.env.GOOGLE_REFRESH_TOKEN = 'nep';
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY; delete process.env.ATHENA_CORS_ORIGIN;
var jose = require('jose'), brug = require('../sync.js'), migratie = require('../migratie.js'), handler = require('../handler.js');
var fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
var GEHEIM = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
async function post(body, headers, env) { var r = await handler.verwerk({ methode: 'POST', pad: '/api', headers: headers || {}, body: typeof body === 'string' ? body : JSON.stringify(body), env: env }); var d; try { d = JSON.parse(r.body); } catch (e) { d = null; } return { status: r.status, d: d, headers: r.headers }; }
function jwt(claims, geheim, alg) { var s = new jose.SignJWT(claims).setProtectedHeader({ alg: alg || 'HS256' }).setIssuedAt(); return s.sign(geheim || GEHEIM); }

(async function () {
  migratie.importeer(migratie.exportUitDemo());
  var goed = { email: 'sophie@athena.example', aud: 'authenticated', role: 'authenticated' };

  /* ---- JWT ---- */
  var tGoed = await jwt(Object.assign({ exp: Math.floor(Date.now() / 1000) + 3600 }, goed));
  eis((await post({ fn: 'apiCrm', args: [], token: tGoed })).d.ok === true, 'een geldig token met aud authenticated logt in');
  var kop = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'), lijf = Buffer.from(JSON.stringify(Object.assign({ exp: Math.floor(Date.now() / 1000) + 3600 }, goed))).toString('base64url');
  eis((await post({ fn: 'apiCrm', args: [], token: kop + '.' + lijf + '.' })).d.fout === 'secret', 'alg none wordt geweigerd');
  eis((await post({ fn: 'apiCrm', args: [], token: await jwt(Object.assign({ exp: Math.floor(Date.now() / 1000) + 3600 }, goed), new TextEncoder().encode('een-ander-geheim-van-minstens-32-tekens')) })).d.fout === 'secret', 'een token met een ander geheim wordt geweigerd');
  eis((await post({ fn: 'apiCrm', args: [], token: await jwt(Object.assign({ exp: Math.floor(Date.now() / 1000) - 60 }, goed)) })).d.fout === 'secret', 'een verlopen token wordt geweigerd');
  var delen = tGoed.split('.'), vals = Buffer.from(JSON.stringify(Object.assign({}, goed, { email: 'femke@athena.example', exp: Math.floor(Date.now() / 1000) + 3600 }))).toString('base64url');
  eis((await post({ fn: 'apiCrm', args: [], token: delen[0] + '.' + vals + '.' + delen[2] })).d.fout === 'secret', 'een token met een aangepast e-mailadres (zelfde handtekening) wordt geweigerd');
  eis((await post({ fn: 'apiCrm', args: [], token: await jwt({ email: 'sophie@athena.example', aud: 'anon', role: 'anon', exp: Math.floor(Date.now() / 1000) + 3600 }) })).d.fout === 'secret', 'aud anon (de anon-sleutel) wordt geweigerd, ook met een e-mailadres erin');
  eis((await post({ fn: 'apiCrm', args: [], token: await jwt({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) })).d.fout === 'secret', 'een token zonder e-mailadres (service_role) wordt geweigerd');
  var envUrl = Object.assign({}, process.env, { SUPABASE_URL: 'https://abc.supabase.co' });
  eis((await post({ fn: 'apiCrm', args: [], token: await jwt(Object.assign({ iss: 'https://abc.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 }, goed)) }, {}, envUrl)).d.ok === true, 'met SUPABASE_URL: de issuer van het project wordt geaccepteerd');
  eis((await post({ fn: 'apiCrm', args: [], token: await jwt(Object.assign({ iss: 'https://xyz.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 }, goed)) }, {}, envUrl)).d.fout === 'secret', 'met SUPABASE_URL: een token van een ander project (andere issuer) wordt geweigerd');
  eis((await post({ fn: 'apiCrm', args: [], token: await jwt(Object.assign({ exp: Math.floor(Date.now() / 1000) + 3600 }, goed)) }, {}, envUrl)).d.fout === 'secret', 'met SUPABASE_URL: een token zonder issuer wordt geweigerd');

  /* ---- koppelcodes raden ---- */
  var IP = { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, ANDER = { 'x-forwarded-for': '198.51.100.7' }, n429 = 0, nSecret = 0;
  for (var i = 0; i < handler.AUTH_MAX + 3; i++) { var r = await post({ fn: 'apiCrm', args: [], secret: 'raad-' + i }, IP); if (r.status === 429) n429++; else if (r.d && r.d.fout === 'secret') nSecret++; }
  eis(nSecret === handler.AUTH_MAX && n429 === 3, 'na ' + handler.AUTH_MAX + ' verkeerde koppelcodes vanaf één IP geeft de server 429 in plaats van secret');
  var r429 = await post({ fn: 'apiCrm', args: [], secret: 'demo-sophie' }, IP);
  eis(r429.status === 429 && /inlogpogingen/.test(r429.d.fout), 'ook de goede code krijgt vanaf dat IP tien minuten een 429 (de melding zegt dat)');
  eis((await post({ fn: 'apiCrm', args: [], secret: 'demo-sophie' }, ANDER)).d.ok === true, 'een ander IP werkt gewoon door');
  eis((await post({ fn: 'apiCrm', args: [], secret: 'demo-sophie' }, {})).d.ok === true, 'zonder IP-header (lokaal, tests) wordt niet geteld');
  var rT = await post({ fn: 'apiCrm', args: [], token: 'onzin-token-van-genoeg-tekens' }, { 'x-forwarded-for': '192.0.2.9' });
  eis(rT.d.fout === 'secret' && Number(brug.sql("select waarde from cache where sleutel = 'athena-auth-fout-192.0.2.9'").rows[0].waarde) === 1, 'een ongeldig token telt ook als mislukte poging');
  var p1 = await post({ fn: 'apiPortaalToon', args: [], portaal: 'verkeerd-token-1234567890' }, IP);
  eis(p1.status === 200 && !p1.d.ok && !/inlogpogingen/.test(p1.d.fout), 'het portaal valt buiten de IP-teller (eigen budget per token in Code.gs)');
  brug.sql("delete from cache where sleutel like 'athena-auth-fout-%'");

  /* ---- CORS en onzin ---- */
  var o1 = await handler.verwerk({ methode: 'OPTIONS', pad: '/api', headers: {} }), o2 = await handler.verwerk({ methode: 'OPTIONS', pad: '/api', headers: {}, env: Object.assign({}, process.env, { ATHENA_CORS_ORIGIN: 'https://crm.voorbeeld.nl' }) });
  eis(o1.status === 204 && !o1.headers['Access-Control-Allow-Origin'] && o2.headers['Access-Control-Allow-Origin'] === 'https://crm.voorbeeld.nl', 'OPTIONS: geen Access-Control-Allow-Origin tenzij ATHENA_CORS_ORIGIN');
  eis((await post('dit is geen json', {})).status === 400, 'geen JSON in de body geeft 400');
  eis((await post({ fn: 'lees', args: ['Gebruikers'], secret: 'demo-sophie' })).d.fout.indexOf('onbekende functie') === 0, 'alleen api*-functies zijn aan te roepen (geen interne functies zoals lees)');
  eis((await post({ fn: 'apiPortaalToon', args: ['x'], secret: 'demo-sophie' })).d.fout.indexOf('onbekende functie') === 0, 'de portaalfuncties zijn niet met een koppelcode aan te roepen');
  var cron = await handler.verwerk({ methode: 'GET', pad: '/api/cron/herinneringTrigger', headers: { authorization: 'Bearer verkeerd' } });
  eis(cron.status === 401, 'cron zonder het juiste geheim: 401');

  brug.stop();
  console.log(fouten ? fouten + ' FOUT(EN)' : 'ALLES GOED');
  process.exit(fouten ? 1 : 0);
})().catch(function (e) { console.error('FOUT (onverwacht): ' + (e && e.stack || e)); brug.stop(); process.exit(1); });
