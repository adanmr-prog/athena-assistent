/* Athena Assistent — v6.0: de Apps Script-diensten nagebootst op Postgres, zodat backend/Code.gs ongewijzigd in Node draait
 * (dezelfde aanpak als demo/demo-backend.js, maar dan echt). Per verzoek maakt maakDiensten() een set globalen:
 * - SpreadsheetApp: het "Sheet" is Postgres. Een tabblad wordt bij het eerste gebruik geladen (lazy) in het geheugen als
 *   rijen onder de kop uit TABELLEN; Code.gs leest en schrijft daar zoals altijd; flush() schrijft daarna per tabel alleen
 *   de gewijzigde, nieuwe en verwijderde rijen weg (op de sleutelkolom) in één transactie.
 * - PropertiesService → tabel eigenschappen (ATHENA_<NAAM> in de omgeving gaat voor, voor sleutels zoals ANTHROPIC_API_KEY).
 * - CacheService → tabel cache; LockService → advisory lock in Postgres; Utilities/Session/Logger/ContentService/MimeType/ScriptApp;
 * - UrlFetchApp → fetch via de brug; MailApp, GmailApp, CalendarApp, DriveApp, Drive, DocumentApp → server/google.js.
 * Alle aanroepen zijn synchroon dankzij server/sync.js. */
'use strict';
var schema = require('./schema.js'), brug = require('./sync.js'), google = require('./google.js');

var TZ = 'Europe/Amsterdam';
var SCHEMA_KLAAR = false, TABEL_KLAAR = {};

/* ----- Hulpfuncties ----- */
function p2(n) { return (n < 10 ? '0' : '') + n; }
var _fmt = {};
function delen(d, tz) {
  var f = _fmt[tz] || (_fmt[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  var o = {}; f.formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
  if (o.hour === '24') o.hour = '00';
  return o;
}
// Zoals Utilities.formatDate: yyyy, MM, dd, HH, mm, ss (de patronen die Code.gs gebruikt)
function formatDate(d, tz, patroon) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  var o = delen(d, tz || TZ);
  return String(patroon).replace(/yyyy/g, o.year).replace(/MM/g, o.month).replace(/dd/g, o.day).replace(/HH/g, o.hour).replace(/mm/g, o.minute).replace(/ss/g, o.second);
}
function uuid() { return require('crypto').randomUUID(); }
function b64Decode(s) { return Array.prototype.slice.call(Buffer.from(String(s || '').replace(/^data:[^;]+;base64,/, ''), 'base64')); }
function b64Encode(x) { return Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x)).toString('base64'); }
function blob(data, mime, naam) {
  var bytes = typeof data === 'string' ? Array.prototype.slice.call(Buffer.from(data, 'utf8')) : Array.prototype.slice.call(Buffer.from(data || []));
  return { getBytes: function () { return bytes; }, getDataAsString: function () { return Buffer.from(bytes).toString('utf8'); }, getContentType: function () { return mime || 'application/octet-stream'; }, getName: function () { return naam || 'bestand'; }, setName: function (n) { naam = n; return this; }, setContentType: function (m) { mime = m; return this; } };
}
function parseCsv(tekst, sep) {
  sep = sep || ','; var rijen = [], rij = [], veld = '', q = false, s = String(tekst || '');
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (q) { if (c === '"') { if (s.charAt(i + 1) === '"') { veld += '"'; i++; } else q = false; } else veld += c; }
    else if (c === '"') q = true;
    else if (c === sep) { rij.push(veld); veld = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s.charAt(i + 1) === '\n') i++; rij.push(veld); rijen.push(rij); rij = []; veld = ''; }
    else veld += c;
  }
  if (veld !== '' || rij.length) { rij.push(veld); rijen.push(rij); }
  return rijen;
}

