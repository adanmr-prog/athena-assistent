# Athena Assistent (athena-assistent)

Werk-PWA voor AthenaSchool: het bedrijfsbrein en dashboard van Menno (beheerder), de onderwijsadviseurs en de accountmanagers (circa 20 gebruikers; mail, agenda en review zijn per gebruiker privé). Modules (schermnamen sinds v3.9 tussen haakjes; de code gebruikt nog de oude namen): Vandaag (operations-dashboard), Relaties (het eigen CRM dat Capsule vervangt: scholen, personen, pipeline, taken/tracks, tijdlijn, rapportage), Brein ("Assistent": kennisbank en persoonlijke assistent die offertes, conceptmails, taken en afspraken voorstelt; uitvoeren pas na bevestiging), Review ("Dagstart": nachtelijke review), Huisstijl ("Studio": huisstijl-kit en on-brand teksten), Historie/Projecten (elk project met tijdlijn, taken en facturatie; een gewonnen kans wordt automatisch een project voor de accountmanager) en, op desktop, Facturatie (per accountmanager, met termijnen). UI, code en commentaar zijn Nederlands.

## Structuur
- `index.html`: de volledige app (CSS + HTML + inline script in één bestand). Geen build-stap, geen bundler, geen npm-dependencies.
- Desktop (v3.0): vanaf 1024 px zet `zetDesk()` de class `desk` op `body`; dan verschijnt de zijbalk `#zijbalk` (groep Dashboard: Home, Contacten, Taken, Agenda, Pipeline, Projecten, Facturatie, Rapporten, Doelen; groep Athena: Assistent, Dagstart, Studio) en kiezen lijsten en detailschermen hun brede variant via `isDesk()`. Navigatie via `deskNaar(item)`. Desktop-CSS altijd onder `body.desk`, zodat de telefoonweergave ongewijzigd blijft.
- `sw.js`: service worker met app-shell cache. De cache-naam `CACHE` (`athena-assistent-vX.Y`) moet bij elke release omhoog.
- `manifest.webmanifest` en de icon-PNG's (AthenaSchool-logo op paars): PWA-metadata.
- `backend/Code.gs`: de Google Apps Script-backend (Sheet als database, Drive-index, Gmail/Agenda, triggers, Claude API). Wordt in een eigen Apps Script-project geplakt; installatie in `backend/README.md`. Het contract staat in de skill `athena-backend-api`.
- `test/`: mock-backend en Playwright-script voor browsertests (zie Testen).
- `.claude/skills/werving-recruiter/`: werkwijze van de recruiter-agent (monday-bord Werving talent, PoliteReach, Lusha); zie de skill `werving-recruiter`.
- Hosting: GitHub Pages van deze repo (`https://adanmr-prog.github.io/athena-assistent/`).
- Teams, rechten en het trajectproces (taskforce, vacatures, bezetting): voorstel in `docs/teams-en-processen.md`.
- Rechten (v4.0): teams `management|consultancy|accountmanagement|talent` en rollen `medewerker|teamlead|management`; de backend filtert en controleert via `RECHTEN`/`mag()`/`eis()` (zie `docs/teams-en-processen.md`), de app verbergt menu's en knoppen met `magApp()` en `[data-recht]`. Nieuwe schermen en api's doen allebei mee.
- Toekomst: overstap naar Supabase + Vercel met eigen domein; bouw nu al volgens `docs/supabase-migratie.md` (stabiele ids, alleen gewijzigde velden + `_oud`, keuzelijsten in `Instellingen`, alle bewerkingen via het bewerkvenster `openVenster`).

## Conventies
- Vanilla JS in ES5-stijl: `var`, `function`, geen arrow functions, `let/const`, template strings, classes of modules. Doel: iOS Safari als standalone PWA.
- Nederlandse namen voor functies, variabelen en commentaar (`laadVandaag`, `wisselView`, `bezig`).
- Markeer inhoudelijke wijzigingen met een versiecommentaar: `// v1.1: korte reden`.
- Alle backend-calls via `run(fn, ...args)`. Nooit direct `fetch`, nooit headers toevoegen (CORS-preflight faalt op Apps Script). De backend-URL en koppelcode staan alleen in localStorage (koppelscherm), nooit in de code.
- `run()` toont zelf al een toast bij fouten. In `.catch` alleen de UI herstellen, niet opnieuw toasten.
- Alles wat van de backend of uit localStorage komt gaat door `esc()` of `md()` voordat het in `innerHTML` belandt; ook labels met een fallback naar backend-data.
- `localStorage` altijd in try/catch (privémodus gooit).
- Huisstijl: Nunito, paars `#66306E`, oranje `#FAA11B`; de kleuren staan als CSS-tokens in `:root` en kunnen vanuit de backend (`apiHuisstijl`) overschreven worden.
- Geen sleutels, backend-URL's of schoolgegevens in de repo; de mock gebruikt fictieve scholen.

## Releasen
- Gebruik `/release`. Kern: `CACHE` in `sw.js` bumpen, versiecommentaar, commit-titel `vX.Y: omschrijving`.
- De hook `.claude/hooks/check-index.sh` draait na elke edit van `index.html`: syntaxcheck van het inline script en controle of `sw.js` mee gewijzigd is. Een melding van die hook is geen ruis; los hem op.
- Backend-wijzigingen: `Code.gs` opnieuw plakken en als nieuwe Apps Script-versie implementeren; de `/exec`-URL blijft gelijk.

## Testen
- Geen testsuite voor de backend; `node --check` op een `.js`-kopie van `backend/Code.gs` is het vangnet.
- Browsertest: `python3 test/mock_backend.py` serveert de repo op http://127.0.0.1:8765 met een mock-API op `/api` (koppelcode `test123` = management, `am123` = accountmanager Joris); `python3 test/test_app.py` doorloopt alle zes schermen met Playwright (Chromium uit `/opt/pw-browsers`) en zet screenshots in `test/shots/`. De mock houdt state vast: herstart hem voor een tweede run.
- Laat wijzigingen aan layout, caching of navigatie reviewen door de subagent `ios-pwa-reviewer`.

## Git
- Werk op een feature-branch, push met `git push -u origin <branch>`. Geen force-push op gedeelde branches.
