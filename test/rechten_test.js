// v7.2: rechtentest — de rechtentabel RECHTEN tegen de echte api's, per team en rol, met rijen van jezelf, een teamgenoot,
// iemand uit een ander team en (voor talent) projecten in opstart of met een open vacature. Plus horizontale aanvallen en het portaal.
// Gebruik: node test/rechten_test.js  → "ALLES GOED" (exitcode 0) of "FOUTEN: n" (exitcode 1). Schrijft test/shots/robuust/rechten.json.
//
// De verwachting is niet handgeschreven: zij wordt afgeleid uit ctx.RECHTEN (onderdeel × team × [zien, wijzigen] → alles/eigen/team/opstart/geen)
// met een eigen, onafhankelijke uitwerking van wat die niveaus betekenen (spiegel van niveau() en mag() in Code.gs, inclusief de
// teamlead-regel 'eigen' → 'team' en isBeheerder voor management). Waar een api méér regels kent dan RECHTEN (bijv. de AM ziet de kans
// achter zijn project) staat dat als expliciete uitzondering in UITZONDERINGEN en in het json onder "onbepaald".
//
// Draait zoals test/node_rooktest.js: demo-backend.js + Code.gs in één vm-context met alleen console van buiten. Elke geslaagde
// schrijfactie wordt teruggedraaid met een snapshot (demoExport/demoStart), zodat iedere gebruiker dezelfde Sheet ziet; na elke
// geweigerde schrijfactie wordt gecontroleerd dat de Sheet onaangeroerd is.
var vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..'), T0 = Date.now();
var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);  // alleen console van buiten: JSON, Date en Array uit de context zelf (instanceof)
vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8'), ctx, { filename: 'demo.js' });
ctx.demoStart('');

var fouten = 0, schendingen = 0, MATRIX = [], AANVALLEN = [], ONBEPAALD = [];
function log(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s.slice(0, n); }

/* ---- aanroepen zoals de app en het portaal dat doen ---- */
function vers() { ctx._LEES = {}; ctx._BLAD = {}; ctx._TEAMNAMEN = null; ctx._OPENVAC = null; ctx._TALENTINDEX = null; ctx._VIAPROJECT = null; ctx._TRAJECTNAMEN = null; ctx._TAAKINDEX = null; ctx.GEBRUIKER = null; }
function lees(tab) { vers(); return ctx.lees(tab); }
function perId(lijst) { var m = {}; lijst.forEach(function (x) { m[String(x.id)] = x; }); return m; }
function roepRuw(code, fn, args) { return JSON.parse(ctx.demoRun(fn, JSON.stringify(args || []), code)); }
function portaalRuw(token, fn, args) { return JSON.parse(ctx.demoPortaal(fn, JSON.stringify(args || []), token)); }
function vandaag() { return ctx.datumStr(ctx.plusDagen(0)); }

/* ---- meldingen: toegang, netjes, intern ---- */
var TOEGANG = /Daar heb je geen toegang toe\./;
var NETJES = [/^Alleen het management kan dit\.$/, /^Alleen de eigenaar of het management kan dit verwijderen\.$/, /^Alleen wie de beoordeling gaf/, /^onbekende functie /, /^Deze link is niet geldig\.$/,
  /^Deze link is verlopen/, /^Geen beschikbaarheid\.$/, /^secret$/, /^De accountmanager bevestigt de vacature/, /^Kies de plaatsing waarover je oordeelt\.$/];
