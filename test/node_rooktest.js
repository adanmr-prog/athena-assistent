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

/* ---- v5.0: talentnetwerk — bestand, rechten, matching, voorstellen, beoordelen, documenten, portaal, dagelijkse run, XPS-uren, rapport, AVG ---- */
var SEM = 'demo-sem', IRIS = 'demo-iris', RUBEN = 'demo-ruben';
function portaal(token, fn) { var args = Array.prototype.slice.call(arguments, 2); return JSON.parse(ctx.demoPortaal(fn, JSON.stringify(args), token)); }
var tlS = roep(SEM, 'apiTalenten');
eis(tlS.talenten.length === 25 && tlS.rechten.vol === true && tlS.rechten.wijzigen === true && tlS.tellingen.actief === 20 && tlS.tellingen.slapend === 2 && tlS.tellingen.aangemeld === 2 && tlS.scholen.length === 12 && tlS.keuzes.functies.length === 7, 'talentteam ziet het hele bestand met tellingen, scholen (ligging) en keuzelijsten');
var eva = tlS.talenten.filter(function (t) { return t.id === 'tl1'; })[0];
eis(!!eva && eva.vog.status === 'oranje' && eva.beoordeling.laatste.oordeel === 'favoriet' && eva.plaatsingen === 1 && eva.postcode === '3511 AB' && eva.compleetheid >= 80, 'profiel Eva: VOG oranje (op tijd voor de lopende inzet, niet voor een nieuwe), favoriet, 1 plaatsing, postcode zichtbaar');
var vogs = {}; tlS.talenten.forEach(function (t) { vogs[t.vog.status] = (vogs[t.vog.status] || 0) + 1; });
eis(vogs.oranje === 3 && vogs.groen === 14 && vogs.verlopen === 4 && vogs.ontbreekt === 4, 'VOG-statussen op de seed: 3 oranje, 14 groen, 4 verlopen, 4 ontbreekt (' + JSON.stringify(vogs) + ')');
eis(tlS.benaderen.some(function (b) { return b.id === 'tl15' && /peiling/.test(b.redenen.join()); }) && tlS.benaderen.some(function (b) { return b.id === 'tl9' && /VOG verlopen/.test(b.redenen.join()); }), 'vandaag benaderen: onbeantwoorde peiling en een verlopen VOG bij een lopende inzet');
var tlF = roep(FEMKE, 'apiTalenten');
eis(tlF.rechten.vol === false && tlF.talenten.length === 5 && tlF.talenten.every(function (t) { return t.beperkt && t.postcode === undefined && t.notitie === undefined && ['tl1', 'tl2', 'tl3', 'tl6', 'tl7'].indexOf(t.id) >= 0; }) && tlF.scholen.length === 0, 'accountmanager ziet alleen de talenten uit eigen projecten, zonder adres of notitie');
eis(/toegang/.test(faalt(FEMKE, 'apiTalent', 'tl15')) && !faalt(FEMKE, 'apiTalent', 'tl1') && /toegang/.test(faalt(LARS, 'apiTalenten')) && /toegang/.test(faalt(LARS, 'apiTalent', 'tl1')), 'rechten: AM alleen eigen talenten, consultant niets');
var pf = roep(FEMKE, 'apiTalent', 'tl1');
eis(pf.talent.beperkt && pf.documenten.length === 0 && pf.uren.length === 0 && pf.scholen.length === 0 && pf.plaatsingen.length === 1 && pf.plaatsingen[0].magBeoordelen === true && pf.rechten.beoordelen === true && pf.rechten.wijzigen === false, 'AM-profiel: geen documenten, uren of relaties; wel de eigen plaatsing met Beoordelen');
var ps = roep(SEM, 'apiTalent', 'tl1');
eis(ps.documenten.length === 1 && ps.documenten[0].heeftBestand === false && ps.documenten[0].url === undefined && ps.uren.length === 12 && ps.scholen.length === 1 && ps.tijdlijn instanceof Array && ps.rechten.vol && ps.rechten.wijzigen, 'talentteam-profiel: documenten zonder Drive-URL, 12 weken uren, relaties, tijdlijn');

var nieuw = roep(SEM, 'apiTalentOpslaan', { voornaam: 'Test', achternaam: 'Talent', email: 'Test.Talent@mail.example', telefoon: '+31 6 12345678', postcode: '3512ab', functies: ['huiswerkbegeleider'], sectoren: ['vo'], vakken: 'Wiskunde, Natuurkunde', toestemmingDatum: plusDagen(0), contractvorm: 'zzp' });
eis(nieuw.status === 'aangemeld' && nieuw.email === 'test.talent@mail.example' && nieuw.telefoon === '0612345678' && nieuw.postcode === '3512 AB' && nieuw.vakken.join() === 'wiskunde,natuurkunde' && !!nieuw.lat && nieuw.bewarenTot > plusDagen(700) && /DBA/.test(nieuw.waarschuwing || ''), 'nieuw talent: e-mail klein, telefoon en postcode genormaliseerd, ligging via PDOK, bewaartermijn, zzp-waarschuwing');
eis(/al een profiel.*\[talent:tl1\]/.test(faalt(SEM, 'apiTalentOpslaan', { voornaam: 'Eva', achternaam: 'Dubbel', email: 'eva.de.wit@mail.example', toestemmingDatum: plusDagen(0) })), 'dubbel e-mailadres wordt geweigerd met het id van het bestaande profiel');
var dubbel = roep(SEM, 'apiTalentOpslaan', { voornaam: 'Eva', achternaam: 'Dubbel', email: 'eva.de.wit@mail.example', toestemmingDatum: plusDagen(0), forceer: true });
eis(dubbel.id && dubbel.id !== 'tl1', 'met forceer mag een tweede profiel toch');
eis(/toestemming/i.test(faalt(SEM, 'apiTalentOpslaan', { voornaam: 'Zonder', achternaam: 'Toestemming', email: 'zt@mail.example' })) && /Onbekende functie/.test(faalt(SEM, 'apiTalentOpslaan', { voornaam: 'X', functies: ['piloot'], toestemmingDatum: plusDagen(0) })) && /toegang/.test(faalt(FEMKE, 'apiTalentOpslaan', { voornaam: 'X', toestemmingDatum: plusDagen(0) })), 'toestemming verplicht, functie uit de keuzelijst, alleen het talentteam');
var gew = roep(SEM, 'apiTalentOpslaan', { id: 'tl22', status: 'actief', functies: ['onderwijsondersteuner', 'rekenondersteuner'], _oud: { status: 'gescreend', functies: ['onderwijsondersteuner'] } });
eis(gew.status === 'actief' && gew.functies.join() === 'onderwijsondersteuner,rekenondersteuner' && ctx.lees('Activiteiten').some(function (a) { return a.talentId === 'tl22' && /gescreend → actief/.test(a.onderwerp); }), 'statuswissel met conflictcontrole op een JSON-lijst; mijlpaal op de tijdlijn');
eis(/Intussen gewijzigd/.test(faalt(SEM, 'apiTalentOpslaan', { id: 'tl22', functies: ['surveillant'], _oud: { functies: ['onderwijsondersteuner'] } })), 'verouderde _oud op functies geeft een conflictmelding');
var r0 = roep(SEM, 'apiTalentBeschikbaarheidOpslaan', 'tl12', { ma: [2, 1, 0], di: [0, 0, 0], wo: [2, 2, 2], do: [0, 0, 0], vr: [0, 0, 0], za: [0, 0, 0], zo: [9, 'x', 2] }, [{ van: plusDagen(10), tot: plusDagen(12), soort: 'niet', reden: 'tentamen' }]);
eis(r0.beschikbaarheid.ma.join() === '2,1,0' && r0.beschikbaarheid.zo.join() === '0,0,2' && r0.uitzonderingen.length === 1 && r0.uitzonderingen[0].soort === 'niet' && !!r0.beschikbaarheidBevestigd, 'beschikbaarheid: raster genormaliseerd (alleen 0, 1, 2), uitzondering bewaard, bevestigd gezet');

