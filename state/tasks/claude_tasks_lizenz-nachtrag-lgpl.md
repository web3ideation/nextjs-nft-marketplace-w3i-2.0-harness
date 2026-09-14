SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach `git status` und `git branch -vv` zeigen. Erwartet wird der Branch
`harness/lizenz-und-notice` mit den unkommitteten Änderungen aus dem Auftrag
`lizenz-und-notice`. Ist der Branch bereits gemergt oder sind die Änderungen
weg, anhalten und melden.

Zielverzeichnis: /home/wolfgang/w3i/nextjs-nft-marketplace-w3i-2.0-harness

## TASK: lizenz-nachtrag-lgpl

GOAL:
Die Begründung für den Umgang mit libvips ist sachlich richtig festgehalten,
und das `NOTICE` sagt, was tatsächlich mitausgeliefert wird. Prüfbar an: der
libvips-Eintrag in `state/assumption-ledger.md` begründet die Entscheidung mit
dem Weitergabe-Fall statt mit der Abhängigkeitstiefe und nennt den Menschen als
Entscheider · der `sharp`-Eintrag im `NOTICE` weist auf die mitgelieferten
LGPL-Binärdateien hin · `npm run check` endet mit Exit 0.

CONTEXT:
- [Fakt] Der Auftrag `lizenz-und-notice` hat beim Fund der LGPL-Lizenz
  eskaliert, wie vorgesehen. Der Mensch hat daraufhin angewiesen, selbst zu
  entscheiden. Der Ablauf war richtig; korrigiert wird nur die Begründung.
- [Fakt] Die bisherige Begründung lautet sinngemäß, libvips gehöre als
  transitive Abhängigkeit nicht ins `NOTICE`. Das trägt nicht: Die Pflichten
  der LGPL hängen nicht an der Abhängigkeitstiefe, sondern daran, ob das
  Ergebnis an Dritte weitergegeben wird.
- [Fakt] `sharp` selbst steht unter Apache-2.0. Die beim Installieren
  hinzugezogenen Pakete `@img/sharp-libvips-*` stehen als Ganzes unter
  `LGPL-3.0-or-later`; libvips wird dort unter LGPLv3 geführt, ebenso mehrere
  mitgelieferte Bibliotheken (glib, librsvg, pango, libheif, libexif, fribidi,
  proxy-libintl). Quelle: die npm-Seiten der `@img/sharp-libvips-*`-Pakete.
- [Schlussfolgerung] Solange die Anwendung nur selbst betrieben wird, findet
  keine Weitergabe statt und es entstehen keine LGPL-Pflichten. Sobald ein
  Container-Image, ein Build-Artefakt oder ein `node_modules`-Baum an Dritte
  geht, greifen sie.
- [Fakt] Der Auftrag `lizenz-und-notice` beschränkte das `NOTICE` auf direkte
  Produktionsabhängigkeiten. Diese Grenze bleibt; ergänzt wird nur ein
  Hinweissatz unter dem bestehenden `sharp`-Eintrag, keine Liste der
  Unterbibliotheken.

SCOPE:
1. `state/assumption-ledger.md`: Den libvips-Eintrag ersetzen. Die neue
   Fassung hält fest:
   - dass `sharp` unter Apache-2.0 steht, die mitinstallierten
     `@img/sharp-libvips-*`-Pakete aber unter `LGPL-3.0-or-later`;
   - dass die Entscheidung, libvips nicht ins `NOTICE` aufzunehmen, damit
     begründet ist, dass die Anwendung nur selbst betrieben und nicht an
     Dritte weitergegeben wird — nicht damit, dass es eine transitive
     Abhängigkeit ist;
   - dass diese Betriebsannahme **nicht geprüft** ist;
   - **Vorbehalt: neu bewerten, sobald ein Container-Image, ein
     Build-Artefakt oder ein `node_modules`-Baum an Dritte weitergegeben
     wird.**
   - dass der Mensch die Entscheidung nach einer Eskalation getroffen hat,
     mit Datum 11.09.2026.
   Format, Spalten und Tonfall der bestehenden Zeilen übernehmen, Status
   `offen`.
2. `NOTICE`: Unter dem bestehenden `sharp`-Eintrag einen Satz ergänzen, dass
   die beim Installieren hinzugezogenen Binärpakete `@img/sharp-libvips-*`
   unter `LGPL-3.0-or-later` stehen. Keine weiteren Einträge, keine Liste der
   Unterbibliotheken, keine Änderung an den übrigen 27 Einträgen.
3. Den `lru-cache`-Eintrag im `NOTICE` unverändert lassen. BlueOak-1.0.0 ist
   freizügig, die Aufnahme war richtig.
4. `npm run check` laufen lassen. Erwartung Exit 0.

NICHT:
- Die Entscheidung selbst umdrehen und libvips doch als eigenen Eintrag ins
  `NOTICE` nehmen.
- Weitere Pakete prüfen, nachtragen oder entfernen. Der Auftrag
  `lizenz-und-notice` ist inhaltlich abgeschlossen.
- `LICENSE`, `package.json`, `README.md` oder
  `docs/architecture/root-structure.md` anfassen.
- Einen Eintrag in `state/reibung.md` anlegen. Die Eskalation hat funktioniert,
  es gibt keinen Vorfall zu protokollieren.
- Eine Lizenzdatei eines Fremdpakets ins Repo kopieren.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Durchgang. Zwei Dateien, wenige Zeilen. Richtwert fünfzehn Minuten.

OUTPUT:
- `state/assumption-ledger.md` und `NOTICE` im Arbeitsbaum, unkommittet, auf
  demselben Branch wie der vorige Auftrag.
- Kurzbericht mit dem alten und dem neuen Wortlaut des libvips-Eintrags und
  dem Exit-Code von `npm run check`.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Der libvips-Eintrag steht nicht in `state/assumption-ledger.md`, sondern
  woanders: melden, nicht raten.
- Beim Ergänzen fällt auf, dass das `NOTICE` ein weiteres Paket unter einer
  Copyleft-Lizenz führt: melden, nicht selbst entscheiden.
