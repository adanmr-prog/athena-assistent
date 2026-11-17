/* Athena Assistent — v7.9.4 (bouwpunt 10): test van test/urenbasislijn.js op het verzonnen voorbeeld test/voorbeelden/xps_diensten.csv.
 * Een onafhankelijk orakel (een eigen lezer van de csv, niet Code.gs) rekent de verwachte uren per maand: alleen gewerkte diensten (status niet afwezig,
 * ziek, geannuleerd, reserve, no-show of laat; uren > 0; t/m vandaag), per maand van de maandag van de week, alleen voorbije schooljaren en alleen de maanden
 * binnen de looptijd van de export. Herstel r1 (K8, R794-5): alleen diensten die aan een talent in de (verzonnen) export koppelen (accountnummer, e-mail of
 * naam), zoals de urenimport en dus M09; de export is verplicht en een dienst zonder talent geeft een melding zonder aantal. Het voorbeeld zelf (via --voorbeeld; de uitkomst hangt af van de datum van vandaag),
 * een kopie met datums 104 weken terug (een voorbij schooljaar), een grotere verzonnen export, de vorm regels, --uit, --schooljaren, de weigering van
 * paden binnen de repo, geen namen of uren op stderr, en de waarde als aanname urenBasislijn in een demostand (M09 niet meer geblokkeerd). Alleen in een
 * tijdelijke map buiten de repo; die is aan het eind weg.
 *   node test/urenbasislijn_test.js   → ALLES GOED (exitcode 0) of FOUTEN: n (exitcode 1) */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process');
var R = path.join(__dirname, '..'), SCRIPT = path.join(__dirname, 'urenbasislijn.js'), VOORBEELD = path.join(R, 'test/voorbeelden/xps_diensten.csv');

var fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function twee(n) { return ('0' + n).slice(-2); }
var nu = new Date(), vandaag = nu.getFullYear() + '-' + twee(nu.getMonth() + 1) + '-' + twee(nu.getDate());

