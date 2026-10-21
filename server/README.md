# Athena Assistent op Vercel + Supabase (v6.0)

Vanaf v6.0 kan de app draaien op een eigen domein met Postgres als database, in plaats van GitHub Pages met een Google Sheet.
De logica verandert niet: `backend/Code.gs` draait ongewijzigd in Node op Vercel (zoals de demo hem in een iframe draait), met een
adapter die de Apps Script-diensten nabootst. Dit document is de installatie voor Menno; de techniek staat onderaan.

| Onderdeel | Was (v5.x) | Wordt (v6.0) |
|---|---|---|
| App | `index.html` op GitHub Pages | dezelfde `index.html` op Vercel, eigen domein (bijv. `crm.athenaschool.nl`) |
| Inloggen | koppelcode per gebruiker | Google-login via Supabase Auth; alleen e-mailadressen uit Beheer → Gebruikers (en de eigenaar) komen binnen. De koppelcode blijft werken zolang de oude backend draait |
| Database | Google Sheet | Supabase Postgres (EU); één tabel per tabblad, zie `supabase/migrations/0001_init.sql` |
| API | Apps Script `doPost` | `POST /api` op Vercel: dezelfde `Code.gs`, dezelfde `{fn, args}` → `{ok, result}` |
| Triggers | Apps Script-triggers | Vercel Cron → `GET /api/cron/<trigger>` |
| Gmail, Agenda, Drive, Docs | als de eigenaar | nog steeds als de eigenaar, via de Google-API's met één refresh-token (per gebruiker komt later) |
| Documenten, offertes, VOG-scans | Drive | blijft Drive (zelfde mappen) |
| Claude, PDOK | `UrlFetchApp` | gewone `fetch`; de sleutel staat in de omgeving van Vercel |

## Installatie (±1 uur, eenmalig)

### 1. Supabase-project
1. Maak op https://supabase.com een project aan in een EU-regio (bijv. Frankfurt). Kies een sterk databasewachtwoord en bewaar het.
2. **Schema:** SQL Editor → plak de inhoud van `supabase/migrations/0001_init.sql` → Run. (De server maakt ontbrekende tabellen en kolommen later ook zelf aan; dit script zet meteen de indexen en Row Level Security.)
3. Noteer bij **Settings → API**: de Project URL (`https://<ref>.supabase.co`), de **anon key** en het **JWT secret** (Settings → API → JWT Settings; gebruikt het project de nieuwe "JWT signing keys", laat `SUPABASE_JWT_SECRET` dan leeg: de server controleert tokens dan via de publieke sleutels).
4. Noteer bij **Settings → Database → Connection string** de **Session pooler** (poort 5432, gebruiker `postgres.<ref>@aws-0-<regio>.pooler.supabase.com`). Niet de transaction pooler (6543): die kent geen advisory locks, en daar leunt `metLock` op. De directe verbinding (`db.<ref>.supabase.co`) is alleen via IPv6 bereikbaar en werkt vanaf Vercel meestal niet.
5. **Inloggen met Google:** Authentication → Providers → Google → aan, met de Client ID en het Client secret uit stap 2. Authentication → URL Configuration: Site URL = het adres van de app (bijv. `https://crm.athenaschool.nl`), en zet hetzelfde adres (met `/`) bij Redirect URLs; de app keert altijd op dat adres terug, ook als iemand `…/index.html` had geopend. Tijdens het proberen mag het Vercel-adres (`https://<project>.vercel.app/`) erbij.

### 2. Google Cloud: één OAuth-client
1. Open https://console.cloud.google.com, maak (of kies) een project en zet deze API's aan: Gmail API, Google Calendar API, Google Drive API, Google Docs API, Google Sheets API.
2. OAuth consent screen: type **Internal** (alleen het eigen Workspace-domein), app-naam "Athena Assistent".
3. Credentials → Create credentials → **OAuth client ID**, type Web application. Authorized redirect URIs:
   - `https://<ref>.supabase.co/auth/v1/callback` (voor het inloggen van gebruikers);
   - `http://localhost:53682/` (eenmalig, voor het refresh-token van de eigenaar).
