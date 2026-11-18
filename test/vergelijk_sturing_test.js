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
 * Herstel r3 (R3-D2): gezakt (invoer) is niet vergeleken: een run met alleen invoer, leeg of geblokkeerd geeft exitcode 3 (ook het scenario van U13 op de lege
 * stand), met een vaste melding; naast een vergeleken regel exitcode 0 met een melding. Een mutant van het harnas (invoer als vergeleken) in het geheugen.
 * Herstel r4 (R4-1, R4-2): leeg terwijl invoer het cijfer raakt is gezakt (invoer); het deel zonder (een telling in extra) wordt ook bij een lege hoofdwaarde
 * vergeleken; twee mutanten van het harnas in het geheugen.
 * Herstel r5 (R5-C2): de scenario's s5 en s6b (een winst van dit schooljaar met een akkoord vóór 1 augustus zonder getekende waarde, met en zonder lopend
 * project zonder contractwaarde): contract gewonnen_is_getekend zakt en M04 en M07 zijn allebei gezakt (invoer).
 * Harnasdekking (sectie 4g): een verkoopboek dat de periode niet dekt, de standdatum van Open (--exact-open-stand), een open termijn buiten het bereik van de
 * export, de invoer bij naam, een afgekapte week en wissels met zekerheid laag; zes mutanten van het harnas in het geheugen.
 * Herstel r6: een slottermijn van een project van vorig schooljaar (M26 en M28 geslaagd tegen Exact), een open junitermijn naast een export van het boekjaar
 * (onverklaard, niet "dekt niet"; zonder de melding dat niets vergeleken is), de lopende maand zonder factuur in het verkoopboek (bron), M26 per project van
 * het schooljaar (definitie) en een lopend project zonder contractwaarde (M04 en M07 invoer); vier mutanten van het harnas erbij.
 *   node test/vergelijk_sturing_test.js   → ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1) */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process');
var R = path.join(__dirname, '..'), HARNAS = path.join(__dirname, 'vergelijk_sturing.js'), H = require('./vergelijk_sturing.js');
// v7.9.4: geblokkeerd met een vaste soort (of zonder), en leeg (geen basis)
var PATROON = /^(M\d{2}|[a-zA-Z]+) \S+ (geslaagd|geblokkeerd( \((besluit|extern|rollen|redenen|geen leden|stand|export zonder Open|export zonder betaaldatum|stand van Open onbekend|export dekt de periode niet)\))?|leeg \(geen basis\)|gezakt \((definitie|invoer|bron|onverklaard)\))$/;  // herstel r1 (K7): stand; harnasdekking: de laatste twee
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
  ['M24', maand, 50, '', 'gezakt (invoer)'], ['M36', vandaag, 2, '', 'leeg (geen basis)'], ['M26', maand, 1000, '', 'gezakt (invoer)'],
  // herstel r3 (R3-D1): de winsten van de lege stand hebben geen project met een getekende waarde: M04 (ook nieuw en bestaand) en M08 zijn leeg, nooit een 0.
  // Herstel r4 (R4-1): leeg terwijl invoer het cijfer raakt (hier stap projecten; bij M24 ook lopend_project_heeft_contract) is gezakt (invoer), niet
  // "leeg (geen basis)": anders telt een run met deze regels naast één geslaagde regel als geslaagd zonder melding. M36 heeft geen invoer en blijft leeg
  ['M04', maand, 50000, '', 'gezakt (invoer)'], ['M04', maand, 20000, 'nieuw', 'gezakt (invoer)'], ['M04', maand, 30000, 'bestaand', 'gezakt (invoer)'], ['M08', maand, 30000, '', 'gezakt (invoer)']
];
var runL = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_l.csv', refL)]);
// herstel r3 (R3-D2): invoer is niet vergeleken; alleen geblokkeerd, invoer of leeg is dus exitcode 3 met de vaste meldingen, nooit 0
eis(runL.code === 3 && runL.fout.length === 0 && runL.melding.some(function (l) { return /geen enkele regel is vergeleken/.test(l); }) && runL.melding.some(function (l) { return /niet vergeleken omdat Athena de invoer mist/.test(l); }) && runL.melding.every(function (l) { return !/\d/.test(l); }),
  'lege stand: niets onverklaard, maar ook niets vergeleken (alles geblokkeerd, invoer of leeg): exitcode 3 met een vaste melding zonder aantal, geen foutmelding (exit ' + runL.code + ')');
vergelijkRun('lege stand', runL, refL);
var nulL = waardeVan(LL, 'contactmomenten', vorigeWeek), nul24 = waardeVan(LL, 'M24', maand);
eis(nulL.geblokkeerd && H.blokSoort(nulL.reden) === 'geen leden' && nulL.waarde === null, 'bouwpunt 11: athenaWaarde geeft bij een team zonder leden geblokkeerd met de reden uit Code.gs (teamBlokkade), nooit 0');
eis(nul24.leeg === true && nul24.waarde === null && !nul24.geblokkeerd, 'bouwpunt 13: athenaWaarde geeft bij een cijfer zonder waarde leeg, nooit 0');
// M25 in de lege stand met een XPS-export: geen talent en geen project in Athena, toch een signaal (bron, of invoer als een contract leeg is), nooit onverklaard
var runLx = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_lx.csv', [['M25', maand, 4321, '']]), '--xps', XPS_OK]);
eis(runLx.code === (/bron/.test(runLx.uit[0]) ? 0 : 3) && runLx.uit.length === 1 && /^M25 \S+ gezakt \((bron|invoer)\)$/.test(runLx.uit[0]), 'bouwpunt 14: M25 in de lege stand met een dienstenexport is niet onverklaard; herstel r3 (R3-D2): invoer alleen is exitcode 3 (' + runLx.uit.join() + '; exit ' + runLx.code + ')');
eis(runLx.melding.some(function (l) { return /xps: .*talent/.test(l); }) && runLx.melding.some(function (l) { return /xps: .*project/.test(l); }),
  'bouwpunt 14: de lege stand meldt apart dat diensten niet aan een talent en niet aan een project koppelen (' + runLx.melding.join(' | ') + ')');

// herstel r2 (A-B2): M25 (en M26) in de lege stand zonder --xps: geen enkel project in het schooljaar = de open stap projecten, dus invoer, nooit onverklaard
var vorigeMaandL = ctx.plusDagenVan(maand + '-01', -1).slice(0, 7);
var runLp = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_lp.csv', [['M25', vorigeMaandL, 4321, ''], ['M25', maand, 4321, ''], ['M27', maand, 2100, '']])]);
eis(runLp.code === 3 && runLp.uit.join('|') === ['M25 ' + vorigeMaandL + ' gezakt (invoer)', 'M25 ' + maand + ' gezakt (invoer)', 'M27 ' + maand + ' gezakt (invoer)'].join('|'),
  'herstel r2 (A-B2): zonder projecten in het schooljaar zijn M25 en M27 invoer (stap projecten open), ook zonder --xps; herstel r3 (R3-D2): alleen invoer is exitcode 3 (' + runLp.uit.join(' | ') + '; exit ' + runLp.code + ')');
eis(!H.invoerRaakt(L, { id: 'geleverd', per: H.periodeUit(L.ctx, maand, L.peildatum) }), 'herstel r2 (A-B2): met projecten in het schooljaar (de demoseed) is stap projecten niet open voor M25');
// herstel r2 (B-B7): alleen geblokkeerde (geen leden) of lege regels: niets vergeleken, dus exitcode 3 met een melding, nooit 0
var runLn = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_ln.csv', refL.slice(0, 5).concat([['M36', vandaag, 2, '']]))]);  // herstel r4: M24 is nu invoer
eis(runLn.code === 3 && runLn.uit.every(function (l) { return / (geblokkeerd \(geen leden\)|leeg \(geen basis\))$/.test(l); }) && runLn.melding.some(function (l) { return /geen enkele regel is vergeleken/.test(l); }),
  'herstel r2 (B-B7): een referentie waarvan geen enkele regel vergeleken wordt (geen leden, leeg) eindigt met exitcode 3 en een melding (' + runLn.uit.join(' | ') + '; exit ' + runLn.code + ')');