/* ---- het orakel ---- */
function maandagMaand(d) { var t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 7); }
function sjVanMaand(m) { var j = +m.slice(0, 4); return +m.slice(5, 7) >= 8 ? j + '-' + (j + 1) : (j - 1) + '-' + j; }
function maandenVan(sj) { var j = +sj.slice(0, 4), u = []; for (var i = 0; i < 12; i++) { var m = 7 + i; u.push((j + Math.floor(m / 12)) + '-' + twee(m % 12 + 1)); } return u; }
// herstel r1 (K8): talenten = [{ xps, email, naam }]; een dienst koppelt op accountnummer, dan e-mail, dan een naam (als het talent geen ander accountnummer heeft)
function koppelt(talenten, acct, email, naam) {
  acct = String(acct || '').trim().toLowerCase(); email = String(email || '').trim().toLowerCase(); naam = String(naam || '').trim().toLowerCase();
  if (acct && talenten.some(function (t) { return t.xps && t.xps.toLowerCase() === acct; })) return true;
  if (email && talenten.some(function (t) { return t.email && t.email.toLowerCase() === email; })) return true;
  var n = talenten.filter(function (t) { return t.naam.toLowerCase() === naam; });
  return n.length === 1 && !(acct && n[0].xps && n[0].xps.toLowerCase() !== acct);
}
function orakel(tekst, keuze, talenten) {
  var regels = tekst.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean), kop = regels[0].split(';');
  var iD = kop.indexOf('Datum'), iU = kop.indexOf('Gewerkte tijd'), iS = kop.indexOf('Status'), iN = kop.indexOf('Uitgevoerd door'), iA = kop.indexOf('Accountnummer'), iE = kop.indexOf('E-mail');
  var per = {}, van = '', tot = '', zonderTalent = false;
  regels.slice(1).forEach(function (l) {
    var c = l.split(';'), d = c[iD]; if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > vandaag) return;
    var m = maandagMaand(d); if (!van || m < van) van = m; if (!tot || m > tot) tot = m;
    var u = Number(String(c[iU]).replace(',', '.'));
    if (/afwezig|ziek|geannuleerd|reserve|no-show|no show|niet verschenen|laat/.test(String(c[iS]).toLowerCase())) return;
    if (talenten && !koppelt(talenten, c[iA], c[iE], c[iN])) { zonderTalent = true; return; }
    if (!(u > 0)) return;
    per[m] = (per[m] || 0) + u;
  });
  var uit = {}, sjs = {};
  Object.keys(per).concat([van, tot]).forEach(function (m) { if (m) sjs[sjVanMaand(m)] = true; });
  Object.keys(sjs).sort().forEach(function (sj) {
    if (keuze && keuze.indexOf(sj) < 0) return;
    if (!(sj.slice(5, 9) + '-07-31' < vandaag)) return;
    var x = {}, iets = false; maandenVan(sj).forEach(function (m) { if (m >= van && m <= tot) { x[m] = Math.round((per[m] || 0) * 100) / 100; if (x[m] > 0) iets = true; } });
    if (iets || keuze) uit[sj] = x;
  });
  return { waarde: uit, van: van, tot: tot, zonderTalent: zonderTalent };
}
// een kopie met elke datum n dagen eerder (de weekdag blijft gelijk als n een veelvoud van 7 is)
function verschuif(tekst, n) { return tekst.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, function (x, j, m, d) { var t = new Date(Date.UTC(+j, +m - 1, +d)); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); }); }

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'athena-urenbasislijn-')), uitvoer = [];
// herstel r1 (K8): verzonnen exports met talenten. Voor het voorbeeld: Eva op accountnummer, Tim op e-mail, Nina op naam (haar dienst zonder accountnummer en
// e-mail); Ali, Jasmijn, Ruben en Sanne hebben geen talent (hun diensten tellen niet, zoals in M09)
var TAL_VB = [{ xps: 'X5001', email: '', naam: 'Eva de Wit' }, { xps: '', email: 'tim.verhoeven@mail.example', naam: 'Tim Verhoeven' }, { xps: '', email: '', naam: 'Nina Jacobs' }];
function exportMet(naam, talenten, instellingen) {
  var p = path.join(TMP, naam);
  fs.writeFileSync(p, JSON.stringify({ tabellen: { Kansen: [], Instellingen: instellingen || [], Talenten: talenten.map(function (t, i) { var d = t.naam.split(' '); return { id: 'tv' + i, xpsId: t.xps, email: t.email, voornaam: d[0], achternaam: d.slice(1).join(' '), status: 'actief' }; }) }, eigenschappen: {} }));
  return p;
}
var EXPORT_VB = exportMet('export-talenten.json', TAL_VB);
function draai(args, cwd) {
  var p = cp.spawnSync(process.execPath, [SCRIPT].concat(args), { encoding: 'utf8', cwd: cwd || TMP });
  uitvoer.push(p.stdout, p.stderr);
  var err = p.stderr.split('\n').filter(Boolean), json = null;
  try { json = JSON.parse(p.stdout); } catch (e) { json = null; }
  return { code: p.status, stdout: p.stdout, json: json, fout: err.filter(function (l) { return !/^(urenbasislijn|melding): /.test(l); }), melding: err.filter(function (l) { return /^(urenbasislijn|melding): /.test(l); }) };
}
function gelijk(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* ---- 1. het verzonnen voorbeeld zelf (alleen met --voorbeeld) ---- */
var vbTekst = fs.readFileSync(VOORBEELD, 'utf8'), vbOrakel = orakel(vbTekst, null, TAL_VB);
var runV = draai(['--xps', VOORBEELD, '--voorbeeld', '--export', EXPORT_VB]);
if (Object.keys(vbOrakel.waarde).length) eis(runV.code === 0 && gelijk(runV.json, vbOrakel.waarde), 'het voorbeeld met --voorbeeld: de basislijn van het voorbije schooljaar zoals het orakel (' + runV.stdout.trim().slice(0, 80) + ')');
else eis(runV.code === 1 && !runV.stdout && runV.fout.join() === 'xps: geen gewerkte diensten in een voorbij schooljaar (de export loopt van ' + vbOrakel.van + ' tot ' + vbOrakel.tot + ').',
  'het voorbeeld met --voorbeeld: het schooljaar van het voorbeeld is nog niet voorbij, dus geen basislijn en exitcode 1 (' + runV.fout.join(' | ') + ')');
var runVr = draai(['--xps', VOORBEELD, '--export', EXPORT_VB]);
eis(runVr.code === 1 && runVr.fout.join() === 'xps: Zet echte bestanden buiten de repo.', 'zonder --voorbeeld wordt het voorbeeld in de repo geweigerd');
var runVa = draai(['--xps', path.join(R, 'test/voorbeelden/facturen_export.csv'), '--voorbeeld', '--export', EXPORT_VB]);
eis(runVa.code === 1 && runVa.fout.join() === 'xps: --voorbeeld staat alleen het verzonnen voorbeeld test/voorbeelden/xps_diensten.csv toe.', '--voorbeeld staat geen ander bestand in de repo toe');
var runVrel = draai(['--xps', 'test/voorbeelden/xps_diensten.csv', '--voorbeeld', '--export', EXPORT_VB], R);
eis(runVrel.code === runV.code && runVrel.stdout === runV.stdout, '--voorbeeld met een relatief pad vanuit de repo werkt hetzelfde');

/* ---- 2. een kopie 104 weken terug: een voorbij schooljaar ---- */
var VERSCHOVEN = path.join(TMP, 'diensten_verschoven.csv'), vsTekst = verschuif(vbTekst, 728), vsOrakel = orakel(vsTekst, null, TAL_VB), vsAlle = orakel(vsTekst);
fs.writeFileSync(VERSCHOVEN, vsTekst);
var sjVs = Object.keys(vsOrakel.waarde)[0];
eis(Object.keys(vsOrakel.waarde).length === 1 && Object.keys(vsOrakel.waarde[sjVs]).length >= 2, 'de verschoven kopie heeft één voorbij schooljaar met meer dan één maand (' + sjVs + ')');
var runS = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB]);
eis(runS.code === 0 && gelijk(runS.json, vsOrakel.waarde), 'de verschoven kopie: de uren per maand zoals het orakel, ook de dienst zonder accountnummer en e-mail (op naam), zonder ziek, geannuleerd, afwezig, reserve en 0 uur (' + JSON.stringify(runS.json) + ')');
var somVan = function (w) { var t = 0; Object.keys(w).forEach(function (s0) { Object.keys(w[s0]).forEach(function (m) { t += w[s0][m]; }); }); return Math.round(t * 100) / 100; };
eis(vsOrakel.zonderTalent && somVan(vsOrakel.waarde) < somVan(vsAlle.waarde) && runS.melding.indexOf('melding: niet elke gewerkte dienst koppelt aan een talent in Athena; die tellen niet mee, net als in M09 (de urenimport). Beheer → XPS-uren importeren noemt welke.') >= 0,
  'herstel r1 (K8, R794-5): een gewerkte dienst zonder talent in de export telt niet (dezelfde populatie als M09: minder dan het totaal van de export), met een melding zonder aantal');
