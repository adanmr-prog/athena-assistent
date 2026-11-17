/* Athena Assistent — v7.9.4 (bouwpunt 10, docs/sturing-v7.9.md §3c): de urenbasislijn uit de XPS-dienstenexport. Alleen lokaal.
 * Telt uit een XPS-dienstenexport de gewerkte uren per maand van voorbije schooljaren, met dezelfde regels als urenUitRijen in Code.gs (alleen gewerkte
 * diensten: een datum t/m vandaag, status niet afwezig/ziek/geannuleerd/reserve of wat de instelling xpsStatussen zegt, geen no-show of late afmelding,
 * uren > 0), en zet de waarde klaar in de vorm van de aanname urenBasislijn ({ "jjjj-jjjj": { "jjjj-mm": uren } }), gecontroleerd met aannameWaardeIn
 * uit Code.gs. v7.9.4 herstel r1 (K8, R794-5): alleen diensten die aan een talent in Athena koppelen (accountnummer, e-mail of een unieke naam, precies zoals
 * urenUitRijen en dus de urenimport): M09 telt voor het lopende schooljaar alleen TalentUren, en daar komt een dienst zonder talent nooit in. Zo hebben teller en
 * basislijn dezelfde populatie (de talenten in de export); de basislijn is dus niet het totaal van de export. Een dienst zonder project telt wel (TalentUren ook).
 * De maand van een dienst is de maand van de maandag van zijn week, net als M09 (urenPerMaand) voor het lopende schooljaar. Gebruik:
 *
 *   node test/urenbasislijn.js --xps <dienstenexport.csv> --export <export.json> [--schooljaren 2023-2024,2024-2025] [--vorm json|regels] [--uit <pad>]
 *
 * --xps          de dienstenexport van XPS (csv, ; of ,), met de diensten van de vorige schooljaren
 * --export       de export van server/migratie.js --bewaar: de talenten om aan te koppelen (Talenten) en de instellingen xpsKolommen en xpsStatussen van productie.
 *                Verplicht (herstel r1): zonder talenten is er geen basislijn die bij M09 past
 * --schooljaren  optioneel: de schooljaren, gescheiden door komma's; standaard elk voorbij schooljaar met gewerkte diensten in de export (hoogstens 10)
 * --vorm         json (standaard: de waarde voor Beheer → Aannames → urenBasislijn) of regels (schooljaar;maand;uren, zoals de lijst in dat venster)
 * --uit          optioneel: schrijf de uitvoer naar dit bestand in plaats van naar stdout
 * --voorbeeld    alleen voor de test: staat het verzonnen voorbeeld test/voorbeelden/xps_diensten.csv toe als --xps (geen ander bestand in de repo)
 *
 * Elk invoerbestand en --uit moeten buiten de repo staan; een pad binnen de repo wordt geweigerd (echte gegevens komen nooit in de repo). Het script schrijft
 * alleen naar --uit (of stdout), nooit in de repo.
 * Een maand buiten de looptijd van de export (van de eerste tot de laatste maand met een dienst t/m vandaag, welke status ook) staat er niet in: zonder basis
 * geen 0. Een export die midden in een maand begint of eindigt, telt die maand maar voor een deel: exporteer hele schooljaren. Een schooljaar dat nog niet
 * voorbij is (31 juli), wordt geweigerd: een halve basislijn vergelijkt verkeerd.
 * Op stderr alleen de looptijd van de export, de schooljaren en het aantal maanden per schooljaar, en zonder aantal of er gewerkte diensten niet aan een talent
 * koppelen (die tellen niet, net als in M09); nooit namen of uren.
 * Exitcode 0 bij een basislijn, 1 bij een invoerfout (ook: geen voorbij schooljaar met gewerkte diensten), 2 bij een onverwachte fout in het script. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), H = require('./vergelijk_sturing.js');
var REPO = path.resolve(__dirname, '..'), VOORBEELD = path.join(REPO, 'test', 'voorbeelden', 'xps_diensten.csv'), fout = H.fout;
var MAX_SCHOOLJAREN = 10;  // aannameWaardeIn neemt er hoogstens tien
var GEBRUIK = 'Gebruik: node test/urenbasislijn.js --xps <dienstenexport.csv> --export <export.json> [--schooljaren 2023-2024,2024-2025] [--vorm json|regels] [--uit <pad buiten de repo>]';
var ZONDER_TALENT = 'melding: niet elke gewerkte dienst koppelt aan een talent in Athena; die tellen niet mee, net als in M09 (de urenimport). Beheer → XPS-uren importeren noemt welke.';

/* ----- invoer en uitvoer ----- */

