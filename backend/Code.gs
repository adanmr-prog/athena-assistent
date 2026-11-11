/* Athena Assistent — Google Apps Script-backend (v2.0)
 * Het bedrijfsbrein van AthenaSchool: operations-dashboard, kennisbank met vraag-en-antwoord, nachtelijke review,
 * huisstijl-kit, doorzoekbare geschiedenis van elke schoolopdracht en (v2.0) het eigen CRM dat Capsule vervangt.
 * Data staat in één Google Sheet (tabbladen hieronder), documenten in één Drive-map. Zie README.md voor de installatie.
 * Contract met de app: POST {fn, args, secret} → {ok:true, result} of {ok:false, fout}. Fout 'secret' = koppelcode klopt niet.
 */

var VERSIE = '7.9';  // v7.9: sturing (fasewissels als gebeurtenis met één schrijfpunt, mijlpaalrol, overstap, win/verloren/ongedaan, kans- en scholenvelden, doelen met periode, eenmalige import, versiewacht; docs/sturing-v7.9.md); v7.7: alle gegevens inladen (talentimport uit de XPS-accountexport, termijnen aanmaken uit de Exact-afstemming); v7.6: metingen (tabblad Metingen, apiMetingenOpslaan, apiMetingen, opruimen na 90 dagen); v7.5: Bezetting → Per project (alleen app; backend gelijk aan 7.4.1); v7.4.1: robuuste herkenning van het aanmeldformulier (kolommen, raster, toestemming, sector, functies, beschikbaarheid); v7.4: XPS-dienstenexport en Exact-afstemming werken met de echte exports; houd gelijk aan de release (zie /release); controleer() print dit als eerste regel
var P = PropertiesService.getScriptProperties();

// v2.0: nieuwe kolommen komen altijd ACHTERAAN (blad() vult de kop aan), zodat bestaande Sheets gewoon blijven werken.
var TABELLEN = {
  Scholen:      ['id', 'naam', 'plaats', 'type', 'contactpersoon', 'email', 'telefoon', 'status', 'am', 'notities', 'bijgewerkt',
                 'bestuur', 'adres', 'website', 'leerlingen', 'eigenaar', 'tags', 'velden', 'laatsteContact', 'capsuleId', 'aangemaakt', 'bijgewerktDoor',
                 'lat', 'lon',  // v5.0: ligging (PDOK) voor de reisafstand in de matching
                 'betaaltermijn',  // v6.5: dagen tussen factuur en betaling (Financiën: wanneer komt het geld binnen); leeg = de standaard
                 'brin', 'vestiging'],  // v7.9: BRIN-nummer en vestigingsvolgnummer (stabiele sleutel, M24 en contracten)
  Trajecten:    ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting', 'bijgewerkt',
                 'schoolId', 'capsuleId', 'bijgewerktDoor',
                 'kansId', 'adviseur', 'soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer',  // v3.8: project uit gewonnen kans + facturatie
                 'contactgegevens', 'voorstelUrl', 'documentenUrl', 'verlenging',  // v4.0: kolommen van het monday-bord
                 'taskforce', 'xpsProject',  // v4.1: overdracht van de taskforcemeeting (JSON) en het projectnummer in XPS
                 'talentscout',  // v6.4: de vaste talentscout van het project (krijgt de meldingen en taken van het talentteam)
                 'contractwaarde',  // v6.5: waarde van het getekende samenwerkingsvoorstel (Financiën); leeg = omzet
                 'klant', 'productsoort'],  // v7.9: nieuw of bestaand (overgenomen van de kans) en productsoort (keuzelijst)
  Kansen:       ['id', 'school', 'traject', 'fase', 'waarde', 'volgendeActie', 'deadline', 'laatsteContact', 'eigenaar', 'notities', 'bijgewerkt',
                 'naam', 'schoolId', 'persoonId', 'pipeline', 'kans', 'verwachteSluiting', 'gesloten', 'verliesReden', 'tags', 'velden', 'capsuleId', 'aangemaakt', 'bijgewerktDoor', 'am',  // v3.8: am = accountmanager na winst
                 'klant', 'schooljaar', 'productsoort', 'verliesToelichting'],  // v7.9: nieuw/bestaand, schooljaar van de opdracht, productsoort, toelichting bij verloren
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
  Mijlpalen:    ['id', 'pipeline', 'mijlpaal', 'volgorde', 'kans', 'dagenNorm', 'rol'],  // v7.9: vaste rol (lead, ap, ad, voorstel of leeg); tellingen lezen de rol, nooit de naam
  Tracks:       ['id', 'naam', 'omschrijving', 'stappen', 'bijgewerkt'],
  Gebruikers:   ['id', 'naam', 'email', 'rol', 'actief', 'bijgewerkt', 'team'],  // v4.0: team + rol (medewerker, teamlead, management)
  Doelen:       ['id', 'eigenaar', 'periode', 'metric', 'doel', 'bijgewerkt', 'periodeSleutel'],  // v7.9: concrete periode (2026-W46, 2026-11, 2026-Q4, 2026-H2, 2026, 2026-2027); leeg = standaard voor elke periode
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
  Aanmeldingen: ['tijdstempel', 'voornaam', 'achternaam', 'telefoon', 'email', 'postcode', 'functies', 'sector', 'beschikbaarheid', 'toestemming', 'verwerkt', 'talentId'],  // het Google Form schrijft in een eigen tabblad (Formulierreacties); dit tabblad is voor handmatige of geïmporteerde aanmeldingen
  // v7.6: metingen uit de app, gebundeld per dag, gebruiker en api (alleen api-naam, tellingen en één ingekorte foutmelding; nooit argumenten); ouder dan 90 dagen wordt opgeruimd (archiveer)
  Metingen: ['id', 'dag', 'gebruiker', 'fn', 'aantal', 'fouten', 'b250', 'b500', 'b1000', 'b2000', 'b5000', 'bMeer', 'somMs', 'maxMs', 'laatsteFout', 'appVersie', 'aangemaakt'],
  // v7.9: elke fasewissel van een kans als gebeurtenis (één schrijfpunt: faseWisselRij + fasewisselsSchrijven). Nooit gearchiveerd (meerjarige curve, M05).
  // van leeg = aangemaakt in die fase; ongedaan/verwijderd = datum-tijd (leeg = geldig); vanRol/naarRol = de rol op het moment zelf, rolBron = waar die vandaan kwam.
  Fasewissels: ['id', 'kansId', 'schoolId', 'van', 'naar', 'werkelijkeDatum', 'ingevoerdOp', 'door', 'eigenaar', 'zekerheid', 'bron', 'ongedaan', 'vanRol', 'naarRol', 'waarde', 'reden', 'bewijs', 'rolBron', 'verwijderd'],
  // v7.9: aannames en besluitinstellingen met versie (één rij per versie, alleen toevoegen); waarde = JSON. Zie aanname() en docs/sturing-v7.9.md.
  Aannames: ['id', 'naam', 'versie', 'waarde', 'eigenaar', 'onderbouwing', 'besluitdatum', 'ingang', 'door', 'vastgelegd'],
  // v7.9 (pakket 2): het register van cijfers (versies en aftekening; de code is versie 0), de dagelijkse datacontracten per eigenaar (opruimen na 90 dagen),
  // de voorspellingslog (M13, M19) en de bevroren stand van het MT-overzicht (soort maand of tussenstand, met de definitie zoals die op de peildatum gold)
  Cijferdefinities: ['id', 'metriek', 'versie', 'definitie', 'eigenaar', 'besluit', 'ingang', 'status', 'tolerantie', 'onderbouwing', 'door', 'aangemaakt', 'afgetekendDoor', 'afgetekendOp'],
  Datakwaliteit: ['id', 'dag', 'contract', 'eigenaar', 'stand', 'aantal', 'verwijzingen', 'aangemaakt'],
  Voorspellingen: ['id', 'aangemaakt', 'soort', 'periode', 'verwacht', 'onder', 'boven', 'model', 'versie', 'werkelijk', 'gescoord', 'fout', 'binnenInterval', 'van', 'tot'],
  Standen: ['id', 'peildatum', 'soort', 'metriek', 'm', 'uitsplitsing', 'waarde', 'versie', 'status', 'eigenaar', 'geblokkeerd', 'definitie', 'aangemaakt']
};
var DATUMTIJD_KOLOMMEN = { bijgewerkt: 1, aangemaakt: 1, afgerond: 1, gemaaktOp: 1, gewijzigd: 1, datum: 1, statusSinds: 1, gesprek: 1, gelezen: 1, ingevuld: 1, herinnerd: 1,  // v4.6: herinnerd
  beschikbaarheidBevestigd: 1, laatstePeiling: 1, gecontroleerdOp: 1, portaalTokenTot: 1, geimporteerd: 1, tijdstempel: 1, verwerkt: 1,  // v5.0
  ingevoerdOp: 1, ongedaan: 1, verwijderd: 1, vastgelegd: 1,  // v7.9: Fasewissels en Aannames (werkelijkeDatum, ingang en besluitdatum blijven datums)
  gescoord: 1, afgetekendOp: 1 };  // v7.9 (pakket 2): Voorspellingen en Cijferdefinities (dag, peildatum, van en tot blijven datums)
var TEKST_KOLOMMEN = { tijd: 1, telefoon: 1, postcode: 1, week: 1, factuurnummer: 1, vestiging: 1, periodeSleutel: 1, brin: 1, tolerantie: 1 };  // v7.9 (pakket 2): tolerantie ('1%' mag geen 0,01 worden)  // v7.9: vestiging ('00' blijft '00'), periodeSleutel ('2026' en '2026-11' blijven tekst), brin  // v7.7: factuurnummer als tekst (voorloopnullen; een bestaande kolom zet de beheerder één keer op tekst, zie backend/README.md)  // v4.5: als tekst opgemaakt ('@'), anders leest Sheets van '14:00' een tijdwaarde uit 1899; v5.0: nieuwe telefoon-, postcode- en weekkolommen houden hun voorloopnul
var DOC_TYPES = ['contract', 'werkwijze', 'schooldossier', 'voorstel', 'prijslijst', 'overig'];
var KANS_FASES = ['lead', 'gesprek', 'voorstel', 'onderhandeling', 'gewonnen', 'verloren'];
var TRAJECT_STATUSSEN = ['opstart', 'bezig', 'afgelopen', 'onduidelijk', 'gestopt'];  // v4.0: zoals het monday-bord
var PRIOS = ['hoog', 'midden', 'laag'];

/* ===================== Eenmalige inrichting (draai vanuit de editor) ===================== */

// v4.4.1: kies deze functie in de keuzelijst naast "Uitvoeren" (de editor onthoudt de laatste keuze); alleen lezen. v4.4.2: ook sleutels en ontbrekende triggers, en bestand tegen een onbereikbare Sheet.
var TRIGGERS = ['nachtelijkeReviewTrigger', 'indexeerTrigger', 'crmSyncTrigger', 'archiveerTrigger', 'herinneringTrigger', 'talentDagelijksTrigger', 'talentUrenTrigger', 'financienTrigger', 'sturingTrigger'];  // v7.9: datacontracten, voorspelling en de maandstand  // v6.5: prognose bevriezen op de eerste van de maand  // v4.6: herinneringsmail bij taken met een tijd; v5.0: talentnetwerk (dagelijks) en de weekexport uit XPS
function triggerNamen() { return ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }); }
function controleer() {
  var regels = ['Athena Assistent, backend ' + VERSIE];
  ['SHEET_ID', 'SECRET', 'DRIVE_MAP_ID'].forEach(function (k) { if (!P.getProperty(k)) regels.push(k + ' ontbreekt: kies setup() en klik Uitvoeren.'); });
  if (P.getProperty('SHEET_ID')) {
    try {
      var ss = sheet(), perNaam = {};
      ss.getSheets().forEach(function (b) { perNaam[b.getName()] = b; });
      regels.push('Sheet: ' + ss.getName());
      Object.keys(TABELLEN).forEach(function (naam) { var b = perNaam[naam]; regels.push('- ' + naam + ': ' + (b ? Math.max(0, b.getLastRow() - 1) + ' rijen' + kopControle(b, TABELLEN[naam]) : 'nog niet aangemaakt (gebeurt vanzelf)')); });
      regels.push(antwoordTabbladenControle());  // v7.4.1 ronde 6
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

// v7.4.1 ronde 6: elk antwoordtabblad van een formulier en hoe aanmeldingenVerwerken het behandelt, zodat een stil overgeslagen ander formulier te zien is
function antwoordTabbladenControle() {
  try {
    var inst = instelling('aanmeldTabbladen'), tabs = aanmeldBladen().map(function (b) {
      var laatste = b.getLastRow(), s = laatste < 2 ? null : aanmeldTabbladSoort(b.getName(), b.getRange(1, 1, laatste, Math.max(b.getLastColumn(), 1)).getValues(), inst);
      return '"' + b.getName() + '" ' + (!s ? 'leeg' : s.keuze === 'negeren' ? 'genegeerd (instelling aanmeldTabbladen)' : s.soort === true ? (s.c.toestemming.length ? 'aanmeldformulier' : 'wacht: geen toestemmingsvraag')
        : s.soort === 'twijfel' ? 'wacht: twijfel of het een aanmeldformulier is' : 'overgeslagen: geen aanmeldformulier');
    });
    return 'Antwoordtabbladen: ' + (tabs.join(' · ') || 'geen');
  } catch (e) { return 'Antwoordtabbladen: niet te lezen (' + ((e && e.message) || e) + ')'; }
}

// v7.2.1: lees() leest op kolompositie, niet op kolomnaam. Een hernoemde of verschoven kop in de Sheet wordt dus stil onder het
// verkeerde veld gelezen; daarom vergelijkt controleer() per tabblad de koprij met TABELLEN. Kolommen die achteraan ontbreken vult
// blad() vanzelf aan; extra kolommen daarna worden genegeerd. Geeft '' als alles klopt, anders een korte melding voor achter het aantal rijen.
function kopControle(b, kop) {
  var breed = b.getLastColumn(), rij = breed > 0 && b.getLastRow() > 0 ? b.getRange(1, 1, 1, breed).getValues()[0] : [], fout = [], extra = [];
  for (var i = 0; i < Math.min(rij.length, kop.length); i++) if (String(rij[i]).trim() !== kop[i]) fout.push((i + 1) + ': "' + String(rij[i]).trim() + '" moet "' + kop[i] + '" zijn');
  for (var j = kop.length; j < rij.length; j++) if (String(rij[j]).trim()) extra.push(String(rij[j]).trim());
  var uit = [];
  if (fout.length) uit.push('AFWIJKENDE KOP (kolom ' + fout.slice(0, 3).join('; ') + (fout.length > 3 ? '; +' + (fout.length - 3) : '') + ') — die kolommen worden onder de verkeerde naam gelezen; zet de kop gelijk aan TABELLEN');
  else if (rij.length && rij.length < kop.length) uit.push('kop mist ' + (kop.length - rij.length) + ' kolommen achteraan (worden vanzelf aangevuld)');
  if (extra.length) uit.push('extra kolommen genegeerd: ' + extra.slice(0, 3).join(', ') + (extra.length > 3 ? ', +' + (extra.length - 3) : ''));
  if (kop[0] === 'id' && b.getLastRow() > 1) {
    var ids = b.getRange(2, 1, b.getLastRow() - 1, 1).getValues(), leeg = 0;
    ids.forEach(function (r) { if (!String(r[0]).trim()) leeg++; });
    if (leeg) uit.push(leeg + ' rijen zonder id (worden overgeslagen)');
  }
  return uit.length ? ' · ' + uit.join(' · ') : '';
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
  ScriptApp.newTrigger('sturingTrigger').timeBased().everyDays(1).atHour(6).nearMinute(45).create();  // v7.9: datacontracten elke dag, voorspelling op maandag, stand bevriezen op de laatste donderdag
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
  fasewisselsSchrijven([['ISK Voorbeeld', 'NT2-ondersteuning', 'voorstel', 15040, 'Voorstel nabellen', datumStr(plusDagen(2)), datumStr(plusDagen(-9))],
   ['Lyceum Demo', 'Examentraining', 'gesprek', 9000, 'Afspraak inplannen met teamleider', datumStr(plusDagen(5)), datumStr(plusDagen(-2))]].map(function (r) {
    var k = schrijf('Kansen', { id: 'demo-' + slug(r[0] + '-' + r[1]), school: r[0], traject: r[1], fase: r[2], waarde: r[3], volgendeActie: r[4], deadline: r[5], laatsteContact: r[6], eigenaar: 'Menno', schooljaar: sj });
    return faseWisselRij(k, '', k.fase, { bron: 'voorbeeld', datum: r[6] });  // v7.9: elke kans heeft een wissel; zonder pipeline telt die van de mijlpaal (R8)
  }));
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

// v7.9 (R13): de versie van de app die het verzoek stuurt (v in de body; geen header, dus geen CORS-preflight). null buiten doPost (triggers, tests)
// en in de demo (app en backend komen daar uit dezelfde deploy); '' = een app van vóór v7.9, die v nog niet meestuurt.
var KLANT_VERSIE = null;
function versieKleiner(a, b) {
  var x = String(a || '').split('.'), y = String(b || '').split('.');
  if (!String(a || '').trim()) return true;
  for (var i = 0; i < Math.max(x.length, y.length); i++) { var p = Number(x[i]) || 0, q = Number(y[i]) || 0; if (p !== q) return p < q; }
  return false;
}
// v7.9 (R13): waar het contract van een schrijf-api veranderde, krijgt een oudere app de opdracht om te herladen in plaats van een melding over een veld dat ze niet heeft
function eisNieuweApp() { if (KLANT_VERSIE !== null && versieKleiner(KLANT_VERSIE, '7.9')) throw new Error('Herlaad de app: er is een nieuwe versie.'); }

function doPost(e) {
  var uit;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    KLANT_VERSIE = req.v === undefined ? '' : req.v === null ? null : String(req.v);  // v7.9 (R13): de demo stuurt v: null
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
  if (naam === 'Talenten') _TALENTNAMEN = null; if (naam === 'Instellingen') _INSTELLINGEN = null;  // v7.6: de namenmap en de instellingenmap
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
  if (v instanceof Date) {
    if (kolom === 'periodeSleutel') return Utilities.formatDate(v, tz(), 'yyyy-MM');  // v7.9 (N2): Sheets zet '2026-11' buiten het tekstbereik om in een datum
    return TEKST_KOLOMMEN[kolom] ? Utilities.formatDate(v, tz(), 'HH:mm') : DATUMTIJD_KOLOMMEN[kolom] ? datumTijdStr(v) : datumStr(v);  // v4.5: een tijd die Sheets toch omzette
  }
  return v;
}
// v7.9 (N2): een getal in een tekstkolom wordt weer tekst ('2026' als getal → '2026'; vestiging 0 → '00', 3 → '03'). Gelezen met uitMap.
var TEKST_NORMALISATIE = {
  periodeSleutel: function (v) { return v === '' || v == null ? '' : String(v); },
  vestiging: function (v) { return v === '' || v == null ? '' : ('0' + String(v)).slice(-2); }
};
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
  var norm = []; for (var n = 0; n < aantal; n++) norm.push(uitMap(TEKST_NORMALISATIE, kop[n]) || null);  // v7.9 (N2)
  for (var r = 1; r < waarden.length; r++) {
    var o = { _rij: r + 1 }, leeg = true;
    for (var c = 0; c < aantal; c++) {
      var v = celWaarde(waarden[r][c], kop[c]);
      if (norm[c] && typeof v === 'number') v = norm[c](v);
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
  var nieuwPlek = {};  // v7.9 (review C6): hetzelfde id twee keer in één lijst: de tweede werkt de nog niet geschreven nieuwe rij bij (getRange zonder rijnummer gooide)
  lijst.forEach(function (obj) {
    if (!obj.id) obj.id = nieuwId();
    var hit = bestaand[String(obj.id)], samen = samenvoegen(naam, obj, hit), rij = kop.map(function (k) { return celUit(samen[k]); });
    if (hit && hit._rij) { b.getRange(hit._rij, 1, 1, kop.length).setValues([rij]); stats.bijgewerkt++; }
    else if (hit && uitMap(nieuwPlek, String(obj.id)) !== undefined) { nieuw[nieuwPlek[String(obj.id)]] = rij; bestaand[String(obj.id)] = samen; }
    else { nieuwPlek[String(obj.id)] = nieuw.length; nieuw.push(rij); bestaand[String(obj.id)] = samen; stats.ingevoegd++; }
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
  var omzet = contractwaardeSchooljaar(trajecten, sj);  // v7.9 (punt 17): de contractwaarde van het schooljaar, één definitie met Home en Financiën (de sleutel kpi.omzet blijft); v4.2: opstart is gewonnen
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
  tekst = tekstIn(tekst); if (!tekst) throw new Error('Geen tekst.');  // v7.3: een object als tekst wordt geweigerd
  var o = schoon(extra || {}, ['tijd', 'herhaling', 'categorie', 'eigenaar', 'schoolId', 'persoonId', 'kansId', 'trajectId', 'notitie', 'tags', 'ouderId']);  // v4.6: tags en hoofdtaak
  o.tekst = tekst; o.prio = PRIOS.indexOf(prio) >= 0 ? prio : 'midden'; o.deadline = deadline || ''; o.bron = 'handmatig';
  return apiTaakOpslaan(o);
}
function actieUit(a) { var tot = a.deadline ? dagenTot(a.deadline) : null; return { id: a.id, tekst: a.tekst, bron: a.bron, prio: a.prio, deadline: a.deadline, link: a.link || '', over: tot === null ? null : -tot || 0 }; }
// v2.0: met mijlpalenkaart (mp) erbij komen kans-%, gewogen waarde en 'stil' (langer geen contact dan de norm van de mijlpaal)
// v7.9 (punt 17, M06): kans en gewogen volgen het fasegewicht van de mijlpaal (met versie in Aannames); de leadrol weegt 0; een percentage per kans telt niet meer
function kansUit(k, mp) {
  var m = (mp && typeof mp === 'object') ? uitMap(mp, k.fase) : null, waarde = Number(k.waarde) || 0, stil = k.laatsteContact ? dagenSinds(k.laatsteContact) : null;
  var kans = fasegewichtVan(k);
  var norm = m && m.dagenNorm ? m.dagenNorm : 7;
  return { id: k.id, naam: k.naam || k.traject, school: k.school, schoolId: k.schoolId || '', persoonId: k.persoonId || '', traject: k.traject, fase: k.fase, pipeline: k.pipeline || '',
    waarde: waarde, kans: kans, gewogen: Math.round(waarde * kans / 100), volgendeActie: k.volgendeActie, deadline: k.deadline, verwachteSluiting: k.verwachteSluiting || '',
    gesloten: k.gesloten || '', verliesReden: k.verliesReden || '', eigenaar: k.eigenaar || '', am: k.am || '', tags: tagsUit(k.tags), velden: veldenUit(k.velden), notities: k.notities || '', aangemaakt: k.aangemaakt || '',
    dagenStil: stil, stil: kansOpen(k) && stil !== null && stil > norm,
    klant: k.klant || '', schooljaar: k.schooljaar || '', productsoort: k.productsoort || '', verliesToelichting: k.verliesToelichting || '' };  // v7.9
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
      var dagen = dagenSinds(laatste.getDate());  // v7.3 (TZ-6): kalenderdagen onbeantwoord, zoals overal
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

// v7.3 (K2): apiVraag (vraag-en-antwoord over de documenten, v1) is verwijderd; de app gebruikt sinds v3.5 apiBrein met de tool zoek_documenten.
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
// v7.3 (K2): apiZetHuisstijl (één veld per aanroep) is verwijderd; de app gebruikt sinds v3.7 apiHuisstijlOpslaan met meerdere velden tegelijk.
function apiMaakContent(type, onderwerp, extra) {
  var t = uitMap(CONTENT_TYPES, type); if (!t) throw new Error('Onbekend contenttype.');  // v7.2: geen geërfde sleutels (constructor, __proto__)
  onderwerp = tekstIn(onderwerp); if (!onderwerp) throw new Error('Geef een onderwerp.');  // v7.3: een object als onderwerp wordt geweigerd (tekstIn)
  extra = tekstIn(extra);  // v7.3
  var h = huisstijl();
  var systeem = 'Je schrijft teksten namens ' + h.bedrijf + '. Over het bedrijf: ' + h.omschrijving + '\n\nToon en stijl:\n' + h.toon +
    '\n\nStandaardzinnen die je mag gebruiken waar ze passen (niet geforceerd):\n' + h.zinnen + '\n\nSchrijf in het Nederlands. Lever alleen de gevraagde tekst, zonder toelichting, zonder aanhalingstekens eromheen.';
  var invoer = t.instructie + '\n\nOnderwerp: ' + onderwerp + (extra ? '\nExtra context van Menno: ' + extra : '');
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
// v7.3 (K2): apiTraject (de oude projectpagina, v1) is verwijderd; de app gebruikt sinds v3.8 apiProject. De rooktest (H1) vergelijkt de whitelist
// hieronder met de velden van trajectVelden() in index.html, zodat een nieuwe kolom in de app niet stil wordt weggelaten.
var TRAJECT_TEKSTVELDEN = ['school', 'plaats', 'traject', 'schooljaar', 'contactpersoon', 'samenvatting', 'bijzonderheden', 'factuurnummer', 'contactgegevens', 'voorstelUrl', 'documentenUrl', 'xpsProject'];  // v7.3: vrije tekst (tekstIn)
function apiTrajectOpslaan(obj) {
  obj = obj || {};
  var velden = ['id', 'school', 'plaats', 'traject', 'schooljaar', 'start', 'eind', 'status', 'ondersteuners', 'urenPerWeek', 'tarief', 'omzet', 'contactpersoon', 'am', 'samenvatting', 'schoolId',
    'kansId', 'adviseur', 'soortFacturatie', 'gefactureerd', 'factuurDatum', 'vakanties', 'bijzonderheden', 'factuurnummer',  // v3.8
    'contactgegevens', 'voorstelUrl', 'documentenUrl', 'verlenging', 'xpsProject', 'talentscout', 'contractwaarde', 'klant', 'productsoort'], schoon = {};  // v4.0; v4.1: xpsProject; v6.4: talentscout; v7.9: klant en productsoort
  velden.forEach(function (k) { if (obj[k] !== undefined) schoon[k] = obj[k]; });
  TRAJECT_TEKSTVELDEN.forEach(function (k) { if (schoon[k] !== undefined) schoon[k] = tekstIn(schoon[k]); });  // v7.3: een object in een tekstveld wordt geweigerd
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
  if (schoon.klant !== undefined) { schoon.klant = klein(tekstIn(schoon.klant)); if (schoon.klant && KLANT_SOORTEN.indexOf(schoon.klant) < 0) throw new Error('Kies nieuw of bestaand.'); }  // v7.9
  if (schoon.productsoort !== undefined) { schoon.productsoort = klein(tekstIn(schoon.productsoort)); if (schoon.productsoort && keuzelijst('productsoorten').indexOf(schoon.productsoort) < 0) throw new Error('Onbekende productsoort.'); }  // v7.9
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
// v7.3 (K2): apiNotitieToevoegen (notitie bij een project, v1) is verwijderd; de app logt sinds v2.0 via apiActiviteitToevoegen met trajectId.
function trajectUit(t) {
  return { id: t.id, schoolId: t.schoolId || '', school: t.school, plaats: t.plaats, traject: t.traject, schooljaar: t.schooljaar, start: t.start, eind: t.eind, status: t.status, ondersteuners: t.ondersteuners,
    urenPerWeek: Number(t.urenPerWeek) || 0, tarief: Number(t.tarief) || 0, omzet: Number(t.omzet) || 0, contactpersoon: t.contactpersoon, am: t.am, samenvatting: t.samenvatting, bijgewerkt: t.bijgewerkt,
    kansId: t.kansId || '', adviseur: t.adviseur || '', soortFacturatie: t.soortFacturatie || '', gefactureerd: t.gefactureerd || '', factuurDatum: t.factuurDatum || '', vakanties: t.vakanties || '',
    bijzonderheden: t.bijzonderheden || '', factuurnummer: t.factuurnummer || '',  // v3.8
    contactgegevens: t.contactgegevens || '', voorstelUrl: t.voorstelUrl || '', documentenUrl: t.documentenUrl || '', xpsProject: t.xpsProject || '', verlenging: t.verlenging || '', talentscout: t.talentscout || '', contractwaarde: t.contractwaarde === '' || t.contractwaarde == null ? '' : Number(t.contractwaarde) || 0,  // v4.0; v6.4: talentscout
    klant: t.klant || '', productsoort: t.productsoort || '' };  // v7.9
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
  { mijlpaal: 'lead', kans: 10, dagenNorm: 14, rol: 'lead' }, { mijlpaal: 'gesprek', kans: 25, dagenNorm: 10, rol: 'ap' },  // v7.9: vaste rol per mijlpaal; geen standaardmijlpaal met rol ad
  { mijlpaal: 'voorstel', kans: 50, dagenNorm: 7, rol: 'voorstel' }, { mijlpaal: 'onderhandeling', kans: 75, dagenNorm: 7, rol: '' }  // onderhandeling erft voorstel (effectieve rol)
];
// v7.9: keuzetabellen (objecten) altijd via uitMap(); lijsten via indexOf (N1). Zie docs/sturing-v7.9.md.
var MIJLPAAL_ROLLEN = ['', 'lead', 'ap', 'ad', 'voorstel'];
var ROL_ORDE = { '': 0, lead: 1, ap: 2, ad: 3, voorstel: 4, deal: 5, verloren: 5 };   // lezen met uitMap(ROL_ORDE, rol) || 0
var ROL_BRONNEN = ['mijlpaal', 'leeg', 'volgorde'];                                  // herkomst van vanRol/naarRol op de wissel (B1)
var FASE_ROL_OPNIEUW = ['import', 'capsule', 'tijdlijn', 'reconstructie'];           // bronnen die "Rollen opnieuw toepassen" altijd opnieuw zet (R7)
var FASE_BRONNEN = ['detail', 'slepen', 'toets', 'bulk', 'aanmaken', 'winformulier', 'verloren', 'assistent', 'hernoemd', 'import', 'capsule', 'reconstructie', 'tijdlijn', 'voorbeeld', 'demo'];
var FASE_BRONNEN_APP = ['detail', 'slepen', 'toets', 'bulk', 'aanmaken'];           // wat de app in obj.wissel.bron mag sturen
var FASE_BRONNEN_NU = ['detail', 'slepen', 'toets', 'bulk', 'aanmaken', 'winformulier', 'verloren', 'assistent', 'hernoemd'];  // vastgelegd op het moment zelf: datum verplicht en gecontroleerd
var FASE_TELT_NIET = ['hernoemd'];                                                   // administratief: telt nergens
var ZEKERHEDEN = ['vastgelegd', 'hoog', 'midden', 'laag'];                         // vastgelegd = in Athena op het moment zelf
var KLANT_SOORTEN = ['nieuw', 'bestaand'];
var CONTACT_VORMEN = ['call', 'mail', 'whatsapp', 'afspraak-online', 'afspraak-fysiek', 'evaluatie-online', 'evaluatie-fysiek'];  // M14 (mail alleen verstuurd: met door)
var AFSPRAAK_VORMEN = ['afspraak-online', 'afspraak-fysiek', 'evaluatie-online', 'evaluatie-fysiek'];  // M15
var WEEKDOEL_METRIEKEN = ['contactmomenten', 'ap', 'ad', 'voorstellen', 'gewonnen'];  // M17
var METRIEK_ALIAS = { omzet: 'contractwaarde', vo: 'voorstellen', deal: 'gewonnen' };   // lezen met uitMap(METRIEK_ALIAS, m) || m; een oud bedrijfsdoel op omzet geldt voor contractwaarde
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
  if (o.naam !== undefined) o.naam = tekstIn(o.naam);  // v7.3: geen object als naam
  if (!o.id && !o.naam) throw new Error('Naam is verplicht.');
  if (o.email !== undefined) o.email = tekstIn(o.email).toLowerCase();  // v7.3
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
    laatsteContact: s.laatsteContact, aangemaakt: s.aangemaakt, bijgewerkt: s.bijgewerkt, betaaltermijn: s.betaaltermijn === '' || s.betaaltermijn == null ? '' : Number(s.betaaltermijn) || '',  // v6.5
    brin: s.brin || '', vestiging: s.brin ? String(s.vestiging || '') || '00' : '' };  // v7.9
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
  var lijst = rijen.length ? rijen.map(function (m) { return { id: String(m.id || ''), pipeline: m.pipeline || 'Scholen', mijlpaal: String(m.mijlpaal), volgorde: Number(m.volgorde) || 0, kans: Number(m.kans) || 0, dagenNorm: Number(m.dagenNorm) || 0, rol: rolIn(m.rol) }; })
    : STANDAARD_MIJLPALEN.map(function (m, i) { return { id: slug('Scholen-' + m.mijlpaal), pipeline: 'Scholen', mijlpaal: m.mijlpaal, volgorde: i + 1, kans: m.kans, dagenNorm: m.dagenNorm, rol: m.rol }; });  // v7.9: rol (en id, voor de overstap)
  return lijst.sort(function (a, b) { return a.pipeline === b.pipeline ? a.volgorde - b.volgorde : String(a.pipeline).localeCompare(String(b.pipeline)); });
}
function mijlpaalMap() { var m = {}; mijlpalen().forEach(function (x) { if (!m[x.mijlpaal]) m[x.mijlpaal] = x; }); return m; }
// v7.9: een rol uit de Sheet of de app; alles buiten MIJLPAAL_ROLLEN telt als geen rol
function rolIn(r) { var x = klein(r); return MIJLPAAL_ROLLEN.indexOf(x) >= 0 ? x : ''; }

/* ----- v7.9: de rol van een mijlpaal (tellingen lezen de rol, nooit de naam) ----- */

// Per verzoek één keer opgebouwd; hangt aan de gelezen rijen (_LEES.Mijlpalen), zodat vergeet() en elke reset (demo, tests) hem ongeldig maken.
// perPipeline[pl][mijlpaal] = { rol, effectief, volgorde }: effectief = de eigen rol, anders die van de dichtstbijzijnde eerdere mijlpaal met een rol.
var _ROLLEN = null;
function rollenData() {
  var bron = _LEES.Mijlpalen || (lees('Mijlpalen'), _LEES.Mijlpalen);
  if (_ROLLEN && _ROLLEN.bron === bron) return _ROLLEN;
  var per = {}, laatste = {}, metRol = {}, ingesteld = false, ms = mijlpalen(), perNaam = {};
  ms.forEach(function (m) {
    var p = per[m.pipeline] || (per[m.pipeline] = {});
    if (m.rol) { laatste[m.pipeline] = m.rol; metRol[m.pipeline] = true; if (['ap', 'ad', 'voorstel'].indexOf(m.rol) >= 0) ingesteld = true; }
    p[m.mijlpaal] = { rol: m.rol, effectief: m.rol || laatste[m.pipeline] || '', volgorde: m.volgorde, kans: m.kans };  // v7.9: kans = fasegewicht (M06)
    if (!perNaam[m.mijlpaal]) perNaam[m.mijlpaal] = m.pipeline;
  });
  var pipelines = Object.keys(per);
  _ROLLEN = { bron: bron, per: per, perNaam: perNaam, status: { ingesteld: ingesteld, pipelinesZonder: pipelines.filter(function (pl) { return !metRol[pl]; }) } };
  return _ROLLEN;
}
// { <mijlpaal>: { rol, effectief, volgorde } } van één pipeline; lezen met uitMap
function mijlpaalRollen(pipeline) { var p = uitMap(rollenData().per, String(pipeline || '')), uit = {}; if (p) Object.keys(p).forEach(function (k) { uit[k] = p[k]; }); return uit; }
// v7.9 (R8): een kans zonder pipeline (voorbeelddata, apiImporteer, Capsule zonder mijlpaal) gebruikt de pipeline van zijn mijlpaal
function pipelineVan(k) { return String((k && k.pipeline) || uitMap(rollenData().perNaam, String(k && k.fase)) || ''); }
// '' | 'lead' | 'ap' | 'ad' | 'voorstel' | 'deal' | 'verloren'
function effectieveRol(fase, pipeline) {
  fase = String(fase || '');
  if (fase === 'gewonnen') return 'deal';
  if (fase === 'verloren') return 'verloren';
  var R = rollenData(), vind_ = function (pl) { var p = uitMap(R.per, String(pl || '')); return p ? uitMap(p, fase) || uitMap(p, klein(fase)) : null; };
  var x = vind_(pipeline || uitMap(R.perNaam, fase)) || vind_(uitMap(R.perNaam, fase) || uitMap(R.perNaam, klein(fase)));  // staat de mijlpaal niet in de pipeline van de kans: die van de mijlpaal zelf
  return x ? x.effectief : '';
}
function vanafVoorstel(fase, pipeline) { return effectieveRol(fase, pipeline) === 'voorstel'; }
// v7.9 (M06): het fasegewicht van een kans in procent: gewonnen 100, verloren 0, de leadrol 0, anders Mijlpalen.kans van zijn mijlpaal in zijn pipeline (R8: zonder pipeline die van de mijlpaal)
function fasegewichtVan(k) {
  if (k.fase === 'gewonnen') return 100;
  if (k.fase === 'verloren') return 0;
  var R = rollenData(), pl = pipelineVan(k), p = uitMap(R.per, pl), x = p ? uitMap(p, String(k.fase || '')) || uitMap(p, klein(k.fase)) : null;
  if (!x) { var pn = uitMap(R.per, String(uitMap(R.perNaam, String(k.fase || '')) || '')); x = pn ? uitMap(pn, String(k.fase || '')) : null; }
  return !x || x.effectief === 'lead' ? 0 : Number(x.kans) || 0;
}  // open kansen vanaf de voorstelrol (M06, M19, contracten, het voorstelvenster)
// v7.9 (B1): zijn de rollen ingesteld? Een Sheet met eigen Mijlpalen-rijen (na Capsule of na opslaan in Beheer) heeft ze pas na apiMigratieV79('rollen')
// of na het invullen in Beheer → Mijlpalen. ingesteld = minstens één mijlpaal met rol ap, ad of voorstel; pipelinesZonder = pipelines zonder enige rol.
function rollenStatus() { var s = rollenData().status; return { ingesteld: s.ingesteld, pipelinesZonder: s.pipelinesZonder.slice() }; }
function rolBlokkade() { return rollenData().status.ingesteld ? '' : 'rollen niet ingesteld (Beheer → Overstap v7.9)'; }
// v7.9: de rollen van één pipeline controleren: elke rol hoogstens één keer, in de volgorde lead < ap < ad < voorstel
function rollenControle(lijst) {
  var per = {};
  lijst.slice().sort(function (a, b) { return (Number(a.volgorde) || 0) - (Number(b.volgorde) || 0); }).forEach(function (m) {
    if (!m.rol) return;
    var p = per[m.pipeline] || (per[m.pipeline] = { gezien: {}, laatste: 0 }), o = uitMap(ROL_ORDE, m.rol) || 0;
    if (p.gezien[m.rol]) throw new Error('De rol ' + m.rol + ' staat twee keer in pipeline ' + m.pipeline + '.');
    if (o < p.laatste) throw new Error('Zet de rollen in de volgorde lead, AP gepland, AP gehouden, voorstel.');
    p.gezien[m.rol] = true; p.laatste = o;
  });
}

// v7.9: lijst = [{ pipeline, mijlpaal, kans, dagenNorm, rol, oud }]. Ontbreekt het veld rol (een oudere app), dan blijft de rol van de rij met
// hetzelfde id of dezelfde oud staan (R13); alleen een meegestuurde lege tekst wist hem.
function apiMijlpalenOpslaan(lijst, opties) {
  alleenBeheerder();
  if (!(lijst instanceof Array) || !lijst.length || lijst.some(function (m) { return !m || typeof m !== 'object'; })) throw new Error('Geef minstens één mijlpaal (naam, pipeline, kans, dagen).');  // v7.2: elk element een object (null gaf een TypeError)
  var bestaand = {}; mijlpalen().forEach(function (m) { bestaand[slug(m.pipeline + '-' + m.mijlpaal)] = m.rol; });
  var rijen = lijst.map(function (m, i) {
    var naam = klein(m.mijlpaal); if (!naam || naam === 'gewonnen' || naam === 'verloren') throw new Error('Ongeldige mijlpaal: ' + (typeof m.mijlpaal === 'string' && m.mijlpaal ? m.mijlpaal : '(leeg)') + '. Gewonnen en verloren bestaan altijd.');
    var pl = String(typeof m.pipeline === 'string' && m.pipeline ? m.pipeline : 'Scholen').trim(), id = slug(pl + '-' + naam), rol;
    if (m.rol === undefined) {  // R13: een oudere app stuurt geen rol mee
      var oudId = m.oud && typeof m.oud === 'object' && m.oud.mijlpaal ? slug(String(m.oud.pipeline || pl) + '-' + klein(m.oud.mijlpaal)) : id;
      rol = bestaand[oudId] !== undefined ? bestaand[oudId] : bestaand[id] || '';
    } else {
      rol = klein(typeof m.rol === 'string' ? m.rol : '');
      if (MIJLPAAL_ROLLEN.indexOf(rol) < 0) throw new Error('Onbekende rol: ' + rol + '. Kies lead, ap, ad, voorstel of geen.');
    }
    return { id: id, pipeline: pl, mijlpaal: naam, volgorde: i + 1, kans: Math.max(0, Math.min(100, Number(m.kans) || 0)), dagenNorm: Math.max(0, Number(m.dagenNorm) || 0), rol: rol };
  });
  rollenControle(rijen);
  // v7.9 (N6, pakket 2): een echte wijziging van een fasegewicht (tegen de vorige versie van aanname fasegewichten, anders de huidige mijlpalen; een nieuwe
  // mijlpaal met een gewicht telt ook) vraagt een onderbouwing en een besluitdatum en wordt een nieuwe versie van die aanname. Dezelfde gewichten nog eens
  // opslaan, alleen hernoemen of alleen een rol wijzigen maakt geen versie. Een oudere app zonder die velden krijgt "Herlaad de app" (R13).
  var opt = opties && typeof opties === 'object' && !(opties instanceof Array) ? opties : {}, vorigeA = aanname('fasegewichten');
  var vorige = vorigeA && vorigeA.waarde && typeof vorigeA.waarde === 'object' && !(vorigeA.waarde instanceof Array) ? vorigeA.waarde : null, gewichten = {}, gewichtGewijzigd = false;
  if (!vorige) { vorige = {}; mijlpalen().forEach(function (m) { vorige[m.pipeline + '|' + m.mijlpaal] = m.kans; }); }
  rijen.forEach(function (r, i) {
    var sl = r.pipeline + '|' + r.mijlpaal, o = lijst[i].oud, oudSl = o && typeof o === 'object' && o.mijlpaal ? String(o.pipeline || r.pipeline) + '|' + klein(o.mijlpaal) : sl;
    var was = uitMap(vorige, oudSl); if (was === undefined) was = uitMap(vorige, sl);
    gewichten[sl] = r.kans;
    if (was === undefined ? r.kans > 0 : Number(was) !== r.kans) gewichtGewijzigd = true;
  });
  var onderbouwing = '', besluitdatum = '';
  if (gewichtGewijzigd) {
    onderbouwing = typeof opt.onderbouwing === 'string' ? tekstIn(opt.onderbouwing).slice(0, 2000) : '';
    besluitdatum = typeof opt.besluitdatum === 'string' ? datumIn(opt.besluitdatum) : '';
    if (!onderbouwing || !besluitdatum) { eisNieuweApp(); throw new Error('Geef een onderbouwing en een besluitdatum bij een gewijzigd fasegewicht.'); }
  }
  // v3.7: een hernoemde mijlpaal of pipeline (oud = {pipeline, mijlpaal} zoals geladen) neemt zijn kansen mee
  var hernoemd = lijst.map(function (m, i) { return m.oud && m.oud.mijlpaal ? { oud: m.oud, nieuw: rijen[i] } : null; })
    .filter(function (x) { return x && (klein(x.oud.mijlpaal) !== x.nieuw.mijlpaal || String(x.oud.pipeline || '') !== x.nieuw.pipeline); });
  metLock(function () {
    verwijderRijen('Mijlpalen', function () { return true; }); schrijfVeel('Mijlpalen', rijen);
    if (hernoemd.length) {
      var wijzig = [], wissels = [], vandaag = datumStr(new Date());
      lees('Kansen').forEach(function (k) {
        hernoemd.forEach(function (h) {
          if (klein(k.fase) !== klein(h.oud.mijlpaal) || (k.pipeline && h.oud.pipeline && k.pipeline !== h.oud.pipeline)) return;
          wijzig.push({ id: k.id, fase: h.nieuw.mijlpaal, pipeline: h.nieuw.pipeline });
          // v7.9: de verhuisde kans krijgt een administratieve wissel (bron hernoemd, telt nergens); alle wissels samen in één schrijfVeel (R2)
          wissels.push(faseWisselRij({ id: k.id, schoolId: k.schoolId, eigenaar: k.eigenaar, waarde: k.waarde, fase: h.nieuw.mijlpaal, pipeline: h.nieuw.pipeline }, k.fase, h.nieuw.mijlpaal,
            { bron: 'hernoemd', datum: vandaag, vanPipeline: String(h.oud.pipeline || k.pipeline || '') }));
        });
      });
      if (wijzig.length) schrijfVeel('Kansen', wijzig);
      if (wissels.length) fasewisselsSchrijven(wissels);
    }
    if (gewichtGewijzigd) aannameVastleggen('fasegewichten', gewichten, { onderbouwing: onderbouwing, besluitdatum: besluitdatum, eigenaar: 'beheerder' });  // v7.9 (N6)
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
  kansen.filter(kansOpen).forEach(function (k) { var sid = k.schoolId || naarId[klein(k.school)]; if (per[sid]) { per[sid].open++; if (!kansBeperkt(k)) per[sid].waarde += Number(k.waarde) || 0; } });  // v7.3 (R1): de waarde van een beperkte kans telt niet mee
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
    keuzes: { soortFacturatie: keuzelijst('soortFacturatie'), gefactureerd: keuzelijst('gefactureerd'), vakanties: keuzelijst('vakanties'), factuurStatussen: keuzelijst('factuurStatussen'), verlenging: keuzelijst('verlenging'),
      verliesRedenen: keuzelijst('verliesRedenen'), productsoorten: keuzelijst('productsoorten') },  // v7.9
    teams: { consultancy: teamNamen('consultancy'), accountmanagement: teamNamen('accountmanagement'), talent: teamNamen('talent'), management: teamNamen('management') },
    meldingen: ongelezenMeldingen(), schooljaar: huidigSchooljaar(),  // v4.1
    // v7.9: het klantvoorstel in het kansformulier (alleen ids: welke scholen waren klant in het vorige en het huidige schooljaar), de schooljaren
    // voor een nieuwe kans, of de rollen ingesteld zijn, en de versie van de backend (de app verbergt v7.9-schermen bij een oudere). Review T4: sturingVerplicht
    // staat in apiPipeline (het bord, waar bulk en het voorstelvenster het nodig hebben); kansOpslaan controleert het hoe dan ook.
    klantIn: klantInVan(scholen), schooljaren: [huidigSchooljaar(), volgendSchooljaar(huidigSchooljaar())], rollenIngesteld: rollenStatus().ingesteld, backendVersie: VERSIE
  };
}
// v7.9: { '<schooljaar>': [schoolId, …] } voor het vorige en het huidige schooljaar (alleen ids; op schoolSleutel, dus ook een tweede vestiging met dezelfde BRIN)
function klantInVan(scholen) {
  var sj = huidigSchooljaar(), uit = {};
  [vorigSchooljaar(sj), sj].forEach(function (j) { var ks = klantSleutels(j); uit[j] = scholen.filter(function (s) { return ks[schoolSleutel(s)]; }).map(function (s) { return s.id; }); });
  return uit;
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
var SCHOOL_VELDEN = ['id', 'naam', 'plaats', 'type', 'bestuur', 'adres', 'website', 'leerlingen', 'telefoon', 'email', 'status', 'eigenaar', 'tags', 'velden', 'notities', 'contactpersoon', 'betaaltermijn',  // v6.5: betaaltermijn
  'brin', 'vestiging'];  // v7.9
// v7.9: BRIN-nummer (twee cijfers en twee tekens, hoofdletters, zonder spaties) en vestigingsvolgnummer (twee cijfers; leeg met een BRIN = 00).
// Geeft { brin, vestiging } of gooit een Nederlandse fout. Ook voor apiImporteer('scholen').
function brinIn(brin, vestiging) {
  var b = tekstIn(brin).toUpperCase().replace(/\s+/g, ''), v = tekstIn(vestiging).replace(/\s+/g, '');
  if (!b) { if (v) throw new Error('Vul eerst het BRIN-nummer in; een vestiging hoort bij een BRIN.'); return { brin: '', vestiging: '' }; }
  if (!/^\d{2}[A-Z0-9]{2}$/.test(b)) throw new Error('Een BRIN-nummer is twee cijfers en twee tekens, bijvoorbeeld 12AB.');
  if (v && !/^\d{1,2}$/.test(v)) throw new Error('Een vestiging is een nummer van twee cijfers, bijvoorbeeld 00 of 01.');
  return { brin: b, vestiging: ('0' + (v || '0')).slice(-2) };
}
function apiSchoolOpslaan(obj) {
  eis('relaties', 'wijzigen');  // v4.0
  var o = schoon(obj || {}, SCHOOL_VELDEN), oud = o.id ? vind('Scholen', o.id) : null;
  if (o.id && !oud) throw new Error('School niet gevonden.');
  if (o.naam !== undefined) o.naam = tekstIn(o.naam);  // v7.3: geen object als naam
  if (o.notities !== undefined) o.notities = tekstIn(o.notities);  // v7.3
  if (!oud && !o.naam) throw new Error('Naam is verplicht.');
  if (oud && o.naam === '') throw new Error('Naam mag niet leeg zijn.');
  if (o.status && schoolStatussen().indexOf(o.status) < 0) throw new Error('Onbekende status.');
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);
  if (o.velden !== undefined) o.velden = veldenUit(o.velden);
  if (o.email !== undefined) o.email = klein(o.email);
  if (o.betaaltermijn !== undefined && o.betaaltermijn !== '') { o.betaaltermijn = Math.round(Number(o.betaaltermijn)); if (!(o.betaaltermijn >= 0 && o.betaaltermijn <= 365)) throw new Error('Betaaltermijn in dagen (0 tot 365).'); }  // v6.5
  if (o.brin !== undefined || o.vestiging !== undefined) {  // v7.9: vorm en uniciteit per combinatie
    var bIn = o.brin !== undefined ? o.brin : (oud ? oud.brin : ''), vIn = o.vestiging !== undefined ? o.vestiging : (oud && tekstIn(bIn) ? oud.vestiging : '');  // zonder BRIN ook geen vestiging
    var bv = brinIn(bIn, vIn);
    o.brin = bv.brin; o.vestiging = bv.vestiging;
    var dubbel = bv.brin ? lees('Scholen').filter(function (x) { return String(x.id) !== String(o.id || '') && String(x.brin || '').toUpperCase() === bv.brin && (('0' + String(x.vestiging || '0')).slice(-2)) === bv.vestiging; })[0] : null;
    if (dubbel) throw new Error('Deze BRIN en vestiging horen al bij ' + dubbel.naam + '.');
  }
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
  ['voornaam', 'achternaam', 'functie', 'telefoon', 'linkedin'].forEach(function (k) { if (o[k] !== undefined) o[k] = tekstIn(o[k]); });  // v7.3: geen object als tekst
  if (o.email !== undefined) o.email = klein(tekstIn(o.email));  // v7.3
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
  // v7.9 (R17, keuze K4): een kans met een tellende winst of een project blijft staan; anders krijgen zijn wissels de vlag verwijderd (de rijen blijven, ze tellen niet meer)
  if (soort === 'kans' && (tellendeWissels().some(function (w) { return String(w.kansId) === String(id) && w.naar === 'gewonnen'; }) || lees('Trajecten').some(function (t) { return String(t.kansId) === String(id); })))
    throw new Error('Zet de kans op verloren of heropen hem; een gewonnen kans met een project blijft staan.');
  metLock(function () {
    if (soort === 'kans') { var t = nu(); wisselsBijwerken(wisselsVanKans(id).filter(function (w) { return !w.verwijderd; }).map(function (w) { return { id: w.id, verwijderd: t }; })); }
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
  a.tekst = tekstIn(obj.tekst); a.onderwerp = tekstIn(obj.onderwerp);  // v7.3: geen object als tekst
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
    verliesRedenen: keuzelijst('verliesRedenen'),  // v7.9: de keuzelijst (met opgeschoond), niet meer de vrije waarden uit de data
    sturingVerplicht: sturingVerplicht() };  // v7.9 (review T4): hier en niet in apiCrm, zodat elke opening van Relaties het tabblad Aannames niet leest
}
function apiKans(id) {
  var k = vind('Kansen', id); if (!k) throw new Error('Kans niet gevonden.');
  if (!kansZichtbaar(k, kansenViaProject())) throw new Error('Daar heb je geen toegang toe.');  // v4.0: een AM ziet alleen de kans achter zijn eigen project
  var s = k.schoolId ? vind('Scholen', k.schoolId) : null, p = k.persoonId ? vind('Personen', k.persoonId) : null, sMap = {}, pMap = {}, kMap = {};
  if (s) sMap[s.id] = s; if (p) pMap[p.id] = p; kMap[k.id] = k;
  var beperkt = kansBeperkt(k);  // v7.3 (R1): wie het project alleen via opstart/vacature/scout ziet (talent) krijgt de kans zonder waarde, notities en historie
  return {
    alleenLezen: beperkt || !mag('pipeline', 'wijzigen', k), beperkt: beperkt,
    kans: beperkt ? kansBeperktUit(k) : kansUit(k, mijlpaalMap()), mijlpalen: mijlpalen(), school: s ? { id: s.id, naam: s.naam, plaats: s.plaats } : null, persoon: p ? { id: p.id, naam: persoonNaam(p), email: p.email, telefoon: p.telefoon } : null,
    personen: s ? lees('Personen').filter(function (x) { return String(x.schoolId) === String(s.id); }).map(function (x) { return { id: x.id, naam: persoonNaam(x) }; }) : [],
    taken: beperkt ? [] : lees('Acties').filter(function (a) { return a.status !== 'af' && String(a.kansId) === String(id); }).sort(sorteerActies).map(function (a) { return taakUit(a, sMap, pMap, kMap); }),
    project: (lees('Trajecten').filter(function (t) { return String(t.kansId) === String(id); }).map(trajectUit)[0]) || null,  // v3.8
    tijdlijn: beperkt ? [] : tijdlijn(lees('Activiteiten').filter(function (a) { return String(a.kansId) === String(id); }), sMap, pMap, kMap),
    // v7.9: de mijlpalen van deze kans als gebeurtenissen (niet voor een beperkte kans, rechtenregel R1); de verwijderde tellen niet en komen niet mee
    fasewissels: beperkt ? [] : wisselsVanKans(id).filter(function (w) { return !w.verwijderd; }).sort(volgordeIngevoerd).map(fasewisselKort)
  };
}
// v7.3 (R1): een kans die iemand alleen via een project ziet, zonder eigen pipeline-recht en zonder eigenaar van dat project te zijn (talent ziet
// een project via opstart, een open vacature of als talentscout: niveau 'opstart'), komt beperkt terug: naam, school en fase blijven, de rest is leeg.
// De AM (eigenaar van het project, niveau 'eigen'/'team') en het management krijgen de kans volledig. Zie het commentaar boven RECHTEN.
function kansBeperkt(k) { return !isBeheerder() && !mag('pipeline', 'zien', k) && niveau('projecten', 'zien') === 'opstart'; }
function kansBeperktUit(k) {
  var u = kansUit(k, null);
  u.waarde = 0; u.kans = 0; u.gewogen = 0; u.volgendeActie = ''; u.deadline = ''; u.verwachteSluiting = ''; u.verliesReden = ''; u.notities = ''; u.tags = []; u.velden = {}; u.persoonId = ''; u.dagenStil = null; u.stil = false;
  u.verliesToelichting = '';  // v7.9
  u.beperkt = true;
  return u;
}
var KANS_VELDEN = ['id', 'naam', 'schoolId', 'persoonId', 'pipeline', 'fase', 'kans', 'waarde', 'verwachteSluiting', 'volgendeActie', 'deadline', 'eigenaar', 'verliesReden', 'tags', 'velden', 'notities', 'traject', 'am',
  'klant', 'schooljaar', 'productsoort', 'verliesToelichting'];  // v7.9: nieuw/bestaand, schooljaar van de opdracht, productsoort, toelichting bij verloren
// v7.9 (R1): de api is een schil om de interne kern. doPost geeft req.args ongefilterd door; een derde argument van een client wordt dus genegeerd,
// zodat geen client een interne bron (assistent, import, reconstructie) kan zetten. maakTraject wordt sinds v3.8 niet meer gebruikt.
function apiKansOpslaan(obj, maakTraject) { return kansOpslaan(obj, null); }
// v7.9: obj.wissel = { datum, bron, ongedaan, oudBevestigd } bij een fasewissel uit de app; obj.overdracht = het winformulier (verplicht bij gewonnen).
// intern = { bron, datum } alleen vanuit Code.gs zelf (apiBreinUitvoeren: bron 'assistent').
function kansOpslaan(obj, intern) {
  var o = schoon(obj || {}, KANS_VELDEN), oud = o.id ? vind('Kansen', o.id) : null, mp = mijlpaalMap(), ms = mijlpalen();
  if (o.id && !oud) throw new Error('Kans niet gevonden.');
  ['naam', 'traject', 'volgendeActie', 'notities', 'verliesReden', 'pipeline'].forEach(function (k) { if (o[k] !== undefined) o[k] = tekstIn(o[k]); });  // v7.3: geen object in een tekstveld; v7.9: ook de pipeline
  if (!oud && !o.naam) throw new Error('Naam is verplicht.');
  if (!oud && !o.schoolId) throw new Error('Kies een school.');
  eis('pipeline', 'wijzigen', oud || { eigenaar: o.eigenaar || ikNaam() });  // v4.0
  if (oud && o.eigenaar !== undefined && o.eigenaar !== oud.eigenaar) eis('pipeline', 'wijzigen', { eigenaar: o.eigenaar });
  if (o.fase !== undefined && ['gewonnen', 'verloren'].indexOf(o.fase) < 0 && !uitMap(mp, o.fase)) throw new Error('Onbekende mijlpaal.');  // v7.9: uitMap ('constructor' is geen mijlpaal)
  var school = null;
  if (o.schoolId) { school = vind('Scholen', o.schoolId); if (!school) throw new Error('School niet gevonden.'); o.school = school.naam; }
  if (!oud) {
    o.aangemaakt = nu(); o.fase = o.fase || ms[0].mijlpaal; o.eigenaar = o.eigenaar || ikNaam(); o.laatsteContact = datumStr(new Date());
    o.traject = o.traject || o.naam; o.pipeline = o.pipeline || (uitMap(mp, o.fase) ? mp[o.fase].pipeline : '');
  }
  ['waarde', 'kans'].forEach(function (k) { if (o[k] !== undefined && o[k] !== '') o[k] = Number(String(o[k]).replace(',', '.')) || 0; });
  // v7.9: de nieuwe velden
  if (o.klant !== undefined) { o.klant = klein(tekstIn(o.klant)); if (o.klant && KLANT_SOORTEN.indexOf(o.klant) < 0) throw new Error('Kies nieuw of bestaand.'); }
  if (o.schooljaar !== undefined) { o.schooljaar = tekstIn(o.schooljaar); if (o.schooljaar) o.schooljaar = schooljaarIn(o.schooljaar); }
  if (o.productsoort !== undefined) { o.productsoort = klein(tekstIn(o.productsoort)); if (o.productsoort && keuzelijst('productsoorten').indexOf(o.productsoort) < 0) throw new Error('Onbekende productsoort.'); }
  if (o.verliesToelichting !== undefined) o.verliesToelichting = tekstIn(o.verliesToelichting).slice(0, 500);
  if (o.verwachteSluiting !== undefined && o.verwachteSluiting !== '') { var vs = tekstIn(o.verwachteSluiting), vsd = datumIn(vs); if (!vsd || vsd !== vs.slice(0, 10)) throw new Error('Ongeldige verwachte tekendatum.'); o.verwachteSluiting = vsd; }
  if (!oud) { o.schooljaar = o.schooljaar || schooljaarVoorstel(o.verwachteSluiting); o.klant = o.klant || klantVoorstel(o.schoolId, o.schooljaar); }  // N13: voorstel; de app toont het en Opslaan bevestigt
  var w = obj && obj.wissel && typeof obj.wissel === 'object' && !(obj.wissel instanceof Array) ? obj.wissel : {};
  var faseWissel = !!oud && o.fase !== undefined && o.fase !== oud.fase, fase = o.fase !== undefined ? o.fase : oud.fase;
  var overdracht = null, plOud = oud ? pipelineVan(oud) : '', rolWissel = false, datumW = '';
  if (w.ongedaan) {
    // 1. Ongedaan maken (B2): de vlag op de wissel, geen tweede event. Geen win-, reden- of verplichtcontrole, geen project, geen nieuwe datum:
    //    gesloten en de verliesreden komen terug uit de laatste geldige sluitende wissel.
    if (!oud || !faseWissel || typeof w.ongedaan !== 'string') throw new Error('Er is niets om ongedaan te maken.');
    var ls = (fase === 'gewonnen' || fase === 'verloren') ? laatsteSluitendeWissel(oud.id, fase, w.ongedaan) : null;
    o.gesloten = ls ? ls.werkelijkeDatum : '';
    o.verliesReden = fase === 'verloren' && ls ? ls.reden : '';
  } else {
    // 2. Pipelinewissel (R7): een open kans naar een andere pipeline; verandert de effectieve rol, dan één wissel (van = naar = fase)
    var plNa = o.pipeline !== undefined && o.pipeline !== '' ? String(o.pipeline) : (oud ? plOud : pipelineVan(o));
    var plWissel = !!oud && plNa !== plOud && kansOpen({ fase: fase });
    if (plWissel && !uitMap(mijlpaalRollen(plNa), fase)) throw new Error('Mijlpaal "' + fase + '" bestaat niet in pipeline "' + plNa + '". Kies eerst een mijlpaal die in beide pipelines bestaat.');
    rolWissel = plWissel && effectieveRol(fase, plOud) !== effectieveRol(fase, plNa);
    // 3. Verloren: een reden uit de lijst (R13: een oudere app krijgt "Herlaad de app")
    if (fase === 'verloren' && (faseWissel || !oud || o.verliesReden !== undefined)) {
      if (keuzelijst('verliesRedenen').indexOf(klein(o.verliesReden !== undefined ? o.verliesReden : oud.verliesReden)) < 0) { eisNieuweApp(); throw new Error('Kies een reden uit de lijst.'); }
      if (o.verliesReden !== undefined) o.verliesReden = klein(o.verliesReden);
    }
    // 4. Gewonnen: altijd via het winformulier, met de getekende contractwaarde en de akkoorddatum
    if (fase === 'gewonnen' && (faseWissel || !oud)) {
      overdracht = overdrachtIn(obj && obj.overdracht, w.oudBevestigd === true);
      if (!overdracht) { eisNieuweApp(); throw new Error('Gewonnen gaat via het winformulier: vul de getekende contractwaarde en de akkoorddatum in.'); }
      o.waarde = overdracht.contractwaarde;
    }
    // 5. Vanaf voorstel: waarde en verwachte tekendatum alleen verplicht met de instelling sturingVerplicht (besluit 4 en 5; standaard uit). N13: bij een wissel,
    //    een nieuwe kans, een rolwissel door een andere pipeline en bij het wijzigen (ook leegmaken) van waarde of tekendatum van een open kans vanaf voorstel
    var waardeNa = o.waarde !== undefined ? o.waarde : (oud ? oud.waarde : ''), sluitingNa = o.verwachteSluiting !== undefined ? o.verwachteSluiting : (oud ? oud.verwachteSluiting : '');
    var raakt = faseWissel || !oud || rolWissel || o.waarde !== undefined || o.verwachteSluiting !== undefined;
    if (raakt && kansOpen({ fase: fase }) && vanafVoorstel(fase, plNa) && sturingVerplicht() && (!(Number(waardeNa) > 0) || !sluitingNa))
      throw new Error('Vul de waarde en de verwachte tekendatum in (verplicht vanaf de voorstelfase).');
    // 6. De werkelijke datum van de wissel: niet in de toekomst, vóór het vorige schooljaar alleen bevestigd; Kansen.gesloten = die datum (niet de invoerdag)
    // v7.9 (review C1): en nooit vóór de vorige mijlpaal van deze kans (ook de akkoorddatum)
    var nietVoor = oud && (faseWissel || rolWissel) ? wisselBuren(oud.id).nietVoor : '';
    if (faseWissel || !oud || rolWissel) datumW = fase === 'gewonnen' && overdracht ? overdracht.akkoorddatum : werkelijkeDatumIn((intern && intern.datum) || w.datum, { oudBevestigd: w.oudBevestigd === true, nietVoor: nietVoor });
    if (nietVoor && datumW && datumW < nietVoor) throw new Error(NIET_VOOR_FOUT);
    if (faseWissel || !oud) o.gesloten = (fase === 'gewonnen' || fase === 'verloren') ? datumW : '';
    if (faseWissel && !kansOpen(oud) && kansOpen({ fase: fase })) { o.verliesReden = ''; o.verliesToelichting = ''; }  // v3.7: heropend; v7.9 (review C8): ook de toelichting
  }
  if ((faseWissel || !oud) && (o.kans === undefined || o.kans === '')) o.kans = fase === 'gewonnen' ? 100 : fase === 'verloren' ? 0 : (uitMap(mp, fase) ? mp[fase].kans : '');
  if (o.tags !== undefined) o.tags = tagsIn(o.tags);
  if (o.velden !== undefined) o.velden = veldenUit(o.velden);
  return metLock(function () {
    controleerConflict('Kansen', o.id, o, obj && obj._oud);  // v3.3
    var fw = null, traject = null;
    if (w.ongedaan) fw = faseWisselOngedaan(oud, w.ongedaan, { huidig: oud.fase, terug: fase });  // eerst controleren en de vlag zetten; gooit vóór er iets geschreven is
    var k = schrijf('Kansen', o);
    if (w.ongedaan) {
      var proj = oud.fase === 'gewonnen' ? lees('Trajecten').filter(function (t) { return String(t.kansId) === String(k.id); })[0] : null;
      schrijf('Activiteiten', { type: 'fase', datum: nu(), door: ikNaam(), schoolId: k.schoolId, persoonId: k.persoonId, kansId: k.id, trajectId: proj ? proj.id : '', bron: 'wissel', aangemaakt: nu(),
        onderwerp: 'Mijlpaal teruggezet: ' + oud.fase + ' → ' + k.fase, tekst: proj ? 'Het project blijft bestaan.' : '' });  // leesbaarheid; telt nergens
    } else if (faseWissel || !oud || rolWissel) {
      var bron = intern && intern.bron && FASE_BRONNEN.indexOf(intern.bron) >= 0 ? intern.bron : k.fase === 'gewonnen' ? 'winformulier' : k.fase === 'verloren' ? 'verloren' : !oud ? 'aanmaken'
        : (FASE_BRONNEN_APP.indexOf(w.bron) >= 0 && w.bron !== 'aanmaken' ? w.bron : 'detail');
      if (faseWissel || !oud) fw = faseWisselVastleggen(k, oud ? oud.fase : '', k.fase, { datum: datumW, bron: bron, vanPipeline: plOud, oudBevestigd: w.oudBevestigd === true });
      else fw = fasewisselsSchrijven([faseWisselRij(k, k.fase, k.fase, { datum: datumW, bron: bron, vanPipeline: plOud })])[0];  // R7: alleen de pipeline (en daarmee de effectieve rol) veranderde
      if (faseWissel && (k.fase === 'gewonnen' || k.fase === 'verloren')) {  // v7.9 (review C1, N8): gesloten volgt de laatste sluitende wissel, net als bij Andere datum
        var lsN = laatsteSluitendeWissel(k.id, k.fase);
        if (lsN && lsN.werkelijkeDatum && lsN.werkelijkeDatum !== k.gesloten) { schrijfVeel('Kansen', [{ id: k.id, gesloten: lsN.werkelijkeDatum }]); k.gesloten = lsN.werkelijkeDatum; }
      }
      if (faseWissel || !oud) {  // de tijdlijnregel blijft voor de leesbaarheid, maar telt nergens meer mee
        schrijf('Activiteiten', { type: 'fase', datum: nu(), door: ikNaam(), schoolId: k.schoolId, persoonId: k.persoonId, kansId: k.id, bron: 'wissel', aangemaakt: nu(),  // v7.9 (review C2): bron wissel, nooit omgezet
          onderwerp: oud ? 'Mijlpaal: ' + oud.fase + ' → ' + k.fase : 'Kans aangemaakt: ' + (k.naam || k.traject) + ' (' + k.fase + ')', tekst: k.fase === 'verloren' && k.verliesReden ? 'Reden: ' + k.verliesReden + (k.verliesToelichting ? '\n' + k.verliesToelichting : '') : '' });
      }
    } else if (oud && fase === 'verloren' && o.verliesReden !== undefined && o.verliesReden !== oud.verliesReden) {
      var lv = laatsteSluitendeWissel(oud.id, 'verloren'); if (lv) wisselsBijwerken([{ id: lv.id, reden: o.verliesReden }]);  // de reden op de wissel volgt de kans
    }
    // v3.8: een gewonnen kans wordt altijd een project voor de accountmanager
    if (!w.ongedaan && k.fase === 'gewonnen' && (faseWissel || !oud)) traject = projectUitKans(k, school, overdracht);
    return { kans: kansUit(k, mp), traject: traject ? trajectUit(traject) : null, fasewissel: fw ? fasewisselKort(fw) : null };
  });
}

/* ----- v7.9: de fasewissel als gebeurtenis (tabblad Fasewissels; docs/sturing-v7.9.md) ----- */

// De werkelijke datum van een wissel. Leeg = vandaag; nooit na vandaag en nooit na het invoermoment; kalenderdagen (datumIn en datumStr),
// dus 23:59 vandaag mag en morgen 00:01 niet, in elke tijdzone. N7: vóór 1 augustus van het vorige schooljaar alleen met oudBevestigd.
// opties = { oudBevestigd, ingevoerdOp, zonderOndergrens, leegMag, nietVoor, nietNa }
// v7.9 (review C1): nietVoor/nietNa = de datum van de vorige/volgende mijlpaal van dezelfde kans (wisselBuren), zodat Kansen.gesloten en de laatste sluitende wissel niet uiteenlopen
function werkelijkeDatumIn(d, opties) {
  opties = opties || {};
  var vandaag = datumStr(new Date());
  if (d === undefined || d === null || d === '') return opties.leegMag ? '' : vandaag;
  if (typeof d === 'object' && !(d instanceof Date)) throw new Error('Ongeldige datum.');
  var s = d instanceof Date ? datumStr(d) : String(d).trim(), x = datumIn(s);
  if (!x || x !== s.slice(0, 10)) throw new Error('Ongeldige datum.');
  if (x > vandaag) throw new Error('De datum ligt in de toekomst.');
  if (opties.ingevoerdOp && x > String(opties.ingevoerdOp).slice(0, 10)) throw new Error('De datum ligt na het invoermoment.');
  if (opties.nietVoor && x < String(opties.nietVoor).slice(0, 10)) throw new Error(NIET_VOOR_FOUT);
  if (opties.nietNa && x > String(opties.nietNa).slice(0, 10)) throw new Error('De datum ligt na de volgende mijlpaal van deze kans.');
  if (!opties.oudBevestigd && !opties.zonderOndergrens && x < ondergrensWerkelijkeDatum()) throw new Error('Deze datum ligt vóór het vorige schooljaar. Bevestig de datum.');
  return x;
}
var NIET_VOOR_FOUT = 'De datum ligt vóór de vorige mijlpaal van deze kans.';
// v7.9 (review C1): de keten van een kans: geldige wissels die op het moment zelf zijn vastgelegd (niet import, capsule, tijdlijn of reconstructie, want
// hun invoermoment zegt niets over de volgorde; niet hernoemd), met een datum, in volgorde van invoer. buren(id) = de grenzen voor die wissel;
// zonder id de grens voor een nieuwe wissel (de laatste datum in de keten).
function wisselBuren(kansId, fwId) {
  var keten = wisselsVanKans(kansId).filter(function (w) { return wisselGeldig(w) && w.werkelijkeDatum && FASE_ROL_OPNIEUW.indexOf(w.bron) < 0 && FASE_TELT_NIET.indexOf(w.bron) < 0; }).sort(volgordeIngevoerd);
  var i = -1, uit = { nietVoor: '', nietNa: '' };
  keten.forEach(function (w, j) { if (fwId && String(w.id) === String(fwId)) i = j; });
  if (fwId && i < 0) return uit;  // een wissel buiten de keten (import, reconstructie): alleen de gewone grenzen
  keten.forEach(function (w, j) {
    var d = String(w.werkelijkeDatum).slice(0, 10);
    if (!fwId || j < i) { if (d > uit.nietVoor) uit.nietVoor = d; }
    else if (j > i && (!uit.nietNa || d < uit.nietNa)) uit.nietNa = d;
  });
  return uit;
}
function ondergrensWerkelijkeDatum() { return (Number(huidigSchooljaar().slice(0, 4)) - 1) + '-08-01'; }

// HET schrijfpunt, in twee delen (R2). faseWisselRij bepaalt en controleert de rij: bron, datum, zekerheid, vanRol, naarRol, rolBron. Geen pad bouwt
// zelf een wisselrij. De paden schrijven met één schrijfVeel per aanroep (fasewisselsSchrijven), zodat hernoemen, import, Capsule, de
// tijdlijnomzetting en de reconstructie lineair blijven (schrijf() leest per rij het hele tabblad opnieuw).
// Plekken die Kansen schrijven: kansOpslaan (wissel via faseWisselVastleggen), apiMijlpalenOpslaan (hernoemd: wissels in dezelfde lock), apiImporteer
// (wissels in dezelfde lock), capsulePagina('kansen') (wissels per pagina), apiFasewisselDatum en apiFasewisselsImport (alleen gesloten, uit de wissels),
// apiMigratieV79('kansen'/'redenen') en projectUitKans (geen fase), zetLaatsteContact, apiSchoolOpslaan, crmInrichten (geen fase), demo en voorbeelddata.
// o = { datum, bron, zekerheid, bewijs, reden, waarde, door, ingevoerdOp, id, vanPipeline, oudBevestigd }
function faseWisselRij(k, van, naar, o) {
  o = o || {};
  var bron = String(o.bron || '');
  if (FASE_BRONNEN.indexOf(bron) < 0) throw new Error('Onbekende bron voor een fasewissel: ' + bron + '.');  // programmeerfout, geen gebruikersmelding
  var ingevoerd = o.ingevoerdOp || nu(), datum, zekerheid;
  if (FASE_BRONNEN_NU.indexOf(bron) >= 0) { datum = werkelijkeDatumIn(o.datum, { oudBevestigd: o.oudBevestigd === true }); zekerheid = 'vastgelegd'; }
  else {
    datum = o.datum ? werkelijkeDatumIn(o.datum, { zonderOndergrens: true, ingevoerdOp: ingevoerd }) : '';  // import, capsule en tijdlijn mogen zonder datum
    zekerheid = !datum && bron !== 'demo' && bron !== 'voorbeeld' ? '' : ZEKERHEDEN.indexOf(o.zekerheid) >= 0 ? o.zekerheid : bron === 'demo' || bron === 'voorbeeld' ? 'vastgelegd' : 'laag';
  }
  var pl = pipelineVan(k) || pipelineVan({ fase: van }), status = rollenStatus();
  return {
    id: o.id || 'fw' + nieuwId().slice(1), kansId: String(k.id), schoolId: k.schoolId || '', van: String(van || ''), naar: String(naar), werkelijkeDatum: datum, ingevoerdOp: ingevoerd,
    door: o.door || ikNaam(), eigenaar: k.eigenaar || '', zekerheid: zekerheid, bron: bron, ongedaan: '',
    vanRol: van ? effectieveRol(van, o.vanPipeline || pl) : '', naarRol: effectieveRol(naar, pl),
    waarde: o.waarde !== undefined ? Number(o.waarde) || 0 : Number(k.waarde) || 0, reden: naar === 'verloren' ? String(o.reden !== undefined ? o.reden : k.verliesReden || '') : '',
    bewijs: o.bewijs ? bewijsSoort(o.bewijs) : '', rolBron: bron === 'capsule' ? 'volgorde' : (pl ? status.pipelinesZonder.indexOf(pl) >= 0 : !status.ingesteld) ? 'leeg' : 'mijlpaal', verwijderd: ''
  };
}
// Nieuwe wissels (en bij de reconstructie ook aangevulde): één schrijfVeel; altijd binnen metLock
function fasewisselsSchrijven(rijen) { if (rijen.length) schrijfVeel('Fasewissels', rijen); return rijen; }
// Bestaande wissels bijwerken (vlag ongedaan/verwijderd, werkelijkeDatum, rollen, reden): alleen { id, <velden> }, één schrijfVeel; altijd binnen metLock
function wisselsBijwerken(lijst) { if (lijst.length) schrijfVeel('Fasewissels', lijst); return lijst.length; }
// Eén wissel: de korte vorm
function faseWisselVastleggen(k, van, naar, o) { return fasewisselsSchrijven([faseWisselRij(k, van, naar, o)])[0]; }
// Per verzoek één keer gelezen (hangt aan _LEES.Fasewissels, zoals instelling()): per kans en de tellende wissels. Alleen lezen: de rijen zijn het origineel.
var _WISSELS = null;
function wisselsData() {
  var bron = _LEES.Fasewissels || (lees('Fasewissels'), _LEES.Fasewissels);
  if (_WISSELS && _WISSELS.bron === bron) return _WISSELS;
  var perKans = {}, tellend = [];
  bron.forEach(function (w) {
    (perKans[String(w.kansId)] = perKans[String(w.kansId)] || []).push(w);
    if (!w.ongedaan && !w.verwijderd && FASE_TELT_NIET.indexOf(w.bron) < 0) tellend.push(w);  // ongedaan, verwijderd en administratief tellen nergens
  });
  _WISSELS = { bron: bron, perKans: perKans, tellend: tellend, deals: null };
  return _WISSELS;
}
function wisselGeldig(w) { return !w.ongedaan && !w.verwijderd; }
function volgordeWerkelijk(a, b) { return String(a.werkelijkeDatum).localeCompare(String(b.werkelijkeDatum)) || String(a.ingevoerdOp).localeCompare(String(b.ingevoerdOp)) || (a._rij || 0) - (b._rij || 0); }
function volgordeIngevoerd(a, b) { return String(a.ingevoerdOp).localeCompare(String(b.ingevoerdOp)) || (a._rij || 0) - (b._rij || 0); }
function wisselsVanKans(kansId) { return (wisselsData().perKans[String(kansId)] || []).slice(); }
// Tellende wissels: niet ongedaan, niet verwijderd, bron niet in FASE_TELT_NIET
function tellendeWissels() { return wisselsData().tellend; }
// Ongedaan maken = de vlag, geen tweede event. Alleen de laatst ingevoerde geldige wissel van deze kans (volgorde ingevoerdOp, N8), en alleen terug naar zijn 'van'.
function faseWisselOngedaan(k, fwId, o) {
  var l = wisselsVanKans(k.id).filter(wisselGeldig).sort(volgordeIngevoerd), w = l[l.length - 1];
  if (!w || String(w.id) !== String(fwId) || String(w.naar) !== String(o.huidig) || String(w.van) !== String(o.terug)) throw new Error('Deze wissel kan niet meer ongedaan worden gemaakt.');
  var t = nu(), u = {};
  wisselsBijwerken([{ id: w.id, ongedaan: t }]);
  for (var x in w) if (x !== '_rij') u[x] = w[x];
  u.ongedaan = t;
  return u;
}
// N8, B2: de laatste geldige sluitende wissel van een kans (naar gewonnen of verloren; niet ongedaan, niet verwijderd); volgorde werkelijkeDatum,
// bij gelijke datum ingevoerdOp. naar = 'gewonnen' | 'verloren' | '' (beide); zonder = een id dat niet meetelt.
function laatsteSluitendeWissel(kansId, naar, zonder) {
  var l = wisselsVanKans(kansId).filter(function (w) { return wisselGeldig(w) && (naar ? w.naar === naar : w.naar === 'gewonnen' || w.naar === 'verloren') && String(w.id) !== String(zonder || ''); });
  l.sort(volgordeWerkelijk);
  return l.length ? l[l.length - 1] : null;
}
// N8: per kans hoogstens één deal (M08, de score van M13, gewonnenWaarde). v7.9 (review C1): alleen een kans die nu gewonnen is (Kansen.fase, zoals M04),
// met als deal zijn laatste tellende wissel naar gewonnen (volgorde werkelijkeDatum, dan ingevoerdOp): dezelfde wissel waar Kansen.gesloten op staat.
function dealWissels() {
  var W = wisselsData(), kb = _LEES.Kansen || (lees('Kansen'), _LEES.Kansen);
  if (!W.deals || W.dealsKansen !== kb) {
    var gewonnen = {}, laatste = {};
    kb.forEach(function (k) { if (k.fase === 'gewonnen') gewonnen[String(k.id)] = true; });
    W.tellend.forEach(function (w) { if (w.naar !== 'gewonnen') return; var k = String(w.kansId), h = laatste[k]; if (!gewonnen[k]) return; if (!h || volgordeWerkelijk(h, w) < 0) laatste[k] = w; });
    W.deals = Object.keys(laatste).map(function (k) { return laatste[k]; });
    W.dealsKansen = kb;
  }
  return W.deals;
}
// Waarvoor telt een wissel (M16): 'ap' | 'ad' | 'voorstel' | 'deal' | 'verloren' | ''. Alleen vooruit en alleen als de effectieve rol verandert;
// een sprong telt voor de fase waar hij eindigt; terug, gelijk of heropenen telt niet; aangemaakt in een latere fase telt als die fase ("direct").
function telRol(w) {
  if (w.naar === 'gewonnen') return 'deal';
  if (w.naar === 'verloren') return 'verloren';
  var nr = String(w.naarRol || '');
  if (['ap', 'ad', 'voorstel'].indexOf(nr) < 0) return '';
  if (!w.van) return nr;
  if ((uitMap(ROL_ORDE, nr) || 0) <= (uitMap(ROL_ORDE, String(w.vanRol || '') || 'lead') || 0)) return '';
  return nr;
}
function wisselLabel(w) { return !w.van && telRol(w) !== '' ? 'direct' : ''; }
// R15: registratievertraging in kalenderdagen: werkelijkeDatum tegen de datum van ingevoerdOp, zonder de tijd (een invoer na 12:00 telt geen extra dag)
function registratieDagen(w) { return w.werkelijkeDatum ? dagenTussen(w.werkelijkeDatum, String(w.ingevoerdOp).slice(0, 10)) : null; }
// Wat de app van een wissel krijgt (kansdetail, melding na slepen)
function fasewisselKort(w) {
  return { id: w.id, van: w.van, naar: w.naar, werkelijkeDatum: w.werkelijkeDatum || '', ingevoerdOp: w.ingevoerdOp || '', door: w.door || '', bron: w.bron, zekerheid: w.zekerheid || '',
    naarRol: w.naarRol || '', ongedaan: !!w.ongedaan, label: wisselLabel(w) };
}

// v7.9: een andere werkelijke datum voor een wissel (kansdetail en de melding na slepen). Niet na vandaag, niet na het invoermoment;
// vóór het vorige schooljaar alleen met opties.oudBevestigd. Kansen.gesloten volgt de laatste sluitende wissel (N8).
function apiFasewisselDatum(id, datum, opties) {
  var w = typeof id === 'string' || typeof id === 'number' ? vind('Fasewissels', id) : null; if (!w) throw new Error('Wissel niet gevonden.');
  var k = vind('Kansen', w.kansId); if (!k) throw new Error('Kans niet gevonden.');
  eis('pipeline', 'wijzigen', k);
  if (w.verwijderd) throw new Error('Deze kans is verwijderd.');
  if (w.ongedaan) throw new Error('Deze wissel is ongedaan gemaakt.');
  if (FASE_TELT_NIET.indexOf(w.bron) >= 0) throw new Error('Een hernoemde mijlpaal heeft geen eigen datum.');
  if (datum === undefined || datum === null || datum === '') throw new Error('Ongeldige datum.');
  var buren = wisselBuren(k.id, w.id);  // v7.9 (review C1): niet vóór de vorige en niet na de volgende mijlpaal van deze kans
  var d = werkelijkeDatumIn(datum, { oudBevestigd: !!(opties && typeof opties === 'object' && opties.oudBevestigd === true), ingevoerdOp: w.ingevoerdOp, nietVoor: buren.nietVoor, nietNa: buren.nietNa });
  return metLock(function () {
    // een datum die iemand bewust invult, krijgt minstens zekerheid hoog (v7.9, review C9: ook een wissel met zekerheid laag of midden)
    wisselsBijwerken([{ id: w.id, werkelijkeDatum: d, zekerheid: ['vastgelegd', 'hoog'].indexOf(w.zekerheid) >= 0 ? w.zekerheid : 'hoog' }]);
    if (k.fase === 'gewonnen' || k.fase === 'verloren') { var ls = laatsteSluitendeWissel(k.id, k.fase); if (ls && ls.werkelijkeDatum && ls.werkelijkeDatum !== k.gesloten) schrijfVeel('Kansen', [{ id: k.id, gesloten: ls.werkelijkeDatum }]); }
    return { fasewissel: fasewisselKort(vind('Fasewissels', w.id)) };
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
  if (o.tekst !== undefined) o.tekst = tekstIn(o.tekst);  // v7.3: geen object als tekst
  if (o.notitie !== undefined) o.notitie = tekstIn(o.notitie);  // v7.3
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
    var naam = tekstIn(w && w.naam).slice(0, 40); if (!naam) throw new Error('Elke weergave heeft een naam nodig.');  // v7.3: tekstIn
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
  var naam = tekstIn(obj.naam); if (!naam) throw new Error('Naam is verplicht.');  // v7.3: geen object als naam
  var stappen = lijstUit(obj.stappen).map(function (s) {
    s = (s && typeof s === 'object' && !(s instanceof Array)) ? s : {};  // v7.3
    var tekst = tekstIn(s.tekst); if (!tekst) throw new Error('Elke stap heeft een tekst nodig.');
    return { tekst: tekst, categorie: taakCategorieen().indexOf(s.categorie) >= 0 ? s.categorie : 'overig', dagenNaStart: Math.max(0, Number(s.dagenNaStart) || 0), prio: PRIOS.indexOf(s.prio) >= 0 ? s.prio : 'midden' };
  });
  if (!stappen.length) throw new Error('Geef minstens één stap.');
  return metLock(function () {
    // eerste eigen track: de standaardtracks meenemen, anders verdwijnen ze uit de lijst
    if (!lees('Tracks').length) schrijfVeel('Tracks', STANDAARD_TRACKS.map(function (t) { return { id: t.id, naam: t.naam, omschrijving: t.omschrijving, stappen: t.stappen }; }));
    schrijf('Tracks', { id: obj.id || undefined, naam: naam, omschrijving: tekstIn(obj.omschrijving), stappen: stappen });  // v7.3
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
  var titel = tekstIn(obj.titel); if (!titel) throw new Error('Geef de afspraak een titel.');  // v7.3: geen object als titel
  var locatie = tekstIn(obj.locatie), notitie = tekstIn(obj.notitie);  // v7.3: ook de locatie en de notitie zijn tekst
  if (!/\d{2}:\d{2}/.test(String(obj.start || ''))) throw new Error('Kies een datum en tijd.');
  var start = parseDatum(String(obj.start).replace('T', ' ')); if (!start) throw new Error('Ongeldige datum.');
  var duur = Math.max(5, Number(obj.duurMin) || 60), eind = new Date(start.getTime() + duur * 60000);
  var k = vulKoppeling(schoon(obj, ['schoolId', 'persoonId', 'kansId', 'trajectId']));  // v3.8: ook in een project
  if (!k.schoolId && !k.persoonId && !k.kansId) throw new Error('Koppel de afspraak aan een school, persoon of kans.');
  eisKoppeling(k);  // v4.0
  var gasten = [];
  if (obj.uitnodigen && k.persoonId) { var p = vind('Personen', k.persoonId); if (p && p.email) gasten.push(p.email); }
  if (GEBRUIKER && GEBRUIKER.email && GEBRUIKER.id !== 'beheer') gasten.push(GEBRUIKER.email);  // de accountmanager staat zelf ook in de afspraak
  var ev = CalendarApp.getDefaultCalendar().createEvent(titel, start, eind, { description: notitie, location: locatie, guests: gasten.join(','), sendInvites: gasten.length > 0 });
  var a = metLock(function () {
    return schrijf('Activiteiten', { type: 'afspraak', datum: datumTijdStr(start), duurMin: duur, door: ikNaam(), schoolId: k.schoolId || '', persoonId: k.persoonId || '', kansId: k.kansId || '',
      onderwerp: titel, tekst: notitie, agendaId: agendaSleutel(ev), bron: 'app', aangemaakt: nu(), trajectId: k.trajectId || '' });
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
    // v7.9 (punt 17, R9, R10): per zichtbaar lopend project contract − gefactureerd (nogTeFacturerenVan, in centen, alleen Trajecten en Facturen, geen uren),
    // per project op nul geklemd; de som in euro's, zoals de sleutel teFactureren altijd was
    var fac = {}; lees('Facturen').forEach(function (f) { (fac[f.trajectId] = fac[f.trajectId] || []).push(f); });
    var c = 0; mijn.forEach(function (t) { if (mag('facturatie', 'zien', t)) c += Math.max(0, nogTeFacturerenVan(t, fac[t.id] || [])); });
    uit.teFactureren = Math.round(c) / 100;
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
    else if (a.type === 'taak' && /^Taak afgerond/.test(String(a.onderwerp))) x.takenAf++;
  });
  // v7.9: voorstellen uit Fasewissels (rol voorstel op de werkelijke datum, op de eigenaar van de kans), niet meer uit de tekst van de tijdlijn
  var zichtK = perId(kansen), blokVo = rolBlokkade();
  tellendeWissels().forEach(function (w) { if (zichtK[String(w.kansId)] && inPeriode(w.werkelijkeDatum) && telRol(w) === 'voorstel') p(w.eigenaar).voorstellen++; });
  kansen.forEach(function (k) {
    if (inPeriode(k.aangemaakt)) p(k.eigenaar).nieuweKansen++;
    if (k.fase === 'gewonnen' && inPeriode(k.gesloten)) { p(k.eigenaar).gewonnen++; p(k.eigenaar).gewonnenWaarde += Number(k.waarde) || 0; }
    if (k.fase === 'verloren' && inPeriode(k.gesloten)) p(k.eigenaar).verloren++;
  });
  var namen = eigenaar ? [eigenaar] : Object.keys(per).filter(function (n) { var c = per[n]; return magPersoon(n) && (n !== 'Onbekend' || Object.keys(c).some(function (k) { return c[k]; })); });
  var team = leeg();
  namen.forEach(function (n) { var c = per[n] || leeg(); Object.keys(team).forEach(function (k) { team[k] += c[k]; }); });
  if (blokVo) { team.voorstellen = null; Object.keys(per).forEach(function (n) { per[n].voorstellen = null; }); }  // v7.9 (B1): zonder rollen geen 0
  var doelen = doelenVan(preset, periodeSleutelVan(preset, van));  // v7.9: standaard plus de doelen van precies deze periode
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
    preset: preset, van: van, tot: tot, eigenaar: eigenaar || '', gebruikers: mensen, ik: ikUit(), team: team, geblokkeerd: blokVo ? { voorstellen: blokVo } : {},
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
  // v7.9: Fasewissels wordt nooit gearchiveerd (meerjarige curve, M05); alleen Activiteiten, TalentUren en Metingen
  var grens = datumStr(plusDagen(-365)), alle = lees('Activiteiten');  // v7.2: kalenderdagen (geen uurdrift rond de zomertijd)
  var isOud = function (a) { var d = String(a.datum).slice(0, 10); return !!d && d < grens; };
  var oud = alle.filter(isOud), houden = alle.filter(function (a) { return !isOud(a); });
  if (!oud.length) return { gearchiveerd: 0, over: houden.length, uren: archiveerUren(), metingen: opruimMetingen(), datakwaliteit: opruimDatakwaliteit() };  // v7.6: uren en metingen ook zonder oude activiteit; v7.9: datakwaliteit na 90 dagen
  schrijfVeel('Activiteiten_archief', oud);
  var b = blad('Activiteiten'), kop = TABELLEN.Activiteiten, laatste = b.getLastRow();
  if (laatste > 1) b.getRange(2, 1, laatste - 1, kop.length).clearContent();
  if (houden.length) b.getRange(2, 1, houden.length, kop.length).setValues(houden.map(function (r) { return kop.map(function (k) { return celUit(r[k]); }); }));
  vergeet('Activiteiten');
  var uren = archiveerUren();  // v5.0
  var metingen = opruimMetingen();  // v7.6
  var dq = opruimDatakwaliteit();  // v7.9: de dagelijkse datacontracten na 90 dagen (Fasewissels nooit)
  return { gearchiveerd: oud.length, over: houden.length, uren: uren, metingen: metingen, datakwaliteit: dq };
}
// v5.0: weekuren ouder dan 26 weken naar TalentUren_archief (zelfde aanpak: eerst het archief schrijven, dan het tabblad in één keer herschrijven)
var UREN_ARCHIEF_WEKEN = 26;  // v7.4: één archiefvenster voor het archiveren en voor de urenimport (oudere diensten worden niet meer ingelezen)
function urenArchiefGrens(vandaag) { var d = parseDatum(vandaag || datumStr(new Date())); return isoWeekStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - UREN_ARCHIEF_WEKEN * 7, 12)); }  // kalenderdagen
function archiveerUren() {
  var grens = urenArchiefGrens(), alle = lees('TalentUren');  // v7.2: kalenderdagen; v7.4: via urenArchiefGrens
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
// v7.9: de concrete periode van een doel: week 2026-W46, maand 2026-11, kwartaal 2026-Q4, halfjaar 2026-H2, jaar 2026, schooljaar 2026-2027
var PERIODE_SLEUTEL_RE = { week: /^\d{4}-W\d{2}$/, maand: /^\d{4}-(0[1-9]|1[0-2])$/, kwartaal: /^\d{4}-Q[1-4]$/, halfjaar: /^\d{4}-H[12]$/, jaar: /^\d{4}$/, schooljaar: /^\d{4}-\d{4}$/ };
function periodeSleutelVan(preset, datum) {
  var d = datum instanceof Date ? datum : parseDatum(String(datum || '').slice(0, 10)) || new Date(), j = d.getFullYear(), m = d.getMonth();
  if (preset === 'week') return isoWeekStr(d);
  if (preset === 'maand') return j + '-' + ('0' + (m + 1)).slice(-2);
  if (preset === 'kwartaal') return j + '-Q' + (Math.floor(m / 3) + 1);
  if (preset === 'halfjaar') return j + '-H' + (m < 6 ? 1 : 2);
  if (preset === 'jaar') return String(j);
  if (preset === 'schooljaar') return schooljaarVan(datumStr(d));
  return '';
}
function periodeSleutelGeldig(preset, sleutel) { var re = uitMap(PERIODE_SLEUTEL_RE, preset); return !!re && re.test(String(sleutel)) && (preset !== 'schooljaar' || Number(String(sleutel).slice(5)) === Number(String(sleutel).slice(0, 4)) + 1); }
// De ene idregel voor apiDoelOpslaan, apiWeekdoelenOpslaan en hernoemGebruiker (R5): een concrete periode zit in het id, zodat de historie blijft
// v7.9 (review C6): slug() kapt af op 60 tekens; met een concrete periode komt de sleutel daarom los achteraan (nooit afgekapt), anders vielen bij een
// lange naam twee weken op één id. Zonder sleutel (de standaarddoelen) blijft het oude id.
function doelId(eigenaar, periode, metric, sleutel) { return sleutel ? slug(eigenaar) + '-' + slug(periode + '-' + metric) + '-' + slug(sleutel) : slug(eigenaar + '-' + periode + '-' + metric); }
// v7.9: oude namen van een cijfer (omzet, vo, deal) naar de naam in METRIEKEN, alleen als die bestaat; uitMap (N1)
function metriekVan(m) { var x = typeof m === 'string' ? m : '', a = uitMap(METRIEK_ALIAS, x); return a && uitMap(METRIEKEN, a) ? a : x; }
function apiDoelen() {
  var mensen = zichtbareMensen(), eigenaren = [];
  if (isBeheerder()) eigenaren.push({ waarde: 'bedrijf', label: 'Bedrijf (iedereen)', team: 'bedrijf' });
  (isBeheerder() ? RAPPORT_TEAMS : RAPPORT_TEAMS.filter(function (t) { return isTeamlead() && GEBRUIKER.team === t; })).forEach(function (t) {
    eigenaren.push({ waarde: 'team:' + t, label: TEAM_DOELNAAM[t], team: t });
    teamNamen(t).forEach(function (n) { eigenaren.push({ waarde: n, label: n, team: t }); });
  });
  // v7.9 (N9): de standaarddoelen plus de concrete doelen van deze en de volgende periode; oudere concrete doelen blijven in de Sheet (historie)
  var sleutels = {}, geldt = {};
  DOEL_PERIODES.forEach(function (p) {
    var nu0 = periodeBereik(p, 0), volg = parseDatum(nu0.eind); volg = new Date(volg.getFullYear(), volg.getMonth(), volg.getDate() + 1, 12);
    var deze = periodeSleutelVan(p, nu0.van), volgende = periodeSleutelVan(p, volg);
    sleutels[p] = [{ waarde: deze, label: 'Deze ' + PERIODE_WOORD[p] + ' (' + deze + ')' }, { waarde: volgende, label: 'Volgende ' + PERIODE_WOORD[p] + ' (' + volgende + ')' }];
    geldt[p + '|' + deze] = true; geldt[p + '|' + volgende] = true;
  });
  return { doelen: lees('Doelen').filter(function (d) { return doelZichtbaar(d.eigenaar, mensen) && (!String(d.periodeSleutel || '') || geldt[d.periode + '|' + String(d.periodeSleutel)]); })
      .map(function (d) { return { id: d.id, eigenaar: d.eigenaar, periode: d.periode, metric: metriekVan(d.metric), doel: Number(d.doel) || 0, periodeSleutel: String(d.periodeSleutel || '') }; }),  // v7.9: een oud doel op omzet heet contractwaarde (alias)
    metrics: Object.keys(METRIEKEN).filter(doelbaar), metrieken: metriekDefs().filter(function (d) { return doelbaar(d.id); }), periodes: DOEL_PERIODES,  // v7.9: alleen doelbare cijfers
    gebruikers: mensen, eigenaren: eigenaren, teamNamen: TEAM_DOELNAAM, magZetten: isBeheerder() || isTeamlead(),
    sleutels: sleutels, weekdoelMetrieken: WEEKDOEL_METRIEKEN };  // v7.9
}
var PERIODE_WOORD = { week: 'week', maand: 'maand', kwartaal: 'kwartaal', halfjaar: 'helft', jaar: 'jaar', schooljaar: 'schooljaar' };
function eisDoelRecht(eigenaar) {
  if (isBeheerder()) return;
  eigenaar = String(eigenaar);
  if (eigenaar === 'bedrijf') throw new Error('Alleen het management zet bedrijfsdoelen.');
  if (eigenaar.indexOf('team:') === 0) { if (isTeamlead() && eigenaar === 'team:' + GEBRUIKER.team) return; throw new Error('Alleen het management of de teamlead zet doelen voor dit team.'); }
  if (!isTeamlead() || teamNamen(GEBRUIKER.team).indexOf(eigenaar) < 0) throw new Error('Alleen het management of de teamlead zet doelen voor dit team.');
}
function apiDoelOpslaan(obj) {
  obj = obj || {};
  var eigenaar = tekstIn(obj.eigenaar);  // v7.3: tekstIn
  if (!eigenaar) throw new Error('Kies een persoon.');
  eisDoelRecht(eigenaar);
  if (obj.id) { var oudDoel = vind('Doelen', obj.id); if (oudDoel) eisDoelRecht(oudDoel.eigenaar); }
  if (DOEL_PERIODES.indexOf(obj.periode) < 0) throw new Error('Kies week, maand, kwartaal, half jaar, jaar of schooljaar.');
  var metric = metriekVan(obj.metric);  // v7.9: alias (omzet, vo, deal) en uitMap (N1: 'constructor' is geen maatstaf)
  if (!uitMap(METRIEKEN, metric) || !doelbaar(metric)) throw new Error('Onbekende maatstaf.');  // v7.9: geen doel op een cijfer uit de sturing (register)
  if (eigenaar === 'bedrijf' && METRIEKEN[metric].team !== 'bedrijf') throw new Error('Kies een bedrijfscijfer voor een bedrijfsdoel.');  // v4.2
  var sleutel = obj.periodeSleutel === undefined || obj.periodeSleutel === null ? '' : tekstIn(obj.periodeSleutel);  // v7.9: leeg = standaard voor elke periode
  if (sleutel && !periodeSleutelGeldig(obj.periode, sleutel)) throw new Error('Kies een geldige periode.');
  var id = doelId(eigenaar, obj.periode, metric, sleutel);
  metLock(function () {
    if (obj.id && obj.id !== id) verwijderRijen('Doelen', function (d) { return String(d.id) === String(obj.id); });  // v3.7: bewerkt doel met andere persoon, periode of maatstaf
    schrijf('Doelen', { id: id, eigenaar: eigenaar, periode: obj.periode, metric: metric, doel: Math.max(0, Number(obj.doel) || 0), periodeSleutel: sleutel });
  });
  return apiDoelen();
}
// v7.9 (M17): de weekdoelen van het OC-team in één aanroep. sleutel = ISO-week; lijst = [{ eigenaar, metric, doel }]; leeg of 0 haalt het doel weg
function apiWeekdoelenOpslaan(sleutel, lijst) {
  sleutel = tekstIn(sleutel);
  if (!periodeSleutelGeldig('week', sleutel)) throw new Error('Kies een geldige week.');
  if (!(lijst instanceof Array) || !lijst.length) throw new Error('Geef minstens één weekdoel.');
  if (lijst.length > 500) throw new Error('Te veel weekdoelen in één keer.');
  var rijen = [], weg = {};
  lijst.forEach(function (x) {
    if (!x || typeof x !== 'object' || x instanceof Array) throw new Error('Elk weekdoel heeft een persoon, een maatstaf en een doel.');
    var eig = tekstIn(x.eigenaar), m = metriekVan(x.metric);
    if (!eig) throw new Error('Kies een persoon.');
    eisDoelRecht(eig);
    if (WEEKDOEL_METRIEKEN.indexOf(m) < 0) throw new Error('Kies een weekdoel: ' + WEEKDOEL_METRIEKEN.join(', ') + '.');
    var w = x.doel === '' || x.doel === null || x.doel === undefined ? 0 : Number(String(x.doel).replace(',', '.'));
    if (!isFinite(w) || w < 0) throw new Error('Een doel is 0 of meer.');
    var id = doelId(eig, 'week', m, sleutel);
    if (w > 0) rijen.push({ id: id, eigenaar: eig, periode: 'week', metric: m, doel: w, periodeSleutel: sleutel }); else weg[id] = true;
  });
  metLock(function () {
    if (Object.keys(weg).length) verwijderRijen('Doelen', function (d) { return !!weg[String(d.id)]; });
    if (rijen.length) schrijfVeel('Doelen', rijen);
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
  // oude notities bij trajecten naar de tijdlijn (het tabblad Notities blijft staan; de kopie krijgt id nt-<id>, zodat een herhaalde run niets dubbel zet)
  var tMap = perId(lees('Trajecten')), gezien = perId(lees('Activiteiten'));
  var nt = lees('Notities').filter(function (n) { return !gezien['nt-' + n.id]; }).map(function (n) {
    var t = tMap[String(n.trajectId)] || {};
    return { id: 'nt-' + n.id, type: 'notitie', datum: n.datum, door: '', trajectId: n.trajectId, schoolId: t.schoolId || naarId[klein(t.school)] || '', tekst: n.tekst, bron: 'notities', aangemaakt: nu() };
  });
  stats.notities = schrijfVeel('Activiteiten', nt).ingevoegd;
  stats.fasewissels = fasewisselsUitTijdlijn(true).geschreven;  // v7.9: oude tijdlijnregels worden één keer een wissel (bron tijdlijn)
  return stats;
}

/* ----- v7.9: oude tijdlijnregels, de overstap naar v7.9 en de eenmalige import van werkelijke datums (docs/sturing-v7.9.md) ----- */

// Oude tijdlijnregels ("Mijlpaal: a → b" en "Kans aangemaakt: … (fase)") worden één keer een wissel met bron tijdlijn (id tl-<activiteitId>, zekerheid laag,
// datum = het invoermoment van de regel). Een regel waar al een wissel bij hoort (dezelfde kans en mijlpaal op dezelfde dag, zoals een regel die
// kansOpslaan sinds v7.9 naast zijn wissel schrijft) wordt overgeslagen. toepassen = false: alleen tellen. Altijd binnen metLock bij toepassen.
// v7.9 (review C2, C3): een regel met bron wissel (die kansOpslaan naast zijn wissel schrijft) en elke regel die is aangemaakt na de eerste omzetting
// (scripteigenschap V79_START, één keer gezet door setup(), Beheer → Inrichten of de overstap) wordt nooit omgezet, ook niet als iemand er later
// de datum of het onderwerp van wijzigt. Een regel met een datum in de toekomst wordt overgeslagen en apart geteld (toekomst, alleen een aantal);
// een regel die faseWisselRij weigert ook (fout), zodat één regel de stap niet laat mislukken.
function fasewisselsUitTijdlijn(toepassen) {
  var kMap = perId(lees('Kansen')), bestaand = {}, gezien = {}, rijen = [], uit = { teOmzetten: 0, alOmgezet: 0, zonderKans: 0, toekomst: 0, fout: 0, geschreven: 0 };
  var start = String(P.getProperty('V79_START') || ''), vandaag = datumStr(new Date());
  lees('Fasewissels').forEach(function (w) {
    bestaand[String(w.id)] = true;
    gezien[String(w.kansId) + '|' + w.naar + '|' + String(w.ingevoerdOp).slice(0, 10)] = true;
    if (w.werkelijkeDatum) gezien[String(w.kansId) + '|' + w.naar + '|' + w.werkelijkeDatum] = true;
  });
  lees('Activiteiten').concat(lees('Activiteiten_archief')).forEach(function (a) {
    if (a.type !== 'fase' || !a.kansId || a.bron === 'wissel') return;
    if (start && a.aangemaakt && String(a.aangemaakt) >= start) { uit.alOmgezet++; return; }
    var t = String(a.onderwerp || ''), m = /^Mijlpaal: (.+) → (.+)$/.exec(t), n = m ? null : /^Kans aangemaakt: .*\(([^()]+)\)$/.exec(t);
    if (!m && !n) return;
    var van = m ? m[1].trim() : '', naar = (m ? m[2] : n[1]).trim(), dag = String(a.datum).slice(0, 10), id = 'tl-' + a.id;
    if (bestaand[id] || gezien[String(a.kansId) + '|' + naar + '|' + dag]) { uit.alOmgezet++; return; }
    var k = kMap[String(a.kansId)]; if (!k) { uit.zonderKans++; return; }
    if (dag > vandaag) { uit.toekomst++; return; }
    var rij = null;
    try { rij = faseWisselRij(k, van, naar, { bron: 'tijdlijn', datum: dag, zekerheid: 'laag', id: id, door: a.door || '', ingevoerdOp: String(a.datum).length > 10 ? String(a.datum).slice(0, 16) : dag + ' 12:00' }); }
    catch (e) { uit.fout++; return; }
    uit.teOmzetten++;
    if (toepassen) rijen.push(rij);
    gezien[String(a.kansId) + '|' + naar + '|' + dag] = true;
  });
  if (toepassen) {
    uit.geschreven = fasewisselsSchrijven(rijen).length;  // R2: één schrijfVeel
    if (!start) P.setProperty('V79_START', nu());  // review C2: vanaf nu wordt geen nieuwe tijdlijnregel meer omgezet
  }
  return uit;
}
// R6: zijn de verliesredenen gekoppeld? Geen verloren kans en geen tellende verloren-wissel met een reden buiten de keuzelijst (data-gedreven, dus ook na een import)
function redenenBuitenLijst() {
  var lijst = keuzelijst('verliesRedenen'), uit = {};
  // precies zoals in de lijst (kleine letters): "Te duur" is nog niet gekoppeld, want M21 groepeert op de waarde zelf
  lees('Kansen').forEach(function (k) { if (k.fase === 'verloren' && lijst.indexOf(String(k.verliesReden || '')) < 0) uit[String(k.verliesReden || '')] = (uit[String(k.verliesReden || '')] || 0) + 1; });
  tellendeWissels().forEach(function (w) { if (w.naar === 'verloren' && lijst.indexOf(String(w.reden || '')) < 0) uit[String(w.reden || '')] = (uit[String(w.reden || '')] || 0) + 1; });
  return uit;
}
function redenenGekoppeld() { return !Object.keys(redenenBuitenLijst()).length; }
// Welke wissels zet "Rollen opnieuw toepassen" opnieuw: rol leeg of gegokt op volgorde, en elke bron uit FASE_ROL_OPNIEUW (nooit een app-wissel met rolBron mijlpaal)
function wisselOpnieuw(w) { return w.rolBron === 'leeg' || w.rolBron === 'volgorde' || FASE_ROL_OPNIEUW.indexOf(w.bron) >= 0; }
var V79_STAPPEN = ['status', 'rollen', 'tijdlijn', 'wissels', 'kansen', 'redenen'];

// v7.9 (B1, R6, R7): wat een bestaande Sheet nodig heeft om de nieuwe tellingen te laten kloppen. Elke stap is standaard een proefdraai; met
// opties.toepassen === true schrijft hij binnen metLock met één schrijfVeel per tabblad. Alleen tellingen en ids, nooit namen of bedragen.
// stap: status | rollen (opties.rollen = { <mijlpaalId>: rol }) | tijdlijn | wissels | kansen | redenen (opties.koppeling = { '<oud>': '<lijstwaarde>' })
function apiMigratieV79(stap, opties) {
  alleenBeheerder();
  stap = typeof stap === 'string' ? stap : '';
  if (V79_STAPPEN.indexOf(stap) < 0) throw new Error('Onbekende stap. Kies ' + V79_STAPPEN.join(', ') + '.');
  opties = opties && typeof opties === 'object' && !(opties instanceof Array) ? opties : {};
  var toepassen = opties.toepassen === true;
  if (stap === 'status') {
    var kOpen = lees('Kansen').filter(kansOpen), buiten = redenenBuitenLijst(), tl = fasewisselsUitTijdlijn(false);
    return { stap: stap, rollen: rollenStatus(), tijdlijn: { teOmzetten: tl.teOmzetten, alOmgezet: tl.alOmgezet, toekomst: tl.toekomst, fout: tl.fout },
      wissels: { teHerzien: lees('Fasewissels').filter(wisselOpnieuw).length },
      kansen: { zonderSchooljaar: kOpen.filter(function (k) { return !k.schooljaar; }).length, zonderKlant: kOpen.filter(function (k) { return !k.klant; }).length },
      redenen: { gekoppeld: !Object.keys(buiten).length, buitenLijst: Object.keys(buiten).reduce(function (n, r) { return n + buiten[r]; }, 0) } };
  }
  if (stap === 'rollen') {
    var ms = lees('Mijlpalen').filter(function (m) { return m.mijlpaal; }), zonder = rollenStatus().pipelinesZonder, opVolgorde = ['lead', 'ap', 'ad', 'voorstel'];
    var voorstel = [];
    zonder.forEach(function (pl) {
      ms.filter(function (m) { return (m.pipeline || 'Scholen') === pl; }).sort(function (a, b) { return (Number(a.volgorde) || 0) - (Number(b.volgorde) || 0); })
        .forEach(function (m, i) { voorstel.push({ id: String(m.id), pipeline: pl, mijlpaal: String(m.mijlpaal), volgorde: Number(m.volgorde) || 0, voorstel: opVolgorde[i] || '' }); });
    });
    if (!toepassen) return { stap: stap, toegepast: false, pipelines: zonder, mijlpalen: voorstel };
    var keuze = opties.rollen && typeof opties.rollen === 'object' && !(opties.rollen instanceof Array) ? opties.rollen : {}, wijzig = [];
    var nieuw = ms.map(function (m) {
      var x = { id: String(m.id), pipeline: m.pipeline || 'Scholen', volgorde: Number(m.volgorde) || 0, rol: rolIn(m.rol) }, k = uitMap(keuze, x.id);
      if (k !== undefined && !x.rol) {
        var r = klein(typeof k === 'string' ? k : ''); if (MIJLPAAL_ROLLEN.indexOf(r) < 0) throw new Error('Onbekende rol: ' + r + '. Kies lead, ap, ad, voorstel of geen.');
        if (r) { x.rol = r; wijzig.push({ id: x.id, rol: r }); }
      }
      return x;
    });
    rollenControle(nieuw);  // dezelfde controles als Beheer → Mijlpalen: elke rol één keer per pipeline, in volgorde
    metLock(function () { if (wijzig.length) schrijfVeel('Mijlpalen', wijzig); });
    return { stap: stap, toegepast: true, gewijzigd: wijzig.length, rollen: rollenStatus() };
  }
  if (stap === 'tijdlijn') {
    var t0 = toepassen ? metLock(function () { return fasewisselsUitTijdlijn(true); }) : fasewisselsUitTijdlijn(false);
    t0.stap = stap; t0.toegepast = toepassen; return t0;
  }
  if (stap === 'wissels') {
    var kM = perId(lees('Kansen')), perBron = {}, bijwerk = [], nogLeeg = 0, alle = lees('Fasewissels').filter(wisselOpnieuw);
    alle.forEach(function (w) {
      var k = kM[String(w.kansId)] || {}, pl = pipelineVan({ pipeline: k.pipeline, fase: k.fase }) || pipelineVan({ fase: w.naar }) || pipelineVan({ fase: w.van });
      // dezelfde rolregel als bij het schrijven: faseWisselRij rekent vanRol, naarRol en rolBron (bron tijdlijn: zonder datum, rol uit de mijlpalen); er wordt geen rij geschreven
      var r = faseWisselRij({ id: w.kansId, pipeline: pl, fase: w.naar }, w.van, w.naar, { bron: 'tijdlijn', datum: '', id: w.id, door: w.door });
      var x = { id: w.id, vanRol: r.vanRol, naarRol: r.naarRol, rolBron: r.rolBron };
      if (x.rolBron === 'leeg') nogLeeg++;
      if (x.vanRol !== String(w.vanRol || '') || x.naarRol !== String(w.naarRol || '') || x.rolBron !== String(w.rolBron || '')) { bijwerk.push(x); perBron[w.bron] = (perBron[w.bron] || 0) + 1; }
    });
    if (toepassen) metLock(function () { wisselsBijwerken(bijwerk); });
    return { stap: stap, toegepast: toepassen, bekeken: alle.length, gewijzigd: bijwerk.length, perBron: perBron, nogLeeg: nogLeeg };
  }
  if (stap === 'kansen') {
    var perSj = {}, perKlant = {}, vul = [];
    lees('Kansen').filter(kansOpen).forEach(function (k) {
      if (k.schooljaar && k.klant) return;
      var sj = k.schooljaar ? String(k.schooljaar) : schooljaarVoorstel(k.verwachteSluiting), kl = k.klant || klantVoorstel(k.schoolId, sj), x = { id: k.id };
      if (!k.schooljaar) { x.schooljaar = sj; perSj[sj] = (perSj[sj] || 0) + 1; }
      if (!k.klant) { x.klant = kl; perKlant[kl] = (perKlant[kl] || 0) + 1; }
      vul.push(x);
    });
    if (toepassen) metLock(function () { if (vul.length) schrijfVeel('Kansen', vul); });  // alleen lege velden; geen fasewissel
    return { stap: stap, toegepast: toepassen, aantal: vul.length, perSchooljaar: perSj, perKlant: perKlant };
  }
  // stap === 'redenen'
  var lijst = keuzelijst('verliesRedenen'), buitenR = redenenBuitenLijst(), redenen = Object.keys(buitenR).sort().map(function (r) {
    var kl = klein(r), vs = lijst.indexOf(kl) >= 0 ? kl : uitMap(REDEN_SYNONIEMEN, kl) || '';
    return { reden: r === '' ? '(leeg)' : r, aantal: buitenR[r], voorstel: lijst.indexOf(vs) >= 0 ? vs : '' };
  });
  if (!toepassen) return { stap: stap, toegepast: false, gekoppeld: !redenen.length, redenen: redenen, lijst: lijst };
  var kop = opties.koppeling && typeof opties.koppeling === 'object' && !(opties.koppeling instanceof Array) ? opties.koppeling : {}, naar = {};
  Object.keys(buitenR).forEach(function (r) {
    var v = uitMap(kop, r === '' ? '(leeg)' : r); if (v === undefined && r === '') v = uitMap(kop, '');
    v = klein(typeof v === 'string' ? v : '');
    if (lijst.indexOf(v) < 0) throw new Error('Koppel elke reden aan een reden uit de lijst.');
    naar[r] = v;
  });
  var kansRijen = lees('Kansen').filter(function (k) { return k.fase === 'verloren' && Object.prototype.hasOwnProperty.call(naar, String(k.verliesReden || '')); }).map(function (k) { return { id: k.id, verliesReden: naar[String(k.verliesReden || '')] }; });
  var wisselRijen = tellendeWissels().filter(function (w) { return w.naar === 'verloren' && Object.prototype.hasOwnProperty.call(naar, String(w.reden || '')); }).map(function (w) { return { id: w.id, reden: naar[String(w.reden || '')] }; });
  metLock(function () { if (kansRijen.length) schrijfVeel('Kansen', kansRijen); wisselsBijwerken(wisselRijen); });
  return { stap: stap, toegepast: true, kansen: kansRijen.length, wissels: wisselRijen.length, gekoppeld: redenenGekoppeld() };
}

// v7.9 (punt 22): de eenmalige import van werkelijke datums uit een csv (kans, fase, werkelijke datum, zekerheid, soort bewijs; optioneel van).
// Proefdraai tenzij opties.toepassen; idempotent; 'onbekend' wordt niet geïmporteerd. Een wissel zonder datum (bron import, capsule of tijdlijn) wordt aangevuld,
// anders komt er een nieuwe wissel met bron reconstructie. Daarna volgt Kansen.gesloten de laatste sluitende wissel (N8). Alleen tellingen en regelnummers.
var FW_IMPORT_KOLOMMEN = { kans: ['kans', 'kansid', 'capsuleid', 'capsule'], fase: ['fase', 'naar'], datum: ['werkelijke datum', 'werkelijkedatum', 'datum'], zekerheid: ['zekerheid'], bewijs: ['soort bewijs', 'bewijs'], van: ['van'] };
// v7.9 (review P3): van het bewijs bewaren we alleen de soort uit een vaste lijst, nooit vrije tekst (dataminimalisatie; een naam in een zin bleef anders
// voor altijd in Fasewissels staan). Een niet herkende tekst wordt 'overig' en telt mee in de uitkomst (bewijsOverig).
var FW_BEWIJS = ['agenda', 'mail', 'notitie', 'capsule', 'teamagenda', 'overig'];
var FW_BEWIJS_SYNONIEMEN = { 'e-mail': 'mail', email: 'mail', 'agenda-afspraak': 'agenda', afspraak: 'agenda', 'team agenda': 'teamagenda', 'team-agenda': 'teamagenda', teamapp: 'teamagenda', notities: 'notitie' };
function bewijsSoort(t) { var x = klein(String(t || '')).replace(/\s+/g, ' ').trim(); if (!x) return ''; if (FW_BEWIJS.indexOf(x) >= 0) return x; return uitMap(FW_BEWIJS_SYNONIEMEN, x) || 'overig'; }
function apiFasewisselsImport(tekst, opties) {
  alleenBeheerder();
  opties = opties && typeof opties === 'object' && !(opties instanceof Array) ? opties : {};
  if (tekst !== undefined && tekst !== null && typeof tekst === 'object') throw new Error('Dit veld verwacht tekst.');
  tekst = String(tekst == null ? '' : tekst).replace(/^﻿/, '');
  if (!tekst.trim()) throw new Error('Het bestand is leeg.');
  if (tekst.length > 3 * 1024 * 1024) throw new Error('Het bestand is groter dan 3 MB.');
  var rijen = Utilities.parseCsv(tekst, (tekst.split('\n')[0] || '').indexOf(';') >= 0 ? ';' : ','), kop = (rijen[0] || []).map(function (h) { return klein(h).replace(/\s+/g, ' '); }), idx = {};
  Object.keys(FW_IMPORT_KOLOMMEN).forEach(function (x) { idx[x] = -1; FW_IMPORT_KOLOMMEN[x].some(function (n) { var i = kop.indexOf(n); if (i >= 0) { idx[x] = i; return true; } return false; }); });
  if (idx.kans < 0 || idx.fase < 0 || idx.datum < 0 || idx.zekerheid < 0) throw new Error('De kolommen kans, fase, werkelijke datum en zekerheid zijn verplicht (kopregel op de eerste regel).');
  var kansen = lees('Kansen'), perId_ = perId(kansen), perCap = {}, mp = mijlpaalMap(), vandaag = datumStr(new Date());
  kansen.forEach(function (k) { if (k.capsuleId) perCap[String(k.capsuleId)] = k; });
  var uit = { gelezen: 0, nieuw: 0, aangevuld: 0, ongewijzigd: 0, bewijsOverig: 0, overgeslagen: { onbekend: 0, onbekendeKans: 0, onbekendeFase: 0, datum: 0, leeg: 0 }, regels: { onbekendeKans: [] }, kolommen: kop.filter(Boolean) };
  var schrijfRijen = [], geraakt = {}, nieuweIds = {}, aangevuldIds = {};
  var cel = function (r, x) { return idx[x] >= 0 ? String(r[idx[x]] == null ? '' : r[idx[x]]).trim() : ''; };
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i]; if (!r || !r.some(function (c) { return String(c).trim(); })) continue;
    uit.gelezen++;
    var kId = cel(r, 'kans'), fase = klein(cel(r, 'fase')), dIn = cel(r, 'datum'), zk = klein(cel(r, 'zekerheid')), bewijsT = cel(r, 'bewijs'), bewijs = bewijsSoort(bewijsT), vanIn = klein(cel(r, 'van'));
    if (zk === 'onbekend') { uit.overgeslagen.onbekend++; continue; }
    if (!kId || !fase || !dIn || ['hoog', 'midden', 'laag'].indexOf(zk) < 0) { uit.overgeslagen.leeg++; continue; }
    var k = perId_[kId] || perCap[kId]; if (!k) { uit.overgeslagen.onbekendeKans++; if (uit.regels.onbekendeKans.length < 50) uit.regels.onbekendeKans.push(i + 1); continue; }
    if (fase !== 'gewonnen' && fase !== 'verloren' && !uitMap(mp, fase)) { uit.overgeslagen.onbekendeFase++; continue; }
    var dt = /^\d{1,2}-\d{1,2}-\d{4}$/.test(dIn) ? (parseDatumNl(dIn) ? datumStr(parseDatumNl(dIn)) : '') : datumIn(dIn);
    if (!dt || (/^\d{4}-/.test(dIn) && dt !== dIn.slice(0, 10)) || dt > vandaag) { uit.overgeslagen.datum++; continue; }
    var bestaand = wisselsVanKans(k.id).filter(function (w) { return w.naar === fase && !w.verwijderd; });
    if (bestaand.some(function (w) { return w.werkelijkeDatum === dt; }) || nieuweIds['rec-' + slug(k.id + '-' + fase + '-' + dt)]) { uit.ongewijzigd++; continue; }
    var leeg = bestaand.filter(function (w) { return !w.werkelijkeDatum && !aangevuldIds[w.id] && ['import', 'capsule', 'tijdlijn'].indexOf(w.bron) >= 0; })[0];
    if (leeg) {
      // v7.9 (review C4): ook het aanvullen volgt werkelijkeDatumIn: niet na het invoermoment van de wissel
      try { werkelijkeDatumIn(dt, { zonderOndergrens: true, ingevoerdOp: leeg.ingevoerdOp }); } catch (e) { uit.overgeslagen.datum++; continue; }
      if (bewijs === 'overig' && klein(bewijsT) !== 'overig') uit.bewijsOverig++;
      aangevuldIds[leeg.id] = true; uit.aangevuld++; geraakt[k.id] = k;
      schrijfRijen.push({ id: leeg.id, werkelijkeDatum: dt, zekerheid: zk, bewijs: bewijs, bron: 'reconstructie' });
      continue;
    }
    // van: uit de kolom, anders de mijlpaal ervoor in de pipeline (bij gewonnen en verloren de laatste mijlpaal)
    var pl = pipelineVan(k), lijst = mijlpalen().filter(function (m) { return m.pipeline === pl; }), pos = -1;
    lijst.forEach(function (m, j) { if (m.mijlpaal === fase) pos = j; });
    var van = vanIn || (fase === 'gewonnen' || fase === 'verloren' ? (lijst.length ? lijst[lijst.length - 1].mijlpaal : '') : pos > 0 ? lijst[pos - 1].mijlpaal : '');
    var id = 'rec-' + slug(k.id + '-' + fase + '-' + dt);
    if (bewijs === 'overig' && klein(bewijsT) !== 'overig') uit.bewijsOverig++;
    nieuweIds[id] = true; uit.nieuw++; geraakt[k.id] = k;
    schrijfRijen.push(faseWisselRij(k, van, fase, { bron: 'reconstructie', datum: dt, zekerheid: zk, bewijs: bewijs, id: id, reden: fase === 'verloren' ? (k.fase === 'verloren' ? k.verliesReden : '') : '' }));
  }
  uit.toegepast = opties.toepassen === true;
  if (!uit.toegepast) return uit;
  metLock(function () {
    fasewisselsSchrijven(schrijfRijen);  // R2: nieuwe en aangevulde wissels samen in één schrijfVeel
    var gesl = [];
    Object.keys(geraakt).forEach(function (id) {  // N8: gesloten volgt de laatste sluitende wissel (werkelijkeDatum, dan ingevoerdOp); een oudere reconstructie verdringt de app-wissel niet
      var k = geraakt[id]; if (k.fase !== 'gewonnen' && k.fase !== 'verloren') return;
      var ls = laatsteSluitendeWissel(id, k.fase); if (ls && ls.werkelijkeDatum && ls.werkelijkeDatum !== k.gesloten) gesl.push({ id: id, gesloten: ls.werkelijkeDatum });
    });
    if (gesl.length) schrijfVeel('Kansen', gesl);
    uit.gesloten = gesl.length;
  });
  return uit;
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
    // v7.9 (R7): de rol op volgorde per pipeline (1 lead, 2 ap, 3 ad, 4 voorstel, verder leeg), alleen voor nieuwe rijen en rijen zonder rol,
    // en alleen een rol die in die pipeline nog niet bestaat: een rol die de beheerder in Beheer → Mijlpalen zette, blijft staan
    var huidig = {}; lees('Mijlpalen').forEach(function (m) { huidig[String(m.id)] = m; });
    var alle = lees('Mijlpalen').filter(function (m) { return !rijen.some(function (r) { return r.id === String(m.id); }); }).concat(rijen.map(function (r) { var h = huidig[r.id]; r.rol = h ? rolIn(h.rol) : ''; return r; }));
    var opVolgorde = ['lead', 'ap', 'ad', 'voorstel'];
    uniek(alle.map(function (m) { return m.pipeline || 'Scholen'; })).forEach(function (pl) {
      var inPl = alle.filter(function (m) { return (m.pipeline || 'Scholen') === pl; }).sort(function (a, b) { return (Number(a.volgorde) || 0) - (Number(b.volgorde) || 0); });
      var bezet = {}; inPl.forEach(function (m) { if (rolIn(m.rol)) bezet[rolIn(m.rol)] = true; });
      inPl.forEach(function (m, i) { var r = opVolgorde[i] || ''; if (!rolIn(m.rol) && r && !bezet[r] && rijen.indexOf(m) >= 0) { m.rol = r; bezet[r] = true; } });
    });
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
    // v7.9 (R7): vóór het schrijven de huidige fase per id; een nieuwe kans of een kans met een andere fase (ook bij een herrun op de overstapdag)
    // krijgt een wissel met bron capsule en id per (capsuleId, naar). Een bestaand id wordt niet opnieuw geschreven. Eén schrijfVeel per pagina (R2).
    var faseNu = {}, wisselIds = {}, vandaag = datumStr(new Date());
    lees('Kansen').forEach(function (k) { faseNu[String(k.id)] = k.fase; });
    lees('Fasewissels').forEach(function (w) { wisselIds[String(w.id)] = true; });
    var wissels = [];
    rijen.forEach(function (r) {
      var oudF = faseNu[r.id], basisId = 'cap-f' + r.capsuleId + '-' + slug(r.fase), id = basisId, n = 2;
      if ((oudF !== undefined && String(oudF) === String(r.fase)) || (oudF === undefined && wisselIds[id])) return;
      while (wisselIds[id]) id = basisId + '-' + n++;  // v7.9 (review C10): terug naar een fase met al een wissel (herrun): een nieuw volgnummer, geen fasewijziging zonder wissel
      var dicht = (r.fase === 'gewonnen' || r.fase === 'verloren') && r.gesloten ? datumIn(String(r.gesloten)) : '';
      if (dicht > vandaag) dicht = '';
      wissels.push(faseWisselRij(r, oudF || '', r.fase, { bron: 'capsule', datum: dicht, zekerheid: dicht ? 'laag' : '', id: id, door: r.eigenaar || '' }));
      wisselIds[id] = true;
    });
    schrijfVeel('Kansen', rijen);
    fasewisselsSchrijven(wissels);
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
// v7.9: een schooljaar als jjjj-jjjj (ook 27/28, '27/'28 en 2027/28, zoals apiSchooljaarOpslaan); leeg of ongeldig → een Nederlandse fout
function schooljaarIn(sj) {
  sj = tekstIn(sj);
  var m = /^'?(\d{2}|\d{4})\s*[-\/]\s*'?(\d{2}|\d{4})$/.exec(sj);
  if (m) { var a = m[1].length === 2 ? '20' + m[1] : m[1]; sj = a + '-' + (m[2].length === 2 ? a.slice(0, 2) + m[2] : m[2]); }
  if (!/^\d{4}-\d{4}$/.test(sj) || Number(sj.slice(5)) !== Number(sj.slice(0, 4)) + 1) throw new Error('Schrijf het schooljaar als 2027-2028.');
  return sj;
}
function vorigSchooljaar(sj) { var j = Number(String(sj).slice(0, 4)); return (j - 1) + '-' + j; }
function volgendSchooljaar(sj) { var j = Number(String(sj).slice(0, 4)); return (j + 1) + '-' + (j + 2); }
// v7.9 (N13, keuze K3): het schooljaar van een nieuwe kans: dat van de verwachte tekendatum, anders het huidige
function schooljaarVoorstel(verwachteSluiting) { return verwachteSluiting && parseDatum(String(verwachteSluiting).slice(0, 10)) ? schooljaarVan(verwachteSluiting) : huidigSchooljaar(); }
// v7.9: de stabiele sleutel van een school: BRIN plus vestiging, anders het eigen id (M24, contract geen_dubbele_open_kansen)
function schoolSleutel(s) { return s && s.brin ? String(s.brin) + '-' + (String(s.vestiging || '') || '00') : 'id:' + String(s ? s.id : ''); }
// v7.9: welke scholen waren klant in een schooljaar (een project dat niet gestopt of onduidelijk is, of een gewonnen kans); op schoolSleutel
function klantSleutels(sj) {
  var sMap = perId(lees('Scholen')), naarId = {}, uit = {};
  Object.keys(sMap).forEach(function (id) { naarId[klein(sMap[id].naam)] = id; });
  var sleutelVan = function (schoolId, naam) { var s = sMap[String(schoolId || naarId[klein(naam)] || '')]; return s ? schoolSleutel(s) : ''; };
  lees('Trajecten').forEach(function (t) { if (String(t.schooljaar) === sj && ['gestopt', 'onduidelijk'].indexOf(t.status) < 0) { var x = sleutelVan(t.schoolId, t.school); if (x) uit[x] = true; } });
  lees('Kansen').forEach(function (k) { if (k.fase === 'gewonnen' && (k.schooljaar ? String(k.schooljaar) : k.gesloten ? schooljaarVan(k.gesloten) : '') === sj) { var x = sleutelVan(k.schoolId, k.school); if (x) uit[x] = true; } });
  return uit;
}
// v7.9: 'bestaand' als dezelfde school (zelfde schoolSleutel, dus later ook via BRIN) in het vorige schooljaar een project of een gewonnen kans had, anders 'nieuw'
function klantVoorstel(schoolId, sj) {
  var s = vind('Scholen', schoolId); if (!s) return 'nieuw';
  return klantSleutels(vorigSchooljaar(sj || huidigSchooljaar()))[schoolSleutel(s)] ? 'bestaand' : 'nieuw';
}

/* ----- v7.9: aannames en besluitinstellingen met versie (tabblad Aannames; één rij per versie, alleen toevoegen) ----- */

// De versie met de hoogste versie waarvan ingang <= opDatum (standaard vandaag), anders null. Per verzoek één keer gelezen (hangt aan _LEES.Aannames).
var _AANNAMES = null;
function aanname(naam, opDatum) {
  var bron = _LEES.Aannames || (lees('Aannames'), _LEES.Aannames);
  if (!_AANNAMES || _AANNAMES.bron !== bron) { var per = {}; bron.forEach(function (r) { (per[String(r.naam)] = per[String(r.naam)] || []).push(r); }); _AANNAMES = { bron: bron, per: per }; }
  var d = opDatum || datumStr(new Date()), best = null;
  (uitMap(_AANNAMES.per, String(naam)) || []).forEach(function (r) { if (String(r.ingang || '') <= d && (!best || Number(r.versie) > Number(best.versie))) best = r; });
  if (!best) return null;
  var w = best.waarde; try { w = typeof w === 'string' ? JSON.parse(w) : w; } catch (e) {}
  return { naam: String(best.naam), versie: Number(best.versie) || 0, waarde: w, eigenaar: best.eigenaar, onderbouwing: best.onderbouwing, besluitdatum: best.besluitdatum, ingang: best.ingang, door: best.door, vastgelegd: best.vastgelegd };
}
// §5 besluit 4 en 5: waarde en verwachte tekendatum verplicht vanaf de voorstelrol. Standaard uit (de app vraagt ze, overslaan mag; het contract signaleert).
function sturingVerplicht() { var a = aanname('sturingVerplicht'); return !!a && a.waarde === true; }

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
    var bestaand = {}, teSchrijven = [], ongewijzigd = 0, ongeldig = 0, wissels = [];
    lees(naam).forEach(function (r) { bestaand[String(r.id)] = r; });
    rijen.forEach(function (r) {
      if (!r || typeof r !== 'object') { ongeldig++; return; }
      var o = {}; kop.forEach(function (k) { if (r[k] !== undefined) o[k] = r[k]; });
      if (naam === 'Scholen' && (o.brin !== undefined || o.vestiging !== undefined)) {  // v7.9: dezelfde normalisatie als het schoolvenster; ongeldig wordt overgeslagen
        try { var bv = brinIn(o.brin, o.vestiging); o.brin = bv.brin; o.vestiging = bv.vestiging; } catch (e) { ongeldig++; return; }
      }
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
      // v7.9: een nieuwe kans of een kans met een andere fase krijgt een wissel (bron import); de oude fase is gelezen vóór het schrijven
      if (naam === 'Kansen' && o.fase && (!hit || String(hit.fase) !== String(o.fase))) {
        var samen = {}; Object.keys(hit || {}).forEach(function (x) { samen[x] = hit[x]; }); Object.keys(o).forEach(function (x) { samen[x] = o[x]; });
        var gesloten = o.fase === 'gewonnen' || o.fase === 'verloren', wd = datumIn(tekstIn(typeof r.werkelijkeDatum === 'object' ? '' : r.werkelijkeDatum)) || (gesloten ? datumIn(String(o.gesloten || '')) : '');
        if (wd && wd > datumStr(new Date())) wd = '';  // een datum in de toekomst is geen werkelijke datum
        wissels.push(faseWisselRij(samen, hit ? hit.fase : '', o.fase, { bron: 'import', datum: wd, zekerheid: wd ? 'laag' : '' }));
      }
      teSchrijven.push(o);
    });
    var stats = schrijfVeel(naam, teSchrijven);
    stats.ongewijzigd = ongewijzigd;
    if (ongeldig) stats.ongeldig = ongeldig;
    if (naam === 'Kansen') stats.fasewissels = fasewisselsSchrijven(wissels).length;  // v7.9 (R2): één schrijfVeel
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
    talentTrigger: triggers.indexOf('talentDagelijksTrigger') >= 0, urenTrigger: triggers.indexOf('talentUrenTrigger') >= 0, xpsExportMap: !!P.getProperty('XPS_EXPORT_MAP_ID'), laatsteUrenImport: P.getProperty('LAATSTE_URENIMPORT') || '',  // v5.0
    sturingTrigger: triggers.indexOf('sturingTrigger') >= 0, laatsteSturing: P.getProperty('LAATSTE_STURING') || '' };  // v7.9
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
  talentBronnen:    { standaard: ['website', 'xps-bestand', 'linkedin', 'eigen netwerk', 'sollicitatie', 'anders'], tab: 'Talenten', kolom: 'bron' },
  // v7.9: de reden bij verloren (opgeschoond blijft altijd en telt niet in de conversie) en de productsoort van kans en project.
  // ook = andere tabbladen en kolommen waar een hernoemde waarde mee moet; vast = waarden die in de lijst moeten blijven.
  verliesRedenen:   { standaard: ['te duur', 'geen budget', 'eigen oplossing', 'andere aanbieder', 'geen reactie', 'opgeschoond'], tab: 'Kansen', kolom: 'verliesReden', ook: [['Fasewissels', 'reden']], vast: ['opgeschoond'] },
  productsoorten:   { standaard: ['onderwijsondersteuning', 'huiswerkbegeleiding', 'examentraining', 'studentdocent', 'nt2-ondersteuning', 'surveillance', 'overig'], tab: 'Kansen', kolom: 'productsoort', ook: [['Trajecten', 'productsoort']] }
};
// v7.9: bekende vrije verliesredenen van vóór v7.9 en hun waarde in de keuzelijst (voorstel in de overstap, apiMigratieV79('redenen')); lezen met uitMap
var REDEN_SYNONIEMEN = { 'eigen oplossing gevonden': 'eigen oplossing', 'zelf opgelost': 'eigen oplossing', 'budget': 'geen budget', 'geen geld': 'geen budget', 'te weinig budget': 'geen budget',
  'concurrent': 'andere aanbieder', 'andere partij': 'andere aanbieder', 'gekozen voor een ander': 'andere aanbieder', 'geen reactie meer': 'geen reactie', 'reageert niet': 'geen reactie',
  'te hoge prijs': 'te duur', 'prijs': 'te duur', 'te hoog tarief': 'te duur' };
// v7.6: de instellingen één keer per verzoek in een map. Tot v7.5 kopieerde elke aanroep de hele tab (lees() geeft kopieën), en vogStatus() riep
// instelling() per rij aan: 90 % van alle lees()-aanroepen (apiTalenten 3.162×, apiTeamRapport 2.791×, apiBezetting 1.399× per verzoek). De eerste
// rij per sleutel telt, zoals voorheen; JSON.parse blijft per aanroep, zodat een aanroeper die de lijst wijzigt de map niet raakt. De map hangt aan
// de gelezen rijen zelf (_LEES.Instellingen): vergeet(), maar ook elke reset van _LEES (demo, tests) maakt hem vanzelf ongeldig.
var _INSTELLINGEN = null;
function instelling(sleutel) {
  var bron = _LEES.Instellingen || (lees('Instellingen'), _LEES.Instellingen);
  if (!_INSTELLINGEN || _INSTELLINGEN.bron !== bron) { _INSTELLINGEN = { bron: bron, map: {} }; bron.forEach(function (x) { if (!Object.prototype.hasOwnProperty.call(_INSTELLINGEN.map, x.sleutel)) _INSTELLINGEN.map[x.sleutel] = x.waarde; }); }
  var w = uitMap(_INSTELLINGEN.map, sleutel);
  if (w === undefined || w === '') return null;
  try { return JSON.parse(w); } catch (e) { return null; }
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
  sj = tekstIn(sj);  // v7.3: tekstIn
  if (sj) sj = schooljaarIn(sj);  // v7.9: dezelfde schrijfwijzen als een kans (ook 27/28, '27/'28 en 2027/28)
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
  (def.vast || []).forEach(function (v) { if (waarden.indexOf(v) < 0) throw new Error('"' + v + '" hoort altijd in de lijst; die reden telt niet in de conversie.'); });  // v7.9: opgeschoond
  metLock(function () {
    zetInstelling(sleutel, waarden);
    if (Object.keys(hernoem).length) (def.ook || []).forEach(function (x) { wijzigKolom(x[0], x[1], function (v) { return hernoem[klein(v)]; }); });  // v7.9: ook in Fasewissels.reden en Trajecten.productsoort
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
    Vacatures: ['door'], Kandidaten: ['door'], Talenten: ['door'], Beoordelingen: ['door'], TalentSchool: ['door'], TalentDocumenten: ['door', 'gecontroleerdDoor'],  // v5.0: ook het talentnetwerk
    Fasewissels: ['eigenaar', 'door'], Aannames: ['door'], Datakwaliteit: ['eigenaar'], Cijferdefinities: ['door', 'afgetekendDoor'] };  // v7.9 (R5): de wissels tellen op de eigenaar; pakket 2: datakwaliteit en register
  Object.keys(plekken).forEach(function (tab) { plekken[tab].forEach(function (k) { wijzigKolom(tab, k, function (v) { return String(v) === oud ? nieuw : undefined; }); }); });
  var doelen = lees('Doelen').filter(function (d) { return d.eigenaar === oud; });
  if (doelen.length) {
    verwijderRijen('Doelen', function (d) { return d.eigenaar === oud; });
    // v7.9 (R5): met de concrete periode in de rij én in het id (dezelfde idregel als apiDoelOpslaan), anders vallen alle weekdoelen samen in één standaardrij
    schrijfVeel('Doelen', doelen.map(function (d) { return { id: doelId(nieuw, d.periode, d.metric, d.periodeSleutel), eigenaar: nieuw, periode: d.periode, metric: d.metric, doel: d.doel, periodeSleutel: String(d.periodeSleutel || '') }; }));
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
  // v7.9 (review C2): een mijlpaalregel ontstaat alleen bij een wissel; zijn datum, onderwerp en kans liggen vast (een andere datum gaat via de mijlpaal: Andere datum)
  if (o.type === 'fase' && oud.type !== 'fase') throw new Error('Een mijlpaal leg je vast bij de kans, niet als activiteit.');
  if (o.vorm !== undefined) {  // v7.1: de vorm bepaalt het type; een mijlpaal of taakregel heeft geen vorm
    if (!TYPE_VAN_VORM.hasOwnProperty(o.vorm)) throw new Error('Onbekend soort activiteit.');
    if (oud.type === 'fase' || oud.type === 'taak') throw new Error('Een mijlpaal of afgeronde taak krijgt geen ander soort.');
    o.type = TYPE_VAN_VORM[o.vorm];
  } else if (o.type !== undefined && VORM_VAN_TYPE[o.type]) o.vorm = VORM_VAN_TYPE[o.type];
  if (o.datum !== undefined) { o.datum = datumTijdIn(o.datum); if (!o.datum) throw new Error('Ongeldige datum.'); }
  if (o.duurMin !== undefined) o.duurMin = Number(o.duurMin) || '';
  ['onderwerp', 'tekst'].forEach(function (k) { if (o[k] !== undefined) o[k] = tekstIn(o[k]); });  // v7.3: geen object als tekst
  if (oud.type === 'fase' && oud.kansId && ['datum', 'onderwerp', 'kansId'].some(function (k) { return o[k] !== undefined && String(o[k]) !== String(k === 'datum' ? datumTijdIn(oud.datum) || oud.datum : oud[k]); }))
    throw new Error('De datum, het onderwerp en de kans van een mijlpaalregel liggen vast. Een andere datum zet je bij de mijlpaal zelf (Andere datum).');
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
  if (!open.every(taakVanMijOfTeam)) throw new Error('Daar heb je geen toegang toe.');  // v7.3 (K3): alleen de eigenaar van de taken, zijn teamlead of het management stopt een track
  var eerste = open[0], ids = {}; open.forEach(function (a) { ids[String(a.id)] = true; });
  metLock(function () {
    verwijderRijen('Acties', function (a) { return !!ids[String(a.id)]; });  // v7.3: verwijderRijen leest alleen de id-kolom (licht); het oude filter op trackRunId en status zag die kolommen niet en haalde nooit iets weg (gevonden door de rooktest, K3)
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
  waarde = tekstIn(waarde);  // v7.3: een object als waarde wordt geweigerd
  if (/^kleur_/.test(sleutel) && !/^#[0-9a-fA-F]{6}$/.test(waarde)) throw new Error('Kleur als #RRGGBB.');
  var b = blad('Huisstijl'), hit = lees('Huisstijl').filter(function (r) { return r.sleutel === sleutel; })[0];
  if (hit) b.getRange(hit._rij, 2).setValue(celUit(waarde)); else b.appendRow([sleutel, celUit(waarde)]);
  vergeet('Huisstijl');
}
// Meerdere velden in één keer (één verzoek in plaats van één per veld).
function apiHuisstijlOpslaan(obj) {
  alleenBeheerder();
  obj = obj || {};
  Object.keys(obj).forEach(function (k) { if (!HUISSTIJL_STANDAARD.hasOwnProperty(k)) throw new Error('Onbekend huisstijlveld: ' + (k === '' ? '(leeg)' : k)); });  // v7.3: dezelfde melding als zetHuisstijlVeld
  metLock(function () { Object.keys(obj).forEach(function (k) { zetHuisstijlVeld(k, obj[k]); }); });
  return apiHuisstijl();
}
function apiContentOpslaan(obj) {
  obj = obj || {};
  var c = vind('Content', obj.id); if (!c) throw new Error('Tekst niet gevonden.');
  if (!isBeheerder() && c.door !== ikNaam()) throw new Error('Alleen wie de tekst maakte of de beheerder kan hem wijzigen.');
  var o = { id: c.id };
  if (obj.onderwerp !== undefined) o.onderwerp = tekstIn(obj.onderwerp);  // v7.3: geen object als tekst
  if (obj.tekst !== undefined) { o.tekst = tekstIn(obj.tekst); if (!o.tekst) throw new Error('De tekst is leeg.'); }
  var x = metLock(function () { return schrijf('Content', o); });
  return { id: x.id, datum: x.datum, type: x.type, typeNaam: (CONTENT_TYPES[x.type] || {}).naam || x.type, onderwerp: x.onderwerp, tekst: x.tekst, door: x.door };
}
// Tag overal hernoemen; nieuw leeg = de tag overal weghalen.
function apiTagHernoem(oud, nieuw) {
  alleenBeheerder();
  oud = klein(tekstIn(oud)); nieuw = klein(tekstIn(nieuw)); if (!oud) throw new Error('Welke tag?');  // v7.3: tekstIn
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
  oud = tekstIn(oud); nieuw = tekstIn(nieuw); if (!oud) throw new Error('Welk veld?');  // v7.3: tekstIn
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
      var v = tekstIn(obj[k]); corr[k] = v; d[k] = v;  // v7.3: geen object als school of type
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
//
// v7.3: regels die bóven deze tabel gelden (dezelfde bron voor test/rechten_test.js en later de RLS-policies van Supabase):
// - R1 De kans achter een zichtbaar project (kansenViaProject): wie het project als eigenaar ziet (niveau 'eigen' of 'team': de AM, zijn teamlead,
//      de consultant als adviseur) krijgt de volledige kans met historie; wie het project alleen via 'opstart' ziet (talent: opstart, open vacature,
//      talentscout) krijgt een BEPERKT object (kansBeperkt/kansBeperktUit: naam, school, fase; waarde 0, notities leeg, geen taken of tijdlijn),
//      ook in apiProject, apiCrm (openWaarde) en de zoektool van de assistent. Management ziet alles.
// - R5 Beoordelingen: een bestaande beoordeling wijzigt alleen wie haar gaf, het talentteam (niveau 'alles') of het management. De teamlead van
//      accountmanagement (niveau 'team') wijzigt de beoordelingen van zijn team dus NIET; hij ziet ze wel (keuze v7.3, zie apiBeoordelingOpslaan).
// - R6 De facturatievelden van een project (FACT_VELDEN in apiTrajectOpslaan: soortFacturatie, gefactureerd, factuurDatum, vakanties, bijzonderheden,
//      factuurnummer) vallen onder 'facturatie', de overige projectvelden onder 'projecten'; de consultant leest ze, de AM wijzigt ze.
// - R7 Drie cellen hebben geen eigen api: 'financien' wijzigen (geen api; apiFinancienBevriezen en apiExactImport zijn alleenBeheerder),
//      'beoordelingen' zien (zichtbaar via apiTalent, dus via 'talenten' zien) en 'kandidaten' zien (via apiBezetting en projectBezetting, per project).
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
  financien:     { consultancy: ['eigen', 'geen'], accountmanagement: ['eigen', 'geen'], talent: ['geen', 'geen'] },
  // v7.6: het overzicht van de metingen (apiMetingen) is voor het management; het aanleveren (apiMetingenOpslaan) mag elke ingelogde gebruiker, alleen eigen rijen
  metingen:      { consultancy: ['geen', 'geen'], accountmanagement: ['geen', 'geen'], talent: ['geen', 'geen'] },
  // v7.9: sturing (docs/sturing-v7.9.md). Management mag alles (niveau()). R8 (v7.9): het teamtotaal in de weekweergave ziet elke OC; de regels per persoon volgen sturingWeek.
  cijfers:       { consultancy: ['alles', 'geen'], accountmanagement: ['alles', 'geen'], talent: ['alles', 'geen'] },  // het register: definities lezen iedereen; versies en aftekenen alleen management
  aannames:      { consultancy: ['geen', 'geen'], accountmanagement: ['geen', 'geen'], talent: ['geen', 'geen'] },     // jaardoel en aannames (B1, B3): alleen management
  sturingWeek:   { consultancy: ['eigen', 'geen'], accountmanagement: ['geen', 'geen'], talent: ['geen', 'geen'] },    // weekweergave (B4): OC zichzelf plus het teamtotaal, teamlead zijn team, management alles
  sturingMt:     { consultancy: ['geen', 'geen'], accountmanagement: ['geen', 'geen'], talent: ['geen', 'geen'] },     // MT-overzicht en maanddocument (B2, B7–B14): alleen management (de FD na §5 besluit 12)
  datakwaliteit: { consultancy: ['eigen', 'geen'], accountmanagement: ['eigen', 'geen'], talent: ['eigen', 'geen'] }    // M36 per eigenaar: medewerker zichzelf, teamlead zijn team, management iedereen
};
function niveau(onderdeel, actie) {
  if (isBeheerder()) return 'alles';
  var r = (RECHTEN[onderdeel] || {})[GEBRUIKER.team]; if (!r) return 'geen';  // het externe portaalprofiel (v5.0) staat in geen enkele rij: altijd 'geen'
  var n = r[actie === 'wijzigen' ? 1 : 0];
  return n === 'eigen' && isTeamlead() ? 'team' : n;
}
function eigenaarVan(onderdeel, rij) {
  if (onderdeel === 'pipeline' || onderdeel === 'sturingWeek' || onderdeel === 'datakwaliteit') return rij.eigenaar;  // v7.9: de weekregel en de afwijkingen horen bij hun eigenaar
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
// v7.9 (R3): opties = { door, ookZelf }: sturingTrigger meldt met door 'Athena' en zonder zelffilter (in een trigger is ikNaam() de beheerder, die anders nooit een melding kreeg)
function meld(namen, tekst, link, opties) {
  var o = opties && typeof opties === 'object' ? opties : {}, ik = ikNaam(), door = o.door ? String(o.door) : ik;
  var rijen = uniek([].concat(namen || [])).filter(function (n) { return n && (o.ookZelf === true || n !== ik); })
    .map(function (n) { return { voor: n, tekst: String(tekst).slice(0, 300), link: link || '', datum: nu(), gelezen: '', door: door }; });
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
// Het winformulier van de consultant bij "gewonnen": aantal, startdatum, getekende contractwaarde en akkoorddatum verplicht, de rest optioneel.
// v7.9: afwezig bij gewonnen = geweigerd (een oudere app krijgt "Herlaad de app"); Brein en import lopen niet via dit pad.
// De getekende waarde wordt Kansen.waarde en Trajecten.contractwaarde; de akkoorddatum is de werkelijke datum van de deal (Kansen.gesloten).
function overdrachtIn(x, oudBevestigd) {
  if (!x || typeof x !== 'object' || x instanceof Array) return null;
  var od = { rol: tekstIn(x.rol).slice(0, 120) || 'Onderwijsondersteuner', aantal: Math.round(Number(x.aantal) || 0), rooster: tekstIn(x.rooster).slice(0, 300),
    startdatum: datumIn(tekstIn(x.startdatum)), bijzonderheden: tekstIn(x.bijzonderheden).slice(0, 2000) };  // v7.3: tekstIn
  if (od.aantal < 1 || od.aantal > 99) throw new Error('Vul het aantal ondersteuners in (1 tot 99).');
  if (!od.startdatum) throw new Error('Vul de gewenste startdatum in.');
  // v7.9: de getekende contractwaarde (meer dan € 0, hoogstens tien miljoen) en de akkoorddatum (vandaag of eerder)
  if (x.contractwaarde === undefined || x.akkoorddatum === undefined) eisNieuweApp();
  var cw = typeof x.contractwaarde === 'number' || typeof x.contractwaarde === 'string' ? Number(String(x.contractwaarde).replace(',', '.')) : NaN;
  if (!(cw > 0 && cw <= 10000000)) throw new Error('Vul de getekende contractwaarde in (meer dan € 0).');
  od.contractwaarde = Math.round(cw * 100) / 100;
  if (x.akkoorddatum === undefined || x.akkoorddatum === null || x.akkoorddatum === '') throw new Error('Vul de akkoorddatum in (vandaag of eerder).');
  try { od.akkoorddatum = werkelijkeDatumIn(x.akkoorddatum, { oudBevestigd: oudBevestigd === true }); }
  catch (e) { if (/vorige schooljaar/.test(e.message)) throw e; throw new Error('Vul de akkoorddatum in (vandaag of eerder).'); }
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
  var ev = CalendarApp.getDefaultCalendar().createEvent(titel, start, eind, { description: omschrijving, location: tekstIn(obj.locatie).slice(0, 200), guests: gasten.join(','), sendInvites: gasten.length > 0 });  // v7.3: tekstIn
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
  var oud = taskforceUit(t), tf = { datum: String(obj.datum || oud.datum || '').slice(0, 10), deelnemers: obj.deelnemers !== undefined ? tekstIn(obj.deelnemers) : String(oud.deelnemers || '').trim(), door: ikNaam(), bijgewerkt: nu() };  // v7.3: tekstIn
  TASKFORCE_VRAGEN.forEach(function (v) { tf[v[0]] = obj[v[0]] !== undefined ? tekstIn(obj[v[0]]) : String(oud[v[0]] || '').trim(); });  // v7.3: een object in de hulpvraag of een andere vraag wordt geweigerd
  ['gepland', 'bron'].forEach(function (k) { if (oud[k]) tf[k] = oud[k]; });  // v6.4.2: het tijdstip van de ingeplande meeting en de herkomst (winformulier) blijven bewaard
  var afspraken = (obj.afspraken instanceof Array ? obj.afspraken : []).map(function (a) { a = (a && typeof a === 'object') ? a : {}; return { tekst: tekstIn(a.tekst), eigenaar: tekstIn(a.eigenaar), deadline: datumIn(a.deadline) }; })  // v7.3
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
  ['titel', 'profiel', 'dagen'].forEach(function (k) { if (o[k] !== undefined) o[k] = tekstIn(o[k]); });  // v7.3: geen object als tekst
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
  ['naam', 'telefoon', 'xpsId', 'afasNummer', 'notitie', 'functie', 'dagen', 'xpsPlaatsingId', 'eindReden'].forEach(function (k) { if (o[k] !== undefined) o[k] = tekstIn(o[k]); });  // v7.3: geen object als tekst
  if (o.email !== undefined) o.email = klein(tekstIn(o.email));  // v7.3
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
// v7.9: het register van cijfers (bouwpunt 8, docs/sturing-v7.9.md). Elke sleutel heeft naast team, label, kort en soort: m (M-code of leeg),
// definitie (concept; de code is versie 0), eigenaar (FD, beheerder, teamlead AM of boekhouder), besluit (B-code uit de besluitenboom of leeg),
// tolerantie (tekst: '0' voor aantallen, '1%' voor bedragen, '1' voor procentpunten; concept) en blokkade (extern of door een open besluit; leeg = rekenbaar).
// Een versie in het tabblad Cijferdefinities gaat voor (registerVan). Geschrapte cijfers (deel A §2) komen er niet in. De teams sturing, werk en financien
// zijn alleen voor de definitie: ze staan niet in de teamrapporten en zijn geen doel (doelbaar()). Lezen altijd met uitMap(METRIEKEN, id) (N1).
var METRIEKEN = {
  // --- consultancy (teamrapport en doelen) ---
  gesprekken:            { team: 'consultancy', label: 'Gesprekken', kort: 'Gespr.', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Activiteiten van het type gesprek per maker, op de datum van de activiteit, niet in de toekomst.' },
  afspraken:             { team: 'consultancy', label: 'Afspraken', kort: 'Afspr.', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',  // v7.9 (R18, keuze K2): ongewijzigd; M15 heeft een eigen sleutel
    definitie: 'Activiteiten van het type afspraak per maker, op de datum van de activiteit, niet in de toekomst (ook zonder school). Niet hetzelfde als M15 afspraken gehouden.' },
  mails:                 { team: 'consultancy', label: 'Mails', kort: 'Mails', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Activiteiten van het type mail per maker, op de datum van de activiteit.' },
  nieuweKansen:          { team: 'consultancy', label: 'Nieuwe kansen', kort: 'Kansen', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Kansen aangemaakt in de periode, per eigenaar. Alleen voor teamdoelen; hoort niet bij de MT-sturing (deel A §2).' },
  nieuweScholen:         { team: 'consultancy', label: 'Nieuwe scholen', kort: 'Scholen', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Scholen aangemaakt in de periode, per eigenaar van de school.' },
  // v7.9: uit Fasewissels op de rol en de werkelijke datum (telRol), nooit uit de tekst van de tijdlijn; zonder ingestelde rollen geblokkeerd (B1)
  contactmomenten:       { team: 'consultancy', label: 'Contactmomenten', kort: 'Contact', soort: 'aantal', m: 'M14', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',  // M14: call, mail, whatsapp, afspraak en evaluatie op werkdagen
    definitie: 'Het aantal activiteiten met een contactvorm (call, mail verstuurd, WhatsApp, de afspraak- en evaluatievormen) per maker, op de datum van de activiteit, maandag t/m vrijdag. Ontvangen mails, notities en taken tellen niet. De beheerder heeft een eigen regel, niet in het OC-team.' },
  afsprakenGehouden:     { team: 'consultancy', label: 'Afspraken gehouden', kort: 'Gehouden', soort: 'aantal', m: 'M15', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',  // M15: afspraak- en evaluatievormen bij een school, niet in de toekomst
    definitie: 'Afspraak-activiteiten bij een school. Gehouden = datum in de week, niet afgemeld. Gepland = datum in de volgende werkweek. Afgemeld door de school staat apart.' },
  ap:                    { team: 'consultancy', label: 'AP gepland', kort: 'AP', soort: 'aantal', rol: true, m: 'M16', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',  // M16
    definitie: 'Het aantal fasewissels per eigenaar op werkelijke datum naar de mijlpaal met rol "AP gepland". Een sprong telt voor de fase waar hij eindigt. Een kans die in een latere fase wordt aangemaakt, telt voor die fase met het label "direct".' },
  ad:                    { team: 'consultancy', label: 'AP gehouden', kort: 'AD', soort: 'aantal', rol: true, m: 'M16', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',  // M16
    definitie: 'Het aantal fasewissels per eigenaar op werkelijke datum naar de mijlpaal met rol "AP gehouden". Een sprong telt voor de fase waar hij eindigt. Een kans die in een latere fase wordt aangemaakt, telt voor die fase met het label "direct".' },
  voorstellen:           { team: 'consultancy', label: 'Voorstellen', kort: 'Voorst.', soort: 'aantal', rol: true, m: 'M16', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',  // M16 VO
    definitie: 'Het aantal fasewissels per eigenaar op werkelijke datum naar de mijlpaal met rol "voorstel verstuurd" (VO). Een sprong telt voor de fase waar hij eindigt. Een kans die in een latere fase wordt aangemaakt, telt voor die fase met het label "direct".' },
  gewonnen:              { team: 'consultancy', label: 'Gewonnen', kort: 'Won', soort: 'aantal', m: 'M16', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',  // M08/M16 deal: elke tellende wissel naar gewonnen
    definitie: 'Het aantal fasewissels naar gewonnen (deals) per eigenaar op werkelijke datum (de akkoorddatum). Elke tellende wissel naar gewonnen in de periode telt.' },
  gewonnenWaarde:        { team: 'consultancy', label: 'Gewonnen waarde', kort: 'Won €', soort: 'euro', m: 'M08', besluit: 'B2', eigenaar: 'beheerder', tolerantie: '1%',  // M08: de getekende waarde, per kans één deal (N8)
    definitie: 'Het aantal en de getekende waarde van de kansen waarvan de wissel naar gewonnen een werkelijke datum (akkoorddatum) in de periode heeft, per eigenaar van de kans op dat moment. Achteraf ingevoerd met een eerdere akkoorddatum telt in de periode van de akkoorddatum; zonder werkelijke datum staat apart.' },
  conversie:             { team: 'consultancy', label: 'Conversie (voorstel → gewonnen, per cohort)', kort: 'Conv.', soort: 'procent', rol: true, m: 'M12', besluit: 'B3', eigenaar: 'beheerder', tolerantie: '1',  // M12: zonder opgeschoond
    definitie: 'Per cohort (de maand waarin de kans de fase bereikte): gewonnen ÷ (gewonnen + verloren), en per stap AP naar voorstel en voorstel naar gewonnen uit de fasewissels. Verloren met de reden "opgeschoond" telt niet. De win-rate nieuwe scholen is dezelfde maat voor kansen met klant = nieuw, gesloten vanaf de afgesproken startmaand.' },
  // --- accountmanagement ---
  lopendeProjecten:      { team: 'accountmanagement', label: 'Lopende projecten', kort: 'Lopend', soort: 'aantal', stand: true, m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '0',
    definitie: 'Projecten die niet afgelopen, afgerond of gestopt zijn, per accountmanager (een stand, geen periode).' },
  bezetting:             { team: 'accountmanagement', label: 'Bezetting (gevuld van nodig)', kort: 'Bezet', soort: 'procent', stand: true, m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '1',
    definitie: 'Gevulde plekken ÷ benodigde plekken in de lopende projecten van de accountmanager (een stand).' },
  dagenTotBezetting:     { team: 'accountmanagement', label: 'Dagen tot bezetting', kort: 'Dagen', soort: 'dagen', laagIsGoed: true, m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '0',
    definitie: 'Gemiddeld aantal kalenderdagen tussen het aanmaken en het invullen van een vacature, voor vacatures die in de periode ingevuld zijn.' },
  evaluaties:            { team: 'accountmanagement', label: 'Gesprekken en afspraken in projecten', kort: 'Gespr.', soort: 'aantal', m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '0',
    definitie: 'Gesprekken en afspraken van de accountmanager in zijn eigen projecten, op de datum van de activiteit.' },
  verlengd:              { team: 'accountmanagement', label: 'Verlengd (dit schooljaar)', kort: 'Verl.', soort: 'aantal', stand: true, m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '0',
    definitie: 'Projecten van het huidige schooljaar met verlengingsstatus "verlengd", per accountmanager (een stand).' },
  facturatieOpTijd:      { team: 'accountmanagement', label: 'Facturatie op tijd', kort: 'Fact.', soort: 'procent', m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '1',
    definitie: 'Termijnen met een termijndatum in de periode (t/m vandaag) die verzonden of betaald zijn ÷ alle termijnen met een termijndatum in de periode.' },
  // --- talent ---
  voordrachten:          { team: 'talent', label: 'Voordrachten', kort: 'Voordr.', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Kandidaten aangemaakt in de periode, per wie ze voordroeg.' },
  geplaatst:             { team: 'talent', label: 'Klaar voor start', kort: 'Klaar', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Kandidaten die in de periode de status "klaar voor start" kregen, per wie ze voordroeg.' },
  matchRatio:            { team: 'talent', label: 'Match → plaatsing', kort: 'Match', soort: 'procent', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '1',
    definitie: 'Klaar voor start ÷ (klaar voor start + afgewezen) in de periode.' },
  timeToFill:            { team: 'talent', label: 'Time-to-fill', kort: 'TTF', soort: 'dagen', laagIsGoed: true, m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Gemiddeld aantal kalenderdagen tussen het aanmaken en het invullen van een vacature, per wie de gevulde kandidaat voordroeg.' },
  doorlooptijd:          { team: 'talent', label: 'Doorlooptijd geselecteerd → klaar', kort: 'Doorl.', soort: 'dagen', laagIsGoed: true, m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Gemiddeld aantal kalenderdagen tussen "geselecteerd" en "klaar voor start".' },
  poolActief:            { team: 'talent', label: 'Actieve talenten in het bestand', kort: 'Pool', soort: 'aantal', stand: true, m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',  // v5.0: talentnetwerk
    definitie: 'Talenten met status actief in het talentbestand (een stand).' },
  vogCompliance:         { team: 'talent', label: 'VOG in orde (van actief)', kort: 'VOG', soort: 'procent', stand: true, m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '1',
    definitie: 'Actieve talenten met een geldige VOG voor dit schooljaar ÷ alle actieve talenten (een stand).' },
  plaatsingen:           { team: 'talent', label: 'Plaatsingen gestart', kort: 'Plaats.', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Kandidaten die in de periode de status "geplaatst" kregen.' },
  beoordelingGem:        { team: 'talent', label: 'Beoordeling (1 niet geschikt – 3 favoriet)', kort: 'Beoord.', soort: 'gemiddelde', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Gemiddelde beoordeling in de periode: niet geschikt 1, goed 2, favoriet 3.' },
  // --- bedrijf (bedrijfsdoelen; iedereen ziet ze) ---
  contractwaarde:        { team: 'bedrijf', label: 'Contractwaarde schooljaar', kort: 'Contract', soort: 'euro', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '1%',  // v7.9: was omzet (METRIEK_ALIAS); één definitie met Financiën
    definitie: 'De som van de contractwaarde (anders de omzet) van de projecten van het schooljaar die niet gestopt, offerte of onduidelijk zijn. Dezelfde contractwaarde als in Financiën.' },
  scholen:               { team: 'bedrijf', label: 'Scholen met een project', kort: 'Scholen', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Unieke scholen met een project in het schooljaar dat niet gestopt, offerte of onduidelijk is.' },
  ondersteuners:         { team: 'bedrijf', label: 'Ondersteuners ingezet', kort: 'Ond.', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Per project van het schooljaar het grootste van het geplande aantal ondersteuners en de gevulde plekken, opgeteld.' },
  verlengingspercentage: { team: 'bedrijf', label: 'Verlengingspercentage', kort: 'Verl.', soort: 'procent', m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '1',
    definitie: 'Projecten van het schooljaar met verlenging "verlengd" ÷ (verlengd + stopt).' },
  // --- sturing: het MT-overzicht en de weekweergave (niet in teamrapporten of doelen) ---
  jaardoel:              { team: 'sturing', label: 'Jaardoel', kort: 'Jaardoel', soort: 'euro', m: 'M01', besluit: 'B1', eigenaar: 'FD', tolerantie: '1%',
    definitie: 'Het jaardoel is één getal met vier vastgelegde eigenschappen: soort (netto-omzet of contractwaarde), periode (boekjaar sep–aug of schooljaar aug–jul), scope (alleen scholen) en basis (M02). Voorstel van de beheerder: netto-omzet scholen per boekjaar volgens Exact. Cijfers met een andere soort of periode worden er niet tegen gezet zonder vastgelegde omrekening.' },
  omzetVorigJaar:        { team: 'sturing', label: 'Omzet vorig jaar', kort: 'Vorig jaar', soort: 'euro', m: 'M02', besluit: 'B1', eigenaar: 'FD', tolerantie: '1%',
    definitie: 'Netto-omzet scholen van het vorige boekjaar volgens het grootboek in Exact, inclusief vrijval van vooruitontvangen bedragen, zonder particulieren, webshop en overige omzet.' },
  retentie:              { team: 'sturing', label: 'Aanname retentie', kort: 'Retentie', soort: 'fractie', m: 'M03', besluit: 'B1', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Het deel van de omzet vorig jaar dat naar verwachting bij dezelfde scholen terugkomt. Doel bestaand = omzet vorig jaar × retentie; doel nieuw = jaardoel − doel bestaand. Eén waarde per schooljaar, met onderbouwing en besluitdatum.' },
  gecontracteerd:        { team: 'sturing', label: 'Gecontracteerd', kort: 'Gecontr.', soort: 'euro', m: 'M04', besluit: 'B2', eigenaar: 'beheerder', tolerantie: '1%',
    definitie: 'Op de peildatum: de som van de getekende contractwaarde van alle gewonnen kansen waarvan de opdracht in het schooljaar valt, ongeacht de akkoorddatum, gesplitst naar nieuwe en bestaande klant. Geen schattingen. Een gewonnen kans zonder getekende waarde telt als aparte regel, niet als bedrag.' },
  doelpad:               { team: 'sturing', label: 'Doelpad', kort: 'Doelpad', soort: 'euro', m: 'M05', besluit: 'B2', eigenaar: 'beheerder', tolerantie: '1%',
    definitie: 'Per datum: doel bestaand of nieuw × het deel van de jaarwaarde dat in eerdere schooljaren op dezelfde dag al gewonnen was (de curve uit de wissels naar gewonnen op akkoorddatum, gewogen met contractwaarde). De curve wordt na 31 juli opnieuw berekend en met versie vastgelegd. Bij een omzetdoel: het doel verdeeld over de maanden naar gewerkte uren of netto-omzet van vorig jaar, nooit naar het factuurpatroon.' },
  gewogenPijplijn:       { team: 'sturing', label: 'Gewogen pipeline', kort: 'Gewogen', soort: 'euro', m: 'M06', besluit: 'B2', eigenaar: 'beheerder', tolerantie: '1%',
    definitie: 'De som over open kansen van het schooljaar in de gewogen fasen van waarde × fasegewicht van de mijlpaal. De leadfase en gewonnen tellen niet. Kansen zonder waarde tellen als nul en staan er als aantal naast.' },
  dekking:               { team: 'sturing', label: 'Dekking en nog te vinden', kort: 'Dekking', soort: 'procent', m: 'M07', besluit: 'B2', eigenaar: 'beheerder', tolerantie: '1',
    definitie: 'Dekking = (gecontracteerd + gewogen pipeline) ÷ jaardoel. Nog te vinden = jaardoel − gecontracteerd − gewogen pipeline. Alleen te berekenen als teller en noemer dezelfde soort en periode hebben.' },
  urenVorigeJaren:       { team: 'sturing', label: 'Gewerkte uren tegenover vorige jaren', kort: 'Uren', soort: 'uren', m: 'M09', besluit: 'B2', eigenaar: 'beheerder', tolerantie: '1%',
    definitie: 'De som van gewerkte uren (XPS-diensten met een gewerkte status) per kalendermaand t/m de laatste hele maand, naast dezelfde maanden van de vorige schooljaren. Gesplitst naar bestaand en nieuw voor zover de school bekend is.' },
  nettoOmzet:            { team: 'sturing', label: 'Netto-omzet tegen jaardoel', kort: 'Netto', soort: 'euro', m: 'M10', besluit: 'B2', eigenaar: 'FD', tolerantie: '1%', blokkade: 'extern: netto-omzet per maand van de boekhouder (§6)',
    definitie: 'Netto-omzet scholen per maand volgens het grootboek, inclusief vrijval, cumulatief in het boekjaar tegen het doelpad. Alleen als het jaardoel een omzetdoel is.' },
  benodigdeActiviteit:   { team: 'sturing', label: 'Benodigde activiteit (rekenmodel)', kort: 'Nodig', soort: 'aantal', m: 'M11', besluit: 'B3', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Deals = doel nieuw ÷ aanname dealwaarde; voorstellen = deals ÷ aanname conversie voorstel naar deal; AP\'s = voorstellen ÷ aanname conversie AP naar voorstel; per week ÷ werkweken; per OC ÷ aantal OC\'s (de beheerder telt niet mee). Elke aanname heeft een versie, eigenaar en onderbouwing; zodra M12 meetbaar is, staat de gemeten waarde ernaast.' },
  voorspellingDeals:     { team: 'sturing', label: 'Voorspelling deals volgende week', kort: 'Voorsp.', soort: 'aantal', m: 'M13', besluit: 'B3', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Het verwachte aantal wissels naar gewonnen in de komende ISO-week = het gemiddelde over een aaneengesloten reeks hele weken op akkoorddatum (weken zonder akkoord tellen als nul), met een interval van het 10e tot het 90e percentiel. Vastgelegd vóór de week en gescoord (fout, binnen het interval) zodra na de week de registratiemarge voorbij is: de aanname registratieNorm, minstens 7 kalenderdagen.' },
  afsprakenGepland:      { team: 'sturing', label: 'Afspraken gepland (volgende werkweek)', kort: 'Gepland', soort: 'aantal', m: 'M15', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Afspraak-activiteiten bij een school. Gehouden = datum in de week, niet afgemeld. Gepland = datum in de volgende werkweek. Afgemeld door de school staat apart.' },
  weekdoel:              { team: 'sturing', label: 'Weekdoel', kort: 'Doel', soort: 'aantal', m: 'M17', besluit: 'B4', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Per OC per ISO-week een doel voor contactmomenten, AP, AD, VO en deals, vastgesteld in de weekstart. De realisatie is M14 en M16 in dezelfde week.' },
  funnel:                { team: 'sturing', label: 'Kansen per fase (funnel)', kort: 'Funnel', soort: 'aantal', m: 'M18', besluit: 'B5', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Op de peildatum: per mijlpaal het aantal en de waarde van de open kansen, plus het aantal zonder waarde. De leadfase staat apart; gewonnen is M04.' },
  verwachteOpdrachten:   { team: 'sturing', label: 'Verwachte opdrachten (30 dagen)', kort: '30 dagen', soort: 'euro', m: 'M19', besluit: 'B5', eigenaar: 'beheerder', tolerantie: '1%',
    definitie: 'Open kansen in de voorstelfase met een verwachte tekendatum binnen 30 dagen na de peildatum, met hun waarde. Een verwachte tekendatum in het verleden staat als "verlopen" apart en telt niet.' },
  stilstand:             { team: 'sturing', label: 'Stilstand', kort: 'Stil', soort: 'aantal', m: 'M20', besluit: 'B5', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Per open kans: het aantal dagen sinds het laatste contact tegen de norm van de mijlpaal; boven de norm is de kans stil.' },
  verloren:              { team: 'sturing', label: 'Verloren met reden', kort: 'Verloren', soort: 'aantal', m: 'M21', besluit: 'B5', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Kansen met een wissel naar verloren met een werkelijke datum in de periode, per reden uit een vaste lijst. "Opgeschoond" is een eigen reden en telt niet in de conversie.' },
  icpDeciel:             { team: 'sturing', label: 'ICP-deciel', kort: 'ICP', soort: 'aantal', m: 'M22', besluit: 'B6', eigenaar: 'beheerder', tolerantie: '0', blokkade: 'besluit ICP (§5 besluit 9)',
    definitie: 'Het deciel van de modelkans per vestiging (BRIN en vestiging), alleen met kenmerken van de school zelf, getoetst buiten de steekproef op getekende deals in de voorspellingslog.' },
  ocActiviteit:          { team: 'sturing', label: 'OC-activiteit per maand', kort: 'OC-team', soort: 'aantal', m: 'M23', besluit: 'B7', eigenaar: 'beheerder', tolerantie: '0', wachtOp: 'besluit 8',  // N13: "ingepland" = aanmaakdatum, concept tot besluit 8
    definitie: 'Per maand voor het OC-team: afspraken ingepland (afspraak-activiteiten aangemaakt in de maand), afspraken gedaan (datum in de maand), voorstellen (VO) en deals. In het MT op teamniveau; per persoon alleen in het 1-op-1.' },
  verlengingsstand:      { team: 'sturing', label: 'Verlengingsstand', kort: 'Verlenging', soort: 'procent', m: 'M24', besluit: 'B8', eigenaar: 'teamlead AM', tolerantie: '1',
    definitie: 'Van de scholen (BRIN en vestiging) met een project in het vorige schooljaar: per school de status voor het nieuwe schooljaar (verlengd, voorstel verstuurd, nog bespreken, stopt, geen kans), de eigenaar die het oppakt en de contractwaarde van vorig jaar; plus het aandeel van die contractwaarde dat verlengd is.' },
  geleverd:              { team: 'sturing', label: 'Geleverd', kort: 'Geleverd', soort: 'euro', m: 'M25', besluit: 'B9', eigenaar: 'teamlead AM', tolerantie: '1%',
    definitie: 'De gewerkte uren per project per maand × het projecttarief (Trajecten.tarief). Nooit loon of tarief per persoon.' },
  gefactureerd:          { team: 'sturing', label: 'Gefactureerd', kort: 'Gefact.', soort: 'euro', m: 'M26', besluit: 'B9', eigenaar: 'boekhouder', tolerantie: '1%',
    definitie: 'De som van termijnen met een verzenddatum in de maand, met creditnota\'s verrekend. Dit is geen omzet en geen stuurgetal; het is er alleen voor facturatie en cash.' },
  nogTeFactureren:       { team: 'sturing', label: 'Nog te factureren', kort: 'Nog te fact.', soort: 'euro', m: 'M27', besluit: 'B9', eigenaar: 'teamlead AM', tolerantie: '1%',
    definitie: 'Per project: de getekende contractwaarde − gefactureerd (negatief = meerwerk), in de sommen per school en totaal op nul geklemd. De status volgt de factuurafspraak (vooraf, achteraf, termijnen): "achter" als bij achteraf geleverd − gefactureerd boven de tolerantie ligt.' },
  openstaand:            { team: 'sturing', label: 'Openstaand naar ouderdom', kort: 'Open', soort: 'euro', m: 'M28', besluit: 'B10', eigenaar: 'boekhouder', tolerantie: '1%',
    definitie: 'Gefactureerd − ontvangen per factuur, in de klassen 0–30, 31–60 en meer dan 60 dagen na verzending.' },
  realisatiegraad:       { team: 'sturing', label: 'Realisatiegraad per project', kort: 'Realisatie', soort: 'procent', m: 'M29', besluit: 'B11', eigenaar: 'teamlead AM', tolerantie: '1', blokkade: 'besluit realisatiegraad (§5 besluit 6)',
    definitie: 'Geleverd t/m de laatste hele maand ÷ de prognose uit het contract t/m dezelfde maand, per project, tegen een drempel. Minder afname door de school staat apart en telt niet als prestatie van de AM.' },
  brutomarge:            { team: 'sturing', label: 'Brutomarge', kort: 'Marge', soort: 'euro', m: 'M30', besluit: 'B12', eigenaar: 'FD', tolerantie: '1%', blokkade: 'kosten per maand van financiën ontbreken (§6)',
    definitie: '(Netto-omzet of geleverd) − kosten per maand, waarbij de kosten de werkgeverskosten en reiskosten van de ingezette studenten zijn, als maandtotaal van financiën. Toegerekend aan school, product en AM naar gewerkte uren. Nooit loon of tarief per persoon.' },
  onderOndergrens:       { team: 'sturing', label: 'Projecten onder de ondergrens', kort: 'Onder', soort: 'aantal', m: 'M31', besluit: 'B12', eigenaar: 'FD', tolerantie: '0', blokkade: 'kosten per maand van financiën ontbreken (§6)',
    definitie: 'Projecten met een brutomarge onder de ondergrens, als signaal met een reden, geen harde grens. Een instap bij een nieuwe school mag bewust lager.' },
  offertemarge:          { team: 'sturing', label: 'Offertemarge', kort: 'Offerte', soort: 'procent', m: 'M32', besluit: 'B12', eigenaar: 'beheerder', tolerantie: '1', blokkade: 'kosten per maand van financiën ontbreken (§6)',
    definitie: '(Offertewaarde − geplande uren × kostprijs per uur) ÷ offertewaarde. De kostprijs per uur = maandkosten ÷ gewerkte uren, als totalen van financiën.' },
  teamInhoud:            { team: 'sturing', label: 'Omzetdeel team inhoud', kort: 'Inhoud', soort: 'procent', m: 'M33', besluit: 'B13', eigenaar: 'FD', tolerantie: '1', blokkade: 'geen urenbron voor team inhoud (§6)',
    definitie: 'De omzet van de projecten van team inhoud tegenover hun kosten als overhead.' },
  logdekking:            { team: 'sturing', label: 'Logdekking', kort: 'Log', soort: 'procent', m: 'M34', besluit: 'B14', eigenaar: 'beheerder', tolerantie: '1', blokkade: 'besluit agenda-toegang (§5 besluit 10)',
    definitie: 'Schoolafspraken in de teamagenda en de agenda\'s van de OC\'s (deelnemer met een schooldomein, niet afgeslagen) waarvoor binnen twee dagen een afspraak van dezelfde OC bij dezelfde school in Athena staat, gedeeld door al zulke agenda-afspraken.' },
  registratievertraging: { team: 'sturing', label: 'Registratievertraging', kort: 'Vertr.', soort: 'dagen', laagIsGoed: true, m: 'M35', besluit: 'B14', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Per fasewissel: ingevoerd op − werkelijke datum, in kalenderdagen. Per eigenaar per maand de mediaan en het deel boven de norm.' },
  datakwaliteit:         { team: 'sturing', label: 'Datakwaliteit per eigenaar', kort: 'Datakw.', soort: 'aantal', m: 'M36', besluit: 'B14', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Per datacontract (§3b) geslaagd of gezakt, met de kansen en projecten die het raken, per eigenaar (OC, AM, boekhouder).' },
  // --- overige getallen op schermen (alleen voor de definitie) ---
  openKansen:            { team: 'werk', label: 'Open kansen', kort: 'Open', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Kansen die niet gewonnen of verloren zijn (die je mag zien).' },
  openWaarde:            { team: 'werk', label: 'Open waarde', kort: 'Open €', soort: 'euro', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '1%',
    definitie: 'De som van de waarde van de open kansen, ongewogen (Vandaag, schooldetail). De gewogen variant is M06.' },
  openTaken:             { team: 'werk', label: 'Open taken', kort: 'Taken', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Jouw taken die niet af zijn.' },
  teLaat:                { team: 'werk', label: 'Te laat', kort: 'Te laat', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Jouw open taken met een deadline vóór vandaag (kalenderdagen).' },
  actieveProjecten:      { team: 'werk', label: 'Actieve projecten', kort: 'Actief', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Projecten met status bezig of actief (Vandaag).' },
  scholenMetInzet:       { team: 'werk', label: 'Scholen met inzet', kort: 'Scholen', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Unieke scholen met een actief project (Vandaag).' },
  openVacatures:         { team: 'werk', label: 'Open vacatures', kort: 'Vac.', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Vacatures met status open in de lopende projecten.' },
  teBezetten:            { team: 'werk', label: 'Te bezetten plekken', kort: 'Plekken', soort: 'aantal', m: '', besluit: '', eigenaar: 'beheerder', tolerantie: '0',
    definitie: 'Benodigde plekken − gevulde plekken in de lopende projecten, per project niet onder nul.' },
  prognose:              { team: 'financien', label: 'Prognose', kort: 'Prognose', soort: 'euro', m: '', besluit: '', eigenaar: 'teamlead AM', tolerantie: '1%',
    definitie: 'De contractwaarde verdeeld over de maanden volgens de facturatieafspraak (de termijnen, anders start, eind, vooraf of achteraf en vakanties). De som is de contractwaarde.' },
  ontvangen:             { team: 'financien', label: 'Ontvangen', kort: 'Ontv.', soort: 'euro', m: '', besluit: '', eigenaar: 'boekhouder', tolerantie: '1%',
    definitie: 'De som van termijnen met een betaaldatum in de maand.' },
  betaaltijd:            { team: 'financien', label: 'Betaaltijd', kort: 'Betaald', soort: 'dagen', laagIsGoed: true, m: '', besluit: '', eigenaar: 'boekhouder', tolerantie: '0',
    definitie: 'Gemiddeld aantal kalenderdagen tussen verzenden en betalen, alleen voor termijnen met een echte verzend- en betaaldatum.' }
};
var RAPPORT_TEAMS = ['consultancy', 'accountmanagement', 'talent'];
function metriekDefs(team) {
  return Object.keys(METRIEKEN).filter(function (m) { return !team || METRIEKEN[m].team === team; }).map(function (m) {
    var d = METRIEKEN[m]; return { id: m, team: d.team, label: d.label, kort: d.kort, soort: d.soort, laagIsGoed: !!d.laagIsGoed, stand: !!d.stand };
  });
}
// v7.9: een doel kan alleen op een teamcijfer of een bedrijfscijfer; de cijfers van de sturing, het werk en Financiën staan alleen in het register
function doelbaar(m) { var d = uitMap(METRIEKEN, String(m)); return !!d && (RAPPORT_TEAMS.indexOf(d.team) >= 0 || d.team === 'bedrijf'); }
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
function rapportData() { return { acts: lees('Activiteiten'), kansen: lees('Kansen'), scholen: lees('Scholen'), ts: lees('Trajecten'), vacs: lees('Vacatures'), kands: lees('Kandidaten'), facturen: lees('Facturen'), nu: nu() }; }  // v7.9 (review T4): de tellende wissels pas in teamCijfers (consultancy), zodat het rapport van AM en talent Fasewissels niet leest
// Cijfers van één team in een periode: per persoon en het teamtotaal ({ per: {naam: {maatstaf: {t, n}}}, totaal: {...} }).
function teamCijfers(team, van, tot, D) {
  D = D || rapportData();
  var per = {}, totaal = {}, inP = function (s) { var d = String(s || '').slice(0, 10); return !!d && d >= van && d <= tot; };
  var tel = function (naam, m, t, n) {
    if (!naam) return;
    var p = per[naam] || (per[naam] = {}), x = p[m] || (p[m] = { t: 0, n: 0 }), y = totaal[m] || (totaal[m] = { t: 0, n: 0 });
    x.t += t; x.n += (n || 0); y.t += t; y.n += (n || 0);
  };
  var sj = huidigSchooljaar(), vandaag = datumStr(new Date()), geblokkeerd = {};
  if (team === 'consultancy') {
    // v7.9 (review T4): per verzoek één keer per activiteit of ze een contactmoment of gehouden afspraak is, en per wissel de rol (telRol); een rapport telt
    // tot zo'n dertig periodes met dezelfde D, en parseDatum per activiteit per periode maakte apiTeamRapport zichtbaar trager dan v7.8 (R9)
    if (D._actBron !== D.acts) { D._actBron = D.acts; D._actC = D.acts.map(function (a) { var vorm = vormVan(a), dag = parseDatum(String(a.datum || '').slice(0, 10)); return (CONTACT_VORMEN.indexOf(vorm) >= 0 && dag && isoDag(dag) <= 5 ? 1 : 0) + (AFSPRAAK_VORMEN.indexOf(vorm) >= 0 && a.schoolId ? 2 : 0); }); }
    var AC = D._actC;
    D.acts.forEach(function (a, i) {
      if (!a.door || !inP(a.datum) || String(a.datum) > D.nu) return;
      if (a.type === 'gesprek') tel(a.door, 'gesprekken', 1); else if (a.type === 'mail') tel(a.door, 'mails', 1); else if (a.type === 'afspraak') tel(a.door, 'afspraken', 1);
      // v7.9: M14 contactmomenten (de vormen uit CONTACT_VORMEN op werkdagen; mail alleen verstuurd, dus met door) en M15 afspraken gehouden (bij een school)
      if (AC[i] & 1) tel(a.door, 'contactmomenten', 1);
      if (AC[i] & 2) tel(a.door, 'afsprakenGehouden', 1);
    });
    D.kansen.forEach(function (k) { if (inP(k.aangemaakt)) tel(k.eigenaar, 'nieuweKansen', 1); });
    // v7.9: AP, AD, voorstellen en deals uit Fasewissels: telRol op de rol en de werkelijke datum, op de eigenaar van de kans op dat moment (nooit de tekst van de tijdlijn)
    var W = D.wissels || tellendeWissels();
    if (D._wRolBron !== W) { D._wRolBron = W; D._wRol = W.map(telRol); }
    var WR = D._wRol;
    W.forEach(function (w, i) {
      if (!inP(w.werkelijkeDatum)) return;
      var r = WR[i];
      if (r === 'ap' || r === 'ad') tel(w.eigenaar, r, 1); else if (r === 'voorstel') tel(w.eigenaar, 'voorstellen', 1); else if (r === 'deal') tel(w.eigenaar, 'gewonnen', 1);
    });
    dealWissels().forEach(function (w) { if (inP(w.werkelijkeDatum)) tel(w.eigenaar, 'gewonnenWaarde', Number(w.waarde) || 0); });  // N8: per kans één deal, de getekende waarde
    // M12 conversie per cohort: het cohort van een kans is de periode van zijn eerste tellende voorstelwissel (op de eigenaar van die wissel);
    // teller = gewonnen, noemer = gewonnen + verloren zonder 'opgeschoond' (volgens de laatste sluitende wissel); open kansen tellen niet
    conversieCohort(W, inP).forEach(function (c) { tel(c.eigenaar, 'conversie', c.gewonnen ? 1 : 0, 1); });
    D.scholen.forEach(function (s) { if (inP(s.aangemaakt)) tel(s.eigenaar, 'nieuweScholen', 1); });
    var blok = rolBlokkade(); if (blok) Object.keys(METRIEKEN).forEach(function (m) { if (METRIEKEN[m].rol) geblokkeerd[m] = blok; });  // B1: nooit 0 als de rollen ontbreken
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
  return { per: per, totaal: totaal, geblokkeerd: geblokkeerd };
}
// v7.9 (M12): per kans in het cohort (eerste tellende voorstelwissel in de periode) of hij gewonnen is; verloren met reden opgeschoond en open kansen vallen weg
function conversieCohort(W, inP) {
  var X = wisselsData(), basis = W === X.tellend && X.cohort ? X.cohort : null;
  if (!basis) {  // per verzoek één keer (een rapport telt tot zo'n dertig periodes)
    basis = { eerste: {}, slot: {} };
    W.slice().sort(volgordeWerkelijk).forEach(function (w) {
      var k = String(w.kansId);
      if (telRol(w) === 'voorstel' && !basis.eerste[k]) basis.eerste[k] = w;
      if (w.naar === 'gewonnen' || w.naar === 'verloren') basis.slot[k] = w;
    });
    if (W === X.tellend) X.cohort = basis;
  }
  var eerste = basis.eerste, slot = basis.slot, uit = [];
  Object.keys(eerste).forEach(function (k) {
    var v = eerste[k], s0 = slot[k];
    if (!inP(v.werkelijkeDatum) || !s0 || (s0.naar === 'verloren' && klein(s0.reden) === 'opgeschoond')) return;
    uit.push({ kansId: k, eigenaar: v.eigenaar, gewonnen: s0.naar === 'gewonnen' });
  });
  return uit;
}
function waardenVan(team, tellers) { var u = {}; metriekDefs(team).forEach(function (d) { u[d.id] = telWaarde(d.id, tellers && tellers[d.id]); }); return u; }
// Doelen van een periode: { eigenaar: { maatstaf: doel } } (eigenaar = naam, 'team:<team>' of 'bedrijf')
// v7.9: eerst de standaard (zonder periodeSleutel), daarna overschreven door de doelen van precies deze periode (exacte vergelijking, N2)
function doelenVan(periode, sleutel) {
  var u = {}, zet = function (d) { (u[d.eigenaar] = u[d.eigenaar] || {})[metriekVan(d.metric)] = Number(d.doel); };
  var rijen = lees('Doelen').filter(function (d) { return d.periode === periode && Number(d.doel); });
  rijen.filter(function (d) { return !String(d.periodeSleutel || ''); }).forEach(zet);
  if (sleutel) rijen.filter(function (d) { return String(d.periodeSleutel || '') === String(sleutel); }).forEach(zet);
  return u;
}

// De bedrijfscijfers van het huidige schooljaar; iedereen ziet ze (geen bedragen per persoon).
function bedrijfCijfers() {
  var sj = huidigSchooljaar(), vacs = lees('Vacatures'), kands = lees('Kandidaten'), ts = lees('Trajecten'), x = { contractwaarde: { t: contractwaardeSchooljaar(ts, sj), n: 0 }, scholen: { t: 0, n: 0 }, ondersteuners: { t: 0, n: 0 }, verlengingspercentage: { t: 0, n: 0 } }, scholen = {};  // v7.9 (punt 17): contractwaarde, één definitie met Financiën
  ts.filter(function (t) { return t.schooljaar === sj && ['gestopt', 'offerte', 'onduidelijk'].indexOf(t.status) < 0; }).forEach(function (t) {
    scholen[t.schoolId || klein(t.school)] = true;
    x.ondersteuners.t += Math.max(Number(t.ondersteuners) || 0, bezettingVan(t.id, vacs, kands).gevuld);
    if (t.verlenging === 'verlengd' || t.verlenging === 'stopt') { x.verlengingspercentage.n++; if (t.verlenging === 'verlengd') x.verlengingspercentage.t++; }
  });
  x.scholen.t = Object.keys(scholen).length;
  return { schooljaar: sj, metrieken: metriekDefs('bedrijf'), cijfers: waardenVan('bedrijf', x), doelen: doelenVan('schooljaar', sj).bedrijf || {} };  // v7.9: met het doel van dit schooljaar
}

// Rapport van één team: management kiest een team, een teamlead ziet zijn team per persoon, een medewerker zichzelf plus het teamtotaal.
// v4.4: elke periode met stap (‹ ›), een vergelijking met de periode ervoor, een reeks van de laatste periodes en voor het management 'alle' teams.
var RAPPORT_REEKS = { week: 8, maand: 6, kwartaal: 4, halfjaar: 4, jaar: 3, schooljaar: 3 };
function apiTeamRapport(preset, team, eigenaar, stap) {
  preset = DOEL_PERIODES.indexOf(preset) >= 0 ? preset : 'maand';
  var echt = isBeheerder() ? RAPPORT_TEAMS.slice() : RAPPORT_TEAMS.filter(function (t) { return GEBRUIKER && GEBRUIKER.team === t; });
  var teams = isBeheerder() ? ['alle'].concat(echt) : echt;
  if (teams.indexOf(team) < 0) team = echt[0] || '';
  var B = periodeBereik(preset, stap), V = vergelijkBereik(preset, B), D = rapportData(), reeks = [];
  for (var i = (RAPPORT_REEKS[preset] || 6) - 1; i > 0; i--) reeks.push(periodeBereik(preset, B.stap - i));
  reeks.push(B);
  // v7.9 (N9): de doelen van elke periode met haar eigen sleutel (een weekdoel geldt alleen voor die week), ook voor de vergelijking en de reeks
  var doelen = doelenVan(preset, periodeSleutelVan(preset, B.van)), doelenV = doelenVan(preset, periodeSleutelVan(preset, V.van)), doelenR = reeks.map(function (r) { return doelenVan(preset, periodeSleutelVan(preset, r.van)); });
  var doelenBij = function (eig) { return { doelen: doelen[eig] || {}, doelenVorige: doelenV[eig] || {}, doelenReeks: doelenR.map(function (x) { return x[eig] || {}; }) }; };
  var uit = { preset: preset, stap: B.stap, van: B.van, tot: B.tot, eind: B.eind, lopend: B.lopend, label: B.label,
    vergelijk: { van: V.van, tot: V.tot, label: V.label, kort: V.kort }, reeksLabels: reeks.map(function (r) { return r.kort; }),
    team: team, teams: teams, metrieken: metriekDefs(team === 'alle' ? 'geen' : team), perPersoon: [], totaal: { cijfers: {}, doelen: {}, vorige: {}, reeks: {} },
    bedrijf: bedrijfCijfers(), ik: ikUit(), eigenaar: '', kiesbaar: [], geblokkeerd: {} };
  if (!team) return uit;
  // Cijfers, vorige periode en reeks van één team; bundel(naam) geeft ze voor één persoon, bundel('') voor het teamtotaal
  var meet = function (t) {
    var nuC = teamCijfers(t, B.van, B.tot, D), vorC = teamCijfers(t, V.van, V.tot, D), defs = metriekDefs(t), leden = teamNamen(t);
    var rs = reeks.map(function (r) { return r === B ? nuC : teamCijfers(t, r.van, r.tot, D); });
    // het teamtotaal is de som van de teamleden (een mail of gesprek van iemand uit een ander team telt hier niet mee)
    var vanTeam = function (c) { var u = {}; leden.forEach(function (n) { var x = c.per[n] || {}; Object.keys(x).forEach(function (m) { var y = u[m] || (u[m] = { t: 0, n: 0 }); y.t += x[m].t; y.n += x[m].n; }); }); return u; };
    var blok = nuC.geblokkeerd || {};  // v7.9 (B1): zonder ingestelde rollen zijn AP, AD, VO en conversie geblokkeerd: geen 0 maar null, met de reden in geblokkeerd
    return function (naam) {
      var w = function (c) { var u = waardenVan(t, naam ? c.per[naam] : vanTeam(c)); Object.keys(blok).forEach(function (m) { u[m] = null; }); return u; };
      var cijfers = w(nuC), vorige = w(vorC), rw = rs.map(w), r = {};
      defs.forEach(function (d) { if (d.stand) vorige[d.id] = null; else r[d.id] = rw.map(function (x) { return x[d.id]; }); });  // een stand (bezetting nu) heeft geen verloop
      return { cijfers: cijfers, vorige: vorige, reeks: r, geblokkeerd: blok };
    };
  };
  if (team === 'alle') {
    uit.alle = echt.map(function (t) { var b = meet(t)(''), db = doelenBij('team:' + t); b.doelen = db.doelen; b.doelenVorige = db.doelenVorige; b.doelenReeks = db.doelenReeks; return { team: t, metrieken: metriekDefs(t), totaal: b, leden: teamNamen(t).length }; });
    return uit;
  }
  var leden = teamNamen(team), zicht = zichtbareMensen(), mensen = isBeheerder() ? leden : leden.filter(function (n) { return zicht.indexOf(n) >= 0; });
  uit.kiesbaar = isBeheerder() || isTeamlead() ? mensen.slice() : [];  // wie management of een teamlead kan kiezen
  if (eigenaar && mensen.indexOf(eigenaar) >= 0) { uit.eigenaar = eigenaar; mensen = [eigenaar]; }
  var bundel = meet(team);
  uit.perPersoon = mensen.map(function (n) { var b = bundel(n), db = doelenBij(n); b.naam = n; b.doelen = db.doelen; b.doelenVorige = db.doelenVorige; b.doelenReeks = db.doelenReeks; return b; });
  uit.totaal = bundel(''); var dt0 = doelenBij('team:' + team); uit.totaal.doelen = dt0.doelen; uit.totaal.doelenVorige = dt0.doelenVorige; uit.totaal.doelenReeks = dt0.doelenReeks;
  uit.geblokkeerd = uit.totaal.geblokkeerd || {};
  return uit;
}

/* ===================== 9. Projecten en facturatie (v3.8) ===================== */

// Een gewonnen kans wordt een project voor de accountmanager, met alles wat de adviseur wist (altijd binnen metLock).
// Bestaat er al een project bij deze kans (bijv. na heropenen en opnieuw winnen), dan blijft het bij dat project.
// v6.4: overdracht = het winformulier ({rol, aantal, rooster, startdatum, bijzonderheden}): vult de taskforce voor en maakt een conceptvacature voor het talentteam.
function projectUitKans(k, school, overdracht) {
  var bestaand = lees('Trajecten').filter(function (t) { return String(t.kansId) === String(k.id); })[0], od = overdracht || null;
  if (bestaand) {  // v7.9: heropend en opnieuw gewonnen: de contractwaarde alleen invullen als die leeg is, anders een regel in de tijdlijn
    if (od && od.contractwaarde) {
      if (bestaand.contractwaarde === '' || bestaand.contractwaarde == null) bestaand = schrijf('Trajecten', { id: bestaand.id, contractwaarde: od.contractwaarde });
      else overdrachtRegel(bestaand, 'Nieuwe getekende waarde bij opnieuw winnen; contractwaarde niet gewijzigd', 'Getekend: € ' + Math.round(od.contractwaarde) + '.');
    }
    return bestaand;
  }
  var s = school || vind('Scholen', k.schoolId) || {}, p = k.persoonId ? vind('Personen', k.persoonId) : null;
  var am = k.am || '', adviseur = k.eigenaar || ikNaam(), naamK = (k.naam || k.traject) + ' (' + (k.school || s.naam || '') + ')';
  // v7.9: het schooljaar volgt de startdatum uit het winformulier (anders dat van de kans); omzet en contractwaarde = de getekende waarde; klant en productsoort van de kans
  var sjP = od && od.startdatum ? schooljaarVan(od.startdatum) : (k.schooljaar || huidigSchooljaar()), getekend = od && od.contractwaarde ? od.contractwaarde : Number(k.waarde) || 0;
  var nieuwT = { schoolId: k.schoolId, school: k.school || s.naam || '', plaats: s.plaats || '', traject: k.traject || k.naam, schooljaar: sjP, status: 'opstart',
    omzet: getekend, contractwaarde: od && od.contractwaarde ? od.contractwaarde : '', klant: k.klant || '', productsoort: k.productsoort || '',
    am: am, adviseur: adviseur, kansId: k.id, contactpersoon: p ? persoonNaam(p) + (p.email ? ' <' + p.email + '>' : '') : '', samenvatting: String(k.notities || '').trim() };
  if (String(k.schooljaar || '') !== sjP) { schrijf('Kansen', { id: k.id, schooljaar: sjP }); k.schooljaar = sjP; }  // v7.9: M04 telt de kans in het schooljaar van het project (geen fase)
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
    kans: k ? (kansBeperkt(k) ? kansBeperktUit(k) : kansUit(k, mijlpaalMap())) : null,  // v7.3 (R1): talent ziet de kans achter het project beperkt
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
// v7.3 (K3): het totaal is de contractwaarde (leeg: de omzet, zoals Financiën) en de termijnen tellen daar in centen precies naar op (de laatste
// krijgt het restant); een tweede aanroep maakt geen dubbele termijnen (zelfde omschrijving en datum op dit project worden overgeslagen).
function apiFacturenMaken(trajectId, opties) {
  opties = (opties && typeof opties === 'object') ? opties : {};
  var t = vind('Trajecten', trajectId); if (!t) throw new Error('Project niet gevonden.');
  eis('facturatie', 'wijzigen', t);  // v4.0
  var start = parseDatum(opties.van || t.start), eind = parseDatum(opties.tot || t.eind), lijst = [];
  var totaal = t.contractwaarde !== '' && t.contractwaarde != null && isFinite(Number(t.contractwaarde)) ? Number(t.contractwaarde) : Number(t.omzet) || 0;  // v7.3
  if (opties.per === 'eenmalig') lijst.push({ omschrijving: tekstIn(opties.omschrijving) || 'Factuur vooraf', datum: datumStr(start || new Date()), bedrag: opties.bedrag !== undefined && opties.bedrag !== '' ? Number(opties.bedrag) || 0 : totaal || '' });
  else {
    if (!start || !eind || eind < start) throw new Error('Vul eerst de start- en einddatum van het project in.');
    var d = new Date(start.getFullYear(), start.getMonth(), 1), zomer = opties.zomer !== true;
    while (d <= eind && lijst.length < 24) {
      if (!(zomer && (d.getMonth() === 6 || d.getMonth() === 7))) lijst.push({ omschrijving: MAANDEN[d.getMonth()].charAt(0).toUpperCase() + MAANDEN[d.getMonth()].slice(1) + ' ' + d.getFullYear(), datum: datumStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)) });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    if (opties.bedrag !== undefined && opties.bedrag !== '') lijst.forEach(function (f) { f.bedrag = Number(opties.bedrag) || 0; });
    else if (totaal && lijst.length) {  // v7.3: in centen verdelen, zodat de som van de termijnen precies het contract is
      var centen = Math.round(totaal * 100), per = Math.floor(centen / lijst.length);
      lijst.forEach(function (f, i) { f.bedrag = (i === lijst.length - 1 ? centen - per * (lijst.length - 1) : per) / 100; });
    } else lijst.forEach(function (f) { f.bedrag = ''; });
  }
  var status = keuzelijst('factuurStatussen')[0];
  metLock(function () {
    var al = {}; lees('Facturen').forEach(function (f) { if (String(f.trajectId) === String(trajectId)) al[klein(f.omschrijving) + '|' + datumIn(f.datum)] = true; });  // v7.3: idempotent
    var nieuw = lijst.filter(function (f) { return !al[klein(f.omschrijving) + '|' + f.datum]; });
    if (nieuw.length) schrijfVeel('Facturen', nieuw.map(function (f) { f.trajectId = trajectId; f.status = status; f.aangemaakt = nu(); f.door = ikNaam(); return f; }));
  });
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
  wijzig_kans: { titel: 'Kans bijwerken', description: 'Wijzig een bestaande kans: mijlpaal (fase), waarde, volgende actie, deadline of verwachte tekendatum. Geef alleen de velden die veranderen. ' +
      'Bij een andere mijlpaal: zet in werkelijkeDatum de dag waarop die mijlpaal echt bereikt is (yyyy-MM-dd, standaard vandaag). Gewonnen en verloren kan niet: dat legt de gebruiker vast in de kans zelf.',
    properties: { kansId: { type: 'string' }, fase: { type: 'string' }, werkelijkeDatum: { type: 'string', description: 'yyyy-MM-dd, de dag waarop de mijlpaal bereikt is (v7.9)' }, waarde: { type: 'number' }, volgendeActie: { type: 'string' }, deadline: { type: 'string' }, verwachteSluiting: { type: 'string' } },
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
      function (k) { var b = kansBeperkt(k); return { id: k.id, naam: k.naam || k.traject, school: k.school, schoolId: k.schoolId, fase: k.fase, waarde: b ? 0 : Number(k.waarde) || 0, eigenaar: k.eigenaar, beperkt: b }; }),  // v7.3 (R1)
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
    if (w.fase === 'gewonnen' || w.fase === 'verloren') throw new Error('Gewonnen en verloren leg je vast in de kans zelf (winformulier of verlorenvenster).');  // v7.9
    var k = kansOpslaan(w, { bron: 'assistent', datum: o.werkelijkeDatum || '' }).kans;  // v7.9 (R1): de interne kern met bron assistent, niet de api
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
// v7.6: alleen de naam, uit alleen Talenten en pas bij de eerste activiteit met een talentId. Via talentIndex() las apiHome (en apiProject, apiSchool,
// apiActiviteiten, apiActiviteitOpslaan) vijf tabbladen — 29 % van zijn rijen uit de Sheet — enkel voor een naam bij een paar activiteiten.
// De map hangt aan de gelezen rijen zelf (_LEES.Talenten): vergeet(), maar ook elke reset van _LEES (demo, tests) maakt hem vanzelf ongeldig.
var _TALENTNAMEN = null;
function talentNaamVan(id) {
  var bron = _LEES.Talenten || (lees('Talenten'), _LEES.Talenten);
  if (!_TALENTNAMEN || _TALENTNAMEN.bron !== bron) { _TALENTNAMEN = { bron: bron, map: {} }; bron.forEach(function (t) { _TALENTNAMEN.map[String(t.id)] = talentNaam(t); }); }
  return uitMap(_TALENTNAMEN.map, String(id)) || '';
}
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
  u.contractvorm = t.contractvorm || ''; u.bron = t.bron || ''; u.xpsId = t.xpsId || ''; u.afasNummer = t.afasNummer || ''; u.tags = tagsUit(t.tags); u.velden = veldenZonderVergeten(veldenUit(t.velden));  // v7.7 (B2): de onderdrukkingslijst blijft in de Sheet, niet in de app of de inzage-export
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
  obj = obj || {};
  var o = schoon(obj, TALENT_VELDEN), oud = o.id ? vind('Talenten', o.id) : null;
  eis('talenten', 'wijzigen', oud || null);  // v7.3 (R4): met de rij, zodat een later rijniveau 'eigen' of 'team' ook hier geldt (nu: talent alles, AM geen)
  if (o.id && !oud) throw new Error('Talent niet gevonden.');
  ['voornaam', 'achternaam', 'woonplaats', 'opleiding', 'bevoegdheid', 'xpsId', 'afasNummer', 'notitie', 'toestemmingGrondslag'].forEach(function (k) { if (o[k] !== undefined) o[k] = tekstIn(o[k]); });  // v7.3: geen object als tekst
  if (o.email !== undefined) o.email = klein(tekstIn(o.email));  // v7.3
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
  if (o.velden !== undefined) { o.velden = veldenUit(o.velden); delete o.velden.vergeten; if (oud) { var vg = veldenUit(oud.velden).vergeten; if (vg instanceof Array) o.velden.vergeten = vg; } }  // v7.7 (B2): de onderdrukkingslijst komt alleen uit het anonimiseren: nooit uit de invoer, en gaat nooit verloren
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
  if (o.notitie !== undefined) o.notitie = tekstIn(o.notitie);  // v7.3: geen object als notitie
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
  var richting = obj.richting === 'talent' ? 'talent' : 'school', reden = tekstIn(obj.reden).slice(0, 200);  // v7.3: tekstIn
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
  if (obj.tekst !== undefined) o.tekst = tekstIn(obj.tekst).slice(0, 2000);  // v7.3: geen object als tekst
  if (obj.zichtbaarheid !== undefined) o.zichtbaarheid = obj.zichtbaarheid === 'talent' ? 'talent' : 'intern';
  if (obj.wederhoor !== undefined) { if (!talentteam) throw new Error('Wederhoor legt het talentteam vast.'); o.wederhoor = tekstIn(obj.wederhoor).slice(0, 2000); }  // v7.3
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
  notitie = tekstIn(notitie).slice(0, 500);  // v7.3: geen object als notitie
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
// v7.4: naast de weekexport (Accountnummer; Naam; E-mail; Projectnummer; Week; Uren; Status) ook de export per dienst
// (Datum; Datum: Van; Datum: Tot; Gewerkte tijd; Uitgevoerd door; Omschrijving; Status; Project; Projectleider; Salaris …), bij voorkeur met Accountnummer,
// E-mail en Projectnummer erbij. Beide worden per talent × ISO-week × project opgeteld. Zie backend/README.md, sectie XPS-uren.
var XPS_KOLOMMEN_STANDAARD = { xpsId: ['accountnummer', 'account nr', 'accountnr', 'medewerkernummer', 'medewerker nr', 'account id', 'accountid', 'nummer'], email: ['e-mail', 'email', 'e-mailadres'],
  naam: ['naam', 'uitgevoerd door', 'medewerker', 'flexkracht', 'account'],  // v7.4: 'Uitgevoerd door' uit de dienstenexport
  projectNummer: ['projectnummer', 'project nr', 'projectnr', 'project id'],  // v7.4: het nummer los van de projectnaam (koppelt exact op Trajecten.xpsProject)
  project: ['project', 'projectnaam'], week: ['week', 'weeknummer'], datum: ['datum', 'dag'], uren: ['uren', 'gewerkte tijd', 'klokuren', 'aantal uren', 'gewerkt'], status: ['status'],
  noShow: ['no-show', 'no show', 'noshow', 'niet verschenen'], laat: ['late afmelding', 'laat afgemeld', 'afgemeld'],
  // v7.7: de accountexport (talentImport): aparte naamkolommen, contact, functie, de status van het account (de sleutel 'status' blijft voor diensten) en de startdatum
  voornaam: ['voornaam', 'roepnaam', 'first name'], achternaam: ['achternaam', 'last name', 'surname'], telefoon: ['telefoon', 'telefoonnummer', 'mobiel', 'mobiel nummer', 'mobiele telefoon', 'phone', 'gsm'],
  postcode: ['postcode', 'zip'], woonplaats: ['woonplaats', 'plaats', 'stad'], functie: ['functies', 'functie', 'functiegroep', 'functienaam'],
  accountStatus: ['accountstatus', 'account status', 'status account', 'status medewerker', 'dienstverband status'], startdatum: ['startdatum', 'in dienst sinds', 'datum in dienst', 'indiensttreding', 'in dienst'] };
var XPS_LOON = /salaris|loon|tarief/;  // v7.4: zulke kolommen worden nooit gelezen of bewaard (AVG; loon hoort niet in het talentbestand)
// v7.7 (B4): privékolommen, ook van een ander dan de flexkracht (noodcontact, ouder/verzorger, partner, huisarts): nooit gelezen, ook niet via xpsKolommen
var XPS_PRIVE = /bsn|burgerservice|iban|rekening|bank|paspoort|identiteit|legitimatie|sofi|geboorte|leeftijd|birth|geslacht|nationaliteit|gezondheid|ziek|religie|beperking|nood|emergency|contactpersoon|partner|ouder|verzorger|voogd|huisarts/;
var XPS_FUNCTIE_NIET = /omschrijving|opmerking|notitie|beperking/;  // v7.7 (R1): zo'n kop is vrije tekst, nooit de functiekolom
// v7.4: statussen per soort (deel van de tekst, zonder hoofdletters en accenten); instelbaar met Instellingen xpsStatussen = {"noShow": […], "laat": […], "negeren": […]}.
// Een dienst telt alleen als gewerkt als de status op geen van deze lijkt; 'ziek' wordt altijd genegeerd, wat de instelling ook zegt (AVG: geen gezondheid per persoon).
var XPS_STATUSSEN_STANDAARD = { noShow: ['no-show', 'no show', 'noshow', 'niet verschenen'], laat: ['laat', 'late afmelding'], negeren: ['afwezig', 'ziek', 'geannuleerd', 'reserve'] };
function xpsKolommen() {
  var eigen = instelling('xpsKolommen'), uit = {};
  Object.keys(XPS_KOLOMMEN_STANDAARD).forEach(function (k) { uit[k] = XPS_KOLOMMEN_STANDAARD[k].slice(); });
  if (eigen && typeof eigen === 'object' && !(eigen instanceof Array)) Object.keys(XPS_KOLOMMEN_STANDAARD).forEach(function (k) {  // v7.4: alleen bekende sleutels, alleen tekst (uitMap)
    var l = uitMap(eigen, k); if (l === undefined || l === null) return;
    l = [].concat(l).filter(function (x) { return (typeof x === 'string' || typeof x === 'number') && String(x).trim(); }).map(klein); if (l.length) uit[k] = l;
  });
  return uit;
}
function xpsStatussen() {
  var eigen = instelling('xpsStatussen'), uit = {};
  Object.keys(XPS_STATUSSEN_STANDAARD).forEach(function (k) {
    var l = eigen && typeof eigen === 'object' && !(eigen instanceof Array) ? uitMap(eigen, k) : undefined;
    uit[k] = (l instanceof Array ? l : XPS_STATUSSEN_STANDAARD[k]).filter(function (x) { return typeof x === 'string' && x.trim(); }).map(function (x) { return klein(zonderAccenten(x)); });
  });
  return uit;
}
// 'gewerkt', 'noShow', 'laat', 'negeren' of 'ziek' (telt als negeren, maar een vlag no-show/laat mag hem nooit per persoon zichtbaar maken)
function xpsStatusSoort(status, S) {
  var s = klein(zonderAccenten(status)), past = function (l) { return l.some(function (x) { return s.indexOf(x) >= 0; }); };
  if (!s) return 'gewerkt';
  if (/ziek/.test(s)) return 'ziek';
  if (past(S.noShow)) return 'noShow';
  if (past(S.laat)) return 'laat';
  if (past(S.negeren)) return 'negeren';
  return 'gewerkt';
}
// v7.4: de kolommen van een urenexport in twee rondes: eerst exacte namen voor alle velden, dan een deel van de naam in een kolom die nog vrij is.
// Zo wordt 'Projectleider' geen project en 'Projectnummer' geen accountnummer. Loon- en privékolommen doen nooit mee.
function xpsKolomIndexen(kop, M) {
  var k = kop.map(function (h) { return klein(zonderAccenten(h)); }), c = {}, bezet = {};
  var vrij = function (j, sl) { return !bezet[j] && k[j] && !XPS_LOON.test(k[j]) && !XPS_PRIVE.test(k[j]) && !(sl === 'functie' && XPS_FUNCTIE_NIET.test(k[j])); };  // v7.7 (R1): 'Functieomschrijving' is nooit de functiekolom
  Object.keys(M).forEach(function (sl) {
    c[sl] = -1;
    for (var i = 0; i < M[sl].length && c[sl] < 0; i++) { var j = k.indexOf(klein(zonderAccenten(M[sl][i]))); if (j >= 0 && vrij(j, sl)) { c[sl] = j; bezet[j] = sl; } }
  });
  Object.keys(M).forEach(function (sl) {
    if (c[sl] >= 0) return;
    for (var i = 0; i < M[sl].length && c[sl] < 0; i++) { var n = klein(zonderAccenten(M[sl][i])); if (!n) continue; for (var j = 0; j < k.length; j++) if (vrij(j, sl) && k[j].indexOf(n) >= 0) { c[sl] = j; bezet[j] = sl; break; } }
  });
  return c;
}
function waar(v) { return v === true || /^(ja|yes|true|1|x)$/i.test(String(v || '').trim()); }
function parseDatumNl(s) { var m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(String(s || '').trim()); return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : null; }
function weekUit(w, datum, vandaag) {
  var s = String(w || '').trim(), m;
  if ((m = /^(\d{4})-?W?(\d{1,2})$/i.exec(s))) return m[1] + '-W' + ('0' + Number(m[2])).slice(-2);
  if ((m = /^(\d{1,2})$/.exec(s))) return weekVanNummer(Number(m[1]), vandaag);  // v7.4: de laatste week met dat nummer (in januari is week 52 die van vorig jaar)
  var d = datum instanceof Date ? datum : (parseDatum(String(datum || '').slice(0, 10)) || parseDatumNl(datum));
  return d ? isoWeekStr(d) : '';
}
function weekVanNummer(nr, vandaag) {
  var d = parseDatum(vandaag || datumStr(new Date())), j = d.getFullYear(), w = function (x) { return x + '-W' + ('0' + nr).slice(-2); };
  return w(j) > isoWeekStr(d) ? w(j - 1) : w(j);
}
// v7.4: een datum uit een export (Date uit een Sheet, jjjj-mm-dd, d-m-jjjj, d/m/jjjj, d.m.jjjj of een Excel-datumgetal) als yyyy-MM-dd; anders ''
function exportDag(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : datumStr(v);
  var s = String(v == null ? '' : v).trim(), m; if (!s) return '';
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return geldigeDag(Number(m[1]), Number(m[2]), Number(m[3]));
  if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(s))) return geldigeDag(Number(m[3]), Number(m[2]), Number(m[1]));
  if (/^\d{5}(\.\d+)?$/.test(s)) { var n = Math.floor(Number(s)); if (n > 20000 && n < 80000) return datumStr(new Date(1899, 11, 30 + n, 12)); }  // Excel telt dagen vanaf 30-12-1899
  return '';
}
function geldigeDag(j, m, d) { var x = new Date(j, m - 1, d, 12); return x.getFullYear() === j && x.getMonth() === m - 1 && x.getDate() === d ? datumStr(x) : ''; }
// v7.4: uren als getal, '5,5', '5.5', 'u:mm' of een tijd uit een Sheet
function urenGetal(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getHours() + v.getMinutes() / 60;
  var s = String(v == null ? '' : v).trim(), m = /^(\d+):(\d{2})$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  var n = Number(s.replace(',', '.')); return isFinite(n) ? n : 0;
}
function naamSleutel(s) { return zonderAccenten(String(s == null ? '' : s)).toLowerCase().replace(/\s+/g, ' ').trim(); }  // v7.4: volledige naam, kleine letters, enkele spaties, zonder accenten
function urenOvergeslagenLeeg() { return { status: 0, toekomst: 0, oud: 0, geenTalent: 0, dubbeleNaam: 0, geenUren: 0, geenDatum: 0 }; }
// v7.4: id van een weekregel: de slug van talent|week|project; een lange projectnaam wordt afgekort met een controlegetal, zodat twee projecten met hetzelfde begin niet botsen
function urenId(sleutel) {
  var s = zonderAccenten(String(sleutel).toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!s) return nieuwId();
  if (s.length <= 60) return s;
  var h = 5381; for (var i = 0; i < sleutel.length; i++) h = ((h << 5) + h + sleutel.charCodeAt(i)) | 0;
  return s.slice(0, 52) + '-' + ('000000' + (h >>> 0).toString(36)).slice(-7);
}
// v7.4: project uit de urenexport → project in Athena. Projectnummer exact op xpsProject; anders de projectnaam: eerst exact, dan het langste xpsProject
// (minstens 5 tekens) dat in de naam voorkomt. Zo kan de beheerder een vast deel van de XPS-projectnaam (zonder de periode) als xpsProject invullen.
function projectKoppelaar(trajecten) {
  var exact = {}, delen = [], cache = {};
  (trajecten || []).forEach(function (t) { var x = naamSleutel(t.xpsProject); if (!x) return; exact['p' + x] = t; if (x.length >= 5) delen.push({ x: x, t: t }); });
  delen.sort(function (a, b) { return b.x.length - a.x.length; });
  return function (nummer, tekst) {
    var n = naamSleutel(nummer), s = naamSleutel(tekst), k = 'c' + n + '|' + s;
    if (k in cache) return cache[k];
    var t = (n && exact['p' + n]) || (s && exact['p' + s]) || null;
    for (var i = 0; !t && s && i < delen.length; i++) if (s.indexOf(delen[i].x) >= 0) t = delen[i].t;
    return (cache[k] = t);
  };
}
function xpsFout(melding) { var e = new Error(melding); e.xpsExport = true; return e; }
// Rijen (eerste rij = kop) → weekaggregaten per talent, week en project. Zuiver (geen Sheet), dus los te testen.
// v7.4: alleen een gewerkte dienst (datum t/m vandaag, binnen het archiefvenster, status niet afwezig/ziek/geannuleerd/reserve) telt mee met zijn uren;
// koppeling op accountnummer, dan e-mail, dan een volledige naam die bij precies één talent hoort. Wat niet meetelt, wordt per reden geteld.
// opties: { vandaag: 'yyyy-MM-dd' (standaard vandaag), trajecten: [...] (zet trajectId), statussen: xpsStatussen() }
function urenUitRijen(rijen, talenten, opties) {
  opties = opties && typeof opties === 'object' ? opties : {};
  var vandaag = /^\d{4}-\d{2}-\d{2}$/.test(String(opties.vandaag || '')) ? opties.vandaag : datumStr(new Date()), grens = urenArchiefGrens(vandaag);
  var uit = { regels: [], onbekend: [], onbekendAantal: 0, dubbel: [], dubbelAantal: 0, aantalRegels: 0, gelezen: 0, gekoppeld: 0, weekregels: 0, overgeslagen: urenOvergeslagenLeeg(), genegeerdeKolommen: [], kolommen: {}, archiefVanaf: grens };
  if (!rijen || rijen.length < 2) return uit;
  var kop = rijen[0].map(function (h) { return String(h == null ? '' : h).trim(); }), c = xpsKolomIndexen(kop, xpsKolommen());
  if (c.uren < 0 && c.status < 0) throw xpsFout('Geen kolom met uren of status gevonden; stel xpsKolommen in (Instellingen) of controleer de export.');
  if (c.xpsId < 0 && c.email < 0 && c.naam < 0) throw xpsFout('Dit bestand heeft geen kolom om uren aan talenten te koppelen (accountnummer, e-mail of naam). Vraag XPS de export met accountnummer, of stel xpsKolommen in.');
  Object.keys(c).forEach(function (k) { if (c[k] >= 0) uit.kolommen[k] = kop[c[k]]; });
  kop.forEach(function (h, j) {
    if (!h || Object.keys(c).some(function (k) { return c[k] === j; })) return;
    var n = klein(zonderAccenten(h));
    uit.genegeerdeKolommen.push({ kolom: h, hint: XPS_LOON.test(n) ? 'loongegevens: worden nooit gelezen of bewaard; laat deze kolom uit de export' : XPS_PRIVE.test(n) ? 'persoonsgegevens die niet in Athena horen: nooit gelezen; laat deze kolom uit de export' : /omschrijving|opmerking|notitie/.test(n) ? 'vrije tekst: niet gelezen' : '' });
  });
  var S = opties.statussen || xpsStatussen(), koppel = opties.trajecten ? projectKoppelaar(opties.trajecten) : null, dezeWeek = isoWeekStr(parseDatum(vandaag));
  var perXps = {}, perEmail = {}, perNaam = {};
  (talenten || []).forEach(function (t) {
    if (t.xpsId) perXps['x' + klein(t.xpsId)] = t; if (t.email) perEmail['e' + klein(t.email)] = t;
    var n = naamSleutel([t.voornaam, t.achternaam].filter(Boolean).join(' ')); if (n) (perNaam['n' + n] = perNaam['n' + n] || []).push(t);
  });
  var agg = {}, volgorde = [], onbekend = {}, dubbel = {}, over = uit.overgeslagen, n = 0, gekoppeld = 0, dagC = {}, weekC = {}, statusC = {}, naamC = {};
  var cel = function (r, k) { var v = c[k] >= 0 ? r[c[k]] : ''; return v == null ? '' : v; };
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i]; if (!r || !r.some(function (x) { return x !== '' && x != null; })) continue; n++;
    // 1. datum en week: geen datum, in de toekomst of ouder dan het archiefvenster telt niet
    var ruw = cel(r, 'datum'), dag = '', week = '';
    if (ruw !== '') { var dk = 'd' + (ruw instanceof Date ? ruw.getTime() : String(ruw)); dag = dk in dagC ? dagC[dk] : (dagC[dk] = exportDag(ruw)); }
    if (dag) week = weekC['w' + dag] || (weekC['w' + dag] = isoWeekStr(parseDatum(dag)));
    else week = weekUit(cel(r, 'week'), '', vandaag);
    if (!week) { over.geenDatum++; continue; }
    if (dag ? dag > vandaag : week > dezeWeek) { over.toekomst++; continue; }
    if (week < grens) { over.oud++; continue; }
    // 2. status: afwezig, ziek, geannuleerd en reserve tellen niet (alleen in het totaal 'status', nooit per persoon)
    var sk = 's' + String(cel(r, 'status')), soort = sk in statusC ? statusC[sk] : (statusC[sk] = xpsStatusSoort(cel(r, 'status'), S));
    if (soort !== 'ziek' && soort !== 'negeren') { if (waar(cel(r, 'noShow'))) soort = 'noShow'; else if (waar(cel(r, 'laat'))) soort = 'laat'; }
    if (soort === 'ziek' || soort === 'negeren') { over.status++; continue; }
    // 3. talent: accountnummer, dan e-mail, dan een volledige naam die bij precies één talent hoort (en geen ander accountnummer heeft)
    var xpsRuw = String(cel(r, 'xpsId')).trim(), xps = klein(xpsRuw), email = klein(cel(r, 'email')), naamRuw = String(cel(r, 'naam')).trim();
    var t = (xps && perXps['x' + xps]) || (email && perEmail['e' + email]) || null, ns = '';
    if (!t && naamRuw) {
      ns = ('n' + naamRuw) in naamC ? naamC['n' + naamRuw] : (naamC['n' + naamRuw] = naamSleutel(naamRuw));
      var kand = ns ? perNaam['n' + ns] : null;
      if (kand && kand.length > 1) { over.dubbeleNaam++; var dbl = dubbel['n' + ns] = dubbel['n' + ns] || { naam: naamRuw, diensten: 0, talenten: kand.length }; dbl.diensten++; continue; }
      if (kand && !(xps && kand[0].xpsId && klein(kand[0].xpsId) !== xps)) t = kand[0];
    }
    if (!t) {
      over.geenTalent++; var sl = xps ? 'x' + xps : email ? 'e' + email : ns ? 'n' + ns : '';
      if (sl) { var o = onbekend[sl] = onbekend[sl] || { xpsId: xps, email: email, naam: naamRuw, diensten: 0 }; o.diensten++; }
      continue;
    }
    // 4. uren: een gewerkte dienst zonder uren telt niet
    var uren = urenGetal(cel(r, 'uren'));
    if (soort === 'gewerkt' && c.uren >= 0 && !(uren > 0)) { over.geenUren++; continue; }
    var pNr = String(cel(r, 'projectNummer')).trim(), pTekst = String(cel(r, 'project')).trim(), project = pNr || pTekst, key = t.id + '|' + week + '|' + project, a = agg['a' + key];
    if (!a) {
      a = agg['a' + key] = { id: urenId(key), talentId: t.id, xpsId: t.xpsId || (/\d/.test(xpsRuw) && !/\s/.test(xpsRuw) ? xpsRuw : ''), xpsProject: project, week: week, uren: 0, diensten: 0, noShows: 0, lateAfmeldingen: 0 };  // nooit een naam als xpsId
      if (koppel) { var tr = koppel(pNr, pTekst); a.trajectId = tr ? tr.id : ''; }
      volgorde.push(a);
    }
    gekoppeld++;
    if (soort === 'noShow') a.noShows++; else if (soort === 'laat') a.lateAfmeldingen++; else { a.diensten++; a.uren += uren; }
  }
  var lijst = function (o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(function (x, y) { return y.diensten - x.diensten || String(x.naam).localeCompare(String(y.naam)); }); };
  var onb = lijst(onbekend), dub = lijst(dubbel);
  uit.regels = volgorde.map(function (a) { a.uren = Math.round(a.uren * 100) / 100; return a; });
  uit.onbekend = onb.slice(0, 50); uit.onbekendAantal = onb.length; uit.dubbel = dub.slice(0, 50); uit.dubbelAantal = dub.length;
  uit.aantalRegels = uit.gelezen = n; uit.gekoppeld = gekoppeld; uit.weekregels = uit.regels.length;
  return uit;
}
function rijenVanBestand(f) {
  var mime = f.getMimeType(), naam = klein(f.getName());
  try {
    if (mime === MimeType.CSV || mime === MimeType.PLAIN_TEXT || /\.(csv|txt)$/.test(naam)) { var tekst = f.getBlob().getDataAsString('UTF-8').replace(/^﻿/, ''); return Utilities.parseCsv(tekst, (tekst.split('\n')[0] || '').indexOf(';') >= 0 ? ';' : ','); }
    if (mime === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId()).getSheets()[0].getDataRange().getValues();
    if (/spreadsheetml|ms-excel/.test(mime) || /\.xlsx?$/.test(naam)) {  // Excel: via de Drive API omzetten naar een Google Sheet (Services → Drive API), daarna weer weg
      if (typeof Drive === 'undefined') return null;
      var kopie = Drive.Files.create ? Drive.Files.copy({ name: 'tmp-athena-' + f.getName(), mimeType: MimeType.GOOGLE_SHEETS }, f.getId()) : Drive.Files.copy({ title: 'tmp-athena-' + f.getName(), mimeType: MimeType.GOOGLE_SHEETS }, f.getId());
      try { return SpreadsheetApp.openById(kopie.id).getSheets()[0].getDataRange().getValues(); } finally { verwijderDriveBestand(kopie.id); }  // v7.7 (R13): de kopie definitief weg, niet naar de prullenbak
    }
  } catch (e) { Logger.log('Export ' + f.getName() + ' niet gelezen: ' + e); }
  return null;
}
// v7.7 (R13): een tijdelijk bestand (de Sheet-kopie van een Excel) definitief verwijderen via de Drive API (remove, anders delete); lukt dat niet, dan de prullenbak
function verwijderDriveBestand(id) {
  try { if (typeof Drive !== 'undefined' && Drive.Files.remove) Drive.Files.remove(id); else Drive.Files['delete'](id); return; } catch (e) { Logger.log('Tijdelijk bestand niet definitief verwijderd: ' + e); }
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e2) {}
}
// Een kandidaat die klaar voor start staat en in de uren van zijn project voorkomt, staat echt op de werkvloer: geplaatst (altijd binnen metLock)
function plaatsingenUitUren(regels) {
  var per = {}; regels.forEach(function (a) { if (a.trajectId && a.diensten > 0) per[a.talentId + '|' + a.trajectId] = true; });
  var wijz = lees('Kandidaten').filter(function (k) { return k.talentId && k.status === KANDIDAAT_KLAAR && per[k.talentId + '|' + k.trajectId]; }).map(function (k) { var h = kandidaatHistorie(k); h.geplaatst = h.geplaatst || nu(); return { id: k.id, status: 'geplaatst', statusSinds: nu(), statusHistorie: h }; });
  if (wijz.length) schrijfVeel('Kandidaten', wijz);
  return wijz.length;
}
// v7.4: elk bestand apart (een bestand zonder koppelkolom geeft een fout in 'fouten', de rest gaat door); alleen gewijzigde weekregels worden geschreven,
// zodat een volledige export elke week opnieuw kan zonder de Sheet rij voor rij te herschrijven. Na een fout schuift LAATSTE_URENIMPORT niet op,
// zodat hetzelfde bestand na het aanpassen van xpsKolommen opnieuw wordt gelezen. Is geen enkel bestand te lezen, dan volgt de fout zelf.
function urenImport() {
  var map = xpsExportMap(), sinds = P.getProperty('LAATSTE_URENIMPORT') || '', talenten = lees('Talenten'), opties = { trajecten: lees('Trajecten'), statussen: xpsStatussen(), vandaag: datumStr(new Date()) };
  var stats = { bestanden: 0, regels: 0, gelezen: 0, gekoppeld: 0, weekregels: 0, weken: 0, ongewijzigd: 0, overgeslagen: urenOvergeslagenLeeg(), onbekend: [], onbekendAantal: 0, dubbel: [], dubbelAantal: 0,
    genegeerdeKolommen: [], kandidatenBijgewerkt: 0, nietGelezen: [], accountBestanden: [], fouten: [], archiefVanaf: urenArchiefGrens(opties.vandaag), archiefWeken: UREN_ARCHIEF_WEKEN, sinds: sinds }, perRegel = {};  // v7.7 (R4): accountBestanden
  var samen = function (doel, lijst, sleutel) { lijst.forEach(function (o) { var k = sleutel(o), hit = doel.filter(function (x) { return sleutel(x) === k; })[0]; if (hit) hit.diensten += o.diensten; else doel.push(o); }); };
  var it = map.getFiles();
  while (it.hasNext()) {
    var f = it.next(); if (sinds && datumTijdStr(f.getLastUpdated()) <= sinds) continue;
    var rijen = rijenVanBestand(f);
    if (!rijen) { stats.nietGelezen.push(f.getName()); continue; }
    if (isAccountExport(rijen)) { stats.accountBestanden.push(f.getName()); continue; }  // v7.7 (R4): de accountexport hoort bij talentImport; geen fout, de eigenschap schuift gewoon op
    var r;
    try { r = urenUitRijen(rijen, talenten, opties); } catch (e) { if (!e.xpsExport) throw e; stats.fouten.push({ bestand: f.getName(), melding: e.message }); continue; }
    stats.bestanden++; stats.regels += r.gelezen; stats.gelezen += r.gelezen; stats.gekoppeld += r.gekoppeld;
    r.regels.forEach(function (a) { perRegel[a.id] = a; });  // dezelfde week in twee bestanden: het laatst gelezen bestand telt (geen dubbele uren)
    Object.keys(r.overgeslagen).forEach(function (k) { stats.overgeslagen[k] += r.overgeslagen[k]; });
    samen(stats.onbekend, r.onbekend, function (o) { return o.xpsId + '|' + o.email + '|' + naamSleutel(o.naam); }); stats.onbekendAantal += r.onbekendAantal;
    samen(stats.dubbel, r.dubbel, function (o) { return naamSleutel(o.naam); }); stats.dubbelAantal += r.dubbelAantal;
    r.genegeerdeKolommen.forEach(function (g) { if (!stats.genegeerdeKolommen.some(function (x) { return x.kolom === g.kolom; })) stats.genegeerdeKolommen.push(g); });
  }
  if (stats.fouten.length && !stats.bestanden) throw new Error(stats.fouten.map(function (x) { return x.bestand + ': ' + x.melding; }).join(' '));
  var alle = Object.keys(perRegel).map(function (k) { return perRegel[k]; });
  if (alle.length) metLock(function () {
    var oud = perId(lees('TalentUren')), tekst = ['talentId', 'xpsProject', 'trajectId', 'week'], getal = ['uren', 'diensten', 'noShows', 'lateAfmeldingen'];
    var nieuw = alle.filter(function (a) { var o = oud[a.id]; return !o || tekst.some(function (v) { return String(o[v] == null ? '' : o[v]) !== String(a[v] == null ? '' : a[v]); }) || getal.some(function (v) { return (Number(o[v]) || 0) !== (Number(a[v]) || 0); }); });
    stats.ongewijzigd = alle.length - nieuw.length;
    nieuw.forEach(function (a) { a.geimporteerd = nu(); });
    if (nieuw.length) schrijfVeel('TalentUren', nieuw);
    stats.kandidatenBijgewerkt = plaatsingenUitUren(alle);
  });
  stats.weekregels = alle.length; stats.weken = uniek(alle.map(function (a) { return a.week; })).length;
  stats.onbekend.sort(function (x, y) { return y.diensten - x.diensten; }); stats.onbekend = stats.onbekend.slice(0, 50);
  stats.dubbel.sort(function (x, y) { return y.diensten - x.diensten; }); stats.dubbel = stats.dubbel.slice(0, 50);
  if (!stats.fouten.length) P.setProperty('LAATSTE_URENIMPORT', nu());
  return stats;
}
function apiTalentUrenImport() { if (niveau('talenten', 'wijzigen') !== 'alles') throw new Error('Daar heb je geen toegang toe.'); return urenImport(); }
function talentUrenTrigger() { try { var s = urenImport(); if (s.fouten.length) Logger.log('Urenimport: ' + s.fouten.map(function (x) { return x.bestand + ': ' + x.melding; }).join(' ')); } catch (e) { Logger.log('Urenimport mislukt: ' + e); } }

/* ----- v7.7: talenten uit de XPS-accountexport (Drive-map XPS-export) ----- */
// Eén profiel per account. Koppelen aan een bestaand talent op accountnummer, dan e-mail, dan telefoon, dan een volledige naam die bij precies
// één talent hoort (nooit een naam in xpsId). Een bestaand profiel wordt alleen aangevuld (lege velden); wat het talentteam beheert (status,
// beschikbaarheid, notitie, tags) blijft staan. De kolomnamen van de accountexport zijn niet vast: herkenning op naam (XPS_KOLOMMEN_STANDAARD),
// met de instelling xpsKolommen als overschrijving, net als de uren. Loon- en privékolommen (XPS_LOON, XPS_PRIVE) worden nooit gelezen.
// Zie backend/README.md, sectie "Talenten importeren uit XPS".
var TALENT_IMPORT_FUNCTIES_MAX = 30, TALENT_IMPORT_CONFLICT_MAX = 20, ACCOUNT_ACTIEF = /actief|active|in dienst|geplaatst|werkzaam/, ACCOUNT_NIET_ACTIEF = /inactie|niet actief|uit dienst|geblokkeerd|gearchiveerd|beeindigd|beëindigd|gestopt/;
var XPS_PLAATSHOUDER = /^(-|–|—|\.|\?|n\.v\.t\.?|nvt)$/i;  // v7.7 (R7): zo'n cel telt als leeg
// v7.7 (R6): een datumkolom telt alleen als urenkolom als de kop niet op een andere datum lijkt (datum uit dienst, einddatum, aanmaakdatum); een week- of urenkolom niet bij uren per week, contracturen, weekend beschikbaar
var XPS_DATUM_NIET = /dienst|eind|aanmaak|mutatie|wijzig|start/, XPS_UREN_NIET = /per week|contract|max|weekend|beschikbaar|registratie/;
// Lijkt de accountstatus op actief? Zonder statuskolom (null) wel; 'Inactief' en 'Uit dienst' niet, ook al staat er 'actief' of 'dienst' in
function accountActief(s) { if (s === null) return true; s = klein(s); return !ACCOUNT_NIET_ACTIEF.test(s) && ACCOUNT_ACTIEF.test(s); }
function talentOvergeslagenLeeg() { return { geenNaam: 0, geenContact: 0, dubbelInBestand: 0, uitgeschreven: 0, nietActief: 0, conflict: 0 }; }  // v7.7 (B1, B3): nietActief en conflict
// v7.7 (R5): 'Voornaam tussenvoegsel Achternaam' of 'Achternaam, Voornaam tussenvoegsel' ('Berg, Pien van der' → Pien / van der Berg); tussenvoegsels blijven bij de achternaam
function naamSplits(naam) {
  var s = String(naam == null ? '' : naam).trim().replace(/^[\s,]+|[\s,]+$/g, ''), m = /^([^,]+),\s*(.+)$/.exec(s);  // v7.7 (verificatie): losse komma's aan de randen tellen niet
  if (m) { var rest = m[2].replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean); return { voornaam: rest[0] || '', achternaam: rest.slice(1).concat([m[1].trim()]).join(' ') }; }
  var d = s.split(/\s+/).filter(Boolean); return { voornaam: d[0] || '', achternaam: d.slice(1).join(' ') };
}
// v7.7 (R7): een cel met postcode en plaats ('1234 AB Utrecht') → postcode en woonplaats, via postcodeUitCel van het aanmeldformulier ({postcode, rest}); de woonplaats alleen als de woonplaatskolom leeg is
function postcodePlaatsUitCel(v) {
  var s = tekstIn(String(v == null ? '' : v)), m = postcodeUitCel(s);
  return m ? { postcode: m.postcode, woonplaats: plaatsNaPostcode(m.rest) } : { postcode: postcodeIn(s), woonplaats: '' };  // v7.7 (verificatie): zoals het aanmeldformulier: leestekens en land eraf
}
// v7.7 (B2): sha-256 (hex) van een contactgegeven voor de onderdrukkingslijst velden.vergeten van een geanonimiseerd profiel: niet terug te rekenen, wel te vergelijken
function onderdrukHash(s) {
  s = String(s == null ? '' : s); if (!s) return '';
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8), hex = '';
  for (var i = 0; i < b.length; i++) { var x = b[i] < 0 ? b[i] + 256 : b[i]; hex += (x < 16 ? '0' : '') + x.toString(16); }
  return hex;
}
function onderdrukHashes(email, xpsId, telefoon) { return [onderdrukHash(klein(email)), onderdrukHash(klein(xpsId)), onderdrukHash(telefoonIn(telefoon))].filter(Boolean); }
function veldenZonderVergeten(v) { if (!v || typeof v !== 'object' || !('vergeten' in v)) return v; var u = {}; Object.keys(v).forEach(function (k) { if (k !== 'vergeten') u[k] = v[k]; }); return u; }  // v7.7 (B2): de hashes zijn geen persoonsgegeven voor de app of de inzage-export
function accountNummerIn(v) { var s = String(v == null ? '' : v).trim(); return /\d/.test(s) && !/\s/.test(s) ? s : ''; }  // nooit een naam als accountnummer
// Welke export is dit? 'uren' (een datum-, week- of urenkolom: de dienstenexport, die hoort bij urenImport) of 'account' (een naam plus e-mail,
// telefoon of postcode); anders een fout met uitleg. "Uren per week" of "Contracturen" in een accountexport telt niet als urenkolom.
// v7.7 (R6): met stil geeft hij '' in plaats van een fout (voor urenImport, R4).
function accountExportSoort(c, kop, stil) {
  var urenachtig = function (j, niet) { return j >= 0 && !niet.test(klein(zonderAccenten(kop[j]))); };
  if (urenachtig(c.datum, XPS_DATUM_NIET) || urenachtig(c.week, XPS_UREN_NIET) || urenachtig(c.uren, XPS_UREN_NIET)) return 'uren';
  var naam = c.naam >= 0 || c.voornaam >= 0 || c.achternaam >= 0, contact = c.email >= 0 || c.telefoon >= 0 || c.postcode >= 0;
  if (stil) return naam && contact ? 'account' : '';
  if (!naam) throw xpsFout('Dit bestand heeft geen naamkolom (naam, of voornaam en achternaam); stel xpsKolommen in (Instellingen) of controleer de export.');
  if (!contact) throw xpsFout('Dit bestand heeft geen kolom met e-mail, telefoon of postcode en is dus geen accountexport. Vraag XPS de export met e-mail en telefoon, of stel xpsKolommen in.');
  return 'account';
}
function isAccountExport(rijen) {
  if (!rijen || !rijen.length) return false;
  var kop = rijen[0].map(function (h) { return String(h == null ? '' : h).trim(); }), c = xpsKolomIndexen(kop, xpsKolommen());
  if (c.datum >= 0 || c.week >= 0 || c.uren >= 0) return false;  // v7.7 (verificatie): met een datum-, week- of urenkolom nooit stil als accountexport overslaan; urenUitRijen geeft dan zelf zijn Nederlandse fout
  return accountExportSoort(c, kop, true) === 'account';
}  // v7.7 (R4)
// Functies uit een cel tegen de keuzelijst talentFuncties, tolerant: een onbekend woord gooit niet maar wordt geteld (en niet gezet).
// v7.7 (R1): een onbekend woord gaat door vrijeTekst (hoogstens 60 tekens, nooit privé- of bijzondere persoonsgegevens); leeg of niet overgenomen telt niet
function functiesTolerant(v, lijst, onbekend) {
  var codes = [];
  lijstIn(v).forEach(function (x) {
    var k = klein(x), z = klein(zonderAccenten(x)), hit = lijst.indexOf(k) >= 0 ? k : lijst.indexOf(z) >= 0 ? z : '';
    if (!k || XPS_PLAATSHOUDER.test(k)) return;  // v7.7 (verificatie): een plaatshouder ('-', 'n.v.t.') is geen functie en telt niet als niet herkend
    if (hit) { if (codes.indexOf(hit) < 0) codes.push(hit); }
    else if (k) { var vt = vrijeTekst(x); if (vt && vt !== AANMELD_NIET_OVERGENOMEN) { var kk = klein(vt); onbekend[kk] = (onbekend[kk] || 0) + 1; } }
  });
  return codes;
}
function nietHerkendLijst(onbekend) { return Object.keys(onbekend).map(function (k) { return { functie: k, aantal: onbekend[k] }; }).sort(function (a, b) { return b.aantal - a.aantal || a.functie.localeCompare(b.functie); }).slice(0, TALENT_IMPORT_FUNCTIES_MAX); }
// Rijen (eerste rij = kop) → nieuwe profielen en aanvullingen op bestaande, zonder te schrijven (zuiver, dus los te testen).
// opties: { vandaag: 'yyyy-MM-dd', functies: keuzelijst('talentFuncties') }. soort 'uren' = dit is een urenexport (niets gelezen).
function talentUitRijen(rijen, talenten, opties) {
  opties = opties && typeof opties === 'object' ? opties : {};
  var vandaag = /^\d{4}-\d{2}-\d{2}$/.test(String(opties.vandaag || '')) ? opties.vandaag : datumStr(new Date()), functies = opties.functies instanceof Array ? opties.functies : keuzelijst('talentFuncties');
  var uit = { soort: 'account', regels: 0, nieuw: [], bijgewerkt: [], ongewijzigd: 0, overgeslagen: talentOvergeslagenLeeg(), conflicten: [], nietHerkendeFuncties: [], genegeerdeKolommen: [], kolommen: {} };
  if (!rijen || !rijen.length) return uit;
  var kop = rijen[0].map(function (h) { return String(h == null ? '' : h).trim(); }), c = xpsKolomIndexen(kop, xpsKolommen());
  uit.soort = accountExportSoort(c, kop);
  if (uit.soort !== 'account') return uit;
  if (c.voornaam >= 0 && c.achternaam >= 0) c.naam = -1;  // v7.7 (B4): de naamkolom alleen als er geen voornaam- én achternaamkolom is
  var statusKol = c.accountStatus >= 0 ? 'accountStatus' : (c.status >= 0 ? 'status' : '');  // in een accountexport is een kolom 'Status' de status van het account
  var gebruikt = ['xpsId', 'naam', 'voornaam', 'achternaam', 'email', 'telefoon', 'postcode', 'woonplaats', 'functie', 'startdatum'].concat(statusKol ? [statusKol] : []);
  gebruikt.forEach(function (k) { if (c[k] >= 0) uit.kolommen[k] = kop[c[k]]; });
  kop.forEach(function (h, j) {
    if (!h || gebruikt.some(function (k) { return c[k] === j; })) return;
    var n = klein(zonderAccenten(h));
    uit.genegeerdeKolommen.push({ kolom: h, hint: XPS_LOON.test(n) ? 'loongegevens: worden nooit gelezen of bewaard; laat deze kolom uit de export' : XPS_PRIVE.test(n) ? 'persoonsgegevens die niet in Athena horen: nooit gelezen; laat deze kolom uit de export' : XPS_FUNCTIE_NIET.test(n) ? 'vrije tekst: niet gelezen' : '' });
  });
  var perXps = {}, perEmail = {}, perTel = {}, perNaam = {}, onbekendF = {}, over = uit.overgeslagen, onderdrukt = {}, onderdruktAantal = 0;
  var onderdruk = function (h) { if (h && !onderdrukt['h' + h]) { onderdrukt['h' + h] = 1; onderdruktAantal++; } };
  var indexeer = function (t) {
    if (t.xpsId) perXps['x' + klein(t.xpsId)] = t; if (t.email) perEmail['e' + klein(t.email)] = t; var tel = telefoonIn(t.telefoon); if (tel) perTel['t' + tel] = t;
    var n = naamSleutel([t.voornaam, t.achternaam].filter(Boolean).join(' ')); if (n) (perNaam['n' + n] = perNaam['n' + n] || []).push(t);
    // v7.7 (B2): de onderdrukkingslijst van een geanonimiseerd profiel en de contactgegevens van elk uitgeschreven profiel: zo'n rij komt nooit terug
    var vg = veldenUit(t.velden).vergeten; if (vg instanceof Array) vg.forEach(onderdruk);
    if (t.status === 'uitgeschreven') onderdrukHashes(t.email, t.xpsId, t.telefoon).forEach(onderdruk);
  };
  (talenten || []).forEach(indexeer);
  var cel = function (r, k) { var v = c[k] >= 0 ? r[c[k]] : ''; return v == null ? '' : v; };
  var tekst = function (r, k) { if (c[k] < 0) return ''; var v = tekstIn(String(cel(r, k))); return XPS_PLAATSHOUDER.test(v) ? '' : v; };  // v7.7 (R7): '-', '—', '.', '?', 'n.v.t.' tellen als leeg
  var kand = [], perSleutel = {};
  for (var i = 1; i < rijen.length; i++) {
    var r = rijen[i]; if (!r || !r.some(function (x) { return x !== '' && x != null; })) continue; uit.regels++;
    // 1. naam: aparte kolommen, anders de volledige naam gesplitst (eerste woord voornaam, de rest achternaam)
    var vn = tekst(r, 'voornaam'), an = tekst(r, 'achternaam');
    if (!vn && !an) { var sp = naamSplits(tekst(r, 'naam')); vn = sp.voornaam; an = sp.achternaam; }
    if (!vn && !an) { over.geenNaam++; continue; }
    // 2. contact: accountnummer, e-mail (klein), telefoon (ook als getal zonder voorloopnul)
    var xps = accountNummerIn(cel(r, 'xpsId')), email = klein(cel(r, 'email')); if (email.indexOf('@') < 0) email = '';
    var tel = c.telefoon >= 0 ? telefoonUitCel(cel(r, 'telefoon')) : '';
    if (!xps && !email && !tel) { over.geenContact++; continue; }
    var pc = c.postcode >= 0 && tekst(r, 'postcode') ? postcodePlaatsUitCel(tekst(r, 'postcode')) : { postcode: '', woonplaats: '' };  // v7.7 (R7): '1234 AB Utrecht' in één cel
    var k = { vn: vn, an: an, xps: xps, email: email, tel: tel, postcode: pc.postcode, woonplaats: tekst(r, 'woonplaats') || pc.woonplaats, functiesRuw: cel(r, 'functie'),
      status: statusKol ? klein(cel(r, statusKol)) : null, start: c.startdatum >= 0 ? exportDag(cel(r, 'startdatum')) : '', vervallen: false };
    // 3. hetzelfde accountnummer of e-mailadres twee keer in het bestand: de laatste telt
    var dubbel = false;
    [xps ? 'x' + klein(xps) : '', email ? 'e' + email : ''].forEach(function (sl) { if (!sl) return; if (perSleutel[sl]) { perSleutel[sl].vervallen = true; dubbel = true; } perSleutel[sl] = k; });
    if (dubbel) over.dubbelInBestand++;
    kand.push(k);
  }
  kand.forEach(function (k) {
    if (k.vervallen) return;
    // v7.7 (B2): op de onderdrukkingslijst (geanonimiseerd of uitgeschreven): overslaan, nooit een nieuw profiel
    if (onderdruktAantal && [k.email, k.xps ? klein(k.xps) : '', k.tel].some(function (v) { return v && onderdrukt['h' + onderdrukHash(v)]; })) { over.uitgeschreven++; return; }
    // 4. koppelen: accountnummer → e-mail → telefoon → een volledige naam die bij precies één talent hoort (en geen ander accountnummer heeft)
    var viaE = (k.email && perEmail['e' + k.email]) || null, viaT = (k.tel && perTel['t' + k.tel]) || null;
    var t = (k.xps && perXps['x' + klein(k.xps)]) || viaE || viaT || null;
    // v7.7 (B3): het accountnummer wijst naar talent A maar de e-mail of telefoon naar talent B, of A heeft al een ander accountnummer: niet toepassen
    if ((viaE && viaE !== t) || (viaT && viaT !== t) || (t && k.xps && t.xpsId && klein(t.xpsId) !== klein(k.xps))) {
      over.conflict++;
      if (uit.conflicten.length < TALENT_IMPORT_CONFLICT_MAX) uit.conflicten.push({ naam: (k.vn + ' ' + k.an).trim(), xpsId: k.xps, email: k.email, reden: 'tegenstrijdig accountnummer of e-mailadres (niet gewijzigd)' });
      return;
    }
    if (!t) { var l = perNaam['n' + naamSleutel(k.vn + ' ' + k.an)]; if (l && l.length === 1 && !(k.xps && l[0].xpsId && klein(l[0].xpsId) !== klein(k.xps))) t = l[0]; }
    var codes = functiesTolerant(k.functiesRuw, functies, onbekendF);
    if (t) {
      if (t.status === 'uitgeschreven') { over.uitgeschreven++; return; }
      var w = {};  // alleen lege velden vullen
      if (!t.xpsId && k.xps) w.xpsId = k.xps; if (!t.email && k.email) w.email = k.email; if (!t.telefoon && k.tel) w.telefoon = k.tel;
      if (!t.postcode && k.postcode) w.postcode = k.postcode; if (!t.woonplaats && k.woonplaats) w.woonplaats = k.woonplaats;
      if (!lijstUit(t.functies).length && codes.length) w.functies = codes;
      if (Object.keys(w).length) { w.id = t.id; uit.bijgewerkt.push(w); Object.keys(w).forEach(function (x) { t[x] = w[x]; }); } else uit.ongewijzigd++;
      return;
    }
    if (!accountActief(k.status)) { over.nietActief++; return; }  // v7.7 (B1): een inactief account (uit dienst, inactief, lege status) wordt nooit een nieuw profiel; het mag alleen een bestaand profiel aanvullen
    var n = { id: nieuwId(), voornaam: k.vn, achternaam: k.an, email: k.email, telefoon: k.tel, postcode: k.postcode, woonplaats: k.woonplaats, xpsId: k.xps, functies: codes, bron: 'xps-bestand',
      status: 'actief', statusSinds: nu(), aangemaakt: nu(), door: ikNaam(),
      toestemmingDatum: vandaag, toestemmingGrondslag: 'overeenkomst', bewarenTot: bewarenTotVan(vandaag), velden: k.start ? { inDienstSinds: k.start } : '' };  // ⚠️ grondslag overeenkomst (het account in XPS); zie backend/README.md. De startdatum alleen bij een nieuw profiel, als vrij veld inDienstSinds
    uit.nieuw.push(n); indexeer(n);  // een volgende rij met dezelfde persoon vult dit profiel aan in plaats van een tweede te maken
  });
  uit.nietHerkendeFuncties = nietHerkendLijst(onbekendF);
  return uit;
}
// Elk bestand in XPS-export dat nieuwer is dan de laatste talentimport. Een urenexport in de map wordt overgeslagen (urenBestanden); een bestand
// zonder naam- of contactkolom staat in fouten en LAATSTE_TALENTIMPORT schuift dan niet op; is geen enkel accountbestand te lezen, dan volgt de fout zelf.
function talentImport() {
  var map = xpsExportMap(), sinds = P.getProperty('LAATSTE_TALENTIMPORT') || '', talenten = lees('Talenten').slice(), opties = { vandaag: datumStr(new Date()), functies: keuzelijst('talentFuncties') };
  var stats = { bestanden: 0, regels: 0, nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, overgeslagen: talentOvergeslagenLeeg(), conflicten: [], nietHerkendeFuncties: [], genegeerdeKolommen: [], kolommen: {}, urenBestanden: [], nietGelezen: [], fouten: [], sinds: sinds };  // v7.7: conflicten (B3) en kolommen (B4)
  var nieuw = [], wijz = [], nietF = {};
  var it = map.getFiles();
  while (it.hasNext()) {
    var f = it.next(); if (sinds && datumTijdStr(f.getLastUpdated()) <= sinds) continue;
    var rijen = rijenVanBestand(f);
    if (!rijen) { stats.nietGelezen.push(f.getName()); continue; }
    var r;
    try { r = talentUitRijen(rijen, talenten, opties); } catch (e) { if (!e.xpsExport) throw e; stats.fouten.push({ bestand: f.getName(), melding: e.message }); continue; }
    if (r.soort === 'uren') { stats.urenBestanden.push(f.getName()); continue; }
    stats.bestanden++; stats.regels += r.regels; stats.ongewijzigd += r.ongewijzigd;
    Object.keys(r.overgeslagen).forEach(function (k) { stats.overgeslagen[k] += r.overgeslagen[k]; });
    r.nieuw.forEach(function (n) { nieuw.push(n); talenten.push(n); });  // een volgend bestand koppelt aan het profiel uit dit bestand
    r.bijgewerkt.forEach(function (w) { wijz.push(w); });
    r.nietHerkendeFuncties.forEach(function (x) { nietF[x.functie] = (nietF[x.functie] || 0) + x.aantal; });
    r.genegeerdeKolommen.forEach(function (g) { if (!stats.genegeerdeKolommen.some(function (x) { return x.kolom === g.kolom; })) stats.genegeerdeKolommen.push(g); });
    r.conflicten.forEach(function (x) { if (stats.conflicten.length < TALENT_IMPORT_CONFLICT_MAX) stats.conflicten.push(x); });
    Object.keys(r.kolommen).forEach(function (k) { if (!stats.kolommen[k]) stats.kolommen[k] = r.kolommen[k]; });
  }
  if (stats.fouten.length && !stats.bestanden) throw new Error(stats.fouten.map(function (x) { return x.bestand + ': ' + x.melding; }).join(' '));
  var nieuwPer = {}; nieuw.forEach(function (n) { nieuwPer[n.id] = n; });
  var echt = []; wijz.forEach(function (w) { var n = nieuwPer[w.id]; if (n) Object.keys(w).forEach(function (k) { if (k !== 'id') n[k] = w[k]; }); else echt.push(w); });  // aanvulling op een profiel uit dezelfde run: in dat profiel zelf
  // v7.7 (R3): per aangevuld profiel één tijdlijnregel met alleen de veldnamen, geen waarden
  var aanvulPer = {}, aanvulIds = [];
  echt.forEach(function (w) { var a = aanvulPer[w.id]; if (!a) { a = aanvulPer[w.id] = {}; aanvulIds.push(w.id); } Object.keys(w).forEach(function (k) { if (k !== 'id') a[k] = 1; }); });
  if (nieuw.length || echt.length) metLock(function () {
    schrijfVeel('Talenten', nieuw.concat(echt));
    if (aanvulIds.length) schrijfVeel('Activiteiten', aanvulIds.map(function (id) { return { type: 'notitie', datum: nu(), door: ikNaam(), talentId: id, bron: 'xps', aangemaakt: nu(), onderwerp: 'Aangevuld uit de XPS-accountexport: ' + Object.keys(aanvulPer[id]).join(', ') }; }));
    if (nieuw.length) schrijfVeel('Activiteiten', nieuw.map(function (n) { return { type: 'notitie', datum: nu(), door: ikNaam(), talentId: n.id, bron: 'xps', aangemaakt: nu(), onderwerp: 'Profiel aangemaakt uit de XPS-accountexport (xps-bestand)' }; }));
    nieuw.forEach(function (n) { koppelKandidaten(n); });  // kandidaten met hetzelfde e-mailadres of accountnummer krijgen het talentId
  });
  stats.nieuw = nieuw.length; stats.bijgewerkt = uniek(echt.map(function (w) { return String(w.id); })).length; stats.nietHerkendeFuncties = nietHerkendLijst(nietF);
  if (!stats.fouten.length) P.setProperty('LAATSTE_TALENTIMPORT', nu());
  return stats;
}
function apiTalentImport() { if (niveau('talenten', 'wijzigen') !== 'alles') throw new Error('Daar heb je geen toegang toe.'); return talentImport(); }

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
  var vergeten = uniek(lijstUit(veldenUit(t.velden).vergeten || []).concat(onderdrukHashes(t.email, t.xpsId, t.telefoon)));  // v7.7 (B2): niet-omkeerbare onderdrukkingslijst, zodat een volgende XPS-import dit profiel niet opnieuw aanmaakt
  var docs = lees('TalentDocumenten').filter(function (d) { return String(d.talentId) === String(t.id); });
  docs.forEach(function (d) { if (d.driveId) { try { DriveApp.getFileById(d.driveId).setTrashed(true); } catch (e) {} } });
  if (docs.length) verwijderRijen('TalentDocumenten', function (d) { return String(d.talentId) === String(t.id); });
  try { var map = talentSubmapAls(t.id); if (map) map.setTrashed(true); } catch (e2) {}
  schrijf('Talenten', { id: t.id, voornaam: 'Verwijderd', achternaam: 'profiel', email: '', telefoon: '', postcode: '', woonplaats: '', lat: '', lon: '', opleiding: '', bevoegdheid: '', notitie: '', tags: '', velden: vergeten.length ? { vergeten: vergeten } : '', xpsId: '', afasNummer: '',
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
// v7.4.1: robuuste herkenning van kolommen en antwoorden (backend/README.md, "Aanmelden via een Google Form"). Een kop is een kern met een toelichting
// tussen haakjes ('Postcode (bijv. 1234 AB)'); nummering vooraan ('06. ') telt niet, en na een ontkenning ('niet je schoolmail', 'zonder tussenvoegsel')
// tellen de woorden niet meer mee. Elke kop krijgt per veld een score: de hele kern = 100, een woord uit 'sterk' 40-85 en uit 'zwak' 5-30 (minder naarmate
// de kern meer andere woorden heeft: een vraag- of stopwoord kost 1, een ander woord 6), en 0 met een woord uit 'niet' (ook in de toelichting en als
// achterdeel: 'stagebegeleider'). Elke kolom hoort bij hoogstens één veld; een veld mag meer kolommen hebben (het verzamelde 'E-mailadres' naast een eigen
// e-mailvraag): per rij telt dan de eerste geldige waarde. Rasterkolommen ('Beschikbaarheid [Maandag]') horen allemaal bij de beschikbaarheid.
// Privékolommen (AANMELD_PRIVE) worden nooit gelezen.

function aanmeldingenRun() {
  var r = metLock(aanmeldingenVerwerken), n = 0;
  r.mails.forEach(function (m) { try { bevestigingsMail(m.t, m.token); n++; } catch (e) { Logger.log('Bevestiging ' + talentNaam(m.t) + ': ' + e); } });
  var tekst = r.nieuw + ' nieuw, ' + r.bestaand + ' bestaand, ' + n + ' mails';
  if (r.overgeslagen.geenToestemming) tekst += ', ' + r.overgeslagen.geenToestemming + ' zonder toestemming';  // v7.4.1: alleen als het er zijn
  if (r.overgeslagen.bewaartermijn) tekst += ', ' + r.overgeslagen.bewaartermijn + ' met verstreken bewaartermijn';
  if (r.overgeslagen.onduidelijk) tekst += ', ' + r.overgeslagen.onduidelijk + ' wachten op een duidelijke toestemming';  // v7.4.1 ronde 5
  if (r.overgeslagen.geenContact) tekst += ', ' + r.overgeslagen.geenContact + ' zonder geldig e-mailadres of telefoonnummer';
  var ander = r.overgeslagenTabbladen || [];  // v7.4.1 ronde 6: stil overgeslagen tabbladen met naam, zodat de beheerder ze ziet
  if (ander.length) tekst += ', ' + (ander.length === 1 ? '1 tabblad' : ander.length + ' tabbladen') + ' overgeslagen als ander formulier (' + ander.map(function (x) { return '"' + x + '"'; }).join(', ') + ')';
  return tekst + (r.fouten.length ? '; ' + r.fouten.join('; ') : '');
}

// v7.4.1: kolommen die nooit gelezen worden (AVG, zoals XPS_PRIVE in v7.4): geboortedatum, BSN/sofinummer, IBAN/rekeningnummer, ID/paspoort, nationaliteit,
// salaris/loon/tarief/beloning, gezondheid/ziekte/medisch/huisarts. Getoetst op de kern van de kop; een privéwoord in de toelichting telt alleen als de kern
// geen naam-, contact- of adresveld is ('Volledige naam (zoals op je ID)' is een naam). AANMELD_PRIVE_WOORD alleen als los woord ('id', niet 'beschikbaarheid').
var AANMELD_PRIVE = /geboorte|birth|geb datum|gebdatum|bsn|burgerservice|citizen|iban|rekeningn|bankrekening|bank account|bankgegevens|paspoort|passport|identiteit|identity|legitimatie|nationaliteit|nationality|salaris|salary|loon|wage|tarief|vergoeding|beloning|gezondheid|health|medisch|medical|medic|huisarts|beperking|handicap|allergie|religie|geloof/;
var AANMELD_PRIVE_WOORD = /(^| )(id|rate|bruto|netto|sofi|sofinummer|sofinr)( |$)/;  // v7.4.1 ronde 4: 'sofi' alleen als woord ('Sofi-nummer'), niet in 'filosofie'
// v7.4.1 ronde 4: 'ziek' alleen als het over de aanmelder gaat, niet over invallen of vervangen bij ziekte van een docent ('Wanneer ben je beschikbaar? (ook voor
// invallen bij ziekte)', 'ziektevervanging', 'Beschikbaarheid bij ziekte of verlof van docenten'); 'ziekteverlof' alleen blijft privé
// v7.4.1 ronde 5: een docent of collega telt alleen als de vraag niet over de aanmelder zelf gaat ('Heb je je wel eens ziek gemeld bij een docent?' blijft privé)
function ziekOverZelf(t) {
  t = String(t || '').replace(/invalid[a-z]*/g, ' ');
  if (!/ziek|sick|illness/.test(t) || /inval|vervang/.test(t)) return false;
  return !(/docent|leerkracht|leraar|leraren|collega|teacher/.test(t) && !/(^| )(je|jij|jou|jouw|ik|mijn|me|heb|hebt|ben|bent|you|your|i|my)( |$)/.test(t));
}
function priveWoord(t) { t = String(t || ''); return AANMELD_PRIVE.test(t) || AANMELD_PRIVE_WOORD.test(t) || ziekOverZelf(t); }
// v7.4.1 ronde 5 (AVG): in een antwoord (vrije tekst) is 'ziek' altijd privé, ook naast 'invallen' of 'docent' ('Invallen kan pas als ik niet meer ziek ben',
// 'ik ben docent maar zit nu in de ziektewet'); de uitzondering van ziekOverZelf geldt alleen voor koppen
function priveAntwoord(t) { t = String(t || ''); return AANMELD_PRIVE.test(t) || AANMELD_PRIVE_WOORD.test(t) || /ziek|sick|illness/.test(t); }
// v7.4.1 ronde 4 (AVG): bijzondere persoonsgegevens in vrije tekst (art. 9-10 AVG): gezondheid, religie, strafrecht, seksuele geaardheid, afkomst, politiek en
// vakbond. Getoetst op de woorden ('burn-out' = 'burn out'): BEGIN = een woord begint met de stam ('zwangerschapsverlof'), HEEL = alleen als heel woord
// ('add', niet 'address'), DEEL = ook midden in een woord ('kleurenblind', 'fysiotherapie', 'functiebeperking'). 'ziek' via ziekOverZelf (priveWoord).
var AANMELD_BIJZONDER_BEGIN = new RegExp('(^| )(burn ?out|overspann|zwanger|adhd|autis|dyslex|dyslect|depress|angst|chronisch|slechthorend|slechtziend|doof|doven|psycholo|psychiat|' +
  'psychisch|psychose|medicijn|medicatie|diabet|epilep|kanker|astma|migraine|invalid|pregnan|disab|anxiety|religi|geloof|gelovig|moslim|islam|christen|christelijk|katholiek|' +
  'protestant|hindoe|boeddh|jood|joods|moskee|kerk|gebed|ramadan|halal|kosher|koosjer|muslim|christian|jewish|strafbla|veroordeel|justitie|politie|gevangen|detentie|' +
  'reclassering|criminal|convict|police|seksu|geaard|homo|lesbi|bisek|transgender|lhbt|lgbt|etnic|etnisch|afkomst|huidskleur|politiek|vakbond|vakbew)');
var AANMELD_BIJZONDER_HEEL = /(^| )(add|ras|gay|hiv|aids|wia|wao|uwv|cvs|me cvs|pds|ocd|ptss|ptsd|ivf|in (blijde |gezegende )?verwachting|vasten|sabbat|sjabbat|shabbat|eid)( |$)/;  // v7.4.1 ronde 6: ivf, 'in blijde verwachting'
// v7.4.1 ronde 5: stammen van vijf letters of meer ook midden in een woord (Nederlandse samenstellingen: hoogzwanger, borstkanker, faalangst, winterdepressie,
// vrijdaggebed, ziektewet), en meer woorden over gezondheid, uitkering en geloof (covid, hernia, reuma, klachten, pijn, operatie, herstel, Wajong, WIA, UWV,
// arbeidsongeschikt, belastbaar, 'in verwachting', geboren, sabbat, vasten, suikerfeest)
var AANMELD_BIJZONDER_DEEL = new RegExp('beperking|handicap|therap|rolstoel|hoofddoek|blind|zwanger|kanker|depress|angst|gebed|burnout|burn out|overspann|psychi|psychose|' +
  'medicijn|medicatie|diabet|epilep|migraine|astma|autis|dyslex|dyslect|chronisch|covid|corona|hernia|reuma|klacht|pijn|operatie|herstel|revalid|ziekenhuis|wajong|' +
  'arbeidsongeschikt|belastbaar|uitkering|geboren|zwangerschap|bevall|moederschap|suikerfeest|ramadan|islamit|katholiek|protestant|gelovig|religi|moskee|synagog|kerkdienst|' +
  'dyscalc|kraam');  // v7.4.1 ronde 6: bevall (bevallen, bevalling), dyscalculie, kraam (kraamtijd, kraamverlof)
// v7.4.1 ronde 6: korte afkortingen alleen als heel woord: ivf in HEEL, en MS (multiple sclerose) en ME (zoals 'me cvs') alleen in hoofdletters in de tekst zelf
// ('ms' en 'me' in kleine letters zijn ook gewone woorden); ruw = de tekst voordat aanmeldWoorden er kleine letters van maakt
function bijzonderWoord(w, ruw) {
  return AANMELD_BIJZONDER_BEGIN.test(w) || AANMELD_BIJZONDER_HEEL.test(w) || AANMELD_BIJZONDER_DEEL.test(w) || /(^|[^A-Za-z0-9])(MS|ME)([^A-Za-z0-9]|$)/.test(String(ruw || ''));
}
// v7.4.1 ronde 4 (AVG): één filter voor elke vrije tekst die Athena uit een antwoord bewaart ('Niet herkend', een ander toestemmingsantwoord, de toestemmingstekst):
// per onderdeel hoogstens 60 tekens, en met een privéwoord (AANMELD_PRIVE) of een bijzonder persoonsgegeven nooit de tekst zelf
var AANMELD_NIET_OVERGENOMEN = '(eigen antwoord, niet overgenomen)';
function vrijeTekst(s) {
  var t = tekstIn(typeof s === 'string' ? s : String(s == null ? '' : s)).replace(/\s+/g, ' '), w = aanmeldWoorden(t);
  if (!w) return '';
  if (priveAntwoord(w) || bijzonderWoord(w, t)) return AANMELD_NIET_OVERGENOMEN;  // v7.4.1 ronde 5: priveAntwoord (ook 'ziek' naast 'invallen'); ronde 6: MS of ME in hoofdletters
  return t.length > 60 ? t.slice(0, 59) + '…' : t;
}
var AANMELD_PERSOON = ['voornaam', 'tussenvoegsel', 'achternaam', 'naam', 'email', 'telefoon', 'contact', 'postcode', 'woonplaats'];
// v7.4.1: woorden in een kop die op een ander slaan dan de aanmelder (een school, referent, begeleider, ouder of noodcontact) of op iets anders dan het profiel.
// v7.4.1 ronde 5: ook docent, leraar, leider (teamleider), coach, manager, referee, collega, stage en scholen
var AANMELD_ANDER = ['school', 'scholen', 'opleiding', 'universiteit', 'pabo', 'instelling', 'referent', 'referentie', 'contactpersoon', 'nood', 'ouder', 'moeder', 'vader', 'voogd',
  'verzorger', 'partner', 'mentor', 'begeleider', 'leidinggevende', 'werkgever', 'bedrijf', 'organisatie', 'huisarts', 'arts', 'gebruikersnaam', 'emergency', 'reference',
  'parent', 'guardian', 'supervisor', 'company', 'employer', 'nieuwsbrief', 'newsletter', 'docent', 'leraar', 'leerkracht', 'teacher', 'leider', 'coach', 'manager',
  'referee', 'collega', 'colleague', 'baas', 'boss', 'stage'];
// v7.4.1 ronde 5: e-mail, telefoon, contact en naam van een ander persoon. Een kop over de aanmelder mag elk woord hebben ('Laat je e-mailadres achter', 'Hoe luidt
// je e-mailadres?', 'Please provide your phone number', 'E-mailadres student'); alleen een woord over een ander persoon (AANMELD_ROL, ook als achterdeel:
// 'stagedocent', 'teamleider', 'noodcontact') sluit hem uit, in de vraag zelf (via AANMELD_ANDER) en ook in de toelichting ('E-mailadres (stagedocent)',
// 'Telefoonnummer (in geval van nood)', 'Email (referee)', 'Telefoonnummer (ouder/verzorger, als je jonger bent dan 18)'). Een school of opleiding in de toelichting
// sluit niet uit ('Telefoonnummer (zodat de school je kan bellen)', 'Naam (zoals bekend bij je opleiding)'), en een vraag over toestemming of delen is geen
// contactkolom ('Toestemming om je e-mailadres te delen met scholen'). Dit vervangt de witte lijst van ronde 4 (AANMELD_ZELF), die eigen vragen met een ander
// werkwoord stil liet vallen.
var AANMELD_ROL = ['docent', 'leraar', 'leerkracht', 'teacher', 'leider', 'begeleider', 'coach', 'manager', 'referee', 'referent', 'referentie', 'reference', 'mentor',
  'ouder', 'verzorger', 'voogd', 'moeder', 'vader', 'partner', 'nood', 'emergency', 'contactpersoon', 'werkgever', 'leidinggevende', 'supervisor', 'employer', 'huisarts',
  'arts', 'parent', 'guardian', 'collega', 'colleague', 'baas', 'boss'];
var AANMELD_ZELF_NIET = ['toestemming', 'consent', 'delen', 'gedeeld', 'share', 'doorgeven', 'doorsturen'];
function anderPersoon(k) {
  return AANMELD_ROL.some(function (t) { return heeftNiet(k.toel, t); }) || AANMELD_ZELF_NIET.some(function (t) { return heeftTerm(k.kern, t); });
}
// v7.4.1 ronde 5: tekens van een ander formulier (offerte, contact, informatieavond, training, evaluatie van een school) per kolom: gewicht 2 = een woord dat
// in een aanmeldformulier niet voorkomt (namens, offerte, training, tevreden, 'jullie school'); zo'n kolom is ook nooit werkzaamheden, sector of
// beschikbaarheid ('Op welke dag wil je de training volgen?'). Gewicht 1 = collega of deelnemer (ronde 6, AANMELD_ANDER_ZWAK), de school of organisatie als
// onderwerp van de vraag ('School', 'Naam van je school', 'Organisatie'; niet 'Via welke organisatie ken je ons?' of 'Bij welke onderwijsinstelling studeer je?'), een vraag of bericht aan het bedrijf ('Je
// vraag', 'Waar kunnen we je mee helpen?'), een vraag die Athena niet kent in de u-vorm ('Waar heeft u interesse in?') en 'Op welke school werk je?' (een
// leraar die werk zoekt kan dat ook vragen; samen met een training telt het formulier als ander). Zie aanmeldTabblad.
var AANMELD_ANDER_STERK = ['namens', 'on behalf', 'offerte', 'quotation', 'informatieavond', 'informatiebijeenkomst', 'evaluatie', 'evaluation', 'tevreden', 'satisfied',
  'satisfaction', 'training', 'workshop', 'hoeveel personen', 'vertegenwoordig je', 'vertegenwoordig jij',
  'vertegenwoordigt u', 'vertegenwoordig u', 'vertegenwoordigt je', 'aantal leerlingen', 'jullie school',
  'binnen de school', 'binnen je school', 'binnen jullie school', 'op onze school'];
// v7.4.1 ronde 6: collega en deelnemer wegen 1 (van 2 in ronde 5): een talent kan ook vragen 'Via welke collega ken je ons?' of 'Ben je deelnemer van ons
// traineeship?'; naast een talentvraag blijft het een aanmelding, zonder is het twijfel (fout en melding), nooit meer stil
var AANMELD_ANDER_ZWAK = ['collega', 'colleague', 'deelnemer', 'participant'];
var AANMELD_SCHOOL_KAAL = ['school', 'scholen', 'schoolnaam', 'naam', 'organisatie', 'organisation', 'organization', 'bedrijf', 'bedrijfsnaam', 'company', 'instelling',
  'onderwijsinstelling', 'locatie', 'vestiging', 'of', 'en', 'or', 'and'];
var AANMELD_CONTACTVRAAG = /^((je|jouw|uw|your) )?(vraag|vragen|bericht|question|message)( (of|en|or|and) (vraag|vragen|bericht|opmerking|opmerkingen|message|question))?$|(^| )(we|wij) (je |u )?(mee )?(helpen|help)( |$)|^(how|what) can we help/;
function anderGewicht(k) {
  var kaal = k.kern.filter(function (w) { return AANMELD_STOP.indexOf(w) < 0; });
  if (AANMELD_ANDER_STERK.some(function (t) { return heeftTerm(k.kern, t); })) return 2;
  if (AANMELD_ANDER_ZWAK.some(function (t) { return heeftTerm(k.kern, t); })) return 1;  // v7.4.1 ronde 6
  var school = kaal.some(function (w) { return w === 'school' || w === 'scholen'; });
  if (school && kaal.some(function (w) { return /^(werk|werkt|werkzaam)$/.test(w); }) && !AANMELD_WENS.some(function (t) { return heeftTerm(k.kern, t); })) return 1;
  if (kaal.length && kaal.every(function (w) { return AANMELD_SCHOOL_KAAL.indexOf(w) >= 0; }) && kaal.some(function (w) { return !/^(naam|of|en|or|and)$/.test(w); })) return 1;
  return AANMELD_CONTACTVRAAG.test(k.woorden) ? 1 : 0;
}
// De u-vorm in een vraag die Athena niet kent ('Waar heeft u interesse in?'); telt in een tabblad hoogstens één keer (een formulier helemaal in de u-vorm is
// daarmee nog geen ander formulier)
function anderUvorm(k, heeftVeld) { return !heeftVeld && k.kern.some(function (w) { return w === 'u' || w === 'uw'; }); }
// v7.4.1: vraag- en stopwoorden (kosten 1 punt in de score) en ontkenningen (de woorden erna tellen niet: 'Persoonlijk e-mailadres (niet je schoolmail)')
var AANMELD_STOP = ['wat', 'is', 'je', 'jouw', 'jij', 'jou', 'uw', 'u', 'mijn', 'ik', 'de', 'het', 'een', 'van', 'voor', 'op', 'in', 'aan', 'met', 'bij', 'naar', 'om', 'te', 'en', 'of',
  'welk', 'welke', 'waar', 'wanneer', 'hoe', 'wie', 'kunnen', 'kun', 'kan', 'kunt', 'we', 'wij', 'ons', 'ben', 'bent', 'heb', 'hebt', 'wil', 'wilt', 'graag', 'bijv', 'bijvoorbeeld',
  'optioneel', 'verplicht', 'eigen', 'persoonlijk', 'persoonlijke', 'dus', 'zoals', 'vul', 'hier', 'geef', 'ga', 'werken', 'doen', 'bereiken', 'bereikbaar', 'mag', 'mogen', 'nog',
  'ook', 'zijn', 'die', 'dat', 'your', 'what', 'the', 'a', 'an', 'to', 'do', 'you', 'can', 'please', 'enter', 'are', 'which', 'for', 'and', 'or', 'my', 'i'];
var AANMELD_NEE = ['niet', 'geen', 'zonder', 'excl', 'exclusief', 'behalve', 'not', 'no', 'without', 'except'];
var AANMELD_ONTKEND = ['niet', 'geen', 'not', 'no', 'never', 'nooit'];  // v7.4.1: in de kern van functies of sector = de omgekeerde vraag ('… wil je liever niet doen?')
// v7.4.1: meer kolommen voor functies of sector: noemt er één een wens, dan tellen alleen die ('Welke functie zoek je?' naast 'Welke functie heb je?')
var AANMELD_WENS = ['wil', 'wilt', 'zoek', 'zoekt', 'gewenst', 'gewenste', 'voorkeur', 'interesse', 'liefst', 'graag', 'desired', 'preferred', 'want', 'would like',
  'looking for', 'interested'];
// v7.4.1: per veld de woorden in de kop (lezen met uitMap). exact = alleen als de hele kern; sterk/zwak = woord(en) op woordgrens, het laatste woord mag
// vanaf vier letters het begin zijn van een langer woord ('telefoon' past op 'telefoonnummer', 'naam' niet op 'voornaam'); niet = een kop met zo'n woord is
// nooit dit veld (vanaf vijf letters ook als achterdeel: 'werkervaring', 'hogeschool'; in de toelichting alleen als die zegt van wie het veld is, zie
// aanmeldNiet); zwakNiet = alleen 'niet' zolang de kern geen woord uit 'tenzij' heeft (uren zonder dagen, het huidige werk zonder een wens); ontkend = een ontkenning in de kern maakt het de omgekeerde vraag;
// enkel = één kolom; contact = één vraag voor e-mail of telefoon ('Hoe kunnen we je bereiken?'), per rij gelezen als beide. v7.4.1 ronde 4: zelf = alleen
// een kop over de aanmelder zelf (ronde 5: anderPersoon); achterdeel = een sterk woord van vijf letters of meer telt ook als achterdeel ('Voorkeursdagen').
var AANMELD_VELDEN = {
  tijdstempel: { exact: ['datum', 'date', 'ingevuld op', 'aangemeld op'], sterk: ['tijdstempel', 'timestamp'], enkel: true },
  email: { sterk: ['email', 'emailadres', 'mail', 'mailadres', 'email adres', 'email address'], niet: AANMELD_ANDER, zelf: true },
  telefoon: { sterk: ['telefoon', 'telefoonnummer', 'contactnummer', 'welk nummer', 'mobiel', 'mobiele', 'mobile', 'phone', 'gsm', 'tel', 'telnr', '06', 'whatsapp'], zwak: ['nummer', 'number'],
    niet: AANMELD_ANDER.concat(['huis', 'postcode', 'student', 'klant', 'lid', 'lidmaatschap', 'registratie', 'kvk', 'btw', 'big', 'vog', 'kenteken', 'personeel', 'rekening']), zelf: true },
  contact: { exact: ['contact', 'contactgegevens', 'contactinformatie', 'contact details'], sterk: ['hoe kunnen we je bereiken', 'hoe ben je bereikbaar', 'bereikbaar',
    'how can we reach you', 'how can we contact you', 'email of telefoon', 'email of telefoonnummer', 'telefoon of email', 'telefoonnummer of email', 'email en telefoonnummer',
    'telefoonnummer en email', 'email or phone', 'phone or email'], niet: AANMELD_ANDER.concat(['voorkeur', 'moment', 'momenten', 'wanneer', 'tijd', 'dag', 'dagen']), zelf: true },  // v7.4.1
  voornaam: { sterk: ['voornaam', 'voornamen', 'roepnaam', 'first name', 'firstname', 'given name'], niet: AANMELD_ANDER, zelf: true },
  tussenvoegsel: { sterk: ['tussenvoegsel', 'tussenv', 'voorvoegsel'], niet: AANMELD_ANDER, zelf: true },
  achternaam: { sterk: ['achternaam', 'last name', 'lastname', 'surname', 'familienaam', 'family name'], niet: AANMELD_ANDER, zelf: true },
  naam: { sterk: ['naam', 'volledige naam', 'voor en achternaam', 'voor achternaam', 'voornaam en achternaam', 'voornaam achternaam', 'hoe heet je', 'heet je', 'name', 'full name',
    'your name', 'first and last name', 'name and surname', 'name surname', 'achternaam voornaam', 'achternaam en voornaam', 'surname first name', 'last name first name'],
    niet: AANMELD_ANDER, zelf: true },  // v7.4.1: 'Achternaam, voornaam' is één naamkolom ('Jansen, Piet', zie aanmeldNaam)
  postcode: { sterk: ['postcode', 'post code', 'postal code', 'zip', 'zipcode'], zwak: ['adres', 'woonadres', 'address'],
    niet: AANMELD_ANDER.concat(['werk', 'stage', 'email', 'emailadres', 'mail', 'mailadres']) },  // v7.4.1 ronde 5: 'Please fill in your email address' is geen postcode
  woonplaats: { sterk: ['woonplaats', 'plaats', 'city', 'stad', 'town', 'gemeente', 'waar woon je', 'woon je', 'where do you live'], zwak: ['woon', 'wonen'],
    niet: AANMELD_ANDER.concat(['werk', 'stage', 'studeer', 'studie', 'study', 'regio', 'voorkeur', 'postcode', 'geboorte', 'adres', 'woonadres', 'straat', 'huisnummer',
      'address', 'street']) },  // v7.4.1 ronde 4: 'Je woonadres (straat + huisnummer)' is geen woonplaats
  // v7.4.1: wat iemand al doet of deed ('… heb je al eens gedaan?', 'Previous job', 'In welk type onderwijs werk je op dit moment?') is geen wens, tenzij de
  // vraag ook een wens noemt ('… werk je het liefst?'); de omgekeerde vraag ('Welke werkzaamheden wil je liever niet doen?') ook niet (ontkend)
  functies: { exact: ['wat wil je doen', 'wat zou je willen doen', 'wat wil je graag doen', 'what would you like to do'],  // v7.4.1 ronde 4
    sterk: ['functie', 'werkzaamheden', 'rol', 'rollen', 'role', 'position', 'job', 'soort werk', 'type werk', 'welk werk'], ontkend: true,  // v7.4.1 ronde 5: 'interesse' alleen met werk
    niet: ['beschikbaar', 'wanneer', 'dag', 'dagen', 'uur', 'uren', 'vak', 'vakken', 'ervaring', 'huidige', 'huidig', 'current', 'momenteel', 'nu', 'vorige', 'eerder', 'werkgever'],
    zwakNiet: ['gedaan', 'al eens', 'ooit', 'vroeger', 'gewerkt', 'previous', 'werk je'], tenzij: AANMELD_WENS },
  sector: { sterk: ['sector', 'onderwijssector', 'type onderwijs', 'soort onderwijs', 'welk onderwijs', 'onderwijstype', 'onderwijsvorm', 'schooltype', 'type school', 'soort school'],
    zwak: ['onderwijs', 'onderwijsniveau', 'education'], ontkend: true,  // het eigen niveau ('hoogst genoten onderwijsniveau', 'highest level of education') is geen sector
    niet: ['functie', 'werkzaamheden', 'beschikbaar', 'ervaring', 'opleiding', 'diploma', 'hoogst', 'hoogste', 'genoten', 'gevolgd', 'afgerond', 'highest', 'level', 'degree', 'beschrijf', 'studie', 'studeer'],
    zwakNiet: ['werk je', 'gewerkt', 'gedaan', 'huidige', 'huidig', 'current', 'momenteel', 'vorige', 'eerder', 'previous', 'vroeger'], tenzij: AANMELD_WENS },
  beschikbaarheid: { sterk: ['beschikbaar', 'availability', 'available', 'dagen', 'dagdelen', 'welke dag', 'wanneer kun je', 'wanneer kan je', 'wanneer wil je', 'rooster', 'when can you',
    'momenten', 'welke momenten', 'wanneer heb je tijd', 'voorkeursdag', 'voorkeursdagen'], achterdeel: true,  // v7.4.1 ronde 4: ook als achterdeel ('voorkeursdagen', 'werkdagen')
    // niet: een andere vraag over tijd, of de omgekeerde vraag ('Op welke dagen ben je niet beschikbaar?', 'Op welke dagen heb je college?', '… werk je al?'), ook als raster
    niet: ['vanaf', 'start', 'starten', 'begin', 'beginnen', 'datum', 'ben je niet', 'kun je niet', 'kan je niet', 'kan ik niet', 'heb je geen',
      'dagen niet', 'dag niet', 'wanneer niet', 'niet beschikbaar', 'not available', 'unavailable', 'onbeschikbaar', 'bezet', 'heb je college', 'heb je les', 'heb je lessen',
      'heb je stage', 'loop je stage', 'heb je school', 'rooster van school', 'werk je al', 'werk je nu', 'bijbaan'],
    // v7.4.1: uren zijn een andere vraag, tenzij de kern ook naar dagen vraagt ('Hoeveel uur per week en op welke dagen ben je beschikbaar?')
    zwakNiet: ['uur', 'uren', 'hoe laat', 'hoeveel'], tenzij: ['dagen', 'welke dag', 'dagdelen', 'momenten'] },
  toestemming: { sterk: ['toestemming', 'privacy', 'consent', 'avg', 'gdpr', 'gegevens bewaren', 'gegevens opslaan', 'persoonsgegevens', 'gegevensverwerking',
    'verwerking van je gegevens', 'verwerking van gegevens'], zwak: ['akkoord', 'agree', 'voorwaarden'],  // 'akkoord' alleen als er geen echte toestemmingsvraag is
    niet: ['nieuwsbrief', 'newsletter', 'foto', 'fotos', 'beeld', 'marketing', 'mailing', 'reclame', 'contract', 'toestemming ouder', 'van je ouder', 'ouder verzorger', 'parent',
      'parental', 'guardian', 'voogd', 'minderjarig', 'jonger dan'] },  // toestemming van een ouder geldt alleen voor jongeren ('n.v.t.' voor de rest)
  verwerkt: { exact: ['verwerkt'], enkel: true },
  talentId: { exact: ['talentid'], enkel: true }
};
// v7.4.1: synoniemen per standaardsector en -functie (lezen met uitMap). Eigen keuzelijstwaarden uit Instellingen tellen op hun eigen hele woorden.
var SECTOR_WOORDEN = {
  po: ['po', 'basisonderwijs', 'basisschool', 'basisscholen', 'primair', 'primary'],
  vo: ['vo', 'voortgezet', 'vmbo', 'mavo', 'havo', 'vwo', 'atheneum', 'gymnasium', 'lyceum', 'middelbare', 'secondary'],
  mbo: ['mbo', 'beroepsonderwijs', 'roc', 'vocational'],
  so: ['so', 'vso', 'sbo', 'speciaal', 'speciale', 'special', 'praktijkonderwijs', 'praktijkschool', 'pro', 'cluster'],  // praktijkonderwijs = so, zoals sectorVanSchool (matching)
  isk: ['isk', 'schakelklas', 'internationale schakelklas', 'nieuwkomer', 'anderstalig']
};
// Naast so vallen deze algemene woorden weg ('Speciaal basisonderwijs' en 'Voortgezet speciaal onderwijs' zijn alleen so, zoals sectorVanSchool)
var SECTOR_ALGEMEEN = { po: ['basisonderwijs', 'basisschool', 'basisscholen', 'primair', 'primary'], vo: ['voortgezet', 'secondary'] };
var FUNCTIE_WOORDEN = {
  onderwijsondersteuner: ['onderwijsondersteun', 'ondersteuner', 'ondersteuning', 'onderwijsassist', 'klassenassist', 'assistent', 'teaching assistant'],
  studentdocent: ['studentdocent', 'student docent', 'studentleraar', 'lio', 'leraar in opleiding', 'docent in opleiding', 'student teacher'],
  huiswerkbegeleider: ['huiswerk', 'homework'],
  examentrainer: ['examentrain', 'examenvoorbereid', 'examenbegeleid', 'examen training', 'exam training'],  // niet 'examen' los: 'Examens surveilleren' is surveillant
  'nt2-ondersteuner': ['nt2', 'nt 2', 'taalcoach', 'taalondersteun', 'tweede taal', 'anderstalig'],
  rekenondersteuner: ['rekenen', 'rekenondersteun', 'rekencoach', 'rekenles', 'rekenbegeleid'],  // niet 'reken' los: 'rekening'
  surveillant: ['surveil', 'toezicht', 'invigilat']
};
var FUNCTIE_ALGEMEEN = 'onderwijsondersteuner';  // valt weg als hetzelfde antwoorddeel een specifiekere functie noemt ('NT2-onderwijsondersteuning' → alleen nt2-ondersteuner)
var FUNCTIE_KAAL = ['functie', 'job', 'position', 'beroep', 'functietitel', 'job title', 'rol', 'role'];  // 'Functie' zonder meer kan ook de huidige baan zijn (zie aanmeldTabblad); v7.4.1 ronde 5: ook 'Wat is je rol?'

/* Koppen */
// v7.4.1: een kop of antwoord als woorden: kleine letters, zonder accenten, 'e-mail' → 'email', haakjes, '*', '?' en ':' weg ('functie(s)' → 'functies'), andere leestekens als spatie
function aanmeldWoorden(s) {
  return zonderAccenten(String(s == null ? '' : s)).toLowerCase().replace(/e-mail/g, 'email').replace(/[()\[\]{}*?:]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function woordenVan(s) { var w = aanmeldWoorden(s); return w ? w.split(' ') : []; }
// Waar de term (een of meer woorden) begint, of -1. Op woordgrens; het laatste woord van de term mag vanaf vier letters het begin van een langer woord zijn.
function termPlek(woorden, term) {
  var t = term.split(' '), n = t.length;
  for (var i = 0; i + n <= woorden.length; i++) {
    var ok = true;
    for (var j = 0; j < n && ok; j++) ok = woorden[i + j] === t[j] || (j === n - 1 && t[j].length >= 4 && woorden[i + j].indexOf(t[j]) === 0);
    if (ok) return i;
  }
  return -1;
}
function heeftTerm(woorden, term) { return termPlek(woorden, term) >= 0; }
// v7.4.1 ronde 4: zoals termPlek, maar voor de score van een kop: tussen de woorden van de term mogen hoogstens twee vraag- of stopwoorden staan ('Which type of
// school …' = 'type school', 'soort van werk' = 'soort werk'). Geeft de plekken van de woorden van de term, of null.
function kopPlek(woorden, term) {
  var t = term.split(' '), n = t.length, past = function (w, j) { return w === t[j] || (j === n - 1 && t[j].length >= 4 && w.indexOf(t[j]) === 0); };
  for (var i = 0; i + n <= woorden.length; i++) {
    if (!past(woorden[i], 0)) continue;
    var plek = [i], k = i + 1;
    for (var j = 1; j < n && plek; j++) {
      for (var tussen = 0; k < woorden.length && tussen < 2 && !past(woorden[k], j) && AANMELD_STOP.indexOf(woorden[k]) >= 0; tussen++) k++;
      if (k < woorden.length && past(woorden[k], j)) plek.push(k++); else plek = null;
    }
    if (plek) return plek;
  }
  return null;
}
// Voor 'niet'-woorden ook als achterdeel van een samenstelling (vanaf vijf letters): 'stagebegeleider', 'hogeschool', 'werkervaring', 'oproepcontract'
function heeftNiet(woorden, term) {
  return heeftTerm(woorden, term) || (term.indexOf(' ') < 0 && term.length >= 5 && woorden.some(function (w) { return w.length > term.length && w.slice(-term.length) === term; }));
}
// Woorden tot en met de eerste ontkenning ('niet je schoolmail' → 'niet')
function totOntkenning(woorden) { for (var i = 0; i < woorden.length; i++) if (AANMELD_NEE.indexOf(woorden[i]) >= 0) return woorden.slice(0, i + 1); return woorden; }
// v7.4.1: een kop in kern en toelichting: '1. ', '06. ' of '3) ' vooraan weg; tekst tussen haakjes na een spatie is toelichting, 'Functie(s)' blijft één woord
function aanmeldKopDelen(s) {
  var toel = [], kern = String(s == null ? '' : s).replace(/^\W*\d{1,3}\s*[.)]\s*/, '').replace(/(^|\s)\(([^)]*)\)/g, function (x, voor, binnen) { toel.push(binnen); return ' '; });
  return { kern: kern, toel: toel.join(' , ') };
}
// Een kolomkop: { kern, toel (woorden na de ontkenning weg), eigenaar (toelichtingen die zeggen van wie het veld is), woorden (kern als tekst), tekst en
// toelTekst (voluit, voor de privacytoets), raster }. 'Vraag [Rij]' (raster van Google Forms) wordt gesplitst; rij = dag(en) en/of dagdeel → rasterkolom van
// de beschikbaarheid, tenzij de vraag geen beschikbaarheid is
function aanmeldKop(h) {
  var s = String(h == null ? '' : h), m = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(s), d = aanmeldKopDelen(m ? m[1] : s), rij = m ? aanmeldWoorden(m[2]) : '';
  var k = { kern: totOntkenning(woordenVan(d.kern)), toel: [], eigenaar: [], tekst: (aanmeldWoorden(d.kern) + ' ' + rij).trim(), toelTekst: aanmeldWoorden(d.toel) };
  d.toel.split(' , ').forEach(function (t) { var w = totOntkenning(woordenVan(t)); k.toel = k.toel.concat(w); if (w.length && toelVanEigenaar(w)) k.eigenaar.push(w); });
  if (!k.kern.length) { k.kern = k.toel; k.toel = []; k.eigenaar = []; k.tekst = (k.toelTekst + ' ' + rij).trim(); k.toelTekst = ''; }
  // v7.4.1 ronde 4: 'Naam (voornaam)' en 'Naam (achternaam)': bij een kale naamvraag beslist de toelichting welk deel van de naam het is
  var toelW = woordenVan(d.toel).join(' ');
  if (/^(naam|name)$/.test(k.kern.filter(function (w) { return AANMELD_STOP.indexOf(w) < 0; }).join(' ')) &&
    ['voornaam', 'tussenvoegsel', 'achternaam'].some(function (v) { return uitMap(AANMELD_VELDEN, v).sterk.indexOf(toelW) >= 0; })) { k.kern = toelW.split(' '); k.toel = []; k.eigenaar = []; }
  k.raster = m ? rasterSleutel(k, m[2]) : null;  // v7.4.1: het rijlabel zoals het is ('Ma t/m vr', 'Ma-vr', '8.30 - 12.00 uur')
  if (m && !k.raster && rij) k.kern = k.kern.concat(rij.split(' '));  // geen raster: de rij hoort bij de vraag
  k.woorden = k.kern.join(' ');
  return k;
}
// v7.4.1: een toelichting zegt van wie het veld is als ze begint met 'van' ('(van je ouder)') of alleen uit zulke woorden bestaat ('(stagebegeleider)',
// '(ouder/verzorger)'); '(zoals bekend bij je opleiding)', '(ervaring is niet nodig)' of '(zodat de school je kan bellen)' niet
function toelVanEigenaar(w) {
  if (/^(van|of|from)$/.test(w[0])) return true;
  return w.filter(function (x) { return AANMELD_STOP.indexOf(x) < 0 && AANMELD_NEE.indexOf(x) < 0; }).every(function (x) { return AANMELD_ANDER.some(function (t) { return heeftNiet([x], t); }); });
}
// v7.4.1: is dit veld uitgesloten? Een 'niet'-woord in de kern of in een toelichting van een eigenaar; bij 'ontkend' een ontkenning in de kern; een woord
// uit zwakNiet alleen zonder een woord uit 'tenzij' in de kern
function aanmeldNiet(def, k) {
  var raak = function (woorden) { return (def.niet || []).some(function (t) { return heeftNiet(woorden, t); }); };
  if (raak(k.kern) || k.eigenaar.some(raak)) return true;
  if (def.ontkend && k.kern.some(function (w) { return AANMELD_ONTKEND.indexOf(w) >= 0; })) return true;
  return (def.zwakNiet || []).some(function (t) { return heeftTerm(k.kern, t); }) && !(def.tenzij || []).some(function (t) { return heeftTerm(k.kern, t); });
}
function aanmeldScore(def, k) {
  if (!k.kern.length || aanmeldNiet(def, k)) return 0;
  if (def.zelf && anderPersoon(k)) return 0;  // v7.4.1 ronde 5: een ander persoon in de vraag of de toelichting (stagedocent, referee, noodcontact, ouder)
  if ((def.exact || []).concat(def.sterk || []).indexOf(k.woorden) >= 0) return 100;
  var gedekt = {}, sterk = 0, zwak = false, straf = 0;
  var dek = function (t, achter) {
    var p = kopPlek(k.kern, t);
    if (!p && achter && t.indexOf(' ') < 0 && t.length >= 5) k.kern.some(function (w, i) { if (w.length > t.length && w.slice(-t.length) === t) { p = [i]; return true; } return false; });
    if (p) p.forEach(function (x) { gedekt[x] = true; });
    return !!p;
  };
  (def.sterk || []).forEach(function (t) { if (dek(t, def.achterdeel)) sterk = Math.max(sterk, t.split(' ').length); });
  (def.zwak || []).forEach(function (t) { if (dek(t)) zwak = true; });
  if (!sterk && !zwak) return 0;
  k.kern.forEach(function (w, i) { if (!gedekt[i]) straf += AANMELD_STOP.indexOf(w) >= 0 || AANMELD_NEE.indexOf(w) >= 0 || /^\d+$/.test(w) ? 1 : 6; });
  return sterk ? 70 + 5 * sterk - Math.min(30, straf) : 30 - Math.min(25, straf);
}
// v7.4.1 (AVG): privéwoord in de kern → nooit; in de toelichting alleen als de kern geen naam-, contact- of adresveld is
function aanmeldPrive(k, s) {
  return priveWoord(k.tekst) || (priveWoord(k.toelTekst) && !AANMELD_PERSOON.some(function (v) { return s[v] > 0; }));
}
// Welke kolommen bij welk veld horen: { veld: [kolomindex, … (beste eerst)], raster: [{ j, dagen, deel }], onbekend, functiesWens, toestemmingAnder, kop }.
// Eerst de hoogste scores; een tweede kolom voor een veld alleen met een sterke score (≥ 50; v7.4.1: voor toestemming elk sterk woord, ook in een lange vraag:
// liever een toestemmingsvraag te veel dan een 'Nee' die niet meetelt) en nooit voor een 'enkel'-veld.
function aanmeldKolommen(kop) {
  var c = { raster: [], onbekend: 0, ander: 0, functiesWens: false, sectorWens: false, eigenAdres: false, kop: kop.map(String) }, kand = [], bezet = {}, velden = Object.keys(AANMELD_VELDEN), koppen = [], uvorm = 0;
  velden.forEach(function (v) { c[v] = []; });
  kop.forEach(function (h, j) {
    var k = koppen[j] = aanmeldKop(h), s = {}, g, veld;
    if (!k.kern.length) return;
    velden.forEach(function (v) { s[v] = aanmeldScore(uitMap(AANMELD_VELDEN, v), k); });
    if (aanmeldPrive(k, s)) return;  // AVG: nooit lezen
    // v7.4.1 ronde 5: tekens van een ander formulier (c.ander, zie anderGewicht en aanmeldTabblad); een kolom met een woord als 'training' of 'offerte' is nooit
    // werkzaamheden, sector of beschikbaarheid
    if (AANMELD_ANDER_STERK.concat(AANMELD_ANDER_ZWAK).some(function (t) { return heeftTerm(k.kern, t); })) { k.raster = null; s.functies = s.sector = s.beschikbaarheid = 0; }
    veld = !!k.raster || velden.some(function (v) { return s[v] > 0; }); g = anderGewicht(k);
    c.ander += g; if (!g && anderUvorm(k, veld)) uvorm = 1;
    if (k.raster) { c.raster.push({ j: j, dagen: k.raster.dagen, deel: k.raster.deel }); return; }
    velden.forEach(function (v) { if (s[v] > 0) kand.push({ v: v, j: j, s: s[v] }); });
    if (!velden.some(function (v) { return s[v] > 0; })) c.onbekend++;  // een vraag die Athena niet kent
  });
  c.ander += uvorm;
  kand.sort(function (a, b) { return b.s - a.s || a.j - b.j; });
  kand.forEach(function (x) {
    if (bezet[x.j] || (c[x.v].length && (AANMELD_VELDEN[x.v].enkel || x.s < (x.v === 'toestemming' ? 40 : 50)))) return;
    c[x.v].push(x.j); bezet[x.j] = true;
  });
  c.functies = aanmeldWens(c.functies, koppen); c.sector = aanmeldWens(c.sector, koppen);
  // v7.4.1 ronde 5: een wens = een vraag die meer is dan een kale 'Functie' of 'Rol', of die een wensWOORD heeft ('Welke functie wil je?'); voor de sector alleen
  // met een wens ('In welk type onderwijs wil je werken?'; een kale 'Type onderwijs' kan ook het onderwijs van een school zijn). Een eigen adres = een postcode
  // of een woonplaatsvraag met 'woon' ('Woonplaats', 'Waar woon je?'); een kale 'Plaats' of 'Gemeente' kan ook die van een school zijn.
  var wens = function (j) { return AANMELD_WENS.some(function (t) { return heeftTerm(koppen[j].kern, t); }); };
  c.functiesWens = c.functies.some(function (j) { return wens(j) || FUNCTIE_KAAL.indexOf(koppen[j].kern.filter(function (w) { return AANMELD_STOP.indexOf(w) < 0; }).join(' ')) < 0; });
  c.sectorWens = c.sector.some(wens);
  c.eigenAdres = c.postcode.length > 0 || c.woonplaats.some(function (j) { return koppen[j].kern.some(function (w) { return /^woon|^wonen$|^live|^reside/.test(w); }); });
  // v7.4.1: een kale 'Functie' naast 'Werkgever' is de huidige baan, geen wens
  if (!c.functiesWens && koppen.some(function (k) { return k && (heeftTerm(k.kern, 'werkgever') || heeftTerm(k.kern, 'employer')); })) c.functies = [];
  // v7.4.1: beslissend zijn de beste toestemmingsvraag en elke andere over het talentbestand (privacy, gegevens, bewaren); een vraag voor een ander doel
  // ('Toestemming om je cv te delen met scholen') beslist niet en komt als notitie bij het profiel. v7.4.1 ronde 4: noemt een van de vragen het talentbestand,
  // dan is elke vraag zonder zo'n woord een ander doel, ook als die hoger scoort of eerst staat ('Toestemming om je te bellen' naast de privacyvraag)
  // v7.4.1 ronde 5: een vraag met een doelwoord (delen, doorsturen, derden, bellen, foto, cv) is altijd een ander doel, ook met 'gegevens' erin ('Toestemming om je
  // gegevens te delen met scholen'), zodra er ook een hoofdvraag is: een kale 'Toestemming', 'Privacy' of 'Privacyverklaring', of een vraag over het talentbestand
  // zonder doelwoord. Zonder hoofdvraag blijft het zoals in ronde 4 (de beste beslist, en elke andere over het talentbestand).
  var overBestand = function (j) { return TOESTEMMING_BESTAND.some(function (t) { return heeftTerm(koppen[j].kern, t); }); };
  var doel = function (j) { return TOESTEMMING_DOEL.some(function (t) { return heeftTerm(koppen[j].kern, t); }); };
  var kaal = function (j) { var w = koppen[j].kern.filter(function (x) { return AANMELD_STOP.indexOf(x) < 0; }); return w.length > 0 && w.every(function (x) { return TOESTEMMING_KAAL.indexOf(x) >= 0; }); };
  var hoofd = function (j) { return !doel(j) && (kaal(j) || overBestand(j)); }, metHoofd = c.toestemming.some(hoofd);
  c.toestemmingAnder = c.toestemming.filter(function (j, i) { return metHoofd ? !hoofd(j) : i > 0 && !overBestand(j); });
  c.toestemming = c.toestemming.filter(function (j) { return c.toestemmingAnder.indexOf(j) < 0; });
  return c;
}
var TOESTEMMING_BESTAND = ['privacy', 'avg', 'gdpr', 'gegevens', 'persoonsgegevens', 'gegevensverwerking', 'bewaren', 'bewaard', 'opslaan', 'opgeslagen', 'opslag', 'talentbestand',
  'talentpool', 'bestand', 'data', 'verwerking', 'verwerken', 'stored', 'store', 'processing'];
var TOESTEMMING_DOEL = ['delen', 'gedeeld', 'doorsturen', 'doorgestuurd', 'doorgeven', 'derden', 'share', 'shared', 'sharing', 'bellen', 'gebeld', 'call', 'foto', 'fotos',
  'beeld', 'nieuwsbrief', 'newsletter', 'mailing', 'marketing', 'benaderen', 'whatsapp', 'sms', 'cv', 'linkedin'];  // v7.4.1 ronde 5
var TOESTEMMING_KAAL = ['toestemming', 'privacy', 'privacyverklaring', 'privacystatement', 'privacybeleid', 'privacyvoorwaarden', 'statement', 'policy', 'verklaring', 'avg',
  'gdpr', 'consent', 'akkoord', 'agree', 'accepteer', 'accept', 'voorwaarden', 'algemene', 'gelezen', 'read', 'have', 'hiermee', 'ermee', 'mee', 'gaat'];
// v7.4.1: noemt een van de kolommen een wens ('wil', 'zoek', 'voorkeur', 'desired'), dan alleen die; anders alleen de beste
function aanmeldWens(kolommen, koppen) {
  if (kolommen.length < 2) return kolommen;
  var wens = kolommen.filter(function (j) { return AANMELD_WENS.some(function (t) { return heeftTerm(koppen[j].kern, t); }); });
  return wens.length ? wens : kolommen.slice(0, 1);
}
// v7.4.1: een aanmeldformulier heeft een contactkolom en iets dat bij een talent hoort. v7.4.1 ronde 5: eerst de tekens van een ander formulier (c.ander, zie
// anderGewicht), naast de talentspecifieke vragen (raster, beschikbaarheid, werkzaamheden of sector als wens, een eigen adres). Twee of meer tekens ('Naam van je
// school' + 'Waar kunnen we je mee helpen?', 'School' + 'Je vraag', 'Namens welke school …', 'Op welke school werk je?' + een training) zonder talentvraag = een
// ander formulier (stil, alleen in het logboek); met een talentvraag = 'twijfel'. Eén teken ('Organisatie', 'School', 'Je vraag') met een talentvraag = een
// aanmelding (een scholier die zijn school noemt naast zijn postcode), zonder = 'twijfel'. Geen tekens: zoals ronde 4 (telefoon, gesplitste naam, postcode of
// woonplaats, alleen bekende kolommen of een toestemmingsvraag = aanmelding, anders 'twijfel'). Zonder contactkolom: 'twijfel' als er wel een talentvraag of een
// toestemmingsvraag is (een e-mailvraag die Athena niet herkent mag niet stil een heel tabblad overslaan), anders false. Het tabblad Aanmeldingen is van Athena.
// De instelling aanmeldTabbladen ({"aanmelden": [naam], "negeren": [naam]}) gaat voor (zie aanmeldTabKeuze).
// true, false (stil: alleen in het logboek) of 'twijfel' (dan een fout en een melding: niet stil overslaan)
function aanmeldTabblad(c, naam) {
  var contact = c.email.length || c.telefoon.length || c.contact.length, eigen = /^aanmeldingen$/i.test(String(naam).trim());
  var talent = !!(c.raster.length || c.beschikbaarheid.length || c.functiesWens || c.sectorWens || c.eigenAdres);
  if (!contact) return !eigen && c.ander < 2 && (talent || c.toestemming.length) ? 'twijfel' : false;
  if (eigen) return true;
  if (c.ander >= 2) return talent ? 'twijfel' : false;
  if (c.ander === 1) return talent ? true : 'twijfel';
  if (talent || c.sector.length || c.postcode.length || c.woonplaats.length || c.telefoon.length || (c.voornaam.length && c.achternaam.length) || !c.onbekend || c.toestemming.length) return true;
  return 'twijfel';
}
// v7.4.1 ronde 5: de instelling aanmeldTabbladen beslist voor een tabblad: 'aanmelden', 'negeren' of '' (dan de herkenning)
function aanmeldTabKeuze(naam, inst) {
  var n = klein(String(naam).trim()), past = function (l) { return l instanceof Array && l.some(function (x) { return klein(String(x).trim()) === n; }); };
  if (!inst || typeof inst !== 'object') return '';
  return past(inst.negeren) ? 'negeren' : past(inst.aanmelden) ? 'aanmelden' : '';
}
// v7.4.1 ronde 6: noemt een beslissende toestemmingsvraag (de kop of een antwoord) het bewaren, opslaan of het talentbestand (TOESTEMMING_BEWAAR)?
function aanmeldBewaarVraag(waarden, c) {
  var bewaar = function (x) { return TOESTEMMING_BEWAAR.test(aanmeldWoorden(x)); };
  return c.toestemming.some(function (j) { return bewaar(c.kop[j]) || waarden.slice(1).some(function (r) { return bewaar(celTekst(r[j])); }); });
}
// v7.4.1 ronde 6: hoe Athena een antwoordtabblad behandelt: { c, keuze, contact, soort: true | false | 'twijfel', bewaar }. De instelling aanmeldTabbladen gaat
// voor ('negeren' → false); dan aanmeldTabblad. Een ander formulier (false) met een contactkolom en een toestemmingsvraag over het bewaren van gegevens is
// 'twijfel' met bewaar = true: zo'n formulier kan ook een aanmelding zijn ('Ben je naar onze informatieavond geweest?', 'Heb je al eens een training bij ons
// gevolgd?'), en een aanmelding gaat nooit stil verloren. Zonder bewaar-toestemming (een offerte, een training of een evaluatie van een school) blijft het stil.
// Ook twijfel door een teken van een ander formulier ('Via welke collega ken je ons?') krijgt met zo'n toestemmingsvraag bewaar = true (de fout zegt dan waarom).
function aanmeldTabbladSoort(naam, waarden, inst) {
  var c = aanmeldKolommen(waarden[0].map(String)), keuze = aanmeldTabKeuze(naam, inst), contact = !!(c.email.length || c.telefoon.length || c.contact.length), soort, bewaar = false;
  if (keuze === 'negeren') soort = false;
  else if (keuze === 'aanmelden') soort = contact ? true : 'twijfel';
  else if (((soort = aanmeldTabblad(c, naam)) === false || (soort === 'twijfel' && c.ander)) && contact && c.toestemming.length && aanmeldBewaarVraag(waarden, c)) { soort = 'twijfel'; bewaar = true; }
  return { c: c, keuze: keuze, contact: contact, soort: soort, bewaar: bewaar };
}

/* Celwaarden */
// Een cel als tekst: een Date als yyyy-MM-dd, een getal als cijfers, een ander object leeg; de rest door tekstIn (getrimd)
function celTekst(v) { if (v instanceof Date) return isNaN(v.getTime()) ? '' : datumStr(v); return v !== null && typeof v === 'object' ? '' : tekstIn(v); }
// v7.4.1: leeg = niets, alleen spaties of een niet aangevinkt selectievakje (false); verwerkt = ingevuld, maar niet 'FALSE' (een leeg vakje in een csv) en
// niet 'Nee' of 'Nog niet' (een eigen keuzelijst Ja/Nee van het team)
function celIngevuld(v) { return v === true || (typeof v !== 'boolean' && celTekst(v) !== ''); }
function celVerwerkt(v) { return celIngevuld(v) && !/^(false|onwaar|nee|neen|no|0|nog niet|niet verwerkt)$/i.test(celTekst(v)) && !/^wacht:/i.test(celTekst(v)); }  // v7.4.1 ronde 5: 'wacht: …' wacht nog
var AANMELD_WACHT = 'wacht: geen toestemming herkend (antwoord onduidelijk)';
function aanmeldEerste(r, kolommen, fn) { for (var i = 0; i < kolommen.length; i++) { var x = fn(r[kolommen[i]]); if (x) return x; } return ''; }
// v7.4.1: alleen rond de eerste '@' zoeken (een lange cel zonder adres kost anders seconden). v7.4.1 ronde 4: vóór het adres mag geen letter (ook geen é of ë)
// of cijfer staan: van 'renée.bakker@…' maakt Athena geen ander adres ('e.bakker@…') dat de welkomstmail met portaallink krijgt, maar laat het leeg
function emailUitCel(v) {
  var s = klein(celTekst(v)), i = s.indexOf('@'), van = Math.max(0, i - 64), deel = i < 0 ? '' : s.slice(van, i + 256), m = i < 0 ? null : /[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/.exec(deel);
  if (!m) return '';
  var voor = m.index > 0 ? deel.charAt(m.index - 1) : van > 0 ? s.charAt(van - 1) : '';
  return voor && (/[0-9]/.test(voor) || voor.toLowerCase() !== voor.toUpperCase()) ? '' : m[0];
}
// Telefoonnummer uit een cel: ook als getal zonder voorloopnul (Sheets maakt van 0612345678 het getal 612345678, van +316… 316…), '+31 (0)6' en 0031;
// v7.4.1: twee nummers in één cel ('06 12345248 / 06 87654321', een nieuwe regel, 'of'): het eerste geldige. Geen nummer → ''
function telefoonUitCel(v) {
  if (typeof v === 'number') return isFinite(v) ? telefoonUitTekst(String(Math.round(v))) : '';
  var s = celTekst(v), delen = s.split(/\s*[\/,;\n]\s*|\s+(?:of|or|en|and)\s+/);
  for (var i = 0; i < delen.length; i++) { var t = telefoonUitTekst(delen[i]); if (t) return t; }
  return telefoonUitTekst(s);  // '06/12345678'
}
function telefoonUitTekst(s) {
  var m = /(\+|00)?\d[\d\s().\/-]{7,}\d/.exec(String(s).replace(/\(0\)/g, '')), d;
  if (!m) return '';
  d = telefoonIn(m[0]);
  if (/^31\d{9}$/.test(d)) d = '0' + d.slice(2); else if (/^[1-9]\d{8}$/.test(d)) d = '0' + d;
  return /^\d{9,15}$/.test(d) ? d : '';  // negen cijfers: een tikfout, maar wel bewaard (het talentteam belt of mailt na)
}
// v7.4.1: een postcode uit een cel, ook met woonplaats of adres ('3511 AB Utrecht', 'Oudegracht 1, 3511 AB Utrecht'): { postcode, rest } of null
function postcodeUitCel(s) {
  var t = String(s == null ? '' : s), m = /(^|[^0-9])([1-9]\d{3})\s{0,2}([a-z]{2})(?![a-z])/i.exec(t);
  return m ? { postcode: m[2] + ' ' + m[3].toUpperCase(), rest: t.slice(m.index + m[0].length) } : null;
}
// De woonplaats na de postcode ('3511 AB Utrecht' → 'Utrecht'), alleen als het op een plaatsnaam lijkt
function plaatsNaPostcode(rest) { var p = schoneNaam(String(rest || '').replace(/^[\s,.;:-]+/, '').split(/[,;\n]/)[0]); return /^[a-z'][a-z' .-]{1,40}$/i.test(zonderAccenten(p)) ? p : ''; }
// De dag van de tijdstempel: Date, jjjj-mm-dd, d-m-jjjj (tekst in een handmatig tabblad), jjjj/mm/dd (csv-download van Google Forms) of een serieel getal; anders vandaag
function aanmeldDag(v) { return exportDag(v) || exportDag(String(v == null ? '' : v).trim().replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3')) || datumStr(new Date()); }
function schoneNaam(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80); }
// Voornaam en achternaam (met het tussenvoegsel ervoor); één kolom 'Naam' wordt gesplitst: het eerste woord is de voornaam, de rest de achternaam.
// v7.4.1: met een komma is het 'achternaam, voornaam' ('de Vries, Anne'); naast een achternaamkolom is 'Naam' de voornaam ('Naam' + 'Achternaam', 'Name' +
// 'Surname'), naast een voornaamkolom de familienaam ('Voornaam' + 'Naam', Vlaams); een voornaam die op de achternaam eindigt verliest die ('Sanne de Wit' + 'de Wit')
function aanmeldNaam(voor, tussen, achter, vol) {
  voor = schoneNaam(voor); tussen = schoneNaam(tussen); achter = schoneNaam(achter); vol = schoneNaam(vol);
  var komma = /^([^,]+),\s*([^,]+)$/.exec(vol);
  if (komma && !voor) { voor = komma[2].trim(); achter = achter || komma[1].trim(); vol = ''; }
  if (!voor && !achter && vol) { var i = vol.indexOf(' '); return i < 0 ? { voornaam: vol, achternaam: '' } : { voornaam: vol.slice(0, i), achternaam: vol.slice(i + 1) }; }
  if (!voor && vol) voor = eindigtOp(vol, achter) ? vol.slice(0, vol.length - achter.length).trim() : vol;
  if (voor && !achter && vol) { if (klein(vol).indexOf(klein(voor) + ' ') === 0) achter = vol.slice(voor.length + 1); else if (klein(vol) !== klein(voor)) achter = vol; }
  if (tussen && klein(achter).indexOf(klein(tussen) + ' ') !== 0) achter = (tussen + ' ' + achter).trim();
  if (eindigtOp(voor, achter)) voor = voor.slice(0, voor.length - achter.length).trim();
  return { voornaam: voor, achternaam: achter };
}
function eindigtOp(s, eind) { s = klein(s); eind = klein(eind); return !!eind && s.length > eind.length + 1 && s.slice(-eind.length - 1) === ' ' + eind; }
// v7.4.1 (AVG): toestemming is een witte lijst: 'ja', 'nee', 'onduidelijk' of 'leeg'. Ja = een aangevinkt vakje (true), een datum, of tekst met een ja-woord
// (ja, akkoord, toestemming, agree, consent, ok, mag, eens, wel, gegeven, getekend, aangevinkt, ✓, x) zonder ontkenning. Een ontkenning (nee, niet, geen, no,
// not, n't, bezwaar, oneens, misschien, weiger…, afwijz…, declin…, intrek…, ✗, ❌) maakt het nee; 'geen bezwaar' en 'no objection' zijn ja. Tekst tussen haakjes
// is uitleg. v7.4.1 ronde 4: alleen de hoofdzin beslist. Het antwoord wordt geknipt bij een zinseinde, een komma of puntkomma en een voegwoord (en, maar, dat,
// tot, om, and, that, until …); het eerste stuk met een ja- of nee-woord beslist ('Ik geef toestemming … en weet dat ik die altijd kan intrekken', 'Ik ga akkoord,
// mijn gegevens worden niet gedeeld' en 'Ja, ik geef toestemming; je gegevens worden nooit verkocht' zijn ja; 'Nee', 'Niet akkoord', 'Ik ga niet akkoord', 'Ik
// geef geen toestemming' en 'I do not agree' nee). De rest ('-', '?', 'onbekend', 'volgt', '… gelezen en begrepen') is onduidelijk = geen toestemming.
var TOESTEMMING_JA = /(^| )(ja|jazeker|jawel|yes|yep|yeah|j|y|ok|oke|okay|prima|goed|mag|eens|stem|true|waar|wel|1|x)( |$)|(^| )(akkoord|agree|accept|geaccepteerd|toestemming|consent|instem|ingestemd|gegeven|getekend|ondertekend|aangevinkt|verkregen)/;
var TOESTEMMING_GRENS = /[.!?](?:\s|$)|\n|\s*[,;]\s*|\s(?:en|maar|want|omdat|dat|die|tot|totdat|zodat|als|wanneer|waarbij|waarna|mits|om|and|but|that|which|until|because|so|as|if|when|while)\s/;
var TOESTEMMING_NEE = /(^| )(nee|neen|nein|non|no|nope|niet|geen|not|never|nooit|dont|doesnt|false|onwaar|0|n|bezwaar|oneens|misschien|maybe|twijfel|later)( |$)|n't( |$)|(^| )(weiger|afwijz|afgewez|declin|refus|disagre|intrek|ingetrok|trek|verwijder|uitschrijf|uitschrijv|afmeld)/;
function toestemmingOordeel(v) {
  if (v === true || (v instanceof Date && !isNaN(v.getTime()))) return 'ja';
  var ruw = celTekst(v);
  if (v === false) return 'nee';
  if (!ruw) return 'leeg';
  if (/[\u2717\u2718\u00d7\u274c\u26d4]/.test(ruw)) return 'nee';  // ✗ ✘ × ❌ ⛔
  if (/[\u2713\u2714\u2611\u2705]/.test(ruw) || exportDag(ruw)) return 'ja';  // ✓ ✔ ☑ ✅ of de datum van de toestemming
  var delen = (' ' + zonderAccenten(ruw).toLowerCase().replace(/[\u2018\u2019`\u00b4]/g, "'").replace(/\([^)]*\)/g, ' ').slice(0, 1000) + ' ').split(TOESTEMMING_GRENS);
  var schoon = function (x) { return x.replace(/[^a-z0-9']+/g, ' ').replace(/(^| )(geen|no) (bezwaar|probleem|objection|objections|problem)( |$)/g, ' akkoord ').trim(); };
  for (var i = 0; i < delen.length; i++) {
    var t = schoon(delen[i]);
    if (TOESTEMMING_NEE.test(t)) return 'nee';
    if (TOESTEMMING_JA.test(t)) return toestemmingRest(t, delen.slice(i + 1).map(schoon));
  }
  return 'onduidelijk';
}
// v7.4.1 ronde 5: na het ja-deel. Een los nee erachter ('Toestemming, nee', 'Ja, toch maar niet', 'Akkoord, of toch niet', 'Wel akkoord? Nee') = nee.
// v7.4.1 ronde 6 (AVG): de regel omgedraaid. Elk deel met een ontkenning of beperking (TOESTEMMING_VOORBEHOUD: niet, niets, geen, nooit, not, don't, no, behalve,
// except, mits, wis, weggooien, verwijder, delete, misschien) maakt het antwoord onduidelijk: geen profiel, de rij wacht met een fout en een melding ('Akkoord, maar
// sla mijn gegevens niet op', 'I agree, but don't save my details', 'Akkoord, maar niet in het talentenbestand opnemen', 'Ja, maar na een maand weggooien' of 'gooi … weg',
// 'Akkoord, maar wis mijn gegevens daarna'). Behalve een bekende uitleg (TOESTEMMING_UITLEG): een deel over delen, derden, verkopen, nieuwsbrief, marketing of
// reclame, of over intrekken en afmelden, zonder woord over het bewaren ('… worden niet gedeeld met derden', '… nooit verkocht', 'maar niet met de nieuwsbrief';
// 'niet opslaan of delen met derden' blijft onduidelijk), 'niet langer dan nodig' en een termijn van minstens de bewaartermijn (bewaartermijnMaanden: 'niet
// langer dan 2 jaar', '… worden na twee jaar verwijderd'; zie toestemmingTermijnUit). 'Alleen', 'uitsluitend' en 'only' beperken altijd, ook in het ja-deel zelf
// ('Akkoord, maar alleen voor deze sollicitatie', 'Ja, alleen voor de nieuwsbrief', 'Ik geef alleen toestemming voor deze sollicitatie'); 'alleen geen …' is een
// ontkenning ('Ja, ik wil alleen geen nieuwsbrief' blijft ja).
var TOESTEMMING_LOS_NEE = /^((nee|neen|no|nope|niet|not|geen|never|nooit|toch|maar|of|eigenlijk|liever|dan|wel|ik|doe|het)( |$))+$/;
// v7.4.1 ronde 6: ook talentenbestand, talentenpool, save en vastleggen (het bewaren in andere woorden)
var TOESTEMMING_BEWAAR = /(^| )(bewaar|bewaren|bewaard|opslaan|opgeslagen|opslag|talentbestand|talentpool|talentenbestand|talentenpool|bestand|database|verwijder|verwijderd|verwijderen|store|stored|storing|keep|kept|retain|retained|delete|deleted|save|saved|vastleggen|vastgelegd)( |$)|(^| )langer dan|deze vacature|this (vacancy|job)/;
var TOESTEMMING_VOORBEHOUD = /(^| )(niet|niets|geen|nooit|never|not|nothing|no|nee|dont|doesnt|behalve|uitgezonderd|except|mits|wis|wissen|gewist|weggooien|weggooi|weggegooid|gooi|gooien|verwijder[a-z]*|delete[a-z]*|erase[a-z]*|misschien|maybe|twijfel)( |$)|n't( |$)/;
var TOESTEMMING_ALLEEN = /(^| )(alleen|uitsluitend|only)( (?!(geen|niet|not|no|nooit|never)( |$))|$)/;
var TOESTEMMING_UITLEG = /(^| )(derden|third|gedeeld|delen|share|shared|sharing|doorgegeven|doorgeven|verkocht|verkopen|sell|sold|selling|nieuwsbrief|newsletter|marketing|reclame|mailing|mailings|intrekken|ingetrokken|afmelden|afmeld|afgemeld|withdraw|withdrawn|unsubscribe)( |$)/;
function toestemmingRest(ja, rest) {
  var alle = [ja].concat(rest);
  for (var i = 0; i < alle.length; i++) {
    var t = alle[i];
    if (!t) continue;
    if (i > 0 && TOESTEMMING_LOS_NEE.test(t) && TOESTEMMING_NEE.test(t)) return 'nee';
    t = toestemmingTermijnUit(t);
    if (TOESTEMMING_ALLEEN.test(t)) return 'onduidelijk';
    if (TOESTEMMING_VOORBEHOUD.test(t) && !(TOESTEMMING_UITLEG.test(t) && !TOESTEMMING_BEWAAR.test(t))) return 'onduidelijk';
  }
  return 'ja';
}
// v7.4.1 ronde 6: een deel zonder de bewaartermijnen die uitleg zijn: 'niet langer (bewaard) dan nodig', 'niet langer dan N jaar' en '(worden) na N jaar verwijderd'
// met N minstens bewaartermijnMaanden, en '… worden (op verzoek) verwijderd' zonder termijn. Een kortere of andere termijn blijft staan ('niet langer dan een jaar'
// bij 24 maanden, '… worden na afloop verwijderd'), en daarmee de ontkenning of het verwijderen: onduidelijk.
var TOESTEMMING_GETAL = '(\\d+|een|twee|drie|vier|vijf|one|two|three|four|five)', TOESTEMMING_PERIODE = '(jaar|jaren|maand|maanden|year|years|month|months)';
function toestemmingTermijnUit(t) {
  var termijn = null;  // pas lezen als er een termijn staat
  var lang = function (n, eenheid) { if (termijn === null) termijn = Number(instelling('bewaartermijnMaanden')) || 24; var g = /^\d+$/.test(n) ? Number(n) : (['een', 'twee', 'drie', 'vier', 'vijf'].indexOf(n) + 1 || ['one', 'two', 'three', 'four', 'five'].indexOf(n) + 1); return g * (/^(jaar|jaren|year|years)$/.test(eenheid) ? 12 : 1) >= termijn; };
  t = t.replace(/(^| )(niet|not|no) (langer|longer) (bewaard |bewaren |opgeslagen |kept |stored )?(dan|than) (nodig|noodzakelijk|strikt noodzakelijk|necessary|needed|required|strictly necessary)( |$)/g, ' ');
  t = t.replace(new RegExp("(^| )(niet|not|no) (langer|longer) (bewaard |bewaren |opgeslagen |kept |stored )?(dan|than) " + TOESTEMMING_GETAL + ' ' + TOESTEMMING_PERIODE + '( |$)', 'g'),
    function (x, a, b, c, d, e, n, eenheid) { return lang(n, eenheid) ? ' ' : x; });
  // passief ('… worden (op verzoek | na twee jaar) verwijderd', '… will be deleted (after two years)'): uitleg zonder termijn of met een termijn die lang genoeg is;
  // zonder termijn niet als het een eis is ('… moeten worden verwijderd', '… wil ik verwijderd hebben', 'please')
  var eis = /(^| )(moet|moeten|wil|willen|wens|graag|must|should|please|want)( |$)/.test(t);
  t = t.replace(new RegExp("(^| )(worden|wordt|word|zijn|is|are|will be) (([a-z0-9']+ ){0,4})(verwijderd|deleted|gewist|erased)(( [a-z0-9']+){0,3})(?= |$)", 'g'), function (x, a, hulp, tussen, w, verb, na) {
    var rond = ' ' + tussen + (na || '') + ' ', m = new RegExp(' (na|binnen|after|within) ' + TOESTEMMING_GETAL + ' ' + TOESTEMMING_PERIODE + ' ').exec(rond);
    if (m) return lang(m[2], m[3]) ? ' ' : x;
    return eis || / (na|daarna|afloop|direct|meteen|binnen|einde|after|afterwards|within|immediately) /.test(rond) ? x : ' ';
  });
  // zonder hulpwerkwoord na een voegwoord ('… bewaard en na twee jaar verwijderd')
  t = t.replace(new RegExp('(^| )(na|binnen|after|within) ' + TOESTEMMING_GETAL + ' ' + TOESTEMMING_PERIODE + " (([a-z0-9']+ ){0,2})(verwijderd|deleted|gewist|erased)(?= |$)", 'g'),
    function (x, a, voor, n, eenheid) { return lang(n, eenheid) ? ' ' : x; });
  return t.replace(/\s+/g, ' ').trim();
}
function toestemmingGegeven(v) { return toestemmingOordeel(v) === 'ja'; }
var TOESTEMMING_NVT = /^(n\.?\s?v\.?\s?t\.?|n\.?\s?a\.?|n\/a|niet van toepassing|not applicable)$/i;  // telt als niet ingevuld (een vraag voor ouders van jongeren)
// Alle ingevulde beslissende toestemmingskolommen moeten ja zijn, en minstens één moet ingevuld zijn (een leeg vakje, false, telt als nee: de rij is niet
// leeg). v7.4.1: 'ja', 'nee', 'onduidelijk' of 'leeg'
function rijToestemming(r, kolommen) {
  var uit = 'leeg';
  for (var i = 0; i < kolommen.length; i++) {
    var v = r[kolommen[i]], o;
    if ((v !== false && !celIngevuld(v)) || TOESTEMMING_NVT.test(celTekst(v))) continue;
    if ((o = toestemmingOordeel(v)) !== 'ja') return o;
    uit = 'ja';
  }
  return uit;
}

/* Antwoorden met meer keuzes: functies en sector */
// Gescheiden door , ; / & + een nieuwe regel of het woord en/of (zo voegt Google Forms selectievakjes samen); [{ tekst, sep }] met het scheidingsteken ervoor.
// v7.4.1 ronde 4: ook een zinseinde ('Surveillance: nee. Huiswerkbegeleiding: ja')
function antwoordDelen(tekst) {
  var stukken = String(tekst || '').split(/(\s*[,;\/\n&+]\s*|[.!?]\s+|\s+(?:en|of|and|or)\s+)/i), uit = [];
  for (var i = 0; i < stukken.length; i += 2) { var t = stukken[i].trim(); if (t) uit.push({ tekst: t, sep: i ? stukken[i - 1] : '' }); }
  return uit;
}
// Per deel de codes (perDeel krijgt de woorden); niet herkende delen blijven in hun eigen tekst bewaard (aaneengesloten delen samen, 'Andere:' weg).
// v7.4.1: een deel met een ontkenning ('Geen mbo', 'Alles behalve surveillance', 'Liever geen huiswerkbegeleiding') geeft geen code en blijft bewaard;
// een ontkenning tussen haakjes geldt alleen voor de haakjes ('VO (geen praktijkonderwijs)' = vo)
var ANTWOORD_NEE = ['niet', 'geen', 'behalve', 'uitgezonderd', 'excl', 'exclusief', 'not', 'no', 'except', 'nee', 'neen', 'nope'];  // v7.4.1 ronde 4: 'surveillance nee'
function deelOntkend(t) { return woordenVan(t).some(function (w) { return ANTWOORD_NEE.indexOf(w) >= 0; }); }
function antwoordLezen(tekst, perDeel) {
  var codes = [], niet = [], vorigeNiet = false;
  antwoordDelen(tekst).forEach(function (d) {
    var t = d.tekst.replace(/^(andere|anders|overig|other)\s*:\s*/i, '').trim(), kaal = t.replace(/\([^)]*\)/g, ' ');
    var w = aanmeldWoorden(deelOntkend(kaal) ? '' : deelOntkend(t) ? kaal : t), g = w ? perDeel(w.split(' ')) : [];
    if (!aanmeldWoorden(t)) return;
    g.forEach(function (x) { if (codes.indexOf(x) < 0) codes.push(x); });
    if (!g.length) { if (vorigeNiet) niet[niet.length - 1] += d.sep + t; else niet.push(t); }
    vorigeNiet = !g.length;
  });
  return { codes: codes, niet: niet };
}
// Alle kolommen van een veld samen
function aanmeldLijst(r, kolommen, perDeel, lijst) {
  var uit = { codes: [], niet: [] };
  kolommen.forEach(function (j) {
    var a = antwoordLezen(celTekst(r[j]), function (w) { return perDeel(w, lijst); });
    a.codes.forEach(function (x) { if (uit.codes.indexOf(x) < 0) uit.codes.push(x); });
    uit.niet = uit.niet.concat(a.niet);
  });
  return uit;
}
function codeTermen(tabel, code) { var l = uitMap(tabel, code); return [aanmeldWoorden(code)].concat(l instanceof Array ? l : []).filter(Boolean); }
function sectorenUitDeel(w, lijst) {
  var heeft = function (t) { return heeftTerm(w, t); }, uit = lijst.filter(function (s) { return codeTermen(SECTOR_WOORDEN, s).some(heeft); });
  // v7.4.1: naast so (speciaal, vso, sbo, praktijkonderwijs) tellen 'basisonderwijs' en 'voortgezet' niet als po of vo; 'havo' of 'PO' zelf wel
  if (uit.indexOf('so') >= 0) uit = uit.filter(function (s) { var alg = uitMap(SECTOR_ALGEMEEN, s); return !alg || codeTermen(SECTOR_WOORDEN, s).some(function (t) { return alg.indexOf(t) < 0 && heeft(t); }); });
  return uit;
}
function functiesUitDeel(w, lijst) {
  var uit = lijst.filter(function (f) { return codeTermen(FUNCTIE_WOORDEN, f).some(function (t) { return heeftTerm(w, t); }); });
  if (uit.length > 1 && uit.indexOf(FUNCTIE_ALGEMEEN) >= 0) uit.splice(uit.indexOf(FUNCTIE_ALGEMEEN), 1);
  return uit;
}

/* Beschikbaarheid: raster [ochtend, middag, avond] per dag, 2 = ja, 1 = liever niet, 0 = nee */
var DAG_VOLUIT = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'], DAG_ENGELS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
var DAG_KORT_NL = { ma: 0, di: 1, wo: 2, do: 3, vr: 4, za: 5, zo: 6 }, DAG_KORT_EN = { mon: 0, tue: 1, tues: 1, wed: 2, thu: 3, thur: 3, thurs: 3, fri: 4, sat: 5, sun: 6 };
// Een woord als dag: { dag, deel (-1 = geen), kort } of null. 'maandagochtend', 'maandags', 'maandagen' en 'Monday' altijd; 'ma' als afkorting (kort);
// Engelse afkortingen ('Mon') alleen ruim, in rasterlabels en -cellen
function dagVanWoord(w, ruim) {
  var m = /^([a-z]+?dag)(?:s|en)?(ochtend|morgen|middag|avond)?(?:en|s)?$/.exec(w), d;
  if (m && DAG_VOLUIT.indexOf(m[1]) >= 0) return { dag: DAG_VOLUIT.indexOf(m[1]), deel: !m[2] ? -1 : m[2] === 'morgen' ? 0 : DAGDELEN.indexOf(m[2]), kort: false };
  if ((m = /^([a-z]+day)s?$/.exec(w)) && DAG_ENGELS.indexOf(m[1]) >= 0) return { dag: DAG_ENGELS.indexOf(m[1]), deel: -1, kort: false };
  if ((d = uitMap(DAG_KORT_NL, w)) !== undefined) return { dag: d, deel: -1, kort: true };
  if (ruim && (d = uitMap(DAG_KORT_EN, w)) !== undefined) return { dag: d, deel: -1, kort: true, en: true };
  return null;
}
// Een woord als dagdelen: [0] ochtend, [1] middag, [2] avond, [0, 1] overdag; ook meervoud en 's ochtends ('ochtends', 'sochtends'); anders null
function delenVanWoord(w) {
  var m = /^tijd([01])([01])([01])$/.exec(w), u = [];  // v7.4.1 ronde 4: een tijd uit beschZinnen ('8.30-12.00' → tijd100)
  if (m) { for (var e = 0; e < 3; e++) if (m[e + 1] === '1') u.push(e); return u.length ? u : null; }
  if (/^s?(ochtend(en|s)?|morgens|mornings?)$/.test(w)) return [0];
  if (/^s?(middag(en|s)?|namiddag(en)?|afternoons?)$/.test(w)) return [1];
  if (/^s?(avond(en|s)?|evenings?)$/.test(w)) return [2];
  if (/^(overdag|schooltijd(en)?|daytime)$/.test(w)) return [0, 1];
  return null;
}
function dagenVanGroep(w) {
  if (/^(werkdag(en)?|doordeweeks?e?|weekdag(en)?|weekdays?|schooldag(en)?)$/.test(w)) return [0, 1, 2, 3, 4];
  if (/^weekend(en|s|dagen)?$/.test(w)) return [5, 6];
  if (/^(dagelijks|daily)$/.test(w)) return [0, 1, 2, 3, 4, 5, 6];
  return null;
}
function zetDagdelen(r, d, delen, modus) { var rij = r[DAGEN_KORT[d]]; (delen || (modus === 0 ? [0, 1, 2] : [0, 1])).forEach(function (e) { rij[e] = modus; }); }
function rasterGevuld(r) { return DAGEN_KORT.some(function (d) { return r[d].some(Boolean); }); }
// Rasterlabel ('Maandag', 'Maandag ochtend', 'Ochtend (8.30-12.00)', v7.4.1: 'Weekend', 'Za/zo') → { dagen, deel (-1 = niet genoemd) } of null; de vraag mag zelf
// een dag zijn ('Maandag [Ochtend]'). v7.4.1: geen raster als de vraag geen beschikbaarheid is ('Wanneer ben je NIET beschikbaar? [Maandag]', '… heb je college?')
function rasterSleutel(k, rij) {
  var r = labelDagDeel(rij), v = labelDagDeel(k.kern.join(' '));
  if (!r.dagen.length && r.deel < 0) return null;
  if (aanmeldNiet(AANMELD_VELDEN.beschikbaarheid, k)) return null;
  if (!r.dagen.length && v.dagen.length && k.kern.length === 1) r.dagen = v.dagen;
  return r;
}
// v7.4.1: ook een bereik ('Ma t/m vr', 'Ma-vr', 'Mon-Fri') en een tijdvak ('8.30 - 12.00 uur': het beginuur bepaalt het dagdeel, zie deelVanTijd)
function labelDagDeel(label) {
  var uit = { dagen: [], deel: -1 }, re = /[a-z0-9]+|-/g, s = beschZinnen(label).join(' '), m, vanaf = -1, bereik = false;
  while ((m = re.exec(s))) {
    var w = m[0], d = dagVanWoord(w, true), e = delenVanWoord(w), dagen = d ? [d.dag] : dagenVanGroep(w) || [];
    if (w === 'tm' || w === '-') { bereik = vanaf >= 0; continue; }
    if (bereik && dagen.length === 1) dagen = dagenTotEnMet(vanaf, dagen[0]);
    bereik = false; vanaf = dagen.length === 1 ? dagen[0] : -1;
    dagen.forEach(function (x) { if (uit.dagen.indexOf(x) < 0) uit.dagen.push(x); });
    if (d && d.deel >= 0 && uit.deel < 0) uit.deel = d.deel;
    if (e && e.length === 1 && uit.deel < 0) uit.deel = e[0];
  }
  if (uit.deel < 0) uit.deel = deelVanTijd(label);
  return uit;
}
// v7.4.1: een tijd ('8.30', '13:00', '9 uur', '15u') → het dagdeel van het eerste uur (vóór 12 ochtend, vóór 17 middag, anders avond); geen tijd ('2-3 dagen') → -1
function deelVanTijd(s) {
  s = String(s == null ? '' : s).toLowerCase();
  if (!/\d[.:]\d{2}|\d\s*(uur|u|h)\b/.test(s)) return -1;
  var u = Number(/\d{1,2}/.exec(s)[0]);
  return u < 6 || u > 23 ? -1 : u < 12 ? 0 : u < 17 ? 1 : 2;
}
// Een rastercel: Ja/Nee/Liever niet/Misschien → 2/0/1. v7.4.1: een witte lijst. 2 = ja, beschikbaar, kan, altijd, vrij, ok, ✓ of x; 1 = liever niet, misschien,
// soms, in overleg; 0 = een ontkenning ergens in de cel ('Kan niet', 'Helaas niet', 'Nooit'), n.v.t., onbekend, '?', of bezet (college, stage, werk, les,
// school); -1 = andere tekst (0 in het raster; de tekst komt als 'Niet herkend' bij het profiel)
function rasterWaarde(s) {
  var t = zonderAccenten(String(s)).toLowerCase().trim();
  if (/liever niet|rather not|preferably not|misschien|maybe|eventueel|soms|sometimes|zo nodig|indien nodig|if needed|in overleg/.test(t)) return 1;
  if (/^(-|0|n|false|onwaar|\?+|n\.?v\.?t\.?|n\/a|na)$/.test(t) || /\b(nee|neen|nope|no|niet|not|nooit|never|geen|none|bezet|druk|busy|onbekend|unknown|college|colleges|stage|werk|les|lessen|school|studie|tentamen|tentamens)\b|onbeschikbaar|unavailable|[\u2717\u2718\u00d7\u274c]/.test(t)) return 0;
  if (/^(x|v|j|y|1|true|waar)$/.test(t) || /\b(ja|jazeker|yes|beschikbaar|available|kan|kunnen|altijd|always|vrij|free|ok|oke|okay|prima|goed|graag|mogelijk|possible|voorkeur|liefst|prefer|preferred)\b|[\u2713\u2714\u2611\u2705]/.test(t)) return 2;
  return -1;
}
// Eén rastercel in r. Rij = dag(en): de cel noemt dagdelen of Ja/Nee; rij = dagdeel: de cel noemt dagen (ook 'ma, wo') of Ja/Nee; rij = dag + dagdeel: Ja/Nee/Liever niet.
// v7.4.1: een cel die Athena niet kent komt in 'niet' (de lijst 'Niet herkend' van de rij). v7.4.1 ronde 4: rij = dag en de cel noemt dagdelen: elk dagdeel
// met zijn eigen waarde (rasterDelen: 'Ochtend niet' = 0, 'Middag liever niet' = 1, '8.30 - 12.00' = ochtend); alleen ontkende dagdelen = de rest van de dag
function rasterCel(r, sl, cel, niet) {
  var s = celTekst(cel), v = rasterWaarde(s), dd, dagen = [];
  if (!s) return;
  dd = rasterDelen(s);
  beschZinnen(s).join(' ').split(/[^a-z0-9]+/).forEach(function (w) { var d = dagVanWoord(w, true); dagen = dagen.concat(d ? [d.dag] : dagenVanGroep(w) || []); });
  if (v < 0 && !(sl.deel < 0 && dd.length) && !(!sl.dagen.length && dagen.length)) { if (niet && niet.indexOf(s) < 0) niet.push(s); }
  if (v < 0) v = 0;
  if (sl.dagen.length && sl.deel >= 0) { sl.dagen.forEach(function (d) { r[DAGEN_KORT[d]][sl.deel] = v; }); return; }
  if (sl.dagen.length) {
    sl.dagen.forEach(function (d) {
      if (!dd.length) { zetDagdelen(r, d, null, v); return; }
      if (!dd.some(function (x) { return x.v; })) zetDagdelen(r, d, null, 2);  // 'Ochtend niet': ochtend en middag, zonder de ochtend
      dd.forEach(function (x) { r[DAGEN_KORT[d]][x.deel] = x.v; });
    });
    return;
  }
  if (dagen.length) dagen.forEach(function (d) { r[DAGEN_KORT[d]][sl.deel] = 2; }); else [0, 1, 2, 3, 4].forEach(function (d) { r[DAGEN_KORT[d]][sl.deel] = v; });
}
// v7.4.1 ronde 4: de dagdelen in een cel, per deelzin: [{ deel, v }] met v = 0 bij een ontkenning ervoor of erna ('Ochtend niet', "Niet 's avonds", 'Behalve
// de avond'), 1 bij 'liever niet', anders 2. Een tijd telt als dagdeel ('8.30 - 12.00, 12.30 - 16.00' = ochtend en middag).
function rasterDelen(s) {
  var uit = [];
  beschZinnen(s).forEach(function (zin) {
    var tk = beschTokens(zin);
    tk.forEach(function (t, i) {
      if (t.soort !== 'deel') return;
      var v = 2, k, buren = [];
      for (k = i - 1; k >= 0 && BESCH_VUL_DEEL.indexOf(tk[k].w) >= 0; k--);
      buren.push(tk[k]);
      for (k = i + 1; k < tk.length && BESCH_VUL_DEEL.indexOf(tk[k].w) >= 0; k++);
      buren.push(tk[k]);
      buren.forEach(function (x) { if (x && (x.soort === 'nee' || (x.soort === 'modus' && x.modus === 0))) v = 0; else if (x && x.soort === 'modus' && v) v = 1; });
      t.delen.forEach(function (e) { uit.push({ deel: e, v: v }); });
    });
  });
  return uit;
}
// De beschikbaarheid van een rij: de rasterkolommen samen; zonder ingevuld raster de eerste tekstkolom waar iets uit komt. v7.4.1 ronde 4: noemt de ene
// tekstkolom alleen dagen ('Maandag, Woensdag') en een andere alleen dagdelen ('Middag, Avond'), dan die dagdelen op die dagen (beschSamen); een tekst
// waar geen raster uit komt ('Flexibel, bel me even') komt in 'niet' (de lijst 'Niet herkend'): Athena verzint er geen dagen bij
function aanmeldBeschikbaarheid(r, c, niet) {
  var raster = beschikbaarheidUit({}), gevuld = false, teksten = [], dagen, delen;
  c.raster.forEach(function (k) { if (celTekst(r[k.j])) { gevuld = true; rasterCel(raster, k, r[k.j], niet); } });
  c.beschikbaarheid.forEach(function (j) {
    var t = celTekst(r[j]), b;
    if (!t || !aanmeldWoorden(t) || TOESTEMMING_NVT.test(t)) return;
    b = beschikbaarheidUitTekst(t);
    if (rasterGevuld(b)) teksten.push({ r: b, noemt: beschNoemt(t) }); else if (niet && niet.indexOf(t) < 0) niet.push(t);
  });
  if (gevuld || !teksten.length) return raster;
  dagen = teksten.filter(function (x) { return x.noemt.dag && !x.noemt.deel; })[0]; delen = teksten.filter(function (x) { return !x.noemt.dag && x.noemt.deel; })[0];
  return dagen && delen ? beschSamen(dagen.r, delen.r) : teksten[0].r;
}
// v7.4.1 ronde 4: noemt een tekst dagen en/of dagdelen? { dag, deel }
function beschNoemt(tekst) {
  var uit = { dag: false, deel: false };
  beschZinnen(String(tekst).slice(0, 2000)).forEach(function (zin) { beschTokens(zin).forEach(function (t) { if (t.soort === 'dag') uit.dag = true; if (t.soort === 'deel') uit.deel = true; }); });
  return uit;
}
// v7.4.1 ronde 4: de dagen uit de ene kolom met de dagdelen uit de andere (die gelden voor de werkdagen); 'liever niet' (1) van een van beide blijft 1
function beschSamen(dagR, deelR) {
  var uit = beschikbaarheidUit({}), patroon = [0, 1, 2].map(function (e) { return Math.max.apply(null, [0, 1, 2, 3, 4].map(function (d) { return deelR[DAGEN_KORT[d]][e]; })); });
  DAGEN_KORT.forEach(function (d) { var dag = Math.max.apply(null, dagR[d]); if (dag) uit[d] = patroon.map(function (v) { return v ? Math.min(v, dag) : 0; }); });
  return uit;
}
// v7.4.1: vrije tekst → raster. Kent bereiken ('ma t/m vr', 'maandag tot en met donderdag', 'ma-wo'), groepen (werkdagen, doordeweeks, weekend, de hele
// week, elke dag), aaneengeschreven ('maandagochtend'), meervoud ('ochtenden'), 's middags, overdag, hele dag, 'liever niet' (1) en 'behalve' (0), ook
// achteraf ('vrijdag liever niet'), en ontkenningen ('geen woensdag', 'woensdag niet', 'woensdag kan ik niet' = 0).
// Een dag zonder dagdeel = ochtend en middag; alleen dagdelen zonder dag = die dagdelen op de werkdagen. Elke deelzin (gescheiden door , ; of een nieuwe
// regel) apart; een deelzin met alleen dagdelen hoort bij de dagen van de deelzin ervoor ("Dinsdag, maar dan alleen 's middags"). 'zo' en 'do' zijn
// alleen een dag in een opsomming, een bereik of met een dagdeel erbij, nooit in "zo snel mogelijk" of "do's en don'ts". Alleen de eerste 2000 tekens
// tellen (een cel van een formulier kan 50.000 tekens hebben; zoveel tekst over dagen is geen antwoord meer).
// v7.4.1: een nieuwe zin en tekst tussen haakjes zijn een eigen deelzin; bezet (college, les, stage, bezet, druk) is 0 voor die dag(en); 'de rest (van de
// week)' zijn de werkdagen die nog niet genoemd zijn; 'iedere middag' en 'na schooltijd' gelden op de werkdagen; Engelse dagen ook kort ('Mon-Fri').
// 'Ik werk op maandag' is 0 voor maandag als de tekst nog andere dagen noemt, anders (alleen werkdagen genoemd) waarschijnlijk toch de beschikbaarheid.
function beschikbaarheidUitTekst(tekst) {
  var zinnen = beschZinnen(String(tekst == null ? '' : tekst).slice(0, 2000)), r = beschTekstPas(zinnen, true);
  return rasterGevuld(r) || !/(^| )werk( |$)/.test(zinnen.join(' ')) ? r : beschTekstPas(zinnen, false);
}
function beschTekstPas(zinnen, werkBezet) {
  var r = beschikbaarheidUit({}), staat = { vorige: [], genoemd: [], werkBezet: werkBezet, uitgesteld: [] };
  zinnen.forEach(function (zin) { beschZin(r, beschTokens(zin), staat); });
  staat.uitgesteld.forEach(function (e) { DAGEN_KORT.forEach(function (d) { r[d][e] = 0; }); });  // v7.4.1 ronde 4: 'Ochtenden niet, middagen wel'
  return r;
}
// Kleine letters zonder accenten; vaste uitdrukkingen worden één merkwoord (tm = bereik, dagelijks, overdag, lieverniet, behalve); dan per deelzin
function beschZinnen(tekst) {
  return zonderAccenten(String(tekst == null ? '' : tekst)).replace(/([.!?])\s+(?=[A-Z])/g, '$1\n').toLowerCase()  // v7.4.1: 'Maandag en dinsdag. Woensdag …'
    .replace(/[‘’`´]/g, "'").replace(/[–—]/g, '-').replace(/[()]/g, ',')  // v7.4.1: '(niet in de toetsweek)' is een eigen deelzin
    .replace(BESCH_TIJD, tijdMerkwoord)  // v7.4.1 ronde 4: '8.30-12.00', 'vanaf 13.00 uur' en 'tot 12 uur' worden een dagdeel (tijd100 …)
    .replace(/\b([a-z]+dag)-\s*(en|of)\s+([a-z]+dag)(ochtend|morgen|middag|avond)/g, '$1$4 $2 $3$4')  // 'maandag- en dinsdagochtend'
    .replace(/t\s*\/\s*m\b|t\.e\.m\.?/g, ' tm ').replace(/\b(tot en met|tot|until|through)\b/g, ' tm ')
    .replace(/\b([a-z]+day|mon|tues?|wed|thu|thurs?|fri|sat|sun)\s+to\b/g, '$1 tm')  // v7.4.1: 'Monday to Friday' (alleen 'to' na een dag)
    .replace(/\b(de )?(ge)?hele week\b|\b(elke|iedere) dag\b|\balle dagen\b|\bevery day\b/g, ' dagelijks ')
    .replace(/\b(elke|iedere|every|alle) (ochtend|morgen|middag|avond|morning|afternoon|evening)(en|s)?\b/g, ' werkdagen $2 ')  // v7.4.1: 'iedere middag'
    .replace(/\bna (school(tijd(en)?)?|de lessen|lestijd)\b/g, ' middag ')  // v7.4.1: 'na schooltijd' is 's middags
    .replace(/\b(de )?rest( van de week)?\b|\b(de )?(andere|overige) dagen\b|\bthe rest( of the week)?\b/g, ' rest ')
    .replace(/\b(de )?(ge)?hele dag(en)?\b|\b(all|full) day\b/g, ' overdag ')
    .replace(/\b(liever niet|liever geen|bij voorkeur niet|rather not|preferably not|misschien|eventueel|zo nodig|indien nodig|if needed|maybe)\b/g, ' lieverniet ')
    .replace(/\b(behalve|uitgezonderd|except|niet op|not on)\b/g, ' behalve ')
    .split(/[,;\n]+/);
}
// v7.4.1 ronde 4: een tijd of tijdvak → het merkwoord 'tijd' met drie cijfers (ochtend tot 12 uur, middag tot 17 uur, avond): een bereik ('8.30-12.00', '9 tot
// 12 uur') = de dagdelen die het overlapt; vanaf of na ('vanaf 13.00 uur') = dat dagdeel en later tot 17 uur (een avond alleen als de tijd zelf 's avonds is);
// tot of voor ('tot 12 uur') = de dagdelen tot die tijd; een losse tijd ('Maandag 8.30') zoals vanaf. Een tijd heeft minuten of 'uur', 'u' of 'h' ('2-3 dagen' niet;
// een kaal bereik als '9-12' alleen tussen 6 en 23 uur). 1 tot 5 uur is 's middags. Niet: '10-12 uur per week' (een aantal uren) en 'niet voor 10 uur' (een
// uitzondering, zie neeToelichting).
var BESCH_TIJD = /\b(vanaf|na|from|after|tot|voor|until|before|till)?\s*\b(\d{1,2})(?:[.:](\d{2}))?\s*(uur|u|h)?\b(?:\s*(-|tot|t\/m|to|until)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(uur|u|h)?\b)?/g;
function tijdMerkwoord(x, voor, h1, m1, u1, tm, h2, m2, u2, plek, s) {
  var uur = function (h, m) { h = Number(h); if (h > 0 && h < 6) h += 12; return h + (Number(m) || 0) / 60; }, a = uur(h1, m1), b = h2 === undefined ? -1 : uur(h2, m2), van, tot;
  if (!(m1 || u1 || m2 || u2) && !(tm === '-' && !voor && Number(h1) >= 6 && Number(h2) > Number(h1) && Number(h2) <= 23)) return x;
  if (a > 24 || b > 24 || /^\s*(per|pw|p\/w|a week)\b/.test(s.slice(plek + x.length)) || /(niet|not|geen)\s*$/.test(s.slice(0, plek))) return x;
  if (b >= 0) { van = a; tot = b; } else if (/^(tot|voor|until|before|till)$/.test(voor || '')) { van = 0; tot = a; } else { van = a; tot = a < 17 ? 17 : 24; }
  var merk = [[0, 12], [12, 17], [17, 24]].map(function (d) { return van < d[1] && tot > d[0] ? '1' : '0'; }).join('');
  return merk === '000' ? x : ' tijd' + merk + ' ';
}
// Woorden van een deelzin met hun soort: dag (ook een groep), deel, bereik, modus (1 of 0), nee (v7.4.1: niet, geen), vul (en, of, op, alleen, ook, getallen) of woord
function beschTokens(zin) {
  var re = /[a-z0-9]+|-/g, m, uit = [];
  while ((m = re.exec(zin))) uit.push(beschSoort(m[0], zin.charAt(m.index + m[0].length)));
  return uit;
}
function beschSoort(w, na) {
  var d = dagVanWoord(w, true), g = dagenVanGroep(w), e = delenVanWoord(w);  // v7.4.1: Engelse korte dagen ('Mon') alleen streng, zoals 'zo' en 'do'
  if (d && !(d.kort && na === "'")) return { soort: 'dag', w: w, dagen: [d.dag], deel: d.deel, strikt: w === 'zo' || w === 'do' || !!d.en, punt: na === '.' };
  if (g) return { soort: 'dag', w: w, dagen: g, deel: -1 };
  if (w === 'rest') return { soort: 'dag', w: w, dagen: [], deel: -1, rest: true };  // v7.4.1: de werkdagen die nog niet genoemd zijn
  if (e) return { soort: 'deel', w: w, delen: e };
  if (w === 'tm' || w === '-') return { soort: 'bereik', w: w };
  if (w === 'lieverniet' || w === 'behalve') return { soort: 'modus', w: w, modus: w === 'lieverniet' ? 1 : 0 };
  if (/^(niet|not|geen|no|bezet|druk|busy|college|colleges|les|lessen|stage|tentamen|tentamens)$/.test(w)) return { soort: 'nee', w: w };  // v7.4.1: ook bezet
  if (w === 'werk') return { soort: 'werk', w: w };  // v7.4.1: 'Ik werk op maandag' (zie beschikbaarheidUitTekst)
  if (/^(en|of|and|or|op|on|alleen|ook|also|nog|s|\d+)$/.test(w)) return { soort: 'vul', w: w };
  return { soort: 'woord', w: w };
}
// 'zo' en 'do' zijn een dag met een punt erachter, naast een dagdeel of bereik, naast een andere dag (eventueel via en/of), of in een deelzin met alleen dagen
function striktOk(tk, i) {
  var t = tk[i], na = tk[i + 1], voor = tk[i - 1], verbind = function (x) { return x && x.soort === 'vul' && /^(en|of|and|or)$/.test(x.w); };
  var buur = function (stap) { var x = tk[i + stap]; return verbind(x) ? tk[i + 2 * stap] : x; }, isDag = function (x) { return x && x.soort === 'dag' && !x.strikt; };
  if (t.punt || (na && (na.soort === 'deel' || na.soort === 'bereik')) || (voor && voor.soort === 'bereik')) return true;
  if (isDag(buur(1)) || isDag(buur(-1))) return true;
  return tk.every(function (x) { return x.soort !== 'woord'; });
}
// v7.4.1: een ontkenning hoort bij een dag: vooraf ('geen woensdag', 'niet in het weekend') of direct erna, met hoogstens drie woordjes ertussen
// ('woensdag niet', 'woensdag kan ik niet'), dus niet in 'maandag en verder weet ik het nog niet'
var BESCH_TUSSEN = ['kan', 'kun', 'ik', 'je', 'helaas', 'echt', 'wil', 'ben', 'is', 'dan', 'ook', 'dus', 'zeker', 'in', 'het', 'de', 'op', 'on', 'the', 'tijdens',
  'heb', 'hebt', 'heeft', 'hebben', 'moet', 'zit'];  // v7.4.1: 'op maandag heb ik college'
// v7.4.1: 'niet in de toetsweek', 'niet tijdens de vakantie', 'niet voor 10 uur' is een uitzondering op die dag, geen nee voor de hele dag
function neeToelichting(tk, i) {
  var k = i + 1;
  if (!/^(niet|not|geen)$/.test(tk[i].w) || !tk[k] || !/^(in|na|voor|tijdens|during|before|after)$/.test(tk[k].w)) return false;
  for (k++; tk[k] && /^(de|het|the|een|a)$/.test(tk[k].w); k++);
  return !!tk[k] && tk[k].soort !== 'dag' && tk[k].soort !== 'deel';
}
function neeVooraf(tk, i) { for (var k = i + 1; k <= i + 3 && k < tk.length; k++) { if (tk[k].soort === 'dag') return true; if (BESCH_TUSSEN.indexOf(tk[k].w) < 0) return false; } return false; }
function neeAchteraf(tk, i) { for (var k = i - 1; k >= i - 4 && k >= 0; k--) { if (tk[k].soort === 'dag') return true; if (tk[k].soort !== 'deel' && BESCH_TUSSEN.indexOf(tk[k].w) < 0) return false; } return false; }
// Achteraf alleen als er na het merkwoord geen dag en geen gewoon woord meer komt ('vrijdag liever niet', niet 'ma en di liever niet te vroeg')
function modusAchteraf(tk, i) { return tk.slice(i + 1).every(function (x) { return x.soort !== 'dag' && (x.soort !== 'woord' || BESCH_TUSSEN.indexOf(x.w) >= 0); }); }
// v7.4.1 ronde 4: een ontkend dagdeel ('geen avonden', "niet 's avonds", 'niet in de ochtend', "behalve 's avonds", 'Ochtenden niet', "'s ochtends heb ik
// college") is 0 voor de dagen van de deelzin (een dag zonder dagdeel = ochtend en middag: 'Maandag niet in de ochtend' = middag); zonder dag in de deelzin
// voor de dagen van de vorige deelzin ('Ma t/m vr, geen avonden'), en zonder dag ervoor voor elke dag ('Ochtenden niet, middagen wel' = middagen)
var BESCH_VUL_DEEL = ['s', 'in', 'de', 'het', 'op', 'the', 'on', 'tijdens', 'during'];
function deelNa(tk, i) { for (var k = i + 1; k <= i + 3 && k < tk.length; k++) { if (tk[k].soort === 'deel') return k; if (BESCH_VUL_DEEL.indexOf(tk[k].w) < 0) return -1; } return -1; }
function deelVoor(tk, i) {
  for (var k = i - 1; k >= i - 4 && k >= 0; k--) { if (tk[k].soort === 'deel') return tk[k].ontkend ? -1 : k; if (BESCH_VUL_DEEL.indexOf(tk[k].w) < 0 && BESCH_TUSSEN.indexOf(tk[k].w) < 0) return -1; }
  return -1;
}
// Eén deelzin in r. staat: { vorige (de dagen van de laatste deelzin met dagen), genoemd (alle dagen tot nu toe), werkBezet, uitgesteld (ontkende dagdelen zonder dag) }
function beschZin(r, tk, staat) {
  tk = tk.map(function (t, i) { return t.strikt && !striktOk(tk, i) ? { soort: 'woord', w: t.w } : t; });
  var modus = 2, groep = [], reeks = 0, delen = [], niet = [], eerst = false, dagenZin = [], ook = false, vanaf = -1;  // eerst: dagdelen vóór de dagen ("'s ochtends op ma en di")
  var nul = function (dagen) { dagen.forEach(function (d) { niet.forEach(function (e) { r[DAGEN_KORT[d]][e] = 0; }); }); };
  // v7.4.1 ronde 5: een dag met dagdeel ('dinsdagavond') staat in de groep met zijn eigen dagdeel (plus de dagdelen die erna komen: 'woensdagmiddag en avond'), zodat
  // een ontkenning erna ook voor hem geldt ('Dinsdagavond niet', 'Maandag t/m donderdag, dinsdagavond niet', 'Woensdagmiddag kan ik niet')
  var zet = function () {
    groep.forEach(function (g) { zetDagdelen(r, g.dag, g.deel >= 0 ? [g.deel].concat(delen.filter(function (e) { return e !== g.deel; })) : delen.length ? delen : null, g.modus); });
    nul(groep.map(function (g) { return g.dag; })); groep = []; reeks = 0; delen = []; niet = []; eerst = false;
  };
  var achteraf = function (m) { groep.slice(reeks).forEach(function (g) { g.modus = m; }); };  // v7.4.1: de laatste reeks dagen ('dagelijks maar woensdag niet': alleen wo)
  tk.forEach(function (t, i) {
    var dn = t.soort === 'nee' || (t.soort === 'modus' && t.modus === 0) ? deelNa(tk, i) : -1, dv;
    if (dn >= 0) tk[dn].ontkend = true;  // v7.4.1 ronde 4: 'geen avonden', "behalve 's avonds"
    else if (t.soort === 'modus') { if (groep.length && modusAchteraf(tk, i)) achteraf(t.modus); else modus = t.modus; }
    else if (t.soort === 'nee' || (t.soort === 'werk' && staat.werkBezet)) {
      if (neeToelichting(tk, i)) { /* uitzondering */ }
      else if (t.soort === 'nee' && (dv = deelVoor(tk, i)) >= 0) { delen = delen.filter(function (e) { return tk[dv].delen.indexOf(e) < 0; }); niet = niet.concat(tk[dv].delen); tk[dv].ontkend = true; }  // 'Ochtenden niet'
      else if (groep.length && neeAchteraf(tk, i)) achteraf(0); else if (neeVooraf(tk, i)) modus = 0;
    }
    else if (t.soort === 'vul') ook = ook || t.w === 'ook' || t.w === 'also';
    else if (t.soort === 'deel' && t.ontkend) niet = niet.concat(t.delen);
    else if (t.soort === 'deel') { eerst = eerst || !groep.length; delen = delen.concat(t.delen); }
    else if (t.soort === 'dag') {
      var dagen = t.rest ? [0, 1, 2, 3, 4].filter(function (d) { return staat.genoemd.indexOf(d) < 0 && dagenZin.indexOf(d) < 0; }) : t.dagen, v = tk[i - 1], verder = v && (v.soort === 'dag' || v.soort === 'bereik' || (v.soort === 'vul' && /^(en|of|and|or)$/.test(v.w)));
      if (v && v.soort === 'bereik' && vanaf >= 0 && dagen.length === 1) dagen = dagenTotEnMet(vanaf, dagen[0]);
      if (delen.length && groep.length && !eerst) zet();
      if (!verder) reeks = groep.length;  // v7.4.1: een nieuwe reeks dagen begint
      dagen.forEach(function (d) { groep.push({ dag: d, modus: modus, deel: t.deel }); });  // 'maandagochtend': deel 0 (v7.4.1 ronde 5: in de groep)
      dagenZin = dagenZin.concat(dagen); vanaf = dagen.length ? dagen[dagen.length - 1] : -1;
    }
    if (t.soort !== 'dag' && t.soort !== 'bereik') vanaf = -1;  // 'ma tot half vijf' is geen bereik
  });
  if (groep.length) zet();
  else if (delen.length) {  // alleen dagdelen: bij de dagen van de deelzin ervoor ('alleen' zonder 'ook' beperkt ze), anders op de werkdagen
    var vorige = staat.vorige;
    (vorige.length ? vorige : [0, 1, 2, 3, 4]).forEach(function (d) { if (vorige.length && modus === 2 && !ook) r[DAGEN_KORT[d]] = [0, 0, 0]; zetDagdelen(r, d, delen, modus); });
    nul(vorige.length ? vorige : [0, 1, 2, 3, 4]);
  }
  else if (niet.length) { if (dagenZin.length || staat.vorige.length) nul(dagenZin.length ? dagenZin : staat.vorige); else staat.uitgesteld = staat.uitgesteld.concat(niet); }  // v7.4.1 ronde 4
  staat.genoemd = staat.genoemd.concat(dagenZin);
  // v7.4.1 ronde 5: deelzinnen met alleen dagen zijn samen één opsomming ('Ma, di en wo, geen ochtenden' en 'Maandag, dinsdag, niet 's middags' gelden voor elke dag)
  var lijst = dagenZin.length > 0 && tk.every(function (x) { return x.soort === 'dag' || x.soort === 'bereik' || (x.soort === 'vul' && x.w !== 'ook' && x.w !== 'also'); });
  if (dagenZin.length) staat.vorige = staat.lijst && lijst ? staat.vorige.concat(dagenZin) : dagenZin;
  staat.lijst = lijst;
}
function dagenTotEnMet(van, tot) { var u = []; if (van === tot) return [tot]; for (var d = (van + 1) % 7; u.length < 7; d = (d + 1) % 7) { u.push(d); if (d === tot) break; } return u; }

/* Verwerken */
// Elke nog niet verwerkte rij wordt een profiel 'aangemeld' (of een notitie bij een bestaand profiel); altijd binnen metLock.
// v7.4.1: zonder toestemming geen profiel (de rij krijgt 'overgeslagen: geen toestemming'); een tabblad zonder toestemmingsvraag wordt niet verwerkt en
// niet gemarkeerd (dan komen de rijen vanzelf aan de beurt zodra de vraag er is), met een fout in het resultaat en hoogstens één melding per dag. Zo ook een
// tabblad met contactgegevens waarvan Athena niet zeker weet of het een aanmeldformulier is ('twijfel'). Talenten wordt één keer per run gelezen.
// v7.4.1 ronde 4: nooit stil zonder toestemming: slaat een run rijen over zonder toestemming (nee of leeg), dan krijgt het talentteam hoogstens één melding per
// dag met het aantal en het antwoord dat het vaakst voorkwam (ronde 5: de runs na die melding tellen op tot de volgende, zie meldZonderToestemming).
// v7.4.1 ronde 5: een onduidelijk antwoord ('Ik heb de privacyverklaring gelezen', '?', 'Akkoord, maar niet bewaren') wordt niet meer overgeslagen maar wacht: de
// rij krijgt 'wacht: geen toestemming herkend (antwoord onduidelijk)' (dat telt als niet verwerkt, dus elke run kijkt opnieuw), de run geeft een fout en het
// talentteam een melding (hoogstens één per dag, meldAanmeldProbleem). Zo komt zo'n rij vanzelf terug na een betere herkenning of een aangepaste cel, ook als er
// per run maar één binnenkomt, en houdt één ja in hetzelfde tabblad niets tegen; de rest van het tabblad wordt gewoon verwerkt (dit vervangt toestemmingTwijfel
// van ronde 4). Ook een rij zonder geldig e-mailadres of telefoonnummer (geenContact) staat in die melding en in de tekst van aanmeldingenRun.
function aanmeldingenVerwerken() {
  var uit = { nieuw: 0, bestaand: 0, mails: [], overgeslagen: { geenToestemming: 0, geenContact: 0, bewaartermijn: 0, onduidelijk: 0 }, fouten: [], overgeslagenTabbladen: [] }, problemen = [], rijProblemen = [], talenten = null, tip = false;
  uit.toestemmingAntwoorden = {};  // v7.4.1 ronde 4: per overgeslagen antwoord (zonder privégegevens) het aantal, voor de melding
  blad('Aanmeldingen');  // het tabblad voor handmatige aanmeldingen bestaat altijd
  var inst = instelling('aanmeldTabbladen');  // v7.4.1 ronde 5: {"aanmelden": [tabblad], "negeren": [tabblad]}
  aanmeldBladen().forEach(function (b) {
    var laatste = b.getLastRow(); if (laatste < 2) return;
    var naam = b.getName(), waarden = b.getRange(1, 1, laatste, Math.max(b.getLastColumn(), 1)).getValues(), kop = waarden[0].map(String);
    var s = aanmeldTabbladSoort(naam, waarden, inst), c = s.c, contact = s.contact, soort = s.soort, n, voor;  // v7.4.1 ronde 6: aanmeldTabbladSoort
    if (s.keuze === 'negeren') return;
    // bijv. een evaluatie door scholen in dezelfde Sheet; v7.4.1 ronde 6: met naam in het resultaat (aanmeldingenRun en controleer tonen het)
    if (!soort) { uit.overgeslagenTabbladen.push(naam); if (contact) Logger.log('Aanmeldingen: tabblad ' + naam + ' is geen aanmeldformulier'); return; }
    if (soort === 'twijfel' || !c.toestemming.length) {
      if ((n = aanmeldWachtend(waarden, c))) {
        var wacht = n + (n === 1 ? ' aanmelding wacht' : ' aanmeldingen wachten');
        var reden = !contact ? 'Athena herkent geen vraag naar e-mail of telefoon' : c.ander ? 'het vraagt ook naar een school of organisatie' : 'geen vraag naar werkzaamheden, beschikbaarheid, telefoon of toestemming';
        if (soort === 'twijfel') tip = true;
        problemen.push(naam + (s.bewaar ? ' lijkt een ander formulier, maar vraagt toestemming om gegevens te bewaren' : soort === 'twijfel' ? ' lijkt geen aanmeldformulier' : ' heeft geen toestemmingsvraag'));
        // v7.4.1 ronde 6: een ander formulier met een toestemmingsvraag over het bewaren van gegevens wacht (niet stil overslaan)
        uit.fouten.push(s.bewaar
          ? 'Tabblad "' + naam + '" is niet verwerkt: het lijkt een ander formulier (het vraagt ook naar bijvoorbeeld een school, training, informatieavond of collega), maar de toestemmingsvraag gaat over het bewaren van gegevens; ' + wacht + '. Zet de naam van het tabblad in de instelling aanmeldTabbladen onder "aanmelden" als het een aanmeldformulier is, of onder "negeren" als het een ander formulier is.'
          : soort === 'twijfel'
          ? 'Tabblad "' + naam + '" is niet verwerkt: het lijkt geen aanmeldformulier (' + reden + '); ' + wacht + '. Is het er wel een, geef de e-mailvraag dan een duidelijke titel ("E-mailadres"), voeg een verplichte toestemmingsvraag toe of zet de naam van het tabblad in de instelling aanmeldTabbladen onder "aanmelden"; is het een ander formulier, zet hem dan onder "negeren".'
          : 'Tabblad "' + naam + '" heeft geen toestemmingsvraag: ' + wacht + '. Voeg aan het formulier een verplichte toestemmingsvraag toe; zonder toestemming maakt Athena geen profiel.');
      }
      return;
    }
    if (!c.verwerkt.length) { c.verwerkt = [kop.length]; b.getRange(1, kop.length + 1).setValue('verwerkt'); kop.push('verwerkt'); }
    if (!c.talentId.length) { c.talentId = [kop.length]; b.getRange(1, kop.length + 1).setValue('talentId'); kop.push('talentId'); }
    if (!talenten) talenten = lees('Talenten');
    voor = { geenContact: uit.overgeslagen.geenContact, onduidelijk: uit.overgeslagen.onduidelijk };
    uit.wachtAntwoorden = {};
    for (var i = 1; i < waarden.length; i++) aanmeldRij(b, i, waarden[i], c, uit, talenten);
    var nc = uit.overgeslagen.geenContact - voor.geenContact, no = uit.overgeslagen.onduidelijk - voor.onduidelijk, meest = aanmeldMeest(uit.wachtAntwoorden);
    if (nc) rijProblemen.push(naam + ': ' + nc + ' zonder geldig e-mailadres of telefoon');  // kort: een melding heeft hoogstens 300 tekens
    if (no) {
      rijProblemen.push(naam + ': ' + no + ' met een onduidelijke toestemming');
      uit.fouten.push('Tabblad "' + naam + '": ' + (no === 1 ? '1 aanmelding wacht' : no + ' aanmeldingen wachten') + ', want Athena herkent het antwoord op de toestemmingsvraag niet als toestemming' +
        (meest ? ' (meest gegeven: "' + meest + '")' : '') + '. Pas de optietekst aan (bijvoorbeeld "Ja, ik geef toestemming …") of zet in de kolom verwerkt "overgeslagen" als het geen toestemming is.');
    }
    vergeet(naam);
  });
  if (problemen.length || rijProblemen.length) meldAanmeldProbleem(problemen.concat(rijProblemen), tip);  // eerst de tabbladen, dan de rijen
  meldZonderToestemming(uit.overgeslagen.geenToestemming, uit.toestemmingAntwoorden);
  delete uit.toestemmingAntwoorden; delete uit.wachtAntwoorden;
  return uit;
}
// Het antwoord dat het vaakst voorkwam in { sleutel: { n, antwoord } }, of ''
function aanmeldMeest(antwoorden) {
  var meest = '', max = 0;
  Object.keys(antwoorden || {}).forEach(function (k) { if (antwoorden[k].n > max) { max = antwoorden[k].n; meest = antwoorden[k].antwoord; } });
  return meest;
}
// Het antwoord dat de toestemming besliste: de eerste ingevulde beslissende kolom die geen ja is (zoals rijToestemming), anders de eerste ingevulde
function toestemmingTekst(r, kolommen) {
  var eerste = '';
  for (var i = 0; i < kolommen.length; i++) {
    var v = r[kolommen[i]], x = v === false ? 'niet aangevinkt' : celTekst(v);
    if (!x || TOESTEMMING_NVT.test(x)) continue;
    if (toestemmingOordeel(v) !== 'ja') return x;
    eerste = eerste || x;
  }
  return eerste;
}
// v7.4.1 ronde 4: hoogstens één melding per dag aan het talentteam over rijen zonder toestemming, met het aantal en het antwoord dat het vaakst voorkwam.
// v7.4.1 ronde 5: de runs na de melding van die dag tellen op in de scripteigenschap AANMELD_GEEN_TOESTEMMING_OPEN; de eerste run van een volgende dag meldt dat
// totaal (ook als die run zelf niets overslaat). Zo blijft bij runs per uur geen overgeslagen rij ongemeld.
function meldZonderToestemming(n, antwoorden) {
  var vandaag = datumStr(new Date()), open = null, sleutels;
  try { open = JSON.parse(P.getProperty('AANMELD_GEEN_TOESTEMMING_OPEN') || '{}'); } catch (e) { open = null; }
  if (!open || typeof open !== 'object') open = {};
  if (!n && !(Number(open.n) > 0)) return;
  open.n = (Number(open.n) || 0) + (n || 0); open.antwoorden = open.antwoorden && typeof open.antwoorden === 'object' ? open.antwoorden : {};
  Object.keys(antwoorden || {}).forEach(function (k) { var a = open.antwoorden[k] = open.antwoorden[k] || { n: 0, antwoord: antwoorden[k].antwoord }; a.n = (Number(a.n) || 0) + antwoorden[k].n; });
  if (P.getProperty('AANMELD_GEEN_TOESTEMMING') === vandaag) {
    sleutels = Object.keys(open.antwoorden).sort(function (a, b) { return open.antwoorden[b].n - open.antwoorden[a].n; });
    sleutels.slice(20).forEach(function (k) { delete open.antwoorden[k]; });  // hoogstens 20 antwoorden bewaren
    P.setProperty('AANMELD_GEEN_TOESTEMMING_OPEN', JSON.stringify(open));
    return;
  }
  var meest = aanmeldMeest(open.antwoorden), m = open.n;
  meld(teamNamen('talent'), (m === 1 ? '1 aanmelding is' : m + ' aanmeldingen zijn') + ' overgeslagen zonder toestemming' + (meest ? ' (meest gegeven antwoord: "' + meest + '")' : '') +
    '. Was het toch een toestemming, pas dan de toestemmingsvraag aan en maak bij die rijen de kolom verwerkt leeg; dan verwerkt Athena ze opnieuw.', '');
  P.setProperty('AANMELD_GEEN_TOESTEMMING', vandaag); P.setProperty('AANMELD_GEEN_TOESTEMMING_OPEN', '{}');
}
// v7.4.1: de antwoordtabbladen: Aanmeldingen, Formulierreacties en Form Responses, en ook een hernoemd antwoordtabblad ('Aanmeldformulier'): elk tabblad dat
// geen tabel van Athena is en waarvan de eerste kop 'Tijdstempel' of 'Timestamp' is (zo begint Google Forms)
function aanmeldBladen() {
  return sheet().getSheets().filter(function (b) {
    var n = b.getName();
    if (/^(Aanmeld|Formulierreacties|Formulierantwoorden|Form Responses)/i.test(n)) return true;
    if (uitMap(TABELLEN, n) || b.getLastRow() < 2) return false;
    return /^(tijdstempel|timestamp)$/i.test(String(b.getRange(1, 1, 1, 1).getValues()[0][0]).trim());
  });
}
// v7.4.1: al verwerkt = een vinkje of datum in 'verwerkt', of een talentId (ook als iemand de kolom 'verwerkt' leegmaakte)
function aanmeldAlVerwerkt(r, c) { return !!((c.verwerkt.length && celVerwerkt(r[c.verwerkt[0]])) || (c.talentId.length && celIngevuld(r[c.talentId[0]]))); }
// E-mail en telefoon van een rij: per rij de eerste geldige; een contactvraag ('Hoe kunnen we je bereiken?') telt voor allebei
function aanmeldContact(r, c) { return { email: aanmeldEerste(r, c.email.concat(c.contact), emailUitCel), tel: aanmeldEerste(r, c.telefoon.concat(c.contact), telefoonUitCel) }; }
// v7.4.1 ronde 5: zonder herkende contactkolom telt elke ingevulde rij die nog niet verwerkt is
function aanmeldWachtend(waarden, c) {
  var zonderKolom = !c.email.length && !c.telefoon.length && !c.contact.length;
  return waarden.slice(1).filter(function (r) { if (aanmeldAlVerwerkt(r, c) || !r.some(celIngevuld)) return false; var k = aanmeldContact(r, c); return zonderKolom || k.email || k.tel; }).length;
}
// v7.4.1: hoogstens één melding per dag aan het talentteam (scripteigenschap met de datum, zoals VOG_RUN_), voor alle tabbladen die wachten samen.
// v7.4.1 ronde 6: tip = een tabblad wacht omdat Athena twijfelt of het een aanmeldformulier is; dan noemt de melding de instelling aanmeldTabbladen. Past de
// lijst niet, dan alleen de eerste punten met '(en n meer)', zodat het begin (de tabbladnaam) en het slot (de tip) binnen de 300 tekens van een melding blijven.
function meldAanmeldProbleem(problemen, tip) {
  var vandaag = datumStr(new Date()), begin = 'Aanmeldingen wachten: ', lijst = problemen.join('; '), k;
  var slot = tip ? '. Controleer het formulier, of zet het tabblad in de instelling aanmeldTabbladen onder "aanmelden" of "negeren"; daarna verwerkt Athena ze vanzelf.'
    : '. Controleer het formulier; daarna verwerkt Athena ze vanzelf.';
  if (P.getProperty('AANMELD_ZONDER_TOESTEMMING') === vandaag) return;
  for (k = problemen.length - 1; k > 0 && begin.length + lijst.length + slot.length > 300; k--) lijst = problemen.slice(0, k).join('; ') + ' (en ' + (problemen.length - k) + ' meer)';
  if (begin.length + lijst.length + slot.length > 300) lijst = lijst.slice(0, 300 - begin.length - slot.length - 1) + '…';
  meld(teamNamen('talent'), begin + lijst + slot, '');  // v7.4.1 ronde 5: kort (300 tekens)
  P.setProperty('AANMELD_ZONDER_TOESTEMMING', vandaag);
}
// v7.4.1: in een kolom 'verwerkt' met selectievakjes zet Athena een vinkje, anders de datum-tijd of 'overgeslagen: …'
function aanmeldMarkeer(b, i, r, c, tekst) { b.getRange(i + 1, c.verwerkt[0] + 1).setValue(typeof r[c.verwerkt[0]] === 'boolean' ? true : tekst); }
function aanmeldRij(b, i, r, c, uit, talenten) {
  if (aanmeldAlVerwerkt(r, c)) return;
  if (!r.some(celIngevuld)) return;  // lege rij (ook met alleen lege selectievakjes)
  var k = aanmeldContact(r, c), dag = aanmeldDag(c.tijdstempel.length ? r[c.tijdstempel[0]] : ''), naam = aanmeldRijNaam(r, c), bestaand = aanmeldBestaand(talenten, k.email, k.tel, naam), toest, p, t, dubbel;
  // v7.4.1: oude antwoorden (bij de eerste koppeling) waarvan de bewaartermijn al voorbij is: geen profiel en geen welkomstmail
  if (bewarenTotVan(dag) < datumStr(new Date())) { uit.overgeslagen.bewaartermijn++; aanmeldMarkeer(b, i, r, c, 'overgeslagen: bewaartermijn verstreken'); return; }
  if ((toest = rijToestemming(r, c.toestemming)) !== 'ja') {
    var antw = vrijeTekst(toestemmingTekst(r, c.toestemming)) || '(leeg)', sl = aanmeldWoorden(antw) || 'leeg', kv = c.verwerkt[0];
    if (toest === 'onduidelijk') {  // v7.4.1 ronde 5: wacht (niet verwerkt), met een fout en een melding; een selectievakje blijft leeg
      uit.overgeslagen.onduidelijk++;
      if (uit.wachtAntwoorden) { uit.wachtAntwoorden[sl] = uit.wachtAntwoorden[sl] || { n: 0, antwoord: antw }; uit.wachtAntwoorden[sl].n++; }
      if (typeof r[kv] !== 'boolean' && celTekst(r[kv]) !== AANMELD_WACHT) b.getRange(i + 1, kv + 1).setValue(AANMELD_WACHT);
      return;
    }
    uit.overgeslagen.geenToestemming++;
    if (uit.toestemmingAntwoorden) { uit.toestemmingAntwoorden[sl] = uit.toestemmingAntwoorden[sl] || { n: 0, antwoord: antw }; uit.toestemmingAntwoorden[sl].n++; }
    aanmeldMarkeer(b, i, r, c, 'overgeslagen: geen toestemming');
    if (bestaand && toest === 'nee') aanmeldIntrekking(bestaand);  // v7.4.1 ronde 4: alleen bij een duidelijk nee, niet bij leeg of onduidelijk
    return;
  }
  if (!k.email && !k.tel) { uit.overgeslagen.geenContact++; return; }  // niet gemarkeerd: wie het adres later in de Sheet aanvult, wordt alsnog verwerkt
  p = aanmeldProfiel(r, c, k, dag, naam);
  // v7.4.1 ronde 5: zelfde telefoonnummer (een van beide zonder e-mail) maar een andere naam: een nieuw profiel en een melding 'mogelijk dubbel'
  if (!bestaand && k.tel) dubbel = talenten.filter(function (x) { return x.status !== 'uitgeschreven' && telefoonIn(x.telefoon) === k.tel && (!k.email || !x.email); })[0];
  if (bestaand) { uit.bestaand++; aanmeldOpnieuw(bestaand, p); t = bestaand; }
  else { t = aanmeldNieuw(p, uit); talenten.push(t); }
  if (dubbel) meld(teamNamen('talent'), talentNaam(t) + ' heeft hetzelfde telefoonnummer als ' + talentNaam(dubbel) + ': mogelijk dubbel. Controleer de twee profielen.', 'talent:' + t.id);
  aanmeldMarkeer(b, i, r, c, nu()); b.getRange(i + 1, c.talentId[0] + 1).setValue(t.id);
}
// v7.4.1: op telefoon alleen ontdubbelen als een van beide geen e-mailadres heeft (broer en zus met het nummer van hun ouders zijn twee talenten).
// v7.4.1 ronde 5: en alleen als ook de voornaam gelijk is (en de achternaam, als beide er een hebben): een broer zonder e-mail en een zus met het vaste nummer
// thuis zijn twee talenten
function aanmeldBestaand(talenten, email, tel, naam) {
  if (!email && !tel) return null;
  var gelijk = function (a, b) { return klein(zonderAccenten(schoneNaam(a))) === klein(zonderAccenten(schoneNaam(b))); };
  var zelfde = function (t) { return !naam || !naam.voornaam || !t.voornaam || (gelijk(t.voornaam, naam.voornaam) && (!naam.achternaam || !t.achternaam || gelijk(t.achternaam, naam.achternaam))); };
  return talenten.filter(function (t) { return t.status !== 'uitgeschreven' && ((email && klein(t.email) === email) || (tel && telefoonIn(t.telefoon) === tel && (!email || !t.email) && zelfde(t))); })[0] || null;
}
// De naam van een rij (voornaam, tussenvoegsel, achternaam of één naamkolom; zie aanmeldNaam)
function aanmeldRijNaam(r, c) { var tekst = function (veld) { return aanmeldEerste(r, c[veld], celTekst); }; return aanmeldNaam(tekst('voornaam'), tekst('tussenvoegsel'), tekst('achternaam'), tekst('naam')); }
// De velden van een profiel uit een rij, met wat Athena niet herkende (zonder privégegevens, vrijeTekst) en de antwoorden op toestemmingsvragen voor een
// ander doel die geen ja zijn
function aanmeldProfiel(r, c, k, dag, naam) {
  var tekst = function (veld) { return aanmeldEerste(r, c[veld], celTekst); };
  naam = naam || aanmeldRijNaam(r, c);
  var fun = aanmeldLijst(r, c.functies, functiesUitDeel, keuzelijst('talentFuncties')), sec = aanmeldLijst(r, c.sector, sectorenUitDeel, keuzelijst('sectoren'));
  var pcRuw = tekst('postcode'), pc = postcodeUitCel(pcRuw), woonplaats = schoneNaam(tekst('woonplaats')), niet = [], rasterNiet = [], ander = [];
  var beschikbaarheid = aanmeldBeschikbaarheid(r, c, rasterNiet), toest = aanmeldEerste(r, c.toestemming, function (v) { var x = celTekst(v); return TOESTEMMING_NVT.test(x) ? '' : x; });
  if (!pc && pcRuw) niet.push('postcode ' + vrijeTekst(pcRuw.slice(0, 20)));  // v7.4.1: alleen een geldige postcode in het profiel
  if (!woonplaats && pc && !c.woonplaats.length) woonplaats = plaatsNaPostcode(pc.rest);  // v7.4.1: één vraag 'Postcode en woonplaats'
  // v7.4.1 ronde 4: een ingevuld e-mailveld zonder geldig adres ('renée.bakker@…'): leeg, en 'Niet herkend: e-mail' (zonder het adres)
  if (!k.email && c.email.some(function (j) { return celTekst(r[j]).indexOf('@') >= 0; })) niet.push('e-mail');
  // v7.4.1 ronde 4 (AVG): elke vrije tekst door hetzelfde filter (vrijeTekst: hoogstens 60 tekens per onderdeel, nooit gezondheid, religie of strafrecht)
  if (fun.niet.length) niet.push('functies ' + fun.niet.map(vrijeTekst).join('; '));
  if (sec.niet.length) niet.push('sector ' + sec.niet.map(vrijeTekst).join('; '));
  if (rasterNiet.length) niet.push('beschikbaarheid ' + rasterNiet.map(vrijeTekst).join('; '));
  c.toestemmingAnder.forEach(function (j) { var x = celTekst(r[j]); if (x && !TOESTEMMING_NVT.test(x) && toestemmingOordeel(r[j]) !== 'ja') ander.push(vrijeTekst(aanmeldKopDelen(c.kop[j]).kern) + ': ' + vrijeTekst(x)); });
  return { dag: dag, niet: niet, ander: ander, toestemming: vrijeTekst(toest),
    velden: { voornaam: naam.voornaam, achternaam: naam.achternaam, email: k.email, telefoon: k.tel, postcode: pc ? pc.postcode : '', woonplaats: woonplaats, functies: fun.codes, sectoren: sec.codes, beschikbaarheid: beschikbaarheid } };
}
// De tekst van de notitie: eventueel een eerste regel, dan 'Niet herkend: …' (niets gaat stil verloren: 'Andere: bijles') en 'Andere toestemming: …'
function aanmeldNotitie(p, eerst) {
  var regels = (eerst ? [eerst] : []).concat(p.niet.length ? ['Niet herkend: ' + p.niet.join(' · ')] : [], p.ander.length ? ['Andere toestemming: ' + p.ander.join(' · ')] : []);
  return regels.length ? tekstIn(regels.join('\n')).slice(0, 500) : '';
}
function aanmeldNieuw(p, uit) {
  var v = p.velden, tk = portaalTokenVoor({});
  var t = schrijf('Talenten', { voornaam: v.voornaam, achternaam: v.achternaam, email: v.email, telefoon: v.telefoon, postcode: v.postcode, woonplaats: v.woonplaats, functies: v.functies, sectoren: v.sectoren,
    beschikbaarheid: v.beschikbaarheid, status: 'aangemeld', statusSinds: nu(), bron: 'website', toestemmingDatum: p.dag, toestemmingGrondslag: 'toestemming', bewarenTot: bewarenTotVan(p.dag),
    portaalToken: tk.token, portaalTokenTot: tk.tot, door: 'Formulier', aangemaakt: nu(), laatsteContact: p.dag });
  schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: 'Formulier', talentId: t.id, bron: 'formulier', aangemaakt: nu(),
    onderwerp: 'Aangemeld via het formulier' + (p.toestemming ? ' (toestemming: ' + p.toestemming + ')' : ''), tekst: aanmeldNotitie(p) });
  meld(teamNamen('talent'), 'Nieuwe aanmelding: ' + talentNaam(t) + (lijstUit(t.functies).length ? ' (' + lijstUit(t.functies).join(', ') + ')' : ''), 'talent:' + t.id);
  if (v.email) uit.mails.push({ t: t, token: tk.token });
  uit.nieuw++;
  return t;
}
// v7.4.1: een bekend talent meldt zich opnieuw aan: het profiel blijft zoals het is, de antwoorden die afwijken staan in de notitie
function aanmeldOpnieuw(t, p) {
  var v = p.velden, anders = [], lijst = function (x) { return lijstUit(x).slice().sort().join(', '); };
  if (v.telefoon && telefoonIn(t.telefoon) !== v.telefoon) anders.push('telefoon ' + v.telefoon);
  if (v.email && klein(t.email) !== v.email) anders.push('e-mail ' + v.email);
  if (v.postcode && String(t.postcode || '') !== v.postcode) anders.push('postcode ' + v.postcode);
  if (v.woonplaats && klein(t.woonplaats) !== klein(v.woonplaats)) anders.push('woonplaats ' + v.woonplaats);
  if (v.functies.length && lijst(v.functies) !== lijst(t.functies)) anders.push('functies ' + lijst(v.functies));
  if (v.sectoren.length && lijst(v.sectoren) !== lijst(t.sectoren)) anders.push('sectoren ' + lijst(v.sectoren));
  if (rasterGevuld(v.beschikbaarheid) && JSON.stringify(v.beschikbaarheid) !== JSON.stringify(beschikbaarheidUit(t.beschikbaarheid)))
    anders.push('beschikbaarheid ' + DAGEN_KORT.filter(function (d) { return v.beschikbaarheid[d].indexOf(2) >= 0; }).join(', '));
  // v7.4.1 ronde 4: de nieuwe toestemming telt (aanmeldOpnieuw komt alleen na een ja): toestemmingDatum, grondslag en bewarenTot vanaf de dag van deze aanmelding,
  // anders anonimiseert bewaartermijnRun een profiel dat net opnieuw toestemming gaf. Nooit terug in de tijd (een oudere rij) en nooit korter.
  var wijzig = {}, tot = bewarenTotVan(p.dag), eerst = [];
  if (!t.toestemmingDatum || String(t.toestemmingDatum).slice(0, 10) <= p.dag) {
    wijzig.toestemmingDatum = p.dag; wijzig.toestemmingGrondslag = 'toestemming';
    if (!t.bewarenTot || String(t.bewarenTot).slice(0, 10) < tot) wijzig.bewarenTot = tot;
    eerst.push('Toestemming vernieuwd op ' + p.dag + (wijzig.bewarenTot ? '; bewaren tot ' + tot : '') + '.');
  }
  if (anders.length) eerst.push('Nieuw in het formulier (profiel niet aangepast): ' + anders.join(' · '));
  schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: 'Formulier', talentId: t.id, bron: 'formulier', aangemaakt: nu(), onderwerp: 'Opnieuw aangemeld via het formulier',
    tekst: aanmeldNotitie(p, eerst.join('\n')) });
  meld(teamNamen('talent'), talentNaam(t) + ' heeft zich opnieuw aangemeld via het formulier.', 'talent:' + t.id);
  if (t.status === 'slapend') { wijzig.status = 'actief'; wijzig.statusSinds = nu(); wijzig.laatsteContact = datumStr(new Date()); }
  if (Object.keys(wijzig).length) { wijzig.id = t.id; schrijf('Talenten', wijzig); Object.keys(wijzig).forEach(function (x) { t[x] = wijzig[x]; }); }
}
// v7.4.1 (AVG): een bekend talent vult het formulier in zonder toestemming: mogelijk een intrekking. Een notitie bij het profiel en een melding aan het
// talentteam; Athena verwijdert zelf niets (anonimiseren blijft een handeling van het management)
function aanmeldIntrekking(t) {
  schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: 'Formulier', talentId: t.id, bron: 'formulier', aangemaakt: nu(), onderwerp: 'Formulier ingevuld zonder toestemming',
    tekst: 'Trekt mogelijk de toestemming in. Neem contact op en laat het profiel zo nodig anonimiseren.' });
  meld(teamNamen('talent'), talentNaam(t) + ' vulde het formulier in zonder toestemming en trekt die mogelijk in. Controleer het profiel.', 'talent:' + t.id);
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
  var tarief = centen(t.tarief), u = {}, dezeWeek = isoWeekStr(new Date()); if (!tarief) return u;
  uren.forEach(function (r) { if (String(r.week) > dezeWeek) return; var m = maandVan(maandagVanWeek(r.week)); if (m) u[m] = (u[m] || 0) + Math.round((Number(r.uren) || 0) * tarief); });  // v7.4: geleverd is gewerkt: geen weken in de toekomst (een urenimport van vóór v7.4 telde geplande diensten mee)
  return u;
}
// v7.9 (punt 17): de ene definitie van "nog te factureren" per project, in centen: de contractwaarde uit de prognose − de som van de verzonden termijnen
// (creditnota's verrekend; negatief = meerwerk). Alleen Trajecten en Facturen, geen uren (Home rekent hem zonder Financiën te lezen, R9).
function gefactureerdVan(termijnen) { var c = 0; termijnen.forEach(function (f) { if (verzondenVan(f)) c += centen(f.bedrag); }); return c; }
function nogTeFacturerenVan(t, termijnen, p) { return (p || prognoseVan(t, termijnen)).contract - gefactureerdVan(termijnen); }
// v7.9 (punt 17): de contractwaarde van een schooljaar: contractwaarde, anders omzet, van de projecten die niet gestopt, offerte of onduidelijk zijn (Home, Vandaag, bedrijfsdoelen)
function contractwaardeSchooljaar(ts, sj) {
  return ts.filter(function (t) { return t.schooljaar === sj && ['gestopt', 'offerte', 'onduidelijk'].indexOf(t.status) < 0; })
    .reduce(function (s, t) { return s + (Number(t.contractwaarde) || Number(t.omzet) || 0); }, 0);
}
function leegReeks() { var r = {}; FIN_REEKSEN.concat(['prognoseToen']).forEach(function (k) { r[k] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }); return r; }
function telBij(doel, bron) { Object.keys(bron).forEach(function (k) { if (doel[k]) for (var i = 0; i < 12; i++) doel[k][i] += bron[k][i]; }); }

// Het hele financiële beeld van één project (alle schooljaren), los van rechten; apiFinancien en het bevriezen gebruiken het
function financienProject(t, termijnen, uren, termijnDagen) {
  var p = prognoseVan(t, termijnen), nogTe = nogTeFacturerenVan(t, termijnen, p), uit = { prognose: {}, prognoseKas: {}, gefactureerd: {}, ontvangen: {}, geleverd: geleverdVan(t, uren) };
  var bij = function (reeks, datum, bedrag) { var m = maandVan(datum); if (m) uit[reeks][m] = (uit[reeks][m] || 0) + bedrag; };
  p.posten.forEach(function (x) { bij('prognose', x.datum, x.bedrag); bij('prognoseKas', plusDagenVan(x.datum, termijnDagen), x.bedrag); });
  var gef = 0, ontv = 0, geschat = false, ouderdom = { '0-30': 0, '31-60': 0, '60+': 0 }, betaaltijden = [], vandaag = datumStr(new Date());
  termijnen.forEach(function (f) {
    var v = verzondenVan(f), b = betaaldVan(f), bedrag = centen(f.bedrag);
    if (v) { gef += bedrag; bij('gefactureerd', v.datum, bedrag); geschat = geschat || v.geschat; }
    if (b) { ontv += bedrag; bij('ontvangen', b.datum, bedrag); geschat = geschat || b.geschat; if (v && !b.geschat && !v.geschat) { var dt = dagenTussen(v.datum, b.datum); if (dt !== null && dt >= 0) betaaltijden.push(dt); } }
    if (v && !b) { var oud = dagenTussen(v.datum, vandaag) || 0; ouderdom[oud <= 30 ? '0-30' : oud <= 60 ? '31-60' : '60+'] += bedrag; }
  });
  return { per: uit, contract: p.contract, ongepland: p.ongepland, signalen: p.signalen, bron: p.bron, gefactureerd: gef, ontvangen: ontv, nogTeFactureren: nogTe, openstaand: gef - ontv,  // v7.9: nogTeFacturerenVan
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
    ['contract', 'gefactureerd', 'ontvangen', 'openstaand'].forEach(function (k) { s[k] += F[k]; tot[k] += F[k]; });
    var nogTe = Math.max(0, F.nogTeFactureren); s.nogTeFactureren += nogTe; tot.nogTeFactureren += nogTe;  // v7.7 (R10): per project blijft de ruwe waarde (negatief = meerwerk); in de school- en totaalsom telt meerwerk niet als 'nog te factureren'
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
// Kolomnamen instelbaar (Instellingen exactKolommen), want het formaat van de export verschilt per administratie.
// v7.4: getoetst aan de echte facturatie-export (Datum; Factuurnummer; Betreft; …; Debiteur; Debiteurnummer; …; Totaal; Leeftijd; Open; …): die wordt zonder
// toewijzing herkend. Zonder betaaldatum geldt Open = 0 als betaald (datum = peildatum), behalve bij een gecrediteerde factuur. Een creditnota
// (negatief bedrag) koppelt aan de factuur van dezelfde debiteur met hetzelfde bedrag tot 60 dagen eerder; bij toepassen gaat die termijn terug naar
// de eerste status. Het rapport Openstaande posten (één regel per relatie) wordt herkend en geweigerd. Uitleg voor de boekhouder: backend/README.md.
var EXACT_ANDERE_NAMEN = { factuurnummer: ['Factuurnummer', 'Factuurnr', 'Factuurnr.'], datum: ['Factuurdatum', 'Datum'], bedrag: ['Bedrag', 'Totaal', 'Totaalbedrag'], betaald: ['Betaaldatum', 'Datum betaald'],
  open: ['Open', 'Openstaand', 'Openstaand bedrag'], debiteur: ['Debiteur', 'Debiteurnaam', 'Relatie', 'Klant'], debiteurNummer: ['Debiteurnummer', 'Debiteurnr', 'Relatiecode'], omschrijving: ['Betreft', 'Omschrijving'] };  // v7.4: in deze volgorde na de ingestelde naam
var EXACT_VERPLICHT = ['factuurnummer', 'datum', 'bedrag'], EXACT_CREDIT_DAGEN = 60;
function exactKolommen() { var k = instelling('exactKolommen'), u = {}; Object.keys(EXACT_KOLOMMEN).forEach(function (x) { var v = k && typeof k === 'object' ? uitMap(k, x) : undefined; u[x] = (typeof v === 'string' && v) || EXACT_KOLOMMEN[x]; }); return u; }
function bedragIn(s) {
  s = String(s == null ? '' : s).replace(/[€\s]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');  // v7.4: 1.950 is duizend negenhonderdvijftig, niet 1,95
  else s = s.replace(/,/g, '');
  var n = Number(s); return isFinite(n) ? Math.round(n * 100) : null;
}
function datumUitExport(s) { return exportDag(s); }  // v7.4: dezelfde datumlezer als de urenimport (ook d.m.jjjj en een Excel-datumgetal)
// v7.4: het Exact-rapport Openstaande posten: kopregels ('Administratie: …', 'Openstaande posten …') en de kolommen 'Code + Naam' en 'Openstaand'
function isOpenstaandePosten(tekst) {
  var kop = String(tekst).split(/\r?\n/).slice(0, 15).map(function (l) { return klein(l.replace(/"/g, '')); });
  var codeNaam = kop.some(function (l) { return /(^|[;,\t])\s*code \+ naam\s*([;,\t]|$)/.test(l) && /openstaand/.test(l); });
  return codeNaam || (kop.some(function (l) { return /openstaande posten/.test(l); }) && kop.some(function (l) { return /^\s*administratie\s*:/.test(l); }));
}
function zelfdeDebiteur(a, b) {
  if (a.debiteurNummer && b.debiteurNummer && klein(a.debiteurNummer) === klein(b.debiteurNummer)) return true;
  return !!(a.debiteur && b.debiteur && naamSleutel(a.debiteur) === naamSleutel(b.debiteur));
}
function nrSleutel(n) { return String(n == null ? '' : n).trim().replace(/^0+(?=\d)/, '').toLowerCase(); }  // v7.7 (R9): één normalisatie van een factuurnummer ('000123' = 123 = '123')
function apiExactImport(tekst, opties) {
  alleenBeheerder(); opties = opties && typeof opties === 'object' ? opties : {};
  var nk = function (n) { return 'n' + nrSleutel(n); };  // v7.7 (R9): dezelfde sleutel aan beide kanten (exact-index, gezien, aanmaken)
  tekst = String(tekst || '').replace(/^﻿/, ''); if (!tekst.trim()) throw new Error('Het bestand is leeg.');
  if (tekst.length > 3 * 1024 * 1024) throw new Error('Het bestand is groter dan 3 MB; exporteer een kortere periode.');
  if (isOpenstaandePosten(tekst)) throw new Error('Dit is het Exact-rapport Openstaande posten: dat heeft één regel per relatie. Voor de afstemming is een export per factuur nodig met factuurnummer, factuurdatum, bedrag en betaaldatum, als csv met de kolomnamen op de eerste regel.');
  var peilIn = opties.peildatum === undefined || opties.peildatum === null ? '' : String(opties.peildatum).trim();
  if (peilIn && !/^\d{4}-\d{2}-\d{2}$/.test(peilIn)) throw new Error('Ongeldige peildatum; gebruik jjjj-mm-dd.');
  var peil = datumIn(peilIn) || datumStr(new Date());
  // kolommen: een opgegeven naam gaat voor (en moet bestaan); anders de ingestelde naam, de standaardnaam of een bekende andere naam
  var opgeslagen = instelling('exactKolommen'); if (!opgeslagen || typeof opgeslagen !== 'object') opgeslagen = {};
  var expliciet = {}; if (opties.kolommen && typeof opties.kolommen === 'object') Object.keys(EXACT_ANDERE_NAMEN).forEach(function (x) { var v = uitMap(opties.kolommen, x); if (v !== undefined && v !== null && typeof v !== 'object' && String(v).trim()) expliciet[x] = String(v).trim(); });
  var rijen = Utilities.parseCsv(tekst, (tekst.split('\n')[0] || '').indexOf(';') >= 0 ? ';' : ','), kop = (rijen[0] || []).map(function (h) { return String(h).trim(); }), kk = kop.map(klein);
  var idx = {}, kol = {}, gevonden = {}, meldingen = [];
  Object.keys(EXACT_ANDERE_NAMEN).forEach(function (x) {
    idx[x] = -1;
    if (expliciet[x]) { kol[x] = expliciet[x]; idx[x] = kk.indexOf(klein(expliciet[x])); if (idx[x] < 0 && EXACT_VERPLICHT.indexOf(x) < 0) meldingen.push('Kolom ' + expliciet[x] + ' niet gevonden; overgeslagen.'); }
    else {
      var namen = [uitMap(opgeslagen, x), uitMap(EXACT_KOLOMMEN, x)].concat(EXACT_ANDERE_NAMEN[x]).filter(function (n) { return typeof n === 'string' && n.trim(); });
      kol[x] = namen[0] || '';
      for (var i = 0; i < namen.length && idx[x] < 0; i++) { var j = kk.indexOf(klein(namen[i])); if (j >= 0) { idx[x] = j; kol[x] = kop[j]; } }
    }
    if (idx[x] >= 0) gevonden[x] = kop[idx[x]];
  });
  var mist = EXACT_VERPLICHT.filter(function (x) { return idx[x] < 0; });
  if (mist.length) throw new Error('Kolom niet gevonden: ' + mist.map(function (x) { return kol[x]; }).join(', ') + '. Kolommen in het bestand: ' + kop.join(', ') + '. Pas de kolomnamen aan.');
  var exact = {}, nummers = [], datums = [];
  rijen.slice(1).forEach(function (r) {
    var cel = function (x) { return idx[x] >= 0 ? String(r[idx[x]] == null ? '' : r[idx[x]]).trim() : ''; }, nr = cel('factuurnummer'); if (!nr) return;
    var x = { nummer: nr, datum: datumUitExport(cel('datum')), bedrag: bedragIn(cel('bedrag')), betaald: idx.betaald >= 0 ? datumUitExport(cel('betaald')) : '', open: cel('open') !== '' ? bedragIn(cel('open')) : null,
      debiteur: cel('debiteur'), debiteurNummer: cel('debiteurNummer'), omschrijving: cel('omschrijving') }, e = exact[nk(nr)];  // v7.7: omschrijving voor een aan te maken termijn
    if (e) { e.bedrag = (e.bedrag || 0) + (x.bedrag || 0); if (x.betaald > e.betaald) e.betaald = x.betaald; if (x.open !== null) e.open = (e.open || 0) + x.open; }  // meerdere regels per factuur: optellen
    else { exact[nk(nr)] = x; nummers.push(x); }
    if (x.datum) datums.push(x.datum);
  });
  // v7.4: creditnota's → het origineel bij dezelfde debiteur, zelfde bedrag, factuurdatum tot 60 dagen eerder (de meest recente); elk origineel één keer.
  // ⚠️ Bij gelijke kandidaten gaat een factuur met Open 0 voor (een gecrediteerde factuur staat op 0) en dan een lager factuurnummer dan de creditnota
  // (nummers lopen door): zo wint niet de gecorrigeerde factuur die op dezelfde dag als de creditnota is gemaakt.
  var gecrediteerd = {}, origineelVan = {};
  nummers.filter(function (c) { return c.bedrag !== null && c.bedrag < 0; }).sort(function (a, b) { return String(a.datum).localeCompare(String(b.datum)) || a.nummer.localeCompare(b.nummer); }).forEach(function (c) {
    if (!c.datum) return;
    var na = function (x) { var a = Number(x.nummer), b = Number(c.nummer); return isFinite(a) && isFinite(b) && a > b ? 1 : 0; }, open = function (x) { return x.open === 0 ? 0 : 1; };
    var vanaf = plusDagenVan(c.datum, -EXACT_CREDIT_DAGEN), o = nummers.filter(function (x) { return x !== c && x.bedrag === -c.bedrag && !gecrediteerd[nk(x.nummer)] && x.datum && x.datum <= c.datum && x.datum >= vanaf && zelfdeDebiteur(x, c); })
      .sort(function (a, b) { return (open(a) - open(b)) || (na(a) - na(b)) || b.datum.localeCompare(a.datum) || b.nummer.localeCompare(a.nummer); })[0];
    if (o) { gecrediteerd[nk(o.nummer)] = c; origineelVan[nk(c.nummer)] = o; }
  });
  datums.sort();
  var van = datums[0] || '', tot = datums[datums.length - 1] || '', tMap = perId(lees('Trajecten')), gezien = {}, waarVan = {}, eersteStatus = keuzelijst('factuurStatussen')[0], openAlsBetaald = idx.open >= 0 && idx.betaald < 0, volgensOpen = 0;
  var uit = { gekoppeld: 0, bijgewerkt: [], afwijkend: [], alleenExact: [], alleenAthena: [], betaald: [], deelsBetaald: [], creditnotas: [], meldingen: meldingen, van: van, tot: tot, kolommen: gevonden, peildatum: peil, toegepast: !!opties.toepassen };
  var wijz = [], credits = [];
  lees('Facturen').forEach(function (f) {
    var nr = String(f.factuurnummer || '').trim(), t = tMap[f.trajectId] || {}, waar = (t.school || '') + ' · ' + (t.traject || '') + ' · ' + (f.omschrijving || '');
    if (!nr) return;
    var x = exact[nk(nr)];
    if (!x) { var v = verzondenVan(f); if (v && (!van || (v.datum >= van && v.datum <= tot))) uit.alleenAthena.push({ nummer: nr, waar: waar, bedrag: centen(f.bedrag) }); return; }
    gezien[nk(nr)] = 1; waarVan[nk(nr)] = waar; uit.gekoppeld++;
    var c = gecrediteerd[nk(nr)];
    if (c) {  // v7.4: gecrediteerd: terug naar de eerste status, zonder factuurnummer en datums; beide nummers komen op de tijdlijn van het project
      wijz.push({ id: f.id, status: eersteStatus, factuurnummer: '', verzonden: '', betaald: '' }); credits.push({ f: f, t: t, origineel: nr, credit: c });
      uit.bijgewerkt.push({ nummer: nr, waar: waar, wat: 'gecrediteerd met ' + c.nummer + ': terug naar ' + eersteStatus + ', zonder factuurnummer' });
      return;
    }
    if (x.bedrag !== null && x.bedrag !== centen(f.bedrag)) uit.afwijkend.push({ nummer: nr, waar: waar, athena: centen(f.bedrag), exact: x.bedrag });
    var nieuw = { id: f.id }, veranderd = [], betaaldOp = x.betaald, doorOpen = false;
    if (!betaaldOp && openAlsBetaald && x.open === 0 && x.bedrag > 0) { doorOpen = true; if (f.status !== 'betaald' && !f.betaald) betaaldOp = peil; }  // ⚠️ v7.4: geen betaaldatum in de export: Open 0 = betaald op de peildatum
    if (x.datum && datumIn(f.verzonden) !== x.datum) { nieuw.verzonden = x.datum; veranderd.push('verzonden ' + x.datum); }
    if (betaaldOp && datumIn(f.betaald) !== betaaldOp) {
      nieuw.betaald = betaaldOp; veranderd.push('betaald ' + betaaldOp + (doorOpen ? ' (volgens openstaand bedrag; datum = peildatum)' : ''));
      uit.betaald.push({ nummer: nr, waar: waar, datum: betaaldOp, bedrag: x.bedrag, bron: doorOpen ? 'open' : 'betaaldatum' }); if (doorOpen) volgensOpen++;
    }
    var status = betaaldOp || doorOpen ? 'betaald' : (['nog te doen', 'aangemaakt'].indexOf(f.status) >= 0 ? 'verzonden' : f.status);
    if (status !== f.status) { nieuw.status = status; veranderd.push('status ' + status); }
    if (veranderd.length) { wijz.push(nieuw); uit.bijgewerkt.push({ nummer: nr, waar: waar, wat: veranderd.join(', ') }); }
  });
  nummers.forEach(function (x) {
    var o = origineelVan[nk(x.nummer)];
    if (o) { uit.creditnotas.push({ nummer: x.nummer, origineel: o.nummer, bedrag: x.bedrag, datum: x.datum, waar: waarVan[nk(o.nummer)] || '', inAthena: !!gezien[nk(o.nummer)] }); return; }
    if (gecrediteerd[nk(x.nummer)]) return;
    if (x.open !== null && x.bedrag !== null && x.open > 0 && x.open < x.bedrag) uit.deelsBetaald.push({ nummer: x.nummer, waar: waarVan[nk(x.nummer)] || '', bedrag: x.bedrag, open: x.open });  // v7.4: de status blijft verzonden
    if (!gezien[nk(x.nummer)]) uit.alleenExact.push({ nummer: x.nummer, datum: x.datum, bedrag: x.bedrag, creditnota: x.bedrag !== null && x.bedrag < 0 });
  });
  if (volgensOpen) meldingen.push(volgensOpen + (volgensOpen === 1 ? ' factuur' : ' facturen') + ' betaald volgens openstaand bedrag; datum = peildatum (' + peil + ').');
  if (openAlsBetaald) meldingen.push('Geen kolom met de betaaldatum: Open = 0 telt als betaald, behalve bij een factuur met een creditnota.');
  var zonder = uit.alleenExact.filter(function (x) { return x.creditnota; }).length;
  if (zonder) meldingen.push(zonder + (zonder === 1 ? ' creditnota heeft' : ' creditnota\'s hebben') + ' geen oorspronkelijke factuur in dit bestand; exporteer een periode die ook de factuur bevat.');
  // v7.7: voor elke factuur die alleen in Exact staat de school en het ene lopende project (altijd uitgerekend, zodat het venster vooraf laat zien
  // wat er zou gebeuren); met opties.aanmaken (alleen samen met toepassen) wordt daar een termijn voor aangemaakt. Een factuurnummer dat al op een
  // termijn staat is 'gezien' en komt hier niet, dus een tweede run maakt niets dubbel.
  var scholenL = lees('Scholen'), trajectenL = lees('Trajecten'), aanmaken = !!opties.aanmaken && !!opties.toepassen, nieuweTermijnen = [], perProject = {};
  uit.aangemaakt = [];
  uit.alleenExact.forEach(function (a) {
    var x = exact[nk(a.nummer)], d = exactDoelVan(x, scholenL, trajectenL);
    a.reden = d.reden; if (d.school) a.school = d.school; if (d.project) a.project = d.project;
    if (d.reden || !aanmaken) return;
    var betaaldOp = x.betaald || (openAlsBetaald && x.open === 0 ? peil : '');  // dezelfde regels als bij een bestaande koppeling
    // v7.7 (R2): omschrijving = Betreft, hoogstens 80 tekens (geen persoonsnamen; de boekhouder controleert de export), anders 'Factuur <nummer>'
    nieuweTermijnen.push({ trajectId: d.traject.id, omschrijving: tekstIn(x.omschrijving).slice(0, 80) || 'Factuur ' + a.nummer, bedrag: x.bedrag / 100, datum: x.datum, factuurnummer: a.nummer, verzonden: x.datum, status: betaaldOp ? 'betaald' : 'verzonden', betaald: betaaldOp,
      bijzonderheden: 'Aangemaakt uit de Exact-afstemming van ' + peil, door: ikNaam(), aangemaakt: nu() });
    uit.aangemaakt.push({ nummer: a.nummer, school: d.school, project: d.project, bedrag: x.bedrag, datum: x.datum });
    (perProject[d.traject.id] = perProject[d.traject.id] || { t: d.traject, nummers: [] }).nummers.push(a.nummer);
  });
  if (aanmaken) uit.alleenExact = uit.alleenExact.filter(function (a) { return a.reden; });
  if (opties.toepassen) metLock(function () {
    if (wijz.length) schrijfVeel('Facturen', wijz);
    if (nieuweTermijnen.length) schrijfVeel('Facturen', nieuweTermijnen);  // v7.7
    Object.keys(perProject).forEach(function (id) {
      var p = perProject[id];
      schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), schoolId: p.t.schoolId || '', trajectId: p.t.id, bron: 'exact', aangemaakt: nu(), onderwerp: p.nummers.length + (p.nummers.length === 1 ? ' termijn' : ' termijnen') + ' aangemaakt uit Exact: ' + p.nummers.join(', '),
        tekst: 'Deze facturen stonden in Exact zonder termijn in Athena en zijn bij de afstemming van ' + peil + ' onder dit project gezet.' });
    });
    if (Object.keys(expliciet).length) { var bewaar = exactKolommen(); Object.keys(expliciet).forEach(function (x) { bewaar[x] = expliciet[x]; }); zetInstelling('exactKolommen', bewaar); }
    credits.forEach(function (c) {
      schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), schoolId: c.t.schoolId || '', trajectId: c.f.trajectId || '', bron: 'exact', aangemaakt: nu(), onderwerp: 'Factuur ' + c.origineel + ' gecrediteerd met ' + c.credit.nummer,
        tekst: 'Termijn ' + (c.f.omschrijving || '') + ': factuur ' + c.origineel + ' (' + euroTekst(-c.credit.bedrag) + ') is gecrediteerd met creditnota ' + c.credit.nummer + (c.credit.datum ? ' van ' + c.credit.datum : '') + '. De termijn staat weer op ' + eersteStatus + ', zonder factuurnummer en datums.' });
    });
    schrijf('Activiteiten', { type: 'notitie', datum: nu(), door: ikNaam(), bron: 'exact', aangemaakt: nu(), onderwerp: 'Exact-import: ' + uit.gekoppeld + ' gekoppeld, ' + wijz.length + ' bijgewerkt',
      tekst: 'Periode ' + van + ' t/m ' + tot + '. Alleen in Exact: ' + uit.alleenExact.length + '. Alleen in Athena: ' + uit.alleenAthena.length + '. Bedrag wijkt af: ' + uit.afwijkend.length + '. Betaald: ' + uit.betaald.length + '. Deels betaald: ' + uit.deelsBetaald.length + '. Creditnota\'s: ' + uit.creditnotas.length + '. Aangemaakt: ' + uit.aangemaakt.length + '.' });
  });
  return uit;
}
// v7.7: de school bij een Exact-factuur: een vrij veld op de school (Beheer → Tags en velden) waarvan de sleutel debiteur of exact bevat en de waarde
// het debiteurnummer is; anders de debiteurnaam gelijk aan de schoolnaam (naamSleutel). Meer dan één treffer = 'meer scholen'.
var EXACT_VELD_DEBITEUR = /debiteur|exact/i, EXACT_PROJECT_STATUS = ['opstart', 'bezig', 'afgelopen'];  // v7.7 (R8): alleen zo'n project is kandidaat; gestopt en onduidelijk niet
function exactSchoolVan(x, scholen) {
  var nr = klein(x.debiteurNummer), hits = [];
  if (nr) scholen.forEach(function (s) { var v = veldenUit(s.velden); if (Object.keys(v).some(function (k) { return EXACT_VELD_DEBITEUR.test(k) && klein(v[k]) === nr; })) hits.push(s); });
  if (!hits.length && x.debiteur) { var ns = naamSleutel(x.debiteur); hits = scholen.filter(function (s) { return naamSleutel(s.naam) === ns; }); }
  return hits;
}
// Valt de datum in de periode van het project? Start t/m eind als die er zijn, anders het schooljaar (met een losse start of eind als grens)
function trajectInPeriode(t, datum) {
  var van = datumIn(t.start), tot = datumIn(t.eind);
  if (van && tot) return datum >= van && datum <= tot;
  if (/^\d{4}-\d{4}$/.test(String(t.schooljaar || ''))) return schooljaarVan(datum) === String(t.schooljaar) && (!van || datum >= van) && (!tot || datum <= tot);
  return !!(van || tot) && (!van || datum >= van) && (!tot || datum <= tot);
}
// Het doel van een factuur zonder termijn: {reden: ''} met school, project en traject, anders de reden (creditnota, geen bedrag, geen datum, geen school, meer scholen, geen project, meer projecten)
function exactDoelVan(x, scholen, trajecten) {
  if (x.bedrag !== null && x.bedrag < 0) return { reden: 'creditnota' };
  if (!x.bedrag) return { reden: 'geen bedrag' };
  if (!x.datum) return { reden: 'geen datum' };
  var sch = exactSchoolVan(x, scholen);
  if (!sch.length) return { reden: 'geen school' };
  if (sch.length > 1) return { reden: 'meer scholen' };
  var s = sch[0], ps = trajecten.filter(function (t) { return EXACT_PROJECT_STATUS.indexOf(t.status) >= 0 && (t.schoolId ? String(t.schoolId) === String(s.id) : naamSleutel(t.school) === naamSleutel(s.naam)) && trajectInPeriode(t, x.datum); });
  if (!ps.length) return { reden: 'geen project', school: s.naam };
  if (ps.length > 1) return { reden: 'meer projecten', school: s.naam };
  return { reden: '', school: s.naam, project: ps[0].traject || '', traject: ps[0] };
}

/* ===================== 15. Metingen (v7.6): duur en uitkomst van elke backend-aanroep en elke JS-fout uit de app, per dag gebundeld ===================== */

// De app meet elke run()-aanroep (api-naam, duur, ok/fout) en elke onafgevangen JS-fout, bundelt dat per (dag, api) en stuurt het hoogstens een
// paar keer per dag naar het tabblad Metingen. Privacy: alleen de api-naam, de dag, de gebruikers-id, tellingen (per duur-emmer) en één ingekorte
// foutmelding zonder e-mailadressen; nooit argumenten of gegevens. Rijen ouder dan METINGEN_BEWAAR_DAGEN ruimt archiveer() (1e van de maand) op.
var METINGEN_EMMERS = ['b250', 'b500', 'b1000', 'b2000', 'b5000', 'bMeer'];  // bovengrens in ms: 250, 500, 1000, 2000, 5000, daarboven
var METINGEN_GRENZEN = [0, 250, 500, 1000, 2000, 5000];  // ondergrens per emmer
var METINGEN_GETALLEN = ['aantal', 'fouten', 'somMs', 'maxMs'].concat(METINGEN_EMMERS);
var METINGEN_MAX_RIJEN = 200, METINGEN_MAX_DAGEN = 30, METINGEN_BEWAAR_DAGEN = 90, METINGEN_FOUT_MAX = 120, METINGEN_VERSIE_MAX = 20;

function metingenFout(i, wat) { throw new Error('Metingen: rij ' + (i + 1) + ' ' + wat); }
function geheelGetal(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0; }
// Een geldige api-naam: een functie 'api…' in dit bestand (zoals doPost die opzoekt), nooit een portaalfunctie; of 'js' voor JS-fouten uit de app
function metingenFnGeldig(fn) { return fn === 'js' || (/^api[A-Z]\w*$/.test(fn) && typeof globalThis[fn] === 'function' && PORTAAL_FUNCTIES.indexOf(fn) < 0); }
function metingenDagGeldig(dag) {
  if (typeof dag !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dag)) return false;
  var d = parseDatum(dag); if (!d || datumStr(d) !== dag) return false;  // 2026-02-30 bestaat niet
  return dag <= datumStr(new Date()) && dag >= datumStr(plusDagen(-METINGEN_MAX_DAGEN));  // niet in de toekomst, niet ouder dan 30 kalenderdagen
}
// Eén gecontroleerde rij uit de invoer; gebruiker komt nooit uit de invoer
function metingRijIn(r, i) {
  if (!r || typeof r !== 'object' || r instanceof Array) metingenFout(i, 'is geen object.');
  var fn = typeof r.fn === 'string' ? r.fn : '';
  if (!metingenFnGeldig(fn)) metingenFout(i, 'noemt geen bekende api (' + (fn ? fn.slice(0, 40) : 'leeg') + ').');
  if (!metingenDagGeldig(r.dag)) metingenFout(i, 'heeft geen geldige dag (yyyy-MM-dd, niet in de toekomst, hoogstens ' + METINGEN_MAX_DAGEN + ' dagen oud).');
  var uit = { dag: r.dag, fn: fn };
  METINGEN_GETALLEN.forEach(function (k) { if (!geheelGetal(r[k])) metingenFout(i, 'heeft geen geheel getal ≥ 0 in ' + k + '.'); uit[k] = r[k]; });
  if (uit.aantal < 1) metingenFout(i, 'telt geen aanroepen (aantal 0).');
  if (uit.fouten > uit.aantal) metingenFout(i, 'telt meer fouten dan aanroepen.');
  var som = 0; METINGEN_EMMERS.forEach(function (k) { som += uit[k]; });
  if (som !== uit.aantal) metingenFout(i, 'heeft emmers die niet optellen tot het aantal.');
  uit.laatsteFout = tekstIn(r.laatsteFout); if (uit.laatsteFout.length > METINGEN_FOUT_MAX) metingenFout(i, 'heeft een foutmelding langer dan ' + METINGEN_FOUT_MAX + ' tekens.');
  uit.appVersie = tekstIn(r.appVersie); if (uit.appVersie.length > METINGEN_VERSIE_MAX) metingenFout(i, 'heeft een appVersie langer dan ' + METINGEN_VERSIE_MAX + ' tekens.');
  return uit;
}
// Elke ingelogde gebruiker levert zijn eigen bundel aan; upsert op (gebruiker, dag, fn): bij een bestaande rij tellen de getallen op, maxMs wordt het maximum
function apiMetingenOpslaan(lijst) {
  if (!(lijst instanceof Array)) throw new Error('Metingen: verwacht een lijst met rijen.');
  if (lijst.length > METINGEN_MAX_RIJEN) throw new Error('Metingen: hoogstens ' + METINGEN_MAX_RIJEN + ' rijen per keer.');
  var wie = GEBRUIKER ? String(GEBRUIKER.id) : 'beheer', rijen = lijst.map(metingRijIn);
  if (!rijen.length) return { ontvangen: 0 };
  return metLock(function () {
    var bestaand = {}, per = {}, uit = [];
    lees('Metingen').forEach(function (m) { if (String(m.gebruiker) === wie) bestaand[m.dag + '|' + m.fn] = m; });
    rijen.forEach(function (r) {
      var k = r.dag + '|' + r.fn, s = per[k];
      if (!s) {
        var oud = bestaand[k];
        s = per[k] = oud ? { id: oud.id, aangemaakt: oud.aangemaakt } : { id: nieuwId(), aangemaakt: nu() };
        s.dag = r.dag; s.fn = r.fn; s.gebruiker = wie; s.laatsteFout = oud ? String(oud.laatsteFout || '') : ''; s.appVersie = oud ? String(oud.appVersie || '') : '';
        METINGEN_GETALLEN.forEach(function (g) { s[g] = oud ? (Number(oud[g]) || 0) : 0; });
        uit.push(s);
      }
      METINGEN_GETALLEN.forEach(function (g) { if (g === 'maxMs') s.maxMs = Math.max(s.maxMs, r.maxMs); else s[g] += r[g]; });
      if (r.laatsteFout) s.laatsteFout = r.laatsteFout;
      if (r.appVersie) s.appVersie = r.appVersie;
    });
    schrijfVeel('Metingen', uit);
    return { ontvangen: rijen.length };
  });
}
// p50 en p95 geschat uit de emmers: lineair binnen de emmer waarin het gezochte rangnummer valt; de laatste emmer loopt tot maxMs
function metingenPercentiel(s, p) {
  var doel = p * s.aantal, voor = 0;
  for (var i = 0; i < METINGEN_EMMERS.length; i++) {
    var n = s[METINGEN_EMMERS[i]], lo = METINGEN_GRENZEN[i], hi = i + 1 < METINGEN_GRENZEN.length ? METINGEN_GRENZEN[i + 1] : Math.max(s.maxMs, lo);
    if (n > 0 && voor + n >= doel) return Math.round(lo + (hi - lo) * Math.max(0, doel - voor) / n);
    voor += n;
  }
  return s.maxMs;
}
// Management: per api over alle gebruikers de laatste `dagen` dagen (standaard 14, hoogstens 90), gesorteerd op p95 aflopend, plus de JS-fouten
function apiMetingen(dagen) {
  eis('metingen', 'zien');
  var n = Math.min(90, Math.max(1, Math.round(Number(dagen)) || 14)), van = datumStr(plusDagen(-n)), tot = datumStr(new Date());
  var per = {}, js = { aantal: 0, laatste: '', laatsteDag: '' }, gebruikers = {}, rijen = 0;
  lees('Metingen').forEach(function (m) {
    var dag = String(m.dag || ''); if (dag < van || dag > tot) return;
    rijen++; gebruikers[String(m.gebruiker)] = true;
    if (m.fn === 'js') { js.aantal += Number(m.fouten) || 0; if (m.laatsteFout && dag >= js.laatsteDag) { js.laatsteDag = dag; js.laatste = String(m.laatsteFout); } return; }
    var s = per[m.fn];
    if (!s) { s = per[m.fn] = { fn: String(m.fn), aantal: 0, fouten: 0, somMs: 0, maxMs: 0, laatsteFout: '', laatsteDag: '' }; METINGEN_EMMERS.forEach(function (k) { s[k] = 0; }); }
    METINGEN_GETALLEN.forEach(function (g) { var v = Number(m[g]) || 0; if (g === 'maxMs') s.maxMs = Math.max(s.maxMs, v); else s[g] += v; });
    if (m.laatsteFout && dag >= s.laatsteDag) { s.laatsteDag = dag; s.laatsteFout = String(m.laatsteFout); }
  });
  var apis = Object.keys(per).map(function (fn) {
    var s = per[fn];
    return { fn: fn, aantal: s.aantal, fouten: s.fouten, foutPct: s.aantal ? Math.round(1000 * s.fouten / s.aantal) / 10 : 0, p50: metingenPercentiel(s, 0.5), p95: metingenPercentiel(s, 0.95),
      gemMs: s.aantal ? Math.round(s.somMs / s.aantal) : 0, maxMs: s.maxMs, laatsteFout: s.laatsteFout };
  }).sort(function (a, b) { return b.p95 - a.p95 || b.aantal - a.aantal || a.fn.localeCompare(b.fn); });
  return { dagen: n, van: van, tot: tot, schatting: true, uitleg: 'p50 en p95 zijn een schatting uit zes duur-emmers (lineair binnen de emmer; de laatste emmer loopt tot de langste aanroep).',
    apis: apis, jsFouten: { aantal: js.aantal, laatste: js.laatste }, rijen: rijen, gebruikers: Object.keys(gebruikers).length };
}
// Metingen ouder dan 90 dagen weg (zelfde aanpak als archiveer: het tabblad in één keer herschrijven; er is geen archief, de cijfers zijn dan niets meer waard)
function opruimMetingen() {
  var grens = datumStr(plusDagen(-METINGEN_BEWAAR_DAGEN)), alle = lees('Metingen');
  var oud = alle.filter(function (m) { return String(m.dag) < grens; });
  if (!oud.length) return 0;
  var houden = alle.filter(function (m) { return !(String(m.dag) < grens); }), b = blad('Metingen'), kop = TABELLEN.Metingen, laatste = b.getLastRow();
  if (laatste > 1) b.getRange(2, 1, laatste - 1, kop.length).clearContent();
  if (houden.length) b.getRange(2, 1, houden.length, kop.length).setValues(houden.map(function (r) { return kop.map(function (k) { return celUit(r[k]); }); }));
  vergeet('Metingen');
  return oud.length;
}

/* ===================== 16. Sturing (v7.9, pakket 2): aannames en jaardoel, het register van cijfers, datacontracten en datakwaliteit, voorspellingslog,
   weekweergave, MT-overzicht en bevroren standen (docs/sturing-v7.9.md). Geen nieuwe Apps Script-dienst: alleen lees/schrijf/schrijfVeel/metLock. ===================== */

/* ----- v7.9 (punt 13): aannames en besluitinstellingen met versie, eigenaar, onderbouwing en besluitdatum (tabblad Aannames, één rij per versie) ----- */

// Elke open beslissing van de beheerder (deel A §5) is een aanname met een veilige standaard (leeg = niet vastgesteld: het cijfer is geblokkeerd of niet getoetst,
// nooit een geschat getal). Alleen management wijzigt (RECHTEN.aannames). Lezen met uitMap(AANNAMES, naam) (N1).
// soort: jaardoel | lijst | omzet | fractie | euro | getal | datum | bool | gewichten | curve | basislijn
var AANNAMES = {
  jaardoel:              { label: 'Jaardoel', soort: 'jaardoel', eigenaar: 'FD', besluit: 'B1', m: 'M01', uitleg: 'Soort, periode, scope, noemer en waarde (§5 besluit 2). Zolang het niet volledig is, zijn M01, M05, M07 en M11 geblokkeerd.' },
  scope:                 { label: 'Scope (schooltypes buiten het jaardoel)', soort: 'lijst', eigenaar: 'FD', besluit: 'B1', m: '', uitleg: 'De schooltypes (zoals in Scholen.type) die niet meetellen in M04, M06, M18 en M24; een lege lijst moet bewust als versie zijn vastgelegd.' },
  omzetVorigJaar:        { label: 'Omzet vorig jaar (grootboek)', soort: 'omzet', eigenaar: 'boekhouder', besluit: 'B1', m: 'M02', uitleg: 'Het jaartotaal van de boekhouder (extern, §6).' },
  retentie:              { label: 'Aanname retentie', soort: 'fractie', eigenaar: 'beheerder', besluit: 'B1', m: 'M03', uitleg: 'Fractie 0–1 van de omzet vorig jaar die bij dezelfde scholen terugkomt (§5 besluit 3).' },
  dealwaarde:            { label: 'Aanname dealwaarde', soort: 'euro', eigenaar: 'beheerder', besluit: 'B3', m: 'M11', uitleg: 'Gemiddelde getekende waarde van een nieuwe deal (euro).' },
  conversieApVoorstel:   { label: 'Aanname conversie AP → voorstel', soort: 'fractie', eigenaar: 'beheerder', besluit: 'B3', m: 'M11', uitleg: 'Fractie 0–1.' },
  conversieVoorstelDeal: { label: 'Aanname conversie voorstel → deal', soort: 'fractie', eigenaar: 'beheerder', besluit: 'B3', m: 'M11', uitleg: 'Fractie 0–1.' },
  werkweken:             { label: 'Werkweken per schooljaar', soort: 'getal', eigenaar: 'beheerder', besluit: 'B3', m: 'M11', uitleg: 'Aantal weken waarin de OC\'s commercieel werken.' },
  aantalOcs:             { label: 'Aantal OC\'s', soort: 'getal', eigenaar: 'beheerder', besluit: 'B3', m: 'M11', uitleg: 'Aantal OC\'s waarover het rekenmodel verdeelt (de beheerder telt niet mee).' },
  fasegewichten:         { label: 'Fasegewichten', soort: 'gewichten', eigenaar: 'beheerder', besluit: 'B2', m: 'M06', uitleg: 'Een versie bij elke echte wijziging van een gewicht in Beheer → Mijlpalen (pipeline|mijlpaal: procent).' },
  doelpadCurve:          { label: 'Doelpadcurve', soort: 'curve', eigenaar: 'beheerder', besluit: 'B2', m: 'M05', uitleg: 'Per dag sinds 1 augustus het deel van de jaarwaarde (totaal, eventueel bestaand en nieuw); bron reconstructie of athena, nooit gefactureerd.' },
  urenBasislijn:         { label: 'Urenbasislijn vorige schooljaren', soort: 'basislijn', eigenaar: 'beheerder', besluit: 'B2', m: 'M09', uitleg: 'Gewerkte uren per maand van vorige schooljaren ({ schooljaar: { yyyy-MM: uren } }).' },
  voorspellingWeken:     { label: 'Weken voor de voorspelling', soort: 'getal', eigenaar: 'beheerder', besluit: 'B3', m: 'M13', standaard: 12, uitleg: 'Concept-standaard 12 hele weken (zichtbaar als concept).' },
  registratieNorm:       { label: 'Norm registratievertraging (dagen)', soort: 'getal', eigenaar: 'beheerder', besluit: 'B14', m: 'M35', uitleg: 'Zonder waarde: niet getoetst.' },
  bulkDrempel:           { label: 'Drempel bulkinvoer (wissels per eigenaar per dag)', soort: 'getal', eigenaar: 'beheerder', besluit: 'B14', m: 'M36', uitleg: 'Contract geen_bulk_op_werkelijke_datum; zonder waarde niet getoetst.' },
  achterTolerantie:      { label: 'Tolerantie "achter met factureren"', soort: 'fractie', eigenaar: 'teamlead AM', besluit: 'B9', m: 'M27', uitleg: 'Fractie van de contractwaarde; zonder waarde niet getoetst.' },
  dekkingTolerantie:     { label: 'Tolerantie dekking bij lege waarden', soort: 'fractie', eigenaar: 'beheerder', besluit: 'B2', m: 'M06', uitleg: 'Contract dekking_robuust; zonder waarde niet getoetst.' },
  verliesNormWeken:      { label: 'Weken zonder beweging tot verloren', soort: 'getal', eigenaar: 'beheerder', besluit: 'B5', m: 'M21', uitleg: 'Contract verliesdiscipline (tweede deel); zonder waarde niet getoetst.' },
  standaardTarief:       { label: 'Standaardtarief (euro per uur)', soort: 'euro', eigenaar: 'teamlead AM', besluit: 'B9', m: 'M25', uitleg: 'Contract tarief_echt (tweede deel); zonder waarde niet getoetst.' },
  overstapDatum:         { label: 'Overstapdatum van de OC\'s', soort: 'datum', eigenaar: 'beheerder', besluit: '', m: '', uitleg: '§5 besluit 1: vanaf deze datum hoort bij elk nieuw project een kans.' },
  sturingVerplicht:      { label: 'Waarde en tekendatum verplicht vanaf voorstel', soort: 'bool', eigenaar: 'beheerder', besluit: 'B5', m: 'M19', standaard: false, uitleg: 'Pas aanzetten na besluit 4 en 5.' }
};
var JAARDOEL_SOORTEN = ['netto-omzet', 'contractwaarde'], JAARDOEL_PERIODES = ['boekjaar', 'schooljaar'], JAARDOEL_NOEMERS = ['jaardoel', 'contracteerdoel'], CURVE_BRONNEN = ['reconstructie', 'athena'];
var AANNAME_MAX_TEKENS = 45000;  // R11: een Sheets-cel houdt bij 50.000 op
var JAARDOEL_BLOKKADE = 'besluit jaardoel (§5 besluit 2)', AANNAMES_BLOKKADE = 'besluit aannames (§5 besluit 3)', NORM_ONTBREEKT = 'norm niet vastgesteld';
// Alle versies van één aanname, oudste eerst (de waarde als JSON gelezen); per verzoek uit dezelfde gelezen rijen als aanname()
function aannameVersies(naam) {
  aanname(naam);  // bouwt _AANNAMES op uit _LEES.Aannames
  return (uitMap(_AANNAMES.per, String(naam)) || []).slice().sort(function (a, b) { return Number(a.versie) - Number(b.versie); }).map(function (r) {
    var w = r.waarde; try { w = typeof w === 'string' && w !== '' ? JSON.parse(w) : w; } catch (e) {}
    return { id: r.id, versie: Number(r.versie) || 0, waarde: w, eigenaar: r.eigenaar || '', onderbouwing: r.onderbouwing || '', besluitdatum: r.besluitdatum || '', ingang: r.ingang || '', door: r.door || '', vastgelegd: r.vastgelegd || '' };
  });
}
function aannameWaarde(naam, opDatum) { var a = aanname(naam, opDatum); return a ? a.waarde : null; }
function getalIn(v, wat) {
  var n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : NaN;
  if (!isFinite(n)) throw new Error(wat + ' moet een getal zijn.');
  return n;
}
// De waarde van een aanname controleren en normaliseren per soort; gooit een Nederlandse fout
function aannameWaardeIn(naam, def, v) {
  var s = def.soort;
  if (s === 'fractie') { var f = getalIn(v, def.label); if (f < 0 || f > 1) throw new Error(def.label + ' is een fractie tussen 0 en 1.'); return f; }
  if (s === 'euro' || s === 'getal') { var g = getalIn(v, def.label); if (g < 0) throw new Error(def.label + ' is 0 of meer.'); return g; }
  if (s === 'datum') { var d = typeof v === 'string' ? datumIn(v) : ''; if (!d) throw new Error('Ongeldige datum.'); return d; }
  if (s === 'bool') { if (v === true || v === false) return v; if (v === 'ja' || v === 'true') return true; if (v === 'nee' || v === 'false') return false; throw new Error(def.label + ': kies aan of uit.'); }
  if (s === 'lijst') {
    if (!(v instanceof Array)) throw new Error('Geef een lijst schooltypes (mag leeg).');
    if (v.length > 30) throw new Error('Te veel schooltypes.');
    return uniek(v.map(function (x) { return klein(tekstIn(x)).slice(0, 60); }));
  }
  if (!v || typeof v !== 'object' || v instanceof Array) throw new Error(def.label + ': ongeldige waarde.');
  if (s === 'omzet') {
    var o = { waarde: getalIn(v.waarde, 'De omzet vorig jaar') };
    if (o.waarde < 0) throw new Error('De omzet vorig jaar is 0 of meer.');
    o.boekjaar = tekstIn(v.boekjaar).slice(0, 20); o.bron = tekstIn(v.bron).slice(0, 200);
    return o;
  }
  if (s === 'gewichten') {
    var gw = {}; Object.keys(v).slice(0, 200).forEach(function (k) { var x = getalIn(v[k], 'Een fasegewicht'); if (x < 0 || x > 100) throw new Error('Een fasegewicht ligt tussen 0 en 100.'); gw[String(k).slice(0, 120)] = x; });
    return gw;
  }
  if (s === 'curve') {
    if (v.bron === 'gefactureerd' || v.verdeling === 'gefactureerd') throw new Error('Een doelpad op het factuurpatroon komt er niet (D13).');
    var bron = klein(tekstIn(v.bron)); if (CURVE_BRONNEN.indexOf(bron) < 0) throw new Error('Kies de bron van de curve: reconstructie of athena.');
    var punten = function (l, groep) {
      if (l === undefined) return undefined;
      if (!(l instanceof Array) || !l.length || l.length > 400) throw new Error('De curve ' + groep + ' is een lijst van [dag, fractie] (hoogstens 400 punten).');
      var vorigeDag = -1;
      return l.map(function (p0) {
        if (!(p0 instanceof Array) || p0.length !== 2) throw new Error('Elk punt van de curve is [dag, fractie].');
        var dag = getalIn(p0[0], 'Een dag'), fr = getalIn(p0[1], 'Een fractie');
        if (dag < 0 || dag > 366 || dag <= vorigeDag) throw new Error('De dagen van de curve lopen op van 0 tot 366.');
        if (fr < 0 || fr > 1) throw new Error('Een fractie van de curve ligt tussen 0 en 1.');
        vorigeDag = dag; return [dag, fr];
      });
    };
    var c = { totaal: punten(v.totaal, 'totaal'), bron: bron };
    if (!c.totaal) throw new Error('De curve heeft minstens een totaal.');
    if (v.bestaand !== undefined) c.bestaand = punten(v.bestaand, 'bestaand');
    if (v.nieuw !== undefined) c.nieuw = punten(v.nieuw, 'nieuw');
    return c;
  }
  if (s === 'basislijn') {
    var b = {};
    Object.keys(v).slice(0, 10).forEach(function (sj) {
      var sj2 = schooljaarIn(sj), maanden = v[sj], m = {};
      if (!maanden || typeof maanden !== 'object' || maanden instanceof Array) throw new Error('Geef per schooljaar de uren per maand.');
      Object.keys(maanden).forEach(function (mnd) { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mnd)) throw new Error('Een maand schrijf je als 2025-08.'); var u = getalIn(maanden[mnd], 'Uren'); if (u < 0) throw new Error('Uren zijn 0 of meer.'); m[mnd] = u; });
      b[sj2] = m;
    });
    return b;
  }
  if (s === 'jaardoel') {
    if (v.bron === 'gefactureerd' || v.verdeling === 'gefactureerd' || (v.contracteerdoel && typeof v.contracteerdoel === 'object' && (v.contracteerdoel.bron === 'gefactureerd' || v.contracteerdoel.verdeling === 'gefactureerd')))
      throw new Error('Een doelpad op het factuurpatroon komt er niet (D13).');
    var j = {}, kies = function (veld, lijst, wat) { if (v[veld] === undefined || v[veld] === '') return; var x = klein(tekstIn(v[veld])); if (lijst.indexOf(x) < 0) throw new Error('Kies ' + wat + ': ' + lijst.join(' of ') + '.'); j[veld] = x; };
    kies('soort', JAARDOEL_SOORTEN, 'de soort'); kies('periode', JAARDOEL_PERIODES, 'de periode'); kies('noemer', JAARDOEL_NOEMERS, 'de noemer');
    if (v.scope !== undefined && v.scope !== '') {
      var sc = tekstIn(v.scope), mm = /^scope v(\d+)$/.exec(sc);
      if (!mm || !uitMap(scopeVersies(), mm[1])) throw new Error('De scope wijst naar een vastgelegde versie van de scope (bijvoorbeeld "scope v1").');
      j.scope = sc;
    }
    if (v.waarde !== undefined && v.waarde !== '') { j.waarde = getalIn(v.waarde, 'Het jaardoel'); if (!(j.waarde > 0)) throw new Error('Het jaardoel is meer dan € 0.'); }
    if (v.schooljaar !== undefined && v.schooljaar !== '') j.schooljaar = schooljaarIn(v.schooljaar);
    if (v.contracteerdoel !== undefined && v.contracteerdoel !== null && v.contracteerdoel !== '') {
      var cd = v.contracteerdoel; if (typeof cd !== 'object' || cd instanceof Array) throw new Error('Het contracteerdoel is een object met een waarde.');
      j.contracteerdoel = { waarde: getalIn(cd.waarde, 'Het contracteerdoel'), soort: 'contractwaarde', periode: 'schooljaar', afleiding: tekstIn(cd.afleiding).slice(0, 500) };
      if (!(j.contracteerdoel.waarde > 0)) throw new Error('Het contracteerdoel is meer dan € 0.');
    }
    if (j.noemer === 'contracteerdoel' && !j.contracteerdoel) throw new Error('Geef bij de noemer "contracteerdoel" de waarde van het afgeleide contracteerdoel (meer dan € 0).');
    return j;
  }
  throw new Error('Onbekende soort aanname.');
}
// Een nieuwe versie toevoegen (nooit overschrijven; R11). Altijd binnen metLock; geeft de rij.
function aannameVastleggen(naam, waarde, o) {
  var def = uitMap(AANNAMES, naam), vs = aannameVersies(naam), versie = vs.length ? vs[vs.length - 1].versie + 1 : 1, json = JSON.stringify(waarde);
  if (json.length > AANNAME_MAX_TEKENS) throw new Error('Deze waarde is te groot voor één versie; geef de curve per week in plaats van per dag.');
  return schrijf('Aannames', { id: 'aa-' + naam + '-v' + versie, naam: naam, versie: versie, waarde: json, eigenaar: o.eigenaar || (def ? def.eigenaar : 'beheerder'), onderbouwing: o.onderbouwing,
    besluitdatum: o.besluitdatum, ingang: o.ingang || datumStr(new Date()), door: ikNaam(), vastgelegd: nu() });
}
function apiAannames() {
  eis('aannames', 'zien');
  var types = uniek(lees('Scholen').map(function (s) { return klein(s.type); })).sort();
  return {
    aannames: Object.keys(AANNAMES).map(function (naam) {
      var d = AANNAMES[naam], a = aanname(naam), hist = aannameVersies(naam).reverse();
      return { naam: naam, label: d.label, soort: d.soort, eigenaar: d.eigenaar, besluit: d.besluit, m: d.m, uitleg: d.uitleg,
        huidig: a ? { versie: a.versie, waarde: a.waarde, eigenaar: a.eigenaar, onderbouwing: a.onderbouwing, besluitdatum: a.besluitdatum, ingang: a.ingang, door: a.door } : null,
        standaard: d.standaard === undefined ? null : { waarde: d.standaard, status: 'concept' }, historie: hist };
    }),
    scopes: aannameVersies('scope').map(function (v) { return { waarde: 'scope v' + v.versie, lijst: v.waarde instanceof Array ? v.waarde : [] }; }),
    schooljaren: [huidigSchooljaar(), volgendSchooljaar(huidigSchooljaar())], schooltypes: types, soorten: JAARDOEL_SOORTEN, periodes: JAARDOEL_PERIODES, noemers: JAARDOEL_NOEMERS,
    magWijzigen: mag('aannames', 'wijzigen')
  };
}
// obj = { waarde, onderbouwing, besluitdatum, ingang }; onderbouwing en besluitdatum altijd verplicht (N6)
function apiAannameOpslaan(naam, obj) {
  eis('aannames', 'wijzigen');
  var def = typeof naam === 'string' ? uitMap(AANNAMES, naam) : undefined;
  if (!def) throw new Error('Onbekende aanname.');
  if (!obj || typeof obj !== 'object' || obj instanceof Array) throw new Error('Geef een waarde, een onderbouwing en een besluitdatum.');
  var onderbouwing = tekstIn(obj.onderbouwing).slice(0, 2000), besluitdatum = datumIn(typeof obj.besluitdatum === 'string' ? obj.besluitdatum : '');
  var ingang = obj.ingang === undefined || obj.ingang === '' || obj.ingang === null ? datumStr(new Date()) : datumIn(typeof obj.ingang === 'string' ? obj.ingang : '');
  if (!onderbouwing) throw new Error('Geef een onderbouwing.');
  if (!besluitdatum) throw new Error('Vul de besluitdatum in.');
  if (!ingang) throw new Error('Ongeldige ingangsdatum.');
  var waarde = aannameWaardeIn(naam, def, obj.waarde);
  metLock(function () { aannameVastleggen(naam, waarde, { onderbouwing: onderbouwing, besluitdatum: besluitdatum, ingang: ingang }); });
  return apiAannames();
}
// { '<versie>': [schooltypes] } van alle vastgelegde versies van de scope
function scopeVersies() { var u = {}; aannameVersies('scope').forEach(function (v) { u[String(v.versie)] = v.waarde instanceof Array ? v.waarde : []; }); return u; }
// v7.9 (B3, R12): de noemerregel als pure functie (ook voor het contract noemerbewaking). j = de waarde van aanname jaardoel; scopes = scopeVersies().
// Het jaardoel is pas bruikbaar als het volledig is (soort, periode, scope, noemer, waarde > 0); er is geen terugval op een los contracteerdoel.
function noemerUit(j, scopes, sj) {
  var leeg = { volledig: false, ok: false, reden: JAARDOEL_BLOKKADE, waarde: '', scope: [], scopeLabel: '' };
  if (!j || typeof j !== 'object' || j instanceof Array) return leeg;
  var m = /^scope v(\d+)$/.exec(String(j.scope || '')), sc = m ? uitMap(scopes || {}, m[1]) : undefined;
  if (JAARDOEL_SOORTEN.indexOf(j.soort) < 0 || JAARDOEL_PERIODES.indexOf(j.periode) < 0 || JAARDOEL_NOEMERS.indexOf(j.noemer) < 0 || !(sc instanceof Array) || !(Number(j.waarde) > 0)) return leeg;
  var basis = { volledig: true, ok: false, reden: '', waarde: '', soort: j.soort, periode: j.periode, noemer: j.noemer, jaardoel: Number(j.waarde), scope: sc, scopeLabel: String(j.scope) };
  if (j.schooljaar && sj && j.schooljaar !== sj) { basis.reden = 'het jaardoel is voor schooljaar ' + j.schooljaar + ' (§5 besluit 2)'; return basis; }
  if (j.noemer === 'jaardoel') {
    if (j.soort !== 'contractwaarde' || j.periode !== 'schooljaar') { basis.reden = 'het jaardoel is ' + j.soort + ' per ' + j.periode + ', de teller is contractwaarde per schooljaar (§5 besluit 2)'; return basis; }
    basis.ok = true; basis.waarde = Number(j.waarde); basis.label = 'jaardoel'; return basis;
  }
  var c = j.contracteerdoel;
  if (!c || typeof c !== 'object' || !(Number(c.waarde) > 0) || (c.soort && c.soort !== 'contractwaarde') || (c.periode && c.periode !== 'schooljaar')) { basis.reden = 'afgeleid contracteerdoel ontbreekt (§5 besluit 2)'; return basis; }
  basis.ok = true; basis.waarde = Number(c.waarde); basis.label = 'afgeleid contracteerdoel'; return basis;
}
function jaardoelNoemer(peildatum, sj) { return noemerUit(aannameWaarde('jaardoel', peildatum), scopeVersies(), sj || sjOp(peildatum)); }
// De scope voor M04, M06, M18 en M24: de versie waar het jaardoel naar wijst, anders de laatste vastgelegde versie, anders geen (alle scholen tellen)
function sturingScope(peildatum, N) {
  if (N && N.volledig) return { lijst: N.scope, label: N.scopeLabel };
  var a = aanname('scope', peildatum);
  return a && a.waarde instanceof Array ? { lijst: a.waarde, label: 'scope v' + a.versie } : { lijst: [], label: '' };
}
// Het schooljaar op een peildatum: vandaag het ingestelde schooljaar, anders dat van de datum
function sjOp(peildatum) { return !peildatum || peildatum === datumStr(new Date()) ? huidigSchooljaar() : schooljaarVan(peildatum); }

/* ----- v7.9 (punt 8): het register van cijfers (tabblad Cijferdefinities; de code is versie 0, concept) ----- */

var CIJFER_EIGENAREN = ['FD', 'beheerder', 'teamlead AM', 'boekhouder'];
var CIJFER_BESLUITEN = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14'];
var CIJFER_TOLERANTIE = /^\d+([,.]\d+)?%?$/;
// Per verzoek één keer opgebouwd; hangt aan _LEES.Cijferdefinities (vergeet() en elke reset maken hem ongeldig)
var _REGISTER = null;
function registerData() {
  var bron = _LEES.Cijferdefinities || (lees('Cijferdefinities'), _LEES.Cijferdefinities);
  if (_REGISTER && _REGISTER.bron === bron) return _REGISTER;
  var per = {}; bron.forEach(function (r) { (per[String(r.metriek)] = per[String(r.metriek)] || []).push(r); });
  _REGISTER = { bron: bron, per: per };
  return _REGISTER;
}
// De geldende definitie: de hoogste afgetekende versie met ingang <= opDatum, anders de hoogste conceptversie, anders de code (versie 0, concept)
function registerVan(id, opDatum) {
  var c = uitMap(METRIEKEN, String(id)); if (!c) return null;
  var d = opDatum || datumStr(new Date()), rijen = uitMap(registerData().per, String(id)) || [], af = null, concept = null;
  rijen.forEach(function (r) {
    var v = Number(r.versie) || 0;
    if (r.status === 'afgetekend' && String(r.ingang || '') <= d && (!af || v > Number(af.versie))) af = r;
    if (r.status === 'concept' && (!concept || v > Number(concept.versie))) concept = r;
  });
  var r0 = af || concept;
  return { id: String(id), m: c.m || '', label: c.label, soort: c.soort, team: c.team, definitie: r0 ? String(r0.definitie) : c.definitie || '', versie: r0 ? Number(r0.versie) || 0 : 0,
    eigenaar: r0 ? String(r0.eigenaar || c.eigenaar || '') : c.eigenaar || '', besluit: r0 && r0.besluit ? String(r0.besluit) : c.besluit || '', ingang: r0 ? String(r0.ingang || '') : '',
    status: r0 ? String(r0.status) : 'concept', tolerantie: r0 && r0.tolerantie !== '' ? String(r0.tolerantie) : c.tolerantie || '', blokkade: c.blokkade || '', wachtOp: c.wachtOp || '' };
}
// { id: { m, label, definitie, versie, status, eigenaar, blokkade } } voor de cijfers die een weergave teruggeeft. Alleen apiSturing en apiCijfers (R9).
function definitiesVan(ids, opDatum) {
  var u = {}; (ids || []).forEach(function (id) { var r = registerVan(id, opDatum); if (r) u[id] = { m: r.m, label: r.label, definitie: r.definitie, versie: r.versie, status: r.status, eigenaar: r.eigenaar, blokkade: r.blokkade, wachtOp: r.wachtOp }; });
  return u;
}
// opties.kort = het compacte register voor de app (één keer per sessie, R9); anders het volledige register met historie voor Beheer
function apiCijfers(opties) {
  eis('cijfers', 'zien');
  var ids = Object.keys(METRIEKEN), R = registerData();
  if (opties && typeof opties === 'object' && opties.kort === true) {
    var st = ''; R.bron.forEach(function (r) { [r.aangemaakt, r.afgetekendOp].forEach(function (x) { if (String(x || '') > st) st = String(x); }); });
    return { stempel: VERSIE + '|' + st, defs: definitiesVan(ids) };
  }
  return {
    cijfers: ids.map(function (id) {
      var r = registerVan(id);
      r.historie = (uitMap(R.per, id) || []).slice().sort(function (a, b) { return Number(b.versie) - Number(a.versie); }).map(function (x) {
        return { versie: Number(x.versie) || 0, definitie: x.definitie, eigenaar: x.eigenaar, besluit: x.besluit, ingang: x.ingang, status: x.status, tolerantie: x.tolerantie, onderbouwing: x.onderbouwing, door: x.door, aangemaakt: x.aangemaakt, afgetekendDoor: x.afgetekendDoor, afgetekendOp: x.afgetekendOp };
      });
      return r;
    }),
    eigenaren: CIJFER_EIGENAREN, besluiten: CIJFER_BESLUITEN, magWijzigen: mag('cijfers', 'wijzigen')
  };
}
// Een nieuwe conceptversie: { metriek, definitie, eigenaar, besluit, ingang, tolerantie, onderbouwing } (alleen management)
function apiCijferOpslaan(obj) {
  eis('cijfers', 'wijzigen');
  if (!obj || typeof obj !== 'object' || obj instanceof Array) throw new Error('Onbekend cijfer.');
  var id = typeof obj.metriek === 'string' ? obj.metriek : '', c = uitMap(METRIEKEN, id);
  if (!c) throw new Error('Onbekend cijfer.');
  var definitie = tekstIn(obj.definitie).slice(0, 2000), eigenaar = tekstIn(obj.eigenaar) || c.eigenaar, besluit = tekstIn(obj.besluit), tol = tekstIn(obj.tolerantie);
  var ingang = obj.ingang === undefined || obj.ingang === '' || obj.ingang === null ? datumStr(new Date()) : datumIn(typeof obj.ingang === 'string' ? obj.ingang : '');
  if (!definitie) throw new Error('Geef de definitie.');
  if (CIJFER_EIGENAREN.indexOf(eigenaar) < 0) throw new Error('Kies een eigenaar: ' + CIJFER_EIGENAREN.join(', ') + '.');
  if (besluit && CIJFER_BESLUITEN.indexOf(besluit) < 0) throw new Error('Kies een besluit B1 t/m B14 of laat het leeg.');
  if (tol && !CIJFER_TOLERANTIE.test(tol)) throw new Error('Schrijf de tolerantie als een getal, eventueel met %, bijvoorbeeld 1%.');
  if (!ingang) throw new Error('Ongeldige ingangsdatum.');
  metLock(function () {
    var versie = (uitMap(registerData().per, id) || []).reduce(function (n, r) { return Math.max(n, Number(r.versie) || 0); }, 0) + 1;
    schrijf('Cijferdefinities', { id: 'cd-' + slug(id) + '-v' + versie, metriek: id, versie: versie, definitie: definitie, eigenaar: eigenaar, besluit: besluit, ingang: ingang, status: 'concept',
      tolerantie: tol, onderbouwing: tekstIn(obj.onderbouwing).slice(0, 2000), door: ikNaam(), aangemaakt: nu(), afgetekendDoor: '', afgetekendOp: '' });
  });
  return apiCijfers();
}
// Aftekenen door management: de versie geldt vanaf haar ingang; een eerder afgetekende versie blijft staan (historie)
function apiCijferAftekenen(metriek, versie) {
  eis('cijfers', 'wijzigen');
  var id = typeof metriek === 'string' ? metriek : '', c = uitMap(METRIEKEN, id);
  if (!c) throw new Error('Onbekend cijfer.');
  if (c.wachtOp) throw new Error('Dit cijfer kan pas worden afgetekend na ' + c.wachtOp + ' (§5).');
  var rij = (uitMap(registerData().per, id) || []).filter(function (r) { return Number(r.versie) === Number(versie) && Number(versie) > 0; })[0];
  if (!rij) throw new Error('Versie niet gevonden.');
  if (rij.status === 'vervallen') throw new Error('Deze versie is vervallen.');
  if (rij.status !== 'afgetekend') metLock(function () { schrijf('Cijferdefinities', { id: rij.id, status: 'afgetekend', afgetekendDoor: ikNaam(), afgetekendOp: nu() }); });
  return apiCijfers();
}

/* ----- v7.9 (punt 9, R16): datacontracten als pure functie op een stand (geen mag(), isBeheerder(), ikNaam() of GEBRUIKER) ----- */

// Volgorde en labels (deel A §3b). eigenaarSoort = wie een afwijking oplost.
var CONTRACTEN = [
  ['waarde_vanaf_voorstel', 'Waarde vanaf voorstel', 'eigenaar van de kans'],
  ['sluitdatum_vanaf_voorstel', 'Verwachte tekendatum vanaf voorstel', 'eigenaar van de kans'],
  ['dekking_robuust', 'Dekking niet afhankelijk van lege waarden', 'beheerder'],
  ['geen_bulk_op_werkelijke_datum', 'Geen bulkinvoer op één werkelijke datum', 'eigenaar van de kans'],
  ['actieve_eigenaar', 'Elke open kans heeft een actieve eigenaar', 'beheerder'],
  ['geen_dubbele_open_kansen', 'Geen dubbele open kansen', 'eigenaar van de kans'],
  ['verliesdiscipline', 'Verliesdiscipline', 'eigenaar van de kans'],
  ['weekdoel_voor_deze_week', 'Weekdoel voor deze week per OC', 'beheerder'],
  ['fasewissel_heeft_werkelijke_datum', 'Elke fasewissel heeft een werkelijke datum', 'eigenaar van de kans'],
  ['logdekking', 'Logdekking', 'beheerder'],
  ['school_heeft_brin', 'School met kans of opdracht heeft een BRIN', 'eigenaar van de school'],
  ['noemerbewaking', 'Noemerbewaking (jaardoel)', 'beheerder'],
  ['geen_target_op_facturatie', 'Geen doelpad op het factuurpatroon', 'beheerder'],
  ['gewonnen_is_getekend', 'Gewonnen is getekend', 'eigenaar van de kans'],
  ['lopend_project_heeft_contract', 'Lopend project heeft een contractwaarde', 'accountmanager'],
  ['kans_heeft_schooljaar_en_klant', 'Open kans heeft schooljaar en klant', 'eigenaar van de kans'],
  ['termijn_verzonden_heeft_factuurnummer', 'Verzonden termijn heeft een uniek factuurnummer', 'boekhouder'],
  ['tarief_echt', 'Tarief is echt', 'accountmanager'],
  ['verlenging_bekend', 'Verlengingsstatus bekend', 'accountmanager']
];
var CONTRACT_STANDEN = ['geslaagd', 'gezakt', 'niet getoetst', 'geblokkeerd'];
// De teller van het MT-overzicht tegen de noemer: soort en periode (zelfcontrole in noemerbewaking)
var MT_TELLERS = { gecontracteerd: { soort: 'contractwaarde', periode: 'schooljaar' }, gewogenPijplijn: { soort: 'contractwaarde', periode: 'schooljaar' } };
var IMPORT_BRONNEN = ['import', 'capsule', 'reconstructie', 'tijdlijn'];
// Alles wat de contracten nodig hebben, één keer gelezen. Gebruikt geen gebruiker; de rol en het fasegewicht per kans staan erin, zodat datacontracten() puur blijft.
function standVoorContracten(vandaag) {
  vandaag = vandaag || datumStr(new Date());
  var kansen = lees('Kansen'), rol = {}, gewicht = {}, vv = {}, gIds = {};
  kansen.forEach(function (k) { var pl = pipelineVan(k); rol[k.id] = effectieveRol(k.fase, pl); gewicht[k.id] = fasegewichtVan(k); vv[k.id] = kansOpen(k) && vanafVoorstel(k.fase, pl); });
  lees('Gebruikers').forEach(function (g) { if (g.naam && g.id) gIds[String(g.naam)] = String(g.id); });  // review P4: een verwijzing naar een OC met zijn id, niet zijn naam
  var aw = function (n) { return aannameWaarde(n, vandaag); };
  return {
    vandaag: vandaag, schooljaar: sjOp(vandaag), kansen: kansen, trajecten: lees('Trajecten'), facturen: lees('Facturen'), uren: lees('TalentUren'), wissels: lees('Fasewissels'),
    doelen: lees('Doelen'), scholen: lees('Scholen'), rol: rol, gewicht: gewicht, vanafVoorstel: vv, rollenIngesteld: rollenStatus().ingesteld,
    actieven: lees('Gebruikers').filter(actief).map(function (g) { return String(g.naam); }), gebruikerIds: gIds, scriptEigenaar: P.getProperty('NAAM') || 'Menno', consultancy: teamNamen('consultancy'),
    normen: { bulkDrempel: aw('bulkDrempel'), dekkingTolerantie: aw('dekkingTolerantie'), verliesNormWeken: aw('verliesNormWeken'), standaardTarief: aw('standaardTarief'), overstapDatum: aw('overstapDatum') },
    scope: aw('scope'), jaardoel: aw('jaardoel'), scopeVersies: scopeVersies(),
    doelVersies: aannameVersies('doelpadCurve').map(function (v) { return { id: v.id, naam: 'doelpadCurve', waarde: v.waarde }; }).concat(aannameVersies('jaardoel').map(function (v) { return { id: v.id, naam: 'jaardoel', waarde: v.waarde }; }))
  };
}
function mediaan(l) { if (!l.length) return null; var s = l.slice().sort(function (a, b) { return a - b; }), h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
// De contracten op een stand. Uitkomst per contract: { id, label, eigenaarSoort, stand, reden, afwijkingen: [{ eigenaar, soort, id }] }.
function datacontracten(S) {
  var vandaag = S.vandaag, sj = S.schooljaar, sjStart = sj.slice(0, 4) + '-08-01', sjEind = sj.slice(5, 9) + '-07-31', inSj = function (d) { d = String(d || '').slice(0, 10); return !!d && d >= sjStart && d <= sjEind; };
  var sMap = {}, naarSchool = {}; S.scholen.forEach(function (s) { sMap[String(s.id)] = s; naarSchool[klein(s.naam)] = s; });
  var schoolVan = function (k) { return sMap[String(k.schoolId || '')] || naarSchool[klein(k.school)] || null; };
  var scope = S.scope instanceof Array ? S.scope : [], binnen = function (s) { return !scope.length || !s || scope.indexOf(klein(s.type)) < 0; };
  var open = S.kansen.filter(kansOpen), tellend = S.wissels.filter(function (w) { return !w.ongedaan && !w.verwijderd && FASE_TELT_NIET.indexOf(w.bron) < 0; });
  var tPerKans = {}; S.trajecten.forEach(function (t) { if (t.kansId) (tPerKans[String(t.kansId)] = tPerKans[String(t.kansId)] || []).push(t); });
  var getekend = function (kansId) { return (tPerKans[String(kansId)] || []).some(function (t) { return Number(t.contractwaarde) > 0; }); };
  var rolBlok = 'rollen niet ingesteld (Beheer → Overstap v7.9)', norm = function (n) { var v = S.normen[n]; return v === null || v === undefined || v === '' ? null : v; };
  var uit = [], vind_ = {};
  CONTRACTEN.forEach(function (c) { var x = { id: c[0], label: c[1], eigenaarSoort: c[2], stand: 'geslaagd', reden: '', afwijkingen: [] }; uit.push(x); vind_[c[0]] = x; });
  var af = function (id, eigenaar, soort, rid) { vind_[id].afwijkingen.push({ eigenaar: String(eigenaar || 'beheerder'), soort: soort, id: String(rid) }); };
  var zet = function (id, stand, reden) { vind_[id].stand = stand; vind_[id].reden = reden || ''; };

  // 1, 2 en 11 leunen op de rol (B1)
  if (!S.rollenIngesteld) { zet('waarde_vanaf_voorstel', 'geblokkeerd', rolBlok); zet('sluitdatum_vanaf_voorstel', 'geblokkeerd', rolBlok); zet('school_heeft_brin', 'geblokkeerd', rolBlok); }
  else {
    open.forEach(function (k) {
      if (!S.vanafVoorstel[k.id]) return;
      if (!(Number(k.waarde) > 0)) af('waarde_vanaf_voorstel', k.eigenaar, 'kans', k.id);
      if (!k.verwachteSluiting || String(k.verwachteSluiting).slice(0, 10) < vandaag) af('sluitdatum_vanaf_voorstel', k.eigenaar, 'kans', k.id);
    });
    var brinGezien = {};
    S.kansen.forEach(function (k) {
      var r = S.rol[k.id], s = schoolVan(k);
      if (!s || !binnen(s) || s.brin || brinGezien[s.id]) return;
      var raakt = (kansOpen(k) && ['ap', 'ad', 'voorstel'].indexOf(r) >= 0) || (k.fase === 'gewonnen' && String(k.schooljaar || '') === sj);
      if (raakt) { brinGezien[s.id] = true; af('school_heeft_brin', s.eigenaar || k.eigenaar, 'school', s.id); }
    });
  }
  // 3. dekking_robuust: M06 met leeg = 0 tegen leeg = de mediaan van de getekende waarden (dit en vorig schooljaar)
  var tolD = norm('dekkingTolerantie');
  if (tolD === null) zet('dekking_robuust', 'niet getoetst', NORM_ONTBREEKT + ' (aanname dekkingTolerantie)');
  else {
    var vorig = vorigSchooljaar(sj), getekendeWaarden = [];
    S.trajecten.forEach(function (t) { if (t.kansId && Number(t.contractwaarde) > 0 && (t.schooljaar === sj || t.schooljaar === vorig)) getekendeWaarden.push(Number(t.contractwaarde)); });
    var med = mediaan(getekendeWaarden), a0 = 0, b0 = 0, leeg = [];
    open.forEach(function (k) {
      if (String(k.schooljaar || '') !== sj || !binnen(schoolVan(k))) return;
      var g = (S.gewicht[k.id] || 0) / 100; if (!g) return;
      var w = Number(k.waarde) || 0; a0 += w * g; b0 += (w > 0 ? w : med || 0) * g; if (!(w > 0)) leeg.push(k);
    });
    if (med === null) zet('dekking_robuust', 'niet getoetst', 'nog geen getekende waarden om mee te vergelijken');
    else if (b0 > 0 && (b0 - a0) / b0 > Number(tolD)) leeg.forEach(function (k) { af('dekking_robuust', 'beheerder', 'kans', k.id); });
  }
  // 4. geen_bulk_op_werkelijke_datum: hoogstens bulkDrempel tellende wissels per eigenaar en werkelijke datum (in het lopende schooljaar)
  var drempel = norm('bulkDrempel');
  if (drempel === null) zet('geen_bulk_op_werkelijke_datum', 'niet getoetst', NORM_ONTBREEKT + ' (aanname bulkDrempel)');
  else {
    var perDag = {};
    tellend.forEach(function (w) { if (!w.werkelijkeDatum || !inSj(w.werkelijkeDatum) || IMPORT_BRONNEN.indexOf(w.bron) >= 0) return; var s0 = String(w.eigenaar) + '|' + w.werkelijkeDatum; (perDag[s0] = perDag[s0] || []).push(w); });
    Object.keys(perDag).forEach(function (s0) { if (perDag[s0].length > Number(drempel)) perDag[s0].forEach(function (w) { af('geen_bulk_op_werkelijke_datum', w.eigenaar, 'wissel', w.id); }); });
  }
  // 5. actieve_eigenaar
  open.forEach(function (k) { var e = String(k.eigenaar || ''); if (!e || (S.actieven.indexOf(e) < 0 && e !== S.scriptEigenaar)) af('actieve_eigenaar', 'beheerder', 'kans', k.id); });
  // 6. geen_dubbele_open_kansen: school (BRIN en vestiging, anders id) + schooljaar + productsoort hoogstens één keer onder de open kansen (binnen de scope).
  // Elke eigenaar in de groep krijgt alle kansen van de groep als verwijzing (ook die van een collega; R16: de app toont die zonder naam)
  var groepen = {};
  open.forEach(function (k) { var s = schoolVan(k); if (!binnen(s)) return; var sl = (s ? schoolSleutel(s) : 'naam:' + klein(k.school)) + '|' + String(k.schooljaar || '') + '|' + klein(k.productsoort); (groepen[sl] = groepen[sl] || []).push(k); });
  Object.keys(groepen).forEach(function (sl) { var g = groepen[sl]; if (g.length < 2) return; uniek(g.map(function (k) { return String(k.eigenaar || 'beheerder'); })).forEach(function (e) { g.forEach(function (k) { af('geen_dubbele_open_kansen', e, 'kans', k.id); }); }); });
  // 7. verliesdiscipline: (a) wie open kansen heeft, zette in dit schooljaar minstens één kans op verloren (gewonnen telt niet: fout uit de Mac-code);
  //    (b) geen open kans langer zonder beweging dan verliesNormWeken
  var verlorenDoor = {}, laatsteBeweging = {};
  tellend.forEach(function (w) {
    if (w.naar === 'verloren' && inSj(w.werkelijkeDatum)) verlorenDoor[String(w.eigenaar)] = true;
    var d = String(w.werkelijkeDatum || String(w.ingevoerdOp || '').slice(0, 10)); if (d > (laatsteBeweging[String(w.kansId)] || '')) laatsteBeweging[String(w.kansId)] = d;
  });
  uniek(open.map(function (k) { return String(k.eigenaar || ''); })).forEach(function (e) { if (e && !verlorenDoor[e]) af('verliesdiscipline', e, 'regel', 'geen-verloren-' + sj); });
  var weken = norm('verliesNormWeken'), deelB = '';
  if (weken === null) deelB = 'tweede deel: ' + NORM_ONTBREEKT + ' (aanname verliesNormWeken)';
  else open.forEach(function (k) { var d = laatsteBeweging[String(k.id)] || String(k.aangemaakt || '').slice(0, 10); var n = d ? dagenTussen(d, vandaag) : null; if (n !== null && n > Number(weken) * 7) af('verliesdiscipline', k.eigenaar, 'kans', k.id); });
  if (deelB && !vind_.verliesdiscipline.afwijkingen.length) zet('verliesdiscipline', 'niet getoetst', deelB);
  else if (deelB) vind_.verliesdiscipline.reden = deelB;
  // 8. weekdoel_voor_deze_week: per actieve OC een doel voor precies deze ISO-week (exacte vergelijking: fout uit de Mac-code)
  var d0 = parseDatum(vandaag), wk = isoWeekStr(d0), metDoel = {};
  S.doelen.forEach(function (d) { if (d.periode === 'week' && String(d.periodeSleutel || '') === wk && Number(d.doel) > 0) metDoel[String(d.eigenaar)] = true; });
  S.consultancy.forEach(function (n) { if (!metDoel[n]) af('weekdoel_voor_deze_week', 'beheerder', 'doel', (uitMap(S.gebruikerIds || {}, n) || 'onbekend') + '-' + wk); });  // review P4: gebruikers-id, geen naam
  // 9. fasewissel_heeft_werkelijke_datum: tellende wissels ingevoerd in dit schooljaar
  tellend.forEach(function (w) {
    var inv = String(w.ingevoerdOp || '').slice(0, 10); if (!inSj(inv)) return;
    if (!w.werkelijkeDatum || String(w.werkelijkeDatum) > inv || (IMPORT_BRONNEN.indexOf(w.bron) >= 0 && !w.zekerheid)) af('fasewissel_heeft_werkelijke_datum', w.eigenaar, 'wissel', w.id);
  });
  // 10. logdekking: nooit geslaagd zonder meting (fout uit de Mac-code)
  zet('logdekking', 'geblokkeerd', 'besluit agenda-toegang (§5 besluit 10)');
  // 12. noemerbewaking (N12, B3): zonder volledig jaardoel geblokkeerd en geen melding
  var N = noemerUit(S.jaardoel, S.scopeVersies, sj);
  if (!N.volledig) zet('noemerbewaking', 'geblokkeerd', JAARDOEL_BLOKKADE);
  else if (!N.ok) { af('noemerbewaking', 'beheerder', 'instelling', 'jaardoel'); vind_.noemerbewaking.reden = N.reden; }
  else Object.keys(MT_TELLERS).forEach(function (m) { var tl = MT_TELLERS[m]; if (tl.soort !== 'contractwaarde' || tl.periode !== 'schooljaar') af('noemerbewaking', 'beheerder', 'instelling', m); });
  // 13. geen_target_op_facturatie
  S.doelVersies.forEach(function (v) {
    var w = v.waarde || {}, cd = w && typeof w === 'object' ? w.contracteerdoel : null;
    if (w && typeof w === 'object' && (w.bron === 'gefactureerd' || w.verdeling === 'gefactureerd' || (cd && typeof cd === 'object' && (cd.bron === 'gefactureerd' || cd.verdeling === 'gefactureerd')))) af('geen_target_op_facturatie', 'beheerder', 'instelling', v.id);
  });
  // 14. gewonnen_is_getekend: per kans de laatste geldige sluitende wissel; als die naar gewonnen gaat en in dit schooljaar valt: een project met contractwaarde en een werkelijke datum
  var slot = {};
  tellend.forEach(function (w) { if (w.naar !== 'gewonnen' && w.naar !== 'verloren') return; var k = String(w.kansId), h = slot[k]; if (!h || volgordeWerkelijk(h, w) < 0) slot[k] = w; });
  Object.keys(slot).forEach(function (k) {
    var w = slot[k]; if (w.naar !== 'gewonnen') return;
    if (w.werkelijkeDatum ? inSj(w.werkelijkeDatum) && !getekend(k) : inSj(String(w.ingevoerdOp || '').slice(0, 10))) af('gewonnen_is_getekend', w.eigenaar, 'kans', k);
  });
  // 15. lopend_project_heeft_contract (en, alleen met de overstapdatum, een kansId bij elk project dat daarna start)
  var overstap = norm('overstapDatum');
  S.trajecten.forEach(function (t) {
    if (!projectLopend(t)) return;
    if (!(Number(t.contractwaarde) > 0)) af('lopend_project_heeft_contract', t.am || 'beheerder', 'project', t.id);
    if (overstap && !t.kansId && String(t.start || '') >= String(overstap)) af('lopend_project_heeft_contract', t.am || 'beheerder', 'project', t.id);
  });
  if (!overstap) { if (!vind_.lopend_project_heeft_contract.afwijkingen.length) zet('lopend_project_heeft_contract', 'niet getoetst', 'kansId-deel: overstapdatum niet vastgesteld (§5 besluit 1)'); else vind_.lopend_project_heeft_contract.reden = 'kansId-deel: overstapdatum niet vastgesteld (§5 besluit 1)'; }
  // 16. kans_heeft_schooljaar_en_klant
  open.forEach(function (k) { if (!k.schooljaar || !k.klant) af('kans_heeft_schooljaar_en_klant', k.eigenaar, 'kans', k.id); });
  // 17. termijn_verzonden_heeft_factuurnummer: verzonden of betaald met een uniek factuurnummer en een bestaand project
  var tIds = {}, nrs = {}; S.trajecten.forEach(function (t) { tIds[String(t.id)] = true; });
  S.facturen.forEach(function (f) { if (f.factuurnummer !== '' && f.factuurnummer != null) { var n0 = nrSleutel(f.factuurnummer); nrs[n0] = (nrs[n0] || 0) + 1; } });
  S.facturen.forEach(function (f) {
    if (['verzonden', 'betaald'].indexOf(f.status) < 0 && !f.verzonden) return;
    if (f.factuurnummer === '' || f.factuurnummer == null || nrs[nrSleutel(f.factuurnummer)] > 1 || !tIds[String(f.trajectId)]) af('termijn_verzonden_heeft_factuurnummer', 'boekhouder', 'factuur', f.id);
  });
  // 18. tarief_echt: een lopend project met uren heeft een tarief > 0, niet de standaardwaarde, en een XPS-projectkoppeling
  var metUren = {}, std = norm('standaardTarief'); S.uren.forEach(function (u) { if (u.trajectId && Number(u.uren) > 0) metUren[String(u.trajectId)] = true; });
  S.trajecten.forEach(function (t) {
    if (!projectLopend(t) || !metUren[String(t.id)]) return;
    if (!(Number(t.tarief) > 0) || !t.xpsProject || (std !== null && centen(t.tarief) === centen(std))) af('tarief_echt', t.am || 'beheerder', 'project', t.id);
  });
  if (std === null) { if (!vind_.tarief_echt.afwijkingen.length) zet('tarief_echt', 'niet getoetst', 'standaarddeel: ' + NORM_ONTBREEKT + ' (aanname standaardTarief)'); else vind_.tarief_echt.reden = 'standaarddeel: ' + NORM_ONTBREEKT; }
  // 19. verlenging_bekend: elk project van het vorige schooljaar heeft een verlengingsstatus
  var vorigSj = vorigSchooljaar(sj);
  S.trajecten.forEach(function (t) { if (t.schooljaar === vorigSj && t.status !== 'onduidelijk' && !t.verlenging) af('verlenging_bekend', t.am || 'beheerder', 'project', t.id); });
  // stand: gezakt zodra er een afwijking is (ook als een deel niet getoetst is)
  uit.forEach(function (x) { if (x.afwijkingen.length && x.stand !== 'geblokkeerd') x.stand = 'gezakt'; });
  return uit;
}

/* ----- v7.9 (punt 10): de dagelijkse controle (tabblad Datakwaliteit) en een melding per eigenaar ----- */

var DQ_MAX_VERWIJZINGEN = 50, DQ_BEWAAR_DAGEN = 90;
// Per contract × eigenaar één rij (gezakt) of per contract één rij voor de beheerder (geslaagd, niet getoetst, geblokkeerd). Idempotent per dag.
// Per ontvanger hoogstens één melding per dag; beheerder en boekhouder gaan naar het management. opties.stil = geen meldingen (de demo-seed).
function datakwaliteitDag(vandaag, opties) {
  vandaag = vandaag || datumStr(new Date());
  if (lees('Datakwaliteit').some(function (r) { return String(r.dag) === vandaag; })) return { dag: vandaag, al: true, rijen: 0, meldingen: 0 };
  var C = datacontracten(standVoorContracten(vandaag)), rijen = [], perOntvanger = {}, t = nu();
  C.forEach(function (c) {
    if (c.stand !== 'gezakt') { rijen.push({ id: 'dq-' + vandaag + '-' + c.id + '-beheerder', dag: vandaag, contract: c.id, eigenaar: 'beheerder', stand: c.stand, aantal: 0, verwijzingen: '[]', aangemaakt: t }); return; }
    var per = {}; c.afwijkingen.forEach(function (a) { (per[a.eigenaar] = per[a.eigenaar] || []).push(a.soort + ':' + a.id); });
    Object.keys(per).forEach(function (e) {
      rijen.push({ id: 'dq-' + vandaag + '-' + c.id + '-' + slug(e), dag: vandaag, contract: c.id, eigenaar: e, stand: 'gezakt', aantal: per[e].length, verwijzingen: JSON.stringify(per[e].slice(0, DQ_MAX_VERWIJZINGEN)), aangemaakt: t });
      var naar = e === 'beheerder' || e === 'boekhouder' ? teamNamen('management') : [e];
      naar.forEach(function (n) { var x = perOntvanger[n] || (perOntvanger[n] = { n: 0, labels: [] }); x.n += per[e].length; if (x.labels.indexOf(c.label) < 0) x.labels.push(c.label); });
    });
  });
  metLock(function () { schrijfVeel('Datakwaliteit', rijen); });
  var meldingen = 0;
  if (!(opties && opties.stil)) Object.keys(perOntvanger).forEach(function (n) {  // N12: geblokkeerd of niet getoetst geeft geen melding
    var x = perOntvanger[n];
    meld([n], 'Datakwaliteit: ' + x.n + (x.n === 1 ? ' punt' : ' punten') + ' om op te lossen (' + x.labels.join(', ') + ').', 'rapport:datakwaliteit', { door: 'Athena', ookZelf: true }); meldingen++;
  });
  return { dag: vandaag, al: false, rijen: rijen.length, meldingen: meldingen, gezakt: C.filter(function (c) { return c.stand === 'gezakt'; }).length };
}
// Na 90 dagen weg (in archiveer(), naast opruimMetingen); Fasewissels nooit
function opruimDatakwaliteit() { var grens = datumStr(plusDagen(-DQ_BEWAAR_DAGEN)); return verwijderRijen('Datakwaliteit', function (r) { return !!String(r.dag) && String(r.dag) < grens; }); }

/* ----- v7.9 (punt 18): voorspellingslog (M13 deals per week, M19 opdrachten in 30 dagen); vastgelegd vóór de periode, daarna gescoord ----- */

var VOORSPELLING_WEKEN = 12;  // concept-standaard (aanname voorspellingWeken)
function maandagVan(d) { var x = parseDatum(d) || new Date(); return new Date(x.getFullYear(), x.getMonth(), x.getDate() - (isoDag(x) - 1), 12); }
// p-percentiel (nearest rank) van een lijst getallen
function nearestRank(l, p) { if (!l.length) return ''; var s = l.slice().sort(function (a, b) { return a - b; }); return s[Math.max(0, Math.ceil(p / 100 * s.length) - 1)]; }
function dealsTussen(van, tot) { return dealWissels().filter(function (w) { return w.werkelijkeDatum && w.werkelijkeDatum >= van && w.werkelijkeDatum <= tot; }).length; }
// M13: de N aaneengesloten hele ISO-weken vóór deze week; per week het aantal deals (per kans één, N8; een week zonder akkoord telt als 0)
function voorspelDealsWeek(maandag) {
  var ma = maandagVan(maandag), a = aanname('voorspellingWeken'), n = Math.max(1, Math.min(104, Math.round(a ? Number(a.waarde) || VOORSPELLING_WEKEN : VOORSPELLING_WEKEN))), tel = [];
  for (var i = n; i >= 1; i--) { var b = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() - 7 * i, 12), e = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 6, 12); tel.push(dealsTussen(datumStr(b), datumStr(e))); }
  var zo = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() + 6, 12), gem = tel.reduce(function (s, x) { return s + x; }, 0) / tel.length, reg = registerVan('voorspellingDeals');
  return { id: 'vd-' + isoWeekStr(ma), aangemaakt: nu(), soort: 'deals-week', periode: isoWeekStr(ma), verwacht: Math.round(gem * 10) / 10, onder: nearestRank(tel, 10), boven: nearestRank(tel, 90),
    model: 'gemiddelde-hele-weken', versie: reg ? reg.versie : 0, werkelijk: '', gescoord: '', fout: '', binnenInterval: '', van: datumStr(ma), tot: datumStr(zo) };
}
// M19: open kansen vanaf voorstel met een verwachte tekendatum in [peildatum, peildatum + 29] (kalenderdagen); zonder rollen niet te voorspellen
function voorspelOpdrachten30(peildatum) {
  var tot = plusDagenVan(peildatum, 29), reg = registerVan('verwachteOpdrachten'), basis = { id: 'vo30-' + peildatum, aangemaakt: nu(), soort: 'opdrachten-30d', periode: peildatum, onder: '', boven: '',
    versie: reg ? reg.versie : 0, werkelijk: '', gescoord: '', fout: '', binnenInterval: '', van: peildatum, tot: tot };
  if (rolBlokkade()) { basis.verwacht = ''; basis.model = 'geblokkeerd'; return basis; }
  basis.verwacht = lees('Kansen').filter(function (k) { var vs = String(k.verwachteSluiting || '').slice(0, 10); return kansOpen(k) && vanafVoorstel(k.fase, pipelineVan(k)) && vs >= peildatum && vs <= tot; }).length;
  basis.model = 'verwachte-tekendatum';
  return basis;
}
// v7.9 (review C7): een deal komt vaak dagen na de werkelijke datum in Athena (registratievertraging, M35). Scoren gebeurt daarom pas als na het einde
// van de periode de marge voorbij is: de aanname registratieNorm in dagen, minstens VOORSPELLING_MARGE_DAGEN kalenderdagen.
var VOORSPELLING_MARGE_DAGEN = 7;
function scoringsMarge() { var a = aanname('registratieNorm'), n = a ? Number(a.waarde) : NaN; return Math.max(VOORSPELLING_MARGE_DAGEN, isFinite(n) && n > 0 ? Math.round(n) : 0); }
// Elke rij waarvan de periode plus de marge voorbij is en die nog niet gescoord is (gemist en geblokkeerd niet): werkelijk = deals (per kans één) met werkelijke datum in [van, tot]
function scoorVoorspellingen(vandaag) {
  var rijen = [], marge = scoringsMarge();
  lees('Voorspellingen').forEach(function (r) {
    if (r.gescoord || r.model === 'gemist' || r.model === 'geblokkeerd' || !r.tot || plusDagenVan(String(r.tot).slice(0, 10), marge) >= vandaag) return;
    var w = dealsTussen(String(r.van), String(r.tot)), v = Number(r.verwacht) || 0, interval = r.onder !== '' && r.boven !== '';
    rijen.push({ id: r.id, werkelijk: w, gescoord: nu(), fout: Math.round((w - v) * 10) / 10, binnenInterval: interval ? (w >= Number(r.onder) && w <= Number(r.boven) ? 'ja' : 'nee') : '' });
  });
  if (rijen.length) metLock(function () { schrijfVeel('Voorspellingen', rijen); });
  return rijen.length;
}
// Elke dag: eerst scoren, dan op maandag voorspellen. Op een andere dag zonder rij voor deze week (de maandagrun mislukte): "gemist", nooit achteraf voorspellen (R3).
function voorspellingenRun(vandaag) {
  vandaag = vandaag || datumStr(new Date());
  var gescoord = scoorVoorspellingen(vandaag), ma = maandagVan(vandaag), maS = datumStr(ma), wk = isoWeekStr(ma), bestaat = {};
  lees('Voorspellingen').forEach(function (r) { bestaat[String(r.id)] = true; });
  var nieuw = [];
  if (vandaag === maS) {
    if (!bestaat['vd-' + wk]) nieuw.push(voorspelDealsWeek(ma));
    if (!bestaat['vo30-' + maS]) nieuw.push(voorspelOpdrachten30(maS));
  } else {
    var zo = datumStr(new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() + 6, 12));
    if (!bestaat['vd-' + wk]) nieuw.push({ id: 'vd-' + wk, aangemaakt: nu(), soort: 'deals-week', periode: wk, verwacht: '', onder: '', boven: '', model: 'gemist', versie: '', werkelijk: '', gescoord: '', fout: '', binnenInterval: '', van: maS, tot: zo });
    if (!bestaat['vo30-' + maS]) nieuw.push({ id: 'vo30-' + maS, aangemaakt: nu(), soort: 'opdrachten-30d', periode: maS, verwacht: '', onder: '', boven: '', model: 'gemist', versie: '', werkelijk: '', gescoord: '', fout: '', binnenInterval: '', van: maS, tot: plusDagenVan(maS, 29) });
  }
  if (nieuw.length) metLock(function () { schrijfVeel('Voorspellingen', nieuw); });
  return { gescoord: gescoord, voorspeld: nieuw.filter(function (r) { return r.model !== 'gemist'; }).length, gemist: nieuw.filter(function (r) { return r.model === 'gemist'; }).length };
}

/* ----- v7.9 (punt 10, 18, 21): één dagelijkse trigger (tijdbewaking per stap, inhalen) ----- */

var STURING_MAX_MS = 4 * 60000;
function sturingKlok() { return Date.now(); }  // de klok van de tijdbewaking (een test vervangt hem)
function sturingTrigger() {
  GEBRUIKER = null;
  var start = sturingKlok(), vandaag = datumStr(new Date()), uit = {};
  var stap = function (naam, fn) {
    if (sturingKlok() - start > STURING_MAX_MS) { uit[naam] = 'overgeslagen (tijd)'; return; }  // R3: een gemiste stap haalt de volgende run in
    try { uit[naam] = fn(); } catch (e) { uit[naam] = 'fout: ' + ((e && e.message) || e); Logger.log('sturingTrigger ' + naam + ' mislukt: ' + e); }
  };
  stap('datakwaliteit', function () { return datakwaliteitDag(vandaag); });
  stap('voorspelling', function () { return voorspellingenRun(vandaag); });
  stap('bevroren', function () { return maandstandAlsNodig(vandaag); });
  P.setProperty('LAATSTE_STURING', nu());
  return uit;
}
// v7.9 (punt 21): de laatste donderdag van de maand van d (datumcomponenten, 12:00 tegen de zomertijd)
function laatsteDonderdag(d) { var x = parseDatum(d) || new Date(), l = new Date(x.getFullYear(), x.getMonth() + 1, 0, 12); while (l.getDay() !== 4) l = new Date(l.getFullYear(), l.getMonth(), l.getDate() - 1, 12); return datumStr(l); }
// Op de laatste donderdag, of op de eerstvolgende run daarna als die donderdag mislukte (peildatum = de inhaaldag); één maandstand per maand.
// v7.9 (review C5): ook over de maandgrens: viel de laatste donderdag op de laatste dag(en) van de maand en mislukte de run, dan haalt de eerste run
// in de nieuwe maand de stand van de vorige maand in (sleutel = de vorige maand, label ingehaald). Alleen als de trigger in die maand al liep
// (LAATSTE_STURING), zodat een nieuwe installatie geen stand voor een maand van vóór de installatie maakt.
function maandstandAlsNodig(vandaag) {
  var d = parseDatum(vandaag), vorigeDag = datumStr(new Date(d.getFullYear(), d.getMonth(), 0, 12)), vorige = vorigeDag.slice(0, 7);
  var vorigeRun = String(P.getProperty('LAATSTE_STURING') || '').slice(0, 7), ingehaald = null;
  if (vorigeRun && vorigeRun >= vorige && vandaag > laatsteDonderdag(vorigeDag) && !maandstandBestaat(vorige)) ingehaald = sturingBevriezen(vandaag, 'maand', vorige);
  var uit = vandaag < laatsteDonderdag(vandaag) ? { maand: vandaag.slice(0, 7), nogNiet: true } : sturingBevriezen(vandaag, 'maand');
  if (ingehaald) uit.ingehaald = ingehaald;
  return uit;
}
// De maand van een maandstand staat in het id (st-m-<yyyy-MM>-…), want een ingehaalde stand heeft een peildatum in de maand erna
function standMaand(r) { var m = /^st-m-(\d{4}-\d{2})-/.exec(String(r.id || '')); return m ? m[1] : String(r.peildatum).slice(0, 7); }
function maandstandBestaat(maand) { return lees('Standen').some(function (r) { return r.soort === 'maand' && standMaand(r) === maand; }); }
// soort maand (de trigger, één per maand) of tussenstand (de knop, hoogstens één per dag; vervangt de maandstand nooit, R4).
// Per cijfer en uitsplitsing een rij, met de definitie zoals die op de peildatum gold (N5); één schrijfVeel binnen metLock.
function sturingBevriezen(peildatum, soort, maandSleutel) {
  var maand = soort === 'maand' && maandSleutel ? String(maandSleutel) : String(peildatum).slice(0, 7), standen = lees('Standen');  // review C5: een ingehaalde maand
  if (soort === 'maand' && standen.some(function (r) { return r.soort === 'maand' && standMaand(r) === maand; })) return { peildatum: peildatum, maand: maand, soort: soort, al: true, rijen: 0 };
  if (soort === 'tussenstand' && standen.some(function (r) { return r.soort === 'tussenstand' && String(r.peildatum) === peildatum; })) return { peildatum: peildatum, soort: soort, al: true, rijen: 0 };
  var S = sturingCijfers(peildatum), pre = 'st-' + (soort === 'maand' ? 'm-' + maand : 't-' + peildatum) + '-', t = nu(), rijen = [];
  S.blokken.forEach(function (b) {
    b.cijfers.forEach(function (c) {
      var basis = { peildatum: peildatum, soort: soort, metriek: c.id, m: c.m, versie: c.def.versie, status: c.def.status, eigenaar: c.def.eigenaar, geblokkeerd: c.geblokkeerd || '', definitie: c.def.definitie, aangemaakt: t };
      var rij = { id: pre + c.id, uitsplitsing: '', waarde: c.waarde === '' || c.waarde === null || c.waarde === undefined ? '' : c.waarde };
      Object.keys(basis).forEach(function (k) { rij[k] = basis[k]; }); rijen.push(rij);
      (c.uitsplitsing || []).forEach(function (u, i) { var r2 = { id: pre + c.id + '-' + slug(u.label || String(i)), uitsplitsing: String(u.label), waarde: u.waarde }; Object.keys(basis).forEach(function (k) { r2[k] = basis[k]; }); rijen.push(r2); });
    });
  });
  metLock(function () { schrijfVeel('Standen', rijen); });
  return { peildatum: peildatum, maand: maand, soort: soort, al: false, rijen: rijen.length };
}
// De knop "Tussenstand vastleggen": een tussenstand van vandaag (alleen management)
function apiSturingBevriezen() { alleenBeheerder(); var r = sturingBevriezen(datumStr(new Date()), 'tussenstand'); r.standen = standenLijst(); return r; }
// Alle bevroren standen voor de keuze in het MT-overzicht (nieuwste eerst)
function standenLijst() {
  var gezien = {}, uit = [];
  lees('Standen').forEach(function (r) {
    var p = String(r.peildatum).slice(0, 10), sl = r.soort === 'maand' ? standMaand(r) : p; if (gezien[r.soort + '|' + sl]) return; gezien[r.soort + '|' + sl] = true;
    var d = r.soort === 'maand' ? parseDatum(sl + '-15') : parseDatum(p), ld = laatsteDonderdag(r.soort === 'maand' ? sl + '-15' : p);  // review C5: de maand uit het id
    uit.push({ sleutel: sl, soort: r.soort, peildatum: p, ingehaald: r.soort === 'maand' && p !== ld,
      label: r.soort === 'maand' ? 'Maandstand ' + MAANDEN[d.getMonth()] + ' ' + d.getFullYear() + ' (peildatum ' + p + ')' + (p !== ld ? ' (ingehaald)' : '') : 'Tussenstand ' + p });
  });
  return uit.sort(function (a, b) { return b.peildatum.localeCompare(a.peildatum) || (a.soort === 'maand' ? -1 : 1); });
}

/* ----- v7.9 (punt 19): de weekweergave (M14, M15, M16, M17, M35) per OC, met het teamtotaal ----- */

var WEEK_TOTAAL_MIN_ANDEREN = 3;  // review P5 (R8)
var WEEK_CIJFERS = ['contactmomenten', 'afsprakenGehouden', 'afsprakenGepland', 'ap', 'ad', 'voorstellen', 'gewonnen', 'registratievertraging', 'weekdoel'];
// rijen = [{ naam, leden: [namen] }]: elke regel telt de activiteit en de wissels van zijn leden (een OC zichzelf, de regel "beheerder" het management)
function weekCijfers(B, rijen) {
  var wie = {}, uit = {}, nu0 = nu(), volgMa = plusDagenVan(B.van, 7), volgVr = plusDagenVan(B.van, 11), normA = aanname('registratieNorm'), norm = normA ? Number(normA.waarde) : null;
  rijen.forEach(function (r) {
    uit[r.naam] = { contactmomenten: 0, afsprakenGehouden: 0, afsprakenGepland: 0, ap: 0, ad: 0, voorstellen: 0, gewonnen: 0, direct: 0, zonderDatum: 0, vertraging: [] };
    r.leden.forEach(function (n) { (wie[n] = wie[n] || []).push(r.naam); });
  });
  var bij = function (namen, veld, n) { (namen || []).forEach(function (x) { uit[x][veld] += n === undefined ? 1 : n; }); };
  lees('Activiteiten').forEach(function (a) {
    var namen = wie[String(a.door || '')]; if (!namen) return;
    var vorm = vormVan(a), dag = String(a.datum).slice(0, 10), d = parseDatum(dag); if (!d) return;
    var inWeek = dag >= B.van && dag <= B.tot && String(a.datum) <= nu0;
    if (inWeek && CONTACT_VORMEN.indexOf(vorm) >= 0 && isoDag(d) <= 5) bij(namen, 'contactmomenten');
    if (AFSPRAAK_VORMEN.indexOf(vorm) >= 0 && a.schoolId) { if (inWeek) bij(namen, 'afsprakenGehouden'); else if (dag >= volgMa && dag <= volgVr) bij(namen, 'afsprakenGepland'); }
  });
  tellendeWissels().forEach(function (w) {
    var namen = wie[String(w.eigenaar || '')]; if (!namen) return;
    var wd = String(w.werkelijkeDatum || '');
    if (wd && wd >= B.van && wd <= B.tot) {
      var r = telRol(w);
      if (r === 'ap' || r === 'ad') bij(namen, r); else if (r === 'voorstel') bij(namen, 'voorstellen'); else if (r === 'deal') bij(namen, 'gewonnen');
      if (wisselLabel(w) === 'direct') bij(namen, 'direct');
      var rd = IMPORT_BRONNEN.indexOf(w.bron) < 0 ? registratieDagen(w) : null;  // R15: kalenderdagen; een import of reconstructie is geen registratie op het moment zelf
      if (rd !== null) namen.forEach(function (x) { uit[x].vertraging.push(rd); });
    }
    if (!wd && String(w.ingevoerdOp || '').slice(0, 10) >= B.van && String(w.ingevoerdOp || '').slice(0, 10) <= B.eind) bij(namen, 'zonderDatum');
  });
  Object.keys(uit).forEach(function (n) {
    var x = uit[n], v = x.vertraging;
    x.registratievertraging = mediaan(v);
    x.vertraging = { mediaan: mediaan(v), aantal: v.length, norm: norm === null ? NORM_ONTBREEKT : norm, boven: norm === null || !v.length ? null : Math.round(100 * v.filter(function (d) { return d > norm; }).length / v.length) };
  });
  return uit;
}

/* ----- v7.9 (punt 20, 24): het MT-overzicht in blokken; elk cijfer met zijn definitie uit het register, geblokkeerd in plaats van een schatting ----- */

var STURING_BLOKKEN = [
  { id: 'koers', label: 'Koers op het jaardoel', besluit: 'B1 en B2', cijfers: ['jaardoel', 'omzetVorigJaar', 'retentie', 'gecontracteerd', 'doelpad', 'gewogenPijplijn', 'dekking', 'gewonnenWaarde', 'urenVorigeJaren', 'nettoOmzet'] },
  { id: 'aanpak', label: 'Capaciteit en aanpak', besluit: 'B3', cijfers: ['benodigdeActiviteit', 'conversie', 'voorspellingDeals'] },
  { id: 'pipeline', label: 'Pipeline', besluit: 'B5 en B6', cijfers: ['funnel', 'verwachteOpdrachten', 'stilstand', 'verloren', 'icpDeciel'] },
  { id: 'octeam', label: 'OC-team', besluit: 'B7', cijfers: ['ocActiviteit'] },
  { id: 'verlengingen', label: 'Verlengingen', besluit: 'B8', cijfers: ['verlengingsstand'] },
  { id: 'facturatie', label: 'Facturatie en innen', besluit: 'B9 en B10', cijfers: ['geleverd', 'gefactureerd', 'nogTeFactureren', 'openstaand'] },
  { id: 'realisatie', label: 'Realisatie per project', besluit: 'B11', cijfers: ['realisatiegraad'] },
  { id: 'marge', label: 'Marge en prijs', besluit: 'B12 en B13', cijfers: ['brutomarge', 'onderOndergrens', 'offertemarge', 'teamInhoud'] },
  { id: 'datakwaliteit', label: 'Datakwaliteit', besluit: 'B14', cijfers: ['datakwaliteit', 'registratievertraging', 'logdekking'] }
];
var KLANT_DELEN = ['nieuw', 'bestaand', 'onbekend'];
function euro2(c) { return Math.round(c) / 100; }
function klantDeel(k) { return k && (k.klant === 'nieuw' || k.klant === 'bestaand') ? k.klant : 'onbekend'; }
function delenUit(o) { return KLANT_DELEN.filter(function (d) { return o[d]; }).map(function (d) { return { label: d, waarde: Math.round(o[d] * 100) / 100 }; }); }
// M09: gewerkte uren per maand van een schooljaar, uit TalentUren en (alleen vanaf het begin van dat schooljaar) TalentUren_archief (R9); weken t/m de peildatum.
// Per maand ook bestaand, nieuw en onbekend (Trajecten.klant, anders het klantvoorstel op de school). Niet op Home of Financiën; financienData() blijft ongewijzigd (K1).
function urenPerMaand(sj, peildatum) {
  var wkStart = isoWeekStr(new Date(Number(sj.slice(0, 4)), 7, 1, 12)), wkTot = isoWeekStr(parseDatum(peildatum) || new Date()), tMap = perId(lees('Trajecten')), sMap = perId(lees('Scholen'));
  var ks = klantSleutels(vorigSchooljaar(sj)), maanden = {};
  schooljaarMaanden(sj).forEach(function (m) { maanden[m] = { maand: m, uren: 0, nieuw: 0, bestaand: 0, onbekend: 0 }; });
  var klantVan = function (t) { if (!t) return 'onbekend'; if (t.klant === 'nieuw' || t.klant === 'bestaand') return t.klant; var s = sMap[String(t.schoolId || '')]; return s ? (ks[schoolSleutel(s)] ? 'bestaand' : 'nieuw') : 'onbekend'; };
  var tel = function (r) { var w = String(r.week || ''); if (w < wkStart || w > wkTot) return; var x = maanden[maandVan(maandagVanWeek(w))]; if (!x) return; var u = Number(r.uren) || 0; x.uren += u; x[klantVan(tMap[String(r.trajectId || '')])] += u; };
  lees('TalentUren').forEach(tel);
  lees('TalentUren_archief').forEach(function (r) { if (String(r.week || '') >= wkStart) tel(r); });
  return schooljaarMaanden(sj).map(function (m) { var x = maanden[m]; ['uren', 'nieuw', 'bestaand', 'onbekend'].forEach(function (k) { x[k] = Math.round(x[k] * 100) / 100; }); return x; });
}
// De overstapstand voor het datakwaliteitsblok (zonder de zware tijdlijntelling van apiMigratieV79('status'))
function overstapStand() {
  var kOpen = lees('Kansen').filter(kansOpen), grens = datumStr(plusDagen(-30)) + ' 00:00';
  return { rollen: rollenStatus(), redenenGekoppeld: redenenGekoppeld(), zonderSchooljaar: kOpen.filter(function (k) { return !k.schooljaar; }).length, zonderKlant: kOpen.filter(function (k) { return !k.klant; }).length,
    verwijderd30: lees('Fasewissels').filter(function (w) { return w.verwijderd && String(w.verwijderd) >= grens; }).length };
}
// De rijen van de laatste dag met rijen in Datakwaliteit (t/m een dag), anders null
function dqRijenVan(totDag) {
  var alle = lees('Datakwaliteit'), dag = ''; alle.forEach(function (r) { var d = String(r.dag); if (d <= totDag && d > dag) dag = d; });
  return dag ? { dag: dag, rijen: alle.filter(function (r) { return String(r.dag) === dag; }) } : null;
}
function cijferUit(id, x, peildatum) {
  var reg = registerVan(id, peildatum), blok = x.geblokkeerd || reg.blokkade || '';
  return { id: id, m: reg.m, label: reg.label, soort: reg.soort, waarde: blok || x.waarde === null || x.waarde === undefined ? '' : x.waarde, uitsplitsing: blok ? [] : x.uitsplitsing || [], extra: x.extra || {}, geblokkeerd: blok,
    def: { versie: reg.versie, status: reg.status, definitie: reg.definitie, eigenaar: reg.eigenaar, wachtOp: reg.wachtOp } };
}
// Alle cijfers op een peildatum (standaard vandaag), zonder gebruiker (het MT-overzicht, de maandstand en het harnas)
function sturingCijfers(peildatum) {
  var vandaag = datumStr(new Date()); peildatum = peildatum || vandaag;
  var sj = sjOp(peildatum), sjStart = sj.slice(0, 4) + '-08-01', maandStart = peildatum.slice(0, 8) + '01', N = jaardoelNoemer(peildatum, sj), scope = sturingScope(peildatum, N);
  var sMap = perId(lees('Scholen')), naarSchool = {}; Object.keys(sMap).forEach(function (id) { naarSchool[klein(sMap[id].naam)] = sMap[id]; });
  var schoolVan = function (k) { return sMap[String(k.schoolId || '')] || naarSchool[klein(k.school)] || null; };
  var binnen = function (s) { return !scope.lijst.length || !s || scope.lijst.indexOf(klein(s.type)) < 0; };
  var kansen = lees('Kansen'), kMap = perId(kansen), ts = lees('Trajecten'), open = kansen.filter(kansOpen), rolBlok = rolBlokkade(), redenOk = redenenGekoppeld();
  var tPerKans = {}; ts.forEach(function (t) { if (t.kansId) (tPerKans[String(t.kansId)] = tPerKans[String(t.kansId)] || []).push(t); });
  var cw = function (kansId) { return (tPerKans[String(kansId)] || []).reduce(function (s, t) { return s + (Number(t.contractwaarde) || 0); }, 0); };
  var aw = function (n) { return aannameWaarde(n, peildatum); }, C = {}, scopeTekst = scope.lijst.length ? 'binnen de scope (zonder: ' + scope.lijst.join(', ') + ')' : '';
  // ---- koers ----
  C.jaardoel = N.volledig ? { waarde: N.jaardoel, extra: { soort: N.soort, periode: N.periode, scope: N.scopeLabel, noemer: N.noemer, noemerLabel: N.ok ? N.label : '', noemerWaarde: N.ok ? N.waarde : '', reden: N.reden || '' } } : { geblokkeerd: JAARDOEL_BLOKKADE };
  var ov = aw('omzetVorigJaar'), ovW = ov && typeof ov === 'object' ? Number(ov.waarde) : ov === null ? null : Number(ov);
  C.omzetVorigJaar = ovW === null || !isFinite(ovW) ? { geblokkeerd: 'extern: grootboek van de boekhouder (§6)' } : { waarde: ovW, extra: { boekjaar: ov && ov.boekjaar ? ov.boekjaar : '' } };
  var ret = aw('retentie'), doelB = null, doelN = null, verdeling = '';
  if (ret === null) C.retentie = { geblokkeerd: AANNAMES_BLOKKADE };
  else {
    if (!N.ok) verdeling = N.volledig ? N.reden : JAARDOEL_BLOKKADE;
    else if (N.label !== 'jaardoel') verdeling = 'verdeling bestaand/nieuw bij een afgeleid contracteerdoel (§5 besluit 2)';
    else if (C.omzetVorigJaar.geblokkeerd) verdeling = C.omzetVorigJaar.geblokkeerd;
    else { doelB = Math.round(ovW * Number(ret)); doelN = N.waarde - doelB; }
    C.retentie = { waarde: Number(ret), extra: doelB === null ? { verdeling: 'geblokkeerd: ' + verdeling } : { doelBestaand: doelB, doelNieuw: doelN } };
  }
  // M04: de getekende contractwaarde van de gewonnen kansen van het schooljaar (binnen de scope); zonder getekende waarde als aantal apart
  var m04 = { nieuw: 0, bestaand: 0, onbekend: 0 }, zonderGetekend = 0, totM04 = 0;
  kansen.forEach(function (k) {
    if (k.fase !== 'gewonnen' || !binnen(schoolVan(k))) return;
    var ksj = k.schooljaar ? String(k.schooljaar) : ((tPerKans[String(k.id)] || [])[0] || {}).schooljaar || (k.gesloten ? schooljaarVan(k.gesloten) : '');
    if (ksj !== sj) return;
    var w = cw(k.id); if (!(w > 0)) { zonderGetekend++; return; }
    m04[klantDeel(k)] += w; totM04 += w;
  });
  C.gecontracteerd = { waarde: Math.round(totM04 * 100) / 100, uitsplitsing: delenUit(m04), extra: { zonderGetekend: zonderGetekend, scope: scopeTekst } };
  // M06: open kansen van het schooljaar × fasegewicht (lead 0), binnen de scope
  var m06 = { nieuw: 0, bestaand: 0, onbekend: 0 }, totM06 = 0, zonderWaarde = 0, zonderSj = 0, aantal06 = 0;
  open.forEach(function (k) {
    if (!binnen(schoolVan(k))) return;
    if (!k.schooljaar) { zonderSj++; return; }
    if (String(k.schooljaar) !== sj) return;
    var g = fasegewichtVan(k); if (!g) return;
    aantal06++; var w = Number(k.waarde) || 0; if (!(w > 0)) { zonderWaarde++; return; }
    var gw = Math.round(w * g) / 100; m06[klantDeel(k)] += gw; totM06 += gw;
  });
  C.gewogenPijplijn = { waarde: Math.round(totM06 * 100) / 100, uitsplitsing: delenUit(m06), extra: { aantal: aantal06, zonderWaarde: zonderWaarde, zonderSchooljaar: zonderSj, scope: scopeTekst } };
  // M05 doelpad en M07 dekking: alleen met een bruikbare noemer (B3); nooit een schatting
  var nBlok = N.ok ? '' : N.volledig ? N.reden : JAARDOEL_BLOKKADE, curve = aw('doelpadCurve');
  if (nBlok) C.doelpad = { geblokkeerd: nBlok };
  else if (!curve || !(curve.totaal instanceof Array)) C.doelpad = { geblokkeerd: AANNAMES_BLOKKADE };
  else {
    var dag = Math.round((middag(parseDatum(peildatum)) - middag(parseDatum(sjStart))) / 86400000), fr = curveOp(curve.totaal, dag), dp = Math.round(N.waarde * fr);
    var ex = { dag: dag, fractie: Math.round(fr * 10000) / 10000, bron: curve.bron || '', noemer: N.waarde, noemerLabel: N.label, achter: Math.round(totM04 - dp) };
    if (doelB !== null && curve.bestaand instanceof Array && curve.nieuw instanceof Array) { ex.bestaand = Math.round(doelB * curveOp(curve.bestaand, dag)); ex.nieuw = Math.round(doelN * curveOp(curve.nieuw, dag)); }
    C.doelpad = { waarde: dp, extra: ex };
  }
  C.dekking = nBlok ? { geblokkeerd: nBlok } : { waarde: Math.round(1000 * (totM04 + totM06) / N.waarde) / 10, extra: { nogTeVinden: Math.round(N.waarde - totM04 - totM06), noemer: N.waarde, noemerLabel: N.label, scope: scopeTekst } };
  // M08: deals (per kans één, N8) met akkoorddatum in het schooljaar t/m de peildatum; de maand apart; zonder werkelijke datum apart
  var m08 = { nieuw: 0, bestaand: 0, onbekend: 0 }, tot08 = 0, n08 = 0, maand08 = { aantal: 0, waarde: 0 }, zonderDatum08 = 0;
  dealWissels().forEach(function (w) {
    if (!w.werkelijkeDatum) { zonderDatum08++; return; }
    if (w.werkelijkeDatum < sjStart || w.werkelijkeDatum > peildatum) return;
    var v = Number(w.waarde) || 0; n08++; tot08 += v; m08[klantDeel(kMap[String(w.kansId)])] += v;
    if (w.werkelijkeDatum >= maandStart) { maand08.aantal++; maand08.waarde += v; }
  });
  C.gewonnenWaarde = { waarde: Math.round(tot08 * 100) / 100, uitsplitsing: delenUit(m08), extra: { aantal: n08, maand: maand08, zonderDatum: zonderDatum08 } };
  // M09: uren per maand naast de basislijn van vorige schooljaren (punt 24)
  var maanden09 = urenPerMaand(sj, peildatum), heel = maanden09.filter(function (x) { return x.maand < peildatum.slice(0, 7); }), bl = aw('urenBasislijn');
  var som09 = { nieuw: 0, bestaand: 0, onbekend: 0 }, tot09 = 0; heel.forEach(function (x) { tot09 += x.uren; KLANT_DELEN.forEach(function (d) { som09[d] += x[d]; }); });
  var basislijn = {};
  if (bl && typeof bl === 'object') Object.keys(bl).forEach(function (vsj) { var ms = schooljaarMaanden(vsj), b = bl[vsj] || {}; basislijn[vsj] = heel.reduce(function (s, x) { var i = schooljaarMaanden(sj).indexOf(x.maand); return s + (Number(b[ms[i]]) || 0); }, 0); });
  C.urenVorigeJaren = !bl || !Object.keys(basislijn).length ? { geblokkeerd: 'basislijn vorige jaren ontbreekt (§5 besluit 14)', extra: { maanden: maanden09 } }
    : { waarde: Math.round(tot09 * 100) / 100, uitsplitsing: delenUit(som09), extra: { maanden: maanden09, basislijn: basislijn, totEnMet: heel.length ? heel[heel.length - 1].maand : '' } };
  C.nettoOmzet = {};  // blokkade uit het register (extern)
  // ---- aanpak ----
  var conv = conversieSchooljaar(sjStart, peildatum, kMap);
  if (!N.volledig) C.benodigdeActiviteit = { geblokkeerd: JAARDOEL_BLOKKADE };
  else if (doelN === null) C.benodigdeActiviteit = { geblokkeerd: ret === null ? AANNAMES_BLOKKADE : verdeling };
  else {
    var dw = aw('dealwaarde'), cAV = aw('conversieApVoorstel'), cVD = aw('conversieVoorstelDeal'), ww = aw('werkweken'), oc = aw('aantalOcs');
    if ([dw, cAV, cVD, ww, oc].some(function (x) { return !(Number(x) > 0); })) C.benodigdeActiviteit = { geblokkeerd: AANNAMES_BLOKKADE };
    else {
      var deals = Math.max(0, doelN) / Number(dw), vo = deals / Number(cVD), aps = vo / Number(cAV), r1 = function (x) { return Math.round(x * 10) / 10; };
      C.benodigdeActiviteit = { waarde: Math.ceil(deals), extra: { deals: r1(deals), voorstellen: r1(vo), aps: r1(aps), perWeek: { deals: r1(deals / ww), voorstellen: r1(vo / ww), aps: r1(aps / ww) },
        perOcPerWeek: { deals: r1(deals / ww / oc), voorstellen: r1(vo / ww / oc), aps: r1(aps / ww / oc) }, gemeten: rolBlok || !redenOk ? null : conv } };
    }
  }
  if (rolBlok) C.conversie = { geblokkeerd: rolBlok };
  else if (!redenOk) C.conversie = { geblokkeerd: 'niet getoetst: verliesredenen niet gekoppeld (Beheer → Overstap v7.9)' };
  else C.conversie = { waarde: conv.voDeal.n ? conv.voDeal.pct : '', extra: conv };
  var vs = lees('Voorspellingen'), wkP = isoWeekStr(parseDatum(peildatum)), lopend = vs.filter(function (r) { return String(r.id) === 'vd-' + wkP; })[0];
  var scores = vs.filter(function (r) { return r.soort === 'deals-week' && r.gescoord; }).sort(function (a, b) { return String(b.van).localeCompare(String(a.van)); }).slice(0, 8);
  var metInterval = scores.filter(function (r) { return r.binnenInterval === 'ja' || r.binnenInterval === 'nee'; }), vo30 = vs.filter(function (r) { return String(r.id) === 'vo30-' + datumStr(maandagVan(peildatum)); })[0];
  C.voorspellingDeals = { waarde: lopend && lopend.model !== 'gemist' && lopend.verwacht !== '' ? Number(lopend.verwacht) : '', extra: {
    week: wkP, onder: lopend ? lopend.onder : '', boven: lopend ? lopend.boven : '', model: lopend ? lopend.model : '', gescoord: scores.length,
    gemiddeldeFout: scores.length ? Math.round(10 * scores.reduce(function (s, r) { return s + Math.abs(Number(r.fout) || 0); }, 0) / scores.length) / 10 : '',
    binnenInterval: metInterval.length ? Math.round(100 * metInterval.filter(function (r) { return r.binnenInterval === 'ja'; }).length / metInterval.length) : '',
    gemist: vs.filter(function (r) { return r.model === 'gemist' && String(r.van) >= sjStart; }).length, opdrachten30: vo30 && vo30.verwacht !== '' ? Number(vo30.verwacht) : '' } };
  // ---- pipeline ----
  if (rolBlok) C.funnel = { geblokkeerd: rolBlok };
  else {
    var ms = mijlpalen(), meer = uniek(ms.map(function (m) { return m.pipeline; })).length > 1, perM = {}, volg = [];
    ms.forEach(function (m) { var sl = m.pipeline + '|' + m.mijlpaal, eff = (uitMap(mijlpaalRollen(m.pipeline), m.mijlpaal) || {}).effectief || ''; perM[sl] = { mijlpaal: m.mijlpaal, pipeline: m.pipeline, rol: eff, aantal: 0, waarde: 0, zonderWaarde: 0 }; volg.push(sl); });
    var totF = 0, zonderSjF = 0;
    open.forEach(function (k) {
      if (!binnen(schoolVan(k))) return;
      if (!k.schooljaar) { zonderSjF++; return; }
      if (String(k.schooljaar) !== sj) return;
      var sl = pipelineVan(k) + '|' + k.fase, x = perM[sl]; if (!x) { x = perM[sl] = { mijlpaal: k.fase, pipeline: pipelineVan(k), rol: '', aantal: 0, waarde: 0, zonderWaarde: 0 }; volg.push(sl); }
      x.aantal++; totF++; if (Number(k.waarde) > 0) x.waarde += Number(k.waarde); else x.zonderWaarde++;
    });
    var lijstF = volg.map(function (sl) { return perM[sl]; });
    C.funnel = { waarde: totF, uitsplitsing: lijstF.filter(function (x) { return x.aantal; }).map(function (x) { return { label: x.mijlpaal + (meer ? ' (' + x.pipeline + ')' : '') + (x.rol === 'lead' ? ' · lead' : ''), waarde: x.aantal }; }),
      extra: { perMijlpaal: lijstF, zonderSchooljaar: zonderSjF, scope: scopeTekst } };
  }
  if (rolBlok) C.verwachteOpdrachten = { geblokkeerd: rolBlok };
  else {
    var tot30 = plusDagenVan(peildatum, 29), w30 = 0, n30 = 0, verlopen = { aantal: 0, waarde: 0 }, zonderD = 0;
    open.forEach(function (k) {
      if (!vanafVoorstel(k.fase, pipelineVan(k))) return;
      var v0 = String(k.verwachteSluiting || '').slice(0, 10), w = Number(k.waarde) || 0;
      if (!v0) zonderD++; else if (v0 < peildatum) { verlopen.aantal++; verlopen.waarde += w; } else if (v0 <= tot30) { n30++; w30 += w; }
    });
    C.verwachteOpdrachten = { waarde: Math.round(w30 * 100) / 100, extra: { aantal: n30, verlopen: verlopen, zonderDatum: zonderD, tot: tot30 } };
  }
  var mp = mijlpaalMap(), stilPer = {}, nStil = 0;
  open.forEach(function (k) {
    var m = uitMap(mp, k.fase), norm = m && m.dagenNorm ? m.dagenNorm : 7, d = k.laatsteContact ? dagenTussen(String(k.laatsteContact).slice(0, 10), peildatum) : null;
    if (d !== null && d > norm) { nStil++; stilPer[k.fase] = (stilPer[k.fase] || 0) + 1; }
  });
  C.stilstand = { waarde: nStil, uitsplitsing: Object.keys(stilPer).map(function (f) { return { label: f, waarde: stilPer[f] }; }) };
  if (!redenOk) C.verloren = { geblokkeerd: 'niet getoetst: verliesredenen niet gekoppeld (Beheer → Overstap v7.9)' };
  else {
    var slot = {}, perReden = {}, nV = 0;
    tellendeWissels().forEach(function (w) { if (w.naar !== 'gewonnen' && w.naar !== 'verloren') return; var k = String(w.kansId), h = slot[k]; if (!h || volgordeWerkelijk(h, w) < 0) slot[k] = w; });
    Object.keys(slot).forEach(function (k) { var w = slot[k]; if (w.naar !== 'verloren' || !w.werkelijkeDatum || w.werkelijkeDatum < sjStart || w.werkelijkeDatum > peildatum) return; var r = String(w.reden || '') || '(zonder reden)'; perReden[r] = (perReden[r] || 0) + 1; nV++; });
    C.verloren = { waarde: nV, uitsplitsing: Object.keys(perReden).sort().map(function (r) { return { label: r, waarde: perReden[r] }; }), extra: { opgeschoond: perReden.opgeschoond || 0 } };
  }
  C.icpDeciel = {};
  // ---- OC-team (M23; besluit 8: het team, per OC alleen in de weekweergave) ----
  var team = teamNamen('consultancy'), inTeam = {}; team.forEach(function (n) { inTeam[n] = true; });
  var oc = { ingepland: 0, gedaan: 0, vo: rolBlok ? '' : 0, deals: 0 };
  lees('Activiteiten').forEach(function (a) {
    if (!inTeam[String(a.door || '')] || AFSPRAAK_VORMEN.indexOf(vormVan(a)) < 0) return;
    var ag = String(a.aangemaakt || '').slice(0, 10), dg = String(a.datum || '').slice(0, 10);
    if (ag >= maandStart && ag <= peildatum) oc.ingepland++;
    if (a.schoolId && dg >= maandStart && dg <= peildatum) oc.gedaan++;
  });
  tellendeWissels().forEach(function (w) { if (!inTeam[String(w.eigenaar || '')] || !w.werkelijkeDatum || w.werkelijkeDatum < maandStart || w.werkelijkeDatum > peildatum) return; var r = telRol(w); if (r === 'voorstel' && !rolBlok) oc.vo++; else if (r === 'deal') oc.deals++; });
  C.ocActiviteit = { waarde: oc.gedaan, extra: { maand: peildatum.slice(0, 7), ingepland: oc.ingepland, gedaan: oc.gedaan, vo: oc.vo, deals: oc.deals, ingeplandStatus: 'concept (besluit 8)' } };
  // ---- verlengingen (M24): scholen met een project in het vorige schooljaar, op schoolSleutel ----
  var vorig = vorigSchooljaar(sj), statussen = keuzelijst('verlenging'), perS = {};
  ts.forEach(function (t) {
    if (String(t.schooljaar) !== vorig || t.status === 'onduidelijk') return;
    var s = sMap[String(t.schoolId || '')] || naarSchool[klein(t.school)] || null; if (!binnen(s)) return;
    var sl = s ? schoolSleutel(s) : 'naam:' + klein(t.school), x = perS[sl] || (perS[sl] = { sleutel: sl, schoolId: s ? s.id : '', naam: s ? s.naam : t.school, status: '', eigenaar: '', contractwaarde: 0 });
    var st = statussen.indexOf(String(t.verlenging || '')) >= 0 ? String(t.verlenging) : '';
    if (st && (!x.status || st === 'verlengd')) x.status = st;
    if (!x.eigenaar && t.am) x.eigenaar = t.am;
    x.contractwaarde += Number(t.contractwaarde) || Number(t.omzet) || 0;
  });
  var lijstS = Object.keys(perS).map(function (k) { var x = perS[k]; if (!x.status) x.status = 'onbekend'; return x; }).sort(function (a, b) { return String(a.naam).localeCompare(String(b.naam)); });
  var cwTot = 0, cwVerl = 0, perStatus = {}; lijstS.forEach(function (x) { cwTot += x.contractwaarde; if (x.status === 'verlengd') cwVerl += x.contractwaarde; perStatus[x.status] = (perStatus[x.status] || 0) + 1; });
  C.verlengingsstand = { waarde: cwTot ? Math.round(1000 * cwVerl / cwTot) / 10 : '', extra: { scholen: lijstS, perStatus: perStatus, aantal: lijstS.length, scope: scopeTekst } };
  // ---- facturatie (M25–M28) uit financienProject(); bedragen in euro's ----
  var D = financienData(), nuM = peildatum.slice(0, 7), maandenSj = schooljaarMaanden(sj), achterA = aw('achterTolerantie'), f = { geleverd: 0, gefactureerd: 0, nogTe: 0, achter: 0, ouderdom: { '0-30': 0, '31-60': 0, '60+': 0 } };
  ts.forEach(function (t) {
    if (String(t.schooljaar) !== sj) return;
    var F = financienProject(t, D.fac[t.id] || [], D.uren[t.id] || [], termijnDagenVan(t, D)), gel = 0;
    maandenSj.forEach(function (m) { if (m > nuM) return; gel += F.per.geleverd[m] || 0; f.gefactureerd += F.per.gefactureerd[m] || 0; });
    f.geleverd += gel; f.nogTe += Math.max(0, F.nogTeFactureren);
    Object.keys(F.ouderdom).forEach(function (k) { f.ouderdom[k] += F.ouderdom[k]; });
    if (achterA !== null && t.soortFacturatie === 'achteraf' && gel - F.gefactureerd > Number(achterA) * F.contract) f.achter++;
  });
  C.geleverd = { waarde: euro2(f.geleverd), extra: { totEnMet: nuM } };
  C.gefactureerd = { waarde: euro2(f.gefactureerd), extra: { totEnMet: nuM } };
  C.nogTeFactureren = { waarde: euro2(f.nogTe), extra: { achter: achterA === null ? 'niet getoetst: ' + NORM_ONTBREEKT : f.achter } };
  C.openstaand = { waarde: euro2(f.ouderdom['0-30'] + f.ouderdom['31-60'] + f.ouderdom['60+']), uitsplitsing: ['0-30', '31-60', '60+'].map(function (k) { return { label: k + ' dagen', waarde: euro2(f.ouderdom[k]) }; }) };
  // ---- realisatie en marge: geblokkeerd (register) ----
  C.realisatiegraad = {}; C.brutomarge = {}; C.onderOndergrens = {}; C.offertemarge = {}; C.teamInhoud = {};
  // ---- datakwaliteit (M34–M36) ----
  var dq = dqRijenVan(peildatum), perC = {};
  if (dq) dq.rijen.forEach(function (r) { var x = perC[r.contract] || (perC[r.contract] = { stand: 'geslaagd', aantal: 0 }); if (r.stand === 'gezakt') { x.stand = 'gezakt'; x.aantal += Number(r.aantal) || 0; } else if (x.stand !== 'gezakt') x.stand = r.stand; });
  var labels = {}; CONTRACTEN.forEach(function (c) { labels[c[0]] = c[1]; });
  var dqTot = 0; Object.keys(perC).forEach(function (k) { dqTot += perC[k].aantal; });
  C.datakwaliteit = dq ? { waarde: dqTot, uitsplitsing: CONTRACTEN.filter(function (c) { return perC[c[0]] && perC[c[0]].aantal; }).map(function (c) { return { label: c[0], waarde: perC[c[0]].aantal }; }),
    extra: { dag: dq.dag, contracten: CONTRACTEN.map(function (c) { var x = perC[c[0]] || { stand: 'niet getoetst', aantal: 0 }; return { id: c[0], label: c[1], stand: x.stand, aantal: x.aantal }; }), overstap: overstapStand() } }
    : { waarde: '', extra: { dag: '', contracten: [], overstap: overstapStand(), reden: 'nog geen controle gedraaid' } };
  var vtr = [], normR = aw('registratieNorm');
  tellendeWissels().forEach(function (w) { if (!inTeam[String(w.eigenaar || '')] || !w.werkelijkeDatum || w.werkelijkeDatum < maandStart || w.werkelijkeDatum > peildatum || IMPORT_BRONNEN.indexOf(w.bron) >= 0) return; var d = registratieDagen(w); if (d !== null) vtr.push(d); });
  C.registratievertraging = { waarde: vtr.length ? mediaan(vtr) : '', extra: { aantal: vtr.length, maand: nuM, norm: normR === null ? NORM_ONTBREEKT : Number(normR), boven: normR === null || !vtr.length ? '' : Math.round(100 * vtr.filter(function (d) { return d > Number(normR); }).length / vtr.length) } };
  C.logdekking = {};
  return { peildatum: peildatum, schooljaar: sj, scope: scope.lijst, scopeLabel: scope.label, noemer: N.ok ? { waarde: N.waarde, label: N.label } : null,
    blokken: STURING_BLOKKEN.map(function (b) { return { id: b.id, label: b.label, besluit: b.besluit, cijfers: b.cijfers.map(function (id) { return cijferUit(id, C[id] || {}, peildatum); }) }; }) };
}
// De fractie van de curve op een dag: lineair tussen de punten, 0 op dag 0, na het laatste punt het laatste punt
function curveOp(punten, dag) {
  var vorige = [0, 0];
  for (var i = 0; i < punten.length; i++) {
    var p = punten[i]; if (Number(p[0]) >= dag) { var d0 = Number(p[0]) - vorige[0]; return d0 > 0 ? vorige[1] + (Number(p[1]) - vorige[1]) * (dag - vorige[0]) / d0 : Number(p[1]); }
    vorige = [Number(p[0]), Number(p[1])];
  }
  return vorige[1];
}
// M12 per cohort in het schooljaar t/m de peildatum: VO → gewonnen (overall), AP → VO, en de win-rate nieuwe scholen (klant nieuw). Opgeschoond telt niet.
function conversieSchooljaar(van, tot, kMap) {
  var inP = function (s) { var d = String(s || '').slice(0, 10); return !!d && d >= van && d <= tot; }, W = tellendeWissels(), pct = function (t, n) { return n ? Math.round(1000 * t / n) / 10 : ''; };
  var vd = conversieCohort(W, inP), nieuw = vd.filter(function (c) { return klantDeel(kMap[String(c.kansId)]) === 'nieuw'; });
  // AP → VO: cohort op de eerste AP-wissel; teller = later een VO-wissel; noemer = teller + zonder VO verloren (niet opgeschoond)
  var eersteAp = {}, eersteVo = {}, slot = {};
  W.slice().sort(volgordeWerkelijk).forEach(function (w) {
    var k = String(w.kansId), r = telRol(w);
    if (r === 'ap' && !eersteAp[k]) eersteAp[k] = w; if (r === 'voorstel' && !eersteVo[k]) eersteVo[k] = w;
    if (w.naar === 'gewonnen' || w.naar === 'verloren') slot[k] = w;
  });
  var apT = 0, apN = 0;
  Object.keys(eersteAp).forEach(function (k) {
    var a = eersteAp[k]; if (!inP(a.werkelijkeDatum)) return;
    if (eersteVo[k] && String(eersteVo[k].werkelijkeDatum) >= String(a.werkelijkeDatum)) { apT++; apN++; }
    else if (slot[k] && slot[k].naar === 'verloren' && klein(slot[k].reden) !== 'opgeschoond') apN++;
  });
  var t0 = vd.filter(function (c) { return c.gewonnen; }).length, tN = nieuw.filter(function (c) { return c.gewonnen; }).length;
  return { voDeal: { gewonnen: t0, n: vd.length, pct: pct(t0, vd.length) }, apVo: { t: apT, n: apN, pct: pct(apT, apN) }, nieuw: { gewonnen: tN, n: nieuw.length, pct: pct(tN, nieuw.length) } };
}
// Een bevroren stand terug als blokken: de waarden en de definitie uit Standen (N5), niet uit de huidige code
function standUit(sleutel) {
  var rijen = lees('Standen').filter(function (r) { var p = String(r.peildatum).slice(0, 10); return r.soort === 'maand' ? /^\d{4}-\d{2}$/.test(sleutel) && standMaand(r) === sleutel : p === sleutel; });  // review C5
  if (!rijen.length) throw new Error('Deze stand bestaat niet.');
  var per = {}; rijen.forEach(function (r) { (per[String(r.metriek)] = per[String(r.metriek)] || []).push(r); });
  var peildatum = String(rijen[0].peildatum).slice(0, 10);
  var blokken = STURING_BLOKKEN.map(function (b) {
    return { id: b.id, label: b.label, besluit: b.besluit, cijfers: b.cijfers.map(function (id) {
      var l = per[id] || [], hoofd = l.filter(function (r) { return !r.uitsplitsing; })[0] || {}, c = uitMap(METRIEKEN, id) || {};
      return { id: id, m: hoofd.m || c.m || '', label: c.label || id, soort: c.soort || '', waarde: hoofd.waarde === undefined || hoofd.waarde === null ? '' : hoofd.waarde,
        uitsplitsing: l.filter(function (r) { return r.uitsplitsing; }).map(function (r) { return { label: String(r.uitsplitsing), waarde: r.waarde }; }), extra: {}, geblokkeerd: hoofd.geblokkeerd || '',
        def: { versie: Number(hoofd.versie) || 0, status: hoofd.status || 'concept', definitie: hoofd.definitie || '', eigenaar: hoofd.eigenaar || '' } };
    }) };
  });
  return { peildatum: peildatum, soort: rijen[0].soort, blokken: blokken };
}

/* ----- v7.9 (punt 11, 19, 20, 21): één api per rondreis voor de sturingsweergaven ----- */

// weergave: week | mt | datakwaliteit. opties = { stap, eigenaar } (week), { stand } (mt: yyyy-MM of yyyy-MM-dd), { eigenaar, vers } (datakwaliteit; vers alleen management)
function apiSturing(weergave, opties) {
  var o = opties && typeof opties === 'object' && !(opties instanceof Array) ? opties : {};
  if (weergave === 'week') return sturingWeek(o);
  if (weergave === 'mt') return sturingMt(o);
  if (weergave === 'datakwaliteit') return sturingDatakwaliteit(o);
  throw new Error('Kies de weergave week, mt of datakwaliteit.');
}
function sturingWeek(o) {
  eis('sturingWeek', 'zien');
  var B = periodeBereik('week', o.stap), leden = teamNamen('consultancy'), mensen = leden.filter(function (n) { return mag('sturingWeek', 'zien', { eigenaar: n }); });
  var kiesbaar = isBeheerder() || isTeamlead() ? mensen.slice() : [], eigenaar = typeof o.eigenaar === 'string' && mensen.indexOf(o.eigenaar) >= 0 ? o.eigenaar : '';
  if (eigenaar) mensen = [eigenaar];
  var regels = mensen.map(function (n) { return { naam: n, leden: [n] }; });
  if (isBeheerder() && !eigenaar) regels.push({ naam: 'beheerder', leden: teamNamen('management') });  // M14: de beheerder heeft een eigen regel, niet in het teamtotaal
  var totaalRegel = { naam: '__team', leden: leden }, X = weekCijfers(B, regels.concat([totaalRegel]));
  // v7.9 (review P5, R8): een medewerker ziet het teamtotaal alleen als het team naast hem minstens WEEK_TOTAAL_MIN_ANDEREN andere leden heeft; anders
  // is teamtotaal min de eigen regel de som van één of twee collega's (per persoon alleen in het 1-op-1)
  var anderen = leden.filter(function (n) { return n !== ikNaam(); }).length, totaalZichtbaar = isBeheerder() || isTeamlead() || anderen >= WEEK_TOTAAL_MIN_ANDEREN;
  var wk = isoWeekStr(parseDatum(B.van)), doelen = doelenVan('week', wk), blok = rolBlokkade(), geblokkeerd = {};
  if (blok) ['ap', 'ad', 'voorstellen'].forEach(function (m) { geblokkeerd[m] = blok; });  // B1: geblokkeerd, nooit 0; deals tellen wel
  var vorm = function (x) { var c = {}; Object.keys(x).forEach(function (k) { if (k !== 'vertraging') c[k] = uitMap(geblokkeerd, k) ? null : x[k]; }); return c; };
  var rollen = {}; mijlpalen().forEach(function (m) { if (m.rol) rollen[m.rol] = true; });
  return { weergave: 'week', van: B.van, tot: B.tot, eind: B.eind, label: B.label, stap: B.stap, lopend: B.lopend, week: wk,
    rijen: regels.map(function (r) { return { naam: r.naam, team: r.naam === 'beheerder' ? 'management' : 'consultancy', cijfers: vorm(X[r.naam]), vertraging: X[r.naam].vertraging, doelen: r.naam === 'beheerder' ? {} : doelen[r.naam] || {}, geblokkeerd: geblokkeerd }; }),
    totaal: totaalZichtbaar ? { cijfers: vorm(X.__team), vertraging: X.__team.vertraging, doelen: doelen['team:consultancy'] || {}, geblokkeerd: geblokkeerd } : null,
    totaalUitleg: totaalZichtbaar ? '' : 'Het teamtotaal staat er niet: het team is te klein (minder dan ' + WEEK_TOTAAL_MIN_ANDEREN + ' collega\'s), dus het zou de cijfers van één of twee collega\'s laten zien.',
    defs: definitiesVan(WEEK_CIJFERS), rolOntbreekt: ['ap', 'ad', 'voorstel'].filter(function (r) { return !rollen[r]; }), rollenIngesteld: !blok, kiesbaar: kiesbaar, eigenaar: eigenaar };
}
function sturingMt(o) {
  eis('sturingMt', 'zien');
  var stand = typeof o.stand === 'string' ? o.stand : '', S;
  if (stand) {
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(stand)) throw new Error('Kies een maandstand (2026-10) of een tussenstand (2026-10-29).');
    S = standUit(stand); S.bevroren = true; S.standSoort = S.soort; S.schooljaar = schooljaarVan(S.peildatum);
  } else { S = sturingCijfers(datumStr(new Date())); S.bevroren = false; S.standSoort = ''; }
  var defs = {}; S.blokken.forEach(function (b) { b.cijfers.forEach(function (c) { defs[c.id] = { m: c.m, label: c.label, definitie: c.def.definitie, versie: c.def.versie, status: c.def.status, eigenaar: c.def.eigenaar }; }); });
  return { weergave: 'mt', peildatum: S.peildatum, schooljaar: S.schooljaar, bevroren: S.bevroren, standSoort: S.standSoort, stand: stand, standen: standenLijst(), blokken: S.blokken, defs: defs,
    scope: S.scope || [], noemer: S.noemer || null, magBevriezen: isBeheerder(), tussenstandVandaag: lees('Standen').some(function (r) { return r.soort === 'tussenstand' && String(r.peildatum) === datumStr(new Date()); }) };
}
// R16: rijen alleen voor wie ze mag zien; aantallen alleen over zichtbare afwijkingen; een verwijzing naar iets van een collega zonder naam en zonder doorklik
function sturingDatakwaliteit(o) {
  eis('datakwaliteit', 'zien');
  if (o.vers === true && !isBeheerder()) throw new Error('Daar heb je geen toegang toe.');
  var vandaag = datumStr(new Date()), rijen, dag, bron;
  if (o.vers === true) {
    dag = vandaag; bron = 'vers'; rijen = [];
    datacontracten(standVoorContracten(vandaag)).forEach(function (c) {
      if (c.stand !== 'gezakt') { rijen.push({ contract: c.id, eigenaar: 'beheerder', stand: c.stand, aantal: 0, verwijzingen: [] }); return; }
      var per = {}; c.afwijkingen.forEach(function (a) { (per[a.eigenaar] = per[a.eigenaar] || []).push(a.soort + ':' + a.id); });
      Object.keys(per).forEach(function (e) { rijen.push({ contract: c.id, eigenaar: e, stand: 'gezakt', aantal: per[e].length, verwijzingen: per[e].slice(0, DQ_MAX_VERWIJZINGEN) }); });
    });
  } else {
    var dq = dqRijenVan(vandaag); bron = 'trigger'; dag = dq ? dq.dag : '';
    rijen = (dq ? dq.rijen : []).map(function (r) { var v = []; try { v = JSON.parse(r.verwijzingen || '[]'); } catch (e) { v = []; } return { contract: r.contract, eigenaar: String(r.eigenaar), stand: r.stand, aantal: Number(r.aantal) || 0, verwijzingen: v instanceof Array ? v : [] }; });
  }
  var eigenaar = typeof o.eigenaar === 'string' ? o.eigenaar : '', zicht = rijen.filter(function (r) { return mag('datakwaliteit', 'zien', { eigenaar: r.eigenaar }) && (!eigenaar || r.eigenaar === eigenaar); });
  var kMap = perId(lees('Kansen')), tMap = perId(lees('Trajecten')), sMap = perId(lees('Scholen')), fMap = null, wMap = null;
  var verwijzing = function (s0) {
    var i = String(s0).indexOf(':'), soort = i > 0 ? String(s0).slice(0, i) : 'regel', id = i > 0 ? String(s0).slice(i + 1) : String(s0), k, t, s;
    if (soort === 'wissel') { wMap = wMap || perId(lees('Fasewissels')); var w = wMap[id]; k = w ? kMap[String(w.kansId)] : null; return k && mag('pipeline', 'zien', k) ? { soort: 'kans', id: k.id, naam: (k.naam || k.traject) + ' (wissel naar ' + w.naar + ')', open: true } : { soort: 'kans', id: '', naam: 'kans van een collega', open: false }; }
    if (soort === 'kans') { k = kMap[id]; return k && mag('pipeline', 'zien', k) ? { soort: 'kans', id: id, naam: (k.naam || k.traject) + (k.school ? ' (' + k.school + ')' : ''), open: true } : { soort: 'kans', id: '', naam: 'kans van een collega', open: false }; }
    if (soort === 'project') { t = tMap[id]; return t && mag('projecten', 'zien', t) ? { soort: 'project', id: id, naam: t.traject + ' (' + t.school + ')', open: true } : { soort: 'project', id: '', naam: 'project van een collega', open: false }; }
    if (soort === 'school') { s = sMap[id]; return s && mag('relaties', 'zien', s) ? { soort: 'school', id: id, naam: s.naam, open: true } : { soort: 'school', id: '', naam: 'school van een collega', open: false }; }
    if (soort === 'doel') {  // review P4: <gebruikers-id>-<week>; de naam alleen voor het management, opgezocht bij het tonen
      var wkD = id.slice(-8), gid = id.slice(0, -9), g = isBeheerder() ? lees('Gebruikers').filter(function (x) { return String(x.id) === gid; })[0] : null;
      return { soort: 'doel', id: '', naam: 'weekdoel ' + wkD + (g ? ' van ' + g.naam : ''), open: false };
    }
    if (soort === 'factuur') { fMap = fMap || perId(lees('Facturen')); var f = fMap[id]; t = f ? tMap[String(f.trajectId)] : null; return f && t && mag('facturatie', 'zien', t) ? { soort: 'project', id: t.id, naam: (f.factuurnummer ? 'factuur ' + f.factuurnummer : 'termijn zonder factuurnummer') + ' (' + t.school + ')', open: true } : { soort: 'factuur', id: '', naam: f && !t ? 'termijn zonder project' : 'factuur van een collega', open: false }; }
    return { soort: soort, id: id, naam: id, open: false };
  };
  var labels = {}; CONTRACTEN.forEach(function (c) { labels[c[0]] = c[1]; });
  var perC = {}; rijen.forEach(function (r) { var x = perC[r.contract] || (perC[r.contract] = { alle: r.stand, zichtbaar: 0 }); if (r.stand === 'gezakt') x.alle = 'gezakt'; });
  zicht.forEach(function (r) { if (r.stand === 'gezakt') perC[r.contract].zichtbaar += r.aantal; });
  var perE = {};
  zicht.filter(function (r) { return r.stand === 'gezakt'; }).forEach(function (r) {
    var x = perE[r.eigenaar] || (perE[r.eigenaar] = { eigenaar: r.eigenaar, aantal: 0, gezakt: [] });
    x.aantal += r.aantal; x.gezakt.push({ contract: r.contract, label: labels[r.contract] || r.contract, aantal: r.aantal, verwijzingen: r.verwijzingen.map(verwijzing) });
  });
  var reden = function (id) { var c = CONTRACT_REDENEN[id]; return c || ''; };
  return { weergave: 'datakwaliteit', dag: dag, bron: bron, vandaag: dag === vandaag,
    contracten: CONTRACTEN.map(function (c) { var x = perC[c[0]]; return { id: c[0], label: c[1], eigenaarSoort: c[2], stand: !x ? 'niet getoetst' : x.alle === 'gezakt' && !x.zichtbaar ? 'geslaagd' : x.alle, aantal: x ? x.zichtbaar : 0, reden: reden(c[0]) }; }),
    perEigenaar: Object.keys(perE).sort().map(function (e) { return perE[e]; }), defs: definitiesVan(['datakwaliteit']), magVers: isBeheerder() };
}
// Waarom een contract geblokkeerd of niet getoetst kan zijn (voor de uitleg in de app; de reden van de dag staat in de stand zelf)
var CONTRACT_REDENEN = { logdekking: 'geblokkeerd tot besluit agenda-toegang (§5 besluit 10)', noemerbewaking: 'geblokkeerd tot het jaardoel volledig is (§5 besluit 2)',
  dekking_robuust: 'niet getoetst zonder aanname dekkingTolerantie', geen_bulk_op_werkelijke_datum: 'niet getoetst zonder aanname bulkDrempel',
  verliesdiscipline: 'tweede deel niet getoetst zonder aanname verliesNormWeken', lopend_project_heeft_contract: 'kansId-deel niet getoetst zonder overstapdatum (§5 besluit 1)',
  tarief_echt: 'standaarddeel niet getoetst zonder aanname standaardTarief', waarde_vanaf_voorstel: 'geblokkeerd zolang de rollen niet ingesteld zijn',
  sluitdatum_vanaf_voorstel: 'geblokkeerd zolang de rollen niet ingesteld zijn', school_heeft_brin: 'geblokkeerd zolang de rollen niet ingesteld zijn' };

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
function dagenSinds(s) { var d = parseDatum(s); return d ? Math.round((middag(new Date()) - middag(d)) / 86400000) : null; }  // v7.3 (TZ-6): kalenderdagen (gisteren 23:30 = 1, vandaag 00:10 = 0); floor over verstreken uren zat in het uur na de zomertijdwissel een dag te laag
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
// v7.3 (FZ-8): een vrij tekstveld uit de app. null of undefined wordt leeg; een object of lijst wordt geweigerd (anders kwam "[object Object]" in de Sheet); de rest wordt tekst zonder randspaties.
function tekstIn(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') throw new Error('Dit veld verwacht tekst.');
  return String(v).trim();
}
function mapUrl() { var id = P.getProperty('DRIVE_MAP_ID'); try { return id ? DriveApp.getFolderById(id).getUrl() : ''; } catch (e) { return ''; } }
function naamUitAdres(van) { var m = String(van).match(/^"?([^"<]+?)"?\s*<|^([^@\s]+)@/); return (m && (m[1] || m[2]) || String(van)).trim(); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xmlAttr(s) { return escHtml(s).replace(/\n/g, ' '); }