var INTERN = /TypeError|ReferenceError|RangeError|SyntaxError|is not a function|is not defined|Cannot read|Cannot set|of undefined|of null|\bundefined\b|\[object |\bat Object\.|\bat Function\./i;
function soortMelding(f) {
  if (!f) return 'leeg';
  if (INTERN.test(f)) return 'intern';
  if (TOEGANG.test(f)) return 'toegang';
  return NETJES.some(function (re) { return re.test(f); }) ? 'netjes' : 'anders';
}
function netteWeigering(f) { var s = soortMelding(f); return s === 'toegang' || s === 'netjes'; }

/* ---- opwarmen en snapshot: alle tabbladen bestaan, zodat een herstelde Sheet identiek is aan de uitgangssituatie ---- */
['apiCrm', 'apiHome', 'apiTaken', 'apiPipeline', 'apiTalenten', 'apiFacturatie', 'apiFinancien', 'apiBezetting', 'apiGebruikers', 'apiStatus'].forEach(function (fn) { roepRuw('demo-sophie', fn); });
Object.keys(ctx.TABELLEN).forEach(function (t) { lees(t); });
var SNAP = ctx.demoExport(), SNAP_BLADEN = JSON.parse(SNAP).bladen;
function herstel() { ctx.demoStart(SNAP); vers(); }
function gewijzigdeBladen() {  // welke tabbladen verschillen van de snapshot (leeg = niets gewijzigd)
  var nu = JSON.parse(ctx.demoExport()).bladen, uit = [];
  Object.keys(nu).forEach(function (n) { if (JSON.stringify(nu[n]) !== JSON.stringify(SNAP_BLADEN[n] || null)) uit.push(n); });
  return uit;
}

/* ---- de verwachting, afgeleid uit RECHTEN (onafhankelijk van mag()) ---- */
var RECHTEN = ctx.RECHTEN, TEAMS_MET_RECHTEN = ['consultancy', 'accountmanagement', 'talent'];
var NAAM_BEHEER = ctx.PropertiesService.getScriptProperties().getProperty('NAAM');
function actiefV(g) { return g.actief !== false && ['nee', 'false', '0'].indexOf(String(g.actief).toLowerCase()) < 0; }
var GEBRUIKERS_SHEET = lees('Gebruikers').filter(actiefV);
function teamNamenV(team) {  // spiegel van teamNamen(): actieve gebruikers per team; management ook de eigenaar van het script
  var uit = team === 'management' ? [NAAM_BEHEER] : [];
  GEBRUIKERS_SHEET.forEach(function (g) { if (g.team === team) uit.push(g.naam); });
  return uit;
}
var S = {}; ['Scholen', 'Personen', 'Kansen', 'Trajecten', 'Vacatures', 'Kandidaten', 'Talenten', 'Facturen', 'Beoordelingen'].forEach(function (t) { S[t] = perId(lees(t)); });
var OPEN_VAC = {}; lees('Vacatures').forEach(function (v) { if ((v.status || 'open') === 'open') OPEN_VAC[String(v.trajectId)] = true; });
var TALENT_PROJECTEN = {}; lees('Kandidaten').forEach(function (k) { if (k.talentId) (TALENT_PROJECTEN[String(k.talentId)] = TALENT_PROJECTEN[String(k.talentId)] || []).push(String(k.trajectId)); });
var TRAJECTEN_MET_KANS = {}; lees('Trajecten').forEach(function (t) { if (t.kansId) (TRAJECTEN_MET_KANS[String(t.kansId)] = TRAJECTEN_MET_KANS[String(t.kansId)] || []).push(t); });

function niveauVerwacht(g, onderdeel, actie) {
  if (g.team === 'management') return 'alles';
  var r = (RECHTEN[onderdeel] || {})[g.team]; if (!r) return 'geen';
  var n = r[actie === 'wijzigen' ? 1 : 0];
  return n === 'eigen' && g.rol === 'teamlead' ? 'team' : n;
}
function eigenaarV(g, onderdeel, rij) { return String((onderdeel === 'pipeline' ? rij.eigenaar : g.team === 'consultancy' ? rij.adviseur : rij.am) || ''); }
// Mag gebruiker g dit onderdeel zien/wijzigen voor deze rij (null = in principe, zonder rij)?
function verwacht(g, onderdeel, actie, rij) {
  var n = niveauVerwacht(g, onderdeel, actie);
  if (n === 'alles') return true;
  if (n === 'geen') return false;
  if (!rij) return true;
  if (onderdeel === 'talenten' || onderdeel === 'beoordelingen') {  // 'eigen' = het talent is kandidaat in een project dat ik mag zien
    return (TALENT_PROJECTEN[String(rij.talentId || rij.id)] || []).some(function (pid) { var p = S.Trajecten[pid]; return !!p && verwacht(g, 'projecten', 'zien', p); });
  }
  if (n === 'opstart') return rij.status === 'opstart' || !!OPEN_VAC[String(rij.id)] || (!!rij.talentscout && rij.talentscout === g.naam);
  var e = eigenaarV(g, onderdeel, rij);
  if (e && e === g.naam) return true;
  return n === 'team' && !!e && teamNamenV(g.team).indexOf(e) >= 0;
}

/* ---- gebruikers: alle demogebruikers (elk team heeft een medewerker en een teamlead; management twee) ---- */
var MENSEN = ctx.DEMO_MENSEN.map(function (m) { return { code: m.code, id: m.id, naam: m.naam, email: m.email, team: m.team, rol: m.rol, kort: m.code.slice(5) }; });
var ontbreekt = [];
TEAMS_MET_RECHTEN.forEach(function (team) { ['medewerker', 'teamlead'].forEach(function (rol) { if (!MENSEN.some(function (m) { return m.team === team && m.rol === rol; })) ontbreekt.push(team + '/' + rol); }); });
log(!ontbreekt.length && MENSEN.some(function (m) { return m.team === 'management'; }), 'demogebruikers dekken elk team met medewerker en teamlead, plus management' + (ontbreekt.length ? ' (ontbreekt: ' + ontbreekt.join(', ') + ')' : ''));
function code(kort) { return MENSEN.filter(function (m) { return m.kort === kort; })[0].code; }
var SOPHIE = code('sophie'), LARS = code('lars'), NOOR = code('noor'), YARA = code('yara'), FEMKE = code('femke'), RUBEN = code('ruben'), BAS = code('bas'), SEM = code('sem'), IRIS = code('iris');

/* ---- 1. de niveautabel: backend niveau() tegenover de verwachting uit RECHTEN, per gebruiker ---- */
var NIVEAUS = {};
Object.keys(RECHTEN).forEach(function (o) { NIVEAUS[o] = { management: ['alles', 'alles'] }; TEAMS_MET_RECHTEN.forEach(function (t) { NIVEAUS[o][t] = { medewerker: RECHTEN[o][t].slice(), teamlead: RECHTEN[o][t].map(function (n) { return n === 'eigen' ? 'team' : n; }) }; }); });
MENSEN.forEach(function (m) {
  ctx.GEBRUIKER = m.id === 'beheer' ? { id: 'beheer', naam: NAAM_BEHEER, email: '', team: 'management', rol: 'management' } : { id: m.id, naam: m.naam, email: m.email, team: m.team, rol: m.rol };
  var mis = [];
  Object.keys(RECHTEN).forEach(function (o) { ['zien', 'wijzigen'].forEach(function (a) { var b = ctx.niveau(o, a), v = niveauVerwacht(m, o, a); if (b !== v) mis.push(o + '.' + a + ': backend ' + b + ', verwacht ' + v); }); });
  ctx.GEBRUIKER = null;
  log(!mis.length, pad(m.kort, 7) + 'niveau() = verwachting uit RECHTEN voor alle ' + Object.keys(RECHTEN).length * 2 + ' onderdeel×actie' + (mis.length ? ' — ' + mis.join('; ') : ''));
});
ctx.GEBRUIKER = { id: 'extern', naam: 'Portaal', email: '', team: 'extern', rol: 'medewerker' };
log(Object.keys(RECHTEN).every(function (o) { return ctx.niveau(o, 'zien') === 'geen' && ctx.niveau(o, 'wijzigen') === 'geen'; }), 'het externe portaalprofiel heeft overal niveau geen');
ctx.GEBRUIKER = null;

/* ---- 2. de matrix: onderdeel × actie × representatieve api × rij, voor elke gebruiker ---- */
function T(id) { return S.Trajecten[id]; }
function labelT(t) { return t.id + ' (' + t.status + ', am ' + t.am + ', adviseur ' + t.adviseur + (t.talentscout ? ', scout ' + t.talentscout : '') + (OPEN_VAC[t.id] ? ', open vacature' : '') + ')'; }
function labelK(k) { return k.id + ' (' + k.fase + ', eigenaar ' + k.eigenaar + (TRAJECTEN_MET_KANS[k.id] ? ', project ' + TRAJECTEN_MET_KANS[k.id].map(function (t) { return t.id + '/am ' + t.am; }).join('+') : '') + ')'; }
function labelTl(t) { var ps = TALENT_PROJECTEN[t.id] || []; return t.id + ' (' + t.voornaam + ', ' + (ps.length ? 'kandidaat in ' + ps.map(function (p) { return p + '/am ' + T(p).am; }).join('+') : 'geen kandidaat') + ')'; }
function rijT(id) { var t = T(id); return { label: labelT(t), rij: t, args: [id] }; }
function rijTw(id) { var t = T(id); return { label: labelT(t), rij: t, args: [{ id: id, samenvatting: t.samenvatting }] }; }
function rijK(id) { var k = S.Kansen[id]; return { label: labelK(k), rij: k, args: [id] }; }
function rijKw(id) { var k = S.Kansen[id]; return { label: labelK(k), rij: k, args: [{ id: id, volgendeActie: k.volgendeActie }] }; }
function rijF(id) { var f = S.Facturen[id], t = T(f.trajectId); return { label: id + ' van ' + labelT(t), rij: t, args: [{ id: id, bijzonderheden: f.bijzonderheden || '' }] }; }
function rijV(id) { var v = S.Vacatures[id], t = T(v.trajectId); return { label: id + ' (' + v.status + ') van ' + labelT(t), rij: t, vacId: id, args: [{ id: id, profiel: v.profiel }] }; }
function rijC(id) { var k = S.Kandidaten[id], t = T(k.trajectId); return { label: id + ' (' + k.status + ') in ' + labelT(t), rij: t, args: [{ id: id, notitie: k.notitie || '' }] }; }
function rijTl(id) { var t = S.Talenten[id]; return { label: labelTl(t), rij: t, args: [id] }; }
function rijB(tl, c) { var k = S.Kandidaten[c]; return { label: 'nieuw voor ' + labelTl(S.Talenten[tl]) + ' via ' + c + ' (' + k.status + ')', rij: { talentId: tl }, args: [{ talentId: tl, kandidaatId: c, oordeel: 'goed', tekst: 'Rechtentest' }] }; }

// Regels die een api kent bóven RECHTEN: de verwachting wordt ermee bijgesteld en ze staan in het json onder "onbepaald"
var UITZONDERINGEN = {
  kansViaProject: { naam: 'apiKans: wie een project mag zien, mag de kans erachter lezen (kansZichtbaar/kansenViaProject); RECHTEN zegt pipeline accountmanagement = geen. v7.3 (R1): de eigenaar van het project (niveau eigen/team: de AM) krijgt de kans volledig, wie het project alleen via opstart ziet (talent) een beperkt object (sectie 5 hieronder)',
    extra: function (g, rij, v) { return v || (TRAJECTEN_MET_KANS[rij.id] || []).some(function (t) { return verwacht(g, 'projecten', 'zien', t); }); } },
  beoordelingGever: { naam: 'apiBeoordelingOpslaan: een bestaande beoordeling wijzigt alleen wie haar gaf, het talentteam of het management (strenger dan RECHTEN team)',
    extra: function (g, rij, v) { return v && (g.team === 'management' || rij.door === g.naam || niveauVerwacht(g, 'beoordelingen', 'wijzigen') === 'alles'); } }
};
Object.keys(UITZONDERINGEN).forEach(function (k) { ONBEPAALD.push({ sleutel: k, uitleg: UITZONDERINGEN[k].naam, in_test: 'als uitzondering verrekend' }); });
ONBEPAALD.push({ sleutel: 'trajectVelden', uitleg: 'apiTrajectOpslaan: facturatievelden (FACT_VELDEN) vallen onder facturatie, de rest onder projecten; die veldsplitsing staat niet in RECHTEN. De test wijzigt alleen samenvatting (projecten).', in_test: 'beperkt tot één veld' });
ONBEPAALD.push({ sleutel: 'beoordelingPlaatsing', uitleg: 'apiBeoordelingOpslaan: een AM beoordeelt alleen een plaatsing met status vanaf klaar voor start; de test kiest alleen zulke kandidaten.', in_test: 'rijen zo gekozen' });
ONBEPAALD.push({ sleutel: 'financienWijzigen', uitleg: 'financien wijzigen: geen api (alleen lezen); apiFinancienBevriezen en apiExactImport zijn alleenBeheerder en staan bij de management-aanvallen.', in_test: 'management-only aanvallen' });
ONBEPAALD.push({ sleutel: 'beoordelingenZien', uitleg: 'beoordelingen zien: geen eigen api; zichtbaar via apiTalent (valt onder talenten zien).', in_test: 'niet apart getest' });
ONBEPAALD.push({ sleutel: 'relatiesZien', uitleg: 'apiSchool en apiPersoon roepen geen eis(relaties, zien) aan; dat klopt alleen omdat elk team daar alles heeft (het portaalprofiel komt niet voorbij doPost).', in_test: 'getest met de huidige tabel' });
ONBEPAALD.push({ sleutel: 'talentOpslaanMetRij', uitleg: 'v7.3 (R4): apiTalentOpslaan controleert eis(talenten, wijzigen, oud || null) mét de rij; een rijniveau eigen of team geldt dus ook hier (de rooktest bewijst dat met een tijdelijk niveau eigen voor de AM).', in_test: 'verwachting met rij (tl1)' });
ONBEPAALD.push({ sleutel: 'kansBeperkt', uitleg: 'v7.3 (R1): de kans achter een zichtbaar project komt beperkt terug (naam, school, fase; waarde 0, notities leeg, geen taken of tijdlijn) voor wie het project alleen via niveau opstart ziet (talent); de eigenaar van het project (AM, niveau eigen/team) en het management krijgen de kans volledig. Ook in apiProject, apiCrm (openWaarde) en de zoektool van de assistent.', in_test: 'sectie 5' });

var PROEVEN = [
  { onderdeel: 'relaties', actie: 'zien', api: 'apiSchool', rijen: ['s1', 's3'].map(function (id) { var s = S.Scholen[id]; return { label: id + ' (eigenaar ' + s.eigenaar + ')', rij: s, args: [id] }; }) },
  { onderdeel: 'relaties', actie: 'zien', api: 'apiPersoon', rijen: ['p1', 'p5'].map(function (id) { var p = S.Personen[id]; return { label: id + ' (eigenaar ' + p.eigenaar + ')', rij: p, args: [id] }; }) },
  { onderdeel: 'relaties', actie: 'wijzigen', api: 'apiSchoolOpslaan', schrijft: true, rijen: ['s1', 's3'].map(function (id) { var s = S.Scholen[id]; return { label: id + ' (eigenaar ' + s.eigenaar + ')', rij: s, args: [{ id: id, notities: s.notities || '' }] }; })
    .concat([{ label: 'nieuw', rij: null, args: [{ naam: 'Rechtentest school' }] }]) },
  { onderdeel: 'relaties', actie: 'wijzigen', api: 'apiPersoonOpslaan', schrijft: true, rijen: [{ label: 'p1 (eigenaar ' + S.Personen.p1.eigenaar + ')', rij: S.Personen.p1, args: [{ id: 'p1', functie: S.Personen.p1.functie }] },
    { label: 'nieuw', rij: null, args: [{ voornaam: 'Rechten', achternaam: 'Test', schoolId: 's1' }] }] },
  { onderdeel: 'pipeline', actie: 'zien', api: 'apiKans', uitzondering: 'kansViaProject', rijen: ['k7', 'k6', 'k9', 'k1', 'k3', 'k4', 'k17'].map(rijK) },
  { onderdeel: 'pipeline', actie: 'wijzigen', api: 'apiKansOpslaan', schrijft: true, rijen: ['k7', 'k6', 'k9', 'k1'].map(rijKw).concat([{ label: 'nieuw', rij: null, args: [{ naam: 'Rechtentest kans', schoolId: 's1' }] }]) },
  { onderdeel: 'projecten', actie: 'zien', api: 'apiProject', rijen: ['t1', 't2', 't3', 't4', 't5', 't6', 't9', 't10', 't12', 't8'].map(rijT) },
  { onderdeel: 'projecten', actie: 'wijzigen', api: 'apiTrajectOpslaan', schrijft: true, rijen: ['t1', 't2', 't4', 't9', 't12', 't10'].map(rijTw).concat([{ label: 'nieuw', rij: null, args: [{ school: 'Rechtentest school', traject: 'Rechtentest project' }] }]) },
  { onderdeel: 'facturatie', actie: 'zien', api: 'apiFacturatie', lijst: function (res, rij) { return res.projecten.some(function (p) { return p.id === rij.id; }); }, rijen: ['t1', 't2', 't4', 't6', 't9', 't12'].map(rijT) },
  { onderdeel: 'facturatie', actie: 'wijzigen', api: 'apiFactuurOpslaan', schrijft: true, rijen: ['f1-0', 'f2-0', 'f6-0'].map(rijF).concat([{ label: 'nieuw bij ' + labelT(T('t4')), rij: T('t4'), args: [{ trajectId: 't4', omschrijving: 'Rechtentest termijn' }] }]) },
  { onderdeel: 'vacatures', actie: 'zien', api: 'apiBezetting', lijst: function (res, rij, r) { return res.vacatures.some(function (v) { return v.id === r.vacId; }); }, rijen: ['v1', 'v5', 'v3', 'v4', 'v7', 'v6'].map(rijV) },
  { onderdeel: 'vacatures', actie: 'wijzigen', api: 'apiVacatureOpslaan', schrijft: true, rijen: ['v1', 'v5', 'v3', 'v4', 'v7'].map(rijV).concat([{ label: 'nieuw bij ' + labelT(T('t4')), rij: T('t4'), args: [{ trajectId: 't4', titel: 'Rechtentest vacature' }] }]) },
  { onderdeel: 'kandidaten', actie: 'zien', api: 'apiBezetting', lijst: function (res, rij, r) { return res.vacatures.some(function (v) { return v.id === r.vacId && v.kandidaten instanceof Array; }); }, rijen: ['v1', 'v5', 'v3', 'v4', 'v6'].map(rijV) },
  { onderdeel: 'kandidaten', actie: 'wijzigen', api: 'apiKandidaatOpslaan', schrijft: true, rijen: ['c1', 'c4', 'c8', 'c11', 'c6'].map(rijC).concat([{ label: 'nieuw op v3 van ' + labelT(T('t4')), rij: T('t4'), args: [{ vacatureId: 'v3', naam: 'Rechtentest kandidaat' }] }]) },
  { onderdeel: 'talenten', actie: 'zien', api: 'apiTalent', rijen: ['tl1', 'tl4', 'tl8', 'tl15', 'tl19', 'tl24', 'tl13'].map(rijTl) },
  { onderdeel: 'talenten', actie: 'zien', api: 'apiTalenten', lijst: function (res, rij) { return res.talenten.some(function (t) { return t.id === rij.id; }); }, rijen: ['tl1', 'tl4', 'tl8', 'tl15', 'tl19', 'tl24', 'tl13'].map(rijTl) },
  { onderdeel: 'talenten', actie: 'wijzigen', api: 'apiTalentOpslaan', schrijft: true, rijen: [{ label: labelTl(S.Talenten.tl1) + ' (v7.3: api controleert met de rij)', rij: S.Talenten.tl1, args: [{ id: 'tl1', notitie: S.Talenten.tl1.notitie }] },
    { label: 'nieuw', rij: null, args: [{ voornaam: 'Rechten', achternaam: 'Test', toestemmingDatum: vandaag() }] }] },
  { onderdeel: 'beoordelingen', actie: 'wijzigen', api: 'apiBeoordelingOpslaan', schrijft: true, rijen: [rijB('tl1', 'c1'), rijB('tl4', 'c4'), rijB('tl13', 'c13'), rijB('tl19', 'c16'), rijB('tl24', 'c15')] },
  { onderdeel: 'beoordelingen', actie: 'wijzigen', api: 'apiBeoordelingOpslaan', schrijft: true, uitzondering: 'beoordelingGever', rijen: ['b1', 'b3'].map(function (id) { var b = S.Beoordelingen[id]; return { label: id + ' (door ' + b.door + ', talent ' + b.talentId + ' in ' + b.trajectId + '/am ' + T(b.trajectId).am + ')', rij: b, args: [{ id: id, tekst: b.tekst }] }; }) },
  { onderdeel: 'financien', actie: 'zien', api: 'apiFinancien', lijst: function (res, rij) { return res.scholen.some(function (s) { return s.projecten.some(function (p) { return p.id === rij.id; }); }); }, rijen: ['t1', 't2', 't4', 't6', 't9', 't12', 't10'].map(rijT) }
];
// controle: elke rij uit de seed bestaat
PROEVEN.forEach(function (p) { p.rijen.forEach(function (r) { if (r.rij === undefined || (r.rij !== null && typeof r.rij !== 'object')) { log(false, 'seed mist een rij voor ' + p.api + ' ' + r.label); } }); });

function beoordeel(m, p, r, res, bladenNa) {
  var v = verwacht(m, p.onderdeel, p.actie, r.rij);
  if (p.uitzondering) v = UITZONDERINGEN[p.uitzondering].extra(m, r.rij, v);
  var toegestaan = p.lijst ? (res.ok ? !!p.lijst(res.result, r.rij, r) : false) : res.ok, fout = res.ok ? '' : String(res.fout || ''), soort = res.ok ? '' : soortMelding(fout), oordeel = 'klopt', uitleg = '';
  if (toegestaan && !v) { oordeel = 'te ruim'; uitleg = 'toegestaan maar verwacht geweigerd'; }
  else if (!toegestaan && v) { oordeel = (soort === 'toegang' || soort === 'netjes') ? 'te streng' : 'proef ongeldig'; uitleg = 'geweigerd maar verwacht toegestaan: ' + (fout || 'niet in de lijst'); }
  else if (!toegestaan && !res.ok && soort === 'intern') { oordeel = 'interne fout'; uitleg = fout; }
  else if (!toegestaan && !res.ok && soort === 'anders') { oordeel = 'melding onduidelijk'; uitleg = fout; }
  if (bladenNa && bladenNa.length) { oordeel = oordeel === 'klopt' ? 'schrijft ondanks weigering' : oordeel + ' + schrijft ondanks weigering'; uitleg += (uitleg ? '; ' : '') + 'gewijzigd: ' + bladenNa.join(','); }
  var ok = oordeel === 'klopt';
  if (!ok && oordeel !== 'melding onduidelijk' && oordeel !== 'proef ongeldig') schendingen++;
  var rij = { gebruiker: m.naam, kort: m.kort, team: m.team, rol: m.rol, onderdeel: p.onderdeel, actie: p.actie, api: p.api, rij: r.label, niveau: niveauVerwacht(m, p.onderdeel, p.actie), verwacht: v, toegestaan: toegestaan, melding: fout, soortMelding: soort, oordeel: oordeel };
  if (p.uitzondering) rij.uitzondering = p.uitzondering;
  MATRIX.push(rij);
  log(ok, pad(m.kort, 7) + pad(p.onderdeel, 14) + pad(p.actie, 9) + pad(p.api, 22) + pad(r.label, 58) + (toegestaan ? 'toegestaan' : 'geweigerd ') + ' [' + rij.niveau + (p.uitzondering ? '+' : '') + ']' + (soort && soort !== 'toegang' ? ' melding: ' + soort : '') + (uitleg ? ' — ' + uitleg : ''));
}

var aantalHerstel = 0, aantalAanroepen = 0;
MENSEN.forEach(function (m) {
  PROEVEN.forEach(function (p) {
    if (p.lijst) {  // één aanroep, de rijen uit het resultaat
      var res = roepRuw(m.code, p.api, []); aantalAanroepen++;
      p.rijen.forEach(function (r) { beoordeel(m, p, r, res, null); });
      return;
    }
    p.rijen.forEach(function (r) {
      var res = roepRuw(m.code, p.api, r.args); aantalAanroepen++;
      var bladen = null;
      if (p.schrijft) { if (res.ok) { herstel(); aantalHerstel++; } else { bladen = gewijzigdeBladen(); if (bladen.length) herstel(); } }
      beoordeel(m, p, r, res, bladen);
    });
  });
});

/* ---- 3. horizontale aanvallen ---- */
function aanval(naam, wie, fn, args, verwachtOk, meldingRe, controle) {
  var res = wie === 'portaal' ? portaalRuw(args.shift(), fn, args) : roepRuw(wie, fn, args), fout = res.ok ? '' : String(res.fout || ''), ok;
  if (verwachtOk) ok = res.ok && (!controle || controle(res.result));
  else ok = !res.ok && (meldingRe ? meldingRe.test(fout) : netteWeigering(fout)) && soortMelding(fout) !== 'intern' && (!controle || controle(res.result));
  var bladen = []; if (!res.ok) { bladen = gewijzigdeBladen(); if (bladen.length) { ok = false; herstel(); } } else { herstel(); }
  AANVALLEN.push({ naam: naam, wie: wie, fn: fn, verwacht: verwachtOk ? 'toegestaan' : 'geweigerd', toegestaan: res.ok, melding: fout, soortMelding: res.ok ? '' : soortMelding(fout), gewijzigd: bladen, ok: ok });
  log(ok, 'aanval  ' + pad(naam, 78) + (res.ok ? 'toegestaan' : 'geweigerd: ' + fout) + (bladen.length ? ' — Sheet gewijzigd: ' + bladen.join(',') : ''));
  return res;
}
// AM leest en wijzigt het project van een andere AM; draagt een project over; kaapt er een
aanval('AM leest het project van een andere AM', FEMKE, 'apiProject', ['t2'], false, TOEGANG);
aanval('AM wijzigt het project van een andere AM', FEMKE, 'apiTrajectOpslaan', [{ id: 't2', samenvatting: 'Gekaapt' }], false, TOEGANG);
aanval('AM draagt zijn project over aan een andere AM (nieuwe situatie buiten zijn recht)', FEMKE, 'apiTrajectOpslaan', [{ id: 't1', am: 'Ruben Smit' }], false, TOEGANG);
aanval('AM zet zichzelf als am op het project van een collega', FEMKE, 'apiTrajectOpslaan', [{ id: 't2', am: 'Femke de Wit' }], false, TOEGANG);
aanval('AM wijzigt een termijn van het project van een andere AM', FEMKE, 'apiFactuurOpslaan', [{ id: 'f2-0', bijzonderheden: 'Gekaapt' }], false, TOEGANG);
aanval('AM verplaatst een termijn van zijn project naar dat van een andere AM', FEMKE, 'apiFactuurOpslaan', [{ id: 'f1-0', trajectId: 't2' }], false, TOEGANG);
aanval('AM opent een vacature op het project van een andere AM', FEMKE, 'apiVacatureOpslaan', [{ trajectId: 't2', titel: 'Gekaapt' }], false, TOEGANG);
aanval('AM draagt een kandidaat voor op het project van een andere AM', FEMKE, 'apiKandidaatOpslaan', [{ vacatureId: 'v5', naam: 'Indringer' }], false, TOEGANG);
aanval('AM leest het profiel van een talent dat alleen in het project van een collega staat', FEMKE, 'apiTalent', ['tl4'], false, TOEGANG);
aanval('AM beoordeelt een plaatsing in het project van een collega', FEMKE, 'apiBeoordelingOpslaan', [{ talentId: 'tl4', kandidaatId: 'c4', oordeel: 'niet geschikt' }], false, TOEGANG);
aanval('AM-teamlead leest wel het project van een teamgenoot', BAS, 'apiProject', ['t2'], true);
// consultant en de kans van een collega
aanval('consultant leest de kans van een collega', LARS, 'apiKans', ['k6'], false, TOEGANG);
aanval('consultant wijzigt de kans van een collega', LARS, 'apiKansOpslaan', [{ id: 'k6', volgendeActie: 'Gekaapt' }], false, TOEGANG);
aanval('consultant geeft zijn kans aan een collega (nieuwe eigenaar buiten zijn recht)', LARS, 'apiKansOpslaan', [{ id: 'k7', eigenaar: 'Noor Hendriks' }], false, TOEGANG);
aanval('consultant maakt een kans op naam van een collega', LARS, 'apiKansOpslaan', [{ naam: 'Gekaapt', schoolId: 's1', eigenaar: 'Noor Hendriks' }], false, TOEGANG);
aanval('consultant wijzigt een project (ook zijn eigen: alleen lezen)', LARS, 'apiTrajectOpslaan', [{ id: 't1', samenvatting: 'Gekaapt' }], false, TOEGANG);
aanval('consultant wijzigt een factuurveld op zijn eigen project', LARS, 'apiTrajectOpslaan', [{ id: 't1', gefactureerd: 'nee' }], false, TOEGANG);
aanval('consultant-teamlead wijzigt wel de kans van een teamgenoot', YARA, 'apiKansOpslaan', [{ id: 'k6', volgendeActie: S.Kansen.k6.volgendeActie }], true);
// talent en relaties
aanval('talent wijzigt een school', SEM, 'apiSchoolOpslaan', [{ id: 's1', notities: 'Gekaapt' }], false, TOEGANG);
aanval('talent maakt een school aan', SEM, 'apiSchoolOpslaan', [{ naam: 'Gekaapt' }], false, TOEGANG);
aanval('talent wijzigt een persoon', SEM, 'apiPersoonOpslaan', [{ id: 'p1', functie: 'Gekaapt' }], false, TOEGANG);
aanval('talent-teamlead wijzigt een school', IRIS, 'apiSchoolOpslaan', [{ id: 's1', notities: 'Gekaapt' }], false, TOEGANG);
aanval('talent wijzigt een project dat niet in opstart is', SEM, 'apiTrajectOpslaan', [{ id: 't2', samenvatting: 'Gekaapt' }], false, TOEGANG);
aanval('talent wijzigt een termijn', SEM, 'apiFactuurOpslaan', [{ id: 'f1-0', bijzonderheden: 'Gekaapt' }], false, TOEGANG);
aanval('talent leest wel het project waar hij talentscout is', SEM, 'apiProject', ['t1'], true);
// alleen management
var MGMT = /Alleen het management kan dit\./;
MENSEN.filter(function (m) { return m.team !== 'management'; }).forEach(function (m) {
  aanval(m.kort + ' maakt een gebruiker aan (apiGebruikerOpslaan)', m.code, 'apiGebruikerOpslaan', [{ naam: 'Indringer', team: 'management' }], false, MGMT);
  aanval(m.kort + ' wijzigt een keuzelijst (apiKeuzelijstOpslaan)', m.code, 'apiKeuzelijstOpslaan', ['sectoren', ['vo']], false, MGMT);
  aanval(m.kort + ' exporteert alles (apiExportAlles)', m.code, 'apiExportAlles', ['Gebruikers'], false, MGMT);
  aanval(m.kort + ' leest de gebruikerslijst met codes (apiGebruikers)', m.code, 'apiGebruikers', [], false, MGMT);
  aanval(m.kort + ' bevriest de prognose (apiFinancienBevriezen)', m.code, 'apiFinancienBevriezen', [], false, MGMT);
  aanval(m.kort + ' importeert Exact (apiExactImport)', m.code, 'apiExactImport', ['Factuurnummer;Datum\n1;2026-01-01'], false, MGMT);
});
aanval('management exporteert wel (apiExportAlles)', code('thomas'), 'apiExportAlles', ['Gebruikers'], true, null, function (r) { return r && r.rijen instanceof Array && r.rijen.length > 0; });
// uitgeschakelde gebruiker: zijn code werkt niet meer
var uit = roepRuw(SOPHIE, 'apiGebruikerOpslaan', [{ id: 'g-lars', actief: false }]);
var naUit = roepRuw(LARS, 'apiHome', []);
log(uit.ok && !naUit.ok && naUit.fout === 'secret', 'aanval  ' + pad('een uitgeschakelde gebruiker kan met zijn code niets meer', 78) + (naUit.ok ? 'toegestaan' : 'geweigerd: ' + naUit.fout));
AANVALLEN.push({ naam: 'uitgeschakelde gebruiker', wie: LARS, fn: 'apiHome', verwacht: 'geweigerd', toegestaan: naUit.ok, melding: naUit.fout || '', ok: uit.ok && !naUit.ok && naUit.fout === 'secret' });
herstel();
// onbekende code en onbekende functie
aanval('een onbekende koppelcode', 'geen-code-xyz', 'apiHome', [], false, /^secret$/);
aanval('een niet-api-functie via doPost (niveau)', SOPHIE, 'niveau', ['relaties', 'zien'], false, /^onbekende functie /);
aanval('een gewone gebruiker roept een portaalfunctie aan met zijn code', SEM, 'apiPortaalBeschikbaarheid', ['demotokenali0000000000000000000000000001', null, null, true], false, /^onbekende functie /);

/* ---- 4. het portaal: alleen de twee portaalfuncties, alleen de eigen rij ---- */
var TOKEN_ALI = 'demotokenali0000000000000000000000000001', TOKEN_YUSUF = 'demotokenyusuf00000000000000000000000002';  // tl2 en tl15 uit de demo-seed
function talent(id) { return lees('Talenten').filter(function (t) { return t.id === id; })[0]; }
function kern(t) { return JSON.stringify({ b: t.beschikbaarheid, bv: t.beschikbaarheidBevestigd, u: t.uitzonderingen, s: t.status, lc: t.laatsteContact, n: t.notitie, e: t.email }); }
var toon = aanval('portaal: apiPortaalToon met een geldig token', 'portaal', 'apiPortaalToon', [TOKEN_ALI], true, null, function (r) { return r && r.naam === 'Ali'; });
aanval('portaal: apiTalenten met een geldig token', 'portaal', 'apiTalenten', [TOKEN_ALI], false, /^onbekende functie apiTalenten$/);
aanval('portaal: apiHome met een geldig token', 'portaal', 'apiHome', [TOKEN_ALI], false, /^onbekende functie apiHome$/);
aanval('portaal: apiTalentOpslaan met een geldig token', 'portaal', 'apiTalentOpslaan', [TOKEN_ALI, { id: 'tl15', notitie: 'Gekaapt' }], false, /^onbekende functie apiTalentOpslaan$/);
aanval('portaal: apiSchool met een geldig token', 'portaal', 'apiSchool', [TOKEN_ALI, 's1'], false, /^onbekende functie apiSchool$/);
aanval('portaal: apiPortaalToon met een te kort token', 'portaal', 'apiPortaalToon', ['kort'], false, /^Deze link is niet geldig\.$/);
aanval('portaal: apiPortaalToon met een onbekend lang token', 'portaal', 'apiPortaalToon', ['onbekendtoken000000000000000000000000000x'], false, /^Deze link is verlopen/);
// de eigenlijke aanval: het token van Ali, de talentId van Yusuf in de argumenten — alleen de rij van Ali mag veranderen
var raster = { ma: [2, 2, 2], di: [2, 2, 2], wo: [2, 2, 2], do: [2, 2, 2], vr: [2, 2, 2], za: [2, 2, 2], zo: [2, 2, 2], id: 'tl15', talentId: 'tl15' };
[['raster met id/talentId van een ander talent', [raster, [], false]],
 ['uitzondering met talentId en een extra argument', [null, [{ van: vandaag(), tot: vandaag(), reden: 'x', talentId: 'tl15' }], false, { talentId: 'tl15' }, 'tl15']],
 ['alleen bevestigen met talentId als extra argument', [null, null, true, { talentId: 'tl15', id: 'tl15' }]]].forEach(function (x) {
  var yVoor = kern(talent('tl15')), aVoor = kern(talent('tl2')), actVoor = lees('Activiteiten').filter(function (a) { return String(a.talentId) === 'tl15'; }).length;
  var res = portaalRuw(TOKEN_ALI, 'apiPortaalBeschikbaarheid', x[1]), yNa = kern(talent('tl15')), aNa = kern(talent('tl2')), actNa = lees('Activiteiten').filter(function (a) { return String(a.talentId) === 'tl15'; }).length;
  var andere = gewijzigdeBladen().filter(function (b) { return b !== 'Talenten' && b !== 'Activiteiten'; });
  var ok = res.ok && yVoor === yNa && actVoor === actNa && aVoor !== aNa && !andere.length;
  AANVALLEN.push({ naam: 'portaal: ' + x[0], wie: 'portaal', fn: 'apiPortaalBeschikbaarheid', verwacht: 'alleen eigen rij', toegestaan: res.ok, melding: res.ok ? '' : String(res.fout), eigenRijGewijzigd: aVoor !== aNa, andereRijGewijzigd: yVoor !== yNa, ok: ok });
  log(ok, 'aanval  ' + pad('portaal: apiPortaalBeschikbaarheid, ' + x[0], 78) + (res.ok ? 'alleen de eigen rij (tl2) gewijzigd' : 'geweigerd: ' + res.fout) + (yVoor !== yNa ? ' — RIJ VAN EEN ANDER TALENT (tl15) GEWIJZIGD' : '') + (andere.length ? ' — ook gewijzigd: ' + andere.join(',') : ''));
  herstel();
});
// het token van een ander als eerste argument meegeven: het token komt uit req.portaal, dus de argumenten verschuiven één plek
// (de raster-parameter krijgt het token, alleenBevestigen het raster). Toegestaan is dan hoogstens 'bevestigen' op de eigen rij; Yusuf blijft onaangeroerd.
(function () {
  var yVoor = kern(talent('tl15')), aVoor = kern(talent('tl2'));
  var res = portaalRuw(TOKEN_ALI, 'apiPortaalBeschikbaarheid', [TOKEN_YUSUF, raster, [], false]);
  var yNa = kern(talent('tl15')), aNa = kern(talent('tl2'));
  var ok = yNa === yVoor && (res.ok ? aNa !== aVoor : (netteWeigering(String(res.fout)) && aNa === aVoor));
  AANVALLEN.push({ naam: 'portaal: token van een ander als argument', wie: 'portaal', fn: 'apiPortaalBeschikbaarheid', verwacht: 'geweigerd of alleen eigen rij', toegestaan: res.ok, melding: res.ok ? '' : String(res.fout), eigenRijGewijzigd: aNa !== aVoor, andereRijGewijzigd: yNa !== yVoor, ok: ok });
  log(ok, 'aanval  ' + pad('portaal: het token van Yusuf als eerste argument bij het token van Ali', 78) + (res.ok ? 'toegestaan als bevestigen van de eigen rij (tl2)' : 'geweigerd: ' + res.fout) + (yNa !== yVoor ? ' — RIJ VAN EEN ANDER TALENT (tl15) GEWIJZIGD' : ''));
  herstel();
})();
log(!!toon.ok, 'portaal: het eigen profiel blijft via het portaal gewoon bereikbaar (geen te strenge afsluiting)');

/* ---- 5. v7.3 (R1): de kans achter een zichtbaar project — beperkt voor wie het project alleen via opstart ziet (talent), volledig voor de eigenaar (AM) en het management ---- */
(function () {
  var sem = MENSEN.filter(function (m) { return m.kort === 'sem'; })[0], proef = null;
  Object.keys(S.Trajecten).forEach(function (id) { var t = S.Trajecten[id]; if (!proef && t.kansId && S.Kansen[t.kansId] && verwacht(sem, 'projecten', 'zien', t) && !verwacht(sem, 'pipeline', 'zien', S.Kansen[t.kansId])) proef = t; });
  log(!!proef, 'R1: de seed heeft een project met een kans dat talent via opstart ziet maar waarvan hij de kans zelf niet mag zien' + (proef ? ': ' + labelT(proef) + ', kans ' + proef.kansId : ''));
  if (!proef) return;
  var k = S.Kansen[proef.kansId], am = MENSEN.filter(function (m) { return m.naam === proef.am; })[0], waarde = Number(k.waarde) || 0, notities = String(k.notities || '');
  function noteer(naam, wie, fn, res, ok) { AANVALLEN.push({ naam: 'R1: ' + naam, wie: wie, fn: fn, verwacht: 'beperkt of volledig volgens de eigenaarsregel', toegestaan: res.ok, melding: res.ok ? '' : String(res.fout || ''), ok: ok }); log(ok, 'aanval  ' + pad('R1: ' + naam, 78) + (res.ok ? 'toegestaan' : 'geweigerd: ' + res.fout)); }
  var rS = roepRuw(SEM, 'apiKans', [k.id]), kS = rS.ok ? rS.result.kans : {};
  noteer('talent (Sem) leest de kans achter ' + proef.id + ': beperkt, waarde 0, notities leeg, geen taken of tijdlijn', SEM, 'apiKans', rS,
    rS.ok && rS.result.beperkt === true && rS.result.alleenLezen === true && kS.beperkt === true && kS.waarde === 0 && kS.gewogen === 0 && kS.notities === '' && kS.verliesReden === '' && kS.volgendeActie === '' && rS.result.taken.length === 0 && rS.result.tijdlijn.length === 0 && kS.naam === (k.naam || k.traject) && kS.school === k.school && kS.fase === k.fase && kS.id === k.id);
  var rA = am ? roepRuw(am.code, 'apiKans', [k.id]) : { ok: false, fout: 'geen AM in de seed' }, kA = rA.ok ? rA.result.kans : {};
  noteer('de AM van het project (' + proef.am + ') leest de kans volledig: waarde ' + waarde + ', notities, historie', am ? am.code : '-', 'apiKans', rA, rA.ok && rA.result.beperkt === false && !kA.beperkt && kA.waarde === waarde && kA.notities === notities);
  var rM = roepRuw(SOPHIE, 'apiKans', [k.id]);
  noteer('management leest de kans volledig', SOPHIE, 'apiKans', rM, rM.ok && rM.result.beperkt === false && rM.result.kans.waarde === waarde && rM.result.kans.notities === notities);
  var pS = roepRuw(SEM, 'apiProject', [proef.id]), pA = am ? roepRuw(am.code, 'apiProject', [proef.id]) : { ok: false, fout: 'geen AM' };
  noteer('apiProject ' + proef.id + ': talent krijgt dezelfde beperkte kans, de AM de volledige', SEM, 'apiProject', pS,
    pS.ok && !!pS.result.kans && pS.result.kans.beperkt === true && pS.result.kans.waarde === 0 && pS.result.kans.notities === '' && pA.ok && !!pA.result.kans && !pA.result.kans.beperkt && pA.result.kans.waarde === waarde);
  var cS = roepRuw(SEM, 'apiCrm');
  noteer('apiCrm: talent ziet geen pipelinewaarde per school en geen waarde of notities in kansenKort', SEM, 'apiCrm', cS,
    cS.ok && cS.result.scholen.every(function (s) { return s.openWaarde === 0; }) && cS.result.kansenKort.every(function (x) { return !('waarde' in x) && !('notities' in x); }));
  ctx.GEBRUIKER = { id: sem.id, naam: sem.naam, email: sem.email, team: sem.team, rol: sem.rol }; vers(); ctx.GEBRUIKER = { id: sem.id, naam: sem.naam, email: sem.email, team: sem.team, rol: sem.rol };
  var zoek = { ok: true, result: null }; try { zoek.result = ctx.breinZoekCrm(k.naam || k.traject); } catch (e) { zoek = { ok: false, fout: String(e.message) }; }
  ctx.GEBRUIKER = null; vers();
  var zK = zoek.ok ? zoek.result.kansen.filter(function (x) { return x.id === k.id; }) : [];
  noteer('zoek_crm (assistent) als talent: de kans staat erin met beperkt true en waarde 0', SEM, 'breinZoekCrm', zoek, zoek.ok && zK.length === 1 && zK[0].beperkt === true && zK[0].waarde === 0 && zK[0].fase === k.fase);
  herstel();
})();

/* ---- json en slot ---- */
var looptijd = Math.round((Date.now() - T0) / 100) / 10;
var perOordeel = {}; MATRIX.forEach(function (r) { perOordeel[r.oordeel] = (perOordeel[r.oordeel] || 0) + 1; });
var json = { gemaakt: new Date().toISOString(), looptijd_s: looptijd, gebruikers: MENSEN.map(function (m) { return { code: m.code, naam: m.naam, team: m.team, rol: m.rol }; }), aangemaakt_extra_gebruikers: [],
  niveaus_uit_rechten: NIVEAUS, onbepaald: ONBEPAALD, cijfers: { aanroepen: aantalAanroepen, matrixrijen: MATRIX.length, herstel: aantalHerstel, aanvallen: AANVALLEN.length, per_oordeel: perOordeel, schendingen: schendingen, fouten: fouten },
  matrix: MATRIX, aanvallen: AANVALLEN };
var uitDir = path.join(R, 'test/shots/robuust'); try { fs.mkdirSync(uitDir, { recursive: true }); } catch (e) {}
fs.writeFileSync(path.join(uitDir, 'rechten.json'), JSON.stringify(json, null, 1));
console.log('-- ' + MATRIX.length + ' matrixrijen, ' + AANVALLEN.length + ' aanvallen, ' + aantalAanroepen + ' api-aanroepen, ' + aantalHerstel + ' keer hersteld, ' + schendingen + ' schendingen, ' + looptijd + ' s → test/shots/robuust/rechten.json');
if (fouten) { console.log('FOUTEN: ' + fouten); process.exit(1); }
console.log('ALLES GOED');
