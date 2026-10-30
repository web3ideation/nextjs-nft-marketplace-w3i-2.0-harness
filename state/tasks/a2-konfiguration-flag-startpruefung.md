SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein (A1 und A2 laufen auf demselben Branch, bis
der erste PR offen ist). Danach `npm run check` laufen lassen (erwartet:
Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a2-konfiguration-flag-startpruefung

GOAL:
Die Plattform-Nutzung hängt an einem serverseitigen Flag, und wenn das Flag an
ist, scheitert eine fehlende Pflichtvariable **laut und früh** statt still.
Prüfbar an: ist das Flag aus, erzeugt kein Pfad einen Plattform-Aufruf und keine
Plattform-Variable ist Pflicht · ist das Flag an und eine der sieben
Pflichtvariablen fehlt, nennt der Fehler **alle** fehlenden Namen auf einmal ·
`REDIS_SSE_CHANNEL` hat keinen stillen Rückfallwert mehr (V64) · ein
`stale_timestamp` der Plattform erzeugt eine Uhrdrift-Meldung auf Fehlerstufe
(zweite Hälfte von V16) · die eigene Zahl gesendeter Anfragen im laufenden
Fenster steht neben `remaining` im Protokoll (Befund 7) · `npm run check`
endet mit Exit 0 · `state/gates.md` trägt eine Zeile mit **belegtem** Rot- und
Grün-Fall.

V-Abdeckung: V14, V64, zweite Hälfte von V16, Messzeile aus Advisor-Befund 7.

CONTEXT:
- [Fakt] Entscheidung **E4** vom 13.10.2026 (`state/plan-v2-plattform-integration.md`
  Abschnitt 6): Das Flag wohnt **serverseitig** in
  `src/lib/nft-data-platform/config.ts`, neben den Variablen, die es bedingt.
  `src/config/app.config.ts` wird **nicht** angefasst.
- [Fakt] Begründung dafür, belegt in Advisor-Befund 4: `src/config/app.config.ts`
  ist ein `as const`-Objekt mit literalen Booleans, liest keine
  Umgebungsvariable und wird über `src/config/index.ts` in **drei
  Client-Komponenten** importiert — `src/app/sell/components/SellPage.tsx`,
  `src/app/sell/listing/page.tsx`, `src/app/sell/check-listing/page.tsx`, alle
  mit `'use client'`. [Schlussfolgerung] Ein dort aus `process.env` gelesenes
  Flag wäre im Browser `undefined`, also still `false`. Mit
  `NEXT_PUBLIC_`-Präfix verstieße es gegen V14.
- [Fakt] `src/lib/nft-data-platform/config.ts` wirft beim ersten Aufruf mit der
  vollständigen Liste fehlender Namen (`PlatformConfigError.missingVariables`)
  und liest nichts auf Modulebene. `isPlatformConfigured()` existiert dort
  bereits für Aufrufer mit degradiertem Pfad.
- [Fakt] Advisor-Befund 14: `scripts/check-env.js` liest die Werte aus einer
  **Datei** (`.env.local` bzw. `.env.production.local`, Listen in Zeile 30–40,
  `criticalVars` in Zeile 42–57) und bricht ab, wenn die Datei fehlt;
  `process.env` wird für die geprüften Variablen nirgends gelesen.
  [Schlussfolgerung] Im Zielbetrieb injiziert der Hoster die Variablen in den
  Prozess, eine solche Datei existiert dort nicht — `npm run env:check:prod`
  scheitert dann vor der ersten Prüfung. Das Skript kann deshalb nicht der
  Nachweis für V14 sein, sondern nur Entwicklerhilfe. Das ist zu dokumentieren,
  nicht zu reparieren: eine Umschreibung auf `process.env` ist ein eigener
  Auftrag mit eigenem Risiko für die vier bestehenden Pflichtvariablen.
- [Fakt] `env:check` ist in keiner blockierenden Kette: `npm run check` enthält
  es nicht, und `state/gates.md` hat keine Zeile dazu.
- [Fakt] V64 heute: `src/services/sse/broadcast.ts:18` setzt
  `const SSE_CHANNEL = process.env.REDIS_SSE_CHANNEL || 'marketplace:sse:events'`
  auf **Modulebene**. [Schlussfolgerung] Mit geteiltem Redis teilen zwei
  Umgebungen stillschweigend einen Kanal — genau das verbietet V64. Der
  Rückfallwert ist das Problem, nicht die Variable.
- [Fakt] Vier Routen importieren `broadcast.ts`:
  `src/app/api/events/marketplace/route.ts`, `src/app/api/events/subscribe/route.ts`,
  `src/app/api/health/route.ts`, `src/app/api/admin/system/health/route.ts`.
  [Schlussfolgerung] Ein `throw` auf Modulebene würde diese vier Routen beim
  Import sprengen — dieselbe Falle wie in `state/tasks/fix-mongodb-lazy-init.md`.
  Die Prüfung gehört in eine Funktion, die beim ersten Gebrauch läuft.
- [Fakt] V16 zweite Hälfte (Advisor-Befund 18): „Ein Monitoring-Alarm auf
  Uhrdrift existiert." A1 erkennt `stale_timestamp` als nicht wiederholbar und
  begründet das im Code (`src/lib/nft-data-platform/errors.ts`), einen Alarm
  gibt es nicht. Geführt in `state/assumption-ledger.md` (13.10.2026).
- [Fakt] Advisor-Befund 7: Budget und Nebenläufigkeitsdeckel liegen im Prozess,
  das Fensterlimit gilt je Client über alle Instanzen; Web und Worker sind zwei
  Prozesse mit demselben `read`-Datensatz. Protokolliert wird heute nur
  `remaining` aus den Antwort-Headern, also die **globale** Wahrheit.
  [Schlussfolgerung] Ohne die eigene Zahl ist ein zu schnell fallendes
  Restbudget nicht von „ein anderer Aufrufer ist laut" zu unterscheiden, und
  V34 ist nach dem Umschalten nicht auswertbar.
- [Fakt] **Die Dateien `.env.local.template` und `.env.production.template` sind
  für diesen Auftrag unerreichbar.** Jeder Zugriff — auch lesend, auch per
  `grep` — wird von den Deny-Rules in `.claude/settings.json` blockiert:
  „Reading .env through the shell is blocked … The names belong in
  .env.example; the values are the user's business."
  [Schlussfolgerung] Die Templates werden in diesem Auftrag **nicht** geändert.
  Die Namen werden stattdessen in `docs/environment/ENV_VARIABLES.md`
  dokumentiert, und der Bericht endet mit einem Block „In die Templates und in
  Coolify nachzutragen" (Name, Zweck, Build- oder Runtime-Variable,
  Beispielwert). Eine Datei blind anzuhängen, die man nicht lesen darf, ist
  kein Zuschnitt, sondern ein Raten.

