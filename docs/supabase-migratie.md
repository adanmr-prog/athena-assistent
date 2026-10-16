# Overstap naar Supabase + Vercel (plan)

Status: **v6.0 gebouwd (16-10-2026)**, overstap door Menno volgens `server/README.md`. De app en de API draaien op Vercel met Supabase Postgres en Google-login; `backend/Code.gs` blijft ongewijzigd de logica en draait in Node met een adapter voor de Apps Script-diensten (dezelfde aanpak als de demo). De oude stack (GitHub Pages + Apps Script + Sheet) blijft werken tot de overstap. Hieronder eerst het oorspronkelijke plan en de afspraken; de sectie "Wat v6.0 geworden is" zegt waar de uitvoering afwijkt.

## Wat v6.0 geworden is
- **Eén logica, twee omgevingen.** `Code.gs` is niet herschreven naar Edge Functions: `server/apps-script.js` bootst `SpreadsheetApp` (Postgres), `PropertiesService`, `CacheService`, `LockService`, `Utilities`, `UrlFetchApp` en de Google-diensten na, en `server/code.js` draait Code.gs per verzoek als vers exemplaar. Daarmee werken alle 100+ `api*`-functies, de triggers en het portaal meteen, met dezelfde Node-tests als vangnet (`server/test/server_test.js` draait de demogegevens via de migratie in Postgres-in-WASM en roept de API aan zoals de app).
- **API op Vercel (Node), niet als Supabase Edge Function.** Code.gs is synchroon geschreven; Node kan dat met een worker-brug (`server/sync.js`) exact nabootsen. Het contract van `run()` is gelijk gebleven: `POST /api` met `{fn, args, token}` → `{ok, result | fout}`.
- **Schema volgt TABELLEN.** `supabase/migrations/0001_init.sql` wordt gegenereerd uit `TABELLEN` in Code.gs: één tabel per tabblad, kolommen in snake_case, getallen `numeric`, de rest tekst (ook datums, zoals Code.gs ze schrijft), een kolom `rij` voor de volgorde. Het concept-schema hieronder (ids voor namen, `timestamptz`, `text[]`, `jsonb`, RLS per team) blijft het doel voor v6.1+ (fase 2 van het talentnetwerk), als Code.gs stap voor stap wordt vervangen door echte Postgres-logica. Tot die tijd handhaaft Code.gs de rechten (`RECHTEN`); RLS staat aan zonder policies, zodat alleen de server bij de tabellen kan.
- **Inloggen:** Supabase Auth met Google (implicit flow, zonder bibliotheek in de app). De server controleert het token (`jose`) en geeft het e-mailadres aan Code.gs (`SERVER_LOGIN` → `gebruikerVanEmail`): de eigenaar via `EIGENAAR_EMAIL`, anderen via `Gebruikers.email`. De koppelcode werkt daarnaast nog.
- **Gmail en Agenda** nog als de eigenaar (één refresh-token, `server/google.js`); de koppeling per gebruiker (Fase B) is niet meegenomen. **Documenten** blijven in Drive. **Triggers** zijn Vercel Cron (`vercel.json`). **Realtime** is niet gebouwd (de app haalt zoals altijd opnieuw op).
- **Migratie:** `server/migratie.js` leest de Sheet via `apiExportAlles` (Code.gs 6.0) en schrijft Postgres; herhaalbaar (upsert), met aantallen per tabel.

## Waarom
- **Snelheid:** elke klik is nu een Apps Script-verzoek dat een Sheet leest. Dat kost 1–3 s, en meer is er niet uit te halen. Postgres achter een API reageert in 50–300 ms.
- **Tegelijk werken:** met 20 gebruikers raakt het script-lock (één schrijver tegelijk) vol. Postgres heeft transacties per rij.
- **Eigen Gmail en Agenda per gebruiker (Fase B):** met inloggen via Google (OAuth) krijgt elke gebruiker zelf toegang tot zijn mail en agenda. Domain-wide delegation is dan niet nodig.
- **Eigen domein:** Vercel met een eigen domein (bijv. `crm.athenaschool.nl`).

## Doelarchitectuur

