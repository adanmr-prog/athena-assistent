/* Athena Assistent — v7.9 (bouwpunt 12, docs/sturing-v7.9.md): het vergelijkingsharnas voor de sturingscijfers. Alleen lokaal.
 * Legt de cijfers van Athena naast een referentie (het laatste week- of maandrapport, een spreadsheet, de scripts van de vorige sessie)
 * en verklaart elk verschil. Gebruik:
 *
 *   node test/vergelijk_sturing.js --export <export-jjjj-mm-dd.json> --referentie <referentie.csv>
 *        [--exact <facturatie-export.csv>] [--xps <dienstenexport.csv>] [--peildatum jjjj-mm-dd] [--code <pad naar Code.gs>]
 *
 * --export      de export van server/migratie.js --bewaar ({ tabellen: { Tab: [rij], … }, eigenschappen }); de echte Athena-stand
 * --referentie  csv (; of ,) met de kolommen metriek, periode, waarde en optioneel uitsplitsing; regels die met # beginnen zijn commentaar
 *               metriek = een M-code (M04) of een sleutel uit het register (gecontracteerd, contactmomenten)
 *               periode = jjjj-mm-dd (stand op die dag), jjjj-mm (stand op de laatste dag van de maand), jjjj-Www (week) of jjjj-jjjj (schooljaar)
 *               uitsplitsing = nieuw, bestaand, onbekend (M04, M06, M08, M09) of zonder (M04, M06, M08, M18, M19)
 * --exact       de facturatie-export van Exact (M26, M27, M28: categorie bron)
 * --xps         de dienstenexport van XPS (M09, M25: categorie bron)
 * --peildatum   standaard vandaag; geen periode mag erna liggen
 * --code        een andere kopie van Code.gs (standaard backend/Code.gs)
 *
 * Elk invoerbestand moet buiten de repo staan; een pad binnen de repo wordt geweigerd (echte gegevens komen nooit in de repo).
 * Uitvoer: per referentieregel precies één regel "<metriek> <periode>[/<uitsplitsing>] <uitkomst>" met als uitkomst
 *   geslaagd               binnen de tolerantie uit het register
 *   geblokkeerd            het cijfer is in Athena geblokkeerd (besluit, extern, rollen of redenen); telt niet als onverklaard
 *   gezakt (definitie)     de referentie klopt met een oude definitie die het harnas ook rekent
 *   gezakt (invoer)        een datacontract dat het cijfer raakt is gezakt, of een overstapstap is niet gedaan
 *   gezakt (bron)          de Exact- of XPS-export wijkt in dezelfde periode af van wat in de Athena-stand staat
 *   gezakt (onverklaard)   geen van drieën
 * Nooit waarden, namen, bedragen of tellingen. Een invoerfout noemt alleen het bestand, het regelnummer en de kolomnaam (op stderr).
 * Exitcode 1 bij minstens één onverklaarde regel of een invoerfout, anders 0 (ook met gezakte regels die een verklaring hebben). */
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
function argumenten(argv) {
  var opt = {}, bekend = ['export', 'referentie', 'exact', 'xps', 'peildatum', 'code'];
  for (var i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') !== 0) throw fout('argumenten: onbekend argument op plaats ' + (i + 1) + '.');
    var k = argv[i].slice(2); if (bekend.indexOf(k) < 0) throw fout('argumenten: onbekende optie --' + k + '.');
    opt[k] = argv[i + 1] && argv[i + 1].indexOf('--') !== 0 ? argv[++i] : true;
  }
  if (!opt.export || !opt.referentie) throw fout('Gebruik: node test/vergelijk_sturing.js --export <export.json> --referentie <referentie.csv> [--exact <csv>] [--xps <csv>] [--peildatum jjjj-mm-dd] [--code <Code.gs>]');
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
    var eind = ctx.plusDagenVan(van, 6); return { soort: 'week', van: van, eind: eind, tot: kleinste(eind, P), peildatum: kleinste(eind, P) };
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
// { geblokkeerd, waarde } van één referentieregel; een leeg Athena-cijfer telt als 0
function athenaWaarde(L, r) {
  var ctx = L.ctx;
  if (r.per.soort === 'week') {
    if (ctx.METRIEKEN[r.id].rol && ctx.rolBlokkade()) return { geblokkeerd: true, waarde: null };
    var x = weekVan(L, r.per), v = r.id === 'registratievertraging' ? x.registratievertraging : x[r.id];
    return { geblokkeerd: false, waarde: v === null || v === undefined || v === '' ? 0 : Number(v) };
  }
  var c = standOp(L, r.per.peildatum)[r.id];
  if (!c || c.geblokkeerd) return { geblokkeerd: true, waarde: null };
  var w;
  if (!r.uitsplitsing) w = c.waarde;
  else if (r.uitsplitsing === 'zonder') w = c.extra ? c.extra[ZONDER[r.id]] : 0;
  else w = (Array.prototype.filter.call(c.uitsplitsing || [], function (u) { return u.label === r.uitsplitsing; })[0] || { waarde: 0 }).waarde;
  return { geblokkeerd: false, waarde: w === '' || w === null || w === undefined ? 0 : Number(w) };
}
// De tolerantie uit het register: '0' en '1' absoluut (aantallen, procentpunten), '1%' relatief tegen de referentie
function tolerantieVan(L, id) {
  var t = String((L.ctx.registerVan(id) || {}).tolerantie || '0').replace(',', '.'), m = /^(\d+(?:\.\d+)?)(%?)$/.exec(t);
  return m ? (m[2] ? { pct: Number(m[1]), abs: 0 } : { pct: 0, abs: Number(m[1]) }) : { pct: 0, abs: 0 };
}
function binnen(x, ref, tol) { var grens = tol.pct ? Math.abs(ref) * tol.pct / 100 : tol.abs; return Math.abs(x - ref) <= grens + 1e-9; }

/* ----- categorie definitie: oude definities die het harnas ook rekent ----- */

function sjVan(L, d) { return L.ctx.sjOp(d); }
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

var RAAKT = {
  jaardoel: ['noemerbewaking'], doelpad: ['noemerbewaking', 'geen_target_op_facturatie'], benodigdeActiviteit: ['noemerbewaking'],
  gecontracteerd: ['gewonnen_is_getekend', 'kans_heeft_schooljaar_en_klant', 'lopend_project_heeft_contract'],
  gewogenPijplijn: ['waarde_vanaf_voorstel', 'kans_heeft_schooljaar_en_klant', 'dekking_robuust'],
  dekking: ['gewonnen_is_getekend', 'waarde_vanaf_voorstel', 'kans_heeft_schooljaar_en_klant', 'noemerbewaking'],
  gewonnenWaarde: ['fasewissel_heeft_werkelijke_datum', 'gewonnen_is_getekend', 'overstap:tijdlijn'],
  conversie: ['fasewissel_heeft_werkelijke_datum', 'verliesdiscipline', 'overstap:redenen', 'overstap:tijdlijn'],
  voorspellingDeals: ['fasewissel_heeft_werkelijke_datum', 'overstap:tijdlijn'],
  funnel: ['kans_heeft_schooljaar_en_klant', 'geen_dubbele_open_kansen', 'waarde_vanaf_voorstel'],
  verwachteOpdrachten: ['sluitdatum_vanaf_voorstel', 'waarde_vanaf_voorstel'],
  stilstand: ['actieve_eigenaar'],
  verloren: ['verliesdiscipline', 'fasewissel_heeft_werkelijke_datum', 'overstap:redenen', 'overstap:tijdlijn'],
  ocActiviteit: ['fasewissel_heeft_werkelijke_datum', 'overstap:tijdlijn'],
  verlengingsstand: ['verlenging_bekend', 'school_heeft_brin', 'lopend_project_heeft_contract'],
  geleverd: ['tarief_echt'],
  gefactureerd: ['termijn_verzonden_heeft_factuurnummer'],
  nogTeFactureren: ['lopend_project_heeft_contract', 'termijn_verzonden_heeft_factuurnummer'],
  openstaand: ['termijn_verzonden_heeft_factuurnummer'],
  registratievertraging: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum'],
  ap: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn'],
  ad: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn'],
  voorstellen: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn'],
  gewonnen: ['fasewissel_heeft_werkelijke_datum', 'geen_bulk_op_werkelijke_datum', 'overstap:tijdlijn']
};
function gezakteContracten(L, d) {
  return eenmaal(L, 'contracten|' + d, function () { var u = {}; L.ctx.datacontracten(L.ctx.standVoorContracten(d)).forEach(function (c) { if (c.stand === 'gezakt') u[c.id] = true; }); return u; });
}
function openOverstap(L) {
  return eenmaal(L, 'overstap', function () { var s = L.ctx.apiMigratieV79('status', {}); return { tijdlijn: s.tijdlijn.teOmzetten > 0, redenen: !s.redenen.gekoppeld }; });  // proefdraai: schrijft niets
}
function invoerRaakt(L, r) {
  var g = gezakteContracten(L, r.per.peildatum), o = openOverstap(L);
  return (RAAKT[r.id] || []).some(function (x) { return x.indexOf('overstap:') === 0 ? o[x.slice(9)] : !!g[x]; });
}

/* ----- categorie bron: de Exact- en XPS-export tegen wat in de Athena-stand staat ----- */

// De facturatie-export met de bouwstenen van apiExactImport (Utilities.parseCsv, de kolomnamen uit EXACT_ANDERE_NAMEN, bedragIn, datumUitExport)
function leesExact(ctx, tekst) {
  if (!tekst.trim()) throw fout('exact: het bestand is leeg.');
  if (ctx.isOpenstaandePosten(tekst)) throw fout('exact, regel 1: dit is het rapport Openstaande posten; gebruik de export per factuur.');
  var rijen = ctx.Utilities.parseCsv(tekst, scheidingsteken(tekst)), kop = Array.prototype.slice.call(rijen[0] || []).map(function (h) { return String(h).trim(); });
  var kk = kop.map(function (h) { return h.toLowerCase(); }), ingesteld = ctx.instelling('exactKolommen'), idx = {};
  if (!ingesteld || typeof ingesteld !== 'object') ingesteld = {};
  Object.keys(ctx.EXACT_ANDERE_NAMEN).forEach(function (x) {
    var namen = [ctx.uitMap(ingesteld, x), ctx.uitMap(ctx.EXACT_KOLOMMEN, x)].concat(Array.prototype.slice.call(ctx.EXACT_ANDERE_NAMEN[x])).filter(function (n) { return typeof n === 'string' && n.trim(); });
    idx[x] = -1; for (var i = 0; i < namen.length && idx[x] < 0; i++) idx[x] = kk.indexOf(namen[i].toLowerCase());
    if (idx[x] < 0 && ['factuurnummer', 'datum', 'bedrag'].indexOf(x) >= 0) throw fout('exact, regel 1, kolom ' + (namen[0] || x) + ': niet gevonden');
  });
  var uit = [];
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i], cel = function (x) { return idx[x] >= 0 && r[idx[x]] != null ? String(r[idx[x]]).trim() : ''; };
    if (!cel('factuurnummer')) continue;
    var datum = ctx.datumUitExport(cel('datum')), bedrag = ctx.bedragIn(cel('bedrag'));
    if (!datum) throw fout('exact, regel ' + (i + 1) + ', kolom ' + kop[idx.datum] + ': geen datum');
    if (bedrag === null) throw fout('exact, regel ' + (i + 1) + ', kolom ' + kop[idx.bedrag] + ': geen bedrag');
    var open = idx.open >= 0 && cel('open') !== '' ? ctx.bedragIn(cel('open')) : null;
    if (idx.open >= 0 && cel('open') !== '' && open === null) throw fout('exact, regel ' + (i + 1) + ', kolom ' + kop[idx.open] + ': geen bedrag');
    uit.push({ datum: datum, bedrag: bedrag, open: open, betaald: idx.betaald >= 0 ? ctx.datumUitExport(cel('betaald')) : '' });
  }
  return uit;
}
function leesXps(ctx, tekst) {
  if (!tekst.trim()) throw fout('xps: het bestand is leeg.');
  var rijen = ctx.Utilities.parseCsv(tekst, scheidingsteken(tekst));
  if (rijen.length < 2) throw fout('xps: geen regels onder de kopregel.');
  return rijen;
}
function eindeMaand(d) { return laatsteDag(+d.slice(0, 4), +d.slice(5, 7)); }
// Gefactureerd in centen tussen van en tot: Exact op factuurdatum, Athena op de verzenddatum van de termijnen (alle projecten)
function exactWijkt(L, r) {
  var ctx = L.ctx, d = r.per.peildatum, tol = tolerantieVan(L, r.id), vergelijk = function (e, a) { return !binnen(a, e, tol.pct ? tol : { pct: 0, abs: tol.abs * 100 }); };
  if (r.id === 'openstaand') {
    var eO = 0, aO = 0;
    L.exact.forEach(function (x) { if (x.datum > d) return; eO += x.open !== null ? x.open : (x.betaald && x.betaald <= d ? 0 : x.bedrag); });
    ctx.lees('Facturen').forEach(function (f) { var v = ctx.verzondenVan(f), b = ctx.betaaldVan(f); if (v && v.datum <= d && !(b && b.datum <= d)) aO += ctx.centen(f.bedrag); });
    return vergelijk(eO, aO);
  }
  var van = sjVan(L, d).slice(0, 4) + '-08-01', tot = eindeMaand(d), e = 0, a = 0;
  L.exact.forEach(function (x) { if (x.datum >= van && x.datum <= tot) e += x.bedrag; });
  ctx.lees('Facturen').forEach(function (f) { var v = ctx.verzondenVan(f); if (v && v.datum >= van && v.datum <= tot) a += ctx.centen(f.bedrag); });
  return vergelijk(e, a);
}
// Gewerkte uren per maand (en per project): XPS via urenUitRijen (dezelfde koppeling en statussen als de urenimport), Athena uit TalentUren en het archief
function xpsWijkt(L, r) {
  var ctx = L.ctx, d = r.per.peildatum, sj = sjVan(L, d), wkTot = ctx.isoWeekStr(ctx.parseDatum(d)), maanden = Array.prototype.filter.call(ctx.schooljaarMaanden(sj), function (m) { return m <= d.slice(0, 7); });
  var inSj = {}; ctx.lees('Trajecten').forEach(function (t) { if (t.schooljaar === sj) inSj[t.id] = true; });
  var A = {}, X = {}, bij = function (o, m, t, u) { o[m + '|*'] = (o[m + '|*'] || 0) + u; if (inSj[t]) o[m + '|' + t] = (o[m + '|' + t] || 0) + u; };
  ctx.lees('TalentUren').concat(ctx.lees('TalentUren_archief')).forEach(function (u) {
    var w = String(u.week || ''); if (!w || w > wkTot) return; var m = ctx.maandVan(ctx.maandagVanWeek(w)); if (maanden.indexOf(m) >= 0) bij(A, m, String(u.trajectId || ''), Number(u.uren) || 0);
  });
  var talenten = ctx.lees('Talenten'), trajecten = ctx.lees('Trajecten'), statussen = ctx.xpsStatussen();
  maanden.forEach(function (m) {
    // tot en met de zondag van de laatste week die in deze maand begint (zo telt elke week van de maand helemaal mee), nooit na de peildatum
    var vandaag = kleinste(ctx.plusDagenVan(ctx.datumStr(ctx.maandagVan(eindeMaand(m + '-01'))), 6), d), uit;
    try { uit = eenmaal(L, 'xps|' + vandaag, function () { return ctx.urenUitRijen(L.xps, talenten, { vandaag: vandaag, trajecten: trajecten, statussen: statussen }); }); }
    catch (e) { throw fout('xps, regel 1: ' + (e && e.xpsExport ? e.message : 'de export is niet te lezen.')); }
    uit.regels.forEach(function (g) { if (g.week <= wkTot && ctx.maandVan(ctx.maandagVanWeek(g.week)) === m) bij(X, m, String(g.trajectId || ''), Number(g.uren) || 0); });
  });
  var sleutels = {}; Object.keys(A).concat(Object.keys(X)).forEach(function (k) { if (r.id === 'geleverd' ? !/\|\*$/.test(k) : /\|\*$/.test(k)) sleutels[k] = true; });
  return Object.keys(sleutels).some(function (k) { return Math.abs((A[k] || 0) - (X[k] || 0)) > 0.01; });
}
var BRON = { gefactureerd: 'exact', nogTeFactureren: 'exact', openstaand: 'exact', geleverd: 'xps', urenVorigeJaren: 'xps' };
function bronWijkt(L, r) {
  var b = BRON[r.id]; if (!b || r.per.soort !== 'stand') return false;
  if (b === 'exact') return !!L.exact && exactWijkt(L, r);
  return !!L.xps && xpsWijkt(L, r);
}

