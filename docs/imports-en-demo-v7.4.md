# v7.4 — imports met echte exports en een demo op schaal

Aanleiding: de beheerder leverde vier echte exports aan: de facturatie-export (csv), het Exact-rapport Openstaande posten (xlsx), de dienstenexport uit XPS (xlsx, blad Diensten) en een projectenoverzicht (xlsx). Een analyse buiten de repo (alleen verdelingen, geen namen) liet drie dingen zien. (1) De XPS-urenimport koppelde de dienstenexport stil aan niets en telde afwezig, ziek, geannuleerd en toekomstige diensten als gewerkt. (2) `apiExactImport` las de facturatie-export alleen met kolomtoewijzing, kreeg geen betaaldatum en zette creditnota's onder "Alleen in Exact"; het rapport Openstaande posten (één regel per relatie) was niet te koppelen. (3) De demo is veel kleiner en anders gemengd dan de praktijk. De vraag was "doe allebei": de imports laten werken met deze exports én een demoprofiel met verzonnen gegevens op echte schaal.

De exports komen nooit in de repo, ook niet gedeeltelijk, geanonimiseerd of als voorbeeldrij (§6). Over de echte bestanden staan hier alleen uitkomsten die niets zeggen over de omvang van het bedrijf: herkend ja/nee, aandelen in procenten en verwerkingstijden.

Het werk liep in vier deelopdrachten (imports, demo, privacycontrole, verificatie) plus dit rapport. Alles tegen de demo (`?demo=1`), de mock (`test/mock_backend.py`) of `Code.gs` + `demo-backend.js` in een Node-vm; de proef met de echte bestanden alleen lokaal buiten de repo. Elke gedragswijziging heeft een controle die zonder de wijziging rood is (§8).

## 1. De vier exports

| export | vorm | wat er in v7.3 misging | v7.4 |
|---|---|---|---|
| facturatie-export (csv) | `;`, kolomnamen op regel 1, één regel per factuur: `Datum; Factuurnummer; Betreft; Referentie / betalingskenmerk; Debiteur; Debiteurnummer; Aan; Totaal; Leeftijd; Open; Debiteur Exact ID`. Geen betaaldatum; een creditnota is een eigen factuur met een negatief bedrag, zonder verwijzing naar het origineel | alleen te lezen met kolomtoewijzing; nooit betaald; creditnota's onder "Alleen in Exact" en het gecrediteerde origineel bleef openstaan | herkend zonder toewijzing; Open = 0 → betaald op de peildatum; deels betaald; creditnota ↔ origineel (§3) |
| Exact-rapport Openstaande posten (xlsx) | kopregels (administratie, peildatum), daarna één regel per relatie (`Code + Naam`, `Openstaand`) zonder factuurnummer | "Kolom niet gevonden"; met geforceerde toewijzing telde de totaalregel als factuur | herkend en geweigerd, met uitleg welke export wel werkt |
| dienstenexport XPS (xlsx) | één regel per dienst: `Datum; Datum: Van; Datum: Tot; Gewerkte tijd; Uitgevoerd door; Omschrijving; Status; Project; Projectleider; Salaris (eenheid); Salaris (totaal)`. Geen accountnummer, e-mail of projectnummer; ook geplande diensten, loon per dienst en ziekte per persoon | geen koppelkolom → 0 regels en 0 onbekend, zonder melding; afwezig, ziek, geannuleerd en toekomstige diensten telden als gewerkt (ook in Financiën "geleverd" en bij de plaatsing); een project koppelde alleen op de volledige naam inclusief periode | koppelen op naam als laatste stap, alleen gewerkte diensten, loon nooit gelezen, project op een vast deel van de naam (§2) |
| projectenoverzicht (xlsx) | per project school of klant, product, start, einde, projectleider | — (geen import; `apiImporteer` kan het met kolomtoewijzing, maar zonder `schoolId` en contractwaarde) | alleen gebruikt voor de verdelingen van het demoprofiel (§5) |

## 2. XPS-urenimport

Sectie 13 van `Code.gs` (`urenUitRijen`, `urenImport`). Uitleg voor de beheerder: `backend/README.md`, sectie Talentnetwerk → XPS-uren.