var ro = ctx.roosterUitTekst('Di en do 14:00-17:00');
eis(ro.herkend && JSON.stringify(ro.dagdelen) === '[[2,1],[4,1]]' && ctx.roosterUitTekst('woensdagmiddag').dagdelen.join('|') === '3,1' && !ctx.roosterUitTekst('Volgens rooster').herkend && JSON.stringify(ctx.roosterUitTekst('Ma t/m do 9:00-13:00').dagdelen) === '[[1,0],[2,0],[3,0],[4,0]]' && JSON.stringify(ctx.roosterUitTekst('Ma, wo en vr 9:00-12:00').dagdelen) === '[[1,0],[3,0],[5,0]]', 'roosterUitTekst: dagen, bereiken, dagdelen uit tijden en woorden, niet herkend');
var mt = roep(SEM, 'apiMatch', 'v3');  // NT2-ondersteuner bij ISK Havenstad: isk, ma t/m do 9:00-13:00, start over drie weken
eis(mt.functie === 'nt2-ondersteuner' && mt.sector === 'isk' && mt.roosterHerkend && mt.dagdelen.join() === 'ma ochtend,di ochtend,wo ochtend,do ochtend' && mt.project.school === 'ISK Havenstad', 'match: functie, sector en rooster van de vacature herkend');
var mIds = mt.kandidaten.map(function (k) { return k.talentId; }), uit = {}; mt.uitgesloten.forEach(function (u) { uit[u.talentId] = u.reden; });
eis(mIds.indexOf('tl8') >= 0 && mIds.indexOf('tl9') >= 0 && mIds.indexOf('tl24') >= 0 && mt.kandidaten.every(function (k) { return k.score >= 0 && k.score <= 100 && k.onderdelen.reduce(function (s, o) { return s + o.punten; }, 0) === k.score && k.onderdelen.length === 7 && k.onderdelen.every(function (o) { return o.uitleg && o.punten <= o.max; }); }), 'match: nt2-ondersteuners komen in aanmerking; score = som van zeven onderdelen met uitleg');
eis(/sector/.test(uit.tl1 || '') && /functie/.test(uit.tl6 || '') && /te ver/.test(uit.tl19 || '') && /status/.test(uit.tl18 || ''), 'match: harde filters met reden (sector, functie, afstand, status): ' + JSON.stringify([uit.tl1, uit.tl6, uit.tl19, uit.tl18]));
var f8 = mt.kandidaten.filter(function (k) { return k.talentId === 'tl8'; })[0], f24 = mt.kandidaten.filter(function (k) { return k.talentId === 'tl24'; })[0], f9 = mt.kandidaten.filter(function (k) { return k.talentId === 'tl9'; })[0];
eis(f8.alVoorgedragen === true && f8.vog === 'groen' && f8.afstandKm === 0 && f8.score > f24.score && f24.beoordeling.nietGeschikt === 1 && f9.waarschuwingen.some(function (w) { return /VOG verlopen/.test(w); }), 'match: Fatima (al voorgedragen, VOG groen, 0 km) scoort boven Zoë (niet geschikt); Jesse krijgt een VOG-waarschuwing');
var vs = roep(SEM, 'apiVoorstellen', 'v3', ['tl24', 'tl8'], 'Testvoordracht');
eis(vs.aantal === 1 && vs.overgeslagen === 1 && ctx.lees('Kandidaten').some(function (k) { return k.talentId === 'tl24' && k.vacatureId === 'v3' && k.status === 'voorgesteld' && k.bron === 'talentbestand' && k.naam === 'Zoë Kaya' && k.functie === 'NT2-ondersteuner' && k.notitie === 'Testvoordracht'; }), 'voorstellen: één nieuwe kandidaat (de al voorgedragene wordt overgeslagen) met naam, functie en notitie');
eis(ctx.lees('Meldingen').some(function (m) { return m.voor === 'Bas Meijer' && /Zoë Kaya/.test(m.tekst); }) && acties().some(function (a) { return /Matchinggesprek met Zoë Kaya/.test(a.tekst) && a.link === 'talent:tl24' && a.eigenaar === 'Bas Meijer'; }), 'voorstellen: melding en matchinggesprek-taak voor de accountmanager, met link naar het profiel');
eis(/talentteam/.test(faalt(FEMKE, 'apiVoorstellen', 'v2', ['tl6'])) && /talentteam/.test(faalt(FEMKE, 'apiMatch', 'v2')) && /toegang/.test(faalt(LARS, 'apiMatch', 'v2')), 'voorstellen en matchen alleen door het talentteam');
var mt2 = roep(SEM, 'apiMatch', 'v4');  // Rekenondersteuner bij Kompas College, start over vier weken
eis(mt2.uitgesloten.some(function (u) { return u.talentId === 'tl25' && /afwezig/.test(u.reden); }) && mt2.kandidaten.some(function (k) { return k.talentId === 'tl11' && k.alVoorgedragen; }), 'match: een afwezigheid rond de start sluit uit; de voorgedragen kandidaat staat gemarkeerd');