| Onderdeel | Nu (Apps Script) | Straks |
|---|---|---|
| App | `index.html` op GitHub Pages | Dezelfde app op Vercel (statisch); later eventueel opgesplitst |
| Inloggen | Koppelcode per gebruiker (`CODES`) | Supabase Auth met Google, alleen `@athenaschool.nl` en `@athenastudies.nl` |
| Database | Google Sheet (tabbladen = tabellen) | Supabase Postgres (EU-regio) |
| API | `doPost` → `api*`-functies | Supabase Edge Functions met dezelfde namen (`apiSchool`, `apiTaakOpslaan`, …) en eenvoudige lees-queries rechtstreeks via PostgREST met RLS |
| Rechten | `RECHTEN`, `mag()`, `eis()` in code (v4.0: team en rol per gebruiker) | Row Level Security-policies op basis van `team` en `rol` in `gebruikers` (dezelfde tabel als `RECHTEN`) |
| Live bijwerken | Opnieuw ophalen | Supabase Realtime op `taken`, `activiteiten` en `kansen` |
| Gmail/Agenda | `GmailApp`/`CalendarApp` als Menno | Google API met het OAuth-token van de ingelogde gebruiker (opgeslagen in Supabase Vault) |
| Claude (Brein, review, content) | `UrlFetchApp` | Edge Function met de Anthropic SDK (TypeScript), sleutel als secret |
| Nachtelijke review, sync, archief | Apps Script-triggers | `pg_cron` + Edge Functions |
| Documenten (Drive-index) | Drive-map, tekst in de Sheet | Blijft Drive (Google API), index in tabel `documenten`, later pgvector voor beter zoeken |

## De naad: `run(fn, ...args)`
De app praat via één functie (`run`) met de backend. Bij de overstap verandert alleen `run`:
- het verzoek gaat naar `https://<project>.supabase.co/functions/v1/<fn>` met het Supabase-sessietoken;
- de vorm van verzoek en antwoord blijft gelijk (`{ ok, result | fout }`).

Elke `api*`-functie in `backend/Code.gs` wordt een Edge Function met dezelfde naam, argumenten en uitvoer. Het contract staat in `backend/README.md` en de skill `athena-backend-api`; dat is meteen de specificatie.

## Afspraken die we nu al volgen
1. **Ids zijn tekst en stabiel.** Ze worden nooit afgeleid van rijnummers. `_rij` blijft binnen de backend. Postgres krijgt `id text primary key`.
2. **Opslaan = alleen gewijzigde velden plus `_oud`** (v3.3). In Postgres wordt dat een `update … where id = $1 and <veld> = <oud>`. Bij 0 rijen: de melding "Intussen gewijzigd".
3. **Elke `…Opslaan` geeft het volledige bijgewerkte object terug.** De app werkt zijn scherm daarmee lokaal bij, zonder het opnieuw op te halen (v3.7).
4. **Verwijderen loopt via één `apiVerwijder(soort, id, opties)`**, met dezelfde regels: de eigenaar of de beheerder.
5. **Keuzelijsten staan in `Instellingen`, niet in code.** Ze worden de tabel `instellingen (sleutel text primary key, waarde jsonb)`.
6. **Geen logica in de app die de backend niet ook controleert.** De app verbergt knoppen; de backend weigert.

## Bekende schuld (oplossen bij de overstap)
- **Koppeling op naam:** `eigenaar`, `door` en `am` bevatten nu een naam. Een hernoemde gebruiker wordt doorgevoerd met `hernoemGebruiker()`. In Postgres wordt dat `eigenaar_id uuid references gebruikers(id)`. De migratie zet namen om naar ids.
- **Dubbele naamvelden:** `Kansen.school` en `Trajecten.school` zijn kopieën van `Scholen.naam`. In Postgres verdwijnen ze en wordt de naam bij het lezen opgehaald met een join.
- **Tags** staan als kommatekst en **eigen velden** als JSON-tekst. Ze worden `tags text[]` en `velden jsonb`.
- **Datums** staan als tekst `yyyy-MM-dd HH:mm` in de tijdzone Europe/Amsterdam. Ze worden `timestamptz`.

## Tabellen (concept-schema)

