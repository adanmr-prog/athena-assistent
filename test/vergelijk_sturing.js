/* Athena Assistent — v7.9 (bouwpunt 12, docs/sturing-v7.9.md): het vergelijkingsharnas voor de sturingscijfers. Alleen lokaal.
 * Legt de cijfers van Athena naast een referentie (het laatste week- of maandrapport, een spreadsheet, de scripts van de vorige sessie)
 * en verklaart elk verschil. Gebruik:
 *
 *   node test/vergelijk_sturing.js --export <export-jjjj-mm-dd.json> --referentie <referentie.csv>
 *        [--exact-verkoop <verkoopboek.csv>] [--exact-open <export met Open of betaaldatum.csv> [--exact-open-stand jjjj-mm-dd]]
 *        [--exact <facturatie-export.csv>] [--xps <dienstenexport.csv>] [--peildatum jjjj-mm-dd] [--code <pad naar Code.gs>]
 *
 * --export        de export van server/migratie.js --bewaar ({ tabellen: { Tab: [rij], … }, eigenschappen }); de echte Athena-stand
 * --referentie    csv (; of ,) met de kolommen metriek, periode, waarde en optioneel uitsplitsing; regels die met # beginnen zijn commentaar
 *                 metriek = een M-code (M04) of een sleutel uit het register (gecontracteerd, contactmomenten)
 *                 periode = jjjj-mm-dd (stand op die dag), jjjj-mm (stand op de laatste dag van de maand), jjjj-Www (week) of jjjj-jjjj (schooljaar)
 *                 uitsplitsing = nieuw, bestaand, onbekend (M04, M06, M08, M09) of zonder (M04, M06, M08, M18, M19)
 * --exact-verkoop v7.9.4 (bouwpunt 15): het verkoopboek van Exact (alleen scholen), de bron voor M26 en M27; een kolom Open is niet nodig
 * --exact-open    v7.9.4 (bouwpunt 15): een Exact-export met de kolom Open of een betaaldatum, de bron voor M28; zonder die kolom een invoerfout
 * --exact-open-stand  harnasdekking (4): de dag van die export (Open is de stand op die dag), niet in de toekomst; alleen met --exact-open of --exact. Zonder
 *                 betaaldatum vergelijkt het harnas Open alleen op een peildatum gelijk aan die dag. Herstel r8 (R8-1a): die dag is ook de grens met een
 *                 betaaldatum (een termijn die erna verzonden of betaald is, staat niet in de export): een regel met een peildatum erna is "geblokkeerd (export
 *                 dekt de periode niet)", bij --exact ook voor M26 en M27, en de maand van die dag is de maand van de run in de dekking. Zonder
 *                 --exact-open-stand geldt de aanname dat de export met een betaaldatum van de run is (--peildatum, standaard vandaag)
 * --exact         het oude gedrag: één facturatie-export voor M26, M27 en M28. Heeft die geen kolom Open en geen betaaldatum (het verkoopboek), dan geeft
 *                 M28 "geblokkeerd (export zonder Open)" in plaats van elke factuur als open te tellen. Niet samen met --exact-verkoop of --exact-open.
 * --xps           de dienstenexport van XPS (M09, M25: categorie bron)
 * --peildatum     standaard vandaag; geen periode mag erna liggen
 * --code          een andere kopie van Code.gs (standaard backend/Code.gs)
 *
 * Elk invoerbestand moet buiten de repo staan; een pad binnen de repo wordt geweigerd (echte gegevens komen nooit in de repo).
 * Uitvoer: per referentieregel precies één regel "<metriek> <periode>[/<uitsplitsing>] <uitkomst>" met als uitkomst
 *   geslaagd                          binnen de tolerantie uit het register
 *   geblokkeerd (<soort>)             het cijfer is in Athena geblokkeerd; telt niet als onverklaard. v7.9.4: de soort komt uit de blokkade van Code.gs:
 *                                     besluit, extern, rollen, redenen of geen leden (een team zonder leden, bouwpunt 11: de weekcijfers, M23 en M35);
 *                                     een blokkade die in geen soort past, staat er zonder soort ("geblokkeerd")
 *   geblokkeerd (stand)               v7.9.4 herstel r1 (K7): "stand alleen voor vandaag" (bouwpunt 7): de fase van een kans op die peildatum is niet te
 *                                     reconstrueren (een wissel zonder werkelijke datum, zoals elke open Capsule-kans na stap 3). Niet vergeleken, dus niet
 *                                     geslaagd: exitcode 3 en een melding zonder aantal
 *   geblokkeerd (export zonder Open)  v7.9.4 (bouwpunt 15): M28 wijkt af en de Exact-export voor M28 heeft geen kolom Open en geen betaaldatum
 *   geblokkeerd (export zonder betaaldatum)  herstel r1 (K12): M28 wijkt af, de export heeft alleen de kolom Open en (harnasdekking) --exact-open-stand is
 *                                     niet de peildatum: voor een andere dag dan de exportdag telt alleen een betaaldatum
 *   geblokkeerd (stand van Open onbekend)  harnasdekking (4): idem zonder --exact-open-stand (Open zou anders als de stand van de peildatum tellen)
 *   geblokkeerd (export dekt de periode niet)  harnasdekking (3, 4): M26, M27 of M28 wijkt af en een maand met een termijn van Athena die meetelt (M26, M27:
 *                                     verzonden in het venster 1 augustus t/m de peildatum, vandaag t/m het eind van de maand; M28: verzonden vanaf 1 augustus
 *                                     en open op de peildatum) ligt niet tussen de maand van de eerste en die van de laatste factuurdatum van de export (een
 *                                     vorig boekjaar, een export die later begint): een maand buiten de export is geen afwijking. Een maand zonder termijn in
 *                                     Athena telt niet. Herstel r6 (R6-1): de maand van de peildatum is gedekt als de export t/m de maand ervoor loopt (Exact
 *                                     heeft nog geen factuur van deze maand); herstel r7 (R7-1): alleen als dat de maand van de peildatum van de run is
 *                                     (--peildatum, standaard vandaag; herstel r8, R8-1a: met --exact-open-stand die dag), een eerdere maand direct na het einde
 *                                     van de export dekt niet. M26 en M28 tellen aan de kant van Athena de facturen van dit schooljaar van elk bestaand project
 *                                     (r7, R7-D3: een termijn zonder project niet; Exact telt elke factuur), ook de oude definitie "alle open posten" (herstel
 *                                     r8, R8-1b): een termijn zonder project is dus gezakt (invoer) door contract 17, nooit gezakt (definitie). Een peildatum na
 *                                     --exact-open-stand dekt nooit (herstel r8, R8-1a). Herstel r10 (R10-1a): op de stand van vandaag rekenen M28 en de oude
 *                                     definitie met de datumregels van Code.gs (verzonden = open, ook na vandaag; elke betaaldatum = betaald); herstel r11
 *                                     (R11-1a): de export met Open dan ook, dus met een factuurdatum na vandaag (Open van de exportdag)
 *                                     De vier exportblokkades zijn niet vergeleken: exitcode 3, met een vaste melding
 *   leeg (geen basis)                 v7.9.4 (bouwpunt 13): Athena heeft voor dit cijfer geen waarde (geen basis of geen populatie); nooit een vergelijking met 0.
 *                                     Herstel r4 (R4-1): raakt invoer het cijfer (zie hieronder), dan is een lege waarde gezakt (invoer)
 *   gezakt (definitie)                de referentie klopt met een oude definitie die het harnas ook rekent
 *   gezakt (invoer)                   een datacontract dat het cijfer raakt is gezakt of leeg (niets te toetsen), of een overstapstap is niet gedaan:
 *                                     tijdlijn, redenen (ook "gekoppeld" zonder verloren kansen), fasen, de Capsule-stand of de accounts van het team
 *                                     (v7.9.4, bouwpunt 12). Herstel r3 (R3-D2): Athena mist dan de gegevens; zo'n regel is niet vergeleken en toont niets aan
 *                                     (een vaste "melding: …" op stderr, zonder aantal)
 *   gezakt (bron)                     de Exact- of XPS-export wijkt in dezelfde periode af van wat in de Athena-stand staat. v7.9.4 (bouwpunt 14): het
 *                                     XPS-totaal per maand telt ook diensten zonder gekoppeld talent of project (herstel r12, R12-1: voor M25 alleen
 *                                     diensten zonder project of op een project van het schooljaar). Bij M27 toetst bron het verkoopboek van alle bestaande
 *                                     projecten vanaf 1 augustus (het pad van M26), niet alleen de projecten van het schooljaar: een afwijking in de bron
 *                                     hoeft de afwijking van M27 dus niet te verklaren (herstel r12, nit R12-2)
 *   gezakt (onverklaard)              geen van drieën
 * Nooit waarden, namen, bedragen of tellingen. Een invoerfout noemt alleen het bestand, het regelnummer en de kolomnaam (op stderr).
 * v7.9.4 (bouwpunt 14): op stderr ook een "melding: …" als gewerkte diensten in de XPS-export niet aan een talent of project in Athena koppelen; zonder aantal.
 * Harnasdekking: ook een melding met de namen van de contracten (gezakt of leeg) en overstapstappen (open) die de regels gezakt (invoer) raken (5), een vaste
 * melding als een weekregel op de peildatum is afgekapt (maandag t/m de peildatum; 6) en als een standregel op een eerdere peildatum op fasewissels met zekerheid
 * laag rust (vanaf 1 augustus van dat schooljaar; een tijdlijnwissel heeft de invoerdag als werkelijke datum; 8). Geen blokkade, nooit een aantal.
 * Vergeleken (herstel r3, R3-D2) is alleen een regel die geslaagd, gezakt (definitie) of gezakt (bron) is: dan staat de waarde van Athena tegen de referentie of
 * de bron. Invoer, leeg en geblokkeerd zijn niet vergeleken.
 * Exitcode (v7.9.4, bouwpunt 13): 1 bij minstens één onverklaarde regel of een invoerfout; 2 bij een onverwachte fout in het harnas zelf; 3 als niets
 * onverklaard is maar minstens één regel "geblokkeerd (stand)" of een exportblokkade is (herstel r1, K7; harnasdekking), of als geen enkele regel vergeleken is (herstel r2, B-B7; herstel r3,
 * R3-D2: ook als de overige regels alleen invoer, leeg of geblokkeerd zijn), met een vaste melding zonder aantal: het harnas slaagt dan niet; anders 0, ook
 * met regels die geblokkeerd (een andere soort), leeg of gezakt (invoer) zijn naast minstens één vergeleken regel. Staat er een regel gezakt (invoer) bij,
 * dan zegt een vaste "melding: …" op stderr dat die regels niet vergeleken zijn. Een exitcriterium (U1, U2, U13) vraagt dus exitcode 0 én geen regel
 * gezakt (invoer) voor de cijfers van dat rapport. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var REPO = path.resolve(__dirname, '..');

/* ----- invoer en privacy ----- */

