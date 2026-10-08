/* Athena Assistent — demo-backend (v4.3).
 * Draait backend/Code.gs ongewijzigd in een verborgen iframe, met nagebootste Apps Script-diensten
 * (Sheet in het geheugen, Gmail, Agenda, Claude) en fictieve gegevens. Alleen voor de demomodus (?demo=1).
 * Alle namen, scholen, kandidaten en bedragen zijn verzonnen; e-mailadressen eindigen op .example.
 * Dit bestand wordt vóór Code.gs geëvalueerd; demoVul() en demoRun() pas daarna. */

var DEMO_HUIDIG = 'demo-sophie';
var DEMO_MENSEN = [
  { code: 'demo-sophie', id: 'beheer', naam: 'Sophie de Graaf', email: 'sophie@athena.example', team: 'management', rol: 'management' },
  { code: 'demo-thomas', id: 'g-thomas', naam: 'Thomas Verbeek', email: 'thomas@athena.example', team: 'management', rol: 'management' },
  { code: 'demo-yara', id: 'g-yara', naam: 'Yara El Amrani', email: 'yara@athena.example', team: 'consultancy', rol: 'teamlead' },
  { code: 'demo-lars', id: 'g-lars', naam: 'Lars Visser', email: 'lars@athena.example', team: 'consultancy', rol: 'medewerker' },
  { code: 'demo-noor', id: 'g-noor', naam: 'Noor Hendriks', email: 'noor@athena.example', team: 'consultancy', rol: 'medewerker' },
  { code: 'demo-bas', id: 'g-bas', naam: 'Bas Meijer', email: 'bas@athena.example', team: 'accountmanagement', rol: 'teamlead' },
  { code: 'demo-femke', id: 'g-femke', naam: 'Femke de Wit', email: 'femke@athena.example', team: 'accountmanagement', rol: 'medewerker' },
  { code: 'demo-ruben', id: 'g-ruben', naam: 'Ruben Smit', email: 'ruben@athena.example', team: 'accountmanagement', rol: 'medewerker' },
  { code: 'demo-iris', id: 'g-iris', naam: 'Iris Mulder', email: 'iris@athena.example', team: 'talent', rol: 'teamlead' },
  { code: 'demo-sem', id: 'g-sem', naam: 'Sem de Boer', email: 'sem@athena.example', team: 'talent', rol: 'medewerker' }
];

/* ----- Apps Script nagebootst ----- */
var _demoProps = { SHEET_ID: 'demo', SECRET: 'demo-sophie', NAAM: 'Sophie de Graaf', ANTHROPIC_API_KEY: 'demo', MIGRATIE_V4: '1', LAATSTE_INDEX: '', LAATSTE_CRM_SYNC: '' };
function _demoCodes() { var c = {}; DEMO_MENSEN.forEach(function (m) { if (m.id !== 'beheer') c[m.code] = m.id; }); return JSON.stringify(c); }
_demoProps.CODES = _demoCodes();
var PropertiesService = { getScriptProperties: function () { return {
  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(_demoProps, k) ? _demoProps[k] : null; },
  setProperty: function (k, v) { _demoProps[k] = String(v); return this; }, deleteProperty: function (k) { delete _demoProps[k]; return this; },
  getProperties: function () { return _demoProps; } }; } };

var _demoBladen = {};
function _demoBlad(naam) {
  var rijen = [];
  var b = { rijen: rijen, getName: function () { return naam; },
    getLastRow: function () { return rijen.length; },
    getLastColumn: function () { return rijen.reduce(function (m, r) { return Math.max(m, r.length); }, 0); },
    getMaxColumns: function () { return Math.max(26, b.getLastColumn()); },
    insertColumnsAfter: function () {}, setFrozenRows: function () {},
    appendRow: function (r) { rijen.push(r.slice()); return b; },
    deleteRow: function (i) { rijen.splice(i - 1, 1); },
    getDataRange: function () { return b.getRange(1, 1, rijen.length, b.getLastColumn()); },
    getRange: function (r, c, nr, nc) { nr = nr || 1; nc = nc || 1; return {
      getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var rij = rijen[r - 1 + i] || [], x = []; for (var j = 0; j < nc; j++) x.push(rij[c - 1 + j] === undefined ? '' : rij[c - 1 + j]); o.push(x); } return o; },
      setValues: function (v) { v.forEach(function (vr, i) { rijen[r - 1 + i] = rijen[r - 1 + i] || []; vr.forEach(function (x, j) { rijen[r - 1 + i][c - 1 + j] = x; }); }); return this; },
      setValue: function (x) { rijen[r - 1] = rijen[r - 1] || []; rijen[r - 1][c - 1] = x; return this; },
      clearContent: function () { for (var i = 0; i < nr; i++) { var rij = rijen[r - 1 + i]; if (rij) for (var j = 0; j < nc; j++) rij[c - 1 + j] = ''; } return this; } }; } };
  return b;
}
var _demoSS = { getSheetByName: function (n) { return _demoBladen[n] || null; }, insertSheet: function (n) { return (_demoBladen[n] = _demoBlad(n)); },
  getSheets: function () { return Object.keys(_demoBladen).map(function (n) { return _demoBladen[n]; }); }, deleteSheet: function () {}, getUrl: function () { return '#demo'; }, getId: function () { return 'demo'; } };
var SpreadsheetApp = { openById: function () { return _demoSS; }, create: function () { return _demoSS; } };

function _p2(n) { return (n < 10 ? '0' : '') + n; }
var Utilities = {
  getUuid: function () { var s = ''; for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16); return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20); },
  formatDate: function (d, tz, f) { return String(f).replace('yyyy', d.getFullYear()).replace('MM', _p2(d.getMonth() + 1)).replace('dd', _p2(d.getDate())).replace('HH', _p2(d.getHours())).replace('mm', _p2(d.getMinutes())); },
  sleep: function () {}
};
var Session = { getScriptTimeZone: function () { return 'Europe/Amsterdam'; },
  getEffectiveUser: function () { var m = DEMO_MENSEN.filter(function (x) { return x.code === DEMO_HUIDIG; })[0] || DEMO_MENSEN[0]; return { getEmail: function () { return m.email; } }; },
  getActiveUser: function () { return Session.getEffectiveUser(); } };
var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {}, hasLock: function () { return true; } }; } };
var _demoCache = {};
var CacheService = { getScriptCache: function () { return { get: function (k) { return _demoCache[k] || null; }, put: function (k, v) { _demoCache[k] = v; }, remove: function (k) { delete _demoCache[k]; } }; } };
var ContentService = { MimeType: { JSON: 'json' }, createTextOutput: function (t) { return { setMimeType: function () { return t; }, getContent: function () { return t; } }; } };
var Logger = { log: function () {} };
var MailApp = { sendEmail: function () {} };
var MimeType = { GOOGLE_DOCS: 'gdoc', GOOGLE_SHEETS: 'gsheet', PLAIN_TEXT: 'txt', CSV: 'csv', PDF: 'pdf', MICROSOFT_WORD: 'doc' };
var ScriptApp = { getProjectTriggers: function () { return []; }, deleteTrigger: function () {},
  newTrigger: function () { var t = { timeBased: function () { return t; }, everyHours: function () { return t; }, everyMinutes: function () { return t; }, everyDays: function () { return t; }, atHour: function () { return t; }, onMonthDay: function () { return t; }, nearMinute: function () { return t; }, create: function () { return t; } }; return t; } };
