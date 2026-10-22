# v7.1 — rust en hiërarchie

Aanleiding (feedback 22-10-2026): Home en het schooldetail voelden druk. De titelkoppen waren even groot als de tekst eronder. Er stonden zes tegels op Home, met een rij van zeven knoppen in de historie.

## Meting

`python3 test/ux_rust.py --label voor|na`

Het script meet in de demomodus vier rollen: sophie (management), lars (consultant), femke (accountmanager) en sem (talent). Dat gebeurt op drie breedtes: 1440, 1024 en 390 px.

Per rol en breedte loopt het alle schermen langs, ook alle detailschermen en hun tabs. Per scherm telt het:
- de berekende lettergrootte en het lettergewicht van elk element met eigen tekst;
- teksten in hoofdletters;
- knoppen;
- gevulde knoppen.

Daarnaast maakt het een blur-screenshot (6 px) voor de knijptest.

| | vóór | na |
|---|---|---|
| gemeten schermen | 244 | 244 |
| verschillende lettergroottes in de hele app | 20 | 11 (6 op desktop, 6 op de telefoon, één overlap) |
| lettergroottes per scherm (gemiddeld / max) | 8,7 / 12 | 4,7 / 6 |
| schermen met meer dan 6 groottes | 205 | 0 |
| gewichten in de hele app | 5 (400–900) | 3 (400, 600, 800) |
| schermen met meer dan 3 gewichten | 235 | 0 |
| teksten in hoofdletters per scherm | 7,9 | 0,1 (alleen documentbadges) |
| schermen met meer dan één gevulde knop | 6 | 0 |
| knoppen per scherm (gemiddeld) | 21,6 | 19,8 |
| horizontale scroll | geen | geen |

Vangnetten na de wijziging:
- `ux_audit.py`: axe 0 overtredingen, 0 tikdoelen onder de norm, 0 afgekapte teksten.
- `ux_prestatie.py`: CLS 0,016.
- `ux_taken.py`: 9 van de 9 kerntaken gelukt op desktop en telefoon.

## Wat er veranderd is

1. **Typografische schaal.** Er zijn zes tokens:
   - `--fs-klein`: metadata, pillen, labels.
   - `--fs-zacht`: zijkolommen en secundaire tekst.
   - `--fs-tekst`: lopende tekst en rijtitels.
   - `--fs-kop`: kaart- en sectiekoppen.
   - `--fs-titel`: paginatitel en naam in de detailkop.
   - `--fs-groot`: kerncijfers en begroeting.

   De telefoonwaarden zijn 12,5 / 14 / 15 / 17 / 21 / 26 px, de desktopwaarden 12 / 13 / 14 / 16 / 20 / 24 px. Alle 199 losse `font-size`-waarden zijn naar een token omgezet. De uitzonderingen zijn velden op de telefoon (16 px, zodat iOS niet inzoomt) en de tabbalk.

   Er zijn nog drie lettergewichten: 400, 600 en 800.
2. **Koppen.** Koppen zijn groter dan de tekst eronder, staan in gewone zinsopbouw en zijn donker in plaats van paars en in hoofdletters. Knoppen, tabelkoppen en kolomkoppen staan niet meer in hoofdletters.
3. **Home: hoogstens vier tegels per functie.** Elke tegel opent de lijst erachter. "Te laat" opent Taken in de weergave Te laat.

   | functie | tegels |
   |---|---|
   | management | Te laat, Open kansen, Gewogen pijplijn, Lopende projecten |
   | consultancy | Open taken, Te laat, Open kansen, Gewogen pijplijn |
   | accountmanagement | Open taken, Te laat, Lopende projecten, Nog te factureren |
   | talent | Open taken, Te laat, Open vacatures, Te bezetten plekken |

   "Werkdagen op rij" en "Deze week afgerond" zijn bij iedereen weg.
4. **Andere schermen met tegels.** Ook daar staan er hoogstens vier:
   - Financiën toont "Nog te factureren" en de gemiddelde betaaltijd als rustige regel onder de tegels.
   - Bezetting telt de conceptvacatures mee in de tegel "Open vacatures".
5. **Detailschermen.** Dit geldt voor school, persoon, kans, project en talent.
   - Desktop: het midden is breder (240 | 1fr | 260 px). De zijkolommen staan een stap kleiner.
   - De rij met zeven knoppen is weg. Er is één primaire keuzelijst, "Activiteit loggen", met acht soorten:
     - notitie;
     - call;
     - mail;
     - WhatsApp;
     - afspraak online en afspraak fysiek;
     - evaluatiegesprek online en evaluatiegesprek fysiek.
   - "+ Afspraak", "+ Taak" en "+ Track" staan in het rechtervlak. "+ Kans" en "+ Persoon" staan in hun tab.
   - De detailkop is één rustige rij: Bewerken plus icoonknoppen voor mail, link en vastpinnen.
6. **Tijdlijn.**
   - Elke regel heeft een icoon per soort in plaats van de afkortingen BEL, MAIL en AFS.
   - De soort staat in de metaregel.
   - Het filter "Alle soorten" werkt op de nieuwe soorten.
7. **Datamodel.**
   - `Activiteiten` krijgt achteraan het veld `vorm`. Het `type` blijft bestaan, zodat de rapporten (gesprekken, mails, afspraken) gelijk blijven. De rooktest bewaakt dat de som per type en per vorm gelijk is aan het totaal.
   - Agenda-afspraken met een videolink worden "online"; "evaluatie" in de titel maakt er een evaluatiegesprek van.

## Aannames (⚠️)

- ⚠️ Oude regels met type `afspraak` krijgen de soort "afspraak fysiek". Oude regels met type `gesprek` krijgen "call". De historie wordt niet herschreven; dit gebeurt alleen bij het lezen.
- ⚠️ Een WhatsApp telt in de rapporten als gesprek. De WhatsApp-knop op een talentprofiel deed dat al.
- ⚠️ De tegels per functie zijn een voorstel. Ze zijn aan te passen in `KPI_PER_TEAM` in `index.html`.
- ⚠️ "Nog te factureren" op Home is de som van de termijnen met status "nog te doen" (of leeg) van de eigen lopende projecten. Dat is iets anders dan "nog te factureren volgens contract" in Financiën.

## Nog te doen door de eigenaar: de vijfsecondentest

Doe deze test met twee à drie collega's (minstens één accountmanager en één consultant), in hun eigen rol:

1. Laat Home vijf seconden zien.
2. Klap het scherm dicht.
3. Vraag: "Wat vraagt vandaag je aandacht?"
4. Herhaal dit met een schooldetail. Vraag: "Hoe leg je een gesprek vast?"

Het is goed als het antwoord de tegels noemt die bij die functie horen, en als de tweede vraag binnen vijf seconden "Activiteit loggen" oplevert.
