/* Athena Assistent — Google Apps Script-backend (v2.0)
 * Het bedrijfsbrein van AthenaSchool: operations-dashboard, kennisbank met vraag-en-antwoord, nachtelijke review,
 * huisstijl-kit, doorzoekbare geschiedenis van elke schoolopdracht en (v2.0) het eigen CRM dat Capsule vervangt.
 * Data staat in één Google Sheet (tabbladen hieronder), documenten in één Drive-map. Zie README.md voor de installatie.
 * Contract met de app: POST {fn, args, secret} → {ok:true, result} of {ok:false, fout}. Fout 'secret' = koppelcode klopt niet.
 */

var VERSIE = '3.9';
var P = PropertiesService.getScriptProperties();

// v2.0: nieuwe kolommen komen altijd ACHTERAAN (blad() vult de kop aan), zodat bestaande Sheets gewoon blijven werken.
var TABELLEN = {
  Scholen:      ['id', 'naam', 'plaats', 'type', 'contactpersoon', 'email', 'telefoon', 'status', 'am', 'notities', 'bijgewerkt',
                 'bestuur', 'adres', 'website', 'leerlingen', 'eigenaar', 'tags', 'velden', 'laatsteContact', 'capsuleId', 'aangemaakt', 'bijgewerktDoor'],
  Trajecten:    ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting', 'bijgewerkt',
                 'schoolId', 'capsuleId', 'bijgewerktDoor',
                 'kansId', 'adviseur', 'soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer'],  // v3.8: project uit gewonnen kans + facturatie
  Kansen:       ['id', 'school', 'traject', 'fase', 'waarde', 'volgendeActie', 'deadline', 'laatsteContact', 'eigenaar', 'notities', 'bijgewerkt',
                 'naam', 'schoolId', 'persoonId', 'pipeline', 'kans', 'verwachteSluiting', 'gesloten', 'verliesReden', 'tags', 'velden', 'capsuleId', 'aangemaakt', 'bijgewerktDoor', 'am'],  // v3.8: am = accountmanager na winst
  Acties:       ['id', 'tekst', 'bron', 'prio', 'deadline', 'status', 'link', 'aangemaakt', 'afgerond',
                 'categorie', 'eigenaar', 'schoolId', 'persoonId', 'kansId', 'trackRunId', 'notitie', 'capsuleId', 'trajectId'],  // v3.8: taak in een project
  Documenten:   ['id', 'titel', 'type', 'school', 'url', 'driveId', 'gewijzigd', 'woorden', 'tekst', 'bijgewerkt'],
  Reviews:      ['id', 'datum', 'gemaaktOp', 'samenvatting', 'gedaan', 'blijvenLiggen', 'vandaag', 'eigenaar'],  // v3.3: review per gebruiker
  Huisstijl:    ['sleutel', 'waarde'],
  Content:      ['id', 'datum', 'type', 'onderwerp', 'tekst', 'door'],  // v3.7: door = wie het maakte (mag het verwijderen)
  Notities:     ['id', 'trajectId', 'datum', 'tekst'],
  // v2.0: CRM
  Personen:     ['id', 'voornaam', 'achternaam', 'functie', 'schoolId', 'email', 'telefoon', 'linkedin', 'eigenaar', 'tags', 'velden', 'laatsteContact', 'capsuleId', 'aangemaakt', 'bijgewerkt', 'bijgewerktDoor'],
  Activiteiten: ['id', 'type', 'datum', 'door', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'onderwerp', 'duurMin', 'gmailId', 'agendaId', 'bron', 'aangemaakt', 'tekst'],
  Activiteiten_archief: ['id', 'type', 'datum', 'door', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'onderwerp', 'duurMin', 'gmailId', 'agendaId', 'bron', 'aangemaakt', 'tekst'],  // v3.3: ouder dan 12 maanden
  Mijlpalen:    ['id', 'pipeline', 'mijlpaal', 'volgorde', 'kans', 'dagenNorm'],
  Tracks:       ['id', 'naam', 'omschrijving', 'stappen', 'bijgewerkt'],
  Gebruikers:   ['id', 'naam', 'email', 'rol', 'actief', 'bijgewerkt'],
  Doelen:       ['id', 'eigenaar', 'periode', 'metric', 'doel', 'bijgewerkt'],
  Facturen:     ['id', 'trajectId', 'omschrijving', 'bedrag', 'datum', 'status', 'factuurnummer', 'bijzonderheden', 'exactId', 'aangemaakt', 'bijgewerkt', 'door'],  // v3.8: factuurtermijnen per project
  Instellingen: ['sleutel', 'waarde']  // v3.7: keuzelijsten en correcties die de beheerder zelf instelt (JSON)
};
var DATUMTIJD_KOLOMMEN = { bijgewerkt: 1, aangemaakt: 1, afgerond: 1, gemaaktOp: 1, gewijzigd: 1, datum: 1 };
var DOC_TYPES = ['contract', 'werkwijze', 'schooldossier', 'voorstel', 'prijslijst', 'overig'];
var KANS_FASES = ['lead', 'gesprek', 'voorstel', 'onderhandeling', 'gewonnen', 'verloren'];
var TRAJECT_STATUSSEN = ['offerte', 'actief', 'afgerond', 'gestopt'];
var PRIOS = ['hoog', 'midden', 'laag'];

/* ===================== Eenmalige inrichting (draai vanuit de editor) ===================== */

function setup() {
  var id = P.getProperty('SHEET_ID'), ss;
  if (id) { ss = SpreadsheetApp.openById(id); } else { ss = SpreadsheetApp.create('Athena Assistent — data'); P.setProperty('SHEET_ID', ss.getId()); }
  Object.keys(TABELLEN).forEach(function (naam) {
    var b = ss.getSheetByName(naam) || ss.insertSheet(naam);
    if (b.getLastRow() === 0) { b.appendRow(TABELLEN[naam]); b.setFrozenRows(1); }
  });
  var standaard = ss.getSheetByName('Blad1') || ss.getSheetByName('Sheet1');
  if (standaard && ss.getSheets().length > 1) ss.deleteSheet(standaard);
  if (!P.getProperty('SECRET')) P.setProperty('SECRET', Utilities.getUuid().replace(/-/g, '').slice(0, 12));
  if (!P.getProperty('DRIVE_MAP_ID')) {
    var map = DriveApp.createFolder('Athena Assistent — documenten');
    ['Contracten', 'Werkwijzen', 'Schooldossiers', 'Voorstellen', 'Prijslijst'].forEach(function (n) { map.createFolder(n); });
    P.setProperty('DRIVE_MAP_ID', map.getId());
  }
  installeerTriggers();
  crmInrichten();  // v2.0: CRM-kolommen en -tabbladen, bestaande contactpersonen en notities overzetten (idempotent)
  var uit = { sheet: ss.getUrl(), map: mapUrl(), koppelcode: P.getProperty('SECRET') };
  Logger.log('Sheet: ' + uit.sheet + '\nDocumentenmap: ' + uit.map + '\nKoppelcode (voor de app): ' + uit.koppelcode);
  return uit;
}

function installeerTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['nachtelijkeReviewTrigger', 'indexeerTrigger', 'crmSyncTrigger', 'archiveerTrigger'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('indexeerTrigger').timeBased().everyDays(1).atHour(4).create();          // documenten opnieuw inlezen
  ScriptApp.newTrigger('nachtelijkeReviewTrigger').timeBased().everyDays(1).atHour(5).create(); // review klaar vóór de ochtend
  ScriptApp.newTrigger('crmSyncTrigger').timeBased().everyHours(1).create();                    // v2.0: mails en afspraken aan scholen koppelen
  ScriptApp.newTrigger('archiveerTrigger').timeBased().onMonthDay(1).atHour(3).create();         // v3.3: oude activiteit naar het archief
}

// Optioneel: fictieve voorbeelddata om de app meteen gevuld te zien. Verwijder de rijen daarna gewoon in de Sheet.
function vulVoorbeelddata() {
  var sj = huidigSchooljaar();
  [['Voorbeeldcollege Zuid', 'Rotterdam', 'VO', 'A. de Vries', 'klant'], ['Lyceum Demo', 'Den Haag', 'VO', 'B. Jansen', 'klant'],
   ['ISK Voorbeeld', 'Delft', 'VO', 'C. Bakker', 'lead'], ['Montessori Demo', 'Utrecht', 'PO', 'D. Visser', 'klant']].forEach(function (r) {
    schrijf('Scholen', { id: 'demo-' + slug(r[0]), naam: r[0], plaats: r[1], type: r[2], contactpersoon: r[3], status: r[4], am: 'Menno' });
  });
  [['Voorbeeldcollege Zuid', 'Onderwijsondersteuning', sj, '2026-09-01', '2027-05-31', 'actief', 2, 30, 48.5, 40740, 'A. de Vries'],
   ['Lyceum Demo', 'Huiswerkbegeleiding', sj, '2026-09-07', '2027-06-30', 'actief', 1, 8, 42, 12000, 'B. Jansen'],
   ['Montessori Demo', 'Studentdocent', sj, '2026-08-24', '2026-12-20', 'actief', 1, 16, 45, 11520, 'D. Visser'],
   ['ISK Voorbeeld', 'NT2-ondersteuning', sj, '2026-11-02', '2027-04-30', 'offerte', 1, 16, 47, 15040, 'C. Bakker'],
   ['Voorbeeldcollege Zuid', 'Examentraining', '2025-2026', '2026-03-01', '2026-05-15', 'afgerond', 3, 12, 46, 8280, 'A. de Vries']].forEach(function (r) {
    schrijf('Trajecten', { id: 'demo-' + slug(r[0] + '-' + r[1] + '-' + r[2]), school: r[0], traject: r[1], schooljaar: r[2], start: r[3], eind: r[4], status: r[5], ondersteuners: r[6], urenPerWeek: r[7], tarief: r[8], omzet: r[9], contactpersoon: r[10], am: 'Menno', samenvatting: 'Voorbeeldtraject — vervang door echte gegevens.' });
  });
  [['ISK Voorbeeld', 'NT2-ondersteuning', 'voorstel', 15040, 'Voorstel nabellen', datumStr(plusDagen(2)), datumStr(plusDagen(-9))],
   ['Lyceum Demo', 'Examentraining', 'gesprek', 9000, 'Afspraak inplannen met teamleider', datumStr(plusDagen(5)), datumStr(plusDagen(-2))]].forEach(function (r) {
    schrijf('Kansen', { id: 'demo-' + slug(r[0] + '-' + r[1]), school: r[0], traject: r[1], fase: r[2], waarde: r[3], volgendeActie: r[4], deadline: r[5], laatsteContact: r[6], eigenaar: 'Menno' });
  });
  [['Voorstel ISK Voorbeeld nabellen', 'kans', 'hoog', datumStr(plusDagen(1))], ['Rooster Voorbeeldcollege Zuid bevestigen', 'handmatig', 'midden', datumStr(plusDagen(3))],
   ['Contract Lyceum Demo laten tekenen', 'contract', 'hoog', datumStr(plusDagen(-1))]].forEach(function (r) {
    schrijf('Acties', { id: 'demo-' + slug(r[0]), tekst: r[0], bron: r[1], prio: r[2], deadline: r[3], status: 'open', aangemaakt: nu() });
  });
  return 'Voorbeelddata staat in de Sheet.';
}

/* ===================== Transport ===================== */

function doGet() {
  return json({ ok: true, app: 'Athena Assistent', versie: VERSIE, melding: 'Backend actief. Plak deze URL in de app.' });
}

function doPost(e) {
  var uit;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = String(req.fn || '');
    GEBRUIKER = wieIs(req.secret);  // v2.0: de beheerderscode (SECRET) of een eigen code per accountmanager (CODES)
    if (!GEBRUIKER) uit = { ok: false, fout: 'secret' };
    else if (!/^api[A-Z]\w*$/.test(fn) || typeof globalThis[fn] !== 'function') uit = { ok: false, fout: 'onbekende functie ' + fn };
    else { var r = globalThis[fn].apply(null, req.args || []); uit = { ok: true, result: (r === undefined) ? null : r }; }
  } catch (err) {
    uit = { ok: false, fout: String((err && err.message) || err) };
  }
  return json(uit);
}

function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ===================== Sheet als database ===================== */

// v3.2: per verzoek onthouden (Apps Script start elk verzoek met een schone globale scope). Spreadsheet openen en een tabblad
// lezen zijn de traagste stappen; zonder dit gebeurden ze tientallen keren per verzoek. Elke schrijffunctie roept vergeet() aan.
var _SS = null, _BLAD = {}, _LEES = {};
function sheet() {
  if (_SS) return _SS;
  var id = P.getProperty('SHEET_ID');
  if (!id) throw new Error('Backend niet ingericht — draai setup() in de Apps Script-editor.');
  _SS = SpreadsheetApp.openById(id);
  return _SS;
}
function vergeet(naam) { delete _LEES[naam]; delete _LEES[naam + '|licht']; if (naam === 'Trajecten') _TRAJECTNAMEN = null; }
var KOP_GECONTROLEERD = {};
function blad(naam) {
  if (_BLAD[naam] && KOP_GECONTROLEERD[naam]) return _BLAD[naam];
  var ss = sheet(), b = ss.getSheetByName(naam), kop = TABELLEN[naam];
  if (!b) { b = ss.insertSheet(naam); b.appendRow(kop); b.setFrozenRows(1); KOP_GECONTROLEERD[naam] = true; }
  else if (!KOP_GECONTROLEERD[naam]) {
    // v2.0: kolommen die in een nieuwe versie zijn bijgekomen achteraan in de kop aanvullen; bestaande data blijft staan
    if (b.getMaxColumns() < kop.length) b.insertColumnsAfter(b.getMaxColumns(), kop.length - b.getMaxColumns());
    var breed = b.getLastColumn();
    if (b.getLastRow() === 0) { b.getRange(1, 1, 1, kop.length).setValues([kop]); b.setFrozenRows(1); }
    else if (breed < kop.length) b.getRange(1, breed + 1, 1, kop.length - breed).setValues([kop.slice(breed)]);
    KOP_GECONTROLEERD[naam] = true;
  }
  _BLAD[naam] = b;
  return b;
}
function celWaarde(v, kolom) {
  if (v instanceof Date) return DATUMTIJD_KOLOMMEN[kolom] ? datumTijdStr(v) : datumStr(v);
  return v;
}
// Alle rijen van een tabblad als objecten; _rij = rijnummer in de Sheet (voor updates).
// licht = true laat de kolom 'tekst' en alles erna weg (Documenten kan megabytes tekst bevatten).
function lees(naam, licht) {
  var sleutel = naam + (licht ? '|licht' : '');
  if (!_LEES[sleutel]) _LEES[sleutel] = leesUitSheet(naam, licht);
  // kopieën, zodat een aanroeper die een rij aanpast de onthouden versie niet verandert
  return _LEES[sleutel].map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; });
}
function leesUitSheet(naam, licht) {
  var kop = TABELLEN[naam], b = blad(naam), aantal = kop.length;
  if (licht && kop.indexOf('tekst') > 0) aantal = kop.indexOf('tekst');
  var laatste = b.getLastRow(), waarden = laatste > 0 ? b.getRange(1, 1, laatste, aantal).getValues() : [], uit = [];
  for (var r = 1; r < waarden.length; r++) {
    var o = { _rij: r + 1 }, leeg = true;
    for (var c = 0; c < aantal; c++) {
      var v = celWaarde(waarden[r][c], kop[c]);
      if (v !== '' && v != null) leeg = false;
      o[kop[c]] = (v == null) ? '' : v;
    }
    if (!leeg) uit.push(o);
  }
  return uit;
}
// Celwaarde voor de Sheet: objecten als JSON, nooit iets dat als formule wordt gelezen.
function celUit(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && /^[=+]/.test(v)) return ' ' + v;
  return v;
}
function samenvoegen(naam, obj, hit) {
  var kop = TABELLEN[naam], samen = {};
  kop.forEach(function (k) { samen[k] = (obj[k] !== undefined && obj[k] !== null) ? obj[k] : (hit ? hit[k] : ''); });
  if (kop.indexOf('bijgewerkt') >= 0) samen.bijgewerkt = nu();
  if (kop.indexOf('bijgewerktDoor') >= 0) samen.bijgewerktDoor = ikNaam();  // v3.3: voor de conflictmelding
  return samen;
}
// Upsert op id. Geeft het samengevoegde object terug.
function schrijf(naam, obj) {
  var kop = TABELLEN[naam], b = blad(naam), hit = null;
  if (obj.id) lees(naam).some(function (r) { if (String(r.id) === String(obj.id)) { hit = r; return true; } return false; });
  if (!obj.id) obj.id = nieuwId();
  var samen = samenvoegen(naam, obj, hit), rij = kop.map(function (k) { return celUit(samen[k]); });
  if (hit) b.getRange(hit._rij, 1, 1, kop.length).setValues([rij]); else b.appendRow(rij);
  vergeet(naam);
  return samen;
}
// Veel rijen in één keer (import, index): één keer lezen, updates per rij, nieuwe rijen in één blok.
function schrijfVeel(naam, lijst) {
  var stats = { ingevoegd: 0, bijgewerkt: 0 };
  if (!lijst.length) return stats;
  var kop = TABELLEN[naam], b = blad(naam), bestaand = {}, nieuw = [];
  lees(naam).forEach(function (r) { bestaand[String(r.id)] = r; });
  lijst.forEach(function (obj) {
    if (!obj.id) obj.id = nieuwId();
    var hit = bestaand[String(obj.id)], samen = samenvoegen(naam, obj, hit), rij = kop.map(function (k) { return celUit(samen[k]); });
    if (hit) { b.getRange(hit._rij, 1, 1, kop.length).setValues([rij]); stats.bijgewerkt++; }
    else { nieuw.push(rij); bestaand[String(obj.id)] = samen; stats.ingevoegd++; }
  });
  if (nieuw.length) b.getRange(b.getLastRow() + 1, 1, nieuw.length, kop.length).setValues(nieuw);
  vergeet(naam);
  return stats;
}
function verwijderRijen(naam, filterFn) {
  var b = blad(naam), weg = lees(naam, true).filter(filterFn).map(function (r) { return r._rij; }).sort(function (a, c) { return c - a; });
  weg.forEach(function (r) { b.deleteRow(r); });
  vergeet(naam);
  return weg.length;
}
// Kort cachen (seconden) van trage bronnen zoals Gmail; bij een cachefout gewoon opnieuw ophalen.
function metCache(sleutel, seconden, fn) {
  var cache = CacheService.getScriptCache(), hit = null;
  try { hit = cache.get('athena-' + sleutel); } catch (e) {}
  if (hit) { try { return JSON.parse(hit); } catch (e2) {} }
  var waarde = fn();
  try { cache.put('athena-' + sleutel, JSON.stringify(waarde), seconden); } catch (e3) {}
  return waarde;
}
// v1.1: zonder lock nooit schrijven — twee gelijktijdige schrijfVeel-runs schrijven anders allebei op getLastRow()+1 en overschrijven elkaar.
function metLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Athena is al bezig met een andere bewerking. Probeer het over een halve minuut opnieuw.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================== 1. Operations-dashboard: wat vraagt vandaag je aandacht ===================== */

function apiOverzicht() {
  var trajecten = lees('Trajecten'), kansen = lees('Kansen'), scholen = lees('Scholen'), mp = mijlpaalMap();
  // v2.0: elke gebruiker ziet zijn eigen acties; acties zonder eigenaar horen bij de beheerder. Een accountmanager ziet alleen zijn eigen kansen.
  var acties = lees('Acties').filter(function (a) { return a.status !== 'af' && vanMij(a.eigenaar); }).sort(sorteerActies);
  if (!isBeheerder()) kansen = kansen.filter(function (k) { return (k.eigenaar || k.am) === ikNaam(); });
  var actief = trajecten.filter(function (t) { return t.status === 'actief'; });
  var sj = huidigSchooljaar();
  var omzet = trajecten.filter(function (t) { return t.schooljaar === sj && t.status !== 'gestopt' && t.status !== 'offerte'; })
    .reduce(function (s, t) { return s + (Number(t.omzet) || 0); }, 0);
  var open = kansen.filter(kansOpen).sort(function (a, b) { return String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')); });
  return {
    datum: datumLang(new Date()), groet: groet(),
    kpi: { trajecten: actief.length, kansen: open.length, scholen: uniek(actief.map(function (t) { return t.school; })).length, omzet: omzet, schooljaar: sj,
           pijplijn: open.reduce(function (s, k) { return s + (Number(k.waarde) || 0); }, 0) },
    focus: acties.slice(0, 6).map(function (a) { return taakUit(a); }), aandacht: acties.slice(6).map(function (a) { return taakUit(a); }),  // v3.7: alle velden, zodat de app ze kan bewerken
    mails: mailsOnbeantwoord(5), agenda: agendaVoorDag(new Date()), gekoppeld: mijnMailbox(),
    kansen: open.slice(0, 8).map(function (k) { return kansUit(k, mp); }),
    tellingScholen: scholen.length
  };
}
function apiActieKlaar(id) {
  var a = vind('Acties', id); if (!a) throw new Error('Actie niet gevonden.');
  metLock(function () {
    schrijf('Acties', { id: id, status: 'af', afgerond: nu() });
    // v2.0: een CRM-taak die aan een school, persoon of kans hangt komt in de tijdlijn
    if (a.schoolId || a.persoonId || a.kansId) schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: a.schoolId, persoonId: a.persoonId, kansId: a.kansId, onderwerp: 'Taak afgerond: ' + a.tekst, bron: 'app', aangemaakt: nu() });
  });
  return { id: id, status: 'af', afgerond: nu() };  // v3.7
}
function apiActieToevoegen(tekst, prio, deadline) {
  tekst = String(tekst || '').trim(); if (!tekst) throw new Error('Geen tekst.');
  var a = metLock(function () { return schrijf('Acties', { tekst: tekst, bron: 'handmatig', prio: PRIOS.indexOf(prio) >= 0 ? prio : 'midden', deadline: deadline || '', status: 'open', aangemaakt: nu(), eigenaar: ikNaam() }); });
  return actieUit(a);
}
function actieUit(a) { var tot = a.deadline ? dagenTot(a.deadline) : null; return { id: a.id, tekst: a.tekst, bron: a.bron, prio: a.prio, deadline: a.deadline, link: a.link || '', over: tot === null ? null : -tot || 0 }; }
// v2.0: met mijlpalenkaart (mp) erbij komen kans-%, gewogen waarde en 'stil' (langer geen contact dan de norm van de mijlpaal)
function kansUit(k, mp) {
  var m = (mp && typeof mp === 'object') ? mp[k.fase] : null, waarde = Number(k.waarde) || 0, stil = k.laatsteContact ? dagenSinds(k.laatsteContact) : null;
  var kans = (k.kans !== '' && k.kans != null) ? Number(k.kans) || 0 : (k.fase === 'gewonnen' ? 100 : k.fase === 'verloren' ? 0 : (m ? m.kans : 0));
  var norm = m && m.dagenNorm ? m.dagenNorm : 7;
  return { id: k.id, naam: k.naam || k.traject, school: k.school, schoolId: k.schoolId || '', persoonId: k.persoonId || '', traject: k.traject, fase: k.fase, pipeline: k.pipeline || '',
    waarde: waarde, kans: kans, gewogen: Math.round(waarde * kans / 100), volgendeActie: k.volgendeActie, deadline: k.deadline, verwachteSluiting: k.verwachteSluiting || '',
    gesloten: k.gesloten || '', verliesReden: k.verliesReden || '', eigenaar: k.eigenaar || '', am: k.am || '', tags: tagsUit(k.tags), velden: veldenUit(k.velden), notities: k.notities || '', aangemaakt: k.aangemaakt || '',
    dagenStil: stil, stil: kansOpen(k) && stil !== null && stil > norm };
}
function kansOpen(k) { return ['gewonnen', 'verloren'].indexOf(k.fase) < 0; }
function sorteerActies(a, b) {
  var pa = PRIOS.indexOf(a.prio), pb = PRIOS.indexOf(b.prio);
  var da = a.deadline || '9999', db = b.deadline || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb);
}

// Mails in de inbox waarvan het laatste bericht niet van jou is en ouder dan 2 dagen: die wachten op jouw antwoord.
function mailsOnbeantwoord(max, minDagen) {
  if (!mijnMailbox()) return [];  // v3.3: de backend leest alleen de mailbox van zijn eigenaar; anderen zien die nooit
  minDagen = minDagen || 2;
  return metCache('mails-' + max + '-' + minDagen, 300, function () { return zoekMailsOnbeantwoord(max, minDagen); });
}
function zoekMailsOnbeantwoord(max, minDagen) {
  try {
    var mij = Session.getEffectiveUser().getEmail().toLowerCase(), uit = [];
    var threads = GmailApp.search('in:inbox -in:chats -category:promotions -category:social newer_than:21d', 0, 40);
    threads.forEach(function (t) {
      if (uit.length >= max) return;
      var msgs = t.getMessages(), laatste = msgs[msgs.length - 1], van = String(laatste.getFrom() || '');
      if (van.toLowerCase().indexOf(mij) >= 0) return;
      var dagen = Math.floor((Date.now() - laatste.getDate().getTime()) / 86400000);
      if (dagen < minDagen) return;
      uit.push({ onderwerp: t.getFirstMessageSubject() || '(geen onderwerp)', van: naamUitAdres(van), dagen: dagen, threadId: t.getId(), link: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(mij) + '#all/' + t.getId() });  // authuser: het juiste account, ook in de in-app browser
    });
    return uit;
  } catch (e) { return []; }
}
function agendaVoorDag(dag) {
  if (!mijnMailbox()) return [];  // v3.3
  try {
    return CalendarApp.getDefaultCalendar().getEventsForDay(dag).map(function (ev) {
      var heleDag = ev.isAllDayEvent();
      return { tijd: heleDag ? 'dag' : Utilities.formatDate(ev.getStartTime(), tz(), 'HH:mm'), titel: ev.getTitle(), duurMin: heleDag ? 0 : Math.round((ev.getEndTime().getTime() - ev.getStartTime().getTime()) / 60000) };
    });
  } catch (e) { return []; }
}

