// v6.0: test van de server (Vercel + Postgres) tegen Postgres-in-WASM (pglite), zonder Google (ATHENA_GOOGLE_NEP=1).
// Gebruik: node server/test/server_test.js  → "ALLES GOED" of FOUT-regels (exitcode 1). Draait de demogegevens via de
// migratie in Postgres en roept de API aan zoals de app dat doet: met koppelcode, met een Google-token en via het portaal.
'use strict';
process.env.ATHENA_DB = 'pglite'; process.env.ATHENA_GOOGLE_NEP = '1'; process.env.EIGENAAR_EMAIL = 'sophie@athena.example';
process.env.SUPABASE_JWT_SECRET = 'test-geheim-van-minstens-32-tekens-lang!'; process.env.CRON_SECRET = 'cron-geheim'; process.env.APP_API_URL = 'https://athena.example/api';
process.env.GOOGLE_CLIENT_ID = 'nep'; process.env.GOOGLE_CLIENT_SECRET = 'nep'; process.env.GOOGLE_REFRESH_TOKEN = 'nep';  // de worker beantwoordt Google zelf (ATHENA_GOOGLE_NEP)
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
var fs = require('fs'), path = require('path'), R = path.join(__dirname, '..', '..');
var schema = require('../schema.js'), brug = require('../sync.js'), A = require('../apps-script.js'), migratie = require('../migratie.js'), handler = require('../handler.js'), vercel = require('../vercel.js'), code = require('../code.js');

var fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
async function post(body, env) { var r = await handler.verwerk({ methode: 'POST', pad: '/api', headers: {}, body: JSON.stringify(body), env: env }); return JSON.parse(r.body); }
async function roep(code2, fn) { var args = Array.prototype.slice.call(arguments, 2), d = await post({ fn: fn, args: args, secret: code2 }); if (!d.ok) throw new Error(d.fout); return d.result; }
async function faalt(code2, fn) { var args = Array.prototype.slice.call(arguments, 2); try { await roep.apply(null, [code2, fn].concat(args)); return ''; } catch (e) { return String(e.message); } }
async function token(email, geheim) { var jose = require('jose'); return new jose.SignJWT({ email: email, aud: 'authenticated', role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(geheim || process.env.SUPABASE_JWT_SECRET)); }
var SOPHIE = 'demo-sophie', FEMKE = 'demo-femke', IRIS = 'demo-iris';

(async function () {
  /* ---- schema ---- */
  eis(fs.readFileSync(path.join(R, 'supabase/migrations/0001_init.sql'), 'utf8') === schema.ddl(), 'supabase/migrations/0001_init.sql is actueel (node server/schema.js --sql)');
  eis(schema.tabelNaam('TalentDocumenten') === 'talent_documenten' && schema.kolomNaam('urenPerWeek') === 'uren_per_week' && schema.kolomNaam('xpsPlaatsingId') === 'xps_plaatsing_id' && schema.tabelNaam('Activiteiten_archief') === 'activiteiten_archief', 'namen in snake_case');
  eis(schema.isNumeriek('Trajecten', 'omzet') && !schema.isNumeriek('Trajecten', 'school') && schema.sleutelVan('Instellingen') === 'sleutel' && schema.sleutelVan('Aanmeldingen') === null, 'getalkolommen en sleutels');
  eis(A.formatDate(new Date(Date.UTC(2026, 2, 29, 1, 30)), 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm') === '2026-03-29 03:30' && A.formatDate(new Date(Date.UTC(2026, 0, 5, 23, 15)), 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm') === '2026-01-06 00:15', 'formatDate rekent in Europe/Amsterdam (zomer- en wintertijd)');
  eis(A.naarDb('Trajecten', 'omzet', '48.600') === 48.6 && A.naarDb('Trajecten', 'omzet', '') === null && A.naarDb('Scholen', 'velden', { a: 1 }) === '{"a":1}' && A.uitDb('Trajecten', 'omzet', '12.5') === 12.5 && A.uitDb('Scholen', 'naam', null) === '', 'omzetting van en naar de database');
  var waarsch = []; eis(A.naarDb('Trajecten', 'omzet', 'veel', function (s) { waarsch.push(s); }) === null && waarsch.length === 1, 'een tekst in een getalkolom wordt leeg met een waarschuwing');

  /* ---- migratie van de demogegevens ---- */
  var exp = migratie.exportUitDemo();
  eis(exp.tabellen.Talenten.length === 25 && exp.tabellen.Gebruikers.length >= 9 && exp.eigenschappen.SECRET === 'demo-sophie' && !exp.eigenschappen.ANTHROPIC_API_KEY, 'demo-export: 25 talenten, gebruikers, eigenschappen zonder API-sleutel');
  var st = migratie.importeer(exp);
  eis(Object.keys(st.tabellen).length >= 20 && Object.keys(st.tabellen).every(function (t) { return st.tabellen[t].inDatabase === st.tabellen[t].geimporteerd; }) && st.waarschuwingen.length === 0, 'import: elke tabel staat volledig in Postgres, zonder waarschuwingen');
  var st2 = migratie.importeer(exp);
  eis(st2.tabellen.Talenten.inDatabase === 25 && st2.tabellen.Acties.inDatabase === st.tabellen.Acties.inDatabase, 'opnieuw importeren verdubbelt niets (upsert op de sleutel)');
  eis(brug.sql("select count(*)::int as n from information_schema.tables where table_schema = 'public'").rows[0].n === Object.keys(schema.tabellen()).length + 2, 'alle tabbladen plus eigenschappen en cache bestaan');
  var omzet = brug.sql("select omzet, uren_per_week from trajecten where id = 't1'").rows[0];
  eis(Number(omzet.omzet) === 48600 && Number(omzet.uren_per_week) === 30, 'getallen staan als numeric in Postgres');

  /* ---- koppelcode: lezen, schrijven, verwijderen ---- */
  var ov = await roep(SOPHIE, 'apiOverzicht');
  eis(ov.kpi && ov.kpi.scholen === 4 && ov.kpi.omzet === 157500, 'apiOverzicht met de koppelcode van het management (v6.4: met het net gewonnen demoproject)');
  var crm = await roep(FEMKE, 'apiCrm');
  eis(crm.ik.naam === 'Femke de Wit' && crm.ik.team === 'accountmanagement' && crm.scholen.length === 12, 'apiCrm als accountmanager');
  eis(/secret/.test(await faalt('bestaat-niet', 'apiCrm')), 'een verkeerde koppelcode geeft secret');
  var taak = await roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Postgres-taak', deadline: '2026-10-20', tijd: '09:30', prio: 'hoog' });
  var rij = brug.sql('select * from acties where id = $1', [taak.id]).rows[0];
  eis(rij && rij.tekst === 'Postgres-taak' && rij.tijd === '09:30' && rij.eigenaar === 'Femke de Wit' && rij.bijgewerkt_door === 'Femke de Wit' && rij.herhaling === null, 'een nieuwe taak staat na het verzoek in Postgres (lege velden als NULL)');
  var taak2 = await roep(FEMKE, 'apiTaakOpslaan', { id: taak.id, tekst: 'Postgres-taak 2', _oud: { tekst: 'Postgres-taak' } });
  eis(taak2.tekst === 'Postgres-taak 2' && brug.sql('select tekst from acties where id = $1', [taak.id]).rows[0].tekst === 'Postgres-taak 2', 'wijzigen met _oud werkt');
  eis(/gewijzigd/i.test(await faalt(FEMKE, 'apiTaakOpslaan', { id: taak.id, tekst: 'Oud', _oud: { tekst: 'Postgres-taak' } })), 'conflictcontrole blijft werken');
  var taken = await roep(FEMKE, 'apiTaken');
  eis(taken.taken.some(function (t) { return t.id === taak.id && t.tekst === 'Postgres-taak 2'; }), 'de taak komt terug in apiTaken');
  await roep(FEMKE, 'apiVerwijder', 'taak', taak.id);
  eis(brug.sql('select count(*)::int as n from acties where id = $1', [taak.id]).rows[0].n === 0, 'verwijderen haalt de rij uit Postgres');
  var klaar = await roep(SOPHIE, 'apiActieKlaar', 'tk1');
  eis(klaar.status === 'af' && brug.sql("select status from acties where id = 'tk1'").rows[0].status === 'af', 'afvinken wordt opgeslagen');
  var zet = await roep(SOPHIE, 'apiKeuzelijstOpslaan', 'taakCategorieen', [{ waarde: 'bellen' }, { waarde: 'mailen' }, { waarde: 'nieuw' }]);
  eis(zet && brug.sql("select waarde from instellingen where sleutel = 'taakCategorieen'").rows[0].waarde.indexOf('nieuw') > 0, 'Instellingen (sleutel/waarde) schrijft op de sleutel');

  /* ---- talentnetwerk, portaal, matching ---- */
  var tl = await roep(IRIS, 'apiTalenten');
  eis(tl.tellingen.totaal === 25 && tl.tellingen.actief === 20 && tl.benaderen.length >= 5, 'apiTalenten uit Postgres');
  var t1 = await roep(IRIS, 'apiTalent', 'tl1');
  eis(t1.talent.naam === 'Eva de Wit' && t1.uren.length === 12 && typeof t1.uren[0].uren === 'number' && t1.talent.vog.status === 'oranje', 'profiel met uren als getallen en de VOG-stand');
  var match = await roep(IRIS, 'apiMatch', 'v3');
  eis(match.kandidaten.length === 3 && match.kandidaten[0].score >= match.kandidaten[1].score && match.uitgesloten.length > 10, 'matching rekent op Postgres-gegevens');
  var p1 = await post({ fn: 'apiPortaalToon', args: [], portaal: 'demotokenali0000000000000000000000000001' });
  eis(p1.ok && p1.result.naam === 'Ali', 'portaal zonder koppelcode');
  var p2 = await post({ fn: 'apiPortaalBeschikbaarheid', args: [null, null, true], portaal: 'demotokenali0000000000000000000000000001' });
  eis(p2.ok && p2.result.beschikbaarheidBevestigd && brug.sql("select beschikbaarheid_bevestigd from talenten where id = 'tl2'").rows[0].beschikbaarheid_bevestigd === p2.result.beschikbaarheidBevestigd, 'bevestigen via het portaal schrijft in Postgres');
  eis(!(await post({ fn: 'apiTalenten', args: [], portaal: 'demotokenali0000000000000000000000000001' })).ok, 'het portaal kent alleen zijn twee functies');
  eis(brug.sql("select count(*)::int as n from cache where sleutel like 'athena-portaal-%'").rows[0].n >= 2, 'het portaalbudget staat in de cachetabel');
  var link = await roep(IRIS, 'apiTalentPortaalLink', 'tl3', true);
  eis(/^https:\/\/athena\.example\/api|api=/.test(link.link) && link.gemaild === true, 'portaallink met de API-URL van de server; de peilingmail gaat via Gmail (nagebootst)');
  var afspraak = await roep(FEMKE, 'apiAfspraakPlannen', { titel: 'Evaluatie Postgres', start: '2026-11-03T10:00', duurMin: 60, schoolId: 's1' });
  eis(afspraak.onderwerp === 'Evaluatie Postgres' && /nepevent/.test(brug.sql('select agenda_id from activiteiten where id = $1', [afspraak.id]).rows[0].agenda_id), 'een afspraak gaat naar de agenda (nagebootst) en de tijdlijn');

  /* ---- inloggen met Google (Supabase-token) ---- */
  var tS = await token('sophie@athena.example'), tF = await token('Femke@athena.example'), tX = await token('vreemde@elders.example'), tV = await token('femke@athena.example', 'verkeerd-geheim-van-minstens-32-tekens');
  var ikS = await post({ fn: 'apiCrm', args: [], token: tS });
  eis(ikS.ok && ikS.result.ik.naam === 'Sophie de Graaf' && ikS.result.ik.beheer === true && ikS.result.ik.gekoppeld === true, 'de eigenaar logt in met Google en is beheerder');
  var ikF = await post({ fn: 'apiCrm', args: [], token: tF });
  eis(ikF.ok && ikF.result.ik.naam === 'Femke de Wit' && ikF.result.ik.team === 'accountmanagement' && ikF.result.ik.beheer === false, 'een gebruiker logt in op e-mailadres uit Gebruikers (hoofdletters maken niet uit)');
  eis((await post({ fn: 'apiCrm', args: [], token: tX })).fout === 'secret' && (await post({ fn: 'apiCrm', args: [], token: tV })).fout === 'secret' && (await post({ fn: 'apiCrm', args: [], token: 'x' })).fout === 'secret', 'onbekend adres, verkeerd geheim of onzin geeft secret');
  var taakG = await post({ fn: 'apiTaakOpslaan', args: [{ tekst: 'Via Google', deadline: '2026-10-21' }], token: tF });
  eis(taakG.ok && taakG.result.eigenaar === 'Femke de Wit' && brug.sql('select eigenaar from acties where id = $1', [taakG.result.id]).rows[0].eigenaar === 'Femke de Wit', 'schrijven met een Google-token loopt onder de juiste gebruiker');
  var inactief = brug.sql("update gebruikers set actief = 'nee' where id = 'g-femke'"); var ikF2 = await post({ fn: 'apiCrm', args: [], token: tF });
  eis(inactief.rowCount === 1 && ikF2.fout === 'secret', 'een inactieve gebruiker kan niet inloggen'); brug.sql("update gebruikers set actief = 'ja' where id = 'g-femke'");

  /* ---- export voor de migratie, status, cron ---- */
  var ex = await roep(SOPHIE, 'apiExportAlles', 'Acties', 0, 5), ex2 = await roep(SOPHIE, 'apiExportAlles', 'Acties', ex.volgende, 500), exE = await roep(SOPHIE, 'apiExportAlles', 'eigenschappen');
  eis(ex.rijen.length === 5 && ex.volgende === 5 && ex2.volgende === null && ex.rijen.length + ex2.rijen.length === ex.totaal && !ex.rijen[0]._rij && exE.rijen.SECRET === 'demo-sophie' && !('ANTHROPIC_API_KEY' in exE.rijen) && !('DB' in exE.rijen) && !('GOOGLE_NEP' in exE.rijen), 'apiExportAlles pagineert en laat sleutels en de serverinstellingen (ATHENA_DB, ATHENA_GOOGLE_NEP) weg');  // v6.2
  eis(/management/i.test(await faalt(FEMKE, 'apiExportAlles', 'Acties')), 'alleen het management exporteert');
  var status = await roep(SOPHIE, 'apiStatus');
  eis(status.versie === '6.4' && status.herinneringTrigger === true && status.talentTrigger === true && status.gebruiker.naam === 'Sophie de Graaf', 'apiStatus ziet de triggers als cron');
  var g1 = await handler.verwerk({ methode: 'GET', pad: '/api', headers: {} }), g2 = await handler.verwerk({ methode: 'GET', pad: '/api/config', headers: {} });
  eis(g1.status === 200 && JSON.parse(g1.body).versie === '6.4' && g2.status === 404, 'GET /api geeft de versie; /api/config bestaat niet zonder Supabase-instellingen');
  var g3 = await handler.verwerk({ methode: 'GET', pad: '/api/config', headers: {}, env: Object.assign({}, process.env, { SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_ANON_KEY: 'anon' }) });
  eis(g3.status === 200 && JSON.parse(g3.body).inloggen === 'google' && JSON.parse(g3.body).supabaseUrl === 'https://abc.supabase.co' && JSON.parse(g3.body).maxBestand === 3 * 1024 * 1024 && !g3.headers['Access-Control-Allow-Origin'], '/api/config geeft de inlogconfiguratie en de bestandsgrens; geen CORS-header zonder ATHENA_CORS_ORIGIN');  // v6.2
  var g4 = await handler.verwerk({ methode: 'GET', pad: '/api', headers: {}, env: Object.assign({}, process.env, { ATHENA_CORS_ORIGIN: 'https://crm.voorbeeld.nl' }) });
  eis(g4.headers['Access-Control-Allow-Origin'] === 'https://crm.voorbeeld.nl' && g4.headers.Vary === 'Origin', 'met ATHENA_CORS_ORIGIN precies die ene origin');
  /* ---- v6.2: het antwoordblad van het Google Form met de tijdstempel als Date (zoals in Apps Script) ---- */
  process.env.FORM_SHEET_ID = 'nep-form';
  var F = code.start({}), uitF = F.api.aanmeldingenVerwerken(); F.diensten.flush(); delete process.env.FORM_SHEET_ID;
  var noor = brug.sql("select toestemming_datum, bewaren_tot, laatste_contact, status, bron from talenten where email = 'noor.formulier@voorbeeld.nl'").rows[0];
  eis(uitF && uitF.nieuw >= 1 && noor && noor.toestemming_datum === '2026-09-01' && noor.laatste_contact === '2026-09-01' && noor.status === 'aangemeld' && noor.bron === 'website', 'een aanmelding uit het Google Form krijgt de datum van de tijdstempel (serieel getal → Date), niet de dag van verwerking');
  eis(require('../google.js').serieelNaarDatum(46266.5).getHours() === 12 && A.formatDate(require('../google.js').serieelNaarDatum(46266.5), 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm') === '2026-09-01 12:00', 'serieel 46266,5 is 1 september 2026 12:00 wandkloktijd');
  var c1 = await handler.verwerk({ methode: 'GET', pad: '/api/cron/herinneringTrigger', headers: {} }), c2 = await handler.verwerk({ methode: 'GET', pad: '/api/cron/herinneringTrigger', headers: { authorization: 'Bearer cron-geheim' } }), c3 = await handler.verwerk({ methode: 'GET', pad: '/api/cron/bestaatNiet', headers: { authorization: 'Bearer cron-geheim' } });
  eis(c1.status === 401 && c2.status === 200 && JSON.parse(c2.body).taak === 'herinneringTrigger' && c3.status === 400, 'cron: alleen met het geheim en alleen bekende triggers');
  var c4 = await handler.verwerk({ methode: 'GET', pad: '/api/cron/talentDagelijksTrigger', headers: { authorization: 'Bearer cron-geheim' } }), r4 = JSON.parse(c4.body);
  eis(c4.status === 200 && r4.ok && r4.resultaat && 'vog' in r4.resultaat && 'aanmeldingen' in r4.resultaat, 'de dagelijkse talentrun draait als cron');
  var c5 = await handler.verwerk({ methode: 'GET', pad: '/api/cron/nachtelijkeReviewTrigger', headers: { authorization: 'Bearer cron-geheim' } });
  eis(c5.status === 200 && JSON.parse(c5.body).ok && brug.sql('select count(*)::int as n from reviews').rows[0].n >= 1, 'de nachtelijke review draait als cron en schrijft een review (zonder ANTHROPIC_API_KEY geen samenvatting)');
  eis(brug.sql("select count(*)::int as n from pg_locks where locktype = 'advisory'").rows[0].n === 0, 'na elk verzoek is de lock vrij');
  var S = code.start({}), lock = S.diensten.LockService.getScriptLock();
  eis(lock.tryLock(100) === true && lock.hasLock() && brug.sql("select count(*)::int as n from pg_locks where locktype = 'advisory'").rows[0].n === 1, 'metLock neemt een advisory lock in Postgres');
  lock.releaseLock(); eis(lock.hasLock() && brug.sql("select count(*)::int as n from pg_locks where locktype = 'advisory'").rows[0].n === 1 && lock.tryLock(100) === true && brug.sql("select count(*)::int as n from pg_locks where locktype = 'advisory'").rows[0].n === 1, 'releaseLock wacht tot flush; een tweede metLock in hetzelfde verzoek stapelt niet');  // v6.2
  S.diensten.flush(); eis(brug.sql("select count(*)::int as n from pg_locks where locktype = 'advisory'").rows[0].n === 0, 'flush geeft de lock vrij');
  /* ---- v6.2: vergeet() + lees() leest opnieuw uit Postgres (de conflictcontrole moet de schrijfactie van een ander verzoek zien) ---- */
  var S2 = code.start({}), voor = S2.api.lees('Acties').filter(function (a) { return a.id === 'tk2'; })[0].tekst;
  brug.sql("update acties set tekst = 'Door een ander verzoek gewijzigd' where id = 'tk2'");
  var nogSteeds = S2.api.lees('Acties').filter(function (a) { return a.id === 'tk2'; })[0].tekst; S2.api.vergeet('Acties');
  var vers = S2.api.lees('Acties').filter(function (a) { return a.id === 'tk2'; })[0].tekst;
  eis(voor !== 'Door een ander verzoek gewijzigd' && nogSteeds === voor && vers === 'Door een ander verzoek gewijzigd', 'na vergeet() ziet lees() de wijziging van een ander verzoek (tweede volledige lezing laadt opnieuw)');
  brug.sql("update acties set tekst = $1 where id = 'tk2'", [voor]); S2.diensten.flush();
  var conflictNaAnder = await faalt(SOPHIE, 'apiTaakOpslaan', { id: 'tk2', tekst: 'Mijn versie', _oud: { tekst: 'Een oude tekst die niet klopt' } });
  eis(/gewijzigd/i.test(conflictNaAnder), 'de conflictcontrole (_oud) werkt op Postgres');

  /* ---- de Vercel-laag ---- */
  var EventEmitter = require('events');
  function nepReq(methode, body) { var r = new EventEmitter(); r.method = methode; r.headers = {}; r.query = {}; process.nextTick(function () { if (body) r.emit('data', Buffer.from(body)); r.emit('end'); }); return r; }
  function nepRes() { var res = { headers: {}, statusCode: 0, setHeader: function (k, v) { res.headers[k] = v; }, end: function (b) { res.body = b; res.klaar(); } }; res.gereed = new Promise(function (ok) { res.klaar = ok; }); return res; }
  var fn = vercel.functie(handler.verwerk, '/api'), res1 = nepRes(); await fn(nepReq('POST', JSON.stringify({ fn: 'apiCrm', args: [], secret: SOPHIE })), res1); await res1.gereed;
  eis(res1.statusCode === 200 && JSON.parse(res1.body).ok && /json/.test(res1.headers['Content-Type']), 'api/index.js: body uit de stream, JSON terug');
  var res2 = nepRes(); var req2 = nepReq('POST', ''); req2.body = { fn: 'apiCrm', args: [], secret: SOPHIE }; await fn(req2, res2); await res2.gereed;
  eis(res2.statusCode === 200 && JSON.parse(res2.body).ok, 'api/index.js: een al geparsede body werkt ook');

  brug.stop();
  console.log(fouten ? fouten + ' FOUT(EN)' : 'ALLES GOED');
  process.exit(fouten ? 1 : 0);
})().catch(function (e) { console.error('FOUT (onverwacht): ' + (e && e.stack || e)); brug.stop(); process.exit(1); });
