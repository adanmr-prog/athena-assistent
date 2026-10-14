// v4.5: test van de Nederlandse snelinvoer-parser. Knipt het blok tussen "parser begin" en "parser einde" uit index.html en draait het los.
// Gebruik: node test/parser_test.js  → "ALLES GOED" of FOUT-regels (exitcode 1). Vandaag is vast: woensdag 14 oktober 2026.
var vm = require('vm'), fs = require('fs'), path = require('path');
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var blok = html.slice(html.indexOf('/* parser begin */'), html.indexOf('/* parser einde */'));
if (blok.length < 1000) { console.log('FOUT parserblok niet gevonden in index.html'); process.exit(1); }
var ctx = { console: console }; vm.createContext(ctx); vm.runInContext(blok, ctx, { filename: 'parser.js' });

var VANDAAG = new Date(2026, 9, 14, 12);  // woensdag (de parser maakt zelf nieuwe datums in de context)
var basis = { vandaag: VANDAAG,
  scholen: [{ id: 's1', naam: 'Esdoorn Lyceum', plaats: 'Utrecht' }, { id: 's2', naam: 'Kompas College', plaats: 'Amersfoort' }, { id: 's3', naam: 'Esdoorn Basisschool', plaats: 'Zeist' }],
  projecten: [{ id: 't1', naam: 'Onderwijsondersteuning 2026-2027', school: 'Esdoorn Lyceum', schoolId: 's1', status: 'bezig' }, { id: 't2', naam: 'Examentraining 2025-2026', school: 'Kompas College', schoolId: 's2', status: 'afgelopen' }],
  categorieen: ['bellen', 'mailen', 'afspraak', 'voorstel', 'opvolgen', 'overig'], gebruikers: ['Sophie de Graaf', 'Femke de Wit', 'Lars Visser'] };
var fouten = 0;
function eis(ok, wat, r) { console.log((ok ? 'ok   ' : 'FOUT ') + wat + (ok ? '' : '  → ' + JSON.stringify(r))); if (!ok) fouten++; }
function t(zin, verwacht, extra) {
  var r = ctx.ontleedTaak(zin, extra || basis), ok = Object.keys(verwacht).every(function (k) {
    var v = verwacht[k], w = r[k];
    return (v && typeof v === 'object') ? JSON.stringify(w) === JSON.stringify(v) : (w === v || (!v && !w));
  });
  eis(ok, zin, { tekst: r.tekst, deadline: r.deadline, tijd: r.tijd, prio: r.prio, herhaling: r.herhaling, categorie: r.categorie, eigenaar: r.eigenaar, schoolId: r.schoolId, trajectId: r.trajectId, twijfel: r.twijfel });
  return r;
}

// De vijftien zinnen uit het plan
t('Bel Marieke morgen om 14:00 !', { tekst: 'Bel Marieke', deadline: '2026-10-15', tijd: '14:00', prio: 'hoog' });
t('Offerte nabellen do', { tekst: 'Offerte nabellen', deadline: '2026-10-15', tijd: '' });
t('Rooster bevestigen do 9:30 #esdoorn @bellen', { tekst: 'Rooster bevestigen', deadline: '2026-10-15', tijd: '09:30', schoolId: 's1', trajectId: 't1', categorie: 'bellen' });
t('Zo snel mogelijk voorstel sturen', { tekst: 'Zo snel mogelijk voorstel sturen', deadline: '' });
t('Evaluatie plannen maandag', { tekst: 'Evaluatie plannen', deadline: '2026-10-19' });
t('Contract tekenen 15 nov', { tekst: 'Contract tekenen', deadline: '2026-11-15' });
t('Contract tekenen 15-11', { tekst: 'Contract tekenen', deadline: '2026-11-15' });
t('Jaarplan 1 mrt', { tekst: 'Jaarplan', deadline: '2027-03-01' });
t('Weekstart elke maandag om 9 uur', { tekst: 'Weekstart', deadline: '2026-10-19', tijd: '09:00', herhaling: { eenheid: 'week', interval: 1, dagen: [1] } });
t('Factuur sturen elke maand op de 1e @mailen', { tekst: 'Factuur sturen', deadline: '2026-11-01', categorie: 'mailen', herhaling: { eenheid: 'maand', interval: 1, dagVanMaand: 1 } });
t('Kandidaten nabellen elke 2 weken na afvinken', { tekst: 'Kandidaten nabellen', deadline: '2026-10-14', herhaling: { eenheid: 'week', interval: 2, vanafAfvinken: true } });
t('Toetsweek surveillance elke werkdag tot 23-10', { tekst: 'Toetsweek surveillance', deadline: '2026-10-14', herhaling: { eenheid: 'week', interval: 1, dagen: [1, 2, 3, 4, 5], tot: '2026-10-23' } });
t('Rapport MT over 3 dagen p1 +sophie', { tekst: 'Rapport MT', deadline: '2026-10-17', prio: 'hoog', eigenaar: 'Sophie de Graaf' });
t('Terugkoppeling school volgende week', { tekst: 'Terugkoppeling school', deadline: '2026-10-19' });
t('Kennismaking plannen #"Kompas College" eind van de maand', { tekst: 'Kennismaking plannen', deadline: '2026-10-31', schoolId: 's2', trajectId: '' });