/* ===================== 2. Bedrijfsbrein: elk contract, elke werkwijze en elk schooldossier op één plek ===================== */

function apiKennisbank() {
  var docs = lees('Documenten', true), tellingen = {};
  DOC_TYPES.forEach(function (t) { tellingen[t] = 0; });
  docs.forEach(function (d) { var t = DOC_TYPES.indexOf(d.type) >= 0 ? d.type : 'overig'; tellingen[t]++; });
  docs.sort(function (a, b) { return String(b.gewijzigd).localeCompare(String(a.gewijzigd)); });
  return {
    tellingen: tellingen,
    documenten: docs.map(function (d) { return { id: d.id, titel: d.titel, type: d.type, school: d.school, url: d.url, gewijzigd: d.gewijzigd, woorden: Number(d.woorden) || 0 }; }),
    laatsteIndex: P.getProperty('LAATSTE_INDEX') || '', mapUrl: mapUrl()
  };
}
function apiIndexeer() { return metLock(indexeerDocumenten); }
function indexeerTrigger() { try { metLock(indexeerDocumenten); } catch (e) { Logger.log('Indexeren mislukt: ' + e); } }  // v1.1: ook de trigger onder de lock

function indexeerDocumenten() {
  var mapId = P.getProperty('DRIVE_MAP_ID'); if (!mapId) throw new Error('Geen documentenmap — draai setup().');
  var bestaand = {}, gezien = {}, scholen = lees('Scholen').map(function (s) { return s.naam; });
  lees('Documenten', true).forEach(function (d) { bestaand[d.driveId] = d; });
  var stats = { aantal: 0, nieuw: 0, bijgewerkt: 0, verwijderd: 0 }, teSchrijven = [], correcties = instelling('documentCorrecties') || {};  // v3.7
  function loop(folder, typeHint, diepte) {
    if (diepte > 4) return;
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next(), id = f.getId();
      gezien[id] = true; stats.aantal++;
      var gewijzigd = datumTijdStr(f.getLastUpdated()), oud = bestaand[id];
      if (oud && oud.gewijzigd === gewijzigd) continue;
      var tekst = tekstVanBestand(f) || '';
      teSchrijven.push({ id: oud ? oud.id : undefined, titel: f.getName(), type: typeHint || raadType(f.getName()) || 'overig', school: raadSchool(f.getName() + ' ' + tekst.slice(0, 3000), scholen),
        url: f.getUrl(), driveId: id, gewijzigd: gewijzigd, woorden: tekst ? tekst.split(/\s+/).length : 0, tekst: tekst.slice(0, 45000) });
      var corr = correcties[id]; if (corr) { var laatst = teSchrijven[teSchrijven.length - 1]; if (corr.type) laatst.type = corr.type; if (corr.school !== undefined) laatst.school = corr.school; }
      if (oud) stats.bijgewerkt++; else stats.nieuw++;
    }
    var sub = folder.getFolders();
    while (sub.hasNext()) { var s = sub.next(); loop(s, typeHint || raadType(s.getName()), diepte + 1); }
  }
  loop(DriveApp.getFolderById(mapId), '', 0);
  schrijfVeel('Documenten', teSchrijven);
  stats.verwijderd = verwijderRijen('Documenten', function (d) { return !gezien[d.driveId]; });
  P.setProperty('LAATSTE_INDEX', nu());
  return stats;
}
function raadType(naam) {
  var n = String(naam).toLowerCase();
  if (/contract|overeenkomst|addendum|getekend/.test(n)) return 'contract';
  if (/werkwijze|protocol|handleiding|sop|proces|instructie|checklist/.test(n)) return 'werkwijze';
  if (/dossier|schooldossier|overdracht|evaluatie/.test(n)) return 'schooldossier';
  if (/voorstel|offerte|prijsopgave/.test(n)) return 'voorstel';
  if (/prijs|tarie/.test(n)) return 'prijslijst';
  return '';
}
function raadSchool(tekst, scholen) {
  var t = String(tekst).toLowerCase(), hit = '';
  scholen.forEach(function (s) { if (s && !hit && t.indexOf(String(s).toLowerCase()) >= 0) hit = s; });
  return hit;
}
function tekstVanBestand(f) {
  var mime = f.getMimeType();
  try {
    if (mime === MimeType.GOOGLE_DOCS) return DocumentApp.openById(f.getId()).getBody().getText();
    if (mime === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(f.getId()).getSheets().slice(0, 3).map(function (b) {
        return b.getName() + '\n' + b.getDataRange().getValues().slice(0, 150).map(function (r) { return r.join(' | '); }).join('\n');
      }).join('\n\n');
    }
    if (mime === MimeType.PLAIN_TEXT || mime === MimeType.CSV || mime === 'text/markdown') return f.getBlob().getDataAsString('UTF-8');
    if (mime === MimeType.PDF || mime === MimeType.MICROSOFT_WORD || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return tekstViaConversie(f);
  } catch (e) { Logger.log('Geen tekst uit ' + f.getName() + ': ' + e); }
  return '';
}
// PDF's en Word-bestanden: tijdelijk omzetten naar een Google Doc (met OCR) en de tekst lezen. Vereist Services → Drive API.
function tekstViaConversie(f) {
  if (typeof Drive === 'undefined') return '';
  var naam = 'tmp-athena-' + f.getName(), kopie;
  if (Drive.Files.create) kopie = Drive.Files.copy({ name: naam, mimeType: MimeType.GOOGLE_DOCS }, f.getId(), { ocrLanguage: 'nl' });       // Drive API v3
  else kopie = Drive.Files.copy({ title: naam, mimeType: MimeType.GOOGLE_DOCS }, f.getId(), { ocr: true, ocrLanguage: 'nl' });               // Drive API v2
  var tekst = '';
  try { tekst = DocumentApp.openById(kopie.id).getBody().getText(); }
  finally { try { DriveApp.getFileById(kopie.id).setTrashed(true); } catch (e) {} }
  return tekst;
}

function apiVraag(vraag) {
  vraag = String(vraag || '').trim(); if (!vraag) throw new Error('Geen vraag.');
  var top = relevanteDocumenten(vraag, lees('Documenten'), 6);
  var context = top.map(function (d, i) {
    return '<document nr="' + (i + 1) + '" titel="' + xmlAttr(d.titel) + '" type="' + xmlAttr(d.type) + '"' + (d.school ? ' school="' + xmlAttr(d.school) + '"' : '') + '>\n' + String(d.tekst || '').slice(0, 9000) + '\n</document>';
  }).join('\n\n');
  var systeem = 'Je bent Athena, het bedrijfsbrein van AthenaSchool (onderwijsondersteuning voor scholen). Je beantwoordt vragen van Menno, ' +
    'de eigenaar, over contracten, werkwijzen, schooldossiers, voorstellen, prijzen, lopende trajecten en kansen. Antwoord in het Nederlands, kort en concreet, ' +
    'zoals een goed ingewerkte collega dat zou doen. Gebruik alleen de meegegeven documenten en bedrijfsgegevens; verwijs naar een document met zijn nummer tussen ' +
    'blokhaken, bijvoorbeeld [2]. Staat het antwoord er niet in, zeg dat dan eerlijk en noem wat er wél bekend is. Noem nooit namen van leerlingen. ' +
    'Sluit af met een aparte laatste regel "BRONNEN: " gevolgd door de nummers van de gebruikte documenten, of "BRONNEN: geen".';
  var invoer = (context ? 'Documenten:\n' + context + '\n\n' : 'Er zijn nog geen documenten geïndexeerd.\n\n') + 'Bedrijfsgegevens (uit de Sheet):\n' + feitenSamenvatting() + '\n\nVraag van Menno: ' + vraag;
  var antwoord = claude(systeem, invoer, 16000), gebruikt = [];
  var m = antwoord.match(/\n?BRONNEN:\s*(.*)$/i);
  if (m) {
    antwoord = antwoord.replace(/\n?BRONNEN:\s*.*$/i, '').trim();
    (m[1].match(/\d+/g) || []).forEach(function (n) { var d = top[Number(n) - 1]; if (d && gebruikt.indexOf(d) < 0) gebruikt.push(d); });
  }
  return { antwoord: antwoord, bronnen: gebruikt.map(function (d) { return { titel: d.titel, url: d.url, type: d.type }; }) };
}
var STOPWOORDEN = 'de het een en of van voor met bij op in is zijn wat welke welk hoe wie waar wanneer waarom hoeveel over aan uit naar dat die dit deze er ook nog wel niet om als te ik je we wij ze hun onze mijn'.split(' ');
function termen(s) {
  return zonderAccenten(String(s).toLowerCase()).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && STOPWOORDEN.indexOf(w) < 0; });
}
function relevanteDocumenten(vraag, docs, max) {
  var ts = uniek(termen(vraag)); if (!ts.length) return docs.slice(0, max);
  var gescoord = docs.map(function (d) {
    var titel = zonderAccenten(String(d.titel + ' ' + d.school).toLowerCase()), tekst = zonderAccenten(String(d.tekst || '').toLowerCase()), score = 0;
    ts.forEach(function (t) {
      if (titel.indexOf(t) >= 0) score += 4;
      var n = 0, p = tekst.indexOf(t);
      while (p >= 0 && n < 6) { n++; p = tekst.indexOf(t, p + t.length); }
      score += n;
    });
    return { d: d, score: score };
  }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; });
  return gescoord.slice(0, max).map(function (x) { return x.d; });
}
function feitenSamenvatting() {
  var regels = [], trajecten = lees('Trajecten'), kansen = lees('Kansen').filter(kansOpen), scholen = lees('Scholen');
  regels.push('Schooljaar nu: ' + huidigSchooljaar() + '. Scholen in de administratie: ' + scholen.length + '.');
  regels.push('Trajecten (' + trajecten.length + '):');
  trajecten.slice(0, 120).forEach(function (t) {
    regels.push('- ' + t.school + (t.plaats ? ' (' + t.plaats + ')' : '') + ': ' + t.traject + ', ' + t.schooljaar + ', ' + t.status + (t.urenPerWeek ? ', ' + t.urenPerWeek + ' u/wk' : '') +
      (t.tarief ? ', tarief ' + t.tarief : '') + (t.omzet ? ', omzet ' + t.omzet : '') + (t.contactpersoon ? ', contact ' + t.contactpersoon : '') + (t.am ? ', AM ' + t.am : '') + (t.samenvatting ? '. ' + String(t.samenvatting).slice(0, 160) : ''));
  });
  regels.push('Open kansen (' + kansen.length + '):');
  kansen.slice(0, 40).forEach(function (k) { regels.push('- ' + k.school + ': ' + k.traject + ', fase ' + k.fase + (k.waarde ? ', waarde ' + k.waarde : '') + (k.volgendeActie ? ', volgende actie: ' + k.volgendeActie : '') + (k.deadline ? ' (' + k.deadline + ')' : '')); });
  return regels.join('\n').slice(0, 12000);
}

/* ===================== 3. Nachtelijke review: wat is gedaan, wat is blijven liggen, wat vraagt vandaag aandacht ===================== */

function apiReview() {
  var rs = lees('Reviews').filter(vanMijReview).sort(function (a, b) { return String(b.gemaaktOp).localeCompare(String(a.gemaaktOp)); });
  return { laatste: rs[0] ? reviewUit(rs[0]) : null, eerdere: rs.slice(1, 15).map(function (r) { var u = reviewUit(r); return { id: u.id, datum: u.datum, gemaaktOp: u.gemaaktOp, samenvatting: u.samenvatting, tellingen: u.tellingen }; }) };
}
function apiReviewNu() { return metLock(function () { return reviewUit(nachtelijkeReview()); }); }
// v3.3: een review per gebruiker. De eigenaar van het script krijgt er mail en agenda bij; anderen (nog) niet, tot hun Gmail gekoppeld is.
function vanMijReview(r) { return r.eigenaar ? String(r.eigenaar) === ikNaam() : mijnMailbox(); }
function nachtelijkeReviewTrigger() {
  try { var r = metLock(nachtelijkeReview); if (P.getProperty('RAPPORT_EMAIL')) mailRapport(reviewUit(r), P.getProperty('RAPPORT_EMAIL')); }  // v1.1: ook de trigger onder de lock
  catch (e) { Logger.log('Review mislukt: ' + e); }
  lees('Gebruikers').filter(actief).forEach(function (g) {
    if (!g.naam || g.naam === ikNaam()) return;
    GEBRUIKER = { id: g.id, naam: g.naam, email: g.email, rol: rolVan(g.rol) };
    try { var r2 = metLock(nachtelijkeReview); if (g.email) mailRapport(reviewUit(r2), g.email); }
    catch (e2) { Logger.log('Review ' + g.naam + ' mislukt: ' + e2); }
  });
  GEBRUIKER = null;
}
function reviewUit(r) {
  var lees_ = function (v) { try { return typeof v === 'string' ? JSON.parse(v || '[]') : (v || []); } catch (e) { return []; } };
  var gedaan = lees_(r.gedaan), blijven = lees_(r.blijvenLiggen), vandaag = lees_(r.vandaag);
  return { id: r.id, datum: String(r.datum).slice(0, 10), gemaaktOp: r.gemaaktOp, samenvatting: r.samenvatting, gedaan: gedaan, blijvenLiggen: blijven, vandaag: vandaag,
    tellingen: { gedaan: gedaan.length, blijvenLiggen: blijven.length, vandaag: vandaag.length } };
}

function nachtelijkeReview() {
  var nuD = new Date(), grens = new Date(nuD.getTime() - 86400000);
  var dag = nuD.getHours() >= 15 ? plusDagen(1) : nuD;   // 's avonds gaat de review over morgen, overdag over vandaag
  var dagStr = datumStr(dag);
  var acties = lees('Acties'), kansen = lees('Kansen'), trajecten = lees('Trajecten'), docs = lees('Documenten', true), mp = mijlpaalMap();
  // v3.3: alleen het eigen werk; de eigenaar van het script houdt het volledige overzicht (en zijn mail en agenda)
  var eigen = mijnMailbox();
  acties = acties.filter(function (a) { return vanMij(a.eigenaar); });
  if (!eigen) {
    kansen = kansen.filter(function (k) { return k.eigenaar === ikNaam(); });
    trajecten = trajecten.filter(function (t) { return t.am === ikNaam(); });
    docs = [];
  }
  var gedaan = [], blijven = [], vandaag = [];
  var naGrens = function (s) { var d = parseDatum(s); return d && d.getTime() >= grens.getTime(); };

  acties.filter(function (a) { return a.status === 'af' && naGrens(a.afgerond); }).forEach(function (a) { gedaan.push({ tekst: a.tekst, bron: 'actie' }); });
  if (eigen) try {
    var verzonden = GmailApp.search('from:me newer_than:1d', 0, 30);
    if (verzonden.length) gedaan.push({ tekst: verzonden.length + ' mail' + (verzonden.length === 1 ? '' : 's') + ' verstuurd' + (verzonden.length <= 3 ? ': ' + verzonden.map(function (t) { return t.getFirstMessageSubject(); }).join(' · ') : ''), bron: 'mail' });
  } catch (e) {}
  docs.filter(function (d) { return naGrens(d.gewijzigd); }).forEach(function (d) { gedaan.push({ tekst: 'Document bijgewerkt: ' + d.titel, bron: 'document' }); });
  kansen.filter(function (k) { return naGrens(k.laatsteContact) || naGrens(k.bijgewerkt); }).forEach(function (k) { gedaan.push({ tekst: 'Kans ' + k.school + ' (' + k.traject + ') bijgewerkt — fase ' + k.fase, bron: 'kans' }); });
  trajecten.filter(function (t) { return naGrens(t.bijgewerkt); }).forEach(function (t) { gedaan.push({ tekst: 'Traject ' + t.school + ' (' + t.traject + ') bijgewerkt — ' + t.status, bron: 'traject' }); });

  acties.filter(function (a) { return a.status !== 'af' && a.deadline && a.deadline < dagStr; }).forEach(function (a) { blijven.push({ tekst: a.tekst, bron: 'actie', dagen: dagenSinds(a.deadline) }); });
  kansen.filter(kansOpen).forEach(function (k) {
    var stil = k.laatsteContact ? dagenSinds(k.laatsteContact) : null;
    var norm = mp[k.fase] && mp[k.fase].dagenNorm ? mp[k.fase].dagenNorm : 7;  // v2.0: norm per mijlpaal
    if (stil !== null && stil > norm) blijven.push({ tekst: 'Kans ' + k.school + ' (' + (k.naam || k.traject) + '): ' + stil + ' dagen geen contact' + (k.eigenaar ? ' — ' + k.eigenaar : '') + (k.volgendeActie ? ' — ' + k.volgendeActie : ''), bron: 'kans', dagen: stil });
    else if (k.deadline && k.deadline < dagStr) blijven.push({ tekst: 'Kans ' + k.school + ': deadline ' + k.deadline + ' verstreken' + (k.volgendeActie ? ' — ' + k.volgendeActie : ''), bron: 'kans', dagen: dagenSinds(k.deadline) });
  });
  mailsOnbeantwoord(10, 3).forEach(function (m) { blijven.push({ tekst: 'Mail van ' + m.van + ' onbeantwoord: ' + m.onderwerp, bron: 'mail', dagen: m.dagen, link: m.link }); });
  trajecten.filter(function (t) { return t.status === 'offerte' && dagenSinds(t.bijgewerkt) > 14; }).forEach(function (t) { blijven.push({ tekst: 'Offerte ' + t.school + ' (' + t.traject + ') wacht al ' + dagenSinds(t.bijgewerkt) + ' dagen', bron: 'traject', dagen: dagenSinds(t.bijgewerkt) }); });

  agendaVoorDag(dag).forEach(function (a) { vandaag.push({ tekst: (a.tijd === 'dag' ? 'Hele dag' : a.tijd) + ' · ' + a.titel, bron: 'agenda' }); });
  acties.filter(function (a) { return a.status !== 'af' && a.deadline === dagStr; }).forEach(function (a) { vandaag.push({ tekst: 'Deadline: ' + a.tekst, bron: 'actie' }); });
  kansen.filter(function (k) { return kansOpen(k) && k.deadline && k.deadline >= dagStr && dagenTot(k.deadline) <= 3; }).forEach(function (k) { vandaag.push({ tekst: 'Kans ' + k.school + ': ' + (k.volgendeActie || 'opvolgen') + ' (uiterlijk ' + k.deadline + ')', bron: 'kans' }); });
  trajecten.filter(function (t) { return t.start && t.start >= dagStr && dagenTot(t.start) <= 7; }).forEach(function (t) { vandaag.push({ tekst: 'Start ' + t.school + ' (' + t.traject + ') op ' + t.start, bron: 'traject' }); });

  var review = { datum: dagStr, gemaaktOp: nu(), gedaan: gedaan, blijvenLiggen: blijven, vandaag: vandaag };
  review.samenvatting = samenvattingReview(review);
  return schrijf('Reviews', { datum: review.datum, gemaaktOp: review.gemaaktOp, samenvatting: review.samenvatting, gedaan: gedaan, blijvenLiggen: blijven, vandaag: vandaag, eigenaar: ikNaam() });
}
function samenvattingReview(r) {
  var naam = String(ikNaam()).split(' ')[0];  // v3.3: de gebruiker van deze review
  var basis = 'Goedemorgen ' + naam + '. De afgelopen dag: ' + r.gedaan.length + ' ' + (r.gedaan.length === 1 ? 'ding' : 'dingen') + ' gedaan. ' +
    (r.blijvenLiggen.length ? 'Blijven liggen: ' + r.blijvenLiggen.length + ' punt' + (r.blijvenLiggen.length === 1 ? '' : 'en') + ', te beginnen met: ' + r.blijvenLiggen[0].tekst + '. ' : 'Niets is blijven liggen. ') +
    (r.vandaag.length ? 'Vandaag vraagt ' + r.vandaag.length + ' ' + (r.vandaag.length === 1 ? 'punt' : 'punten') + ' je aandacht.' : 'Vandaag staat er niets vast in de agenda.');
  if (!P.getProperty('ANTHROPIC_API_KEY')) return basis;
  try {
    var systeem = 'Je bent Athena, de assistent van ' + naam + ' (' + ({ beheerder: 'management', adviseur: 'onderwijsadviseur', am: 'accountmanager' }[ikUit().rol] || 'medewerker') + ' bij AthenaSchool, onderwijsondersteuning voor scholen). Schrijf in het Nederlands, warm en nuchter, zonder uitroeptekens of emoji.';
    var invoer = 'Schrijf een ochtendbriefing van 3 tot 5 zinnen, beginnend met "Goedemorgen ' + naam + '." Benoem wat gisteren is gedaan, wat is blijven liggen (met het belangrijkste punt) en wat vandaag aandacht vraagt. Geen opsommingstekens, alleen lopende tekst.\n\n' +
      'Gedaan:\n' + (r.gedaan.map(function (x) { return '- ' + x.tekst; }).join('\n') || '- niets geregistreerd') + '\n\nBlijven liggen:\n' + (r.blijvenLiggen.map(function (x) { return '- ' + x.tekst; }).join('\n') || '- niets') +
      '\n\nVandaag:\n' + (r.vandaag.map(function (x) { return '- ' + x.tekst; }).join('\n') || '- niets vast');
    return claude(systeem, invoer, 2000, 'low') || basis;
  } catch (e) { return basis; }
}
function mailRapport(r, naar) {
  var h = huisstijl(); if (!naar) return;
  var lijst = function (items, leeg) { return items.length ? '<ul style="padding-left:18px;margin:6px 0 14px">' + items.map(function (x) { return '<li style="margin:3px 0">' + escHtml(x.tekst) + (x.dagen ? ' <span style="color:#9A8FA0">(' + x.dagen + ' d)</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p style="color:#9A8FA0;margin:4px 0 14px">' + leeg + '</p>'; };
  var kop = function (t) { return '<h3 style="margin:16px 0 4px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:' + h.kleur_primair + '">' + t + '</h3>'; };
  var html = '<div style="font-family:' + h.lettertype_tekst + ',Arial,sans-serif;max-width:620px;margin:0 auto;color:' + h.kleur_tekst + '">' +
    '<div style="background:' + h.kleur_primair + ';color:#fff;padding:18px 22px;border-bottom:4px solid ' + h.kleur_accent + '"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Athena Assistent · nachtelijke review</div><div style="font-size:22px;font-weight:700;margin-top:4px">' + escHtml(datumLang(parseDatum(r.datum) || new Date())) + '</div></div>' +
    '<div style="padding:18px 22px"><p style="font-size:16px;line-height:1.55">' + escHtml(r.samenvatting) + '</p>' +
    kop('Gedaan') + lijst(r.gedaan, 'Niets geregistreerd.') + kop('Blijven liggen') + lijst(r.blijvenLiggen, 'Niets — mooi.') + kop('Vandaag aandacht') + lijst(r.vandaag, 'Niets vast.') +
    '<p style="font-size:12px;color:#9A8FA0;margin-top:20px">Open de app voor de details en om acties af te vinken.</p></div></div>';
  MailApp.sendEmail({ to: naar, subject: 'Athena · dagstart ' + r.datum + ' — ' + r.blijvenLiggen.length + ' blijven liggen, ' + r.vandaag.length + ' vandaag', htmlBody: html, name: 'Athena Assistent' });
}

/* ===================== 4. Huisstijl-kit: posts en mails in de stijl en kleuren van AthenaSchool ===================== */

var HUISSTIJL_STANDAARD = {
  bedrijf: 'AthenaSchool',
  omschrijving: 'AthenaSchool levert onderwijsondersteuning aan scholen: onderwijsondersteuners, studentdocenten, huiswerkbegeleiding, examentraining, NT2-ondersteuning, surveillance en basisvaardigheden. Vaste gezichten, opgeleid via de AthenaAcademy, met een VOG en zonder verborgen kosten.',
  kleur_primair: '#66306E', kleur_accent: '#FAA11B', kleur_secundair: '#5D0095', kleur_tekst: '#241A28', kleur_achtergrond: '#FBF9F6',
  lettertype_kop: 'Nunito', lettertype_tekst: 'Nunito', lettertype_alternatief: 'Arial',
  logo_url: '',
  toon: 'Warm en professioneel, in de wij-vorm.\nConcreet: wat we doen, voor wie, en wat het de school oplevert.\nGeen jargon, geen superlatieven, geen uitroeptekens.\nDe school en de leerling staan centraal, niet wij.\nKorte zinnen, actieve vorm, Nederlands.',
  zinnen: 'Vast gezicht | Onderwijsondersteuning wordt beter wanneer docenten, ondersteuner en leerlingen elkaar kennen. We koppelen een vaste ondersteuner aan de school, met een vaste vervanger bij afwezigheid.\n' +
          'Opleiding | Alle medewerkers volgen een opleiding in onze online omgeving, de AthenaAcademy: klassenmanagement, communicatie in de klas, presentatievaardigheden en metacognitie.\n' +
          'Evaluatie | Aan het eind van elke periode vindt een evaluatiegesprek plaats om de kwaliteit van de ondersteuning nóg hoger te krijgen.\n' +
          'VOG | Onze medewerkers zijn in het bezit van een Verklaring Omtrent het Gedrag.\n' +
          'Geen verborgen kosten | De tarieven op de facturen zijn hetzelfde als op de offerte. Alle diensten zijn vrijgesteld van btw.'
};
var CONTENT_TYPES = {
  linkedin:    { naam: 'LinkedIn-post', instructie: 'Schrijf een LinkedIn-post van 80 tot 140 woorden namens AthenaSchool. Eén sterke openingszin, één concreet voorbeeld of inzicht, en een rustige afsluiting. Maximaal drie hashtags, alleen aan het eind. Geen emoji-opsomming.' },
  mail:        { naam: 'E-mail aan een school', instructie: 'Schrijf een korte e-mail (120 tot 200 woorden) aan een contactpersoon van een school. Eerste regel: "Onderwerp: ...". Aanhef "Beste [naam],". Sluit af met "Met vriendelijke groet," en daaronder "Menno Adan" en "AthenaSchool".' },
  nieuwsbrief: { naam: 'Nieuwsbriefitem', instructie: 'Schrijf een nieuwsbriefitem van 100 tot 160 woorden: een kop op de eerste regel, daarna de tekst, en één duidelijke call-to-action als laatste zin.' },
  vacature:    { naam: 'Vacaturetekst', instructie: 'Schrijf een vacaturetekst van 200 tot 300 woorden voor studenten en starters: kop, wat je doet, wat we vragen, wat we bieden, hoe je reageert. Kopjes op eigen regels.' },
  voorstel:    { naam: 'Intro voor een samenwerkingsvoorstel', instructie: 'Schrijf de inleidende alinea "Hulpvraag" (80 tot 140 woorden) van een samenwerkingsvoorstel: de situatie van de school, de vraag, en wat AthenaSchool voorstelt. Geen prijzen, geen namen van leerlingen.' }
};
function huisstijl() {
  var h = {}; Object.keys(HUISSTIJL_STANDAARD).forEach(function (k) { h[k] = HUISSTIJL_STANDAARD[k]; });
  lees('Huisstijl').forEach(function (r) { if (r.sleutel && r.waarde !== '') h[r.sleutel] = String(r.waarde); });
  return h;
}
function apiHuisstijl() {
  var h = huisstijl();
  var recent = lees('Content').sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).slice(0, 12);
  return {
    velden: h,
    kleuren: [{ naam: 'Paars', hex: h.kleur_primair, gebruik: 'primair' }, { naam: 'Oranje', hex: h.kleur_accent, gebruik: 'accent' }, { naam: 'Diep paars', hex: h.kleur_secundair, gebruik: 'secundair' }, { naam: 'Inkt', hex: h.kleur_tekst, gebruik: 'tekst' }, { naam: 'Achtergrond', hex: h.kleur_achtergrond, gebruik: 'achtergrond' }],
    toon: h.toon.split('\n').filter(Boolean),
    zinnen: h.zinnen.split('\n').filter(Boolean).map(function (z) { var p = z.split('|'); return { titel: (p[0] || '').trim(), tekst: p.slice(1).join('|').trim() }; }),
    types: Object.keys(CONTENT_TYPES).map(function (k) { return { id: k, naam: CONTENT_TYPES[k].naam }; }),
    recent: recent.map(function (c) { return { id: c.id, datum: c.datum, type: c.type, typeNaam: (CONTENT_TYPES[c.type] || {}).naam || c.type, onderwerp: c.onderwerp, tekst: c.tekst, door: c.door || '', magWijzigen: isBeheerder() || c.door === ikNaam() }; }),
    magBewerken: isBeheerder()  // v3.7
  };
}
function apiZetHuisstijl(sleutel, waarde) {
  alleenBeheerder();  // v2.0
  metLock(function () { zetHuisstijlVeld(sleutel, waarde); });  // v3.7: zie zetHuisstijlVeld
  return null;
}
function apiMaakContent(type, onderwerp, extra) {
  var t = CONTENT_TYPES[type]; if (!t) throw new Error('Onbekend contenttype.');
  onderwerp = String(onderwerp || '').trim(); if (!onderwerp) throw new Error('Geef een onderwerp.');
  var h = huisstijl();
  var systeem = 'Je schrijft teksten namens ' + h.bedrijf + '. Over het bedrijf: ' + h.omschrijving + '\n\nToon en stijl:\n' + h.toon +
    '\n\nStandaardzinnen die je mag gebruiken waar ze passen (niet geforceerd):\n' + h.zinnen + '\n\nSchrijf in het Nederlands. Lever alleen de gevraagde tekst, zonder toelichting, zonder aanhalingstekens eromheen.';
  var invoer = t.instructie + '\n\nOnderwerp: ' + onderwerp + (extra ? '\nExtra context van Menno: ' + String(extra).trim() : '');
  var tekst = claude(systeem, invoer, 4000);
  var c = metLock(function () { return schrijf('Content', { datum: nu(), type: type, onderwerp: onderwerp, tekst: tekst, door: ikNaam() }); });
  return { id: c.id, datum: c.datum, type: type, typeNaam: t.naam, onderwerp: onderwerp, tekst: tekst };
}

/* ===================== 5. Geschiedenis: elke schoolopdracht doorzoekbaar ===================== */

function apiTrajecten() {
  var ts = lees('Trajecten').sort(function (a, b) { return String(b.start || b.schooljaar).localeCompare(String(a.start || a.schooljaar)); });
  return {
    trajecten: ts.map(trajectUit),
    filters: { schooljaren: uniek(ts.map(function (t) { return t.schooljaar; })).sort().reverse(), trajecten: uniek(ts.map(function (t) { return t.traject; })).sort(), statussen: trajectStatussen() }
  };
}
function apiTraject(id) {
  var t = vind('Trajecten', id); if (!t) throw new Error('Traject niet gevonden.');
  var school = String(t.school).toLowerCase(), acts = lees('Activiteiten'), gekopieerd = {};
  acts.forEach(function (a) { if (/^nt-/.test(a.id)) gekopieerd[String(a.id).slice(3)] = true; });  // v2.0: door crmInrichten() overgezette notities niet dubbel tonen
  return {
    traject: trajectUit(t),
    documenten: lees('Documenten', true).filter(function (d) { return (d.school && String(d.school).toLowerCase() === school) || String(d.titel).toLowerCase().indexOf(school) >= 0; }).map(function (d) { return { id: d.id, titel: d.titel, type: d.type, url: d.url, gewijzigd: d.gewijzigd }; }),
    // v2.0: notities staan sinds het CRM in Activiteiten (oude rijen in Notities blijven zichtbaar)
    notities: lees('Notities').filter(function (n) { return !gekopieerd[n.id]; }).concat(acts.filter(function (a) { return a.trajectId; })).filter(function (n) { return String(n.trajectId) === String(id); })
      .sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).map(function (n) { return { id: n.id, soort: n.type ? 'activiteit' : 'notitie', door: n.door || '', onderwerp: n.type ? n.onderwerp || '' : '', ruw: n.tekst || '', datum: n.datum, tekst: n.onderwerp && n.tekst ? n.onderwerp + ' — ' + n.tekst : (n.tekst || n.onderwerp) }; }),  // v3.7: soort voor bewerken/verwijderen
    kansen: lees('Kansen').filter(function (k) { return (t.schoolId && String(k.schoolId) === String(t.schoolId)) || String(k.school).toLowerCase() === school; }).map(kansUit),
    school: lees('Scholen').filter(function (s) { return (t.schoolId && String(s.id) === String(t.schoolId)) || String(s.naam).toLowerCase() === school; }).map(function (s) { return { id: s.id, naam: s.naam, plaats: s.plaats, contactpersoon: s.contactpersoon, email: s.email, telefoon: s.telefoon, status: s.status, am: s.eigenaar || s.am }; })[0] || null
  };
}
function apiTrajectOpslaan(obj) {
  obj = obj || {};
  var velden = ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting', 'schoolId',
    'kansId', 'adviseur', 'soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer'], schoon = {};  // v3.8
  velden.forEach(function (k) { if (obj[k] !== undefined) schoon[k] = obj[k]; });
  if (schoon.schoolId) { var sch = vind('Scholen', schoon.schoolId); if (!sch) throw new Error('School niet gevonden.'); schoon.school = sch.naam; if (!schoon.plaats) schoon.plaats = sch.plaats || ''; }  // v3.7: project aan een CRM-school koppelen
  if (!String(schoon.school || '').trim() && !schoon.id) throw new Error('School is verplicht.');
  if (schoon.status && trajectStatussen().indexOf(schoon.status) < 0) throw new Error('Onbekende status.');
  [['soortFacturatie', 'soortFacturatie'], ['gefactureerd', 'gefactureerd'], ['vakanties', 'vakanties']].forEach(function (x) {  // v3.8
    if (schoon[x[0]] && keuzelijst(x[1]).indexOf(schoon[x[0]]) < 0) throw new Error('Onbekende waarde voor ' + x[0] + '.');
  });
  if (!schoon.id && !schoon.schooljaar) schoon.schooljaar = huidigSchooljaar();
  var t = metLock(function () { controleerConflict('Trajecten', schoon.id, schoon, obj._oud); return schrijf('Trajecten', schoon); });  // v3.3
  return trajectUit(t);
}
function apiNotitieToevoegen(trajectId, tekst) {
  tekst = String(tekst || '').trim(); if (!tekst) throw new Error('Geen tekst.');
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Traject niet gevonden.');
  // v2.0: naar Activiteiten, zodat de notitie ook in de tijdlijn van de school staat
  var n = metLock(function () { return schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), trajectId: trajectId, schoolId: t.schoolId || '', tekst: tekst, bron: 'app', aangemaakt: nu() }); });
  return { id: n.id, soort: 'activiteit', door: n.door, datum: n.datum, tekst: n.tekst };
}
function trajectUit(t) {
  return { id: t.id, schoolId: t.schoolId || '', school: t.school, plaats: t.plaats, traject: t.traject, schooljaar: t.schooljaar, start: t.start, eind: t.eind, status: t.status, ondersteuners: t.ondersteuners,
    urenPerWeek: Number(t.urenPerWeek) || 0, tarief: Number(t.tarief) || 0, omzet: Number(t.omzet) || 0, contactpersoon: t.contactpersoon, am: t.am, samenvatting: t.samenvatting, bijgewerkt: t.bijgewerkt,
    kansId: t.kansId || '', adviseur: t.adviseur || '', soortFacturatie: t.soortFacturatie || '', gefactureerd: t.gefactureerd || '', factuurDatum: t.factuurDatum || '', vakanties: t.vakanties || '',
    bijzonderheden: t.bijzonderheden || '', factuurnummer: t.factuurnummer || '' };  // v3.8
}