SCOPE:
1. `src/lib/nft-data-platform/config.ts`:
   - `isPlatformEnabled(): boolean` ergänzen, liest `NFT_DATA_PLATFORM_ENABLED`.
     Strikt: nur `'true'` und `'1'` sind wahr, alles andere (auch `'yes'`,
     Großschreibung, Leerstring, fehlend) ist falsch. Begründung im Kommentar:
     ein Flag, das bei Tippfehlern „an" bedeutet, ist schlimmer als keins.
   - `getPlatformConfig()` wirft bei **ausgeschaltetem** Flag einen
     `PlatformConfigError` mit klarer Meldung und leerer `missingVariables`.
     Keine neue Fehlerklasse: das ausgeschaltete Flag **ist** ein
     Konfigurationszustand, und `isPlatformConfigured()` gibt damit
     automatisch `false` zurück — genau was der degradierte Pfad braucht.
   - Weiterhin nichts auf Modulebene lesen.
2. `src/lib/nft-data-platform/client.ts`: beim Auftreten eines
   `PlatformAuthError` mit `platformCode === 'stale_timestamp'` eine Meldung auf
   **Fehlerstufe** mit eigenem Ereignisnamen (`nft_data_platform_clock_drift`),
   die den gesendeten Zeitstempel und die Schwelle von 300 Sekunden nennt. Das
   ist die zweite Hälfte von V16 — ein Alarm, auf den eine Überwachung
   ansetzen kann, nicht eine Zeile im Debug-Rauschen.
