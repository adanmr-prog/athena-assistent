# Athena Assistent

Het bedrijfsbrein en dashboard van AthenaSchool, als PWA op je telefoon en je Mac. Vijf onderdelen:

1. **Vandaag** — operations-dashboard: acties die aandacht vragen, mails die op antwoord wachten, kansen in beweging, agenda en KPI's.
2. **Brein** — elk contract, elke werkwijze en elk schooldossier uit één Drive-map op één plek, met vraag-en-antwoord via Claude.
3. **Review** — elke nacht: wat is gedaan, wat is blijven liggen, wat vraagt vandaag aandacht. Met ochtendmail.
4. **Huisstijl** — de huisstijl-kit van AthenaSchool (Nunito, paars `#66306E`, oranje `#FAA11B`) en on-brand posts, mails en voorstelteksten.
5. **Historie** — doorzoekbare geschiedenis van elke schoolopdracht, met documenten, kansen en notities.

## Opzet
- `index.html`, `sw.js`, `manifest.webmanifest` en de iconen: de app, zonder build-stap. Gehost via GitHub Pages: https://adanmr-prog.github.io/athena-assistent/
- `backend/Code.gs`: de Google Apps Script-backend (Google Sheet als database, Drive-map voor documenten, Gmail en Agenda, dagelijkse triggers, Claude API). Installatie in [`backend/README.md`](backend/README.md).
- `test/`: mock-backend en browsertest.

## In gebruik nemen
1. GitHub Pages aanzetten: Settings → Pages → branch `main`, map `/`.
2. De backend installeren volgens `backend/README.md` (±15 minuten; levert een `/exec`-URL en een koppelcode op).
3. De app openen, de `/exec`-URL en de koppelcode invullen, en op iPhone toevoegen aan het beginscherm.
