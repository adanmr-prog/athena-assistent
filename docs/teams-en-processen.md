# Voorstel: teams, rechten en het trajectproces (v4)

Status: **v6.4 gebouwd** (21-10-2026: winformulier, conceptvacature, vaste talentscout, taskforce in de agenda; v5.0 16-10-2026): teams, rollen en rechten; projectenbord; taskforce, vacatures, kandidaten, bezetting en meldingen; rapporten en doelen per team, plus bedrijfsdoelen; taken zoals Todoist; talentnetwerk fase 1 (talentbestand naast XPS, §6 en §9). ⚠️ = aanname die bevestigd moet worden.

**Besluiten (oktober 2026):** rechtentabel akkoord. Consultants zien de facturatie van hun eigen projecten (alleen lezen). Een AM ziet de historie van de kans achter zijn project, en alleen die. Teamlead accountmanagers: Mees; teamlead onderwijsconsultants: Mariama; management: Anne-Maartje en Menno. XPS blijft voor diensten en roosters (export/API later). De academy is een eigen platform.

## 1. Teams en rollen

| Team | Wie | Werkt in het dashboard aan |
|---|---|---|
| Directie | Menno (beheerder) | alles; bedrijfsdoelen, gebruikers, instellingen |
| Onderwijsconsultants | consultants + teamlead | scholen, kansen (pipeline), voorstellen, taskforce, evaluaties, verlengingen |
| Accountmanagers | AM's + teamlead | projecten, vacatures, matchinggesprekken, bezetting, facturatie, evaluaties |
| Talent (recruitment + HR) | talentscouts + teamlead | vacatures, kandidaten, voordragen, academy, contracten, VOG |
| Kwaliteit | — | niet in het dashboard; de Assistent leest later hun Notion (API/MCP) |

**Rollen per persoon:**
- `medewerker` ziet en wijzigt zijn eigen werk.
- `teamlead` ziet zijn hele team, zet teamdoelen en verdeelt werk.
- `management` ziet alles (in de code: team en rol `management`).

In de Sheet krijgt `Gebruikers` de kolommen `team` en `rol`. Zo gaan de huidige rollen over:

| Huidige rol | Wordt team | Wordt rol |
|---|---|---|
| beheerder | management | management |
| adviseur | consultancy | medewerker |
| am | accountmanagement | medewerker |

## 2. Wie ziet wat (rechtentabel)

| Onderdeel | Consultant | AM | Talentscout | Teamlead | Directie |
|---|---|---|---|---|---|
| Scholen en personen (contactgegevens) | alles | alles | lezen | alles | alles |
| Kansen / pipeline | **eigen** | — | — | team | alles |
| Projecten | die hij binnenhaalde (lezen, evaluaties) | **eigen** (beheren) | met open vacature (lezen) | team | alles |
| Taskforce (overdracht) | eigen | eigen | eigen | team | alles |
| Vacatures | lezen (eigen projecten) | **eigen** (invullen) | **alles** (werken) | team | alles |
| Kandidaten / talentbestand (v5.0: profiel, beschikbaarheid, relaties met scholen) | — | alleen talenten die kandidaat zijn in een eigen project, als **beperkt profiel** (naam, functies, VOG-stand, beoordeling, contact; geen postcode, documenten, notitie of uren) | **alles** (voorstellen uit het bestand met matchscore) | team | alles |
| Academy, contract, VOG (v5.0: documenten en VOG per schooljaar) | — | VOG-stand van eigen kandidaten (badge) | **alles** (bestanden in Drive, inzage gelogd) | team | alles |
| Beoordelingen (v5.0) | — | **eigen plaatsingen** geven en lezen (favoriet / goed / niet geschikt) | **alles**, ook los van een plaatsing en met wederhoor | team | alles; inzage-export en anonimiseren |
| Facturatie | eigen projecten (lezen) | **eigen projecten** | — | team (AM-lead) | alles |
| Financiën (v6.5: prognose, gefactureerd, ontvangen per maand; alleen lezen) | eigen projecten (adviseur) | **eigen projecten** | — | team (AM-lead) | alles, plus Exact-afstemming en prognose vastleggen |
| Mail, agenda, dagstart | eigen | eigen | eigen | eigen | eigen |
| Rapporten en doelen | eigen + teamtotaal | eigen + teamtotaal | eigen + teamtotaal | hele team | alles |
| Bedrijfsdoelen | **iedereen ziet ze** | iedereen | iedereen | iedereen | zet ze |

