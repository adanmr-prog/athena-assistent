---
name: athena-backend-api
description: Contract van de Google Apps Script-backend van de Athena Assistent - de run()-RPC, request- en responsevorm, koppelcode-afhandeling, CORS-beperkingen, de lijst van api*-functies met argumenten en resultaatvorm, de Sheet-tabbladen en de Drive-map. Gebruik bij elke wijziging aan index.html die data ophaalt of wegschrijft, en bij het toevoegen van een functie aan backend/Code.gs.
user-invocable: false
---

# Athena Assistent backend-contract

## Transport
- De backend-URL staat niet in de code: de gebruiker vult hem in op het koppelscherm; `index.html` bewaart hem in `localStorage.aa_api` en de koppelcode in `localStorage.aa_secret`.
- Eén helper: `run(fn, arg1, ...)` → `Promise` met `result`. Request: `POST <url>?app=1`, body `JSON.stringify({ fn, args, secret })`.
- Geen request-headers toevoegen: een `Content-Type: application/json` header triggert een CORS-preflight en Apps Script beantwoordt geen OPTIONS.
- Response: `{ ok: true, result }` of `{ ok: false, fout }`. Bij `fout === 'secret'` wist `run()` de koppelcode en toont het koppelscherm. `run()` toast zelf bij fouten; in `.catch` alleen de UI herstellen.
- Functienamen beginnen met `api` + hoofdletter; de dispatcher in `Code.gs` accepteert niets anders.

## Functies
De volledige tabel met argumenten en resultaatvorm staat in `backend/README.md` (sectie "Contract met de app"). Kern:
`apiOverzicht`, `apiActieKlaar`, `apiActieToevoegen`, `apiKennisbank`, `apiIndexeer`, `apiVraag`, `apiReview`, `apiReviewNu`,
`apiHuisstijl`, `apiZetHuisstijl`, `apiMaakContent`, `apiTrajecten`, `apiTraject`, `apiTrajectOpslaan`, `apiNotitieToevoegen`, `apiImporteer`, `apiStatus`.
CRM (v2.0, module Relaties): `apiCrm`, `apiSchool`, `apiSchoolOpslaan`, `apiPersoon`, `apiPersoonOpslaan`, `apiKans`, `apiKansOpslaan`, `apiPipeline`,
`apiMijlpalenOpslaan`, `apiActiviteitToevoegen`, `apiAfspraakPlannen`, `apiTaken`, `apiTaakOpslaan`, `apiTrackOpslaan`, `apiTrackStart`, `apiRapport`,
`apiDoelen`, `apiDoelOpslaan`, `apiHome`, `apiAgenda` (v3.0), `apiGebruikers`, `apiGebruikerOpslaan`, `apiCrmSync`, `apiCrmInrichten`, `apiCapsuleMigratie`, `apiExport`, `apiVerwijder`.

## Gebruikers (v2.0)
- `doPost` zet `GEBRUIKER` via `wieIs(secret)`: `SECRET` = beheerder, een code uit scripteigenschap `CODES` = accountmanager. Geen geldige code → `fout: 'secret'`.
- `ikNaam()` is de naam voor `door`/`eigenaar`; `alleenBeheerder()` bovenaan elke beheerfunctie; `vanMij(eigenaar)` filtert eigen werk.

## Data
- Google Sheet met tabbladen `Scholen`, `Trajecten`, `Kansen`, `Acties`, `Documenten`, `Reviews`, `Huisstijl`, `Content`, `Notities`, `Personen`, `Activiteiten`, `Mijlpalen`, `Tracks`, `Gebruikers`, `Doelen`; kolommen staan in `TABELLEN` bovenin `Code.gs`. Nieuwe kolommen alleen achteraan toevoegen: `blad()` vult de kop van een bestaand tabblad aan. `lees(naam)`, `schrijf(naam, obj)` (upsert op `id`) en `schrijfVeel(naam, lijst)` zijn de enige toegang.
- Drive-map met submappen `Contracten`, `Werkwijzen`, `Schooldossiers`, `Voorstellen`, `Prijslijst`; `indexeerDocumenten()` vult het tabblad `Documenten`.
- Sleutels in scripteigenschappen: `SECRET`, `SHEET_ID`, `DRIVE_MAP_ID`, `ANTHROPIC_API_KEY`, `RAPPORT_EMAIL`, `NAAM`, `CLAUDE_MODEL`, `CLAUDE_EFFORT`, `CAPSULE_TOKEN`, `CODES`. Nooit in de Sheet of in de repo.

## Nieuwe functie toevoegen
1. `apiNaam(...)` in `backend/Code.gs`; alleen via `lees()`/`schrijf()` bij de Sheet, schrijfacties binnen `metLock()`.
2. Aanroepen in `index.html` met `run('apiNaam', ...)`; output door `esc()` of `md()`.
3. Rij toevoegen aan de tabel in `backend/README.md` en, als de mock hem nodig heeft, aan `test/mock_backend.py`.
4. Backend als nieuwe Apps Script-versie implementeren; de `/exec`-URL blijft gelijk.