// herstel r3 (R3-D2, het scenario van U13): op de lege stand zijn M26, M28 en M25 van deze maand invoer (geen project, termijn of uur in Athena; Athena heeft overal 0).
// Dat is niet vergeleken, dus exitcode 3 met de vaste meldingen, nooit 0 ("slaagt")
var runU = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_u13.csv', [['M26', maand, 1000, ''], ['M28', maand, 500, ''], ['M25', maand, 800, '']])]);
eis(runU.code === 3 && runU.uit.length === 3 && runU.uit.every(function (l) { return / gezakt \(invoer\)$/.test(l); }) && runU.melding.some(function (l) { return /geen enkele regel is vergeleken \(alles invoer, geblokkeerd of leeg\)/.test(l); }) &&
  runU.melding.some(function (l) { return /niet vergeleken omdat Athena de invoer mist/.test(l); }) && runU.melding.every(function (l) { return !/\d/.test(l); }),
  'herstel r3 (R3-D2): alleen regels gezakt (invoer) (M26, M28, M25 op de lege stand) zijn niet vergeleken: exitcode 3 met een vaste melding zonder aantal (' + runU.uit.join(' | ') + '; exit ' + runU.code + ')');
// herstel r3 (R3-D2): een mutant van het harnas zelf, alleen in het geheugen (geen kopie in de repo): telt het invoer als vergeleken, dan geeft dezelfde referentie
// exitcode 0 ("slaagt"); de eis hierboven (exitcode 3) vangt hem
var Module = require('module'), harnasBron = fs.readFileSync(HARNAS, 'utf8'), zoekM = "var VERGELEKEN = ['geslaagd', 'gezakt (definitie)', 'gezakt (bron)'];", mutant = new Module(HARNAS, null);
mutant.filename = HARNAS; mutant.paths = Module._nodeModulePaths(path.dirname(HARNAS));
mutant._compile(harnasBron.replace(zoekM, "var VERGELEKEN = ['geslaagd', 'gezakt (definitie)', 'gezakt (bron)', 'gezakt (invoer)'];  // MUTANT"), HARNAS);
var uMut = mutant.exports.vergelijk({ export: EXPORT_L, referentie: path.join(TMP, 'referentie_u13.csv') });
eis(harnasBron.split(zoekM).length === 2 && uMut.exit === 0 && runU.code === 3, 'herstel r3 (R3-D2): de mutant "invoer telt als vergeleken" geeft voor dezelfde referentie exitcode 0; de eis op exitcode 3 vangt hem (mutant: exit ' + uMut.exit + ')');
eis(runA.code === 0 && runA.uit.some(function (l) { return / gezakt \(invoer\)$/.test(l); }) && runA.melding.some(function (l) { return /niet vergeleken omdat Athena de invoer mist/.test(l); }),
  'herstel r3 (R3-D2): met minstens één vergeleken regel en daarnaast een regel gezakt (invoer) blijft de exitcode 0, met een vaste melding dat die regels niet vergeleken zijn (run A)');
eis(runC.melding.every(function (l) { return !/invoer mist/.test(l); }), 'herstel r3 (R3-D2): zonder regel gezakt (invoer) geen invoermelding (run C)');
// herstel r4 (R4-1, R4-2; het scenario van rev4/q1b en q3): de lege stand zoals vóór stap 5 (winsten zonder project). M04, M04/bestaand en M08 zijn leeg en
// invoer raakt ze (stap projecten): gezakt (invoer) met de melding, nooit stil "leeg (geen basis)". Het deel zonder (M04: winsten zonder getekende waarde,
// M08: deals zonder werkelijke datum) is een eigen telling in extra en wordt vergeleken, ook als de hoofdwaarde leeg is: hier de enige geslaagde regels
var cL = {}; LL.ctx.sturingCijfers(LL.peildatum).blokken.forEach(function (b) { b.cijfers.forEach(function (c) { cL[c.id] = c; }); });
var zonder04 = cL.gecontracteerd.extra.zonderGetekend, zonder08 = cL.gewonnenWaarde.extra.zonderDatum;
eis(cL.gecontracteerd.waarde === '' && zonder04 > 0 && zonder08 === 0, 'herstel r4: in de lege stand is M04 leeg met winsten zonder getekende waarde (anders test het geval niets)');
var refLz = [['M04', maand, zonder04, 'zonder', 'geslaagd'], ['M08', maand, zonder08, 'zonder', 'geslaagd'], ['M04', maand, 50000, '', 'gezakt (invoer)'],
  ['M04', maand, 30000, 'bestaand', 'gezakt (invoer)'], ['M08', maand, 30000, '', 'gezakt (invoer)']];
var runLz = draai(['--export', EXPORT_L, '--referentie', schrijfRef('referentie_lz.csv', refLz)]);
vergelijkRun('herstel r4 (lege stand, deel zonder)', runLz, refLz);
eis(runLz.code === 0 && runLz.melding.some(function (l) { return /niet vergeleken omdat Athena de invoer mist/.test(l); }) && !runLz.melding.some(function (l) { return /geen enkele regel/.test(l); }),
  'herstel r4 (R4-1): naast een geslaagde regel blijven M04 en M08 zonder waarde invoer, met de vaste invoermelding (exit ' + runLz.code + '; ' + runLz.melding.join(' | ') + ')');