```sql
create table gebruikers   (id uuid primary key default gen_random_uuid(), naam text not null unique, email text unique, team text not null check (team in ('management','consultancy','accountmanagement','talent')), rol text not null check (rol in ('medewerker','teamlead','management')), actief boolean default true, auth_id uuid unique);
create table scholen      (id text primary key, naam text not null, plaats text, type text, bestuur text, adres text, website text, leerlingen int, telefoon text, email text, status text, eigenaar_id uuid references gebruikers, tags text[] default '{}', velden jsonb default '{}', notities text, laatste_contact date, capsule_id text, aangemaakt timestamptz default now(), bijgewerkt timestamptz, bijgewerkt_door uuid references gebruikers);
create table personen     (id text primary key, voornaam text, achternaam text, functie text, school_id text references scholen on delete set null, email text, telefoon text, linkedin text, eigenaar_id uuid references gebruikers, tags text[] default '{}', velden jsonb default '{}', laatste_contact date, capsule_id text, aangemaakt timestamptz default now(), bijgewerkt timestamptz, bijgewerkt_door uuid);
create table kansen       (id text primary key, naam text not null, school_id text not null references scholen, persoon_id text references personen on delete set null, pipeline text, fase text not null, kans int, waarde numeric, verwachte_sluiting date, volgende_actie text, deadline date, gesloten date, verlies_reden text, eigenaar_id uuid references gebruikers, tags text[] default '{}', velden jsonb default '{}', notities text, laatste_contact date, capsule_id text, aangemaakt timestamptz default now(), bijgewerkt timestamptz, bijgewerkt_door uuid);
create table trajecten    (id text primary key, school_id text references scholen, school_naam text, traject text not null, schooljaar text, start date, eind date, status text, ondersteuners int, uren_per_week numeric, tarief numeric, omzet numeric, contactpersoon text, am_id uuid references gebruikers, adviseur_id uuid references gebruikers, kans_id text references kansen, contactgegevens text, voorstel_url text, documenten_url text, verlenging text, samenvatting text, capsule_id text, bijgewerkt timestamptz, bijgewerkt_door uuid);
create table taken        (id text primary key, tekst text not null, bron text, prio text, deadline date, tijd time, herhaling jsonb, status text default 'open', categorie text, eigenaar_id uuid references gebruikers, school_id text references scholen on delete cascade, persoon_id text references personen on delete set null, kans_id text references kansen on delete set null, traject_id text references trajecten on delete set null, track_run_id text, notitie text, link text, aangemaakt timestamptz default now(), afgerond timestamptz, capsule_id text, bijgewerkt timestamptz, bijgewerkt_door uuid references gebruikers, tags text[] default '{}', ouder_id text references taken on delete set null, herinnerd timestamptz);  -- v4.5: tijd, herhaling (zelfde JSON als in de Sheet, zie backend/README.md) en bijgewerkt; v4.6: tags, hoofdtaak (één niveau), herinnerd
-- v4.6: voorkeuren per gebruiker (opgeslagen taakweergaven, herinneringen aan/uit) staan nu in Instellingen onder taakWeergaven:<id> en herinneringen:<id>; ze worden gebruikers.voorkeuren jsonb
create table activiteiten (id text primary key, type text not null, datum timestamptz not null, door_id uuid references gebruikers, school_id text references scholen on delete cascade, persoon_id text references personen on delete set null, kans_id text references kansen on delete set null, traject_id text references trajecten on delete set null, onderwerp text, tekst text, duur_min int, gmail_id text unique, agenda_id text, bron text, aangemaakt timestamptz default now());
create table mijlpalen    (id text primary key, pipeline text not null, mijlpaal text not null, volgorde int, kans int, dagen_norm int, unique (pipeline, mijlpaal));
create table tracks       (id text primary key, naam text not null, omschrijving text, stappen jsonb not null default '[]');
create table doelen       (id text primary key, eigenaar_id uuid references gebruikers on delete cascade, team text, bedrijf boolean default false, periode text, metric text, doel numeric);  -- v4.2: per persoon, team of bedrijf
create table documenten   (id text primary key, drive_id text unique, titel text, type text, school_naam text, url text, gewijzigd timestamptz, woorden int, tekst text, handmatig jsonb);
create table reviews      (id text primary key, eigenaar_id uuid references gebruikers, datum date, gemaakt_op timestamptz, samenvatting text, gedaan jsonb, blijven_liggen jsonb, vandaag jsonb);
create table facturen     (id text primary key, traject_id text references trajecten on delete cascade, omschrijving text, bedrag numeric, datum date, status text, factuurnummer text, bijzonderheden text, exact_id text, aangemaakt timestamptz default now(), door_id uuid references gebruikers);
create table vacatures    (id text primary key, traject_id text references trajecten on delete cascade, titel text, aantal int default 1, dagen text, uren_per_week numeric, start date, eind date, profiel text, status text default 'open', door_id uuid references gebruikers, aangemaakt timestamptz default now());
-- v5.0: talentnetwerk fase 1 (kolommen 1-op-1 met de tabbladen; JSON → jsonb, lijsten → text[]). Bewust afwezig: BSN, ID-kopie, IBAN, geboortedatum, tarief, contract-pdf, gezondheid.
create table talenten     (id text primary key, voornaam text, achternaam text, email text, telefoon text, postcode text, woonplaats text, lat numeric, lon numeric, functies text[] default '{}', sectoren text[] default '{}', vakken text[] default '{}', opleiding text, bevoegdheid text, vervoer text, reisafstand_km numeric, max_uren_week numeric, beschikbaar_vanaf date, beschikbaar_tot date, beschikbaarheid jsonb default '{}', uitzonderingen jsonb default '[]', beschikbaarheid_bevestigd timestamptz, laatste_peiling timestamptz, contractvorm text, status text not null default 'aangemeld', status_sinds timestamptz, bron text, xps_id text, afas_nummer text, tags text[] default '{}', velden jsonb default '{}', toestemming_datum date, toestemming_grondslag text, bewaren_tot date, notitie text, laatste_contact date, door_id uuid references gebruikers, aangemaakt timestamptz default now(), bijgewerkt timestamptz, bijgewerkt_door uuid, auth_id uuid unique);  -- auth_id vervangt de portaaltokens: het talent logt in met een magic link en ziet alleen zijn eigen rij
create table talent_documenten (id text primary key, talent_id text references talenten on delete cascade, soort text, afgifte date, geldig_tot date, bestand text, gecontroleerd_door uuid references gebruikers, gecontroleerd_op timestamptz, status text, notitie text, door_id uuid references gebruikers, aangemaakt timestamptz default now(), bijgewerkt timestamptz);  -- bestand = pad in Storage-bucket talent-documenten (signed URLs, inzage gelogd), in plaats van Drive
create table beoordelingen (id text primary key, talent_id text references talenten on delete cascade, kandidaat_id text references kandidaten on delete set null, traject_id text references trajecten on delete set null, school_id text references scholen on delete set null, door_id uuid references gebruikers, rol text check (rol in ('am','talent','school')), datum timestamptz, oordeel text check (oordeel in ('favoriet','goed','niet geschikt')), criteria jsonb default '{}', tekst text, zichtbaarheid text default 'intern', wederhoor text, aangemaakt timestamptz default now(), bijgewerkt timestamptz);
create table talent_school (id text primary key, talent_id text references talenten on delete cascade, school_id text references scholen on delete cascade, status text check (status in ('favoriet','neutraal','niet meer')), richting text check (richting in ('school','talent')), reden text, door_id uuid references gebruikers, datum timestamptz, unique (talent_id, school_id, richting));
create table talent_uren  (id text primary key, talent_id text references talenten on delete cascade, xps_id text, xps_project text, traject_id text references trajecten on delete set null, week text, uren numeric, diensten int, no_shows int, late_afmeldingen int, geimporteerd timestamptz, unique (talent_id, week, xps_project));  -- weekaggregaten; het archief (TalentUren_archief) is niet meer nodig
create table kandidaten   (id text primary key, vacature_id text references vacatures on delete cascade, traject_id text references trajecten, naam text not null, email text, telefoon text, bron text, xps_id text, afas_nummer text, status text not null default 'voorgesteld', status_sinds timestamptz, gesprek timestamptz, notitie text, door_id uuid references gebruikers, aangemaakt timestamptz default now(), talent_id text references talenten on delete set null, start date, eind date, functie text, uren_per_week numeric, dagen text, xps_plaatsing_id text, eind_reden text);  -- v5.0: een rij = voordracht of plaatsing van een talent
-- v5.0: activiteiten + talent_id text references talenten on delete cascade; scholen + lat numeric, lon numeric; gebruikers.team check + 'extern' is niet nodig: het portaalprofiel verdwijnt met de tokens (talent logt zelf in)
-- v5.0: het tabblad Aanmeldingen (Google Form) wordt een eigen aanmeldformulier op het domein (Edge Function met rate limiting) dat direct in talenten schrijft
create table meldingen    (id text primary key, voor_id uuid references gebruikers on delete cascade, tekst text, link text, datum timestamptz default now(), gelezen timestamptz, door_id uuid references gebruikers);
create table content      (id text primary key, datum timestamptz, type text, onderwerp text, tekst text, door_id uuid references gebruikers);
create table huisstijl    (sleutel text primary key, waarde text);
create table instellingen (sleutel text primary key, waarde jsonb);
-- het archief (Activiteiten_archief) is niet meer nodig: Postgres heeft genoeg aan indexen op (school_id, datum) enz.
```

