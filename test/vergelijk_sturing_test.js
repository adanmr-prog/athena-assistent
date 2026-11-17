/* Athena Assistent — v7.9 (bouwpunt 12): test van het vergelijkingsharnas test/vergelijk_sturing.js op de verzonnen demoseed.
 * Maakt in een tijdelijke map (os.tmpdir(), buiten de repo) een export van de demoseed, een Exact- en een XPS-export die met die stand
 * kloppen en een gewijzigde kopie van elk, en referenties met regels die geslaagd, geblokkeerd, definitie, invoer, bron en onverklaard
 * moeten geven. Controleert ook het patroon van elke uitvoerregel, dat er geen naam, schoolnaam of bedrag in de uitvoer staat, dat een
 * invoerfout alleen bestand, regelnummer en kolomnaam noemt, dat een pad binnen de repo geweigerd wordt en dat de tijdelijke map weg is.
 * v7.9.4 (bouwpunten 11–15, docs/sturing-v7.9.md §3c en §7.11): ook een lege stand zoals de echte (geen OC-accounts, geen open of verloren kansen, geen
 * projecten, termijnen of uren): een team zonder leden is geblokkeerd (ook contactmomenten, afsprakenGehouden en gewonnen), een contract met de stand
 * "leeg" en een open overstapstap (fasen, de Capsule-stand, de accounts, redenen zonder verloren kansen) zijn invoer, een cijfer zonder waarde is
 * "leeg (geen basis)"; diensten zonder gekoppeld talent of project tellen mee in het maandtotaal en geven een melding zonder aantal; twee Exact-invoeren
 * (--exact-verkoop, --exact-open) en een export zonder Open (geblokkeerd); exitcode 0, 1 of 2. Draait aan het eind test/urenbasislijn_test.js (bouwpunt 10).
 *   node test/vergelijk_sturing_test.js   → ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1) */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process');
var R = path.join(__dirname, '..'), HARNAS = path.join(__dirname, 'vergelijk_sturing.js'), H = require('./vergelijk_sturing.js');
// v7.9.4: geblokkeerd met een vaste soort (of zonder), en leeg (geen basis)
var PATROON = /^(M\d{2}|[a-zA-Z]+) \S+ (geslaagd|geblokkeerd( \((besluit|extern|rollen|redenen|geen leden|stand|export zonder Open|export zonder betaaldatum)\))?|leeg \(geen basis\)|gezakt \((definitie|invoer|bron|onverklaard)\))$/;  // herstel r1 (K7): stand
var MELDING = /^melding: /;

var fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }

/* ---- 1. de demoseed als export (het formaat van server/migratie.js --bewaar) ---- */
function nieuweContext() {
  var c = { console: console }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8'), c, { filename: 'demo.js' });
  c.demoStart('');
  return c;
}
function exportVan(c) {
  var bl = JSON.parse(c.demoExport()), e = { tabellen: {}, eigenschappen: bl.props };
  Object.keys(bl.bladen).forEach(function (n) {
    var rijen = bl.bladen[n], kop = rijen[0] || [];
    e.tabellen[n] = rijen.slice(1).filter(function (r) { return r.some(function (x) { return x !== '' && x != null; }); }).map(function (r) { var o = {}; kop.forEach(function (k, i) { o[k] = r[i] == null ? '' : r[i]; }); return o; });
  });
  return e;
}
function kopie(o) { return JSON.parse(JSON.stringify(o)); }
var ctx = nieuweContext();
var vandaag = vm.runInContext('datumStr(new Date())', ctx), sj = ctx.huidigSchooljaar(), sjStart = sj.slice(0, 4) + '-08-01', maand = vandaag.slice(0, 7);
var vorigeWeek = ctx.isoWeekStr(ctx.parseDatum(ctx.plusDagenVan(vandaag, -7)));
var exp = exportVan(ctx);
// Mutaties in de tijdelijke kopie (nooit in de seed): een gewonnen kans met een geschatte waarde die afwijkt van de getekende (oude definitie M08),
// en elke termijn een uniek factuurnummer (zodat het contract termijn_verzonden_heeft_factuurnummer slaagt en M26 tot de bron kan komen)
var kWinId = exp.tabellen.Kansen.filter(function (k) { return k.fase === 'gewonnen' && String(k.gesloten).slice(0, 10) >= sjStart; })[0].id;
function muteer(e) {
  e.tabellen.Kansen.forEach(function (k) { if (k.id === kWinId) k.waarde = Number(k.waarde) + 11400; });
  e.tabellen.Facturen.forEach(function (f, i) { if (f.factuurnummer !== '' || f.verzonden || ['verzonden', 'betaald'].indexOf(f.status) >= 0) f.factuurnummer = String(970000 + i); });
  return e;
}
muteer(exp);

// v7.9.4: dezelfde stand na de overstap (stap fasen toegepast en de Capsule-stand gemigreerd), alleen de Capsule-stand, en een lege stand zoals de echte
var ctxK = nieuweContext(), voorstelF = JSON.parse(ctxK.demoRun('apiMigratieV79', JSON.stringify(['fasen', {}]), 'demo-sophie')).result, koppelF = {};
voorstelF.mijlpalen.forEach(function (m) { if (m.voorstel) koppelF[m.id] = m.voorstel; });
var fasenUit = JSON.parse(ctxK.demoRun('apiMigratieV79', JSON.stringify(['fasen', { toepassen: true, koppeling: koppelF, onderbouwing: 'verzonnen test', besluitdatum: vandaag }]), 'demo-sophie'));
var expK = muteer(exportVan(ctxK)); expK.eigenschappen.CAPSULE_MIGRATIE = vandaag + ' 09:00';
var expC = kopie(exp); expC.eigenschappen.CAPSULE_MIGRATIE = vandaag + ' 09:00';
var expL = kopie(exp), blijft = {};
expL.tabellen.Gebruikers = [];  // geen OC-, AM- of FD-account: het team consultancy heeft geen leden
expL.tabellen.Kansen = expL.tabellen.Kansen.filter(function (k) { return k.fase === 'gewonnen'; });  // alleen winsten, geen open of verloren kansen
expL.tabellen.Kansen.forEach(function (k) { blijft[k.id] = true; });
expL.tabellen.Fasewissels = (expL.tabellen.Fasewissels || []).filter(function (w) { return blijft[w.kansId]; });
['Trajecten', 'Facturen', 'TalentUren', 'TalentUren_archief', 'Talenten', 'Kandidaten', 'Vacatures', 'Datakwaliteit'].forEach(function (t) { if (expL.tabellen[t]) expL.tabellen[t] = []; });

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-harnas-'));
var EXPORT = path.join(TMP, 'export-' + vandaag + '.json'), EXPORT_K = path.join(TMP, 'export-klaar.json'), EXPORT_C = path.join(TMP, 'export-capsule.json'), EXPORT_L = path.join(TMP, 'export-leeg.json');
fs.writeFileSync(EXPORT, JSON.stringify(exp)); fs.writeFileSync(EXPORT_K, JSON.stringify(expK)); fs.writeFileSync(EXPORT_C, JSON.stringify(expC)); fs.writeFileSync(EXPORT_L, JSON.stringify(expL));
eis(!H.binnenRepo(EXPORT) && H.binnenRepo(path.join(R, 'test', 'x.csv')) && H.binnenRepo(R), 'binnenRepo: de tijdelijke map ligt buiten de repo, test/x.csv en de repo zelf erbinnen');
eis(fasenUit.ok && fasenUit.result.toegepast, 'stap fasen is in de kopie voor de stand "overstap klaar" toegepast');

