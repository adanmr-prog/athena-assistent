# Overstap naar Supabase + Vercel (plan)

Status: **gepland**. Het prototype draait op Google Apps Script met een Google Sheet als database. Dat blijft zo tot het CRM inhoudelijk af is. Daarna gaat het naar een snelle stack met een eigen domein. Dit document legt vast hoe we nu bouwen, zodat die overstap later vooral backend-werk is.

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
create table taken        (id text primary key, tekst text not null, bron text, prio text, deadline date, status text default 'open', categorie text, eigenaar_id uuid references gebruikers, school_id text references scholen on delete cascade, persoon_id text references personen on delete set null, kans_id text references kansen on delete set null, track_run_id text, notitie text, link text, aangemaakt timestamptz default now(), afgerond timestamptz, capsule_id text);
create table activiteiten (id text primary key, type text not null, datum timestamptz not null, door_id uuid references gebruikers, school_id text references scholen on delete cascade, persoon_id text references personen on delete set null, kans_id text references kansen on delete set null, traject_id text references trajecten on delete set null, onderwerp text, tekst text, duur_min int, gmail_id text unique, agenda_id text, bron text, aangemaakt timestamptz default now());
create table mijlpalen    (id text primary key, pipeline text not null, mijlpaal text not null, volgorde int, kans int, dagen_norm int, unique (pipeline, mijlpaal));
create table tracks       (id text primary key, naam text not null, omschrijving text, stappen jsonb not null default '[]');
create table doelen       (id text primary key, eigenaar_id uuid references gebruikers on delete cascade, team text, bedrijf boolean default false, periode text, metric text, doel numeric);  -- v4.2: per persoon, team of bedrijf
create table documenten   (id text primary key, drive_id text unique, titel text, type text, school_naam text, url text, gewijzigd timestamptz, woorden int, tekst text, handmatig jsonb);
create table reviews      (id text primary key, eigenaar_id uuid references gebruikers, datum date, gemaakt_op timestamptz, samenvatting text, gedaan jsonb, blijven_liggen jsonb, vandaag jsonb);
create table facturen     (id text primary key, traject_id text references trajecten on delete cascade, omschrijving text, bedrag numeric, datum date, status text, factuurnummer text, bijzonderheden text, exact_id text, aangemaakt timestamptz default now(), door_id uuid references gebruikers);
create table vacatures    (id text primary key, traject_id text references trajecten on delete cascade, titel text, aantal int default 1, dagen text, uren_per_week numeric, start date, eind date, profiel text, status text default 'open', door_id uuid references gebruikers, aangemaakt timestamptz default now());
create table kandidaten   (id text primary key, vacature_id text references vacatures on delete cascade, traject_id text references trajecten, naam text not null, email text, telefoon text, bron text, xps_id text, afas_nummer text, status text not null default 'voorgesteld', status_sinds timestamptz, gesprek timestamptz, notitie text, door_id uuid references gebruikers, aangemaakt timestamptz default now());
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

## Stappen bij de overstap (± 2–3 weken werk)
1. Supabase-project (EU) en Vercel-project aanmaken, domein koppelen. **Menno:** accounts aanmaken en DNS instellen.
2. Schema plus RLS, en Google-login met domeinbeperking.
3. Edge Functions per `api*`-functie, met dezelfde Node-stubtests (ze draaien al in Node).
4. Migratiescript: Sheet naar Postgres (namen naar ids, tags en velden omzetten), daarna een controle per tabel op aantallen.
5. `run()` omzetten, Realtime voor taken en activiteit.
6. Een week parallel draaien (Sheet als back-up, alleen lezen), daarna overstappen.
7. Fase B (eigen Gmail en Agenda) komt hier vanzelf mee: elke gebruiker geeft zelf toestemming bij het inloggen.