roep(RUBEN, 'apiKandidaatOpslaan', { id: 'c11', status: 'geplaatst', _oud: { status: 'voorgesteld' } });  // Thijs Brouwer bij Kompas College (project van Ruben)
var bt = acties().filter(function (a) { return /Beoordeel Thijs Brouwer/.test(a.tekst); })[0], thijs = ctx.lees('Talenten').filter(function (t) { return t.id === 'tl11'; })[0];
eis(!!bt && bt.eigenaar === 'Ruben Smit' && bt.link === 'talent:tl11' && /maand/.test(bt.herhaling) && bt.bron === 'bezetting' && thijs.laatsteContact === plusDagen(0), 'geplaatst → herhalende beoordelingstaak voor de AM met link naar het profiel; laatste contact op het talent');
eis(/reden/.test(faalt(RUBEN, 'apiKandidaatOpslaan', { id: 'c11', status: 'gestopt', _oud: { status: 'geplaatst' } })), 'afgerond of gestopt vraagt een reden');
var bo = roep(RUBEN, 'apiBeoordelingOpslaan', { talentId: 'tl11', kandidaatId: 'c11', oordeel: 'niet geschikt', criteria: { punctualiteit: 1, onzin: 3, didactiek: 7 }, tekst: 'Kwam twee keer niet opdagen.' });
eis(bo.beoordeling.rol === 'am' && bo.beoordeling.schoolId === 's2' && bo.beoordeling.school === 'Kompas College' && Object.keys(bo.beoordeling.criteria).join() === 'punctualiteit' && bo.voorstelNietMeer && bo.voorstelNietMeer.schoolId === 's2', 'AM beoordeelt zijn plaatsing: rol am, school uit het project, criteria gefilterd, voorstel "niet meer"');
eis(ctx.lees('Meldingen').some(function (m) { return m.voor === 'Iris Mulder' && /Thijs Brouwer.*niet geschikt/.test(m.tekst) && m.link === 'talent:tl11'; }), 'niet geschikt → melding aan het talentteam');
eis(/plaatsing/.test(faalt(RUBEN, 'apiBeoordelingOpslaan', { talentId: 'tl11', oordeel: 'goed' })) && /toegang/.test(faalt(FEMKE, 'apiBeoordelingOpslaan', { talentId: 'tl11', kandidaatId: 'c11', oordeel: 'goed' })) && /talentteam/.test(faalt(RUBEN, 'apiBeoordelingOpslaan', { id: bo.beoordeling.id, wederhoor: 'x' })) && /toegang/.test(faalt(LARS, 'apiBeoordelingOpslaan', { talentId: 'tl11', oordeel: 'goed' })), 'AM alleen per eigen plaatsing, wederhoor alleen het talentteam, consultant niets');
var bo2 = roep(IRIS, 'apiBeoordelingOpslaan', { id: bo.beoordeling.id, wederhoor: 'Thijs was ziek en had zich bij de docent afgemeld.' });
eis(bo2.beoordeling.wederhoor.indexOf('ziek') >= 0 && roep(IRIS, 'apiBeoordelingOpslaan', { talentId: 'tl16', oordeel: 'goed', tekst: 'Los oordeel' }).beoordeling.rol === 'talent', 'talentteam legt wederhoor vast en beoordeelt ook zonder plaatsing');
var rel = roep(SEM, 'apiTalentSchoolOpslaan', { talentId: 'tl11', schoolId: 's2', status: 'niet meer', richting: 'school', reden: 'beoordeeld als niet geschikt' });
eis(rel.some(function (r) { return r.schoolId === 's2' && r.status === 'niet meer' && r.school === 'Kompas College'; }) && roep(SEM, 'apiMatch', 'v4').uitgesloten.some(function (u) { return u.talentId === 'tl11' && /school/.test(u.reden); }), 'relatie "niet meer" opgeslagen en sluit uit in de matching');
eis(roep(SEM, 'apiTalentSchoolOpslaan', { talentId: 'tl11', schoolId: 's2', status: 'neutraal', richting: 'school' }).filter(function (r) { return r.schoolId === 's2'; }).length === 1, 'relatie per talent, school en richting is een upsert');

var doc = roep(SEM, 'apiTalentDocumentOpslaan', { talentId: 'tl7', soort: 'vog', afgifte: plusDagen(-10), gecontroleerd: true }, { naam: 'vog-lotte.pdf', mime: 'application/pdf', base64: ctx.Utilities.base64Encode('%PDF-1.4 demo') });
eis(doc.document.heeftBestand && doc.document.gecontroleerdDoor === 'Sem de Boer' && doc.document.status === 'geldig' && doc.vog.status === 'groen' && roep(SEM, 'apiTalent', 'tl7').talent.vog.status === 'groen', 'document met bestand in Drive; de VOG-badge springt op groen');
var link = roep(SEM, 'apiTalentDocumentLink', doc.document.id);
eis(/drive\.google\.com/.test(link.url) && ctx.lees('Activiteiten').some(function (a) { return a.talentId === 'tl7' && /Document geopend door Sem/.test(a.onderwerp); }) && /toegang/.test(faalt(FEMKE, 'apiTalentDocumentLink', doc.document.id)), 'documentlink alleen voor het talentteam, gelogd op de tijdlijn');
eis(/afgiftedatum/.test(faalt(SEM, 'apiTalentDocumentOpslaan', { talentId: 'tl7', soort: 'vog' })) && /toegang/.test(faalt(FEMKE, 'apiTalentDocumentOpslaan', { talentId: 'tl1', soort: 'diploma' })), 'VOG zonder afgiftedatum geweigerd; de AM voegt geen documenten toe');
roep(SEM, 'apiVerwijder', 'talentdocument', doc.document.id);
eis(roep(SEM, 'apiTalent', 'tl7').documenten.length === 0 && roep(SEM, 'apiTalent', 'tl7').talent.vog.status === 'ontbreekt', 'document verwijderd: het bestand naar de prullenbak, de VOG-badge weer op ontbreekt');

var TOKEN = 'demotokenali0000000000000000000000000001', TOKEN2 = 'demotokenyusuf00000000000000000000000002';
var pt = portaal(TOKEN, 'apiPortaalToon');
eis(pt.ok && pt.result.naam === 'Ali' && pt.result.beschikbaarheid.ma.join() === '2,2,0' && pt.result.email === undefined && pt.result.telefoon === undefined, 'portaal: toont alleen voornaam en beschikbaarheid');
var pb = portaal(TOKEN, 'apiPortaalBeschikbaarheid', { ma: [0, 0, 0], di: [2, 2, 2], wo: [2, 2, 0], do: [2, 2, 0], vr: [1, 1, 0], za: [0, 0, 0], zo: [0, 0, 0] }, [{ van: plusDagen(30), tot: plusDagen(37), soort: 'niet', reden: 'vakantie' }], false);
var ali = ctx.lees('Talenten').filter(function (t) { return t.id === 'tl2'; })[0];
eis(pb.ok && pb.result.beschikbaarheid.di.join() === '2,2,2' && JSON.parse(ali.beschikbaarheid).ma.join() === '0,0,0' && JSON.parse(ali.uitzonderingen).length === 1 && String(ali.beschikbaarheidBevestigd).slice(0, 10) === plusDagen(0) && ctx.lees('Activiteiten').some(function (a) { return a.talentId === 'tl2' && a.door === 'Portaal' && /aangepast via mail/.test(a.onderwerp); }), 'portaal: beschikbaarheid aangepast, bevestigd en gelogd door Portaal');
var pv = portaal(TOKEN, 'apiPortaalBeschikbaarheid', null, null, true);
eis(pv.ok && pv.result.beschikbaarheid.di.join() === '2,2,2' && /bevestigd via mail/.test(ctx.lees('Activiteiten').filter(function (a) { return a.talentId === 'tl2' && a.door === 'Portaal'; }).pop().onderwerp), 'portaal: "klopt nog" bevestigt zonder iets te wijzigen');
eis(!portaal(TOKEN, 'apiTalent', 'tl2').ok && /onbekende functie/.test(portaal(TOKEN, 'apiTalent', 'tl2').fout) && /verlopen|geldig/.test(portaal('verkeerdtoken000000000000000000000000000', 'apiPortaalToon').fout) && /onbekende functie|toegang/.test(faalt(SEM, 'apiPortaalToon', TOKEN)), 'portaal: alleen de twee portaalfuncties met een geldig token; via de koppelcode zijn ze niet aan te roepen');
var nB = 0, laatsteFout = ''; for (var bi = 0; bi < 40 && !laatsteFout; bi++) { var rb = portaal(TOKEN, 'apiPortaalToon'); if (!rb.ok) laatsteFout = rb.fout; else nB++; }
eis(nB <= 30 && /te veel/.test(laatsteFout), 'portaal: budget van 30 verzoeken per token per uur');
ctx.GEBRUIKER = null; ctx.schrijf('Talenten', { id: 'tl15', portaalTokenTot: plusDagen(-1) + ' 00:00' });
eis(/verlopen/.test(portaal(TOKEN2, 'apiPortaalToon').fout), 'portaal: een verlopen token wordt geweigerd');
var pl = roep(SEM, 'apiTalentPortaalLink', 'tl15', false);
eis(/\?t=[a-f0-9]{40}&api=https%3A%2F%2Fscript\.google\.com/.test(pl.link) && /&actie=bevestig/.test(pl.bevestigLink) && pl.gemaild === false && portaal(/t=([a-f0-9]{40})/.exec(pl.link)[1], 'apiPortaalToon').ok, 'nieuwe portaallink: vers token (40 hex) met exec-URL; de oude werkt niet meer en de nieuwe wel');
eis(/toegang/.test(faalt(FEMKE, 'apiTalentPortaalLink', 'tl1', false)), 'portaallink alleen voor het talentteam');

