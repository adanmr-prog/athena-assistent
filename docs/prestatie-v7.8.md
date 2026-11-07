# Prestatie, ronde 2 (v7.8)

Vervolg op `docs/prestatie-v7.6.md`: de drie punten uit §6 en §7 daarvan die op naam van Claude stonden, elk met een eigen maat, vijf runs vóór en ná op dezelfde machine kort na elkaar, en de regel "onder 10 % terugdraaien". Datum: 6 november 2026. ⚠️ = aanname of nog te verifiëren.

## 0. Samenvatting

| Post | Maat | Vóór | Ná | Verschil |
|---|---|---|---|---|
| A. Bezetting → Alle vacatures zonder 742 `<select>` | tik tot getekend, telefoon 4× CPU, demo op praktijkschaal (195 kaarten, 742 kandidaatrijen), mediaan van vijf | 1 416 ms (p95 1 530) | 678 ms (p95 697); na de reviewronde 664–686 ms | −52 % (−51,6 % bij de verificatie) |
| B. `body.desk` vóór de eerste paint | CLS koude start Home, desktop 1 280 px, trage 4G (mock met `MOCK_PACE`), mediaan van vijf | 0,169 | 0,006 | −96 % |
| C. Datumveldhoogte fontonafhankelijk | `min-height` van een leeg datumveld tegenover een tekstveld ernaast, met en zonder Nunito | 2 px verschil zonder Nunito (33 tegenover 31) | 0 px, met en zonder Nunito (34,6 tegenover 34,6; één gedeelde `min-height`) | `test/demo_groot.py` groen zonder `--fonts` |

Geen backendwijziging: `Code.gs` blijft op 7.7; CACHE `athena-assistent-v7.8`, `APP_VERSIE` 7.8.

## 1. Post A: Bezetting → Alle vacatures (kandidaatstatus als pil)

**Probleem** (`docs/prestatie-v7.6.md` §6): bij "Alle vacatures" (`[data-bopen="0"]`) tekent elke `kandidaatRij` een `<select class="pill">` met alle statussen; op praktijkschaal zijn dat er 742 in één hertekening. Een `<select>` is het duurste formulierelement om te maken en te layouten (innerHTML 346 ms, layout 1 371 ms in de nulmeting van v7.6).

**Wijziging.** `kandidaatPil(k, wijzig)` tekent de status als pil-knop (`<button class="pill kpil p-<slug>" data-kpil aria-haspopup="listbox" aria-expanded>`) die pas bij een tik, Enter, spatie of pijl-omlaag de ene keuzelijst van de app opent: `#kpilMenu` (`role="listbox"`, `position: fixed`, z-index 80: boven kaarten, bord en tabbalk, onder `#venster` en `#toast`), rechts uitgelijnd met de pil, eronder of erboven, begrensd op de ruimte in het venster minus `env(safe-area-inset-bottom)` (`veiligOnder()`), met per status een `<button role="option" data-kkies aria-selected>` met kleurstip; de huidige status staat bij openen in beeld (`kpilInBeeld`). Kiezen slaat op zoals de oude change-tak (`apiKandidaatOpslaan` met `_oud.status`, `bezettingLokaal`, niets bij een gelijke status). Pijltjes (rond), Home/End, Enter/spatie; Escape en Tab sluiten; een pointerdown buiten het menu sluit en slikt de bijbehorende click in (`kpilSlik`, 500 ms), zodat een wegtik niet de rij eronder opent; scrollen sluit alleen als de pil werkelijk verplaatst is (`kpilScroll`; een momentumscroll van vlak vóór de tik sluit dus niet), resize en hertekenen sluiten altijd; de focus gaat terug naar de pil, ook na het hertekenen van het bord en de projecttab. Zonder wijzigrecht is de status een `<span class="pill kpil-vast">` met "Status van <naam>: " als verborgen tekst (geen `aria-label` op een span, ARIA 1.2). Op een iPad met `body.desk` en touch (`@media (hover: none)`) zijn de opties 44 px en de pil 36 px. `pillSelect` blijft voor de projectvelden, factuurstatus en kansfase; de `[data-kstatus]`-tak uit de change-handler is weg omdat nergens meer een `<select data-kstatus>` wordt getekend.