| onderwerp | v7.3 | v7.4 | bewaakt door (rooktest, tenzij anders) |
|---|---|---|---|
| formaten | weekexport | weekexport én export per dienst; per talent × ISO-week × project opgeteld | "XPS-dienstenexport: kolommen herkend (Uitgevoerd door = naam, Gewerkte tijd = uren, Project en niet Projectleider)" en "tellen op" op `test/voorbeelden/xps_diensten.csv` (zonder de wijziging 0 regels) |
| kolommen | de eerste naam die (deels) past; `Projectleider` kon project worden | `xpsKolomIndexen`: eerst exacte namen voor alle velden, dan een deel van de naam in een kolom die nog vrij is; nieuwe sleutel `projectNummer`, nieuwe namen `uitgevoerd door` en `gewerkte tijd` | idem |
| koppelen | `xpsId`, dan e-mail | `xpsId` → e-mail → genormaliseerde volledige naam (kleine letters, enkele spaties, zonder accenten), alleen als die bij precies één talent hoort en dat talent geen ander accountnummer heeft. Twee talenten met die naam → lijst `dubbel`; geen talent → `onbekend` met het aantal diensten (elke lijst hoogstens 50). Nooit een naam in `xpsId` | "koppeling: accountnummer, dan e-mail …", "naam bij twee talenten … dubbel", "onbekend talent …", "koppeling op naam schrijft nooit een naam in xpsId" |
| geen koppelkolom | stil 0 | fout "Dit bestand heeft geen kolom om uren aan talenten te koppelen (accountnummer, e-mail of naam). …" per bestand in `fouten`; `LAATSTE_URENIMPORT` schuift dan niet op; is geen enkel nieuw bestand te lezen, dan volgt de fout zelf | "een export zonder accountnummer, e-mail of naam geeft de Nederlandse fout", "urenImport: een bestand zonder koppelkolom staat in fouten …", "XPS-uren importeren met alleen zo'n bestand geeft de fout zelf" |
| statussen | alleen een ja-kolom no-show of laat; al het andere telde als gewerkt | gewerkt = de status lijkt niet op afwezig, ziek, geannuleerd of reserve. Instelling `xpsStatussen` = `{"noShow": […], "laat": […], "negeren": […]}` (deel van de tekst, gelezen met `uitMap`; een lijst vervangt de standaard). "ziek" wordt altijd overgeslagen en komt nooit per persoon in Athena | "statussen standaard …", "xpsStatussen {noShow:[…]} …", "Afwezig (ziek) komt nergens per persoon in het resultaat" |
| tijdvenster | geen | t/m vandaag (een weekregel: t/m deze week) en niet ouder dan `UREN_ARCHIEF_WEKEN` = 26 (`urenArchiefGrens`, ook gebruikt door `archiveerUren`). Een los weeknummer is de laatste week met dat nummer t/m deze week (`weekVanNummer`) | "tijdvenster …", "weekVanNummer …"; de oude urentest was rood onder de tz-klokken van eind maart en 1 januari en rekent nu met relatieve weken, met dezelfde beweringen |
| loon en privé | een kolom kon toevallig passen | kolommen met `salaris`, `loon` of `tarief` (en BSN, IBAN, geboorte) worden nooit gelezen, ook niet via `xpsKolommen`; ze staan in `genegeerdeKolommen` met de hint ze uit de export te laten | "salariskolommen worden genegeerd … waarden nergens in het resultaat", "xpsKolommen die uren op een salariskolom zet, wordt genegeerd", "geen loonwaarden in TalentUren" |
| project | `xpsProject` gelijk aan de projecttekst | `Projectnummer` exact op `Trajecten.xpsProject`; anders de projectnaam exact, of het langste `xpsProject` van minstens 5 tekens dat erin voorkomt (`projectKoppelaar`) | "projectkoppeling: projectnummer exact; anders …" |
| Financiën en plaatsing | alle uren, ook geplande | "geleverd" en `plaatsingenUitUren` rekenen alleen met gewerkte uren; `geleverdVan` slaat weken in de toekomst over (uit een import van vóór v7.4) | "Financiën: geleverd telt alleen de gewerkte uren (4 × € 42)", "een weekregel in de toekomst … telt niet als geleverd", "plaatsing uit de uren …" |
| opnieuw inlezen | elke weekregel opnieuw geschreven | alleen gewijzigde weekregels (`ongewijzigd` telt de rest); dezelfde week in twee bestanden telt één keer (het laatst gelezen bestand); `urenId` met een controlegetal voor lange sleutels | "ongewijzigde weekregels worden niet opnieuw geschreven" |
| uitkomst in de app | toast met bestanden, regels en weken | Beheer → "XPS-uren importeren" opent een venster (`urenImportHtml`): tellingen, overgeslagen per reden, niet ingelezen, onbekend en dubbel (door `esc`), genegeerde kolommen | tijdelijke Playwright-proef in de demo (axe 0 serious/critical); vaste UI-stap nog open (§9) |
| prestatie | — | 100.000 verzonnen diensten in 0,47 s in Node | "prestatie: 100.000 diensten in … s" |

Resultaatvorm en contract: `backend/README.md` (tabel Talentnetwerk) en de skill `athena-backend-api` (alinea v7.4).

## 3. Exact-afstemming

Sectie 14 van `Code.gs` (`apiExactImport`). Uitleg voor de boekhouder: `backend/README.md`, sectie Financiën → Exact-afstemming.

| onderwerp | v7.3 | v7.4 | bewaakt door (rooktest) |
|---|---|---|---|
| kolommen | ingestelde of standaardnaam (`Factuurnummer`, `Factuurdatum`, `Bedrag`, `Betaaldatum`); de app stuurde altijd alle venstervelden mee | een in het venster gewijzigde naam gaat voor en moet bestaan; anders ingesteld → standaard → `EXACT_ANDERE_NAMEN` (`Datum`, `Totaal`, `Open`, `Debiteur`, `Debiteurnummer`, `Betreft`); de app stuurt alleen gewijzigde velden (vergeleken met `defaultValue`) en `exactKolommen` wordt alleen dan bewaard. Nieuwe sleutels `open`, `debiteur`, `debiteurNummer`, `omschrijving` | "het factuurformaat … wordt zonder kolomtoewijzing herkend", "een opgegeven kolomtoewijzing wint"; de bestaande Exact-tests blijven groen |
| bedragen en datums | `1.950` werd 1,95 | een duizendtalpunt zonder decimalen wordt gelezen; `datumUitExport` = `exportDag` (ook d.m.jjjj en een Excel-datumgetal) | "bedragen met duizendtalpunt …" |
| betaald zonder betaaldatum | nooit betaald | ⚠️ heeft de export geen kolom met de betaaldatum, dan geldt Open = 0 bij een positief, niet gecrediteerd bedrag als betaald op de peildatum (`opties.peildatum`, veld in het venster; anders vandaag), met een melding; een termijn die al een betaaldatum heeft, houdt die | "zonder betaaldatum telt Open = 0 als betaald …", "toepassen: Open 0 → betaald …", "opnieuw toepassen: de betaaldatum schuift niet" |
| deels betaald | — | 0 < Open < bedrag → lijst `deelsBetaald`; de status blijft verzonden | "deels betaald …" |
| creditnota's | onder "Alleen in Exact"; het origineel bleef openstaan | ⚠️ koppelen aan de factuur van dezelfde debiteur (nummer of naam), met hetzelfde bedrag en een factuurdatum tot 60 dagen eerder; voorkeur: Open 0, dan een lager factuurnummer, dan de meest recente datum; elk origineel één keer; lijst `creditnotas`. Bij Toepassen gaat de termijn terug naar de eerste `factuurStatussen` zonder factuurnummer en datums, met een notitie op de tijdlijn van het project (beide nummers). Zonder origineel in het bestand: `alleenExact` met `creditnota: true` en een melding | "creditnota koppelt …", "gecorrigeerde factuur op de dag van de creditnota …", "gekoppelde creditnota's … niet onder Alleen in Exact", "toepassen: de gecrediteerde termijn gaat terug …" |
| rapport Openstaande posten | "Kolom niet gevonden" | herkend aan de kopregels of aan `Code + Naam` met `Openstaand`; melding met de export die wel nodig is | "het rapport Openstaande posten … geeft een duidelijke fout" |
| peildatum | — | `opties.peildatum` als jjjj-mm-dd; anders "Ongeldige peildatum; gebruik jjjj-mm-dd." | "ongeldige peildatum geweigerd" |
| venster | bijgewerkt, afwijkend, alleen in Exact, alleen in Athena | plus Betaald volgens Exact, Deels betaald, Creditnota's, de gelezen kolommen, de meldingen en een peildatumveld; een ouder antwoord zonder de nieuwe lijsten geeft geen fout | `test_app.py` met de nieuwe mockvorm; tijdelijke Playwright-proef |