/* ===================== 6. CRM: scholen, personen, kansen, taken, tracks, historie en rapportage (v2.0: vervangt Capsule) ===================== */

var SCHOOL_STATUSSEN = ['lead', 'prospect', 'klant', 'oud-klant'];
var ACTIVITEIT_TYPES = ['notitie', 'gesprek', 'mail', 'afspraak'];   // handmatig te loggen; 'fase' en 'taak' schrijft de backend zelf
var TAAK_CATEGORIEEN = ['bellen', 'mailen', 'afspraak', 'voorstel', 'opvolgen', 'overig'];
var DOEL_METRICS = ['gesprekken', 'mails', 'afspraken', 'nieuweKansen', 'voorstellen', 'gewonnen', 'gewonnenWaarde'];
var DOEL_PERIODES = ['week', 'maand', 'kwartaal'];
var STANDAARD_MIJLPALEN = [
  { mijlpaal: 'lead', kans: 10, dagenNorm: 14 }, { mijlpaal: 'gesprek', kans: 25, dagenNorm: 10 },
  { mijlpaal: 'voorstel', kans: 50, dagenNorm: 7 }, { mijlpaal: 'onderhandeling', kans: 75, dagenNorm: 7 }
];
var STANDAARD_TRACKS = [
  { id: 'std-lead', naam: 'Nieuwe lead opvolgen', omschrijving: 'Van eerste contact naar een kennismakingsgesprek.', stappen: [
    { tekst: 'Kennismakingsmail sturen', categorie: 'mailen', dagenNaStart: 0, prio: 'hoog' }, { tekst: 'Nabellen na de kennismakingsmail', categorie: 'bellen', dagenNaStart: 3, prio: 'midden' },
    { tekst: 'Kennismakingsgesprek inplannen', categorie: 'afspraak', dagenNaStart: 7, prio: 'midden' }, { tekst: 'Lead beoordelen: doorgaan of parkeren', categorie: 'opvolgen', dagenNaStart: 21, prio: 'laag' }] },
  { id: 'std-voorstel', naam: 'Voorstel opvolgen', omschrijving: 'Na het versturen van een samenwerkingsvoorstel.', stappen: [
    { tekst: 'Voorstel nabellen', categorie: 'bellen', dagenNaStart: 3, prio: 'hoog' }, { tekst: 'Vragen over het voorstel beantwoorden', categorie: 'mailen', dagenNaStart: 7, prio: 'midden' },
    { tekst: 'Beslismoment vastleggen', categorie: 'opvolgen', dagenNaStart: 14, prio: 'hoog' }] },
  { id: 'std-onboarding', naam: 'Onboarding nieuwe school', omschrijving: 'Van getekend contract naar een lopend traject.', stappen: [
    { tekst: 'Contract laten tekenen', categorie: 'opvolgen', dagenNaStart: 0, prio: 'hoog' }, { tekst: 'Startgesprek met de contactpersoon', categorie: 'afspraak', dagenNaStart: 5, prio: 'midden' },
    { tekst: 'Ondersteuner koppelen en voorstellen', categorie: 'opvolgen', dagenNaStart: 10, prio: 'midden' }, { tekst: 'Eerste evaluatie na vier weken', categorie: 'afspraak', dagenNaStart: 30, prio: 'midden' }] }
];
var GENERIEKE_DOMEINEN = 'gmail.com googlemail.com hotmail.com hotmail.nl outlook.com outlook.nl live.nl live.com icloud.com me.com yahoo.com kpnmail.nl ziggo.nl xs4all.nl planet.nl home.nl'.split(' ');

/* ----- Gebruikers: beheerder (SECRET) en accountmanagers (eigen code in CODES) ----- */

var GEBRUIKER = null;  // gezet door doPost; in triggers null (= de beheerder)
function codes() { try { return JSON.parse(P.getProperty('CODES') || '{}') || {}; } catch (e) { return {}; } }
function actief(g) { return g.actief !== false && ['nee', 'false', '0'].indexOf(String(g.actief).toLowerCase()) < 0; }
function wieIs(code) {
  if (!code) return null;
  if (code === P.getProperty('SECRET')) return { id: 'beheer', naam: P.getProperty('NAAM') || 'Menno', email: '', rol: 'beheerder' };
  var gid = codes()[code]; if (!gid) return null;
  var g = lees('Gebruikers').filter(function (x) { return String(x.id) === String(gid); })[0];
  if (!g || !actief(g)) return null;
  return { id: g.id, naam: g.naam, email: g.email, rol: rolVan(g.rol) };
}
// v3.3: drie rollen. Iedereen ziet alle scholen, kansen en projecten; mail, agenda, review en Home zijn per gebruiker.
var ROLLEN = ['beheerder', 'adviseur', 'am'];
function rolVan(r) { return ROLLEN.indexOf(r) >= 0 ? r : 'am'; }
// De backend kan alleen de Gmail en Agenda lezen van het account waaronder hij draait (tot Fase B: eigen koppeling per gebruiker).
function mijnMailbox() {
  if (!GEBRUIKER || GEBRUIKER.id === 'beheer') return true;
  try { return !!GEBRUIKER.email && adresZonderPlus(GEBRUIKER.email) === adresZonderPlus(Session.getEffectiveUser().getEmail()); } catch (e) { return false; }
}
function ikNaam() { return GEBRUIKER ? GEBRUIKER.naam : (P.getProperty('NAAM') || 'Menno'); }
function ikUit() { return { naam: ikNaam(), rol: GEBRUIKER ? GEBRUIKER.rol : 'beheerder', gekoppeld: mijnMailbox() }; }
function isBeheerder() { return !GEBRUIKER || GEBRUIKER.rol === 'beheerder'; }
function alleenBeheerder() { if (!isBeheerder()) throw new Error('Alleen de beheerder kan dit.'); }
function vanMij(eigenaar) { return eigenaar ? String(eigenaar) === ikNaam() : isBeheerder(); }
function gebruikersNamen() {
  return uniek([P.getProperty('NAAM') || 'Menno'].concat(lees('Gebruikers').filter(actief).map(function (g) { return g.naam; })));
}
function nieuweCode() { return 'am' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }

function apiGebruikers() {
  alleenBeheerder();
  var c = codes(), metCode = {};
  Object.keys(c).forEach(function (k) { metCode[c[k]] = true; });
  return { gebruikers: lees('Gebruikers').map(function (g) { return { id: g.id, naam: g.naam, email: g.email, rol: rolVan(g.rol), actief: actief(g), heeftCode: !!metCode[g.id] }; }), rollen: ROLLEN };
}
// Nieuwe gebruiker of nieuweCode = true: geeft de koppelcode één keer terug. Uitschakelen (actief = false) trekt de code in.
function apiGebruikerOpslaan(obj, nieuweCodeMaken) {
  alleenBeheerder();
  var o = schoon(obj || {}, ['id', 'naam', 'email', 'rol', 'actief']);
  if (o.naam !== undefined) o.naam = String(o.naam).trim();
  if (!o.id && !o.naam) throw new Error('Naam is verplicht.');
  if (o.email !== undefined) o.email = String(o.email).trim().toLowerCase();
  if (o.rol !== undefined) o.rol = rolVan(o.rol);
  if (o.actief !== undefined) o.actief = o.actief === true || o.actief === 'true' || o.actief === 'ja' ? 'ja' : 'nee';
  if (!o.id) { o.rol = o.rol || 'am'; o.actief = 'ja'; nieuweCodeMaken = true; }
  var vorige = o.id ? vind('Gebruikers', o.id) : null;
  if (o.naam && gebruikersNamen().some(function (n) { return n === o.naam && (!vorige || n !== vorige.naam); })) throw new Error('Er is al een gebruiker met deze naam.');
  return metLock(function () {
    var g = schrijf('Gebruikers', o), c = codes(), code = '';
    if (vorige && o.naam && o.naam !== vorige.naam) hernoemGebruiker(vorige.naam, o.naam);  // v3.7: eigenaar, door en doelen meenemen
    Object.keys(c).forEach(function (k) { if (String(c[k]) === String(g.id) && (nieuweCodeMaken || !actief(g))) delete c[k]; });
    if (nieuweCodeMaken && actief(g)) { code = nieuweCode(); c[code] = g.id; }
    P.setProperty('CODES', JSON.stringify(c));
    return { gebruiker: { id: g.id, naam: g.naam, email: g.email, rol: g.rol, actief: actief(g) }, code: code };
  });
}

/* ----- Hulpfuncties ----- */