**Meting.** Harnas `prestatie/render_bezetting.py` (scratchpad, buiten de repo), naar het voorbeeld van `test/prestatie.py` deel 2: demo `?demo=1&schaal=groot&kaal=1&rol=sophie`, telefoon 390 × 844 met CPU-rem 4×, Projecten → Bezetting (maat "per vacature": klik tot `.vac-kaart` plus twee frames) → "Alle vacatures" (maat: klik tot `[data-bopen="0"].aan` plus twee frames). Vijf runs, rustige machine (load < 0,2), vóór en ná kort na elkaar.

| | Alle vacatures, runs | Mediaan | p95 | Per vacature, mediaan |
|---|---|---|---|---|
| Vóór (`<select>`) | 1 367, 1 428, 1 416, 1 530, 1 314 | 1 416 ms | 1 530 | 240 ms |
| Ná de bouw | 678, 697, 647, 630, 679 | 678 ms | 697 | 214 ms |
| Ná de reviewronde | 631 … | 664 ms | 680 | — |
| Verificatie (onafhankelijk) | 686, 664, 729, 729, 645 | 686 ms | 729 | — |

Winst −52 % (bouw) tot −51,6 % (verificatie), ruim boven de 10 %-drempel; "per vacature" niet slechter (binnen de ruis). `test/prestatie.py` heeft de rij `Bezetting alle vacatures` gekregen (budget 1 000 ms ≈ 1,5× de nameting, zodat een terugval naar de oude 1 416 ms rood wordt; deel 2 meet 664–697 ms).

**Reviews** (twee onafhankelijke, op de bouw): correctheid/toegankelijkheid/tests (C1–C6) en iOS-PWA (I1–I7): 0 blokkerend, 4 risico's, 9 nits.
- Risico's: C1/I3 de gefocuste optie bleef buiten beeld in een scrollend menu (`focusStil` met `preventScroll`) → `kpilInBeeld` scrolt alleen het menu; I1 spookklik: de click na een wegtik ging door naar de rij eronder → `kpilSlik`; I2 iPad in landschap kreeg opties van 32 px → 44 px onder `(hover: none)`.
- Nits, verwerkt: C2 budget 1 400 → 1 000 ms; C3/I7 geen `aria-label` op de span; C4 `main` (tabindex −1) telde als focusnemer bij een wegtik; C5 focus na kiezen op de projecttab; C6/I6 "klaar voor start" werd afgekapt op desktop (kolom 128 px, padding 6/16); I4 safe-area in de plaatsing; I5 `overscroll-behavior: contain`.
- Bewust open: I6 (lettergrootte): de pil volgt het token `--fs-klein` (12,5 px op de telefoon), terwijl de overgebleven statusselects daar 16 px zijn door de anti-zoomregel voor velden; een knop zoomt iOS niet in, en een losse `font-size` in px is tegen de huisregel.

**Verificatie** (onafhankelijke agent op commit 62dc3f1): elk reviewpunt met regelnummer nagetrokken en dicht (I6 deels, met reden); conventiescan van de diff schoon; handelingen, kruistabel, test_app (282 api-aanroepen), golf1, golf4, toetsenbord, ux_taken, ux_rust, demo_groot (met en zonder fonts, met drie nieuwe controles: geen afgekapte statuspil onder 742 kandidaten, iPad-tikdoelen, menu binnen het venster) en prestatie deel 2 groen; eigen controle in de mock op telefoon, desktop (ook 1 280 × 420), iPad en de iOS-paden die Chromium zelf niet laat zien (focus na een niet-focussende pointerdown, slik-timer, safe-area 34 px via CDP). Restpunt ter kennisgeving: na een wegtik op desktop eindigt de focus op `main` omdat de browser het getikte element zelf focust (bestaand gedrag); de slik vangt elke eerstvolgende click na een wegtik, ook op Herladen in `#updateBalk` (dan een tweede tik), zoals een native picker.

## 2. Post B: `body.desk` vóór de eerste paint

**Probleem** (`docs/prestatie-v7.6.md` §6): `zetDesk()` zet `body.desk` pas aan het eind van het inline script. Komt de HTML traag binnen (4G), dan tekent de browser eerst de telefoonweergave en springt daarna alles naar de desktopindeling: CLS 0,2 in de nulmeting van v7.6.

