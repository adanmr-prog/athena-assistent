/* Athena Assistent — v6.0: Gmail, Agenda, Drive, Docs en Sheets via de Google REST-API's, in de vorm van de Apps Script-diensten
 * die Code.gs gebruikt (GmailApp, CalendarApp, DriveApp, Drive, DocumentApp, MailApp, SpreadsheetApp.openById voor andere
 * spreadsheets). Eén account: de eigenaar, met een refresh-token (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN;
 * zie server/README.md en server/google-toestemming.js). Zonder die sleutels gooit elke aanroep een duidelijke fout; Code.gs
 * vangt die op waar het kan (mails en agenda worden dan leeg). Alleen de methodes die Code.gs gebruikt zijn nagebouwd. */
'use strict';

var TOKEN = { waarde: '', tot: 0 };
var GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me/', AGENDA = 'https://www.googleapis.com/calendar/v3/calendars/primary/', DRIVE = 'https://www.googleapis.com/drive/v3/', DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files', DOCS = 'https://docs.googleapis.com/v1/documents', SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
var MAP = 'application/vnd.google-apps.folder', GDOC = 'application/vnd.google-apps.document', GSHEET = 'application/vnd.google-apps.spreadsheet';
var VELDEN = 'id,name,mimeType,modifiedTime,createdTime,size,webViewLink,parents,trashed';