function tagsUit(s) { return (s instanceof Array ? s : String(s || '').split(',')).map(function (t) { return String(t).trim(); }).filter(Boolean); }
function tagsIn(v) { return uniek(tagsUit(v).map(function (t) { return t.toLowerCase(); })).join(', '); }
function veldenUit(s) {
  if (s && typeof s === 'object' && !(s instanceof Array)) return s;
  try { var o = JSON.parse(s || '{}'); return (o && typeof o === 'object' && !(o instanceof Array)) ? o : {}; } catch (e) { return {}; }
}
function lijstUit(s) { if (s instanceof Array) return s; try { var l = JSON.parse(s || '[]'); return l instanceof Array ? l : []; } catch (e) { return []; } }
function schoon(obj, velden) { var uit = {}; velden.forEach(function (k) { if (obj[k] !== undefined && obj[k] !== null) uit[k] = obj[k]; }); return uit; }
function perId(lijst) { var m = {}; lijst.forEach(function (x) { m[String(x.id)] = x; }); return m; }
function persoonNaam(p) { return [p.voornaam, p.achternaam].filter(Boolean).join(' ') || p.email || '(naamloos)'; }
function klein(s) { return String(s || '').trim().toLowerCase(); }
function adresZonderPlus(a) { return klein(a).replace(/\+[^@]*@/, '@'); }
function domeinVan(adres) { var m = klein(adres).match(/@([a-z0-9.-]+\.[a-z]{2,})$/); return m && GENERIEKE_DOMEINEN.indexOf(m[1]) < 0 ? m[1] : ''; }
function domeinVanWebsite(w) { var m = klein(w).replace(/^https?:\/\//, '').replace(/^www\./, '').match(/^([a-z0-9.-]+\.[a-z]{2,})/); return m ? m[1] : ''; }
function adressenUit(s) { return (String(s || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(adresZonderPlus); }
// 'yyyy-MM-dd', 'yyyy-MM-ddTHH:mm' of 'yyyy-MM-dd HH:mm' → 'yyyy-MM-dd HH:mm'; anders ''
function datumTijdIn(s) { var d = parseDatum(String(s || '').replace('T', ' ')); return d ? datumTijdStr(d) : ''; }
function isoIn(s) { if (!s) return ''; var d = new Date(s); return isNaN(d.getTime()) ? '' : datumTijdStr(d); }
// Ontbrekende school afleiden uit de gekoppelde persoon, kans of het traject.
function vulKoppeling(o) {
  if (!o.schoolId && o.persoonId) { var p = vind('Personen', o.persoonId); if (p) o.schoolId = p.schoolId; }
  if (!o.schoolId && o.kansId) { var k = vind('Kansen', o.kansId); if (k) { o.schoolId = k.schoolId; if (!o.persoonId) o.persoonId = k.persoonId; } }
  if (!o.schoolId && o.trajectId) { var t = vind('Trajecten', o.trajectId); if (t) o.schoolId = t.schoolId; }
  return o;
}

// v3.3: tegelijk werken. De app stuurt bij bewerken alleen de gewijzigde velden, plus _oud: die velden zoals hij ze had geladen.
// Heeft iemand anders een van die velden intussen veranderd, dan volgt een duidelijke melding in plaats van stil overschrijven.
// Velden die niemand anders aanraakte, worden gewoon samengevoegd. Altijd binnen metLock aanroepen.
function normaal(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Array) return v.join(', ').toLowerCase();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
}
function controleerConflict(tab, id, nieuw, oud) {
  if (!id || !oud || typeof oud !== 'object') return;
  vergeet(tab);  // vers uit de Sheet: een ander verzoek kan net geschreven hebben
  var hit = vind(tab, id); if (!hit) return;
  var huidig = function (k) {
    if (k === 'eigenaar' && tab === 'Scholen') return hit.eigenaar || hit.am;
    if (k === 'naam' && tab === 'Kansen') return hit.naam || hit.traject;
    return hit[k];
  };
  var botst = Object.keys(oud).filter(function (k) { return (k in hit) && normaal(huidig(k)) !== normaal(oud[k]) && normaal(huidig(k)) !== normaal(nieuw[k]); });
  if (botst.length) throw new Error('Intussen gewijzigd: ' + botst.join(', ') + ' (laatst bewerkt door ' + (hit.bijgewerktDoor || 'iemand anders') +
    (hit.bijgewerkt ? ' om ' + String(hit.bijgewerkt).slice(11, 16) : '') + '). Het scherm is ververst; voer je wijziging opnieuw in.');
}

function schoolUit(s) {
  return { id: s.id, naam: s.naam, plaats: s.plaats, type: s.type, bestuur: s.bestuur, adres: s.adres, website: s.website, leerlingen: s.leerlingen, telefoon: s.telefoon, email: s.email,
    status: s.status, eigenaar: s.eigenaar || s.am || '', tags: tagsUit(s.tags), velden: veldenUit(s.velden), contactpersoon: s.contactpersoon, notities: s.notities,
    laatsteContact: s.laatsteContact, aangemaakt: s.aangemaakt, bijgewerkt: s.bijgewerkt };
}
function persoonUit(p, sMap) {
  var s = sMap ? sMap[String(p.schoolId)] : null;
  return { id: p.id, voornaam: p.voornaam, achternaam: p.achternaam, naam: persoonNaam(p), functie: p.functie, schoolId: p.schoolId, school: s ? s.naam : '', email: p.email, telefoon: p.telefoon,
    linkedin: p.linkedin, eigenaar: p.eigenaar, tags: tagsUit(p.tags), velden: veldenUit(p.velden), laatsteContact: p.laatsteContact, aangemaakt: p.aangemaakt };
}
function taakUit(a, sMap, pMap, kMap) {
  var u = actieUit(a), s = sMap && sMap[String(a.schoolId)], p = pMap && pMap[String(a.persoonId)], k = kMap && kMap[String(a.kansId)];
  u.categorie = a.categorie || ''; u.eigenaar = a.eigenaar || ''; u.status = a.status; u.afgerond = a.afgerond || ''; u.notitie = a.notitie || '';
  u.schoolId = a.schoolId || ''; u.persoonId = a.persoonId || ''; u.kansId = a.kansId || ''; u.trackRunId = a.trackRunId || '';
  u.school = s ? s.naam : ''; u.persoon = p ? persoonNaam(p) : ''; u.kans = k ? (k.naam || k.traject) : '';
  u.trajectId = a.trajectId || ''; var t = a.trajectId ? trajectNamen()[a.trajectId] : ''; u.project = t || '';  // v3.8
  return u;
}
var _TRAJECTNAMEN = null;
function trajectNamen() { if (!_TRAJECTNAMEN) { _TRAJECTNAMEN = {}; lees('Trajecten').forEach(function (t) { _TRAJECTNAMEN[t.id] = t.traject + (t.schooljaar ? ' ' + t.schooljaar : ''); }); } return _TRAJECTNAMEN; }
function activiteitUit(a, sMap, pMap, kMap) {
  var s = sMap && sMap[String(a.schoolId)], p = pMap && pMap[String(a.persoonId)], k = kMap && kMap[String(a.kansId)];
  return { id: a.id, type: a.type, datum: a.datum, door: a.door, onderwerp: a.onderwerp, tekst: String(a.tekst || '').slice(0, 3000), duurMin: Number(a.duurMin) || 0, bron: a.bron,
    schoolId: a.schoolId || '', persoonId: a.persoonId || '', kansId: a.kansId || '', school: s ? s.naam : '', persoon: p ? persoonNaam(p) : '', kans: k ? (k.naam || k.traject) : '',
    gepland: String(a.datum) > nu(), agenda: !!a.agendaId, trajectId: a.trajectId || '', project: a.trajectId ? (trajectNamen()[a.trajectId] || '') : '' };  // v3.7: agenda = staat ook in Google Agenda
}
function tijdlijn(acts, sMap, pMap, kMap) {
  return acts.sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).slice(0, 250).map(function (a) { return activiteitUit(a, sMap, pMap, kMap); });
}

/* ----- Mijlpalen ----- */

function mijlpalen() {
  var rijen = lees('Mijlpalen').filter(function (m) { return m.mijlpaal; });
  var lijst = rijen.length ? rijen.map(function (m) { return { pipeline: m.pipeline || 'Scholen', mijlpaal: String(m.mijlpaal), volgorde: Number(m.volgorde) || 0, kans: Number(m.kans) || 0, dagenNorm: Number(m.dagenNorm) || 0 }; })
    : STANDAARD_MIJLPALEN.map(function (m, i) { return { pipeline: 'Scholen', mijlpaal: m.mijlpaal, volgorde: i + 1, kans: m.kans, dagenNorm: m.dagenNorm }; });
  return lijst.sort(function (a, b) { return a.pipeline === b.pipeline ? a.volgorde - b.volgorde : String(a.pipeline).localeCompare(String(b.pipeline)); });
}
function mijlpaalMap() { var m = {}; mijlpalen().forEach(function (x) { if (!m[x.mijlpaal]) m[x.mijlpaal] = x; }); return m; }
function apiMijlpalenOpslaan(lijst) {
  alleenBeheerder();
  if (!(lijst instanceof Array) || !lijst.length) throw new Error('Geef minstens één mijlpaal.');
  var rijen = lijst.map(function (m, i) {
    var naam = klein(m.mijlpaal); if (!naam || naam === 'gewonnen' || naam === 'verloren') throw new Error('Ongeldige mijlpaal: ' + (m.mijlpaal || '(leeg)') + '. Gewonnen en verloren bestaan altijd.');
    return { id: slug((m.pipeline || 'Scholen') + '-' + naam), pipeline: String(m.pipeline || 'Scholen').trim(), mijlpaal: naam, volgorde: i + 1, kans: Math.max(0, Math.min(100, Number(m.kans) || 0)), dagenNorm: Math.max(0, Number(m.dagenNorm) || 0) };
  });
  // v3.7: een hernoemde mijlpaal of pipeline (oud = {pipeline, mijlpaal} zoals geladen) neemt zijn kansen mee
  var hernoemd = lijst.map(function (m, i) { return m.oud && m.oud.mijlpaal ? { oud: m.oud, nieuw: rijen[i] } : null; })
    .filter(function (x) { return x && (klein(x.oud.mijlpaal) !== x.nieuw.mijlpaal || String(x.oud.pipeline || '') !== x.nieuw.pipeline); });
  metLock(function () {
    verwijderRijen('Mijlpalen', function () { return true; }); schrijfVeel('Mijlpalen', rijen);
    if (hernoemd.length) {
      var wijzig = [];
      lees('Kansen').forEach(function (k) {
        hernoemd.forEach(function (h) {
          if (klein(k.fase) !== klein(h.oud.mijlpaal) || (k.pipeline && h.oud.pipeline && k.pipeline !== h.oud.pipeline)) return;
          wijzig.push({ id: k.id, fase: h.nieuw.mijlpaal, pipeline: h.nieuw.pipeline });
        });
      });
      if (wijzig.length) schrijfVeel('Kansen', wijzig);
    }
  });
  return mijlpalen();
}

/* ----- Contacten: scholen en personen ----- */

// Alles wat de lijsten in de module Relaties nodig hebben, in één call.
function apiCrm() {
  var scholen = lees('Scholen'), personen = lees('Personen'), kansen = lees('Kansen'), sMap = perId(scholen), per = {}, naarId = {};
  scholen.forEach(function (s) { per[s.id] = { personen: 0, open: 0, waarde: 0 }; naarId[klein(s.naam)] = s.id; });
  personen.forEach(function (p) { if (per[p.schoolId]) per[p.schoolId].personen++; });
  kansen.filter(kansOpen).forEach(function (k) { var sid = k.schoolId || naarId[klein(k.school)]; if (per[sid]) { per[sid].open++; per[sid].waarde += Number(k.waarde) || 0; } });
  var tags = [];
  scholen.concat(personen).forEach(function (x) { tags = tags.concat(tagsUit(x.tags)); });
  return {
    ik: ikUit(), gebruikers: gebruikersNamen(), statussen: schoolStatussen(), trajectStatussen: trajectStatussen(), mijlpalen: mijlpalen(), categorieen: taakCategorieen(), activiteitTypes: ACTIVITEIT_TYPES, tracks: tracks(),
    tags: uniek(tags.map(function (t) { return t.toLowerCase(); })).sort(),
    scholen: scholen.map(function (s) { var u = schoolUit(s), x = per[s.id]; u.personen = x.personen; u.openKansen = x.open; u.openWaarde = x.waarde; delete u.velden; return u; }),
    personen: personen.map(function (p) { var u = persoonUit(p, sMap); delete u.velden; return u; }),
    // v3.8: projecten (kort) voor keuzelijsten en links, en de facturatie-keuzelijsten
    projecten: lees('Trajecten').map(function (t) { return { id: t.id, naam: t.traject + (t.schooljaar ? ' ' + t.schooljaar : ''), schoolId: t.schoolId || '', school: t.school, kansId: t.kansId || '', status: t.status, am: t.am || '' }; }),
    keuzes: { soortFacturatie: keuzelijst('soortFacturatie'), gefactureerd: keuzelijst('gefactureerd'), vakanties: keuzelijst('vakanties'), factuurStatussen: keuzelijst('factuurStatussen') }
  };
}
function apiSchool(id) {
  var s = vind('Scholen', id); if (!s) throw new Error('School niet gevonden.');
  var naam = klein(s.naam), mp = mijlpaalMap(), sMap = {}; sMap[s.id] = s;
  var personen = lees('Personen').filter(function (p) { return String(p.schoolId) === String(id); }), pMap = perId(personen);
  var kansen = lees('Kansen').filter(function (k) { return String(k.schoolId) === String(id) || (!k.schoolId && klein(k.school) === naam); }), kMap = perId(kansen);
  var trajecten = lees('Trajecten').filter(function (t) { return String(t.schoolId) === String(id) || (!t.schoolId && klein(t.school) === naam); }), tMap = perId(trajecten);
  var acts = lees('Activiteiten').filter(function (a) { return String(a.schoolId) === String(id) || pMap[a.persoonId] || kMap[a.kansId] || tMap[a.trajectId]; });
  var taken = lees('Acties').filter(function (a) { return a.status !== 'af' && (String(a.schoolId) === String(id) || pMap[a.persoonId] || kMap[a.kansId] || tMap[a.trajectId]); }).sort(sorteerActies);
  var som = function (lijst) { return lijst.reduce(function (t, k) { return t + (Number(k.waarde) || 0); }, 0); };
  return {
    // v3.8: kerncijfers bovenaan de schoolpagina (zoals Capsule)
    cijfers: { laatsteContact: s.laatsteContact || '', openProjecten: trajecten.filter(function (t) { return ['afgerond', 'gestopt'].indexOf(t.status) < 0; }).length,
      pipeline: som(kansen.filter(kansOpen)), gewonnen: som(kansen.filter(function (k) { return k.fase === 'gewonnen'; })) },
    school: schoolUit(s), personen: personen.map(function (p) { return persoonUit(p, sMap); }),
    kansen: kansen.map(function (k) { return kansUit(k, mp); }).sort(function (a, b) { return (kansOpen(a) ? 0 : 1) - (kansOpen(b) ? 0 : 1) || String(b.aangemaakt).localeCompare(String(a.aangemaakt)); }),
    trajecten: trajecten.map(trajectUit),
    taken: taken.map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    tijdlijn: tijdlijn(acts, sMap, pMap, kMap),
    documenten: lees('Documenten', true).filter(function (d) { return (d.school && klein(d.school) === naam) || klein(d.titel).indexOf(naam) >= 0; }).map(function (d) { return { id: d.id, titel: d.titel, type: d.type, url: d.url }; })
  };
}
function apiPersoon(id) {
  var p = vind('Personen', id); if (!p) throw new Error('Persoon niet gevonden.');
  var s = p.schoolId ? vind('Scholen', p.schoolId) : null, sMap = {}, pMap = {}, mp = mijlpaalMap();
  if (s) sMap[s.id] = s; pMap[p.id] = p;
  var kansen = lees('Kansen').filter(function (k) { return String(k.persoonId) === String(id); }), kMap = perId(kansen);
  return {
    persoon: persoonUit(p, sMap), school: s ? { id: s.id, naam: s.naam, plaats: s.plaats } : null,
    kansen: kansen.map(function (k) { return kansUit(k, mp); }),
    taken: lees('Acties').filter(function (a) { return a.status !== 'af' && String(a.persoonId) === String(id); }).sort(sorteerActies).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    tijdlijn: tijdlijn(lees('Activiteiten').filter(function (a) { return String(a.persoonId) === String(id); }), sMap, pMap, kMap)
  };
}
var SCHOOL_VELDEN = ['id', 'naam', 'plaats', 'type', 'bestuur', 'adres', 'website', 'leerlingen', 'telefoon', 'email', 'status', 'eigenaar', 'tags', 'velden', 'notities', 'contactpersoon'];
function apiSchoolOpslaan(obj) {
  var o = schoon(obj || {}, SCHOOL_VELDEN), oud = o.id ? vind('Scholen', o.id) : null;
  if (o.id && !oud) throw new Error('School niet gevonden.');
  if (o.naam !== undefined) o.naam = String(o.naam).trim();
  if (!oud && !o.naam) throw new Error('Naam is verplicht.');
  if (oud && o.naam === '') throw new Error('Naam mag niet leeg zijn.');
  if (o.status && schoolStatussen().indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);
  if (o.velden !== undefined) o.velden = veldenUit(o.velden);
  if (o.email !== undefined) o.email = klein(o.email);
  if (!oud) { o.aangemaakt = nu(); o.eigenaar = o.eigenaar || ikNaam(); o.status = o.status || 'lead'; }
  return metLock(function () {
    controleerConflict('Scholen', o.id, o, obj && obj._oud);  // v3.3
    var s = schrijf('Scholen', o);
    // naam gewijzigd: de naamkopie in kansen en trajecten meenemen (Vandaag, Review en Historie tonen die)
    if (oud && o.naam && o.naam !== oud.naam) {
      ['Kansen', 'Trajecten'].forEach(function (tab) {
        var mee = lees(tab).filter(function (r) { return String(r.schoolId) === String(s.id) || (!r.schoolId && klein(r.school) === klein(oud.naam)); });
        schrijfVeel(tab, mee.map(function (r) { return { id: r.id, school: o.naam, schoolId: s.id }; }));
      });
    }
    return schoolUit(s);
  });
}
var PERSOON_VELDEN = ['id', 'voornaam', 'achternaam', 'functie', 'schoolId', 'email', 'telefoon', 'linkedin', 'eigenaar', 'tags', 'velden'];
function apiPersoonOpslaan(obj) {
  var o = schoon(obj || {}, PERSOON_VELDEN), oud = o.id ? vind('Personen', o.id) : null;
  if (o.id && !oud) throw new Error('Persoon niet gevonden.');
  ['voornaam', 'achternaam', 'functie', 'telefoon', 'linkedin'].forEach(function (k) { if (o[k] !== undefined) o[k] = String(o[k]).trim(); });
  if (o.email !== undefined) o.email = klein(o.email);
  if (!oud && !o.voornaam && !o.achternaam && !o.email) throw new Error('Vul minstens een naam of e-mailadres in.');
  if (o.schoolId && !vind('Scholen', o.schoolId)) throw new Error('School niet gevonden.');
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);
  if (o.velden !== undefined) o.velden = veldenUit(o.velden);
  if (!oud) { o.aangemaakt = nu(); o.eigenaar = o.eigenaar || ikNaam(); }
  var p = metLock(function () { controleerConflict('Personen', o.id, o, obj && obj._oud); return schrijf('Personen', o); });  // v3.3
  var sMap = {}; if (p.schoolId) { var s = vind('Scholen', p.schoolId); if (s) sMap[s.id] = s; }
  return persoonUit(p, sMap);
}
// Verwijderen kan alleen voor wat niets meer aan zich heeft hangen; de beheerder of de eigenaar.
// v3.7: ook projecten, oude notities, gegenereerde teksten en doelen; opties.agenda = true haalt een afspraak ook uit Google Agenda.
var VERWIJDER_TABBLAD = { school: 'Scholen', persoon: 'Personen', kans: 'Kansen', activiteit: 'Activiteiten', taak: 'Acties', traject: 'Trajecten', notitie: 'Notities', content: 'Content', doel: 'Doelen', factuur: 'Facturen' };
function apiVerwijder(soort, id, opties) {
  var tab = VERWIJDER_TABBLAD[soort];
  if (!tab) throw new Error('Onbekend soort.');
  var r = vind(tab, id); if (!r) throw new Error('Niet gevonden.');
  if (soort === 'doel') alleenBeheerder();
  var verantwoordelijk = [r.eigenaar || r.door || r.am];
  if (soort === 'factuur' || soort === 'traject') { var pr = soort === 'traject' ? r : vind('Trajecten', r.trajectId); if (pr) verantwoordelijk = verantwoordelijk.concat([pr.am, pr.adviseur]); }  // v3.8
  if (!isBeheerder() && verantwoordelijk.indexOf(ikNaam()) < 0) throw new Error('Alleen de eigenaar of de beheerder kan dit verwijderen.');
  if (soort === 'activiteit' && opties && opties.agenda && r.agendaId) agendaEvent(r.agendaId, function (ev) { ev.deleteEvent(); });
  if (soort === 'school' && (lees('Personen').some(function (p) { return String(p.schoolId) === String(id); }) || lees('Kansen').some(function (k) { return String(k.schoolId) === String(id); })))
    throw new Error('Deze school heeft nog personen of kansen. Verwijder of verplaats die eerst.');
  metLock(function () { verwijderRijen(tab, function (x) { return String(x.id) === String(id); }); });
  return null;
}

/* ----- Historie: notities, gesprekken, mails en afspraken ----- */

function apiActiviteitToevoegen(obj) {
  obj = obj || {};
  var type = ACTIVITEIT_TYPES.indexOf(obj.type) >= 0 ? obj.type : 'notitie';
  var a = schoon(obj, ['schoolId', 'persoonId', 'kansId', 'trajectId']);
  a.tekst = String(obj.tekst || '').trim(); a.onderwerp = String(obj.onderwerp || '').trim();
  if (!a.tekst && !a.onderwerp) throw new Error('Geen tekst.');
  if (!a.schoolId && !a.persoonId && !a.kansId && !a.trajectId) throw new Error('Koppel de activiteit aan een school, persoon of kans.');
  a.type = type; a.datum = datumTijdIn(obj.datum) || nu(); a.duurMin = Number(obj.duurMin) || ''; a.door = ikNaam(); a.bron = 'app'; a.aangemaakt = nu();
  vulKoppeling(a);
  var r = metLock(function () { var x = schrijf('Activiteiten', a); zetLaatsteContact([x]); return x; });
  return activiteitUit(r);
}
// Laatste contact bijhouden op school, persoon en kansen (open kansen van dezelfde school tellen mee). Notities, fasewissels en taken tellen niet.
function zetLaatsteContact(acts) {
  var perS = {}, perP = {}, perK = {}, vandaag = datumStr(new Date());
  var zet = function (m, k, d) { if (k && !(m[k] >= d)) m[k] = d; };
  acts.forEach(function (a) {
    if (['notitie', 'fase', 'taak'].indexOf(a.type) >= 0) return;
    var d = String(a.datum).slice(0, 10); if (!d || d > vandaag) return;  // een geplande afspraak is nog geen contact
    zet(perS, a.schoolId, d); zet(perP, a.persoonId, d); zet(perK, a.kansId, d);
  });
  if (!Object.keys(perS).length && !Object.keys(perP).length && !Object.keys(perK).length) return;
  var kansen = lees('Kansen');
  kansen.filter(kansOpen).forEach(function (k) { if (perS[k.schoolId]) zet(perK, k.id, perS[k.schoolId]); });
  var bij = function (tab, rijen, per) {
    var lijst = [];
    rijen.forEach(function (r) { var d = per[r.id]; if (d && !(String(r.laatsteContact).slice(0, 10) >= d)) lijst.push({ id: r.id, laatsteContact: d }); });
    if (lijst.length) schrijfVeel(tab, lijst);
  };
  if (Object.keys(perS).length) bij('Scholen', lees('Scholen'), perS);
  if (Object.keys(perP).length) bij('Personen', lees('Personen'), perP);
  if (Object.keys(perK).length) bij('Kansen', kansen, perK);
}

/* ----- Pipeline: kansen met mijlpalen ----- */

function apiPipeline() {
  var mp = mijlpaalMap(), ms = mijlpalen();
  var kansen = lees('Kansen').filter(function (k) { return kansOpen(k) || (dagenSinds(k.gesloten || k.bijgewerkt) || 0) <= 60; });
  return { mijlpalen: ms, pipelines: uniek(ms.map(function (m) { return m.pipeline; })), kansen: kansen.map(function (k) { return kansUit(k, mp); }),
    verliesRedenen: uniek(lees('Kansen').map(function (k) { return k.verliesReden; })).sort() };
}
function apiKans(id) {
  var k = vind('Kansen', id); if (!k) throw new Error('Kans niet gevonden.');
  var s = k.schoolId ? vind('Scholen', k.schoolId) : null, p = k.persoonId ? vind('Personen', k.persoonId) : null, sMap = {}, pMap = {}, kMap = {};
  if (s) sMap[s.id] = s; if (p) pMap[p.id] = p; kMap[k.id] = k;
  return {
    kans: kansUit(k, mijlpaalMap()), mijlpalen: mijlpalen(), school: s ? { id: s.id, naam: s.naam, plaats: s.plaats } : null, persoon: p ? { id: p.id, naam: persoonNaam(p), email: p.email, telefoon: p.telefoon } : null,
    personen: s ? lees('Personen').filter(function (x) { return String(x.schoolId) === String(s.id); }).map(function (x) { return { id: x.id, naam: persoonNaam(x) }; }) : [],
    taken: lees('Acties').filter(function (a) { return a.status !== 'af' && String(a.kansId) === String(id); }).sort(sorteerActies).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    project: (lees('Trajecten').filter(function (t) { return String(t.kansId) === String(id); }).map(trajectUit)[0]) || null,  // v3.8
    tijdlijn: tijdlijn(lees('Activiteiten').filter(function (a) { return String(a.kansId) === String(id); }), sMap, pMap, kMap)
  };
}
var KANS_VELDEN = ['id', 'naam', 'schoolId', 'persoonId', 'pipeline', 'fase', 'kans', 'waarde', 'verwachteSluiting', 'volgendeActie', 'deadline', 'eigenaar', 'verliesReden', 'tags', 'velden', 'notities', 'traject', 'am'];
// maakTraject = true bij 'gewonnen': meteen een actief traject in Historie aanmaken.
function apiKansOpslaan(obj, maakTraject) {
  var o = schoon(obj || {}, KANS_VELDEN), oud = o.id ? vind('Kansen', o.id) : null, mp = mijlpaalMap(), ms = mijlpalen();
  if (o.id && !oud) throw new Error('Kans niet gevonden.');
  if (o.naam !== undefined) o.naam = String(o.naam).trim();
  if (!oud && !o.naam) throw new Error('Naam is verplicht.');
  if (!oud && !o.schoolId) throw new Error('Kies een school.');
  if (o.fase !== undefined && ['gewonnen', 'verloren'].indexOf(o.fase) < 0 && !mp[o.fase]) throw new Error('Onbekende mijlpaal.');
  var school = null;
  if (o.schoolId) { school = vind('Scholen', o.schoolId); if (!school) throw new Error('School niet gevonden.'); o.school = school.naam; }
  if (!oud) {
    o.aangemaakt = nu(); o.fase = o.fase || ms[0].mijlpaal; o.eigenaar = o.eigenaar || ikNaam(); o.laatsteContact = datumStr(new Date());
    o.traject = o.traject || o.naam; o.pipeline = o.pipeline || (mp[o.fase] ? mp[o.fase].pipeline : '');
  }
  var faseWissel = !!oud && o.fase !== undefined && o.fase !== oud.fase, fase = o.fase !== undefined ? o.fase : oud.fase;
  if ((faseWissel || !oud) && (o.kans === undefined || o.kans === '')) o.kans = fase === 'gewonnen' ? 100 : fase === 'verloren' ? 0 : (mp[fase] ? mp[fase].kans : '');
  if (faseWissel || !oud) o.gesloten = (fase === 'gewonnen' || fase === 'verloren') ? datumStr(new Date()) : '';
  if (faseWissel && !kansOpen(oud) && kansOpen({ fase: fase })) o.verliesReden = '';  // v3.7: heropend
  ['waarde', 'kans'].forEach(function (k) { if (o[k] !== undefined && o[k] !== '') o[k] = Number(String(o[k]).replace(',', '.')) || 0; });
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);
  if (o.velden !== undefined) o.velden = veldenUit(o.velden);
  return metLock(function () {
    controleerConflict('Kansen', o.id, o, obj && obj._oud);  // v3.3
    var k = schrijf('Kansen', o), traject = null;
    if (faseWissel || !oud) {
      schrijf('Activiteiten', { type: 'fase', datum: nu(), door: ikNaam(), schoolId: k.schoolId, persoonId: k.persoonId, kansId: k.id, bron: 'app', aangemaakt: nu(),
        onderwerp: oud ? 'Mijlpaal: ' + oud.fase + ' → ' + k.fase : 'Kans aangemaakt: ' + (k.naam || k.traject) + ' (' + k.fase + ')', tekst: k.fase === 'verloren' && k.verliesReden ? 'Reden: ' + k.verliesReden : '' });
    }
    // v3.8: een gewonnen kans wordt altijd een project voor de accountmanager (maakTraject wordt niet meer gebruikt)
    if (k.fase === 'gewonnen' && (faseWissel || !oud)) traject = projectUitKans(k, school);
    return { kans: kansUit(k, mp), traject: traject ? trajectUit(traject) : null };
  });
}

/* ----- Taken en tracks ----- */

function apiTaken() {
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen'));
  var acties = lees('Acties').filter(function (a) { return a.status !== 'af' || (dagenSinds(a.afgerond) || 0) <= 14; }).sort(sorteerActies);
  return { taken: acties.map(function (a) { return taakUit(a, sMap, pMap, kMap); }), categorieen: taakCategorieen(), gebruikers: gebruikersNamen(), tracks: tracks() };
}
var TAAK_VELDEN = ['id', 'tekst', 'prio', 'deadline', 'categorie', 'eigenaar', 'schoolId', 'persoonId', 'kansId', 'notitie', 'trajectId'];
function apiTaakOpslaan(obj) {
  var o = schoon(obj || {}, TAAK_VELDEN), oud = o.id ? vind('Acties', o.id) : null;
  if (o.id && !oud) throw new Error('Taak niet gevonden.');
  if (o.tekst !== undefined) o.tekst = String(o.tekst).trim();
  if (!oud && !o.tekst) throw new Error('Geen tekst.');
  if (o.prio && PRIOS.indexOf(o.prio) < 0) o.prio = 'midden';
  if (o.categorie && taakCategorieen().indexOf(o.categorie) < 0) o.categorie = 'overig';
  if (!oud) { o.bron = 'crm'; o.status = 'open'; o.aangemaakt = nu(); o.prio = o.prio || 'midden'; o.eigenaar = o.eigenaar || ikNaam(); }
  vulKoppeling(o);
  var a = metLock(function () { controleerConflict('Acties', o.id, o, obj && obj._oud); return schrijf('Acties', o); });  // v3.3
  return taakUit(a, perId(lees('Scholen')), perId(lees('Personen')), perId(lees('Kansen')));
}
function tracks() {
  var eigen = lees('Tracks').filter(function (t) { return t.naam; }).map(function (t) { return { id: t.id, naam: t.naam, omschrijving: t.omschrijving, stappen: lijstUit(t.stappen) }; });
  return (eigen.length || lees('Tracks').length) ? eigen : STANDAARD_TRACKS;  // v3.7: alles verwijderd = echt geen tracks
}
function apiTrackOpslaan(obj) {
  alleenBeheerder();
  obj = obj || {};
  var naam = String(obj.naam || '').trim(); if (!naam) throw new Error('Naam is verplicht.');
  var stappen = lijstUit(obj.stappen).map(function (s) {
    var tekst = String(s.tekst || '').trim(); if (!tekst) throw new Error('Elke stap heeft een tekst nodig.');
    return { tekst: tekst, categorie: taakCategorieen().indexOf(s.categorie) >= 0 ? s.categorie : 'overig', dagenNaStart: Math.max(0, Number(s.dagenNaStart) || 0), prio: PRIOS.indexOf(s.prio) >= 0 ? s.prio : 'midden' };
  });
  if (!stappen.length) throw new Error('Geef minstens één stap.');
  return metLock(function () {
    // eerste eigen track: de standaardtracks meenemen, anders verdwijnen ze uit de lijst
    if (!lees('Tracks').length) schrijfVeel('Tracks', STANDAARD_TRACKS.map(function (t) { return { id: t.id, naam: t.naam, omschrijving: t.omschrijving, stappen: t.stappen }; }));
    schrijf('Tracks', { id: obj.id || undefined, naam: naam, omschrijving: String(obj.omschrijving || '').trim(), stappen: stappen });
    return tracks();
  });
}
function apiTrackStart(trackId, koppeling, startdatum, eigenaar) {
  var t = tracks().filter(function (x) { return String(x.id) === String(trackId); })[0];
  if (!t) throw new Error('Track niet gevonden.');
  var k = vulKoppeling(schoon(koppeling || {}, ['schoolId', 'persoonId', 'kansId', 'trajectId']));  // v3.8
  if (!k.schoolId && !k.persoonId && !k.kansId) throw new Error('Koppel de track aan een school, persoon of kans.');
  var start = parseDatum(startdatum) || parseDatum(datumStr(new Date())), run = nieuwId(), eig = eigenaar || ikNaam();
  var taken = t.stappen.map(function (s) {
    return { tekst: s.tekst, categorie: s.categorie || 'overig', prio: s.prio || 'midden', deadline: datumStr(new Date(start.getTime() + (Number(s.dagenNaStart) || 0) * 86400000 + 3600000)),
      status: 'open', bron: 'track', aangemaakt: nu(), eigenaar: eig, schoolId: k.schoolId || '', persoonId: k.persoonId || '', kansId: k.kansId || '', trackRunId: run, trajectId: k.trajectId || '' };
  });
  metLock(function () {
    schrijfVeel('Acties', taken);
    schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: k.schoolId, persoonId: k.persoonId, kansId: k.kansId, onderwerp: 'Track gestart: ' + t.naam + ' (' + taken.length + ' taken, ' + eig + ')', bron: 'app', aangemaakt: nu() });
  });
  return { aantal: taken.length, track: t.naam };
}