var maanden = Object.keys(runS.json[sjVs]);
eis(maanden[0] === vsOrakel.van && maanden[maanden.length - 1] === vsOrakel.tot && maanden.length < 12, 'alleen de maanden binnen de looptijd van de export; daarbuiten geen 0 (geen basis)');
eis(runS.melding.length === 3 && runS.melding[0] === 'urenbasislijn: de export loopt van ' + vsOrakel.van + ' tot ' + vsOrakel.tot + '; ' + sjVs + ' (' + maanden.length + ' maanden).' && /^melding: .*looptijd/.test(runS.melding[1]),
  'stderr: de looptijd, het schooljaar met het aantal maanden, een melding over de maanden buiten de looptijd en een over diensten zonder talent (' + runS.melding.join(' | ') + ')');
// herstel r1 (K8): zonder --export of zonder talenten geen basislijn (exitcode 1)
var runZe = draai(['--xps', VERSCHOVEN]);
eis(runZe.code === 1 && !runZe.stdout && runZe.fout.join() === 'export: geef de export van server/migratie.js --bewaar; M09 telt alleen diensten die aan een talent in Athena koppelen, en de basislijn dus ook.', 'herstel r1 (K8): zonder --export geen basislijn (' + runZe.fout.join(' | ') + ')');
var runZt = draai(['--xps', VERSCHOVEN, '--export', exportMet('export-zonder-talenten.json', [])]);
eis(runZt.code === 1 && runZt.fout.join() === 'export: geen talenten (tabblad Talenten); zonder talenten koppelt geen dienst, net als in M09.', 'herstel r1 (K8): een export zonder talenten geeft een fout, geen basislijn van 0 (' + runZt.fout.join(' | ') + ')');

