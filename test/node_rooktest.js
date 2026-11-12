// v4.5: rooktest van de backendlogica zonder Google: demo-backend.js (stubs + seed) en Code.gs in één vm-context.
// Gebruik: node test/node_rooktest.js  → "ALLES GOED" of een lijst FOUT-regels (exitcode 1).
var vm = require('vm'), fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
var ctx = { console: console }; ctx.globalThis = ctx; vm.createContext(ctx);  // alleen console van buiten: JSON, Date en Array moeten uit de context zelf komen (instanceof)
vm.runInContext(fs.readFileSync(path.join(R, 'demo/demo-backend.js'), 'utf8') + '\n;\n' + fs.readFileSync(process.env.CODE_GS || path.join(R, 'backend/Code.gs'), 'utf8'), ctx, { filename: 'demo.js' });  // v7.2: CODE_GS wijst naar een (gemuteerde) kopie van Code.gs voor test/mutatie_test.js
ctx.demoStart('');
var SEED79 = standBewaren();  // v7.9: de verse seed; de v7.9-blokken beginnen hiervan (eerdere blokken veranderen o.a. de mijlpalen via de Capsule-test)

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
    ['Ja, mijn gegevens worden niet langer bewaard dan nodig', 'Ik ga akkoord, maar niet met de nieuwsbrief'].every(function (x) { return F.toestemmingOordeel(x) === 'ja'; }),  // ronde 6: '… na twee jaar verwijderd' hieronder met de echte bewaartermijn
    'v7.4.1 ronde 5 (X21, H1): een beperking of weigering van het bewaren na het ja-deel ("Akkoord, maar niet met het bewaren …", "… als mijn gegevens niet worden bewaard", "… niet voor het talentbestand") is onduidelijk; een los nee erachter ("Toestemming, nee") is nee; uitleg blijft ja');
  var G = formulierCtx(true);
  eis(G.toestemmingOordeel('Ik ben ermee akkoord dat mijn gegevens niet langer dan 2 jaar bewaard worden') === 'ja' && G.toestemmingOordeel('Ik ben ermee akkoord dat mijn gegevens niet langer dan 1 jaar bewaard worden') === 'onduidelijk' &&
    G.toestemmingOordeel('Ja, ik geef toestemming. Mijn gegevens worden na twee jaar verwijderd.') === 'ja' && G.toestemmingOordeel('Ja, ik geef toestemming. Mijn gegevens worden na een maand verwijderd.') === 'onduidelijk',
    'v7.4.1 ronde 5 (X21): "niet langer dan 2 jaar" en (ronde 6) "… worden na twee jaar verwijderd" zijn ja zolang de bewaartermijn (24 maanden) daarbinnen valt; "niet langer dan 1 jaar" en "na een maand verwijderd" zijn onduidelijk');
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
/* ---- v7.4.1 herstel ronde 6 (laatste ronde): een aanmelding gaat nooit stil verloren. P1: een ander formulier met een toestemmingsvraag over het bewaren wacht
   (fout en hoogstens één melding per dag met de tip voor aanmeldTabbladen), een stil overgeslagen tabblad staat met naam in het resultaat, collega en
   deelnemer wegen 1; P2: een ontkenning of beperking na het ja-deel is onduidelijk, behalve een bekende uitleg; P3: meer bijzondere persoonsgegevens. Alles verzonnen ---- */
aanmeldBlok('herstel ronde 6', function () {
  var F = formulierCtx(), d = '2-11-2026 08:00', n = 90, T = {}, J = 'Ik geef toestemming om mijn gegevens op te slaan in het talentbestand';
  var tab = function (kop, rijen, naam) { var b = F._demoSS.insertSheet(naam || 'Formulierreacties ' + (n++)); b.appendRow(kop); rijen.forEach(function (r) { b.appendRow(r); }); return b; };
  var tl = function (email) { return F.lees('Talenten').filter(function (t) { return t.email === email; })[0] || {}; };
  var probeer = function (fn) { try { return fn(); } catch (e) { return undefined; } }, kolom = function (b, naam) { return b.rijen[0].indexOf(naam); };
  var ander = function (kop) { return probeer(function () { return F.aanmeldKolommen(['Tijdstempel', 'E-mailadres'].concat(kop)).ander; }); };
  var wachtMeld = function () { return F.lees('Meldingen').filter(function (m) { return m.voor === 'Iris Mulder' && /^Aanmeldingen wachten: /.test(m.tekst); }); };
  // P1 (X11, X12): een minimaal aanmeldformulier met een woord van een ander formulier naast een toestemmingsvraag over het bewaren (in de kop of in het antwoord)
  var vragen = ['Via welke collega ken je ons?', 'Ben je naar onze informatieavond geweest?', 'Hoe tevreden ben je over dit formulier?', 'Heb je al eens een training bij ons gevolgd?',
    'Wil je onze gratis workshop volgen?', 'Ben je deelnemer van ons traineeship?', 'Wil je je aanmelden namens een uitzendbureau?'];
  var p1 = vragen.map(function (q, i) {
    return tab(['Tijdstempel', 'Naam', 'E-mailadres', 'Telefoonnummer', q, i % 2 ? 'Privacyverklaring' : 'Ik geef toestemming voor het bewaren van mijn gegevens'],
      [[d, 'Mia Zes' + i, 'mia' + i + '.zes@mail.example', '06100009' + (10 + i), 'Iets', i % 2 ? J : 'Ja']]);
  });
  T.collega = tab(['Tijdstempel', 'Naam', 'E-mailadres', 'Telefoonnummer', 'Via welke collega ken je ons?', 'Welke werkzaamheden wil je doen?', 'Privacyverklaring'], [[d, 'Cora Collega', 'cora.collega@mail.example', '0610000920', 'Via Sam', 'Surveillant', J]]);
  // X16-X19 zonder bewaar-toestemming blijven stil; dezelfde training met een antwoord over het opslaan van gegevens is twijfel
  T.school = tab(['Tijdstempel', 'Naam', 'School', 'E-mailadres', 'Telefoonnummer', 'Je vraag', 'Ik ga akkoord met de privacyverklaring'], [[d, 'Karin Zes', 'Esdoorn College', 'k.zes@esdoorn.example', '0301230901', 'Graag een offerte', 'Ja']]);
  T.training = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Op welke school werk je?', 'Op welke dag wil je de training volgen?', 'Ik ga akkoord met de privacyverklaring'], [[d, 'l.zes@esdoorn.example', 'Lies Zes', 'Esdoorn College', 'Dinsdag', 'Ja']]);
  T.bewaar = tab(['Tijdstempel', 'E-mailadres', 'Naam', 'Op welke school werk je?', 'Op welke dag wil je de training volgen?', 'Ik ga akkoord met de privacyverklaring'], [[d, 'm.zes@esdoorn.example', 'Mo Zes', 'Esdoorn College', 'Dinsdag', 'Ik ga akkoord dat mijn gegevens worden opgeslagen']]);
  // P2 (X21, AVG): een voorbehoud na het ja-deel
  var voorbehoud = ['Akkoord, maar sla mijn gegevens niet op', "I agree, but don't save my details", 'Ik geef toestemming, maar niet voor de talentenpool', 'Akkoord, maar niet in het talentenbestand opnemen',
    'Ja, maar mijn gegevens niet registreren', 'Akkoord, maar mijn gegevens niet vastleggen', 'Ik ga akkoord, maar wil niet dat jullie mijn gegevens houden', 'Akkoord, maar alleen voor deze sollicitatie',
    'Ja, maar na een maand weggooien', 'Akkoord, maar wis mijn gegevens daarna', 'Ja, maar gooi mijn gegevens na de sollicitatie weg'];
  T.voorbehoud = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Privacyverklaring'],
    voorbehoud.map(function (x, i) { return [d, 'v' + i + '.voorbehoud@mail.example', 'V' + i, 'Voorbehoud', '06100009' + (30 + i), x]; }).concat([[d, 'ja.voorbehoud@mail.example', 'Ja', 'Voorbehoud', '0610000950', 'Ja']]));
  // P3 (X13, X14, AVG): meer gezondheid en zwangerschap in vrije tekst
  T.avg = tab(['Tijdstempel', 'E-mailadres', 'Voornaam', 'Achternaam', 'Telefoonnummer', 'Welke werkzaamheden wil je doen?', 'Wanneer ben je beschikbaar?', 'Privacyverklaring'],
    [[d, 'avg.zes@mail.example', 'Avg', 'Zes', '0610000960', 'Surveillant, Andere: na mijn kraamtijd rustig beginnen', 'Pas na de zomer, ik ben in blijde verwachting', J],
      [d, 'avg.zeven@mail.example', 'Avg', 'Zeven', '0610000961', 'Huiswerkbegeleider, Andere: geen rekenen want ik heb dyscalculie', 'In overleg, ik heb MS', J]]);
  var m0 = wachtMeld().length, uit = F.aanmeldingenVerwerken(), fouten = uit.fouten || [], fout = function (b) { return fouten.filter(function (x) { return x.indexOf('"' + b.getName() + '"') >= 0; }).join(); };
  var nieuweMeld = wachtMeld().slice(m0), uit2 = F.aanmeldingenVerwerken(), alles = (JSON.stringify(F.lees('Talenten')) + JSON.stringify(F.lees('Activiteiten')) + JSON.stringify(F.lees('Meldingen'))).toLowerCase();
  eis(p1.every(function (b, i) { return !tl('mia' + i + '.zes@mail.example').id && kolom(b, 'verwerkt') < 0 && /lijkt een ander formulier .*maar de toestemmingsvraag gaat over het bewaren van gegevens; 1 aanmelding wacht\. Zet de naam van het tabblad in de instelling aanmeldTabbladen onder "aanmelden" .* onder "negeren"/.test(fout(b)); }) &&
    nieuweMeld.length === 1 && nieuweMeld[0].tekst.indexOf(p1[0].getName() + ' lijkt een ander formulier, maar vraagt toestemming om gegevens te bewaren') >= 0 && /aanmeldTabbladen onder "aanmelden" of "negeren"/.test(nieuweMeld[0].tekst) && nieuweMeld[0].tekst.length <= 300 &&
    wachtMeld().length === m0 + 1 && p1.every(function (b) { return fout(b) && (uit2.fouten || []).join().indexOf('"' + b.getName() + '"') >= 0; }) &&
    !tl('m.zes@esdoorn.example').id && /maar de toestemmingsvraag gaat over het bewaren van gegevens/.test(fout(T.bewaar)),
    'v7.4.1 ronde 6 (P1a, X11, X12): een ander formulier ("collega", "informatieavond", "tevreden", "training", "workshop", "deelnemer", "namens") met contact en een toestemmingsvraag over het bewaren wacht: geen profiel, niet gemarkeerd, een fout in elke run en één melding per dag met de tabbladnaam en de tip voor aanmeldTabbladen');
  var stil = uit.overgeslagenTabbladen || [], ar = probeer(function () { return F.aanmeldingenRun(); }) || '', cc = probeer(function () { return F.controleer(); }) || '';
  eis(!tl('k.zes@esdoorn.example').id && !tl('l.zes@esdoorn.example').id && !fout(T.school) && !fout(T.training) && kolom(T.school, 'verwerkt') < 0 && stil.indexOf(T.school.getName()) >= 0 && stil.indexOf(T.training.getName()) >= 0 &&
    stil.indexOf(p1[0].getName()) < 0 && ar.indexOf('2 tabbladen overgeslagen als ander formulier ("' + T.school.getName() + '", "' + T.training.getName() + '")') >= 0 &&
    cc.indexOf('"' + T.school.getName() + '" overgeslagen: geen aanmeldformulier') >= 0 && cc.indexOf('"' + p1[0].getName() + '" wacht: twijfel of het een aanmeldformulier is') >= 0 && cc.indexOf('"Formulierreacties 97" aanmeldformulier') >= 0,
    'v7.4.1 ronde 6 (P1b, X16-X19): een formulier zonder bewaar-toestemming blijft stil (geen profiel, geen fout), maar staat met naam in overgeslagenTabbladen, in aanmeldingenRun en in controleer()');
  eis(ander(['Via welke collega ken je ons?']) === 1 && ander(['Ben je deelnemer van ons traineeship?']) === 1 && ander(['Heb je al eens een training bij ons gevolgd?']) === 2 && !!tl('cora.collega@mail.example').id &&
    ander(['Via welke collega ken je ons?', 'Ben je deelnemer van ons traineeship?']) === 2,
    'v7.4.1 ronde 6 (P1c): "collega" en "deelnemer" wegen 1 (training blijft 2); naast een talentvraag is het een aanmelding');
  eis(voorbehoud.every(function (x, i) { return F.toestemmingOordeel(x) === 'onduidelijk' && !tl('v' + i + '.voorbehoud@mail.example').id && /^wacht: /.test(T.voorbehoud.rijen[i + 1][kolom(T.voorbehoud, 'verwerkt')]); }) &&
    !!tl('ja.voorbehoud@mail.example').id && /11 aanmeldingen wachten, want Athena herkent het antwoord op de toestemmingsvraag niet/.test(fout(T.voorbehoud)) &&
    ['Ik geef toestemming voor het bewaren van mijn gegevens en weet dat ik die altijd kan intrekken', 'Ik ga akkoord, mijn gegevens worden niet gedeeld met derden', 'Ik geef toestemming tot ik me afmeld',
      'Ja, ik geef toestemming; je gegevens worden nooit verkocht', 'I agree. We never share your data with third parties', 'Ja, ik wil alleen geen nieuwsbrief', 'Ja, mits mijn gegevens niet worden gedeeld'].every(function (x) { return F.toestemmingOordeel(x) === 'ja'; }) &&
    ['Nee', 'Niet akkoord', 'Ik geef geen toestemming'].every(function (x) { return F.toestemmingOordeel(x) === 'nee'; }) &&
    ['Ja, alleen voor de nieuwsbrief', 'Ik geef alleen toestemming voor deze sollicitatie', "I agree, but don't save or share my details with third parties", 'Ja, mijn gegevens worden na afloop verwijderd'].every(function (x) { return F.toestemmingOordeel(x) === 'onduidelijk'; }),
    'v7.4.1 ronde 6 (P2, X21, AVG): een ontkenning of beperking na het ja-deel ("… sla mijn gegevens niet op", "don\'t save", "alleen voor deze sollicitatie", "na een maand weggooien", "wis …") is onduidelijk: geen profiel, de rij wacht; uitleg (derden, delen, verkopen, nieuwsbrief, intrekken, afmelden) blijft ja, nee blijft nee');
  eis(['bevallen', 'Ik ben net bevallen', 'in blijde verwachting', 'kraamtijd', 'na mijn kraam', 'IVF', 'ivf-traject', 'dyscalculie', 'MS', 'ik heb MS', 'Ik heb ME'].every(function (x) { return F.vrijeTekst(x) === '(eigen antwoord, niet overgenomen)'; }) &&
    F.vrijeTekst('Mijn verwachting is maart') === 'Mijn verwachting is maart' && F.vrijeTekst('in de verwachting dat het lukt') === 'in de verwachting dat het lukt' && F.vrijeTekst('bijles') === 'bijles' && F.vrijeTekst('bel me even') === 'bel me even' &&
    ['kraamtijd', 'blijde verwachting', 'dyscalculie', 'heb ms'].every(function (x) { return alles.indexOf(x) < 0; }) && /eigen antwoord, niet overgenomen/.test(JSON.stringify(F.lees('Activiteiten'))) && !!tl('avg.zeven@mail.example').id,
    'v7.4.1 ronde 6 (P3, X13, X14, AVG): bevallen, "in blijde verwachting", kraamtijd, IVF, dyscalculie, MS en ME (heel woord, hoofdletters) komen nooit als tekst in het profiel; "verwachting" zonder "in" blijft');
  var rm = fs.readFileSync(path.join(R, 'backend/README.md'), 'utf8'), rij = rm.split('\n').filter(function (r) { return /apiTalentRunNu/.test(r) && /^\|/.test(r); })[0] || '';
  eis(/overgeslagen als ander formulier/.test(rij) && /overgeslagenTabbladen/.test(rm) && /toestemmingsvraag over het bewaren/.test(rm) && /Akkoord, maar sla mijn gegevens niet op/.test(rm),
    'v7.4.1 ronde 6: backend/README.md noemt de stil overgeslagen tabbladen, het andere formulier met een bewaar-toestemming en het voorbehoud na het ja-deel');
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
var won = roep(LARS, 'apiKansOpslaan', { id: 'k7', fase: 'gewonnen', _oud: { fase: 'onderhandeling' }, overdracht: { aantal: 2, rol: 'Studentdocent wiskunde', rooster: 'di en do 8:30-12:30', startdatum: start64, bijzonderheden: 'Ervaring met havo 4', contractwaarde: 22400, akkoorddatum: plusDagen(0) } });  // v7.9: getekende waarde en akkoorddatum
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
// v7.9: gewonnen gaat altijd via het winformulier (getekende waarde en akkoorddatum); zonder formulier geweigerd, de kans blijft open en er komt geen project
eis(/winformulier/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'gewonnen', _oud: { fase: 'voorstel' } })) && ctx.vind('Kansen', 'k10').fase === 'voorstel' && !ctx.lees('Trajecten').some(function (t) { return t.kansId === 'k10'; }), 'v7.9: zonder winformulier geweigerd (geen project, de kans blijft in voorstel)');

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
  eis(c1.indexOf('Athena Assistent, backend 7.9.1\n') === 0 && c1.indexOf('AFWIJKENDE KOP') < 0 && /Scholen: \d+ rijen/.test(c1) && /Fasewissels: \d+ rijen/.test(c1), 'controleer(): begint met "Athena Assistent, backend 7.9.1", geen afwijkende koppen in de demo-sheet, Fasewissels aanwezig');  // v7.3; v7.4: versie mee omhoog; v7.4.1: backend-patch; v7.5: release; v7.6: metingen; v7.7: alle gegevens inladen; v7.9: sturing; v7.9.1: de zes fasen van Capsule
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
    contactgegevens: 'Contact Rondreis, 06-00000000', voorstelUrl: 'https://docs.google.com/document/d/rondreis', documentenUrl: 'https://drive.google.com/drive/folders/rondreis', verlenging: 'nog bespreken', xpsProject: '10.999', talentscout: 'Sem de Boer', contractwaarde: 13000.5, klant: 'bestaand', productsoort: 'examentraining' };  // v7.9: klant en productsoort
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

/* ---- v7.6: metingen — aanleveren (geldig, ongeldig, upsert, eigen rijen), het overzicht (rechten, p50/p95 uit een bekende verdeling) en opruimen na 90 dagen ---- */
(function () {
  var vandaag = plusDagen(0);
  function mRij(extra) { var r = { dag: vandaag, fn: 'apiHome', aantal: 100, fouten: 2, b250: 50, b500: 30, b1000: 15, b2000: 5, b5000: 0, bMeer: 0, somMs: 40000, maxMs: 1800, laatsteFout: 'netwerk', appVersie: '7.6' }; Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function metingen(fn) { return ctx.lees('Metingen').filter(function (m) { return !fn || m.fn === fn; }); }
  var r1 = roep(LARS, 'apiMetingenOpslaan', [mRij(), { dag: vandaag, fn: 'js', aantal: 1, fouten: 1, b250: 1, b500: 0, b1000: 0, b2000: 0, b5000: 0, bMeer: 0, somMs: 0, maxMs: 0, laatsteFout: 'TypeError: x is undefined @ index.html:12:3', appVersie: '7.6' }]);
  var m1 = metingen('apiHome')[0];
  eis(r1.ontvangen === 2 && metingen().length === 2 && !!m1 && m1.gebruiker === 'g-lars' && m1.aantal === 100 && m1.maxMs === 1800 && m1.laatsteFout === 'netwerk' && m1.appVersie === '7.6' && !!m1.id && !!m1.aangemaakt, 'apiMetingenOpslaan: twee geldige rijen (api en js) komen in Metingen onder de eigen gebruikers-id');
  var r2 = roep(LARS, 'apiMetingenOpslaan', [mRij({ maxMs: 900, fouten: 1, laatsteFout: '', gebruiker: 'beheer' })]), m2 = metingen('apiHome');
  eis(r2.ontvangen === 1 && m2.length === 1 && m2[0].id === m1.id && m2[0].aantal === 200 && m2[0].fouten === 3 && m2[0].b250 === 100 && m2[0].somMs === 80000 && m2[0].maxMs === 1800 && m2[0].laatsteFout === 'netwerk' && m2[0].gebruiker === 'g-lars', 'apiMetingenOpslaan: upsert op (gebruiker, dag, fn) telt op, maxMs blijft het maximum, de laatste fout blijft staan; gebruiker uit de invoer telt niet');
  roep(FEMKE, 'apiMetingenOpslaan', [mRij()]);
  eis(metingen('apiHome').length === 2 && metingen('apiHome').some(function (m) { return m.gebruiker === 'g-femke' && m.aantal === 100; }), 'apiMetingenOpslaan: een andere gebruiker krijgt een eigen rij voor dezelfde dag en api');
  var voor = metingen().length, fouten = [
    [faalt(LARS, 'apiMetingenOpslaan', 'x'), /lijst/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ fn: 'eval' })]), /bekende api/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ fn: 'api' + 'BestaatNiet' })]), /bekende api/],  // samengesteld, zodat kruistabel.js hem niet als app-aanroep leest
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ fn: 'apiPortaalToon' })]), /bekende api/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ dag: plusDagen(1) })]), /geldige dag/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ dag: plusDagen(-31) })]), /geldige dag/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ dag: '2026-02-30' })]), /geldige dag/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ fouten: 101 })]), /meer fouten/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ b250: 51 })]), /emmers/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ somMs: -1 })]), /geheel getal/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ maxMs: '1800' })]), /geheel getal/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ aantal: 0, fouten: 0, b250: 0, b500: 0, b1000: 0, b2000: 0 })]), /aantal 0/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ laatsteFout: new Array(122).join('x') })]), /120 tekens/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ laatsteFout: { a: 1 } })]), /verwacht tekst/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij({ appVersie: '7.6.0-heel-lang-versienummer' })]), /20 tekens/],
    [faalt(LARS, 'apiMetingenOpslaan', [null]), /geen object/],
    [faalt(LARS, 'apiMetingenOpslaan', [mRij(), 'x']), /rij 2/],
    [faalt(LARS, 'apiMetingenOpslaan', new Array(201).join(',').split(',').map(function () { return mRij(); })), /hoogstens 200/]
  ];
  var mis = fouten.filter(function (f) { return !f[1].test(f[0]) || /undefined|TypeError|\[object/.test(f[0]); }).map(function (f) { return f[0] || '(geen fout)'; });
  eis(!mis.length && metingen().length === voor, 'apiMetingenOpslaan: ' + fouten.length + ' ongeldige invoeren geven een Nederlandse fout en schrijven niets' + (mis.length ? ' — ' + mis.join(' | ') : ''));
  eis(/toegang/.test(faalt(LARS, 'apiMetingen', 14)) && /toegang/.test(faalt(FEMKE, 'apiMetingen')) && /toegang/.test(faalt('demo-iris', 'apiMetingen')) && /toegang/.test(faalt('demo-sem', 'apiMetingen')), 'apiMetingen: alleen management (consultancy, accountmanagement en talent, ook een teamlead, krijgen "geen toegang")');
  var ov = roep(SOPHIE, 'apiMetingen'), home = ov.apis.filter(function (a) { return a.fn === 'apiHome'; })[0];
  // bekende verdeling over Lars (200) en Femke (100): 300 aanroepen, 150 ≤ 250 ms, 90 ≤ 500, 45 ≤ 1000, 15 ≤ 2000: p50 valt precies op de grens van de eerste emmer (250), p95 (rang 285) precies op de grens van de derde (1000)
  eis(ov.dagen === 14 && ov.schatting === true && /schatting/.test(ov.uitleg) && !!home && home.aantal === 300 && home.fouten === 5 && home.foutPct === 1.7 && home.p50 === 250 && home.p95 === 1000 && home.gemMs === 400 && home.maxMs === 1800 && home.laatsteFout === 'netwerk' && ov.gebruikers === 2, 'apiMetingen: per api over alle gebruikers; p50 = 250 en p95 = 1000 uit de bekende verdeling, gemiddelde 400, foutpercentage 1,7');
  eis(ov.jsFouten.aantal === 1 && /TypeError: x is undefined @ index\.html:12:3/.test(ov.jsFouten.laatste) && !ov.apis.some(function (a) { return a.fn === 'js'; }), 'apiMetingen: JS-fouten apart (aantal en laatste melding), niet in de api-lijst');
  roep(FEMKE, 'apiMetingenOpslaan', [mRij({ fn: 'apiCrm', aantal: 10, fouten: 0, b250: 0, b500: 0, b1000: 0, b2000: 0, b5000: 5, bMeer: 5, somMs: 60000, maxMs: 9000, laatsteFout: '' })]);
  var ov2 = roep(SOPHIE, 'apiMetingen', 90), crm = ov2.apis[0];
  // 10 aanroepen: 5 in 2000–5000 en 5 daarboven (tot maxMs 9000): p50 (rang 5) = 5000, p95 (rang 9,5) = 5000 + 4000 × 4,5 / 5 = 8600
  eis(ov2.dagen === 90 && crm.fn === 'apiCrm' && crm.p50 === 5000 && crm.p95 === 8600 && ov2.apis[1].fn === 'apiHome', 'apiMetingen: gesorteerd op p95 aflopend; de laatste emmer interpoleert tot de langste aanroep (p95 = 8600)');
  eis(roep(SOPHIE, 'apiMetingen', 'x').dagen === 14 && roep(SOPHIE, 'apiMetingen', 500).dagen === 90 && roep(SOPHIE, 'apiMetingen', -3).dagen === 1, 'apiMetingen: dagen standaard 14, hoogstens 90, minstens 1');
  ctx.GEBRUIKER = null;
  ctx.schrijf('Metingen', { id: 'm-oud-rooktest', dag: plusDagen(-91), gebruiker: 'g-lars', fn: 'apiHome', aantal: 1, fouten: 0, b250: 1, b500: 0, b1000: 0, b2000: 0, b5000: 0, bMeer: 0, somMs: 10, maxMs: 10, laatsteFout: '', appVersie: '7.6', aangemaakt: ctx.nu() });
  ctx.schrijf('Metingen', { id: 'm-net-rooktest', dag: plusDagen(-89), gebruiker: 'g-lars', fn: 'apiHome', aantal: 1, fouten: 0, b250: 1, b500: 0, b1000: 0, b2000: 0, b5000: 0, bMeer: 0, somMs: 10, maxMs: 10, laatsteFout: '', appVersie: '7.6', aangemaakt: ctx.nu() });
  var n = metingen().length, ar = roep(SOPHIE, 'apiArchiveer');
  eis(ar.metingen === 1 && !ctx.vind('Metingen', 'm-oud-rooktest') && !!ctx.vind('Metingen', 'm-net-rooktest') && metingen().length === n - 1 && roep(SOPHIE, 'apiArchiveer').metingen === 0, 'archiveer: een meting ouder dan 90 kalenderdagen gaat weg, de rest blijft; een tweede run ruimt niets op');
  eis(!faalt(SOPHIE, 'apiMetingenOpslaan', []) && roep(SOPHIE, 'apiMetingenOpslaan', []).ontvangen === 0, 'apiMetingenOpslaan: een lege lijst is geen fout (ontvangen 0)');
})();

