# UX-audit v6.6 (21-10-2026)

Taakgerichte audit van de hele app in de demo (`?demo=1`, fictieve gegevens). Vier rollen: management (Sophie), consultant (Lars), accountmanager (Femke) en talentscout (Sem). Elke rol is getest op twee breedtes: telefoon 390 px (iOS-gedrag) en desktop 1440 px. Er waren drie verbeterrondes. De lus stopte toen er geen bevindingen van ernst ≥ 3 meer over waren.

⚠️ Alle metingen komen uit scripts en de demo. Een test met echte gebruikers staat in §6 en moet nog gebeuren.

## 1. Methode en meetinstrumenten

| Wat | Hoe | Script |
|---|---|---|
| Toegankelijkheid | axe-core 4.10 (WCAG 2.0/2.1/2.2 A+AA) op 79 schermen (4 rollen × 2 breedtes) | `python3 test/ux_audit.py --axe <axe.min.js> --label <naam>` |
| Tikdoelen | elk zichtbaar bedieningselement gemeten: < 24 px is een WCAG 2.5.8-fout; op de telefoon is 44 px de norm voor navigatie, iconen, afvinken en velden en 36 px voor filterchips (zie §5) | idem |
| Horizontale scroll, afgekapte tekst, lege schermen, consolefouten | per scherm | idem |
| Taken | 9 kerntaken als script (cognitive walkthrough), 22 runs: gelukt, handelingen (tik/typ/kies), hoe vaak het doel buiten beeld lag (scrollen), tijd | `python3 test/ux_taken.py --label <naam>` |
| Laden | mock-backend, telefoon, trage 4G (150 ms, 1,6 Mbit/s) en 4× tragere CPU: FCP, LCP, CLS, Vandaag gevuld; koud en warm; 3 runs; main tegen v6.6 naast elkaar | `python3 test/ux_prestatie.py <poort>` |
| Lighthouse | 12.2, toegankelijkheid en best practices op de demo | `lighthouse …?demo=1` |
| Heuristieken | Nielsens 10, per scherm op basis van screenshots (`test/shots/ux/<label>/`), ernst 0–4 | handmatig |
| Consistentie | inventaris van alle knopteksten in `index.html` | handmatig met `grep` |

Na elke ronde draaiden ook `ios-pwa-reviewer`, `parser_test`, `node_rooktest`, `test_app` (met `MOCK_CSP=1`), `test_inlog` en `demo_shots rooktest`.

## 2. Resultaat voor en na

| Meting | Voor (main) | Na (v6.6) | Doel |
|---|---|---|---|
| axe: serious/critical (schermen met een schending) | 79 contrast, 79 viewport, 13 keuzelijst zonder naam, 6 scrollregio zonder focus | **0** | 0 |
| Lighthouse toegankelijkheid (Femke en Sophie) | 88 | **100** | ≥ 95 |
| Lighthouse best practices | 100 | 100 | — |
| Tikdoelen < 24 px | 122 | **0** | 0 |
| Telefoon: doelen onder de norm (zie §1) | 826 onder 44 px (incl. chips) | **0** onder de norm | 0 |
| Horizontale paginascroll / consolefouten / lege schermen | 0 / 0 / 0 | 0 / 0 / 0 | 0 |
| CLS telefoon (Vandaag, koud en warm) | 0,362 | **0,066** | < 0,1 |
| CLS desktop (Home) | ±0,19 | ±0,05 | < 0,1 |
| Vandaag gevuld, telefoon koud / warm | 3,06 s / 0,50 s | 3,05 s / 0,47 s | gelijk of beter |
| Taken gelukt | 22/22 | 22/22 | alles |
| Handelingen (som van 22 runs) | 78 | 78 | ≤ voor |
| Doel buiten beeld (som) | 4 | **3** | ≤ voor |

Over LCP: op de telefoon is de LCP "na" 2,96 s, tegen 0,50 s "voor". Dat is een meeteffect, geen vertraging. Voorheen was de spinner het grootste element. Nu houden lege tegels de plek vast, en daardoor is het grootste element de echte inhoud. Wanneer Vandaag gevuld is, is niet veranderd (zie de rij hierboven).

Taken per run (telefoon; desktop was voor en na gelijk):

| Taak | Rol | Handelingen voor → na | Buiten beeld voor → na |
|---|---|---|---|
| T1 Taak invoeren met snelinvoer | Sophie, Femke | 4 → 4 | 0 → 0 |
| T2 Afvinken en ongedaan maken | Femke | 4 → 4 | 0 → 0 |
| T3 School zoeken en openen | Lars, Femke | 4 → 4 | 0 → 0 |
| T4 Kans op gewonnen met winformulier | Lars | 7 → 7 | 0 → 0 |
| T5 Termijn op betaald zetten | Femke | 3 → 3 | 1 → 1 |
| T6 Talent voorstellen op een vacature | Sem | 5 → 5 | 2 → 2 |
| T7 Financiën: school openklappen | Sophie | 3 → 3 | **1 → 0** |
| T8 Assistent: voorgestelde taak uitvoeren | Lars | 4 → 4 | 0 → 0 |
| T9 Melding openen | Femke | 2 → 2 | 0 → 0 |

