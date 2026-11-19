// v7.2: mutatietest van de rooktest. Tien mutanten (v7.9: vijftien; v7.9.2: zeventien; v7.9.3: eenentwintig; v7.9.4: achtendertig, na herstel r1 eenenveertig, na herstel r2 eenenvijftig, na herstel r3 zevenenvijftig, na herstel r4 negenenvijftig, na herstel r5 eenenzestig, na de harnasdekking tweeënzestig, na herstel r6 achtenzestig, na herstel r7 zeventig) breken elk één invariant in een KOPIE van backend/Code.gs (het origineel blijft
// onaangeraakt); per mutant draait `CODE_GS=<kopie> node test/node_rooktest.js`. Een mutant is "gedood" als de rooktest faalt
// (exitcode ≠ 0, crash of timeout) en "OVERLEEFD" als hij ALLES GOED geeft: dan mist de rooktest een eis(...) voor die invariant.
// Gebruik: node test/mutatie_test.js [--map <kopieënmap>]  → "ALLES GOED" bij ≥ 69 van 70 gedood (v7.9.4 herstel r7, alle op één na; na herstel r6 ≥ 67 van 68; na de harnasdekking ≥ 61 van 62; na herstel r5 ≥ 60 van 61; na herstel r4 ≥ 58 van 59; na herstel r3 ≥ 56 van 57; na herstel r2 ≥ 50 van 51; daarvoor ≥ 40 van 41 en ≥ 37 van 38; was ≥ 20 van 21) (exitcode 0), anders "FOUTEN: n" (exitcode 1). v7.9: twee mutanten erbij;
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
var TIMEOUT_MS = 120000, MIN_GEDOOD = 69;  // v7.9.4 herstel r7: zeventig mutanten, norm ≥ 69 (twee erbij: R7-D3 en R7-2); herstel r6: achtenzestig mutanten, norm ≥ 67 (zes erbij: R6-1, R6-2 en de nits R6-3 en R6-4); v7.9.4 harnasdekking: tweeënzestig mutanten, norm ≥ 61 (één erbij: de definitie van M26); v7.9.4 herstel r5: eenenzestig mutanten, norm ≥ 60 (twee erbij: R5-C1 en R5-C2); v7.9.4 herstel r4: negenenvijftig mutanten, norm ≥ 58 (twee erbij: R4-2b en R4-3); v7.9.4 herstel r3: zevenenvijftig mutanten, norm ≥ 56 (zes erbij: R3-D1, R2, R3, R4, N1 en N2); v7.9.4 herstel r2: eenenvijftig mutanten, norm ≥ 50 (tien erbij: A-B3 tot A-B7, B-B1, B-B4, B-B5 en twee voor B-B9); v7.9.4 herstel r1: eenenveertig mutanten, norm ≥ 40 (drie erbij: K1, K3 en K6); v7.9.4: achtendertig mutanten, norm ≥ 37 (alle op één na; stap 2: acht erbij voor de bouwpunten 4, 7, 8 en 9); v7.9 (review): vijftien mutanten, norm ≥ 14; v7.9.2: zestien, norm ≥ 15; review r1: zeventien, norm ≥ 16; v7.9.3: achttien, norm ≥ 17; v7.9.3 review r1: negentien, norm ≥ 18; review r2: twintig, norm ≥ 19; review r3: eenentwintig, norm ≥ 20

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
    voorstel: "eis(anker2 === '1,,2,4,5', 'het voorvoegsel is een anker: 2. eerste contact blijft 2, de eigen rij ervoor kiest de beheerder');" },
  // v7.9.4 (bouwpunt 1): een contract zonder populatie is "leeg: niets te toetsen". Blijft hij geslaagd, dan ziet het datakwaliteitsoverzicht er groen uit
  // terwijl er niets getoetst is (de echte stand: geen open kansen, geen projecten, geen OC's)
  { id: 'contract_leeg_als_geslaagd', gebied: 'sturing (v7.9.4)', invariant: 'datacontracten geeft een contract zonder populatie en zonder afwijking de stand leeg, nooit geslaagd',
    zoek: "    if (x.stand === 'geslaagd' && !x.populatie && !x.afwijkingen.length) { x.stand = 'leeg'; x.reden = contractLeegReden(x.id); }",
    vervang: "    if (false && x.stand === 'geslaagd' && !x.populatie && !x.afwijkingen.length) { x.stand = 'leeg'; x.reden = contractLeegReden(x.id); }  // MUTANT",
    voorstel: "eis(contractenOp(leegStand794).actieve_eigenaar.stand === 'leeg', 'zonder open kansen is actieve_eigenaar leeg, niet geslaagd');" },
  // v7.9.4 (bouwpunt 5): een team zonder leden. Geeft teamBlokkade altijd '', dan telt M23 nul en geeft het teamtotaal geen blokkade (de echte stand: Gebruikers leeg)
  { id: 'team_zonder_leden_nul', gebied: 'sturing (v7.9.4)', invariant: 'teamBlokkade geeft voor een team zonder actieve leden "geen leden in het team" (M23, M35 en het teamtotaal geblokkeerd, nooit 0)',
    zoek: "function teamBlokkade(team) { return teamNamen(team).length ? '' : TEAM_GEEN_LEDEN; }",
    vervang: "function teamBlokkade(team) { return '';  /* MUTANT */ }",
    voorstel: "eis(/geen leden in het team/.test(mtCijfers().M23.geblokkeerd), 'zonder OC\'s is M23 geblokkeerd');" },
  { id: 'weekregel_zonder_leden_nul', gebied: 'sturing (v7.9.4)', invariant: 'weekCijfers geeft een regel zonder leden null met een blokkade, nooit 0 (het harnas leest weekCijfers direct)',
    zoek: "  rijen.forEach(function (r) {  // v7.9.4 (bouwpunt 5)\n    if (r.leden && r.leden.length) return;",
    vervang: "  rijen.forEach(function (r) {  // v7.9.4 (bouwpunt 5)\n    if (true) return;  // MUTANT",
    voorstel: "eis(ctx.weekCijfers(B, cx([{ naam: '__team', leden: [] }])).__team.contactmomenten === null, 'een regel zonder leden is null');" },
  // v7.9.4 (bouwpunt 2): een winst zonder Kansen.schooljaar (de echte stand: overal leeg) telt mee via de akkoorddatum of het project. Kijkt het contract alleen
  // naar Kansen.schooljaar, dan missen school_heeft_brin en kans_heeft_schooljaar_en_klant alle winsten
  { id: 'winst_zonder_schooljaar_overgeslagen', gebied: 'sturing (v7.9.4)', invariant: 'de contracten geven een winst zonder Kansen.schooljaar het schooljaar van het project, anders van de akkoorddatum',
    zoek: "    return winstSchooljaar(k, uitMap(pSj, String(k.id)), akkoord);",
    vervang: "    return String(k.schooljaar || '');  // MUTANT",
    voorstel: "eis(contractenOp(winsten).kans_heeft_schooljaar_en_klant.afwijkingen.some(function (a) { return a.id === 'rk-w1'; }), 'een winst zonder schooljaar met een akkoorddatum dit schooljaar zakt');" },
  // v7.9.4 (bouwpunt 3): de overstapstap kansen vult schooljaar en klant ook bij gewonnen kansen (M04 en M08 hangen eraan)
  { id: 'stap_kansen_alleen_open', gebied: 'sturing (v7.9.4)', invariant: 'kansenAanvulPlan neemt ook de gewonnen kansen mee',
    zoek: "    var won = k.fase === 'gewonnen'; if (!won && !kansOpen(k)) return;",
    vervang: "    var won = false; if (!kansOpen(k)) return;  // MUTANT",
    voorstel: "eis(roep(SOPHIE, 'apiMigratieV79', 'kansen').gewonnen === 2, 'stap kansen telt de gewonnen kansen');" },
  { id: 'klant_zonder_basis_nieuw', gebied: 'sturing (v7.9.4)', invariant: 'zonder project of winst in het vorige schooljaar blijft de klant leeg (zonderBasis), nooit een geschat nieuw',
    zoek: "      if (!kb || !Object.keys(kb).some(function (sl) { return zeker(kb[sl]); })) basis = false;",
    vervang: "      if (!kb) basis = false;  // MUTANT",
    voorstel: "eis(z.zonderBasis === 1 && k1z.klant === '', 'zonder gegevens van vorig jaar blijft de klant leeg');" },
  // v7.9.4 (bouwpunt 6): een bedrijfsdoel in Doelen met een andere soort of periode dan het jaardoel is een tweede jaardoel buiten het register
  { id: 'noemer_bedrijfsdoel_genegeerd', gebied: 'sturing (v7.9.4)', invariant: 'noemerbewaking meldt een bedrijfsdoel met een andere soort of periode dan het jaardoel',
    zoek: "    bedrijfsdoelen.forEach(function (d) { if (!gelijk(d, N.soort, N.periode, N.jaardoel) && !(N.ok && gelijk(d, 'contractwaarde', 'schooljaar', N.waarde))) af('noemerbewaking', 'beheerder', 'bedrijfsdoel', d.id); });",
    vervang: "    // MUTANT: geen bedrijfsdoelen",
    voorstel: "eis(nb(cw, jaarDoel).stand === 'gezakt', 'een bedrijfsdoel per kalenderjaar naast een jaardoel per schooljaar zakt noemerbewaking');" },
  // v7.9.4 (bouwpunt 17): "post-AP" en "follow-up" zijn geen AP
  { id: 'post_ap_als_ap', gebied: 'fasen (v7.9.4)', invariant: 'faseVanNaam herkent post-AP en follow-up niet als AP (geen rol op naam)',
    zoek: "  if (FASE_ONTKENNING.test(x) || FASE_ONDUIDELIJK.test(x)) return '';",
    vervang: "  if (FASE_ONTKENNING.test(x)) return '';  // MUTANT",
    voorstel: "eis(ctx.faseVanNaam('Post-AP') === '', 'post-AP is geen AP');" },
  // v7.9.4 (bouwpunt 19): de bedrijfsmetriek contractwaarde valt niet terug op de omzet (een schatting)
  { id: 'contractwaarde_terugval_omzet', gebied: 'één definitie per naam (v7.9.4)', invariant: 'contractwaardeSchooljaar telt alleen Trajecten.contractwaarde',
    zoek: "function contractwaardeSchooljaar(ts, sj) { return projectenVanSchooljaar(ts, sj).reduce(function (s, t) { return s + (Number(t.contractwaarde) > 0 ? Number(t.contractwaarde) : 0); }, 0); }",
    vervang: "function contractwaardeSchooljaar(ts, sj) { return projectenVanSchooljaar(ts, sj).reduce(function (s, t) { return s + (Number(t.contractwaarde) || Number(t.omzet) || 0); }, 0); }  // MUTANT",
    voorstel: "eis(ctx.bedrijfCijfers().cijfers.contractwaarde === som, 'contractwaarde zonder terugval op de omzet');" },
  // v7.9.4 (bouwpunt 4): M08 telt de getekende contractwaarde van het project. Telt hij weer Fasewissels.waarde, dan komt bij een wissel uit de tijdlijn, Capsule
  // of een import de geschatte kanswaarde in het cijfer (de echte stand: alle winsten uit de tijdlijnomzetting)
  { id: 'm08_geschatte_waarde', gebied: 'sturing (v7.9.4)', invariant: 'M08 telt Trajecten.contractwaarde, nooit Fasewissels.waarde; een winst zonder project staat apart',
    zoek: "    var v = uitMap(cw08, String(w.kansId)) || 0, dezeMaand = w.werkelijkeDatum >= maandStart;",
    vervang: "    var v = Number(w.waarde) || 0, dezeMaand = w.werkelijkeDatum >= maandStart;  // MUTANT",
    voorstel: "eis(mtCijfers().gewonnenWaarde.waarde === M0.waarde, 'een winst met alleen een geschatte waarde op de wissel telt niet in M08');" },
  { id: 'teamcijfer_geschatte_waarde', gebied: 'sturing (v7.9.4)', invariant: 'het teamcijfer gewonnenWaarde (M08 per OC) telt de getekende contractwaarde, niet Fasewissels.waarde',
    zoek: "var v = uitMap(CW, String(w.kansId)) || 0; tel(w.eigenaar, 'gewonnenWaarde', v, v > 0 ? 0 : 1);",
    vervang: "var v = Number(w.waarde) || 0; /* MUTANT */ tel(w.eigenaar, 'gewonnenWaarde', v, v > 0 ? 0 : 1);",
    voorstel: "eis(team() === t0, 'de schatting op de wissel telt niet in het teamcijfer');" },
  // v7.9.4 (bouwpunt 7): een stand op een eerdere peildatum. Negeert de reconstructie de peildatum, dan geeft een bevroren of ingehaalde stand stil de fase van vandaag
  { id: 'peildatum_genegeerd', gebied: 'sturing (v7.9.4)', invariant: 'M04, M06 en M18–M20 rekenen op een eerdere peildatum met de fase uit Fasewissels, niet met de fase van nu',
    zoek: "  if (!peildatum || peildatum >= vandaag) return { kansen: kansen, onbekend: 0, contactOnbekend: 0, gereconstrueerd: false };",
    vervang: "  if (true) return { kansen: kansen, onbekend: 0, contactOnbekend: 0, gereconstrueerd: false };  // MUTANT",
    voorstel: "eis(d('gecontracteerd') === 7000, 'op de peildatum telt alleen de kans die toen al gewonnen was');" },
  { id: 'reconstructie_gat_genegeerd', gebied: 'sturing (v7.9.4)', invariant: 'een keten met een gat (een wissel zonder werkelijke datum rond de peildatum) blokkeert het cijfer: stand alleen voor vandaag',
    zoek: "      if (j + 1 < l.length ? klein(l[j + 1].van) !== klein(fase) : klein(fase) !== klein(k.fase)) { onbekend++; return; }  // de keten sluit niet",
    vervang: "      // MUTANT: de keten wordt niet gecontroleerd",
    voorstel: "eis(/^stand alleen voor vandaag/.test(S2.gecontracteerd.geblokkeerd), 'niet te reconstrueren = geblokkeerd');" },
  { id: 'facturatie_hele_maand', gebied: 'sturing (v7.9.4)', invariant: 'M26 en M28 tellen in een stand alleen termijnen die t/m de peildatum verzonden of betaald waren',
    zoek: "    if (opPeil && v && v.datum > peildatum) v = null;\n    if (opPeil && b && b.datum > peildatum) b = null;",  // herstel r6: de lus van M26 en M28
    vervang: "    // MUTANT: alles telt, ook na de peildatum",
    voorstel: "eis(dP('gefactureerd') === gef, 'gefactureerd t/m de peildatum');" },
  // v7.9.4 (bouwpunt 8): Prognoses.gemaakt en .maand als tekst. Leest een bestaand tabblad '2026-11' als datum, dan wordt de maand '00:00': bevriezen is niet
  // idempotent en Financiën vindt de bevroren prognose niet terug
  { id: 'prognose_maand_als_tijd', gebied: 'financiën (v7.9.4)', invariant: 'een Date in Prognoses.gemaakt of .maand wordt weer jjjj-mm',
    zoek: "    if (kolom === 'periodeSleutel' || kolom === 'gemaakt' || kolom === 'maand') return Utilities.formatDate(v, tz(), 'yyyy-MM');",
    vervang: "    if (kolom === 'periodeSleutel') return Utilities.formatDate(v, tz(), 'yyyy-MM');  // MUTANT",
    voorstel: "eis(b2.al === true, 'een tweede keer bevriezen in dezelfde maand schrijft niets');" },
  // v7.9.4 (bouwpunt 9): een eigen facturatievorm met een soort. Kijkt facturatieSoort alleen naar vooraf en achteraf, dan volgen prognose en "achter" de soort niet
  { id: 'soort_facturatie_genegeerd', gebied: 'financiën (v7.9.4)', invariant: 'een eigen facturatievorm volgt zijn soort (vooraf of achteraf) in de prognose en de status achter',
    zoek: "  var s = uitMap(facturatieSoorten(), w); if (s === undefined) s = uitMap(facturatieSoorten(), klein(w));",
    vervang: "  var s;  // MUTANT: geen eigen soort",
    voorstel: "eis(ctx.facturatieSoort('per toetsweek') === 'achteraf', 'per toetsweek is achteraf');" },
  { id: 'soort_kwijt_bij_oude_app', gebied: 'financiën (v7.9.4)', invariant: 'een oudere app die de lijst opslaat (alleen waarde en oud) laat de soorten staan',
    zoek: "      var oudS = facturatieSoorten(), nieuwS = {};",
    vervang: "      var oudS = facturatieSoorten(), nieuwS = {}; oudS = {};  // MUTANT",
    voorstel: "eis(s2['vooraf in termijnen'] === 'vooraf', 'een oudere app houdt de soort');" },
  // v7.9.4 herstel r1 (K1, R794-2): stap kansen schrijft het schooljaar van een winst alleen uit het project. Neemt hij de akkoorddatum, dan komt een voorjaarsdeal
  // blijvend in het vorige schooljaar (Kansen.schooljaar gaat in M04 voor het project, ook als dat later komt)
  { id: 'stap_kansen_akkoord_schooljaar', gebied: 'sturing (v7.9.4 herstel r1)', invariant: 'stap kansen vult het schooljaar van een winst alleen uit het project, nooit uit de akkoorddatum',
    zoek: "    var sj = won ? winstSchooljaar(k, uitMap(tSj, String(k.id)), '') :",
    vervang: "    var sj = won ? winstSchooljaar(k, uitMap(tSj, String(k.id)), k.gesloten) :  /* MUTANT */",
    voorstel: "eis(vj.schooljaar === '', 'een voorjaarsdeal zonder project krijgt geen schooljaar uit de akkoorddatum');" },
  // v7.9.4 herstel r1 (K3, R794-3): één volgorde voor het schooljaar van een winst. Gaat de akkoorddatum voor het project, dan toetsen de contracten een winst die M04
  // voor dit schooljaar telt niet (het datakwaliteitsoverzicht ziet de onbekende klant in M04 niet)
  { id: 'winst_akkoord_voor_project', gebied: 'sturing (v7.9.4 herstel r1)', invariant: 'winstSchooljaar: Kansen.schooljaar, dan het project, dan de akkoorddatum (M04 en de contracten gelijk)',
    zoek: "  if (projectSj) return String(projectSj);\n  var d = String(akkoord || '').slice(0, 10);\n  return d && parseDatum(d) ? schooljaarVan(d) : '';",
    vervang: "  var d = String(akkoord || '').slice(0, 10);\n  if (d && parseDatum(d)) return schooljaarVan(d);  // MUTANT\n  return projectSj ? String(projectSj) : '';",
    voorstel: "eis(kAf.indexOf('rk-w6') >= 0, 'een voorjaarsdeal met een project in dit schooljaar telt in de contracten van dit schooljaar');" },
  // v7.9.4 herstel r1 (K6): een Capsule-wissel '' → gewonnen na Kansen.aangemaakt is geen aanmaak. Is hij dat wel, dan verdwijnt de kans op een eerdere peildatum
  // stil uit M04, M06, M18 en M19 (onbekend blijft 0, dus geen blokkade)
  { id: 'capsule_wissel_als_aanmaak', gebied: 'sturing (v7.9.4 herstel r1)', invariant: 'een eerste wissel zonder van na de aanmaakdatum maakt de fase op een eerdere peildatum onbekend (geblokkeerd), niet afwezig',
    zoek: "    else if (l.length && !l[0].van && (!aangemaakt || String(l[0].werkelijkeDatum).slice(0, 10) <= aangemaakt)) return;",
    vervang: "    else if (l.length && !l[0].van) return;  // MUTANT (herstel r2: de regel ervóór vangt gewonnen en verloren al; de rooktest toetst ook een open fase na de aanmaak)",
    voorstel: "eis(kp.onbekend === 1, 'een Capsule-winst na de aanmaak blokkeert de stand op een eerdere peildatum');" },
  // v7.9.4 herstel r2: tien mutanten voor de bevindingen van review ronde 2 (A-B3 tot A-B7, B-B1, B-B4, B-B5 en B-B9)
  { id: 'klant_zonder_school_nieuw', gebied: 'sturing (v7.9.4 herstel r2)', invariant: 'stap kansen geeft een kans zonder te vinden school geen geschat nieuw (A-B3)',
    zoek: "      else if (!s) basis = false;  // herstel r2 (A-B3): zonder school geen zekere basis voor nieuw",
    vervang: "      // MUTANT: zonder school toch nieuw",
    voorstel: "eis(!pv('rk2-k2').klant, 'een kans zonder te vinden school krijgt geen geschat nieuw');" },
  { id: 'hernoemd_achteraf_zonder_soort', gebied: 'financiën (v7.9.4 herstel r2)', invariant: 'vooraf of achteraf hernoemen houdt de soort (A-B4)',
    zoek: "      FACTUUR_SOORTEN.forEach(function (k) { var n = uitMap(hernoem, k); if (n !== undefined && FACTUUR_SOORTEN.indexOf(n) < 0) nieuwS[n] = k; delete nieuwS[k]; });",
    vervang: "      // MUTANT: vooraf en achteraf hernoemd verliezen hun soort",
    voorstel: "eis(r4.soortFacturatieSoorten['achteraf per maand'] === 'achteraf', 'achteraf hernoemd blijft achteraf');" },
  { id: 'meteen_gewonnen_bestond_niet', gebied: 'sturing (v7.9.4 herstel r2)', invariant: 'een kans die meteen als gewonnen is ingevoerd, heeft vóór het akkoord een onbekende fase, niet afwezig (A-B5)',
    zoek: "    } else if (l.length && !l[0].van && !kansOpen({ fase: String(l[0].naar) }) && (!aangemaakt || String(l[0].werkelijkeDatum).slice(0, 10) <= aangemaakt)) { onbekend++; return; }",
    vervang: "    } else if (false) { onbekend++; return; }  // MUTANT",
    voorstel: "eis(a45.onbekend === 1, 'meteen gewonnen: de fase vóór het akkoord is onbekend');" },
  { id: 'teamrapport_zonder_leden_nul', gebied: 'sturing (v7.9.4 herstel r2)', invariant: 'Rapporten → Teams geeft een team zonder leden per cijfer null met de reden, nooit 0 (A-B6)',
    zoek: "var blok = blok0; if (tb && !naam) {",
    vervang: "var blok = blok0; if (false && tb && !naam) {  /* MUTANT */",
    voorstel: "eis(T1.cijfers.contactmomenten === null, 'zonder OC\\'s is het teamtotaal geblokkeerd');" },
  { id: 'later_betaald_stil', gebied: 'financiën (v7.9.4 herstel r2)', invariant: 'M28 op een eerdere peildatum noemt de termijnen die later als betaald zijn vastgelegd (A-B7)',
    zoek: "    if (opPeil && betaaldVan(x)) f.later++;",  // herstel r6: de lus van M28 in sturingCijfers
    vervang: "    // MUTANT: geen signaal",
    voorstel: "eis(lb === 1, 'M28 noemt de later betaalde termijnen');" },
  { id: 'noemer_tegen_jaardoel', gebied: 'sturing (v7.9.4 herstel r2)', invariant: 'noemerbewaking vergelijkt een bedrijfsdoel met de noemer van het MT-overzicht, ook bij een afgeleid contracteerdoel (B-B1)',
    zoek: " && !(N.ok && gelijk(d, 'contractwaarde', 'schooljaar', N.waarde))",
    vervang: " /* MUTANT: alleen het jaardoel */",
    voorstel: "eis(g1.stand === 'geslaagd', 'een bedrijfsdoel gelijk aan het afgeleide contracteerdoel is geen afwijking');" },
  { id: 'ouderdom_tot_vandaag', gebied: 'financiën (v7.9.4 herstel r2)', invariant: 'M28 in een stand rekent de ouderdom tot de peildatum, op elke dag van de maand (B-B4)',
    zoek: "var oud = dagenTussen(v.datum, opPeil ? peildatum : vandaag) || 0;",  // herstel r6: de lus van M28 in sturingCijfers
    vervang: "var oud = dagenTussen(v.datum, vandaag) /* MUTANT */ || 0;",
    voorstel: "eis(ud(F0, F1, '0-30 dagen') === 1900, 'P−30 valt op de peildatum in 0–30');" },
  { id: 'stilstand_contact_genegeerd', gebied: 'sturing (v7.9.4 herstel r2)', invariant: 'M20 is geblokkeerd als het laatste contact op de peildatum onbekend is (B-B5)',
    zoek: "  var stilBlok = standBlok || standBlokkade(stand.contactOnbekend, peildatum, 'het laatste contact');",
    vervang: "  var stilBlok = standBlok;  // MUTANT",
    voorstel: "eis(/^stand alleen voor vandaag/.test(S5.stilstand.geblokkeerd), 'M20 geblokkeerd bij een onbekend laatste contact');" },
  { id: 'overstapstand_alleen_open', gebied: 'sturing (v7.9.4 herstel r2)', invariant: 'het datakwaliteitsblok (overstapStand) telt open en gewonnen kansen, zoals stap kansen (B-B9)',
    zoek: "var kp = kansenAanvulPlan(), grens = datumStr(plusDagen(-30)) + ' 00:00';",
    vervang: "var kp = (function () { var o = lees('Kansen').filter(kansOpen); return { zonderSchooljaar: o.filter(function (k) { return !k.schooljaar; }).length, zonderKlant: o.filter(function (k) { return !k.klant; }).length, zonderBasis: 0 }; })(), grens = datumStr(plusDagen(-30)) + ' 00:00';  // MUTANT",
    voorstel: "eis(ctx.overstapStand().zonderSchooljaar === os0 + 1, 'overstapStand telt een winst zonder schooljaar');" },
  { id: 'aangemaakt_na_peildatum_telt', gebied: 'sturing (v7.9.4 herstel r2)', invariant: 'een kans zonder wissels die na de peildatum is aangemaakt, bestond op de peildatum niet (B-B9)',
    zoek: "    else if (aangemaakt && aangemaakt > peildatum) return;       // bestond nog niet",
    vervang: "    // MUTANT: bestond altijd",
    voorstel: "eis(!kn9.kansen.length && kn9.onbekend === 0, 'een kans van na de peildatum telt niet');" },
  // v7.9.4 herstel r3 (review ronde 3): zes erbij
  { id: 'm04_zonder_getekend_nul', gebied: 'sturing (v7.9.4 herstel r3)', invariant: 'zijn er winsten maar heeft geen enkele een getekende waarde, dan is M04 leeg (en M05-achter en M07 ook), nooit 0 (R3-D1)',
    zoek: "  var m04Leeg = (zonderGetekend > 0 || zonderSj04 > 0) && !(totM04 > 0),",  // herstel r6: ook zonder schooljaar
    vervang: "  var m04Leeg = false /* MUTANT */,",
    voorstel: "eis(M.M04.waarde === '' && M.M07.waarde === '', 'M04 en M07 leeg bij winsten zonder getekende waarde');" },
  { id: 'm08_maand_nul', gebied: 'sturing (v7.9.4 herstel r3)', invariant: 'de maand van M08 is leeg als de deals van de maand geen getekende waarde hebben (R3-N1, R2)',
    zoek: "  if (maand08.aantal && maand08.aantal === maand08.zonderGetekend) maand08.waarde = null;",
    vervang: "  if (false) maand08.waarde = null;  // MUTANT",
    voorstel: "eis(M.M08.extra.maand.waarde === null, 'de maand van M08 is leeg zonder getekende waarde');" },
  { id: 'rapport_winst_kanswaarde', gebied: 'rapporten (v7.9.4 herstel r3)', invariant: 'apiRapport telt bij gewonnen waarde de getekende contractwaarde, niet Kansen.waarde (R3)',
    zoek: "  var w = 0, zonder = 0; gew.forEach(function (k) { var v = uitMap(cwK, String(k.id)) || 0;",
    vervang: "  var w = 0, zonder = 0; gew.forEach(function (k) { var v = Number(k.waarde) || 0;  /* MUTANT */",
    voorstel: "eis(R1.winst.gewonnenWaarde === null, 'apiRapport: winsten zonder getekende waarde zijn leeg');" },
  { id: 'm09_geen_hele_maand_nul', gebied: 'sturing (v7.9.4 herstel r3)', invariant: 'zonder hele maand in het schooljaar is M09 leeg, zonder basislijn per schooljaar, nooit 0 (R4)',
    zoek: "    : !heel.length ? { waarde: null, extra: { maanden: maanden09, reden: M09_GEEN_MAAND, totEnMet: '' } }",
    vervang: "    : false ? null  // MUTANT",
    voorstel: "eis(U0.waarde === '' && !U0.extra.basislijn, 'M09 in augustus leeg');" },
  { id: 'm20_terugval_aanmaak', gebied: 'sturing (v7.9.4 herstel r3)', invariant: 'een kans zonder laatste contact is op een eerdere peildatum niet stil, net als vandaag (N1)',
    zoek: "      if (lc && lc > peildatum) {",
    vervang: "      if (!lc || lc > peildatum) {  // MUTANT",
    voorstel: "eis(G1.waarde === G0.waarde, 'M20 gisteren: een kans zonder laatste contact is niet stil');" },
  { id: 'contractwaarde_leeg_als_nul', gebied: 'bedrijfscijfers (v7.9.4 herstel r3)', invariant: 'projecten zonder één contractwaarde: het bedrijfscijfer contractwaarde is leeg, geen 0 (N2)',
    zoek: "  if ((m === 'gewonnenWaarde' || m === 'contractwaarde') && x.n && !x.t) return null;",
    vervang: "  if (m === 'gewonnenWaarde' && x.n && !x.t) return null;  // MUTANT",
    voorstel: "eis(bc.cijfers.contractwaarde === null, 'contractwaarde leeg zonder één contractwaarde');" },
  // v7.9.4 herstel r4 (review ronde 4): twee erbij
  { id: 'deel_zonder_getekend_weg', gebied: 'sturing (v7.9.4 herstel r4)', invariant: 'een deel nieuw/bestaand met alleen winsten zonder getekende waarde staat in de uitsplitsing van M04 en M08 leeg, niet weg (R4-2b)',
    zoek: "return KLANT_DELEN.filter(function (d) { return o[d] || (zonder && zonder[d]); })",
    vervang: "return KLANT_DELEN.filter(function (d) { return o[d]; /* MUTANT */ })",
    voorstel: "eis(deel(M.M04, 'nieuw').waarde === null, 'het deel nieuw is leeg, niet weg');" },
  { id: 'dekking_zonder_getekend_weg', gebied: 'sturing (v7.9.4 herstel r4)', invariant: 'deels getekend: M07 noemt het aantal winsten zonder getekende waarde, dat niet meetelt (R4-3)',
    zoek: "noemerLabel: N.label, scope: scopeTekst, zonderGetekend: zonderGetekend };",
    vervang: "noemerLabel: N.label, scope: scopeTekst };  // MUTANT",
    voorstel: "eis(M.M07.extra.zonderGetekend === 1, 'M07 noemt de winsten zonder getekende waarde');" },
  // v7.9.4 herstel r5 (review ronde 5): twee erbij
  { id: 'stilstand_zonder_contact_nul', gebied: 'sturing (v7.9.4 herstel r5)', invariant: 'heeft geen open kans een laatste contact, dan is M20 leeg met het aantal ernaast, geen stille 0 (R5-C1)',
    zoek: "if (zonderC && zonderC === open.length) exS.reden = M20_LEEG;",
    vervang: "/* MUTANT */",
    voorstel: "eis(op(vandaag).stilstand.waarde === '', 'M20 leeg zonder één laatste contact');" },
  { id: 'getekend_alleen_op_akkoord', gebied: 'datacontracten (v7.9.4 herstel r5)', invariant: 'contract gewonnen_is_getekend toetst ook een winst van dit schooljaar (winstSchooljaar) met een akkoord vóór 1 augustus (R5-C2)',
    zoek: "  winstNu.forEach(function (k) {\n    if (uitMap(t14, String(k.id))) return;",
    vervang: "  winstNu.forEach(function (k) {\n    return;  // MUTANT\n    if (uitMap(t14, String(k.id))) return;",
    voorstel: "eis(contractenOp().gewonnen_is_getekend.stand === 'gezakt', 'een winst van dit schooljaar zonder getekende waarde zakt');" },
  // v7.9.4 harnasdekking (7): één erbij
  { id: 'm26_definitie_per_maand', gebied: 'register (v7.9.4 harnasdekking)', invariant: 'de definitie van M26 is de som over het schooljaar t/m de peildatum, geen maandcijfer, zoals sturingCijfers rekent',
    zoek: "'De som van de facturen van dit schooljaar: de termijnen met een verzenddatum vanaf 1 augustus, van elk bestaand project (zoals Financiën; ook een slottermijn van een project van vorig schooljaar; Exact telt op factuurdatum ook een factuur zonder project in Athena), opgeteld over het schooljaar t/m de peildatum (geen maandcijfer; op de dag zelf t/m het eind van die maand, zoals Financiën), met creditnota",
    vervang: "'De som van termijnen met een verzenddatum in de maand, met creditnota",
    voorstel: "eis(!/in de maand/.test(ctx.METRIEKEN.gefactureerd.definitie), 'M26 is geen maandcijfer');" },
  // v7.9.4 herstel r6: zes erbij (R6-1 twee, R6-2 twee, de nits R6-3 en R6-4)
  { id: 'm26_alleen_projecten_sj', gebied: 'sturing (v7.9.4 herstel r6)', invariant: 'M26 en M28 tellen de facturen van dit schooljaar van elk project, ook een slottermijn van een project van vorig schooljaar (R6-1)',
    zoek: "  Object.keys(D.fac).forEach(function (id) { if (tBest[id]) D.fac[id].forEach(function (x) {",
    vervang: "  Object.keys(D.fac).forEach(function (id) { var t0 = ts.filter(function (t) { return t.id === id; })[0]; if (!t0 || String(t0.schooljaar) !== sj) return; /* MUTANT */ D.fac[id].forEach(function (x) {",
    voorstel: "eis(dV('gefactureerd') === 3000, 'M26 telt de slottermijn van een project van vorig schooljaar');" },
  { id: 'm28_alle_datums', gebied: 'sturing (v7.9.4 herstel r6)', invariant: 'M28 telt alleen de facturen van dit schooljaar (verzonden vanaf 1 augustus), geen open termijn van juli (R6-1)',
    zoek: "    if (!v || v.datum < sjStart) return;\n    if (maandVan(v.datum) <= nuM) f.gefactureerd += c;",
    vervang: "    if (!v) return;  // MUTANT\n    if (v.datum >= sjStart && maandVan(v.datum) <= nuM) f.gefactureerd += c;",
    voorstel: "eis(dV('openstaand') === 3000, 'M28 telt geen open termijn van juli');" },
  { id: 'm04_zonder_schooljaar_stil', gebied: 'sturing (v7.9.4 herstel r6)', invariant: 'een winst zonder schooljaar telt bij M04 apart; zonder getekende winst van het schooljaar is M04 dan leeg, geen echte 0 (R6-2)',
    zoek: "if (!wsj) zonderSj04++;",
    vervang: "if (!wsj && false) zonderSj04++;  /* MUTANT */",
    voorstel: "eis(M.M04.waarde === '' && M.M04.extra.zonderSchooljaar === 2, 'M04 leeg bij winsten zonder schooljaar');" },
  { id: 'contract16_zonder_sj_weg', gebied: 'datacontracten (v7.9.4 herstel r6)', invariant: 'contract kans_heeft_schooljaar_en_klant toetst ook een winst zonder schooljaar (R6-2)',
    zoek: "open.concat(winstNu, S.kansen.filter(function (k) { return k.fase === 'gewonnen' && !winstVanSj(k); }))",
    vervang: "open.concat(winstNu, S.kansen.filter(function (k) { return false && k.fase === 'gewonnen' && !winstVanSj(k); }))",
    voorstel: "eis(contractenOp().kans_heeft_schooljaar_en_klant.stand === 'gezakt', 'een winst zonder schooljaar zakt');" },
  { id: 'contract14_dubbel_geteld', gebied: 'datacontracten (v7.9.4 herstel r6)', invariant: 'contract gewonnen_is_getekend telt een winst één keer, ook als de slot-lus en de winsten van het schooljaar hem allebei zien (nit R6-3)',
    zoek: "    if (inSj(w.werkelijkeDatum || String(w.ingevoerdOp || '').slice(0, 10))) { telP('gewonnen_is_getekend'); t14[k] = true; }",
    vervang: "    if (inSj(w.werkelijkeDatum || String(w.ingevoerdOp || '').slice(0, 10))) { telP('gewonnen_is_getekend'); }  // MUTANT",
    voorstel: "eis(C14.populatie === 1 && C14.afwijkingen.length === 1, 'één winst telt één keer');" },
  { id: 'm20_capsule_aanmaak', gebied: 'sturing (v7.9.4 herstel r6)', invariant: 'op een eerdere peildatum valt alleen een kans uit Athena terug op de aanmaak; een Capsule-kans zonder contact t/m die dag is zonder laatste contact (nit R6-4)',
    zoek: "        var eigen = !k.capsuleId;",
    vervang: "        var eigen = true;  // MUTANT",
    voorstel: "eis(S20.waarde === 1 && S20.extra.zonderContact === 2, 'Capsule-kans zonder contact op de peildatum is niet stil');" },
  // v7.9.4 herstel r7: twee erbij (R7-D3 en R7-2)
  { id: 'm26_wees_telt', gebied: 'sturing (v7.9.4 herstel r7)', invariant: 'M26 en M28 tellen een termijn zonder bestaand project niet, zoals Financiën (R7-D3)',
    zoek: "  Object.keys(D.fac).forEach(function (id) { if (tBest[id]) D.fac[id].forEach(function (x) {",
    vervang: "  Object.keys(D.fac).forEach(function (id) { if (tBest || true) D.fac[id].forEach(function (x) {  /* MUTANT */",
    voorstel: "eis(c(N2.gefactureerd.waarde) === f2, 'M26 gelijk aan Financiën na het verwijderen van een project');" },
  { id: 'dekking_zonder_sj_weg', gebied: 'sturing (v7.9.4 herstel r7)', invariant: 'naast een getekende winst noemen M05 en M07 de winsten zonder schooljaar (telt niet mee) (R7-2)',
    zoek: "  if (x07 && zonderSj04) x07.zonderSchooljaar = zonderSj04;",
    vervang: "  /* MUTANT */",
    voorstel: "eis(M.M07.extra.zonderSchooljaar === 1, 'M07 noemt de winst zonder schooljaar');" }
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
// Oordeel: ≥ 69 van 70 gedood (v7.9.4 herstel r7: twee erbij; herstel r6: zes erbij, ≥ 67 van 68; harnasdekking: één erbij, ≥ 61 van 62; herstel r5: twee erbij, ≥ 60 van 61; herstel r4: twee erbij, ≥ 58 van 59; herstel r3: zes erbij, ≥ 56 van 57; herstel r2: tien erbij, ≥ 50 van 51; herstel r1: drie erbij, ≥ 40 van 41; v7.9.4: negen mutanten in stap 1 en acht in stap 2 erbij, ≥ 37 van 38); daarvoor ≥ 20 van 21 (v7.9.3 na review r3; na review r2 ≥ 19 van 20; na review r1 ≥ 18 van 19; v7.9.3 ≥ 17 van 18; v7.9.2 na review r1 ≥ 16 van 17; daarvoor ≥ 15 van 16; v7.9 na de review ≥ 14 van 15; was ≥ 11 van 12, daarvoor ≥ 9 van 10) en alle mutanten toegepast. Eén overlevende is dus toegestaan maar staat hierboven als FOUT (een gat in de rooktest).
if (resultaat.geslaagd) console.log('ALLES GOED' + (overleefd ? ' (met ' + overleefd + ' overlevende mutant: zie de FOUT-regel hierboven)' : ''));
else console.log('FOUTEN: ' + fouten);
process.exit(resultaat.geslaagd ? 0 : 1);
