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
   | `CLAUDE_MODEL` | standaard `claude-opus-5` | nee |
   | `CLAUDE_EFFORT` | `low`, `medium` (standaard), `high` | nee — `low` als antwoorden te lang duren |
   | `CAPSULE_TOKEN` | API-token uit Capsule (My Preferences → API Authentication Tokens) | alleen voor de eenmalige Capsule-migratie; daarna verwijderen |

   `CODES` (koppelcodes van accountmanagers), `CAPSULE_MIJLPALEN`, `LAATSTE_CRM_SYNC` en `CAPSULE_MIGRATIE` zet de backend zelf; niet met de hand aanpassen.

4. Kies bovenin de functie `setup` en klik **Uitvoeren**. Geef de gevraagde rechten (Sheets, Drive, Gmail, Agenda, externe verbindingen).
   De log toont drie dingen: de URL van de Sheet, de URL van de documentenmap en de **koppelcode**. Bewaar die koppelcode.
   `setup()` maakt ook de triggers aan: documenten inlezen (04:00), de nachtelijke review (05:00) en (v2.0) elk uur mail en agenda aan het CRM koppelen.
   Bestaande installatie bijwerken naar v2.0: plak de nieuwe `Code.gs`, draai `setup()` één keer opnieuw (maakt de nieuwe tabbladen en kolommen,
   zet contactpersonen en notities over, installeert de uurlijkse trigger) en implementeer een nieuwe versie.
5. Optioneel: **Services → + → Drive API** toevoegen. Dan leest de index ook de tekst uit PDF's en Word-bestanden (met OCR).
   Zonder deze service worden die bestanden alleen op titel geïndexeerd.