Technisch komt dit in één tabel `RECHTEN` in de backend. Elke `api*`-functie filtert daarop bij het lezen en controleert bij het schrijven. De app krijgt `ik.rechten` en laat alleen de menu's en knoppen zien die iemand mag gebruiken. Bij de overstap naar Supabase worden dezelfde regels RLS-policies.

**Regels bóven de tabel (v7.3, besluiten uit `docs/robuust-v7.2.md` §5; ook in het commentaar boven `RECHTEN` in `Code.gs`, de bron voor `test/rechten_test.js` en later de RLS-policies):**
- **R1 De kans achter een project.** Wie een project als eigenaar ziet (niveau `eigen` of `team`: de AM, zijn teamlead en de consultant als adviseur) leest de kans erachter volledig, met waarde, notities en historie. Wie het project alleen via niveau `opstart` ziet (het talentteam: project in opstart, open vacature of als talentscout) krijgt een **beperkte kans**: naam, school en fase blijven, waarde en gewogen waarde zijn 0, notities, verliesreden en volgende actie leeg, geen taken en geen tijdlijn (`beperkt: true`, `alleenLezen: true`). Dat geldt in `apiKans`, `apiProject`, `apiCrm` (de pipelinewaarde per school) en de zoektool van de assistent. Het management ziet alles. Keuze: de kans blijft zichtbaar (de taskforce moet weten om welke kans het gaat), maar het talentteam ziet geen commerciële details.
- **R5 Beoordelingen.** Een bestaande beoordeling wijzigt alleen wie haar gaf, het talentteam en het management. De teamlead van accountmanagement (niveau `team`) ziet de beoordelingen van zijn team wel, maar wijzigt ze niet (keuze v7.3: een oordeel blijft van de beoordelaar).
- **R6 Facturatievelden van een project.** `soortFacturatie`, `gefactureerd`, `factuurDatum`, `vakanties`, `bijzonderheden` en `factuurnummer` (`FACT_VELDEN` in `apiTrajectOpslaan`) vallen onder **Facturatie**; de overige projectvelden onder **Projecten**. De consultant leest ze dus wel, maar wijzigt ze niet; de AM wijzigt ze op zijn eigen projecten.
- **R7 Cellen zonder eigen api.** *Financiën wijzigen* heeft geen api (het scherm is alleen lezen; `apiFinancienBevriezen` en `apiExactImport` zijn alleen voor het management), *beoordelingen zien* loopt via `apiTalent` (en dus via *talenten zien*) en *kandidaten zien* via `apiBezetting` en de projectpagina (per project).
- **R4** `apiTalentOpslaan` controleert het recht mét de rij (`eis('talenten', 'wijzigen', oud || null)`), zodat een later rijniveau `eigen` of `team` voor het talentbestand ook daar geldt.

Het talent zelf (v5.0) heeft geen account: de mail-link van de peiling opent een portaal dat met een vast extern profiel zonder rechten alleen de eigen beschikbaarheid kan tonen en bevestigen of aanpassen. Een eigen inlog voor talenten komt in fase 2 (Supabase).

## 3. Het proces in het dashboard

```
Kans gewonnen (consultant)
  → project "Opstart" + taak: taskforcemeeting plannen (consultant)
  → Taskforcemeeting (consultant + AM + talentscout): overdrachtsformulier, afspraken, deadlines, startdatum
  → AM vult vacature(s) in (aantal ondersteuners, dagen/tijden, start, profiel)
  → Talentscout zoekt eerst in het Athena-talentbestand (v5.0: "Voorstellen" met matchscore en uitleg) → anders XPS, LinkedIn e.d. → draagt kandidaten voor
  → AM: matchinggesprek → geselecteerd / afgewezen
  → Academy: modules (talentscout volgt voortgang)
  → Talentscout/HR: contract + VOG (AFAS) → "klaar voor start"
  → AM: bezetting rond → project "Bezig" → beheert tot het einde
  → Consultant: krijgt updates, gaat mee naar evaluaties → verlenging (kans "Verlenging 27/28")
```

Wat het dashboard bij elke stap doet:

