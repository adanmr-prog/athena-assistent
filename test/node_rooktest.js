// v4.5: rooktest van de backendlogica zonder Google: demo-backend.js (stubs + seed) en Code.gs in één vm-context.
// Gebruik: node test/node_rooktest.js  → "ALLES GOED" of een lijst FOUT-regels (exitcode 1).
var vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);  // alleen console van buiten: JSON, Date en Array moeten uit de context zelf komen (instanceof)
vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(process.env.CODE_GS || path.join(R, 'backend/Code.gs'), 'utf8'), ctx, { filename: 'demo.js' });  // v7.2: CODE_GS wijst naar een (gemuteerde) kopie van Code.gs voor test/mutatie_test.js
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
// v7.2: de seed zet VOG-afgiftes relatief aan vandaag; hoeveel talenten een mail krijgen hangt dus van de datum af (20 in augustus–januari,
// aflopend tot 7 eind juli, omdat steeds meer VOG's jong genoeg worden voor 1 augustus). De oude ondergrens (>= 15) klopte daardoor niet
// tussen begin april en eind juli, wat test/tz_test.js met een vaste klok aan het licht bracht. De verwachting wordt nu onafhankelijk
// uitgerekend uit de gegevens met de regel uit art. 34b WPO: groen = afgegeven op of na zes maanden vóór 1 augustus van het volgende
// schooljaar; wie actief is of dan nog een lopende inzet heeft en niet groen is, krijgt een mail. Exacte gelijkheid in plaats van een drempel.
var sjH = ctx.huidigSchooljaar(), jaarV = Number(sjH.slice(0, 4)) + 1, sjV = jaarV + '-' + (jaarV + 1), vogGrens = jaarV + '-02-01', startV = jaarV + '-08-01';
var vogDocs = ctx.lees('TalentDocumenten'), vogKand = ctx.lees('Kandidaten');
var vogLijst = ctx.lees('Talenten').filter(function (t) {
  var loopt = vogKand.some(function (k) { return String(k.talentId) === String(t.id) && ctx.kandidaatGevuld(k) && (!k.eind || String(k.eind) >= startV); });
  if (!(t.status === 'actief' || loopt)) return false;
  return !vogDocs.some(function (dd) { return String(dd.talentId) === String(t.id) && String(dd.soort).toLowerCase() === 'vog' && dd.afgifte && String(dd.afgifte).slice(0, 10) >= vogGrens; });
});
var vogMails = vogLijst.filter(function (t) { return t.email; }).length;
var vr = ctx.vogRun(true);
eis(vogLijst.length >= 5 && vr === vogMails && ctx._demoVerzonden.length === vr && /Nieuwe VOG voor schooljaar/.test(ctx._demoVerzonden[0].subject) && acties().some(function (a) { return a.tekst === 'VOG vernieuwen voor ' + vogLijst.length + ' talenten vóór schooljaar ' + sjV && a.eigenaar === 'Iris Mulder'; }), 'vogRun: iedereen zonder verse VOG voor volgend schooljaar krijgt een mail (' + vogMails + ' van ' + vogLijst.length + ', schooljaar ' + sjV + '); het talentteam één verzameltaak');
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
    '20261051;' + plusDagen(-5).split('-').reverse().join('-') + ';Esdoorn;1.100,00;', '99990001;' + plusDagen(-1).split('-').reverse().join('-') + ';Onbekend;500,00;'].join('\n');  // v7.2: het csv-venster loopt tot gisteren, zodat 20261052 (verzonden d(-2)) er het hele jaar in valt, ook als 31 oktober allang voorbij is
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
  eis(String(ctx.vind('Scholen', school.id).laatsteContact).slice(0, 10) === plusDagen(0) && String(ctx.vind('Kansen', 'k16').laatsteContact).slice(0, 10) === plusDagen(0), 'een gelogd gesprek zet laatsteContact van de school en haar open kans op vandaag');  // v7.2: mutatietest (laatste_contact_niets); seed: s1 had gisteren contact, k16 is haar open kans
  var ev = roep(LARS, 'apiActiviteitToevoegen', { vorm: 'evaluatie-online', schoolId: school.id, onderwerp: 'Evaluatie periode 1' });
  var rijWa = ctx.vind('Activiteiten', wa.id);
  eis(wa.type === 'gesprek' && wa.vorm === 'whatsapp' && rijWa.vorm === 'whatsapp' && ev.type === 'afspraak' && ev.vorm === 'evaluatie-online', 'WhatsApp telt als gesprek, een evaluatiegesprek als afspraak; de vorm staat in de Sheet');
  var oud = roep(LARS, 'apiActiviteitToevoegen', { type: 'gesprek', schoolId: school.id, onderwerp: 'Oude aanroep met alleen type' });
  eis(oud.vorm === 'call', 'een aanroep met alleen type (oude app, assistent) krijgt de vorm van het type');
  var bel = roep(LARS, 'apiActiviteitToevoegen', { vorm: 'call', schoolId: school.id, onderwerp: 'Belletje' });  // v7.2: mutatietest (vorm_call_afspraak)
  eis(bel.type === 'gesprek' && bel.vorm === 'call' && ctx.vind('Activiteiten', bel.id).type === 'gesprek', 'een call telt als gesprek (type uit TYPE_VAN_VORM)');
  eis(ctx.TYPE_VAN_VORM.call === 'gesprek' && ctx.TYPE_VAN_VORM.whatsapp === 'gesprek' && ctx.TYPE_VAN_VORM['afspraak-online'] === 'afspraak', 'TYPE_VAN_VORM: call en whatsapp zijn gesprekken, een afspraak een afspraak');  // v7.2
  var na = roep(SOPHIE, 'apiActiviteiten', '', '', '', '');
  eis(na.totaal === voor.totaal + 4 && (na.perType.gesprek || 0) === (voor.perType.gesprek || 0) + 3 && (na.perType.afspraak || 0) === (voor.perType.afspraak || 0) + 1, 'de rapporttelling per type telt de nieuwe soorten mee in de bestaande cijfers');  // v7.2: + de call
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

