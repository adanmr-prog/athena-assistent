/* Athena Assistent — v6.2 (go-live-review): golden master. Dezelfde lees-api's tegen twee backends die dezelfde Code.gs
 * draaien, en de genormaliseerde JSON (sleutels gesorteerd) pad voor pad vergelijken. Elk verschil is een adapter- of
 * migratiefout, tenzij het in VERWACHT staat met een reden.
 *   node server/vergelijk.js                                   sandbox: de demo-backend (vm, zoals de demo in de browser) tegen de
 *                                                              server-adapter op pglite, gevuld met dezelfde seed via server/migratie.js
 *   node server/vergelijk.js --bron <exec-url> --code <koppelcode> --server https://<domein> [--codes am=<code>,talent=<code>,consultant=<code>]
 *                                                              productie: Apps Script (de Sheet) tegen de server (Postgres), met dezelfde koppelcodes
 *   --alleen apiA,apiB   alleen deze api's      --toon apiX   alle verschillen van één api
 *   --profiel            (sandbox) queries, rijen en bytes per api, met de latentie bij 2 ms (fra1) en 90 ms (iad1) per query
 *   --dekking            (sandbox) welke methoden van de adapter deze run raakte en welke methodenamen uit Code.gs niet
 * Exitcode 1 bij onverklaarde verschillen of een api die aan één kant faalt. Schrijft niets in de bron; alle api's zijn lees-api's. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var R = path.join(__dirname, '..');

var argv = process.argv.slice(2), opt = {};
for (var i = 0; i < argv.length; i++) { if (argv[i].indexOf('--') === 0) { var k = argv[i].slice(2); if (argv[i + 1] && argv[i + 1].indexOf('--') !== 0) opt[k] = argv[++i]; else opt[k] = true; } }
var PRODUCTIE = !!(opt.bron && opt.code && opt.server);
var ALLEEN = opt.alleen ? String(opt.alleen).split(',').map(function (s) { return s.trim(); }) : null;

// Verschillen die geen fout zijn, per api: regex op het pad, met de reden. Alleen in de sandbox: de demo-backend en de server
// bootsen Google elk anders na (de demo heeft voorbeeldmails en -afspraken, de server geeft lege lijsten). In productie zijn
// beide kanten echt Google en horen ook die paden gelijk te zijn.
var VERWACHT_SANDBOX = {
  '*': [[/(^|\.)gekoppeld$/, 'demo: Session.getEffectiveUser() is de demogebruiker zelf (iedereen ziet voorbeeldmails); op Apps Script en op de server is het de eigenaar (mijnMailbox in Code.gs)']],
  apiHome: [[/^(mails|agenda)\b/, 'Gmail/Agenda: andere nabootsing in demo en server']],
  apiHomeMails: [[/./, 'Gmail: andere nabootsing']],
  apiAgenda: [[/./, 'Agenda: andere nabootsing']],
  apiOverzicht: [[/^(mails|agenda)\b/, 'Gmail/Agenda: andere nabootsing']],
  apiKennisbank: [[/^mapUrl$/, 'Drive: andere nabootsing']],
  apiStatus: [[/^(sheetUrl|mapUrl)$/, 'de Sheet-URL is in Postgres de projectpagina van Supabase (leeg zonder SUPABASE_URL)'], [/Trigger$/, 'triggers: in de demo geen, op de server de cron uit vercel.json (ScriptApp.getProjectTriggers)'], [/^claudeIngesteld$/, 'geen Claude-sleutel in de sandbox']],
  apiExportAlles: [[/^rijen\.EIGENAAR_EMAIL$|^totaal$/, 'EIGENAAR_EMAIL hoort bij de server (gebruikerVanEmail); de demo kent die eigenschap niet']]
};
var VERWACHT_PRODUCTIE = {
  apiStatus: [[/^(sheetUrl|mapUrl|laatste|triggers|versie)/, 'status van de omgeving zelf']]
};
// Niet vergeleken: api's die Claude aanroepen (niet deterministisch) en api's die schrijven. apiTalentExport schrijft een
// auditregel (inzage) en draait daarom als laatste, zodat hij de tijdlijnen van de andere api's niet beïnvloedt.
var NIET_VERGELEKEN = ['apiSchoolSamenvatting', 'apiVraag', 'apiBrein', 'apiMaakContent', 'apiReviewNu', 'apiIndexeer', 'apiCrmSync', 'apiTalentRunNu'];

/* ----- normaliseren en vergelijken ----- */
function norm(x) {
  if (x === undefined) return null;
  if (Array.isArray(x)) return x.map(norm);
  if (x && typeof x === 'object') { var o = {}; Object.keys(x).sort().forEach(function (k) { o[k] = norm(x[k]); }); return o; }
  return x;
}
function kort(v) { var s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 60 ? s.slice(0, 57) + '…' : s; }
function diff(a, b, pad, uit) {
  if (uit.length > 400) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) uit.push({ pad: pad || '(wortel)', a: 'lengte ' + a.length, b: 'lengte ' + b.length });
    for (var i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], pad + '[' + i + ']', uit);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    var sleutels = {}; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { sleutels[k] = true; });
    Object.keys(sleutels).sort().forEach(function (k) { diff(a[k], b[k], pad ? pad + '.' + k : k, uit); });
    return;
  }
  if (a !== b) uit.push({ pad: pad || '(wortel)', a: kort(a), b: kort(b), type: (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) ? 'type ' + (Array.isArray(a) ? 'array' : typeof a) + ' ≠ ' + (Array.isArray(b) ? 'array' : typeof b) : '' });
}

