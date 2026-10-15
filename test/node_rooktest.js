// v4.5: rooktest van de backendlogica zonder Google: demo-backend.js (stubs + seed) en Code.gs in één vm-context.
// Gebruik: node test/node_rooktest.js  → "ALLES GOED" of een lijst FOUT-regels (exitcode 1).
var vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);  // alleen console van buiten: JSON, Date en Array moeten uit de context zelf komen (instanceof)
vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(R, 'backend/Code.gs'), 'utf8'), ctx, { filename: 'demo.js' });
ctx.demoStart('');

var fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
// Roept een api-functie aan zoals de app dat doet (via demoRun, met een koppelcode); geeft het resultaat of gooit de fout
function roep(code, fn) {
  var args = Array.prototype.slice.call(arguments, 2), d = JSON.parse(ctx.demoRun(fn, JSON.stringify(args), code));
  if (!d.ok) throw new Error(d.fout);
  return d.result;
}
function faalt(code, fn) { var args = Array.prototype.slice.call(arguments, 2); try { roep.apply(null, [code, fn].concat(args)); return ''; } catch (e) { return String(e.message); } }
function acties() { return ctx.lees('Acties'); }
function plusDagen(n) { return ctx.datumStr(ctx.plusDagen(n)); }  // datum binnen de context maken (instanceof Date)
var SOPHIE = 'demo-sophie', LARS = 'demo-lars', FEMKE = 'demo-femke';

/* ---- v4.5: snelinvoer met extra velden, herhaling, rechten, meldingen ---- */
var t1 = roep(LARS, 'apiActieToevoegen', 'Weekoverleg voorbereiden', 'hoog', plusDagen(2), { tijd: '09:30', herhaling: { eenheid: 'week', interval: 1, dagen: [1, 4] }, categorie: 'afspraak' });
eis(t1.tijd === '09:30' && t1.herhaling && t1.herhaling.eenheid === 'week' && t1.herhaling.dagen.join() === '1,4' && t1.bron === 'handmatig' && t1.eigenaar === 'Lars Visser', 'snelinvoer: tijd, herhaling, bron handmatig, eigenaar');
var rij1 = acties().filter(function (a) { return a.id === t1.id; })[0];
eis(typeof rij1.herhaling === 'string' && rij1.herhaling.indexOf('"eenheid":"week"') >= 0 && rij1.bijgewerkt && rij1.bijgewerktDoor === 'Lars Visser', 'herhaling als JSON in de Sheet, bijgewerkt en bijgewerktDoor gevuld');

var klaar = roep(LARS, 'apiActieKlaar', t1.id);
eis(klaar.status === 'af' && klaar.volgende && klaar.volgende.tekst === t1.tekst && klaar.volgende.deadline > t1.deadline && klaar.volgende.tijd === '09:30' && klaar.volgende.status === 'open', 'afvinken maakt de volgende instantie (later, zelfde tekst en tijd)');
var open1 = acties().filter(function (a) { return a.tekst === t1.tekst && a.status !== 'af'; });
eis(open1.length === 1 && open1[0].id !== t1.id, 'precies één open instantie van de reeks');
var klaar2 = roep(LARS, 'apiActieKlaar', t1.id);
eis(klaar2.volgende === null && acties().filter(function (a) { return a.tekst === t1.tekst; }).length === 2, 'twee keer afvinken maakt geen derde instantie');
var her = roep(LARS, 'apiTaakHeropen', t1.id);
eis(her.status === 'open' && !her.herhaling, 'heropenen zet de taak open zonder herhaling');
eis(/toegang/.test(faalt(FEMKE, 'apiActieKlaar', open1[0].id)) && /toegang/.test(faalt(FEMKE, 'apiTaakHeropen', t1.id)) && /toegang/.test(faalt(FEMKE, 'apiTaakOpslaan', { id: t1.id, tekst: 'Gekaapt' })), 'een ander team mag niet afvinken, heropenen of wijzigen');
eis(!faalt(SOPHIE, 'apiActieKlaar', open1[0].id), 'management mag wel afvinken');