## 4. Proef met de echte bestanden

Alleen lokaal in de scratchpad van de sessie, buiten de repo: `python3 -I` met paden als argument, de xlsx-bestanden omgezet naar csv in een werkmap, `urenUitRijen`/`urenImport` en `apiExactImport` in een vm-context (`demo-backend.js` + `Code.gs`). De werkkopieën met echte rijen zijn daarna verwijderd; alleen scripts zonder gegevens bleven staan. De proef draaide tegen de demotalenten en -projecten: "gekoppeld" zegt dus niets over de echte koppeling, die hangt af van §10 stap 2.

| export | herkend | uitkomst | tijd |
|---|---|---|---|
| dienstenexport | ja: datum, naam ← `Uitgevoerd door`, uren ← `Gewerkte tijd`, project ← `Project` (niet `Projectleider`), status. Zes kolommen genegeerd, waaronder beide salariskolommen met de loonhint | van de gelezen regels: ±90 % ouder dan 26 weken, ±3 % in de toekomst, < 1 % status (afwezig, ziek, geannuleerd, reserve), ±7 % geen talent, 0 % dubbele naam, geen uren of geen datum (een regel telt bij de eerste reden in de volgorde datum → status → talent → uren). 0 % gekoppeld, zoals verwacht: de demotalenten kennen de echte namen niet. De onbekende namen staan in een lijst met het aantal diensten: geen fout en geen stille nul. "ziek" komt nergens in de uitvoer. Zonder de naamkolom: de Nederlandse fout | 0,15 s als csv-tekst, 0,35 s met Date-objecten zoals uit een Sheet; 7,2 s via de map `XPS-export` in de demo (vooral de trage blob-stub van de demo) |
| facturatie-export | ja, zonder toewijzing: factuurnummer, datum, bedrag, open, debiteur, debiteurnummer, omschrijving; geen betaaldatum | elke creditnota vond haar origineel, 0 deels betaald. Met elke factuur als termijn in een wegwerpcontext: alle gekoppeld, 0 betaald volgens Open (elke factuur met Open 0 bleek gecrediteerd), elke gecrediteerde termijn terug naar de eerste status, 0 afwijkend, 0 alleen in Exact. De eerste versie koppelde één creditnota aan de gecorrigeerde factuur van dezelfde dag; daaruit volgt de voorkeursvolgorde (§7) | niet apart gemeten |
| rapport Openstaande posten | ja | geweigerd met de nieuwe melding | — |
| projectenoverzicht | n.v.t. | alleen verdelingen voor §5 | — |

## 5. Demoprofiel `&schaal=groot`

`?demo=1&schaal=groot` (ook met `&rol=…` en `&kaal=1`) is de gewone demo met daarbovenop een profiel met verzonnen gegevens op de schaal en in de mix van de praktijk.

| onderdeel | inhoud |
|---|---|
| scholen en relaties | VO, vmbo, po, ISK en praktijkonderwijs in bestaande plaatsen met hun ligging (voor de reisafstand in de matching), een deel particulieren, contactpersonen |
| projecten en kansen | dit schooljaar lopend en gepland, het vorige schooljaar afgerond, een paar die doorlopen; producten in een gewogen mix; kansen in alle fases (gewonnen per project, open, verloren met reden) |
| talent | actief, slapend, aangemeld, gescreend en uitgeschreven; VOG (groen, oranje, verlopen), beschikbaarheid per dagdeel, peiling en bewaartermijn zo gevuld dat de dagelijkse run een handvol mails geeft; plaatsingen scheef verdeeld; beoordelingen; vacatures en kandidaten met statushistorie |
| uren | `TalentUren` van de laatste 26 weken met XPS-statussen per dienst; in de map `XPS-export` een export per dienst van de laatste twee weken (in een vakantie de laatste twee weken met diensten) volgens het contract: met `Accountnummer` (= `Talenten.xpsId`), `E-mail` en `Projectnummer` (= `Trajecten.xpsProject`), zonder salariskolommen, plus één onbekend account. Beheer → "XPS-uren importeren" koppelt die dus |
| Financiën | contractwaarde = verwachte uren × verzonnen tarief; termijnen achteraf per maand naar de geleverde uren of vooraf; creditnota's die een eerdere termijn opheffen; doorlopende factuurnummers; betaaldatums uit een verzonnen betaaltermijn per school; bevroren prognoses |
| overig | activiteiten, taken, meldingen, aanmeldingen; bedrijfsdoelen die meeschalen (met de doelen van de kleine demo toont Home meer dan 400 %) |

