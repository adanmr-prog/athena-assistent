# Go-live-review van de v6.0-stack (Vercel + Supabase)

Peildatum: 17 oktober 2026. Onderwerp: `backend/Code.gs` 6.0 op de Node-adapter (`server/`) tegenover dezelfde Code.gs op Apps Script, plus de platformlimieten van Vercel, Supabase en Google. Geen nieuwe features, geen herontwerp. Alles in deel A is in de sandbox gemeten (pglite, een echte PostgreSQL 16 voor gelijktijdigheid, Google nagebootst); deel B staat klaar voor de echte stack. ⚠️ markeert een aanname.

## Oordeel in één alinea

Niet live gaan op de stand van v6.1. De review vond drie fouten in de adapter die alleen onder gelijktijdigheid zichtbaar worden (deadlock bij koude starts, lock die vrijkwam vóór het wegschrijven, conflictcontrole die de schrijfactie van een ander verzoek niet zag), vier platformpunten (regio, uploadlimiet, geen rate limiting, JWT zonder aud/iss) en één gegevensverschil (tijdstempel van het Google Form). Al die punten zijn in v6.2 opgelost en met tests afgedekt; de golden master en de dekkingsmatrix laten daarna nul onverklaarde verschillen en nul gaten zien. Wat overblijft voor Menno staat in deel B en in de go-live-criteria: de echte stack (regio, plan, back-ups, Google-consentscherm) en de productiegegevens.

## Bevindingen op volgorde van go-live-risico

| # | Bevinding | Ernst | Status |
|---|---|---|---|
| 1 | Gelijktijdige koude starts liepen vast op de schema-DDL: `deadlock detected` | blokkerend | opgelost in v6.2 (`server/schema.js`), test |
| 2 | De lock kwam vrij vóór `flush()`: schrijfacties van instanties liepen door elkaar | blokkerend | opgelost (`server/apps-script.js`), test |
| 3 | `vergeet()` + `lees()` las uit het geheugen: de conflictcontrole (`_oud`) zag een ander verzoek niet | blokkerend | opgelost, test |
| 4 | Functie standaard in Washington (`iad1`), database in de EU: ±90 ms per query, 17 queries voor Home | blokkerend | opgelost (`vercel.json`: `regions: ["fra1"]`) |
| 5 | Uploadgrens 8 MB in Code.gs tegenover 4,5 MB per verzoek bij Vercel: 413 vóór Code.gs hem ziet | blokkerend | opgelost (3 MB via `api/config`, de app toont de grens) |
| 6 | Token geaccepteerd zonder `aud`/`iss`-controle (de anon- en service-sleutel delen het geheim) | blokkerend | opgelost (`server/handler.js`), negatieftests |
| 7 | Koppelcode raden ongeremd op een publiek `/api` | blokkerend | opgelost: 429 na 20 mislukte pogingen per IP per 10 minuten |
| 8 | Supabase Free: geen back-ups, project pauzeert na 7 dagen stilte | vóór de parallelle week | besluit Menno: Pro ($25/mnd) of eigen `pg_dump` (deel B) |
| 9 | Refresh-token van Google verloopt na 7 dagen als het consentscherm extern + Testing is | vóór de parallelle week | ⚠️ aanname: Workspace-tenant, consentscherm Internal; controle in de criteria |
| 10 | Tijdstempel van het Google Form kwam als tekst in de locale van de Sheet: toestemmingsdatum werd de verwerkdag | vóór de parallelle week | opgelost (`server/google.js`), test |
| 11 | Een databasestoring gaf HTTP 200 met een technische tekst | vóór de parallelle week | opgelost: 503 met leesbare melding, de app toont die |
| 12 | `Access-Control-Allow-Origin: *` zonder reden (app en API op één domein) | vóór de parallelle week | opgelost: geen header tenzij `ATHENA_CORS_ORIGIN` |
| 13 | Geen Content-Security-Policy | vóór de parallelle week | opgelost (`vercel.json`, niet op `?demo=1`); browsertests draaien ermee |
| 14 | `ATHENA_DB`, `ATHENA_GOOGLE_NEP`, `ATHENA_LOG` verschenen als scripteigenschap in `apiExportAlles` | vóór de parallelle week | opgelost |
| 15 | Hobby-plan: cron hoogstens dagelijks, ±59 minuten speling; geen uurlijkse sync en kwartierherinnering | vóór de parallelle week | besluit Menno: Pro of externe planner (README) |
| 16 | Iedereen met een Google-account kan een Supabase-auth-user aanmaken (Code.gs weigert daarna wel) | later | voorstel: Before User Created-hook met domein-allowlist |
| 17 | Per verzoek worden hele tabellen gelezen (Home: 1.219 rijen, 433 kB bij demo-omvang); met productie-Activiteiten wordt dat MB's | later | eerst meten op productiegegevens (`meet.js`), dan tabelcache per warme instantie |
| 18 | 78 adaptermethoden die Code.gs gebruikt raakt geen geautomatiseerde test (offerte in Docs, Gmail-berichten, Drive-bestandsacties, triggerbouwer) | later | handmatige checklist in de parallelle week (zie 1.1) |
| 19 | Mail en agenda zijn niet atomair met de database (afspraak staat in de agenda als het opslaan daarna faalt) | later | zelfde gedrag als Apps Script; vastgelegd |
| 20 | Het refresh-token van de eigenaar geeft de server volledige Gmail/Drive-toegang | later | service-account met domain-wide delegation bij Fase B |