// herstel r4 (R4-2b, het scenario van rev4/q1_m04_deel): een nieuwe winst zonder project en een bestaande met een project (getekend). Het deel nieuw van M04 en
// M08 is in Code.gs leeg (geen stille 0 of een ontbrekend deel); het harnas maakt er geen "gezakt (definitie)" meer van, maar invoer (gewonnen_is_getekend)
var expQ = kopie(exp), dQ = ctx.plusDagenVan(vandaag, -3) >= sjStart ? ctx.plusDagenVan(vandaag, -3) : vandaag;
expQ.tabellen.Kansen = [['q-n', 'nieuw', 50000], ['q-b', 'bestaand', 9000]].map(function (x) { return { id: x[0], naam: 'Verzonnen ' + x[0], school: 'Verzonnen School ' + x[0], schoolId: '', fase: 'gewonnen', waarde: x[2], eigenaar: exp.tabellen.Kansen[0].eigenaar, pipeline: 'Scholen', schooljaar: sj, klant: x[1], gesloten: dQ, aangemaakt: sjStart + ' 09:00' }; });
expQ.tabellen.Fasewissels = expQ.tabellen.Kansen.map(function (k) { return { id: k.id + '-fw', kansId: k.id, van: '', naar: 'gewonnen', werkelijkeDatum: dQ, ingevoerdOp: dQ + ' 10:00', door: k.eigenaar, eigenaar: k.eigenaar, zekerheid: 'laag', bron: 'tijdlijn', waarde: k.waarde }; });
expQ.tabellen.Trajecten = [{ id: 'q-t', kansId: 'q-b', schoolId: '', school: 'Verzonnen School q-b', traject: 'Verzonnen', schooljaar: sj, status: 'opstart', contractwaarde: 1000, omzet: 1000 }]; expQ.tabellen.Facturen = [];
var EXPORT_Q = path.join(TMP, 'export-deel.json'); fs.writeFileSync(EXPORT_Q, JSON.stringify(expQ));
var refQ = [['M04', maand, 1000, 'bestaand', 'geslaagd'], ['M04', maand, 50000, 'nieuw', 'gezakt (invoer)'], ['M08', maand, 50000, 'nieuw', 'gezakt (invoer)']];
var runQ = draai(['--export', EXPORT_Q, '--referentie', schrijfRef('referentie_q.csv', refQ)]);
vergelijkRun('herstel r4 (R4-2b, deel zonder getekende waarde)', runQ, refQ);
eis(runQ.code === 0 && runQ.melding.some(function (l) { return /invoer mist/.test(l); }), 'herstel r4 (R4-2b): het lege deel nieuw is invoer naast een geslaagd deel bestaand, met de invoermelding (exit ' + runQ.code + ')');
// herstel r5 (R5-C2, de scenario's van rev5-r3review/s5 en s6b): na stap fasen en de Capsule-stand een winst van dit schooljaar (Kansen.schooljaar) met een
// akkoord vóór 1 augustus zonder getekende waarde, een getekende winst van dit najaar voor volgend schooljaar en een kans in de voorstelfase. M04 en M07 zijn leeg
// door dezelfde oorzaak; contract gewonnen_is_getekend toetst de winst (winstSchooljaar, zoals M04) en zakt, dus beide zijn gezakt (invoer), nooit stil leeg.
// s6b: de winst heeft een lopend project zonder contractwaarde (zoals uit v6.4). Met M06 (geslaagd) erbij exitcode 0 met de invoermelding.
var rk5 = function (fn, a) { var d = JSON.parse(ctxK.demoRun(fn, JSON.stringify(a), 'demo-sophie')); if (!d.ok) throw new Error(fn + ': ' + d.fout); return d.result; };
rk5('apiAannameOpslaan', ['scope', { waarde: [], onderbouwing: 'verzonnen test', besluitdatum: ctx.plusDagenVan(vandaag, -1) }]);
rk5('apiAannameOpslaan', ['jaardoel', { waarde: { soort: 'contractwaarde', periode: 'schooljaar', scope: 'scope v1', noemer: 'jaardoel', waarde: 500000, schooljaar: sj }, onderbouwing: 'verzonnen test', besluitdatum: ctx.plusDagenVan(vandaag, -1) }]);
var vo5 = ctxK.mijlpalen().filter(function (m) { return m.rol === 'voorstel'; })[0], sjVolgend = (+sj.slice(0, 4) + 1) + '-' + (+sj.slice(0, 4) + 2), eig5 = exp.tabellen.Kansen[0].eigenaar;
function export5(legacy) {
  var e = exportVan(ctxK), dA = ctx.plusDagenVan(sjStart, -40), dB = ctx.plusDagenVan(vandaag, -10);
  e.eigenschappen.CAPSULE_MIGRATIE = vandaag + ' 09:00';
  e.tabellen.Kansen = [
    { id: 'r5-a', naam: 'Verzonnen A', school: 'Verzonnen School A', schoolId: '', fase: 'gewonnen', waarde: 40000, eigenaar: eig5, pipeline: 'Scholen', schooljaar: sj, klant: 'nieuw', gesloten: dA, aangemaakt: ctx.plusDagenVan(dA, -60) + ' 09:00' },
    { id: 'r5-b', naam: 'Verzonnen B', school: 'Verzonnen School B', schoolId: '', fase: 'gewonnen', waarde: 9000, eigenaar: eig5, pipeline: 'Scholen', schooljaar: sjVolgend, klant: 'bestaand', gesloten: dB, aangemaakt: ctx.plusDagenVan(dB, -60) + ' 09:00' },
    { id: 'r5-c', naam: 'Verzonnen C', school: 'Verzonnen School C', schoolId: '', fase: vo5.mijlpaal, waarde: 20000, eigenaar: eig5, pipeline: vo5.pipeline, schooljaar: sj, klant: 'nieuw', verwachteSluiting: ctx.plusDagenVan(vandaag, 20), aangemaakt: ctx.plusDagenVan(vandaag, -30) + ' 09:00', laatsteContact: ctx.plusDagenVan(vandaag, -2) }];
  e.tabellen.Fasewissels = e.tabellen.Kansen.map(function (k) { var won = k.fase === 'gewonnen', d = won ? k.gesloten : ctx.plusDagenVan(vandaag, -30); return { id: k.id + '-fw', kansId: k.id, van: won ? vo5.mijlpaal : '', naar: k.fase, werkelijkeDatum: d, ingevoerdOp: d + ' 10:00', door: eig5, eigenaar: eig5, zekerheid: 'hoog', bron: 'app', waarde: k.waarde, vanRol: won ? 'voorstel' : '', naarRol: won ? '' : 'voorstel' }; });
  e.tabellen.Trajecten = (legacy ? [{ id: 'r5-ta', kansId: 'r5-a', schoolId: '', school: 'Verzonnen School A', traject: 'Verzonnen A', schooljaar: sj, status: 'bezig', contractwaarde: '', omzet: 40000 }] : []).concat([
    { id: 'r5-t0', kansId: '', schoolId: '', school: 'Verzonnen School D', traject: 'Verzonnen lopend', schooljaar: sj, status: 'bezig', contractwaarde: 30000, omzet: 30000, verlenging: 'verlengd' },
    { id: 'r5-t', kansId: 'r5-b', schoolId: '', school: 'Verzonnen School B', traject: 'Verzonnen', schooljaar: sjVolgend, status: 'opstart', contractwaarde: 9000, omzet: 9000 }]);
  e.tabellen.Facturen = []; e.tabellen.Doelen = (e.tabellen.Doelen || []).filter(function (d) { return d.eigenaar !== 'bedrijf'; });
  return e;
}
[['s5', false], ['s6b', true]].forEach(function (x) {
  var p = path.join(TMP, 'export-r5-' + x[0] + '.json'); fs.writeFileSync(p, JSON.stringify(export5(x[1])));
  var L5 = H.laad({ export: p }), c14 = L5.ctx.datacontracten(L5.ctx.standVoorContracten(L5.peildatum)).filter(function (c) { return c.id === 'gewonnen_is_getekend'; })[0];
  eis(c14.stand === 'gezakt' && c14.afwijkingen.some(function (a) { return a.id === 'r5-a'; }) && !c14.afwijkingen.some(function (a) { return a.id === 'r5-b'; }),
    'herstel r5 (R5-C2, ' + x[0] + '): contract gewonnen_is_getekend toetst de winst van dit schooljaar met een akkoord vóór 1 augustus (winstSchooljaar) en zakt, de getekende winst voor volgend jaar niet (' + c14.stand + ')');
  var ref5 = [['M04', maand, 40000, '', 'gezakt (invoer)'], ['M07', maand, 10, '', 'gezakt (invoer)'], ['M04', maand, 40000, 'nieuw', 'gezakt (invoer)'], ['M06', vandaag, waardeVan(L5, 'M06', vandaag).waarde, '', 'geslaagd']];
  var run5 = draai(['--export', p, '--referentie', schrijfRef('referentie_r5_' + x[0] + '.csv', ref5)]);
  vergelijkRun('herstel r5 (R5-C2, ' + x[0] + ')', run5, ref5);
  eis(run5.code === 0 && run5.melding.some(function (l) { return /invoer mist/.test(l); }), 'herstel r5 (R5-C2, ' + x[0] + '): M04 en M07 leeg door dezelfde oorzaak zijn allebei invoer; met een geslaagde regel exitcode 0 en de invoermelding (exit ' + run5.code + ')');
});
// herstel r4: twee mutanten van het harnas, alleen in het geheugen: "leeg vóór invoer" (zoals 2744021) en "deel zonder pas na een lege hoofdwaarde"
function harnasMutant(zoek, vervang) {
  var m = new Module(HARNAS, null); m.filename = HARNAS; m.paths = Module._nodeModulePaths(path.dirname(HARNAS));
  if (harnasBron.split(zoek).length !== 2) return null;
  m._compile(harnasBron.replace(zoek, vervang), HARNAS); return m.exports;
}
var zoekLeeg = "if (a.leeg) return invoerRaakt(L, r) ? 'gezakt (invoer)' : 'leeg (geen basis)';", zoekZonder = "  if (r.uitsplitsing === 'zonder') return uit(c.extra ? c.extra[ZONDER[r.id]] : null);\n  if (zonderWaarde(c.waarde)) return uit(null);\n";
var mLeeg = harnasMutant(zoekLeeg, "if (a.leeg) return 'leeg (geen basis)';  // MUTANT"), mZonder = harnasMutant(zoekZonder, "  if (zonderWaarde(c.waarde)) return uit(null);  // MUTANT\n  if (r.uitsplitsing === 'zonder') return uit(c.extra ? c.extra[ZONDER[r.id]] : null);\n");
var refLzPad = path.join(TMP, 'referentie_lz.csv'), uLeeg = mLeeg && mLeeg.vergelijk({ export: EXPORT_L, referentie: refLzPad }), uZonder = mZonder && mZonder.vergelijk({ export: EXPORT_L, referentie: refLzPad });
eis(!!uLeeg && uLeeg.uit[2] === 'M04 ' + maand + ' leeg (geen basis)' && uLeeg.meldingen.every(function (l) { return !/invoer mist/.test(l); }) && runLz.uit[2] !== uLeeg.uit[2],
  'herstel r4 (R4-1): de mutant "leeg vóór invoer" geeft M04 stil leeg zonder invoermelding; de verwachting hierboven vangt hem (mutant: ' + (uLeeg ? uLeeg.uit.join(' | ') : 'zoektekst niet gevonden') + ')');