Hoe het gemaakt is:

- `demo/demo-groot.js` (ES5): de generator `demoGrootVul` met een vaste seed (mulberry32, dezelfde PRNG als `test/fuzz.js`), zonder `Math.random`. Tijdens het opbouwen geeft `Utilities.getUuid` een vaste reeks, zodat ook de ids uit `demoVul` bij elke start gelijk zijn. Datums relatief aan vandaag, in kalenderdagen.
- Verdelingen (productmix, looptijd, uren per dienst, ritme, betaaltermijn) zijn afgeleid van de eigen exports, afgerond en met ruis. Er staan geen echte totalen of aantallen in de code of het commentaar. Namen komen uit woordlijsten (verzonnen samenstellingen), e-mailadressen eindigen op `.example`, bedragen zijn verzonnen uren × een verzonnen tarief in hele euro's.
- `demo/demo.js` laadt `demo-groot.js` alleen bij `schaal=groot` (alleen via de url) en roept `demoGrootStart` aan; die draait eerst `demoVul` en dan de generator. `demo-backend.js` is niet gewijzigd. Wisselen van rol en "Naar de app" uit het portaal houden `&schaal=groot` vast; de demobalk toont "· groot".
- Opslag: het hele profiel past niet veilig in het sessionStorage-quotum, vooral niet op iOS. Daarom bouwt elke start de basis opnieuw op en bewaart `demoGrootExport` alleen de rijen die afwijken (per tabblad op de sleutel in de eerste kolom) plus de verwijderde sleutels, onder `athena_demo_groot_v7.4` (zonder wijzigingen < 1 KB). Een kapotte stand of een stand van de gewone demo geeft een verse demo; een stand van een andere dag of opslagversie ook, met een melding in de demobalk (§11).
- Snelheid: opbouwen ±0,5 s in Node; Home is in de browser binnen ±0,6 s gevuld; 97 api's × 4 rollen zonder interne fout en elk onder 500 ms (de traagste is `apiTalentRunNu`, ±370 ms).

Waarom de standaardseed blijft: de rooktest, `rechten_test.js`, `fuzz.js`, de servertest (migratie van de demogegevens), de golf-tests en `demo_shots.py` tellen op de kleine seed; een volumelaag daarin breekt die telbeweringen (een prototype gaf in de rooktest FOUTEN: 5). `?demo=1`, ook de publieke link, blijft dezelfde demo. `demoStart` geeft met en zonder `demo-groot.js` dezelfde hash (`demo_groot_test.js` deel 9).

## 6. Privacycontrole