/* ----- Google Agenda en Gmail ----- */

function agendaSleutel(ev) { return ev.isRecurringEvent() ? ev.getId() + '@' + datumStr(ev.getStartTime()) : ev.getId(); }
function apiAfspraakPlannen(obj) {
  obj = obj || {};
  var titel = String(obj.titel || '').trim(); if (!titel) throw new Error('Geef de afspraak een titel.');
  if (!/\d{2}:\d{2}/.test(String(obj.start || ''))) throw new Error('Kies een datum en tijd.');
  var start = parseDatum(String(obj.start).replace('T', ' ')); if (!start) throw new Error('Ongeldige datum.');
  var duur = Math.max(5, Number(obj.duurMin) || 60), eind = new Date(start.getTime() + duur * 60000);
  var k = vulKoppeling(schoon(obj, ['schoolId', 'persoonId', 'kansId', 'trajectId']));  // v3.8: ook in een project
  if (!k.schoolId && !k.persoonId && !k.kansId) throw new Error('Koppel de afspraak aan een school, persoon of kans.');
  var gasten = [];
  if (obj.uitnodigen && k.persoonId) { var p = vind('Personen', k.persoonId); if (p && p.email) gasten.push(p.email); }
  if (GEBRUIKER && GEBRUIKER.email && GEBRUIKER.id !== 'beheer') gasten.push(GEBRUIKER.email);  // de accountmanager staat zelf ook in de afspraak
  var ev = CalendarApp.getDefaultCalendar().createEvent(titel, start, eind, { description: String(obj.notitie || ''), location: String(obj.locatie || ''), guests: gasten.join(','), sendInvites: gasten.length > 0 });
  var a = metLock(function () {
    return schrijf('Activiteiten', { type: 'afspraak', datum: datumTijdStr(start), duurMin: duur, door: ikNaam(), schoolId: k.schoolId || '', persoonId: k.persoonId || '', kansId: k.kansId || '',
      onderwerp: titel, tekst: String(obj.notitie || ''), agendaId: agendaSleutel(ev), bron: 'app', aangemaakt: nu(), trajectId: k.trajectId || '' });
  });
  return activiteitUit(a);
}
function crmSyncTrigger() { try { metLock(crmSync); } catch (e) { Logger.log('CRM-sync mislukt: ' + e); } }
function apiCrmSync() { return metLock(crmSync); }
// Mails (laatste 2 dagen, plus label CRM voor doorgestuurde of gebcc'de mails van accountmanagers) en afspraken (-7 tot +14 dagen)
// koppelen aan personen (op e-mailadres) en scholen (op domein). Dubbel loggen voorkomen op gmailId en agendaId.
function crmSync() {
  var scholen = lees('Scholen'), personen = lees('Personen'), acts = lees('Activiteiten'), gebr = lees('Gebruikers');
  var perEmail = {}, perDomein = {}, gezienMail = {}, perAgenda = {}, collega = {}, stats = { mails: 0, afspraken: 0, bijgewerkt: 0 };
  var mij = adresZonderPlus(Session.getEffectiveUser().getEmail());
  collega[mij] = P.getProperty('NAAM') || 'Menno';
  gebr.forEach(function (g) { if (g.email) collega[adresZonderPlus(g.email)] = g.naam; });
  personen.forEach(function (p) { var e = adresZonderPlus(p.email); if (e) { perEmail[e] = p; var d = domeinVan(e); if (d && p.schoolId && !perDomein[d]) perDomein[d] = p.schoolId; } });
  scholen.forEach(function (s) { var d = domeinVanWebsite(s.website) || domeinVan(s.email); if (d) perDomein[d] = s.id; });
  acts.forEach(function (a) { if (a.gmailId) gezienMail[a.gmailId] = true; if (a.agendaId) perAgenda[a.agendaId] = a; });
  var koppel = function (adressen) {
    var hit = null;
    adressen.forEach(function (a) {
      if (collega[a] || (hit && hit.persoonId)) return;
      var p = perEmail[a]; if (p) { hit = { persoonId: p.id, schoolId: p.schoolId || '' }; return; }
      var d = domeinVan(a); if (d && perDomein[d] && !hit) hit = { persoonId: '', schoolId: perDomein[d] };
    });
    return hit;
  };
  var nieuw = [];
  var verwerk = function (threads, viaLabel) {
    threads.forEach(function (t) {
      t.getMessages().forEach(function (m) {
        var id = m.getId(); if (gezienMail[id]) return; gezienMail[id] = true;
        if (m.getDate().getTime() < Date.now() - 14 * 86400000) return;
        var van = adressenUit(m.getFrom())[0] || '', naar = adressenUit([m.getTo(), m.getCc()].join(',')), body = '';
        var uitgaand = !!collega[van];
        var kandidaten = uitgaand ? naar : [van];
        if (viaLabel) { body = m.getPlainBody(); kandidaten = kandidaten.concat(adressenUit(body.slice(0, 20000))); }  // doorgestuurd: het schooladres staat in de tekst
        var k = koppel(kandidaten); if (!k) return;
        nieuw.push({ type: 'mail', datum: datumTijdStr(m.getDate()), door: uitgaand ? collega[van] : '', schoolId: k.schoolId, persoonId: k.persoonId, gmailId: id, aangemaakt: nu(),
          bron: viaLabel ? 'gmail-crm' : uitgaand ? 'gmail-uit' : 'gmail-in', onderwerp: (uitgaand ? 'Mail verstuurd: ' : 'Mail ontvangen: ') + (m.getSubject() || '(geen onderwerp)'),
          tekst: (body || m.getPlainBody()).replace(/\r/g, '').slice(0, 1500) });
        stats.mails++;
      });
    });
  };
  try { verwerk(GmailApp.search('newer_than:2d -in:chats -category:promotions -category:social', 0, 60), false); } catch (e) { Logger.log('Gmail: ' + e); }
  try { verwerk(GmailApp.search('label:CRM newer_than:14d', 0, 40), true); } catch (e) { Logger.log('Gmail-label CRM: ' + e); }
  try {
    CalendarApp.getDefaultCalendar().getEvents(plusDagen(-7), plusDagen(14)).forEach(function (ev) {
      if (ev.isAllDayEvent()) return;
      var gasten = ev.getGuestList().map(function (g) { return adresZonderPlus(g.getEmail()); });
      var sleutel = agendaSleutel(ev), oud = perAgenda[sleutel];
      var rij = { type: 'afspraak', datum: datumTijdStr(ev.getStartTime()), duurMin: Math.round((ev.getEndTime().getTime() - ev.getStartTime().getTime()) / 60000), onderwerp: ev.getTitle(), agendaId: sleutel };
      if (oud) { if (oud.datum !== rij.datum || oud.onderwerp !== rij.onderwerp) { rij.id = oud.id; nieuw.push(rij); stats.bijgewerkt++; } return; }
      var k = koppel(gasten); if (!k) return;
      rij.schoolId = k.schoolId; rij.persoonId = k.persoonId; rij.door = collega[adresZonderPlus(ev.getCreators()[0] || '')] || collega[mij]; rij.bron = 'agenda'; rij.aangemaakt = nu();
      nieuw.push(rij); stats.afspraken++;
    });
  } catch (e) { Logger.log('Agenda: ' + e); }
  schrijfVeel('Activiteiten', nieuw);
  zetLaatsteContact(nieuw.filter(function (a) { return a.schoolId || a.persoonId; }));
  P.setProperty('LAATSTE_CRM_SYNC', nu());
  return stats;
}

/* ----- Home en Agenda voor de desktopweergave (v3.0) ----- */

function agendaItems(van, tot) {
  if (!mijnMailbox()) return [];  // v3.3
  try {
    return CalendarApp.getDefaultCalendar().getEvents(van, tot).map(function (ev) {
      return { id: ev.getId(), sleutel: agendaSleutel(ev), titel: ev.getTitle(), start: datumTijdStr(ev.getStartTime()), eind: datumTijdStr(ev.getEndTime()), heleDag: ev.isAllDayEvent(), locatie: ev.getLocation() || '' };
    });
  } catch (e) { return []; }
}
function apiHome() {
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kansen = lees('Kansen'), kMap = perId(kansen), mp = mijlpaalMap();
  var taken = lees('Acties').filter(function (a) { return a.status !== 'af' && vanMij(a.eigenaar); }).sort(sorteerActies);
  var open = kansen.filter(kansOpen).filter(function (k) { return isBeheerder() || k.eigenaar === ikNaam(); }).map(function (k) { return kansUit(k, mp); });
  var som = function (veld) { return open.reduce(function (t, k) { return t + (Number(k[veld]) || 0); }, 0); };
  var recent = lees('Activiteiten').filter(function (a) { return String(a.datum) <= nu(); }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).slice(0, 25);
  var begin = new Date(); begin.setHours(0, 0, 0, 0);
  return {
    groet: groet(), datum: datumLang(new Date()), ik: ikUit(),
    taken: taken.slice(0, 40).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    agenda: agendaItems(begin, new Date(begin.getTime() + 7 * 86400000)), gekoppeld: mijnMailbox(),
    pipeline: { open: open.length, waarde: som('waarde'), gewogen: som('gewogen'), stil: open.filter(function (k) { return k.stil; }).sort(function (a, b) { return b.dagenStil - a.dagenStil; }).slice(0, 8) },
    recent: recent.map(function (a) { return activiteitUit(a, sMap, pMap, kMap); }),
    mails: []  // v3.2: Gmail is traag; de app haalt de mails apart op met apiHomeMails
  };
}
function apiHomeMails() { return mailsOnbeantwoord(5); }
// van, tot: 'yyyy-MM-dd' (tot en met). Maximaal 62 dagen.
function apiAgenda(van, tot) {
  var a = parseDatum(van), b = parseDatum(tot);
  if (!a || !b || b < a) throw new Error('Ongeldige periode.');
  if ((b - a) / 86400000 > 62) throw new Error('Kies maximaal twee maanden.');
  var eind = new Date(b.getTime() + 86400000), vanS = datumStr(a), totS = datumStr(b);
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen'));
  var acts = lees('Activiteiten').filter(function (x) { return x.type === 'afspraak'; }), perSleutel = {};
  acts.forEach(function (x) { if (x.agendaId) perSleutel[x.agendaId] = x; });
  var events = agendaItems(a, eind).map(function (e) {
    var x = perSleutel[e.sleutel]; if (x) { e.schoolId = x.schoolId || ''; e.kansId = x.kansId || ''; e.school = sMap[x.schoolId] ? sMap[x.schoolId].naam : ''; }
    return e;
  });
  var gezien = {}; events.forEach(function (e) { gezien[e.sleutel] = true; });
  var inBereik = function (d) { d = String(d || '').slice(0, 10); return d >= vanS && d <= totS; };
  return {
    van: vanS, tot: totS, events: events, gekoppeld: mijnMailbox(),
    afspraken: acts.filter(function (x) { return inBereik(x.datum) && !(x.agendaId && gezien[x.agendaId]); }).map(function (x) { return activiteitUit(x, sMap, pMap, kMap); }),
    taken: lees('Acties').filter(function (x) { return x.status !== 'af' && inBereik(x.deadline) && (isBeheerder() || vanMij(x.eigenaar)); }).sort(sorteerActies).map(function (x) { return taakUit(x, sMap, pMap, kMap); })
  };
}

/* ----- Rapportage en activity tracking ----- */

function periodeStart(preset) {
  var d = new Date();
  if (preset === 'maand') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (preset === 'kwartaal') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);  // maandag van deze week
}
function apiRapport(preset, eigenaar) {
  preset = DOEL_PERIODES.indexOf(preset) >= 0 ? preset : 'week';
  if (!isBeheerder()) eigenaar = ikNaam();  // een accountmanager ziet zijn eigen cijfers
  var van = datumStr(periodeStart(preset)), tot = datumStr(new Date());
  var inPeriode = function (s) { var d = String(s || '').slice(0, 10); return d >= van && d <= tot; };
  var leeg = function () { return { gesprekken: 0, mails: 0, afspraken: 0, notities: 0, nieuweKansen: 0, voorstellen: 0, gewonnen: 0, gewonnenWaarde: 0, verloren: 0, takenAf: 0 }; };
  var per = {}, p = function (n) { n = n || 'Onbekend'; return per[n] || (per[n] = leeg()); };
  gebruikersNamen().forEach(p);
  var mp = mijlpaalMap(), kansen = lees('Kansen');
  lees('Activiteiten').forEach(function (a) {
    if (!a.door || !inPeriode(a.datum)) return;  // inkomende mail heeft geen 'door' en telt niet als activiteit
    var x = p(a.door);
    if (a.type === 'gesprek') x.gesprekken++;
    else if (a.type === 'mail') x.mails++;
    else if (a.type === 'afspraak') x.afspraken++;
    else if (a.type === 'notitie') x.notities++;
    else if (a.type === 'fase' && /→ voorstel$/.test(String(a.onderwerp))) x.voorstellen++;
    else if (a.type === 'taak' && /^Taak afgerond/.test(String(a.onderwerp))) x.takenAf++;
  });
  kansen.forEach(function (k) {
    if (inPeriode(k.aangemaakt)) p(k.eigenaar).nieuweKansen++;
    if (k.fase === 'gewonnen' && inPeriode(k.gesloten)) { p(k.eigenaar).gewonnen++; p(k.eigenaar).gewonnenWaarde += Number(k.waarde) || 0; }
    if (k.fase === 'verloren' && inPeriode(k.gesloten)) p(k.eigenaar).verloren++;
  });
  var namen = eigenaar ? [eigenaar] : Object.keys(per).filter(function (n) { var c = per[n]; return n !== 'Onbekend' || Object.keys(c).some(function (k) { return c[k]; }); });
  var team = leeg();
  namen.forEach(function (n) { var c = per[n] || leeg(); Object.keys(team).forEach(function (k) { team[k] += c[k]; }); });
  var doelen = {};
  lees('Doelen').filter(function (d) { return d.periode === preset && Number(d.doel); }).forEach(function (d) { (doelen[d.eigenaar] = doelen[d.eigenaar] || {})[d.metric] = Number(d.doel); });
  var open = kansen.filter(kansOpen).filter(function (k) { return !eigenaar || k.eigenaar === eigenaar; }).map(function (k) { return kansUit(k, mp); });
  var maanden = {};
  open.forEach(function (k) {
    var m = k.verwachteSluiting ? String(k.verwachteSluiting).slice(0, 7) : 'zonder datum', x = maanden[m] || (maanden[m] = { maand: m, waarde: 0, gewogen: 0, aantal: 0 });
    x.waarde += k.waarde; x.gewogen += k.gewogen; x.aantal++;
  });
  var som = function (lijst, veld) { return lijst.reduce(function (s, k) { return s + (Number(k[veld]) || 0); }, 0); };
  var gesloten = kansen.filter(function (k) { return (k.fase === 'gewonnen' || k.fase === 'verloren') && inPeriode(k.gesloten) && (!eigenaar || k.eigenaar === eigenaar); });
  var gew = gesloten.filter(function (k) { return k.fase === 'gewonnen'; }), verl = gesloten.filter(function (k) { return k.fase === 'verloren'; }), redenen = {};
  verl.forEach(function (k) { var r = k.verliesReden || 'onbekend'; redenen[r] = (redenen[r] || 0) + 1; });
  return {
    preset: preset, van: van, tot: tot, eigenaar: eigenaar || '', gebruikers: gebruikersNamen(), ik: ikUit(), team: team,
    perPersoon: namen.map(function (n) { return { naam: n, cijfers: per[n] || leeg(), doelen: doelen[n] || {} }; }),
    totaal: { open: open.length, waarde: som(open, 'waarde'), gewogen: som(open, 'gewogen') },
    forecast: Object.keys(maanden).sort().map(function (m) { return maanden[m]; }),
    trechter: mijlpalen().map(function (m) { var ks = open.filter(function (k) { return k.fase === m.mijlpaal; }); return { mijlpaal: m.mijlpaal, pipeline: m.pipeline, aantal: ks.length, waarde: som(ks, 'waarde'), gewogen: som(ks, 'gewogen') }; }),
    winst: { gewonnen: gew.length, gewonnenWaarde: som(gew, 'waarde'), verloren: verl.length, verlorenWaarde: som(verl, 'waarde'), ratio: gesloten.length ? Math.round(100 * gew.length / gesloten.length) : null },
    redenen: Object.keys(redenen).map(function (r) { return { reden: r, aantal: redenen[r] }; }).sort(function (a, b) { return b.aantal - a.aantal; }),
    stil: open.filter(function (k) { return k.stil; }).sort(function (a, b) { return b.dagenStil - a.dagenStil; }).slice(0, 15)
  };
}
// v3.3: activiteit per gebruiker. De beheerder kiest iemand; anderen zien alleen hun eigen activiteit.
function apiActiviteiten(door, van, tot) {
  if (!isBeheerder() || !door) door = isBeheerder() ? (door || '') : ikNaam();
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen')), perType = {};
  var lijst = lees('Activiteiten').filter(function (a) {
    var d = String(a.datum).slice(0, 10);
    return (!door || a.door === door) && (!van || d >= van) && (!tot || d <= tot) && String(a.datum) <= nu();
  });
  lijst.forEach(function (a) { perType[a.type] = (perType[a.type] || 0) + 1; });
  return { door: door, totaal: lijst.length, perType: perType, tijdlijn: tijdlijn(lijst, sMap, pMap, kMap) };
}
// Oudere activiteit van één school, persoon of kans uit het archief (op verzoek, zodat gewone schermen snel blijven)
function apiArchiefTijdlijn(soort, id) {
  var veld = { school: 'schoolId', persoon: 'persoonId', kans: 'kansId' }[soort]; if (!veld) throw new Error('Onbekend soort.');
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen'));
  return tijdlijn(lees('Activiteiten_archief').filter(function (a) { return String(a[veld]) === String(id); }), sMap, pMap, kMap);
}
// Maandelijks: activiteit ouder dan 12 maanden naar Activiteiten_archief. Het tabblad wordt in één keer herschreven
// (rij voor rij verwijderen is te traag bij duizenden rijen); het archief wordt eerst geschreven, zodat er niets verloren gaat.
function archiveerTrigger() { try { metLock(archiveer); } catch (e) { Logger.log('Archiveren mislukt: ' + e); } }
function apiArchiveer() { alleenBeheerder(); return metLock(archiveer); }
function archiveer() {
  var grens = datumStr(new Date(Date.now() - 365 * 86400000)), alle = lees('Activiteiten');
  var isOud = function (a) { var d = String(a.datum).slice(0, 10); return !!d && d < grens; };
  var oud = alle.filter(isOud), houden = alle.filter(function (a) { return !isOud(a); });
  if (!oud.length) return { gearchiveerd: 0, over: houden.length };
  schrijfVeel('Activiteiten_archief', oud);
  var b = blad('Activiteiten'), kop = TABELLEN.Activiteiten, laatste = b.getLastRow();
  if (laatste > 1) b.getRange(2, 1, laatste - 1, kop.length).clearContent();
  if (houden.length) b.getRange(2, 1, houden.length, kop.length).setValues(houden.map(function (r) { return kop.map(function (k) { return celUit(r[k]); }); }));
  vergeet('Activiteiten');
  return { gearchiveerd: oud.length, over: houden.length };
}

function apiDoelen() {
  return { doelen: lees('Doelen').map(function (d) { return { id: d.id, eigenaar: d.eigenaar, periode: d.periode, metric: d.metric, doel: Number(d.doel) || 0 }; }),
    metrics: DOEL_METRICS, periodes: DOEL_PERIODES, gebruikers: gebruikersNamen() };
}
function apiDoelOpslaan(obj) {
  alleenBeheerder();
  obj = obj || {};
  var eigenaar = String(obj.eigenaar || '').trim();
  if (!eigenaar) throw new Error('Kies een accountmanager.');
  if (DOEL_PERIODES.indexOf(obj.periode) < 0) throw new Error('Kies week, maand of kwartaal.');
  if (DOEL_METRICS.indexOf(obj.metric) < 0) throw new Error('Onbekende maatstaf.');
  var id = slug(eigenaar + '-' + obj.periode + '-' + obj.metric);
  metLock(function () {
    if (obj.id && obj.id !== id) verwijderRijen('Doelen', function (d) { return String(d.id) === String(obj.id); });  // v3.7: bewerkt doel met andere persoon, periode of maatstaf
    schrijf('Doelen', { id: id, eigenaar: eigenaar, periode: obj.periode, metric: obj.metric, doel: Math.max(0, Number(obj.doel) || 0) });
  });
  return apiDoelen();
}

/* ----- Export (CSV) ----- */