| Stap | In het dashboard | Automatisch |
|---|---|---|
| Kans gewonnen | v6.4: **winformulier** van de consultant (aantal en startdatum verplicht; rol, dagen en tijden, AM, bijzonderheden) → project voor de AM met vooringevulde taskforce, en een **conceptvacature** op het bord Bezetting | melding aan de AM en het hele talentteam; taak "Talentscout toewijzen" (teamlead talent); taak "Taskforcemeeting plannen" (consultant) |
| Talentscout | v6.4: vast veld op het project; de teamlead (of AM, management) wijst toe, een scout pakt een project zonder scout zelf op | de scout krijgt voortaan de talentmeldingen van dat project; zonder scout gaan ze naar het hele team; filter "Mijn projecten" op het bord |
| Taskforcemeeting | v6.4: knop "Taskforcemeeting inplannen" in de tab Taskforce | agenda-uitnodiging voor consultant, AM en talentscout met de link naar het project; de plantaak gaat af |
| Taskforce | tab **Taskforce** in het project: vaste vragen (hulpvraag, inzet, rooster, startdatum, bijzonderheden, contactpersonen), afspraken en deadlines | deadlines worden taken bij de juiste persoon |
| Vacature | tab **Bezetting**: vacatures per project; v6.4: de AM **bevestigt** de conceptvacature na de taskforce (of past hem eerst aan). Op een concept kan talent alvast matchen, nog niet voordragen | melding aan de talentscout (anders het team): "nieuwe vacature" of "vacature bevestigd"; elke stap staat als regel in de tijdlijn van het project |
| Voordragen | kandidaatkaart per vacature: voorgesteld → gesprek → geselecteerd/afgewezen → academy → contract → VOG → klaar; v5.0: knop **Voorstellen** op de vacature toont de best passende talenten uit het bestand (score 0–100 met uitleg per onderdeel, harde uitsluitingen met reden), het talentteam kiest wie wordt voorgedragen | AM krijgt een taak "matchinggesprek" bij elke voordracht |
| Academy, contract, VOG | statussen op de kandidaatkaart (talentscout); v5.0: VOG-stand per schooljaar als badge op de kandidaatregel en in het profiel | herinnering als een stap te lang open staat; v5.0: op 1 mei en 1 juni een mail aan wie volgend schooljaar een nieuwe VOG nodig heeft, plus één verzameltaak voor het talentteam |
| Inzet loopt (v5.0) | kandidaat `geplaatst` (ook automatisch uit de XPS-weekexport); daarna `afgerond` of `gestopt` met reden | AM krijgt na zes weken en daarna elk kwartaal een taak "Beoordeel <naam> bij <school>" (favoriet / goed / niet geschikt + criteria); "niet geschikt" meldt het talentteam |
| Bezetting rond | teller "3 van 4 plekken gevuld" op het project | project naar "Bezig", melding aan consultant |
| Evaluatie | afspraak in het project (AM + consultant) | taak voor de AM elke periode |
| Verlenging | weergave **Verlenging 26/27** | 3 maanden voor het einde een kans "Verlenging" voor de consultant |

## 4. Projectenbord voor accountmanagers (zoals monday)

Hetzelfde beeld als nu in monday, maar dan gekoppeld aan scholen, kansen en facturatie.

**Indeling**
- Links in het menu: **Accountmanagers** → één bord per persoon (Anne-Marie, Mees, Jasmijn, Bob, …).
- Ook in het menu: **Verlenging '26/'27**, **'27/'28** en **Examentraining** als vaste weergaven.
- Per bord twee groepen: **Lopende trajecten** en **Afgelopen**.

**Kolommen**
- Item (School | traject)
- Persoon (AM)
- Status: Opstart (oranje), Bezig (groen), Afgelopen (rood), Onduidelijk (grijs)
- Start- en einddatum
- Contactpersoon met contactgegevens
- Samenwerkingsvoorstel (Drive-document)
- Belangrijke documenten (Drive-map)
- Bezetting (x/y)
- Aantal updates

Een rij aanklikken opent de projectpagina met tijdlijn, taken, bezetting en facturatie. De statussen zijn nu `actief/afgerond/…`; die zetten we om naar Opstart, Bezig, Afgelopen, Onduidelijk en Gestopt (instelbaar via Keuzelijsten).

## 5. Rapporten en doelen per team (v4.2)