var voorM = ctx.lees('Meldingen').length;
var t2 = roep(SOPHIE, 'apiTaakOpslaan', { tekst: 'Cijfers aanleveren', deadline: plusDagen(3), tijd: '14:00', eigenaar: 'Femke de Wit', herhaling: '' });
var meldingen = ctx.lees('Meldingen').filter(function (m) { return m.voor === 'Femke de Wit' && m.link === 'taak:' + t2.id; });
eis(meldingen.length === 1 && /Sophie/.test(meldingen[0].tekst) && /14:00/.test(meldingen[0].tekst) && ctx.lees('Meldingen').length === voorM + 1, 'toewijzen aan een ander geeft één melding met link taak:<id>');
roep(FEMKE, 'apiTaakOpslaan', { id: t2.id, prio: 'laag', _oud: { prio: t2.prio } });
eis(ctx.lees('Meldingen').length === voorM + 1, 'de eigenaar die zijn eigen taak wijzigt krijgt geen melding');
eis(roep(FEMKE, 'apiTaak', t2.id).tekst === 'Cijfers aanleveren' && /toegang/.test(faalt(LARS, 'apiTaak', t2.id)), 'apiTaak: eigenaar ziet de taak, een ander team niet');
eis(/Ongeldige tijd/.test(faalt(SOPHIE, 'apiTaakOpslaan', { tekst: 'x', tijd: '25:00' })) && /Ongeldige datum/.test(faalt(SOPHIE, 'apiTaakOpslaan', { tekst: 'x', deadline: 'morgen' })) && /Ongeldige herhaling/.test(faalt(SOPHIE, 'apiTaakOpslaan', { tekst: 'x', herhaling: { eenheid: 'uur' } })), 'ongeldige tijd, datum en herhaling worden geweigerd');
var crm = roep(SOPHIE, 'apiCrm');
eis(crm.kansenKort instanceof Array && crm.kansenKort.length > 0 && crm.kansenKort[0].id && crm.kansenKort[0].naam, 'apiCrm geeft kansenKort voor het taakvenster');
var taken = roep(LARS, 'apiTaken');
eis(taken.taken.some(function (t) { return t.herhaling && t.herhaling.eenheid; }) && taken.taken.every(function (t) { return 'tijd' in t && 'bijgewerkt' in t; }), 'apiTaken geeft tijd, herhaling en bijgewerkt mee');

/* ---- herhalingsregels (direct, zonder Sheet) ---- */
function vd(iso, h) { var p = iso.split('-'); return ctx.datumStr(ctx.volgendeDatum(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12), h)); }
eis(vd('2026-10-14', { eenheid: 'week', interval: 1, dagen: [1, 3] }) === '2026-10-19', 'week ma+wo vanaf woensdag → maandag erna');
eis(vd('2026-10-14', { eenheid: 'week', interval: 2, dagen: [1] }) === '2026-10-26', 'elke 2 weken op maandag vanaf woensdag → maandag over anderhalve week');
eis(vd('2026-10-14', { eenheid: 'week', interval: 1, dagen: [1, 2, 3, 4, 5] }) === '2026-10-15', 'elke werkdag vanaf woensdag → donderdag');
eis(vd('2026-10-16', { eenheid: 'week', interval: 1, dagen: [1, 2, 3, 4, 5] }) === '2026-10-19', 'elke werkdag vanaf vrijdag → maandag');
eis(vd('2026-01-31', { eenheid: 'maand', interval: 1, dagVanMaand: 31 }) === '2026-02-28', 'maand op de 31e → laatste dag van februari');
eis(vd('2026-10-14', { eenheid: 'maand', interval: 3 }) === '2027-01-14', 'elk kwartaal');
eis(vd('2028-02-29', { eenheid: 'jaar', interval: 1 }) === '2029-02-28', 'jaarlijks vanaf 29 februari');
eis(vd('2026-10-24', { eenheid: 'dag', interval: 1 }) === '2026-10-25' && vd('2026-10-25', { eenheid: 'dag', interval: 1 }) === '2026-10-26', 'dagelijks over de zomertijdwissel heen');
var oud = { tekst: 'x', deadline: '2026-01-05', herhaling: '' };
var inst = ctx.volgendeInstantie(oud, { eenheid: 'week', interval: 1, dagen: [1] }, new Date());
eis(inst && inst.deadline >= plusDagen(0), 'een achterstallige reeks springt naar de eerste datum vanaf vandaag');
eis(ctx.volgendeInstantie(oud, { eenheid: 'week', interval: 1, aantal: 1 }, new Date()) === null && ctx.volgendeInstantie(oud, { eenheid: 'week', interval: 1, aantal: 3 }, new Date()).herhaling.aantal === 2, 'aantal telt af en stopt bij 1');
eis(ctx.volgendeInstantie({ tekst: 'x', deadline: plusDagen(0) }, { eenheid: 'dag', interval: 1, tot: plusDagen(0) }, new Date()) === null, 'tot: na de einddatum geen nieuwe instantie');
eis(ctx.volgendeInstantie({ tekst: 'x', deadline: plusDagen(-30) }, { eenheid: 'week', interval: 2, vanafAfvinken: true }, new Date()).deadline === plusDagen(14), 'vanafAfvinken rekent vanaf vandaag');
eis(ctx.herhalingIn({ eenheid: 'week', interval: '2', dagen: ['3', 1, 9], tot: '2026-12-31', aantal: 4 }).dagen.join() === '1,3' && ctx.herhalingIn('') === '' && ctx.herhalingIn(null) === '', 'herhalingIn normaliseert en laat leeg leeg');

