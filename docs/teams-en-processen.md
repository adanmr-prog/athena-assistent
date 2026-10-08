# Voorstel: teams, rechten en het trajectproces (v4)

Status: **voorstel**, nog niet gebouwd. ⚠️ = aanname die bevestigd moet worden.

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
- `directie` ziet alles.

In de Sheet krijgt `Gebruikers` de kolommen `team` en `rol`. Zo gaan de huidige rollen over:

| Huidige rol | Wordt team | Wordt rol |
|---|---|---|
| beheerder | directie | directie |
| adviseur | consultants | medewerker |
| am | accountmanagers | medewerker |

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
| Facturatie | — | **eigen projecten** | — | team (AM-lead) | alles |
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

## 6. XPS en AFAS InSite naast het dashboard

**Uitgangspunt:** XPS en AFAS blijven de bron voor wat ze nu doen. Het dashboard bewaart alleen een verwijzing (XPS-id, AFAS-medewerkernummer) en de status die nodig is voor het proces. Zo hoeft niemand dubbel in te voeren.

| Koppeling | Wat | Hoe (in volgorde van voorkeur) |
|---|---|---|
| XPS → dashboard | kandidaten/flexkrachten, beschikbaarheid ⚠️ | 1. API als XPS die heeft. 2. Dagelijkse export (CSV/Excel) in een vaste Drive-map, die het dashboard 's nachts inleest. 3. Alleen een link per kandidaat ("open in XPS"). |
| Dashboard → XPS | geselecteerde kandidaat + project | knop "Kopieer naar XPS" (de velden klaar om te plakken) of via de API |
| AFAS InSite / Profit | contract- en VOG-status | AFAS Profit heeft een REST-API (GetConnectors met een token): het dashboard leest 's nachts de status van contracten en VOG's. De workflows blijven in InSite. |
| Academy | modules afgerond | ⚠️ afhankelijk van het platform; anders een vinkje door de talentscout |

## 7. Volgorde van bouwen

1. **v3.9 (nu):** nieuwe namen in de app: Dashboard, Assistent, Dagstart, Studio.
2. **v4.0 Teams en rechten:**
   - teams en rollen, de rechtentabel, menu per team;
   - projectstatussen zoals monday;
   - het AM-projectenbord met de weergaven Verlenging en Examentraining.
3. **v4.1 Taskforce en bezetting:**
   - tab Taskforce, vacatures, kandidaatkaarten en voordragen;
   - statussen voor academy, contract en VOG;
   - meldingen en taken.
4. **v4.2 Rapporten en doelen per team**, plus bedrijfsdoelen.
5. **v4.3 Koppelingen:** XPS (export of API), AFAS (contract/VOG), monday-import (bestaande borden overzetten), Exact.
6. Daarna de overstap naar Supabase en Vercel met een eigen domein.

## 8. Open vragen

1. **XPS:** waarvoor gebruikt talent het precies? Is het "bestand" waarin gezocht wordt XPS? Kan XPS exporteren of heeft het een API?
2. **Academy:** op welk platform draait die (voor de voortgang)?
3. Wie zijn de **teamleads**, en is directie alleen Menno?
4. Mogen consultants de **facturatie** van hun eigen projecten zien? (Voorstel: nee.)
5. Mag een AM de **historie van de kans** zien zodra het project van hem is? (Voorstel: ja, alleen van die kans.)
