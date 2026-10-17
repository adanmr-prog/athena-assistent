// v6.2 (go-live-review): fouten en gelijktijdigheid tegen een echte PostgreSQL (meerdere verbindingen), niet pglite.
// Gebruik: DATABASE_URL_TEST='postgres://gebruiker:wachtwoord@127.0.0.1:5432/athena_test' node server/test/fouten_test.js
// Zonder DATABASE_URL_TEST slaat de test over (exitcode 0). De database wordt leeggemaakt (schema public) en met de demogegevens gevuld.
// Elke situatie draait in een eigen kindproces (fouten_kind.js): één worker, één verbinding, zoals één Vercel-instantie.
//  1. lock bezet door een andere verbinding → de schrijf-api meldt na 15 s dat Athena bezig is; daarna lukt het weer
//  2. vijf gelijktijdige schrijvers op dezelfde rij met _oud → precies één wint, vier krijgen de conflictmelding; zonder _oud lukken alle vijf na elkaar
//  3. Postgres onbereikbaar → HTTP 500 met een JSON-fout (de app toont een toast via leesAntwoord)
//  4. Google 429 en 500 → apiHome voor de eigenaar: antwoord of fout (gemeten en vastgelegd)
//  5. flush faalt nadat de afspraak al in de agenda staat → "Opslaan in de database mislukt" terwijl de agenda-aanroep wel is gedaan
'use strict';
var path = require('path'), cp = require('child_process');
var URL_TEST = process.env.DATABASE_URL_TEST;
if (!URL_TEST) { console.log('fouten_test: overgeslagen (zet DATABASE_URL_TEST naar een lege PostgreSQL-testdatabase)'); process.exit(0); }
var pg = require('pg'), fouten = 0;
function eis(ok, wat) { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; }
function kind(scenario, extra, url) {
  return new Promise(function (klaar) {
    var env = Object.assign({}, process.env, { DATABASE_URL: url || URL_TEST, SCENARIO: scenario }, extra || {});
    cp.execFile(process.execPath, [path.join(__dirname, 'fouten_kind.js')], { env: env, timeout: 120000, maxBuffer: 8 * 1024 * 1024 }, function (err, stdout, stderr) {
      var regel = String(stdout || '').trim().split('\n').pop(), d;
      try { d = JSON.parse(regel); } catch (e) { d = { ok: false, fout: 'geen uitvoer: ' + String(stderr || err || '').slice(0, 300) }; }
      klaar(d);
    });
  });
}

