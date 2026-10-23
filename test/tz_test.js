// v7.2: tijdzone- en zomertijdtest. Draait test/node_rooktest.js en test/parser_test.js als kindproces onder vier tijdzones
// (Europe/Amsterdam, Pacific/Auckland, America/Los_Angeles, UTC) met de echte klok en met een vaste "vandaag" (via test/tz_klok.js):
// 2026-03-29 (begin zomertijd EU), 2026-10-25 (einde), 2026-12-31, 2027-01-01, plus randen om middernacht rond de EU-wissel en de
// wisseldagen van Los Angeles (2026-11-01) en Auckland (2026-04-05). Daarnaast reproducties van datumvalkuilen in Code.gs onder een
// vaste klok en een statische scan van backend/Code.gs en index.html (new Date(tekst), getTime()-rekenen over 86400000 zonder
// middag-normalisatie, toISOString, dd-MM-yyyy-parsing, vergelijkingen van datumteksten met verschillende lengtes).
// Gebruik: node test/tz_test.js [--snel]   → "ALLES GOED" (exitcode 0) als alle combinaties groen zijn, anders "FOUTEN: n" (exitcode 1).
// --snel: alleen de vier tijdzones × (echte klok + de vier gevraagde datums); zonder vlag ook de randen en de LA/NZ-wisseldagen.
// Reproducties en scan tellen niet mee in de exitcode: ze worden gemeld als "info" en staan in test/shots/robuust/tz.json.
// Intern: `node test/tz_test.js --reproductie` draait (als kind, onder TZ en VASTE_DATUM) de reproducties en drukt één JSON-regel.
var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var R = path.join(__dirname, '..'), KLOK = path.join(__dirname, 'tz_klok.js'), UIT = path.join(R, 'test', 'shots', 'robuust');
var SNEL = process.argv.indexOf('--snel') >= 0;

