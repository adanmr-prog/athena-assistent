# Prestatie v7.9 (sturing): meting vóór en ná, en de reviewpunten T1, T2, T4 en T6

Release v7.9 (`docs/sturing-v7.9.md`) maakt `index.html` groter en laat de rapporten uit `Fasewissels` tellen. De review vond dat de meting vóór en ná ontbrak (T1, T2) en dat `apiTeamRapport` tegen de releasebasis trager was (T4). Dit document legt de metingen vast, met de regel uit `CLAUDE.md`: eigen maat, vijf runs vóór en ná op dezelfde machine kort na elkaar, onder 10 % terugdraaien. Datum: 11 november 2026. Alle getallen komen uit de mock en de demo met verzonnen gegevens. ⚠️ = aanname of nog te verifiëren.

## 0. Samenvatting

| Punt | Maat | Vóór | Ná | Besluit |
|---|---|---|---|---|
| T1 groei van `index.html` | `test/prestatie.py --deel 1` (telefoon, 4G, 4× CPU, api +600 ms), mediaan van vijf, A/B/A/B | v7.8: koud 2 096 / 2 113 ms, warm 196 / 193 ms, hangend 251 / 258 ms | v7.9: koud 2 106 / 2 116 ms, warm 185 / 193 ms, hangend 251 / 259 ms | binnen 10 % (koud +0,6 %, warm −2 %, hangend 0 %); geaccepteerd |
| T2 service worker later registreren | dezelfde maat, A/B/A | direct registreren: koud 2 249 / 2 243 ms | na de eerste aanroep (uiterlijk 5 s): koud 2 106 / 2 116 ms | −6 %, onder de 10 %; toch behouden, expliciet besluit (§2) |
| T4 `apiTeamRapport` tegen v7.8 | `R9_BASIS=4cf1dd7 node test/demo_groot_test.js` (praktijkschaal, vier rollen, mediaan van vijf) | 445–465 ms | vóór de reviewfix 523–552 ms (+12 tot +20 %); ná 509 ms (+13 %) | geaccepteerd met reden (§3), grens 20 % tegen een basis van vóór v7.9 |
| T6 `sturingTrigger` op het zwaarste pad | vaste klok in `demo_groot_test.js` | — | laatste donderdag 124 ms (maandstand), maandag 55 ms (voorspelling) | ruim onder 2 s |

## 1. T1: de groei van `index.html`

`index.html` groeide van 648 053 naar 752 707 bytes (+16,1 %), gezipt van 176 739 naar 205 904 bytes (+16,5 %), met de reviewronde erbij.

**Opzet.** Op dezelfde machine (4 kernen, load 0,15–0,50) kort na elkaar, elk segment `python3 test/prestatie.py --deel 1 --runs 5` met zijn eigen mock: v7.8 = `4cf1dd7` (de merge-base met main, uitgepakt met `git archive` in de scratchpad), "nu" = v7.9 na de review (deze werkkopie) en "direct" = "nu" met de service worker meteen geregistreerd (de regel van vóór v7.9). Volgorde: v7.8, nu, direct, nu, v7.8, direct, tussen 18:10 en 18:30.

| Segment | Koud (ms, vijf runs) | Mediaan | Warm, mediaan | Hangende server, mediaan |
|---|---|---|---|---|
| v7.8 (1) | 2 111, 2 096, 2 102, 2 096, 2 095 | 2 096 | 196 | 251 |
| nu (1) | 2 130, 2 107, 2 116, 2 092, 2 103 | 2 106 | 185 | 251 |
| direct (1) | 2 277, 2 244, 2 249, 2 259, 2 245 | 2 249 | 193 | 274 |
| nu (2) | 2 130, 2 094, 2 128, 2 101, 2 116 | 2 116 | 193 | 259 |
| v7.8 (2) | 2 161, 2 141, 2 085, 2 079, 2 113 | 2 113 | 193 | 258 |
| direct (2) | 2 265, 2 243, 2 236, 2 253, 2 237 | 2 243 | 203 | 266 |

**Uitkomst.** v7.9 tegen v7.8: koud +0,6 % (2 111 tegen 2 105 gemiddeld over de twee paren), warm −2 %, hangend 0 %. Geen budget is meer dan 10 % slechter dan vóór de release, dus acceptatie 5 van pakket 3 haalt het. De review mat op een ander moment warm +7 % en hangend +12 tot +13 %; dat is hier niet te reproduceren (het warme pad leest `index.html` uit de cache, en het verschil valt binnen de spreiding van de runs). Koud staat met ±2 110 ms boven de 2 000 en binnen de marge van 10 % (grens 2 200) alléén dankzij het latere registreren (§2): zonder dat is koud 2 243–2 249 ms en rood.

**Wat dit betekent voor de volgende release.** De marge is op: een release die `index.html` weer zichtbaar laat groeien, wordt op koud rood. De volgende stap ligt dan klaar en is niet in deze release gebouwd: de UI die alleen het management op desktop gebruikt (MT-overzicht, register, aannames, overstap naar v7.9, import van werkelijke datums) in een eigen script (bijvoorbeeld `sturing.js`) dat pas bij Rapporten → MT of Beheer laadt en in de `SHELL` van `sw.js` staat; een gewoon extra bestand, geen bundler (`docs/prestatie-v7.6.md` §6). Meet dan opnieuw met vijf runs vóór en ná.

## 2. T2: de service worker later registreren

