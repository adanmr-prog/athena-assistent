---
name: werving-recruiter
description: Senior-recruiter-werkwijze van AthenaSchool - kandidaten voor Onderwijsconsultant en Accountmanager sourcen, verrijken, persoonlijke LinkedIn-berichten schrijven en de pipeline bewaken in het monday-bord "Werving talent" (PoliteReach verstuurt, Lusha sourcet, monday is het kandidaten-CRM). Gebruik bij elke vraag over werving, kandidaten, talent, LinkedIn-uitnodigingen, PoliteReach, talentpool of het dagrapport werving.
user-invocable: true
---

# Werving-recruiter AthenaSchool

Eén item = één kandidaat voor één vacature. De agent schrijft, Menno keurt goed, PoliteReach verstuurt. monday.com verstuurt niets op LinkedIn.

## Systeem
- monday.com, werkruimte **CRM** (id 7828165), bord **Werving talent** (id 5105548255, `https://athenastudies-gang.monday.com/boards/5105548255`).
- monday-agent **Senior recruiter AthenaSchool** (id 110155): verrijkt elk nieuw item en draait elke werkdag 08:00 (Europe/Amsterdam) de pipelinecheck. Catalogus-skills: *Werving: kandidaat verrijken en berichten schrijven* (125740977), *Werving: dagelijkse pipelinecheck* (125740982).
- Werkwijze in monday: doc **Wervingswerkwijze AthenaSchool** (werkruimte CRM); context: doc *CRM-werkwijze AthenaSchool* (object 5105485728).
- Versturen: Claude-plugin **PoliteReach** (skills `get-started`, `outreach-skill-builder`, `start-outreach`, `queued-messages`, `answer-replies`, `inbound-invitations`, `book-agreed-calls`, `pipeline-check`). Sourcing: plugin **Lusha Talent Sourcing**.
- Alle bordacties via de monday-MCP-tools; eerst `get_board_info` (kolom-id's en labels), daarna `create_items` / `update_items` met de kolom-id's hieronder.

## Kolommen
| Kolom | id | Gebruik |
| --- | --- | --- |
| Vacature | `dropdown_mm7wjttt` | Onderwijsconsultant (1) of Accountmanager (2) |
| Fase | `color_mm7w5sjj` | pijplijnfase, zie tabel |
| LinkedIn | `link_mm7wye37` | profiel-URL |
| Huidige functie | `text_mm7w4bw3` | |
| Werkgever | `text_mm7w8175` | |
| Regio | `dropdown_mm7whgpb` | provincie of Onbekend |
| Bron | `dropdown_mm7wj4g9` | LinkedIn-zoekopdracht, PoliteReach, Lusha, Doorverwijzing, Sollicitatie (inbound), Overig |
| Fit | `rating_mm7wr32j` | 1-5 |
| Waarom interessant | `long_text_mm7wsc8p` | 2-3 zinnen met feiten uit het profiel |
| Uitnodigingsbericht | `long_text_mm7wm5x9` | max 300 tekens |
| Opvolgbericht | `long_text_mm7wcwj6` | max 600 tekens |
| Goedgekeurd | `boolean_mm7wn2w1` | alleen Menno vinkt aan |
| Uitnodiging verstuurd | `date_mm7w3nrj` | door automatisering |
| Geconnect op | `date_mm7wpwr7` | door automatisering |
| Laatste contact | `date_mm7wp5ay` | bijwerken na elk contact |
| Volgende actie | `text_mm7wfjtp` | |
| Actiedatum | `date_mm7wxzhm` | melding om 09:00 |
| Eigenaar | `multiple_person_mm7wrp3a` | Menno (118030557) |
| E-mail / Telefoon | `email_mm7w3m2e` / `phone_mm7wq7er` | |
| Notities | `long_text_mm7wd62r` | reden bij afronden |
| Dagen stil / Dagen sinds uitnodiging | `formula_mm7wy2rb` / `formula_mm7wm02g` | berekend |

## Fases (label-id) en groepen
| Fase | id | Groep |
| --- | --- | --- |
| 1. Gevonden | 17 | 1. Nieuw (`topics`) |
| 2. Bericht klaar | 0 | 1. Nieuw |
| 3. Uitnodiging verstuurd | 7 | 2. Uitgenodigd (`group_mm7w4bfb`) |
| 4. Geconnect | 3 | 3. In contact (`group_mm7whgmw`) |
| 5. In gesprek | 9 | 3. In contact |
| 6. Kennismaking gepland | 4 | 4. Gesprekken (`group_mm7wrrmj`) |
| 7. Kennismaking gehad | 14 | 4. Gesprekken |
| 8. Aanbod | 6 | 4. Gesprekken |
| Aangenomen | 1 | Aangenomen (`group_mm7wm75w`) |
| Afgewezen / Niet geïnteresseerd / Geen reactie | 2 / 11 / 10 | Afgerond (`group_mm7w82qa`) |
| Later (talentpool) | 18 | Talentpool (later) (`group_mm7wbyde`) |

Automatiseringen op het bord verplaatsen items naar de groep bij elke fasewijziging, zetten bij een nieuw item Fase op 1. Gevonden en Eigenaar op Menno, vullen de datums bij fase 3 en 4, en sturen Menno meldingen bij fase 4, 5, 6 en op de actiedatum.

## Werkwijze
1. **Sourcen**: kandidaat vinden (Lusha, LinkedIn-zoekopdracht, doorverwijzing). Item aanmaken: naam = voornaam achternaam, LinkedIn, Vacature, Bron. Niet aanmaken als naam of LinkedIn-URL al op het bord staat.
2. **Verrijken** (agent, of zelf bij een vraag van Menno): Huidige functie, Werkgever, Regio, Fit, Waarom interessant, Uitnodigingsbericht, Opvolgbericht; Fase → 2. Bericht klaar, Volgende actie "Bericht keuren", Actiedatum vandaag.
3. **Keuren** (Menno): view *Te keuren en versturen*; bericht lezen, aanpassen, Goedgekeurd aanvinken.
4. **Versturen** (PoliteReach): `start-outreach` of `queued-messages` met exact de tekst uit Uitnodigingsbericht; daarna Fase → 3. Uitnodiging verstuurd.
5. **Acceptatie**: Fase → 4. Geconnect; Opvolgbericht via PoliteReach; Laatste contact bijwerken.
6. **Gesprek**: reactie → 5. In gesprek; afspraak in Google Agenda → 6; gehad → 7; aanbod → 8; uitkomst → Aangenomen, Afgewezen, Niet geïnteresseerd of Later (talentpool), met reden in Notities.
7. **Geen reactie**: 14 dagen na de uitnodiging zonder acceptatie → Geen reactie (dagelijkse check van de agent).

## Berichtregels
- Uitnodigingsbericht: max 300 tekens, voornaam, één concrete invalshoek uit het profiel, één zin over wat Menno doet bij AthenaSchool, één open vraag. Geen vacaturetekst, geen link, geen uitroeptekens, geen emoji's. Ik-vorm namens Menno, warm en direct.
- Opvolgbericht: max 600 tekens; bedanken, de rol in één zin, kennismaking van 20 minuten, twee momenten voorstellen.
- LinkedIn-limiet: hooguit 100 uitnodigingen per week, richtlijn 10 tot 15 per werkdag, nooit in bulk. LinkedIn verbiedt automatisering door derden; versturen gebeurt per kandidaat, na goedkeuring.

## Nooit
- Zelf versturen, of versturen zonder aangevinkt Goedgekeurd.
- Gegevens verzinnen; onbekend blijft leeg of "onbekend".
- Persoonsgegevens van kandidaten in de repo, de mock of een ander systeem dan monday zetten.
- Goedgekeurd aanvinken of Fase anders zetten dan 2. Bericht klaar of Geen reactie namens de agent.

## Done (per week, verifieerbaar in monday)
- Per vacature minstens 10 kandidaten in 1. Gevonden of 2. Bericht klaar.
- Verstuurde uitnodigingen binnen de limiet; acceptatie- en antwoordpercentage in het dagrapport van de agent.
- Elke open kandidaat heeft Volgende actie en Actiedatum; elke kennismaking staat in Google Agenda.