// Randgevallen
var r = t('Bel #esdoorn over het rooster', { tekst: 'Bel over het rooster', schoolId: '', trajectId: '' }, { vandaag: VANDAAG, scholen: basis.scholen, projecten: [], categorieen: [], gebruikers: [] });
eis(r.twijfel.length === 1 && r.twijfel[0].kandidaten.length === 2, 'twee scholen die op #esdoorn passen → twijfel met twee kandidaten', r.twijfel);
t('Bel school vrijdag om 15:00 p2', { tekst: 'Bel school', deadline: '2026-10-16', tijd: '15:00', prio: 'midden' });
t('Ophalen om half 10 morgen', { tekst: 'Ophalen', deadline: '2026-10-15', tijd: '09:30' });
t('Overleg elke 2 weken op maandag', { tekst: 'Overleg', deadline: '2026-10-19', herhaling: { eenheid: 'week', interval: 2 } });
t('Nabellen over een week', { tekst: 'Nabellen', deadline: '2026-10-21' });
t('Begroting over 2 maanden', { tekst: 'Begroting', deadline: '2026-12-14' });
t('Dagafsluiting dagelijks om 17:00', { tekst: 'Dagafsluiting', deadline: '2026-10-14', tijd: '17:00', herhaling: { eenheid: 'dag', interval: 1 } });
t('Kwartaalcijfers elk kwartaal 3x', { tekst: 'Kwartaalcijfers', herhaling: { eenheid: 'maand', interval: 3, aantal: 3 } });
t('Lunch wo 12:30', { tekst: 'Lunch', deadline: '2026-10-21', tijd: '12:30' });
t('Zondag opruimen', { tekst: 'Opruimen', deadline: '2026-10-18' });
t('Eind van de week terugbellen', { tekst: 'Terugbellen', deadline: '2026-10-16' });
t('Plan 31-12-2027 vastleggen', { tekst: 'Plan vastleggen', deadline: '2027-12-31' });
t('Taak voor +femke', { tekst: 'Taak voor', eigenaar: 'Femke de Wit' });
t('   ', { tekst: '' });
eis(ctx.herhalingTekst({ eenheid: 'week', interval: 1, dagen: [1, 2, 3, 4, 5] }) === 'elke werkdag' && ctx.herhalingTekst({ eenheid: 'week', interval: 2, vanafAfvinken: true }) === 'elke 2 weken na afvinken' &&
  ctx.herhalingTekst({ eenheid: 'maand', interval: 1, dagVanMaand: 1, tot: '2027-07-01' }) === 'elke maand op de 1e tot do 1 jul' && ctx.herhalingTekst({ eenheid: 'maand', interval: 3 }) === 'elk kwartaal' && ctx.herhalingTekst(null) === '', 'herhalingTekst');
eis(ctx.pKortDatum('2026-10-15', VANDAAG) === 'do 15 okt' && ctx.pKortDatum('2027-03-01', VANDAAG) === 'ma 1 mrt 2027', 'pKortDatum met weekdag en jaar als het afwijkt');

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