function Invoerfout(tekst) { this.name = 'Invoerfout'; this.message = tekst; }
function fout(tekst) { return new Invoerfout(tekst); }
function echtPad(p) { try { return fs.realpathSync(p); } catch (e) { return path.resolve(p); } }
var HOOFDLETTERS_ZIJN_GELIJK = process.platform === 'darwin' || process.platform === 'win32';  // macOS en Windows: hoofdletterongevoelig bestandssysteem
// Ligt dit pad (na het volgen van symbolische koppelingen) in de repo? Dan wordt het geweigerd.
function binnenRepo(p) {
  var a = echtPad(p), r = echtPad(REPO);
  if (HOOFDLETTERS_ZIJN_GELIJK) { a = a.toLowerCase(); r = r.toLowerCase(); }
  var rel = path.relative(r, a);
  return rel === '' || (!!rel && rel.split(path.sep)[0] !== '..' && !path.isAbsolute(rel));
}
function leesBestand(soort, p) {
  if (!p || p === true) throw fout(soort + ': geef het pad op.');
  if (binnenRepo(String(p))) throw fout(soort + ': Zet echte bestanden buiten de repo.');
  try { return fs.readFileSync(String(p), 'utf8').replace(/^﻿/, ''); } catch (e) { throw fout(soort + ': het bestand is niet te lezen.'); }
}
// v7.9.4: ook voor test/urenbasislijn.js (bekend = de opties, vlaggen = opties zonder waarde)
function argumentenUit(argv, bekend, vlaggen) {
  var opt = {};
  for (var i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') !== 0) throw fout('argumenten: onbekend argument op plaats ' + (i + 1) + '.');
    var k = argv[i].slice(2); if (bekend.indexOf(k) < 0) throw fout('argumenten: onbekende optie --' + k + '.');
    opt[k] = (vlaggen || []).indexOf(k) >= 0 ? true : argv[i + 1] && argv[i + 1].indexOf('--') !== 0 ? argv[++i] : true;
  }
  return opt;
}
function argumenten(argv) {
  var opt = argumentenUit(argv, ['export', 'referentie', 'exact', 'exact-verkoop', 'exact-open', 'exact-open-stand', 'xps', 'peildatum', 'code']);  // v7.9.4: exact-verkoop en exact-open; harnasdekking: exact-open-stand
  if (!opt.export || !opt.referentie) throw fout('Gebruik: node test/vergelijk_sturing.js --export <export.json> --referentie <referentie.csv> [--exact-verkoop <csv>] [--exact-open <csv> [--exact-open-stand jjjj-mm-dd]] [--exact <csv>] [--xps <csv>] [--peildatum jjjj-mm-dd] [--code <Code.gs>]');
  return opt;
}
function scheidingsteken(tekst) { var r = (tekst.split('\n')[0] || ''); return r.indexOf(';') >= 0 ? ';' : ','; }
function getalIn(s) {
  s = String(s == null ? '' : s).replace(/[€\s%]/g, '');
  if (!s) return null;
  if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/* ----- Athena in een vm: demo-backend.js (nagebootste Apps Script-diensten) + Code.gs, gevuld met de export in plaats van de seed ----- */

function laadContext(codePad) {
  var ctx = { console: { log: function () {}, error: function () {}, warn: function () {} } }; ctx.globalThis = ctx; vm.createContext(ctx);  // alleen een stille console van buiten (instanceof binnen de context)
  vm.runInContext(fs.readFileSync(path.join(REPO, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(codePad || path.join(REPO, 'backend/Code.gs'), 'utf8'), ctx, { filename: 'athena.js' });
  return ctx;
}
// De export ({ tabellen: { Tab: [object] }, eigenschappen }) als bladen met een kopregel, in de volgorde van TABELLEN
function startMetExport(ctx, tekst) {
  var exp; try { exp = JSON.parse(tekst); } catch (e) { throw fout('export: geen geldige JSON.'); }
  if (!exp || typeof exp !== 'object' || !exp.tabellen || typeof exp.tabellen !== 'object') throw fout('export: het veld tabellen ontbreekt.');
  var T = ctx.TABELLEN, bladen = {};
  Object.keys(exp.tabellen).forEach(function (tab) {
    if (!Object.prototype.hasOwnProperty.call(T, tab)) return;  // een tabblad dat Code.gs niet kent: overslaan (de naam komt niet in de uitvoer)
    var rijen = exp.tabellen[tab]; if (!Array.isArray(rijen)) throw fout('export, tabel ' + tab + ': geen lijst.');
    var kop = T[tab].slice();
    bladen[tab] = [kop].concat(rijen.map(function (r, i) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw fout('export, tabel ' + tab + ', rij ' + (i + 1) + ': geen object.');
      return kop.map(function (k) { var v = r[k]; return v === undefined || v === null ? '' : v; });
    }));
  });
  if (!bladen.Kansen) throw fout('export, tabel Kansen: ontbreekt.');
  var eig = exp.eigenschappen && typeof exp.eigenschappen === 'object' ? exp.eigenschappen : {};
  if (ctx.demoStart(JSON.stringify({ bladen: bladen, props: eig })) !== 'hersteld') throw fout('export: de tabellen zijn niet te laden.');  // nooit terugvallen op de seed
  if (typeof eig.NAAM === 'string' && eig.NAAM) ctx._demoProps.NAAM = eig.NAAM;  // de eigenaar van het script (actieve_eigenaar); demoStart neemt NAAM niet over
  ctx.GEBRUIKER = null;  // zonder gebruiker, zoals de trigger: sturingCijfers en datacontracten kennen geen rechten
}

/* ----- de referentie ----- */

var KLANT_SPLIT = ['gecontracteerd', 'gewogenPijplijn', 'gewonnenWaarde', 'urenVorigeJaren'];
var ZONDER = { gecontracteerd: 'zonderGetekend', gewogenPijplijn: 'zonderWaarde', gewonnenWaarde: 'zonderDatum', funnel: 'zonderSchooljaar', verwachteOpdrachten: 'zonderDatum' };
var UITSPLITSINGEN = ['nieuw', 'bestaand', 'onbekend', 'zonder'];
function standCijfers(ctx) { var u = []; ctx.STURING_BLOKKEN.forEach(function (b) { b.cijfers.forEach(function (id) { u.push(id); }); }); return u; }
function weekCijferIds(ctx) { return Array.prototype.slice.call(ctx.WEEK_CIJFERS).filter(function (id) { return id !== 'weekdoel'; }); }  // het weekdoel is een doel, geen telling
// metriek → registersleutel: een sleutel uit METRIEKEN, of een M-code die bij precies één sleutel hoort
function sleutelVan(ctx, metriek, stand, week) {
  var m = String(metriek).trim();
  if (/^m\d{2}$/i.test(m)) {
    var code = m.toUpperCase(), ids = Object.keys(ctx.METRIEKEN).filter(function (id) { return ctx.METRIEKEN[id].m === code && (stand.indexOf(id) >= 0 || week.indexOf(id) >= 0); });
    if (!ids.length) return { fout: 'onbekend cijfer' };
    if (ids.length > 1) return { fout: 'meer cijfers met deze code; gebruik de sleutel uit het register' };
    return { id: ids[0], token: code };
  }
  if (/^[a-zA-Z]+$/.test(m) && ctx.uitMap(ctx.METRIEKEN, m)) return { id: m, token: m };
  return { fout: 'onbekend cijfer' };
}
function dagGeldig(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return false; var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; }
function laatsteDag(j, m) { return j + '-' + ('0' + m).slice(-2) + '-' + ('0' + new Date(Date.UTC(j, m, 0)).getUTCDate()).slice(-2); }
function kleinste(a, b) { return a < b ? a : b; }
// De periode als stand (peildatum) of als week (van, tot, eind); nooit na de peildatum P
function periodeUit(ctx, p, P) {
  var m;
  if (dagGeldig(p)) return p > P ? { fout: 'na de peildatum' } : { soort: 'stand', peildatum: p };
  if ((m = /^(\d{4})-(\d{2})$/.exec(p)) && +m[2] >= 1 && +m[2] <= 12) { if (p + '-01' > P) return { fout: 'na de peildatum' }; return { soort: 'stand', peildatum: kleinste(laatsteDag(+m[1], +m[2]), P) }; }
  if ((m = /^(\d{4})-W(\d{2})$/.exec(p))) {
    var van = ctx.maandagVanWeek(p);
    if (!van || ctx.isoWeekStr(ctx.parseDatum(van)) !== p) return { fout: 'onbekende week' };
    if (van > P) return { fout: 'na de peildatum' };
    var eind = ctx.plusDagenVan(van, 6); return { soort: 'week', van: van, eind: eind, tot: kleinste(eind, P), peildatum: kleinste(eind, P), afgekapt: P < eind };  // harnasdekking (6): ma t/m P
  }
  if ((m = /^(\d{4})-(\d{4})$/.exec(p))) {
    if (+m[2] !== +m[1] + 1) return { fout: 'onbekende vorm' };
    if (m[1] + '-08-01' > P) return { fout: 'na de peildatum' };
    return { soort: 'stand', peildatum: kleinste(m[2] + '-07-31', P), schooljaar: p };
  }
  return { fout: 'onbekende vorm' };
}
// Leest en controleert de referentie. Een fout noemt alleen regel en kolom, nooit de inhoud van een cel.
function leesReferentie(ctx, tekst, P) {
  var regelsTekst = tekst.split(/\r?\n/), nrs = [], schoon = [];
  regelsTekst.forEach(function (l, i) { if (/^\s*#/.test(l) || !l.trim()) return; schoon.push(l); nrs.push(i + 1); });
  if (!schoon.length) throw fout('referentie: het bestand is leeg.');
  var rijen = ctx.Utilities.parseCsv(schoon.join('\n'), scheidingsteken(schoon.join('\n')));
  var kop = Array.prototype.slice.call(rijen[0] || []).map(function (h) { return String(h).trim().toLowerCase(); }), idx = {}, fouten = [];
  ['metriek', 'periode', 'waarde', 'uitsplitsing'].forEach(function (k) { idx[k] = kop.indexOf(k); });
  ['metriek', 'periode', 'waarde'].forEach(function (k) { if (idx[k] < 0) fouten.push('referentie, regel ' + nrs[0] + ', kolom ' + k + ': ontbreekt in de kopregel'); });
  if (fouten.length) return { regels: [], fouten: fouten };
  var stand = standCijfers(ctx), week = weekCijferIds(ctx), uit = [];
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i], nr = nrs[i] || i + 1, cel = function (k) { return idx[k] >= 0 && r[idx[k]] != null ? String(r[idx[k]]).trim() : ''; }, f0 = fouten.length;
    if (!Array.prototype.some.call(r, function (x) { return String(x).trim() !== ''; })) continue;
    var waar = function (k, reden) { fouten.push('referentie, regel ' + nr + ', kolom ' + k + ': ' + reden); };
    var s = sleutelVan(ctx, cel('metriek'), stand, week); if (s.fout) waar('metriek', s.fout);
    var per = periodeUit(ctx, cel('periode'), P); if (per.fout) waar('periode', per.fout);
    var w = getalIn(cel('waarde')); if (w === null) waar('waarde', 'geen getal');
    var u = cel('uitsplitsing').toLowerCase(); if (u && UITSPLITSINGEN.indexOf(u) < 0) waar('uitsplitsing', 'onbekende waarde');
    if (fouten.length === f0) {
      if (per.soort === 'week' && week.indexOf(s.id) < 0) waar('periode', 'dit cijfer heeft geen weekwaarde');
      else if (per.soort === 'stand' && stand.indexOf(s.id) < 0) waar('periode', 'dit cijfer heeft alleen een weekwaarde');
      else if (u && per.soort === 'week') waar('uitsplitsing', 'een week heeft geen uitsplitsing');
      else if ((u === 'nieuw' || u === 'bestaand' || u === 'onbekend') && KLANT_SPLIT.indexOf(s.id) < 0) waar('uitsplitsing', 'dit cijfer heeft geen uitsplitsing nieuw/bestaand');
      else if (u === 'zonder' && !ZONDER[s.id]) waar('uitsplitsing', 'dit cijfer heeft geen deel zonder');
    }
    if (fouten.length === f0) uit.push({ nr: nr, token: s.token, id: s.id, periode: cel('periode'), per: per, uitsplitsing: u, waarde: w });
  }
  if (!uit.length && !fouten.length) fouten.push('referentie: geen regels onder de kopregel');
  return { regels: uit, fouten: fouten };
}

/* ----- Athena-cijfers: dezelfde functies als apiSturing (sturingCijfers voor een stand, weekCijfers voor een week) ----- */

function eenmaal(L, sleutel, maak) { if (!Object.prototype.hasOwnProperty.call(L.cache, sleutel)) L.cache[sleutel] = maak(); return L.cache[sleutel]; }
function standOp(L, d) { return eenmaal(L, 'stand|' + d, function () { var S = L.ctx.sturingCijfers(d), per = {}; S.blokken.forEach(function (b) { b.cijfers.forEach(function (c) { per[c.id] = c; }); }); return per; }); }
function weekVan(L, per) {
  return eenmaal(L, 'week|' + per.van, function () { return L.ctx.weekCijfers({ van: per.van, tot: per.tot, eind: per.eind }, [{ naam: '__team', leden: L.ctx.teamNamen('consultancy') }]).__team; });
}
// v7.9.4 (bouwpunt 11): de blokkade van Code.gs voor een team zonder (actieve) leden ('' als het team leden heeft); een oudere Code.gs (--code) zonder
// teamBlokkade: dezelfde regel op teamNamen
function teamBlok(L) { var ctx = L.ctx; return typeof ctx.teamBlokkade === 'function' ? String(ctx.teamBlokkade('consultancy') || '') : ctx.teamNamen('consultancy').length ? '' : 'geen leden in het team'; }
function zonderWaarde(v) { return v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)); }
// { geblokkeerd, reden, leeg, waarde } van één referentieregel.
// v7.9.4: een team zonder leden is voor elk weekcijfer geblokkeerd, ook contactmomenten, afsprakenGehouden en gewonnen (bouwpunt 11; de standcijfers M23 en
// M35 blokkeert Code.gs zelf); een cijfer of deel zonder waarde is leeg, nooit 0 (bouwpunt 13). Een deel nieuw/bestaand/onbekend dat ontbreekt naast een
// cijfer met een waarde is 0: delenUit laat een deel van 0 weg; herstel r4 (R4-2b): een deel met alleen winsten zonder getekende waarde staat er leeg (null).
// Herstel r4 (R4-2): het deel zonder is een eigen telling in extra, dus ook bij een lege hoofdwaarde
function athenaWaarde(L, r) {
  var ctx = L.ctx, blok = function (reden) { return { geblokkeerd: true, reden: String(reden || ''), leeg: false, waarde: null }; };
  var uit = function (v) { return zonderWaarde(v) ? { geblokkeerd: false, reden: '', leeg: true, waarde: null } : { geblokkeerd: false, reden: '', leeg: false, waarde: Number(v) }; };
  if (r.per.soort === 'week') {
    var tb = teamBlok(L); if (tb) return blok(tb);
    var rb = ctx.METRIEKEN[r.id].rol ? ctx.rolBlokkade() : ''; if (rb) return blok(rb);
    var x = weekVan(L, r.per); if (x.blokkade) return blok(x.blokkade);
    return uit(x[r.id]);
  }
  var c = standOp(L, r.per.peildatum)[r.id];
  if (!c) return blok('');
  if (c.geblokkeerd) return blok(c.geblokkeerd);
  if (r.uitsplitsing === 'zonder') return uit(c.extra ? c.extra[ZONDER[r.id]] : null);
  if (zonderWaarde(c.waarde)) return uit(null);
  if (!r.uitsplitsing) return uit(c.waarde);
  return uit((Array.prototype.filter.call(c.uitsplitsing || [], function (u) { return u.label === r.uitsplitsing; })[0] || { waarde: 0 }).waarde);
}
// v7.9.4: de soort van een blokkade uit Code.gs voor de uitvoer (vaste woorden, nooit de tekst zelf); '' als hij in geen soort past.
// Herstel r1 (K7): stand = "stand alleen voor vandaag" (bouwpunt 7: de fase op een eerdere peildatum is niet te reconstrueren); telt niet als geslaagd (exitcode 3)
var BLOK_SOORTEN = [['geen leden', /^geen leden in het team/], ['stand', /^stand alleen voor vandaag/], ['rollen', /rollen niet ingesteld/], ['redenen', /verliesredenen/], ['extern', /^extern\b|§6/], ['besluit', /besluit/]];
var NIETS_MELDING = 'melding: geen enkele regel is vergeleken (alles invoer, geblokkeerd of leeg); het harnas slaagt dan niet.';  // herstel r2 (B-B7); herstel r3 (R3-D2): ook invoer
// herstel r3 (R3-D2): gezakt (invoer) is niet vergeleken (Athena mist de gegevens, er is niets aangetoond); een vaste zin, zonder aantal
var INVOER_MELDING = 'melding: een of meer regels zijn niet vergeleken omdat Athena de invoer mist (gezakt (invoer): een gezakt of leeg datacontract of een open overstapstap); die regels tonen niets aan.';
// herstel r3 (R3-D2): alleen deze uitkomsten zijn een vergelijking (de waarde van Athena is tegen de referentie of de bron gezet); onverklaard telt apart (exitcode 1)
var VERGELEKEN = ['geslaagd', 'gezakt (definitie)', 'gezakt (bron)'];
var STAND_MELDING = 'melding: een of meer regels zijn niet vergeleken: de stand op die peildatum is niet te reconstrueren (fasewissels zonder werkelijke datum: importeer de werkelijke datums in Beheer), of vergelijk de stand van vandaag.';  // geen getal (geen aantal)
// harnasdekking: vaste zinnen zonder aantal (3, 4: de export; 6: een afgekapte week; 8: wissels met zekerheid laag; 5 noemt de invoer met vaste namen)
var EXPORT_MELDING = 'melding: een of meer regels wijken af, maar de export kan de bron niet toetsen (geblokkeerd (export …) of (stand van Open onbekend)); die regels zijn niet vergeleken: geef een export die de hele periode dekt, van de peildatum of later (--exact-open-stand), met een betaaldatum of met de kolom Open en --exact-open-stand gelijk aan de peildatum.';
var WEEK_MELDING = 'melding: een of meer weekregels zijn op de peildatum afgekapt (maandag t/m de peildatum, niet de hele week); vergelijk ze met een rapport over dezelfde dagen.';
var LAAG_MELDING = 'melding: een of meer standregels op een eerdere peildatum rusten op fasewissels met zekerheid laag (bij een tijdlijnwissel is de werkelijke datum de dag van invoer, de echte datum kan eerder liggen); geen blokkade, maar importeer de werkelijke datums in Beheer voor een zekere stand.';
// harnasdekking (8): standcijfers die op een eerdere peildatum op fasewissels rusten (de fase uit kansenOpPeildatum, of wissels in de periode)
var OP_WISSELS = ['gecontracteerd', 'doelpad', 'gewogenPijplijn', 'dekking', 'gewonnenWaarde', 'conversie', 'funnel', 'verwachteOpdrachten', 'stilstand', 'verloren', 'ocActiviteit', 'registratievertraging'];
// Een tellende wissel met zekerheid laag vanaf 1 augustus van het schooljaar van de peildatum kan de fase op die dag of de telling in het schooljaar verschuiven (zijn
// echte datum kan eerder liggen); een eerdere niet, want die lag al vóór het schooljaar en vóór de peildatum
function opLageWissels(L, r) {
  if (r.per.soort !== 'stand' || r.per.peildatum >= L.vandaag || OP_WISSELS.indexOf(r.id) < 0) return false;
  var van = sjVan(L, r.per.peildatum).slice(0, 4) + '-08-01';
  return eenmaal(L, 'laag|' + van, function () { return L.ctx.tellendeWissels().some(function (w) { return w.zekerheid === 'laag' && String(w.werkelijkeDatum || '').slice(0, 10) >= van; }); });
}
function blokSoort(reden) { var s = String(reden || ''); for (var i = 0; i < BLOK_SOORTEN.length; i++) if (BLOK_SOORTEN[i][1].test(s)) return BLOK_SOORTEN[i][0]; return ''; }
// De tolerantie uit het register: '0' en '1' absoluut (aantallen, procentpunten), '1%' relatief tegen de referentie
function tolerantieVan(L, id) {
  var t = String((L.ctx.registerVan(id) || {}).tolerantie || '0').replace(',', '.'), m = /^(\d+(?:\.\d+)?)(%?)$/.exec(t);
  return m ? (m[2] ? { pct: Number(m[1]), abs: 0 } : { pct: 0, abs: Number(m[1]) }) : { pct: 0, abs: 0 };
}
function binnen(x, ref, tol) { var grens = tol.pct ? Math.abs(ref) * tol.pct / 100 : tol.abs; return Math.abs(x - ref) <= grens + 1e-9; }

/* ----- categorie definitie: oude definities die het harnas ook rekent ----- */

function sjVan(L, d) { return L.ctx.sjOp(d); }
function projectenVan(L, sj) { var u = {}; L.ctx.lees('Trajecten').forEach(function (t) { if (t.schooljaar === sj) u[t.id] = true; }); return u; }
function deel(L, k, u) { return !u || L.ctx.klantDeel(k) === u; }
// Per registersleutel een lijst van oude waarden (de definitie van vóór v7.9 of van de rapportscripts)
var OUDE_DEFINITIES = {
  // M08 op Kansen.gesloten en Kansen.waarde (de geschatte waarde, niet de getekende)
  gewonnenWaarde: function (L, r) {
    if (r.uitsplitsing === 'zonder') return [];
    var d = r.per.peildatum, sj = sjVan(L, d), van = sj.slice(0, 4) + '-08-01', som = 0;
    L.ctx.lees('Kansen').forEach(function (k) { var g = String(k.gesloten || '').slice(0, 10); if (k.fase === 'gewonnen' && g >= van && g <= d && deel(L, k, r.uitsplitsing)) som += Number(k.waarde) || 0; });
    return [som];
  },
  // M04 met Kansen.waarde in plaats van de getekende contractwaarde
  gecontracteerd: function (L, r) {
    if (r.uitsplitsing === 'zonder') return [];
    var sj = sjVan(L, r.per.peildatum), tSj = {}, som = 0;
    L.ctx.lees('Trajecten').forEach(function (t) { if (t.kansId && !tSj[t.kansId]) tSj[t.kansId] = t.schooljaar; });
    L.ctx.lees('Kansen').forEach(function (k) {
      if (k.fase !== 'gewonnen' || !deel(L, k, r.uitsplitsing)) return;
      var ksj = k.schooljaar ? String(k.schooljaar) : tSj[k.id] || (k.gesloten ? L.ctx.schooljaarVan(k.gesloten) : '');
      if (ksj === sj) som += Number(k.waarde) || 0;
    });
    return [som];
  },
  // M06 ongewogen, en gewogen met het percentage per kans (Kansen.kans), elk met en zonder het schooljaar
  gewogenPijplijn: function (L, r) {
    if (r.uitsplitsing === 'zonder') return [];
    var sj = sjVan(L, r.per.peildatum), u = [0, 0, 0, 0];
    L.ctx.lees('Kansen').filter(L.ctx.kansOpen).forEach(function (k) {
      if (!deel(L, k, r.uitsplitsing)) return;
      var w = Number(k.waarde) || 0, g = w * (Number(k.kans) || 0) / 100;
      u[0] += w; u[1] += g; if (String(k.schooljaar) === sj) { u[2] += w; u[3] += g; }
    });
    return u;
  },
  // herstel r6 (nit R6-4): M26 voor alleen de projecten van het schooljaar (de definitie van vóór herstel r6, zoals een overzicht per project)
  gefactureerd: function (L, r) {
    if (r.uitsplitsing) return [];
    var d = r.per.peildatum, sj = sjVan(L, d), van = sj.slice(0, 4) + '-08-01', tot = d < L.vandaag ? d : eindeMaand(d), inSj = projectenVan(L, sj), som = 0;
    L.ctx.lees('Facturen').forEach(function (f) { var v = L.ctx.verzondenVan(f); if (inSj[f.trajectId] && v && v.datum >= van && v.datum <= tot) som += Number(f.bedrag) || 0; });
    return [som];
  },
  // herstel r6 (R6-1): M28 voor alleen de projecten van het schooljaar (ook van vóór 1 augustus) en voor alle open posten (zoals de werklijst of Openstaande posten);
  // herstel r8 (R8-1b): ook "alle open posten" alleen van een bestaand project, zoals exactWijkt: een termijn zonder project is invoer (contract 17), geen definitie
  // herstel r10 (R10-1a): alleen de populatie verschilt van Athena, niet de datumregels: op de stand van vandaag (nu) telt een verzonden termijn als open, ook met
  // een verzenddatum na vandaag, en elke betaaldatum als betaald, zoals Code.gs (Financiën); op een eerdere peildatum op datum, ook zoals Code.gs
  openstaand: function (L, r) {
    if (r.uitsplitsing) return [];
    var d = r.per.peildatum, nu = d >= L.vandaag, inSj = projectenVan(L, sjVan(L, d)), u = [0, 0];
    L.ctx.lees('Facturen').forEach(function (f) { var v = L.ctx.verzondenVan(f), b = L.ctx.betaaldVan(f), x = Number(f.bedrag) || 0; if (!v || (!nu && v.datum > d) || (b && (nu || b.datum <= d)) || !metProject(L)[f.trajectId]) return; u[1] += x; if (inSj[f.trajectId]) u[0] += x; });
    return u;
  },
  // M27 als de som van de termijnen "nog te doen" (de oude tegel op Home), voor de projecten van het schooljaar en voor alle projecten
  nogTeFactureren: function (L, r) {
    var sj = sjVan(L, r.per.peildatum), inSj = {}, u = [0, 0];
    L.ctx.lees('Trajecten').forEach(function (t) { if (t.schooljaar === sj) inSj[t.id] = true; });
    L.ctx.lees('Facturen').forEach(function (f) { if (f.status && f.status !== 'nog te doen') return; var b = Number(f.bedrag) || 0; u[1] += b; if (inSj[f.trajectId]) u[0] += b; });
    return u;
  },
  // M12 als gewonnen ÷ (gewonnen + verloren) op Kansen.gesloten, zonder cohort
  conversie: function (L, r) {
    var d = r.per.peildatum, van = sjVan(L, d).slice(0, 4) + '-08-01', g = 0, v = 0;
    L.ctx.lees('Kansen').forEach(function (k) { var s = String(k.gesloten || '').slice(0, 10); if (s < van || s > d) return; if (k.fase === 'gewonnen') g++; else if (k.fase === 'verloren') v++; });
    return g + v ? [Math.round(1000 * g / (g + v)) / 10] : [];
  },
  // M21 als het aantal verloren kansen op Kansen.gesloten (ook opgeschoond)
  verloren: function (L, r) {
    var d = r.per.peildatum, van = sjVan(L, d).slice(0, 4) + '-08-01', n = 0;
    L.ctx.lees('Kansen').forEach(function (k) { var s = String(k.gesloten || '').slice(0, 10); if (k.fase === 'verloren' && s >= van && s <= d) n++; });
    return [n];
  },
  // M16 VO met de reguliere expressie op de tijdlijnregel (de datum van invoer, niet de werkelijke datum)
  voorstellen: function (L, r) {
    var team = {}, n = 0, nu0 = L.ctx.nu(); L.ctx.teamNamen('consultancy').forEach(function (x) { team[x] = true; });
    L.ctx.lees('Activiteiten').forEach(function (a) { var d = String(a.datum || '').slice(0, 10); if (team[a.door] && a.type === 'fase' && /→ voorstel$/.test(String(a.onderwerp)) && d >= r.per.van && d <= r.per.tot && String(a.datum) <= nu0) n++; });
    return [n];
  },
  // M16 deals op Kansen.gesloten
  gewonnen: function (L, r) {
    var team = {}, n = 0; L.ctx.teamNamen('consultancy').forEach(function (x) { team[x] = true; });
    L.ctx.lees('Kansen').forEach(function (k) { var s = String(k.gesloten || '').slice(0, 10); if (k.fase === 'gewonnen' && team[k.eigenaar] && s >= r.per.van && s <= r.per.tot) n++; });
    return [n];
  }
};

/* ----- categorie invoer: welk datacontract of welke overstapstap raakt welk cijfer ----- */

// v7.9.4 (bouwpunt 12): ook de overstapstappen fasen (Capsule-fasen, pre-AP en 5b; de rol per fase en de deals uit fase 6), capsule (de Capsule-stand: open,
// verloren en gewonnen kansen met hun wissels) en accounts (de OC's in het team consultancy; zonder hen logt en wisselt geen OC in Athena)
// herstel r2 (A-B2): en projecten (stap 5 van §7.6: geen enkel project in het schooljaar van de peildatum; M04, M08 en M25–M28 rusten op Trajecten, en
// tarief_echt blijft zonder standaardtarief "niet getoetst", dus zonder deze stap was M25 op de echte stand onverklaard)
var RAAKT = {
  jaardoel: ['noemerbewaking'], doelpad: ['noemerbewaking', 'geen_target_op_facturatie'], benodigdeActiviteit: ['noemerbewaking'],
  gecontracteerd: ['gewonnen_is_getekend', 'kans_heeft_schooljaar_en_klant', 'lopend_project_heeft_contract', 'overstap:fasen', 'overstap:capsule', 'overstap:projecten'],
  gewogenPijplijn: ['waarde_vanaf_voorstel', 'kans_heeft_schooljaar_en_klant', 'dekking_robuust', 'overstap:fasen', 'overstap:capsule', 'overstap:accounts'],
  dekking: ['gewonnen_is_getekend', 'waarde_vanaf_voorstel', 'kans_heeft_schooljaar_en_klant', 'lopend_project_heeft_contract', 'noemerbewaking', 'overstap:fasen', 'overstap:capsule', 'overstap:projecten'],  // herstel r5 (R5-C2): M07 = M04 ÷ noemer
  gewonnenWaarde: ['fasewissel_heeft_werkelijke_datum', 'gewonnen_is_getekend', 'overstap:tijdlijn', 'overstap:fasen', 'overstap:capsule', 'overstap:projecten'],
  conversie: ['fasewissel_heeft_werkelijke_datum', 'verliesdiscipline', 'overstap:redenen', 'overstap:tijdlijn', 'overstap:capsule', 'overstap:accounts'],
  voorspellingDeals: ['fasewissel_heeft_werkelijke_datum', 'overstap:tijdlijn', 'overstap:capsule'],
  funnel: ['kans_heeft_schooljaar_en_klant', 'geen_dubbele_open_kansen', 'waarde_vanaf_voorstel', 'overstap:fasen', 'overstap:capsule', 'overstap:accounts'],
  verwachteOpdrachten: ['sluitdatum_vanaf_voorstel', 'waarde_vanaf_voorstel', 'overstap:fasen', 'overstap:capsule', 'overstap:accounts'],
  stilstand: ['actieve_eigenaar', 'overstap:capsule', 'overstap:accounts'],
  verloren: ['verliesdiscipline', 'fasewissel_heeft_werkelijke_datum', 'overstap:redenen', 'overstap:tijdlijn', 'overstap:capsule', 'overstap:accounts'],
  ocActiviteit: ['fasewissel_heeft_werkelijke_datum', 'overstap:tijdlijn', 'overstap:accounts'],
  verlengingsstand: ['verlenging_bekend', 'school_heeft_brin', 'lopend_project_heeft_contract'],
  geleverd: ['tarief_echt', 'overstap:projecten'],
  gefactureerd: ['termijn_verzonden_heeft_factuurnummer', 'overstap:projecten'],
  nogTeFactureren: ['lopend_project_heeft_contract', 'termijn_verzonden_heeft_factuurnummer', 'overstap:projecten'],
  openstaand: ['termijn_verzonden_heeft_factuurnummer', 'overstap:projecten'],
  registratievertraging: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:accounts'],
  contactmomenten: ['overstap:accounts'], afsprakenGehouden: ['overstap:accounts'], afsprakenGepland: ['overstap:accounts'],
  ap: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn', 'overstap:fasen', 'overstap:capsule', 'overstap:accounts'],
  ad: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn', 'overstap:fasen', 'overstap:capsule', 'overstap:accounts'],
  voorstellen: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn', 'overstap:fasen', 'overstap:capsule', 'overstap:accounts'],
  gewonnen: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn', 'overstap:fasen', 'overstap:capsule', 'overstap:accounts']
};
// v7.9.4 (bouwpunt 12): invoer ziet een gezakt contract en een contract met de stand leeg (niets te toetsen, bouwpunt 1); niet getoetst en geblokkeerd niet
var INVOER_STANDEN = ['gezakt', 'leeg'];
function contractStanden(L, d) {
  return eenmaal(L, 'contracten|' + d, function () { var u = {}; L.ctx.datacontracten(L.ctx.standVoorContracten(d)).forEach(function (c) { u[c.id] = c.stand; }); return u; });
}
// De open overstapstappen. Proefdraai: schrijft niets. v7.9.4 (bouwpunt 12): redenen ook open als er geen enkele verloren kans of wissel naar verloren is
// (de stap meldt dan "gekoppeld" omdat er niets te koppelen is); fasen zolang stap fasen niet gedaan is; capsule zolang de Capsule-migratie niet klaar is
// (geen eigenschap CAPSULE_MIGRATIE en geen kans met een capsuleId); accounts als het team consultancy geen leden heeft.
function openOverstap(L) {
  return eenmaal(L, 'overstap', function () {
    var ctx = L.ctx, s = ctx.apiMigratieV79('status', {}), kansen = ctx.lees('Kansen');
    var verloren = kansen.some(function (k) { return k.fase === 'verloren'; }) || ctx.lees('Fasewissels').some(function (w) { return w.naar === 'verloren' && !w.ongedaan && !w.verwijderd; });
    var capsule = !!ctx.PropertiesService.getScriptProperties().getProperty('CAPSULE_MIGRATIE') || kansen.some(function (k) { return !!k.capsuleId; });
    var metProject = {}; ctx.lees('Trajecten').forEach(function (t) { if (t.schooljaar) metProject[String(t.schooljaar)] = true; });
    return { tijdlijn: s.tijdlijn.teOmzetten > 0, redenen: !s.redenen.gekoppeld || !verloren, fasen: !(s.fasen && s.fasen.alGedaan), capsule: !capsule, accounts: !!teamBlok(L),
      projecten: !Object.keys(metProject).length, metProject: metProject };
  });
}
// harnasdekking (5): welke invoer raakt deze regel (vaste namen uit de code: het contract met zijn stand, de open overstapstap; nooit een waarde of aantal)
function invoerRedenen(L, r) {
  var c = contractStanden(L, r.per.peildatum), o = openOverstap(L);
  var open = function (stap) { return stap === 'projecten' ? !o.metProject[sjVan(L, r.per.peildatum)] : !!o[stap]; };  // herstel r2 (A-B2): per schooljaar van de peildatum
  return (RAAKT[r.id] || []).filter(function (x) { return x.indexOf('overstap:') === 0 ? open(x.slice(9)) : INVOER_STANDEN.indexOf(c[x]) >= 0; })
    .map(function (x) { return x.indexOf('overstap:') === 0 ? 'overstapstap ' + x.slice(9) + ' (open)' : 'contract ' + x + ' (' + c[x] + ')'; });
}
function invoerRaakt(L, r) { return invoerRedenen(L, r).length > 0; }

/* ----- categorie bron: de Exact- en XPS-export tegen wat in de Athena-stand staat ----- */

// De facturatie-export met de bouwstenen van apiExactImport (Utilities.parseCsv, de kolomnamen uit EXACT_ANDERE_NAMEN, bedragIn, datumUitExport)
// v7.9.4 (bouwpunt 15): soort = de naam van de invoer in een foutmelding (exact, exact-verkoop, exact-open); geeft { rijen, metOpen } met metOpen = de export
// heeft de kolom Open of een betaaldatum. eisOpen (--exact-open): zonder die kolom een invoerfout.
function leesExact(ctx, tekst, soort, eisOpen) {
  soort = soort || 'exact';
  if (!tekst.trim()) throw fout(soort + ': het bestand is leeg.');
  if (ctx.isOpenstaandePosten(tekst)) throw fout(soort + ', regel 1: dit is het rapport Openstaande posten; gebruik de export per factuur.');
  var rijen = ctx.Utilities.parseCsv(tekst, scheidingsteken(tekst)), kop = Array.prototype.slice.call(rijen[0] || []).map(function (h) { return String(h).trim(); });
  var kk = kop.map(function (h) { return h.toLowerCase(); }), ingesteld = ctx.instelling('exactKolommen'), idx = {}, naam = {};
  if (!ingesteld || typeof ingesteld !== 'object') ingesteld = {};
  Object.keys(ctx.EXACT_ANDERE_NAMEN).forEach(function (x) {
    var namen = [ctx.uitMap(ingesteld, x), ctx.uitMap(ctx.EXACT_KOLOMMEN, x)].concat(Array.prototype.slice.call(ctx.EXACT_ANDERE_NAMEN[x])).filter(function (n) { return typeof n === 'string' && n.trim(); });
    naam[x] = namen[0] || x;
    idx[x] = -1; for (var i = 0; i < namen.length && idx[x] < 0; i++) idx[x] = kk.indexOf(namen[i].toLowerCase());
    if (idx[x] < 0 && ['factuurnummer', 'datum', 'bedrag'].indexOf(x) >= 0) throw fout(soort + ', regel 1, kolom ' + naam[x] + ': niet gevonden');
  });
  var metOpen = idx.open >= 0 || idx.betaald >= 0;
  if (eisOpen && !metOpen) throw fout(soort + ', regel 1, kolom ' + naam.open + ': niet gevonden (ook geen betaaldatum)');
  var uit = [];
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i], cel = function (x) { return idx[x] >= 0 && r[idx[x]] != null ? String(r[idx[x]]).trim() : ''; };
    if (!cel('factuurnummer')) continue;
    var datum = ctx.datumUitExport(cel('datum')), bedrag = ctx.bedragIn(cel('bedrag'));
    if (!datum) throw fout(soort + ', regel ' + (i + 1) + ', kolom ' + kop[idx.datum] + ': geen datum');
    if (bedrag === null) throw fout(soort + ', regel ' + (i + 1) + ', kolom ' + kop[idx.bedrag] + ': geen bedrag');
    var open = idx.open >= 0 && cel('open') !== '' ? ctx.bedragIn(cel('open')) : null;
    if (idx.open >= 0 && cel('open') !== '' && open === null) throw fout(soort + ', regel ' + (i + 1) + ', kolom ' + kop[idx.open] + ': geen bedrag');
    uit.push({ datum: datum, bedrag: bedrag, open: open, betaald: idx.betaald >= 0 ? ctx.datumUitExport(cel('betaald')) : '' });
  }
  var ds = uit.map(function (x) { return x.datum; }).sort();
  return { rijen: uit, metOpen: metOpen, metBetaald: idx.betaald >= 0, eerste: ds[0] || '', laatste: ds[ds.length - 1] || '' };  // herstel r1 (K12): betaaldatum; harnasdekking: het bereik
}
// harnasdekking (3, 4): dekt de export de maanden van deze datums (de termijnen van Athena die meetellen)? Een maand is gedekt als ze tussen de maand van de eerste
// en die van de laatste factuurdatum van de export ligt, grenzen inbegrepen (een maand zonder factuur daartussen is echt leeg). Alleen een maand met een termijn in
// Athena telt: een maand zonder termijn in Athena kan geen schijnbare afwijking geven.
// harnasdekking (3, 4): elke datum ligt tussen de maand van de eerste en die van de laatste factuurdatum van de export. Herstel r6 (R6-1): de maand van de peildatum P
// ook, als de export t/m de maand ervoor loopt (een export van vandaag zonder factuur van deze maand: Exact heeft er nog geen, dat is bron, niet "dekt niet").
// Herstel r7 (R7-1): alleen als P in de maand van de run R ligt (--peildatum, standaard vandaag); een eerdere maand direct na het einde van de export dekt niet
function dekt(ex, datums, P, R) {
  var eM = ex.eerste ? ex.eerste.slice(0, 7) : '', lM = ex.laatste ? ex.laatste.slice(0, 7) : '', pM = String(P || '').slice(0, 7), j = +pM.slice(0, 4), mm = +pM.slice(5, 7);
  if (pM !== String(R || '').slice(0, 7)) pM = '';
  var vorige = !pM ? '' : mm === 1 ? (j - 1) + '-12' : j + '-' + ('0' + (mm - 1)).slice(-2);
  return datums.every(function (d) { var m = String(d).slice(0, 7); return !!eM && m >= eM && (m <= lM || (m === pM && lM >= vorige)); });
}
function leesXps(ctx, tekst) {
  if (!tekst.trim()) throw fout('xps: het bestand is leeg.');
  var rijen = ctx.Utilities.parseCsv(tekst, scheidingsteken(tekst));
  if (rijen.length < 2) throw fout('xps: geen regels onder de kopregel.');
  return rijen;
}
function eindeMaand(d) { return laatsteDag(+d.slice(0, 4), +d.slice(5, 7)); }
// Gefactureerd in centen tussen van en tot: Exact op factuurdatum, Athena op de verzenddatum van de termijnen (elk bestaand project, zoals M26 sinds herstel r6 en r7)
// v7.9.4 (bouwpunt 15): '' (geen oordeel: geen export voor dit cijfer), 'wijkt', of een reden waarom de export de bron niet kan toetsen (BRON_BLOK): 'zonder open'
// (M28 zonder kolom Open en zonder betaaldatum), 'zonder betaaldatum', 'stand onbekend' of 'dekt niet'. M26 en M27 lezen het verkoopboek, M28 de export met Open.
// herstel r7 (R7-D3): de ids van de bestaande projecten; een termijn zonder project telt niet, zoals M26, M28 en Financiën
function metProject(L) { return eenmaal(L, 'projecten', function () { var u = {}; L.ctx.lees('Trajecten').forEach(function (t) { u[t.id] = true; }); return u; }); }
function exactWijkt(L, r) {
  var ctx = L.ctx, d = r.per.peildatum, tol = tolerantieVan(L, r.id), vergelijk = function (e, a) { return !binnen(a, e, tol.pct ? tol : { pct: 0, abs: tol.abs * 100 }) ? 'wijkt' : ''; };
  // herstel r8 (R8-1a): --exact-open-stand (S) is de dag van de export met Open en dus de grens: een peildatum erna is niet te toetsen, ook met een betaaldatum
  // (een termijn die na S verzonden of betaald is, staat er niet in). De maand van S is dan ook de maand van de run in dekt(). Zonder S geldt de aanname dat de
  // export van de run is (--peildatum, standaard vandaag)
  var S = L.openStand, R = S || L.peildatum;
  if (r.id === 'openstaand') {
    var X = L.exactOpen; if (!X) return '';
    if (!X.metOpen) return 'zonder open';
    // herstel r1 (K12); harnasdekking (4): de kolom Open is de stand op de exportdag (--exact-open-stand). Zonder betaaldatum telt Open alleen als die dag de
    // peildatum is; zonder --exact-open-stand geen oordeel. Met een betaaldatum Open op de exportdag (zonder S: vanaf vandaag), anders de betaaldatum
    var opDag = S ? S === d : d >= L.vandaag, eO = 0, aO = 0, open = [], van = sjVan(L, d).slice(0, 4) + '-08-01';
    if (!X.metBetaald && !(S && opDag)) return S ? 'zonder betaaldatum' : 'stand onbekend';
    if (S && d > S) return 'dekt niet';  // herstel r8 (R8-1a)
    // herstel r6 (R6-1): aan beide kanten de facturen van dit schooljaar (factuurdatum vanaf 1 augustus), zoals M28
    // herstel r10 (R10-1a): Athena op de stand van vandaag (nu) zoals Code.gs: verzonden is open, ook na vandaag (voor de dekking telt die termijn op de
    // peildatum), en elke betaaldatum is betaald; zo wijst een export met Open zo'n termijn als bron aan. Herstel r11 (R11-1a): de export dan ook met een
    // factuurdatum na vandaag (Open van de exportdag telt hem; apiExactImport zet verzonden = de factuurdatum), anders wees dezelfde factuur als bron
    var nu = d >= L.vandaag;
    X.rijen.forEach(function (x) { if ((!nu && x.datum > d) || x.datum < van) return; eO += opDag && x.open !== null ? x.open : (x.betaald && x.betaald <= d ? 0 : x.bedrag); });
    ctx.lees('Facturen').forEach(function (f) { var v = ctx.verzondenVan(f), b = ctx.betaaldVan(f); if (metProject(L)[f.trajectId] && v && v.datum >= van && (nu || v.datum <= d) && !(b && (nu || b.datum <= d))) { aO += ctx.centen(f.bedrag); open.push(v.datum > d ? d : v.datum); } });
    return dekt(X, open, d, R) ? vergelijk(eO, aO) : 'dekt niet';  // harnasdekking (4): een open termijn van Athena buiten het bereik van de export
  }
  if (!L.exactVerkoop) return '';
  // M26 en M27 (herstel r12, nit R12-2): bij M27 hetzelfde verkoopboek van alle bestaande projecten, dus ook een slottermijn van vorig schooljaar die M27 niet raakt
  var een = L.exactVerkoop === L.exactOpen;  // herstel r8 (R8-1a): --exact, één bestand voor verkoop en Open: dezelfde grens en dezelfde maand van de run
  if (een && S && d > S) return 'dekt niet';
  // herstel r2 (A-B1, B-B2): dezelfde periode als M26 (bouwpunt 7, K10): in een stand op een eerdere peildatum t/m die dag, aan beide kanten; vandaag de hele maand
  var van = sjVan(L, d).slice(0, 4) + '-08-01', tot = d < L.vandaag ? d : eindeMaand(d), e = 0, a = 0, verzonden = [];
  L.exactVerkoop.rijen.forEach(function (x) { if (x.datum >= van && x.datum <= tot) e += x.bedrag; });
  ctx.lees('Facturen').forEach(function (f) { var v = ctx.verzondenVan(f); if (metProject(L)[f.trajectId] && v && v.datum >= van && v.datum <= tot) { a += ctx.centen(f.bedrag); verzonden.push(v.datum); } });
  return dekt(L.exactVerkoop, verzonden, d, een ? R : L.peildatum) ? vergelijk(e, a) : 'dekt niet';  // harnasdekking (3): een vorig boekjaar dat het venster maar deels raakt, is geen bron
}
// v7.9.4 (bouwpunt 14): de rijen van een dienstenexport met één vast accountnummer, zodat urenUitRijen elke dienst aan één verzonnen talent koppelt. Zo telt
// het totaal per maand ook de diensten zonder talent in Athena, met verder precies de regels van urenUitRijen (datum t/m vandaag, archiefvenster, status
// niet afwezig/ziek/geannuleerd/reserve, geen no-show of late afmelding, uren > 0). Een export zonder accountnummerkolom krijgt er een (de eerste naam uit
// xpsKolommen); een lege rij blijft leeg. Alleen in het geheugen. Ook voor test/urenbasislijn.js.
var ALLE_ID = 'harnas-alle-diensten', ALLE_TALENT = { id: ALLE_ID, xpsId: ALLE_ID };
function alleDiensten(ctx, rijen) {
  var kop = Array.prototype.slice.call(rijen[0] || []).map(function (h) { return String(h == null ? '' : h); }), M = ctx.xpsKolommen(), c = ctx.xpsKolomIndexen(kop, M);
  var plek = c.xpsId >= 0 ? c.xpsId : kop.length, uit = [plek === kop.length ? kop.concat([M.xpsId[0] || 'accountnummer']) : kop];
  for (var i = 1; i < rijen.length; i++) {
    var r = Array.prototype.slice.call(rijen[i] || []);
    if (r.some(function (x) { return x !== '' && x != null; })) { while (r.length < plek) r.push(''); r[plek] = ALLE_ID; }
    uit.push(r);
  }
  return uit;
}
// tot en met de zondag van de laatste week die in maand m (jjjj-mm) begint (zo telt elke week van de maand helemaal mee), nooit na tot
function maandTot(ctx, m, tot) { return kleinste(ctx.plusDagenVan(ctx.datumStr(ctx.maandagVan(eindeMaand(m + '-01'))), 6), tot); }
var XPS_TOLERANTIE = 0.05;  // uren; afronding op twee decimalen per weekregel telt bij veel regels op
// Gewerkte uren per maand en per project van het schooljaar t/m peildatum d: Athena uit TalentUren en het archief, XPS via urenUitRijen. Per project de diensten
// die aan een talent koppelen (zoals de urenimport); v7.9.4 (bouwpunt 14) het totaal per maand (m|*) over alle gewerkte diensten (alleDiensten), en of er
// gewerkte diensten zijn zonder gekoppeld talent of zonder gekoppeld project (voor de melding, zonder aantal). Herstel r12 (R12-1): voor M25 een eigen totaal
// per maand (m|sj) met alleen de diensten zonder project of op een project van het schooljaar, want M25 telt geen project van een ander schooljaar.
function xpsStand(L, d) {
  return eenmaal(L, 'xps|' + d, function () {
    var ctx = L.ctx, sj = sjVan(L, d), wkTot = ctx.isoWeekStr(ctx.parseDatum(d)), maanden = Array.prototype.filter.call(ctx.schooljaarMaanden(sj), function (m) { return m <= d.slice(0, 7); });
    var inSj = {}; ctx.lees('Trajecten').forEach(function (t) { if (t.schooljaar === sj) inSj[t.id] = true; });
    var A = {}, X = {}, bij = function (o, k, u) { o[k] = (o[k] || 0) + u; }, uit = { A: A, X: X, zonderTalent: false, zonderProject: false };
    ctx.lees('TalentUren').concat(ctx.lees('TalentUren_archief')).forEach(function (u) {
      var w = String(u.week || ''); if (!w || w > wkTot) return; var m = ctx.maandVan(ctx.maandagVanWeek(w)); if (maanden.indexOf(m) < 0) return;
      var t = String(u.trajectId || ''), n = Number(u.uren) || 0; bij(A, m + '|*', n); if (inSj[t]) bij(A, m + '|' + t, n); if (!t || inSj[t]) bij(A, m + '|sj', n);
    });
    var talenten = ctx.lees('Talenten'), trajecten = ctx.lees('Trajecten'), statussen = ctx.xpsStatussen(), alle = L.xpsAlle || (L.xpsAlle = alleDiensten(ctx, L.xps));
    maanden.forEach(function (m) {
      var vandaag = maandTot(ctx, m, d), opties = { vandaag: vandaag, trajecten: trajecten, statussen: statussen }, heel, echt;
      try { heel = eenmaal(L, 'xps-alle|' + vandaag, function () { return ctx.urenUitRijen(alle, [ALLE_TALENT], opties); }); }
      catch (e) { throw fout('xps, regel 1: ' + (e && e.xpsExport ? e.message : 'de export is niet te lezen.')); }
      // zonder kolom om aan talenten te koppelen koppelt geen dienst (het totaal hierboven telt ze wel)
      try { echt = eenmaal(L, 'xps-echt|' + vandaag, function () { return ctx.urenUitRijen(L.xps, talenten, opties); }); }
      catch (e) { if (!(e && e.xpsExport)) throw fout('xps, regel 1: de export is niet te lezen.'); echt = { regels: [] }; }
      var inM = function (g) { return g.week <= wkTot && ctx.maandVan(ctx.maandagVanWeek(g.week)) === m; }, dEcht = 0, dAlle = 0;
      echt.regels.forEach(function (g) { if (!inM(g)) return; dEcht += Number(g.diensten) || 0; var t = String(g.trajectId || ''); if (inSj[t]) bij(X, m + '|' + t, Number(g.uren) || 0); });
      heel.regels.forEach(function (g) {
        if (!inM(g)) return; var t = String(g.trajectId || ''), n = Number(g.uren) || 0; dAlle += Number(g.diensten) || 0; bij(X, m + '|*', n); if (!t || inSj[t]) bij(X, m + '|sj', n);
        if (Number(g.diensten) > 0 && !t) uit.zonderProject = true;
      });
      if (dAlle > dEcht) uit.zonderTalent = true;
    });
    return uit;
  });
}
// M25 per project en per maand, M09 per maand (het niveau van de referentie); v7.9.4: M25 ook per maand, zodat diensten zonder talent of project meetellen;
// herstel r12 (R12-1): voor M25 is dat het totaal m|sj (zonder project of op een project van het schooljaar), M09 houdt m|* (urenPerMaand telt elke rij)
function xpsWijkt(L, r) {
  var s = xpsStand(L, r.per.peildatum), perProject = r.id === 'geleverd', sleutels = {};
  Object.keys(s.A).concat(Object.keys(s.X)).forEach(function (k) { if (perProject ? !/\|\*$/.test(k) : /\|\*$/.test(k)) sleutels[k] = true; });
  return Object.keys(sleutels).some(function (k) { return Math.abs((s.A[k] || 0) - (s.X[k] || 0)) > XPS_TOLERANTIE; });
}
var BRON = { gefactureerd: 'exact', nogTeFactureren: 'exact', openstaand: 'exact', geleverd: 'xps', urenVorigeJaren: 'xps' };
// harnasdekking: de export kan de bron niet toetsen → "geblokkeerd (<soort>)", niet vergeleken (exitcode 3; een afwijkende regel waarvan de bron niets zegt)
var BRON_BLOK = { 'zonder open': 'export zonder Open', 'zonder betaaldatum': 'export zonder betaaldatum', 'stand onbekend': 'stand van Open onbekend', 'dekt niet': 'export dekt de periode niet' };
var EXPORT_BLOK = Object.keys(BRON_BLOK).map(function (k) { return 'geblokkeerd (' + BRON_BLOK[k] + ')'; });
// '' (geen oordeel), 'wijkt' of een sleutel van BRON_BLOK
function bronOordeel(L, r) {
  var b = BRON[r.id]; if (!b || r.per.soort !== 'stand') return '';
  if (b === 'exact') return exactWijkt(L, r);
  return L.xps && xpsWijkt(L, r) ? 'wijkt' : '';
}
// v7.9.4 (bouwpunt 14): de meldingen over de XPS-koppeling voor de XPS-regels in de referentie (vaste zinnen, zonder aantal)
var XPS_MELDING = {
  zonderTalent: 'melding: xps: niet elke gewerkte dienst koppelt aan een talent in Athena; het totaal per maand telt ze wel mee (Beheer → XPS-uren importeren noemt welke).',
  zonderProject: 'melding: xps: niet elke gewerkte dienst koppelt aan een project in Athena (Trajecten.xpsProject); het totaal per maand telt ze wel mee.'
};
function xpsMeldingen(L, regels) {
  if (!L.xps) return [];
  var m = {};
  regels.forEach(function (r) { if (BRON[r.id] !== 'xps' || r.per.soort !== 'stand') return; var s = xpsStand(L, r.per.peildatum); if (s.zonderTalent) m.zonderTalent = true; if (s.zonderProject) m.zonderProject = true; });
  return ['zonderTalent', 'zonderProject'].filter(function (k) { return m[k]; }).map(function (k) { return XPS_MELDING[k]; });
}