/* ===================== kindmodus: reproducties onder een vaste klok ===================== */
if (process.argv.indexOf('--reproductie') >= 0) {
  var ctxR = { console: { log: function () {} } }; ctxR.globalThis = ctxR; vm.createContext(ctxR);
  vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8'), ctxR, { filename: 'demo.js' });
  var DAG = 86400000, uit = [];
  var nuC = vm.runInContext('new Date()', ctxR), nuStr = ctxR.datumTijdStr(nuC);
  function rep(wat, bestand, regel, gekregen, verwacht) { uit.push({ wat: wat, bestand: bestand, regel: regel, tz: process.env.TZ || '', klok: nuStr, gekregen: String(gekregen), verwacht: String(verwacht), bug: String(gekregen) !== String(verwacht) }); }
  // Verwachtingen via kalenderrekenen in de context (componenten, dus zomertijdbestendig)
  function kalenderPlus(n) { var d = vm.runInContext('new Date()', ctxR); return ctxR.datumStr(vm.runInContext('(function (y, m, d) { return new Date(y, m, d, 12); })', ctxR)(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
  function kalenderVerschil(iso) { var p = iso.split('-').map(Number), d = nuC, a = vm.runInContext('(function (y, m, d) { return new Date(y, m, d, 12); })', ctxR); return Math.round((a(p[0], p[1] - 1, p[2]) - a(d.getFullYear(), d.getMonth(), d.getDate())) / DAG); }
  var morgen = kalenderPlus(1), overmorgen = kalenderPlus(2), gisteren = kalenderPlus(-1);
  rep('plusDagen(1) → datumStr', 'backend/Code.gs', 4696, ctxR.datumStr(ctxR.plusDagen(1)), morgen);
  rep('plusDagen(-1) → datumStr', 'backend/Code.gs', 4696, ctxR.datumStr(ctxR.plusDagen(-1)), gisteren);
  rep('dagenTot(overmorgen)', 'backend/Code.gs', 4704, ctxR.dagenTot(overmorgen), kalenderVerschil(overmorgen));
  rep('dagenTot(morgen)', 'backend/Code.gs', 4704, ctxR.dagenTot(morgen), kalenderVerschil(morgen));
  rep('dagenSinds(gisteren)', 'backend/Code.gs', 4703, ctxR.dagenSinds(gisteren), -kalenderVerschil(gisteren));
  rep('nuLokaal(24*60).slice(0,10) (de oude morgenNegen vóór v7.2, nagebootst; sinds v7.2 morgenStr() + T09:00 met kalenderdagen)', 'index.html', 2453,ctxR.datumStr(vm.runInContext('new Date(Date.now() + 1440 * 60000)', ctxR)), morgen);
  rep('morgenStr() + T09:00 (morgenNegen sinds v7.2, nagebootst met componenten en 12:00)', 'index.html', 2453, ctxR.datumStr(vm.runInContext('(function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 12); })()', ctxR)), morgen);
  rep('apiHome agenda-eind: begin 00:00 + 7*86400000 (uur)', 'backend/Code.gs', 1622, (function () { var b = vm.runInContext('(function () { var b = new Date(); b.setHours(0, 0, 0, 0); return b; })()', ctxR); return ctxR.datumTijdStr(vm.runInContext('(function (t) { return new Date(t); })', ctxR)(b.getTime() + 7 * DAG)); })(), kalenderPlus(7) + ' 00:00');
  // Onafhankelijk van de klok, alleen van TZ: zes weken na een startdatum over de wissel naar wintertijd heen
  rep('geplaatst: start 2026-09-21 + 42*86400000 → deadline', 'backend/Code.gs', 2823, ctxR.datumStr(vm.runInContext('(function (t) { return new Date(t); })', ctxR)(ctxR.parseDatum('2026-09-21').getTime() + 42 * DAG)), '2026-11-02');
  rep('apiAgenda eind = parseDatum(2026-10-25) + 86400000', 'backend/Code.gs', 1666, ctxR.datumTijdStr(vm.runInContext('(function (t) { return new Date(t); })', ctxR)(ctxR.parseDatum('2026-10-25').getTime() + DAG)), '2026-10-26 00:00');
  rep('trackstap: start 2026-10-23 + 2 dagen*86400000 + 3600000', 'backend/Code.gs', 1504, ctxR.datumStr(vm.runInContext('(function (t) { return new Date(t); })', ctxR)(ctxR.parseDatum('2026-10-23').getTime() + 2 * DAG + 3600000)), '2026-10-25');
  rep('volgendeDatum dag over 2026-03-28', 'backend/Code.gs', 1453, ctxR.datumStr(ctxR.volgendeDatum(ctxR.parseDatum('2026-03-28'), { eenheid: 'dag', interval: 1 })), '2026-03-29');
  rep('dagenTussen(2026-10-20, 2026-10-27)', 'backend/Code.gs', 2935, ctxR.dagenTussen('2026-10-20', '2026-10-27'), 7);
  rep('maandagVanWeek(2026-W44)', 'backend/Code.gs', 4521, ctxR.maandagVanWeek('2026-W44'), '2026-10-26');
  process.stdout.write(JSON.stringify(uit) + '\n');
  process.exit(0);
}

/* ===================== hoofdmodus ===================== */
var T0 = Date.now(), fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function info(wat) { console.log('info ' + wat); }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

var TIJDZONES = ['Europe/Amsterdam', 'Pacific/Auckland', 'America/Los_Angeles', 'UTC'];
var KLOKKEN = [{ naam: 'echt', vast: '' },
  { naam: '2026-03-29T10:00', vast: '2026-03-29T10:00', reden: 'begin zomertijd EU' }, { naam: '2026-10-25T10:00', vast: '2026-10-25T10:00', reden: 'einde zomertijd EU' },
  { naam: '2026-12-31T10:00', vast: '2026-12-31T10:00', reden: 'jaareinde' }, { naam: '2027-01-01T10:00', vast: '2027-01-01T10:00', reden: 'nieuwjaar (ISO-week 53/1)' }];
var EXTRA = [{ naam: '2026-03-28T23:30', vast: '2026-03-28T23:30', reden: 'uur vóór de dag van de EU-wissel' }, { naam: '2026-03-29T00:30', vast: '2026-03-29T00:30', reden: 'uur na middernacht op de EU-wisseldag' },
  { naam: '2026-10-24T23:30', vast: '2026-10-24T23:30', reden: 'uur vóór de dag van de EU-wissel (einde)' }, { naam: '2026-10-25T00:30', vast: '2026-10-25T00:30', reden: 'uur na middernacht op de EU-wisseldag (einde)' },
  { naam: '2026-11-01T10:00', vast: '2026-11-01T10:00', reden: 'einde zomertijd Los Angeles' }, { naam: '2026-04-05T10:00', vast: '2026-04-05T10:00', reden: 'einde zomertijd Auckland' }];
if (!SNEL) KLOKKEN = KLOKKEN.concat(EXTRA);
else info('--snel: de randen om middernacht en de wisseldagen van Los Angeles/Auckland worden overgeslagen');

function kind(script, tz, vast, extraArgs) {
  var env = {}; Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
  env.TZ = tz; if (vast) env.VASTE_DATUM = vast; else delete env.VASTE_DATUM;
  var t = Date.now(), r = cp.spawnSync(process.execPath, ['-r', KLOK, script].concat(extraArgs || []), { cwd: R, env: env, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  var out = String(r.stdout || '') + String(r.stderr || '');
  return { exit: r.status === null ? (r.signal || 'timeout') : r.status, duur_s: Math.round((Date.now() - t) / 100) / 10, uitvoer: out, fouten: out.split('\n').filter(function (l) { return /^FOUT/.test(l); }).slice(0, 25), laatste: out.trim().split('\n').slice(-1)[0] || '' };
}

var combinaties = [];
[['node_rooktest.js', 'rooktest'], ['parser_test.js', 'parser']].forEach(function (s) {
  TIJDZONES.forEach(function (tz) {
    KLOKKEN.forEach(function (k) {
      var r = kind(path.join('test', s[0]), tz, k.vast);
      var ok = r.exit === 0 && /ALLES GOED/.test(r.laatste) && !r.fouten.length;
      combinaties.push({ test: s[1], tz: tz, klok: k.naam, reden: k.reden || 'echte klok', exit: r.exit, ok: ok, duur_s: r.duur_s, fouten: r.fouten, laatste: r.laatste });
      eis(ok, pad(s[1], 9) + pad('TZ=' + tz, 24) + pad('klok=' + k.naam, 23) + 'exit=' + r.exit + '  ' + r.duur_s + 's' + (ok ? '' : '  → ' + r.laatste.slice(0, 120)));
      if (!ok) r.fouten.forEach(function (l) { console.log('       ' + l.slice(0, 220)); });
      if (!ok && !r.fouten.length) console.log('       ' + r.uitvoer.trim().split('\n').slice(-6).join('\n       ').slice(0, 1500));
    });
  });
});

/* ===================== reproducties van valkuilen (tellen niet mee in de exitcode) ===================== */
var reproducties = [];
[['Europe/Amsterdam', '2026-03-28T23:30'], ['Europe/Amsterdam', '2026-03-29T00:30'], ['Europe/Amsterdam', '2026-10-24T00:30'], ['Europe/Amsterdam', '2026-10-24T23:30'], ['Europe/Amsterdam', '2026-03-30T00:30'], ['Europe/Amsterdam', '2026-10-25T10:00']].forEach(function (c) {
  var r = kind(path.join('test', 'tz_test.js'), c[0], c[1], ['--reproductie']);
  var lijst = []; try { lijst = JSON.parse(r.uitvoer.trim().split('\n').slice(-1)[0]); } catch (e) { info('reproductie ' + c[0] + ' ' + c[1] + ' leverde geen JSON: ' + r.laatste.slice(0, 200)); }
  lijst.forEach(function (x) { reproducties.push(x); });
});
var bugs = reproducties.filter(function (x) { return x.bug; });
var gezien = {};
bugs.forEach(function (x) { var k = x.bestand + ':' + x.regel + ' ' + x.wat; if (!gezien[k]) { gezien[k] = true; info('BUG  ' + k + '  (klok ' + x.klok + ' ' + x.tz + ': ' + x.gekregen + ', verwacht ' + x.verwacht + ')'); } });
info('reproducties: ' + reproducties.length + ' metingen, ' + bugs.length + ' afwijkend op ' + Object.keys(gezien).length + ' vindplaatsen (tellen niet mee in de exitcode; zie tz.json)');

/* ===================== statische scan ===================== */
function argTekst(src, i) {  // i wijst op '(' → de tekst tussen de haakjes, gebalanceerd en met respect voor strings
  var d = 0, j = i;
  for (; j < src.length; j++) {
    var c = src[j];
    if (c === '"' || c === "'") { var q = c; j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } continue; }
    if (c === '(') d++; else if (c === ')') { d--; if (d === 0) break; }
  }
  return src.slice(i + 1, j);
}
function zonderNewDate(l) { var i; while ((i = l.indexOf('new Date(')) >= 0) { var a = argTekst(l, i + 8); l = l.slice(0, i) + 'DATUM' + l.slice(i + 9 + a.length + 1); } return l; }
function topKomma(a) { var d = 0; for (var i = 0; i < a.length; i++) { var c = a[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && d === 0) return true; } return false; }
// Triage per vindplaats (op tekstfragment, niet op regelnummer): afgedekt door welke hulpfunctie of waarom het geen kwaad kan
var TRIAGE = [
  ['backend/Code.gs', "isoIn(s) { if (!s) return ''; var d = new Date(s)", true, 'alleen ISO-datumtijd met tijdzone (Capsule createdAt/completedAt/entryAt/lastContactedAt)', "new Date('yyyy-MM-dd') zou als UTC gelezen worden; de aanroepers geven ISO met Z, dus hier geen dagverschuiving"],
  ['backend/Code.gs', 'grens = new Date(nuD.getTime() - 86400000)', true, 'n.v.t.: venster van 24 uur, geen kalenderdatum', 'nachtelijke review: "afgerond in de laatste 24 uur"'],
  ['backend/Code.gs', 'return new Date(b.getTime() + n * 86400000)', true, 'middag (b = middag(basis))', 'volgendeDatum: 12:00 ± 1 uur blijft dezelfde dag'],
  ['backend/Code.gs', 'return new Date(b.getTime() + n * 7 * 86400000)', true, 'middag (b = middag(basis))', ''],
  ['backend/Code.gs', 'maandag = new Date(b.getTime() - (iso - 1) * 86400000)', true, 'middag (b = middag(basis))', ''],
  ['backend/Code.gs', 'return new Date(maandag.getTime() + (h.dagen[i] - 1) * 86400000)', true, 'middag (maandag komt uit b = middag(basis))', ''],
  ['backend/Code.gs', 'return new Date(maandag.getTime() + (n * 7 + h.dagen[0] - 1) * 86400000)', true, 'middag (maandag komt uit b = middag(basis))', ''],
  ['backend/Code.gs', '(Number(s.dagenNaStart) || 0) * 86400000 + 3600000', true, 'ad hoc: + 3600000 (één uur marge op 00:00)', 'trackstappen: 00:00 + n dagen wordt rond de wissel 23:00 of 01:00; de extra uur houdt de datum goed. middag() zou het bedoelde zichtbaar maken'],
  ['backend/Code.gs', 'agenda: agendaItems(begin, new Date(begin.getTime() + 7 * 86400000))', false, '', 'begin = 00:00 (setHours); het venster eindigt op dag 7 om 23:00 (wintertijd in) of 01:00 (zomertijd in): een afspraak tussen 23:00 en 24:00 op dag 7 valt weg, of een afspraak 00:00–01:00 op dag 8 komt erbij'],
  ['backend/Code.gs', 'var eind = new Date(b.getTime() + 86400000), vanS', false, '', 'apiAgenda: tot (00:00) + 24 uur wordt 23:00 op de laatste dag als de zomertijd in die periode eindigt → Google-afspraken 23:00–24:00 op `tot` vallen weg; andersom komt 00:00–01:00 van de dag erna erbij'],
  ['backend/Code.gs', 'return agendaItems(van, new Date(tot.getTime() + 86400000))', false, '', 'mijn_agenda (assistent): zelfde als apiAgenda'],
  ['backend/Code.gs', 'ma = datumStr(new Date(d.getTime() - (isoDag(d) - 1) * 86400000))', true, 'middag (d = middag(new Date()))', 'afgerondDezeWeek'],
  ['backend/Code.gs', 'd = new Date(d.getTime() - 86400000);', true, 'middag (d = middag(new Date()))', 'werkdagenStreak: stapt per 24 uur vanaf 12:00; na een wissel 11:00/13:00, nog steeds dezelfde dag'],
  ['backend/Code.gs', '(b - a) / 86400000 > 62', true, 'n.v.t.: drempel (een uur verschil verandert de uitkomst niet)', ''],
  ['backend/Code.gs', '(tot - van) / 86400000 > 31', true, 'n.v.t.: drempel', ''],
  ['backend/Code.gs', 'Math.round((parseDatum(B.tot) - parseDatum(B.van)) / 86400000)', true, 'Math.round + parseDatum (beide 00:00)', 'vergelijkBereik'],
  ['backend/Code.gs', '1 + Math.round(((t - w1) / 86400000', true, 'Math.round', 'isoWeek'],
  ['backend/Code.gs', 'grens = datumStr(new Date(Date.now() - 365 * 86400000))', false, '', 'archiveer: Date.now() − 365 dagen verschuift rond de wissel een uur; alleen tussen 23:00 en 01:00 op een wisseldag een dag ernaast. Trigger draait om 03:00; apiArchiveer (Beheer) kan op elk moment'],
  ['backend/Code.gs', 'grens = isoWeekStr(new Date(Date.now() - 26 * 7 * 86400000))', false, '', 'archiveerUren: zelfde uurdrift (weekgrens); gevolg hoogstens één week eerder/later archiveren'],
  ['backend/Code.gs', 'eerste = new Date(startD.getTime() + 42 * 86400000)', false, '', 'kandidaat geplaatst: startD = parseDatum(k.start) = 00:00; ligt de wissel naar wintertijd in de zes weken, dan is eerste 23:00 de dag ervóór en komt de beoordelingstaak een dag te vroeg (start 2026-09-21 → 2026-11-01 i.p.v. 2026-11-02). De herhaling (elk kwartaal) start daarna wel via middag()'],
  ['backend/Code.gs', 'function dagenTussen(a, b)', true, 'Math.round + parseDatum', ''],
  ['backend/Code.gs', 'tot: datumTijdStr(new Date(Date.now() + 90 * 86400000))', true, 'n.v.t.: geldigheidsduur van een token (datumtijd), een uur speelt geen rol', ''],
  ['backend/Code.gs', 'String(t.portaalTokenTot) > datumTijdStr(new Date(Date.now() + 7 * 86400000))', true, 'n.v.t.: geldigheidsduur (datumtijd)', ''],
  ['backend/Code.gs', 'return { token: nieuwToken(), tot: datumTijdStr(new Date(Date.now() + 90 * 86400000)) };', true, 'n.v.t.: geldigheidsduur (datumtijd)', ''],
  ['backend/Code.gs', 'grens = isoWeekStr(new Date(Date.now() - 90 * 86400000))', false, '', 'talentrapport uren: uurdrift op een weekgrens (hoogstens een week verschil rond middernacht op een wisseldag)'],
  ['backend/Code.gs', 'grens = datumTijdStr(new Date(Date.now() - dagen * 86400000)), herhaal', true, 'n.v.t.: datumtijd-vergelijking met nu()-waarden (beschikbaarheidBevestigd, laatstePeiling)', 'peilingRun'],
  ['backend/Code.gs', 'grens = datumStr(new Date(Date.now() - 182 * 86400000))', false, '', 'slapendRun: uurdrift; trigger 06:30, dus in de praktijk alleen via apiTalentRunNu rond middernacht een dag ernaast'],
  ['backend/Code.gs', 'jan4 = new Date(Number(m[1]), 0, 4, 12), ma = new Date(jan4.getTime()', true, '12:00 (jan4 om twaalf uur)', 'maandagVanWeek'],
  ['backend/Code.gs', 'return datumStr(new Date(ma.getTime() + (Number(m[2]) - 1) * 7 * 86400000))', true, '12:00 (ma komt uit jan4 om twaalf uur)', 'maandagVanWeek'],
  ['backend/Code.gs', 'function plusDagen(n) { return new Date(Date.now() + n * 86400000); }', false, '', 'plusDagen: Date.now() ± n×24 uur; tussen 23:00 en 24:00 vóór een wisseldag en 00:00–01:00 op een wisseldag geeft datumStr(plusDagen(n)) een dag ernaast (zie reproducties). 15 aanroepers: seed, nachtelijkeReview (dag = plusDagen(1) na 15:00), taken bij gewonnen/geplaatst/taskforce, apiAgenda-sync (−7/+14), schoolpagina (−60)'],
  ['backend/Code.gs', 'function dagenSinds(s) { var d = parseDatum(s); return d ? Math.floor', false, '', 'Math.floor van verstreken ms vanaf 00:00: de dag na het begin van de zomertijd geeft 00:00–01:00 een dag te weinig (23 uur verstreken → 0). Gebruikt voor dagenStil, dagenInStatus, "wacht al n dagen"'],
  ['backend/Code.gs', 'function dagenTot(s) { var d = parseDatum(s); return d ? Math.ceil', false, '', 'Math.ceil van resterende ms tot 00:00: 23:00–24:00 op 2026-03-28 geeft voor 2026-03-30 1 i.p.v. 2 (23,5 uur). Bepaalt `over` van taken (vandaag/morgen/te laat) en de nachtelijke review (deadline ≤ 3, start ≤ 7)'],
  ['backend/Code.gs', 'var dagen = Math.floor((Date.now() - laatste.getDate().getTime()) / 86400000);', false, '', 'onbeantwoorde mails: na het begin van de zomertijd telt een mail van drie dagen geleden (71 uur) als 2 dagen; alleen de tekst "n dagen" en de drempel minDagen'],
  ['backend/Code.gs', 'if (m.getDate().getTime() < Date.now() - 14 * 86400000) return;', true, 'n.v.t.: venster van 14 dagen', 'crmSync'],
  ['backend/Code.gs', 'new Date(start.getTime() + duur * 60000)', true, 'n.v.t.: duur in minuten', 'afspraak eind'],
  ['index.html', "'T12:00:00'", true, "'T12:00:00' → lokale middag (ISO-datumtijd zonder zone is lokaal in ES2015+; iOS ≥ 14)", 'dagenTotLokaal, slepen naar een dag, agenda-dagkop'],
  ['index.html', 'new Date(R.van)', true, 'kopie van een Date (tlBereik maakt 12:00)', 'projectTijdlijn'],
  ['index.html', 'e.getTime() + TL_DAG', true, 'tlDatum (12:00)', 'projectTijdlijn: s en e komen uit tlDatum met 12:00'],
  ['index.html', 's.getTime() + delta * TL_DAG', true, 'tlDatum (12:00)', ''],
  ['index.html', 'e.getTime() + delta * TL_DAG', true, 'tlDatum (12:00)', ''],
  ['index.html', 'Math.round((R.tot - R.van) / TL_DAG)', true, 'Math.round', ''],
  ['index.html', 'var TL_DAG = 864e5;', true, 'n.v.t.: definitie van de constante', ''],
  ['index.html', 'Math.round((b - a) / 86400000)', true, "Math.round + 'T12:00:00'", 'dagenTotLokaal'],
  ['index.html', 'new Date(Date.now() + (plusMin || 0) * 60000)', false, '', 'nuLokaal(plusMin): 23:00–24:00 vóór een wisseldag en 00:00–01:00 op een wisseldag een dag ernaast. v7.2: morgenNegen (standaard voor "Afspraak plannen" en de taskforcemeeting) rekent nu via morgenStr met kalenderdagen; de enige overgebleven aanroep met plusMin is de ondergrens van het periodefilter op de tijdlijn (hoogstens één dag ruimer of krapper rond middernacht op een wisseldag). nuLokaal() zonder plusMin is veilig']
];
function triage(bestand, tekst) { for (var i = 0; i < TRIAGE.length; i++) if (TRIAGE[i][0] === bestand && tekst.indexOf(TRIAGE[i][1]) >= 0) return TRIAGE[i]; return null; }
function regelNr(src, i) { return src.slice(0, i).split('\n').length; }
var vindplaatsen = [], vergelijkingen = [], ddmm = [], iso = [];
['backend/Code.gs', 'index.html'].forEach(function (f) {
  var src = fs.readFileSync(path.join(R, f), 'utf8'), lijnen = src.split('\n'), re = /new Date\(/g, m;
  while ((m = re.exec(src))) {
    var a = argTekst(src, m.index + 8).replace(/\s+/g, ' ').trim(), nr = regelNr(src, m.index), lijn = lijnen[nr - 1], cat, afgedekt, door = '', toel = '';
    if (a === '') { cat = 'nu'; afgedekt = true; door = 'klok (TZ: Apps Script = scripttijdzone; server/code.js zet TZ=Europe/Amsterdam)'; }
    else if (/86400000|864e5|TL_DAG/.test(a) || /\.getTime\(\)\s*[-+]/.test(a) || /^Date\.now\(\)\s*[-+]/.test(a)) { cat = 'ms-rekenen'; afgedekt = /middag\(/.test(lijn); door = afgedekt ? 'middag' : ''; }
    else if (/60000\)?$/.test(a)) { cat = 'ms-rekenen (minuten)'; afgedekt = true; door = 'n.v.t.: minuten'; }
    else if (topKomma(a)) { cat = 'componenten'; afgedekt = true; door = /,\s*12\s*$/.test(a) ? 'componenten, 12:00' : 'componenten (lokaal)'; }
    else if (/'T12:00:00'/.test(a)) { cat = 'tekst (ISO lokaal)'; afgedekt = true; door = "'T12:00:00' (lokale middag)"; }
    else { cat = 'tekst/variabele'; afgedekt = false; door = ''; toel = 'controleer: new Date(tekst) leest yyyy-MM-dd als UTC'; }
    var t = triage(f, 'new Date(' + a + ')') || ((cat === 'ms-rekenen' || cat === 'tekst/variabele') ? triage(f, lijn) : null);  // een new Date() op dezelfde regel erft de triage van de regel niet
    if (t) { afgedekt = t[2]; door = t[3] || door; toel = t[4] || toel; }
    vindplaatsen.push({ bestand: f, regel: nr, soort: 'new Date', categorie: cat, code: ('new Date(' + a + ')').slice(0, 160), afgedekt: afgedekt, door: door, toelichting: toel });
  }
  lijnen.forEach(function (l, i) {
    var nr = i + 1, kort = l.trim().slice(0, 200);
    if (/86400000|864e5|24 \* 60 \* 60 \* 1000/.test(zonderNewDate(l))) {  // rekenen buiten een new Date(...); die staan al in de lijst
      var afgedekt = /Math\.round\(/.test(l) || /middag\(/.test(l), door = /Math\.round\(/.test(l) ? 'Math.round' : /middag\(/.test(l) ? 'middag' : '', toel = '';
      if (/Math\.(floor|ceil)\(/.test(l)) { afgedekt = false; door = ''; toel = 'floor/ceil van een verschil in ms: een uur zomertijd kan een dag verschuiven'; }
      var t = triage(f, l); if (t) { afgedekt = t[2]; door = t[3] || door; toel = t[4] || toel; }
      vindplaatsen.push({ bestand: f, regel: nr, soort: '86400000', categorie: 'ms-rekenen', code: kort, afgedekt: afgedekt, door: door, toelichting: toel });
    }
    if (/toISOString|toJSON\(|toLocaleDateString|getUTC|setUTC|Date\.UTC|Date\.parse/.test(l)) iso.push({ bestand: f, regel: nr, code: kort });
    if (/\\d\{1,2\}\)-\(\\d\{1,2\}\)-\(\\d\{4\}|\\d\{2\}\)-\(\\d\{2\}\)-\(\\d\{4\}|dd-MM-yyyy|'\d{2}-\d{2}-\d{4}'/.test(l)) ddmm.push({ bestand: f, regel: nr, code: kort, veilig: /new Date\(Number\(m\[3\]\), Number\(m\[2\]\) - 1, Number\(m\[1\]\)/.test(l), door: /Number\(m\[3\]\)/.test(l) ? 'componenten (parseDatumNl, 12:00)' : '' });
  });
});
// Vergelijkingen van datumteksten: beide kanten moeten dezelfde lengte hebben ('yyyy-MM-dd' 10 of 'yyyy-MM-dd HH:mm' 16); anders wint de langere bij een gelijke dag
var VERGELIJK = [
  ['backend/Code.gs', 'gepland: String(a.datum) > nu()', 'ok', 'a.datum is altijd 16 tekens (datumTijdIn/nu() bij opslaan, isoIn bij import)'],
  ['backend/Code.gs', "var d = String(a.datum).slice(0, 10); if (!d || d > vandaag) return;", 'ok', 'slice(0, 10) tegen datumStr'],
  ['backend/Code.gs', 'while (datumStr(d) < vandaag', 'ok', 'datumStr tegen datumStr; h.tot is yyyy-MM-dd (herhalingIn)'],
  ['backend/Code.gs', "return String(a.datum) <= nu() && zicht(a);", 'ok', '16 tegen 16'],
  ['backend/Code.gs', "(!van || d >= van) && (!tot || d <= tot) && String(a.datum) <= nu()", 'ok', 'd = slice(0, 10) tegen van/tot (10); a.datum 16 tegen nu() 16'],
  ['backend/Code.gs', 'var isOud = function (a) { var d = String(a.datum).slice(0, 10); return !!d && d < grens; };', 'ok', 'slice(0, 10) tegen datumStr'],
  ['backend/Code.gs', 'String(u.week) < grens', 'ok', 'yyyy-Www tegen isoWeekStr'],
  ['backend/Code.gs', "inP = function (s) { var d = String(s || '').slice(0, 10); return !!d && d >= van && d <= tot; }", 'ok', 'slice(0, 10)'],
  ['backend/Code.gs', 'String(f.datum).slice(0, 10) > vandaag', 'ok', 'slice(0, 10) tegen datumStr'],
  ['backend/Code.gs', 'oud.datum < vandaag', 'ok', 'Facturen.datum wordt met datumIn opgeslagen (10) tegen datumStr (10)'],
  ['backend/Code.gs', "String(t.portaalTokenTot || '') >= nu()", 'ok', '16 tegen 16 (datumTijdStr)'],
  ['backend/Code.gs', 'o.geldigTot < datumStr(new Date())', 'ok', 'geldigTot via datumIn (10)'],
  ['backend/Code.gs', 'String(t.beschikbaarheidBevestigd) < grens) && (!t.laatstePeiling || String(t.laatstePeiling) < herhaal)', 'ok', 'beide via nu() (16) tegen datumTijdStr (16)'],
  ['backend/Code.gs', "String(k.eind || k.statusSinds || '').slice(0, 10) >= grens", 'ok', 'slice(0, 10)'],
  ['backend/Code.gs', 'String(t.bewarenTot).slice(0, 10) >= vandaag', 'ok', 'slice(0, 10)'],
  ['backend/Code.gs', 'String(t.portaalTokenTot) < nu()', 'ok', '16 tegen 16'],
  ['backend/Code.gs', 'k.eind >= startVolgend', 'ok', 'Kandidaten.eind via datumIn (10) tegen datumStr (10)'],
  ['backend/Code.gs', 'String(k.start) > eindStr || (k.eind && String(k.eind) < startStr)', 'ok', 'start/eind via datumIn (10) tegen datumStr (10)'],
  ['backend/Code.gs', 'datumTijdStr(f.getLastUpdated()) <= sinds', 'ok', 'LAATSTE_URENIMPORT wordt met nu() gezet (16)'],
  ['backend/Code.gs', "a.deadline < dagStr", 'ok', 'deadline yyyy-MM-dd (gevalideerd) tegen datumStr'],
  ['backend/Code.gs', 'String(t.beschikbaarheidBevestigd) < String(t.laatstePeiling)', 'ok', 'beide nu() (16)'],
  ['backend/Code.gs', 'd.getTime() >= grens.getTime()', 'ok', 'geen tekst: Date-objecten in ms'],
  ['backend/Code.gs', 'k.deadline < dagStr', 'ok', 'Kansen.deadline yyyy-MM-dd (datumIn) tegen datumStr'],
  ['backend/Code.gs', 'k.deadline >= dagStr', 'ok', 'Kansen.deadline yyyy-MM-dd tegen datumStr'],
  ['backend/Code.gs', 't.start >= dagStr', 'ok', 'Trajecten.start yyyy-MM-dd (datumIn) tegen datumStr'],
  ['backend/Code.gs', 'lopend = g.eind >= vandaag', 'ok', 'geen tekst: Date-objecten'],
  ['backend/Code.gs', "String(a.datum).slice(0, 10) >= grens", 'ok', 'slice(0, 10) tegen datumStr (schoolpagina, −60 dagen)'],
  ['backend/Code.gs', "String(s || '').slice(0, 10) >= grens", 'ok', 'slice(0, 10) tegen datumStr (slapendRun)'],
  ['index.html', 'if (vr < vandaag) vr = pPlus(vr, 7)', 'ok', 'geen tekst: Date-objecten (parser)'],
  ['index.html', 'h.dagVanMaand >= vandaag.getDate()', 'ok', 'geen tekst: getallen (parser)'],
  ['index.html', "if (a.over === 0) return '<b>vandaag</b>';", 'ok', 'geen vergelijking: html-tag'],
  ['index.html', "open.filter(function (t) { return t.deadline > vandaag; })", 'ok', 'deadline (10) tegen vandaagStr() (10)'],
  ['index.html', '!t.deadline || t.deadline > vandaag', 'ok', 'deadline (10) tegen vandaagStr() (10)'],
  ['index.html', 't.deadline && t.deadline < vandaag', 'ok', 'deadline (10) tegen vandaagStr() (10)'],
  ['index.html', 't.deadline >= vandaag && t.deadline <= grens', 'ok', 'grens = pYmd(...) (10)'],
  ['index.html', "String(a.datum).slice(0, 10) < grens", 'ok', 'grens = nuLokaal(...).slice(0, 10)']
];
['backend/Code.gs', 'index.html'].forEach(function (f) {
  var lijnen = fs.readFileSync(path.join(R, f), 'utf8').split('\n');
  lijnen.forEach(function (l, i) {
    if (!/(<=|>=|[^<>=!]<[^<=]|[^<>=]>[^>=])/.test(l)) return;
    if (!/\b(vandaag|nu\(\)|grens|dagStr|datumStr\(|vandaagStr\(\)|D\.nu|herhaal|startVolgend|eindStr|startStr|sinds|deadline|\.datum\b|week\b)/.test(l)) return;
    if (!/(vandaag|nu\(\)|grens|dagStr|herhaal|startVolgend|eindStr|startStr|sinds|datumStr\()\s*[;)&|,]|[<>]=?\s*(vandaag|nu\(\)|grens|dagStr|herhaal|startVolgend|eindStr|startStr|sinds|datumStr\()|(deadline|datum|week|eind|start|tot|geldigTot|bevestigd|Peiling|Tot|Sinds)\)?\s*[<>]=?\s*/i.test(l)) return;
    var t = null; for (var k = 0; k < VERGELIJK.length; k++) if (VERGELIJK[k][0] === f && l.indexOf(VERGELIJK[k][1]) >= 0) { t = VERGELIJK[k]; break; }
    if (!t && !/[<>]=?\s*(vandaag|nu\(\)|grens|dagStr|herhaal|startVolgend|eindStr|startStr|sinds|datumStr\()|(vandaag|nu\(\)|grens|dagStr|herhaal|startVolgend|eindStr|startStr|sinds|D\.nu)\s*[<>]/.test(l)) return;  // zonder bekende datumvariabele en zonder triage: geen datumvergelijking
    vergelijkingen.push({ bestand: f, regel: i + 1, code: l.trim().slice(0, 200), oordeel: t ? t[2] : 'controleren', toelichting: t ? t[3] : 'niet in de triagelijst: formaten van beide kanten nagaan' });
  });
});
var onafgedekt = vindplaatsen.filter(function (v) { return !v.afgedekt; });
info('scan new Date/86400000: ' + vindplaatsen.length + ' vindplaatsen, ' + (vindplaatsen.length - onafgedekt.length) + ' afgedekt, ' + onafgedekt.length + ' onafgedekt');
onafgedekt.forEach(function (v) { info('  onafgedekt ' + v.bestand + ':' + v.regel + '  ' + v.code.slice(0, 110)); });
info('scan toISOString/getUTC/Date.parse: ' + iso.length + ' vindplaatsen' + (iso.length ? ' → ' + iso.map(function (x) { return x.bestand + ':' + x.regel; }).join(', ') : ''));
info('scan dd-MM-yyyy: ' + ddmm.length + ' vindplaatsen, ' + ddmm.filter(function (x) { return !x.veilig; }).length + ' onveilig');
var teControleren = vergelijkingen.filter(function (v) { return v.oordeel !== 'ok'; });
info('scan vergelijkingen van datumteksten: ' + vergelijkingen.length + ' vindplaatsen, ' + teControleren.length + ' nog te controleren');
teControleren.forEach(function (v) { info('  controleren ' + v.bestand + ':' + v.regel + '  ' + v.code.slice(0, 110)); });

/* ===================== json en slot ===================== */
var looptijd = Math.round((Date.now() - T0) / 100) / 10, rood = combinaties.filter(function (c) { return !c.ok; });
var json = { gemaakt: new Date().toISOString(), node: process.version, tz_host: Intl.DateTimeFormat().resolvedOptions().timeZone, snel: SNEL, looptijd_s: looptijd,
  matrix: { tijdzones: TIJDZONES, klokken: KLOKKEN, tests: ['node_rooktest.js', 'parser_test.js'] },
  telling: { combinaties: combinaties.length, groen: combinaties.length - rood.length, rood: rood.length, reproducties: reproducties.length, reproducties_afwijkend: bugs.length, scan_vindplaatsen: vindplaatsen.length, scan_onafgedekt: onafgedekt.length, vergelijkingen: vergelijkingen.length, vergelijkingen_te_controleren: teControleren.length, toISOString: iso.length, ddMMyyyy: ddmm.length },
  combinaties: combinaties, reproducties: reproducties,
  scan: { vindplaatsen: vindplaatsen, vergelijkingen: vergelijkingen, toISOString: iso, ddMMyyyy: ddmm, hulpfuncties: { 'backend/Code.gs': ['datumStr', 'datumTijdStr', 'parseDatum', 'middag', 'plusMaanden', 'volgendeDatum', 'dagenTussen', 'datumIn', 'datumTijdIn', 'parseDatumNl', 'plusDagenVan'], 'index.html': ['pDatum', 'pPlus', 'pYmd', 'ymd', 'nuLokaal', 'vandaagStr', 'morgenStr', 'tlDatum', 'dagenTotLokaal'] } } };
try { fs.mkdirSync(UIT, { recursive: true }); fs.writeFileSync(path.join(UIT, 'tz.json'), JSON.stringify(json, null, 1)); info('json: test/shots/robuust/tz.json'); } catch (e) { eis(false, 'tz.json schrijven: ' + e.message); }
console.log('looptijd ' + looptijd + ' s · combinaties ' + combinaties.length + ' (rood ' + rood.length + ')');
console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
