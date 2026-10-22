// v7.2: mutatietest van de rooktest. Tien mutanten breken elk één invariant in een KOPIE van backend/Code.gs (het origineel blijft
// onaangeraakt); per mutant draait `CODE_GS=<kopie> node test/node_rooktest.js`. Een mutant is "gedood" als de rooktest faalt
// (exitcode ≠ 0, crash of timeout) en "OVERLEEFD" als hij ALLES GOED geeft: dan mist de rooktest een eis(...) voor die invariant.
// Gebruik: node test/mutatie_test.js [--map <kopieënmap>]  → "ALLES GOED" bij ≥ 9 van 10 gedood (exitcode 0), anders "FOUTEN: n" (exitcode 1).
// Resultaat als json in test/shots/robuust/mutatie.json (staat in .gitignore).
var fs = require('fs'), path = require('path'), cp = require('child_process');
var R = path.join(__dirname, '..'), BRON = path.join(R, 'backend/Code.gs'), ROOKTEST = path.join(__dirname, 'node_rooktest.js');
var UIT_MAP = path.join(R, 'test/shots/robuust'), UIT = path.join(UIT_MAP, 'mutatie.json');
var TIMEOUT_MS = 120000, MIN_GEDOOD = 9;

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
    voorstel: "eis(!portaal(TOKEN, 'apiTalent', 'tl2').ok && /onbekende functie/.test(portaal(TOKEN, 'apiTalent', 'tl2').fout), 'portaal: andere api-functies zijn via een token niet aan te roepen');" }
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
  if (isGedood) { gedood++; eis(true, 'gedood    ' + (i + 1) + '/10 ' + m.id + ' [' + m.gebied + '] — ' + (u.eersteFouten[0] || ('exitcode ' + u.status)).slice(0, 160)); }
  else { overleefd++; eis(false, 'OVERLEEFD ' + (i + 1) + '/10 ' + m.id + ' [' + m.gebied + '] — ' + m.invariant + '\n     voorstel voor node_rooktest.js: ' + m.voorstel); }
  resultaat.mutanten.push(r);
});

var looptijdS = Math.round((Date.now() - t0) / 100) / 10;
resultaat.gedood = gedood; resultaat.overleefd = overleefd; resultaat.looptijdS = looptijdS;
resultaat.geslaagd = gedood >= MIN_GEDOOD && resultaat.mutanten.every(function (r) { return r.toegepast; });
fs.writeFileSync(UIT, JSON.stringify(resultaat, null, 2));
console.log('     ' + gedood + ' van ' + MUTANTEN.length + ' gedood, ' + overleefd + ' overleefd; json: ' + path.relative(R, UIT) + '; looptijd ' + looptijdS + ' s');
// Oordeel: ≥ 9 van 10 gedood en alle mutanten toegepast. Eén overlevende is dus toegestaan maar staat hierboven als FOUT (een gat in de rooktest).
if (resultaat.geslaagd) console.log('ALLES GOED' + (overleefd ? ' (met ' + overleefd + ' overlevende mutant: zie de FOUT-regel hierboven)' : ''));
else console.log('FOUTEN: ' + fouten);
process.exit(resultaat.geslaagd ? 0 : 1);