De repo en de demo op GitHub Pages zijn publiek. Een aparte deelopdracht zocht naar alles uit de exports, lokaal en buiten de repo: een script maakte uit de vier exports een verboden lijst (persoonsnamen en varianten, schoolnamen, namen van kinderen, factuur- en debiteurnummers, relatiecodes, export-id's, echte totalen en aantallen, losse factuurbedragen); een tweede script zocht en drukte alleen tellingen en gemaskeerde treffers af (3 tekens + lengte). De lijst en de dumps zijn daarna verwijderd.

| controle | uitkomst |
|---|---|
| nieuwe en gewijzigde regels in de v7.4-bestanden (`git status`, nieuwe regels apart van regels die al in `main` stonden) | 0 treffers in elke soort (na het nakijken van valse treffers: gewone woorden, korte getallen, een hashconstante) |
| demoprofiel groot, gedumpt op 12 datums over een jaar (alle tabbladen, de nagebootste Drive, eigenschappen, mail, agenda en de uitkomst van 9 lees-api's) | van de namen, scholen, nummers en bedragen die het profiel maakt: 0 persoonsnamen gelijk aan een echte (ook omgedraaid), 0 scholen, 0 factuur-, project- en accountnummers, 0 totalen, 0 bedragen gelijk aan een bedrag uit de factuur-csv |
| hersteld tijdens de controle | enkele verzonnen woordlijstwaarden en bedragen in `demo/demo-groot.js` die toevallig samenvielen met de exports; ze stonden nooit in git |
| exports in de werkboom | 0: geen sha256-overeenkomst in alle bestanden (ook genegeerde), geen xlsx, xls of ods, geen bestandsnaam die erop lijkt. De kolomkoppen staan alleen als kolomnaam in de importcode, de docs, de tests en de verzonnen voorbeelden |
| loon en ziekte | geen tabblad heeft een loonkolom. Urenimport op het voorbeeld, op de export van het profiel en op de echte dienstenexport (alleen in het geheugen): 0 cellen met "ziek" vóór en na, 0 loonwaarden in nieuwe of gewijzigde cellen; het resultaat noemt ziek en salaris niet |
| blijvende bewaking | `PRIVACY_LIJST=<pad buiten de repo> node test/demo_groot_test.js` (deel 10, alleen tellingen; tegen de versie vóór het herstel FOUTEN: 2); zonder de variabele slaat deel 10 over als info |

## 7. Keuzes (⚠️)

"Terug" zegt hoe het terug te draaien is.

| keuze | waarom | terug |
|---|---|---|
| ⚠️ Open = 0 telt alleen als betaald als de export geen betaaldatumkolom heeft, bij een positief, niet gecrediteerd bedrag; datum = peildatum; een bestaande betaaldatum blijft | een betaaldatum uit Exact is betrouwbaarder; in de echte export stond elke factuur met Open 0 gecrediteerd; "ontvangen" in Financiën mag niet elke import verspringen | `openAlsBetaald` op `false` in `apiExactImport`; de drie rooktestregels over Open 0 vervallen |
| ⚠️ creditnota: voorkeur Open 0, dan een lager factuurnummer, dan de meest recente datum; elk origineel één keer; alleen binnen het bestand | alleen "meest recent" koppelde in de echte export een creditnota aan de gecorrigeerde factuur van dezelfde dag | de sort-comparator terug naar datum en nummer; de rooktest "gecorrigeerde factuur op de dag van de creditnota" wordt rood |
| ⚠️ een gecrediteerde termijn gaat terug naar de eerste `factuurStatussen`, zonder nummer en datums, met een notitie op de tijdlijn; geen nieuwe kolom | zonder factuurnummer verwerkt een tweede import de credit niet nog eens; de tijdlijn bestaat al | `wijz.push` en `credits.push` in de tak `if (c)` weghalen |
| ⚠️ Exact-kolommen: een opgegeven naam wint en moet bestaan; de app stuurt alleen gewijzigde namen | het venster vult altijd de standaardnamen in; die zouden anders winnen en de facturatie-export nooit herkennen | `exactKolommenUitVenster` weer alle velden laten sturen en `EXACT_ANDERE_NAMEN` terug tot de standaardnamen |
| ⚠️ andere resultaatvorm van `urenImport`: `overgeslagen` is een object per reden, niet leesbare bestanden staan in `nietGelezen`; `regels` en `onbekend` blijven | per reden tellen was de vraag; de app gebruikte de oude lijst nergens; het venster kan ook een ouder antwoord aan | de lijst weer `overgeslagen` noemen; het venster toont dan geen redenen |
| ⚠️ het tijdvenster geldt ook voor de weekexport; een los weeknummer is de laatste week met dat nummer t/m deze week | een week in de toekomst is net zo fout als een dienst in de toekomst | in `urenUitRijen` alleen filteren als `dag` gevuld is; `weekVanNummer` terug naar het huidige jaar |
| ⚠️ `xpsStatussen` vervangt per soort de standaardlijst; "ziek" is vast overgeslagen, ook als `noShow` "afwezig" bevat | AVG: een gezondheidsgegeven komt nooit per persoon in `TalentUren`, ook niet via een instelling | de regel `if (/ziek/.test(s)) return 'ziek';` in `xpsStatusSoort` (niet aan te raden) |
| ⚠️ koppelen op naam alleen bij precies één talent zonder ander accountnummer; `xpsId` wordt nooit een naam | een ander accountnummer wijst op een naamgenoot | de voorwaarde `!(xps && kand[0].xpsId && …)` in `urenUitRijen` |
| alleen gewijzigde weekregels schrijven; `urenId` met controlegetal | een wekelijkse volledige export gaf anders duizenden losse writes; dubbele id's in één `schrijfVeel` gaven een fout | weer `schrijfVeel('TalentUren', alle)` en `slug` |
| `UREN_ARCHIEF_WEKEN` = 26 als één bron voor archiveren en importeren | er stond alleen `26 * 7` in `archiveerUren` | `archiveerUren` weer met `isoWeekStr(plusDagen(-26 * 7))` |
| prestatietest met 100.000 verzonnen diensten | strenger dan nodig en geen getal in de repo dat iets zegt over de echte export | het aantal in `node_rooktest.js` |
| demo: geen haak in `demo-backend.js`; alleen via de url | de standaardseed blijft byte-gelijk; `?demo=1` blijft de gewone demo | in `demo.js` de groot-takken weghalen (variabele `groot`, `demoGrootStart`/`demoGrootExport`, `schaalParam`) en `demo-groot.js` verwijderen |
| ⚠️ demo: sessionStorage bewaart alleen de wijzigingen | het hele profiel zit tegen of boven het quotum, vooral op iOS | in `demo.js` weer `demoExport`/`demoStart` (niet aan te raden op iOS) |
| demo: hele euro's en grof afgeronde verdelingen; de exportweken wijken uit naar weken met diensten; de doelen schalen mee | eerder vielen enkele ronde bedragen samen met echte; in een vakantie moet de import iets koppelen; Home toonde anders meer dan 400 % | afronding in `maakProject` en de termijnen; `exportWk` = `[1, 2]`; het `schrijfVeel('Doelen', …)`-blok weghalen |
| ⚠️ de publieke demo laat met `&schaal=groot` ongeveer de omvang van het bedrijf zien (afgerond, met ruis) | zo is "echte schaal" gevraagd; of de afronding volstaat, beslist de beheerder (§10 stap 5) | de aanroepen van `aantal(…)` in `demoGrootVul` verlagen; de bandbreedtes in `demo_groot_test.js` deel 2 schuiven mee |

## 8. Tests

### Nieuw en gewijzigd

| test | commando | wat er nieuw is | rood zonder de wijziging |
|---|---|---|---|
| `test/node_rooktest.js` | `node test/node_rooktest.js` | blok "v7.4: imports" (XPS-dienstenexport: koppeling, statussen, tijdvenster, loonkolommen, projectnaam, Financiën, prestatie; Exact: facturatie-export, Open, deels, creditnota's, rapport, peildatum); `controleer()` meldt 7.4; de oude urentest met relatieve weken; 277 → 316 controles | elke v7.4-wijziging los teruggedraaid op een kopie via `CODE_GS` (script in de scratchpad): 24 van 24 rood |
| `test/demo_groot_test.js` (nieuw) | `node test/demo_groot_test.js` (`CODE_GS=…`, `DEMO_GROOT=…`, `PRIVACY_LIJST=…`) | 74 controles in tien delen (drie erbij uit de iOS-review, §11): opbouw en determinisme (hash, geen `Math.random`), bandbreedtes per tabblad, namen en teksten, dienstenexport en urenimport, dagelijkse talentrun, Financiën-invarianten per project, elke api × vier rollen < 500 ms, opslag heen en terug (ook een dag later, een ander uur, over middernacht en een andere opslagversie), standaardseed ongewijzigd, privacy (optioneel) | zonder `demo-groot.js` FOUTEN: 1; deel 10 tegen de versie vóór het privacyherstel FOUTEN: 2; met de `Code.gs` van v7.3 groen met een LET OP-regel (afwezig, ziek en geannuleerd tellen dan als gewerkt) |
| `test/demo_groot.py` (nieuw) | `python3 test/demo_groot.py [--fonts <map>]` (eigen server op 8796) | 59 controles (achttien erbij uit de iOS-review, §11): Sophie op 1440 px langs alle 15 zijbalkschermen zonder pageerror of console-error, op 390 px Home, Taken en Projecten zonder horizontale scroll, Femke en Sem op Home, Home gevuld binnen 4 s, een wijziging blijft na herladen, sessionStorage klein, de gewone demo laadt `demo-groot.js` niet; op 390 px begrensde lijsten (talenten, projecten, kandidatenbord) en zoeken zonder hertekenen per toets, op 1024 px het lege peildatumveld, de meldingen in de demobalk en bewaren bij `visibilitychange`; schermafbeeldingen in `test/shots/demo_groot/` (gitignored) | met de `demo.js` van v7.3 FOUTEN: 6 |
| `test/mock_backend.py` | — | antwoordvormen van `apiTalentUrenImport` en `apiExactImport` (plus `iso_week`) | `test_app.py` groen met de nieuwe vorm |
| `test/voorbeelden/xps_diensten.csv`, `facturen_export.csv` (nieuw, volledig verzonnen) | gelezen door de rooktest | dienstenexport met salariskolommen, een zieke en een toekomstige dienst; facturatie-export met een creditnota-paar, deels betaald en alleen in Exact (demoscholen, demonummers) | — |

### Cijfers vóór en na

| onderdeel | cijfer | v7.3 | v7.4 |
|---|---|---|---|
| rooktest | controles | 277 | 316 |
| demoprofiel | `demo_groot_test.js` / `demo_groot.py` | — | 74 / 59 |
| mutatie | `mutatie_test.js` gedood; v7.4-wijzigingen teruggedraaid → rood | 10 van 10; — | 10 van 10; 24 van 24 |
| kruistabel | api's / zonder test / alleen indirect | 99 / 0 / 0 | 99 / 0 / 0 (geen nieuwe api) |
| handelingen | data-attributen / handelingen / zonder test | 176 / 157 / 0 | 177 / 158 / 0 |
| fuzz | aanroepen / interne fouten / rechtenlekken | 14.584 / 0 / 0 | 14.584 / 0 / 0 |
| rechten | rijen / aanvallen / schendingen | 1.010 / 95 / 0 | 1.010 / 95 / 0 |
| tijdzone | combinaties rood (`--snel`) | 0 van 40 | 0 van 40 |
| server | servertest / dekking adapter / golden master onverklaard | 54 ok / 0 gaten / 0 | 54 ok / 0 gaten / 0 (geen nieuwe Apps Script-aanroep) |
| toetsenbord | schermen / tabs / FOUT | 34 / 1.333 / 0 | 34 / 1.346 / 0 |
| ux_audit | serious/critical / tikdoelen < 24 px | 0 / 0 | 0 / 0 |
| ux_rust | max groottes / gewichten / schermen met > 1 gevulde knop | 6 / 3 / 0 | 6 / 3 / 0 |

### Suites en looptijden

De verificatie draaide 29 runs (28 suites, `test_app.py` twee keer) achter elkaar zonder iets te wijzigen, alle groen op exitcode 0 plus de eigen norm; samen ±19 minuten.

| suite | commando | resultaat | s |
|---|---|---|---|
| syntax backend | `cp backend/Code.gs <scratch>/c.js && node --check <scratch>/c.js` | ok | 0,1 |
| hook | `echo '{"tool_input":{"file_path":"index.html"}}' \| bash .claude/hooks/check-index.sh` | ok (stil, `sw.js` mee gewijzigd) | 0,1 |
| rooktest | `node test/node_rooktest.js` | 316 ok | 3,7 |
| parser | `node test/parser_test.js` | 32 ok | 0,1 |
| demoprofiel | `node test/demo_groot_test.js` | 74 ok (privacydeel overgeslagen zonder `PRIVACY_LIJST`) | 25 |
| kruistabel | `node test/kruistabel.js` | 0 zonder test, contract zonder verschillen | 0,2 |
| handelingen | `node test/handelingen.js` | 0 zonder test, 0 dode handlers | 0,3 |
| fuzz | `node test/fuzz.js` | 0 intern, 0 lekken, 0 verdacht | 25 |
| rechten | `node test/rechten_test.js` | 0 schendingen | 4,9 |
| mutatie | `node test/mutatie_test.js` | 10 van 10 gedood | 35,9 |
| tijdzone | `node test/tz_test.js --snel` | 40 van 40 | 81,1 |
| server | `node server/test/server_test.js` | 54 ok | 6,5 |
| security | `node server/test/security_test.js` | 21 ok | 4,2 |
| dekking adapter | `node server/dekking.js` | 0 gaten | 0,3 |
| golden master | `node server/vergelijk.js` | 152 gelijk, 48 verklaard, 0 onverklaard | 14,1 |
| storing | `python3 test/storing.py` | 86 ok | 86,2 |
| toetsenbord | `python3 test/toetsenbord.py` | 34 schermen, 1.346 tabs, 0 FOUT | 68,8 |
| golf1–golf4 | `python3 test/handig/golf1.py` … `golf4.py` | 17 / 20 / 11 / 70 ok | 27 / 19 / 12 / 57 |
| test_app ×2 | `python3 test/test_app.py` | 2× ALLES GOED, 277 api-aanroepen | 64 per run |
| inloggen | `python3 test/test_inlog.py` | meldingen: geen | 4,5 |
| demo rooktest | `python3 test/demo_shots.py rooktest` | meldingen: geen | 20,8 |
| demo groot | `python3 test/demo_groot.py` | 59 ok, Home ±0,57 s | 33 |
| ux_audit | `python3 test/ux_audit.py --axe <axe.min.js> --label v74` | 79 schermen, 0 serious/critical, 0 tikdoelen < 24 px | 114 |
| ux_taken | `python3 test/ux_taken.py --label v74` | 22 taakmetingen, 0 mislukt | 62 |
| ux_rust | `python3 test/ux_rust.py --label na --snel` | 165 schermen, max 6 / 3 / 1 | 251 |

Informatief, niet rood: `tz_test` noemt twee datumtekstvergelijkingen in de nieuwe importcode (`urenUitRijen`: `dag > vandaag` en de weekgrenzen); nagekeken: `yyyy-MM-dd` en `yyyy-Www` (ISO-jaar, week met voorloopnul) hebben een vaste breedte, dus de tekstvolgorde is de datumvolgorde. `handelingen.js` geeft twee let-meldingen over `toetsenbord.py` die er in v7.3 ook al waren.

## 9. Bewust niet gedaan en nog open

| wat | waarom of stand |
|---|---|
| termijnen aanmaken uit de export | `apiExactImport` werkt alleen bestaande termijnen bij: de export heeft geen project-id en particuliere facturen hebben in Athena geen school of project. Wat alleen in de export staat, blijft onder "Alleen in Exact" |
| het projectenoverzicht importeren | `apiImporteer` kan het met kolomtoewijzing, maar zonder `schoolId` en contractwaarde staat Financiën dan op € 0 |
| ziekte per project tonen | bewust niet: ook opgeteld is het herleidbaar bij een project met één ondersteuner; de import telt het alleen in het totaal "overgeslagen: status" |
| "Afwezig" standaard als no-show | niet zonder bevestiging; instelbaar met `xpsStatussen`, bijvoorbeeld `{"noShow": ["afwezig"]}` ("ziek" blijft altijd buiten) |
| ⚠️ hetzelfde factuurnummer in Athena, de export en Exact | aangenomen, niet aangetoond: de facturatie-export komt mogelijk uit het facturatiepakket en niet uit Exact (de kolom `Debiteur Exact ID` is leeg). Te bevestigen door de boekhouder (§10 stap 3) |
| ⚠️ csv in Windows-1252 | wordt als UTF-8 gelezen; accenten raken verminkt. Koppelen op factuur- of accountnummer heeft er geen last van, koppelen op naam wel (verwacht, niet getest): vraag UTF-8 of lever de XPS-export als xlsx aan |
| vaste UI-stap voor de twee nieuwe vensters | getoetst met een tijdelijk Playwright-script (axe 0 serious/critical, `esc` gecontroleerd); `test_app.py` gebruikt de nieuwe mockvorm, maar controleert de inhoud van de vensters niet. Open |
| iOS-review | gedraaid voor de nieuwe vensters en het grote profiel op de telefoon; de vier bevindingen zijn verwerkt (§11) |

## 10. Wat de beheerder nu doet

1. **XPS.** Vraag een export per dienst aan **met** `Accountnummer` (of `E-mail`) en `Projectnummer` en **zonder** de salariskolommen. Zet een export met ziekte- of loongegevens niet in de Drive-map `XPS-export`: de import leest ze niet, maar het bestand blijft daar staan. Vraag daarom om "Afwezig (ziek)" als "Afwezig" of alleen de gewerkte diensten. Een export over de laatste weken is genoeg (diensten ouder dan 26 weken of in de toekomst worden overgeslagen) en houdt het bestand klein. Lees daarna één keer de laatste 26 weken opnieuw in (Relaties → Rapport → Beheer → "XPS-uren importeren"): dezelfde id's, dus uren van vóór v7.4 met afwezige, geannuleerde of geplande diensten worden overschreven. Kijk in het venster naar Genegeerde kolommen, Onbekend en Dubbel. Oude exports mogen na de import uit de map.
2. **Koppelvelden.** Vul `xpsId` van de talenten met het XPS-accountnummer (eerst bij wie onder Onbekend of Dubbel staat), en `xpsProject` van de projecten met het projectnummer of een vast deel van de projectnaam zonder de periode (minstens 5 tekens, bijvoorbeeld `Esdoorn Lyceum | Onderwijsondersteuning`).
3. **Boekhouder.** Vraag een export per factuur uit Exact: factuurnummer, factuurdatum, bedrag en betaaldatum, als csv met de kolomnamen op regel 1, over een hele periode (ook de betaalde facturen). Of gebruik de facturatie-export met de kolom Open en weet dat de betaaldatum dan de peildatum is: vul in het venster de datum van de export in. Het rapport Openstaande posten werkt niet. Laat bevestigen dat het factuurnummer op de termijn in Athena hetzelfde is als in Exact (§9).
4. **Backend.** Plak `backend/Code.gs` (v7.4) en implementeer hem als nieuwe Apps Script-versie (`/release`; de `/exec`-URL blijft gelijk). `controleer()` moet als eerste regel "backend 7.4" melden. Geen nieuwe triggers, kolommen of scripteigenschappen; `setup()` is niet nodig. `xpsStatussen` hoeft alleen in `Instellingen` als de standaard niet past.
5. **Publieke demo.** ⚠️ Beslis of `&schaal=groot` op GitHub Pages mag blijven zoals het is (de omvang is afgerond en met ruis, maar wel herkenbaar), of dat de aantallen omlaag moeten (§7, laatste regel).
6. **Gebruikers.** Een open PWA ziet de nieuwe versie na Herladen in de balk "Nieuwe versie beschikbaar" of na één keer volledig sluiten en heropenen.

## 11. iOS-review

De subagent `ios-pwa-reviewer` keek naar de nieuwe vensters en naar het grote profiel op de telefoon. Vier bevindingen, alle vier verwerkt in `demo/demo-groot.js`, `demo/demo.js` en `index.html` (versiecommentaar `v7.4 (iOS-review)`). Elke controle hieronder is rood zonder de wijziging, gemeten op een kopie met de wijziging teruggedraaid: `demo_groot_test.js` FOUTEN: 3, `demo_groot.py` FOUTEN: 11.

| ernst | bevinding | oplossing | bewaakt door |
|---|---|---|---|
| midden | een bewaarde stand van het profiel groot werd een dag later over een andere basis gelegd: de basis volgt vandaag en de reeks loopt per dag anders, dus een id hoorde dan bij een andere rij. Een bewaarde wijziging overschreef een onbekende rij, en een `weg`-sleutel verwijderde een rij die er niets mee te maken had. Op iOS overleeft sessionStorage een nacht | `_grootToepassen` weigert een stand met een andere `versie` (`GROOT_OPSLAG_VERSIE`) of `dag`. `dag` is de dag van de basis (`DEMO_GROOT.dag`, gezet in `_grootBouw`) en niet het moment van bewaren, want een tab kan over middernacht open blijven. `demoGrootStart` geeft dan `'vernieuwd'` en een verse demo; `demo.js` wist de oude stand en de demobalk meldt 10 s lang "De demo is voor vandaag opnieuw opgebouwd." | `demo_groot_test.js` deel 8: een dag later `vernieuwd` en gelijk aan een verse opbouw (de oude P5 verwachtte `hersteld`); dezelfde dag een ander uur `hersteld`, en elke rij hoort bij dezelfde school of hetzelfde project (alleen `bijgewerkt` en `tijd` van het opbouwen verschillen); over middernacht bewaard; een andere opslagversie. `demo_groot.py`: de melding na een stand van een andere dag |
| midden | op de telefoon tekende de talentweergave alle talenten van het profiel opnieuw bij elke toetsaanslag in het zoekveld. De projectlijst, de projectgroepen en het kandidatenbord bij "Alle vacatures" hadden ook geen grens | `begrensdeRijen`: op de telefoon 200 rijen, op desktop 500 (zoals `deskTabel`), met de hint "De eerste 200 staan hier. Zoek of filter om de rest te zien.". Gebruikt voor de talenten (telefoon), de projectlijst en de projectgroepen (telefoon). Het kandidatenbord toont per kolom 30 kaarten (desktop 60) en "En nog n"; de teller blijft het totaal. `#trajectZoek` tekent 150 ms na de laatste toets. De zoektekst gaat wel meteen in `S.filters`, zodat een filter dat je daarna kiest er direct mee tekent | `demo_groot.py` op 390 px: hoogstens 200 talentrijen met de hint; vier toetsen tekenen de lijst één keer (zonder de wijziging vier keer); de projectlijst begrensd (in het geheugen van de app verdubbeld, want het profiel heeft er minder dan 200); het kandidatenbord met hoogstens 30 per kolom en een hint in elke volle kolom |
| laag | een mislukte `setItem` (opslag vol: het quotum geldt per origin en wordt op github.io gedeeld met de gewone demo en andere repo's) liet de vorige stand staan. Herladen zette dan zonder melding een oudere stand terug. Verder werd alleen bij `pagehide` of na 300 ms bewaard, terwijl iOS bij het wisselen van app vaak alleen `visibilitychange` stuurt | `sessie()` haalt na een mislukte schrijfactie de sleutel weg; de demobalk meldt één keer "Wijzigingen worden niet bewaard (opslag vol)." en de melding verdwijnt zodra bewaren weer lukt. `visibilitychange` naar `hidden` bewaart meteen | `demo_groot.py`: een `setItem` die gooit → sleutel weg en melding; `visibilitychange` bewaart vóór de timer; melding weg na een gelukte bewaarbeurt |
| laag | het lege peildatumveld van Exact staat in een gewone `.veld`. De iOS-regel voor lege datumvelden gold alleen voor `.le-rij` en `.ftabel`, dus op een iPad in landschap stond het veld lager dan de velden ernaast | `.veld input[type=date]`: `appearance: none` en een `min-height` gelijk aan een tekstveld, 42 px op de telefoon en 33 px onder `body.desk` (gemeten met Nunito). Dit geldt voor elk datumveld in een venster | `demo_groot.py` op 1024 px: leeg veld, `appearance: none`, `min-height` gelijk aan het tekstveld ernaast |

| keuze | waarom | terug |
|---|---|---|
| ⚠️ een stand van een andere dag geeft een verse demo, met een melding | de generator verankeren op de bewaarde dag kan niet: `Code.gs` rekent overal met de echte klok, en de datums zouden dan een dag achterlopen. Een demo verliest zo hoogstens de wijzigingen van gisteren | in `_grootToepassen` de regel met `GROOT_OPSLAG_VERSIE` weghalen (niet aan te raden: dan raakt een wijziging een andere rij) |
| kandidatenbord: 30 per kolom op de telefoon, 60 op desktop | met twaalf statussen blijft het bord zo onder ±360 kaarten op de telefoon; slepen naar een kolom werkt ook als die vol is | `var max` in `kandidatenBord` |
| `begrensdeRijen` ook op de projectlijst en de projectgroepen | hetzelfde patroon als scholen en personen | weer `lijst.map(…).join('')` |