## 3. Bevindingen en oplossingen

Ernst: 4 = blokkeert, 3 = groot (fout of verlies van oriëntatie), 2 = hinderlijk, 1 = cosmetisch.

| # | Bevinding | Ernst | Waar | Oplossing |
|---|---|---|---|---|
| 1 | Grijze teksten (labels, meta, hints) halen 2,9:1 in plaats van 4,5:1 | 3 | alle schermen | `--gedempt` #9A8FA0 → #706676 (5,2:1) |
| 2 | Oranje cijfers in tegels 2,1:1; groene en rode statuslabels 3,6:1; oranje labels 3,6:1 | 3 | tegels, labels, Financiën | `--oranje-t` #A86400 voor tekst; `--groen` #23794A; `--rood` #B0381A; #B86E00 → #975A00 |
| 3 | Zoomen geblokkeerd (`maximum-scale=1`) | 3 | overal | weggehaald; op de telefoon velden van 16 px (anders zoomt iOS in bij focus); `touch-action: manipulation` tegen dubbeltik-zoom; knijpzoom ook in het bewerkvenster |
| 4 | Keuzelijsten zonder naam (schermlezer zegt "keuzelijst") | 3 | filters Taken, Contacten, Facturatie, statuspillen | `aria-label` op alle filters en `pillSelect` |
| 5 | Scrollbare tabellen en borden niet met het toetsenbord te bereiken | 2 | Rapport, Pipeline, Financiën | `tabindex="0" role="region"`, zonder focusring bij een tik |
| 6 | Tikdoelen te klein: afvinken 20×28 (desktop 17×22), tabbalk 40 px hoog, bel en instellingen 34 px, chips 29 px, koppelingen in de tijdlijn 18 px, "Updates" 19 px | 3 | overal | tabbalk 48 px, iconen 44 px, vinkje 44×44 met negatieve marge (de layout blijft gelijk), chips 36 px, tijdlijnkoppelingen 36 px, desktop overal minimaal 24 px |
| 7 | Eén ding, drie namen: "Projecten" (titel), "Historie" (tab op de telefoon), "trajecten" (kop, tegels, zoekveld, groep) | 3 | Vandaag, Projecten | overal "project"; de tab heet "Projecten" |
| 8 | Een project openen vanuit Projecten springt op de telefoon naar de tab "Relaties": je weet niet meer waar je bent | 3 | telefoon | `telefoonTab('trajecten')`: tab en titel blijven Projecten |
| 9 | Projecttitel breekt midden in een woord ("Onderwijsondersteunin g") | 2 | detail telefoon | `overflow-wrap: break-word` + `hyphens: auto` (lang nl) |
| 10 | Bronlabel als jargon in taken: "crm", "zelf", "traject" | 2 | Vandaag, Dagstart | `bronLabel()`: crm/handmatig niet tonen, traject → project, review → dagstart, track → stappenplan |
| 11 | "over 1 dag" en "over 3 dagen" lezen trager dan "morgen" en "vr 23 okt" | 2 | takenlijsten | `deadlineTekst`: morgen, dan weekdag + datum t/m 6 dagen, daarna de datum |
| 12 | Kop op de telefoon "04 trajecten / 00 kansen": voorloopnullen, dezelfde cijfers als de tegels eronder, en de datum werd afgekapt | 2 | Vandaag telefoon | verborgen op de telefoon (de tegels tonen het al); op desktop "4 projecten / 0 open kansen" |
| 13 | Twee knoppen voor hetzelfde op desktop ("+ Taak" in de kop en "Nieuwe taak" tussen de filterchips) | 2 | Taken, Contacten, Pipeline | op desktop alleen de knop in de kop |
| 14 | Knopteksten wisselen: "Nieuwe taak" en "+ Taak", "Nieuw project" en "+ Project", "Weg" en "Verwijderen", "Opnieuw" en "Opnieuw proberen" | 2 | overal | overal "+ X", "Verwijderen", "Opnieuw proberen" |
| 15 | Voorstellen: wie al is voorgedragen staat bovenaan met een uitgeschakeld vinkje | 2 | Bezetting → Voorstellen | wie al is voorgedragen staat onderaan |
| 16 | "+ Project", "Facturatie" en "Financiën" staan op de telefoon onder de hele projectenlijst | 3 | Projecten telefoon | bovenaan (T7 hoeft niet meer te scrollen); op desktop verborgen (kop en zijbalk) |
| 17 | Uitlegtekst boven Projecten duwt de lijst op de telefoon omlaag | 1 | Projecten telefoon | verborgen op de telefoon |
| 18 | Vandaag verspringt bij het laden (CLS 0,36): tegels en focuslijst komen na de spinner | 3 | Vandaag telefoon, Home | vier lege tegels houden de plek vast; de focuslijst houdt ±3 regels vrij tijdens het laden |
| 19 | Belknop: naam "Meldingen", terwijl het zichtbare getal ontbreekt in de naam | 1 | kop | `aria-label` "Meldingen: 2 nieuw" |
| 20 | "Vraag het Athena" | 1 | Assistent | "Vraag Athena" |

