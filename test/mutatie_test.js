// v7.2: mutatietest van de rooktest. Tien mutanten (v7.9: vijftien; v7.9.2: zeventien; v7.9.3: eenentwintig) breken elk één invariant in een KOPIE van backend/Code.gs (het origineel blijft
// onaangeraakt); per mutant draait `CODE_GS=<kopie> node test/node_rooktest.js`. Een mutant is "gedood" als de rooktest faalt
// (exitcode ≠ 0, crash of timeout) en "OVERLEEFD" als hij ALLES GOED geeft: dan mist de rooktest een eis(...) voor die invariant.
// Gebruik: node test/mutatie_test.js [--map <kopieënmap>]  → "ALLES GOED" bij ≥ 20 van 21 gedood (exitcode 0), anders "FOUTEN: n" (exitcode 1). v7.9: twee mutanten erbij;
// v7.9 (review T3, T5): de noemerregel zonder waarde en zonder schooljaarcontrole, en het venster van de voorspelling één week opgeschoven.
// v7.9.2: vraagtStart_niet_verplicht (een kans gaat zonder verwachte startdatum naar fase 5b bijna rond) en (review r1) fasenEffectief_5b_leeg (5b erft de
// voorstelrol niet meer, zodat stap fasen een historische VO-wissel stil herziet). v7.9.3: fasen_herhaal_op_naam (opnieuw toepassen zoekt een fase alleen op
// naam, zodat een in Beheer hernoemde fase met een later besluit van het MT stil naar het rekenmodel teruggaat) en (review r1) fasen_5b_altijd_bekend (een eigen
// mijlpaal achter VO na v7.9.1 telt als 5b van de stap, zodat de verplichte startdatum stil nooit actief wordt) en (review r2) fasen_voorvoegsel_negeren (het
// voorstel van stap fasen negeert na een eerdere keer het nummer vóór de naam, zodat "2. eerste gesprek gepland" naast een eigen rij fase 3 wordt) en (review r3)
// fasen_voorvoegsel_geen_anker (het nummer geeft de fase, maar de rij telt niet als anker voor de plek, zodat een eigen rij ervóór en de genummerde rij samen een
// reeks worden en "2. eerste contact" stil fase 3 krijgt).
// Resultaat als json in test/shots/robuust/mutatie.json (staat in .gitignore).
var fs = require('fs'), path = require('path'), cp = require('child_process');
var R = path.join(__dirname, '..'), BRON = path.join(R, 'backend/Code.gs'), ROOKTEST = path.join(__dirname, 'node_rooktest.js');
var UIT_MAP = path.join(R, 'test/shots/robuust'), UIT = path.join(UIT_MAP, 'mutatie.json');
var TIMEOUT_MS = 120000, MIN_GEDOOD = 20;  // v7.9 (review): vijftien mutanten, norm ≥ 14; v7.9.2: zestien, norm ≥ 15; review r1: zeventien, norm ≥ 16; v7.9.3: achttien, norm ≥ 17; v7.9.3 review r1: negentien, norm ≥ 18; review r2: twintig, norm ≥ 19; review r3: eenentwintig, norm ≥ 20

// De kopieën staan buiten de repo: standaard in de scratchpad van de sessie (--map overschrijft), nooit naast het origineel.
var argMap = process.argv.indexOf('--map');
var KOPIE_MAP = argMap >= 0 && process.argv[argMap + 1] ? process.argv[argMap + 1]
  : '/tmp/claude-0/-home-user-athena-assistent/7a602907-5be5-5b25-84c9-436ef87c48dc/scratchpad/v72/mutatie';

