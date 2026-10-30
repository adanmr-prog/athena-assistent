/* Athena Assistent — demoprofiel "groot" (v7.4): ?demo=1&schaal=groot, ook met &rol=… en &kaal=1.
 * Vult de standaardseed (demoVul in demo-backend.js) aan tot de schaal en de mix van de praktijk: dit schooljaar lopende en geplande
 * projecten, het vorige schooljaar afgerond, scholen en particulieren, kansen in alle fases, een talentbestand (actief, slapend,
 * aangemeld) met VOG's, beschikbaarheid en peilingen, weekuren van de laatste 26 weken, vacatures en kandidaten, termijnen met een
 * paar creditnota's, activiteiten, taken, en in de map XPS-export een dienstenexport per dienst van de laatste twee weken.
 * Verdelingen afgeleid van eigen exports, afgerond, met ruis. Alle namen, scholen, nummers en bedragen zijn verzonnen; een bedrag
 * volgt uit verzonnen uren × een verzonnen uurtarief per product. E-mailadressen eindigen op .example.
 * Vaste seed (mulberry32), geen Math.random; datums relatief aan vandaag en in kalenderdagen (plusDagen, middag + Math.round).
 * De standaardseed en de tien demogebruikers blijven ongewijzigd: &rol= werkt en de bestaande tests houden hun basis.
 * Opslag: de basis wordt bij elke start met dezelfde seed opnieuw opgebouwd; demoGrootExport bewaart in sessionStorage alleen de
 * rijen die afwijken van die basis (per tabblad op de sleutel in de eerste kolom), want het hele profiel is te groot voor het quotum.
 * Een bewaarde stand past alleen op een basis van dezelfde dag en opslagversie (de basis hangt af van vandaag); anders een verse demo.
 * Dit bestand wordt in de demo na demo-backend.js en Code.gs geëvalueerd (demo/demo.js) en draait los in test/demo_groot_test.js. */

var DEMO_GROOT = { seed: 7404, basis: null, telling: null, dag: '' };
var GROOT_OPSLAG_VERSIE = 1;  // v7.4 (iOS-review): omhoog als de vorm van de bewaarde stand of de opbouw van de basis verandert

