# Salespaneel-mod: ontwerp

Datum: 2026-10-07. Status: ter review door Menno.

## Doel

Een paneel in Claude Code (`/sales`) dat in één oogopslag laat zien waar de verkoop aan scholen staat: welke kansen open zijn, welke taken te laat zijn, wie al een week niets gehoord heeft. Geen tweede CRM; een leesvenster op Capsule, met drie handelingen die je er direct vanuit start.

## Architectuur: twee delen, één bestand ertussen

| Deel | Woont in | Weet van | Weet niets van |
| --- | --- | --- | --- |
| Snapshot-script `scripts/salespaneel_data.py` | repo | Capsule-export (JSONL) en het snapshotformaat | panelen, Claude Code |
| Mod `mods/athena-sales/` | repo (bron), geladen via `--plugin-dir` of symlink in `~/.claude/dev-mods/` | het snapshotformaat en de plugin-API | Capsule |

Het snapshot `data/salespaneel.json` is het enige contract. Verhuist de data naar een eigen database, dan wordt alleen het script herschreven.

### Snapshot-script

- Leest `data/capsule/opportunities.jsonl` en `tasks.jsonl` (verplicht) en `parties.jsonl` (optioneel, voor het `about`-veld).
- Schrijft `data/salespaneel.json` atomair (eerst `.tmp`, dan `os.replace`), zodat het paneel nooit een half bestand leest.
- Draait achter de bestaande ochtendpull (`run_data_pull.sh`, 07:45), als laatste stap:
  `python3 ~/athena-assistent/scripts/salespaneel_data.py --capsule-dir ~/athena-assistent/data/capsule --out ~/athena-assistent/data/salespaneel.json`
- Faalt hard en luid (exit 1, melding op stderr) bij ontbrekende of kapotte invoer. In een cron merk je een stille fout anders nooit.

### Snapshotformaat

Voorbeeldgetallen staan op nul; dit is het schema, geen stand.

```json
{
  "gegenereerd": "2026-10-07T07:45:00+02:00",
  "leeg": false,
  "fases": [{ "naam": "Lead", "aantal": 0, "waarde": 0, "zonder_waarde": 0 }],
  "gesloten": { "won": 0, "lost": 0 },
  "scholen": [{
    "id": 0, "naam": "…", "eigenaar": "…",
    "laatste_contact": "2026-10-01", "dagen_stil": 0,
    "contact": ["regel uit about", "…"],
    "kansen": [{ "id": 0, "titel": "…", "fase": "Lead", "waarde": null,
                 "dagen_stil": 0, "verwachte_sluiting": "2026-10-10" }],
    "taken": [{ "id": 0, "titel": "…", "vervaldatum": "2026-10-04", "dagen_te_laat": 0 }]
  }]
}
```

Regels:

- Gesloten kansen (milestone Won/Lost of `closedOn`) blijven uit `scholen` en `fases`; ze tellen alleen in `gesloten`.
- `waarde` is `null` als Capsule geen bedrag kent. Dat telt als onbekend, nooit als €0; `zonder_waarde` per fase zegt hoeveel dat er zijn.
- `dagen_stil` komt van `lastContactAt`, anders `updatedAt`.
- Een kans of taak zonder party komt onder `(zonder school)` terecht, onderaan. Niet fataal.
- Een taak zonder party maar met een kans wordt via die kans aan de school gehangen.
- Afgeronde taken (`status` COMPLETED of `completedAt`) blijven weg.
- `leeg` is waar als de export geen enkele kans en geen enkele taak bevat (zoals `parties.jsonl` op 0 bytes vanmorgen). Het paneel meldt dat dan, in plaats van nul kansen te suggereren.

### Mod

