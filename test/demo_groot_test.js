// v7.4: test van het demoprofiel "groot" (demo/demo-groot.js, ?demo=1&schaal=groot) zonder browser: demo-backend.js + Code.gs + demo-groot.js
// in een vm-context met alleen console van buiten (zoals test/node_rooktest.js; anders falen instanceof-checks over realms).
// Controleert: aantallen binnen bandbreedtes, determinisme (hash van alle tabbladen), geen Math.random tijdens het opbouwen, elke api* als
// sophie, lars, femke en sem zonder interne fout en onder 500 ms, de invarianten van Financiën per project, een begrensde dagelijkse talentrun,
// geen lege namen of 'undefined', de dienstenexport in de map XPS-export, de bewaarwijze in sessionStorage (alleen wijzigingen; heen en terug
// gelijk; een kapotte stand geeft een verse demo) en dat de standaardseed ongewijzigd blijft.
// Gebruik: node test/demo_groot_test.js  → "ALLES GOED" (exitcode 0) of "FOUTEN: n" (exitcode 1). CODE_GS=<pad> laadt een andere Code.gs,
// DEMO_GROOT=<pad> een andere demo-groot.js. PRIVACY_LIJST=<pad> (sectie 10) zet de privacycontrole tegen de eigen exports aan: een verboden
// lijst die buiten de repo uit de echte exports wordt gemaakt en nooit in de repo komt; de test drukt daarvan alleen tellingen af.
var vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
var BRON_DEMO = fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8'), BRON_CODE = fs.readFileSync(process.env.CODE_GS || path.join(R, 'backend/Code.gs'), 'utf8');
var PAD_GROOT = process.env.DEMO_GROOT || path.join(R, 'demo/demo-groot.js');
var BRON_GROOT = fs.existsSync(PAD_GROOT) ? fs.readFileSync(PAD_GROOT, 'utf8') : '';
var fouten = 0, T0 = Date.now();
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function info(wat) { console.log('info ' + wat); }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

// Een context; klok = vaste tijd (ms) of null voor de echte klok; toeval = vaste reeks voor Math.random (voor de standaardseed, die nieuwId gebruikt)
function context(opties) {
  opties = opties || {};
  var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);
  if (opties.klok) vm.runInContext('(function () { var E = Date, T = ' + opties.klok + '; globalThis.__zetKlok = function (t) { T = t; }; var P = new Proxy(E, { construct: function (t, a, nt) { if (!a.length) a = [T]; return Reflect.construct(t, a, nt === P ? t : nt); },' +
    ' apply: function (t) { return String(new t(T)); }, get: function (t, k) { if (k === "now") return function () { return T; }; return Reflect.get(t, k); } }); Date = P; })();', ctx, { filename: 'klok.js' });
  if (opties.toeval) vm.runInContext('(function () { var s = ' + opties.toeval + ' >>> 0; Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();', ctx);
  vm.runInContext(BRON_DEMO + '\n;\n' + BRON_CODE + (opties.zonderGroot ? '' : '\n;\n' + BRON_GROOT), ctx, { filename: 'demo.js' });
  return ctx;
}
function staat(ctx) { var o = {}; Object.keys(ctx._demoBladen).sort().forEach(function (n) { o[n] = ctx._demoBladen[n].rijen; }); return JSON.stringify(o); }
var nu = new Date(), KLOK = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), 10, 0).getTime();

eis(!!BRON_GROOT, 'demo/demo-groot.js bestaat');
if (!BRON_GROOT) { console.log('FOUTEN: ' + fouten); process.exit(1); }

/* ---- 1. opbouwen, zonder Math.random, en deterministisch ---- */
var A = context({ klok: KLOK });
var randomTeller = 0; vm.runInContext('(function () { var echt = Math.random; Math.random = function () { globalThis.__random = (globalThis.__random || 0) + 1; return echt(); }; })();', A);
var tA = Date.now(), stA = A.demoGrootStart(''), msA = Date.now() - tA;
randomTeller = A.__random || 0;
eis(stA === 'gevuld', 'demoGrootStart zonder bewaarde stand bouwt het profiel op (' + msA + ' ms)');
eis(randomTeller === 0, 'geen Math.random tijdens het opbouwen (aanroepen: ' + randomTeller + ')');
eis(msA < 4000, 'opbouwen duurt minder dan 4 s (' + msA + ' ms)');
var B = context({ klok: KLOK }); B.demoGrootStart('');
var hA = hash(staat(A)), hB = hash(staat(B));
eis(hA === hB, 'twee keer opbouwen geeft dezelfde gegevens (hash ' + hA + ')');
var C = context({ klok: KLOK + 3 * 86400000 }); C.demoGrootStart('');
eis(hash(staat(C)) !== hA, 'drie dagen later andere datums (relatief aan vandaag)');

