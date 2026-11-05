# Prestatie v7.6: meten, verbeteren, nameten

Peildatum 5 november 2026. Doel van v7.6: Athena meetbaar sneller en betrouwbaarder voor de twintig gebruikers, zonder build-stap en zonder grote refactor, uitsluitend van meting naar wijziging naar nameting. Wat niet gemeten is, is niet verbeterd. ⚠️ markeert een aanname of een open vraag, met eigenaar.

## 0. Samenvatting

| Wat | Voor | Na | Winst | Maat |
|---|---|---|---|---|
| Vandaag op de telefoon, warme start (dagelijks gebruik) | 615 ms | 260 ms | −58 % | gevuld, 4G met gzip, 4× CPU, mediaan van 5 |
| Vandaag warm bij een hangende server | 3549 ms | 337 ms | −90 % | idem, server antwoordt pas na 10 s |
| HTML-bytes per koude start (service-workerinstallatie) | 495 kB | 330 kB | −33 % | serverlog, gzip |
| Taken op desktop, api-keten | 430 ms | 258 ms | −40 % | span van de aanroepen, mock 150 ms RTT |
| Bezetting op desktop, api-keten | 404 ms | 242 ms | −40 % | idem |
| Projectdetail, api-keten | 394 / 406 ms | 244 / 283 ms | −38 / −30 % | desktop / telefoon |
| Rapporten op de telefoon, api-keten | 582 ms | 459 ms | −21 % | diepte 3 → 2, 5 → 4 aanroepen |
| lees()-aanroepen in de backend, alle api's × vier rollen | 19 984 | 2 154 | −89 % | Node, groot-profiel, exact |
| Tabbladen uit de Sheet per verzoek: apiSchool / apiActiviteiten / apiHome | 13 / 11 / 16 | 9 / 7 / 13 | −31 / −36 / −19 % | getValues-rondreizen, exact |
| Koude start Vandaag (eerste bezoek, geen cache) | 1356 ms | 1341 ms | ruis | zoals verwacht: geen cache bij een eerste bezoek |

Met het latentiemodel voor Apps Script (⚠️ 600 ms p50 / 1500 ms p95 per aanroep, eigenaar Menno: het uitvoeringenlogboek over 30 dagen vervangt dit) telt elke rondreis minder 600–1500 ms door in wat de gebruiker ziet. De productiecijfers volgen uit de telemetrie van v7.6 (Beheer → Metingen) na twee weken.

Klaar-criteria uit de opdracht: elke uitgerolde wijziging wint ≥ 10 % op de eigen maat (ja, §4); `test/prestatie.py` haalt de budgetten en zit in de suite (ja, §5); alle suites groen en iOS-review zonder blokkerende bevindingen (§7); logboek na twee weken lagere p95 en minder fouten (open, §8); gemerged (PR).

## 1. Nulmeting

Vijf meetagenten, elk met eigen scripts en ruwe uitvoer buiten de repo (scratchpad `prestatie/`), op een gedeelde machine met vier kernen (loadavg 0,2–2,4; per meting genoteerd). Protocol: Chromium uit `/opt/pw-browsers` via Playwright; telefoon 390×844, 4× tragere CPU, trage 4G (150 ms, 1,6 Mbit/s omlaag); desktop 1280×800 zonder CPU-rem; vijf runs per maat, mediaan en p95 (= max bij vijf), spreiding; verschillen onder 10 % zijn ruis.

**Laad (mock, 40 contexten + 10 gzip-equivalent).** Home koud op de telefoon tegen de mock 3441 ms (p95 3512), maar 91 % daarvan is de ongecomprimeerde overdracht van 609 kB index.html; de mock stuurde geen gzip. Geschaald naar gzip (165 kB) 1311 ms. Warm was niet sneller dan koud (3407 vs 3441): de service worker deed HTML network-first met een time-out van 3 s. Elke schermwissel is één api-rondreis plus ≤ 75 ms tekenen; 600 ms backendvertraging telt 1:1 door. Desktop koud CLS 0,16–0,20 door `zetDesk()` na de volledige download. Service worker pas na 9,8 s klaar: SHELL bevatte index.html twee keer. Nul JS-fouten in 50 contexten.

