# v7.3 — open punten verwerkt

Aanleiding: §5 van `docs/robuust-v7.2.md` liet zeventien bevindingen open (acht midden, negen laag), elk met een voorstel en soms met een besluit voor de eigenaar. Deze ronde verwerkt ze alle zeventien: gebouwd, besloten (⚠️) of bewust gelaten (§6). Elke gedragswijziging heeft een controle die zonder de wijziging rood is; waar dat empirisch is aangetoond (fix tijdelijk uit, suite rood) staat dat erbij.

Het werk liep in vier parallelle deelopdrachten (backend, app, tests, golf4), gevolgd door een nazorgronde voor de bevindingen die de testbouwers in de app deden en een verificatie van alle suites. Alles tegen de demo (`?demo=1`), de mock (`test/mock_backend.py`) of `Code.gs` + `demo-backend.js` in een Node-vm; niets tegen productie. Uitvoer in `test/shots/robuust/` (gitignored).

## 1. Per punt

Besluiten die §5 aan de eigenaar liet zijn genomen en staan met ⚠️; "terug" zegt hoe het terug te draaien is.

### Midden

| id | bevinding | besluit | gebouwd | bewaakt door |
|---|---|---|---|---|
| K3 | 25 api's zonder enige test, waaronder dertien schrijfpaden; negen lees-api's alleen via de golden master | — | rooktestblok "v7.3: schrijfpaden (K3)": tracks opslaan → starten → stoppen → verwijderen (ander team op een vreemde kans → "toegang"), `apiTagHernoem`/`apiVeldHernoem` (`r.aantal` = de geraakte rijen volgens de Sheet), schooljaar ('27/'28 → 2027-2028, ongeldig, reset), doelen (teruglezen via `apiDoelen` én het rapport, drie rollen), `apiFacturenMaken`, `apiMeldingenGelezen` (alleen eigen rijen), document/tekst/huisstijl opslaan, `apiCrmInrichten` (idempotent), `apiCapsuleMigratie` (alle zes stappen met een fictieve export via een `UrlFetchApp`-stub). Blok "lees-api's": één vormcontrole per lees-api. Bijvangst: twee echte bugs (§2) | `node test/node_rooktest.js`; `node test/kruistabel.js`: api's zonder test 25 → 0, alleen indirect 9 → 0 |
| H4, H5 | 58 van 157 handelingen zonder test (verwijder- en stopknoppen, Exact, export, beheer, huisstijl, talent, desktop) | ⚠️ een `golf4.py` in de demo (sessionStorage, verse context per rol) in plaats van een extra doorloop in `test_app.py`; drempel 20 als harde eis. Terug: `MAX_ZONDER_TEST` in `test/handelingen.js` | `test/handig/golf4.py` (70 controles, eigen server op 8781, dialogen geaccepteerd, zichtbaar effect per handeling: rij weg, toast, venster, chip, download, klembord); `handelingen.js` print de lijst zonder test altijd en wordt rood boven de drempel | `python3 test/handig/golf4.py`; `node test/handelingen.js` (zonder `golf4.py`: FOUT 57 > 20, gemeten door het bestand tijdelijk te hernoemen) |
| H1 | de whitelist van `apiTrajectOpslaan` loopt achter op nieuwe kolommen (fix `xpsProject` zonder test) | — | rondreis: elk whitelistveld met een eigen waarde opgeslagen en via `apiProject` teruggelezen (school via `schoolId` én vrije naam); statische vergelijking van de whitelist in `Code.gs` met de veldnamen van `trajectVelden()` in `index.html` (`UITZONDERINGEN_APP` is leeg: er bleken geen alleen-weergavevelden); dekking testwaarden ↔ whitelist in beide richtingen | rooktest H1: "elk veld van trajectVelden() (31) staat in de whitelist", "rondreis …", "de testwaarden dekken precies de whitelist" |
| R1 | `apiKans` toonde de kans achter een zichtbaar project aan iedereen die het project ziet, ook het talentteam (waarde, notities, verliesreden) | ⚠️ **beperkte kans** voor wie het project alleen op niveau `opstart` ziet (talent: project in opstart, open vacature, talentscout): naam, school en fase blijven; waarde en gewogen 0, notities/verliesreden/volgende actie leeg, geen taken of tijdlijn, `beperkt: true`, `alleenLezen: true`. De AM, zijn teamlead, de consultant als adviseur (niveau `eigen`/`team`) en het management lezen de kans volledig. Zo blijft de taskforce zien om welke kans het gaat zonder commerciële details; "pipeline = geen" alleen zou ook de AM beperken. Terug: `kansBeperkt()` laten teruggeven `false` en sectie 5 van `rechten_test.js` aanpassen | `kansBeperkt(k)`/`kansBeperktUit(k)` in `apiKans`, `apiProject.kans`, `apiCrm` (`openWaarde` telt beperkte kansen niet) en `zoek_crm`; vastgelegd boven `RECHTEN` en in `docs/teams-en-processen.md` §2 | `node test/rechten_test.js` sectie 5: talent beperkt, AM en management volledig, ook via `apiProject`, `apiCrm` en `zoek_crm`; matrix en aanvallen 0 schendingen |
| TZ-6 | `dagenSinds` en "dagen onbeantwoord" met `Math.floor` over verstreken uren: een dag te weinig in het uur na de zomertijdwissel | ⚠️ kalenderdagen: `middag()` + `Math.round`, ook voor de mails. "Wacht al n dagen", `dagenStil` en de peilingdrempels bedoelen kalenderdagen. Dit waren de laatste twee floor/ceil over 86400000 in `Code.gs` | `dagenSinds(s)`; `zoekMailsOnbeantwoord` rekent via `dagenSinds(laatste.getDate())` | rooktest TZ-6: gisteren 23:30 = 1, vandaag 00:10 = 0, eergisteren 23:59 = 2, morgen 00:05 = −1; `dagenStil` en `apiHomeMails` in kalenderdagen; `node test/tz_test.js --snel` 40 van 40 groen |
| TB-8 | het bewerkvenster kreeg bij openen geen focus, zette hem bij sluiten niet terug; Tab liep achter het venster door | ⚠️ focus-trap als `keydown`-handler op Tab (`vensterTab`), geen sentinel-elementen (die zouden als tikdoel van 0 px meten); uitwijk bij sluiten: opener → naam in de detailkop → `main` (`tabindex="-1"`). Een venster vanuit een venster houdt de eerste opener | `VENSTER.opener` = `document.activeElement` bij `openVenster`; `#vensterInhoud` (`tabindex="-1"`) krijgt `focusStil()` (`focus({preventScroll:true})` met fallback); `sluitVenster` zet terug als het venster echt open stond; Escape blijft sluiten | `python3 test/toetsenbord.py`: focus in het venster na openen vanaf een taakrij en uit een detail, 30× Tab en 10× Shift+Tab blijven binnen, focus na Escape terug op de rij of op Bewerken (6 controles, alle 6 FOUT vóór de wijziging) |
| FL-1 (zeker) | `test_app.py` was volgorde-afhankelijk: een tweede run tegen dezelfde mock faalde op `[data-klaar="a1"]` | ⚠️ beide voorstellen: een `_reset` in de mock én zelfstart in de test; stoppen via `atexit` (ook na een gefaalde assert) | mock: `_SEED` (deepcopy na de seed) en `reset()` zet alle 49 tabellen in place terug, ook de storingsteller; `POST /api {"fn":"_reset"}` en `GET /reset`. `test_app.py` start de mock op 8765 (`MOCK_CSP=1`) als de poort vrij is en stopt hem aan het eind, of zet een draaiende mock terug (een oude mock zonder `_reset` geeft een duidelijke fout en exitcode 1). Los starten blijft werken | `python3 test/test_app.py` drie keer groen: eigen mock, externe mock met verse seed, dezelfde externe mock mét state (`_reset`); de oude `test_app.py` was bij de tweede run rood (TimeoutError op regel 24) |
| FL-7 (zeker) | `test_app.py` en `ux_taken.py` meldden fouten alleen in tekst, exitcode altijd 0 | — | beide eindigen met ALLES GOED (exit 0) of FOUTEN: n (exit 1); een uitzondering geeft de traceback plus "FOUTEN: 1 (…)" via `atexit`; `ux_taken.py` telt een mislukte taak of pageerror | de eerste run met een nog niet herstelde periodewissel eindigde met exit 1; de groene runs met exit 0 |