/* ----- Het tabbladmodel: dezelfde Range-API als in de demo, met vuil-markering voor flush() ----- */
function maakBlad(naam, laadRijen) {
  var rijen = null, vuil = false, volledigGelezen = false;
  function R() { if (!rijen) { rijen = laadRijen(); volledigGelezen = false; } return rijen; }
  function breedte() { return R().reduce(function (m, r) { return Math.max(m, r.length); }, 0); }
  // v6.2: Code.gs leest een tabblad opnieuw na vergeet() ("vers uit de Sheet: een ander verzoek kan net geschreven hebben",
  // controleerConflict). In Apps Script raakt dat de Sheet; hier dus Postgres: een tweede volledige lezing van een schoon tabblad
  // laadt opnieuw, zodat de conflictcontrole de schrijfactie van een ander verzoek ziet. Een vuil tabblad (eigen wijzigingen) blijft.
  function volledigeLezing(r, c, nr) {
    if (r !== 1 || c !== 1 || nr < R().length) return;
    if (volledigGelezen && !vuil) rijen = laadRijen();
    volledigGelezen = true;
  }
  var b = {
    getName: function () { return naam; },
    getLastRow: function () { return R().length; },
    getLastColumn: breedte,
    getMaxColumns: function () { return Math.max(26, breedte()); }, getMaxRows: function () { return Math.max(1000, R().length); },
    insertColumnsAfter: function () { return b; }, setFrozenRows: function () { return b; },
    appendRow: function (r) { R().push(r.slice()); vuil = true; return b; },
    deleteRow: function (i) { R().splice(i - 1, 1); vuil = true; return b; },
    getDataRange: function () { return b.getRange(1, 1, R().length, breedte()); },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () { volledigeLezing(r, c, nr); var o = [], rr = R(), tot = (r === 1 && c === 1 && nr >= rr.length) ? rr.length : nr; for (var i = 0; i < Math.max(nr, tot); i++) { var rij = rr[r - 1 + i] || [], x = []; for (var j = 0; j < nc; j++) x.push(rij[c - 1 + j] === undefined ? '' : rij[c - 1 + j]); o.push(x); } return o; },  // v6.2: na herladen ook de rijen die er intussen bij kwamen
        getValue: function () { var rij = R()[r - 1] || []; return rij[c - 1] === undefined ? '' : rij[c - 1]; },
        setValues: function (v) { var rr = R(); v.forEach(function (vr, i) { rr[r - 1 + i] = rr[r - 1 + i] || []; vr.forEach(function (x, j) { rr[r - 1 + i][c - 1 + j] = x; }); }); vuil = true; return this; },
        setValue: function (x) { var rr = R(); rr[r - 1] = rr[r - 1] || []; rr[r - 1][c - 1] = x; vuil = true; return this; },
        setNumberFormat: function () { return this; },
        clearContent: function () { var rr = R(); for (var i = 0; i < nr; i++) { var rij = rr[r - 1 + i]; if (rij) for (var j = 0; j < nc; j++) rij[c - 1 + j] = ''; } vuil = true; return this; }
      };
    },
    _geladen: function () { return !!rijen; }, _vuil: function () { return vuil; }, _rijen: function () { return R(); }, _schoon: function () { vuil = false; }
  };
  return b;
}

