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

/* ---- v7.4.1: aanmeldformulier — kolom- en antwoordherkenning (punten 1-9), toestemming en het verzonnen voorbeeld test/voorbeelden/aanmeldformulier.csv.
   Elk in een eigen vm-context (zelfde Code.gs, ook via CODE_GS), zodat de seed van ctx voor de tests hierna onaangeroerd blijft. ---- */
function formulierCtx(echteTermijn) {
  var F = { console: console }; F.globalThis = F; vm.createContext(F);
  vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(process.env.CODE_GS || path.join(R, 'backend/Code.gs'), 'utf8'), F, { filename: 'demo.js' });
  F.demoStart(''); F._demoBladen.Aanmeldingen.rijen.length = 1; F.vergeet('Aanmeldingen');  // zonder de seed-aanmelding (Lieke)
  if (!echteTermijn) F.zetInstelling('bewaartermijnMaanden', 1200);  // v7.4.1 herstel 2: de vaste datums (2-11-2026) in deze tests verlopen niet (een verlopen rij krijgt geen profiel)
  return F;
}
// v7.4.1 ronde 4 (M13): een blok dat gooit (bijvoorbeeld tegen een oudere Code.gs via CODE_GS) wordt één FOUT-regel; de blokken erna lopen gewoon door
function aanmeldBlok(naam, fn) { try { fn(); } catch (e) { eis(false, 'v7.4.1 ' + naam + ': het blok gooit ' + String(e && e.message)); } }
aanmeldBlok('aanmeldformulier', function () {
  var F = formulierCtx(), dag = vm.runInContext('(function (j, m, d, u, n) { return new Date(j, m, d, u, n); })', F);  // Date uit de context zelf (instanceof)
  var tab = function (naam, rijen) { var b = F._demoSS.insertSheet(naam); rijen.forEach(function (r) { b.appendRow(r); }); return b; };
  var tl = function (email) { return F.lees('Talenten').filter(function (t) { return t.email === email; })[0] || {}; };
  var rs = function (t, d) { return F.beschikbaarheidUit(t.beschikbaarheid)[d].join(''); }, lijst = function (s) { return F.lijstUit(s).slice().sort().join(); };
  var notities = function (t) { return F.lees('Activiteiten').filter(function (a) { return a.talentId && a.talentId === t.id; }); };
  var probeer = function (fn) { try { return fn(); } catch (e) { return undefined; } };
  F.zetInstelling('talentFuncties', F.keuzelijst('talentFuncties').concat(['leesbegeleider', 'coach']));  // eigen keuzelijstwaarden (Beheer → Keuzelijsten)
  var A = tab('Formulierreacties 1', [['Tijdstempel', 'E-mailadres', 'Volledige naam', 'Telefoonnummer huisarts (medisch)', 'Mobiel nummer (06)', 'Postcode (bijv. 1234 AB)', 'Woonplaats', 'Welke werkzaamheden wil je doen?',
    'In welk type onderwijs wil je werken?', 'Beschikbaarheid [Maandag]', 'Beschikbaarheid [Woensdag]', 'Opmerking over je beschikbaarheid', 'Geboortedatum', 'IBAN (voor uitbetaling)', 'Ik geef toestemming voor het bewaren van mijn gegevens', 'Wat is je e-mailadres? *'],
    [dag(2026, 10, 2, 9, 14), 'anna.proefhuis@mail.example', 'Anna van der Proefhuis', '0611112222', 610000201, '1234ab', 'Utrecht', 'Huiswerkbegeleiding, Andere: bijles', 'Basisonderwijs (PO)', 'Ochtend, Middag', 'Avond', '', dag(2001, 3, 15, 0, 0), 'NL13TEST0123456789', 'Ja, ik geef toestemming', ''],
    ['17-6-2026 14:05:12', '', 'Bram Oefenaar', '', '06-10000202', '2345 CD', 'Amersfoort', 'NT2-onderwijsondersteuning', 'VSO', '', '', 'ma t/m do, liever niet op vrijdag', '', '', 'Ja, ik geef toestemming', 'bram.oefenaar@mail.example'],
    [dag(2026, 10, 2, 11, 0), 'cees.zonder@mail.example', 'Cees Zondertoestemming', '', '0610000203', '', '', 'Surveillant', 'VO', 'Ochtend', '', '', '', '', '', ''],
    [dag(2026, 10, 2, 12, 0), 'dewi.snelweg@mail.example', 'Dewi Snelweg', '', '0610000204', '', 'Gouda', 'Surveillant', 'Mbo', '', '', 'Zo snel mogelijk, op dinsdag', '', '', 'Ja', '']]);
  tab('Formulierreacties 2', [['Tijdstempel', 'Voornaam', 'E-mail', 'Wanneer kun je werken?', 'Toestemming'], [dag(2026, 10, 2, 13, 0), 'Eva', 'eva.zonderachternaam@mail.example', 'woensdag en vrijdag', 'Ja']]);
  tab('Form Responses 1', [['Timestamp', 'Email Address', 'First name', 'Tussenvoegsel', 'Last name', 'Phone number', 'City', 'Which roles?', 'Privacy statement'],
    [dag(2026, 10, 2, 14, 0), 'femke.tussenhof@mail.example', 'Femke', 'de', 'Tussenhof', '+31 6 1000 0205', 'Den Haag', 'Leesbegeleider, Rekencoach', 'I agree']]);
  var Z = tab('Formulierreacties 3', [['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam'], [dag(2026, 10, 2, 15, 0), 'gijs.zondervraag@mail.example', 'Gijs', 'Zondervraag']]);
  F._demoVerzonden.length = 0;
  var ar = F.aanmeldingenRun(), anna = tl('anna.proefhuis@mail.example'), bram = tl('bram.oefenaar@mail.example'), dewi = tl('dewi.snelweg@mail.example'), eva = tl('eva.zonderachternaam@mail.example'), femke = tl('femke.tussenhof@mail.example');
  var zonderVraag = function () { return F.lees('Meldingen').filter(function (m) { return m.voor === 'Iris Mulder' && /geen toestemmingsvraag/.test(m.tekst); }).length; };
  eis(/^5 nieuw, 0 bestaand, 5 mails, 1 zonder toestemming; Tabblad "Formulierreacties 3" heeft geen toestemmingsvraag/.test(ar) && F._demoVerzonden.length === 5, 'v7.4.1 aanmeldingenRun: "5 nieuw, 0 bestaand, 5 mails" blijft het begin; daarna ", 1 zonder toestemming" en de fout (' + ar.slice(0, 60) + '…)');
  eis(lijst(anna.sectoren) === 'po' && lijst(bram.sectoren) === 'so', 'v7.4.1 (1) sector op woorden: "Basisonderwijs (PO)" is alleen po (geen so uit basiSOnderwijs), "VSO" alleen so (geen vo)');
  eis(rs(anna, 'ma') === '220' && rs(anna, 'wo') === '002', 'v7.4.1 (2) rasterkolommen "Beschikbaarheid [Maandag]" en "[Woensdag]" worden allemaal gelezen: ma ochtend+middag, wo avond');
  eis(anna.voornaam === 'Anna' && anna.achternaam === 'van der Proefhuis' && eva.voornaam === 'Eva' && eva.achternaam === '' && rs(eva, 'wo') === '220' && rs(eva, 'vr') === '220' && lijst(eva.functies) === '' &&
    probeer(function () { var c = F.aanmeldKolommen(['Tijdstempel', 'Voornaam', 'E-mail', 'Wanneer kun je werken?', 'Toestemming']); return c.functies.length === 0 && c.achternaam.length === 0 && c.beschikbaarheid.length === 1; }) === true,
    'v7.4.1 (3) kopherkenning met scores: "Volledige naam" wordt voornaam + achternaam, "naam" pakt "Voornaam" niet als achternaam, "Wanneer kun je werken?" is beschikbaarheid en geen functie');
  eis(F.telefoonIn(anna.telefoon) === '0610000201' && F.telefoonIn(bram.telefoon) === '0610000202', 'v7.4.1 (3) telefoon: "Mobiel nummer (06)" als getal zonder voorloopnul wordt 06…, niet het nummer uit "Telefoonnummer huisarts (medisch)"');
  eis(bram.email === 'bram.oefenaar@mail.example' && anna.email === 'anna.proefhuis@mail.example', 'v7.4.1 (4) twee e-mailkolommen (verzameld adres leeg, eigen vraag ingevuld): per rij de eerste geldige');
  eis(rs(bram, 'di') === '220' && rs(bram, 'wo') === '220' && rs(bram, 'vr') === '110' && rs(dewi, 'zo') === '000' && rs(dewi, 'di') === '220', 'v7.4.1 (5) vrije tekst: "ma t/m do" is een bereik, "liever niet op vrijdag" = 1, "Zo snel mogelijk" is geen zondag');
  eis(lijst(anna.functies) === 'huiswerkbegeleider' && notities(anna).some(function (a) { return /Aangemeld via het formulier/.test(a.onderwerp) && /Niet herkend/.test(a.tekst) && /bijles/.test(a.tekst); }) && lijst(bram.functies) === 'nt2-ondersteuner' && lijst(femke.functies) === 'leesbegeleider,rekenondersteuner',
    'v7.4.1 (6) functies met synoniemen (huiswerkbegeleiding, NT2-onderwijsondersteuning → alleen nt2-ondersteuner, rekencoach), eigen keuzelijstwaarden op hele woorden; "Andere: bijles" staat als "Niet herkend" op de tijdlijn');
  eis(!tl('cees.zonder@mail.example').id && A.rijen[3][16] === 'overgeslagen: geen toestemming' && !A.rijen[3][17], 'v7.4.1 (7) een rij zonder toestemming geeft geen profiel en wordt gemarkeerd als "overgeslagen: geen toestemming"');
  eis(bram.toestemmingDatum === '2026-06-17' && bram.laatsteContact === '2026-06-17' && anna.toestemmingDatum === '2026-11-02', 'v7.4.1 (8) tijdstempel als tekst "17-6-2026 14:05:12" wordt gelezen (niet vandaag); een Date blijft werken');
  eis(anna.woonplaats === 'Utrecht' && femke.achternaam === 'de Tussenhof' && femke.woonplaats === 'Den Haag' && femke.voornaam === 'Femke', 'v7.4.1 (9) woonplaats en tussenvoegsel worden gelezen ("de" vóór de achternaam), ook in een Engelstalig antwoordblad');
  var annaAlles = JSON.stringify(anna) + JSON.stringify(notities(anna)) + JSON.stringify(F.lees('Meldingen'));
  eis(annaAlles.indexOf('2001-04-15') < 0 && annaAlles.indexOf('NL13TEST0123456789') < 0 && annaAlles.indexOf('0611112222') < 0, 'v7.4.1 AVG: geboortedatum, IBAN en een medische kolom worden nooit gelezen, ook niet in de notitie of een melding');
  eis(!tl('gijs.zondervraag@mail.example').id && Z.rijen[0].length === 4 && !Z.rijen[1][4] && zonderVraag() === 1, 'v7.4.1 tabblad zonder toestemmingsvraag: geen profiel, geen markering, wel een fout en één melding aan het talentteam');
  var tweede = F.aanmeldingenVerwerken();
  eis(tweede.nieuw === 0 && tweede.bestaand === 0 && tweede.overgeslagen && (tweede.overgeslagen || {}).geenToestemming === 0 && (tweede.overgeslagen || {}).geenContact === 0 && (tweede.fouten || []).length === 1 && /toestemmingsvraag/.test((tweede.fouten || [])[0]) && zonderVraag() === 1,
    'v7.4.1 resultaat { nieuw, bestaand, mails, overgeslagen: { geenToestemming, geenContact }, fouten }; een tweede run dezelfde dag meldt niet opnieuw');
  F.P.setProperty('AANMELD_ZONDER_TOESTEMMING', plusDagen(-1)); F.aanmeldingenVerwerken();
  eis(zonderVraag() === 2, 'v7.4.1 de melding over de ontbrekende toestemmingsvraag komt hoogstens één keer per dag terug');

  // Het verzonnen voorbeeld zoals Google Forms het in de Sheet zet (Bestand → Downloaden → csv): alle cellen tekst
  var V = formulierCtx(), csv = V.Utilities.parseCsv(fs.readFileSync(path.join(R, 'test/voorbeelden/aanmeldformulier.csv'), 'utf8'), ','), vb = V._demoSS.insertSheet('Formulierreacties 1');
  csv.forEach(function (r) { vb.appendRow(r); });
  var vr2 = V.aanmeldingenRun(), vt = function (e) { return V.lees('Talenten').filter(function (t) { return t.email === e; })[0] || {}; }, vrs = function (t, d) { return V.beschikbaarheidUit(t.beschikbaarheid)[d].join(''); };
  var vAnouk = vt('anouk.proefhoeve@mail.example'), vBram = vt('bram.oefenmaker@mail.example'), vEva = vt('eva.modelhof@mail.example'), vFemke = vt('femke.fictiehof@mail.example'), vGijs = vt('gijs.bedenkveld@mail.example');
  eis(csv.length === 9 && /^6 nieuw, 1 bestaand, 6 mails, 1 zonder toestemming$/.test(vr2) && !vt('dewi.schetsboek@mail.example').id, 'v7.4.1 voorbeeld aanmeldformulier.csv: 8 rijen → 6 profielen, 1 opnieuw aangemeld, 1 zonder toestemming (' + vr2 + ')');
  var geb = csv.slice(1).map(function (r) { return r[14]; }), vAlles = JSON.stringify(V.lees('Talenten')) + JSON.stringify(V.lees('Activiteiten')) + JSON.stringify(V.lees('Meldingen'));
  eis(vrs(vAnouk, 'ma') === '220' && vrs(vAnouk, 'wo') === '022' && vrs(vAnouk, 'do') === '200' && vAnouk.toestemmingDatum === '2026-11-03' && vAnouk.postcode === '1234 AB' && vAnouk.achternaam === 'van der Proefhoeve' &&
    V.telefoonIn(vBram.telefoon) === '0610000102' && vrs(vBram, 'di') === '220' && vrs(vBram, 'vr') === '110' && V.lijstUit(vBram.sectoren).join() === 'po' && V.lijstUit(vBram.functies).join() === 'huiswerkbegeleider' &&
    V.lijstUit(vEva.sectoren).join() === 'so' && vrs(vEva, 'vr') === '220' && vrs(vEva, 'zo') === '000' && V.lijstUit(vFemke.sectoren).sort().join() === 'mbo,vo' && vFemke.achternaam === 'de Fictiehof' &&
    V.lijstUit(vGijs.sectoren).sort().join() === 'po,vo' && vrs(vGijs, 'wo') === '020' && V.lees('Activiteiten').some(function (a) { return a.talentId === vGijs.id && /leesbegeleiding/.test(a.tekst); }) &&
    geb.length === 8 && geb.concat(geb.map(V.exportDag)).every(function (g) { return g && vAlles.indexOf(g) < 0; }),
    'v7.4.1 voorbeeld: raster, bereik, liever niet, sector, telefoon als getal, tussenvoegsel, tekstdatum en "Niet herkend" kloppen per rij (ronde 4: Anouk meldt zich op 3-11 opnieuw aan, haar toestemming telt vanaf die dag); de geboortedatums (ook als jjjj-mm-dd) staan nergens');
});
/* ---- v7.4.1 herstel ronde 1 (review en tegenspeler): elk geval een eigen tabblad in één run; alle namen, adressen en nummers verzonnen ---- */
aanmeldBlok('herstel ronde 1', function () {
  var F = formulierCtx(), J = 'Ja', d = '2-11-2026 08:00', tabs = {}, n = 10;
  var tab = function (kop, rijen) { var b = F._demoSS.insertSheet('Formulierreacties ' + (n++)); b.appendRow(kop); rijen.forEach(function (r) { b.appendRow(r); }); return b; };
  var tl = function (email) { return F.lees('Talenten').filter(function (t) { return t.email === email; })[0] || {}; };
  var tlTel = function (tel) { return F.lees('Talenten').filter(function (t) { return F.telefoonIn(t.telefoon) === tel; }); };
  var rs = function (t, dg) { return t.id ? F.beschikbaarheidUit(t.beschikbaarheid)[dg].join('') : '?'; }, lijst = function (s) { return F.lijstUit(s).slice().sort().join(); };
  var probeer = function (fn) { try { return fn(); } catch (e) { return undefined; } };
  var OK5 = ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam'];
  tabs.heet = tab(['Tijdstempel', 'E-mailadres', 'Hoe heet je?', 'Toestemming'], [[d, 'hanna.heetje@mail.example', 'Hanna Heetje', J]]);
  tabs.kaal = tab(['E-mailadres', 'Telefoonnummer', 'Toestemming'], [['ivo.zondernaam@mail.example', '0610000301', J]]);
  tabs.niveau = tab(OK5.concat(['In welk type onderwijs wil je werken?', 'Wat is je hoogst genoten onderwijsniveau?', 'Beschrijf je werkervaring in het onderwijs', 'Privacyverklaring']),
    [[d, 'yara.niveau@mail.example', 'Yara', 'Niveau', 'Basisonderwijs', 'VWO', 'Bijles in het mbo', J]]);
  tabs.level = tab(['Timestamp', 'Email Address', 'First name', 'Last name', 'Phone number', 'What is your highest level of education?', 'I agree to the privacy statement'], [[d, 'ella.level@mail.example', 'Ella', 'Level', '0610000308', 'MBO level 4', 'Yes']]);
  tabs.toest = tab(OK5.concat(['Toestemming']), [[d, 'tim.tekst@mail.example', 'Tim', 'Tekst', 'Ik geef toestemming (bij geen toestemming kunnen we je niet inschrijven)'],
    [d, 'una.agree@mail.example', 'Una', 'Agree', "I agree. We don't share your data."], [d, 'gert.bezwaar@mail.example', 'Gert', 'Bezwaar', 'Geen bezwaar'], [d, 'nina.nee@mail.example', 'Nina', 'Nee', 'Nee, liever niet']]);
  tabs.ouder = tab(OK5.concat(['Toestemming ouder/verzorger (alleen als je jonger bent dan 16)', 'Ik ga akkoord met de privacyverklaring']), [[d, 'sara.nvt@mail.example', 'Sara', 'Nvt', 'n.v.t.', J], [d, 'ugo.nvt@mail.example', 'Ugo', 'Nvt', 'N/A', 'Ja, ik ga akkoord']]);
  tabs.contract = tab(OK5.concat(['Ga je akkoord met werken op basis van een oproepcontract?', 'Privacyverklaring']), [[d, 'wout.vast@mail.example', 'Wout', 'Vast', 'Nee, liever een vast contract', J]]);
  var hand = F.blad('Aanmeldingen');
  hand.appendRow(['2-11-2026', 'Abel', 'Handwerk', '0610000302', 'abel.handwerk@mail.example', '', '', '', '', true, '', '']); hand.appendRow(['', '', '', '', '', '', '', '', '', false, '', '']);
  tabs.vinkje = tab(OK5.concat(['Telefoonnummer', 'Privacyverklaring', 'Verwerkt']), [[d, 'yara.vinkje@mail.example', 'Yara', 'Vinkje', '0610000309', J, false], ['', '', '', '', '', '', false]]);
  tabs.speciaal = tab(OK5.concat(['In welk type onderwijs wil je werken?', 'Privacyverklaring']), [[d, 'sem.sbo@mail.example', 'Sem', 'Sbo', 'Speciaal basisonderwijs', J], [d, 'pim.sbo@mail.example', 'Pim', 'Sbo', 'SBO', J]]);
  tabs.avond = tab(['Tijdstempel', 'E-mailadres', 'Je naam', 'Naam van je school', 'Functie', "Met hoeveel collega's kom je?", 'Ik ga akkoord met de privacyverklaring'], [[d, 'j.directeur@school.example', 'Jan Directeur', 'Basisschool Denkbeeld', 'Directeur', 2, J]]);
  tabs.evaluatie = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Hoe tevreden ben je over de training?', 'Wat kan beter?'], [[d, 'p.leerkracht@school.example', 'Petra Leerkracht', 4, 'Meer oefenen']]);
  tabs.simpel = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Opmerkingen', 'Toestemming'], [[d, 'otto.simpel@mail.example', 'Otto Simpel', 'Ik heb een rijbewijs', J]]);
  tabs.derden = tab(['Tijdstempel', 'Wat is je naam?', 'Wat is je e-mailadres? *', 'E-mailadres stagebegeleider', 'Op welk telefoonnummer kunnen we je bereiken?', 'Telefoonnummer leidinggevende', 'Telefoonnummer huisarts', 'Naam hogeschool / pabo', 'Privacyverklaring'],
    [[d, 'Sven Pabolaan', 'sven.pabolaan@mail.example', 'm.begeleider@school.example', '0610000303', '0610000397', '0301230001', 'Hogeschool Denkbeeld', J], [d, 'Iris Stagewerk', 'iris.stagewerk@mail.example', 'x.begeleider@school.example', '', '0610000398', '0301230002', 'Pabo Fictief', J]]);
  tabs.toelichting = tab(['Tijdstempel', 'E-mailadres', 'Volledige naam (zoals op je ID)', 'Postcode (voor de reiskostenvergoeding)', 'Mobiel nummer (ook voor ziekmeldingen)', 'Privacyverklaring'], [[d, 'vera.officieel@mail.example', 'Vera van Officieel', '3512 CD', '0610000304', J]]);
  tabs.eigen = tab(['Tijdstempel', 'Voornaam', 'Achternaam', 'Je eigen e-mailadres (dus niet dat van je ouders)', 'Privacyverklaring'], [[d, 'Sem', 'Eigenmail', 'sem.eigenmail@mail.example', J]]);
  tabs.nummering = tab(['Tijdstempel', '01. Voornaam', '02. Achternaam', '03. E-mailadres', '04. Postcode (bijv. 1234 AB)', '05. Postcode stageschool', '06. Waar woon je?', '07. In welke stad studeer je?', '08. Privacyverklaring'],
    [[d, 'Jesse', 'Woonstra', 'jesse.woonstra@mail.example', '9711 AA', '1012 ZZ', 'Zeist', 'Utrecht', J]]);
  tabs.samen = tab(OK5.concat(['Postcode en woonplaats', 'Privacyverklaring']), [[d, 'daan.samen@mail.example', 'Daan', 'Samen', '3511 AB Utrecht', J]]);
  tabs.voorEnAchter = tab(['Tijdstempel', 'E-mailadres', 'Voornaam en achternaam', 'Privacyverklaring'], [[d, 'fenna.desplitser@mail.example', 'Fenna de Splitser', J]]);
  tabs.nummer = tab(['Tijdstempel', 'Voornaam', 'Achternaam', 'Contactnummer', 'Op welk nummer kunnen we je bereiken?', 'Privacyverklaring'], [[d, 'Lot', 'Nummer', '0610000305', '', J], [d, 'Kees', 'Nummer', '', '06 1000 0310', J]]);
  tabs.huidig = tab(OK5.concat(['Wat is je huidige functie?', 'Welke werkzaamheden wil je doen?', 'Privacyverklaring']), [[d, 'zoe.huidig@mail.example', 'Zoë', 'Huidig', 'Onderwijsassistent', 'Huiswerkbegeleider', J]]);
  tabs.omgekeerd = tab(OK5.concat(['Op welke dagen heb je college? [Maandag]', 'Wanneer ben je NIET beschikbaar? [Dinsdag]', 'Op welke dagen ben je niet beschikbaar?', 'Wanneer ben je beschikbaar?', 'Privacyverklaring']),
    [[d, 'kai.college@mail.example', 'Kai', 'College', 'Ja', 'Ochtend, Middag', 'Woensdag', 'donderdag en vrijdag', J]]);
  tabs.keuzes = tab(OK5.concat(['Beschikbaarheid [Maandag]', 'Beschikbaarheid [Dinsdag]', 'Beschikbaarheid [Woensdag]', 'Beschikbaarheid [Weekend]', 'Privacyverklaring']),
    [[d, 'lynn.kanniet@mail.example', 'Lynn', 'Kanniet', 'Kan wel', 'Kan niet', 'Nooit', 'Ja', J], [d, 'pip.helaas@mail.example', 'Pip', 'Helaas', 'Altijd', 'Helaas niet', 'Bezet', '', J]]);
  tabs.gezin = tab(OK5.concat(['Telefoonnummer', 'Privacyverklaring']), [[d, 'cas.gezin@mail.example', 'Cas', 'Gezin', '0610000306', J], [d, 'dewi.gezin@mail.example', 'Dewi', 'Gezin', '0610000306', J],
    [d, '', 'Fay', 'Tweenummers', '0610000307\n0201230003', J], [d, 'eli.tweenummers@mail.example', 'Eli', 'Tweenummers', '06 10000311 / 06 87654321', J]]);
  tabs.namen = tab(['Tijdstempel', 'E-mailadres', 'Voornamen', 'Tussenv.', 'Achternaam (zonder tussenvoegsel)', 'Privacyverklaring'], [[d, 'johanna.zonderman@mail.example', 'Johanna Maria', 'van der', 'Zonderman', J]]);
  tabs.tekst = tab(OK5.concat(['Wanneer ben je beschikbaar?', 'Privacyverklaring']), [[d, 'kim.nietwo@mail.example', 'Kim', 'Nietwo', 'Alle dagen, maar woensdag niet', J], [d, 'lex.nietwo@mail.example', 'Lex', 'Nietwo', 'Geen woensdag, wel vrijdag', J],
    [d, 'mo.nietwo@mail.example', 'Mo', 'Nietwo', 'Woensdag kan ik niet', J], [d, 'ned.weet@mail.example', 'Ned', 'Weet', 'maandag en verder weet ik het nog niet', J], [d, 'vic.vrijdag@mail.example', 'Vic', 'Vrijdag', 'Dinsdag, vrijdag liever niet', J]]);
  var uit = F.aanmeldingenVerwerken(), kolom = function (b, naam) { return b.rijen[0].indexOf(naam); };
  var alles = JSON.stringify(F.lees('Talenten')) + JSON.stringify(F.lees('Activiteiten')) + JSON.stringify(F.lees('Meldingen'));
  eis(tl('hanna.heetje@mail.example').voornaam === 'Hanna' && tl('hanna.heetje@mail.example').achternaam === 'Heetje' && !!tl('ivo.zondernaam@mail.example').id,
    'v7.4.1 herstel: "Hoe heet je?" is een naamkolom, en een tabblad met alleen e-mail, telefoon en toestemming (geen naamkolom) wordt verwerkt zoals vóór v7.4.1');
  eis(lijst(tl('yara.niveau@mail.example').sectoren) === 'po' && !!tl('ella.level@mail.example').id && lijst(tl('ella.level@mail.example').sectoren) === '',
    'v7.4.1 herstel: de eigen opleiding ("hoogst genoten onderwijsniveau", "highest level of education", "werkervaring in het onderwijs") is geen sector');
  eis(!!tl('tim.tekst@mail.example').id && !!tl('una.agree@mail.example').id && !!tl('gert.bezwaar@mail.example').id && !tl('nina.nee@mail.example').id,
    'v7.4.1 herstel: toestemming is "nee" alleen aan het begin van de cel ("Ik geef toestemming (bij geen toestemming …)", "I agree. We don\'t share …" en "Geen bezwaar" zijn ja; "Nee, liever niet" is nee)');
  eis(!!tl('sara.nvt@mail.example').id && !!tl('ugo.nvt@mail.example').id, 'v7.4.1 herstel: "n.v.t." of "N/A" bij een toestemmingsvraag voor ouders blokkeert de aanmelding niet');
  eis(!!tl('wout.vast@mail.example').id, 'v7.4.1 herstel: een akkoord-vraag over een oproepcontract is geen privacytoestemming (naast de echte privacyvraag)');
  eis(!!tl('abel.handwerk@mail.example').id && hand.rijen[2][10] === '' && (uit.overgeslagen || {}).geenToestemming === 1 && tabs.vinkje.rijen[2][kolom(tabs.vinkje, 'Verwerkt')] === false,
    'v7.4.1 herstel: een rij met alleen een leeg selectievakje (false) is leeg: niet gemarkeerd en niet geteld als "zonder toestemming"');
  eis(!!tl('yara.vinkje@mail.example').id && tabs.vinkje.rijen[1][kolom(tabs.vinkje, 'Verwerkt')] === true, 'v7.4.1 herstel: een kolom "Verwerkt" met lege selectievakjes (false) blokkeert niets; Athena zet er een vinkje in');
  eis(lijst(tl('sem.sbo@mail.example').sectoren) === 'so' && lijst(tl('pim.sbo@mail.example').sectoren) === 'so', 'v7.4.1 herstel: "Speciaal basisonderwijs" en "SBO" zijn so (zoals sectorVanSchool), niet ook po');
  eis(!tl('j.directeur@school.example').id && !tl('p.leerkracht@school.example').id && kolom(tabs.avond, 'verwerkt') < 0 && kolom(tabs.evaluatie, 'verwerkt') < 0 && !(uit.fouten || []).some(function (f) { return f.indexOf(tabs.avond.getName()) >= 0 || f.indexOf(tabs.evaluatie.getName()) >= 0; }) && (uit.fouten || []).length === 0 &&
    tl('otto.simpel@mail.example').voornaam === 'Otto', 'v7.4.1 herstel: een aanmelding voor een informatieavond of een evaluatie in dezelfde Sheet is geen aanmeldformulier (geen profiel, geen markering, geen fout); een eenvoudig formulier met naam, e-mail, opmerkingen en toestemming wel');
  var sven = tl('sven.pabolaan@mail.example'), iris = tl('iris.stagewerk@mail.example');
  eis(sven.voornaam === 'Sven' && sven.achternaam === 'Pabolaan' && F.telefoonIn(sven.telefoon) === '0610000303' && !!iris.id && !iris.telefoon &&
    ['begeleider@school.example', '0610000397', '0610000398', '0301230001', '0301230002', 'Denkbeeld', 'Fictief'].every(function (x) { return alles.indexOf(x) < 0; }),
    'v7.4.1 herstel: e-mail en telefoon van een stagebegeleider, leidinggevende of huisarts en de naam van de hogeschool worden nooit die van het talent');
  var vera = tl('vera.officieel@mail.example');
  eis(vera.voornaam === 'Vera' && vera.achternaam === 'van Officieel' && vera.postcode === '3512 CD' && F.telefoonIn(vera.telefoon) === '0610000304',
    'v7.4.1 herstel: een privéwoord in de toelichting ("zoals op je ID", "reiskostenvergoeding", "ziekmeldingen") laat een naam-, postcode- of telefoonkolom staan');
  eis(!!tl('sem.eigenmail@mail.example').id, 'v7.4.1 herstel: "Je eigen e-mailadres (dus niet dat van je ouders)": wat na een ontkenning staat telt niet');
  var jesse = tl('jesse.woonstra@mail.example'), daan = tl('daan.samen@mail.example');
  eis(jesse.postcode === '9711 AA' && jesse.woonplaats === 'Zeist' && jesse.voornaam === 'Jesse' && alles.indexOf('1012 ZZ') < 0,
    'v7.4.1 herstel: nummering "06. " vooraan telt niet, "Postcode stageschool" en "In welke stad studeer je?" zijn niet de postcode en woonplaats van het talent');
  eis(daan.postcode === '3511 AB' && daan.woonplaats === 'Utrecht', 'v7.4.1 herstel: één vraag "Postcode en woonplaats" geeft postcode én woonplaats');
  eis(tl('fenna.desplitser@mail.example').voornaam === 'Fenna' && tl('fenna.desplitser@mail.example').achternaam === 'de Splitser', 'v7.4.1 herstel: één kolom "Voornaam en achternaam" wordt gesplitst');
  eis(tlTel('0610000305').length === 1 && tlTel('0610000305')[0].voornaam === 'Lot' && tlTel('0610000310').length === 1, 'v7.4.1 herstel: "Contactnummer" en "Op welk nummer kunnen we je bereiken?" zijn telefoonkolommen (ook zonder e-mailvraag)');
  eis(lijst(tl('zoe.huidig@mail.example').functies) === 'huiswerkbegeleider', 'v7.4.1 herstel: "Wat is je huidige functie?" is geen gewenste functie');
  var kai = tl('kai.college@mail.example');
  eis(rs(kai, 'ma') === '000' && rs(kai, 'di') === '000' && rs(kai, 'wo') === '000' && rs(kai, 'do') === '220' && rs(kai, 'vr') === '220',
    'v7.4.1 herstel: omgekeerde vragen ("… heb je college? [Maandag]", "NIET beschikbaar? [Dinsdag]", "… ben je niet beschikbaar?") zijn geen beschikbaarheid');
  var lynn = tl('lynn.kanniet@mail.example'), pip = tl('pip.helaas@mail.example');
  eis(rs(lynn, 'ma') === '220' && rs(lynn, 'di') === '000' && rs(lynn, 'wo') === '000' && rs(pip, 'di') === '000' && rs(pip, 'wo') === '000' && rs(pip, 'ma') === '220',
    'v7.4.1 herstel: rastercellen "Kan niet", "Nooit", "Helaas niet" en "Bezet" zijn 0 (ook als de ontkenning niet vooraan staat)');
  eis(rs(lynn, 'za') === '220' && rs(lynn, 'zo') === '220' && probeer(function () { return F.labelDagDeel('za zo').dagen.join(); }) === '5,6', 'v7.4.1 herstel: rasterrijen "Weekend" en "Za/zo" gelden voor zaterdag en zondag');
  eis(!!tl('cas.gezin@mail.example').id && tl('dewi.gezin@mail.example').voornaam === 'Dewi', 'v7.4.1 herstel: broer en zus met hetzelfde telefoonnummer en elk een eigen e-mailadres krijgen elk een profiel');
  eis(tlTel('0610000307').length === 1 && F.telefoonIn(tl('eli.tweenummers@mail.example').telefoon) === '0610000311', 'v7.4.1 herstel: twee telefoonnummers in één cel (met / of een nieuwe regel): het eerste telt');
  var jo = tl('johanna.zonderman@mail.example');
  eis(jo.voornaam === 'Johanna Maria' && jo.achternaam === 'van der Zonderman', 'v7.4.1 herstel: koppen "Voornamen", "Tussenv." en "Achternaam (zonder tussenvoegsel)"');
  var kim = tl('kim.nietwo@mail.example'), lex = tl('lex.nietwo@mail.example'), mo = tl('mo.nietwo@mail.example'), ned = tl('ned.weet@mail.example'), vic = tl('vic.vrijdag@mail.example');
  eis(rs(kim, 'wo') === '000' && rs(kim, 'ma') === '220' && rs(lex, 'wo') === '000' && rs(lex, 'vr') === '220' && rs(mo, 'wo') === '000' && rs(ned, 'ma') === '220' && rs(vic, 'di') === '220' && rs(vic, 'vr') === '110',
    'v7.4.1 herstel: ontkenningen in vrije tekst ("maar woensdag niet", "geen woensdag", "woensdag kan ik niet") zijn 0, "vrijdag liever niet" is 1; "weet ik het nog niet" laat maandag staan');
  var t0 = Date.now(); F.emailUitCel(new Array(50001).join('a')); F.beschikbaarheidUitTekst(new Array(10001).join('zo do ')); var ms = Date.now() - t0;
  eis(ms < 300, 'v7.4.1 herstel: een cel van 50.000 tekens zonder e-mailadres en 60.000 tekens dagtekst kosten samen geen seconden (' + ms + ' ms)');
});
/* ---- v7.4.1 herstel ronde 2 (review en tegenspeler): toestemming als witte lijst, omgekeerde en huidige vragen, bezette dagen, rasters met bereik en
   tijdvak, namen, toelichtingen, kleine en hernoemde formulieren, ontkenningen en privégegevens in antwoorden; alle namen, adressen en nummers verzonnen ---- */
