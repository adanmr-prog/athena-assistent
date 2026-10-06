# Athena Assistent (athena-assistent)

Werk-PWA voor AthenaSchool: het bedrijfsbrein en dashboard van Menno. Vijf modules: Vandaag (operations-dashboard), Brein (kennisbank met vraag-en-antwoord), Review (nachtelijke review), Huisstijl (huisstijl-kit en on-brand teksten), Historie (geschiedenis van elke schoolopdracht). UI, code en commentaar zijn Nederlands.

## Structuur
- `index.html`: de volledige app (CSS + HTML + inline script in één bestand). Geen build-stap, geen bundler, geen npm-dependencies.
- `sw.js`: service worker met app-shell cache. De cache-naam `CACHE` (`athena-assistent-vX.Y`) moet bij elke release omhoog.
- `manifest.webmanifest` en de icon-PNG's (AthenaSchool-logo op paars): PWA-metadata.
- `backend/Code.gs`: de Google Apps Script-backend (Sheet als database, Drive-index, Gmail/Agenda, triggers, Claude API). Wordt in een eigen Apps Script-project geplakt; installatie in `backend/README.md`. Het contract staat in de skill `athena-backend-api`.
- `test/`: mock-backend en Playwright-script voor browsertests (zie Testen).
- `.claude/skills/werving-recruiter/`: werkwijze van de recruiter-agent (monday-bord Werving talent, PoliteReach, Lusha); zie de skill `werving-recruiter`.
- Hosting: GitHub Pages van deze repo (`https://adanmr-prog.github.io/athena-assistent/`).

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
- Browsertest: `python3 test/mock_backend.py` serveert de repo op http://127.0.0.1:8765 met een mock-API op `/api` (koppelcode `test123`); `python3 test/test_app.py` doorloopt alle vijf schermen met Playwright (Chromium uit `/opt/pw-browsers`) en zet screenshots in `test/shots/`.
- Laat wijzigingen aan layout, caching of navigatie reviewen door de subagent `ios-pwa-reviewer`.

## Git
- Werk op een feature-branch, push met `git push -u origin <branch>`. Geen force-push op gedeelde branches.
