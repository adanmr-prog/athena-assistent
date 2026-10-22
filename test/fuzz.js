// v7.2: fuzztest van alle api-functies in backend/Code.gs tegen de demo-backend (zelfde opzet als test/node_rooktest.js:
// demo-backend.js + Code.gs in één vm-context met alleen console van buiten).
// Elke api × rol krijgt maximaal FUZZ_MAX (40) aanroepen met gemuteerde argumenten uit een vaste PRNG (geen Math.random):
// undefined, null, '', 0, -1, 1e12, 'NaN', 20.000 tekens, script-tag, onmogelijke datums, 'morgen', objecten met onbekende
// sleutels, [] waar een object hoort, een object waar een tekst hoort, ids van rijen van andere gebruikers, geldige objecten
// met één veld kapot en _oud met verkeerde waarden. Elk antwoord wordt geclassificeerd als ok / nette fout / INTERNE FOUT.
// Invariant: na een aanroep door een rol zonder wijzigrecht ('geen' in RECHTEN) op een onderdeel mag het aantal rijen in de
// bijbehorende tabbladen niet veranderd zijn (rechtenlek). De Sheet-in-geheugen gaat vóór elke aanroep terug naar de seed,
// en de PRNG wordt per blok (api × rol) opnieuw gezaaid, zodat elke bevinding los reproduceerbaar is.
// Gebruik: node test/fuzz.js  → per blok "ok   …" of "FOUT …", dan "ALLES GOED" (exitcode 0) of "FOUTEN: n" (exitcode 1);
//          json met alle interne fouten, rechtenlekken en verdachte resultaten in test/shots/robuust/fuzz.json.
//   FUZZ_API=apiKansOpslaan FUZZ_ROL=demo-lars node test/fuzz.js   → één blok herhalen (zelfde argumenten als in de volledige run)
//   FUZZ_SEED=1234 FUZZ_MAX=40 node test/fuzz.js                    → andere seed of ander maximum per api × rol
var vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
var T0 = Date.now();
var SEED = Number(process.env.FUZZ_SEED) || 7202, MAX = Number(process.env.FUZZ_MAX) || 40, ALLEEN_API = process.env.FUZZ_API || '', ALLEEN_ROL = process.env.FUZZ_ROL || '';
var MAX_ZONDER_PARAMS = 4;  // een api zonder parameters heeft niets te muteren: zonder argumenten, met één atoom, met een object en met een lijst

var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);  // alleen console van buiten: JSON, Date en Array uit de context (instanceof)
var BRON = fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8');
vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + BRON, ctx, { filename: 'demo.js' });
ctx.demoStart('');

/* ---------- vaste PRNG (mulberry32) en een hash per blok ---------- */
function prng(seed) {
  var s = seed >>> 0;
  return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- de api's met hun parameternamen, uit de bron ---------- */
var API = [], re = /^function (api[A-Z]\w*)\s*\(([^)]*)\)/gm, m;
while ((m = re.exec(BRON))) API.push({ naam: m[1], params: m[2].split(',').map(function (p) { return p.trim(); }).filter(Boolean) });
API = API.filter(function (a) { return typeof ctx[a.naam] === 'function'; });
var PORTAAL_FUNCTIES = ctx.PORTAAL_FUNCTIES || [];
var PORTAAL_TOKEN = 'demotokenali0000000000000000000000000001';  // Ali, uit de demoseed (talent tl2)

/* ---------- rollen ---------- */
var CODES = ['demo-sophie', 'demo-lars', 'demo-femke', 'demo-sem', 'demo-iris'];
var ROLLEN = CODES.map(function (c) { var p = ctx.DEMO_MENSEN.filter(function (x) { return x.code === c; })[0]; return { code: c, naam: p.naam, team: p.team, rol: p.rol }; });
var PORTAAL_ROL = { code: 'portaal', naam: 'Portaal', team: 'extern', rol: 'medewerker' };

/* ---------- seed bewaren en vóór elke aanroep terugzetten ---------- */
var SEED_BLADEN = {}, SEED_PROPS = {}, SEEDRIJEN = {}, SEED_AGENDA = [], CtxDate = vm.runInContext('Date', ctx);  // de Date van de context (instanceof in Code.gs)
Object.keys(ctx._demoBladen).forEach(function (n) { SEED_BLADEN[n] = ctx._demoBladen[n].rijen.map(function (r) { return r.slice(); }); });
Object.keys(ctx._demoProps).forEach(function (k) { SEED_PROPS[k] = ctx._demoProps[k]; });
Object.keys(ctx.TABELLEN).forEach(function (n) { SEEDRIJEN[n] = ctx.lees(n).map(function (r) { delete r._rij; return r; }); });
ctx._demoAgenda.forEach(function (ev) { SEED_AGENDA.push({ id: ev.getId(), titel: ev.getTitle(), start: ev.getStartTime().getTime(), duurMin: Math.round((ev.getEndTime().getTime() - ev.getStartTime().getTime()) / 60000), locatie: ev.getLocation() }); });
function herstel() {
  Object.keys(ctx._demoBladen).forEach(function (n) {
    if (!SEED_BLADEN[n]) { delete ctx._demoBladen[n]; return; }  // een tabblad dat tijdens een aanroep is aangemaakt
    var rijen = ctx._demoBladen[n].rijen; rijen.length = 0;
    SEED_BLADEN[n].forEach(function (r) { rijen.push(r.slice()); });
  });
  Object.keys(ctx._demoProps).forEach(function (k) { if (!(k in SEED_PROPS)) delete ctx._demoProps[k]; });
  Object.keys(SEED_PROPS).forEach(function (k) { ctx._demoProps[k] = SEED_PROPS[k]; });
  // de agenda-stub ook: een afspraak uit een eerdere aanroep (bijv. met een object als locatie) mag niet in het antwoord van apiAgenda van een later blok opduiken
  ctx._demoAgenda = SEED_AGENDA.map(function (e) { return ctx._demoEvent(e.id, e.titel, new CtxDate(e.start), e.duurMin, e.locatie); });
  ctx._demoCache = {}; ctx._demoVerzonden.length = 0; ctx._LEES = {}; ctx.GEBRUIKER = null;  // de cache ook: het portaalbudget telt per token
}
function tellingen() { var t = {}; Object.keys(ctx._demoBladen).forEach(function (n) { t[n] = ctx._demoBladen[n].rijen.length; }); return t; }
function plusDagen(n) { return ctx.datumStr(ctx.plusDagen(n)); }