/* ---- v7.7: talentimport — talenten uit de XPS-accountexport (koppelen, aanvullen, nieuw, overgeslagen, privékolommen, urenexport in de map, idempotent, rechten) ---- */
(function () { try {
  ctx.verwijderRijen('Talenten', function (t) { return t.achternaam === 'Dubbel' && t.email === 'eva.de.wit@mail.example'; });  // v7.7 (B3): het geforceerde dubbele profiel uit de apiTalentOpslaan-test zou rij X5001 (accountnummer → tl1, e-mail → dubbel) terecht een conflict maken
  var V = '2026-10-30', TAL = ctx.lees('Talenten'), lijst = function (x) { return vm.runInContext('(function (x) { return JSON.parse(x); })', ctx)(JSON.stringify(x)); };
  var fout = function (f) { try { f(); return ''; } catch (e) { return String(e.message); } }, FUN = ctx.keuzelijst('talentFuncties'), kopie = function (l) { return l.map(function (t) { var k = {}; Object.keys(t).forEach(function (x) { k[x] = t[x]; }); return k; }); };
  // 1. het verzonnen voorbeeldbestand, zuiver (zonder te schrijven): kolommen, nieuw, ongewijzigd, overgeslagen per reden, functies, privékolommen
  var vb = ctx.Utilities.parseCsv(fs.readFileSync(path.join(R, 'test/voorbeelden/xps_accounts.csv'), 'utf8'), ';'), u = ctx.talentUitRijen(vb, TAL, { vandaag: V, functies: FUN }), O = u.overgeslagen;
  eis(u.soort === 'account' && u.kolommen.xpsId === 'Accountnummer' && u.kolommen.naam === 'Naam' && u.kolommen.email === 'E-mail' && u.kolommen.telefoon === 'Telefoon' && u.kolommen.postcode === 'Postcode' && u.kolommen.woonplaats === 'Woonplaats' && u.kolommen.functie === 'Functie' && u.kolommen.status === 'Status' && u.kolommen.startdatum === 'In dienst sinds', 'accountexport: kolommen herkend (naam, contact, functie, status van het account, in dienst sinds)');
  eis(u.regels === 8 && u.nieuw.length === 2 && u.bijgewerkt.length === 0 && u.ongewijzigd === 2 && O.geenNaam === 1 && O.geenContact === 1 && O.dubbelInBestand === 1 && O.uitgeschreven === 0 && O.nietActief === 1 && O.conflict === 0 && u.conflicten.length === 0, 'accountexport: nieuw, ongewijzigd (Eva en Tim bestaan al, alle velden gevuld) en overgeslagen per reden (geen naam, geen contact, dubbel in bestand, niet actief) tellen op; geen conflicten');  // v7.7 (B1): Joris "Uit dienst" is geen nieuw profiel
  var pien = u.nieuw.filter(function (t) { return t.xpsId === 'X9101'; })[0], joris = u.nieuw.filter(function (t) { return t.xpsId === 'X9102'; })[0], noor = u.nieuw.filter(function (t) { return t.xpsId === 'X9103'; })[0];
  eis(pien && pien.voornaam === 'Pien' && pien.achternaam === 'van der Berg' && pien.email === 'pien.vd.berg@mail.example' && pien.telefoon === '0619000001' && pien.postcode === '1234 AB' && pien.woonplaats === 'Voorbeeldstad' && pien.functies.join() === 'onderwijsondersteuner,surveillant' && pien.status === 'actief' && pien.bron === 'xps-bestand' && pien.toestemmingDatum === V && pien.toestemmingGrondslag === 'overeenkomst' && pien.bewarenTot > V && pien.velden.inDienstSinds === '2026-09-01' && !!pien.aangemaakt && !!pien.statusSinds, 'nieuw profiel: naam gesplitst (tussenvoegsels bij de achternaam), contact genormaliseerd, functies uit de keuzelijst, actief, bron xps-bestand, toestemming vandaag met grondslag overeenkomst, in dienst sinds als vrij veld');
  eis(!joris && O.nietActief === 1 && JSON.stringify(u).indexOf('joris.blauw') < 0, 'B1: een account "Uit dienst" wordt nooit een nieuw profiel (overgeslagen: nietActief) en staat nergens in het resultaat');  // v7.7 (B1)
  eis(noor && noor.functies.length === 0 && u.nietHerkendeFuncties.length === 1 && u.nietHerkendeFuncties[0].functie === 'conciërge' && u.nietHerkendeFuncties[0].aantal === 1, 'dubbel in het bestand: de laatste rij telt (Noor met "Conciërge"); een onbekende functie gooit niet maar staat in nietHerkendeFuncties en wordt niet gezet');
  var gen = u.genegeerdeKolommen.map(function (g) { return g.kolom; }), json = JSON.stringify(u);
  eis(gen.indexOf('Geboortedatum') >= 0 && gen.indexOf('IBAN') >= 0 && gen.indexOf('Salaris (uur)') >= 0 && u.genegeerdeKolommen.filter(function (g) { return g.kolom === 'IBAN' || g.kolom === 'Geboortedatum'; }).every(function (g) { return /persoonsgegevens/.test(g.hint); }) && /loongegevens/.test(u.genegeerdeKolommen.filter(function (g) { return g.kolom === 'Salaris (uur)'; })[0].hint) && json.indexOf('NL00BANK') < 0 && json.indexOf('2000-01-01') < 0 && json.indexOf('17,50') < 0 && json.indexOf('17.5') < 0, 'privé- en loonkolommen (geboortedatum, IBAN, salaris) worden genegeerd met een hint en hun waarden staan nergens in het resultaat');
  eis(ctx.XPS_PRIVE.test('geslacht') && ctx.XPS_PRIVE.test('nationaliteit') && ctx.XPS_PRIVE.test('ziekmeldingen') && ctx.XPS_PRIVE.test('religie') && ctx.XPS_PRIVE.test('gezondheid'), 'XPS_PRIVE kent ook geslacht, nationaliteit, gezondheid, ziek en religie');
  // 2. koppelen aan een bestaand talent: accountnummer, e-mail, telefoon, unieke naam; alleen lege velden vullen; dubbele naam niet; uitgeschreven niet
  var talenten = TAL.map(function (t) { var k = {}; Object.keys(t).forEach(function (x) { k[x] = t[x]; }); return k; }).concat([
    { id: 'tlx1', voornaam: 'Eva', achternaam: 'de Wit', status: 'actief' }, { id: 'tlx2', voornaam: 'Leeg', achternaam: 'Profiel', status: 'gescreend', functies: [] },
    { id: 'tlx3', voornaam: 'Weg', achternaam: 'Geweest', status: 'uitgeschreven', email: 'weg.geweest@mail.example' }]);
  var KOP = ['Accountnummer', 'Voornaam', 'Achternaam', 'E-mail', 'Mobiel', 'Postcode', 'Woonplaats', 'Functies', 'Accountstatus'];
  var k = ctx.talentUitRijen(lijst([KOP,
    ['X5002', 'Iemand', 'Anders', 'anders@mail.example', '', '', '', '', 'Actief'],                                  // accountnummer wint van naam en e-mail: Ali (tl2), alles al gevuld
    ['', 'Tim', 'V.', 'Tim.Verhoeven@mail.example', '', '', '', '', 'Actief'],                                      // e-mail (hoofdletters maken niet uit): tl4
    ['', 'Nina', 'J.', '', '06-31031676', '', '', '', 'Actief'],                                                     // telefoon: tl5 (06-3 + 1031676)
    ['X7001', 'Leeg', 'Profiel', 'leeg.profiel@mail.example', 612345670, '1234 AB', 'Voorbeeldstad', 'Surveillant, Onbekend', 'Actief'],  // unieke naam: lege velden vullen (telefoon als getal zonder voorloopnul)
    ['X7002', 'Eva', 'de Wit', 'eva2@mail.example', '', '', '', '', 'Actief'],                                       // naam hoort bij twee talenten (tl1 en tlx1): nieuw profiel, niet gekoppeld
    ['X7003', 'Weg', 'Geweest', 'weg.geweest@mail.example', '', '', '', '', 'Actief'],                               // uitgeschreven: niet overschrijven, wel geteld
    ['X7004', 'Nieuw', 'Mens', '', '', '', 'Voorbeeldstad', '', 'Inactief']]), talenten, { vandaag: V, functies: FUN });
  var w = function (id) { return k.bijgewerkt.filter(function (x) { return x.id === id; })[0]; };
  eis(k.ongewijzigd === 3 && !w('tl2') && !w('tl4') && !w('tl5'), 'koppelen op accountnummer, e-mail en telefoon: een volledig profiel blijft ongewijzigd (Ali, Tim, Nina)');
  var lp = w('tlx2');
  eis(lp && lp.xpsId === 'X7001' && lp.email === 'leeg.profiel@mail.example' && lp.telefoon === '0612345670' && lp.postcode === '1234 AB' && lp.woonplaats === 'Voorbeeldstad' && lp.functies.join() === 'surveillant' && !('status' in lp) && !('notitie' in lp) && !('tags' in lp) && !('beschikbaarheid' in lp), 'koppelen op een unieke naam: alleen lege velden gevuld (accountnummer, e-mail, telefoon, postcode, woonplaats, functies); status, notitie, tags en beschikbaarheid blijven van het talentteam');
  eis(k.nietHerkendeFuncties.length === 1 && k.nietHerkendeFuncties[0].functie === 'onbekend', 'een onbekende functie bij een bestaand profiel telt ook in nietHerkendeFuncties');
  eis(k.nieuw.length === 1 && k.nieuw.some(function (t) { return t.xpsId === 'X7002' && t.voornaam === 'Eva'; }) && !w('tl1') && !w('tlx1') && !k.nieuw.some(function (t) { return t.xpsId === 'X7004'; }) && k.overgeslagen.nietActief === 1, 'een naam die bij twee talenten hoort wordt niet gekoppeld (nieuw profiel); een account "Inactief" wordt geen profiel (nietActief)');  // v7.7 (B1)
  eis(k.overgeslagen.uitgeschreven === 1 && !w('tlx3') && !k.nieuw.some(function (t) { return t.xpsId === 'X7003'; }), 'een uitgeschreven talent wordt niet overschreven en niet opnieuw aangemaakt, wel geteld');
  eis(k.nieuw.every(function (t) { return !/\s/.test(t.xpsId); }) && k.bijgewerkt.every(function (x) { return !x.xpsId || !/\s/.test(x.xpsId); }), 'nooit een naam in xpsId');
  // 3. zonder accountstatuskolom is elk nieuw profiel actief; zonder naamkolom of contactkolom een duidelijke fout; een urenexport wordt herkend
  var z = ctx.talentUitRijen(lijst([['Naam', 'E-mail'], ['Piet Nieuw', 'piet.nieuw@mail.example']]), talenten, { vandaag: V, functies: FUN });
  eis(z.nieuw.length === 1 && z.nieuw[0].status === 'actief' && z.nieuw[0].achternaam === 'Nieuw', 'zonder statuskolom is een nieuw profiel actief');
  eis(/geen naamkolom/.test(fout(function () { ctx.talentUitRijen(lijst([['Accountnummer', 'E-mail'], ['X1', 'a@b.example']]), talenten, { vandaag: V }); })) && /geen kolom met e-mail, telefoon of postcode/.test(fout(function () { ctx.talentUitRijen(lijst([['Naam', 'Opmerking'], ['Piet Nieuw', 'x']]), talenten, { vandaag: V }); })), 'geen naamkolom of geen contactkolom: een Nederlandse fout in plaats van een stille nul');
  var ur = ctx.talentUitRijen(ctx.Utilities.parseCsv(fs.readFileSync(path.join(R, 'test/voorbeelden/xps_diensten.csv'), 'utf8'), ';'), talenten, { vandaag: V, functies: FUN });
  eis(ur.soort === 'uren' && ur.nieuw.length === 0 && ur.regels === 0, 'de dienstenexport (datum, gewerkte tijd) wordt als urenexport herkend en niet als accounts gelezen');
  eis(ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Uren per week'], ['Piet Nieuw', 'piet.nieuw@mail.example', '16']]), talenten, { vandaag: V, functies: FUN }).soort === 'account', 'een kolom "Uren per week" in een accountexport maakt er geen urenexport van');
  // B1: met een statuskolom is een lege status niet actief; een inactief account vult wel een bestaand profiel aan
  var b1 = ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Status'], ['Leeg Status', 'leeg.status@mail.example', ''], ['Nog Iemand', 'nog.iemand@mail.example', 'Inactief'], ['Uit Dienst', 'uit.dienst@mail.example', 'Uit dienst']]), talenten.concat([{ id: 'tlx4', voornaam: 'Uit', achternaam: 'Dienst', status: 'slapend' }]), { vandaag: V, functies: FUN });
  eis(b1.nieuw.length === 0 && b1.overgeslagen.nietActief === 2 && b1.bijgewerkt.length === 1 && b1.bijgewerkt[0].id === 'tlx4' && b1.bijgewerkt[0].email === 'uit.dienst@mail.example' && !('status' in b1.bijgewerkt[0]), 'B1: lege status en "Inactief" worden geen profiel; een inactief account vult een bestaand profiel wel aan zonder de status te raken');
  eis(ctx.accountActief(null) && !ctx.accountActief('') && !ctx.accountActief('Uit dienst') && !ctx.accountActief('Inactief') && ctx.accountActief('Actief'), 'B1: accountActief: zonder statuskolom (null) actief, lege status niet');
  // B3: tegenstrijdige koppeling (accountnummer → A, e-mail of telefoon → B; of A heeft al een ander accountnummer): niet toepassen, tellen, lijst zonder telefoon
  var t3 = kopie(TAL); t3.filter(function (t) { return t.id === 'tl2'; })[0].email = '';
  var b3 = ctx.talentUitRijen(lijst([KOP, ['X5002', 'Ali', 'Yilmaz', 'tim.verhoeven@mail.example', '', '', '', '', 'Actief'], ['X9999', 'Nina', 'Jacobs', 'nina.jacobs@mail.example', '', '', '', '', 'Actief'], ['X5003', 'Jasmijn', 'Kok', '', '06-31031676', '', '', '', 'Actief']]), t3, { vandaag: V, functies: FUN });
  eis(b3.overgeslagen.conflict === 3 && b3.overgeslagen.dubbelInBestand === 0 && b3.bijgewerkt.length === 0 && b3.nieuw.length === 0 && b3.ongewijzigd === 0 && b3.conflicten.length === 3 && b3.conflicten[0].xpsId === 'X5002' && b3.conflicten[0].email === 'tim.verhoeven@mail.example' && b3.conflicten[0].naam === 'Ali Yilmaz' && !('telefoon' in b3.conflicten[0]) && b3.conflicten.every(function (x) { return /tegenstrijdig accountnummer of e-mailadres/.test(x.reden); }) && JSON.stringify(b3).indexOf('31031676') < 0, 'B3: accountnummer tl2 (zonder e-mail) met het e-mailadres van tl4, e-mail tl5 met een ander accountnummer, en accountnummer tl3 met de telefoon van tl5: niet bijgewerkt, conflict geteld, lijst zonder telefoon');
  // B4: privékolommen van een ander (noodcontact, ouder/verzorger) en bank/paspoort nooit als accountnummer, telefoon, e-mail of naam; de naamkolom niet naast voornaam en achternaam
  var b4 = ctx.talentUitRijen(lijst([['Accountnummer', 'Voornaam', 'Achternaam', 'Naam noodcontact', 'E-mail', 'E-mail ouder/verzorger', 'Telefoon noodcontact', 'Mobiel', 'Rekeningnummer', 'Paspoortnummer', 'Naam'],
    ['X7101', 'Prive', 'Test', 'Nood Persoon', 'prive.test@mail.example', 'ouder@mail.example', '0611111111', '06-22222222', 'NL00BANK0000000009', 'NX1234567', 'Gebruikersnaam X']]), TAL, { vandaag: V, functies: FUN });
  var gen4 = b4.genegeerdeKolommen.map(function (g) { return g.kolom; }), j4 = JSON.stringify(b4), n4 = b4.nieuw[0];
  eis(b4.kolommen.xpsId === 'Accountnummer' && b4.kolommen.voornaam === 'Voornaam' && b4.kolommen.achternaam === 'Achternaam' && !b4.kolommen.naam && b4.kolommen.email === 'E-mail' && b4.kolommen.telefoon === 'Mobiel' && ['Rekeningnummer', 'Paspoortnummer', 'Telefoon noodcontact', 'E-mail ouder/verzorger', 'Naam noodcontact', 'Naam'].every(function (x) { return gen4.indexOf(x) >= 0; }) && b4.genegeerdeKolommen.filter(function (g) { return g.kolom !== 'Naam'; }).every(function (g) { return /persoonsgegevens/.test(g.hint); }), 'B4: Rekeningnummer, Paspoortnummer, Telefoon noodcontact, E-mail ouder/verzorger en Naam noodcontact zijn nooit accountnummer, telefoon, e-mail of naam (genegeerd met hint); de losse naamkolom telt niet naast voornaam en achternaam');
  eis(b4.nieuw.length === 1 && n4.voornaam === 'Prive' && n4.achternaam === 'Test' && n4.email === 'prive.test@mail.example' && n4.telefoon === '0622222222' && n4.xpsId === 'X7101' && j4.indexOf('Nood Persoon') < 0 && j4.indexOf('ouder@') < 0 && j4.indexOf('0611111111') < 0 && j4.indexOf('NL00BANK') < 0 && j4.indexOf('NX1234567') < 0 && j4.indexOf('Gebruikersnaam') < 0, 'B4: het profiel komt uit de juiste kolommen en geen enkele privéwaarde staat in het resultaat');
  // R1: 'Functieomschrijving' is nooit de functiekolom; een onbekende functie gaat door vrijeTekst (≤ 60 tekens, nooit bijzondere persoonsgegevens)
  var lang = new Array(71).join('x'), r1a = ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Functieomschrijving'], ['Piet Functie', 'piet.functie@mail.example', 'Surveillant']]), TAL, { vandaag: V, functies: FUN });
  eis(!r1a.kolommen.functie && r1a.genegeerdeKolommen.some(function (g) { return g.kolom === 'Functieomschrijving' && /vrije tekst/.test(g.hint); }) && r1a.nieuw.length === 1 && r1a.nieuw[0].functies.length === 0 && r1a.nietHerkendeFuncties.length === 0 && JSON.stringify(r1a).indexOf('Surveillant') < 0, 'R1: een kolom Functieomschrijving wordt niet als functiekolom gelezen (genegeerd als vrije tekst)');
  var r1b = ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Functieomschrijving', 'Functie'], ['Piet Functie', 'piet.functie@mail.example', 'Hier staat van alles over Piet', 'Conciërge, ziek thuis, ' + lang + ', Surveillant']]), TAL, { vandaag: V, functies: FUN });
  var nh = r1b.nietHerkendeFuncties.map(function (f) { return f.functie; });
  eis(r1b.kolommen.functie === 'Functie' && r1b.nieuw[0].functies.join() === 'surveillant' && nh.length === 2 && nh.indexOf('conciërge') >= 0 && nh.some(function (f) { return f.length === 60 && /…$/.test(f); }) && !nh.some(function (f) { return /ziek/.test(f); }) && JSON.stringify(r1b).indexOf('van alles over Piet') < 0, 'R1: naast een Functieomschrijving wint de kolom Functie; niet herkende functies gaan door vrijeTekst (60 tekens, "ziek thuis" nooit)');
  // R5: 'Achternaam, Voornaam' (tussenvoegsels naar de achternaam)
  var t5 = kopie(TAL), e5 = t5.filter(function (t) { return t.id === 'tl1'; })[0]; e5.email = ''; e5.xpsId = ''; e5.telefoon = '';
  var r5 = ctx.talentUitRijen(lijst([['Naam', 'E-mail'], ['de Wit, Eva', 'eva.nieuw@mail.example'], ['Berg, Pien van der', 'pien.nieuw@mail.example']]), t5, { vandaag: V, functies: FUN });
  eis(r5.bijgewerkt.length === 1 && r5.bijgewerkt[0].id === 'tl1' && r5.bijgewerkt[0].email === 'eva.nieuw@mail.example' && r5.nieuw.length === 1 && r5.nieuw[0].voornaam === 'Pien' && r5.nieuw[0].achternaam === 'van der Berg', 'R5: "de Wit, Eva" koppelt aan tl1 en "Berg, Pien van der" wordt Pien / van der Berg');
  var ns5 = ctx.naamSplits('Pien van der Berg');
  eis(ns5.voornaam === 'Pien' && ns5.achternaam === 'van der Berg' && ctx.naamSplits('Jansen, Kees').achternaam === 'Jansen' && ctx.naamSplits('Kees').voornaam === 'Kees' && ctx.naamSplits('Kees').achternaam === '', 'R5: naamSplits zonder komma blijft zoals het was');
  // R6: een datum-, week- of urenkolom die geen uren is (datum uit dienst, einddatum, weekend beschikbaar, contracturen) maakt er geen urenexport van
  var r6 = ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Datum uit dienst', 'Einddatum', 'Weekend beschikbaar', 'Contracturen'], ['Piet Nieuw', 'piet.nieuw@mail.example', '01-01-2026', '', 'ja', '16']]), TAL, { vandaag: V, functies: FUN });
  eis(r6.soort === 'account' && r6.nieuw.length === 1 && ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Einddatum'], ['Piet Nieuw', 'piet.nieuw@mail.example', '']]), TAL, { vandaag: V, functies: FUN }).soort === 'account' && ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Datum', 'Uren'], ['Piet Nieuw', 'piet.nieuw@mail.example', '01-01-2026', '4']]), TAL, { vandaag: V, functies: FUN }).soort === 'uren', 'R6: Datum uit dienst, Einddatum, Weekend beschikbaar en Contracturen → accountexport; Datum en Uren → urenexport');
  // R7: plaatshouders tellen als leeg; postcode en plaats in één cel
  var r7 = ctx.talentUitRijen(lijst([['Naam', 'E-mail', 'Telefoon', 'Postcode', 'Woonplaats'], ['Piet Plaats', 'piet.plaats@mail.example', 'n.v.t.', '1234 AB Utrecht', '-'], ['Piet Tweede', 'piet.tweede@mail.example', '—', '5678cd Zeist', 'Bunnik'], ['—', 'geen.naam@mail.example', '.', '?', 'N.V.T.']]), TAL, { vandaag: V, functies: FUN });
  eis(r7.nieuw.length === 2 && r7.nieuw[0].postcode === '1234 AB' && r7.nieuw[0].woonplaats === 'Utrecht' && r7.nieuw[0].telefoon === '' && r7.nieuw[1].postcode === '5678 CD' && r7.nieuw[1].woonplaats === 'Bunnik' && r7.overgeslagen.geenNaam === 1 && JSON.stringify(r7).indexOf('n.v.t.') < 0, 'R7: "-", "—", ".", "?" en "n.v.t." tellen als leeg; "1234 AB Utrecht" geeft postcode en woonplaats (alleen als de woonplaatskolom leeg is)');
  // 4. talentImport uit de Drive-map: schrijft nieuw en bijgewerkt, slaat een urenexport over, tweede run idempotent, rechten
  var map = ctx.xpsExportMap(), it = map.getFiles(); while (it.hasNext()) it.next().setTrashed(true);
  ctx.P.setProperty('LAATSTE_TALENTIMPORT', ''); ctx.P.setProperty('LAATSTE_URENIMPORT', '');
  var acc = map.createFile(ctx.Utilities.newBlob(fs.readFileSync(path.join(R, 'test/voorbeelden/xps_accounts.csv'), 'utf8'), 'text/csv', 'xps-accounts-v77.csv'));
  var urenB = map.createFile(ctx.Utilities.newBlob(fs.readFileSync(path.join(R, 'test/voorbeelden/xps_diensten.csv'), 'utf8'), 'text/csv', 'xps-diensten-v77.csv'));
  var nVoor = ctx.lees('Talenten').length, aVoor = ctx.lees('Activiteiten').length;
  eis(/toegang/.test(faalt(FEMKE, 'apiTalentImport')) && /toegang/.test(faalt(LARS, 'apiTalentImport')) && ctx.lees('Talenten').length === nVoor, 'apiTalentImport: een accountmanager en een consultant worden geweigerd (niets geschreven)');
  var imp = roep(IRIS, 'apiTalentImport'), na = ctx.lees('Talenten');
  eis(imp.bestanden === 1 && imp.regels === 8 && imp.nieuw === 2 && imp.bijgewerkt === 0 && imp.ongewijzigd === 2 && imp.overgeslagen.geenNaam === 1 && imp.overgeslagen.geenContact === 1 && imp.overgeslagen.dubbelInBestand === 1 && imp.overgeslagen.nietActief === 1 && imp.overgeslagen.conflict === 0 && imp.conflicten.length === 0 && imp.kolommen.xpsId === 'Accountnummer' && imp.kolommen.telefoon === 'Telefoon' && imp.urenBestanden.join() === 'xps-diensten-v77.csv' && imp.fouten.length === 0 && imp.nietGelezen.length === 0 && imp.nietHerkendeFuncties.length === 1 && imp.sinds === '', 'apiTalentImport (talentteam): het accountbestand gelezen, de urenexport in de map overgeslagen onder urenBestanden, tellingen zoals de zuivere functie, gebruikte kolommen');  // v7.7 (B1, B4)
  var pienR = na.filter(function (t) { return t.xpsId === 'X9101'; })[0];
  eis(na.length === nVoor + 2 && pienR && pienR.status === 'actief' && pienR.bron === 'xps-bestand' && pienR.door === 'Iris Mulder' && ctx.lijstUit(pienR.functies).join() === 'onderwijsondersteuner,surveillant' && ctx.lees('Activiteiten').length === aVoor + 2 && ctx.lees('Activiteiten').filter(function (a) { return a.talentId === pienR.id && a.bron === 'xps'; }).length === 1 && !na.some(function (t) { return t.xpsId === 'X9102'; }), 'talentImport: twee profielen geschreven met een tijdlijnregel (Joris "Uit dienst" niet); door = wie importeerde');
  eis(!!ctx.P.getProperty('LAATSTE_TALENTIMPORT'), 'na een geslaagde run schuift LAATSTE_TALENTIMPORT op');
  var imp2 = roep(SOPHIE, 'apiTalentImport');
  eis(imp2.bestanden === 0 && imp2.nieuw === 0 && imp2.urenBestanden.length === 0 && ctx.lees('Talenten').length === nVoor + 2 && !!imp2.sinds, 'tweede run (management mag ook): niets nieuws, hetzelfde bestand wordt niet opnieuw gelezen');
  ctx.P.setProperty('LAATSTE_TALENTIMPORT', '');
  var imp3 = roep(IRIS, 'apiTalentImport');
  eis(imp3.bestanden === 1 && imp3.nieuw === 0 && imp3.bijgewerkt === 0 && imp3.ongewijzigd === 4 && imp3.overgeslagen.nietActief === 1 && ctx.lees('Talenten').length === nVoor + 2, 'hetzelfde bestand nog eens lezen is idempotent: alle vier profielen ongewijzigd, Joris blijft overgeslagen, niets dubbel');
  // 5. een bestand zonder naamkolom naast een goed bestand: in fouten en LAATSTE_TALENTIMPORT schuift niet op; alleen zo'n bestand = de fout zelf
  var slecht = map.createFile(ctx.Utilities.newBlob('Accountnummer;E-mail\nX1;a@b.example', 'text/csv', 'xps-zonder-naam.csv'));
  ctx.P.setProperty('LAATSTE_TALENTIMPORT', '');
  var deels = roep(IRIS, 'apiTalentImport');
  eis(deels.bestanden === 1 && deels.fouten.length === 1 && deels.fouten[0].bestand === 'xps-zonder-naam.csv' && /geen naamkolom/.test(deels.fouten[0].melding) && !ctx.P.getProperty('LAATSTE_TALENTIMPORT'), 'een bestand zonder naamkolom staat in fouten; de rest wordt gelezen en LAATSTE_TALENTIMPORT schuift niet op');
  acc.setTrashed(true); urenB.setTrashed(true);
  eis(/^xps-zonder-naam\.csv: Dit bestand heeft geen naamkolom/.test(faalt(IRIS, 'apiTalentImport')), 'alleen zo\'n bestand in de map geeft de fout zelf');
  slecht.setTrashed(true); ctx.P.setProperty('LAATSTE_TALENTIMPORT', '');
  eis(roep(IRIS, 'apiTalentImport').bestanden === 0, 'een lege map: nul bestanden, geen fout');
  // 6. kandidaten zonder talentId met hetzelfde e-mailadres krijgen het nieuwe profiel
  ctx.schrijf('Kandidaten', { id: 'c77-koppel', vacatureId: 'v3', trajectId: 't4', naam: 'Kees Koppel', email: 'kees.koppel@mail.example', status: 'voorgesteld' });
  var kk = map.createFile(ctx.Utilities.newBlob('Naam;E-mail\nKees Koppel;kees.koppel@mail.example', 'text/csv', 'xps-accounts-koppel.csv'));
  ctx.P.setProperty('LAATSTE_TALENTIMPORT', '');  // de eigenschap heeft minuutprecisie: een bestand uit dezelfde minuut zou anders overgeslagen worden (zoals bij de uren)
  roep(IRIS, 'apiTalentImport'); var kees = ctx.lees('Talenten').filter(function (t) { return t.email === 'kees.koppel@mail.example'; })[0];
  eis(kees && ctx.vind('Kandidaten', 'c77-koppel').talentId === kees.id, 'een nieuw profiel koppelt kandidaatrijen met hetzelfde e-mailadres (koppelKandidaten)');
  kk.setTrashed(true);
  // 7. R3: een aanvulling op een bestaand profiel krijgt één tijdlijnregel met alleen de veldnamen
  ctx.schrijf('Talenten', { id: 'tl77aanvul', voornaam: 'Aanvul', achternaam: 'Persoon', status: 'gescreend', toestemmingDatum: V });
  var av = map.createFile(ctx.Utilities.newBlob('Accountnummer;Naam;E-mail\nX7700;Aanvul Persoon;aanvul.persoon@mail.example', 'text/csv', 'xps-accounts-aanvul.csv'));
  ctx.P.setProperty('LAATSTE_TALENTIMPORT', '');
  var a3 = roep(IRIS, 'apiTalentImport'), tla = ctx.vind('Talenten', 'tl77aanvul'), acts3 = ctx.lees('Activiteiten').filter(function (a) { return a.talentId === 'tl77aanvul' && a.bron === 'xps'; });
  eis(a3.bijgewerkt === 1 && a3.nieuw === 0 && tla.xpsId === 'X7700' && tla.email === 'aanvul.persoon@mail.example' && acts3.length === 1 && acts3[0].onderwerp === 'Aangevuld uit de XPS-accountexport: xpsId, email' && !acts3[0].tekst, 'R3: aanvulling op een bestaand profiel: één tijdlijnregel met alleen de veldnamen (geen waarden)');
  av.setTrashed(true);
  // 8. R4: een accountexport in de map geeft bij de urenimport geen fout en nul gelezen; LAATSTE_URENIMPORT schuift gewoon op
  var ac4 = map.createFile(ctx.Utilities.newBlob(fs.readFileSync(path.join(R, 'test/voorbeelden/xps_accounts.csv'), 'utf8'), 'text/csv', 'xps-accounts-bij-uren.csv'));
  ctx.P.setProperty('LAATSTE_URENIMPORT', '');
  var u4 = roep(IRIS, 'apiTalentUrenImport');
  eis(u4.accountBestanden.join() === 'xps-accounts-bij-uren.csv' && u4.gelezen === 0 && u4.bestanden === 0 && u4.fouten.length === 0 && u4.weekregels === 0 && !!ctx.P.getProperty('LAATSTE_URENIMPORT'), 'R4: de urenimport slaat een accountexport over (accountBestanden), zonder fout en met nul gelezen regels; LAATSTE_URENIMPORT schuift op');
  ac4.setTrashed(true);
  // 9. B2: na anonimiseren komt het profiel bij een volgende import niet terug (onderdrukkingslijst met hashes; nooit als persoonsgegeven in de app of de inzage-export)
  var tl1v = ctx.vind('Talenten', 'tl1'), e1 = tl1v.email, x1 = tl1v.xpsId, p1 = tl1v.telefoon;
  roep(SOPHIE, 'apiTalentAnonimiseer', 'tl1');
  var na1 = ctx.vind('Talenten', 'tl1'), vg = ctx.veldenUit(na1.velden).vergeten, j1 = JSON.stringify(na1);
  eis(na1.status === 'uitgeschreven' && !na1.email && !na1.xpsId && Array.isArray(vg) && vg.length === 3 && vg.every(function (h) { return /^[0-9a-f]{64}$/.test(h); }) && vg.indexOf(ctx.onderdrukHash(ctx.klein(e1))) >= 0 && vg.indexOf(ctx.onderdrukHash(ctx.klein(x1))) >= 0 && vg.indexOf(ctx.onderdrukHash(ctx.telefoonIn(p1))) >= 0 && j1.indexOf(e1) < 0 && j1.indexOf(x1) < 0, 'B2: anonimiseren bewaart sha-256-hashes van e-mail, accountnummer en telefoon in velden.vergeten; de gegevens zelf zijn weg');
  var TAL2 = ctx.lees('Talenten'), b2e = ctx.talentUitRijen(lijst([['Naam', 'E-mail'], ['Eva Terug', e1.toUpperCase()]]), TAL2, { vandaag: V, functies: FUN }), b2x = ctx.talentUitRijen(lijst([['Accountnummer', 'Naam', 'Postcode'], [x1, 'Eva Anders', '1234 AB']]), TAL2, { vandaag: V, functies: FUN }), b2t = ctx.talentUitRijen(lijst([['Naam', 'Telefoon'], ['Eva Bel', p1]]), TAL2, { vandaag: V, functies: FUN });
  eis(b2e.nieuw.length === 0 && b2e.overgeslagen.uitgeschreven === 1 && b2e.bijgewerkt.length === 0 && b2x.nieuw.length === 0 && b2x.overgeslagen.uitgeschreven === 1 && b2t.nieuw.length === 0 && b2t.overgeslagen.uitgeschreven === 1, 'B2: een export met hetzelfde e-mailadres, accountnummer of telefoonnummer geeft 0 nieuw en overgeslagen.uitgeschreven 1');
  var exp2 = roep(SOPHIE, 'apiTalentExport', 'tl1'), tal2 = roep(SOPHIE, 'apiTalent', 'tl1').talent;
  eis(exp2.tekst.indexOf(vg[0]) < 0 && exp2.tekst.indexOf('vergeten') < 0 && !('vergeten' in (tal2.velden || {})), 'B2: de inzage-export en apiTalent tonen de onderdrukkingslijst niet');
  roep(SOPHIE, 'apiTalentOpslaan', { id: 'tl1', velden: { iets: 'anders' } });
  var vg2 = ctx.veldenUit(ctx.vind('Talenten', 'tl1').velden);
  eis(vg2.iets === 'anders' && Array.isArray(vg2.vergeten) && vg2.vergeten.length === 3, 'B2: opslaan van het profiel (zonder de lijst) wist de onderdrukkingslijst niet (niet omkeerbaar)');
  ctx.verwijderRijen('Talenten', function (t) { return t.id === 'tl77aanvul'; });
} catch (e) { eis(false, 'v7.7 talentimport: onverwachte fout ' + e.message); } })();

/* ---- v7.7: termijnen uit Exact — een factuur zonder termijn krijgt een termijn onder het ene lopende project van de school (vrij veld debiteurnummer of naam), met reden als dat niet kan ---- */
(function () { try {
  var dd = function (s) { return s.split('-').reverse().join('-'); }, vandaag = plusDagen(0), P = plusDagen(-1), T = ctx.perId(ctx.lees('Trajecten')), t3 = T.t3, t2 = T.t2, t9 = T.t9;
  var inT3 = ctx.plusDagenVan(ctx.datumIn(t3.start), 10), inT2 = ctx.datumIn(t2.start) < plusDagen(-20) ? plusDagen(-20) : ctx.plusDagenVan(ctx.datumIn(t2.start), 1), inBeide = ctx.plusDagenVan(ctx.datumIn(t9.start), 3);
  ctx.schrijf('Scholen', { id: 's3', velden: { debiteurnummer: '10003' } });  // v7.7: vrij veld op de school
  ctx.schrijf('Facturen', { id: 'f77nul', trajectId: 't3', omschrijving: 'Nul-test', bedrag: 100, datum: inT3, status: 'verzonden', factuurnummer: 123, verzonden: inT3, door: 'Sophie de Graaf' });  // v7.7 (R9): factuurnummer als getal in de Sheet
  var KOPF = 'Datum;Factuurnummer;Betreft;Debiteur;Debiteurnummer;Totaal;Open';
  var r = function (dag, nr, betreft, deb, debnr, tot, open) { return [dd(dag), nr, betreft, deb, debnr, tot, open].join(';'); };
  var csv = KOPF + '\n' + [r(inT2, '77700001', 'Huiswerkbegeleiding periode 1', 'Kompas College', '10002', '1234,00', '0,00'),   // één school, één lopend project (t2; t9 start later) → aangemaakt, betaald (Open 0)
    r(inT3, '77700002', '', 'Scholengroep Duinrand B.V.', '10003', '500,00', '500,00'),                                        // school via het vrije veld debiteurnummer (de naam wijkt af); project t3 (periode) → aangemaakt, verzonden
    r(inBeide, '77700003', 'Iets', 'Kompas College', '10002', '300,00', '300,00'),                                             // t2 en t9 lopen allebei → meer projecten
    r(inT2, '77700004', new Array(100).join('B') + ' lange betreft', 'Lyceum Valkenoord', '10006', '300,00', '300,00'),     // t5 (bezig) en t10 (onduidelijk, telt niet mee: R8) → aangemaakt onder t5; Betreft wordt afgekapt op 80 (R2)
    r(inT2, '77700005', 'Iets', 'Waterpoort College', '10007', '300,00', '300,00'),                                            // geen project
    r(inT2, '77700006', 'Iets', 'Onbekende School', '10099', '300,00', '300,00'),                                              // geen school
    r(inT2, '77700007', 'Credit', 'Kompas College', '10002', '-50,00', '0,00'),                                               // creditnota zonder origineel
    r(inT3, '000123', 'Nul-test', 'Scholengroep Duinrand B.V.', '10003', '100,00', '100,00')].join('\n');                     // v7.7 (R9): '000123' in Exact = 123 in de Sheet → gezien
  var proef = roep(SOPHIE, 'apiExactImport', csv, { peildatum: P }), ae = function (c, n) { return c.alleenExact.filter(function (x) { return x.nummer === n; })[0]; };
  eis(proef.aangemaakt.length === 0 && proef.alleenExact.length === 7 && ae(proef, '77700001').reden === '' && ae(proef, '77700001').school === 'Kompas College' && ae(proef, '77700001').project === 'Huiswerkbegeleiding' && ae(proef, '77700002').reden === '' && ae(proef, '77700002').school === 'Scholengroep Duinrand' && ae(proef, '77700002').project === 'Examentraining', 'controleren: de reden is altijd uitgerekend; een factuur met één school en één lopend project krijgt school en project (ook via het vrije veld debiteurnummer bij een afwijkende naam)');
  eis(ae(proef, '77700003').reden === 'meer projecten' && ae(proef, '77700004').reden === '' && ae(proef, '77700004').project === 'Studentdocent Duits' && ae(proef, '77700005').reden === 'geen project' && ae(proef, '77700006').reden === 'geen school' && ae(proef, '77700007').reden === 'creditnota', 'controleren: meer projecten, geen project, geen school en creditnota als reden; een project met status onduidelijk telt niet mee (R8), dus Lyceum Valkenoord heeft één kandidaat (t5)');
  eis(proef.gekoppeld === 1 && !ae(proef, '000123') && proef.afwijkend.length === 0 && !proef.alleenAthena.some(function (x) { return x.nummer === '123'; }), 'R9: factuurnummer "000123" in Exact is gezien als het getal 123 in de Sheet (nrSleutel aan beide kanten)');
  var nF = ctx.lees('Facturen').length;
  var zonder = roep(SOPHIE, 'apiExactImport', csv, { peildatum: P, toepassen: true });
  eis(zonder.aangemaakt.length === 0 && ctx.lees('Facturen').length === nF && zonder.alleenExact.length === 7, 'toepassen zonder aanmaken: alleen redenen, geen termijnen');
  eis(ctx.nrSleutel('000123') === '123' && ctx.nrSleutel(123) === '123' && ctx.nrSleutel(' F0099 ') === 'f0099' && ctx.nrSleutel('0') === '0' && ctx.TEKST_KOLOMMEN.factuurnummer === 1, 'R9: nrSleutel haalt voorloopnullen en hoofdletters weg; factuurnummer staat in TEKST_KOLOMMEN');
  var alleen = roep(SOPHIE, 'apiExactImport', csv, { peildatum: P, aanmaken: true });
  eis(alleen.aangemaakt.length === 0 && ctx.lees('Facturen').length === nF, 'aanmaken zonder toepassen doet niets (alleen samen met toepassen)');
  eis(/management/i.test(faalt(IRIS, 'apiExactImport', csv, { peildatum: P, toepassen: true, aanmaken: true })) && ctx.lees('Facturen').length === nF, 'aanmaken: alleen management');
  var toe = roep(SOPHIE, 'apiExactImport', csv, { peildatum: P, toepassen: true, aanmaken: true }), F = ctx.lees('Facturen'), f1 = F.filter(function (f) { return f.factuurnummer === '77700001'; })[0], f2 = F.filter(function (f) { return f.factuurnummer === '77700002'; })[0];
  var f4 = F.filter(function (f) { return f.factuurnummer === '77700004'; })[0];
  eis(toe.aangemaakt.length === 3 && toe.aangemaakt[0].nummer === '77700001' && toe.aangemaakt[0].school === 'Kompas College' && toe.aangemaakt[0].project === 'Huiswerkbegeleiding' && toe.aangemaakt[0].bedrag === 123400 && toe.aangemaakt[0].datum === inT2 && toe.alleenExact.length === 4 && !ae(toe, '77700001') && ae(toe, '77700003').reden === 'meer projecten', 'toepassen met aanmaken: drie termijnen aangemaakt (school, project, bedrag in centen, datum); de rest blijft onder Alleen in Exact met reden');
  eis(f4 && f4.trajectId === 't5' && f4.omschrijving.length === 80 && f4.omschrijving === (new Array(100).join('B') + ' lange betreft').slice(0, 80), 'R2/R8: de termijn onder t5 (onduidelijk telt niet) met Betreft afgekapt op 80 tekens');
  eis(f1 && f1.trajectId === 't2' && f1.omschrijving === 'Huiswerkbegeleiding periode 1' && Number(f1.bedrag) === 1234 && ctx.datumIn(f1.datum) === inT2 && ctx.datumIn(f1.verzonden) === inT2 && f1.status === 'betaald' && ctx.datumIn(f1.betaald) === P && /Exact-afstemming van /.test(f1.bijzonderheden) && f1.door === 'Sophie de Graaf' && !!f1.aangemaakt, 'de termijn: project t2, omschrijving uit Betreft, bedrag in euro\'s, datum en verzonden = factuurdatum, betaald op de peildatum (Open 0), bijzonderheden, door, aangemaakt');
  eis(f2 && f2.trajectId === 't3' && f2.omschrijving === 'Factuur 77700002' && f2.status === 'verzonden' && !f2.betaald && Number(f2.bedrag) === 500, 'zonder Betreft heet de termijn "Factuur <nummer>"; Open = bedrag → verzonden, niet betaald');
  eis(ctx.lees('Activiteiten').filter(function (a) { return a.trajectId === 't2' && a.bron === 'exact' && /77700001/.test(a.onderwerp); }).length === 1 && ctx.lees('Facturen').length === nF + 3, 'per project een tijdlijnregel met de aangemaakte nummers');
  var nog = roep(SOPHIE, 'apiExactImport', csv, { peildatum: vandaag, toepassen: true, aanmaken: true });
  eis(nog.aangemaakt.length === 0 && nog.gekoppeld === 4 && ctx.lees('Facturen').length === nF + 3 && ctx.lees('Facturen').filter(function (f) { return f.factuurnummer === '77700001'; }).length === 1, 'tweede run: de nummers staan nu op een termijn (gezien, ook 000123 = 123), niets dubbel');
  // R10: in de school- en totaalsom telt "nog te factureren" per project op 0 geklemd (meerwerk telt niet als nog te factureren); per project blijft de ruwe waarde
  var fin = roep(SOPHIE, 'apiFinancien', ctx.huidigSchooljaar()), somS = 0, negatief = 0, klemFout = [];
  fin.scholen.forEach(function (sc) { var som = 0; sc.projecten.forEach(function (p) { if (p.nogTeFactureren < 0) negatief++; som += Math.max(0, p.nogTeFactureren); }); if (sc.nogTeFactureren !== som) klemFout.push(sc.naam); somS += sc.nogTeFactureren; });
  eis(negatief >= 1 && !klemFout.length && fin.totalen.nogTeFactureren === somS && fin.totalen.nogTeFactureren >= 0, 'R10: minstens één project boven zijn contract (negatief), elke schoolsom = som van de positieve waarden en het totaal = som van de scholen' + (klemFout.length ? ': ' + klemFout.join(', ') : ''));
  // invarianten van Financiën blijven kloppen, ook met termijnen boven het contract (nog te factureren wordt dan negatief = meerwerk, met het bestaande signaal)
  ctx.GEBRUIKER = null; ctx._LEES = {};
  var D = ctx.financienData(), fout = [], t2F = ctx.financienProject(ctx.vind('Trajecten', 't2'), D.fac.t2, D.uren.t2 || [], 30);
  ctx.lees('Trajecten').forEach(function (t) {
    var Fp = ctx.financienProject(t, D.fac[t.id] || [], D.uren[t.id] || [], ctx.termijnDagenVan(t, D)), som = Fp.ongepland;
    Object.keys(Fp.per.prognose).forEach(function (m) { som += Fp.per.prognose[m]; });
    if (som !== Fp.contract || Fp.gefactureerd + Fp.nogTeFactureren !== Fp.contract || Fp.openstaand !== Fp.gefactureerd - Fp.ontvangen) fout.push(t.id);
  });
  eis(!fout.length && t2F.nogTeFactureren < 0 && t2F.signalen.some(function (s) { return /hoger dan het contract/.test(s); }), 'invarianten: som prognose = contract en gefactureerd + nog te factureren = contract blijven gelden; t2 zit boven zijn contract (nog te factureren negatief) met het signaal "hoger dan het contract"' + (fout.length ? ': ' + fout.join(', ') : ''));
  ctx.verwijderRijen('Facturen', function (f) { return /^7770000/.test(String(f.factuurnummer)) || f.id === 'f77nul'; }); ctx.schrijf('Scholen', { id: 's3', velden: '' });
} catch (e) { eis(false, 'v7.7 termijnen uit Exact: onverwachte fout ' + e.message); } })();

/* ---- v7.9: sturing, pakket 1 (backend-kern). Elk blok bewaart de stand van de Sheet-in-geheugen en zet hem aan het eind terug, zodat de slotcontroles
   en latere blokken dezelfde seed zien. Alle namen, scholen en bedragen zijn verzonnen (demo-seed). ---- */
