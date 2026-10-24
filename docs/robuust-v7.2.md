# v7.2 — robuust

Aanleiding: na v7.1 bestaat de app uit circa 5.100 regels `index.html` en 4.700 regels `Code.gs`, met veertien testsuites die vooral het gewone pad bewaken. De vraag van deze ronde: waar breekt de app op foute invoer, verkeerde rechten, de zomertijdwissel, een storing of een toetsenbord — en zijn de tests zelf te vertrouwen (mutatie, slaagkans)? Vier stappen: inventaris, aanvallen, repareren, productiecontrole. De eerste drie zijn gedaan; stap 4 wacht op gegevens van de eigenaar (§7).

Alle metingen komen uit scripts tegen de demo (`?demo=1`, fictieve gegevens), de mock (`test/mock_backend.py`) of `Code.gs` + `demo-backend.js` in een Node-vm. Uitvoer staat in `test/shots/robuust/` (gitignored). Niets is tegen productie gedraaid.

## 1. Methode per onderdeel

| onderdeel | wat | commando | looptijd |
|---|---|---|---|
| kruistabel | API-oppervlak uit de bron: `run()`-aanroepen in `index.html` × `function api…(` in `Code.gs` × `if fn ==` in de mock × vermeldingen in 27 testbestanden; ook `PORTAAL_FUNCTIES`, `TRIGGERS`, `BREIN_LEES`/`BREIN_ACTIES`, README en skill | `node test/kruistabel.js` (exit 1 alleen bij een app-aanroep zonder backendfunctie) | 0,1 s |
| handelingen | verliesvrije tokenizer over het inline script: elk `data-*`-attribuut als handeling (afgevangen in een listener én uitgezonden), gebruikt, dode handler of dood markup; kruising met de tests | `node test/handelingen.js` (exit 1 bij een dode handler) | 0,3 s |
| hotspots | git-historie zonder merges: per functie commits, fix-commits (`fix\|herstel\|bug\|repareer\|robuust\|review`) en of de gefixte regels een test raken | `python3 <scratch>/v72/hotspots/hotspots.py` (alleen lezend; niet in de repo) | 8 s |
| dekking | CSS- en JS-dekking van `index.html` via CDP (`CSS.startRuleUsageTracking`, `Profiler.startPreciseCoverage`) over 4 rollen × 2 breedtes en alle schermen, tabs en detailpagina's | `python3 test/dekking_app.py` (poort 8783; `--rollen`, `--breedtes`) | 212 s |
| fuzz | alle 103 api's × 6 rollen (vijf gebruikers + portaal), per blok ≤ 40 aanroepen uit een vaste PRNG (seed 7202), Sheet teruggezet vóór elke aanroep; telt interne fouten (engine-meldingen, `undefined`) en rechtenlekken (rijentelling per tabblad) | `node test/fuzz.js`; één blok: `FUZZ_API=… FUZZ_ROL=… node test/fuzz.js` | 26 s |
| rechten | verwachting afgeleid uit `RECHTEN` (onderdeel × team × rol) met een spiegel van `mag()`; 10 demogebruikers × 18 api's × rijen van zichzelf, een teamgenoot, een ander team en opstartprojecten (1.010 matrixrijen) + 89 horizontale aanvallen; Sheet-snapshot bewijst dat een geweigerde schrijfactie niets raakt | `node test/rechten_test.js` | 6 s |
| storing | Playwright tegen de mock: A elke POST 500, B antwoord na 8 s, C offline + herladen uit de service worker, D `fout: 'secret'` (verzoeklus?), E HTML-antwoord met 503 én 200, G nooit een antwoord (time-out van `run()`, §8), F update van de service worker | `python3 test/storing.py` (start en stopt zelf de mock op 8786) | 32 s (met G 85 s) |
| mutatie | tien kopieën van `Code.gs` met elk één gebroken invariant (rechten, lock, herhaling, tijdlijn, bezetting, VOG, matching, financiën, activiteitsvorm, portaal); de rooktest moet elke mutant doden | `node test/mutatie_test.js` (rooktest via `CODE_GS=<kopie>`) | 15 s |
| tijdzone | `node_rooktest.js` en `parser_test.js` als kindproces onder 4 tijdzones × 11 klokken (echte klok, wisseldagen, jaarwissel, randen om middernacht) via de preload `test/tz_klok.js`; plus reproducties en een statische scan op `new Date`/`86400000` | `node test/tz_test.js` (`--snel` ±30 s) | 70 s |
| toetsenbord | demo op 1440 px: per scherm (34, twee rollen) tabben tot de focus het scherm verlaat; bereikbaarheid, zichtbare focus, Enter op rij/kaart, Escape, Ctrl+K | `python3 test/toetsenbord.py` (poort 8789) | 55 s |
| flakiness | 16 suites herhaald (70 runs + 15 herkansingen) op een lege machine, plus drie proeven: mock zonder herstart, poortbotsing, zes browsersuites tegelijk | `python3 <scratch>/v72/flakiness/runner.py --vers` (niet in de repo) | 2.075 s |