function apiExport(tabel) {
  alleenBeheerder();  // v3.3
  var naam = { scholen: 'Scholen', personen: 'Personen', kansen: 'Kansen', activiteiten: 'Activiteiten', taken: 'Acties', trajecten: 'Trajecten' }[String(tabel || '').toLowerCase()];
  if (!naam) throw new Error('Onbekende tabel.');
  var kop = TABELLEN[naam], cel = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[";\n,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var regels = [kop.join(',')].concat(lees(naam).map(function (r) { return kop.map(function (k) { return cel(r[k]); }).join(','); }));
  return { bestandsnaam: 'athena-' + String(tabel).toLowerCase() + '-' + datumStr(new Date()) + '.csv', csv: regels.join('\n') };
}

/* ----- Inrichten: bestaande gegevens overzetten naar het CRM (idempotent; ook vanuit setup()) ----- */

function apiCrmInrichten() { alleenBeheerder(); return metLock(crmInrichten); }
function crmInrichten() {
  Object.keys(TABELLEN).forEach(blad);  // tabbladen en nieuwe kolommen aanmaken
  var scholen = lees('Scholen'), personen = lees('Personen'), stats = { personen: 0, kansen: 0, trajecten: 0, notities: 0, eigenaren: 0 };
  var naarId = {}, heeftPersoon = {};
  scholen.forEach(function (s) { naarId[klein(s.naam)] = s.id; });
  personen.forEach(function (p) { heeftPersoon[p.id] = true; });
  // contactpersoon, e-mail en telefoon van een school worden een persoon
  var nieuwP = scholen.filter(function (s) { return String(s.contactpersoon || '').trim() && !heeftPersoon['cp-' + s.id]; }).map(function (s) {
    var delen = String(s.contactpersoon).trim().split(/\s+/);
    return { id: 'cp-' + s.id, voornaam: delen.length > 1 ? delen[0] : '', achternaam: delen.length > 1 ? delen.slice(1).join(' ') : delen[0], schoolId: s.id, email: klein(s.email), telefoon: s.telefoon || '', eigenaar: s.eigenaar || s.am || '', aangemaakt: nu() };
  });
  stats.personen = schrijfVeel('Personen', nieuwP).ingevoegd;
  var eig = scholen.filter(function (s) { return !s.eigenaar && s.am; }).map(function (s) { return { id: s.id, eigenaar: s.am }; });
  stats.eigenaren = schrijfVeel('Scholen', eig).bijgewerkt;
  // kansen en trajecten koppelen op schoolnaam
  ['Kansen', 'Trajecten'].forEach(function (tab) {
    var mee = lees(tab).filter(function (r) { return !r.schoolId && naarId[klein(r.school)]; }).map(function (r) { return { id: r.id, schoolId: naarId[klein(r.school)] }; });
    stats[tab === 'Kansen' ? 'kansen' : 'trajecten'] = schrijfVeel(tab, mee).bijgewerkt;
  });
  // oude notities bij trajecten naar de tijdlijn (het tabblad Notities blijft staan; apiTraject toont een gekopieerde notitie maar één keer)
  var tMap = perId(lees('Trajecten')), gezien = perId(lees('Activiteiten'));
  var nt = lees('Notities').filter(function (n) { return !gezien['nt-' + n.id]; }).map(function (n) {
    var t = tMap[String(n.trajectId)] || {};
    return { id: 'nt-' + n.id, type: 'notitie', datum: n.datum, door: '', trajectId: n.trajectId, schoolId: t.schoolId || naarId[klein(t.school)] || '', tekst: n.tekst, bron: 'notities', aangemaakt: nu() };
  });
  stats.notities = schrijfVeel('Activiteiten', nt).ingevoegd;
  return stats;
}

/* ----- Eenmalige migratie uit Capsule CRM (API v2). Token in scripteigenschap CAPSULE_TOKEN. ----- */

var CAPSULE_STAPPEN = ['mijlpalen', 'partijen', 'kansen', 'projecten', 'taken', 'historie'];
function capsule(pad, params, poging) {
  var token = P.getProperty('CAPSULE_TOKEN'); if (!token) throw new Error('Zet CAPSULE_TOKEN in de scripteigenschappen (Capsule → My Preferences → API Authentication Tokens).');
  var q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var r = UrlFetchApp.fetch('https://api.capsulecrm.com/api/v2/' + pad + (q ? '?' + q : ''), { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, muteHttpExceptions: true });
  var code = r.getResponseCode(), tekst = r.getContentText() || '';
  if (code === 429 && (poging || 0) < 3) { Utilities.sleep(3000); return capsule(pad, params, (poging || 0) + 1); }  // rate limit
  if (code !== 200) throw new Error('Capsule ' + code + ' op ' + pad + ': ' + tekst.slice(0, 200));
  var h = r.getHeaders(), link = String(h.Link || h.link || '');
  return { data: JSON.parse(tekst || '{}'), meer: /rel="next"/.test(link) };
}
function capsuleTags(x) { return tagsIn((x.tags || []).map(function (t) { return t.name; })); }
function capsuleVelden(x) { var v = {}; (x.fields || []).forEach(function (f) { if (f.definition && f.definition.name && f.value !== null && f.value !== undefined && f.value !== '') v[f.definition.name] = f.value; }); return v; }
function capsuleEerste(lijst, veld) { return (lijst || []).map(function (x) { return x[veld]; }).filter(Boolean)[0] || ''; }
function capsuleFase(m, mijl) {
  var x = m ? mijl[m.id] : null, naam = klein((x && x.naam) || (m && m.name));
  if (x && x.complete) return x.kans >= 100 ? 'gewonnen' : 'verloren';
  if (/^(won|gewonnen)$/.test(naam)) return 'gewonnen';
  if (/^(lost|verloren)$/.test(naam)) return 'verloren';
  return naam || STANDAARD_MIJLPALEN[0].mijlpaal;
}
// Kaarten van Capsule-id naar ons id; per pagina opnieuw opgebouwd (scholen kunnen door de data-run al met een ander id bestaan).
function capsuleKaarten() {
  var org = {}, pers = {}, naam = {}, scholen = lees('Scholen');
  scholen.forEach(function (s) { if (s.capsuleId) org[String(s.capsuleId)] = s; naam[klein(s.naam)] = s; });
  lees('Personen').forEach(function (p) { if (p.capsuleId) pers[String(p.capsuleId)] = p; });
  var mijl = {}; try { mijl = JSON.parse(P.getProperty('CAPSULE_MIJLPALEN') || '{}'); } catch (e) {}
  return { org: org, pers: pers, naam: naam, ids: perId(scholen), mijl: mijl };
}
function capsulePartij(party, K) {
  if (!party) return { schoolId: '', persoonId: '', school: '' };
  var o = K.org[String(party.id)]; if (o) return { schoolId: o.id, persoonId: '', school: o.naam };
  var p = K.pers[String(party.id)]; if (p) { var s = K.ids[String(p.schoolId)]; return { schoolId: p.schoolId || '', persoonId: p.id, school: s ? s.naam : '' }; }
  return { schoolId: '', persoonId: '', school: '' };
}
function apiCapsuleMigratie(stap, pagina) {
  alleenBeheerder();
  stap = stap || CAPSULE_STAPPEN[0]; pagina = Number(pagina) || 1;
  if (CAPSULE_STAPPEN.indexOf(stap) < 0) throw new Error('Onbekende stap.');
  var start = Date.now(), aantal = 0, meer = true;
  while (meer && Date.now() - start < 30000) {  // ruim binnen de time-out van een web-app-verzoek; de app roept de volgende pagina aan
    var r = metLock(function () { return capsulePagina(stap, pagina); });
    aantal += r.aantal; meer = r.meer; if (meer) pagina++;
  }
  var i = CAPSULE_STAPPEN.indexOf(stap);
  var volgende = meer ? { stap: stap, pagina: pagina } : (i + 1 < CAPSULE_STAPPEN.length ? { stap: CAPSULE_STAPPEN[i + 1], pagina: 1 } : null);
  if (!volgende) metLock(function () { zetLaatsteContact(lees('Activiteiten')); P.setProperty('CAPSULE_MIGRATIE', nu()); });
  return { stap: stap, aantal: aantal, volgende: volgende };
}
function capsulePagina(stap, pagina) {
  var K = capsuleKaarten(), res, rijen = [];
  if (stap === 'mijlpalen') {
    res = capsule('milestones', { page: pagina, perPage: 100 });
    var mijl = pagina === 1 ? {} : K.mijl;
    (res.data.milestones || []).forEach(function (m) {
      var pl = (m.pipeline && m.pipeline.name) || 'Scholen';
      mijl[m.id] = { naam: m.name, complete: !!m.complete, kans: Number(m.probability) || 0, pipeline: pl };
      if (!m.complete && !/^(won|lost|gewonnen|verloren)$/i.test(m.name)) rijen.push({ id: 'cap-m' + m.id, pipeline: pl, mijlpaal: klein(m.name), volgorde: Number(m.displayOrder) || rijen.length + 1, kans: Number(m.probability) || 0, dagenNorm: Number(m.daysUntilStale) || 0 });
    });
    P.setProperty('CAPSULE_MIJLPALEN', JSON.stringify(mijl));
    schrijfVeel('Mijlpalen', rijen);
    return { aantal: rijen.length, meer: res.meer };
  }
  if (stap === 'partijen') {
    res = capsule('parties', { page: pagina, perPage: 100, embed: 'tags,fields' });
    var orgs = [], pers = [];
    (res.data.parties || []).forEach(function (x) {
      var basis = { capsuleId: x.id, telefoon: capsuleEerste(x.phoneNumbers, 'number'), email: klein(capsuleEerste(x.emailAddresses, 'address')), eigenaar: (x.owner && (x.owner.name || x.owner.username)) || '',
        tags: capsuleTags(x), velden: capsuleVelden(x), aangemaakt: isoIn(x.createdAt) };
      if (x.type === 'organisation') {
        var adres = (x.addresses || [])[0] || {}, bestaand = K.org[String(x.id)] || K.naam[klein(x.name)];
        basis.id = bestaand ? bestaand.id : 'cap-o' + x.id; basis.naam = x.name; basis.plaats = adres.city || (bestaand ? bestaand.plaats : '');
        basis.adres = [adres.street, [adres.zip, adres.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        basis.website = ((x.websites || []).filter(function (w) { return w.service === 'URL'; })[0] || {}).address || '';
        if (x.about) basis.notities = x.about;
        if (!bestaand) basis.status = 'lead';
        orgs.push(basis);
      } else {
        basis.id = 'cap-p' + x.id; basis.voornaam = x.firstName || ''; basis.achternaam = x.lastName || ''; basis.functie = x.jobTitle || '';
        basis.linkedin = ((x.websites || []).filter(function (w) { return w.service === 'LINKED_IN'; })[0] || {}).address || '';
        basis._org = x.organisation ? String(x.organisation.id) : '';
        pers.push(basis);
      }
    });
    schrijfVeel('Scholen', orgs);
    // personen na de organisaties van deze pagina; een organisatie die pas op een latere pagina komt, koppelt herkoppelPersonen() aan het eind
    K = capsuleKaarten();
    pers.forEach(function (p) { var o = K.org[p._org]; p.schoolId = o ? o.id : (p._org ? 'cap-o' + p._org : ''); delete p._org; });
    schrijfVeel('Personen', pers);
    if (!res.meer) herkoppelPersonen();
    return { aantal: orgs.length + pers.length, meer: res.meer };
  }
  if (stap === 'kansen') {
    res = capsule('opportunities', { page: pagina, perPage: 100, embed: 'tags,fields' });
    (res.data.opportunities || []).forEach(function (x) {
      var pt = capsulePartij(x.party, K), fase = capsuleFase(x.milestone, K.mijl), m = x.milestone ? K.mijl[x.milestone.id] : null;
      rijen.push({ id: 'cap-k' + x.id, capsuleId: x.id, naam: x.name, traject: x.name, schoolId: pt.schoolId, persoonId: pt.persoonId, school: pt.school, fase: fase, pipeline: m ? m.pipeline : '',
        kans: x.probability != null ? Number(x.probability) : '', waarde: x.value && x.value.amount != null ? Number(x.value.amount) : '', verwachteSluiting: x.expectedCloseOn || '', gesloten: x.closedOn || '',
        verliesReden: (x.lostReason && x.lostReason.name) || '', eigenaar: (x.owner && (x.owner.name || x.owner.username)) || '', notities: x.description || '', tags: capsuleTags(x), velden: capsuleVelden(x),
        laatsteContact: x.lastContactedAt ? String(isoIn(x.lastContactedAt)).slice(0, 10) : '', aangemaakt: isoIn(x.createdAt) });
    });
    schrijfVeel('Kansen', rijen);
    return { aantal: rijen.length, meer: res.meer };
  }
  if (stap === 'projecten') {
    res = capsule('kases', { page: pagina, perPage: 100 });
    var bestaandT = {};
    lees('Trajecten').forEach(function (t) { bestaandT[klein(t.school) + '|' + klein(t.traject)] = t; });
    (res.data.kases || []).forEach(function (x) {
      var pt = capsulePartij(x.party, K), dubbel = bestaandT[klein(pt.school) + '|' + klein(x.name)];
      if (dubbel) { rijen.push({ id: dubbel.id, capsuleId: x.id, schoolId: dubbel.schoolId || pt.schoolId }); return; }  // al door de data-run geïmporteerd: alleen koppelen
      var s = K.org[String((x.party || {}).id)] || {};
      rijen.push({ id: 'cap-c' + x.id, capsuleId: x.id, schoolId: pt.schoolId, school: pt.school, plaats: s.plaats || '', traject: x.name, status: x.status === 'CLOSED' ? 'afgerond' : 'actief',
        schooljaar: schooljaarVan(x.openedOn || x.createdAt), start: x.openedOn || String(isoIn(x.createdAt)).slice(0, 10), eind: x.closedOn || '', am: (x.owner && (x.owner.name || x.owner.username)) || '', samenvatting: x.description || '' });
    });
    schrijfVeel('Trajecten', rijen);
    return { aantal: rijen.length, meer: res.meer };
  }
  if (stap === 'taken') {
    res = capsule('tasks', { page: pagina, perPage: 100, status: 'open,pending,completed' });
    (res.data.tasks || []).forEach(function (x) {
      var af = x.status === 'COMPLETED', afgerond = isoIn(x.completedAt);
      if (af && (dagenSinds(afgerond) || 0) > 180) return;  // oude afgeronde taken niet meenemen
      var pt = capsulePartij(x.party, K), cat = klein(x.category && x.category.name);
      rijen.push({ id: 'cap-t' + x.id, capsuleId: x.id, tekst: x.description || '(taak)', notitie: x.detail || '', deadline: x.dueOn || '', status: af ? 'af' : 'open', afgerond: afgerond,
        categorie: TAAK_CATEGORIEEN.indexOf(cat) >= 0 ? cat : (/bel|call/.test(cat) ? 'bellen' : /mail/.test(cat) ? 'mailen' : /afspra|meet/.test(cat) ? 'afspraak' : 'overig'),
        eigenaar: (x.owner && (x.owner.name || x.owner.username)) || '', schoolId: pt.schoolId, persoonId: pt.persoonId, kansId: x.opportunity ? 'cap-k' + x.opportunity.id : '', bron: 'capsule', prio: 'midden', aangemaakt: isoIn(x.createdAt) });
    });
    schrijfVeel('Acties', rijen);
    return { aantal: rijen.length, meer: res.meer };
  }
  if (stap === 'historie') {
    res = capsule('entries', { page: pagina, perPage: 100 });
    (res.data.entries || []).forEach(function (x) {
      var pt = capsulePartij(x.party, K), soort = klein(x.activityType && x.activityType.name);
      var type = x.type === 'email' ? 'mail' : /bel|call|phone|telefoon/.test(soort) ? 'gesprek' : /meeting|afspra|bezoek/.test(soort) ? 'afspraak' : 'notitie';
      rijen.push({ id: 'cap-e' + x.id, type: type, datum: isoIn(x.entryAt || x.createdAt), door: (x.creator && (x.creator.name || x.creator.username)) || '', schoolId: pt.schoolId, persoonId: pt.persoonId,
        kansId: x.opportunity ? 'cap-k' + x.opportunity.id : '', trajectId: x.kase ? 'cap-c' + x.kase.id : '', onderwerp: x.subject || (x.activityType && x.activityType.name) || '',
        tekst: String(x.content || '').slice(0, 5000), bron: 'capsule', aangemaakt: nu() });
    });
    schrijfVeel('Activiteiten', rijen);
    return { aantal: rijen.length, meer: res.meer };
  }
  return { aantal: 0, meer: false };
}
// Personen die naar een nog onbekende organisatie wezen ('cap-o<id>') koppelen aan het id dat die school uiteindelijk kreeg.
function herkoppelPersonen() {
  var K = capsuleKaarten(), ids = perId(lees('Scholen'));
  var mee = lees('Personen').filter(function (p) { return /^cap-o/.test(p.schoolId) && !ids[p.schoolId]; }).map(function (p) {
    var o = K.org[String(p.schoolId).slice(5)]; return o ? { id: p.id, schoolId: o.id } : null;
  }).filter(Boolean);
  schrijfVeel('Personen', mee);
}
function schooljaarVan(s) { var d = parseDatum(String(s || '').slice(0, 10)); if (!d) return huidigSchooljaar(); var j = d.getFullYear(); return d.getMonth() >= 7 ? j + '-' + (j + 1) : (j - 1) + '-' + j; }

/* ===================== Koppeling met de Cowork-map athena-assistent (data-run) ===================== */

// apiImporteer('Trajecten', [{school:..., traject:..., ...}, ...]) — rijen zonder id krijgen een stabiel id uit school+traject+schooljaar,
// zodat een herhaalde import dezelfde rij bijwerkt in plaats van dupliceert.
function apiImporteer(tabel, rijen) {
  alleenBeheerder();  // v2.0
  var naam = { scholen: 'Scholen', trajecten: 'Trajecten', kansen: 'Kansen', acties: 'Acties' }[String(tabel || '').toLowerCase()];
  if (!naam) throw new Error('Importeren kan naar scholen, trajecten, kansen of acties.');
  if (!(rijen instanceof Array)) throw new Error('rijen moet een lijst zijn.');
  var kop = TABELLEN[naam];
  return metLock(function () {
    var bestaand = {}, teSchrijven = [], ongewijzigd = 0;
    lees(naam).forEach(function (r) { bestaand[String(r.id)] = r; });
    rijen.forEach(function (r) {
      var o = {}; kop.forEach(function (k) { if (r[k] !== undefined) o[k] = r[k]; });
      if (!o.id) {
        if (naam === 'Trajecten') o.id = slug([o.school, o.traject, o.schooljaar].join('-'));
        else if (naam === 'Scholen') o.id = slug(o.naam);
        else if (naam === 'Kansen') o.id = slug([o.school, o.traject].join('-'));
        else o.id = slug(o.tekst);
      }
      var hit = bestaand[String(o.id)];
      // v1.1: standaardwaarden alleen voor nieuwe acties; een herhaalde import mag een afgevinkte actie niet heropenen
      if (naam === 'Acties' && !hit && !o.status) o.status = 'open';
      if (naam === 'Acties' && !hit && !o.aangemaakt) o.aangemaakt = nu();
      // ongewijzigde rijen niet opnieuw schrijven: anders telt de nachtelijke review elke import als "bijgewerkt"
      if (hit && Object.keys(o).every(function (k) { return k === 'id' || String(hit[k]) === String(o[k]); })) { ongewijzigd++; return; }
      teSchrijven.push(o);
    });
    var stats = schrijfVeel(naam, teSchrijven);
    stats.ongewijzigd = ongewijzigd;
    return stats;
  });
}

function apiStatus() {
  var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var laatste = lees('Reviews').sort(function (a, b) { return String(b.gemaaktOp).localeCompare(String(a.gemaaktOp)); })[0];
  var beheer = isBeheerder();
  return { versie: VERSIE, sheetUrl: beheer ? sheet().getUrl() : '', mapUrl: mapUrl(), gebruiker: ikUit(),  // v2.0: Sheet-link alleen voor de beheerder
    crmSyncTrigger: triggers.indexOf('crmSyncTrigger') >= 0, archiefTrigger: triggers.indexOf('archiveerTrigger') >= 0, laatsteCrmSync: P.getProperty('LAATSTE_CRM_SYNC') || '', capsuleToken: !!P.getProperty('CAPSULE_TOKEN'), capsuleMigratie: P.getProperty('CAPSULE_MIGRATIE') || '', model: P.getProperty('CLAUDE_MODEL') || 'claude-opus-5', effort: P.getProperty('CLAUDE_EFFORT') || 'medium',
    claudeIngesteld: !!P.getProperty('ANTHROPIC_API_KEY'), driveApi: typeof Drive !== 'undefined', laatsteIndex: P.getProperty('LAATSTE_INDEX') || '', laatsteReview: laatste ? laatste.gemaaktOp : '',
    rapportEmail: P.getProperty('RAPPORT_EMAIL') || '', reviewTrigger: triggers.indexOf('nachtelijkeReviewTrigger') >= 0, indexTrigger: triggers.indexOf('indexeerTrigger') >= 0, tijdzone: tz() };
}

/* ===================== 8. Alles aanpasbaar (v3.7) ===================== */

// Keuzelijsten: de beheerder past ze aan (tabblad Instellingen, JSON); zonder instelling gelden de standaardlijsten.
// Elke lijst hoort bij één kolom, zodat een hernoemde waarde in alle bestaande rijen meegaat.
var KEUZELIJSTEN = {
  schoolStatussen:  { standaard: SCHOOL_STATUSSEN, tab: 'Scholen', kolom: 'status' },
  taakCategorieen:  { standaard: TAAK_CATEGORIEEN, tab: 'Acties', kolom: 'categorie' },
  trajectStatussen: { standaard: TRAJECT_STATUSSEN, tab: 'Trajecten', kolom: 'status' },
  // v3.8: facturatie (zoals het monday-bord)
  soortFacturatie:  { standaard: ['vooraf', 'achteraf'], tab: 'Trajecten', kolom: 'soortFacturatie' },
  gefactureerd:     { standaard: ['ja', 'nee', 'n.v.t.'], tab: 'Trajecten', kolom: 'gefactureerd' },
  vakanties:        { standaard: ['doorbetaald', 'niet doorbetaald', 'n.v.t.'], tab: 'Trajecten', kolom: 'vakanties' },
  factuurStatussen: { standaard: ['nog te doen', 'aangemaakt', 'verzonden', 'betaald'], tab: 'Facturen', kolom: 'status' }
};
function instelling(sleutel) {
  var r = lees('Instellingen').filter(function (x) { return x.sleutel === sleutel; })[0];
  if (!r || r.waarde === '') return null;
  try { return JSON.parse(r.waarde); } catch (e) { return null; }
}
function zetInstelling(sleutel, waarde) {  // altijd binnen metLock
  var b = blad('Instellingen'), hit = lees('Instellingen').filter(function (x) { return x.sleutel === sleutel; })[0], v = JSON.stringify(waarde);
  if (hit) b.getRange(hit._rij, 2).setValue(v); else b.appendRow([sleutel, v]);
  vergeet('Instellingen');
}
function keuzelijst(sleutel) { var l = instelling(sleutel); return (l instanceof Array && l.length) ? l : KEUZELIJSTEN[sleutel].standaard.slice(); }
function schoolStatussen() { return keuzelijst('schoolStatussen'); }
function taakCategorieen() { return keuzelijst('taakCategorieen'); }
function trajectStatussen() { return keuzelijst('trajectStatussen'); }
function apiInstellingen() { var uit = {}; Object.keys(KEUZELIJSTEN).forEach(function (k) { uit[k] = keuzelijst(k); }); return uit; }
// lijst: [{waarde, oud}] in de gewenste volgorde; oud = de waarde zoals geladen (leeg bij een nieuwe).
function apiKeuzelijstOpslaan(sleutel, lijst) {
  alleenBeheerder();
  var def = KEUZELIJSTEN[sleutel]; if (!def) throw new Error('Onbekende lijst.');
  var waarden = [], hernoem = {};
  (lijst instanceof Array ? lijst : []).forEach(function (x) {
    var w = klein(x && typeof x === 'object' ? x.waarde : x); if (!w) return;
    if (waarden.indexOf(w) >= 0) throw new Error('Dubbele waarde: ' + w);
    waarden.push(w);
    if (x && x.oud && klein(x.oud) !== w) hernoem[klein(x.oud)] = w;
  });
  if (!waarden.length) throw new Error('Geef minstens één waarde.');
  metLock(function () {
    zetInstelling(sleutel, waarden);
    if (Object.keys(hernoem).length) wijzigKolom(def.tab, def.kolom, function (v) { return hernoem[klein(v)]; });
  });
  return apiInstellingen();
}
// Eén kolom in één keer lezen en schrijven (snel, ook bij duizenden rijen). fn(waarde) geeft de nieuwe waarde of undefined.
function wijzigKolom(tab, kolom, fn) {
  var kop = TABELLEN[tab], c = kop.indexOf(kolom), b = blad(tab), n = b.getLastRow() - 1, aantal = 0;
  if (c < 0 || n < 1) return 0;
  var r = b.getRange(2, c + 1, n, 1), waarden = r.getValues();
  waarden.forEach(function (rij) { var nieuw = fn(rij[0]); if (nieuw !== undefined && String(nieuw) !== String(rij[0])) { rij[0] = celUit(nieuw); aantal++; } });
  if (aantal) r.setValues(waarden);
  vergeet(tab);
  return aantal;
}
// Een gebruiker heet voortaan anders: overal waar zijn naam staat meenemen (de koppeling loopt nu nog op naam; in Supabase wordt dat een id).
function hernoemGebruiker(oud, nieuw) {
  var plekken = { Scholen: ['eigenaar', 'am'], Personen: ['eigenaar'], Kansen: ['eigenaar'], Acties: ['eigenaar'], Trajecten: ['am'], Activiteiten: ['door'], Activiteiten_archief: ['door'], Reviews: ['eigenaar'], Content: ['door'] };
  Object.keys(plekken).forEach(function (tab) { plekken[tab].forEach(function (k) { wijzigKolom(tab, k, function (v) { return String(v) === oud ? nieuw : undefined; }); }); });
  var doelen = lees('Doelen').filter(function (d) { return d.eigenaar === oud; });
  if (doelen.length) {
    verwijderRijen('Doelen', function (d) { return d.eigenaar === oud; });
    schrijfVeel('Doelen', doelen.map(function (d) { return { id: slug(nieuw + '-' + d.periode + '-' + d.metric), eigenaar: nieuw, periode: d.periode, metric: d.metric, doel: d.doel }; }));
  }
}

/* ----- Tijdlijn: activiteit wijzigen, afspraak verplaatsen ----- */

var ACTIVITEIT_VELDEN = ['id', 'type', 'datum', 'onderwerp', 'tekst', 'duurMin', 'schoolId', 'persoonId', 'kansId', 'trajectId'];
function apiActiviteitOpslaan(obj) {
  obj = obj || {};
  if (!obj.id) return apiActiviteitToevoegen(obj);
  var o = schoon(obj, ACTIVITEIT_VELDEN), oud = vind('Activiteiten', o.id);
  if (!oud) throw new Error('Activiteit niet gevonden (misschien al gearchiveerd).');
  if (!isBeheerder() && oud.door && oud.door !== ikNaam()) throw new Error('Alleen wie het vastlegde of de beheerder kan dit wijzigen.');
  if (o.type !== undefined && ACTIVITEIT_TYPES.concat(['fase', 'taak']).indexOf(o.type) < 0) throw new Error('Onbekend soort activiteit.');
  if (o.datum !== undefined) { o.datum = datumTijdIn(o.datum); if (!o.datum) throw new Error('Ongeldige datum.'); }
  if (o.duurMin !== undefined) o.duurMin = Number(o.duurMin) || '';
  ['onderwerp', 'tekst'].forEach(function (k) { if (o[k] !== undefined) o[k] = String(o[k]).trim(); });
  [['schoolId', 'Scholen'], ['persoonId', 'Personen'], ['kansId', 'Kansen'], ['trajectId', 'Trajecten']].forEach(function (x) { if (o[x[0]] && !vind(x[1], o[x[0]])) throw new Error('Koppeling niet gevonden.'); });
  var na = function (k) { return o[k] !== undefined ? o[k] : oud[k]; };
  if (!na('schoolId') && !na('persoonId') && !na('kansId') && !na('trajectId')) throw new Error('Koppel de activiteit aan een school, persoon of kans.');
  if (!na('tekst') && !na('onderwerp')) throw new Error('Geen tekst.');
  var a = metLock(function () { controleerConflict('Activiteiten', o.id, o, obj._oud); var x = schrijf('Activiteiten', o); zetLaatsteContact([x]); return x; });
  var agenda = false;
  if (a.agendaId && obj.agendaBijwerken !== false && ['datum', 'duurMin', 'onderwerp', 'tekst'].some(function (k) { return o[k] !== undefined; })) {
    agenda = agendaEvent(a.agendaId, function (ev) {
      var start = parseDatum(a.datum), duur = Math.max(5, Number(a.duurMin) || Math.round((ev.getEndTime() - ev.getStartTime()) / 60000) || 60);
      if (start) ev.setTime(start, new Date(start.getTime() + duur * 60000));
      if (a.onderwerp) ev.setTitle(a.onderwerp);
      if (o.tekst !== undefined) ev.setDescription(a.tekst || '');
    });
  }
  var u = activiteitUit(a, perId(lees('Scholen')), perId(lees('Personen')), perId(lees('Kansen')));
  u.agendaBijgewerkt = agenda;
  return u;
}
// Een afspraak die de app zelf in Google Agenda zette (sleutel = agendaSleutel). Herhalende afspraken laten we met rust: dan zou de hele reeks veranderen.
function agendaEvent(sleutel, fn) {
  sleutel = String(sleutel || '');
  if (!sleutel || /@\d{4}-\d{2}-\d{2}$/.test(sleutel)) return false;
  try { var ev = CalendarApp.getDefaultCalendar().getEventById(sleutel); if (!ev) return false; fn(ev); return true; } catch (e) { return false; }
}

/* ----- Taken: heropenen, track stoppen ----- */

function apiTaakHeropen(id) {
  var a = vind('Acties', id); if (!a) throw new Error('Taak niet gevonden.');
  var x = metLock(function () { return schrijf('Acties', { id: id, status: 'open', afgerond: '' }); });
  return taakUit(x, perId(lees('Scholen')), perId(lees('Personen')), perId(lees('Kansen')));
}
// De rest van een gestarte track: de open taken van die run weghalen.
function apiTrackStoppen(trackRunId) {
  if (!trackRunId) throw new Error('Geen track.');
  var open = lees('Acties').filter(function (a) { return String(a.trackRunId) === String(trackRunId) && a.status !== 'af'; });
  if (!open.length) return { aantal: 0 };
  var eerste = open[0];
  metLock(function () {
    verwijderRijen('Acties', function (a) { return String(a.trackRunId) === String(trackRunId) && a.status !== 'af'; });
    schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: eerste.schoolId, persoonId: eerste.persoonId, kansId: eerste.kansId, onderwerp: 'Track gestopt (' + open.length + ' open taken weggehaald)', bron: 'app', aangemaakt: nu() });
  });
  return { aantal: open.length };
}
function apiTrackVerwijderen(id) {
  alleenBeheerder();
  return metLock(function () {
    if (!lees('Tracks').length) schrijfVeel('Tracks', STANDAARD_TRACKS.map(function (t) { return { id: t.id, naam: t.naam, omschrijving: t.omschrijving, stappen: t.stappen }; }));
    verwijderRijen('Tracks', function (t) { return String(t.id) === String(id); });
    if (!lees('Tracks').length) schrijf('Tracks', { id: 'leeg', naam: '', omschrijving: '', stappen: [] });  // alle tracks weg: niet terugvallen op de standaardtracks
    return tracks();
  });
}

/* ----- Huisstijl, teksten, tags en documenten ----- */

function zetHuisstijlVeld(sleutel, waarde) {  // altijd binnen metLock
  if (!HUISSTIJL_STANDAARD.hasOwnProperty(sleutel)) throw new Error('Onbekend huisstijlveld: ' + sleutel);
  waarde = String(waarde == null ? '' : waarde);
  if (/^kleur_/.test(sleutel) && !/^#[0-9a-fA-F]{6}$/.test(waarde)) throw new Error('Kleur als #RRGGBB.');
  var b = blad('Huisstijl'), hit = lees('Huisstijl').filter(function (r) { return r.sleutel === sleutel; })[0];
  if (hit) b.getRange(hit._rij, 2).setValue(celUit(waarde)); else b.appendRow([sleutel, celUit(waarde)]);
  vergeet('Huisstijl');
}
// Meerdere velden in één keer (één verzoek in plaats van één per veld).
function apiHuisstijlOpslaan(obj) {
  alleenBeheerder();
  obj = obj || {};
  Object.keys(obj).forEach(function (k) { if (!HUISSTIJL_STANDAARD.hasOwnProperty(k)) throw new Error('Onbekend huisstijlveld: ' + k); });
  metLock(function () { Object.keys(obj).forEach(function (k) { zetHuisstijlVeld(k, obj[k]); }); });
  return apiHuisstijl();
}
function apiContentOpslaan(obj) {
  obj = obj || {};
  var c = vind('Content', obj.id); if (!c) throw new Error('Tekst niet gevonden.');
  if (!isBeheerder() && c.door !== ikNaam()) throw new Error('Alleen wie de tekst maakte of de beheerder kan hem wijzigen.');
  var o = { id: c.id };
  if (obj.onderwerp !== undefined) o.onderwerp = String(obj.onderwerp).trim();
  if (obj.tekst !== undefined) { o.tekst = String(obj.tekst).trim(); if (!o.tekst) throw new Error('De tekst is leeg.'); }
  var x = metLock(function () { return schrijf('Content', o); });
  return { id: x.id, datum: x.datum, type: x.type, typeNaam: (CONTENT_TYPES[x.type] || {}).naam || x.type, onderwerp: x.onderwerp, tekst: x.tekst, door: x.door };
}
// Tag overal hernoemen; nieuw leeg = de tag overal weghalen.
function apiTagHernoem(oud, nieuw) {
  alleenBeheerder();
  oud = klein(oud); nieuw = klein(nieuw); if (!oud) throw new Error('Welke tag?');
  var n = 0;
  metLock(function () {
    ['Scholen', 'Personen', 'Kansen'].forEach(function (tab) {
      n += wijzigKolom(tab, 'tags', function (v) {
        var tags = tagsUit(v).map(klein); if (tags.indexOf(oud) < 0) return undefined;
        return uniek(tags.map(function (t) { return t === oud ? nieuw : t; }).filter(Boolean)).join(', ');
      });
    });
  });
  return { aantal: n };
}
// Eigen veld (velden-JSON) overal hernoemen; nieuw leeg = het veld overal weghalen.
function apiVeldHernoem(oud, nieuw) {
  alleenBeheerder();
  oud = String(oud || '').trim(); nieuw = String(nieuw || '').trim(); if (!oud) throw new Error('Welk veld?');
  var n = 0;
  metLock(function () {
    ['Scholen', 'Personen', 'Kansen'].forEach(function (tab) {
      n += wijzigKolom(tab, 'velden', function (v) {
        var o = veldenUit(v); if (!o.hasOwnProperty(oud)) return undefined;
        var uit = {}; Object.keys(o).forEach(function (k) { if (k !== oud) uit[k] = o[k]; else if (nieuw) uit[nieuw] = o[k]; });
        return uit;
      });
    });
  });
  return { aantal: n };
}
function apiVelden() {  // alle eigen velden en tags die in gebruik zijn, voor het beheerscherm
  var velden = {}, tags = {};
  ['Scholen', 'Personen', 'Kansen'].forEach(function (tab) {
    lees(tab).forEach(function (r) {
      Object.keys(veldenUit(r.velden)).forEach(function (k) { velden[k] = (velden[k] || 0) + 1; });
      tagsUit(r.tags).forEach(function (t) { t = klein(t); tags[t] = (tags[t] || 0) + 1; });
    });
  });
  var lijst = function (m) { return Object.keys(m).sort().map(function (k) { return { naam: k, aantal: m[k] }; }); };
  return { velden: lijst(velden), tags: lijst(tags) };
}
// Type en school van een document corrigeren; de correctie blijft staan bij het volgende inlezen (Instellingen: documentCorrecties).
function apiDocumentOpslaan(id, obj) {
  obj = obj || {};
  var d = lees('Documenten', true).filter(function (x) { return String(x.id) === String(id); })[0]; if (!d) throw new Error('Document niet gevonden.');
  if (obj.type !== undefined && DOC_TYPES.indexOf(obj.type) < 0) throw new Error('Onbekend type.');
  var kop = TABELLEN.Documenten, b = blad('Documenten');
  return metLock(function () {
    var c = instelling('documentCorrecties') || {}, corr = c[d.driveId] || {};
    ['type', 'school'].forEach(function (k) {
      if (obj[k] === undefined) return;
      var v = String(obj[k]).trim(); corr[k] = v; d[k] = v;
      b.getRange(d._rij, kop.indexOf(k) + 1).setValue(celUit(v));
    });
    c[d.driveId] = corr; zetInstelling('documentCorrecties', c); vergeet('Documenten');
    return { id: d.id, titel: d.titel, type: d.type, school: d.school, url: d.url, gewijzigd: d.gewijzigd, woorden: Number(d.woorden) || 0 };
  });
}

/* ===================== 9. Projecten en facturatie (v3.8) ===================== */

// Een gewonnen kans wordt een project voor de accountmanager, met alles wat de adviseur wist (altijd binnen metLock).
// Bestaat er al een project bij deze kans (bijv. na heropenen en opnieuw winnen), dan blijft het bij dat project.
function projectUitKans(k, school) {
  var bestaand = lees('Trajecten').filter(function (t) { return String(t.kansId) === String(k.id); })[0];
  if (bestaand) return bestaand;
  var s = school || vind('Scholen', k.schoolId) || {}, p = k.persoonId ? vind('Personen', k.persoonId) : null;
  var am = k.am || '', adviseur = k.eigenaar || ikNaam();
  var t = schrijf('Trajecten', { schoolId: k.schoolId, school: k.school || s.naam || '', plaats: s.plaats || '', traject: k.traject || k.naam, schooljaar: huidigSchooljaar(), status: 'actief',
    omzet: Number(k.waarde) || 0, am: am, adviseur: adviseur, kansId: k.id, contactpersoon: p ? persoonNaam(p) + (p.email ? ' <' + p.email + '>' : '') : '', samenvatting: String(k.notities || '').trim() });
  var regels = ['Kans gewonnen door ' + adviseur + ': ' + (k.naam || k.traject) + '.'];
  if (Number(k.waarde)) regels.push('Waarde: € ' + Math.round(Number(k.waarde)) + '.');
  if (p) regels.push('Contactpersoon: ' + persoonNaam(p) + [p.functie, p.email, p.telefoon].filter(Boolean).map(function (x) { return ', ' + x; }).join('') + '.');
  if (k.volgendeActie) regels.push('Afgesproken vervolg: ' + k.volgendeActie + (k.deadline ? ' (' + k.deadline + ')' : '') + '.');
  if (k.notities) regels.push('\nOmschrijving van de adviseur:\n' + k.notities);
  regels.push('\nDe volledige historie van de kans staat hieronder in de tijdlijn.');
  schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: adviseur, schoolId: k.schoolId, persoonId: k.persoonId || '', kansId: k.id, trajectId: t.id, bron: 'app', aangemaakt: nu(),
    onderwerp: 'Overdracht naar ' + (am || 'de accountmanager'), tekst: regels.join('\n') });
  var voor = am || (P.getProperty('NAAM') || 'Menno'), basis = { status: 'open', bron: 'project', aangemaakt: nu(), eigenaar: voor, schoolId: k.schoolId, persoonId: k.persoonId || '', kansId: k.id, trajectId: t.id };
  var taken = am ? [] : [{ tekst: 'Accountmanager toewijzen aan ' + (k.naam || k.traject) + ' (' + (k.school || s.naam || '') + ')', categorie: 'opvolgen', prio: 'hoog', deadline: datumStr(plusDagen(1)) }];
  taken = taken.concat([
    { tekst: 'Startgesprek plannen met ' + (p ? persoonNaam(p) : (k.school || s.naam || 'de school')), categorie: 'afspraak', prio: 'hoog', deadline: datumStr(plusDagen(3)) },
    { tekst: 'Facturatie instellen voor ' + (k.naam || k.traject), categorie: 'overig', prio: 'midden', deadline: datumStr(plusDagen(5)) }]);
  schrijfVeel('Acties', taken.map(function (x) { var o = {}; Object.keys(basis).forEach(function (b) { o[b] = basis[b]; }); Object.keys(x).forEach(function (b) { o[b] = x[b]; }); return o; }));
  return t;
}