**RLS-hoofdlijnen:**
- Volgens de rechtentabel in `docs/teams-en-processen.md` (v4.0): `scholen` en `personen` leest iedereen; `kansen` alleen de eigenaar, zijn teamlead en management; `trajecten` de am, de adviseur, hun teamleads, talent (status opstart) en management; `activiteiten` en `taken` volgen de kans of het project waaraan ze hangen.
- Schrijven mag iedereen; wijzigen of verwijderen alleen de eigenaar of de beheerder.
- `reviews` en mailgegevens leest alleen de eigenaar.
- `gebruikers`, `doelen`, `mijlpalen`, `tracks`, `huisstijl` en `instellingen` mag alleen de beheerder schrijven.
- v5.0: `talenten`, `talent_documenten`, `talent_school` en `talent_uren` leest en schrijft het talentteam (en management); een accountmanager leest een talent alleen als er een `kandidaten`-rij is in een traject dat hij mag zien, en dan zonder postcode, documenten, notitie en uren (een view `talenten_beperkt`); `beoordelingen` schrijft de accountmanager alleen voor zo'n kandidaat, het talentteam alles. Een ingelogd talent (`talenten.auth_id = auth.uid()`) leest en wijzigt alleen zijn eigen rij (beschikbaarheid, uitzonderingen) en leest zijn beoordelingen met `zichtbaarheid = 'talent'`. Storage-bucket `talent-documenten`: alleen talentteam en management, signed URLs met een regel in `activiteiten`.