/* ---- 2. aantallen binnen de bandbreedtes (verdelingen afgerond, met ruis) ---- */
var G = context(); G.demoGrootStart('');
var L = function (n) { return G.lees(n); }, groot = function (n, pre) { return L(n).filter(function (r) { return String(r.id).indexOf(pre) === 0; }); };
var sj = G.huidigSchooljaar(), tel = G.DEMO_GROOT.telling;
function band(wat, n, lo, hi) { eis(n >= lo && n <= hi, wat + ': ' + n + ' (verwacht ' + lo + '–' + hi + ')'); }
var S = groot('Scholen', 'gs'), TR = groot('Trajecten', 'gt'), K = groot('Kansen', 'gk'), TL = groot('Talenten', 'gtl'), TU = L('TalentUren').filter(function (u) { return /^gt/.test(u.trajectId); });
var F = groot('Facturen', 'gf'), V = groot('Vacatures', 'gv'), KD = groot('Kandidaten', 'gc'), AC = groot('Activiteiten', 'ga');
band('scholen (groot)', S.length, 100, 200); band('waarvan particulier', S.filter(function (s) { return s.type === 'particulier'; }).length, 10, 40);
var TRh = TR.filter(function (t) { return t.schooljaar === sj; }), TRv = TR.filter(function (t) { return t.schooljaar !== sj; });
// lopend en gepland hangen af van het moment in het schooljaar: in augustus is bijna alles nog gepland, vanaf half juni is er geen nieuwe start meer
var j1 = Number(sj.slice(0, 4)), vandaagS = G.datumStr(G.plusDagen(0)), nLopend = TRh.filter(function (t) { return t.status === 'bezig'; }).length, nGepland = TRh.filter(function (t) { return t.status === 'opstart'; }).length;
band('projecten dit schooljaar', TRh.length, 40, 75);
if (vandaagS >= j1 + '-09-15' && vandaagS <= (j1 + 1) + '-06-01') band('waarvan lopend', nLopend, 30, 65); else info('lopend ' + nLopend + ' (begin of eind van het schooljaar: geen eis)');
if (vandaagS >= j1 + '-09-15' && vandaagS <= (j1 + 1) + '-05-01') band('waarvan gepland', nGepland, 5, 14); else if (vandaagS < j1 + '-09-15') band('waarvan gepland (begin schooljaar)', nGepland, 5, 75); else info('gepland ' + nGepland + ' (eind van het schooljaar: geen eis)');
band('projecten vorig schooljaar', TRv.length, 90, 170);
var prods = {}; TRh.forEach(function (t) { prods[t.traject] = 1; }); band('producten in de mix dit schooljaar', Object.keys(prods).length, 6, 10);
var fases = {}; K.forEach(function (k) { fases[k.fase] = (fases[k.fase] || 0) + 1; });
band('kansen gewonnen', fases.gewonnen || 0, 110, 240); band('kansen verloren', fases.verloren || 0, 25, 60);
eis(['lead', 'gesprek', 'voorstel', 'onderhandeling'].every(function (f) { return fases[f] > 0; }), 'open kansen in alle fases: ' + JSON.stringify(fases));
var st = {}; TL.forEach(function (t) { st[t.status] = (st[t.status] || 0) + 1; });
band('talenten', TL.length, 620, 950); band('actief', st.actief || 0, 200, 340); band('slapend', st.slapend || 0, 350, 580); band('aangemeld', st.aangemeld || 0, 15, 35);
band('weekregels TalentUren bij groot-projecten', TU.length, 700, 4000);
var weken = {}; TU.forEach(function (u) { weken[u.week] = 1; });
var dezeWeek = G.isoWeekStr(G.plusDagen(0)), oudste = G.isoWeekStr(G.plusDagen(-7 * 27));
eis(Object.keys(weken).length >= 15 && Object.keys(weken).every(function (w) { return w < dezeWeek && w >= oudste; }), 'weekuren in ' + Object.keys(weken).length + ' weken, allemaal binnen de laatste 26 weken');
band('termijnen (groot)', F.length, 700, 1800);
var credits = F.filter(function (f) { return Number(f.bedrag) < 0; });
band('creditnota\'s', credits.length, 6, 60);
eis(credits.every(function (c) { return F.some(function (f) { return f.trajectId === c.trajectId && Number(f.bedrag) === -Number(c.bedrag) && f.verzonden && f.verzonden <= c.verzonden && f.status === 'betaald'; }); }), 'elke creditnota heft een eerdere termijn van hetzelfde project op (afgeletterd)');
var nrs = F.filter(function (f) { return f.factuurnummer; }).map(function (f) { return Number(f.factuurnummer); }).sort(function (a, b) { return a - b; });
eis(nrs.length > 400 && nrs.every(function (n, i) { return i === 0 || n === nrs[i - 1] + 1; }) && String(nrs[0]).length === 8, 'factuurnummers: 8 cijfers, doorlopend zonder gaten (' + nrs.length + ')');
var verzonden = F.filter(function (f) { return f.verzonden; }).sort(function (a, b) { return String(a.verzonden).localeCompare(String(b.verzonden)); });
eis(verzonden.every(function (f, i) { return i === 0 || Number(f.factuurnummer) > Number(verzonden[i - 1].factuurnummer) || f.verzonden === verzonden[i - 1].verzonden; }), 'factuurnummers op volgorde van verzenden');
var bedragen = F.filter(function (f) { return Number(f.bedrag) > 0; }).map(function (f) { return Number(f.bedrag); }).sort(function (a, b) { return a - b; });
var mediaan = bedragen[Math.floor(bedragen.length / 2)];
eis(mediaan > 800 && mediaan < 6000 && bedragen[bedragen.length - 1] < 70000, 'factuurbedragen breed en begrensd (mediaan ' + Math.round(mediaan) + ', hoogste < 70.000)');
band('vacatures (groot)', V.length, TRh.length, 260); band('kandidaten (groot)', KD.length, 400, 1200); band('activiteiten (groot)', AC.length, 1800, 5500);
eis(KD.every(function (k) { return TL.some(function (t) { return t.id === k.talentId; }); }), 'elke kandidaat hangt aan een profiel in het talentbestand');
eis(TRh.filter(function (t) { return t.status === 'bezig'; }).every(function (t) { return KD.some(function (k) { return k.trajectId === t.id && ['geplaatst', 'klaar voor start', 'gestopt'].indexOf(k.status) >= 0; }); }), 'elk lopend project heeft geplaatste kandidaten');
eis(TRh.filter(function (t) { return !t.am; }).length >= 1, 'datakwaliteit: minstens één project zonder accountmanager');
eis(L('Gebruikers').length === 9 && G.DEMO_MENSEN.length === 10, 'dezelfde tien demogebruikers (negen in Gebruikers plus de beheerder)');