ctx.GEBRUIKER = null; ctx._demoVerzonden.length = 0;
var pr = ctx.peilingRun(), yusuf = ctx.lees('Talenten').filter(function (t) { return t.id === 'tl15'; })[0];
eis(pr === 1 && ctx._demoVerzonden.length === 1 && ctx._demoVerzonden[0].to === 'yusuf.demir@mail.example' && /Klopt nog/.test(ctx._demoVerzonden[0].htmlBody) && /actie=bevestig/.test(ctx._demoVerzonden[0].htmlBody) && String(yusuf.laatstePeiling).slice(0, 10) === plusDagen(0), 'peilingRun: alleen Yusuf (beschikbaarheid 70 dagen oud, peiling 16 dagen geleden) krijgt een mail met Klopt nog; laatste peiling gezet');
eis(ctx.peilingRun() === 0, 'tweede peilingRun stuurt niets (14 dagen wachten)');
ctx.schrijf('Talenten', { id: 'tl-oud', voornaam: 'Oud', achternaam: 'Profiel', email: 'oud.profiel@mail.example', status: 'actief', statusSinds: plusDagen(-300) + ' 10:00', aangemaakt: plusDagen(-300) + ' 10:00', laatsteContact: plusDagen(-200), toestemmingDatum: plusDagen(-300), bewarenTot: plusDagen(-1), door: 'Sem de Boer' });
ctx._demoVerzonden.length = 0;
var sl = ctx.slapendRun(), oud1 = ctx.lees('Talenten').filter(function (t) { return t.id === 'tl-oud'; })[0];
eis(sl === 1 && oud1.status === 'slapend' && ctx._demoVerzonden.length === 1 && /Werk je nog graag/.test(ctx._demoVerzonden[0].subject) && !!oud1.portaalToken, 'slapendRun: zes maanden geen inzet of contact → slapend, met een heractivatiemail en portaaltoken');
var hb = portaal(oud1.portaalToken, 'apiPortaalBeschikbaarheid', null, null, true);
eis(hb.ok && hb.result.weerActief === true && ctx.lees('Talenten').filter(function (t) { return t.id === 'tl-oud'; })[0].status === 'actief', 'portaal: bevestigen zet een slapend profiel weer op actief');
ctx.schrijf('Talenten', { id: 'tl-oud', status: 'slapend' });
var bw = ctx.bewaartermijnRun(), oud2 = ctx.lees('Talenten').filter(function (t) { return t.id === 'tl-oud'; })[0];
eis(bw === 1 && oud2.voornaam === 'Verwijderd' && oud2.email === '' && oud2.status === 'uitgeschreven' && oud2.portaalToken === '' && ctx.bewaartermijnRun() === 0, 'bewaartermijnRun: verstreken termijn zonder lopende inzet → geanonimiseerd, en niet nog eens');
ctx._demoVerzonden.length = 0;
var vr = ctx.vogRun(true);
eis(vr >= 15 && ctx._demoVerzonden.length === vr && /Nieuwe VOG voor schooljaar/.test(ctx._demoVerzonden[0].subject) && acties().some(function (a) { return /VOG vernieuwen voor \d+ talenten vóór schooljaar/.test(a.tekst) && a.eigenaar === 'Iris Mulder'; }), 'vogRun: iedereen zonder verse VOG voor volgend schooljaar krijgt een mail; het talentteam één verzameltaak');
ctx._demoVerzonden.length = 0;
var ar = ctx.aanmeldingenRun(), lieke = ctx.lees('Talenten').filter(function (t) { return t.email === 'lieke.vos@mail.example'; })[0];
eis(/1 nieuw, 0 bestaand, 1 mails/.test(ar) && !!lieke && lieke.status === 'aangemeld' && lieke.bron === 'website' && lieke.door === 'Formulier' && JSON.parse(lieke.functies).join() === 'huiswerkbegeleider,examentrainer' && JSON.parse(lieke.sectoren).join() === 'vo' && JSON.parse(lieke.beschikbaarheid).ma.join() === '0,2,0' && JSON.parse(lieke.beschikbaarheid).do.join() === '2,2,0' && String(lieke.portaalToken).length === 40 && lieke.toestemmingDatum === plusDagen(-1) && lieke.postcode === '3581 KL', 'aanmeldingenRun: de formulierrij wordt een profiel (functies, sector, beschikbaarheid uit tekst, toestemming = tijdstempel, token)');
eis(ctx._demoVerzonden[0].to === 'lieke.vos@mail.example' && /Beschikbaarheid doorgeven/.test(ctx._demoVerzonden[0].htmlBody) && ctx.lees('Meldingen').some(function (m) { return /Nieuwe aanmelding: Lieke Vos/.test(m.tekst) && m.link === 'talent:' + lieke.id; }) && /0 nieuw/.test(ctx.aanmeldingenRun()), 'bevestigingsmail met portaallink, melding aan het talentteam; de tweede run doet niets');
ctx.blad('Aanmeldingen').appendRow([plusDagen(0) + ' 08:00', 'Yusuf', 'Demir', '', 'yusuf.demir@mail.example', '', 'surveillant', 'vo', '', 'Ja', '', '']);
eis(/0 nieuw, 1 bestaand/.test(ctx.aanmeldingenRun()) && ctx.lees('Activiteiten').some(function (a) { return a.talentId === 'tl15' && /Opnieuw aangemeld/.test(a.onderwerp); }), 'een bekende aanmelder krijgt geen tweede profiel, wel een notitie en een melding');
var geo = ctx.geocodeerRun();
eis(geo >= 1 && Number(ctx.lees('Talenten').filter(function (t) { return t.id === lieke.id; })[0].lat) > 50, 'geocodeerRun vult de ligging van nieuwe profielen (PDOK)');

