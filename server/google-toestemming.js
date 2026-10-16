/* Athena Assistent — v6.0: eenmalig een Google refresh-token ophalen voor de server (Gmail, Agenda, Drive, Docs, Sheets van de eigenaar).
 * Gebruik, lokaal op je eigen computer:
 *   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node server/google-toestemming.js
 * Het script opent een inlogadres (kopieer het naar de browser, log in met het werkaccount van de eigenaar, geef toestemming),
 * vangt de terugkeer op http://localhost:53682/ op en drukt het refresh-token af. Zet dat als GOOGLE_REFRESH_TOKEN in Vercel.
 * De OAuth-client (type "Web application") moet http://localhost:53682/ als redirect-URI hebben (Google Cloud → Credentials). */
'use strict';
var http = require('http');
var ID = process.env.GOOGLE_CLIENT_ID, GEHEIM = process.env.GOOGLE_CLIENT_SECRET, POORT = Number(process.env.POORT) || 53682, TERUG = 'http://localhost:' + POORT + '/';
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/spreadsheets'];
if (!ID || !GEHEIM) { console.error('Zet GOOGLE_CLIENT_ID en GOOGLE_CLIENT_SECRET (OAuth-client van het type Web application, redirect-URI ' + TERUG + ').'); process.exit(2); }
var url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(ID) + '&redirect_uri=' + encodeURIComponent(TERUG) + '&response_type=code&access_type=offline&prompt=consent&scope=' + encodeURIComponent(SCOPES.join(' '));
var server = http.createServer(async function (req, res) {
  var u = new URL(req.url, TERUG), code = u.searchParams.get('code');
  if (!code) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Geen code in de terugkeer: ' + (u.searchParams.get('error') || '')); return; }
  try {
    var r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'code=' + encodeURIComponent(code) + '&client_id=' + encodeURIComponent(ID) + '&client_secret=' + encodeURIComponent(GEHEIM) + '&redirect_uri=' + encodeURIComponent(TERUG) + '&grant_type=authorization_code' });
    var d = await r.json();
    if (!d.refresh_token) throw new Error('Geen refresh_token in het antwoord (' + JSON.stringify(d).slice(0, 200) + '). Trek de toestemming in op myaccount.google.com/permissions en probeer opnieuw.');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Gelukt. Het refresh-token staat in de terminal; je kunt dit venster sluiten.');
    console.log('\nGOOGLE_REFRESH_TOKEN=' + d.refresh_token + '\n\nZet deze waarde (en GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, EIGENAAR_EMAIL) in de omgeving van het Vercel-project.');
  } catch (e) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Mislukt: ' + e.message); console.error(e.message); }
  setTimeout(function () { server.close(); process.exit(0); }, 500);
});
server.listen(POORT, function () { console.log('Open dit adres in de browser en log in met het werkaccount van de eigenaar:\n\n' + url + '\n\nIk wacht op ' + TERUG + ' …'); });