function _demoNiet() { throw new Error('In de demo staat dit uit: hier zou Google Drive een document maken.'); }
var DriveApp = { getFolderById: _demoNiet, getFileById: _demoNiet, createFolder: _demoNiet };
var DocumentApp = { openById: _demoNiet, create: _demoNiet, ParagraphHeading: {} };
var Drive = { Files: { list: _demoNiet, get: _demoNiet, insert: _demoNiet, create: _demoNiet, export: _demoNiet, copy: _demoNiet } };

/* ----- Gmail en Agenda met verzonnen berichten en afspraken ----- */
function _demoDag(n, uur, min) { var d = new Date(); d.setDate(d.getDate() + n); d.setHours(uur || 9, min || 0, 0, 0); return d; }
function _demoThread(id, onderwerp, van, dagen, tekst) {
  var bericht = { getId: function () { return id + '-1'; }, getFrom: function () { return van; }, getTo: function () { return 'team@athena.example'; }, getCc: function () { return ''; },
    getDate: function () { return _demoDag(-dagen, 10, 12); }, getSubject: function () { return onderwerp; }, getPlainBody: function () { return tekst; }, getReplyTo: function () { return van; },
    createDraftReply: function () { return { getId: function () { return 'concept-demo'; } }; } };
  return { getId: function () { return id; }, getFirstMessageSubject: function () { return onderwerp; }, getMessages: function () { return [bericht]; }, getLastMessageDate: function () { return bericht.getDate(); },
    getPermalink: function () { return '#'; }, getLabels: function () { return []; } };
}
var _demoMails = [
  _demoThread('th-demo-1', 'Rooster periode 2', 'Marieke Jansen <m.jansen@esdoorn-lyceum.example>', 4, 'Beste Femke,\n\nKunnen we het rooster voor periode 2 doornemen? Op donderdag hebben we een extra ondersteuner nodig.\n\nGroet, Marieke'),
  _demoThread('th-demo-2', 'Vraag over de factuur van september', 'Administratie Kompas College <administratie@kompascollege.example>', 3, 'Goedemiddag,\n\nOp de factuur van september staan 4 uur meer dan in ons overzicht. Kunt u dat nakijken?\n\nMet vriendelijke groet,\nAdministratie'),
  _demoThread('th-demo-3', 'Offerte examentraining 2027', 'Pieter de Boer <p.deboer@noorderhof.example>', 5, 'Beste Lars,\n\nWe hebben de offerte besproken in het MT. Kunnen jullie ook een variant met alleen wiskunde maken?\n\nPieter'),
  _demoThread('th-demo-4', 'Kennismaking NT2-klassen', 'Hanneke Smit <h.smit@isk-havenstad.example>', 6, 'Beste Bas,\n\nFijn dat jullie in november starten. Wanneer komen de ondersteuners kennismaken?\n\nHanneke')
];
var GmailApp = {
  search: function (q) { return /from:me/.test(q) ? [] : _demoMails.slice(); },
  getThreadById: function (id) { return _demoMails.filter(function (t) { return t.getId() === id; })[0] || null; },
  createDraft: function () { return { getId: function () { return 'concept-demo'; }, getMessage: function () { return { getId: function () { return 'concept-demo'; } }; } }; },
  getUserLabelByName: function () { return null; }
};
function _demoEvent(id, titel, start, duurMin, locatie) {
  var s = start, e = new Date(start.getTime() + duurMin * 60000);
  var ev = { getId: function () { return id; }, getTitle: function () { return titel; }, getStartTime: function () { return s; }, getEndTime: function () { return e; },
    isAllDayEvent: function () { return false; }, isRecurringEvent: function () { return false; }, getLocation: function () { return locatie || ''; }, getDescription: function () { return ''; },
    getGuestList: function () { return []; }, setTime: function (a, b) { s = a; e = b; }, setTitle: function (t) { titel = t; }, setDescription: function () {}, setLocation: function (l) { locatie = l; },
    deleteEvent: function () { _demoAgenda = _demoAgenda.filter(function (x) { return x !== ev; }); } };
  return ev;
}
var _demoAgenda = [
  _demoEvent('ev-1', 'Evaluatie periode 1 Esdoorn Lyceum', _demoDag(0, 10, 0), 60, 'Utrecht'),
  _demoEvent('ev-2', 'Taskforce ISK Havenstad', _demoDag(0, 14, 30), 45, 'Online'),
  _demoEvent('ev-3', 'Kennismaking Montessori De Lindehof', _demoDag(1, 9, 0), 60, 'Zeist'),
  _demoEvent('ev-4', 'Teamoverleg accountmanagers', _demoDag(2, 13, 0), 60, 'Kantoor'),
  _demoEvent('ev-5', 'Matchinggesprek Daan Kuipers', _demoDag(3, 11, 0), 45, 'Haarlem'),
  _demoEvent('ev-6', 'Evaluatie Kompas College', _demoDag(6, 15, 0), 60, 'Amersfoort')
];
var CalendarApp = { getDefaultCalendar: function () { return {
  getEvents: function (van, tot) { return _demoAgenda.filter(function (e) { return e.getStartTime() >= van && e.getStartTime() < tot; }); },
  getEventsForDay: function (d) { var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(a.getTime() + 86400000); return _demoAgenda.filter(function (e) { return e.getStartTime() >= a && e.getStartTime() < b; }); },
  getEventById: function (id) { return _demoAgenda.filter(function (e) { return e.getId() === id; })[0] || null; },
  createEvent: function (titel, start, eind, o) { var ev = _demoEvent('ev-' + Utilities.getUuid().slice(0, 8), titel, start, Math.round((eind - start) / 60000), o && o.location); _demoAgenda.push(ev); return ev; } }; } };

/* ----- Claude nagebootst: vaste, nette antwoorden, zodat de assistent in de demo iets laat zien ----- */
function _demoClaude(body) {
  var berichten = body.messages || [], laatste = berichten[berichten.length - 1] || {}, sys = String(body.system || '');
  var tekst = function (t) { return { stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage: { input_tokens: 0, output_tokens: 0 } }; };
  if (body.tools && body.tools.length) {
    var vraag = typeof laatste.content === 'string' ? laatste.content : '';
    var heeftResultaat = Array.isArray(laatste.content) && laatste.content.some(function (b) { return b.type === 'tool_result'; });
    if (heeftResultaat) return tekst('Ik heb de taak voor je klaargezet. Kijk hem na en klik op Uitvoeren; dan staat hij bij je taken en op de tijdlijn van Kompas College.');
    if (/taak|bel|herinner/i.test(vraag)) {
      var s = lees('Scholen').filter(function (x) { return x.naam === 'Kompas College'; })[0];
      return { stop_reason: 'tool_use', usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: 'text', text: 'Dat zet ik als taak klaar.' },
        { type: 'tool_use', id: 'tu-demo-1', name: 'maak_taak', input: { tekst: 'Administratie Kompas College terugbellen over de factuur van september', deadline: datumStr(plusDagen(1)), prio: 'hoog', schoolId: s ? s.id : '' } }] };
    }
    return tekst('Voor Esdoorn Lyceum lopen dit schooljaar drie ondersteuners, 30 uur per week tegen € 45 per uur (omzet € 48.600). De verlenging naar volgend schooljaar is voorgesteld; Marieke Jansen wacht nog op een reactie over het rooster van periode 2.\n\nZal ik een conceptantwoord aan Marieke klaarzetten, of een taak om haar te bellen?');
  }
  var vraag1 = typeof laatste.content === 'string' ? laatste.content : '';
  if (/Je vat de relatie/.test(sys)) return tekst('- Klant sinds 2025, twee projecten: onderwijsondersteuning (lopend) en examentraining (afgelopen).\n- Drie vaste ondersteuners, bezetting volledig sinds september.\n- Verlenging voor volgend schooljaar is voorgesteld; nog geen reactie.\n- Open vraag van de teamleider over het rooster van periode 2.\n- Facturatie loopt achteraf per maand; september is betaald.');
  if (/Gedaan:/.test(vraag1)) { var wie = (sys.match(/assistent van ([^ (]+)/) || [])[1] || ''; return tekst('Goedemorgen' + (wie ? ' ' + wie : '') + '. Gisteren is er een kandidaat klaar voor start gezet en is er een nieuwe kandidaat voorgesteld. Blijven liggen: een factuur die nog niet verstuurd is en een kans zonder recent contact. Vandaag vragen je afspraken en de open taken met een deadline de meeste aandacht.'); }
  if (/bedrijfsbrein/.test(sys)) return tekst('Volgens de prijzenlijst kost een onderwijsondersteuner € 45 per uur, huiswerkbegeleiding € 42 en examentraining € 46. Alle diensten zijn vrijgesteld van btw. Elke school krijgt een vaste ondersteuner met een vaste vervanger.');
  return tekst('Onderwerp: Vaste ondersteuning, ook na de kerstvakantie\n\nBeste [naam],\n\nOnderwijsondersteuning wordt beter wanneer docenten, ondersteuner en leerlingen elkaar kennen. Daarom koppelen we een vaste ondersteuner aan de school, met een vaste vervanger bij afwezigheid. Alle medewerkers volgen de AthenaAcademy en hebben een VOG.\n\nZullen we in november een kort gesprek plannen over de tweede helft van het schooljaar?\n\nMet vriendelijke groet,\nSophie de Graaf\nAthenaSchool');
}
var UrlFetchApp = { fetch: function (url, o) {
  var data = /anthropic/.test(url) ? _demoClaude(JSON.parse((o && o.payload) || '{}')) : { error: { message: 'Niet beschikbaar in de demo.' } };
  var code = /anthropic/.test(url) ? 200 : 503;
  return { getResponseCode: function () { return code; }, getContentText: function () { return JSON.stringify(data); } };
} };