/* ---- 3. namen, teksten en e-mail ---- */
var verdacht = [], leeg = [];
Object.keys(G._demoBladen).forEach(function (n) { G._demoBladen[n].rijen.forEach(function (r, i) { r.forEach(function (c, j) { if (typeof c === 'string' && /\bundefined\b|\bNaN\b|\[object Object\]/.test(c)) verdacht.push(n + ' rij ' + i + ' kolom ' + j); }); }); });
var NAMEN = { Scholen: ['naam', 'plaats'], Personen: ['voornaam', 'achternaam'], Talenten: ['voornaam', 'achternaam'], Kandidaten: ['naam'], Kansen: ['naam', 'school'], Trajecten: ['school', 'traject'], Vacatures: ['titel'], Acties: ['tekst'], Activiteiten: ['onderwerp'] };
Object.keys(NAMEN).forEach(function (n) { L(n).forEach(function (r) { NAMEN[n].forEach(function (k) { if (!String(r[k] || '').trim()) leeg.push(n + '.' + k + ' ' + r.id); }); }); });
eis(!verdacht.length, 'geen undefined, NaN of [object Object] in een cel' + (verdacht.length ? ': ' + verdacht.slice(0, 5).join('; ') : ''));
eis(!leeg.length, 'geen lege naam' + (leeg.length ? ': ' + leeg.slice(0, 5).join('; ') : ''));
var mails = []; ['Scholen', 'Personen', 'Talenten', 'Kandidaten'].forEach(function (n) { L(n).forEach(function (r) { if (r.email) mails.push(String(r.email)); }); });
eis(mails.length > 900 && mails.every(function (m) { return /\.example$/.test(m); }), 'alle e-mailadressen eindigen op .example (' + mails.length + ')');
var namen = TL.filter(function (t) { return t.status !== 'uitgeschreven'; }).map(function (t) { return t.voornaam + ' ' + t.achternaam; });
eis(namen.length === Object.keys(namen.reduce(function (o, x) { o[x] = 1; return o; }, {})).length, 'talentnamen zijn uniek');

/* ---- 4. XPS: de dienstenexport per dienst in de map XPS-export ---- */
var xps = []; var it = G._demoDrive.mappen['demo-xps'].getFiles(); while (it.hasNext()) xps.push(it.next());
var dienstBestand = xps.filter(function (f) { return /diensten/.test(f.getName()); })[0];
eis(!!dienstBestand, 'een dienstenexport in de map XPS-export');
if (dienstBestand) {
  var rijen = G._demoParseCsv(dienstBestand.getBlob().getDataAsString(), ';'), kop = rijen[0], STATUSSEN = ['Ingeroosterd', 'Afwezig', 'Afwezig (ziek)', 'Geannuleerd (intern)', 'Geannuleerd (klant)', 'Geannuleerd', 'Reserve'];
  eis(['Datum', 'Datum: Van', 'Datum: Tot', 'Gewerkte tijd', 'Uitgevoerd door', 'Omschrijving', 'Status', 'Project', 'Projectleider', 'Accountnummer'].every(function (k, i) { return kop.indexOf(k) >= 0; }) && !kop.some(function (k) { return /salaris/i.test(k); }), 'kolommen volgens het contract, met Accountnummer en zonder salaris: ' + kop.join(';'));
  var c = function (k) { return kop.indexOf(k); }, data = rijen.slice(1), xpsIds = {}; TL.forEach(function (t) { if (t.xpsId) xpsIds[t.xpsId] = 1; });
  // de laatste twee weken; zijn dat vakantieweken, dan de twee laatste weken waarin gewerkt is (binnen twaalf weken)
  var van = G.datumStr(G.plusDagen(-7 * 13)), tot = G.datumStr(G.plusDagen(-1)), wekenX = {};
  data.forEach(function (r) { wekenX[G.isoWeekStr(G.parseDatum(r[c('Datum')]))] = 1; });
  eis(data.length >= 20, 'dienstenexport met ' + data.length + ' diensten');
  eis(data.every(function (r) { return r[c('Datum')] >= van && r[c('Datum')] <= tot && /^\d{4}-\d{2}-\d{2}$/.test(r[c('Datum')]); }) && Object.keys(wekenX).length <= 2, 'alle diensten in twee voorbije weken (' + Object.keys(wekenX).sort().join(', ') + '), datum als yyyy-mm-dd');
  var wekenRecent = {}; [1, 2].forEach(function (k) { wekenRecent[G.isoWeekStr(G.plusDagen(-7 * k))] = 1; });
  var tuRecent = TU.filter(function (u) { return wekenRecent[u.week]; }).reduce(function (a, u) { return a + Number(u.diensten); }, 0);
  if (tuRecent >= 30) eis(Object.keys(wekenX).every(function (w) { return wekenRecent[w] || w === G.isoWeekStr(G.plusDagen(0)); }), 'buiten de vakanties gaat de export over de laatste twee weken');
  eis(data.every(function (r) { return STATUSSEN.indexOf(r[c('Status')]) >= 0 && /^\d+(,\d+)?$/.test(r[c('Gewerkte tijd')]); }), 'statussen uit de praktijk en een decimale gewerkte tijd');
  var onbekend = data.filter(function (r) { return !xpsIds[r[c('Accountnummer')]]; });
  eis(onbekend.length === 1, 'op één na hoort elk accountnummer bij een talent (' + onbekend.length + ' onbekend)');
  var I = context(); I.demoGrootStart('');
  var imp = JSON.parse(I.demoRun('apiTalentUrenImport', '[]', 'demo-sophie'));
  // gekoppeld: de nieuwe verwerking per dienst telt het zelf; de oude zet bij elke weekregel de importdatum
  var vandaagI = I.datumStr(I.plusDagen(0)), gekoppeld = !imp.ok ? 0 : typeof imp.result.gekoppeld === 'number' ? imp.result.gekoppeld : I.lees('TalentUren').filter(function (u) { return /^gt/.test(u.trajectId) && String(u.geimporteerd).slice(0, 10) === vandaagI; }).length;
  eis(imp.ok && imp.result.regels >= data.length && (typeof imp.result.gekoppeld === 'number' ? gekoppeld >= data.length / 2 : gekoppeld > 0), 'Beheer → XPS-uren importeren koppelt de dienstenexport aan talenten (' + (imp.ok ? imp.result.regels + ' regels gelezen, ' + gekoppeld + ' gekoppeld' : imp.fout) + ')');
  var exportWeken = {}; data.forEach(function (r) { exportWeken[I.isoWeekStr(I.parseDatum(r[c('Datum')]))] = 1; });
  eis(I.lees('TalentUren').filter(function (u) { return exportWeken[u.week] && /^gt/.test(u.trajectId); }).length > 0, 'de weekregels van die weken hangen aan projecten (Projectnummer = xpsProject)');
  eis(imp.ok && (imp.result.onbekend || []).some(function (o) { return o.xpsId === 'x69999' || o.xpsId === 'X69999'; }), 'het onbekende account komt in de melding');
  // de verwerking per dienst (afwezig, ziek, geannuleerd) bouwt de importagent; tot die er is telt de import ze als gewerkt
  var ziek = data.filter(function (r) { return r[c('Status')] !== 'Ingeroosterd'; }).length;
  if (imp.ok) {
    if (imp.result.overgeslagen && typeof imp.result.overgeslagen === 'object' && !Array.isArray(imp.result.overgeslagen)) info('verwerking per dienst aanwezig: ' + JSON.stringify(imp.result.overgeslagen) + ' overgeslagen; ' + ziek + ' diensten in de export zijn niet ingeroosterd');
    else info('LET OP: de urenimport kent nog geen verwerking per dienst; ' + ziek + ' afwezige, zieke of geannuleerde diensten tellen als gewerkt');
  }
}