Normen: fuzz 0 interne fouten en 0 rechtenlekken; rechten 0 schendingen; mutatie ≥ 9 van 10 gedood; tijdzone alle combinaties groen; storing en toetsenbord 0 FOUT; kruistabel, handelingen en dekking zijn metingen (alleen een dode handler of een app-aanroep zonder backend is rood).

## 2. Cijfers vóór en na

Vóór = de meting op commit `3aee4ae` (v7.1); na = de verificatie na de reparaties (alle 27 suites, 1.031 s).

| onderdeel | cijfer | vóór | na |
|---|---|---|---|
| kruistabel | app-aanroepen zonder backendfunctie | 0 | 0 |
| | app-aanroepen zonder mock | 2 | 0 |
| | backendfuncties die de app nooit aanroept | 7 | 7 (§5, K2) |
| | api's zonder enige test / alleen indirect | 31 / 18 | 25 / 9 |
| | api's die `backend/README.md` mist | 5 | 5 (§5, K4) |
| handelingen | data-attributen / handelingen | 178 / 157 | 175 / 157 |
| | dode handlers / dood markup | 1 / 2 | 0 / 0 |
| | handelingen zonder test | 62 (61 % gedekt) | 58 (63 %) |
| hotspots | functies met ≥ 3 fix-commits zonder test | 0 | — (meting) |
| | gefixte takken zonder test | 3 | 3 (§5, H1–H4) |
| dekking | CSS-regels / ongebruikt / statisch dood | 784 / 215 / 8 | 777 / 207 / 1 (bewust, §4) |
| | JS-functies / 0 dekking / dood | 498 / 227 / 6 | 492 / 221 / 0 |
| | JS-bytes niet uitgevoerd bij bekijken | 54,1 % | 53,9 % |
| | `index.html` | 548.435 bytes | 547.286 bytes (−1.149) |
| fuzz | aanroepen | 15.384 | 15.384 |
| | interne fouten (uniek) | 48 (7) | 0 (0) |
| | rechtenlekken | 0 | 0 |
| | verdachte `[object Object]`-waarden | 29 | 29 (§5, FZ-8) |
| rechten | matrixrijen klopt / aanvallen gehouden | 1.010 / 89 | 1.010 / 89 |
| | schendingen / interne fouten | 0 / 0 | 0 / 0 |
| | cellen die `RECHTEN` niet alleen bepaalt | 8 | 7 (§5, R1 en R4–R7) |
| storing | controles ok | 61 van 63 | 63 van 63 (met scenario G uit de iOS-review: 78 van 78) |
| mutatie | mutanten gedood | 8 van 10 | 10 van 10 |
| tijdzone | combinaties rood | 26 van 88 | 0 van 88 |
| | vindplaatsen met een bevestigde afwijking | 8 | 1 (§5, TZ-6) |
| | onafgedekte `86400000`-vindplaatsen in de scan | 13 | 3 |
| toetsenbord | niet met Tab bereikbaar | 372 van 1.434 | 0 |
| | gefocust zonder zichtbare focus | 37 | 0 |
| | FOUT-regels | 40 | 0 |
| flakiness | suites stabiel / consequent rood / flaky runs | 11 / 5 / 0 | 16 / 0 / 0 (één run per suite) |

De vijf rode suites waren deterministisch: hun ok/FOUT-uitvoer was per run byte-identiek, ook onder belasting (load 3,2). Er was geen enkele flaky run.

## 3. Wat er gerepareerd is

### Backend (`backend/Code.gs`, 24 regels `// v7.2`)