var NOOR = 'demo-noor', CtxDate79 = vm.runInContext('Date', ctx);
function standBewaren() {
  var b = {}, p = {};
  Object.keys(ctx._demoBladen).forEach(function (n) { b[n] = ctx._demoBladen[n].rijen.map(function (r) { return r.slice(); }); });
  Object.keys(ctx._demoProps).forEach(function (k) { p[k] = ctx._demoProps[k]; });
  return { b: b, p: p };
}
function standTerug(st) {
  Object.keys(ctx._demoBladen).forEach(function (n) { if (!st.b[n]) delete ctx._demoBladen[n]; });
  Object.keys(st.b).forEach(function (n) { var bl = ctx._demoBladen[n] || ctx._demoSS.insertSheet(n), r = bl.rijen; r.length = 0; st.b[n].forEach(function (x) { r.push(x.slice()); }); });
  Object.keys(ctx._demoProps).forEach(function (k) { if (!(k in st.p)) delete ctx._demoProps[k]; });
  Object.keys(st.p).forEach(function (k) { ctx._demoProps[k] = st.p[k]; });
  ctx._LEES = {}; ctx._BLAD = {}; ctx.KOP_GECONTROLEERD = {}; ctx.GEBRUIKER = null; ctx.KLANT_VERSIE = null;
}
function wisselsVan(kansId) { return ctx.lees('Fasewissels').filter(function (w) { return String(w.kansId) === String(kansId); }); }
function wisselRij(id) { return ctx.lees('Fasewissels').filter(function (w) { return String(w.id) === String(id); })[0] || null; }
function aantalWissels() { return ctx.lees('Fasewissels').length; }
// teller op schrijfVeel('Fasewissels', …) (R2): Code.gs zoekt de functie bij elke aanroep op de globale scope op, dus een wrapper in de context telt mee
function telSchrijfVeel(fn) {
  var echt = ctx.schrijfVeel, n = 0;
  ctx.schrijfVeel = function (naam, lijst) { if (naam === 'Fasewissels') n++; return echt(naam, lijst); };
  try { var uit = fn(); return { n: n, uit: uit }; } finally { ctx.schrijfVeel = echt; }
}
function sjNu() { return ctx.huidigSchooljaar(); }
standTerug(SEED79);
function kalDag(n, u, mi) { var x = new CtxDate79(); return new CtxDate79(x.getFullYear(), x.getMonth(), x.getDate() + n, u || 12, mi || 0); }
function od(cw, akk, extra) { var o = { aantal: 1, rol: 'Onderwijsondersteuner', startdatum: plusDagen(20), contractwaarde: cw, akkoorddatum: akk }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
function consultancyTotaal(van, tot) { ctx.GEBRUIKER = null; ctx._LEES = {}; return ctx.teamCijfers('consultancy', van, tot, ctx.rapportData()); }
function tVan(c, m) { return c.totaal[m] ? c.totaal[m].t : 0; }
var GEWICHT_OK = { onderbouwing: 'Rooktest: verzonnen gewicht', besluitdatum: plusDagen(0) };  // v7.9 (pakket 2, N6): een gewijzigd fasegewicht vraagt een onderbouwing en een besluitdatum

/* ---- v7.9: fasewissels — één schrijfpunt ---- */
(function () {
  var st = standBewaren();
  try {
    // seed: elke kans minstens één wissel, elke gesloten kans een sluitende wissel met datum
    var kansenSeed = ctx.lees('Kansen');
    eis(kansenSeed.every(function (k) { return wisselsVan(k.id).length >= 1; }) && kansenSeed.filter(function (k) { return k.fase === 'gewonnen' || k.fase === 'verloren'; }).every(function (k) { var l = ctx.laatsteSluitendeWissel(k.id, k.fase); return l && l.werkelijkeDatum === k.gesloten; }),
      'v7.9 seed: elke kans heeft een wissel; elke gesloten kans een sluitende wissel op Kansen.gesloten');
    // detail, slepen, toets en bulk: elk precies één wissel met die bron; de werkelijke datum uit de app
    var v0 = wisselsVan('k16').length, r1 = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'gesprek' }, wissel: { bron: 'detail', datum: plusDagen(-1) } });
    var na1 = wisselsVan('k16');
    eis(na1.length === v0 + 1 && r1.fasewissel && r1.fasewissel.van === 'gesprek' && r1.fasewissel.naar === 'voorstel' && r1.fasewissel.werkelijkeDatum === plusDagen(-1) && r1.fasewissel.naarRol === 'voorstel' &&
      wisselRij(r1.fasewissel.id).bron === 'detail' && wisselRij(r1.fasewissel.id).zekerheid === 'vastgelegd' && wisselRij(r1.fasewissel.id).vanRol === 'ap' && wisselRij(r1.fasewissel.id).eigenaar === 'Lars Visser' && wisselRij(r1.fasewissel.id).rolBron === 'mijlpaal',
      'pad detail: één wissel (gesprek → voorstel) met de werkelijke datum uit de app, zekerheid vastgelegd, rollen ap → voorstel en de eigenaar van de kans');
    ['slepen', 'toets', 'bulk'].forEach(function (b, i) {
      var naar = i % 2 === 0 ? 'onderhandeling' : 'voorstel', van = i % 2 === 0 ? 'voorstel' : 'onderhandeling', voor = wisselsVan('k16').length;
      var r = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: naar, _oud: { fase: van }, wissel: { bron: b } });
      eis(wisselsVan('k16').length === voor + 1 && wisselRij(r.fasewissel.id).bron === b && r.fasewissel.werkelijkeDatum === plusDagen(0), 'pad ' + b + ': één wissel met bron ' + b + ' en vandaag als datum');
    });
    // aanmaken in een latere fase: van leeg, label direct
    var nw = roep(LARS, 'apiKansOpslaan', { naam: 'Rooktest direct in voorstel', schoolId: 's1', fase: 'voorstel', wissel: { bron: 'slepen', datum: plusDagen(-2) } });
    eis(nw.fasewissel && nw.fasewissel.van === '' && nw.fasewissel.label === 'direct' && wisselRij(nw.fasewissel.id).bron === 'aanmaken' && nw.fasewissel.werkelijkeDatum === plusDagen(-2) && wisselsVan(nw.kans.id).length === 1,
      'pad aanmaken: van leeg, label direct, bron aanmaken (ook als de app een andere bron stuurt)');
    // review C1: een akkoorddatum vóór de vorige mijlpaal van deze kans (bulk, vandaag) wordt geweigerd; de kans blijft in onderhandeling
    eis(/vóór de vorige mijlpaal/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'gewonnen', _oud: { fase: 'onderhandeling' }, overdracht: od(31500, plusDagen(-3)), wissel: { bron: 'detail' } })) && ctx.vind('Kansen', 'k16').fase === 'onderhandeling',
      'review C1: een akkoorddatum vóór de vorige mijlpaal van de kans wordt geweigerd ("De datum ligt vóór de vorige mijlpaal van deze kans.")');
    // winformulier: datum = akkoorddatum, waarde = getekende waarde, Kansen.gesloten = akkoorddatum
    var won = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'gewonnen', _oud: { fase: 'onderhandeling' }, overdracht: od(31500, plusDagen(0)), wissel: { bron: 'detail' } });
    var wW = wisselRij(won.fasewissel.id);
    eis(wW.bron === 'winformulier' && wW.werkelijkeDatum === plusDagen(0) && Number(wW.waarde) === 31500 && ctx.vind('Kansen', 'k16').gesloten === plusDagen(0) && Number(ctx.vind('Kansen', 'k16').waarde) === 31500 && wW.naarRol === 'deal',
      'pad winformulier: bron winformulier, werkelijke datum en Kansen.gesloten = akkoorddatum, waarde = getekende waarde');
    // verloren: reden uit de lijst op de wissel, datum uit het venster
    var lost = roep(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'verloren', _oud: { fase: 'voorstel' }, verliesReden: 'Te duur', verliesToelichting: 'Begroting is dit jaar krap', wissel: { datum: plusDagen(-2) } });
    var wL = wisselRij(lost.fasewissel.id);
    eis(wL.bron === 'verloren' && wL.reden === 'te duur' && wL.werkelijkeDatum === plusDagen(-2) && ctx.vind('Kansen', 'k10').gesloten === plusDagen(-2) && ctx.vind('Kansen', 'k10').verliesReden === 'te duur' && ctx.vind('Kansen', 'k10').verliesToelichting === 'Begroting is dit jaar krap',
      'pad verloren: bron verloren, reden (klein) uit de lijst op kans en wissel, toelichting, gesloten = de gekozen datum');
    // assistent: via de interne kern met bron assistent; gewonnen en verloren vooraf geweigerd
    var vA = aantalWissels(), as = roep(LARS, 'apiBreinUitvoeren', { soort: 'wijzig_kans', invoer: { kansId: nw.kans.id, fase: 'onderhandeling', werkelijkeDatum: plusDagen(-1) } });
    var wA = ctx.lees('Fasewissels').slice(vA)[0];
    eis(/bijgewerkt/.test(as.melding) && aantalWissels() === vA + 1 && wA.bron === 'assistent' && wA.werkelijkeDatum === plusDagen(-1) && wA.naar === 'onderhandeling', 'pad assistent: één wissel met bron assistent en de werkelijke datum uit de actie');
    eis(/winformulier of verlorenvenster/.test(faalt(LARS, 'apiBreinUitvoeren', { soort: 'wijzig_kans', invoer: { kansId: nw.kans.id, fase: 'gewonnen' } })) && aantalWissels() === vA + 1, 'pad assistent: gewonnen wordt vooraf geweigerd (geen wissel)');
    var code = fs.readFileSync(process.env.CODE_GS || path.join(R, 'backend/Code.gs'), 'utf8'), brein = /function apiBreinUitvoeren\([\s\S]*?\n}\n/.exec(code);
    eis(brein && /kansOpslaan\(w, \{ bron: 'assistent'/.test(brein[0]) && !/apiKansOpslaan\(/.test(brein[0]), 'apiBreinUitvoeren roept de kern kansOpslaan( aan, niet apiKansOpslaan(');
    // R1: een derde argument van de client (intern) wordt genegeerd; een interne bron in wissel.bron wordt detail
    var r3 = roep(LARS, 'apiKansOpslaan', { id: nw.kans.id, fase: 'voorstel', _oud: { fase: 'onderhandeling' }, wissel: { bron: 'slepen' } }, false, { bron: 'reconstructie', datum: plusDagen(-30) });
    var r4 = roep(LARS, 'apiKansOpslaan', { id: nw.kans.id, fase: 'onderhandeling', _oud: { fase: 'voorstel' }, wissel: { bron: 'import' } });
    eis(wisselRij(r3.fasewissel.id).bron === 'slepen' && r3.fasewissel.werkelijkeDatum === plusDagen(0) && wisselRij(r4.fasewissel.id).bron === 'detail', 'R1: apiKansOpslaan(obj, false, { bron: reconstructie }) geeft bron slepen (niet de interne bron); wissel.bron import wordt detail');
    // hernoemen: per verhuisde kans één wissel met bron hernoemd, die nergens telt; R2: met 200 kansen precies één schrijfVeel op Fasewissels
    var veel = []; for (var i = 0; i < 200; i++) veel.push({ id: 'rk-h' + i, naam: 'Hernoemtest ' + i, traject: 'Hernoemtest', school: 'Esdoorn Lyceum', schoolId: 's1', fase: 'gesprek', pipeline: 'Scholen', eigenaar: 'Lars Visser', waarde: 1000, aangemaakt: plusDagen(-5) + ' 09:00' });
    ctx.schrijfVeel('Kansen', veel);
    var inGesprek = ctx.lees('Kansen').filter(function (k) { return k.fase === 'gesprek'; }).length, tellVoor = ctx.tellendeWissels().length;
    var MS = ctx.mijlpalen().map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal === 'gesprek' ? 'kennismaking' : m.mijlpaal, kans: m.kans, dagenNorm: m.dagenNorm, oud: { pipeline: m.pipeline, mijlpaal: m.mijlpaal } }; });
    ctx._LEES = {};
    var hn = telSchrijfVeel(function () { return roep(SOPHIE, 'apiMijlpalenOpslaan', MS); });
    var hern = ctx.lees('Fasewissels').filter(function (w) { return w.bron === 'hernoemd'; });
    eis(hn.n === 1 && hern.length === inGesprek && hern.every(function (w) { return w.van === 'gesprek' && w.naar === 'kennismaking'; }) && ctx.tellendeWissels().length === tellVoor && ctx.lees('Kansen').filter(function (k) { return k.fase === 'kennismaking'; }).length === inGesprek,
      'pad hernoemd: één wissel per verhuisde kans (' + inGesprek + ', waarvan 200 verzonnen), die nergens telt; R2: precies één schrijfVeel op Fasewissels (' + hn.n + ')');
    eis(hn.uit.filter(function (m) { return m.mijlpaal === 'kennismaking'; })[0].rol === 'ap', 'R13: hernoemen zonder veld rol (oudere app) houdt de rol van de mijlpaal (gesprek → kennismaking blijft ap)');
    roep(SOPHIE, 'apiMijlpalenOpslaan', MS.map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.oud.mijlpaal, kans: m.kans, dagenNorm: m.dagenNorm, oud: { pipeline: m.pipeline, mijlpaal: m.mijlpaal } }; }));
    // import: R2 met 200 rijen één schrijfVeel; gewonnen met gesloten telt als deal (regressie: een sluiting zonder wissel gaf geen event)
    var imp = []; for (var j = 0; j < 200; j++) imp.push({ id: 'rk-i' + j, naam: 'Importkans ' + j, traject: 'Importkans', school: 'Kompas College', schoolId: 's2', fase: j === 0 ? 'gewonnen' : 'lead', gesloten: j === 0 ? plusDagen(-4) : '', eigenaar: 'Noor Hendriks', waarde: 5000 });
    var im = telSchrijfVeel(function () { return roep(SOPHIE, 'apiImporteer', 'kansen', imp); });
    var iw = wisselsVan('rk-i0')[0];
    eis(im.n === 1 && im.uit.fasewissels === 200 && iw && iw.bron === 'import' && iw.werkelijkeDatum === plusDagen(-4) && iw.zekerheid === 'laag' && ctx.dealWissels().some(function (w) { return w.kansId === 'rk-i0'; }) && wisselsVan('rk-i5')[0].werkelijkeDatum === '' && wisselsVan('rk-i5')[0].zekerheid === '',
      'pad import: 200 wissels in één schrijfVeel (R2); gewonnen met gesloten → bron import, zekerheid laag, telt als deal; zonder datum geen zekerheid');
    eis(roep(SOPHIE, 'apiImporteer', 'kansen', imp).fasewissels === 0, 'pad import: een herhaalde import met dezelfde fase schrijft geen wissel');
    // capsule via een nagebootste capsule(): id per (capsuleId, naar)
    var echtCapsule = ctx.capsule;
    ctx._demoProps.CAPSULE_MIJLPALEN = JSON.stringify({ 501: { naam: 'Voorstel', complete: false, kans: 50, pipeline: 'Scholen' }, 502: { naam: 'Won', complete: true, kans: 100, pipeline: 'Scholen' } });
    ctx.capsule = function (pad) { return { data: { opportunities: [{ id: 9001, name: 'Capsulekans', party: null, milestone: { id: 501 }, value: { amount: 4000 }, owner: { name: 'Lars Visser' }, createdAt: plusDagen(-40) + 'T09:00:00Z' }] }, meer: false }; };
    ctx.GEBRUIKER = null; ctx._LEES = {};
    ctx.capsulePagina('kansen', 1);
    var cw = wisselsVan('cap-k9001');
    eis(cw.length === 1 && cw[0].id === 'cap-f9001-voorstel' && cw[0].bron === 'capsule' && cw[0].rolBron === 'volgorde' && cw[0].van === '' && cw[0].werkelijkeDatum === '', 'pad capsule: één wissel met id cap-f<capsuleId>-<naar>, rolBron volgorde, zonder datum (open kans)');
    // review C10: een herrun waarin de kans naar Won gaat en daarna terug naar voorstel: elke fasewijziging een wissel (terug krijgt een volgnummer)
    var capMijl = 502;
    ctx.capsule = function (pad) { return { data: { opportunities: [{ id: 9001, name: 'Capsulekans', party: null, milestone: { id: capMijl }, value: { amount: 4000 }, owner: { name: 'Lars Visser' }, createdAt: plusDagen(-40) + 'T09:00:00Z' }] }, meer: false }; };
    ctx._LEES = {}; ctx.capsulePagina('kansen', 1); capMijl = 501; ctx._LEES = {}; ctx.capsulePagina('kansen', 1); ctx._LEES = {}; ctx.capsulePagina('kansen', 1);
    var cw2 = wisselsVan('cap-k9001').map(function (w) { return w.id + ':' + w.van + '>' + w.naar; }).sort();
    eis(cw2.join() === 'cap-f9001-gewonnen:voorstel>gewonnen,cap-f9001-voorstel-2:gewonnen>voorstel,cap-f9001-voorstel:>voorstel' && ctx.vind('Kansen', 'cap-k9001').fase === 'voorstel',
      'review C10: terug naar een fase die al een capsule-wissel had geeft een wissel met volgnummer (cap-f<id>-<fase>-2); een herrun zonder wijziging niets');
    ctx.capsule = echtCapsule;
    // tijdlijn via crmInrichten: een oude regel wordt één keer een wissel
    ctx.schrijf('Activiteiten', { id: 'act-rk-tl', type: 'fase', datum: plusDagen(-3) + ' 14:00', door: 'Yara El Amrani', schoolId: 's6', kansId: 'k12', onderwerp: 'Mijlpaal: lead → gesprek', bron: 'app', aangemaakt: plusDagen(-3) + ' 14:00' });
    ctx._LEES = {}; ctx.crmInrichten();
    var tl = wisselRij('tl-act-rk-tl');
    eis(tl && tl.bron === 'tijdlijn' && tl.zekerheid === 'laag' && tl.werkelijkeDatum === plusDagen(-3) && tl.van === 'lead' && tl.naar === 'gesprek', 'pad tijdlijn (crmInrichten): een oude tijdlijnregel wordt één wissel met bron tijdlijn en zekerheid laag');
    var nTl = aantalWissels(); ctx.crmInrichten();
    eis(aantalWissels() === nTl && ctx.apiMigratieV79('status').tijdlijn.teOmzetten === 0, 'pad tijdlijn: een tweede run en de regels die kansOpslaan naast zijn wissel schrijft, geven geen dubbele wissel');
    // review C2: de regel naast een wissel heeft bron wissel; ook met een gewijzigde datum of onderwerp wordt hij nooit een tweede wissel
    eis(!!ctx._demoProps.V79_START, 'review C2: de eerste omzetting zet V79_START');
    var c2 = roep('demo-yara', 'apiKansOpslaan', { id: 'k12', fase: 'gesprek', _oud: { fase: 'lead' }, wissel: { bron: 'detail' } });
    var c2a = ctx.lees('Activiteiten').filter(function (a) { return a.kansId === 'k12' && a.onderwerp === 'Mijlpaal: lead → gesprek' && a.bron === 'wissel'; })[0];
    eis(!!c2a && /liggen vast/.test(faalt('demo-yara', 'apiActiviteitOpslaan', { id: c2a.id, datum: plusDagen(-10) + ' 10:00' })) && /liggen vast/.test(faalt('demo-yara', 'apiActiviteitOpslaan', { id: c2a.id, onderwerp: 'Mijlpaal: lead → gewonnen' })),
      'review C2: datum en onderwerp van een mijlpaalregel wijzigen wordt geweigerd (een andere datum gaat via de mijlpaal)');
    var c2n = ctx.lees('Activiteiten').filter(function (a) { return a.kansId === 'k12' && a.type === 'notitie'; })[0] || roep('demo-yara', 'apiActiviteitToevoegen', { vorm: 'notitie', kansId: 'k12', tekst: 'Rooktest' });
    eis(/bij de kans/.test(faalt('demo-yara', 'apiActiviteitOpslaan', { id: c2n.id, type: 'fase' })), 'review C2: een notitie krijgt niet het type fase');
    ctx.schrijfVeel('Activiteiten', [{ id: c2a.id, datum: plusDagen(-10) + ' 10:00', onderwerp: 'Mijlpaal: lead → gewonnen' }]);  // buiten de api om, zoals een oude app of een hand in de Sheet
    ctx.schrijf('Activiteiten', { id: 'act-rk-na', type: 'fase', datum: plusDagen(-8) + ' 10:00', door: 'Yara El Amrani', schoolId: 's6', kansId: 'k12', onderwerp: 'Mijlpaal: gesprek → voorstel', bron: 'app', aangemaakt: ctx.nu() });
    var c2w = aantalWissels(), c2t = roep(SOPHIE, 'apiMigratieV79', 'tijdlijn', { toepassen: true }); ctx.crmInrichten();
    eis(c2.fasewissel && aantalWissels() === c2w && c2t.geschreven === 0, 'review C2: regeldatum en onderwerp gewijzigd, daarna tijdlijn toepassen en crmInrichten: 0 nieuwe wissels (bron wissel en aangemaakt na V79_START)');
    // review C3: een oude regel met een datum in de toekomst laat de stap niet mislukken; hij wordt overgeslagen en apart geteld
    ctx.schrijf('Activiteiten', { id: 'act-rk-toek', type: 'fase', datum: plusDagen(3) + ' 10:00', door: 'Yara El Amrani', schoolId: 's6', kansId: 'k12', onderwerp: 'Mijlpaal: lead → gesprek', bron: 'app', aangemaakt: plusDagen(-30) + ' 10:00' });
    var c3s = roep(SOPHIE, 'apiMigratieV79', 'status').tijdlijn, c3t = roep(SOPHIE, 'apiMigratieV79', 'tijdlijn', { toepassen: true }), c3i = ctx.crmInrichten();
    eis(c3s.toekomst === 1 && c3s.teOmzetten === 0 && c3t.toekomst === 1 && c3t.geschreven === 0 && c3i.fasewissels === 0 && aantalWissels() === c2w, 'review C3: een tijdlijnregel in de toekomst wordt overgeslagen en apart geteld (status, tijdlijn en crmInrichten gooien niet)');
    eis(wisselRij('tl-act-rk-tl').zekerheid === 'laag' && roep('demo-yara', 'apiFasewisselDatum', 'tl-act-rk-tl', plusDagen(-4)).fasewissel.zekerheid === 'hoog', 'review C9: een datum die iemand bewust invult maakt zekerheid laag minstens hoog');
    // pipelinewissel (R7): andere effectieve rol = één wissel met bron detail; een pipeline zonder die mijlpaal wordt geweigerd
    roep(SOPHIE, 'apiMijlpalenOpslaan', ctx.mijlpalen().map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal, kans: m.kans, dagenNorm: m.dagenNorm, rol: m.rol }; })
      .concat([{ pipeline: 'Particulier', mijlpaal: 'lead', kans: 10, dagenNorm: 7, rol: 'lead' }, { pipeline: 'Particulier', mijlpaal: 'gesprek', kans: 50, dagenNorm: 7, rol: 'voorstel' }]), GEWICHT_OK);  // pakket 2 (N6): nieuwe gewichten vragen een onderbouwing
    var pv = wisselsVan('k8').length, pw = roep(NOOR, 'apiKansOpslaan', { id: 'k8', pipeline: 'Particulier', _oud: { pipeline: 'Scholen' } });
    var pwr = pw.fasewissel ? wisselRij(pw.fasewissel.id) : null;
    eis(wisselsVan('k8').length === pv + 1 && pwr && pwr.bron === 'detail' && pwr.van === 'gesprek' && pwr.naar === 'gesprek' && pwr.vanRol === 'ap' && pwr.naarRol === 'voorstel' && ctx.telRol(pwr) === 'voorstel',
      'R7: een andere pipeline met een andere effectieve rol geeft één wissel (bron detail, van = naar = gesprek, ap → voorstel)');
    eis(/bestaat niet in pipeline "Particulier"/.test(faalt(LARS, 'apiKansOpslaan', { id: nw.kans.id, pipeline: 'Particulier', _oud: { pipeline: 'Scholen' } })) && ctx.vind('Kansen', nw.kans.id).pipeline === 'Scholen',
      'R7: een open kans naar een pipeline zonder zijn mijlpaal wordt geweigerd met een Nederlandse melding');
    ctx.verwijderRijen('Mijlpalen', function () { return true; }); ctx.schrijfVeel('Kansen', [{ id: 'k8', pipeline: 'Scholen' }]);  // terug naar de standaardmijlpalen (één pipeline)
    // B2: gewonnen → lead → ongedaan; verloren → voorstel → ongedaan
    var her = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'lead', _oud: { fase: 'gewonnen' }, wissel: { bron: 'detail' } }), nP = ctx.lees('Trajecten').filter(function (t) { return t.kansId === 'k16'; }).length, nV = aantalWissels();
    var und = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'gewonnen', _oud: { fase: 'lead' }, wissel: { ongedaan: her.fasewissel.id } });
    var k16 = ctx.vind('Kansen', 'k16');
    eis(k16.fase === 'gewonnen' && k16.gesloten === plusDagen(0) && aantalWissels() === nV && !!wisselRij(her.fasewissel.id).ongedaan && ctx.lees('Trajecten').filter(function (t) { return t.kansId === 'k16'; }).length === nP && und.fasewissel.ongedaan === true && und.traject === null,
      'B2: gewonnen → lead → ongedaan geeft fase gewonnen met de oorspronkelijke akkoorddatum, de vlag op de wissel, geen nieuw event, geen nieuw project en geen fout over het winformulier');
    eis(ctx.lees('Activiteiten').some(function (a) { return a.kansId === 'k16' && a.onderwerp === 'Mijlpaal teruggezet: lead → gewonnen'; }), 'B2: de terugzetting staat leesbaar op de tijdlijn (telt nergens)');
    eis(!ctx.tellendeWissels().some(function (w) { return w.id === her.fasewissel.id || w.id === 'fw-k9-ongedaan'; }) && !ctx.dealWissels().some(function (w) { return w.id === her.fasewissel.id; }), 'een ongedaan gemaakte wissel telt nergens (de teruggezette en fw-k9-ongedaan uit de seed)');
    var her2 = roep(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'voorstel', _oud: { fase: 'verloren' }, wissel: {} });
    eis(ctx.vind('Kansen', 'k10').verliesReden === '' && ctx.vind('Kansen', 'k10').gesloten === '' && ctx.vind('Kansen', 'k10').verliesToelichting === '', 'heropenen wist reden, toelichting (review C8) en gesloten');
    roep(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'verloren', _oud: { fase: 'voorstel' }, wissel: { ongedaan: her2.fasewissel.id } });
    var k10 = ctx.vind('Kansen', 'k10');
    eis(k10.fase === 'verloren' && k10.verliesReden === 'te duur' && k10.gesloten === plusDagen(-2), 'B2: verloren → voorstel → ongedaan geeft fase verloren met de oude reden en gesloten (uit de laatste sluitende wissel)');
    eis(/niets om ongedaan/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k10', volgendeActie: 'x', wissel: { ongedaan: 'bestaat-niet' } })) && /niets om ongedaan/.test(faalt(LARS, 'apiKansOpslaan', { naam: 'Nieuw', schoolId: 's1', wissel: { ongedaan: 'x' } })) &&
      /niets om ongedaan/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'lead', wissel: { ongedaan: 42 } })), 'B2: ongedaan zonder faseverandering, zonder oude rij of met een ongeldige id → "Er is niets om ongedaan te maken." (geen TypeError)');
    var ouder = wisselsVan('k10').filter(function (w) { return w.naar === 'voorstel' && !w.ongedaan; })[0];
    eis(/kan niet meer ongedaan/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'gesprek', _oud: { fase: 'verloren' }, wissel: { ongedaan: ouder.id } })) && ctx.vind('Kansen', 'k10').fase === 'verloren', 'B2: een oudere wissel ongedaan maken wordt geweigerd');
    // apiFasewisselDatum: toekomst, na invoer, vóór het vorige schooljaar, ongedaan, iemand anders' kans, gesloten volgt
    eis(/toekomst/.test(faalt(NOOR, 'apiFasewisselDatum', 'fw-k8-1', plusDagen(1))) && /na het invoermoment/.test(faalt(NOOR, 'apiFasewisselDatum', 'fw-k8-1', plusDagen(-10))) &&
      /vorige schooljaar/.test(faalt(NOOR, 'apiFasewisselDatum', 'fw-k8-0', ctx.ondergrensWerkelijkeDatum().slice(0, 4) + '-07-15')) && /ongedaan/.test(faalt('demo-yara', 'apiFasewisselDatum', 'fw-k9-ongedaan', plusDagen(-6))) &&
      /toegang/.test(faalt(LARS, 'apiFasewisselDatum', 'fw-k8-1', plusDagen(-21))) && wisselRij('fw-k8-1').werkelijkeDatum === plusDagen(-20), 'apiFasewisselDatum: toekomst, na het invoermoment, vóór het vorige schooljaar, een ongedane wissel en de kans van een ander worden geweigerd');
    var oudDag = ctx.ondergrensWerkelijkeDatum().slice(0, 4) + '-07-15';
    ctx.schrijf('Fasewissels', { id: 'fw-rk-oud', kansId: 'k8', van: '', naar: 'lead', werkelijkeDatum: plusDagen(-31), ingevoerdOp: plusDagen(-31) + ' 09:00', /* review C1: de eerste in de keten van k8 */ eigenaar: 'Noor Hendriks', door: 'Noor Hendriks', zekerheid: 'vastgelegd', bron: 'detail' });
    eis(roep(NOOR, 'apiFasewisselDatum', 'fw-rk-oud', oudDag, { oudBevestigd: true }).fasewissel.werkelijkeDatum === oudDag, 'apiFasewisselDatum: vóór het vorige schooljaar mag met oudBevestigd');
    var sl5 = ctx.laatsteSluitendeWissel('k5', 'gewonnen'), gz = roep(NOOR, 'apiFasewisselDatum', sl5.id, plusDagen(-9));
    eis(gz.fasewissel.werkelijkeDatum === plusDagen(-9) && ctx.vind('Kansen', 'k5').gesloten === plusDagen(-9), 'apiFasewisselDatum: Kansen.gesloten volgt de laatste sluitende wissel');
    // review C1: gewonnen (akkoord -3), heropend (-2), verloren met -10: geweigerd; gesloten en de deal blijven kloppen met Kansen.fase (N8)
    var c1w = roep(NOOR, 'apiKansOpslaan', { id: 'k6', fase: 'gewonnen', _oud: { fase: 'voorstel' }, overdracht: od(12000, plusDagen(-3)) });
    var c1h = roep(NOOR, 'apiKansOpslaan', { id: 'k6', fase: 'voorstel', _oud: { fase: 'gewonnen' }, wissel: { datum: plusDagen(-2) } });
    eis(/vóór de vorige mijlpaal/.test(faalt(NOOR, 'apiKansOpslaan', { id: 'k6', fase: 'verloren', _oud: { fase: 'voorstel' }, verliesReden: 'te duur', wissel: { datum: plusDagen(-10) } })) && ctx.vind('Kansen', 'k6').fase === 'voorstel',
      'review C1: verloren met een datum vóór het heropenen wordt geweigerd; de kans blijft open');
    var c1v = roep(NOOR, 'apiKansOpslaan', { id: 'k6', fase: 'verloren', _oud: { fase: 'voorstel' }, verliesReden: 'te duur', wissel: { datum: plusDagen(-1) } }), k6n = ctx.vind('Kansen', 'k6');
    eis(k6n.gesloten === plusDagen(-1) && ctx.laatsteSluitendeWissel('k6', 'verloren').id === c1v.fasewissel.id && !ctx.dealWissels().some(function (w) { return w.kansId === 'k6'; }),
      'review C1: na gewonnen, heropend en verloren staat gesloten op de verloren-wissel en telt de kans niet als deal');
    eis(/vóór de vorige mijlpaal/.test(faalt(NOOR, 'apiFasewisselDatum', c1v.fasewissel.id, plusDagen(-10))) && /na de volgende mijlpaal/.test(faalt(NOOR, 'apiFasewisselDatum', c1w.fasewissel.id, plusDagen(-1))) &&
      roep(NOOR, 'apiFasewisselDatum', c1h.fasewissel.id, plusDagen(-3)).fasewissel.werkelijkeDatum === plusDagen(-3), 'review C1: Andere datum weigert een datum vóór de vorige of na de volgende mijlpaal; daartussen mag');
    ctx.fasewisselsSchrijven([ctx.faseWisselRij(ctx.vind('Kansen', 'k6'), 'voorstel', 'gewonnen', { bron: 'reconstructie', datum: plusDagen(0), zekerheid: 'midden', id: 'rk-c1-rec' })]);
    eis(!ctx.dealWissels().some(function (w) { return w.kansId === 'k6'; }), 'review C1: een kans die nu verloren is telt nooit als deal, ook niet met een latere (gereconstrueerde) winwissel');
    eis(ctx.werkelijkeDatumIn(plusDagen(-2), { nietVoor: plusDagen(-2), nietNa: plusDagen(-2) }) === plusDagen(-2), 'review C1: werkelijkeDatumIn kent nietVoor en nietNa (grenzen inclusief)');
    // R17: verwijderen
    var w1 = wisselsVan('k1').length;
    eis(/gewonnen kans met een project blijft staan/.test(faalt(LARS, 'apiVerwijder', 'kans', 'k1')) && !!ctx.vind('Kansen', 'k1') && wisselsVan('k1').length === w1 && wisselsVan('k1').every(function (w) { return !w.verwijderd; }), 'R17: een gewonnen kans met project verwijderen wordt geweigerd; de wissels tellen nog');
    var nwW = wisselsVan(nw.kans.id).length;
    roep(LARS, 'apiVerwijder', 'kans', nw.kans.id);
    eis(!ctx.vind('Kansen', nw.kans.id) && wisselsVan(nw.kans.id).length === nwW && wisselsVan(nw.kans.id).every(function (w) { return !!w.verwijderd; }) && !ctx.tellendeWissels().some(function (w) { return w.kansId === nw.kans.id; }),
      'R17: een open kans verwijderen zet verwijderd op zijn wissels (de rijen blijven, ze tellen niet meer)');
    // R8: een kans zonder pipeline in voorstel
    ctx.schrijf('Kansen', { id: 'rk-zonder-pl', naam: 'Zonder pipeline', traject: 'Zonder pipeline', school: 'Esdoorn Lyceum', schoolId: 's1', fase: 'gesprek', pipeline: '', eigenaar: 'Lars Visser', waarde: 0 });
    var zp = roep(LARS, 'apiKansOpslaan', { id: 'rk-zonder-pl', fase: 'voorstel', _oud: { fase: 'gesprek' } }), zpr = wisselRij(zp.fasewissel.id);
    eis(zpr.naarRol === 'voorstel' && zpr.vanRol === 'ap' && ctx.telRol(zpr) === 'voorstel' && ctx.vanafVoorstel('voorstel', ctx.pipelineVan(ctx.vind('Kansen', 'rk-zonder-pl'))), 'R8: een kans zonder pipeline gebruikt de pipeline van zijn mijlpaal (naarRol voorstel, telt als VO, valt onder vanaf-voorstel)');
    // een losse tijdlijnregel "→ voorstel" verandert voorstellen niet, een wissel wel
    var vanM = plusDagen(-40), totM = plusDagen(0), vo0 = tVan(consultancyTotaal(vanM, totM), 'voorstellen');
    ctx.schrijf('Activiteiten', { type: 'fase', datum: plusDagen(-1) + ' 10:00', door: 'Lars Visser', schoolId: 's1', kansId: 'k1', onderwerp: 'Mijlpaal: gesprek → voorstel', bron: 'app', aangemaakt: plusDagen(-1) + ' 10:00' });
    var vo1 = tVan(consultancyTotaal(vanM, totM), 'voorstellen');
    roep(LARS, 'apiKansOpslaan', { id: 'rk-zonder-pl', fase: 'gesprek', _oud: { fase: 'voorstel' } }); roep(LARS, 'apiKansOpslaan', { id: 'rk-zonder-pl', fase: 'lead', _oud: { fase: 'gesprek' } });
    roep(LARS, 'apiKansOpslaan', { id: 'rk-zonder-pl', fase: 'voorstel', _oud: { fase: 'lead' } });
    var vo2 = tVan(consultancyTotaal(vanM, totM), 'voorstellen');
    eis(vo1 === vo0 && vo2 === vo0 + 1, 'voorstellen telt uit Fasewissels: een losse tijdlijnregel "Mijlpaal: gesprek → voorstel" verandert niets (' + vo0 + ' → ' + vo1 + '), terug telt niet en lead → voorstel telt één keer (' + vo2 + ')');
    // N8: gewonnen, heropend en opnieuw gewonnen telt één deal
    var her3 = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'gewonnen' } });
    var wn2 = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'gewonnen', _oud: { fase: 'voorstel' }, overdracht: od(32000, plusDagen(0)) });
    var tellWon = ctx.tellendeWissels().filter(function (w) { return w.kansId === 'k16' && w.naar === 'gewonnen'; }).length, deals = ctx.dealWissels().filter(function (w) { return w.kansId === 'k16'; });
    eis(her3.fasewissel && tellWon === 2 && deals.length === 1 && deals[0].id === wn2.fasewissel.id && ctx.vind('Kansen', 'k16').gesloten === plusDagen(0), 'N8: gewonnen, heropend en opnieuw gewonnen: twee tellende winwissels, één deal (de laatste sluitende wissel)');
    eis(ctx.lees('Trajecten').filter(function (t) { return t.kansId === 'k16'; }).length === 1 && ctx.lees('Activiteiten').some(function (a) { return /Nieuwe getekende waarde bij opnieuw winnen/.test(a.onderwerp); }), 'opnieuw winnen: hetzelfde project; de nieuwe getekende waarde als regel in de tijdlijn');
    // archiveer laat Fasewissels staan
    var nArch = aantalWissels(); ctx.GEBRUIKER = null; ctx.archiveer();
    eis(aantalWissels() === nArch, 'archiveer() laat Fasewissels staan (' + nArch + ' rijen)');
    // TZ-7: vandaag 23:59 mag, morgen niet; ISO-week rond de jaarwisseling; registratievertraging in kalenderdagen (R15)
    eis(ctx.werkelijkeDatumIn(ctx.datumStr(kalDag(0, 23, 59))) === plusDagen(0) && /toekomst/.test((function () { try { ctx.werkelijkeDatumIn(ctx.datumStr(kalDag(1, 0, 1))); return ''; } catch (e) { return e.message; } })()) &&
      /Ongeldige datum/.test((function () { try { ctx.werkelijkeDatumIn('2026-02-30'); return ''; } catch (e) { return e.message; } })()), 'TZ-7: vandaag (ook 23:59) mag als werkelijke datum, morgen 00:01 niet; 30 februari is ongeldig');
    eis(ctx.isoWeekStr(new CtxDate79(2026, 11, 31, 12)) === '2026-W53' && ctx.isoWeekStr(new CtxDate79(2027, 0, 1, 12)) === '2026-W53' && ctx.isoWeekStr(new CtxDate79(2027, 0, 4, 12)) === '2027-W01' && ctx.isoWeekStr(new CtxDate79(2021, 0, 3, 12)) === '2020-W53',
      'TZ-7: isoWeekStr rond de jaarwisseling (week 53 en week 1)');
    var vd = ctx.datumStr(kalDag(0)), gd = ctx.datumStr(kalDag(-1));
    eis(ctx.registratieDagen({ werkelijkeDatum: vd, ingevoerdOp: vd + ' 23:30' }) === 0 && ctx.registratieDagen({ werkelijkeDatum: gd, ingevoerdOp: vd + ' 00:01' }) === 1 &&
      ctx.registratieDagen({ werkelijkeDatum: '2026-03-28', ingevoerdOp: '2026-03-30 09:00' }) === 2 && ctx.registratieDagen({ werkelijkeDatum: '2026-10-24', ingevoerdOp: '2026-10-26 01:00' }) === 2 && ctx.registratieDagen({ werkelijkeDatum: '', ingevoerdOp: vd + ' 10:00' }) === null,
      'R15/TZ-7: registratievertraging in kalenderdagen (vandaag 23:30 = 0, gisteren → vandaag 00:01 = 1, over de zomertijdwissel = 2)');
  } catch (e) { eis(false, 'v7.9 fasewissels: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: mijlpaalrol ---- */
(function () {
  var st = standBewaren();
  try {
    var ms = ctx.mijlpalen(), rol = {}; ms.forEach(function (m) { rol[m.mijlpaal] = m.rol; });
    eis(rol.lead === 'lead' && rol.gesprek === 'ap' && rol.voorstel === 'voorstel' && rol.onderhandeling === '' && ctx.effectieveRol('onderhandeling', 'Scholen') === 'voorstel' && ctx.effectieveRol('gewonnen', '') === 'deal' && ctx.rollenStatus().ingesteld,
      'standaardrollen: lead, ap, voorstel en onderhandeling zonder rol (erft voorstel); de rollen zijn ingesteld');
    var basis = ms.map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal, kans: m.kans, dagenNorm: m.dagenNorm, rol: m.rol }; });
    var dubbel = basis.map(function (m) { var x = JSON.parse(JSON.stringify(m)); if (x.mijlpaal === 'onderhandeling') x.rol = 'voorstel'; return x; });
    var volg = basis.map(function (m) { var x = JSON.parse(JSON.stringify(m)); if (x.mijlpaal === 'lead') x.rol = 'voorstel'; if (x.mijlpaal === 'voorstel') x.rol = 'lead'; return x; });
    eis(/twee keer in pipeline Scholen/.test(faalt(SOPHIE, 'apiMijlpalenOpslaan', dubbel)) && /volgorde lead, AP gepland/.test(faalt(SOPHIE, 'apiMijlpalenOpslaan', volg)) && /Onbekende rol/.test(faalt(SOPHIE, 'apiMijlpalenOpslaan', basis.map(function (m) { var x = JSON.parse(JSON.stringify(m)); x.rol = 'baas'; return x; }))) &&
      /management/i.test(faalt(LARS, 'apiMijlpalenOpslaan', basis)), 'een rol twee keer in een pipeline, de verkeerde volgorde en een onbekende rol worden geweigerd; alleen management');
    eis(ctx.telRol({ van: 'lead', vanRol: 'lead', naar: 'voorstel', naarRol: 'voorstel' }) === 'voorstel' && ctx.telRol({ van: 'voorstel', vanRol: 'voorstel', naar: 'gesprek', naarRol: 'ap' }) === '' &&
      ctx.telRol({ van: 'verloren', vanRol: 'verloren', naar: 'voorstel', naarRol: 'voorstel' }) === '' && ctx.telRol({ van: 'voorstel', vanRol: 'voorstel', naar: 'onderhandeling', naarRol: 'voorstel' }) === '' &&
      ctx.telRol({ van: '', vanRol: '', naar: 'gesprek', naarRol: 'ap' }) === 'ap' && ctx.telRol({ van: 'gesprek', vanRol: 'ap', naar: 'verloren', naarRol: 'verloren' }) === 'verloren', 'telRol: een sprong telt voor de fase waar hij eindigt, terug, gelijk en heropenen tellen niet, aangemaakt in een latere fase telt als die fase');
    // een sprong lead → voorstel telt alleen als VO
    var vanM = plusDagen(-3), totM = plusDagen(0), c0 = consultancyTotaal(vanM, totM);
    var nk = roep(LARS, 'apiKansOpslaan', { naam: 'Sprongkans', schoolId: 's7' }); roep(LARS, 'apiKansOpslaan', { id: nk.kans.id, fase: 'voorstel', _oud: { fase: 'lead' } });
    var c1 = consultancyTotaal(vanM, totM);
    eis(tVan(c1, 'voorstellen') === tVan(c0, 'voorstellen') + 1 && tVan(c1, 'ap') === tVan(c0, 'ap'), 'een sprong lead → voorstel telt alleen als VO, niet als AP');
    // hernoemen houdt de tellingen (rol als momentopname op de wissel)
    var c2 = consultancyTotaal(plusDagen(-60), totM);
    roep(SOPHIE, 'apiMijlpalenOpslaan', basis.map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal === 'voorstel' ? 'offerte' : m.mijlpaal, kans: m.kans, dagenNorm: m.dagenNorm, oud: { pipeline: m.pipeline, mijlpaal: m.mijlpaal } }; }));
    var c3 = consultancyTotaal(plusDagen(-60), totM);
    eis(tVan(c3, 'voorstellen') === tVan(c2, 'voorstellen') && tVan(c3, 'ap') === tVan(c2, 'ap') && ctx.mijlpalen().filter(function (m) { return m.mijlpaal === 'offerte'; })[0].rol === 'voorstel', 'hernoemen (voorstel → offerte) houdt de tellingen en de rol');
    // geen tellende code leest de naam: een mijlpaal die "voorstel" heet maar geen rol heeft, telt niet als VO
    roep(SOPHIE, 'apiMijlpalenOpslaan', [{ pipeline: 'Scholen', mijlpaal: 'lead', kans: 10, dagenNorm: 14, rol: 'lead' }, { pipeline: 'Scholen', mijlpaal: 'gesprek', kans: 25, dagenNorm: 10, rol: 'ap' },
      { pipeline: 'Scholen', mijlpaal: 'voorstel', kans: 40, dagenNorm: 7, rol: '' }, { pipeline: 'Scholen', mijlpaal: 'offerte', kans: 50, dagenNorm: 7, rol: 'voorstel' }, { pipeline: 'Scholen', mijlpaal: 'onderhandeling', kans: 75, dagenNorm: 7, rol: '' }], GEWICHT_OK);
    var nk2 = roep(LARS, 'apiKansOpslaan', { naam: 'Naamkans', schoolId: 's7', fase: 'gesprek' }), c4 = consultancyTotaal(vanM, totM);
    var nw2 = roep(LARS, 'apiKansOpslaan', { id: nk2.kans.id, fase: 'voorstel', _oud: { fase: 'gesprek' } }), c5 = consultancyTotaal(vanM, totM);
    eis(wisselRij(nw2.fasewissel.id).naarRol === 'ap' && tVan(c5, 'voorstellen') === tVan(c4, 'voorstellen'), 'een mijlpaal die "voorstel" heet zonder rol erft ap en telt niet als VO (tellingen lezen de rol, nooit de naam)');
    // R13: zonder veld rol blijven de rollen staan; met rol '' gaan ze weg
    var zonderVeld = ctx.mijlpalen().map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal, kans: m.kans, dagenNorm: m.dagenNorm }; });
    var naZonder = roep(SOPHIE, 'apiMijlpalenOpslaan', zonderVeld), naLeeg = roep(SOPHIE, 'apiMijlpalenOpslaan', zonderVeld.map(function (m) { m.rol = ''; return m; }));
    eis(naZonder.filter(function (m) { return m.mijlpaal === 'offerte'; })[0].rol === 'voorstel' && naLeeg.every(function (m) { return m.rol === ''; }) && !ctx.rollenStatus().ingesteld, 'R13: opslaan zonder veld rol (oudere app) houdt de rollen; met rol "" worden ze gewist');
    // Capsule: rollen op volgorde, alleen voor nieuwe of lege rollen
    var echtCapsule = ctx.capsule;
    ctx.capsule = function () { return { data: { milestones: [{ id: 701, name: 'Kennismaking', displayOrder: 1, probability: 10, pipeline: { name: 'Capsule' } }, { id: 702, name: 'Gesprek gepland', displayOrder: 2, probability: 20, pipeline: { name: 'Capsule' } },
      { id: 703, name: 'Gesprek gehouden', displayOrder: 3, probability: 30, pipeline: { name: 'Capsule' } }, { id: 704, name: 'Offerte', displayOrder: 4, probability: 50, pipeline: { name: 'Capsule' } }, { id: 705, name: 'Akkoord', displayOrder: 5, probability: 80, pipeline: { name: 'Capsule' } },
      { id: 706, name: 'Won', displayOrder: 6, probability: 100, complete: true, pipeline: { name: 'Capsule' } }] }, meer: false }; };
    ctx.GEBRUIKER = null; ctx._LEES = {}; ctx.capsulePagina('mijlpalen', 1);
    var cr = {}; ctx.lees('Mijlpalen').filter(function (m) { return m.pipeline === 'Capsule'; }).forEach(function (m) { cr[m.mijlpaal] = m.rol; });
    // v7.9.1: de rol op naam (rolVanNaam); kennismaking en akkoord herkent hij niet en krijgen geen rol (ze erven), want de pipeline heeft herkende namen
    eis(cr.kennismaking === '' && cr['gesprek gepland'] === 'ap' && cr['gesprek gehouden'] === 'ad' && cr.offerte === 'voorstel' && cr.akkoord === '' && !('won' in cr), 'Capsule: de rol op naam (gesprek gepland ap, gesprek gehouden ad, offerte voorstel; niet herkend geen rol)');
    ctx.schrijfVeel('Mijlpalen', [{ id: 'cap-m703', rol: '' }, { id: 'cap-m704', rol: 'ad' }]); ctx._LEES = {};
    ctx.capsulePagina('mijlpalen', 1);
    var cr2 = {}; ctx.lees('Mijlpalen').filter(function (m) { return m.pipeline === 'Capsule'; }).forEach(function (m) { cr2[m.mijlpaal] = m.rol; });
    eis(cr2.offerte === 'ad' && cr2['gesprek gehouden'] === '' && cr2.kennismaking === '', 'Capsule-herrun: een rol die de beheerder zette blijft staan; een lege rol krijgt geen rol die al bezet is (R7)');
    ctx.capsule = echtCapsule;
  } catch (e) { eis(false, 'v7.9 mijlpaalrol: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: overstap (apiMigratieV79) ---- */
(function () {
  var st = standBewaren();
  try {
    eis(/management/i.test(faalt('demo-yara', 'apiMigratieV79', 'status')) && /management/i.test(faalt(LARS, 'apiMigratieV79', 'rollen', { toepassen: true })) && /Onbekende stap/.test(faalt(SOPHIE, 'apiMigratieV79', 'onzin')), 'apiMigratieV79: alleen management; een onbekende stap geeft een Nederlandse melding');
    var s0 = roep(SOPHIE, 'apiMigratieV79', 'status');
    eis(s0.rollen.ingesteld && s0.tijdlijn.teOmzetten === 0 && s0.kansen.zonderSchooljaar === 0 && s0.kansen.zonderKlant === 0 && s0.redenen.gekoppeld === true, 'status op de demo-seed: rollen ingesteld, niets om te zetten, alle kansen met schooljaar en klant, redenen gekoppeld');
    // B1: eigen Mijlpalen-rijen zonder rol (zoals na Capsule of na opslaan in een oudere app)
    var basis = ctx.mijlpalen().map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal, kans: m.kans, dagenNorm: m.dagenNorm, rol: '' }; });
    roep(SOPHIE, 'apiMijlpalenOpslaan', basis);
    var rap = roep(SOPHIE, 'apiTeamRapport', 'maand', 'consultancy', '', 0);
    eis(!ctx.rollenStatus().ingesteld && rap.totaal.cijfers.ap === null && rap.totaal.cijfers.voorstellen === null && rap.totaal.cijfers.conversie === null && /rollen niet ingesteld/.test(rap.geblokkeerd.voorstellen || '') && typeof rap.totaal.cijfers.gewonnen === 'number' && rap.perPersoon.every(function (p) { return p.cijfers.ad === null; }),
      'B1: zonder rollen geeft het teamrapport voor AP, AD, VO en conversie geblokkeerd (null met de reden), nooit 0; deals tellen wel');
    var lw = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'gesprek' } });
    eis(wisselRij(lw.fasewissel.id).rolBron === 'leeg' && wisselRij(lw.fasewissel.id).naarRol === '', 'B1: een wissel zonder rollen krijgt rolBron leeg');
    var p1 = roep(SOPHIE, 'apiMigratieV79', 'rollen'), vs = {}; p1.mijlpalen.forEach(function (m) { vs[m.mijlpaal] = m; });
    // v7.9.1: op naam, niet op volgorde (de volgorde gaf voorstel de rol ad); onderhandeling herkent hij als voorstel, maar die rol is al bezet: geen rol (erft)
    eis(p1.pipelines.join() === 'Scholen' && vs.lead.voorstel === 'lead' && vs.gesprek.voorstel === 'ap' && vs.voorstel.voorstel === 'voorstel' && vs.onderhandeling.voorstel === '', 'stap rollen: een voorstel op naam (lead, ap, voorstel, geen)');
    var nVoor = ctx.lees('Mijlpalen').map(function (m) { return m.rol; }).join();
    roep(SOPHIE, 'apiMigratieV79', 'rollen', {});
    eis(ctx.lees('Mijlpalen').map(function (m) { return m.rol; }).join() === nVoor, 'proefdraaien schrijft niets');
    eis(/twee keer/.test(faalt(SOPHIE, 'apiMigratieV79', 'rollen', { toepassen: true, rollen: { 'scholen-gesprek': 'voorstel', 'scholen-onderhandeling': 'voorstel' } })), 'stap rollen: dezelfde controles als Beheer → Mijlpalen');
    var p2 = roep(SOPHIE, 'apiMigratieV79', 'rollen', { toepassen: true, rollen: { 'scholen-lead': 'lead', 'scholen-gesprek': 'ap', 'scholen-voorstel': 'voorstel', 'scholen-onderhandeling': '' } });
    eis(p2.gewijzigd === 3 && ctx.rollenStatus().ingesteld && ctx.effectieveRol('onderhandeling', 'Scholen') === 'voorstel', 'stap rollen toepassen: de gecorrigeerde rollen staan erop; de rollen zijn weer ingesteld');
    // stap wissels: rolBron leeg en de bronnen capsule/import/tijdlijn/reconstructie opnieuw, een app-wissel met rolBron mijlpaal nooit
    ctx.schrijf('Fasewissels', { id: 'fw-rk-cap', kansId: 'k8', van: 'lead', naar: 'gesprek', werkelijkeDatum: '', ingevoerdOp: plusDagen(-50) + ' 10:00', eigenaar: 'Noor Hendriks', door: 'Noor Hendriks', bron: 'capsule', rolBron: 'volgorde', vanRol: 'ap', naarRol: 'ad' });
    var appRij = JSON.stringify(wisselRij('fw-k6-2')), wp = roep(SOPHIE, 'apiMigratieV79', 'wissels');
    eis(wp.toegepast === false && wp.gewijzigd >= 2 && wisselRij(lw.fasewissel.id).rolBron === 'leeg', 'stap wissels proefdraai: telt de wissels die anders worden (' + wp.gewijzigd + '), schrijft niets');
    var wt = roep(SOPHIE, 'apiMigratieV79', 'wissels', { toepassen: true });
    eis(wisselRij(lw.fasewissel.id).rolBron === 'mijlpaal' && wisselRij(lw.fasewissel.id).naarRol === 'voorstel' && wisselRij('fw-rk-cap').naarRol === 'ap' && wisselRij('fw-rk-cap').vanRol === 'lead' && JSON.stringify(wisselRij('fw-k6-2')) === appRij && wt.nogLeeg === 0 && wt.perBron.capsule === 1,
      'stap wissels: rolBron leeg en Capsule krijgen de huidige rollen; een app-wissel met rolBron mijlpaal blijft ongemoeid');
    var r2 = roep(SOPHIE, 'apiTeamRapport', 'maand', 'consultancy', '', 0);
    eis(typeof r2.totaal.cijfers.voorstellen === 'number' && !r2.geblokkeerd.voorstellen, 'daarna tellen AP, AD en VO weer');
    // R7: Capsule-herrun met een andere fase schrijft een wissel met van = de oude fase; dezelfde fase niets
    var echtCapsule = ctx.capsule, fase = 'Voorstel';
    ctx._demoProps.CAPSULE_MIJLPALEN = JSON.stringify({ 501: { naam: 'gesprek', complete: false, kans: 25, pipeline: 'Scholen' }, 502: { naam: 'voorstel', complete: false, kans: 50, pipeline: 'Scholen' } });
    ctx.capsule = function () { return { data: { opportunities: [{ id: 9101, name: 'Herrunkans', party: null, milestone: { id: fase === 'Voorstel' ? 502 : 501 }, owner: { name: 'Lars Visser' }, createdAt: plusDagen(-40) + 'T09:00:00Z' }] }, meer: false }; };
    ctx.GEBRUIKER = null; ctx._LEES = {}; ctx.capsulePagina('kansen', 1); var h1 = wisselsVan('cap-k9101').length;
    ctx._LEES = {}; ctx.capsulePagina('kansen', 1); var h2 = wisselsVan('cap-k9101').length;
    fase = 'Gesprek'; ctx._LEES = {}; ctx.capsulePagina('kansen', 1);
    var h3 = wisselsVan('cap-k9101'), laatst = h3.filter(function (w) { return w.naar === 'gesprek'; })[0];
    eis(h1 === 1 && h2 === 1 && h3.length === 2 && laatst && laatst.van === 'voorstel' && laatst.bron === 'capsule' && laatst.id === 'cap-f9101-gesprek', 'R7: een Capsule-herrun met dezelfde fase schrijft niets; met een andere fase één wissel (bron capsule, van = de oude fase)');
    ctx.capsule = echtCapsule; ctx.verwijderRijen('Kansen', function (k) { return k.id === 'cap-k9101'; });
    // R6: stap kansen vult alleen lege velden van open kansen
    ctx.schrijfVeel('Kansen', [{ id: 'k9', schooljaar: '', klant: '' }, { id: 'k12', klant: '' }]); ctx._LEES = {};
    var kp = roep(SOPHIE, 'apiMigratieV79', 'kansen');
    eis(kp.aantal === 2 && ctx.vind('Kansen', 'k9').schooljaar === '' && (kp.perKlant.nieuw || 0) + (kp.perKlant.bestaand || 0) === 2, 'stap kansen proefdraai: twee kansen, per klantsoort geteld, niets geschreven');
    roep(SOPHIE, 'apiMigratieV79', 'kansen', { toepassen: true });
    eis(ctx.vind('Kansen', 'k9').schooljaar === sjNu() && ctx.vind('Kansen', 'k9').klant === ctx.klantVoorstel('s9', sjNu()) && ctx.vind('Kansen', 'k12').schooljaar === st.b.Kansen.filter(function (r) { return r[0] === 'k12'; }).map(function (r) { return r[ctx.TABELLEN.Kansen.indexOf('schooljaar')]; })[0] && !!ctx.vind('Kansen', 'k12').klant && roep(SOPHIE, 'apiMigratieV79', 'status').kansen.zonderKlant === 0,
      'stap kansen toepassen: alleen de lege velden (schooljaar uit het voorstel, klant nieuw of bestaand); een gevuld schooljaar blijft');
    // R6: stap redenen
    ctx.schrijfVeel('Kansen', [{ id: 'k13', verliesReden: 'Te duur' }, { id: 'k14', verliesReden: 'Eigen oplossing gevonden' }]);
    var wl13 = ctx.laatsteSluitendeWissel('k13', 'verloren'); ctx.schrijfVeel('Fasewissels', [{ id: wl13.id, reden: 'Te duur' }]); ctx._LEES = {};
    var rp = roep(SOPHIE, 'apiMigratieV79', 'redenen'), rv = {}; rp.redenen.forEach(function (r) { rv[r.reden] = r; });
    eis(!rp.gekoppeld && rv['Te duur'].voorstel === 'te duur' && rv['Eigen oplossing gevonden'].voorstel === 'eigen oplossing' && rv['Te duur'].aantal === 2 && roep(SOPHIE, 'apiMigratieV79', 'status').redenen.gekoppeld === false,
      'stap redenen: per oude reden het aantal en een voorstel ("Te duur" → "te duur", "Eigen oplossing gevonden" → "eigen oplossing")');
    eis(/Koppel elke reden/.test(faalt(SOPHIE, 'apiMigratieV79', 'redenen', { toepassen: true, koppeling: { 'Te duur': 'te duur' } })) && /Koppel elke reden/.test(faalt(SOPHIE, 'apiMigratieV79', 'redenen', { toepassen: true, koppeling: { 'Te duur': 'te duur', 'Eigen oplossing gevonden': 'onzin' } })), 'stap redenen: een onvolledige of ongeldige koppeling wordt geweigerd');
    var rt = roep(SOPHIE, 'apiMigratieV79', 'redenen', { toepassen: true, koppeling: { 'Te duur': 'te duur', 'Eigen oplossing gevonden': 'eigen oplossing' } });
    eis(rt.kansen === 2 && rt.wissels === 1 && rt.gekoppeld && ctx.vind('Kansen', 'k14').verliesReden === 'eigen oplossing' && wisselRij(wl13.id).reden === 'te duur' && ctx.redenenGekoppeld(), 'stap redenen toepassen: Kansen.verliesReden én Fasewissels.reden staan in de lijst');
    // stap tijdlijn: een oude regel zonder wissel
    ctx.schrijf('Activiteiten', { id: 'act-rk-tl2', type: 'fase', datum: plusDagen(-20) + ' 09:00', door: 'Lars Visser', schoolId: 's1', kansId: 'k16', onderwerp: 'Kans aangemaakt: Examentraining voorjaar (lead)', bron: 'app', aangemaakt: plusDagen(-20) + ' 09:00' });
    var tp = roep(SOPHIE, 'apiMigratieV79', 'tijdlijn'), nT = aantalWissels(), tt = roep(SOPHIE, 'apiMigratieV79', 'tijdlijn', { toepassen: true });
    eis(tp.teOmzetten === 1 && tt.geschreven === 1 && aantalWissels() === nT + 1 && wisselRij('tl-act-rk-tl2').van === '' && wisselRij('tl-act-rk-tl2').naar === 'lead' && roep(SOPHIE, 'apiMigratieV79', 'tijdlijn').teOmzetten === 0, 'stap tijdlijn: "Kans aangemaakt: … (lead)" wordt één wissel; daarna niets meer om te zetten');
  } catch (e) { eis(false, 'v7.9 overstap: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: win en verloren ---- */
(function () {
  var st = standBewaren();
  try {
    var basisWin = function (o) { return { id: 'k10', fase: 'gewonnen', _oud: { fase: 'voorstel' }, overdracht: o }; };
    eis(/contractwaarde/.test(faalt(LARS, 'apiKansOpslaan', basisWin({ aantal: 1, startdatum: plusDagen(20), akkoorddatum: plusDagen(0) }))) && /contractwaarde/.test(faalt(LARS, 'apiKansOpslaan', basisWin(od(0, plusDagen(0))))) &&
      /akkoorddatum/.test(faalt(LARS, 'apiKansOpslaan', basisWin({ aantal: 1, startdatum: plusDagen(20), contractwaarde: 1000 }))) && /akkoorddatum/.test(faalt(LARS, 'apiKansOpslaan', basisWin(od(1000, plusDagen(1))))) &&
      /contractwaarde/.test(faalt(LARS, 'apiKansOpslaan', basisWin(od('veel', plusDagen(0))))) && ctx.vind('Kansen', 'k10').fase === 'voorstel' && !ctx.lees('Trajecten').some(function (t) { return t.kansId === 'k10'; }),
      'winformulier: zonder waarde, met waarde 0 of tekst, zonder akkoorddatum of met een akkoorddatum in de toekomst geweigerd (de kans blijft open, geen project)');
    var j1 = Number(sjNu().slice(0, 4)), volgendSj = (j1 + 1) + '-' + (j1 + 2);
    var w = roep(LARS, 'apiKansOpslaan', basisWin(od(12345.5, plusDagen(-1), { startdatum: (j1 + 1) + '-09-01' }))), t = w.traject, k = ctx.vind('Kansen', 'k10');
    eis(Number(k.waarde) === 12345.5 && k.gesloten === plusDagen(-1) && Number(t.contractwaarde) === 12345.5 && Number(t.omzet) === 12345.5 && t.schooljaar === volgendSj && k.schooljaar === volgendSj && t.klant === k.klant && t.productsoort === 'examentraining',
      'winformulier: Kansen.waarde en Trajecten.contractwaarde = de getekende waarde, gesloten = akkoorddatum, het schooljaar van project en kans volgt de startdatum (' + volgendSj + '), klant en productsoort gaan mee');
    roep(SOPHIE, 'apiTrajectOpslaan', { id: t.id, omzet: 99999, _oud: { omzet: t.omzet } });
    ctx.GEBRUIKER = null; ctx._LEES = {};
    var D = ctx.financienData(), tr = ctx.vind('Trajecten', t.id), F = ctx.financienProject(tr, D.fac[t.id] || [], D.uren[t.id] || [], 30);
    eis(F.contract === 1234550, 'Financiën rekent met de getekende contractwaarde en niet met de omzet (contract ' + F.contract + ' centen)');
    var gecontracteerd = ctx.lees('Trajecten').filter(function (x) { return x.kansId && ctx.lees('Kansen').some(function (kk) { return kk.id === x.kansId && kk.fase === 'gewonnen' && kk.schooljaar === volgendSj; }); }).reduce(function (s, x) { return s + (Number(x.contractwaarde) || 0); }, 0);
    eis(gecontracteerd === 12345.5, 'gecontracteerd in ' + volgendSj + ' = de som van de contractwaarde van de gewonnen kansen van dat schooljaar');
    // verloren
    eis(/Kies een reden uit de lijst/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'verloren', _oud: { fase: 'gesprek' }, verliesReden: 'Te ver weg' })) && /Kies een reden uit de lijst/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'verloren', _oud: { fase: 'gesprek' } })) &&
      /verwacht tekst/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'verloren', _oud: { fase: 'gesprek' }, verliesReden: 'te duur', verliesToelichting: { x: 1 } })) && ctx.vind('Kansen', 'k16').fase === 'gesprek',
      'verloren: een reden buiten de lijst, geen reden of een object als toelichting wordt geweigerd (tekstIn)');
    // opgeschoond telt niet in de conversie (M12 per cohort)
    var c0 = consultancyTotaal(plusDagen(-5), plusDagen(0)), conv0 = c0.totaal.conversie || { t: 0, n: 0 };
    roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'gesprek' } });
    roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'verloren', _oud: { fase: 'voorstel' }, verliesReden: 'opgeschoond' });
    var c1 = consultancyTotaal(plusDagen(-5), plusDagen(0)), conv1 = c1.totaal.conversie || { t: 0, n: 0 };
    var nk = roep(LARS, 'apiKansOpslaan', { naam: 'Conversiekans', schoolId: 's7', fase: 'voorstel' }); roep(LARS, 'apiKansOpslaan', { id: nk.kans.id, fase: 'verloren', _oud: { fase: 'voorstel' }, verliesReden: 'geen budget' });
    var c2 = consultancyTotaal(plusDagen(-5), plusDagen(0)), conv2 = c2.totaal.conversie || { t: 0, n: 0 };
    eis(conv1.n === conv0.n && conv2.n === conv0.n + 1 && conv2.t === conv0.t, 'conversie per cohort: verloren als "opgeschoond" telt niet in de noemer, een gewone reden wel (' + conv0.n + ' → ' + conv1.n + ' → ' + conv2.n + ')');
    // een reden hernoemen in Keuzelijsten gaat mee in Fasewissels.reden; opgeschoond blijft altijd
    var lijst = ctx.keuzelijst('verliesRedenen');
    eis(/opgeschoond" hoort altijd in de lijst/.test(faalt(SOPHIE, 'apiKeuzelijstOpslaan', 'verliesRedenen', lijst.filter(function (x) { return x !== 'opgeschoond'; }).map(function (x) { return { waarde: x, oud: x }; }))), 'Keuzelijsten: een lijst zonder "opgeschoond" wordt geweigerd');
    roep(SOPHIE, 'apiKeuzelijstOpslaan', 'verliesRedenen', lijst.map(function (x) { return x === 'geen budget' ? { waarde: 'geen geld', oud: 'geen budget' } : { waarde: x, oud: x }; }));
    eis(ctx.vind('Kansen', nk.kans.id).verliesReden === 'geen geld' && ctx.laatsteSluitendeWissel(nk.kans.id, 'verloren').reden === 'geen geld' && !ctx.lees('Fasewissels').some(function (x) { return x.reden === 'geen budget'; }), 'een hernoemde reden gaat mee in Kansen.verliesReden én Fasewissels.reden');
    // R13: de versiewacht
    ctx.GEBRUIKER = null; ctx._LEES = {}; ctx.KLANT_VERSIE = '7.8';
    var e1 = (function () { try { ctx.apiKansOpslaan({ id: 'k6', fase: 'gewonnen', _oud: { fase: 'voorstel' } }); return ''; } catch (e) { return e.message; } })();
    var e1b = (function () { try { ctx.apiKansOpslaan({ id: 'k6', fase: 'gewonnen', _oud: { fase: 'voorstel' }, overdracht: { aantal: 1, startdatum: plusDagen(10) } }); return ''; } catch (e) { return e.message; } })();
    var e1c = (function () { try { ctx.apiKansOpslaan({ id: 'k6', fase: 'verloren', _oud: { fase: 'voorstel' }, verliesReden: 'Te ver weg' }); return ''; } catch (e) { return e.message; } })();
    ctx.KLANT_VERSIE = null;
    var e2 = (function () { try { ctx.apiKansOpslaan({ id: 'k6', fase: 'gewonnen', _oud: { fase: 'voorstel' } }); return ''; } catch (e) { return e.message; } })();
    eis(e1 === 'Herlaad de app: er is een nieuwe versie. Sluit de app en open hem opnieuw.' && e1b === e1 && e1c === e1 && /winformulier/.test(e2) && ctx.vind('Kansen', 'k6').fase === 'voorstel', 'R13: met KLANT_VERSIE 7.8 geeft gewonnen zonder (volledig) winformulier en verloren met een vrije reden "Herlaad de app"; zonder versiewacht (null) de gewone melding');
    var dp = function (body) { var u = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } })); ctx.KLANT_VERSIE = null; return u; };
    var z1 = dp({ fn: 'apiKansOpslaan', args: [{ id: 'k6', fase: 'gewonnen', _oud: { fase: 'voorstel' } }], secret: 'demo-noor' }), z2 = dp({ fn: 'apiKansOpslaan', args: [{ id: 'k6', fase: 'gewonnen', _oud: { fase: 'voorstel' } }], secret: 'demo-noor', v: '7.9' });
    eis(z1.ok === false && z1.fout === 'Herlaad de app: er is een nieuwe versie. Sluit de app en open hem opnieuw.' && z2.ok === false && /winformulier/.test(z2.fout), 'R13 via doPost: zonder v (een app van vóór v7.9) "Herlaad de app", met v 7.9 de gewone melding');
  } catch (e) { eis(false, 'v7.9 win en verloren: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: kansvelden en scholen ---- */
(function () {
  var st = standBewaren();
  try {
    var sj = sjNu(), j1 = Number(sj.slice(0, 4)), vorig = (j1 - 1) + '-' + j1;
    // klantvoorstel: project vorig jaar (s1 via t7), gewonnen kans vorig jaar (een verzonnen school), geen (nieuwe school)
    var sA = roep(SOPHIE, 'apiSchoolOpslaan', { naam: 'Rooktest Kans Vorig Jaar', plaats: 'Proefstad' }), sB = roep(SOPHIE, 'apiSchoolOpslaan', { naam: 'Rooktest Nieuwe School', plaats: 'Proefstad' });
    ctx.schrijf('Kansen', { id: 'rk-vj', naam: 'Vorig jaar gewonnen', traject: 'x', schoolId: sA.id, school: sA.naam, fase: 'gewonnen', gesloten: (j1 - 1) + '-11-01', schooljaar: vorig, eigenaar: 'Lars Visser' });
    eis(ctx.klantVoorstel('s1', sj) === 'bestaand' && ctx.klantVoorstel(sA.id, sj) === 'bestaand' && ctx.klantVoorstel(sB.id, sj) === 'nieuw', 'klantvoorstel: bestaand na een project of een gewonnen kans in het vorige schooljaar, anders nieuw');
    var k1 = roep(LARS, 'apiKansOpslaan', { naam: 'Kans A', schoolId: sA.id }), k2 = roep(LARS, 'apiKansOpslaan', { naam: 'Kans B', schoolId: sB.id }), k3 = roep(LARS, 'apiKansOpslaan', { naam: 'Kans C', schoolId: sB.id, klant: 'Bestaand' });
    eis(k1.kans.klant === 'bestaand' && k2.kans.klant === 'nieuw' && k3.kans.klant === 'bestaand' && /nieuw of bestaand/.test(faalt(LARS, 'apiKansOpslaan', { naam: 'Kans D', schoolId: sB.id, klant: 'misschien' })), 'een nieuwe kans krijgt het klantvoorstel; een meegegeven klant gaat voor; een andere waarde wordt geweigerd');
    var ci = roep(LARS, 'apiCrm');
    eis(ci.klantIn[vorig].indexOf('s1') >= 0 && ci.klantIn[vorig].indexOf(sA.id) >= 0 && ci.klantIn[vorig].indexOf(sB.id) < 0 && ci.schooljaren[0] === sj && ci.schooljaren[1] === (j1 + 1) + '-' + (j1 + 2) && ci.sturingVerplicht === undefined && roep(LARS, 'apiPipeline').sturingVerplicht === false && ci.backendVersie === '7.9.1' && ci.rollenIngesteld === true &&
      ci.keuzes.verliesRedenen.indexOf('opgeschoond') >= 0 && ci.keuzes.productsoorten.indexOf('overig') >= 0 && ci.mijlpalen.every(function (m) { return 'rol' in m; }), 'apiCrm: klantIn (alleen ids), schooljaren, rollenIngesteld, backendVersie en de keuzelijsten; sturingVerplicht via apiPipeline (review T4)');
    // schooljaar: schrijfwijzen, ongeldig, voorstel uit de verwachte tekendatum
    var sk = roep(LARS, 'apiKansOpslaan', { naam: 'Kans SJ', schoolId: 's1', schooljaar: "'" + String(j1 + 1).slice(2) + '/' + String(j1 + 2).slice(2) });
    eis(sk.kans.schooljaar === (j1 + 1) + '-' + (j1 + 2) && /als 2027-2028/.test(faalt(LARS, 'apiKansOpslaan', { naam: 'x', schoolId: 's1', schooljaar: '2027-2029' })) &&
      roep(LARS, 'apiKansOpslaan', { naam: 'Kans T1', schoolId: 's1', verwachteSluiting: (j1 + 1) + '-09-15' }).kans.schooljaar === (j1 + 1) + '-' + (j1 + 2) && roep(LARS, 'apiKansOpslaan', { naam: 'Kans T2', schoolId: 's1' }).kans.schooljaar === sj &&
      /verwachte tekendatum/.test(faalt(LARS, 'apiKansOpslaan', { naam: 'x', schoolId: 's1', verwachteSluiting: 'morgen' })), "schooljaar: '27/28 wordt 2027-2028, ongeldig geweigerd; het voorstel is het schooljaar van de verwachte tekendatum, zonder datum het huidige");
    // productsoort: onbekend geweigerd, hernoemen in Kansen én Trajecten
    eis(/Onbekende productsoort/.test(faalt(LARS, 'apiKansOpslaan', { naam: 'x', schoolId: 's1', productsoort: 'kookles' })) && /Onbekende productsoort/.test(faalt(SOPHIE, 'apiTrajectOpslaan', { id: 't1', productsoort: 'kookles' })) &&
      roep(LARS, 'apiKansOpslaan', { naam: 'Kans P', schoolId: 's1', productsoort: 'Surveillance' }).kans.productsoort === 'surveillance', 'productsoort: alleen uit de keuzelijst (klein); in kans en project');
    var nKs = ctx.lees('Kansen').filter(function (k) { return k.productsoort === 'surveillance'; }).length, nTs = ctx.lees('Trajecten').filter(function (t) { return t.productsoort === 'surveillance'; }).length;
    roep(SOPHIE, 'apiKeuzelijstOpslaan', 'productsoorten', ctx.keuzelijst('productsoorten').map(function (x) { return x === 'surveillance' ? { waarde: 'toezicht', oud: x } : { waarde: x, oud: x }; }));
    eis(nKs >= 1 && nTs >= 1 && ctx.lees('Kansen').filter(function (k) { return k.productsoort === 'toezicht'; }).length === nKs && ctx.lees('Trajecten').filter(function (t) { return t.productsoort === 'toezicht'; }).length === nTs && !ctx.lees('Trajecten').some(function (t) { return t.productsoort === 'surveillance'; }),
      'een hernoemde productsoort gaat mee in Kansen én Trajecten (' + nKs + ' en ' + nTs + ' rijen)');
    // BRIN en vestiging
    var b1 = roep(SOPHIE, 'apiSchoolOpslaan', { id: sB.id, brin: ' 12ab ', vestiging: '0', _oud: { brin: '' } });
    eis(b1.brin === '12AB' && b1.vestiging === '00' && roep(SOPHIE, 'apiSchoolOpslaan', { id: sB.id, vestiging: '3' }).vestiging === '03' && roep(SOPHIE, 'apiSchoolOpslaan', { id: sA.id, brin: '12AB' }).vestiging === '00', 'BRIN: hoofdletters zonder spaties, vestiging aangevuld tot twee cijfers ("0" → "00", "3" → "03"); leeg met een BRIN = 00');
    eis(/1234|twee cijfers en twee tekens/.test(faalt(SOPHIE, 'apiSchoolOpslaan', { id: 's11', brin: '1234X' })) && /horen al bij Rooktest Kans Vorig Jaar/.test(faalt(SOPHIE, 'apiSchoolOpslaan', { id: 's11', brin: '12ab', vestiging: '00' })) &&
      /hoort bij een BRIN/.test(faalt(SOPHIE, 'apiSchoolOpslaan', { id: 's11', vestiging: '01' })) && roep(SOPHIE, 'apiSchoolOpslaan', { id: 's11', brin: '12AB', vestiging: '1' }).vestiging === '01', 'BRIN: een verkeerde vorm, een dubbele combinatie (met de naam van de school) en een vestiging zonder BRIN worden geweigerd; dezelfde BRIN met een andere vestiging mag');
    var imp = roep(SOPHIE, 'apiImporteer', 'scholen', [{ naam: 'Importschool BRIN', brin: '34cd', vestiging: '2' }, { naam: 'Importschool fout', brin: 'ABCD' }]);
    eis(imp.ingevoegd === 1 && imp.ongeldig === 1 && ctx.vind('Scholen', 'importschool-brin').brin === '34CD' && ctx.vind('Scholen', 'importschool-brin').vestiging === '02', 'apiImporteer(scholen) normaliseert BRIN en vestiging en slaat een ongeldige over');
    // N2: een getal in de cel vestiging wordt tekst met voorloopnul
    var kolV = ctx.TABELLEN.Scholen.indexOf('vestiging'), rijen = ctx._demoBladen.Scholen.rijen, ri = -1;
    rijen.forEach(function (r, i) { if (r[0] === sB.id) ri = i; });
    rijen[ri][kolV] = 3; ctx._LEES = {};
    eis(ctx.vind('Scholen', sB.id).vestiging === '03' && roep(SOPHIE, 'apiSchool', sB.id).school.vestiging === '03', 'N2: een getal 3 in de cel vestiging wordt "03"');
    // H1: de whitelist van apiTrajectOpslaan bevat klant en productsoort
    var code = fs.readFileSync(process.env.CODE_GS || path.join(R, 'backend/Code.gs'), 'utf8'), wl = /function apiTrajectOpslaan\(obj\) \{[\s\S]*?var velden = \[([\s\S]*?)\], schoon = \{\}/.exec(code);
    eis(wl && /'klant'/.test(wl[1]) && /'productsoort'/.test(wl[1]) && roep(SOPHIE, 'apiTrajectOpslaan', { id: 't1', klant: 'bestaand', productsoort: 'onderwijsondersteuning' }).klant === 'bestaand' && /nieuw of bestaand/.test(faalt(SOPHIE, 'apiTrajectOpslaan', { id: 't1', klant: 'x' })),
      'H1: apiTrajectOpslaan accepteert klant en productsoort (whitelist), met controle');
  } catch (e) { eis(false, 'v7.9 kansvelden en scholen: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: doelen met periode ---- */
(function () {
  var st = standBewaren();
  try {
    var d0 = new CtxDate79(2026, 10, 11, 12);
    eis(ctx.periodeSleutelVan('week', d0) === '2026-W46' && ctx.periodeSleutelVan('maand', d0) === '2026-11' && ctx.periodeSleutelVan('kwartaal', d0) === '2026-Q4' && ctx.periodeSleutelVan('halfjaar', d0) === '2026-H2' && ctx.periodeSleutelVan('jaar', d0) === '2026' && ctx.periodeSleutelVan('schooljaar', d0) === '2026-2027',
      'periodeSleutelVan: 2026-W46, 2026-11, 2026-Q4, 2026-H2, 2026 en 2026-2027');
    var wk = ctx.isoWeekStr(new CtxDate79()), vorigeWk = ctx.isoWeekStr(kalDag(-7)), andereWk = wk.replace(/W(\d)(\d)$/, function (_, a, b) { return 'W' + (a === '4' ? '3' : String((Number(a) + 1) % 5)) + b; });
    roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'week', metric: 'gesprekken', doel: 5 });
    roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'week', metric: 'gesprekken', doel: 9, periodeSleutel: wk });
    roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'week', metric: 'gesprekken', doel: 4, periodeSleutel: vorigeWk });
    roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'week', metric: 'ap', doel: 7, periodeSleutel: andereWk });
    eis(ctx.doelenVan('week', wk)['Lars Visser'].gesprekken === 9 && ctx.doelenVan('week', vorigeWk)['Lars Visser'].gesprekken === 4 && ctx.doelenVan('week', '2001-W01')['Lars Visser'].gesprekken === 5 && ctx.doelenVan('week', wk)['Lars Visser'].ap === 2,
      'een concreet doel gaat voor de standaard; een andere week heeft haar eigen doel of de standaard; een week met hetzelfde laatste cijfer (' + andereWk + ') telt niet mee voor ' + wk);
    var dl = roep(LARS, 'apiDoelen'), sl = dl.doelen.filter(function (x) { return x.periodeSleutel; }).map(function (x) { return x.periodeSleutel; });
    eis(sl.indexOf(wk) >= 0 && sl.indexOf(vorigeWk) < 0 && sl.indexOf(andereWk) < 0 && ctx.lees('Doelen').some(function (x) { return x.periodeSleutel === vorigeWk; }) && dl.sleutels.week[0].waarde === wk && dl.sleutels.week.length === 2 && dl.sleutels.maand[0].waarde === ctx.periodeSleutelVan('maand', new CtxDate79()),
      'N9: apiDoelen geeft de standaard plus deze en volgende periode; de historie blijft in de Sheet');
    eis(/geldige periode/.test(faalt(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'maand', metric: 'gesprekken', doel: 3, periodeSleutel: '2026-13' })) && /geldige periode/.test(faalt(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'maand', metric: 'gesprekken', doel: 3, periodeSleutel: wk })) &&
      /Onbekende maatstaf/.test(faalt(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'maand', metric: 'constructor', doel: 3 })) && /Onbekende maatstaf/.test(faalt(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'maand', metric: '__proto__', doel: 3 })),
      'een ongeldige sleutel en constructor/__proto__ als maatstaf worden geweigerd (N1)');
    roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'maand', metric: 'vo', doel: 3 }); roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'Lars Visser', periode: 'maand', metric: 'deal', doel: 2 });
    eis(ctx.doelenVan('maand', '')['Lars Visser'].voorstellen === 3 && ctx.doelenVan('maand', '')['Lars Visser'].gewonnen === 2 && roep(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'bedrijf', periode: 'schooljaar', metric: 'omzet', doel: 1000 }).doelen.some(function (x) { return x.metric === 'contractwaarde' && x.doel === 1000; }) &&
      ctx.doelenVan('schooljaar', '').bedrijf.contractwaarde === 1000 && /Onbekende maatstaf/.test(faalt(SOPHIE, 'apiDoelOpslaan', { eigenaar: 'bedrijf', periode: 'schooljaar', metric: 'gecontracteerd', doel: 1 })),
      'alias: vo → voorstellen, deal → gewonnen, omzet → contractwaarde (pakket 2); een cijfer uit de sturing is geen doel');
    // N2: een Date en een getal in de cel periodeSleutel
    var kop = ctx.TABELLEN.Doelen, rij = function (id, per, sleutel) { var r = kop.map(function () { return ''; }); r[kop.indexOf('id')] = id; r[kop.indexOf('eigenaar')] = 'Noor Hendriks'; r[kop.indexOf('periode')] = per; r[kop.indexOf('metric')] = 'gesprekken'; r[kop.indexOf('doel')] = 6; r[kop.indexOf('periodeSleutel')] = sleutel; return r; };
    ctx._demoBladen.Doelen.rijen.push(rij('rk-d-datum', 'maand', new CtxDate79(2026, 10, 1)), rij('rk-d-getal', 'jaar', 2026)); ctx._LEES = {};
    eis(ctx.vind('Doelen', 'rk-d-datum').periodeSleutel === '2026-11' && ctx.vind('Doelen', 'rk-d-getal').periodeSleutel === '2026' && ctx.doelenVan('maand', '2026-11')['Noor Hendriks'].gesprekken === 6 && ctx.doelenVan('jaar', '2026')['Noor Hendriks'].gesprekken === 6,
      'N2: een Date (november 2026) en een getal (2026) in de cel periodeSleutel worden "2026-11" en "2026" en vinden hun doel');
    // N9: apiTeamRapport per week met de eigen sleutel
    var tr = roep(SOPHIE, 'apiTeamRapport', 'week', 'consultancy', 'Lars Visser', 0), lp = tr.perPersoon[0];
    eis(lp.doelen.gesprekken === 9 && lp.doelenVorige.gesprekken === 4 && lp.doelenReeks[lp.doelenReeks.length - 1].gesprekken === 9 && lp.doelenReeks[lp.doelenReeks.length - 2].gesprekken === 4 && lp.doelenReeks[0].gesprekken === 5,
      'N9: apiTeamRapport geeft per week in de reeks en voor de vergelijking het eigen weekdoel');
    // de metrieken uit wissels en activiteiten
    var tm = roep(SOPHIE, 'apiTeamRapport', 'maand', 'consultancy', '', 0), cij = tm.totaal.cijfers;
    eis(['ap', 'ad', 'contactmomenten', 'afsprakenGehouden', 'voorstellen', 'gewonnen', 'gewonnenWaarde', 'afspraken'].every(function (m) { return typeof cij[m] === 'number'; }) && tm.metrieken.some(function (m) { return m.id === 'contactmomenten'; }), 'apiTeamRapport (consultancy): ap, ad, contactmomenten, afsprakenGehouden, voorstellen, gewonnen en afspraken als getal');
    var B = ctx.periodeBereik('maand', 0), inP = function (s) { var x = String(s || '').slice(0, 10); return x >= B.van && x <= B.tot; }, leden = ctx.teamNamen('consultancy');
    var verwacht = { voorstellen: 0, gewonnen: 0, afspraken: 0 };
    ctx.tellendeWissels().forEach(function (w) { if (leden.indexOf(w.eigenaar) >= 0 && inP(w.werkelijkeDatum)) { var r = ctx.telRol(w); if (r === 'voorstel') verwacht.voorstellen++; if (r === 'deal') verwacht.gewonnen++; } });
    ctx.lees('Activiteiten').forEach(function (a) { if (leden.indexOf(a.door) >= 0 && inP(a.datum) && String(a.datum) <= ctx.nu() && a.type === 'afspraak') verwacht.afspraken++; });
    eis(cij.voorstellen === verwacht.voorstellen && cij.gewonnen === verwacht.gewonnen && cij.afspraken === verwacht.afspraken, 'voorstellen en gewonnen tellen de wissels (rol en werkelijke datum, ' + cij.voorstellen + ' en ' + cij.gewonnen + '); afspraken is ongewijzigd (R18, ' + cij.afspraken + ')');
    // apiWeekdoelenOpslaan: teamlead voor zijn team, medewerker niet; 0 haalt weg
    var wo = roep('demo-yara', 'apiWeekdoelenOpslaan', wk, [{ eigenaar: 'Lars Visser', metric: 'contactmomenten', doel: 20 }, { eigenaar: 'Noor Hendriks', metric: 'ap', doel: 3 }, { eigenaar: 'Lars Visser', metric: 'gewonnen', doel: 0 }]);
    eis(ctx.doelenVan('week', wk)['Lars Visser'].contactmomenten === 20 && ctx.doelenVan('week', wk)['Noor Hendriks'].ap === 3 && !ctx.vind('Doelen', ctx.doelId('Lars Visser', 'week', 'gewonnen', wk)) && wo.doelen.length > 0,
      'apiWeekdoelenOpslaan: de teamlead zet de weekdoelen van zijn team in één aanroep; 0 haalt een doel weg');
    eis(/teamlead/.test(faalt(LARS, 'apiWeekdoelenOpslaan', wk, [{ eigenaar: 'Lars Visser', metric: 'ap', doel: 9 }])) && /teamlead/.test(faalt('demo-yara', 'apiWeekdoelenOpslaan', wk, [{ eigenaar: 'Femke de Wit', metric: 'ap', doel: 9 }])) &&
      /geldige week/.test(faalt(SOPHIE, 'apiWeekdoelenOpslaan', '2026-11', [{ eigenaar: 'Lars Visser', metric: 'ap', doel: 1 }])) && /Kies een weekdoel/.test(faalt(SOPHIE, 'apiWeekdoelenOpslaan', wk, [{ eigenaar: 'Lars Visser', metric: 'mails', doel: 1 }])) && ctx.doelenVan('week', wk)['Lars Visser'].ap === 2,
      'apiWeekdoelenOpslaan: een medewerker en een teamlead buiten zijn team worden geweigerd; een maand als week en een andere maatstaf ook');
    // R5: een OC hernoemen neemt weekdoelen (met sleutel) en wissels mee
    var oudeDoelen = ctx.lees('Doelen').filter(function (x) { return x.eigenaar === 'Lars Visser' && x.periodeSleutel; }).length, oudeW = ctx.lees('Fasewissels').filter(function (w) { return w.eigenaar === 'Lars Visser'; }).length;
    roep(SOPHIE, 'apiGebruikerOpslaan', { id: 'g-lars', naam: 'Lars Visser-Proef' });
    var nd = ctx.lees('Doelen').filter(function (x) { return x.eigenaar === 'Lars Visser-Proef' && x.periodeSleutel; });
    eis(oudeDoelen >= 3 && nd.length === oudeDoelen && nd.every(function (x) { return x.id === ctx.doelId('Lars Visser-Proef', x.periode, x.metric, x.periodeSleutel); }) && ctx.lees('Fasewissels').filter(function (w) { return w.eigenaar === 'Lars Visser-Proef'; }).length === oudeW &&
      !ctx.lees('Fasewissels').some(function (w) { return w.eigenaar === 'Lars Visser' || w.door === 'Lars Visser'; }) && ctx.doelenVan('week', wk)['Lars Visser-Proef'].contactmomenten === 20, 'R5: hernoemen neemt de weekdoelen met hun eigen sleutel (' + nd.length + ') en de wissels (eigenaar en door) mee');
    roep(SOPHIE, 'apiGebruikerOpslaan', { id: 'g-lars', naam: 'Lars Visser' });
    // review C6: een naam van 40 tekens en twee weken geven twee ids (de sleutel wordt nooit afgekapt); hernoemen naar die naam verliest niets
    var lang = 'Verzonnen Testpersoon met een Lange Naam', wkA = '2026-W46', wkB = '2026-W47';
    eis(lang.length === 40 && ctx.doelId(lang, 'week', 'contactmomenten', wkA) !== ctx.doelId(lang, 'week', 'contactmomenten', wkB) && /-2026-w47$/.test(ctx.doelId(lang, 'week', 'contactmomenten', wkB)) && ctx.doelId('Lars Visser', 'week', 'ap', '') === ctx.slug('Lars Visser-week-ap'),
      'review C6: doelId met een lange naam houdt de periodesleutel heel (twee weken, twee ids); zonder sleutel het oude id');
    roep(SOPHIE, 'apiWeekdoelenOpslaan', wkA, [{ eigenaar: 'Lars Visser', metric: 'contactmomenten', doel: 7 }]); roep(SOPHIE, 'apiWeekdoelenOpslaan', wkB, [{ eigenaar: 'Lars Visser', metric: 'contactmomenten', doel: 8 }]);
    roep(SOPHIE, 'apiGebruikerOpslaan', { id: 'g-lars', naam: lang });
    eis(ctx.doelenVan('week', wkA)[lang].contactmomenten === 7 && ctx.doelenVan('week', wkB)[lang].contactmomenten === 8, 'review C6: hernoemen naar een naam van 40 tekens houdt de weekdoelen van twee weken apart (geen dubbel id, geen verlies)');
    eis(ctx.schrijfVeel('Doelen', [{ id: 'rk-dubbel', eigenaar: 'x', periode: 'week', metric: 'ap', doel: 1 }, { id: 'rk-dubbel', eigenaar: 'x', periode: 'week', metric: 'ap', doel: 2 }]).ingevoegd === 1 && Number(ctx.vind('Doelen', 'rk-dubbel').doel) === 2,
      'review C6: schrijfVeel met twee keer hetzelfde nieuwe id schrijft één rij (de laatste wint) in plaats van te gooien');
    roep(SOPHIE, 'apiGebruikerOpslaan', { id: 'g-lars', naam: 'Lars Visser' });
  } catch (e) { eis(false, 'v7.9 doelen met periode: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: werkelijke datums importeren (verzonnen voorbeeld test/voorbeelden/werkelijke_datums.csv) ---- */
(function () {
  var st = standBewaren();
  try {
    var tekst = fs.readFileSync(path.join(R, 'test/voorbeelden/werkelijke_datums.csv'), 'utf8');
    eis(/management/i.test(faalt(LARS, 'apiFasewisselsImport', tekst, { toepassen: true })) && /leeg/.test(faalt(SOPHIE, 'apiFasewisselsImport', '  ')) && /verplicht/.test(faalt(SOPHIE, 'apiFasewisselsImport', 'naam;datum\nx;2025-01-01')),
      'apiFasewisselsImport: alleen management; een leeg bestand en verkeerde kolommen geven een Nederlandse fout');
    var c4 = roep(SOPHIE, 'apiFasewisselsImport', 'kans;fase;werkelijke datum;zekerheid;soort bewijs\nkh2;gesprek;' + plusDagen(-2) + ';hoog;agenda\n');
    eis(c4.aangevuld === 0 && c4.overgeslagen.datum === 1 && c4.nieuw === 0, 'review C4: een wissel zonder datum aanvullen met een datum na zijn invoermoment wordt overgeslagen (datum), niet geschreven');
    var nV = aantalWissels(), p = roep(SOPHIE, 'apiFasewisselsImport', tekst);
    eis(p.toegepast === false && aantalWissels() === nV && p.gelezen === 10 && p.nieuw === 4 && p.aangevuld === 1 && p.ongewijzigd === 1 && p.overgeslagen.onbekend === 1 && p.overgeslagen.onbekendeKans === 1 && p.overgeslagen.onbekendeFase === 1 && p.overgeslagen.datum === 1 && p.regels.onbekendeKans.join() === '7',
      'proefdraai op het voorbeeld: 10 gelezen, 4 nieuw, 1 aangevuld, 1 dubbel, en per reden één overgeslagen (onbekend, onbekende kans op regel 7, onbekende fase, datum in de toekomst); niets geschreven');
    var t1 = roep(SOPHIE, 'apiFasewisselsImport', tekst, { toepassen: true }), kh2 = wisselsVan('kh2').filter(function (w) { return w.naar === 'gesprek'; })[0];
    eis(t1.nieuw === 4 && aantalWissels() === nV + 4 && kh2.werkelijkeDatum === '2025-05-12' && kh2.bron === 'reconstructie' && kh2.zekerheid === 'hoog' && kh2.bewijs === 'agenda' && wisselRij('rec-k12-lead-2025-11-03') && wisselRij('rec-k12-lead-2025-11-03').zekerheid === 'hoog',
      'toepassen: vier nieuwe wissels (bron reconstructie, ook dd-mm-jjjj) en de wissel zonder datum van kh2 aangevuld');
    var t2 = roep(SOPHIE, 'apiFasewisselsImport', tekst, { toepassen: true });
    eis(t2.nieuw === 0 && t2.aangevuld === 0 && t2.ongewijzigd === 6 && aantalWissels() === nV + 4, 'idempotent: een tweede run schrijft niets');
    // gesloten volgt; N8: een reconstructie met een oudere datum verdringt de wissel van de gebruiker niet
    var k5 = ctx.vind('Kansen', 'k5'), k13 = ctx.vind('Kansen', 'k13');
    var eigen = 'kans;fase;werkelijke datum;zekerheid;soort bewijs\nk5;gewonnen;' + plusDagen(-60) + ';hoog;contract\nk13;verloren;' + plusDagen(-3) + ';midden;mail\n';
    roep(SOPHIE, 'apiFasewisselsImport', eigen, { toepassen: true });
    eis(ctx.vind('Kansen', 'k5').gesloten === k5.gesloten && ctx.vind('Kansen', 'k13').gesloten === plusDagen(-3) && ctx.laatsteSluitendeWissel('k13', 'verloren').bron === 'reconstructie' && ctx.laatsteSluitendeWissel('k13', 'verloren').reden === k13.verliesReden,
      'Kansen.gesloten volgt de laatste sluitende wissel: een latere reconstructie verplaatst gesloten, een oudere (k5) laat de app-wissel staan (N8)');
    // R2: een import op schaal schrijft met één schrijfVeel
    var regels = ['kans;fase;werkelijke datum;zekerheid;soort bewijs']; ctx.lees('Kansen').forEach(function (k) { regels.push(k.id + ';lead;' + plusDagen(-200) + ';laag;notitie'); });
    var gm = telSchrijfVeel(function () { return roep(SOPHIE, 'apiFasewisselsImport', regels.join('\n'), { toepassen: true }); });
    eis(gm.n === 1 && gm.uit.nieuw + gm.uit.aangevuld + gm.uit.ongewijzigd === ctx.lees('Kansen').length, 'R2: een import met één regel per kans (' + (regels.length - 1) + ') schrijft met één schrijfVeel');
    // review P3: van het bewijs alleen de soort uit de vaste lijst; een zin wordt 'overig' en telt mee in de uitkomst
    var p3 = roep(SOPHIE, 'apiFasewisselsImport', 'kans;fase;werkelijke datum;zekerheid;soort bewijs\nk12;gesprek;' + plusDagen(-150) + ';laag;Akkoord kwam via een collega na de open dag\nk11;lead;' + plusDagen(-150) + ';laag;E-mail\n', { toepassen: true });
    var w3 = wisselRij('rec-' + ctx.slug('k12-gesprek-' + plusDagen(-150))), w3b = wisselRij('rec-' + ctx.slug('k11-lead-' + plusDagen(-150)));
    eis(p3.nieuw === 2 && p3.bewijsOverig === 1 && w3 && w3.bewijs === 'overig' && w3b && w3b.bewijs === 'mail' && ctx.bewijsSoort('teamagenda') === 'teamagenda' && ctx.bewijsSoort('') === '',
      'review P3: een bewijs als zin wordt "overig" (geteld in bewijsOverig), "E-mail" wordt mail; nooit vrije tekst in Fasewissels.bewijs');
  } catch (e) { eis(false, 'v7.9 werkelijke datums: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: sturingVerplicht (besluit 4 en 5; standaard uit) ---- */
(function () {
  var st = standBewaren();
  try {
    eis(!ctx.sturingVerplicht() && !faalt(NOOR, 'apiKansOpslaan', { id: 'k8', fase: 'voorstel', _oud: { fase: 'gesprek' }, waarde: '' }), 'sturingVerplicht standaard uit: een wissel naar voorstel zonder waarde mag');
    ctx.schrijf('Aannames', { id: 'aa-sturingVerplicht-v1', naam: 'sturingVerplicht', versie: 1, waarde: 'true', eigenaar: 'beheerder', onderbouwing: 'Rooktest', besluitdatum: plusDagen(0), ingang: plusDagen(0), door: 'Sophie de Graaf', vastgelegd: ctx.nu() });
    eis(ctx.sturingVerplicht() && ctx.aanname('sturingVerplicht').versie === 1 && roep(LARS, 'apiPipeline').sturingVerplicht === true && roep(LARS, 'apiCrm').sturingVerplicht === undefined, 'met aanname sturingVerplicht (versie 1, waarde true) staat de instelling aan; de app krijgt hem met apiPipeline, niet met apiCrm (review T4)');
    eis(/verplicht vanaf de voorstelfase/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'gesprek' }, verwachteSluiting: '' })) && ctx.vind('Kansen', 'k16').fase === 'gesprek', 'aan: een wissel naar voorstel zonder verwachte tekendatum wordt geweigerd');
    var ok = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'gesprek' }, waarde: 9600, verwachteSluiting: plusDagen(30) });
    eis(ok.kans.fase === 'voorstel' && /verplicht vanaf de voorstelfase/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k16', waarde: '' })) && /verplicht vanaf de voorstelfase/.test(faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'onderhandeling', _oud: { fase: 'voorstel' }, verwachteSluiting: '' })),
      'aan: met waarde en tekendatum mag; de waarde of de tekendatum leegmaken op een kans vanaf voorstel wordt geweigerd');
    var terug = roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'onderhandeling', _oud: { fase: 'voorstel' } });
    ctx.schrijfVeel('Kansen', [{ id: 'k16', waarde: 0 }]); ctx._LEES = {};
    eis(!faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'onderhandeling' }, wissel: { ongedaan: terug.fasewissel.id } }) && !faalt(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'lead', _oud: { fase: 'voorstel' } }), 'aan: ongedaan maken en terug naar een fase vóór voorstel vragen niets');
  } catch (e) { eis(false, 'v7.9 sturingVerplicht: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: sturing, pakket 2 (register van cijfers, één definitie per naam, datacontracten, datakwaliteit, voorspellingen, sturingsweergaven, stand bevriezen,
   aannames en jaardoel). Elk blok begint met de verse seed en zet de stand aan het eind terug. Alle namen, scholen en bedragen zijn verzonnen (demo-seed). ---- */
var CtxJSON79 = vm.runInContext('JSON', ctx), THOMAS = 'demo-thomas';
function cx(v) { return CtxJSON79.parse(JSON.stringify(v)); }  // een waarde uit de context zelf (instanceof Array in Code.gs)
function vers79() { standTerug(SEED79); ctx._LEES = {}; ctx.GEBRUIKER = null; }
function contractenOp(wijzig) { ctx.GEBRUIKER = null; ctx._LEES = {}; var S = ctx.standVoorContracten(plusDagen(0)); if (wijzig) wijzig(S); var u = {}; ctx.datacontracten(S).forEach(function (c) { u[c.id] = c; }); return u; }
function mtCijfers(code) { var r = roep(code || SOPHIE, 'apiSturing', 'mt', {}), u = {}; r.blokken.forEach(function (b) { b.cijfers.forEach(function (c) { u[c.m || c.id] = c; u[c.id] = c; }); }); u._r = r; return u; }
function aannameZet(naam, waarde, extra) { var o = { waarde: waarde, onderbouwing: 'Rooktest (verzonnen)', besluitdatum: plusDagen(-1) }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return roep(SOPHIE, 'apiAannameOpslaan', naam, o); }
function leesTeller(fn) {
  var echt = ctx.lees, tel = {};
  ctx.lees = function (naam, licht) { tel[naam] = (tel[naam] || 0) + 1; return echt(naam, licht); };
  try { fn(); return tel; } finally { ctx.lees = echt; }
}
function rollenWeg() { ctx.schrijfVeel('Mijlpalen', ctx.mijlpalen().map(function (m, i) { return { id: m.id || 'mp' + i, pipeline: m.pipeline, mijlpaal: m.mijlpaal, volgorde: m.volgorde, kans: m.kans, dagenNorm: m.dagenNorm, rol: '' }; })); ctx._LEES = {}; }

/* ---- v7.9: register van cijfers ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    var M = ctx.METRIEKEN, ids = Object.keys(M), mist = ids.filter(function (id) { var d = M[id]; return !d.definitie || !d.eigenaar || !d.soort || (d.m && !d.besluit) || ctx.CIJFER_EIGENAREN.indexOf(d.eigenaar) < 0; });
    eis(!mist.length, 'register: elke sleutel heeft een definitie, een eigenaar uit de lijst, een soort en (bij een M-code) een besluit' + (mist.length ? ': ' + mist.join(', ') : ''));
    var codes = {}, ontbreekt = []; ids.forEach(function (id) { if (M[id].m) codes[M[id].m] = true; });
    for (var i = 1; i <= 36; i++) { var c0 = 'M' + ('0' + i).slice(-2); if (!codes[c0]) ontbreekt.push(c0); }
    eis(!ontbreekt.length, 'register: M01 t/m M36 staan erin' + (ontbreekt.length ? ' (ontbreekt: ' + ontbreekt.join(', ') + ')' : ''));
    var VERBODEN = ['activiteitPerType', 'trendZesWeken', 'dealwaardePerWeek', 'nieuwePerWeek', 'omzetprognose', 'mtPunten', 'gefactureerdTegenTarget', 'perMedewerker', 'perRegio', 'perTypeWerk', 'topScholen', 'productiviteitPerUur', 'omzetPerUurAm', 'urenPerStudent', 'activiteitVorigJaar', 'icpBacktest'];
    eis(VERBODEN.every(function (v) { return !ctx.uitMap(M, v); }), 'register: geen enkel geschrapt cijfer (deel A §2)');
    eis(M.afsprakenGehouden && M.afspraken && M.afsprakenGehouden.definitie !== M.afspraken.definitie && M.afsprakenGehouden.m === 'M15' && !M.afspraken.m, 'R18: afsprakenGehouden (M15) en afspraken (teammetriek, ongewijzigd) zijn twee sleutels met elk een eigen definitie');
    var oc = ctx.registerVan('ocActiviteit');
    eis(oc.m === 'M23' && oc.status === 'concept' && oc.wachtOp === 'besluit 8' && /besluit 8/.test(faalt(SOPHIE, 'apiCijferAftekenen', 'ocActiviteit', 1)), 'N13: M23 (ingepland = aanmaakdatum) staat op concept (besluit 8) en kan pas na besluit 8 afgetekend worden');
    // versie → concept → afgetekend; een nieuwe conceptversie verandert de geldende afgetekende versie niet tot ze afgetekend is
    var r0 = ctx.registerVan('gesprekken');
    eis(r0.versie === 0 && r0.status === 'concept' && r0.definitie === M.gesprekken.definitie, 'register: zonder rij in Cijferdefinities geldt de code (versie 0, concept)');
    roep(SOPHIE, 'apiCijferOpslaan', { metriek: 'gesprekken', definitie: 'Rooktest: gesprekken versie 1', eigenaar: 'beheerder', besluit: 'B4', tolerantie: '0', onderbouwing: 'Rooktest' });
    var r1 = ctx.registerVan('gesprekken'); ctx._LEES = {};
    eis(r1.versie === 1 && r1.status === 'concept' && r1.definitie === 'Rooktest: gesprekken versie 1', 'register: een nieuwe versie is een concept met versie 1');
    var af = roep(SOPHIE, 'apiCijferAftekenen', 'gesprekken', 1), g1 = af.cijfers.filter(function (c) { return c.id === 'gesprekken'; })[0];
    eis(g1.status === 'afgetekend' && g1.versie === 1 && g1.historie.length === 1 && g1.historie[0].afgetekendDoor === 'Sophie de Graaf', 'register: aftekenen door management zet de versie op afgetekend (met wie en wanneer)');
    roep(SOPHIE, 'apiCijferOpslaan', { metriek: 'gesprekken', definitie: 'Rooktest: gesprekken versie 2', eigenaar: 'beheerder', ingang: plusDagen(0) }); ctx._LEES = {};
    eis(ctx.registerVan('gesprekken').versie === 1 && ctx.registerVan('gesprekken').status === 'afgetekend', 'register: een nieuwere conceptversie verdringt de afgetekende versie niet');
    roep(SOPHIE, 'apiCijferAftekenen', 'gesprekken', 2); ctx._LEES = {};
    var r2 = ctx.registerVan('gesprekken');
    eis(r2.versie === 2 && r2.definitie === 'Rooktest: gesprekken versie 2' && roep(SOPHIE, 'apiCijfers', {}).cijfers.filter(function (c) { return c.id === 'gesprekken'; })[0].historie.length === 2, 'register: na aftekenen geldt versie 2; versie 1 blijft in de historie');
    eis(/toegang/.test(faalt(YARA, 'apiCijferOpslaan', { metriek: 'gesprekken', definitie: 'x', eigenaar: 'beheerder' })) && /toegang/.test(faalt(LARS, 'apiCijferAftekenen', 'gesprekken', 2)) && /toegang/.test(faalt(FEMKE, 'apiCijferOpslaan', { metriek: 'gesprekken', definitie: 'x', eigenaar: 'beheerder' })),
      'register: een teamlead en een medewerker mogen geen versie maken of aftekenen');
    eis(/Onbekend cijfer/.test(faalt(SOPHIE, 'apiCijferOpslaan', { metriek: 'constructor', definitie: 'x', eigenaar: 'beheerder' })) && /Onbekend cijfer/.test(faalt(SOPHIE, 'apiCijferOpslaan', { metriek: '__proto__', definitie: 'x', eigenaar: 'beheerder' })) &&
      /Onbekend cijfer/.test(faalt(SOPHIE, 'apiCijferAftekenen', 'toString', 1)) && /tolerantie/.test(faalt(SOPHIE, 'apiCijferOpslaan', { metriek: 'gesprekken', definitie: 'x', eigenaar: 'beheerder', tolerantie: 'veel' })) &&
      /eigenaar/.test(faalt(SOPHIE, 'apiCijferOpslaan', { metriek: 'gesprekken', definitie: 'x', eigenaar: 'iemand' })), 'N1: constructor, __proto__ en toString als cijfer geven "Onbekend cijfer."; een ongeldige tolerantie of eigenaar wordt geweigerd');
    var kort = roep(LARS, 'apiCijfers', { kort: true });
    eis(ids.every(function (id) { return kort.defs[id] && kort.defs[id].definitie && typeof kort.defs[id].versie === 'number'; }) && /^7\.9\.1\|/.test(kort.stempel) && kort.defs.contactmomenten.status === 'afgetekend', 'apiCijfers({ kort: true }): een definitie voor elke sleutel (ook voor een medewerker), met versie, status en een stempel');
    // R9: Home, Vandaag, Financiën, het teamrapport en het oude rapport lezen het register niet
    var tel = leesTeller(function () { roep(SOPHIE, 'apiHome'); roep(SOPHIE, 'apiOverzicht'); roep(SOPHIE, 'apiFinancien', ''); roep(SOPHIE, 'apiTeamRapport', 'maand', 'consultancy', '', 0); roep(SOPHIE, 'apiRapport', 'maand', '', 0); });
    eis(!tel.Cijferdefinities && ['apiHome', 'apiOverzicht', 'apiFinancien', 'apiTeamRapport', 'apiRapport'].every(function (f) { return String(ctx[f]).indexOf('definitiesVan(') < 0 && String(ctx[f]).indexOf('registerVan(') < 0; }),
      'R9: apiHome, apiOverzicht, apiFinancien, apiTeamRapport en apiRapport lezen Cijferdefinities niet en roepen definitiesVan niet aan');
    var mt = roep(SOPHIE, 'apiSturing', 'mt', {}), wk = roep(SOPHIE, 'apiSturing', 'week', {}), dq = roep(SOPHIE, 'apiSturing', 'datakwaliteit', {});
    eis(mt.blokken.every(function (b) { return b.cijfers.every(function (c) { return mt.defs[c.id] && mt.defs[c.id].definitie && c.def.definitie && typeof c.def.versie === 'number'; }); }) && ['contactmomenten', 'ap', 'voorstellen', 'gewonnen', 'registratievertraging'].every(function (k) { return wk.defs[k] && wk.defs[k].definitie; }) && dq.defs.datakwaliteit,
      'apiSturing geeft defs voor elk getoond cijfer (MT, week en datakwaliteit)');
  } catch (e) { eis(false, 'v7.9 register van cijfers: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: één definitie per naam (punt 17; R9, R10) ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    var sj = sjNu(), D = ctx.financienData();
    function homeTe(code) { return roep(code, 'apiHome').kerncijfers.teFactureren; }
    // Home (euro's) tegen Financiën (centen) voor dezelfde projecten: de zichtbare lopende projecten van het management
    var lopend = ctx.lees('Trajecten').filter(function (t) { return ctx.projectLopend(t); }), som = 0;
    lopend.forEach(function (t) { var F = ctx.financienProject(t, D.fac[t.id] || [], D.uren[t.id] || [], ctx.termijnDagenVan(t, D)); som += Math.max(0, F.nogTeFactureren); });
    var fin = roep(SOPHIE, 'apiFinancien', sj), perP = {}; fin.scholen.forEach(function (s) { s.projecten.forEach(function (p) { perP[p.id] = p; }); });
    var gelijk = lopend.filter(function (t) { return perP[t.id]; }).every(function (t) { return perP[t.id].nogTeFactureren === ctx.nogTeFacturerenVan(t, D.fac[t.id] || []); });
    eis(Math.round(homeTe(SOPHIE) * 100) === som && gelijk, 'R10: Home teFactureren × 100 = de som van max(0, nogTeFactureren) in centen van dezelfde projecten; Financiën rekent per project met dezelfde helper (' + homeTe(SOPHIE) + ' euro)');
    // één verzonnen project: contract € 1.200, één verzonden termijn van € 200 → precies 1000 euro erbij (niet 100000)
    var voor = homeTe(FEMKE);
    ctx.schrijf('Trajecten', { id: 'rk-nf', school: 'Esdoorn Lyceum', schoolId: 's1', traject: 'Rooktest nog te factureren', schooljaar: sj, status: 'bezig', am: 'Femke de Wit', contractwaarde: 1200, omzet: 1200, start: plusDagen(-30), eind: plusDagen(60) });
    ctx.schrijf('Facturen', { id: 'rk-nf-1', trajectId: 'rk-nf', omschrijving: 'Termijn 1', bedrag: 200, datum: plusDagen(-5), status: 'verzonden', verzonden: plusDagen(-5) });
    var na = homeTe(FEMKE), tNf = ctx.vind('Trajecten', 'rk-nf');
    eis(Math.round((na - voor) * 100) === 100000 && ctx.nogTeFacturerenVan(tNf, [ctx.vind('Facturen', 'rk-nf-1')]) === 100000, 'R10: één project met contract € 1.200 en een verzonden termijn van € 200 geeft op Home precies 1000 (euro) erbij, de helper 100000 (centen)');
    var telH = leesTeller(function () { roep(FEMKE, 'apiHome'); roep(SOPHIE, 'apiHome'); });
    eis(!telH.TalentUren && !telH.TalentUren_archief, 'R9: Home leest TalentUren niet (nog te factureren zonder uren)');
    // contractwaarde: bedrijfscijfer = Vandaag = de som van het contract uit Financiën voor de projecten van het schooljaar (niet gestopt, offerte, onduidelijk)
    var fin2 = roep(SOPHIE, 'apiFinancien', sj), contract = 0;
    fin2.scholen.forEach(function (s) { s.projecten.forEach(function (p) { if (p.schooljaar === sj && ['gestopt', 'offerte', 'onduidelijk'].indexOf(p.status) < 0) contract += p.contract; }); });
    var bc = ctx.bedrijfCijfers(), ov = roep(SOPHIE, 'apiOverzicht');
    eis(Math.round(bc.cijfers.contractwaarde * 100) === contract && Math.round(ov.kpi.omzet * 100) === contract && !('omzet' in bc.cijfers) && bc.metrieken.some(function (m) { return m.id === 'contractwaarde'; }),
      'contractwaarde: het bedrijfscijfer en Vandaag (kpi.omzet) zijn de som van het contract uit Financiën voor het schooljaar (' + contract / 100 + ')');
    // gewogen pijplijn: waarde × fasegewicht van de mijlpaal; lead weegt 0; een percentage per kans telt niet meer
    ctx.schrijfVeel('Kansen', [{ id: 'k8', kans: 99 }]); ctx._LEES = {};
    var mp = ctx.mijlpaalMap(), k8 = ctx.kansUit(ctx.vind('Kansen', 'k8'), mp), k9 = ctx.kansUit(ctx.vind('Kansen', 'k9'), mp);
    var pip = roep(SOPHIE, 'apiPipeline').kansen.filter(function (k) { return k.id === 'k8'; })[0];
    eis(k8.fase === 'gesprek' && k8.kans === 25 && k8.gewogen === Math.round(k8.waarde * 25 / 100) && pip.gewogen === k8.gewogen && k9.fase === 'lead' && k9.kans === 0 && k9.gewogen === 0,
      'gewogen = waarde × fasegewicht van de mijlpaal (gesprek 25%, ook als de kans zelf 99% zegt); de leadfase weegt 0');
    var home = roep(SOPHIE, 'apiHome').pipeline, open = roep(SOPHIE, 'apiPipeline').kansen.filter(function (k) { return k.fase !== 'gewonnen' && k.fase !== 'verloren'; });
    eis(home.gewogen === open.reduce(function (s, k) { return s + k.gewogen; }, 0), 'Home: de gewogen pijplijn is de som van dezelfde gewogen waarden als de pipeline');
    // voorstellen: een losse tijdlijnregel telt niet, een wissel wel
    var vanW = plusDagen(-3), totW = plusDagen(0), c0 = consultancyTotaal(vanW, totW);
    ctx.schrijf('Activiteiten', { type: 'fase', datum: plusDagen(-1) + ' 10:00', door: 'Lars Visser', schoolId: 's1', kansId: 'k16', onderwerp: 'Mijlpaal: gesprek → voorstel', bron: 'app', aangemaakt: plusDagen(-1) + ' 10:00' });
    var c1 = consultancyTotaal(vanW, totW);
    roep(LARS, 'apiKansOpslaan', { id: 'k16', fase: 'voorstel', _oud: { fase: 'gesprek' } });
    var c2 = consultancyTotaal(vanW, totW);
    eis(tVan(c1, 'voorstellen') === tVan(c0, 'voorstellen') && tVan(c2, 'voorstellen') === tVan(c0, 'voorstellen') + 1, 'voorstellen: een losse tijdlijnregel "Mijlpaal: x → voorstel" telt niet, een wissel wel');
  } catch (e) { eis(false, 'v7.9 één definitie per naam: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: datacontracten (punt 9): per contract een geval dat slaagt en een geval dat zakt, de vijf regressies uit de Mac-code, de pure functie (R16) ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    var sj = sjNu(), vandaag = plusDagen(0), wk = ctx.isoWeekStr(new CtxDate79()), open = function (S) { return S.kansen.filter(function (k) { return k.fase !== 'gewonnen' && k.fase !== 'verloren'; }); };
    var C0 = contractenOp();
    eis(ctx.CONTRACTEN.length === 19 && ctx.CONTRACTEN.every(function (c) { return C0[c[0]] && ctx.CONTRACT_STANDEN.indexOf(C0[c[0]].stand) >= 0; }), 'negentien contracten, elk met een stand uit geslaagd, gezakt, niet getoetst of geblokkeerd');
    function paar(id, goed, fout, extra) {
      var G = contractenOp(goed)[id], F = contractenOp(fout)[id];
      eis(G.stand === 'geslaagd' && F.stand === 'gezakt' && F.afwijkingen.length > 0 && (!extra || extra(G, F)), 'contract ' + id + ': slaagt (' + G.stand + (G.reden ? ', ' + G.reden : '') + ') en zakt (' + F.stand + ', ' + F.afwijkingen.length + ' afwijking(en))');
    }
    var vulVv = function (S) { open(S).forEach(function (k) { if (S.vanafVoorstel[k.id]) { k.waarde = 1000; k.verwachteSluiting = ctx.plusDagenVan(vandaag, 10); } }); };
    paar('waarde_vanaf_voorstel', vulVv, function (S) { vulVv(S); var k = open(S).filter(function (x) { return S.vanafVoorstel[x.id]; })[0]; k.waarde = 0; }, function (G, F) { return F.afwijkingen[0].soort === 'kans'; });
    paar('sluitdatum_vanaf_voorstel', vulVv, function (S) { vulVv(S); open(S).filter(function (x) { return S.vanafVoorstel[x.id]; })[0].verwachteSluiting = plusDagen(-1); });
    eis(contractenOp()['dekking_robuust'].stand === 'niet getoetst', 'contract dekking_robuust: zonder aanname dekkingTolerantie niet getoetst (nooit geslaagd)');
    paar('dekking_robuust', function (S) { S.normen.dekkingTolerantie = 0.5; open(S).forEach(function (k) { k.waarde = 1000; }); },
      function (S) { S.normen.dekkingTolerantie = 0.0001; var k = open(S).filter(function (x) { return String(x.schooljaar) === sj && S.gewicht[x.id] > 0; })[0]; k.waarde = 0; });
    eis(contractenOp()['geen_bulk_op_werkelijke_datum'].stand === 'niet getoetst', 'contract geen_bulk_op_werkelijke_datum: zonder aanname bulkDrempel niet getoetst');
    paar('geen_bulk_op_werkelijke_datum', function (S) { S.normen.bulkDrempel = 100; }, function (S) {
      S.normen.bulkDrempel = 1; ['rk-bulk1', 'rk-bulk2'].forEach(function (id, i) { S.wissels.push(cx({ id: id, kansId: 'k8', van: 'lead', naar: 'gesprek', werkelijkeDatum: vandaag, ingevoerdOp: vandaag + ' 10:0' + i, eigenaar: 'Noor Hendriks', bron: 'bulk', zekerheid: 'vastgelegd' })); }); });
    paar('actieve_eigenaar', null, function (S) { open(S)[0].eigenaar = 'Oud-collega Verzonnen'; }, function (G, F) { return F.afwijkingen[0].eigenaar === 'beheerder'; });
    paar('geen_dubbele_open_kansen', null, function (S) { var k = open(S)[0], kopie = cx(k); kopie.id = 'rk-dubbel'; kopie.eigenaar = k.eigenaar === 'Lars Visser' ? 'Noor Hendriks' : 'Lars Visser'; S.kansen.push(kopie); },
      function (G, F) { return F.afwijkingen.some(function (a) { return a.id === 'rk-dubbel'; }); });
    // verliesdiscipline: (a) elke eigenaar met open kansen zette dit schooljaar een kans op verloren; (b) geen open kans langer stil dan de norm
    var verlorenVoorIeder = function (S) { S.normen.verliesNormWeken = 1000; open(S).forEach(function (k, i) { S.wissels.push(cx({ id: 'rk-vl' + i, kansId: 'rk-x' + i, van: 'voorstel', naar: 'verloren', werkelijkeDatum: vandaag, ingevoerdOp: vandaag + ' 10:00', eigenaar: k.eigenaar, bron: 'verloren', reden: 'te duur', zekerheid: 'vastgelegd' })); }); };
    paar('verliesdiscipline', verlorenVoorIeder, function (S) { verlorenVoorIeder(S); S.wissels = S.wissels.filter(function (w) { return !(w.naar === 'verloren' && w.eigenaar === 'Lars Visser'); }); },
      function (G, F) { return F.afwijkingen.some(function (a) { return a.eigenaar === 'Lars Visser' && a.soort === 'regel'; }); });
    var alleenGewonnen = contractenOp(function (S) { S.normen.verliesNormWeken = 1000; S.wissels = S.wissels.filter(function (w) { return w.naar !== 'verloren'; }); open(S).forEach(function (k, i) { S.wissels.push(cx({ id: 'rk-w' + i, kansId: 'rk-y' + i, van: 'voorstel', naar: 'gewonnen', werkelijkeDatum: vandaag, ingevoerdOp: vandaag + ' 10:00', eigenaar: k.eigenaar, bron: 'winformulier', zekerheid: 'vastgelegd' })); }); }).verliesdiscipline;
    eis(alleenGewonnen.stand === 'gezakt', 'regressie 1 (Mac-code): een eigenaar die alleen kansen won, zakt voor verliesdiscipline (gewonnen telt niet als gesloten)');
    eis(contractenOp(function (S) { verlorenVoorIeder(S); S.normen.verliesNormWeken = null; }).verliesdiscipline.stand === 'niet getoetst', 'contract verliesdiscipline: zonder aanname verliesNormWeken is het tweede deel niet getoetst (nooit geslaagd)');
    // weekdoel: exact deze ISO-week (regressie 2: de vergelijking op het einde van het weeknummer)
    var metDoelen = function (sleutel) { return function (S) { S.doelen = S.doelen.filter(function (d) { return d.periode !== 'week'; }); S.consultancy.forEach(function (n) { S.doelen.push(cx({ id: 'rk-wd-' + n, eigenaar: n, periode: 'week', metric: 'ap', doel: 2, periodeSleutel: sleutel })); }); }; };
    var nep = wk.slice(0, 6) + '0' + wk.slice(-1);  // hetzelfde laatste cijfer, een andere week (bijv. 2026-W46 → 2026-W06)
    if (nep === wk) nep = wk.slice(0, 6) + '1' + wk.slice(-1);
    paar('weekdoel_voor_deze_week', metDoelen(wk), metDoelen(nep));
    eis(nep !== wk && nep.slice(-1) === wk.slice(-1) && contractenOp(metDoelen(nep)).weekdoel_voor_deze_week.afwijkingen.length === ctx.teamNamen('consultancy').length, 'regressie 2 (Mac-code): een weekdoel voor ' + nep + ' telt niet voor ' + wk + ' (exacte vergelijking)');
    var wdAf = contractenOp(metDoelen(nep)).weekdoel_voor_deze_week.afwijkingen, gIds = ctx.lees('Gebruikers').map(function (g) { return String(g.id); });
    eis(wdAf.every(function (a) { return a.soort === 'doel' && gIds.indexOf(a.id.slice(0, -9)) >= 0 && a.id.slice(-8) === wk && !/visser|hendriks|amrani/i.test(a.id); }), 'review P4: de verwijzing bij het weekdoel is <gebruikers-id>-<week>, geen naam');
    var schoneWissels = function (S) { S.wissels = S.wissels.filter(function (w) { var inv = String(w.ingevoerdOp).slice(0, 10); return !(inv >= sj.slice(0, 4) + '-08-01') || (w.werkelijkeDatum && w.werkelijkeDatum <= inv && (['import', 'capsule', 'reconstructie', 'tijdlijn'].indexOf(w.bron) < 0 || w.zekerheid)); }); };
    paar('fasewissel_heeft_werkelijke_datum', schoneWissels, function (S) { schoneWissels(S); S.wissels.push(cx({ id: 'rk-zd', kansId: 'k6', van: 'gesprek', naar: 'voorstel', werkelijkeDatum: '', ingevoerdOp: vandaag + ' 09:00', eigenaar: 'Noor Hendriks', bron: 'import', zekerheid: '' })); });
    var ld = contractenOp(function (S) { S.normen.bulkDrempel = 100; }).logdekking;
    eis(ld.stand === 'geblokkeerd' && /agenda-toegang/.test(ld.reden) && C0.logdekking.stand === 'geblokkeerd', 'regressie 3 (Mac-code): logdekking is geblokkeerd tot besluit 10 en nooit geslaagd zonder meting');
    var brinAlle = function (S) { S.scholen.forEach(function (s, i) { s.brin = s.brin || '98X' + String.fromCharCode(65 + (i % 26)); }); };
    paar('school_heeft_brin', brinAlle, function (S) { brinAlle(S); S.scholen.filter(function (s) { return s.id === 's11'; })[0].brin = ''; });
    // R12: een verzonnen particulier zonder BRIN met een open kans in een gewogen fase zakt zonder scope en niet met scope ['particulier']
    var part = function (scope) { return function (S) { brinAlle(S); S.scholen.push(cx({ id: 'rk-part', naam: 'Bijles Verzonnen', type: 'Particulier', brin: '', eigenaar: 'Noor Hendriks' })); var k = cx({ id: 'rk-pk', naam: 'Bijles', school: 'Bijles Verzonnen', schoolId: 'rk-part', fase: 'gesprek', pipeline: 'Scholen', eigenaar: 'Noor Hendriks', schooljaar: sj, klant: 'nieuw', productsoort: 'overig' }); S.kansen.push(k); S.rol[k.id] = 'ap'; S.vanafVoorstel[k.id] = false; S.scope = scope ? cx(scope) : null; }; };
    eis(contractenOp(part(null)).school_heeft_brin.stand === 'gezakt' && contractenOp(part(['particulier'])).school_heeft_brin.stand === 'geslaagd', 'R12: een particulier zonder BRIN zakt school_heeft_brin zonder scope en niet met scope [particulier]');
    // noemerbewaking (N12, B3)
    var scopes = cx({ 1: ['particulier'] });
    var nb = function (j) { return contractenOp(function (S) { S.jaardoel = j ? cx(j) : null; S.scopeVersies = scopes; }).noemerbewaking; };
    eis(nb(null).stand === 'geblokkeerd' && /besluit jaardoel/.test(nb(null).reden) && nb({ noemer: 'contracteerdoel', contracteerdoel: { waarde: 100000 } }).stand === 'geblokkeerd', 'N12: noemerbewaking zonder (volledig) jaardoel geblokkeerd, ook met een los contracteerdoel');
    eis(nb({ soort: 'netto-omzet', periode: 'boekjaar', scope: 'scope v1', noemer: 'jaardoel', waarde: 500000 }).stand === 'gezakt' && nb({ soort: 'contractwaarde', periode: 'schooljaar', scope: 'scope v1', noemer: 'jaardoel', waarde: 500000 }).stand === 'geslaagd' &&
      nb({ soort: 'contractwaarde', periode: 'schooljaar', scope: 'scope v7', noemer: 'jaardoel', waarde: 500000 }).stand === 'geblokkeerd', 'contract noemerbewaking: zakt met een netto-omzetdoel als noemer, slaagt met contractwaarde per schooljaar; een scope zonder vastgelegde versie maakt het jaardoel onvolledig');
    paar('geen_target_op_facturatie', function (S) { S.doelVersies = cx([]); }, function (S) { S.doelVersies = cx([{ id: 'aa-doelpadCurve-v1', naam: 'doelpadCurve', waarde: { bron: 'gefactureerd', totaal: [[0, 0]] } }]); });
    var getekendAlle = function (S) { S.wissels.forEach(function (w) { if (w.naar === 'gewonnen' && !w.werkelijkeDatum) w.werkelijkeDatum = String(w.ingevoerdOp).slice(0, 10); }); S.kansen.filter(function (k) { return k.fase === 'gewonnen'; }).forEach(function (k) { S.trajecten.push(cx({ id: 'rk-t-' + k.id, kansId: k.id, contractwaarde: 1000, status: 'afgelopen', schooljaar: sj })); }); };
    paar('gewonnen_is_getekend', getekendAlle, function (S) { getekendAlle(S); S.wissels.push(cx({ id: 'rk-gw', kansId: 'rk-gk', van: 'voorstel', naar: 'gewonnen', werkelijkeDatum: vandaag, ingevoerdOp: vandaag + ' 11:00', eigenaar: 'Lars Visser', bron: 'winformulier', zekerheid: 'vastgelegd' })); S.trajecten.push(cx({ id: 'rk-gt', kansId: 'rk-gk', contractwaarde: '', status: 'opstart', schooljaar: sj })); },
      function (G, F) { return F.afwijkingen.some(function (a) { return a.id === 'rk-gk' && a.eigenaar === 'Lars Visser'; }); });
    var contractAlle = function (S) { S.normen.overstapDatum = '2999-01-01'; S.trajecten.forEach(function (t) { t.contractwaarde = t.contractwaarde || 1000; }); };
    eis(contractenOp(function (S) { S.trajecten.forEach(function (t) { t.contractwaarde = t.contractwaarde || 1000; }); }).lopend_project_heeft_contract.stand === 'niet getoetst', 'contract lopend_project_heeft_contract: zonder overstapdatum is het kansId-deel niet getoetst');
    paar('lopend_project_heeft_contract', contractAlle, function (S) { contractAlle(S); S.trajecten.filter(function (t) { return ctx.projectLopend(t); })[0].contractwaarde = ''; });
    paar('kans_heeft_schooljaar_en_klant', null, function (S) { open(S)[0].klant = ''; });
    var nummersUniek = function (S) { S.facturen.forEach(function (f, i) { f.factuurnummer = String(20260000 + i); }); };
    paar('termijn_verzonden_heeft_factuurnummer', nummersUniek, function (S) { nummersUniek(S); var v = S.facturen.filter(function (f) { return f.status === 'verzonden' || f.status === 'betaald'; }); v[1].factuurnummer = v[0].factuurnummer; });
    var tariefGoed = function (S) { S.normen.standaardTarief = 1; S.trajecten.forEach(function (t) { t.tarief = 45; t.xpsProject = t.xpsProject || '10.000'; }); };
    eis(contractenOp(function (S) { S.trajecten.forEach(function (t) { t.tarief = 45; t.xpsProject = t.xpsProject || '10.000'; }); }).tarief_echt.stand === 'niet getoetst', 'contract tarief_echt: zonder aanname standaardTarief is het standaarddeel niet getoetst');
    paar('tarief_echt', tariefGoed, function (S) { tariefGoed(S); var metUren = {}; S.uren.forEach(function (u) { metUren[u.trajectId] = true; }); S.trajecten.filter(function (t) { return ctx.projectLopend(t) && metUren[t.id]; })[0].tarief = 0; });
    var vorig = ctx.vorigSchooljaar(sj), verlAlle = function (S) { S.trajecten.forEach(function (t) { if (t.schooljaar === vorig) t.verlenging = t.verlenging || 'verlengd'; }); };
    paar('verlenging_bekend', verlAlle, function (S) { verlAlle(S); S.trajecten.push(cx({ id: 'rk-vb', schooljaar: vorig, status: 'afgelopen', am: 'Femke de Wit', verlenging: '' })); });
    // rolcontracten geblokkeerd zonder rollen (B1), nooit geslaagd
    rollenWeg(); var CR = contractenOp(); standTerug(SEED79); ctx._LEES = {};
    eis(['waarde_vanaf_voorstel', 'sluitdatum_vanaf_voorstel', 'school_heeft_brin'].every(function (id) { return CR[id].stand === 'geblokkeerd' && /rollen niet ingesteld/.test(CR[id].reden); }), 'B1: zonder ingestelde rollen staan waarde_vanaf_voorstel, sluitdatum_vanaf_voorstel en school_heeft_brin op geblokkeerd');
    // regressie 4: een sluiting zonder wissel gaf geen event; apiImporteer('kansen') met fase gewonnen geeft een wissel (bron import) die als deal telt
    roep(SOPHIE, 'apiImporteer', 'kansen', [{ id: 'rk-imp', naam: 'Import gewonnen', school: 'Esdoorn Lyceum', schoolId: 's1', fase: 'gewonnen', gesloten: plusDagen(-2), eigenaar: 'Noor Hendriks', waarde: 4000 }]); ctx._LEES = {};
    eis(ctx.dealWissels().some(function (w) { return w.kansId === 'rk-imp' && w.bron === 'import'; }), 'regressie 4 (Mac-code): een sluiting uit de import geeft een wissel die als deal telt');
    // regressie 5: een gesloten kans zonder reden telde als gewonnen; verloren zonder reden is nooit een deal (M08, score van M13)
    var m08voor = mtCijfers().gewonnenWaarde.extra.aantal, dealsVoor = ctx.dealsTussen(plusDagen(-3), plusDagen(0));
    ctx.schrijf('Kansen', { id: 'rk-vz', naam: 'Verloren zonder reden', school: 'Esdoorn Lyceum', schoolId: 's1', fase: 'verloren', verliesReden: '', gesloten: plusDagen(-1), eigenaar: 'Lars Visser', waarde: 5000, pipeline: 'Scholen' });
    ctx.fasewisselsSchrijven([ctx.faseWisselRij(ctx.vind('Kansen', 'rk-vz'), 'voorstel', 'verloren', { bron: 'import', datum: plusDagen(-1), zekerheid: 'laag', id: 'rk-vz-w' })]); ctx._LEES = {};
    eis(!ctx.dealWissels().some(function (w) { return w.kansId === 'rk-vz'; }) && mtCijfers().gewonnenWaarde.extra.aantal === m08voor && ctx.dealsTussen(plusDagen(-3), plusDagen(0)) === dealsVoor, 'regressie 5 (Mac-code): verloren zonder reden telt nooit als deal (M08 en de score van M13)');
    // R16: de pure functie geeft voor elke GEBRUIKER dezelfde uitkomst en zet GEBRUIKER niet om
    vers79(); var S = ctx.standVoorContracten(vandaag), uit = [];
    [null, { id: 'g-lars', naam: 'Lars Visser', team: 'consultancy', rol: 'medewerker' }, { id: 'g-femke', naam: 'Femke de Wit', team: 'accountmanagement', rol: 'medewerker' }].forEach(function (g) { ctx.GEBRUIKER = g; uit.push(JSON.stringify(ctx.datacontracten(S))); uit.push(ctx.GEBRUIKER === g ? 'zelfde' : 'OMGEZET'); });
    ctx.GEBRUIKER = null;
    eis(uit[0] === uit[2] && uit[2] === uit[4] && uit[1] === 'zelfde' && uit[3] === 'zelfde' && uit[5] === 'zelfde' && !/\bmag\(|isBeheerder\(|ikNaam\(|GEBRUIKER/.test(String(ctx.datacontracten)), 'R16: datacontracten is puur: dezelfde uitkomst voor drie gebruikers, GEBRUIKER blijft staan, geen mag/isBeheerder/ikNaam in de functie');
  } catch (e) { eis(false, 'v7.9 datacontracten: onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }
})();

/* ---- v7.9: datakwaliteit en meldingen (punt 10; R3, N12) ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    var vandaag = plusDagen(0), dqMeld = function () { return ctx.lees('Meldingen').filter(function (m) { return m.link === 'rapport:datakwaliteit'; }); };
    eis(ctx.lees('Datakwaliteit').some(function (r) { return r.dag === vandaag; }) && ctx.datakwaliteitDag(vandaag).al === true, 'de seed heeft de datacontracten van vandaag; een tweede run dezelfde dag schrijft niets');
    ctx.verwijderRijen('Datakwaliteit', function () { return true; });
    // een open kans met een eigenaar die niet (meer) actief is: actieve_eigenaar zakt; de beheerder (management, ook de eigenaar van het script) krijgt de melding
    ctx.schrijf('Kansen', { id: 'rk-oud', naam: 'Kans van een oud-collega', school: 'Esdoorn Lyceum', schoolId: 's1', fase: 'gesprek', pipeline: 'Scholen', eigenaar: 'Oud-collega Verzonnen', waarde: 1000, schooljaar: sjNu(), klant: 'nieuw', productsoort: 'overig', aangemaakt: plusDagen(-3) + ' 09:00' });
    ctx._LEES = {}; ctx.GEBRUIKER = null;
    var r = ctx.datakwaliteitDag(vandaag), rijen = ctx.lees('Datakwaliteit').filter(function (x) { return x.dag === vandaag; }), C = {}; ctx.datacontracten(ctx.standVoorContracten(vandaag)).forEach(function (c) { C[c.id] = c; });
    var klopt = Object.keys(C).every(function (id) {
      var eigen = rijen.filter(function (x) { return x.contract === id; });
      if (C[id].stand !== 'gezakt') return eigen.length === 1 && eigen[0].eigenaar === 'beheerder' && eigen[0].stand === C[id].stand && Number(eigen[0].aantal) === 0;
      var per = {}; C[id].afwijkingen.forEach(function (a) { per[a.eigenaar] = (per[a.eigenaar] || 0) + 1; });
      return eigen.length === Object.keys(per).length && eigen.every(function (x) { return x.stand === 'gezakt' && Number(x.aantal) === per[x.eigenaar] && JSON.parse(x.verwijzingen).length === Math.min(50, per[x.eigenaar]); });
    });
    eis(!r.al && r.rijen === rijen.length && klopt, 'datakwaliteit: per gezakt contract één rij per eigenaar (aantal en hoogstens 50 verwijzingen), per ander contract één rij voor de beheerder');
    var m = dqMeld(), perVoor = {}; m.forEach(function (x) { perVoor[x.voor] = (perVoor[x.voor] || 0) + 1; });
    var beheer = m.filter(function (x) { return x.voor === 'Sophie de Graaf'; })[0];
    eis(m.length === r.meldingen && Object.keys(perVoor).every(function (v) { return perVoor[v] === 1; }) && !!beheer && beheer.door === 'Athena' && /Elke open kans heeft een actieve eigenaar/.test(beheer.tekst),
      'R3: één melding per ontvanger; de beheerder (eigenaar van het script, in een trigger ikNaam()) krijgt de melding voor actieve_eigenaar met door Athena');
    eis(m.every(function (x) { return !/Logdekking|Noemerbewaking/.test(x.tekst); }), 'N12: geblokkeerd of niet getoetst geeft geen melding (logdekking, noemerbewaking)');
    var n0 = ctx.lees('Datakwaliteit').length, nm = dqMeld().length, r2 = ctx.datakwaliteitDag(vandaag);
    eis(r2.al && ctx.lees('Datakwaliteit').length === n0 && dqMeld().length === nm, 'datakwaliteit: een tweede run dezelfde dag schrijft geen rijen en geen meldingen');
    // R3: tijdbewaking per stap (nagebootste klok: elke aanroep van Date.now() drie minuten later)
    var echtKlok = ctx.sturingKlok, n = 0, t0 = echtKlok(); ctx.sturingKlok = function () { return t0 + (n++) * 3 * 60000; };
    var uit; try { uit = ctx.sturingTrigger(); } finally { ctx.sturingKlok = echtKlok; }
    eis(uit && typeof uit.datakwaliteit === 'object' && uit.voorspelling === 'overgeslagen (tijd)' && uit.bevroren === 'overgeslagen (tijd)' && ctx._demoProps.LAATSTE_STURING, 'R3: na vier minuten slaat sturingTrigger de volgende stappen over ("overgeslagen (tijd)"); de volgende run haalt ze in');
    // archiveer: datakwaliteit ouder dan 90 dagen weg, Fasewissels blijven staan
    ctx.schrijf('Datakwaliteit', { id: 'dq-oud', dag: plusDagen(-100), contract: 'logdekking', eigenaar: 'beheerder', stand: 'geblokkeerd', aantal: 0, verwijzingen: '[]', aangemaakt: plusDagen(-100) + ' 06:45' });
    var fw = ctx.lees('Fasewissels').length, ar = ctx.archiveer();
    eis(!ctx.vind('Datakwaliteit', 'dq-oud') && ar.datakwaliteit >= 1 && ctx.lees('Fasewissels').length === fw && ctx.lees('Datakwaliteit').some(function (x) { return x.dag === vandaag; }), 'archiveer(): datakwaliteit ouder dan 90 dagen weg, die van vandaag en alle Fasewissels blijven');
  } catch (e) { eis(false, 'v7.9 datakwaliteit en meldingen: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9: voorspellingen (punt 18; R3, N8) ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    var ma = ctx.maandagVan(plusDagen(-14)), maS = ctx.datumStr(ma), dag = function (basis, n) { return ctx.plusDagenVan(basis, n); };  // een maandag twee weken terug: elke werkelijke datum ligt in het verleden
    // een bekende reeks: twaalf hele weken vóór deze week met 3, 1, 2, 0, 3, 1, 0, 0, 2, 1, 4, 0 deals (oudste eerst); per kans één deal.
    // review T5: de oudste week is niet 0 en de week van ma heeft al een deal, zodat een venster dat één week opschuift een ander getal geeft.
    // review C1: een deal telt alleen voor een kans die nu gewonnen is, dus elke verzonnen kans krijgt een rij in Kansen met die fase.
    var REEKS = [3, 1, 2, 0, 3, 1, 0, 0, 2, 1, 4, 0], kop = ctx.TABELLEN.Fasewissels, nr = 0;
    ctx._demoBladen.Fasewissels.rijen.length = 1; ctx._demoBladen.Voorspellingen.rijen.length = 1; ctx._LEES = {};
    var kansRij = function (id, fase) { return { id: id, naam: 'Voorspeltest ' + id, traject: 'Voorspeltest', school: 'Esdoorn Lyceum', schoolId: 's1', fase: fase, pipeline: 'Scholen', eigenaar: 'Lars Visser', waarde: 1000 }; };
    var rij = function (o) { nr++; var k = { id: o.kansId, schoolId: 's1', eigenaar: 'Lars Visser', waarde: 1000, pipeline: 'Scholen', fase: o.naar }; return ctx.faseWisselRij(k, o.van || 'voorstel', o.naar, { bron: 'demo', datum: o.datum, ingevoerdOp: (o.ingevoerd || o.datum) + ' 10:00', door: 'Lars Visser', id: 'rk-vs-' + nr }); };
    var rijen = [], kansen = [];
    REEKS.forEach(function (c, i) { var woensdag = dag(maS, -7 * (12 - i) + 2); for (var j = 0; j < c; j++) { rijen.push(rij({ kansId: 'rk-vk-' + i + '-' + j, naar: 'gewonnen', datum: woensdag })); kansen.push(kansRij('rk-vk-' + i + '-' + j, 'gewonnen')); } });
    rijen.push(rij({ kansId: 'rk-dw-0', naar: 'gewonnen', datum: maS }));  // al een deal in de week van ma vóór de voorspelling: telt niet mee in het venster
    ['rk-dw-0', 'rk-dw-1', 'rk-her'].forEach(function (id) { kansen.push(kansRij(id, 'gewonnen')); }); kansen.push(kansRij('rk-vz', 'verloren'));
    ctx.schrijfVeel('Kansen', kansen); ctx.fasewisselsSchrijven(rijen); ctx._LEES = {};
    var v = ctx.voorspelDealsWeek(ma);
    eis(v.verwacht === 1.4 && v.onder === 0 && v.boven === 3 && v.model === 'gemiddelde-hele-weken' && v.id === 'vd-' + ctx.isoWeekStr(ma) && v.van === maS && v.tot === dag(maS, 6), 'M13: de twaalf hele weken vóór deze week (nulweken tellen mee, de lopende week niet) → verwacht 1,4, p10 0, p90 3 (nearest rank); id per ISO-week, van maandag t/m zondag');
    var r1 = ctx.voorspellingenRun(maS), n1 = ctx.lees('Voorspellingen').length, r2 = ctx.voorspellingenRun(maS);
    eis(r1.voorspeld === 2 && r2.voorspeld === 0 && ctx.lees('Voorspellingen').length === n1, 'een tweede run op dezelfde maandag schrijft niets (idempotent op id)');
    // deze week: de deal van maandag, een verloren kans zonder reden (telt nooit) en een kans die gewonnen, heropend en opnieuw gewonnen wordt (telt één keer, N8)
    var extra = [rij({ kansId: 'rk-vz', naar: 'verloren', datum: dag(maS, 2) }),
      rij({ kansId: 'rk-her', naar: 'gewonnen', datum: dag(maS, 1) }), rij({ kansId: 'rk-her', van: 'gewonnen', naar: 'gesprek', datum: dag(maS, 2) }), rij({ kansId: 'rk-her', van: 'gesprek', naar: 'gewonnen', datum: dag(maS, 3) })];
    ctx.fasewisselsSchrijven(extra); ctx._LEES = {};
    // review C7: op de maandag erna is de registratiemarge (7 dagen) nog niet voorbij: nog niet gescoord
    var volgendeMa = dag(maS, 7), r3 = ctx.voorspellingenRun(volgendeMa), vd = ctx.vind('Voorspellingen', 'vd-' + ctx.isoWeekStr(ma));
    eis(r3.gescoord === 0 && !vd.gescoord && ctx.scoringsMarge() === 7, 'review C7: de maandag na de week is de marge (7 kalenderdagen) nog niet voorbij: niet gescoord');
    // een deal uit die week die pas na de week wordt ingevoerd (registratievertraging) telt nog mee
    ctx.fasewisselsSchrijven([rij({ kansId: 'rk-dw-1', naar: 'gewonnen', datum: dag(maS, 4), ingevoerd: dag(maS, 10) })]); ctx._LEES = {};
    var r3b = ctx.voorspellingenRun(dag(maS, 14)); vd = ctx.vind('Voorspellingen', 'vd-' + ctx.isoWeekStr(ma)); var vo = ctx.vind('Voorspellingen', 'vo30-' + maS);
    eis(r3b.gescoord >= 1 && Number(vd.werkelijk) === 3 && vd.gescoord && Number(vd.fout) === 1.6 && vd.binnenInterval === 'ja', 'scoren na de week en de marge: werkelijk 3 (de deal van maandag, een laat ingevoerde deal en één keer de heropende kans; verloren telt niet), fout 1,6, binnen het interval');
    eis(!vo.gescoord, 'M19 (opdrachten in 30 dagen) wordt pas na 30 dagen plus de marge gescoord');
    ctx.voorspellingenRun(dag(maS, 38)); ctx._LEES = {};
    eis(!!ctx.vind('Voorspellingen', 'vo30-' + maS).gescoord, 'M19 na 30 dagen plus de marge gescoord');
    // R3: een run op dinsdag zonder maandagrij schrijft "gemist" (geen getal) en een gemiste rij wordt niet gescoord
    ctx._demoBladen.Voorspellingen.rijen.length = 1; ctx._LEES = {};
    var dinsdag = dag(maS, 1), r4 = ctx.voorspellingenRun(dinsdag), gemist = ctx.vind('Voorspellingen', 'vd-' + ctx.isoWeekStr(ma));
    eis(r4.gemist === 2 && r4.voorspeld === 0 && gemist.model === 'gemist' && gemist.verwacht === '', 'R3: een run op dinsdag zonder maandagrij legt "gemist" vast, nooit een voorspelling achteraf');
    ctx.voorspellingenRun(dag(maS, 8)); ctx._LEES = {};
    eis(!ctx.vind('Voorspellingen', 'vd-' + ctx.isoWeekStr(ma)).gescoord && mtCijfers().voorspellingDeals.extra.gemist >= 1, 'een gemiste week wordt niet gescoord; het MT-overzicht telt hem bij M13');
  } catch (e) { eis(false, 'v7.9 voorspellingen: onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }
})();

/* ---- v7.9: sturingsweergaven (punt 11, 19, 20; B1, B3, R6, R12, R15, R16) ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    // --- week: rechten, beheerderregel, direct en zonder datum, exacte week, vertraging in kalenderdagen, geblokkeerd zonder rollen ---
    var wS = roep(SOPHIE, 'apiSturing', 'week', {}), wL = roep(LARS, 'apiSturing', 'week', {}), wY = roep(YARA, 'apiSturing', 'week', {});
    var namen = function (w) { return w.rijen.map(function (r) { return r.naam; }).sort().join(','); };
    eis(namen(wL) === 'Lars Visser' && namen(wY) === 'Lars Visser,Noor Hendriks,Yara El Amrani' && namen(wS) === 'Lars Visser,Noor Hendriks,Yara El Amrani,beheerder' && /toegang/.test(faalt(FEMKE, 'apiSturing', 'week', {})) && /toegang/.test(faalt('demo-sem', 'apiSturing', 'week', {})),
      'week: een OC ziet zichzelf, de teamlead zijn team, management iedereen plus de regel beheerder; AM en talent geen toegang');
    var somTeam = wS.rijen.filter(function (r) { return r.naam !== 'beheerder'; }).reduce(function (s, r) { return s + r.cijfers.contactmomenten; }, 0);
    eis(wS.totaal.cijfers.contactmomenten === somTeam && wY.totaal.cijfers.contactmomenten === somTeam && !wS.totaalUitleg, 'week: het teamtotaal is de som van de OC\'s (de beheerder telt niet mee); management en de teamlead zien het');
    eis(wL.totaal === null && /te klein/.test(wL.totaalUitleg) && ctx.WEEK_TOTAAL_MIN_ANDEREN === 3, 'review P5 (R8): een OC in een team met minder dan drie collega\'s ziet het teamtotaal niet (anders is totaal min eigen regel de som van één of twee collega\'s)');
    var w0 = wL.rijen[0].cijfers;
    roep(LARS, 'apiKansOpslaan', { naam: 'Direct in voorstel', schoolId: 's7', fase: 'voorstel', waarde: 2000, verwachteSluiting: plusDagen(20) });
    ctx.fasewisselsSchrijven([ctx.faseWisselRij(ctx.vind('Kansen', 'k16'), 'gesprek', 'voorstel', { bron: 'import', datum: '', zekerheid: '', id: 'rk-zd-w', ingevoerdOp: ctx.nu() })]);
    ctx.fasewisselsSchrijven([ctx.faseWisselRij(ctx.vind('Kansen', 'k16'), 'lead', 'gesprek', { bron: 'demo', datum: plusDagen(-7 - ctx.isoDag(new CtxDate79())), id: 'rk-vw-w' })]); ctx._LEES = {};
    var w1 = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers;
    eis(w1.direct === w0.direct + 1 && w1.voorstellen === w0.voorstellen + 1 && w1.zonderDatum === w0.zonderDatum + 1 && w1.ap === w0.ap, 'week: aangemaakt in voorstel telt als VO met label direct; een wissel zonder werkelijke datum staat apart; een wissel van vorige week telt niet (exacte week)');
    var D7 = vm.runInContext('Date', ctx), van0 = plusDagen(0), gisteren = plusDagen(-1);
    eis(ctx.registratieDagen({ werkelijkeDatum: van0, ingevoerdOp: van0 + ' 23:30' }) === 0 && ctx.registratieDagen({ werkelijkeDatum: gisteren, ingevoerdOp: van0 + ' 00:01' }) === 1 && ctx.mediaan(cx([3, 1, 2])) === 2 && ctx.mediaan(cx([1, 2, 3, 4])) === 2.5,
      'R15: registratievertraging in kalenderdagen (vandaag 23:30 = 0, gisteren → vandaag 00:01 = 1); mediaan');
    vers79(); rollenWeg();
    var wB = roep(SOPHIE, 'apiSturing', 'week', {}), r0 = wB.totaal;
    eis(!wB.rollenIngesteld && r0.cijfers.ap === null && r0.cijfers.voorstellen === null && /rollen niet ingesteld/.test(r0.geblokkeerd.ap) && typeof r0.cijfers.gewonnen === 'number', 'B1: zonder rollen geven AP, AD en VO in de week geen 0 maar geblokkeerd; deals tellen wel');
    var mB = mtCijfers();
    eis(['M12', 'M18', 'M19'].every(function (m) { return /rollen niet ingesteld/.test(mB[m].geblokkeerd) && mB[m].waarde === ''; }) && mB.M08.waarde !== '' && !mB.M08.geblokkeerd, 'B1: zonder rollen zijn M12, M18 en M19 geblokkeerd; M08 telt wel');
    vers79();
    // --- mt: definitie bij elk cijfer, uitsplitsingen sommeren, de noemerregel (B3), scope (R12), rechten ---
    var M0 = mtCijfers(), r = M0._r;
    eis(r.blokken.length === 9 && r.blokken.every(function (b) { return b.cijfers.every(function (c) { return c.def && c.def.definitie && typeof c.def.versie === 'number' && c.def.status; }); }), 'mt: negen blokken; elk cijfer heeft een definitie, versie en status uit het register');
    var somFout = []; r.blokken.forEach(function (b) { b.cijfers.forEach(function (c) { if (!c.uitsplitsing.length || c.waarde === '') return; var s = c.uitsplitsing.reduce(function (a, u) { return a + Number(u.waarde); }, 0); if (Math.abs(s - Number(c.waarde)) > 0.011) somFout.push(c.m + ' ' + s + ' ≠ ' + c.waarde); }); });
    eis(!somFout.length, 'mt: de uitsplitsingen sommeren tot het totaal' + (somFout.length ? ': ' + somFout.join('; ') : ''));
    var geenJd = ['M01', 'M05', 'M07', 'M11'].every(function (m) { return /besluit jaardoel/.test(M0[m].geblokkeerd) && M0[m].waarde === ''; });
    eis(geenJd, 'B3: zonder jaardoel zijn M01, M05, M07 en M11 geblokkeerd ("besluit jaardoel") met waarde leeg');
    aannameZet('scope', ['particulier']); aannameZet('doelpadCurve', { totaal: [[0, 0], [180, 0.5], [365, 1]], bron: 'reconstructie' });
    aannameZet('jaardoel', { noemer: 'contracteerdoel', contracteerdoel: { waarde: 400000, afleiding: 'Rooktest' } });
    var Ma = mtCijfers();
    eis(['M01', 'M05', 'M07', 'M11'].every(function (m) { return /besluit jaardoel/.test(Ma[m].geblokkeerd) && Ma[m].waarde === ''; }), 'B3: een ingevuld contracteerdoel zonder volledig jaardoel → M01, M05, M07 en M11 geblokkeerd, waarde leeg (geen terugval)');
    // review T3: volledig op de eigen waarde na (noemer contracteerdoel met een contracteerdoel) blijft geblokkeerd: geen terugval op het losse contracteerdoel
    aannameZet('jaardoel', { soort: 'netto-omzet', periode: 'boekjaar', scope: 'scope v1', noemer: 'contracteerdoel', contracteerdoel: { waarde: 400000, afleiding: 'Rooktest' } });
    var Mz = mtCijfers();
    eis(['M01', 'M05', 'M07', 'M11'].every(function (m) { return /besluit jaardoel/.test(Mz[m].geblokkeerd) && Mz[m].waarde === ''; }), 'review T3 (B3): een jaardoel dat volledig is op de waarde na (noemer contracteerdoel met contracteerdoel) → M01, M05, M07 en M11 geblokkeerd met waarde leeg');
    // review T3: een volledig jaardoel voor het vorige schooljaar telt niet voor dit schooljaar
    var sjVorig = (Number(sjNu().slice(0, 4)) - 1) + '-' + sjNu().slice(0, 4);
    aannameZet('jaardoel', { soort: 'contractwaarde', periode: 'schooljaar', scope: 'scope v1', noemer: 'jaardoel', waarde: 500000, schooljaar: sjVorig });
    var Mv = mtCijfers();
    eis(/het jaardoel is voor schooljaar/.test(Mv.M07.geblokkeerd) && Mv.M07.waarde === '', 'review T3 (B3): een volledig jaardoel voor het vorige schooljaar → M07 geblokkeerd ("het jaardoel is voor schooljaar …")');
    aannameZet('jaardoel', { soort: 'netto-omzet', periode: 'boekjaar', scope: 'scope v1', noemer: 'jaardoel', waarde: 900000 });
    var Mb = mtCijfers();
    eis(Mb.M01.waarde === 900000 && /teller is contractwaarde per schooljaar/.test(Mb.M05.geblokkeerd) && /teller is contractwaarde per schooljaar/.test(Mb.M07.geblokkeerd) && Mb.M07.waarde === '', 'B3: een netto-omzetdoel per boekjaar met noemer jaardoel → M05 en M07 geblokkeerd (de teller is contractwaarde per schooljaar)');
    aannameZet('retentie', 0.8);
    aannameZet('jaardoel', { soort: 'netto-omzet', periode: 'boekjaar', scope: 'scope v1', noemer: 'contracteerdoel', waarde: 900000, contracteerdoel: { waarde: 400000, afleiding: 'Rooktest' } });
    var Mc = mtCijfers();
    eis(typeof Mc.M07.waarde === 'number' && Mc.M07.extra.noemerLabel === 'afgeleid contracteerdoel' && Mc.M07.extra.noemer === 400000 && typeof Mc.M05.waarde === 'number' && /afgeleid contracteerdoel/.test(Mc.M11.geblokkeerd || Mc.M03.extra.verdeling || ''),
      'B3: noemer contracteerdoel met een geneste waarde → M05 en M07 berekend met het label "afgeleid contracteerdoel"');
    aannameZet('jaardoel', { soort: 'contractwaarde', periode: 'schooljaar', scope: 'scope v1', noemer: 'jaardoel', waarde: 500000 });
    var Md = mtCijfers();
    eis(Md.M07.waarde === Math.round(1000 * (Md.M04.waarde + Md.M06.waarde) / 500000) / 10 && Md.M07.extra.noemerLabel === 'jaardoel' && Md.M05.waarde === Math.round(500000 * ctx.curveOp(cx([[0, 0], [180, 0.5], [365, 1]]), Md.M05.extra.dag)),
      'B3: een contractwaardedoel per schooljaar met noemer jaardoel → dekking = (M04 + M06) ÷ jaardoel en het doelpad op de curve');
    // R12: een verzonnen particulier met een gewonnen kans telt mee in M04 zonder scope, niet met scope [particulier]
    vers79();
    ctx.schrijf('Scholen', { id: 'rk-part', naam: 'Bijles Verzonnen', type: 'Particulier', eigenaar: 'Noor Hendriks' });
    ctx.schrijf('Kansen', { id: 'rk-pg', naam: 'Bijles', school: 'Bijles Verzonnen', schoolId: 'rk-part', fase: 'gewonnen', gesloten: plusDagen(-3), eigenaar: 'Noor Hendriks', waarde: 3000, schooljaar: sjNu(), klant: 'nieuw', pipeline: 'Scholen' });
    ctx.schrijf('Trajecten', { id: 'rk-pt', school: 'Bijles Verzonnen', schoolId: 'rk-part', traject: 'Bijles', schooljaar: sjNu(), status: 'bezig', kansId: 'rk-pg', contractwaarde: 3000, omzet: 3000 }); ctx._LEES = {};
    var zonder = mtCijfers().M04.waarde; aannameZet('scope', ['particulier']); var met = mtCijfers().M04;
    eis(Math.round((zonder - met.waarde) * 100) === 300000 && /zonder: particulier/.test(met.extra.scope), 'R12: de particulier telt mee in M04 zonder scope en niet met scope [particulier]');
    // R6: zolang er een verloren kans met een reden buiten de lijst is, zijn M12 en M21 niet getoetst; na de koppeling berekend
    vers79();
    ctx.schrijfVeel('Kansen', [{ id: 'k13', verliesReden: 'Te duur' }]); ctx._LEES = {};
    var Mr = mtCijfers();
    eis(/niet getoetst: verliesredenen niet gekoppeld/.test(Mr.M12.geblokkeerd) && /niet getoetst: verliesredenen niet gekoppeld/.test(Mr.M21.geblokkeerd) && Mr.M21.waarde === '', 'R6: met een vrije verliesreden buiten de lijst staan M12 en M21 op niet getoetst');
    roep(SOPHIE, 'apiMigratieV79', 'redenen', { toepassen: true, koppeling: { 'Te duur': 'te duur' } }); var Mr2 = mtCijfers();
    eis(!Mr2.M12.geblokkeerd && !Mr2.M21.geblokkeerd && typeof Mr2.M21.waarde === 'number', 'R6: na de koppeling (apiMigratieV79 redenen) worden M12 en M21 berekend');
    eis(/toegang/.test(faalt(LARS, 'apiSturing', 'mt', {})) && /toegang/.test(faalt(YARA, 'apiSturing', 'mt', {})) && /toegang/.test(faalt(FEMKE, 'apiSturing', 'mt', {})) && !faalt(THOMAS, 'apiSturing', 'mt', {}) && /weergave/.test(faalt(SOPHIE, 'apiSturing', 'onzin', {})),
      'mt: alleen management (ook geen teamlead); een onbekende weergave geeft een Nederlandse fout');
    // --- datakwaliteit: eigen/team/alles, aantallen over zichtbare afwijkingen, vers alleen management, "kans van een collega" (R16) ---
    vers79();
    ctx.schrijf('Kansen', { id: 'rk-d1', naam: 'Dubbel', school: 'Esdoorn Lyceum', schoolId: 's1', fase: 'gesprek', pipeline: 'Scholen', eigenaar: 'Lars Visser', waarde: 1000, schooljaar: sjNu(), klant: 'nieuw', productsoort: 'surveillance' });
    ctx.schrijf('Kansen', { id: 'rk-d2', naam: 'Dubbel van Noor', school: 'Esdoorn Lyceum', schoolId: 's1', fase: 'gesprek', pipeline: 'Scholen', eigenaar: 'Noor Hendriks', waarde: 1000, schooljaar: sjNu(), klant: 'nieuw', productsoort: 'surveillance' });
    ctx.verwijderRijen('Datakwaliteit', function () { return true; }); ctx._LEES = {}; ctx.GEBRUIKER = null; ctx.datakwaliteitDag(plusDagen(0), { stil: true });
    var dL = roep(LARS, 'apiSturing', 'datakwaliteit', {}), dY = roep(YARA, 'apiSturing', 'datakwaliteit', {}), dS = roep(SOPHIE, 'apiSturing', 'datakwaliteit', {}), dF = roep(FEMKE, 'apiSturing', 'datakwaliteit', {});
    var eigenaren = function (d) { return d.perEigenaar.map(function (x) { return x.eigenaar; }); };
    var somZicht = function (d) { return d.contracten.reduce(function (s, c) { return s + c.aantal; }, 0) === d.perEigenaar.reduce(function (s, x) { return s + x.aantal; }, 0); };
    eis(eigenaren(dL).every(function (e) { return e === 'Lars Visser'; }) && eigenaren(dY).every(function (e) { return ['Lars Visser', 'Noor Hendriks', 'Yara El Amrani'].indexOf(e) >= 0; }) && eigenaren(dS).indexOf('beheerder') >= 0 && eigenaren(dF).every(function (e) { return e === 'Femke de Wit'; }) && somZicht(dL) && somZicht(dF) && somZicht(dS),
      'datakwaliteit: een medewerker ziet alleen zichzelf, de teamlead zijn team, management iedereen (ook beheerder); contracten[].aantal telt alleen zichtbare afwijkingen');
    var dub = dL.perEigenaar[0].gezakt.filter(function (g) { return g.contract === 'geen_dubbele_open_kansen'; })[0], coll = dub ? dub.verwijzingen.filter(function (v) { return !v.open; })[0] : null;
    eis(!!dub && !!coll && coll.naam === 'kans van een collega' && coll.id === '' && dub.verwijzingen.some(function (v) { return v.open && v.id === 'rk-d1'; }), 'R16: bij een dubbele open kans ziet de OC de kans van een collega zonder naam en zonder doorklik, de eigen kans met doorklik');
    eis(/toegang/.test(faalt(LARS, 'apiSturing', 'datakwaliteit', { vers: true })) && roep(SOPHIE, 'apiSturing', 'datakwaliteit', { vers: true }).bron === 'vers' && dS.bron === 'trigger' && dS.dag === plusDagen(0), 'datakwaliteit: de rijen van vandaag uit het tabblad; vers (live rekenen) alleen management');
  } catch (e) { eis(false, 'v7.9 sturingsweergaven: onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }
})();

/* ---- v7.9: stand bevriezen (punt 21; R3, R4, N5) ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    eis(ctx.laatsteDonderdag('2026-10-05') === '2026-10-29' && ctx.laatsteDonderdag('2026-11-30') === '2026-11-26' && ctx.laatsteDonderdag('2026-12-01') === '2026-12-31' && ctx.laatsteDonderdag('2027-01-15') === '2027-01-28' && ctx.laatsteDonderdag('2026-03-29') === '2026-03-26',
      'laatste donderdag: een maand met vijf (oktober) en met vier donderdagen (november), december naar januari, rond de zomertijdwissel (maart)');
    var t5 = ctx.sturingBevriezen('2026-10-05', 'tussenstand');
    eis(!t5.al && t5.rijen > 30 && ctx.sturingBevriezen('2026-10-05', 'tussenstand').al === true, 'tussenstand: hoogstens één per dag');
    var nogNiet = ctx.maandstandAlsNodig('2026-10-28'), m1 = ctx.maandstandAlsNodig('2026-10-29'), m2 = ctx.maandstandAlsNodig('2026-10-30');
    eis(nogNiet.nogNiet && !m1.al && m1.peildatum === '2026-10-29' && m2.al === true, 'R4: een tussenstand op de 5e houdt de maandstand op de laatste donderdag niet tegen; daarna geen tweede maandstand die maand');
    var gem = ctx.maandstandAlsNodig('2026-11-27'), zat = ctx.maandstandAlsNodig('2026-11-28'), lijst = ctx.standenLijst();
    eis(!gem.al && gem.peildatum === '2026-11-27' && zat.al === true && lijst.some(function (x) { return x.soort === 'maand' && x.sleutel === '2026-11' && x.ingehaald && /ingehaald/.test(x.label); }) && lijst.some(function (x) { return x.soort === 'tussenstand' && x.sleutel === '2026-10-05'; }) && lijst.some(function (x) { return x.soort === 'maand' && x.sleutel === '2026-10' && !x.ingehaald; }),
      'R3: na een gemiste donderdag bevriest de vrijdag alsnog (peildatum vrijdag, label ingehaald), de zaterdag niet nog eens; de lijst toont maand- en tussenstanden met hun soort');
    // review C5: de laatste donderdag van december 2026 is de 31e; mislukt die run, dan haalt de run van 1 januari de decemberstand in (niet als januaristand)
    ctx._demoProps.LAATSTE_STURING = '2026-12-30 06:45';
    var jan = ctx.maandstandAlsNodig('2027-01-01'), lijst2 = ctx.standenLijst(), dec = lijst2.filter(function (x) { return x.soort === 'maand' && x.sleutel === '2026-12'; })[0];
    eis(jan.nogNiet && jan.ingehaald && !jan.ingehaald.al && jan.ingehaald.peildatum === '2027-01-01' && dec && dec.ingehaald && /december 2026/i.test(dec.label) && !lijst2.some(function (x) { return x.soort === 'maand' && x.sleutel === '2027-01'; }) &&
      ctx.maandstandAlsNodig('2027-01-02').ingehaald === undefined && roep(SOPHIE, 'apiSturing', 'mt', { stand: '2026-12' }).peildatum === '2027-01-01',
      'review C5: een gemiste laatste donderdag op 31 december wordt op 1 januari ingehaald als decemberstand (ingehaald, één keer), niet als januaristand');
    delete ctx._demoProps.LAATSTE_STURING;
    eis(ctx.maandstandAlsNodig('2027-02-03').ingehaald === undefined && !ctx.standenLijst().some(function (x) { return x.soort === 'maand' && x.sleutel === '2027-01'; }), 'review C5: zonder eerdere run (nieuwe installatie) geen ingehaalde stand voor de maand ervoor');
    // de bevroren waarden blijven, ook als er daarna een deal bij komt; de bevroren definitie blijft (N5)
    var vandaag = plusDagen(0), b = ctx.sturingBevriezen(vandaag, 'tussenstand'), live0 = mtCijfers(), vast0 = roep(SOPHIE, 'apiSturing', 'mt', { stand: vandaag });
    var waarden = function (r) { var u = {}; r.blokken.forEach(function (bl) { bl.cijfers.forEach(function (c) { u[c.id] = JSON.stringify([c.waarde, c.uitsplitsing.map(function (x) { return [x.label, x.waarde]; })]); }); }); return u; };
    var wl = waarden(live0._r), wv = waarden(vast0);
    eis(!b.al && vast0.bevroren && vast0.standSoort === 'tussenstand' && Object.keys(wl).every(function (k) { return wl[k] === wv[k]; }), 'apiSturing(mt, { stand }) geeft precies de waarden van het moment van bevriezen');
    roep(LARS, 'apiKansOpslaan', { id: 'k10', fase: 'gewonnen', _oud: { fase: 'voorstel' }, overdracht: od(25000, plusDagen(0)) });
    var live1 = mtCijfers(), vast1 = roep(SOPHIE, 'apiSturing', 'mt', { stand: vandaag });
    eis(live1.M08.extra.aantal === live0.M08.extra.aantal + 1 && JSON.stringify(waarden(vast1)) === JSON.stringify(wv), 'een deal na het bevriezen verandert het live overzicht, niet de bevroren stand');
    var oudeTekst = ctx.METRIEKEN.gecontracteerd.definitie;
    ctx.METRIEKEN.gecontracteerd.definitie = 'Rooktest: een latere concepttekst van M04';
    var vast2 = roep(SOPHIE, 'apiSturing', 'mt', { stand: vandaag }), m04v = vast2.blokken[0].cijfers.filter(function (c) { return c.id === 'gecontracteerd'; })[0], m04l = mtCijfers().M04;
    ctx.METRIEKEN.gecontracteerd.definitie = oudeTekst;
    eis(m04v.def.definitie === oudeTekst && vast2.defs.gecontracteerd.definitie === oudeTekst && m04l.def.definitie === 'Rooktest: een latere concepttekst van M04', 'N5: een bevroren stand toont de definitie van toen, niet de tekst uit de huidige code');
    var mm = roep(SOPHIE, 'apiSturing', 'mt', { stand: '2026-10' });
    eis(mm.bevroren && mm.standSoort === 'maand' && mm.peildatum === '2026-10-29' && /bestaat niet/.test(faalt(SOPHIE, 'apiSturing', 'mt', { stand: '2025-01' })) && /maandstand/.test(faalt(SOPHIE, 'apiSturing', 'mt', { stand: 'oktober' })), 'een maandstand op yyyy-MM; een onbekende of ongeldige stand geeft een Nederlandse fout');
    eis(/management/.test(faalt(LARS, 'apiSturingBevriezen')) && /management/.test(faalt(YARA, 'apiSturingBevriezen')) && roep(SOPHIE, 'apiSturingBevriezen').al === true, 'apiSturingBevriezen: alleen management; vandaag stond er al een tussenstand');
  } catch (e) { eis(false, 'v7.9 stand bevriezen: onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }
})();

/* ---- v7.9: aannames en jaardoel (punt 13 en 24; N1, N6, R9, R11, R18) ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    aannameZet('retentie', 0.8); aannameZet('retentie', 0.75); aannameZet('retentie', 0.7, { ingang: plusDagen(30) });
    var rijen = ctx.lees('Aannames').filter(function (r) { return r.naam === 'retentie'; }), a = roep(SOPHIE, 'apiAannames').aannames.filter(function (x) { return x.naam === 'retentie'; })[0];
    eis(rijen.length === 3 && rijen.map(function (r) { return r.id; }).sort().join() === 'aa-retentie-v1,aa-retentie-v2,aa-retentie-v3' && ctx.aanname('retentie').versie === 2 && ctx.aanname('retentie').waarde === 0.75 && ctx.aanname('retentie', plusDagen(30)).versie === 3 && a.historie.length === 3 && a.huidig.versie === 2,
      'aannames: elke versie een eigen rij (aa-<naam>-v<n>); aanname() kiest de hoogste versie met ingang t/m de datum; de historie blijft');
    eis(/toegang/.test(faalt(YARA, 'apiAannameOpslaan', 'retentie', { waarde: 0.5, onderbouwing: 'x', besluitdatum: plusDagen(0) })) && /toegang/.test(faalt(LARS, 'apiAannames')) && /toegang/.test(faalt(FEMKE, 'apiAannames')), 'aannames: alleen management (een teamlead en een medewerker niet)');
    var f = function (naam, w, o) { var x = { waarde: w, onderbouwing: 'x', besluitdatum: plusDagen(0) }; Object.keys(o || {}).forEach(function (k) { x[k] = o[k]; }); return faalt(SOPHIE, 'apiAannameOpslaan', naam, x); };
    eis(/tussen 0 en 1/.test(f('retentie', 1.5)) && /0 of meer/.test(f('dealwaarde', -1)) && /Ongeldige datum/.test(f('overstapDatum', 'morgen')) && /aan of uit/.test(f('sturingVerplicht', 'misschien')) && /soort/.test(f('jaardoel', { soort: 'omzet' })) &&
      /vastgelegde versie/.test(f('jaardoel', { scope: 'scope v9' })) && /contracteerdoel/.test(f('jaardoel', { noemer: 'contracteerdoel' })) && /getal/.test(f('werkweken', 'veel')), 'aannames: validatie per soort (fractie, euro, datum, aan/uit, jaardoel met lijsten, scope naar een vastgelegde versie, contracteerdoel bij die noemer)');
    eis(/D13/.test(f('doelpadCurve', { bron: 'gefactureerd', totaal: [[0, 0]] })) && /D13/.test(f('jaardoel', { verdeling: 'gefactureerd' })), 'aannames: een doelpad of jaardoel op het factuurpatroon wordt geweigerd (D13)');
    eis(/onderbouwing/.test(faalt(SOPHIE, 'apiAannameOpslaan', 'retentie', { waarde: 0.5, besluitdatum: plusDagen(0) })) && /besluitdatum/.test(faalt(SOPHIE, 'apiAannameOpslaan', 'retentie', { waarde: 0.5, onderbouwing: 'x' })), 'N6: onderbouwing en besluitdatum zijn bij elke versie verplicht');
    eis(/Onbekende aanname/.test(faalt(SOPHIE, 'apiAannameOpslaan', 'constructor', { waarde: 1, onderbouwing: 'x', besluitdatum: plusDagen(0) })) && /Onbekende aanname/.test(faalt(SOPHIE, 'apiAannameOpslaan', '__proto__', { waarde: 1, onderbouwing: 'x', besluitdatum: plusDagen(0) })), 'N1: constructor en __proto__ als aanname → "Onbekende aanname."');
    // N6: fasegewichten via Beheer → Mijlpalen: alleen een echte wijziging met onderbouwing en besluitdatum; hetzelfde nog eens = geen nieuwe versie
    var basis = ctx.mijlpalen().map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal, kans: m.mijlpaal === 'voorstel' ? 60 : m.kans, dagenNorm: m.dagenNorm, rol: m.rol }; });
    var fg = function () { return ctx.lees('Aannames').filter(function (r) { return r.naam === 'fasegewichten'; }).length; };
    eis(/onderbouwing en een besluitdatum/.test(faalt(SOPHIE, 'apiMijlpalenOpslaan', basis)) && fg() === 0 && ctx.mijlpaalMap().voorstel.kans === 50, 'N6: een gewijzigd fasegewicht zonder onderbouwing wordt geweigerd (de mijlpalen blijven)');
    roep(SOPHIE, 'apiMijlpalenOpslaan', basis, GEWICHT_OK); var n1 = fg(); roep(SOPHIE, 'apiMijlpalenOpslaan', basis); roep(SOPHIE, 'apiMijlpalenOpslaan', basis.map(function (m) { var x = JSON.parse(JSON.stringify(m)); if (x.mijlpaal === 'onderhandeling') x.rol = 'voorstel'; if (x.mijlpaal === 'voorstel') x.rol = 'ap'; if (x.mijlpaal === 'gesprek') x.rol = 'lead'; if (x.mijlpaal === 'lead') x.rol = ''; return x; }));
    eis(n1 === 1 && fg() === 1 && ctx.aanname('fasegewichten').waarde['Scholen|voorstel'] === 60 && ctx.mijlpaalMap().voorstel.kans === 60, 'N6: met onderbouwing één versie van fasegewichten; hetzelfde nog eens opslaan of alleen rollen wijzigen maakt geen nieuwe versie');
    // R11: een doelpadcurve van 366 punten × 3 groepen × 5 versies past; een te grote waarde wordt geweigerd
    var curve = function (fac) { var l = []; for (var d0 = 0; d0 < 366; d0++) l.push([d0, Math.round(10000 * Math.min(1, fac * d0 / 365)) / 10000]); return l; };
    for (var v = 1; v <= 5; v++) aannameZet('doelpadCurve', { totaal: curve(1), bestaand: curve(1.02), nieuw: curve(0.98), bron: 'reconstructie' });
    var cr = ctx.lees('Aannames').filter(function (r) { return r.naam === 'doelpadCurve'; });
    eis(cr.length === 5 && cr.every(function (r) { return String(r.waarde).length < 45000; }) && ctx.aanname('doelpadCurve').versie === 5 && ctx.aanname('doelpadCurve').waarde.totaal.length === 366, 'R11: een doelpadcurve van 366 punten × 3 groepen past in één cel per versie (< 45.000 tekens); versie 5 geldt');
    var groot = {}; for (var i = 0; i < 2000; i++) groot['pipeline-met-een-lange-naam-' + i + '|mijlpaal'] = 50;
    var teGroot = ''; try { ctx.aannameVastleggen('fasegewichten', cx(groot), { onderbouwing: 'x', besluitdatum: plusDagen(0) }); } catch (e) { teGroot = e.message; }
    eis(/te groot/.test(teGroot), 'R11: een waarde boven 45.000 tekens wordt geweigerd');
    // punt 24: M09 leest ook het archief, maar alleen vanaf het begin van het schooljaar; Financiën "geleverd" verandert niet (K1)
    vers79();
    var sj = sjNu(), j1 = Number(sj.slice(0, 4)), wkIn = ctx.isoWeekStr(new CtxDate79(j1, 8, 15, 12)), wkVorig = ctx.isoWeekStr(new CtxDate79(j1 - 1, 9, 15, 12)), t1 = 't1';
    var finVoor = JSON.stringify(roep(SOPHIE, 'apiFinancien', sj).reeksen.geleverd), maandIn = ctx.maandVan(ctx.maandagVanWeek(wkIn)), voor9 = ctx.urenPerMaand(sj, plusDagen(0)), urenVoor = voor9.filter(function (x) { return x.maand === maandIn; })[0].uren, totVoor = voor9.reduce(function (s, x) { return s + x.uren; }, 0);
    ctx.schrijfVeel('TalentUren_archief', [{ id: 'rk-ua1', talentId: 'tl1', trajectId: t1, week: wkIn, uren: 12.5, diensten: 3 }, { id: 'rk-ua2', talentId: 'tl1', trajectId: t1, week: wkVorig, uren: 40, diensten: 8 }]); ctx._LEES = {};
    var urenNa = ctx.urenPerMaand(sj, plusDagen(0)), m09 = urenNa.filter(function (x) { return x.maand === maandIn; })[0];
    eis(m09.uren === Math.round((urenVoor + 12.5) * 100) / 100 && Math.abs(urenNa.reduce(function (s, x) { return s + x.uren; }, 0) - totVoor - 12.5) < 0.001 && JSON.stringify(roep(SOPHIE, 'apiFinancien', sj).reeksen.geleverd) === finVoor,
      'punt 24: een archiefweek van dit schooljaar telt mee in M09, een week uit het vorige schooljaar niet; Financiën "geleverd" is ongewijzigd (K1)');
    var telF = leesTeller(function () { roep(SOPHIE, 'apiFinancien', sj); roep(SOPHIE, 'apiHome'); });
    eis(!telF.TalentUren_archief, 'R9: Financiën en Home lezen TalentUren_archief niet (alleen M09 in het MT-overzicht)');
    var M9 = mtCijfers().M09;
    eis(/basislijn vorige jaren ontbreekt/.test(M9.geblokkeerd) && M9.extra.maanden.length === 12, 'M09 zonder urenbasislijn: geblokkeerd, met de maanden van dit schooljaar als toelichting');
    var vsj = ctx.vorigSchooljaar(sj), bl = {}; bl[vsj] = {}; ctx.schooljaarMaanden(vsj).forEach(function (m) { bl[vsj][m] = 100; });
    aannameZet('urenBasislijn', bl); var M9b = mtCijfers().M09, heel = M9b.extra.maanden.filter(function (x) { return x.maand < plusDagen(0).slice(0, 7); }).length;
    eis(!M9b.geblokkeerd && typeof M9b.waarde === 'number' && M9b.extra.basislijn[vsj] === 100 * heel, 'M09 met urenbasislijn: de uren t/m de laatste hele maand naast dezelfde maanden van vorig jaar (' + heel + ' maanden)');
    var S2 = require(path.join(R, 'server/schema.js'));
    eis(S2.NUMERIEK.Voorspellingen.indexOf('versie') >= 0 && S2.NUMERIEK.Aannames.indexOf('versie') >= 0 && S2.NUMERIEK.Standen.indexOf('waarde') >= 0 && S2.NUMERIEK.Cijferdefinities.indexOf('versie') >= 0, 'N4: versie en waarde zijn getalkolommen in Postgres (Voorspellingen, Aannames, Standen, Cijferdefinities)');
  } catch (e) { eis(false, 'v7.9 aannames en jaardoel: onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }
})();

/* ---- v7.9 (review T4): welke tabbladen een api op een druk pad leest. Een nieuw tabblad op zo'n pad is een bewuste keuze: pas de lijst hier aan,
   met de reden en een meting (R9 in test/demo_groot_test.js). Sinds de review leest apiCrm Aannames niet meer (sturingVerplicht komt met apiPipeline). ---- */
(function () {
  vers79(); var st = standBewaren();
  try {
    var VERWACHT = {
      apiCrm: 'Gebruikers,Instellingen,Kansen,Meldingen,Mijlpalen,Personen,Scholen,Tracks,Trajecten',
      apiOverzicht: 'Acties,Instellingen,Kansen,Mijlpalen,Scholen,Trajecten',
      apiHome: 'Acties,Activiteiten,Doelen,Facturen,Instellingen,Kandidaten,Kansen,Mijlpalen,Personen,Scholen,Talenten,Trajecten,Vacatures',
      apiTeamRapport: 'Activiteiten,Doelen,Facturen,Fasewissels,Gebruikers,Instellingen,Kandidaten,Kansen,Mijlpalen,Scholen,Trajecten,Vacatures'  // v7.9: Fasewissels en Mijlpalen (tellen uit de wissels)
    }, ARGS = { apiTeamRapport: ['maand', 'consultancy', '', 0] };
    Object.keys(VERWACHT).forEach(function (api) {
      var echt = ctx.leesUitSheet, gelezen = {};
      ctx.leesUitSheet = function (n, l) { gelezen[n] = 1; return echt(n, l); };
      try { ctx._LEES = {}; roep.apply(null, [SOPHIE, api].concat(ARGS[api] || [])); } finally { ctx.leesUitSheet = echt; }
      var l = Object.keys(gelezen).sort().join(',');
      eis(l === VERWACHT[api], 'review T4: ' + api + ' leest precies de vaste tabbladen' + (l !== VERWACHT[api] ? ' (verwacht ' + VERWACHT[api] + ', nu ' + l + ')' : ''));
    });
  } catch (e) { eis(false, 'v7.9 leesteller: onverwachte fout ' + e.message); } finally { standTerug(st); }
})();

/* ---- v7.9.1: fasen zoals Capsule — de herkenner, de overstapstap fasen (proefdraai, toepassen, idempotent, doel 6 = gewonnen, een ontbrekende koppeling,
   een andere pipeline), de Capsule-namen zelf in de Sheet, rollen op naam (stap rollen en de Capsule-import), deal/lopend traject = gewonnen en de
   versievergelijking. De fasenamen van Capsule zijn configuratie; scholen, personen en bedragen komen uit de verzonnen demo-seed. ---- */
(function () {
  vers79(); var st = standBewaren();
  var CAP = ['1. Nog niet gebeld', '2. Pre-AP', '3. AP (Appointment Planned)', '4. AD (Appointment Done)', '5. VO (Voorstel / Offerte)', '6. Deal/Lopend traject'];
  var DOEL = ctx.CAPSULE_FASEN.map(function (f) { return f.mijlpaal; });  // '1. nog niet gebeld' … '5. vo (voorstel / offerte)'
  var scholenRijen = function () { return ctx.mijlpalen().filter(function (m) { return m.pipeline === 'Scholen'; }); };
  var namenVrij = function (o) { var j = JSON.stringify(o); return !ctx.lees('Scholen').some(function (s) { return s.naam && j.indexOf(s.naam) >= 0; }) && ['Lars Visser', 'Noor Hendriks', 'Yara El Amrani', 'Sophie de Graaf'].every(function (n) { return j.indexOf(n) < 0; }); };
  try {
    // --- de herkenner ---
    eis(CAP.every(function (n, i) { var f = String(i + 1); return ctx.faseVanNaam(n) === f && ctx.faseVanNaam(n.toLowerCase()) === f && ctx.faseVanNaam(n.toUpperCase()) === f; }), 'v7.9.1 faseVanNaam: de zes Capsule-namen, in hoofd- en kleine letters, geven 1 tot en met 6');
    eis(ctx.faseVanNaam('lead') === '1' && ctx.faseVanNaam('gesprek') === '3' && ctx.faseVanNaam('voorstel') === '5' && ctx.faseVanNaam('onderhandeling') === '5' && ctx.faseVanNaam('Pre AP') === '2' && ctx.faseVanNaam('preap') === '2' &&
      ctx.faseVanNaam('AP gehouden') === '4' && ctx.faseVanNaam('Gesprek gehouden') === '4' && ctx.faseVanNaam('Afspraak gepland') === '3' && ctx.faseVanNaam('Offerte') === '5' && ctx.faseVanNaam('Won') === '6' && ctx.faseVanNaam('Gewonnen') === '6' && ctx.faseVanNaam('Lopend traject') === '6',
      'faseVanNaam: de Athena-standaardnamen (lead 1, gesprek 3, voorstel en onderhandeling 5) en varianten (pre ap, preap, AP gehouden, gesprek gehouden, afspraak gepland, offerte, won, lopend traject)');
    eis(ctx.faseVanNaam('adres') === '' && ctx.faseVanNaam('Adres controleren') === '' && ctx.faseVanNaam('aparte afspraak') === '' && ctx.faseVanNaam('vooraf bellen') === '' && ctx.faseVanNaam('Kennismaking') === '' && ctx.faseVanNaam('') === '' && ctx.faseVanNaam(null) === '' && ctx.faseVanNaam({ naam: 'lead' }) === '',
      'faseVanNaam: "adres" en "aparte" niet als ad of ap, "vooraf" niet als vo; een onbekende naam, leeg, null en een object geven ""');
    eis(CAP.map(ctx.rolVanNaam).join() === 'lead,,ap,ad,voorstel,' && ctx.rolVanNaam('Kennismaking') === '' && ctx.rollenOpNaam(['lead', 'gesprek', 'voorstel', 'onderhandeling']).join() === 'lead,ap,voorstel,' && ctx.rollenOpNaam(['offerte', 'gesprek']).join() === 'voorstel,' && ctx.rollenOpNaam(['a', 'b']) === null,
      'rolVanNaam: lead, geen, ap, ad, voorstel, geen; rollenOpNaam: elke rol één keer en alleen vooruit (een dubbele of teruglopende rol blijft leeg), null als niets herkend wordt');
    // --- versievergelijking: 7.9.1 is niet ouder dan 7.9; een app van 7.9 krijgt geen "Herlaad de app" ---
    var herlaad = function (v) { ctx.KLANT_VERSIE = v; try { ctx.eisNieuweApp(); return ''; } catch (e) { return e.message; } finally { ctx.KLANT_VERSIE = null; } };
    eis(ctx.VERSIE === '7.9.1' && !ctx.versieKleiner('7.9.1', '7.9') && ctx.versieKleiner('7.9', '7.9.1') && !ctx.versieKleiner('7.10', '7.9.1') && ctx.versieKleiner('7.8.9', '7.9') && !ctx.versieKleiner('7.9.0', '7.9') && ctx.versieKleiner('', '7.9') &&
      herlaad('7.9') === '' && herlaad('7.9.1') === '' && /Herlaad de app/.test(herlaad('7.8')) && /Herlaad de app/.test(herlaad('')),
      'versieKleiner per deel (x.y.z): VERSIE 7.9.1, niet ouder dan 7.9, 7.10 niet ouder dan 7.9.1; eisNieuweApp: een app van 7.9 of 7.9.1 geen herlaadmelding, een van 7.8 of zonder versie wel');
    var dp = function (body) { var u = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } })); ctx.KLANT_VERSIE = null; return u; };
    var mZonder = ctx.mijlpalen().map(function (m) { return { pipeline: m.pipeline, mijlpaal: m.mijlpaal, kans: m.mijlpaal === 'gesprek' ? 30 : m.kans, dagenNorm: m.dagenNorm, rol: m.rol }; });
    var d79 = dp({ fn: 'apiMijlpalenOpslaan', args: [mZonder], secret: SOPHIE, v: '7.9' }), d78 = dp({ fn: 'apiMijlpalenOpslaan', args: [mZonder], secret: SOPHIE, v: '7.8' }), dC = dp({ fn: 'apiCrm', args: [], secret: SOPHIE, v: '7.9' });
    eis(!d79.ok && /onderbouwing/.test(d79.fout) && !/Herlaad/.test(d79.fout) && /Herlaad de app/.test(d78.fout) && dC.ok && dC.result.backendVersie === '7.9.1', 'doPost: een app van 7.9 krijgt van backend 7.9.1 de gewone melding (geen herlaadmelding), een app van 7.8 wel; apiCrm noemt backendVersie 7.9.1');
    ctx._LEES = {};

    // --- proefdraai op de demoseed ---
    var open0 = ctx.lees('Kansen').filter(ctx.kansOpen), fase0 = {}; open0.forEach(function (k) { fase0[k.id] = k.fase; });
    var p = roep(SOPHIE, 'apiMigratieV79', 'fasen'), vs = {}; p.mijlpalen.forEach(function (m) { vs[m.mijlpaal] = m; });
    var som = p.mijlpalen.reduce(function (a, m) { return a + m.open; }, 0);
    eis(!p.toegepast && !p.alGedaan && vs.lead.voorstel === '1' && vs.gesprek.voorstel === '3' && vs.voorstel.voorstel === '5' && vs.onderhandeling.voorstel === '5' && som === open0.length && vs.gesprek.open === open0.filter(function (k) { return k.fase === 'gesprek'; }).length &&
      p.doelen.length === 6 && p.doelen.map(function (d) { return d.fase; }).join() === '1,2,3,4,5,6' && p.doelen[5].mijlpaal === 'gewonnen' && /deal\/lopend traject/.test(p.doelen[5].label) && p.onderbouwing === ctx.FASEN_ONDERBOUWING && namenVrij(p),
      'stap fasen proefdraai op de demoseed: lead → 1, gesprek → 3, voorstel → 5, onderhandeling → 5; per mijlpaal het aantal open kansen; zes doelfasen (6 = gewonnen); geen namen');
    eis(scholenRijen().map(function (m) { return m.mijlpaal; }).join() === 'lead,gesprek,voorstel,onderhandeling' && open0.every(function (k) { return ctx.vind('Kansen', k.id).fase === k.fase; }) && !roep(SOPHIE, 'apiMigratieV79', 'status').fasen.alGedaan && roep(SOPHIE, 'apiMigratieV79', 'status').fasen.mijlpalen === 4,
      'stap fasen: proefdraaien schrijft niets; status.fasen zegt dat de pipeline nog niet zo staat');
    eis(/management/i.test(faalt(YARA, 'apiMigratieV79', 'fasen')) && /management/i.test(faalt(LARS, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: { 'scholen-lead': '1' } })), 'stap fasen: alleen management (ook proefdraaien)');
    var nW0 = aantalWissels();
    eis(/Kies voor elke mijlpaal/.test(faalt(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: { 'scholen-lead': '1', 'scholen-gesprek': '3', 'scholen-voorstel': '5' } })) &&
      /Kies voor elke mijlpaal/.test(faalt(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: { 'scholen-lead': '1', 'scholen-gesprek': '7', 'scholen-voorstel': '5', 'scholen-onderhandeling': '5' } })) &&
      /Kies voor elke mijlpaal/.test(faalt(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true })) && /verwacht tekst/.test(faalt(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: { 'scholen-lead': '1', 'scholen-gesprek': '3', 'scholen-voorstel': '5', 'scholen-onderhandeling': '5' }, onderbouwing: { x: 1 } })) &&
      /besluitdatum/.test(faalt(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: { 'scholen-lead': '1', 'scholen-gesprek': '3', 'scholen-voorstel': '5', 'scholen-onderhandeling': '5' }, besluitdatum: 'morgen' })) &&
      scholenRijen().length === 4 && aantalWissels() === nW0, 'stap fasen: een ontbrekende koppeling, een fase buiten 1–6, een object als onderbouwing of een ongeldige besluitdatum geeft een Nederlandse fout en schrijft niets');

    // --- toepassen ---
    var vanM = plusDagen(-60), totM = plusDagen(0), c0 = consultancyTotaal(vanM, totM), w0 = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers, nA0 = ctx.aannameVersies('fasegewichten').length;
    var kop = {}; p.mijlpalen.forEach(function (m) { kop[m.id] = m.voorstel; });
    var t = telSchrijfVeel(function () { return roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: kop }); }), r = t.uit, ms = scholenRijen();
    eis(r.toegepast && !r.alGedaan && r.mijlpalen === 5 && ms.map(function (m) { return m.mijlpaal; }).join('|') === DOEL.join('|') && ms.map(function (m) { return m.rol; }).join() === 'lead,,ap,ad,voorstel' && ms.map(function (m) { return m.kans; }).join() === '0,0,25,40,70' && ms.map(function (m) { return m.volgorde; }).join() === '1,2,3,4,5' && namenVrij(r),
      'stap fasen toepassen: Mijlpalen van Scholen = de vijf fasen met rollen lead, geen, ap, ad, voorstel en kans 0, 0, 25, 40, 70; geen namen in het antwoord');
    var naar = { lead: DOEL[0], gesprek: DOEL[2], voorstel: DOEL[4], onderhandeling: DOEL[4] }, nieuw = aantalWissels() - nW0;
    var hern = ctx.lees('Fasewissels').slice(-nieuw), tellIds = {}; ctx.tellendeWissels().forEach(function (w) { tellIds[w.id] = 1; });
    eis(open0.every(function (k) { var x = ctx.vind('Kansen', k.id); return x.fase === naar[fase0[k.id]] && x.pipeline === 'Scholen'; }) && nieuw === open0.length && r.wissels === nieuw && t.n === 1 &&
      hern.every(function (w) { return w.bron === 'hernoemd' && !tellIds[w.id] && w.werkelijkeDatum === plusDagen(0) && w.naar === naar[w.van] && fase0[w.kansId] === w.van; }) &&
      r.verhuisd['1'] === 2 && r.verhuisd['3'] === 3 && r.verhuisd['5'] === 3 && r.gewonnen === 0,
      'stap fasen toepassen: elke open kans verhuist naar zijn nieuwe fase met één administratieve wissel (bron hernoemd, telt niet), alle wissels in één schrijfVeel; tellingen per doel');
    var c1 = consultancyTotaal(vanM, totM), w1 = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers;
    eis(['ap', 'ad', 'voorstellen', 'gewonnen', 'verloren'].every(function (m) { return tVan(c1, m) === tVan(c0, m); }) && ['ap', 'ad', 'voorstellen', 'gewonnen'].every(function (m) { return w1[m] === w0[m]; }),
      'stap fasen: de verhuizing telt nergens (teamcijfers en de weekweergave blijven gelijk)');
    var st1 = ctx.rollenStatus(), a = ctx.aanname('fasegewichten');
    eis(st1.ingesteld && !st1.pipelinesZonder.length && ctx.effectieveRol(DOEL[1], 'Scholen') === 'lead' && ctx.fasegewichtVan({ fase: DOEL[1], pipeline: 'Scholen' }) === 0 && ctx.fasegewichtVan({ fase: DOEL[0], pipeline: 'Scholen' }) === 0 &&
      ctx.fasegewichtVan({ fase: DOEL[2], pipeline: 'Scholen' }) === 25 && ctx.fasegewichtVan({ fase: DOEL[3] }) === 40 && ctx.fasegewichtVan({ fase: DOEL[4], pipeline: 'Scholen' }) === 70,
      'na de fasen: rollen ingesteld; pre-ap erft lead met gewicht 0, ap 25, ad 40 (ook zonder pipeline), vo 70');
    eis(ctx.aannameVersies('fasegewichten').length === nA0 + 1 && r.aanname === a.versie && a.onderbouwing === ctx.FASEN_ONDERBOUWING && a.besluitdatum === plusDagen(0) && a.waarde['Scholen|' + DOEL[2]] === 25 && a.waarde['Scholen|' + DOEL[4]] === 70 && Object.keys(a.waarde).length === 5,
      'stap fasen: de gewichten zijn een nieuwe versie van aanname fasegewichten, met de standaardonderbouwing en vandaag als besluitdatum (N6)');
    var s1 = roep(SOPHIE, 'apiMigratieV79', 'status'), p1 = roep(SOPHIE, 'apiMigratieV79', 'fasen');
    eis(s1.fasen.alGedaan && s1.fasen.mijlpalen === 5 && p1.alGedaan && p1.mijlpalen.map(function (m) { return m.voorstel; }).join() === '1,2,3,4,5', 'na de fasen: status en proefdraai zeggen dat de pipeline zo staat; het voorstel voor de nieuwe namen is 1 tot en met 5');
    // idempotent: een tweede toepassen (ook met de koppeling van de eerste keer) verandert niets en zegt dat
    var nW1 = aantalWissels(), r2 = roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: kop });
    eis(r2.alGedaan && r2.gewijzigd === false && /al/.test(r2.melding) && aantalWissels() === nW1 && ctx.aannameVersies('fasegewichten').length === nA0 + 1 && scholenRijen().map(function (m) { return m.id; }).join() === ms.map(function (m) { return m.id; }).join(),
      'stap fasen: een tweede toepassen verandert niets (geen wissel, geen versie, dezelfde ids) en meldt dat');
    // nieuwe wissels na de fasen: 1 → 2 telt niet, 2 → 3 is AP, 3 → 4 is AD, 4 → 5 is VO (de rol, nooit de naam)
    var nk = roep(LARS, 'apiKansOpslaan', { naam: 'Faseproef', schoolId: 's7', fase: DOEL[0], schooljaar: sjNu(), klant: 'nieuw' }).kans, wa = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers, ca = consultancyTotaal(totM, totM);
    roep(LARS, 'apiKansOpslaan', { id: nk.id, fase: DOEL[1], _oud: { fase: DOEL[0] } });
    var wb = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers, M = mtCijfers(), lab = (M.funnel || M.M18).uitsplitsing.map(function (u) { return u.label; });
    eis(wb.ap === wa.ap && wb.voorstellen === wa.voorstellen && lab.indexOf(DOEL[0] + ' · lead') >= 0 && lab.indexOf(DOEL[1]) >= 0, 'een wissel van 1. nog niet gebeld naar 2. pre-ap telt niet als AP; in de funnel is fase 1 de lead en fase 2 een kans (zonder label lead)');
    var wAp = roep(LARS, 'apiKansOpslaan', { id: nk.id, fase: DOEL[2], _oud: { fase: DOEL[1] } }).fasewissel, wc = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers, cb = consultancyTotaal(totM, totM);
    eis(wisselRij(wAp.id).naarRol === 'ap' && wisselRij(wAp.id).vanRol === 'lead' && wc.ap === wa.ap + 1 && tVan(cb, 'ap') === tVan(ca, 'ap') + 1, 'een nieuwe wissel van 2. pre-ap naar 3. ap telt als AP (weekweergave en teamcijfers)');
    roep(LARS, 'apiKansOpslaan', { id: nk.id, fase: DOEL[3], _oud: { fase: DOEL[2] } });
    var wd = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers, cc = consultancyTotaal(totM, totM);
    roep(LARS, 'apiKansOpslaan', { id: nk.id, fase: DOEL[4], _oud: { fase: DOEL[3] } });
    var we = roep(LARS, 'apiSturing', 'week', {}).rijen[0].cijfers, cd = consultancyTotaal(totM, totM);
    eis(wd.ad === wc.ad + 1 && tVan(cc, 'ad') === tVan(cb, 'ad') + 1 && we.voorstellen === wd.voorstellen + 1 && tVan(cd, 'voorstellen') === tVan(cc, 'voorstellen') + 1 && we.ad === wd.ad, 'van 3. ap naar 4. ad telt als AD, van 4. ad naar 5. vo als VO');
  } catch (e) { eis(false, 'v7.9.1 fasen (demoseed): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }

  // --- doel 6 maakt een open kans gewonnen; een andere pipeline en een kans zonder pipeline ---
  vers79(); st = standBewaren();
  try {
    var bestaand = ctx.mijlpalen().map(function (m, i) { return { id: m.id, pipeline: m.pipeline, mijlpaal: m.mijlpaal, volgorde: i + 1, kans: m.kans, dagenNorm: m.dagenNorm, rol: m.rol }; });
    ctx.schrijfVeel('Mijlpalen', bestaand.concat([{ id: 'besturen-intake', pipeline: 'Besturen', mijlpaal: 'intake', volgorde: 1, kans: 10, dagenNorm: 14, rol: 'lead' }, { id: 'besturen-gesprek', pipeline: 'Besturen', mijlpaal: 'gesprek', volgorde: 2, kans: 30, dagenNorm: 10, rol: 'ap' }]));
    ctx.schrijfVeel('Kansen', [{ id: 'k7', pipeline: '' }, { id: 'rk-best', naam: 'Bestuurskans', schoolId: 's2', fase: 'gesprek', pipeline: 'Besturen', eigenaar: 'Lars Visser', waarde: 1000, aangemaakt: plusDagen(-5) + ' 10:00' }]); ctx._LEES = {};
    var besturen0 = JSON.stringify(ctx.lees('Mijlpalen').filter(function (m) { return m.pipeline === 'Besturen'; }).map(function (m) { return [m.id, m.mijlpaal, m.volgorde, m.kans, m.rol]; }));
    var p6 = roep(SOPHIE, 'apiMigratieV79', 'fasen'), kop6 = {}; p6.mijlpalen.forEach(function (m) { kop6[m.id] = m.mijlpaal === 'onderhandeling' ? '6' : m.voorstel; });
    var nT = ctx.lees('Trajecten').length, g0 = ctx.vind('Kansen', 'k7').gesloten, r6 = roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: kop6, onderbouwing: 'Rooktest: eigen onderbouwing', besluitdatum: plusDagen(-2) });
    var k7 = ctx.vind('Kansen', 'k7'), w7 = wisselsVan('k7').filter(function (w) { return w.naar === 'gewonnen'; }), a6 = ctx.aanname('fasegewichten');
    eis(p6.mijlpalen.every(function (m) { return m.id.indexOf('besturen') < 0; }) && r6.gewonnen === 1 && k7.fase === 'gewonnen' && k7.pipeline === 'Scholen' && String(k7.gesloten || '') === String(g0 || '') && w7.length === 1 && w7[0].bron === 'hernoemd' && w7[0].naarRol === 'deal' &&
      ctx.lees('Trajecten').length === nT && !ctx.lees('Trajecten').some(function (x) { return x.kansId === 'k7'; }) && !ctx.dealWissels().some(function (w) { return w.kansId === 'k7'; }),
      'doel 6: een open kans wordt gewonnen met een wissel bron hernoemd (geen project, geen winformulier, telt niet als deal, Kansen.gesloten blijft); een kans zonder pipeline in een mijlpaal van Scholen hoort erbij');
    eis(JSON.stringify(ctx.lees('Mijlpalen').filter(function (m) { return m.pipeline === 'Besturen'; }).map(function (m) { return [m.id, m.mijlpaal, m.volgorde, m.kans, m.rol]; })) === besturen0 && ctx.vind('Kansen', 'rk-best').fase === 'gesprek' && ctx.vind('Kansen', 'rk-best').pipeline === 'Besturen' && !wisselsVan('rk-best').length &&
      a6.onderbouwing === 'Rooktest: eigen onderbouwing' && a6.besluitdatum === plusDagen(-2) && a6.waarde['Besturen|gesprek'] === 30 && a6.waarde['Scholen|' + DOEL[2]] === 25,
      'een andere pipeline blijft ongemoeid (mijlpalen en een kans met dezelfde mijlpaalnaam); de aanname krijgt de meegegeven onderbouwing en besluitdatum en alle pipelines');
  } catch (e) { eis(false, 'v7.9.1 fasen (doel 6): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }

  // --- een Sheet met de Capsule-namen zelf (zoals na de Capsule-migratie van v7.9: zes open rijen, rollen op volgorde of leeg) ---
  vers79(); st = standBewaren();
  try {
    ctx.verwijderRijen('Mijlpalen', function () { return true; });
    ctx.schrijfVeel('Mijlpalen', CAP.map(function (n, i) { return { id: 'cap-m' + (801 + i), pipeline: 'Scholen', mijlpaal: n.toLowerCase(), volgorde: i + 1, kans: [5, 10, 20, 40, 60, 90][i], dagenNorm: 21, rol: '' }; }));
    var oud = { k9: CAP[0], k12: CAP[1], k8: CAP[2], k11: CAP[3], k6: CAP[4], k7: CAP[5] }, rij = Object.keys(oud).map(function (id) { return { id: id, fase: oud[id].toLowerCase() }; });
    ctx.schrijfVeel('Kansen', rij); ctx._LEES = {};
    var pr = roep(SOPHIE, 'apiMigratieV79', 'rollen'), rv = {}; pr.mijlpalen.forEach(function (m) { rv[m.mijlpaal] = m.voorstel; });
    eis(CAP.map(function (n) { return rv[n.toLowerCase()]; }).join() === 'lead,,ap,ad,voorstel,', 'stap rollen bij de Capsule-namen: lead, geen, ap, ad, voorstel (op naam, niet op volgorde); deal/lopend traject geen rol');
    var pc = roep(SOPHIE, 'apiMigratieV79', 'fasen'), kc = {};
    eis(pc.mijlpalen.map(function (m) { return m.voorstel; }).join() === '1,2,3,4,5,6' && pc.mijlpalen.every(function (m) { return m.open === 1; }) && !pc.alGedaan, 'stap fasen bij de Capsule-namen: voorstel 1 tot en met 6, elk met één open kans');
    pc.mijlpalen.forEach(function (m) { kc[m.id] = m.voorstel; });
    var nWc = aantalWissels(), rc = roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: kc }), mc = scholenRijen();
    eis(mc.map(function (m) { return m.mijlpaal; }).join('|') === DOEL.join('|') && mc.map(function (m) { return m.id; }).join() === 'cap-m801,cap-m802,cap-m803,cap-m804,cap-m805' && mc.every(function (m) { return m.dagenNorm === 21; }) && !mc.some(function (m) { return /deal/.test(m.mijlpaal); }) &&
      ctx.lees('Mijlpalen').length === 5 && rc.ongewijzigd === 5 && rc.gewonnen === 1 && aantalWissels() === nWc + 1 && ctx.vind('Kansen', 'k7').fase === 'gewonnen' && ctx.vind('Kansen', 'k8').fase === DOEL[2] && mc.map(function (m) { return m.rol; }).join() === 'lead,,ap,ad,voorstel',
      'na toepassen: geen open mijlpaal deal/lopend traject meer; de vijf rijen houden hun id en dagenNorm en krijgen rol en gewicht; kansen in 1–5 blijven (geen wissel), de kans in 6 wordt gewonnen');
  } catch (e) { eis(false, 'v7.9.1 fasen (Capsule-namen): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }

  // --- de Capsule-import: rollen op naam, deal/lopend traject = gewonnen, geen dubbele mijlpaal naast een rij uit stap fasen ---
  vers79(); st = standBewaren();
  var echtCapsule = ctx.capsule;
  try {
    var mijl = CAP.map(function (n, i) { return { id: 901 + i, name: n, displayOrder: i + 1, probability: [5, 10, 20, 40, 60, 90][i], daysUntilStale: 30, pipeline: { name: 'Scholen' } }; })
      .concat([{ id: 911, name: 'Won', displayOrder: 7, probability: 100, complete: true, pipeline: { name: 'Scholen' } }, { id: 912, name: 'Lost', displayOrder: 8, probability: 0, complete: true, pipeline: { name: 'Scholen' } }]);
    ctx.capsule = function (pad) {
      if (pad === 'milestones') return { data: { milestones: mijl }, meer: false };
      return { data: { opportunities: [{ id: 9201, name: 'Dealkans', party: null, milestone: { id: 906 }, owner: { name: 'Lars Visser' }, createdAt: plusDagen(-40) + 'T09:00:00Z' }, { id: 9202, name: 'Apkans', party: null, milestone: { id: 903 }, owner: { name: 'Lars Visser' }, createdAt: plusDagen(-30) + 'T09:00:00Z' }] }, meer: false };
    };
    ctx.verwijderRijen('Mijlpalen', function () { return true; }); ctx.GEBRUIKER = null; ctx._LEES = {};
    eis(ctx.capsuleFase({ id: 906 }, { 906: { naam: CAP[5], complete: false, kans: 90 } }) === 'gewonnen' && ctx.capsuleFase({ id: 903, name: CAP[2] }, {}) === DOEL[2] && ctx.capsuleFase({ id: 1, name: 'Lost' }, {}) === 'verloren' && ctx.capsuleFase({ id: 2, name: 'Won' }, {}) === 'gewonnen',
      'capsuleFase: "6. Deal/Lopend traject" (open in Capsule) is gewonnen; de andere fasen houden hun naam; Won en Lost blijven gewonnen en verloren');
    ctx.capsulePagina('mijlpalen', 1);
    var cm = ctx.lees('Mijlpalen'), crol = cm.map(function (m) { return m.rol; }).join();
    eis(cm.length === 5 && cm.map(function (m) { return m.mijlpaal; }).join('|') === DOEL.join('|') && crol === 'lead,,ap,ad,voorstel' && !cm.some(function (m) { return /deal/.test(m.mijlpaal); }),
      'capsulePagina(mijlpalen) met de Capsule-namen: de rol op naam (lead, geen, ap, ad, voorstel), geen mijlpaalrij voor deal/lopend traject, Won en Lost');
    ctx._LEES = {}; ctx.capsulePagina('kansen', 1);
    var kd = ctx.vind('Kansen', 'cap-k9201'), ka = ctx.vind('Kansen', 'cap-k9202');
    eis(kd && kd.fase === 'gewonnen' && ka && ka.fase === DOEL[2] && wisselsVan('cap-k9202')[0].naarRol === 'ap' && wisselsVan('cap-k9202')[0].bron === 'capsule' && !ctx.lees('Trajecten').some(function (x) { return x.kansId === 'cap-k9201'; }),
      'Capsule-import: een kans in deal/lopend traject wordt gewonnen (zonder project); een kans in 3. AP krijgt een wissel met naarRol ap');
    // eerst stap fasen (eigen ids en gewichten), dan een herrun van de Capsule-mijlpalen: geen dubbele rij, het gewicht blijft
    ctx.verwijderRijen('Mijlpalen', function () { return true; }); ctx.GEBRUIKER = null; ctx._LEES = {};
    var pf = roep(SOPHIE, 'apiMigratieV79', 'fasen'), kf = {}; pf.mijlpalen.forEach(function (m) { kf[m.id] = m.voorstel; });
    roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: kf });
    var idsVoor = scholenRijen().map(function (m) { return m.id; }).join();
    ctx.GEBRUIKER = null; ctx._LEES = {}; ctx.capsulePagina('mijlpalen', 1);
    var na = ctx.lees('Mijlpalen');
    eis(na.length === 5 && na.map(function (m) { return m.id; }).join() === idsVoor && na.map(function (m) { return Number(m.kans); }).join() === '0,0,25,40,70' && na.map(function (m) { return m.rol; }).join() === 'lead,,ap,ad,voorstel',
      'Capsule-herrun na stap fasen: dezelfde pipeline en naam houdt het id van de rij uit stap fasen (geen dubbele mijlpaal), met rol en gewicht (N6)');
  } catch (e) { eis(false, 'v7.9.1 fasen (Capsule-import): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { ctx.capsule = echtCapsule; standTerug(st); }
})();