/* ----- de twee kanten ----- */
var kantA, kantB, profiel = null, dekking = null, ctxDemo = null;
function ymd(d) { return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }
var VANDAAG = new Date(), VAN = ymd(new Date(VANDAAG.getTime() - 90 * 86400000)), TOT = ymd(new Date(VANDAAG.getTime() + 30 * 86400000));

async function maakKanten() {
  if (PRODUCTIE) {
    var exec = String(opt.bron).replace(/\?.*$/, ''), server = String(opt.server).replace(/\/+$/, '').replace(/\/api$/, '');
    var viaHttp = function (url) {
      return async function (fn, args, code) {
        var begin = Date.now();
        try {
          var r = await fetch(url, { method: 'POST', body: JSON.stringify({ fn: fn, args: args, secret: code }), redirect: 'follow' });
          var tekst = await r.text(), d; try { d = JSON.parse(tekst); } catch (e) { d = { ok: false, fout: 'geen JSON (HTTP ' + r.status + '): ' + tekst.slice(0, 80) }; }
          return { d: d, ms: Date.now() - begin };
        } catch (e2) { return { d: { ok: false, fout: 'netwerk: ' + e2.message }, ms: Date.now() - begin }; }
      };
    };
    kantA = { naam: 'Apps Script', roep: viaHttp(exec + '?app=1') };
    kantB = { naam: 'server', roep: viaHttp(server + '/api') };
    return;
  }
  // sandbox: demo-backend in een vm als orakel, de adapter op pglite met dezelfde seed
  var map = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-vergelijk-'));
  process.env.ATHENA_DB = 'pglite:' + map; process.env.ATHENA_GOOGLE_NEP = '1'; process.env.EIGENAAR_EMAIL = 'sophie@athena.example';
  process.env.GOOGLE_CLIENT_ID = 'nep'; process.env.GOOGLE_CLIENT_SECRET = 'nep'; process.env.GOOGLE_REFRESH_TOKEN = 'nep'; process.env.APP_API_URL = 'https://athena.example/api';
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY; delete process.env.SUPABASE_JWT_SECRET;
  var migratie = require('./migratie.js'), brug = require('./sync.js'), handler = require('./handler.js'), A = require('./apps-script.js');
  ctxDemo = migratie.demoContext();
  migratie.importeer(migratie.exportUitDemo(ctxDemo));
  if (opt.profiel) {
    profiel = { sql: 0, rijen: 0, bytes: 0, fetch: 0 };
    var sqlOud = brug.sql, fetchOud = brug.fetch, fetchVeelOud = brug.fetchVeel;
    brug.sql = function (t, p) { var r = sqlOud(t, p); profiel.sql++; profiel.rijen += (r.rows || []).length; profiel.bytes += JSON.stringify(r.rows || []).length; return r; };
    brug.fetch = function () { profiel.fetch++; return fetchOud.apply(null, arguments); };
    brug.fetchVeel = function (l) { profiel.fetch += (l || []).length; return fetchVeelOud(l); };
  }
  if (opt.dekking) {
    dekking = {};
    var maakOud = A.maakDiensten;
    A.maakDiensten = function (o) { var D = maakOud(o); Object.keys(D).forEach(function (n) { if (D[n] && typeof D[n] === 'object' && /^[A-Z]/.test(n)) D[n] = volg(D[n], n, 0); }); return D; };
  }
  kantA = { naam: 'demo', roep: async function (fn, args, code) { var begin = Date.now(); var d = JSON.parse(ctxDemo.demoRun(fn, JSON.stringify(args), code)); return { d: d, ms: Date.now() - begin }; } };
  kantB = { naam: 'adapter', roep: async function (fn, args, code) {
    var begin = Date.now(), r = await handler.verwerk({ methode: 'POST', pad: '/api', headers: {}, body: JSON.stringify({ fn: fn, args: args, secret: code }) });
    var d; try { d = JSON.parse(r.body); } catch (e) { d = { ok: false, fout: 'geen JSON (HTTP ' + r.status + ')' }; }
    return { d: d, ms: Date.now() - begin };
  } };
}
// Proxy die noteert welke methode op welk adapterobject wordt aangeroepen (alleen voor --dekking); Date en primitieven blijven onaangeraakt
function volg(obj, naam, diepte) {
  if (!obj || typeof obj !== 'object' || obj instanceof Date || Buffer.isBuffer(obj) || diepte > 4) return obj;
  if (Array.isArray(obj)) return obj.map(function (x) { return (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).some(function (k) { return typeof x[k] === 'function'; })) ? volg(x, naam + '[]', diepte + 1) : x; });
  if (!Object.keys(obj).some(function (k) { return typeof obj[k] === 'function'; })) return obj;
  return new Proxy(obj, { get: function (t, k) {
    var v = t[k];
    if (typeof v !== 'function') return (v && typeof v === 'object' && typeof k === 'string' && /^[A-Z]/.test(k)) ? volg(v, naam + '.' + k, diepte + 1) : v;
    return function () { var sleutel = naam + '.' + String(k) + '()'; dekking[sleutel] = (dekking[sleutel] || 0) + 1; var r = v.apply(t, arguments); return volg(r, naam + '.' + String(k) + '()', diepte + 1); };
  } });
}