| id | wat | test |
|---|---|---|
| FZ-3, FZ-4, FZ-5, FZ-7 | één helper `uitMap(map, sleutel)` (alleen eigen sleutels) voor `CONTENT_TYPES`, `TABELLEN`, `VERWIJDER_TABBLAD`, `KEUZELIJSTEN`, `BREIN_ACTIES` en de namen van `apiExport`; `constructor`, `toString` en `__proto__` geven nu de gewone fout "Onbekend …" | rooktest v7.2, fuzz |
| FZ-1 | `apiFacturenExport`: alleen een tekst als status, anders `aangemaakt` (een lijst gaf een TypeError) | rooktest v7.2 |
| FZ-2 | `apiMijlpalenOpslaan`: elk element moet een object zijn | rooktest v7.2 |
| FZ-5, FZ-6 | geen `undefined` meer in meldingen: "Onbekend tabblad (leeg)", "Onbekend huisstijlveld: (leeg)" | rooktest v7.2 |
| R2 | `apiSchool` en `apiPersoon` beginnen met `eis('relaties', 'zien')`; de tabel is nu de enige bron | rooktest v7.2 (tabel tijdelijk op `geen`), rechten |
| R3 | portaal: `alleenBevestigen === true`; een raster dat geen object is → "Geen beschikbaarheid." (een verschoven argument bevestigde stil) | rooktest v7.2, rechten |
| TZ-3 | `plusDagen(n)` rekent in kalenderdagen (`setDate`), niet n × 24 uur; 15 aanroepers, o.a. de deadlines van automatische taken | rooktest v7.2, tz_test |
| TZ-4 | beoordelingstaak na plaatsing: `middag(start)` + 42 kalenderdagen (was een dag te vroeg over de wissel naar wintertijd) | rooktest v7.2 |
| TZ-5 | `dagenTot` via `middag()` met `Math.round` | rooktest v7.2 |
| TZ-7 | agendavensters van `apiHome` (+7 dagen), `apiAgenda` en `mijn_agenda` (+1 dag) met datumcomponenten | rooktest v7.2 |
| TZ-9 | `archiveer`, `archiveerUren`, `uren90Dagen`, `slapendRun` rekenen via `plusDagen` | rooktest (plusDagen-eis) |

Geen nieuwe Apps Script-aanroepen (`node server/dekking.js`: 0 gaten), `TABELLEN` onaangeraakt, golden master 0 onverklaarde verschillen.

### App (`index.html`, 24 regels `// v7.2`; `sw.js` CACHE `athena-assistent-v7.2`)

| id | wat | test |
|---|---|---|
| STORING-E-1 | `leesAntwoord` leest ook bij status 200 eerst de tekst; HTML in plaats van JSON → "de server gaf geen leesbaar antwoord — probeer het zo nog eens" | storing E |
| STORING-C-1 | `run().catch` vertaalt de fetch-TypeError: "je bent offline" of "geen verbinding met de server — probeer het zo nog eens" | storing C |
| TZ-8 | `morgenNegen()` = `morgenStr() + 'T09:00'` (kalenderdag); standaardwaarde van "Afspraak plannen" en de taskforcemeeting | tz_test (nieuwe reproductie) |
| TB-1, TB-2 | `tabindex="0"` op tabelrijen (`deskTabel`) en alle lijstrijen `div.rij.klik[data-crm-open]` (kansen, projecten, talenten, scholen, personen, meldingen) | toetsenbord |
| TB-3 | `crmLink` en de losse `<a data-crm-open>` (projectbord, vacaturekop, tijdlijnchips, facturatie) krijgen `tabindex="0" role="link"` | toetsenbord |
| TB-4 | Home "Recente activiteit" en de agendablokken focusbaar | toetsenbord |
| TB-5 | zichtbare focus op `.invoer`, `.balk select`, `.filters select`, `.filterbalk select` (plus een streep onder het veld zelf, omdat de test het gefocuste element meet) | toetsenbord |
| TB-6 | Enter op een gefocuste taakrij opent de taak (zoals rijen met `data-crm-open`) | toetsenbord |
| TB-7 | commandobalk: `PALET.opener` onthouden, focus terug bij Escape en kiezen | toetsenbord, golf2 |
| iOS R1, R2, L2 | time-out op elk verzoek, Enter op een sleepbare taakrij één keer, focusregels gesplitst (§8) | storing G, toetsenbord 4b |

### Dood gewicht (uit dekking en handelingen)

Weg: 10 CSS-regels (`.detailkop` + h2/p/.tags, `.knoppenrij` + scrollbar/.knop, `body.desk .detail-grid` + `.knoppenrij`, `.snel-hint`), 6 functies (`schooljaarPlus`, `schooljaarKort`, `veldenRijen`, `linkMail`, `knoppenRij`, `isBeheerderApp`) met de tabel `KNOP_LABEL`, 2 markup-attributen (`data-aid` in `actieRij`, `data-mrij` in `matchRij`) en de dode handler `data-deskklik` (uitzender weg sinds v3.8). Elk blok heeft één commentaar `// v7.2: dood gewicht weg: …`.

### Tests en hulpmiddelen