// Elke mutant: één gerichte tekstvervanging (zoek moet precies één keer voorkomen) die één invariant uit één gebied breekt.
// 'voorstel' is de eis(...)-regel voor node_rooktest.js die de mutant zou doden als hij overleeft.
var MUTANTEN = [
  { id: 'mag_altijd_true', gebied: 'rechten', invariant: 'mag() weigert wat buiten team, rol of eigenaarschap valt',
    zoek: "function mag(onderdeel, actie, rij) {\n  var n = niveau(onderdeel, actie);",
    vervang: "function mag(onderdeel, actie, rij) {\n  return true;  // MUTANT\n  var n = niveau(onderdeel, actie);",
    voorstel: "eis(/toegang/.test(faalt(LARS, 'apiTalenten')), 'rechten: een consultant ziet het talentbestand niet');" },
  { id: 'conflict_niets', gebied: 'gelijktijdigheid', invariant: 'controleerConflict() weigert een verouderde _oud met "Intussen gewijzigd"',
    zoek: "function controleerConflict(tab, id, nieuw, oud) {\n  if (!id || !oud || typeof oud !== 'object') return;",
    vervang: "function controleerConflict(tab, id, nieuw, oud) {\n  return;  // MUTANT\n  if (!id || !oud || typeof oud !== 'object') return;",
    voorstel: "eis(/Intussen gewijzigd/.test(faalt(SEM, 'apiTalentOpslaan', { id: 'tl22', functies: ['surveillant'], _oud: { functies: ['onderwijsondersteuner'] } })), 'verouderde _oud geeft een conflictmelding');" },
  { id: 'herhaling_tot_genegeerd', gebied: 'herhalende taken', invariant: 'volgendeInstantie stopt na de einddatum (tot)',
    zoek: "  if (h.tot && datumStr(d) > h.tot) return null;",
    vervang: "  if (false && h.tot && datumStr(d) > h.tot) return null;  // MUTANT",
    voorstel: "eis(ctx.volgendeInstantie({ tekst: 'x', deadline: plusDagen(0) }, { eenheid: 'dag', interval: 1, tot: plusDagen(0) }, new Date()) === null, 'tot: na de einddatum geen nieuwe instantie');" },
  { id: 'laatste_contact_niets', gebied: 'CRM-tijdlijn', invariant: 'een gelogd contactmoment zet laatsteContact op school, persoon en open kansen',
    zoek: "function zetLaatsteContact(acts) {\n  var perS = {}, perP = {}, perK = {}, vandaag = datumStr(new Date());",
    vervang: "function zetLaatsteContact(acts) {\n  return;  // MUTANT\n  var perS = {}, perP = {}, perK = {}, vandaag = datumStr(new Date());",
    voorstel: "/* in de v7.1-sectie, direct na `var wa = roep(LARS, 'apiActiviteitToevoegen', { vorm: 'whatsapp', schoolId: school.id, ... })` (seed: s1 had gisteren contact, k16 is haar open kans) */ eis(String(ctx.vind('Scholen', school.id).laatsteContact).slice(0, 10) === plusDagen(0) && String(ctx.vind('Kansen', 'k16').laatsteContact).slice(0, 10) === plusDagen(0), 'een gelogd gesprek zet laatsteContact van de school en haar open kans op vandaag');" },
  { id: 'kandidaat_gevuld_altijd', gebied: 'bezetting', invariant: 'kandidaatGevuld telt alleen geplaatst/lopende statussen als gevulde plek',
    zoek: "function kandidaatGevuld(k) { return KANDIDAAT_GEVULD.indexOf(k.status) >= 0; }",
    vervang: "function kandidaatGevuld(k) { return true; }  // MUTANT",
    voorstel: "eis(roep(SEM, 'apiBezetting').tellingen.teBezetten > 0 && ctx.lees('Kandidaten').some(function (k) { return k.status === 'voorgesteld' && !ctx.kandidaatGevuld(k); }), 'een voorgestelde kandidaat vult nog geen plek');" },
  { id: 'vog_altijd_groen', gebied: 'VOG', invariant: 'vogStatus geeft ontbreekt/verlopen/oranje als er geen verse VOG is',
    zoek: "function vogStatus(t, docs, sj) {\n  var huidig = huidigSchooljaar(); sj = sj || huidig;",
    vervang: "function vogStatus(t, docs, sj) {\n  return { status: 'groen', afgifte: '', geldigTot: '' };  // MUTANT\n  var huidig = huidigSchooljaar(); sj = sj || huidig;",
    voorstel: "eis(vogs.oranje === 3 && vogs.groen === 14 && vogs.verlopen === 4 && vogs.ontbreekt === 4, 'VOG-statussen op de seed');" },
  { id: 'match_zonder_sectorfilter', gebied: 'matching', invariant: 'matchVacature sluit een talent uit wiens sectoren de schoolsector niet bevatten',
    zoek: "  if (ctx.sector && sectoren.length && sectoren.indexOf(ctx.sector) < 0) return uit('sector past niet (' + sectoren.join(', ') + ')');",
    vervang: "  if (false && ctx.sector && sectoren.length && sectoren.indexOf(ctx.sector) < 0) return uit('sector past niet (' + sectoren.join(', ') + ')');  // MUTANT",
    voorstel: "eis(/sector/.test(uit.tl1 || ''), 'match: hard filter op sector met reden');" },
  { id: 'prognose_dubbel', gebied: 'financiën', invariant: 'som van de prognose per maand = contractwaarde',
    zoek: "  p.posten.forEach(function (x) { bij('prognose', x.datum, x.bedrag); bij('prognoseKas', plusDagenVan(x.datum, termijnDagen), x.bedrag); });",
    vervang: "  p.posten.forEach(function (x) { bij('prognose', x.datum, x.bedrag); bij('prognose', x.datum, x.bedrag); bij('prognoseKas', plusDagenVan(x.datum, termijnDagen), x.bedrag); });  // MUTANT",
    voorstel: "eis(!fout.length, 'invariant per project: som prognose = contract');" },
  { id: 'vorm_call_afspraak', gebied: 'activiteiten (vorm/type)', invariant: 'TYPE_VAN_VORM: een call is een gesprek, geen afspraak',
    zoek: "var TYPE_VAN_VORM = { notitie: 'notitie', call: 'gesprek', mail: 'mail',",
    vervang: "var TYPE_VAN_VORM = { notitie: 'notitie', call: 'afspraak', mail: 'mail',",
    voorstel: "/* in de v7.1-sectie, vóór `var na = roep(SOPHIE, 'apiActiviteiten', ...)`; de telling erna wordt dan totaal + 4 en gesprek + 3 */ var bel = roep(LARS, 'apiActiviteitToevoegen', { vorm: 'call', schoolId: school.id, onderwerp: 'Belletje' }); eis(bel.type === 'gesprek' && bel.vorm === 'call' && ctx.vind('Activiteiten', bel.id).type === 'gesprek', 'een call telt als gesprek (type uit TYPE_VAN_VORM)');" },
  { id: 'portaal_whitelist_weg', gebied: 'portaal', invariant: 'het portaal (doPost met portaal) kent alleen PORTAAL_FUNCTIES',
    zoek: "      if (PORTAAL_FUNCTIES.indexOf(fn) < 0) uit = { ok: false, fout: 'onbekende functie ' + fn };",
    vervang: "      if (false) uit = { ok: false, fout: 'onbekende functie ' + fn };  // MUTANT",
    voorstel: "eis(!portaal(TOKEN, 'apiTalent', 'tl2').ok && /onbekende functie/.test(portaal(TOKEN, 'apiTalent', 'tl2').fout), 'portaal: andere api-functies zijn via een token niet aan te roepen');" },
  // v7.9: een ongedaan gemaakte wissel telt nergens (de vlag, geen tweede event)
  { id: 'fw_ongedaan_telt', gebied: 'fasewissels', invariant: 'tellendeWissels laat ongedaan gemaakte wissels weg',
    zoek: "    if (!w.ongedaan && !w.verwijderd && FASE_TELT_NIET.indexOf(w.bron) < 0) tellend.push(w);",
    vervang: "    if (!w.verwijderd && FASE_TELT_NIET.indexOf(w.bron) < 0) tellend.push(w);  // MUTANT",
    voorstel: "eis(!ctx.tellendeWissels().some(function (w) { return w.id === 'fw-k9-ongedaan'; }), 'een ongedaan gemaakte wissel telt nergens');" },
  // v7.9: een weekdoel geldt alleen voor precies zijn week (de fout uit de Mac-code vergeleek op het einde van het weeknummer)
  { id: 'weekdoel_einde_nummer', gebied: 'doelen', invariant: 'doelenVan vergelijkt de periodeSleutel exact',
    zoek: "  if (sleutel) rijen.filter(function (d) { return String(d.periodeSleutel || '') === String(sleutel); }).forEach(zet);",
    vervang: "  if (sleutel) rijen.filter(function (d) { return String(d.periodeSleutel || '').slice(-1) === String(sleutel).slice(-1); }).forEach(zet);  // MUTANT",
    voorstel: "eis(ctx.doelenVan('week', wk)['Lars Visser'].ap === 2, 'een week met hetzelfde laatste cijfer telt niet mee');" },
  // v7.9 (review T3): het jaardoel is pas bruikbaar met een eigen waarde (geen terugval op een los contracteerdoel) en alleen voor zijn schooljaar
  { id: 'jaardoel_zonder_waarde', gebied: 'sturing (B3)', invariant: 'noemerUit blokkeert een jaardoel zonder eigen waarde, ook met een contracteerdoel',
    zoek: "|| !(sc instanceof Array) || !(Number(j.waarde) > 0)) return leeg;",
    vervang: "|| !(sc instanceof Array)) return leeg;  // MUTANT",
    voorstel: "eis(/besluit jaardoel/.test(mtCijfers().M07.geblokkeerd), 'een jaardoel zonder waarde met noemer contracteerdoel blijft geblokkeerd');" },
  { id: 'jaardoel_ander_schooljaar', gebied: 'sturing (B3)', invariant: 'noemerUit weigert een jaardoel voor een ander schooljaar',
    zoek: "  if (j.schooljaar && sj && j.schooljaar !== sj) { basis.reden",
    vervang: "  if (false && j.schooljaar && sj && j.schooljaar !== sj) { basis.reden",
    voorstel: "eis(/het jaardoel is voor schooljaar/.test(mtCijfers().M07.geblokkeerd), 'een jaardoel voor vorig schooljaar telt niet');" },
  // v7.9 (review T5): M13 rekent over de N hele ISO-weken vóór deze week, niet over de lopende week
  { id: 'voorspelling_venster', gebied: 'voorspellingslog (M13)', invariant: 'voorspelDealsWeek telt de N hele weken vóór de week van de voorspelling',
    zoek: "  for (var i = n; i >= 1; i--) { var b = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() - 7 * i, 12)",
    vervang: "  for (var i = n - 1; i >= 0; i--) { var b = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() - 7 * i, 12)",
    voorstel: "eis(ctx.voorspelDealsWeek(ma).verwacht === 1.4, 'M13: de lopende week telt niet mee in het venster');" },
  // v7.9.2: een mijlpaal met vraagtStart (fase 5b bijna rond) eist vanuit de app en de assistent een verwachte startdatum vandaag of later
  { id: 'vraagtStart_niet_verplicht', gebied: 'fase 5b (v7.9.2)', invariant: 'kansOpslaan weigert een kans zonder (of met een verlopen) verwachteStart in een mijlpaal met vraagtStart',
    zoek: "      if (!startNa || startNa < datumStr(new Date())) { eisNieuweApp('7.9.2'); throw new Error(START_FOUT); }",
    vervang: "      if (false) { eisNieuweApp('7.9.2'); throw new Error(START_FOUT); }  // MUTANT",
    voorstel: "eis(faalt(LARS, 'apiKansOpslaan', { id: k5.id, fase: B, _oud: { fase: VO } }) === ctx.START_FOUT, 'naar 5b zonder startdatum geweigerd');" },
  // v7.9.2 (review r1, B1): 5b heeft geen eigen rol en erft voorstel; zonder die erfenis herziet stap fasen een app-wissel naar een eigen mijlpaal "mondeling
  // akkoord" (erft voorstel, telt als VO) naar naarRol '' en verdwijnt een historische VO stil uit de tellingen
  { id: 'fasenEffectief_5b_leeg', gebied: 'fase 5b (v7.9.2)', invariant: 'fasenEffectief geeft 5b de geërfde voorstelrol (stap fasen herziet een VO-wissel naar 5b niet)',
    zoek: "uit['6'] = 'deal'; return uit; }",
    vervang: "uit['5b'] = ''; uit['6'] = 'deal'; return uit; }  // MUTANT",
    voorstel: "eis(ctx.fasenEffectief()['5b'] === 'voorstel' && pB.herzien === 0 && ctx.telRol(wisselRij(wB.id)) === 'voorstel', 'een VO-wissel naar mondeling akkoord blijft na stap fasen een VO');" },
  // v7.9.3 (C-R1): na een eerdere keer houdt opnieuw toepassen een fase die de beheerder in Beheer → Mijlpalen hernoemde ("5. offerte", 65 %), via de koppeling.
  // Zoekt de stap alleen op naam, dan komt de Capsule-naam terug met 70 % en een nieuw id en verhuizen de kansen met een hernoemd-wissel: een MT-besluit stil terug
  { id: 'fasen_herhaal_op_naam', gebied: 'fase 5b (v7.9.3)', invariant: 'fasenPlan zoekt na een eerdere keer een hernoemde fase ook op de koppeling, niet alleen op naam',
    zoek: "  if (eerder) CAPSULE_FASEN.forEach(function (f) {\n    if (perFase[f.fase]) return;",
    vervang: "  if (false) CAPSULE_FASEN.forEach(function (f) {  // MUTANT\n    if (perFase[f.fase]) return;",
    voorstel: "eis(r.wissels === 0 && na[4].mijlpaal === '5. offerte' && na[4].kans === 65, 'opnieuw toepassen na v7.9.1 houdt de hernoemde fase 5 (naam, gewicht, kansen)');" },
  // v7.9.3 (review r1, C-R1-5b): na stap fasen met v7.9.1 bestond fase 5b niet; een eigen mijlpaal achter VO ("mondeling akkoord") is dan geen rij van de stap. Telt
  // de stap 5b toch als fase van de vorige keer, dan zegt hij "staat zo" en wordt de verplichte startdatum stil nooit actief
  { id: 'fasen_5b_altijd_bekend', gebied: 'fase 5b (v7.9.3)', invariant: 'fasenVorige geeft zonder de instelling fasenSleutels alleen de fasen van v7.9.1 (1 tot en met 5)',
    zoek: "function fasenVorige() { var s = instelling('fasenSleutels'); return s instanceof Array ? s.map(String) : FASEN_V791.slice(); }",
    vervang: "function fasenVorige() { return CAPSULE_FASEN.map(function (f) { return f.fase; }); }  // MUTANT",
    voorstel: "eis(!roep(SOPHIE, 'apiMigratieV79', 'fasen').alGedaan, 'na v7.9.1 met een eigen mondeling akkoord achter VO staat de stap niet zo');" },
  // v7.9.3 (review r2, C-R1b): na een eerdere keer beslist eerst het nummer vóór de naam ("2." van "2. eerste gesprek gepland") als dat een fase van de vorige keer
  // is en in Scholen uniek. Negeert het voorstel dat, dan leest de herkenner "gesprek gepland" als 3 zodra de plek niet beslist (een eigen rij ertussen): de rij
  // verdwijnt bij toepassen, "2. pre-ap" komt terug en de kansen gaan stil van 0 % naar 25 %
  { id: 'fasen_voorvoegsel_negeren', gebied: 'fase 5b (v7.9.3)', invariant: 'fasenVoorstel geeft na een eerdere keer een uniek voorvoegsel van een fase van de vorige keer die fase',
    zoek: "    if (f) { uit[m.id] = f.fase; p = namen.indexOf(f.mijlpaal); }  // het voorvoegsel gaat voor de herkenner",
    vervang: "    if (false && f) { uit[m.id] = f.fase; p = namen.indexOf(f.mijlpaal); }  // MUTANT",
    voorstel: "eis(vs3 === '1,,2,3,4,5', 'met een eigen rij ertussen beslist het voorvoegsel: 2. eerste gesprek gepland is 2');" },
  // v7.9.3 (review r3, R3-T1 V3): een rij met een uniek voorvoegsel van een fase van de vorige keer (en een passende rol) is een anker voor de plek. Telt hij niet
  // als anker, dan vormt hij met een eigen rij ervóór een reeks waar precies twee fasen ontbreken: "eigen stap" wordt 2 en "2. eerste contact" stil 3 (ap)
  { id: 'fasen_voorvoegsel_geen_anker', gebied: 'fase 5b (v7.9.3)', invariant: 'fasenVoorstel telt een rij die zijn fase aan het voorvoegsel dankt als anker voor de plek',
    zoek: "    if (f) { uit[m.id] = f.fase; p = namen.indexOf(f.mijlpaal); }  // het voorvoegsel gaat voor de herkenner",
    vervang: "    if (f) { uit[m.id] = f.fase; }  // MUTANT",
    voorstel: "eis(anker2 === '1,,2,4,5', 'het voorvoegsel is een anker: 2. eerste contact blijft 2, de eigen rij ervoor kiest de beheerder');" }
];