/* ----- de vergelijking ----- */

function beoordeel(L, r) {
  var a = athenaWaarde(L, r);
  if (a.geblokkeerd) return 'geblokkeerd';
  var tol = tolerantieVan(L, r.id);
  if (binnen(a.waarde, r.waarde, tol)) return 'geslaagd';
  var oud = OUDE_DEFINITIES[r.id] ? OUDE_DEFINITIES[r.id](L, r) : [];
  if (oud.some(function (v) { return binnen(v, r.waarde, tol); })) return 'gezakt (definitie)';
  if (invoerRaakt(L, r)) return 'gezakt (invoer)';
  if (bronWijkt(L, r)) return 'gezakt (bron)';
  return 'gezakt (onverklaard)';
}
// Laadt de stand en de exports; geeft L = { ctx, peildatum, cache, exact, xps }
function laad(opt) {
  var exportTekst = leesBestand('export', opt.export), refTekst = opt.referentie ? leesBestand('referentie', opt.referentie) : '';
  var exactTekst = opt.exact ? leesBestand('exact', opt.exact) : null, xpsTekst = opt.xps ? leesBestand('xps', opt.xps) : null;
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
  var L = { ctx: ctx, peildatum: P, cache: {}, exact: exactTekst === null ? null : leesExact(ctx, exactTekst), xps: xpsTekst === null ? null : leesXps(ctx, xpsTekst), refTekst: refTekst };
  return L;
}
// Geeft { uit: [regel], fouten: [tekst], exit }
function vergelijk(opt) {
  var L;
  try { L = laad(opt); } catch (e) { if (e instanceof Invoerfout) return { uit: [], fouten: [e.message], exit: 1 }; throw e; }
  var ref;
  try { ref = leesReferentie(L.ctx, L.refTekst, L.peildatum); } catch (e) { if (e instanceof Invoerfout) return { uit: [], fouten: [e.message], exit: 1 }; throw e; }
  if (ref.fouten.length) return { uit: [], fouten: ref.fouten, exit: 1 };
  var uit = [], onverklaard = 0;
  try {
    ref.regels.forEach(function (r) {
      var c = beoordeel(L, r); if (c === 'gezakt (onverklaard)') onverklaard++;
      uit.push(r.token + ' ' + r.periode + (r.uitsplitsing ? '/' + r.uitsplitsing : '') + ' ' + c);
    });
  } catch (e) { if (e instanceof Invoerfout) return { uit: [], fouten: [e.message], exit: 1 }; throw e; }
  return { uit: uit, fouten: [], exit: onverklaard ? 1 : 0 };
}
function main() {
  var u;
  try { u = vergelijk(argumenten(process.argv.slice(2))); }
  catch (e) {
    if (e instanceof Invoerfout) u = { uit: [], fouten: [e.message], exit: 1 };
    else {  // geen melding met inhoud: alleen de soort fout en de plek in de code
      var plek = String((e && e.stack) || '').split('\n').filter(function (l) { return /\.js:\d+/.test(l); })[0] || '';
      u = { uit: [], fouten: ['Onverwachte fout in het harnas (' + ((e && e.name) || 'fout') + ')' + (plek ? ' ' + plek.trim().replace(/^at\s+/, 'bij ').replace(/\(.*[\\\/]/, '(') : '') + '.'], exit: 1 };
    }
  }
  u.uit.forEach(function (l) { process.stdout.write(l + '\n'); });
  u.fouten.forEach(function (l) { process.stderr.write(l + '\n'); });
  process.exitCode = u.exit;
}
module.exports = { vergelijk: vergelijk, laad: laad, leesReferentie: leesReferentie, athenaWaarde: athenaWaarde, periodeUit: periodeUit, binnenRepo: binnenRepo, OUDE_DEFINITIES: OUDE_DEFINITIES, RAAKT: RAAKT };
if (require.main === module) main();