**Wijziging.** Direct na `<body>` staat een script van één regel (`<script id="deskVroeg">`) dat met dezelfde mediaquery als `deskMq` (`min-width: 1024px`) de class `desk` zet vóór de eerste paint; `zetDesk()` houdt hem daarna bij zoals voorheen. Het script heeft een `id`, zodat de hook `check-index.sh` en `test/dekking_app.py` (die op de letterlijke `<script>`-tag zoeken) het hoofdscript blijven vinden. De CSP van `vercel.json` staat inline scripts al toe (`script-src 'self' 'unsafe-inline'`).

**Meting** (`prestatie/cls_desktop.py` in de scratchpad): mock met `MOCK_CSP`, `MOCK_GZIP`, `MOCK_ETAG` en `MOCK_PACE` (150 ms per aanvraag en 1,6 Mbit/s als één gedeelde pijp), desktop 1 280 × 800 zonder CPU-rem, verse context per run, `PerformanceObserver` op `layout-shift` (buffered, zonder `hadRecentInput`) tot Home gevuld is plus 1,5 s. Vijf runs.

| | Runs | Mediaan | Verschuivingen |
|---|---|---|---|
| Vóór | 0,169 × 5 | 0,169 | één van 0,162 op ±1 070 ms (de sprong naar `desk`) en één van 0,006 op ±1 280 ms |
| Ná | 0,006 × 5 | 0,006 | alleen de 0,006 op ±1 290 ms (Home wordt gevuld) |

Zonder `MOCK_PACE` (snelle lijn) is de CLS vóór en ná 0,006: de sprong bestaat alleen als de pagina geschilderd wordt vóórdat het script draait. De resterende 0,006 is het vullen van Home en hoort bij de inhoud.

## 3. Post C: datumveldhoogte fontonafhankelijk

**Probleem** (`docs/prestatie-v7.6.md` §7): de v7.4-regel `body.desk .veld input[type=date] { min-height: 33px }` is gemeten met Nunito. Zonder Nunito (zoals in een container zonder fonts) is een tekstveld 31 px en meldt `test/demo_groot.py` een FOUT op de iPad-controle; met de telefoonregel (42 px) hetzelfde.

**Wijziging.** Eén gedeelde regel voor tekst-, keuze- en datumvelden: `.veld input:not([type=checkbox]):not([type=radio]), .veld select { line-height: 1.4; min-height: calc(1.4em + 21px) }` op de telefoon (padding 2 × 9, rand 2 × 1,5) en `min-height: calc(1.4em + 15px)` onder `body.desk` (padding 2 × 6). Omdat tekst- én datumveld dezelfde `min-height` hebben, zijn ze per constructie even hoog, met elk lettertype, in elke engine en bij elke pixeldichtheid; de datumregels zelf houden alleen `appearance: none`. De regelhoogte is 1,4 en niet lager, omdat WebKit in een éénregelig tekstveld een `line-height` onder de normale regelhoogte van het lettertype (Nunito: 1,364) terugzet op `normal` (bevinding van de iOS-review; Chromium doet dat pas onder 1 em, waardoor een eerste versie met 1,3 alleen in Chromium klopte). Erbij: `::-webkit-date-and-time-value { margin: 0 }`, zodat op iOS een gevuld datumveld even hoog is als een leeg (de UA-marge van 1 px boven en onder bestond sinds v4.1). De regels van `.le-rij` (40 px) en `.ftabel` (30 px) staan buiten `.veld`, hebben eigen padding en zijn niet aangeraakt (volgende post met hetzelfde patroon zodra dit op een iPad is bevestigd).

**Meting** (`prestatie/veldhoogte.py` in de scratchpad: demo, bewerkvenster van een taak, hoogte van het tekstveld, het datumveld en de keuzelijst met `getBoundingClientRect`, met en zonder lokale Nunito; Chromium op DPR 1):

| | Telefoon 390 px, tekst / datum / keuzelijst | Desktop 1 280 px, tekst / datum / keuzelijst |
|---|---|---|
| Vóór, zonder Nunito | 40 / 42 / 42 (min datum 42) | 31 / 33 / 33 (min datum 33) |
| Vóór, met Nunito | 42 / 44 / 44 (min datum 42) | 33 / 35 / 35 (min datum 33) |
| Ná, zonder Nunito | 43,4 / 44,4 / 43,4 (min 43,4 op alle drie) | 34,6 / 35,6 / 34,6 (min 34,6) |
| Ná, met Nunito | 43,4 / 44,4 / 44 (min 43,4) | 34,6 / 35,6 / 35 (min 34,6) |