| id | wat |
|---|---|
| K1 | `test/mock_backend.py`: stubs `apiFinancienBevriezen` (met bevriezingsstand) en `apiExactImport`; `test/test_app.py` doorloopt Prognose vastleggen en de Exact-controle met toepassen |
| MUT-1, MUT-2, FL-4 | `test/node_rooktest.js`: een gelogd gesprek zet `laatsteContact` van school en open kans op vandaag; een call telt als gesprek (`TYPE_VAN_VORM`); mutatiescore 8 → 10 |
| TZ-1 | rooktest: de Exact-csv loopt tot gisteren (`plusDagen(-1)`), zodat de verwachting het hele jaar klopt (was rood van 3 november t/m 31 juli) |
| TZ-2, FL-2 | rooktest: het aantal VOG-mails wordt uit de gegevens berekend (grens zes maanden vóór 1 augustus van het volgende schooljaar) in plaats van de ondergrens 15; daarmee is de rooktest op elke kalenderdag groen |
| — | rooktest: nieuwe sectie "v7.2: robuust" met 16 eisen voor elke fuzz-, rechten-, portaal- en tijdzonefix; `CODE_GS=<pad>` laadt een andere kopie van `Code.gs` |
| — | `test/tz_test.js`: reproductie van de nieuwe `morgenNegen`; de oude formules blijven als nagebootste info-regels staan |
| — | `test/ux_audit.py`: "0 serious/critical" is nu een harde controle met exitcode (voorheen altijd 0) |

## 4. Bewust overgeslagen

| wat | waarom |
|---|---|
| `.tag.in-aanvraag` (de enige statisch dode CSS-regel) | de klasse wordt dynamisch gebouwd uit de documentstatus "in aanvraag"; de demo-seed heeft alleen geen document in die status. Laten staan; zie DEK-8 voor de vraag of hij ooit matcht |
| 207 ongebruikte CSS-regels en 221 functies met 0 dekking | wel gerefereerd (toestand, hover, slepen, venster, palet, portaal, koppelscherm, foutpaden); de meting kijkt alleen, ze klikt niet |
| `dagenSinds` (TZ-6) | `Math.floor` → kalenderdagen verandert de betekenis van "wacht al n dagen" ook buiten de wissel; gedragskeuze voor de eigenaar |
| 29 `[object Object]`-waarden uit de fuzz (FZ-8) | de app stuurt nooit een object in een tekstveld; de fix raakt dertien api's en hoort in een eigen stap met de rooktest als vangnet |
| info-regels in `tz_test.js` over Code.gs 1622/1666/2823 | die reproducties herrekenen de oude formule in de test zelf; de code is gerepareerd. Ze tellen niet mee in de exitcode |
| 1024 px in `dekking_app.py` | weggelaten om onder tien minuten te blijven (`--breedtes 1440,1024,390` zet hem aan) |
| twee zoekresultaat-links in de zijbalk zonder `tabindex`, `nuLokaal(-N*1440)` als ondergrens van het tijdlijnfilter | niet in de bevindingen; het zoekvak heeft eigen toetsbediening, het filter is hoogstens een dag ruimer rond middernacht op een wisseldag |

## 5. Open punten ter beoordeling door de eigenaar

Gerangschikt op ernst; "zeker" = bevestigd met een reproductie, de rest vraagt een besluit.

### Midden