/* ---- 5. de dagelijkse talentrun: een handvol mails en overgangen, geen honderden ---- */
(function () {
  var D = context(); D.demoGrootStart(''); D.GEBRUIKER = null; D._demoVerzonden.length = 0;
  var voor = {}; D.lees('Talenten').forEach(function (t) { voor[t.id] = t.status; });
  var run = D.talentDagelijksTrigger(), mails = D._demoVerzonden.length, overgangen = D.lees('Talenten').filter(function (t) { return voor[t.id] && voor[t.id] !== t.status; }).length;
  eis(Object.keys(run).every(function (k) { return !/^fout/.test(String(run[k])); }), 'talentDagelijksTrigger zonder fout: ' + JSON.stringify(run));
  var vogMails = typeof run.vog === 'number' ? run.vog : 0;  // op 1 mei en 1 juni krijgt iedereen zonder verse VOG een mail (zo bedoeld)
  eis(mails - vogMails <= 25, 'hoogstens 25 mails buiten de VOG-ronde (' + (mails - vogMails) + ')');
  eis(overgangen <= 8, 'hoogstens 8 statusovergangen (' + overgangen + ')');
  eis(typeof run.peiling === 'number' && run.peiling >= 1 && run.peiling <= 15, 'peiling: een paar talenten zijn vandaag aan de beurt (' + run.peiling + ')');
  eis(D.talentDagelijksTrigger().peiling === 0, 'een tweede run peilt niemand opnieuw');
})();

/* ---- 6. Financiën: invarianten per project ---- */
(function () {
  G.GEBRUIKER = null; G._LEES = {};
  var D = G.financienData(), fout = [];
  G.lees('Trajecten').forEach(function (t) {
    var Fp = G.financienProject(t, D.fac[t.id] || [], D.uren[t.id] || [], G.termijnDagenVan(t, D)), som = Fp.ongepland, somKas = Fp.ongepland;
    Object.keys(Fp.per.prognose).forEach(function (m) { som += Fp.per.prognose[m]; });
    Object.keys(Fp.per.prognoseKas).forEach(function (m) { somKas += Fp.per.prognoseKas[m]; });
    if (som !== Fp.contract || somKas !== Fp.contract) fout.push(t.id + ' prognose ' + som + '/' + somKas + ' ≠ contract ' + Fp.contract);
    if (Fp.gefactureerd + Fp.nogTeFactureren !== Fp.contract) fout.push(t.id + ' gefactureerd + nog te factureren ≠ contract');
    if (Fp.openstaand !== Fp.gefactureerd - Fp.ontvangen) fout.push(t.id + ' openstaand');
  });
  eis(!fout.length, 'invariant per project (' + G.lees('Trajecten').length + '): som prognose = contract, gefactureerd + nog te factureren = contract' + (fout.length ? ': ' + fout.slice(0, 4).join('; ') : ''));
  var Fi = JSON.parse(G.demoRun('apiFinancien', '[]', 'demo-sophie')).result;
  var somS = Fi.scholen.reduce(function (a, s) { return a + s.contract; }, 0);
  eis(Fi.scholen.length >= 40 && somS === Fi.totalen.contract && Fi.totalen.gefactureerd + Fi.totalen.nogTeFactureren === Fi.totalen.contract, 'apiFinancien: ' + Fi.scholen.length + ' scholen, totalen sluiten');
  eis(Fi.totalen.ontvangen > 0 && Fi.totalen.openstaand > 0 && Fi.totalen.ouderdom['0-30'] > 0, 'ontvangen, openstaand en ouderdom gevuld');
  var geleverd = Fi.reeksen.geleverd.reduce(function (a, b) { return a + b; }, 0);
  if (!geleverd) { var Fv = JSON.parse(G.demoRun('apiFinancien', JSON.stringify([(Number(sj.slice(0, 4)) - 1) + '-' + sj.slice(0, 4)]), 'demo-sophie')).result; geleverd = Fv.reeksen.geleverd.reduce(function (a, b) { return a + b; }, 0); }
  eis(geleverd > 0, 'geleverd (uren × tarief) gevuld (dit of, aan het begin van het schooljaar, vorig schooljaar)');
})();