Het datumveld is in Chromium 1 px hoger dan het tekstveld (de interne datumbewerker heeft eigen padding; vóór de wijziging 2 px); dat is geen onderdeel van de regel. Velden worden met Nunito 1,4–1,6 px hoger dan voorheen (de telefoon komt daarmee op 43,4 px, dichter bij de 44 px-norm). Rekensom voor iOS uit de review (WebKit rondt ascent en descent apart af en telt de rand als 1,5 px): telefoon tekstveld 43,4 = min-height 43,4, iPad in landschap 34,6 = 34,6. `test/demo_groot.py` is groen met én zonder `--fonts` (iPad-controle: `min-height 34.6px … naast een tekstveld van 34 px`). ⚠️ Op iOS zelf niet gemeten: op een iPad de hoogte van `#vf-exactpeil` en `[data-exactkol]` in het Exact-venster vergelijken (Web Inspector, `getBoundingClientRect().height`).

## 4. Verificatie

**Post A** is gebouwd, gereviewd (correctheid en iOS, onafhankelijk) en geverifieerd in een eigen worktree (§1). **Post B en C** kregen een aparte iOS-review (`ios-pwa-reviewer`): 0 blokkerend, 2 risico's en 3 nits, alle op post C: WebKit zet een `line-height` onder de normale regelhoogte van het lettertype terug op `normal` (R1) en de rand van 1,5 px telt alleen in Chromium op DPR 1 als 1 px (R2) → één gedeelde `min-height` met regelhoogte 1,4 (§3); `.veld select` doet mee (N3); de `.le-rij`- en `.ftabel`-regels blijven terecht buiten deze post (N4); `::-webkit-date-and-time-value { margin: 0 }` (N5). Post B in orde bevonden: dezelfde mediaquery als `deskMq` met de viewport-meta al verwerkt, CSP staat inline scripts toe, de service worker heeft geen nieuw shell-bestand nodig, portaal en demo kregen `desk` al vóór `startApp`/`startPortaal` (alleen het moment verschuift), niets overschrijft `body.className` behalve de `v-*`-wissel, geen flits of dubbele layout.

**Suites** op de samengevoegde branch (eerst de volledige run van 25 suites, daarna test_app, demo_groot met en zonder fonts, golf4, ux_taken en handelingen opnieuw na de laatste aanpassing van post C): node_rooktest, parser_test, kruistabel, handelingen, fuzz (0 interne fouten, 0 rechtenlekken), rechten_test, server/dekking (0 gaten), server/vergelijk (0 onverklaarde verschillen), server_test, security_test, demo_groot_test, tz_test `--snel`, mutatie_test, test_app, storing, toetsenbord, golf1–golf4, demo_groot (met én zonder `--fonts`), demo_shots rooktest, ux_taken en prestatie: alle ALLES GOED. `prestatie.py`: Vandaag koud, warm en bij een hangende server binnen het budget, ketens binnen het budget, render op praktijkschaal Relaties 190, Taken 144, Projecten 200, Bezetting per vacature 214, Bezetting alle vacatures 647 (budget 1 000), Financiën 417 ms, 0 JS-fouten. Hook `check-index.sh`: syntax van het inline script schoon (de melding over `sw.js` is de bedoelde CACHE-bump).

**Niet gemeten:** iOS zelf (post C, zie §3) en Vercel (niet in gebruik).

## 5. Open punten

- De open punten 1–5 en 7 uit `docs/prestatie-v7.6.md` §8 (productielogboek, metingen na twee weken, iPhone-trace, rijtellingen, gebruikersmeting, telemetrie bij het wegzwaaien) staan nog open bij Menno; §8 punt 8 (Bezetting → Alle vacatures) is met deze release gedaan.
- `index.html` kleiner maken, `apiCrm` afslanken, schrijfpaden die het tabblad 2–3× lezen en "terug uit cache" blijven de volgende kandidaten (§6 van v7.6).
