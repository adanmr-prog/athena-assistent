// Athena Assistent — v6.0: de API op Vercel (POST /api zoals doPost in Code.gs; GET /api = status). Zie server/handler.js.
process.env.TZ = 'Europe/Amsterdam';
var handler = require('../server/handler.js'), vercel = require('../server/vercel.js');
module.exports = vercel.functie(handler.verwerk, '/api');
module.exports.config = { api: { bodyParser: false } };