4. **Refresh-token van de eigenaar** (Gmail, Agenda, Drive): op je eigen computer, in een kopie van deze repo:
   ```
   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node server/google-toestemming.js
   ```
   Open het adres dat verschijnt, log in met het werkaccount van de eigenaar (`menno.adan@athenastudies.nl`), geef toestemming; het script drukt `GOOGLE_REFRESH_TOKEN=…` af. Dat token geeft de server dezelfde toegang als Apps Script nu heeft; bewaar het alleen in Vercel.

### 3. Vercel-project
1. https://vercel.com → Add New → Project → importeer `adanmr-prog/athena-assistent`. Framework preset **Other**, geen build command, Output Directory leeg (de repo-root is de site), Node 22.
2. **Environment variables** (Settings → Environment Variables, voor Production en Preview):

   | Variabele | Waarde |
   |---|---|
   | `DATABASE_URL` | de connection string uit stap 1.4 (poort 5432, met het databasewachtwoord) |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_ANON_KEY` | de anon key |
   | `SUPABASE_JWT_SECRET` | het JWT secret (of leeg bij signing keys) |
   | `EIGENAAR_EMAIL` | `menno.adan@athenastudies.nl`: wie hiermee inlogt is de beheerder; dit is ook het account van Gmail en Agenda |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | uit stap 2 |
   | `ATHENA_ANTHROPIC_API_KEY` | de Claude-sleutel (elke scripteigenschap van Apps Script kan zo als `ATHENA_<NAAM>` in de omgeving; de omgeving gaat voor op de database) |
   | `CRON_SECRET` | een willekeurige tekst van minstens 16 tekens; Vercel stuurt hem mee met elke cron-aanroep |
   | `APP_API_URL` | `https://<domein>/api` (komt in de portaallinks in mails aan talenten) |
   | `ATHENA_APP_URL` | `https://<domein>/` (de link in de dagstart- en herinneringsmails) |
   | `TZ` | `Europe/Amsterdam` |
   | `FORM_SHEET_ID` | optioneel: het id van de oude Google Sheet waarin het Google Form zijn antwoorden schrijft; de server leest nieuwe aanmeldingen daaruit zolang het formulier daar staat |
   | `ATHENA_CORS_ORIGIN` | optioneel (v6.2): alleen zetten als de app ooit op een ander domein dan de API komt; zonder stuurt de server geen CORS-header |
   | `ATHENA_RAPPORT_EMAIL`, `ATHENA_NAAM`, `ATHENA_CLAUDE_MODEL`, … | optioneel, zoals de scripteigenschappen |

3. Deploy. Controleer `https://<project>.vercel.app/api` (geeft `{ok:true, versie:"6.0"}`) en `https://<project>.vercel.app/api/config` (geeft de inlogconfiguratie).
4. **Domein:** Settings → Domains → `crm.athenaschool.nl` (CNAME naar `cname.vercel-dns.com`). Pas daarna de Site URL en Redirect URLs in Supabase (1.5) en `APP_API_URL`/`ATHENA_APP_URL` aan.
5. **Cron:** `vercel.json` plant de dagelijkse taken (index 04:00, dagstart 05:00, archief 1e van de maand, talentrun 06:30, XPS-uren maandag 06:00, prognose bevriezen 1e van de maand 02:15 (v6.5); tijden staan in UTC, dus een uur eerder in de winter en twee uur eerder in de zomer dan de Apps Script-tijden; pas ze aan als dat uitmaakt). De uurlijkse mail- en agendasync (`crmSyncTrigger`) en de herinneringsmail elk kwartier (`herinneringTrigger`) vragen het Pro-plan van Vercel: voeg dan toe aan `vercel.json`:
   ```json
   { "path": "/api/cron/crmSyncTrigger", "schedule": "0 * * * *" },
   { "path": "/api/cron/herinneringTrigger", "schedule": "*/15 * * * *" }
   ```
   Zonder Pro kun je een externe planner (bijv. cron-job.org) `GET https://<domein>/api/cron/herinneringTrigger` laten aanroepen met de header `Authorization: Bearer <CRON_SECRET>`.