| id | bevinding | voorstel |
|---|---|---|
| K3 | 25 api's hebben geen enkele test, waaronder schrijfpaden: `apiTrackOpslaan`/`Start`/`Stoppen`/`Verwijderen`, `apiTagHernoem`, `apiVeldHernoem`, `apiSchooljaarOpslaan`, `apiDoelOpslaan`, `apiFacturenMaken`, `apiMeldingenGelezen`, `apiDocumentOpslaan`, `apiContentOpslaan`, `apiHuisstijlOpslaan`, `apiCrmInrichten`, `apiCapsuleMigratie`; 9 lees-api's raken alleen de golden master | blok "schrijfpaden" in `node_rooktest.js` met `roep()`/`faalt()`: tracks starten → stoppen → verwijderen met "toegang" voor een ander team; hernoemen telt `r.aantal` tegen de Sheet; facturen maken (som termijnen = contractwaarde); meldingen gelezen alleen op eigen rijen; per lees-api één gerichte assert |
| H4, H5 | 58 van 157 handelingen hebben geen test: alle verwijder- en stopknoppen (met `confirm`), de Exact-flow, facturatie-export, beheer (codes, actief, lijsteditor), huisstijl (kopiëren), talent (status, peiling, export, forceer), desktop (bulk, tijdlijngreep, doelpreset). Laagste secties: Huisstijl 33 %, bewerkvenster 50 %, Bedrijfsbrein 57 %, Talent 58 % | een `golf4.py` of een extra doorloop in `test_app.py` die per sectie elke handeling uit `handelingen.json` één keer aanklikt (`page.on('dialog', accept)`), en de lijst `zonder_test` als drempel bewaakt (≤ 20) |
| H1 (hotspots) | `apiTrajectOpslaan` (9 commits, 3 fixes): de fix "veld vergeten in de whitelist" (`xpsProject`) heeft geen test; het patroon herhaalt zich bij elke nieuwe kolom | rondreis in de rooktest met alle bewerkbare projectvelden, plus een vergelijking van de whitelist in `apiTrajectOpslaan` met de veldnamen in `trajectVelden` van `index.html` |
| R1 | `apiKans` toont de kans achter een zichtbaar project aan iedereen die het project ziet, ook het talentteam (waarde, notities, verliesreden); `RECHTEN` zegt pipeline talent = geen en de docs "de AM, en alleen die" | óf `kansenViaProject()` beperken tot accountmanagement, óf voor andere teams een beperkt object (naam, school, fase). Besluit vastleggen in `RECHTEN`-commentaar en `docs/teams-en-processen.md` §2 |
| TZ-6 | `dagenSinds` en "dagen onbeantwoord" (Code.gs 403) gebruiken `Math.floor` over verstreken uren: een dag te weinig in het uur na het begin van de zomertijd; voedt `dagenStil`, `dagenInStatus`, "wacht al n dagen" en de peilingdrempels | kalenderdagen via `middag()` met `Math.round`, als "wacht al n dagen" kalenderdagen moet betekenen; anders alleen `Math.round` |
| TB-8 | het bewerkvenster (`aria-modal`) krijgt bij openen geen focus en zet hem bij sluiten niet terug; Tab loopt achter het venster door | `VENSTER.opener` onthouden, `#vensterInhoud` met `tabindex="-1"` focussen, bij sluiten terugzetten; focus-trap als volgende stap. Laten reviewen door `ios-pwa-reviewer` (toetsenbord op iOS) |
| FL-1 (zeker) | `test_app.py` is volgorde-afhankelijk: een tweede run tegen dezelfde mock faalt op `[data-klaar="a1"]` (de mock houdt state) | de mock zelf starten en stoppen zoals `test_inlog.py`, of een `reset` in de mock die de seed herstelt |
| FL-7 (zeker) | `test_app.py` en `ux_taken.py` melden fouten alleen in tekst en eindigen altijd met exitcode 0 | `sys.exit(1 if meldingen else 0)` resp. exit 1 bij een mislukte taak of pageerror |

### Laag

| id | bevinding | voorstel |
|---|---|---|
| K2 | zes backendfuncties roept geen code aan: `apiVraag`, `apiZetHuisstijl`, `apiTraject`, `apiNotitieToevoegen`, `apiArchiveer`, `apiImporteer` (alleen mock en docs; blijven via `doPost` aanroepbaar en moeten bij rechten mee) | per functie kiezen: verwijderen uit `Code.gs`, mock, `server/vergelijk.js` en de contractdocumenten, of als beheerfunctie documenteren met een gerichte test (`apiImporteer`, `apiArchiveer`) |
| K4 (zeker) | de contracttabel in `backend/README.md` mist `apiFinancien`, `apiFinancienBevriezen`, `apiExactImport`, `apiTalentscoutToewijzen`, `apiTaskforcePlannen`; de skill is compleet | vijf rijen toevoegen met de argumenten uit de skill |
| H2, H3, H4 (hotspots) | drie gefixte takken zonder test: "Opnieuw proberen" in de weekweergave (`data-weekopnieuw`), de activiteit-cache en `.rteams` in `renderRapport`, en opslaan vanuit een venster bóven een gevulde inline composer (`VENSTER.actie`/`formActie`) | drie korte scenario's in `test_app.py`: mock laat één weekaanroep falen; tel `apiActiviteiten`-verzoeken bij wisselen van maatstaf; notitie beginnen, + Taak opslaan, notitie opslaan |
| DEK-8 | `.tag.in-aanvraag` matcht nooit: de status is "in aanvraag" (met spatie) en de tag krijgt de klassen `in` en `aanvraag`; een document in aanvraag kleurt niet oranje | eerst nagaan of documenttags kleur moeten hebben; dan een slug van de status (`replace(/\s+/g, '-')`) of de regel hernoemen naar `.tag.aanvraag` |
| FZ-8 | dertien api's nemen een object aan in een vrij tekstveld en slaan `[object Object]` op (notitie, locatie in de agenda, hulpvraag, …); de app doet dat nooit | helper `tekstIn(v)` die een object weigert, in een eigen stap |
| R4 | `apiTalentOpslaan` controleert `eis('talenten','wijzigen')` zonder rij; een later rijniveau `eigen` zou niet gelden | `eis('talenten', 'wijzigen', oud || null)` |
| R5, R6, R7 | regels bóven `RECHTEN` die alleen uit de code blijken: beoordelingen wijzigt alleen de gever (teamlead niet), facturatievelden van een project vallen onder `facturatie` (`FACT_VELDEN`), en drie cellen (financiën wijzigen, beoordelingen zien, kandidaten zien) hebben geen eigen api | documenteren in het `RECHTEN`-commentaar en `docs/teams-en-processen.md` §2, zodat de rechtentest en de RLS-policies van Supabase dezelfde bron hebben; of de teamlead wél laten wijzigen |
| STORING-F-1 | na een release neemt de nieuwe service worker meteen over, maar de open pagina blijft op de oude shell tot de gebruiker herlaadt; geen melding | ontwerpkeuze: op `controllerchange` één toast "Nieuwe versie — herlaad de app", of herladen als geen composer of venster open staat |
| TB-9 | na Enter op een kaart of rij gaat de focus bij het openen van het detail verloren (body) | in `openDetail` op desktop de detailkop (`tabindex="-1"`) of Terug focussen; UX-besluit |

