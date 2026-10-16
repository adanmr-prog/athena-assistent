# Athena Assistent — backend (Google Apps Script)

De app (`index.html`) praat met één Apps Script-web-app. Die bewaart alles in een Google Sheet, leest documenten uit een Drive-map,
kijkt in Gmail en Agenda van het account waaronder hij draait, en gebruikt de Claude API voor vragen en teksten.
Draai hem onder het werkaccount (`menno.adan@athenastudies.nl`), dan ziet hij de juiste mail, agenda en Drive.

## Installatie (eenmalig, ±15 minuten)

1. Ga naar https://script.google.com, maak een nieuw project, noem het `Athena Assistent`.
2. Vervang de inhoud van `Code.gs` door het bestand `Code.gs` uit deze map. Sla op.
3. **Scripteigenschappen** (Projectinstellingen → Scripteigenschappen → Eigenschap toevoegen):

   | Eigenschap | Waarde | Verplicht |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | API-sleutel van console.anthropic.com | voor vragen, teksten en de geschreven ochtendsamenvatting |
   | `RAPPORT_EMAIL` | adres waar de nachtelijke review naartoe moet | nee (zonder: alleen in de app) |
   | `NAAM` | voornaam in de begroeting (standaard `Menno`) | nee |
   | `CLAUDE_MODEL` | standaard `claude-opus-5-5` | nee |
   | `BREIN_MODEL` | model van de Brein-assistent, standaard `claude-sonnet-5-5` | nee |
   | `BREIN_EFFORT` | effort van de Brein-assistent: `low`, `medium` (standaard), `high` | nee |
   | `OFFERTE_SJABLOON_ID` | id van het Google Doc dat als offertesjabloon dient (zie Brein-assistent) | nee (zonder: een nieuw Doc in de huisstijl) |
   | `CLAUDE_EFFORT` | `low`, `medium` (standaard), `high` | nee — `low` als antwoorden te lang duren |
   | `CAPSULE_TOKEN` | API-token uit Capsule (My Preferences → API Authentication Tokens) | alleen voor de eenmalige Capsule-migratie; daarna verwijderen |
   | `APP_URL` | de app-URL in mails (v4.6); standaard de GitHub Pages-URL | nee |
   | `EXEC_URL` | de `/exec`-URL voor de portaallinks in mails aan talenten (v5.0); zonder deze eigenschap leest de backend hem zelf uit | nee |

   `CODES` (koppelcodes van accountmanagers), `CAPSULE_MIJLPALEN`, `LAATSTE_CRM_SYNC`, `CAPSULE_MIGRATIE` en (v5.0) `TALENT_MAP_ID`, `XPS_EXPORT_MAP_ID`, `LAATSTE_URENIMPORT` en `VOG_RUN_<schooljaar>_<datum>` zet de backend zelf; niet met de hand aanpassen.

4. Kies bovenin de functie `setup` en klik **Uitvoeren**. Geef de gevraagde rechten (Sheets, Drive, Gmail, Agenda, externe verbindingen).
   De log toont drie dingen: de URL van de Sheet, de URL van de documentenmap en de **koppelcode**. Bewaar die koppelcode.
   `setup()` maakt ook de triggers aan: documenten inlezen (04:00), de nachtelijke review (05:00), (v2.0) elk uur mail en agenda aan het CRM koppelen, (v4.6) elk kwartier de herinneringsmail bij taken met een tijd en (v5.0) de dagelijkse talentrun (06:30: VOG, peiling, slapend, bewaartermijn, geocoderen, aanmeldingen) en op maandag (06:00) de weekexport uit XPS. `setup()` maakt sinds v5.0 ook de Drive-submappen `Talent` en `XPS-export` aan. Bestaande installatie na v4.6 of v5.0: één keer `setup()` draaien onder het account van de eigenaar, anders ontbreken de nieuwe triggers (het instellingenscherm in de app meldt dat).
   Bestaande installatie bijwerken naar v2.0: plak de nieuwe `Code.gs`, draai `setup()` één keer opnieuw (maakt de nieuwe tabbladen en kolommen,
   zet contactpersonen en notities over, installeert de uurlijkse trigger) en implementeer een nieuwe versie.
5. Optioneel: **Services → + → Drive API** toevoegen. Dan leest de index ook de tekst uit PDF's en Word-bestanden (met OCR).
   Zonder deze service worden die bestanden alleen op titel geïndexeerd. Zet je hem later aan (v4.4.4), implementeer dan een nieuwe versie:
   de volgende index (elke nacht om 4 uur, of direct via Assistent → Documenten inlezen) leest de PDF's en Word-bestanden zonder tekst één keer opnieuw.
   Dat gaat in delen van hooguit 4 minuten per run; bij veel bestanden duurt het een paar runs.