eis(!!uZonder && uZonder.uit[0] === 'M04 ' + maand + '/zonder gezakt (invoer)' && uZonder.exit === 3 && runLz.uit[0] !== uZonder.uit[0],
  'herstel r4 (R4-2): de mutant "deel zonder na een lege hoofdwaarde" vergelijkt M04/zonder niet (invoer, exitcode 3); de verwachting hierboven vangt hem (mutant: ' + (uZonder ? uZonder.uit.join(' | ') : 'zoektekst niet gevonden') + ')');

/* ---- 4c. v7.9.4 (bouwpunt 12): fasen en de Capsule-stand per stand ---- */
function refOverstap(Lx) { return [['M18', sj, waardeVan(Lx, 'M18', sj).waarde + 7, ''], ['M20', vandaag, waardeVan(Lx, 'M20', vandaag).waarde + 5, '']]; }
var runO = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_o.csv', refOverstap(L))]);
eis(runO.code === 3 && runO.uit.join('|') === ['M18 ' + sj + ' gezakt (invoer)', 'M20 ' + vandaag + ' gezakt (invoer)'].join('|'), 'overstap: zonder stap fasen en de Capsule-stand zijn M18 en M20 invoer; herstel r3 (R3-D2): niets vergeleken, dus exitcode 3 (' + runO.uit.join(' | ') + '; exit ' + runO.code + ')');
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
eis(runE1.code === 3 && runE1.uit.join('|') === ['M26 ' + maand + ' gezakt (bron)', 'M28 ' + vandaag + ' geblokkeerd (export zonder Open)'].join('|'), 'bouwpunt 15: --exact met een verkoopboek: M26 bron, M28 geblokkeerd (export zonder Open) in plaats van elke factuur als open; harnasdekking: die regel is niet vergeleken, dus exitcode 3 (' + runE1.uit.join(' | ') + '; exit ' + runE1.code + ')');
var runE2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e2.csv', refE), '--exact-verkoop', VERKOOP_ANDERS, '--exact-open', EXACT_OPEN_ANDERS, '--exact-open-stand', vandaag]);  // harnasdekking (4): de standdatum van Open
eis(runE2.code === 0 && runE2.uit.join('|') === ['M26 ' + maand + ' gezakt (bron)', 'M28 ' + vandaag + ' gezakt (bron)'].join('|'), 'bouwpunt 15: --exact-verkoop voor M26 en --exact-open voor M28 (' + runE2.uit.join(' | ') + ')');
var runE3 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e3.csv', refE), '--exact-verkoop', VERKOOP_OK, '--exact-open', EXACT_OK, '--exact-open-stand', vandaag]);
eis(runE3.code === 1 && runE3.uit.join('|') === ['M26 ' + maand + ' gezakt (onverklaard)', 'M28 ' + vandaag + ' gezakt (onverklaard)'].join('|'), 'bouwpunt 15: met exports die kloppen geen bron (' + runE3.uit.join(' | ') + ')');
var runE4 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e4.csv', refE), '--exact-verkoop', VERKOOP_ANDERS]);
eis(runE4.code === 1 && runE4.uit.join('|') === ['M26 ' + maand + ' gezakt (bron)', 'M28 ' + vandaag + ' gezakt (onverklaard)'].join('|'), 'bouwpunt 15: alleen het verkoopboek: M26 bron, M28 zonder bron (' + runE4.uit.join(' | ') + ')');
var runE5 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e5.csv', refE), '--exact-open', VERKOOP_OK]);
eis(runE5.code === 1 && runE5.uit.length === 0 && runE5.fout.join() === 'exact-open, regel 1, kolom Open: niet gevonden (ook geen betaaldatum)', 'bouwpunt 15: --exact-open zonder kolom Open of betaaldatum is een invoerfout (' + runE5.fout.join(' | ') + ')');
var runE6 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e6.csv', refE), '--exact', EXACT_OK, '--exact-verkoop', VERKOOP_OK]);
eis(runE6.code === 1 && runE6.fout.join() === 'argumenten: gebruik --exact of --exact-verkoop en --exact-open, niet allebei.', 'bouwpunt 15: --exact naast --exact-verkoop is een invoerfout (' + runE6.fout.join(' | ') + ')');
// herstel r1 (K12): een export met alleen de kolom Open zegt niets over een eerdere peildatum: M28 van de vorige maand is dan geblokkeerd, geen bronoordeel
var vorigeMaandK12 = ctx.plusDagenVan(maand + '-01', -1).slice(0, 7);
var runE8 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e8.csv', [['M28', vorigeMaandK12, ref28 + 99999, '']]), '--exact-verkoop', VERKOOP_OK, '--exact-open', EXACT_OPEN_ANDERS, '--exact-open-stand', vandaag]);
eis(runE8.uit.join() === 'M28 ' + vorigeMaandK12 + ' geblokkeerd (export zonder betaaldatum)' && runE8.code === 3,
  'herstel r1 (K12): M28 op een eerdere peildatum met een export met alleen Open: geblokkeerd (export zonder betaaldatum), geen bronoordeel; herstel r2 (B-B7): niets vergeleken, dus exitcode 3 (' + runE8.uit.join(' | ') + '; exit ' + runE8.code + ')');
// --exact met de kolom Open werkt als voorheen: het bedrag van de eerste factuur is gewijzigd; is die niet betaald, dan wijkt ook Open af (M28 bron)
var eersteF = exp.tabellen.Facturen.filter(function (f) { return verzondenOp(f); })[0], eersteBetaald = eersteF.status === 'betaald' || !!eersteF.betaald;
var runE7 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e7.csv', refE), '--exact', EXACT_ANDERS, '--exact-open-stand', vandaag]);
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

/* ---- 4g. v7.9.4 harnasdekking (de voorlopige run op de echte stand; docs/sturing-v7.9.md §7.7 en §7.12): een export die de periode niet dekt, de stand
   van Open, de redenen van invoer, een afgekapte week en wissels met zekerheid laag ---- */