/* ----- Fictieve gegevens ----- */
function demoVul() {
  GEBRUIKER = null;
  var d = function (n) { return datumStr(plusDagen(n)); }, dt = function (n, t) { return d(n) + ' ' + (t || '10:00'); };
  var sj = huidigSchooljaar(), j1 = Number(sj.slice(0, 4)), vorig = (j1 - 1) + '-' + j1;
  var sjStart = j1 + '-09-01', sjEind = (j1 + 1) + '-06-30';
  var M = {}; DEMO_MENSEN.forEach(function (m) { M[m.code.slice(5)] = m.naam; });
  var j = function (o) { return JSON.stringify(o); };

  schrijfVeel('Gebruikers', DEMO_MENSEN.filter(function (m) { return m.id !== 'beheer'; }).map(function (m) { return { id: m.id, naam: m.naam, email: m.email, rol: m.rol, team: m.team, actief: 'ja' }; }));

  var scholen = [
    ['s1', 'Esdoorn Lyceum', 'Utrecht', 'VO', 'klant', M.lars, 1350, 'Stichting Esdoorn Onderwijs'], ['s2', 'Kompas College', 'Amersfoort', 'VO', 'klant', M.noor, 1100, 'Stichting Kompas'],
    ['s3', 'Scholengroep Duinrand', 'Haarlem', 'VO', 'klant', M.yara, 2400, 'Scholengroep Duinrand'], ['s4', 'ISK Havenstad', 'Rotterdam', 'ISK', 'klant', M.lars, 320, 'Stichting Havenstad'],
    ['s5', 'Montessori De Lindehof', 'Zeist', 'PO', 'prospect', M.noor, 410, 'Stichting Lindehof'], ['s6', 'Lyceum Valkenoord', 'Leiden', 'VO', 'klant', M.yara, 980, 'Stichting Valkenoord'],
    ['s7', 'Waterpoort College', 'Gouda', 'VO', 'prospect', M.lars, 1500, 'Stichting Waterpoort'], ['s8', 'Vakcollege Rijnzicht', 'Arnhem', 'VMBO', 'lead', M.noor, 700, 'Stichting Rijnzicht'],
    ['s9', 'Basisschool De Zonnewijzer', 'Nijmegen', 'PO', 'lead', M.yara, 280, 'Stichting Zonnewijzer'], ['s10', 'Stedelijk Gymnasium Noorderhof', 'Zwolle', 'VO', 'klant', M.lars, 860, 'Stichting Noorderhof'],
    ['s11', 'Praktijkschool De Brug', 'Deventer', 'PRO', 'prospect', M.noor, 240, 'Stichting De Brug'], ['s12', 'College Veldzicht', "'s-Hertogenbosch", 'VO', 'oud-klant', M.yara, 1250, 'Stichting Veldzicht']
  ];
  schrijfVeel('Scholen', scholen.map(function (x, i) {
    var dom = x[1].toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '.example';
    return { id: x[0], naam: x[1], plaats: x[2], type: x[3], status: x[4], eigenaar: x[5], leerlingen: x[6], bestuur: x[7], email: 'info@' + dom, website: 'www.' + dom, telefoon: '0' + (30 + i) + '-' + (2000000 + i * 37123),
      adres: 'Schoolstraat ' + (i + 3) + ', ' + x[2], tags: x[3].toLowerCase(), aangemaakt: dt(-400 + i * 25), laatsteContact: d(-(i % 6) - 1) };
  }));
  var personen = [
    ['p1', 'Marieke', 'Jansen', 'Teamleider onderbouw', 's1'], ['p2', 'Joost', 'van Leeuwen', 'Conrector', 's1'], ['p3', 'Anouk', 'de Vries', 'Zorgcoördinator', 's2'], ['p4', 'Erik', 'Mol', 'Directeur', 's2'],
    ['p5', 'Saskia', 'Kramer', 'Afdelingsleider examenklassen', 's3'], ['p6', 'Hanneke', 'Smit', 'Coördinator NT2', 's4'], ['p7', 'Wouter', 'Bos', 'Directeur', 's5'], ['p8', 'Ingrid', 'Peters', 'Conrector', 's6'],
    ['p9', 'Ralf', 'Dekker', 'Teamleider bovenbouw', 's7'], ['p10', 'Nadia', 'Bouzid', 'Zorgcoördinator', 's8'], ['p11', 'Gerard', 'Koster', 'Directeur', 's9'], ['p12', 'Pieter', 'de Boer', 'Examensecretaris', 's10'],
    ['p13', 'Lisa', 'Hoekstra', 'Teamleider', 's11'], ['p14', 'Martin', 'Vermeulen', 'Rector', 's12']
  ];
  schrijfVeel('Personen', personen.map(function (x, i) {
    var s = scholen.filter(function (y) { return y[0] === x[4]; })[0], dom = s[1].toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '.example';
    return { id: x[0], voornaam: x[1], achternaam: x[2], functie: x[3], schoolId: x[4], email: x[1].charAt(0).toLowerCase() + '.' + x[2].toLowerCase().replace(/[^a-z]+/g, '') + '@' + dom, telefoon: '06-' + (21000000 + i * 1371), eigenaar: s[5], aangemaakt: dt(-380 + i * 20), laatsteContact: d(-(i % 9) - 1) };
  }));
  var sn = {}; scholen.forEach(function (x) { sn[x[0]] = x[1]; });
  // [id, school, persoon, naam, fase, waarde, eigenaar, am, aangemaakt (dagen), gesloten (dagen), sluiting (dagen), volgende actie, deadline (dagen), laatste contact (dagen), reden]
  var kansen = [
    ['k1', 's1', 'p1', 'Onderwijsondersteuning', 'gewonnen', 48600, M.lars, M.femke, -95, -40], ['k2', 's2', 'p3', 'Huiswerkbegeleiding', 'gewonnen', 21000, M.noor, M.ruben, -120, -55],
    ['k3', 's3', 'p5', 'Examentraining', 'gewonnen', 9200, M.yara, M.femke, -50, -12], ['k4', 's4', 'p6', 'NT2-ondersteuning', 'gewonnen', 32400, M.lars, M.bas, -70, -20],
    ['k5', 's2', 'p4', 'Basisvaardigheden rekenen', 'gewonnen', 18500, M.noor, M.ruben, -35, -6], ['k15', 's6', 'p8', 'Studentdocent Duits', 'gewonnen', 14400, M.yara, M.ruben, -330, -300],
    ['k6', 's5', 'p7', 'Onderwijsassistentie groep 7-8', 'voorstel', 16800, M.noor, M.femke, -26, null, 21, 'Voorstel nabellen', 2, -4],
    ['k7', 's7', 'p9', 'Studentdocent wiskunde', 'onderhandeling', 22400, M.lars, M.bas, -40, null, 10, 'Tarief en startdatum afstemmen', 1, -2],
    ['k8', 's8', 'p10', 'Surveillance examens', 'gesprek', 6400, M.noor, '', -30, null, 45, 'Tweede gesprek plannen', -3, -12],
    ['k9', 's9', 'p11', 'Huiswerkbegeleiding bovenbouw', 'lead', 8000, M.yara, '', -9, null, 60, 'Kennismaking plannen', 4, -3],
    ['k10', 's10', 'p12', 'Examentraining voorjaar', 'voorstel', 11200, M.lars, M.bas, -21, null, 30, 'Variant alleen wiskunde maken', 0, -9],
    ['k11', 's11', 'p13', 'Ondersteuning praktijkvakken', 'gesprek', 19500, M.noor, '', -14, null, 40, 'Hulpvraag uitwerken', 3, -5],
    ['k12', 's6', 'p8', 'NT2 voor nieuwkomers', 'lead', 12000, M.yara, '', -4, null, 75, 'Behoefte peilen', 7, -4],
    ['k16', 's1', 'p2', 'Examentraining voorjaar', 'gesprek', 9600, M.lars, '', -11, null, 50, 'Offerte opstellen', 5, -6],
    ['k13', 's12', 'p14', 'Onderwijsondersteuning', 'verloren', 26000, M.yara, '', -60, -25, null, '', null, -25, 'Te duur'],
    ['k14', 's7', 'p9', 'Huiswerkklas', 'verloren', 7200, M.lars, '', -45, -8, null, '', null, -8, 'Eigen oplossing gevonden']
  ];
  schrijfVeel('Kansen', kansen.map(function (k) {
    return { id: k[0], schoolId: k[1], school: sn[k[1]], persoonId: k[2], naam: k[3], traject: k[3], fase: k[4], pipeline: 'Scholen', waarde: k[5], eigenaar: k[6], am: k[7], aangemaakt: dt(k[8], '09:30'),
      gesloten: k[9] === null || k[9] === undefined ? '' : d(k[9]), verwachteSluiting: k[10] ? d(k[10]) : '', volgendeActie: k[11] || '', deadline: k[12] === null || k[12] === undefined ? '' : d(k[12]),
      laatsteContact: d(k[13] || k[9] || -3), verliesReden: k[14] || '', notities: k[4] === 'gewonnen' ? 'Vaste ondersteuners gewenst; start na de herfstvakantie bespreekbaar.' : '' };
  }));

  var tf4 = { datum: d(-15), deelnemers: M.lars + ', ' + M.bas + ', ' + M.sem, hulpvraag: 'Twee NT2-ondersteuners voor de instroomklassen, zodat leerlingen in kleine groepjes kunnen oefenen.',
    inzet: '2 ondersteuners, 16 uur per week', rooster: 'Ma t/m do 9:00-13:00', startdatum: d(21), bijzonderheden: 'Ervaring met anderstaligen gewenst; kennismaking met het team vooraf.', contactpersonen: 'Hanneke Smit (coördinator NT2)', door: M.lars, bijgewerkt: dt(-15) };
  var tf3 = { datum: d(-9), deelnemers: M.yara + ', ' + M.femke + ', ' + M.iris, hulpvraag: 'Examentraining wiskunde A en Nederlands voor 60 eindexamenleerlingen.', inzet: '2 trainers', rooster: 'Woensdagmiddag en de meivakantie',
    startdatum: (j1 + 1) + '-03-01', bijzonderheden: '', contactpersonen: 'Saskia Kramer', door: M.yara, bijgewerkt: dt(-9) };
  // [id, school, traject, schooljaar, status, ondersteuners, uren, tarief, omzet, am, adviseur, kans, verlenging, soortFact, gefactureerd, start, eind]
  var projecten = [
    ['t1', 's1', 'Onderwijsondersteuning', sj, 'bezig', 3, 30, 45, 48600, M.femke, M.lars, 'k1', 'voorstel verstuurd', 'achteraf', 'ja', sjStart, sjEind],
    ['t2', 's2', 'Huiswerkbegeleiding', sj, 'bezig', 2, 12, 42, 21000, M.ruben, M.noor, 'k2', 'nog bespreken', 'vooraf', 'ja', sjStart, sjEind],
    ['t3', 's3', 'Examentraining', sj, 'opstart', 2, 10, 46, 9200, M.femke, M.yara, 'k3', '', 'vooraf', 'nee', (j1 + 1) + '-03-01', (j1 + 1) + '-05-15'],
    ['t4', 's4', 'NT2-ondersteuning', sj, 'opstart', 2, 16, 47, 32400, M.bas, M.lars, 'k4', '', 'achteraf', 'nee', d(21), sjEind],
    ['t5', 's6', 'Studentdocent Duits', sj, 'bezig', 1, 16, 45, 14400, M.ruben, M.yara, 'k15', 'verlengd', 'vooraf', 'ja', sjStart, sjEind],
    ['t6', 's10', 'Surveillance', sj, 'bezig', 4, 6, 39, 7800, M.bas, M.lars, '', 'stopt', 'achteraf', 'ja', sjStart, (j1 + 1) + '-06-15'],
    ['t9', 's2', 'Basisvaardigheden rekenen', sj, 'opstart', 2, 10, 44, 18500, M.ruben, M.noor, 'k5', '', 'achteraf', 'nee', d(28), sjEind],
    ['t10', 's6', 'Onderwijsondersteuning', sj, 'onduidelijk', 1, 8, 45, 12000, M.bas, M.yara, '', '', '', '', '', ''],
    ['t7', 's1', 'Examentraining', vorig, 'afgelopen', 2, 10, 44, 8800, M.femke, M.lars, '', 'verlengd', 'vooraf', 'ja', (j1) + '-03-01', j1 + '-05-15'],
    ['t8', 's12', 'Onderwijsondersteuning', vorig, 'afgelopen', 2, 24, 44, 26000, M.ruben, M.yara, '', 'stopt', 'achteraf', 'ja', (j1 - 1) + '-09-01', j1 + '-06-30'],
    ['t11', 's4', 'NT2-ondersteuning', vorig, 'afgelopen', 2, 16, 45, 29000, M.bas, M.lars, '', 'verlengd', 'achteraf', 'ja', (j1 - 1) + '-09-01', j1 + '-06-30']
  ];
  var contact = { s1: 'Marieke Jansen\nTeamleider onderbouw\n06-21000000', s2: 'Anouk de Vries\nZorgcoördinator\n06-21002742', s3: 'Saskia Kramer\n06-21005484', s4: 'Hanneke Smit\nCoördinator NT2\n06-21006855', s6: 'Ingrid Peters\nConrector\n06-21009597', s10: 'Pieter de Boer\nExamensecretaris\n06-21015081', s12: 'Martin Vermeulen\nRector' };
  schrijfVeel('Trajecten', projecten.map(function (t, i) {
    return { id: t[0], schoolId: t[1], school: sn[t[1]], plaats: (scholen.filter(function (x) { return x[0] === t[1]; })[0] || [])[2], traject: t[2], schooljaar: t[3], status: t[4], ondersteuners: t[5], urenPerWeek: t[6], tarief: t[7], omzet: t[8],
      am: t[9], adviseur: t[10], kansId: t[11], verlenging: t[12], soortFacturatie: t[13], gefactureerd: t[14], start: t[15], eind: t[16], vakanties: t[13] === 'vooraf' ? 'doorbetaald' : 'niet doorbetaald',
      factuurDatum: t[14] === 'ja' ? (t[13] === 'vooraf' ? t[15] : datumStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))) : '', bijzonderheden: { t1: 'Uren volgens rooster; meerwerk apart', t5: 'Inkoopnummer op de factuur', t6: 'Alleen toetsweken', t4: 'Start na kennismaking' }[t[0]] || '',
      contactpersoon: (contact[t[1]] || '').split('\n')[0], contactgegevens: contact[t[1]] || '', voorstelUrl: 'https://docs.google.com/document/d/demo-voorstel-' + t[0], documentenUrl: 'https://drive.google.com/drive/folders/demo-' + t[0],
      xpsProject: t[4] === 'bezig' || t[4] === 'afgelopen' ? '10.' + (880 + i * 7) : '', taskforce: t[0] === 't4' ? j(tf4) : t[0] === 't3' ? j(tf3) : '',
      samenvatting: t[4] === 'bezig' ? 'Vaste ondersteuners in de onderbouw; evaluatie aan het eind van elke periode.' : '', bijgewerkt: dt(-(i % 7) - 1) };
  }));

  // Vacatures en kandidaten (met statushistorie, zodat time-to-fill en doorlooptijd kloppen)
  schrijfVeel('Vacatures', [
    { id: 'v1', trajectId: 't1', titel: 'Onderwijsondersteuner', aantal: 3, dagen: 'Ma t/m vr 8:30-15:00', urenPerWeek: 30, start: sjStart, eind: sjEind, profiel: 'Pabo- of lerarenopleiding, ervaring in de onderbouw', status: 'ingevuld', aangemaakt: dt(-46), ingevuld: dt(-31), door: M.femke },
    { id: 'v5', trajectId: 't2', titel: 'Huiswerkbegeleider', aantal: 2, dagen: 'Di en do 14:00-17:00', urenPerWeek: 12, start: sjStart, eind: sjEind, profiel: 'Student, rustig en gestructureerd', status: 'ingevuld', aangemaakt: dt(-62), ingevuld: dt(-49), door: M.ruben },
    { id: 'v2', trajectId: 't3', titel: 'Examentrainer wiskunde en Nederlands', aantal: 2, dagen: 'Woensdagmiddag en meivakantie', urenPerWeek: 10, start: (j1 + 1) + '-03-01', eind: (j1 + 1) + '-05-15', profiel: 'Vakkennis wiskunde A of Nederlands op havo/vwo-niveau', status: 'open', aangemaakt: dt(-8), door: M.femke },
    { id: 'v3', trajectId: 't4', titel: 'NT2-ondersteuner', aantal: 2, dagen: 'Ma t/m do 9:00-13:00', urenPerWeek: 16, start: d(21), eind: sjEind, profiel: 'Ervaring met anderstalige leerlingen', status: 'open', aangemaakt: dt(-14), door: M.bas },
    { id: 'v6', trajectId: 't5', titel: 'Studentdocent Duits (vervanging)', aantal: 1, dagen: 'Di en do', urenPerWeek: 16, start: d(-3), eind: sjEind, profiel: 'Tweedejaars lerarenopleiding Duits', status: 'ingevuld', aangemaakt: dt(-20), ingevuld: dt(-6), door: M.ruben },
    { id: 'v4', trajectId: 't9', titel: 'Rekenondersteuner', aantal: 2, dagen: 'Ma, wo en vr 9:00-12:00', urenPerWeek: 10, start: d(28), eind: sjEind, profiel: 'Sterk in rekenen, geduldig met groepjes', status: 'open', aangemaakt: dt(-5), door: M.ruben }
  ]);
  var kand = function (id, vac, tr, naam, door, status, hist, extra) {
    var h = {}, laatst = ''; Object.keys(hist).forEach(function (s) { h[s] = dt(hist[s], '11:00'); laatst = h[s]; });
    var o = { id: id, vacatureId: vac, trajectId: tr, naam: naam, email: naam.toLowerCase().replace(/[^a-z]+/g, '.') + '@mail.example', telefoon: '06-' + (31000000 + id.length * 7919), bron: 'XPS-bestand',
      xpsId: 'X' + (4100 + id.length * 13), status: status, statusSinds: laatst, statusHistorie: j(h), door: door, aangemaakt: h.voorgesteld || laatst, gesprek: '', notitie: '' };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  };
  schrijfVeel('Kandidaten', [
    kand('c1', 'v1', 't1', 'Eva de Wit', M.sem, 'klaar voor start', { voorgesteld: -44, gesprek: -41, geselecteerd: -39, academy: -38, contract: -35, vog: -33, 'klaar voor start': -31 }),
    kand('c2', 'v1', 't1', 'Ali Yilmaz', M.iris, 'klaar voor start', { voorgesteld: -43, gesprek: -40, geselecteerd: -38, academy: -37, contract: -34, vog: -33, 'klaar voor start': -31 }, { bron: 'LinkedIn' }),
    kand('c3', 'v1', 't1', 'Jasmijn Kok', M.sem, 'klaar voor start', { voorgesteld: -42, gesprek: -40, geselecteerd: -38, academy: -36, contract: -34, vog: -32, 'klaar voor start': -31 }),
    kand('c4', 'v5', 't2', 'Tim Verhoeven', M.iris, 'klaar voor start', { voorgesteld: -60, gesprek: -57, geselecteerd: -55, 'klaar voor start': -49 }),
    kand('c5', 'v5', 't2', 'Nina Jacobs', M.sem, 'klaar voor start', { voorgesteld: -59, gesprek: -56, geselecteerd: -55, 'klaar voor start': -50 }, { bron: 'eigen netwerk' }),
    kand('c6', 'v2', 't3', 'Daan Kuipers', M.sem, 'gesprek', { voorgesteld: -6, gesprek: -3 }, { gesprek: dt(3, '11:00') }),
    kand('c7', 'v2', 't3', 'Lotte van Dam', M.iris, 'voorgesteld', { voorgesteld: -2 }, { bron: 'LinkedIn' }),
    kand('c8', 'v3', 't4', 'Fatima Aydin', M.sem, 'klaar voor start', { voorgesteld: -13, gesprek: -11, geselecteerd: -9, academy: -8, contract: -5, vog: -3, 'klaar voor start': -2 }),
    kand('c9', 'v3', 't4', 'Jesse Vos', M.sem, 'contract', { voorgesteld: -12, gesprek: -11, geselecteerd: -10, contract: -9 }),
    kand('c10', 'v3', 't4', 'Mila Bakker', M.iris, 'afgewezen', { voorgesteld: -13, gesprek: -11, afgewezen: -10 }),
    kand('c13', 'v6', 't5', 'Ruben Claes', M.iris, 'klaar voor start', { voorgesteld: -18, gesprek: -15, geselecteerd: -13, contract: -9, vog: -7, 'klaar voor start': -6 }, { bron: 'XPS-bestand' }),
    kand('c14', 'v6', 't5', 'Hanna Wolters', M.sem, 'reserve', { voorgesteld: -17, gesprek: -15, reserve: -13 }),
    kand('c11', 'v4', 't9', 'Thijs Brouwer', M.sem, 'voorgesteld', { voorgesteld: -3 }),
    kand('c12', 'v4', 't9', 'Sara Peeters', M.iris, 'voorgesteld', { voorgesteld: -1 }, { bron: 'sollicitatie' })
  ]);

  // Facturatie: termijnen per project (één te laat, om "facturatie op tijd" te laten zien)
  var maand = function (m, y) { return y + '-' + _p2(m) + '-' + _p2(new Date(y, m, 0).getDate()); };
  var vandaag = d(0), termijnen = [];
  [[9, j1], [10, j1], [11, j1], [12, j1]].forEach(function (x, i) {
    var datum = maand(x[0], x[1]), voorbij = datum < vandaag;
    termijnen.push({ id: 'f1-' + i, trajectId: 't1', omschrijving: ['September', 'Oktober', 'November', 'December'][i] + ' ' + x[1], bedrag: 4860, datum: datum, status: voorbij ? 'betaald' : 'nog te doen', factuurnummer: voorbij ? '2026' + (1041 + i) : '', door: M.femke });
  });
  termijnen.push({ id: 'f2-0', trajectId: 't2', omschrijving: 'Factuur vooraf schooljaar', bedrag: 21000, datum: sjStart, status: 'betaald', factuurnummer: '20261012', door: M.ruben });
  termijnen.push({ id: 'f5-0', trajectId: 't5', omschrijving: 'Factuur vooraf schooljaar', bedrag: 14400, datum: d(-5), status: 'aangemaakt', factuurnummer: '', bijzonderheden: 'Wacht op inkoopnummer van de school', door: M.ruben });
  termijnen.push({ id: 'f6-0', trajectId: 't6', omschrijving: 'September ' + j1, bedrag: 1950, datum: maand(9, j1), status: 'verzonden', factuurnummer: '20261033', door: M.bas });
  termijnen.push({ id: 'f1-m', trajectId: 't1', omschrijving: 'Meerwerk september (extra ondersteuner)', bedrag: 1080, datum: d(-5), status: 'verzonden', factuurnummer: '20261051', door: M.femke });
  termijnen.push({ id: 'f6-t', trajectId: 't6', omschrijving: 'Surveillance toetsweek', bedrag: 936, datum: d(-2), status: 'verzonden', factuurnummer: '20261052', door: M.bas });
  termijnen.push({ id: 'f6-1', trajectId: 't6', omschrijving: 'Oktober ' + j1, bedrag: 1950, datum: maand(10, j1), status: 'nog te doen', door: M.bas });
  schrijfVeel('Facturen', termijnen.map(function (f) { f.aangemaakt = dt(-40); return f; }));

  // Activiteit van de laatste weken: gesprekken, mails, afspraken en mijlpalen
  var acts = [], n = 0, act = function (type, dagen, uur, door, school, extra, onderwerp, tekst) {
    var a = { id: 'a' + (++n), type: type, datum: dt(dagen, uur), door: door, schoolId: school, onderwerp: onderwerp, tekst: tekst || '', bron: 'app', aangemaakt: dt(dagen, uur) };
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; }); acts.push(a);
  };
  act('gesprek', -2, '10:15', M.lars, 's7', { kansId: 'k7', persoonId: 'p9' }, 'Tarief en startdatum besproken', 'Ralf wil starten in januari; akkoord op het tarief als de vaste vervanger geregeld is.');
  act('mail', -3, '16:40', M.lars, 's10', { kansId: 'k10', persoonId: 'p12' }, 'Offerte examentraining verstuurd');
  act('fase', -12, '11:00', M.lars, 's10', { kansId: 'k10' }, 'Mijlpaal: gesprek → voorstel');
  act('fase', -6, '15:20', M.noor, 's5', { kansId: 'k6' }, 'Mijlpaal: gesprek → voorstel');
  act('gesprek', -5, '13:00', M.noor, 's11', { kansId: 'k11', persoonId: 'p13' }, 'Hulpvraag praktijkvakken', 'Behoefte aan ondersteuning bij techniek en zorg, 2 dagen per week.');
  act('afspraak', -4, '09:30', M.noor, 's5', { kansId: 'k6', persoonId: 'p7' }, 'Voorstel toegelicht aan de directie', '', '');
  act('gesprek', -3, '11:30', M.yara, 's9', { kansId: 'k9', persoonId: 'p11' }, 'Eerste kennismaking', 'Interesse in huiswerkbegeleiding voor groep 8.');
  act('mail', -1, '09:05', M.yara, 's6', { kansId: 'k12', persoonId: 'p8' }, 'Informatie NT2 voor nieuwkomers');
  act('fase', -6, '10:00', M.noor, 's2', { kansId: 'k5' }, 'Mijlpaal: onderhandeling → gewonnen');
  act('fase', -20, '12:00', M.lars, 's4', { kansId: 'k4' }, 'Mijlpaal: onderhandeling → gewonnen');
  act('notitie', -15, '15:00', M.lars, 's4', { trajectId: 't4', kansId: 'k4' }, 'Taskforce (' + d(-15) + ')', 'Hulpvraag: twee NT2-ondersteuners voor de instroomklassen. Start over drie weken.');
  act('gesprek', -1, '14:00', M.femke, 's1', { trajectId: 't1', persoonId: 'p1' }, 'Evaluatie periode 1 voorbereid', 'Tevreden over de vaste gezichten; vraag om een extra ondersteuner op donderdag.');
  act('afspraak', 0, '10:00', M.femke, 's1', { trajectId: 't1', persoonId: 'p1' }, 'Evaluatie periode 1');
  act('mail', -2, '08:50', M.ruben, 's2', { trajectId: 't2', persoonId: 'p3' }, 'Rooster huiswerkklas na de herfstvakantie');
  act('gesprek', -7, '10:30', M.ruben, 's6', { trajectId: 't5', persoonId: 'p8' }, 'Verlenging studentdocent Duits', 'School verlengt voor volgend schooljaar; zelfde uren.');
  act('afspraak', 6, '15:00', M.ruben, 's2', { trajectId: 't2', persoonId: 'p3' }, 'Evaluatie Kompas College');
  act('gesprek', -4, '11:00', M.bas, 's4', { trajectId: 't4', persoonId: 'p6' }, 'Kennismaking ondersteuners voorbereid');
  act('notitie', -9, '16:00', M.bas, 's10', { trajectId: 't6' }, 'School stopt na dit schooljaar met surveillance', 'Eigen surveillanten vanaf volgend jaar; afscheid netjes afronden.');
  act('taak', -2, '11:00', M.sem, 's4', { trajectId: 't4' }, 'Kandidaat Fatima Aydin: vog → klaar voor start');
  act('taak', -3, '12:00', M.sem, 's3', { trajectId: 't3' }, 'Kandidaat Daan Kuipers: voorgesteld → gesprek');
  act('taak', -5, '09:00', M.ruben, 's2', { trajectId: 't9' }, 'Vacature geopend: Rekenondersteuner (2×)');
  // aanvullende activiteit, zodat de rapporten per persoon gevuld zijn
  var consultants = [[M.lars, ['s1', 's7', 's10', 's4']], [M.noor, ['s2', 's5', 's8', 's11']], [M.yara, ['s3', 's6', 's9', 's12']]];
  var ams = [[M.femke, [['s1', 't1'], ['s3', 't3']]], [M.ruben, [['s2', 't2'], ['s6', 't5'], ['s2', 't9']]], [M.bas, [['s4', 't4'], ['s10', 't6']]]];
  for (var dag = -40; dag <= -1; dag++) {
    consultants.forEach(function (c, ci) {
      if ((dag + ci * 3) % 3 === 0) act('gesprek', dag, (9 + ci) + ':30', c[0], c[1][(-dag + ci) % c[1].length], {}, 'Belafspraak');
      if ((dag + ci) % 2 === 0) act('mail', dag, (13 + ci) + ':10', c[0], c[1][(-dag) % c[1].length], {}, 'Opvolging per mail');
      if ((dag + ci * 5) % 7 === 0) act('afspraak', dag, '11:00', c[0], c[1][(-dag + 1) % c[1].length], {}, 'Gesprek op school');
    });
    ams.forEach(function (a, ai) {
      if ((dag + ai * 2) % 5 === 0) { var p = a[1][(-dag) % a[1].length]; act('gesprek', dag, '10:' + _p2(ai * 10), a[0], p[0], { trajectId: p[1] }, 'Contact met de school over de inzet'); }
    });
  }
  schrijfVeel('Activiteiten', acts);

  // Open taken per persoon
  var taak = function (id, tekst, eigenaar, dagen, prio, cat, koppel) { var o = { id: id, tekst: tekst, eigenaar: eigenaar, deadline: d(dagen), prio: prio, categorie: cat, status: 'open', bron: 'crm', aangemaakt: dt(-3) }; Object.keys(koppel || {}).forEach(function (k) { o[k] = koppel[k]; }); return o; };
  schrijfVeel('Acties', [
    taak('tk1', 'Voorstel Montessori De Lindehof nabellen', M.noor, 2, 'hoog', 'bellen', { schoolId: 's5', kansId: 'k6', persoonId: 'p7' }),
    taak('tk2', 'Variant examentraining alleen wiskunde uitwerken', M.lars, 0, 'hoog', 'voorstel', { schoolId: 's10', kansId: 'k10' }),
    taak('tk3', 'Tweede gesprek Vakcollege Rijnzicht plannen', M.noor, -3, 'midden', 'afspraak', { schoolId: 's8', kansId: 'k8' }),
    taak('tk4', 'Tarief Waterpoort College bevestigen', M.lars, 1, 'hoog', 'mailen', { schoolId: 's7', kansId: 'k7' }),
    taak('tk5', 'Kennismaking De Zonnewijzer plannen', M.yara, 4, 'midden', 'afspraak', { schoolId: 's9', kansId: 'k9' }),
    taak('tk6', 'Rooster periode 2 afstemmen met Marieke', M.femke, 1, 'hoog', 'afspraak', { schoolId: 's1', trajectId: 't1', persoonId: 'p1' }),
    taak('tk7', 'Factuur Lyceum Valkenoord versturen', M.ruben, -2, 'hoog', 'overig', { schoolId: 's6', trajectId: 't5' }),
    taak('tk8', 'Matchinggesprek Thijs Brouwer (Kompas College, Rekenondersteuner)', M.ruben, 3, 'hoog', 'afspraak', { schoolId: 's2', trajectId: 't9' }),
    taak('tk9', 'Kennismaking ondersteuners ISK Havenstad plannen', M.bas, 5, 'midden', 'afspraak', { schoolId: 's4', trajectId: 't4' }),
    taak('tk10', 'Afscheid surveillance Noorderhof voorbereiden', M.bas, 30, 'laag', 'overig', { schoolId: 's10', trajectId: 't6' }),
    taak('tk11', 'VOG Jesse Vos nabellen', M.sem, -1, 'hoog', 'bellen', { schoolId: 's4', trajectId: 't4' }),
    taak('tk12', 'Bestand doorzoeken op examentrainers wiskunde', M.iris, 2, 'midden', 'overig', { schoolId: 's3', trajectId: 't3' }),
    taak('tk13', 'Kwartaalcijfers voorbereiden voor het MT', M.sophie, 3, 'midden', 'overig', {}),
    taak('tk14', 'Verlengingsgesprekken inplannen met de accountmanagers', M.sophie, 7, 'midden', 'afspraak', {}),
    { id: 'tk15', tekst: 'Contract Jesse Vos afronden', eigenaar: M.sem, deadline: d(4), prio: 'hoog', categorie: 'overig', status: 'open', bron: 'taskforce', aangemaakt: dt(-15), schoolId: 's4', trajectId: 't4' },
    { id: 'tk16', tekst: 'Kennismaking met het team vooraf plannen', eigenaar: M.bas, deadline: d(10), prio: 'midden', categorie: 'overig', status: 'open', bron: 'taskforce', aangemaakt: dt(-15), schoolId: 's4', trajectId: 't4' }
  ]);

  // Doelen: bedrijf (schooljaar), per team en per persoon (maand)
  var doel = function (eig, per, m, w) { return { id: slug(eig + '-' + per + '-' + m), eigenaar: eig, periode: per, metric: m, doel: w }; };
  schrijfVeel('Doelen', [
    doel('bedrijf', 'schooljaar', 'omzet', 250000), doel('bedrijf', 'schooljaar', 'scholen', 12), doel('bedrijf', 'schooljaar', 'ondersteuners', 25), doel('bedrijf', 'schooljaar', 'verlengingspercentage', 75),
    doel('team:consultancy', 'maand', 'gewonnenWaarde', 40000), doel('team:consultancy', 'maand', 'gesprekken', 30), doel('team:consultancy', 'maand', 'voorstellen', 4),
    doel('team:accountmanagement', 'maand', 'bezetting', 90), doel('team:accountmanagement', 'maand', 'facturatieOpTijd', 95), doel('team:accountmanagement', 'maand', 'dagenTotBezetting', 21),
    doel('team:talent', 'maand', 'voordrachten', 10), doel('team:talent', 'maand', 'timeToFill', 14), doel('team:talent', 'maand', 'doorlooptijd', 10),
    doel(M.lars, 'maand', 'gesprekken', 12), doel(M.noor, 'maand', 'gesprekken', 12), doel(M.lars, 'maand', 'gewonnenWaarde', 20000),
    doel(M.femke, 'maand', 'evaluaties', 6), doel(M.ruben, 'maand', 'evaluaties', 6), doel(M.sem, 'maand', 'voordrachten', 6), doel(M.iris, 'maand', 'voordrachten', 4)
  ]);

  // Meldingen (de bel)
  var meld = function (voor, tekst, link, dagen, gelezen) { return { voor: voor, tekst: tekst, link: link, datum: dt(dagen, '09:15'), gelezen: gelezen ? dt(dagen, '10:00') : '', door: 'Athena' }; };
  schrijfVeel('Meldingen', [
    meld(M.sophie, 'Bezetting rond voor Esdoorn Lyceum (Onderwijsondersteuning): 3 van 3. Het project staat op bezig.', 'project:t1', -31, true),
    meld(M.sophie, 'Kans gewonnen: Basisvaardigheden rekenen bij Kompas College (€ 18.500).', 'project:t9', -6),
    meld(M.sophie, 'Fatima Aydin is klaar voor start bij ISK Havenstad.', 'project:t4', -2),
    meld(M.bas, 'Fatima Aydin is klaar voor start bij ISK Havenstad.', 'project:t4', -2),
    meld(M.ruben, 'Nieuwe kandidaat voor Rekenondersteuner bij Kompas College: Sara Peeters. Plan het matchinggesprek.', 'project:t9', -1),
    meld(M.femke, 'Nieuwe kandidaat voor Examentrainer wiskunde en Nederlands bij Scholengroep Duinrand: Lotte van Dam.', 'project:t3', -2),
    meld(M.sem, 'Nieuwe vacature: Rekenondersteuner (2×) bij Kompas College, start over 4 weken.', 'project:t9', -5),
    meld(M.iris, 'Nieuwe vacature: Rekenondersteuner (2×) bij Kompas College, start over 4 weken.', 'project:t9', -5),
    meld(M.lars, 'Bezetting ISK Havenstad: 1 van 2 plekken gevuld.', 'project:t4', -2)
  ]);

  // Dagstart van Sophie
  schrijfVeel('Reviews', [{ id: 'r1', datum: d(0), gemaaktOp: dt(0, '05:30'), eigenaar: M.sophie,
    samenvatting: 'Goedemorgen Sophie. Gisteren is Fatima Aydin klaar voor start gezet bij ISK Havenstad en is er een tweede kandidaat voorgesteld voor Kompas College. Blijven liggen: de factuur van Lyceum Valkenoord is nog niet verstuurd. Vandaag vragen de evaluatie bij Esdoorn Lyceum en de taskforce van ISK Havenstad aandacht.',
    gedaan: j([{ tekst: 'Fatima Aydin klaar voor start (ISK Havenstad)', bron: 'traject' }, { tekst: 'Kandidaat Sara Peeters voorgesteld (Kompas College)', bron: 'traject' }, { tekst: 'Offerte examentraining verstuurd naar Noorderhof', bron: 'mail' }]),
    blijvenLiggen: j([{ tekst: 'Factuur Lyceum Valkenoord nog niet verstuurd', bron: 'actie', dagen: 2 }, { tekst: 'Kandidaat Jesse Vos (ISK Havenstad) staat al 9 dagen op "contract"', bron: 'traject', dagen: 9 }, { tekst: 'Kans Vakcollege Rijnzicht: 12 dagen geen contact', bron: 'kans', dagen: 12 }]),
    vandaag: j([{ tekst: 'Evaluatie periode 1 Esdoorn Lyceum', bron: 'agenda', tijd: '10:00' }, { tekst: 'Taskforce ISK Havenstad', bron: 'agenda', tijd: '14:30' }, { tekst: 'Kwartaalcijfers voorbereiden voor het MT', bron: 'actie' }]) }]);

  // Kennisbank en teksten
  schrijfVeel('Documenten', [
    { id: 'doc1', titel: 'Prijzenlijst onderwijsondersteuning ' + sj, type: 'prijslijst', school: '', url: 'https://docs.google.com/document/d/demo-prijzen', gewijzigd: dt(-30), woorden: 420, tekst: 'Onderwijsondersteuner € 45 per uur. Huiswerkbegeleiding € 42 per uur. Examentraining € 46 per uur. NT2-ondersteuning € 47 per uur. Surveillance € 39 per uur. Alle diensten zijn vrijgesteld van btw.' },
    { id: 'doc2', titel: 'Werkwijze vaste ondersteuner en vervanging', type: 'werkwijze', school: '', url: 'https://docs.google.com/document/d/demo-werkwijze', gewijzigd: dt(-60), woorden: 860, tekst: 'Elke school krijgt een vaste ondersteuner met een vaste vervanger. Evaluatie aan het eind van elke periode.' },
    { id: 'doc3', titel: 'Samenwerkingsvoorstel Esdoorn Lyceum', type: 'voorstel', school: 'Esdoorn Lyceum', url: 'https://docs.google.com/document/d/demo-voorstel-t1', gewijzigd: dt(-97), woorden: 1240, tekst: 'Hulpvraag: drie ondersteuners voor de onderbouw, 30 uur per week.' },
    { id: 'doc4', titel: 'Raamovereenkomst Kompas College', type: 'contract', school: 'Kompas College', url: 'https://docs.google.com/document/d/demo-contract-s2', gewijzigd: dt(-130), woorden: 2100, tekst: 'Raamovereenkomst onderwijsondersteuning.' },
    { id: 'doc5', titel: 'Schooldossier ISK Havenstad', type: 'schooldossier', school: 'ISK Havenstad', url: 'https://docs.google.com/document/d/demo-dossier-s4', gewijzigd: dt(-15), woorden: 640, tekst: 'Instroomklassen, NT2, contactpersoon Hanneke Smit.' },
    { id: 'doc6', titel: 'Werkwijze taskforce en overdracht', type: 'werkwijze', school: '', url: 'https://docs.google.com/document/d/demo-taskforce', gewijzigd: dt(-20), woorden: 530, tekst: 'Na een gewonnen kans plant de consultant binnen twee dagen de taskforcemeeting met de accountmanager en talent.' }
  ]);
  schrijfVeel('Content', [
    { id: 'ct1', datum: dt(-4, '15:00'), type: 'linkedin', onderwerp: 'Start NT2-ondersteuning bij ISK Havenstad', tekst: 'In november starten twee NT2-ondersteuners bij ISK Havenstad. Leerlingen oefenen in kleine groepjes met een vast gezicht.\n\n#onderwijs #NT2', door: M.sophie },
    { id: 'ct2', datum: dt(-10, '11:00'), type: 'mail', onderwerp: 'Verlenging volgend schooljaar', tekst: 'Onderwerp: Verlenging volgend schooljaar\n\nBeste [naam],\n\nGraag bespreken we hoe we de ondersteuning volgend schooljaar voortzetten.\n\nMet vriendelijke groet,\nAthenaSchool', door: M.sophie }
  ]);
  _demoProps.LAATSTE_INDEX = dt(-1, '04:01');
}