6. **Implementeren → Nieuwe implementatie → Web-app**: uitvoeren als *Ik*, toegang *Iedereen*. Kopieer de `/exec`-URL.
7. Open de app (https://adanmr-prog.github.io/athena-assistent/ zodra GitHub Pages aanstaat), vul de `/exec`-URL en de koppelcode in. Klaar.
8. Optioneel: draai `vulVoorbeelddata` één keer om de app gevuld te zien met fictieve scholen. Verwijder de rijen daarna in de Sheet.

Bij elke wijziging in `Code.gs`: Implementeren → Implementaties beheren → potlood → Versie: *Nieuwe versie* → Implementeren. De URL blijft gelijk.
Kies in de editor `controleer` in de keuzelijst naast **Uitvoeren** (de editor onthoudt de laatst gekozen functie; een andere functie zonder argumenten geeft een foutmelding). `controleer()` (v4.4.1) past niets aan en logt de versie, de sleutels, het aantal rijen per tabblad en de triggers, en meldt welke trigger ontbreekt. Een nieuwe `Code.gs` hoef je meestal niet te draaien: nieuwe tabbladen en kolommen komen vanzelf. Alleen als een release een nieuwe trigger of migratie noemt, draai je `setup()` één keer, onder het account van de eigenaar (triggers horen bij dat account; `setup()` onder een tweede account laat alles dubbel draaien).

## Wat er waar staat

- **Sheet `Athena Assistent — data`**, tabbladen: `Scholen`, `Trajecten`, `Kansen`, `Acties`, `Documenten`, `Reviews`, `Huisstijl`, `Content`, `Notities`,
  voor het CRM (v2.0) `Personen`, `Activiteiten`, `Mijlpalen`, `Tracks`, `Gebruikers`, `Doelen`, en voor het talentnetwerk (v5.0) `Talenten`, `TalentDocumenten`, `Beoordelingen`, `TalentSchool`, `TalentUren` (+ `TalentUren_archief`) en `Aanmeldingen`.
  Je mag rijen direct in de Sheet bewerken; de eerste rij is de kolomkop en moet blijven staan. Kolom `id` is de sleutel.
  Nieuwe kolommen komen altijd achteraan; `blad()` vult een oude kop automatisch aan. Verschuif dus nooit kolommen in de Sheet.
- **Drive-map `Athena Assistent — documenten`** met submappen `Contracten`, `Werkwijzen`, `Schooldossiers`, `Voorstellen`, `Prijslijst`.
  Alles wat hierin staat (ook in diepere submappen) wordt geïndexeerd; de submapnaam bepaalt het type. Google Docs, Sheets, tekst en (met Drive API) PDF/Word.
  Zet in een schooldossier de schoolnaam in de titel of de eerste alinea; dan koppelt Athena het document aan het traject.
  Sinds v5.0 staan er ook de submappen `Talent` (per talent een submap met zijn documenten, zoals de VOG; alleen delen met het talentteam) en `XPS-export` (de weekexport uit XPS). De indexeerder slaat die twee over: ze horen niet in de kennisbank.
- **Scripteigenschappen** bevatten de sleutels en ids; nooit in de Sheet.

## Contract met de app

`POST <exec-url>?app=1`, body `JSON.stringify({ fn, args: [...], secret })`, geen headers (Apps Script beantwoordt geen CORS-preflight).
Antwoord `{ ok: true, result }` of `{ ok: false, fout }`; `fout === 'secret'` betekent: koppelcode klopt niet.

| fn | args | result |
|---|---|---|
| `apiOverzicht` | — | `{ datum, groet, kpi:{trajecten,kansen,scholen,omzet,schooljaar,pijplijn}, focus:[actie], aandacht:[actie], mails:[{onderwerp,van,dagen,link}], agenda:[{tijd,titel,duurMin}], kansen:[kans] }` |
| `apiActieKlaar` | id | `{ id, status: 'af', afgerond, volgende: taak\|null, ouderKlaar }` (v4.5: `volgende` is de nieuwe instantie van een herhalende taak; alleen eigen taken of die van je team; v4.6: open subtaken gaan mee af, `ouderKlaar` = dit was de laatste open subtaak) |
| `apiActieToevoegen` | tekst, prio, deadline, extra? `{tijd, herhaling, categorie, eigenaar, schoolId, persoonId, kansId, trajectId, notitie}` | taak (v4.5: intern `apiTaakOpslaan` met `bron: 'handmatig'`; de oude aanroep met drie argumenten blijft werken) |
| `apiKennisbank` | — | `{ tellingen, documenten:[{id,titel,type,school,url,gewijzigd,woorden}], laatsteIndex, mapUrl }` |
| `apiIndexeer` | — | `{ aantal, nieuw, bijgewerkt, verwijderd }` |
| `apiVraag` | vraag | `{ antwoord, bronnen:[{titel,url,type}] }` (oud; de app gebruikt sinds v3.5 `apiBrein`) |
| `apiBrein` | bericht, gesprek:[{rol:'ik'\|'bot', tekst}] | `{ antwoord, bronnen, acties:[{id, soort, titel, invoer}] }` |
| `apiBreinUitvoeren` | {soort, invoer} | `{ melding, url? }` |
| `apiReview` | — | `{ laatste: review, eerdere:[{id,datum,gemaaktOp,samenvatting,tellingen}] }` |
| `apiReviewNu` | — | review (`{id,datum,gemaaktOp,samenvatting,gedaan,blijvenLiggen,vandaag,tellingen}`) |
| `apiHuisstijl` | — | `{ velden, kleuren, toon, zinnen, types, recent }` |
| `apiZetHuisstijl` | sleutel, waarde | null |
| `apiMaakContent` | type, onderwerp, extra | `{ id, datum, type, typeNaam, onderwerp, tekst }` |
| `apiTrajecten` | — | `{ trajecten:[traject+{updates, laatsteUpdate, magWijzigen}], gebruikers, am, ik, filters:{schooljaren,trajecten,statussen,verlenging} }` (v4.0: alleen projecten die je mag zien) |
| `apiTraject` | id | `{ traject, documenten, notities, kansen, school }` |
| `apiTrajectOpslaan` | object (met of zonder id) | traject |
| `apiNotitieToevoegen` | trajectId, tekst | `{ id, datum, tekst }` |
| `apiImporteer` | tabel, rijen | `{ ingevoegd, bijgewerkt, ongewijzigd }` |
| `apiStatus` | — | status van de installatie (v2.0: ook `gebruiker`, `crmSyncTrigger`, `laatsteCrmSync`, `capsuleToken`, `capsuleMigratie`; v4.6: `herinneringTrigger`, `herinneringen`, `email`; v5.0: `talentTrigger`, `urenTrigger`, `xpsExportMap`, `laatsteUrenImport`) |

### CRM (v2.0, module Relaties)

| fn | args | result |
|---|---|---|
| `apiCrm` | — | `{ ik:{naam,team,rol,beheer,gekoppeld,rechten}, teams:{consultancy,accountmanagement,talent,management}, gebruikers, statussen, mijlpalen, categorieen, activiteitTypes, tracks, tags, scholen:[school+{personen,openKansen,openWaarde}], personen:[persoon], kansenKort:[{id,naam,school,schoolId}] (v4.5, voor het kansveld in het taakvenster) }` |
| `apiSchool` | id | `{ school, personen, kansen, trajecten, taken, tijdlijn:[activiteit], documenten }` |
| `apiSchoolOpslaan` | object (met of zonder id) | school |
| `apiPersoon` | id | `{ persoon, school, kansen, taken, tijdlijn }` |
| `apiPersoonOpslaan` | object | persoon |
| `apiKans` | id | `{ kans, mijlpalen, school, persoon, personen, taken, tijdlijn }` |
| `apiKansOpslaan` | object, maakTraject | `{ kans, traject }` (mijlpaalwissel wordt gelogd; `gewonnen` + maakTraject maakt een actief traject) |
| `apiPipeline` | — | `{ mijlpalen, pipelines, kansen, verliesRedenen }` (open kansen + gesloten in de laatste 60 dagen) |
| `apiMijlpalenOpslaan` | `[{pipeline,mijlpaal,kans,dagenNorm}]` | mijlpalen (alleen beheerder) |
| `apiActiviteitToevoegen` | `{type:notitie\|gesprek\|mail\|afspraak, schoolId?, persoonId?, kansId?, onderwerp, tekst, datum?, duurMin?}` | activiteit |
| `apiAfspraakPlannen` | `{titel, start:'yyyy-MM-ddTHH:mm', duurMin, locatie, notitie, uitnodigen, schoolId?, persoonId?, kansId?}` | activiteit (zet ook een afspraak in Google Agenda) |
| `apiTaken` | — | `{ taken:[taak], categorieen, gebruikers, tracks, tags, weergaven, herinneringen }` (open + afgerond in de laatste 14 dagen; v4.6: `tags` in gebruik, de opgeslagen weergaven en de herinneringsinstelling van deze gebruiker) |
| `apiTaakOpslaan` | object (`TAAK_VELDEN`; v4.5 ook `tijd` `HH:mm`, `herhaling` als object, `bron` alleen bij nieuw; v4.6 `tags` als kommatekst en `ouderId` van de hoofdtaak) | taak (afvinken gaat via `apiActieKlaar`; een bestaande taak alleen als hij van jou of je team is; toewijzen aan een ander geeft die persoon een melding) |
| `apiTaak` (v4.5) | id | taak (van jou of je team, of gekoppeld aan een zichtbaar project of een zichtbare kans) |
| `apiTaakWeergavenOpslaan` (v4.6) | `[{naam, filter:{mijn, schoolId, trajectId, categorie, tag, prio, weergave}}]` (max. 12; vervangt de hele lijst) | de opgeschoonde lijst |
| `apiHerinneringenZetten` (v4.6) | aan (boolean) | `{ aan }` |
| `apiTrackOpslaan` | `{id?, naam, omschrijving, stappen:[{tekst,categorie,dagenNaStart,prio}]}` | tracks (alleen beheerder) |
| `apiTrackStart` | trackId, `{schoolId?,persoonId?,kansId?}`, startdatum, eigenaar | `{ aantal, track }` |
| `apiRapport` | preset (zie `apiTeamRapport`), eigenaar?, stap? (v4.4) | `{ team, perPersoon:[{naam,cijfers,doelen}], totaal, forecast, trechter, winst, redenen, stil, ... }` |
| `apiDoelen` / `apiDoelOpslaan` | — / `{eigenaar, periode, metric, doel}` | `{ doelen, metrics, periodes, gebruikers }` |
| `apiGebruikers` / `apiGebruikerOpslaan` | — / object, nieuweCode | gebruikers / `{ gebruiker, code }` (code alleen bij nieuw of nieuweCode; alleen beheerder) |
| `apiCrmSync` | — | `{ mails, afspraken, bijgewerkt }` |
| `apiCrmInrichten` | — | `{ personen, kansen, trajecten, notities, eigenaren }` (oude velden overzetten; idempotent) |
| `apiCapsuleMigratie` | stap, pagina | `{ stap, aantal, volgende:{stap,pagina}\|null }` (de app roept herhaald aan tot `volgende` null is) |
| `apiHome` | — | `{ groet, datum, ik, taken:[taak], agenda:[{id,sleutel,titel,start,eind,heleDag,locatie}], pipeline:{open,waarde,gewogen,stil}, recent:[activiteit], mails, afgerondWeek, streak }` (v3.0, desktop-Home; v4.6: eigen taken afgerond deze week en het aantal werkdagen op rij met minstens één afgevinkte taak) |
| `apiActiviteiten` | door, van, tot, team? | `{ door, totaal, perType, tijdlijn }` (v3.3; niet-beheerders krijgen altijd hun eigen activiteit; v4.4: met `team` zonder `door` alleen de activiteit van dat team) |
| `apiArchiefTijdlijn` | `school\|persoon\|kans`, id | `[activiteit]` uit `Activiteiten_archief` (v3.3) |
| `apiArchiveer` | — | `{ gearchiveerd, over }` (v3.3, alleen beheerder; draait ook elke 1e van de maand) |
| `apiHomeMails` | — | `[{onderwerp,van,dagen,link}]` (v3.2: los van `apiHome`, omdat Gmail traag is; `apiHome` geeft `mails: []`) |
| `apiAgenda` | van, tot (`yyyy-MM-dd`, max. 62 dagen) | `{ van, tot, events:[google-afspraak (+schoolId/school als hij aan het CRM hangt)], afspraken:[activiteit], taken:[taak] }` (v3.0) |
| `apiExport` | `scholen\|personen\|kansen\|activiteiten\|taken\|trajecten` (v5.0, alleen management: `talenten\|beoordelingen\|talenturen`) | `{ bestandsnaam, csv }` |
| `apiVerwijder` | `school\|persoon\|kans\|activiteit\|taak\|traject\|notitie\|content\|doel` (v5.0: `talent\|beoordeling\|talentdocument\|talentschool`), id, opties? `{agenda: true}` of `{metSubtaken: true}` | null (school alleen zonder personen en kansen; eigenaar of beheerder; `agenda` haalt een afspraak ook uit Google Agenda; v4.6: bij een taak gaan de subtaken mee met `metSubtaken`, anders worden ze losse taken; v5.0: een talent alleen zonder lopende inzet, zie Talentnetwerk) |
| `apiProject` (v3.8) | id | `{ project, school, kans, personen, taken, tijdlijn (incl. historie van de kans), losseMails, facturen (null zonder facturatierecht), keuzes, rechten:{wijzigen,facturatie,facturatieWijzigen} }` |
| `apiFacturatie` | — | `{ projecten (+facturen), keuzes, gebruikers, ik }` |
| `apiFactuurOpslaan` / `apiFacturenMaken` | `{id?, trajectId, omschrijving, bedrag, datum, status, factuurnummer, bijzonderheden, _oud?}` / trajectId, `{per: 'maand'\|'eenmalig', van, tot, bedrag, zomer}` | termijn / termijnen van het project |
| `apiFacturenExport` | status (standaard `aangemaakt`) | `{ bestandsnaam, csv, aantal }` (puntkomma-CSV voor import in Exact) |
| `apiSchoolSamenvatting` | schoolId | `{ tekst }` (AI-samenvatting met `BREIN_MODEL`) |
| `apiActiviteitOpslaan` (v3.7) | `{id, type?, datum?, onderwerp?, tekst?, duurMin?, schoolId?, persoonId?, kansId?, trajectId?, _oud}` | activiteit + `agendaBijgewerkt` (afspraak ook in Google Agenda verzet/hernoemd) |
| `apiTaakHeropen` | id | taak (v4.5: alleen eigen taken of die van je team; de heropende instantie verliest haar `herhaling`, anders ontstaan twee open instanties) |
| `apiTrackStoppen` / `apiTrackVerwijderen` | trackRunId / trackId | `{aantal}` / tracks |
| `apiInstellingen` / `apiKeuzelijstOpslaan` | — / sleutel (`schoolStatussen\|taakCategorieen\|trajectStatussen`; v5.0 ook `talentFuncties\|sectoren\|vakken\|documentSoorten\|contractvormen\|beoordelingsCriteria\|talentBronnen`), `[{waarde, oud}]` | `{schoolStatussen, taakCategorieen, trajectStatussen, …}`; hernoemde waarden gaan mee in bestaande rijen (v5.0: ook in JSON-lijsten zoals `Talenten.functies` en in de sleutels van `Beoordelingen.criteria`) |
| `apiVelden` / `apiTagHernoem` / `apiVeldHernoem` | — / oud, nieuw (leeg = weg) | `{tags, velden}` / `{aantal}` (v4.6: tags ook op `Acties`) |
| `apiHuisstijlOpslaan` | `{veld: waarde, …}` | zoals `apiHuisstijl` (+ `magBewerken`) |
| `apiContentOpslaan` | `{id, onderwerp?, tekst?}` | content |
| `apiDocumentOpslaan` | id, `{type?, school?}` | document; de correctie blijft bij het volgende inlezen (Instellingen `documentCorrecties`) |

Een `kans` heeft sinds v2.0 ook `naam, schoolId, persoonId, pipeline, kans, gewogen, verwachteSluiting, gesloten, verliesReden, eigenaar, tags, stil`
(`stil` = langer geen contact dan `dagenNorm` van de mijlpaal). Een `taak` is een `actie` plus `categorie, eigenaar, status, schoolId, persoonId, kansId, school, persoon, kans` en sinds v4.5 `tijd, herhaling, bijgewerkt`.

## Op Vercel + Supabase (v6.0)

Dezelfde `Code.gs` kan ook draaien op Vercel met Supabase Postgres als database en inloggen met Google; installatie en overstap staan in `server/README.md`. Wat Code.gs 6.0 daarvoor nieuw heeft:

| fn | args | result |
|---|---|---|
| `apiExportAlles` | tabel (een tabblad uit `TABELLEN`, of `eigenschappen`), vanaf?, aantal? (max. 500) | `{ tabel, vanaf, rijen, totaal, volgende }` (alleen management; `eigenschappen` geeft de scripteigenschappen zonder `ANTHROPIC_API_KEY` en `CAPSULE_TOKEN`). Bron van `server/migratie.js` |

- `wieIs()` kijkt eerst naar `SERVER_LOGIN` (alleen gezet door de server, na controle van het Supabase-token) en zoekt die gebruiker met `gebruikerVanEmail`: de eigenaar via de eigenschap `EIGENAAR_EMAIL`, anderen via `Gebruikers.email`; inactief of onbekend geeft `fout: 'secret'`. Op Apps Script bestaat `SERVER_LOGIN` niet en werkt alles zoals altijd.
- Plak Code.gs 6.0 en implementeer als nieuwe versie vóór je de migratie draait; verder verandert er niets aan de Apps Script-installatie.

## Talentnetwerk fase 1 (v5.0)

Eén profiel per flexkracht (ondersteuners, studentdocenten, huiswerkbegeleiders, examentrainers, NT2-ondersteuners, surveillanten) met beschikbaarheid, documenten en VOG per schooljaar, relaties met scholen, beoordelingen en de weekuren uit XPS. Het talentteam stelt gericht voor met een uitlegbare matchscore; de accountmanager beoordeelt per plaatsing. Plaatsing, contract, rooster en uren blijven in XPS tot fase 2 (Supabase, v6.1+). Ontwerp: `docs/plan-taken-en-talentnetwerk.md`; proces en rechten: `docs/teams-en-processen.md`.

| fn | args | result |
|---|---|---|
| `apiTalenten` | filter? `{zoek, functie, sector, status, vog}` | `{ talenten:[talent], ik, keuzes, tellingen:{totaal,actief,slapend,aangemeld,gescreend,vogGroen,compleet}, rechten:{wijzigen,vol,beheer}, scholen:[{id,naam,lat,lon}], benaderen:[{talentId,naam,redenen}] }` (talentteam en management alles; een accountmanager alleen de talenten uit zijn projecten, als beperkt profiel) |
| `apiTalent` | id | `{ talent (+compleetheid, vog), documenten, beoordelingen, scholen, plaatsingen:[kandidaatrij + school/traject/vacature + magBeoordelen], uren (12 weken), tijdlijn, keuzes, rechten:{wijzigen,vol,beoordelen,beheer} }` (beperkt profiel: geen documenten, uren, tijdlijn, postcode of notitie) |
| `apiTalentOpslaan` | object (`TALENT_VELDEN`, met of zonder id, `_oud`, `forceer`) | talent (+ `waarschuwing` bij contractvorm zzp). Nieuw profiel: `toestemmingDatum` verplicht, status `aangemeld`, `bewarenTot` = toestemming + `bewaartermijnMaanden`. Zelfde e-mail of telefoon als een bestaand profiel → fout `… [talent:<id>]`, tenzij `forceer`. Een gewijzigde postcode wordt via PDOK geocodeerd (buiten de lock) |
| `apiTalentBeschikbaarheidOpslaan` | talentId, raster `{ma:[o,m,a],…}` (2 ja, 1 liever niet, 0 nee), uitzonderingen `[{van,tot,soort:'niet'\|'wel',reden}]` | talent (zet `beschikbaarheidBevestigd`) |
| `apiTalentPortaalLink` | id, mailen? | `{ link, bevestigLink, tot, gemaild }` (nieuw token, 90 dagen; `mailen` stuurt meteen de peilingmail) |
| `apiTalentDocumentOpslaan` | `{id?, talentId, soort, afgifte, geldigTot, status, notitie, gecontroleerd}`, bestand? `{naam, mime, base64}` (≤ 8 MB) | `{ document, vog }` (het bestand gaat naar Drive `Talent/<talentId>`; de Sheet bewaart alleen het id; een VOG heeft een afgiftedatum nodig) |
| `apiTalentDocumentLink` | documentId | `{ url }` (alleen talentteam en management; elke inzage komt op de tijdlijn van het talent) |
| `apiTalentSchoolOpslaan` | `{talentId, schoolId, status: favoriet\|neutraal\|niet meer, richting: school\|talent, reden}` | relaties van het talent (upsert op talent, school en richting) |
| `apiBeoordelingOpslaan` | `{id?, talentId, kandidaatId?, trajectId?, schoolId?, oordeel: favoriet\|goed\|niet geschikt, criteria:{criterium: 1..3}, tekst, zichtbaarheid, wederhoor, _oud}` | `{ beoordeling, voorstelNietMeer:{schoolId, school}\|null }` (de accountmanager alleen bij een plaatsing in een eigen project vanaf klaar voor start; het talentteam ook los en met `wederhoor`; `niet geschikt` meldt het talentteam) |
| `apiMatch` | vacatureId | `{ vacature, project, functie, sector, roosterHerkend, dagdelen, kandidaten:[{talentId,naam,score,onderdelen:[{naam,punten,max,uitleg}],waarschuwingen,vog,afstandKm,vastGezicht,alVoorgedragen,…}] (top 25), totaal, uitgesloten:[{talentId,naam,reden}] }` (alleen talentteam en management) |
| `apiVoorstellen` | vacatureId, talentIds, notitie | bezetting van het project + `aantal`, `overgeslagen` (per talent een kandidaatrij `voorgesteld` met `talentId`; één melding aan de accountmanager) |
| `apiTalentUrenImport` | — | `{ bestanden, regels, weken, onbekend:[{xpsId,email,naam}], kandidatenBijgewerkt, overgeslagen }` (leest de bestanden in `XPS-export` die nieuwer zijn dan de laatste import; ook de trigger op maandag) |
| `apiTalentRapport` | preset (`week\|maand\|kwartaal\|halfjaar\|jaar\|schooljaar`), stap | `{ cijfers:{aanmeldingen,gescreend,voordrachten,plaatsingen,beoordelingen,beoordelingGem,reactiePeiling}, vergelijk, reeks, pool, actief, vogGroen, vogCompliance, compleet, dekking:[{functie,totaal,dagdelen}], perSector }` |
| `apiTalentExport` / `apiTalentAnonimiseer` | id | `{ bestandsnaam, csv }` (inzage: profiel, documenten, beoordelingen, relaties, uren, tijdlijn) / talent (naam "Verwijderd profiel", contact, postcode, notitie en documenten leeg, Drive-submap naar de prullenbak; uren en beoordelingen blijven zonder naam). Alleen management |
| `apiTalentRunNu` | — | `{ vog, peiling, slapend, bewaartermijn, geocoderen, aanmeldingen }` (de dagelijkse run met de hand; alleen management) |
| `apiPortaalToon` / `apiPortaalBeschikbaarheid` | token / token, raster, uitzonderingen, alleenBevestigen | `{ naam, functies, beschikbaarheid, uitzonderingen, beschikbaarheidBevestigd, bedrijf, dagen, dagdelen }` / `{ ok, beschikbaarheidBevestigd, beschikbaarheid, uitzonderingen, weerActief }` (alleen via `portaal`, zie onder) |

- **Nieuwe tabbladen** (`TABELLEN`): `Talenten` (profiel; `functies`, `sectoren`, `vakken` als JSON-lijst, `beschikbaarheid` als JSON-raster, `uitzonderingen` als JSON-lijst, `portaalToken`/`portaalTokenTot`, `toestemmingDatum`/`toestemmingGrondslag`/`bewarenTot`), `TalentDocumenten` (metadata; het bestand staat in Drive), `Beoordelingen` (`rol` am|talent, `oordeel`, `criteria` als JSON-object, `wederhoor`), `TalentSchool` (relatie per richting), `TalentUren` (weekaggregaten per talent, week en XPS-project; ouder dan 26 weken gaat elke 1e van de maand naar `TalentUren_archief`) en `Aanmeldingen`. Bestaande tabbladen achteraan: `Kandidaten` + `talentId, start, eind, functie, urenPerWeek, dagen, xpsPlaatsingId, eindReden`; `Activiteiten` + `talentId`; `Scholen` + `lat, lon`. Nieuwe kandidaatstatussen `geplaatst`, `afgerond`, `gestopt` (de laatste twee eisen `eindReden`); `klaar voor start` en `geplaatst` tellen als gevulde plek. Bewust afwezig: BSN, kopie identiteitsbewijs, IBAN, geboortedatum, tarief, contract-pdf en gezondheid.
- **Keuzelijsten** in `Instellingen`: `talentFuncties`, `sectoren`, `vakken`, `documentSoorten`, `contractvormen`, `beoordelingsCriteria`, `talentBronnen`; `kandidaatBronnen` kent nu `talentbestand`. Instellingen met een standaard: `bewaartermijnMaanden` (24), `peilingDagen` (49), `vogMaandenGeldig` (6), `xpsKolommen` (zie XPS). Statussen van een talent (`aangemeld`, `gescreend`, `actief`, `slapend`, `uitgeschreven`) staan vast in de code.
- **Rechten:** `RECHTEN.talenten` en `RECHTEN.beoordelingen`: talentteam alles; accountmanagement `eigen` = het talent is kandidaat in een project dat ik mag zien (dan een beperkt profiel en beoordelen per plaatsing); consultancy niets; management alles. `apiMatch` en `apiVoorstellen` doet alleen het talentteam (of het management). Het team `extern` bestaat alleen voor het portaalprofiel en is niet te kiezen voor echte gebruikers.
- **Matching** (`matchVacature`): eerst harde filters met reden (niet actief, relatie `niet meer`, tag `niet-inzetten`, functie of sector past niet, `nee` op een vereist dagdeel, uitzondering over de start, dubbele boeking, te ver), daarna een score tot 100 met uitleg per onderdeel: rol 25, relatie met de school 20 (favoriet of eerder geplaatst = "vast gezicht"), beschikbaarheid 15 (× 0,6 als die langer dan acht weken niet bevestigd is), afstand 15 (haversine op lat/lon), betrouwbaarheid 10 (no-shows en late afmeldingen uit `TalentUren`, 90 dagen), beoordeling en VOG 10, voorkeur 5. Het rooster van de vacature (`dagen`, bijvoorbeeld "ma t/m do 9:00-13:00") wordt naar dagdelen vertaald; niet herkend → beschikbaarheid neutraal. Mens in de lus: de score sluit niemand uit en voordragen doet het talentteam zelf.
- **VOG per schooljaar** (`vogStatus`): `groen` als de nieuwste VOG op de peildatum (vandaag, of de start van het schooljaar als die later is) jonger is dan `vogMaandenGeldig`; `oranje` als alleen een lopende inzet nog gedekt is door een VOG die bij de start jong genoeg was; anders `verlopen` of `ontbreekt`. `vogRun` mailt op 1 mei en 1 juni iedereen die volgend schooljaar niet op groen staat en zet één verzameltaak voor het talentteam (idempotent via `VOG_RUN_<schooljaar>_<datum>`). De dagstart meldt een verlopen of ontbrekende VOG bij een voordracht of lopende inzet.
- **Dagelijkse run** `talentDagelijksTrigger` (06:30, hooguit 4 minuten, elke stap met eigen try/catch): `vogRun`, `peilingRun` (beschikbaarheid langer dan `peilingDagen` niet bevestigd en 14 dagen geen peiling → mail met "Klopt nog" en "Aanpassen", max. 50 per dag), `slapendRun` (zes maanden geen inzet, contact of bevestiging → `slapend` met heractivatiemail), `bewaartermijnRun` (`bewarenTot` verstreken en geen lopende inzet of voordracht → anonimiseren), `geocodeerRun` (PDOK Locatieserver, gratis en zonder sleutel: 40 talenten en 10 scholen per nacht) en `aanmeldingenRun`. Met de hand: Relaties → Rapport → Beheer → "Talentrun nu" (`apiTalentRunNu`).
- **Aanmelden via een Google Form:** maak een formulier "Aanmelden bij AthenaSchool" (voornaam, achternaam, mobiel, e-mail, postcode, functie(s), sector, ruwe beschikbaarheid, toestemmingsvinkje met link naar de privacyverklaring) en laat de antwoorden in **dezelfde Sheet** landen (Antwoorden → koppelen aan bestaande spreadsheet). `aanmeldingenVerwerken` (elk uur via `crmSyncTrigger` en in de dagelijkse run) leest elk tabblad dat met `Aanmeldingen`, `Formulierreacties` of `Form Responses` begint, herkent de kolommen op naam (voornaam, achternaam, telefoon/mobiel, e-mail, postcode, functie, sector, beschikbaar, toestemming), maakt per nieuwe rij een profiel `aangemeld` met `bron 'website'` en de toestemmingsdatum, voegt de kolommen `verwerkt` en `talentId` toe, meldt het talentteam en mailt het talent een bevestiging met portaallink. Een bestaand profiel (zelfde e-mail of telefoon) krijgt een notitie "Opnieuw aangemeld" en wordt weer actief; er komt geen tweede rij. Handmatige aanmeldingen kun je in het tabblad `Aanmeldingen` zetten. Geen eigen publiek endpoint: Google doet de spam- en misbruikbescherming.
- **Portaal (mail-link zonder inlog):** de app herkent `?t=<token>&api=<exec>[&actie=bevestig]` en toont één scherm met het raster (in de demo: `?demo=1&t=<token>`, v5.1). `doPost` met `req.portaal` zet `GEBRUIKER = EXTERN` (team `extern`, dus overal `geen`), accepteert alleen `PORTAAL_FUNCTIES` (`apiPortaalToon`, `apiPortaalBeschikbaarheid`) en houdt een budget bij (30 verzoeken per token per uur, 600 in totaal). Een token komt uit `portaalToken` + `portaalTokenTot` (90 dagen; peiling, heractivatie, bevestiging of "Nieuwe link" in het profiel). De twee functies raken alleen `beschikbaarheid`, `uitzonderingen`, `beschikbaarheidBevestigd`, `laatsteContact` (en `slapend` → `actief`) van die ene rij. De `/exec`-URL staat alleen in de gegenereerde mails (`EXEC_URL` of `ScriptApp.getService().getUrl()`); de app bewaart hem in portaalmodus niet in localStorage.
- **Weekexport uit XPS:** zet elke week de export van Roosters/Klokuren (CSV, Excel of Google Sheet) in de Drive-map `XPS-export`. `urenImport` (maandag 06:00 en via Beheer → "Uren importeren") leest alleen bestanden die nieuwer zijn dan de laatste import, herkent de kolommen op naam (`XPS_KOLOMMEN_STANDAARD`: accountnummer, e-mail, naam, project, week of datum, uren, status, no-show, late afmelding; afwijkende koppen zet je in de instelling `xpsKolommen` als `{"uren": ["gewerkte uren"]}`), koppelt een regel op `xpsId` en anders op e-mail, telt per talent, week en XPS-project de uren, diensten, no-shows en late afmeldingen en schrijft die als weekaggregaten in `TalentUren`. Het XPS-project koppelt via `Trajecten.xpsProject` aan het dashboardproject; een kandidaat `klaar voor start` die in de uren van zijn project voorkomt wordt `geplaatst`. Onbekende accounts komen terug in het resultaat; er ontstaan geen profielen vanzelf. Excel vereist **Services → Drive API** (het bestand wordt tijdelijk naar een Google Sheet omgezet). ⚠️ Controleer met één echte export of de koppen herkend worden.
- **AVG:** grondslag en datum per profiel; `bewarenTot` schuift mee met een nieuwe toestemmingsdatum; documenten alleen via de gelogde linkfunctie; inzage via `apiTalentExport` (ook notities en beoordelingen: schrijf feitelijk); anonimiseren na de bewaartermijn of met de hand. Verwerkingsregister: `docs/teams-en-processen.md` §9.
- **Assistent:** leestools `zoek_talent` en `match_vacature` (zonder contactgegevens; alleen voor wie het talentbestand mag zien). Geen actietool: voordragen gebeurt in de app.
- **Rapport en doelen:** `METRIEKEN` + `poolActief`, `vogCompliance`, `plaatsingen`, `beoordelingGem` (team talent), zodat er doelen op kunnen; `apiTalentRapport` geeft de sectie Talentnetwerk in Relaties → Rapport.

## Taken zoals Todoist, deel 2 (v4.6)

- **Nieuwe kolommen** op `Acties` (achteraan): `tags` (kommatekst, klein en uniek via `tagsIn`), `ouderId` (de hoofdtaak; één niveau) en `herinnerd` (datum-tijd van de herinneringsmail).
- **Subtaken:** `apiTaakOpslaan` controleert dat de hoofdtaak bestaat, zichtbaar is en zelf geen hoofdtaak heeft, en dat een taak met subtaken geen subtaak wordt. `taakUit` geeft `ouderId`, `ouder` (tekst van de hoofdtaak) en `subtaken: {aantal, af}`; `taakIndex()` telt dat één keer per verzoek. Afvinken van een hoofdtaak vinkt open subtaken mee af; de laatste subtaak geeft `ouderKlaar: true`. Verwijderen: met `{metSubtaken: true}` gaan de subtaken mee, anders worden ze losse taken. De volgende instantie van een herhalende taak houdt haar `tags` en `ouderId`; subtaken van een herhalende hoofdtaak worden niet gekopieerd.
- **Tags:** `apiTaken` geeft `tags` (alles in gebruik); `apiTagHernoem` en `apiVelden` nemen `Acties` mee.
- **Opgeslagen weergaven en instellingen per gebruiker** staan in `Instellingen` onder `taakWeergaven:<gebruikersId>` en `herinneringen:<gebruikersId>` (de eigenaar van het script is `beheer`): `apiTaakWeergavenOpslaan(lijst)` (whitelist, max. 12) en `apiHerinneringenZetten(aan)`; `apiTaken` geeft beide mee.
- **Herinneringsmail:** `herinneringTrigger` (elke 15 minuten, in `TRIGGERS`; één keer `setup()` draaien onder het account van de eigenaar) zoekt open taken van vandaag met een `tijd` die binnen een kwartier begint en nog geen `herinnerd` hebben, zet eerst `herinnerd` (alleen die cel, zonder `bijgewerkt` te raken) en stuurt daarna per gebruiker één mail in de huisstijl naar `Gebruikers.email` (eigenaar: `RAPPORT_EMAIL`), onderwerp `Athena · 14:00 · Bel Marieke`, met een knop naar `APP_URL#taak:<id>`. Geen e-mailadres of herinneringen uit → geen mail. Een tijd die al meer dan een uur voorbij is (trigger stond stil) wordt alleen gemarkeerd. Scripteigenschap `APP_URL` (standaard de GitHub Pages-URL) bepaalt de link.
- **Home:** `apiHome` geeft `afgerondWeek` en `streak` (werkdagen op rij met minstens één afgevinkte eigen taak; vandaag breekt de reeks niet zolang de dag loopt). `apiStatus` geeft `herinneringTrigger`, `herinneringen` en `email`.

## Taken zoals Todoist, deel 1 (v4.5)

- **Nieuwe kolommen** op `Acties` (achteraan): `tijd` (`HH:mm` of leeg), `herhaling` (JSON of leeg), `bijgewerkt`, `bijgewerktDoor`. De kolom `tijd` staat in `TEKST_KOLOMMEN`: `blad()` zet er het getalformaat tekst op, zodat Sheets `14:00` niet in een tijdwaarde omzet; een Date die er toch staat leest `celWaarde` terug als `HH:mm`.
- **Herhaling:** `{ eenheid: 'dag'|'week'|'maand'|'jaar', interval: 1..52, dagen: [1..7] (ISO, ma = 1; alleen bij week), dagVanMaand: 1..31 (alleen bij maand), vanafAfvinken: false, tot: 'yyyy-MM-dd'|'', aantal: null|2..365 }`, gecontroleerd door `herhalingIn()`. Afvinken maakt in dezelfde lock de volgende instantie (`actieAfronden` → `volgendeInstantie`): basis is de afvinkdatum bij `vanafAfvinken`, anders de deadline; de volgende datum ligt nooit vóór vandaag (één open instantie per reeks); is `tot` voorbij of `aantal` op, dan komt er geen rij en een Activiteit "Reeks afgerond". De nieuwe rij kopieert tekst, prio, categorie, eigenaar, koppelingen, notitie, tijd, herhaling en bron. Heropenen wist de herhaling van die instantie.
- **Rechten:** afvinken, heropenen en het bewerken van een bestaande taak eisen `taakVanMijOfTeam`; `apiTaak` gebruikt `taakZichtbaar` (eigen of team, of gekoppeld aan een zichtbaar project of een zichtbare kans). Een taak toewijzen aan een ander geeft die persoon een melding (`meld`) met link `taak:<id>`.
- **Snelinvoer:** de app ontleedt een Nederlandse zin (`ontleedTaak` in `index.html`: datum, tijd, `elke …`, `p1`–`p3` of `!`, `#school`/`#project`, `@categorie`, `+naam`) en stuurt losse velden; de backend ontleedt geen tekst en valideert alleen (`tijd` `^([01]\d|2[0-3]):[0-5]\d$`, `deadline` via `datumIn`, `herhaling` via `herhalingIn`). Test: `node test/parser_test.js`.
- **Sorteren en dagstart:** `sorteerActies` sorteert bij gelijke deadline op tijd (leeg laatst), dan prio; de dagstartmail toont de tijd vóór de taak. Brein `maak_taak` kent `tijd`.
- **Deeplinks:** `#taak:<id>`, `#school:<id>`, `#persoon:<id>`, `#kans:<id>` en `#project:<id>` openen het betreffende scherm, ook als de app al open is (`hashchange`); meldingen gebruiken `taak:<id>`.

## Rapporten en doelen per team (v4.2)

- **Maatstaven** staan in `METRIEKEN` (sectie 12 van `Code.gs`), per team, met soort `aantal|euro|procent|dagen` (`laagIsGoed` bij dagen). Zie `docs/teams-en-processen.md` §5.
- **Teamtotalen** kloppen ook voor percentages en gemiddelden: elke maatstaf telt als teller/noemer.
- **Doelen:**
  - per persoon, per team (`eigenaar: 'team:<team>'`) of voor het bedrijf (`'bedrijf'`, alleen met een bedrijfscijfer);
  - periodes week, maand, kwartaal, half jaar, jaar en schooljaar (v4.4: half jaar en jaar);
  - management zet alles, een teamlead zijn team; iedereen ziet de bedrijfsdoelen.
- **Nieuwe kolommen:**
  - `Kandidaten.statusHistorie` (JSON, de datum van elke status);
  - `Vacatures.ingevuld` (datum).
- **Omzet:** de omzet-KPI telt nu ook projecten in opstart mee, want dat zijn gewonnen projecten.

| Functie | Argumenten | Resultaat |
|---|---|---|
| `apiTeamRapport` | preset (`week\|maand\|kwartaal\|halfjaar\|jaar\|schooljaar`), team? (`alle` = management), eigenaar?, stap? (0 = nu, -1 = de periode ervoor) | `{ preset, stap, van, tot, eind, lopend, label, vergelijk:{van,tot,label,kort}, reeksLabels, team, teams, metrieken:[{id,team,label,kort,soort,laagIsGoed,stand}], perPersoon:[{naam,cijfers,vorige,reeks,doelen}], totaal:{cijfers,vorige,reeks,doelen}, alle?:[{team,metrieken,leden,totaal}], bedrijf:{schooljaar,metrieken,cijfers,doelen}, kiesbaar, eigenaar, ik }` |
| `apiDoelen` | — | `{ doelen, metrieken, periodes, eigenaren:[{waarde,label,team}], teamNamen, magZetten }` |

`apiHome` geeft `bedrijf` mee (de bedrijfscijfers en -doelen).

**v4.4 (rapporten door de tijd):**
- `periodeBereik(preset, stap)` geeft van, tot (t/m vandaag bij de lopende periode), eind en een label; bladeren gaat alleen terug (`stap` ≤ 0).
- `vorige` is de periode ervoor, bij een lopende periode even lang (1 t/m 9 oktober tegen 1 t/m 9 september).
- `reeks` per maatstaf: de laatste periodes (8 weken, 6 maanden, 4 kwartalen, 4 halve jaren, 3 jaren of 3 schooljaren), de laatste is de gekozen periode. Een stand (`stand: true`) heeft geen `vorige` en geen `reeks`.
- Het teamtotaal is de som van de teamleden; activiteit van iemand uit een ander team telt niet mee.

## Taskforce, vacatures en bezetting (v4.1)

- **Proces:**
  1. Kans gewonnen: de consultant krijgt de taak "Taskforcemeeting plannen" en de AM een melding.
  2. De taskforce legt de overdracht vast in de tab Taskforce: hulpvraag, inzet, rooster, startdatum, bijzonderheden en contactpersonen. Afspraken worden taken met een melding.
  3. De AM opent vacatures in de tab Bezetting. Het talentteam krijgt een melding.
  4. Talent draagt kandidaten voor. De AM krijgt de taak "Matchinggesprek".
  5. De status loopt: voorgesteld → gesprek → geselecteerd → academy → contract → vog → klaar voor start (of afgewezen).
  6. Is elke plek gevuld, dan gaat de vacature naar `ingevuld` en het project van `opstart` naar `bezig`. De consultant en de AM krijgen een melding.
- **Nieuwe tabbladen:**
  - `Vacatures`: titel, aantal, dagen, uren, start, eind, profiel, status `open|ingevuld|gesloten`;
  - `Kandidaten`: vacature, naam, contact, bron, `xpsId`, `afasNummer`, status, `statusSinds`, gesprek, notitie;
  - `Meldingen`: één rij per ontvanger, met `gelezen`.

  Nieuwe kolom: `Trajecten.taskforce` (JSON).
- **Rechten** (nieuwe onderdelen in `RECHTEN`):
  - `vacatures`: AM eigen, talent alles, consultant leest mee;
  - `kandidaten`: AM eigen, talent alles, consultant geen;
  - talent ziet nu ook projecten met een open vacature (naast opstart).
- **Dagstart:** kandidaten die langer dan 7 dagen op één status staan, komen bij "blijven liggen". Talent ziet dit voor academy, contract en VOG van de eigen voordrachten, de AM voor voorgesteld en gesprek op de eigen projecten.
- **Schooljaar:** instelling `schooljaar` (Beheer → Keuzelijsten, `apiSchooljaarOpslaan`). Leeg betekent automatisch op datum: vanaf 1 augustus.
- **XPS:** `Trajecten.xpsProject` (projectnummer in XPS) en per kandidaat `xpsId`. Op de projectpagina en de kandidaatkaart staat "Kopieer voor XPS". De status `reserve` volgt XPS Plaatsingen. Er is geen XPS-API; een import van exports volgt in v4.3 (zie `docs/teams-en-processen.md` §6).
- **Keuzelijst** `kandidaatBronnen` (XPS-bestand, LinkedIn, eigen netwerk, sollicitatie, anders).

| Functie | Argumenten | Resultaat |
|---|---|---|
| `apiBezetting` | — | `{ vacatures:[vacature+{project, kandidaten?, magWijzigen, magKandidaten}], tellingen:{openVacatures,openPlekken,inProces,klaar}, keuzes, ik }` |
| `apiVacatureOpslaan` | `{id?, trajectId, titel, aantal, dagen, urenPerWeek, start, eind, profiel, status?, _oud?}` | bezetting van het project (zie onder) |
| `apiKandidaatOpslaan` | `{id?, vacatureId, naam, email, telefoon, bron, xpsId, afasNummer, status, gesprek, notitie, _oud?}` | bezetting van het project |
| `apiTaskforceOpslaan` | trajectId, `{datum, deelnemers, hulpvraag, inzet, rooster, startdatum, bijzonderheden, contactpersonen, afspraken:[{tekst, eigenaar, deadline}]}` | bezetting van het project |
| `apiMeldingen` / `apiMeldingenGelezen` | — | `[{id, tekst, link, datum, gelezen, door}]` / `{ aantal }` |
| `apiSchooljaarOpslaan` | `'2027-2028'`, `'27/28'` of leeg | `{ schooljaar }` (alleen management) |

*Bezetting van een project:* `{ trajectId, projectStatus, vacatures (null zonder recht), bezetting:{nodig,gevuld,inProces,openVacatures}, taskforce, taskforceVragen, afspraken, keuzesBezetting, rechtenBezetting }`. `apiProject` geeft dezelfde velden mee, `apiTrajecten` per project `bezetting` en het `schooljaar`, `apiCrm` het aantal ongelezen `meldingen`. `apiVerwijder` kent ook `vacature` (alleen zonder kandidaten) en `kandidaat`.

## Teams, rollen en rechten (v4.0)

- **Gebruikers** hebben een `team` (`management`, `consultancy`, `accountmanagement`, `talent`) en een `rol` (`medewerker`, `teamlead`; het team management heeft altijd rol `management`). De koppelcode uit `setup()` is management. Bij de eerste start na de update zet `migreerV4()` de oude rollen om: `beheerder` → management, `adviseur` → consultancy, `am` → accountmanagement. Daarna zelf instellen in Relaties → Rapport → Beheer → Gebruikers (bijv. Mees: accountmanagement/teamlead, Mariama: consultancy/teamlead, Anne-Maartje: management).
- **Rechtentabel** `RECHTEN` in `Code.gs` (sectie 10), per onderdeel `[zien, wijzigen]`:

  | Onderdeel | Consultant | Accountmanager | Talent |
  |---|---|---|---|
  | Relaties (scholen, personen) | alles / alles | alles / alles | alles / geen |
  | Pipeline (kansen) | eigen / eigen | geen | geen |
  | Projecten | eigen (adviseur) / geen | eigen (am) / eigen | alleen status opstart / geen |
  | Facturatie | eigen / geen | eigen / eigen | geen |

  Een teamlead krijgt `team` waar `eigen` staat (het werk van zijn hele team); management mag alles. Een accountmanager leest de kans achter zijn eigen project (alleen die historie).
- **Controle:** `mag(onderdeel, actie, rij)` en `eis(...)` in elke `api*`-functie; lijsten filteren met `mag(...)` en `zichtbaarFilter()` (activiteit en taken aan onzichtbare kansen of projecten vallen weg). Ook de Assistent (`zoek_crm`, `feitenSamenvatting`) ziet alleen wat de gebruiker mag zien. De app krijgt `ik.rechten` en verbergt menu's en knoppen; de backend weigert met "Daar heb je geen toegang toe.".
- **Rapporten en doelen:** management ziet iedereen, een teamlead zijn team, een medewerker zichzelf. Doelen zetten kan management (iedereen) en een teamlead (eigen team).
- **Projectstatussen** zijn nu `opstart`, `bezig`, `afgelopen`, `onduidelijk`, `gestopt` (de migratie zet `offerte`/`actief`/`afgerond` om, tenzij je eigen statussen had ingesteld). Een gewonnen kans wordt een project met status `opstart`.
- **Projectenbord zoals monday:** nieuwe projectvelden `contactgegevens`, `voorstelUrl` (samenwerkingsvoorstel), `documentenUrl` (map met belangrijke documenten) en `verlenging` (keuzelijst `verlenging`: nog bespreken, voorstel verstuurd, verlengd, stopt). Weergaven in de app: per accountmanager (Lopende trajecten / Afgelopen), Verlenging per schooljaar (projecten van het schooljaar ervoor), Examentraining, Lijst en (desktop) Bord.

## Projecten en facturatie (v3.8)

- **Gewonnen kans = project.** `apiKansOpslaan` maakt bij `gewonnen` altijd (één keer) een project. Daarin staan: `kansId`, `adviseur` = eigenaar van de kans, `am` = het nieuwe kansveld `am` ("Accountmanager na winst"), omzet, contactpersoon en omschrijving. Er komt een overdrachtsnotitie in de tijdlijn en er komen taken voor de AM: startgesprek en facturatie instellen. Zonder AM krijgt de beheerder de taak "Accountmanager toewijzen".
- **Projectpagina:** tijdlijn (ook alle historie van de kans), updates, gesprekken, mails, afspraken, taken en tracks in het project (`trajectId` op Activiteiten en Acties), plus "Mails van de school, nog niet in dit project" met een knop Koppelen.
- **Facturatie** (zoals het monday-bord):
  - Projectvelden: `soortFacturatie`, `gefactureerd`, `factuurDatum`, `vakanties`, `bijzonderheden`, `factuurnummer`.
  - Termijnen staan in het tabblad `Facturen`.
  - De keuzes zijn aan te passen via Beheer → Keuzelijsten.
  - Het scherm Facturatie groepeert per accountmanager.
- **Exact Online:** voorlopig via `apiFacturenExport` (CSV van de termijnen met status "aangemaakt"). Een directe koppeling (verkoopfacturen aanmaken via de Exact-API, `exactId` per termijn) vraagt een Exact-app (client-id/secret) en OAuth. Die komt mee bij de overstap naar Supabase (zie `docs/supabase-migratie.md`).
- **Schoolpagina** in Capsule-opbouw: info links; in het midden kerncijfers, tabs (Historie, Kansen, Projecten, Personen, Bestanden), een AI-samenvatting, tracks en de activiteit met filters (zoeken, wie, soort, kans, project, periode, volgorde); rechts taken en komende afspraken.

## Alles aanpasbaar (v3.7)

- Alles wat je maakt kun je wijzigen en verwijderen: taken (ook heropenen en de rest van een track stoppen), tijdlijn (ook afspraken verzetten of annuleren in Google Agenda), projecten, notities, doelen, tracks, teksten, documenten (soort/school), gebruikers (naam/e-mail/rol, doorgevoerd overal), mijlpalen en pipelines (kansen verhuizen mee), keuzelijsten (statussen, categorieën; bestaande rijen gaan mee), tags en eigen velden (overal hernoemen of weghalen), alle huisstijlvelden.
- Nieuw tabblad `Instellingen` (sleutel, waarde-JSON) voor keuzelijsten en documentcorrecties; `Content` kreeg de kolom `door`.
- Grote hernoemingen schrijven één kolom in één keer (`wijzigKolom`), ook bij duizenden rijen.
- De app werkt na een wijziging het scherm meteen lokaal bij en slaat op de achtergrond op; bij een fout haalt hij het scherm opnieuw op.
- Plan voor de overstap naar Supabase + Vercel: `docs/supabase-migratie.md`.

## Rollen, privacy en tegelijk werken (v3.3)

- **Rollen** (`Gebruikers.rol`): `beheerder` (management), `adviseur` (onderwijsadviseur: haalt opdrachten binnen, eigenaar van kansen) en `am` (accountmanager: voert projecten uit, `Trajecten.am`). Sinds v4.0 vervangen door teams en rollen met een rechtentabel (zie hierboven); beheren (gebruikers, mijlpalen, tracks, export, migratie) kan alleen het management.
- **Privé per gebruiker:** mail, agenda, nachtelijke review en Home. De backend leest alleen de Gmail en Agenda van het account waaronder hij draait (`mijnMailbox()`); andere gebruikers krijgen lege lijsten met de melding dat hun Gmail nog gekoppeld wordt. De nachtelijke review draait per actieve gebruiker (kolom `Reviews.eigenaar`) en wordt naar ieders eigen e-mailadres gestuurd.
- **Tegelijk opslaan:** bij bewerken stuurt de app alleen de gewijzigde velden plus `_oud` (de waarden zoals geladen). `controleerConflict()` vergelijkt die binnen het lock met de Sheet; heeft iemand anders hetzelfde veld intussen gewijzigd, dan volgt de fout "Intussen gewijzigd: …" en ververst de app het scherm. Andere velden worden gewoon samengevoegd. Kolom `bijgewerktDoor` houdt bij wie het laatst wijzigde.
- **Archief:** elke 1e van de maand (trigger `archiveerTrigger`) gaat activiteit ouder dan 12 maanden naar `Activiteiten_archief`. In een detailscherm haalt de knop "Oudere activiteit (archief)" die terug.

## Brein als persoonlijke assistent (v3.5)

- `apiBrein` laat Claude (standaard `claude-sonnet-5-5`, instelbaar met `BREIN_MODEL`) met tools werken (lus van maximaal 8 rondes, stopt na ±4 minuten). De systeemprompt kent de gebruiker (naam, rol), de huisstijl, de prijslijst-documenten en `feitenSamenvatting()`.
- **Leestools** draaien direct: `zoek_crm`, `lees_school`, `zoek_documenten`, `mijn_taken`, en (alleen met eigen mailbox, `mijnMailbox()`) `zoek_mail`, `lees_mail`, `mijn_agenda`.
- **Actietools** worden nooit door het model zelf uitgevoerd: `breinActieCheck()` controleert de invoer en de backend geeft ze terug in `acties`. De app toont per actie een kaart met Uitvoeren / Aanpassen / Annuleren; pas Uitvoeren roept `apiBreinUitvoeren` aan, dat opnieuw controleert en de bestaande functies gebruikt:
  - `maak_offerte`: Google Doc in de map `Offertes` (in de documentenmap, dus ook in de kennisbank). Met `OFFERTE_SJABLOON_ID` een kopie van dat sjabloon met de velden `{{titel}} {{school}} {{contactpersoon}} {{datum}} {{adviseur}} {{inleiding}} {{hulpvraag}} {{aanpak}} {{rooster}} {{kosten}} {{voorwaarden}} {{afsluiting}}` (ontbreken de inhoudsvelden, dan komen ze als hoofdstukken onderaan); zonder sjabloon een nieuw Doc in Nunito en paars. Gedeeld met de vrager, tijdlijnregel "Offerte gemaakt".
  - `maak_conceptmail`: concept in Gmail (antwoord op `threadId` of nieuw), nooit versturen. Alleen voor wie zijn eigen mailbox heeft (tot Fase B: de eigenaar van het script).
  - `maak_taak`, `log_activiteit`, `wijzig_kans`, `plan_afspraak` via `apiTaakOpslaan`, `apiActiviteitToevoegen`, `apiKansOpslaan`, `apiAfspraakPlannen`.
- Het gesprek bewaart de app (localStorage `aa_chat`, gewist bij een andere koppelcode); de backend krijgt de laatste 12 beurten als platte tekst. Bij een mail op Vandaag/Home zet de knop "Concept" een vraag klaar in het Brein.

## CRM: gebruikers, mail en agenda, Capsule (v2.0)

- **Gebruikers.** De koppelcode uit `setup()` is de beheerderscode (Menno). Accountmanagers krijgen een eigen code via Relaties → Rapport →
  Beheer → Gebruikers. Een accountmanager ziet in Vandaag alleen zijn eigen acties en kansen, in het rapport alleen zijn eigen cijfers, en kan
  geen huisstijl, import, mijlpalen, tracks, doelen of gebruikers wijzigen. Uitschakelen trekt de code direct in.
- **Mail en agenda.** De backend draait onder Menno's account en ziet dus zijn Gmail en agenda. Elk uur worden mails van de laatste twee dagen en
  afspraken van -7 tot +14 dagen gekoppeld aan een persoon (op e-mailadres) of een school (op het domein van de website of het e-mailadres van
  de school). Accountmanagers sturen hun mails met scholen door of in bcc naar Menno's adres met `+crm` (bijv. `menno.adan+crm@athenastudies.nl`).
  Maak in Gmail een filter: *Aan: `+crm`* → *Label toepassen: `CRM`*. Mails met dat label worden ook gekoppeld; het schooladres mag in de
  doorgestuurde tekst staan.
- **Capsule vervangen.** Zet `CAPSULE_TOKEN`, draai `setup()` (of Relaties → Rapport → Beheer → Oude gegevens overzetten) en start daarna
  Beheer → Capsule-migratie. Die haalt in stappen mijlpalen, organisaties en personen, kansen, projecten, taken en historie op. Ids beginnen met
  `cap-`; opnieuw draaien werkt rijen bij in plaats van ze te verdubbelen. Bestaande scholen worden op naam gekoppeld, bestaande trajecten op
  school + naam. Controleer daarna de aantallen tegen Capsule. Zet de data-run die scholen en kansen importeert daarna uit: de app is vanaf dan
  de bron, en een nieuwe import zou velden die in de app zijn bijgewerkt overschrijven.

Een `actie` is `{ id, tekst, bron, prio, deadline, link, over }` (`over` = dagen over de deadline, negatief = nog te gaan).
Een `kans` is `{ id, school, traject, fase, waarde, volgendeActie, deadline, dagenStil }`.

## Koppeling met de Cowork-map `athena-assistent`

De dagelijkse data-run in het Cowork-project kan zijn resultaat (Capsule-export, contracten, portaal) naar de backend sturen,
zodat het dashboard en de geschiedenis dezelfde data tonen. Eén POST per tabel, rijen met de kolomnamen van het tabblad:

```bash
curl -s -L -X POST "<exec-url>?app=1" -d '{
  "fn": "apiImporteer", "secret": "<koppelcode>",
  "args": ["trajecten", [
    { "school": "Voorbeeldcollege Zuid", "plaats": "Rotterdam", "traject": "Onderwijsondersteuning", "schooljaar": "2026-2027",
      "start": "2026-09-01", "eind": "2027-05-31", "status": "actief", "ondersteuners": 2, "urenPerWeek": 30, "tarief": 48.5,
      "omzet": 40740, "contactpersoon": "A. de Vries", "am": "Menno", "samenvatting": "Lesopvang en huiswerklokaal." }
  ]]
}'
```

Rijen zonder `id` krijgen een stabiel id uit school + traject + schooljaar (scholen: naam; kansen: school + traject), zodat een
herhaalde import bijwerkt in plaats van dupliceert. Tabellen: `scholen`, `trajecten`, `kansen`, `acties`.
Alleen school- en contactpersoonniveau; nooit leerlingnamen.

## Claude API

`claude()` in `Code.gs` doet een raw HTTP-call naar `POST https://api.anthropic.com/v1/messages` (Apps Script heeft geen SDK):
model `claude-opus-5-5` (of `CLAUDE_MODEL`), `fallbacks: "default"` met de beta-header `server-side-fallback-2026-07-01` (een door de veiligheidsfilters
geweigerd verzoek wordt server-side op een ander model herhaald), `output_config.effort` uit `CLAUDE_EFFORT`, en een controle op
`stop_reason === "refusal"`. Kosten: een vraag met zes documenten is grofweg 15-30k invoertokens.

## Bekende grenzen

- Snelheid (v3.2): per verzoek wordt de Sheet één keer geopend en elk tabblad hooguit één keer gelezen (`_SS`, `_BLAD`, `_LEES` in `Code.gs`); elke schrijffunctie roept `vergeet(tabblad)` aan. Schrijf je ergens buiten `schrijf`/`schrijfVeel`/`verwijderRijen` om naar de Sheet, roep dan zelf `vergeet()` aan.
- Apps Script kapt een verzoek na ongeveer 60 seconden af. Duurt een antwoord te lang: zet `CLAUDE_EFFORT` op `low`.
- Cellen in Sheets bevatten maximaal 50.000 tekens; van elk document worden de eerste 45.000 tekens geïndexeerd.
- De review kijkt naar de afgelopen 24 uur en naar wat in de Sheet, Gmail en Agenda staat. Wat nergens geregistreerd is, ziet hij niet.
- De Sheet is de CRM-database. Tot enkele duizenden rijen per tabblad blijft dat vlot; de historie (`Activiteiten`) groeit het snelst.
- Mail en agenda van accountmanagers komen alleen binnen via doorsturen/bcc (label `CRM`); volledige synchronisatie van hun mailbox vraagt een
  Google Workspace-serviceaccount.
- De Capsule-migratie volgt de Capsule API v2 (`/milestones`, `/parties`, `/opportunities`, `/kases`, `/tasks`, `/entries`). Draai hem eerst op
  een kopie van de Sheet en vergelijk de aantallen.