function argumenten(argv) {
  var opt = H.argumentenUit(argv, ['xps', 'export', 'schooljaren', 'vorm', 'uit', 'voorbeeld'], ['voorbeeld']);
  if (!opt.xps) throw fout(GEBRUIK);
  if (!opt.export) throw fout('export: geef de export van server/migratie.js --bewaar; M09 telt alleen diensten die aan een talent in Athena koppelen, en de basislijn dus ook.');  // herstel r1 (K8)
  if (opt.vorm !== undefined && opt.vorm !== 'json' && opt.vorm !== 'regels') throw fout('vorm: kies json of regels.');
  return opt;
}
function zelfdePad(a, b) { var x = H.echtPad(a), y = H.echtPad(b); if (H.HOOFDLETTERS_ZIJN_GELIJK) { x = x.toLowerCase(); y = y.toLowerCase(); } return x === y; }
// Met --voorbeeld alleen het verzonnen voorbeeld in de repo (voor de test); anders weigert leesBestand elk pad binnen de repo
function leesXpsTekst(opt) {
  if (!opt.voorbeeld) return H.leesBestand('xps', opt.xps);
  if (opt.xps === true) throw fout('xps: geef het pad op.');
  if (!zelfdePad(String(opt.xps), VOORBEELD)) throw fout('xps: --voorbeeld staat alleen het verzonnen voorbeeld test/voorbeelden/xps_diensten.csv toe.');
  return fs.readFileSync(VOORBEELD, 'utf8').replace(/^﻿/, '');
}
// --uit: een gewoon bestand buiten de repo (ook niet via een symbolische koppeling of een map die naar de repo wijst), niet een van de invoerbestanden
function uitPad(opt) {
  if (opt.uit === undefined) return '';
  if (opt.uit === true) throw fout('uit: geef het pad op.');
  var abs = path.resolve(String(opt.uit)), st = null;
  try { st = fs.lstatSync(abs); } catch (e) { st = null; }
  if (st && st.isSymbolicLink()) throw fout('uit: geef een gewoon bestand, geen symbolische koppeling.');
  if (st && st.isDirectory()) throw fout('uit: dit is een map; geef een bestand.');
  if (H.binnenRepo(st ? abs : path.dirname(abs))) throw fout('uit: schrijf buiten de repo.');
  if (st && [opt.xps, opt.export].some(function (p) { return p && p !== true && zelfdePad(String(p), abs); })) throw fout('uit: niet hetzelfde bestand als een invoerbestand.');
  return abs;
}

/* ----- de basislijn ----- */