/* ---- 2. een Exact- en een XPS-export die met de stand kloppen, en een gewijzigde kopie van elk ---- */
function verzondenOp(f) { return f.verzonden ? String(f.verzonden).slice(0, 10) : (['verzonden', 'betaald'].indexOf(f.status) >= 0 && f.datum ? String(f.datum).slice(0, 10) : ''); }
function nlDatum(d) { return d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4); }
function nlBedrag(x) { return (Math.round(Number(x) * 100) / 100).toFixed(2).replace('.', ','); }
var exactKop = fs.readFileSync(path.join(R, 'test/voorbeelden/facturen_export.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0];
// extra: bij het bedrag van de eerste factuur; openExtra (v7.9.4): bij de kolom Open van de eerste factuur
function exactCsv(extra, openExtra) {
  var regels = [exactKop], i = 0;
  exp.tabellen.Facturen.forEach(function (f) {
    var v = verzondenOp(f); if (!v) return;
    var bedrag = Number(f.bedrag) + (i === 0 ? extra : 0), betaald = f.status === 'betaald' || !!f.betaald, open = (betaald ? 0 : bedrag) + (i === 0 ? openExtra || 0 : 0); i++;
    regels.push(['"' + nlDatum(v) + '"', '"' + f.factuurnummer + '"', '"Termijn"', '""', '"Debiteur ' + i + '"', '"' + (30000 + i) + '"', '""', '"' + nlBedrag(bedrag) + '"', '"0"', '"' + nlBedrag(open) + '"', '""'].join(';'));
  });
  return regels.join('\n') + '\n';
}
// v7.9.4 (bouwpunt 15): het verkoopboek, zonder kolom Open en zonder betaaldatum
function verkoopCsv(extra) {
  var regels = ['Factuurnummer;Factuurdatum;Debiteur;Omschrijving;Bedrag'], i = 0;
  exp.tabellen.Facturen.forEach(function (f) { var v = verzondenOp(f); if (!v) return; i++; regels.push([f.factuurnummer, nlDatum(v), 'Debiteur ' + i, 'Termijn', nlBedrag(Number(f.bedrag) + (i === 1 ? extra : 0))].join(';')); });
  return regels.join('\n') + '\n';
}
var talent = {}, traject = {}; exp.tabellen.Talenten.forEach(function (t) { talent[t.id] = t; }); exp.tabellen.Trajecten.forEach(function (t) { traject[t.id] = t; });
var xpsKop = fs.readFileSync(path.join(R, 'test/voorbeelden/xps_diensten.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0];
function xpsRegel(dag, uren, xpsId, project) { return [dag, dag + ' 08:30', '', nlBedrag(uren), '', 'Dienst', 'Uitgevoerd', project, '', '', '', xpsId, '', project].join(';'); }
// extraRegels (v7.9.4): verzonnen diensten erbij, zoals een dienst van een flexkracht zonder profiel in Athena
function xpsCsv(extra, extraRegels) {
  var regels = [xpsKop];
  exp.tabellen.TalentUren.forEach(function (u, i) {
    var t = talent[u.talentId] || {}, p = traject[u.trajectId] || {}, dag = ctx.maandagVanWeek(u.week);
    regels.push([dag, dag + ' 08:30', '', nlBedrag(Number(u.uren) + (i === 0 ? extra : 0)), '', 'Dienst', 'Uitgevoerd', u.xpsProject || '', '', '', '', t.xpsId || '', '', p.xpsProject || ''].join(';'));
  });
  return regels.concat(extraRegels || []).join('\n') + '\n';
}
// een dienst van deze maand (de maandag van deze week, of van vorige week als die nog in deze maand valt)
var dienstDag = ctx.maandagVanWeek(ctx.isoWeekStr(ctx.parseDatum(vandaag))); if (dienstDag.slice(0, 7) !== maand) dienstDag = maand + '-01';
var gekoppeldTalent = exp.tabellen.TalentUren.map(function (u) { return talent[u.talentId]; }).filter(function (t) { return t && t.xpsId; })[0];
var EXACT_OK = path.join(TMP, 'facturen_klopt.csv'), EXACT_ANDERS = path.join(TMP, 'facturen_gewijzigd.csv'), XPS_OK = path.join(TMP, 'diensten_klopt.csv'), XPS_ANDERS = path.join(TMP, 'diensten_gewijzigd.csv');
var EXACT_OPEN_ANDERS = path.join(TMP, 'facturen_open_gewijzigd.csv'), VERKOOP_OK = path.join(TMP, 'verkoopboek_klopt.csv'), VERKOOP_ANDERS = path.join(TMP, 'verkoopboek_gewijzigd.csv');
var XPS_ZONDER_TALENT = path.join(TMP, 'diensten_zonder_talent.csv'), XPS_ZONDER_PROJECT = path.join(TMP, 'diensten_zonder_project.csv');
fs.writeFileSync(EXACT_OK, exactCsv(0)); fs.writeFileSync(EXACT_ANDERS, exactCsv(1000)); fs.writeFileSync(EXACT_OPEN_ANDERS, exactCsv(0, 500));
fs.writeFileSync(VERKOOP_OK, verkoopCsv(0)); fs.writeFileSync(VERKOOP_ANDERS, verkoopCsv(1000));
fs.writeFileSync(XPS_OK, xpsCsv(0)); fs.writeFileSync(XPS_ANDERS, xpsCsv(3));
fs.writeFileSync(XPS_ZONDER_TALENT, xpsCsv(0, [xpsRegel(dienstDag, 4, 'X0000001', ''), xpsRegel(dienstDag, 2, '', '')]));  // accountnummer onbekend, en een dienst zonder accountnummer
fs.writeFileSync(XPS_ZONDER_PROJECT, xpsCsv(0, [xpsRegel(dienstDag, 5, gekoppeldTalent ? gekoppeldTalent.xpsId : 'X0000001', 'Verzonnen project buiten Athena')]));
eis(!!gekoppeldTalent, 'de demoseed heeft uren van een talent met een accountnummer (anders test "zonder project" niets)');

/* ---- 3. de Athena-cijfers via het harnas, met een onafhankelijke controle tegen apiSturing ---- */
var L = H.laad({ export: EXPORT });
function waardeVan(Lx, metriek, periode, uitsplitsing) {
  var id = /^M\d{2}$/.test(metriek) ? Object.keys(Lx.ctx.METRIEKEN).filter(function (k) { return Lx.ctx.METRIEKEN[k].m === metriek && k !== 'gewonnen'; })[0] : metriek;
  return H.athenaWaarde(Lx, { id: id, per: H.periodeUit(Lx.ctx, periode, Lx.peildatum), uitsplitsing: uitsplitsing || '' });
}
function A(metriek, periode, uitsplitsing) { return waardeVan(L, metriek, periode, uitsplitsing); }
var mt = JSON.parse(L.ctx.demoRun('apiSturing', JSON.stringify(['mt', {}]), 'demo-sophie')).result, mtW = {};
mt.blokken.forEach(function (b) { b.cijfers.forEach(function (c) { mtW[c.id] = c.waarde; }); });
var wk = JSON.parse(L.ctx.demoRun('apiSturing', JSON.stringify(['week', { stap: -1 }]), 'demo-sophie')).result;
var a04 = A('M04', maand), a06 = A('M06', vandaag), a26 = A('M26', maand), a25 = A('M25', maand), a08 = A('M08', maand), a18 = A('M18', sj), a14 = A('contactmomenten', vorigeWeek), a04n = A('M04', maand, 'nieuw');
var a28 = A('M28', vandaag), a20 = A('M20', vandaag);
eis(a04.waarde === mtW.gecontracteerd && a06.waarde === mtW.gewogenPijplijn && a26.waarde === mtW.gefactureerd && a25.waarde === mtW.geleverd && a08.waarde === mtW.gewonnenWaarde,
  'het harnas rekent M04, M06, M08, M25 en M26 van deze maand gelijk aan apiSturing(\'mt\')');
eis(wk.week === vorigeWeek && a14.waarde === wk.totaal.cijfers.contactmomenten, 'het harnas rekent M14 van vorige week gelijk aan het teamtotaal van apiSturing(\'week\')');
eis(a04.waarde > 0 && a26.waarde > 0 && a25.waarde > 0 && a06.waarde > 0 && a28.waarde > 0, 'de demoseed heeft M04, M06, M25, M26 en M28 boven nul (anders test de vergelijking niets)');
eis(A('M01', maand).geblokkeerd && A('M30', maand).geblokkeerd, 'M01 (zonder jaardoel) en M30 (marge) zijn in de standaardseed geblokkeerd');
eis(H.blokSoort(A('M01', maand).reden) === 'besluit' && H.blokSoort(A('M30', maand).reden) === 'extern' && H.blokSoort('rollen niet ingesteld (Beheer → Overstap v7.9)') === 'rollen' && H.blokSoort('niet getoetst: verliesredenen niet gekoppeld') === 'redenen' && H.blokSoort('iets anders') === '',
  'v7.9.4: de soort van een blokkade (besluit, extern, rollen, redenen; anders geen soort)');

// Onafhankelijk orakel voor de oude definitie van M08: Kansen.gesloten en Kansen.waarde, recht uit de export
var oud08 = 0, oud04 = 0;
exp.tabellen.Kansen.forEach(function (k) { var g = String(k.gesloten).slice(0, 10); if (k.fase === 'gewonnen' && g >= sjStart && g <= vandaag) oud08 += Number(k.waarde) || 0; if (k.fase === 'gewonnen' && String(k.schooljaar) === sj) oud04 += Number(k.waarde) || 0; });
eis(Math.abs(oud08 - a08.waarde) > 0.01 * a08.waarde, 'de oude definitie van M08 wijkt in de kopie meer dan de tolerantie af van de nieuwe');
var ref04 = Math.round(a04.waarde * 1.37 + 777), ref26 = Math.round(a26.waarde * 0.5 + 333), ref25 = Math.round(a25.waarde * 0.5 + 444), ref28 = Math.round(a28.waarde * 0.5 + 555);
eis(Math.abs(ref04 - oud04) > 0.01 * ref04, 'de M04-regel voor invoer valt niet samen met de oude definitie van M04');

/* ---- 3b. v7.9.4 (bouwpunt 12): open overstapstappen per stand ---- */
var LK = H.laad({ export: EXPORT_K }), LC = H.laad({ export: EXPORT_C }), LL = H.laad({ export: EXPORT_L });
function overstapTekst(Lx) { var o = H.openOverstap(Lx); return ['tijdlijn', 'redenen', 'fasen', 'capsule', 'accounts'].filter(function (k) { return o[k]; }).join(',') || '-'; }
eis(overstapTekst(L) === 'fasen,capsule', 'open overstap in de demoseed: stap fasen en de Capsule-stand (kreeg ' + overstapTekst(L) + ')');
eis(overstapTekst(LC) === 'fasen', 'open overstap met de Capsule-stand gemigreerd: alleen stap fasen (kreeg ' + overstapTekst(LC) + ')');
eis(overstapTekst(LK) === '-', 'open overstap na stap fasen en de Capsule-stand: niets (kreeg ' + overstapTekst(LK) + ')');
eis(overstapTekst(LL) === 'redenen,fasen,capsule,accounts', 'open overstap in de lege stand: redenen ("gekoppeld" zonder verloren kansen), fasen, de Capsule-stand en de accounts (kreeg ' + overstapTekst(LL) + ')');
eis(LL.ctx.apiMigratieV79('status', {}).redenen.gekoppeld === true, 'in de lege stand meldt de stap redenen zelf "gekoppeld" (er is niets te koppelen); het harnas telt hem toch als open');
var dL = LL.ctx.datacontracten(LL.ctx.standVoorContracten(vandaag)).filter(function (c) { return c.stand === 'leeg'; }).map(function (c) { return c.id; });
eis(dL.indexOf('waarde_vanaf_voorstel') >= 0 && dL.indexOf('termijn_verzonden_heeft_factuurnummer') >= 0, 'in de lege stand hebben de contracten waarde_vanaf_voorstel en termijn_verzonden_heeft_factuurnummer de stand leeg (bouwpunt 1)');

/* ---- 4. de runs ---- */
function schrijfRef(naam, regels) { var p = path.join(TMP, naam); fs.writeFileSync(p, '# verzonnen referentie voor de test\nmetriek;periode;waarde;uitsplitsing\n' + regels.map(function (r) { return r.slice(0, 4).join(';'); }).join('\n') + '\n'); return p; }
var alleUitvoer = [];
function draai(args) {
  var p = cp.spawnSync(process.execPath, [HARNAS].concat(args), { encoding: 'utf8', cwd: TMP });
  alleUitvoer.push(p.stdout, p.stderr);
  var err = p.stderr.split('\n').filter(Boolean);
  return { code: p.status, uit: p.stdout.split('\n').filter(Boolean), fout: err.filter(function (l) { return !MELDING.test(l); }), melding: err.filter(function (l) { return MELDING.test(l); }) };
}
function regelVan(r) { return r[0] + ' ' + r[1] + (r[3] ? '/' + r[3] : '') + ' ' + r[4]; }
function vergelijkRun(naam, run, verwacht) {
  eis(run.uit.length === verwacht.length, naam + ': één uitvoerregel per referentieregel');
  verwacht.forEach(function (r, i) { var v = regelVan(r); eis(run.uit[i] === v, naam + ': ' + v + (run.uit[i] === v ? '' : ' (kreeg: ' + run.uit[i] + ')')); });
}
var GOED = [
  ['M04', maand, a04.waarde, ''], ['gecontracteerd', maand, a04n.waarde, 'nieuw'], ['M06', vandaag, a06.waarde, ''], ['contactmomenten', vorigeWeek, a14.waarde, ''],
  ['M26', maand, a26.waarde, ''], ['M18', sj, a18.waarde, ''], ['M08', maand, a08.waarde, '']
];
var VERWACHT_A = [
  ['M01', maand, 1000000, '', 'geblokkeerd (besluit)'], ['M30', maand, 5, '', 'geblokkeerd (extern)'],
  ['M08', maand, oud08, '', 'gezakt (definitie)'], ['M04', maand, ref04, '', 'gezakt (invoer)'],
  ['M26', maand, ref26, '', 'gezakt (bron)'], ['M25', maand, ref25, '', 'gezakt (bron)']
];
var refA = GOED.map(function (r) { return r.concat(['geslaagd']); }).concat(VERWACHT_A);
var runA = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_a.csv', refA), '--exact', EXACT_ANDERS, '--xps', XPS_ANDERS]);
eis(runA.code === 0 && runA.fout.length === 0, 'run A: exitcode 0 zonder onverklaarde regels en zonder foutmeldingen');
vergelijkRun('run A', runA, refA);
var cats = {}; runA.uit.forEach(function (l) { var m = PATROON.exec(l); if (m) cats[m[5] || (/^geblokkeerd/.test(m[2]) ? 'geblokkeerd' : m[2])] = true; });
eis(['geslaagd', 'geblokkeerd', 'definitie', 'invoer', 'bron'].every(function (c) { return cats[c]; }), 'run A: de categorieën geslaagd, geblokkeerd, definitie, invoer en bron komen voor');

var refB = refA.map(function (r) { return r.slice(0, 4); }).concat([['M14', vorigeWeek, a14.waarde + 17, '']]);
var runB = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_b.csv', refB), '--exact', EXACT_ANDERS, '--xps', XPS_ANDERS]);
eis(runB.code === 1 && runB.uit[runB.uit.length - 1] === 'M14 ' + vorigeWeek + ' gezakt (onverklaard)', 'run B: een willekeurig afwijkende M14-regel is onverklaard en geeft exitcode 1');

// Klopt de export met de stand, dan is er geen bron om naar te wijzen: dezelfde afwijkende regels zijn dan onverklaard
var runC = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_c.csv', [['M26', maand, a26.waarde, ''], ['M26', maand, ref26, ''], ['M25', maand, ref25, '']]), '--exact', EXACT_OK, '--xps', XPS_OK]);
eis(runC.code === 1 && runC.uit.join('|') === ['M26 ' + maand + ' geslaagd', 'M26 ' + maand + ' gezakt (onverklaard)', 'M25 ' + maand + ' gezakt (onverklaard)'].join('|'), 'run C: met exports die kloppen geen bron (M26 en M25 onverklaard, exitcode 1)');
eis(runC.melding.length === 0, 'run C: met een XPS-export waarvan elke dienst aan een talent en een project koppelt geen melding (' + runC.melding.join(' | ') + ')');
var runC2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_c2.csv', [['M26', maand, ref26, ''], ['M25', maand, ref25, '']])]);
eis(runC2.code === 1 && runC2.uit.every(function (l) { return / gezakt \(onverklaard\)$/.test(l); }), 'run C: zonder --exact en --xps kan de bron niet wijzen');

/* ---- 4b. v7.9.4 (bouwpunten 11–13): de lege stand ---- */
var refL = [
  ['contactmomenten', vorigeWeek, 5, '', 'geblokkeerd (geen leden)'], ['afsprakenGehouden', vorigeWeek, 2, '', 'geblokkeerd (geen leden)'],
  ['ap', vorigeWeek, 3, '', 'geblokkeerd (geen leden)'], ['voorstellen', vorigeWeek, 1, '', 'geblokkeerd (geen leden)'], ['gewonnen', vorigeWeek, 1, '', 'geblokkeerd (geen leden)'],
  ['M23', maand, 4, '', 'geblokkeerd (geen leden)'], ['M35', maand, 3, '', 'geblokkeerd (geen leden)'],
  ['M06', vandaag, 12345, '', 'gezakt (invoer)'], ['M18', sj, 9, '', 'gezakt (invoer)'], ['M21', maand, 3, '', 'gezakt (invoer)'],
  ['M24', maand, 50, '', 'leeg (geen basis)'], ['M36', vandaag, 2, '', 'leeg (geen basis)'], ['M26', maand, 1000, '', 'gezakt (invoer)']
];
var runL = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_l.csv', refL)]);
eis(runL.code === 0 && runL.fout.length === 0, 'lege stand: exitcode 0 (alles geblokkeerd, invoer of leeg; niets onverklaard), geen foutmelding');
vergelijkRun('lege stand', runL, refL);
var nulL = waardeVan(LL, 'contactmomenten', vorigeWeek), nul24 = waardeVan(LL, 'M24', maand);
eis(nulL.geblokkeerd && H.blokSoort(nulL.reden) === 'geen leden' && nulL.waarde === null, 'bouwpunt 11: athenaWaarde geeft bij een team zonder leden geblokkeerd met de reden uit Code.gs (teamBlokkade), nooit 0');
eis(nul24.leeg === true && nul24.waarde === null && !nul24.geblokkeerd, 'bouwpunt 13: athenaWaarde geeft bij een cijfer zonder waarde leeg, nooit 0');
// M25 in de lege stand met een XPS-export: geen talent en geen project in Athena, toch een signaal (bron, of invoer als een contract leeg is), nooit onverklaard
var runLx = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_lx.csv', [['M25', maand, 4321, '']]), '--xps', XPS_OK]);
eis(runLx.code === 0 && runLx.uit.length === 1 && /^M25 \S+ gezakt \((bron|invoer)\)$/.test(runLx.uit[0]), 'bouwpunt 14: M25 in de lege stand met een dienstenexport is niet onverklaard (' + runLx.uit.join() + ')');
eis(runLx.melding.length === 2 && runLx.melding.some(function (l) { return /talent/.test(l); }) && runLx.melding.some(function (l) { return /project/.test(l); }),
  'bouwpunt 14: de lege stand meldt apart dat diensten niet aan een talent en niet aan een project koppelen (' + runLx.melding.join(' | ') + ')');

// herstel r2 (A-B2): M25 (en M26) in de lege stand zonder --xps: geen enkel project in het schooljaar = de open stap projecten, dus invoer, nooit onverklaard
var vorigeMaandL = ctx.plusDagenVan(maand + '-01', -1).slice(0, 7);
var runLp = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_lp.csv', [['M25', vorigeMaandL, 4321, ''], ['M25', maand, 4321, ''], ['M27', maand, 2100, '']])]);
eis(runLp.code === 0 && runLp.uit.join('|') === ['M25 ' + vorigeMaandL + ' gezakt (invoer)', 'M25 ' + maand + ' gezakt (invoer)', 'M27 ' + maand + ' gezakt (invoer)'].join('|'),
  'herstel r2 (A-B2): zonder projecten in het schooljaar zijn M25 en M27 invoer (stap projecten open), ook zonder --xps; exitcode 0 (' + runLp.uit.join(' | ') + '; exit ' + runLp.code + ')');
eis(!H.invoerRaakt(L, { id: 'geleverd', per: H.periodeUit(L.ctx, maand, L.peildatum) }), 'herstel r2 (A-B2): met projecten in het schooljaar (de demoseed) is stap projecten niet open voor M25');
// herstel r2 (B-B7): alleen geblokkeerde (geen leden) of lege regels: niets vergeleken, dus exitcode 3 met een melding, nooit 0
var runLn = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_ln.csv', refL.slice(0, 5).concat([['M24', maand, 50, '']]))]);
eis(runLn.code === 3 && runLn.uit.every(function (l) { return / (geblokkeerd \(geen leden\)|leeg \(geen basis\))$/.test(l); }) && runLn.melding.some(function (l) { return /geen enkele regel is vergeleken/.test(l); }),
  'herstel r2 (B-B7): een referentie waarvan geen enkele regel vergeleken wordt (geen leden, leeg) eindigt met exitcode 3 en een melding (' + runLn.uit.join(' | ') + '; exit ' + runLn.code + ')');

/* ---- 4c. v7.9.4 (bouwpunt 12): fasen en de Capsule-stand per stand ---- */
function refOverstap(Lx) { return [['M18', sj, waardeVan(Lx, 'M18', sj).waarde + 7, ''], ['M20', vandaag, waardeVan(Lx, 'M20', vandaag).waarde + 5, '']]; }
var runO = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_o.csv', refOverstap(L))]);
eis(runO.code === 0 && runO.uit.join('|') === ['M18 ' + sj + ' gezakt (invoer)', 'M20 ' + vandaag + ' gezakt (invoer)'].join('|'), 'overstap: zonder stap fasen en de Capsule-stand zijn M18 en M20 invoer (' + runO.uit.join(' | ') + ')');
var runOc = draai(['--export', EXPORT_C, '--referentie', schrijfRef('referentie_oc.csv', refOverstap(LC))]);
eis(runOc.code === 1 && runOc.uit.join('|') === ['M18 ' + sj + ' gezakt (invoer)', 'M20 ' + vandaag + ' gezakt (onverklaard)'].join('|'), 'overstap: met de Capsule-stand blijft M18 invoer (stap fasen), M20 is onverklaard (' + runOc.uit.join(' | ') + ')');
var runOk = draai(['--export', EXPORT_K, '--referentie', schrijfRef('referentie_ok.csv', refOverstap(LK))]);
eis(runOk.code === 1 && runOk.uit.join('|') === ['M18 ' + sj + ' gezakt (onverklaard)', 'M20 ' + vandaag + ' gezakt (onverklaard)'].join('|'), 'overstap: na stap fasen en de Capsule-stand zijn M18 en M20 onverklaard (' + runOk.uit.join(' | ') + ')');
eis(a20.waarde >= 0 && !a20.geblokkeerd && !a20.leeg, 'M20 heeft in de demoseed een waarde');

/* ---- 4d. v7.9.4 (bouwpunt 14): diensten zonder gekoppeld talent of project ---- */
var runX = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_x.csv', [['M25', maand, ref25, '']]), '--xps', XPS_ZONDER_TALENT]);
eis(runX.code === 0 && runX.uit.join() === 'M25 ' + maand + ' gezakt (bron)', 'bouwpunt 14: diensten zonder gekoppeld talent tellen mee in het maandtotaal: M25 wordt bron (' + runX.uit.join() + ')');
eis(runX.melding.length === 2 && /talent/.test(runX.melding[0]) && /project/.test(runX.melding[1]) && runX.melding.every(function (l) { return !/\d/.test(l); }),
  'bouwpunt 14: een melding dat diensten niet aan een talent koppelen en een dat ze (dus ook) niet aan een project koppelen, zonder aantal (' + runX.melding.join(' | ') + ')');
var runXp = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_xp.csv', [['M25', maand, ref25, '']]), '--xps', XPS_ZONDER_PROJECT]);
eis(runXp.code === 0 && runXp.uit.join() === 'M25 ' + maand + ' gezakt (bron)' && runXp.melding.some(function (l) { return /project/.test(l); }) && !runXp.melding.some(function (l) { return /talent/.test(l); }),
  'bouwpunt 14: een dienst van een bekend talent zonder project telt in het maandtotaal en geeft alleen de melding over het project (' + runXp.uit.join() + ' | ' + runXp.melding.join(' | ') + ')');

/* ---- 4e. v7.9.4 (bouwpunt 15): twee Exact-invoeren en een export zonder Open ---- */
var refE = [['M26', maand, ref26, ''], ['M28', vandaag, ref28, '']];
var runE1 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e1.csv', refE), '--exact', VERKOOP_ANDERS]);
eis(runE1.code === 0 && runE1.uit.join('|') === ['M26 ' + maand + ' gezakt (bron)', 'M28 ' + vandaag + ' geblokkeerd (export zonder Open)'].join('|'), 'bouwpunt 15: --exact met een verkoopboek: M26 bron, M28 geblokkeerd (export zonder Open) in plaats van elke factuur als open (' + runE1.uit.join(' | ') + ')');
var runE2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e2.csv', refE), '--exact-verkoop', VERKOOP_ANDERS, '--exact-open', EXACT_OPEN_ANDERS]);
eis(runE2.code === 0 && runE2.uit.join('|') === ['M26 ' + maand + ' gezakt (bron)', 'M28 ' + vandaag + ' gezakt (bron)'].join('|'), 'bouwpunt 15: --exact-verkoop voor M26 en --exact-open voor M28 (' + runE2.uit.join(' | ') + ')');
var runE3 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e3.csv', refE), '--exact-verkoop', VERKOOP_OK, '--exact-open', EXACT_OK]);
eis(runE3.code === 1 && runE3.uit.join('|') === ['M26 ' + maand + ' gezakt (onverklaard)', 'M28 ' + vandaag + ' gezakt (onverklaard)'].join('|'), 'bouwpunt 15: met exports die kloppen geen bron (' + runE3.uit.join(' | ') + ')');
var runE4 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e4.csv', refE), '--exact-verkoop', VERKOOP_ANDERS]);
eis(runE4.code === 1 && runE4.uit.join('|') === ['M26 ' + maand + ' gezakt (bron)', 'M28 ' + vandaag + ' gezakt (onverklaard)'].join('|'), 'bouwpunt 15: alleen het verkoopboek: M26 bron, M28 zonder bron (' + runE4.uit.join(' | ') + ')');
var runE5 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e5.csv', refE), '--exact-open', VERKOOP_OK]);
eis(runE5.code === 1 && runE5.uit.length === 0 && runE5.fout.join() === 'exact-open, regel 1, kolom Open: niet gevonden (ook geen betaaldatum)', 'bouwpunt 15: --exact-open zonder kolom Open of betaaldatum is een invoerfout (' + runE5.fout.join(' | ') + ')');
var runE6 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e6.csv', refE), '--exact', EXACT_OK, '--exact-verkoop', VERKOOP_OK]);
eis(runE6.code === 1 && runE6.fout.join() === 'argumenten: gebruik --exact of --exact-verkoop en --exact-open, niet allebei.', 'bouwpunt 15: --exact naast --exact-verkoop is een invoerfout (' + runE6.fout.join(' | ') + ')');
// herstel r1 (K12): een export met alleen de kolom Open zegt niets over een eerdere peildatum: M28 van de vorige maand is dan geblokkeerd, geen bronoordeel
var vorigeMaandK12 = ctx.plusDagenVan(maand + '-01', -1).slice(0, 7);
var runE8 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e8.csv', [['M28', vorigeMaandK12, ref28 + 99999, '']]), '--exact-verkoop', VERKOOP_OK, '--exact-open', EXACT_OPEN_ANDERS]);
eis(runE8.uit.join() === 'M28 ' + vorigeMaandK12 + ' geblokkeerd (export zonder betaaldatum)' && runE8.code === 3,
  'herstel r1 (K12): M28 op een eerdere peildatum met een export met alleen Open: geblokkeerd (export zonder betaaldatum), geen bronoordeel; herstel r2 (B-B7): niets vergeleken, dus exitcode 3 (' + runE8.uit.join(' | ') + '; exit ' + runE8.code + ')');
// --exact met de kolom Open werkt als voorheen: het bedrag van de eerste factuur is gewijzigd; is die niet betaald, dan wijkt ook Open af (M28 bron)
var eersteF = exp.tabellen.Facturen.filter(function (f) { return verzondenOp(f); })[0], eersteBetaald = eersteF.status === 'betaald' || !!eersteF.betaald;
var runE7 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e7.csv', refE), '--exact', EXACT_ANDERS]);
eis(runE7.uit.join('|') === ['M26 ' + maand + ' gezakt (bron)', 'M28 ' + vandaag + (eersteBetaald ? ' gezakt (onverklaard)' : ' gezakt (bron)')].join('|') && runE7.code === (eersteBetaald ? 1 : 0),
  'bouwpunt 15: --exact met de kolom Open werkt als voorheen voor M26 en M28 (' + runE7.uit.join(' | ') + ')');

// herstel r2 (A-B1, B-B2): het bronoordeel van M26 rekent in een stand op een eerdere peildatum t/m die dag, zoals M26 zelf. Een verkoopboek t/m de peildatum
// met precies de termijnen van Athena t/m die dag, en in Athena een termijn ná de peildatum in dezelfde maand: een afwijkende M26 blijft onverklaard (exit 1)
var vmB = ctx.plusDagenVan(maand + '-01', -1).slice(0, 7), PB = vmB + '-10', naPB = vmB + '-20', expB = kopie(exp), fB = expB.tabellen.Facturen.filter(function (f) { return verzondenOp(f); })[0];
expB.tabellen.Facturen.push({ id: 'harnas-fb', trajectId: fB.trajectId, omschrijving: 'Verzonnen termijn', bedrag: 1234, datum: naPB, status: 'verzonden', factuurnummer: '979999', verzonden: naPB, betaald: '', aangemaakt: naPB + ' 09:00' });
var EXPORT_B = path.join(TMP, 'export-bron.json'); fs.writeFileSync(EXPORT_B, JSON.stringify(expB));
var VERKOOP_TM = path.join(TMP, 'verkoopboek_tm_peildatum.csv'), vRegels = ['Factuurnummer;Factuurdatum;Debiteur;Omschrijving;Bedrag'];
expB.tabellen.Facturen.forEach(function (f, i) { var v = verzondenOp(f); if (v && v <= PB) vRegels.push([f.factuurnummer, nlDatum(v), 'Debiteur ' + i, 'Termijn', nlBedrag(f.bedrag)].join(';')); });
fs.writeFileSync(VERKOOP_TM, vRegels.join('\n') + '\n');
var LB = H.laad({ export: EXPORT_B }), aB = waardeVan(LB, 'M26', PB);
var runB1 = draai(['--export', EXPORT_B, '--referentie', schrijfRef('referentie_b1.csv', [['M26', PB, Math.round(aB.waarde + 5000), ''], ['M26', PB, aB.waarde, '']]), '--exact-verkoop', VERKOOP_TM]);
eis(runB1.uit.join('|') === ['M26 ' + PB + ' gezakt (onverklaard)', 'M26 ' + PB + ' geslaagd'].join('|') && runB1.code === 1,
  'herstel r2 (A-B1, B-B2): een termijn na de peildatum in dezelfde maand maakt de bron niet "wijkt": een verkoopboek t/m de peildatum dat met Athena klopt laat een afwijkende M26 onverklaard (' + runB1.uit.join(' | ') + '; exit ' + runB1.code + ')');

// Peildatum: een periode na de peildatum is een invoerfout; een maand voor de peildatum rekent op de laatste dag van die maand
var vorigeMaand = ctx.plusDagenVan(maand + '-01', -1).slice(0, 7);

/* ---- 4f. v7.9.4 herstel r1 (K7): een stand die alleen voor vandaag kan (de fase van een kans op een eerdere peildatum is niet te reconstrueren, zoals elke
   open Capsule-kans na stap 3 zonder werkelijke datums) is "geblokkeerd (stand)" en telt niet als geslaagd: exitcode 3, met een melding zonder aantal ---- */
var expS = kopie(exp), dagS = ctx.plusDagenVan(vandaag, -60);
expS.tabellen.Kansen.push({ id: 'harnas-cap1', naam: 'Verzonnen Capsule-kans', school: exp.tabellen.Scholen[0].naam, schoolId: exp.tabellen.Scholen[0].id, fase: 'voorstel', pipeline: 'Scholen', waarde: 1000,
  eigenaar: exp.tabellen.Kansen[0].eigenaar, schooljaar: sj, klant: 'nieuw', capsuleId: '990001', aangemaakt: dagS + ' 09:00' });
expS.tabellen.Fasewissels.push({ id: 'harnas-cap1-fw', kansId: 'harnas-cap1', van: '', naar: 'voorstel', werkelijkeDatum: '', ingevoerdOp: vandaag + ' 09:00', door: '', eigenaar: exp.tabellen.Kansen[0].eigenaar, zekerheid: '', bron: 'capsule' });
var EXPORT_S = path.join(TMP, 'export-stand.json'); fs.writeFileSync(EXPORT_S, JSON.stringify(expS));
var refS = [['M04', vorigeMaand, 1, ''], ['M06', vorigeMaand, 1, ''], ['M18', vorigeMaand, 1, '']];
var runS0 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_s0.csv', refS)]);
var runS = draai(['--export', EXPORT_S, '--referentie', schrijfRef('referentie_s.csv', refS)]);
eis(runS0.uit.every(function (l) { return !/geblokkeerd \(stand\)/.test(l); }), 'herstel r1 (K7): op de seed is de vorige maand te reconstrueren (' + runS0.uit.join(' | ') + ')');
eis(runS.uit.join('|') === ['M04 ' + vorigeMaand + ' geblokkeerd (stand)', 'M06 ' + vorigeMaand + ' geblokkeerd (stand)', 'M18 ' + vorigeMaand + ' geblokkeerd (stand)'].join('|') && runS.code === 3,
  'herstel r1 (K7): met een Capsule-kans zonder werkelijke datum zijn M04, M06 en M18 van de vorige maand "geblokkeerd (stand)" en eindigt het harnas met exitcode 3, niet 0 (' + runS.uit.join(' | ') + '; exit ' + runS.code + ')');
eis(runS.melding.some(function (l) { return /stand/.test(l) && /werkelijke datums/.test(l); }), 'herstel r1 (K7): een melding zegt dat regels niet vergeleken zijn (de werkelijke datums), zonder aantal (' + runS.melding.join(' | ') + ')');
var runS2 = draai(['--export', EXPORT_S, '--referentie', schrijfRef('referentie_s2.csv', [['M04', vorigeMaand, 1, ''], ['M04', maand + '-01', 'x', '']])]);
eis(runS2.code === 1, 'herstel r1 (K7): een invoerfout gaat voor exitcode 3 (exit ' + runS2.code + ')');
var runP = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_p.csv', [['M04', maand, a04.waarde, '']]), '--peildatum', vorigeMaand + '-15']);
eis(runP.code === 1 && runP.uit.length === 0 && runP.fout.length === 1 && /^referentie, regel 3, kolom periode: na de peildatum$/.test(runP.fout[0]), 'peildatum: een periode na de peildatum geeft een invoerfout met regel en kolom');
var runP2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_p2.csv', [['M04', maand, a04.waarde, '']]), '--peildatum', '2999-01-01']);
eis(runP2.code === 1 && runP2.fout.join() === 'peildatum: ligt in de toekomst.', 'peildatum in de toekomst wordt geweigerd');

/* ---- 5. invoerfouten: alleen bestand, regelnummer en kolomnaam; v7.9.4: een fout in het harnas zelf is exitcode 2 ---- */
var school = exp.tabellen.Scholen[0].naam, persoon = ctx.DEMO_MENSEN[3].naam.split(' ')[0];
var refD = path.join(TMP, 'referentie_d.csv');
fs.writeFileSync(refD, 'metriek;periode;waarde\nM04;' + maand + ';1000\nM04;' + maand + ';' + school + '\n' + persoon + ';' + maand + ';12\nM04;volgend jaar;5\n');
var runD = draai(['--export', EXPORT, '--referentie', refD]);
eis(runD.code === 1 && runD.uit.length === 0, 'invoerfout: exitcode 1 en geen uitkomsten');
eis(runD.fout.join('|') === 'referentie, regel 3, kolom waarde: geen getal|referentie, regel 4, kolom metriek: onbekend cijfer|referentie, regel 5, kolom periode: onbekende vorm',
  'invoerfout: per fout alleen bestand, regelnummer en kolomnaam (' + runD.fout.join(' | ') + ')');
var exactFout = path.join(TMP, 'facturen_fout.csv');
fs.writeFileSync(exactFout, exactKop + '\n"01-09-' + sj.slice(0, 4) + '";"1";"x";"";"' + school + '";"1";"";"veel";"0";"0,00";""\n');
var runEf = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_ef.csv', [['M26', maand, a26.waarde, '']]), '--exact', exactFout]);
eis(runEf.code === 1 && runEf.fout.join() === 'exact, regel 2, kolom Totaal: geen bedrag', 'invoerfout in de Exact-export: bestand, regel en kolom (' + runEf.fout.join(' | ') + ')');
var runEf2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_ef2.csv', [['M26', maand, a26.waarde, '']]), '--exact-verkoop', exactFout]);
eis(runEf2.code === 1 && runEf2.fout.join() === 'exact-verkoop, regel 2, kolom Totaal: geen bedrag', 'v7.9.4: een invoerfout in het verkoopboek noemt --exact-verkoop (' + runEf2.fout.join(' | ') + ')');
var kapot = path.join(TMP, 'export-kapot.json'); fs.writeFileSync(kapot, '{ "tabellen": ');
var runK = draai(['--export', kapot, '--referentie', schrijfRef('referentie_k.csv', [['M04', maand, 1, '']])]);
eis(runK.code === 1 && runK.fout.join() === 'export: geen geldige JSON.', 'een kapotte export geeft een korte fout, zonder terug te vallen op de demoseed');
var codeKapot = path.join(TMP, 'Code-kapot.gs');
fs.writeFileSync(codeKapot, fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8') + '\nfunction sturingCijfers() { throw new Error("verzonnen storing ' + school + '"); }\n');
var runI = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_i.csv', [['M04', maand, 1, '']]), '--code', codeKapot]);
eis(runI.code === 2 && runI.uit.length === 0 && runI.fout.length === 1 && /^Onverwachte fout in het harnas \(Error\)/.test(runI.fout[0]) && runI.fout[0].indexOf('verzonnen storing') < 0,
  'v7.9.4: een onverwachte fout in het harnas geeft exitcode 2, zonder de inhoud van de melding (' + runI.fout.join(' | ') + ')');

/* ---- 6. een pad binnen de repo wordt geweigerd ---- */
var VOORBEELD = path.join(R, 'test/voorbeelden/sturing_referentie.csv');
var runR = draai(['--export', EXPORT, '--referentie', VOORBEELD]);
eis(runR.code === 1 && runR.uit.length === 0 && runR.fout.join() === 'referentie: Zet echte bestanden buiten de repo.', 'een referentie binnen de repo wordt geweigerd');
var runR2 = draai(['--export', path.join(R, 'package.json'), '--referentie', refD]);
eis(runR2.code === 1 && runR2.fout.join() === 'export: Zet echte bestanden buiten de repo.', 'een export binnen de repo wordt geweigerd');
var runR5 = draai(['--export', EXPORT, '--referentie', refD, '--exact-open', path.join(R, 'test/voorbeelden/facturen_export.csv')]);
eis(runR5.code === 1 && runR5.fout.join() === 'exact-open: Zet echte bestanden buiten de repo.', 'v7.9.4: een Exact-export binnen de repo wordt ook via --exact-open geweigerd');
var koppeling = path.join(TMP, 'via-koppeling.csv'), koppelingOk = true;
try { fs.symlinkSync(VOORBEELD, koppeling); } catch (e) { koppelingOk = false; }
if (koppelingOk) { var runR3 = draai(['--export', EXPORT, '--referentie', koppeling]); eis(runR3.code === 1 && runR3.fout.join() === 'referentie: Zet echte bestanden buiten de repo.', 'een symbolische koppeling naar een bestand in de repo wordt ook geweigerd'); }
var runR4 = draai(['--export', EXPORT, '--referentie', 'test/voorbeelden/sturing_referentie.csv']);
eis(runR4.code === 1 && runR4.fout.join() === 'referentie: het bestand is niet te lezen.', 'een relatief pad wordt gelezen vanuit de werkmap (hier de tijdelijke map), niet vanuit de repo');

/* ---- 7. het verzonnen voorbeeld: elke regel wordt gelezen ---- */
var kopieV = path.join(TMP, 'sturing_referentie.csv'); fs.copyFileSync(VOORBEELD, kopieV);
var dataRegels = fs.readFileSync(VOORBEELD, 'utf8').split(/\r?\n/).filter(function (l) { return l.trim() && !/^\s*#/.test(l); }).length - 1;
var runV = draai(['--export', EXPORT, '--referentie', kopieV, '--exact', EXACT_OK, '--xps', XPS_OK]);
eis(runV.fout.length === 0 && runV.uit.length === dataRegels && dataRegels >= 10, 'het verzonnen voorbeeld test/voorbeelden/sturing_referentie.csv: elke regel gelezen, geen invoerfout (' + runV.uit.length + ' regels)');
var runVl = draai(['--export', EXPORT_L, '--referentie', kopieV, '--exact', EXACT_OK, '--xps', XPS_OK]);
eis(runVl.fout.length === 0 && runVl.uit.length === dataRegels && runVl.code === 0, 'v7.9.4: het verzonnen voorbeeld op de lege stand: elke regel gelezen en niets onverklaard (' + runVl.uit.filter(function (l) { return /onverklaard/.test(l); }).join(' | ') + ')');

/* ---- 8. de uitvoer: patroon, geen namen, geen bedragen ---- */
var runs = [runA, runB, runC, runC2, runV, runL, runLx, runLp, runLn, runO, runOc, runOk, runX, runXp, runE1, runE2, runE3, runE4, runE7, runE8, runB1, runVl, runS0, runS];
var stdoutRegels = runs.reduce(function (s, r) { return s.concat(r.uit); }, []), meldingen = runs.reduce(function (s, r) { return s.concat(r.melding); }, []);
var nietPatroon = stdoutRegels.filter(function (l) { return !PATROON.test(l); });
eis(stdoutRegels.length > 0 && !nietPatroon.length, 'elke uitvoerregel matcht ' + PATROON + (nietPatroon.length ? ' (niet: ' + nietPatroon.slice(0, 3).join(' | ') + ')' : ''));
eis(meldingen.length > 0 && meldingen.every(function (l) { return !/\d/.test(l); }), 'v7.9.4: een melding op stderr bevat geen getal (geen aantal, geen bedrag)');
var tekst = alleUitvoer.join('\n'), namen = [];
ctx.DEMO_MENSEN.forEach(function (m) { namen.push(m.naam); m.naam.split(' ').forEach(function (d) { if (d.length > 3) namen.push(d); }); });
exp.tabellen.Scholen.forEach(function (s) { namen.push(s.naam); });
exp.tabellen.Talenten.forEach(function (t) { if (t.achternaam) namen.push(t.voornaam + ' ' + t.achternaam); });
var gevonden = namen.filter(function (n) { return n && tekst.indexOf(n) >= 0; });
eis(!gevonden.length, 'geen naam of schoolnaam uit de seed in de uitvoer' + (gevonden.length ? ' (' + gevonden.slice(0, 3).join(', ') + ')' : ''));
var bedragen = [a04.waarde, a06.waarde, a26.waarde, a25.waarde, a08.waarde, a28.waarde, oud08, ref04, ref26, ref25, ref28].filter(function (x) { return Math.abs(x) >= 100; }).map(function (x) { return String(x); });
eis(!bedragen.some(function (b) { return tekst.indexOf(b) >= 0; }) && stdoutRegels.every(function (l) { return !/\d/.test(l.split(' ').slice(2).join(' ')); }), 'geen bedrag of telling in de uitvoer (alleen M-code en periode bevatten cijfers)');

/* ---- 9. opruimen ---- */
fs.rmSync(TMP, { recursive: true, force: true });
eis(!fs.existsSync(TMP), 'de tijdelijke map is weg');

/* ---- 10. v7.9.4 (bouwpunt 10): de urenbasislijn ---- */
var ub = cp.spawnSync(process.execPath, [path.join(__dirname, 'urenbasislijn_test.js')], { encoding: 'utf8' });
eis(ub.status === 0 && /ALLES GOED\s*$/.test(ub.stdout), 'test/urenbasislijn_test.js: ALLES GOED' + (ub.status === 0 ? '' : '\n' + ub.stdout.split('\n').filter(function (l) { return /^FOUT|FOUTEN/.test(l); }).join('\n') + ub.stderr));

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exitCode = fouten ? 1 : 0;