6. Functieduur: `vercel.json` vraagt 300 seconden (het inlezen van documenten en de talentrun werken met een budget van 4 minuten). Volgens de Vercel-documentatie (augustus 2026) is 300 s op Hobby het standaard- en het maximum, op Pro tot 800 s.
7. **Regio en beveiliging (v6.2):** `vercel.json` zet `regions: ["fra1"]` (Frankfurt, naast de Supabase-regio `eu-central-1`); zonder die regel draait de functie in Washington en kost elke query ±90 ms, zestien keer per Home-scherm. Dezelfde file stuurt een Content-Security-Policy mee (niet op `?demo=1`). De server geeft een 429 na 20 mislukte inlogpogingen per IP per 10 minuten, een 503 met een leesbare melding bij een databasestoring, en accepteert alleen Supabase-tokens met `aud authenticated` en de issuer van het project. Uploads van documenten zijn op de server 3 MB (Vercel neemt 4,5 MB per verzoek; de app toont die grens via `api/config`).
8. **Plan van Supabase:** het Free-plan pauzeert een project na een week zonder verkeer en maakt geen back-ups; Pro ($25 per maand) doet dagelijkse back-ups (7 dagen) en pauzeert niet. Kies vóór de parallelle week, of regel een eigen dagelijkse `pg_dump` (zie 5.5).

### 4. Gegevens overzetten (herhaalbaar)
Op je eigen computer, met de repo en `npm install` gedaan:
```
DATABASE_URL='postgres://…' node server/migratie.js --bron https://script.google.com/macros/s/…/exec --code <koppelcode van de beheerder> --bewaar export.json
```
`export.json` bevat alle gegevens uit de Sheet, ook de talentprofielen. Hij staat in `.gitignore`; bewaar hem niet in een gedeelde map en verwijder hem na de controle.
Het script leest elk tabblad via `apiExportAlles` (nieuw in Code.gs 6.0: plak en implementeer Code.gs dus eerst als nieuwe versie), schrijft alles in Postgres (upsert op `id`: opnieuw draaien is veilig) en drukt per tabel de aantallen in de bron en in de database af. De scripteigenschappen gaan mee behalve `ANTHROPIC_API_KEY` en `CAPSULE_TOKEN`; koppelcodes (`SECRET`, `CODES`) blijven dus werken op de nieuwe server.
Open daarna `https://<domein>/`, log in met Google en controleer Home, Contacten, Projecten en Talent tegen de Sheet.

### 5. Parallel draaien en overstappen
1. **Een week parallel.** Collega's blijven op GitHub Pages met Apps Script werken; het management probeert het nieuwe adres. Alles wat op de nieuwe server verandert, staat niet in de Sheet (en andersom): de Sheet is leidend tot de overstap. Draai de migratie elke dag opnieuw (`--bron …`), dan loopt de nieuwe database bij.
2. **Overstap.** Kondig een moment aan. Draai de migratie een laatste keer. Zet in Apps Script de triggers uit (Triggers → verwijderen), zodat de dagstart en herinneringen niet dubbel komen. Stuur iedereen het nieuwe adres: inloggen met Google, geen koppelcode meer. Laat de Sheet staan als back-up (alleen lezen).
3. **Google Form.** Het aanmeldformulier schrijft in de oude Sheet; met `FORM_SHEET_ID` leest de server die antwoorden elk uur in (zoals Apps Script deed). Later kan het formulier een eigen pagina op het domein worden.
4. **GitHub Pages** kan daarna uit, of blijven staan voor de demo (`?demo=1`).
5. **Go-live-criteria.** `docs/go-live-review-v6.md` bevat de review van de stack (17-10-2026) met de controles die je zelf op de echte omgeving draait, elk met de verwachte uitvoer: de golden master tegen Apps Script (`node server/vergelijk.js --bron … --code … --server …`), checksums na twee migratieruns en na een restore (`node server/checksums.js`), antwoordtijden vanaf `fra1` en `iad1` (`node server/meet.js`), de anon-sleutel tegen PostgREST (moet `[]` geven), de cron, een ZAP-baseline en de houdbaarheid van het Google-token. Pas overstappen als alle criteria daar waar zijn.
   Dagelijkse back-up zonder Pro, als GitHub Action (secrets `DATABASE_URL` en een privé-opslag naar keuze):
   ```yaml
   name: backup
   on: { schedule: [{ cron: '15 1 * * *' }], workflow_dispatch: {} }
   jobs:
     dump:
       runs-on: ubuntu-latest
       steps:
         - run: sudo apt-get install -y postgresql-client
         - run: pg_dump "${{ secrets.DATABASE_URL }}" --no-owner --no-privileges -Fc -f athena-$(date +%F).dump
         - run: echo "upload athena-*.dump naar een privé-bucket (bijv. met rclone of de aws-cli); nooit als artifact van een publieke repo"
   ```