### Laag

| id | bevinding | besluit | gebouwd | bewaakt door |
|---|---|---|---|---|
| K2 | zes backendfuncties zonder aanroeper | ⚠️ vier verwijderd (vraag-en-antwoord v1, één huisstijlveld per aanroep, de oude projectpagina, de losse notitie bij een project): uit `Code.gs`, `test/mock_backend.py`, `server/vergelijk.js`, `test/fuzz.js`, `backend/README.md` en de skill (daar alleen nog als tekst zonder het voorvoegsel api, zodat de kruistabel geen fantoom meldt). `apiArchiveer` en `apiImporteer` blijven als beheerfuncties (`backend/README.md`, sectie "Beheerfuncties zonder knop in de app (v7.3)"); de weigering voor niet-management blijft de standaardmelding "Alleen het management kan dit." Terug: uit git (de commit vóór v7.3) terughalen, mock, fuzz en golden master mee | `apiHuisstijlOpslaan` meldt nu ook "(leeg)" bij een lege sleutel (de twee rooktestregels die het oude veld-api gebruikten lopen daar nu over) | rooktest K2: `apiArchiveer` verplaatst alleen activiteiten ouder dan een jaar, is via `apiArchiefTijdlijn` te lezen en archiveert bij een tweede run niets; `apiImporteer` maakt twee scholen met een stabiel id uit de naam, een herhaalde import werkt bij, alleen management; `node test/kruistabel.js`: contract zonder fantomen |
| K4 (zeker) | de contracttabel in `backend/README.md` miste vijf api's | — | vijf rijen (`apiTalentscoutToewijzen`, `apiTaskforcePlannen`, `apiFinancien`, `apiFinancienBevriezen`, `apiExactImport`) met de argumenten uit de skill | `node test/kruistabel.js`: "contract: niet in backend/README.md —" |
| H2, H3, H4 | drie gefixte takken zonder test: Opnieuw proberen in de weekweergave, de activiteit-cache en `.rteams` in het rapport, opslaan uit een venster bóven een gevulde composer | ⚠️ H2: de geplande storing is `ok:false` met status 200 en een Nederlandse melding (een 500 zou in `test_app.py` als melding tellen en staat al in `storing.py` A). H3: precies één `apiActiviteiten` na een periodewissel (0 zou een verouderde cache betekenen), daarna terug naar maand. H4: het venster is het taakvenster van een taakrij (+ Taak opent in een detail de inline composer en zou de notitie zelf vervangen); het behoud van een paginaformulier óók in Taken (`#crmNieuw`) | mock: `{"fn":"_faal","args":["apiAgenda",1]}` laat de volgende n aanroepen van één api mislukken. `test_app.py`: `scenario_week_opnieuw` (melding met `[data-weekopnieuw]`, geen blokken, geen spinner → zeven weekblokken, precies twee `apiAgenda`-aanroepen), `scenario_rapport_cache` (`.rteams` met vier chips; maatstaf wisselen = 0 extra aanroepen, periode = precies 1), `scenario_venster_boven_composer` (alleen `apiTaakOpslaan` met het id, daarna alleen `apiActiviteitToevoegen`) en `scenario_nieuw_naast_venster` (`#crmNieuw` houdt zijn tekst en zijn eigen actie). Nazorg: de composer overleeft het hertekenen van een detail (§2) | `python3 test/test_app.py`; zonder `_faal` faalt de assert op het antwoord, zonder `data-weekopnieuw` blijft `wait_for_selector` hangen; de composer-controle gaf zonder de fix een AssertionError |
| DEK-8 | `.tag.in-aanvraag` matchte nooit: de status "in aanvraag" gaf de klassen `in` en `aanvraag` | ⚠️ de premisse klopte deels niet: `documentenTab` ging al door `statusKlasse`, alleen de demo-seed heeft geen document in die status. Besluit: `statusKlasse` is dé slug voor alle statustags (kleine letters, elke reeks niet-alfanumerieke tekens één streepje), toegepast op de vijftien plekken die `'tag ' + status` uitzonden; geen CSS-regel hernoemd. Met de standaardlijsten is er geen zichtbaar verschil; een beheerder die een waarde met spatie of hoofdletter aan een keuzelijst toevoegt krijgt nooit meer twee losse klassen | `statusKlasse(s)` = `pillKlasse(s)` zonder `p-` | `python3 test/handig/golf4.py`: nieuw document "in aanvraag" (met bestand) én het bestaande VOG-document van een talent krijgen de klasse `in-aanvraag` en de oranje achtergrond `rgb(254, 243, 224)` (gewone tag `rgb(242, 234, 244)`); met de oude `statusKlasse` zijn beide rood (mutatieprobe); `toetsenbord.py` controleert hetzelfde op het talentdetail |
| FZ-8 | dertien api's sloegen een object in een vrij tekstveld op als `[object Object]` | ⚠️ `tekstIn(v)` op alle vrije tekstvelden (±96 velden in 30 api's, 53 aanroepen), niet alleen de dertien die de fuzzer trof: de fuzzer raakt per run andere velden. Een object of lijst geeft "Dit veld verwacht tekst.", `null`/`undefined` wordt `''`, de rest wordt getrimd. De app stuurt nooit objecten, dus geen gedragsverandering voor gebruikers. Het csv-argument van `apiExactImport` niet (eigen parsing en lege-bestandmelding) | `tekstIn` in taken, activiteiten en afspraken, taskforce, kandidaten, beoordelingen, voordrachten, tracks, teksten, huisstijl, scholen, personen, kansen, projecten (`TRAJECT_TEKSTVELDEN`), talenten, vacatures, relaties, documenten, gebruikers, hernoemen, schooljaar, doelen, weergaven, facturen | rooktest FZ-8 (vier eisen: geen rij in de Sheet of de agenda bij een object); `node test/fuzz.js`: verdacht 29 → 0, 0 interne fouten, 0 rechtenlekken |
| R4 | `apiTalentOpslaan` controleerde het recht zonder rij | — | `eis('talenten', 'wijzigen', oud || null)` na het lezen van de rij | rooktest R4 (`RECHTEN` tijdelijk op `eigen`: de AM wijzigt alleen een talent uit zijn eigen projecten); `rechten_test.js` proeft `apiTalentOpslaan` nu met een rij |
| R5, R6, R7 | regels bóven `RECHTEN` die alleen uit de code bleken | ⚠️ R5: de teamlead van accountmanagement wijzigt de beoordelingen van zijn team niet (een oordeel blijft van de beoordelaar); code ongewijzigd, alleen vastgelegd. Terug: de teamleadcontrole in `apiBeoordelingOpslaan` en `UITZONDERINGEN.beoordelingGever` in `rechten_test.js` | commentaar boven `RECHTEN` (R1, R5, R6 `FACT_VELDEN`, R7 cellen zonder api) en `docs/teams-en-processen.md` §2 | `node test/rechten_test.js`: de bestaande uitzonderingen en ONBEPAALD-regels blijven de uitvoerbare spiegel, 0 schendingen |
| STORING-F-1 | na een release nam de nieuwe service worker over, maar de open pagina bleef op de oude shell zonder melding | ⚠️ geen automatisch herladen (dat zou een open venster of composer verliezen); een melding "Nieuwe versie beschikbaar" met Herladen bij `controllerchange`, alleen als de pagina bij het laden al een controller had (bij de eerste installatie niets). Eerst als `toastMetActie`; na de iOS-review (§9, R2) een vaste balk `#updateBalk` met Herladen en Later. Terug: in die listener `location.reload()` in plaats van de balk en scenario F aanpassen | registratie onthoudt `hadController`; de balk verschijnt één keer en komt na Later terug zodra de app weer in beeld komt | `python3 test/storing.py`: start "geen melding bij de eerste installatie"; F: de pagina draait door op de oude versie, toast met knop Herladen, precies één keer, na Herladen de nieuwe shell zonder koppelscherm (rood vóór de wijziging) |
| TB-9 | na Enter op een kaart of rij ging de focus bij het openen van het detail verloren | ⚠️ de naam (`<h2 tabindex="-1">`) in de detailkop krijgt focus, op desktop én telefoon (een schermlezer leest de naam, Tab gaat verder in het detail, Shift+Tab naar Terug); Escape sluit het detail niet (zou een half getypte notitie weggooien), "Terug via het toetsenbord" is Enter op de Terug-knop. Generieke regel `[tabindex="-1"]:focus { outline: none }`: alleen programmatische focus, nooit met Tab bereikbaar, dus geen zichtbare toetsenbordfocus verloren | `openDetail` → `focusDetailKop()` (ook na "Kon dit niet laden", dan Terug); `CRM.detailOpener` bij `data-crm-open`; `sluitDetail` → `focusDetailOpener()`: terug op het openende element of, na een hertekende of asynchroon geladen lijst, op het zichtbare element met dezelfde waarde (herkansingen na 350 ms en 1,5 s), anders `main`; nooit afpakken van een element dat intussen focus kreeg | `python3 test/toetsenbord.py`: pipeline, projecten en contacten: focus na openen in de detailkop, Enter op Terug sluit, focus terug op de rij of kaart (6 controles, alle 6 FOUT vóór); 1.333 tabs, 0 zonder zichtbare focus |