/* ----- Ingang vanuit de app ----- */
function demoStart(opgeslagen) {
  if (opgeslagen) {
    try {
      var data = JSON.parse(opgeslagen);
      Object.keys(data.bladen).forEach(function (n) { var b = _demoSS.insertSheet(n); data.bladen[n].forEach(function (r) { b.rijen.push(r); }); });
      Object.keys(data.props || {}).forEach(function (k) { if (['SECRET', 'CODES', 'NAAM', 'SHEET_ID'].indexOf(k) < 0) _demoProps[k] = data.props[k]; });  // de inlogcodes komen altijd uit DEMO_MENSEN
      return 'hersteld';
    }
    catch (e) { _demoBladen = {}; }
  }
  demoVul();
  return 'gevuld';
}
function demoExport() { var b = {}; Object.keys(_demoBladen).forEach(function (n) { b[n] = _demoBladen[n].rijen; }); return JSON.stringify({ bladen: b, props: _demoProps }); }
function demoRun(fn, argsJson, code) {
  DEMO_HUIDIG = code || 'demo-sophie';
  _demoProps.CODES = _demoCodes(); _demoProps.SECRET = 'demo-sophie';  // een code die in Beheer vernieuwd is, werkt in de demo gewoon door
  // Apps Script begint elk verzoek met een schone globale scope; hier blijven de globals staan, dus de geheugens per verzoek legen
  _LEES = {}; _BLAD = {}; _TRAJECTNAMEN = null; _TEAMNAMEN = null; _OPENVAC = null; GEBRUIKER = null;
  return doPost({ postData: { contents: JSON.stringify({ fn: fn, args: JSON.parse(argsJson || '[]'), secret: DEMO_HUIDIG }) } });
}
