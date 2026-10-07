# Salespaneel-mod: implementatieplan

Hoort bij `../specs/2026-10-07-salespaneel-mod-design.md`. Stappen met een vinkje zijn gedaan in deze branch.

## Stappen

- [x] 1. `data/` in `.gitignore` (snapshot en Capsule-export blijven lokaal).
- [x] 2. `scripts/salespaneel_data.py`: JSONL lezen, snapshot bouwen, atomair schrijven, hard falen. Pure functie `bouw_snapshot(kansen, taken, parties, nu)` voor de tests.
- [x] 3. `scripts/test_salespaneel_data.py`: unittest op nagemaakte regels. Klaar als `python3 -m unittest scripts/test_salespaneel_data.py` groen is.
- [x] 4. Mod `mods/athena-sales/`: manifest, `hooks.json`, contract `types/index.d.ts` (vier state-sleutels), `hooks/register.tsx`.
- [x] 5. `hooks/register.test.tsx`: weergave-wisselaar, ouderdomsmerk, ontbrekend/leeg/kapot snapshot. Klaar als `claude plugin test mods/athena-sales` groen is.
- [x] 6. `claude plugin validate` zonder fouten; `tsc` zonder fouten tegen de API-types van build 2.1.292.
- [ ] 7. Lokaal (Menno's machine): regel toevoegen aan `run_data_pull.sh`, zie spec. Eén keer handmatig draaien en `data/salespaneel.json` nakijken.
- [ ] 8. Lokaal: mod laden met `claude --plugin-dir ~/athena-assistent/mods/athena-sales`, `/sales` openen, de drie weergaven doorlopen op echte data.
- [ ] 9. Lokaal: symlink in `~/.claude/dev-mods/<sessie>/` proberen; noteren of de watcher die volgt.
- [ ] 10. Antwoord van Menno op de twee bedieningsvragen verwerken (toetsen, groepen van Vandaag).

## Definitie van klaar

- Script en mod staan in de repo, beide testsets groen, geen schoolgegevens in de repo.
- `/sales` toont op Menno's machine de echte stand van vanochtend, met het ouderdomsmerk.
- Pull van 07:45 schrijft het snapshot automatisch mee.