## 6. Aannames (⚠️)

- ⚠️ De fuzz bewijst afwezigheid van interne fouten voor de gekozen seed en ≤ 40 aanroepen per blok, zonder ketens van aanroepen. Een andere seed (`FUZZ_SEED`) kan nieuwe gevallen vinden.
- ⚠️ De rechtentest spiegelt `mag()`; acht cellen kon hij niet uit `RECHTEN` alleen afleiden en zijn als uitzondering verrekend (§5, R1 en R4–R7). Hij bewijst dus dat de code doet wat de code zegt, niet dat de tabel compleet is.
- ⚠️ De mutatietest kent tien handgekozen mutanten, één per gebied; 10/10 zegt iets over die invarianten, niet over de hele rooktest.
- ⚠️ `tz_test` draait Node onder `TZ=…`; Apps Script rekent in de scripttijdzone en de Vercel-server zet `TZ=Europe/Amsterdam`. Beide zijn in de matrix vertegenwoordigd, de echte runtime niet.
- ⚠️ De dekkingsmeting kijkt alleen; "interactie" (221 functies, 207 CSS-regels) betekent niet geraakt bij bekijken, niet ongebruikt.
- ⚠️ Scenario F (service-worker-update) kan de wissel van `CACHE` zelf niet onderscheppen (Chromium haalt `sw.js` buiten de route-interceptie op); de levenscyclus is met `sw.js?v=test` en een geplante oude cache doorlopen.
- ⚠️ Een grep-treffer in een testbestand telt in kruistabel en handelingen als "genoemd", niet als "aangeklikt met controle"; wat `test_app.py` via de UI raakt is uit de bron niet aantoonbaar.
- ⚠️ `plusDagen` houdt het tijdstip van de dag; de seed in `demo-backend.js` gebruikt dezelfde functie en blijft gelijk. De beoordelingstaak na plaatsing krijgt nu 12:00 als tijdstip in plaats van 00:00.

## 7. Nog te doen door de eigenaar: de productiecontrole (stap 4)

Alle suites draaien tegen demo en mock. Of productie dezelfde vorm heeft, is alleen met twee uitdraaien uit het Apps Script-project te zeggen. Lever aan (zonder gegevens van scholen of personen; `controleer()` print die niet):

1. Open het Apps Script-project, kies in de functiekeuzelijst `controleer` en klik Uitvoeren. Plak de volledige uitvoer van het Logboek (Logger). Die bevat de backendversie, ontbrekende scripteigenschappen, de naam van de Sheet, per tabblad uit `TABELLEN` het aantal rijen of "nog niet aangemaakt", de triggers onder dit account met wat ontbreekt, het aantal gebruikerscodes en of de Claude-sleutel is ingesteld.
2. Open links het paneel Uitvoeringen, filter op status Mislukt en periode laatste 7 dagen, en plak per regel de functienaam, het tijdstip en de foutmelding (de melding is de laatste regel van een mislukte uitvoering).

Wat daarna vergeleken wordt:

| wat | waarmee | waarom |
|---|---|---|
| kolomkoppen per tabblad | `TABELLEN` in `Code.gs` (`blad()` vult ontbrekende kolommen achteraan aan, maar hernoemt of verplaatst niets) | een kolom die anders heet dan in `TABELLEN` wordt stil als leeg gelezen; ⚠️ `controleer()` print de koppen niet, dus plak van elk tabblad ook de eerste rij, of we breiden `controleer()` eerst uit |
| aantallen per tabblad | de tellingen uit de rooktest en de golden master (`server/vergelijk.js`), en of `Activiteiten_archief`/`TalentUren_archief` vullen | leeg of onverwacht groot wijst op een trigger die niet draait of op een import die dubbel liep |
| ontbrekende triggers | `TRIGGERS` (acht namen) | een ontbrekende trigger betekent geen review, herinnering, VOG-mail of bevroren prognose; dubbele triggers onder een tweede account draaien alles dubbel |
| fouten per functie in Uitvoeringen | de nette foutenlijst uit de fuzz (`fuzz.json`) en de meldingen in de rooktest | een fout die de fuzz niet kent is een nieuw geval voor de fuzz of een gegevenskwestie in de Sheet |

Pas daarna kan v7.2 als nieuwe Apps Script-versie geïmplementeerd worden (`/release`; de `/exec`-URL blijft gelijk).

### Resultaat (23-10-2026, uitdraai van `controleer()` na het implementeren van v7.2)

| wat | gevonden | oordeel |
|---|---|---|
| backendversie | "backend 6.5" | geen oude code: `VERSIE` in `Code.gs` stond sinds v6.5 stil (git bevestigt dat). v7.2.1 zet hem op het releasenummer en de release-skill eist dat voortaan |
| tabbladen | 21 van 28 aanwezig; de talent- en prognosetabbladen "nog niet aangemaakt" | normaal: `blad()` maakt ze bij het eerste gebruik of de eerste trigger |
| aantallen | Scholen 1, Trajecten 1, Kansen 1, Personen 1, Acties 8, Activiteiten 15, Documenten 16, Reviews 24; Gebruikers 0, Instellingen 0, Mijlpalen 0 | productie is nog één gebruiker (de beheerder via `SECRET`); de teams, rechten en keuzelijsten uit v4.0+ zijn nog niet in gebruik (standaardwaarden uit de code gelden). Geen fout, wel een feit: de rechtenmatrix beschermt nog niemand |
| triggers | 4 van 8: `indexeerTrigger`, `nachtelijkeReviewTrigger`, `crmSyncTrigger`, `archiveerTrigger`; ontbreken `herinneringTrigger` (v4.6), `talentDagelijksTrigger`, `talentUrenTrigger` (v5.0), `financienTrigger` (v6.5) | **actie**: `setup()` één keer uitvoeren onder het account van de eigenaar; `installeerTriggers()` verwijdert de bestaande acht namen en zet ze alle acht opnieuw (idempotent, geen dubbele). Tot die tijd: geen herinneringsmail, geen VOG-/peilingrun, geen bevroren prognose |
| gebruikerscodes | 0 | pas nodig zodra collega's inloggen; aanmaken via Beheer → Gebruikers |
| Claude-sleutel | ingesteld | — |
| kolomkoppen | niet in de uitdraai | v7.2.1: `controleer()` vergelijkt per tabblad de koprij met `TABELLEN` en meldt "AFWIJKENDE KOP" (kolompositie, gevonden, verwacht), ontbrekende en extra kolommen, en rijen zonder id |
| Uitvoeringen (mislukt, 7 dagen) | niet aangeleverd | open; bij de volgende productiecontrole meenemen |

### Afronding (23-10-2026, na v7.2.1 en `setup()`)

| wat | gevonden | oordeel |
|---|---|---|
| backendversie | "backend 7.2.1" | de nieuwe code draait; `VERSIE` loopt voortaan mee met de release |
| kolomkoppen | 0 tabbladen met "AFWIJKENDE KOP"; de twee koppen die achteraan kolommen misten (`Activiteiten_archief`, `Facturen`) zijn inmiddels aangevuld | in orde: de Sheet heeft exact de kolommen en volgorde van `TABELLEN` |
| tabbladen | 28 van 28 aanwezig (de talent- en prognosetabbladen zijn door `setup()` aangemaakt) | in orde |
| triggers | 8 van 8 onder het account van de eigenaar | in orde: herinneringsmail, talentrun, urenimport en het bevriezen van de prognose draaien nu ook |
| gebruikers | 0 | ongewijzigd: pas nodig als collega's inloggen |

⚠️ De uitvoer van `setup()` print de koppelcode van de beheerder. Wie die uitvoer ergens plakt (chat, ticket, mail), vervangt daarna `SECRET` in de scripteigenschappen en koppelt de app opnieuw; de code staat nooit in de repo of in dit rapport.


## 8. iOS-review

De iOS-review van de v7.2-wijzigingen in `index.html` (standalone PWA op iPhone en iPad) gaf drie bevindingen. Alle drie zijn verwerkt; elke fix heeft een `// v7.2`-commentaar en een test.

