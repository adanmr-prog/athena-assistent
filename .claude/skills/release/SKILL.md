---
name: release
description: Release-workflow voor de Athena Assistent - versienummer bepalen, CACHE in sw.js bumpen, versiecommentaar controleren, syntaxcheck, commit "vX.Y: ..." en push. Alleen handmatig starten.
disable-model-invocation: true
---

# Release Athena Assistent

Voer de stappen in volgorde uit. Stop bij een fout en meld wat er misging.

1. **Versie bepalen.** Zoek de hoogste `vX.Y` in `git log --oneline`. Bugfix of kleine wijziging: Y + 1. Nieuwe feature of gedragswijziging: X + 1 en Y = 0. Vraag bevestiging van het nummer voordat je verdergaat.
   Alleen `backend/Code.gs` (en docs) gewijzigd, `index.html` niet: dan een patchnummer `vX.Y.Z` op de laatste `vX.Y`, `VERSIE` in `Code.gs` gelijk, en stap 2 overslaan (de app verandert niet, dus de cache hoeft niet te verversen). De hoogste `vX.Y` blijft het uitgangspunt voor de volgende app-release.
2. **Cache bumpen.** Zet in `sw.js`: `var CACHE = 'athena-assistent-v<X.Y>';` met hetzelfde nummer als de release. Zonder deze stap krijgen geïnstalleerde PWAs de nieuwe `index.html` niet.
3. **Versiecommentaar.** Controleer dat elke inhoudelijke wijziging in `index.html` een `// vX.Y: reden`-commentaar heeft, in de stijl van de bestaande code.
4. **Syntaxcheck.** Draai:
   ```bash
   echo '{"tool_input":{"file_path":"index.html"}}' | bash .claude/hooks/check-index.sh
   ```
   Exitcode 0 is vereist.
5. **Commit en push.** Alleen de gewijzigde app-bestanden. Titel: `vX.Y: <korte omschrijving in het Nederlands>`. Push naar de huidige branch met `git push -u origin <branch>`.
6. **Melden.** Vat samen: versie, cache-naam, gewijzigde bestanden. Vermeld dat gebruikers de PWA één keer volledig moeten sluiten en heropenen om de nieuwe service worker te activeren.

Nooit: force-pushen, `sw.js` overslaan, of een backend-URL of koppelcode in de code zetten (die horen in het koppelscherm van de app).