/* ---- v4.6: tags, subtaken, opgeslagen weergaven, herinneringsmail, streak ---- */
var ouder6 = acties().filter(function (a) { return a.id === 'tk6'; })[0];
eis(!!ouder6 && acties().filter(function (a) { return a.ouderId === 'tk6'; }).length === 2, 'seed: hoofdtaak tk6 met twee subtaken');
var t6 = roep(FEMKE, 'apiTaak', 'tk6');
eis(t6.tags.join('|') === 'rooster|periode 2' && t6.subtaken.aantal === 2 && t6.subtaken.af === 0, 'taakUit geeft tags en de stand van de subtaken');
var k1 = roep(FEMKE, 'apiActieKlaar', 'tk6a');
eis(k1.ouderKlaar === false && roep(FEMKE, 'apiTaak', 'tk6a').ouder === ouder6.tekst && roep(FEMKE, 'apiTaak', 'tk6').subtaken.af === 1, 'eerste subtaak af: hoofdtaak nog niet klaar, tekst van de hoofdtaak mee');
eis(roep(FEMKE, 'apiActieKlaar', 'tk6b').ouderKlaar === true, 'laatste subtaak af → ouderKlaar');
var hoofd = roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Hoofdtaak met kind', tags: 'Test, test, Rooster' });
eis(hoofd.tags.join('|') === 'test|rooster', 'tags worden klein en uniek');
var kind = roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Kind', ouderId: hoofd.id });
eis(kind.ouderId === hoofd.id && kind.ouder === 'Hoofdtaak met kind', 'subtaak hangt onder de hoofdtaak');
eis(/geen subtaken hebben/.test(faalt(FEMKE, 'apiTaakOpslaan', { tekst: 'Kleinkind', ouderId: kind.id })), 'geen subtaak onder een subtaak');
eis(/zelf subtaken/.test(faalt(FEMKE, 'apiTaakOpslaan', { id: hoofd.id, ouderId: 'tk19' })), 'een hoofdtaak met subtaken kan geen subtaak worden');
eis(/toegang/.test(faalt(LARS, 'apiTaakOpslaan', { tekst: 'Indringer', ouderId: hoofd.id })), 'geen subtaak onder een hoofdtaak van een ander team');
roep(FEMKE, 'apiActieKlaar', hoofd.id);
eis(acties().filter(function (a) { return a.id === kind.id; })[0].status === 'af', 'hoofdtaak afvinken neemt de open subtaak mee');
var hoofd2 = roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Hoofd 2' }), kind2 = roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Kind 2', ouderId: hoofd2.id });
roep(FEMKE, 'apiVerwijder', 'taak', hoofd2.id);
var los = acties().filter(function (a) { return a.id === kind2.id; })[0];
eis(!!los && !los.ouderId, 'hoofdtaak verwijderen maakt de subtaak een losse taak');
var hoofd3 = roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Hoofd 3' }); roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Kind 3', ouderId: hoofd3.id });
roep(FEMKE, 'apiVerwijder', 'taak', hoofd3.id, { metSubtaken: true });
eis(!acties().some(function (a) { return a.tekst === 'Kind 3'; }), 'met metSubtaken gaan de subtaken mee weg');
var reeks = roep(FEMKE, 'apiTaakOpslaan', { tekst: 'Herhalend met tag', deadline: plusDagen(0), tags: 'reeks', herhaling: { eenheid: 'week', interval: 1 } });
eis(roep(FEMKE, 'apiActieKlaar', reeks.id).volgende.tags.join() === 'reeks', 'de volgende instantie van een reeks houdt haar tags');