/* ---------- rechten: welke onderdelen mag deze rol niet wijzigen, en welke tabbladen horen daarbij ---------- */
var ONDERDEEL_TABS = { relaties: ['Scholen', 'Personen'], pipeline: ['Kansen'], projecten: ['Trajecten'], facturatie: ['Facturen'], vacatures: ['Vacatures'], kandidaten: ['Kandidaten'],
  talenten: ['Talenten', 'TalentDocumenten', 'TalentSchool', 'TalentUren'], beoordelingen: ['Beoordelingen'], financien: ['Prognoses'] };
function geenOnderdelen(rol) {
  if (rol.team === 'management') return [];
  if (rol.team === 'extern') return Object.keys(ONDERDEEL_TABS);
  return Object.keys(ctx.RECHTEN).filter(function (o) { var r = ctx.RECHTEN[o][rol.team]; return !r || r[1] === 'geen'; });
}
// Ontworpen uitzonderingen: een rij komt bij via een toegestane handeling op een ander onderdeel. Alleen gemeld als "uitzondering", geen lek.
var UITZONDERINGEN = [
  { api: 'apiKansOpslaan', team: 'consultancy', tabs: ['Trajecten', 'Vacatures'], reden: 'v6.4: een gewonnen kans wordt automatisch een project met conceptvacature; de consultant mag zelf geen project aanmaken' }
];

/* ---------- atomen en hulpjes ---------- */
var LANG = 'x'.repeat(20000);
var ATOMEN = [undefined, null, '', 0, -1, 1e12, 'NaN', LANG, '<script>alert(1)</script>', '2026-13-45', '31-02-2026', 'morgen', { onbekendeSleutel: 1, nogEen: 'x' }, [], {}, true, false,
  '  ', '0', 'x', 99999, 1.5, '{"a":1}', "'; DROP TABLE Scholen; --", '=SUM(A1:A9)', 'ééñ 日本 🙂', ['a', 'b'], [{}], [null], -0.5, '25:00', '2026-10-22T10:00', 'tl1', 'geen-id',
  'constructor', 'toString', '__proto__'];  // sleutels die in een gewoon object als keuzelijst (TABELLEN[x], CONTENT_TYPES[x]) iets opleveren
function kies(rnd, lijst) { return lijst[Math.floor(rnd() * lijst.length)]; }
function atoom(rnd) { return kies(rnd, ATOMEN); }
function kopie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v && typeof v === 'object' && !(v instanceof Array); }
function kort(v, n) { var s; try { s = JSON.stringify(v, function (k, x) { return typeof x === 'string' && x.length > 80 ? x.slice(0, 40) + '…(' + x.length + ' tekens)' : x; }); } catch (e) { s = String(v); } s = s === undefined ? 'undefined' : s; return s.length > (n || 300) ? s.slice(0, n || 300) + '…' : s; }

function vanWie(tab, r) {
  var n = [r.eigenaar, r.am, r.adviseur, r.door, r.voor].filter(Boolean).map(String);
  if (r.trajectId && tab !== 'Trajecten') { var t = (SEEDRIJEN.Trajecten || []).filter(function (x) { return String(x.id) === String(r.trajectId); })[0]; if (t) n = n.concat([t.am, t.adviseur].filter(Boolean).map(String)); }
  return n;
}
function eigenRij(tab, rol) { var L = SEEDRIJEN[tab] || []; return kopie(L.filter(function (r) { return vanWie(tab, r).indexOf(rol.naam) >= 0; })[0] || L[0] || null); }
function vreemdeRij(tab, rol, rnd) {
  var L = (SEEDRIJEN[tab] || []).filter(function (r) { var w = vanWie(tab, r); return w.length && w.indexOf(rol.naam) < 0; });
  if (!L.length) L = SEEDRIJEN[tab] || [];
  return L.length ? kopie(kies(rnd, L)) : null;
}
function eigenId(tab, rol) { var r = eigenRij(tab, rol); return r ? r.id : 'geen-id'; }
function vreemdId(tab, rol, rnd) { var r = vreemdeRij(tab, rol, rnd); return r ? r.id : 'geen-id'; }