Het rapport (Relaties → Rapport) en het scherm Doelen werken per team.
- Management kiest het team, of **Alle teams** naast elkaar (v4.4, de startweergave voor het management).
- Een teamlead ziet zijn team per persoon.
- Een medewerker ziet zichzelf plus het teamtotaal.

Bovenaan staan altijd de **bedrijfsdoelen** van het schooljaar. Iedereen ziet ze; alleen het management zet ze. Ze staan ook op Home.

| Team | Maatstaven (per periode, tenzij "stand") |
|---|---|
| Onderwijsconsultants | gesprekken, afspraken, mails, nieuwe kansen, nieuwe scholen, voorstellen, gewonnen (aantal en €), conversie (gewonnen van gesloten); daarnaast forecast, pijplijn, winst en verlies en stille kansen |
| Accountmanagers | lopende projecten (stand), bezetting gevuld/nodig (stand), dagen tot bezetting, gesprekken en afspraken in eigen projecten, verlengd dit schooljaar (stand), facturatie op tijd (verzonden of betaald op de factuurdatum) |
| Talent | voordrachten, klaar voor start, match → plaatsing (klaar van klaar plus afgewezen), time-to-fill (vacature geopend → ingevuld), doorlooptijd (geselecteerd → klaar voor start) |
| Bedrijf (schooljaar) | omzet (projecten behalve gestopt, offerte en onduidelijk), scholen met een project, ondersteuners ingezet, verlengingspercentage (verlengd van verlengd plus stopt) |

**Periodes (v4.4).** Week, maand, kwartaal, half jaar, jaar en schooljaar, met ‹ › om naar eerdere periodes te bladeren.
- Elke tegel toont het verschil met de periode ervoor. Bij een lopende periode vergelijkt het rapport even lange stukken (1 t/m 9 oktober tegen 1 t/m 9 september).
- **Verloop:** per maatstaf de laatste periodes naast elkaar (8 weken, 6 maanden, 4 kwartalen, 4 halve jaren, 3 jaren), per teamlid en voor het team.
- Een stand (zoals bezetting nu) heeft geen verloop.
- Het teamtotaal is de som van de teamleden.

**Doelen** worden gezet per persoon, per team (`team:<team>`) of voor het bedrijf (`bedrijf`), steeds per week, maand, kwartaal, half jaar, jaar of schooljaar. Bij "dagen" is een doel gehaald als je er onder blijft.
- Management zet alle doelen.
- Een teamlead zet doelen voor zijn team en de teamleden.

## 6. XPS en AFAS naast het dashboard (advies, oktober 2026)

**Wat XPS is.** Bron: eigen inspectie, alleen lezen, 8 oktober 2026, 54 modules.

XPS (XPSLogic, app FlexPS) is het operationele systeem voor de flexkrachten. Deze modules worden aantoonbaar gebruikt:

| Module | Gebruik |
|---|---|
| Accounts | studentdocenten en medewerkers; 1.646 nieuwe op het dashboard |
| Sollicitanten en Vacatures | eigen werving, met het aantal sollicitanten per vacature |
| HRM-Contracten | 5.068 contracten van het type OvO; statussen aangeboden → getekend → controleren → goedgekeurd |
| Projecten | naam "School \| Dienst", nummer rond 10.900; statussen Website, Lead, Offerte, Optie, Boeking, Controleren, Verwerken, Afgerond, Geannuleerd |
| Plaatsingen | 3.899, project plus account; Potentieel, Gecheckt, Geplaatst, Momenteel geplaatst, Reserve, Afgewezen, Ontkend |
| Roosters | ongeveer 1.600 regels per week, met functie en kwalificatie |

Verder staan in het menu onder meer Declaraties, Factureren, Klokuren en Ondertekenverzoeken. Of die gebruikt worden, is niet vastgesteld. **XPS heeft geen API**; alles loopt via de browser.

**Taakverdeling (advies)**