function maak(h) {
  var env = h.env, brug = h.brug, log = h.log, blob = h.blob;
  function gekoppeld() { return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN); }
  function token(vernieuw) {
    if (!gekoppeld()) throw new Error('Google is niet gekoppeld: zet GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET en GOOGLE_REFRESH_TOKEN (zie server/README.md).');
    if (!vernieuw && TOKEN.waarde && TOKEN.tot > Date.now() + 60000) return TOKEN.waarde;
    var r = brug.fetch('https://oauth2.googleapis.com/token', { methode: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&client_id=' + encodeURIComponent(env.GOOGLE_CLIENT_ID) + '&client_secret=' + encodeURIComponent(env.GOOGLE_CLIENT_SECRET) + '&refresh_token=' + encodeURIComponent(env.GOOGLE_REFRESH_TOKEN) });
    var d = {}; try { d = JSON.parse(r.body || '{}'); } catch (e) {}
    if (r.status !== 200 || !d.access_token) throw new Error('Google-token vernieuwen mislukt (' + r.status + '): ' + ((d.error_description || d.error) || String(r.body || '').slice(0, 120)));
    TOKEN.waarde = d.access_token; TOKEN.tot = Date.now() + (Number(d.expires_in) || 3600) * 1000;
    return TOKEN.waarde;
  }
  // Eén API-aanroep met JSON in en uit; 401 → token vernieuwen en één keer opnieuw
  function api(methode, url, body, o) {
    o = o || {};
    var poging = function (vernieuw) {
      var headers = { Authorization: 'Bearer ' + token(vernieuw) };
      if (o.headers) Object.keys(o.headers).forEach(function (k) { headers[k] = o.headers[k]; });
      var inhoud = body === undefined ? undefined : (o.raw ? body : JSON.stringify(body));
      if (body !== undefined && !o.raw && !headers['Content-Type']) headers['Content-Type'] = 'application/json; charset=UTF-8';
      return brug.fetch(url, { methode: methode, headers: headers, body: inhoud, alsBase64: !!o.alsBase64, timeoutMs: o.timeoutMs || 60000 });
    };
    var r = poging(false);
    if (r.status === 401) r = poging(true);
    if (r.status >= 400) {
      var d = {}; try { d = JSON.parse(r.body || '{}'); } catch (e) {}
      var f = new Error('Google ' + r.status + ': ' + ((d.error && (d.error.message || d.error.status)) || String(r.body || '').slice(0, 160)) + ' (' + methode + ' ' + url.replace(/\?.*$/, '') + ')'); f.status = r.status; throw f;
    }
    if (o.alsBase64) return r.body;
    if (o.tekst) return r.body;
    if (!r.body) return {};
    try { return JSON.parse(r.body); } catch (e2) { return { ruw: r.body }; }
  }
  // Meerdere GET's tegelijk (de worker haalt ze parallel op)
  function apiVeel(urls) {
    if (!urls.length) return [];
    var t = token(false), uit = brug.fetchVeel(urls.map(function (u) { return { url: u, methode: 'GET', headers: { Authorization: 'Bearer ' + t }, timeoutMs: 60000 }; }));
    return uit.map(function (r) { if (r.fout || r.status >= 400) { log('Google: ' + (r.fout || r.status)); return null; } try { return JSON.parse(r.body || 'null'); } catch (e) { return null; } });
  }
  function q(s) { return encodeURIComponent(s); }
  function iter(lijst) { var i = 0; return { hasNext: function () { return i < lijst.length; }, next: function () { return lijst[i++]; } }; }
  function b64url(s) { return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function vanB64url(s) { return Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
  function mimeTekst(headers, body) {
    var regels = Object.keys(headers).filter(function (k) { return headers[k]; }).map(function (k) { return k + ': ' + headers[k]; });
    regels.push('MIME-Version: 1.0', 'Content-Type: ' + (body.html ? 'text/html' : 'text/plain') + '; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '');
    return regels.join('\r\n') + '\r\n' + Buffer.from(body.html || body.tekst || '', 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  }
  function kopNaam(naam) { return /[^\x20-\x7e]|[",]/.test(naam) ? '=?UTF-8?B?' + Buffer.from(naam, 'utf8').toString('base64') + '?=' : naam; }

  /* ----- Gmail ----- */
  function kop(m, naam) { var h = ((m.payload || {}).headers || []).filter(function (x) { return String(x.name).toLowerCase() === naam.toLowerCase(); })[0]; return h ? h.value : ''; }
  function tekstUitDeel(deel, wil) {
    if (!deel) return '';
    if (deel.mimeType === wil && deel.body && deel.body.data) return vanB64url(deel.body.data);
    var uit = ''; (deel.parts || []).some(function (p) { uit = tekstUitDeel(p, wil); return !!uit; });
    return uit;
  }
  function platteTekst(m) {
    var t = tekstUitDeel(m.payload, 'text/plain');
    if (!t) { var html = tekstUitDeel(m.payload, 'text/html'); if (html) t = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }
    return t || (m.snippet || '');
  }
  function bericht(m, thread) {
    return { getId: function () { return m.id; }, getThread: function () { return thread; }, getFrom: function () { return kop(m, 'From'); }, getTo: function () { return kop(m, 'To'); }, getCc: function () { return kop(m, 'Cc'); }, getReplyTo: function () { return kop(m, 'Reply-To') || kop(m, 'From'); },
      getDate: function () { return new Date(Number(m.internalDate) || Date.parse(kop(m, 'Date')) || Date.now()); }, getSubject: function () { return kop(m, 'Subject'); }, getPlainBody: function () { return platteTekst(m); }, getBody: function () { return tekstUitDeel(m.payload, 'text/html') || platteTekst(m); },
      isUnread: function () { return (m.labelIds || []).indexOf('UNREAD') >= 0; },
      createDraftReply: function (tekst) {
        var aan = kop(m, 'Reply-To') || kop(m, 'From'), onderwerp = kop(m, 'Subject'), msgId = kop(m, 'Message-ID') || kop(m, 'Message-Id');
        var raw = mimeTekst({ To: aan, Subject: /^re:/i.test(onderwerp) ? onderwerp : 'Re: ' + onderwerp, 'In-Reply-To': msgId, References: msgId }, { tekst: tekst });
        var d = api('POST', GMAIL + 'drafts', { message: { raw: b64url(raw), threadId: m.threadId } });
        return { getId: function () { return d.id; }, getMessage: function () { return { getId: function () { return d.message && d.message.id; } }; } };
      } };
  }
  function thread(t) {
    var msgs = (t.messages || []).map(function (m) { return bericht(m, th); }), th;
    th = { getId: function () { return t.id; }, getMessages: function () { return msgs; }, getMessageCount: function () { return msgs.length; },
      getFirstMessageSubject: function () { return msgs.length ? msgs[0].getSubject() : ''; }, getLastMessageDate: function () { return msgs.length ? msgs[msgs.length - 1].getDate() : new Date(0); },
      getPermalink: function () { return 'https://mail.google.com/mail/#all/' + t.id; }, getLabels: function () { return []; }, isUnread: function () { return msgs.some(function (m) { return m.isUnread(); }); } };
    return th;
  }
  var GmailApp = {
    search: function (zoek, start, max) {
      start = Number(start) || 0; max = Number(max) || 50;
      var d = api('GET', GMAIL + 'threads?q=' + q(zoek || '') + '&maxResults=' + Math.min(100, start + max)), ids = (d.threads || []).slice(start, start + max).map(function (x) { return x.id; });
      return apiVeel(ids.map(function (id) { return GMAIL + 'threads/' + id + '?format=full'; })).filter(Boolean).map(thread);
    },
    getThreadById: function (id) { try { return thread(api('GET', GMAIL + 'threads/' + q(id) + '?format=full')); } catch (e) { if (e.status === 404) return null; throw e; } },
    createDraft: function (aan, onderwerp, tekst) { var d = api('POST', GMAIL + 'drafts', { message: { raw: b64url(mimeTekst({ To: aan, Subject: onderwerp }, { tekst: tekst })) } }); return { getId: function () { return d.id; }, getMessage: function () { return { getId: function () { return d.message && d.message.id; } }; } }; },
    getUserLabelByName: function () { return null; }
  };
  var MailApp = {
    sendEmail: function (a, b, c, d) {
      var o = (a && typeof a === 'object') ? a : { to: a, subject: b, body: c }; if (d && typeof d === 'object') Object.keys(d).forEach(function (k) { o[k] = d[k]; });
      var van = env.EIGENAAR_EMAIL || '';
      var raw = mimeTekst({ To: o.to, Cc: o.cc, Bcc: o.bcc, From: o.name ? kopNaam(o.name) + (van ? ' <' + van + '>' : '') : '', 'Reply-To': o.replyTo, Subject: o.subject }, { html: o.htmlBody, tekst: o.body });
      api('POST', GMAIL + 'messages/send', { raw: b64url(raw) });
    },
    getRemainingDailyQuota: function () { return 1500; }
  };

  /* ----- Agenda ----- */
  function iso(d) { return (d instanceof Date ? d : new Date(d)).toISOString(); }
  function event(e) {
    var ev = {
      getId: function () { return e.iCalUID || e.id; }, getTitle: function () { return e.summary || ''; }, getDescription: function () { return e.description || ''; }, getLocation: function () { return e.location || ''; },
      getStartTime: function () { return new Date(e.start && (e.start.dateTime || e.start.date)); }, getEndTime: function () { return new Date(e.end && (e.end.dateTime || e.end.date)); },
      isAllDayEvent: function () { return !!(e.start && e.start.date && !e.start.dateTime); }, isRecurringEvent: function () { return !!e.recurringEventId; },
      getGuestList: function () { return (e.attendees || []).filter(function (a) { return !a.self; }).map(function (a) { return { getEmail: function () { return a.email || ''; }, getName: function () { return a.displayName || ''; }, getGuestStatus: function () { return a.responseStatus || ''; } }; }); },
      getCreators: function () { return [(e.creator && e.creator.email) || (e.organizer && e.organizer.email) || '']; },
      setTime: function (s, t) { e = api('PATCH', AGENDA + 'events/' + q(e.id) + '?sendUpdates=all', { start: { dateTime: iso(s), timeZone: 'Europe/Amsterdam' }, end: { dateTime: iso(t), timeZone: 'Europe/Amsterdam' } }); return ev; },
      setTitle: function (t) { e = api('PATCH', AGENDA + 'events/' + q(e.id), { summary: t }); return ev; }, setDescription: function (t) { e = api('PATCH', AGENDA + 'events/' + q(e.id), { description: t }); return ev; }, setLocation: function (t) { e = api('PATCH', AGENDA + 'events/' + q(e.id), { location: t }); return ev; },
      deleteEvent: function () { api('DELETE', AGENDA + 'events/' + q(e.id) + '?sendUpdates=all'); }
    };
    return ev;
  }
  var agenda = {
    getEvents: function (van, tot) { return (api('GET', AGENDA + 'events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=' + q(iso(van)) + '&timeMax=' + q(iso(tot))).items || []).map(event); },
    getEventsForDay: function (d) { var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return agenda.getEvents(a, new Date(a.getTime() + 86400000)); },
    getEventById: function (id) {
      id = String(id || ''); if (!id) return null;
      if (/@/.test(id)) { var l = api('GET', AGENDA + 'events?iCalUID=' + q(id) + '&maxResults=1').items || []; return l.length ? event(l[0]) : null; }
      try { return event(api('GET', AGENDA + 'events/' + q(id))); } catch (e) { if (e.status === 404 || e.status === 410) return null; throw e; }
    },
    createEvent: function (titel, start, eind, o) {
      o = o || {}; var gasten = String(o.guests || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var body = { summary: titel, description: o.description || '', location: o.location || '', start: { dateTime: iso(start), timeZone: 'Europe/Amsterdam' }, end: { dateTime: iso(eind), timeZone: 'Europe/Amsterdam' } };
      if (gasten.length) body.attendees = gasten.map(function (g) { return { email: g }; });
      return event(api('POST', AGENDA + 'events?sendUpdates=' + (o.sendInvites ? 'all' : 'none'), body));
    },
    getName: function () { return 'Agenda'; }
  };
  var CalendarApp = { getDefaultCalendar: function () { return agenda; }, getCalendarById: function () { return agenda; } };

  /* ----- Drive ----- */
  function meta(id) { return api('GET', DRIVE + 'files/' + q(id) + '?fields=' + VELDEN + '&supportsAllDrives=true'); }
  function lijst(zoek) {
    var uit = [], token2 = '', n = 0;
    do { var d = api('GET', DRIVE + 'files?q=' + q(zoek) + '&fields=nextPageToken,files(' + VELDEN + ')&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' + (token2 ? '&pageToken=' + q(token2) : '')); uit = uit.concat(d.files || []); token2 = d.nextPageToken || ''; } while (token2 && ++n < 5);
    return uit;
  }
  function veilig(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function urlVan(m) { if (m.webViewLink) return m.webViewLink; if (m.mimeType === MAP) return 'https://drive.google.com/drive/folders/' + m.id; if (m.mimeType === GDOC) return 'https://docs.google.com/document/d/' + m.id + '/edit'; if (m.mimeType === GSHEET) return 'https://docs.google.com/spreadsheets/d/' + m.id + '/edit'; return 'https://drive.google.com/file/d/' + m.id + '/view'; }
  function bestand(m) {
    var f = {
      getId: function () { return m.id; }, getName: function () { return m.name || ''; }, getMimeType: function () { return m.mimeType || ''; }, getUrl: function () { return urlVan(m); },
      getLastUpdated: function () { return new Date(m.modifiedTime || Date.now()); }, getDateCreated: function () { return new Date(m.createdTime || m.modifiedTime || Date.now()); }, getSize: function () { return Number(m.size) || 0; },
      isTrashed: function () { return !!m.trashed; }, setTrashed: function (b) { m = api('PATCH', DRIVE + 'files/' + q(m.id) + '?fields=' + VELDEN + '&supportsAllDrives=true', { trashed: !!b }); return f; },
      setName: function (n) { m = api('PATCH', DRIVE + 'files/' + q(m.id) + '?fields=' + VELDEN, { name: n }); return f; },
      getBlob: function () {
        if (m.mimeType === GDOC || m.mimeType === GSHEET || /vnd\.google-apps/.test(m.mimeType || '')) { var mime = m.mimeType === GSHEET ? 'text/csv' : 'text/plain'; return blob(api('GET', DRIVE + 'files/' + q(m.id) + '/export?mimeType=' + q(mime), undefined, { tekst: true }), mime, m.name); }
        var b64 = api('GET', DRIVE + 'files/' + q(m.id) + '?alt=media&supportsAllDrives=true', undefined, { alsBase64: true });
        return blob(Buffer.from(b64, 'base64'), m.mimeType, m.name);
      },
      makeCopy: function (naam, map) { var body = { name: naam || m.name }; if (map) body.parents = [map.getId()]; return bestand(api('POST', DRIVE + 'files/' + q(m.id) + '/copy?fields=' + VELDEN + '&supportsAllDrives=true', body)); },
      moveTo: function (map) { m = api('PATCH', DRIVE + 'files/' + q(m.id) + '?fields=' + VELDEN + '&supportsAllDrives=true&addParents=' + q(map.getId()) + ((m.parents || []).length ? '&removeParents=' + q((m.parents || []).join(',')) : ''), {}); return f; },
      addEditor: function (email) { api('POST', DRIVE + 'files/' + q(m.id) + '/permissions?sendNotificationEmail=false&supportsAllDrives=true', { role: 'writer', type: 'user', emailAddress: email }); return f; },
      getParents: function () { return iter((m.parents || []).map(function (id) { return map({ id: id, mimeType: MAP }); })); }
    };
    return f;
  }
  function map(m) {
    var fo = {
      getId: function () { return m.id; }, getName: function () { return m.name || ''; }, getUrl: function () { return urlVan(Object.assign({ mimeType: MAP }, m)); },
      isTrashed: function () { return !!m.trashed; }, setTrashed: function (b) { m = api('PATCH', DRIVE + 'files/' + q(m.id) + '?fields=' + VELDEN + '&supportsAllDrives=true', { trashed: !!b }); return fo; },
      getFolders: function () { return iter(lijst("'" + veilig(m.id) + "' in parents and mimeType = '" + MAP + "' and trashed = false").map(map)); },
      getFoldersByName: function (n) { return iter(lijst("'" + veilig(m.id) + "' in parents and mimeType = '" + MAP + "' and name = '" + veilig(n) + "' and trashed = false").map(map)); },
      getFiles: function () { return iter(lijst("'" + veilig(m.id) + "' in parents and mimeType != '" + MAP + "' and trashed = false").map(bestand)); },
      getFilesByName: function (n) { return iter(lijst("'" + veilig(m.id) + "' in parents and mimeType != '" + MAP + "' and name = '" + veilig(n) + "' and trashed = false").map(bestand)); },
      createFolder: function (n) { return map(api('POST', DRIVE + 'files?fields=' + VELDEN + '&supportsAllDrives=true', { name: n, mimeType: MAP, parents: [m.id] })); },
      createFile: function (a, b, c) {
        var bl = a && typeof a.getBytes === 'function' ? a : blob(String(b || ''), c || 'text/plain', String(a));
        var grens = 'athena' + Date.now(), metaJson = JSON.stringify({ name: bl.getName(), parents: [m.id] });
        var body = '--' + grens + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + metaJson + '\r\n--' + grens + '\r\nContent-Type: ' + bl.getContentType() + '\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from(bl.getBytes()).toString('base64') + '\r\n--' + grens + '--';
        return bestand(api('POST', DRIVE_UPLOAD + '?uploadType=multipart&fields=' + VELDEN + '&supportsAllDrives=true', body, { raw: true, headers: { 'Content-Type': 'multipart/related; boundary=' + grens } }));
      }
    };
    return fo;
  }
  var DriveApp = {
    getFolderById: function (id) { var m = meta(id); if (m.trashed) throw new Error('Map staat in de prullenbak'); return map(m); },
    getFileById: function (id) { return bestand(meta(id)); },
    createFolder: function (n) { return map(api('POST', DRIVE + 'files?fields=' + VELDEN, { name: n, mimeType: MAP })); },
    getRootFolder: function () { return map({ id: 'root', name: 'Mijn Drive', mimeType: MAP }); }
  };
  // De geavanceerde Drive-service (v3) zoals Code.gs hem gebruikt: Files.copy met OCR
  var Drive = { Files: {
    copy: function (resource, id, params) { var qs = Object.keys(params || {}).map(function (k) { return k + '=' + q(params[k]); }).join('&'); return api('POST', DRIVE + 'files/' + q(id) + '/copy?fields=' + VELDEN + '&supportsAllDrives=true' + (qs ? '&' + qs : ''), resource); },
    create: function (resource) { return api('POST', DRIVE + 'files?fields=' + VELDEN, resource); },
    get: function (id) { return meta(id); },
    list: function (params) { return { files: lijst((params && params.q) || "trashed = false") }; }
  } };

  /* ----- Docs: lezen (tekst) en de offerte (nieuw document of sjabloon met {{velden}}) ----- */
  function docTekst(d) {
    var uit = '';
    (d.body && d.body.content || []).forEach(function (el) {
      if (el.paragraph) (el.paragraph.elements || []).forEach(function (x) { if (x.textRun) uit += x.textRun.content || ''; });
      else if (el.table) (el.table.tableRows || []).forEach(function (rij) { (rij.tableCells || []).forEach(function (cel) { (cel.content || []).forEach(function (c2) { if (c2.paragraph) (c2.paragraph.elements || []).forEach(function (x) { if (x.textRun) uit += x.textRun.content || ''; }); }); }); });
    });
    return uit;
  }
  function kleur(hex) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '')); return m ? { red: parseInt(m[1], 16) / 255, green: parseInt(m[2], 16) / 255, blue: parseInt(m[3], 16) / 255 } : null; }
  var KOPPEN = { TITLE: 'TITLE', SUBTITLE: 'SUBTITLE', HEADING1: 'HEADING_1', HEADING2: 'HEADING_2', HEADING3: 'HEADING_3', NORMAL: 'NORMAL_TEXT' };
  function document(id, nieuw) {
    var d = nieuw ? null : api('GET', DOCS + '/' + q(id)), tekst = d ? docTekst(d) : '', vervang = {}, klaar = {}, alineas = [], font = '';
    function alinea(initieel) {
      var a = { tekst: initieel || '', kop: 'NORMAL_TEXT', kleur: null, font: '' };
      var stub = { setText: function (t) { a.tekst = String(t); return stub; }, setHeading: function (h) { a.kop = KOPPEN[h] || h || 'NORMAL_TEXT'; return stub; }, getText: function () { return a.tekst; },
        editAsText: function () { var e = { setForegroundColor: function (c) { a.kleur = c; return e; }, setFontFamily: function (f) { a.font = f; return e; }, setBold: function () { return e; }, setFontSize: function () { return e; } }; return e; } };
      alineas.push(a); return stub;
    }
    var eerste = nieuw ? alinea('') : null;
    var body = {
      getText: function () { return tekst; },
      appendParagraph: function (t) { return alinea(t); },
      getParagraphs: function () { return eerste ? [eerste] : []; },
      editAsText: function () { var e = { setFontFamily: function (f) { font = f; return e; }, setForegroundColor: function () { return e; }, setFontSize: function () { return e; } }; return e; },
      findText: function (patroon) {
        var letterlijk = String(patroon).replace(/\\(.)/g, '$1');
        if (klaar[letterlijk] || tekst.indexOf(letterlijk) < 0) return null;
        var proxy = { deleteText: function () { klaar[letterlijk] = true; vervang[letterlijk] = ''; return proxy; }, insertText: function (s, waarde) { vervang[letterlijk] = String(waarde); return proxy; } };
        return { getElement: function () { return { asText: function () { return proxy; } }; }, getStartOffset: function () { return 0; }, getEndOffsetInclusive: function () { return letterlijk.length - 1; } };
      }
    };
    return {
      getId: function () { return id; }, getBody: function () { return body; }, getName: function () { return d ? d.title : ''; },
      saveAndClose: function () {
        var verzoeken = Object.keys(vervang).map(function (k) { return { replaceAllText: { containsText: { text: k, matchCase: true }, replaceText: vervang[k] } }; });
        var inhoud = alineas.filter(function (a) { return a.tekst !== '' || alineas.length === 1; });
        if (inhoud.length) {
          var doc = api('GET', DOCS + '/' + q(id) + '?fields=body.content(endIndex)'), laatste = (doc.body && doc.body.content || []).reduce(function (m, el) { return Math.max(m, el.endIndex || 0); }, 2);
          var start = Math.max(1, laatste - 1), stuk = inhoud.map(function (a) { return a.tekst; }).join('\n') + '\n', pos = start;
          verzoeken.push({ insertText: { location: { index: start }, text: stuk } });
          inhoud.forEach(function (a) {
            var eind = pos + a.tekst.length + 1, bereik = { startIndex: pos, endIndex: eind };
            verzoeken.push({ updateParagraphStyle: { range: bereik, paragraphStyle: { namedStyleType: a.kop }, fields: 'namedStyleType' } });
            var stijl = {}, velden = [];
            if (kleur(a.kleur)) { stijl.foregroundColor = { color: { rgbColor: kleur(a.kleur) } }; velden.push('foregroundColor'); }
            if (a.font || font) { stijl.weightedFontFamily = { fontFamily: a.font || font }; velden.push('weightedFontFamily'); }
            if (velden.length && a.tekst.length) verzoeken.push({ updateTextStyle: { range: { startIndex: pos, endIndex: eind - 1 }, textStyle: stijl, fields: velden.join(',') } });
            pos = eind;
          });
        }
        if (verzoeken.length) api('POST', DOCS + '/' + q(id) + ':batchUpdate', { requests: verzoeken });
      }
    };
  }
  var DocumentApp = {
    openById: function (id) { return document(id, false); },
    create: function (naam) { var d = api('POST', DOCS, { title: naam }); return document(d.documentId, true); },
    ParagraphHeading: KOPPEN
  };

  /* ----- Andere spreadsheets (XPS-export in Google Sheets, documenttekst, het antwoordblad van het Google Form) ----- */
  function a1Kolom(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  // v6.2: een datum-tijd uit de Sheets-API als serieel getal (dagen sinds 30-12-1899, als wandkloktijd) naar een Date, zoals getValues() in Apps Script hem geeft
  function serieelNaarDatum(n) { var dagen = Math.floor(n), ms = Math.round((n - dagen) * 86400000), u = new Date(Date.UTC(1899, 11, 30) + dagen * 86400000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), 0, 0, 0, ms); }
  // metTijdstempel: de kolom(men) Tijdstempel/Timestamp komen als Date terug (het Google Form), zodat Code.gs ze leest zoals in Apps Script;
  // andere bladen (XPS-export) houden de getoonde tekst voor datums, zoals voorheen
  function remoteBlad(ssId, titel, metTijdstempel) {
    var waarden = null;
    function W() {
      if (!waarden) {
        var d = api('GET', SHEETS + q(ssId) + '/values/' + q("'" + titel.replace(/'/g, "''") + "'") + '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=' + (metTijdstempel ? 'SERIAL_NUMBER' : 'FORMATTED_STRING')); waarden = d.values || [];
        if (metTijdstempel && waarden.length) {
          var kolommen = []; waarden[0].forEach(function (k, i) { if (/tijdstempel|timestamp/i.test(String(k))) kolommen.push(i); });
          for (var r = 1; r < waarden.length; r++) kolommen.forEach(function (c) { if (typeof waarden[r][c] === 'number') waarden[r][c] = serieelNaarDatum(waarden[r][c]); });
        }
      }
      return waarden;
    }
    var b = {
      getName: function () { return titel; }, getLastRow: function () { return W().length; }, getLastColumn: function () { return W().reduce(function (m, r) { return Math.max(m, r.length); }, 0); },
      getDataRange: function () { return b.getRange(1, 1, W().length, b.getLastColumn()); },
      getRange: function (r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        return {
          getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var rij = W()[r - 1 + i] || [], x = []; for (var j = 0; j < nc; j++) x.push(rij[c - 1 + j] === undefined ? '' : rij[c - 1 + j]); o.push(x); } return o; },
          setValue: function (v) { var cel = "'" + titel.replace(/'/g, "''") + "'!" + a1Kolom(c) + r; api('PUT', SHEETS + q(ssId) + '/values/' + q(cel) + '?valueInputOption=RAW', { range: cel, values: [[v]] }); if (waarden) { waarden[r - 1] = waarden[r - 1] || []; waarden[r - 1][c - 1] = v; } return this; },
          setValues: function (vs) { var bereik = "'" + titel.replace(/'/g, "''") + "'!" + a1Kolom(c) + r + ':' + a1Kolom(c + nc - 1) + (r + nr - 1); api('PUT', SHEETS + q(ssId) + '/values/' + q(bereik) + '?valueInputOption=RAW', { range: bereik, values: vs }); waarden = null; return this; }
        };
      }
    };
    return b;
  }
  function spreadsheet(id) {
    var titels = null;
    function T() { if (!titels) { var d = api('GET', SHEETS + q(id) + '?fields=properties.title,sheets.properties.title'); titels = (d.sheets || []).map(function (s) { return s.properties.title; }); } return titels; }
    return { getId: function () { return id; }, getName: function () { return api('GET', SHEETS + q(id) + '?fields=properties.title').properties.title; }, getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; },
      getSheets: function () { return T().map(function (t) { return remoteBlad(id, t); }); }, getSheetByName: function (n) { return T().indexOf(n) >= 0 ? remoteBlad(id, n) : null; }, getSheetNames: T };
  }
  // Het Google Form schrijft in de oude Sheet (FORM_SHEET_ID); die antwoordbladen doen mee alsof ze in de database staan
  var formBladen = null;
  function formulierBladen() {
    if (!env.FORM_SHEET_ID) return [];
    if (!formBladen) { try { formBladen = spreadsheet(env.FORM_SHEET_ID).getSheetNames().filter(function (t) { return /^(Formulierreacties|Form Responses)/i.test(t); }).map(function (t) { return remoteBlad(env.FORM_SHEET_ID, t, true); }); } catch (e) { log('Formulierblad: ' + e.message); formBladen = []; } }  // v6.2: met de tijdstempel als Date
    return formBladen;
  }

  return { MailApp: MailApp, GmailApp: GmailApp, CalendarApp: CalendarApp, DriveApp: DriveApp, Drive: Drive, DocumentApp: DocumentApp, spreadsheet: spreadsheet, formulierBladen: formulierBladen,
    formulierBlad: function (n) { return formulierBladen().filter(function (b) { return b.getName() === n; })[0] || null; }, gekoppeld: gekoppeld, flush: function () {} };
}

module.exports = { maak: maak, _token: TOKEN, serieelNaarDatum: function (n) { var dagen = Math.floor(n), ms = Math.round((n - dagen) * 86400000), u = new Date(Date.UTC(1899, 11, 30) + dagen * 86400000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), 0, 0, 0, ms); } };