## 2. Gevonden en gerepareerd onderweg

De nieuwe tests vonden vijf echte fouten; elk heeft een controle die zonder de fix rood is (aangetoond door de fix tijdelijk uit te zetten).

| waar | fout | fix | test |
|---|---|---|---|
| `apiTrackStoppen` (Code.gs) | `verwijderRijen()` leest alleen de id-kolom; het filter op `trackRunId`/`status` verwijderde dus nooit een taak. Bovendien geen rechtencontrole | eerst de ids verzamelen, dan verwijderen; alleen wie de open taken mag (`taakVanMijOfTeam`) stopt de track, anders "Daar heb je geen toegang toe." | rooktest: "alleen de open taak van de run gaat weg, de afgevinkte blijft", "een ander team stopt de track niet" |
| `apiFacturenMaken` (Code.gs) | de som van de termijnen was niet de contractwaarde (basis was de omzet, afronding per termijn) en elke aanroep dupliceerde de termijnen | totaal = contractwaarde (leeg: omzet, zoals Financiën) in centen, het restant op de laatste termijn; een tweede aanroep slaat termijnen met dezelfde omschrijving en datum over | rooktest: "tien maandtermijnen tellen precies op tot de contractwaarde", "een tweede aanroep maakt geen dubbele termijnen" |
| inline composer in een detail (index.html) | opslaan uit een bewerkvenster hertekende het hele detail (`taakLokaal`/`actLokaal` → `renderDetail` → `zetDetail`) en wiste een half getypte notitie | `composerBewaar()`/`composerHerstel()` rond `zetDetail`: soort (`data-soort` op `#crmComposer`), veldwaarden, cursor, focus en scrollpositie blijven voor hetzelfde detail-id; dekt ook tabwissel en facturatie-update | `test_app.py` H4: "de notitietekst staat na het opslaan van de taak nog in de composer" (AssertionError zonder de fix) |
| `talentVenster` (index.html) | "Toch een nieuw profiel maken" opende het nieuwe profiel niet als er al een talentdetail open stond (`herlaadDetail` in plaats van `openTalent`) | een nieuw profiel opent altijd via `openTalent(r.id)`; `herlaadDetail` alleen bij bewerken | `golf4.py` stap `talent_forceer_detail` (time-out zonder de fix) |
| `golf1.py` stap 3 | datumafhankelijk: op zondag stond de eerste taak in het laatste weekblok en had slepen omlaag geen doel | richting uit de blokpositie (omlaag als er een blok onder is, anders omhoog); `GOLF1_DATUM=yyyy-MM-dd` verschuift `Date` in app én demo-iframe | `golf1.py` groen op de systeemdatum en met `GOLF1_DATUM` op een zondag, woensdag en zaterdag; de oude stap op de gefakete zondag rood |