| Wat | Bron | Waarom |
|---|---|---|
| Scholen, kansen, offertes (pipeline) | **dashboard** | de consultants werken hier; één pipeline |
| Project na winst: taskforce, account management, verlenging, facturatie | **dashboard** | hangt aan school, kans en AM |
| Vraag (vacature: aantal, dagen, start, profiel) | **dashboard** | komt uit de taskforce, de AM vult hem in |
| Talentprofiel, beschikbaarheid, documenten en VOG per schooljaar, relaties met scholen, beoordelingen, matching, aanmeldformulier en peiling (v5.0) | **dashboard** (weergave Talent) | één profiel per persoon, uitlegbare match en de AVG-regels op één plek; XPS kent geen beschikbaarheid per dagdeel, VOG per schooljaar of beoordelingen |
| Plaatsingen, contracten (OvO), roosters, uren, declaraties, verloning | **XPS** (tot fase 2) | daar werkt talent al, met de app voor de flexkrachten |
| Bezetting, kandidaatstatus en uren in het dashboard | **weekexport uit XPS** (v5.0: Drive-map `XPS-export`, maandag 06:00) | de AM en consultant zien de voortgang zonder XPS te openen; no-shows en late afmeldingen voeden de betrouwbaarheid in de matching |

**XPS: wat we nu het best kunnen doen**
1. **Geen tweede plaatsingssysteem.** Talent blijft plaatsen in XPS. In het dashboard zet talent per vacature alleen de kandidaten die de AM moet zien, met hun XPS-nummer (v5.0: gekozen uit het talentbestand, het profiel levert de contactgegevens en het `xpsId`). De weekexport (v5.0) zet een kandidaat die op de werkvloer staat vanzelf op `geplaatst`.
2. **Projecten koppelen.** Het projectveld "Projectnummer in XPS" (v4.1) verbindt een dashboardproject met het XPS-project, bijvoorbeeld 10.912. Maak het XPS-project pas aan bij **Boeking**, dus als de kans gewonnen is, met de knop "Kopieer voor XPS" op de projectpagina.
3. ⚠️ **Besluit nodig:** stop met Lead, Offerte en Optie in XPS. Dan is er één commerciële pipeline, die in het dashboard.
4. **Statussen vertalen.** Dit is de vertaling voor de import:

   | XPS | Dashboard |
   |---|---|
   | Potentieel | voorgesteld |
   | Gecheckt | geselecteerd |
   | Geplaatst, Momenteel geplaatst | klaar voor start |
   | Reserve | reserve (nieuw in v4.1) |
   | Afgewezen, Ontkend | afgewezen |

   HRM-Contracten op "goedgekeurd" betekent dat de stap contract klaar is.
5. **Koppeling zonder API, in volgorde van voorkeur:**
   1. Vraag XPSLogic (info@xps.nl) om een API, webhooks of een geplande export (CSV of Excel) van Plaatsingen, HRM-Contracten en Roosters.
   2. Anders: talent exporteert wekelijks die lijsten uit XPS en zet ze in een vaste Drive-map; het dashboard leest ze 's nachts in. **Gebouwd in v5.0:** map `XPS-export`, maandag 06:00 (of Beheer → "Uren importeren"), CSV, Excel of Google Sheet, kolommen herkend op naam (afwijkende koppen via de instelling `xpsKolommen`), koppeling op accountnummer en anders e-mail, weekaggregaten in `TalentUren`.
   3. Pas als laatste: automatisch uitlezen van de lijstpagina's (die hebben een vaste URL per module) met een aparte XPS-gebruiker die alleen mag lezen. Dat is kwetsbaar en alleen met toestemming van XPSLogic.
6. **Uren en facturatie.** De gewerkte uren staan in XPS (Roosters, Klokuren). Met de import kan de facturatie per project uit die uren komen (uren × tarief → Exact), in plaats van met de hand. Zoek uit of de module Factureren in XPS al gebruikt wordt; anders blijft Exact de plek.
7. **Privacy.** Haal alleen naam, nummer en status op. Geen contract-pdf's, BSN of loongegevens in de Sheet.

**AFAS en InSite: wat we nu het best kunnen doen**
1. De contracten van de flexkrachten (OvO) staan in **XPS**, niet in AFAS. De contractstatus voor het dashboard komt dus uit XPS (zie hierboven).
2. ⚠️ Waarschijnlijk is AFAS (Profit, InSite) voor het vaste personeel: salaris, personeelsdossier, verzuim en HR-workflows. Vraag het talentteam precies welke stappen zij in InSite doen.
   - Zit daar alleen vast personeel in, dan is een koppeling met het dashboard nu niet nodig.
   - Gaat er ook iets per flexkracht doorheen, bijvoorbeeld de VOG, dan kan het via de REST-API van AFAS. Dat vraagt een app-connector met token en een GetConnector, ingesteld door de AFAS-beheerder.