/* ---- v7.9.1, review ronde 2: F1 (een hernoemd-wissel sluit niets: gesloten volgt na een import de deal-wissel), F2 (stap fasen herziet de rol van app-wissels
   bij de foute v7.9-rollen), F3 (de koppeling oude naam → nieuwe naam voor import, Capsule, tijdlijn en reconstructie), F4 (een Capsule-herrun houdt gewicht en
   dagenNorm, ook bij cap-m-ids), F5 (fase 6 alleen voor een exacte dealnaam, ontkenningen, ad hoc, VO-school, gesprek gevoerd), F6 (Scholen zonder eigen
   mijlpalen), F7 (lezen en plannen binnen de lock), F8 (deals uit v7.9 met hun datum). Alles op de verzonnen demo-seed. ---- */
(function () {
  vers79(); var st = standBewaren();
  var CAP = ['1. Nog niet gebeld', '2. Pre-AP', '3. AP (Appointment Planned)', '4. AD (Appointment Done)', '5. VO (Voorstel / Offerte)', '6. Deal/Lopend traject'], CK = CAP.map(function (n) { return n.toLowerCase(); });
  var DOEL = ctx.CAPSULE_FASEN.map(function (f) { return f.mijlpaal; });
  var scholenRijen = function () { return ctx.mijlpalen().filter(function (m) { return m.pipeline === 'Scholen'; }); };
  var telling = function () { ctx._LEES = {}; var t = { ap: 0, ad: 0, voorstel: 0, deal: 0, verloren: 0 }; ctx.tellendeWissels().forEach(function (w) { var r = ctx.telRol(w); if (r) t[r]++; }); return JSON.stringify(t); };
  var voorstelKop = function (p) { var k = {}; p.mijlpalen.forEach(function (m) { k[m.id] = m.voorstel; }); return k; };
  var fasenToepassen = function (extra) { var p = roep(SOPHIE, 'apiMigratieV79', 'fasen'), o = { toepassen: true, koppeling: voorstelKop(p) }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return roep(SOPHIE, 'apiMigratieV79', 'fasen', o); };
  var standB = function (rollen) {  // stand (b): de Sheet uit de Capsule-migratie van v7.9, zes open rijen met ids cap-m…, en de rollen van toen
    ctx.verwijderRijen('Mijlpalen', function () { return true; });
    ctx.schrijfVeel('Mijlpalen', CAP.map(function (n, i) { return { id: 'cap-m' + (801 + i), pipeline: 'Scholen', mijlpaal: CK[i], volgorde: i + 1, kans: [5, 10, 20, 40, 60, 90][i], dagenNorm: 21, rol: rollen[i] }; }));
    var oud = { k9: 0, k12: 1, k8: 1, k11: 2, k6: 4, k7: 5 };
    ctx.schrijfVeel('Kansen', Object.keys(oud).map(function (id) { return { id: id, fase: CK[oud[id]] }; })); ctx._LEES = {};
  };
  try {
    // --- F5: de herkenner en de automatische Capsule-paden ---
    eis(['Geen deal', 'Nog geen deal', 'Deal verloren', 'Niet gewonnen', 'Lead won', 'Voorstel / deal', 'Deal voorbereiden'].every(function (n) { return ctx.faseVanNaam(n) !== '6'; }) &&
      ctx.faseVanNaam('Geen deal') === '' && ctx.faseVanNaam('Niet gewonnen') === '' && ctx.faseVanNaam('Deal verloren') === '' && ctx.faseVanNaam('Lead won') === '1' && ctx.faseVanNaam('Voorstel / deal') === '5' && ctx.faseVanNaam('Deal voorbereiden') === '' &&
      ctx.faseVanNaam('AD hoc') === '' && ctx.faseVanNaam('VO-school') === '' && ctx.faseVanNaam('VO (voortgezet onderwijs)') === '' && ctx.faseVanNaam('Gesprek gevoerd/gehad') === '4' && ctx.faseVanNaam('Gesprek gehad') === '4' &&
      ctx.faseVanNaam('Deal') === '6' && ctx.faseVanNaam('6. Deal') === '6' && ctx.faseVanNaam(CAP[5]) === '6' && ctx.faseVanNaam(CAP[0]) === '1' && ctx.faseVanNaam(CAP[4]) === '5',
      'review r2 F5: fase 6 alleen voor een exacte dealnaam ("Geen deal", "Nog geen deal", "Deal verloren", "Niet gewonnen", "Lead won", "Voorstel / deal", "Deal voorbereiden" niet); ad hoc, VO-school en VO (voortgezet onderwijs) zijn geen AD of VO; gesprek gevoerd/gehad is 4');
    eis(['Geen deal', 'Deal verloren', 'Niet gewonnen', 'Deal voorbereiden'].every(function (n) { return ctx.capsuleFase({ id: 1, name: n }, {}) === n.toLowerCase(); }) && ctx.capsuleFase({ id: 2, name: CAP[5] }, {}) === 'gewonnen' && ctx.capsuleFase({ id: 3, name: 'Lopend traject' }, {}) === 'gewonnen',
      'review r2 F5: capsuleFase maakt van "Geen deal", "Deal verloren", "Niet gewonnen" of "Deal voorbereiden" geen gewonnen (een open mijlpaal), wel van "6. Deal/Lopend traject" en "Lopend traject"');

    // --- F3 in stand (a), de demoseed: na fasen verandert "Rollen opnieuw toepassen" de telling niet, een oude tijdlijnregel telt voor dezelfde fase ---
    var t0 = telling(), s0 = roep(SOPHIE, 'apiMigratieV79', 'status');
    var ra = fasenToepassen(), t1 = telling(), kop = JSON.parse(ctx.P.getProperty('FASEN_KOPPELING') || '{}');
    eis(ra.toegepast && ra.herzien === 0 && t1 === t0 && kop.gesprek === DOEL[2] && kop.lead === DOEL[0] && kop.onderhandeling === DOEL[4] && s0.wissels.teHerzien === 0,
      'review r2 F3: stap fasen bewaart de koppeling oude naam → nieuwe naam (FASEN_KOPPELING); in de demoseed geen app-wissel om te herzien en de telling blijft gelijk');
    var sw = roep(SOPHIE, 'apiMigratieV79', 'status'), rw = roep(SOPHIE, 'apiMigratieV79', 'wissels', { toepassen: true }), t2 = telling();
    eis(sw.wissels.teHerzien === 0 && rw.gewijzigd === 0 && t2 === t0 && ['import', 'reconstructie'].every(function (b) { return ctx.lees('Fasewissels').filter(function (w) { return w.bron === b; }).every(function (w) { return w.naarRol; }); }),
      'review r2 F3: na fasen verandert "Rollen opnieuw toepassen" niets (status: 0 te herzien; import- en reconstructie-wissels houden hun rol via de koppeling; telling ' + t2 + ')');
    ctx.schrijf('Activiteiten', { id: 'act-rk-r2', type: 'fase', datum: plusDagen(-40) + ' 11:00', door: 'Yara El Amrani', schoolId: 's6', kansId: 'k12', onderwerp: 'Mijlpaal: lead → gesprek', bron: 'app', aangemaakt: plusDagen(-40) + ' 11:00' });
    ctx._LEES = {}; roep(SOPHIE, 'apiMigratieV79', 'tijdlijn', { toepassen: true });
    var tl = wisselRij('tl-act-rk-r2');
    eis(tl && tl.van === 'lead' && tl.naar === 'gesprek' && tl.vanRol === 'lead' && tl.naarRol === 'ap' && ctx.telRol(tl) === 'ap',
      'review r2 F3: een tijdlijnregel "Mijlpaal: lead → gesprek", omgezet na stap fasen, houdt zijn namen en telt als AP (gesprek → 3. ap via de koppeling)');
  } catch (e) { eis(false, 'v7.9.1 review r2 (stand a): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }

  // --- F2 en F1 in stand (b): de foute v7.9-rollen (1 lead, 2 ap, 3 ad, 4 voorstel, 5 en 6 geen) plus app-wissels sinds de overstap ---
  vers79(); st = standBewaren();
  try {
    standB(['lead', 'ap', 'ad', 'voorstel', '', '']);
    var a = roep(SOPHIE, 'apiKansOpslaan', { id: 'k8', fase: CK[2], _oud: { fase: CK[1] } }).fasewissel, b = roep(SOPHIE, 'apiKansOpslaan', { id: 'k11', fase: CK[3], _oud: { fase: CK[2] } }).fasewissel;
    ctx.schrijfVeel('Fasewissels', [{ id: 'fw-rk-imp', kansId: 'k9', schoolId: '', van: CK[1], naar: CK[2], werkelijkeDatum: '', ingevoerdOp: plusDagen(-30) + ' 10:00', door: 'Yara El Amrani', eigenaar: 'Yara El Amrani', zekerheid: '', bron: 'import', ongedaan: '', vanRol: 'ap', naarRol: 'ad', waarde: 0, reden: '', bewijs: '', rolBron: 'volgorde', verwijderd: '' }]);
    ctx._LEES = {};
    eis(ctx.telRol(wisselRij(a.id)) === 'ad' && ctx.telRol(wisselRij(b.id)) === 'voorstel', 'review r2 F2 (uitgangspunt): met de foute v7.9-rollen telt een app-wissel 2 → 3 als AD en 3 → 4 als VO');
    var pb = roep(SOPHIE, 'apiMigratieV79', 'fasen'), sb = roep(SOPHIE, 'apiMigratieV79', 'status');
    eis(pb.herzien === 2 && sb.wissels.teHerzien >= 1, 'review r2 F2: de proefdraai telt de app-wissels van Scholen met rolBron mijlpaal en een andere rol dan die van de nieuwe fase (herzien ' + pb.herzien + ')');
    var nW = aantalWissels(), t = telSchrijfVeel(function () { return roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: voorstelKop(pb) }); }), rb = t.uit, wa = wisselRij(a.id), wb = wisselRij(b.id);
    eis(rb.herzien === 2 && wa.vanRol === 'lead' && wa.naarRol === 'ap' && ctx.telRol(wa) === 'ap' && wb.vanRol === 'ap' && wb.naarRol === 'ad' && ctx.telRol(wb) === 'ad' && wa.rolBron === 'mijlpaal' && wa.van === CK[1] && wa.naar === CK[2] && t.n === 2 && aantalWissels() === nW + 1 && /tellen nu voor de nieuwe fase/.test(rb.melding),
      'review r2 F2: na toepassen telt 2 → 3 als AP en 3 → 4 als AD (namen blijven, één wisselsBijwerken naast het ene schrijfVeel van de nieuwe wissels; herzien 2)');
    var rw2 = roep(SOPHIE, 'apiMigratieV79', 'wissels', { toepassen: true }), imp0 = wisselRij('fw-rk-imp');
    eis(ctx.telRol(wisselRij(a.id)) === 'ap' && ctx.telRol(wisselRij(b.id)) === 'ad' && imp0.vanRol === 'lead' && imp0.naarRol === 'ap' && rw2.gewijzigd >= 1 && roep(SOPHIE, 'apiMigratieV79', 'status').wissels.teHerzien === 0,
      'review r2 F2: "Rollen opnieuw toepassen" daarna laat de app-wissels zo en zet de import-wissel op AP; daarna 0 te herzien');
    // F1: k7 stond in 6. deal/lopend traject; de vervolgstap is de werkelijke datum importeren
    var k7 = ctx.vind('Kansen', 'k7');
    eis(k7.fase === 'gewonnen' && !k7.gesloten && !ctx.dealWissels().some(function (w) { return w.kansId === 'k7'; }), 'review r2 F1 (uitgangspunt): na fasen is k7 gewonnen met een hernoemd-wissel, zonder gesloten en zonder deal');
    var imp = roep(SOPHIE, 'apiFasewisselsImport', 'kans;fase;werkelijke datum;zekerheid;soort bewijs\nk7;gewonnen;' + plusDagen(-20) + ';hoog;mail', { toepassen: true });
    var k7n = ctx.vind('Kansen', 'k7'), d7 = ctx.dealWissels().filter(function (w) { return w.kansId === 'k7'; });
    eis(imp.nieuw === 1 && imp.gesloten === 1 && k7n.gesloten === plusDagen(-20) && d7.length === 1 && d7[0].werkelijkeDatum === plusDagen(-20) && ctx.laatsteSluitendeWissel('k7', 'gewonnen').bron === 'reconstructie',
      'review r2 F1: fasen met doel 6 → import van de werkelijke datum → Kansen.gesloten = de deal-wissel (N8), niet de overstapdag');
    roep(SOPHIE, 'apiFasewisselDatum', d7[0].id, plusDagen(-25));
    eis(ctx.vind('Kansen', 'k7').gesloten === plusDagen(-25) && ctx.dealWissels().filter(function (w) { return w.kansId === 'k7'; })[0].werkelijkeDatum === plusDagen(-25), 'review r2 F1: Andere datum op die wissel verschuift gesloten mee; de hernoemd-wissel van de overstapdag telt niet');
  } catch (e) { eis(false, 'v7.9.1 review r2 (stand b): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }

  // --- F8: deals uit v7.9 (een vastgelegde wissel naar de deal-mijlpaal) met hun datum, als besluit van de beheerder ---
  vers79(); st = standBewaren();
  try {
    standB(['lead', 'ap', 'ad', 'voorstel', '', '']);
    var nv = ctx.wisselBuren('k6').nietVoor || plusDagen(-3), dd = nv > plusDagen(-3) ? nv : plusDagen(-3);
    roep(SOPHIE, 'apiKansOpslaan', { id: 'k6', fase: CK[5], _oud: { fase: CK[4] }, wissel: { datum: dd } });
    var p8 = roep(SOPHIE, 'apiMigratieV79', 'fasen'), m6 = p8.mijlpalen.filter(function (m) { return m.id === 'cap-m806'; })[0], nT = ctx.lees('Trajecten').length;
    eis(m6.open === 2 && m6.metDatum === 1 && m6.voorstel === '6', 'review r2 F8: de proefdraai telt per mijlpaal de open kansen met een vastgelegde wissel ernaartoe (metDatum: bij doel 6 de deals uit v7.9)');
    var r8 = roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: voorstelKop(p8), dealDatum: true }), k6 = ctx.vind('Kansen', 'k6'), w6 = wisselsVan('k6').filter(function (w) { return w.naar === 'gewonnen'; });
    eis(r8.gewonnen === 2 && r8.dealDatum === 1 && k6.fase === 'gewonnen' && k6.gesloten === dd && w6.length === 1 && w6[0].bron === 'reconstructie' && w6[0].werkelijkeDatum === dd && w6[0].zekerheid === 'hoog' &&
      ctx.dealWissels().some(function (w) { return w.kansId === 'k6' && w.werkelijkeDatum === dd; }) && !ctx.dealWissels().some(function (w) { return w.kansId === 'k7'; }) && wisselsVan('k7').filter(function (w) { return w.naar === 'gewonnen'; })[0].bron === 'hernoemd' && ctx.lees('Trajecten').length === nT,
      'review r2 F8: met dealDatum krijgt een deal uit v7.9 een wissel naar gewonnen met bron reconstructie en zijn datum (telt als deal, gesloten = die datum, geen project); een kans zonder datum blijft hernoemd');
  } catch (e) { eis(false, 'v7.9.1 review r2 (F8): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }

  // --- F4: een Capsule-herrun na stap fasen, bij de ids cap-m… uit de Capsule-migratie ---
  vers79(); st = standBewaren();
  var echtCapsule = ctx.capsule;
  try {
    var mijl = CAP.map(function (n, i) { return { id: 901 + i, name: n, displayOrder: i + 1, probability: [5, 10, 20, 40, 60, 90][i], daysUntilStale: 30, pipeline: { name: 'Scholen' } }; })
      .concat([{ id: 911, name: 'Geen deal', displayOrder: 7, probability: 0, pipeline: { name: 'Scholen' } }]);
    ctx.capsule = function (pad) { if (pad === 'milestones') return { data: { milestones: mijl }, meer: false }; return { data: { opportunities: [] }, meer: false }; };
    ctx.verwijderRijen('Mijlpalen', function () { return true; }); ctx.GEBRUIKER = null; ctx._LEES = {};
    ctx.capsulePagina('mijlpalen', 1);
    var c0 = ctx.lees('Mijlpalen');
    eis(c0.length === 6 && c0.map(function (m) { return m.id; }).join() === 'cap-m901,cap-m902,cap-m903,cap-m904,cap-m905,cap-m911' && c0[5].mijlpaal === 'geen deal' && c0.map(function (m) { return Number(m.kans); }).join() === '5,10,20,40,60,0',
      'review r2 F5: capsulePagina maakt van "Geen deal" een gewone mijlpaal (geen gewonnen); de nieuwe rijen krijgen de waarschijnlijkheid uit Capsule');
    ctx.verwijderRijen('Mijlpalen', function (m) { return m.id === 'cap-m911'; }); mijl.pop(); ctx._LEES = {};
    var nA = ctx.aannameVersies('fasegewichten').length;
    fasenToepassen();
    ctx.schrijfVeel('Mijlpalen', [{ id: 'cap-m903', dagenNorm: 12 }]); ctx._LEES = {};
    var nA1 = ctx.aannameVersies('fasegewichten').length;
    ctx.GEBRUIKER = null; ctx._LEES = {}; ctx.capsulePagina('mijlpalen', 1); ctx._LEES = {};
    var c1 = scholenRijen();
    eis(nA1 === nA + 1 && c1.map(function (m) { return m.id; }).join() === 'cap-m901,cap-m902,cap-m903,cap-m904,cap-m905' && c1.map(function (m) { return m.kans; }).join() === '0,0,25,40,70' && c1[2].dagenNorm === 12 && c1[0].dagenNorm === 30 &&
      c1.map(function (m) { return m.rol; }).join() === 'lead,,ap,ad,voorstel' && ctx.fasenAlGedaan() && ctx.aannameVersies('fasegewichten').length === nA1 && ctx.fasegewichtVan({ fase: DOEL[2], pipeline: 'Scholen' }) === 25,
      'review r2 F4: een Capsule-herrun na stap fasen houdt bij de ids cap-m… de gewichten 0, 0, 25, 40, 70 en een aangepaste dagenNorm; alGedaan blijft waar, geen nieuwe versie van fasegewichten');
  } catch (e) { eis(false, 'v7.9.1 review r2 (F4): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { ctx.capsule = echtCapsule; standTerug(st); }

  // --- F6: de pipeline van Capsule heet anders dan Scholen ---
  vers79(); st = standBewaren();
  try {
    ctx.verwijderRijen('Mijlpalen', function () { return true; });
    ctx.schrijfVeel('Mijlpalen', CAP.map(function (n, i) { return { id: 'sales-' + (i + 1), pipeline: 'Sales', mijlpaal: CK[i], volgorde: i + 1, kans: [5, 10, 20, 40, 60, 90][i], dagenNorm: 21, rol: '' }; })); ctx._LEES = {};
    var pd = roep(SOPHIE, 'apiMigratieV79', 'fasen'), voorM = JSON.stringify(ctx.lees('Mijlpalen').map(function (m) { return [m.id, m.pipeline, m.mijlpaal]; })), nWd = aantalWissels(), nAd = ctx.aannameVersies('fasegewichten').length;
    var fd = faalt(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: {} });
    eis(!pd.mijlpalen.length && pd.anderePipelines.length === 1 && pd.anderePipelines[0].pipeline === 'Sales' && pd.anderePipelines[0].herkend === 6 && /geen eigen mijlpalen/.test(fd) && /Sales/.test(fd) &&
      JSON.stringify(ctx.lees('Mijlpalen').map(function (m) { return [m.id, m.pipeline, m.mijlpaal]; })) === voorM && aantalWissels() === nWd && ctx.aannameVersies('fasegewichten').length === nAd && !ctx.P.getProperty('FASEN_KOPPELING'),
      'review r2 F6: zonder eigen mijlpalen in Scholen noemt de proefdraai de pipeline met de Capsule-namen en weigert toepassen met een Nederlandse fout (niets geschreven)');
  } catch (e) { eis(false, 'v7.9.1 review r2 (F6): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { standTerug(st); }

  // --- F7: lezen, plan en alGedaan binnen de lock ---
  vers79(); st = standBewaren();
  var echtLock = ctx.metLock;
  try {
    var p7 = roep(SOPHIE, 'apiMigratieV79', 'fasen'), kop7 = voorstelKop(p7), eerste = true;
    ctx.metLock = function (fn) { if (eerste) { eerste = false; ctx.schrijfVeel('Kansen', [{ id: 'k8', fase: 'voorstel' }]); } return echtLock(fn); };  // een opslag tussen het lezen en de lock
    roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: kop7 });
    var h8 = wisselsVan('k8').filter(function (w) { return w.bron === 'hernoemd'; });
    eis(ctx.vind('Kansen', 'k8').fase === DOEL[4] && h8.length === 1 && h8[0].van === 'voorstel', 'review r2 F7: een kans die vlak voor de lock is opgeslagen, verhuist vanuit zijn nieuwe fase (de stap leest binnen de lock)');
  } catch (e) { eis(false, 'v7.9.1 review r2 (F7a): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { ctx.metLock = echtLock; standTerug(st); }
  vers79(); st = standBewaren();
  try {
    var p7b = roep(SOPHIE, 'apiMigratieV79', 'fasen'), kop7b = voorstelKop(p7b), open7 = ctx.lees('Kansen').filter(ctx.kansOpen).length, nA7 = ctx.aannameVersies('fasegewichten').length, nW7 = aantalWissels(), binnen = true;
    ctx.metLock = function (fn) { if (binnen) { binnen = false; echtLock(function () { return ctx.migratieFasen({ koppeling: kop7b }, true); }); } return echtLock(fn); };  // een tweede Toepassen dat net eerder de lock kreeg
    var r7 = roep(SOPHIE, 'apiMigratieV79', 'fasen', { toepassen: true, koppeling: kop7b });
    eis(r7.alGedaan && aantalWissels() === nW7 + open7 && ctx.lees('Fasewissels').filter(function (w) { return w.bron === 'hernoemd'; }).length === open7 && ctx.aannameVersies('fasegewichten').length === nA7 + 1,
      'review r2 F7: twee keer Toepassen tegelijk schrijft de hernoemd-wissels en de versie van fasegewichten één keer (de tweede ziet binnen de lock dat het al zo staat)');
  } catch (e) { eis(false, 'v7.9.1 review r2 (F7b): onverwachte fout ' + e.message + ' ' + String(e.stack).split('\n')[1]); } finally { ctx.metLock = echtLock; standTerug(st); }
})();

/* ---- bestaande schermen blijven werken ---- */
['demo-sophie', 'demo-lars', 'demo-femke', 'demo-sem', 'demo-iris'].forEach(function (c) { eis(!faalt(c, 'apiOverzicht') && !faalt(c, 'apiHome') && !faalt(c, 'apiTaken') && !faalt(c, 'apiAgenda', plusDagen(-3), plusDagen(10)) && !faalt(c, 'apiTrajecten') && (c === 'demo-lars' || !faalt(c, 'apiBezetting')), 'schermen laden als ' + c); });
try { ctx.GEBRUIKER = null; ctx.nachtelijkeReview(); eis(true, 'nachtelijke review draait'); } catch (e) { eis(false, 'nachtelijke review draait: ' + e.message); }

console.log(fouten ? 'FOUTEN: ' + fouten : 'ALLES GOED');
process.exit(fouten ? 1 : 0);