/* ----- de vergelijking ----- */

// v7.9.4: geblokkeerd met de soort van de blokkade (bouwpunt 11), leeg zonder waarde (bouwpunt 13), geblokkeerd als M28 een export zonder Open heeft (bouwpunt 15)
function beoordeel(L, r) {
  var a = athenaWaarde(L, r);
  if (a.geblokkeerd) { var soort = blokSoort(a.reden); return 'geblokkeerd' + (soort ? ' (' + soort + ')' : ''); }
  if (a.leeg) return invoerRaakt(L, r) ? 'gezakt (invoer)' : 'leeg (geen basis)';  // herstel r4 (R4-1): leeg door ontbrekende invoer is invoer
  var tol = tolerantieVan(L, r.id);
  if (binnen(a.waarde, r.waarde, tol)) return 'geslaagd';
  var oud = OUDE_DEFINITIES[r.id] ? OUDE_DEFINITIES[r.id](L, r) : [];
  if (oud.some(function (v) { return binnen(v, r.waarde, tol); })) return 'gezakt (definitie)';
  if (invoerRaakt(L, r)) return 'gezakt (invoer)';
  var b = bronOordeel(L, r);
  if (b === 'wijkt') return 'gezakt (bron)';
  if (Object.prototype.hasOwnProperty.call(BRON_BLOK, b)) return 'geblokkeerd (' + BRON_BLOK[b] + ')';  // bouwpunt 15, herstel r1 (K12), harnasdekking (3, 4)
  return 'gezakt (onverklaard)';
}
// Laadt de stand en de exports; geeft L = { ctx, peildatum, cache, exactVerkoop, exactOpen, xps }
// v7.9.4 (bouwpunt 15): --exact vult beide Exact-invoeren (het oude gedrag), --exact-verkoop alleen M26 en M27, --exact-open alleen M28
function laad(opt) {
  if (opt.exact && (opt['exact-verkoop'] || opt['exact-open'])) throw fout('argumenten: gebruik --exact of --exact-verkoop en --exact-open, niet allebei.');
  if (opt['exact-open-stand'] !== undefined && !opt['exact-open'] && !opt.exact) throw fout('argumenten: --exact-open-stand alleen met --exact-open of --exact.');  // harnasdekking (4)
  var exportTekst = leesBestand('export', opt.export), refTekst = opt.referentie ? leesBestand('referentie', opt.referentie) : '';
  var exactTekst = opt.exact ? leesBestand('exact', opt.exact) : null, verkoopTekst = opt['exact-verkoop'] ? leesBestand('exact-verkoop', opt['exact-verkoop']) : null;
  var openTekst = opt['exact-open'] ? leesBestand('exact-open', opt['exact-open']) : null, xpsTekst = opt.xps ? leesBestand('xps', opt.xps) : null;
  var codePad = opt.code && opt.code !== true ? String(opt.code) : '';
  if (codePad && !fs.existsSync(codePad)) throw fout('code: het bestand bestaat niet.');
  var ctx = laadContext(codePad);
  startMetExport(ctx, exportTekst);
  var vandaag = vm.runInContext('datumStr(new Date())', ctx), P = vandaag;
  if (opt.peildatum !== undefined) {
    if (!dagGeldig(String(opt.peildatum))) throw fout('peildatum: gebruik jjjj-mm-dd.');
    if (String(opt.peildatum) > vandaag) throw fout('peildatum: ligt in de toekomst.');
    P = String(opt.peildatum);
  }
  var stand = opt['exact-open-stand'] === undefined ? '' : String(opt['exact-open-stand']);  // harnasdekking (4): de dag van de export (de stand van Open)
  if (stand && !dagGeldig(stand)) throw fout('exact-open-stand: gebruik jjjj-mm-dd.');
  if (stand > vandaag) throw fout('exact-open-stand: ligt in de toekomst.');
  var L = { ctx: ctx, peildatum: P, vandaag: vandaag, cache: {}, exactVerkoop: null, exactOpen: null, openStand: stand, xps: xpsTekst === null ? null : leesXps(ctx, xpsTekst), refTekst: refTekst };
  if (exactTekst !== null) L.exactVerkoop = L.exactOpen = leesExact(ctx, exactTekst, 'exact', false);
  if (verkoopTekst !== null) L.exactVerkoop = leesExact(ctx, verkoopTekst, 'exact-verkoop', false);
  if (openTekst !== null) L.exactOpen = leesExact(ctx, openTekst, 'exact-open', true);
  return L;
}
// Geeft { uit: [regel], fouten: [tekst], meldingen: [tekst], exit }
function vergelijk(opt) {
  var L, mis = function (e) { if (e instanceof Invoerfout) return { uit: [], fouten: [e.message], meldingen: [], exit: 1 }; throw e; };
  try { L = laad(opt); } catch (e) { return mis(e); }
  var ref;
  try { ref = leesReferentie(L.ctx, L.refTekst, L.peildatum); } catch (e) { return mis(e); }
  if (ref.fouten.length) return { uit: [], fouten: ref.fouten, meldingen: [], exit: 1 };
  var uit = [], onverklaard = 0, stand = 0, exportBlok = 0, vergeleken = 0, invoer = {}, laag = false, meldingen;
  try {
    ref.regels.forEach(function (r) {
      var c = beoordeel(L, r); if (c === 'gezakt (onverklaard)') onverklaard++; if (c === 'geblokkeerd (stand)') stand++; if (EXPORT_BLOK.indexOf(c) >= 0) exportBlok++;
      if (c === 'gezakt (invoer)') invoerRedenen(L, r).forEach(function (x) { invoer[x] = true; });  // harnasdekking (5)
      if (!/^(geblokkeerd|leeg)/.test(c) && opLageWissels(L, r)) laag = true;  // harnasdekking (8)
      if (VERGELEKEN.indexOf(c) >= 0) vergeleken++;  // herstel r3 (R3-D2): invoer is geen vergelijking
      uit.push(r.token + ' ' + r.periode + (r.uitsplitsing ? '/' + r.uitsplitsing : '') + ' ' + c);
    });
    meldingen = xpsMeldingen(L, ref.regels);
    if (stand) meldingen.push(STAND_MELDING);
    if (exportBlok) meldingen.push(EXPORT_MELDING);  // harnasdekking (3, 4)
    var invoerNamen = Object.keys(invoer).sort();
    if (invoerNamen.length) meldingen.push(INVOER_MELDING, 'melding: invoer die de regels gezakt (invoer) raakt: ' + invoerNamen.join(', ') + '.');  // herstel r3 (R3-D2); harnasdekking (5)
    if (ref.regels.some(function (r) { return r.per.soort === 'week' && r.per.afgekapt; })) meldingen.push(WEEK_MELDING);  // harnasdekking (6)
    if (laag) meldingen.push(LAAG_MELDING);  // harnasdekking (8)
    if (!vergeleken && !onverklaard && ref.regels.length) meldingen.push(NIETS_MELDING);  // herstel r6 (nit R6-3): onverklaard is wel tegen de referentie gezet
  } catch (e) { return mis(e); }
  // herstel r1 (K7): 1 gaat voor 3 (onverklaard of invoerfout); 3 = niets onverklaard, maar een regel is niet vergeleken (stand): het harnas slaagt dan niet.
  // herstel r2 (B-B7): ook 3 als geen enkele regel vergeleken is (alles geblokkeerd of leeg, zoals zonder OC-accounts). Herstel r3 (R3-D2): vergeleken is alleen
  // geslaagd, gezakt (definitie) of gezakt (bron); een run met alleen invoer (en leeg of geblokkeerd) eindigt dus ook met 3, nooit 0
  // harnasdekking (3, 4): ook 3 bij een regel die afwijkt terwijl de export de bron niet kan toetsen (EXPORT_BLOK), zoals bij geblokkeerd (stand)
  return { uit: uit, fouten: [], meldingen: meldingen, exit: onverklaard ? 1 : stand || exportBlok || (!vergeleken && ref.regels.length) ? 3 : 0 };
}
// v7.9.4 (bouwpunt 13): een onverwachte fout in het harnas zelf is exitcode 2 (niet 1: dat is alleen onverklaard of een invoerfout); geen melding met inhoud,
// alleen de soort fout en de plek in de code
function onverwacht(e, wie) {
  var plek = String((e && e.stack) || '').split('\n').filter(function (l) { return /\.js:\d+/.test(l); })[0] || '';
  return 'Onverwachte fout in ' + wie + ' (' + ((e && e.name) || 'fout') + ')' + (plek ? ' ' + plek.trim().replace(/^at\s+/, 'bij ').replace(/\(.*[\\\/]/, '(') : '') + '.';
}
function main() {
  var u;
  try { u = vergelijk(argumenten(process.argv.slice(2))); }
  catch (e) { u = e instanceof Invoerfout ? { uit: [], fouten: [e.message], meldingen: [], exit: 1 } : { uit: [], fouten: [onverwacht(e, 'het harnas')], meldingen: [], exit: 2 }; }
  u.uit.forEach(function (l) { process.stdout.write(l + '\n'); });
  u.fouten.concat(u.meldingen || []).forEach(function (l) { process.stderr.write(l + '\n'); });
  process.exitCode = u.exit;
}
module.exports = {
  vergelijk: vergelijk, laad: laad, leesReferentie: leesReferentie, athenaWaarde: athenaWaarde, periodeUit: periodeUit, binnenRepo: binnenRepo, OUDE_DEFINITIES: OUDE_DEFINITIES, RAAKT: RAAKT,
  // v7.9.4: voor de test en voor test/urenbasislijn.js
  blokSoort: blokSoort, openOverstap: openOverstap, invoerRaakt: invoerRaakt, invoerRedenen: invoerRedenen, beoordeel: beoordeel, dekt: dekt, exactWijkt: exactWijkt, opLageWissels: opLageWissels, alleDiensten: alleDiensten, ALLE_TALENT: ALLE_TALENT, maandTot: maandTot,
  Invoerfout: Invoerfout, fout: fout, echtPad: echtPad, leesBestand: leesBestand, argumentenUit: argumentenUit, laadContext: laadContext, startMetExport: startMetExport,
  leesXps: leesXps, dagGeldig: dagGeldig, onverwacht: onverwacht, HOOFDLETTERS_ZIJN_GELIJK: HOOFDLETTERS_ZIJN_GELIJK
};
if (require.main === module) main();