/* ---- v7.2: robuust — invoercontroles uit de fuzzer, lezen volgt de rechtentabel, portaal, kalenderdagen rond de zomertijd ---- */
(function () {
  var CtxDate = vm.runInContext('Date', ctx);  // de Date van de context (instanceof in Code.gs; test/tz_klok.js vervangt hem onder een vaste klok)
  var kal = function (n, basis) { var b = basis || new CtxDate(); return new CtxDate(b.getFullYear(), b.getMonth(), b.getDate() + n, 12); };  // kalenderrekenen met componenten (12:00), zomertijdbestendig
  // fuzz FZ-1/FZ-2: een lijst of object waar een tekst of een object hoort
  eis(roep(SOPHIE, 'apiFacturenExport', []).bestandsnaam.indexOf('facturen-aangemaakt-') === 0 && roep(FEMKE, 'apiFacturenExport', {}).bestandsnaam.indexOf('facturen-aangemaakt-') === 0 && roep(SOPHIE, 'apiFacturenExport', 'verzonden').bestandsnaam.indexOf('facturen-verzonden-') === 0, 'apiFacturenExport: alleen een tekst telt als status, anders de standaard aangemaakt');
  eis(/minstens één mijlpaal/.test(faalt(SOPHIE, 'apiMijlpalenOpslaan', [null])) && /minstens één mijlpaal/.test(faalt(SOPHIE, 'apiMijlpalenOpslaan', [{ mijlpaal: 'intake' }, 'tekst'])) && /minstens één mijlpaal/.test(faalt(SOPHIE, 'apiMijlpalenOpslaan', [])), 'apiMijlpalenOpslaan: elk element moet een object zijn');
  // fuzz FZ-3 t/m FZ-7: sleutels uit Object.prototype zijn geen keuze (ze gaven een functie of Object.prototype als tabel/actie en daarmee een TypeError)
  ['constructor', 'toString', '__proto__', 'hasOwnProperty'].forEach(function (s) {
    eis(/Onbekend soort/.test(faalt(LARS, 'apiVerwijder', s, 'tk2')) && /Onbekende tabel/.test(faalt(SOPHIE, 'apiExport', s)) && /Onbekend tabblad/.test(faalt(SOPHIE, 'apiExportAlles', s, 0, 50)) &&
      /Onbekende actie/.test(faalt(FEMKE, 'apiBreinUitvoeren', { soort: s, invoer: { tekst: 'x' } })) && /Onbekend contenttype/.test(faalt(SOPHIE, 'apiMaakContent', s, 'Onderwerp')) && /Onbekende lijst/.test(faalt(SOPHIE, 'apiKeuzelijstOpslaan', s, [])) && /Onbekend huisstijlveld: /.test(faalt(SOPHIE, 'apiHuisstijlOpslaan', JSON.parse('{"' + s + '":"x"}'))),  // v7.3: apiZetHuisstijl is weg (K2); JSON.parse maakt van __proto__ een eigen sleutel, zoals doPost dat ook doet
      'geërfde sleutel "' + s + '" is geen soort, tabel, tabblad, actie, contenttype, lijst of huisstijlveld');
  });
  eis(/Onbekend tabblad \(leeg\)/.test(faalt(SOPHIE, 'apiExportAlles')) && /Onbekend tabblad \(leeg\)/.test(faalt(SOPHIE, 'apiExportAlles', '')) && roep(SOPHIE, 'apiExportAlles', 'Scholen', 0, 5).rijen.length === 5, 'apiExportAlles: zonder tabblad een melding met (leeg), niet undefined; een echt tabblad werkt');
  eis(/Onbekend huisstijlveld: \(leeg\)/.test(faalt(SOPHIE, 'apiHuisstijlOpslaan', { '': 'x' })) && /Onbekend huisstijlveld: kleur_x$/.test(faalt(SOPHIE, 'apiHuisstijlOpslaan', { kleur_x: '#000000' })), 'apiHuisstijlOpslaan: de melding noemt de sleutel of (leeg)');  // v7.3: via apiHuisstijlOpslaan (apiZetHuisstijl is weg, K2)
  // rechten R2: ook lezen van een school of persoon volgt de rechtentabel (elk team heeft nu 'alles' op relaties.zien; alleen de tabel bepaalt dat)
  eis(!faalt(SEM, 'apiSchool', 's1') && !faalt(FEMKE, 'apiPersoon', 'p1') && !faalt(LARS, 'apiSchool', 's1'), 'apiSchool en apiPersoon: elk team mag lezen volgens de tabel');
  var oudRelaties = ctx.RECHTEN.relaties.talent; ctx.RECHTEN.relaties.talent = ['geen', 'geen'];
  try { eis(/toegang/.test(faalt(SEM, 'apiSchool', 's1')) && /toegang/.test(faalt(SEM, 'apiPersoon', 'p1')) && !faalt(LARS, 'apiSchool', 's1'), 'apiSchool en apiPersoon: zonder relaties.zien in de tabel geweigerd (alleen voor dat team)'); }
  finally { ctx.RECHTEN.relaties.talent = oudRelaties; }
  // portaal R3: alleen een echte boolean bevestigt; een tekst als raster (verschoven argumenten) wordt geweigerd en bevestigt of logt niets
  ctx._demoCache = {};  // het budget van 30 verzoeken per token is hierboven al opgebruikt
  var portaalActs = function () { return ctx.lees('Activiteiten').filter(function (a) { return a.talentId === 'tl2' && a.door === 'Portaal'; }); }, actVoor = portaalActs().length;
  var r3 = portaal(TOKEN, 'apiPortaalBeschikbaarheid', TOKEN2, { ma: [1, 1, 1] }, [], false);
  eis(!r3.ok && /Geen beschikbaarheid/.test(r3.fout) && portaalActs().length === actVoor, 'portaal: een tekst als raster (token van een ander als eerste argument) wordt geweigerd zonder te bevestigen of te loggen');
  var r3b = portaal(TOKEN, 'apiPortaalBeschikbaarheid', { ma: [1, 1, 1], di: [0, 0, 0], wo: [0, 0, 0], do: [0, 0, 0], vr: [0, 0, 0], za: [0, 0, 0], zo: [0, 0, 0] }, [], { toch: true });
  eis(r3b.ok && JSON.parse(ctx.vind('Talenten', 'tl2').beschikbaarheid).ma.join() === '1,1,1' && /aangepast via mail/.test(portaalActs().pop().onderwerp), 'portaal: een object als alleenBevestigen telt niet als bevestigen; het raster wordt gewoon aangepast en zo gelogd');
  // tijdzone TZ-3/TZ-5: plusDagen en dagenTot rekenen in kalenderdagen (test/tz_test.js draait deze rooktest ook onder vaste klokken rond de zomertijdwissel)
  eis([1, -1, 7, 14, -60, -365].every(function (n) { return plusDagen(n) === ctx.datumStr(kal(n)); }), 'plusDagen rekent in kalenderdagen');
  eis(ctx.dagenTot(ctx.datumStr(kal(0))) === 0 && ctx.dagenTot(ctx.datumStr(kal(1))) === 1 && ctx.dagenTot(ctx.datumStr(kal(2))) === 2 && ctx.dagenTot(ctx.datumStr(kal(-1))) === -1 && ctx.dagenTot(ctx.datumStr(kal(-3))) === -3 && ctx.dagenTot('') === null, 'dagenTot rekent in kalenderdagen: vandaag 0, morgen 1, gisteren -1');
  // tijdzone TZ-4: de beoordelingstaak na plaatsing staat 42 kalenderdagen na de start, ook als de zomertijd in die zes weken wisselt (eerste toekomstige start waarbij dat zo is)
  var startK = null;
  for (var zoek = 1; zoek < 400 && !startK; zoek++) { var a4 = kal(zoek); if (a4.getTimezoneOffset() !== kal(42, a4).getTimezoneOffset()) startK = a4; }
  if (!startK) { startK = kal(10); console.log('info tijdzone zonder zomertijd (' + Intl.DateTimeFormat().resolvedOptions().timeZone + '): start over tien dagen, zonder wissel in de zes weken'); }
  var startS = ctx.datumStr(startK), verwachtK = ctx.datumStr(kal(42, startK));
  roep(RUBEN, 'apiKandidaatOpslaan', { id: 'c12', status: 'geplaatst', start: startS, _oud: { status: 'voorgesteld' } });  // Sara Peeters bij Kompas College (project t9 van Ruben)
  var bk = acties().filter(function (a) { return /Beoordeel Sara Peeters/.test(a.tekst); })[0];
  eis(!!bk && bk.deadline === verwachtK && ctx.vind('Kandidaten', 'c12').start === startS, 'geplaatst met start ' + startS + ': beoordelingstaak op ' + verwachtK + ' (42 kalenderdagen, over de zomertijdwissel heen)');
  // tijdzone TZ-7: de agendavensters eindigen op een kalenderdag (00:00 van de dag erna), niet 24 uur na 00:00
  var d10 = kal(10), d6 = kal(6), d7 = kal(7);
  ctx._demoAgenda.push(ctx._demoEvent('ev-tz-laat10', 'Laat overleg dag 10 (tz-test)', new CtxDate(d10.getFullYear(), d10.getMonth(), d10.getDate(), 23, 30), 30, ''),
    ctx._demoEvent('ev-tz-erna10', 'Nachtelijk overleg dag 11 (tz-test)', new CtxDate(d10.getFullYear(), d10.getMonth(), d10.getDate() + 1, 0, 30), 30, ''),
    ctx._demoEvent('ev-tz-laat6', 'Laat overleg dag 6 (tz-test)', new CtxDate(d6.getFullYear(), d6.getMonth(), d6.getDate(), 23, 30), 30, ''),
    ctx._demoEvent('ev-tz-vroeg7', 'Vroeg overleg dag 7 (tz-test)', new CtxDate(d7.getFullYear(), d7.getMonth(), d7.getDate(), 0, 30), 30, ''));
  var agTitels = roep(SOPHIE, 'apiAgenda', plusDagen(-3), ctx.datumStr(d10)).events.map(function (e) { return e.titel; }), homeTitels = roep(SOPHIE, 'apiHome').agenda.map(function (e) { return e.titel; });
  eis(agTitels.indexOf('Laat overleg dag 10 (tz-test)') >= 0 && agTitels.indexOf('Nachtelijk overleg dag 11 (tz-test)') < 0, 'apiAgenda: een afspraak om 23:30 op de laatste dag valt in het venster, 00:30 de dag erna niet');
  eis(homeTitels.indexOf('Laat overleg dag 6 (tz-test)') >= 0 && homeTitels.indexOf('Vroeg overleg dag 7 (tz-test)') < 0, 'apiHome: de agenda loopt zeven kalenderdagen (dag 6 om 23:30 erin, dag 7 om 00:30 niet)');
})();

/* ---- v7.2.1: controleer() meldt de versie en afwijkende kolomkoppen (lees() leest op positie) ---- */
(function () {
  ctx.GEBRUIKER = null;
  var c1 = ctx.controleer();
  eis(c1.indexOf('backend 7.3') >= 0 && c1.indexOf('AFWIJKENDE KOP') < 0 && /Scholen: \d+ rijen/.test(c1), 'controleer(): versie 7.3 en geen afwijkende koppen in de demo-sheet');  // v7.3
  var b = ctx.blad('Scholen'), kop = ctx.TABELLEN.Scholen, was = b.getRange(1, 2, 1, 1).getValues()[0][0];
  b.getRange(1, 2, 1, 1).setValues([['schoolnaam']]);
  var c2 = ctx.controleer(), regel = c2.split('\n').filter(function (r) { return r.indexOf('- Scholen:') === 0; })[0] || '';
  eis(regel.indexOf('AFWIJKENDE KOP (kolom 2: "schoolnaam" moet "' + kop[1] + '" zijn)') > 0, 'controleer(): een hernoemde kop wordt gemeld met positie, gevonden en verwachte naam');
  b.getRange(1, 2, 1, 1).setValues([[was]]);
  eis(ctx.controleer().indexOf('AFWIJKENDE KOP') < 0, 'controleer(): na herstel van de kop geen melding meer');
})();