## 3. Cijfers vóór en na

Vóór = de meting na v7.2 (§2 van `docs/robuust-v7.2.md`); na = de verificatie na alle wijzigingen.

| onderdeel | cijfer | vóór | na |
|---|---|---|---|
| kruistabel | api's zonder enige test / alleen indirect | 25 / 9 | 0 / 0 |
| | backendfuncties die de app nooit aanroept | 7 (§5 K2 telde er 6, zonder `apiExportAlles`) | 3: `apiArchiveer`, `apiImporteer` (beheerfuncties met test), `apiExportAlles` (`server/migratie.js`) |
| | `function api…(` in `Code.gs` | 103 | 99 |
| | api's die `backend/README.md` mist | 5 | 0 |
| handelingen | handelingen zonder test (drempel ≤ 20) | 58 van 157 (63 % gedekt) | 0 van 157 (100 %) |
| | data-attributen / handelingen | 175 / 157 | 176 / 157 (`data-soort` op de composer is toestand, geen handeling) |
| | dode handlers / dood markup | 0 / 0 | 0 / 0 |
| hotspots | gefixte takken zonder test | 3 (H1–H4) | 0 |
| fuzz | aanroepen (api's × 6 rollen) | 15.384 (103 api's) | 14.584 (99) |
| | interne fouten / rechtenlekken | 0 / 0 | 0 / 0 |
| | verdachte `[object Object]`-waarden | 29 | 0 |
| rechten | matrixrijen / aanvallen / schendingen | 1.010 / 89 / 0 | 1.010 / 95 / 0 |
| | cellen die `RECHTEN` niet alleen bepaalt | 7 | 7, nu alle vastgelegd boven de tabel (R1, R4–R7) |
| rooktest | controles | — | 277 (groen onder vier tijdzones) |
| mutatie | mutanten gedood | 10 van 10 | 10 van 10 |
| tijdzone | combinaties rood (`--snel`) | 0 van 40 | 0 van 40 |
| | vindplaatsen met een bevestigde afwijking | 1 (TZ-6) | 0 |
| storing | controles ok | 78 van 78 | 82 van 82 |
| toetsenbord | schermen / FOUT | 34 / 0 | 34 / 0 (1.333 tabs; nieuwe controles voor venster, detailkop, Terug en documentstatus: 12 FOUT vóór de app-wijziging) |
| test_app | runs achter elkaar tegen één mock groen | 1 (de tweede rood) | 3 van 3 |
| | exitcode bij een fout | 0 | 1 |
| golf4 | controles | — | 70 |
| ux_audit | serious/critical / tikdoelen < 24 px | 0 / 0 | 0 / 0 |
| ux_rust | max groottes / gewichten / schermen met > 1 gevulde knop | 6 / 3 / 0 | 6 / 3 / 0 |
| ux_prestatie | CLS koud | 0,016 | 0,02 |
| omvang | gewijzigde bestanden / regels (t.o.v. `main`, incl. §9 en dit rapport) | — | 23 / +1.646 −215; 67 regels `v7.3` in `Code.gs`, 26 in `index.html` plus 18 uit §9 |