/* ----- het plan: lees-api's per rol, met ids uit de gegevens zelf ----- */
function idsUit(res, sleutel, n) { var l = res && res[sleutel]; return Array.isArray(l) ? l.filter(function (x) { return x && x.id; }).slice(0, n || 2).map(function (x) { return x.id; }) : []; }
function plan(rol, basis, tabellen) {
  var crm = basis.apiCrm || {}, p = [];
  var scholen = idsUit(crm, 'scholen', 2), personen = idsUit(crm, 'personen', 2), projecten = idsUit(crm, 'projecten', 2), kansen = idsUit(basis.apiPipeline, 'kansen', 2);
  var taken = idsUit(basis.apiTaken, 'taken', 2), talenten = idsUit(basis.apiTalenten, 'talenten', 3), vacatures = idsUit(basis.apiBezetting, 'vacatures', 2);
  ['apiOverzicht', 'apiHome', 'apiCrm', 'apiTaken', 'apiTrajecten', 'apiPipeline', 'apiBezetting', 'apiFacturatie', 'apiFinancien', 'apiTalenten', 'apiMeldingen', 'apiDoelen', 'apiInstellingen', 'apiVelden', 'apiHuisstijl', 'apiKennisbank', 'apiReview', 'apiStatus', 'apiGebruikers', 'apiHomeMails'].forEach(function (fn) { p.push([fn, []]); });
  p.push(['apiAgenda', [VAN, TOT]], ['apiRapport', ['maand', '', 0]], ['apiRapport', ['kwartaal', '', -1]], ['apiTeamRapport', ['maand', 'alle', '', 0]], ['apiTeamRapport', ['kwartaal', rol.team, '', 0]], ['apiTalentRapport', ['maand', 0]], ['apiActiviteiten', ['', VAN, TOT, '']]);
  scholen.forEach(function (id) { p.push(['apiSchool', [id]], ['apiArchiefTijdlijn', ['school', id]]); });
  personen.forEach(function (id) { p.push(['apiPersoon', [id]]); });
  kansen.forEach(function (id) { p.push(['apiKans', [id]]); });
  projecten.forEach(function (id) { p.push(['apiTraject', [id]], ['apiProject', [id]]); });
  taken.forEach(function (id) { p.push(['apiTaak', [id]]); });
  talenten.forEach(function (id) { p.push(['apiTalent', [id]]); });
  vacatures.forEach(function (id) { p.push(['apiMatch', [id]]); });
  if (rol.team === 'management') { tabellen.forEach(function (t) { p.push(['apiExportAlles', [t, 0, t === 'Documenten' ? 50 : 500]]); }); p.push(['apiExportAlles', ['eigenschappen']]); }  // Documenten met tekst: binnen de 4,5 MB per antwoord van Vercel
  if (rol.laatste && rol.team === 'management' && talenten[0]) p.push(['apiTalentExport', [talenten[0]]]);  // schrijft een auditregel: pas helemaal aan het eind
  return p.filter(function (x) { return (!ALLEEN || ALLEEN.indexOf(x[0]) >= 0) && NIET_VERGELEKEN.indexOf(x[0]) < 0; });
}
function label(fn, args) { return fn + (args.length ? '(' + args.map(function (a) { return typeof a === 'string' ? a : JSON.stringify(a); }).join(', ').slice(0, 40) + ')' : ''); }