6. **Implementeren → Nieuwe implementatie → Web-app**: uitvoeren als *Ik*, toegang *Iedereen*. Kopieer de `/exec`-URL.
7. Open de app (https://adanmr-prog.github.io/athena-assistent/ zodra GitHub Pages aanstaat), vul de `/exec`-URL en de koppelcode in. Klaar.
8. Optioneel: draai `vulVoorbeelddata` één keer om de app gevuld te zien met fictieve scholen. Verwijder de rijen daarna in de Sheet.

Bij elke wijziging in `Code.gs`: Implementeren → Implementaties beheren → potlood → Versie: *Nieuwe versie* → Implementeren. De URL blijft gelijk.

## Wat er waar staat

- **Sheet `Athena Assistent — data`**, tabbladen: `Scholen`, `Trajecten`, `Kansen`, `Acties`, `Documenten`, `Reviews`, `Huisstijl`, `Content`, `Notities`,
  en voor het CRM (v2.0) `Personen`, `Activiteiten`, `Mijlpalen`, `Tracks`, `Gebruikers`, `Doelen`.
  Je mag rijen direct in de Sheet bewerken; de eerste rij is de kolomkop en moet blijven staan. Kolom `id` is de sleutel.
  Nieuwe kolommen komen altijd achteraan; `blad()` vult een oude kop automatisch aan. Verschuif dus nooit kolommen in de Sheet.
- **Drive-map `Athena Assistent — documenten`** met submappen `Contracten`, `Werkwijzen`, `Schooldossiers`, `Voorstellen`, `Prijslijst`.
  Alles wat hierin staat (ook in diepere submappen) wordt geïndexeerd; de submapnaam bepaalt het type. Google Docs, Sheets, tekst en (met Drive API) PDF/Word.
  Zet in een schooldossier de schoolnaam in de titel of de eerste alinea; dan koppelt Athena het document aan het traject.
- **Scripteigenschappen** bevatten de sleutels en ids; nooit in de Sheet.

## Contract met de app

`POST <exec-url>?app=1`, body `JSON.stringify({ fn, args: [...], secret })`, geen headers (Apps Script beantwoordt geen CORS-preflight).
Antwoord `{ ok: true, result }` of `{ ok: false, fout }`; `fout === 'secret'` betekent: koppelcode klopt niet.

| fn | args | result |
|---|---|---|
| `apiOverzicht` | — | `{ datum, groet, kpi:{trajecten,kansen,scholen,omzet,schooljaar,pijplijn}, focus:[actie], aandacht:[actie], mails:[{onderwerp,van,dagen,link}], agenda:[{tijd,titel,duurMin}], kansen:[kans] }` |
| `apiActieKlaar` | id | null |
| `apiActieToevoegen` | tekst, prio, deadline | actie |
| `apiKennisbank` | — | `{ tellingen, documenten:[{id,titel,type,school,url,gewijzigd,woorden}], laatsteIndex, mapUrl }` |
| `apiIndexeer` | — | `{ aantal, nieuw, bijgewerkt, verwijderd }` |
| `apiVraag` | vraag | `{ antwoord, bronnen:[{titel,url,type}] }` |
| `apiReview` | — | `{ laatste: review, eerdere:[{id,datum,gemaaktOp,samenvatting,tellingen}] }` |
| `apiReviewNu` | — | review (`{id,datum,gemaaktOp,samenvatting,gedaan,blijvenLiggen,vandaag,tellingen}`) |
| `apiHuisstijl` | — | `{ velden, kleuren, toon, zinnen, types, recent }` |
| `apiZetHuisstijl` | sleutel, waarde | null |
| `apiMaakContent` | type, onderwerp, extra | `{ id, datum, type, typeNaam, onderwerp, tekst }` |
| `apiTrajecten` | — | `{ trajecten:[traject], filters:{schooljaren,trajecten,statussen} }` |
| `apiTraject` | id | `{ traject, documenten, notities, kansen, school }` |
| `apiTrajectOpslaan` | object (met of zonder id) | traject |
| `apiNotitieToevoegen` | trajectId, tekst | `{ id, datum, tekst }` |
| `apiImporteer` | tabel, rijen | `{ ingevoegd, bijgewerkt, ongewijzigd }` |
| `apiStatus` | — | status van de installatie (v2.0: ook `gebruiker`, `crmSyncTrigger`, `laatsteCrmSync`, `capsuleToken`, `capsuleMigratie`) |

### CRM (v2.0, module Relaties)

| fn | args | result |
|---|---|---|
| `apiCrm` | — | `{ ik:{naam,rol}, gebruikers, statussen, mijlpalen, categorieen, activiteitTypes, tracks, tags, scholen:[school+{personen,openKansen,openWaarde}], personen:[persoon] }` |
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
| `apiTaken` | — | `{ taken:[taak], categorieen, gebruikers, tracks }` (open + afgerond in de laatste 14 dagen) |
| `apiTaakOpslaan` | object | taak (afvinken gaat via `apiActieKlaar`) |
| `apiTrackOpslaan` | `{id?, naam, omschrijving, stappen:[{tekst,categorie,dagenNaStart,prio}]}` | tracks (alleen beheerder) |
| `apiTrackStart` | trackId, `{schoolId?,persoonId?,kansId?}`, startdatum, eigenaar | `{ aantal, track }` |
| `apiRapport` | `week\|maand\|kwartaal`, eigenaar? | `{ team, perPersoon:[{naam,cijfers,doelen}], totaal, forecast, trechter, winst, redenen, stil, ... }` |
| `apiDoelen` / `apiDoelOpslaan` | — / `{eigenaar, periode, metric, doel}` | `{ doelen, metrics, periodes, gebruikers }` |
| `apiGebruikers` / `apiGebruikerOpslaan` | — / object, nieuweCode | gebruikers / `{ gebruiker, code }` (code alleen bij nieuw of nieuweCode; alleen beheerder) |
| `apiCrmSync` | — | `{ mails, afspraken, bijgewerkt }` |
| `apiCrmInrichten` | — | `{ personen, kansen, trajecten, notities, eigenaren }` (oude velden overzetten; idempotent) |
| `apiCapsuleMigratie` | stap, pagina | `{ stap, aantal, volgende:{stap,pagina}\|null }` (de app roept herhaald aan tot `volgende` null is) |
| `apiHome` | — | `{ groet, datum, ik, taken:[taak], agenda:[{id,sleutel,titel,start,eind,heleDag,locatie}], pipeline:{open,waarde,gewogen,stil}, recent:[activiteit], mails }` (v3.0, desktop-Home) |
| `apiActiviteiten` | door, van, tot | `{ door, totaal, perType, tijdlijn }` (v3.3; niet-beheerders krijgen altijd hun eigen activiteit) |
| `apiArchiefTijdlijn` | `school\|persoon\|kans`, id | `[activiteit]` uit `Activiteiten_archief` (v3.3) |
| `apiArchiveer` | — | `{ gearchiveerd, over }` (v3.3, alleen beheerder; draait ook elke 1e van de maand) |
| `apiHomeMails` | — | `[{onderwerp,van,dagen,link}]` (v3.2: los van `apiHome`, omdat Gmail traag is; `apiHome` geeft `mails: []`) |
| `apiAgenda` | van, tot (`yyyy-MM-dd`, max. 62 dagen) | `{ van, tot, events:[google-afspraak (+schoolId/school als hij aan het CRM hangt)], afspraken:[activiteit], taken:[taak] }` (v3.0) |
| `apiExport` | `scholen\|personen\|kansen\|activiteiten\|taken\|trajecten` | `{ bestandsnaam, csv }` |
| `apiVerwijder` | `school\|persoon\|kans\|activiteit\|taak`, id | null (school alleen zonder personen en kansen) |

Een `kans` heeft sinds v2.0 ook `naam, schoolId, persoonId, pipeline, kans, gewogen, verwachteSluiting, gesloten, verliesReden, eigenaar, tags, stil`
(`stil` = langer geen contact dan `dagenNorm` van de mijlpaal). Een `taak` is een `actie` plus `categorie, eigenaar, status, schoolId, persoonId, kansId, school, persoon, kans`.

## Rollen, privacy en tegelijk werken (v3.3)

- **Rollen** (`Gebruikers.rol`): `beheerder` (management), `adviseur` (onderwijsadviseur: haalt opdrachten binnen, eigenaar van kansen) en `am` (accountmanager: voert projecten uit, `Trajecten.am`). Iedereen ziet alle scholen, kansen en projecten; beheren (gebruikers, doelen, mijlpalen, tracks, export, migratie) kan alleen de beheerder.
- **Privé per gebruiker:** mail, agenda, nachtelijke review en Home. De backend leest alleen de Gmail en Agenda van het account waaronder hij draait (`mijnMailbox()`); andere gebruikers krijgen lege lijsten met de melding dat hun Gmail nog gekoppeld wordt. De nachtelijke review draait per actieve gebruiker (kolom `Reviews.eigenaar`) en wordt naar ieders eigen e-mailadres gestuurd.
- **Tegelijk opslaan:** bij bewerken stuurt de app alleen de gewijzigde velden plus `_oud` (de waarden zoals geladen). `controleerConflict()` vergelijkt die binnen het lock met de Sheet; heeft iemand anders hetzelfde veld intussen gewijzigd, dan volgt de fout "Intussen gewijzigd: …" en ververst de app het scherm. Andere velden worden gewoon samengevoegd. Kolom `bijgewerktDoor` houdt bij wie het laatst wijzigde.
- **Archief:** elke 1e van de maand (trigger `archiveerTrigger`) gaat activiteit ouder dan 12 maanden naar `Activiteiten_archief`. In een detailscherm haalt de knop "Oudere activiteit (archief)" die terug.

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
model `claude-opus-5`, `fallbacks: "default"` met de beta-header `server-side-fallback-2026-07-01` (een door de veiligheidsfilters
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