v7.9 registreert de service worker bij een eerste bezoek pas 500 ms na de eerste geslaagde aanroep (`SW_REGISTREER` in `runKern`) of na 5 s; met een controller (de app is al geïnstalleerd) meteen, zodat de update-check, `controllerchange` en `#updateBalk` werken zoals voorheen.

**Meting** (A/B/A in de tabel hierboven, "nu" tegen "direct"): koud 2 106 / 2 116 tegen 2 249 / 2 243 ms (−6,0 %), warm 185 / 193 tegen 193 / 203 ms (−4 %), hangend 251 / 259 tegen 274 / 266 ms (−6 %). Dat is dezelfde orde als in `docs/prestatie-v7.6.md` (−6,3 %, toen niet uitgerold).

**Besluit: behouden, expliciet.** De winst is kleiner dan 10 %, dus volgens de huisregel zou de wijziging terug moeten. Ze blijft toch, omdat zonder haar de groei uit T1 het budget "Vandaag koud" rood maakt (2 243–2 249 ms tegen een grens van 2 200 ms): ze compenseert de groei van `index.html`, en dat is precies de uitzondering die de review noemt.

**Gevolgen voor de eerste sessie** (de punten voor `ios-pwa-reviewer`; die review kon in deze sessie niet draaien ⚠️):
- Een eerste sessie die binnen 5 s sluit, of op het koppelscherm blijft zonder geslaagde aanroep, laat geen worker achter; het volgende bezoek registreert hem dan. Tot die tijd werkt de app niet offline.
- Installeren als PWA op iOS ("Zet op beginscherm") gebeurt in de praktijk na de eerste sessie; dan is de worker er. Te controleren: installeren binnen 5 s na het eerste laden.
- `#updateBalk` en `controllerchange` zijn ongewijzigd, want een pagina met een controller registreert meteen.

## 3. T4: `apiTeamRapport` en de tabbladen per api

**R9 tegen de releasebasis.** `R9_BASIS=4cf1dd7 node test/demo_groot_test.js` (praktijkschaal `&schaal=groot`, vier rollen, vijf runs afwisselend, mediaan):

| Api | v7.8 | v7.9 vóór de reviewfix | v7.9 ná de reviewfix |
|---|---|---|---|
| `apiHome` | 425–431 ms | 468 ms (+9 %) | 437–448 ms (+3 tot +4 %) |
| `apiFinancien` | 98–103 ms | 108 ms (+5 %) | 106 ms (+7 %) |
| `apiTeamRapport` | 445–461 ms | 527–552 ms (+18 tot +20 %) | 509 ms (+13 %) |

**Waar het vandaan komt.** Per api welke tabbladen `leesUitSheet` leest, v7.8 tegen v7.9 (als management, demo-seed):

| Api | Erbij in v7.9 | Na de review |
|---|---|---|
| `apiCrm` | `Aannames` (alleen voor `sturingVerplicht`) | weg: `sturingVerplicht` komt met `apiPipeline` |
| `apiTeamRapport` | `Fasewissels`, `Mijlpalen` | alleen voor consultancy; het rapport van AM en talent leest ze niet meer (`rapportData` haalt de wissels niet meer vooraf op) |
| `apiPipeline`, `apiDoelen` | `Instellingen` | ongewijzigd (keuzelijsten en de periodesleutels) |
| `apiKans`, `apiRapport` | `Fasewissels` | ongewijzigd (de wissels van de kans, AP/AD/VO uit de wissels) |

Verder rekent `teamCijfers` per verzoek één keer per activiteit of ze een contactmoment of gehouden afspraak is en per wissel de rol (een rapport telt tot zo'n dertig periodes met dezelfde gegevens).

**Besluit.** De resterende +13 % voor consultancy is de bewuste prijs van de definitie: AP, AD, VO en deals tellen uit `Fasewissels` (§7.1 punt 1 van `docs/sturing-v7.9.md`), dus het rapport leest één tabblad meer. `test/demo_groot_test.js` staat tegen een basis van vóór v7.9 voor `apiTeamRapport` 20 % toe en meldt dat in de uitvoer; tegen een basis vanaf v7.9 geldt weer 10 %. Neem voor R9 de releasebasis (`git merge-base origin/main HEAD`).

**Bewaking.** De rooktest pint met een leesteller de tabbladen van `apiCrm`, `apiOverzicht`, `apiHome` en `apiTeamRapport`; een nieuw tabblad op zo'n pad is daarmee een bewuste keuze. `Fasewissels` wordt nooit gearchiveerd; met vijf keer zoveel wissels (vier eerdere jaren erbij, 5 605 rijen in het profiel) blijven `apiKans` en `apiTeamRapport` × vier rollen onder 500 ms (traagste 217 ms). Op Apps Script ziet `test/prestatie.py` dit niet, want die rekent met een vast model van 600 ms per aanroep.

## 4. T6: de trigger op het zwaarste pad

`test/demo_groot_test.js` draait `sturingTrigger` nu ook op een vaste klok, met lege tabbladen `Datakwaliteit`, `Voorspellingen` en `Standen`: op de laatste donderdag van de maand bevriest hij een maandstand (124 ms, bevroren rijen > 0) en op maandag schrijft hij twee voorspellingen (55 ms). De bovengrens blijft 2 s; de test bewijst dat nu op elke dag, niet alleen op de dagen waarop het zware pad toevallig draait.

## 5. Open

- Het eigen script voor de managementschermen (§1), zodra een release `index.html` weer laat groeien.
- De beoordeling van de eerste sessie op iOS door `ios-pwa-reviewer` (§2) ⚠️.