| id | ernst | bevinding | fix | test |
|---|---|---|---|---|
| R1 | midden | `run()` had geen time-out. iOS laat een lopende fetch na een wissel van wifi naar 4G of een pauze op de achtergrond vaak tientallen seconden tot minuten hangen zonder fout; er komt dan geen `TypeError`, dus de offline-vertaling uit STORING-C-1 vuurde niet en de spinner bleef staan zonder melding. Scenario B (antwoord na 8 s) ving dit niet, want daar komt uiteindelijk wél een antwoord | `metTimeout(maak, ms)`: één `AbortController` per verzoek (iOS 12.1+, met guard: zonder `AbortController` geen time-out, zoals voorheen), 25 s (`RUN_TIMEOUT_MS`) over het hele antwoord inclusief het lezen van de body, voor het Apps Script-pad, het serverpad én de tokenvernieuwing (`tokenVers`, die bij een time-out het oude token teruggeeft zoals bij elke mislukte vernieuwing). Functies die Claude aanroepen, importeren of een bestand meesturen (`RUN_LANG`: `apiBrein`, `apiReviewNu`, `apiMaakContent`, `apiCapsuleMigratie`, `apiTalentUrenImport`, `apiExactImport`, `apiTalentDocumentOpslaan`) krijgen 120 s (`RUN_TIMEOUT_LANG_MS`), omdat Apps Script daar tot 6 minuten en Vercel 300 s mag doen; 25 s zou een lange assistent-tekst of een upload op 4G afbreken. `AbortError` → "Niet gelukt — de server reageert niet — probeer het zo nog eens" | `storing.py` G: de mock houdt elk verzoek vast en antwoordt nooit; na 25 s een toast in gewoon Nederlands, het verzoek is door de app afgebroken (`requestfailed`), de tekst staat nog in het veld, Opslaan weer bruikbaar, geen spinner; ook bij het laden van een school ("Kon dit niet laden" met Terug), en daarna werkt openen weer zonder herladen |
| R2 | laag | Enter op een gefocuste sleepbare taakrij (weekweergave, dagenlijst van de desktop-agenda; `sleepbareTaak` geeft `data-sleep="taak:<id>"` én `class="rij"`) riep `bewerkTaak` twee keer aan: de nieuwe sneltoets-tak (TB-6) én de kaart-handler voor `[data-sleep]`, die via de klik op `[data-taakbewerk]` hetzelfde doet. Nog onschuldig (dubbele render), maar elke niet-idempotente stap in `bewerkTaak`/`openVenster` zou dubbel gaan | de sneltoets-tak slaat `[data-sleep]` over, zoals de Enter-handler voor `data-crm-open` dat al deed | `toetsenbord.py` (4b): in de weekweergave `openVenster` tijdelijk tellen bij Enter op `.rij[data-sleep^="taak:"]`: precies 1 (vóór de fix 2, gemeten) |
| L2 | laag | `.invoer:focus-within` stond in één selectorlijst met drie `select:focus-visible`-selectors; op iOS < 15.4 (geen `:focus-visible`) is dan de hele lijst ongeldig en valt ook de omlijsting van het zoekveld weg. Daarnaast matcht `:focus-visible` op een tekstveld altijd, ook na een tik, zodat de streep onder het veld (TB-5) op iPhone bovenop de 2 px-ring verscheen | drie losse regels; de streep alleen onder `body.desk` (de toetsenbordtest draait op 1440 px en meet het gefocuste element) | `toetsenbord.py` blijft groen (focus zichtbaar op `.invoer input` op desktop); op de telefoon is er geen test voor de afwezigheid van de streep |

Op een toestel te bekijken (niet na te bootsen in Chromium):

- iPhone, standalone: start een lijst die laadt, wissel van wifi naar 4G of zet de app 10 s naar de achtergrond en terug. Verwacht: na uiterlijk 25 s de toast "de server reageert niet", de spinner weg, de lijst opnieuw te laden; bij een lange Assistent-vraag (`apiBrein`) mag het tot 120 s duren voordat de melding komt.
- iPhone: tik op het zoekveld (Contacten). Verwacht: alleen de 2 px-ring om het veld, geen streep onder de tekst. Op een iPad met toetsenbord ≥ 1024 px (`body.desk`) verschijnt de streep wel bij Tab.
- iOS < 15.4 (als er nog zo'n toestel is): het zoekveld krijgt bij focus de paarse omlijsting (de `:focus-within`-regel staat nu los).
- iPad met toetsenbord: Tab naar een taak in de weekweergave en druk Enter; het bewerkvenster opent één keer en Escape sluit het.