## 4. Suites en looptijden

De verificatie draaide 29 runs (27 suites, `test_app.py` drie keer), alle groen op exitcode 0 plus de eigen norm; samen circa 17 minuten, de langste 247 s.

| suite | commando | resultaat | s |
|---|---|---|---|
| syntax backend | `cp backend/Code.gs <scratch>/c.js && node --check <scratch>/c.js` | ok | 0,04 |
| hook | `echo '{"tool_input":{"file_path":"index.html"}}' \| bash .claude/hooks/check-index.sh` | ok (stil, `sw.js` mee gewijzigd) | 0,1 |
| rooktest | `node test/node_rooktest.js` | 277 ok | 1,8 |
| parser | `node test/parser_test.js` | 32 ok | 0,04 |
| kruistabel | `node test/kruistabel.js` | 0 zonder test, 0 indirect, 0 fantomen | 2,3 |
| handelingen | `node test/handelingen.js` | 157 van 157 gedekt, 0 dode handlers | 0,3 |
| fuzz | `node test/fuzz.js` | 14.584 aanroepen, 0 intern, 0 lekken, 0 verdacht | 18 |
| rechten | `node test/rechten_test.js` | 1.010 rijen, 95 aanvallen, 0 schendingen | 4,2 |
| mutatie | `node test/mutatie_test.js` | 10 van 10 gedood | 15 |
| tijdzone | `node test/tz_test.js --snel` | 40 van 40 | 34 |
| server | `node server/test/server_test.js` | 54 ok | 9,2 |
| security | `node server/test/security_test.js` | 21 ok | 6,3 |
| dekking adapter | `node server/dekking.js` | 0 gaten | 0,3 |
| golden master | `node server/vergelijk.js` | 152 gelijk, 48 verklaard, 0 onverklaard | 11 |
| storing | `python3 test/storing.py` | 86 ok (na de iOS-review, §9: 82 + 4) | 85 |
| toetsenbord | `python3 test/toetsenbord.py` | 34 schermen, 1.333 tabs, 119 ok, 0 FOUT (na de iOS-review, §9: + 17 controles) | 66 |
| golf1 | `python3 test/handig/golf1.py` | 17 OK | 27 |
| golf2 | `python3 test/handig/golf2.py` | 20 OK | 18 |
| golf3 | `python3 test/handig/golf3.py` | 11 OK | 12 |
| golf4 | `python3 test/handig/golf4.py` | 70 ok | 56 |
| test_app ×3 | `python3 test/test_app.py` (eigen mock; externe mock vers; externe mock mét state) | 3× ALLES GOED, 277 api-aanroepen | 62 per run |
| inloggen | `python3 test/test_inlog.py` | meldingen: geen | 4 |
| demo rooktest | `python3 test/demo_shots.py rooktest` | meldingen: geen | 20 |
| ux_audit | `python3 test/ux_audit.py --axe <axe.min.js> --label v73` | 79 schermen, 0 serious/critical, 0 tikdoelen < 24 px | 110 |
| ux_taken | `python3 test/ux_taken.py --label v73` | 22 taakmetingen, 0 mislukt | 63 |
| ux_rust | `python3 test/ux_rust.py --label na --snel` | 165 schermen, max 6 / 3 / 1 | 247 |
| ux_prestatie | `python3 test/ux_prestatie.py 8765` (mock op 8765) | CLS 0,02 koud en warm | 8 |

Informatief, niet rood: `handelingen.js` meldt vijf verouderde attribuutnamen in commentaar van `dekking_app.py` en `toetsenbord.py`; `tz_test` noemt vier bekende reproducties en één onafgedekte vindplaats (`index.html`: `Date.now() + plusMin * 60000`, minuten, geen dagen); de kruistabel houdt `apiArchiveer` en `apiImporteer` als "dood?" (alleen mock, tests en docs: dat is de bedoeling van een beheerfunctie).

## 5. Nieuwe en gewijzigde tests

