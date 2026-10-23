/* Athena Assistent — Google Apps Script-backend (v2.0)
 * Het bedrijfsbrein van AthenaSchool: operations-dashboard, kennisbank met vraag-en-antwoord, nachtelijke review,
 * huisstijl-kit, doorzoekbare geschiedenis van elke schoolopdracht en (v2.0) het eigen CRM dat Capsule vervangt.
 * Data staat in één Google Sheet (tabbladen hieronder), documenten in één Drive-map. Zie README.md voor de installatie.
 * Contract met de app: POST {fn, args, secret} → {ok:true, result} of {ok:false, fout}. Fout 'secret' = koppelcode klopt niet.
 */

var VERSIE = '6.5';
var P = PropertiesService.getScriptProperties();

// v2.0: nieuwe kolommen komen altijd ACHTERAAN (blad() vult de kop aan), zodat bestaande Sheets gewoon blijven werken.
var TABELLEN = {
  Scholen:      ['id', 'naam', 'plaats', 'type', 'contactpersoon', 'email', 'telefoon', 'status', 'am', 'notities', 'bijgewerkt',
                 'bestuur', 'adres', 'website', 'leerlingen', 'eigenaar', 'tags', 'velden', 'laatsteContact', 'capsuleId', 'aangemaakt', 'bijgewerktDoor',
                 'lat', 'lon',  // v5.0: ligging (PDOK) voor de reisafstand in de matching
                 'betaaltermijn'],  // v6.5: dagen tussen factuur en betaling (Financiën: wanneer komt het geld binnen); leeg = de standaard
  Trajecten:    ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting', 'bijgewerkt',
                 'schoolId', 'capsuleId', 'bijgewerktDoor',
                 'kansId', 'adviseur', 'soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer',  // v3.8: project uit gewonnen kans + facturatie
                 'contactgegevens', 'voorstelUrl', 'documentenUrl', 'verlenging',  // v4.0: kolommen van het monday-bord
                 'taskforce', 'xpsProject',  // v4.1: overdracht van de taskforcemeeting (JSON) en het projectnummer in XPS
                 'talentscout',  // v6.4: de vaste talentscout van het project (krijgt de meldingen en taken van het talentteam)
                 'contractwaarde'],  // v6.5: waarde van het getekende samenwerkingsvoorstel (Financiën); leeg = omzet
  Kansen:       ['id', 'school', 'traject', 'fase', 'waarde', 'volgendeActie', 'deadline', 'laatsteContact', 'eigenaar', 'notities', 'bijgewerkt',
                 'naam', 'schoolId', 'persoonId', 'pipeline', 'kans', 'verwachteSluiting', 'gesloten', 'verliesReden', 'tags', 'velden', 'capsuleId', 'aangemaakt', 'bijgewerktDoor', 'am'],  // v3.8: am = accountmanager na winst
  Acties:       ['id', 'tekst', 'bron', 'prio', 'deadline', 'status', 'link', 'aangemaakt', 'afgerond',
                 'categorie', 'eigenaar', 'schoolId', 'persoonId', 'kansId', 'trackRunId', 'notitie', 'capsuleId', 'trajectId',  // v3.8: taak in een project
                 'tijd', 'herhaling', 'bijgewerkt', 'bijgewerktDoor',  // v4.5: tijd (uu:mm), herhaling (JSON) en wie de taak het laatst wijzigde
                 'tags', 'ouderId', 'herinnerd'],  // v4.6: tags (kommatekst), hoofdtaak (één niveau subtaken) en wanneer de herinneringsmail is verstuurd
  Documenten:   ['id', 'titel', 'type', 'school', 'url', 'driveId', 'gewijzigd', 'woorden', 'tekst', 'bijgewerkt'],
  Reviews:      ['id', 'datum', 'gemaaktOp', 'samenvatting', 'gedaan', 'blijvenLiggen', 'vandaag', 'eigenaar'],  // v3.3: review per gebruiker
  Huisstijl:    ['sleutel', 'waarde'],
  Content:      ['id', 'datum', 'type', 'onderwerp', 'tekst', 'door'],  // v3.7: door = wie het maakte (mag het verwijderen)
  Notities:     ['id', 'trajectId', 'datum', 'tekst'],
  // v2.0: CRM
  Personen:     ['id', 'voornaam', 'achternaam', 'functie', 'schoolId', 'email', 'telefoon', 'linkedin', 'eigenaar', 'tags', 'velden', 'laatsteContact', 'capsuleId', 'aangemaakt', 'bijgewerkt', 'bijgewerktDoor'],
  Activiteiten: ['id', 'type', 'datum', 'door', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'onderwerp', 'duurMin', 'gmailId', 'agendaId', 'bron', 'aangemaakt', 'tekst', 'talentId', 'vorm'],  // v5.0: talentId (tijdlijn van een talent); v7.1: vorm
  Activiteiten_archief: ['id', 'type', 'datum', 'door', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'onderwerp', 'duurMin', 'gmailId', 'agendaId', 'bron', 'aangemaakt', 'tekst', 'talentId', 'vorm'],  // v3.3: ouder dan 12 maanden
  Mijlpalen:    ['id', 'pipeline', 'mijlpaal', 'volgorde', 'kans', 'dagenNorm'],
  Tracks:       ['id', 'naam', 'omschrijving', 'stappen', 'bijgewerkt'],
  Gebruikers:   ['id', 'naam', 'email', 'rol', 'actief', 'bijgewerkt', 'team'],  // v4.0: team + rol (medewerker, teamlead, management)
  Doelen:       ['id', 'eigenaar', 'periode', 'metric', 'doel', 'bijgewerkt'],
  Facturen:     ['id', 'trajectId', 'omschrijving', 'bedrag', 'datum', 'status', 'factuurnummer', 'bijzonderheden', 'exactId', 'aangemaakt', 'bijgewerkt', 'door',
                 'verzonden', 'betaald'],  // v6.5: wanneer de factuur echt verstuurd en betaald is (Financiën); datum = de geplande termijndatum  // v3.8: factuurtermijnen per project
  Instellingen: ['sleutel', 'waarde'],  // v3.7: keuzelijsten en correcties die de beheerder zelf instelt (JSON)
  // v4.1: bezetting van projecten en meldingen in de app
  Vacatures:    ['id', 'trajectId', 'titel', 'aantal', 'dagen', 'urenPerWeek', 'start', 'eind', 'profiel', 'status', 'aangemaakt', 'door', 'bijgewerkt', 'bijgewerktDoor', 'ingevuld'],  // v4.2: ingevuld = datum (time-to-fill)
  Kandidaten:   ['id', 'vacatureId', 'trajectId', 'naam', 'email', 'telefoon', 'bron', 'xpsId', 'afasNummer', 'status', 'statusSinds', 'gesprek', 'notitie', 'door', 'aangemaakt', 'bijgewerkt', 'bijgewerktDoor', 'statusHistorie',  // v4.2: JSON {status: datum}
                 'talentId', 'start', 'eind', 'functie', 'urenPerWeek', 'dagen', 'xpsPlaatsingId', 'eindReden'],  // v5.0: een rij = voordracht of plaatsing van een talent
  Meldingen:    ['id', 'voor', 'tekst', 'link', 'datum', 'gelezen', 'door'],
  // v5.0: talentnetwerk fase 1 (docs/plan-taken-en-talentnetwerk.md). Eén profiel per flexkracht; plaatsing, contract, rooster en uren blijven in XPS.
  // Bewust afwezig: BSN, kopie identiteitsbewijs, IBAN, geboortedatum, tarief, contract-pdf en gezondheid (horen bij de werkgever, niet in een bemiddelingsmodule).
  Talenten:     ['id', 'voornaam', 'achternaam', 'email', 'telefoon', 'postcode', 'woonplaats', 'lat', 'lon', 'functies', 'sectoren', 'vakken', 'opleiding', 'bevoegdheid', 'vervoer', 'reisafstandKm', 'maxUrenWeek',
                 'beschikbaarVanaf', 'beschikbaarTot', 'beschikbaarheid', 'uitzonderingen', 'beschikbaarheidBevestigd', 'laatstePeiling', 'contractvorm', 'status', 'statusSinds', 'bron', 'xpsId', 'afasNummer', 'tags', 'velden',
                 'toestemmingDatum', 'toestemmingGrondslag', 'bewarenTot', 'portaalToken', 'portaalTokenTot', 'notitie', 'laatsteContact', 'door', 'aangemaakt', 'bijgewerkt', 'bijgewerktDoor'],
  TalentDocumenten: ['id', 'talentId', 'soort', 'afgifte', 'geldigTot', 'driveId', 'gecontroleerdDoor', 'gecontroleerdOp', 'status', 'notitie', 'door', 'aangemaakt', 'bijgewerkt'],
  Beoordelingen: ['id', 'talentId', 'kandidaatId', 'trajectId', 'schoolId', 'door', 'rol', 'datum', 'oordeel', 'criteria', 'tekst', 'zichtbaarheid', 'wederhoor', 'aangemaakt', 'bijgewerkt'],
  TalentSchool: ['id', 'talentId', 'schoolId', 'status', 'richting', 'reden', 'door', 'datum'],
  TalentUren:   ['id', 'talentId', 'xpsId', 'xpsProject', 'trajectId', 'week', 'uren', 'diensten', 'noShows', 'lateAfmeldingen', 'geimporteerd'],
  TalentUren_archief: ['id', 'talentId', 'xpsId', 'xpsProject', 'trajectId', 'week', 'uren', 'diensten', 'noShows', 'lateAfmeldingen', 'geimporteerd'],
  Prognoses:    ['id', 'gemaakt', 'trajectId', 'maand', 'prognose', 'kas'],  // v6.5: de prognose per project en maand zoals die op de eerste van maand 'gemaakt' was (bedragen in centen)
  Aanmeldingen: ['tijdstempel', 'voornaam', 'achternaam', 'telefoon', 'email', 'postcode', 'functies', 'sector', 'beschikbaarheid', 'toestemming', 'verwerkt', 'talentId']  // het Google Form schrijft in een eigen tabblad (Formulierreacties); dit tabblad is voor handmatige of geïmporteerde aanmeldingen
};
var DATUMTIJD_KOLOMMEN = { bijgewerkt: 1, aangemaakt: 1, afgerond: 1, gemaaktOp: 1, gewijzigd: 1, datum: 1, statusSinds: 1, gesprek: 1, gelezen: 1, ingevuld: 1, herinnerd: 1,  // v4.6: herinnerd
  beschikbaarheidBevestigd: 1, laatstePeiling: 1, gecontroleerdOp: 1, portaalTokenTot: 1, geimporteerd: 1, tijdstempel: 1, verwerkt: 1 };  // v5.0
var TEKST_KOLOMMEN = { tijd: 1, telefoon: 1, postcode: 1, week: 1 };  // v4.5: als tekst opgemaakt ('@'), anders leest Sheets van '14:00' een tijdwaarde uit 1899; v5.0: nieuwe telefoon-, postcode- en weekkolommen houden hun voorloopnul
var DOC_TYPES = ['contract', 'werkwijze', 'schooldossier', 'voorstel', 'prijslijst', 'overig'];
var KANS_FASES = ['lead', 'gesprek', 'voorstel', 'onderhandeling', 'gewonnen', 'verloren'];
var TRAJECT_STATUSSEN = ['opstart', 'bezig', 'afgelopen', 'onduidelijk', 'gestopt'];  // v4.0: zoals het monday-bord
var PRIOS = ['hoog', 'midden', 'laag'];

/* ===================== Eenmalige inrichting (draai vanuit de editor) ===================== */

// v4.4.1: kies deze functie in de keuzelijst naast "Uitvoeren" (de editor onthoudt de laatste keuze); alleen lezen. v4.4.2: ook sleutels en ontbrekende triggers, en bestand tegen een onbereikbare Sheet.
var TRIGGERS = ['nachtelijkeReviewTrigger', 'indexeerTrigger', 'crmSyncTrigger', 'archiveerTrigger', 'herinneringTrigger', 'talentDagelijksTrigger', 'talentUrenTrigger', 'financienTrigger'];  // v6.5: prognose bevriezen op de eerste van de maand  // v4.6: herinneringsmail bij taken met een tijd; v5.0: talentnetwerk (dagelijks) en de weekexport uit XPS
function triggerNamen() { return ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }); }
function controleer() {
  var regels = ['Athena Assistent, backend ' + VERSIE];
  ['SHEET_ID', 'SECRET', 'DRIVE_MAP_ID'].forEach(function (k) { if (!P.getProperty(k)) regels.push(k + ' ontbreekt: kies setup() en klik Uitvoeren.'); });
  if (P.getProperty('SHEET_ID')) {
    try {
      var ss = sheet(), perNaam = {};
      ss.getSheets().forEach(function (b) { perNaam[b.getName()] = b; });
      regels.push('Sheet: ' + ss.getName());
      Object.keys(TABELLEN).forEach(function (naam) { var b = perNaam[naam]; regels.push('- ' + naam + ': ' + (b ? Math.max(0, b.getLastRow() - 1) + ' rijen' : 'nog niet aangemaakt (gebeurt vanzelf)')); });
    } catch (e) { regels.push('Sheet ' + P.getProperty('SHEET_ID') + ' niet bereikbaar (verwijderd, in de prullenbak of niet gedeeld met dit account): ' + ((e && e.message) || e)); }
  }
  var aanwezig = triggerNamen(), mist = TRIGGERS.filter(function (n) { return aanwezig.indexOf(n) < 0; });
  // triggers horen bij het account dat setup() draaide; onder een ander account lijken ze te ontbreken
  regels.push('Triggers onder dit account: ' + (aanwezig.join(', ') || 'geen') + (mist.length ? ' · ontbreekt: ' + mist.join(', ') + ' (draai setup() onder het account van de eigenaar; niet onder een tweede account, anders draait alles dubbel)' : ''));
  regels.push('Gebruikerscodes: ' + Object.keys(codes()).length + ' · Claude-sleutel: ' + (P.getProperty('ANTHROPIC_API_KEY') ? 'ingesteld' : 'ontbreekt'));
  regels.push('Nieuwe Code.gs live zetten: implementeren als nieuwe versie, zie backend/README.md.');
  Logger.log(regels.join('\n'));
  return regels.join('\n');
}

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
  talentMap(); xpsExportMap();  // v5.0: submappen Talent (documenten per talent, alleen gedeeld met het talentteam) en XPS-export (weekexport)
  installeerTriggers();
  crmInrichten();  // v2.0: CRM-kolommen en -tabbladen, bestaande contactpersonen en notities overzetten (idempotent)
  var uit = { sheet: ss.getUrl(), map: mapUrl(), koppelcode: P.getProperty('SECRET') };
  Logger.log('Sheet: ' + uit.sheet + '\nDocumentenmap: ' + uit.map + '\nKoppelcode (voor de app): ' + uit.koppelcode);
  return uit;
}

function installeerTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGERS.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('indexeerTrigger').timeBased().everyDays(1).atHour(4).create();          // documenten opnieuw inlezen
  ScriptApp.newTrigger('nachtelijkeReviewTrigger').timeBased().everyDays(1).atHour(5).create(); // review klaar vóór de ochtend
  ScriptApp.newTrigger('crmSyncTrigger').timeBased().everyHours(1).create();                    // v2.0: mails en afspraken aan scholen koppelen
  ScriptApp.newTrigger('archiveerTrigger').timeBased().onMonthDay(1).atHour(3).create();         // v3.3: oude activiteit naar het archief
  ScriptApp.newTrigger('herinneringTrigger').timeBased().everyMinutes(15).create();              // v4.6: herinneringsmail een kwartier vóór een taak met tijd
  ScriptApp.newTrigger('talentDagelijksTrigger').timeBased().everyDays(1).atHour(6).nearMinute(30).create();  // v5.0: VOG, peiling, slapend, bewaartermijn, geocoderen, aanmeldingen
  ScriptApp.newTrigger('talentUrenTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();  // v5.0: weekexport van XPS inlezen
  ScriptApp.newTrigger('financienTrigger').timeBased().onMonthDay(1).atHour(2).create();          // v6.5: prognose van deze maand bevriezen
}

// Optioneel: fictieve voorbeelddata om de app meteen gevuld te zien. Verwijder de rijen daarna gewoon in de Sheet.
function vulVoorbeelddata() {
  var sj = huidigSchooljaar();
  [['Voorbeeldcollege Zuid', 'Rotterdam', 'VO', 'A. de Vries', 'klant'], ['Lyceum Demo', 'Den Haag', 'VO', 'B. Jansen', 'klant'],
   ['ISK Voorbeeld', 'Delft', 'VO', 'C. Bakker', 'lead'], ['Montessori Demo', 'Utrecht', 'PO', 'D. Visser', 'klant']].forEach(function (r) {
    schrijf('Scholen', { id: 'demo-' + slug(r[0]), naam: r[0], plaats: r[1], type: r[2], contactpersoon: r[3], status: r[4], am: 'Menno' });
  });
  [['Voorbeeldcollege Zuid', 'Onderwijsondersteuning', sj, '2026-09-01', '2027-05-31', 'bezig', 2, 30, 48.5, 40740, 'A. de Vries'],
   ['Lyceum Demo', 'Huiswerkbegeleiding', sj, '2026-09-07', '2027-06-30', 'bezig', 1, 8, 42, 12000, 'B. Jansen'],
   ['Montessori Demo', 'Studentdocent', sj, '2026-08-24', '2026-12-20', 'bezig', 1, 16, 45, 11520, 'D. Visser'],
   ['ISK Voorbeeld', 'NT2-ondersteuning', sj, '2026-11-02', '2027-04-30', 'opstart', 1, 16, 47, 15040, 'C. Bakker'],
   ['Voorbeeldcollege Zuid', 'Examentraining', '2025-2026', '2026-03-01', '2026-05-15', 'afgelopen', 3, 12, 46, 8280, 'A. de Vries']].forEach(function (r) {
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
    if (req.portaal) {  // v5.0: het talentportaal (mail-link zonder inlog): een vast extern profiel zonder rechten, twee functies, een budget per token
      GEBRUIKER = EXTERN;
      if (PORTAAL_FUNCTIES.indexOf(fn) < 0) uit = { ok: false, fout: 'onbekende functie ' + fn };
      else { portaalBudget(String(req.portaal)); var rp = globalThis[fn].apply(null, [String(req.portaal)].concat(req.args || [])); uit = { ok: true, result: (rp === undefined) ? null : rp }; }
      return json(uit);
    }
    GEBRUIKER = wieIs(req.secret);  // v2.0: de beheerderscode (SECRET) of een eigen code per accountmanager (CODES)
    if (!GEBRUIKER) uit = { ok: false, fout: 'secret' };
    else if (!/^api[A-Z]\w*$/.test(fn) || typeof globalThis[fn] !== 'function' || PORTAAL_FUNCTIES.indexOf(fn) >= 0) uit = { ok: false, fout: 'onbekende functie ' + fn };
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
function vergeet(naam) {
  delete _LEES[naam]; delete _LEES[naam + '|licht'];
  if (naam === 'Trajecten') _TRAJECTNAMEN = null; if (naam === 'Gebruikers') _TEAMNAMEN = null; if (naam === 'Vacatures') _OPENVAC = null; if (naam === 'Acties') _TAAKINDEX = null;  // v4.6: ook de subtaken-index
  if (/^Talent|^Beoordelingen$|^Kandidaten$/.test(naam)) _TALENTINDEX = null;  // v5.0: de talentindex (VOG, beoordelingen, plaatsingen)
  if (naam === 'Kandidaten' || naam === 'Trajecten') _VIAPROJECT = null;  // v5.0: welke talenten een accountmanager via zijn projecten ziet
}
var KOP_GECONTROLEERD = {};
function blad(naam) {
  if (_BLAD[naam] && KOP_GECONTROLEERD[naam]) return _BLAD[naam];
  var ss = sheet(), b = ss.getSheetByName(naam), kop = TABELLEN[naam];
  if (!b) { b = ss.insertSheet(naam); b.appendRow(kop); b.setFrozenRows(1); tekstKolommen(b, kop, 0); KOP_GECONTROLEERD[naam] = true; }
  else if (!KOP_GECONTROLEERD[naam]) {
    // v2.0: kolommen die in een nieuwe versie zijn bijgekomen achteraan in de kop aanvullen; bestaande data blijft staan
    if (b.getMaxColumns() < kop.length) b.insertColumnsAfter(b.getMaxColumns(), kop.length - b.getMaxColumns());
    var breed = b.getLastColumn();
    if (b.getLastRow() === 0) { b.getRange(1, 1, 1, kop.length).setValues([kop]); b.setFrozenRows(1); tekstKolommen(b, kop, 0); }
    else if (breed < kop.length) { b.getRange(1, breed + 1, 1, kop.length - breed).setValues([kop.slice(breed)]); tekstKolommen(b, kop, breed); }
    KOP_GECONTROLEERD[naam] = true;
  }
  _BLAD[naam] = b;
  return b;
}
// v4.5: nieuwe kolommen uit TEKST_KOLOMMEN krijgen de opmaak '@' (tekst), zodat Sheets een ingevoerde tijd niet omzet
function tekstKolommen(b, kop, vanaf) {
  for (var i = vanaf; i < kop.length; i++) if (TEKST_KOLOMMEN[kop[i]]) { try { b.getRange(1, i + 1, b.getMaxRows(), 1).setNumberFormat('@'); } catch (e) {} }
}
function celWaarde(v, kolom) {
  if (v instanceof Date) return TEKST_KOLOMMEN[kolom] ? Utilities.formatDate(v, tz(), 'HH:mm') : DATUMTIJD_KOLOMMEN[kolom] ? datumTijdStr(v) : datumStr(v);  // v4.5: een tijd die Sheets toch omzette
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
  if (!isBeheerder()) kansen = kansen.filter(function (k) { return mag('pipeline', 'zien', k) && (k.eigenaar || k.am) === ikNaam(); });  // v4.0
  var actief = trajecten.filter(function (t) { return t.status === 'bezig' || t.status === 'actief'; });  // v4.0: monday-statussen
  var sj = huidigSchooljaar();
  var omzet = trajecten.filter(function (t) { return t.schooljaar === sj && ['gestopt', 'offerte', 'onduidelijk'].indexOf(t.status) < 0; })  // v4.2: opstart is gewonnen omzet
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
  if (!taakVanMijOfTeam(a)) throw new Error('Daar heb je geen toegang toe.');  // v4.5: alleen eigen taken (teamlead: zijn team, management alles)
  var volgende = metLock(function () { return actieAfronden(a); });
  // v4.6: was dit de laatste open subtaak? Dan vraagt de app of de hoofdtaak ook af mag.
  var ouderKlaar = false;
  if (a.ouderId) { var ouder = vind('Acties', a.ouderId); ouderKlaar = !!ouder && ouder.status !== 'af' && lees('Acties').every(function (x) { return String(x.ouderId) !== String(a.ouderId) || x.status === 'af'; }); }
  return { id: id, status: 'af', afgerond: nu(), volgende: volgende ? taakUit(volgende, perId(lees('Scholen')), perId(lees('Personen')), perId(lees('Kansen'))) : null, ouderKlaar: ouderKlaar };  // v3.7; v4.5: de volgende instantie van een reeks
}
// v4.5: de kern van het afvinken, altijd binnen metLock. Een herhalende taak krijgt meteen haar volgende instantie; die komt terug (anders null).
function actieAfronden(a) {
  if (a.status === 'af') return null;  // twee keer afvinken maakt geen tweede instantie
  schrijf('Acties', { id: a.id, status: 'af', afgerond: nu() });
  // v4.6: open subtaken gaan mee af met de hoofdtaak
  var kinderen = lees('Acties').filter(function (x) { return String(x.ouderId) === String(a.id) && x.status !== 'af'; });
  if (kinderen.length) schrijfVeel('Acties', kinderen.map(function (x) { return { id: x.id, status: 'af', afgerond: nu() }; }));
  // v2.0: een CRM-taak die aan een school, persoon of kans hangt komt in de tijdlijn
  var gekoppeld = a.schoolId || a.persoonId || a.kansId;
  if (gekoppeld) schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: a.schoolId, persoonId: a.persoonId, kansId: a.kansId, onderwerp: 'Taak afgerond: ' + a.tekst, bron: 'app', aangemaakt: nu() });
  var h = herhalingUit(a.herhaling); if (!h) return null;
  var volgende = volgendeInstantie(a, h, new Date());
  if (!volgende) { if (gekoppeld) schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: a.schoolId, persoonId: a.persoonId, kansId: a.kansId, onderwerp: 'Reeks afgerond: ' + a.tekst, bron: 'app', aangemaakt: nu() }); return null; }
  return schrijf('Acties', volgende);
}
// v4.5: extra = {tijd, herhaling, categorie, eigenaar, schoolId, persoonId, kansId, trajectId, notitie} uit de snelinvoer; de oude aanroep met drie argumenten blijft werken
function apiActieToevoegen(tekst, prio, deadline, extra) {
  tekst = String(tekst || '').trim(); if (!tekst) throw new Error('Geen tekst.');
  var o = schoon(extra || {}, ['tijd', 'herhaling', 'categorie', 'eigenaar', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'notitie', 'tags', 'ouderId']);  // v4.6: tags en hoofdtaak
  o.tekst = tekst; o.prio = PRIOS.indexOf(prio) >= 0 ? prio : 'midden'; o.deadline = deadline || ''; o.bron = 'handmatig';
  return apiTaakOpslaan(o);
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
  var ta = a.tijd || '99:99', tb = b.tijd || '99:99';  // v4.5: op dezelfde dag eerst de taken met een tijd
  if (ta !== tb) return ta < tb ? -1 : 1;
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

// v4.4.4: pdf en Word; zonder Drive API alleen op titel geïndexeerd.
var CONVERSIE_MIMES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
var PRIVE_MAPPEN = ['Talent', 'XPS-export'];  // v5.0: submappen die de indexeerder overslaat (persoonsgegevens, geen kennisbank)

function indexeerDocumenten() {
  var mapId = P.getProperty('DRIVE_MAP_ID'); if (!mapId) throw new Error('Geen documentenmap — draai setup().');
  var bestaand = {}, gezien = {}, scholen = lees('Scholen').map(function (s) { return s.naam; });
  lees('Documenten', true).forEach(function (d) { bestaand[d.driveId] = d; });
  var stats = { aantal: 0, nieuw: 0, bijgewerkt: 0, verwijderd: 0 }, teSchrijven = [], correcties = instelling('documentCorrecties') || {};  // v3.7
  // v4.4.4: staat de Drive API (later) aan, dan pdf's en Word-bestanden zonder tekst één keer opnieuw lezen, ook als ze niet gewijzigd zijn.
  // Hooguit 4 minuten per run (limiet 6), de rest volgt de volgende run; wat ook nu niets oplevert, wordt onthouden en niet nog eens geprobeerd.
  var start = Date.now(), herlees = null;
  if (typeof Drive !== 'undefined' && !P.getProperty('DRIVE_HERLEZEN')) {
    herlees = { leeg: {}, rest: false };
    try { herlees.leeg = JSON.parse(P.getProperty('DRIVE_HERLEZEN_LEEG') || '{}'); } catch (e) {}
  }
  function loop(folder, typeHint, diepte) {
    if (diepte > 4) return;
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next(), id = f.getId();
      gezien[id] = true; stats.aantal++;
      var gewijzigd = datumTijdStr(f.getLastUpdated()), oud = bestaand[id];
      var opnieuw = !!(herlees && oud && !(Number(oud.woorden) > 0) && !herlees.leeg[id] && CONVERSIE_MIMES.indexOf(f.getMimeType()) >= 0);  // v4.4.4
      if (opnieuw && Date.now() - start > 4 * 60000) { herlees.rest = true; opnieuw = false; }
      if (oud && oud.gewijzigd === gewijzigd && !opnieuw) continue;
      var tekst = tekstVanBestand(f) || '';
      if (opnieuw && !tekst) herlees.leeg[id] = 1;
      teSchrijven.push({ id: oud ? oud.id : undefined, titel: f.getName(), type: typeHint || raadType(f.getName()) || 'overig', school: raadSchool(f.getName() + ' ' + tekst.slice(0, 3000), scholen),
        url: f.getUrl(), driveId: id, gewijzigd: gewijzigd, woorden: tekst ? tekst.split(/\s+/).length : 0, tekst: tekst.slice(0, 45000) });
      var corr = correcties[id]; if (corr) { var laatst = teSchrijven[teSchrijven.length - 1]; if (corr.type) laatst.type = corr.type; if (corr.school !== undefined) laatst.school = corr.school; }
      if (oud) stats.bijgewerkt++; else stats.nieuw++;
    }
    var sub = folder.getFolders();
    while (sub.hasNext()) { var s = sub.next(); if (diepte === 0 && PRIVE_MAPPEN.indexOf(s.getName()) >= 0) continue; loop(s, typeHint || raadType(s.getName()), diepte + 1); }  // v5.0: documenten van talenten en de XPS-export horen niet in de kennisbank
  }
  loop(DriveApp.getFolderById(mapId), '', 0);
  schrijfVeel('Documenten', teSchrijven);
  var leeg = herlees ? JSON.stringify(herlees.leeg) : '';  // v4.4.4: pas na het wegschrijven; boven ~8 kB (limiet 9 kB per eigenschap) stoppen
  if (herlees && herlees.rest && leeg.length < 8000) P.setProperty('DRIVE_HERLEZEN_LEEG', leeg);
  else if (herlees) { P.setProperty('DRIVE_HERLEZEN', nu()); P.deleteProperty('DRIVE_HERLEZEN_LEEG'); }
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
    if (CONVERSIE_MIMES.indexOf(mime) >= 0) return tekstViaConversie(f);  // v4.4.4: dezelfde lijst als het herlezen
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
  // v4.0: alleen projecten en kansen die de vrager mag zien (anders lekt de pipeline via de Assistent)
  var regels = [], trajecten = lees('Trajecten').filter(function (t) { return mag('projecten', 'zien', t); }), kansen = lees('Kansen').filter(function (k) { return kansOpen(k) && mag('pipeline', 'zien', k); }), scholen = lees('Scholen');
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
    GEBRUIKER = gebruikerVan(g);
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
  kandidatenBlijvenLiggen(false).forEach(function (x) { blijven.push(x); });  // v4.1: kandidaten die te lang op één status staan
  trajecten.filter(function (t) { return (t.status === 'opstart' || t.status === 'offerte') && dagenSinds(t.bijgewerkt) > 14; }).forEach(function (t) { blijven.push({ tekst: 'Opstart ' + t.school + ' (' + t.traject + ') wacht al ' + dagenSinds(t.bijgewerkt) + ' dagen', bron: 'traject', dagen: dagenSinds(t.bijgewerkt) }); });

  agendaVoorDag(dag).forEach(function (a) { vandaag.push({ tekst: (a.tijd === 'dag' ? 'Hele dag' : a.tijd) + ' · ' + a.titel, bron: 'agenda' }); });
  acties.filter(function (a) { return a.status !== 'af' && a.deadline === dagStr; }).sort(sorteerActies).forEach(function (a) { vandaag.push({ tekst: (a.tijd ? a.tijd + ' · ' : '') + 'Deadline: ' + a.tekst, bron: 'actie' }); });  // v4.5: met tijd
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
    var systeem = 'Je bent Athena, de assistent van ' + naam + ' (' + functieVan(ikUit()) + ' bij AthenaSchool, onderwijsondersteuning voor scholen). Schrijf in het Nederlands, warm en nuchter, zonder uitroeptekens of emoji.';
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
  var t = uitMap(CONTENT_TYPES, type); if (!t) throw new Error('Onbekend contenttype.');  // v7.2: geen geërfde sleutels (constructor, __proto__)
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
  var updates = {}; lees('Activiteiten').forEach(function (a) { if (a.trajectId) { var u = updates[a.trajectId] || (updates[a.trajectId] = { n: 0, laatst: '' }); u.n++; if (String(a.datum) > u.laatst) u.laatst = String(a.datum); } });
  var ts = lees('Trajecten').filter(function (t) { return mag('projecten', 'zien', t); }).sort(function (a, b) { return String(b.start || b.schooljaar).localeCompare(String(a.start || a.schooljaar)); });
  var vacs = lees('Vacatures'), kands = lees('Kandidaten');
  return {
    trajecten: ts.map(function (t) { var u = trajectUit(t), x = updates[t.id]; u.updates = x ? x.n : 0; u.laatsteUpdate = x ? x.laatst : ''; u.magWijzigen = mag('projecten', 'wijzigen', t); u.bezetting = bezettingVan(t.id, vacs, kands); return u; }),  // v4.0: aantal updates zoals in monday; v4.1: bezetting x van y
    gebruikers: gebruikersNamen(), am: teamNamen('accountmanagement'), ik: ikUit(), schooljaar: huidigSchooljaar(),
    filters: { schooljaren: uniek(ts.map(function (t) { return t.schooljaar; })).sort().reverse(), trajecten: uniek(ts.map(function (t) { return t.traject; })).sort(), statussen: trajectStatussen(), verlenging: keuzelijst('verlenging') }
  };
}
function apiTraject(id) {
  var t = vind('Trajecten', id); if (!t) throw new Error('Traject niet gevonden.');
  eis('projecten', 'zien', t);  // v4.0
  var school = String(t.school).toLowerCase(), acts = lees('Activiteiten'), gekopieerd = {};
  acts.forEach(function (a) { if (/^nt-/.test(a.id)) gekopieerd[String(a.id).slice(3)] = true; });  // v2.0: door crmInrichten() overgezette notities niet dubbel tonen
  return {
    traject: trajectUit(t),
    documenten: lees('Documenten', true).filter(function (d) { return (d.school && String(d.school).toLowerCase() === school) || String(d.titel).toLowerCase().indexOf(school) >= 0; }).map(function (d) { return { id: d.id, titel: d.titel, type: d.type, url: d.url, gewijzigd: d.gewijzigd }; }),
    // v2.0: notities staan sinds het CRM in Activiteiten (oude rijen in Notities blijven zichtbaar)
    notities: lees('Notities').filter(function (n) { return !gekopieerd[n.id]; }).concat(acts.filter(function (a) { return a.trajectId; })).filter(function (n) { return String(n.trajectId) === String(id); })
      .sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).map(function (n) { return { id: n.id, soort: n.type ? 'activiteit' : 'notitie', door: n.door || '', onderwerp: n.type ? n.onderwerp || '' : '', ruw: n.tekst || '', datum: n.datum, tekst: n.onderwerp && n.tekst ? n.onderwerp + ' — ' + n.tekst : (n.tekst || n.onderwerp) }; }),  // v3.7: soort voor bewerken/verwijderen
    kansen: lees('Kansen').filter(function (k) { return ((t.schoolId && String(k.schoolId) === String(t.schoolId)) || String(k.school).toLowerCase() === school) && (mag('pipeline', 'zien', k) || String(k.id) === String(t.kansId)); }).map(kansUit),
    school: lees('Scholen').filter(function (s) { return (t.schoolId && String(s.id) === String(t.schoolId)) || String(s.naam).toLowerCase() === school; }).map(function (s) { return { id: s.id, naam: s.naam, plaats: s.plaats, contactpersoon: s.contactpersoon, email: s.email, telefoon: s.telefoon, status: s.status, am: s.eigenaar || s.am }; })[0] || null
  };
}
function apiTrajectOpslaan(obj) {
  obj = obj || {};
  var velden = ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting', 'schoolId',
    'kansId', 'adviseur', 'soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer',  // v3.8
    'contactgegevens', 'voorstelUrl', 'documentenUrl', 'verlenging', 'xpsProject', 'talentscout', 'contractwaarde'], schoon = {};  // v4.0; v4.1: xpsProject; v6.4: talentscout
  velden.forEach(function (k) { if (obj[k] !== undefined) schoon[k] = obj[k]; });
  if (schoon.schoolId) { var sch = vind('Scholen', schoon.schoolId); if (!sch) throw new Error('School niet gevonden.'); schoon.school = sch.naam; if (!schoon.plaats) schoon.plaats = sch.plaats || ''; }  // v3.7: project aan een CRM-school koppelen
  if (!String(schoon.school || '').trim() && !schoon.id) throw new Error('School is verplicht.');
  if (schoon.status && trajectStatussen().indexOf(schoon.status) < 0) throw new Error('Onbekende status.');
  // v4.0: rechten. Facturatievelden vallen onder facturatie, de rest onder projecten; een nieuw project maakt alleen wie projecten mag wijzigen.
  var oudT = schoon.id ? vind('Trajecten', schoon.id) : null, FACT_VELDEN = ['soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer'];
  if (schoon.id && !oudT) throw new Error('Project niet gevonden.');
  if (!oudT) { eis('projecten', 'wijzigen'); if (!schoon.am && GEBRUIKER && GEBRUIKER.team === 'accountmanagement') schoon.am = ikNaam(); eis('projecten', 'wijzigen', schoon); }
  else Object.keys(schoon).forEach(function (k) { if (k !== 'id') eis(FACT_VELDEN.indexOf(k) >= 0 ? 'facturatie' : 'projecten', 'wijzigen', oudT); });
  if (oudT && ((schoon.am !== undefined && schoon.am !== oudT.am) || (schoon.adviseur !== undefined && schoon.adviseur !== oudT.adviseur)))  // overdragen: ook de nieuwe situatie moet binnen mijn rechten vallen
    eis('projecten', 'wijzigen', { am: schoon.am !== undefined ? schoon.am : oudT.am, adviseur: schoon.adviseur !== undefined ? schoon.adviseur : oudT.adviseur });
  [['soortFacturatie', 'soortFacturatie'], ['gefactureerd', 'gefactureerd'], ['vakanties', 'vakanties'], ['verlenging', 'verlenging']].forEach(function (x) {  // v3.8
    if (schoon[x[0]] && keuzelijst(x[1]).indexOf(schoon[x[0]]) < 0) throw new Error('Onbekende waarde voor ' + x[0] + '.');
  });
  if (!schoon.id && !schoon.schooljaar) schoon.schooljaar = huidigSchooljaar();
  if (schoon.contractwaarde !== undefined && schoon.contractwaarde !== '') { schoon.contractwaarde = Number(String(schoon.contractwaarde).replace(',', '.')); if (!isFinite(schoon.contractwaarde) || schoon.contractwaarde < 0) throw new Error('Ongeldige contractwaarde.'); }  // v6.5
  if (schoon.talentscout !== undefined) { schoon.talentscout = String(schoon.talentscout || '').trim(); if (schoon.talentscout && teamNamen('talent').indexOf(schoon.talentscout) < 0) throw new Error('Kies een talentscout uit het talentteam.'); }  // v6.4
  var t = metLock(function () {
    controleerConflict('Trajecten', schoon.id, schoon, obj._oud);  // v3.3
    var vorige = oudT ? (oudT.talentscout || '') : '', scout = schoon.talentscout !== undefined && schoon.talentscout !== vorige ? schoon.talentscout : null;  // v6.4.2: een nieuw project zonder scout krijgt geen loze tijdlijnregel
    if (scout !== null) delete schoon.talentscout;
    var nieuw = schrijf('Trajecten', schoon);
    if (scout !== null) nieuw = talentscoutZetten(nieuw, scout);  // v6.4: melding, taak en tijdlijn
    return nieuw;
  });
  return trajectUit(t);
}
function apiNotitieToevoegen(trajectId, tekst) {
  tekst = String(tekst || '').trim(); if (!tekst) throw new Error('Geen tekst.');
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Traject niet gevonden.');
  eis('projecten', 'zien', t);  // v4.0
  // v2.0: naar Activiteiten, zodat de notitie ook in de tijdlijn van de school staat
  var n = metLock(function () { return schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), trajectId: trajectId, schoolId: t.schoolId || '', tekst: tekst, bron: 'app', aangemaakt: nu() }); });
  return { id: n.id, soort: 'activiteit', door: n.door, datum: n.datum, tekst: n.tekst };
}
function trajectUit(t) {
  return { id: t.id, schoolId: t.schoolId || '', school: t.school, plaats: t.plaats, traject: t.traject, schooljaar: t.schooljaar, start: t.start, eind: t.eind, status: t.status, ondersteuners: t.ondersteuners,
    urenPerWeek: Number(t.urenPerWeek) || 0, tarief: Number(t.tarief) || 0, omzet: Number(t.omzet) || 0, contactpersoon: t.contactpersoon, am: t.am, samenvatting: t.samenvatting, bijgewerkt: t.bijgewerkt,
    kansId: t.kansId || '', adviseur: t.adviseur || '', soortFacturatie: t.soortFacturatie || '', gefactureerd: t.gefactureerd || '', factuurDatum: t.factuurDatum || '', vakanties: t.vakanties || '',
    bijzonderheden: t.bijzonderheden || '', factuurnummer: t.factuurnummer || '',  // v3.8
    contactgegevens: t.contactgegevens || '', voorstelUrl: t.voorstelUrl || '', documentenUrl: t.documentenUrl || '', xpsProject: t.xpsProject || '', verlenging: t.verlenging || '', talentscout: t.talentscout || '', contractwaarde: t.contractwaarde === '' || t.contractwaarde == null ? '' : Number(t.contractwaarde) || 0 };  // v4.0; v6.4: talentscout
}

/* ===================== 6. CRM: scholen, personen, kansen, taken, tracks, historie en rapportage (v2.0: vervangt Capsule) ===================== */

var SCHOOL_STATUSSEN = ['lead', 'prospect', 'klant', 'oud-klant'];
var ACTIVITEIT_TYPES = ['notitie', 'gesprek', 'mail', 'afspraak'];   // handmatig te loggen; 'fase' en 'taak' schrijft de backend zelf
// v7.1: de vorm van een contactmoment (wat de gebruiker kiest bij "Activiteit loggen"). Het type blijft de grove soort waarop de
// rapporten tellen (gesprekken, mails, afspraken), zodat cijfers en oude regels gelijk blijven. Oude regels zonder vorm krijgen bij
// het lezen de vorm van hun type; een oude afspraak telt als fysiek.
var ACTIVITEIT_VORMEN = ['notitie', 'call', 'mail', 'whatsapp', 'afspraak-online', 'afspraak-fysiek', 'evaluatie-online', 'evaluatie-fysiek'];
var TYPE_VAN_VORM = { notitie: 'notitie', call: 'gesprek', mail: 'mail', whatsapp: 'gesprek', 'afspraak-online': 'afspraak', 'afspraak-fysiek': 'afspraak', 'evaluatie-online': 'afspraak', 'evaluatie-fysiek': 'afspraak' };
var VORM_VAN_TYPE = { notitie: 'notitie', gesprek: 'call', mail: 'mail', afspraak: 'afspraak-fysiek' };
function vormVan(a) { return TYPE_VAN_VORM.hasOwnProperty(a.vorm) ? a.vorm : (VORM_VAN_TYPE[a.type] || ''); }
// Een agenda-afspraak met een videolink of "online" in de locatie is online; "evaluatie" in de titel maakt er een evaluatiegesprek van
function vormVanAfspraak(titel, locatie, omschrijving) {
  var online = /meet\.google|teams\.microsoft|teams\.live|zoom\.us|whereby|webex|\bonline\b|videobellen/i.test(String(locatie || '') + ' ' + String(omschrijving || ''));
  return (/evaluat/i.test(String(titel || '')) ? 'evaluatie-' : 'afspraak-') + (online ? 'online' : 'fysiek');
}
var TAAK_CATEGORIEEN = ['bellen', 'mailen', 'afspraak', 'voorstel', 'opvolgen', 'overig'];
var DOEL_PERIODES = ['week', 'maand', 'kwartaal', 'halfjaar', 'jaar', 'schooljaar'];  // v4.2: schooljaar (bedrijfsdoelen); v4.4: half jaar en jaar
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
  if (typeof SERVER_LOGIN !== 'undefined' && SERVER_LOGIN) return gebruikerVanEmail(String(SERVER_LOGIN));  // v6.0: op Vercel heeft de server de gebruiker al via Google herkend (server/handler.js); de koppelcode blijft daarnaast werken
  if (!code) return null;
  if (code === P.getProperty('SECRET')) return { id: 'beheer', naam: P.getProperty('NAAM') || 'Menno', email: '', team: 'management', rol: 'management' };
  var gid = codes()[code]; if (!gid) return null;
  var g = lees('Gebruikers').filter(function (x) { return String(x.id) === String(gid); })[0];
  if (!g || !actief(g)) return null;
  return gebruikerVan(g);
}
// v6.0: ingelogd via Google (Supabase Auth) op de server: de eigenaar (EIGENAAR_EMAIL) is de beheerder, anderen staan met hun e-mailadres in Gebruikers
function gebruikerVanEmail(email) {
  var e = adresZonderPlus(email); if (!e) return null;
  if (adresZonderPlus(P.getProperty('EIGENAAR_EMAIL') || '') === e) return { id: 'beheer', naam: P.getProperty('NAAM') || 'Menno', email: email, team: 'management', rol: 'management' };
  var g = lees('Gebruikers').filter(function (x) { return adresZonderPlus(x.email) === e; })[0];
  if (!g || !actief(g)) return null;
  return gebruikerVan(g);
}
// v6.0: alles uitlezen voor de overstap naar Postgres (server/migratie.js); alleen management. 'eigenschappen' = de scripteigenschappen zonder sleutels.
function apiExportAlles(tabel, vanaf, aantal) {
  alleenBeheerder();
  if (tabel === 'eigenschappen') {
    var pr = P.getProperties(), eig = {};
    Object.keys(pr).forEach(function (k) { if (['ANTHROPIC_API_KEY', 'CAPSULE_TOKEN'].indexOf(k) < 0) eig[k] = pr[k]; });
    return { tabel: tabel, rijen: eig, totaal: Object.keys(eig).length, volgende: null };
  }
  if (!uitMap(TABELLEN, tabel)) throw new Error('Onbekend tabblad ' + (tabel == null || tabel === '' ? '(leeg)' : String(tabel)));  // v7.2: geen geërfde sleutels (__proto__) en geen 'undefined' in de melding
  var alle = lees(tabel), v = Math.max(0, Number(vanaf) || 0), n = Math.min(500, Math.max(1, Number(aantal) || 200));
  var deel = alle.slice(v, v + n).map(function (r) { var o = {}; TABELLEN[tabel].forEach(function (k) { o[k] = r[k]; }); return o; });
  return { tabel: tabel, vanaf: v, rijen: deel, totaal: alle.length, volgende: v + n < alle.length ? v + n : null };
}
// v4.0: teams en rollen. Elke gebruiker hoort bij één team en heeft een rol; de rechtentabel hieronder bepaalt wat hij ziet en mag.
var TEAMS = ['management', 'consultancy', 'accountmanagement', 'talent'];
var ROLLEN = ['medewerker', 'teamlead', 'management'];
// Oude rollen (v3.3: beheerder, adviseur, am) worden vanzelf omgezet.
function profielVan(g) {
  var team = TEAMS.indexOf(g.team) >= 0 ? g.team : g.rol === 'beheerder' ? 'management' : g.rol === 'adviseur' ? 'consultancy' : 'accountmanagement';
  return { team: team, rol: team === 'management' ? 'management' : g.rol === 'teamlead' ? 'teamlead' : 'medewerker' };
}
// v4.0: omschrijving voor de Assistent en de dagstart
var TEAM_FUNCTIE = { management: ['management', 'management (ziet alles)'], consultancy: ['onderwijsconsultant', 'onderwijsconsultant (haalt opdrachten binnen, eigen pipeline)'],
  accountmanagement: ['accountmanager', 'accountmanager (voert projecten uit en regelt de facturatie)'], talent: ['talentscout', 'talentscout (recruitment en HR: zoekt en begeleidt ondersteuners)'] };
function functieVan(ik, lang) { var f = TEAM_FUNCTIE[ik.team] || ['medewerker', 'medewerker']; return f[lang ? 1 : 0] + (ik.rol === 'teamlead' ? ', teamlead' : ''); }
function gebruikerVan(g) { var pr = profielVan(g); return { id: g.id, naam: g.naam, email: g.email, team: pr.team, rol: pr.rol }; }
// De backend kan alleen de Gmail en Agenda lezen van het account waaronder hij draait (tot Fase B: eigen koppeling per gebruiker).
function mijnMailbox() {
  if (!GEBRUIKER || GEBRUIKER.id === 'beheer') return true;
  try { return !!GEBRUIKER.email && adresZonderPlus(GEBRUIKER.email) === adresZonderPlus(Session.getEffectiveUser().getEmail()); } catch (e) { return false; }
}
function ikNaam() { return GEBRUIKER ? GEBRUIKER.naam : (P.getProperty('NAAM') || 'Menno'); }
function ikUit() {
  return { naam: ikNaam(), team: GEBRUIKER ? GEBRUIKER.team : 'management', rol: GEBRUIKER ? GEBRUIKER.rol : 'management', beheer: isBeheerder(), gekoppeld: mijnMailbox(), rechten: rechtenUit() };
}
function isBeheerder() { return !GEBRUIKER || GEBRUIKER.team === 'management'; }  // v4.0: management (directie)
function alleenBeheerder() { if (!isBeheerder()) throw new Error('Alleen het management kan dit.'); }
function isTeamlead() { return !!GEBRUIKER && GEBRUIKER.rol === 'teamlead'; }
function vanMij(eigenaar) { return eigenaar ? String(eigenaar) === ikNaam() : isBeheerder(); }
function gebruikersNamen() {
  return uniek([P.getProperty('NAAM') || 'Menno'].concat(lees('Gebruikers').filter(actief).map(function (g) { return g.naam; })));
}
function nieuweCode() { return 'am' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }

function apiGebruikers() {
  alleenBeheerder();
  var c = codes(), metCode = {};
  Object.keys(c).forEach(function (k) { metCode[c[k]] = true; });
  return { gebruikers: lees('Gebruikers').map(function (g) { var pr = profielVan(g); return { id: g.id, naam: g.naam, email: g.email, team: pr.team, rol: pr.rol, actief: actief(g), heeftCode: !!metCode[g.id] }; }), rollen: ROLLEN, teams: TEAMS };
}
// Nieuwe gebruiker of nieuweCode = true: geeft de koppelcode één keer terug. Uitschakelen (actief = false) trekt de code in.
function apiGebruikerOpslaan(obj, nieuweCodeMaken) {
  alleenBeheerder();
  var o = schoon(obj || {}, ['id', 'naam', 'email', 'rol', 'actief', 'team']);
  if (o.naam !== undefined) o.naam = String(o.naam).trim();
  if (!o.id && !o.naam) throw new Error('Naam is verplicht.');
  if (o.email !== undefined) o.email = String(o.email).trim().toLowerCase();
  if (o.team !== undefined && TEAMS.indexOf(o.team) < 0) throw new Error('Onbekend team.');  // v4.0
  if (o.rol !== undefined && ROLLEN.indexOf(o.rol) < 0) throw new Error('Onbekende rol.');
  if (o.team === 'management') o.rol = 'management'; else if (o.rol === 'management') o.rol = 'medewerker';
  if (o.actief !== undefined) o.actief = o.actief === true || o.actief === 'true' || o.actief === 'ja' ? 'ja' : 'nee';
  if (!o.id) { o.team = o.team || 'accountmanagement'; o.rol = o.rol || (o.team === 'management' ? 'management' : 'medewerker'); o.actief = 'ja'; nieuweCodeMaken = true; }
  var vorige = o.id ? vind('Gebruikers', o.id) : null;
  if (o.naam && gebruikersNamen().some(function (n) { return n === o.naam && (!vorige || n !== vorige.naam); })) throw new Error('Er is al een gebruiker met deze naam.');
  return metLock(function () {
    var g = schrijf('Gebruikers', o), c = codes(), code = '';
    if (vorige && o.naam && o.naam !== vorige.naam) hernoemGebruiker(vorige.naam, o.naam);  // v3.7: eigenaar, door en doelen meenemen
    Object.keys(c).forEach(function (k) { if (String(c[k]) === String(g.id) && (nieuweCodeMaken || !actief(g))) delete c[k]; });
    if (nieuweCodeMaken && actief(g)) { code = nieuweCode(); c[code] = g.id; }
    P.setProperty('CODES', JSON.stringify(c));
    var pr = profielVan(g);
    return { gebruiker: { id: g.id, naam: g.naam, email: g.email, team: pr.team, rol: pr.rol, actief: actief(g) }, code: code };
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
function datumIn(s) { var d = parseDatum(String(s || '')); return d ? datumStr(d) : ''; }  // v4.1
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
var JSON_LIJST_KOLOMMEN = { 'Talenten.functies': 1, 'Talenten.sectoren': 1, 'Talenten.vakken': 1 };  // v5.0
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
  var norm = function (k, v) { return JSON_LIJST_KOLOMMEN[tab + '.' + k] ? lijstUit(v).map(klein).join(', ') : normaal(v); };  // v5.0: een JSON-lijst in de Sheet tegen een lijst uit de app
  var botst = Object.keys(oud).filter(function (k) { return (k in hit) && norm(k, huidig(k)) !== norm(k, oud[k]) && norm(k, huidig(k)) !== norm(k, nieuw[k]); });
  if (botst.length) throw new Error('Intussen gewijzigd: ' + botst.join(', ') + ' (laatst bewerkt door ' + (hit.bijgewerktDoor || 'iemand anders') +
    (hit.bijgewerkt ? ' om ' + String(hit.bijgewerkt).slice(11, 16) : '') + '). Het scherm is ververst; voer je wijziging opnieuw in.');
}

function schoolUit(s) {
  return { id: s.id, naam: s.naam, plaats: s.plaats, type: s.type, bestuur: s.bestuur, adres: s.adres, website: s.website, leerlingen: s.leerlingen, telefoon: s.telefoon, email: s.email,
    status: s.status, eigenaar: s.eigenaar || s.am || '', tags: tagsUit(s.tags), velden: veldenUit(s.velden), contactpersoon: s.contactpersoon, notities: s.notities,
    laatsteContact: s.laatsteContact, aangemaakt: s.aangemaakt, bijgewerkt: s.bijgewerkt, betaaltermijn: s.betaaltermijn === '' || s.betaaltermijn == null ? '' : Number(s.betaaltermijn) || '' };  // v6.5
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
  u.tijd = a.tijd || ''; u.herhaling = herhalingUit(a.herhaling); u.bijgewerkt = a.bijgewerkt || '';  // v4.5
  // v4.6: tags, de hoofdtaak (tekst) en de stand van de subtaken
  var idx = taakIndex(), kind = idx.kinderen[String(a.id)];
  u.tags = tagsUit(a.tags); u.ouderId = a.ouderId || ''; u.ouder = a.ouderId && idx.perId[String(a.ouderId)] ? idx.perId[String(a.ouderId)].tekst : '';
  u.subtaken = kind ? { aantal: kind.aantal, af: kind.af } : { aantal: 0, af: 0 };
  return u;
}
// v4.6: per verzoek één keer de taken op id en de subtaken per hoofdtaak tellen (lees() onthoudt de rijen al)
var _TAAKINDEX = null;
function taakIndex() {
  if (!_TAAKINDEX) {
    var perId_ = {}, kinderen = {};
    lees('Acties').forEach(function (x) {
      perId_[String(x.id)] = x;
      if (x.ouderId) { var k = kinderen[String(x.ouderId)] = kinderen[String(x.ouderId)] || { aantal: 0, af: 0 }; k.aantal++; if (x.status === 'af') k.af++; }
    });
    _TAAKINDEX = { perId: perId_, kinderen: kinderen };
  }
  return _TAAKINDEX;
}
var _TRAJECTNAMEN = null;
function trajectNamen() { if (!_TRAJECTNAMEN) { _TRAJECTNAMEN = {}; lees('Trajecten').forEach(function (t) { _TRAJECTNAMEN[t.id] = t.traject + (t.schooljaar ? ' ' + t.schooljaar : ''); }); } return _TRAJECTNAMEN; }
function activiteitUit(a, sMap, pMap, kMap) {
  var s = sMap && sMap[String(a.schoolId)], p = pMap && pMap[String(a.persoonId)], k = kMap && kMap[String(a.kansId)];
  return { id: a.id, type: a.type, vorm: vormVan(a), datum: a.datum, door: a.door, onderwerp: a.onderwerp, tekst: String(a.tekst || '').slice(0, 3000), duurMin: Number(a.duurMin) || 0, bron: a.bron,
    schoolId: a.schoolId || '', persoonId: a.persoonId || '', kansId: a.kansId || '', school: s ? s.naam : '', persoon: p ? persoonNaam(p) : '', kans: k ? (k.naam || k.traject) : '',
    gepland: String(a.datum) > nu(), agenda: !!a.agendaId, trajectId: a.trajectId || '', project: a.trajectId ? (trajectNamen()[a.trajectId] || '') : '',  // v3.7: agenda = staat ook in Google Agenda
    talentId: a.talentId || '', talent: a.talentId ? talentNaamVan(a.talentId) : '' };  // v5.0
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
  if (!(lijst instanceof Array) || !lijst.length || lijst.some(function (m) { return !m || typeof m !== 'object'; })) throw new Error('Geef minstens één mijlpaal (naam, pipeline, kans, dagen).');  // v7.2: elk element een object (null gaf een TypeError)
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
  migreerV4();  // v4.0: eenmalig, bij de eerste start na de update
  var scholen = lees('Scholen'), personen = lees('Personen'), via = kansenViaProject(), kansen = lees('Kansen').filter(function (k) { return kansZichtbaar(k, via); }), sMap = perId(scholen), per = {}, naarId = {};  // v4.0: eigen pipeline, plus de kans achter mijn project
  scholen.forEach(function (s) { per[s.id] = { personen: 0, open: 0, waarde: 0 }; naarId[klein(s.naam)] = s.id; });
  personen.forEach(function (p) { if (per[p.schoolId]) per[p.schoolId].personen++; });
  kansen.filter(kansOpen).forEach(function (k) { var sid = k.schoolId || naarId[klein(k.school)]; if (per[sid]) { per[sid].open++; per[sid].waarde += Number(k.waarde) || 0; } });
  var tags = [];
  scholen.concat(personen).forEach(function (x) { tags = tags.concat(tagsUit(x.tags)); });
  return {
    ik: ikUit(), gebruikers: gebruikersNamen(), statussen: schoolStatussen(), trajectStatussen: trajectStatussen(), mijlpalen: mijlpalen(), categorieen: taakCategorieen(), activiteitTypes: ACTIVITEIT_TYPES, activiteitVormen: ACTIVITEIT_VORMEN, tracks: tracks(),
    tags: uniek(tags.map(function (t) { return t.toLowerCase(); })).sort(),
    scholen: scholen.map(function (s) { var u = schoolUit(s), x = per[s.id]; u.personen = x.personen; u.openKansen = x.open; u.openWaarde = x.waarde; delete u.velden; return u; }),
    personen: personen.map(function (p) { var u = persoonUit(p, sMap); delete u.velden; return u; }),
    // v3.8: projecten (kort) voor keuzelijsten en links, en de facturatie-keuzelijsten
    projecten: lees('Trajecten').filter(function (t) { return mag('projecten', 'zien', t); }).map(function (t) { return { id: t.id, naam: t.traject + (t.schooljaar ? ' ' + t.schooljaar : ''), schoolId: t.schoolId || '', school: t.school, kansId: t.kansId || '', status: t.status, am: t.am || '' }; }),
    kansenKort: kansen.filter(kansOpen).map(function (k) { return { id: k.id, naam: k.naam || k.traject, school: k.school, schoolId: k.schoolId || '' }; }),  // v4.5: het kansveld in het taakvenster
    keuzes: { soortFacturatie: keuzelijst('soortFacturatie'), gefactureerd: keuzelijst('gefactureerd'), vakanties: keuzelijst('vakanties'), factuurStatussen: keuzelijst('factuurStatussen'), verlenging: keuzelijst('verlenging') },
    teams: { consultancy: teamNamen('consultancy'), accountmanagement: teamNamen('accountmanagement'), talent: teamNamen('talent'), management: teamNamen('management') },
    meldingen: ongelezenMeldingen(), schooljaar: huidigSchooljaar()  // v4.1
  };
}
function apiSchool(id) {
  eis('relaties', 'zien');  // v7.2: ook lezen volgt de rechtentabel (elk team heeft nu 'alles'; de tabel is de enige bron van waarheid)
  var s = vind('Scholen', id); if (!s) throw new Error('School niet gevonden.');
  var naam = klein(s.naam), mp = mijlpaalMap(), sMap = {}; sMap[s.id] = s;
  var personen = lees('Personen').filter(function (p) { return String(p.schoolId) === String(id); }), pMap = perId(personen);
  var zicht = zichtbaarFilter();  // v4.0: alleen wat deze gebruiker mag zien
  var kansen = lees('Kansen').filter(function (k) { return (String(k.schoolId) === String(id) || (!k.schoolId && klein(k.school) === naam)) && mag('pipeline', 'zien', k); }), kMap = perId(kansen);
  var trajecten = lees('Trajecten').filter(function (t) { return (String(t.schoolId) === String(id) || (!t.schoolId && klein(t.school) === naam)) && mag('projecten', 'zien', t); }), tMap = perId(trajecten);
  var acts = lees('Activiteiten').filter(function (a) { return (String(a.schoolId) === String(id) || pMap[a.persoonId] || kMap[a.kansId] || tMap[a.trajectId]) && zicht(a); });
  var taken = lees('Acties').filter(function (a) { return a.status !== 'af' && (String(a.schoolId) === String(id) || pMap[a.persoonId] || kMap[a.kansId] || tMap[a.trajectId]) && zicht(a); }).sort(sorteerActies);
  var som = function (lijst) { return lijst.reduce(function (t, k) { return t + (Number(k.waarde) || 0); }, 0); };
  return {
    // v3.8: kerncijfers bovenaan de schoolpagina (zoals Capsule)
    cijfers: { laatsteContact: s.laatsteContact || '', openProjecten: trajecten.filter(projectLopend).length,
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
  eis('relaties', 'zien');  // v7.2: ook lezen volgt de rechtentabel
  var p = vind('Personen', id); if (!p) throw new Error('Persoon niet gevonden.');
  var s = p.schoolId ? vind('Scholen', p.schoolId) : null, sMap = {}, pMap = {}, mp = mijlpaalMap();
  if (s) sMap[s.id] = s; pMap[p.id] = p;
  var kansen = lees('Kansen').filter(function (k) { return String(k.persoonId) === String(id) && mag('pipeline', 'zien', k); }), kMap = perId(kansen), zicht = zichtbaarFilter();  // v4.0
  return {
    persoon: persoonUit(p, sMap), school: s ? { id: s.id, naam: s.naam, plaats: s.plaats } : null,
    kansen: kansen.map(function (k) { return kansUit(k, mp); }),
    taken: lees('Acties').filter(function (a) { return a.status !== 'af' && String(a.persoonId) === String(id) && zicht(a); }).sort(sorteerActies).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    tijdlijn: tijdlijn(lees('Activiteiten').filter(function (a) { return String(a.persoonId) === String(id) && zicht(a); }), sMap, pMap, kMap)
  };
}
var SCHOOL_VELDEN = ['id', 'naam', 'plaats', 'type', 'bestuur', 'adres', 'website', 'leerlingen', 'telefoon', 'email', 'status', 'eigenaar', 'tags', 'velden', 'notities', 'contactpersoon', 'betaaltermijn'];  // v6.5: betaaltermijn
function apiSchoolOpslaan(obj) {
  eis('relaties', 'wijzigen');  // v4.0
  var o = schoon(obj || {}, SCHOOL_VELDEN), oud = o.id ? vind('Scholen', o.id) : null;
  if (o.id && !oud) throw new Error('School niet gevonden.');
  if (o.naam !== undefined) o.naam = String(o.naam).trim();
  if (!oud && !o.naam) throw new Error('Naam is verplicht.');
  if (oud && o.naam === '') throw new Error('Naam mag niet leeg zijn.');
  if (o.status && schoolStatussen().indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);
  if (o.velden !== undefined) o.velden = veldenUit(o.velden);
  if (o.email !== undefined) o.email = klein(o.email);
  if (o.betaaltermijn !== undefined && o.betaaltermijn !== '') { o.betaaltermijn = Math.round(Number(o.betaaltermijn)); if (!(o.betaaltermijn >= 0 && o.betaaltermijn <= 365)) throw new Error('Betaaltermijn in dagen (0 tot 365).'); }  // v6.5
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
  eis('relaties', 'wijzigen');  // v4.0
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
var VERWIJDER_TABBLAD = { school: 'Scholen', persoon: 'Personen', kans: 'Kansen', activiteit: 'Activiteiten', taak: 'Acties', traject: 'Trajecten', notitie: 'Notities', content: 'Content', doel: 'Doelen', factuur: 'Facturen', vacature: 'Vacatures', kandidaat: 'Kandidaten',
  talent: 'Talenten', beoordeling: 'Beoordelingen', talentdocument: 'TalentDocumenten', talentschool: 'TalentSchool' };  // v5.0
function apiVerwijder(soort, id, opties) {
  var tab = uitMap(VERWIJDER_TABBLAD, soort);  // v7.2: geen geërfde sleutels ('constructor' gaf de functie Object als tabblad)
  if (!tab) throw new Error('Onbekend soort.');
  var r = vind(tab, id); if (!r) throw new Error('Niet gevonden.');
  if (soort === 'doel') eisDoelRecht(r.eigenaar);
  if (['talent', 'beoordeling', 'talentdocument', 'talentschool'].indexOf(soort) >= 0) return verwijderTalentRij(soort, tab, r);  // v5.0: eigen regels (zie talentnetwerk)
  // v4.0: kansen, projecten en termijnen volgen de rechtentabel (eigen werk; een teamlead ook dat van zijn team)
  var pr = soort === 'traject' ? r : ['factuur', 'vacature', 'kandidaat'].indexOf(soort) >= 0 ? vind('Trajecten', r.trajectId) || {} : null;
  var recht = { school: ['relaties'], persoon: ['relaties'], kans: ['pipeline', r], traject: ['projecten', pr], factuur: ['facturatie', pr], vacature: ['vacatures', pr], kandidaat: ['kandidaten', pr] }[soort];
  if (soort === 'vacature' && lees('Kandidaten').some(function (k) { return String(k.vacatureId) === String(id) && k.status !== 'afgewezen'; })) throw new Error('Deze vacature heeft nog kandidaten. Zet de vacature op gesloten of verwijder de kandidaten eerst.');
  if (recht) eis(recht[0], 'wijzigen', recht[1]);
  if (soort !== 'doel' && (!recht || !recht[1])) {
    if (!isBeheerder() && [r.eigenaar || r.door || r.am].indexOf(ikNaam()) < 0) throw new Error('Alleen de eigenaar of het management kan dit verwijderen.');
  }
  if (soort === 'activiteit' && opties && opties.agenda && r.agendaId) agendaEvent(r.agendaId, function (ev) { ev.deleteEvent(); });
  if (soort === 'school' && (lees('Personen').some(function (p) { return String(p.schoolId) === String(id); }) || lees('Kansen').some(function (k) { return String(k.schoolId) === String(id); })))
    throw new Error('Deze school heeft nog personen of kansen. Verwijder of verplaats die eerst.');
  metLock(function () {
    // v4.6: subtaken gaan mee (opties.metSubtaken) of worden losse taken
    if (soort === 'taak') {
      var kinderen = lees('Acties').filter(function (x) { return String(x.ouderId) === String(id); }), kindIds = {};
      kinderen.forEach(function (x) { kindIds[String(x.id)] = true; });
      if (kinderen.length && opties && opties.metSubtaken) verwijderRijen('Acties', function (x) { return !!kindIds[String(x.id)]; });  // verwijderRijen leest alleen de id-kolom
      else if (kinderen.length) schrijfVeel('Acties', kinderen.map(function (x) { return { id: x.id, ouderId: '' }; }));
    }
    verwijderRijen(tab, function (x) { return String(x.id) === String(id); });
  });
  return null;
}

/* ----- Historie: notities, gesprekken, mails en afspraken ----- */

function apiActiviteitToevoegen(obj) {
  obj = obj || {};
  var vorm = TYPE_VAN_VORM.hasOwnProperty(obj.vorm) ? obj.vorm : '';  // v7.1
  var type = vorm ? TYPE_VAN_VORM[vorm] : ACTIVITEIT_TYPES.indexOf(obj.type) >= 0 ? obj.type : 'notitie';
  var a = schoon(obj, ['schoolId', 'persoonId', 'kansId', 'trajectId', 'talentId']);  // v5.0: ook op de tijdlijn van een talent
  a.tekst = String(obj.tekst || '').trim(); a.onderwerp = String(obj.onderwerp || '').trim();
  if (!a.tekst && !a.onderwerp) throw new Error('Geen tekst.');
  if (!a.schoolId && !a.persoonId && !a.kansId && !a.trajectId && !a.talentId) throw new Error('Koppel de activiteit aan een school, persoon, kans of talent.');
  eisKoppeling(a);  // v4.0
  a.type = type; a.vorm = vorm || VORM_VAN_TYPE[type]; a.datum = datumTijdIn(obj.datum) || nu(); a.duurMin = Number(obj.duurMin) || ''; a.door = ikNaam(); a.bron = 'app'; a.aangemaakt = nu();
  vulKoppeling(a);
  var r = metLock(function () { var x = schrijf('Activiteiten', a); zetLaatsteContact([x]); if (x.talentId && ['gesprek', 'mail', 'afspraak'].indexOf(x.type) >= 0) zetTalentContact(x.talentId, x.datum); return x; });
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
  eis('pipeline', 'zien');  // v4.0
  var kansen = lees('Kansen').filter(function (k) { return (kansOpen(k) || (dagenSinds(k.gesloten || k.bijgewerkt) || 0) <= 60) && mag('pipeline', 'zien', k); });
  return { mijlpalen: ms, pipelines: uniek(ms.map(function (m) { return m.pipeline; })), kansen: kansen.map(function (k) { return kansUit(k, mp); }),
    verliesRedenen: uniek(lees('Kansen').map(function (k) { return k.verliesReden; })).sort() };
}
function apiKans(id) {
  var k = vind('Kansen', id); if (!k) throw new Error('Kans niet gevonden.');
  if (!kansZichtbaar(k, kansenViaProject())) throw new Error('Daar heb je geen toegang toe.');  // v4.0: een AM ziet alleen de kans achter zijn eigen project
  var s = k.schoolId ? vind('Scholen', k.schoolId) : null, p = k.persoonId ? vind('Personen', k.persoonId) : null, sMap = {}, pMap = {}, kMap = {};
  if (s) sMap[s.id] = s; if (p) pMap[p.id] = p; kMap[k.id] = k;
  return {
    alleenLezen: !mag('pipeline', 'wijzigen', k),
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
  eis('pipeline', 'wijzigen', oud || { eigenaar: o.eigenaar || ikNaam() });  // v4.0
  if (oud && o.eigenaar !== undefined && o.eigenaar !== oud.eigenaar) eis('pipeline', 'wijzigen', { eigenaar: o.eigenaar });
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
  var overdracht = fase === 'gewonnen' && (faseWissel || !oud) ? overdrachtIn(obj && obj.overdracht) : null;  // v6.4: het winformulier van de consultant (optioneel voor andere aanroepers)
  return metLock(function () {
    controleerConflict('Kansen', o.id, o, obj && obj._oud);  // v3.3
    var k = schrijf('Kansen', o), traject = null;
    if (faseWissel || !oud) {
      schrijf('Activiteiten', { type: 'fase', datum: nu(), door: ikNaam(), schoolId: k.schoolId, persoonId: k.persoonId, kansId: k.id, bron: 'app', aangemaakt: nu(),
        onderwerp: oud ? 'Mijlpaal: ' + oud.fase + ' → ' + k.fase : 'Kans aangemaakt: ' + (k.naam || k.traject) + ' (' + k.fase + ')', tekst: k.fase === 'verloren' && k.verliesReden ? 'Reden: ' + k.verliesReden : '' });
    }
    // v3.8: een gewonnen kans wordt altijd een project voor de accountmanager (maakTraject wordt niet meer gebruikt)
    if (k.fase === 'gewonnen' && (faseWissel || !oud)) traject = projectUitKans(k, school, overdracht);
    return { kans: kansUit(k, mp), traject: traject ? trajectUit(traject) : null };
  });
}

/* ----- Taken en tracks ----- */

function apiTaken() {
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen'));
  var acties = lees('Acties').filter(function (a) { return (a.status !== 'af' || (dagenSinds(a.afgerond) || 0) <= 14) && taakVanMijOfTeam(a); }).sort(sorteerActies);  // v4.0: eigen taken, teamlead ook zijn team
  var tags = {}; acties.forEach(function (a) { tagsUit(a.tags).forEach(function (t) { tags[klein(t)] = 1; }); });  // v4.6: tags in gebruik, voor de filterbalk
  return { taken: acties.map(function (a) { return taakUit(a, sMap, pMap, kMap); }), categorieen: taakCategorieen(), gebruikers: gebruikersNamen(), tracks: tracks(),
    tags: Object.keys(tags).sort(), weergaven: taakWeergaven(), herinneringen: herinneringenAan() };  // v4.6
}
var TAAK_VELDEN = ['id', 'tekst', 'prio', 'deadline', 'categorie', 'eigenaar', 'schoolId', 'persoonId', 'kansId', 'notitie', 'trajectId', 'tijd', 'herhaling', 'bron', 'tags', 'ouderId'];  // v4.5: tijd en herhaling; bron telt alleen bij een nieuwe taak; v4.6: tags en hoofdtaak
function apiTaakOpslaan(obj) {
  var o = schoon(obj || {}, TAAK_VELDEN), oud = o.id ? vind('Acties', o.id) : null;
  if (o.id && !oud) throw new Error('Taak niet gevonden.');
  if (oud && !taakVanMijOfTeam(oud)) throw new Error('Daar heb je geen toegang toe.');  // v4.5: alleen eigen taken (teamlead: zijn team, management alles)
  if (o.tekst !== undefined) o.tekst = String(o.tekst).trim();
  if (!oud && !o.tekst) throw new Error('Geen tekst.');
  if (o.prio && PRIOS.indexOf(o.prio) < 0) o.prio = 'midden';
  if (o.categorie && taakCategorieen().indexOf(o.categorie) < 0) o.categorie = 'overig';
  if (o.deadline) { o.deadline = datumIn(o.deadline); if (!o.deadline) throw new Error('Ongeldige datum.'); }  // v4.5
  if (o.tijd) { o.tijd = String(o.tijd).trim(); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(o.tijd)) throw new Error('Ongeldige tijd (uu:mm).'); }
  if (o.herhaling !== undefined) o.herhaling = herhalingIn(o.herhaling);
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);  // v4.6
  if (o.ouderId) {  // v4.6: subtaak van één niveau, onder een hoofdtaak die ik mag zien
    var ouder = vind('Acties', o.ouderId);
    if (!ouder || (o.id && String(ouder.id) === String(o.id))) throw new Error('Hoofdtaak niet gevonden.');
    if (ouder.ouderId) throw new Error('Een subtaak kan zelf geen subtaken hebben.');
    if (!taakZichtbaar(ouder)) throw new Error('Daar heb je geen toegang toe.');
    if (o.id && lees('Acties').some(function (x) { return String(x.ouderId) === String(o.id); })) throw new Error('Deze taak heeft zelf subtaken en kan geen subtaak worden.');
  }
  if (oud) delete o.bron; else o.bron = o.bron === 'handmatig' ? 'handmatig' : 'crm';
  if (!oud) { o.status = 'open'; o.aangemaakt = nu(); o.prio = o.prio || 'midden'; o.eigenaar = o.eigenaar || ikNaam(); }
  vulKoppeling(o); eisKoppeling(o);  // v4.0
  var a = metLock(function () {
    controleerConflict('Acties', o.id, o, obj && obj._oud);  // v3.3
    var r = schrijf('Acties', o);
    // v4.5: wie een taak voor een ander maakt of overdraagt, laat dat via de bel weten
    if (r.eigenaar && r.eigenaar !== ikNaam() && (!oud || oud.eigenaar !== r.eigenaar)) meld(r.eigenaar, 'Taak van ' + ikNaam() + ': ' + r.tekst + (r.deadline ? ' (uiterlijk ' + r.deadline + (r.tijd ? ' ' + r.tijd : '') + ')' : ''), 'taak:' + r.id);
    return r;
  });
  return taakUit(a, perId(lees('Scholen')), perId(lees('Personen')), perId(lees('Kansen')));
}
// v4.5: één taak, voor een deeplink (#taak:<id>) of een melding
function apiTaak(id) {
  var a = vind('Acties', id); if (!a) throw new Error('Taak niet gevonden.');
  if (!taakZichtbaar(a)) throw new Error('Daar heb je geen toegang toe.');
  return taakUit(a, perId(lees('Scholen')), perId(lees('Personen')), perId(lees('Kansen')));
}
// Eigen taak (of van mijn team), of een taak aan een project of kans die ik mag zien
function taakZichtbaar(a) {
  if (taakVanMijOfTeam(a)) return true;
  if (a.trajectId) { var t = vind('Trajecten', a.trajectId); if (t && mag('projecten', 'zien', t)) return true; }
  if (a.kansId) { var k = vind('Kansen', a.kansId); if (k && kansZichtbaar(k, kansenViaProject())) return true; }
  return false;
}
/* ----- v4.6: opgeslagen weergaven, herinneringsmail ----- */
// Voorkeuren staan per gebruiker in Instellingen (sleutel met de gebruikers-id; de eigenaar van het script is 'beheer')
function ikSleutel() { return GEBRUIKER ? String(GEBRUIKER.id) : 'beheer'; }
function taakWeergaven() { var l = instelling('taakWeergaven:' + ikSleutel()); return l instanceof Array ? l : []; }
var WEERGAVE_FILTERS = ['schoolId', 'trajectId', 'categorie', 'tag', 'prio', 'weergave'];
// lijst = [{naam, filter: {mijn, schoolId, trajectId, categorie, tag, prio, weergave}}], maximaal 12; de hele lijst vervangt de vorige
function apiTaakWeergavenOpslaan(lijst) {
  if (!(lijst instanceof Array)) throw new Error('Geen lijst.');
  if (lijst.length > 12) throw new Error('Maximaal 12 weergaven.');
  var schoon_ = lijst.map(function (w) {
    var naam = String((w && w.naam) || '').trim().slice(0, 40); if (!naam) throw new Error('Elke weergave heeft een naam nodig.');
    var f = (w && w.filter && typeof w.filter === 'object') ? w.filter : {}, uit = { mijn: f.mijn === true || f.mijn === 'true' };
    WEERGAVE_FILTERS.forEach(function (k) { if (f[k] !== undefined && f[k] !== null && f[k] !== '') uit[k] = String(f[k]).slice(0, 60); });
    return { naam: naam, filter: uit };
  });
  metLock(function () { zetInstelling('taakWeergaven:' + ikSleutel(), schoon_); });
  return schoon_;
}
function herinneringenAan() { return instelling('herinneringen:' + ikSleutel()) !== false; }  // standaard aan
function apiHerinneringenZetten(aan) {
  var waarde = aan === true || aan === 'true';
  metLock(function () { zetInstelling('herinneringen:' + ikSleutel(), waarde); });
  return { aan: waarde };
}
// Elk kwartier (trigger): open taken van vandaag met een tijd die binnen 15 minuten begint → één mail per gebruiker.
// 'herinnerd' wordt vóór het mailen gezet, zodat een taak nooit twee mails oplevert; staat de trigger een uur stil, dan wordt alleen gemarkeerd.
function herinneringTrigger() {
  var nuD = new Date(), vandaag = datumStr(nuD), minuten = nuD.getHours() * 60 + nuD.getMinutes();
  var rijp = lees('Acties').filter(function (a) { if (a.status === 'af' || a.deadline !== vandaag || !a.tijd || a.herinnerd) return false; var m = tijdMinuten(a.tijd); return m !== null && m <= minuten + 15; });
  if (!rijp.length) return 0;
  var ids = {}; rijp.forEach(function (a) { ids[String(a.id)] = true; });
  metLock(function () { zetHerinnerd(ids); });
  var perNaam = {}; rijp.forEach(function (a) { if (tijdMinuten(a.tijd) >= minuten - 60) (perNaam[a.eigenaar || ''] = perNaam[a.eigenaar || ''] || []).push(a); });
  var gebruikers = lees('Gebruikers').filter(actief), eigenaarNaam = P.getProperty('NAAM') || 'Menno', n = 0;
  Object.keys(perNaam).forEach(function (naam) {
    var g = gebruikers.filter(function (x) { return x.naam === naam; })[0];
    var sleutel = g ? String(g.id) : ((!naam || naam === eigenaarNaam) ? 'beheer' : ''), naar = g ? g.email : (sleutel === 'beheer' ? P.getProperty('RAPPORT_EMAIL') : '');
    if (!sleutel || !naar || instelling('herinneringen:' + sleutel) === false) return;
    try { herinneringMail(perNaam[naam].sort(sorteerActies), naar, naam || eigenaarNaam); n++; } catch (e) { Logger.log('Herinnering ' + naam + ' mislukt: ' + e); }
  });
  return n;
}
function tijdMinuten(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
// Alleen de cel 'herinnerd' zetten, zonder bijgewerkt/bijgewerktDoor aan te raken (dit is geen wijziging door een gebruiker)
function zetHerinnerd(ids) {
  var c = TABELLEN.Acties.indexOf('herinnerd') + 1, b = blad('Acties'), stempel = nu();
  lees('Acties').forEach(function (r) { if (ids[String(r.id)]) b.getRange(r._rij, c).setValue(stempel); });
  vergeet('Acties');
}
function appUrl() { return P.getProperty('APP_URL') || 'https://adanmr-prog.github.io/athena-assistent/'; }
function herinneringMail(taken, naar, naam) {
  var h = huisstijl(), url = appUrl(), eerste = taken[0], sMap = perId(lees('Scholen'));
  var regels = taken.map(function (a) {
    var s = a.schoolId && sMap[String(a.schoolId)] ? sMap[String(a.schoolId)].naam : '';
    return '<li style="margin:6px 0"><b>' + escHtml(a.tijd) + '</b> · ' + escHtml(a.tekst) + (s ? ' <span style="color:#9A8FA0">· ' + escHtml(s) + '</span>' : '') +
      ' <a href="' + escHtml(url + '#taak:' + a.id) + '" style="color:' + h.kleur_primair + '">openen</a></li>';
  }).join('');
  var html = '<div style="font-family:' + h.lettertype_tekst + ',Arial,sans-serif;max-width:620px;margin:0 auto;color:' + h.kleur_tekst + '">' +
    '<div style="background:' + h.kleur_primair + ';color:#fff;padding:18px 22px;border-bottom:4px solid ' + h.kleur_accent + '"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Athena Assistent · herinnering</div>' +
    '<div style="font-size:22px;font-weight:700;margin-top:4px">' + escHtml(taken.length === 1 ? eerste.tijd + ' · ' + eerste.tekst : taken.length + ' taken met een tijd') + '</div></div>' +
    '<div style="padding:18px 22px"><p style="font-size:15px;line-height:1.55">Hoi ' + escHtml(String(naam).split(' ')[0]) + ', ' + (taken.length === 1 ? 'deze taak staat zo op de planning.' : 'deze taken staan zo op de planning.') + '</p>' +
    '<ul style="padding-left:18px">' + regels + '</ul><p style="font-size:12px;color:#9A8FA0;margin-top:20px">Herinneringen uitzetten kan in de app onder het tandwiel.</p></div></div>';
  MailApp.sendEmail({ to: naar, subject: 'Athena · ' + eerste.tijd + ' · ' + eerste.tekst + (taken.length > 1 ? ' (+' + (taken.length - 1) + ')' : ''), htmlBody: html, name: 'Athena Assistent' });
}
// v4.5: herhaling = {eenheid: dag|week|maand|jaar, interval, dagen (ISO 1-7, alleen bij week), dagVanMaand (alleen bij maand), vanafAfvinken, tot, aantal}. Leeg = geen herhaling.
var HERHAAL_EENHEDEN = ['dag', 'week', 'maand', 'jaar'];
function herhalingIn(v) {
  if (typeof v === 'string') { v = v.trim(); if (!v) return ''; try { v = JSON.parse(v); } catch (e) { throw new Error('Ongeldige herhaling.'); } }
  if (!v || typeof v !== 'object' || !v.eenheid) return '';
  if (HERHAAL_EENHEDEN.indexOf(v.eenheid) < 0) throw new Error('Ongeldige herhaling.');
  var h = { eenheid: v.eenheid, interval: Math.min(52, Math.max(1, Math.round(Number(v.interval) || 1))) };
  if (h.eenheid === 'week' && Array.isArray(v.dagen)) {
    var dg = uniek(v.dagen.map(function (d) { return Math.round(Number(d)); }).filter(function (d) { return d >= 1 && d <= 7; })).sort(function (a, b) { return a - b; });
    if (dg.length) h.dagen = dg;
  }
  if (h.eenheid === 'maand' && v.dagVanMaand) h.dagVanMaand = Math.min(31, Math.max(1, Math.round(Number(v.dagVanMaand) || 1)));
  if (v.vanafAfvinken === true || v.vanafAfvinken === 'true') h.vanafAfvinken = true;
  if (v.tot) { h.tot = datumIn(v.tot); if (!h.tot) throw new Error('Ongeldige einddatum van de herhaling.'); }
  if (v.aantal) { var n = Math.round(Number(v.aantal)); if (n >= 1 && n <= 365) h.aantal = n; }
  return h;
}
function herhalingUit(s) {
  if (!s) return null;
  var h = s; if (typeof s === 'string') { try { h = JSON.parse(s); } catch (e) { return null; } }
  return h && typeof h === 'object' && HERHAAL_EENHEDEN.indexOf(h.eenheid) >= 0 ? h : null;
}
function isoDag(d) { var j = d.getDay(); return j === 0 ? 7 : j; }
function middag(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }  // rekenen op 12:00, zodat de zomertijd geen dag verschuift
function plusMaanden(d, n, dag) { var y = d.getFullYear(), m = d.getMonth() + n, laatste = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(dag, laatste), 12); }
// De eerstvolgende datum ná basis volgens de herhaling
function volgendeDatum(basis, h) {
  var b = middag(basis), n = h.interval || 1;
  if (h.eenheid === 'dag') return new Date(b.getTime() + n * 86400000);
  if (h.eenheid === 'week') {
    if (!h.dagen || !h.dagen.length) return new Date(b.getTime() + n * 7 * 86400000);
    var iso = isoDag(b), maandag = new Date(b.getTime() - (iso - 1) * 86400000);
    for (var i = 0; i < h.dagen.length; i++) if (h.dagen[i] > iso) return new Date(maandag.getTime() + (h.dagen[i] - 1) * 86400000);
    return new Date(maandag.getTime() + (n * 7 + h.dagen[0] - 1) * 86400000);
  }
  if (h.eenheid === 'maand') return plusMaanden(b, n, h.dagVanMaand || b.getDate());
  return plusMaanden(b, 12 * n, b.getDate());
}
// De volgende instantie van een herhalende taak: vanaf de deadline (of, met vanafAfvinken, vanaf het afvinken); nooit in het verleden; null als de reeks klaar is
function volgendeInstantie(a, h, afvinkD) {
  if (h.aantal && h.aantal <= 1) return null;
  var basis = h.vanafAfvinken ? afvinkD : (parseDatum(a.deadline) || afvinkD);
  var d = volgendeDatum(basis, h), vandaag = datumStr(new Date()), teller = 0;
  while (datumStr(d) < vandaag && teller++ < 500) d = volgendeDatum(d, h);  // een achterstallige reeks stapelt niet op
  if (h.tot && datumStr(d) > h.tot) return null;
  var nh = {}; Object.keys(h).forEach(function (k) { nh[k] = h[k]; });
  if (h.aantal) nh.aantal = h.aantal - 1;
  return { tekst: a.tekst, bron: a.bron, prio: a.prio, deadline: datumStr(d), status: 'open', link: a.link || '', aangemaakt: nu(), categorie: a.categorie, eigenaar: a.eigenaar,
    schoolId: a.schoolId, persoonId: a.persoonId, kansId: a.kansId, trajectId: a.trajectId, notitie: a.notitie, tijd: a.tijd || '', herhaling: nh,
    tags: a.tags || '', ouderId: a.ouderId || '' };  // v4.6: tags en hoofdtaak gaan mee; subtaken van een herhalende hoofdtaak niet
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
  eisKoppeling(k);  // v4.0
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
  eisKoppeling(k);  // v4.0
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
function crmSyncTrigger() {
  try { metLock(crmSync); } catch (e) { Logger.log('CRM-sync mislukt: ' + e); }
  try { aanmeldingenRun(); } catch (e2) { Logger.log('Aanmeldingen verwerken mislukt: ' + e2); }  // v5.0: nieuwe aanmeldingen uit het formulier elk uur
}
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
      rij.vorm = vormVanAfspraak(ev.getTitle(), ev.getLocation(), ev.getDescription());  // v7.1
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
  var mijnAf = lees('Acties').filter(function (a) { return a.status === 'af' && a.afgerond && vanMij(a.eigenaar); });  // v4.6: voor de teller en de streak
  var open = kansen.filter(kansOpen).filter(function (k) { return mag('pipeline', 'zien', k) && (isBeheerder() || isTeamlead() || k.eigenaar === ikNaam()); }).map(function (k) { return kansUit(k, mp); });  // v4.0
  var som = function (veld) { return open.reduce(function (t, k) { return t + (Number(k[veld]) || 0); }, 0); };
  var zicht = zichtbaarFilter();
  var recent = lees('Activiteiten').filter(function (a) { return String(a.datum) <= nu() && zicht(a); }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).slice(0, 25);
  var begin = new Date(); begin.setHours(0, 0, 0, 0);
  return {
    groet: groet(), datum: datumLang(new Date()), ik: ikUit(), bedrijf: bedrijfCijfers(),  // v4.2: bedrijfsdoelen voor iedereen
    taken: taken.slice(0, 40).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    agenda: agendaItems(begin, new Date(begin.getFullYear(), begin.getMonth(), begin.getDate() + 7)), gekoppeld: mijnMailbox(),  // v7.2: kalenderdag, niet 24 uur (zomertijd)
    pipeline: { open: open.length, waarde: som('waarde'), gewogen: som('gewogen'), stil: open.filter(function (k) { return k.stil; }).sort(function (a, b) { return b.dagenStil - a.dagenStil; }).slice(0, 8) },
    recent: recent.map(function (a) { return activiteitUit(a, sMap, pMap, kMap); }),
    afgerondWeek: afgerondDezeWeek(mijnAf), streak: werkdagenStreak(mijnAf),  // v4.6
    kerncijfers: homeKerncijfers(),  // v7.1: tegels per functie
    mails: []  // v3.2: Gmail is traag; de app haalt de mails apart op met apiHomeMails
  };
}
// v4.6: afgerond deze week (maandag t/m vandaag) en de reeks werkdagen op rij met minstens één afgevinkte taak; vandaag breekt de reeks niet zolang de dag loopt
function afgerondDezeWeek(af) { var d = middag(new Date()), ma = datumStr(new Date(d.getTime() - (isoDag(d) - 1) * 86400000)); return af.filter(function (a) { return String(a.afgerond).slice(0, 10) >= ma; }).length; }
function werkdagenStreak(af) {
  var dagen = {}; af.forEach(function (a) { dagen[String(a.afgerond).slice(0, 10)] = true; });
  var d = middag(new Date()), vandaag = datumStr(d), n = 0;
  for (var i = 0; i < 90; i++) {
    var s = datumStr(d);
    if (isoDag(d) <= 5) { if (dagen[s]) n++; else if (s !== vandaag) break; }
    d = new Date(d.getTime() - 86400000);
  }
  return n;
}
// v7.1: kerncijfers voor de tegels op Home. De app kiest per functie hoogstens vier tegels; hier alleen wat die functie nodig heeft.
// Lopende projecten: management en teamleads alles wat ze mogen zien, anderen hun eigen (AM of adviseur). Nog te factureren: termijnen
// met status "nog te doen" (of leeg) van die projecten, als je facturatie mag zien. Bezetting: open vacatures en lege plekken (talent).
function homeKerncijfers() {
  var team = GEBRUIKER ? GEBRUIKER.team : 'management', ik = ikNaam(), breed = isBeheerder() || isTeamlead();
  var lopend = lees('Trajecten').filter(function (t) { return projectLopend(t) && mag('projecten', 'zien', t); });
  var mijn = lopend.filter(function (t) { return breed || t.am === ik || t.adviseur === ik; }), uit = { lopendeProjecten: mijn.length };
  if (team === 'accountmanagement' || team === 'management') {
    var ids = {}; mijn.forEach(function (t) { if (mag('facturatie', 'zien', t)) ids[t.id] = true; });
    uit.teFactureren = lees('Facturen').filter(function (f) { return ids[f.trajectId] && (!f.status || f.status === 'nog te doen'); }).reduce(function (n, f) { return n + (Number(f.bedrag) || 0); }, 0);
  }
  if (team === 'talent' || team === 'management') {
    var vacs = lees('Vacatures'), kands = lees('Kandidaten'), open = 0, leeg = 0;
    lopend.forEach(function (t) { var b = bezettingVan(t.id, vacs, kands); open += b.openVacatures; leeg += Math.max(0, b.nodig - b.gevuld); });
    uit.openVacatures = open; uit.teBezetten = leeg;
  }
  return uit;
}
function apiHomeMails() { return mailsOnbeantwoord(5); }
// van, tot: 'yyyy-MM-dd' (tot en met). Maximaal 62 dagen.
function apiAgenda(van, tot) {
  var a = parseDatum(van), b = parseDatum(tot);
  if (!a || !b || b < a) throw new Error('Ongeldige periode.');
  if ((b - a) / 86400000 > 62) throw new Error('Kies maximaal twee maanden.');
  var eind = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1), vanS = datumStr(a), totS = datumStr(b);  // v7.2: kalenderdag, niet 24 uur (zomertijd)
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen'));
  var zicht = zichtbaarFilter(), acts = lees('Activiteiten').filter(function (x) { return x.type === 'afspraak' && zicht(x) && taakVanMijOfTeam({ eigenaar: x.door }); }), perSleutel = {};  // v4.0
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
    taken: lees('Acties').filter(function (x) { return x.status !== 'af' && inBereik(x.deadline) && taakVanMijOfTeam(x); }).sort(sorteerActies).map(function (x) { return taakUit(x, sMap, pMap, kMap); })
  };
}

/* ----- Rapportage en activity tracking ----- */

// v4.4: begin en eind van een periode. stap 0 = de lopende periode (t/m vandaag), -1 = de vorige hele periode, enzovoort.
function periodeGrenzen(preset, stap) {
  var d = new Date(), j = d.getFullYear(), m = d.getMonth(), begin, eind;
  if (preset === 'maand') { begin = new Date(j, m + stap, 1); eind = new Date(j, m + stap + 1, 0); }
  else if (preset === 'kwartaal') { var q = Math.floor(m / 3) * 3 + 3 * stap; begin = new Date(j, q, 1); eind = new Date(j, q + 3, 0); }
  else if (preset === 'halfjaar') { var h = (m < 6 ? 0 : 6) + 6 * stap; begin = new Date(j, h, 1); eind = new Date(j, h + 6, 0); }
  else if (preset === 'jaar') { begin = new Date(j + stap, 0, 1); eind = new Date(j + stap, 11, 31); }
  else if (preset === 'schooljaar') { var sj = schooljaarStart(huidigSchooljaar()).getFullYear() + stap; begin = new Date(sj, 7, 1); eind = new Date(sj + 1, 6, 31); }  // v4.2
  else { begin = new Date(j, m, d.getDate() - (d.getDay() + 6) % 7 + 7 * stap); eind = new Date(begin.getFullYear(), begin.getMonth(), begin.getDate() + 6); }  // week vanaf maandag
  return { begin: begin, eind: eind };
}
function periodeBereik(preset, stap) {
  stap = Math.min(0, Math.round(Number(stap) || 0));
  var g = periodeGrenzen(preset, stap), d = new Date(), vandaag = new Date(d.getFullYear(), d.getMonth(), d.getDate()), lopend = g.eind >= vandaag;
  return { van: datumStr(g.begin), tot: datumStr(lopend ? vandaag : g.eind), eind: datumStr(g.eind), lopend: lopend, stap: stap, label: periodeNaam(preset, g.begin), kort: periodeKort(preset, g.begin) };
}
// De vergelijkingsperiode: de periode ervoor, en bij een lopende periode even lang (1 t/m 9 oktober tegen 1 t/m 9 september)
function vergelijkBereik(preset, B) {
  var V = periodeBereik(preset, B.stap - 1);
  if (B.lopend) {
    var dagen = Math.round((parseDatum(B.tot) - parseDatum(B.van)) / 86400000), b = parseDatum(V.van);
    var t = datumStr(new Date(b.getFullYear(), b.getMonth(), b.getDate() + dagen));
    if (t < V.tot) V.tot = t;
  }
  return V;
}
var MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function isoWeek(d) {
  var t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - (d.getDay() + 6) % 7), w1 = new Date(t.getFullYear(), 0, 4);  // de donderdag van de week bepaalt het jaar
  return 1 + Math.round(((t - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}
function periodeNaam(preset, b) {
  var j = b.getFullYear();
  if (preset === 'maand') return MAANDEN[b.getMonth()] + ' ' + j;
  if (preset === 'kwartaal') return 'Q' + (Math.floor(b.getMonth() / 3) + 1) + ' ' + j;
  if (preset === 'halfjaar') return (b.getMonth() < 6 ? 'eerste' : 'tweede') + ' helft ' + j;
  if (preset === 'jaar') return String(j);
  if (preset === 'schooljaar') return 'schooljaar ' + j + '-' + (j + 1);
  return 'week ' + isoWeek(b) + ' van ' + b.getFullYear();  // de data staan er in de app al naast
}
function periodeKort(preset, b) {
  var j = b.getFullYear(), jj = "'" + String(j).slice(2);
  if (preset === 'maand') return MAANDEN_KORT[b.getMonth()] + ' ' + jj;
  if (preset === 'kwartaal') return 'Q' + (Math.floor(b.getMonth() / 3) + 1) + ' ' + jj;
  if (preset === 'halfjaar') return 'H' + (b.getMonth() < 6 ? 1 : 2) + ' ' + jj;
  if (preset === 'jaar') return String(j);
  if (preset === 'schooljaar') return String(j).slice(2) + '-' + String(j + 1).slice(2);
  return 'wk ' + isoWeek(b);
}
function apiRapport(preset, eigenaar, stap) {
  preset = DOEL_PERIODES.indexOf(preset) >= 0 ? preset : 'week';
  // v4.0: management ziet iedereen, een teamlead zijn team (leeg = teamtotaal), een medewerker zijn eigen cijfers
  var mensen = zichtbareMensen(), magPersoon = function (n) { return isBeheerder() || mensen.indexOf(n) >= 0; };
  if (!isBeheerder() && (!eigenaar || mensen.indexOf(eigenaar) < 0)) eigenaar = isTeamlead() ? '' : ikNaam();
  var B = periodeBereik(preset, stap), van = B.van, tot = B.tot;  // v4.4: ook eerdere periodes
  var inPeriode = function (s) { var d = String(s || '').slice(0, 10); return d >= van && d <= tot; };
  var leeg = function () { return { gesprekken: 0, mails: 0, afspraken: 0, notities: 0, nieuweKansen: 0, voorstellen: 0, gewonnen: 0, gewonnenWaarde: 0, verloren: 0, takenAf: 0 }; };
  var per = {}, p = function (n) { n = n || 'Onbekend'; return per[n] || (per[n] = leeg()); };
  mensen.forEach(p);
  var mp = mijlpaalMap(), kansen = lees('Kansen').filter(function (k) { return mag('pipeline', 'zien', k); });
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
  var namen = eigenaar ? [eigenaar] : Object.keys(per).filter(function (n) { var c = per[n]; return magPersoon(n) && (n !== 'Onbekend' || Object.keys(c).some(function (k) { return c[k]; })); });
  var team = leeg();
  namen.forEach(function (n) { var c = per[n] || leeg(); Object.keys(team).forEach(function (k) { team[k] += c[k]; }); });
  var doelen = {};
  lees('Doelen').filter(function (d) { return d.periode === preset && Number(d.doel); }).forEach(function (d) { (doelen[d.eigenaar] = doelen[d.eigenaar] || {})[d.metric] = Number(d.doel); });
  var open = kansen.filter(kansOpen).filter(function (k) { return eigenaar ? k.eigenaar === eigenaar : magPersoon(k.eigenaar) || isBeheerder(); }).map(function (k) { return kansUit(k, mp); });
  var maanden = {};
  open.forEach(function (k) {
    var m = k.verwachteSluiting ? String(k.verwachteSluiting).slice(0, 7) : 'zonder datum', x = maanden[m] || (maanden[m] = { maand: m, waarde: 0, gewogen: 0, aantal: 0 });
    x.waarde += k.waarde; x.gewogen += k.gewogen; x.aantal++;
  });
  var som = function (lijst, veld) { return lijst.reduce(function (s, k) { return s + (Number(k[veld]) || 0); }, 0); };
  var gesloten = kansen.filter(function (k) { return (k.fase === 'gewonnen' || k.fase === 'verloren') && inPeriode(k.gesloten) && (eigenaar ? k.eigenaar === eigenaar : magPersoon(k.eigenaar) || isBeheerder()); });
  var gew = gesloten.filter(function (k) { return k.fase === 'gewonnen'; }), verl = gesloten.filter(function (k) { return k.fase === 'verloren'; }), redenen = {};
  verl.forEach(function (k) { var r = k.verliesReden || 'onbekend'; redenen[r] = (redenen[r] || 0) + 1; });
  return {
    preset: preset, van: van, tot: tot, eigenaar: eigenaar || '', gebruikers: mensen, ik: ikUit(), team: team,
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
function apiActiviteiten(door, van, tot, team) {
  // v4.0: management kiest iedereen, een teamlead iemand uit zijn team (leeg = het hele team), een medewerker alleen zichzelf
  var mensen = zichtbareMensen();
  if (!isBeheerder() && mensen.indexOf(door) < 0) door = isTeamlead() ? '' : ikNaam();
  if (!door && RAPPORT_TEAMS.indexOf(team) >= 0) { var leden = teamNamen(team); mensen = isBeheerder() ? leden : mensen.filter(function (n) { return leden.indexOf(n) >= 0; }); }  // v4.4: alleen de activiteit van dat team
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen')), perType = {}, perVorm = {}, zicht = zichtbaarFilter();
  var lijst = lees('Activiteiten').filter(function (a) {
    var d = String(a.datum).slice(0, 10);
    return (door ? a.door === door : (isBeheerder() && RAPPORT_TEAMS.indexOf(team) < 0) || mensen.indexOf(a.door) >= 0) && (!van || d >= van) && (!tot || d <= tot) && String(a.datum) <= nu() && zicht(a);
  });
  lijst.forEach(function (a) { perType[a.type] = (perType[a.type] || 0) + 1; var v = vormVan(a) || a.type; perVorm[v] = (perVorm[v] || 0) + 1; });  // v7.1: ook per vorm
  return { door: door, totaal: lijst.length, perType: perType, perVorm: perVorm, tijdlijn: tijdlijn(lijst, sMap, pMap, kMap), gebruikers: mensen };
}
// Oudere activiteit van één school, persoon of kans uit het archief (op verzoek, zodat gewone schermen snel blijven)
function apiArchiefTijdlijn(soort, id) {
  var veld = { school: 'schoolId', persoon: 'persoonId', kans: 'kansId' }[soort]; if (!veld) throw new Error('Onbekend soort.');
  if (soort === 'kans') eisKoppeling({ kansId: id });  // v4.0
  var sMap = perId(lees('Scholen')), pMap = perId(lees('Personen')), kMap = perId(lees('Kansen')), zicht = zichtbaarFilter();
  return tijdlijn(lees('Activiteiten_archief').filter(function (a) { return String(a[veld]) === String(id) && zicht(a); }), sMap, pMap, kMap);
}
// Maandelijks: activiteit ouder dan 12 maanden naar Activiteiten_archief. Het tabblad wordt in één keer herschreven
// (rij voor rij verwijderen is te traag bij duizenden rijen); het archief wordt eerst geschreven, zodat er niets verloren gaat.
function archiveerTrigger() { try { metLock(archiveer); } catch (e) { Logger.log('Archiveren mislukt: ' + e); } }
function apiArchiveer() { alleenBeheerder(); return metLock(archiveer); }
function archiveer() {
  var grens = datumStr(plusDagen(-365)), alle = lees('Activiteiten');  // v7.2: kalenderdagen (geen uurdrift rond de zomertijd)
  var isOud = function (a) { var d = String(a.datum).slice(0, 10); return !!d && d < grens; };
  var oud = alle.filter(isOud), houden = alle.filter(function (a) { return !isOud(a); });
  if (!oud.length) return { gearchiveerd: 0, over: houden.length };
  schrijfVeel('Activiteiten_archief', oud);
  var b = blad('Activiteiten'), kop = TABELLEN.Activiteiten, laatste = b.getLastRow();
  if (laatste > 1) b.getRange(2, 1, laatste - 1, kop.length).clearContent();
  if (houden.length) b.getRange(2, 1, houden.length, kop.length).setValues(houden.map(function (r) { return kop.map(function (k) { return celUit(r[k]); }); }));
  vergeet('Activiteiten');
  var uren = archiveerUren();  // v5.0
  return { gearchiveerd: oud.length, over: houden.length, uren: uren };
}
// v5.0: weekuren ouder dan 26 weken naar TalentUren_archief (zelfde aanpak: eerst het archief schrijven, dan het tabblad in één keer herschrijven)
function archiveerUren() {
  var grens = isoWeekStr(plusDagen(-26 * 7)), alle = lees('TalentUren');  // v7.2: kalenderdagen
  var oud = alle.filter(function (u) { return u.week && String(u.week) < grens; });
  if (!oud.length) return 0;
  schrijfVeel('TalentUren_archief', oud);
  var houden = alle.filter(function (u) { return !(u.week && String(u.week) < grens); }), b = blad('TalentUren'), kop = TABELLEN.TalentUren, laatste = b.getLastRow();
  if (laatste > 1) b.getRange(2, 1, laatste - 1, kop.length).clearContent();
  if (houden.length) b.getRange(2, 1, houden.length, kop.length).setValues(houden.map(function (r) { return kop.map(function (k) { return celUit(r[k]); }); }));
  vergeet('TalentUren');
  return oud.length;
}

// v4.0: management zet doelen voor iedereen, een teamlead voor zijn eigen team; een medewerker ziet alleen zijn eigen doelen
// v4.2: ook teamdoelen (eigenaar 'team:<team>') en bedrijfsdoelen ('bedrijf', iedereen ziet ze, alleen het management zet ze)
var TEAM_DOELNAAM = { consultancy: 'Team onderwijsconsultants', accountmanagement: 'Team accountmanagers', talent: 'Team talent' };
function doelZichtbaar(eigenaar, mensen) {
  eigenaar = String(eigenaar);
  if (eigenaar === 'bedrijf' || isBeheerder()) return true;
  if (eigenaar.indexOf('team:') === 0) return !!GEBRUIKER && eigenaar === 'team:' + GEBRUIKER.team;
  return mensen.indexOf(eigenaar) >= 0;
}
function apiDoelen() {
  var mensen = zichtbareMensen(), eigenaren = [];
  if (isBeheerder()) eigenaren.push({ waarde: 'bedrijf', label: 'Bedrijf (iedereen)', team: 'bedrijf' });
  (isBeheerder() ? RAPPORT_TEAMS : RAPPORT_TEAMS.filter(function (t) { return isTeamlead() && GEBRUIKER.team === t; })).forEach(function (t) {
    eigenaren.push({ waarde: 'team:' + t, label: TEAM_DOELNAAM[t], team: t });
    teamNamen(t).forEach(function (n) { eigenaren.push({ waarde: n, label: n, team: t }); });
  });
  return { doelen: lees('Doelen').filter(function (d) { return doelZichtbaar(d.eigenaar, mensen); }).map(function (d) { return { id: d.id, eigenaar: d.eigenaar, periode: d.periode, metric: d.metric, doel: Number(d.doel) || 0 }; }),
    metrics: Object.keys(METRIEKEN), metrieken: metriekDefs(), periodes: DOEL_PERIODES, gebruikers: mensen, eigenaren: eigenaren, teamNamen: TEAM_DOELNAAM, magZetten: isBeheerder() || isTeamlead() };
}
function eisDoelRecht(eigenaar) {
  if (isBeheerder()) return;
  eigenaar = String(eigenaar);
  if (eigenaar === 'bedrijf') throw new Error('Alleen het management zet bedrijfsdoelen.');
  if (eigenaar.indexOf('team:') === 0) { if (isTeamlead() && eigenaar === 'team:' + GEBRUIKER.team) return; throw new Error('Alleen het management of de teamlead zet doelen voor dit team.'); }
  if (!isTeamlead() || teamNamen(GEBRUIKER.team).indexOf(eigenaar) < 0) throw new Error('Alleen het management of de teamlead zet doelen voor dit team.');
}
function apiDoelOpslaan(obj) {
  obj = obj || {};
  var eigenaar = String(obj.eigenaar || '').trim();
  if (!eigenaar) throw new Error('Kies een persoon.');
  eisDoelRecht(eigenaar);
  if (obj.id) { var oudDoel = vind('Doelen', obj.id); if (oudDoel) eisDoelRecht(oudDoel.eigenaar); }
  if (DOEL_PERIODES.indexOf(obj.periode) < 0) throw new Error('Kies week, maand, kwartaal, half jaar, jaar of schooljaar.');
  if (!METRIEKEN[obj.metric]) throw new Error('Onbekende maatstaf.');
  if (eigenaar === 'bedrijf' && METRIEKEN[obj.metric].team !== 'bedrijf') throw new Error('Kies een bedrijfscijfer voor een bedrijfsdoel.');  // v4.2
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
  var namen = { scholen: 'Scholen', personen: 'Personen', kansen: 'Kansen', activiteiten: 'Activiteiten', taken: 'Acties', trajecten: 'Trajecten', talenten: 'Talenten', beoordelingen: 'Beoordelingen', talenturen: 'TalentUren' };  // v5.0: talentnetwerk (alleen management)
  var naam = uitMap(namen, String(tabel || '').toLowerCase());  // v7.2: geen geërfde sleutels ('__proto__' gaf Object.prototype als tabel)
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
      rijen.push({ id: 'cap-c' + x.id, capsuleId: x.id, schoolId: pt.schoolId, school: pt.school, plaats: s.plaats || '', traject: x.name, status: x.status === 'CLOSED' ? 'afgelopen' : 'bezig',
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
  var triggers = triggerNamen();  // v4.4.2
  var laatste = lees('Reviews').sort(function (a, b) { return String(b.gemaaktOp).localeCompare(String(a.gemaaktOp)); })[0];
  var beheer = isBeheerder();
  return { versie: VERSIE, sheetUrl: beheer ? sheet().getUrl() : '', mapUrl: mapUrl(), gebruiker: ikUit(),  // v2.0: Sheet-link alleen voor de beheerder
    crmSyncTrigger: triggers.indexOf('crmSyncTrigger') >= 0, archiefTrigger: triggers.indexOf('archiveerTrigger') >= 0, laatsteCrmSync: P.getProperty('LAATSTE_CRM_SYNC') || '', capsuleToken: !!P.getProperty('CAPSULE_TOKEN'), capsuleMigratie: P.getProperty('CAPSULE_MIGRATIE') || '', model: P.getProperty('CLAUDE_MODEL') || 'claude-opus-5', effort: P.getProperty('CLAUDE_EFFORT') || 'medium',
    claudeIngesteld: !!P.getProperty('ANTHROPIC_API_KEY'), driveApi: typeof Drive !== 'undefined', laatsteIndex: P.getProperty('LAATSTE_INDEX') || '', laatsteReview: laatste ? laatste.gemaaktOp : '',
    rapportEmail: P.getProperty('RAPPORT_EMAIL') || '', reviewTrigger: triggers.indexOf('nachtelijkeReviewTrigger') >= 0, indexTrigger: triggers.indexOf('indexeerTrigger') >= 0, tijdzone: tz(),
    herinneringTrigger: triggers.indexOf('herinneringTrigger') >= 0, herinneringen: herinneringenAan(), email: GEBRUIKER && GEBRUIKER.id !== 'beheer' ? (GEBRUIKER.email || '') : (P.getProperty('RAPPORT_EMAIL') || ''),  // v4.6
    talentTrigger: triggers.indexOf('talentDagelijksTrigger') >= 0, urenTrigger: triggers.indexOf('talentUrenTrigger') >= 0, xpsExportMap: !!P.getProperty('XPS_EXPORT_MAP_ID'), laatsteUrenImport: P.getProperty('LAATSTE_URENIMPORT') || '' };  // v5.0
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
  factuurStatussen: { standaard: ['nog te doen', 'aangemaakt', 'verzonden', 'betaald'], tab: 'Facturen', kolom: 'status' },
  verlenging:       { standaard: ['nog bespreken', 'voorstel verstuurd', 'verlengd', 'stopt'], tab: 'Trajecten', kolom: 'verlenging' },  // v4.0
  kandidaatBronnen: { standaard: ['talentbestand', 'XPS-bestand', 'LinkedIn', 'eigen netwerk', 'sollicitatie', 'anders'], tab: 'Kandidaten', kolom: 'bron' },  // v4.1; v5.0: talentbestand
  // v5.0: talentnetwerk. json = de kolom bevat een JSON-lijst (hernoemen gaat per waarde); sleutels = de kolom bevat een JSON-object met de waarden als sleutel
  talentFuncties:   { standaard: ['onderwijsondersteuner', 'studentdocent', 'huiswerkbegeleider', 'examentrainer', 'nt2-ondersteuner', 'rekenondersteuner', 'surveillant'], tab: 'Talenten', kolom: 'functies', json: true },
  sectoren:         { standaard: ['po', 'vo', 'mbo', 'so', 'isk'], tab: 'Talenten', kolom: 'sectoren', json: true },
  vakken:           { standaard: ['nederlands', 'engels', 'wiskunde', 'rekenen', 'duits', 'frans', 'natuurkunde', 'scheikunde', 'biologie', 'economie', 'geschiedenis', 'aardrijkskunde'], tab: 'Talenten', kolom: 'vakken', json: true },
  documentSoorten:  { standaard: ['vog', 'diploma', 'certificaat', 'bevoegdheid', 'overig'], tab: 'TalentDocumenten', kolom: 'soort' },
  contractvormen:   { standaard: ['ovo', 'min-max', 'zzp', 'stage'], tab: 'Talenten', kolom: 'contractvorm' },
  beoordelingsCriteria: { standaard: ['punctualiteit', 'didactiek', 'samenwerking', 'communicatie'], tab: 'Beoordelingen', kolom: 'criteria', sleutels: true },
  talentBronnen:    { standaard: ['website', 'xps-bestand', 'linkedin', 'eigen netwerk', 'sollicitatie', 'anders'], tab: 'Talenten', kolom: 'bron' }
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
function apiInstellingen() {
  var uit = {}; Object.keys(KEUZELIJSTEN).forEach(function (k) { uit[k] = keuzelijst(k); });
  uit.schooljaar = huidigSchooljaar(); uit.schooljaarHandmatig = instelling('schooljaar') || ''; uit.schooljaarOpDatum = schooljaarOpDatum();  // v4.1
  return uit;
}
// v4.1: leeg = automatisch op datum; anders yyyy-yyyy (bijv. 2027-2028)
function apiSchooljaarOpslaan(sj) {
  alleenBeheerder();
  sj = String(sj || '').trim();
  var m = /^'?(\d{2}|\d{4})\s*[-\/]\s*'?(\d{2}|\d{4})$/.exec(sj);  // ook 27/28, '27/'28 en 2027/28
  if (m) { var a = m[1].length === 2 ? '20' + m[1] : m[1]; sj = a + '-' + (m[2].length === 2 ? a.slice(0, 2) + m[2] : m[2]); }
  if (sj && (!/^\d{4}-\d{4}$/.test(sj) || Number(sj.slice(5)) !== Number(sj.slice(0, 4)) + 1)) throw new Error('Schrijf het schooljaar als 2027-2028.');
  metLock(function () { zetInstelling('schooljaar', sj); });
  return { schooljaar: huidigSchooljaar() };
}
// lijst: [{waarde, oud}] in de gewenste volgorde; oud = de waarde zoals geladen (leeg bij een nieuwe).
function apiKeuzelijstOpslaan(sleutel, lijst) {
  alleenBeheerder();
  var def = uitMap(KEUZELIJSTEN, sleutel); if (!def) throw new Error('Onbekende lijst.');  // v7.2: geen geërfde sleutels
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
    if (Object.keys(hernoem).length) {
      if (def.json) wijzigJsonLijstKolom(def.tab, def.kolom, function (v) { return hernoem[klein(v)]; });  // v5.0: JSON-lijst (functies, sectoren, vakken)
      else if (def.sleutels) wijzigKolom(def.tab, def.kolom, function (v) {  // v5.0: JSON-object met de waarden als sleutel (criteria)
        var o = veldenUit(v), anders = false, uit = {};
        Object.keys(o).forEach(function (k) { var n = hernoem[klein(k)]; if (n !== undefined && n !== k) anders = true; uit[n !== undefined ? n : k] = o[k]; });
        return anders ? uit : undefined;
      });
      else wijzigKolom(def.tab, def.kolom, function (v) { return hernoem[klein(v)]; });
    }
  });
  return apiInstellingen();
}
// v5.0: een kolom met een JSON-lijst waarde voor waarde hernoemen; fn(waarde) geeft de nieuwe waarde of undefined
function wijzigJsonLijstKolom(tab, kolom, fn) {
  return wijzigKolom(tab, kolom, function (v) {
    var l = lijstUit(v); if (!l.length) return undefined;
    var anders = false, uit = l.map(function (x) { var n = fn(x); if (n !== undefined && n !== x) { anders = true; return n; } return x; });
    return anders ? uniek(uit) : undefined;
  });
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
  var plekken = { Scholen: ['eigenaar', 'am'], Personen: ['eigenaar'], Kansen: ['eigenaar'], Acties: ['eigenaar'], Trajecten: ['am', 'adviseur'], Activiteiten: ['door'], Activiteiten_archief: ['door'], Reviews: ['eigenaar'], Content: ['door'],
    Vacatures: ['door'], Kandidaten: ['door'], Talenten: ['door'], Beoordelingen: ['door'], TalentSchool: ['door'], TalentDocumenten: ['door', 'gecontroleerdDoor'] };  // v5.0: ook het talentnetwerk
  Object.keys(plekken).forEach(function (tab) { plekken[tab].forEach(function (k) { wijzigKolom(tab, k, function (v) { return String(v) === oud ? nieuw : undefined; }); }); });
  var doelen = lees('Doelen').filter(function (d) { return d.eigenaar === oud; });
  if (doelen.length) {
    verwijderRijen('Doelen', function (d) { return d.eigenaar === oud; });
    schrijfVeel('Doelen', doelen.map(function (d) { return { id: slug(nieuw + '-' + d.periode + '-' + d.metric), eigenaar: nieuw, periode: d.periode, metric: d.metric, doel: d.doel }; }));
  }
}

/* ----- Tijdlijn: activiteit wijzigen, afspraak verplaatsen ----- */

var ACTIVITEIT_VELDEN = ['id', 'type', 'datum', 'onderwerp', 'tekst', 'duurMin', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'vorm'];  // v7.1: vorm
function apiActiviteitOpslaan(obj) {
  obj = obj || {};
  if (!obj.id) return apiActiviteitToevoegen(obj);
  var o = schoon(obj, ACTIVITEIT_VELDEN), oud = vind('Activiteiten', o.id);
  if (!oud) throw new Error('Activiteit niet gevonden (misschien al gearchiveerd).');
  if (!isBeheerder() && oud.door && oud.door !== ikNaam()) throw new Error('Alleen wie het vastlegde of de beheerder kan dit wijzigen.');
  if (o.type !== undefined && ACTIVITEIT_TYPES.concat(['fase', 'taak']).indexOf(o.type) < 0) throw new Error('Onbekend soort activiteit.');
  if (o.vorm !== undefined) {  // v7.1: de vorm bepaalt het type; een mijlpaal of taakregel heeft geen vorm
    if (!TYPE_VAN_VORM.hasOwnProperty(o.vorm)) throw new Error('Onbekend soort activiteit.');
    if (oud.type === 'fase' || oud.type === 'taak') throw new Error('Een mijlpaal of afgeronde taak krijgt geen ander soort.');
    o.type = TYPE_VAN_VORM[o.vorm];
  } else if (o.type !== undefined && VORM_VAN_TYPE[o.type]) o.vorm = VORM_VAN_TYPE[o.type];
  if (o.datum !== undefined) { o.datum = datumTijdIn(o.datum); if (!o.datum) throw new Error('Ongeldige datum.'); }
  if (o.duurMin !== undefined) o.duurMin = Number(o.duurMin) || '';
  ['onderwerp', 'tekst'].forEach(function (k) { if (o[k] !== undefined) o[k] = String(o[k]).trim(); });
  [['schoolId', 'Scholen'], ['persoonId', 'Personen'], ['kansId', 'Kansen'], ['trajectId', 'Trajecten']].forEach(function (x) { if (o[x[0]] && !vind(x[1], o[x[0]])) throw new Error('Koppeling niet gevonden.'); });
  var na = function (k) { return o[k] !== undefined ? o[k] : oud[k]; };
  if (!na('schoolId') && !na('persoonId') && !na('kansId') && !na('trajectId')) throw new Error('Koppel de activiteit aan een school, persoon of kans.');
  if (o.kansId !== undefined || o.trajectId !== undefined) eisKoppeling({ kansId: na('kansId'), trajectId: na('trajectId') });  // v4.0
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
  if (!taakVanMijOfTeam(a)) throw new Error('Daar heb je geen toegang toe.');  // v4.5
  var x = metLock(function () { return schrijf('Acties', { id: id, status: 'open', afgerond: '', herhaling: '' }); });  // v4.5: de reeks loopt al door in de volgende instantie
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
  if (!HUISSTIJL_STANDAARD.hasOwnProperty(sleutel)) throw new Error('Onbekend huisstijlveld: ' + (sleutel == null || sleutel === '' ? '(leeg)' : String(sleutel)));  // v7.2: geen 'undefined' in de melding
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
    ['Scholen', 'Personen', 'Kansen', 'Acties', 'Talenten'].forEach(function (tab) {  // v4.6: ook taken; v5.0: talenten
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
    ['Scholen', 'Personen', 'Kansen', 'Talenten'].forEach(function (tab) {  // v5.0: ook talenten
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
  ['Scholen', 'Personen', 'Kansen', 'Acties', 'Talenten'].forEach(function (tab) {  // v4.6: ook taken; v5.0: talenten
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

/* ===================== 10. Rechten per team en rol (v4.0) ===================== */

// [zien, wijzigen] voor een medewerker van het team. Een teamlead krijgt 'team' waar 'eigen' staat (het werk van zijn hele team);
// management mag alles. 'eigen' = de gebruiker is eigenaar (kans: eigenaar; project: adviseur voor consultants, am voor accountmanagers).
// 'opstart' = alleen projecten in de opstartfase (talent: daar wordt bezetting gezocht). Zie docs/teams-en-processen.md.
var RECHTEN = {
  relaties:   { consultancy: ['alles', 'alles'], accountmanagement: ['alles', 'alles'], talent: ['alles', 'geen'] },
  pipeline:   { consultancy: ['eigen', 'eigen'], accountmanagement: ['geen', 'geen'], talent: ['geen', 'geen'] },
  projecten:  { consultancy: ['eigen', 'geen'], accountmanagement: ['eigen', 'eigen'], talent: ['opstart', 'geen'] },
  facturatie: { consultancy: ['eigen', 'geen'], accountmanagement: ['eigen', 'eigen'], talent: ['geen', 'geen'] },
  // v4.1: de AM vult vacatures in voor zijn project; talent werkt alle vacatures en kandidaten; de consultant leest mee (zonder kandidaten)
  vacatures:  { consultancy: ['eigen', 'geen'], accountmanagement: ['eigen', 'eigen'], talent: ['alles', 'alles'] },
  kandidaten: { consultancy: ['geen', 'geen'], accountmanagement: ['eigen', 'eigen'], talent: ['alles', 'alles'] },
  // v5.0: het talentnetwerk. 'eigen' = het talent is kandidaat in een project dat ik mag zien (de AM ziet dan een beperkt profiel en beoordeelt per plaatsing)
  talenten:      { consultancy: ['geen', 'geen'], accountmanagement: ['eigen', 'geen'], talent: ['alles', 'alles'] },
  beoordelingen: { consultancy: ['geen', 'geen'], accountmanagement: ['eigen', 'eigen'], talent: ['alles', 'alles'] },
  // v6.5: Financiën leest alleen (bewerken blijft in Facturatie): de AM zijn projecten, de consultant de projecten waar hij adviseur is, talent niets
  financien:     { consultancy: ['eigen', 'geen'], accountmanagement: ['eigen', 'geen'], talent: ['geen', 'geen'] }
};
function niveau(onderdeel, actie) {
  if (isBeheerder()) return 'alles';
  var r = (RECHTEN[onderdeel] || {})[GEBRUIKER.team]; if (!r) return 'geen';  // het externe portaalprofiel (v5.0) staat in geen enkele rij: altijd 'geen'
  var n = r[actie === 'wijzigen' ? 1 : 0];
  return n === 'eigen' && isTeamlead() ? 'team' : n;
}
function eigenaarVan(onderdeel, rij) {
  if (onderdeel === 'pipeline') return rij.eigenaar;
  return GEBRUIKER && GEBRUIKER.team === 'consultancy' ? rij.adviseur : rij.am;
}
// Namen van de actieve gebruikers in een team (management: ook de eigenaar van het script)
var _TEAMNAMEN = null;
function teamNamen(team) {
  if (!_TEAMNAMEN) {
    _TEAMNAMEN = { management: [P.getProperty('NAAM') || 'Menno'] };
    lees('Gebruikers').filter(actief).forEach(function (g) { var t = profielVan(g).team; (_TEAMNAMEN[t] = _TEAMNAMEN[t] || []).push(g.naam); });
  }
  return _TEAMNAMEN[team] || [];
}
// Mag ik dit onderdeel zien/wijzigen? Zonder rij: mag ik het in principe (bijv. iets nieuws maken of het menu tonen)?
function mag(onderdeel, actie, rij) {
  var n = niveau(onderdeel, actie);
  if (n === 'alles') return true;
  if (n === 'geen') return false;
  if (!rij) return true;
  if (onderdeel === 'talenten' || onderdeel === 'beoordelingen') return !!talentenViaProject()[String(rij.talentId || rij.id)];  // v5.0: via een kandidaat in een project dat ik mag zien (teamlead: zijn team)
  if (n === 'opstart') return rij.status === 'opstart' || !!openVacatures()[rij.id] || (!!rij.talentscout && rij.talentscout === ikNaam());  // v4.1: ook projecten met een open vacature; v6.4: en waar ik de talentscout ben
  var e = String(eigenaarVan(onderdeel, rij) || '');
  if (e && e === ikNaam()) return true;
  return n === 'team' && !!e && teamNamen(GEBRUIKER.team).indexOf(e) >= 0;
}
function eis(onderdeel, actie, rij) { if (!mag(onderdeel, actie, rij)) throw new Error('Daar heb je geen toegang toe.'); }
// Een activiteit of taak mag alleen hangen aan een kans of project dat ik mag zien
function eisKoppeling(o) {
  if (isBeheerder()) return;
  if (o.trajectId) { var t = vind('Trajecten', o.trajectId); if (t) eis('projecten', 'zien', t); }
  else if (o.kansId) { var k = vind('Kansen', o.kansId); if (k && !kansZichtbaar(k, kansenViaProject())) throw new Error('Daar heb je geen toegang toe.'); }
  if (o.talentId) { var tl = vind('Talenten', o.talentId); if (!tl) throw new Error('Talent niet gevonden.'); eis('talenten', 'zien', tl); }  // v5.0
}
// v5.0: welke talenten mag ik zien via mijn projecten (als accountmanager, of als teamlead die van mijn team)? Het talentteam en het management zien alles.
var _VIAPROJECT = null;
function talentenViaProject() {
  if (!_VIAPROJECT) {
    _VIAPROJECT = {};
    if (!isBeheerder()) { var tMap = perId(lees('Trajecten')); lees('Kandidaten').forEach(function (k) { var t = k.talentId && tMap[k.trajectId]; if (t && mag('projecten', 'zien', t)) _VIAPROJECT[String(k.talentId)] = true; }); }
  }
  return _VIAPROJECT;
}
// Kan ik deze kans zien? Ook als accountmanager wanneer hij bij een project van mij hoort (alleen de historie van die kans).
function kansZichtbaar(k, viaProject) { return !k || mag('pipeline', 'zien', k) || !!(viaProject && viaProject[k.id]); }
function kansenViaProject() {
  var m = {};
  if (!isBeheerder()) lees('Trajecten').forEach(function (t) { if (t.kansId && mag('projecten', 'zien', t)) m[t.kansId] = true; });
  return m;
}
// Filter voor activiteiten en taken: wat aan een onzichtbare kans of een onzichtbaar project hangt, valt weg. Eigen werk blijft altijd zichtbaar.
function zichtbaarFilter() {
  if (isBeheerder()) return function () { return true; };
  var kMap = perId(lees('Kansen')), tMap = perId(lees('Trajecten')), via = kansenViaProject(), ik = ikNaam();
  return function (a) {
    if (a.door === ik || a.eigenaar === ik) return true;
    var k = a.kansId ? kMap[a.kansId] : null, t = a.trajectId ? tMap[a.trajectId] : null;
    if (t) return mag('projecten', 'zien', t);
    return kansZichtbaar(k, via);
  };
}
// Taken in lijsten (Taken, Agenda): eigen taken; een teamlead ook die van zijn team; management alles.
function taakVanMijOfTeam(a) {
  if (isBeheerder()) return true;
  if (vanMij(a.eigenaar)) return true;
  return isTeamlead() && !!a.eigenaar && teamNamen(GEBRUIKER.team).indexOf(String(a.eigenaar)) >= 0;
}
// Wie mag ik kiezen in rapporten, activiteit en doelen: management iedereen, een teamlead zijn team, een medewerker alleen zichzelf.
function zichtbareMensen() {
  if (isBeheerder()) return gebruikersNamen();
  if (isTeamlead()) return teamNamen(GEBRUIKER.team);
  return [ikNaam()];
}
// Samenvatting voor de app: welke menu's en knoppen iemand ziet
function rechtenUit() {
  var r = {};
  Object.keys(RECHTEN).forEach(function (o) { r[o] = { zien: niveau(o, 'zien'), wijzigen: niveau(o, 'wijzigen') }; });
  r.beheer = isBeheerder(); r.teamlead = isTeamlead(); r.doelen = isBeheerder() || isTeamlead();
  return r;
}

// Eenmalig bij de overstap naar v4.0 (draait vanzelf bij de eerste apiCrm): oude rollen en projectstatussen omzetten.
function migreerV4() {
  if (P.getProperty('MIGRATIE_V4') === '1') return;
  metLock(function () {
    if (P.getProperty('MIGRATIE_V4') === '1') return;
    var gebr = lees('Gebruikers').filter(function (g) { return !g.team; }).map(function (g) { var pr = profielVan(g); return { id: g.id, team: pr.team, rol: pr.rol }; });
    if (gebr.length) schrijfVeel('Gebruikers', gebr);
    if (!instelling('trajectStatussen')) {
      var map = { actief: 'bezig', afgerond: 'afgelopen', offerte: 'opstart' };
      wijzigKolom('Trajecten', 'status', function (v) { return map[String(v)]; });
    }
    // adviseur van projecten uit gewonnen kansen invullen (projecten van voor v3.8 hebben er geen)
    var kMap = perId(lees('Kansen')), adv = lees('Trajecten').filter(function (t) { return !t.adviseur && t.kansId && kMap[t.kansId]; }).map(function (t) { return { id: t.id, adviseur: kMap[t.kansId].eigenaar }; });
    if (adv.length) schrijfVeel('Trajecten', adv);
    _TEAMNAMEN = null;
    P.setProperty('MIGRATIE_V4', '1');
  });
}

/* ===================== 11. Taskforce, vacatures en bezetting (v4.1) ===================== */

// Proces na een gewonnen kans (docs/teams-en-processen.md): taskforcemeeting → de AM vult vacatures in → talent draagt kandidaten voor →
// matchinggesprek (AM) → academy, contract en VOG (talent) → klaar voor start. Is elke plek gevuld, dan gaat het project van opstart naar bezig.
// Vaste statussen: de logica (meldingen, telling, herinneringen) hangt eraan. De bron van een kandidaat is een keuzelijst.
// v5.0: geplaatst (de inzet loopt, gelijk aan 'Geplaatst' in XPS), afgerond en gestopt (de inzet is voorbij; eindReden verplicht)
var KANDIDAAT_STATUSSEN = ['voorgesteld', 'gesprek', 'geselecteerd', 'academy', 'contract', 'vog', 'klaar voor start', 'geplaatst', 'afgerond', 'gestopt', 'reserve', 'afgewezen'];  // reserve: zoals in XPS (Plaatsingen)
var KANDIDAAT_KLAAR = 'klaar voor start';
var KANDIDAAT_GEVULD = ['klaar voor start', 'geplaatst'];  // v5.0: telt als gevulde plek
var KANDIDAAT_VOORBIJ = ['afgerond', 'gestopt'];
var VACATURE_STATUSSEN = ['concept', 'open', 'ingevuld', 'gesloten'];  // v6.4: concept = uit het winformulier, nog niet bevestigd na de taskforce (wel matchen, nog niet voordragen)
var TASKFORCE_VRAGEN = [['hulpvraag', 'Hulpvraag van de school'], ['inzet', 'Inzet (aantal ondersteuners, rol)'], ['rooster', 'Rooster (dagen en tijden)'],
  ['startdatum', 'Gewenste startdatum'], ['bijzonderheden', 'Bijzonderheden'], ['contactpersonen', 'Contactpersonen op school']];
var VACATURE_VELDEN = ['id', 'trajectId', 'titel', 'aantal', 'dagen', 'urenPerWeek', 'start', 'eind', 'profiel', 'status'];
var KANDIDAAT_VELDEN = ['id', 'vacatureId', 'naam', 'email', 'telefoon', 'bron', 'xpsId', 'afasNummer', 'status', 'gesprek', 'notitie',
  'talentId', 'start', 'eind', 'functie', 'urenPerWeek', 'dagen', 'xpsPlaatsingId', 'eindReden'];  // v5.0

function kandidaatInProces(k) { return ['afgewezen', 'reserve'].concat(KANDIDAAT_GEVULD, KANDIDAAT_VOORBIJ).indexOf(k.status) < 0; }
function kandidaatGevuld(k) { return KANDIDAAT_GEVULD.indexOf(k.status) >= 0; }  // v5.0
function vacatureUit(v, kands, metKandidaten) {
  var eigen = kands.filter(function (k) { return String(k.vacatureId) === String(v.id); });
  var u = { id: v.id, trajectId: v.trajectId, titel: v.titel || '', aantal: Number(v.aantal) || 1, dagen: v.dagen || '', urenPerWeek: v.urenPerWeek || '', start: v.start || '', eind: v.eind || '',
    profiel: v.profiel || '', status: v.status || 'open', door: v.door || '', aangemaakt: v.aangemaakt || '',
    gevuld: eigen.filter(kandidaatGevuld).length, inProces: eigen.filter(kandidaatInProces).length };
  if (metKandidaten) u.kandidaten = eigen.map(kandidaatUit).sort(function (a, b) { return KANDIDAAT_STATUSSEN.indexOf(a.status) - KANDIDAAT_STATUSSEN.indexOf(b.status) || String(a.naam).localeCompare(String(b.naam)); });
  return u;
}
function kandidaatUit(k) {
  var u = { id: k.id, vacatureId: k.vacatureId, trajectId: k.trajectId, naam: k.naam || '', email: k.email || '', telefoon: k.telefoon || '', bron: k.bron || '', xpsId: k.xpsId || '', afasNummer: k.afasNummer || '',
    status: k.status || 'voorgesteld', statusSinds: k.statusSinds || '', dagenInStatus: k.statusSinds ? dagenSinds(k.statusSinds) : null, gesprek: k.gesprek || '', notitie: k.notitie || '', door: k.door || '',
    talentId: k.talentId || '', start: k.start || '', eind: k.eind || '', functie: k.functie || '', urenPerWeek: k.urenPerWeek || '', dagen: k.dagen || '', xpsPlaatsingId: k.xpsPlaatsingId || '', eindReden: k.eindReden || '', vog: '' };  // v5.0
  if (k.talentId) { var x = talentIndex().per[String(k.talentId)]; if (x) u.vog = vogStatus(x.talent, x.docs).status; }  // v5.0: VOG-badge op de kandidaatregel
  return u;
}
// Bezetting van een project: plekken uit de vacatures die niet gesloten zijn; gevuld = kandidaten die klaar voor start zijn.
function bezettingVan(trajectId, vacs, kands) {
  var nodig = 0, gevuld = 0, inProces = 0, open = 0;
  vacs.filter(function (v) { return String(v.trajectId) === String(trajectId) && v.status !== 'gesloten'; }).forEach(function (v) {
    var u = vacatureUit(v, kands, false); nodig += u.aantal; gevuld += Math.min(u.gevuld, u.aantal); inProces += u.inProces; if (u.status === 'open') open++;
  });
  return { nodig: nodig, gevuld: gevuld, inProces: inProces, openVacatures: open };
}
// Projecten met een open vacature (talent ziet die, naast de projecten in opstart)
var _OPENVAC = null;
function openVacatures() {
  if (!_OPENVAC) { _OPENVAC = {}; lees('Vacatures').forEach(function (v) { if ((v.status || 'open') === 'open') _OPENVAC[v.trajectId] = true; }); }
  return _OPENVAC;
}

// Meldingen in de app (de bel): één rij per ontvanger, zodat ieder zijn eigen gelezen-stand heeft. Nooit een melding aan jezelf.
function meld(namen, tekst, link) {
  var ik = ikNaam(), rijen = uniek([].concat(namen || [])).filter(function (n) { return n && n !== ik; })
    .map(function (n) { return { voor: n, tekst: String(tekst).slice(0, 300), link: link || '', datum: nu(), gelezen: '', door: ik }; });
  if (rijen.length) schrijfVeel('Meldingen', rijen);
}
function ongelezenMeldingen() { var ik = ikNaam(); return lees('Meldingen').filter(function (m) { return m.voor === ik && !m.gelezen; }).length; }
function apiMeldingen() {
  var ik = ikNaam();
  return lees('Meldingen').filter(function (m) { return m.voor === ik; }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }).slice(0, 50)
    .map(function (m) { return { id: m.id, tekst: m.tekst, link: m.link, datum: m.datum, gelezen: !!m.gelezen, door: m.door }; });
}
function apiMeldingenGelezen() {
  var ik = ikNaam(), ids = lees('Meldingen').filter(function (m) { return m.voor === ik && !m.gelezen; }).map(function (m) { return { id: m.id, gelezen: nu() }; });
  if (ids.length) metLock(function () { schrijfVeel('Meldingen', ids); });
  return { aantal: ids.length };
}

function taskforceUit(t) { try { var x = JSON.parse(t.taskforce || '{}'); return x && typeof x === 'object' ? x : {}; } catch (e) { return {}; } }
// Bezetting en taskforce van één project, voor de projectpagina (tabs Taskforce en Bezetting)
function projectBezetting(t) {
  var vacs = lees('Vacatures').filter(function (v) { return String(v.trajectId) === String(t.id); }), kands = lees('Kandidaten');
  var zienK = mag('kandidaten', 'zien', t);
  return {
    trajectId: t.id, projectStatus: t.status,  // de app werkt hiermee de projectpagina en het bezettingsbord lokaal bij
    vacatures: mag('vacatures', 'zien', t) ? vacs.map(function (v) { var u = vacatureUit(v, kands, zienK); u.magBevestigen = magBevestigen(t); return u; }) : null,  // v6.4.2
    bezetting: bezettingVan(t.id, vacs, kands),
    taskforce: taskforceUit(t), taskforceVragen: TASKFORCE_VRAGEN.map(function (v) { return { naam: v[0], label: v[1] }; }),
    afspraken: lees('Acties').filter(function (a) { return String(a.trajectId) === String(t.id) && a.bron === 'taskforce'; }).sort(sorteerActies)
      .map(function (a) { return { id: a.id, tekst: a.tekst, eigenaar: a.eigenaar, deadline: a.deadline, status: a.status }; }),
    keuzesBezetting: { kandidaatStatussen: KANDIDAAT_STATUSSEN, vacatureStatussen: VACATURE_STATUSSEN, bronnen: keuzelijst('kandidaatBronnen') },
    rechtenBezetting: { vacatures: mag('vacatures', 'wijzigen', t), kandidatenZien: zienK, kandidaten: mag('kandidaten', 'wijzigen', t), taskforce: magTaskforce(t),
      talentscout: magTalentscout(t, ''), talentscoutZelf: magTalentscout(t, ikNaam()) },  // v6.4
    talentscout: t.talentscout || '', talentscouts: teamNamen('talent'), taskforceGepland: taskforceGepland(t)  // v6.4
  };
}

/* ----- v6.4: samenwerking consultancy, accountmanagement en talent ----- */
var CONCEPT_FOUT = 'Deze vacature is nog een concept: voordragen kan zodra de accountmanager hem na de taskforce bevestigt. Matchen met "Voorstellen" kan al.';
// Het winformulier van de consultant bij "gewonnen": aantal en startdatum verplicht, de rest optioneel. Afwezig = geen formulier (Brein, import, oudere app).
function overdrachtIn(x) {
  if (!x || typeof x !== 'object') return null;
  var od = { rol: String(x.rol || '').trim().slice(0, 120) || 'Onderwijsondersteuner', aantal: Math.round(Number(x.aantal) || 0), rooster: String(x.rooster || '').trim().slice(0, 300),
    startdatum: datumIn(x.startdatum), bijzonderheden: String(x.bijzonderheden || '').trim().slice(0, 2000) };
  if (od.aantal < 1 || od.aantal > 99) throw new Error('Vul het aantal ondersteuners in (1 tot 99).');
  if (!od.startdatum) throw new Error('Vul de gewenste startdatum in.');
  return od;
}
// De talentscout krijgt de meldingen van zijn project; zonder talentscout het hele talentteam
// v6.4.2: een conceptvacature bevestigen doet wie het project mag wijzigen (de AM, management), niet het talentteam
function magBevestigen(t) { return mag('projecten', 'wijzigen', t); }
function talentOntvangers(t) { return t && t.talentscout ? [t.talentscout] : teamNamen('talent'); }
// Wie verdeelt het werk in het talentteam: de eerste actieve teamlead, anders de eigenaar van het script
function talentTeamlead() {
  var g = lees('Gebruikers').filter(function (x) { return actief(x) && profielVan(x).team === 'talent' && profielVan(x).rol === 'teamlead'; })[0];
  return g ? g.naam : (P.getProperty('NAAM') || 'Menno');
}
// Toewijzen: management, wie het project mag wijzigen (de AM) en de teamlead van talent kiezen iedereen uit het talentteam; een talentscout pakt een project zonder scout zelf op.
function magTalentscout(t, naam) {
  if (isBeheerder() || mag('projecten', 'wijzigen', t)) return true;
  if (!GEBRUIKER || GEBRUIKER.team !== 'talent') return false;
  if (!mag('projecten', 'zien', t)) return false;  // v6.4.2: alleen projecten die talent al ziet (opstart of open vacature); anders geeft scout worden inzage in elk project
  if (isTeamlead()) return true;
  return naam === ikNaam() && !t.talentscout;
}
// Een regel in de tijdlijn van het project, zodat elk team ziet waar het staat (altijd binnen metLock)
function overdrachtRegel(t, onderwerp, tekst) {
  schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: t.schoolId || '', kansId: t.kansId || '', trajectId: t.id, bron: 'overdracht', aangemaakt: nu(), onderwerp: onderwerp, tekst: tekst || '' });
}
// Open taken van dit project met deze bron afvinken (bijv. "Talentscout toewijzen" zodra er een is); altijd binnen metLock
function rondTakenAf(t, bron) {
  var open = lees('Acties').filter(function (a) { return String(a.trajectId) === String(t.id) && a.bron === bron && a.status !== 'af'; });
  if (open.length) schrijfVeel('Acties', open.map(function (a) { return { id: a.id, status: 'af', afgerond: nu() }; }));
}
// Altijd binnen metLock: zet de talentscout en laat het weten
function talentscoutZetten(t, naam) {
  var oud = t.talentscout || '';
  t = schrijf('Trajecten', { id: t.id, talentscout: naam });
  if (naam) {
    overdrachtRegel(t, 'Talentscout: ' + naam, oud ? 'Was ' + oud + '.' : 'Toegewezen door ' + ikNaam() + '.');
    meld(naam, 'Je bent talentscout van ' + t.school + ' (' + t.traject + '). Je krijgt de meldingen van dit project.', 'project:' + t.id);
    rondTakenAf(t, 'talentscout');
  } else overdrachtRegel(t, 'Geen talentscout meer', oud ? oud + ' is geen talentscout meer van dit project.' : '');
  if (oud && oud !== naam) meld(oud, (naam ? naam + ' is nu' : 'Er is geen') + ' talentscout van ' + t.school + ' (' + t.traject + ').', 'project:' + t.id);
  return t;
}
function apiTalentscoutToewijzen(trajectId, naam) {
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Project niet gevonden.');
  naam = String(naam || '').trim();
  if (naam && teamNamen('talent').indexOf(naam) < 0) throw new Error('Kies een talentscout uit het talentteam.');
  if (!magTalentscout(t, naam)) throw new Error('Daar heb je geen toegang toe.');
  metLock(function () {  // v6.4.2: opnieuw lezen en controleren binnen de lock (twee scouts die tegelijk "Ik pak dit op" kiezen)
    var nu_ = vind('Trajecten', trajectId);
    if (naam === (nu_.talentscout || '')) return;
    if (!magTalentscout(nu_, naam)) throw new Error(nu_.talentscout ? nu_.talentscout + ' is intussen talentscout van dit project.' : 'Daar heb je geen toegang toe.');
    talentscoutZetten(nu_, naam);
  });
  return projectBezetting(vind('Trajecten', trajectId));
}
// E-mailadres van een collega (voor de agenda-uitnodiging)
function emailVanNaam(naam) {
  if (!naam) return '';
  var g = lees('Gebruikers').filter(function (x) { return x.naam === naam && actief(x); })[0];
  if (g && g.email) return String(g.email).trim();
  return naam === (P.getProperty('NAAM') || 'Menno') ? Session.getEffectiveUser().getEmail() : '';
}
function taskforceGepland(t) { return taskforceUit(t).gepland || ''; }
// De taskforcemeeting in de agenda, met de consultant, de AM en de talentscout als genodigden en de link naar het project
function apiTaskforcePlannen(trajectId, obj) {
  obj = obj || {};
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Project niet gevonden.');
  if (!magTaskforce(t)) throw new Error('Daar heb je geen toegang toe.');
  if (!/\d{2}:\d{2}/.test(String(obj.start || ''))) throw new Error('Kies een datum en tijd.');
  var start = parseDatum(String(obj.start).replace('T', ' ')); if (!start) throw new Error('Ongeldige datum.');
  var duur = Math.min(240, Math.max(15, Number(obj.duurMin) || 45)), eind = new Date(start.getTime() + duur * 60000);
  var namen = uniek([t.adviseur, t.am, t.talentscout, ikNaam()].filter(Boolean)), zonder = [];
  var gasten = uniek(namen.map(function (n) { var e = emailVanNaam(n); if (!e) zonder.push(n); return klein(e); }).filter(Boolean));
  var url = P.getProperty('APP_URL'), titel = 'Taskforce ' + t.school + ' · ' + t.traject;
  var omschrijving = ['Taskforcemeeting: overdracht van consultancy naar accountmanagement en talent.', 'Deelnemers: ' + namen.join(', ') + '.', url ? 'Project: ' + url + '#project:' + t.id : '',
    'Leg na afloop de afspraken vast in de tab Taskforce; de accountmanager bevestigt daarna de vacature in de tab Bezetting.'].filter(Boolean).join('\n');
  var ev = CalendarApp.getDefaultCalendar().createEvent(titel, start, eind, { description: omschrijving, location: String(obj.locatie || '').slice(0, 200), guests: gasten.join(','), sendInvites: gasten.length > 0 });
  var wanneer = datumTijdStr(start);
  metLock(function () {
    var tf = taskforceUit(vind('Trajecten', t.id)); tf.datum = datumStr(start); tf.deelnemers = tf.deelnemers || namen.join(', '); tf.gepland = wanneer;
    schrijf('Trajecten', { id: t.id, taskforce: tf });
    schrijf('Activiteiten', { type: 'afspraak', datum: wanneer, duurMin: duur, door: ikNaam(), schoolId: t.schoolId || '', kansId: t.kansId || '', trajectId: t.id,
      onderwerp: titel, tekst: omschrijving, agendaId: agendaSleutel(ev), bron: 'app', aangemaakt: nu() });
    meld(namen, 'Taskforcemeeting ' + t.school + ' (' + t.traject + ') op ' + String(wanneer).slice(0, 16) + '. De uitnodiging staat in je agenda.', 'project:' + t.id);
    rondTakenAf(t, 'taskforceplannen');
  });
  var uit = projectBezetting(vind('Trajecten', t.id)); uit.zonderEmail = zonder;
  return uit;
}

// De taskforce (consultant, AM en talentscout) legt de overdracht samen vast: wie het project mag zien, mag hem invullen; talent alleen bij opstart en open vacatures.
function magTaskforce(t) { return mag('projecten', 'zien', t); }

function apiTaskforceOpslaan(trajectId, obj) {
  obj = obj || {};
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Project niet gevonden.');
  if (!magTaskforce(t)) throw new Error('Daar heb je geen toegang toe.');
  var oud = taskforceUit(t), tf = { datum: String(obj.datum || oud.datum || '').slice(0, 10), deelnemers: String(obj.deelnemers !== undefined ? obj.deelnemers : (oud.deelnemers || '')).trim(), door: ikNaam(), bijgewerkt: nu() };
  TASKFORCE_VRAGEN.forEach(function (v) { tf[v[0]] = String(obj[v[0]] !== undefined ? obj[v[0]] : (oud[v[0]] || '')).trim(); });
  ['gepland', 'bron'].forEach(function (k) { if (oud[k]) tf[k] = oud[k]; });  // v6.4.2: het tijdstip van de ingeplande meeting en de herkomst (winformulier) blijven bewaard
  var afspraken = (obj.afspraken instanceof Array ? obj.afspraken : []).map(function (a) { return { tekst: String(a.tekst || '').trim(), eigenaar: String(a.eigenaar || '').trim(), deadline: datumIn(a.deadline) }; })
    .filter(function (a) { return a.tekst; });
  metLock(function () {
    var wijz = { id: t.id, taskforce: tf };
    if (!t.start && /^\d{4}-\d{2}-\d{2}$/.test(tf.startdatum)) wijz.start = tf.startdatum;  // gewenste startdatum wordt de start van het project als die nog leeg is
    schrijf('Trajecten', wijz);
    var regels = TASKFORCE_VRAGEN.filter(function (v) { return tf[v[0]]; }).map(function (v) { return v[1] + ': ' + tf[v[0]]; });
    if (tf.deelnemers) regels.unshift('Deelnemers: ' + tf.deelnemers);
    afspraken.forEach(function (a) { regels.push('Afspraak: ' + a.tekst + (a.eigenaar ? ' (' + a.eigenaar + ')' : '') + (a.deadline ? ', uiterlijk ' + a.deadline : '')); });
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), schoolId: t.schoolId || '', kansId: t.kansId || '', trajectId: t.id, bron: 'app', aangemaakt: nu(),
      onderwerp: (oud.bijgewerkt ? 'Taskforce bijgewerkt' : 'Taskforce') + (tf.datum ? ' (' + tf.datum + ')' : ''), tekst: regels.join('\n') });
    // afspraken en deadlines worden taken bij de juiste persoon
    if (afspraken.length) schrijfVeel('Acties', afspraken.map(function (a) {
      return { tekst: a.tekst, eigenaar: a.eigenaar || ikNaam(), deadline: a.deadline || '', prio: 'midden', categorie: 'overig', status: 'open', bron: 'taskforce', aangemaakt: nu(), schoolId: t.schoolId || '', kansId: t.kansId || '', trajectId: t.id };
    }));
    afspraken.forEach(function (a) { if (a.eigenaar) meld(a.eigenaar, 'Taskforce ' + t.school + ': ' + a.tekst + (a.deadline ? ' (uiterlijk ' + a.deadline + ')' : ''), 'project:' + t.id); });
  });
  return projectBezetting(vind('Trajecten', trajectId));
}

function apiVacatureOpslaan(obj) {
  obj = obj || {};
  var o = schoon(obj, VACATURE_VELDEN), oud = o.id ? vind('Vacatures', o.id) : null;
  if (o.id && !oud) throw new Error('Vacature niet gevonden.');
  var tid = (oud && oud.trajectId) || o.trajectId, t = tid ? vind('Trajecten', tid) : null; if (!t) throw new Error('Project niet gevonden.');
  eis('vacatures', 'wijzigen', t);
  if (oud) delete o.trajectId;
  if (o.titel !== undefined) o.titel = String(o.titel).trim();
  if (!oud && !o.titel) o.titel = 'Onderwijsondersteuner';
  if (o.aantal !== undefined) { o.aantal = Math.max(1, Math.round(Number(o.aantal) || 1)); }
  if (o.status !== undefined && VACATURE_STATUSSEN.indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.status === 'concept' && (!oud || oud.status !== 'concept')) throw new Error('Een vacature wordt alleen concept vanuit het winformulier; zet hem op gesloten als hij niet doorgaat.');  // v6.4
  var bevestigd = !!oud && oud.status === 'concept' && o.status !== undefined && o.status !== 'concept';  // v6.4: de AM bevestigt de conceptvacature na de taskforce
  if (bevestigd && !magBevestigen(t)) throw new Error('De accountmanager bevestigt de vacature na de taskforce.');  // v6.4.2: talent mag vacatures wijzigen, maar niet zijn eigen poort openen
  if (bevestigd && o.status === 'open') o.aangemaakt = nu();  // v6.4.2: time-to-fill telt vanaf bevestigen, niet vanaf de winst
  ['start', 'eind'].forEach(function (k) { if (o[k] !== undefined) o[k] = datumIn(o[k]); });
  if (!oud) { o.status = 'open'; o.aangemaakt = nu(); o.door = ikNaam(); o.aantal = o.aantal || 1; }
  if (oud && o.status === 'ingevuld' && oud.status !== 'ingevuld' && !oud.ingevuld) o.ingevuld = nu();  // v4.2: met de hand op ingevuld gezet
  if (oud && o.status === 'open' && oud.status !== 'open') o.ingevuld = '';
  metLock(function () {
    controleerConflict('Vacatures', o.id, o, obj._oud);
    var v = schrijf('Vacatures', o); _OPENVAC = null;
    if (!oud) {
      schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: t.schoolId || '', trajectId: t.id, bron: 'app', aangemaakt: nu(),
        onderwerp: 'Vacature geopend: ' + v.titel + ' (' + v.aantal + '×' + (v.start ? ', start ' + v.start : '') + ')' });
      meld(talentOntvangers(t), 'Nieuwe vacature: ' + v.titel + ' (' + v.aantal + '×) bij ' + t.school + (v.dagen ? ', ' + v.dagen : '') + (v.start ? ', start ' + v.start : ''), 'project:' + t.id);  // v6.4: de talentscout, anders het hele team
    }
    if (bevestigd && v.status === 'open') {
      overdrachtRegel(t, 'Vacature bevestigd: ' + v.titel + ' (' + v.aantal + '×' + (v.start ? ', start ' + v.start : '') + ')', 'Na de taskforce door ' + ikNaam() + '. Talent kan nu voordragen.');
      meld(talentOntvangers(t), 'Vacature bevestigd: ' + v.titel + ' (' + v.aantal + '×) bij ' + t.school + '. Je kunt nu voordragen.', 'project:' + t.id);
    }
  });
  return projectBezetting(vind('Trajecten', t.id));
}

function apiKandidaatOpslaan(obj) {
  obj = obj || {};
  var o = schoon(obj, KANDIDAAT_VELDEN), oud = o.id ? vind('Kandidaten', o.id) : null;
  if (o.id && !oud) throw new Error('Kandidaat niet gevonden.');
  var v = vind('Vacatures', o.vacatureId || (oud && oud.vacatureId)); if (!v) throw new Error('Vacature niet gevonden.');
  var t = vind('Trajecten', v.trajectId); if (!t) throw new Error('Project niet gevonden.');
  eis('kandidaten', 'wijzigen', t);
  if (v.status === 'concept' && (!oud || String(oud.vacatureId) !== String(v.id))) throw new Error(CONCEPT_FOUT);  // v6.4
  if (oud && o.vacatureId && String(o.vacatureId) !== String(oud.vacatureId)) { var vOud = vind('Vacatures', oud.vacatureId); if (vOud && String(vOud.trajectId) !== String(v.trajectId)) eis('kandidaten', 'wijzigen', vind('Trajecten', vOud.trajectId) || {}); }
  ['naam', 'telefoon', 'xpsId', 'afasNummer', 'notitie', 'functie', 'dagen', 'xpsPlaatsingId', 'eindReden'].forEach(function (k) { if (o[k] !== undefined) o[k] = String(o[k]).trim(); });
  if (o.email !== undefined) o.email = klein(o.email);
  // v5.0: een kandidaat uit het talentbestand: contactgegevens komen van het profiel (alleen wie het profiel mag zien)
  var talent = null;
  if (o.talentId) {
    talent = vind('Talenten', o.talentId); if (!talent) throw new Error('Talent niet gevonden.');
    eis('talenten', 'zien', talent);
    if (!o.naam && (!oud || !oud.naam)) o.naam = talentNaam(talent);
    ['email', 'telefoon', 'xpsId', 'afasNummer'].forEach(function (k) { if (o[k] === undefined && (!oud || !oud[k]) && talent[k]) o[k] = talent[k]; });
    if (!o.bron && (!oud || !oud.bron)) o.bron = 'talentbestand';
  } else if (!oud && o.email) { var bekend = lees('Talenten').filter(function (x) { return x.email && klein(x.email) === o.email; })[0]; if (bekend) { talent = bekend; o.talentId = bekend.id; } }  // zelfde e-mailadres = hetzelfde profiel
  if (!oud && !o.naam) throw new Error('Vul de naam van de kandidaat in.');
  if (o.status !== undefined && KANDIDAAT_STATUSSEN.indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.gesprek !== undefined) o.gesprek = datumTijdIn(o.gesprek) || '';
  ['start', 'eind'].forEach(function (k) { if (o[k] !== undefined) o[k] = datumIn(o[k]); });
  if (o.urenPerWeek !== undefined) o.urenPerWeek = o.urenPerWeek === '' ? '' : (Number(String(o.urenPerWeek).replace(',', '.')) || '');
  o.trajectId = t.id;
  var nieuwStatus = o.status !== undefined && (!oud || o.status !== oud.status) ? o.status : null;
  if (!oud) { o.status = o.status || 'voorgesteld'; o.aangemaakt = nu(); o.door = ikNaam(); nieuwStatus = o.status; if (!o.functie) o.functie = v.titel || ''; ['start', 'eind', 'dagen', 'urenPerWeek'].forEach(function (k) { if (o[k] === undefined || o[k] === '') o[k] = v[k] || ''; }); }
  if (nieuwStatus && KANDIDAAT_VOORBIJ.indexOf(nieuwStatus) >= 0 && !(o.eindReden || (oud && oud.eindReden))) throw new Error('Geef de reden waarom de inzet is ' + nieuwStatus + '.');  // v5.0
  if (nieuwStatus) { o.statusSinds = nu(); var hist = oud ? kandidaatHistorie(oud) : {}; if (!hist[nieuwStatus]) hist[nieuwStatus] = o.statusSinds; o.statusHistorie = hist; }  // v4.2: voor doorlooptijd en time-to-fill
  metLock(function () {
    controleerConflict('Kandidaten', o.id, o, obj._oud);
    kandidaatSchrijven(o, oud, v, t, nieuwStatus, false);
  });
  return projectBezetting(vind('Trajecten', t.id));
}
// v5.0: de kern van het opslaan van een kandidaat (altijd binnen metLock): rij, tijdlijn, meldingen, taken en de bezetting. stil = geen melding per kandidaat (apiVoorstellen bundelt)
function kandidaatSchrijven(o, oud, v, t, nieuwStatus, stil) {
  var k = schrijf('Kandidaten', o), naam = k.naam, waar = v.titel + ' bij ' + t.school, link = 'project:' + t.id;
  if (!oud) {
    schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: t.schoolId || '', trajectId: t.id, talentId: k.talentId || '', bron: 'app', aangemaakt: nu(), onderwerp: 'Kandidaat voorgedragen: ' + naam + ' (' + v.titel + ')' });
    if (!stil) meld(t.am, 'Nieuwe kandidaat voor ' + waar + ': ' + naam + '. Plan het matchinggesprek.', link);
    if (t.am) schrijf('Acties', { tekst: 'Matchinggesprek met ' + naam + ' (' + t.school + ', ' + v.titel + ')', eigenaar: t.am, deadline: datumStr(plusDagen(3)), prio: 'hoog', categorie: 'afspraak',
      status: 'open', bron: 'bezetting', aangemaakt: nu(), schoolId: t.schoolId || '', kansId: t.kansId || '', trajectId: t.id, link: k.talentId ? 'talent:' + k.talentId : '' });
  } else if (nieuwStatus) {
    schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: t.schoolId || '', trajectId: t.id, talentId: k.talentId || '', bron: 'app', aangemaakt: nu(), onderwerp: 'Kandidaat ' + naam + ': ' + oud.status + ' → ' + nieuwStatus });
    if (nieuwStatus === 'geselecteerd') meld([k.door].concat(teamNamen('talent').indexOf(k.door) >= 0 ? [] : talentOntvangers(t)), naam + ' is geselecteerd voor ' + waar + '. Start academy, contract en VOG.', link);
    if (nieuwStatus === KANDIDAAT_KLAAR) meld(t.am, naam + ' is klaar voor start bij ' + t.school + '.', link);
    if (nieuwStatus === 'afgewezen') meld(k.door, naam + ' is afgewezen voor ' + waar + '.', link);
  }
  // v5.0: de inzet loopt: het talent heeft contact, de accountmanager beoordeelt na zes weken en daarna elk kwartaal (herhalende taak, zie v4.5)
  if (nieuwStatus === 'geplaatst' && k.talentId) {
    zetTalentContact(k.talentId, nu());
    if (t.am) { var startD = parseDatum(k.start) || new Date(), eerste = middag(startD); eerste.setDate(eerste.getDate() + 42); if (eerste < new Date()) eerste = plusDagen(7);  // v7.2: kalenderdagen vanaf 12:00 (42 × 24 uur over de wissel naar wintertijd gaf een dag te vroeg)
      schrijf('Acties', { tekst: 'Beoordeel ' + naam + ' bij ' + t.school, eigenaar: t.am, deadline: datumStr(eerste), prio: 'midden', categorie: 'opvolgen', status: 'open', bron: 'bezetting', aangemaakt: nu(),
        schoolId: t.schoolId || '', trajectId: t.id, link: 'talent:' + k.talentId, herhaling: k.eind ? { eenheid: 'maand', interval: 3, tot: k.eind } : { eenheid: 'maand', interval: 3 } }); }
  }
  werkBezettingBij(t, v);
  return k;
}
// Na elke wijziging aan kandidaten: vacature vol → ingevuld; alle plekken gevuld → project van opstart naar bezig (altijd binnen metLock).
function werkBezettingBij(t, v) {
  var kands = lees('Kandidaten'), vu = vacatureUit(v, kands, false);
  if (vu.status === 'open' && vu.gevuld >= vu.aantal) { schrijf('Vacatures', { id: v.id, status: 'ingevuld', ingevuld: nu() }); _OPENVAC = null; }
  var b = bezettingVan(t.id, lees('Vacatures'), kands);
  if (t.status === 'opstart' && b.nodig > 0 && b.gevuld >= b.nodig) {
    schrijf('Trajecten', { id: t.id, status: 'bezig' });
    schrijf('Activiteiten', { type: 'taak', datum: nu(), door: ikNaam(), schoolId: t.schoolId || '', trajectId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: 'Bezetting rond (' + b.gevuld + ' van ' + b.nodig + '): project staat op bezig' });
    meld([t.adviseur, t.am], 'Bezetting rond voor ' + t.school + ' (' + t.traject + '): ' + b.gevuld + ' van ' + b.nodig + '. Het project staat op bezig.', 'project:' + t.id);
  }
}

// Het bezettingsbord: alle vacatures die ik mag zien, met project en (als ik ze mag zien) kandidaten.
function apiBezetting() {
  eis('vacatures', 'zien');
  var tMap = perId(lees('Trajecten')), kands = lees('Kandidaten'), tel = { openVacatures: 0, openPlekken: 0, inProces: 0, klaar: 0, concept: 0 };  // v6.4: concept
  var lijst = lees('Vacatures').filter(function (v) { var t = tMap[v.trajectId]; return t && mag('vacatures', 'zien', t); }).map(function (v) {
    var t = tMap[v.trajectId], u = vacatureUit(v, kands, mag('kandidaten', 'zien', t));
    u.project = { id: t.id, school: t.school, traject: t.traject, schooljaar: t.schooljaar, status: t.status, am: t.am || '', adviseur: t.adviseur || '', start: t.start || '', talentscout: t.talentscout || '' };  // v6.4: talentscout
    u.magWijzigen = mag('vacatures', 'wijzigen', t); u.magKandidaten = mag('kandidaten', 'wijzigen', t); u.magBevestigen = magBevestigen(t);  // v6.4.2
    if (u.status === 'open') { tel.openVacatures++; tel.openPlekken += Math.max(0, u.aantal - u.gevuld); }
    if (u.status === 'concept') tel.concept++;
    if (u.status !== 'gesloten') { tel.inProces += u.inProces; tel.klaar += u.gevuld; }
    return u;
  }).sort(function (a, b) { var r = { open: 0, concept: 1 }; return (r[a.status] === undefined ? 2 : r[a.status]) - (r[b.status] === undefined ? 2 : r[b.status]) || String(a.start || a.project.start || '9999').localeCompare(String(b.start || b.project.start || '9999')); });
  return { vacatures: lijst, tellingen: tel, keuzes: { kandidaatStatussen: KANDIDAAT_STATUSSEN, vacatureStatussen: VACATURE_STATUSSEN, bronnen: keuzelijst('kandidaatBronnen') }, ik: ikUit() };
}

// Herinneringen voor de dagstart: kandidaten die te lang op één status staan (talent: eigen voordrachten; AM: gesprekken van eigen projecten)
function kandidatenBlijvenLiggen(eigenAlles) {
  var tMap = perId(lees('Trajecten')), ik = ikNaam(), uit = [];
  lees('Kandidaten').filter(kandidaatInProces).forEach(function (k) {
    var t = tMap[k.trajectId] || {}, dagen = k.statusSinds ? dagenSinds(k.statusSinds) : null;
    if (dagen === null || dagen <= 7) return;
    var vanMijTalent = k.door === ik && ['academy', 'contract', 'vog', 'geselecteerd'].indexOf(k.status) >= 0;
    var vanMijAm = t.am === ik && ['voorgesteld', 'gesprek'].indexOf(k.status) >= 0;
    if (eigenAlles || vanMijTalent || vanMijAm) uit.push({ tekst: 'Kandidaat ' + k.naam + ' (' + (t.school || '') + ') staat al ' + dagen + ' dagen op "' + k.status + '"', bron: 'traject', dagen: dagen });
  });
  // v5.0: het talentteam ziet VOG's die aflopen bij een lopende inzet en voordrachten waarvan de beschikbaarheid al lang niet bevestigd is
  if (eigenAlles || (GEBRUIKER && GEBRUIKER.team === 'talent')) {
    var idx = talentIndex(), gezien = {};
    lees('Kandidaten').forEach(function (k) {
      if (!k.talentId || gezien[k.talentId]) return;
      var x = idx.per[String(k.talentId)]; if (!x) return;
      var t = tMap[k.trajectId] || {};
      if (kandidaatGevuld(k)) { var vs = vogStatus(x.talent, x.docs); if (vs.status === 'oranje' || vs.status === 'verlopen' || vs.status === 'ontbreekt') { gezien[k.talentId] = true; uit.push({ tekst: 'VOG van ' + talentNaam(x.talent) + ' (' + (t.school || '') + '): ' + vs.status + (vs.afgifte ? ', afgifte ' + vs.afgifte : ''), bron: 'traject' }); } }
      else if (kandidaatInProces(k)) {
        var vs2 = vogStatus(x.talent, x.docs);
        if (vs2.status === 'verlopen' || vs2.status === 'ontbreekt') { gezien[k.talentId] = true; uit.push({ tekst: 'VOG van ' + talentNaam(x.talent) + ' (' + (t.school || '') + '): ' + vs2.status + ', nodig vóór de start', bron: 'traject' }); return; }
        var bev = x.talent.beschikbaarheidBevestigd ? dagenSinds(x.talent.beschikbaarheidBevestigd) : null; if (bev === null || bev > 56) { gezien[k.talentId] = true; uit.push({ tekst: 'Beschikbaarheid van ' + talentNaam(x.talent) + ' (' + (t.school || '') + ') is ' + (bev === null ? 'nog nooit' : bev + ' dagen niet') + ' bevestigd', bron: 'traject', dagen: bev || undefined }); }
      }
    });
  }
  return uit;
}

/* ===================== 12. Rapporten en doelen per team (v4.2) ===================== */

// Maatstaven per team (docs/teams-en-processen.md §5). soort: aantal | euro | procent | dagen. stand = telt de huidige stand, niet de periode.
// laagIsGoed: een doel is gehaald als de waarde er onder blijft (dagen). Bedrijfscijfers gaan altijd over het huidige schooljaar.
var METRIEKEN = {
  gesprekken:            { team: 'consultancy', label: 'Gesprekken', kort: 'Gespr.', soort: 'aantal' },
  afspraken:             { team: 'consultancy', label: 'Afspraken', kort: 'Afspr.', soort: 'aantal' },
  mails:                 { team: 'consultancy', label: 'Mails', kort: 'Mails', soort: 'aantal' },
  nieuweKansen:          { team: 'consultancy', label: 'Nieuwe kansen', kort: 'Kansen', soort: 'aantal' },
  nieuweScholen:         { team: 'consultancy', label: 'Nieuwe scholen', kort: 'Scholen', soort: 'aantal' },
  voorstellen:           { team: 'consultancy', label: 'Voorstellen', kort: 'Voorst.', soort: 'aantal' },
  gewonnen:              { team: 'consultancy', label: 'Gewonnen', kort: 'Won', soort: 'aantal' },
  gewonnenWaarde:        { team: 'consultancy', label: 'Gewonnen waarde', kort: 'Won €', soort: 'euro' },
  conversie:             { team: 'consultancy', label: 'Conversie (gewonnen van gesloten)', kort: 'Conv.', soort: 'procent' },
  lopendeProjecten:      { team: 'accountmanagement', label: 'Lopende projecten', kort: 'Lopend', soort: 'aantal', stand: true },
  bezetting:             { team: 'accountmanagement', label: 'Bezetting (gevuld van nodig)', kort: 'Bezet', soort: 'procent', stand: true },
  dagenTotBezetting:     { team: 'accountmanagement', label: 'Dagen tot bezetting', kort: 'Dagen', soort: 'dagen', laagIsGoed: true },
  evaluaties:            { team: 'accountmanagement', label: 'Gesprekken en afspraken in projecten', kort: 'Gespr.', soort: 'aantal' },
  verlengd:              { team: 'accountmanagement', label: 'Verlengd (dit schooljaar)', kort: 'Verl.', soort: 'aantal', stand: true },
  facturatieOpTijd:      { team: 'accountmanagement', label: 'Facturatie op tijd', kort: 'Fact.', soort: 'procent' },
  voordrachten:          { team: 'talent', label: 'Voordrachten', kort: 'Voordr.', soort: 'aantal' },
  geplaatst:             { team: 'talent', label: 'Klaar voor start', kort: 'Klaar', soort: 'aantal' },
  matchRatio:            { team: 'talent', label: 'Match → plaatsing', kort: 'Match', soort: 'procent' },
  timeToFill:            { team: 'talent', label: 'Time-to-fill', kort: 'TTF', soort: 'dagen', laagIsGoed: true },
  doorlooptijd:          { team: 'talent', label: 'Doorlooptijd geselecteerd → klaar', kort: 'Doorl.', soort: 'dagen', laagIsGoed: true },
  poolActief:            { team: 'talent', label: 'Actieve talenten in het bestand', kort: 'Pool', soort: 'aantal', stand: true },  // v5.0: talentnetwerk
  vogCompliance:         { team: 'talent', label: 'VOG in orde (van actief)', kort: 'VOG', soort: 'procent', stand: true },
  plaatsingen:           { team: 'talent', label: 'Plaatsingen gestart', kort: 'Plaats.', soort: 'aantal' },
  beoordelingGem:        { team: 'talent', label: 'Beoordeling (1 niet geschikt – 3 favoriet)', kort: 'Beoord.', soort: 'gemiddelde' },
  omzet:                 { team: 'bedrijf', label: 'Omzet schooljaar', kort: 'Omzet', soort: 'euro' },
  scholen:               { team: 'bedrijf', label: 'Scholen met een project', kort: 'Scholen', soort: 'aantal' },
  ondersteuners:         { team: 'bedrijf', label: 'Ondersteuners ingezet', kort: 'Ond.', soort: 'aantal' },
  verlengingspercentage: { team: 'bedrijf', label: 'Verlengingspercentage', kort: 'Verl.', soort: 'procent' }
};
var RAPPORT_TEAMS = ['consultancy', 'accountmanagement', 'talent'];
function metriekDefs(team) {
  return Object.keys(METRIEKEN).filter(function (m) { return !team || METRIEKEN[m].team === team; }).map(function (m) {
    var d = METRIEKEN[m]; return { id: m, team: d.team, label: d.label, kort: d.kort, soort: d.soort, laagIsGoed: !!d.laagIsGoed, stand: !!d.stand };
  });
}
// Elke maatstaf telt als teller/noemer, zodat een teamtotaal van percentages en gemiddelden klopt.
function telWaarde(m, x) {
  var s = METRIEKEN[m].soort;
  if (!x) return s === 'procent' || s === 'dagen' || s === 'gemiddelde' ? null : 0;
  if (s === 'procent') return x.n ? Math.round(100 * x.t / x.n) : null;
  if (s === 'dagen') return x.n ? Math.round(x.t / x.n) : null;
  if (s === 'gemiddelde') return x.n ? Math.round(10 * x.t / x.n) / 10 : null;  // v5.0: één decimaal (beoordeling 1–3)
  return Math.round(x.t * 100) / 100;
}
function dagenTussen(a, b) { var x = parseDatum(a), y = parseDatum(b); return x && y ? Math.max(0, Math.round((y - x) / 86400000)) : null; }
function kandidaatHistorie(k) { var h = {}; try { h = JSON.parse(k.statusHistorie || '{}') || {}; } catch (e) { h = {}; } if (k.status && !h[k.status] && k.statusSinds) h[k.status] = k.statusSinds; return h; }
function schooljaarStart(sj) { return new Date(Number(String(sj).slice(0, 4)), 7, 1); }

// v4.4: één keer lezen per rapport; een rapport telt tot zo'n dertig periodes
function rapportData() { return { acts: lees('Activiteiten'), kansen: lees('Kansen'), scholen: lees('Scholen'), ts: lees('Trajecten'), vacs: lees('Vacatures'), kands: lees('Kandidaten'), facturen: lees('Facturen'), nu: nu() }; }
// Cijfers van één team in een periode: per persoon en het teamtotaal ({ per: {naam: {maatstaf: {t, n}}}, totaal: {...} }).
function teamCijfers(team, van, tot, D) {
  D = D || rapportData();
  var per = {}, totaal = {}, inP = function (s) { var d = String(s || '').slice(0, 10); return !!d && d >= van && d <= tot; };
  var tel = function (naam, m, t, n) {
    if (!naam) return;
    var p = per[naam] || (per[naam] = {}), x = p[m] || (p[m] = { t: 0, n: 0 }), y = totaal[m] || (totaal[m] = { t: 0, n: 0 });
    x.t += t; x.n += (n || 0); y.t += t; y.n += (n || 0);
  };
  var sj = huidigSchooljaar(), vandaag = datumStr(new Date());
  if (team === 'consultancy') {
    D.acts.forEach(function (a) {
      if (!a.door || !inP(a.datum) || String(a.datum) > D.nu) return;
      if (a.type === 'gesprek') tel(a.door, 'gesprekken', 1); else if (a.type === 'mail') tel(a.door, 'mails', 1); else if (a.type === 'afspraak') tel(a.door, 'afspraken', 1);
      else if (a.type === 'fase' && /→ voorstel$/.test(String(a.onderwerp))) tel(a.door, 'voorstellen', 1);
    });
    D.kansen.forEach(function (k) {
      if (inP(k.aangemaakt)) tel(k.eigenaar, 'nieuweKansen', 1);
      if ((k.fase === 'gewonnen' || k.fase === 'verloren') && inP(k.gesloten)) {
        tel(k.eigenaar, 'conversie', k.fase === 'gewonnen' ? 1 : 0, 1);
        if (k.fase === 'gewonnen') { tel(k.eigenaar, 'gewonnen', 1); tel(k.eigenaar, 'gewonnenWaarde', Number(k.waarde) || 0); }
      }
    });
    D.scholen.forEach(function (s) { if (inP(s.aangemaakt)) tel(s.eigenaar, 'nieuweScholen', 1); });
  } else if (team === 'accountmanagement') {
    var ts = D.ts, tMap = perId(ts), vacs = D.vacs, kands = D.kands;
    ts.forEach(function (t) {
      if (!t.am) return;
      if (projectLopend(t)) { tel(t.am, 'lopendeProjecten', 1); var b = bezettingVan(t.id, vacs, kands); if (b.nodig) tel(t.am, 'bezetting', b.gevuld, b.nodig); }
      if (t.schooljaar === sj && t.verlenging === 'verlengd') tel(t.am, 'verlengd', 1);
    });
    vacs.forEach(function (v) { var t = tMap[v.trajectId]; if (t && t.am && v.ingevuld && inP(v.ingevuld)) { var d = dagenTussen(v.aangemaakt, v.ingevuld); if (d !== null) tel(t.am, 'dagenTotBezetting', d, 1); } });
    D.acts.forEach(function (a) { var t = a.trajectId ? tMap[a.trajectId] : null; if (t && t.am && a.door === t.am && (a.type === 'gesprek' || a.type === 'afspraak') && inP(a.datum) && String(a.datum) <= D.nu) tel(t.am, 'evaluaties', 1); });
    D.facturen.forEach(function (f) {
      var t = tMap[f.trajectId]; if (!t || !t.am || !f.datum || !inP(f.datum) || String(f.datum).slice(0, 10) > vandaag) return;  // alleen termijnen die al verstuurd hadden moeten zijn
      tel(t.am, 'facturatieOpTijd', ['verzonden', 'betaald'].indexOf(f.status) >= 0 ? 1 : 0, 1);
    });
  } else if (team === 'talent') {
    var kandidaten = D.kands, vMap = perId(D.vacs);
    kandidaten.forEach(function (k) {
      var h = kandidaatHistorie(k), klaar = h[KANDIDAAT_KLAAR], af = h.afgewezen;
      if (inP(k.aangemaakt)) tel(k.door, 'voordrachten', 1);
      if (klaar && inP(klaar)) { tel(k.door, 'geplaatst', 1); if (h.geselecteerd) { var d = dagenTussen(h.geselecteerd, klaar); if (d !== null) tel(k.door, 'doorlooptijd', d, 1); } }
      if ((klaar && inP(klaar)) || (af && inP(af))) tel(k.door, 'matchRatio', klaar && inP(klaar) ? 1 : 0, 1);
    });
    Object.keys(vMap).forEach(function (id) {
      var v = vMap[id]; if (!v.ingevuld || !inP(v.ingevuld)) return;
      var d = dagenTussen(v.aangemaakt, v.ingevuld); if (d === null) return;
      uniek(kandidaten.filter(function (k) { return String(k.vacatureId) === String(id) && kandidaatGevuld(k); }).map(function (k) { return k.door; })).forEach(function (n) { tel(n, 'timeToFill', d, 1); });
    });
    // v5.0: het talentnetwerk. De pool en de VOG-stand tellen bij wie het profiel aanmaakte; plaatsingen bij wie de kandidaat voordroeg; beoordelingen bij wie voordroeg
    var idx = talentIndex(), standaardDoor = teamNamen('talent')[0] || P.getProperty('NAAM') || 'Menno';
    Object.keys(idx.per).forEach(function (id) {
      var x = idx.per[id], door = x.talent.door || standaardDoor;
      if (x.talent.status !== 'actief') return;
      tel(door, 'poolActief', 1);
      tel(door, 'vogCompliance', vogStatus(x.talent, x.docs).status === 'groen' ? 1 : 0, 1);
    });
    kandidaten.forEach(function (k) { var h = kandidaatHistorie(k); if (h.geplaatst && inP(h.geplaatst)) tel(k.door, 'plaatsingen', 1); });
    var kMap = perId(kandidaten);
    lees('Beoordelingen').forEach(function (b) {
      if (!inP(b.datum)) return;
      var kand = b.kandidaatId ? kMap[String(b.kandidaatId)] : null, door = (kand && kand.door) || (idx.per[String(b.talentId)] && idx.per[String(b.talentId)].talent.door) || standaardDoor;
      tel(door, 'beoordelingGem', OORDEEL_PUNTEN[b.oordeel] || 0, OORDEEL_PUNTEN[b.oordeel] ? 1 : 0);
    });
  }
  return { per: per, totaal: totaal };
}
function waardenVan(team, tellers) { var u = {}; metriekDefs(team).forEach(function (d) { u[d.id] = telWaarde(d.id, tellers && tellers[d.id]); }); return u; }
// Doelen van een periode: { eigenaar: { maatstaf: doel } } (eigenaar = naam, 'team:<team>' of 'bedrijf')
function doelenVan(periode) { var u = {}; lees('Doelen').filter(function (d) { return d.periode === periode && Number(d.doel); }).forEach(function (d) { (u[d.eigenaar] = u[d.eigenaar] || {})[d.metric] = Number(d.doel); }); return u; }

// De bedrijfscijfers van het huidige schooljaar; iedereen ziet ze (geen bedragen per persoon).
function bedrijfCijfers() {
  var sj = huidigSchooljaar(), vacs = lees('Vacatures'), kands = lees('Kandidaten'), x = { omzet: { t: 0, n: 0 }, scholen: { t: 0, n: 0 }, ondersteuners: { t: 0, n: 0 }, verlengingspercentage: { t: 0, n: 0 } }, scholen = {};
  lees('Trajecten').filter(function (t) { return t.schooljaar === sj && ['gestopt', 'offerte', 'onduidelijk'].indexOf(t.status) < 0; }).forEach(function (t) {
    x.omzet.t += Number(t.omzet) || 0; scholen[t.schoolId || klein(t.school)] = true;
    x.ondersteuners.t += Math.max(Number(t.ondersteuners) || 0, bezettingVan(t.id, vacs, kands).gevuld);
    if (t.verlenging === 'verlengd' || t.verlenging === 'stopt') { x.verlengingspercentage.n++; if (t.verlenging === 'verlengd') x.verlengingspercentage.t++; }
  });
  x.scholen.t = Object.keys(scholen).length;
  return { schooljaar: sj, metrieken: metriekDefs('bedrijf'), cijfers: waardenVan('bedrijf', x), doelen: doelenVan('schooljaar').bedrijf || {} };
}

// Rapport van één team: management kiest een team, een teamlead ziet zijn team per persoon, een medewerker zichzelf plus het teamtotaal.
// v4.4: elke periode met stap (‹ ›), een vergelijking met de periode ervoor, een reeks van de laatste periodes en voor het management 'alle' teams.
var RAPPORT_REEKS = { week: 8, maand: 6, kwartaal: 4, halfjaar: 4, jaar: 3, schooljaar: 3 };
function apiTeamRapport(preset, team, eigenaar, stap) {
  preset = DOEL_PERIODES.indexOf(preset) >= 0 ? preset : 'maand';
  var echt = isBeheerder() ? RAPPORT_TEAMS.slice() : RAPPORT_TEAMS.filter(function (t) { return GEBRUIKER && GEBRUIKER.team === t; });
  var teams = isBeheerder() ? ['alle'].concat(echt) : echt;
  if (teams.indexOf(team) < 0) team = echt[0] || '';
  var B = periodeBereik(preset, stap), V = vergelijkBereik(preset, B), doelen = doelenVan(preset), D = rapportData(), reeks = [];
  for (var i = (RAPPORT_REEKS[preset] || 6) - 1; i > 0; i--) reeks.push(periodeBereik(preset, B.stap - i));
  reeks.push(B);
  var uit = { preset: preset, stap: B.stap, van: B.van, tot: B.tot, eind: B.eind, lopend: B.lopend, label: B.label,
    vergelijk: { van: V.van, tot: V.tot, label: V.label, kort: V.kort }, reeksLabels: reeks.map(function (r) { return r.kort; }),
    team: team, teams: teams, metrieken: metriekDefs(team === 'alle' ? 'geen' : team), perPersoon: [], totaal: { cijfers: {}, doelen: {}, vorige: {}, reeks: {} },
    bedrijf: bedrijfCijfers(), ik: ikUit(), eigenaar: '', kiesbaar: [] };
  if (!team) return uit;
  // Cijfers, vorige periode en reeks van één team; bundel(naam) geeft ze voor één persoon, bundel('') voor het teamtotaal
  var meet = function (t) {
    var nuC = teamCijfers(t, B.van, B.tot, D), vorC = teamCijfers(t, V.van, V.tot, D), defs = metriekDefs(t), leden = teamNamen(t);
    var rs = reeks.map(function (r) { return r === B ? nuC : teamCijfers(t, r.van, r.tot, D); });
    // het teamtotaal is de som van de teamleden (een mail of gesprek van iemand uit een ander team telt hier niet mee)
    var vanTeam = function (c) { var u = {}; leden.forEach(function (n) { var x = c.per[n] || {}; Object.keys(x).forEach(function (m) { var y = u[m] || (u[m] = { t: 0, n: 0 }); y.t += x[m].t; y.n += x[m].n; }); }); return u; };
    return function (naam) {
      var w = function (c) { return waardenVan(t, naam ? c.per[naam] : vanTeam(c)); };
      var cijfers = w(nuC), vorige = w(vorC), rw = rs.map(w), r = {};
      defs.forEach(function (d) { if (d.stand) vorige[d.id] = null; else r[d.id] = rw.map(function (x) { return x[d.id]; }); });  // een stand (bezetting nu) heeft geen verloop
      return { cijfers: cijfers, vorige: vorige, reeks: r };
    };
  };
  if (team === 'alle') {
    uit.alle = echt.map(function (t) { var b = meet(t)(''); b.doelen = doelen['team:' + t] || {}; return { team: t, metrieken: metriekDefs(t), totaal: b, leden: teamNamen(t).length }; });
    return uit;
  }
  var leden = teamNamen(team), zicht = zichtbareMensen(), mensen = isBeheerder() ? leden : leden.filter(function (n) { return zicht.indexOf(n) >= 0; });
  uit.kiesbaar = isBeheerder() || isTeamlead() ? mensen.slice() : [];  // wie management of een teamlead kan kiezen
  if (eigenaar && mensen.indexOf(eigenaar) >= 0) { uit.eigenaar = eigenaar; mensen = [eigenaar]; }
  var bundel = meet(team);
  uit.perPersoon = mensen.map(function (n) { var b = bundel(n); b.naam = n; b.doelen = doelen[n] || {}; return b; });
  uit.totaal = bundel(''); uit.totaal.doelen = doelen['team:' + team] || {};
  return uit;
}

/* ===================== 9. Projecten en facturatie (v3.8) ===================== */

// Een gewonnen kans wordt een project voor de accountmanager, met alles wat de adviseur wist (altijd binnen metLock).
// Bestaat er al een project bij deze kans (bijv. na heropenen en opnieuw winnen), dan blijft het bij dat project.
// v6.4: overdracht = het winformulier ({rol, aantal, rooster, startdatum, bijzonderheden}): vult de taskforce voor en maakt een conceptvacature voor het talentteam.
function projectUitKans(k, school, overdracht) {
  var bestaand = lees('Trajecten').filter(function (t) { return String(t.kansId) === String(k.id); })[0];
  if (bestaand) return bestaand;
  var s = school || vind('Scholen', k.schoolId) || {}, p = k.persoonId ? vind('Personen', k.persoonId) : null;
  var am = k.am || '', adviseur = k.eigenaar || ikNaam(), od = overdracht || null, naamK = (k.naam || k.traject) + ' (' + (k.school || s.naam || '') + ')';
  var nieuwT = { schoolId: k.schoolId, school: k.school || s.naam || '', plaats: s.plaats || '', traject: k.traject || k.naam, schooljaar: huidigSchooljaar(), status: 'opstart',
    omzet: Number(k.waarde) || 0, am: am, adviseur: adviseur, kansId: k.id, contactpersoon: p ? persoonNaam(p) + (p.email ? ' <' + p.email + '>' : '') : '', samenvatting: String(k.notities || '').trim() };
  if (od) {
    nieuwT.taskforce = { inzet: od.aantal + ' × ' + od.rol, rooster: od.rooster, startdatum: od.startdatum, bijzonderheden: od.bijzonderheden, door: adviseur, bron: 'winformulier' };
    if (od.startdatum) nieuwT.start = od.startdatum;
    nieuwT.ondersteuners = od.aantal;
  }
  var t = schrijf('Trajecten', nieuwT);
  var regels = ['Kans gewonnen door ' + adviseur + ': ' + (k.naam || k.traject) + '.'];
  if (od) regels.push('Gevraagde inzet: ' + od.aantal + ' × ' + od.rol + (od.rooster ? ', ' + od.rooster : '') + (od.startdatum ? ', start ' + od.startdatum : '') + '.' + (od.bijzonderheden ? '\nBijzonderheden: ' + od.bijzonderheden : ''));
  if (Number(k.waarde)) regels.push('Waarde: € ' + Math.round(Number(k.waarde)) + '.');
  if (p) regels.push('Contactpersoon: ' + persoonNaam(p) + [p.functie, p.email, p.telefoon].filter(Boolean).map(function (x) { return ', ' + x; }).join('') + '.');
  if (k.volgendeActie) regels.push('Afgesproken vervolg: ' + k.volgendeActie + (k.deadline ? ' (' + k.deadline + ')' : '') + '.');
  if (k.notities) regels.push('\nOmschrijving van de adviseur:\n' + k.notities);
  regels.push('\nDe volledige historie van de kans staat hieronder in de tijdlijn.');
  schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: adviseur, schoolId: k.schoolId, persoonId: k.persoonId || '', kansId: k.id, trajectId: t.id, bron: 'app', aangemaakt: nu(),
    onderwerp: 'Overdracht naar ' + (am || 'de accountmanager'), tekst: regels.join('\n') });
  var voor = am || (P.getProperty('NAAM') || 'Menno'), basis = { status: 'open', bron: 'project', aangemaakt: nu(), eigenaar: voor, schoolId: k.schoolId, persoonId: k.persoonId || '', kansId: k.id, trajectId: t.id };
  var taken = am ? [] : [{ tekst: 'Accountmanager toewijzen aan ' + (k.naam || k.traject) + ' (' + (k.school || s.naam || '') + ')', categorie: 'opvolgen', prio: 'hoog', deadline: datumStr(plusDagen(1)) }];
  taken.push({ tekst: 'Taskforcemeeting plannen met AM en talent: ' + naamK, categorie: 'afspraak', prio: 'hoog', deadline: datumStr(plusDagen(2)), eigenaar: adviseur, bron: 'taskforceplannen' });  // v4.1: de consultant; v6.4: vinkt zichzelf af zodra de meeting via de tab Taskforce in de agenda staat
  meld(am, 'Nieuw project voor jou: ' + naamK + '. ' + adviseur + ' plant de taskforcemeeting.', 'project:' + t.id);
  // v6.4: het talentteam weet het meteen: melding, een conceptvacature op het bord Bezetting en een taak om een talentscout toe te wijzen
  if (od) {
    var v = schrijf('Vacatures', { trajectId: t.id, titel: od.rol, aantal: od.aantal, dagen: od.rooster, start: od.startdatum, profiel: od.bijzonderheden, status: 'concept', aangemaakt: nu(), door: adviseur });
    overdrachtRegel(t, 'Conceptvacature voor het talentteam: ' + v.titel + ' (' + v.aantal + '×' + (v.start ? ', start ' + v.start : '') + ')', 'Uit het winformulier. De accountmanager bevestigt hem na de taskforcemeeting; tot dan kan talent al zoeken, maar nog niet voordragen.');
  }
  meld(teamNamen('talent'), 'Nieuw project: ' + naamK + (od ? ', ' + od.aantal + ' × ' + od.rol + (od.startdatum ? ', start ' + od.startdatum : '') + '. De conceptvacature staat op het bord Bezetting.' : '. De vacature volgt na de taskforce.'), 'project:' + t.id);
  schrijf('Acties', { tekst: 'Talentscout toewijzen: ' + naamK, eigenaar: talentTeamlead(), deadline: datumStr(plusDagen(1)), prio: 'hoog', categorie: 'opvolgen', status: 'open', bron: 'talentscout', aangemaakt: nu(),
    schoolId: k.schoolId, persoonId: k.persoonId || '', kansId: k.id, trajectId: t.id });
  taken = taken.concat([
    { tekst: 'Startgesprek plannen met ' + (p ? persoonNaam(p) : (k.school || s.naam || 'de school')), categorie: 'afspraak', prio: 'hoog', deadline: datumStr(plusDagen(3)) },
    { tekst: 'Facturatie instellen voor ' + (k.naam || k.traject), categorie: 'overig', prio: 'midden', deadline: datumStr(plusDagen(5)) }]);
  schrijfVeel('Acties', taken.map(function (x) { var o = {}; Object.keys(basis).forEach(function (b) { o[b] = basis[b]; }); Object.keys(x).forEach(function (b) { o[b] = x[b]; }); return o; }));
  return t;
}

// Alles van één project: info, school, kans, tijdlijn (ook de historie van de kans), taken, facturen, en mails van de school die nog niet aan een project hangen.
function apiProject(id) {
  var t = vind('Trajecten', id); if (!t) throw new Error('Project niet gevonden.');
  eis('projecten', 'zien', t);  // v4.0
  var s = t.schoolId ? vind('Scholen', t.schoolId) : lees('Scholen').filter(function (x) { return klein(x.naam) === klein(t.school); })[0] || null;
  var k = t.kansId ? vind('Kansen', t.kansId) : null, sMap = {}, kMap = {};
  if (s) sMap[s.id] = s; if (k) kMap[k.id] = k;
  var personen = s ? lees('Personen').filter(function (p) { return String(p.schoolId) === String(s.id); }) : [], pMap = perId(personen);
  var hoort = function (x) { return String(x.trajectId) === String(id) || (k && String(x.kansId) === String(k.id)); };
  var acts = lees('Activiteiten'), grens = datumStr(plusDagen(-60));
  var uit = {
    project: trajectUit(t), school: s ? { id: s.id, naam: s.naam, plaats: s.plaats, email: s.email, telefoon: s.telefoon } : null,
    kans: k ? kansUit(k, mijlpaalMap()) : null,
    personen: personen.map(function (p) { return persoonUit(p, sMap); }),
    taken: lees('Acties').filter(function (a) { return a.status !== 'af' && hoort(a); }).sort(sorteerActies).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    tijdlijn: tijdlijn(acts.filter(hoort), sMap, pMap, kMap),
    losseMails: s ? tijdlijn(acts.filter(function (a) { return a.type === 'mail' && !a.trajectId && String(a.schoolId) === String(s.id) && String(a.datum).slice(0, 10) >= grens; }), sMap, pMap, kMap).slice(0, 15) : [],
    facturen: mag('facturatie', 'zien', t) ? facturenVan(id) : null,  // v4.0: null = geen facturatie zien
    keuzes: facturatieKeuzes(),
    rechten: { wijzigen: mag('projecten', 'wijzigen', t), facturatie: mag('facturatie', 'zien', t), facturatieWijzigen: mag('facturatie', 'wijzigen', t) }
  };
  var b = projectBezetting(t); Object.keys(b).forEach(function (x) { uit[x] = b[x]; });  // v4.1: taskforce, vacatures en kandidaten
  return uit;
}
function facturatieKeuzes() { return { soortFacturatie: keuzelijst('soortFacturatie'), gefactureerd: keuzelijst('gefactureerd'), vakanties: keuzelijst('vakanties'), factuurStatussen: keuzelijst('factuurStatussen'), trajectStatussen: trajectStatussen() }; }
function factuurUit(f) {
  return { id: f.id, trajectId: f.trajectId, omschrijving: f.omschrijving, bedrag: Number(f.bedrag) || 0, datum: f.datum || '', status: f.status || 'nog te doen', factuurnummer: f.factuurnummer || '',
    bijzonderheden: f.bijzonderheden || '', exactId: f.exactId || '', door: f.door || '', verzonden: datumIn(f.verzonden), betaald: datumIn(f.betaald) };  // v6.5
}
function facturenVan(trajectId, alle) {
  return (alle || lees('Facturen')).filter(function (f) { return String(f.trajectId) === String(trajectId); })
    .sort(function (a, b) { return String(a.datum || '9999').localeCompare(String(b.datum || '9999')); }).map(factuurUit);
}
// Het facturatiebord: alle projecten met hun facturatievelden en termijnen. Gestopte en afgeronde projecten van vorige schooljaren blijven weg.
function apiFacturatie() {
  eis('facturatie', 'zien');  // v4.0: alleen de projecten waarvan ik de facturatie mag zien
  var alle = lees('Facturen'), sj = huidigSchooljaar();
  var ts = lees('Trajecten').filter(function (t) { return mag('facturatie', 'zien', t) && (projectLopend(t) || t.schooljaar === sj || alle.some(function (f) { return String(f.trajectId) === String(t.id) && f.status !== 'betaald'; })); });
  return {
    projecten: ts.map(function (t) { var u = trajectUit(t); u.facturen = facturenVan(t.id, alle); u.magWijzigen = mag('facturatie', 'wijzigen', t); return u; })
      .sort(function (a, b) { return String(a.am).localeCompare(String(b.am)) || String(a.school).localeCompare(String(b.school)); }),
    keuzes: facturatieKeuzes(), gebruikers: gebruikersNamen(), ik: ikUit()
  };
}
var FACTUUR_VELDEN = ['id', 'trajectId', 'omschrijving', 'bedrag', 'datum', 'status', 'factuurnummer', 'bijzonderheden', 'verzonden', 'betaald'];  // v6.5: verzonden en betaald
function apiFactuurOpslaan(obj) {
  obj = obj || {};
  var o = schoon(obj, FACTUUR_VELDEN), oud = o.id ? vind('Facturen', o.id) : null;
  if (o.id && !oud) throw new Error('Termijn niet gevonden.');
  var tid = o.trajectId || (oud && oud.trajectId), pr = tid ? vind('Trajecten', tid) : null; if (!pr) throw new Error('Project niet gevonden.');
  eis('facturatie', 'wijzigen', pr);  // v4.0
  if (oud && o.trajectId && String(o.trajectId) !== String(oud.trajectId)) eis('facturatie', 'wijzigen', vind('Trajecten', oud.trajectId) || {});
  if (o.status !== undefined && keuzelijst('factuurStatussen').indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.bedrag !== undefined && o.bedrag !== '') o.bedrag = Number(String(o.bedrag).replace(',', '.')) || 0;
  if (o.omschrijving !== undefined) o.omschrijving = String(o.omschrijving).trim();
  if (!oud && !o.omschrijving) throw new Error('Geef de termijn een omschrijving.');
  if (!oud) { o.aangemaakt = nu(); o.door = ikNaam(); o.status = o.status || keuzelijst('factuurStatussen')[0]; }
  // v6.5: verzend- en betaaldatum volgen de status (vandaag), tenzij ze zelf zijn ingevuld; terug naar een eerdere status wist ze
  ['verzonden', 'betaald'].forEach(function (k) { if (o[k] !== undefined && o[k] !== '') { o[k] = datumIn(o[k]); if (!o[k]) throw new Error('Ongeldige datum bij ' + k + '.'); } });
  if (o.status !== undefined && (!oud || o.status !== oud.status)) {
    var vandaag = datumStr(new Date()), heeft = function (k) { return o[k] !== undefined ? o[k] : (oud ? oud[k] : ''); };
    if ((o.status === 'verzonden' || o.status === 'betaald') && !heeft('verzonden')) o.verzonden = o.status === 'betaald' && oud && oud.datum && oud.datum < vandaag && oud.status !== 'verzonden' ? datumIn(oud.datum) : vandaag;
    if (o.status === 'betaald' && !heeft('betaald')) o.betaald = vandaag;
    if (o.status === 'verzonden' && o.betaald === undefined) o.betaald = '';
    if (['nog te doen', 'aangemaakt'].indexOf(o.status) >= 0) { if (o.verzonden === undefined) o.verzonden = ''; if (o.betaald === undefined) o.betaald = ''; }
  }
  var f = metLock(function () { controleerConflict('Facturen', o.id, o, obj._oud); return schrijf('Facturen', o); });
  return factuurUit(f);
}
// Termijnen in één keer: per maand van start tot eind (schoolvakantie juli/augustus overslaan), of één factuur vooraf.
function apiFacturenMaken(trajectId, opties) {
  opties = opties || {};
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Project niet gevonden.');
  eis('facturatie', 'wijzigen', t);  // v4.0
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
  status = typeof status === 'string' && status ? status : 'aangemaakt';  // v7.2: alleen een tekst als status (een lijst of object gaf een TypeError)
  eis('facturatie', 'zien');  // v4.0: alleen termijnen van projecten die ik mag zien
  var tMap = perId(lees('Trajecten').filter(function (t) { return mag('facturatie', 'zien', t); })), sMap = perId(lees('Scholen'));
  var cel = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var rijen = lees('Facturen').filter(function (f) { return (!status || f.status === status) && tMap[f.trajectId]; }).map(function (f) {
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
  mijn_taken: { description: 'De open taken van de gebruiker.', properties: {}, required: [] },
  // v5.0: het talentnetwerk (alleen lezen, zonder contactgegevens; alleen voor wie het talentbestand mag zien)
  zoek_talent: { description: 'Zoek in het talentbestand (flexkrachten: ondersteuners, studentdocenten, huiswerkbegeleiders, examentrainers, NT2-ondersteuners, surveillanten) op naam, woonplaats, functie, sector of vak. Geeft status, functies, VOG-stand en beoordeling, zonder contactgegevens.',
    properties: { zoekterm: { type: 'string' }, functie: { type: 'string', description: 'Optioneel: alleen deze functie.' } }, required: ['zoekterm'] },
  match_vacature: { description: 'De beste talenten voor een vacature (id uit lees_school of zoek_crm → projecten → vacatures), met een score van 0 tot 100 en de uitleg per onderdeel. De gebruiker beslist zelf wie wordt voorgedragen.',
    properties: { vacatureId: { type: 'string' } }, required: ['vacatureId'] }
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
    properties: metKoppeling({ tekst: { type: 'string' }, deadline: { type: 'string', description: 'yyyy-MM-dd' }, tijd: { type: 'string', description: 'uu:mm, alleen als er een tijdstip bij hoort.' }, prio: { type: 'string', enum: ['hoog', 'midden', 'laag'] }, eigenaar: { type: 'string', description: 'Naam van een collega; standaard de gebruiker zelf.' }, notitie: { type: 'string' } }),  // v4.5: tijd
    required: ['tekst'] },
  log_activiteit: { titel: 'Activiteit vastleggen', description: 'Leg een notitie, gesprek, mail of afspraak vast op de tijdlijn van een school, persoon of kans.',
    properties: metKoppeling({ type: { type: 'string', enum: ['notitie', 'gesprek', 'mail', 'afspraak'] }, vorm: { type: 'string', enum: ACTIVITEIT_VORMEN, description: 'preciezer dan type: call, whatsapp, afspraak of evaluatiegesprek online/fysiek (v7.1)' }, onderwerp: { type: 'string' }, tekst: { type: 'string' }, datum: { type: 'string', description: 'yyyy-MM-dd HH:mm, standaard nu' } }),
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
  var h = huisstijl(), ik = ikUit(), rol = functieVan(ik, true);
  var prijzen = lees('Documenten').filter(function (d) { return d.type === 'prijslijst'; }).slice(0, 3).map(function (d) {
    return '<document titel="' + xmlAttr(d.titel) + '">\n' + String(d.tekst || '').slice(0, 6000) + '\n</document>';
  }).join('\n');
  return 'Je bent Athena, de persoonlijke assistent van ' + ik.naam + ', ' + rol + ' bij ' + h.bedrijf + '. Over het bedrijf: ' + h.omschrijving +
    '\n\nVandaag is het ' + datumLang(new Date()) + ' ' + new Date().getFullYear() + ' (' + datumStr(new Date()) + ').' +
    '\n\nJe helpt met vragen en met werk in het CRM: offertes, conceptmails, taken, activiteiten, kansen en afspraken. Werkwijze:' +
    '\n- Zoek eerst op wat je nodig hebt met de leestools; vraag de gebruiker alleen iets als je het echt niet kunt vinden.' +
    '\n- Acties (maak_offerte, maak_conceptmail, maak_taak, log_activiteit, wijzig_kans, plan_afspraak) worden niet direct uitgevoerd: de gebruiker ziet ze als voorstel en bevestigt zelf. Zeg dus "ik heb een voorstel klaargezet", niet "gedaan".' +
    '\n- Koppel acties waar mogelijk aan een school, persoon of kans (met de id uit zoek_crm).' +
    (niveau('talenten', 'zien') === 'alles' ? '\n- Het talentbestand (zoek_talent, match_vacature) is alleen lezen: je zoekt en vergelijkt, de gebruiker draagt zelf voor in de app. Noem geen telefoonnummers of e-mailadressen van talenten.' : '') +  // v5.0
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
    var trajecten = lees('Trajecten').filter(function (t) { return (String(t.schoolId) === String(r.school.id) || klein(t.school) === klein(r.school.naam)) && mag('projecten', 'zien', t); });
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
      .map(function (a) { return { tekst: a.tekst, deadline: a.deadline, tijd: a.tijd || '', prio: a.prio, school: sMap[a.schoolId] ? sMap[a.schoolId].naam : '' }; });  // v4.5: tijd
  }
  if (naam === 'zoek_talent') {  // v5.0
    if (niveau('talenten', 'zien') !== 'alles') return 'Het talentbestand is alleen voor het talentteam en het management.';
    var idxT = talentIndex(), q = zonderAccenten(klein(inv.zoekterm)), fq = klein(inv.functie);
    return lees('Talenten').filter(function (t) { return t.status !== 'uitgeschreven' && (!fq || lijstUit(t.functies).map(klein).indexOf(fq) >= 0) && (!q || zonderAccenten(klein([talentNaam(t), t.woonplaats, lijstUit(t.functies).join(' '), lijstUit(t.sectoren).join(' '), lijstUit(t.vakken).join(' ')].join(' '))).indexOf(q) >= 0); })
      .slice(0, 10).map(function (t) { var x = idxT.per[String(t.id)] || { docs: [], beoordelingen: [] }; return { id: t.id, naam: talentNaam(t), woonplaats: t.woonplaats, status: t.status, functies: lijstUit(t.functies), sectoren: lijstUit(t.sectoren), vakken: lijstUit(t.vakken), vog: vogStatus(t, x.docs).status, beoordeling: beoordelingSamenvatting(x.beoordelingen), beschikbaarheidBevestigd: t.beschikbaarheidBevestigd || '' }; });
  }
  if (naam === 'match_vacature') {  // v5.0
    var mv = apiMatch(String(inv.vacatureId || ''));
    return { vacature: mv.vacature, functie: mv.functie, sector: mv.sector, kandidaten: mv.kandidaten.slice(0, 8).map(function (k) { return { talentId: k.talentId, naam: k.naam, score: k.score, vog: k.vog, afstandKm: k.afstandKm, alVoorgedragen: k.alVoorgedragen, uitleg: k.onderdelen.map(function (o) { return o.naam + ' ' + o.punten + '/' + o.max + ': ' + o.uitleg; }).join('; '), waarschuwingen: k.waarschuwingen }; }), uitgesloten: mv.uitgesloten.length };
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
    return agendaItems(van, new Date(tot.getFullYear(), tot.getMonth(), tot.getDate() + 1)).map(function (e) { return { titel: e.titel, start: e.start, eind: e.eind, heleDag: e.heleDag, locatie: e.locatie }; });  // v7.2: kalenderdag, niet 24 uur (zomertijd)
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
  var scholen = lees('Scholen'), sMap = perId(scholen), via = kansenViaProject();  // v4.0: alleen zichtbare kansen en projecten
  return {
    scholen: top(scholen, function (s) { return [s.naam, s.plaats, s.bestuur, s.email, s.website].join(' '); }, function (s) { return { id: s.id, naam: s.naam, plaats: s.plaats, status: s.status }; }),
    personen: top(lees('Personen'), function (p) { return [persoonNaam(p), p.email, p.functie, sMap[p.schoolId] ? sMap[p.schoolId].naam : ''].join(' '); },
      function (p) { return { id: p.id, naam: persoonNaam(p), functie: p.functie, email: p.email, schoolId: p.schoolId, school: sMap[p.schoolId] ? sMap[p.schoolId].naam : '' }; }),
    kansen: top(lees('Kansen').filter(function (k) { return kansZichtbaar(k, via); }), function (k) { return [k.naam, k.traject, k.school].join(' '); },
      function (k) { return { id: k.id, naam: k.naam || k.traject, school: k.school, schoolId: k.schoolId, fase: k.fase, waarde: Number(k.waarde) || 0, eigenaar: k.eigenaar }; }),
    projecten: top(lees('Trajecten').filter(function (t) { return mag('projecten', 'zien', t); }), function (t) { return [t.school, t.traject, t.plaats].join(' '); },
      function (t) { return { id: t.id, traject: t.traject, school: t.school, schoolId: t.schoolId, schooljaar: t.schooljaar, status: t.status }; })
  };
}
// Ook gebruikt bij uitvoeren: de app kan de invoer aangepast hebben.
function breinActieCheck(soort, inv) {
  var def = uitMap(BREIN_ACTIES, soort); if (!def) throw new Error('Onbekende actie.');  // v7.2: geen geërfde sleutels ('__proto__' passeerde de controle en brak op Object.keys)
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
    var t = apiTaakOpslaan({ tekst: o.tekst, deadline: o.deadline || '', tijd: o.tijd || '', prio: o.prio || 'midden', eigenaar: o.eigenaar || '', notitie: o.notitie || '', schoolId: o.schoolId || '', persoonId: o.persoonId || '', kansId: o.kansId || '' });  // v4.5: tijd
    return { melding: 'Taak aangemaakt: ' + t.tekst };
  }
  if (soort === 'log_activiteit') {
    apiActiviteitToevoegen({ type: o.type, vorm: o.vorm || '', onderwerp: o.onderwerp, tekst: o.tekst || '', datum: o.datum || '', schoolId: o.schoolId || '', persoonId: o.persoonId || '', kansId: o.kansId || '' });
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

/* ===================== 13. Talentnetwerk fase 1 (v5.0) ===================== */

// Eén profiel per flexkracht (Talenten) met beschikbaarheid, documenten (VOG), relaties met scholen, beoordelingen en de weekuren uit XPS.
// Het talentteam stelt gericht voor met een uitlegbare matchscore (mens in de lus: de score sluit niemand uit); de accountmanager beoordeelt per plaatsing.
// Plaatsing, contract, rooster en uren blijven in XPS tot fase 2 (Supabase). Zie docs/plan-taken-en-talentnetwerk.md en docs/teams-en-processen.md.
var TALENT_STATUSSEN = ['aangemeld', 'gescreend', 'actief', 'slapend', 'uitgeschreven'];
var DAGEN_KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'], DAGDELEN = ['ochtend', 'middag', 'avond'];
var VERVOER = ['auto', 'ov', 'fiets'];
var OORDELEN = ['favoriet', 'goed', 'niet geschikt'], OORDEEL_PUNTEN = { favoriet: 3, goed: 2, 'niet geschikt': 1 };
var TALENT_SCHOOL_STATUSSEN = ['favoriet', 'neutraal', 'niet meer'];
var DOCUMENT_STATUSSEN = ['geldig', 'verlopen', 'ontbreekt', 'in aanvraag'];
var TALENT_VELDEN = ['id', 'voornaam', 'achternaam', 'email', 'telefoon', 'postcode', 'woonplaats', 'functies', 'sectoren', 'vakken', 'opleiding', 'bevoegdheid', 'vervoer', 'reisafstandKm', 'maxUrenWeek',
  'beschikbaarVanaf', 'beschikbaarTot', 'contractvorm', 'status', 'bron', 'xpsId', 'afasNummer', 'tags', 'velden', 'toestemmingDatum', 'toestemmingGrondslag', 'notitie'];
var EXTERN = { id: 'extern', naam: 'Portaal', email: '', team: 'extern', rol: 'medewerker' };  // het portaalprofiel: hoort bij geen team, dus niveau() geeft overal 'geen'
var PORTAAL_FUNCTIES = ['apiPortaalToon', 'apiPortaalBeschikbaarheid'];
var MAX_BESTAND = 8 * 1024 * 1024;
var FUNCTIE_VERWANT = [['onderwijsondersteuner', 'studentdocent', 'surveillant'], ['huiswerkbegeleider', 'examentrainer', 'rekenondersteuner'], ['nt2-ondersteuner', 'onderwijsondersteuner']];
var COMPLEET_VELDEN = [['voornaam', 'voornaam'], ['achternaam', 'achternaam'], ['email', 'e-mail'], ['telefoon', 'telefoon'], ['postcode', 'postcode'], ['woonplaats', 'woonplaats'], ['functies', 'functies'], ['sectoren', 'sectoren'],
  ['opleiding', 'opleiding'], ['vervoer', 'vervoer'], ['reisafstandKm', 'reisafstand'], ['maxUrenWeek', 'uren per week'], ['beschikbaarheid', 'beschikbaarheid'], ['contractvorm', 'contractvorm'], ['toestemmingDatum', 'toestemming']];

/* ----- Hulpfuncties ----- */

function talentNaam(t) { return [t.voornaam, t.achternaam].filter(Boolean).join(' ') || t.email || '(naamloos)'; }
function talentNaamVan(id) { var x = talentIndex().per[String(id)]; return x ? talentNaam(x.talent) : ''; }
// Per verzoek één keer: elk talent met zijn documenten, beoordelingen, relaties met scholen en kandidaatrijen (lees() onthoudt de rijen al)
var _TALENTINDEX = null;
function talentIndex() {
  if (!_TALENTINDEX) {
    var per = {};
    lees('Talenten').forEach(function (t) { per[String(t.id)] = { talent: t, docs: [], beoordelingen: [], scholen: [], kandidaten: [] }; });
    lees('TalentDocumenten').forEach(function (d) { var x = per[String(d.talentId)]; if (x) x.docs.push(d); });
    lees('Beoordelingen').forEach(function (b) { var x = per[String(b.talentId)]; if (x) x.beoordelingen.push(b); });
    lees('TalentSchool').forEach(function (r) { var x = per[String(r.talentId)]; if (x) x.scholen.push(r); });
    lees('Kandidaten').forEach(function (k) { var x = k.talentId && per[String(k.talentId)]; if (x) x.kandidaten.push(k); });
    _TALENTINDEX = { per: per };
  }
  return _TALENTINDEX;
}
function leegTalentIndex() { return { docs: [], beoordelingen: [], scholen: [], kandidaten: [] }; }
function telefoonIn(s) { var d = String(s || '').replace(/[^\d+]/g, ''); if (/^\+31/.test(d)) d = '0' + d.slice(3); else if (/^0031/.test(d)) d = '0' + d.slice(4); return d.replace(/\+/g, ''); }
function postcodeIn(s) { var p = String(s || '').toUpperCase().replace(/\s+/g, '').trim(); return /^\d{4}[A-Z]{2}$/.test(p) ? p.slice(0, 4) + ' ' + p.slice(4) : String(s || '').trim(); }
function lijstIn(v) { return uniek((v instanceof Array ? v : String(v || '').split(/[,;]/)).map(function (x) { return String(x).trim(); }).filter(Boolean)); }
function keuzeLijstIn(v, sleutel, label) {
  var lijst = keuzelijst(sleutel), uit = lijstIn(v).map(klein);
  uit.forEach(function (x) { if (lijst.indexOf(x) < 0) throw new Error('Onbekende ' + label + ': ' + x + '. Kies uit ' + lijst.join(', ') + ' (of pas de keuzelijst aan).'); });
  return uit;
}
// Beschikbaarheid: {ma: [ochtend, middag, avond], …, zo: […]} met 2 = ja, 1 = liever niet, 0 = nee
function beschikbaarheidUit(s) { var o = veldenUit(s), uit = {}; DAGEN_KORT.forEach(function (d) { var r = o[d] instanceof Array ? o[d] : []; uit[d] = [0, 1, 2].map(function (i) { var v = Number(r[i]); return v === 1 || v === 2 ? v : 0; }); }); return uit; }
function beschikbaarheidIn(raster) { if (!raster || typeof raster !== 'object') throw new Error('Geen beschikbaarheid.'); return beschikbaarheidUit(raster); }
function heeftBeschikbaarheid(b) { return DAGEN_KORT.some(function (d) { return b[d].some(function (v) { return v > 0; }); }); }
function uitzonderingenIn(lijst) {
  if (!(lijst instanceof Array)) return [];
  if (lijst.length > 20) throw new Error('Maximaal 20 uitzonderingen.');
  return lijst.map(function (u) {
    var van = datumIn(u && u.van), tot = datumIn(u && u.tot) || van;
    if (!van) throw new Error('Elke uitzondering heeft een begindatum nodig.');
    if (tot < van) throw new Error('De einddatum van een uitzondering ligt vóór het begin.');
    return { van: van, tot: tot, soort: u.soort === 'wel' ? 'wel' : 'niet', reden: String((u && u.reden) || '').trim().slice(0, 120) };
  });
}
function compleetheid(t) {
  var ontbreekt = [];
  COMPLEET_VELDEN.forEach(function (v) {
    var w = t[v[0]], leeg = w === '' || w == null || (v[0] === 'beschikbaarheid' && !heeftBeschikbaarheid(beschikbaarheidUit(w))) || ((v[0] === 'functies' || v[0] === 'sectoren') && !lijstUit(w).length);
    if (leeg) ontbreekt.push(v[1]);
  });
  return { procent: Math.round(100 * (COMPLEET_VELDEN.length - ontbreekt.length) / COMPLEET_VELDEN.length), ontbreekt: ontbreekt };
}
function bewarenTotVan(toestemming) { var d = parseDatum(toestemming) || new Date(), m = Number(instelling('bewaartermijnMaanden')) || 24; return datumStr(new Date(d.getFullYear(), d.getMonth() + m, d.getDate())); }
// VOG per schooljaar (art. 34b WPO): een afschrift jonger dan zes maanden vóór de eerste inzet van het schooljaar. groen = kan dit schooljaar nog starten;
// oranje = alleen goed voor een inzet die al loopt en waarvoor de VOG bij de start jong genoeg was; verlopen = nieuwe VOG nodig; ontbreekt = nog geen VOG vastgelegd.
function vogStatus(t, docs, sj) {
  var huidig = huidigSchooljaar(); sj = sj || huidig;
  var vogs = (docs || []).filter(function (d) { return klein(d.soort) === 'vog' && d.afgifte; }).sort(function (a, b) { return String(b.afgifte).localeCompare(String(a.afgifte)); });
  if (!vogs.length) return { status: 'ontbreekt', afgifte: '', geldigTot: '' };
  var v = vogs[0], afgifte = String(v.afgifte).slice(0, 10), maanden = Number(instelling('vogMaandenGeldig')) || 6;
  var minMaanden = function (d) { return datumStr(new Date(d.getFullYear(), d.getMonth() - maanden, d.getDate())); };
  // een nieuwe inzet begint op zijn vroegst vandaag (in het lopende schooljaar) of bij de start van het schooljaar waarvoor gekeken wordt
  var start = schooljaarStart(sj), vandaag = new Date(), peil = sj === huidig && vandaag > start ? vandaag : start;
  if (afgifte >= minMaanden(peil)) return { status: 'groen', afgifte: afgifte, geldigTot: v.geldigTot || '' };
  // niet vers genoeg voor een nieuwe start, maar wel goed voor een inzet die al loopt en waarvoor de VOG bij het begin (of bij de start van dit schooljaar) jong genoeg was
  var x = talentIndex().per[String(t.id)], startStr = datumStr(start), eindStr = datumStr(new Date(start.getFullYear() + 1, 6, 31));
  var loopt = !!x && x.kandidaten.some(function (k) {
    if (!kandidaatGevuld(k) || !k.start || String(k.start) > eindStr || (k.eind && String(k.eind) < startStr)) return false;
    var s = parseDatum(k.start); if (!s) return false; if (s < start) s = start;
    return afgifte >= minMaanden(s);
  });
  return { status: loopt ? 'oranje' : 'verlopen', afgifte: afgifte, geldigTot: v.geldigTot || '' };
}
function beoordelingSamenvatting(lijst) {
  var l = (lijst || []).filter(function (b) { return OORDEEL_PUNTEN[b.oordeel]; }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); });
  if (!l.length) return { aantal: 0, gem: null, laatste: null, favorieten: 0, nietGeschikt: 0 };
  return { aantal: l.length, gem: Math.round(10 * l.reduce(function (s, b) { return s + OORDEEL_PUNTEN[b.oordeel]; }, 0) / l.length) / 10, laatste: { oordeel: l[0].oordeel, datum: l[0].datum, door: l[0].door },
    favorieten: l.filter(function (b) { return b.oordeel === 'favoriet'; }).length, nietGeschikt: l.filter(function (b) { return b.oordeel === 'niet geschikt'; }).length };
}
function talentKeuzes() {
  return { functies: keuzelijst('talentFuncties'), sectoren: keuzelijst('sectoren'), vakken: keuzelijst('vakken'), statussen: TALENT_STATUSSEN, contractvormen: keuzelijst('contractvormen'), documentSoorten: keuzelijst('documentSoorten'),
    bronnen: keuzelijst('talentBronnen'), vervoer: VERVOER, criteria: keuzelijst('beoordelingsCriteria'), oordelen: OORDELEN, schoolStatussen: TALENT_SCHOOL_STATUSSEN, documentStatussen: DOCUMENT_STATUSSEN, dagen: DAGEN_KORT, dagdelen: DAGDELEN };
}
// beperkt = de accountmanager: naam, functies, VOG, beoordeling en contact; geen adres, documenten, notitie of uren
function talentUit(t, beperkt, x) {
  x = x || talentIndex().per[String(t.id)] || leegTalentIndex();
  var compleet = compleetheid(t);
  var u = { id: t.id, voornaam: t.voornaam || '', achternaam: t.achternaam || '', naam: talentNaam(t), functies: lijstUit(t.functies), sectoren: lijstUit(t.sectoren), vakken: lijstUit(t.vakken), status: t.status || 'aangemeld', statusSinds: t.statusSinds || '',
    email: t.email || '', telefoon: t.telefoon || '', vog: vogStatus(t, x.docs), beoordeling: beoordelingSamenvatting(x.beoordelingen), plaatsingen: x.kandidaten.filter(kandidaatGevuld).length,
    beschikbaarheidBevestigd: t.beschikbaarheidBevestigd || '', beperkt: !!beperkt, compleetheid: compleet.procent, woonplaats: t.woonplaats || '' };
  if (beperkt) return u;
  u.postcode = t.postcode || ''; u.lat = Number(t.lat) || null; u.lon = Number(t.lon) || null; u.opleiding = t.opleiding || ''; u.bevoegdheid = t.bevoegdheid || ''; u.vervoer = t.vervoer || '';
  u.reisafstandKm = Number(t.reisafstandKm) || ''; u.maxUrenWeek = Number(t.maxUrenWeek) || ''; u.beschikbaarVanaf = t.beschikbaarVanaf || ''; u.beschikbaarTot = t.beschikbaarTot || '';
  u.beschikbaarheid = beschikbaarheidUit(t.beschikbaarheid); u.uitzonderingen = lijstUit(t.uitzonderingen); u.laatstePeiling = t.laatstePeiling || '';
  u.contractvorm = t.contractvorm || ''; u.bron = t.bron || ''; u.xpsId = t.xpsId || ''; u.afasNummer = t.afasNummer || ''; u.tags = tagsUit(t.tags); u.velden = veldenUit(t.velden);
  u.toestemmingDatum = t.toestemmingDatum || ''; u.toestemmingGrondslag = t.toestemmingGrondslag || ''; u.bewarenTot = t.bewarenTot || ''; u.portaal = !!(t.portaalToken && String(t.portaalTokenTot || '') >= nu());
  u.notitie = t.notitie || ''; u.laatsteContact = t.laatsteContact || ''; u.door = t.door || ''; u.aangemaakt = t.aangemaakt || ''; u.bijgewerkt = t.bijgewerkt || ''; u.ontbreekt = compleet.ontbreekt;
  return u;
}
function documentUit(d) { return { id: d.id, talentId: d.talentId, soort: d.soort || '', afgifte: d.afgifte || '', geldigTot: d.geldigTot || '', status: d.status || '', heeftBestand: !!d.driveId, gecontroleerdDoor: d.gecontroleerdDoor || '', gecontroleerdOp: d.gecontroleerdOp || '', notitie: d.notitie || '', door: d.door || '', aangemaakt: d.aangemaakt || '' }; }  // nooit een Drive-URL: die komt alleen via apiTalentDocumentLink (gelogd)
function beoordelingUit(b, sMap, tMap) {
  var s = sMap && sMap[String(b.schoolId)], t = tMap && tMap[String(b.trajectId)];
  return { id: b.id, talentId: b.talentId, kandidaatId: b.kandidaatId || '', trajectId: b.trajectId || '', schoolId: b.schoolId || '', school: s ? s.naam : '', project: t ? t.traject + (t.schooljaar ? ' ' + t.schooljaar : '') : '', door: b.door || '', rol: b.rol || '', datum: b.datum || '',
    oordeel: b.oordeel || '', criteria: veldenUit(b.criteria), tekst: b.tekst || '', zichtbaarheid: b.zichtbaarheid || 'intern', wederhoor: b.wederhoor || '', magWijzigen: isBeheerder() || b.door === ikNaam() || niveau('beoordelingen', 'wijzigen') === 'alles' };
}
function talentSchoolUit(r, sMap) { var s = sMap[String(r.schoolId)]; return { id: r.id, talentId: r.talentId, schoolId: r.schoolId, school: s ? s.naam : '', status: r.status || 'neutraal', richting: r.richting || 'school', reden: r.reden || '', door: r.door || '', datum: r.datum || '' }; }
function urenVan(talentId, weken) {
  var tMap = perId(lees('Trajecten'));
  return lees('TalentUren').filter(function (u) { return String(u.talentId) === String(talentId); }).sort(function (a, b) { return String(b.week).localeCompare(String(a.week)); }).slice(0, weken || 12)
    .map(function (u) { var t = tMap[u.trajectId]; return { week: u.week, uren: Number(u.uren) || 0, diensten: Number(u.diensten) || 0, noShows: Number(u.noShows) || 0, lateAfmeldingen: Number(u.lateAfmeldingen) || 0, xpsProject: u.xpsProject || '', project: t ? t.school + ' · ' + t.traject : '' }; });
}
function zetTalentContact(id, wanneer) {  // altijd binnen metLock
  var t = vind('Talenten', id); if (!t) return;
  var d = String(wanneer || nu()).slice(0, 10);
  if (!(String(t.laatsteContact || '').slice(0, 10) >= d)) schrijf('Talenten', { id: t.id, laatsteContact: d });
}
// Kandidaatrijen zonder talentId die bij dit profiel horen (zelfde e-mail of XPS-nummer) koppelen (altijd binnen metLock)
function koppelKandidaten(t) {
  var email = klein(t.email), xps = klein(t.xpsId);
  var mee = lees('Kandidaten').filter(function (k) { return !k.talentId && ((email && klein(k.email) === email) || (xps && klein(k.xpsId) === xps)); }).map(function (k) { return { id: k.id, talentId: t.id }; });
  if (mee.length) schrijfVeel('Kandidaten', mee);
  return mee.length;
}
function isoWeekStr(d) { var t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - (d.getDay() + 6) % 7); return t.getFullYear() + '-W' + ('0' + isoWeek(d)).slice(-2); }
function afstandKm(tl, school) {
  var la1 = Number(tl.lat), lo1 = Number(tl.lon), la2 = school && Number(school.lat), lo2 = school && Number(school.lon);
  if (!la1 || !lo1 || !la2 || !lo2) return null;
  var r = Math.PI / 180, dLat = (la2 - la1) * r, dLon = (lo2 - lo1) * r, a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ----- Drive: submap Talent (documenten per talent) en XPS-export ----- */

function submapVanBasis(naam, eigenschap) {
  var id = P.getProperty(eigenschap); if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var basisId = P.getProperty('DRIVE_MAP_ID'); if (!basisId) throw new Error('Geen documentenmap — draai setup() in de Apps Script-editor.');
  var basis = DriveApp.getFolderById(basisId), it = basis.getFoldersByName(naam), map = it.hasNext() ? it.next() : basis.createFolder(naam);
  P.setProperty(eigenschap, map.getId());
  return map;
}
function talentMap() { return submapVanBasis('Talent', 'TALENT_MAP_ID'); }
function xpsExportMap() { return submapVanBasis('XPS-export', 'XPS_EXPORT_MAP_ID'); }
function talentSubmap(t) { var map = talentMap(), it = map.getFoldersByName(String(t.id)); return it.hasNext() ? it.next() : map.createFolder(String(t.id)); }
function talentSubmapAls(id) { var map = talentMap(), it = map.getFoldersByName(String(id)); return it.hasNext() ? it.next() : null; }

/* ----- Lijst en profiel ----- */

function talentFilterOk(u, f) {
  if (f.status && u.status !== f.status) return false;
  if (f.functie && u.functies.map(klein).indexOf(klein(f.functie)) < 0) return false;
  if (f.sector && u.sectoren.map(klein).indexOf(klein(f.sector)) < 0) return false;
  if (f.vog && u.vog.status !== f.vog) return false;
  if (f.zoek) { var q = zonderAccenten(klein(f.zoek)); if (zonderAccenten(klein([u.naam, u.woonplaats, u.functies.join(' '), u.sectoren.join(' '), u.vakken.join(' '), (u.tags || []).join(' ')].join(' '))).indexOf(q) < 0) return false; }
  return true;
}
// Wie het talentteam vandaag het best kan benaderen: onbeantwoorde peiling, slapend maar voorgedragen, aanmelding die wacht, VOG bij een lopende inzet, onvolledig profiel
function benaderLijst(lijst, idx) {
  var uit = [];
  lijst.forEach(function (t) {
    if (t.status === 'uitgeschreven') return;
    var x = idx.per[String(t.id)] || leegTalentIndex(), redenen = [];
    if (t.laatstePeiling && (!t.beschikbaarheidBevestigd || String(t.beschikbaarheidBevestigd) < String(t.laatstePeiling)) && (dagenSinds(t.laatstePeiling) || 0) > 14) redenen.push('peiling niet beantwoord');
    if (t.status === 'slapend' && x.kandidaten.some(kandidaatInProces)) redenen.push('slapend, maar voorgedragen');
    if (t.status === 'aangemeld' && (dagenSinds(t.aangemaakt) || 0) > 7) redenen.push('aanmelding wacht al ' + dagenSinds(t.aangemaakt) + ' dagen op screening');
    var vog = vogStatus(t, x.docs);
    if (vog.status !== 'groen' && x.kandidaten.some(kandidaatGevuld)) redenen.push('VOG ' + vog.status + ' bij een lopende inzet');
    else if ((vog.status === 'verlopen' || vog.status === 'ontbreekt') && x.kandidaten.some(kandidaatInProces)) redenen.push('VOG ' + vog.status + ' bij een voordracht');
    if (t.status === 'actief') { var c = compleetheid(t); if (c.procent < 60) redenen.push('profiel ' + c.procent + '% compleet'); }
    if (redenen.length) uit.push({ id: t.id, naam: talentNaam(t), redenen: redenen });
  });
  return uit.slice(0, 20);
}
// filter (optioneel, ook voor de Assistent): {zoek, functie, sector, status, vog}
function apiTalenten(filter) {
  eis('talenten', 'zien');
  filter = filter || {};
  var vol = niveau('talenten', 'zien') === 'alles', idx = talentIndex(), lijst = lees('Talenten').filter(function (t) { return vol || mag('talenten', 'zien', t); });
  var uit = lijst.map(function (t) { return talentUit(t, !vol, idx.per[String(t.id)]); }).filter(function (u) { return talentFilterOk(u, filter); }).sort(function (a, b) { return String(a.naam).localeCompare(String(b.naam), 'nl'); });
  var actief = lijst.filter(function (t) { return t.status === 'actief'; }), tel = function (s) { return lijst.filter(function (t) { return (t.status || 'aangemeld') === s; }).length; };
  return {
    talenten: uit, ik: ikUit(), keuzes: talentKeuzes(),
    tellingen: { totaal: lijst.length, actief: actief.length, slapend: tel('slapend'), aangemeld: tel('aangemeld'), gescreend: tel('gescreend'), vogGroen: actief.filter(function (t) { return vogStatus(t, (idx.per[String(t.id)] || leegTalentIndex()).docs).status === 'groen'; }).length, compleet: lijst.filter(function (t) { return t.status !== 'uitgeschreven' && compleetheid(t).procent >= 80; }).length },
    rechten: { wijzigen: vol && mag('talenten', 'wijzigen'), vol: vol, beheer: isBeheerder() },
    scholen: vol ? lees('Scholen').map(function (s) { return { id: s.id, naam: s.naam, lat: Number(s.lat) || null, lon: Number(s.lon) || null }; }) : [],
    benaderen: vol ? benaderLijst(lijst, idx) : []
  };
}
function apiTalent(id) {
  var t = vind('Talenten', id); if (!t) throw new Error('Talent niet gevonden.');
  eis('talenten', 'zien', t);
  var vol = niveau('talenten', 'zien') === 'alles', x = talentIndex().per[String(t.id)] || leegTalentIndex(), sMap = perId(lees('Scholen')), tMap = perId(lees('Trajecten')), vMap = perId(lees('Vacatures')), zicht = zichtbaarFilter();
  var magBeoordelen = mag('beoordelingen', 'wijzigen', { talentId: t.id });
  var plaatsingen = x.kandidaten.filter(function (k) { var tr = tMap[k.trajectId]; return vol || (tr && mag('projecten', 'zien', tr)); }).map(function (k) {
    var tr = tMap[k.trajectId] || {}, v = vMap[k.vacatureId] || {};
    return { id: k.id, vacatureId: k.vacatureId, trajectId: k.trajectId, school: tr.school || '', schoolId: tr.schoolId || '', traject: tr.traject || '', schooljaar: tr.schooljaar || '', am: tr.am || '', vacature: v.titel || '', functie: k.functie || v.titel || '', status: k.status, statusSinds: k.statusSinds || '',
      start: k.start || v.start || '', eind: k.eind || v.eind || '', urenPerWeek: k.urenPerWeek || v.urenPerWeek || '', dagen: k.dagen || v.dagen || '', eindReden: k.eindReden || '', door: k.door || '',
      magBeoordelen: magBeoordelen && (vol || KANDIDAAT_GEVULD.concat(KANDIDAAT_VOORBIJ).indexOf(k.status) >= 0) };
  }).sort(function (a, b) { return String(b.start || b.statusSinds).localeCompare(String(a.start || a.statusSinds)); });
  return {
    talent: talentUit(t, !vol, x),
    documenten: vol ? x.docs.map(documentUit).sort(function (a, b) { return String(b.afgifte || b.aangemaakt).localeCompare(String(a.afgifte || a.aangemaakt)); }) : [],
    beoordelingen: x.beoordelingen.map(function (b) { return beoordelingUit(b, sMap, tMap); }).sort(function (a, b) { return String(b.datum).localeCompare(String(a.datum)); }),
    scholen: vol ? x.scholen.map(function (r) { return talentSchoolUit(r, sMap); }) : [],
    plaatsingen: plaatsingen,
    uren: vol ? urenVan(t.id, 12) : [],
    tijdlijn: vol ? tijdlijn(lees('Activiteiten').filter(function (a) { return String(a.talentId) === String(t.id) && zicht(a); }), sMap, perId(lees('Personen')), perId(lees('Kansen'))) : [],
    keuzes: talentKeuzes(),
    rechten: { wijzigen: vol && mag('talenten', 'wijzigen'), vol: vol, beoordelen: magBeoordelen, beheer: isBeheerder() }
  };
}
function apiTalentOpslaan(obj) {
  eis('talenten', 'wijzigen');
  obj = obj || {};
  var o = schoon(obj, TALENT_VELDEN), oud = o.id ? vind('Talenten', o.id) : null;
  if (o.id && !oud) throw new Error('Talent niet gevonden.');
  ['voornaam', 'achternaam', 'woonplaats', 'opleiding', 'bevoegdheid', 'xpsId', 'afasNummer', 'notitie', 'toestemmingGrondslag'].forEach(function (k) { if (o[k] !== undefined) o[k] = String(o[k]).trim(); });
  if (o.email !== undefined) o.email = klein(o.email);
  if (o.telefoon !== undefined) o.telefoon = telefoonIn(o.telefoon);
  if (o.postcode !== undefined) o.postcode = postcodeIn(o.postcode);
  if (!oud && !o.voornaam && !o.achternaam) throw new Error('Vul minstens een naam in.');
  if (o.functies !== undefined) o.functies = keuzeLijstIn(o.functies, 'talentFuncties', 'functie');
  if (o.sectoren !== undefined) o.sectoren = keuzeLijstIn(o.sectoren, 'sectoren', 'sector');
  if (o.vakken !== undefined) o.vakken = lijstIn(o.vakken).map(klein);  // vakken zijn vrij in te vullen
  if (o.vervoer !== undefined && o.vervoer !== '' && VERVOER.indexOf(o.vervoer) < 0) throw new Error('Vervoer: auto, ov of fiets.');
  ['reisafstandKm', 'maxUrenWeek'].forEach(function (k) { if (o[k] !== undefined) o[k] = o[k] === '' ? '' : Math.max(0, Number(String(o[k]).replace(',', '.')) || 0); });
  ['beschikbaarVanaf', 'beschikbaarTot', 'toestemmingDatum'].forEach(function (k) { if (o[k] !== undefined) { var dd = datumIn(o[k]); if (o[k] && !dd) throw new Error('Ongeldige datum bij ' + k + '.'); o[k] = dd; } });
  if (o.contractvorm !== undefined && o.contractvorm !== '') { o.contractvorm = klein(o.contractvorm); if (keuzelijst('contractvormen').indexOf(o.contractvorm) < 0) throw new Error('Onbekende contractvorm.'); }
  if (o.status !== undefined && TALENT_STATUSSEN.indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.bron !== undefined && o.bron !== '') { o.bron = klein(o.bron); if (keuzelijst('talentBronnen').indexOf(o.bron) < 0) throw new Error('Onbekende bron.'); }
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);
  if (o.velden !== undefined) o.velden = veldenUit(o.velden);
  // één profiel per persoon: zelfde e-mail of telefoon = dubbel (tenzij forceer)
  var email = o.email !== undefined ? o.email : (oud ? klein(oud.email) : ''), tel = o.telefoon !== undefined ? o.telefoon : (oud ? telefoonIn(oud.telefoon) : '');
  if (!obj.forceer && (email || tel)) {
    var dubbel = lees('Talenten').filter(function (x) { return (!oud || String(x.id) !== String(oud.id)) && x.status !== 'uitgeschreven' && ((email && klein(x.email) === email) || (tel && telefoonIn(x.telefoon) === tel)); })[0];
    if (dubbel) throw new Error('Er is al een profiel met dit e-mailadres of telefoonnummer: ' + talentNaam(dubbel) + ' [talent:' + dubbel.id + ']');
  }
  if (!oud) {
    o.status = o.status || 'aangemeld'; o.statusSinds = nu(); o.aangemaakt = nu(); o.door = ikNaam(); o.bron = o.bron || 'anders';
    if (!o.toestemmingDatum) throw new Error('Leg de toestemming vast: de datum waarop deze persoon akkoord ging met opname in het talentbestand.');
    o.toestemmingGrondslag = o.toestemmingGrondslag || 'toestemming';
  }
  var statusWissel = !!oud && o.status !== undefined && o.status !== oud.status;
  if (statusWissel) o.statusSinds = nu();
  if (o.toestemmingDatum !== undefined || !oud) o.bewarenTot = bewarenTotVan(o.toestemmingDatum !== undefined ? o.toestemmingDatum : oud.toestemmingDatum);
  // ligging via PDOK (buiten de lock); mislukt = leeg, de nachtelijke run probeert het opnieuw
  if (o.postcode !== undefined && (!oud || postcodeIn(oud.postcode) !== o.postcode)) { var geo = o.postcode ? geocodeer(o.postcode) : null; o.lat = geo ? geo.lat : ''; o.lon = geo ? geo.lon : ''; }
  var t = metLock(function () {
    controleerConflict('Talenten', o.id, o, obj._oud);
    var r = schrijf('Talenten', o);
    if (!oud) schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: r.id, bron: 'app', aangemaakt: nu(), onderwerp: 'Profiel aangemaakt' + (r.bron ? ' (' + r.bron + ')' : '') });
    else if (statusWissel) schrijf('Activiteiten', { type: 'fase', datum: nu(), door: ikNaam(), talentId: r.id, bron: 'app', aangemaakt: nu(), onderwerp: 'Status: ' + oud.status + ' → ' + r.status });
    koppelKandidaten(r);
    return r;
  });
  var u = talentUit(t, false);
  if (t.contractvorm === 'zzp') u.waarschuwing = 'Let op: zzp in het onderwijs geldt volgens de Wet DBA meestal als schijnzelfstandigheid. Overleg met de administratie.';
  return u;
}
function apiTalentBeschikbaarheidOpslaan(talentId, raster, uitzonderingen) {
  var t = vind('Talenten', talentId); if (!t) throw new Error('Talent niet gevonden.');
  eis('talenten', 'wijzigen', t);
  var b = raster ? beschikbaarheidIn(raster) : beschikbaarheidUit(t.beschikbaarheid), u = (uitzonderingen === undefined || uitzonderingen === null) ? lijstUit(t.uitzonderingen) : uitzonderingenIn(uitzonderingen);
  var r = metLock(function () {
    var x = schrijf('Talenten', { id: t.id, beschikbaarheid: b, uitzonderingen: u, beschikbaarheidBevestigd: nu() });
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: 'Beschikbaarheid bijgewerkt door ' + ikNaam() });
    return x;
  });
  return talentUit(r, false);
}
// Nieuwe portaallink (roteert het token); mailen = true stuurt meteen de peilingmail
function apiTalentPortaalLink(id, mailen) {
  var t = vind('Talenten', id); if (!t) throw new Error('Talent niet gevonden.');
  eis('talenten', 'wijzigen', t);
  if (mailen && !t.email) throw new Error('Dit talent heeft geen e-mailadres.');
  var tk = { token: nieuwToken(), tot: datumTijdStr(new Date(Date.now() + 90 * 86400000)) };
  metLock(function () {
    var o = { id: t.id, portaalToken: tk.token, portaalTokenTot: tk.tot }; if (mailen) o.laatstePeiling = nu();
    schrijf('Talenten', o);
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: mailen ? 'Peiling gemaild door ' + ikNaam() : 'Nieuwe portaallink gemaakt door ' + ikNaam() });
  });
  if (mailen) peilingMail(t, tk.token);
  return { link: portaalLink(tk.token, ''), bevestigLink: portaalLink(tk.token, 'bevestig'), tot: tk.tot, gemaild: !!mailen };
}

/* ----- Documenten (VOG, diploma's): metadata in de Sheet, het bestand in Drive/Talent/<id> ----- */

function apiTalentDocumentOpslaan(obj, bestand) {
  obj = obj || {};
  var oud = obj.id ? vind('TalentDocumenten', obj.id) : null; if (obj.id && !oud) throw new Error('Document niet gevonden.');
  var t = vind('Talenten', obj.talentId || (oud && oud.talentId)); if (!t) throw new Error('Talent niet gevonden.');
  eis('talenten', 'wijzigen', t);
  var o = schoon(obj, ['id', 'soort', 'afgifte', 'geldigTot', 'status', 'notitie']); o.talentId = t.id;
  if (o.soort !== undefined) { o.soort = klein(o.soort); if (keuzelijst('documentSoorten').indexOf(o.soort) < 0) throw new Error('Onbekend soort document.'); }
  var soort = o.soort || (oud && oud.soort) || '';
  if (!soort) throw new Error('Kies het soort document.');
  ['afgifte', 'geldigTot'].forEach(function (k) { if (o[k] !== undefined) { var dd = datumIn(o[k]); if (o[k] && !dd) throw new Error('Ongeldige datum.'); o[k] = dd; } });
  if (soort === 'vog' && !(o.afgifte || (oud && oud.afgifte))) throw new Error('Vul de afgiftedatum van de VOG in.');
  if (o.status !== undefined && o.status !== '' && DOCUMENT_STATUSSEN.indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.notitie !== undefined) o.notitie = String(o.notitie).trim();
  if (obj.gecontroleerd) { o.gecontroleerdDoor = ikNaam(); o.gecontroleerdOp = nu(); }
  if (!oud) { o.aangemaakt = nu(); o.door = ikNaam(); if (!o.status) o.status = (o.geldigTot && o.geldigTot < datumStr(new Date())) ? 'verlopen' : 'geldig'; }
  // het bestand zelf gaat naar Drive (buiten de lock); de Sheet krijgt alleen het id
  if (bestand && bestand.base64) {
    var b64 = String(bestand.base64).replace(/^data:[^;]+;base64,/, '');
    if (b64.length * 3 / 4 > MAX_BESTAND) throw new Error('Het bestand is groter dan 8 MB.');
    var naam = String(bestand.naam || (soort + '.pdf')).replace(/[\/\\]/g, '-').slice(0, 120), mime = String(bestand.mime || 'application/octet-stream');
    o.driveId = talentSubmap(t).createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, naam)).getId();
  }
  var d = metLock(function () {
    var x = schrijf('TalentDocumenten', o);
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: (oud ? 'Document bijgewerkt: ' : 'Document toegevoegd: ') + x.soort + (x.afgifte ? ' (afgifte ' + x.afgifte + ')' : '') });
    return x;
  });
  if (oud && oud.driveId && o.driveId && oud.driveId !== o.driveId) { try { DriveApp.getFileById(oud.driveId).setTrashed(true); } catch (e) {} }  // vervangen bestand opruimen
  return { document: documentUit(d), vog: vogStatus(vind('Talenten', t.id), (talentIndex().per[String(t.id)] || leegTalentIndex()).docs) };
}
// De link naar het bestand komt alleen op aanvraag en wordt gelogd op de tijdlijn (inzage in een VOG is te verantwoorden)
function apiTalentDocumentLink(id) {
  var d = vind('TalentDocumenten', id); if (!d) throw new Error('Document niet gevonden.');
  if (niveau('talenten', 'zien') !== 'alles') throw new Error('Daar heb je geen toegang toe.');
  if (!d.driveId) throw new Error('Bij dit document is geen bestand bewaard.');
  var url = DriveApp.getFileById(d.driveId).getUrl();
  metLock(function () { schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: d.talentId, bron: 'app', aangemaakt: nu(), onderwerp: 'Document geopend door ' + ikNaam() + ': ' + d.soort }); });
  return { url: url };
}

/* ----- Relaties met scholen en beoordelingen ----- */

function apiTalentSchoolOpslaan(obj) {
  obj = obj || {};
  var t = vind('Talenten', obj.talentId), s = vind('Scholen', obj.schoolId);
  if (!t) throw new Error('Talent niet gevonden.'); if (!s) throw new Error('School niet gevonden.');
  eis('beoordelingen', 'wijzigen', { talentId: t.id });  // talentteam alles; de accountmanager alleen voor een talent uit zijn project
  var status = String(obj.status || 'neutraal'); if (TALENT_SCHOOL_STATUSSEN.indexOf(status) < 0) throw new Error('Kies favoriet, neutraal of niet meer.');
  var richting = obj.richting === 'talent' ? 'talent' : 'school', reden = String(obj.reden || '').trim().slice(0, 200);
  metLock(function () {
    var hit = lees('TalentSchool').filter(function (x) { return String(x.talentId) === String(t.id) && String(x.schoolId) === String(s.id) && (x.richting || 'school') === richting; })[0];
    schrijf('TalentSchool', { id: hit ? hit.id : undefined, talentId: t.id, schoolId: s.id, status: status, richting: richting, reden: reden, door: ikNaam(), datum: nu() });
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, schoolId: s.id, bron: 'app', aangemaakt: nu(), onderwerp: (richting === 'talent' ? talentNaam(t) + ' over ' + s.naam : s.naam + ' over ' + talentNaam(t)) + ': ' + status + (reden ? ' — ' + reden : '') });
  });
  var sMap = perId(lees('Scholen'));
  return (talentIndex().per[String(t.id)] || leegTalentIndex()).scholen.map(function (x) { return talentSchoolUit(x, sMap); });
}
function criteriaIn(c) { var lijst = keuzelijst('beoordelingsCriteria'), o = (c && typeof c === 'object') ? c : {}, uit = {}; Object.keys(o).forEach(function (k) { var n = Math.round(Number(o[k])); if (lijst.indexOf(klein(k)) >= 0 && n >= 1 && n <= 3) uit[klein(k)] = n; }); return uit; }
// obj: {id, talentId, kandidaatId, trajectId, schoolId, oordeel, criteria {criterium: 1..3}, tekst, zichtbaarheid, wederhoor}. De AM beoordeelt per plaatsing in een eigen project; het talentteam ook los.
function apiBeoordelingOpslaan(obj) {
  obj = obj || {};
  var oud = obj.id ? vind('Beoordelingen', obj.id) : null; if (obj.id && !oud) throw new Error('Beoordeling niet gevonden.');
  var t = vind('Talenten', (oud && oud.talentId) || obj.talentId); if (!t) throw new Error('Talent niet gevonden.');
  eis('beoordelingen', 'wijzigen', { talentId: t.id });
  var talentteam = niveau('beoordelingen', 'wijzigen') === 'alles';
  var kandId = obj.kandidaatId || (oud && oud.kandidaatId), kand = kandId ? vind('Kandidaten', kandId) : null;
  if (kandId && !kand) throw new Error('Plaatsing niet gevonden.');
  if (kand && String(kand.talentId) !== String(t.id)) throw new Error('Deze plaatsing hoort niet bij dit talent.');
  var trajectId = kand ? kand.trajectId : (obj.trajectId || (oud && oud.trajectId) || ''), traject = trajectId ? vind('Trajecten', trajectId) : null;
  if (!talentteam) {
    if (!kand) throw new Error('Kies de plaatsing waarover je oordeelt.');
    if (!traject || !mag('projecten', 'zien', traject)) throw new Error('Daar heb je geen toegang toe.');
    if (KANDIDAAT_GEVULD.concat(KANDIDAAT_VOORBIJ).indexOf(kand.status) < 0) throw new Error('Beoordelen kan vanaf de start van de inzet (klaar voor start, geplaatst, afgerond of gestopt).');
  }
  if (oud && !(isBeheerder() || oud.door === ikNaam() || talentteam)) throw new Error('Alleen wie de beoordeling gaf, het talentteam of het management kan haar wijzigen.');
  var o = { id: obj.id || undefined, talentId: t.id, kandidaatId: kand ? kand.id : '', trajectId: traject ? traject.id : '', schoolId: traject ? (traject.schoolId || '') : (obj.schoolId || (oud && oud.schoolId) || '') };
  if (obj.oordeel !== undefined) { if (OORDELEN.indexOf(obj.oordeel) < 0) throw new Error('Kies favoriet, goed of niet geschikt.'); o.oordeel = obj.oordeel; }
  if (!oud && !o.oordeel) throw new Error('Kies favoriet, goed of niet geschikt.');
  if (obj.criteria !== undefined) o.criteria = criteriaIn(obj.criteria);
  if (obj.tekst !== undefined) o.tekst = String(obj.tekst).trim().slice(0, 2000);
  if (obj.zichtbaarheid !== undefined) o.zichtbaarheid = obj.zichtbaarheid === 'talent' ? 'talent' : 'intern';
  if (obj.wederhoor !== undefined) { if (!talentteam) throw new Error('Wederhoor legt het talentteam vast.'); o.wederhoor = String(obj.wederhoor).trim().slice(0, 2000); }
  if (!oud) { o.door = ikNaam(); o.rol = talentteam ? 'talent' : 'am'; o.datum = nu(); o.aangemaakt = nu(); o.zichtbaarheid = o.zichtbaarheid || 'intern'; }
  var oordeel = o.oordeel || (oud && oud.oordeel), school = o.schoolId ? vind('Scholen', o.schoolId) : null;
  var b = metLock(function () {
    controleerConflict('Beoordelingen', o.id, o, obj._oud);
    var x = schrijf('Beoordelingen', o);
    if (!oud || o.oordeel !== undefined) {
      schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, schoolId: o.schoolId || '', trajectId: o.trajectId || '', bron: 'app', aangemaakt: nu(), onderwerp: 'Beoordeling: ' + oordeel + (school ? ' (' + school.naam + ')' : ''), tekst: o.tekst || '' });
      if (oordeel === 'niet geschikt' && !oud) meld(teamNamen('talent'), talentNaam(t) + ' is door ' + ikNaam() + ' beoordeeld als niet geschikt' + (school ? ' bij ' + school.naam : '') + '.', 'talent:' + t.id);
    }
    return x;
  });
  return { beoordeling: beoordelingUit(b, perId(lees('Scholen')), perId(lees('Trajecten'))), voorstelNietMeer: (!oud && oordeel === 'niet geschikt' && o.schoolId) ? { schoolId: o.schoolId, school: school ? school.naam : '' } : null };
}

/* ----- Matching: harde filters met reden, daarna een score van 100 met uitleg per onderdeel ----- */

function verwant(f, lijst) { return FUNCTIE_VERWANT.some(function (g) { return g.indexOf(f) >= 0 && lijst.some(function (x) { return g.indexOf(x) >= 0; }); }); }
function functieVanVacature(v) {
  var tekst = klein((v.titel || '') + ' ' + String(v.profiel || '').slice(0, 80)), lijst = keuzelijst('talentFuncties');
  var direct = lijst.filter(function (f) { return tekst.indexOf(f) >= 0; }).sort(function (a, b) { return b.length - a.length; })[0];
  if (direct) return direct;
  var regels = [[/nt2|taalcoach|nieuwkomer|anderstalig/, 'nt2-ondersteuner'], [/reken/, 'rekenondersteuner'], [/examen/, 'examentrainer'], [/huiswerk/, 'huiswerkbegeleider'], [/surveill|toezicht/, 'surveillant'], [/studentdocent|docent|leraar|vervang/, 'studentdocent'], [/ondersteun|assistent/, 'onderwijsondersteuner']];
  for (var i = 0; i < regels.length; i++) if (regels[i][0].test(tekst) && lijst.indexOf(regels[i][1]) >= 0) return regels[i][1];
  return '';
}
function sectorVanSchool(s) {
  var t = klein((s && s.type) || ''), n = klein((s && s.naam) || '');
  if (/isk/.test(t) || /\bisk\b/.test(n)) return 'isk';
  if (/mbo|roc/.test(t)) return 'mbo';
  if (/^so$|vso|speciaal|^pro$|praktijk/.test(t) || /praktijkschool/.test(n)) return 'so';
  if (/^po$|basis|primair/.test(t) || /basisschool/.test(n)) return 'po';
  if (/vo|vmbo|havo|vwo|lyceum|gymnasium|college/.test(t) || /lyceum|gymnasium|college|scholengemeenschap/.test(n)) return 'vo';
  return '';
}
// "Ma t/m do 9:00-13:00", "Di en do 14:00-17:00", "woensdagmiddag" → de gevraagde dagdelen [[isoDag, dagdeel], …]; niet herkend = geen eis op beschikbaarheid
function roosterUitTekst(tekst) {
  var s = klein(tekst || '').replace(/\./g, ':').replace(/\s+/g, ' ').trim(), uit = { herkend: false, dagdelen: [], tekst: tekst || '' };
  if (!s) return uit;
  var idx = function (w) { return ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].indexOf(String(w).slice(0, 2)) + 1; }, dagen = [], perDag = {}, m;
  if (/werkdag|elke dag|dagelijks|alle dagen/.test(s)) dagen = [1, 2, 3, 4, 5];
  var br = /\b(ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag) ?(?:t\/m|tot en met|-|–|tot) ?(ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/g;
  while ((m = br.exec(s))) { var a = idx(m[1]), b = idx(m[2]); for (var i = a; i <= b; i++) dagen.push(i); }
  var dagRe = /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)(ochtend|middag|avond)?\b/g;
  while ((m = dagRe.exec(s))) { var d = idx(m[1]); if (!d) continue; dagen.push(d); if (m[2]) (perDag[d] = perDag[d] || []).push(DAGDELEN.indexOf(m[2])); }
  dagen = uniek(dagen).sort(function (x, y) { return x - y; });
  if (!dagen.length) return uit;
  var tijd = /\b([01]?\d|2[0-3])(?::([0-5]\d))? ?(?:-|–|tot) ?([01]?\d|2[0-3])(?::([0-5]\d))?\b/.exec(s), delen = [];
  // ochtend tot 12:00, middag tot 18:00, avond daarna; een dienst die om 13:00 eindigt is een ochtenddienst
  if (tijd) { var van = Number(tijd[1]) + Number(tijd[2] || 0) / 60, tot = Number(tijd[3]) + Number(tijd[4] || 0) / 60; if (van < 12) delen.push(0); if (tot > 13 && van < 17.5) delen.push(1); if (tot > 18) delen.push(2); }
  else if (/ochtend|middag|avond/.test(s)) { if (/ochtend/.test(s)) delen.push(0); if (/middag/.test(s)) delen.push(1); if (/avond/.test(s)) delen.push(2); }
  else delen = [0, 1];  // een schooldag
  uit.herkend = true;
  dagen.forEach(function (dg) { (perDag[dg] && perDag[dg].length ? perDag[dg] : delen).forEach(function (x) { uit.dagdelen.push([dg, x]); }); });
  return uit;
}
function uren90Dagen() {
  var grens = isoWeekStr(plusDagen(-90)), per = {};  // v7.2: kalenderdagen
  lees('TalentUren').forEach(function (u) { if (String(u.week) < grens) return; var x = per[String(u.talentId)] = per[String(u.talentId)] || { diensten: 0, noShows: 0, late: 0, uren: 0 }; x.diensten += Number(u.diensten) || 0; x.noShows += Number(u.noShows) || 0; x.late += Number(u.lateAfmeldingen) || 0; x.uren += Number(u.uren) || 0; });
  return per;
}
function matchContext(v, t) {
  var school = t.schoolId ? vind('Scholen', t.schoolId) : null;
  return { school: school, schoolId: t.schoolId || '', functie: functieVanVacature(v), sector: school ? sectorVanSchool(school) : '', rooster: roosterUitTekst(v.dagen), vandaag: datumStr(new Date()), vMap: perId(lees('Vacatures')), tMap: perId(lees('Trajecten')), uren90: uren90Dagen(), profielWoorden: termen((v.profiel || '') + ' ' + (v.titel || '')) };
}
// Eén talent tegen één vacature: {uit: true, reden} of een scorekaart. De regels staan open in de uitleg; de score sluit nooit uit, de harde filters wel.
function matchVacature(v, tl, ctx, x) {
  x = x || leegTalentIndex();
  var naam = talentNaam(tl), uit = function (reden) { return { uit: true, talentId: tl.id, naam: naam, status: tl.status, reden: reden }; };
  if (tl.status !== 'actief') return uit('status ' + (tl.status || 'onbekend'));
  var relaties = x.scholen.filter(function (r) { return String(r.schoolId) === String(ctx.schoolId); }), nietMeer = relaties.filter(function (r) { return r.status === 'niet meer'; })[0];
  if (nietMeer) return uit(nietMeer.richting === 'talent' ? 'wil niet meer naar deze school' : 'de school wil deze persoon niet meer');
  if (tagsUit(tl.tags).map(klein).indexOf('niet-inzetten') >= 0) return uit('tag niet-inzetten');
  var functies = lijstUit(tl.functies).map(klein), sectoren = lijstUit(tl.sectoren).map(klein);
  if (ctx.functie && functies.length && functies.indexOf(ctx.functie) < 0 && !verwant(ctx.functie, functies)) return uit('functie past niet (' + functies.join(', ') + ')');
  if (ctx.sector && sectoren.length && sectoren.indexOf(ctx.sector) < 0) return uit('sector past niet (' + sectoren.join(', ') + ')');
  var raster = beschikbaarheidUit(tl.beschikbaarheid), heeftRaster = heeftBeschikbaarheid(raster), waarschuwingen = [];
  if (ctx.rooster.herkend && heeftRaster) for (var i = 0; i < ctx.rooster.dagdelen.length; i++) { var dd = ctx.rooster.dagdelen[i]; if (raster[DAGEN_KORT[dd[0] - 1]][dd[1]] === 0) return uit('niet beschikbaar op ' + DAGEN_KORT[dd[0] - 1] + ' ' + DAGDELEN[dd[1]]); }
  var start = v.start || ctx.vandaag, eind = v.eind || '9999-12-31';
  var afwezig = lijstUit(tl.uitzonderingen).filter(function (u) { return u.soort !== 'wel' && u.van <= start && (u.tot || u.van) >= start; })[0];
  if (afwezig) return uit('afwezig rond de start (' + afwezig.van + (afwezig.tot && afwezig.tot !== afwezig.van ? ' – ' + afwezig.tot : '') + ')');
  var dubbel = x.kandidaten.filter(function (k) {
    if (!kandidaatGevuld(k) || String(k.vacatureId) === String(v.id)) return false;
    var kv = ctx.vMap[k.vacatureId] || {}, ks = k.start || kv.start || ctx.vandaag, ke = k.eind || kv.eind || '9999-12-31';
    if (ke < start || ks > eind) return false;
    var r2 = roosterUitTekst(k.dagen || kv.dagen);
    if (!ctx.rooster.herkend || !r2.herkend) { waarschuwingen.push('al ingezet bij ' + ((ctx.tMap[k.trajectId] || {}).school || 'een andere school') + ' in dezelfde periode; roosters niet te vergelijken'); return false; }
    return r2.dagdelen.some(function (p) { return ctx.rooster.dagdelen.some(function (q) { return p[0] === q[0] && p[1] === q[1]; }); });
  })[0];
  if (dubbel) return uit('al geplaatst in die tijd bij ' + ((ctx.tMap[dubbel.trajectId] || {}).school || 'een andere school'));
  var afstand = afstandKm(tl, ctx.school);
  if (afstand !== null && Number(tl.reisafstandKm) && afstand > Number(tl.reisafstandKm)) return uit('te ver (' + Math.round(afstand) + ' km, reist tot ' + Number(tl.reisafstandKm) + ' km)');
  if (afstand === null) waarschuwingen.push(ctx.school && Number(ctx.school.lat) ? 'ligging van het talent onbekend (postcode?)' : 'ligging van de school onbekend');
  var onderdelen = [], score = 0, zet = function (n, punten, max, uitleg) { punten = Math.max(0, Math.min(max, Math.round(punten))); onderdelen.push({ naam: n, punten: punten, max: max, uitleg: uitleg }); score += punten; };
  var vakken = lijstUit(tl.vakken).map(klein), overlap = vakken.filter(function (vk) { return ctx.profielWoorden.some(function (w) { return w.indexOf(vk) >= 0 || vk.indexOf(w) >= 0; }); });
  if (!ctx.functie) zet('rol', 10, 25, 'functie van de vacature niet herkend');
  else if (functies.indexOf(ctx.functie) >= 0) zet('rol', 20 + (overlap.length ? 5 : 0), 25, 'functie ' + ctx.functie + (overlap.length ? ', vakken ' + overlap.join(', ') : ''));
  else if (!functies.length) zet('rol', 10, 25, 'geen functies op het profiel');
  else zet('rol', 12, 25, 'verwante functie (' + functies.join(', ') + ')');
  var favoriet = relaties.some(function (r) { return r.status === 'favoriet'; });
  var eerder = x.kandidaten.filter(function (k) { var tr = ctx.tMap[k.trajectId]; return tr && String(tr.schoolId) === String(ctx.schoolId) && String(k.vacatureId) !== String(v.id) && (kandidaatGevuld(k) || KANDIDAAT_VOORBIJ.indexOf(k.status) >= 0); });
  var negatief = x.beoordelingen.some(function (b) { return String(b.schoolId) === String(ctx.schoolId) && b.oordeel === 'niet geschikt'; }), vastGezicht = !favoriet && eerder.length > 0 && !negatief;
  if (favoriet) zet('relatie met de school', 20, 20, 'favoriet van ' + (ctx.school ? ctx.school.naam : 'de school'));
  else if (vastGezicht) zet('relatie met de school', 14, 20, 'eerder ingezet op deze school (vast gezicht)');
  else if (eerder.length) zet('relatie met de school', 4, 20, 'eerder ingezet, maar daar als niet geschikt beoordeeld');
  else zet('relatie met de school', 8, 20, 'nog niet eerder op deze school');
  var bevestigd = tl.beschikbaarheidBevestigd ? dagenSinds(tl.beschikbaarheidBevestigd) : null, vers = bevestigd !== null && bevestigd <= 56;
  if (!ctx.rooster.herkend) zet('beschikbaarheid', 9, 15, 'rooster van de vacature niet herkend' + (v.dagen ? ' ("' + v.dagen + '")' : ''));
  else if (!heeftRaster) zet('beschikbaarheid', 5, 15, 'geen beschikbaarheid op het profiel');
  else { var alleJa = ctx.rooster.dagdelen.every(function (q) { return raster[DAGEN_KORT[q[0] - 1]][q[1]] === 2; }); zet('beschikbaarheid', (alleJa ? 15 : 8) * (vers ? 1 : 0.6), 15, (alleJa ? 'beschikbaar op alle gevraagde dagdelen' : 'deels "liever niet"') + (vers ? ', bevestigd ' + bevestigd + ' dagen geleden' : ', niet recent bevestigd')); }
  if (afstand === null) zet('afstand', 7, 15, 'afstand onbekend'); else zet('afstand', afstand <= 10 ? 15 : afstand <= 20 ? 11 : afstand <= 35 ? 6 : 2, 15, Math.round(afstand) + ' km hemelsbreed');
  var u90 = ctx.uren90[String(tl.id)];
  if (!u90) zet('betrouwbaarheid', 6, 10, 'nog geen uren uit XPS'); else zet('betrouwbaarheid', 10 - 5 * u90.noShows - 2 * u90.late, 10, u90.diensten + ' diensten in 90 dagen, ' + u90.noShows + ' no-show, ' + u90.late + ' late afmelding' + (u90.late === 1 ? '' : 'en'));
  var beo = beoordelingSamenvatting(x.beoordelingen), vog = vogStatus(tl, x.docs), bp = !beo.aantal ? 5 : beo.laatste.oordeel === 'favoriet' ? 10 : beo.laatste.oordeel === 'goed' ? 7 : 0;
  bp -= vog.status === 'oranje' ? 2 : (vog.status === 'ontbreekt' || vog.status === 'verlopen') ? 4 : 0;
  zet('beoordeling en VOG', bp, 10, (beo.aantal ? 'laatste oordeel ' + beo.laatste.oordeel + ' (' + beo.aantal + ')' : 'nog niet beoordeeld') + ', VOG ' + vog.status);
  var urenOk = !Number(v.urenPerWeek) || !Number(tl.maxUrenWeek) || Number(tl.maxUrenWeek) >= Number(v.urenPerWeek), vanafOk = !tl.beschikbaarVanaf || !v.start || tl.beschikbaarVanaf <= v.start;
  zet('voorkeur', urenOk && vanafOk ? 5 : 2, 5, (urenOk ? 'uren passen' : 'wil hoogstens ' + tl.maxUrenWeek + ' uur') + (vanafOk ? '' : ', pas beschikbaar vanaf ' + tl.beschikbaarVanaf));
  if (vog.status !== 'groen') waarschuwingen.push('VOG ' + vog.status + (vog.afgifte ? ' (afgifte ' + vog.afgifte + ')' : ''));
  if (bevestigd === null) waarschuwingen.push('beschikbaarheid nooit bevestigd'); else if (!vers) waarschuwingen.push('beschikbaarheid ' + bevestigd + ' dagen niet bevestigd');
  return { talentId: tl.id, naam: naam, score: Math.min(100, score), onderdelen: onderdelen, waarschuwingen: waarschuwingen, vog: vog.status, afstandKm: afstand === null ? null : Math.round(afstand), vastGezicht: vastGezicht || favoriet,
    alVoorgedragen: x.kandidaten.some(function (k) { return String(k.vacatureId) === String(v.id); }), functies: functies, woonplaats: tl.woonplaats || '', beschikbaarheidBevestigd: tl.beschikbaarheidBevestigd || '', beoordeling: beo };
}
function apiMatch(vacatureId) {
  var v = vind('Vacatures', vacatureId); if (!v) throw new Error('Vacature niet gevonden.');
  var t = vind('Trajecten', v.trajectId); if (!t) throw new Error('Project niet gevonden.');
  eis('kandidaten', 'wijzigen', t);
  if (niveau('talenten', 'zien') !== 'alles') throw new Error('Voorstellen uit het talentbestand doet het talentteam.');
  var ctx = matchContext(v, t), idx = talentIndex(), kandidaten = [], uitgesloten = [];
  lees('Talenten').forEach(function (tl) {
    if (tl.status === 'uitgeschreven') return;
    var r = matchVacature(v, tl, ctx, idx.per[String(tl.id)]);
    if (r.uit) uitgesloten.push(r); else kandidaten.push(r);
  });
  kandidaten.sort(function (a, b) { return b.score - a.score || (b.vastGezicht ? 1 : 0) - (a.vastGezicht ? 1 : 0) || (a.afstandKm === null ? 999 : a.afstandKm) - (b.afstandKm === null ? 999 : b.afstandKm); });
  return { vacature: vacatureUit(v, lees('Kandidaten'), false), project: { id: t.id, school: t.school, schoolId: t.schoolId || '', traject: t.traject }, functie: ctx.functie, sector: ctx.sector, roosterHerkend: ctx.rooster.herkend,
    dagdelen: ctx.rooster.dagdelen.map(function (d) { return DAGEN_KORT[d[0] - 1] + ' ' + DAGDELEN[d[1]]; }), kandidaten: kandidaten.slice(0, 25), totaal: kandidaten.length, uitgesloten: uitgesloten.slice(0, 40) };
}
// Gekozen talenten als kandidaat voordragen voor een vacature (zoals apiKandidaatOpslaan, maar in één keer en met één melding aan de accountmanager)
function apiVoorstellen(vacatureId, talentIds, notitie) {
  var v = vind('Vacatures', vacatureId); if (!v) throw new Error('Vacature niet gevonden.');
  var t = vind('Trajecten', v.trajectId); if (!t) throw new Error('Project niet gevonden.');
  eis('kandidaten', 'wijzigen', t);
  if (niveau('talenten', 'zien') !== 'alles') throw new Error('Voorstellen uit het talentbestand doet het talentteam.');
  if (v.status === 'concept') throw new Error(CONCEPT_FOUT);  // v6.4: matchen mag al, voordragen pas na bevestiging
  var ids = uniek([].concat(talentIds || []).map(String)); if (!ids.length) throw new Error('Kies minstens één talent.');
  var al = {}; lees('Kandidaten').forEach(function (k) { if (String(k.vacatureId) === String(v.id) && k.talentId) al[String(k.talentId)] = true; });
  var talenten = ids.map(function (id) { var tl = vind('Talenten', id); if (!tl) throw new Error('Talent niet gevonden.'); return tl; }).filter(function (tl) { return !al[String(tl.id)]; });
  notitie = String(notitie || '').trim().slice(0, 500);
  var namen = [];
  metLock(function () {
    talenten.forEach(function (tl) {
      var o = { vacatureId: v.id, trajectId: t.id, talentId: tl.id, naam: talentNaam(tl), email: tl.email || '', telefoon: tl.telefoon || '', xpsId: tl.xpsId || '', afasNummer: tl.afasNummer || '', bron: 'talentbestand', status: 'voorgesteld', statusSinds: nu(), statusHistorie: { voorgesteld: nu() },
        aangemaakt: nu(), door: ikNaam(), notitie: notitie, functie: v.titel || '', start: v.start || '', eind: v.eind || '', dagen: v.dagen || '', urenPerWeek: v.urenPerWeek || '' };
      kandidaatSchrijven(o, null, v, t, 'voorgesteld', true); namen.push(o.naam);
      zetTalentContact(tl.id, nu());
    });
    if (namen.length) meld(t.am, namen.length === 1 ? 'Nieuwe kandidaat voor ' + v.titel + ' bij ' + t.school + ': ' + namen[0] + '. Plan het matchinggesprek.' : namen.length + ' kandidaten voorgedragen voor ' + v.titel + ' bij ' + t.school + ': ' + namen.join(', ') + '. Plan de matchinggesprekken.', 'project:' + t.id);
  });
  var uit = projectBezetting(vind('Trajecten', t.id)); uit.aantal = namen.length; uit.overgeslagen = ids.length - namen.length;
  return uit;
}

/* ----- Weekuren uit XPS (export in de Drive-map XPS-export; CSV, Google Sheet of Excel via de Drive API) ----- */

var XPS_KOLOMMEN_STANDAARD = { xpsId: ['accountnummer', 'account nr', 'accountnr', 'medewerkernummer', 'medewerker nr', 'account id', 'accountid', 'nummer'], email: ['e-mail', 'email', 'e-mailadres'], naam: ['naam', 'medewerker', 'account'],
  project: ['projectnummer', 'project nr', 'project', 'projectnaam'], week: ['week', 'weeknummer'], datum: ['datum', 'dag'], uren: ['uren', 'klokuren', 'aantal uren', 'gewerkt'], status: ['status'], noShow: ['no-show', 'no show', 'noshow', 'niet verschenen'], laat: ['late afmelding', 'laat afgemeld', 'afgemeld'] };
function xpsKolommen() { var eigen = instelling('xpsKolommen'), uit = {}; Object.keys(XPS_KOLOMMEN_STANDAARD).forEach(function (k) { uit[k] = XPS_KOLOMMEN_STANDAARD[k].slice(); }); if (eigen && typeof eigen === 'object') Object.keys(eigen).forEach(function (k) { uit[k] = [].concat(eigen[k]).map(klein); }); return uit; }
function kolomIndex(kop, namen) {
  var k = kop.map(klein);
  for (var i = 0; i < namen.length; i++) { var j = k.indexOf(klein(namen[i])); if (j >= 0) return j; }
  for (var i2 = 0; i2 < namen.length; i2++) for (var j2 = 0; j2 < k.length; j2++) if (k[j2].indexOf(klein(namen[i2])) >= 0) return j2;
  return -1;
}
function waar(v) { return v === true || /^(ja|yes|true|1|x)$/i.test(String(v || '').trim()); }
function parseDatumNl(s) { var m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(String(s || '').trim()); return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : null; }
function weekUit(w, datum) {
  var s = String(w || '').trim(), m;
  if ((m = /^(\d{4})-?W?(\d{1,2})$/i.exec(s))) return m[1] + '-W' + ('0' + Number(m[2])).slice(-2);
  if ((m = /^(\d{1,2})$/.exec(s))) return new Date().getFullYear() + '-W' + ('0' + Number(m[1])).slice(-2);
  var d = datum instanceof Date ? datum : (parseDatum(String(datum || '').slice(0, 10)) || parseDatumNl(datum));
  return d ? isoWeekStr(d) : '';
}
// Rijen (eerste rij = kop) → weekaggregaten per talent, week en project. Zuiver (geen Sheet), dus los te testen.
function urenUitRijen(rijen, talenten) {
  if (!rijen || rijen.length < 2) return { regels: [], onbekend: [], aantalRegels: 0 };
  var kop = rijen[0].map(String), M = xpsKolommen(), c = {}; Object.keys(M).forEach(function (k) { c[k] = kolomIndex(kop, M[k]); });
  if (c.uren < 0 && c.status < 0) throw new Error('Geen kolom met uren of status gevonden; stel xpsKolommen in (Instellingen) of controleer de export.');
  var perXps = {}, perEmail = {}; talenten.forEach(function (t) { if (t.xpsId) perXps[klein(t.xpsId)] = t; if (t.email) perEmail[klein(t.email)] = t; });
  var agg = {}, onbekend = {}, n = 0, cel = function (r, k) { return c[k] >= 0 ? r[c[k]] : ''; };
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i]; if (!r || !r.some(function (x) { return x !== '' && x != null; })) continue; n++;
    var xps = klein(cel(r, 'xpsId')), email = klein(cel(r, 'email')), t = (xps && perXps[xps]) || (email && perEmail[email]) || null;
    if (!t) { var sleutel = xps || email || klein(cel(r, 'naam')); if (sleutel) onbekend[sleutel] = { xpsId: xps, email: email, naam: String(cel(r, 'naam') || '') }; continue; }
    var week = weekUit(cel(r, 'week'), cel(r, 'datum')); if (!week) continue;
    var project = String(cel(r, 'project') || '').trim(), key = t.id + '|' + week + '|' + project, a = agg[key] = agg[key] || { id: slug(key), talentId: t.id, xpsId: t.xpsId || xps, xpsProject: project, week: week, uren: 0, diensten: 0, noShows: 0, lateAfmeldingen: 0 };
    var status = klein(cel(r, 'status')), uren = Number(String(cel(r, 'uren') || '0').replace(',', '.')) || 0;
    if (/no.?show|niet verschenen/.test(status) || waar(cel(r, 'noShow'))) a.noShows++;
    else if (/laat|late|afmeld|afgemeld/.test(status) || waar(cel(r, 'laat'))) a.lateAfmeldingen++;
    else { a.diensten++; a.uren += uren; }
  }
  return { regels: Object.keys(agg).map(function (k) { var a = agg[k]; a.uren = Math.round(a.uren * 100) / 100; return a; }), onbekend: Object.keys(onbekend).map(function (k) { return onbekend[k]; }), aantalRegels: n };
}
function rijenVanBestand(f) {
  var mime = f.getMimeType(), naam = klein(f.getName());
  try {
    if (mime === MimeType.CSV || mime === MimeType.PLAIN_TEXT || /\.(csv|txt)$/.test(naam)) { var tekst = f.getBlob().getDataAsString('UTF-8').replace(/^﻿/, ''); return Utilities.parseCsv(tekst, (tekst.split('\n')[0] || '').indexOf(';') >= 0 ? ';' : ','); }
    if (mime === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId()).getSheets()[0].getDataRange().getValues();
    if (/spreadsheetml|ms-excel/.test(mime) || /\.xlsx?$/.test(naam)) {  // Excel: via de Drive API omzetten naar een Google Sheet (Services → Drive API), daarna weer weg
      if (typeof Drive === 'undefined') return null;
      var kopie = Drive.Files.create ? Drive.Files.copy({ name: 'tmp-athena-' + f.getName(), mimeType: MimeType.GOOGLE_SHEETS }, f.getId()) : Drive.Files.copy({ title: 'tmp-athena-' + f.getName(), mimeType: MimeType.GOOGLE_SHEETS }, f.getId());
      try { return SpreadsheetApp.openById(kopie.id).getSheets()[0].getDataRange().getValues(); } finally { try { DriveApp.getFileById(kopie.id).setTrashed(true); } catch (e) {} }
    }
  } catch (e) { Logger.log('Export ' + f.getName() + ' niet gelezen: ' + e); }
  return null;
}
// Een kandidaat die klaar voor start staat en in de uren van zijn project voorkomt, staat echt op de werkvloer: geplaatst (altijd binnen metLock)
function plaatsingenUitUren(regels) {
  var per = {}; regels.forEach(function (a) { if (a.trajectId && a.diensten > 0) per[a.talentId + '|' + a.trajectId] = true; });
  var wijz = lees('Kandidaten').filter(function (k) { return k.talentId && k.status === KANDIDAAT_KLAAR && per[k.talentId + '|' + k.trajectId]; }).map(function (k) { var h = kandidaatHistorie(k); h.geplaatst = h.geplaatst || nu(); return { id: k.id, status: 'geplaatst', statusSinds: nu(), statusHistorie: h }; });
  if (wijz.length) schrijfVeel('Kandidaten', wijz);
  return wijz.length;
}
function urenImport() {
  var map = xpsExportMap(), sinds = P.getProperty('LAATSTE_URENIMPORT') || '', talenten = lees('Talenten'), stats = { bestanden: 0, regels: 0, weken: 0, onbekend: [], kandidatenBijgewerkt: 0, overgeslagen: [] }, alle = [];
  var it = map.getFiles();
  while (it.hasNext()) {
    var f = it.next(); if (sinds && datumTijdStr(f.getLastUpdated()) <= sinds) continue;
    var rijen = rijenVanBestand(f);
    if (!rijen) { stats.overgeslagen.push(f.getName()); continue; }
    var r = urenUitRijen(rijen, talenten); stats.bestanden++; stats.regels += r.aantalRegels; alle = alle.concat(r.regels);
    r.onbekend.forEach(function (o) { if (!stats.onbekend.some(function (x) { return x.xpsId === o.xpsId && x.email === o.email && x.naam === o.naam; })) stats.onbekend.push(o); });
  }
  if (alle.length) metLock(function () {
    var tMap = {}; lees('Trajecten').forEach(function (t) { if (t.xpsProject) tMap[klein(t.xpsProject)] = t; });
    alle.forEach(function (a) { var t = tMap[klein(a.xpsProject)]; a.trajectId = t ? t.id : ''; a.geimporteerd = nu(); });
    schrijfVeel('TalentUren', alle);
    stats.kandidatenBijgewerkt = plaatsingenUitUren(alle);
  });
  stats.weken = uniek(alle.map(function (a) { return a.week; })).length;
  P.setProperty('LAATSTE_URENIMPORT', nu());
  return stats;
}
function apiTalentUrenImport() { if (niveau('talenten', 'wijzigen') !== 'alles') throw new Error('Daar heb je geen toegang toe.'); return urenImport(); }
function talentUrenTrigger() { try { urenImport(); } catch (e) { Logger.log('Urenimport mislukt: ' + e); } }

/* ----- Rapport talentnetwerk ----- */

function apiTalentRapport(preset, stap) {
  if (niveau('talenten', 'zien') !== 'alles') throw new Error('Daar heb je geen toegang toe.');
  preset = DOEL_PERIODES.indexOf(preset) >= 0 ? preset : 'maand';
  var B = periodeBereik(preset, stap), V = vergelijkBereik(preset, B), idx = talentIndex(), talenten = lees('Talenten'), functies = keuzelijst('talentFuncties'), sectoren = keuzelijst('sectoren');
  var inP = function (s, Pb) { var d = String(s || '').slice(0, 10); return !!d && d >= Pb.van && d <= Pb.tot; };
  var actief = talenten.filter(function (t) { return t.status === 'actief'; }), pool = {};
  TALENT_STATUSSEN.forEach(function (s) { pool[s] = talenten.filter(function (t) { return (t.status || 'aangemeld') === s; }).length; });
  var vogGroen = actief.filter(function (t) { return vogStatus(t, (idx.per[String(t.id)] || leegTalentIndex()).docs).status === 'groen'; }).length;
  // dekking: per functie × dagdeel het aantal actieve talenten dat op minstens één werkdag beschikbaar is in dat dagdeel (ja of liever niet)
  var dekking = functies.map(function (f) {
    var rij = { functie: f, totaal: 0, dagdelen: [0, 0, 0] };
    actief.forEach(function (t) { if (lijstUit(t.functies).map(klein).indexOf(f) < 0) return; rij.totaal++; var r = beschikbaarheidUit(t.beschikbaarheid); DAGDELEN.forEach(function (x, i) { if (DAGEN_KORT.slice(0, 5).some(function (d) { return r[d][i] > 0; })) rij.dagdelen[i]++; }); });
    return rij;
  });
  var perSector = sectoren.map(function (s) { return { sector: s, aantal: actief.filter(function (t) { return lijstUit(t.sectoren).map(klein).indexOf(s) >= 0; }).length }; });
  var kands = lees('Kandidaten'), beoordelingen = lees('Beoordelingen');
  var tel = function (Pb) {
    var plaats = kands.filter(function (k) { var h = kandidaatHistorie(k); return h.geplaatst && inP(h.geplaatst, Pb); }).length;
    var beo = beoordelingen.filter(function (b) { return inP(b.datum, Pb) && OORDEEL_PUNTEN[b.oordeel]; });
    var reactie = talenten.filter(function (t) { return t.laatstePeiling && t.beschikbaarheidBevestigd && String(t.beschikbaarheidBevestigd) >= String(t.laatstePeiling) && inP(t.beschikbaarheidBevestigd, Pb); }).map(function (t) { return dagenTussen(t.laatstePeiling, t.beschikbaarheidBevestigd); }).filter(function (x) { return x !== null; });
    return { aanmeldingen: talenten.filter(function (t) { return inP(t.aangemaakt, Pb); }).length, gescreend: talenten.filter(function (t) { return inP(t.statusSinds, Pb) && ['gescreend', 'actief'].indexOf(t.status) >= 0; }).length,
      voordrachten: kands.filter(function (k) { return k.talentId && inP(k.aangemaakt, Pb); }).length, plaatsingen: plaats, beoordelingen: beo.length,
      beoordelingGem: beo.length ? Math.round(10 * beo.reduce(function (s, b) { return s + OORDEEL_PUNTEN[b.oordeel]; }, 0) / beo.length) / 10 : null,
      reactiePeiling: reactie.length ? Math.round(reactie.reduce(function (s, x) { return s + x; }, 0) / reactie.length) : null };
  };
  var reeks = []; for (var i = (RAPPORT_REEKS[preset] || 6) - 1; i > 0; i--) reeks.push(periodeBereik(preset, B.stap - i)); reeks.push(B);
  var nuC = tel(B), reeksC = reeks.map(function (r) { return r === B ? nuC : tel(r); });
  return { preset: preset, stap: B.stap, van: B.van, tot: B.tot, label: B.label, lopend: B.lopend, vergelijk: { label: V.label, kort: V.kort, cijfers: tel(V) }, cijfers: nuC, reeksLabels: reeks.map(function (r) { return r.kort; }),
    reeks: { aanmeldingen: reeksC.map(function (c) { return c.aanmeldingen; }), voordrachten: reeksC.map(function (c) { return c.voordrachten; }), plaatsingen: reeksC.map(function (c) { return c.plaatsingen; }) },
    pool: pool, actief: actief.length, vogGroen: vogGroen, vogCompliance: actief.length ? Math.round(100 * vogGroen / actief.length) : null, compleet: talenten.filter(function (t) { return t.status !== 'uitgeschreven' && compleetheid(t).procent >= 80; }).length,
    dekking: dekking, perSector: perSector, dagdelen: DAGDELEN };
}

/* ----- Inzage, anonimiseren, verwijderen (AVG) ----- */

function apiTalentExport(id) {
  alleenBeheerder();
  var t = vind('Talenten', id); if (!t) throw new Error('Talent niet gevonden.');
  var d = apiTalent(id), tekst = JSON.stringify({ profiel: d.talent, documenten: d.documenten, beoordelingen: d.beoordelingen, relatiesMetScholen: d.scholen, plaatsingen: d.plaatsingen, uren: urenVan(t.id, 500), tijdlijn: d.tijdlijn, gemaakt: nu(), door: ikNaam() }, null, 2);
  metLock(function () { schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: 'Inzage-export gemaakt door ' + ikNaam() }); });
  return { bestandsnaam: 'inzage-' + slug(talentNaam(t)) + '-' + datumStr(new Date()) + '.json', tekst: tekst };
}
function apiTalentAnonimiseer(id) {
  alleenBeheerder();
  var t = vind('Talenten', id); if (!t) throw new Error('Talent niet gevonden.');
  metLock(function () { anonimiseerTalent(t, 'op verzoek, door ' + ikNaam()); });
  return talentUit(vind('Talenten', id), false);
}
// Persoonsgegevens weg, de gebeurtenissen (plaatsingen, uren, beoordelingen zonder naam) blijven voor de cijfers (altijd binnen metLock)
function anonimiseerTalent(t, reden) {
  var docs = lees('TalentDocumenten').filter(function (d) { return String(d.talentId) === String(t.id); });
  docs.forEach(function (d) { if (d.driveId) { try { DriveApp.getFileById(d.driveId).setTrashed(true); } catch (e) {} } });
  if (docs.length) verwijderRijen('TalentDocumenten', function (d) { return String(d.talentId) === String(t.id); });
  try { var map = talentSubmapAls(t.id); if (map) map.setTrashed(true); } catch (e2) {}
  schrijf('Talenten', { id: t.id, voornaam: 'Verwijderd', achternaam: 'profiel', email: '', telefoon: '', postcode: '', woonplaats: '', lat: '', lon: '', opleiding: '', bevoegdheid: '', notitie: '', tags: '', velden: '', xpsId: '', afasNummer: '',
    portaalToken: '', portaalTokenTot: '', beschikbaarheid: '', uitzonderingen: '', status: 'uitgeschreven', statusSinds: nu(), bewarenTot: '' });
  var kands = lees('Kandidaten').filter(function (k) { return String(k.talentId) === String(t.id); });
  if (kands.length) schrijfVeel('Kandidaten', kands.map(function (k) { return { id: k.id, naam: 'Verwijderd profiel', email: '', telefoon: '', notitie: '' }; }));
  var acts = lees('Activiteiten').filter(function (a) { return String(a.talentId) === String(t.id) && a.tekst; });
  if (acts.length) schrijfVeel('Activiteiten', acts.map(function (a) { return { id: a.id, tekst: '' }; }));  // vrije tekst over de persoon weg; de gebeurtenis zelf blijft
  schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: 'Profiel geanonimiseerd (' + reden + ')' });
}
function verwijderTalentRij(soort, tab, r) {
  if (soort === 'talent') { alleenBeheerder(); if (lees('Kandidaten').some(function (k) { return String(k.talentId) === String(r.id); })) throw new Error('Dit talent heeft voordrachten of plaatsingen. Anonimiseer het profiel in plaats van het te verwijderen.'); }
  else if (soort === 'beoordeling') { if (!(isBeheerder() || r.door === ikNaam() || niveau('beoordelingen', 'wijzigen') === 'alles')) throw new Error('Alleen wie de beoordeling gaf, het talentteam of het management kan haar verwijderen.'); }
  else if (niveau('talenten', 'wijzigen') !== 'alles') throw new Error('Daar heb je geen toegang toe.');
  if (soort === 'talentdocument' && r.driveId) { try { DriveApp.getFileById(r.driveId).setTrashed(true); } catch (e) {} }
  if (soort === 'talent') { try { var map = talentSubmapAls(r.id); if (map) map.setTrashed(true); } catch (e2) {} }
  metLock(function () {
    verwijderRijen(tab, function (x) { return String(x.id) === String(r.id); });
    if (soort === 'talent') ['TalentDocumenten', 'TalentSchool', 'Beoordelingen', 'TalentUren'].forEach(function (tb) { verwijderRijen(tb, function (x) { return String(x.talentId) === String(r.id); }); });
    else if (r.talentId) schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), talentId: r.talentId, bron: 'app', aangemaakt: nu(), onderwerp: soort === 'beoordeling' ? 'Beoordeling verwijderd' : soort === 'talentdocument' ? 'Document verwijderd: ' + (r.soort || '') : 'Relatie met school verwijderd' });
  });
  return null;
}

/* ----- Dagelijkse run: VOG, peiling, slapend, bewaartermijn, geocoderen, aanmeldingen ----- */

function talentDagelijksTrigger() {
  var start = Date.now(), stappen = [['vog', vogRun], ['peiling', peilingRun], ['slapend', slapendRun], ['bewaartermijn', bewaartermijnRun], ['geocoderen', geocodeerRun], ['aanmeldingen', aanmeldingenRun]], uit = {};
  stappen.forEach(function (s) {
    if (Date.now() - start > 4 * 60000) { uit[s[0]] = 'overgeslagen (tijd)'; return; }  // hooguit 4 minuten per run (limiet 6)
    try { uit[s[0]] = s[1](); } catch (e) { uit[s[0]] = 'fout: ' + ((e && e.message) || e); Logger.log('Talentrun ' + s[0] + ' mislukt: ' + e); }
  });
  Logger.log('Talentrun: ' + JSON.stringify(uit));
  return uit;
}
function apiTalentRunNu() { alleenBeheerder(); return talentDagelijksTrigger(); }  // dezelfde stappen, met de hand (Beheer)
function nieuwToken() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); }
function portaalTokenVoor(t) {
  if (t.portaalToken && t.portaalTokenTot && String(t.portaalTokenTot) > datumTijdStr(new Date(Date.now() + 7 * 86400000))) return { token: t.portaalToken, tot: t.portaalTokenTot };
  return { token: nieuwToken(), tot: datumTijdStr(new Date(Date.now() + 90 * 86400000)) };
}
function execUrl() { var u = P.getProperty('EXEC_URL'); if (u) return u; try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }
function portaalLink(token, actie) { return appUrl() + '?t=' + encodeURIComponent(token) + (actie ? '&actie=' + actie : '') + '&api=' + encodeURIComponent(execUrl()); }
// 1 mei en 1 juni: wie volgend schooljaar geen VOG heeft die jong genoeg is krijgt een mail; het talentteam één verzameltaak. Idempotent via een scripteigenschap per run.
function vogRun(forceer) {
  var d = new Date(), md = ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  if (!forceer && md !== '05-01' && md !== '06-01') return 'niet vandaag (1 mei en 1 juni)';
  var sj = huidigSchooljaar(), volgend = (Number(sj.slice(0, 4)) + 1) + '-' + (Number(sj.slice(5)) + 1), sleutel = 'VOG_RUN_' + volgend + '_' + md;
  if (!forceer && P.getProperty(sleutel)) return 'al gedaan';
  var idx = talentIndex(), startVolgend = datumStr(schooljaarStart(volgend));
  var lijst = lees('Talenten').filter(function (t) {
    var x = idx.per[String(t.id)] || leegTalentIndex(), loopt = x.kandidaten.some(function (k) { return kandidaatGevuld(k) && (!k.eind || k.eind >= startVolgend); });
    return (t.status === 'actief' || loopt) && vogStatus(t, x.docs, volgend).status !== 'groen';
  });
  if (!lijst.length) { P.setProperty(sleutel, nu()); return 0; }
  metLock(function () {
    schrijfVeel('Activiteiten', lijst.map(function (t) { return { type: 'notitie', datum: nu(), door: ikNaam(), talentId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: 'VOG vernieuwen vóór schooljaar ' + volgend + (t.email ? ' (mail gestuurd)' : ' (geen e-mailadres)') }; }));
    schrijf('Acties', { tekst: 'VOG vernieuwen voor ' + lijst.length + ' talent' + (lijst.length === 1 ? '' : 'en') + ' vóór schooljaar ' + volgend, eigenaar: teamNamen('talent')[0] || P.getProperty('NAAM') || 'Menno', deadline: datumStr(new Date(d.getFullYear(), 6, 15)), prio: 'hoog', categorie: 'opvolgen', status: 'open', bron: 'bezetting', aangemaakt: nu(), notitie: lijst.map(talentNaam).join(', ').slice(0, 1500) });
    P.setProperty(sleutel, nu());
  });
  var n = 0; lijst.forEach(function (t) { if (t.email) { try { vogMail(t, volgend); n++; } catch (e) { Logger.log('VOG-mail ' + talentNaam(t) + ': ' + e); } } });
  return n;
}
// Beschikbaarheid langer dan peilingDagen (49) niet bevestigd en 14 dagen geen peiling: mail met "Klopt nog" en "Aanpassen" (max 50 per dag, binnen de mailquota)
function peilingRun() {
  var dagen = Number(instelling('peilingDagen')) || 49, grens = datumTijdStr(new Date(Date.now() - dagen * 86400000)), herhaal = datumTijdStr(new Date(Date.now() - 14 * 86400000));
  var lijst = lees('Talenten').filter(function (t) { return t.status === 'actief' && t.email && (!t.beschikbaarheidBevestigd || String(t.beschikbaarheidBevestigd) < grens) && (!t.laatstePeiling || String(t.laatstePeiling) < herhaal); }).slice(0, 50);
  if (!lijst.length) return 0;
  var tokens = lijst.map(portaalTokenVoor);
  metLock(function () { schrijfVeel('Talenten', lijst.map(function (t, i) { return { id: t.id, portaalToken: tokens[i].token, portaalTokenTot: tokens[i].tot, laatstePeiling: nu() }; })); });
  var n = 0; lijst.forEach(function (t, i) { try { peilingMail(t, tokens[i].token); n++; } catch (e) { Logger.log('Peiling ' + talentNaam(t) + ': ' + e); } });
  return n;
}
// Zes maanden geen inzet, contact of bevestiging: actief → slapend, met een heractivatiemail (één tik en het profiel staat weer op actief)
function slapendRun() {
  var grens = datumStr(plusDagen(-182)), idx = talentIndex();  // v7.2: kalenderdagen
  var lijst = lees('Talenten').filter(function (t) {
    if (t.status !== 'actief') return false;
    var x = idx.per[String(t.id)] || leegTalentIndex();
    var inzet = x.kandidaten.some(function (k) { return kandidaatGevuld(k) || kandidaatInProces(k) || (KANDIDAAT_VOORBIJ.indexOf(k.status) >= 0 && String(k.eind || k.statusSinds || '').slice(0, 10) >= grens); });
    var contact = [t.laatsteContact, t.beschikbaarheidBevestigd, t.statusSinds, t.aangemaakt].some(function (s) { return String(s || '').slice(0, 10) >= grens; });
    return !inzet && !contact;
  });
  if (!lijst.length) return 0;
  var tokens = lijst.map(portaalTokenVoor);
  metLock(function () {
    schrijfVeel('Talenten', lijst.map(function (t, i) { return { id: t.id, status: 'slapend', statusSinds: nu(), portaalToken: tokens[i].token, portaalTokenTot: tokens[i].tot }; }));
    schrijfVeel('Activiteiten', lijst.map(function (t) { return { type: 'fase', datum: nu(), door: ikNaam(), talentId: t.id, bron: 'app', aangemaakt: nu(), onderwerp: 'Status: actief → slapend (zes maanden geen inzet of contact)' }; }));
  });
  lijst.forEach(function (t, i) { if (t.email) { try { heractivatieMail(t, tokens[i].token); } catch (e) { Logger.log('Heractivatie ' + talentNaam(t) + ': ' + e); } } });
  return lijst.length;
}
// Bewaartermijn verstreken en geen lopende inzet of voordracht: anonimiseren
function bewaartermijnRun() {
  var vandaag = datumStr(new Date()), idx = talentIndex();
  var lijst = lees('Talenten').filter(function (t) {
    if (!t.bewarenTot || String(t.bewarenTot).slice(0, 10) >= vandaag || t.status === 'uitgeschreven') return false;
    var x = idx.per[String(t.id)] || leegTalentIndex(); return !x.kandidaten.some(function (k) { return kandidaatGevuld(k) || kandidaatInProces(k); });
  });
  if (!lijst.length) return 0;
  metLock(function () { lijst.forEach(function (t) { anonimiseerTalent(t, 'bewaartermijn verstreken'); }); });
  return lijst.length;
}
// Ligging van talenten (postcode) en scholen (adres) via de PDOK Locatieserver (gratis, zonder sleutel); een beperkt aantal per nacht
function geocodeerRun() {
  var wijzT = [], wijzS = [];
  lees('Talenten').filter(function (t) { return t.postcode && !Number(t.lat) && t.status !== 'uitgeschreven'; }).slice(0, 40).forEach(function (t) { var g = geocodeer(t.postcode); if (g) wijzT.push({ id: t.id, lat: g.lat, lon: g.lon }); });
  lees('Scholen').filter(function (s) { return !Number(s.lat) && (s.adres || s.plaats); }).slice(0, 10).forEach(function (s) { var g = pdok([s.adres, s.plaats].filter(Boolean).join(' ')); if (g) wijzS.push({ id: s.id, lat: g.lat, lon: g.lon }); });
  if (wijzT.length || wijzS.length) metLock(function () { if (wijzT.length) schrijfVeel('Talenten', wijzT); if (wijzS.length) schrijfVeel('Scholen', wijzS); });
  return wijzT.length + wijzS.length;
}
function geocodeer(postcode) { var pc = postcodeIn(postcode).replace(/\s/g, ''); return /^\d{4}[A-Z]{2}$/.test(pc) ? pdok('postcode:' + pc) : null; }
function pdok(q) {
  try {
    var r = UrlFetchApp.fetch('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=' + encodeURIComponent(q) + '&fl=centroide_ll&rows=1', { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    var d = JSON.parse(r.getContentText() || '{}'), doc = d.response && d.response.docs && d.response.docs[0], m = doc && /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc.centroide_ll);
    return m ? { lat: Math.round(Number(m[2]) * 10000) / 10000, lon: Math.round(Number(m[1]) * 10000) / 10000 } : null;
  } catch (e) { return null; }
}

/* ----- Aanmeldingen (Google Form of het tabblad Aanmeldingen) ----- */

function aanmeldingenRun() {
  var r = metLock(aanmeldingenVerwerken), n = 0;
  r.mails.forEach(function (m) { try { bevestigingsMail(m.t, m.token); n++; } catch (e) { Logger.log('Bevestiging ' + talentNaam(m.t) + ': ' + e); } });
  return r.nieuw + ' nieuw, ' + r.bestaand + ' bestaand, ' + n + ' mails';
}
function keuzeLijstLos(tekst, sleutel) { var lijst = keuzelijst(sleutel), t = klein(tekst); return lijst.filter(function (f) { return t.indexOf(f) >= 0 || t.indexOf(f.replace(/-/g, ' ')) >= 0; }); }
// "ma ochtend, di middag, woensdag" → raster (een dag zonder dagdeel = ochtend en middag)
function beschikbaarheidUitTekst(tekst) {
  var r = beschikbaarheidUit({}), s = klein(tekst); if (!s) return r;
  var dagRe = /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\b[^a-z]*(ochtend|middag|avond)?/g, m;
  while ((m = dagRe.exec(s))) { var d = DAGEN_KORT[['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].indexOf(m[1].slice(0, 2))]; if (!d) continue; if (m[2]) r[d][DAGDELEN.indexOf(m[2])] = 2; else { r[d][0] = 2; r[d][1] = 2; } }
  return r;
}
// Elke nog niet verwerkte rij wordt een profiel 'aangemeld' (of een notitie bij een bestaand profiel); kolommen worden op naam herkend, dus ook de vragen van het Google Form (altijd binnen metLock)
function aanmeldingenVerwerken() {
  var uit = { nieuw: 0, bestaand: 0, mails: [] }, ss = sheet();
  blad('Aanmeldingen');  // het tabblad voor handmatige aanmeldingen bestaat altijd
  var tabs = ss.getSheets().filter(function (b) { return /^(Aanmeldingen|Formulierreacties|Form Responses)/i.test(b.getName()); });
  var M = { tijdstempel: ['tijdstempel', 'timestamp'], voornaam: ['voornaam', 'first name'], achternaam: ['achternaam', 'last name', 'naam'], telefoon: ['telefoon', 'mobiel', '06'], email: ['e-mail', 'email', 'mail'], postcode: ['postcode'], functies: ['functie', 'rol', 'werk'], sector: ['sector', 'onderwijs'], beschikbaarheid: ['beschikbaar'], toestemming: ['toestemming', 'akkoord', 'privacy'], verwerkt: ['verwerkt'], talentId: ['talentid'] };
  tabs.forEach(function (b) {
    var laatste = b.getLastRow(); if (laatste < 2) return;
    var waarden = b.getRange(1, 1, laatste, Math.max(b.getLastColumn(), 1)).getValues(), kop = waarden[0].map(String), c = {};
    Object.keys(M).forEach(function (k) { c[k] = kolomIndex(kop, M[k]); });
    if (c.email < 0 && c.telefoon < 0) return;  // geen aanmeldingstabblad
    if (c.verwerkt < 0) { c.verwerkt = kop.length; b.getRange(1, c.verwerkt + 1).setValue('verwerkt'); kop.push('verwerkt'); }
    if (c.talentId < 0) { c.talentId = kop.length; b.getRange(1, c.talentId + 1).setValue('talentId'); kop.push('talentId'); }
    var cel = function (r, k) { return c[k] >= 0 && c[k] < r.length ? r[c[k]] : ''; };
    for (var i = 1; i < waarden.length; i++) {
      var r = waarden[i]; if (cel(r, 'verwerkt')) continue;
      var email = klein(cel(r, 'email')), tel = telefoonIn(cel(r, 'telefoon')); if (!email && !tel) continue;
      var voornaam = String(cel(r, 'voornaam') || '').trim(), achternaam = String(cel(r, 'achternaam') || '').trim();
      var bestaand = lees('Talenten').filter(function (t) { return t.status !== 'uitgeschreven' && ((email && klein(t.email) === email) || (tel && telefoonIn(t.telefoon) === tel)); })[0], talentId;
      if (bestaand) {
        talentId = bestaand.id; uit.bestaand++;
        schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: 'Formulier', talentId: talentId, bron: 'formulier', aangemaakt: nu(), onderwerp: 'Opnieuw aangemeld via het formulier' });
        meld(teamNamen('talent'), talentNaam(bestaand) + ' heeft zich opnieuw aangemeld via het formulier.', 'talent:' + talentId);
        if (bestaand.status === 'slapend') schrijf('Talenten', { id: talentId, status: 'actief', statusSinds: nu(), laatsteContact: datumStr(new Date()) });
      } else {
        var stempel = cel(r, 'tijdstempel'), toestemming = stempel instanceof Date ? datumStr(stempel) : (datumIn(String(stempel || '').slice(0, 10)) || datumStr(new Date())), tk = { token: nieuwToken(), tot: datumTijdStr(new Date(Date.now() + 90 * 86400000)) };
        var t = schrijf('Talenten', { voornaam: voornaam, achternaam: achternaam, email: email, telefoon: tel, postcode: postcodeIn(cel(r, 'postcode')), functies: keuzeLijstLos(cel(r, 'functies'), 'talentFuncties'), sectoren: keuzeLijstLos(cel(r, 'sector'), 'sectoren'),
          beschikbaarheid: beschikbaarheidUitTekst(cel(r, 'beschikbaarheid')), status: 'aangemeld', statusSinds: nu(), bron: 'website', toestemmingDatum: toestemming, toestemmingGrondslag: 'toestemming', bewarenTot: bewarenTotVan(toestemming),
          portaalToken: tk.token, portaalTokenTot: tk.tot, door: 'Formulier', aangemaakt: nu(), laatsteContact: toestemming });
        talentId = t.id; uit.nieuw++;
        schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: 'Formulier', talentId: talentId, bron: 'formulier', aangemaakt: nu(), onderwerp: 'Aangemeld via het formulier' + (cel(r, 'toestemming') ? ' (toestemming: ' + String(cel(r, 'toestemming')).slice(0, 60) + ')' : '') });
        meld(teamNamen('talent'), 'Nieuwe aanmelding: ' + talentNaam(t) + (lijstUit(t.functies).length ? ' (' + lijstUit(t.functies).join(', ') + ')' : ''), 'talent:' + talentId);
        if (email) uit.mails.push({ t: t, token: tk.token });
      }
      b.getRange(i + 1, c.verwerkt + 1).setValue(nu()); b.getRange(i + 1, c.talentId + 1).setValue(talentId);
    }
    vergeet(b.getName());
  });
  return uit;
}

/* ----- Portaal: bevestigen en aanpassen van de beschikbaarheid via een mail-link, zonder inlog ----- */

function portaalBudget(token) {  // 30 verzoeken per token per uur, 600 in totaal
  var cache = CacheService.getScriptCache(), k1 = 'athena-portaal-' + token.slice(0, 24), k2 = 'athena-portaal-alle', n1 = Number(cache.get(k1)) || 0, n2 = Number(cache.get(k2)) || 0;
  if (n1 >= 30 || n2 >= 600) throw new Error('Even te veel verzoeken. Probeer het over een uur opnieuw.');
  cache.put(k1, String(n1 + 1), 3600); cache.put(k2, String(n2 + 1), 3600);
}
function talentVanToken(token) {
  token = String(token || '').trim(); if (token.length < 20) throw new Error('Deze link is niet geldig.');
  var t = lees('Talenten').filter(function (x) { return x.portaalToken && String(x.portaalToken) === token; })[0];
  if (!t || !t.portaalTokenTot || String(t.portaalTokenTot) < nu()) throw new Error('Deze link is verlopen; vraag een nieuwe aan bij het talentteam.');
  return t;
}
function apiPortaalToon(token) {
  var t = talentVanToken(token);
  return { naam: t.voornaam || talentNaam(t), functies: lijstUit(t.functies), beschikbaarheid: beschikbaarheidUit(t.beschikbaarheid), uitzonderingen: lijstUit(t.uitzonderingen), beschikbaarheidBevestigd: t.beschikbaarheidBevestigd || '', bedrijf: huisstijl().bedrijf, dagen: DAGEN_KORT, dagdelen: DAGDELEN };
}
function apiPortaalBeschikbaarheid(token, raster, uitzonderingen, alleenBevestigen) {
  var t = talentVanToken(token), o = { id: t.id, beschikbaarheidBevestigd: nu(), laatsteContact: datumStr(new Date()) };
  alleenBevestigen = alleenBevestigen === true;  // v7.2: alleen een echte boolean bevestigt; een object of een verschoven argument maakt van aanpassen geen stil bevestigen
  if (raster !== undefined && raster !== null && typeof raster !== 'object') throw new Error('Geen beschikbaarheid.');  // v7.2: het raster is een object per dag, geen tekst
  if (!alleenBevestigen) { if (raster) o.beschikbaarheid = beschikbaarheidIn(raster); if (uitzonderingen !== undefined && uitzonderingen !== null) o.uitzonderingen = uitzonderingenIn(uitzonderingen); }
  if (t.status === 'slapend') { o.status = 'actief'; o.statusSinds = nu(); }
  metLock(function () {
    schrijf('Talenten', o);
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: 'Portaal', talentId: t.id, bron: 'portaal', aangemaakt: nu(), onderwerp: (alleenBevestigen ? 'Beschikbaarheid bevestigd via mail' : 'Beschikbaarheid aangepast via mail') + (o.status ? '; profiel weer actief' : '') });
  });
  return { ok: true, beschikbaarheidBevestigd: o.beschikbaarheidBevestigd, beschikbaarheid: o.beschikbaarheid || beschikbaarheidUit(t.beschikbaarheid), uitzonderingen: o.uitzonderingen || lijstUit(t.uitzonderingen), weerActief: !!o.status };
}

/* ----- Mails aan talenten (huisstijl) ----- */

function talentMail(t, onderwerp, kop, titel, tekst, knoppen) {
  var h = huisstijl();
  var knopHtml = (knoppen || []).map(function (k, i) { return '<a href="' + escHtml(k.url) + '" style="display:inline-block;margin:6px 8px 6px 0;padding:11px 18px;border-radius:10px;background:' + (i ? '#fff' : h.kleur_primair) + ';color:' + (i ? h.kleur_primair : '#fff') + ';border:1.5px solid ' + h.kleur_primair + ';font-weight:700;text-decoration:none">' + escHtml(k.tekst) + '</a>'; }).join('');
  var html = '<div style="font-family:' + h.lettertype_tekst + ',Arial,sans-serif;max-width:620px;margin:0 auto;color:' + h.kleur_tekst + '">' +
    '<div style="background:' + h.kleur_primair + ';color:#fff;padding:18px 22px;border-bottom:4px solid ' + h.kleur_accent + '"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">' + escHtml(h.bedrijf) + ' · ' + escHtml(kop) + '</div><div style="font-size:22px;font-weight:700;margin-top:4px">' + escHtml(titel) + '</div></div>' +
    '<div style="padding:18px 22px"><p style="font-size:15px;line-height:1.55">Hoi ' + escHtml(t.voornaam || talentNaam(t)) + ',</p>' + String(tekst).split('\n').map(function (a) { return '<p style="font-size:15px;line-height:1.55">' + escHtml(a) + '</p>'; }).join('') +
    (knopHtml ? '<div style="margin-top:14px">' + knopHtml + '</div>' : '') + '<p style="font-size:12px;color:#9A8FA0;margin-top:20px">Je krijgt deze mail omdat je in het talentbestand van ' + escHtml(h.bedrijf) + ' staat. Wil je dat niet meer? Antwoord dan op deze mail.</p></div></div>';
  var o = { to: t.email, subject: onderwerp, htmlBody: html, name: h.bedrijf }; if (P.getProperty('RAPPORT_EMAIL')) o.replyTo = P.getProperty('RAPPORT_EMAIL');
  MailApp.sendEmail(o);
}
function peilingMail(t, token) {
  talentMail(t, 'Klopt je beschikbaarheid nog?', 'beschikbaarheid', 'Klopt je beschikbaarheid nog?', 'We plannen de komende weken weer inzet op scholen. Klopt je beschikbaarheid nog zoals wij die hebben? Met één tik bevestig je; aanpassen kan ook.',
    [{ tekst: 'Klopt nog', url: portaalLink(token, 'bevestig') }, { tekst: 'Aanpassen', url: portaalLink(token, '') }]);
}
function vogMail(t, sj) {
  talentMail(t, 'Nieuwe VOG voor schooljaar ' + sj, 'VOG', 'Vraag een nieuwe VOG aan', 'Scholen vragen bij de start van een schooljaar een Verklaring Omtrent het Gedrag die niet ouder is dan zes maanden. Vraag daarom vóór de zomer een nieuwe VOG aan; wij sturen je de aanvraag toe als je dat wilt.\nStuur ons een scan of foto zodra je hem hebt.', []);
}
function heractivatieMail(t, token) {
  talentMail(t, 'Werk je nog graag met ons?', 'talentbestand', 'Werk je nog graag met ons?', 'We hebben een half jaar niets van je gehoord en zetten je profiel daarom op slapend. Wil je weer ingezet worden? Bevestig dan je beschikbaarheid; dan staat je profiel weer op actief.',
    [{ tekst: 'Ja, ik ben beschikbaar', url: portaalLink(token, '') }]);
}
function bevestigingsMail(t, token) {
  talentMail(t, 'Welkom bij ' + huisstijl().bedrijf, 'aanmelding', 'Je aanmelding is binnen', 'Dank voor je aanmelding. Het talentteam neemt binnenkort contact met je op voor een kennismaking.\nWil je alvast je beschikbaarheid per dagdeel doorgeven? Dat helpt ons bij het plannen.',
    [{ tekst: 'Beschikbaarheid doorgeven', url: portaalLink(token, '') }]);
}

/* ===================== 14. Financiën (v6.5): prognose, gefactureerd, ontvangen en geleverd per schooljaar, school, project en maand ===================== */
// Alle bedragen in centen (gehele getallen), zodat sommen exact kloppen; de app deelt door 100.
// Prognose = contractwaarde verdeeld volgens de facturatieafspraak (de termijnen als die er zijn, anders start/eind, vooraf/achteraf en vakanties).
// Gefactureerd = termijnen met een verzenddatum in de maand; ontvangen = met een betaaldatum in de maand; geleverd = uren uit XPS × tarief.
// Termijnen van vóór v6.5 hebben geen verzend- of betaaldatum: dan telt de termijndatum als schatting (en zegt de app dat).
var FIN_REEKSEN = ['prognose', 'prognoseKas', 'gefactureerd', 'ontvangen', 'geleverd'];
var EXACT_KOLOMMEN = { factuurnummer: 'Factuurnummer', datum: 'Factuurdatum', bedrag: 'Bedrag', betaald: 'Betaaldatum' };
// Laatste dag van elke maand van 'van' (eerste van een maand) t/m 'tot'; juli en augustus overslaan als de vakanties niet doorbetaald worden
function maandEinden(van, tot, zomerVrij) {
  var u = []; if (!van || !tot) return u;
  for (var d = new Date(van.getFullYear(), van.getMonth(), 1); d <= tot && u.length < 36; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
    if (!(zomerVrij && (d.getMonth() === 6 || d.getMonth() === 7))) u.push(datumStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
  return u;
}
function euroTekst(c) { return '€ ' + String(Math.round(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function centen(x) { var n = Number(String(x == null ? '' : x).replace(',', '.')); return isFinite(n) ? Math.round(n * 100) : 0; }
function maandVan(d) { return String(d || '').slice(0, 7); }
function plusDagenVan(datum, n) { var d = parseDatum(datum); if (!d) return ''; d.setDate(d.getDate() + n); return datumStr(d); }
function schooljaarMaanden(sj) { var j = Number(String(sj).slice(0, 4)), u = []; for (var i = 0; i < 12; i++) { var m = 7 + i; u.push((j + Math.floor(m / 12)) + '-' + ('0' + (m % 12 + 1)).slice(-2)); } return u; }  // augustus t/m juli
function standaardBetaaltermijn() { var n = Number(instelling('betaaltermijnDagen')); return n > 0 ? n : 30; }
// Verzend- en betaaldatum van een termijn; zonder datum (oude termijnen) de termijndatum als schatting
function verzondenVan(f) { if (f.verzonden) return { datum: datumIn(f.verzonden), geschat: false }; return ['verzonden', 'betaald'].indexOf(f.status) >= 0 && f.datum ? { datum: datumIn(f.datum), geschat: true } : null; }
function betaaldVan(f) { if (f.betaald) return { datum: datumIn(f.betaald), geschat: false }; if (f.status !== 'betaald') return null; var v = verzondenVan(f); return v ? { datum: v.datum, geschat: true } : null; }

// De facturatieafspraak van één project als posten {datum, bedrag in centen}; de som is altijd precies de contractwaarde (rest op de laatste post).
function prognoseVan(t, termijnen) {
  var contract = centen(t.contractwaarde || t.omzet), som = 0, posten = [], signalen = [], ongepland = 0, bron;
  if (termijnen.length) {
    bron = 'termijnen';
    termijnen.forEach(function (f) { var b = centen(f.bedrag); som += b; if (f.datum) posten.push({ datum: datumIn(f.datum), bedrag: b }); else ongepland += b; });
    if (!contract) { contract = som; signalen.push('geen contractwaarde: de termijnen tellen als contract'); }
    else if (som !== contract) {
      var rest = contract - som;
      posten.sort(function (a, b) { return a.datum.localeCompare(b.datum); });
      // te weinig ingepland: het restant over de maanden na de laatste termijn tot het einde van het project (zoals de afspraak), anders op de laatste termijn
      var na = rest > 0 && posten.length ? maandEinden(new Date(Number(posten[posten.length - 1].datum.slice(0, 4)), Number(posten[posten.length - 1].datum.slice(5, 7)), 1), parseDatum(t.eind), t.vakanties === 'niet doorbetaald') : [];
      if (na.length) { var stuk = Math.floor(rest / na.length); na.forEach(function (m, i) { posten.push({ datum: m, bedrag: i === na.length - 1 ? rest - stuk * (na.length - 1) : stuk }); }); }
      else if (posten.length) posten[posten.length - 1].bedrag += rest; else ongepland += rest;
      signalen.push(rest > 0 ? euroTekst(rest) + ' van het contract staat nog niet in termijnen' + (na.length ? '; verdeeld over de maanden tot het einde van het project' : '') : 'termijnen zijn ' + euroTekst(-rest) + ' hoger dan het contract (meerwerk?)');
    }
  } else if (contract) {
    bron = 'afspraak';
    var start = parseDatum(t.start), eind = parseDatum(t.eind) || (t.schooljaar ? new Date(Number(String(t.schooljaar).slice(5, 9)), 6, 31) : null);
    if (!start) { ongepland = contract; signalen.push('geen startdatum: de prognose is niet over maanden te verdelen'); }
    else if (t.soortFacturatie === 'vooraf') posten.push({ datum: datumIn(t.factuurDatum) || datumStr(start), bedrag: contract });  // ⚠️ vooraf = één factuur aan het begin
    else {
      if (!eind || eind < start) eind = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      var maanden = maandEinden(new Date(start.getFullYear(), start.getMonth(), 1), eind, t.vakanties === 'niet doorbetaald');
      if (!maanden.length) maanden.push(datumStr(start));
      var per = Math.floor(contract / maanden.length);
      maanden.forEach(function (m, i) { posten.push({ datum: m, bedrag: i === maanden.length - 1 ? contract - per * (maanden.length - 1) : per }); });
    }
  } else bron = 'geen';
  return { contract: contract, posten: posten, ongepland: ongepland, signalen: signalen, bron: bron };
}
// Uren uit XPS (TalentUren) × tarief, per maand (de maandag van de week bepaalt de maand)
function maandagVanWeek(w) {
  var m = /^(\d{4})-W(\d{2})$/.exec(String(w || '')); if (!m) return '';
  var jan4 = new Date(Number(m[1]), 0, 4, 12), ma = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86400000);
  return datumStr(new Date(ma.getTime() + (Number(m[2]) - 1) * 7 * 86400000));
}
function geleverdVan(t, uren) {
  var tarief = centen(t.tarief), u = {}; if (!tarief) return u;
  uren.forEach(function (r) { var m = maandVan(maandagVanWeek(r.week)); if (m) u[m] = (u[m] || 0) + Math.round((Number(r.uren) || 0) * tarief); });
  return u;
}
function leegReeks() { var r = {}; FIN_REEKSEN.concat(['prognoseToen']).forEach(function (k) { r[k] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }); return r; }
function telBij(doel, bron) { Object.keys(bron).forEach(function (k) { if (doel[k]) for (var i = 0; i < 12; i++) doel[k][i] += bron[k][i]; }); }

// Het hele financiële beeld van één project (alle schooljaren), los van rechten; apiFinancien en het bevriezen gebruiken het
function financienProject(t, termijnen, uren, termijnDagen) {
  var p = prognoseVan(t, termijnen), uit = { prognose: {}, prognoseKas: {}, gefactureerd: {}, ontvangen: {}, geleverd: geleverdVan(t, uren) };
  var bij = function (reeks, datum, bedrag) { var m = maandVan(datum); if (m) uit[reeks][m] = (uit[reeks][m] || 0) + bedrag; };
  p.posten.forEach(function (x) { bij('prognose', x.datum, x.bedrag); bij('prognoseKas', plusDagenVan(x.datum, termijnDagen), x.bedrag); });
  var gef = 0, ontv = 0, geschat = false, ouderdom = { '0-30': 0, '31-60': 0, '60+': 0 }, betaaltijden = [], vandaag = datumStr(new Date());
  termijnen.forEach(function (f) {
    var v = verzondenVan(f), b = betaaldVan(f), bedrag = centen(f.bedrag);
    if (v) { gef += bedrag; bij('gefactureerd', v.datum, bedrag); geschat = geschat || v.geschat; }
    if (b) { ontv += bedrag; bij('ontvangen', b.datum, bedrag); geschat = geschat || b.geschat; if (v && !b.geschat && !v.geschat) { var dt = dagenTussen(v.datum, b.datum); if (dt !== null && dt >= 0) betaaltijden.push(dt); } }
    if (v && !b) { var oud = dagenTussen(v.datum, vandaag) || 0; ouderdom[oud <= 30 ? '0-30' : oud <= 60 ? '31-60' : '60+'] += bedrag; }
  });
  return { per: uit, contract: p.contract, ongepland: p.ongepland, signalen: p.signalen, bron: p.bron, gefactureerd: gef, ontvangen: ontv, nogTeFactureren: p.contract - gef, openstaand: gef - ontv,
    ouderdom: ouderdom, betaaltijden: betaaltijden, geschat: geschat, prognosePosten: p.posten };
}
function financienData() {
  var fac = {}, uren = {};
  lees('Facturen').forEach(function (f) { (fac[f.trajectId] = fac[f.trajectId] || []).push(f); });
  lees('TalentUren').forEach(function (r) { if (r.trajectId) (uren[r.trajectId] = uren[r.trajectId] || []).push(r); });
  return { fac: fac, uren: uren, scholen: perId(lees('Scholen')), standaardDagen: standaardBetaaltermijn() };
}
function termijnDagenVan(t, D) { var s = D.scholen[t.schoolId]; var n = s && Number(s.betaaltermijn); return n > 0 ? n : D.standaardDagen; }

function apiFinancien(schooljaar) {
  eis('financien', 'zien');
  var sj = /^\d{4}-\d{4}$/.test(String(schooljaar || '')) ? schooljaar : huidigSchooljaar(), maanden = schooljaarMaanden(sj), D = financienData(), nuM = maandVan(datumStr(new Date()));
  var bevroren = {}; lees('Prognoses').forEach(function (r) { if (r.gemaakt === r.maand) bevroren[r.trajectId + '|' + r.maand] = Number(r.kas) || 0; });  // de prognose zoals die op de eerste van die maand was
  var sjs = {}, perSchool = {}, totaal = leegReeks(), tot = { contract: 0, gefactureerd: 0, ontvangen: 0, nogTeFactureren: 0, openstaand: 0, ouderdom: { '0-30': 0, '31-60': 0, '60+': 0 } }, betaaltijdenAlle = [], geschatAlle = false;
  lees('Trajecten').filter(function (t) { return mag('financien', 'zien', t); }).forEach(function (t) {
    if (t.schooljaar) sjs[t.schooljaar] = 1;
    var F = financienProject(t, D.fac[t.id] || [], D.uren[t.id] || [], termijnDagenVan(t, D)), r = leegReeks(), iets = false;
    maanden.forEach(function (m, i) {
      FIN_REEKSEN.forEach(function (k) { if (F.per[k][m]) { r[k][i] = F.per[k][m]; iets = true; } });
      if (m <= nuM && bevroren[t.id + '|' + m] !== undefined) r.prognoseToen[i] = bevroren[t.id + '|' + m];
    });
    if (!iets && t.schooljaar !== sj) return;
    var sleutel = t.schoolId || ('naam:' + klein(t.school)), s = perSchool[sleutel];
    if (!s) { var sc = D.scholen[t.schoolId]; s = perSchool[sleutel] = { schoolId: t.schoolId || '', naam: (sc && sc.naam) || t.school || '(zonder school)', betaaltermijn: termijnDagenVan(t, D), reeksen: leegReeks(), projecten: [],
      contract: 0, gefactureerd: 0, ontvangen: 0, nogTeFactureren: 0, openstaand: 0, ouderdom: { '0-30': 0, '31-60': 0, '60+': 0 }, betaaltijden: [], geschat: false }; }
    s.projecten.push({ id: t.id, traject: t.traject, schooljaar: t.schooljaar, status: t.status, am: t.am || '', adviseur: t.adviseur || '', soortFacturatie: t.soortFacturatie || '', bron: F.bron, reeksen: r,
      contract: F.contract, ongepland: F.ongepland, gefactureerd: F.gefactureerd, ontvangen: F.ontvangen, nogTeFactureren: F.nogTeFactureren, openstaand: F.openstaand, ouderdom: F.ouderdom, signalen: F.signalen, geschat: F.geschat,
      gemBetaaltijd: F.betaaltijden.length ? Math.round(F.betaaltijden.reduce(function (a, b) { return a + b; }, 0) / F.betaaltijden.length) : null });
    telBij(s.reeksen, r); telBij(totaal, r);
    ['contract', 'gefactureerd', 'ontvangen', 'nogTeFactureren', 'openstaand'].forEach(function (k) { s[k] += F[k]; tot[k] += F[k]; });
    Object.keys(F.ouderdom).forEach(function (k) { s.ouderdom[k] += F.ouderdom[k]; tot.ouderdom[k] += F.ouderdom[k]; });
    s.betaaltijden = s.betaaltijden.concat(F.betaaltijden); betaaltijdenAlle = betaaltijdenAlle.concat(F.betaaltijden); s.geschat = s.geschat || F.geschat; geschatAlle = geschatAlle || F.geschat;
  });
  var gem = function (l) { return l.length ? Math.round(l.reduce(function (a, b) { return a + b; }, 0) / l.length) : null; };
  var scholen = Object.keys(perSchool).map(function (k) { var s = perSchool[k]; s.gemBetaaltijd = gem(s.betaaltijden); delete s.betaaltijden; s.projecten.sort(function (a, b) { return String(a.traject).localeCompare(String(b.traject)); }); return s; })
    .sort(function (a, b) { return String(a.naam).localeCompare(String(b.naam)); });
  sjs[sj] = 1; sjs[huidigSchooljaar()] = 1;
  tot.gemBetaaltijd = gem(betaaltijdenAlle);
  return { schooljaar: sj, schooljaren: Object.keys(sjs).sort().reverse(), maanden: maanden, huidigeMaand: nuM, scholen: scholen, reeksen: totaal, totalen: tot, geschat: geschatAlle,
    standaardBetaaltermijn: D.standaardDagen, laatsteBevriezing: laatsteBevriezing(), exactKolommen: exactKolommen(), magImporteren: isBeheerder(), ik: ikUit() };
}
function laatsteBevriezing() { var l = ''; lees('Prognoses').forEach(function (r) { if (String(r.gemaakt) > l) l = String(r.gemaakt); }); return l; }

// Op de eerste van de maand: de prognose van dit moment vastleggen, zodat later te zien is hoe goed hij was. Idempotent per maand.
function financienBevriezen() {
  var m = maandVan(datumStr(new Date()));
  if (lees('Prognoses').some(function (r) { return r.gemaakt === m; })) return { maand: m, rijen: 0, al: true };
  var D = financienData(), rijen = [];
  lees('Trajecten').forEach(function (t) {
    var F = financienProject(t, D.fac[t.id] || [], D.uren[t.id] || [], termijnDagenVan(t, D)), ms = {};
    Object.keys(F.per.prognose).concat(Object.keys(F.per.prognoseKas)).forEach(function (x) { if (x >= m) ms[x] = 1; });
    Object.keys(ms).forEach(function (x) { rijen.push({ gemaakt: m, trajectId: t.id, maand: x, prognose: F.per.prognose[x] || 0, kas: F.per.prognoseKas[x] || 0 }); });
  });
  if (!rijen.length) rijen.push({ gemaakt: m, trajectId: '', maand: m, prognose: 0, kas: 0 });  // ook een lege maand telt als bevroren
  metLock(function () { schrijfVeel('Prognoses', rijen); });
  return { maand: m, rijen: rijen.length, al: false };
}
function financienTrigger() { GEBRUIKER = null; try { financienBevriezen(); } catch (e) { Logger.log('Prognose bevriezen mislukt: ' + e); } }
function apiFinancienBevriezen() { alleenBeheerder(); return financienBevriezen(); }

// Afstemming met Exact Online: een export van verkoopfacturen (csv) koppelt op factuurnummer en zet de verzend- en betaaldatum.
// Kolomnamen instelbaar (Instellingen exactKolommen), want het formaat van de export verschilt per administratie. ⚠️ Nog niet getest op een echte export.
function exactKolommen() { var k = instelling('exactKolommen'), u = {}; Object.keys(EXACT_KOLOMMEN).forEach(function (x) { u[x] = (k && k[x]) || EXACT_KOLOMMEN[x]; }); return u; }
function bedragIn(s) { s = String(s == null ? '' : s).replace(/[€\s]/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); var n = Number(s); return isFinite(n) ? Math.round(n * 100) : null; }
function datumUitExport(s) { s = String(s || '').trim(); var d = parseDatum(s) || parseDatumNl(s.replace(/\//g, '-')); return d ? datumStr(d) : ''; }
function apiExactImport(tekst, opties) {
  alleenBeheerder(); opties = opties || {};
  tekst = String(tekst || '').replace(/^﻿/, ''); if (!tekst.trim()) throw new Error('Het bestand is leeg.');
  if (tekst.length > 3 * 1024 * 1024) throw new Error('Het bestand is groter dan 3 MB; exporteer een kortere periode.');
  var kol = exactKolommen(); if (opties.kolommen && typeof opties.kolommen === 'object') Object.keys(EXACT_KOLOMMEN).forEach(function (x) { if (opties.kolommen[x]) kol[x] = String(opties.kolommen[x]).trim(); });
  var rijen = Utilities.parseCsv(tekst, (tekst.split('\n')[0] || '').indexOf(';') >= 0 ? ';' : ','), kop = (rijen[0] || []).map(function (h) { return String(h).trim(); });
  var idx = {}; Object.keys(kol).forEach(function (x) { idx[x] = kop.map(klein).indexOf(klein(kol[x])); });
  var mist = ['factuurnummer', 'datum', 'bedrag'].filter(function (x) { return idx[x] < 0; });
  if (mist.length) throw new Error('Kolom niet gevonden: ' + mist.map(function (x) { return kol[x]; }).join(', ') + '. Kolommen in het bestand: ' + kop.join(', ') + '. Pas de kolomnamen aan.');
  var exact = {}, datums = [];
  rijen.slice(1).forEach(function (r) {
    var nr = String(r[idx.factuurnummer] || '').trim(); if (!nr) return;
    var x = { nummer: nr, datum: datumUitExport(r[idx.datum]), bedrag: bedragIn(r[idx.bedrag]), betaald: idx.betaald >= 0 ? datumUitExport(r[idx.betaald]) : '' };
    if (exact[nr]) { exact[nr].bedrag = (exact[nr].bedrag || 0) + (x.bedrag || 0); if (x.betaald > exact[nr].betaald) exact[nr].betaald = x.betaald; } else exact[nr] = x;  // meerdere regels per factuur: optellen
    if (x.datum) datums.push(x.datum);
  });
  datums.sort();
  var van = datums[0] || '', tot = datums[datums.length - 1] || '', tMap = perId(lees('Trajecten')), gezien = {}, uit = { gekoppeld: 0, bijgewerkt: [], afwijkend: [], alleenExact: [], alleenAthena: [], van: van, tot: tot, kolommen: kol, toegepast: !!opties.toepassen };
  var wijz = [];
  lees('Facturen').forEach(function (f) {
    var nr = String(f.factuurnummer || '').trim(), t = tMap[f.trajectId] || {}, waar = (t.school || '') + ' · ' + (t.traject || '') + ' · ' + (f.omschrijving || '');
    if (!nr) return;
    var x = exact[nr];
    if (!x) { var v = verzondenVan(f); if (v && (!van || (v.datum >= van && v.datum <= tot))) uit.alleenAthena.push({ nummer: nr, waar: waar, bedrag: centen(f.bedrag) }); return; }
    gezien[nr] = 1; uit.gekoppeld++;
    if (x.bedrag !== null && x.bedrag !== centen(f.bedrag)) uit.afwijkend.push({ nummer: nr, waar: waar, athena: centen(f.bedrag), exact: x.bedrag });
    var nieuw = { id: f.id }, veranderd = [];
    if (x.datum && datumIn(f.verzonden) !== x.datum) { nieuw.verzonden = x.datum; veranderd.push('verzonden ' + x.datum); }
    if (x.betaald && datumIn(f.betaald) !== x.betaald) { nieuw.betaald = x.betaald; veranderd.push('betaald ' + x.betaald); }
    var status = x.betaald ? 'betaald' : (['nog te doen', 'aangemaakt'].indexOf(f.status) >= 0 ? 'verzonden' : f.status);
    if (status !== f.status) { nieuw.status = status; veranderd.push('status ' + status); }
    if (veranderd.length) { wijz.push(nieuw); uit.bijgewerkt.push({ nummer: nr, waar: waar, wat: veranderd.join(', ') }); }
  });
  Object.keys(exact).forEach(function (nr) { if (!gezien[nr]) uit.alleenExact.push({ nummer: nr, datum: exact[nr].datum, bedrag: exact[nr].bedrag }); });
  if (opties.toepassen) metLock(function () {
    if (wijz.length) schrijfVeel('Facturen', wijz);
    if (opties.kolommen) zetInstelling('exactKolommen', kol);
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), bron: 'exact', aangemaakt: nu(), onderwerp: 'Exact-import: ' + uit.gekoppeld + ' gekoppeld, ' + wijz.length + ' bijgewerkt',
      tekst: 'Periode ' + van + ' t/m ' + tot + '. Alleen in Exact: ' + uit.alleenExact.length + '. Alleen in Athena: ' + uit.alleenAthena.length + '. Bedrag wijkt af: ' + uit.afwijkend.length + '.' });
  });
  return uit;
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
function projectLopend(t) {
  if (!t) { controleer(); return false; }  // v4.4.3: Uitvoeren in de editor met deze functie nog geselecteerd: dan de controle draaien in plaats van een TypeError
  return ['afgelopen', 'afgerond', 'gestopt'].indexOf(t.status) < 0;
}
function datumStr(d) { return (d instanceof Date) ? Utilities.formatDate(d, tz(), 'yyyy-MM-dd') : String(d || ''); }
function datumTijdStr(d) { return Utilities.formatDate(d, tz(), 'yyyy-MM-dd HH:mm'); }
function nu() { return datumTijdStr(new Date()); }
function plusDagen(n) { var d = new Date(); d.setDate(d.getDate() + n); return d; }  // v7.2: kalenderdagen, niet n × 24 uur (rond middernacht op een zomertijdwisseldag zat de oude rekenwijze een dag ernaast)
function parseDatum(s) {
  if (s instanceof Date) return s;
  s = String(s || '').trim(); if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
}
function dagenSinds(s) { var d = parseDatum(s); return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null; }
function dagenTot(s) { var d = parseDatum(s); return d ? Math.round((middag(d) - middag(new Date())) / 86400000) : null; }  // v7.2: kalenderdagen (ceil over ms vanaf 00:00 zat in het uur rond middernacht op een wisseldag een dag ernaast)
var DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
var MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function datumLang(d) { return DAGEN[d.getDay()] + ' ' + d.getDate() + ' ' + MAANDEN[d.getMonth()]; }
function groet() { var u = new Date().getHours(), n = String(ikNaam() || '').split(' ')[0]; return (u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond') + ' ' + n; }  // v4.3: groet met de voornaam van wie vraagt, niet altijd die van de eigenaar
// v4.1: het management kan het huidige schooljaar zelf vastzetten (Beheer → Keuzelijsten); anders telt het vanaf 1 augustus
function schooljaarOpDatum() { var d = new Date(), j = d.getFullYear(); return d.getMonth() >= 7 ? j + '-' + (j + 1) : (j - 1) + '-' + j; }
function huidigSchooljaar() { var h = instelling('schooljaar'); return typeof h === 'string' && /^\d{4}-\d{4}$/.test(h) ? h : schooljaarOpDatum(); }
function nieuwId() { return 'k' + Utilities.getUuid().replace(/-/g, '').slice(0, 9); }  // begint met een letter: Sheets maakt van een cijferreeks anders een getal
function slug(s) { return zonderAccenten(String(s || '').toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || nieuwId(); }
function zonderAccenten(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function uniek(lijst) { var uit = []; lijst.forEach(function (x) { if (x !== '' && x != null && uit.indexOf(x) < 0) uit.push(x); }); return uit; }
function vind(naam, id) { return lees(naam).filter(function (r) { return String(r.id) === String(id); })[0] || null; }
function uitMap(map, sleutel) { return Object.prototype.hasOwnProperty.call(map, sleutel) ? map[sleutel] : undefined; }  // v7.2: alleen eigen sleutels van een keuzetabel; 'constructor', 'toString' en '__proto__' uit Object.prototype tellen niet
function mapUrl() { var id = P.getProperty('DRIVE_MAP_ID'); try { return id ? DriveApp.getFolderById(id).getUrl() : ''; } catch (e) { return ''; } }
function naamUitAdres(van) { var m = String(van).match(/^"?([^"<]+?)"?\s*<|^([^@\s]+)@/); return (m && (m[1] || m[2]) || String(van)).trim(); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xmlAttr(s) { return escHtml(s).replace(/\n/g, ' '); }