## Lokaal draaien
```
npm install
node server/test/server_test.js                        # alle servertests, tegen Postgres-in-WASM (pglite): ALLES GOED
ATHENA_DB=pglite:server/.pglite node server/migratie.js --demo                        # demogegevens in een lokale database
ATHENA_DB=pglite:server/.pglite EIGENAAR_EMAIL=sophie@athena.example node server/lokaal.js   # http://localhost:3000, koppelcode demo-sophie
```
`ATHENA_GOOGLE_NEP=1` laat de server Google, PDOK en Claude met vaste antwoorden beantwoorden (tests, zonder netwerk); `ATHENA_GOOGLE_NEP_FOUT=429` laat elke Google-aanroep met die status falen.

Review- en controlescripts (v6.2, zie `docs/go-live-review-v6.md`):
```
node server/dekking.js [--demo]                        # welke Apps Script-aanroepen uit Code.gs de adapter dekt (AST); exitcode 1 bij een gat
node server/vergelijk.js [--profiel] [--dekking]       # golden master: demo-backend tegen de adapter met dezelfde seed; --profiel telt queries per api
node server/vergelijk.js --bron <exec> --code <code> --server https://<domein> [--codes am=…,talent=…]   # Apps Script tegen de server
node server/test/security_test.js                      # JWT-negatieftests, koppelcode raden (429), CORS: ALLES GOED
DATABASE_URL_TEST='postgres://…' node server/test/fouten_test.js   # lock, vijf schrijvers, koude starts, databasestoring, Google-fouten (echte PostgreSQL)
DATABASE_URL='…' node server/checksums.js              # vingerafdruk per tabel (vergelijk twee runs met diff)
node server/meet.js --server https://<domein> --code <code>   # p50/p95 per api zoals de app ze ziet
```
De browsertests sturen met `MOCK_CSP=1` de Content-Security-Policy uit `vercel.json` mee (`test/test_inlog.py` doet dat altijd; start de mock voor `test/test_app.py` met `MOCK_CSP=1`).