// de vorm regels: schooljaar;maand;uren, dezelfde waarden
var runRg = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--vorm', 'regels']), terug = {};
runRg.stdout.split('\n').filter(Boolean).slice(1).forEach(function (l) { var c = l.split(';'); (terug[c[0]] = terug[c[0]] || {})[c[1]] = Number(c[2].replace(',', '.')); });
eis(runRg.code === 0 && runRg.stdout.split('\n')[0] === 'schooljaar;maand;uren' && gelijk(terug, vsOrakel.waarde), '--vorm regels: schooljaar;maand;uren met dezelfde waarden');

// --uit: alleen naar dat bestand, niets op stdout; binnen de repo geweigerd
var UIT = path.join(TMP, 'basislijn.json'), runU = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--uit', UIT]);
eis(runU.code === 0 && runU.stdout === '' && fs.existsSync(UIT) && gelijk(JSON.parse(fs.readFileSync(UIT, 'utf8')), vsOrakel.waarde), '--uit schrijft de basislijn naar het bestand en niets naar stdout');
var inRepo = path.join(R, 'test', 'urenbasislijn-test-uitvoer.json'), runUr = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--uit', inRepo]);
eis(runUr.code === 1 && runUr.fout.join() === 'uit: schrijf buiten de repo.' && !fs.existsSync(inRepo), '--uit binnen de repo wordt geweigerd en er komt geen bestand');
var koppeling = path.join(TMP, 'naar-repo'), koppelingOk = true;
try { fs.symlinkSync(path.join(R, 'test'), koppeling); } catch (e) { koppelingOk = false; }
if (koppelingOk) {
  var viaKoppeling = path.join(koppeling, 'urenbasislijn-test-uitvoer.json'), runUk = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--uit', viaKoppeling]);
  eis(runUk.code === 1 && runUk.fout.join() === 'uit: schrijf buiten de repo.' && !fs.existsSync(inRepo), '--uit in een map die via een symbolische koppeling in de repo ligt wordt ook geweigerd');
}
var runUx = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--uit', VERSCHOVEN]);
eis(runUx.code === 1 && runUx.fout.join() === 'uit: niet hetzelfde bestand als een invoerbestand.' && fs.readFileSync(VERSCHOVEN, 'utf8') === vsTekst, '--uit mag de dienstenexport niet overschrijven');

// --schooljaren
var runSj = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--schooljaren', sjVs]);
eis(runSj.code === 0 && gelijk(runSj.json, vsOrakel.waarde), '--schooljaren met het voorbije schooljaar geeft dezelfde basislijn');
var huidig = sjVanMaand(vandaag.slice(0, 7)), runSjh = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--schooljaren', huidig]);
eis(runSjh.code === 1 && runSjh.fout.join() === 'schooljaren: ' + huidig + ' is nog niet voorbij.', '--schooljaren met het lopende schooljaar wordt geweigerd (een halve basislijn)');
var runSjb = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--schooljaren', '2010-2011']);
eis(runSjb.code === 1 && runSjb.fout.join() === 'schooljaren: 2010-2011 valt buiten de export (die loopt van ' + vsOrakel.van + ' tot ' + vsOrakel.tot + ').', '--schooljaren buiten de looptijd van de export wordt geweigerd');
var runSjf = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--schooljaren', '2024/2025']);
eis(runSjf.code === 1 && runSjf.fout.join() === 'schooljaren: gebruik jjjj-jjjj, gescheiden door komma\'s.', '--schooljaren in een andere vorm wordt geweigerd');