var rij = [['Accountnummer', 'Naam', 'E-mail', 'Projectnummer', 'Week', 'Uren', 'Status'], ['X5001', 'Eva de Wit', '', '10.880', '2026-W40', '7,5', 'Gewerkt'], ['X5001', 'Eva de Wit', '', '10.880', '2026-W40', '8', 'Gewerkt'], ['X5001', 'Eva de Wit', '', '10.880', '2026-W40', '0', 'No-show'], ['', '', 'tim.verhoeven@mail.example', '10.887', '40', '6', 'Gewerkt'], ['X7777', 'Onbekend', '', '10.880', '2026-W40', '4', 'Gewerkt']];
var ur = ctx.urenUitRijen(rij, ctx.lees('Talenten')), e40 = ur.regels.filter(function (x) { return x.talentId === 'tl1'; })[0];
eis(ur.aantalRegels === 5 && ur.regels.length === 2 && e40.uren === 15.5 && e40.diensten === 2 && e40.noShows === 1 && e40.week === '2026-W40' && ur.regels.some(function (x) { return x.talentId === 'tl4' && x.week === new Date().getFullYear() + '-W40'; }) && ur.onbekend.length === 1 && ur.onbekend[0].xpsId === 'x7777', 'urenUitRijen: per talent, week en project; match op XPS-nummer of e-mail; no-show apart; onbekende accounts gemeld');
eis(/Geen kolom/.test((function () { try { ctx.urenUitRijen([['a', 'b'], ['1', '2']], []); return ''; } catch (e) { return e.message; } })()), 'een export zonder uren- of statuskolom wordt geweigerd met een duidelijke melding');
ctx.GEBRUIKER = null; var imp = ctx.urenImport(), wk1 = ctx.isoWeekStr(ctx.plusDagen(-7));
eis(imp.bestanden === 1 && imp.regels === 8 && imp.onbekend.length === 1 && imp.onbekend[0].naam === 'Onbekend Account' && ctx.lees('TalentUren').some(function (u) { return u.talentId === 'tl3' && u.week === wk1 && Number(u.lateAfmeldingen) === 1 && Number(u.diensten) === 1 && u.trajectId === 't1'; }), 'urenImport leest de weekexport uit de Drive-map XPS-export: uren per week, late afmelding, project gekoppeld, onbekend account gemeld');
eis(ctx.urenImport().bestanden === 0, 'een tweede import slaat het al gelezen bestand over');
eis(/toegang/.test(faalt(FEMKE, 'apiTalentUrenImport')) && typeof roep(IRIS, 'apiTalentUrenImport').bestanden === 'number', 'urenimport met de hand: alleen het talentteam');
var rp = roep(IRIS, 'apiTalentRapport', 'maand', 0);
eis(rp.pool.actief >= 19 && typeof rp.vogCompliance === 'number' && rp.dekking.length === 7 && rp.dekking[0].dagdelen.length === 3 && rp.reeks.plaatsingen.length === rp.reeksLabels.length && 'aanmeldingen' in rp.cijfers && rp.vergelijk.cijfers && /toegang/.test(faalt(FEMKE, 'apiTalentRapport', 'maand', 0)), 'talentrapport: pool, VOG-compliance, dekking functie × dagdeel, verloop en vergelijking; niet voor de AM');
var tr = roep(IRIS, 'apiTeamRapport', 'maand', 'talent', '', 0);
eis(tr.metrieken.some(function (m) { return m.id === 'poolActief'; }) && tr.metrieken.some(function (m) { return m.id === 'vogCompliance'; }) && typeof tr.totaal.cijfers.poolActief === 'number', 'teamrapport talent kent de nieuwe maatstaven poolActief en vogCompliance');

eis(/management/i.test(faalt(SEM, 'apiTalentAnonimiseer', 'tl14')) && /management/i.test(faalt(SEM, 'apiTalentExport', 'tl14')), 'inzage-export en anonimiseren alleen voor het management');
var ex = roep(SOPHIE, 'apiTalentExport', 'tl14');
eis(/^inzage-hanna-wolters-\d{4}-\d{2}-\d{2}\.json$/.test(ex.bestandsnaam) && JSON.parse(ex.tekst).profiel.email === 'hanna.wolters@mail.example' && JSON.parse(ex.tekst).plaatsingen.length === 1, 'inzage-export als json met profiel en plaatsingen');
var an = roep(SOPHIE, 'apiTalentAnonimiseer', 'tl14'), hw = ctx.lees('Talenten').filter(function (t) { return t.id === 'tl14'; })[0], hwK = ctx.lees('Kandidaten').filter(function (k) { return k.id === 'c14'; })[0];
eis(an.naam === 'Verwijderd profiel' && hw.email === '' && hw.status === 'uitgeschreven' && hwK.naam === 'Verwijderd profiel' && hwK.email === '' && ctx.lees('TalentDocumenten').every(function (dd) { return dd.talentId !== 'tl14'; }), 'anonimiseren: persoonsgegevens en documenten weg, kandidaatrij zonder naam; gebeurtenissen blijven');
eis(/voordrachten of plaatsingen/.test(faalt(SOPHIE, 'apiVerwijder', 'talent', 'tl1')) && /management/i.test(faalt(SEM, 'apiVerwijder', 'talent', nieuw.id)) && !faalt(SOPHIE, 'apiVerwijder', 'talent', nieuw.id) && !ctx.lees('Talenten').some(function (t) { return t.id === nieuw.id; }), 'een talent met voordrachten is niet te verwijderen (anonimiseren), een leeg profiel wel, alleen door het management');
ctx.GEBRUIKER = null; var run1 = ctx.talentDagelijksTrigger();
eis(['vog', 'peiling', 'slapend', 'bewaartermijn', 'geocoderen', 'aanmeldingen'].every(function (k) { return k in run1 && !/^fout/.test(String(run1[k])); }), 'talentDagelijksTrigger draait alle stappen zonder fout: ' + JSON.stringify(run1));
var stS = roep(SOPHIE, 'apiStatus');
eis('talentTrigger' in stS && 'urenTrigger' in stS && stS.xpsExportMap === true && !!stS.laatsteUrenImport, 'apiStatus kent de talenttriggers, de XPS-map en de laatste urenimport');
eis(roep(IRIS, 'apiInstellingen').talentFuncties.length === 7 && roep(SOPHIE, 'apiExport', 'talenten').csv.split('\n').length > 20, 'keuzelijsten en csv-export van talenten');
ctx.GEBRUIKER = null; var bl = ctx.kandidatenBlijvenLiggen(true);
eis(bl.some(function (x) { return /VOG van Jesse Vos.*verlopen, nodig vóór de start/.test(x.tekst); }) && bl.some(function (x) { return /VOG van Eva de Wit.*oranje/.test(x.tekst); }), 'blijven liggen (dagstart): verlopen VOG bij een voordracht, oranje VOG bij een lopende inzet');

/* ---- v6.4: samenwerking bij een gewonnen kans (winformulier, conceptvacature, talentscout, taskforce in de agenda) ---- */
var BAS = 'demo-bas';
eis(/startdatum/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k7', fase: 'gewonnen', _oud: { fase: 'onderhandeling' }, overdracht: { aantal: 2, rol: 'Studentdocent wiskunde' } })) &&
  ctx.lees('Kansen').filter(function (k) { return k.id === 'k7'; })[0].fase === 'onderhandeling', 'winformulier: zonder startdatum geweigerd, de kans blijft open');
