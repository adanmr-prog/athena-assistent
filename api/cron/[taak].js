// Athena Assistent — v6.0: GET /api/cron/<taak> → draait een trigger uit Code.gs (nachtelijke review, index, sync, talentrun, …).
// Vercel roept dit aan volgens vercel.json met Authorization: Bearer <CRON_SECRET>. Zie server/handler.js en server/README.md.
process.env.TZ = 'Europe/Amsterdam';
var handler = require('../../server/handler.js'), vercel = require('../../server/vercel.js');
module.exports = vercel.functie(handler.verwerk, function (req) { return '/api/cron/' + String((req.query && req.query.taak) || ''); });
