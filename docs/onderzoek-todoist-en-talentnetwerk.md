# Onderzoek: Todoist en systemen voor een talentnetwerk

Peildatum: 14 oktober 2026. Twee vragen van de eigenaar:

1. Veel medewerkers zijn gehecht aan Todoist. Wat maakt het zo geliefd, en bouwen we dezelfde functies in Athena of maken we een API/MCP-koppeling?
2. Hoe beheren de beste systemen een netwerk van aangemelde mensen (profiel, beschikbaarheid, functies, gedraaide diensten, beoordelingen), zodat we iets vergelijkbaars kunnen bouwen dat aan de achterkant slim is en aan de voorkant eenvoudig?

De besluiten die hierop zijn genomen staan in deel 3; het uitvoeringsplan staat in `docs/plan-taken-en-talentnetwerk.md`. ⚠️ markeert een onzekerheid, een eigen opgave van een leverancier of een eigen interpretatie.

---

## Deel 1 — Todoist

### 1.1 Plannen en prijzen (sinds 10-12-2025)

| | Beginner (gratis) | Pro | Business |
|---|---|---|---|
| Prijs | €0 | €7/maand of €60/jaar | €10 per gebruiker/maand of €96 per gebruiker/jaar |
| Persoonlijke projecten | 5 | 300 | 300 per lid; teamprojecten tot 500 |
| Eigen filters | 3 | 150 | 150 per lid |
| Activiteitengeschiedenis | 1 week | volledig | volledig, ook team |
| Bijlagegrootte | 5 MB | 25 MB ⚠️ (prijspagina zegt 100 MB) | 100 MB |
| Kalenderweergave, duur, deadlines | nee | ja | ja |
| Eigen herinneringen (tijd, locatie, herhalend) | nee; wél een automatische herinnering bij een taak met tijd | ja | ja |
| AI (Task Assist, Email Assist) | nee | ja | ja |
| Rollen admin/member/guest, centrale facturering | nee | – | ja |

Voor 20 gebruikers op Business: €1.920 per jaar. Er is geen onderwijs- of non-profitkorting. Harde grenzen op alle plannen: 300 actieve taken per project, 20 secties per project, 500 labels, 100 templates.

### 1.2 Functies

**Snel toevoegen (Quick Add, sneltoets `Q`).** Eén zin met `#Project`, `/Sectie`, `%label` (het oude `@` verdwijnt eind 2026), `p1`–`p3`, `+Naam` (toewijzen), `!14:00` (herinnering, Pro), `{30 maart}` (deadline, Pro), `for 1h` (duur, Pro). Datumherkenning werkt in de taal van de app, dus ook in het Nederlands: "morgen", "morgen om 16:00", "volgende week", "over 5 dagen", "einde maand", "elke werkdag", "om de week", "elke! 3 maanden", "elke 6 weken om 09:00 vanaf 3 jan". Sinds oktober 2026 haalt Quick Add ook taken uit geplakte tekst, afbeeldingen en documenten.

**Taken.** Datum ("wanneer je eraan werkt") en apart een deadline (Pro; zonder tijd, niet herhalend, met aftelling in de laatste week). Duur tot 24 uur. Herhalingen op alle plannen: `elke` volgt het oorspronkelijke schema, `elke!` rekent vanaf het afvinken; werkdagen, meerdere data per maand, start- en einddatum ("tot", "for 3 weeks"); een te late herhalende taak springt bij afvinken naar de eerstvolgende toekomstige datum. Beschrijving in Markdown, subtaken tot vier niveaus, secties, favorieten, kleuren, templates (galerij, eigen, CSV). Bewust geen startdatums en één verantwoordelijke per taak.

**Weergaven.** Inbox, Vandaag, Komende (tot 2 jaar vooruit; als lijst, bord of kalender), kalenderlayout (Pro: week, 3 dagen, maand; slepen naar een tijdslot), filters met querytaal (`today & p1`, `(today | overdue) & #Werk`, `assigned to: me`, `deadline before:`, `no date`, `recurring`, `search:`), zoeken met jokertekens, Reporting (voltooide taken; 7 dagen op het gratis plan), Karma (punten, dag- en weekdoel, streaks, vakantiemodus).

**Herinneringen.** Automatisch bij elke taak met tijd (alle plannen), eigen herinneringen op tijd of relatief (Pro), locatieherinneringen (Pro), "urgente" schermvullende herinneringen (iOS 26, Android), snoozen op mobiel, push en e-mail, een dagelijkse digestmail.

**Samenwerken.** Projecten delen, één verantwoordelijke per taak, commentaar met bijlagen en spraaknotities, team-workspace (gratis team met iedereen admin; Business met rollen en gasten), Project Insights.

**Integraties en platformen.** Google en Outlook Agenda (tweeweg voor taken met datum; afspraken alleen-lezen in Todoist; één account; geen sync per project), e-mail naar project en naar taak (uniek adres per project), Gmail-add-on, Slack, Zapier/Make/IFTTT/n8n, browserextensies, iOS/Android met widgets, Siri en Shortcuts, Apple Watch (met iPhone), Wear OS, desktop-apps (Electron ⚠️), offline op alle platformen, CLI `td`, API en MCP. Ramble zet spraak om in taken (ruim 40 talen, ook Nederlands).

**Sneltoetsen (web/desktop).** `Q` Quick Add, `A`/`Shift+A` toevoegen, `G` dan `I`/`T`/`U` naar Inbox/Vandaag/Komende, `/` of `F` zoeken, `Ctrl/Cmd+K` Quick Find, `E` afronden, `T` datum, `1`–`4` prioriteit, `L` label, `Shift+R` toewijzen, `V` verplaatsen, `C` commentaar, `D` deadline, `Ctrl/Cmd+Z` ongedaan maken, `?` overzicht.

### 1.3 Waarom mensen eraan gehecht zijn — en wat ze missen
Meest genoemd in reviews (2025–2026): (1) snelle invoer in natuurlijke taal; (2) overal beschikbaar met betrouwbare sync en offline; (3) eenvoud die meegroeit; (4) flexibele herhalingen, labels en prioriteiten; (5) Vandaag en Komende als dagelijkse focuslijst; (6) filters als eigen weergaven; (7) integraties; (8) sneltoetsen; (9) Ramble; (10) Karma en streaks.
Klachten: de prijsverhoging van december 2025, het beperkte gratis plan, geen startdatums, zwak als projectmanagement (geen afhankelijkheden of werkbelasting, één verantwoordelijke), beperkingen van de agendakoppeling, de limiet van 300 taken per project, AI- en MCP-koppelingen die nog ruw zijn.