aanmeldBlok('herstel ronde 2', function () {
  var F = formulierCtx(), J = 'Ik geef toestemming om mijn gegevens op te slaan in het talentbestand', d = '2-11-2026 08:00', n = 30, nr = 400, T = {};
  var tel = function () { return '0610000' + String(nr++); };
  var tab = function (kop, rijen, naam) { var b = F._demoSS.insertSheet(naam || 'Formulierreacties ' + (n++)); b.appendRow(kop); rijen.forEach(function (r) { b.appendRow(r); }); return b; };
  var tl = function (email) { return F.lees('Talenten').filter(function (t) { return t.email === email; })[0] || {}; };
  var rs = function (t, dg) { return t.id ? F.beschikbaarheidUit(t.beschikbaarheid)[dg].join('') : '?'; }, lijst = function (s) { return F.lijstUit(s).slice().sort().join(); };
  var week = function (t) { return ['ma', 'di', 'wo', 'do', 'vr'].map(function (x) { return rs(t, x); }).join(' '); };
  var notitie = function (t) { return F.lees('Activiteiten').filter(function (a) { return t.id && a.talentId === t.id; }).map(function (a) { return a.onderwerp + ' ' + a.tekst; }).join(' | '); };
  var probeer = function (fn) { try { return fn(); } catch (e) { return undefined; } }, kolom = function (b, naam) { return b.rijen[0].indexOf(naam); };
  var K = function (kop, veld) { return probeer(function () { return F.aanmeldKolommen(kop)[veld].join(); }); };
  var OK5 = ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer'];
  var rij = function (voor, achter) { return [d, voor.toLowerCase() + '.' + achter.toLowerCase() + '@mail.example', voor, achter, tel()]; };
  var weiger = ['Ik ga hiermee niet akkoord', 'Ik heb bezwaar', 'Liever niet', 'Weigeren', 'Declined', '❌', 'Weet ik nog niet', 'Mee oneens', 'Ik geef hiervoor geen toestemming', 'Ik heb de privacyverklaring gelezen'];
  T.toest = tab(OK5.concat(['Ga je akkoord met de privacyverklaring?']), [rij('Ada', 'Akkoord').concat(['Ik ga hiermee akkoord'])].concat(weiger.map(function (a, i) { return rij('W' + i, 'Weiger').concat([a]); })));
  T.nvt = tab(OK5.concat(['Privacyverklaring', 'Toestemming van je wettelijk vertegenwoordiger voor het bewaren van je gegevens']), [rij('Rik', 'Volwassen').concat([J, 'n.v.t.']), rij('Mia', 'Minder').concat([J, 'Nee'])]);
  T.contract = tab(OK5.concat(['Ga je akkoord met werken op basis van een oproepcontract?']), [rij('Olle', 'Oproep').concat(['Ja'])]);
  T.verwerking = tab(OK5.concat(['Verwerking persoonsgegevens']), [rij('Vik', 'Verwerking').concat(['Akkoord'])]);
  T.namen1 = tab(['Tijdstempel', 'E-mailadres', 'Achternaam, voornaam', 'Telefoonnummer', 'Privacyverklaring'], [[d, 'piet.komma@mail.example', 'Jansen, Piet', tel(), J], [d, 'anne.komma@mail.example', 'de Vries, Anne', tel(), J]]);
  T.namen2 = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring'], [[d, 'yfke.paar@mail.example', 'Yfke', 'Paar', tel(), J], [d, 'jan.dubbel@mail.example', 'Jan Dubbel', 'Dubbel', tel(), J]]);
  T.namen3 = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Naam', 'Telefoonnummer', 'Privacyverklaring'], [[d, 'arne.vlaams@mail.example', 'Arne', 'Vlaams', tel(), J]]);
  T.namen4 = tab(OK5.concat(['Privacyverklaring']), [[d, 'sanne.dewit@mail.example', 'Sanne de Wit', 'de Wit', tel(), J]]);
  T.namen5 = tab(['Tijdstempel', 'E-mailadres', 'Naam (achternaam, voornaam)', 'Telefoonnummer', 'Privacyverklaring'], [[d, 'tess.komma@mail.example', 'Bakker, Tess', tel(), J]]);
  T.ander = tab(OK5.concat(['Ik ga akkoord met de privacyverklaring', 'Toestemming om je cv te delen met scholen']), [rij('Cas', 'Cv').concat(['Ik ga akkoord met de privacyverklaring', 'Nee, eerst overleggen'])]);
  T.omgekeerd = tab(OK5.concat(['Welke werkzaamheden wil je doen?', 'Welke werkzaamheden wil je liever niet doen?', 'In welk type onderwijs wil je werken?', 'In welk type onderwijs wil je liever niet werken?', 'Privacyverklaring']),
    [rij('Eva', 'Omgekeerd').concat(['Huiswerkbegeleider', 'Surveillant', 'Voortgezet onderwijs (vo)', 'Middelbaar beroepsonderwijs (mbo)', J])]);
  T.nietwilt = tab(OK5.concat(['Zijn er werkzaamheden die je niet wilt doen?', 'Privacyverklaring']), [rij('Fenna', 'Nietwilt').concat(['Surveillance', J])]);
  T.huidig = tab(OK5.concat(['Welke werkzaamheden heb je al eens gedaan?', 'Welke functie heb je?', 'Welke functie zoek je?', 'Previous job', 'In welk type onderwijs werk je op dit moment?', 'In welk type onderwijs wil je werken?', 'Privacyverklaring']),
    [rij('Gijs', 'Huidig').concat(['Onderwijsassistent, Surveillance', 'Onderwijsassistent', 'Examentrainer', 'Teaching assistant', 'Basisonderwijs', 'VO', J])]);
  T.werkgever = tab(OK5.concat(['Werkgever', 'Functie', 'Privacyverklaring']), [rij('Ilse', 'Werkgever').concat(['Basisschool Denkbeeld', 'Onderwijsassistent', J])]);
  T.bijbaan = tab(OK5.concat(['Op welke dagen werk je al (bijbaan of andere school)? [Maandag]', 'Op welke dagen werk je al (bijbaan of andere school)? [Dinsdag]', 'Wanneer ben je beschikbaar? [Maandag]', 'Wanneer ben je beschikbaar? [Woensdag]', 'Privacyverklaring']),
    [rij('Lot', 'Bijbaan').concat(['Ochtend', 'Ochtend, Middag', 'Middag', 'Ochtend, Middag', J])]);
  T.week = tab(OK5.concat(['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'].map(function (x) { return 'Hoe ziet je week eruit? [' + x + ']'; }), ['Privacyverklaring']), [rij('Mees', 'Week').concat(['College', 'Vrij', 'N.v.t.', 'Onbekend', 'Blauw', J])]);
  T.bereik = tab(OK5.concat(['Beschikbaarheid [Ma t/m vr]', 'Beschikbaarheid [Za-zo]', 'Privacyverklaring']), [rij('Olaf', 'Bereik').concat(['Middag', 'Ochtend', J])]);
  T.tijdvak = tab(OK5.concat(['Op welke dagen kun je? [8.30 - 12.00 uur]', 'Op welke dagen kun je? [12.30 - 16.00 uur]', 'Privacyverklaring']), [rij('Quirine', 'Tijdvak').concat(['Maandag', 'Dinsdag, Woensdag', J])]);
  var teksten = ["Maandag en dinsdag. Woensdag alleen 's middags.", 'Donderdag (niet in de toetsweek)', 'Iedere middag behalve vrijdag', 'Op maandag en dinsdag heb ik college, de rest van de week kan ik',
    'Maandag ben ik bezet, dinsdag kan ik', 'Ik werk op maandag en dinsdag, dus woensdag t/m vrijdag', 'Na schooltijd', 'Mon-Fri', 'Monday to Friday', 'Mon, Wed', 'Ik werk op maandag en donderdag'];
  T.tekst = tab(OK5.concat(['Wanneer ben je beschikbaar?', 'Privacyverklaring']), teksten.map(function (x, i) { return rij('T' + i, 'Tekst').concat([x, J]); }));
  T.behalve = tab(OK5.concat(['Welke werkzaamheden wil je doen?', 'In welk type onderwijs wil je werken?', 'Privacyverklaring']), [rij('Tim', 'Behalve').concat(['Alles behalve surveillance', 'Geen mbo, wel vo', J]),
    rij('Uma', 'Liever').concat(['Liever geen huiswerkbegeleiding, wel examentraining', 'VO', J]), rij('Vera', 'Andere').concat(['Huiswerkbegeleider, alleen kleine groepen vanwege mijn ziekte', 'VO', J])]);
  T.verwerkt = tab(OK5.concat(['Privacyverklaring', 'Verwerkt']), [rij('Wout', 'Nee').concat([J, 'Nee']), rij('Xena', 'Ja').concat([J, 'Ja'])]);
  T.klein1 = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Welke opleiding volg je?', 'Studiejaar', 'Privacyverklaring'], [[d, 'kees.opleiding@mail.example', 'Kees Opleiding', 'Pabo', '2', J]]);
  T.klein2 = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Wil je onze nieuwsbrief ontvangen?', 'Privacyverklaring'], [[d, 'nora.nieuwsbrief@mail.example', 'Nora Nieuwsbrief', 'Ja', J]]);
  T.klein3 = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Hoe ben je bij ons terechtgekomen? (bijv. via school of een vriend)', 'Privacyverklaring'], [[d, 'vince.vriend@mail.example', 'Vince Vriend', 'Via een vriendin', J]]);
  T.bereiken = tab(['Tijdstempel', 'Naam', 'Hoe kunnen we je bereiken? (e-mail of telefoonnummer)', 'Privacyverklaring'], [[d, 'Romy Bereik', 'romy.bereik@mail.example', J], [d, 'Sem Bereik', '06 1000 0499', J]]);
  T.hernoemd = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Privacyverklaring'], [[d, 'fien.hernoemd@mail.example', 'Fien', 'Hernoemd', J]], 'Aanmeldformulier');
  T.website = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Privacyverklaring'], [[d, 'wim.website@mail.example', 'Wim', 'Website', J]], 'Antwoorden website');
  T.twijfel = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Wat is je vraag?'], [[d, 'quinten.vraag@mail.example', 'Quinten Vraag', 'Hoe werkt het?']]);
  var hand = F.blad('Aanmeldingen');
  ['-', '?', 'onbekend', 'volgt'].forEach(function (x, i) { hand.appendRow(['2-11-2026', 'H' + i, 'Handmatig', tel(), 'h' + i + '.handmatig@mail.example', '', '', '', '', x, '', '']); });
  var uit = F.aanmeldingenVerwerken(), fout = function (b) { return (uit.fouten || []).filter(function (x) { return x.indexOf('"' + b.getName() + '"') >= 0; }).join(); };
  eis(!!tl('ada.akkoord@mail.example').id && weiger.every(function (a, i) { return !tl('w' + i + '.weiger@mail.example').id && (i === weiger.length - 1 || /^overgeslagen: geen toestemming/.test(T.toest.rijen[i + 2][kolom(T.toest, 'verwerkt')])); }) &&
    /^wacht: .*onduidelijk/.test(T.toest.rijen[weiger.length + 1][kolom(T.toest, 'verwerkt')]),
    'v7.4.1 herstel 2 (review 1, U01): toestemming is een witte lijst: "Ik ga hiermee niet akkoord", "Ik heb bezwaar", "Liever niet", "Weigeren", "Declined", "❌", "Weet ik nog niet", "Mee oneens" en "… geen toestemming" zijn nee, "… gelezen" is onduidelijk (ronde 5: die rij wacht)');
  eis([0, 1, 2, 3].every(function (i) { return !tl('h' + i + '.handmatig@mail.example').id; }) && hand.rijen.slice(-4).every(function (r) { return r[10] === 'wacht: geen toestemming herkend (antwoord onduidelijk)'; }),
    'v7.4.1 herstel 2 (U02): in het tabblad Aanmeldingen zijn "-", "?", "onbekend" en "volgt" geen toestemming (ronde 5: de rij wacht, "wacht: geen toestemming herkend (antwoord onduidelijk)")');
  eis(!!tl('rik.volwassen@mail.example').id && !tl('mia.minder@mail.example').id, 'v7.4.1 herstel 2 (review 2): "n.v.t." bij een tweede beslissende toestemmingsvraag (wettelijk vertegenwoordiger) telt als niet ingevuld; "Nee" daar blokkeert wel');
  eis(!tl('olle.oproep@mail.example').id && /geen toestemmingsvraag/.test(fout(T.contract)), 'v7.4.1 herstel 2 (review 2): een akkoord-vraag over een oproepcontract is geen toestemmingsvraag (geen profiel, wel de fout "geen toestemmingsvraag")');
  eis(!!tl('vik.verwerking@mail.example').id && K(['Tijdstempel', 'E-mailadres', 'Gegevensverwerking'], 'toestemming') === '2', 'v7.4.1 herstel 2 (review 5): "Verwerking persoonsgegevens" en "Gegevensverwerking" zijn toestemmingsvragen');
  var nm = function (e) { var t = tl(e); return t.voornaam + '|' + t.achternaam; };
  eis(nm('piet.komma@mail.example') === 'Piet|Jansen' && nm('anne.komma@mail.example') === 'Anne|de Vries' && nm('tess.komma@mail.example') === 'Tess|Bakker' && nm('yfke.paar@mail.example') === 'Yfke|Paar' &&
    nm('jan.dubbel@mail.example') === 'Jan|Dubbel' && nm('arne.vlaams@mail.example') === 'Arne|Vlaams' && nm('sanne.dewit@mail.example') === 'Sanne|de Wit',
    'v7.4.1 herstel 2 (review 4, U26-U28, U32-U34): "Achternaam, voornaam" en "Bakker, Tess" (komma), "Naam" naast "Achternaam" is de voornaam, "Voornaam" + "Naam" (Vlaams), "Sanne de Wit" naast "de Wit"');
  var cas = tl('cas.cv@mail.example');
  eis(!!cas.id && /Andere toestemming: Toestemming om je cv te delen met scholen: Nee, eerst overleggen/.test(notitie(cas)), 'v7.4.1 herstel 2 (U03): een toestemmingsvraag voor een ander doel (cv delen) beslist niet; het antwoord staat in de notitie');
  var eva = tl('eva.omgekeerd@mail.example'), fenna = tl('fenna.nietwilt@mail.example'), gijs = tl('gijs.huidig@mail.example'), ilse = tl('ilse.werkgever@mail.example');
  eis(lijst(eva.functies) === 'huiswerkbegeleider' && lijst(eva.sectoren) === 'vo' && !!fenna.id && lijst(fenna.functies) === '', 'v7.4.1 herstel 2 (U04, U05): de omgekeerde vraag ("… wil je liever niet doen?", "… niet wilt doen?") is geen wens');
  eis(lijst(gijs.functies) === 'examentrainer' && lijst(gijs.sectoren) === 'vo' && !!ilse.id && lijst(ilse.functies) === '' && K(['Tijdstempel', 'E-mailadres', 'In welk type onderwijs werk je het liefst?'], 'sector') === '2',
    'v7.4.1 herstel 2 (U06-U10): wat iemand al doet of deed ("… al eens gedaan?", "Welke functie heb je?", "Previous job", "… werk je op dit moment?", "Werkgever" + "Functie") is geen wens; "… werk je het liefst?" wel');
  var lot = tl('lot.bijbaan@mail.example'), mees = tl('mees.week@mail.example'), olaf = tl('olaf.bereik@mail.example'), qui = tl('quirine.tijdvak@mail.example');
  eis(rs(lot, 'ma') === '020' && rs(lot, 'di') === '000' && rs(lot, 'wo') === '220', 'v7.4.1 herstel 2 (U11): een raster "Op welke dagen werk je al? [Maandag]" is geen beschikbaarheid');
  eis(week(mees) === '000 220 000 000 000' && /Niet herkend: beschikbaarheid Blauw/.test(notitie(mees)), 'v7.4.1 herstel 2 (U12, U13): rasteropties College, N.v.t. en Onbekend zijn 0, Vrij 2; een onbekende optie is 0 en staat als "Niet herkend" in de notitie');
  eis(week(olaf) === '020 020 020 020 020' && rs(olaf, 'za') === '200' && rs(olaf, 'zo') === '200' && week(qui) === '200 020 020 000 000',
    'v7.4.1 herstel 2 (U14-U16): rasterrijen met een bereik ("Ma t/m vr", "Za-zo") en met een tijdvak ("8.30 - 12.00 uur" = ochtend, "12.30 - 16.00 uur" = middag)');
  var tt = function (i) { return tl('t' + i + '.tekst@mail.example'); };
  eis(week(tt(0)) === '220 220 020 000 000' && rs(tt(1), 'do') === '220' && week(tt(2)) === '020 020 020 020 000' && week(tt(3)) === '000 000 220 220 220' && week(tt(4)) === '000 220 000 000 000' &&
    week(tt(5)) === '000 000 220 220 220' && week(tt(6)) === '020 020 020 020 020' && week(tt(10)) === '220 000 000 220 000',
    'v7.4.1 herstel 2 (U17): vrije tekst met een punt als zinsgrens, haakjes, "iedere middag behalve", college, bezet, "ik werk op … dus", "de rest van de week" en "na schooltijd"; alleen "Ik werk op maandag en donderdag" blijft beschikbaar');
  eis(week(tt(7)) === '220 220 220 220 220' && week(tt(8)) === '220 220 220 220 220' && week(tt(9)) === '220 000 220 000 000', 'v7.4.1 herstel 2 (U18): Engelse vrije tekst "Mon-Fri", "Monday to Friday" en "Mon, Wed"');
  var vragen = ['Hoeveel uur per week en op welke dagen ben je beschikbaar?', 'Op welke momenten kun je werken?', 'Op welke dagen ben je beschikbaar voor ziektevervanging?', 'Beschikbaarheid (dagen en uren)'];
  eis(vragen.every(function (v) { return K(['Tijdstempel', 'E-mailadres', v], 'beschikbaarheid') === '2'; }) && K(['Tijdstempel', 'E-mailadres', 'Hoeveel uur per week ben je beschikbaar?'], 'beschikbaarheid') === '',
    'v7.4.1 herstel 2 (U19-U21, U38): "Hoeveel uur … en op welke dagen", "Op welke momenten", "… voor ziektevervanging" en "(dagen en uren)" zijn de beschikbaarheid; alleen uren niet');
  var kopT = ['Tijdstempel', 'E-mailadres', 'Naam (zoals bekend bij je opleiding)', 'Telefoonnummer (zodat de school je kan bellen)', 'Postcode (voor de reisafstand naar de school)', 'Welke werkzaamheden wil je doen? (ervaring is niet nodig)',
    'In welk type onderwijs wil je werken? (ervaring niet nodig)', 'Op welke dagen ben je beschikbaar? (bijv. maandag 8.30-12.00 uur)', 'Ik geef toestemming om mijn gegevens op te slaan (ben je jonger dan 16, dan vult je ouder/verzorger dit in)'];
  eis(['naam', 'telefoon', 'postcode', 'functies', 'sector', 'beschikbaarheid', 'toestemming'].every(function (v, i) { return K(kopT, v) === String(i + 2); }) &&
    K(['Tijdstempel', 'E-mailadres', 'Telefoonnummer (van je ouder)'], 'telefoon') === '' && K(['Tijdstempel', 'Naam', 'E-mailadres (stagebegeleider)'], 'email') === '',
    'v7.4.1 herstel 2 (U35-U37): een toelichting ("zoals bekend bij je opleiding", "zodat de school je kan bellen", "ervaring is niet nodig", "8.30-12.00 uur", "jonger dan 16 … ouder") zet een veld niet uit; "(van je ouder)" en "(stagebegeleider)" wel');
  eis(!!tl('kees.opleiding@mail.example').id && !!tl('nora.nieuwsbrief@mail.example').id && tl('vince.vriend@mail.example').voornaam === 'Vince' && !!tl('romy.bereik@mail.example').id &&
    F.lees('Talenten').some(function (t) { return t.voornaam === 'Sem' && t.achternaam === 'Bereik' && F.telefoonIn(t.telefoon) === '0610000499'; }) && !!tl('fien.hernoemd@mail.example').id && !!tl('wim.website@mail.example').id,
    'v7.4.1 herstel 2 (U22-U25, U39): kleine formulieren (opleiding, nieuwsbrief, "via school of een vriend"), één vraag "Hoe kunnen we je bereiken?" (e-mail of telefoon) en een hernoemd antwoordtabblad worden verwerkt');
  eis(!tl('quinten.vraag@mail.example').id && kolom(T.twijfel, 'verwerkt') < 0 && /lijkt geen aanmeldformulier/.test(fout(T.twijfel)) &&
    F.lees('Meldingen').some(function (m) { return m.voor === 'Iris Mulder' && /lijkt geen aanmeldformulier/.test(m.tekst); }),
    'v7.4.1 herstel 2 (U22-U25): een tabblad met contactgegevens dat niet duidelijk een aanmeldformulier is, wordt niet stil overgeslagen: een fout en een melding, geen profiel en geen markering');
  var tim = tl('tim.behalve@mail.example'), uma = tl('uma.liever@mail.example'), vera = tl('vera.andere@mail.example');
  var veraAlles = JSON.stringify(vera) + notitie(vera) + JSON.stringify(F.lees('Meldingen').filter(function (m) { return m.link === 'talent:' + vera.id; }));
  eis(lijst(tim.sectoren) === 'vo' && F.lijstUit(tim.functies).indexOf('surveillant') < 0 && /behalve surveillance/.test(notitie(tim)) && lijst(uma.functies) === 'examentrainer',
    'v7.4.1 herstel 2 (U29): een ontkenning in het antwoord ("Alles behalve surveillance", "Geen mbo, wel vo", "Liever geen huiswerkbegeleiding") geeft geen code; de tekst blijft als "Niet herkend"');
  eis(lijst(vera.functies) === 'huiswerkbegeleider' && veraAlles.indexOf('ziekte') < 0 && /eigen antwoord, niet overgenomen/.test(notitie(vera)), 'v7.4.1 herstel 2 (U30, AVG): een niet herkend antwoord met gezondheidsinformatie komt niet in het profiel of de notitie (ronde 4: "(eigen antwoord, niet overgenomen)")');
  eis(!!tl('wout.nee@mail.example').id && !tl('xena.ja@mail.example').id, 'v7.4.1 herstel 2 (U31): een eigen kolom "Verwerkt" met "Nee" is nog niet verwerkt, met "Ja" wel');
});
/* ---- v7.4.1 herstel ronde 2: bestaande talenten (intrekking, opnieuw aangemeld), een gewiste kolom 'verwerkt', een verlopen rij en één leesbeurt per run ---- */
aanmeldBlok('herstel ronde 2 (bestaande talenten)', function () {
  var F = formulierCtx(true), J = 'Ik geef toestemming om mijn gegevens op te slaan in het talentbestand', vandaag = vm.runInContext('(function (d) { return d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear(); })', F);
  var nu = vandaag(F.plusDagen(-1)) + ' 08:00', oud = vandaag(F.plusDagen(-800)) + ' 10:00';  // gisteren, en ruim twee jaar geleden (de bewaartermijn is 24 maanden)
  var hans = F.schrijf('Talenten', { voornaam: 'Hans', achternaam: 'Intrek', email: 'hans.intrek@mail.example', telefoon: '0610000480', status: 'actief' });
  var dirk = F.schrijf('Talenten', { voornaam: 'Dirk', achternaam: 'Hoofd', email: 'dirk.hoofd@mail.example', telefoon: '0610000481', status: 'slapend', functies: ['surveillant'], beschikbaarheid: { ma: [2, 2, 0] } });
  var tab = function (naam, kop, rijen) { var b = F._demoSS.insertSheet(naam); b.appendRow(kop); rijen.forEach(function (r) { b.appendRow(r); }); return b; };
  var A = tab('Formulierreacties 1', ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Mogen we je gegevens bewaren? (toestemming)'], [[nu, 'Hans.Intrek@Mail.Example', 'Hans', 'Intrek', '0610000480', 'Nee, verwijder mijn gegevens']]);
  tab('Formulierreacties 2', ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Welke werkzaamheden wil je doen?', 'Wanneer ben je beschikbaar?', 'Privacyverklaring'],
    [[nu, 'DIRK.HOOFD@MAIL.EXAMPLE', 'Dirk', 'Hoofd', '06 10000482', 'Examentrainer', 'Woensdag en vrijdag', J]]);
  var veel = []; for (var i = 0; i < 30; i++) veel.push([nu, 'p' + i + '.veel@mail.example', 'P' + i, 'Veel', '06100005' + ('0' + i).slice(-2), J]);
  var C = tab('Formulierreacties 3', ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring'], [[oud, 'gert.oud@mail.example', 'Gert', 'Oud', '0610000483', J]].concat(veel));
  var gelezen = 0, orig = F.leesUitSheet; F.leesUitSheet = function (naam, licht) { if (naam === 'Talenten') gelezen++; return orig(naam, licht); };
  F._demoVerzonden.length = 0;
  var ar = F.aanmeldingenVerwerken(), T = F.lees('Talenten');
  F.leesUitSheet = orig;
  var notities = function (t) { return F.lees('Activiteiten').filter(function (a) { return a.talentId === t.id; }); }, een = function (t) { return T.filter(function (x) { return x.id === t.id; })[0] || {}; };
  eis(een(hans).status === 'actief' && notities(hans).some(function (a) { return /zonder toestemming/.test(a.onderwerp); }) && A.rijen[1][6] === 'overgeslagen: geen toestemming' &&
    F.lees('Meldingen').some(function (m) { return m.link === 'talent:' + hans.id && /trekt die mogelijk in/.test(m.tekst); }),
    'v7.4.1 herstel 2 (tegenspeler, AVG): een bekend talent dat het formulier zonder toestemming invult: notitie bij het profiel en een melding aan het talentteam (mogelijke intrekking); Athena verwijdert zelf niets');
  var dn = notities(dirk).map(function (a) { return a.tekst; }).join(' ');
  eis(T.filter(function (t) { return /dirk\.hoofd/i.test(t.email); }).length === 1 && een(dirk).status === 'actief' && F.telefoonIn(een(dirk).telefoon) === '0610000481' && /telefoon 0610000482/.test(dn) && /functies examentrainer/.test(dn) && /beschikbaarheid wo, vr/.test(dn),
    'v7.4.1 herstel 2 (tegenspeler): wie zich opnieuw aanmeldt houdt zijn profiel; de afwijkende antwoorden (telefoon, functies, dagen) staan in de notitie (' + dn.slice(0, 80) + ')');
  eis(!T.some(function (t) { return t.email === 'gert.oud@mail.example'; }) && !ar.mails.some(function (m) { return m.t.email === 'gert.oud@mail.example'; }) && C.rijen[1][6] === 'overgeslagen: bewaartermijn verstreken' &&
    !!ar.overgeslagen && ar.overgeslagen.bewaartermijn === 1, 'v7.4.1 herstel 2 (tegenspeler): een oude rij waarvan de bewaartermijn al voorbij is krijgt geen profiel en geen welkomstmail');
  eis(gelezen <= 2 && T.filter(function (t) { return /\.veel@mail\.example$/.test(t.email); }).length === 30, 'v7.4.1 herstel 2: Talenten wordt één keer per run gelezen (plus één keer na het bijwerken van een slapend profiel), niet per rij (' + gelezen + ' keer bij 32 rijen)');
  var kV = C.rijen[0].indexOf('verwerkt'); C.rijen.slice(1).forEach(function (r) { r[kV] = ''; }); F.vergeet('Formulierreacties 3');
  var m0 = F.lees('Meldingen').length, tweede = F.aanmeldingenVerwerken();
  eis(tweede.nieuw === 0 && tweede.bestaand === 0 && F.lees('Meldingen').length === m0, 'v7.4.1 herstel 2 (tegenspeler): een rij met een talentId telt als verwerkt, ook als iemand de kolom "verwerkt" leegmaakte');
  var V = formulierCtx(true), vb = V._demoSS.insertSheet('Formulierreacties 1'); vb.appendRow(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Privacyverklaring']); vb.appendRow([oud, 'gert.oud@mail.example', 'Gert', 'Oud', J]);
  V._demoVerzonden.length = 0;
  eis(/^0 nieuw, 0 bestaand, 0 mails, 1 met verstreken bewaartermijn$/.test(V.aanmeldingenRun()) && V._demoVerzonden.length === 0, 'v7.4.1 herstel 2: aanmeldingenRun noemt de verlopen rij (", 1 met verstreken bewaartermijn") en mailt niet');
});
/* ---- v7.4.1 herstel ronde 4 (tegenspeler r3 en review): toestemming in de hoofdzin en nooit stil, andere formulieren, contactkolommen als witte lijst, één
   filter voor vrije tekst (AVG), ontkende dagdelen, tijden, dagen en dagdelen uit twee kolommen, nieuwe toestemming van een bekend talent; alles verzonnen ---- */
aanmeldBlok('herstel ronde 4', function () {
  var F = formulierCtx(), J = 'Ik geef toestemming om mijn gegevens op te slaan in het talentbestand', d = '2-11-2026 08:00', n = 60, nr = 600, T = {};
  var tel = function () { return '0610000' + String(nr++); };
  var tab = function (kop, rijen, naam) { var b = F._demoSS.insertSheet(naam || 'Formulierreacties ' + (n++)); b.appendRow(kop); rijen.forEach(function (r) { b.appendRow(r); }); return b; };
  var tl = function (email) { return F.lees('Talenten').filter(function (t) { return t.email === email; })[0] || {}; };
  var rs = function (t, dg) { return t.id ? F.beschikbaarheidUit(t.beschikbaarheid)[dg].join('') : '?'; }, lijst = function (s) { return F.lijstUit(s).slice().sort().join(); };
  var week = function (t) { return ['ma', 'di', 'wo', 'do', 'vr'].map(function (x) { return rs(t, x); }).join(' '); };
  var probeer = function (fn) { try { return fn(); } catch (e) { return undefined; } }, kolom = function (b, naam) { return b.rijen[0].indexOf(naam); };
  var tekst = function (t) { return probeer(function () { var r = F.beschikbaarheidUitTekst(t); return ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(function (x) { return r[x].join(''); }).join(' '); }); };
  var notitie = function (t) { return F.lees('Activiteiten').filter(function (a) { return t.id && a.talentId === t.id; }).map(function (a) { return a.onderwerp + ' ' + a.tekst; }).join(' | '); };
  var K = function (kop, veld) { return probeer(function () { return F.aanmeldKolommen(['Tijdstempel'].concat(kop))[veld].join(); }); };
  var OK5 = ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer'];
  var rij = function (voor, achter) { return [d, voor.toLowerCase() + '.' + achter.toLowerCase() + '@mail.example', voor, achter, tel()]; };
  var bekend = F.schrijf('Talenten', { voornaam: 'Lot', achternaam: 'Gelezen', email: 'lot.gelezen@mail.example', telefoon: '0610000699', status: 'actief' });
  var bijzin = ['Ik geef toestemming voor het bewaren van mijn gegevens en weet dat ik die altijd kan intrekken', 'Ik ga akkoord met de privacyverklaring, mijn gegevens worden niet gedeeld met derden',
    'Ik geef toestemming om mijn gegevens te bewaren tot ik me afmeld', 'Ja, ik geef toestemming; je gegevens worden nooit verkocht'];
  T.bijzin = tab(OK5.concat(['Privacyverklaring']), bijzin.map(function (x, i) { return rij('Bz' + i, 'Bijzin').concat([x]); }).concat([rij('Bz', 'Nietakkoord').concat(['Ik ga niet akkoord']),
    rij('Bz', 'Disagree').concat(['I do not agree']), rij('Lot', 'Gelezen').concat(['Ik heb de privacyverklaring gelezen'])]));
  T.vaak = tab(OK5.concat(['Privacyverklaring']), [rij('Va', 'Ja').concat(['Ja'])].concat([0, 1, 2].map(function (i) { return rij('Va' + i, 'Nee').concat(['Nee, liever niet']); })));
  T.twijfel = tab(OK5.concat(['Privacyverklaring']), [rij('Tw', 'Een').concat(['Ik heb de privacyverklaring gelezen en begrepen']), rij('Tw', 'Twee').concat(['Ik heb de privacyverklaring gelezen en begrepen'])]);
  var hand = F.blad('Aanmeldingen');
  ['gegeven', 'mondeling gegeven', 'getekend', 'aangevinkt', 'verkregen', 'wel'].forEach(function (x, i) { hand.appendRow(['2-11-2026', 'Hand' + i, 'Gegeven', tel(), 'hand' + i + '.gegeven@mail.example', '', '', '', '', x, '', '']); });
  T.offerte = tab(['Tijdstempel', 'Naam', 'Naam van je school', 'Functie', 'E-mailadres', 'Telefoonnummer', 'Waar kunnen we je mee helpen?', 'Ik ga akkoord met de privacyverklaring'],
    [[d, 'Karin Offerte', 'Esdoorn College', 'Teamleider onderbouw', 'k.offerte@esdoorn.example', '0301230601', 'Wij zoeken twee surveillanten', 'Ja']]);
  T.contact = tab(['Tijdstempel', 'Naam', 'E-mailadres', 'Telefoonnummer', 'Namens welke school of organisatie neem je contact op?', 'Je vraag of bericht', 'Privacy'],
    [[d, 'Joost Contact', 'j.contact@lindeschool.example', '0201230602', 'Lindeschool', 'Graag een offerte', 'Akkoord']]);
  T.scholier = tab(OK5.concat(['Postcode', 'Naam van je school', 'Privacyverklaring']), [rij('Lars', 'Scholier').concat(['2511 AA', 'Lyceum Denkbeeld', J])]);
  T.derden = tab(['Tijdstempel', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'E-mailadres (optioneel)', 'Naam van je stagedocent', 'E-mailadres van je stagedocent', 'Telefoonnummer van je teamleider', 'Privacyverklaring'],
    [[d, 'Sam', 'Stagiair', '0610000690', '', 'Petra Docent', 'p.docent@pabo.example', '0301230603', J], [d, 'Sem', 'Stagiair', '', '', 'Petra Docent', 'p.docent@pabo.example', '0301230603', J]]);
  T.referee = tab(['Timestamp', 'Name', 'Email', 'Phone number', 'Referee name', 'Referee email', 'Phone number of your manager', 'I agree to the privacy policy'],
    [[d, 'Noah Referee', '', '0610000691', 'Petra Ref', 'p.ref@mail.example', '0301230604', 'I agree']], 'Form Responses 9');
  T.delen = tab(OK5.concat(['Privacy', 'Toestemming om je e-mailadres te delen met scholen', 'Toestemming om je telefoonnummer te delen met scholen']), [rij('Deel', 'Niet').concat(['Ja', 'Nee', 'Nee'])]);
  T.avg = tab(OK5.concat(['Welke werkzaamheden wil je doen?', 'In welk type onderwijs wil je werken?', 'Privacyverklaring']),
    [rij('Avg', 'Een').concat(['Huiswerkbegeleider, Andere: alleen ochtenden vanwege mijn burn-out', 'vo, Andere: graag een school met een gebedsruimte', J]),
      rij('Avg', 'Straf').concat(['Examentrainer, Andere: ik heb een strafblad maar wel een VOG', 'vo', J]),
      rij('Avg', 'Lang').concat(['Surveillant, Andere: ik wil graag helpen met allerlei dingen op school zoals de bibliotheek en de kantine opruimen', 'vo', J])]);
  T.raster = tab(OK5.concat(['Beschikbaarheid [Maandag]', 'Beschikbaarheid [Dinsdag]', 'Beschikbaarheid [Woensdag]', 'Privacyverklaring']), [rij('Rast', 'Ontkend').concat(['Ochtend niet', '8.30 - 12.00', '8.30 - 12.00, 12.30 - 16.00', J])]);
  T.bellen = tab(OK5.concat(['Toestemming om je te bellen', 'Ik heb de privacyverklaring gelezen en ga akkoord met het opslaan van mijn gegevens']), [rij('Bel', 'Niet').concat(['Nee, liever per mail', 'Ja'])]);
  T.inval = tab(OK5.concat(['Wanneer ben je beschikbaar? (ook voor invallen bij ziekte)', 'Beschikbaarheid bij ziekte of verlof van docenten [Woensdag]', 'Welke werkzaamheden wil je doen? (bijv. bijles filosofie)', 'Privacyverklaring']),
    [rij('Inval', 'Ziek').concat(['Maandag en dinsdag', '', 'Huiswerkbegeleider, Examentrainer', J]), rij('Inval', 'Raster').concat(['', 'Ochtend, Middag', '', J])]);
  T.tweekolom = tab(OK5.concat(['Op welke dagen ben je beschikbaar?', 'Welke dagdelen?', 'Privacyverklaring']), [rij('Dag', 'Deel').concat(['Maandag, Woensdag', 'Middag, Avond', J]), rij('Dag', 'Alleen').concat(['Dinsdag, Donderdag', '', J])]);
  T.vrij = tab(OK5.concat(['Wanneer ben je beschikbaar?', 'Privacyverklaring']), [rij('Vrij', 'Tekst').concat(['Flexibel, bel me even', J])]);
  T.janee = tab(OK5.concat(['Welke werkzaamheden wil je doen?', 'Privacyverklaring']), [rij('Ja', 'Nee').concat(['Huiswerkbegeleiding ja, surveillance nee', J]), rij('Nee', 'Ja').concat(['Surveillance: nee. Huiswerkbegeleiding: ja', J])]);
  T.wat = tab(OK5.concat(['Wat wil je doen?', 'Voorkeursdagen', 'Privacyverklaring']), [rij('Wat', 'Wil').concat(['Huiswerkbegeleiding en surveillance', 'Dinsdag en donderdag', J])]);
  T.type = tab(['Timestamp', 'Email Address', 'First name', 'Last name', 'Phone number', 'Which type of school would you like to work at?', 'I agree to the privacy policy'], [[d, 'tess.type@mail.example', 'Tess', 'Type', tel(), 'Secondary school, Special needs', 'I agree']], 'Form Responses 8');
  T.accent = tab(OK5.concat(['Privacyverklaring']), [[d, 'renée.accent@mail.example', 'Renée', 'Accent', tel(), J]]);
  T.haakje = tab(['Tijdstempel', 'E-mailadres', 'Naam (voornaam)', 'Naam (achternaam)', 'Telefoonnummer', 'Privacyverklaring'], [[d, 'tess.haakje@mail.example', 'Tess', 'Haakje', tel(), J]]);
  T.adres = tab(OK5.concat(['Je woonadres (straat + huisnummer)', 'Postcode', 'Privacyverklaring']), [rij('Woon', 'Adres').concat(['Oudegracht 12', '3511 AB', J])]);
  var m0 = F.lees('Meldingen').length, uit = F.aanmeldingenVerwerken(), fouten = uit.fouten || [], fout = function (b) { return fouten.filter(function (x) { return x.indexOf('"' + b.getName() + '"') >= 0; }).join(); };
  var meldingen = F.lees('Meldingen').slice(m0), alles = JSON.stringify(F.lees('Talenten')) + JSON.stringify(F.lees('Activiteiten')) + JSON.stringify(F.lees('Meldingen'));
  // H1
  eis(bijzin.every(function (x, i) { return !!tl('bz' + i + '.bijzin@mail.example').id; }) && !tl('bz.nietakkoord@mail.example').id && !tl('bz.disagree@mail.example').id &&
    ['Nee', 'No', 'Niet akkoord', 'Ik geef geen toestemming', "I don't", 'Nee, verwijder mijn gegevens'].every(function (x) { return probeer(function () { return F.toestemmingOordeel(x); }) === 'nee'; }),
    'v7.4.1 ronde 4 (H1, V01): een ontkenning in een bijzin na het ja-deel telt niet ("… en weet dat ik die altijd kan intrekken", "…, mijn gegevens worden niet gedeeld", "… tot ik me afmeld"); "Ik ga niet akkoord", "I do not agree", "Nee", "Niet akkoord" blijven nee');
  eis([0, 1, 2, 3, 4, 5].every(function (i) { return !!tl('hand' + i + '.gegeven@mail.example').id; }), 'v7.4.1 ronde 4 (H1, V21): toestemming "gegeven", "mondeling gegeven", "getekend", "aangevinkt", "verkregen" en "wel" is ja');
  var zonder = meldingen.filter(function (m) { return m.voor === 'Iris Mulder' && /overgeslagen zonder toestemming/.test(m.tekst); }), nOver = (uit.overgeslagen || {}).geenToestemming;
  eis(zonder.length === 1 && zonder[0].tekst.indexOf(nOver + ' aanmeldingen zijn overgeslagen') === 0 && /meest gegeven antwoord: "Nee, liever niet"/.test(zonder[0].tekst) && /verwerkt leeg/.test(zonder[0].tekst),
    'v7.4.1 ronde 4 (H1a): rijen zonder toestemming gaan niet stil: één melding aan het talentteam met het aantal (' + nOver + ') en het antwoord dat het vaakst voorkwam');
  F.aanmeldingenVerwerken();
  eis(F.lees('Meldingen').filter(function (m) { return m.voor === 'Iris Mulder' && /overgeslagen zonder toestemming/.test(m.tekst); }).length === 1, 'v7.4.1 ronde 4 (H1a): die melding komt hoogstens één keer per dag');
  eis(!tl('tw.een@mail.example').id && T.twijfel.rijen.slice(1).every(function (r) { return /^wacht: /.test(r[kolom(T.twijfel, 'verwerkt')]); }) && /gelezen en begrepen/.test(fout(T.twijfel)) && /2 aanmeldingen wachten/.test(fout(T.twijfel)) &&
    meldingen.some(function (m) { return m.voor === 'Iris Mulder' && /met een onduidelijke toestemming/.test(m.tekst); }) && kolom(T.vaak, 'verwerkt') > 0 && !!tl('va.ja@mail.example').id,
    'v7.4.1 ronde 4 (H1b, V02; ronde 5): een onduidelijk antwoord ("… gelezen en begrepen") geeft geen profiel en wacht ("wacht: …", fout, melding); de rest van het tabblad wordt verwerkt');
  // H2
  eis(!tl('k.offerte@esdoorn.example').id && !tl('j.contact@lindeschool.example').id && kolom(T.offerte, 'verwerkt') < 0 && kolom(T.contact, 'verwerkt') < 0 && !fout(T.offerte) && !fout(T.contact) && !!tl('lars.scholier@mail.example').id,
    'v7.4.1 ronde 4 (H2, V08/V09): een offerte- of contactformulier van een school (naam van je school, namens welke organisatie, zonder vraag naar werk, sector of dagen) maakt geen talenten; een scholier die zijn school noemt naast zijn postcode wel');
  // H3
  var sam = tl('sam.stagiair@mail.example');
  eis(!!F.lees('Talenten').filter(function (t) { return t.voornaam === 'Sam' && t.achternaam === 'Stagiair'; })[0] && !F.lees('Talenten').some(function (t) { return t.voornaam === 'Sem' && t.achternaam === 'Stagiair'; }) &&
    ['p.docent@pabo.example', '0301230603', 'p.ref@mail.example', '0301230604', 'Petra'].every(function (x) { return alles.indexOf(x) < 0; }) && F.lees('Talenten').some(function (t) { return t.voornaam === 'Noah' && !t.email; }) &&
    K(['E-mailadres van je stagedocent'], 'email') === '' && K(['Referee email'], 'email') === '' && K(['Phone number of your manager'], 'telefoon') === '' && K(['Toestemming om je e-mailadres te delen met scholen'], 'email') === '' &&
    K(['Wat is je e-mailadres?', 'Op welk nummer kunnen we je bereiken?', 'Je eigen e-mailadres (dus niet dat van je ouders)'], 'email').split(',').sort().join() === '1,3' && !sam.id,
    'v7.4.1 ronde 4 (H3, V10/V11): e-mail, telefoon en naam van een stagedocent, teamleider, referee of manager worden nooit die van het talent (witte lijst); zonder eigen contact geen profiel');
  eis(/Andere toestemming: Toestemming om je e-mailadres te delen met scholen: Nee · Toestemming om je telefoonnummer te delen met scholen: Nee/.test(notitie(tl('deel.niet@mail.example'))),
    'v7.4.1 ronde 4 (H3, V15): een kop met "toestemming" is nooit een contactkolom; de weigering "delen met scholen: Nee" staat als "Andere toestemming" in de notitie');
  // H4
  var avg = notitie(tl('avg.een@mail.example')) + notitie(tl('avg.straf@mail.example')), lang = notitie(tl('avg.lang@mail.example'));
  eis(lijst(tl('avg.een@mail.example').functies) === 'huiswerkbegeleider' && ['burn', 'gebedsruimte', 'strafblad'].every(function (x) { return alles.toLowerCase().indexOf(x) < 0; }) &&
    /eigen antwoord, niet overgenomen/.test(avg) && /ik wil graag helpen met allerlei dingen/.test(lang) && lang.indexOf('kantine') < 0,
    'v7.4.1 ronde 4 (H4, V12, AVG): gezondheid, religie of strafrecht in "Andere: …" komt nooit als tekst in het profiel ("(eigen antwoord, niet overgenomen)"); elk onderdeel hoogstens 60 tekens');
  // H5 en M4
  eis(tekst('Ma t/m vr, geen avonden') === '220 220 220 220 220 000 000' && tekst('Doordeweeks, maar geen avonden') === '220 220 220 220 220 000 000' && tekst("Overdag, niet 's avonds") === '220 220 220 220 220 000 000' &&
    tekst('Maandag en dinsdag, maar niet in de ochtend') === '020 020 000 000 000 000 000' && tekst("Maandagmiddag en dinsdagmiddag, niet 's ochtends") === '020 020 000 000 000 000 000' &&
    tekst('Ochtenden niet, middagen wel') === '020 020 020 020 020 000 000' && tekst("Alle dagen behalve 's avonds") === '220 220 220 220 220 220 220' && rs(tl('rast.ontkend@mail.example'), 'ma') === '020',
    'v7.4.1 ronde 4 (H5, V03): een ontkend dagdeel ("geen avonden", "niet \'s avonds", "niet in de ochtend", "Ochtenden niet", "behalve \'s avonds", rastercel "Ochtend niet") is 0 en draait niets om');
  eis(tekst('Maandag en woensdag vanaf 13.00 uur') === '020 000 020 000 000 000 000' && tekst('Dinsdag 8.30-12.00') === '000 200 000 000 000 000 000' && tekst('Donderdag tot 12 uur') === '000 000 000 200 000 000 000' &&
    tekst('Ma t/m vr 10-12 uur per week') === '220 220 220 220 220 000 000' && rs(tl('rast.ontkend@mail.example'), 'di') === '200' && rs(tl('rast.ontkend@mail.example'), 'wo') === '220',
    'v7.4.1 ronde 4 (M4, V04/V05): tijden: "vanaf 13.00 uur" = middag, "8.30-12.00" en "tot 12 uur" = ochtend, rastercellen "8.30 - 12.00" en "12.30 - 16.00" = ochtend en middag; "10-12 uur per week" is geen tijd');
  // H6 staat hieronder (eigen context, echte bewaartermijn)
  // M1
  var bel = tl('bel.niet@mail.example');
  eis(!!bel.id && /Andere toestemming: Toestemming om je te bellen: Nee, liever per mail/.test(notitie(bel)),
    'v7.4.1 ronde 4 (M1, V14): een toestemmingsvraag zonder woord over het talentbestand ("Toestemming om je te bellen") is een ander doel zodra een andere vraag er wel een heeft, ook als hij hoger scoort');
  // M2
  var inval = tl('inval.ziek@mail.example');
  eis(week(inval) === '220 220 000 000 000' && rs(tl('inval.raster@mail.example'), 'wo') === '220' && lijst(inval.functies) === 'examentrainer,huiswerkbegeleider' &&
    probeer(function () { return F.priveWoord('ziekteverlof') && F.priveWoord('sofi nummer') && F.priveWoord('ben je ziek geweest') && !F.priveWoord('bijles filosofie') && !F.priveWoord('invallen bij ziekte van een docent'); }) === true,
    'v7.4.1 ronde 4 (M2, V22-V24): "invallen bij ziekte", "ziekte of verlof van docenten" en "filosofie" maken een kolom niet privé; "ziekteverlof", "Sofi-nummer" en "ben je ziek geweest" wel');
  // M3
  var dd = tl('dag.deel@mail.example'), da = tl('dag.alleen@mail.example');
  eis(week(dd) === '022 000 022 000 000' && week(da) === '000 220 000 220 000', 'v7.4.1 ronde 4 (M3, V06): de dagen uit "Op welke dagen …?" en de dagdelen uit "Welke dagdelen?" samen (ma en wo middag en avond)');
  // M5
  var vrij = tl('vrij.tekst@mail.example');
  eis(!!vrij.id && week(vrij) === '000 000 000 000 000' && /Niet herkend: beschikbaarheid Flexibel, bel me even/.test(notitie(vrij)), 'v7.4.1 ronde 4 (M5, V07): beschikbaarheidstekst waar geen raster uit komt staat als "Niet herkend" in de notitie; Athena verzint geen dagen');
  // M6
  eis(lijst(tl('ja.nee@mail.example').functies) === 'huiswerkbegeleider' && lijst(tl('nee.ja@mail.example').functies) === 'huiswerkbegeleider', 'v7.4.1 ronde 4 (M6, V18): "surveillance nee" en "Surveillance: nee. Huiswerkbegeleiding: ja" geven alleen huiswerkbegeleider');
  // M7
  var wat = tl('wat.wil@mail.example');
  eis(lijst(wat.functies) === 'huiswerkbegeleider,surveillant' && week(wat) === '000 220 000 220 000' && lijst(tl('tess.type@mail.example').sectoren) === 'so,vo' &&
    K(['E-mailadres', 'Which type of school would you like to work at?'], 'sector') === '2' && K(['E-mailadres', 'Voorkeursdagen'], 'beschikbaarheid') === '2',
    'v7.4.1 ronde 4 (M7, V19/V20): "Which type of school …" (stopwoord in de term), "Wat wil je doen?" en "Voorkeursdagen" (achterdeel) worden herkend');
  // M8
  var ren = F.lees('Talenten').filter(function (t) { return t.voornaam === 'Renée'; })[0] || {};
  eis(!!ren.id && !ren.email && /Niet herkend: e-mail/.test(notitie(ren)) && probeer(function () { return F.emailUitCel('zoë.devries@mail.example') === '' && F.emailUitCel('Mail: jan.bakker@mail.example') === 'jan.bakker@mail.example'; }) === true,
    'v7.4.1 ronde 4 (M8, V16): van "renée.accent@…" maakt Athena geen ander adres ("e.accent@…"): leeg en "Niet herkend: e-mail"');
  // M9 en M10
  var hk = tl('tess.haakje@mail.example'), wa = tl('woon.adres@mail.example');
  eis(hk.voornaam === 'Tess' && hk.achternaam === 'Haakje', 'v7.4.1 ronde 4 (M9, V13): "Naam (voornaam)" en "Naam (achternaam)": de toelichting beslist');
  eis(wa.postcode === '3511 AB' && wa.woonplaats === '' && K(['E-mailadres', 'Je woonadres (straat + huisnummer)'], 'woonplaats') === '', 'v7.4.1 ronde 4 (M10, V17): "Je woonadres (straat + huisnummer)" is geen woonplaats');
  // M11
  eis(!F.lees('Activiteiten').some(function (a) { return a.talentId === bekend.id && /zonder toestemming/.test(a.onderwerp); }) && !meldingen.some(function (m) { return m.link === 'talent:' + bekend.id && /trekt die mogelijk in/.test(m.tekst); }),
    'v7.4.1 ronde 4 (M11): een bekend talent met een onduidelijk antwoord ("… gelezen") krijgt geen melding "trekt mogelijk in" (alleen bij nee)');
  // M12
  var readme = fs.readFileSync(path.join(R, 'backend/README.md'), 'utf8').split('\n').filter(function (r) { return /apiTalentRunNu/.test(r) && /^\|/.test(r); })[0] || '';
  eis(/met verstreken bewaartermijn/.test(readme), 'v7.4.1 ronde 4 (M12): backend/README.md noemt bij apiTalentRunNu ook ", n met verstreken bewaartermijn"');
});
// v7.4.1 ronde 4 (H6): een bekend talent (e-mail in andere hoofdletters) waarvan de bewaartermijn gisteren afliep, meldt zich vandaag opnieuw aan met toestemming
aanmeldBlok('herstel ronde 4 (nieuwe toestemming)', function () {
  var F = formulierCtx(true), vandaag = vm.runInContext('datumStr(new Date())', F), gisteren = vm.runInContext('datumStr(plusDagen(-1))', F);
  var tekstDag = vm.runInContext('(function (d) { return d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear() + " 08:00"; })', F)(F.plusDagen(0));
  var mira = F.schrijf('Talenten', { voornaam: 'Mira', achternaam: 'Herhaal', email: 'Mira.Herhaal@Mail.Example', telefoon: '0610000698', status: 'slapend', toestemmingDatum: '2024-11-02', toestemmingGrondslag: 'toestemming', bewarenTot: gisteren });
  var b = F._demoSS.insertSheet('Formulierreacties 1');
  b.appendRow(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring']); b.appendRow([tekstDag, 'MIRA.HERHAAL@MAIL.EXAMPLE', 'Mira', 'Herhaal', '06 10000698', 'Ik geef toestemming om mijn gegevens op te slaan in het talentbestand']);
  var uit = F.aanmeldingenVerwerken(), t = F.lees('Talenten').filter(function (x) { return x.id === mira.id; })[0] || {};
  var anon = F.bewaartermijnRun(), na = F.lees('Talenten').filter(function (x) { return x.id === mira.id; })[0] || {};
  eis(uit.bestaand === 1 && F.lees('Talenten').filter(function (x) { return /herhaal/i.test(x.email); }).length === 1 && t.toestemmingDatum === vandaag && String(t.bewarenTot) > vandaag && anon === 0 && na.status !== 'uitgeschreven' && !!na.email &&
    F.lees('Activiteiten').some(function (a) { return a.talentId === mira.id && /Toestemming vernieuwd op/.test(a.tekst); }),
    'v7.4.1 ronde 4 (H6): wie zich opnieuw aanmeldt met toestemming krijgt een nieuwe toestemmingsdatum en bewaartermijn (met een regel in de notitie); bewaartermijnRun anonimiseert het profiel die nacht niet');
});
/* ---- v7.4.1 herstel ronde 5 (tegenspeler r4 en review r4): een ander persoon in de toelichting, eigen contactvragen met elk werkwoord, andere formulieren
   naast talentvragen, nooit stil (geen contactkolom, geen geldig contact, onduidelijke toestemming wacht, melding per dag telt op), beperkte toestemming,
   doelwoorden, ontdubbelen op telefoon met naam, bijzondere persoonsgegevens in samenstellingen, ontkende dag+dagdeel en opsommingen; alles verzonnen ---- */
aanmeldBlok('herstel ronde 5', function () {
  var F = formulierCtx(), d = '2-11-2026 08:00', n = 70, nr = 700, T = {}, J = 'Ik geef toestemming om mijn gegevens op te slaan in het talentbestand';
  var tel = function () { return '0610000' + String(nr++); };
  var tab = function (kop, rijen, naam) { var b = F._demoSS.insertSheet(naam || 'Formulierreacties ' + (n++)); b.appendRow(kop); rijen.forEach(function (r) { b.appendRow(r); }); return b; };
  var tl = function (email) { return F.lees('Talenten').filter(function (t) { return t.email === email; })[0] || {}; };
  var vn = function (voor) { return F.lees('Talenten').filter(function (t) { return t.voornaam === voor; }); };
  var probeer = function (fn) { try { return fn(); } catch (e) { return undefined; } }, kolom = function (b, naam) { return b.rijen[0].indexOf(naam); };
  var K = function (kop, veld) { return probeer(function () { return F.aanmeldKolommen(['Tijdstempel'].concat(kop))[veld].join(); }); };
  var tekst = function (t) { return probeer(function () { var r = F.beschikbaarheidUitTekst(t); return ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(function (x) { return r[x].join(''); }).join(' '); }); };
  var notitie = function (t) { return F.lees('Activiteiten').filter(function (a) { return t.id && a.talentId === t.id; }).map(function (a) { return a.onderwerp + ' ' + a.tekst; }).join(' | '); };
  var talentMeld = function () { return F.lees('Meldingen').filter(function (m) { return m.voor === 'Iris Mulder'; }); };
  // X01-X05: een ander persoon in de toelichting
  T.rol = tab(['Tijdstempel', 'Voornaam', 'Achternaam', 'Wat is je e-mailadres?', 'Telefoonnummer', 'E-mailadres (stagedocent)', 'Telefoonnummer (in geval van nood)', 'Telefoonnummer (ouder/verzorger, als je jonger bent dan 18)', 'Privacyverklaring'],
    [[d, 'Ada', 'Rol', 'ada.rol@mail.example', '0610000701', 'p.docent@pabo.example', '0610000790', '0610000791', J], [d, 'Bob', 'Rol', 'bob.rol@mail.example', '0610000702', 'p.docent@pabo.example', '0610000790', '0610000791', J]]);
  // X07-X10: eigen contactvragen met een werkwoord dat niet in een lijst staat
  T.werkwoord = tab(['Tijdstempel', 'Voornaam', 'Achternaam', 'Laat je e-mailadres achter', 'Laat je telefoonnummer achter', 'Welke werkzaamheden wil je doen?', 'Privacyverklaring'], [[d, 'Lot', 'Laat', 'lot.laat@mail.example', '0610000703', 'Surveillant', J]]);
  T.engels = tab(['Timestamp', 'First name', 'Last name', 'Please fill in your email address', 'Please provide your phone number', 'I agree to the privacy policy'], [[d, 'Eve', 'English', 'eve.english@mail.example', '0610000704', 'I agree']], 'Form Responses 7');
  // X11-X12: een eigen opleidings- of herkomstvraag is geen ander formulier
  T.instelling = tab(['Tijdstempel', 'Naam', 'E-mailadres', 'Telefoonnummer', 'Bij welke onderwijsinstelling studeer je?', 'Ik geef toestemming voor het bewaren van mijn gegevens'], [[d, 'Stan Student', 'stan.student@mail.example', '0610000705', 'Hogeschool Denkbeeld', 'Ja']]);
  T.via = tab(['Tijdstempel', 'Voornaam', 'Achternaam', 'E-mailadres', 'Telefoonnummer', 'Via welke organisatie ken je ons?', 'Privacyverklaring'], [[d, 'Via', 'Via', 'via.via@mail.example', '0610000706', 'Het jongerenloket', J]]);
  // X16-X19: formulieren van een school of een training, ook met een vraag die op een talentvraag lijkt
  T.school = tab(['Tijdstempel', 'Naam', 'School', 'E-mailadres', 'Telefoonnummer', 'Je vraag', 'Ik ga akkoord met de privacyverklaring'], [[d, 'Karin Smit', 'Esdoorn College', 'k.smit@esdoorn.example', '0301230701', 'Graag een offerte', 'Ja']]);
  T.type = tab(['Tijdstempel', 'Naam', 'Naam van je school', 'E-mailadres', 'Telefoonnummer', 'Type onderwijs', 'Waar kunnen we je mee helpen?', 'Ik ga akkoord met de privacyverklaring'], [[d, 'Kees Smit', 'Esdoorn College', 'kees.smit@esdoorn.example', '0301230702', 'VO', 'Twee surveillanten', 'Ja']]);
  T.uvorm = tab(['Tijdstempel', 'Naam', 'Naam van je school', 'E-mailadres', 'Telefoonnummer', 'Waar heeft u interesse in?', 'Ik ga akkoord met de privacyverklaring'], [[d, 'Kim Smit', 'Esdoorn College', 'kim.smit@esdoorn.example', '0301230703', 'Taskforce', 'Ja']]);
  T.training = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Op welke school werk je?', 'Op welke dag wil je de training volgen?', 'Ik ga akkoord met de privacyverklaring'], [[d, 'l.leraar@esdoorn.example', 'Lies Leraar', 'Esdoorn College', 'Dinsdag', 'Ja']]);
  T.organisatie = tab(['Tijdstempel', 'Naam', 'E-mailadres', 'Telefoonnummer', 'Organisatie', 'Plaats', 'Privacy'], [[d, 'Otto Org', 'otto.org@mail.example', '0610000707', 'Stichting Denkbeeld', 'Utrecht', 'Ja']]);
  // X20: kale 'Toestemming' naast een deelvraag met 'gegevens'
  T.doel = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Toestemming', 'Toestemming om je gegevens te delen met scholen'], [[d, 'tim.deel@mail.example', 'Tim', 'Deel', '0610000708', 'Ja', 'Nee']]);
  // X21 en het losse nee: beperking of weigering van het bewaren na het ja-deel
  var beperkt = ['Akkoord, maar niet met het bewaren van mijn gegevens', 'Ik ga akkoord als mijn gegevens niet worden bewaard', 'Ik geef toestemming voor deze vacature, niet voor het talentbestand', 'Prima, maar liever niet bewaren'];
  T.beperkt = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring'], beperkt.map(function (x, i) { return [d, 'w' + i + '.beperkt@mail.example', 'W' + i, 'Beperkt', tel(), x]; }).concat([[d, 'wel.beperkt@mail.example', 'Wel', 'Beperkt', tel(), 'Ja']]));
  // X06: broer zonder e-mail en zus met e-mail, hetzelfde vaste nummer
  T.gezin = tab(['Tijdstempel', 'E-mailadres (optioneel)', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Welke werkzaamheden wil je doen?', 'Privacyverklaring'],
    [[d, '', 'Bram', 'Gezin', '0301230704', 'Surveillant', J], [d, 'zoe.gezin@mail.example', 'Zoe', 'Gezin', '0301230704', 'Huiswerkbegeleider', J]]);
  // X13-X15 (AVG): samenstellingen en woorden buiten de lijst in vrije tekst
  T.avg = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Welke werkzaamheden wil je doen?', 'Wanneer ben je beschikbaar?', 'Beschikbaarheid [Vrijdag]', 'Privacyverklaring'],
    [[d, 'avg.een@mail.example', 'Avg', 'Een', tel(), 'Huiswerkbegeleider, Andere: na mijn borstkanker rustig opbouwen', 'Pas weer vanaf april, ik ben hoogzwanger', 'Vrijdaggebed', J],
      [d, 'avg.twee@mail.example', 'Avg', 'Twee', tel(), 'Surveillant, Andere: ik ben docent maar zit nu in de ziektewet', 'Invallen kan pas als ik niet meer ziek ben', '', J],
      [d, 'avg.drie@mail.example', 'Avg', 'Drie', tel(), 'Surveillant, Andere: ik heb een Wajong-uitkering', 'In overleg, ik heb long covid', '', J]]);
  // geenContact: een ongeldig adres en een lege optionele telefoon
  T.geencontact = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer (optioneel)', 'Welke werkzaamheden wil je doen?', 'Privacyverklaring'], [[d, 'piet.zonder@mail,example', 'Piet', 'Zonder', '', 'Surveillant', J]]);
  // zonder herkende contactkolom (alleen het adres van een ouder) maar met een talentvraag: twijfel, niet stil
  T.zonderkolom = tab(['Tijdstempel', 'Voornaam', 'Achternaam', 'E-mailadres (van je ouder)', 'Welke werkzaamheden wil je doen?', 'Privacyverklaring'], [[d, 'Jip', 'Jong', 'ouder.jong@mail.example', 'Surveillant', J]]);
  // instelling aanmeldTabbladen: negeren en aanmelden gaan voor de herkenning
  T.negeer = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring'], [[d, 'nina.negeer@mail.example', 'Nina', 'Negeer', tel(), J]], 'Formulierreacties Nieuwsbrief');
  T.aanmeld = tab(['Tijdstempel', 'Naam', 'E-mailadres', 'Organisatie', 'Privacy'], [[d, 'Olga Aanmeld', 'olga.aanmeld@mail.example', 'Stichting Denkbeeld', 'Ja']], 'Formulierreacties Partners');
  F.zetInstelling('aanmeldTabbladen', { negeren: ['formulierreacties nieuwsbrief'], aanmelden: ['Formulierreacties Partners'] });
  var m0 = F.lees('Meldingen').length, uit = F.aanmeldingenVerwerken(), fouten = uit.fouten || [], fout = function (b) { return fouten.filter(function (x) { return x.indexOf('"' + b.getName() + '"') >= 0; }).join(); };
  var meldingen = F.lees('Meldingen').slice(m0), alles = (JSON.stringify(F.lees('Talenten')) + JSON.stringify(F.lees('Activiteiten')) + JSON.stringify(F.lees('Meldingen'))).toLowerCase();
  eis(tl('ada.rol@mail.example').voornaam === 'Ada' && tl('bob.rol@mail.example').voornaam === 'Bob' && F.telefoonIn(tl('ada.rol@mail.example').telefoon) === '0610000701' && ['p.docent@pabo.example', '0610000790', '0610000791'].every(function (x) { return alles.indexOf(x) < 0; }) &&
    ['E-mailadres (stagedocent)', 'E-mailadres (van je teamleider)', 'Email (referee)', 'Naam (van je stagedocent)'].every(function (h) { return K([h], 'email') === '' && K([h], 'naam') === ''; }) &&
    ['Telefoonnummer (in geval van nood)', 'Phone number (manager)', 'Telefoonnummer (ouder/verzorger, als je jonger bent dan 18)', 'Telefoon (coach)'].every(function (h) { return K([h], 'telefoon') === ''; }) &&
    K(['Telefoonnummer (zodat de school je kan bellen)'], 'telefoon') === '1' && K(['Naam (zoals bekend bij je opleiding)'], 'naam') === '1',
    'v7.4.1 ronde 5 (X01-X05): een ander persoon in de toelichting ("(stagedocent)", "(in geval van nood)", "(ouder/verzorger, …)", "(referee)", "(manager)") maakt er geen contact- of naamkolom van; elke student houdt zijn eigen adres en profiel');
  eis(F.telefoonIn(tl('lot.laat@mail.example').telefoon) === '0610000703' && F.telefoonIn(tl('eve.english@mail.example').telefoon) === '0610000704' &&
    ['Hoe luidt je e-mailadres?', 'Noteer hier je e-mailadres', 'Welk e-mailadres gebruik je het meest?', 'E-mailadres om in te loggen', 'Wat is je e-mailadres? We sturen je een bevestiging', 'E-mailadres student', 'Email address we can use to contact you', 'Please fill in your email address'].every(function (h) { return K([h], 'email') === '1'; }) &&
    ['Je telefoonnummer, zodat we je kunnen bellen voor een kennismaking', 'Please provide your phone number', 'Mobile number we can text'].every(function (h) { return K([h], 'telefoon') === '1'; }) && K(['Please fill in your email address'], 'postcode') === '',
    'v7.4.1 ronde 5 (X07-X10, H3): een eigen e-mail- of telefoonvraag met elk werkwoord ("Laat je e-mailadres achter", "Hoe luidt …", "Please provide …") wordt herkend; "email address" is nooit de postcode');
  eis(!!tl('stan.student@mail.example').id && !!tl('via.via@mail.example').id, 'v7.4.1 ronde 5 (X11, X12): "Bij welke onderwijsinstelling studeer je?" en "Via welke organisatie ken je ons?" maken een aanmelding geen ander formulier');
  eis(!tl('k.smit@esdoorn.example').id && !tl('kees.smit@esdoorn.example').id && !tl('kim.smit@esdoorn.example').id && !tl('l.leraar@esdoorn.example').id && [T.school, T.type, T.uvorm, T.training].every(function (b) { return kolom(b, 'verwerkt') < 0 && !fout(b); }) &&
    !tl('otto.org@mail.example').id && /lijkt geen aanmeldformulier \(het vraagt ook naar een school of organisatie\)/.test(fout(T.organisatie)) && K(['Op welke dag wil je de training volgen?'], 'beschikbaarheid') === '' && K(['Waar heeft u interesse in?'], 'functies') === '',
    'v7.4.1 ronde 5 (X16-X19, H2): een formulier van een school ("School" + "Je vraag", "Type onderwijs" + "Waar kunnen we je mee helpen?", de u-vorm, een training) maakt geen talenten; "Organisatie" + "Plaats" is twijfel (fout, geen profiel)');
  var tim = tl('tim.deel@mail.example');
  eis(!!tim.id && /Andere toestemming: Toestemming om je gegevens te delen met scholen: Nee/.test(notitie(tim)), 'v7.4.1 ronde 5 (X20): een kale "Toestemming" beslist; "Toestemming om je gegevens te delen met scholen" is een ander doel (de weigering staat in de notitie)');
  eis(beperkt.every(function (x, i) { return !tl('w' + i + '.beperkt@mail.example').id && /^wacht: /.test(T.beperkt.rijen[i + 1][kolom(T.beperkt, 'verwerkt')]); }) && !!tl('wel.beperkt@mail.example').id &&
    ['Toestemming, nee', 'Ja, toch maar niet', 'Akkoord, of toch niet', 'Wel akkoord? Nee'].every(function (x) { return F.toestemmingOordeel(x) === 'nee'; }) && F.toestemmingOordeel('Mag, maar niet langer dan een jaar') === 'onduidelijk' &&
    ['Ja, ik geef toestemming. Mijn gegevens worden na twee jaar verwijderd.', 'Ja, mijn gegevens worden niet langer bewaard dan nodig', 'Ik ga akkoord, maar niet met de nieuwsbrief'].every(function (x) { return F.toestemmingOordeel(x) === 'ja'; }),
    'v7.4.1 ronde 5 (X21, H1): een beperking of weigering van het bewaren na het ja-deel ("Akkoord, maar niet met het bewaren …", "… als mijn gegevens niet worden bewaard", "… niet voor het talentbestand") is onduidelijk; een los nee erachter ("Toestemming, nee") is nee; uitleg blijft ja');
  var G = formulierCtx(true);
  eis(G.toestemmingOordeel('Ik ben ermee akkoord dat mijn gegevens niet langer dan 2 jaar bewaard worden') === 'ja' && G.toestemmingOordeel('Ik ben ermee akkoord dat mijn gegevens niet langer dan 1 jaar bewaard worden') === 'onduidelijk',
    'v7.4.1 ronde 5 (X21): "niet langer dan 2 jaar" is ja zolang de bewaartermijn (24 maanden) daarbinnen valt; "niet langer dan 1 jaar" is onduidelijk');
  var zoe = tl('zoe.gezin@mail.example');
  eis(vn('Bram').filter(function (t) { return t.achternaam === 'Gezin'; }).length === 1 && !!zoe.id && F.lijstUit(zoe.functies).join() === 'huiswerkbegeleider' && meldingen.some(function (m) { return m.voor === 'Iris Mulder' && /Zoe Gezin heeft hetzelfde telefoonnummer als Bram Gezin: mogelijk dubbel/.test(m.tekst) && m.link === 'talent:' + zoe.id; }),
    'v7.4.1 ronde 5 (X06): op telefoon alleen ontdubbelen bij dezelfde voornaam; broer en zus met het vaste nummer thuis zijn twee profielen, met een melding "mogelijk dubbel"');
  var avgAlles = notitie(tl('avg.een@mail.example')) + notitie(tl('avg.twee@mail.example')) + notitie(tl('avg.drie@mail.example'));
  eis(['borstkanker', 'hoogzwanger', 'vrijdaggebed', 'ziektewet', 'ziek ben', 'wajong', 'covid'].every(function (x) { return alles.indexOf(x) < 0; }) && /eigen antwoord, niet overgenomen/.test(avgAlles) && F.lijstUit(tl('avg.een@mail.example').functies).join() === 'huiswerkbegeleider' &&
    ['hernia', 'reuma', 'geboren 1-1-2000', 'Sjabbat', 'arbeidsongeschikt', 'ik ben in verwachting'].every(function (x) { return F.vrijeTekst(x) === '(eigen antwoord, niet overgenomen)'; }) && F.vrijeTekst('bijles') === 'bijles',
    'v7.4.1 ronde 5 (X13-X15, H4, AVG): samenstellingen (borstkanker, hoogzwanger, vrijdaggebed, ziektewet), "ziek" naast "invallen" of "docent" in een antwoord en woorden als Wajong, covid, hernia en sjabbat komen nooit als tekst in het profiel');
  var GC = formulierCtx(), gb = GC._demoSS.insertSheet('Formulierreacties 1'); gb.appendRow(T.geencontact.rijen[0].slice(0, 7)); gb.appendRow(T.geencontact.rijen[1].slice(0, 7)); GC.aanmeldingenVerwerken();
  var gcMeld = GC.lees('Meldingen').filter(function (m) { return m.voor === 'Iris Mulder' && /Formulierreacties 1: 1 zonder geldig e-mailadres of telefoon/.test(m.tekst); });
  eis(!vn('Piet').filter(function (t) { return t.achternaam === 'Zonder'; }).length && !T.geencontact.rijen[1][kolom(T.geencontact, 'verwerkt')] && uit.overgeslagen.geenContact === 1 && gcMeld.length === 1 && gcMeld[0].tekst.indexOf('piet') < 0 && alles.indexOf('piet.zonder') < 0,
    'v7.4.1 ronde 5 (geenContact): een rij zonder geldig contact blijft ongemarkeerd en gaat niet stil: een melding aan het talentteam met het aantal per tabblad (zonder het adres)');
  eis(!vn('Jip').length && /lijkt geen aanmeldformulier \(Athena herkent geen vraag naar e-mail of telefoon\); 1 aanmelding wacht/.test(fout(T.zonderkolom)) && alles.indexOf('ouder.jong') < 0,
    'v7.4.1 ronde 5 (X07-X10): een tabblad met een talentvraag maar zonder herkende contactkolom wordt niet stil overgeslagen: een fout en een melding');
  eis(!tl('nina.negeer@mail.example').id && !fout(T.negeer) && kolom(T.negeer, 'verwerkt') < 0 && !!tl('olga.aanmeld@mail.example').id, 'v7.4.1 ronde 5: de instelling aanmeldTabbladen gaat voor de herkenning ("negeren" en "aanmelden", zonder hoofdlettergevoeligheid)');
  // H1a: de melding over rijen zonder toestemming telt de runs na de melding van die dag op en meldt het totaal de volgende dag
  var H = formulierCtx(), hk = ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring'];
  var zonderT = function () { return H.lees('Meldingen').filter(function (m) { return m.voor === 'Iris Mulder' && /overgeslagen zonder toestemming/.test(m.tekst); }); };
  var hb = H._demoSS.insertSheet('Formulierreacties 1'); hb.appendRow(hk); hb.appendRow([d, 'eerst.nee@mail.example', 'Eerst', 'Nee', '0610000761', 'Nee']); H.aanmeldingenVerwerken();
  var z0 = zonderT().length, hb2 = H._demoSS.insertSheet('Formulierreacties 2'); hb2.appendRow(hk);
  [0, 1, 2].forEach(function (i) { hb2.appendRow([d, 'later' + i + '.nee@mail.example', 'Later' + i, 'Nee', '061000076' + (i + 2), 'Nee, liever niet']); }); H.aanmeldingenVerwerken();
  var z1 = zonderT().length; H.P.setProperty('AANMELD_GEEN_TOESTEMMING', H.plusDagen(-1)); H.aanmeldingenVerwerken();
  var z2 = zonderT(); H.aanmeldingenVerwerken();
  eis(z0 === 1 && z1 === 1 && z2.length === 2 && /^3 aanmeldingen zijn overgeslagen zonder toestemming \(meest gegeven antwoord: "Nee, liever niet"\)/.test(z2[1].tekst) && zonderT().length === 2,
    'v7.4.1 ronde 5 (H1a): rijen die na de melding van die dag worden overgeslagen, komen de volgende dag in één melding (3 aanmeldingen), ook als die run zelf niets overslaat');
  // H1b: druppelsgewijs (één rij per run) met hetzelfde onduidelijke antwoord: elke rij wacht en komt vanzelf terug zodra het antwoord herkend wordt
  var D = formulierCtx(), db = D._demoSS.insertSheet('Formulierreacties 1'), dk = ['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring'];
  db.appendRow(dk); db.appendRow([d, 'drup.een@mail.example', 'Drup', 'Een', '0610000771', 'Ik heb de privacyverklaring gelezen']); var d1 = D.aanmeldingenVerwerken();
  db.appendRow([d, 'drup.twee@mail.example', 'Drup', 'Twee', '0610000772', 'Ik heb de privacyverklaring gelezen']); D.vergeet('Formulierreacties 1'); var d2 = D.aanmeldingenVerwerken();
  var dV = db.rijen[0].indexOf('verwerkt'), wachten = db.rijen.slice(1).every(function (r) { return /^wacht: /.test(r[dV]); });
  db.rijen[1][5] = 'Ja, ik geef toestemming'; db.rijen[2][5] = 'Ja, ik geef toestemming'; D.vergeet('Formulierreacties 1'); var d3 = D.aanmeldingenVerwerken();
  eis(d1.overgeslagen.onduidelijk === 1 && d2.overgeslagen.onduidelijk === 2 && d1.overgeslagen.geenToestemming === 0 && wachten && /2 aanmeldingen wachten/.test(d2.fouten.join()) && d3.nieuw === 2,
    'v7.4.1 ronde 5 (H1b): een onduidelijk antwoord wacht ("wacht: …", fout in elke run), ook bij één rij per run; na een herkenbaar antwoord worden beide rijen vanzelf verwerkt');
  eis(/, 1 wachten op een duidelijke toestemming/.test(probeer(function () { var E = formulierCtx(), eb = E._demoSS.insertSheet('Formulierreacties 1'); eb.appendRow(dk); eb.appendRow([d, 'e.een@mail.example', 'E', 'Een', '0610000773', '?']); eb.appendRow([d, 'e.twee@mail.example', 'E', 'Twee', '', 'Ja']); eb.appendRow([d, 'e.drie@mail', 'E', 'Drie', '', 'Ja']); return E.aanmeldingenRun(); }) || '') &&
    /, 1 zonder geldig e-mailadres of telefoonnummer/.test(probeer(function () { var E = formulierCtx(), eb = E._demoSS.insertSheet('Formulierreacties 1'); eb.appendRow(dk); eb.appendRow([d, 'e.drie@mail', 'E', 'Drie', '', 'Ja']); return E.aanmeldingenRun(); }) || ''),
    'v7.4.1 ronde 5: aanmeldingenRun noemt ook ", n wachten op een duidelijke toestemming" en ", n zonder geldig e-mailadres of telefoonnummer"');
  // H5: een dag met dagdeel en een ontkenning erna, en een opsomming over meer deelzinnen
  eis(tekst('Dinsdagavond niet') === '000 000 000 000 000 000 000' && tekst('Maandag t/m donderdag, dinsdagavond niet') === '220 220 220 220 000 000 000' && tekst('Maandagavond en dinsdagavond, woensdagavond niet') === '002 002 000 000 000 000 000' &&
    tekst('Woensdagmiddag kan ik niet') === '000 000 000 000 000 000 000' && tekst('Dinsdagavond liever niet') === '000 001 000 000 000 000 000' && tekst('Ma t/m vr, woensdagmiddag niet') === '220 220 200 220 220 000 000' &&
    tekst('Ma t/m vr avonden, maar woensdagavond niet') === '002 002 000 002 002 000 000' && tekst('woensdagmiddag en avond') === '000 000 022 000 000 000 000',
    'v7.4.1 ronde 5 (H5): een dag met dagdeel ("dinsdagavond", "woensdagmiddag") en een ontkenning erna is 0 voor dat dagdeel, niet omgekeerd 2');
  eis(tekst('Ma, di en wo, geen ochtenden') === '020 020 020 000 000 000 000' && tekst("Maandag, dinsdag, niet 's middags") === '200 200 000 000 000 000 000' && tekst('Ma, di, alleen middag') === '020 020 000 000 000 000 000' && tekst("Dinsdag, maar dan alleen 's middags") === '000 020 000 000 000 000 000',
    'v7.4.1 ronde 5 (H5): deelzinnen met alleen dagen zijn één opsomming; een ontkend of beperkend dagdeel erna geldt voor elke dag ("Ma, di en wo, geen ochtenden")');
  eis(F.priveWoord('heb je je wel eens ziek gemeld bij een docent') && !F.priveWoord('beschikbaarheid bij ziekte of verlof van docenten') && !F.priveWoord('invallen bij ziekte van een docent'),
    'v7.4.1 ronde 5 (M2): "ziek" naast "docent" is alleen werk als de vraag niet over de aanmelder zelf gaat ("Heb je je wel eens ziek gemeld bij een docent?" blijft privé)');
  eis(K(['Welke rol wil je?'], 'functies') === '1' && probeer(function () { var c = F.aanmeldKolommen(['Tijdstempel', 'E-mailadres', 'Wat is je rol?', 'Aantal leerlingen']); return !c.functiesWens && c.ander === 2 && F.aanmeldTabblad(c, 'x') === false; }) === true,
    'v7.4.1 ronde 5 (H2): "Wat is je rol?" is geen wens ("Welke rol wil je?" wel); met "Aantal leerlingen" is het een formulier van een school');
  var rm = fs.readFileSync(path.join(R, 'backend/README.md'), 'utf8'), rij = rm.split('\n').filter(function (r) { return /apiTalentRunNu/.test(r) && /^\|/.test(r); })[0] || '';
  eis(/wachten op een duidelijke toestemming/.test(rij) && /zonder geldig e-mailadres of telefoonnummer/.test(rij) && /aanmeldTabbladen/.test(rm) && /wacht: geen toestemming herkend/.test(rm),
    'v7.4.1 ronde 5: backend/README.md noemt de nieuwe delen van de runtekst, de wachtende rij en de instelling aanmeldTabbladen');
});
var geo = ctx.geocodeerRun();
eis(geo >= 1 && Number(ctx.lees('Talenten').filter(function (t) { return t.id === lieke.id; })[0].lat) > 50, 'geocodeerRun vult de ligging van nieuwe profielen (PDOK)');

// v7.4: weken ten opzichte van vandaag (een week in de toekomst of ouder dan het archiefvenster telt sinds v7.4 niet meer); een los weeknummer is de laatste week met dat nummer
var wkT = ctx.isoWeekStr(ctx.plusDagen(-14)), wkTnr = String(Number(wkT.slice(6)));
var rij = [['Accountnummer', 'Naam', 'E-mail', 'Projectnummer', 'Week', 'Uren', 'Status'], ['X5001', 'Eva de Wit', '', '10.880', wkT, '7,5', 'Gewerkt'], ['X5001', 'Eva de Wit', '', '10.880', wkT, '8', 'Gewerkt'], ['X5001', 'Eva de Wit', '', '10.880', wkT, '0', 'No-show'], ['', '', 'tim.verhoeven@mail.example', '10.887', wkTnr, '6', 'Gewerkt'], ['X7777', 'Onbekend', '', '10.880', wkT, '4', 'Gewerkt']];
var ur = ctx.urenUitRijen(rij, ctx.lees('Talenten')), e40 = ur.regels.filter(function (x) { return x.talentId === 'tl1'; })[0];
eis(ur.aantalRegels === 5 && ur.regels.length === 2 && e40.uren === 15.5 && e40.diensten === 2 && e40.noShows === 1 && e40.week === wkT && ur.regels.some(function (x) { return x.talentId === 'tl4' && x.week === wkT; }) && ur.onbekend.length === 1 && ur.onbekend[0].xpsId === 'x7777', 'urenUitRijen: per talent, week en project; match op XPS-nummer of e-mail; no-show apart; onbekende accounts gemeld');
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
  eis(c1.indexOf('backend 7.4.1') >= 0 && c1.indexOf('AFWIJKENDE KOP') < 0 && /Scholen: \d+ rijen/.test(c1), 'controleer(): versie 7.4.1 en geen afwijkende koppen in de demo-sheet');  // v7.3; v7.4: versie mee omhoog; v7.4.1: backend-patch
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

/* ---- v7.4: imports — XPS-dienstenexport (koppeling, statussen, tijdvenster, loonkolommen, projectnaam) en Exact-afstemming (facturatie-export, Open, creditnota's, rapport) ---- */
(function () { try {
  var V = '2026-10-30', TAL = ctx.lees('Talenten'), lijst = function (x) { return vm.runInContext('(function (x) { return JSON.parse(x); })', ctx)(JSON.stringify(x)); };  // rijen als arrays uit de context (instanceof)
  var KOP = ['Datum', 'Datum: Van', 'Datum: Tot', 'Gewerkte tijd', 'Uitgevoerd door', 'Omschrijving', 'Status', 'Project', 'Projectleider', 'Salaris (eenheid)', 'Salaris (totaal)'];
  var dienst = function (datum, uren, naam, status, project, extra) { return [datum, datum + ' 08:30', datum + ' 15:00', uren, naam, 'Ondersteuning', status, project || 'Kompas College | Huiswerkbegeleiding (01-08-2026 ~ 31-07-2027)', 'Bas Meijer', '17,50', '99,99'].concat(extra || []); };
  var fout = function (f) { try { f(); return ''; } catch (e) { return String(e.message); } };
  // 1. het verzonnen voorbeeldbestand: kolommen herkend, statussen, toekomst, naam, onbekend, geen uren, loonkolommen genegeerd
  var vb = ctx.Utilities.parseCsv(fs.readFileSync(path.join(R, 'test/voorbeelden/xps_diensten.csv'), 'utf8'), ';');
  var u = ctx.urenUitRijen(vb, TAL, { vandaag: V, trajecten: ctx.lees('Trajecten') }), O = u.overgeslagen, eva = u.regels.filter(function (x) { return x.talentId === 'tl1'; })[0];
  eis(u.kolommen.xpsId === 'Accountnummer' && u.kolommen.naam === 'Uitgevoerd door' && u.kolommen.uren === 'Gewerkte tijd' && u.kolommen.project === 'Project' && u.kolommen.projectNummer === 'Projectnummer' && u.kolommen.datum === 'Datum' && !('uren' in u.kolommen && /salaris/i.test(u.kolommen.uren)), 'XPS-dienstenexport: kolommen herkend (Uitgevoerd door = naam, Gewerkte tijd = uren, Project en niet Projectleider)');
  eis(u.gelezen === 15 && u.gekoppeld === 6 && O.status === 6 && O.toekomst === 1 && O.geenTalent === 1 && O.geenUren === 1 && O.oud === 0 && O.dubbeleNaam === 0 && u.weekregels === u.regels.length, 'XPS-dienstenexport: gelezen, gekoppeld en overgeslagen per reden (status, toekomst, geen talent, geen uren) tellen op');
  eis(eva && eva.uren === 13 && eva.diensten === 2 && eva.week === '2026-W43' && eva.trajectId === 't1' && u.regels.some(function (x) { return x.talentId === 'tl5' && x.diensten === 1 && x.uren === 3.25; }) && !u.regels.some(function (x) { return x.talentId === 'tl2' && x.diensten > 1; }), 'XPS-dienstenexport: alleen gewerkte diensten tellen (Afwezig (ziek), Geannuleerd en Reserve niet); per talent × ISO-week × project; Nina via haar unieke naam');
  eis(u.onbekend.length === 1 && u.onbekend[0].naam === 'Sanne Voorbeeld' && u.onbekend[0].diensten === 1 && u.onbekendAantal === 1, 'XPS-dienstenexport: een onbekend talent komt in de lijst onbekend met het aantal diensten');
  var gen = u.genegeerdeKolommen.map(function (g) { return g.kolom; }), json = JSON.stringify(u);
  eis(gen.indexOf('Salaris (eenheid)') >= 0 && gen.indexOf('Salaris (totaal)') >= 0 && u.genegeerdeKolommen.filter(function (g) { return /^Salaris/.test(g.kolom); }).every(function (g) { return /loongegevens/.test(g.hint) && /uit de export/.test(g.hint); }) && gen.indexOf('Projectleider') >= 0 && json.indexOf('113,75') < 0 && json.indexOf('113.75') < 0 && json.indexOf('17,50') < 0, 'XPS-dienstenexport: salariskolommen worden genegeerd (met hint om ze uit de export te laten) en hun waarden staan nergens in het resultaat');
  eis(!/ziek/i.test(json), 'XPS-dienstenexport: "Afwezig (ziek)" komt nergens per persoon in het resultaat (AVG), alleen in het totaal overgeslagen.status');
  // 2. koppeling: accountnummer → e-mail → unieke naam; dubbele naam en onbekend; nooit een naam als xpsId
  var talenten = TAL.concat([{ id: 'tlx1', voornaam: 'Eva', achternaam: 'de Wit' }, { id: 'tlx2', voornaam: 'Zonder', achternaam: 'Nummer' }]);
  var k = ctx.urenUitRijen(lijst([KOP.concat(['Accountnummer', 'E-mail']),
    dienst('2026-10-26', '6', 'Iemand Anders', 'Ingeroosterd', '', ['X5003', '']),                       // accountnummer wint van de naam
    dienst('2026-10-26', '5,5', 'A. Yilmaz', 'Ingeroosterd', '', ['', 'Ali.Yilmaz@mail.example']),         // e-mail
    dienst('2026-10-27', '4', '  tim   VERHOEVEN ', 'Ingeroosterd', '', ['', '']),                         // naam: kleine letters, enkele spaties
    dienst('2026-10-27', '4', 'Zoe Kaya', 'Ingeroosterd', '', ['', '']),                                     // naam zonder accent (Zoë Kaya)
    dienst('2026-10-27', '4', 'Eva de Wit', 'Ingeroosterd', '', ['', '']),                                   // twee talenten met deze naam
    dienst('2026-10-28', '4', 'Eva de Wit', 'Ingeroosterd', '', ['', '']),
    dienst('2026-10-27', '4', 'Piet Onbekend', 'Ingeroosterd', '', ['', '']),
    dienst('2026-10-27', '4', 'Daan Kuipers', 'Ingeroosterd', '', ['X4444', '']),                           // naam past, maar ander accountnummer: niet koppelen
    dienst('2026-10-27', '4', 'Zonder Nummer', 'Ingeroosterd', '', ['', ''])]), talenten, { vandaag: V });
  var regel = function (id) { return k.regels.filter(function (x) { return x.talentId === id; })[0]; };
  eis(regel('tl3') && regel('tl3').uren === 6 && regel('tl2') && regel('tl2').uren === 5.5 && regel('tl4') && regel('tl24') && !regel('tl1') && !regel('tlx1') && !regel('tl6'), 'koppeling: accountnummer, dan e-mail (hoofdletters maken niet uit), dan een unieke volledige naam (spaties, hoofdletters en accenten genormaliseerd)');
  eis(k.overgeslagen.dubbeleNaam === 2 && k.dubbel.length === 1 && k.dubbel[0].naam === 'Eva de Wit' && k.dubbel[0].diensten === 2 && k.dubbel[0].talenten === 2, 'koppeling: een naam die bij twee talenten hoort wordt niet gekoppeld en staat onder dubbel (naam + aantal diensten)');
  eis(k.overgeslagen.geenTalent === 2 && k.onbekend.some(function (o) { return o.naam === 'Piet Onbekend' && o.diensten === 1; }) && k.onbekend.some(function (o) { return o.xpsId === 'x4444' && o.naam === 'Daan Kuipers'; }), 'koppeling: onbekend talent en een naam met een ander accountnummer komen onder onbekend');
  eis(regel('tlx2') && regel('tlx2').xpsId === '' && regel('tl4').xpsId === 'X5004' && k.regels.every(function (x) { return !/\s/.test(x.xpsId); }), 'koppeling op naam schrijft nooit een naam in xpsId (leeg zonder accountnummer, anders het nummer van het talent)');
  // 3. geen koppelkolom = duidelijke fout; geen stille nul
  eis(fout(function () { ctx.urenUitRijen(lijst([['Datum', 'Gewerkte tijd', 'Status', 'Project'], ['2026-10-26', '6', 'Ingeroosterd', 'x']]), TAL, { vandaag: V }); }) === 'Dit bestand heeft geen kolom om uren aan talenten te koppelen (accountnummer, e-mail of naam). Vraag XPS de export met accountnummer, of stel xpsKolommen in.', 'een export zonder accountnummer, e-mail of naam geeft de Nederlandse fout in plaats van 0 regels');
  // 4. statussen: standaard en via Instellingen xpsStatussen; ziek nooit per persoon
  var st = function () { return ctx.urenUitRijen(lijst([KOP.concat(['Accountnummer']), dienst('2026-10-26', '4', 'x', 'No-show', '', ['X5007']), dienst('2026-10-26', '4', 'x', 'Te laat afgemeld', '', ['X5007']), dienst('2026-10-27', '4', 'x', 'Afwezig', '', ['X5007']), dienst('2026-10-28', '4', 'x', 'Afwezig (ziek)', '', ['X5007']), dienst('2026-10-29', '4', 'x', 'Ingeroosterd', '', ['X5007'])]), TAL, { vandaag: V }); };
  var s1 = st(), r1 = s1.regels[0];
  eis(s1.regels.length === 1 && r1.noShows === 1 && r1.lateAfmeldingen === 1 && r1.diensten === 1 && r1.uren === 4 && s1.overgeslagen.status === 2, 'statussen standaard: no-show en te laat afgemeld apart, Afwezig en Afwezig (ziek) overgeslagen, Ingeroosterd in het verleden = gewerkt');
  ctx.zetInstelling('xpsStatussen', { noShow: ['no-show', 'afwezig'] });
  var s2 = st(); ctx.zetInstelling('xpsStatussen', null);
  eis(s2.regels[0].noShows === 2 && s2.overgeslagen.status === 1 && s2.regels[0].lateAfmeldingen === 1 && st().regels[0].noShows === 1, 'xpsStatussen {noShow:["no-show","afwezig"]} vervangt de standaardlijst: Afwezig telt als no-show, Afwezig (ziek) blijft overgeslagen (ziek nooit per persoon); zonder instelling weer standaard');
  // 5. tijdvenster: toekomst en ouder dan het archiefvenster tellen niet
  var oudD = ctx.datumStr(new (vm.runInContext('Date', ctx))(2026, 9, 30 - 7 * (ctx.UREN_ARCHIEF_WEKEN + 4), 12));
  var tv = ctx.urenUitRijen(lijst([KOP.concat(['Accountnummer']), dienst('2026-10-31', '4', 'x', 'Ingeroosterd', '', ['X5007']), dienst(oudD, '4', 'x', 'Ingeroosterd', '', ['X5007']), dienst('30-10-2026', '4', 'x', 'Ingeroosterd', '', ['X5007'])]), TAL, { vandaag: V });
  eis(tv.overgeslagen.toekomst === 1 && tv.overgeslagen.oud === 1 && tv.regels.length === 1 && tv.regels[0].uren === 4 && tv.regels[0].week === '2026-W44' && tv.archiefVanaf === ctx.urenArchiefGrens(V), 'tijdvenster: morgen = toekomst, ouder dan ' + ctx.UREN_ARCHIEF_WEKEN + ' weken = oud; vandaag (ook als dd-mm-jjjj) telt mee');
  // 6. loonkolommen nooit gelezen, ook niet als xpsKolommen ze aanwijst
  ctx.zetInstelling('xpsKolommen', { uren: ['salaris (totaal)'] });
  var sal = ctx.urenUitRijen(lijst([KOP.concat(['Accountnummer']), dienst('2026-10-26', '4', 'x', 'Ingeroosterd', '', ['X5007'])]), TAL, { vandaag: V }); ctx.zetInstelling('xpsKolommen', null);
  eis(!sal.kolommen.uren && sal.regels[0].uren === 0, 'xpsKolommen die uren op een salariskolom zet, wordt genegeerd: loon wordt nooit gelezen');
  // 7. projectkoppeling: projectnummer exact, anders het langste xpsProject (≥ 5 tekens) in de projectnaam
  var P = ctx.projectKoppelaar([{ id: 'tp1', xpsProject: 'Kompas College | Huiswerkbegeleiding' }, { id: 'tp2', xpsProject: 'Kompas' }, { id: 'tp3', xpsProject: 'Komp' }, { id: 'tp4', xpsProject: '10.887' }]);
  eis((P('', 'Kompas College | Huiswerkbegeleiding (01-08-2026 ~ 31-07-2027)') || {}).id === 'tp1' && (P('', 'Kompas  college | basisvaardigheden') || {}).id === 'tp2' && P('', 'Komp x') === null && (P('10.887', 'Iets anders') || {}).id === 'tp4' && (P('99.999', 'kompas college | huiswerkbegeleiding') || {}).id === 'tp1', 'projectkoppeling: projectnummer exact; anders de projectnaam exact of het langste vaste deel (minstens 5 tekens)');
  // 8. urenImport uit de Drive-map: gewerkt telt, geannuleerd/ziek/toekomst niet; Financiën geleverd en plaatsing rekenen alleen met gewerkte uren
  var CD = vm.runInContext('Date', ctx), nuC = new CD(), wk = ctx.isoWeekStr(ctx.plusDagen(-7)), ma = ctx.maandagVanWeek(wk), dag = function (n) { return ctx.plusDagenVan(ma, n); }, map = ctx.xpsExportMap();
  var sjVan = function (d) { var j = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return m >= 8 ? j + '-' + (j + 1) : (j - 1) + '-' + j; }, sj = sjVan(ma), mi = ctx.schooljaarMaanden(sj).indexOf(ma.slice(0, 7));
  var geleverd = function () { return roep(SOPHIE, 'apiFinancien', sj).scholen.reduce(function (n, s) { return n + s.projecten.filter(function (p) { return p.id === 't2'; }).reduce(function (m, p) { return m + p.reeksen.geleverd[mi]; }, 0); }, 0); };
  ctx.schrijfVeel('Kandidaten', [{ id: 'c74a', talentId: 'tl11', trajectId: 't2', vacatureId: 'v74', naam: 'Thijs Brouwer', status: ctx.KANDIDAAT_KLAAR, statusHistorie: '{}' }, { id: 'c74b', talentId: 'tl12', trajectId: 't2', vacatureId: 'v74', naam: 'Sara Peeters', status: ctx.KANDIDAAT_KLAAR, statusHistorie: '{}' }]);
  var voorG = geleverd(), csv = KOP.concat(['Accountnummer', 'Projectnummer']).join(';') + '\n' + [dienst(dag(0), '4', 'Thijs Brouwer', 'Ingeroosterd', '', ['X5011', '10.887']), dienst(dag(1), '4', 'Thijs Brouwer', 'Geannuleerd (klant)', '', ['X5011', '10.887']), dienst(dag(2), '4', 'Thijs Brouwer', 'Afwezig (ziek)', '', ['X5011', '10.887']),
    dienst(ctx.datumStr(ctx.plusDagen(1)), '4', 'Thijs Brouwer', 'Ingeroosterd', '', ['X5011', '10.887']), dienst(dag(0), '6', 'Sara Peeters', 'Geannuleerd (intern)', '', ['X5012', '10.887']), dienst(dag(1), '6', 'Sara Peeters', 'Afwezig', '', ['X5012', '10.887'])].map(function (r) { return r.join(';'); }).join('\n');
  ctx.P.setProperty('LAATSTE_URENIMPORT', '');
  var gBest = map.createFile(ctx.Utilities.newBlob(csv, 'text/csv', 'xps-diensten-v74.csv')), imp4 = ctx.urenImport(), tu = ctx.lees('TalentUren').filter(function (x) { return x.talentId === 'tl11' && x.week === wk; });
  eis(imp4.fouten.length === 0 && imp4.overgeslagen.status >= 3 && imp4.overgeslagen.toekomst >= 1 && tu.length === 1 && Number(tu[0].uren) === 4 && Number(tu[0].diensten) === 1 && tu[0].trajectId === 't2' && !ctx.lees('TalentUren').some(function (x) { return x.talentId === 'tl12' && x.week === wk; }) && imp4.ongewijzigd >= 1, 'urenImport: van de dienstenexport telt alleen de gewerkte dienst (4 uur); geannuleerd, ziek en toekomst niet; ongewijzigde weekregels worden niet opnieuw geschreven');
  eis(geleverd() - voorG === 4 * 42 * 100, 'Financiën: geleverd telt alleen de gewerkte uren (4 × € 42), geen geannuleerde of zieke diensten');
  var wkT2 = ctx.isoWeekStr(ctx.plusDagen(14)), maT2 = ctx.maandagVanWeek(wkT2), sjT2 = sjVan(maT2), miT2 = ctx.schooljaarMaanden(sjT2).indexOf(maT2.slice(0, 7)), gelT2 = function () { return roep(SOPHIE, 'apiFinancien', sjT2).scholen.reduce(function (n, s) { return n + s.projecten.filter(function (p) { return p.id === 't2'; }).reduce(function (m, p) { return m + p.reeksen.geleverd[miT2]; }, 0); }, 0); };
  var voorT2 = gelT2(); ctx.schrijfVeel('TalentUren', [{ id: 'tu74-toekomst', talentId: 'tl11', xpsProject: '10.887', trajectId: 't2', week: wkT2, uren: 10, diensten: 1, noShows: 0, lateAfmeldingen: 0 }]);
  eis(gelT2() === voorT2, 'Financiën: een weekregel in de toekomst (uit een import van vóór v7.4) telt niet als geleverd');
  ctx.verwijderRijen('TalentUren', function (x) { return x.id === 'tu74-toekomst'; });
  eis(ctx.vind('Kandidaten', 'c74a').status === 'geplaatst' && ctx.vind('Kandidaten', 'c74b').status === ctx.KANDIDAAT_KLAAR, 'plaatsing uit de uren: wie gewerkt heeft wordt geplaatst, wie alleen geannuleerde of afwezige diensten heeft niet');
  var fut = ctx.lees('TalentUren').filter(function (x) { return x.talentId === 'tl11'; }), alleTU = JSON.stringify(ctx.lees('TalentUren'));
  eis(fut.every(function (x) { return String(x.week) <= ctx.isoWeekStr(nuC); }) && alleTU.indexOf('99,99') < 0 && alleTU.indexOf('99.99') < 0 && ctx.TABELLEN.TalentUren.every(function (c) { return !/salaris|loon|tarief/i.test(c); }), 'urenImport: geen weken in de toekomst opgeslagen en geen loonwaarden in TalentUren');
  // 9. een bestand zonder koppelkolom: naast een goed bestand een fout in 'fouten' (en LAATSTE_URENIMPORT schuift niet op); alleen dat bestand = de fout zelf via de api
  var it = map.getFiles(); while (it.hasNext()) it.next().setTrashed(true);
  ctx.P.setProperty('LAATSTE_URENIMPORT', '');
  var slecht = map.createFile(ctx.Utilities.newBlob('Datum;Gewerkte tijd;Status;Project\n' + dag(0) + ';4;Ingeroosterd;10.887', 'text/csv', 'xps-zonder-sleutel.csv')), goed = map.createFile(ctx.Utilities.newBlob(csv, 'text/csv', 'xps-diensten-v74b.csv'));
  var deels = ctx.urenImport();
  eis(deels.bestanden === 1 && deels.fouten.length === 1 && deels.fouten[0].bestand === 'xps-zonder-sleutel.csv' && /geen kolom om uren aan talenten te koppelen/.test(deels.fouten[0].melding) && !ctx.P.getProperty('LAATSTE_URENIMPORT'), 'urenImport: een bestand zonder koppelkolom staat in fouten; de rest wordt ingelezen en LAATSTE_URENIMPORT schuift niet op');
  goed.setTrashed(true);
  eis(/^xps-zonder-sleutel\.csv: Dit bestand heeft geen kolom om uren aan talenten te koppelen/.test(faalt(IRIS, 'apiTalentUrenImport')), 'XPS-uren importeren met alleen zo\'n bestand geeft de fout zelf (geen stille nul)');
  slecht.setTrashed(true); gBest.setTrashed(true);
  // 10. een los weeknummer is de laatste week met dat nummer (in januari is week 52 die van vorig jaar)
  eis(ctx.weekVanNummer(52, '2027-01-06') === '2026-W52' && ctx.weekVanNummer(1, '2027-01-06') === '2027-W01' && ctx.weekVanNummer(44, '2026-10-30') === '2026-W44' && ctx.weekVanNummer(45, '2026-10-30') === '2025-W45', 'weekVanNummer: een los weeknummer ligt nooit in de toekomst');
  // 11. prestatie: 100.000 verzonnen diensten verwerken (doel < 20 s; Apps Script heeft 6 minuten)
  var groot = [KOP.concat(['Accountnummer', 'Projectnummer'])], STS = ['Ingeroosterd', 'Ingeroosterd', 'Ingeroosterd', 'Ingeroosterd', 'Ingeroosterd', 'Ingeroosterd', 'Ingeroosterd', 'Ingeroosterd', 'Afwezig', 'Geannuleerd (klant)'];
  for (var gi = 0; gi < 100000; gi++) groot.push(dienst(ctx.plusDagenVan(V, -(gi % 400) + 20), String(3 + gi % 6) + ',5', 'Talent ' + (gi % 900), STS[gi % 10], 'School ' + (gi % 60) + ' | Ondersteuning (01-08-2026 ~ 31-07-2027)', ['X' + (6000 + gi % 900), '']));
  var gt = lijst(groot), t0 = Date.now(), gr = ctx.urenUitRijen(gt, TAL.concat(Array.apply(null, Array(900)).map(function (_, i) { return { id: 'tg' + i, voornaam: 'Talent', achternaam: String(i), xpsId: 'X' + (6000 + i) }; })), { vandaag: V, trajecten: ctx.lees('Trajecten') }), dt = (Date.now() - t0) / 1000;
  eis(gr.gelezen === 100000 && gr.gekoppeld > 0 && gr.overgeslagen.oud > 0 && gr.overgeslagen.toekomst > 0 && dt < 20, 'prestatie: 100.000 diensten in ' + dt.toFixed(2) + ' s verwerkt (doel < 20 s)');
} catch (e) { eis(false, 'v7.4 urenimport: onverwachte fout ' + e.message); } })();

(function () { try {
  var dd = function (n) { return plusDagen(n).split('-').reverse().join('-'); }, P = plusDagen(-1);
  ctx.schrijfVeel('Facturen', [['77400001', 1000, -20], ['77400002', 2000, -18], ['77400003', 300, -10], ['77400006', 777, -30], ['77400005', 400, -75]].map(function (x, i) { return { id: 'fx74-' + i, trajectId: 't1', omschrijving: 'Proef v7.4 ' + x[0], bedrag: x[1], datum: plusDagen(x[2]), status: 'verzonden', factuurnummer: x[0], verzonden: plusDagen(x[2]) }; }));
  var KOPF = 'Datum;Factuurnummer;Betreft;Referentie / betalingskenmerk;Debiteur;Debiteurnummer;Aan;Totaal;Leeftijd;Open;Debiteur Exact ID';
  var r = function (dag, nr, deb, debnr, tot, open) { return ['"' + dd(dag) + '"', nr, 'Proef', '', deb, debnr, 'adm@school.example', tot, '0', open, ''].join(';'); };
  var csv = KOPF + '\n' + [r(-20, '77400001', 'Esdoorn Lyceum', '10001', '1000,00', '0,00'), r(-18, '77400002', 'Esdoorn Lyceum', '10001', '2000,00', '500,00'), r(-10, '77400003', 'Esdoorn Lyceum', '10001', '300,00', '0,00'),
    r(-5, '77400009', 'Esdoorn Lyceum', '10001', '-300,00', '0,00'), r(-4, '77400010', 'Esdoorn Lyceum', '10001', '-123,00', '0,00'), r(-30, '77400006', 'Kompas College', '10002', '777,00', '0,00'), r(-15, '77400007', 'Kompas College', '10002', '777,00', '0,00'),
    r(-12, '77400008', 'Kompas College', '10002', '-777,00', '0,00'), r(-75, '77400005', 'Esdoorn Lyceum', '10001', '400,00', '0,00'), r(-3, '77400011', 'Esdoorn Lyceum', '10001', '-400,00', '0,00'), r(-3, '77400012', 'Lyceum Valkenoord', '10006', '400,00', '400,00'),
    r(-6, '77400013', 'Waterpoort College', '10007', '500,00', '0,00'), r(-6, '77400015', 'Waterpoort College', '10007', '-500,00', '0,00'), r(-6, '77400016', 'Waterpoort College', '10007', '500,00', '500,00')].join('\n');  // gecorrigeerde factuur op de dag van de creditnota
  var c = roep(SOPHIE, 'apiExactImport', csv, { peildatum: P }), nrs = function (l) { return l.map(function (x) { return x.nummer; }); };
  eis(c.kolommen.factuurnummer === 'Factuurnummer' && c.kolommen.datum === 'Datum' && c.kolommen.bedrag === 'Totaal' && c.kolommen.open === 'Open' && c.kolommen.debiteur === 'Debiteur' && c.kolommen.omschrijving === 'Betreft' && !c.kolommen.betaald && !c.toegepast, 'Exact: het factuurformaat (Datum, Totaal, Betreft, Debiteur, Open) wordt zonder kolomtoewijzing herkend');
  var b1 = c.betaald.filter(function (x) { return x.nummer === '77400001'; })[0];
  eis(b1 && b1.datum === P && b1.bron === 'open' && c.meldingen.some(function (m) { return /betaald volgens openstaand bedrag; datum = peildatum/.test(m); }) && nrs(c.betaald).indexOf('77400003') < 0, 'Exact: zonder betaaldatum telt Open = 0 als betaald op de peildatum (met melding); een gecrediteerde factuur met Open 0 niet');
  var dl = c.deelsBetaald.filter(function (x) { return x.nummer === '77400002'; })[0];
  eis(dl && dl.open === 50000 && dl.bedrag === 200000 && nrs(c.betaald).indexOf('77400002') < 0, 'Exact: 0 < Open < bedrag staat onder deels betaald met het openstaande bedrag');
  var cr = function (n) { return c.creditnotas.filter(function (x) { return x.nummer === n; })[0]; };
  eis(cr('77400009') && cr('77400009').origineel === '77400003' && cr('77400009').inAthena && cr('77400009').bedrag === -30000 && cr('77400008') && cr('77400008').origineel === '77400007' && !cr('77400008').inAthena && !cr('77400011') && !cr('77400010'), 'Exact: een creditnota koppelt aan dezelfde debiteur, hetzelfde bedrag, tot 60 dagen eerder, de meest recente (77400007, niet 77400006); 75 dagen is te oud');
  eis(cr('77400015') && cr('77400015').origineel === '77400013' && nrs(c.alleenExact).indexOf('77400016') >= 0 && nrs(c.alleenExact).indexOf('77400013') < 0, 'Exact: een gecorrigeerde factuur op de dag van de creditnota (hoger nummer, nog open) wordt niet als origineel gekozen: Open 0 en het lagere nummer gaan voor');
  var ae = function (n) { return c.alleenExact.filter(function (x) { return x.nummer === n; })[0]; };
  eis(ae('77400010') && ae('77400010').creditnota === true && ae('77400011') && ae('77400011').creditnota === true && !ae('77400009') && !ae('77400008') && !ae('77400007') && ae('77400012') && ae('77400012').creditnota === false && c.meldingen.some(function (m) { return /2 creditnota's hebben geen oorspronkelijke factuur/.test(m); }), 'Exact: gekoppelde creditnota\'s en hun originelen staan niet onder Alleen in Exact; een creditnota zonder origineel wel, gemarkeerd');
  eis(ctx.lees('Facturen').filter(function (f) { return f.id === 'fx74-2'; })[0].factuurnummer === '77400003', 'Exact: controleren verandert niets');
  var toe = roep(SOPHIE, 'apiExactImport', csv, { peildatum: P, toepassen: true }), F = function (id) { return ctx.lees('Facturen').filter(function (f) { return f.id === id; })[0]; };
  eis(F('fx74-0').status === 'betaald' && ctx.datumIn(F('fx74-0').betaald) === P && F('fx74-1').status === 'verzonden' && !F('fx74-1').betaald, 'Exact toepassen: Open 0 → betaald op de peildatum; deels betaald blijft verzonden');
  var eerste = ctx.keuzelijst('factuurStatussen')[0], fc = F('fx74-2'), act = ctx.lees('Activiteiten').filter(function (a) { return a.trajectId === 't1' && a.bron === 'exact' && /77400003/.test(a.onderwerp + a.tekst) && /77400009/.test(a.onderwerp + a.tekst); });
  eis(fc.status === eerste && !fc.factuurnummer && !fc.verzonden && !fc.betaald && act.length === 1 && toe.toegepast, 'Exact toepassen: de gecrediteerde termijn gaat terug naar "' + eerste + '" zonder factuurnummer en datums; beide nummers staan in een activiteit op het project');
  var nog = roep(SOPHIE, 'apiExactImport', csv, { peildatum: plusDagen(0), toepassen: true });
  eis(ctx.datumIn(F('fx74-0').betaald) === P && F('fx74-2').status === eerste && ctx.lees('Activiteiten').filter(function (a) { return a.trajectId === 't1' && /77400009/.test(a.onderwerp + a.tekst); }).length === 1 && !nog.bijgewerkt.some(function (x) { return x.nummer === '77400001'; }), 'Exact opnieuw toepassen: de betaaldatum schuift niet naar de nieuwe peildatum en de creditnota wordt niet nog eens verwerkt');
  // een opgegeven kolomnaam wint; anders gaat de standaardnaam vóór een andere naam
  var twee = 'Factuurnummer;Factuurdatum;Datum;Bedrag\n77400001;' + dd(-20) + ';' + dd(-19) + ';1000,00';
  eis(roep(SOPHIE, 'apiExactImport', twee, {}).kolommen.datum === 'Factuurdatum' && roep(SOPHIE, 'apiExactImport', twee, { kolommen: { datum: 'Datum' } }).kolommen.datum === 'Datum', 'Exact: een opgegeven kolomtoewijzing wint; zonder toewijzing de ingestelde of standaardnaam');
  // het rapport Openstaande posten: herkend, met de uitleg wat wel nodig is
  var rapport = 'Administratie: 999 - Voorbeeld BV;;\nDatum: 01-09-2026 (fictief);;\nOpenstaande posten debiteuren;;\n;;\nRelatie;;\n;;\nCode + Naam;Gemiddeld aantal dagen tot betaling;Openstaand\n10001 Esdoorn Lyceum;33;1950\nTotaal;;1950';
  var rf = faalt(SOPHIE, 'apiExactImport', rapport, {});
  eis(/^Dit is het Exact-rapport Openstaande posten: dat heeft één regel per relatie\. Voor de afstemming is een export per factuur nodig met factuurnummer, factuurdatum, bedrag en betaaldatum, als csv met de kolomnamen op de eerste regel\.$/.test(rf) && /Openstaande posten/.test(faalt(SOPHIE, 'apiExactImport', 'Code + Naam;Gemiddeld aantal dagen tot betaling;Openstaand\n10001 X;3;10', {})), 'Exact: het rapport Openstaande posten (kopregels of Code + Naam / Openstaand) geeft een duidelijke fout');
  eis(/Ongeldige peildatum/.test(faalt(SOPHIE, 'apiExactImport', csv, { peildatum: 'gisteren' })) && ctx.bedragIn('1.950') === 195000 && ctx.bedragIn('-936,00') === -93600 && ctx.bedragIn('1950') === 195000 && ctx.bedragIn('1.950,50') === 195050, 'Exact: ongeldige peildatum geweigerd; bedragen met duizendtalpunt, decimaalkomma en minteken');
  // het verzonnen voorbeeldbestand in het factuurformaat
  var vf = roep(SOPHIE, 'apiExactImport', fs.readFileSync(path.join(R, 'test/voorbeelden/facturen_export.csv'), 'utf8'), {});
  eis(vf.creditnotas.length === 1 && vf.creditnotas[0].nummer === '20261060' && vf.creditnotas[0].origineel === '20261052' && vf.deelsBetaald.some(function (x) { return x.nummer === '20261051' && x.open === 50000; }) && nrs(vf.alleenExact).indexOf('20261055') >= 0 && nrs(vf.alleenExact).indexOf('20261061') >= 0 && nrs(vf.alleenExact).indexOf('20261060') < 0, 'voorbeeld facturen_export.csv: creditnota-paar, deels betaald en alleen in Exact');
} catch (e) { eis(false, 'v7.4 Exact-afstemming: onverwachte fout ' + e.message); } })();

/* ---- bestaande schermen blijven werken ---- */
['demo-sophie', 'demo-lars', 'demo-femke', 'demo-sem', 'demo-iris'].forEach(function (c) { eis(!faalt(c, 'apiOverzicht') && !faalt(c, 'apiHome') && !faalt(c, 'apiTaken') && !faalt(c, 'apiAgenda', plusDagen(-3), plusDagen(10)) && !faalt(c, 'apiTrajecten') && (c === 'demo-lars' || !faalt(c, 'apiBezetting')), 'schermen laden als ' + c); });
try { ctx.GEBRUIKER = null; ctx.nachtelijkeReview(); eis(true, 'nachtelijke review draait'); } catch (e) { eis(false, 'nachtelijke review draait: ' + e.message); }

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