/* ---- 7. elke api als sophie, lars, femke en sem: geen interne fout, elke aanroep < 500 ms ---- */
var INTERN = /TypeError|ReferenceError|RangeError|SyntaxError|Cannot read|Cannot set|is not a function|of undefined|of null|\bundefined\b|is not iterable|is not defined|Unexpected token|Invalid time value|Maximum call stack|Invalid array length|\bat [\w.<>$]+ \(.*:\d+:\d+\)/;
(function () {
  var X = context(); X.demoGrootStart('');
  var BASIS_BLADEN = {}, BASIS_PROPS = {}; Object.keys(X._demoBladen).forEach(function (n) { BASIS_BLADEN[n] = X._demoBladen[n].rijen.map(function (r) { return r.slice(); }); }); Object.keys(X._demoProps).forEach(function (k) { BASIS_PROPS[k] = X._demoProps[k]; });
  function herstel() {
    Object.keys(X._demoBladen).forEach(function (n) { if (!BASIS_BLADEN[n]) { delete X._demoBladen[n]; return; } var r = X._demoBladen[n].rijen; r.length = 0; BASIS_BLADEN[n].forEach(function (x) { r.push(x.slice()); }); });
    Object.keys(X._demoProps).forEach(function (k) { if (!(k in BASIS_PROPS)) delete X._demoProps[k]; }); Object.keys(BASIS_PROPS).forEach(function (k) { X._demoProps[k] = BASIS_PROPS[k]; });
    X._demoCache = {}; X._demoVerzonden.length = 0; X._LEES = {}; X._BLAD = {}; X.GEBRUIKER = null;
  }
  var api = [], re = /^function (api[A-Z]\w*)\s*\(([^)]*)\)/gm, m; while ((m = re.exec(BRON_CODE))) if (typeof X[m[1]] === 'function' && (X.PORTAAL_FUNCTIES || []).indexOf(m[1]) < 0) api.push({ naam: m[1], params: m[2].split(',').map(function (p) { return p.trim(); }).filter(Boolean) });
  var rijenVan = function (n) { return X.lees(n); }, d = function (n) { return X.datumStr(X.plusDagen(n)); };
  function eigen(tab, naam) { var l = rijenVan(tab), g = l.filter(function (r) { return /^g/.test(String(r.id)) && [r.eigenaar, r.am, r.adviseur, r.door, r.talentscout, r.voor].indexOf(naam) >= 0; }); return g[0] || l.filter(function (r) { return /^g/.test(String(r.id)); })[0] || l[0] || {}; }
  function project(naam) { return eigen('Trajecten', naam); }
  var B = {
    apiActieKlaar: function (n) { return [eigen('Acties', n).id]; }, apiTaak: function (n) { return [eigen('Acties', n).id]; }, apiTaakHeropen: function (n) { return [eigen('Acties', n).id]; },
    apiActieToevoegen: function () { return ['Proeftaak groot', 'midden', d(2), { tijd: '09:30' }]; }, apiMaakContent: function () { return [Object.keys(X.CONTENT_TYPES || { linkedin: 1 })[0], 'Start bij een nieuwe school', 'kort']; },
    apiTrajectOpslaan: function (n) { var t = project(n); return [{ id: t.id, samenvatting: 'Proef', _oud: { samenvatting: t.samenvatting } }]; }, apiExportAlles: function () { return ['Talenten', 0, 200]; },
    apiGebruikerOpslaan: function () { var g = rijenVan('Gebruikers')[1]; return [{ id: g.id, naam: g.naam, email: g.email, team: g.team, rol: g.rol, actief: 'ja' }, false]; },
    apiMijlpalenOpslaan: function () { return [[{ pipeline: 'Scholen', mijlpaal: 'gesprek', volgorde: 1, kans: 20, dagenNorm: 14 }]]; },
    apiSchool: function (n) { return [eigen('Scholen', n).id]; }, apiSchoolSamenvatting: function (n) { return [eigen('Scholen', n).id]; }, apiPersoon: function (n) { return [eigen('Personen', n).id]; },
    apiSchoolOpslaan: function (n) { var s = eigen('Scholen', n); return [{ id: s.id, notities: 'Proef', _oud: { notities: s.notities } }]; }, apiPersoonOpslaan: function (n) { var p = eigen('Personen', n); return [{ id: p.id, functie: 'Proef', _oud: { functie: p.functie } }]; },
    apiVerwijder: function (n) { return ['taak', eigen('Acties', n).id, {}]; }, apiActiviteitToevoegen: function (n) { return [{ vorm: 'call', schoolId: eigen('Scholen', n).id, onderwerp: 'Proefgesprek' }]; },
    apiKans: function (n) { return [eigen('Kansen', n).id]; }, apiKansOpslaan: function (n) { var k = eigen('Kansen', n); return [{ id: k.id, volgendeActie: 'Proef', _oud: { volgendeActie: k.volgendeActie } }, false]; },
    apiTaakOpslaan: function (n) { var t = eigen('Acties', n); return [{ id: t.id, prio: 'laag', _oud: { prio: t.prio } }]; }, apiTaakWeergavenOpslaan: function () { return [[{ naam: 'Proef', filter: { weergave: 'komende' } }]]; },
    apiHerinneringenZetten: function () { return [true]; }, apiTrackOpslaan: function () { return [{ naam: 'Proeftrack', stappen: [{ tekst: 'Stap 1', dagenNaStart: 1, prio: 'midden' }] }]; },
    apiTrackStart: function (n) { return [((X.STANDAARD_TRACKS || [])[0] || {}).id || 'track-1', { schoolId: eigen('Scholen', n).id }, d(1), n]; }, apiAfspraakPlannen: function (n) { return [{ titel: 'Proefafspraak', start: d(3) + ' 10:00', duurMin: 30, schoolId: eigen('Scholen', n).id }]; },
    apiAgenda: function () { return [d(-3), d(10)]; }, apiRapport: function () { return ['kwartaal', '', 0]; }, apiActiviteiten: function () { return ['', d(-90), d(0), '']; }, apiArchiefTijdlijn: function (n) { return ['school', eigen('Scholen', n).id]; },
    apiDoelOpslaan: function (n) { return [{ eigenaar: n, periode: 'maand', metric: 'gesprekken', doel: 10 }]; }, apiExport: function () { return ['scholen']; }, apiCapsuleMigratie: function () { return ['mijlpalen', 1]; },
    apiImporteer: function () { return ['scholen', [{ naam: 'Proefschool', plaats: 'Utrecht' }]]; }, apiSchooljaarOpslaan: function () { return ['']; },
    apiKeuzelijstOpslaan: function () { var k = Object.keys(X.KEUZELIJSTEN)[0]; return [k, X.keuzelijst(k).map(function (w) { return { waarde: w, oud: w }; })]; },
    apiActiviteitOpslaan: function (n) { var a = eigen('Activiteiten', n); return [{ id: a.id, onderwerp: 'Proef', _oud: { onderwerp: a.onderwerp } }]; }, apiTrackStoppen: function () { return ['geen-run']; }, apiTrackVerwijderen: function () { return ['geen-track']; },
    apiHuisstijlOpslaan: function () { return [{ toon: 'Warm en concreet' }]; }, apiContentOpslaan: function () { var c = rijenVan('Content')[0]; return [{ id: c.id, tekst: 'Proef', _oud: { tekst: c.tekst } }]; },
    apiTagHernoem: function () { return ['rooster', 'roosters']; }, apiVeldHernoem: function () { return ['bestuur', 'schoolbestuur']; }, apiDocumentOpslaan: function () { return [rijenVan('Documenten')[0].id, { titel: 'Proef', type: 'werkwijze' }]; },
    apiTalentscoutToewijzen: function (n) { return [project(n).id, 'Sem de Boer']; }, apiTaskforcePlannen: function (n) { return [project(n).id, { start: d(2) + 'T10:00', duurMin: 45 }]; }, apiTaskforceOpslaan: function (n) { return [project(n).id, { hulpvraag: 'Proef' }]; },
    apiVacatureOpslaan: function (n) { var v = eigen('Vacatures', n); return [{ id: v.id, profiel: 'Proef', _oud: { profiel: v.profiel } }]; }, apiKandidaatOpslaan: function (n) { var k = eigen('Kandidaten', n); return [{ id: k.id, notitie: 'Proef', _oud: { notitie: k.notitie } }]; },
    apiTeamRapport: function (n, team) { return ['kwartaal', team === 'management' ? 'talent' : team, '', 0]; }, apiProject: function (n) { return [project(n).id]; },
    apiFactuurOpslaan: function (n) { var f = eigen('Facturen', n); return [{ id: f.id, bijzonderheden: 'Proef', _oud: { bijzonderheden: f.bijzonderheden } }]; }, apiFacturenMaken: function (n) { return [project(n).id, { per: 'maand' }]; }, apiFacturenExport: function () { return ['verzonden']; },
    apiBrein: function () { return ['Welke projecten lopen er bij de grootste school?', []]; }, apiBreinUitvoeren: function () { return [{ soort: 'maak_taak', invoer: { tekst: 'Proeftaak', deadline: d(1), prio: 'midden' } }]; },
    apiTalenten: function () { return [{}]; }, apiTalent: function () { return [rijenVan('Talenten').filter(function (t) { return /^gtl/.test(t.id); })[0].id]; },
    apiTalentOpslaan: function () { var t = rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id); })[0]; return [{ id: t.id, opleiding: 'Proef', _oud: { opleiding: t.opleiding } }]; },
    apiTalentBeschikbaarheidOpslaan: function () { return [rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id); })[1].id, { ma: [2, 2, 0], di: [0, 0, 0], wo: [2, 0, 0], do: [0, 0, 0], vr: [0, 0, 0], za: [0, 0, 0], zo: [0, 0, 0] }, []]; },
    apiTalentPortaalLink: function () { return [rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id); })[0].id, false]; },
    apiTalentDocumentOpslaan: function () { return [{ talentId: rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id); })[2].id, soort: 'vog', afgifte: d(-10), gecontroleerd: true }, null]; },
    apiTalentDocumentLink: function () { return [rijenVan('TalentDocumenten').filter(function (x) { return /^gvog/.test(x.id); })[0].id]; },
    apiTalentSchoolOpslaan: function () { return [{ talentId: rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id); })[3].id, schoolId: rijenVan('Scholen').filter(function (s) { return /^gs/.test(s.id); })[0].id, status: 'neutraal', richting: 'school' }]; },
    apiBeoordelingOpslaan: function () { return [{ talentId: rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id); })[4].id, oordeel: 'goed', tekst: 'Proef' }]; },
    apiMatch: function () { var v = rijenVan('Vacatures').filter(function (x) { return /^gv/.test(x.id) && x.status === 'open'; })[0]; return [v.id]; },
    apiVoorstellen: function () { var v = rijenVan('Vacatures').filter(function (x) { return /^gv/.test(x.id) && x.status === 'open'; })[0]; return [v.id, [rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id) && x.status === 'actief'; })[5].id], 'Proef']; },
    apiTalentRapport: function () { return ['kwartaal', 0]; }, apiTalentExport: function () { return [rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id); })[6].id]; },
    apiTalentAnonimiseer: function () { return [rijenVan('Talenten').filter(function (x) { return /^gtl/.test(x.id) && x.status === 'slapend'; })[0].id]; },
    apiFinancien: function () { return [X.huidigSchooljaar()]; }, apiExactImport: function () { var f = rijenVan('Facturen').filter(function (x) { return /^gf/.test(x.id) && x.factuurnummer; })[0]; return ['Factuurnummer;Factuurdatum;Bedrag;Betaaldatum\n' + f.factuurnummer + ';' + f.verzonden + ';' + String(f.bedrag).replace('.', ',') + ';', {}]; }
  };
  var ROLLEN = ['demo-sophie', 'demo-lars', 'demo-femke', 'demo-sem'].map(function (c) { var p = X.DEMO_MENSEN.filter(function (x) { return x.code === c; })[0]; return { code: c, naam: p.naam, team: p.team }; });
  var intern = [], traag = [], n = 0, hoogste = { ms: 0 };
  ROLLEN.forEach(function (rol) {
    api.forEach(function (a) {
      herstel();
      var args; try { args = B[a.naam] ? B[a.naam](rol.naam, rol.team) : a.params.map(function () { return ''; }); } catch (e) { args = []; }
      var t = Date.now(), d0; try { d0 = JSON.parse(X.demoRun(a.naam, JSON.stringify(args), rol.code)); } catch (e2) { d0 = { ok: false, fout: 'BUITEN doPost: ' + e2.message }; }
      var ms = Date.now() - t; n++;
      if (ms > hoogste.ms) hoogste = { ms: ms, api: a.naam, rol: rol.code };
      if (!d0.ok && INTERN.test(String(d0.fout))) intern.push(a.naam + ' als ' + rol.code + ': ' + String(d0.fout).slice(0, 120));
      if (d0.ok && /\bundefined\b|\bNaN\b|\[object Object\]/.test(JSON.stringify(d0.result))) intern.push(a.naam + ' als ' + rol.code + ': verdacht resultaat');
      if (ms >= 500) traag.push(a.naam + ' als ' + rol.code + ' ' + ms + ' ms');
    });
  });
  eis(!intern.length, n + ' aanroepen (' + api.length + ' api\'s × 4 rollen) zonder interne fout' + (intern.length ? ': ' + intern.slice(0, 6).join(' | ') : ''));
  eis(!traag.length, 'elke aanroep < 500 ms (traagste: ' + hoogste.api + ' als ' + hoogste.rol + ', ' + hoogste.ms + ' ms)' + (traag.length ? ': ' + traag.join(', ') : ''));
})();