// (3) Het venster van M26 en M27 is 1 augustus t/m de peildatum (vandaag t/m het eind van de maand). Een maand van het venster waarin Athena een verzonden termijn
// heeft, moet tussen de maand van de eerste en die van de laatste factuurdatum van het verkoopboek liggen; anders "geblokkeerd (export dekt de periode niet)",
// niet "gezakt (bron)", en niet vergeleken (exitcode 3). Vast in het vorige schooljaar (los van vandaag): t/m 30 november, termijnen in augustus en oktober.
var jV = +sj.slice(0, 4) - 1, sjV = jV + '-' + (jV + 1), perV = jV + '-11', expD = kopie(exp);
expD.tabellen.Trajecten.push({ id: 'harnas-td', kansId: '', schoolId: '', school: 'Verzonnen School D', traject: 'Verzonnen dekking', schooljaar: sjV, status: 'afgelopen', contractwaarde: 20000, omzet: 20000 });
[['harnas-d1', jV + '-08-20', 5000], ['harnas-d2', jV + '-10-15', 7000]].forEach(function (x, i) {
  expD.tabellen.Facturen.push({ id: x[0], trajectId: 'harnas-td', omschrijving: 'Verzonnen termijn', bedrag: x[2], datum: x[1], status: 'betaald', factuurnummer: String(978001 + i), verzonden: x[1], betaald: x[1], aangemaakt: x[1] + ' 09:00' });
});
var EXPORT_D = path.join(TMP, 'export-dekking.json'); fs.writeFileSync(EXPORT_D, JSON.stringify(expD));
// het verkoopboek: de termijnen van Athena t/m tot, een factuur uit het voorjaar ervoor (een vorig boekjaar) en extra bij het bedrag van harnas-d2
function verkoopboekTot(tot, extra) {
  var regels = ['Factuurnummer;Factuurdatum;Debiteur;Omschrijving;Bedrag', ['977001', nlDatum(jV + '-03-10'), 'Debiteur 0', 'Termijn', nlBedrag(800)].join(';')];
  expD.tabellen.Facturen.forEach(function (f, i) { var v = verzondenOp(f); if (v && v <= tot) regels.push([f.factuurnummer, nlDatum(v), 'Debiteur ' + (i + 1), 'Termijn', nlBedrag(Number(f.bedrag) + (f.id === 'harnas-d2' ? extra || 0 : 0))].join(';')); });
  return regels.join('\n') + '\n';
}
var VERKOOP_AUG = path.join(TMP, 'verkoopboek_augustus.csv'), VERKOOP_HEEL = path.join(TMP, 'verkoopboek_heel.csv'), VERKOOP_HEEL_ANDERS = path.join(TMP, 'verkoopboek_heel_gewijzigd.csv');
fs.writeFileSync(VERKOOP_AUG, verkoopboekTot(jV + '-08-31')); fs.writeFileSync(VERKOOP_HEEL, verkoopboekTot(jV + '-11-30')); fs.writeFileSync(VERKOOP_HEEL_ANDERS, verkoopboekTot(jV + '-11-30', 1000));
var LD = H.laad({ export: EXPORT_D }), aD = waardeVan(LD, 'M26', perV), refD3 = schrijfRef('referentie_d3.csv', [['M26', perV, Math.round(aD.waarde * 1.5 + 4321), '']]);
eis(!aD.geblokkeerd && !aD.leeg && aD.waarde >= 12000, 'harnasdekking (3): M26 op 30 november van vorig schooljaar telt de termijnen van augustus en oktober (anders test het geval niets)');
var runD1 = draai(['--export', EXPORT_D, '--referentie', refD3, '--exact-verkoop', VERKOOP_AUG]);
eis(runD1.uit.join() === 'M26 ' + perV + ' geblokkeerd (export dekt de periode niet)' && runD1.code === 3 && runD1.melding.some(function (l) { return /de export kan de bron niet toetsen/.test(l); }),
  'harnasdekking (3): een verkoopboek van een vorig boekjaar dat alleen augustus van het venster raakt, is geen afwijkende bron: geblokkeerd (export dekt de periode niet), exitcode 3 met een melding (' + runD1.uit.join(' | ') + '; exit ' + runD1.code + ')');
var runD2 = draai(['--export', EXPORT_D, '--referentie', refD3, '--exact-verkoop', VERKOOP_HEEL_ANDERS]);
eis(runD2.uit.join() === 'M26 ' + perV + ' gezakt (bron)' && runD2.code === 0, 'harnasdekking (3): een verkoopboek dat het venster dekt en afwijkt, is bron; september (zonder factuur, tussen de eerste en de laatste) telt als gedekt (' + runD2.uit.join(' | ') + '; exit ' + runD2.code + ')');
var runD3 = draai(['--export', EXPORT_D, '--referentie', refD3, '--exact-verkoop', VERKOOP_HEEL]);
eis(runD3.uit.join() === 'M26 ' + perV + ' gezakt (onverklaard)' && runD3.code === 1, 'harnasdekking (3): een verkoopboek dat het venster dekt en klopt, wijst niet naar de bron (' + runD3.uit.join(' | ') + '; exit ' + runD3.code + ')');

// (4) M28 met de kolom Open en zonder betaaldatum: Open is de stand op de dag van de export. Zonder --exact-open-stand: geblokkeerd (stand van Open onbekend); met
// een standdatum die niet de peildatum is: geblokkeerd (export zonder betaaldatum); met de standdatum gelijk aan de peildatum een vergelijking zoals voorheen
var refO4 = schrijfRef('referentie_o4.csv', [['M28', vandaag, ref28, '']]), gisteren = ctx.plusDagenVan(vandaag, -1);
var runO1 = draai(['--export', EXPORT, '--referentie', refO4, '--exact-open', EXACT_OPEN_ANDERS]);
eis(runO1.uit.join() === 'M28 ' + vandaag + ' geblokkeerd (stand van Open onbekend)' && runO1.code === 3 && runO1.melding.some(function (l) { return /de export kan de bron niet toetsen/.test(l); }),
  'harnasdekking (4): zonder --exact-open-stand vergelijkt het harnas de kolom Open niet alsof de export van vandaag is (' + runO1.uit.join(' | ') + '; exit ' + runO1.code + ')');
var runO2 = draai(['--export', EXPORT, '--referentie', refO4, '--exact-open', EXACT_OPEN_ANDERS, '--exact-open-stand', vandaag]);
eis(runO2.uit.join() === 'M28 ' + vandaag + ' gezakt (bron)' && runO2.code === 0, 'harnasdekking (4): met --exact-open-stand gelijk aan de peildatum vergelijkt het Open zoals voorheen (' + runO2.uit.join(' | ') + '; exit ' + runO2.code + ')');
var runO3 = draai(['--export', EXPORT, '--referentie', refO4, '--exact-open', EXACT_OPEN_ANDERS, '--exact-open-stand', gisteren]);
eis(runO3.uit.join() === 'M28 ' + vandaag + ' geblokkeerd (export zonder betaaldatum)' && runO3.code === 3, 'harnasdekking (4): een standdatum die niet de peildatum is, zonder betaaldatum: geblokkeerd (export zonder betaaldatum) (' + runO3.uit.join(' | ') + '; exit ' + runO3.code + ')');
var runO5 = draai(['--export', EXPORT, '--referentie', refO4, '--exact-verkoop', VERKOOP_OK, '--exact-open-stand', vandaag]), runO6 = draai(['--export', EXPORT, '--referentie', refO4, '--exact-open', EXACT_OK, '--exact-open-stand', '2999-01-01']);
eis(runO5.code === 1 && runO5.fout.join() === 'argumenten: --exact-open-stand alleen met --exact-open of --exact.' && runO6.code === 1 && runO6.fout.join() === 'exact-open-stand: ligt in de toekomst.',
  'harnasdekking (4): --exact-open-stand zonder export met Open, of in de toekomst, is een invoerfout (' + runO5.fout.concat(runO6.fout).join(' | ') + ')');