**Kritiek pad (mock met gzip, ETag en server-side 4G-pijp, 15 scenario's × 5 runs, CDP-tracing).** Koud telefoon met gzip: gevuld 1315 ms = TTFB 155 → HTML-download 842 → parse 28 → compileren 40 + uitvoeren 61 → eerste run() 85 ms na scriptstart → api 183 → render 49. Drie grootste posten koud: HTML-download 62 % (zonder gzip 85 %), api-rondreis 14 %, CPU na de laatste byte 13 %. Warm via service worker met 304: 556 ms, waarvan 161 ms TTFB voor de hervalidatie en 141 ms streamen door de worker (scriptstart 366 vs 239 ms uit CacheStorage); hangende server 3478 ms (time-out 3 s); zonder ETag 3305 ms. Vóór Home draait 12,5 % van het script en 13,4 % van de CSS. De CDP-netwerkrem raakt de fetches van de service worker niet; daarom pacing in de server.

**Waterval (mock, 20 runs, 84 stappen).** Structuur identiek in alle runs. Twaalf stappen hadden een keten van twee of drie aanroepen achter elkaar; alleen Rapporten (apiTeamRapport → apiActiviteiten, de periode komt uit het eerste antwoord) is inherent. De rest was toevallig (then-volgorde) of dubbel: `laadRelaties` wiste na apiCrm de taken-, pipeline- en rapportlijst en laadde die opnieuw (apiTaken ×2, apiTeamRapport ×2, apiActiviteiten ×2 op de telefoon); Bezetting op desktop wachtte op apiTrajecten voordat apiBezetting vertrok; een geopend project ging via `wisselView('relaties')` en kostte apiCrm plus apiTaken extra; Terug haalde apiSchool of apiTrajecten opnieuw op. Per doorloop van 21–22 schermen 22–27 aanroepen, diepte-som 18–21 → met het model 10,8–12,6 s wachttijd op Apps Script (p50). apiCrm 4–5× per doorloop.

**Backend (Node, groot-profiel: 9 941 rijen, 99 api's × vier rollen = 390 cellen, lees() en de Sheet-stub geteld).** 90 % van alle lees()-aanroepen (17 906 van 19 984) was `lees('Instellingen')` via `instelling()` per rij (vogStatus → huidigSchooljaar): apiTalenten 3 162×, apiTeamRapport 2 791×, apiBezetting 1 399× per verzoek. apiHome las 16 tabbladen en 7 819 rijen, waarvan vijf tabbladen (2 250 rijen) enkel voor een talentnaam bij 25 recente activiteiten (`activiteitUit` → `talentNaamVan` → `talentIndex`); hetzelfde patroon in apiProject, apiSchool, apiActiviteiten en apiActiviteitOpslaan. apiCrm kost 12 ms rekentijd maar 191 kB JSON. Grootste payloads: apiTalenten 994 kB, apiBezetting 502 kB, apiTrajecten 184 kB (waarvan de hele tab Activiteiten, 3 277 rijen, voor een updates-telling). Schrijfpaden lezen het geschreven tabblad 2–3× per verzoek. 78 % van de Node-tijd zit in lees(); absolute ms zijn op deze machine tot 1,6× onzeker, de tellingen zijn exact.

**Render (demo op praktijkschaal, 40 runs + 20 verificatieruns).** Eén scherm breekt elk budget: Bezetting → Per vacature → Alle vacatures kost op de telefoon 2,26 s (p95 2,35; desktop 0,50 s), 19–21× de standaardseed: 18 800 knopen en 1,15 MB HTML in één innerHTML, waarvan 742 `<select>` × 12 `<option>` ruim de helft van parse en layout zijn. Financiën 692 ms (tabel van 273 rijen × 15 kolommen). Alle andere schermen blijven onder 250 ms getekend op de telefoon en onder 85 ms op desktop. `esc()`, DocumentFragment en een debounce op zoeken zijn geen hotspots (< 2 %). De standaardseed, de basis van alle bestaande tests, laat van de hotspots niets zien.

**Wat niet gemeten is.** Productie (Apps Script, GitHub Pages, Vercel): geen uitvoeringenlogboek, geen iPhone-trace, geen HAR, geen rijtellingen van de echte Sheet en geen observatie bij gebruikers aangeleverd (⚠️ eigenaar Menno; zie §8). Alles hierboven is lab: mock met vaste seed of demo met verzonnen gegevens, headless Chromium, geen iOS Safari.

## 2. Budgetten

| Budget | Norm | Lab v7.6 | Oordeel |
|---|---|---|---|
| Home/Vandaag bruikbaar, koud, telefoon 4G | ≤ 2 000 ms | 1 933 ms met 600 ms api-model (1 341 zonder) | gehaald op p50; met het p95-model (1 500 ms) ≈ 2,8 s: niet haalbaar zonder kleinere index.html, zie §6 |
| Vandaag bruikbaar, warm | ≤ 600 ms (nieuw) | 218–260 ms | gehaald |
| Vandaag warm bij een hangende server | ≤ 1 500 ms (nieuw) | 294–337 ms | gehaald |
| p95 per api in productie | < 1 500 ms | onbekend | pas te toetsen met de telemetrie (⚠️ Menno: na twee weken Beheer → Metingen bekijken) |
| Onafgevangen JS-fouten | 0 | 0 in alle metingen | gehaald |
| Api-rondreizen achter elkaar per schermwissel (nieuw) | ≤ 1, Rapporten ≤ 2 | alle schermen | gehaald |
| Render op praktijkschaal, telefoon (nieuw, regressiegrens ≈ 1,5× nulmeting) | Relaties 300, Taken 325, Projecten 350, Bezetting 425, Financiën 1 050 ms | 258 / 212 / 297 / 395 / 730 | gehaald |

Het koude budget van 2 s is met het 600 ms-model haalbaar maar krap (3 % marge); `test/prestatie.py` rekent daarom met een meetruismarge van 10 % (`--marge`) en meldt de mediaan erbij. De enige manier om de koude start wezenlijk verder omlaag te krijgen is index.html kleiner maken (62 % van de koude start is de HTML-download), zie §6.

## 3. Telemetrie (v7.6)

De app meet nu elke backend-aanroep (api-naam, duur, ok of een korte foutcode) en elke onafgevangen JS-fout (`window.onerror`, `unhandledrejection`), bundelt per dag en api in zes duur-emmers (≤ 250, 500, 1 000, 2 000, 5 000 ms, daarboven) en stuurt dat stil met `apiMetingenOpslaan` naar het tabblad `Metingen`: na de eerste geslaagde schermlading en als de app uit beeld gaat, hoogstens een paar keer per dag (> 24 uur sinds de vorige keer of ≥ 50 ruwe metingen; tien minuten wachten na een fout; ringbuffer `aa_metingen` van 400). Beheer (management, recht `metingen`) toont per api aantal, p50, p95 (schatting uit de emmers) en fout%, de tien traagste bovenaan, plus het aantal JS-fouten met de laatste melding; `apiMetingen(dagen)`. Opruimen na 90 dagen rijdt mee op `archiveer()`. Privacy: alleen api-naam, dag, gebruikers-id, tellingen en één ingekorte foutmelding zonder e-mailadressen; nooit argumenten of gegevens. Ook in de demo, de mock, de server (schema `metingen`), de rooktest (blok "v7.6: metingen"), `rechten_test`, `fuzz`, `vergelijk`, README en skill.

Kosten: de ruwe metingen staan in het geheugen (`METING.lijst`) en gaan buiten de then van de aanroeper om naar `aa_metingen` (setTimeout 0; iOS-review R4), plus één extra stille aanroep per dag per gebruiker. Het verzenden bij `visibilitychange` gaat met `keepalive` (iOS-review R1) en op de eigen server niet als het token binnen een minuut verloopt (geen tokenvernieuwing vanuit het wegzwaaien).

## 4. De drie posten: voor en na

Alle nametingen op dezelfde machine, kort na elkaar, met hetzelfde harnas: "voor" tegen een schone worktree van commit 218285d, "na" tegen de werkkopie; vijf runs; mediaan, p95 (= max) en spreiding in de ruwe bestanden. Niets onder 10 % op de eigen maat is uitgerold.

### Post 1: de start (service worker en Vandaag-cache) — commit f6d843b

Wijziging. `sw.js`: HTML stale-while-revalidate in plaats van network-first met een time-out van 3 s; SHELL zonder de dubbele `./index.html` (install zet de response van `./` onder beide sleutels). `index.html`: Vandaag op de telefoon tekent eerst de vorige `apiOverzicht` uit `aa_cache_vandaag` (zoals `laadHome` op desktop al deed met `aa_cache_home`) en ververst daarna; de sleutel gaat weg bij een andere koppelcode en bij uitloggen.

| Maat (telefoon, 4G-pijp met gzip en ETag, 4× CPU, 5 runs) | Voor mediaan (spreiding) | Na mediaan (spreiding) | Winst |
|---|---|---|---|
| Warm: Vandaag gevuld | 615 (572–663) | 260 (237–317) | −58 % |
| Warm: scriptstart (service worker) | 408 (367–446) | 242 (219–292) | −41 % |
| Warm: gevuld na scriptstart (Vandaag-cache) | 207 | 18 | −91 % |
| Warm, hangende server (?traag=1): gevuld | 3549 (3456–3594) | 337 (262–446) | −90 % |
| Warm, offline: gevuld | 246 (211–307) | 222 (206–297) | −10 %, en nu de vorige Vandaag in plaats van een lege lijst |
| Koud: gevuld | 1356 (1303–1398) | 1341 (1308–1442) | ruis (geen cache bij een eerste bezoek) |
| HTML-bytes per koude start (pagina + installatie) | 495 kB (3× 165) | 330 kB (2× 165) | −33 % |

Gedrag bij een release: de gebruiker krijgt na de volgende sw.js-update (CACHE-bump) de balk "Nieuwe versie beschikbaar" (v7.3) en kiest zelf Herladen; precies het geval waarvoor die balk bestaat. Tot v7.5 kreeg een navigatie vlak na een deploy de nieuwe HTML soms al zonder die balk; nu altijd via de balk. CACHE-bump per release blijft verplicht (hook `check-index.sh`). Uit de iOS-review (§7): install haalt `./` met `cache: 'no-cache'` (GitHub Pages stuurt `max-age=600`, anders kon een nieuwe worker vlak na een release de oude index.html in zijn cache zetten), `uitCache` kijkt alleen in de eigen cache (`cacheName`), de achtergrondput loopt buiten het antwoord om en alleen als de cache nog bestaat, en een pagina die weer in beeld komt vraagt hoogstens eens per tien minuten een sw.js-check aan.

Teruggedraaid binnen deze post: de registratie van de service worker uitstellen tot na `load` + 1 s (de installatie deelt op 4G de lijn met de eerste api-aanroep). A/B/A-meting van de koude start, zie §4.4.

### Post 2: api-ketens in de app — commit 401911a

Wijziging. `laadRelaties` ververst de getekende tab (taken, pipeline, rapport) stil en tegelijk met apiCrm (`verversTab`, `stilTab`: de vorige lijst blijft staan tot de verse er is; Rapporten via `laadRapport`) in plaats van de lijst na apiCrm te wissen en opnieuw te laden; scholen en personen tekenen opnieuw zodra apiCrm binnen is. `wisselView('trajecten')` start `laadBezetting` bij het eerste bezoek meteen naast `laadTrajecten` als de weergave Bezetting is (een bord dat er al staat blijft staan: Terug van een project rekent op S.bVast, de scrollpositie, de focus en lokale wijzigingen, zoals `test_app.py` bewaakt); de then-tak van apiBezetting tekent niet zolang apiTrajecten loopt, zodat er één render is.

| Scherm (mock 150 ms RTT, management, 5 runs) | Span voor → na | Diepte | Aanroepen |
|---|---|---|---|
| Taken, desktop | 430 → 258 ms (−40 %) | 2 → 1 | 3 → 2 |
| Bezetting · Per vacature, desktop | 404 → 242 ms (−40 %) | 2 → 1 | 2 → 2 (nu parallel) |
| Projectdetail, desktop | 394 → 244 ms (−38 %) | 2 → 1 | 3 → 3 (nu parallel) |
| Projectdetail, telefoon | 406 → 283 ms (−30 %) | 2 → 1 | 3 → 3 |
| Rapporten, telefoon | 582 → 459 ms (−21 %) | 3 → 2 | 5 → 4 |
| Rapporten, desktop | 428 → 385 ms (−10 %) | 2 → 2 (inherent) | 4 → 3 |
| Aanroepen per doorloop | desktop 27 → 25, telefoon 23 → 22 | | |
| Stappen met diepte ≥ 2 | 6 → 2 (beide Rapporten) | | |

Met 600 ms per aanroep (Apps Script) is elke rondreis minder 600 ms p50 en 1 500 ms p95 in wat de gebruiker ziet. Alle overige stappen bleven binnen ±5 % (ruis).

### Post 3: lees()-kosten in de backend — commit 3ce1983

Wijziging. `talentNaamVan()` gebruikt een lichte namenmap uit alleen `Talenten`, pas bij de eerste activiteit met een talentId, in plaats van de volledige `talentIndex()` (vijf tabbladen). `instelling()` bouwt één map per verzoek in plaats van bij elke aanroep de hele tab te kopiëren. Beide maps gaan leeg in `vergeet()` en per demo-verzoek (`demo-backend.js`, ook `_TAAKINDEX`).

| Maat (Node, groot-profiel, 99 api's × vier rollen, exact) | Voor | Na | Winst |
|---|---|---|---|
| lees()-aanroepen, alle cellen | 19 984 | 2 154 | −89 % |
| lees() per verzoek: apiTalenten / apiTeamRapport / apiBezetting | 3 170 / 2 815 / 1 408 | 9 / 25 / 10 | −99 % |
| Tabbladen uit de Sheet: apiSchool (sophie / sem) | 13 / 15 | 9 / 11 | −31 / −27 % |
| Tabbladen: apiActiviteiten, apiActiviteitOpslaan | 11 / 11 | 7 / 7 | −36 % |
| Tabbladen: apiHome (sophie / sem) | 16 / 16 | 13 / 13 | −19 % |
| Rijen uit de Sheet: apiSchool / apiActiviteiten / apiHome | 6 438 / 6 302 / 7 819 | 4 957 / 4 821 / 7 081 | −23 / −24 / −9 % |
| getValues-aanroepen, alle cellen | 1 739 | 1 684 | −3 % |

apiHome houdt `Talenten` (770 rijen × 42 kolommen) zolang een van de 25 recente activiteiten een talentId heeft, en `Kandidaten` voor de kerncijfers. In Apps Script is elk tabblad een eigen getValues-rondreis; de ms-winst in productie volgt uit de telemetrie (⚠️ Menno/Claude: na twee weken apiHome, apiSchool, apiActiviteiten en apiBezetting vergelijken met het oude uitvoeringenlogboek). De Node-ms zijn op deze machine geen betrouwbare maat (tot 1,6× tussen twee runs); de tellingen wel.

### 4.4 Teruggedraaid

- **Service worker later registreren** (load + 1 s, zodat de installatie van de shell niet met de eerste api-aanroep om de 4G-lijn vecht). Koude start A/B/A met `test/prestatie.py --deel 1 --runs 3` tegen de 4G-pijp met het 600 ms-model: uitgesteld 1 918 ms (n = 6, spreiding 1 892–1 939), meteen 2 048 ms (n = 3, 2 030–2 127): −6,3 %, consistent in alle drie de vergelijkingen maar onder de 10 %. Niet uitgerold; kandidaat om samen met een kleinere index.html opnieuw te meten.

## 5. `test/prestatie.py`

Dwingt de budgetten af en eindigt met ALLES GOED (exitcode 0) of FOUTEN: n. Start zelf `test/mock_backend.py` op 8797 zoals een echte host hem stuurt (v7.6-vlaggen `MOCK_GZIP`, `MOCK_ETAG`, `MOCK_PACE`: gzip, ETag/304 met HTTP/1.1, trage 4G in de server als één gedeelde pijp zodat ook de fetches van de service worker geremd zijn) met `MOCK_VERTRAAG_MS` als api-model (standaard 600, `--vertraag 0` meet zonder model) en `MOCK_HTML_VERTRAAG_MS` voor de hangende server. Deel 1 (mock, vaste seed): koud, warm en hangende server op de telefoon met 4× CPU; de api-ketens per schermwissel op telefoon en desktop (diepte ≤ 1, Rapporten ≤ 2); JS-fouten. Deel 2 (demo `?demo=1&schaal=groot&kaal=1&rol=sophie`, vaste seed): tik tot getekend per scherm op praktijkschaal tegen een regressiegrens van ≈ 1,5× de nulmeting. Vijf runs, mediaan tegen het budget met een meetruismarge van 10 % (`--marge`), p95 erbij, nproc en loadavg in de uitvoer. ⚠️ Afwijking van de opdracht ("op de demo"): de start en de ketens worden tegen de mock gemeten, want de demo laadt Code.gs in een iframe (extra 450 kB over 4G) en heeft geen netwerk naar de api; de render op schaal wel op de demo. Looptijd ±5 minuten.

Uitkomst op de werkkopie van v7.6 (5 runs, load 0,3–1,9): koud 1 933 ms, warm 218 ms, hangende server 315 ms, alle ketens binnen het budget, render 258 / 212 / 297 / 395 / 730 ms, 0 fouten: ALLES GOED.

## 6. Niet gedaan, met reden

- **Bezetting → Alle vacatures (2,26 s op de telefoon op praktijkschaal).** De 742 `<select>` per kandidaatrij als pil die pas bij een tik een keuzelijst opent: ≈ −65 % (verificatieruns: innerHTML 346 → 49 ms, layout 1 371 → 563 ms). Niet in v7.6: raakt de bediening (status kiezen) en de golf-tests; eerste kandidaat voor v7.7 (⚠️ eigenaar Claude, vraag aan Menno: hoe vaak gebruikt het talentteam "Alle vacatures" op de telefoon?). Tussenstap zonder UI-wijziging: de lijst begrenzen zoals Per project al doet.
- **index.html kleiner maken** (62 % van de koude start; 87,5 % van het script draait niet vóór Home): zelden gebruikte delen (demo, portaal, Financiën, Talent, Exact) uitgesteld laden. Grote ingreep in één bestand zonder bundler; alleen de koude start wint (warm maakt de V8-code-cache compileren bijna gratis). Niet in v7.6.
- **Desktop CLS 0,2** door `zetDesk()` na het script: klein inline script in `<head>` dat `body.desk` vóór de eerste paint zet. Niet gemeten als post omdat CLS geen onderdeel van de budgetten was; kandidaat v7.7 (≈ 10 regels).
- **apiCrm afslanken (191 kB → ≈ 110 kB)** en lijstvarianten voor apiBezetting (502 kB) en apiTalenten (994 kB): de velden worden door meerdere schermen gebruikt (persoonrij toont e-mail en telefoon); vraagt een audit van alle lezers van `CRM.basis`. Niet in v7.6.
- **apiTrajecten zonder de hele tab Activiteiten** (updates-telling): een tellerkolom op Trajecten bijhouden bij het loggen; raakt het datamodel. Niet in v7.6.
- **Schrijfpaden die het tabblad 2–3× lezen** (`vergeet()` na `schrijf()`): de gewijzigde rij in de cache vervangen; `_rij` van een nieuwe rij moet kloppen. Niet in v7.6.
- **Terug uit cache** (apiSchool, apiTrajecten opnieuw bij Terug): detail-cache met invalidatie bij elke schrijfactie. Niet in v7.6.
- **Rapporten: apiActiviteiten tegelijk met apiTeamRapport** (periode client-side of in één antwoord): raakt het contract. Niet in v7.6.
- **esc(), DocumentFragment, debounce op zoeken:** geen hotspots volgens de rendermeting (< 2 %, 3–13 ms per toets).

## 7. Verificatie

**iOS-review** (subagent `ios-pwa-reviewer`, twee rondes). Ronde 1: één blokkerende bevinding en vier risico's, alle verwerkt:
- B1 (blokkerend): `c.addAll(SHELL)` haalde `./` via de HTTP-cache; GitHub Pages stuurt `cache-control: max-age=600` (geverifieerd met `curl -I` op de productie-url: ETag, gzip, 167 kB), dus een nieuwe worker kon binnen tien minuten na een release de oude index.html onder de nieuwe CACHE zetten en na Herladen stond die er nog, zonder balk. Fix: `new Request('./', { cache: 'no-cache' })` in install.
- R1: verzenden bij `visibilitychange` zonder `keepalive` wordt op iOS vaak afgebroken; dan blijft de buffer staan en telt de bundel de volgende keer dubbel (aantallen, niet p50/p95). Fix: `keepalive` op stille aanroepen; op de eigen server geen verzending als het token binnen een minuut verloopt (geen refresh-token-rotatie vanuit het wegzwaaien).
- R2: `aa_cache_vandaag` bevat mail en agenda en bleef staan bij een nieuwe login op hetzelfde toestel (verlopen sessie, Google-login); `aa_cache_home`/`aa_cache_crm` hadden dit al. Fix: `wisCaches()` in beide 'secret'-paden en in `tokenUitHash`.
- R3: een pagina die dagen leeft kreeg geen sw.js-check, en met cache-eerst hangt de update-balk daaraan. Fix: `registration.update()` als de app weer in beeld komt, hoogstens eens per tien minuten.
- R4: telemetrie op het kritieke pad van elke `run()` (JSON van de hele buffer per aanroep, 1–3 ms op een oudere iPhone). Fix: buffer in het geheugen, wegschrijven met setTimeout 0.
- O2: de oude worker kon na een release met `caches.open` een achtergebleven cache maken. Fix: `caches.has(CACHE)` vóór de put en `cacheName` in `uitCache`.
Ronde 2 (op de fixes): [uitkomst volgt].

**Suites** op de laatste commit: [lijst volgt].

## 8. Open punten (elk met eigenaar en vraag)

1. ⚠️ **Latentiemodel Apps Script 600 / 1 500 ms** — Menno: export van het uitvoeringenlogboek over 30 dagen (functie, duur, fout), alleen lokaal; vervangt het model en geeft de echte p50/p95/fout% per api als nulmeting.
2. ⚠️ **Productie na twee weken** — Menno en Claude: Beheer → Metingen (p50, p95, fout% per api, JS-fouten) vergelijken met het oude logboek; verwachting: lagere p95 op apiHome, apiSchool, apiActiviteiten, apiBezetting en minder dubbele aanroepen (apiTaken, apiTeamRapport). Pas dan is "productielog na twee weken" in te vullen.
3. ⚠️ **iPhone over 4G** — Menno: Web Inspector-trace plus HAR van een koude start van Home, Relaties, een schooldetail en Bezetting; toetst de 4G-nabootsing (CDP en server-pacing) en de V8-aannames (WebKit cachet anders).
4. ⚠️ **Rijtellingen van de echte Sheet** — Menno: per tabblad; toetst of het groot-profiel (9 941 rijen, Activiteiten 3 277, Talenten 770) de praktijk dekt.
5. ⚠️ **Gebruikersmeting** — Menno: twintig minuten meekijken bij twee gebruikers plus klachten; daarna de negen kerntaken van `test/ux_taken.py` bij drie gebruikers voor en na. Niet uitgevoerd in v7.6.
6. **Headers van GitHub Pages** — geverifieerd op 5 november 2026 met `curl -I` op de productie-url: `cache-control: max-age=600`, ETag, gzip (167 180 bytes voor index.html); dit is precies waarom install `./` nu met `cache: 'no-cache'` ophaalt. ⚠️ Vercel (eigen domein, nog niet in gebruik) — Menno: zodra die live is dezelfde `curl -I` (de reviewer zag `no-cache` op /index.html en `must-revalidate` op /).
7. ⚠️ **Telemetrie op iOS bij het wegzwaaien** — de verzending gaat nu met `keepalive`; raakt het antwoord toch zoek, dan gaat dezelfde bundel de volgende keer opnieuw mee en telt `apiMetingenOpslaan` hem op (aantallen te hoog, p50/p95 niet). Claude: na twee weken aan `aantal` per gebruiker zien of dat voorkomt; dan een bundel-id in de rij.
8. ⚠️ **Bezetting → Alle vacatures** op praktijkschaal (§6) — Claude v7.7, vraag aan Menno over het gebruik.

## 9. Herhalen

- Nulmeting en nameting: de harnassen staan buiten de repo (scratchpad `prestatie/{laad,kritiekpad,waterval,backend,render}` en `voor/`, `na/`); de methode staat per onderdeel in §1. `test/prestatie.py` is de blijvende vorm.
- `node test/demo_groot_test.js` deel 7 (elke api × vier rollen < 500 ms) blijft de grens op de backend; `python3 test/ux_prestatie.py` meet de slechtste variant (mock zonder gzip) en is daarmee een bovengrens, geen nulmeting.
- Bij elke volgende prestatiewijziging: eerst de eigen maat kiezen, vijf runs voor en na op dezelfde machine kort na elkaar, onder 10 % terugdraaien.