3. `src/lib/nft-data-platform/rate-limit.ts`:
   - eigene Fensterzählung je Zugangsdatensatz: `recordRequestSent(kind, nowMs)`,
     zurückgesetzt an jeder 60-Sekunden-Fenstergrenze (dieselbe Rechnung wie
     `markWindowExhausted`).
   - `sentInWindow` in `RateLimitSnapshot` und in **beide** bestehenden
     Protokollzeilen (`nft_data_platform_rate_limit`, `…_high`).
   - Im Dateikopf den Satz ergänzen, warum die Zahl da ist: sie ist die
     Gegenprobe zu `remaining`, und ohne sie ist die Prozess-Lücke nicht
     messbar.
   - `resetRateLimitState()` setzt sie mit zurück.
4. `src/lib/nft-data-platform/client.ts`: `recordRequestSent` vor dem Senden
   aufrufen — gezählt wird der **Versuch**, nicht der Erfolg, weil die
   Plattform ebenfalls Versuche zählt.
5. `src/services/sse/broadcast.ts` (V64): den Rückfallwert entfernen. Der Kanal
   kommt aus einer Funktion `getSseChannel()`, die beim ersten Gebrauch liest
   und bei fehlender Variable wirft, mit einer Meldung, die den Variablennamen
   und den Grund nennt (zwei Umgebungen dürfen keinen Kanal teilen). **Kein
   `throw` auf Modulebene** — vier Routen importieren diese Datei. Alle
   bisherigen Verwendungsstellen von `SSE_CHANNEL` auf die Funktion umstellen.
6. `scripts/check-env.js`: eine **bedingte** Gruppe ergänzen — ist
   `NFT_DATA_PLATFORM_ENABLED` in der gelesenen Datei wahr, sind die sieben
   Plattform-Variablen Pflicht; dazu `REDIS_SSE_CHANNEL` unbedingt als Pflicht.
   Die sechs optionalen Stellwerte werden **nur gelistet, nicht erzwungen**.
   Im Dateikopf den Satz ergänzen, dass dieses Skript eine Datei prüft und
   deshalb in der Zielumgebung nichts belegt — der verbindliche Nachweis für
   V14 ist `getPlatformConfig()`.
7. `docs/environment/ENV_VARIABLES.md`: neuer Abschnitt „NFT Data Platform" mit
   allen dreizehn Namen (sieben Pflicht, sechs optional mit Standardwert) und
   `REDIS_SSE_CHANNEL` im bestehenden Redis-Abschnitt. Je Zeile: Zweck, Pflicht
   oder optional, Build- oder Runtime-Variable, Beispielwert ohne echtes Secret.
8. `state/gates.md`: Zeile für die Startprüfung in ihrer neuen Form (Artefakt
   A-3 aus Plan v2). **Rot- und Grün-Fall müssen echt erzeugt werden**, nicht
   behauptet — ein Gate ohne Kalibrierung ist nach dem Kopf dieser Datei ein
   ungeprüftes Versprechen. Dazu ein Eintrag im Kalibrierungs-Log mit Datum.
9. Tests neben der Quelle:
   - `src/lib/nft-data-platform/config.test.ts`: Flag aus → `isPlatformEnabled()`
     falsch und `isPlatformConfigured()` falsch, obwohl alle Variablen gesetzt
     sind · Flag an und drei Variablen fehlen → `missingVariables` enthält genau
     diese drei · `'TRUE'`, `'yes'`, `''` gelten als aus.
   - `rate-limit`-Teil in `client.test.ts` erweitern: `sentInWindow` zählt
     Versuche (auch gescheiterte) und wird an der Fenstergrenze zurückgesetzt.
