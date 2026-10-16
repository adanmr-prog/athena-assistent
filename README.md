# Athena Assistent

Het bedrijfsbrein en dashboard van AthenaSchool, als PWA op je telefoon en je Mac. Zes onderdelen:

1. **Vandaag** — operations-dashboard: acties die aandacht vragen, mails die op antwoord wachten, kansen in beweging, agenda en KPI's. Een taak typ je in één zin ("Bel Marieke morgen om 14:00 !", "Factuur sturen elke maand op de 1e @mailen"): de app herkent datum, tijd, herhaling, prioriteit, school, categorie en collega (v4.5). Taken hebben tags, subtaken, opgeslagen weergaven en een weekoverzicht; een kwartier vóór een taak met tijd komt een herinneringsmail (v4.6).
2. **Brein** — elk contract, elke werkwijze en elk schooldossier uit één Drive-map op één plek, met vraag-en-antwoord via Claude.
3. **Review** — elke nacht: wat is gedaan, wat is blijven liggen, wat vraagt vandaag aandacht. Met ochtendmail.
4. **Huisstijl** — de huisstijl-kit van AthenaSchool (Nunito, paars `#66306E`, oranje `#FAA11B`) en on-brand posts, mails en voorstelteksten.
5. **Historie** — doorzoekbare geschiedenis van elke schoolopdracht, met documenten, kansen en notities.
6. **Talent** (v5.0) — het talentbestand naast XPS: één profiel per flexkracht met beschikbaarheid, documenten en VOG per schooljaar, relaties met scholen en beoordelingen; het talentteam stelt kandidaten voor met een uitlegbare matchscore, de accountmanager beoordeelt per plaatsing, uren komen als weekexport uit XPS. Aanmelden via een Google Form; beschikbaarheid bevestigen via een mail-link zonder inlog.

## Opzet
- `index.html`, `sw.js`, `manifest.webmanifest` en de iconen: de app, zonder build-stap. Gehost via GitHub Pages: https://adanmr-prog.github.io/athena-assistent/
- `backend/Code.gs`: de Google Apps Script-backend (Google Sheet als database, Drive-map voor documenten, Gmail en Agenda, dagelijkse triggers, Claude API). Installatie in [`backend/README.md`](backend/README.md).
- `server/`, `api/`, `supabase/` (v6.0): dezelfde app en dezelfde `Code.gs` op Vercel met Supabase Postgres en inloggen met Google, op een eigen domein. Installatie en overstap in [`server/README.md`](server/README.md).
- `test/`: mock-backend en browsertests; `server/test/`: de servertests.

## In gebruik nemen
1. GitHub Pages aanzetten: Settings → Pages → branch `main`, map `/`.
2. De backend installeren volgens `backend/README.md` (±15 minuten; levert een `/exec`-URL en een koppelcode op).
3. De app openen, de `/exec`-URL en de koppelcode invullen, en op iPhone toevoegen aan het beginscherm.