var w = roep(FEMKE, 'apiTaakWeergavenOpslaan', [{ naam: 'Rooster', filter: { tag: 'rooster', weergave: 'komende', mijn: true, onzin: 'weg' } }]);
eis(w.length === 1 && w[0].filter.tag === 'rooster' && w[0].filter.mijn === true && w[0].filter.onzin === undefined && roep(FEMKE, 'apiTaken').weergaven.length === 1 && roep(LARS, 'apiTaken').weergaven.length === 0, 'opgeslagen weergaven per gebruiker, met whitelist');
var veel = []; for (var vi = 0; vi < 13; vi++) veel.push({ naam: 'x' + vi });
eis(/Maximaal 12/.test(faalt(FEMKE, 'apiTaakWeergavenOpslaan', veel)) && /naam/.test(faalt(FEMKE, 'apiTaakWeergavenOpslaan', [{ naam: '' }])), 'maximaal 12 weergaven, elk met een naam');
eis(roep(FEMKE, 'apiTaken').herinneringen === true && roep(FEMKE, 'apiHerinneringenZetten', false).aan === false && roep(FEMKE, 'apiTaken').herinneringen === false && roep(LARS, 'apiTaken').herinneringen === true, 'herinneringen staan standaard aan en zijn per gebruiker uit te zetten');
roep(FEMKE, 'apiHerinneringenZetten', true);
var taken2 = roep(FEMKE, 'apiTaken');
eis(taken2.tags.indexOf('rooster') >= 0 && taken2.tags.indexOf('factuur') >= 0, 'apiTaken geeft de tags in gebruik');

ctx.GEBRUIKER = null; ctx._demoVerzonden.length = 0;
var n1 = ctx.herinneringTrigger(), tk19 = acties().filter(function (a) { return a.id === 'tk19'; })[0];
eis(n1 === 1 && ctx._demoVerzonden.length === 1 && ctx._demoVerzonden[0].to === 'femke@athena.example' && /Bellen met de administratie/.test(ctx._demoVerzonden[0].subject) && /#taak:tk19/.test(ctx._demoVerzonden[0].htmlBody) && !!tk19.herinnerd, 'herinneringTrigger: één mail aan de eigenaar met deeplink, herinnerd gezet (seed tk19 begint over tien minuten)');
eis(ctx.herinneringTrigger() === 0 && ctx._demoVerzonden.length === 1, 'tweede run stuurt niets opnieuw');
var home = roep(FEMKE, 'apiHome'), wd = new Date().getDay();
eis(home.afgerondWeek >= 3 && home.streak >= (wd >= 1 && wd <= 5 ? 1 : 0) && typeof home.streak === 'number', 'apiHome geeft afgerondWeek en streak');
var st = roep(FEMKE, 'apiStatus');
eis(st.herinneringen === true && st.email === 'femke@athena.example' && 'herinneringTrigger' in st, 'apiStatus geeft de herinneringsinstelling en het mailadres');

/* ---- bestaande schermen blijven werken ---- */
['demo-sophie', 'demo-lars', 'demo-femke', 'demo-sem'].forEach(function (c) { eis(!faalt(c, 'apiOverzicht') && !faalt(c, 'apiHome') && !faalt(c, 'apiTaken') && !faalt(c, 'apiAgenda', plusDagen(-3), plusDagen(10)), 'schermen laden als ' + c); });
try { ctx.GEBRUIKER = null; ctx.nachtelijkeReview(); eis(true, 'nachtelijke review draait'); } catch (e) { eis(false, 'nachtelijke review draait: ' + e.message); }

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