Bestanden: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts` (contract), `hooks/register.test.tsx`.

- `$.command.register` geeft `/sales`. De command-hook leest het snapshot en opent het paneel.
- Het snapshot wordt gelezen via `$.fs` bij het openen en bij `r`, en bewaard in een state-atom. Niet opnieuw lezen per toetsaanslag.
- Het paneel onthoudt vier dingen in `$.state`: de weergave, de geselecteerde regel, de gekozen fase, en de laatst gelezen stand (snapshot plus eventuele fout).
- Pad: `<werkmap>/data/salespaneel.json`. Start Claude Code dus in de repo.

### Weergaven en bediening

Toetsen werken zolang het paneel de focus heeft (ctrl+x tab, of `/sales` met focus).

| Toets | Doet |
| --- | --- |
| `1` | Vandaag |
| `2` | Scholen (lijst, met detail van de geselecteerde school) |
| `3` | Fases (totalen per fase) |
| `f` | Volgende fase als filter op de scholenlijst; na de laatste weer "alle" |
| `j` / `k` | Regel omlaag / omhoog |
| `r` | Snapshot opnieuw lezen |
| `v` | Vult de prompt met "Maak een samenwerkingsvoorstel voor <school>." (skill voorstel-huisstijl) |
| `m` | Vult de prompt met "Schrijf een opvolgmail voor <school> in de huisstijl." |
| `n` | Vult de prompt met "Maak een gespreksnotitie voor <school>." |

`v`/`m`/`n` vullen alleen de prompt; verzenden doe je zelf, zodat je de tekst nog kunt aanpassen.

**Vandaag** is precies gedefinieerd, met een venster van zeven dagen:

1. Taken te laat of vandaag: open taken met `dagen_te_laat > 0` of vervaldatum vandaag.
2. Aangeraakt zonder vervolgactie: scholen met een open kans, contact in de afgelopen zeven dagen (`dagen_stil <= 7`) en geen enkele open taak.
3. Sluiting binnen zeven dagen: kansen met `verwachte_sluiting` binnen zeven dagen, verstreken sluitingen inbegrepen.

Bovenaan altijd het ouderdomsmerk: "snapshot van vandaag 07:45" (dim). Ouder dan 24 uur wordt het rood: "snapshot van gisteren 07:45 — druk r".

## Foutgedrag

| Situatie | Paneel |
| --- | --- |
| Geen snapshot | "nog geen snapshot, druk r" |
| Leeg snapshot | Gele melding dat de export leeg is |
| Kans zonder waarde | "onbekend"; fase-totaal noemt het aantal zonder waarde; een fase waarvan geen enkele kans een waarde heeft toont "onbekend" in plaats van €0 |
| Kapot snapshot (geen JSON, verkeerde vorm) | Vorige stand blijft staan, rode waarschuwing erbij |
| Script faalt | Exit 1 met reden op stderr; het oude snapshot blijft ongewijzigd staan |

## Privacy

`data/salespaneel.json` bevat namen, mailadressen en telefoonnummers van schoolcontacten (het `about`-veld). `data/` staat in `.gitignore` en blijft lokaal. Geen leerlinggegevens: die zitten niet in Capsule en komen hier niet in.

## Testen

- Script: `python3 -m unittest scripts/test_salespaneel_data.py`. Dekt dagen stil, kansen zonder waarde, Won/Lost eruit, regel zonder party, afgeronde taken, leeg snapshot, en het harde falen bij ontbrekend of kapot bestand.
- Mod: `claude plugin validate mods/athena-sales`, `claude plugin test mods/athena-sales` (weergave-wisselaar, ouderdomsmerk, ontbrekend/leeg/kapot snapshot), `tsc -p mods/athena-sales` zodra de engine de types naast de mod heeft gelegd.

## Laden van de mod

- Vast: `claude --plugin-dir ~/athena-assistent/mods/athena-sales`. De repo is dan de enige bron.
- Hot-reload in een sessie: symlink `~/.claude/dev-mods/<sessie>/athena-sales -> ~/athena-assistent/mods/athena-sales`. Of de watcher een symlink volgt is nog niet vastgesteld; lukt het niet, dan `--plugin-dir`.

## Open punten voor Menno

1. Zijn `v`/`m`/`n` de drie handelingen die je echt vanuit het paneel start, of doe je iets anders vaker?
2. Matchen de drie groepen van Vandaag met wat je 's ochtends wilt zien, of doet de ochtendbriefing dat al?
3. `data/capsule/parties.jsonl` stond na de pull van gisteren op 0 bytes. Buiten dit ontwerp, maar wel uitzoeken.
