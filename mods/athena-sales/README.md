# athena-sales

Salespaneel in Claude Code: `/sales` toont open kansen en taken per school uit `data/salespaneel.json`, het snapshot dat `scripts/salespaneel_data.py` uit de Capsule-export maakt. Ontwerp: `docs/superpowers/specs/2026-10-07-salespaneel-mod-design.md`.

## Laden

Start Claude Code in de repo (het snapshotpad is relatief aan de werkmap):

```sh
claude --plugin-dir ~/athena-assistent/mods/athena-sales
```

Of, voor hot-reload in een sessie met de skill `plugin-authoring` actief, een symlink in `~/.claude/dev-mods/<sessie>/athena-sales` naar deze map.

## Toetsen

`1`/`2`/`3` weergave (vandaag, scholen, fases) · `f` fase-filter · `j`/`k` regel · `r` ververs · `v`/`m`/`n` vult de prompt met voorstel, mail of notitie voor de geselecteerde school.

## Controles

```sh
claude plugin validate mods/athena-sales
claude plugin test mods/athena-sales
tsc -p mods/athena-sales   # zodra de engine .claude-plugin/types/ heeft gelegd
```