De iOS-review (`ios-pwa-reviewer`) heeft de wijzigingen gecontroleerd en vond niets blokkerends. Twee risico's zijn meteen opgelost: de kopregel bleef zichtbaar door specificiteit, en `pKortDatum` gaat nu ook goed met een deadline die een tijd bevat.

## 4. Wat open blijft en waarom

| # | Punt | Ernst | Waarom niet nu |
|---|---|---|---|
| A | T6 op de telefoon: de chip "Bezetting" en de knop "Voorstellen" liggen buiten beeld (2× scrollen) | 2 | De knop staat onder aan de vacaturekaart. Hem naar de kop verplaatsen verandert de kaart voor alle rollen; eerst bekijken met het talentteam (§6). |
| B | T5 op de telefoon: de status van een termijn staat onderaan de projectpagina | 2 | Een tab "Facturatie" op de projectpagina voor de telefoon is een groter ontwerpbesluit. |
| C | Projecten op de telefoon heeft 7 weergavechips en 4 AM-chips vóór de lijst | 2 | Bezetting en Talent bestaan op de telefoon alleen als chip; samenvoegen vraagt een besluit over de navigatie. |
| D | Scrollregio's heten bijna allemaal "Tabel" | 1 | Werkt wel, maar is weinig beschrijvend; per tabel de kop als naam geven. |
| E | De projectentabel op desktop is breder dan het scherm (horizontaal scrollen binnen de tabel) | 2 | Zo bewust ontworpen, zoals monday; kolommen verbergen vraagt instelbare kolommen. |
| F | Laden koud ±3 s op trage 4G | 2 | Bepaald door de API-tijd van de mock plus het netwerk; meten op de echte stack (`docs/go-live-review-v6.md`). |

## 5. Aannames ⚠️

- Op de telefoon is 44 px de norm voor navigatie, iconen, afvinken, velden en hoofdknoppen (Apple HIG). Filterchips en koppelingen in de tijdlijn krijgen 36 px, omdat eerder om een compactere weergave is gevraagd (v3.8). WCAG 2.5.8 (24 px) halen ze ruim.
- "Handelingen" en "buiten beeld" komen uit scripts die steeds de kortste route nemen. Echte gebruikers zoeken langer. Daarvoor is §6.
- Met de demo zijn inhoud en rechten gelijk aan productie. Laadtijden zijn daarom gemeten tegen de mock en niet tegen de demo, omdat de demo Code.gs in de browser draait.

## 6. Testscript voor een sessie met echte gebruikers

Per team één persoon, op de eigen telefoon, in de geïnstalleerde app (of `?demo=1&rol=…`). Geef geen hulp. Laat de deelnemer hardop denken. Noteer per taak of die lukt (zonder hulp), de tijd en de SEQ-score: "Hoe makkelijk was dit?", van 1 (heel moeilijk) tot 7 (heel makkelijk).

| Team | Taak 1 | Taak 2 | Taak 3 |
|---|---|---|---|
| Onderwijsconsultant | Maak een taak "Bel Marieke morgen om 14:00" met hoge prioriteit. | Zet de kans van Stedelijk Gymnasium Noorderhof op gewonnen (2 ondersteuners, start 2 november). | Vraag de assistent om een conceptmail aan de contactpersoon van Kompas College en bevestig die. |
| Accountmanager | Zet de septembertermijn van Esdoorn Lyceum op betaald. | Zoek in Financiën hoeveel er dit schooljaar nog te factureren is bij je eigen scholen. | Open de nieuwste melding en ga naar het project waar die over gaat. |
| Talentscout | Draag voor de vacature NT2-ondersteuner bij ISK Havenstad het best passende talent voor dat nog niet is voorgedragen. | Zoek een talent dat op dinsdagochtend beschikbaar is en een geldige VOG heeft. | Vink de taak "VOG nabellen" af en maak dat ongedaan. |
| Management | Bekijk in Financiën welke school de grootste openstaande post ouder dan 60 dagen heeft. | Vergelijk in Rapporten de gewonnen waarde van deze maand met vorige maand. | Wijs aan het project Surveillance toetsweken een talentscout toe. |

Geslaagd als: ≥ 80 % van de taken lukt zonder hulp en de gemiddelde SEQ is ≥ 5,5. Kost een taak meer dan twee keer zo lang als de scriptmeting, of blijft de SEQ onder 5, dan wordt die taak de volgende ronde.

## 7. Opnieuw meten

```
python3 test/ux_audit.py --axe <pad>/axe-core/axe.min.js --label <naam>   # axe-core: npm install axe-core@4.10.2 (buiten de repo)
python3 test/ux_taken.py --label <naam>
python3 test/mock_backend.py & python3 test/ux_prestatie.py 8765
```

Screenshots en JSON komen in `test/shots/ux/<naam>/`; die map staat niet in git.
