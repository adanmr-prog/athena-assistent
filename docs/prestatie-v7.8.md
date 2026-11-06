# Prestatie, ronde 2 (v7.8)

Vervolg op `docs/prestatie-v7.6.md`: de drie punten uit §6 en §7 daarvan die op naam van Claude stonden, elk met een eigen maat, vijf runs vóór en ná op dezelfde machine kort na elkaar, en de regel "onder 10 % terugdraaien". Datum: 6 november 2026. ⚠️ = aanname of nog te verifiëren.

## 0. Samenvatting

| Post | Maat | Vóór | Ná | Verschil |
|---|---|---|---|---|
| A. Bezetting → Alle vacatures zonder 742 `<select>` | tik tot getekend, telefoon 4× CPU, demo op praktijkschaal (195 kaarten, 742 kandidaatrijen), mediaan van vijf | 1 416 ms (p95 1 530) | _zie §1_ | _zie §1_ |
| B. `body.desk` vóór de eerste paint | CLS koude start Home, desktop 1 280 px, trage 4G (mock met `MOCK_PACE`), mediaan van vijf | 0,169 | 0,006 | −96 % |
| C. Datumveldhoogte fontonafhankelijk | `min-height` van een leeg datumveld tegenover een tekstveld ernaast, met en zonder Nunito | 2 px verschil zonder Nunito (33 tegenover 31) | 0 px, met en zonder Nunito (32,2 tegenover 32) | `test/demo_groot.py` groen zonder `--fonts` |

Geen backendwijziging: `Code.gs` blijft op 7.7; CACHE `athena-assistent-v7.8`, `APP_VERSIE` 7.8.

## 1. Post A: Bezetting → Alle vacatures (kandidaatstatus als pil)

**Probleem** (`docs/prestatie-v7.6.md` §6): bij "Alle vacatures" (`[data-bopen="0"]`) tekent elke `kandidaatRij` een `<select class="pill">` met alle statussen; op praktijkschaal zijn dat er 742 in één hertekening. Een `<select>` is het duurste formulierelement om te maken en te layouten (innerHTML 346 ms, layout 1 371 ms in de nulmeting van v7.6).

**Wijziging.** De status is een pil-knop (`[data-kpil]`, class `pill kpil p-<slug>`) die pas bij een tik, Enter, spatie of pijl-omlaag één keuzelijst opent (`#kpilMenu`, `role="listbox"`, opties `[data-kkies]` met `role="option"`); zonder wijzigrecht is het een `<span>`. Kiezen slaat op zoals voorheen (`apiKandidaatOpslaan` met `_oud.status`, `bezettingLokaal`). Escape, Tab, een tik buiten het menu, scrollen, resize en hertekenen sluiten het menu; de focus gaat terug naar de pil. `pillSelect` blijft voor de projectvelden, factuurstatus en kansfase.

**Meting.** Harnas `prestatie/render_bezetting.py` (scratchpad, buiten de repo), naar het voorbeeld van `test/prestatie.py` deel 2: demo `?demo=1&schaal=groot&kaal=1&rol=sophie`, telefoon 390 × 844 met CPU-rem 4×, Projecten → Bezetting (maat "per vacature") → "Alle vacatures" (maat: klik tot `[data-bopen="0"].aan` plus twee frames).

_Cijfers, reviews en verificatie: worden aangevuld zodra de bouw- en reviewronde klaar is._

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

**Wijziging.** `.veld input { line-height: 1.3 }` legt de regelhoogte van elk invoerveld vast, en de datumregels rekenen daarmee: `calc(1.3em + 20px)` op de telefoon (padding 2 × 9, rand 2 × 1,5 die Chromium per zijde als 1 px telt) en `calc(1.3em + 14px)` op desktop (padding 2 × 6). De `min-height` is daarmee per constructie de hoogte van het tekstveld ernaast, met elk lettertype. De regels van `.le-rij` (40 px) en `.ftabel` (30 px) zijn niet aangeraakt.

**Meting** (`prestatie/veldhoogte.py` in de scratchpad: demo, bewerkvenster van een taak, hoogte van het tekstveld en het datumveld met `getBoundingClientRect`, met en zonder lokale Nunito):

| | Telefoon 390 px, tekst / datum | Desktop 1 280 px, tekst / datum |
|---|---|---|
| Vóór, zonder Nunito | 40 / 42 (min 42) | 31 / 33 (min 33) |
| Vóór, met Nunito | 42 / 44 (min 42) | 33 / 35 (min 33) |
| Ná, zonder Nunito | 40,8 / 42,8 (min 40,8) | 32,2 / 34,2 (min 32,2) |
| Ná, met Nunito | 40,8 / 42,8 (min 40,8) | 32,2 / 34,2 (min 32,2) |

Het datumveld is in Chromium altijd 2 px hoger dan het tekstveld (de interne datumbewerker heeft eigen padding); dat was al zo en is geen onderdeel van de regel. Met Nunito worden tekstvelden 0,8–1,2 px lager dan voorheen; zonder Nunito 0,8–1,2 px hoger. `test/demo_groot.py` is nu groen met én zonder `--fonts` (iPad-controle: `min-height 32.2px … 34 px naast een tekstveld van 32 px`). ⚠️ Op iOS zelf niet gemeten; de iOS-review van deze release kijkt ernaar.

## 4. Verificatie

_Wordt aangevuld: suites op de samengevoegde branch, iOS-review._

## 5. Open punten

- De open punten 1–5 en 7 uit `docs/prestatie-v7.6.md` §8 (productielogboek, metingen na twee weken, iPhone-trace, rijtellingen, gebruikersmeting, telemetrie bij het wegzwaaien) staan nog open bij Menno; §8 punt 8 (Bezetting → Alle vacatures) is met deze release gedaan.
- `index.html` kleiner maken, `apiCrm` afslanken, schrijfpaden die het tabblad 2–3× lezen en "terug uit cache" blijven de volgende kandidaten (§6 van v7.6).