/* ---- v7.3: schrijfpaden (K3) — tracks, hernoemen, schooljaar, doelen, termijnen, meldingen, documenten, teksten, huisstijl, inrichten, Capsule ---- */
var YARA = 'demo-yara';
function tel(tab, fn) { return ctx.lees(tab).filter(fn).length; }
(function () {
  // tracks: opslaan (management) → starten → stoppen → verwijderen; een ander team komt er niet bij
  var tr = roep(SOPHIE, 'apiTrackOpslaan', { naam: 'Rooktest-track', omschrijving: 'Twee stappen', stappen: [{ tekst: 'Rooktest stap 1', categorie: 'bellen', dagenNaStart: 0, prio: 'hoog' }, { tekst: 'Rooktest stap 2', categorie: 'onzin', dagenNaStart: 3 }] });
  var track = tr.filter(function (t) { return t.naam === 'Rooktest-track'; })[0];
  eis(!!track && track.stappen.length === 2 && track.stappen[1].categorie === 'overig' && track.stappen[1].prio === 'midden' && tr.some(function (t) { return t.id === 'std-lead'; }), 'apiTrackOpslaan: de nieuwe track staat in de lijst (onbekende categorie → overig, prio → midden), de standaardtracks blijven');
  eis(/management/i.test(faalt(LARS, 'apiTrackOpslaan', { naam: 'x', stappen: [{ tekst: 'y' }] })) && /Naam/.test(faalt(SOPHIE, 'apiTrackOpslaan', { stappen: [{ tekst: 'y' }] })) && /minstens één stap/.test(faalt(SOPHIE, 'apiTrackOpslaan', { naam: 'x', stappen: [] })), 'apiTrackOpslaan: alleen management; naam en minstens één stap verplicht');
  var st = roep(LARS, 'apiTrackStart', track.id, { schoolId: 's1' }, plusDagen(1));
  var runRijen = acties().filter(function (a) { return a.bron === 'track' && /^Rooktest stap/.test(a.tekst); }), runId = runRijen[0] && runRijen[0].trackRunId;
  eis(st.aantal === 2 && st.track === 'Rooktest-track' && runRijen.length === 2 && !!runId && runRijen.every(function (a) { return a.trackRunId === runId && a.eigenaar === 'Lars Visser' && a.schoolId === 's1' && a.status === 'open'; }) && runRijen.filter(function (a) { return a.tekst === 'Rooktest stap 2'; })[0].deadline === plusDagen(4), 'apiTrackStart: twee open taken voor de starter, met dezelfde run en deadlines vanaf de startdatum');
  eis(/toegang/.test(faalt(FEMKE, 'apiTrackStart', track.id, { kansId: 'k7' }, plusDagen(1))) && /Koppel/.test(faalt(LARS, 'apiTrackStart', track.id, {}, plusDagen(1))) && /niet gevonden/.test(faalt(LARS, 'apiTrackStart', 'geen-track', { schoolId: 's1' })), 'apiTrackStart: een track op de kans van een ander team geeft "toegang"; zonder koppeling of met een onbekende track een duidelijke melding');
  eis(/toegang/.test(faalt(FEMKE, 'apiTrackStoppen', runId)) && acties().filter(function (a) { return a.trackRunId === runId && a.status !== 'af'; }).length === 2, 'apiTrackStoppen: een ander team stopt de track niet (de taken blijven staan)');
  roep(LARS, 'apiActieKlaar', runRijen[0].id);
  var stop = roep(LARS, 'apiTrackStoppen', runId), rest = acties().filter(function (a) { return a.trackRunId === runId; });
  eis(stop.aantal === 1 && rest.length === 1 && rest[0].status === 'af' && ctx.lees('Activiteiten').some(function (a) { return /Track gestopt \(1 open taken/.test(a.onderwerp) && a.schoolId === 's1'; }), 'apiTrackStoppen: alleen de open taak van de run gaat weg, de afgevinkte blijft; tijdlijnregel op de school');
  eis(roep(LARS, 'apiTrackStoppen', runId).aantal === 0 && /Geen track/.test(faalt(LARS, 'apiTrackStoppen', '')), 'apiTrackStoppen: nog eens stoppen doet niets; zonder run een melding');
  eis(/management/i.test(faalt(LARS, 'apiTrackVerwijderen', track.id)), 'apiTrackVerwijderen: alleen management');
  var na = roep(SOPHIE, 'apiTrackVerwijderen', track.id);
  eis(!na.some(function (t) { return t.id === track.id; }) && na.some(function (t) { return t.id === 'std-lead'; }) && roep(LARS, 'apiTaken').tracks.length === na.length, 'apiTrackVerwijderen: de track is weg, de standaardtracks blijven; apiTaken geeft dezelfde lijst');

  // tags en eigen velden hernoemen: aantal = het aantal geraakte rijen volgens de Sheet
  var TAGTABS = ['Scholen', 'Personen', 'Kansen', 'Acties', 'Talenten'], VELDTABS = ['Scholen', 'Personen', 'Kansen', 'Talenten'];
  var metTag = function (tag) { var n = 0; TAGTABS.forEach(function (t) { n += tel(t, function (r) { return ctx.tagsUit(r.tags).map(ctx.klein).indexOf(tag) >= 0; }); }); return n; };
  var nRooster = metTag('rooster'), hr = roep(SOPHIE, 'apiTagHernoem', 'Rooster', 'rooster-proef');
  eis(nRooster >= 2 && hr.aantal === nRooster && metTag('rooster') === 0 && metTag('rooster-proef') === nRooster, 'apiTagHernoem: aantal = de rijen die de tag droegen (' + nRooster + '), de oude tag is overal weg en de nieuwe staat erop');
  eis(roep(SOPHIE, 'apiTagHernoem', 'rooster-proef', 'rooster').aantal === nRooster && metTag('rooster') === nRooster && roep(SOPHIE, 'apiTagHernoem', 'bestaat-niet', 'x').aantal === 0 && /Welke tag/.test(faalt(SOPHIE, 'apiTagHernoem', '', 'x')) && /management/i.test(faalt(LARS, 'apiTagHernoem', 'rooster', 'x')), 'apiTagHernoem: terug hernoemen, onbekende tag raakt niets, lege tag en een ander team worden geweigerd');
  roep(SOPHIE, 'apiSchoolOpslaan', { id: 's1', velden: { proefveld: 'ja' } }); roep(SOPHIE, 'apiPersoonOpslaan', { id: 'p1', velden: { proefveld: 'ook', ander: 1 } });
  var metVeld = function (k) { var n = 0; VELDTABS.forEach(function (t) { n += tel(t, function (r) { return Object.prototype.hasOwnProperty.call(ctx.veldenUit(r.velden), k); }); }); return n; };
  var hv = roep(SOPHIE, 'apiVeldHernoem', 'proefveld', 'proefveld2');
  eis(hv.aantal === 2 && metVeld('proefveld') === 0 && metVeld('proefveld2') === 2 && ctx.veldenUit(ctx.vind('Personen', 'p1').velden).ander === 1 && roep(SOPHIE, 'apiVelden').velden.some(function (v) { return v.naam === 'proefveld2' && v.aantal === 2; }), 'apiVeldHernoem: beide rijen hernoemd, andere velden blijven, apiVelden telt het nieuwe veld');
  eis(roep(SOPHIE, 'apiVeldHernoem', 'proefveld2', '').aantal === 2 && metVeld('proefveld2') === 0 && /Welk veld/.test(faalt(SOPHIE, 'apiVeldHernoem', '', 'x')) && /management/i.test(faalt(LARS, 'apiVeldHernoem', 'ander', 'x')), 'apiVeldHernoem: leeg = het veld overal weghalen; lege naam en een ander team worden geweigerd');

  // schooljaar vastzetten: normaliseren, teruglezen, ongeldig, alleen management, weer automatisch
  var sjAuto = ctx.schooljaarOpDatum(), sjVast = (Number(sjAuto.slice(0, 4)) + 1) + '-' + (Number(sjAuto.slice(0, 4)) + 2);
  eis(roep(SOPHIE, 'apiSchooljaarOpslaan', "'" + sjVast.slice(2, 4) + "/'" + sjVast.slice(7, 9)).schooljaar === sjVast && roep(LARS, 'apiInstellingen').schooljaarHandmatig === sjVast && roep(LARS, 'apiInstellingen').schooljaar === sjVast && roep(LARS, 'apiTrajecten').schooljaar === sjVast, "apiSchooljaarOpslaan: '" + sjVast.slice(2, 4) + "/'" + sjVast.slice(7, 9) + ' wordt ' + sjVast + ' en geldt meteen overal');
  eis(/als 2027-2028/.test(faalt(SOPHIE, 'apiSchooljaarOpslaan', '2027-2029')) && /als 2027-2028/.test(faalt(SOPHIE, 'apiSchooljaarOpslaan', 'volgend jaar')) && /management/i.test(faalt(FEMKE, 'apiSchooljaarOpslaan', '')) && roep(LARS, 'apiInstellingen').schooljaar === sjVast, 'apiSchooljaarOpslaan: ongeldige waarden en een ander team worden geweigerd zonder iets te wijzigen');
  eis(roep(SOPHIE, 'apiSchooljaarOpslaan', '').schooljaar === sjAuto && roep(LARS, 'apiInstellingen').schooljaarHandmatig === '', 'apiSchooljaarOpslaan: leeg = weer automatisch op datum');

  // doelen: zetten, teruglezen in apiDoelen en in het rapport, rechten
  var dl = roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'kwartaal', metric: 'gesprekken', doel: 17 });
  var dRij = dl.doelen.filter(function (d) { return d.eigenaar === 'Lars Visser' && d.periode === 'kwartaal' && d.metric === 'gesprekken'; });
  eis(dRij.length === 1 && dRij[0].doel === 17 && dRij[0].id === 'lars-visser-kwartaal-gesprekken' && roep(LARS, 'apiDoelen').doelen.some(function (d) { return d.id === dRij[0].id; }) && roep(LARS, 'apiRapport', 'kwartaal', '', 0).perPersoon.filter(function (p) { return p.naam === 'Lars Visser'; })[0].doelen.gesprekken === 17, 'apiDoelOpslaan: één rij met een stabiel id, zichtbaar in apiDoelen van de eigenaar en als doel in zijn rapport');
  eis(roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'kwartaal', metric: 'gesprekken', doel: 20 }).doelen.filter(function (d) { return d.id === dRij[0].id; })[0].doel === 20 && tel('Doelen', function (d) { return d.id === dRij[0].id; }) === 1, 'apiDoelOpslaan: dezelfde persoon, periode en maatstaf overschrijft (geen tweede rij)');
  eis(/teamlead/.test(faalt(FEMKE, 'apiDoelOpslaan', { eigenaar: 'Femke de Wit', periode: 'maand', metric: 'gesprekken', doel: 3 })) && /management/.test(faalt(IRIS, 'apiDoelOpslaan', { eigenaar: 'bedrijf', periode: 'schooljaar', metric: 'omzet', doel: 1 })) && /Kies een persoon/.test(faalt(SOPHIE, 'apiDoelOpslaan', { periode: 'maand', metric: 'gesprekken' })) && /Onbekende maatstaf/.test(faalt(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'maand', metric: 'onzin' })), 'apiDoelOpslaan: een medewerker zet geen doelen, bedrijfsdoelen alleen het management; persoon en maatstaf verplicht');
  eis(!faalt(YARA, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'week', metric: 'gesprekken', doel: 4 }) && /teamlead/.test(faalt(YARA, 'apiDoelOpslaan', { eigenaar: 'Femke de Wit', periode: 'week', metric: 'gesprekken', doel: 4 })), 'apiDoelOpslaan: een teamlead zet doelen voor zijn eigen team, niet voor een ander team');

  // termijnen in één keer: som = contractwaarde (in centen), tweede aanroep maakt geen dubbele
  var jaar = Number(plusDagen(0).slice(0, 4)), pF = roep(SOPHIE, 'apiTrajectOpslaan', { school: 'Rooktest Facturatieschool', traject: 'Termijnen', start: jaar + '-09-01', eind: (jaar + 1) + '-06-30', contractwaarde: '10000,01', omzet: 9000, am: 'Femke de Wit' });
  var f1 = roep(FEMKE, 'apiFacturenMaken', pF.id, { per: 'maand' }), somF = f1.reduce(function (s, f) { return s + Math.round(f.bedrag * 100); }, 0);
  eis(f1.length === 10 && somF === 1000001 && f1.every(function (f) { return f.status === 'nog te doen' && f.trajectId === pF.id && f.door === 'Femke de Wit'; }) && /^September/.test(f1[0].omschrijving) && /^Juni/.test(f1[9].omschrijving), 'apiFacturenMaken: tien maandtermijnen (juli en augustus overgeslagen) die in centen precies optellen tot de contractwaarde, niet tot de omzet');
  eis(roep(FEMKE, 'apiFacturenMaken', pF.id, { per: 'maand' }).length === 10 && tel('Facturen', function (f) { return f.trajectId === pF.id; }) === 10, 'apiFacturenMaken: een tweede aanroep maakt geen dubbele termijnen');
  var fE = roep(FEMKE, 'apiFacturenMaken', pF.id, { per: 'eenmalig', omschrijving: 'Hele contract vooraf' });
  eis(fE.length === 11 && fE.some(function (f) { return f.omschrijving === 'Hele contract vooraf' && Math.round(f.bedrag * 100) === 1000001; }), 'apiFacturenMaken: eenmalig = één termijn met het hele contract');
  eis(/toegang/.test(faalt(LARS, 'apiFacturenMaken', pF.id, { per: 'maand' })) && /toegang/.test(faalt(RUBEN, 'apiFacturenMaken', pF.id, { per: 'maand' })) && /start- en einddatum/.test(faalt(SOPHIE, 'apiFacturenMaken', losP.id, { per: 'maand' })), 'apiFacturenMaken: consultant en een andere AM komen er niet bij; zonder start en eind een melding');

  // meldingen gelezen: alleen de eigen rijen
  var ongelezen = function (naam) { return tel('Meldingen', function (m) { return m.voor === naam && !m.gelezen; }); };
  roep(SOPHIE, 'apiTaakOpslaan', { tekst: 'Rooktest melding voor Femke', eigenaar: 'Femke de Wit' }); roep(SOPHIE, 'apiTaakOpslaan', { tekst: 'Rooktest melding voor Lars', eigenaar: 'Lars Visser' });
  var fVoor = ongelezen('Femke de Wit'), lVoor = ongelezen('Lars Visser'), mg = roep(FEMKE, 'apiMeldingenGelezen');
  eis(fVoor >= 2 && lVoor >= 1 && mg.aantal === fVoor && ongelezen('Femke de Wit') === 0 && ongelezen('Lars Visser') === lVoor && roep(FEMKE, 'apiMeldingen').every(function (m) { return m.gelezen === true; }) && roep(LARS, 'apiCrm').meldingen === lVoor, 'apiMeldingenGelezen: zet alleen de eigen ongelezen meldingen (' + fVoor + ') op gelezen; die van een ander blijven ongelezen');
  eis(roep(FEMKE, 'apiMeldingenGelezen').aantal === 0, 'apiMeldingenGelezen: tweede keer niets meer te doen');

  // document corrigeren, tekst wijzigen, huisstijl opslaan en teruglezen
  var doc0 = ctx.lees('Documenten')[0], dOp = roep(SOPHIE, 'apiDocumentOpslaan', doc0.id, { type: 'werkwijze', school: 'Esdoorn Lyceum' }), corr = ctx.instelling('documentCorrecties') || {};
  eis(dOp.id === doc0.id && dOp.type === 'werkwijze' && dOp.school === 'Esdoorn Lyceum' && ctx.vind('Documenten', doc0.id).type === 'werkwijze' && roep(SOPHIE, 'apiKennisbank').documenten.some(function (d) { return d.id === doc0.id && d.type === 'werkwijze' && d.school === 'Esdoorn Lyceum'; }) && Object.keys(corr).some(function (k) { return corr[k].type === 'werkwijze' && corr[k].school === 'Esdoorn Lyceum'; }), 'apiDocumentOpslaan: type en school staan in de Sheet, in de kennisbank en als correctie in Instellingen');
  eis(/Onbekend type/.test(faalt(SOPHIE, 'apiDocumentOpslaan', doc0.id, { type: 'roman' })) && /niet gevonden/.test(faalt(SOPHIE, 'apiDocumentOpslaan', 'geen-doc', { type: 'overig' })) && /verwacht tekst/.test(faalt(SOPHIE, 'apiDocumentOpslaan', doc0.id, { school: { naam: 'x' } })), 'apiDocumentOpslaan: onbekend type, onbekend document en een object als school worden geweigerd');
  var ct = roep(LARS, 'apiMaakContent', 'linkedin', 'Rooktest onderwerp', 'kort'), cw = roep(LARS, 'apiContentOpslaan', { id: ct.id, onderwerp: ' Rooktest gewijzigd ', tekst: 'Nieuwe tekst.' });
  eis(ct.id && ct.typeNaam === 'LinkedIn-post' && cw.onderwerp === 'Rooktest gewijzigd' && cw.tekst === 'Nieuwe tekst.' && cw.door === 'Lars Visser' && ctx.vind('Content', ct.id).tekst === 'Nieuwe tekst.' && roep(LARS, 'apiHuisstijl').recent.some(function (c) { return c.id === ct.id && c.magWijzigen === true; }) && roep(FEMKE, 'apiHuisstijl').recent.some(function (c) { return c.id === ct.id && c.magWijzigen === false; }), 'apiContentOpslaan: de maker wijzigt zijn tekst (getrimd), die staat in de Sheet en bij recent met magWijzigen alleen voor hem');
  eis(/Alleen wie de tekst maakte/.test(faalt(FEMKE, 'apiContentOpslaan', { id: ct.id, tekst: 'Gekaapt' })) && /leeg/.test(faalt(LARS, 'apiContentOpslaan', { id: ct.id, tekst: '  ' })) && /niet gevonden/.test(faalt(LARS, 'apiContentOpslaan', { id: 'geen' })) && !faalt(SOPHIE, 'apiContentOpslaan', { id: ct.id, onderwerp: 'Door management' }) && ctx.vind('Content', ct.id).tekst === 'Nieuwe tekst.', 'apiContentOpslaan: een ander niet, een lege tekst niet, het management wel');
  var hs = roep(SOPHIE, 'apiHuisstijlOpslaan', { toon: 'Rooktest toon\nTweede regel', kleur_accent: '#ABCDEF' });
  eis(hs.velden.toon === 'Rooktest toon\nTweede regel' && hs.toon.length === 2 && hs.velden.kleur_accent === '#ABCDEF' && hs.kleuren.filter(function (k) { return k.gebruik === 'accent'; })[0].hex === '#ABCDEF' && roep(LARS, 'apiHuisstijl').velden.toon === 'Rooktest toon\nTweede regel' && hs.magBewerken === true && roep(LARS, 'apiHuisstijl').magBewerken === false, 'apiHuisstijlOpslaan: meerdere velden in één keer, teruglezen via apiHuisstijl (toon als regels, kleur in de kleurenlijst); bewerken alleen management');
  eis(/Kleur als #RRGGBB/.test(faalt(SOPHIE, 'apiHuisstijlOpslaan', { kleur_primair: 'paars' })) && /management/i.test(faalt(LARS, 'apiHuisstijlOpslaan', { toon: 'x' })) && /verwacht tekst/.test(faalt(SOPHIE, 'apiHuisstijlOpslaan', { toon: ['x'] })) && roep(LARS, 'apiHuisstijl').velden.kleur_primair === '#66306E' && roep(LARS, 'apiHuisstijl').velden.toon === 'Rooktest toon\nTweede regel', 'apiHuisstijlOpslaan: een ongeldige kleur, een lijst als waarde en een ander team worden geweigerd zonder iets te wijzigen');
  roep(SOPHIE, 'apiHuisstijlOpslaan', { toon: ctx.HUISSTIJL_STANDAARD.toon, kleur_accent: ctx.HUISSTIJL_STANDAARD.kleur_accent });

  // inrichten is idempotent
  var voorI = { Personen: ctx.lees('Personen').length, Scholen: ctx.lees('Scholen').length, Kansen: ctx.lees('Kansen').length };
  var in1 = roep(SOPHIE, 'apiCrmInrichten'), in2 = roep(SOPHIE, 'apiCrmInrichten');
  eis(['personen', 'kansen', 'trajecten', 'notities', 'eigenaren'].every(function (k) { return typeof in1[k] === 'number' && in2[k] === 0; }) && ctx.lees('Personen').length === voorI.Personen + in1.personen && ctx.lees('Scholen').length === voorI.Scholen && ctx.lees('Kansen').length === voorI.Kansen && /management/i.test(faalt(FEMKE, 'apiCrmInrichten')), 'apiCrmInrichten: idempotent (de tweede run doet niets), geen nieuwe scholen of kansen, alleen management');

  // Capsule-migratie met een minimale fictieve export (verzonnen school, geen echte gegevens): elke stap tot volgende = null
  var oudFetch = ctx.UrlFetchApp.fetch, CAP = {
    milestones: [{ id: 1, name: 'Lead', probability: 10, displayOrder: 1, daysUntilStale: 14, pipeline: { name: 'Scholen' } }, { id: 2, name: 'Gesprek', probability: 25, displayOrder: 2, daysUntilStale: 10, pipeline: { name: 'Scholen' } },
      { id: 3, name: 'Voorstel', probability: 50, displayOrder: 3, daysUntilStale: 7, pipeline: { name: 'Scholen' } }, { id: 4, name: 'Onderhandeling', probability: 75, displayOrder: 4, daysUntilStale: 7, pipeline: { name: 'Scholen' } }, { id: 5, name: 'Won', complete: true, probability: 100 }],
    parties: [{ id: 10, type: 'organisation', name: 'Capsule Proefschool', addresses: [{ street: 'Proefstraat 1', zip: '1234 AB', city: 'Proefstad' }], websites: [{ service: 'URL', address: 'www.proefschool.example' }], owner: { name: 'Lars Visser' }, about: 'Uit Capsule', createdAt: '2025-01-05T10:00:00Z', tags: [{ name: 'Capsule' }], fields: [{ definition: { name: 'Bestuur' }, value: 'Stichting Proef' }] },
      { id: 11, type: 'person', firstName: 'Piet', lastName: 'Proef', jobTitle: 'Rector', organisation: { id: 10 }, emailAddresses: [{ address: 'Piet@proefschool.example' }], owner: { name: 'Lars Visser' }, createdAt: '2025-01-06T10:00:00Z' }],
    opportunities: [{ id: 20, name: 'Proefkans', party: { id: 10 }, milestone: { id: 2 }, value: { amount: 5000 }, probability: 25, owner: { name: 'Lars Visser' }, description: 'Uit Capsule', createdAt: '2025-02-01T10:00:00Z' }],
    kases: [{ id: 30, name: 'Proefproject', party: { id: 10 }, status: 'OPEN', openedOn: '2025-09-01', owner: { name: 'Femke de Wit' }, description: 'Uit Capsule', createdAt: '2025-08-20T10:00:00Z' }],
    tasks: [{ id: 40, description: 'Proeftaak', party: { id: 11 }, dueOn: plusDagen(3), status: 'OPEN', category: { name: 'Call' }, owner: { name: 'Lars Visser' }, createdAt: '2025-09-02T10:00:00Z', opportunity: { id: 20 } }],
    entries: [{ id: 50, type: 'note', party: { id: 10 }, entryAt: '2025-09-03T09:00:00Z', creator: { name: 'Lars Visser' }, content: 'Proefnotitie uit Capsule', kase: { id: 30 } }]
  };
  ctx.UrlFetchApp.fetch = function (url, o) {
    if (!/api\.capsulecrm\.com/.test(url)) return oudFetch(url, o);
    var pad = /api\/v2\/([a-z]+)/.exec(url)[1], data = {}; data[pad] = CAP[pad] || [];
    return { getResponseCode: function () { return 200; }, getContentText: function () { return JSON.stringify(data); }, getHeaders: function () { return {}; } };
  };
  try {
    eis(/CAPSULE_TOKEN/.test(faalt(SOPHIE, 'apiCapsuleMigratie', 'mijlpalen', 1)), 'apiCapsuleMigratie: zonder token een duidelijke melding');
    ctx._demoProps.CAPSULE_TOKEN = 'demo-token';
    var stap = { stap: 'mijlpalen', pagina: 1 }, stappen = [], rondes = 0;
    while (stap && rondes++ < 10) { var cr = roep(SOPHIE, 'apiCapsuleMigratie', stap.stap, stap.pagina); stappen.push(cr.stap + ':' + cr.aantal); stap = cr.volgende; }
    eis(stappen.join(' ') === 'mijlpalen:4 partijen:2 kansen:1 projecten:1 taken:1 historie:1' && stap === null, 'apiCapsuleMigratie: alle stappen na elkaar, met per stap het aantal rijen, tot volgende null is (' + stappen.join(' ') + ')');
    var cs = ctx.vind('Scholen', 'cap-o10'), cp = ctx.vind('Personen', 'cap-p11'), ck = ctx.vind('Kansen', 'cap-k20'), cc = ctx.vind('Trajecten', 'cap-c30'), ctk = ctx.vind('Acties', 'cap-t40'), ce = ctx.vind('Activiteiten', 'cap-e50');
    eis(!!cs && cs.naam === 'Capsule Proefschool' && cs.plaats === 'Proefstad' && cs.eigenaar === 'Lars Visser' && cs.status === 'lead' && cs.tags === 'capsule' && ctx.veldenUit(cs.velden).Bestuur === 'Stichting Proef' && String(cs.capsuleId) === '10', 'Capsule: organisatie → school met plaats, eigenaar, tags, eigen veld en capsuleId');
    eis(!!cp && cp.schoolId === 'cap-o10' && cp.email === 'piet@proefschool.example' && cp.functie === 'Rector' && !!ck && ck.schoolId === 'cap-o10' && ck.fase === 'gesprek' && Number(ck.waarde) === 5000 && ck.eigenaar === 'Lars Visser', 'Capsule: persoon aan de school gekoppeld (e-mail klein); kans met fase uit de mijlpaal en waarde');
    eis(!!cc && cc.status === 'bezig' && cc.school === 'Capsule Proefschool' && cc.schoolId === 'cap-o10' && cc.am === 'Femke de Wit' && cc.schooljaar === '2025-2026' && !!ctk && ctk.categorie === 'bellen' && ctk.kansId === 'cap-k20' && ctk.persoonId === 'cap-p11' && ctk.schoolId === 'cap-o10' && ctk.bron === 'capsule' && ctk.status === 'open', 'Capsule: project (open = bezig, schooljaar uit de startdatum) en taak (categorie uit de Capsule-categorie, gekoppeld aan kans, persoon en school)');
    eis(!!ce && ce.type === 'notitie' && ce.trajectId === 'cap-c30' && ce.schoolId === 'cap-o10' && ce.bron === 'capsule' && roep(SOPHIE, 'apiStatus').capsuleMigratie !== '' && ctx.lees('Mijlpalen').map(function (m) { return m.mijlpaal; }).join() === 'lead,gesprek,voorstel,onderhandeling', 'Capsule: historie op de tijdlijn van het project; de migratiedatum in apiStatus; mijlpalen zoals de pipeline van Capsule');
    eis(/management/i.test(faalt(FEMKE, 'apiCapsuleMigratie', 'mijlpalen', 1)) && /Onbekende stap/.test(faalt(SOPHIE, 'apiCapsuleMigratie', 'onzin', 1)), 'apiCapsuleMigratie: alleen management; een onbekende stap wordt geweigerd');
  } finally { ctx.UrlFetchApp.fetch = oudFetch; delete ctx._demoProps.CAPSULE_TOKEN; }
})();