## Deel A: wat is gemeten en hoe

### A1. Dekkingsmatrix van het Apps Script-oppervlak

`node server/dekking.js [--demo]` leest `backend/Code.gs` als AST (acorn) en zet elke aanroep `Dienst.methode(...)` en elke eigenschap `Dienst.X` tegenover wat `server/apps-script.js` en `server/google.js` definiëren (statisch én op de dienstobjecten zelf). Daarnaast moet elke methodenaam die Code.gs op wat dan ook aanroept ofwel ingebouwd JavaScript zijn, ofwel in Code.gs zelf staan, ofwel in de adapter voorkomen.

Uitkomst (17-10-2026):

```
31 aanroepen Dienst.methode, 10 eigenschappen, 0 gaten in de eerste hop, 0 onverklaarde methodenamen.
```

Beperking: de tweede controle werkt op naam, niet op object (dat `getPlainBody` bestaat zegt niet dat hij op het juiste object staat). Daarom is er ook een dynamische meting: `node server/vergelijk.js --dekking` registreert met een Proxy welke adaptermethoden echt worden aangeroepen tijdens de golden master, de vijf cron-triggers en vier schrijf-api's: **56 adaptermethoden geraakt**. Niet geraakt (78 namen), gegroepeerd:

- Docs-offerte: `appendParagraph`, `setHeading`, `editAsText`, `setFontFamily`, `setForegroundColor`, `findText`, `getElement`, `asText`, `deleteText`, `insertText`, `getStartOffset`, `getEndOffsetInclusive`, `saveAndClose`, `getParagraphs`, `setText`, `getText`, `getBody`
- Gmail-berichten: `getMessages`, `getFrom`, `getTo`, `getCc`, `getSubject`, `getPlainBody`, `getFirstMessageSubject`, `createDraft`, `createDraftReply`, `getThreadById`
- Drive-bestanden: `getFileById`, `getBlob`, `getDataAsString`, `getMimeType`, `getLastUpdated`, `makeCopy`, `moveTo`, `addEditor`, `setTrashed`, `createFile`, `createFolder`, `getFoldersByName`, `next`, `copy`, `base64Decode`, `newBlob`, `parseCsv`
- Agenda: `createEvent`, `getEventById`, `getStartTime`, `getEndTime`, `getTitle`, `getLocation`, `getGuestList`, `getCreators`, `isAllDayEvent`, `isRecurringEvent`, `setTitle`, `setDescription`, `deleteEvent`
- Alleen `setup()` en Sheet-beheer: `newTrigger`, `timeBased`, `atHour`, `everyDays`, `everyHours`, `everyMinutes`, `nearMinute`, `onMonthDay`, `onWeekDay`, `deleteTrigger`, `insertSheet`, `deleteSheet`, `insertColumnsAfter`, `setFrozenRows`, `setNumberFormat`, `getMaxRows`, `getDataRange`, `clearContent`, `getHeaders`, `sleep`, `getId`

Dat is het restrisico van de aanpak "Code.gs ongewijzigd": die paden werken alleen aantoonbaar tegen echt Google. Handmatige checklist voor de parallelle week (elk één keer op de nieuwe server): een offerte maken vanuit een kans, een conceptmail laten schrijven door de Assistent, een VOG-scan uploaden en openen, een document indexeren (`apiIndexeer`), een afspraak plannen en verzetten, de dagstart ontvangen.

### A2. Golden master: dezelfde api's, twee backends