| test | commando | wat er nieuw is |
|---|---|---|
| `test/handig/golf4.py` (nieuw) | `python3 test/handig/golf4.py` | 70 controles over de 58 handelingen zonder test, per sectie, met screenshot per mislukte stap in `test/shots/robuust/golf4_<stap>.png`; vier handelingen zijn in de demo niet rechtstreeks bereikbaar en staan met reden bovenaan het bestand (`data-weekopnieuw` via een gesimuleerde storing in `AthenaDemo.run`, `data-getal` via een synthetisch voorstel, `data-walog` met onderdrukte navigatie, `data-doclink` na een upload) |
| `test/handelingen.js` | `node test/handelingen.js` | `MAX_ZONDER_TEST = 20` als eis; de lijst zonder test wordt altijd geprint |
| `test/mock_backend.py` | `MOCK_POORT=<poort> MOCK_CSP=1 python3 test/mock_backend.py` | `{"fn":"_reset"}` en `GET /reset` (seed terug, 49 tabellen); `{"fn":"_faal","args":["apiX",n]}` plant n mislukkingen voor één api (`ok:false`, status 200) |
| `test/test_app.py` | `python3 test/test_app.py` | start of reset de mock zelf; exitcode; scenario's H2, H3, H4 (twee) en de composer-controle; screenshot `15e_taken_week_opnieuw.png` |
| `test/ux_taken.py` | `python3 test/ux_taken.py` | FOUT-regel per mislukte taak of pageerror, ALLES GOED/FOUTEN: n, exitcode |
| `test/node_rooktest.js` | `node test/node_rooktest.js` | blokken "schrijfpaden (K3)", "lees-api's", "beheerfuncties (K2)", "H1", "TZ-6", "FZ-8", "R4"; eist `controleer()` met versie 7.3 |
| `test/rechten_test.js` | `node test/rechten_test.js` | sectie 5 (R1: beperkte kans voor talent, volledig voor AM en management, via `apiKans`, `apiProject`, `apiCrm`, `zoek_crm`); `apiTalentOpslaan` met rij |
| `test/fuzz.js`, `test/kruistabel.js`, `server/vergelijk.js` | — | de vier verwijderde api's eruit; de kruistabel telt `handig/golf4.py` mee |
| `test/toetsenbord.py` | `python3 test/toetsenbord.py` | detailkop, Terug, focus in het venster, 30× Tab en 10× Shift+Tab, Escape, documentstatus; §9: focus na `herlaadDetail` (tab, zijbalk, Opslaan → Bewerken), tik zonder focus als opener, naam van het venster, Annuleren onder een spinner, scrollpositie bij `focusStil` |
| `test/storing.py` | `python3 test/storing.py` | scenario F herschreven (balk `#updateBalk`, één keer, een gewone toast laat hem staan, Later → terug bij visibilitychange, Herladen → nieuwe shell, niets bij de eerste installatie) |
| `test/handig/golf1.py` | `GOLF1_DATUM=2026-10-25 python3 test/handig/golf1.py` | stap 3 kiest de sleeprichting uit de blokpositie; `GOLF1_DATUM` verschuift de klok (zoals `tz_klok.js`) |

## 6. Bewust niet gedaan

| wat | waarom |
|---|---|
| Escape sluit het detail (TB-9) | zou tekst in een open composer weggooien; Terug via het toetsenbord (Enter op de Terug-knop) is getest |
| `apiKansen` beperken (R1) | bestaat niet; `apiPipeline` filtert al op `mag('pipeline','zien')` en toont nooit kansen via een project |
| `tekstIn` op het csv-argument van `apiExactImport` (FZ-8) | een groot tekstblok met eigen parsing en lege-bestandmelding; trimmen zou de inhoud kunnen raken, en de fuzzer meldde er niets |
| de teamlead van accountmanagement laat beoordelingen wijzigen (R5) | keuze: een oordeel blijft van de beoordelaar; alleen gedocumenteerd |
| negatieve proef voor H3 en H4 tegen een gemuteerde `index.html` | de testbouwer raakte `index.html` niet; "rood zonder de wijziging" is daar met de code onderbouwd (zonder cache telt de maatstafwissel 1 in plaats van 0; zonder `VENSTER.actie`/`INLINE.actie` slaat `#crmNieuw` niets of de vensteractie op). FL-1, FL-7 en de composer-fix zijn wel empirisch aangetoond |
| iOS-review van TB-8 en TB-9 op een toestel | hoort bij de afronding door de eigenaar (§8); aandachtspunten staan daar |
| `MAX_ZONDER_TEST` lager dan 20 | §5 noemde 20; met 0 nu is elke nieuwe handeling zonder test al zichtbaar lang vóór de drempel |
| de zin "hoogstens een handvol api's zonder test" in de backend-skill | niet onjuist (het zijn er 0); de kruistabel is de bron |

## 7. Aannames (⚠️)

- ⚠️ "Handeling gedekt" betekent in `handelingen.js`: de selector staat in een testbestand. `golf4.py` koppelt daar per handeling een zichtbaar effect aan, maar in de demo; de mock-flows (Exact, facturatie) staan ook in `test_app.py`.
- ⚠️ DEK-8 heeft met de standaardlijsten geen zichtbaar verschil; het verschil komt pas bij een waarde met spatie of hoofdletter uit een aangepaste keuzelijst. De controle in `golf4.py` maakt daarom zelf een document "in aanvraag".
- ⚠️ Scenario F: na Herladen registreert de app weer `sw.js` (een andere URL dan `sw.js?v=test` uit de proefopstelling), wat op de nieuwe pagina opnieuw een `controllerchange` geeft; dat is geen echte release en wordt niet gecontroleerd. De wissel van `CACHE` zelf is nog steeds niet te onderscheppen (zie v7.2 §6).
- ⚠️ De focus-trap telt een datumveld met deelvelden als één stop; staat het als eerste of laatste element, dan springt Tab één deelveld te vroeg. Elk formulier begint met een tekstveld en eindigt met Opslaan/Annuleren.
- ⚠️ `main` heeft nu `tabindex="-1"`: een klik op lege ruimte maakt `main` het actieve element in plaats van `body`; geen handler kijkt daarnaar.
- ⚠️ De beperkte kans (R1) hangt aan het niveau waarop iemand het project ziet, niet aan het team; een toekomstige regel die talent niveau `eigen` op projecten geeft, geeft dus ook de volledige kans.
- ⚠️ `golf1.py` is op een zondag bewezen met een verschoven klok (`GOLF1_DATUM`), niet met de echte systeemdatum; de verschuiving raakt app én demo-iframe op dezelfde manier als `tz_klok.js`.

## 8. Nog te doen door de eigenaar