var fouten = 0, overleefd = 0, gedood = 0, t0 = Date.now();
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function tel(s, sub) { var n = 0, i = 0; while ((i = s.indexOf(sub, i)) >= 0) { n++; i += sub.length; } return n; }
function eersteFouten(r) {
  var uit = String(r.stdout || '').split('\n').filter(function (l) { return /^FOUT /.test(l); }).slice(0, 3);
  if (!uit.length) {
    var err = String(r.stderr || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var e1 = err.filter(function (l) { return /Error|FOUTEN:/.test(l) && !/^at /.test(l); })[0] || err[0] || '';
    if (r.error && r.error.code === 'ETIMEDOUT') e1 = 'timeout na ' + TIMEOUT_MS / 1000 + ' s' + (e1 ? ': ' + e1 : '');
    else if (r.error) e1 = String(r.error.message || r.error) + (e1 ? ': ' + e1 : '');
    if (e1) uit.push(e1.slice(0, 300));
  }
  return uit;
}
// Draait de rooktest tegen één Code.gs-bestand; geeft {status, signaal, duurS, alles, eersteFouten}
function draai(codeGs) {
  var t = Date.now();
  var r = cp.spawnSync(process.execPath, [ROOKTEST], { env: Object.assign({}, process.env, { CODE_GS: codeGs }), encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  var allesGoed = /^ALLES GOED$/m.test(String(r.stdout || ''));
  return { status: r.status, signaal: r.signal || (r.error ? String(r.error.code || r.error.message) : null), duurS: Math.round((Date.now() - t) / 100) / 10, allesGoed: allesGoed, eersteFouten: eersteFouten(r) };
}

if (!fs.existsSync(KOPIE_MAP)) fs.mkdirSync(KOPIE_MAP, { recursive: true });
if (!fs.existsSync(UIT_MAP)) fs.mkdirSync(UIT_MAP, { recursive: true });
var bron = fs.readFileSync(BRON, 'utf8'), resultaat = { gemaakt: new Date().toISOString(), bron: 'backend/Code.gs', kopieen: KOPIE_MAP, rooktest: 'test/node_rooktest.js', timeoutS: TIMEOUT_MS / 1000, minGedood: MIN_GEDOOD, mutanten: [] };

// Nulmeting: de ongemuteerde Code.gs moet ALLES GOED geven, anders is "gedood" waardeloos
var nul = draai(BRON);
resultaat.nulmeting = nul;
eis(nul.status === 0 && nul.allesGoed, 'nulmeting: de rooktest op de ongemuteerde Code.gs geeft ALLES GOED (' + nul.duurS + ' s)');
if (!(nul.status === 0 && nul.allesGoed)) {
  console.log('     de rooktest zelf faalt; mutanten overslaan. ' + nul.eersteFouten.join(' | '));
  fs.writeFileSync(UIT, JSON.stringify(resultaat, null, 2));
  console.log('FOUTEN: ' + fouten); process.exit(1);
}

MUTANTEN.forEach(function (m, i) {
  var r = { id: m.id, gebied: m.gebied, invariant: m.invariant, bestand: path.join(KOPIE_MAP, m.id + '.gs'), toegepast: false, uitkomst: '', voorstel: m.voorstel };
  var n = tel(bron, m.zoek);
  if (n !== 1) {
    eis(false, 'mutant niet toegepast: ' + m.id + ' (zoektekst ' + (n === 0 ? 'niet gevonden' : n + ' keer gevonden') + ')');
    r.uitkomst = 'niet toegepast'; resultaat.mutanten.push(r); return;
  }
  var gemuteerd = bron.replace(m.zoek, function () { return m.vervang; });
  if (gemuteerd === bron) {
    eis(false, 'mutant niet toegepast: ' + m.id + ' (kopie gelijk aan het origineel)');
    r.uitkomst = 'niet toegepast'; resultaat.mutanten.push(r); return;
  }
  fs.writeFileSync(r.bestand, gemuteerd);
  r.toegepast = fs.readFileSync(r.bestand, 'utf8') !== bron;
  var u = draai(r.bestand);
  r.exitcode = u.status; r.signaal = u.signaal; r.duurS = u.duurS; r.eersteFouten = u.eersteFouten;
  var isGedood = !(u.status === 0 && u.allesGoed);
  r.uitkomst = isGedood ? 'gedood' : 'OVERLEEFD';
  if (isGedood) { gedood++; eis(true, 'gedood    ' + (i + 1) + '/' + MUTANTEN.length + ' ' + m.id + ' [' + m.gebied + '] — ' + (u.eersteFouten[0] || ('exitcode ' + u.status)).slice(0, 160)); }
  else { overleefd++; eis(false, 'OVERLEEFD ' + (i + 1) + '/' + MUTANTEN.length + ' ' + m.id + ' [' + m.gebied + '] — ' + m.invariant + '\n     voorstel voor node_rooktest.js: ' + m.voorstel); }
  resultaat.mutanten.push(r);
});

var looptijdS = Math.round((Date.now() - t0) / 100) / 10;
resultaat.gedood = gedood; resultaat.overleefd = overleefd; resultaat.looptijdS = looptijdS;
resultaat.geslaagd = gedood >= MIN_GEDOOD && resultaat.mutanten.every(function (r) { return r.toegepast; });
fs.writeFileSync(UIT, JSON.stringify(resultaat, null, 2));
console.log('     ' + gedood + ' van ' + MUTANTEN.length + ' gedood, ' + overleefd + ' overleefd; json: ' + path.relative(R, UIT) + '; looptijd ' + looptijdS + ' s');
// Oordeel: ≥ 20 van 21 gedood (v7.9.3 na review r3; na review r2 ≥ 19 van 20; na review r1 ≥ 18 van 19; v7.9.3 ≥ 17 van 18; v7.9.2 na review r1 ≥ 16 van 17; daarvoor ≥ 15 van 16; v7.9 na de review ≥ 14 van 15; was ≥ 11 van 12, daarvoor ≥ 9 van 10) en alle mutanten toegepast. Eén overlevende is dus toegestaan maar staat hierboven als FOUT (een gat in de rooktest).
if (resultaat.geslaagd) console.log('ALLES GOED' + (overleefd ? ' (met ' + overleefd + ' overlevende mutant: zie de FOUT-regel hierboven)' : ''));
else console.log('FOUTEN: ' + fouten);
process.exit(resultaat.geslaagd ? 0 : 1);
