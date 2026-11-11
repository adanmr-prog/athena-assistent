/* Athena Assistent — v7.9 (bouwpunt 12): test van het vergelijkingsharnas test/vergelijk_sturing.js op de verzonnen demoseed.
 * Maakt in een tijdelijke map (os.tmpdir(), buiten de repo) een export van de demoseed, een Exact- en een XPS-export die met die stand
 * kloppen en een gewijzigde kopie van elk, en referenties met regels die geslaagd, geblokkeerd, definitie, invoer, bron en onverklaard
 * moeten geven. Controleert ook het patroon van elke uitvoerregel, dat er geen naam, schoolnaam of bedrag in de uitvoer staat, dat een
 * invoerfout alleen bestand, regelnummer en kolomnaam noemt, dat een pad binnen de repo geweigerd wordt en dat de tijdelijke map weg is.
 *   node test/vergelijk_sturing_test.js   → ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1) */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process');
var R = path.join(__dirname, '..'), HARNAS = path.join(__dirname, 'vergelijk_sturing.js'), H = require('./vergelijk_sturing.js');
var PATROON = /^(M\d{2}|[a-zA-Z]+) \S+ (geslaagd|geblokkeerd|gezakt \((definitie|invoer|bron|onverklaard)\))$/;

var fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }

/* ---- 1. de demoseed als export (het formaat van server/migratie.js --bewaar) ---- */
var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8'), ctx, { filename: 'demo.js' });
ctx.demoStart('');
var vandaag = vm.runInContext('datumStr(new Date())', ctx), sj = ctx.huidigSchooljaar(), sjStart = sj.slice(0, 4) + '-08-01', maand = vandaag.slice(0, 7);
var vorigeWeek = ctx.isoWeekStr(ctx.parseDatum(ctx.plusDagenVan(vandaag, -7)));
var bl = JSON.parse(ctx.demoExport()), exp = { tabellen: {}, eigenschappen: bl.props };
Object.keys(bl.bladen).forEach(function (n) {
  var rijen = bl.bladen[n], kop = rijen[0] || [];
  exp.tabellen[n] = rijen.slice(1).filter(function (r) { return r.some(function (x) { return x !== '' && x != null; }); }).map(function (r) { var o = {}; kop.forEach(function (k, i) { o[k] = r[i] == null ? '' : r[i]; }); return o; });
});
// Mutaties in de tijdelijke kopie (nooit in de seed): een gewonnen kans met een geschatte waarde die afwijkt van de getekende (oude definitie M08),
// en elke termijn een uniek factuurnummer (zodat het contract termijn_verzonden_heeft_factuurnummer slaagt en M26 tot de bron kan komen)
var kWin = exp.tabellen.Kansen.filter(function (k) { return k.fase === 'gewonnen' && String(k.gesloten).slice(0, 10) >= sjStart; })[0];
kWin.waarde = Number(kWin.waarde) + 11400;
exp.tabellen.Facturen.forEach(function (f, i) { if (f.factuurnummer !== '' || f.verzonden || ['verzonden', 'betaald'].indexOf(f.status) >= 0) f.factuurnummer = String(970000 + i); });

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-harnas-'));
var EXPORT = path.join(TMP, 'export-' + vandaag + '.json');
fs.writeFileSync(EXPORT, JSON.stringify(exp));
eis(!H.binnenRepo(EXPORT) && H.binnenRepo(path.join(R, 'test', 'x.csv')) && H.binnenRepo(R), 'binnenRepo: de tijdelijke map ligt buiten de repo, test/x.csv en de repo zelf erbinnen');