3. Gebruik geen derde wervingssysteem. Interne werving (eigen vacatures zoals accountmanager en talentscout) staat in de XPS-modules Sollicitanten en Vacatures. Voor de recruiter-agent zijn dat monday "Werving talent" en de skill `werving-recruiter`. Kies voor interne werving één van die twee.

## 7. Volgorde van bouwen

1. **v3.9 (klaar):** nieuwe namen in de app: Dashboard, Assistent, Dagstart, Studio.
2. **v4.0 Teams en rechten (klaar):**
   - teams en rollen, de rechtentabel, menu per team;
   - projectstatussen zoals monday;
   - het AM-projectenbord met de weergaven Verlenging en Examentraining.
3. **v4.1 Taskforce en bezetting (klaar):**
   - tab Taskforce, vacatures, kandidaatkaarten en voordragen;
   - statussen voor academy, contract en VOG;
   - meldingen en taken;
   - weergaven Huidig schooljaar en Verlenging volgend schooljaar; het huidige schooljaar is instelbaar.
4. **v4.2 Rapporten en doelen per team, plus bedrijfsdoelen (klaar).**
5. **v4.3 Demomodus (klaar)** en **v4.4 Rapporten per periode (klaar).**
6. **v4.5 en v4.6 Taken zoals Todoist** (besluit 14-10-2026: geen Todoist-koppeling, Athena neemt de functies over): snelinvoer in het Nederlands, herhalingen, tijd, Vandaag/Komende, ongedaan maken, sneltoetsen, meldingen en rechten (v4.5, klaar 14-10-2026); tags, subtaken, opgeslagen weergaven, weekweergave, herinneringsmail en streak (v4.6, klaar 15-10-2026).
7. **v5.0 Talentnetwerk fase 1 (klaar 16-10-2026)** (naast XPS): één profiel per flexkracht, beschikbaarheid, documenten en VOG per schooljaar, relaties met scholen, beoordelingen door accountmanager en talentteam, matching met uitleg, uren als weekexport uit XPS, rapport, aanmeldformulier (Google Form) en bevestigen van beschikbaarheid via een mail-link. Na het mergen: `Code.gs` plakken, één keer `setup()` (twee nieuwe triggers, mappen `Talent` en `XPS-export`), het Google Form aan de Sheet koppelen en de eerste XPS-export in de map zetten.
8. **v6.0 Supabase en Vercel (gebouwd 16-10-2026)** met een eigen domein; voorwaarde voor fase 2. `Code.gs` draait ongewijzigd op Vercel met Postgres als database en Google-login; de ingebruikname (accounts, migratie, een week parallel, overstap) staat in `server/README.md`. monday-import en de Exact-API komen later.
9. **v6.1+ Talentnetwerk fase 2** (besluit 14-10-2026: XPS op termijn vervangen): diensten en roosters, toewijzing in golven, uren bevestigen, werkers-app, schoolfeedback, WhatsApp/sms, push, payroll-export; XPS uitfaseren. AFAS alleen als blijkt dat er flexkrachtgegevens in staan.

Onderzoek en uitvoeringsplan: `docs/onderzoek-todoist-en-talentnetwerk.md` en `docs/plan-taken-en-talentnetwerk.md`.

## 8. Open vragen

Besloten op 14-10-2026: geen Todoist-koppeling (functies in Athena); XPS wordt op termijn vervangen (fase 1 ernaast, fase 2 op Supabase); zelfservice in fase 1 licht (aanmelden en beschikbaarheid bevestigen via mail-link); beoordelen in fase 1 door accountmanager en talentteam, schoolfeedback via link in fase 2.