// --export: de instellingen van productie (hier een verzonnen xpsStatussen die ook "Ingeroosterd" negeert); de rest van de export doet niet mee
var EXPORT = exportMet('export-instellingen.json', TAL_VB, [{ sleutel: 'xpsStatussen', waarde: JSON.stringify({ negeren: ['afwezig', 'ziek', 'geannuleerd', 'reserve', 'ingeroosterd'] }) }]);
var runX = draai(['--xps', VERSCHOVEN, '--export', EXPORT]);
eis(runX.code === 1 && runX.fout.join() === 'xps: geen gewerkte diensten in een voorbij schooljaar (de export loopt van ' + vsOrakel.van + ' tot ' + vsOrakel.tot + ').',
  '--export: de instelling xpsStatussen van de export telt (alle diensten in het voorbeeld zijn "Ingeroosterd", dus niets gewerkt) (' + runX.fout.join(' | ') + ')');

/* ---- 3. een grotere verzonnen export over drie voorbije schooljaren ---- */
// van de eerste maandag in augustus tot de laatste zondag in juli: een dienst op dinsdag 1 augustus hoort (maand van de maandag, zoals M09) bij juli ervoor
var kop = vbTekst.split(/\r?\n/)[0], rijen = [kop], eersteJaar = +sjVanMaand(vandaag.slice(0, 7)).slice(0, 4) - 3, start = Date.UTC(eersteJaar, 7, 1), eind = Date.UTC(eersteJaar + 3, 6, 31);
while (new Date(start).getUTCDay() !== 1) start += 864e5;
while (new Date(eind).getUTCDay() !== 0) eind -= 864e5;
var dagen = Math.round((eind - start) / 864e5);
for (var i = 0; i < 30000; i++) {
  var d = new Date(start + (i % (dagen + 1)) * 864e5).toISOString().slice(0, 10);
  rijen.push([d, d + ' 08:30', '', String(((i % 7) + 1) / 2).replace('.', ','), 'Verzonnen ' + (i % 40), 'Dienst', ['Ingeroosterd', 'Uitgevoerd', 'Afwezig', 'Ingeroosterd', 'Geannuleerd', 'Ingeroosterd', 'Reserve'][i % 7], 'Project ' + (i % 9), '', '', '', i % 11 ? 'X' + (7000 + i % 40) : '', '', String(20 + i % 9)].join(';'));
}
var GROOT = path.join(TMP, 'diensten_groot.csv'), grTekst = rijen.join('\n') + '\n';
// herstel r1 (K8): de helft van de veertig verzonnen mensen heeft een talent (accountnummer en naam); een dienst zonder accountnummer koppelt op naam
var TAL_GR = []; for (var k = 0; k < 20; k++) TAL_GR.push({ xps: 'X' + (7000 + k), email: '', naam: 'Verzonnen ' + k });
var EXPORT_GR = exportMet('export-groot.json', TAL_GR), grOrakel = orakel(grTekst, null, TAL_GR);
fs.writeFileSync(GROOT, grTekst);
var t0 = Date.now(), runG = draai(['--xps', GROOT, '--export', EXPORT_GR]), duur = Date.now() - t0;
eis(runG.code === 0 && Object.keys(grOrakel.waarde).length === 3 && gelijk(runG.json, grOrakel.waarde), 'een verzonnen export van drie voorbije schooljaren: elke maand zoals het orakel (' + Object.keys(runG.json || {}).join(', ') + ')');
eis(duur < 30000, 'de grotere export in minder dan 30 s (' + duur + ' ms)');