// Alles van één project: info, school, kans, tijdlijn (ook de historie van de kans), taken, facturen, en mails van de school die nog niet aan een project hangen.
function apiProject(id) {
  var t = vind('Trajecten', id); if (!t) throw new Error('Project niet gevonden.');
  var s = t.schoolId ? vind('Scholen', t.schoolId) : lees('Scholen').filter(function (x) { return klein(x.naam) === klein(t.school); })[0] || null;
  var k = t.kansId ? vind('Kansen', t.kansId) : null, sMap = {}, kMap = {};
  if (s) sMap[s.id] = s; if (k) kMap[k.id] = k;
  var personen = s ? lees('Personen').filter(function (p) { return String(p.schoolId) === String(s.id); }) : [], pMap = perId(personen);
  var hoort = function (x) { return String(x.trajectId) === String(id) || (k && String(x.kansId) === String(k.id)); };
  var acts = lees('Activiteiten'), grens = datumStr(plusDagen(-60));
  return {
    project: trajectUit(t), school: s ? { id: s.id, naam: s.naam, plaats: s.plaats, email: s.email, telefoon: s.telefoon } : null,
    kans: k ? kansUit(k, mijlpaalMap()) : null,
    personen: personen.map(function (p) { return persoonUit(p, sMap); }),
    taken: lees('Acties').filter(function (a) { return a.status !== 'af' && hoort(a); }).sort(sorteerActies).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    tijdlijn: tijdlijn(acts.filter(hoort), sMap, pMap, kMap),
    losseMails: s ? tijdlijn(acts.filter(function (a) { return a.type === 'mail' && !a.trajectId && String(a.schoolId) === String(s.id) && String(a.datum).slice(0, 10) >= grens; }), sMap, pMap, kMap).slice(0, 15) : [],
    facturen: facturenVan(id),
    keuzes: facturatieKeuzes()
  };
}
function facturatieKeuzes() { return { soortFacturatie: keuzelijst('soortFacturatie'), gefactureerd: keuzelijst('gefactureerd'), vakanties: keuzelijst('vakanties'), factuurStatussen: keuzelijst('factuurStatussen'), trajectStatussen: trajectStatussen() }; }
function factuurUit(f) {
  return { id: f.id, trajectId: f.trajectId, omschrijving: f.omschrijving, bedrag: Number(f.bedrag) || 0, datum: f.datum || '', status: f.status || 'nog te doen', factuurnummer: f.factuurnummer || '',
    bijzonderheden: f.bijzonderheden || '', exactId: f.exactId || '', door: f.door || '' };
}
function facturenVan(trajectId, alle) {
  return (alle || lees('Facturen')).filter(function (f) { return String(f.trajectId) === String(trajectId); })
    .sort(function (a, b) { return String(a.datum || '9999').localeCompare(String(b.datum || '9999')); }).map(factuurUit);
}
// Het facturatiebord: alle projecten met hun facturatievelden en termijnen. Gestopte en afgeronde projecten van vorige schooljaren blijven weg.
function apiFacturatie() {
  var alle = lees('Facturen'), sj = huidigSchooljaar();
  var ts = lees('Trajecten').filter(function (t) { return ['gestopt', 'afgerond'].indexOf(t.status) < 0 || t.schooljaar === sj || alle.some(function (f) { return String(f.trajectId) === String(t.id) && f.status !== 'betaald'; }); });
  return {
    projecten: ts.map(function (t) { var u = trajectUit(t); u.facturen = facturenVan(t.id, alle); return u; })
      .sort(function (a, b) { return String(a.am).localeCompare(String(b.am)) || String(a.school).localeCompare(String(b.school)); }),
    keuzes: facturatieKeuzes(), gebruikers: gebruikersNamen(), ik: ikUit()
  };
}
var FACTUUR_VELDEN = ['id', 'trajectId', 'omschrijving', 'bedrag', 'datum', 'status', 'factuurnummer', 'bijzonderheden'];
function apiFactuurOpslaan(obj) {
  obj = obj || {};
  var o = schoon(obj, FACTUUR_VELDEN), oud = o.id ? vind('Facturen', o.id) : null;
  if (o.id && !oud) throw new Error('Termijn niet gevonden.');
  var tid = o.trajectId || (oud && oud.trajectId); if (!tid || !vind('Trajecten', tid)) throw new Error('Project niet gevonden.');
  if (o.status !== undefined && keuzelijst('factuurStatussen').indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.bedrag !== undefined && o.bedrag !== '') o.bedrag = Number(String(o.bedrag).replace(',', '.')) || 0;
  if (o.omschrijving !== undefined) o.omschrijving = String(o.omschrijving).trim();
  if (!oud && !o.omschrijving) throw new Error('Geef de termijn een omschrijving.');
  if (!oud) { o.aangemaakt = nu(); o.door = ikNaam(); o.status = o.status || keuzelijst('factuurStatussen')[0]; }
  var f = metLock(function () { controleerConflict('Facturen', o.id, o, obj._oud); return schrijf('Facturen', o); });
  return factuurUit(f);
}
// Termijnen in één keer: per maand van start tot eind (schoolvakantie juli/augustus overslaan), of één factuur vooraf.
function apiFacturenMaken(trajectId, opties) {
  opties = opties || {};
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Project niet gevonden.');
  var start = parseDatum(opties.van || t.start), eind = parseDatum(opties.tot || t.eind), lijst = [];
  if (opties.per === 'eenmalig') lijst.push({ omschrijving: opties.omschrijving || 'Factuur vooraf', datum: datumStr(start || new Date()), bedrag: Number(opties.bedrag) || Number(t.omzet) || '' });
  else {
    if (!start || !eind || eind < start) throw new Error('Vul eerst de start- en einddatum van het project in.');
    var d = new Date(start.getFullYear(), start.getMonth(), 1), zomer = opties.zomer !== true;
    while (d <= eind && lijst.length < 24) {
      if (!(zomer && (d.getMonth() === 6 || d.getMonth() === 7))) lijst.push({ omschrijving: MAANDEN[d.getMonth()].charAt(0).toUpperCase() + MAANDEN[d.getMonth()].slice(1) + ' ' + d.getFullYear(), datum: datumStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)) });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    var per = opties.bedrag !== undefined && opties.bedrag !== '' ? Number(opties.bedrag) : (Number(t.omzet) && lijst.length ? Math.round(Number(t.omzet) / lijst.length * 100) / 100 : '');
    lijst.forEach(function (f) { f.bedrag = per; });
  }
  var status = keuzelijst('factuurStatussen')[0];
  metLock(function () { schrijfVeel('Facturen', lijst.map(function (f) { f.trajectId = trajectId; f.status = status; f.aangemaakt = nu(); f.door = ikNaam(); return f; })); });
  return facturenVan(trajectId);
}
// CSV voor import in Exact Online (tot de directe koppeling er is): standaard de termijnen met status 'aangemaakt'.
function apiFacturenExport(status) {
  status = status || 'aangemaakt';
  var tMap = perId(lees('Trajecten')), sMap = perId(lees('Scholen'));
  var cel = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var rijen = lees('Facturen').filter(function (f) { return !status || f.status === status; }).map(function (f) {
    var t = tMap[f.trajectId] || {}, s = sMap[t.schoolId] || {};
    return [f.datum, t.school || s.naam || '', s.email || '', t.traject || '', f.omschrijving, String(Number(f.bedrag) || 0).replace('.', ','), f.factuurnummer || '', t.am || '', f.bijzonderheden || ''].map(cel).join(';');
  });
  return { bestandsnaam: 'facturen-' + (status || 'alle').replace(/\W+/g, '-') + '-' + datumStr(new Date()) + '.csv', csv: ['Factuurdatum;Debiteur;E-mail;Project;Omschrijving;Bedrag;Factuurnummer;Accountmanager;Bijzonderheden'].concat(rijen).join('\n'), aantal: rijen.length };
}

// AI-samenvatting van alles rond een school (zoals "Summarise history" in Capsule), met het snelle model van het Brein.
function apiSchoolSamenvatting(id) {
  var d = apiSchool(id), regels = [];
  regels.push('School: ' + d.school.naam + (d.school.plaats ? ' (' + d.school.plaats + ')' : '') + ', status ' + (d.school.status || '-') + ', eigenaar ' + (d.school.eigenaar || '-') + '.');
  d.kansen.forEach(function (k) { regels.push('Kans: ' + k.naam + ', ' + k.fase + ', € ' + k.waarde + (k.volgendeActie ? ', volgende actie: ' + k.volgendeActie : '') + '.'); });
  d.trajecten.forEach(function (t) { regels.push('Project: ' + t.traject + ' ' + t.schooljaar + ', ' + t.status + (t.am ? ', AM ' + t.am : '') + '.'); });
  d.taken.slice(0, 10).forEach(function (t) { regels.push('Open taak: ' + t.tekst + (t.deadline ? ' (' + t.deadline + ')' : '') + ', ' + t.eigenaar + '.'); });
  d.tijdlijn.slice(0, 60).forEach(function (a) { regels.push('[' + a.datum + '] ' + a.type + ' door ' + a.door + ': ' + (a.onderwerp || '') + (a.tekst ? ' — ' + String(a.tekst).replace(/\s+/g, ' ').slice(0, 400) : '')); });
  var systeem = 'Je vat de relatie van AthenaSchool met één school samen voor een collega. Nederlands, zakelijk en kort: maximaal 8 opsommingstekens. ' +
    'Volgorde: stand van zaken, lopende projecten, open kansen, recente contacten (wie, wanneer), afspraken en wat nu moet gebeuren. Geen namen van leerlingen. Verzin niets.';
  var data = claudeVerzoek({ max_tokens: 2000, system: systeem, messages: [{ role: 'user', content: regels.join('\n').slice(0, 30000) }] }, 'low', P.getProperty('BREIN_MODEL') || 'claude-sonnet-5-5');
  if (data.stop_reason === 'refusal') return { tekst: 'Samenvatten lukte niet voor deze school.' };
  return { tekst: tekstUit(data), gemaakt: nu() };
}

/* ===================== 7. Brein als persoonlijke assistent (v3.5) ===================== */