1. **Backend implementeren.** `backend/Code.gs` (v7.3) opnieuw plakken en als nieuwe Apps Script-versie implementeren (`/release`; de `/exec`-URL blijft gelijk). Daarna `controleer()` uitvoeren: de eerste regel moet "backend 7.3" zijn, 0 tabbladen met "AFWIJKENDE KOP", 8 van 8 triggers.
2. **`SECRET` roteren.** Open uit v7.2 §7: de uitvoer van `setup()` printte de koppelcode van de beheerder. Vervang `SECRET` in de scripteigenschappen en koppel de app opnieuw; de waarde hoort nergens in een chat, ticket of dit rapport.
3. **Mislukte Uitvoeringen (7 dagen).** Nog niet aangeleverd sinds v7.2 §7: paneel Uitvoeringen, filter Mislukt, laatste 7 dagen, per regel functienaam, tijdstip en de laatste regel van de foutmelding. Vergelijking: de nette foutenlijst uit `fuzz.json` en de meldingen in de rooktest.
4. **iOS op een toestel** (niet na te bootsen in Chromium): de lijst staat in §9 ("Op een toestel te bekijken").
5. **Gebruikers.** Na de release ziet een open PWA de nieuwe versie pas na Herladen (de balk "Nieuwe versie beschikbaar") of na één keer volledig sluiten en heropenen.

## 9. iOS-review

De subagent `ios-pwa-reviewer` beoordeelde TB-8, TB-9 en STORING-F-1 zoals gebouwd en vond zes punten (twee midden, vier laag), alle zes "zeker". Alle zes zijn verwerkt in `index.html` (achttien regels met `v7.3 (iOS-review …)`), met een controle per gedragswijziging in `test/toetsenbord.py` (17 nieuwe controles) en `test/storing.py` (scenario F, 4 nieuwe). Mutatieproef: met de fixes R1, O1, O2, O3 en O4 tijdelijk uit (sed op een kopie, suite gedraaid, bestand teruggezet) zijn 15 van de 17 nieuwe toetsenbordcontroles rood; de twee groene zijn bestaand gedrag dat de proef alleen opnieuw vaststelt ("Opslaan sluit het venster"; "het late antwoord heropent het meldingenvenster niet", dat deed de bestaande `meldLaden`-check al). Voor R2 is het oude mechanisme direct geproefd: `toastMetActie('Nieuwe versie …')` gevolgd door een gewone `toast()` wist de melding en de knop.

| id | ernst | bevinding | gebouwd | keuze | bewaakt door |
|---|---|---|---|---|---|
| R1 | midden | `focusDetailKop()` liep bij élke `herlaadDetail()` (26 aanroepers: na opslaan, afvinken, een venster, na een fout), dus VoiceOver sprong na elke bewerking naar de naam bovenaan en een net teruggezette focus (venster, composer) werd afgepakt | `openDetail`: `if (!zelfde) focusDetailKop()` in de then én de catch. `herlaadDetail` onthoudt het gefocuste element in het detail (`focusSleutel`: tag, id, data-attributen; niet in de composer) en zet het na het hertekenen terug (`zoekMetSleutel`), anders de naam in de kop; focus buiten het detail blijft staan; een focus die intussen elders landde (venster, `composerHerstel`) wordt niet afgepakt | ⚠️ verder dan het voorstel: alleen `!zelfde` zou na Opslaan in een venster de focus op `body` laten vallen, want `openDetail` zet het detail direct op een spinner en daarmee verdwijnt de opener die `focusTerugNaVenster` net focuste (vóór de fix: de kop; met alleen `!zelfde`: body). Terug: `sleutel` op `null` zetten | toetsenbord.py: schooldetail → focus op een tab, `herlaadDetail()` → zelfde tab; focus op de zijbalk → blijft; project → Bewerken → veld wijzigen → Opslaan → focus op Bewerken (3 controles; zonder de fix alle 3 op de `h2`) |
| R2 | midden | de toast "Nieuwe versie beschikbaar" deelde `#toast`: elke gewone toast wiste hem en door `versieGemeld` kwam hij in die paginasessie nooit terug; op iOS standalone leeft een pagina dagen | eigen element `#updateBalk` (`role="status"`, knoppen `data-update="herladen|later"`): op de telefoon in de flow tussen `main` en de tabbalk (niets overlapt, `main` wordt 48 px korter), op desktop rechtsonder als kaart; `versieNieuw` blijft staan: na Later komt de balk terug zodra de app weer in beeld komt (`visibilitychange` → visible); een gelijktijdige toast schuift omhoog via `body:has(#updateBalk:not([hidden]))` | ⚠️ voorstel (b), een vast element, in plaats van een herhaalbare toast; ⚠️ Later is tijdelijk: bij elke terugkeer in beeld opnieuw (één tik, en de oude shell tegen de nieuwe backend is het grotere kwaad). Terug: `versieNieuw = false` in de Later-handler | storing.py F: balk zichtbaar met Herladen en Later, precies één keer, `toast('Opgeslagen.')` laat hem staan en verschijnt zelf los, Later verbergt, `visibilitychange` brengt hem terug (teller 2), Herladen → nieuwe shell; start: niets bij de eerste installatie. Layoutproef 390 en 1440 px: balk 48 px, knoppen ≥ 44 px, geen overlap met tabbalk of toast, geen horizontale scroll (`test/shots/robuust/updatebalk_390.png`, `_1440.png`) |
| O1 | laag | `VENSTER.opener` was op iOS praktisch altijd leeg: een tik geeft een knop geen focus, `activeElement` is `body` of (sinds `tabindex="-1"`) `main` | capture-listener op `click` onthoudt `LAATSTE_TIK` (button, `[tabindex]`, `a[href]`, select, summary; niet in `#venster`) met tijdstip; `openVenster` neemt een echte focus (niet body, main of html), anders de tik van minder dan een seconde geleden | ⚠️ een seconde: een sneltoets (n, e) vlak na een tik op iets anders zou anders een oude tik als opener krijgen. De mutatieproef liet zien dat vóór de fix `main` de opener werd (en dus de focus na Annuleren kreeg) | toetsenbord.py: `main.focus()` + programmatische `click()` op Bewerken (geen focus, zoals een tik) → `VENSTER.opener` is Bewerken en na Escape staat de focus erop (2 controles; zonder de fix opener `MAIN`) |
| O2 | laag | `#venster` had `role="dialog"` zonder naam; VoiceOver kondigde een naamloos dialoogvenster aan | de titel van `formHtml` krijgt `id="cf-formkop"` (in het venster `vf-formkop`; niet "titel", want `#cf-titel`/`#vf-titel` zijn de velden "titel" van de agenda- en vacatureformulieren, wat `test_app.py` in de eindcontrole liet zien); `vensterNaam()` zet `aria-labelledby` op die titel of de eerste `.kop`, en anders `aria-label` op de spinnertekst ("Laden", "Talenten vergelijken") of "Venster"; ook na het vervangen van de inhoud (meldingen, voorstellen) | — | toetsenbord.py: naam "Taak" (taakvenster), "Project bewerken", ladend meldingenvenster "Laden" (3 controles; zonder de fix "Venster") |
| O3 | laag | meldingen, voorstellen en doelen openden met alleen een spinner; op iOS geen Escape en voor VoiceOver geen bereikbare achtergrond, dus vast tot de fout | `LADEN_ANNULEER` (knop Annuleren) onder de spinner van alle drie; doelen krijgen `id="doelLaden"` en dezelfde "intussen gesloten"-check als meldingen en voorstellen, zodat een laat antwoord het gesloten venster niet heropent | — | toetsenbord.py: `run()` vastgehouden voor `apiMeldingen` en `apiDoelen`: Annuleren aanwezig, Tab bereikt hem, Enter sluit, het late antwoord heropent niets (7 controles; 6 rood zonder de fix) |
| O4 | laag | `focusStil` vertrouwde op `preventScroll`; Safari vóór 15 negeert de optie zonder fout en scrolt dan naar de kop | `focusStil` onthoudt `scrollTop` van `main`, `#vensterInhoud` en de pagina en zet ze terug als `focus()` toch gescrold heeft | — | toetsenbord.py: `HTMLElement.prototype.focus` tijdelijk zonder opties (zoals oud Safari), viewport 480 px hoog, element onder de vouw: `main` blijft op 0 waar een gewone `focus()` naar 536 scrolt (1 controle; zonder de fix 536) |