// welk soort waarde hoort bij deze parameternaam (voor type-verwisselingen en de generieke basis)
var ID_TAB = { trajectId: 'Trajecten', talentId: 'Talenten', vacatureId: 'Vacatures', kansId: 'Kansen', schoolId: 'Scholen', persoonId: 'Personen', kandidaatId: 'Kandidaten', trackRunId: 'Acties' };
var ID_TAB_API = { apiTraject: 'Trajecten', apiProject: 'Trajecten', apiSchool: 'Scholen', apiSchoolSamenvatting: 'Scholen', apiPersoon: 'Personen', apiKans: 'Kansen', apiTaak: 'Acties', apiActieKlaar: 'Acties',
  apiTaakHeropen: 'Acties', apiTalent: 'Talenten', apiTalentPortaalLink: 'Talenten', apiTalentExport: 'Talenten', apiTalentAnonimiseer: 'Talenten', apiTalentDocumentLink: 'TalentDocumenten', apiDocumentOpslaan: 'Documenten' };
var OBJ_TAB = { apiTrajectOpslaan: 'Trajecten', apiGebruikerOpslaan: 'Gebruikers', apiSchoolOpslaan: 'Scholen', apiPersoonOpslaan: 'Personen', apiActiviteitOpslaan: 'Activiteiten', apiKansOpslaan: 'Kansen', apiTaakOpslaan: 'Acties',
  apiDoelOpslaan: 'Doelen', apiContentOpslaan: 'Content', apiVacatureOpslaan: 'Vacatures', apiKandidaatOpslaan: 'Kandidaten', apiFactuurOpslaan: 'Facturen', apiTalentOpslaan: 'Talenten', apiTalentDocumentOpslaan: 'TalentDocumenten',
  apiTalentSchoolOpslaan: 'TalentSchool', apiBeoordelingOpslaan: 'Beoordelingen' };
function soortParam(naam, api) {
  if (/^(obj|actie|extra|opties|filter|raster|bestand|koppeling)$/.test(naam)) return 'object';
  if (/^(lijst|rijen|talentIds|uitzonderingen|gesprek)$/.test(naam)) return 'lijst';
  if (/^(aan|mailen|maakTraject|nieuweCodeMaken|alleenBevestigen)$/.test(naam)) return 'bool';
  if (/^(aantal|pagina)$/.test(naam) || (naam === 'stap' && /Rapport$/.test(api))) return 'getal';
  if (/Id$|^id$/.test(naam)) return 'id';
  return 'tekst';
}
function idTabVoor(api, param, soort) { return param === 'id' ? ID_TAB_API[api] || null : ID_TAB[param] || null; }
function raster() { return { ma: [2, 1, 0], di: [0, 0, 0], wo: [2, 2, 2], do: [0, 0, 0], vr: [0, 0, 0], za: [0, 0, 0], zo: [0, 0, 2] }; }
function trackId() { try { return (ctx.STANDAARD_TRACKS || [])[0].id; } catch (e) { return 'track-1'; } }
function eerste(obj) { return Object.keys(obj || {})[0] || 'x'; }
function keuzelijstWaarden(k) { try { return ctx.keuzelijst(k).map(function (w) { return { waarde: w, oud: w }; }); } catch (e) { return [{ waarde: 'x' }]; } }

