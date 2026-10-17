// v6.2 (go-live-review): kindproces van fouten_test.js. Eén proces = één worker met één databaseverbinding, zoals één Vercel-instantie.
// SCENARIO=voorbereiding | schrijf | home | afspraak; parameters via de omgeving. Drukt één regel JSON af.
'use strict';
process.env.ATHENA_GOOGLE_NEP = process.env.ATHENA_GOOGLE_NEP || '1'; process.env.EIGENAAR_EMAIL = 'sophie@athena.example';
process.env.GOOGLE_CLIENT_ID = 'nep'; process.env.GOOGLE_CLIENT_SECRET = 'nep'; process.env.GOOGLE_REFRESH_TOKEN = 'nep'; process.env.APP_API_URL = 'https://athena.example/api';
delete process.env.ATHENA_DB;  // altijd de echte Postgres uit DATABASE_URL
var brug = require('../sync.js'), fetches = [];
var fetchOud = brug.fetch; brug.fetch = function (url, o) { fetches.push(((o && o.methode) || 'GET').toUpperCase() + ' ' + String(url).replace(/\?.*$/, '')); return fetchOud(url, o); };
function uit(o) { process.stdout.write(JSON.stringify(o) + '\n'); try { brug.stop(); } catch (e) {} process.exit(0); }
(async function () {
  var scenario = process.env.SCENARIO || 'schrijf', begin = Date.now();
  try {
    if (scenario === 'voorbereiding') { var migratie = require('../migratie.js'); var st = migratie.importeer(migratie.exportUitDemo()); return uit({ ok: true, tabellen: Object.keys(st.tabellen).length }); }
    var handler = require('../handler.js');
    var body;
    if (scenario === 'schrijf') { body = { fn: 'apiTaakOpslaan', args: [Object.assign({ id: process.env.ID || 'tk1', tekst: process.env.TEKST || 'x' }, process.env.OUD ? { _oud: { tekst: process.env.OUD } } : {})], secret: 'demo-sophie' }; }
    else if (scenario === 'home') body = { fn: 'apiHome', args: [], secret: 'demo-sophie' };
    else if (scenario === 'afspraak') body = { fn: 'apiAfspraakPlannen', args: [{ titel: 'Foutentest', start: '2026-11-05T10:00', duurMin: 30, schoolId: 's1' }], secret: 'demo-femke' };
    else return uit({ ok: false, fout: 'onbekend scenario ' + scenario });
    var r = await handler.verwerk({ methode: 'POST', pad: '/api', headers: {}, body: JSON.stringify(body) }), d;
    try { d = JSON.parse(r.body); } catch (e) { d = { ok: false, fout: 'geen JSON: ' + String(r.body).slice(0, 80) }; }
    uit({ status: r.status, ok: !!d.ok, fout: d.fout || '', result: d.ok ? d.result : null, ms: Date.now() - begin, fetches: fetches });
  } catch (e2) { uit({ ok: false, fout: 'onverwacht: ' + ((e2 && e2.message) || e2), ms: Date.now() - begin, fetches: fetches }); }
})();
