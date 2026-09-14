SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen. Es muss ein eigener Branch
für diesen Auftrag sein, nicht `main`. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: /home/wolfgang/w3i/nextjs-nft-marketplace-w3i-2.0-harness

## TASK: lizenz-und-notice

GOAL:
Die Lizenzangaben des Repos nennen die richtige Rechteinhaberin und den
richtigen Zeitraum, und die genutzten Fremdkomponenten sind in einem `NOTICE`
aufgeführt. Prüfbar an: `LICENSE` trägt die Zeile
`Copyright (c) 2025-2026 Ideation Port UG (haftungsbeschränkt)` bei sonst
unverändertem MIT-Text · im Wurzelverzeichnis liegt ein `NOTICE` · `package.json`
hat ein Feld `"license": "MIT"` · keine Stelle im Repo nennt mehr
„NextJS NFT Marketplace" als Rechteinhaber · `npm run check` endet mit Exit 0.

CONTEXT:
- [Fakt] `LICENSE` ist der MIT-Text mit der Zeile
  `Copyright (c) 2024 NextJS NFT Marketplace`. Das ist ein Platzhalter ohne
  Rechtsträger.
- [Fakt] Der erste Commit des Repos ist `bb0387c` vom 09.09.2025, die
  `LICENSE` kam mit `27a0c0b` am 12.09.2025 dazu. Das Jahr 2024 ist falsch.
- [Entscheidung des Menschen, 11.09.2026] Rechteinhaberin ist die
  **Ideation Port UG (haftungsbeschränkt)**. Die Lizenz bleibt **MIT**;
  Niklas Hoffmann als bisheriger Autor ist damit einverstanden.
- [Fakt] `package.json` hat kein `license`-Feld und steht auf
  `"private": true`. Das `private`-Feld bleibt, es verhindert nur ein
  versehentliches Veröffentlichen auf npm und sagt nichts über die Lizenz.
- [Fakt] Ein `NOTICE` fehlt. Die Schwester-Repos haben eines; als Formatvorlage
  dient `NOTICE` aus `ideation-market-w3i`: Überschrift, dann je Komponente
  Name, Lizenz und Repository-URL als nummerierte Liste.
- [Fakt] Weitere Fundstellen: `README.md:8` (MIT-Abzeichen),
  `README.md:637` (Verweis auf die LICENSE-Datei),
  `docs/architecture/root-structure.md:29` (Kommentar „MIT License").
- [Fakt] `package.json` hat 28 Produktionsabhängigkeiten.
- [Schlussfolgerung] Ein `NOTICE`, das jede transitive Abhängigkeit auflistet,
  wäre weder pflegbar noch prüfbar. Deshalb nur die direkten
  Produktionsabhängigkeiten.

SCOPE:
1. `LICENSE`: ausschließlich die Copyright-Zeile ersetzen durch
   `Copyright (c) 2025-2026 Ideation Port UG (haftungsbeschränkt)`.
   Der übrige MIT-Text bleibt zeichengleich.
2. `package.json`: Feld `"license": "MIT"` ergänzen, an der Stelle, an der npm
   es üblicherweise führt (nach `version`). `"private": true` bleibt stehen.
   Sonst nichts an der Datei ändern.
3. `NOTICE` im Wurzelverzeichnis anlegen, im Format des Schwester-Repos:
   - Kopfzeile mit dem Projektnamen und
     `Copyright (c) 2025-2026 Ideation Port UG (haftungsbeschränkt)`.
   - Nummerierte Liste der **direkten Produktionsabhängigkeiten** aus
     `dependencies` in `package.json`, je Eintrag Name, Lizenz und
     Repository-URL.
   - **Lizenz und URL je Paket aus `node_modules/<paket>/package.json`
     auslesen** (Felder `license` und `repository`), nicht aus dem Gedächtnis
     schreiben. Ist ein Feld dort nicht gesetzt, den Eintrag mit
     `Lizenz: siehe Paket` kennzeichnen und im Bericht auflisten.
   - Am Ende ein Abschnitt für Dienste, die keine npm-Pakete sind: The Graph
     (Subgraph) und die NFT Data Platform. 1inch **nicht** aufnehmen, siehe
     NICHT.
4. `README.md:637`: Satz so anpassen, dass er die Rechteinhaberin nennt und
   zusätzlich auf `NOTICE` verweist. Das Abzeichen in Zeile 8 bleibt, es sagt
   MIT und das stimmt weiterhin.
5. `docs/architecture/root-structure.md`: Die Baumdarstellung um eine Zeile
   für `NOTICE` ergänzen, analog zur bestehenden `LICENSE`-Zeile.
6. `npm run check` laufen lassen. Erwartung Exit 0.

NICHT:
- Die Lizenz wechseln oder den MIT-Text umformulieren. Es geht nur um
  Rechteinhaberin, Zeitraum und das fehlende `NOTICE`.
- `"private": true` entfernen.
- SPDX-Kopfzeilen in Quelldateien einführen. Das Repo hat keine, und ein
  flächendeckendes Einfügen wäre ein eigener Auftrag.
- Repo-Verweise, Badges oder URLs umstellen, die auf `NiklasHoffmann/…`,
  `web3ideation/…` oder `wolf3i/…` zeigen. Das Repo zieht gerade in den
  Firmen-Account um; diese Verweise kommen **nach** dem Umzug in einem
  eigenen Auftrag dran, sonst zeigen sie auf einen Pfad, den es noch nicht
  gibt.
- 1inch ins `NOTICE` aufnehmen. Die Namensnennung ist Teil der Spec (V49, V58)
  und hängt an einer Freigabe, die noch nicht vorliegt.
- `LICENSE` oder `NOTICE` der Schwester-Repos anfassen.
- Entwicklungsabhängigkeiten (`devDependencies`) oder transitive
  Abhängigkeiten ins `NOTICE` aufnehmen.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Durchgang plus höchstens eine Korrekturrunde. Fünf Dateien, davon eine neu.
Richtwert eine halbe Stunde, davon der Großteil das Auslesen der
Paketlizenzen.

OUTPUT:
- `LICENSE`, `NOTICE`, `package.json`, `README.md`,
  `docs/architecture/root-structure.md` im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, der Zahl der im `NOTICE`
  aufgeführten Pakete, und einer Liste der Pakete, bei denen Lizenz oder
  Repository-URL in `node_modules` nicht gesetzt war.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- `node_modules` fehlt oder ist unvollständig, die Lizenzen lassen sich also
  nicht auslesen: melden, **nicht** aus dem Gedächtnis ergänzen.
- Ein Paket steht unter einer Lizenz, die nicht MIT, ISC, BSD oder Apache-2.0
  ist, insbesondere unter einer Copyleft-Lizenz (GPL, AGPL, LGPL): anhalten
  und melden, bevor das `NOTICE` geschrieben wird. Das wäre ein eigener
  Befund, der den Menschen betrifft.
- Im Repo findet sich eine weitere Stelle mit einem Copyright- oder
  Lizenzhinweis, die oben nicht genannt ist: melden, nicht ungefragt
  mitändern.
- `npm run check` wird rot: Befunde melden, nicht durch Anpassen von Tests
  oder Typen grün machen.

FOLGT:
Nach dem Umzug des Repos in den Firmen-Account ein eigener Auftrag für alle
Repo-Verweise (V59): `README.md`, `docs/development/README.md`,
`docs/development/setup.md`, `MigrationBanner.tsx`. Ausgenommen bleiben
`docs/CHANGELOG.md` und `state/repo-audit-befunde.md`.