/* ---------- geldige basisargumenten per api (met rijen uit de seed; voor de rol zelf waar dat kan) ---------- */
var BASIS = {
  apiActieKlaar: function (rol) { return [eigenId('Acties', rol)]; },
  apiActieToevoegen: function () { return ['Fuzz-taak', 'midden', plusDagen(2), { tijd: '09:30', categorie: 'overig' }]; },
  apiVraag: function () { return ['Welke scholen hebben een lopend project?']; },
  apiZetHuisstijl: function () { return ['toon', 'Warm, concreet en zonder jargon.']; },
  apiMaakContent: function () { return [eerste(ctx.CONTENT_TYPES), 'Start NT2-ondersteuning bij een nieuwe school', 'kort'];  },
  apiTraject: function (rol) { return [eigenId('Trajecten', rol)]; },
  apiProject: function (rol) { return [eigenId('Trajecten', rol)]; },
  apiTrajectOpslaan: function (rol) { var t = eigenRij('Trajecten', rol); return [{ id: t.id, samenvatting: 'Fuzz-samenvatting', _oud: { samenvatting: t.samenvatting } }]; },
  apiNotitieToevoegen: function (rol) { return [eigenId('Trajecten', rol), 'Fuzz-notitie']; },
  apiExportAlles: function () { return ['Scholen', 0, 50]; },
  apiGebruikerOpslaan: function () { var g = kopie(SEEDRIJEN.Gebruikers[1]); return [{ id: g.id, naam: g.naam, email: g.email, team: g.team, rol: g.rol, actief: 'ja' }, false]; },
  apiMijlpalenOpslaan: function () { return [[{ pipeline: 'Scholen', mijlpaal: 'gesprek', volgorde: 1, kans: 20, dagenNorm: 14 }, { pipeline: 'Scholen', mijlpaal: 'voorstel', volgorde: 2, kans: 50, dagenNorm: 14 }]]; },
  apiSchool: function (rol) { return [eigenId('Scholen', rol)]; },
  apiPersoon: function (rol) { return [eigenId('Personen', rol)]; },
  apiSchoolOpslaan: function (rol) { var s = eigenRij('Scholen', rol); return [{ id: s.id, notities: 'Fuzz', _oud: { notities: s.notities } }]; },
  apiPersoonOpslaan: function (rol) { var p = eigenRij('Personen', rol); return [{ id: p.id, functie: 'Fuzz-functie', _oud: { functie: p.functie } }]; },
  apiVerwijder: function (rol) { return ['taak', eigenId('Acties', rol), {}]; },
  apiActiviteitToevoegen: function (rol) { return [{ vorm: 'call', schoolId: eigenId('Scholen', rol), onderwerp: 'Fuzz-gesprek', tekst: 'x' }]; },
  apiKans: function (rol) { return [eigenId('Kansen', rol)]; },
  apiKansOpslaan: function (rol) { var k = eigenRij('Kansen', rol); return [{ id: k.id, volgendeActie: 'Fuzz nabellen', _oud: { volgendeActie: k.volgendeActie } }, false]; },
  apiTaakOpslaan: function (rol) { var t = eigenRij('Acties', rol); return [{ id: t.id, prio: 'laag', _oud: { prio: t.prio } }]; },
  apiTaak: function (rol) { return [eigenId('Acties', rol)]; },
  apiTaakWeergavenOpslaan: function () { return [[{ naam: 'Fuzz', filter: { tag: 'rooster', weergave: 'komende', mijn: true } }]]; },
  apiHerinneringenZetten: function () { return [true]; },
  apiTrackOpslaan: function () { return [{ naam: 'Fuzz-track', omschrijving: 'x', stappen: [{ tekst: 'Stap 1', dagenNaStart: 1, prio: 'midden' }] }]; },
  apiTrackStart: function (rol) { return [trackId(), { schoolId: eigenId('Scholen', rol) }, plusDagen(1), rol.naam]; },
  apiAfspraakPlannen: function (rol) { return [{ titel: 'Fuzz-afspraak', start: plusDagen(3) + ' 10:00', duurMin: 30, schoolId: eigenId('Scholen', rol) }]; },
  apiAgenda: function () { return [plusDagen(-3), plusDagen(10)]; },
  apiRapport: function () { return ['maand', '', 0]; },
  apiActiviteiten: function () { return ['', '', '', '']; },
  apiArchiefTijdlijn: function (rol) { return ['school', eigenId('Scholen', rol)]; },
  apiDoelOpslaan: function (rol) { return [{ eigenaar: rol.naam, periode: 'maand', metric: 'gesprekken', doel: 10 }]; },
  apiExport: function () { return ['scholen']; },
  apiCapsuleMigratie: function () { return ['mijlpalen', 1]; },
  apiImporteer: function () { return ['scholen', [{ naam: 'Fuzzschool', plaats: 'Utrecht' }]]; },
  apiSchooljaarOpslaan: function () { return ['']; },
  apiKeuzelijstOpslaan: function () { var k = eerste(ctx.KEUZELIJSTEN); return [k, keuzelijstWaarden(k)]; },
  apiActiviteitOpslaan: function (rol) { var a = eigenRij('Activiteiten', rol); return [{ id: a.id, onderwerp: 'Fuzz gewijzigd', _oud: { onderwerp: a.onderwerp } }]; },
  apiTaakHeropen: function (rol) { return [eigenId('Acties', rol)]; },
  apiTrackStoppen: function () { var r = (SEEDRIJEN.Acties || []).filter(function (a) { return a.trackRunId; })[0]; return [r ? r.trackRunId : 'geen-run']; },
  apiTrackVerwijderen: function () { return [trackId()]; },
  apiHuisstijlOpslaan: function () { return [{ toon: 'Warm en concreet' }]; },
  apiContentOpslaan: function () { var c = kopie(SEEDRIJEN.Content[0]); return [{ id: c.id, tekst: 'Fuzz-tekst', _oud: { tekst: c.tekst } }]; },
  apiTagHernoem: function () { return ['rooster', 'roosters']; },
  apiVeldHernoem: function () { return ['bestuur', 'schoolbestuur']; },
  apiDocumentOpslaan: function () { return [SEEDRIJEN.Documenten[0].id, { titel: 'Fuzz-document', type: 'werkwijze' }]; },
  apiTalentscoutToewijzen: function (rol) { return [eigenId('Trajecten', rol), 'Sem de Boer']; },
  apiTaskforcePlannen: function (rol) { return [eigenId('Trajecten', rol), { start: plusDagen(2) + 'T10:00', duurMin: 45 }]; },
  apiTaskforceOpslaan: function (rol) { return [eigenId('Trajecten', rol), { hulpvraag: 'Fuzz-hulpvraag' }]; },
  apiVacatureOpslaan: function (rol) { var v = eigenRij('Vacatures', rol); return [{ id: v.id, profiel: 'Fuzz-profiel', _oud: { profiel: v.profiel } }]; },
  apiKandidaatOpslaan: function (rol) { var k = eigenRij('Kandidaten', rol); return [{ id: k.id, notitie: 'Fuzz-notitie', _oud: { notitie: k.notitie } }]; },
  apiTeamRapport: function (rol) { return ['maand', rol.team === 'management' ? 'consultancy' : rol.team, '', 0]; },
  apiFactuurOpslaan: function (rol) { var f = eigenRij('Facturen', rol); return [{ id: f.id, bijzonderheden: 'Fuzz', _oud: { bijzonderheden: f.bijzonderheden } }]; },
  apiFacturenMaken: function (rol) { return [eigenId('Trajecten', rol), { per: 'maand' }]; },
  apiFacturenExport: function () { return ['aangemaakt']; },
  apiSchoolSamenvatting: function (rol) { return [eigenId('Scholen', rol)]; },
  apiBrein: function () { return ['Welke taken staan open voor deze week?', []]; },
  apiBreinUitvoeren: function () { return [{ soort: 'maak_taak', invoer: { tekst: 'Fuzz-taak uit het Brein', deadline: plusDagen(1), prio: 'midden' } }]; },
  apiTalenten: function () { return [{}]; },
  apiTalent: function () { return ['tl1']; },
  apiTalentOpslaan: function () { var t = kopie(SEEDRIJEN.Talenten[0]); return [{ id: t.id, opleiding: 'Fuzz-opleiding', _oud: { opleiding: t.opleiding } }]; },
  apiTalentBeschikbaarheidOpslaan: function () { return [SEEDRIJEN.Talenten[2].id, raster(), [{ van: plusDagen(10), tot: plusDagen(12), soort: 'niet', reden: 'fuzz' }]]; },
  apiTalentPortaalLink: function () { return ['tl1', false]; },
  apiTalentDocumentOpslaan: function () { return [{ talentId: 'tl7', soort: 'vog', afgifte: plusDagen(-10), gecontroleerd: true }, null]; },
  apiTalentDocumentLink: function () { return [SEEDRIJEN.TalentDocumenten[0].id]; },
  apiTalentSchoolOpslaan: function () { return [{ talentId: 'tl11', schoolId: SEEDRIJEN.Scholen[1].id, status: 'neutraal', richting: 'school' }]; },
  apiBeoordelingOpslaan: function () { return [{ talentId: 'tl16', oordeel: 'goed', tekst: 'Fuzz-oordeel' }]; },
  apiMatch: function () { return ['v3']; },
  apiVoorstellen: function () { return ['v3', ['tl24'], 'Fuzz-voordracht']; },
  apiTalentRapport: function () { return ['maand', 0]; },
  apiTalentExport: function () { return ['tl14']; },
  apiTalentAnonimiseer: function () { return ['tl14']; },
  apiFinancien: function () { return [ctx.huidigSchooljaar()]; },
  apiExactImport: function () { return ['Factuurnummer;Factuurdatum;Debiteur;Bedrag;Betaaldatum\n20261033;01-10-2026;Noorderhof;1.950,00;', {}]; },
  apiPortaalToon: function () { return []; },
  apiPortaalBeschikbaarheid: function () { return [raster(), [], false]; }
};
function generiek(api, params, rol) {
  return params.map(function (p) {
    var s = soortParam(p, api);
    if (s === 'object') return {}; if (s === 'lijst') return []; if (s === 'bool') return true; if (s === 'getal') return 0;
    if (s === 'id') { var tab = idTabVoor(api, p, s); return tab ? eigenId(tab, rol) : 'x1'; }
    return 'test';
  });
}
function basisArgs(api, params, rol) { return BASIS[api] ? BASIS[api](rol) : generiek(api, params, rol); }