var mVoor = ctx.lees('Meldingen').length, start64 = plusDagen(21);
var won = roep(LARS, 'apiKansOpslaan', { id: 'k7', fase: 'gewonnen', _oud: { fase: 'onderhandeling' }, overdracht: { aantal: 2, rol: 'Studentdocent wiskunde', rooster: 'di en do 8:30-12:30', startdatum: start64, bijzonderheden: 'Ervaring met havo 4' } });
var p64 = won.traject, tr64 = ctx.lees('Trajecten').filter(function (t) { return t.id === p64.id; })[0], tf64 = JSON.parse(tr64.taskforce);
eis(p64 && p64.am === 'Bas Meijer' && p64.start === start64 && tf64.inzet === '2 × Studentdocent wiskunde' && tf64.rooster === 'di en do 8:30-12:30' && tf64.bijzonderheden === 'Ervaring met havo 4', 'winformulier vult start en taskforce (inzet, rooster, bijzonderheden) voor');
var vac64 = ctx.lees('Vacatures').filter(function (v) { return v.trajectId === p64.id; });
eis(vac64.length === 1 && vac64[0].status === 'concept' && Number(vac64[0].aantal) === 2 && vac64[0].dagen === 'di en do 8:30-12:30' && vac64[0].start === start64, 'een conceptvacature met aantal, rooster en start');
var m64 = ctx.lees('Meldingen').slice(mVoor);
eis(m64.some(function (m) { return m.voor === 'Iris Mulder' && /conceptvacature/.test(m.tekst); }) && m64.some(function (m) { return m.voor === 'Sem de Boer'; }) && m64.some(function (m) { return m.voor === 'Bas Meijer'; }), 'melding aan het hele talentteam en aan de accountmanager');
var taakTs = acties().filter(function (a) { return a.trajectId === p64.id && a.bron === 'talentscout'; });
eis(taakTs.length === 1 && taakTs[0].eigenaar === 'Iris Mulder' && taakTs[0].status === 'open', 'taak "Talentscout toewijzen" voor de teamlead van talent');
var bz64 = roep(SEM, 'apiBezetting'), opBord = bz64.vacatures.filter(function (v) { return v.id === vac64[0].id; })[0];
eis(opBord && opBord.status === 'concept' && bz64.tellingen.concept >= 1 && bz64.tellingen.openVacatures === roep(SEM, 'apiBezetting').tellingen.openVacatures, 'de conceptvacature staat op het bord Bezetting en telt niet als open');
eis(!faalt(SEM, 'apiMatch', vac64[0].id), 'talent kan op een concept al matchen');
eis(/concept/.test(faalt(SEM, 'apiVoorstellen', vac64[0].id, ['tl1'])) && /concept/.test(faalt(SEM, 'apiKandidaatOpslaan', { vacatureId: vac64[0].id, naam: 'Test Kandidaat' })), 'voordragen op een concept wordt geweigerd');
eis(/toegang/.test(faalt(SEM, 'apiTalentscoutToewijzen', p64.id, 'Iris Mulder')) && /talentteam/.test(faalt(IRIS, 'apiTalentscoutToewijzen', p64.id, 'Lars Visser')), 'een scout wijst geen ander toe; alleen iemand uit het talentteam kan scout zijn');
var mV2 = ctx.lees('Meldingen').length, ts = roep(SEM, 'apiTalentscoutToewijzen', p64.id, 'Sem de Boer');
eis(ts.talentscout === 'Sem de Boer' && acties().filter(function (a) { return a.id === taakTs[0].id; })[0].status === 'af', 'een scout pakt een project zonder scout zelf op; de toewijstaak gaat af');
eis(/toegang/.test(faalt(SEM, 'apiTalentscoutToewijzen', p64.id, '')) && !faalt(IRIS, 'apiTalentscoutToewijzen', p64.id, 'Sem de Boer'), 'daarna wijzigt alleen de teamlead (of AM/management) de scout');
eis(ctx.lees('Activiteiten').some(function (a) { return a.trajectId === p64.id && a.bron === 'overdracht' && /Talentscout: Sem/.test(a.onderwerp); }), 'overdrachtsregel in de tijdlijn bij het toewijzen');
var agendaVoor = ctx._demoAgenda ? ctx._demoAgenda.length : 0;
var gepl = roep(LARS, 'apiTaskforcePlannen', p64.id, { start: plusDagen(2) + 'T10:00', duurMin: 45 });
eis(gepl.taskforceGepland && /10:00/.test(gepl.taskforceGepland) && acties().filter(function (a) { return a.trajectId === p64.id && a.bron === 'taskforceplannen'; }).every(function (a) { return a.status === 'af'; }), 'taskforcemeeting in de agenda; de plantaak van de consultant gaat af');
eis(ctx.lees('Meldingen').slice(mV2).some(function (m) { return m.voor === 'Bas Meijer' && /Taskforcemeeting/.test(m.tekst); }) && ctx.lees('Meldingen').slice(mV2).some(function (m) { return m.voor === 'Sem de Boer' && /Taskforcemeeting/.test(m.tekst); }), 'AM en talentscout krijgen een melding van de meeting');
eis(/concept/.test(faalt(BAS, 'apiVacatureOpslaan', { trajectId: p64.id, titel: 'X', status: 'concept' })), 'een nieuwe vacature kan geen concept zijn');
// v6.4.2: bevindingen uit de review
eis(/accountmanager bevestigt/.test(faalt(SEM, 'apiVacatureOpslaan', { id: vac64[0].id, status: 'open', _oud: { status: 'concept' } })) && ctx.lees('Vacatures').filter(function (v) { return v.id === vac64[0].id; })[0].status === 'concept', 'talent kan een conceptvacature niet zelf bevestigen');
var tBezig = ctx.lees('Trajecten').filter(function (t) { return t.status === 'bezig' && !t.talentscout && !ctx.lees('Vacatures').some(function (v) { return v.trajectId === t.id && v.status === 'open'; }); })[0];
eis(tBezig && /toegang/.test(faalt(SEM, 'apiTalentscoutToewijzen', tBezig.id, 'Sem de Boer')) && /toegang/.test(faalt(IRIS, 'apiTalentscoutToewijzen', tBezig.id, 'Sem de Boer')), 'scout worden van een project dat talent niet ziet kan niet (geen inzage via een omweg)');
roep(BAS, 'apiTaskforceOpslaan', p64.id, { hulpvraag: 'Twee vaste studentdocenten voor havo 4' });
eis(JSON.parse(ctx.lees('Trajecten').filter(function (t) { return t.id === p64.id; })[0].taskforce).gepland === gepl.taskforceGepland, 'taskforce bijwerken bewaart het tijdstip van de ingeplande meeting');
var losP = roep(SOPHIE, 'apiTrajectOpslaan', { school: 'Testschool zonder scout', traject: 'Proef', talentscout: '' });
eis(!ctx.lees('Activiteiten').some(function (a) { return a.trajectId === losP.id && a.bron === 'overdracht'; }), 'een nieuw project zonder scout krijgt geen loze tijdlijnregel');
var mV3 = ctx.lees('Meldingen').length, aangemaaktVoor = ctx.lees('Vacatures').filter(function (v) { return v.id === vac64[0].id; })[0].aangemaakt;
var bev = roep(BAS, 'apiVacatureOpslaan', { id: vac64[0].id, status: 'open', _oud: { status: 'concept' } });
eis(String(ctx.lees('Vacatures').filter(function (v) { return v.id === vac64[0].id; })[0].aangemaakt) >= String(aangemaaktVoor), 'time-to-fill telt vanaf bevestigen');
eis(bev.vacatures.filter(function (v) { return v.id === vac64[0].id; })[0].status === 'open' && ctx.lees('Meldingen').slice(mV3).filter(function (m) { return /bevestigd/.test(m.tekst); }).map(function (m) { return m.voor; }).join() === 'Sem de Boer', 'de AM bevestigt; alleen de talentscout krijgt de melding');
eis(!faalt(SEM, 'apiVoorstellen', vac64[0].id, ['tl1']), 'na bevestigen kan talent voordragen');
eis(roep(SEM, 'apiTrajecten').trajecten.some(function (t) { return t.id === p64.id && t.talentscout === 'Sem de Boer'; }), 'de talentscout ziet het project in zijn projectenlijst');
var won2 = roep(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'gewonnen', _oud: { fase: 'voorstel' } });
eis(won2.traject && !ctx.lees('Vacatures').some(function (v) { return v.trajectId === won2.traject.id; }) && acties().some(function (a) { return a.trajectId === won2.traject.id && a.bron === 'talentscout'; }), 'zonder winformulier (Brein, import): project zonder conceptvacature, wel de toewijstaak');