/* ---- 8. bewaren in sessionStorage: alleen de wijzigingen; heen en terug gelijk; kapot = vers ---- */
(function () {
  var P1 = context({ klok: KLOK }); P1.demoGrootStart('');
  var vol = P1.demoExport().length, leeg = P1.demoGrootExport().length;
  info('volledige stand ' + Math.round(vol / 1024) + ' K tekens (UTF-16 in sessionStorage ±' + Math.round(vol * 2 / 1048576 * 10) / 10 + ' MB): te groot voor het quotum van ±5 MB; zonder wijzigingen bewaart het profiel ' + leeg + ' tekens');
  eis(leeg < 5000, 'zonder wijzigingen is de bewaarde stand klein (' + leeg + ' tekens)');
  var roep = function (fn, args, code) { var r = JSON.parse(P1.demoRun(fn, JSON.stringify(args), code || 'demo-sophie')); if (!r.ok) throw new Error(fn + ': ' + r.fout); return r.result; };
  var taak = P1.lees('Acties').filter(function (a) { return /^gtk/.test(a.id) && a.status === 'open'; })[0], kans0 = P1.lees('Kansen').filter(function (k) { return /^gk/.test(k.id) && k.fase === 'voorstel'; })[0];
  roep('apiTaakOpslaan', [{ id: taak.id, tekst: 'Gewijzigd in de groot-demo', _oud: { tekst: taak.tekst } }]);
  roep('apiKansOpslaan', [{ id: kans0.id, volgendeActie: 'Nabellen na de proef', _oud: { volgendeActie: kans0.volgendeActie } }, false]);
  var nieuw = roep('apiActieToevoegen', ['Nieuwe taak in de groot-demo', 'hoog', P1.datumStr(P1.plusDagen(3)), {}]);
  var weg = P1.lees('Acties').filter(function (a) { return /^gtk/.test(a.id) && a.status === 'open' && a.id !== taak.id; })[0];
  roep('apiVerwijder', ['taak', weg.id, {}]);
  roep('apiTalentUrenImport', []);
  var delta = P1.demoGrootExport(), d0 = JSON.parse(delta);
  eis(delta.length < 200000 && delta.length < vol / 10, 'na wijzigingen en een urenimport blijft de bewaarde stand klein (' + delta.length + ' tekens)');
  eis(d0.bladen.Acties && d0.bladen.Acties.weg.indexOf(weg.id) >= 0 && d0.bladen.Acties.rijen.length >= 2, 'gewijzigde en verwijderde rijen staan in de bewaarde stand');
  var P2 = context({ klok: KLOK }), st2 = P2.demoGrootStart(delta);
  eis(st2 === 'hersteld', 'demoGrootStart met de bewaarde stand: hersteld');
  var gelijk = Object.keys(P1._demoBladen).every(function (n) {
    var a = JSON.stringify(P1._demoBladen[n].rijen.slice().sort()), b = P2._demoBladen[n] ? JSON.stringify(P2._demoBladen[n].rijen.slice().sort()) : '';
    if (a !== b) info('verschil in ' + n);
    return a === b;
  });
  eis(gelijk, 'na herstel is elke rij gelijk aan de stand vóór het bewaren');
  eis(P2.lees('Acties').some(function (a) { return a.id === nieuw.id; }) && !P2.lees('Acties').some(function (a) { return a.id === weg.id; }) && P2.lees('Acties').filter(function (a) { return a.id === taak.id; })[0].tekst === 'Gewijzigd in de groot-demo', 'nieuwe, gewijzigde en verwijderde taak komen goed terug');
  var P3 = context({ klok: KLOK });
  eis(P3.demoGrootStart('{"kapot": ') === 'gevuld' && hash(staat(P3)) === hA, 'een kapotte bewaarde stand geeft een verse demo');
  var P4 = context({ klok: KLOK });
  eis(P4.demoGrootStart(P1.demoExport()) === 'gevuld' && hash(staat(P4)) === hA, 'een stand van de gewone demo wordt niet over het grote profiel gelegd');
  // v7.4 (iOS-review): de basis hangt af van vandaag, dus een id hoort een dag later bij een andere rij; dan een verse demo ('vernieuwd'), nooit de wijzigingen op onbekende rijen
  var P5 = context({ klok: KLOK + 86400000 }), st5 = P5.demoGrootStart(delta), V5 = context({ klok: KLOK + 86400000 }); V5.demoGrootStart('');
  eis(st5 === 'vernieuwd' && hash(staat(P5)) === hash(staat(V5)) && !P5.lees('Acties').some(function (a) { return a.id === nieuw.id; }), 'een dag later wordt de bewaarde stand niet over de nieuwe basis gelegd: verse demo (' + st5 + ')');
  // dezelfde dag, ander uur: elke rij hoort nog bij dezelfde school, hetzelfde project of talent (alleen de tijdstempels van het opbouwen verschillen)
  var P6 = context({ klok: KLOK + 9 * 3600000 }), st6 = P6.demoGrootStart(delta), TIJD = { bijgewerkt: 1, tijd: 1 }, versch = [];
  Object.keys(P1._demoBladen).forEach(function (n) {
    var kop = P1._demoBladen[n].rijen[0] || [], zonder = function (r) { return JSON.stringify(r.filter(function (x, i) { return !TIJD[kop[i]]; })); }, M = {};
    (P6._demoBladen[n] ? P6._demoBladen[n].rijen.slice(1) : []).forEach(function (r) { M[String(r[0])] = zonder(r); });
    P1._demoBladen[n].rijen.slice(1).forEach(function (r) { if (M[String(r[0])] !== zonder(r)) versch.push(n); });
  });
  var t6 = P6.lees('Acties').filter(function (a) { return a.id === taak.id; })[0], t1 = P1.lees('Acties').filter(function (a) { return a.id === taak.id; })[0];
  eis(st6 === 'hersteld' && !versch.length && t6 && t6.tekst === 'Gewijzigd in de groot-demo' && t6.trajectId === t1.trajectId && t6.schoolId === t1.schoolId,
    'dezelfde dag later: hersteld, en elke rij (ook de gewijzigde taak) hoort bij dezelfde school of hetzelfde project (' + st6 + ', ' + versch.length + ' anders' + (versch.length ? ': ' + versch.slice(0, 4).join(', ') : '') + ')');
  // een tab die over middernacht openblijft: de stand draagt de dag van zijn basis, niet die van het bewaren
  var P7 = context({ klok: KLOK }); P7.demoGrootStart('');
  JSON.parse(P7.demoRun('apiTaakOpslaan', JSON.stringify([{ id: taak.id, tekst: 'Over middernacht', _oud: { tekst: taak.tekst } }]), 'demo-sophie'));
  var dag7 = P7.datumStr(P7.plusDagen(0)); P7.__zetKlok(KLOK + 86400000);
  var d7 = P7.demoGrootExport(), Q7 = context({ klok: KLOK + 86400000 }), st7 = Q7.demoGrootStart(d7);
  eis(JSON.parse(d7).dag === dag7 && st7 === 'vernieuwd', 'over middernacht bewaard: de stand noemt de dag van de basis en past de volgende dag niet (' + st7 + ')');
  var d8 = JSON.parse(delta); d8.versie = 0;
  var P8 = context({ klok: KLOK }), st8 = P8.demoGrootStart(JSON.stringify(d8));
  eis(st8 === 'vernieuwd' && hash(staat(P8)) === hA, 'een stand met een andere opslagversie geeft een verse demo (' + st8 + ')');
})();