/* ---------- mutaties ---------- */
function objectParams(params, args) { var o = []; params.forEach(function (p, i) { if (isObj(args[i])) o.push(i); }); return o; }
function lijstParams(params, args) { var o = []; params.forEach(function (p, i) { if (args[i] instanceof Array) o.push(i); }); return o; }
function idParams(api, params) { var o = []; params.forEach(function (p, i) { if (soortParam(p, api) === 'id') o.push(i); }); return o; }
function kapot(obj, rnd) { var o = kopie(obj) || {}, ks = Object.keys(o).filter(function (k) { return k !== '_oud'; }); var k = ks.length ? kies(rnd, ks) : 'veld'; o[k] = atoom(rnd); return o; }
function metOud(obj, rnd, tab) {
  var o = kopie(obj) || {}, ks = Object.keys(o).filter(function (k) { return k !== 'id' && k !== '_oud'; });
  if (tab && SEEDRIJEN[tab] && SEEDRIJEN[tab].length) ks = ks.concat(Object.keys(SEEDRIJEN[tab][0]).filter(function (k) { return k !== 'id'; }));
  var k = ks.length ? kies(rnd, ks) : 'veld', v = rnd();
  o[k] = v < 0.5 ? 'fuzz-' + Math.floor(rnd() * 1000) : atoom(rnd);
  o._oud = v < 0.7 ? (function () { var x = {}; x[k] = kies(rnd, ['verkeerd', 0, null, [], {}, 'x'.repeat(50), '2026-13-45']); return x; })() : atoom(rnd);
  return o;
}
function nieuwKapot(tab, rol, rnd) { var o = eigenRij(tab, rol) || {}; delete o.id; delete o.aangemaakt; delete o.bijgewerkt; return kapot(o, rnd); }
var STRATEGIEEN = ['een-atoom', 'alles-atoom', 'object-kapot', 'object-oud', 'vreemd-id', 'onbekend', 'minder', 'meer', 'type-wissel', 'nieuw-kapot', 'lijst-kapot', 'vreemd-object'];
function muteer(api, params, rol, args, rnd) {
  var oParams = objectParams(params, args), lParams = lijstParams(params, args), iParams = idParams(api, params), tab = OBJ_TAB[api];
  var kan = STRATEGIEEN.filter(function (s) {
    if (s === 'object-kapot' || s === 'onbekend') return oParams.length > 0;
    if (s === 'object-oud' || s === 'nieuw-kapot' || s === 'vreemd-object') return !!tab && oParams.length > 0;
    if (s === 'vreemd-id') return iParams.length > 0 || api === 'apiVerwijder' || api === 'apiArchiefTijdlijn';
    if (s === 'lijst-kapot') return lParams.length > 0;
    if (s === 'minder') return params.length > 0;
    return true;
  });
  var s = kies(rnd, kan), uit = args.slice(), i;
  if (s === 'een-atoom') { i = Math.floor(rnd() * Math.max(1, params.length)); uit[i] = atoom(rnd); }
  else if (s === 'alles-atoom') { uit = params.map(function () { return atoom(rnd); }); }
  else if (s === 'object-kapot') { i = kies(rnd, oParams); uit[i] = kapot(uit[i], rnd); }
  else if (s === 'object-oud') { i = kies(rnd, oParams); uit[i] = metOud(uit[i], rnd, tab); }
  else if (s === 'onbekend') { i = kies(rnd, oParams); uit[i] = rnd() < 0.5 ? { onbekendeSleutel: 1, nog: 'x' } : { id: uit[i].id, onbekendeSleutel: atoom(rnd), __proto__x: 1 }; }
  else if (s === 'nieuw-kapot') { i = kies(rnd, oParams); uit[i] = nieuwKapot(tab, rol, rnd); }
  else if (s === 'vreemd-object') { i = kies(rnd, oParams); var vr = vreemdeRij(tab, rol, rnd) || {}; uit[i] = rnd() < 0.5 ? vr : { id: vr.id, notitie: 'overgenomen', _oud: {} }; if (rnd() < 0.3) uit[i] = kapot(uit[i], rnd); }
  else if (s === 'vreemd-id') {
    if (api === 'apiVerwijder') { var soort = kies(rnd, Object.keys(ctx.VERWIJDER_TABBLAD || {})); uit[0] = soort; uit[1] = vreemdId(ctx.VERWIJDER_TABBLAD[soort], rol, rnd); }
    else if (api === 'apiArchiefTijdlijn') { var so = kies(rnd, ['school', 'persoon', 'kans']); uit[0] = so; uit[1] = vreemdId({ school: 'Scholen', persoon: 'Personen', kans: 'Kansen' }[so], rol, rnd); }
    else { i = kies(rnd, iParams); var t2 = idTabVoor(api, params[i], 'id'); uit[i] = t2 ? vreemdId(t2, rol, rnd) : atoom(rnd); }
    if (oParams.length && rnd() < 0.5) { var oi = kies(rnd, oParams); if (uit[oi] && uit[oi].id && tab) uit[oi] = kopie(uit[oi]); if (uit[oi] && tab) uit[oi].id = vreemdId(tab, rol, rnd); }
  }
  else if (s === 'minder') { uit = uit.slice(0, Math.floor(rnd() * params.length)); }
  else if (s === 'meer') { var n = 1 + Math.floor(rnd() * 3); for (var k = 0; k < n; k++) uit.push(atoom(rnd)); }
  else if (s === 'lijst-kapot') { i = kies(rnd, lParams); var l = kopie(uit[i]); uit[i] = rnd() < 0.5 ? [atoom(rnd)] : (l.length && isObj(l[0]) ? [kapot(l[0], rnd)] : l.concat([atoom(rnd)])); }
  else if (s === 'type-wissel') {
    i = Math.floor(rnd() * Math.max(1, params.length)); var sp = soortParam(params[i] || '', api);
    uit[i] = sp === 'object' ? kies(rnd, [[], 'tekst', 0, [{}]]) : sp === 'lijst' ? kies(rnd, [{}, 'tekst', 1, { 0: 'a', length: 1 }]) : sp === 'bool' ? kies(rnd, ['ja', {}, [], 'false']) : sp === 'getal' ? kies(rnd, ['12', {}, [], 'NaN', '1e400']) : kies(rnd, [{}, [], { id: 'x' }, ['x'], 12]);
  }
  if (rnd() < 0.25 && params.length) { i = Math.floor(rnd() * params.length); if (i < uit.length) { uit[i] = atoom(rnd); s += '+een-atoom'; } }  // soms twee mutaties tegelijk
  return { args: uit, strategie: s };
}