// De eerste en de laatste maand (van de maandag van de week) met een dienst met een datum of week t/m vandaag, welke status ook: de maanden die de export dekt.
// De datum en de week lezen zoals urenUitRijen (exportDag, anders weekUit op de weekkolom).
function looptijd(ctx, rijen, vandaag) {
  var kop = Array.prototype.slice.call(rijen[0] || []).map(function (h) { return String(h == null ? '' : h).trim(); }), c = ctx.xpsKolomIndexen(kop, ctx.xpsKolommen());
  var dezeWeek = ctx.isoWeekStr(ctx.parseDatum(vandaag)), van = '', tot = '', perWeek = {};
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i] || [], ruw = c.datum >= 0 && r[c.datum] != null ? r[c.datum] : '', dag = ruw !== '' ? ctx.exportDag(ruw) : '', week;
    if (dag) { if (dag > vandaag) continue; week = ctx.isoWeekStr(ctx.parseDatum(dag)); }
    else { week = ctx.weekUit(c.week >= 0 && r[c.week] != null ? r[c.week] : '', '', vandaag); if (!week || week > dezeWeek) continue; }
    var m = perWeek[week] || (perWeek[week] = ctx.maandVan(ctx.maandagVanWeek(week)));
    if (!van || m < van) van = m;
    if (!tot || m > tot) tot = m;
  }
  return van ? { van: van, tot: tot } : null;
}
// De gewerkte uren van maand m (jjjj-mm): urenUitRijen met de talenten van de export (herstel r1, K8: dezelfde koppeling en populatie als de urenimport en M09),
// t/m de zondag van de laatste week die in m begint. Geeft { uren, zonderTalent } (zonderTalent: of er een gewerkte dienst niet koppelde; nooit het aantal naar buiten)
function urenInMaand(ctx, rijen, talenten, m, vandaag, statussen) {
  var u = ctx.urenUitRijen(rijen, talenten, { vandaag: H.maandTot(ctx, m, vandaag), statussen: statussen }), som = 0;
  u.regels.forEach(function (g) { if (ctx.maandVan(ctx.maandagVanWeek(g.week)) === m) som += Number(g.uren) || 0; });
  return { uren: Math.round(som * 100) / 100, zonderTalent: u.overgeslagen.geenTalent > 0 || u.overgeslagen.dubbeleNaam > 0 };
}
function voorbij(sj, vandaag) { return sj.slice(5, 9) + '-07-31' < vandaag; }
function schooljarenIn(tekst) {
  var l = String(tekst).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!l.length || l.some(function (s) { var m = /^(\d{4})-(\d{4})$/.exec(s); return !m || +m[2] !== +m[1] + 1; })) throw fout('schooljaren: gebruik jjjj-jjjj, gescheiden door komma\'s.');
  return l.filter(function (s, i) { return l.indexOf(s) === i; }).sort();
}
// Geeft { waarde, looptijd, schooljaren: [{ schooljaar, maanden, buiten }] }
function basislijn(ctx, tekst, opt, vandaag) {
  var rijen = H.leesXps(ctx, tekst), lt = looptijd(ctx, rijen, vandaag);
  if (!lt) throw fout('xps: geen dienst met een datum tot en met vandaag.');
  var inLt = function (m) { return m >= lt.van && m <= lt.tot; }, kandidaten = [];
  for (var j = +lt.van.slice(0, 4) - 1; j <= +lt.tot.slice(0, 4); j++) { var s = j + '-' + (j + 1); if (ctx.schooljaarMaanden(s).some(inLt)) kandidaten.push(s); }
  var keuze;
  if (opt.schooljaren !== undefined) {
    if (opt.schooljaren === true) throw fout('schooljaren: geef de schooljaren op.');
    keuze = schooljarenIn(opt.schooljaren);
    keuze.forEach(function (s) {
      if (!voorbij(s, vandaag)) throw fout('schooljaren: ' + s + ' is nog niet voorbij.');
      if (kandidaten.indexOf(s) < 0) throw fout('schooljaren: ' + s + ' valt buiten de export (die loopt van ' + lt.van + ' tot ' + lt.tot + ').');
    });
  } else keuze = kandidaten.filter(function (s) { return voorbij(s, vandaag); });
  if (keuze.length > MAX_SCHOOLJAREN) throw fout('schooljaren: hoogstens ' + MAX_SCHOOLJAREN + '; kies ze met --schooljaren.');
  var talenten = ctx.lees('Talenten'), statussen = ctx.xpsStatussen(), w = {}, uit = { looptijd: lt, schooljaren: [], zonderTalent: false };
  if (!talenten.length) throw fout('export: geen talenten (tabblad Talenten); zonder talenten koppelt geen dienst, net als in M09.');  // herstel r1 (K8)
  keuze.forEach(function (s) {
    var ms = ctx.schooljaarMaanden(s), per = {}, iets = false;
    ms.filter(inLt).forEach(function (m) {
      var x;
      try { x = urenInMaand(ctx, rijen, talenten, m, vandaag, statussen); } catch (e) { throw fout('xps, regel 1: ' + (e && e.xpsExport ? e.message : 'de export is niet te lezen.')); }
      per[m] = x.uren; if (x.zonderTalent) uit.zonderTalent = true;
      if (per[m] > 0) iets = true;
    });
    if (!iets && opt.schooljaren === undefined) return;  // standaard alleen schooljaren met gewerkte diensten
    w[s] = per; uit.schooljaren.push({ schooljaar: s, maanden: Object.keys(per).length, buiten: ms.length - Object.keys(per).length });
  });
  if (!uit.schooljaren.length) throw fout('xps: geen gewerkte diensten in een voorbij schooljaar (de export loopt van ' + lt.van + ' tot ' + lt.tot + ').');
  uit.waarde = ctx.aannameWaardeIn('urenBasislijn', ctx.uitMap(ctx.AANNAMES, 'urenBasislijn'), w);  // dezelfde controle als Beheer → Aannames
  return uit;
}
function uitvoerTekst(waarde, vorm) {
  if (vorm !== 'regels') return JSON.stringify(waarde, null, 2) + '\n';
  var regels = ['schooljaar;maand;uren'];
  Object.keys(waarde).sort().forEach(function (s) { Object.keys(waarde[s]).sort().forEach(function (m) { regels.push(s + ';' + m + ';' + String(waarde[s][m]).replace('.', ',')); }); });
  return regels.join('\n') + '\n';
}
// Geeft { tekst, uit (pad of ''), meldingen, fouten, exit }
function maak(opt) {
  var uit = uitPad(opt), xpsTekst = leesXpsTekst(opt), exportTekst = opt.export ? H.leesBestand('export', opt.export) : null;
  var ctx = H.laadContext('');
  H.startMetExport(ctx, exportTekst);  // herstel r1 (K8): de export is verplicht (talenten); nooit de demoseed
  ctx.GEBRUIKER = null;
  var vandaag = vm.runInContext('datumStr(new Date())', ctx), b = basislijn(ctx, xpsTekst, opt, vandaag);
  var meldingen = ['urenbasislijn: de export loopt van ' + b.looptijd.van + ' tot ' + b.looptijd.tot + '; ' + b.schooljaren.map(function (x) { return x.schooljaar + ' (' + x.maanden + ' maanden)'; }).join(', ') + '.'];
  b.schooljaren.forEach(function (x) { if (x.buiten) meldingen.push('melding: ' + x.schooljaar + ': de maanden buiten de looptijd van de export staan er niet in (geen basis, geen 0).'); });
  if (b.zonderTalent) meldingen.push(ZONDER_TALENT);  // herstel r1 (K8): zonder aantal
  return { tekst: uitvoerTekst(b.waarde, opt.vorm), uit: uit, meldingen: meldingen, fouten: [], exit: 0 };
}
function main() {
  var u;
  try { u = maak(argumenten(process.argv.slice(2))); if (u.uit) fs.writeFileSync(u.uit, u.tekst); }
  catch (e) { u = e instanceof H.Invoerfout ? { tekst: '', uit: '', meldingen: [], fouten: [e.message], exit: 1 } : { tekst: '', uit: '', meldingen: [], fouten: [H.onverwacht(e, 'het script')], exit: 2 }; }
  if (u.tekst && !u.uit) process.stdout.write(u.tekst);
  u.fouten.concat(u.meldingen).forEach(function (l) { process.stderr.write(l + '\n'); });
  process.exitCode = u.exit;
}
module.exports = { maak: maak, basislijn: basislijn, looptijd: looptijd };
if (require.main === module) main();
