# Voorstel: teams, rechten en het trajectproces (v4)

Status: **v4.1 gebouwd** (teams, rollen en rechten; projectenbord; taskforce, vacatures, kandidaten, bezetting en meldingen); v4.2 en verder volgen. ⚠️ = aanname die bevestigd moet worden.

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

## 5. Rapporten en doelen per team

| Team | Rapport (eigen / teamlead: per persoon) | Voorbeelden van doelen |
|---|---|---|
| Consultants | pipeline, nieuwe kansen, voorstellen, gewonnen waarde, conversie, gesprekken | € gewonnen per kwartaal, x nieuwe scholen |
| Accountmanagers | lopende projecten, bezetting (gevuld/nodig), dagen tot bezetting, evaluaties, verlengingen, facturatie op tijd | 100 % bezet op startdatum, evaluatie elke periode |
| Talent | open vacatures, voordrachten, time-to-fill, match → plaatsing, doorlooptijd academy/contract/VOG | time-to-fill < 14 dagen |
| Bedrijf (iedereen) | omzet schooljaar, scholen, geplaatste ondersteuners, verlengingspercentage | door de directie gezet |

## 6. XPS en AFAS naast het dashboard (advies, oktober 2026)

**Uitgangspunt:** elk systeem blijft de bron voor wat het al goed doet. Het dashboard is de plek waar het proces per school en project samenkomt, en bewaart van de andere systemen alleen een verwijzing en de status.

| Systeem | Bron voor | Het dashboard |
|---|---|---|
| **XPS** (XPSLogic, app FlexPS) | diensten openzetten, roosters, inschrijven op klussen, uren en declaraties, contracten en loonstroken in de app | XPS-nummer per kandidaat; "Kopieer voor XPS" (v4.1); later geplande en gewerkte uren per project |
| **AFAS Profit en InSite** | personeelsdossier, contract, salaris, onboarding-workflows, VOG-registratie | AFAS-medewerkernummer per kandidaat; later contract- en VOG-status automatisch |
| **Dashboard** | scholen, kansen, projecten, taskforce, vacatures, matching (kandidaat per vacature), facturatie | — |
| **Academy** (eigen platform) | modules | status academy op de kandidaatkaart (nu met de hand) |

**XPS: wat we nu het best kunnen doen**
1. Niets dubbel bijhouden. Diensten, roosters en uren blijven in XPS; het dashboard toont alleen per kandidaat het XPS-nummer.
2. De knop "Kopieer voor XPS" op de kandidaatkaart (v4.1) zet naam, contactgegevens, school, functie, dagen en tijden en start klaar om te plakken. Zo hoeft niemand dubbel te typen tot er een koppeling is.
3. Vraag XPSLogic (info@xps.nl) om:
   - een API of webhooks;
   - anders standaardexports (CSV/Excel) van de flexpool, de diensten per opdrachtgever (school) met de bezetting, en de gewerkte uren per opdracht.
4. v4.3: een nachtelijke import van die export (vaste Drive-map of API). Per project ziet de AM dan geplande en gevulde diensten en gewerkte uren. Die uren voeden de facturatie: uren × tarief naar Exact. Dat is de grootste winst, want facturatie wordt nu met de hand ingevuld.
5. Kijk in XPS onder rapportage, exporteren en instellingen (koppelingen, API, webhooks) wat er al kan. Stuur een geanonimiseerd voorbeeld van een export, dan bouw ik de import erop.

**AFAS en InSite: wat we nu het best kunnen doen**
1. **Eén plek voor de wervingspijplijn.** Voor de matching per project (voorgesteld → gesprek → geselecteerd) is dat nu het dashboard, omdat het aan school, project en AM hangt. Gebruik daarnaast niet ook de module Werving en selectie van AFAS voor dezelfde stappen.
2. **Vanaf "geselecteerd" neemt AFAS het over.** AFAS heeft een UpdateConnector `HrOnboarding` die de workflow Onboarden start met de gegevens van de sollicitant. Wordt een kandidaat geselecteerd, dan kan het dashboard die workflow starten: contract en indiensttreding lopen dan in InSite zoals nu, zonder overtypen.
3. **Status terug naar het dashboard.** Een GetConnector op contracten (getekend), VOG (ontvangen, datum) en het medewerkernummer, 's nachts gelezen, zet de stappen contract en VOG op de kandidaatkaart automatisch door tot "klaar voor start".
4. **Wat de AFAS-beheerder (of jullie AFAS-partner) moet regelen:**
   - een app-connector "Athena Dashboard" met een token;
   - toegang tot `HrOnboarding` en het nummer van het onboardingprofiel;
   - twee GetConnectors: medewerkers en contracten, en VOG-status.

   Het token komt in een scripteigenschap (nooit in de code). Daarna bouw ik de koppeling (v4.3).
5. ⚠️ **VOG:** vraag de VOG aan via de werkgeversroute van Justis (aanvraag klaarzetten) en leg de ontvangstdatum vast in AFAS. Dan kan het dashboard die datum uitlezen.

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
4. **v4.2 Rapporten en doelen per team**, plus bedrijfsdoelen.
5. **v4.3 Koppelingen:** XPS (export of API), AFAS (contract/VOG), monday-import (bestaande borden overzetten), Exact.
6. Daarna de overstap naar Supabase en Vercel met een eigen domein.

## 8. Open vragen

1. ⚠️ **Schooljaar:** de datum van de server (oktober 2026) geeft schooljaar 2026-2027. Is het huidige schooljaar 2027-2028, zet dat dan in Beheer → Keuzelijsten → Huidig schooljaar.
2. **XPS:** API of export beschikbaar (zie §6)?
3. **AFAS:** wie regelt de app-connector en het token?