// herstel r6 (R6-1): de export met Open en het verkoopboek uit de facturen van een willekeurige export (filter op de factuurdatum), de stand van vandaag
function exactCsvVan(e, filter) {
  var regels = [exactKop], i = 0;
  e.tabellen.Facturen.forEach(function (f) {
    var v = verzondenOp(f); if (!v || (filter && !filter(v))) return; i++;
    var open = f.status === 'betaald' || !!f.betaald ? 0 : Number(f.bedrag);
    regels.push(['"' + nlDatum(v) + '"', '"' + f.factuurnummer + '"', '"Termijn"', '""', '"Debiteur ' + i + '"', '"' + (30000 + i) + '"', '""', '"' + nlBedrag(f.bedrag) + '"', '"0"', '"' + nlBedrag(open) + '"', '""'].join(';'));
  });
  return regels.join('\n') + '\n';
}
function verkoopCsvVan(e, filter) {
  var regels = ['Factuurnummer;Factuurdatum;Debiteur;Omschrijving;Bedrag'], i = 0;
  e.tabellen.Facturen.forEach(function (f) { var v = verzondenOp(f); if (!v || (filter && !filter(v))) return; i++; regels.push([f.factuurnummer, nlDatum(v), 'Debiteur ' + i, 'Termijn', nlBedrag(f.bedrag)].join(';')); });
  return regels.join('\n') + '\n';
}
function schrijfCsv(naam, tekst) { var p = path.join(TMP, naam); fs.writeFileSync(p, tekst); return p; }
function termijn(id, tr, d, bedrag, betaald, nr) { return { id: id, trajectId: tr, omschrijving: 'Verzonnen termijn', bedrag: bedrag, datum: d, status: betaald ? 'betaald' : 'verzonden', factuurnummer: nr, verzonden: d, betaald: betaald ? d : '', aangemaakt: d + ' 09:00' }; }
// Dekking: een open termijn in Athena van dit schooljaar (1 augustus) met een factuurdatum vóór de maand van de eerste factuur in de export (een export van
// alleen deze maand); herstel r6 (R6-1): M28 telt alleen facturen van dit schooljaar, dus de oude termijn van vóór 1 augustus van harnasdekking (4) telt niet meer
var tO = exp.tabellen.Trajecten.filter(function (t) { return t.schooljaar === sj; })[0], expO = kopie(exp);
expO.tabellen.Facturen.push(termijn('harnas-oud', tO.id, sjStart, 2500, false, '976001'), termijn('harnas-o-nu', tO.id, vandaag, 100, true, '976002'));
var EXPORT_O = path.join(TMP, 'export-open-oud.json'); fs.writeFileSync(EXPORT_O, JSON.stringify(expO));
var EXACT_LAAT = schrijfCsv('facturen_deze_maand.csv', exactCsvVan(expO, function (v) { return v >= maand + '-01'; }));
var refO7 = schrijfRef('referentie_o7.csv', [['M28', vandaag, Math.round(waardeVan(H.laad({ export: EXPORT_O }), 'M28', vandaag).waarde * 0.5 + 555), '']]);
var runO7 = draai(['--export', EXPORT_O, '--referentie', refO7, '--exact-open', EXACT_LAAT, '--exact-open-stand', vandaag]);
if (maand > sjStart.slice(0, 7)) eis(runO7.uit.join() === 'M28 ' + vandaag + ' geblokkeerd (export dekt de periode niet)' && runO7.code === 3, 'harnasdekking (4): een open termijn in Athena vóór het bereik van de export: geblokkeerd (export dekt de periode niet), niet bron (' + runO7.uit.join(' | ') + '; exit ' + runO7.code + ')');
else eis(true, 'harnasdekking (4): in augustus ligt 1 augustus in de maand van de export; niets te toetsen');

// herstel r6 (R6-1, de scenario's van rev6/p1c, p1b, s1_dekt en s4): M26 en M28 tellen de facturen van dit schooljaar van elk project, zoals Exact
var expR = kopie(exp), dSept = ctx.plusDagenVan(sjStart, 40) <= vandaag ? ctx.plusDagenVan(sjStart, 40) : vandaag;
expR.tabellen.Trajecten.push({ id: 'harnas-tv', kansId: '', schoolId: '', school: 'Verzonnen School V', traject: 'Verzonnen vorig', schooljaar: sjV, status: 'afgelopen', contractwaarde: 9000, omzet: 9000 });
expR.tabellen.Facturen.push(termijn('harnas-sept', 'harnas-tv', dSept, 3000, false, '974001'));
var EXPORT_R = path.join(TMP, 'export-slottermijn.json'); fs.writeFileSync(EXPORT_R, JSON.stringify(expR));
var LR = H.laad({ export: EXPORT_R }), som = function (e, f) { var t = 0; e.tabellen.Facturen.forEach(function (x) { var v = verzondenOp(x); if (v && f(v, x)) t += Number(x.bedrag); }); return Math.round(t * 100) / 100; };
var exact28 = som(expR, function (v, x) { return v >= sjStart && v <= vandaag && !(x.status === 'betaald' || x.betaald); }), exact26 = som(expR, function (v) { return v >= sjStart; });
// p1c: een slottermijn van een project van vorig schooljaar, in september verzonden en open; de referentie is Exact (Open en het verkoopboek uit dezelfde facturen)
var refR1 = [['M28', vandaag, exact28, '', 'geslaagd'], ['M26', maand, exact26, '', 'geslaagd']];
var runR1 = draai(['--export', EXPORT_R, '--referentie', schrijfRef('referentie_r1.csv', refR1), '--exact-open', schrijfCsv('facturen_r.csv', exactCsvVan(expR)), '--exact-verkoop', schrijfCsv('verkoop_r.csv', verkoopCsvVan(expR)), '--exact-open-stand', vandaag]);
vergelijkRun('herstel r6 (R6-1, slottermijn)', runR1, refR1);
eis(runR1.code === 0 && waardeVan(LR, 'M28', vandaag).waarde === exact28 && waardeVan(LR, 'M26', maand).waarde === exact26, 'herstel r6 (R6-1): Exact en Athena zijn het over elke factuur eens, dus M26 en M28 slagen (exit ' + runR1.code + ')');
// p1b: een open junitermijn van een project van vorig schooljaar en een export met Open van het boekjaar (vanaf 1 augustus). M28 telt de junitermijn niet en het harnas
// ook niet: dekt, en Exact = Athena. Een referentie van M28 + 500 is dan onverklaard (exitcode 1, zonder de melding "geen enkele regel is vergeleken", nit R6-3);
// een referentie met alle open posten (ook van vóór 1 augustus, zoals de werklijst) is de oude definitie
var expJ = kopie(expR), dJuni = ctx.plusDagenVan(sjStart, -45);
expJ.tabellen.Facturen.push(termijn('harnas-juni', 'harnas-tv', dJuni, 4000, false, '974002'));
var EXPORT_J = path.join(TMP, 'export-juni.json'); fs.writeFileSync(EXPORT_J, JSON.stringify(expJ));
var a28J = waardeVan(H.laad({ export: EXPORT_J }), 'M28', vandaag).waarde, EXACT_BOEKJAAR = schrijfCsv('facturen_boekjaar.csv', exactCsvVan(expJ, function (v) { return v >= sjStart; }));
var refJ = [['M28', vandaag, a28J + 500, '', 'gezakt (onverklaard)'], ['M28', vandaag, a28J + 4000, '', 'gezakt (definitie)']];
var runJ = draai(['--export', EXPORT_J, '--referentie', schrijfRef('referentie_j.csv', refJ), '--exact-open', EXACT_BOEKJAAR, '--exact-open-stand', vandaag]);
vergelijkRun('herstel r6 (R6-1, junitermijn)', runJ, refJ);
eis(a28J === exact28 && runJ.code === 1 && !runJ.melding.some(function (l) { return /geen enkele regel is vergeleken/.test(l); }),
  'herstel r6 (R6-1): een open termijn van vóór 1 augustus telt niet in M28 en blokkeert de export van het boekjaar niet; onverklaard is exitcode 1 zonder de melding dat niets vergeleken is (nit R6-3) (exit ' + runJ.code + '; ' + runJ.melding.join(' | ') + ')');
