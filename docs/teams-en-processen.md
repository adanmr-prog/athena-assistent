# Voorstel: teams, rechten en het trajectproces (v4)

Status: **v4.2 gebouwd**: teams, rollen en rechten; projectenbord; taskforce, vacatures, kandidaten, bezetting en meldingen; rapporten en doelen per team, plus bedrijfsdoelen. v4.3 (koppelingen) volgt. ⚠️ = aanname die bevestigd moet worden.

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
| Kandidaten / talentbestand | — | alleen voorgedragen voor eigen project | **alles** | team | alles |
| Academy, contract, VOG | — | status van eigen kandidaten | **alles** | team | alles |
| Facturatie | eigen projecten (lezen) | **eigen projecten** | — | team (AM-lead) | alles |
| Mail, agenda, dagstart | eigen | eigen | eigen | eigen | eigen |
| Rapporten en doelen | eigen + teamtotaal | eigen + teamtotaal | eigen + teamtotaal | hele team | alles |
| Bedrijfsdoelen | **iedereen ziet ze** | iedereen | iedereen | iedereen | zet ze |

Technisch komt dit in één tabel `RECHTEN` in de backend. Elke `api*`-functie filtert daarop bij het lezen en controleert bij het schrijven. De app krijgt `ik.rechten` en laat alleen de menu's en knoppen zien die iemand mag gebruiken. Bij de overstap naar Supabase worden dezelfde regels RLS-policies.

## 3. Het proces in het dashboard

```
Kans gewonnen (consultant)
  → project "Opstart" + taak: taskforcemeeting plannen (consultant)
  → Taskforcemeeting (consultant + AM + talentscout): overdrachtsformulier, afspraken, deadlines, startdatum
  → AM vult vacature(s) in (aantal ondersteuners, dagen/tijden, start, profiel)
  → Talentscout zoekt in het bestand (XPS) → anders LinkedIn e.d. → draagt kandidaten voor
  → AM: matchinggesprek → geselecteerd / afgewezen
  → Academy: modules (talentscout volgt voortgang)
  → Talentscout/HR: contract + VOG (AFAS) → "klaar voor start"
  → AM: bezetting rond → project "Bezig" → beheert tot het einde
  → Consultant: krijgt updates, gaat mee naar evaluaties → verlenging (kans "Verlenging 27/28")
```

Wat het dashboard bij elke stap doet:

| Stap | In het dashboard | Automatisch |
|---|---|---|
| Kans gewonnen | project (bestaat al, v3.8) | taak "Taskforcemeeting plannen" (consultant), agenda-uitnodiging voor AM en talentscout |
| Taskforce | tab **Taskforce** in het project: vaste vragen (hulpvraag, inzet, rooster, startdatum, bijzonderheden, contactpersonen), afspraken en deadlines | deadlines worden taken bij de juiste persoon |
| Vacature | tab **Bezetting**: vacatures per project | melding aan het talentteam: "nieuwe vacature" |
| Voordragen | kandidaatkaart per vacature: voorgesteld → gesprek → geselecteerd/afgewezen → academy → contract → VOG → klaar | AM krijgt een taak "matchinggesprek" bij elke voordracht |
| Academy, contract, VOG | statussen op de kandidaatkaart (talentscout) | herinnering als een stap te lang open staat |
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
- Management kiest het team.
- Een teamlead ziet zijn team per persoon.
- Een medewerker ziet zichzelf plus het teamtotaal.

Bovenaan staan altijd de **bedrijfsdoelen** van het schooljaar. Iedereen ziet ze; alleen het management zet ze. Ze staan ook op Home.

| Team | Maatstaven (per periode, tenzij "stand") |
|---|---|
| Onderwijsconsultants | gesprekken, afspraken, mails, nieuwe kansen, nieuwe scholen, voorstellen, gewonnen (aantal en €), conversie (gewonnen van gesloten); daarnaast forecast, pijplijn, winst en verlies en stille kansen |
| Accountmanagers | lopende projecten (stand), bezetting gevuld/nodig (stand), dagen tot bezetting, gesprekken en afspraken in eigen projecten, verlengd dit schooljaar (stand), facturatie op tijd (verzonden of betaald op de factuurdatum) |
| Talent | voordrachten, klaar voor start, match → plaatsing (klaar van klaar plus afgewezen), time-to-fill (vacature geopend → ingevuld), doorlooptijd (geselecteerd → klaar voor start) |
| Bedrijf (schooljaar) | omzet (projecten behalve gestopt, offerte en onduidelijk), scholen met een project, ondersteuners ingezet, verlengingspercentage (verlengd van verlengd plus stopt) |

**Doelen** worden gezet per persoon, per team (`team:<team>`) of voor het bedrijf (`bedrijf`), steeds per week, maand, kwartaal of schooljaar. Bij "dagen" is een doel gehaald als je er onder blijft.
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
| Flexkrachten, plaatsingen, contracten (OvO), roosters, uren, declaraties | **XPS** | daar werkt talent al, met de app voor de flexkrachten |
| Bezetting en kandidaatstatus in het dashboard | **kopie uit XPS** (later automatisch) | de AM en consultant zien de voortgang zonder XPS te openen |

**XPS: wat we nu het best kunnen doen**
1. **Geen tweede plaatsingssysteem.** Talent blijft plaatsen in XPS. In het dashboard zet talent per vacature alleen de kandidaten die de AM moet zien, met hun XPS-nummer. Zodra de import er is (v4.3), gaat dat vanzelf.
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
   2. Anders: talent exporteert wekelijks die lijsten uit XPS en zet ze in een vaste Drive-map; het dashboard leest ze 's nachts in.
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
5. **v4.3 Koppelingen:**
   - XPS-import (Plaatsingen, Contracten, Roosters/uren) via een export of API;
   - monday-import (bestaande borden overzetten);
   - Exact (facturen, liefst op basis van XPS-uren);
   - AFAS alleen als blijkt dat er flexkrachtgegevens in staan.
6. Daarna de overstap naar Supabase en Vercel met een eigen domein.

## 8. Open vragen

1. ⚠️ **Schooljaar:** de datum van de server (oktober 2026) geeft schooljaar 2026-2027. Is het huidige schooljaar 2027-2028, zet dat dan in Beheer → Keuzelijsten → Huidig schooljaar.
2. **XPS:** heeft XPSLogic een export of API voor Plaatsingen, Contracten en Roosters? Wordt de module Factureren gebruikt?
3. **XPS-projecten:** stoppen met Lead, Offerte en Optie in XPS en een project pas aanmaken bij Boeking?
4. **AFAS:** wat doet het talentteam precies in InSite (alleen vast personeel of ook flexkrachten, bijvoorbeeld VOG)?
5. **Interne werving:** XPS Sollicitanten of monday "Werving talent"?