### 1.4 API, webhooks en MCP (en waarom we niet koppelen)
- **API v1** (`https://api.todoist.com/api/v1`, de "unified API"; REST v2 geeft HTTP 410): tasks, projects, sections, labels, comments, uploads, `POST /tasks/quick` (dezelfde parser als de apps), `GET /tasks/filter` (querytaal), `POST /sync` met `sync_token` (incrementeel; max 100 commando's per verzoek; 1.000 gedeeltelijke syncs per 15 minuten per gebruiker), cursor-paginering, ondoorzichtige string-ids, `due_string` met `due_lang: "nl"`, `deadline_date`, `duration`. Prioriteit is omgekeerd: p1 = 4.
- **Authenticatie**: een persoonlijk API-token (lang geldig, geen webhooks) of OAuth2 (scopes `task:add`, `data:read`, `data:read_write`, `data:delete`, `project:delete`; voor nieuwe apps tokens van 1 uur met roterende refresh tokens; PKCE).
- **Webhooks**: alleen voor OAuth-apps en alleen voor gebruikers die de app hebben geautoriseerd; HMAC-SHA256 in de header `X-Todoist-Hmac-SHA256`; de ontvanger moet HTTP 200 antwoorden, anders wordt na 15 minuten tot drie keer opnieuw geleverd. Een Google Apps Script-webapp kan geen request-headers lezen en antwoordt met een 302-redirect — webhooks vereisen dus een relay (bijvoorbeeld een Cloudflare Worker).
- **MCP**: officiële server `https://ai.todoist.net/mcp` (open source `Doist/todoist-mcp`, OAuth, tools voor taken, projecten, filters, herinneringen, statistiek; maximaal 25 taken per aanroep). Vanuit een server-side toepassing bruikbaar via de MCP-connector van de Claude API, maar alleen met een OAuth-token per gebruiker dat de toepassing zelf moet verversen.
- **Conclusie**: een koppeling kost per gebruiker een abonnement of een persoonlijk token dat Athena server-side moet bewaren en bij intrekking herstellen; webhooks lukken niet zonder relay; een tweerichtingssync brengt echo- en conflictproblemen mee die blijvend onderhoud vragen; MCP voegt niets toe wat een gewone sync niet al doet; en de eigenaar wil één eigen systeem. **Besluit: niet koppelen, functies overnemen.**

### 1.5 Alternatieven als referentie
TickTick (ingebouwde kalenders, habits, Pomodoro; zwakker in natuurlijke taal en samenwerking), Microsoft To Do (gratis, sterk in Outlook; basaal), Things 3 (alleen Apple, startdatums, geen samenwerking), Google Tasks (basaal, geen tijd via de API), Any.do (verzorgd mobiel, rommelig op desktop). De lat ligt bij natuurlijke taal, herhalingen, betrouwbare sync en native herinneringen.

### 1.6 Wat Athena overneemt en wat niet kan in een PWA

| Functie | Zelf bouwen | Toelichting |
|---|---|---|
| Nederlandse snelinvoer (datum, tijd, herhaling, `#school`, `@categorie`, `p1`, `+naam`) | middel | eigen parser met live voorbeeldchip; Enter bevestigt |
| Herhalingen (`elke`/`elke!`, werkdagen, einddatum) | middel | volgende instantie bij afvinken; één open instantie per reeks |
| Tijd naast datum; deadline | makkelijk | extra kolommen |
| Vandaag, Komende, Te laat, Zonder datum | makkelijk | datumqueries op bestaande data |
| Tags, subtaken (één niveau), opgeslagen weergaven | middel | tags-infra bestaat al |
| Ongedaan maken, sneltoetsen, teller/streak | makkelijk | |
| Herinnering per mail bij een taak met tijd | makkelijk | trigger per kwartier |
| Weekagenda op de telefoon | middel | data uit `apiAgenda` |
| Push op de telefoon | zwaar | iOS 16.4+ ondersteunt Web Push voor beginscherm-webapps, maar vereist VAPID/ES256-ondertekening die Apps Script niet heeft → relay of Supabase Edge Function |
| Widgets, Siri, Apple Watch, locatieherinneringen, globale sneltoets | niet haalbaar | alleen in native apps |
| Offline schrijven, realtime sync | middel–zwaar | pas op Supabase (Realtime) |

---

## Deel 2 — Systemen voor een talentnetwerk

### 2.0 Kernconclusies
1. **XPS is XPSLogic (Amstelveen, xps.nl)**, een modulair workforce-managementsysteem "van hire tot payroll": CRM, HRM, Planning per contractvorm (flex, uitzend, vast), "AI-matchmaking" (eigen opgave ⚠️), Communicatie (koppelingen met WhatsApp Business en Twilio), Urenregistratie, Uitbetalen, Boekhouding. De werkersapp heet **FlexPS**: beschikbaarheid doorgeven, inschrijven op jobs, briefings, in- en uitklokken, uren en onkosten declareren, contracten en loonstroken, chat met planners, deeplinks vanuit WhatsApp/sms/mail. Geen API; maatwerkprijs; weinig reviews. Gevolg: zoek vóór het bouwen uit welke XPS-modules al in licentie zijn, zodat fase 1 niets dubbel doet.
2. **"Slim" betekent in deze markt zeven mechanismen**, geen zware AI: bekende goede matches eerst en daarna in golven uitbreiden; betrouwbaarheid meetbaar met openbare regels en wederhoor; automatisch onderhoud van gegevens (bevestigingsvensters, peilingen, documentherinneringen); weinig maar sterke matchsignalen; een aparte spoedmodus; feedback ingebouwd in een stap die toch gebeurt; compliance als zichtbare status.
3. **Vijf Nederlandse feiten bepalen het datamodel**: VOG per schooljaar (art. 34b WPO), Wet DBA en het rechtsvermoeden onder €38/uur, de Wtta-toelating (handhaving 2028), de ABU-cao 2026–2028 (gelijkwaardige arbeidsvoorwaarden) en de AVG-bewaartermijnen (zie 2.6).

### 2.1 Marktoverzicht

**Nederlandse flex-backoffice en ATS.** Mysolution (op Salesforce/Business Central; portaalapp met diensten bevestigen, beschikbaarheid, verlopen documenten verlengen, pushherinneringen), Carerix (recruitmentcyclus, PIXID), OTYS, Easyflex (één portaal voor organisatie, intercedent en flexwerker; planning met vervoer en huisvesting), Pivoton/Kentro (zvoove), Nocore (ERP met selfserviceportalen), Plan4Flex ("Mijn Planning", "Mijn Beschikbaarheid", 12 talen; sinds 2025 zvoove), AFAS Flex, Textkernel (semantisch matchen, cv-parsing in 29 talen), Recruitee/Tellent (AVG-automatisering), Homerun (€109–215/maand), Bullhorn (Automation: beschikbaarheidspeiling, herplaatsing vóór contracteinde; Amplify-AI). De markt consolideert onder zvoove.

**Gig- en flexplatforms met een werkersapp.**

| Platform | Opvallend |
|---|---|
| Temper (NL) | Fee €3,90–4,40 per gewerkt uur ⚠️; beoordeling 1–5 sterren + "op tijd" + vaardigheden bevestigen; annuleringsvenster 24/48/72/168 uur; no-show met wederhoor (7 dagen); "Flexpool" met voorrang bij meldingen |
| YoungOnes (NL) | Reageren met één tik; wederzijdse beoordeling; reviews klagen over laat kiezen en onbetaalde uren |
| Level.works, Maqqie, Zorgwerk (NL) | Flex pools per opdrachtgever; zorg/onderwijs/kinderopvang; VOG vergoed |
| Zenjob (DE/NL) | Eenmalig registreren, boeken met één klik, contract per job op de telefoon, voorschot binnen dagen |
| Coople (CH/UK) | Beoordelingsscherm verschijnt automatisch bij het goedkeuren van uren; favorieten direct uitnodigen; sollicitanten in volgorde: eerder aangenomen, voorgeselecteerd, favorieten, eerder ingezet |
| Instawork (US) | Performancescore over drie maanden (no-show zwaar, gemiste bevestiging middel, late annulering middel); bevestigingsvenster 36–16 uur vóór de dienst; "rosters" per bedrijf krijgen eerst de melding; badges |
| Indeed Flex (UK/US) | Levels op basis van voltooide diensten, 5-sterrenbeoordelingen en betrouwbaarheid; worker pools |
| Wonolo (US) | Strafpunten ("breaches") met vaste gevolgen; teller na 30 dagen op nul |
| Jobandtalent | Rooster, bevestigen, beschikbaarheid, inklokken met geofence |

**Onderwijsspecifiek.** Zen Educate (UK/US): matching op ervaring, maximale reisafstand, locatie, vaardigheden en kalenderbeschikbaarheid; scholen vragen aan met functie, jaargroepen (incl. SEN), data en uren en kiezen "Find me someone" of zelf; feedback met drie knoppen (ster = favoriet met voorrang, duim omhoog, duim omlaag); timesheets per persoon of "Approve all"; eigen opgave 97% vulgraad ⚠️. Swing Education (US): aanvragen "in seconden"; bij spoed (<12 uur) voorrang voor goed presterende invallers in de buurt en zichtbaarheid die stap voor stap wordt uitgebreid; dynamische bonussen; favorietenlijsten; invallers kunnen negatieve feedback betwisten. ClassCover (AU): boekingstypen Regular (wie het eerst accepteert), Flexi (dag bekend, klas later) en Pre-confirmed (al afgesproken); NSW-richtlijn: berichten gespreid naar de lijst, de hele lijst alleen in noodgevallen; groen/oranje compliance-vinkje. Scoot Education (AU): de school meldt de vraag bij de eigen consultant, die matcht — het model dat het meest op AthenaSchool lijkt. Kelly Education en Hays Education werken met platform plus centraal team. Nederland: De VervangingsManager (IJK; invalpool PO, "ruim 2.500 scholen" ⚠️), Flexonderwijs (platform als kassier), Transvita (invalpool ±300 PO-scholen ⚠️), detacheerders Maandag, Derec en Smartflexx; in 2023 stopten alle Brabantse VO-scholen met bureau-inhuur ("gemiddeld 60% duurder"). Over Lyceo, Studiekring, Noorderwijs en Driessen is geen openbare productinformatie gevonden.

**Workforce management.** Shiftbase (NL; €30–336/maand; ruilen met goedkeuring), L1NDA, Werktijden.nl, Deputy ($5–9/gebruiker; onbeschikbaarheid terugkerend of eenmalig zonder goedkeuring; open diensten met goedkeuring; agenda-sync met 8–24 uur vertraging), When I Work (reviews: te veel meldingen, geen audit), Connecteam, Planday, Quinyx (automatisch toewijzen op vaardigheden, voorkeuren, beschikbaarheid en regels), Skello (vervangingssuggesties), Rotageek (voorkeuren; "vaste eerlijkheidsregels kunnen averechts werken"). Gangbaar: beschikbaarheid als patroon (wekelijks of tweewekelijks) plus eenmalige uitzonderingen, met onderscheid tussen voorkeur en harde blokkade.

**Talent-CRM.** Beamery (pools, campagnes, duplicaten samenvoegen, toestemming), Phenom (automatische segmentatie, "silver medalists"), Gem (regels die profielen in pools zetten; toont duplicaten automatisch), Avature, Loxo (klacht: duplicaten), Vincere (toestemmingsportaal), JobAdder (outreach via e-mail, sms, WhatsApp), Bullhorn Automation (peiling "sta je open voor werk?", "Redeploy via Text"), Tellent (automatisch toestemming vragen; verwijderen na 30 dagen zonder toestemming; 7 dagen herstelbaar).

### 2.2 Functie-inventaris
S = standaard in de markt, O = onderscheidend. V1 = advies voor de eerste versie: M must-have, L later, K kopen/koppelen, N hoort niet in de module.

**Profiel van de werker**

| Functie | Waarom | Voorbeeld | S/O | V1 |
|---|---|---|---|---|
| Basisgegevens (naam, mobiel, e-mail, postcode), foto optioneel | contact, afstand, herkenning | alle | S | M |
| Functies/rollen (meerdere) met niveau; sector en doelgroep (PO, VO, MBO, SO; jaargroepen; SEN) | basis van elke filter; scholen vragen er expliciet naar | Zen, Quinyx | S | M |
| Vakken en niveaus (VO) | matching voor docenten en tutoren | – | O | M |
| Opleiding, diploma's, bevoegdheden met verificatiestatus | kwaliteit en wettelijke eisen | Zen controleert kwalificaties; NSW accreditatiestatus | S | M |
| Certificaten met vervaldatum (VOG met afgiftedatum, BHV, EHBO) | wettelijk en veiligheid | NSW groen/oranje; Mysolution verlengen; Instawork geverifieerd | S | M |
| Talen; mobiliteit (rijbewijs, auto, maximale reisafstand/-tijd, regio's) | internationale scholen; opkomst | Zen: maximale reisafstand | S | M |
| Voorkeuren (schooltype, dagdelen, vast of inval, maximum uren) | acceptatiekans en behoud | Zen, Rotageek | S | M |
| Contractvorm per plaatsing (payroll, uitzend, loondienst, zzp) en referentieschaal | Wet DBA, Wtta, cao | XPS plant per contractvorm | S | M (berekening in XPS = K) |
| Bankgegevens, BSN, ID-kopie | alleen bij werkgever/payroller | payroll | – | **N** — alleen "ID gecontroleerd op [datum] door [wie]" |
| Documentenkluis met rechten en bewaartermijn; bio/pitch; bron en referral; levensfase-status; toestemming en bewaartermijn; interne notities en tags; profiel-compleetheidsmeter | bewijs richting school; activatie; AVG | Zen; Temper; Gem; Tellent; Instawork | S/O | M |
| Video-intro; badges en vaardigheidsverificatie | onderscheidend | Temper, Instawork | O | L |

**Beschikbaarheid**

| Functie | Waarom | Voorbeeld | S/O | V1 |
|---|---|---|---|---|
| Weekpatroon per dagdeel (weekdag × ochtend/middag/avond), geldig van–tot | kernsignaal voor matching | Deputy, Social Schedules | S | M |
| Uitzonderingen (vakantie, tentamens, ziek) | voorkomt verkeerde aanbiedingen | Deputy, TimeForge | S | M |
| Drie standen: beschikbaar, liever niet, niet | nuance zonder gedoe | TimeForge (voorkeur vs blokkade) | O | M |
| Beschikbaar vanaf/tot; maximum uren per week | planning op termijn; contractgrenzen | Quinyx | S | M |
| Periodieke bevestigingspeiling met één tik; vervaldatum van de opgave | gegevens blijven actueel; geen schijnbeschikbaarheid | Bullhorn-peiling; Instawork-bevestigingsvenster | O | **M** |
| "Zoekt werk"-schakelaar; dagen waarop iemand niet benaderd wil worden | respect en betere respons | Zen | O | M |
| Blokkeren per school (in beide richtingen) | werkplezier en kwaliteit | Instawork "block", Temper onzichtbaar maken | O | M |
| Schoolvakanties en studiedagen als uitzonderingen op reeksen | onderwijsspecifiek | – | O | M |
| Agenda-koppeling (ICS-feed) | minder no-shows | Deputy WebCal (8–24 uur vertraging) | S | L (ICS is goedkoop) |

**Diensten en plaatsingen**

| Functie | Waarom | Voorbeeld | S/O | V1 |
|---|---|---|---|---|
| Project (school, contactpersoon, periode, urenbudget, tarief) | facturatie en rapportage | Swing budgetten | O | M |
| Dienst (datum, tijd, pauze, locatie, functie, eisen) en reeks (vaste dagen t/m einddatum, met uitzonderingen) | basiseenheid; het meeste werk in onderwijs | Zen, Swing | S | M (fase 2 in Athena; fase 1 via XPS) |
| Statusmodel: open → aangeboden → geaccepteerd → bevestigd → uitgevoerd → uren goedgekeurd → gefactureerd; zijtakken afgemeld (door wie, wanneer, reden) en no-show | overzicht en metingen | ClassCover, Temper | S | M |
| Aanbieden gericht, shortlist, cascade in golven, broadcast (wie het eerst komt); pre-confirmed | snelheid zonder spam | ClassCover, NSW, Instawork | S (cascade O) | M |
| Flexi-/stand-bydag; ruilen of overdragen | invalpools; minder uitval | ClassCover Flexi; Shiftbase, Skello | O/S | L (continuïteit telt zwaarder) |
| Annuleringsbeleid (termijnen, vergoeding, reden); no-show met wederhoor en beslistermijn | eerlijkheid en meten | Temper | S/O | M |
| Dubbele boekingen voorkomen; correcties met audit | basishygiëne; geschillen | Quinyx; klacht bij When I Work | S | M |
| Reiskosten en pauzes; uren bevestigen door werker én school ("alles goedkeuren") | uitbetaling en factuur | FlexPS, Zen, Coople | S | M (velden), K (berekening) |
| Klokken via app, QR of geo | bewijs van aanwezigheid | Jobandtalent, FlexPS, Deputy | S | N/L |
| Export naar payroll en facturatie (CSV of API; SETU als denkmodel) | geen dubbele invoer | SETU TimeCard | S | M |
| Continuïteit: bij inval eerst iemand die de school al kent | leerlingen hebben baat bij vaste gezichten | Zen-favorieten, Scoot | O | M |

**Beoordelingen en kwaliteit**

| Functie | Waarom | Voorbeeld | S/O | V1 |
|---|---|---|---|---|
| Snelle reactie per dienst/plaatsing met drie knoppen (favoriet, goed, niet geschikt) + optioneel tekst | hoge respons, direct bruikbaar voor matching | Zen | O | M |
| Beoordeling ingebed in een stap die toch gebeurt (uren goedkeuren, evaluatie) + uitschakelbare herinnering | respons | Coople | O | M |
| Werker beoordeelt de school ("zou je hier weer werken?") | behoud; signaal over de school | YoungOnes, Swing | O | M (één vraag) |
| Wederhoor of bezwaar | eerlijkheid | Swing, Temper | O | M (als proces) |
| Sterren met criteria; badges en levels; periodieke evaluatie per plaatsing | fijnmaziger; motivatie | Temper, Coople, Instawork | S/O | L |
| Betrouwbaarheid: opkomst, op tijd, late afmeldingen over een rollende periode (90 dagen) | voorspelt kwaliteit | Instawork, Wonolo, Indeed Flex | O | M (transparante tellers), score L |
| Favoriet / niet meer inzetten per school; interne notities; incidentregistratie; certificaatherinneringen | input voor matching; veiligheid; compliance | Zen, Instawork, Temper, Coople, Mysolution | S | M |

**Matching en slimheid**

| Functie | Waarom | Voorbeeld | S/O | V1 |
|---|---|---|---|---|
| Harde filters: rol, sector, VOG geldig voor het schooljaar, beschikbaar, niet geblokkeerd, geen dubbele boeking, binnen reisbereik | geen ongeldige voorstellen | Quinyx | S | M |
| Ranking met uitleg per onderdeel (functie × kwalificatie × beschikbaarheid × afstand × relatie met school × beoordeling × voorkeur) | vertrouwen; AVG art. 22 en AI Act | Zen; XPS "AI-matchmaking" ⚠️ | O | M (regelgebaseerd) |
| Historie bij de school weegt zwaar; kandidaten voorstellen bij een vacature | continuïteit; snelheid | Zen, Coople; Textkernel, JobAdder | O | M |
| Spoedmodus (dichtbij en betrouwbaar, kring stap voor stap verbreden) | vulgraad bij spoed | Swing | O | L/M |
| Reistijd (eerst afstand op postcode, later een reistijd-API) | opkomst | Zen; PDOK | S | M (afstand), L (reistijd) |
| Slapende profielen heractiveren met een één-tik-peiling; automatische herinneringen (documenten, VOG, beschikbaarheid, uren) | pool levend houden; minder handwerk | Bullhorn, Gem, Beamery; Mysolution, Instawork | O/S | M |
| "Wie moet ik vandaag benaderen"-lijst; duplicaten opsporen (e-mail, mobiel) | focus; datakwaliteit | Bullhorn; Gem, Beamery | O/S | M |
| Uitval of no-show voorspellen (ML); semantisch zoeken en cv-parsing; AI-samenvatting en outreach-concepten; eerlijke spreiding | leverancierclaims; grote databases | HyperTrack ⚠️; Textkernel; Bullhorn Amplify; Rotageek | O | L/K (te weinig data voor ML) |

**Communicatie**

| Functie | Waarom | Voorbeeld | S/O | V1 |
|---|---|---|---|---|
| E-mail (transactioneel), templates met variabelen, communicatielog per persoon, opt-in/opt-out per kanaal | bevestigingen; consistentie; bewijs; verplicht voor WhatsApp | alle | S | M |
| Bevestiging + herinnering de dag ervoor met "bevestig"/"meld af"; deeplinks "accepteer via link" | minder no-shows; minder drempels | Instawork; FlexPS | S/O | M |
| Broadcast van open diensten met cascade en frequentieplafond | vullen zonder spam | NSW | O | M (fase 2) |
| Push; sms (terugval en codes); WhatsApp Business API (templates, opt-in, 24-uursvenster) | gratis en snel; bereik; het kanaal dat mensen gebruiken | ClassCover; Twilio; JobAdder, XPS | S/O | L/M (één kanaal kiezen) |
| Chat in de app; meertaligheid | snelle vragen; bereik | FlexPS; Plan4Flex | S | L |

**Zelfservice voor de werker**

| Functie | Voorbeeld | S/O | V1 |
|---|---|---|---|
| Inloggen zonder drempel (magic link of sms-code; Google/Apple later) | tegenvoorbeeld: Plan4Flex met klantcode | O | M |
| Profiel en beschikbaarheid bijwerken; documenten uploaden; diensten zien, accepteren, afmelden; uren indienen | Plan4Flex, Mysolution, Zen, Zenjob, ClassCover, FlexPS | S | M (beschikbaarheid in fase 1; rest fase 2) |
| Loonstroken en contracten; contract tekenen | FlexPS, Plan4Flex, Zenjob, Nocore | S | K (via XPS/payrollpartner) |
| Eigen feedback en status inzien; vrienden aandragen | Indeed Flex | O | L |
| Account verwijderen, gegevens downloaden (AVG art. 17 en 20) | – | S | M |

### 2.3 UX-lessen van de beste apps
1. Eén scherm "mijn week": bevestigde diensten boven, openstaande aanbiedingen onder, één primaire knop per kaart (Plan4Flex, Zen).
2. Accepteren met één tik; wie het eerst tikt krijgt de boeking (ClassCover, YoungOnes, Zenjob). Swipen kwam nergens voor; grote tikdoelen wel.
3. Beschikbaarheid als raster weekdag × dagdeel met drie standen, plus een aparte lijst uitzonderingen.
4. Kleuren en vinkjes voor status (NSW groen/oranje; diensten open/aangeboden/bevestigd/uitgevoerd/probleem).
5. Weinig velden bij aanmelding, de rest later (Temper, Zenjob); compleetheidsmeter die de volgende concrete stap noemt ("Upload je VOG om voor PO-scholen in aanmerking te komen").
6. Meldingen in golven, gebundeld en uitschakelbaar, elk met één actie; stille uren en een frequentieplafond. Te veel of onbetrouwbare meldingen zijn de meest voorkomende klacht (Deputy, When I Work).
7. Deeplinks vanuit WhatsApp, sms en e-mail direct naar de actie, zonder eerst in te loggen.
8. De schoolkant even eenvoudig: aanvragen in seconden, "Find me someone", uren met één klik goedkeuren, feedback met drie knoppen op het moment dat de school toch al iets doet.
9. Een agendafeed van bevestigde diensten, met eerlijke uitleg over de vertraging van Google.

### 2.4 Bouw- en architectuurlessen
- **Beschikbaarheid**: patroon plus uitzonderingen (iCalendar: RRULE ∪ RDATE − EXDATE); voor snelle matching een gematerialiseerde dagtabel voor de komende ±16 weken, met per dagdeel de stand en hoe zeker die is (bevestigd of afgeleid), en `beschikbaarheid_bevestigd_op` om verouderde opgaven te herkennen. Rekenen in Europe/Amsterdam en pas daarna naar UTC.
- **Diensten**: opslaan als reeks (RRULE + EXDATE voor vakanties en studiedagen) maar instanties direct aanmaken; elke instantie heeft eigen bezetting, status, uren en feedback. Eén instantie wijzigen via een koppeling aan de reeks (RECURRENCE-ID); "deze en volgende" door de reeks te splitsen. Entiteiten: project, dienst_reeks, dienst, toewijzing (statustijdstempels, wie annuleerde, reden), aanbieding (golf, kanaal, geopend, antwoord), timesheet (gepland en werkelijk, goedgekeurd door werker en school, exportbatch).
- **Beoordelingen**: per dienst een snelle reactie (enum + optioneel tekst/criteria) en per plaatsing een periodieke evaluatie; daaruit een afgeleide relatiestatus werker–school (favoriet, neutraal, geblokkeerd) met bron en datum; zichtbaarheid apart (werker, intern, school).
- **Betrouwbaarheid en matchscore**: tel gebeurtenissen over 90 dagen met eigen gewichten (no-show zwaar, late afmelding middel, gemiste bevestiging licht), laat oude vervallen, toon de tellers en laat een melding pas meetellen na wederhoor. Matchscore als startpunt (kalibreren met eigen data): harde filters eerst; dan rol/kwalificatie 25, relatie met de school 20, zekerheid van de beschikbaarheid 15, afstand 15, betrouwbaarheid 10, beoordeling 10, voorkeur 5; daarna een kleine eerlijkheidscorrectie. Leg per voorstel de onderdelen en de keuze vast (uitlegbaarheid, art. 22 AVG, data om gewichten bij te stellen).
- **Audit-trail**: append-only log met actor, actie, entiteit, waarden voor en na, tijdstip en reden; ook leestoegang tot gevoelige documenten (VOG) loggen.
- **Standaarden**: iCalendar RFC 5545; SETU (NL-uitzendketen: StaffingOrder, Assignment, TimeCard, Invoice via Peppol) als datamodel en naamgeving; HR Open; PDOK Locatieserver voor gratis geocoding van postcodes.

### 2.5 Communicatiekosten in Nederland
WhatsApp Business Platform rekent sinds 1-7-2025 per afgeleverd templatebericht: utility en authenticatie ≈ $0,05, marketing ≈ $0,16 (tarieven per 1-10-2026 via derde partij ⚠️; utility is gratis binnen een open 24-uursvenster); Twilio rekent $0,005 per bericht bovenop. Sms via Twilio ≈ $0,1143 per uitgaand segment; een mobiel nummer $7,70 per maand. Rekenvoorbeeld 300 werkers × 8 transactionele berichten per maand: alles per sms ≈ $275, WhatsApp-utility ≈ $132, push en e-mail ≈ 0. Risico's: opt-in verplicht per categorie; veel blokkades verlagen de verzendlimiet; een broadcast "nieuwe dienst beschikbaar" kan door Meta als marketing worden ingedeeld ⚠️. Advies: push of e-mail als standaard, WhatsApp-utility voor aanbiedingen, sms als terugval.

### 2.6 Beheer en compliance (Nederland)

| Onderwerp | Feit | Gevolg voor de module |
|---|---|---|
| Bewaartermijn sollicitanten | NVP Sollicitatiecode: binnen 4 weken na afwijzing vernietigen, tenzij expliciet anders afgesproken; na een jaar opnieuw toestemming vragen; stilzwijgend verlengen mag niet. Voor ingeschreven poolleden is geen vaste publieke termijn gevonden ⚠️ (secundaire bron: maximaal 2 jaar na de laatste werkdag) | grondslag, toestemmingsdatum en verloopdatum per profiel; geautomatiseerde verlengvraag en verwijdering; eigen beleid vastleggen (bijv. 24 maanden na laatste contact/plaatsing) |
| ID-kopie en BSN | een uitzendbureau mag bij inschrijving een ID-kopie maken (maximaal 4 weken bewaren als iemand niet gaat werken); bij indiensttreding is de werkgever verplicht tot een ID-kopie van voor- en achterkant; gezondheid mag niet worden uitgevraagd; payroll- en ID-gegevens ten minste 5 jaar na uitdiensttreding, fiscaal 7 jaar ⚠️ | **BSN, ID-kopie en IBAN horen niet in de talentmodule** maar bij de juridische werkgever of payroller (XPS); in de module alleen "identiteit gecontroleerd op [datum] door [wie]" |
| VOG in het onderwijs | art. 3 en 3a WPO: VOG vereist voor onderwijs én onderwijsondersteunend werk; art. 32 lid 9: bij benoeming of tewerkstelling niet ouder dan 6 maanden; **art. 34b** (aanvullend onderwijs, sinds 1-1-2025): de school bewaart een afschrift en controleert ieder schooljaar vóór de eerste inzet of de VOG niet ouder is dan 6 maanden; bij ingehuurd personeel regelt het bureau de VOG en controleert de school. VOG ≈ €33,85 via Justis; organisatie kan de aanvraag klaarzetten via eHerkenning, kandidaat bevestigt met DigiD. ⚠️ WVO 2020 en WEC niet nagelezen | afgiftedatum vastleggen, controle per schooljaar, herinneringsrun in mei/juni, afschrift delen met de school, status groen/oranje; termijn als instelling |
| Wet DBA en zzp | handhaving sinds 1-1-2025 met naheffingen tot 1-1-2025; volgens de VO-raad is zzp als docent "meestal" schijnzelfstandigheid en is voorzichtigheid nodig bij ondersteuning; een intermediair geeft "geen garanties"; rechtsvermoeden van een arbeidsovereenkomst onder €38/uur (Eerste Kamer 16-6-2026; uiterlijk 31-12-2026 in werking) | contractvorm per plaatsing; zzp met verplichte DBA-checklist en waarschuwing onder €38/uur; standaard payroll of uitzend |
| Wtta (vervangt de Waadi-registratie) | in werking 1-1-2027; aanmelden 1-11 t/m 31-12-2026; aanvragen 1-5 t/m 30-6-2027 met SNA-keurmerk of inspectierapport; handhaving 1-1-2028, ook voor inleners | per plaatsing vastleggen wie de uitlener is en het toelatingsnummer; laten toetsen of inzet van ondersteuners onder leiding van de leraar uitlenen is |
| Cao en gelijkwaardige arbeidsvoorwaarden | ABU-cao 29-12-2025 t/m 31-12-2028: inlenersbeloning vervalt en wordt gelijkwaardigheid van het totale pakket; pensioen vanaf dag 1 (18+); de inlener levert de voorwaarden van vergelijkbaar vast personeel aan. ⚠️ NBBU en payroll niet opnieuw gecontroleerd | per school/functie de referentiefunctie, cao (PO/VO) en schaal vastleggen en doorgeven aan XPS |
| Wet meer zekerheid flexwerkers | Eerste Kamer 7-7-2026; grotendeels per 1-1-2028: oproepcontracten worden bandbreedtecontracten (maximaal 30% boven het minimum), uitzondering voor bijbanen van scholieren, studenten en AOW'ers; ketenregeling pas na 3 jaar onderbreking | student/bijbaan als veld; gevolgen voor contracten van flexibele ondersteuners |
| AVG art. 22 en AI Act | een score die een besluit grotendeels bepaalt kan onder art. 22 vallen, ook met een mens die beslist (Schufa-arrest; AP-advies 10-10-2024); AI Act hoog-risico "werk" uitgesteld naar 2-12-2027; of een regelgebaseerde score met door mensen gekozen gewichten een "AI-systeem" is: waarschijnlijk niet ⚠️ | mens in de lus; uitleg per score; geen automatische uitsluiting op betrouwbaarheid; DPIA overwegen |
| Verwerkersovereenkomsten | met alle SaaS-leveranciers (sms, WhatsApp, hosting, LLM) en afspraken met scholen over het delen van profielen en VOG-afschriften | verwerkingsregister bijhouden |

### 2.7 Rapportage (KPI's)
Vulgraad (gevulde / aangevraagde diensten per school, functie, week), time-to-fill (mediaan; spoed apart), acceptatiegraad per aanbieding, opkomst/no-show/late afmelding per werker en school, op tijd, gemiddelde beoordeling en favorieten, uren per school/project/maand, omzet en marge per plaatsing (uit XPS), dekking van de pool (actieve en recent bevestigde mensen per regio × functie × dagdeel tegenover de vraag), actief/slapend/uitstroom, funnel aangemeld → gescreend → VOG oké → actief → eerste dienst, compliance (percentage actieven met geldige VOG; verlopen certificaten). Marktreferenties (eigen opgave ⚠️): Swing 94% vulgraad, Zen 97%, Temper 98,5% opkomst.

### 2.8 Conclusies voor de bouw
**Must-have voor een eerste versie** (bureau met enkele honderden mensen): één profiel per persoon met compleetheidsmeter; VOG-beheer per schooljaar; beschikbaarheid als raster met drie standen, uitzonderingen en een periodieke bevestigingspeiling met één tik; projecten, reeksen en diensten met het volledige statusmodel (zolang dat in XPS zit: plaatsingen en uren als import); matching met harde filters en een uitlegbare ranking met voorrang voor continuïteit en favorieten; e-mail plus één mobiel kanaal met deeplinks; de schoolkant zonder account; relatiestatus werker–school in beide richtingen, interne notities, transparante betrouwbaarheidstellers, minimale incidentregistratie; uren en export naar XPS; AVG-basis (geen BSN/ID/IBAN, bewaartermijnen, audit-log, inzage en verwijdering); rapportage; duplicaatcontrole en heractivatie van slapende profielen.
**Pas later**: native app, chat, push, sterren met criteria, badges, ruilen, spoedmodus met bonus, reistijd-API, tweezijdige agenda-sync, ML-voorspellingen, cv-parsing, eerlijkheidsalgoritmen, referral, klokken.
**Kopen of koppelen**: payroll en contracten (XPS, later een payrollpartner), sms/WhatsApp (Twilio/Bird), e-handtekening, identiteitscontrole (bij de werkgever), VOG-aanvraag (Justis), geocoding (PDOK), later cv-parsing (Textkernel).
**Valkuilen uit reviews**: meldingen die niet werken of te veel zijn; glitches tussen planning, app en uren (en onbetaalde uren); vervuilde gegevens (dubbele profielen, verouderde beschikbaarheid, verlopen documenten); kosten en complexiteit per gebruiker; eenzijdige geschillen zonder wederhoor of audit.

---

## Deel 3 — Besluiten (14-10-2026) en vervolg
1. **Todoist**: geen koppeling en geen MCP. Athena neemt de functies over: v4.5 (snelinvoer in het Nederlands, herhalingen, tijd, Vandaag/Komende, ongedaan maken, sneltoetsen, meldingen en rechten) en v4.6 (tags, subtaken, opgeslagen weergaven, weekweergave, herinneringsmail, voortgang); push later (v4.7 of op Supabase).
2. **XPS**: op termijn vervangen. Fase 1 (v5.0) op de Sheet-backend naast XPS: profiel, beschikbaarheid, documenten/VOG, relaties met scholen, beoordelingen, matching, uren uit de XPS-export, rapport. Fase 2 (v6.1+) op Supabase: diensten, toewijzing in golven, uren bevestigen, werkers-PWA, schoolfeedback, WhatsApp/sms, push, payroll-export; XPS uitfaseren.
3. **Zelfservice fase 1**: licht — aanmelden via een formulier met weinig velden en toestemming; beschikbaarheid bevestigen of aanpassen via een mail-link, zonder inlog.
4. **Beoordelen fase 1**: de accountmanager per plaatsing (drie knoppen + toelichting, periodiek) en het talentteam intern; schoolfeedback via link in fase 2.

Het uitvoeringsplan per release staat in `docs/plan-taken-en-talentnetwerk.md`.

---

## Bronnen
Geraadpleegd op 14-10-2026; datum = laatst bijgewerkt of gepubliceerd volgens de pagina.

**Todoist**
- https://developer.todoist.com/api/v1/ en https://developer.todoist.com/openapi.json (API v1, OAuth, webhooks, sync)
- https://todoist.com/.well-known/oauth-authorization-server · https://ai.todoist.net/.well-known/oauth-protected-resource
- https://www.todoist.com/pricing · plans-FAQ https://www.todoist.com/help/account-and-billing/plans/todoist-plans-pricing-and-billing-faq-Vq2z0HWL6 (08-10-2026) · prijsupdate 2025 https://www.todoist.com/help/articles/todoist-pricing-and-plans-update-2025-everything-you-need-to-know-Tn6Pg1JKI · Business https://www.todoist.com/help/articles/todoist-business-plan-pricing-update-dF5in65YM · korting https://www.todoist.com/help/articles/do-you-offer-a-discount-uYpvgw4gv · Pro Legacy https://www.todoist.com/help/articles/pro-legacy-plan-njefgq1UE
- Gebruikslimieten https://www.todoist.com/help/articles/usage-limits-in-todoist-e5rcSY (06-10-2026)
- Quick Add https://todoist.com/help/articles/task-quick-add-va4Lhpzz (01-09-2026) · talen https://www.todoist.com/help/todoist/get-started/change-languages-in-todoist-EJZMow · labels https://www.todoist.com/help/articles/introduction-to-labels-dSo2eE · herhalingen https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV en de NL-versie · datums NL https://www.todoist.com/nl/help/articles/introduction-to-dates-and-time-q7VobO · deadlines https://www.todoist.com/help/todoist/features/introduction-to-deadlines-in-todoist-uMqbSLM6U · duur https://todoist.com/help/articles/set-a-task-duration-L1kYkZv8d · subtaken https://www.todoist.com/help/articles/introduction-to-sub-tasks-kMamDo
- Filters https://www.todoist.com/help/articles/introduction-to-filters-V98wIH (13-10-2026) · kalenderlayout https://www.todoist.com/help/articles/use-the-calendar-layout-in-todoist-lPHRQTu0o · Komende https://todoist.com/help/articles/plan-ahead-with-upcoming-view-KgKpuaGq · Vandaag https://www.todoist.com/help/todoist/get-started/plan-your-day-with-the-today-view-UVUXaiSs · Karma https://www.todoist.com/help/todoist/features/introduction-to-karma-OgWkWy
- Herinneringen https://www.todoist.com/help/articles/introduction-to-reminders-9PezfU · agenda https://www.todoist.com/help/articles/use-the-calendar-integration-rCqwLCt3G (07-10-2026) · e-mail naar taak https://www.todoist.com/help/articles/forward-emails-to-todoist-JPJ1V339 · Gmail https://www.todoist.com/help/articles/use-gmail-with-todoist-YMVdMcAx · offline https://www.todoist.com/help/articles/use-todoist-while-offline-4rbaZw · widgets/Watch/Siri https://www.todoist.com/help/articles/use-a-todoist-widget-on-an-apple-device-ptRdme
- Sneltoetsen https://www.todoist.com/help/articles/use-keyboard-shortcuts-in-todoist-Wyovn2 (08-10-2026) · changelog 2026 https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd
- Teams https://www.todoist.com/help/articles/team-roles-and-access-uGkyLrJQz · Assist https://www.todoist.com/help/todoist/todoist-and-ai/introduction-to-todoist-assist-KgPP22q5O · Ramble https://www.todoist.com/help/todoist/todoist-and-ai/dictate-to-add-tasks-with-ramble-P1Raq7vVF · startdatums https://www.todoist.com/help/todoist/troubleshooting/does-todoist-support-start-dates-qhqlgZhk
- MCP https://github.com/Doist/todoist-mcp · https://www.todoist.com/help/articles/use-claude-code-with-todoist-cli-and-mcp-b1USJ4HB3 · https://www.todoist.com/help/articles/use-todoist-with-claude-via-the-connector-ANlg7v13q · https://www.todoist.com/ai-tools
- Claude API MCP-connector https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- API v1-aankondiging https://groups.google.com/a/doist.com/g/todoist-api/c/LKz0K5TRQ9Q (05-04-2025) · REST v2 410 https://docs.airbyte.com/integrations/sources/todoist-migrations
- SDK's https://pypi.org/project/todoist-api-python/ · https://www.npmjs.com/package/@doist/todoist-sdk
- Apps Script https://developers.google.com/apps-script/guides/web · https://developers.google.com/apps-script/guides/content · https://developers.google.com/apps-script/guides/services/quotas
- Web Push iOS https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (16-02-2023) · Declarative Web Push https://webkit.org/?p=16535
- Reviews https://zapier.com/blog/best-todo-list-apps/ (12-2025) · https://blog.saner.ai/todoist-review/ · https://www.asianefficiency.com/task-management/todoist-vs-ticktick/ · https://www.xda-developers.com/todoist-ramble/ · https://talk.macpowerusers.com/t/todoist-increases-its-subscription/43385

**NL-flexsoftware en ATS**
- XPS https://www.xps.nl · review https://softwarefinder.com/hr/xps · FlexPS https://apps.apple.com/ag/app/flexps/id1214394698
- Mysolution https://www.mysolution.com/en/software/staffing · portaalapp https://apps.apple.com/gr/app/mysolution-portal/id1541799240
- Carerix https://www.capterra.com/p/191438/Carerix/ · Easyflex https://www.easyflex.nl · Nocore https://www.capterra.com/p/198172/Nocore-Flex/pricing/ · Plan4Flex https://apps.apple.com/app/id1125677458 en overname https://www.dutchitchannel.nl/news/714554/zvoove-koopt-plan4flex-en-versterkt-positie-in-nederlandse-arbeidsmarkt · Pivoton https://www.dutchitchannel.nl/news/180310/saas-provider-pivoton-fuseert-met-duitse-zvoove · AFAS Flex https://help.afas.nl/Help/NL/SE/Pro_Config_Flx_Gen.htm · Textkernel https://www.textkernel.com/solution/match/ · Recruitee https://www.capterra.com/p/140650/Recruitee/pricing/ · Homerun https://www.homerun.co/pricing · Bullhorn https://www.bullhorn.com/nl/kennisbank/waarom-bullhorn/ · https://www.bullhorn.com/news-and-press/press-releases/bullhorn-launches-amplify/ · https://kb.bullhorn.com/automation/Content/Automation/Topics/useCaseTalentEngagement.html

**Gigplatforms**
- Temper https://help.temper.works/en/articles/578341-what-is-the-cancellation-policy · https://go.temper.works/en-nl/newsroom/freelance-shift-management-improvement-tempers-solution-to-no-shows · https://go.temper.works/en-nl/newsroom/how-much-does-hiring-a-freelancer-cost · https://help.temper.works/en/articles/999977-do-i-need-experience-to-work-via-temper
- YoungOnes https://www.emerce.nl/interviews/youngones-werk-broekzak · Zenjob https://zenjob.com/en/companies/how-does-zenjob-work · Maqqie https://siliconcanals.com/crowdfunding/dutch-recruitment-platform-maqqie-that-lets-you-manage-your-professional-life-bags-e1m/
- Coople https://help.coople.com/en/articles/2619290-what-does-the-star-rating-mean · https://help.coople.com/en/articles/5223949-how-can-i-make-a-coopler-my-favourite-worker · https://help.coople.com/en/articles/16246487-reviewing-and-hiring-applicants-coople-business-app
- Indeed Flex https://indeedflex.com/employers/tech-features/ratings-and-worker-pools/ · Instawork https://help.instawork.com/en/articles/6449818-understand-your-performance-score · https://help.instawork.com/en/articles/9931314-build-a-reliable-network-of-skilled-workers · https://www.instawork.com/blog/top-things-instawork-profile · Wonolo https://www.wonolo.com/blog/breaches-badges-and-what-they-mean-to-wonoloers · Jobandtalent https://www.jobandtalent.com/job-seekers/app-download

**Onderwijs**
- Zen Educate https://zeneducate.com/ai-info · https://support.zeneducate.com/en/articles/818705-how-to-leave-educator-feedback-on-the-zen-educate-platform · https://support.zeneducate.com/en/articles/818717-managing-and-approving-timesheets · https://www.zeneducate.com/resources/zen/summer-product-development-update · https://techcrunch.com/2024/05/20/zen-educate-raises-37m-for-marketplace-that-matches-schools-with-teachers
- Swing Education https://swingeducation.com/public-schools · https://support.swingeducation.com/en/collections/12574910-swing-subs-for-substitute-teachers
- ClassCover https://au.intercom.help/classcover-aus/en/articles/45953-getting-started-understanding-the-booking-process-on-classcover · NSW https://education.nsw.gov.au/policy-library/policies/pd-2024-0484-01
- Scoot 2 Book https://apps.apple.com/us/app/id1261686469 · De VervangingsManager https://apps.apple.com/us/app/id1487643252 · Flexonderwijs https://flexonderwijs.nl/wp-content/uploads/2023/07/gebruikersvoorwaarden_professional_b.pdf · Omroep Brabant https://www.omroepbrabant.nl/nieuws/4300322/scholen-stoppen-met-de-inhuur-van-uitzendkrachten-wij-zijn-er-klaar-mee · VOION https://www.voion.nl/media/2040/folderinzetonderwijsassistenten.pdf · AOb https://flexonderwijs.nl/wp-content/uploads/2025/05/Brief-AOb-t.b.v.-commissiedebat-zzp-3-april-2025.pdf

**Workforce management en talent-CRM**
- Shiftbase https://www.shiftbase.com/pricing · https://help.shiftbase.com/exchange-requests · Deputy https://www.deputy.com/pricing · https://help.deputy.com/hc/en-au/articles/4614772805135 · https://help.deputy.com/hc/en-au/articles/4621253973519 · https://capterra.com/p/167811/Deputy/reviews/ · When I Work https://capterra.com/p/121248/When-I-Work/reviews/ · Connecteam https://connecteam.com/employee-scheduling-app/shift-scheduling/ · Planday https://lp.planday.com/how-it-works/app/for-employees · Quinyx https://quinyx.helpdocs.io/l/en/article/2cr9phb6r8-ai-powered-scheduling-in-quinyx · Skello https://www.skello.io/blog/gerer-les-echanges-de-shifts-entre-employes · Rotageek https://www.rotageek.com/blog/catering-to-employee-preferences-through-automatic-scheduling · TimeForge https://guides.timeforge.com/a/1291095-manage-employee-availability-and-requests · Social Schedules https://help.socialschedules.com/en/articles/4675371-workers-availability-faq
- Beamery https://beamery.com/resources/blog-preview/the-latest-product-news-august-2023 · https://beamery.com/resources/beamery-product/beamery-and-gdpr · Gem https://www.gem.com/blog/silver-medalists-candidate-rediscovery · https://www.gem.com/product/crm · Phenom https://platform.softwareone.com/product/phenom-talent-crm/PCP-0383-4150 · JobAdder https://jobadder.com/in-house-talent-acquisition/ · Tellent https://intercom.help/tellent-help-center/en/articles/4728999-automate-consent-requests-and-candidate-deletions (21-07-2026) · Vincere https://wix.vincere.io/media/h4xbyuty/vincere-gdpr-features.pdf

**Compliance (NL)**
- NVP Sollicitatiecode https://www.stvda.nl/-/media/stvda/downloads/publicaties/2020/2020-nvp-sollicitatiecode.pdf · AVG bij werving https://www.legiscope.com/blog/avg-werving-selectie-sollicitanten.html · inschrijven uitzendbureau https://www.salarisvanmorgen.nl/2021/12/08/inschrijven-of-in-dienst-van-een-uitzendbureau-hoe-zit-het-met-de-privacy/ · ID-kopie https://www.hrpraktijk.nl/juridisch/belonen/bewaar-kopieen-van-beide-zijden-id-bewijs/ · bewaartermijnen https://www.mkbservicedesk.nl/administratie/personeelsadministratie/bewaartermijn-personeelsdossier-dit-zijn-de-regels · ABU privacy https://www.abu.nl/kennisbank/privacy/
- WPO https://wetten.overheid.nl/BWBR0003420/2026-08-01 · Stb. 2024, 316 https://zoek.officielebekendmakingen.nl/stb-2024-316.html · dossier 36479 https://www.eerstekamer.nl/wetsvoorstel/36479_verplichtstelling_verklaring · MvT https://zoek.officielebekendmakingen.nl/kst-36479-3.pdf · VOG digitaal https://aedes.nl/governance-en-integriteit/verklaring-omtrent-gedrag-voortaan-ook-digitaal-aan-te-vragen
- Wet DBA https://vo-raad.nl/nieuws/strengere-controle-op-inhuur-zzp-vanaf-1-januari-2025 · https://www.randstad.nl/werkgevers/wet-en-regelgeving/zzp/wet-dba · rechtsvermoeden https://www.sra.nl/nieuws/000000/2026/06/rechtsvermoeden-arbeidsovereenkomst-bij-uurtarief-tot-38 · https://www.eerstekamer.nl/wetsvoorstel/36783_wet_invoering
- Wtta https://www.awvn.nl/hervorming-arbeidsmarkt/publicaties/inwerkingtreding-wtta-aanmelding-en-toelating/ · https://www.sra.nl/nieuws/004501/2026/07/gefaseerde-inwerkingtreding-wet-toelating-ter-beschikking-stelling-arbeidskrachten-wtta
- Flexwerk https://www.taxence.nl/nieuws/eerste-kamer-stemt-in-met-strengere-regels-voor-flexwerk/ · cao https://www.randstad.nl/werkgevers/hr-wet-en-regelgeving/aannemen-en-contracten/arbeidsovereenkomst/cao-uitzendkrachten · https://khn.nl/nieuws/nieuwe-uitzend-cao-en-gelijkwaardige-arbeidsvoorwaarden-wat-verandert-er-vanaf-2026 · https://www.abu.nl/app/uploads/2025/12/CAO-voor-Uitzendkrachten-2026-2028-versie-december-2025-3.pdf
- AI Act https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-omnibus-vii-deadline-delay-20260/ · AP-advies art. 22 https://www.eerstekamer.nl/overig/20241025/advies_artikel_22_avg_en/document

**Techniek en communicatie**
- WhatsApp-prijzen https://developers.facebook.com/docs/whatsapp/pricing · https://zernio.com/whatsapp-api-pricing · Twilio sms NL https://www.twilio.com/en-us/sms/pricing/nl · Twilio WhatsApp https://www.twilio.com/en-us/whatsapp/pricing · opt-in https://www.infobip.com/en/blog/how-to-collect-whatsapp-business-opt-ins · https://docs.360dialog.com/docs/messaging/overview/opt-in
- iCalendar https://icalendar.org/iCalendar-RFC-5545/3-8-5-1-exception-date-times.html · RRULE https://nylas.com/blog/calendar-events-rrules/ · SETU https://accp.econnect.eu/en/docs/learn/document-formats/formats/setu · https://forumstandaardisatie.nl/sites/default/files/2021-01/Intakeadvies-SETU.pdf · https://www.logius.nl/sites/default/files/public/bestanden/diensten/Standaarden/SETU/Leeswijzer-SETU-HR-XML-OHNL-2.0.pdf · HR Open https://assets.noviams.com/novi-file-uploads/hropen/pdfs-and-documents/04_Recruiting_SM-dd7d0929.pdf · PDOK https://cloud.r-project.org/web/packages/nlgeocoder/refman/nlgeocoder.html