Nog open:
6. **XPS-export:** v5.0 leest CSV, Excel en Google Sheets uit de map `XPS-export` en herkent de kolommen op naam (accountnummer, e-mail, naam, project, week of datum, uren, status, no-show, late afmelding). Nog nodig: één echte export van Roosters/Klokuren om de koppen te controleren; afwijkende koppen gaan in de instelling `xpsKolommen`. Zet in elk dashboardproject het XPS-projectnummer, anders landen de uren niet bij het project.
7. **Juridische toets:** de VOG-regel per schooljaar (art. 34b WPO; WVO 2020 en WEC nalezen) en of de inzet van ondersteuners onder leiding van de leraar als uitlenen geldt (Wtta, handhaving 2028). De termijn staat als instelling `vogMaandenGeldig` (6 maanden) en is zonder code aan te passen.
8. **Privacyverklaring** voor het aanmeldformulier (het toestemmingsvinkje in het Google Form verwijst ernaar) en de tekst van de peiling-, VOG- en bevestigingsmail. De bewaartermijn staat als instelling `bewaartermijnMaanden` (24) en wordt gehandhaafd door anonimisering (§9).
9. **E-mailadressen:** hebben alle gebruikers in Beheer → Gebruikers een e-mailadres? Nodig voor de herinneringsmail (v4.6).
10. **Talentteam:** wie zit in team `talent` in Beheer → Gebruikers? Meldingen over aanmeldingen, "niet geschikt" en de VOG-verzameltaak gaan naar dat team.

1. ⚠️ **Schooljaar:** de datum van de server (oktober 2026) geeft schooljaar 2026-2027. Is het huidige schooljaar 2027-2028, zet dat dan in Beheer → Keuzelijsten → Huidig schooljaar.
2. **XPS:** heeft XPSLogic een export of API voor Plaatsingen, Contracten en Roosters? Wordt de module Factureren gebruikt?
3. **XPS-projecten:** stoppen met Lead, Offerte en Optie in XPS en een project pas aanmaken bij Boeking?
4. **AFAS:** wat doet het talentteam precies in InSite (alleen vast personeel of ook flexkrachten, bijvoorbeeld VOG)?
5. **Interne werving:** XPS Sollicitanten of monday "Werving talent"?

## 9. Verwerkingsregister talentbestand (v5.0)

**Doel:** flexkrachten (ondersteuners, studentdocenten, huiswerkbegeleiders, examentrainers, NT2-ondersteuners, surveillanten) bemiddelen naar scholen: passende mensen vinden, voordragen en de kwaliteit van de inzet bewaken. **Grondslag:** toestemming bij aanmelding (`toestemmingDatum`, `toestemmingGrondslag` per profiel; het Google Form vraagt een vinkje met link naar de privacyverklaring); voor lopende plaatsingen de uitvoering van de overeenkomst. **Gegevens:** naam, e-mail, telefoon, postcode en woonplaats (en de daaruit berekende ligging), functies, sectoren, vakken, opleiding en bevoegdheid, vervoer en reisafstand, beschikbaarheid, contractvorm, XPS- en AFAS-nummer, documentmetadata met het bestand in Drive (VOG, diploma, certificaat, bevoegdheid), relaties met scholen, beoordelingen door accountmanagers en het talentteam (met wederhoor), weekuren, no-shows en late afmeldingen uit XPS, en de tijdlijn. **Niet opgenomen:** BSN, kopie identiteitsbewijs, IBAN, geboortedatum, tarief, contract-pdf en gezondheid; die horen bij de werkgever of payroller. **Toegang:** talentteam en management volledig; een accountmanager alleen een beperkt profiel van de talenten in zijn eigen projecten; consultants niets; elke inzage in een document wordt op de tijdlijn gelogd; de Drive-submap `Talent` wordt alleen met het talentteam gedeeld. **Bewaartermijn:** `bewaartermijnMaanden` (24) na de toestemmingsdatum; een nieuwe toestemming of plaatsing verlengt. Daarna anonimiseert de dagelijkse run het profiel (naam "Verwijderd profiel", contact, postcode, notitie en documenten weg; uren en beoordelingen blijven zonder naam voor de statistiek) zolang er geen lopende inzet of voordracht is. **Rechten van de betrokkene:** inzage via Beheer → export per talent (profiel, documenten, beoordelingen, relaties, uren, tijdlijn; dus ook interne notities: schrijf feitelijk), correctie in het profiel of via de mail-link (beschikbaarheid), verwijdering via anonimiseren. **Verwerkers:** Google Workspace (Sheet, Drive, Gmail; bestaande verwerkersovereenkomst), PDOK Locatieserver (alleen een postcode of adres, geen naam), Anthropic (de Assistent zoekt in het bestand zonder contactgegevens). **Geautomatiseerde besluitvorming:** geen; de matchscore is uitlegbaar per onderdeel, sluit niemand uit en het talentteam beslist zelf wie wordt voorgedragen.