// s1_dekt: het verkoopboek van vandaag heeft alle termijnen t/m vorige maand, maar nog niet die Athena deze maand als verzonden heeft: de lopende maand is gedekt,
// dus een afwijking is bron (gezakt), niet "export dekt de periode niet"
var expS = kopie(exp), vmEerste = ctx.plusDagenVan(maand + '-01', -1).slice(0, 8) + '01';
expS.tabellen.Facturen.push(termijn('harnas-nu', tO.id, vandaag, 1500, false, '973001'), termijn('harnas-vm', tO.id, vmEerste, 700, true, '973002'));
var EXPORT_S = path.join(TMP, 'export-lopend.json'); fs.writeFileSync(EXPORT_S, JSON.stringify(expS));
var refS = [['M26', maand, som(expS, function (v) { return v >= sjStart && v < maand + '-01'; }), '', 'gezakt (bron)']];
var runS = draai(['--export', EXPORT_S, '--referentie', schrijfRef('referentie_s.csv', refS), '--exact-verkoop', schrijfCsv('verkoop_lopend.csv', verkoopCsvVan(expS, function (v) { return v < maand + '-01'; }))]);
vergelijkRun('herstel r6 (R6-1, lopende maand)', runS, refS);
eis(runS.code === 0, 'herstel r6 (R6-1): een verkoopboek van vandaag zonder de termijnen van deze maand dekt de lopende maand; Athena zegt verzonden, Exact niet: gezakt (bron), exitcode 0 (exit ' + runS.code + ')');
// s4 (nit R6-4): een referentie die alleen de projecten van het schooljaar telt (de definitie van vóór herstel r6, zoals een overzicht per project) is definitie
var a26R = waardeVan(LR, 'M26', maand).waarde, refM = [['M26', maand, a26R - 3000, '', 'gezakt (definitie)']];
var runM = draai(['--export', EXPORT_R, '--referentie', schrijfRef('referentie_m.csv', refM)]);
vergelijkRun('herstel r6 (nit R6-4, M26 per project van het schooljaar)', runM, refM);

// herstel r6 (nit R6-2, het scenario van rev6/s3_inject): alle winsten getekend, één lopend project zonder kans en zonder contractwaarde. M04 en M07 zijn lager dan de
// referentie door dezelfde invoer (contract lopend_project_heeft_contract), dus allebei gezakt (invoer); met M06 geslaagd erbij exitcode 0
var e3 = export5(false); e3.tabellen.Trajecten.forEach(function (t) { if (t.id === 'r5-t0') t.contractwaarde = ''; });
e3.tabellen.Trajecten.push({ id: 'r5-ta', kansId: 'r5-a', schoolId: '', school: 'Verzonnen School A', traject: 'Verzonnen A', schooljaar: sj, status: 'bezig', contractwaarde: 40000, omzet: 40000 });
var EXPORT_3 = path.join(TMP, 'export-r6-s3.json'); fs.writeFileSync(EXPORT_3, JSON.stringify(e3));
var L3 = H.laad({ export: EXPORT_3 }), c3 = {}; L3.ctx.datacontracten(L3.ctx.standVoorContracten(L3.peildatum)).forEach(function (c) { c3[c.id] = c.stand; });
var ref3 = [['M04', maand, 70000, '', 'gezakt (invoer)'], ['M07', maand, 99, '', 'gezakt (invoer)'], ['M06', vandaag, waardeVan(L3, 'M06', vandaag).waarde, '', 'geslaagd']];
var REF_3 = schrijfRef('referentie_r6_s3.csv', ref3), run3 = draai(['--export', EXPORT_3, '--referentie', REF_3]);
eis(c3.gewonnen_is_getekend === 'geslaagd' && c3.lopend_project_heeft_contract === 'gezakt' && waardeVan(L3, 'M04', maand).waarde === 40000, 'herstel r6 (nit R6-2): alle winsten getekend, één lopend project zonder contractwaarde (' + JSON.stringify(c3) + ')');
vergelijkRun('herstel r6 (nit R6-2, lopend project zonder contract)', run3, ref3);
eis(run3.code === 0, 'herstel r6 (nit R6-2): M04 en M07 allebei invoer naast een geslaagde M06: exitcode 0 (exit ' + run3.code + ')');

// (5) Een lege waarde die invoer raakt is gezakt (invoer) (herstel r4), en een melding noemt welk contract gezakt of leeg is en welke overstapstap open is
var invoerVan = function (run) { return run.melding.filter(function (l) { return /^melding: invoer die de regels gezakt \(invoer\) raakt: /.test(l); }); };
eis(invoerVan(runL).length === 1 && /overstapstap accounts \(open\)/.test(invoerVan(runL)[0]) && /contract waarde_vanaf_voorstel \(leeg\)/.test(invoerVan(runL)[0]) && /overstapstap projecten \(open\)/.test(invoerVan(runL)[0]),
  'harnasdekking (5): de lege stand noemt de open overstapstappen en het lege contract die de regels gezakt (invoer) raken (' + invoerVan(runL).join() + ')');
eis(invoerVan(runQ).length === 1 && /contract gewonnen_is_getekend \(gezakt\)/.test(invoerVan(runQ)[0]) && !/overstapstap projecten/.test(invoerVan(runQ)[0]) && invoerVan(runC).length === 0,
  'harnasdekking (5): het lege deel nieuw noemt het gezakte contract gewonnen_is_getekend; zonder regel gezakt (invoer) geen melding (' + invoerVan(runQ).join() + ')');

// (6) Een week die door de peildatum is afgekapt (maandag t/m de peildatum): een vaste melding zonder aantal; een hele week niet
var woVorig = ctx.plusDagenVan(ctx.maandagVanWeek(vorigeWeek), 2), LW = H.laad({ export: EXPORT, peildatum: woVorig });
var runW1 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_w1.csv', [['contactmomenten', vorigeWeek, waardeVan(LW, 'contactmomenten', vorigeWeek).waarde, '']]), '--peildatum', woVorig]);
var runW2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_w2.csv', [['contactmomenten', vorigeWeek, a14.waarde, '']])]);
var afgekapt = function (run) { return run.melding.some(function (l) { return /weekregels zijn op de peildatum afgekapt/.test(l); }); };
eis(runW1.uit.join() === 'contactmomenten ' + vorigeWeek + ' geslaagd' && afgekapt(runW1) && !afgekapt(runW2) && runW2.code === 0,
  'harnasdekking (6): een week met de peildatum op woensdag geeft de melding dat ze is afgekapt; vorige week heel niet (' + runW1.melding.concat(runW2.melding).join(' | ') + ')');