/* ---- 2. een Exact- en een XPS-export die met de stand kloppen, en een gewijzigde kopie van elk ---- */
function verzondenOp(f) { return f.verzonden ? String(f.verzonden).slice(0, 10) : (['verzonden', 'betaald'].indexOf(f.status) >= 0 && f.datum ? String(f.datum).slice(0, 10) : ''); }
function nlDatum(d) { return d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4); }
function nlBedrag(x) { return (Math.round(Number(x) * 100) / 100).toFixed(2).replace('.', ','); }
var exactKop = fs.readFileSync(path.join(R, 'test/voorbeelden/facturen_export.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0];
function exactCsv(extra) {
  var regels = [exactKop], i = 0;
  exp.tabellen.Facturen.forEach(function (f) {
    var v = verzondenOp(f); if (!v) return;
    var bedrag = Number(f.bedrag) + (i === 0 ? extra : 0), betaald = f.status === 'betaald' || !!f.betaald; i++;
    regels.push(['"' + nlDatum(v) + '"', '"' + f.factuurnummer + '"', '"Termijn"', '""', '"Debiteur ' + i + '"', '"' + (30000 + i) + '"', '""', '"' + nlBedrag(bedrag) + '"', '"0"', '"' + (betaald ? '0,00' : nlBedrag(bedrag)) + '"', '""'].join(';'));
  });
  return regels.join('\n') + '\n';
}
var talent = {}, traject = {}; exp.tabellen.Talenten.forEach(function (t) { talent[t.id] = t; }); exp.tabellen.Trajecten.forEach(function (t) { traject[t.id] = t; });
var xpsKop = fs.readFileSync(path.join(R, 'test/voorbeelden/xps_diensten.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0];
function xpsCsv(extra) {
  var regels = [xpsKop];
  exp.tabellen.TalentUren.forEach(function (u, i) {
    var t = talent[u.talentId] || {}, p = traject[u.trajectId] || {}, dag = ctx.maandagVanWeek(u.week);
    regels.push([dag, dag + ' 08:30', '', nlBedrag(Number(u.uren) + (i === 0 ? extra : 0)), '', 'Dienst', 'Uitgevoerd', u.xpsProject || '', '', '', '', t.xpsId || '', '', p.xpsProject || ''].join(';'));
  });
  return regels.join('\n') + '\n';
}
var EXACT_OK = path.join(TMP, 'facturen_klopt.csv'), EXACT_ANDERS = path.join(TMP, 'facturen_gewijzigd.csv'), XPS_OK = path.join(TMP, 'diensten_klopt.csv'), XPS_ANDERS = path.join(TMP, 'diensten_gewijzigd.csv');
fs.writeFileSync(EXACT_OK, exactCsv(0)); fs.writeFileSync(EXACT_ANDERS, exactCsv(1000));
fs.writeFileSync(XPS_OK, xpsCsv(0)); fs.writeFileSync(XPS_ANDERS, xpsCsv(3));

/* ---- 3. de Athena-cijfers via het harnas, met een onafhankelijke controle tegen apiSturing ---- */
var L = H.laad({ export: EXPORT });
function A(metriek, periode, uitsplitsing) {
  var id = /^M\d{2}$/.test(metriek) ? Object.keys(L.ctx.METRIEKEN).filter(function (k) { return L.ctx.METRIEKEN[k].m === metriek && k !== 'gewonnen'; })[0] : metriek;
  return H.athenaWaarde(L, { id: id, per: H.periodeUit(L.ctx, periode, L.peildatum), uitsplitsing: uitsplitsing || '' });
}
var mt = JSON.parse(L.ctx.demoRun('apiSturing', JSON.stringify(['mt', {}]), 'demo-sophie')).result, mtW = {};
mt.blokken.forEach(function (b) { b.cijfers.forEach(function (c) { mtW[c.id] = c.waarde; }); });
var wk = JSON.parse(L.ctx.demoRun('apiSturing', JSON.stringify(['week', { stap: -1 }]), 'demo-sophie')).result;
var a04 = A('M04', maand), a06 = A('M06', vandaag), a26 = A('M26', maand), a25 = A('M25', maand), a08 = A('M08', maand), a18 = A('M18', sj), a14 = A('contactmomenten', vorigeWeek), a04n = A('M04', maand, 'nieuw');
eis(a04.waarde === mtW.gecontracteerd && a06.waarde === mtW.gewogenPijplijn && a26.waarde === mtW.gefactureerd && a25.waarde === mtW.geleverd && a08.waarde === mtW.gewonnenWaarde,
  'het harnas rekent M04, M06, M08, M25 en M26 van deze maand gelijk aan apiSturing(\'mt\')');
eis(wk.week === vorigeWeek && a14.waarde === wk.totaal.cijfers.contactmomenten, 'het harnas rekent M14 van vorige week gelijk aan het teamtotaal van apiSturing(\'week\')');
eis(a04.waarde > 0 && a26.waarde > 0 && a25.waarde > 0 && a06.waarde > 0, 'de demoseed heeft M04, M06, M25 en M26 boven nul (anders test de vergelijking niets)');
eis(A('M01', maand).geblokkeerd && A('M30', maand).geblokkeerd, 'M01 (zonder jaardoel) en M30 (marge) zijn in de standaardseed geblokkeerd');

// Onafhankelijk orakel voor de oude definitie van M08: Kansen.gesloten en Kansen.waarde, recht uit de export
var oud08 = 0, oud04 = 0;
exp.tabellen.Kansen.forEach(function (k) { var g = String(k.gesloten).slice(0, 10); if (k.fase === 'gewonnen' && g >= sjStart && g <= vandaag) oud08 += Number(k.waarde) || 0; if (k.fase === 'gewonnen' && String(k.schooljaar) === sj) oud04 += Number(k.waarde) || 0; });
eis(Math.abs(oud08 - a08.waarde) > 0.01 * a08.waarde, 'de oude definitie van M08 wijkt in de kopie meer dan de tolerantie af van de nieuwe');
var ref04 = Math.round(a04.waarde * 1.37 + 777), ref26 = Math.round(a26.waarde * 0.5 + 333), ref25 = Math.round(a25.waarde * 0.5 + 444);
eis(Math.abs(ref04 - oud04) > 0.01 * ref04, 'de M04-regel voor invoer valt niet samen met de oude definitie van M04');

/* ---- 4. de runs ---- */
function schrijfRef(naam, regels) { var p = path.join(TMP, naam); fs.writeFileSync(p, '# verzonnen referentie voor de test\nmetriek;periode;waarde;uitsplitsing\n' + regels.map(function (r) { return r.join(';'); }).join('\n') + '\n'); return p; }
var alleUitvoer = [];
function draai(args) {
  var p = cp.spawnSync(process.execPath, [HARNAS].concat(args), { encoding: 'utf8', cwd: TMP });
  alleUitvoer.push(p.stdout, p.stderr);
  return { code: p.status, uit: p.stdout.split('\n').filter(Boolean), fout: p.stderr.split('\n').filter(Boolean) };
}
var GOED = [
  ['M04', maand, a04.waarde, ''], ['gecontracteerd', maand, a04n.waarde, 'nieuw'], ['M06', vandaag, a06.waarde, ''], ['contactmomenten', vorigeWeek, a14.waarde, ''],
  ['M26', maand, a26.waarde, ''], ['M18', sj, a18.waarde, ''], ['M08', maand, a08.waarde, '']
];
var VERWACHT_A = [
  ['M01', maand, 1000000, '', 'geblokkeerd'], ['M30', maand, 5, '', 'geblokkeerd'],
  ['M08', maand, oud08, '', 'gezakt (definitie)'], ['M04', maand, ref04, '', 'gezakt (invoer)'],
  ['M26', maand, ref26, '', 'gezakt (bron)'], ['M25', maand, ref25, '', 'gezakt (bron)']
];
var refA = GOED.map(function (r) { return r.concat(['geslaagd']); }).concat(VERWACHT_A);
var runA = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_a.csv', refA.map(function (r) { return r.slice(0, 4); })), '--exact', EXACT_ANDERS, '--xps', XPS_ANDERS]);
eis(runA.code === 0 && runA.fout.length === 0, 'run A: exitcode 0 zonder onverklaarde regels en zonder foutmeldingen');
eis(runA.uit.length === refA.length, 'run A: één uitvoerregel per referentieregel');
refA.forEach(function (r, i) {
  var verwacht = r[0] + ' ' + r[1] + (r[3] ? '/' + r[3] : '') + ' ' + r[4];
  eis(runA.uit[i] === verwacht, 'run A: ' + verwacht + (runA.uit[i] === verwacht ? '' : ' (kreeg: ' + runA.uit[i] + ')'));
});
var cats = {}; runA.uit.forEach(function (l) { var m = PATROON.exec(l); if (m) cats[m[3] || m[2]] = true; });
eis(['geslaagd', 'geblokkeerd', 'definitie', 'invoer', 'bron'].every(function (c) { return cats[c]; }), 'run A: de categorieën geslaagd, geblokkeerd, definitie, invoer en bron komen voor');

var refB = refA.map(function (r) { return r.slice(0, 4); }).concat([['M14', vorigeWeek, a14.waarde + 17, '']]);
var runB = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_b.csv', refB), '--exact', EXACT_ANDERS, '--xps', XPS_ANDERS]);
eis(runB.code === 1 && runB.uit[runB.uit.length - 1] === 'M14 ' + vorigeWeek + ' gezakt (onverklaard)', 'run B: een willekeurig afwijkende M14-regel is onverklaard en geeft exitcode 1');

// Klopt de export met de stand, dan is er geen bron om naar te wijzen: dezelfde afwijkende regels zijn dan onverklaard
var runC = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_c.csv', [['M26', maand, a26.waarde, ''], ['M26', maand, ref26, ''], ['M25', maand, ref25, '']]), '--exact', EXACT_OK, '--xps', XPS_OK]);
eis(runC.code === 1 && runC.uit.join('|') === ['M26 ' + maand + ' geslaagd', 'M26 ' + maand + ' gezakt (onverklaard)', 'M25 ' + maand + ' gezakt (onverklaard)'].join('|'), 'run C: met exports die kloppen geen bron (M26 en M25 onverklaard, exitcode 1)');
var runC2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_c2.csv', [['M26', maand, ref26, ''], ['M25', maand, ref25, '']])]);
eis(runC2.code === 1 && runC2.uit.every(function (l) { return / gezakt \(onverklaard\)$/.test(l); }), 'run C: zonder --exact en --xps kan de bron niet wijzen');

// Peildatum: een periode na de peildatum is een invoerfout; een maand voor de peildatum rekent op de laatste dag van die maand
var vorigeMaand = ctx.plusDagenVan(maand + '-01', -1).slice(0, 7);
var runP = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_p.csv', [['M04', maand, a04.waarde, '']]), '--peildatum', vorigeMaand + '-15']);
eis(runP.code === 1 && runP.uit.length === 0 && runP.fout.length === 1 && /^referentie, regel 3, kolom periode: na de peildatum$/.test(runP.fout[0]), 'peildatum: een periode na de peildatum geeft een invoerfout met regel en kolom');
var runP2 = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_p2.csv', [['M04', maand, a04.waarde, '']]), '--peildatum', '2999-01-01']);
eis(runP2.code === 1 && runP2.fout.join() === 'peildatum: ligt in de toekomst.', 'peildatum in de toekomst wordt geweigerd');

/* ---- 5. invoerfouten: alleen bestand, regelnummer en kolomnaam ---- */
var school = exp.tabellen.Scholen[0].naam, persoon = ctx.DEMO_MENSEN[3].naam.split(' ')[0];
var refD = path.join(TMP, 'referentie_d.csv');
fs.writeFileSync(refD, 'metriek;periode;waarde\nM04;' + maand + ';1000\nM04;' + maand + ';' + school + '\n' + persoon + ';' + maand + ';12\nM04;volgend jaar;5\n');
var runD = draai(['--export', EXPORT, '--referentie', refD]);
eis(runD.code === 1 && runD.uit.length === 0, 'invoerfout: exitcode 1 en geen uitkomsten');
eis(runD.fout.join('|') === 'referentie, regel 3, kolom waarde: geen getal|referentie, regel 4, kolom metriek: onbekend cijfer|referentie, regel 5, kolom periode: onbekende vorm',
  'invoerfout: per fout alleen bestand, regelnummer en kolomnaam (' + runD.fout.join(' | ') + ')');
var exactFout = path.join(TMP, 'facturen_fout.csv');
fs.writeFileSync(exactFout, exactKop + '\n"01-09-' + sj.slice(0, 4) + '";"1";"x";"";"' + school + '";"1";"";"veel";"0";"0,00";""\n');
var runE = draai(['--export', EXPORT, '--referentie', schrijfRef('referentie_e.csv', [['M26', maand, a26.waarde, '']]), '--exact', exactFout]);
eis(runE.code === 1 && runE.fout.join() === 'exact, regel 2, kolom Totaal: geen bedrag', 'invoerfout in de Exact-export: bestand, regel en kolom (' + runE.fout.join(' | ') + ')');
var kapot = path.join(TMP, 'export-kapot.json'); fs.writeFileSync(kapot, '{ "tabellen": ');
var runK = draai(['--export', kapot, '--referentie', schrijfRef('referentie_k.csv', [['M04', maand, 1, '']])]);
eis(runK.code === 1 && runK.fout.join() === 'export: geen geldige JSON.', 'een kapotte export geeft een korte fout, zonder terug te vallen op de demoseed');

/* ---- 6. een pad binnen de repo wordt geweigerd ---- */
var VOORBEELD = path.join(R, 'test/voorbeelden/sturing_referentie.csv');
var runR = draai(['--export', EXPORT, '--referentie', VOORBEELD]);
eis(runR.code === 1 && runR.uit.length === 0 && runR.fout.join() === 'referentie: Zet echte bestanden buiten de repo.', 'een referentie binnen de repo wordt geweigerd');
var runR2 = draai(['--export', path.join(R, 'package.json'), '--referentie', refD]);
eis(runR2.code === 1 && runR2.fout.join() === 'export: Zet echte bestanden buiten de repo.', 'een export binnen de repo wordt geweigerd');
var koppeling = path.join(TMP, 'via-koppeling.csv'), koppelingOk = true;
try { fs.symlinkSync(VOORBEELD, koppeling); } catch (e) { koppelingOk = false; }
if (koppelingOk) { var runR3 = draai(['--export', EXPORT, '--referentie', koppeling]); eis(runR3.code === 1 && runR3.fout.join() === 'referentie: Zet echte bestanden buiten de repo.', 'een symbolische koppeling naar een bestand in de repo wordt ook geweigerd'); }
var runR4 = draai(['--export', EXPORT, '--referentie', 'test/voorbeelden/sturing_referentie.csv']);
eis(runR4.code === 1 && runR4.fout.join() === 'referentie: het bestand is niet te lezen.', 'een relatief pad wordt gelezen vanuit de werkmap (hier de tijdelijke map), niet vanuit de repo');

/* ---- 7. het verzonnen voorbeeld: elke regel wordt gelezen ---- */
var kopie = path.join(TMP, 'sturing_referentie.csv'); fs.copyFileSync(VOORBEELD, kopie);
var dataRegels = fs.readFileSync(VOORBEELD, 'utf8').split(/\r?\n/).filter(function (l) { return l.trim() && !/^\s*#/.test(l); }).length - 1;
var runV = draai(['--export', EXPORT, '--referentie', kopie, '--exact', EXACT_OK, '--xps', XPS_OK]);
eis(runV.fout.length === 0 && runV.uit.length === dataRegels && dataRegels >= 10, 'het verzonnen voorbeeld test/voorbeelden/sturing_referentie.csv: elke regel gelezen, geen invoerfout (' + runV.uit.length + ' regels)');

/* ---- 8. de uitvoer: patroon, geen namen, geen bedragen ---- */
var stdoutRegels = [runA, runB, runC, runC2, runV].reduce(function (s, r) { return s.concat(r.uit); }, []);
eis(stdoutRegels.length > 0 && stdoutRegels.every(function (l) { return PATROON.test(l); }), 'elke uitvoerregel matcht ' + PATROON);
var tekst = alleUitvoer.join('\n'), namen = [];
ctx.DEMO_MENSEN.forEach(function (m) { namen.push(m.naam); m.naam.split(' ').forEach(function (d) { if (d.length > 3) namen.push(d); }); });
exp.tabellen.Scholen.forEach(function (s) { namen.push(s.naam); });
exp.tabellen.Talenten.forEach(function (t) { if (t.achternaam) namen.push(t.voornaam + ' ' + t.achternaam); });
var gevonden = namen.filter(function (n) { return n && tekst.indexOf(n) >= 0; });
eis(!gevonden.length, 'geen naam of schoolnaam uit de seed in de uitvoer' + (gevonden.length ? ' (' + gevonden.slice(0, 3).join(', ') + ')' : ''));
var bedragen = [a04.waarde, a06.waarde, a26.waarde, a25.waarde, a08.waarde, oud08, ref04, ref26, ref25].filter(function (x) { return Math.abs(x) >= 100; }).map(function (x) { return String(x); });
eis(!bedragen.some(function (b) { return tekst.indexOf(b) >= 0; }) && stdoutRegels.every(function (l) { return !/\d/.test(l.split(' ').slice(2).join(' ')); }), 'geen bedrag of telling in de uitvoer (alleen M-code en periode bevatten cijfers)');

/* ---- 9. opruimen ---- */
fs.rmSync(TMP, { recursive: true, force: true });
eis(!fs.existsSync(TMP), 'de tijdelijke map is weg');

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exitCode = fouten ? 1 : 0;