## Stappen bij de overstap
1. Supabase-project (EU) en Vercel-project aanmaken, domein koppelen. **Menno:** accounts aanmaken en DNS instellen (`server/README.md`, stappen 1–3).
2. Schema plus RLS (gebouwd: `supabase/migrations/0001_init.sql`), en Google-login (gebouwd; de beperking is "staat in Gebruikers", plus een interne OAuth-consent voor het Workspace-domein).
3. ~~Edge Functions per `api*`-functie~~ → gebouwd als Code.gs op Vercel met de adapter (zie boven).
4. Migratiescript (gebouwd: `server/migratie.js`; namen blijven namen, zie het concept-schema voor later), controle per tabel op aantallen (gebouwd).
5. `run()` omgezet (gebouwd: token in plaats van koppelcode op de eigen server); Realtime later.
6. Een week parallel draaien (Sheet leidend, migratie dagelijks herhalen), daarna overstappen (`server/README.md`, stap 5). **Menno.**
7. Fase B (eigen Gmail en Agenda per gebruiker): later; vraagt opslag van refresh-tokens per gebruiker (Supabase Vault) en een aanpassing van `mijnMailbox()`.

## Planning (bijgewerkt 16-10-2026)
Release v6.0 is gebouwd op 16-10-2026 (zie "Wat v6.0 geworden is"); de ingebruikname (accounts, migratie, parallel draaien, overstap) staat in `server/README.md`. De overstap is voorwaarde voor fase 2 van het talentnetwerk (diensten, uren, werkers-app, communicatie), die niet op een Sheet past. De tabellen en kolommen die v4.5–v5.0 toevoegden staan hierboven in het schema (`taken.tijd/herhaling/tags/ouder_id/herinnerd`, `talenten`, `talent_documenten`, `beoordelingen`, `talent_school`, `talent_uren`, `kandidaten.talent_id` enz., `activiteiten.talent_id`, `scholen.lat/lon`); de uitwerking (Edge Functions met de `api*`-namen, `pg_cron` voor de talentrun, de VOG-run en de peiling, Storage voor documenten, talentaccounts met magic link in plaats van portaaltokens) staat in `docs/plan-taken-en-talentnetwerk.md` onder v6.0. Bij de migratie: `Talenten.functies/sectoren/vakken` (JSON-lijst) → `text[]`, `beschikbaarheid`/`uitzonderingen`/`criteria` → `jsonb`, `portaalToken`/`portaalTokenTot` vervallen, `TalentUren_archief` gaat terug in `talent_uren`.