// Claude met tools. Leestools draaien direct; actietools voert de backend NIET uit maar geeft ze terug als voorstel.
// De app toont een kaart (Uitvoeren / Aanpassen / Annuleren) en pas na bevestiging volgt apiBreinUitvoeren.
var BREIN_LEES = {
  zoek_crm: { description: 'Zoek scholen, personen, kansen (deals) en projecten (trajecten) in het CRM op naam, plaats, e-mail of onderwerp. Geeft id\'s terug die je in andere tools gebruikt.',
    properties: { zoekterm: { type: 'string', description: 'Bijvoorbeeld een schoolnaam, plaats of achternaam.' } }, required: ['zoekterm'] },
  lees_school: { description: 'Alles over één school: gegevens, personen, kansen, projecten, open taken en de laatste tijdlijn.',
    properties: { schoolId: { type: 'string' } }, required: ['schoolId'] },
  zoek_documenten: { description: 'Zoek in de kennisbank (contracten, werkwijzen, schooldossiers, voorstellen, prijslijst) en geef de tekst van de best passende documenten.',
    properties: { zoekterm: { type: 'string' } }, required: ['zoekterm'] },
  zoek_mail: { description: 'Zoek in de Gmail van de gebruiker (Gmail-zoeksyntax mag, bijvoorbeeld from:naam of subject:rooster). Geeft threadId, afzender, onderwerp en een fragment.',
    properties: { zoekterm: { type: 'string' } }, required: ['zoekterm'] },
  lees_mail: { description: 'Lees een mailgesprek uit de Gmail van de gebruiker (de laatste berichten, met afzender en tekst).',
    properties: { threadId: { type: 'string' } }, required: ['threadId'] },
  mijn_agenda: { description: 'De agenda van de gebruiker tussen twee datums (yyyy-MM-dd, maximaal 31 dagen).',
    properties: { van: { type: 'string' }, tot: { type: 'string' } }, required: ['van', 'tot'] },
  mijn_taken: { description: 'De open taken van de gebruiker.', properties: {}, required: [] }
};
var KOPPEL_PROPS = { schoolId: { type: 'string' }, persoonId: { type: 'string' }, kansId: { type: 'string' } };
function metKoppeling(props) { var o = {}; Object.keys(props).forEach(function (k) { o[k] = props[k]; }); Object.keys(KOPPEL_PROPS).forEach(function (k) { o[k] = KOPPEL_PROPS[k]; }); return o; }
var BREIN_ACTIES = {
  maak_offerte: { titel: 'Offerte maken', description: 'Stel een offerte voor als Google Doc in de huisstijl. Zoek eerst de school en de tarieven op (zoek_crm, zoek_documenten met "prijslijst"). ' +
      'Schrijf alle teksten volledig uit in het Nederlands; reken de kosten concreet door (aantal ondersteuners × uren × dagen × tarief). Verzin geen tarieven: staat het tarief nergens, zet dan "[tarief invullen]".',
    properties: metKoppeling({ titel: { type: 'string' }, school: { type: 'string', description: 'Naam van de school.' }, contactpersoon: { type: 'string' },
      inleiding: { type: 'string' }, hulpvraag: { type: 'string' }, aanpak: { type: 'string', description: 'De inzet: wie, wat, hoeveel ondersteuners.' },
      rooster: { type: 'string', description: 'Dagen, tijden, periode.' }, kosten: { type: 'string', description: 'Tarief en berekening.' }, voorwaarden: { type: 'string' }, afsluiting: { type: 'string' } }),
    required: ['titel', 'school', 'hulpvraag', 'aanpak', 'rooster', 'kosten'] },
  maak_conceptmail: { titel: 'Conceptmail', description: 'Zet een concept klaar in de Gmail van de gebruiker (nooit versturen). Lees bij een reactie eerst de mail met lees_mail en geef dan de threadId mee; de reactie gaat naar de afzender van het laatste bericht.',
    properties: { threadId: { type: 'string' }, aan: { type: 'string', description: 'E-mailadres; alleen nodig zonder threadId.' }, onderwerp: { type: 'string' }, tekst: { type: 'string', description: 'De volledige mailtekst met aanhef en afsluiting.' } },
    required: ['tekst'] },
  maak_taak: { titel: 'Taak aanmaken', description: 'Maak een taak in het CRM.',
    properties: metKoppeling({ tekst: { type: 'string' }, deadline: { type: 'string', description: 'yyyy-MM-dd' }, prio: { type: 'string', enum: ['hoog', 'midden', 'laag'] }, eigenaar: { type: 'string', description: 'Naam van een collega; standaard de gebruiker zelf.' }, notitie: { type: 'string' } }),
    required: ['tekst'] },
  log_activiteit: { titel: 'Activiteit vastleggen', description: 'Leg een notitie, gesprek, mail of afspraak vast op de tijdlijn van een school, persoon of kans.',
    properties: metKoppeling({ type: { type: 'string', enum: ['notitie', 'gesprek', 'mail', 'afspraak'] }, onderwerp: { type: 'string' }, tekst: { type: 'string' }, datum: { type: 'string', description: 'yyyy-MM-dd HH:mm, standaard nu' } }),
    required: ['type', 'onderwerp'] },
  wijzig_kans: { titel: 'Kans bijwerken', description: 'Wijzig een bestaande kans: mijlpaal (fase), waarde, volgende actie, deadline of verwachte sluiting. Geef alleen de velden die veranderen.',
    properties: { kansId: { type: 'string' }, fase: { type: 'string' }, waarde: { type: 'number' }, volgendeActie: { type: 'string' }, deadline: { type: 'string' }, verwachteSluiting: { type: 'string' } },
    required: ['kansId'] },
  plan_afspraak: { titel: 'Afspraak plannen', description: 'Plan een afspraak in de agenda van de gebruiker, gekoppeld aan een school, persoon of kans.',
    properties: metKoppeling({ titel: { type: 'string' }, start: { type: 'string', description: 'yyyy-MM-dd HH:mm' }, duurMin: { type: 'number' }, locatie: { type: 'string' }, notitie: { type: 'string' }, uitnodigen: { type: 'boolean', description: 'De gekoppelde persoon uitnodigen.' } }),
    required: ['titel', 'start'] }
};
function breinTools() {
  var maak = function (naam, t) { return { name: naam, description: t.description, input_schema: { type: 'object', properties: t.properties, required: t.required } }; };
  return Object.keys(BREIN_LEES).map(function (n) { return maak(n, BREIN_LEES[n]); }).concat(Object.keys(BREIN_ACTIES).map(function (n) { return maak(n, BREIN_ACTIES[n]); }));
}
function breinSysteem() {
  var h = huisstijl(), ik = ikUit(), rol = { beheerder: 'beheerder (management)', adviseur: 'onderwijsadviseur (haalt opdrachten binnen)', am: 'accountmanager (voert projecten uit)' }[ik.rol] || ik.rol;
  var prijzen = lees('Documenten').filter(function (d) { return d.type === 'prijslijst'; }).slice(0, 3).map(function (d) {
    return '<document titel="' + xmlAttr(d.titel) + '">\n' + String(d.tekst || '').slice(0, 6000) + '\n</document>';
  }).join('\n');
  return 'Je bent Athena, de persoonlijke assistent van ' + ik.naam + ', ' + rol + ' bij ' + h.bedrijf + '. Over het bedrijf: ' + h.omschrijving +
    '\n\nVandaag is het ' + datumLang(new Date()) + ' ' + new Date().getFullYear() + ' (' + datumStr(new Date()) + ').' +
    '\n\nJe helpt met vragen en met werk in het CRM: offertes, conceptmails, taken, activiteiten, kansen en afspraken. Werkwijze:' +
    '\n- Zoek eerst op wat je nodig hebt met de leestools; vraag de gebruiker alleen iets als je het echt niet kunt vinden.' +
    '\n- Acties (maak_offerte, maak_conceptmail, maak_taak, log_activiteit, wijzig_kans, plan_afspraak) worden niet direct uitgevoerd: de gebruiker ziet ze als voorstel en bevestigt zelf. Zeg dus "ik heb een voorstel klaargezet", niet "gedaan".' +
    '\n- Koppel acties waar mogelijk aan een school, persoon of kans (met de id uit zoek_crm).' +
    (ik.gekoppeld ? '' : '\n- De Gmail en agenda van deze gebruiker zijn nog niet gekoppeld: mail- en agendatools geven dan een melding. Bied in dat geval de mailtekst gewoon in je antwoord aan.') +
    '\n- Antwoord in het Nederlands, kort en concreet, als een goed ingewerkte collega. Noem nooit namen van leerlingen.' +
    '\n\nToon en stijl voor teksten namens het bedrijf:\n' + h.toon + '\n\nStandaardzinnen (alleen waar ze passen):\n' + h.zinnen +
    (prijzen ? '\n\nPrijslijst:\n' + prijzen : '') +
    '\n\nBedrijfsgegevens (uit de Sheet):\n' + feitenSamenvatting();
}
// bericht: de nieuwe vraag. gesprek: [{rol:'ik'|'bot', tekst}] — eerdere beurten als platte tekst (de app bewaart ze).
function apiBrein(bericht, gesprek) {
  bericht = String(bericht || '').trim(); if (!bericht) throw new Error('Geen vraag.');
  var berichten = [];
  (gesprek instanceof Array ? gesprek : []).slice(-12).forEach(function (m) {
    var role = m && m.rol === 'ik' ? 'user' : 'assistant', tekst = String((m && m.tekst) || '').slice(0, 6000).trim();
    if (!tekst) return;
    if (!berichten.length && role === 'assistant') return;  // een gesprek begint altijd bij de gebruiker
    var vorige = berichten[berichten.length - 1];
    if (vorige && vorige.role === role) vorige.content += '\n\n' + tekst; else berichten.push({ role: role, content: tekst });
  });
  if (berichten.length && berichten[berichten.length - 1].role === 'user') berichten[berichten.length - 1].content += '\n\n' + bericht;
  else berichten.push({ role: 'user', content: bericht });
  var systeem = [{ type: 'text', text: breinSysteem(), cache_control: { type: 'ephemeral' } }], tools = breinTools();
  var bronnen = [], acties = [], teksten = [], start = Date.now(), data = null;
  for (var ronde = 0; ronde < 8; ronde++) {
    data = claudeVerzoek({ max_tokens: 16000, system: systeem, tools: tools, messages: berichten }, P.getProperty('BREIN_EFFORT') || 'medium', P.getProperty('BREIN_MODEL') || 'claude-sonnet-5-5');  // v3.6: Sonnet is sneller en goedkoper voor deze taken
    if (data.stop_reason === 'refusal') { teksten = ['Hier kan ik niet bij helpen: het verzoek is door de veiligheidsfilters geweigerd.']; break; }
    var t = tekstUit(data); if (t) teksten.push(t);
    var gebruik = (data.content || []).filter(function (b) { return b.type === 'tool_use'; });
    if (data.stop_reason === 'max_tokens') { teksten.push('(Antwoord afgekapt — maak de vraag kleiner.)'); break; }
    if (data.stop_reason !== 'tool_use' || !gebruik.length) break;
    berichten.push({ role: 'assistant', content: data.content });  // ongewijzigd terug, inclusief thinking-blokken
    berichten.push({ role: 'user', content: gebruik.map(function (b) { return breinTool(b, bronnen, acties); }) });
    if (Date.now() - start > 240000) { teksten.push('(Ik ben gestopt om binnen de tijd te blijven; vraag gerust verder.)'); break; }
  }
  return { antwoord: teksten.join('\n\n') || (acties.length ? 'Ik heb een voorstel klaargezet.' : 'Ik heb geen antwoord kunnen vormen.'), bronnen: bronnen, acties: acties };
}
function breinTool(blok, bronnen, acties) {
  var uit = function (inhoud, fout) { var r = { type: 'tool_result', tool_use_id: blok.id, content: typeof inhoud === 'string' ? inhoud : JSON.stringify(inhoud) }; if (fout) r.is_error = true; return r; };
  var invoer = blok.input || {};
  try {
    if (BREIN_ACTIES[blok.name]) {
      var schoon = breinActieCheck(blok.name, invoer);
      var a = { id: blok.id, soort: blok.name, titel: BREIN_ACTIES[blok.name].titel, invoer: schoon };
      acties.push(a);
      return uit('Voorstel klaargezet; de gebruiker bevestigt het zelf in de app.');
    }
    if (!BREIN_LEES[blok.name]) return uit('Onbekende tool: ' + blok.name, true);
    return uit(breinLees(blok.name, invoer, bronnen));
  } catch (e) { return uit(String((e && e.message) || e), true); }
}
function breinLees(naam, inv, bronnen) {
  if (naam === 'zoek_crm') return breinZoekCrm(String(inv.zoekterm || ''));
  if (naam === 'lees_school') {
    var r = apiSchool(String(inv.schoolId || ''));
    var trajecten = lees('Trajecten').filter(function (t) { return String(t.schoolId) === String(r.school.id) || klein(t.school) === klein(r.school.naam); });
    return {
      school: r.school, personen: r.personen.map(function (p) { return { id: p.id, naam: p.naam, functie: p.functie, email: p.email, telefoon: p.telefoon }; }),
      kansen: r.kansen.map(function (k) { return { id: k.id, naam: k.naam, fase: k.fase, waarde: k.waarde, volgendeActie: k.volgendeActie, deadline: k.deadline, eigenaar: k.eigenaar }; }),
      projecten: trajecten.map(function (t) { return { id: t.id, traject: t.traject, schooljaar: t.schooljaar, status: t.status, ondersteuners: t.ondersteuners, urenPerWeek: t.urenPerWeek, tarief: t.tarief, am: t.am }; }),
      taken: (r.taken || []).slice(0, 15).map(function (a) { return { tekst: a.tekst, deadline: a.deadline, eigenaar: a.eigenaar }; }),
      tijdlijn: (r.tijdlijn || []).slice(0, 15).map(function (a) { return { datum: a.datum, type: a.type, door: a.door, onderwerp: a.onderwerp, tekst: String(a.tekst || '').slice(0, 300) }; })
    };
  }
  if (naam === 'zoek_documenten') {
    var docs = relevanteDocumenten(String(inv.zoekterm || ''), lees('Documenten'), 4);
    if (!docs.length) return 'Geen documenten gevonden.';
    docs.forEach(function (d) { if (!bronnen.some(function (b) { return b.url === d.url; })) bronnen.push({ titel: d.titel, url: d.url, type: d.type }); });
    return docs.map(function (d) { return '<document titel="' + xmlAttr(d.titel) + '" type="' + xmlAttr(d.type) + '"' + (d.school ? ' school="' + xmlAttr(d.school) + '"' : '') + '>\n' + String(d.tekst || '').slice(0, 6000) + '\n</document>'; }).join('\n\n');
  }
  if (naam === 'mijn_taken') {
    var sMap = perId(lees('Scholen'));
    return lees('Acties').filter(function (a) { return a.status !== 'af' && vanMij(a.eigenaar); }).sort(sorteerActies).slice(0, 30)
      .map(function (a) { return { tekst: a.tekst, deadline: a.deadline, prio: a.prio, school: sMap[a.schoolId] ? sMap[a.schoolId].naam : '' }; });
  }
  if (!mijnMailbox()) return 'De Gmail en agenda van ' + ikNaam() + ' zijn nog niet gekoppeld.';
  if (naam === 'zoek_mail') {
    return GmailApp.search(String(inv.zoekterm || ''), 0, 8).map(function (t) {
      var msgs = t.getMessages(), m = msgs[msgs.length - 1];
      return { threadId: t.getId(), onderwerp: t.getFirstMessageSubject(), van: m.getFrom(), datum: datumTijdStr(m.getDate()), berichten: msgs.length, fragment: String(m.getPlainBody() || '').replace(/\s+/g, ' ').slice(0, 300) };
    });
  }
  if (naam === 'lees_mail') {
    var th = GmailApp.getThreadById(String(inv.threadId || '')); if (!th) throw new Error('Mail niet gevonden.');
    return { onderwerp: th.getFirstMessageSubject(), berichten: th.getMessages().slice(-4).map(function (m) {
      return { van: m.getFrom(), aan: m.getTo(), datum: datumTijdStr(m.getDate()), tekst: zonderCitaat(m.getPlainBody()).slice(0, 4000) };
    }) };
  }
  if (naam === 'mijn_agenda') {
    var van = parseDatum(inv.van), tot = parseDatum(inv.tot);
    if (!van || !tot || tot < van) throw new Error('Geef van en tot als yyyy-MM-dd.');
    if ((tot - van) / 86400000 > 31) throw new Error('Maximaal 31 dagen.');
    return agendaItems(van, new Date(tot.getTime() + 86400000)).map(function (e) { return { titel: e.titel, start: e.start, eind: e.eind, heleDag: e.heleDag, locatie: e.locatie }; });
  }
  throw new Error('Onbekende tool.');
}
function zonderCitaat(s) {  // geciteerde eerdere mails weglaten: die staan al als eigen bericht in het gesprek
  var regels = String(s || '').split('\n'), uit = [];
  for (var i = 0; i < regels.length; i++) { if (/^On .+wrote:$|^Op .+schreef.*:$/.test(regels[i].trim())) break; if (!/^>/.test(regels[i])) uit.push(regels[i]); }
  return uit.join('\n').trim();
}
function breinZoekCrm(zoekterm) {
  var ts = uniek(termen(zoekterm)); if (!ts.length) ts = [zonderAccenten(klein(zoekterm))];
  if (!ts[0]) throw new Error('Geef een zoekterm.');
  var score = function (tekst) { tekst = zonderAccenten(String(tekst).toLowerCase()); return ts.filter(function (t) { return tekst.indexOf(t) >= 0; }).length; };
  var top = function (lijst, tekstVan, uitVan) {
    return lijst.map(function (x) { return { x: x, s: score(tekstVan(x)) }; }).filter(function (y) { return y.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 8).map(function (y) { return uitVan(y.x); });
  };
  var scholen = lees('Scholen'), sMap = perId(scholen);
  return {
    scholen: top(scholen, function (s) { return [s.naam, s.plaats, s.bestuur, s.email, s.website].join(' '); }, function (s) { return { id: s.id, naam: s.naam, plaats: s.plaats, status: s.status }; }),
    personen: top(lees('Personen'), function (p) { return [persoonNaam(p), p.email, p.functie, sMap[p.schoolId] ? sMap[p.schoolId].naam : ''].join(' '); },
      function (p) { return { id: p.id, naam: persoonNaam(p), functie: p.functie, email: p.email, schoolId: p.schoolId, school: sMap[p.schoolId] ? sMap[p.schoolId].naam : '' }; }),
    kansen: top(lees('Kansen'), function (k) { return [k.naam, k.traject, k.school].join(' '); },
      function (k) { return { id: k.id, naam: k.naam || k.traject, school: k.school, schoolId: k.schoolId, fase: k.fase, waarde: Number(k.waarde) || 0, eigenaar: k.eigenaar }; }),
    projecten: top(lees('Trajecten'), function (t) { return [t.school, t.traject, t.plaats].join(' '); },
      function (t) { return { id: t.id, traject: t.traject, school: t.school, schoolId: t.schoolId, schooljaar: t.schooljaar, status: t.status }; })
  };
}
// Ook gebruikt bij uitvoeren: de app kan de invoer aangepast hebben.
function breinActieCheck(soort, inv) {
  var def = BREIN_ACTIES[soort]; if (!def) throw new Error('Onbekende actie.');
  inv = (inv && typeof inv === 'object') ? inv : {};
  var o = {};
  Object.keys(def.properties).forEach(function (k) {
    var v = inv[k]; if (v === undefined || v === null || v === '') return;
    var type = def.properties[k].type;
    if (type === 'number') { v = Number(String(v).replace(',', '.')); if (isNaN(v)) throw new Error(k + ' moet een getal zijn.'); }
    else if (type === 'boolean') v = v === true || v === 'true' || v === 'ja';
    else v = String(v).trim();
    if (def.properties[k].enum && def.properties[k].enum.indexOf(v) < 0) throw new Error(k + ' moet een van deze zijn: ' + def.properties[k].enum.join(', ') + '.');
    o[k] = v;
  });
  def.required.forEach(function (k) { if (o[k] === undefined || o[k] === '') throw new Error('Veld ' + k + ' ontbreekt.'); });
  ['schoolId', 'persoonId', 'kansId'].forEach(function (k) {
    var tab = { schoolId: 'Scholen', persoonId: 'Personen', kansId: 'Kansen' }[k];
    if (o[k] && !vind(tab, o[k])) throw new Error(k + ' ' + o[k] + ' bestaat niet; zoek het juiste id op met zoek_crm.');
  });
  if (soort === 'maak_conceptmail' && !o.threadId && !/@/.test(o.aan || '')) throw new Error('Geef een threadId of een e-mailadres in aan.');
  if (soort === 'plan_afspraak' && !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(o.start)) throw new Error('start als yyyy-MM-dd HH:mm.');
  if ((soort === 'log_activiteit' || soort === 'plan_afspraak') && !o.schoolId && !o.persoonId && !o.kansId) throw new Error('Koppel aan een school, persoon of kans (id via zoek_crm).');
  return o;
}
// actie: {soort, invoer} zoals apiBrein die voorstelde, eventueel aangepast door de gebruiker.
function apiBreinUitvoeren(actie) {
  actie = actie || {};
  var soort = String(actie.soort || ''), o = breinActieCheck(soort, actie.invoer);
  if (soort === 'maak_taak') {
    var t = apiTaakOpslaan({ tekst: o.tekst, deadline: o.deadline || '', prio: o.prio || 'midden', eigenaar: o.eigenaar || '', notitie: o.notitie || '', schoolId: o.schoolId || '', persoonId: o.persoonId || '', kansId: o.kansId || '' });
    return { melding: 'Taak aangemaakt: ' + t.tekst };
  }
  if (soort === 'log_activiteit') {
    apiActiviteitToevoegen({ type: o.type, onderwerp: o.onderwerp, tekst: o.tekst || '', datum: o.datum || '', schoolId: o.schoolId || '', persoonId: o.persoonId || '', kansId: o.kansId || '' });
    return { melding: 'Vastgelegd op de tijdlijn.' };
  }
  if (soort === 'wijzig_kans') {
    var w = { id: o.kansId };
    ['fase', 'waarde', 'volgendeActie', 'deadline', 'verwachteSluiting'].forEach(function (k) { if (o[k] !== undefined) w[k] = o[k]; });
    if (w.fase) w.fase = klein(w.fase);
    var k = apiKansOpslaan(w, false).kans;
    return { melding: 'Kans bijgewerkt: ' + k.naam + ' (' + k.fase + ').' };
  }
  if (soort === 'plan_afspraak') {
    if (!mijnMailbox()) throw new Error('Je agenda is nog niet gekoppeld.');
    var a = apiAfspraakPlannen({ titel: o.titel, start: o.start, duurMin: o.duurMin || 60, locatie: o.locatie || '', notitie: o.notitie || '', uitnodigen: !!o.uitnodigen, schoolId: o.schoolId || '', persoonId: o.persoonId || '', kansId: o.kansId || '' });
    return { melding: 'Afspraak gepland: ' + a.onderwerp + ' (' + a.datum + ').' };
  }
  if (soort === 'maak_conceptmail') return maakConceptmail(o);
  if (soort === 'maak_offerte') return maakOfferte(o);
  throw new Error('Onbekende actie.');
}
function maakConceptmail(o) {
  if (!mijnMailbox()) throw new Error('Je Gmail is nog niet gekoppeld; kopieer de tekst uit het antwoord.');
  var concept;
  if (o.threadId) {
    var th = GmailApp.getThreadById(o.threadId); if (!th) throw new Error('Mail niet gevonden.');
    var msgs = th.getMessages();
    concept = msgs[msgs.length - 1].createDraftReply(o.tekst);  // nooit versturen: alleen een concept
  } else {
    concept = GmailApp.createDraft(o.aan, o.onderwerp || '', o.tekst);
  }
  var mij = Session.getEffectiveUser().getEmail();
  return { melding: 'Concept staat klaar in Gmail' + '.', url: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(mij) + '#drafts' };
}
var OFFERTE_DELEN = ['inleiding', 'hulpvraag', 'aanpak', 'rooster', 'kosten', 'voorwaarden', 'afsluiting'];
var OFFERTE_KOPPEN = { inleiding: 'Inleiding', hulpvraag: 'Hulpvraag', aanpak: 'Onze aanpak', rooster: 'Rooster en planning', kosten: 'Investering', voorwaarden: 'Voorwaarden', afsluiting: 'Tot slot' };
// Met scripteigenschap OFFERTE_SJABLOON_ID: kopie van dat Google Doc met {{titel}}, {{school}}, {{contactpersoon}}, {{datum}}, {{adviseur}} en
// {{inleiding}} … {{afsluiting}}. Staan de inhoudsvelden er niet in, dan komen ze als hoofdstukken onderaan. Zonder sjabloon: een nieuw Doc in de huisstijl.
function maakOfferte(o) {
  var h = huisstijl(), map = offerteMap(), sjabloon = P.getProperty('OFFERTE_SJABLOON_ID'), datum = datumLang(new Date()) + ' ' + new Date().getFullYear();
  var naam = 'Offerte ' + o.school + ' — ' + o.titel + ' (' + datumStr(new Date()) + ')', doc;
  var waarden = { titel: o.titel, school: o.school, contactpersoon: o.contactpersoon || '', datum: datum, adviseur: ikNaam() };
  OFFERTE_DELEN.forEach(function (k) { waarden[k] = o[k] || ''; });
  if (sjabloon) {
    var kopie = DriveApp.getFileById(sjabloon).makeCopy(naam, map);
    doc = DocumentApp.openById(kopie.getId());
    var body = doc.getBody(), metInhoud = !!body.findText('\\{\\{hulpvraag\\}\\}');
    Object.keys(waarden).forEach(function (k) { vervangOveral(body, k, waarden[k]); });
    if (!metInhoud) offerteHoofdstukken(body, waarden, h);
  } else {
    doc = DocumentApp.create(naam);
    DriveApp.getFileById(doc.getId()).moveTo(map);
    var b = doc.getBody();
    b.editAsText().setFontFamily('Nunito');
    var kop = b.getParagraphs()[0]; kop.setText(o.titel); kop.setHeading(DocumentApp.ParagraphHeading.TITLE); kop.editAsText().setForegroundColor(h.kleur_primair);
    b.appendParagraph(h.bedrijf + ' · offerte voor ' + o.school + (o.contactpersoon ? ' · t.a.v. ' + o.contactpersoon : '') + ' · ' + datum).editAsText().setForegroundColor(h.kleur_tekst);
    offerteHoofdstukken(b, waarden, h);
    b.appendParagraph('\n' + ikNaam() + '\n' + h.bedrijf);
    b.editAsText().setFontFamily('Nunito');
  }
  doc.saveAndClose();
  var bestand = DriveApp.getFileById(doc.getId());
  if (GEBRUIKER && GEBRUIKER.email && GEBRUIKER.id !== 'beheer') { try { bestand.addEditor(GEBRUIKER.email); } catch (e) {} }
  if (o.schoolId || o.kansId || o.persoonId) {
    var a = vulKoppeling({ type: 'notitie', datum: nu(), door: ikNaam(), schoolId: o.schoolId || '', persoonId: o.persoonId || '', kansId: o.kansId || '', bron: 'brein', aangemaakt: nu(),
      onderwerp: 'Offerte gemaakt: ' + o.titel, tekst: bestand.getUrl() });
    metLock(function () { schrijf('Activiteiten', a); });
  }
  return { melding: 'Offerte staat klaar in Drive.', url: bestand.getUrl() };
}
function offerteHoofdstukken(body, waarden, h) {
  OFFERTE_DELEN.forEach(function (k) {
    if (!waarden[k]) return;
    body.appendParagraph(OFFERTE_KOPPEN[k]).setHeading(DocumentApp.ParagraphHeading.HEADING2).editAsText().setForegroundColor(h.kleur_primair);
    String(waarden[k]).split(/\n{2,}/).forEach(function (alinea) { body.appendParagraph(alinea.trim()).setHeading(DocumentApp.ParagraphHeading.NORMAL).editAsText().setForegroundColor(h.kleur_tekst); });
  });
}
function vervangOveral(body, sleutel, waarde) {  // zonder replaceText: daar zijn $ en \ in de waarde speciaal
  var patroon = '\\{\\{' + sleutel + '\\}\\}', r, n = 0;
  while ((r = body.findText(patroon)) && n++ < 25) {
    var t = r.getElement().asText(), s = r.getStartOffset();
    t.deleteText(s, r.getEndOffsetInclusive());
    if (waarde) t.insertText(s, String(waarde));
  }
}
function offerteMap() {
  var id = P.getProperty('OFFERTE_MAP_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var basis = DriveApp.getFolderById(P.getProperty('DRIVE_MAP_ID')), it = basis.getFoldersByName('Offertes');
  var map = it.hasNext() ? it.next() : basis.createFolder('Offertes');
  P.setProperty('OFFERTE_MAP_ID', map.getId());
  return map;
}

/* ===================== Claude API (raw HTTP via UrlFetchApp; Apps Script heeft geen SDK) ===================== */

// Standaard claude-opus-5-5 met server-side fallbacks ('default'), zodat een geweigerd verzoek automatisch op een ander model landt.
// Sleutel, model en effort staan in de scripteigenschappen: ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_EFFORT.
function claude(systeem, gebruiker, maxTokens, effort) {
  var data = claudeVerzoek({ max_tokens: maxTokens || 16000, system: systeem, messages: [{ role: 'user', content: gebruiker }] }, effort);
  if (data.stop_reason === 'refusal') return 'Hier kan ik niet bij helpen: het verzoek is door de veiligheidsfilters geweigerd.';
  var uit = tekstUit(data);
  if (data.stop_reason === 'max_tokens') uit += '\n\n(Antwoord afgekapt — stel een kortere vraag.)';
  return uit;
}
// v3.5: één Messages API-verzoek; ook gebruikt door de tool-lus van het Brein.
function claudeVerzoek(body, effort, model) {
  var sleutel = P.getProperty('ANTHROPIC_API_KEY');
  if (!sleutel) throw new Error('Geen ANTHROPIC_API_KEY ingesteld bij Projectinstellingen → Scripteigenschappen.');
  body.model = model || P.getProperty('CLAUDE_MODEL') || 'claude-opus-5-5';
  body.fallbacks = 'default';
  body.output_config = { effort: effort || P.getProperty('CLAUDE_EFFORT') || 'medium' };
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': sleutel, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    payload: JSON.stringify(body)
  });
  var code = resp.getResponseCode(), tekst = resp.getContentText() || '', data;
  try { data = JSON.parse(tekst); } catch (e) { data = {}; }
  if (code !== 200) throw new Error('Claude API ' + code + ': ' + ((data.error && data.error.message) || tekst.slice(0, 200)));
  return data;
}
function tekstUit(data) { return (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim(); }

/* ===================== Hulpfuncties ===================== */

function tz() { return Session.getScriptTimeZone(); }
function datumStr(d) { return (d instanceof Date) ? Utilities.formatDate(d, tz(), 'yyyy-MM-dd') : String(d || ''); }
function datumTijdStr(d) { return Utilities.formatDate(d, tz(), 'yyyy-MM-dd HH:mm'); }
function nu() { return datumTijdStr(new Date()); }
function plusDagen(n) { return new Date(Date.now() + n * 86400000); }
function parseDatum(s) {
  if (s instanceof Date) return s;
  s = String(s || '').trim(); if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
}
function dagenSinds(s) { var d = parseDatum(s); return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null; }
function dagenTot(s) { var d = parseDatum(s); return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null; }
var DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
var MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function datumLang(d) { return DAGEN[d.getDay()] + ' ' + d.getDate() + ' ' + MAANDEN[d.getMonth()]; }
function groet() { var u = new Date().getHours(), n = P.getProperty('NAAM') || 'Menno'; return (u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond') + ' ' + n; }
function huidigSchooljaar() { var d = new Date(), j = d.getFullYear(); return d.getMonth() >= 7 ? j + '-' + (j + 1) : (j - 1) + '-' + j; }
function nieuwId() { return 'k' + Utilities.getUuid().replace(/-/g, '').slice(0, 9); }  // begint met een letter: Sheets maakt van een cijferreeks anders een getal
function slug(s) { return zonderAccenten(String(s || '').toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || nieuwId(); }
function zonderAccenten(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function uniek(lijst) { var uit = []; lijst.forEach(function (x) { if (x !== '' && x != null && uit.indexOf(x) < 0) uit.push(x); }); return uit; }
function vind(naam, id) { return lees(naam).filter(function (r) { return String(r.id) === String(id); })[0] || null; }
function mapUrl() { var id = P.getProperty('DRIVE_MAP_ID'); try { return id ? DriveApp.getFolderById(id).getUrl() : ''; } catch (e) { return ''; } }
function naamUitAdres(van) { var m = String(van).match(/^"?([^"<]+?)"?\s*<|^([^@\s]+)@/); return (m && (m[1] || m[2]) || String(van)).trim(); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xmlAttr(s) { return escHtml(s).replace(/\n/g, ' '); }