// v7.4: mulberry32, dezelfde PRNG als test/fuzz.js; elke start levert dezelfde reeks
function _grootRng(seed) {
  var s = seed >>> 0;
  return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ----- Woordlijsten (verzonnen samenstellingen; geen echte scholen of scholengroepen) ----- */
var GROOT_WOORDEN = {
  kern: ['Vlierbes', 'Zonnedauw', 'Lisdodde', 'Watermunt', 'Kamperfoelie', 'Sleedoorn', 'Vogelkers', 'Haagbeuk', 'Zilverspar', 'Moerbei', 'Gagel', 'Pinksterbloem', 'Dotterbloem',
    'Klokjesbloem', 'Zandhaver', 'Helmgras', 'Tureluur', 'Wielewaal', 'Roerdomp', 'Kwikstaart', 'Boomvalk', 'Kornoelje', 'Duizendblad', 'Pijlkruid', 'Rietgors', 'Blauwborst', 'Zomereik',
    'Veldkers', 'Waterviolier', 'Hondsroos', 'Kruisbes', 'Sterappel', 'Watersnip', 'Boshyacint', 'Ratelaar', 'Knoopkruid', 'Graspieper', 'Zeekraal', 'Lamsoor', 'Kievitsbloem'],
  // [soort, gewicht, type, vooraan]
  soort: [['College', 42, 'VO', false], ['Lyceum', 12, 'VO', true], ['Mavo', 9, 'VMBO', false], ['ISK', 8, 'ISK', true], ['Praktijkschool', 7, 'PRO', true], ['Scholengemeenschap', 9, 'VO', true], ['Basisschool De', 10, 'PO', true], ['Vakcollege', 3, 'VMBO', true]],
  // bestaande Nederlandse plaatsen met hun ligging (voor de reisafstand in de matching); zwaarder rond het midden van het land
  plaats: [['Utrecht', 52.0907, 5.1214, 9], ['Amersfoort', 52.1561, 5.3878, 5], ['Nieuwegein', 52.0292, 5.0808, 3], ['Zeist', 52.0889, 5.2317, 3], ['Houten', 52.0283, 5.1685, 2], ['Woerden', 52.0855, 4.8833, 2],
    ['Hilversum', 52.2292, 5.1669, 3], ['Veenendaal', 52.0280, 5.5560, 2], ['Ede', 52.0402, 5.6649, 2], ['Culemborg', 51.9550, 5.2270, 1], ['Tiel', 51.8870, 5.4300, 1], ['Gouda', 52.0115, 4.7105, 2],
    ['Amsterdam', 52.3700, 4.8950, 5], ['Amstelveen', 52.3000, 4.8630, 2], ['Zaandam', 52.4380, 4.8260, 2], ['Purmerend', 52.5050, 4.9590, 1], ['Haarlem', 52.3874, 4.6462, 3], ['Alkmaar', 52.6320, 4.7480, 2],
    ['Hoorn', 52.6430, 5.0600, 1], ['Almere', 52.3500, 5.2640, 3], ['Lelystad', 52.5180, 5.4710, 1], ['Leiden', 52.1601, 4.4970, 3], ['Den Haag', 52.0700, 4.3000, 4], ['Delft', 52.0116, 4.3571, 2],
    ['Zoetermeer', 52.0570, 4.4940, 2], ['Alphen aan den Rijn', 52.1290, 4.6560, 1], ['Rotterdam', 51.9244, 4.4777, 5], ['Schiedam', 51.9192, 4.3889, 1], ['Dordrecht', 51.8130, 4.6900, 2], ['Breda', 51.5890, 4.7760, 2],
    ['Tilburg', 51.5600, 5.0910, 2], ["'s-Hertogenbosch", 51.6978, 5.3037, 2], ['Oss', 51.7650, 5.5180, 1], ['Eindhoven', 51.4410, 5.4700, 2], ['Nijmegen', 51.8126, 5.8372, 2], ['Arnhem', 51.9851, 5.8987, 2],
    ['Apeldoorn', 52.2110, 5.9690, 2], ['Deventer', 52.2552, 6.1639, 1], ['Zwolle', 52.5168, 6.0830, 2], ['Harderwijk', 52.3420, 5.6320, 1], ['Kampen', 52.5550, 5.9110, 1], ['Doetinchem', 51.9650, 6.2890, 1]],
  voornaam: ['Anna', 'Bram', 'Daan', 'Emma', 'Fenna', 'Gijs', 'Hidde', 'Isa', 'Jesse', 'Julia', 'Kiki', 'Liam', 'Lieke', 'Luuk', 'Maud', 'Mees', 'Milan', 'Nina', 'Noah', 'Olivier', 'Puck', 'Quinten',
    'Roos', 'Sanne', 'Senna', 'Siem', 'Sven', 'Teun', 'Thijs', 'Tess', 'Vera', 'Wessel', 'Zoë', 'Ayoub', 'Elif', 'Emre', 'Hamza', 'Ilias', 'Imane', 'Nora', 'Rayan', 'Salma', 'Yasmine', 'Mila', 'Jip',
    'Floor', 'Ruben', 'Lotte', 'Stijn', 'Femke', 'Joris', 'Merel', 'Niels', 'Esmee', 'Jelle', 'Iris', 'Bas', 'Lynn', 'Koen', 'Demi', 'Ravi', 'Priya', 'Kevin', 'Shanti', 'Dewi', 'Youssef', 'Meryem', 'Mehmet',
    'Selin', 'Amina', 'Bilal', 'Lars', 'Fleur', 'Tim', 'Eline', 'Robin', 'Sem', 'Lisa', 'Max', 'Anouk'],
  achterVoor: ['', '', '', '', '', 'van ', 'de ', 'van der ', 'van den ', 'ter ', 'te '],
  achterStam: ['Brink', 'Molen', 'Hoeve', 'Akker', 'Esch', 'Holt', 'Kamp', 'Wiel', 'Venne', 'Beek', 'Dijk', 'Wouden', 'Ruiter', 'Smeed', 'Weide', 'Vliet', 'Laar', 'Kolk', 'Horst', 'Broek', 'Hage',
    'Rijs', 'Sterk', 'Zand', 'Haar', 'Stroom', 'Meer', 'Gaas', 'Hulsk', 'Ooster', 'Wester', 'Noorder', 'Bergs', 'Velde', 'Rozen', 'Linde', 'Esse', 'Mark', 'Drent', 'Gelder'],
  achterEind: ['man', 'ink', 'horst', 'kamp', 'veld', 'inga', 'stra', 'werf', 'hof', 'sma', 'ing', 'ers', 'huis', 'mans', 'link', 'boer', 'kes', 'loo', 'enga', 'heuvel'],
  // v7.4: privacycontrole — geen losse achternaam die ook in de eigen exports voorkomt (gecontroleerd buiten de repo, alleen tellingen)
  achterLos: ['Bakkali', 'Ouarzazi', 'Demirkol', 'Karaaslan', 'Soekhoe', 'Ramkalawan', 'Haddouchi', 'Elmaci', 'Elkadiri', 'Djoemai', 'Bouzian', 'Yavuzer', 'Ozkara', 'Mahabier', 'Lachkar', 'Tekinalp'],
  functie: ['Teamleider onderbouw', 'Teamleider bovenbouw', 'Conrector', 'Zorgcoördinator', 'Afdelingsleider', 'Directeur', 'Coördinator NT2', 'Examensecretaris', 'Locatiedirecteur', 'Intern begeleider', 'Coördinator leerlingzaken'],
  opleiding: ['pabo, 1e jaar', 'pabo, 2e jaar', 'pabo, 3e jaar', 'pabo, afgestudeerd', 'student pedagogiek, 2e jaar', 'student pedagogiek, 3e jaar', 'lerarenopleiding wiskunde, 2e jaar', 'lerarenopleiding Engels, 3e jaar',
    'lerarenopleiding Nederlands, 4e jaar', 'lerarenopleiding biologie, 2e jaar', 'mbo 4 onderwijsassistent', 'mbo 4 pedagogisch medewerker', 'student psychologie, 2e jaar', 'student rechten, 3e jaar', 'master onderwijskunde',
    'nt2-certificaat', 'student economie, 1e jaar', 'student bouwkunde, 2e jaar', 'havo', 'vwo', 'gepensioneerd docent'],
  vakken: ['nederlands', 'engels', 'wiskunde', 'rekenen', 'duits', 'frans', 'natuurkunde', 'scheikunde', 'biologie', 'economie', 'geschiedenis', 'aardrijkskunde'],
  niveau: ['1 vmbo', '2 vmbo', '3 havo', '4 havo', '5 havo', '4 vwo', '5 vwo', '6 vwo', 'groep 7', 'groep 8'],
  verlies: ['Te duur', 'Eigen oplossing gevonden', 'Geen budget', 'Andere aanbieder', 'Geen capaciteit bij de school', 'Uitgesteld naar volgend schooljaar']
};
// [product, gewicht dit jaar, gewicht vorig jaar, uren per dienst, mediaan en p90 ondersteuners, kans per week aan het werk, diensten per week (mediaan), uurtarief (verzonnen), functie, dagdeel, vacaturetitel]
var GROOT_PRODUCTEN = [
  ['Onderwijsondersteuning', 25, 25, [6, 6.5, 8, 8.5], 3, 8, 0.8, 3.5, 44, 'onderwijsondersteuner', 'ochtend', 'Onderwijsondersteuner'],
  ['Huiswerkbegeleiding', 15, 15, [3, 3.25, 4], 2, 5, 0.75, 2.5, 40, 'huiswerkbegeleider', 'middag', 'Huiswerkbegeleider'],
  ['NT2-ondersteuning', 15, 10, [5.5, 6], 2, 5, 0.85, 4, 46, 'nt2-ondersteuner', 'ochtend', 'NT2-ondersteuner'],
  ['Studentdocent', 15, 10, [6, 6.5, 8], 1.5, 3, 0.85, 2.5, 43, 'studentdocent', 'ochtend', 'Studentdocent'],
  ['Surveillance', 15, 15, [5.5, 6, 8], 18, 40, 0.55, 2, 38, 'surveillant', 'ochtend', 'Surveillant'],
  ['Basisvaardigheden', 10, 10, [3, 3.25, 4], 2, 4, 0.75, 2.5, 42, 'rekenondersteuner', 'middag', 'Ondersteuner basisvaardigheden'],
  ['Examentraining', 5, 10, [3, 4], 2, 4, 0.6, 2, 46, 'examentrainer', 'middag', 'Examentrainer'],
  ['Bijles', 5, 5, [3, 3.25], 1.5, 3, 0.7, 2, 41, 'huiswerkbegeleider', 'middag', 'Bijlesdocent'],
  ['Online begeleiding', 2, 2, [3, 4], 1, 2, 0.6, 2, 40, 'huiswerkbegeleider', 'middag', 'Online begeleider'],
  ['Overig', 3, 3, [4, 6], 1.5, 3, 0.6, 2, 42, 'onderwijsondersteuner', 'ochtend', 'Ondersteuner']  // zonder productlabel in de bron: datakwaliteit, met een signaal
];
var GROOT_PARTICULIER_TARIEF = 34.75;  // verzonnen lesbedrag per uur; particuliere facturen zijn een veelvoud ervan (v7.4: privacycontrole, geen echt factuurbedrag is er een veelvoud van)

/* ----- De generator ----- */
function demoGrootVul() {
  GEBRUIKER = null;
  var R = _grootRng(DEMO_GROOT.seed), W = GROOT_WOORDEN, P = GROOT_PRODUCTEN;
  function kies(l) { return l[Math.floor(R() * l.length)]; }
  function gewogen(p, i0) { var som = 0, i, g = i0 || 1; for (i = 0; i < p.length; i++) som += p[i][g]; var r = R() * som; for (i = 0; i < p.length; i++) { r -= p[i][g]; if (r < 0) return p[i]; } return p[p.length - 1]; }
  function tussen(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function ruis(x) { return x * (0.85 + 0.3 * R()); }
  function aantal(x) { return Math.max(1, Math.round(ruis(x))); }
  function normaal() { var u = R() || 1e-9, v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function lognorm(med, p90) { return med * Math.exp(Math.log(p90 / med) / 1.2816 * normaal()); }
  function kans(p) { return R() < p; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function euro(x) { return Math.round(x * 100) / 100; }
  function sl(s) { return zonderAccenten(String(s).toLowerCase()).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''); }
  var j = function (o) { return JSON.stringify(o); };

  /* datums: n = kalenderdagen vanaf vandaag */
  var vandaagM = middag(new Date()), DAG = {};
  function dag(n) { var x = DAG[n]; if (!x) { var z = plusDagen(n); x = DAG[n] = { s: datumStr(z), wd: z.getDay(), wnr: isoWeek(z), week: isoWeekStr(z), m: z.getMonth() + 1, jr: z.getFullYear() }; } return x; }
  function d(n) { return dag(n).s; }
  function dt(n, t) { return d(n) + ' ' + (t || '10:00'); }
  function op(jr, m, dd) { return Math.round((middag(new Date(jr, m - 1, dd)) - vandaagM) / 86400000); }  // dagen tot een kalenderdatum
  function offVan(s) { var x = parseDatum(String(s || '').slice(0, 10)); return x ? Math.round((middag(x) - vandaagM) / 86400000) : 0; }  // dagen tot een datumtekst
  function werkdagTerug(n) { while (dag(n).wd === 0 || dag(n).wd === 6) n--; return n; }
  function werkdagVooruit(n) { while (dag(n).wd === 0 || dag(n).wd === 6) n++; return n; }
  function uur() { return kies(['08:45', '09:10', '09:30', '10:15', '11:00', '11:40', '13:20', '14:05', '15:00', '15:45', '16:30']); }
  var ma0 = -((dag(0).wd + 6) % 7);  // maandag van deze week
  var sj = huidigSchooljaar(), j1 = Number(sj.slice(0, 4));
  var M = {}; DEMO_MENSEN.forEach(function (m) { M[m.code.slice(5)] = m.naam; });
  var CONSULTANTS = [[M.lars, 38], [M.noor, 34], [M.yara, 28]], AMS = [[M.femke, 42], [M.ruben, 34], [M.bas, 22]], SCOUTS = [[M.sem, 60], [M.iris, 40]];
  var PLAATS = W.plaats.map(function (x) { return [x, x[3]]; });

  // schoolweken: vakanties en toetsweken op het ISO-weeknummer (landelijk gemiddeld; regio's verschuiven een week)
  function weekFactor(wnr, surveillance) {
    if (wnr >= 29 && wnr <= 35) return 0;
    if (wnr === 43 || wnr === 52 || wnr === 1 || wnr === 18) return wnr === 43 ? 0.12 : 0.05;
    if (surveillance) return wnr === 42 || wnr === 51 || wnr === 12 || wnr === 13 || wnr === 20 || wnr === 21 || wnr === 26 || wnr === 27 ? 1 : wnr === 4 || wnr === 47 ? 0.4 : 0.06;
    var f = { 36: 0.3, 37: 0.5, 38: 0.7, 39: 0.85, 40: 0.9, 41: 0.95, 42: 1.25, 51: 1.5, 8: 0.75, 9: 0.85, 12: 1.4, 13: 1.4, 17: 0.6, 20: 1.4, 21: 1.4, 27: 1.3, 28: 0.5 }[wnr];
    return f === undefined ? 1 : f;
  }
  function schoolweek(n) { return weekFactor(dag(n).wnr, false) >= 0.5; }

  /* ----- personen en namen ----- */
  var gebruiktNaam = {};
  function achternaam() {
    if (kans(0.14)) return kies(W.achterLos);
    var voor = kies(W.achterVoor), stam = kies(W.achterStam), eind = kies(W.achterEind);
    return voor + stam + eind;
  }
  function persoonsnaam() { for (var i = 0; i < 50; i++) { var v = kies(W.voornaam), a = achternaam(), k = v + ' ' + a; if (!gebruiktNaam[k]) { gebruiktNaam[k] = 1; return [v, a]; } } return [kies(W.voornaam), achternaam() + 's']; }
  DEMO_MENSEN.forEach(function (m) { gebruiktNaam[m.naam] = 1; });
  function telefoon(n) { return '06-' + String(30000000 + (n * 7919) % 9999999).slice(0, 8); }

  /* ----- scholen ----- */
  var scholen = [], gebruiktSchool = {}, nS = 0, nPart = 0;
  function nieuweSchool(status, eigenaarDagen) {
    var naam, so, pl;
    for (var i = 0; i < 80; i++) {
      so = gewogen(W.soort); pl = gewogen(PLAATS)[0];
      var kern = kies(W.kern); naam = (so[3] ? so[0] + ' ' + kern : kern + ' ' + so[0]) + ' ' + pl[0];
      if (!gebruiktSchool[naam]) break;
    }
    gebruiktSchool[naam] = 1; nS++;
    var id = 'gs' + nS, dom = sl(naam).replace(/\./g, '-') + '.example', type = so[2];
    var s = { id: id, naam: naam, plaats: pl[0], type: type, status: status, eigenaar: gewogen(CONSULTANTS)[0], leerlingen: type === 'PO' ? tussen(160, 520) : type === 'ISK' ? tussen(120, 420) : type === 'PRO' ? tussen(150, 380) : tussen(450, 2200),
      bestuur: 'Onderwijsstichting ' + naam.split(' ').filter(function (w) { return W.kern.indexOf(w) >= 0; })[0], email: 'info@' + dom, website: 'www.' + dom, telefoon: '0' + tussen(10, 79) + '-' + tussen(2000000, 7999999),
      adres: kies(['Schoolweg', 'Lindelaan', 'Kerkstraat', 'Stationsweg', 'Parkweg', 'Dorpsstraat', 'Molenweg', 'Julianalaan']) + ' ' + tussen(1, 140) + ', ' + pl[0], tags: type.toLowerCase(),
      aangemaakt: dt(-tussen(eigenaarDagen || 420, (eigenaarDagen || 420) + 600), '09:00'), laatsteContact: '', lat: Math.round((pl[1] + (R() - 0.5) * 0.03) * 10000) / 10000, lon: Math.round((pl[2] + (R() - 0.5) * 0.05) * 10000) / 10000,
      betaaltermijn: Math.max(7, Math.min(95, Math.round(lognorm(30, 60)))), _projecten: 0 };
    scholen.push(s); return s;
  }
  function nieuweParticulier() {
    nPart++;
    var pr = kans(0.6) ? 'bijles' : 'huiswerkbegeleiding', vak = pr === 'bijles' ? kies(['wiskunde', 'engels', 'nederlands', 'scheikunde', 'natuurkunde', 'economie', 'frans']) : '', pl = gewogen(PLAATS)[0];
    var id = 'gs' + (++nS), naam = 'Particulier ' + ('00' + nPart).slice(-3) + ' – ' + pr + (vak ? ' ' + vak : '') + ' ' + kies(W.niveau);
    var s = { id: id, naam: naam, plaats: pl[0], type: 'particulier', status: 'klant', eigenaar: M.noor, leerlingen: 1, bestuur: '', email: 'particulier' + ('00' + nPart).slice(-3) + '@mail.example', website: '', telefoon: telefoon(nPart + 500),
      adres: pl[0], tags: 'particulier', aangemaakt: dt(-tussen(20, 500), '19:30'), laatsteContact: '', lat: Math.round(pl[1] * 10000) / 10000, lon: Math.round(pl[2] * 10000) / 10000,
      betaaltermijn: Math.max(3, Math.min(60, Math.round(lognorm(15, 30)))), _projecten: 0, _particulier: pr };
    scholen.push(s); return s;
  }
  var klantNu = [], partNu = [], klantVorig = [], partVorig = [], prospects = [], i;
  for (i = 0; i < aantal(34); i++) klantNu.push(nieuweSchool('klant', 300));
  for (i = 0; i < aantal(12); i++) partNu.push(nieuweParticulier());
  klantNu.forEach(function (s) { if (kans(0.55)) klantVorig.push(s); });
  for (i = 0; i < aantal(82); i++) klantVorig.push(nieuweSchool('oud-klant', 420));
  partNu.forEach(function (s) { if (kans(0.4)) partVorig.push(s); });
  for (i = 0; i < aantal(10); i++) { var pv = nieuweParticulier(); pv.status = 'oud-klant'; partVorig.push(pv); }
  for (i = 0; i < aantal(18); i++) prospects.push(nieuweSchool(kans(0.5) ? 'prospect' : 'lead', 30));

  /* ----- contactpersonen ----- */
  var personen = [], perSchool = {};
  scholen.forEach(function (s) {
    if (s.type === 'particulier') return;
    var n = s.status === 'klant' ? tussen(1, 3) : tussen(1, 2);
    for (var q = 0; q < n; q++) {
      var nm = persoonsnaam(), id = 'gp' + (personen.length + 1), dom = s.email.split('@')[1];
      var p = { id: id, voornaam: nm[0], achternaam: nm[1], functie: s.type === 'ISK' && q === 0 ? 'Coördinator NT2' : s.type === 'PO' && q === 0 ? kies(['Directeur', 'Intern begeleider']) : kies(W.functie), schoolId: s.id,
        email: sl(nm[0]).charAt(0) + '.' + sl(nm[1]).replace(/\./g, '') + '@' + dom, telefoon: telefoon(personen.length + 100), eigenaar: s.eigenaar, aangemaakt: s.aangemaakt, laatsteContact: '' };
      personen.push(p); (perSchool[s.id] = perSchool[s.id] || []).push(p);
    }
  });
  function contactVan(s) { return (perSchool[s.id] || [])[0] || null; }

  /* ----- projecten ----- */
  var projecten = [], projectNr = 0, xpsNr = 100;
  function startOffset(jaar, later) {
    // maand van de start: rond de zomervakantie (aug, sep, okt) en een staart daarna
    var m = gewogen(later ? [[8, 18], [9, 30], [10, 18], [11, 8], [12, 4], [1, 8], [2, 5], [3, 5], [4, 4]] : [[8, 23], [9, 37], [10, 23], [11, 10], [12, 4], [1, 3]])[0];
    var jr = m >= 8 ? jaar : jaar + 1, dd = m === 8 ? tussen(18, 31) : tussen(1, 28);
    return werkdagVooruit(op(jr, m, dd));
  }
  function eindOffset(jaar, start, product) {
    if (product[0] === 'Examentraining' && kans(0.3)) return start;  // eendaagse training
    var r = R(), e;
    if (r < 0.3) e = op(jaar, 12, tussen(18, 23));
    else if (r < 0.75) e = kans(0.6) ? op(jaar + 1, 6, tussen(19, 30)) : op(jaar + 1, 7, tussen(1, 10));
    else e = start + Math.round(Math.min(330, Math.max(30, lognorm(180, 300))));
    if (e < start + 14) e = start + Math.round(Math.max(30, lognorm(120, 240)));
    return Math.min(e, op(jaar + 1, 7, 17));
  }
  function maakProject(s, jaar, product, start, eind) {
    var huidigJaar = jaar === j1, part = s.type === 'particulier';
    projectNr++;
    var id = 'gt' + projectNr, surv = product[0] === 'Surveillance';
    var ond = part ? 1 : Math.max(1, Math.min(surv ? 45 : 8, Math.round(lognorm(product[4], product[5]))));
    var dpp = part ? 1 : Math.max(1, Math.min(4.5, lognorm(product[7], product[7] * 2)));  // diensten per persoon per week als hij werkt (hoogstens vijf)
    var tarief = part ? GROOT_PARTICULIER_TARIEF : product[8] + (kans(0.25) ? kies([-2, -1, 1, 2]) : 0);
    var upd = part ? [1, 1.5] : product[3];
    var updGem = upd.reduce(function (a, b) { return a + b; }, 0) / upd.length, pa = part ? 0.85 : product[6];
    // verwachte uren per week (voor het contract): ondersteuners × kans aan het werk × diensten × uren × de schoolweek
    var contractUren = 0, weken = 0;
    for (var w = start - ((dag(start).wd + 6) % 7); w <= eind; w += 7) {
      var f = weekFactor(dag(w).wnr, surv); if (eind === start) f = 1;
      if (f > 0) { contractUren += ond * pa * dpp * updGem * Math.min(f, 1.6) * (eind === start ? 0.2 : 1); weken += f >= 0.5 ? 1 : 0; }
    }
    var contract = part ? Math.max(2, Math.round(contractUren)) * tarief : Math.max(400, Math.round(contractUren * tarief));  // uren × tarief, in hele euro's (particulier: hele lessen)
    var am = part ? M.ruben : gewogen(AMS)[0], status = start > 0 ? 'opstart' : eind < 0 ? 'afgelopen' : 'bezig';
    var vooraf = part ? false : kans(0.3) && contract <= 30000;
    var t = { id: id, schoolId: s.id, school: s.naam, plaats: s.plaats, traject: part ? (s._particulier === 'bijles' ? 'Bijles' : 'Huiswerkbegeleiding') : product[0], schooljaar: jaar + '-' + (jaar + 1), status: status,
      ondersteuners: ond, urenPerWeek: Math.max(1, Math.round(contractUren / Math.max(1, weken))), tarief: tarief, omzet: contract, contractwaarde: contract, am: am, adviseur: part ? '' : s.eigenaar,
      soortFacturatie: vooraf ? 'vooraf' : 'achteraf', vakanties: vooraf ? 'doorbetaald' : 'niet doorbetaald', start: d(start), eind: d(eind), kansId: '', verlenging: '', gefactureerd: 'nee', factuurDatum: '',
      xpsProject: status === 'opstart' ? '' : '12.' + (++xpsNr), talentscout: huidigJaar ? gewogen(SCOUTS)[0] : '', bijzonderheden: '', taskforce: '', samenvatting: '', contactpersoon: '', contactgegevens: '',
      voorstelUrl: 'https://docs.google.com/document/d/demo-voorstel-' + id, documentenUrl: 'https://drive.google.com/drive/folders/demo-' + id, bijgewerkt: dt(-tussen(1, 20)),
      _s: s, _p: product, _start: start, _eind: eind, _ond: ond, _dpp: dpp, _upd: upd, _pa: pa, _surv: surv, _talenten: [], _part: part };
    var c = contactVan(s); if (c) { t.contactpersoon = c.voornaam + ' ' + c.achternaam; t.contactgegevens = t.contactpersoon + '\n' + c.functie + '\n' + c.telefoon; }
    if (status === 'bezig' && !part) t.samenvatting = kies(['Vaste gezichten in de klassen; evaluatie aan het eind van elke periode.', 'Rooster per periode afgestemd met de teamleider.', 'Inzet volgens rooster; meerwerk apart gefactureerd.', 'Kleine groepjes, vaste vervanger bij afwezigheid.']);
    if (vooraf && kans(0.3)) t.bijzonderheden = 'Inkoopnummer op de factuur';
    s._projecten++;
    projecten.push(t); return t;
  }
  // dit schooljaar: elke klant één project, één op de zes twee of drie
  klantNu.forEach(function (s) {
    var n = kans(1 / 6) ? (kans(0.7) ? 2 : 3) : 1, gehad = {};
    for (var q = 0; q < n; q++) {
      var pr = gewogen(P, 1); for (var z = 0; z < 5 && gehad[pr[0]]; z++) pr = gewogen(P, 1); gehad[pr[0]] = 1;
      if (s.type === 'ISK' && q === 0) pr = P[2];
      var st = startOffset(j1, false);
      if (st > -3 && op(j1, 8, 18) < -3) st = werkdagTerug(-tussen(3, Math.min(75, -op(j1, 8, 18))));  // wat al loopt, is gestart; de geplande projecten komen hieronder
      var ei = eindOffset(j1, st, pr); if (ei < 0 && pr[0] !== 'Examentraining') ei = Math.min(op(j1 + 1, 7, 17), Math.max(ei, tussen(10, 120)));  // lopend tot na vandaag, binnen het schooljaar
      maakProject(s, j1, pr, st, ei);
    }
  });
  // gepland: net gewonnen of in voorbereiding, start over één tot tien weken
  // (aan het eind van het schooljaar is er geen ruimte meer voor een nieuwe start: dan geen geplande projecten)
  var ruimte = op(j1 + 1, 6, 15) - 7, nGepland = ruimte >= 21 ? aantal(8) : 0, kandidaatGepland = klantNu.filter(function (s) { return s._projecten < 3; });
  for (i = 0; i < nGepland && kandidaatGepland.length; i++) {
    var sg = kandidaatGepland.splice(Math.floor(R() * kandidaatGepland.length), 1)[0], prg = gewogen(P, 1), stg = werkdagVooruit(tussen(7, Math.min(70, ruimte)));
    maakProject(sg, j1, prg, stg, Math.min(op(j1 + 1, 7, 17), Math.max(stg + 30, eindOffset(j1, stg, prg))));
  }
  partNu.forEach(function (s) { var st = werkdagVooruit(op(j1, kies([9, 9, 10]), tussen(1, 25))); if (st > -7) st = -tussen(7, 40); maakProject(s, j1, P[7], st, op(j1 + 1, 6, tussen(20, 30))); });
  // vorig schooljaar: alles afgerond; een paar lopen door in dit schooljaar
  var doorlopers = 0;
  klantVorig.forEach(function (s) {
    var n = kans(1 / 6) ? (kans(0.7) ? 2 : 3) : 1;
    for (var q = 0; q < n; q++) {
      var pr = gewogen(P, 2), st = startOffset(j1 - 1, true), ei = eindOffset(j1 - 1, st, pr);
      if (doorlopers < 3 && s.status === 'klant' && pr[0] !== 'Examentraining' && kans(0.25)) { ei = op(j1, 12, tussen(18, 22)); doorlopers++; }
      maakProject(s, j1 - 1, pr, st, ei);
    }
  });
  partVorig.forEach(function (s) { maakProject(s, j1 - 1, P[7], werkdagVooruit(op(j1 - 1, kies([9, 10, 11, 1]), tussen(1, 25))), op(j1, 6, tussen(15, 30))); });
  var huidig = projecten.filter(function (t) { return t.schooljaar === sj; }), oud = projecten.filter(function (t) { return t.schooljaar !== sj; });
  // datakwaliteit: één of twee projecten zonder accountmanager (signaal)
  huidig.filter(function (t) { return !t._part; }).slice(0, 2).forEach(function (t, q) { if (q === 0 || kans(0.5)) t.am = ''; });
  // verlenging: vorig jaar per school, en wat er voor volgend schooljaar besproken wordt
  oud.forEach(function (t) { t.verlenging = t._s.status === 'klant' ? 'verlengd' : kans(0.6) ? 'stopt' : ''; if (!t._part) t.gefactureerd = 'ja'; });
  huidig.forEach(function (t) { if (!t._part && t.status === 'bezig') t.verlenging = gewogen([['', 40], ['nog bespreken', 30], ['voorstel verstuurd', 15], ['verlengd', 10], ['stopt', 5]])[0]; });

  /* ----- talentbestand ----- */
  var talenten = [], tNr = 0;
  function nieuwTalent(status) {
    tNr++;
    var nm = persoonsnaam(), pl = gewogen(PLAATS)[0], id = 'gtl' + tNr;
    var t = { id: id, voornaam: nm[0], achternaam: nm[1], email: sl(nm[0] + ' ' + nm[1]) + (tNr % 7 === 0 ? tNr : '') + '@mail.example', telefoon: telefoon(tNr + 2000), postcode: (1000 + Math.floor(R() * 8900)) + ' ' + kies('ABCDEGHJKLMNPRSTVWXZ') + kies('ABCDEGHJKLMNPRSTVWXZ'),
      woonplaats: pl[0], lat: Math.round((pl[1] + (R() - 0.5) * 0.04) * 10000) / 10000, lon: Math.round((pl[2] + (R() - 0.5) * 0.06) * 10000) / 10000, functies: [], sectoren: [], vakken: [], opleiding: kies(W.opleiding), bevoegdheid: '',
      vervoer: kies(['fiets', 'fiets', 'ov', 'ov', 'auto']), reisafstandKm: kies([10, 15, 20, 25, 30, 40]), maxUrenWeek: kies([8, 12, 16, 20, 24, 32, 36]), beschikbaarVanaf: '', beschikbaarTot: '', beschikbaarheid: null, uitzonderingen: [],
      beschikbaarheidBevestigd: '', laatstePeiling: '', contractvorm: gewogen([['min-max', 75], ['ovo', 15], ['zzp', 7], ['stage', 3]])[0], status: status, statusSinds: '', bron: gewogen([['xps-bestand', 50], ['website', 25], ['linkedin', 10], ['eigen netwerk', 10], ['sollicitatie', 5]])[0],
      xpsId: 'X' + (60000 + tNr), afasNummer: '', tags: '', toestemmingDatum: '', toestemmingGrondslag: 'toestemming', bewarenTot: '', portaalToken: '', portaalTokenTot: '', notitie: '', laatsteContact: '', door: kies([M.iris, M.sem]), aangemaakt: '',
      _gewicht: Math.max(0.15, lognorm(1, 6)), _inzet: [], _laatsteInzet: null };
    t.bevoegdheid = /afgestudeerd|master|gepensioneerd/.test(t.opleiding) ? '2e graads' : 'geen';
    talenten.push(t); return t;
  }
  var actiefPool = [], slapendPool = [];
  for (i = 0; i < aantal(290); i++) actiefPool.push(nieuwTalent('actief'));
  for (i = 0; i < aantal(500); i++) slapendPool.push(nieuwTalent('slapend'));
  var aangemeld = [], gescreend = [], uitgeschreven = [];
  for (i = 0; i < aantal(24); i++) aangemeld.push(nieuwTalent('aangemeld'));
  for (i = 0; i < aantal(14); i++) gescreend.push(nieuwTalent('gescreend'));
  for (i = 0; i < aantal(16); i++) uitgeschreven.push(nieuwTalent('uitgeschreven'));
  // een plek invullen: gewogen trekken zonder terugleggen (sommige flexkrachten werken veel, de meeste weinig)
  function trek(pool, n) {
    var uit = [], gekozen = {}, som = 0, q;
    for (q = 0; q < pool.length; q++) som += pool[q]._gewicht;
    n = Math.min(n, pool.length);
    while (uit.length < n) {
      var r = R() * som, x = null;
      for (q = 0; q < pool.length; q++) { if (gekozen[pool[q].id]) continue; r -= pool[q]._gewicht; if (r < 0) { x = pool[q]; break; } }
      if (!x) for (q = 0; q < pool.length && !x; q++) if (!gekozen[pool[q].id]) x = pool[q];
      gekozen[x.id] = 1; som -= x._gewicht; uit.push(x);
    }
    return uit;
  }
  projecten.forEach(function (t) {
    if (t.status === 'opstart') return;  // nog geen plaatsingen; de vacature is open
    var recent = t._eind >= -182, pool = t.schooljaar === sj || recent ? actiefPool : actiefPool.concat(slapendPool, slapendPool);
    t._talenten = trek(pool, t._ond);
    t._talenten.forEach(function (tl) { tl._inzet.push(t); if (tl._laatsteInzet === null || t._eind > tl._laatsteInzet) tl._laatsteInzet = t._eind; });
  });
  // wie slapend is heeft zijn laatste inzet langer dan een half jaar achter zich (een slapende pool die toch recent werkte, zou meteen weer actief zijn)
  talenten.forEach(function (tl) {
    var fun = {}, sec = {};
    tl._inzet.forEach(function (t) { fun[t._p[9]] = 1; sec[t._s.type === 'PO' ? 'po' : t._s.type === 'ISK' ? 'isk' : t._s.type === 'PRO' ? 'so' : 'vo'] = 1; });
    if (!Object.keys(fun).length || kans(0.25)) fun[gewogen(P, 1)[9]] = 1;
    if (!Object.keys(sec).length) sec[gewogen([['vo', 70], ['po', 15], ['mbo', 8], ['isk', 7]])[0]] = 1;
    tl.functies = Object.keys(fun).slice(0, 3); tl.sectoren = Object.keys(sec);
    if (kans(0.6)) { tl.vakken = [kies(W.vakken)]; if (kans(0.3)) { var v2 = kies(W.vakken); if (v2 !== tl.vakken[0]) tl.vakken.push(v2); } }
  });

  /* beschikbaarheid per dagdeel (2 ja, 1 liever niet, 0 nee): ochtendwerk of middagwerk, met een paar vaste vrije dagen */
  function raster(tl) {
    var middag_ = tl.functies.some(function (f) { return /huiswerk|reken|examen/.test(f); }) && !tl.functies.some(function (f) { return /onderwijsond|nt2|surveil|studentd/.test(f); });
    var o = {}, dagen = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'], vrij = kans(0.5) ? kies(dagen.slice(0, 5)) : '';
    dagen.forEach(function (dg, q) {
      if (q >= 5) { o[dg] = [0, kans(0.08) ? 2 : 0, 0]; return; }
      if (dg === vrij || kans(0.12)) { o[dg] = [0, 0, 0]; return; }
      o[dg] = middag_ ? [kans(0.15) ? 1 : 0, 2, kans(0.2) ? 2 : 0] : [2, kans(0.75) ? 2 : 1, 0];
    });
    return o;
  }

  /* status, contact, VOG, peiling en bewaartermijn: realistisch, zodat de dagelijkse run maar een handvol mails en overgangen geeft */
  var docs = [], vogTel = { groen: 0, oranje: 0, verlopen: 0, ontbreekt: 0 }, peilingKlaar = 0, slapendKlaar = 0, bewaarKlaar = 0;
  function vogDoc(tl, afgifte, door) {
    docs.push({ id: 'gvog-' + tl.id, talentId: tl.id, soort: 'vog', afgifte: d(afgifte), geldigTot: '', driveId: '', gecontroleerdDoor: door, gecontroleerdOp: dt(afgifte + 3, '14:00'), status: afgifte < -365 ? 'verlopen' : 'geldig', notitie: '', door: door, aangemaakt: dt(afgifte + 3, '14:00') });
  }
  var zesMaanden = function (n) { var z = plusDagen(n); return Math.round((middag(new Date(z.getFullYear(), z.getMonth() - 6, z.getDate())) - vandaagM) / 86400000); };
  talenten.forEach(function (tl, q) {
    tl.beschikbaarheid = raster(tl);
    var eerste = tl._inzet.length ? Math.min.apply(null, tl._inzet.map(function (t) { return t._start; })) : null;
    if (tl.status === 'actief') {
      var huidigeInzet = tl._inzet.filter(function (t) { return t.schooljaar === sj || t._eind >= 0; });
      tl.aangemaakt = dt(eerste !== null ? eerste - tussen(20, 200) : -tussen(30, 700), '11:00');
      tl.statusSinds = dt(eerste !== null && eerste > -400 ? eerste - tussen(5, 20) : -tussen(30, 380), '11:00');
      tl.laatsteContact = d(-tussen(0, 150));
      // peiling: de meesten hebben binnen zeven weken bevestigd; wie langer wacht, kreeg net een peiling. Een paar zijn vandaag aan de beurt.
      if (kans(0.72)) tl.beschikbaarheidBevestigd = dt(-tussen(0, 47), '08:' + p2(tussen(0, 59)));
      else { tl.beschikbaarheidBevestigd = dt(-tussen(52, 170), '08:' + p2(tussen(0, 59))); tl.laatstePeiling = dt(-tussen(0, 12), '06:35'); if (peilingKlaar < 6 && kans(0.08)) { tl.laatstePeiling = dt(-tussen(15, 30), '06:35'); peilingKlaar++; } }
      // VOG: jonger dan zes maanden (groen), of ouder maar op tijd voor een inzet die loopt (oranje); een paar verlopen of nog niet binnen
      var r = R(), doorV = kies([M.iris, M.sem]);
      if (r < 0.03) vogTel.ontbreekt++;
      else if (huidigeInzet.length && r < 0.33) {
        var s0 = Math.max(op(j1, 8, 1), Math.min.apply(null, huidigeInzet.map(function (t) { return t._start; }))), lo = zesMaanden(s0) + 4, hi = zesMaanden(0) - 4;
        if (hi > lo) { vogDoc(tl, tussen(lo, hi), doorV); vogTel.oranje++; } else { vogDoc(tl, -tussen(10, 150), doorV); vogTel.groen++; }
      }
      else if (r < 0.1 && !huidigeInzet.length) { vogDoc(tl, -tussen(400, 700), doorV); vogTel.verlopen++; }
      else { vogDoc(tl, -tussen(5, 170), doorV); vogTel.groen++; }
      // zes maanden niets: de slapend-run zet een enkeling vandaag om
      if (!tl._inzet.length && slapendKlaar < 3 && kans(0.04)) { tl.laatsteContact = d(-tussen(190, 260)); tl.beschikbaarheidBevestigd = dt(-tussen(200, 260), '08:15'); tl.laatstePeiling = dt(-tussen(1, 12), '06:35'); tl.statusSinds = dt(-tussen(300, 500), '11:00'); tl.aangemaakt = dt(-tussen(500, 700), '11:00'); slapendKlaar++; }
      var basis = Math.max(-730, Math.min(0, tl._laatsteInzet !== null ? tl._laatsteInzet : -tussen(10, 200)));
      tl.toestemmingDatum = tl.aangemaakt.slice(0, 10); tl.bewarenTot = d(basis + 730 + tussen(0, 60));
      if (q % 5 === 0) tl.afasNummer = 'A' + (80000 + q);
    } else if (tl.status === 'slapend') {
      var laatst = tl._laatsteInzet !== null ? tl._laatsteInzet : -tussen(220, 900);
      tl.aangemaakt = dt(Math.min(laatst, eerste === null ? laatst : eerste) - tussen(40, 400), '11:00');
      tl.statusSinds = dt(Math.min(-1, laatst + 182 + tussen(0, 30)), '06:40'); tl.laatsteContact = d(Math.min(laatst + tussen(0, 30), -200));
      tl.beschikbaarheidBevestigd = dt(Math.min(laatst + tussen(0, 20), -200), '08:20'); tl.laatstePeiling = dt(Math.min(laatst + 60, -150), '06:35');
      if (kans(0.6)) { vogDoc(tl, Math.min(laatst, -400) - tussen(0, 300), kies([M.iris, M.sem])); vogTel.verlopen++; } else vogTel.ontbreekt++;
      tl.toestemmingDatum = tl.aangemaakt.slice(0, 10);
      tl.bewarenTot = d(Math.max(tussen(20, 330), laatst + 730));
      if (bewaarKlaar < 1 && kans(0.01)) { tl.bewarenTot = d(-tussen(1, 5)); bewaarKlaar++; }
    } else if (tl.status === 'aangemeld' || tl.status === 'gescreend') {
      var n0 = -tussen(1, tl.status === 'aangemeld' ? 30 : 60);
      tl.aangemaakt = dt(n0, '19:' + p2(tussen(0, 59))); tl.statusSinds = tl.status === 'aangemeld' ? tl.aangemaakt : dt(n0 + tussen(1, 10), '11:00'); tl.laatsteContact = d(n0);
      tl.bron = tl.status === 'aangemeld' ? 'website' : tl.bron; tl.door = tl.status === 'aangemeld' ? 'Formulier' : tl.door; tl.contractvorm = ''; tl.toestemmingDatum = d(n0); tl.bewarenTot = d(n0 + 730);
      if (tl.status === 'gescreend' && kans(0.5)) { vogDoc(tl, n0 - tussen(10, 60), kies([M.iris, M.sem])); vogTel.groen++; } else vogTel.ontbreekt++;
      if (q % 9 === 0) { tl.lat = ''; tl.lon = ''; }  // nog niet gegeocodeerd: de nachtelijke run zoekt de ligging op
      if (tl.status === 'gescreend') tl.notitie = kies(['Kennismaking gehad; start na de volgende vakantie mogelijk.', 'Telefonisch gescreend; referentie nagevraagd.', 'Wil liefst in de onderbouw.']);
    } else {  // uitgeschreven en geanonimiseerd (zoals anonimiseerTalent het achterlaat)
      tl.voornaam = 'Verwijderd'; tl.achternaam = 'profiel'; tl.email = ''; tl.telefoon = ''; tl.postcode = ''; tl.woonplaats = ''; tl.lat = ''; tl.lon = ''; tl.opleiding = ''; tl.bevoegdheid = ''; tl.xpsId = '';
      tl.beschikbaarheid = ''; tl.uitzonderingen = ''; tl.aangemaakt = dt(-tussen(900, 1400), '11:00'); tl.statusSinds = dt(-tussen(10, 400), '03:10'); tl.bewarenTot = ''; tl.toestemmingDatum = d(-tussen(900, 1400)); tl.laatsteContact = '';
    }
  });
  // diploma's en certificaten
  talenten.forEach(function (tl) {
    if (tl.status === 'uitgeschreven' || !kans(0.15)) return;
    var soort = /nt2/.test(tl.opleiding) || tl.functies.indexOf('nt2-ondersteuner') >= 0 ? ['certificaat', 'nt2'] : ['diploma', tl.opleiding.split(',')[0]];
    docs.push({ id: 'gdoc-' + tl.id, talentId: tl.id, soort: soort[0], afgifte: d(-tussen(300, 1500)), geldigTot: '', driveId: '', gecontroleerdDoor: M.iris, gecontroleerdOp: dt(-tussen(30, 290), '10:00'), status: 'geldig', notitie: soort[1], door: M.iris, aangemaakt: dt(-tussen(30, 290), '10:00') });
  });

  /* ----- weekuren (TalentUren) van de laatste 26 weken en de diensten van de laatste twee weken ----- */
  var uren = [], diensten = [], urenTel = { diensten: 0, uren: 0, noShows: 0, lateAfmeldingen: 0 };
  var DAGKANS = [[1, 20], [2, 22], [3, 20], [4, 20], [5, 15], [6, 2], [0, 1]];
  function blok(product) {
    if (product[10] === 'middag') return kies([['13:00', '17:00'], ['14:00', '17:00'], ['14:30', '17:30'], ['15:00', '18:00']]);
    return kies([['08:00', '16:00'], ['08:30', '16:30'], ['09:00', '17:00'], ['08:15', '12:30'], ['08:30', '14:30'], ['09:00', '15:00']]);
  }
  projecten.forEach(function (t) {
    if (!t._talenten.length) return;
    var na = t.schooljaar !== sj && t._eind > -182 && t._eind < -14 && kans(0.05) ? 14 : 0;  // datakwaliteit: een enkele dienst na het projecteinde
    for (var wk = 26; wk >= 1; wk--) {
      var ma = ma0 - 7 * wk, info = dag(ma), f = weekFactor(info.wnr, t._surv);
      if (ma + 6 < t._start || ma > t._eind + na || f === 0) continue;
      if (t._eind === t._start) f = 1;
      t._talenten.forEach(function (tl) {
        if (!kans(Math.min(0.95, t._pa * (t._surv ? f : Math.min(1, f))))) return;
        // elke dienst krijgt een status zoals in XPS; in TalentUren telt Ingeroosterd (voorbij) als gewerkt, Afwezig als no-show en
        // Geannuleerd (intern) als late afmelding; ziek, door de klant geannuleerd en reserve tellen nergens mee
        var n = Math.max(1, Math.min(5, Math.round(t._dpp * (t._surv ? 1 : Math.max(0.5, f)) * (0.55 + 0.9 * R())))), ns = 0, la = 0, u = 0, dn = 0, regels = [];
        for (var q = 0; q < n; q++) {
          var r = R(), st = r < 0.015 ? 'Afwezig' : r < 0.025 ? 'Geannuleerd (intern)' : r < 0.045 ? 'Afwezig (ziek)' : r < 0.052 ? 'Geannuleerd (klant)' : r < 0.056 ? 'Reserve' : 'Ingeroosterd', duur = kies(t._upd);
          if (st === 'Afwezig') ns++; else if (st === 'Geannuleerd (intern)') la++; else if (st === 'Ingeroosterd') { dn++; u += duur; }
          if (wk <= 12) regels.push([st, duur]);
        }
        if (!dn && !ns && !la) return;
        var weekS = info.week, row = { id: slug(tl.id + '|' + weekS + '|' + t.xpsProject), talentId: tl.id, xpsId: tl.xpsId, xpsProject: t.xpsProject, trajectId: t.id, week: weekS, uren: Math.round(u * 100) / 100, diensten: dn, noShows: ns, lateAfmeldingen: la, geimporteerd: dt(ma + 7, '06:05') };
        uren.push(row); urenTel.diensten += dn; urenTel.uren += u; urenTel.noShows += ns; urenTel.lateAfmeldingen += la;
        regels.forEach(function (x) {  // de diensten van deze week op losse dagen (ma-do druk, vrijdag rustiger, zelden in het weekend)
          var wd = gewogen(DAGKANS)[0], n1 = ma + (wd === 0 ? 6 : wd - 1), b = blok(t._p);
          diensten.push({ wk: wk, dag: n1, van: b[0], tot: b[1], duur: x[1], tl: tl, t: t, status: x[0] });
        });
      });
    }
  });
  // de export gaat over de laatste twee weken; zijn dat vakantieweken (bijna niets), dan de twee laatste weken waarin gewerkt is
  var perWk = {}; diensten.forEach(function (x) { perWk[x.wk] = (perWk[x.wk] || 0) + 1; });
  var exportWk = (perWk[1] || 0) + (perWk[2] || 0) >= 30 ? [1, 2] : [];
  for (var wk0 = 1; wk0 <= 12 && exportWk.length < 2; wk0++) if ((perWk[wk0] || 0) >= 10) exportWk.push(wk0);
  if (!exportWk.length) exportWk = [1, 2];
  diensten = diensten.filter(function (x) { return exportWk.indexOf(x.wk) >= 0; });
  diensten.sort(function (a, b) { return a.dag - b.dag || String(a.t.id).localeCompare(String(b.t.id)) || String(a.tl.id).localeCompare(String(b.tl.id)); });

  /* ----- kansen ----- */
  var kansen = [], kNr = 0;
  function nieuweKans(s, naam, fase, waarde, eig, am, aangemaakt, gesloten, extra) {
    kNr++;
    var c = contactVan(s), k0 = { id: 'gk' + kNr, schoolId: s.id, school: s.naam, persoonId: c ? c.id : '', naam: naam, traject: naam, fase: fase, pipeline: 'Scholen', waarde: waarde, eigenaar: eig, am: am || '',
      aangemaakt: dt(aangemaakt, '09:30'), gesloten: gesloten === null ? '' : d(gesloten), verwachteSluiting: '', volgendeActie: '', deadline: '', laatsteContact: d(gesloten === null ? aangemaakt : gesloten), verliesReden: '', notities: '' };
    Object.keys(extra || {}).forEach(function (x) { k0[x] = extra[x]; });
    kansen.push(k0); return k0;
  }
  projecten.forEach(function (t) {
    if (t._part || kans(0.12)) return;
    var gesloten = Math.min(-1, t._start - tussen(10, 60)), aangem = gesloten - tussen(20, 100);
    var k0 = nieuweKans(t._s, t.traject, 'gewonnen', t.contractwaarde, t.adviseur || t._s.eigenaar, t.am, aangem, gesloten, { notities: kans(0.4) ? 'Vaste ondersteuners gewenst; start in overleg.' : '' });
    t.kansId = k0.id; t._kans = k0;
  });
  var FASES_OPEN = [['lead', 25], ['gesprek', 30], ['voorstel', 30], ['onderhandeling', 15]];
  var ACTIE = { lead: ['Kennismaking plannen', 'Behoefte peilen'], gesprek: ['Tweede gesprek plannen', 'Hulpvraag uitwerken', 'Offerte opstellen'], voorstel: ['Voorstel nabellen', 'Variant uitwerken'], onderhandeling: ['Tarief en startdatum afstemmen', 'Contract laten tekenen'] };
  var kansOpen = [];
  for (i = 0; i < aantal(32); i++) {
    var s1 = i % 3 === 2 ? kies(klantNu) : kies(prospects), fase = gewogen(FASES_OPEN)[0], pr1 = gewogen(P, 1);
    var nm1 = pr1[0] === 'Overig' ? 'Ondersteuning op maat' : pr1[0] + (s1.status === 'klant' ? ' volgend schooljaar' : '');
    var ag = -tussen(4, 95), lc = Math.max(ag, -tussen(1, 35));
    kansOpen.push(nieuweKans(s1, nm1, fase, Math.round(lognorm(16000, 45000) / 100) * 100, s1.eigenaar, fase === 'onderhandeling' ? gewogen(AMS)[0] : '', ag, null,
      { verwachteSluiting: d(tussen(10, 110)), volgendeActie: kies(ACTIE[fase]), deadline: d(tussen(-6, 14)), laatsteContact: d(lc) }));
  }
  for (i = 0; i < aantal(42); i++) {
    var s2 = kies(prospects.concat(klantVorig.filter(function (x) { return x.status === 'oud-klant'; }))), g2 = -tussen(8, 420);
    nieuweKans(s2, gewogen(P, 2)[0].replace('Overig', 'Ondersteuning op maat'), 'verloren', Math.round(lognorm(14000, 40000) / 100) * 100, s2.eigenaar, '', g2 - tussen(20, 90), g2, { verliesReden: kies(W.verlies) });
  }

  /* ----- vacatures en kandidaten ----- */
  var vacatures = [], kandidaten = [], vNr = 0, cNr = 0;
  function historie(stappen) { var h = {}; stappen.forEach(function (x) { h[x[0]] = dt(Math.min(0, x[1]), '11:' + p2(tussen(0, 59))); }); return h; }
  function kandidaat(v, t, tl, status, stappen, extra) {
    cNr++;
    var h = historie(stappen), laatst = ''; Object.keys(h).forEach(function (x) { laatst = h[x]; });
    var o = { id: 'gc' + cNr, vacatureId: v.id, trajectId: t.id, naam: tl.voornaam + ' ' + tl.achternaam, email: tl.email, telefoon: tl.telefoon, bron: 'talentbestand', xpsId: tl.xpsId, afasNummer: tl.afasNummer || '', status: status,
      statusSinds: laatst, statusHistorie: j(h), door: t.talentscout || kies([M.sem, M.iris]), aangemaakt: h.voorgesteld || laatst, gesprek: '', notitie: '', talentId: tl.id, functie: v.titel, start: d(t._start), eind: d(t._eind),
      urenPerWeek: Math.max(2, Math.round(t.urenPerWeek / Math.max(1, t._ond))), dagen: v.dagen };
    Object.keys(extra || {}).forEach(function (x) { o[x] = extra[x]; });
    kandidaten.push(o); return o;
  }
  projecten.forEach(function (t) {
    vNr++;
    var titel = t._p[11], dagen = t._p[10] === 'middag' ? kies(['Di en do 14:00-17:00', 'Ma, wo en do 15:00-17:30', 'Ma t/m do 14:30-17:00']) : t._surv ? 'Toetsweken, ma t/m vr 8:15-12:30' : kies(['Ma t/m vr 8:30-15:00', 'Ma t/m do 9:00-13:00', 'Di, wo en do 8:30-16:30', 'Ma en wo 8:30-14:30']);
    var aangem = t._start - tussen(14, 45), v = { id: 'gv' + vNr, trajectId: t.id, titel: titel, aantal: t._ond, dagen: dagen, urenPerWeek: Math.max(2, Math.round(t.urenPerWeek / Math.max(1, t._ond))), start: t.start, eind: t.eind,
      profiel: kies(['Ervaring in het voortgezet onderwijs, rustig en gestructureerd', 'Pabo- of lerarenopleiding, ervaring met kleine groepjes', 'Bekend met examenreglement; vaste gezichten waar het kan', 'Ervaring met anderstalige leerlingen', 'Student, sterk in rekenen en taal']),
      status: 'open', aangemaakt: dt(Math.min(-1, aangem), '10:00'), door: t.am || M.bas, ingevuld: '' };
    if (t.status === 'opstart') {
      if (t._kans && t._kans.gesloten >= d(-7) && kans(0.5)) { v.status = 'concept'; v.aangemaakt = dt(-tussen(0, 3), '16:10'); }
      vacatures.push(v);
      if (v.status === 'concept') return;
      var pool = trek(actiefPool, Math.min(6, t._ond + tussen(0, 2))), fases = ['voorgesteld', 'gesprek', 'geselecteerd', 'contract', 'vog', 'klaar voor start'];
      pool.forEach(function (tl, q) {
        var stap = Math.min(fases.length - 1, Math.floor(R() * fases.length)), start0 = -tussen(8, 25), st = [];
        for (var z = 0; z <= stap; z++) st.push([fases[z], start0 + z * tussen(1, 3)]);
        if (q > t._ond && kans(0.5)) st.push(['afgewezen', start0 + stap * 3 + 1]);
        kandidaat(v, t, tl, st[st.length - 1][0], st);
      });
      return;
    }
    // gevuld: de geplaatsten, plus een afgewezen of reserve
    v.status = t.schooljaar !== sj && kans(0.1) ? 'gesloten' : 'ingevuld'; v.ingevuld = dt(Math.min(-1, t._start - tussen(1, 6)), '15:00');
    vacatures.push(v);
    var vs = Math.min(-2, t._start - tussen(18, 40));
    t._talenten.forEach(function (tl) {
      var stappen = [['voorgesteld', vs], ['gesprek', vs + 3], ['geselecteerd', vs + 5], ['contract', vs + 9], ['vog', vs + 11], ['klaar voor start', t._start - 1], ['geplaatst', t._start + tussen(0, 5)]];
      var status = 'geplaatst';
      if (t._eind < 0) { status = kans(0.05) ? 'gestopt' : 'afgerond'; stappen.push([status, status === 'gestopt' ? Math.round((t._start + t._eind) / 2) : t._eind]); }
      else if (kans(0.03)) { status = 'gestopt'; stappen.push(['gestopt', -tussen(3, 20)]); }
      kandidaat(v, t, tl, status, stappen, status === 'gestopt' ? { eindReden: kies(['Andere baan gevonden.', 'Rooster paste niet meer bij de studie.', 'In overleg gestopt.']), eind: d(stappen[stappen.length - 1][1]) } : null);
    });
    if (!t._part && kans(0.4)) { var extra1 = trek(actiefPool, 1)[0], eindSt = kans(0.5) ? 'afgewezen' : 'reserve'; if (t._talenten.indexOf(extra1) < 0) kandidaat(v, t, extra1, eindSt, [['voorgesteld', vs + 1], ['gesprek', vs + 4], [eindSt, vs + 6]]); }
    // vervanging bij een lopend project: een open vacature met kandidaten in proces
    if (t.status === 'bezig' && !t._part && kans(0.12)) {
      vNr++;
      var vv = { id: 'gv' + vNr, trajectId: t.id, titel: titel + ' (vervanging)', aantal: 1, dagen: dagen, urenPerWeek: v.urenPerWeek, start: d(tussen(5, 25)), eind: t.eind, profiel: 'Vervanger voor een ondersteuner die stopt', status: 'open', aangemaakt: dt(-tussen(2, 12), '09:00'), door: t.am || M.bas, ingevuld: '' };
      vacatures.push(vv);
      trek(actiefPool, tussen(1, 3)).forEach(function (tl) { if (t._talenten.indexOf(tl) >= 0) return; var s0 = -tussen(1, 9), f0 = kies([['voorgesteld'], ['voorgesteld', 'gesprek'], ['voorgesteld', 'gesprek', 'geselecteerd']]); kandidaat(vv, t, tl, f0[f0.length - 1], f0.map(function (x, z) { return [x, s0 + z]; }), { start: vv.start }); });
    }
  });

  /* ----- beoordelingen en relaties met scholen ----- */
  var beoordelingen = [], relaties = [];
  kandidaten.forEach(function (k0) {
    if (['geplaatst', 'afgerond'].indexOf(k0.status) < 0) return;
    var t = projecten.filter(function (x) { return x.id === k0.trajectId; })[0];
    if (!t || t._part || !t.am || t._start > -42 || !kans(k0.status === 'geplaatst' ? 0.25 : 0.15)) return;
    var oordeel = gewogen([['favoriet', 25], ['goed', 66], ['niet geschikt', 9]])[0], dag0 = Math.min(-1, Math.max(t._start + 42, Math.min(t._eind, -tussen(1, 200))));
    beoordelingen.push({ id: 'gb' + (beoordelingen.length + 1), talentId: k0.talentId, kandidaatId: k0.id, trajectId: t.id, schoolId: t.schoolId, door: t.am, rol: 'am', datum: dt(dag0, '16:00'), oordeel: oordeel,
      criteria: oordeel === 'favoriet' ? { punctualiteit: 3, samenwerking: 3, didactiek: kies([2, 3]) } : oordeel === 'goed' ? { punctualiteit: kies([2, 3]), samenwerking: 2 } : { punctualiteit: 1, communicatie: kies([1, 2]) },
      tekst: oordeel === 'favoriet' ? kies(['Vast gezicht; de school vraagt naar haar of hem voor volgend jaar.', 'Neemt zelf initiatief en is geliefd bij leerlingen.']) : oordeel === 'goed' ? kies(['Betrouwbaar en rustig.', 'Goede start; sectie is tevreden.', 'Prima inzet, soms wat stil in overleg.']) : 'Afspraken over de voorbereiding niet nagekomen.',
      zichtbaarheid: 'intern', wederhoor: '', aangemaakt: dt(dag0, '16:00') });
    if (oordeel !== 'goed' && kans(0.6)) relaties.push({ id: 'gts' + (relaties.length + 1), talentId: k0.talentId, schoolId: t.schoolId, status: oordeel === 'favoriet' ? 'favoriet' : 'niet meer', richting: 'school', reden: oordeel === 'favoriet' ? 'wil graag dezelfde ondersteuner terug' : 'beoordeeld als niet geschikt', door: t.am, datum: dt(dag0, '16:05') });
  });

  /* ----- termijnen (Facturen): achteraf per maand naar de geleverde uren, vooraf in één keer; een paar creditnota's ----- */
  var termijnen = [], fNr = 0;
  function laatsteWerkdag(jr, m) { return werkdagTerug(op(jr, m + 1, 0)); }
  function vrijdagRond9(jr, m) { var n = op(jr, m, 9), x = 5 - dag(n).wd; if (x > 3) x -= 7; return n + x; }  // particulieren: één batch op de vrijdag rond de 9e
  projecten.forEach(function (t) {
    var tt = [];
    if (t.soortFacturatie === 'vooraf') {
      if (t.contractwaarde > 12000 && kans(0.3)) { var helft = Math.round(t.contractwaarde / 2); tt.push([t._start, helft, 'Eerste helft ' + t.traject.toLowerCase()]); tt.push([werkdagVooruit(op(j1 + (t.schooljaar === sj ? 1 : 0), 1, 8)), t.contractwaarde - helft, 'Tweede helft ' + t.traject.toLowerCase()]); }
      else tt.push([t._start, t.contractwaarde, 'Factuur vooraf ' + t.traject.toLowerCase()]);
    } else {
      // maanden van start t/m eind, zonder juli en augustus; per maand het aandeel van de verwachte uren
      var maanden = [], z = dag(t._start), jr = z.jr, m = z.m, ez = dag(t._eind), gewichten = [];
      while (jr < ez.jr || (jr === ez.jr && m <= ez.m)) { if (m !== 7 && m !== 8) maanden.push([jr, m]); m++; if (m > 12) { m = 1; jr++; } if (maanden.length > 14) break; }
      if (!maanden.length) maanden.push([z.jr, z.m]);
      maanden.forEach(function (x) { var w0 = 0; for (var n = Math.max(t._start, op(x[0], x[1], 1)); n <= Math.min(t._eind, op(x[0], x[1] + 1, 0)); n += 7) w0 += Math.max(0.05, weekFactor(dag(n).wnr, t._surv)); gewichten.push(Math.max(0.05, w0)); });
      var som = gewichten.reduce(function (a, b) { return a + b; }, 0), rest = t.contractwaarde;
      maanden.forEach(function (x, q) {
        var b = q === maanden.length - 1 ? euro(rest) : t._part ? Math.round(t.contractwaarde * gewichten[q] / som / t.tarief) * t.tarief : euro(t.contractwaarde * gewichten[q] / som);
        rest = euro(rest - b);
        tt.push([t._part ? vrijdagRond9(x[1] === 12 ? x[0] + 1 : x[0], x[1] === 12 ? 1 : x[1] + 1) : laatsteWerkdag(x[0], x[1]), b, MAANDEN[x[1] - 1].charAt(0).toUpperCase() + MAANDEN[x[1] - 1].slice(1) + ' ' + x[0]]);
      });
    }
    tt.forEach(function (x) { fNr++; termijnen.push({ id: 'gf' + fNr, trajectId: t.id, omschrijving: x[2], bedrag: x[1], datum: d(x[0]), status: 'nog te doen', factuurnummer: '', verzonden: '', betaald: '', bijzonderheden: '', door: t.am || M.bas, _n: x[0], _t: t }); });
    if (t.status === 'bezig' && !t._part && kans(0.05)) { fNr++; termijnen.push({ id: 'gf' + fNr, trajectId: t.id, omschrijving: 'Meerwerk ' + kies(['extra ondersteuner', 'toetsweek', 'extra uren']), bedrag: Math.round(lognorm(700, 1800)), datum: d(-tussen(3, 30)), status: 'nog te doen', factuurnummer: '', verzonden: '', betaald: '', bijzonderheden: '', door: t.am || M.bas, _n: -tussen(3, 30), _t: t }); }
  });
  // verzenden en betalen: wat voorbij is, is verstuurd (een paar nog niet: te laat of wacht op een inkoopnummer); betaald na de betaaltermijn van de school
  var laatTel = 0, aangemTel = 0;
  termijnen.forEach(function (f) {
    if (f._n > 0) return;
    if (f._n > -35 && laatTel < 4 && kans(0.1)) { laatTel++; return; }  // nog niet gemaakt: facturatie op tijd laat het zien
    if (f._n > -35 && aangemTel < 3 && kans(0.08)) { f.status = 'aangemaakt'; f.bijzonderheden = 'Wacht op inkoopnummer van de school'; aangemTel++; return; }
    var v0 = werkdagVooruit(f._n + (kans(0.2) ? tussen(1, 3) : 0)); if (v0 > 0) v0 = f._n;
    f.verzonden = d(v0); f.status = 'verzonden'; f._v = v0;
    var bt = Math.max(1, Math.round(f._t._s.betaaltermijn * (0.6 + 0.8 * R()))), b0 = v0 + bt;
    if (b0 <= 0) { f.betaald = d(b0); f.status = 'betaald'; }
  });
  var creditTel = 0;
  termijnen.slice().forEach(function (f) {
    if (!f._v || f.bedrag <= 0 || f._v > -5 || !kans(0.04)) return;
    var c0 = Math.min(0, f._v + tussen(2, 20)), t = f._t; creditTel++;
    f.status = 'betaald'; f.betaald = d(c0); f.bijzonderheden = 'Gecrediteerd';  // tegen de creditnota afgeletterd
    fNr++; termijnen.push({ id: 'gf' + fNr, trajectId: f.trajectId, omschrijving: 'Creditnota ' + f.omschrijving.toLowerCase(), bedrag: -f.bedrag, datum: d(c0), status: 'betaald', factuurnummer: '', verzonden: d(c0), betaald: d(c0), bijzonderheden: 'Crediteert ' + f.omschrijving, door: f.door, _n: c0, _v: c0, _t: t });
    if (kans(0.75)) {
      var nb = kans(0.5) ? f.bedrag : euro(Math.round(f.bedrag * (0.25 + 0.35 * R()))), n1 = Math.min(0, c0 + tussen(0, 3)), bt1 = Math.round(t._s.betaaltermijn * (0.6 + 0.8 * R()));
      fNr++; termijnen.push({ id: 'gf' + fNr, trajectId: f.trajectId, omschrijving: f.omschrijving + ' (gecorrigeerd)', bedrag: nb, datum: d(n1), status: n1 + bt1 <= 0 ? 'betaald' : 'verzonden', factuurnummer: '', verzonden: d(n1), betaald: n1 + bt1 <= 0 ? d(n1 + bt1) : '', bijzonderheden: '', door: f.door, _n: n1, _v: n1, _t: t });
    }
  });
  // doorlopende factuurnummers op volgorde van verzenden (verzonnen reeks)
  termijnen.filter(function (f) { return f.verzonden; }).sort(function (a, b) { return a._v - b._v || a.id.localeCompare(b.id, 'en', { numeric: true }); }).forEach(function (f, q) { f.factuurnummer = String(64100001 + q); });
  projecten.forEach(function (t) { if (termijnen.some(function (f) { return f.trajectId === t.id && f.verzonden; })) { t.gefactureerd = 'ja'; t.factuurDatum = t.soortFacturatie === 'vooraf' ? t.start : ''; } });

  /* ----- taskforce bij de geplande projecten ----- */
  huidig.filter(function (t) { return t.status === 'opstart' && !t._part; }).forEach(function (t, q) {
    var c = contactVan(t._s);
    if (q % 3 === 2) return;  // nog niet gepland
    t.taskforce = j({ datum: d(-tussen(2, 12)), deelnemers: [t.adviseur, t.am, t.talentscout].filter(Boolean).join(', '), hulpvraag: t._p[11] + ' voor ' + t._ond + ' plek' + (t._ond === 1 ? '' : 'ken') + ', vaste gezichten waar het kan.',
      inzet: t._ond + ' × ' + t._p[11], rooster: t._p[10] === 'middag' ? 'Middagen volgens rooster' : 'Ochtenden volgens rooster', startdatum: t.start, bijzonderheden: '', contactpersonen: c ? c.voornaam + ' ' + c.achternaam + ' (' + c.functie.toLowerCase() + ')' : '', door: t.adviseur || M.lars, bijgewerkt: dt(-tussen(2, 12)) });
  });

  /* ----- activiteiten, taken en meldingen ----- */
  var acts = [], aNr = 0;
  function act(type, n, door, s, extra, onderwerp, tekst) {
    if (n > 0 && type !== 'afspraak') return;
    var a = { id: 'ga' + (++aNr), type: type, datum: dt(n, uur()), door: door, schoolId: s ? s.id : '', onderwerp: onderwerp, tekst: tekst || '', bron: 'app', aangemaakt: '' };
    a.aangemaakt = a.datum;
    Object.keys(extra || {}).forEach(function (x) { a[x] = extra[x]; }); acts.push(a);
    if (s && n <= 0 && String(s.laatsteContact || '') < d(n)) s.laatsteContact = d(n);
  }
  var contactVormen = [['gesprek', 'call', 35], ['mail', 'mail', 30], ['gesprek', 'whatsapp', 8], ['afspraak', 'afspraak-online', 12], ['afspraak', 'afspraak-fysiek', 15]];
  var schoolVan = {}; scholen.forEach(function (s) { schoolVan[s.id] = s; });
  kansen.forEach(function (k0) {
    var s = schoolVan[k0.schoolId], a0 = offVan(k0.aangemaakt), eind = offVan(k0.gesloten || k0.laatsteContact);
    var n = k0.fase === 'gewonnen' ? tussen(2, 5) : k0.fase === 'verloren' ? tussen(1, 3) : tussen(1, 5);
    for (var q = 0; q < n; q++) { var vm0 = gewogen(contactVormen, 2), dd = a0 + Math.round((eind - a0) * (q + 1) / (n + 1)); act(vm0[0], dd, k0.eigenaar, s, { kansId: k0.id, persoonId: k0.persoonId, vorm: vm0[1] }, kies(['Belafspraak', 'Opvolging per mail', 'Hulpvraag besproken', 'Offerte toegelicht', 'Gesprek op school'])); }
    if (k0.fase === 'gewonnen' || k0.fase === 'verloren') act('fase', eind, k0.eigenaar, s, { kansId: k0.id }, 'Mijlpaal: onderhandeling → ' + k0.fase);
    else if (k0.fase !== 'lead') act('fase', Math.min(-1, eind - tussen(1, 10)), k0.eigenaar, s, { kansId: k0.id }, 'Mijlpaal: ' + (k0.fase === 'gesprek' ? 'lead → gesprek' : k0.fase === 'voorstel' ? 'gesprek → voorstel' : 'voorstel → onderhandeling'));
    if (k0.fase === 'gewonnen') k0.laatsteContact = d(eind);
  });
  projecten.forEach(function (t) {
    if (t._part || !t.am) return;
    var c = contactVan(t._s), van = Math.max(t._start, -400), tot = Math.min(t._eind, -1), stap = t.schooljaar === sj ? tussen(18, 30) : tussen(35, 50);
    for (var n = van + tussen(3, 10); n <= tot; n += stap + tussen(-3, 6)) {
      if (!schoolweek(n)) continue;
      var r = R(), vorm = r < 0.12 ? kies(['evaluatie-online', 'evaluatie-fysiek']) : gewogen(contactVormen, 2)[1], type = /afspraak|evaluatie/.test(vorm) ? 'afspraak' : vorm === 'mail' ? 'mail' : 'gesprek';
      act(type, werkdagTerug(n), t.am, t._s, { trajectId: t.id, persoonId: c ? c.id : '', vorm: vorm }, /evaluatie/.test(vorm) ? 'Evaluatie periode' : kies(['Contact met de school over de inzet', 'Rooster afgestemd', 'Uren van de maand doorgenomen', 'Vervanging besproken']));
    }
    if (t.status === 'bezig' && kans(0.35)) act('afspraak', tussen(1, 12), t.am, t._s, { trajectId: t.id, persoonId: c ? c.id : '', vorm: kies(['evaluatie-online', 'evaluatie-fysiek']) }, 'Evaluatie periode 1');
  });
  // het talentteam: voordrachten, statuswissels en peilingen op de tijdlijn van talenten
  kandidaten.forEach(function (k0) {
    var h = JSON.parse(k0.statusHistorie), t = projecten.filter(function (x) { return x.id === k0.trajectId; })[0];
    Object.keys(h).slice(0, 3).forEach(function (st, q) { if (q === 0 || (k0.status !== 'afgerond' && kans(0.25))) acts.push({ id: 'ga' + (++aNr), type: 'taak', datum: h[st], door: k0.door, schoolId: t ? t.schoolId : '', trajectId: k0.trajectId, talentId: k0.talentId, onderwerp: q === 0 ? 'Kandidaat voorgedragen: ' + k0.naam + ' (' + k0.functie + ')' : 'Kandidaat ' + k0.naam + ': ' + Object.keys(h)[q - 1] + ' → ' + st, tekst: '', bron: 'app', aangemaakt: h[st] }); });
  });
  talenten.forEach(function (tl) {
    if (tl.status === 'aangemeld') acts.push({ id: 'ga' + (++aNr), type: 'notitie', datum: tl.aangemaakt, door: 'Formulier', schoolId: '', talentId: tl.id, onderwerp: 'Aangemeld via het formulier (toestemming: Ja, ik ga akkoord met de privacyverklaring)', tekst: '', bron: 'formulier', aangemaakt: tl.aangemaakt });
    if (tl.laatstePeiling && tl.status === 'actief') acts.push({ id: 'ga' + (++aNr), type: 'notitie', datum: tl.laatstePeiling, door: 'Athena', schoolId: '', talentId: tl.id, onderwerp: 'Peiling gemaild: klopt je beschikbaarheid nog?', tekst: '', bron: 'app', aangemaakt: tl.laatstePeiling });
  });
  // consultants buiten de kansen om: netwerken en oude klanten
  for (var n2 = -365; n2 <= -1; n2++) {
    var info = dag(n2); if (info.wd === 0 || info.wd === 6 || !schoolweek(n2)) continue;
    CONSULTANTS.forEach(function (c) { if (kans(0.22)) { var s3 = kies(prospects.concat(klantNu)); act(kans(0.5) ? 'gesprek' : 'mail', n2, c[0], s3, { vorm: kans(0.5) ? 'call' : 'mail' }, kies(['Belafspraak', 'Opvolging per mail', 'Netwerkgesprek', 'Nieuwsbrief nagebeld'])); } });
  }

  var taken = [], tkNr = 0;
  function taak(tekst, eig, n, prio, cat, koppel, status) {
    var o = { id: 'gtk' + (++tkNr), tekst: tekst, eigenaar: eig, deadline: d(n), prio: prio, categorie: cat, status: status || 'open', bron: 'crm', aangemaakt: dt(Math.min(-1, n - tussen(2, 14))) };
    if (o.status === 'af') o.afgerond = dt(Math.min(0, n + tussen(-2, 1)), '16:' + p2(tussen(0, 59)));
    Object.keys(koppel || {}).forEach(function (x) { o[x] = koppel[x]; }); taken.push(o); return o;
  }
  huidig.filter(function (t) { return t.status === 'bezig' && t.am && !t._part; }).forEach(function (t) {
    if (kans(0.35)) taak('Evaluatie plannen met ' + t.school, t.am, tussen(-4, 14), 'midden', 'afspraak', { schoolId: t.schoolId, trajectId: t.id });
    if (kans(0.15)) taak('Rooster volgende periode afstemmen: ' + t.school, t.am, tussen(0, 20), 'midden', 'mailen', { schoolId: t.schoolId, trajectId: t.id });
  });
  termijnen.filter(function (f) { return f.status === 'nog te doen' && f._n <= 0; }).forEach(function (f) { taak('Factuur ' + f.omschrijving.toLowerCase() + ' versturen: ' + f._t.school, f.door, Math.min(0, f._n + 2), 'hoog', 'overig', { schoolId: f._t.schoolId, trajectId: f.trajectId }); });
  kansOpen.forEach(function (k0) { if (kans(0.6)) taak(k0.volgendeActie + ': ' + k0.school, k0.eigenaar, tussen(-5, 12), k0.fase === 'onderhandeling' ? 'hoog' : 'midden', /plannen|Kennismaking/.test(k0.volgendeActie) ? 'afspraak' : /nabellen/.test(k0.volgendeActie) ? 'bellen' : 'voorstel', { schoolId: k0.schoolId, kansId: k0.id, persoonId: k0.persoonId }); });
  kandidaten.filter(function (k0) { return ['contract', 'vog', 'gesprek'].indexOf(k0.status) >= 0; }).forEach(function (k0) {
    taak((k0.status === 'vog' ? 'VOG nabellen: ' : k0.status === 'contract' ? 'Contract afronden: ' : 'Matchinggesprek plannen: ') + k0.naam, k0.door, tussen(-3, 7), 'hoog', k0.status === 'gesprek' ? 'afspraak' : 'bellen', { trajectId: k0.trajectId, link: 'talent:' + k0.talentId });
  });
  // afgerond in de afgelopen weken, voor de rapporten en de reeks op Home
  for (i = 0; i < aantal(70); i++) { var wie = kies([M.lars, M.noor, M.yara, M.femke, M.ruben, M.bas, M.iris, M.sem, M.sophie]), tt0 = kies(huidig); taak(kies(['Uren nagekeken', 'Offerte verstuurd', 'Rooster bevestigd', 'Kandidaat gebeld', 'Factuur gecontroleerd', 'Evaluatie verwerkt']) + ': ' + tt0.school, wie, -tussen(1, 60), 'midden', 'overig', { schoolId: tt0.schoolId }, 'af'); }

  var meldingen = [], mNr = 0;
  function meld(voor, tekst, link, n) { meldingen.push({ id: 'gm' + (++mNr), voor: voor, tekst: tekst, link: link, datum: dt(n, '09:' + p2(tussen(0, 59))), gelezen: n < -3 ? dt(n, '10:00') : '', door: 'Athena' }); }
  huidig.filter(function (t) { return t.status === 'opstart' && !t._part; }).forEach(function (t) {
    meld(t.talentscout || M.iris, 'Nieuwe vacature: ' + t._p[11] + ' (' + t._ond + '×) bij ' + t.school + '.', 'project:' + t.id, -tussen(1, 9));
    if (t.am) meld(t.am, 'Project ' + t.traject + ' bij ' + t.school + ' staat klaar voor de opstart.', 'project:' + t.id, -tussen(1, 9));
  });
  aangemeld.slice(0, 6).forEach(function (tl) { meld(M.iris, 'Nieuwe aanmelding: ' + tl.voornaam + ' ' + tl.achternaam + ' (' + tl.functies[0] + ')', 'talent:' + tl.id, offVan(tl.aangemaakt)); });
  kansen.filter(function (k0) { return k0.fase === 'gewonnen' && k0.gesloten >= d(-30); }).forEach(function (k0) { meld(M.sophie, 'Kans gewonnen: ' + k0.naam + ' bij ' + k0.school + ' (' + euroTekst(Math.round(k0.waarde * 100)) + ').', 'kans:' + k0.id, offVan(k0.gesloten)); });

  /* ----- aanmeldingen die de dagelijkse run nog moet verwerken ----- */
  var aanm = [];
  for (i = 0; i < 2; i++) { var nm2 = persoonsnaam(); aanm.push({ tijdstempel: dt(-1, '2' + i + ':1' + i), voornaam: nm2[0], achternaam: nm2[1], telefoon: telefoon(9000 + i), email: sl(nm2[0] + ' ' + nm2[1]) + '@mail.example', postcode: (3500 + i * 37) + ' KL', functies: kies(['huiswerkbegeleider', 'surveillant, onderwijsondersteuner', 'nt2-ondersteuner']), sector: 'vo', beschikbaarheid: kies(['ma middag, wo middag, do', 'di, do', 'ma ochtend, vr']), toestemming: 'Ja, ik ga akkoord met de privacyverklaring', verwerkt: '', talentId: '' }); }

  /* ----- wegschrijven (zonder de hulpvelden met een _) ----- */
  function schoon(o) { var u = {}; Object.keys(o).forEach(function (x) { if (x.charAt(0) !== '_') u[x] = o[x]; }); return u; }
  scholen.forEach(function (s) { if (!s.laatsteContact) s.laatsteContact = d(-tussen(20, 200)); });
  schrijfVeel('Scholen', scholen.map(schoon));
  personen.forEach(function (p) { var s = scholen.filter(function (x) { return x.id === p.schoolId; })[0]; p.laatsteContact = s ? s.laatsteContact : ''; });
  schrijfVeel('Personen', personen);
  schrijfVeel('Kansen', kansen);
  schrijfVeel('Trajecten', projecten.map(schoon));
  schrijfVeel('Vacatures', vacatures);
  schrijfVeel('Kandidaten', kandidaten);
  schrijfVeel('Talenten', talenten.map(schoon));
  schrijfVeel('TalentDocumenten', docs);
  schrijfVeel('Beoordelingen', beoordelingen);
  schrijfVeel('TalentSchool', relaties);
  schrijfVeel('TalentUren', uren);
  schrijfVeel('Facturen', termijnen.map(function (f) { var u = schoon(f); u.aangemaakt = dt(Math.min(-1, f._n - tussen(1, 10))); return u; }));
  schrijfVeel('Activiteiten', acts);
  schrijfVeel('Acties', taken);
  schrijfVeel('Meldingen', meldingen);
  schrijfVeel('Aanmeldingen', aanm);

  /* ----- doelen op deze schaal (afgerond; de standaardseed is op de kleine demo afgestemd) ----- */
  var omzetNu = huidig.reduce(function (a, t) { return a + t.contractwaarde; }, 0) + lees('Trajecten').filter(function (t) { return t.schooljaar === sj && !/^gt/.test(t.id); }).reduce(function (a, t) { return a + (Number(t.contractwaarde || t.omzet) || 0); }, 0);
  var rond = function (x, stap) { return Math.max(stap, Math.round(x / stap) * stap); };
  var doel = function (eig, per, m, w) { return { id: slug(eig + '-' + per + '-' + m), eigenaar: eig, periode: per, metric: m, doel: w }; };
  schrijfVeel('Doelen', [doel('bedrijf', 'schooljaar', 'omzet', rond(omzetNu * 1.6, 50000)), doel('bedrijf', 'schooljaar', 'scholen', rond((klantNu.length + partNu.length) * 1.5, 5)), doel('bedrijf', 'schooljaar', 'ondersteuners', rond(actiefPool.length * 1.1, 10)),
    doel('team:consultancy', 'maand', 'gewonnenWaarde', rond(omzetNu / 8, 10000)), doel('team:consultancy', 'kwartaal', 'gewonnenWaarde', rond(omzetNu / 3, 10000)), doel('team:talent', 'maand', 'voordrachten', 40), doel('team:talent', 'kwartaal', 'voordrachten', 110)]);

  /* ----- de bevroren prognose van de afgelopen maanden (iets anders dan nu, zoals in het echt) ----- */
  var nuM = d(0).slice(0, 7), eerstM = schooljaarMaanden(sj)[0], prog = [], D = financienData(), TR = perId(lees('Trajecten'));
  huidig.forEach(function (t) {
    var rij = TR[t.id], F = financienProject(rij, D.fac[t.id] || [], D.uren[t.id] || [], termijnDagenVan(rij, D));
    uniek(Object.keys(F.per.prognose).concat(Object.keys(F.per.prognoseKas))).sort().forEach(function (m) { if (m > nuM || m < eerstM) return; prog.push({ id: 'pg-' + t.id + '-' + m, gemaakt: m, trajectId: t.id, maand: m, prognose: F.per.prognose[m] || 0, kas: Math.round((F.per.prognoseKas[m] || 0) * (0.85 + 0.3 * R())) }); });
  });
  schrijfVeel('Prognoses', prog);

  /* ----- XPS: de dienstenexport per dienst (laatste twee weken) in de map XPS-export, zonder salariskolommen ----- */
  var kop = ['Datum', 'Datum: Van', 'Datum: Tot', 'Gewerkte tijd', 'Uitgevoerd door', 'Omschrijving', 'Status', 'Project', 'Projectleider', 'Accountnummer', 'E-mail', 'Projectnummer'];
  var cel = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var regels = diensten.map(function (x) {
    var t = x.t, periode = '01-08-' + t.schooljaar.slice(0, 4) + ' ~ 31-07-' + t.schooljaar.slice(5);
    return [d(x.dag), x.van, x.tot, String(x.duur).replace('.', ','), x.tl.voornaam + ' ' + x.tl.achternaam, t.traject + (t._p[10] === 'middag' ? ' middag' : ''), x.status, t.school + ' | ' + t.traject + ' (' + periode + ')', t._xpsLeider === undefined ? (t._xpsLeider = kans(0.33) ? '' : t.am) : t._xpsLeider,
      x.tl.xpsId, x.tl.email, t.xpsProject].map(cel).join(';');
  });
  var onb = diensten[0] ? diensten[0] : null;  // één dienst van een account dat (nog) niet in het talentbestand staat
  if (onb) regels.push([d(onb.dag), '08:30', '12:30', '4', 'Onbekend Account', 'Surveillance', 'Ingeroosterd', onb.t.school + ' | ' + onb.t.traject, '', 'X69999', 'onbekend.account@mail.example', onb.t.xpsProject].map(cel).join(';'));
  var w2 = dag(ma0 - 7 * Math.max.apply(null, exportWk)).week, w1 = dag(ma0 - 7 * Math.min.apply(null, exportWk)).week;
  _demoDrive.mappen['demo-xps'].createFile(Utilities.newBlob(kop.join(';') + '\n' + regels.join('\n'), 'text/csv', 'xps-diensten-' + w2 + '-' + w1.slice(-3) + '.csv'));

  DEMO_GROOT.telling = { scholen: scholen.length, particulier: scholen.filter(function (s) { return s.type === 'particulier'; }).length, personen: personen.length, projectenHuidig: huidig.length, projectenVorig: oud.length,
    lopend: huidig.filter(function (t) { return t.status === 'bezig'; }).length, gepland: huidig.filter(function (t) { return t.status === 'opstart'; }).length, kansen: kansen.length, kansenOpen: kansOpen.length,
    talenten: talenten.length, actief: actiefPool.length, slapend: slapendPool.length, talentUren: uren.length, diensten: urenTel.diensten, dienstenExport: regels.length, facturen: termijnen.length, creditnotas: creditTel,
    vacatures: vacatures.length, kandidaten: kandidaten.length, activiteiten: acts.length, taken: taken.length, vog: vogTel, peilingKlaar: peilingKlaar, slapendKlaar: slapendKlaar, bewaarKlaar: bewaarKlaar, laat: laatTel };
  return DEMO_GROOT.telling;
}

/* ----- Start, opslag en herstel ----- */
// v7.4: Utilities.getUuid (Math.random) tijdens het opbouwen vervangen door een vaste reeks, zodat ook de id's die de standaardseed
// via nieuwId() krijgt (meldingen, Drive-bestanden) bij elke start gelijk zijn: alleen dan past een bewaarde wijziging op dezelfde rij.
function _grootBouw() {
  var echt = Utilities.getUuid, Rid = _grootRng(DEMO_GROOT.seed + 1);
  Utilities.getUuid = function () { var s = ''; for (var i = 0; i < 32; i++) s += Math.floor(Rid() * 16).toString(16); return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20); };
  try {
    _demoBladen = {}; _BLAD = {}; _LEES = {}; KOP_GECONTROLEERD = {};
    demoVul(); demoGrootVul();
  } finally { Utilities.getUuid = echt; }
  _LEES = {}; _BLAD = {}; GEBRUIKER = null;
  // de basis onthouden: per tabblad de rijen als tekst op hun sleutel (eerste kolom), om wijzigingen te kunnen vinden
  var B = {};
  Object.keys(_demoBladen).forEach(function (n) {
    var rijen = _demoBladen[n].rijen, x = { kop: JSON.stringify(rijen[0] || []), rijen: {}, uniek: true };
    for (var i = 1; i < rijen.length; i++) { var k = String(rijen[i][0]); if (!k || Object.prototype.hasOwnProperty.call(x.rijen, k)) x.uniek = false; x.rijen[k] = JSON.stringify(rijen[i]); }
    if (!x.uniek) { x.vol = JSON.stringify(rijen); x.rijen = null; }
    B[n] = x;
  });
  DEMO_GROOT.basis = B;
  DEMO_GROOT.dag = datumStr(new Date());  // v7.4 (iOS-review): de dag van deze basis; de id's horen alleen op deze dag bij dezelfde rijen
}
function _grootToepassen(data) {
  if (!data || data.profiel !== 'groot' || !data.bladen || typeof data.bladen !== 'object') throw new Error('Geen bewaarde stand van het profiel groot.');
  // v7.4 (iOS-review): de basis wordt elke dag anders opgebouwd (datums relatief aan vandaag, de reeks loopt anders), zodat een id een dag later
  // bij een andere rij hoort; een bewaarde wijziging of 'weg'-sleutel zou dan een onbekende rij raken. sessionStorage overleeft op iOS een nacht.
  if (data.versie !== GROOT_OPSLAG_VERSIE || data.dag !== DEMO_GROOT.dag) { var e = new Error('De bewaarde stand hoort bij een andere dag of versie.'); e.verouderd = true; throw e; }
  Object.keys(data.bladen).forEach(function (n) {
    var dl = data.bladen[n], b = _demoBladen[n] || _demoSS.insertSheet(n), rijen = b.rijen, pos = {}, i;
    if (dl.vol) { rijen.length = 0; dl.vol.forEach(function (r) { rijen.push(r); }); return; }
    for (i = 1; i < rijen.length; i++) pos[String(rijen[i][0])] = i;
    if (dl.kop) rijen[0] = dl.kop;
    (dl.rijen || []).forEach(function (r) { var k = String(r[0]); if (pos[k] !== undefined) rijen[pos[k]] = r; else { pos[k] = rijen.length; rijen.push(r); } });
    if (dl.weg && dl.weg.length) { var weg = {}; dl.weg.forEach(function (k) { weg[String(k)] = 1; }); for (i = rijen.length - 1; i >= 1; i--) if (weg[String(rijen[i][0])]) rijen.splice(i, 1); }
  });
  Object.keys(data.props || {}).forEach(function (k) { if (['SECRET', 'CODES', 'NAAM', 'SHEET_ID'].indexOf(k) < 0) _demoProps[k] = data.props[k]; });  // de inlogcodes komen altijd uit DEMO_MENSEN
}
// Ingang vanuit demo/demo.js (in plaats van demoStart): bouwt de basis en zet een bewaarde stand terug; bij een kapotte stand een verse demo.
// Uitkomst: 'gevuld' (vers), 'hersteld' (bewaarde stand teruggezet) of 'vernieuwd' (v7.4: stand van een andere dag of versie; vers, en demo.js meldt het)
function demoGrootStart(opgeslagen) {
  _grootBouw();
  if (!opgeslagen) return 'gevuld';
  try { _grootToepassen(JSON.parse(opgeslagen)); _LEES = {}; _BLAD = {}; GEBRUIKER = null; return 'hersteld'; }
  catch (e) {
    if (e && e.verouderd) return 'vernieuwd';  // de controle staat vóór elke wijziging: de basis is nog vers
    _grootBouw(); return 'gevuld';
  }
}
// Wat er in sessionStorage komt: alleen de rijen die anders zijn dan de basis, de verwijderde sleutels, en tabbladen zonder unieke sleutel in hun geheel
function demoGrootExport() {
  var B = DEMO_GROOT.basis || {}, uit = { profiel: 'groot', versie: GROOT_OPSLAG_VERSIE, dag: DEMO_GROOT.dag || datumStr(new Date()), bladen: {}, props: _demoProps };  // v7.4 (iOS-review): de dag van de basis, niet van het bewaren (een tab die over middernacht openblijft)
  Object.keys(_demoBladen).forEach(function (n) {
    var rijen = _demoBladen[n].rijen, b = B[n], i;
    if (!b || !b.uniek) { if (!b || JSON.stringify(rijen) !== b.vol) uit.bladen[n] = { vol: rijen }; return; }
    var gezien = {}, anders = [], weg = [], kop = JSON.stringify(rijen[0] || []);
    for (i = 1; i < rijen.length; i++) {
      var k = String(rijen[i][0]);
      if (!k || gezien[k]) { uit.bladen[n] = { vol: rijen }; return; }
      gezien[k] = 1;
      if (b.rijen[k] !== JSON.stringify(rijen[i])) anders.push(rijen[i]);
    }
    Object.keys(b.rijen).forEach(function (k) { if (!gezien[k]) weg.push(k); });
    if (anders.length || weg.length || kop !== b.kop) { var x = { rijen: anders, weg: weg }; if (kop !== b.kop) x.kop = rijen[0]; uit.bladen[n] = x; }
  });
  return JSON.stringify(uit);
}