## Hoe het werkt
- `api/index.js`, `api/config.js`, `api/cron/[taak].js`: de Vercel-functies; dunne schil om `server/handler.js`.
- `server/handler.js`: routes, het controleren van het Supabase-token (`jose`; HS256 met het JWT secret of de JWKS van het project; alleen `aud authenticated` en de issuer `<SUPABASE_URL>/auth/v1`), de aanroep van `doPost` en daarna `flush()`. Met een geldig token gaat het e-mailadres als `SERVER_LOGIN` naar Code.gs; `wieIs()` zoekt de gebruiker dan via `gebruikerVanEmail` (de eigenaar via `EIGENAAR_EMAIL`, anderen in `Gebruikers`). Een onbekend adres geeft `fout: 'secret'`, en de app toont het inlogscherm. v6.2: mislukte inlogpogingen worden per IP geteld in de cachetabel (20 per 10 minuten, daarna 429); een databasestoring geeft 503 met een leesbare melding; `api/config` noemt `maxBestand`.
- `server/code.js`: compileert `backend/Code.gs` één keer als functie met de dienstnamen als parameters en maakt per verzoek een vers exemplaar (eigen `GEBRUIKER`, eigen caches). Binnen Code.gs wijst `globalThis` naar de functies van Code.gs, zodat `doPost` zijn `globalThis[fn]` kan blijven doen.
- `server/apps-script.js`: de nagebootste diensten. `SpreadsheetApp` laadt een tabblad bij het eerste gebruik uit Postgres (als rijen onder de kop uit `TABELLEN`) en `flush()` schrijft per tabel alleen gewijzigde, nieuwe en verwijderde rijen weg (op `id`, in één transactie). `PropertiesService` → tabel `eigenschappen` (omgeving `ATHENA_<NAAM>` gaat voor; `ATHENA_DB`, `ATHENA_GOOGLE_NEP` en `ATHENA_LOG` zijn van de server zelf), `CacheService` → tabel `cache`, `LockService` → advisory lock in Postgres die pas na `flush()` vrijkomt (zo staan de wijzigingen in de database voordat een volgende instantie schrijft), `Utilities.formatDate` rekent in Europe/Amsterdam, `ScriptApp.getProjectTriggers()` meldt de cron-taken als aanwezig. Leest Code.gs een tabblad na `vergeet()` opnieuw, dan laadt de adapter het opnieuw uit Postgres (de conflictcontrole ziet zo de schrijfactie van een ander verzoek).
- `server/google.js`: Gmail, Agenda, Drive, Docs en Sheets via REST met het refresh-token van de eigenaar, in de vorm van `GmailApp`, `CalendarApp`, `DriveApp`, `Drive.Files`, `DocumentApp` en `SpreadsheetApp.openById` voor andere spreadsheets (XPS-export, het antwoordblad van het Google Form; daarin komt de kolom Tijdstempel als `Date`, zoals in Apps Script).
- `server/sync.js` + `server/sync-worker.js`: Code.gs is synchroon; een worker-thread doet Postgres en fetch, de hoofdthread wacht met `Atomics.wait`. Eén databaseverbinding per worker.
- `server/schema.js`: het schema volgt `TABELLEN` in Code.gs (tabelnamen en kolommen in snake_case; getalkolommen `numeric`, de rest tekst, datums als tekst zoals Code.gs ze schrijft; elke tabel een kolom `rij` voor de volgorde). `node server/schema.js --sql` genereert `supabase/migrations/0001_init.sql`; de test bewaakt dat het bestand actueel is. Nieuwe kolommen in `TABELLEN` komen vanzelf (zoals `blad()` in de Sheet): elke nieuwe instantie kijkt bij haar eerste verzoek met één query of er iets ontbreekt en draait alleen dan de DDL, onder een advisory lock (anders liepen gelijktijdige koude starts vast op elkaar).
- `server/migratie.js`: Sheet → Postgres via `apiExportAlles` (gepagineerd), of uit een JSON-bestand, of de demogegevens.

## Problemen oplossen
- **"Google is niet gekoppeld"**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` of `GOOGLE_REFRESH_TOKEN` ontbreekt. Mails en agenda zijn dan leeg; afspraken plannen en offertes maken geven deze melding.
- **Inloggen lukt, maar de app zegt "log opnieuw in"**: het e-mailadres staat niet (actief) in Beheer → Gebruikers en is niet `EIGENAAR_EMAIL`, of `SUPABASE_JWT_SECRET` klopt niet met het project.
- **"Lock timeout" of "Athena is al bezig"**: `DATABASE_URL` wijst naar de transaction pooler (6543); gebruik 5432.
- **Cron geeft 401**: `CRON_SECRET` in Vercel ontbreekt of is net gewijzigd (opnieuw deployen).
- **Een getal komt als tekst terug**: zet de kolom in `NUMERIEK` in `server/schema.js` en genereer het schema opnieuw.
- **"Te veel mislukte inlogpogingen" (429)** terwijl de code klopt: iemand op hetzelfde IP (kantoor) heeft twintig keer mis getypt of een script probeert codes. Na tien minuten gaat het vanzelf weer; eerder: `delete from cache where sleutel like 'athena-auth-fout-%'`.
- **"De database is even niet bereikbaar" (503)**: de technische oorzaak staat in de Vercel-logs (`[athena] databasestoring: …`); meestal de pooler, het wachtwoord of een gepauzeerd Free-project.
- **"Het bestand is groter dan 3 MB"**: de grens van Vercel per verzoek; op Apps Script blijft het 8 MB.
- Logboek van een verzoek: zet `ATHENA_LOG=1`; `Logger.log` uit Code.gs komt dan in de Vercel-logs.