10. Dateikopf nach `docs/kommentar-standard.md` in jeder neuen Datei; in
    geänderten Dateien den Kopf anpassen, wenn sich der Zweck verschiebt.

NICHT:
- `.env.local.template` oder `.env.production.template` anfassen. Lesen ist
  blockiert, blind anhängen ist keine Option. Stattdessen der Nachtrags-Block
  im Bericht (siehe OUTPUT).
- `src/config/app.config.ts` oder `src/config/index.ts` ändern. E4 hat das
  ausdrücklich ausgeschlossen.
- `scripts/check-env.js` auf `process.env` umschreiben. Eigener Auftrag — die
  Umstellung berührt die vier bestehenden Pflichtvariablen und damit einen
  Pfad, der heute funktioniert.
- `env:check` in `npm run check` aufnehmen. Das Skript braucht eine lokale
  Umgebungsdatei; in der CI gibt es keine, das Gate wäre dauerhaft rot.
- Eine achte Fehlerklasse für das ausgeschaltete Flag einführen.
- Den Nebenläufigkeitsdeckel, die Startwerte oder den Backoff aus A1 ändern.
  Die Messung aus V34 soll sie korrigieren, nicht eine Vermutung.
- Einen gemeinsamen Rate-Limit-Zähler über Redis bauen. Plan v2 führt ihn
  ausdrücklich als „nicht vor dem Umschalten nötig"; gebraucht wird jetzt die
  Messbarkeit, nicht die Lösung.
- Eine fachliche Endpunkt-Methode oder ein DTO anlegen. Das ist A3.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Eine neue Testdatei, fünf
geänderte Quelldateien, zwei geänderte Dokumente. Der größte Einzelposten ist
die Kalibrierung in `state/gates.md`, weil Rot und Grün wirklich gefahren
werden müssen.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, dem
  belegten Rot- und Grün-Fall der neuen Gate-Zeile im Wortlaut, und der
  ausdrücklichen Feststellung, welche V-Aussagen damit erfüllt sind und welche
  nicht.
- **Block „In die Templates und in Coolify nachzutragen"** am Ende: je Variable
  Name, Zweck, Pflicht oder optional, Build- oder Runtime-Variable,
  Beispielwert. Dreizehn Plattform-Variablen plus `REDIS_SSE_CHANNEL`.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Die Umstellung von `SSE_CHANNEL` auf eine Funktion bricht eine der vier
  importierenden Routen im Typecheck: anhalten und melden. Dann hängt mehr an
  dem Modulebene-Wert als dieser Auftrag annimmt.
- `scripts/check-env.js` lässt sich nicht um eine bedingte Gruppe erweitern,
  ohne die vier bestehenden Pflichtvariablen anders zu behandeln: anhalten.
  Eine Strukturänderung an diesem Skript ist ein eigener Auftrag.
- Der Rot-Fall der neuen Gate-Zeile lässt sich nicht erzeugen: **nicht**
  erfinden. Die Zeile bekommt dann „noch offen" wie das Regel-Gate und
  Vertrags-Gate, mit Begründung.
- `npm run check` wird rot: Befunde melden, nicht durch Anpassen der Tests oder
  durch `any` grün machen.

FOLGT:
A3 — Normalisierung, DTOs, Cursor. Prüfstand ist `5dda8c7` (E5, entschieden
13.10.2026). Davor oder parallel: **A8** — Zustandsmodell und
Fehlerübersetzungstabelle, hängt an keiner offenen Entscheidung und ist
Voraussetzung jeder Routen-DoD (Plan v2, Abschnitt 4).
Offen und von diesem Auftrag unberührt: E8 (Chain-/Approval-Block, blockiert
A7c), E1 (fällig vor A6), E2 (fällig vor Tor T1). Die Spec pinnt nach E5 noch
den falschen Plattform-Commit `7915b52` — eigener, kleiner Nachtrag.