/* ---- v6.5: Financiën (prognose, gefactureerd, ontvangen, geleverd; bevriezen; Exact-import) ---- */
(function () {
  ctx.GEBRUIKER = null; ctx._LEES = {};
  var D = ctx.financienData(), alleT = ctx.lees('Trajecten'), fout = [];
  alleT.forEach(function (t) {
    var F = ctx.financienProject(t, D.fac[t.id] || [], D.uren[t.id] || [], ctx.termijnDagenVan(t, D)), som = F.ongepland;
    Object.keys(F.per.prognose).forEach(function (m) { som += F.per.prognose[m]; });
    var somKas = F.ongepland; Object.keys(F.per.prognoseKas).forEach(function (m) { somKas += F.per.prognoseKas[m]; });
    if (som !== F.contract || somKas !== F.contract) fout.push(t.id + ' prognose ' + som + '/' + somKas + ' ≠ contract ' + F.contract);
    if (F.gefactureerd + F.nogTeFactureren !== F.contract) fout.push(t.id + ' gefactureerd + nog te factureren ≠ contract');
    if (F.openstaand !== F.gefactureerd - F.ontvangen) fout.push(t.id + ' openstaand');
  });
  eis(!fout.length, 'invariant per project: som prognose (ook de kasvariant) = contract, gefactureerd + nog te factureren = contract' + (fout.length ? ': ' + fout.join('; ') : ''));
  var t1 = ctx.financienProject(alleT.filter(function (t) { return t.id === 't1'; })[0], D.fac.t1, D.uren.t1 || [], 30);
  eis(t1.contract === 4860000 && t1.signalen.some(function (x) { return /€ 28\.080 van het contract staat nog niet in termijnen; verdeeld/.test(x); }) && Object.keys(t1.per.prognose).length > 5, 'contractwaarde gaat voor omzet; termijnen die afwijken geven een signaal');
  var F = roep(SOPHIE, 'apiFinancien'), idx = {}; F.maanden.forEach(function (m, i) { idx[m] = i; });
  eis(F.maanden.length === 12 && /-08$/.test(F.maanden[0]) && /-07$/.test(F.maanden[11]), 'twaalf maanden, augustus t/m juli');
  // onafhankelijk narekenen uit de ruwe termijnen: verzonden (of de termijndatum als schatting) en betaald
  var gef = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ontv = gef.slice(), zichtbaar = {};
  F.scholen.forEach(function (s) { s.projecten.forEach(function (p) { zichtbaar[p.id] = 1; }); });
  ctx.lees('Facturen').forEach(function (f) {
    if (!zichtbaar[f.trajectId]) return;
    var b = Math.round(Number(f.bedrag) * 100), v = f.verzonden || ((f.status === 'verzonden' || f.status === 'betaald') ? f.datum : ''), p = f.betaald || (f.status === 'betaald' ? v : '');
    if (v && idx[String(v).slice(0, 7)] !== undefined) gef[idx[String(v).slice(0, 7)]] += b;
    if (p && idx[String(p).slice(0, 7)] !== undefined) ontv[idx[String(p).slice(0, 7)]] += b;
  });
  eis(JSON.stringify(gef) === JSON.stringify(F.reeksen.gefactureerd) && JSON.stringify(ontv) === JSON.stringify(F.reeksen.ontvangen), 'gefactureerd en ontvangen per maand = som van de verzonden en betaalde termijnen in die maand');
  var somScholen = 0; F.scholen.forEach(function (s) { somScholen += s.reeksen.prognose.reduce(function (a, b) { return a + b; }, 0); });
  eis(somScholen === F.reeksen.prognose.reduce(function (a, b) { return a + b; }, 0) && F.reeksen.geleverd.some(function (x) { return x > 0; }), 'scholen tellen op tot het totaal; geleverd uit de XPS-uren is gevuld');
  eis(F.reeksen.prognoseToen.some(function (x) { return x > 0; }) && F.totalen.ouderdom['0-30'] + F.totalen.ouderdom['31-60'] + F.totalen.ouderdom['60+'] === F.totalen.openstaand && F.totalen.gemBetaaltijd > 0, 'prognose van toen voor afgelopen maanden, ouderdom van openstaande facturen en gemiddelde betaaltijd');
  var femke = roep(FEMKE, 'apiFinancien'), lars = roep(LARS, 'apiFinancien');
  eis(femke.scholen.every(function (s) { return s.projecten.every(function (p) { return p.am === 'Femke de Wit'; }); }) && femke.scholen.length > 0, 'de AM ziet alleen zijn eigen projecten');
  eis(lars.scholen.every(function (s) { return s.projecten.every(function (p) { return p.adviseur === 'Lars Visser'; }); }) && /toegang/.test(faalt(SEM, 'apiFinancien')), 'de consultant ziet zijn eigen projecten, talent niets');
  eis(/management/i.test(faalt(FEMKE, 'apiExactImport', 'x')) && /management/i.test(faalt(FEMKE, 'apiFinancienBevriezen')), 'Exact-import en bevriezen alleen voor het management');
  // termijnstatus zet de datums
  var nt = ctx.lees('Facturen').filter(function (f) { return f.id === 'f6-1'; })[0];
  var na = roep(BAS, 'apiFactuurOpslaan', { id: 'f6-1', status: 'verzonden', _oud: { status: nt.status } });
  eis(na.verzonden === plusDagen(0) && !na.betaald, 'status verzonden zet de verzenddatum op vandaag');
  na = roep(BAS, 'apiFactuurOpslaan', { id: 'f6-1', status: 'betaald', _oud: { status: 'verzonden' } });
  eis(na.verzonden === plusDagen(0) && na.betaald === plusDagen(0), 'status betaald zet de betaaldatum');
  // bevriezen: één keer per maand
  var b0 = roep(SOPHIE, 'apiFinancienBevriezen'), pb = ctx._demoBladen.Prognoses.rijen, gi = pb[0].indexOf('gemaakt'), mNu = plusDagen(0).slice(0, 7);
  for (var pi = pb.length - 1; pi > 0; pi--) if (pb[pi][gi] === mNu) pb.splice(pi, 1);  // de demo had deze maand al bevroren (ter plekke, de tabel houdt dezelfde array)
  var b1 = roep(SOPHIE, 'apiFinancienBevriezen'), b2 = roep(SOPHIE, 'apiFinancienBevriezen');
  eis(b0.al === true, 'de demo heeft de lopende maand al bevroren');
  eis(b1.rijen > 0 && b2.al === true && b2.rijen === 0, 'bevriezen schrijft de prognose van deze maand één keer');
  // Exact-import (fictieve export): 20261033 is nu betaald, 20261051 heeft een ander bedrag, 99990001 staat alleen in Exact, 20261052 ontbreekt in de export
  var csv = 'Factuurnummer;Factuurdatum;Debiteur;Bedrag;Betaaldatum\n' + ['20261033;' + nt.datum.split('-').reverse().join('-') + ';Noorderhof;1.950,00;' + plusDagen(-1).split('-').reverse().join('-'),
    '20261051;' + plusDagen(-5).split('-').reverse().join('-') + ';Esdoorn;1.100,00;', '99990001;' + plusDagen(-3).split('-').reverse().join('-') + ';Onbekend;500,00;'].join('\n');
  var proef = roep(SOPHIE, 'apiExactImport', csv, {});
  eis(proef.gekoppeld === 2 && proef.afwijkend.length === 1 && proef.afwijkend[0].nummer === '20261051' && proef.alleenExact.length === 1 && proef.alleenExact[0].nummer === '99990001' && proef.alleenAthena.some(function (x) { return x.nummer === '20261052'; }) && !proef.toegepast, 'Exact controleren: gekoppeld, bedrag wijkt af, alleen in Exact, alleen in Athena');
  eis(ctx.lees('Facturen').filter(function (f) { return f.factuurnummer === '20261033'; })[0].status === 'verzonden', 'controleren verandert niets');
  var toe = roep(SOPHIE, 'apiExactImport', csv, { toepassen: true }), f33 = ctx.lees('Facturen').filter(function (f) { return f.factuurnummer === '20261033'; })[0];
  eis(toe.toegepast && f33.status === 'betaald' && ctx.datumIn(f33.betaald) === plusDagen(-1), 'toepassen zet de betaaldatum en de status uit Exact');
  eis(/Kolom niet gevonden: Factuurnummer.*Nummer;?|Kolommen in het bestand: Nummer/.test(faalt(SOPHIE, 'apiExactImport', 'Nummer;Datum;Bedrag\n1;01-10-2026;10,00', {})) &&
    roep(SOPHIE, 'apiExactImport', 'Nummer;Datum;Totaal\n20261033;01-10-2026;1950', { kolommen: { factuurnummer: 'Nummer', datum: 'Datum', bedrag: 'Totaal' } }).gekoppeld === 1, 'onbekende kolommen geven een duidelijke fout; kolomnamen zijn in te stellen');
})();