(async function () {
  var db = new pg.Client({ connectionString: URL_TEST }); await db.connect();
  await db.query('drop schema public cascade; create schema public;');
  var v = await kind('voorbereiding'); eis(v.ok && v.tabellen >= 20, 'demogegevens staan in PostgreSQL (' + v.tabellen + ' tabellen)');
  var origineel = (await db.query("select tekst from acties where id = 'tk1'")).rows[0].tekst;

  /* 0. vijf koude starts tegelijk (zoals de app bij het openen meerdere api's tegelijk vraagt en Vercel meerdere instanties start) */
  var koud = await Promise.all([1, 2, 3, 4, 5].map(function () { return kind('home'); }));
  eis(koud.every(function (r) { return r.ok; }), 'vijf nieuwe instanties tegelijk: alle vijf antwoorden (schema-controle zonder DDL of onder de schema-lock)' + (koud.every(function (r) { return r.ok; }) ? '' : ' — ' + koud.map(function (r) { return r.ok ? 'ok' : r.fout; }).join(' | ')));
  await db.query('drop index if exists "ix_acties_status"');  // een ontbrekend onderdeel: de eerste instantie herstelt het, de rest wacht op de schema-lock
  var koud2 = await Promise.all([1, 2, 3, 4, 5].map(function () { return kind('home'); }));
  eis(koud2.every(function (r) { return r.ok; }) && Number((await db.query("select count(*)::int as n from pg_indexes where indexname = 'ix_acties_status'")).rows[0].n) === 1, 'vijf koude starts terwijl er iets aan het schema ontbreekt: geen deadlock, het ontbrekende onderdeel staat er weer' + (koud2.every(function (r) { return r.ok; }) ? '' : ' — ' + koud2.map(function (r) { return r.ok ? 'ok' : r.fout; }).join(' | ')));

  /* 1. lock bezet */
  var slot = new pg.Client({ connectionString: URL_TEST }); await slot.connect(); await slot.query('select pg_advisory_lock(7310)');
  var l1 = await kind('schrijf', { TEKST: 'Tijdens lock', OUD: origineel });
  eis(!l1.ok && /bezig/i.test(l1.fout) && l1.ms >= 14000 && l1.ms < 40000, 'met de lock bij een andere verbinding meldt de server na ~15 s dat Athena bezig is (' + l1.ms + ' ms): ' + l1.fout);
  await slot.query('select pg_advisory_unlock(7310)'); await slot.end();
  var l2 = await kind('schrijf', { TEKST: 'Na lock', OUD: origineel });
  eis(l2.ok && (await db.query("select tekst from acties where id = 'tk1'")).rows[0].tekst === 'Na lock', 'zodra de lock vrij is lukt dezelfde bewerking (en staat in de database)');

  /* 2. vijf gelijktijdige schrijvers */
  var namen = ['A', 'B', 'C', 'D', 'E'], met = await Promise.all(namen.map(function (n) { return kind('schrijf', { TEKST: 'Schrijver ' + n, OUD: 'Na lock' }); }));
  var gelukt = met.filter(function (r) { return r.ok; }), conflict = met.filter(function (r) { return !r.ok && /gewijzigd/i.test(r.fout); });
  var staat = (await db.query("select tekst from acties where id = 'tk1'")).rows[0].tekst, aantal = Number((await db.query("select count(*)::int as n from acties")).rows[0].n);
  eis(gelukt.length === 1 && conflict.length === 4 && staat === gelukt[0].result.tekst, 'vijf schrijvers met _oud op dezelfde rij: één wint (' + staat + '), vier krijgen de conflictmelding' + (met.some(function (r) { return !r.ok && !/gewijzigd/i.test(r.fout); }) ? ' — andere fouten: ' + met.filter(function (r) { return !r.ok && !/gewijzigd/i.test(r.fout); }).map(function (r) { return r.fout; }).join(' | ') : ''));
  var zonder = await Promise.all(namen.map(function (n) { return kind('schrijf', { TEKST: 'Vrij ' + n }); }));
  var staat2 = (await db.query("select tekst from acties where id = 'tk1'")).rows[0].tekst, aantal2 = Number((await db.query("select count(*)::int as n from acties")).rows[0].n);
  eis(zonder.every(function (r) { return r.ok; }) && /^Vrij [A-E]$/.test(staat2) && aantal2 === aantal, 'vijf schrijvers zonder _oud: alle vijf lukken na elkaar (lock), de laatste staat, geen dubbele rijen (' + Math.max.apply(null, zonder.map(function (r) { return r.ms; })) + ' ms de traagste)' + (zonder.every(function (r) { return r.ok; }) && /^Vrij [A-E]$/.test(staat2) && aantal2 === aantal ? '' : ' — uitkomsten: ' + zonder.map(function (r) { return r.ok ? 'ok' : r.fout; }).join(' | ') + '; staat: ' + staat2 + '; rijen ' + aantal + ' → ' + aantal2));
  eis(Number((await db.query("select count(*)::int as n from pg_locks where locktype = 'advisory'")).rows[0].n) === 0, 'na afloop houdt niemand de lock vast');

  /* 3. Postgres onbereikbaar */
  var weg = await kind('home', {}, 'postgres://postgres:x@127.0.0.1:1/weg');
  eis(weg.status === 503 && !weg.ok && /niet bereikbaar/.test(weg.fout), 'Postgres onbereikbaar: HTTP 503 met een leesbare JSON-fout voor de app (' + String(weg.fout).slice(0, 70) + ')');

  /* 4. Google 429 en 500 (de eigenaar ziet mails en agenda) */
  var g429 = await kind('home', { ATHENA_GOOGLE_NEP_FOUT: '429' }), g500 = await kind('home', { ATHENA_GOOGLE_NEP_FOUT: '500' }), gOk = await kind('home');
  eis(gOk.ok, 'apiHome werkt met Google nagebootst');
  console.log('     Google 429 → ' + (g429.ok ? 'apiHome antwoordt (mails: ' + JSON.stringify(g429.result.mails).slice(0, 40) + ')' : 'apiHome faalt: ' + g429.fout));
  console.log('     Google 500 → ' + (g500.ok ? 'apiHome antwoordt' : 'apiHome faalt: ' + g500.fout));
  eis((g429.ok || /Google 429/.test(g429.fout)) && (g500.ok || /Google 500/.test(g500.fout)), 'een Google-fout geeft een duidelijk antwoord (geen vastloper): zie de regels hierboven');

  /* 5. flush faalt na een verzonden agenda-aanroep */
  await db.query("create or replace function athena_nepfout() returns trigger language plpgsql as $$ begin raise exception 'nep: schrijven mislukt'; end $$; create trigger t_nepfout before insert on activiteiten for each row execute function athena_nepfout();");
  var f = await kind('afspraak');
  await db.query('drop trigger t_nepfout on activiteiten; drop function athena_nepfout();');
  var agendaPost = f.fetches.filter(function (x) { return /^POST .*calendar.*events/.test(x); }).length;
  eis(!f.ok && /Opslaan in de database mislukt/.test(f.fout) && agendaPost === 1, 'als de database na de agenda-aanroep faalt: de app krijgt "Opslaan in de database mislukt" terwijl de afspraak al in de agenda staat (' + agendaPost + ' POST naar de agenda) — net als op Apps Script niet atomair');
  var fOk = await kind('afspraak'); eis(fOk.ok && fOk.fetches.some(function (x) { return /^POST .*calendar/.test(x); }), 'zonder de storing lukt dezelfde afspraak');

  await db.end();
  console.log(fouten ? fouten + ' FOUT(EN)' : 'ALLES GOED');
  process.exit(fouten ? 1 : 0);
})().catch(function (e) { console.error('FOUT (onverwacht): ' + (e && e.stack || e)); process.exit(1); });