/* ---------- classificatie ---------- */
var INTERN = /TypeError|ReferenceError|RangeError|SyntaxError|Cannot read|Cannot set|is not a function|of undefined|of null|\bundefined\b|is not iterable|is not defined|Unexpected token|Unexpected end of JSON|Unexpected non-whitespace|Invalid time value|Maximum call stack|Invalid array length|Invalid string length|\bat [\w.<>$]+ \(.*:\d+:\d+\)/;
var VERDACHT = /\bundefined\b|\bNaN\b|\[object Object\]/;
function classificeer(d, argsJson) {
  if (d.ok) {
    var s = JSON.stringify(d.result), p = s && VERDACHT.test(s) ? (VERDACHT.exec(s) || [''])[0] : '';
    // 'NaN' dat als tekst is meegegeven en terugkomt is geen bevinding; een object dat als tekst ('[object Object]') is opgeslagen wel (laag)
    return { klasse: 'ok', verdacht: p, inArgs: !!p && argsJson.indexOf(p) >= 0 };
  }
  var f = String(d.fout || '');
  if (INTERN.test(f)) return { klasse: 'intern', patroon: (INTERN.exec(f) || [''])[0] };
  return { klasse: 'net' };
}

/* ---------- de run ---------- */
var fouten = 0, totaal = { aanroepen: 0, ok: 0, net: 0, intern: 0, lek: 0, verdacht: 0, uitzondering: 0 }, interneFouten = [], lekken = [], verdachten = [], blokken = [], uniek = {}, uitzonderingenGebruikt = [];
var apisZonderParams = [], overgeslagen = [];
function log(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }

function roep(rol, api, args) {
  var argsJson = JSON.stringify(args);  // undefined wordt null, zoals bij de echte app over JSON
  var antwoord;
  try { antwoord = rol.code === 'portaal' ? ctx.demoPortaal(api, argsJson, PORTAAL_TOKEN) : ctx.demoRun(api, argsJson, rol.code); }
  catch (e) { return { ok: false, fout: 'BUITEN doPost: ' + String(e && e.stack || e) }; }  // doPost vangt alles; dit zou niet mogen
  try { return JSON.parse(antwoord); } catch (e2) { return { ok: false, fout: 'GEEN JSON: ' + String(antwoord).slice(0, 200) }; }
}

function blok(api, params, rol) {
  var rnd = prng(hash(SEED + '|' + api + '|' + rol.code)), n = params.length ? MAX : Math.min(MAX, MAX_ZONDER_PARAMS);
  var geen = geenOnderdelen(rol), tabsGeen = {}; geen.forEach(function (o) { (ONDERDEEL_TABS[o] || []).forEach(function (t) { tabsGeen[t] = o; }); });
  var st = { api: api, rol: rol.code, n: 0, ok: 0, net: 0, intern: 0, lek: 0, verdacht: 0, basisOk: null, ms: 0 }, tB = Date.now();
  for (var i = 0; i < n; i++) {
    herstel();
    var basis = basisArgs(api, params, rol), args, strategie;
    if (i === 0) { args = basis; strategie = 'basis'; }
    else if (!params.length) { args = [[atoom(rnd)], [{ onbekend: 1 }], [[1, 2]]][i - 1]; strategie = 'extra-argument'; }
    else { var mu = muteer(api, params, rol, basis, rnd); args = mu.args; strategie = mu.strategie; }
    var voor = tellingen(), d = roep(rol, api, args), na = tellingen(), c = classificeer(d, JSON.stringify(args) || '');
    st.n++; totaal.aanroepen++;
    if (i === 0) st.basisOk = !!d.ok;
    if (c.klasse === 'ok') { st.ok++; totaal.ok++; if (c.verdacht && !c.inArgs) { st.verdacht++; totaal.verdacht++; verdachten.push({ functie: api, rol: rol.code, i: i, strategie: strategie, patroon: c.verdacht, basis: i === 0, args: kort(args, 300) }); } }
    else if (c.klasse === 'net') { st.net++; totaal.net++; }
    else {
      st.intern++; totaal.intern++;
      var sleutel = api + '|' + String(d.fout).replace(/\d+/g, '#').slice(0, 80);
      var rec = { functie: api, rol: rol.code, i: i, strategie: strategie, patroon: c.patroon, args: kort(args, 600), melding: String(d.fout).slice(0, 400), uniek: !uniek[sleutel] };
      uniek[sleutel] = (uniek[sleutel] || 0) + 1; interneFouten.push(rec);
    }
    // rechten: rijen bijgekomen of verdwenen in een tabblad waar deze rol niets mag wijzigen?
    Object.keys(tabsGeen).forEach(function (t) {
      if (voor[t] === na[t]) return;
      var uitz = UITZONDERINGEN.filter(function (u) { return u.api === api && u.team === rol.team && u.tabs.indexOf(t) >= 0; })[0];
      if (uitz) { totaal.uitzondering++; uitzonderingenGebruikt.push({ functie: api, rol: rol.code, i: i, strategie: strategie, tabblad: t, voor: voor[t] - 1, na: na[t] - 1, args: kort(args, 400) }); return; }
      st.lek++; totaal.lek++;
      lekken.push({ functie: api, rol: rol.code, team: rol.team, i: i, strategie: strategie, onderdeel: tabsGeen[t], tabblad: t, voor: voor[t] - 1, na: na[t] - 1, antwoord: d.ok ? 'ok' : String(d.fout).slice(0, 200), args: kort(args, 600) });
    });
  }
  st.ms = Date.now() - tB; blokken.push(st);
  var samen = st.n + ' aanroepen: ' + st.ok + ' ok, ' + st.net + ' nette fouten' + (st.basisOk === false ? ', basis geweigerd' : '') + (st.ms > 2000 ? ', ' + st.ms + ' ms' : '');
  if (st.intern || st.lek) log(false, api + ' als ' + rol.code + ': ' + st.intern + ' interne fouten, ' + st.lek + ' rechtenlekken (' + samen + ')');
  else log(true, api + ' als ' + rol.code + ' (' + samen + ')');
}