// (8) Een stand op een eerdere peildatum die op fasewissels rust (M06), met een wissel met zekerheid laag in dat schooljaar: een vaste melding, geen blokkade.
// Niet op de seed (geen wissel met zekerheid laag), niet voor de stand van vandaag en niet voor M26 (rust niet op wissels).
var pZ = H.periodeUit(ctx, vorigeMaand, vandaag).peildatum, startZ = ctx.sjOp(pZ).slice(0, 4) + '-08-01', expZ = kopie(exp);
var wZ = expZ.tabellen.Fasewissels.filter(function (w) { var d = String(w.werkelijkeDatum || '').slice(0, 10); return !w.ongedaan && !w.verwijderd && d >= startZ && d <= vandaag; })[0];
wZ.zekerheid = 'laag';
var EXPORT_Z = path.join(TMP, 'export-laag.json'); fs.writeFileSync(EXPORT_Z, JSON.stringify(expZ));
var refZ = schrijfRef('referentie_z.csv', [['M06', vorigeMaand, A('M06', vorigeMaand).waarde, '']]), refZ2 = schrijfRef('referentie_z2.csv', [['M06', vandaag, a06.waarde, ''], ['M26', vorigeMaand, A('M26', vorigeMaand).waarde, '']]);
var laag = function (run) { return run.melding.some(function (l) { return /zekerheid laag/.test(l); }); };
var runZ1 = draai(['--export', EXPORT_Z, '--referentie', refZ]), runZ0 = draai(['--export', EXPORT, '--referentie', refZ]), runZ2 = draai(['--export', EXPORT_Z, '--referentie', refZ2]);
eis(runZ1.uit.join() === 'M06 ' + vorigeMaand + ' geslaagd' && runZ1.code === 0 && laag(runZ1) && !laag(runZ0) && !laag(runZ2) && runZ2.code === 0,
  'harnasdekking (8): M06 op een eerdere peildatum met een wissel met zekerheid laag geeft een melding (geen blokkade); de seed, de stand van vandaag en M26 niet (' + runZ1.melding.concat(runZ0.melding, runZ2.melding).join(' | ') + ')');
// Zes (herstel r6: tien) mutanten van het harnas, alleen in het geheugen: elk geeft het oude gedrag terug, en de eis erachter laat zien dat een eis hierboven hem vangt
var metMelding = function (u, re) { return u.meldingen.some(function (l) { return re.test(l); }); };
[['dekking (3, 4)', 'return datums.every(function (d) {', 'return true || datums.every(function (d) {', function (m) {
    return m.vergelijk({ export: EXPORT_D, referentie: refD3, 'exact-verkoop': VERKOOP_AUG }).uit[0] === 'M26 ' + perV + ' gezakt (bron)' &&
      (maand === sjStart.slice(0, 7) || m.vergelijk({ export: EXPORT_O, referentie: refO7, 'exact-open': EXACT_LAAT, 'exact-open-stand': vandaag }).uit[0] !== 'M28 ' + vandaag + ' geblokkeerd (export dekt de periode niet)'); }],
  // herstel r6: vier erbij (de lopende maand en M28 op de factuurdatum (R6-1), de oude definitie van M26 (nit R6-4) en RAAKT.dekking (nit R6-2))
  ['lopende maand (R6-1)', ' || (m === pM && lM >= vorige)', '', function (m) { return m.vergelijk({ export: EXPORT_S, referentie: path.join(TMP, 'referentie_s.csv'), 'exact-verkoop': path.join(TMP, 'verkoop_lopend.csv') }).uit[0] === 'M26 ' + maand + ' geblokkeerd (export dekt de periode niet)'; }],
  ['M28 op de factuurdatum (R6-1)', "if (v && v.datum >= van && v.datum <= d && !(b && b.datum <= d))", "if (v && v.datum <= d && !(b && b.datum <= d))", function (m) { return m.vergelijk({ export: EXPORT_J, referentie: path.join(TMP, 'referentie_j.csv'), 'exact-open': EXACT_BOEKJAAR, 'exact-open-stand': vandaag }).uit[0] === 'M28 ' + vandaag + ' geblokkeerd (export dekt de periode niet)'; }],
  ['oude definitie M26 (nit R6-4)', '  gefactureerd: function (L, r) {', '  gefactureerdUit: function (L, r) {', function (m) { return m.vergelijk({ export: EXPORT_R, referentie: path.join(TMP, 'referentie_m.csv') }).uit[0] === 'M26 ' + maand + ' gezakt (onverklaard)'; }],
  ['RAAKT.dekking (nit R6-2)', "'lopend_project_heeft_contract', 'noemerbewaking', 'overstap:fasen', 'overstap:capsule', 'overstap:projecten'],", "'noemerbewaking', 'overstap:fasen', 'overstap:capsule'],", function (m) { var u = m.vergelijk({ export: EXPORT_3, referentie: REF_3 }); return u.uit[1] === 'M07 ' + maand + ' gezakt (onverklaard)' && u.exit === 1; }],
  ['standdatum van Open (4)', 'if (!X.metBetaald && !(L.openStand && opDag))', 'if (!X.metBetaald && d < L.vandaag)', function (m) { return m.vergelijk({ export: EXPORT, referentie: refO4, 'exact-open': EXACT_OPEN_ANDERS }).uit[0] === 'M28 ' + vandaag + ' gezakt (bron)'; }],
  ['exitcode bij een exportblokkade (3, 4)', 'stand || exportBlok ||', 'stand ||', function (m) { return m.vergelijk({ export: EXPORT, referentie: path.join(TMP, 'referentie_e1.csv'), exact: VERKOOP_ANDERS }).exit === 0; }],
  ['de invoer bij naam (5)', "meldingen.push(INVOER_MELDING, 'melding: invoer die de regels gezakt (invoer) raakt: ' + invoerNamen.join(', ') + '.')", 'meldingen.push(INVOER_MELDING)', function (m) { return !metMelding(m.vergelijk({ export: EXPORT_L, referentie: path.join(TMP, 'referentie_l.csv') }), /invoer die de regels/); }],
  ['afgekapte week (6)', 'afgekapt: P < eind', 'afgekapt: false', function (m) { return !metMelding(m.vergelijk({ export: EXPORT, referentie: path.join(TMP, 'referentie_w1.csv'), peildatum: woVorig }), /afgekapt/); }],
  ['zekerheid laag (8)', "return w.zekerheid === 'laag' &&", 'return false &&', function (m) { return !metMelding(m.vergelijk({ export: EXPORT_Z, referentie: refZ }), /zekerheid laag/); }]
].forEach(function (x) { var m = harnasMutant(x[1], x[2]); eis(!!m && x[3](m), 'harnasdekking: de mutant "' + x[0] + '" geeft het oude gedrag; een eis hierboven vangt hem' + (m ? '' : ' (zoektekst niet gevonden)')); });

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
var vlVergeleken = runVl.uit.some(function (l) { return / (geslaagd|gezakt \((definitie|bron)\))$/.test(l); });  // herstel r3 (R3-D2): invoer telt niet als vergeleken
eis(runVl.fout.length === 0 && runVl.uit.length === dataRegels && !runVl.uit.some(function (l) { return /onverklaard/.test(l); }) && runVl.code === (vlVergeleken ? 0 : 3),
  'v7.9.4: het verzonnen voorbeeld op de lege stand: elke regel gelezen en niets onverklaard; herstel r3: exitcode ' + (vlVergeleken ? 0 : 3) + ' (' + runVl.uit.filter(function (l) { return /onverklaard/.test(l); }).join(' | ') + '; exit ' + runVl.code + ')');

/* ---- 8. de uitvoer: patroon, geen namen, geen bedragen ---- */
var runs = [runA, runB, runC, runC2, runV, runL, runLx, runLp, runLn, runLz, runQ, runU, runO, runOc, runOk, runX, runXp, runE1, runE2, runE3, runE4, runE7, runE8, runB1, runVl, runS0, runS,
  runD1, runD2, runD3, runO1, runO2, runO3, runO7, runW1, runW2, runZ0, runZ1, runZ2, runR1, runJ, runS, runM, run3];  // harnasdekking; herstel r6
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