/* ----- Postgres als Sheet ----- */
function uitDb(tab, kolom, v) {
  if (v === null || v === undefined) return '';
  if (schema.isNumeriek(tab, kolom)) { var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.')); return isNaN(n) ? '' : n; }
  return typeof v === 'string' ? v : String(v);
}
function naarDb(tab, kolom, v, waarschuw) {
  if (v === null || v === undefined || v === '') return null;
  if (schema.isNumeriek(tab, kolom)) {
    var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (isNaN(n) || !isFinite(n)) { if (waarschuw) waarschuw(tab + '.' + kolom + ': "' + String(v).slice(0, 40) + '" is geen getal; leeg opgeslagen'); return null; }
    return n;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function zorgTabel(tab) {
  if (!SCHEMA_KLAAR) { schema.zorgSchema(brug.sql); SCHEMA_KLAAR = true; Object.keys(schema.tabellen()).forEach(function (t) { TABEL_KLAAR[t] = true; }); }
  TABEL_KLAAR[tab] = true;
}
function laadTabel(tab) {
  zorgTabel(tab);
  var kop = schema.tabellen()[tab], sleutel = schema.sleutelVan(tab);
  var rows = brug.sql('select * from ' + schema.q(schema.tabelNaam(tab)) + ' order by ' + (sleutel ? 'rij, ' + schema.q(schema.kolomNaam(sleutel)) : 'nr')).rows;
  return rows.map(function (r) { return kop.map(function (k) { return uitDb(tab, k, r[schema.kolomNaam(k)]); }); });
}
// Tabel wegschrijven: per sleutel alleen wat veranderd is; zonder sleutel (Aanmeldingen) de hele tabel opnieuw
function schrijfTabel(tab, blad, snapshot, waarschuw) {
  var kop = schema.tabellen()[tab], sleutel = schema.sleutelVan(tab), t = schema.q(schema.tabelNaam(tab));
  var rijen = blad._rijen().slice(1).filter(function (r) { return r && r.some(function (x) { return x !== '' && x != null; }); });
  var kolommen = kop.map(function (k) { return schema.q(schema.kolomNaam(k)); });
  function params(r) { return kop.map(function (k, i) { return naarDb(tab, k, r[i], waarschuw); }); }
  var stats = { ingevoegd: 0, bijgewerkt: 0, verwijderd: 0 };
  if (!sleutel) {
    brug.sql('delete from ' + t);
    for (var i = 0; i < rijen.length; i += 100) {
      var deel = rijen.slice(i, i + 100), waarden = [], n = 0;
      var groepen = deel.map(function (r) { return '(' + params(r).map(function (v) { waarden.push(v); return '$' + (++n); }).join(', ') + ')'; });
      brug.sql('insert into ' + t + ' (' + kolommen.join(', ') + ') values ' + groepen.join(', '), waarden);
    }
    stats.ingevoegd = rijen.length;
    return stats;
  }
  var ks = kop.indexOf(sleutel), nieuw = {}, upserts = [];
  rijen.forEach(function (r) {
    var k = r[ks]; if (k === '' || k == null) { if (waarschuw) waarschuw(tab + ': rij zonder ' + sleutel + ' overgeslagen'); return; }
    k = String(k);
    var vinger = JSON.stringify(params(r)); nieuw[k] = true;
    if (snapshot[k] !== vinger) { upserts.push(r); if (snapshot[k] === undefined) stats.ingevoegd++; else stats.bijgewerkt++; }
  });
  var weg = Object.keys(snapshot).filter(function (k) { return !nieuw[k]; });
  for (var j = 0; j < upserts.length; j += 50) {
    var stuk = upserts.slice(j, j + 50), w = [], m = 0;
    var vals = stuk.map(function (r) { return '(' + params(r).map(function (v) { w.push(v); return '$' + (++m); }).join(', ') + ')'; });
    var zet = kop.filter(function (k) { return k !== sleutel; }).map(function (k) { var c = schema.q(schema.kolomNaam(k)); return c + ' = excluded.' + c; });
    brug.sql('insert into ' + t + ' (' + kolommen.join(', ') + ') values ' + vals.join(', ') + ' on conflict (' + schema.q(schema.kolomNaam(sleutel)) + ') do update set ' + zet.join(', '), w);
  }
  for (var x = 0; x < weg.length; x += 200) { var stukWeg = weg.slice(x, x + 200); brug.sql('delete from ' + t + ' where ' + schema.q(schema.kolomNaam(sleutel)) + ' = any($1::text[])', [stukWeg]); stats.verwijderd += stukWeg.length; }
  return stats;
}

/* ----- Diensten per verzoek ----- */
function maakDiensten(opties) {
  opties = opties || {};
  var env = opties.env || process.env, logboek = [], waarschuwingen = [];
  var log = function (s) { logboek.push(String(s)); if (env.ATHENA_LOG === '1') console.log('[Code.gs]', s); };
  var waarschuw = function (s) { waarschuwingen.push(s); log('Let op: ' + s); };
  var DB_ID = 'postgres';
  var T = schema.tabellen(), bladen = {}, snapshots = {};
  var G = google.maak({ env: env, brug: brug, log: log, blob: blob, b64Encode: b64Encode, b64Decode: b64Decode, formatDate: formatDate, uuid: uuid });

  function blad(naam) {
    if (bladen[naam]) return bladen[naam];
    if (!T[naam]) return null;
    var b = maakBlad(naam, function () {
      var rijen = laadTabel(naam), kop = T[naam], sleutel = schema.sleutelVan(naam), snap = {};
      if (sleutel) { var ks = kop.indexOf(sleutel); rijen.forEach(function (r) { if (r[ks] !== '' && r[ks] != null) snap[String(r[ks])] = JSON.stringify(kop.map(function (k, i) { return naarDb(naam, k, r[i]); })); }); }
      snapshots[naam] = snap;
      return [kop.slice()].concat(rijen);
    });
    bladen[naam] = b; return b;
  }
  var losseBladen = {};  // tabbladen buiten TABELLEN (bestaan alleen in dit verzoek)
  var dbSpreadsheet = {
    getName: function () { return 'Athena Assistent — data (Postgres)'; }, getId: function () { return DB_ID; },
    getUrl: function () { return env.SUPABASE_URL ? env.SUPABASE_URL.replace(/^https:\/\/([^.]+)\.supabase\.co.*$/, 'https://supabase.com/dashboard/project/$1/editor') : ''; },
    getSheetByName: function (n) { return blad(n) || losseBladen[n] || (G.formulierBlad ? G.formulierBlad(n) : null); },
    insertSheet: function (n) { if (T[n]) return blad(n); var l = maakBlad(n, function () { return []; }); losseBladen[n] = l; return l; },
    getSheets: function () { return Object.keys(T).map(blad).concat(Object.keys(losseBladen).map(function (n) { return losseBladen[n]; })).concat(G.formulierBladen ? G.formulierBladen() : []); },
    deleteSheet: function () {}
  };
  // De "Sheet" van Code.gs (SHEET_ID uit de eigenschappen, of niets) is Postgres; elk ander id is een echte Google-spreadsheet (XPS-export, documenttekst)
  var SpreadsheetApp = { openById: function (id) { return (!id || id === DB_ID || id === eigenschappen.getProperty('SHEET_ID')) ? dbSpreadsheet : G.spreadsheet(id); }, create: function () { return dbSpreadsheet; } };

  // Eigenschappen: één keer laden, wijzigingen direct wegschrijven (zeldzaam)
  var props = null;
  function laadProps() { if (props) return props; zorgTabel('Scholen'); props = {}; brug.sql('select sleutel, waarde from eigenschappen').rows.forEach(function (r) { props[r.sleutel] = r.waarde == null ? '' : String(r.waarde); }); return props; }
  var EIGEN_OMGEVING = { DB: true, GOOGLE_NEP: true, LOG: true, APP_URL: false };  // v6.2: ATHENA_DB, ATHENA_GOOGLE_NEP en ATHENA_LOG sturen de server zelf aan en zijn geen scripteigenschap (apiExportAlles('eigenschappen') liet ze zien)
  function uitOmgeving(k) { var e = env['ATHENA_' + k]; return (!EIGEN_OMGEVING[k] && e !== undefined && e !== '') ? e : undefined; }
  var eigenschappen = {
    getProperty: function (k) {
      if (k === 'EIGENAAR_EMAIL' && env.EIGENAAR_EMAIL) return env.EIGENAAR_EMAIL;  // v6.0: wie via Google inlogt als eigenaar is de beheerder (gebruikerVanEmail in Code.gs)
      var e = uitOmgeving(k); if (e !== undefined) return e;  // sleutels zoals ANTHROPIC_API_KEY horen in de omgeving, niet in de database
      var pr = laadProps();
      if (Object.prototype.hasOwnProperty.call(pr, k)) return pr[k];
      return k === 'SHEET_ID' ? DB_ID : null;  // zonder gemigreerde eigenschappen is Postgres gewoon de Sheet (sheet() in Code.gs eist een id)
    },
    setProperty: function (k, v) { laadProps()[k] = String(v); brug.sql('insert into eigenschappen (sleutel, waarde) values ($1, $2) on conflict (sleutel) do update set waarde = excluded.waarde', [k, String(v)]); return this; },
    deleteProperty: function (k) { delete laadProps()[k]; brug.sql('delete from eigenschappen where sleutel = $1', [k]); return this; },
    getProperties: function () { var uit = {}, pr = laadProps(); Object.keys(pr).forEach(function (k) { uit[k] = pr[k]; }); Object.keys(env).forEach(function (k) { if (k.indexOf('ATHENA_') === 0 && uitOmgeving(k.slice(7)) !== undefined) uit[k.slice(7)] = env[k]; }); return uit; }
  };
  var PropertiesService = { getScriptProperties: function () { return eigenschappen; } };

  var cache = {
    get: function (k) { zorgTabel('Scholen'); var r = brug.sql('select waarde from cache where sleutel = $1 and (verloopt is null or verloopt > now())', [k]).rows[0]; return r ? r.waarde : null; },
    put: function (k, v, sec) { zorgTabel('Scholen'); brug.sql('insert into cache (sleutel, waarde, verloopt) values ($1, $2, now() + ($3 || \' seconds\')::interval) on conflict (sleutel) do update set waarde = excluded.waarde, verloopt = excluded.verloopt', [k, String(v), String(Math.max(1, Number(sec) || 600))]); if (Math.random() < 0.05) brug.sql('delete from cache where verloopt < now()'); },
    remove: function (k) { brug.sql('delete from cache where sleutel = $1', [k]); }
  };
  var CacheService = { getScriptCache: function () { return cache; }, getUserCache: function () { return cache; } };

  var LOCK = 7310;  // hashtext('athena') zou ook kunnen; een vast getal is genoeg: één lock voor de hele backend
  var heeftLock = false;
  function probeerLock() { var r = brug.sql('select pg_try_advisory_lock($1) as ok', [LOCK]).rows[0]; heeftLock = !!(r && r.ok); return heeftLock; }
  // v6.2: releaseLock() geeft de lock pas echt vrij in flush(), nadat de wijzigingen in Postgres staan. In Apps Script schrijft
  // Code.gs direct in de Sheet, dus binnen de lock; hier schrijft flush() aan het eind van het verzoek. Zonder dit uitstel liepen
  // de flushes van verschillende instanties door elkaar (deadlock detected in server/test/fouten_test.js). Eén lock per verzoek:
  // een tweede metLock in hetzelfde verzoek krijgt dezelfde lock (pg_advisory_lock telt anders per aanroep en zou blijven hangen).
  function echtVrijgeven() { if (heeftLock) { try { brug.sql('select pg_advisory_unlock($1)', [LOCK]); } catch (e) {} heeftLock = false; } }
  var lock = {
    tryLock: function (ms) { if (heeftLock) return true; var tot = Date.now() + (Number(ms) || 0); while (!probeerLock()) { if (Date.now() >= tot) return false; brug.sleep(150); } return true; },
    waitLock: function (ms) { if (!this.tryLock(ms)) throw new Error('Lock timeout'); },
    releaseLock: function () { /* uitgesteld tot flush() */ },
    hasLock: function () { return heeftLock; }
  };
  var LockService = { getScriptLock: function () { return lock; }, getDocumentLock: function () { return lock; }, getUserLock: function () { return lock; } };

  var Utilities = {
    getUuid: uuid, formatDate: formatDate, sleep: function (ms) { brug.sleep(ms); }, newBlob: blob, base64Decode: b64Decode, base64Encode: b64Encode, parseCsv: parseCsv,
    computeDigest: function (alg, s) { return Array.prototype.slice.call(require('crypto').createHash('sha256').update(String(s)).digest()); }, DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' }
  };
  var eigenaar = env.EIGENAAR_EMAIL || '';
  var Session = { getScriptTimeZone: function () { return TZ; }, getEffectiveUser: function () { return { getEmail: function () { return eigenaar; } }; }, getActiveUser: function () { return { getEmail: function () { return eigenaar; } }; } };
  var Logger = { log: log, getLog: function () { return logboek.join('\n'); } };
  var ContentService = { MimeType: { JSON: 'json', TEXT: 'text' }, createTextOutput: function (t) { return { setMimeType: function () { return t; }, getContent: function () { return t; } }; } };
  var MimeType = { GOOGLE_DOCS: 'application/vnd.google-apps.document', GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet', GOOGLE_SLIDES: 'application/vnd.google-apps.presentation', FOLDER: 'application/vnd.google-apps.folder', PLAIN_TEXT: 'text/plain', CSV: 'text/csv', PDF: 'application/pdf', MICROSOFT_WORD: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', MICROSOFT_EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', HTML: 'text/html', JPEG: 'image/jpeg', PNG: 'image/png' };
  var triggerBouwer = function () { var t = {}; ['timeBased', 'everyHours', 'everyMinutes', 'everyDays', 'everyWeeks', 'atHour', 'onMonthDay', 'onWeekDay', 'nearMinute', 'create', 'inTimezone'].forEach(function (n) { t[n] = function () { return t; }; }); return t; };
  var ScriptApp = {
    getProjectTriggers: function () { return schema.triggers().map(function (n) { return { getHandlerFunction: function () { return n; }, getUniqueId: function () { return 'cron-' + n; } }; }); },  // de triggers draaien als cron (vercel.json); zo staan ze in apiStatus/controleer op groen
    deleteTrigger: function () {}, newTrigger: triggerBouwer,
    getService: function () { return { getUrl: function () { return env.APP_API_URL || ''; } }; },
    WeekDay: { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' }
  };
  var UrlFetchApp = {
    fetch: function (url, o) {
      o = o || {};
      var headers = {}; Object.keys(o.headers || {}).forEach(function (k) { headers[k] = String(o.headers[k]); });
      if (o.contentType) headers['Content-Type'] = o.contentType;
      var payload = o.payload;
      if (payload && typeof payload === 'object' && !(payload instanceof Array)) { payload = Object.keys(payload).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]); }).join('&'); if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
      var r = brug.fetch(url, { methode: o.method || 'get', headers: headers, body: payload == null ? undefined : String(payload), timeoutMs: 110000 });
      if (!o.muteHttpExceptions && r.status >= 400) throw new Error('Request failed for ' + url.replace(/\?.*$/, '') + ' returned code ' + r.status + '. Truncated server response: ' + String(r.body || '').slice(0, 200));
      return { getResponseCode: function () { return r.status; }, getContentText: function () { return r.body || ''; }, getHeaders: function () { return r.headers; }, getAllHeaders: function () { return r.headers; }, getBlob: function () { return blob(r.body || '', r.headers['content-type'] || 'application/octet-stream'); } };
    },
    fetchAll: function (lijst) { return lijst.map(function (x) { return UrlFetchApp.fetch(x.url, x); }); }
  };

  function flush() {
    var stats = {}, vuil = Object.keys(bladen).filter(function (n) { return bladen[n]._geladen() && bladen[n]._vuil(); });
    try {
      if (vuil.length) {
        brug.sql('begin');
        try { vuil.forEach(function (n) { stats[n] = schrijfTabel(n, bladen[n], snapshots[n] || {}, waarschuw); bladen[n]._schoon(); }); brug.sql('commit'); }
        catch (e) { try { brug.sql('rollback'); } catch (e2) {} throw e; }
      }
    } finally { echtVrijgeven(); }  // v6.2: ook na een mislukte flush de lock loslaten
    if (G.flush) G.flush();
    return stats;
  }

  return {
    SpreadsheetApp: SpreadsheetApp, PropertiesService: PropertiesService, CacheService: CacheService, LockService: LockService, Utilities: Utilities, Session: Session, Logger: Logger,
    ContentService: ContentService, MimeType: MimeType, ScriptApp: ScriptApp, UrlFetchApp: UrlFetchApp,
    MailApp: G.MailApp, GmailApp: G.GmailApp, CalendarApp: G.CalendarApp, DriveApp: G.DriveApp, Drive: G.Drive, DocumentApp: G.DocumentApp, HtmlService: { createHtmlOutput: function (t) { return { getContent: function () { return t; } }; } },
    flush: flush, logboek: logboek, waarschuwingen: waarschuwingen, _bladen: bladen
  };
}

module.exports = { maakDiensten: maakDiensten, formatDate: formatDate, parseCsv: parseCsv, uitDb: uitDb, naarDb: naarDb, zorgTabel: zorgTabel, laadTabel: laadTabel, TZ: TZ, _reset: function () { SCHEMA_KLAAR = false; TABEL_KLAAR = {}; } };