`node server/vergelijk.js` draait 209 lees-aanroepen (alle lees-api's, met ids uit de gegevens zelf, als management, accountmanager, talent en consultant, plus `apiExportAlles` van elk tabblad) tegen de demo-backend (`demo/demo-backend.js` + Code.gs in een vm, zoals de demo in de browser) en tegen de adapter op pglite, gevuld met dezelfde seed via `server/migratie.js`. De JSON wordt genormaliseerd (sleutels gesorteerd) en pad voor pad vergeleken.

Uitkomst:

```
157 gelijk, 46 verklaard, 0 met onverklaarde verschillen, 0 mislukt aan één kant.
```

De 46 verklaarde verschillen hebben vier oorzaken, alle in het script vastgelegd (`VERWACHT_SANDBOX`):

| Pad | Oorzaak |
|---|---|
| `gekoppeld`, `ik.gekoppeld`, `gebruiker.gekoppeld` | de demo laat `Session.getEffectiveUser()` de ingelogde demogebruiker zijn (iedereen ziet voorbeeldmails); op Apps Script en op de server is dat de eigenaar. De server klopt. |
| `mails`, `agenda`, `apiHomeMails`, `apiAgenda`, `apiKennisbank.mapUrl` | Gmail, Agenda en Drive zijn in de demo en op de server anders nagebootst; in productie zijn beide echt Google |
| `apiStatus.*Trigger`, `claudeIngesteld`, `sheetUrl` | status van de omgeving (cron in plaats van triggers; geen Claude-sleutel in de sandbox) |
| `apiExportAlles(eigenschappen).EIGENAAR_EMAIL` | hoort bij de server (Google-login), de demo kent hem niet |

Twee dingen die de golden master daarnaast bewees: `apiExportAlles` is voor elk tabblad byte voor byte gelijk (getallen als getal, datums en tijden als dezelfde tekst, JSON-kolommen gelijk), en de rechten gedragen zich gelijk (een accountmanager krijgt op beide kanten dezelfde foutmelding voor management-api's). Niet vergeleken: api's die Claude aanroepen (niet deterministisch) en api's die schrijven; `apiTalentExport` draait als laatste omdat hij een auditregel schrijft.

In productie: `node server/vergelijk.js --bron <exec-url> --code <koppelcode> --server https://<domein> --codes am=<code>,talent=<code>` vergelijkt Apps Script met de server op dezelfde koppelcodes (zie deel B).

### A3. Typen en de datumketen

- **Datums.** Code.gs zet in `celWaarde()` (regel 221) elke `Date` uit de Sheet al bij het lezen om naar tekst (`yyyy-MM-dd`, `yyyy-MM-dd HH:mm` of `HH:mm` naar kolom). `apiExportAlles` gebruikt `lees()`, dus de export bevat die teksten; Postgres bewaart ze als `text`; de adapter geeft ze ongewijzigd terug; `Utilities.formatDate` rekent via `Intl` in Europe/Amsterdam (test met zomer- en wintertijd in `server_test.js`). De vijf `instanceof Date` in Code.gs werken op `new Date()`/`parseDatum` (regels 3918, 4308, 4313) of op celwaarden die op de server nooit een Date zijn (221), op één na: regel 4199 (`aanmeldingenVerwerken`) verwacht de tijdstempel van het Google Form als `Date`. Op de server kwam die als tekst in de locale van de Sheet (`16-10-2026 10:12:33`), die `datumIn()` niet herkent; de toestemmingsdatum werd dan de dag van verwerking. Opgelost: het antwoordblad wordt met `dateTimeRenderOption=SERIAL_NUMBER` gelezen en de kolom Tijdstempel/Timestamp wordt een `Date` (`serieelNaarDatum`); test: serieel 46266,5 → `2026-09-01 12:00`, aanmelding krijgt `toestemmingDatum 2026-09-01`.
- **Getallen.** Elke kolom waarop Code.gs `Number(x.kolom)` of rekenwerk doet (waarde, omzet, lat, lon, doel, duurMin, reisafstandKm, bedrag, woorden, urenPerWeek, maxUrenWeek, kans, aantal, uren, noShows, lateAfmeldingen, diensten, dagenNorm, volgorde, tarief, ondersteuners) staat in `NUMERIEK` in `server/schema.js`; de golden master op `apiExportAlles` bevestigt dat ze als getal terugkomen. Een getal dat in de Sheet per ongeluk in een tekstkolom staat (postcode `1234`, telefoonnummer zonder 0) komt op de server als tekst terug: dat is de gunstige kant op, Code.gs doet daar `String()` op.
- **Booleans.** `Gebruikers.actief` wordt in Code.gs met `actief()` gelezen (`!== false` én de teksten `nee|false|0`), en `instelling()` parseert JSON, dus `false` als tekst komt als boolean terug. Geen verschil.
- **Volgorde.** `lees()` geeft rijen in Sheetvolgorde; de adapter sorteert op `rij` (volgnummer van invoegen) en dan op de sleutel. De migratie voegt in exportvolgorde in; de golden master op `apiExportAlles` is daar het bewijs voor.

### A4. Queryprofiel en latentiemodel

`node server/vergelijk.js --profiel` telt per aanroep de queries, gelezen rijen en bytes op de adapter (pglite, demo-omvang) en rekent de netwerklatentie door: 2 ms per query (functie in `fra1`, database in `eu-central-1`) tegenover 90 ms (functie in `iad1`, de Vercel-standaard).

| api (management) | queries | rijen gelezen | kB gelezen | antwoord kB | fra1 (2 ms/q) | iad1 (90 ms/q) |
|---|---|---|---|---|---|---|
| apiHome | 16 | 1.219 | 433 | 13 | 32 ms | 1.440 ms |
| apiProject(t1) | 16 | 1.225 | 438 | 14 | 32 ms | 1.440 ms |
| apiTalentExport | 19 | 1.235 | 431 | 8 | 38 ms | 1.710 ms |
| apiMatch(v3) | 11 | 209 | 104 | 6 | 22 ms | 990 ms |
| apiCrm | 10 | 107 | 49 | 16 | 20 ms | 900 ms |
| apiTaken | 9 | 118 | 58 | 14 | 18 ms | 810 ms |
| apiTrajecten | 7 | 1.052 | 344 | 11 | 14 ms | 630 ms |
| apiTalenten | 8 | 121 | 73 | 34 | 16 ms | 720 ms |
| apiPipeline | 3 | 49 | 22 | 8 | 6 ms | 270 ms |

Over alle 208 aanroepen: gemiddeld 6,8 queries en 150 kB gelezen per aanroep; grootste antwoord `apiExportAlles(Activiteiten)` 139 kB (ruim onder de 4,5 MB van Vercel). De drie duurste api's zijn `apiTalentExport`, `apiHome` en `apiProject`: elk leest zestien of meer tabbladen omdat Code.gs per verzoek alles opnieuw leest (`_LEES` is per verzoek, zoals in Apps Script). In `iad1` zou Home dus anderhalve seconde aan netwerkwachttijd kosten nog vóór de gegevensoverdracht; in `fra1` dertig milliseconden. Daarom staat `regions: ["fra1"]` nu in `vercel.json` (Hobby mag één regio kiezen). Lokale meting met `server/meet.js` tegen `server/lokaal.js` op pglite: apiHome koud 853 ms (Code.gs compileren), daarna p50 74 ms, p95 88 ms.

⚠️ De bytes schalen met de productietabellen (Activiteiten, Acties, Kandidaten); meet daarom eerst `apiHome` op de echte gegevens (deel B) voordat punt 17 (tabelcache) aan de orde is.

### A5. Platformlimieten uit de documentatie

| Onderwerp | Wat de documentatie zegt | Gevolg voor Athena | Bron (geraadpleegd 17-10-2026) |
|---|---|---|---|
| Verzoek- en antwoordgrootte Vercel | "The maximum payload size for the request body or the response body of a Vercel Function is 4.5 MB" → 413 `FUNCTION_PAYLOAD_TOO_LARGE` | `MAX_BESTAND` 8 MB in Code.gs is op de server 3 MB (`api/config.maxBestand`); antwoorden blijven klein (grootste 139 kB) | [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations) (last_updated 2026-08-24) |
| Maximale duur | Node.js met Fluid compute: Hobby 300 s standaard en maximum; Pro 300 s standaard, 800 s maximum | `maxDuration: 300` kan op elk plan blijven; de triggers hebben in Code.gs een budget van 4 minuten | idem |
| Regio | "By default, Vercel Functions execute in Washington, D.C., USA (iad1) for all new projects"; Hobby: "Single region", Pro 5 | `regions: ["fra1"]` naast Supabase `eu-central-1` | [vercel.com/docs/functions/configuring-functions/region](https://vercel.com/docs/functions/configuring-functions/region) (2026-08-11) |
| Node-API's | "Vercel Functions using the Node.js runtime support all Node.js APIs" | `worker_threads`, `SharedArrayBuffer` en `Atomics.wait` (de sync-brug) zijn toegestaan; `@vercel/nft` traceert `server/sync-worker.js` en `backend/Code.gs` mee (gecontroleerd met `nodeFileTrace`) | [vercel.com/docs/functions/runtimes/node-js](https://vercel.com/docs/functions/runtimes/node-js) (2026-08-11) |
| Cron | Hobby: 100 cronjobs, "Once per day", precisie "Per-hour (±59 min)"; Pro: per minuut, precies | De vijf dagelijkse jobs passen op Hobby (met een uur speling); `crmSyncTrigger` (uur) en `herinneringTrigger` (kwartier) vragen Pro of een externe planner | [vercel.com/docs/cron-jobs/usage-and-pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) (2026-07-15) |
| `vercel.json` | `functions.includeFiles` is een glob; `headers` kunnen `has`/`missing` op query-parameters | CSP alleen zonder `?demo` (de demo draait Code.gs met `eval`) | [vercel.com/docs/project-configuration/vercel-json](https://vercel.com/docs/project-configuration/vercel-json) (2026-08-14) |
| Supavisor | Sessiemodus (poort 5432) ondersteunt alles; transactiemodus (6543) verliest "session-level advisory locks", prepared statements, `SET`, `LISTEN` | De lock van Code.gs is een session-level advisory lock → sessiemodus is verplicht (staat in de README); de aanbeveling "transaction pooler voor serverless" geldt hier dus niet | [supabase.com/docs/guides/database/connecting-to-postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) |
| Verbindingen | Nano/Micro: 60 directe verbindingen, 200 pooler-clients; Small: 90 en 400 | Eén verbinding per warme Vercel-instantie; bij 20 gebruikers ruim binnen 200 | [supabase.com/docs/guides/platform/compute-and-disk](https://supabase.com/docs/guides/platform/compute-and-disk) |
| JWT-sleutels | "Starting October 1, 2025, all new projects will use asymmetric JWTs by default"; JWKS op `/auth/v1/.well-known/jwks.json`; het oude geheim "No longer recommended. Available for backward compatibility" | Een nieuw project werkt via de JWKS-tak van `emailUitToken` (alleen `SUPABASE_URL` nodig); `SUPABASE_JWT_SECRET` is optioneel geworden; ⚠️ de JWKS-tak is niet tegen echte sleutels getest | [supabase.com/blog/jwt-signing-keys](https://supabase.com/blog/jwt-signing-keys) (14-07-2025), [docs signing-keys](https://supabase.com/docs/guides/auth/signing-keys) |
| Sessies | Refresh-token eenmalig bruikbaar; reuse interval 10 s; daarbuiten "the whole session is regarded as terminated"; access token 1 uur | Bevestigt de v6.1-fix (één vernieuwing tegelijk in de app) | [supabase.com/docs/guides/auth/sessions](https://supabase.com/docs/guides/auth/sessions) |
| Free-plan | "Free projects are paused after 1 week of inactivity"; 500 MB; geen back-ups genoemd, wel "regularly export their data"; Pro $25/mnd: "not paused", "Daily backups stored for 7 days"; PITR-add-on vanaf $100/mnd | Voor productie Pro, of Free met eigen dagelijkse `pg_dump` én een wekelijks bezoek | [supabase.com/pricing](https://supabase.com/pricing), [docs backups](https://supabase.com/docs/guides/platform/backups) |
| Sign-ups | De Before User Created-hook kan een aanmelding weigeren op e-maildomein | Voorstel voor later (punt 16) | [docs before-user-created-hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) |
| Google refresh-token | Verloopt bij extern consentscherm met status Testing na 7 dagen; verder na 6 maanden ongebruikt, bij intrekken, bij wachtwoordwijziging met Gmail-scopes, en bij meer dan 100 tokens per account per client | Consentscherm Internal (Workspace) of gepubliceerd; één refresh-token voor de server | [developers.google.com/identity/protocols/oauth2](https://developers.google.com/identity/protocols/oauth2) (2026-10-16) |
| Gmail-quota | 6.000 quota-eenheden per minuut per gebruiker; `messages.send` 100, `threads.get` 120 bij `format=full`, `threads.list` 10 | Alle verzoeken lopen op het account van de eigenaar; de mail-lijst van Home is 5 minuten gecachet (`metCache`), dus ruim binnen de grens | [developers.google.com/workspace/gmail/api/reference/quota](https://developers.google.com/workspace/gmail/api/reference/quota) (2026-10-16) |
| Agenda- en Drive-quota | Agenda 600 verzoeken per minuut per gebruiker; Drive 325.000 eenheden per minuut per gebruiker | Geen knelpunt | [calendar quota](https://developers.google.com/workspace/calendar/api/guides/quota), [drive limits](https://developers.google.com/workspace/drive/api/guides/limits) (2026-09-11) |

### A6. Fouten en gelijktijdigheid (echte PostgreSQL)

`DATABASE_URL_TEST=… node server/test/fouten_test.js` draait tegen een echte PostgreSQL 16; elke situatie in een eigen kindproces (één worker, één verbinding, zoals één Vercel-instantie). Uitkomst na de fixes van v6.2 (drie keer achter elkaar gedraaid):

```
ok   demogegevens staan in PostgreSQL (22 tabellen)
ok   vijf nieuwe instanties tegelijk: alle vijf antwoorden (schema-controle zonder DDL of onder de schema-lock)
ok   vijf koude starts terwijl er iets aan het schema ontbreekt: geen deadlock, het ontbrekende onderdeel staat er weer
ok   met de lock bij een andere verbinding meldt de server na ~15 s dat Athena bezig is (15235 ms)
ok   zodra de lock vrij is lukt dezelfde bewerking (en staat in de database)
ok   vijf schrijvers met _oud op dezelfde rij: één wint, vier krijgen de conflictmelding
ok   vijf schrijvers zonder _oud: alle vijf lukken na elkaar (lock), de laatste staat, geen dubbele rijen
ok   na afloop houdt niemand de lock vast
ok   Postgres onbereikbaar: HTTP 503 met een leesbare JSON-fout voor de app
ok   apiHome werkt met Google nagebootst
     Google 429 → apiHome antwoordt (mails: [])
     Google 500 → apiHome antwoordt
ok   een Google-fout geeft een duidelijk antwoord (geen vastloper)
ok   als de database na de agenda-aanroep faalt: "Opslaan in de database mislukt" terwijl de afspraak al in de agenda staat (1 POST) — net als op Apps Script niet atomair
ok   zonder de storing lukt dezelfde afspraak
ALLES GOED
```

Wat de eerste run (vóór de fixes) liet zien, met het bewijs uit het Postgres-log:

1. **Deadlock bij koude starts.** Vier van de vijf gelijktijdige schrijvers kregen `deadlock detected`. Het log: `Process 6323 waits for AccessExclusiveLock on relation 17240 … blocked by process 6321` met als statement de volledige schema-DDL (`create table if not exists …; create index if not exists …; alter table … enable row level security`). Elke nieuwe instantie draaide die DDL bij haar eerste verzoek; twee tegelijk vergrendelen tabellen in andere volgorde. In productie gebeurt precies dit als de app bij het openen meerdere api's tegelijk vraagt en Vercel meerdere instanties start. Fix: `zorgSchema` kijkt eerst met één query of er iets ontbreekt (tabellen, kolommen, indexen) en draait de DDL alleen dan, onder `pg_advisory_lock(7311)`.
2. **Lock vrij vóór het wegschrijven.** `metLock` in Code.gs geeft de lock vrij in zijn `finally`; op Apps Script staan de schrijfacties dan al in de Sheet, op de server pas in `flush()` aan het eind van het verzoek. Daardoor liepen flushes van verschillende instanties door elkaar. Fix: `releaseLock()` stelt het vrijgeven uit tot na `flush()` (ook als flush faalt); een tweede `metLock` in hetzelfde verzoek krijgt dezelfde lock en stapelt niet (test).
3. **Conflictcontrole zag een ander verzoek niet.** `controleerConflict` roept `vergeet(tab)` aan ("vers uit de Sheet: een ander verzoek kan net geschreven hebben") en leest opnieuw. Op de server kwam die tweede lezing uit het geheugen van het verzoek, dus de controle vergeleek met verouderde gegevens en de verliezers hadden elkaars wijziging overschreven. Fix: een tweede volledige lezing van een tabblad dat in dit verzoek niet is gewijzigd laadt opnieuw uit Postgres (test: `vergeet()` + `lees()` ziet een `update` van buiten; vijf schrijvers met `_oud` → één winnaar, vier conflictmeldingen).

Wat verder is vastgesteld: een lock die een andere instantie vasthoudt geeft na 15 seconden de bestaande melding uit Code.gs; Google 429/500 maken Home niet kapot (mails en agenda leeg, Code.gs vangt het op); een databasestoring geeft nu 503 met een leesbare melding (en de technische tekst in het Vercel-log); een verlopen of vals token geeft `secret` (zie A7). Niet atomair blijft: een mail of afspraak die vóór een mislukte flush is verstuurd; dat is op Apps Script hetzelfde.

Gelijktijdigheid binnen één instantie: Code.gs draait synchroon (de brug blokkeert met `Atomics.wait`), dus een warme instantie behandelt verzoeken na elkaar; de advisory lock is er voor instanties onderling. De enige `await` vóór Code.gs is de tokencontrole.

### A7. Beveiliging van de nieuwe buitenkant

`node server/test/security_test.js` (pglite):

- JWT: geldig token met `aud authenticated` logt in; geweigerd worden `alg none`, een ander geheim, verlopen, een aangepast e-mailadres met dezelfde handtekening, `aud anon` (de anon-sleutel, ook met e-mailadres), een token zonder e-mailadres (service_role), en met `SUPABASE_URL` een token van een ander project of zonder issuer. Vóór v6.2 ontbrak de `aud`/`iss`-controle: elk HS256-token met het projectgeheim werd geaccepteerd.
- Koppelcode raden: na 20 mislukte pogingen per IP binnen 10 minuten een 429, ook voor de goede code vanaf dat IP; een ander IP werkt door; zonder IP-header (lokaal) wordt niet geteld; een ongeldig token telt mee; het portaal heeft zijn eigen budget per token in Code.gs. Vóór v6.2 was er geen rem: lokaal haalde het raden honderden pogingen per seconde.
- CORS: geen `Access-Control-Allow-Origin` tenzij `ATHENA_CORS_ORIGIN` (app en API staan op één domein); OPTIONS idem.
- Invoer: geen JSON → 400; alleen `api*`-functies; portaalfuncties niet met een koppelcode; cron zonder geheim → 401.
- CSP (`vercel.json`): `default-src 'self'`, inline script en stijl toegestaan (de app is één inline script), fonts van Google, `connect-src` alleen de eigen origin, `*.supabase.co` en de Apps Script-domeinen, `frame-ancestors 'none'`, `object-src 'none'`. Niet op `?demo=1`: de demo draait Code.gs met `eval`. De mock stuurt dezelfde header met `MOCK_CSP=1`; `test/test_app.py` (alle schermen, portaal) en `test/test_inlog.py` (Google-login) draaien ermee zonder één schending in de console.
- `npm audit --omit=dev`: 0 kwetsbaarheden (pg 8.23, jose 6.2). gitleaks 8.28.0 over 45 commits en de werkmap: geen lekken.

## Deel B: controles op de echte stack, met verwachte uitvoer

Elke regel is een commando dat Menno zelf draait zodra Supabase, Google en Vercel staan (README stappen 1–4). De verwachte uitvoer staat erbij, zodat het oordeel niet van mij of van jou afhangt.

1. **Golden master tegen productie** (Sheet leidend, direct na een migratie, zonder tussentijdse bewerkingen):
   ```
   node server/vergelijk.js --bron https://script.google.com/macros/s/…/exec --code <koppelcode beheerder> --server https://<domein> --codes am=<code van een accountmanager>,talent=<code talentteam>
   ```
   Verwacht: laatste regel `Samenvatting: N gelijk, M verklaard, 0 met onverklaarde verschillen, 0 mislukt aan één kant.` Elk ander verschil is een adapter- of migratiefout: kopieer de regels onder "Onverklaarde verschillen" in een issue.
2. **Checksums na twee migratieruns** (idempotentie) en **na een restore**:
   ```
   DATABASE_URL='postgres://…pooler…:5432/postgres' node server/migratie.js --bron … --code … > /dev/null
   DATABASE_URL='…' node server/checksums.js > a.txt
   DATABASE_URL='…' node server/migratie.js --bron … --code … > /dev/null
   DATABASE_URL='…' node server/checksums.js > b.txt
   diff a.txt b.txt && echo gelijk
   ```
   Verwacht: `gelijk` (geen regels van `diff`). In de sandbox gaf `--demo` twee keer een verschil op `Meldingen` (12 → 24) omdat de demo-seed elke keer nieuwe ids maakt; de Sheet heeft vaste ids, dus daar hoort het stil te blijven. Een verschil op één tabel betekent: rijen zonder stabiel id in dat tabblad.
3. **Antwoordtijden vanaf een preview in `fra1` en een in `iad1`** (zet voor de tweede tijdelijk `"regions": ["iad1"]`):
   ```
   node server/meet.js --server https://<preview>.vercel.app --code <koppelcode> --n 20
   ```
   Verwacht in `fra1`: `GET /api p50` onder 150 ms; `apiHome` p95 onder 800 ms en `apiCrm` p95 onder 500 ms (⚠️ grenzen te ijken op de productiegegevens; de eerste kolom "koud" mag 1–3 s zijn). In `iad1` ligt `apiHome` naar verwachting 1–1,5 s hoger: dat verschil is de afstand tot de database.
4. **Row Level Security met de anon-sleutel** (de sleutel die `api/config` prijsgeeft mag niets kunnen lezen):
   ```
   curl -s "https://<project>.supabase.co/rest/v1/scholen?select=id&limit=1" -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
   curl -s "https://<project>.supabase.co/rest/v1/talenten?select=id&limit=1" -H "apikey: <anon>" -H "Authorization: Bearer <anon>"
   ```
   Verwacht: beide `[]` (RLS aan zonder policies). Elke rij in het antwoord is een blokkerende fout.
5. **Back-up en restore-oefening** (ook op Pro: één keer bewijzen dat terugzetten werkt):
   ```
   pg_dump "$DATABASE_URL" --no-owner --no-privileges -Fc -f athena-$(date +%F).dump
   createdb athena_restore && pg_restore --no-owner -d athena_restore athena-$(date +%F).dump
   DATABASE_URL='postgres://…/athena_restore' node server/checksums.js > restore.txt && diff a.txt restore.txt && echo gelijk
   ```
   Verwacht: `gelijk`. Dagelijks automatisch: een GitHub Action met `pg_dump` naar een privé-bucket (voorbeeld in `server/README.md`), of Supabase Pro (dagelijkse back-ups, 7 dagen).
6. **Cron**:
   ```
   curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domein>/api/cron/herinneringTrigger
   ```
   Verwacht: `{"ok":true,"taak":"herinneringTrigger","resultaat":…,"ms":<getal>,"waarschuwingen":[]}`; zonder header `{"ok":false,"fout":"geen toegang"}` met status 401. Daarna zeven dagen lang in Vercel → Logs → Cron: elke job `200`.
7. **OWASP ZAP baseline op de preview** (passieve scan, geen schrijfacties):
   ```
   docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://<preview>.vercel.app/ -I
   ```
   Verwacht: `FAIL-NEW: 0`; de `WARN`-regels nalopen (verwacht: alleen waarschuwingen over `unsafe-inline` in de CSP, die bewust is).
8. **Google-token houdbaarheid**: noteer de datum van `node server/google-toestemming.js`; na acht dagen moet `apiHome` op de server nog mails tonen. Verwacht: ja. Zo niet, staat het consentscherm op Extern/Testing (7 dagen) en moet het Internal of gepubliceerd zijn.
9. **Fouten en gelijktijdigheid tegen Supabase** (een apart testproject of een lege database; de test maakt het schema `public` leeg):
   ```
   DATABASE_URL_TEST='postgres://…pooler…:5432/postgres' node server/test/fouten_test.js
   ```
   Verwacht: `ALLES GOED`, met de lock-melding rond 15.000 ms.

## Go-live-criteria

De overstap (README stap 5.2) kan als alle onderstaande regels waar zijn, op de dag zelf gecontroleerd:

1. Deel B.1: `0 met onverklaarde verschillen, 0 mislukt aan één kant` voor management, een accountmanager en het talentteam.
2. Deel B.2: checksums gelijk na twee migratieruns en na de restore-oefening.
3. Deel B.3 in `fra1`: `apiHome` p95 < 800 ms, `apiCrm` p95 < 500 ms, `GET /api` p50 < 150 ms; geen fouten in de kolom `fouten`.
4. Deel B.4: `[]` voor `scholen`, `talenten`, `gebruikers` en `eigenschappen` met de anon-sleutel.
5. Deel B.6: zeven opeenvolgende dagen alle vijf cronjobs `200`; de dagstartmail van de server is op dezelfde dag inhoudelijk gelijk aan die van Apps Script.
6. Deel B.7: `FAIL-NEW: 0`. `node server/test/security_test.js` en `node server/test/server_test.js`: `ALLES GOED` op de commit die live gaat.
7. Deel B.8: het Google-token werkt na acht dagen nog; het consentscherm is Internal of gepubliceerd.
8. Back-up: Supabase Pro met dagelijkse back-ups, of een eigen dagelijkse `pg_dump` met één geslaagde restore (B.5).
9. Vercel-logs over de parallelle week: geen `FUNCTION_INVOCATION_TIMEOUT`, geen 500; 429 en 503 alleen met een verklaring.
10. Handmatige checklist uit A1 (offerte, conceptmail, VOG-upload en openen, document indexeren, afspraak plannen en verzetten, dagstart) één keer geslaagd op de server.

## Wat deze review niet heeft getest

Echte Supabase (Supavisor, JWKS met echte sleutels, Auth-redirects), echte Vercel (koude start, Fluid compute, bundelgrootte, cron-precisie), echte Google-API's (quota, token-vernieuwing, Docs-offerte, Drive-OCR), iOS op het echte domein, en de productiegegevens zelf. Daarvoor zijn deel B en de parallelle week; de scripts geven voor elk onderdeel een meetbare uitkomst.