/* ---- v7.1: soort contactmoment (vorm) naast het type; de tellingen blijven gelijk ---- */
(function () {
  var voor = roep(SOPHIE, 'apiActiviteiten', '', '', '', '');
  var somType = Object.keys(voor.perType).reduce(function (n, k) { return n + voor.perType[k]; }, 0), somVorm = Object.keys(voor.perVorm).reduce(function (n, k) { return n + voor.perVorm[k]; }, 0);
  eis(somType === voor.totaal && somVorm === voor.totaal, 'per soort en per vorm tellen samen precies alle contactmomenten (' + voor.totaal + ')');
  eis((voor.perType.gesprek || 0) === (voor.perVorm.call || 0) + (voor.perVorm.whatsapp || 0) && (voor.perType.afspraak || 0) === ['afspraak-online', 'afspraak-fysiek', 'evaluatie-online', 'evaluatie-fysiek'].reduce(function (n, k) { return n + (voor.perVorm[k] || 0); }, 0),
    'oude regels krijgen bij het lezen de vorm van hun type: gesprekken = call + whatsapp, afspraken = afspraak + evaluatie');
  eis(voor.tijdlijn.every(function (a) { return a.vorm || a.type === 'fase' || a.type === 'taak'; }), 'elke tijdlijnregel heeft een vorm (behalve mijlpaal en taak)');
  var school = ctx.lees('Scholen').filter(function (x) { return x.eigenaar === 'Lars Visser'; })[0];
  var wa = roep(LARS, 'apiActiviteitToevoegen', { vorm: 'whatsapp', schoolId: school.id, onderwerp: 'Rooster afgestemd', tekst: 'via WhatsApp' });
  var ev = roep(LARS, 'apiActiviteitToevoegen', { vorm: 'evaluatie-online', schoolId: school.id, onderwerp: 'Evaluatie periode 1' });
  var rijWa = ctx.vind('Activiteiten', wa.id);
  eis(wa.type === 'gesprek' && wa.vorm === 'whatsapp' && rijWa.vorm === 'whatsapp' && ev.type === 'afspraak' && ev.vorm === 'evaluatie-online', 'WhatsApp telt als gesprek, een evaluatiegesprek als afspraak; de vorm staat in de Sheet');
  var oud = roep(LARS, 'apiActiviteitToevoegen', { type: 'gesprek', schoolId: school.id, onderwerp: 'Oude aanroep met alleen type' });
  eis(oud.vorm === 'call', 'een aanroep met alleen type (oude app, assistent) krijgt de vorm van het type');
  var na = roep(SOPHIE, 'apiActiviteiten', '', '', '', '');
  eis(na.totaal === voor.totaal + 3 && (na.perType.gesprek || 0) === (voor.perType.gesprek || 0) + 2 && (na.perType.afspraak || 0) === (voor.perType.afspraak || 0) + 1, 'de rapporttelling per type telt de nieuwe soorten mee in de bestaande cijfers');
  var gew = roep(LARS, 'apiActiviteitOpslaan', { id: wa.id, vorm: 'afspraak-fysiek', _oud: { vorm: 'whatsapp' } });
  eis(gew.vorm === 'afspraak-fysiek' && ctx.vind('Activiteiten', wa.id).type === 'afspraak', 'de soort wijzigen zet ook het type');
  eis(/Onbekend soort/.test(faalt(LARS, 'apiActiviteitOpslaan', { id: wa.id, vorm: 'telegram' })), 'een onbekende vorm wordt geweigerd');
  var fase = ctx.lees('Activiteiten').filter(function (a) { return a.type === 'fase'; })[0];
  if (fase) eis(/geen ander soort/.test(faalt(SOPHIE, 'apiActiviteitOpslaan', { id: fase.id, vorm: 'call' })), 'een mijlpaalregel krijgt geen vorm');
  eis(ctx.vormVanAfspraak('Evaluatie Esdoorn', 'https://meet.google.com/abc-defg', '') === 'evaluatie-online' && ctx.vormVanAfspraak('Kennismaking', 'Schoolstraat 3, Utrecht', '') === 'afspraak-fysiek' &&
    ctx.vormVanAfspraak('Overleg', '', 'Deelnemen via Microsoft Teams: https://teams.microsoft.com/l/meetup') === 'afspraak-online', 'agenda-afspraken: online aan de videolink, evaluatie aan de titel');
  eis(roep(SOPHIE, 'apiCrm').activiteitVormen.length === 8, 'apiCrm geeft de acht soorten');
  // Home: kerncijfers per functie
  var hF = roep(FEMKE, 'apiHome').kerncijfers, hS = roep('demo-sem', 'apiHome').kerncijfers, hL = roep(LARS, 'apiHome').kerncijfers, hM = roep(SOPHIE, 'apiHome').kerncijfers;
  eis(typeof hF.lopendeProjecten === 'number' && typeof hF.teFactureren === 'number' && hF.openVacatures === undefined, 'Home van de accountmanager: lopende projecten en nog te factureren');
  eis(typeof hS.openVacatures === 'number' && typeof hS.teBezetten === 'number' && hS.teFactureren === undefined, 'Home van talent: open vacatures en te bezetten plekken');
  eis(hL.teFactureren === undefined && typeof hL.lopendeProjecten === 'number', 'Home van de consultant: geen facturatiecijfer');
  eis(hM.lopendeProjecten >= hF.lopendeProjecten && hM.lopendeProjecten === ctx.lees('Trajecten').filter(ctx.projectLopend).length, 'management ziet alle lopende projecten');
})();

/* ---- bestaande schermen blijven werken ---- */
['demo-sophie', 'demo-lars', 'demo-femke', 'demo-sem', 'demo-iris'].forEach(function (c) { eis(!faalt(c, 'apiOverzicht') && !faalt(c, 'apiHome') && !faalt(c, 'apiTaken') && !faalt(c, 'apiAgenda', plusDagen(-3), plusDagen(10)) && !faalt(c, 'apiTrajecten') && (c === 'demo-lars' || !faalt(c, 'apiBezetting')), 'schermen laden als ' + c); });
try { ctx.GEBRUIKER = null; ctx.nachtelijkeReview(); eis(true, 'nachtelijke review draait'); } catch (e) { eis(false, 'nachtelijke review draait: ' + e.message); }

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
