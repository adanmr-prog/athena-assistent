// Athena Assistent — v6.0: GET /api/config → inlogconfiguratie (Supabase Auth met Google) voor index.html. Zie server/handler.js.
process.env.TZ = 'Europe/Amsterdam';
var handler = require('../server/handler.js'), vercel = require('../server/vercel.js');
module.exports = vercel.functie(handler.verwerk, '/api/config');
