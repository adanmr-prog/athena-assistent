-- Athena Assistent v6.0 — gegenereerd uit TABELLEN in backend/Code.gs met: node server/schema.js --sql
-- Niet met de hand aanpassen: pas Code.gs aan en genereer opnieuw (de test controleert of dit bestand actueel is).

create table if not exists "scholen" (
  "id" text primary key,
  "naam" text,
  "plaats" text,
  "type" text,
  "contactpersoon" text,
  "email" text,
  "telefoon" text,
  "status" text,
  "am" text,
  "notities" text,
  "bijgewerkt" text,
  "bestuur" text,
  "adres" text,
  "website" text,
  "leerlingen" numeric,
  "eigenaar" text,
  "tags" text,
  "velden" text,
  "laatste_contact" text,
  "capsule_id" text,
  "aangemaakt" text,
  "bijgewerkt_door" text,
  "lat" numeric,
  "lon" numeric,
  rij bigserial
);
create table if not exists "trajecten" (
  "id" text primary key,
  "school" text,
  "plaats" text,
  "traject" text,
  "schooljaar" text,
  "start" text,
  "eind" text,
  "status" text,
  "ondersteuners" numeric,
  "uren_per_week" numeric,
  "tarief" numeric,
  "omzet" numeric,
  "contactpersoon" text,
  "am" text,
  "samenvatting" text,
  "bijgewerkt" text,
  "school_id" text,
  "capsule_id" text,
  "bijgewerkt_door" text,
  "kans_id" text,
  "adviseur" text,
  "soort_facturatie" text,
  "gefactureerd" text,
  "factuur_datum" text,
  "vakanties" text,
  "bijzonderheden" text,
  "factuurnummer" text,
  "contactgegevens" text,
  "voorstel_url" text,
  "documenten_url" text,
  "verlenging" text,
  "taskforce" text,
  "xps_project" text,
  "talentscout" text,
  rij bigserial
);
create table if not exists "kansen" (
  "id" text primary key,
  "school" text,
  "traject" text,
  "fase" text,
  "waarde" numeric,
  "volgende_actie" text,
  "deadline" text,
  "laatste_contact" text,
  "eigenaar" text,
  "notities" text,
  "bijgewerkt" text,
  "naam" text,
  "school_id" text,
  "persoon_id" text,
  "pipeline" text,
  "kans" numeric,
  "verwachte_sluiting" text,
  "gesloten" text,
  "verlies_reden" text,
  "tags" text,
  "velden" text,
  "capsule_id" text,
  "aangemaakt" text,
  "bijgewerkt_door" text,
  "am" text,
  rij bigserial
);
create table if not exists "acties" (
  "id" text primary key,
  "tekst" text,
  "bron" text,
  "prio" text,
  "deadline" text,
  "status" text,
  "link" text,
  "aangemaakt" text,
  "afgerond" text,
  "categorie" text,
  "eigenaar" text,
  "school_id" text,
  "persoon_id" text,
  "kans_id" text,
  "track_run_id" text,
  "notitie" text,
  "capsule_id" text,
  "traject_id" text,
  "tijd" text,
  "herhaling" text,
  "bijgewerkt" text,
  "bijgewerkt_door" text,
  "tags" text,
  "ouder_id" text,
  "herinnerd" text,
  rij bigserial
);
create table if not exists "documenten" (
  "id" text primary key,
  "titel" text,
  "type" text,
  "school" text,
  "url" text,
  "drive_id" text,
  "gewijzigd" text,
  "woorden" numeric,
  "tekst" text,
  "bijgewerkt" text,
  rij bigserial
);
create table if not exists "reviews" (
  "id" text primary key,
  "datum" text,
  "gemaakt_op" text,
  "samenvatting" text,
  "gedaan" text,
  "blijven_liggen" text,
  "vandaag" text,
  "eigenaar" text,
  rij bigserial
);
create table if not exists "huisstijl" (
  "sleutel" text primary key,
  "waarde" text,
  rij bigserial
);
create table if not exists "content" (
  "id" text primary key,
  "datum" text,
  "type" text,
  "onderwerp" text,
  "tekst" text,
  "door" text,
  rij bigserial
);
create table if not exists "notities" (
  "id" text primary key,
  "traject_id" text,
  "datum" text,
  "tekst" text,
  rij bigserial
);
create table if not exists "personen" (
  "id" text primary key,
  "voornaam" text,
  "achternaam" text,
  "functie" text,
  "school_id" text,
  "email" text,
  "telefoon" text,
  "linkedin" text,
  "eigenaar" text,
  "tags" text,
  "velden" text,
  "laatste_contact" text,
  "capsule_id" text,
  "aangemaakt" text,
  "bijgewerkt" text,
  "bijgewerkt_door" text,
  rij bigserial
);
create table if not exists "activiteiten" (
  "id" text primary key,
  "type" text,
  "datum" text,
  "door" text,
  "school_id" text,
  "persoon_id" text,
  "kans_id" text,
  "traject_id" text,
  "onderwerp" text,
  "duur_min" numeric,
  "gmail_id" text,
  "agenda_id" text,
  "bron" text,
  "aangemaakt" text,
  "tekst" text,
  "talent_id" text,
  rij bigserial
);
create table if not exists "activiteiten_archief" (
  "id" text primary key,
  "type" text,
  "datum" text,
  "door" text,
  "school_id" text,
  "persoon_id" text,
  "kans_id" text,
  "traject_id" text,
  "onderwerp" text,
  "duur_min" numeric,
  "gmail_id" text,
  "agenda_id" text,
  "bron" text,
  "aangemaakt" text,
  "tekst" text,
  "talent_id" text,
  rij bigserial
);
create table if not exists "mijlpalen" (
  "id" text primary key,
  "pipeline" text,
  "mijlpaal" text,
  "volgorde" numeric,
  "kans" numeric,
  "dagen_norm" numeric,
  rij bigserial
);
create table if not exists "tracks" (
  "id" text primary key,
  "naam" text,
  "omschrijving" text,
  "stappen" text,
  "bijgewerkt" text,
  rij bigserial
);
create table if not exists "gebruikers" (
  "id" text primary key,
  "naam" text,
  "email" text,
  "rol" text,
  "actief" text,
  "bijgewerkt" text,
  "team" text,
  rij bigserial
);
create table if not exists "doelen" (
  "id" text primary key,
  "eigenaar" text,
  "periode" text,
  "metric" text,
  "doel" numeric,
  "bijgewerkt" text,
  rij bigserial
);
create table if not exists "facturen" (
  "id" text primary key,
  "traject_id" text,
  "omschrijving" text,
  "bedrag" numeric,
  "datum" text,
  "status" text,
  "factuurnummer" text,
  "bijzonderheden" text,
  "exact_id" text,
  "aangemaakt" text,
  "bijgewerkt" text,
  "door" text,
  rij bigserial
);
create table if not exists "instellingen" (
  "sleutel" text primary key,
  "waarde" text,
  rij bigserial
);
create table if not exists "vacatures" (
  "id" text primary key,
  "traject_id" text,
  "titel" text,
  "aantal" numeric,
  "dagen" text,
  "uren_per_week" numeric,
  "start" text,
  "eind" text,
  "profiel" text,
  "status" text,
  "aangemaakt" text,
  "door" text,
  "bijgewerkt" text,
  "bijgewerkt_door" text,
  "ingevuld" text,
  rij bigserial
);
create table if not exists "kandidaten" (
  "id" text primary key,
  "vacature_id" text,
  "traject_id" text,
  "naam" text,
  "email" text,
  "telefoon" text,
  "bron" text,
  "xps_id" text,
  "afas_nummer" text,
  "status" text,
  "status_sinds" text,
  "gesprek" text,
  "notitie" text,
  "door" text,
  "aangemaakt" text,
  "bijgewerkt" text,
  "bijgewerkt_door" text,
  "status_historie" text,
  "talent_id" text,
  "start" text,
  "eind" text,
  "functie" text,
  "uren_per_week" numeric,
  "dagen" text,
  "xps_plaatsing_id" text,
  "eind_reden" text,
  rij bigserial
);
create table if not exists "meldingen" (
  "id" text primary key,
  "voor" text,
  "tekst" text,
  "link" text,
  "datum" text,
  "gelezen" text,
  "door" text,
  rij bigserial
);
create table if not exists "talenten" (
  "id" text primary key,
  "voornaam" text,
  "achternaam" text,
  "email" text,
  "telefoon" text,
  "postcode" text,
  "woonplaats" text,
  "lat" numeric,
  "lon" numeric,
  "functies" text,
  "sectoren" text,
  "vakken" text,
  "opleiding" text,
  "bevoegdheid" text,
  "vervoer" text,
  "reisafstand_km" numeric,
  "max_uren_week" numeric,
  "beschikbaar_vanaf" text,
  "beschikbaar_tot" text,
  "beschikbaarheid" text,
  "uitzonderingen" text,
  "beschikbaarheid_bevestigd" text,
  "laatste_peiling" text,
  "contractvorm" text,
  "status" text,
  "status_sinds" text,
  "bron" text,
  "xps_id" text,
  "afas_nummer" text,
  "tags" text,
  "velden" text,
  "toestemming_datum" text,
  "toestemming_grondslag" text,
  "bewaren_tot" text,
  "portaal_token" text,
  "portaal_token_tot" text,
  "notitie" text,
  "laatste_contact" text,
  "door" text,
  "aangemaakt" text,
  "bijgewerkt" text,
  "bijgewerkt_door" text,
  rij bigserial
);
create table if not exists "talent_documenten" (
  "id" text primary key,
  "talent_id" text,
  "soort" text,
  "afgifte" text,
  "geldig_tot" text,
  "drive_id" text,
  "gecontroleerd_door" text,
  "gecontroleerd_op" text,
  "status" text,
  "notitie" text,
  "door" text,
  "aangemaakt" text,
  "bijgewerkt" text,
  rij bigserial
);
create table if not exists "beoordelingen" (
  "id" text primary key,
  "talent_id" text,
  "kandidaat_id" text,
  "traject_id" text,
  "school_id" text,
  "door" text,
  "rol" text,
  "datum" text,
  "oordeel" text,
  "criteria" text,
  "tekst" text,
  "zichtbaarheid" text,
  "wederhoor" text,
  "aangemaakt" text,
  "bijgewerkt" text,
  rij bigserial
);
create table if not exists "talent_school" (
  "id" text primary key,
  "talent_id" text,
  "school_id" text,
  "status" text,
  "richting" text,
  "reden" text,
  "door" text,
  "datum" text,
  rij bigserial
);
create table if not exists "talent_uren" (
  "id" text primary key,
  "talent_id" text,
  "xps_id" text,
  "xps_project" text,
  "traject_id" text,
  "week" text,
  "uren" numeric,
  "diensten" numeric,
  "no_shows" numeric,
  "late_afmeldingen" numeric,
  "geimporteerd" text,
  rij bigserial
);
create table if not exists "talent_uren_archief" (
  "id" text primary key,
  "talent_id" text,
  "xps_id" text,
  "xps_project" text,
  "traject_id" text,
  "week" text,
  "uren" numeric,
  "diensten" numeric,
  "no_shows" numeric,
  "late_afmeldingen" numeric,
  "geimporteerd" text,
  rij bigserial
);
create table if not exists "aanmeldingen" (
  nr bigserial primary key,
  "tijdstempel" text,
  "voornaam" text,
  "achternaam" text,
  "telefoon" text,
  "email" text,
  "postcode" text,
  "functies" text,
  "sector" text,
  "beschikbaarheid" text,
  "toestemming" text,
  "verwerkt" text,
  "talent_id" text,
  rij bigserial
);
-- scripteigenschappen (PropertiesService) en de korte cache (CacheService)
create table if not exists eigenschappen (sleutel text primary key, waarde text);
create table if not exists cache (sleutel text primary key, waarde text, verloopt timestamptz);
create index if not exists "ix_activiteiten_school_id" on "activiteiten" ("school_id");
create index if not exists "ix_activiteiten_persoon_id" on "activiteiten" ("persoon_id");
create index if not exists "ix_activiteiten_talent_id" on "activiteiten" ("talent_id");
create index if not exists "ix_activiteiten_datum" on "activiteiten" ("datum");
create index if not exists "ix_acties_status" on "acties" ("status");
create index if not exists "ix_acties_eigenaar" on "acties" ("eigenaar");
create index if not exists "ix_kandidaten_traject_id" on "kandidaten" ("traject_id");
create index if not exists "ix_kandidaten_talent_id" on "kandidaten" ("talent_id");
create index if not exists "ix_talent_uren_talent_id" on "talent_uren" ("talent_id");
create index if not exists "ix_personen_school_id" on "personen" ("school_id");
create index if not exists "ix_kansen_school_id" on "kansen" ("school_id");
-- Row Level Security aan zonder policies: alleen de service role (de server) kan erbij; de app praat nooit rechtstreeks met Postgres.
alter table "scholen" enable row level security;
alter table "trajecten" enable row level security;
alter table "kansen" enable row level security;
alter table "acties" enable row level security;
alter table "documenten" enable row level security;
alter table "reviews" enable row level security;
alter table "huisstijl" enable row level security;
alter table "content" enable row level security;
alter table "notities" enable row level security;
alter table "personen" enable row level security;
alter table "activiteiten" enable row level security;
alter table "activiteiten_archief" enable row level security;
alter table "mijlpalen" enable row level security;
alter table "tracks" enable row level security;
alter table "gebruikers" enable row level security;
alter table "doelen" enable row level security;
alter table "facturen" enable row level security;
alter table "instellingen" enable row level security;
alter table "vacatures" enable row level security;
alter table "kandidaten" enable row level security;
alter table "meldingen" enable row level security;
alter table "talenten" enable row level security;
alter table "talent_documenten" enable row level security;
alter table "beoordelingen" enable row level security;
alter table "talent_school" enable row level security;
alter table "talent_uren" enable row level security;
alter table "talent_uren_archief" enable row level security;
alter table "aanmeldingen" enable row level security;
alter table "eigenschappen" enable row level security;
alter table "cache" enable row level security;