/* ---- v7.3 (K3): lees-api's die alleen de golden master raakte — één gerichte controle op de vorm van het antwoord ---- */
(function () {
  var dz = roep(LARS, 'apiDoelen');
  eis(dz.doelen instanceof Array && dz.doelen.length > 0 && dz.doelen.every(function (d) { return d.eigenaar === 'Lars Visser' || d.eigenaar === 'bedrijf' || d.eigenaar === 'team:consultancy'; }) && dz.metrics instanceof Array && dz.periodes.join() === ctx.DOEL_PERIODES.join() && dz.magZetten === false && roep(YARA, 'apiDoelen').magZetten === true && roep(YARA, 'apiDoelen').eigenaren.some(function (e) { return e.waarde === 'team:consultancy'; }), 'apiDoelen: een medewerker ziet alleen zijn eigen doelen, die van zijn team en de bedrijfsdoelen en mag niets zetten; de teamlead wel, met zijn team als eigenaar');
  var hm = roep(SOPHIE, 'apiHomeMails');
  eis(hm.length === 4 && hm.map(function (m) { return m.dagen; }).sort().join() === '3,4,5,6' && hm.every(function (m) { return m.onderwerp && m.van && /mail\.google\.com/.test(m.link); }), 'apiHomeMails: de onbeantwoorde mails met het aantal kalenderdagen (3, 4, 5, 6), afzender en link');
  var hs = roep(LARS, 'apiHuisstijl');
  eis(hs.velden.bedrijf === 'AthenaSchool' && hs.kleuren.length === 5 && hs.kleuren.every(function (k) { return /^#[0-9A-Fa-f]{6}$/.test(k.hex); }) && hs.types.length === Object.keys(ctx.CONTENT_TYPES).length && hs.toon instanceof Array && hs.zinnen.every(function (z) { return z.titel && z.tekst; }) && hs.recent.length <= 12, 'apiHuisstijl: velden, vijf kleuren als #RRGGBB, de contenttypes, toon en zinnen als lijsten, hoogstens twaalf recente teksten');
  var kb = roep(LARS, 'apiKennisbank');
  eis(kb.documenten.length === ctx.lees('Documenten').length && kb.documenten.every(function (d) { return d.id && d.titel && 'woorden' in d && !('tekst' in d); }) && typeof kb.tellingen === 'object' && 'laatsteIndex' in kb && 'mapUrl' in kb, 'apiKennisbank: alle documenten zonder de volledige tekst, met tellingen, laatste index en map');
  var ml = roep(SOPHIE, 'apiMeldingen');
  eis(ml instanceof Array && ml.length <= 50 && ml.every(function (m, i) { return m.id && typeof m.gelezen === 'boolean' && 'link' in m && m.door !== 'Sophie de Graaf' && (i === 0 || String(ml[i - 1].datum) >= String(m.datum)); }), 'apiMeldingen: hoogstens vijftig eigen meldingen, nieuwste eerst, nooit een melding aan jezelf');
  var rp = roep(LARS, 'apiRapport', 'maand', '', 0);
  eis(rp.perPersoon.length === 1 && rp.perPersoon[0].naam === 'Lars Visser' && typeof rp.totaal === 'object' && rp.van <= rp.tot && ['forecast', 'trechter', 'winst', 'redenen', 'stil'].every(function (k) { return k in rp; }) && roep(SOPHIE, 'apiRapport', 'maand', '', 0).perPersoon.length > 1, 'apiRapport: een medewerker krijgt alleen zijn eigen cijfers (met forecast, trechter, winst, redenen en stille kansen), het management iedereen');
  var rn = roep(SOPHIE, 'apiReviewNu');
  eis(rn.id && rn.datum && rn.gemaaktOp && typeof rn.samenvatting === 'string' && rn.gedaan instanceof Array && rn.blijvenLiggen instanceof Array && rn.vandaag instanceof Array && rn.tellingen.gedaan === rn.gedaan.length && rn.tellingen.vandaag === rn.vandaag.length, 'apiReviewNu: een review met gedaan, blijven liggen, vandaag en kloppende tellingen');
  var rv = roep(SOPHIE, 'apiReview'), rvF = roep(FEMKE, 'apiReview');  // de seed heeft een review van 05:30 vandaag: in een tijdzone waar het nog vroeger is, staat die als laatste, dus alleen de volgorde op gemaaktOp telt
  eis(rv.laatste && rv.laatste.id && rv.laatste.tellingen && rv.laatste.gedaan instanceof Array && [rv.laatste].concat(rv.eerdere).some(function (r) { return r.id === rn.id; }) && rv.eerdere.every(function (r) { return r.id && r.datum && r.tellingen && !('gedaan' in r) && String(r.gemaaktOp) <= String(rv.laatste.gemaaktOp); }) && [rvF.laatste].concat(rvF.eerdere).every(function (r) { return !r || r.id !== rn.id; }), 'apiReview: de laatste review volledig (nieuwste gemaaktOp), eerdere alleen met samenvatting en tellingen; een ander ziet jouw review niet');
  var vl = roep(SOPHIE, 'apiVelden');
  eis(vl.velden instanceof Array && vl.tags.length > 0 && vl.tags.every(function (t, i) { return t.naam === t.naam.toLowerCase() && t.aantal >= 1 && (i === 0 || vl.tags[i - 1].naam <= t.naam); }) && vl.tags.some(function (t) { return t.naam === 'rooster'; }), 'apiVelden: tags in gebruik, klein, gesorteerd en met aantallen; eigen velden als lijst');
  var br = roep(SOPHIE, 'apiBrein', 'Maak een taak om de administratie van Kompas College te bellen', []);
  eis(typeof br.antwoord === 'string' && br.bronnen instanceof Array && br.acties.length === 1 && br.acties[0].soort === 'maak_taak' && br.acties[0].id && br.acties[0].invoer.tekst && !acties().some(function (a) { return a.tekst === br.acties[0].invoer.tekst; }), 'apiBrein: de assistent stelt een actie voor (maak_taak) maar voert haar niet uit; uitvoeren gaat via apiBreinUitvoeren');
  var cs = roep(SOPHIE, 'apiCrmSync');
  eis(typeof cs.mails === 'number' && typeof cs.afspraken === 'number' && typeof cs.bijgewerkt === 'number' && roep(SOPHIE, 'apiCrmSync').mails === 0, 'apiCrmSync: tellingen; een tweede run koppelt dezelfde mails niet nog eens');
  eis(/In de demo staat dit uit/.test(faalt(SOPHIE, 'apiIndexeer')), 'apiIndexeer: in de demo is Drive uitgezet; de melding is Nederlands en noemt de reden');
  var trn = roep(SOPHIE, 'apiTalentRunNu');
  eis(['vog', 'peiling', 'slapend', 'bewaartermijn', 'geocoderen', 'aanmeldingen'].every(function (k) { return k in trn; }) && /management/i.test(faalt(IRIS, 'apiTalentRunNu')), 'apiTalentRunNu: de dagelijkse run met de hand geeft elke stap terug; alleen management');
  var sv = roep(SOPHIE, 'apiSchoolSamenvatting', 's1');
  eis(typeof sv.tekst === 'string' && sv.tekst.length > 20 && /^\d{4}-\d{2}-\d{2}/.test(String(sv.gemaakt)) && /niet gevonden/.test(faalt(SOPHIE, 'apiSchoolSamenvatting', 'geen-school')), 'apiSchoolSamenvatting: een tekst met tijdstempel; een onbekende school een melding');
})();

/* ---- v7.3 (K2): beheerfuncties apiArchiveer en apiImporteer (geen knop in de app; via doPost, alleen management) ---- */
(function () {
  ctx.GEBRUIKER = null;
  ctx.schrijf('Activiteiten', { id: 'act-oud-rooktest', type: 'notitie', datum: plusDagen(-400) + ' 10:00', door: 'Sophie de Graaf', schoolId: 's1', onderwerp: 'Oude notitie (rooktest)', bron: 'app', aangemaakt: plusDagen(-400) + ' 10:00' });
  var grens = plusDagen(-365), jong = tel('Activiteiten', function (a) { var d = String(a.datum).slice(0, 10); return !(d && d < grens); });
  eis(/management/i.test(faalt(FEMKE, 'apiArchiveer')) && !!ctx.vind('Activiteiten', 'act-oud-rooktest'), 'apiArchiveer: een ander team komt er niet bij en er verandert niets');
  var ar = roep(SOPHIE, 'apiArchiveer');
  eis(ar.gearchiveerd >= 1 && ar.over === jong && !ctx.vind('Activiteiten', 'act-oud-rooktest') && !!ctx.vind('Activiteiten_archief', 'act-oud-rooktest') && ctx.lees('Activiteiten').every(function (a) { var d = String(a.datum).slice(0, 10); return !(d && d < grens); }) && typeof ar.uren === 'number', 'apiArchiveer: activiteit ouder dan een jaar gaat naar Activiteiten_archief, de rest blijft (' + ar.over + ' rijen)');
  eis(roep(SOPHIE, 'apiArchiefTijdlijn', 'school', 's1').some(function (a) { return a.id === 'act-oud-rooktest'; }) && roep(SOPHIE, 'apiArchiveer').gearchiveerd === 0, 'apiArchiveer: het archief is via apiArchiefTijdlijn op te vragen; een tweede run archiveert niets');
  var imp1 = roep(SOPHIE, 'apiImporteer', 'scholen', [{ naam: 'Importschool Noord', plaats: 'Proefstad', status: 'lead' }, { naam: 'Importschool Zuid', plaats: 'Proefdorp' }]), sN = ctx.vind('Scholen', 'importschool-noord');
  eis(imp1.ingevoegd === 2 && imp1.bijgewerkt === 0 && imp1.ongewijzigd === 0 && !!sN && sN.naam === 'Importschool Noord' && sN.status === 'lead', 'apiImporteer: twee nieuwe scholen met een stabiel id uit de naam');
  var imp2 = roep(SOPHIE, 'apiImporteer', 'scholen', [{ naam: 'Importschool Noord', plaats: 'Proefstad', status: 'lead' }, { naam: 'Importschool Zuid', plaats: 'Proefstad' }]);
  eis(imp2.ingevoegd === 0 && imp2.bijgewerkt === 1 && imp2.ongewijzigd === 1 && ctx.vind('Scholen', 'importschool-zuid').plaats === 'Proefstad' && tel('Scholen', function (s) { return /^Importschool/.test(s.naam); }) === 2, 'apiImporteer: een herhaalde import werkt bij in plaats van te dupliceren en telt ongewijzigde rijen apart');
  eis(/management/i.test(faalt(FEMKE, 'apiImporteer', 'scholen', [{ naam: 'Gekaapt' }])) && !ctx.lees('Scholen').some(function (s) { return s.naam === 'Gekaapt'; }) && /scholen, trajecten, kansen of acties/.test(faalt(SOPHIE, 'apiImporteer', 'talenten', [])) && /lijst/.test(faalt(SOPHIE, 'apiImporteer', 'scholen', {})), 'apiImporteer: alleen management ("Alleen het management kan dit."); alleen de vier tabellen; rijen moet een lijst zijn');
})();

/* ---- v7.3 (H1): apiTrajectOpslaan — rondreis over elk bewerkbaar veld, en de whitelist tegenover trajectVelden() in index.html ---- */
(function () {
  var code = fs.readFileSync(process.env.CODE_GS || path.join(R, 'backend/Code.gs'), 'utf8');
  var wl = /function apiTrajectOpslaan\(obj\) \{[\s\S]*?var velden = \[([\s\S]*?)\], schoon = \{\}/.exec(code);
  var whitelist = wl ? (wl[1].replace(/\/\/[^\n]*/g, '').match(/'([A-Za-z]+)'/g) || []).map(function (s) { return s.replace(/'/g, ''); }) : [];
  eis(whitelist.length >= 30 && whitelist.indexOf('xpsProject') >= 0 && whitelist.indexOf('contractwaarde') >= 0, 'whitelist van apiTrajectOpslaan gelezen uit Code.gs (' + whitelist.length + ' velden)');
  var html = fs.readFileSync(path.join(R, 'index.html'), 'utf8'), fm = /function trajectVelden\(t\) \{([\s\S]*?)\n  \}\n/.exec(html);
  var appVelden = [], rx = /naam: '([A-Za-z]+)'|kies\('([A-Za-z]+)'/g, m;
  while (fm && (m = rx.exec(fm[1]))) appVelden.push(m[1] || m[2]);
  var UITZONDERINGEN_APP = {};  // veldnaam in trajectVelden → reden waarom hij niet in de whitelist hoeft (bijv. alleen weergave); nu geen
  var ontbreekt = appVelden.filter(function (v) { return whitelist.indexOf(v) < 0 && !UITZONDERINGEN_APP[v]; });
  eis(appVelden.length >= 25 && !ontbreekt.length, 'elk veld van trajectVelden() in index.html (' + appVelden.length + ') staat in de whitelist van apiTrajectOpslaan' + (ontbreekt.length ? ' — ONTBREEKT IN DE BACKEND: ' + ontbreekt.join(', ') : ''));
  var sj = ctx.huidigSchooljaar(), jaar = Number(sj.slice(0, 4));
  var W = { schoolId: 's1', plaats: 'Proefplaats', traject: 'Rondreis traject', schooljaar: sj, start: jaar + '-09-07', eind: (jaar + 1) + '-06-21', status: 'opstart', ondersteuners: 3, urenPerWeek: 18, tarief: 47.5, omzet: 12345, contactpersoon: 'Contact Rondreis', am: 'Femke de Wit', samenvatting: 'Samenvatting rondreis',
    kansId: 'k1', adviseur: 'Lars Visser', soortFacturatie: 'achteraf', gefactureerd: 'nee', factuurDatum: jaar + '-10-31', vakanties: 'doorbetaald', bijzonderheden: 'Bijzonderheden rondreis', factuurnummer: 'F-RONDREIS-1',
    contactgegevens: 'Contact Rondreis, 06-00000000', voorstelUrl: 'https://docs.google.com/document/d/rondreis', documentenUrl: 'https://drive.google.com/drive/folders/rondreis', verlenging: 'nog bespreken', xpsProject: '10.999', talentscout: 'Sem de Boer', contractwaarde: 13000.5 };
  var pr = roep(SOPHIE, 'apiTrajectOpslaan', W), terug = roep(SOPHIE, 'apiProject', pr.id).project, mis = [];
  Object.keys(W).forEach(function (k) { var v = terug[k]; if (['contractwaarde', 'tarief', 'omzet', 'urenPerWeek'].indexOf(k) >= 0 ? Number(v) !== Number(W[k]) : String(v) !== String(W[k])) mis.push(k + '=' + JSON.stringify(v)); });
  eis(!mis.length && terug.school === 'Esdoorn Lyceum', 'rondreis: elk veld uit de whitelist komt via apiProject terug zoals opgeslagen (school uit de gekozen CRM-school)' + (mis.length ? ' — AFWIJKEND: ' + mis.join(', ') : ''));
  var vrij = roep(SOPHIE, 'apiTrajectOpslaan', { id: pr.id, school: 'Vrije schoolnaam', _oud: { school: 'Esdoorn Lyceum' } });
  eis(vrij.school === 'Vrije schoolnaam' && roep(SOPHIE, 'apiProject', pr.id).project.school === 'Vrije schoolnaam', 'rondreis: ook de vrije schoolnaam (zonder schoolId) wordt bewaard');
  var nietInWl = Object.keys(W).concat(['id', 'school']).filter(function (k) { return whitelist.indexOf(k) < 0; }), wlNiet = whitelist.filter(function (k) { return !(k in W) && k !== 'id' && k !== 'school'; });
  eis(!nietInWl.length && !wlNiet.length, 'rondreis: de testwaarden dekken precies de whitelist' + (wlNiet.length ? ' — NIET GETEST: ' + wlNiet.join(', ') : '') + (nietInWl.length ? ' — NIET IN WHITELIST: ' + nietInWl.join(', ') : ''));
  eis(/verwacht tekst/.test(faalt(SOPHIE, 'apiTrajectOpslaan', { id: pr.id, samenvatting: { tekst: 'x' } })) && roep(SOPHIE, 'apiProject', pr.id).project.samenvatting === 'Samenvatting rondreis' && /Onbekende waarde voor gefactureerd/.test(faalt(SOPHIE, 'apiTrajectOpslaan', { id: pr.id, gefactureerd: 'misschien' })), 'rondreis: een object in een tekstveld en een waarde buiten de keuzelijst worden geweigerd zonder te schrijven');
})();

/* ---- v7.3 (TZ-6): dagenSinds in kalenderdagen ---- */
(function () {
  var CtxDate = vm.runInContext('Date', ctx), nuC = new CtxDate(), kal = function (n, u, mi) { return new CtxDate(nuC.getFullYear(), nuC.getMonth(), nuC.getDate() + n, u, mi); };
  eis(ctx.dagenSinds(ctx.datumTijdStr(kal(-1, 23, 30))) === 1 && ctx.dagenSinds(ctx.datumTijdStr(kal(0, 0, 10))) === 0 && ctx.dagenSinds(ctx.datumTijdStr(kal(-2, 23, 59))) === 2 && ctx.dagenSinds(ctx.datumStr(kal(-7, 12, 0))) === 7 && ctx.dagenSinds(ctx.datumTijdStr(kal(1, 0, 5))) === -1 && ctx.dagenSinds('') === null, 'dagenSinds rekent in kalenderdagen: gisteren 23:30 = 1, vandaag 00:10 = 0, eergisteren 23:59 = 2, morgen 00:05 = -1');
  var k7 = ctx.vind('Kansen', 'k7'), ku = roep(SOPHIE, 'apiKans', 'k7').kans;
  eis(ku.dagenStil === Math.round((ctx.middag(nuC) - ctx.middag(ctx.parseDatum(k7.laatsteContact))) / 86400000), 'dagenStil van een kans is het verschil in kalenderdagen met het laatste contact');
})();

/* ---- v7.3 (FZ-8): tekstIn — een object of lijst in een vrij tekstveld wordt geweigerd en schrijft niets ---- */
(function () {
  var MELD = /Dit veld verwacht tekst\./, gooit = function (v) { try { ctx.tekstIn(v); return false; } catch (e) { return MELD.test(e.message); } };
  var voor = { Acties: ctx.lees('Acties').length, Activiteiten: ctx.lees('Activiteiten').length, Kandidaat: JSON.stringify(ctx.vind('Kandidaten', 'c1')), Taskforce: String(ctx.vind('Trajecten', 't4').taskforce) };
  eis(ctx.tekstIn(undefined) === '' && ctx.tekstIn(null) === '' && ctx.tekstIn('  x  ') === 'x' && ctx.tekstIn(12) === '12' && gooit({}) && gooit(['a']) && gooit({ tekst: 'x' }), 'tekstIn: leeg voor null en undefined, getrimde tekst, een object of lijst geeft "Dit veld verwacht tekst."');
  eis(MELD.test(faalt(LARS, 'apiTaakOpslaan', { tekst: 'Proef', notitie: { a: 1 } })) && MELD.test(faalt(LARS, 'apiTaakOpslaan', { tekst: ['Proef'] })) && MELD.test(faalt(LARS, 'apiActieToevoegen', { id: 'x' }, 'midden', plusDagen(1))) && ctx.lees('Acties').length === voor.Acties, 'taken: een object als tekst of notitie wordt geweigerd en er komt geen rij bij');
  eis(MELD.test(faalt(LARS, 'apiActiviteitToevoegen', { vorm: 'call', schoolId: 's1', onderwerp: { x: 1 } })) && MELD.test(faalt(LARS, 'apiAfspraakPlannen', { titel: 'Proef', start: plusDagen(3) + 'T10:00', schoolId: 's1', locatie: { adres: 'x' } })) && MELD.test(faalt(LARS, 'apiAfspraakPlannen', { titel: 'Proef', start: plusDagen(3) + 'T10:00', schoolId: 's1', notitie: ['x'] })) && ctx.lees('Activiteiten').length === voor.Activiteiten && ctx._demoAgenda.every(function (e) { return e.getTitle() !== 'Proef'; }), 'activiteiten en afspraken: onderwerp, locatie en notitie moeten tekst zijn; niets in de Sheet of de agenda');
  eis(MELD.test(faalt(BAS, 'apiTaskforceOpslaan', 't4', { hulpvraag: [{}] })) && String(ctx.vind('Trajecten', 't4').taskforce) === voor.Taskforce && MELD.test(faalt(SOPHIE, 'apiKandidaatOpslaan', { id: 'c1', notitie: { onbekend: 1 } })) && JSON.stringify(ctx.vind('Kandidaten', 'c1')) === voor.Kandidaat, 'taskforce en kandidaat: hulpvraag en notitie moeten tekst zijn; de rij blijft ongewijzigd');
  eis(MELD.test(faalt(IRIS, 'apiBeoordelingOpslaan', { talentId: 'tl16', oordeel: 'goed', tekst: [{}] })) && MELD.test(faalt(IRIS, 'apiVoorstellen', 'v3', ['tl24'], { id: 'x' })) && MELD.test(faalt(SOPHIE, 'apiTrackOpslaan', { naam: [{}], stappen: [{ tekst: 'x' }] })) && MELD.test(faalt(SOPHIE, 'apiMaakContent', 'linkedin', {}, 'kort')) && MELD.test(faalt(SOPHIE, 'apiSchoolOpslaan', { id: 's1', notities: { x: 1 } })) && MELD.test(faalt(LARS, 'apiKansOpslaan', { id: 'k7', volgendeActie: ['x'] })) && MELD.test(faalt(SEM, 'apiTalentOpslaan', { id: 'tl1', notitie: { x: 1 } })) && MELD.test(faalt(SOPHIE, 'apiHuisstijlOpslaan', { toon: { x: 1 } })), 'beoordeling, voordracht, track, tekst, school, kans, talent en huisstijl: elk vrij tekstveld weigert een object');
})();

/* ---- v7.3 (R4): apiTalentOpslaan controleert met de rij, zodat een rijniveau ook daar geldt ---- */
(function () {
  var oudR = ctx.RECHTEN.talenten.accountmanagement; ctx.RECHTEN.talenten.accountmanagement = ['eigen', 'eigen'];
  try {
    eis(!faalt(FEMKE, 'apiTalentOpslaan', { id: 'tl3', opleiding: 'Pabo (rooktest)' }) && ctx.vind('Talenten', 'tl3').opleiding === 'Pabo (rooktest)' && /toegang/.test(faalt(FEMKE, 'apiTalentOpslaan', { id: 'tl15', opleiding: 'Gekaapt' })) && ctx.vind('Talenten', 'tl15').opleiding !== 'Gekaapt', 'met rijniveau eigen wijzigt de AM alleen een talent uit zijn eigen projecten (tl3, kandidaat bij Femke), niet tl15');  // tl1 heeft hierboven bewust een dubbel profiel gekregen (forceer), daarom tl3
  } finally { ctx.RECHTEN.talenten.accountmanagement = oudR; }
  eis(/toegang/.test(faalt(FEMKE, 'apiTalentOpslaan', { id: 'tl1', opleiding: 'x' })) && /toegang/.test(faalt(FEMKE, 'apiTalentOpslaan', { voornaam: 'Nieuw', toestemmingDatum: plusDagen(0) })), 'met de echte tabel (AM: geen) blijft wijzigen en aanmaken voor de AM dicht');
})();

/* ---- bestaande schermen blijven werken ---- */
['demo-sophie', 'demo-lars', 'demo-femke', 'demo-sem', 'demo-iris'].forEach(function (c) { eis(!faalt(c, 'apiOverzicht') && !faalt(c, 'apiHome') && !faalt(c, 'apiTaken') && !faalt(c, 'apiAgenda', plusDagen(-3), plusDagen(10)) && !faalt(c, 'apiTrajecten') && (c === 'demo-lars' || !faalt(c, 'apiBezetting')), 'schermen laden als ' + c); });
try { ctx.GEBRUIKER = null; ctx.nachtelijkeReview(); eis(true, 'nachtelijke review draait'); } catch (e) { eis(false, 'nachtelijke review draait: ' + e.message); }

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