async function main() {
  await maakKanten();
  var schema = require('./schema.js'), tabellen = Object.keys(schema.tabellen());
  var rollen = PRODUCTIE
    ? [{ naam: 'management', team: 'management', code: String(opt.code) }].concat(String(opt.codes || '').split(',').filter(Boolean).map(function (s) { var kv = s.split('='); return { naam: kv[0], team: { am: 'accountmanagement', talent: 'talent', consultant: 'consultancy' }[kv[0]] || kv[0], code: kv[1] }; }))
    : [{ naam: 'management (Sophie)', team: 'management', code: 'demo-sophie' }, { naam: 'accountmanager (Femke)', team: 'accountmanagement', code: 'demo-femke' }, { naam: 'talent (Iris)', team: 'talent', code: 'demo-iris' }, { naam: 'consultant (Lars)', team: 'consultancy', code: 'demo-lars' }];
  if (!PRODUCTIE) rollen.push({ naam: 'management (Sophie), afsluitend', team: 'management', code: 'demo-sophie', laatste: true, alleenLaatste: true });
  var VERWACHT = PRODUCTIE ? VERWACHT_PRODUCTIE : VERWACHT_SANDBOX, totaal = { gelijk: 0, verklaard: 0, fout: 0, mislukt: 0 }, problemen = [], profielRijen = [];
  console.log('Golden master: ' + kantA.naam + ' tegenover ' + kantB.naam + (PRODUCTIE ? '' : ' (dezelfde demo-seed, Google nagebootst)') + ' · ' + new Date().toISOString().slice(0, 16) + 'Z');
  console.log('Niet vergeleken (Claude of schrijvend): ' + NIET_VERGELEKEN.join(', ') + '\n');
  for (var ri = 0; ri < rollen.length; ri++) {
    var rol = rollen[ri], basis = {};
    for (var bi = 0, bl = ['apiCrm', 'apiPipeline', 'apiTaken', 'apiTalenten', 'apiBezetting']; bi < bl.length; bi++) { var b0 = await kantA.roep(bl[bi], [], rol.code); basis[bl[bi]] = b0.d && b0.d.ok ? b0.d.result : null; }
    var lijst = plan(rol, basis, tabellen);
    if (rol.alleenLaatste) lijst = lijst.filter(function (x) { return x[0] === 'apiTalentExport'; });
    console.log('## ' + rol.naam + ' (' + lijst.length + ' aanroepen)\n');
    console.log('| api | uitkomst | ' + kantA.naam + ' ms | ' + kantB.naam + ' ms |' + (profiel ? ' queries | rijen gelezen | kB gelezen | antwoord kB | fra1 (2 ms/q) | iad1 (90 ms/q) |' : ''));
    console.log('|---|---|---|---|' + (profiel ? '---|---|---|---|---|---|' : ''));
    for (var li = 0; li < lijst.length; li++) {
      var fn = lijst[li][0], args = lijst[li][1], naam = label(fn, args);
      var a = await kantA.roep(fn, args, rol.code);
      if (profiel) profiel = { sql: 0, rijen: 0, bytes: 0, fetch: 0 };
      var b = await kantB.roep(fn, args, rol.code), pr = profiel ? Object.assign({}, profiel) : null;
      var uitkomst, details = [];
      if (!a.d.ok && !b.d.ok) { uitkomst = a.d.fout === b.d.fout ? 'gelijk (beide fout: ' + String(a.d.fout).slice(0, 50) + ')' : 'VERSCHIL in foutmelding'; if (/VERSCHIL/.test(uitkomst)) { details.push({ pad: 'fout', a: a.d.fout, b: b.d.fout }); totaal.fout++; } else totaal.gelijk++; }
      else if (!a.d.ok || !b.d.ok) { uitkomst = 'MISLUKT aan één kant: ' + (a.d.ok ? kantB.naam + ': ' + String(b.d.fout).slice(0, 80) : kantA.naam + ': ' + String(a.d.fout).slice(0, 80)); totaal.mislukt++; details.push({ pad: '(aanroep)', a: a.d.ok ? 'ok' : a.d.fout, b: b.d.ok ? 'ok' : b.d.fout }); }
      else {
        var verschillen = []; diff(norm(a.d.result), norm(b.d.result), '', verschillen);
        var regels = (VERWACHT[fn] || []).concat(VERWACHT['*'] || []), onverklaard = verschillen.filter(function (v) { return !regels.some(function (r) { return r[0].test(v.pad); }); });
        if (!verschillen.length) { uitkomst = 'gelijk'; totaal.gelijk++; }
        else if (!onverklaard.length) { uitkomst = 'verklaard (' + verschillen.length + '): ' + regels.filter(function (r) { return verschillen.some(function (v) { return r[0].test(v.pad); }); }).map(function (r) { return r[1]; }).join('; '); totaal.verklaard++; }
        else { uitkomst = 'VERSCHIL: ' + onverklaard.length + ' pad(en)'; totaal.fout++; details = onverklaard; }
      }
      if (details.length) problemen.push({ rol: rol.naam, api: naam, details: details });
      var antwoordKb = b.d.ok ? Math.round(JSON.stringify(b.d.result).length / 1024) : 0;
      console.log('| ' + naam + ' | ' + uitkomst + ' | ' + a.ms + ' | ' + b.ms + ' |' + (pr ? ' ' + pr.sql + ' | ' + pr.rijen + ' | ' + Math.round(pr.bytes / 1024) + ' | ' + antwoordKb + ' | ' + (pr.sql * 2) + ' | ' + (pr.sql * 90) + ' |' : ''));
      if (pr) profielRijen.push({ rol: rol.naam, api: naam, sql: pr.sql, rijen: pr.rijen, kb: Math.round(pr.bytes / 1024), antwoordKb: antwoordKb, fetch: pr.fetch, ms: b.ms });
      if (opt.toon === fn && details.length) details.forEach(function (d) { console.log('    ' + d.pad + ': ' + kantA.naam + ' = ' + d.a + '  |  ' + kantB.naam + ' = ' + d.b + (d.type ? '  (' + d.type + ')' : '')); });
    }
    console.log('');
  }
  if (problemen.length) {
    console.log('## Onverklaarde verschillen\n');
    problemen.forEach(function (p) { console.log('- **' + p.rol + ' · ' + p.api + '**'); p.details.slice(0, 12).forEach(function (d) { console.log('  - `' + d.pad + '`: ' + kantA.naam + ' = `' + d.a + '`, ' + kantB.naam + ' = `' + d.b + '`' + (d.type ? ' (' + d.type + ')' : '')); }); if (p.details.length > 12) console.log('  - … nog ' + (p.details.length - 12) + ' (zie --toon ' + p.api.replace(/\(.*$/, '') + ')'); });
    console.log('');
  }
  if (profielRijen.length) {
    var top = profielRijen.slice().sort(function (x, y) { return y.sql - x.sql; }).slice(0, 5);
    console.log('## Duurste api\'s (meeste queries per verzoek)\n');
    top.forEach(function (r) { console.log('- ' + r.api + ' (' + r.rol + '): ' + r.sql + ' queries, ' + r.rijen + ' rijen gelezen, ' + r.kb + ' kB gelezen, antwoord ' + r.antwoordKb + ' kB, ' + r.fetch + ' fetch; model fra1 ≈ ' + (r.sql * 2) + ' ms, iad1 ≈ ' + (r.sql * 90) + ' ms; pglite ' + r.ms + ' ms'); });
    var grootst = profielRijen.slice().sort(function (x, y) { return y.antwoordKb - x.antwoordKb; }).slice(0, 3);
    console.log('\nGrootste antwoorden (Vercel: 4,5 MB per antwoord): ' + grootst.map(function (r) { return r.api + ' ' + r.antwoordKb + ' kB'; }).join(', ') + '\n');
  }
  if (dekking) {
    // ook de triggers (cron) en een paar schrijfpaden op de adapter, zodat de dekking verder reikt dan de lees-api's
    process.env.CRON_SECRET = process.env.CRON_SECRET || 'vergelijk-cron';
    var handler2 = require('./handler.js'), schema2 = require('./schema.js'), triggers = schema2.triggers();
    for (var ti = 0; ti < triggers.length; ti++) { try { await handler2.verwerk({ methode: 'GET', pad: '/api/cron/' + triggers[ti], headers: { authorization: 'Bearer ' + process.env.CRON_SECRET }, body: '' }); } catch (e) { console.log('(cron ' + triggers[ti] + ': ' + e.message + ')'); } }
    for (var si = 0, schrijf = [['apiTaakOpslaan', [{ tekst: 'Dekkingstaak', deadline: TOT, tijd: '09:00' }]], ['apiAfspraakPlannen', [{ titel: 'Dekking', start: TOT + 'T10:00', duurMin: 30 }]], ['apiTalentPortaalLink', ['tl3', true]], ['apiActiviteitToevoegen', [{ type: 'notitie', tekst: 'Dekking', schoolId: 's1' }]]]; si < schrijf.length; si++) { try { await kantB.roep(schrijf[si][0], schrijf[si][1], 'demo-sophie'); } catch (e2) {} }
    var geraakt = Object.keys(dekking).sort();
    console.log('## Dekking: ' + geraakt.length + ' adaptermethoden geraakt in deze run\n');
    console.log(geraakt.map(function (k) { return '- ' + k + ' ×' + dekking[k]; }).join('\n') + '\n');
    try {
      var analyse = require('./dekking.js').analyse();
      var namenGeraakt = {}; geraakt.forEach(function (k) { var m = /\.([A-Za-z_$][\w$]*)\(\)$/.exec(k); if (m) namenGeraakt[m[1]] = true; });
      var nietGeraakt = Object.keys(analyse.methodeNamen).filter(function (m) { return analyse.adapterStatisch[m] && !analyse.ingebouwd[m] && !analyse.eigenDefinities[m] && !namenGeraakt[m]; }).sort();
      console.log('Methodenamen van de adapter die Code.gs gebruikt maar die deze run niet raakte (' + nietGeraakt.length + '): ' + nietGeraakt.map(function (m) { return m + ' (regel ' + analyse.methodeNamen[m][0] + ')'; }).join(', ') + '\n');
    } catch (e) { console.log('(dekkingsanalyse niet beschikbaar: ' + e.message + ')\n'); }
  }
  console.log('Samenvatting: ' + totaal.gelijk + ' gelijk, ' + totaal.verklaard + ' verklaard, ' + totaal.fout + ' met onverklaarde verschillen, ' + totaal.mislukt + ' mislukt aan één kant.');
  try { require('./sync.js').stop(); } catch (e) {}
  process.exit(totaal.fout || totaal.mislukt ? 1 : 0);
}
main().catch(function (e) { console.error('Vergelijking mislukt: ' + ((e && e.stack) || e)); process.exit(2); });