/* ---- 9. de standaardseed blijft ongewijzigd ---- */
(function () {
  var Z1 = context({ klok: KLOK, toeval: 99, zonderGroot: true }), Z2 = context({ klok: KLOK, toeval: 99 });
  Z1.demoStart(''); Z2.demoStart('');
  eis(hash(staat(Z1)) === hash(staat(Z2)), 'demoStart geeft met en zonder demo-groot.js dezelfde standaardseed');
  eis(Z2.lees('Talenten').length === 25 && Z2.lees('Scholen').length === 12, 'de standaardseed heeft zijn eigen aantallen (25 talenten, 12 scholen)');
})();

/* ---- 10. privacy (v7.4, optioneel): niets uit de eigen exports in het profiel groot; alleen tellingen, nooit een naam of bedrag ---- */
// De lijst (JSON: persoon, particulier, kind, school, projectdeel, schoolkern_info, achternaam_info, factuurnummer, bedrag_alle in centen; namen
// genormaliseerd: kleine letters, zonder accenten, leestekens als spatie) maakt de beheerder buiten de repo uit de echte exports.
(function () {
  var pad = process.env.PRIVACY_LIJST;
  if (!pad) { info('privacy: PRIVACY_LIJST niet gezet; de controle tegen de eigen exports is overgeslagen'); return; }
  var Lp; try { Lp = JSON.parse(fs.readFileSync(pad, 'utf8')); } catch (e) { eis(false, 'privacy: de lijst in PRIVACY_LIJST is niet leesbaar'); return; }
  function norm(s) { return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/'t /g, 't ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function verz(k) { var o = {}; (Lp[k] || []).forEach(function (x) { o[x] = 1; }); return o; }
  var naam = verz('persoon'), part = verz('particulier'), kind = verz('kind'), school = verz('school'), achter = verz('achternaam_info'), fnr = verz('factuurnummer'), schoolWoord = {};
  (Lp.school || []).concat(Lp.projectdeel || [], Lp.schoolkern_info || []).forEach(function (p) { String(p).split(' ').forEach(function (w) { schoolWoord[w] = 1; }); });
  var P = context(); P.demoGrootStart('');
  var W = P.GROOT_WOORDEN, tel = function (l, f) { return l.filter(f).length; };
  eis(tel(W.achterLos, function (a) { return achter[norm(a)]; }) === 0, 'privacy: geen losse achternaam uit de woordlijst komt in de eigen exports voor (' + tel(W.achterLos, function (a) { return achter[norm(a)]; }) + ' van ' + W.achterLos.length + ')');
  eis(tel(W.kern, function (k) { return schoolWoord[norm(k)]; }) === 0, 'privacy: geen kernwoord van een schoolnaam komt in een echte school- of klantnaam voor (' + tel(W.kern, function (k) { return schoolWoord[norm(k)]; }) + ')');
  var mensen = [], standaard = 0;
  ['Talenten', 'Personen', 'Kandidaten', 'Aanmeldingen'].forEach(function (n) { P.lees(n).forEach(function (r) { var x = norm(r.naam || ((r.voornaam || '') + ' ' + (r.achternaam || ''))); if (/^g/.test(String(r.id))) mensen.push(x); else if (naam[x] || part[x] || kind[x]) standaard++; }); });
  var botsNaam = tel(mensen, function (x) { return naam[x] || part[x] || kind[x]; });
  eis(botsNaam === 0, 'privacy: geen verzonnen persoonsnaam (' + mensen.length + ') is gelijk aan een naam uit de exports (' + botsNaam + ')');
  if (standaard) info('privacy: ' + standaard + ' rij(en) van de standaardseed (demo-backend.js, buiten dit profiel) dragen een naam die ook in de exports staat');
  var sch = P.lees('Scholen').filter(function (s) { return /^gs/.test(s.id); });
  eis(tel(sch, function (s) { return school[norm(s.naam)] || school[norm(String(s.naam).replace(/\s\S+$/, ''))]; }) === 0, 'privacy: geen verzonnen schoolnaam (' + sch.length + ') is een echte school of klant');
  var fac = P.lees('Facturen').filter(function (f) { return /^gf/.test(f.id) && f.factuurnummer; });
  eis(tel(fac, function (f) { return fnr[String(f.factuurnummer)]; }) === 0, 'privacy: geen verzonnen factuurnummer (' + fac.length + ') is een echt factuurnummer');
  var c = Math.round(P.GROOT_PARTICULIER_TARIEF * 100), veelvoud = tel(Lp.bedrag_alle || [], function (b) { return Number(b) > 0 && Number(b) % c === 0; });
  eis(veelvoud === 0, 'privacy: het verzonnen particuliere uurtarief is geen deler van een echt factuurbedrag (' + veelvoud + ')');
})();

console.log('looptijd ' + Math.round((Date.now() - T0) / 100) / 10 + ' s');
console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