Suites na deze ronde: hook `check-index.sh` stil (exit 0; `sw.js` draagt het contract als commentaar, `CACHE` blijft `v7.3`), `storing.py` 86 ok in 85 s, `toetsenbord.py` 34 schermen, 1.333 tabs, 119 ok, 0 FOUT in 66 s, `golf1.py` 27 s, `golf2.py` 18 s, `golf3.py` 12 s, `golf4.py` 70 ok in 56 s, `handelingen.js` 0 handelingen zonder test (`data-update` via `storing.py`), 0 dode handlers; mutatieproef 65 s.

**Op een toestel te bekijken** (iOS, niet na te bootsen in Chromium):

1. VoiceOver, projectdetail: Bewerken → veld wijzigen → Opslaan: de VO-cursor staat weer op Bewerken, niet op de naam bovenaan. Schooldetail: een taak afvinken in de rechterkolom: de cursor blijft in de takenlijst.
2. Zonder VoiceOver: tik op Bewerken, Annuleren: geen zichtbare sprong; met VoiceOver: de cursor komt terug op Bewerken (dat is `LAATSTE_TIK`).
3. VoiceOver bij het openen van + Taak: "Taak, dialoogvenster" (naam uit `aria-labelledby`); bij de bel op een trage verbinding "Laden, dialoogvenster" met daaronder de knop Annuleren.
4. Een notitie half typen en daarna in het venster iets opslaan: het toetsenbord blijft open en de tekst staat er nog (`renderDetail`-pad, H4); zie ook het aandachtspunt hieronder over `herlaadDetail`.
5. iOS 14 of ouder, als er nog een toestel is: een venster openen met het toetsenbord open: de pagina springt niet.
6. Na een release in standalone: de balk "Nieuwe versie beschikbaar" staat boven de tabbalk (niet in de safe area, die hoort bij de tabbalk); Later → de app wegvegen naar de achtergrond en terughalen → de balk staat er weer; Herladen → nieuwe versie, geen koppelscherm.

**Aandachtspunten (⚠️)**

- ⚠️ `herlaadDetail` wist een open inline composer: `openDetail` zet het detail eerst op een spinner, dus `composerBewaar()` in `renderDetail` vindt niets meer; het H4-behoud geldt voor het `renderDetail`-pad (afvinken, tabwissel, facturatie). Het scenario van de reviewer ("composerHerstel zet de focus terug en 3020 blurt het veld") doet zich daardoor niet voor via de focus, maar via het verlies van de composer zelf. Niet opgelost in deze ronde (buiten de zes bevindingen; vraagt dat `naOpslaan` de composer expliciet leegmaakt vóór een behoud in `herlaadDetail`, anders komt een net opgeslagen notitie terug in het veld).
- ⚠️ De toast boven de balk gebruikt `:has()` (Safari ≥ 15.4); daaronder overlapt een toast de balk drie seconden, de knoppen blijven bedienbaar.
- ⚠️ `focusSleutel` herkent een element aan tag, id en data-attributen, zonder die drie aan de tekst; een rij zonder data-attribuut en met gewijzigde tekst na het hertekenen valt terug op de kop.
- ⚠️ `test/test_app.py` is in deze deelopdracht niet gedraaid (poort 8765 valt buiten de opdracht); de wijziging aan `formHtml` (id op de titel) raakt geen selector in die test, de verificatieronde draait hem.