/* ---- 4. invoerfouten ---- */
var LEEG = path.join(TMP, 'leeg.csv'); fs.writeFileSync(LEEG, '');
var runL = draai(['--xps', LEEG, '--export', EXPORT_VB]);
eis(runL.code === 1 && runL.fout.join() === 'xps: het bestand is leeg.', 'een leeg bestand geeft een korte fout');
var ZONDER = path.join(TMP, 'zonder_uren.csv'); fs.writeFileSync(ZONDER, 'Datum;Omschrijving\n2020-10-05;Dienst\n');
var runZ = draai(['--xps', ZONDER, '--export', EXPORT_VB]);
eis(runZ.code === 1 && /^xps(, regel 1)?: /.test(runZ.fout.join()) && runZ.fout.length === 1, 'een export zonder kolom met uren of status geeft een Nederlandse fout (' + runZ.fout.join(' | ') + ')');
var runA = draai(['--xps', VERSCHOVEN, '--export', EXPORT_VB, '--vorm', 'csv']);
eis(runA.code === 1 && runA.fout.join() === 'vorm: kies json of regels.', 'een onbekende vorm wordt geweigerd');
var runE = draai(['--xps', VERSCHOVEN, '--export', path.join(R, 'package.json')]);
eis(runE.code === 1 && runE.fout.join() === 'export: Zet echte bestanden buiten de repo.', 'een export binnen de repo wordt geweigerd');

/* ---- 5. geen namen of uren op stderr; de uitvoer bevat geen namen ---- */
var namen = []; vbTekst.split(/\r?\n/).slice(1).forEach(function (l) { var c = l.split(';'); if (c[4]) namen.push(c[4]); if (c[8]) namen.push(c[8]); if (c[12]) namen.push(c[12]); });
var alles = uitvoer.join('\n'), gevonden = namen.filter(function (n) { return alles.indexOf(n) >= 0; });
eis(!gevonden.length, 'geen naam of e-mailadres uit de export in de uitvoer' + (gevonden.length ? ' (' + gevonden.slice(0, 2).join(', ') + ')' : ''));
var stderrRegels = [runS, runSj, runG, runRg].reduce(function (s, r) { return s.concat(r.melding); }, []);
eis(stderrRegels.every(function (l) { return !/\d+[,.]\d+|\b\d+ uur/.test(l.replace(/\d{4}-\d{4}|\d{4}-\d{2}/g, '')); }), 'op stderr alleen maanden, schooljaren en aantallen maanden, geen uren');

/* ---- 6. de waarde als aanname urenBasislijn: M09 is dan niet meer geblokkeerd ---- */
var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8'), ctx, { filename: 'demo.js' });
ctx.demoStart('');
var dVandaag = vm.runInContext('datumStr(new Date())', ctx), voor = ctx.sturingCijfers(dVandaag), m09 = function (S) { var c = null; S.blokken.forEach(function (b) { b.cijfers.forEach(function (x) { if (x.id === 'urenVorigeJaren') c = x; }); }); return c; };
var opslaan = JSON.parse(ctx.demoRun('apiAannameOpslaan', JSON.stringify(['urenBasislijn', { waarde: runS.json, onderbouwing: 'verzonnen test (urenbasislijn.js)', besluitdatum: dVandaag }]), 'demo-sophie'));
var na = m09(ctx.sturingCijfers(dVandaag));
eis(!!m09(voor).geblokkeerd && opslaan.ok && !na.geblokkeerd && na.extra && na.extra.basislijn && Object.prototype.hasOwnProperty.call(na.extra.basislijn, sjVs),
  'de uitvoer past als aanname urenBasislijn (apiAannameOpslaan): M09 is daarna niet meer geblokkeerd en kent het schooljaar ' + sjVs);

/* ---- 7. opruimen ---- */
fs.rmSync(TMP, { recursive: true, force: true });
eis(!fs.existsSync(TMP) && !fs.existsSync(inRepo), 'de tijdelijke map is weg en er staat niets nieuws in de repo');

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exitCode = fouten ? 1 : 0;