API.forEach(function (a) {
  if (ALLEEN_API && a.naam !== ALLEEN_API) return;
  if (!a.params.length) apisZonderParams.push(a.naam);
  if (PORTAAL_FUNCTIES.indexOf(a.naam) >= 0) {  // via de koppelcode weigert doPost ze; het portaal zelf is de vijfde+1 "rol"
    if (!ALLEEN_ROL || ALLEEN_ROL === 'portaal') blok(a.naam, a.params.slice(1), PORTAAL_ROL);  // de token geeft doPost zelf mee
    return;
  }
  ROLLEN.forEach(function (rol) { if (!ALLEEN_ROL || rol.code === ALLEEN_ROL) blok(a.naam, a.params, rol); });
});
herstel();

/* ---------- samenvatting, begrenzing, json ---------- */
var looptijd = Math.round((Date.now() - T0) / 100) / 10;
console.log('begrenzing: maximaal ' + MAX + ' aanroepen per api × rol; ' + apisZonderParams.length + ' api\'s zonder parameters krijgen ' + MAX_ZONDER_PARAMS + ' aanroepen (zonder argumenten, met een atoom, een object en een lijst): ' + apisZonderParams.join(', '));
console.log('begrenzing: de Sheet gaat vóór elke aanroep terug naar de seed (geen ketens van aanroepen); argumenten reizen als JSON (undefined wordt null, zoals in de app)');
console.log('portaal: ' + PORTAAL_FUNCTIES.join(', ') + ' niet via de koppelcode (doPost weigert ze) maar via demoPortaal met het token van Ali, als rol "portaal" zonder enig recht');
console.log('overgeslagen: geen api (niets beëindigt het proces; mail, agenda, Drive, PDOK en Claude zijn in de demo gestubd, apiExportAlles en de triggers draaien gewoon mee)');
if (totaal.uitzondering) console.log('uitzonderingen (ontwerp, geen lek): ' + totaal.uitzondering + ' × ' + UITZONDERINGEN.map(function (u) { return u.api + ' als ' + u.team + ' → ' + u.tabs.join('/') + ' (' + u.reden + ')'; }).join('; '));
var uniekeFouten = Object.keys(uniek).length;
console.log('totaal: ' + totaal.aanroepen + ' aanroepen over ' + API.length + ' api\'s en ' + (ROLLEN.length + 1) + ' rollen in ' + looptijd + ' s: ' + totaal.ok + ' ok, ' + totaal.net + ' nette fouten, ' + totaal.intern + ' interne fouten (' + uniekeFouten + ' uniek), ' + totaal.lek + ' rechtenlekken, ' + totaal.verdacht + ' verdachte resultaten (undefined/NaN/[object Object] in een ok-antwoord dat niet uit de argumenten zelf komt; geen fout)');
if (verdachten.length) {
  var perV = {}; verdachten.forEach(function (v) { var k = v.functie + ' → ' + v.patroon + (v.basis ? ' (bij basisargumenten!)' : ''); perV[k] = perV[k] || { n: 0, bv: v.args }; perV[k].n++; });
  console.log('verdacht per api: ' + Object.keys(perV).map(function (k) { return k + ' ×' + perV[k].n; }).join('; '));
  var bijBasis = verdachten.filter(function (v) { return v.basis; });
  if (bijBasis.length) console.log('LET OP: verdacht resultaat bij geldige basisargumenten (geen fuzz-artefact): ' + bijBasis.map(function (v) { return v.functie + ' als ' + v.rol; }).join(', '));
}
if (interneFouten.length) {
  console.log('\nINTERNE FOUTEN (uniek, eerste voorkomen):');
  interneFouten.filter(function (f) { return f.uniek; }).forEach(function (f) { console.log('- ' + f.functie + ' als ' + f.rol + ' [' + f.strategie + '] args=' + kort(JSON.parse(f.args.replace(/…$/, '') || '[]'), 200) + '\n    → ' + f.melding.slice(0, 200)); });
}
if (lekken.length) {
  console.log('\nRECHTENLEKKEN:');
  lekken.forEach(function (l) { console.log('- ' + l.functie + ' als ' + l.rol + ' (' + l.team + '): ' + l.tabblad + ' ' + l.voor + ' → ' + l.na + ' rijen; antwoord: ' + l.antwoord + '; args=' + l.args.slice(0, 200)); });
}
var uitMap = path.join(R, 'test/shots/robuust');
try { fs.mkdirSync(uitMap, { recursive: true }); } catch (e) {}
var json = { datum: new Date().toISOString(), seed: SEED, max: MAX, maxZonderParams: MAX_ZONDER_PARAMS, looptijdS: looptijd, apis: API.length, rollen: CODES.concat(['portaal']), totaal: totaal, uniekeInterneFouten: uniekeFouten,
  begrenzing: ['max ' + MAX + ' aanroepen per api × rol', MAX_ZONDER_PARAMS + ' aanroepen voor api\'s zonder parameters', 'seed teruggezet vóór elke aanroep (geen ketens)', 'argumenten als JSON (undefined → null)'],
  apisZonderParams: apisZonderParams, portaalFuncties: PORTAAL_FUNCTIES, overgeslagen: [], uitzonderingen: UITZONDERINGEN, uitzonderingenGebruikt: uitzonderingenGebruikt, interneFouten: interneFouten, rechtenLekken: lekken, verdacht: verdachten, blokken: blokken,
  apiLijst: API.map(function (a) { return a.naam + '(' + a.params.join(', ') + ')'; }) };
fs.writeFileSync(path.join(uitMap, 'fuzz.json'), JSON.stringify(json, null, 1));
console.log('json: test/shots/robuust/fuzz.json');
console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
