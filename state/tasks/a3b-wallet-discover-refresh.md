SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a3b-wallet-discover-refresh

GOAL:
Die fünf Methoden mit Inventar- und Schreibwirkung — Wallet-Inventar, zwei
Discover-Wege, zwei Refresh-Wege — typisiert, mit zod geprüft, und die vier mit
Nebenwirkung **hinter dem Whitelist-Filter**. Prüfbar an: ein Discover- oder
Refresh-Aufruf für eine Collection außerhalb der Diamond-Whitelist erreicht die
Plattform **nicht** · `queueCollectionRefresh` läuft über den Ops-Datensatz,
alle anderen über Read (V15) · das Wallet-Inventar blättert nachweislich · eine
Antwort mit unbekannten Zusatzfeldern wird nicht abgewiesen, eine ohne ein
gebrauchtes Feld laut · `npm run check` endet mit Exit 0.

V-Abdeckung: V12, V13 (Inventar- und Schreibteil), V15, V33 (Filter an den
Aufrufstellen). V5 wird dadurch **vervollständigbar**, aber nicht in diesem
Auftrag erfüllt — siehe FOLGT.

CONTEXT:
- [Fakt] Prüfstand ist die Plattform-`main` (E5, korrigiert am 27.10.2026). Die
  Formen unten sind am 27.10.2026 aus dem Plattform-Code erhoben, nicht aus dem
  Migrationsdokument.
- [Fakt] **Der Ordnername der Plattform ist irreführend, und das kostet einen
  Baudurchgang, wenn man ihn glaubt.**
  `apps/web/src/app/api/v1/owners/wallets/[chainId]/route.ts` heißt `[chainId]`,
  enthält aber die **Eigentümer-Adresse**: der Pfadparameter wird in Zeile 73
  als `ownerAddress` an `loadWalletInventory` übergeben, und die Chains kommen
  kommasepariert als Query-Parameter `chainIds` (Zeile 96 ff.).
  [Schlussfolgerung] Wer den Routenbaum liest und daraus eine URL baut, baut
  sie falsch und bekommt auf jeden Wallet-Aufruf einen 404.
- [Fakt] Die tatsächlichen Pfade und Zugangsdatensätze:

  | Zweck | Pfad | Scopes | Datensatz |
  |---|---|---|---|
  | Inventar, mehrere Chains | `GET /api/v1/owners/wallets/{ownerAddress}?chainIds=…` | `owners:read` | read |
  | Inventar, eine Chain | `GET /api/v1/owners/wallets/{chainId}/{ownerAddress}` | `owners:read` | read |
  | Token-Discover | `POST /api/v1/tokens/discover` | `tokens:read`, `refresh:token` | read |
  | Wallet-Discover | `POST /api/v1/owners/wallets/discover` | `owners:read`, `refresh:token` | read |
  | Token-Refresh | `POST /api/v1/refresh/token` | `refresh:token` | read |
  | Collection-Refresh | `POST /api/v1/refresh/collection` | `refresh:collection` | **ops** |

  [Schlussfolgerung] `refresh:collection` ist der einzige Scope, den `alpha-read`
  nicht hat. V15 ist damit am Code bestätigt, nicht nur in der Spec.
- [Fakt] Beide Discover-Endpunkte nehmen **1 bis 500** Identitäten
  (`.min(1).max(500)`); Wallet-Discover zusätzlich `ownerAddress`.
  [Schlussfolgerung] Der Client muss stückeln, nicht der Aufrufer. Eine Liste
  mit 700 Identitäten darf nicht zu einem Validierungsfehler der Plattform
  führen, und eine leere Liste nicht zu einem Aufruf.
- [Fakt] **Die Discover-Antwort ist keine Quittung, sondern teilweise schon das
  Ergebnis.** Je Element: `chainId`, `contractAddress`, `tokenId`,
  `discoveryStatus` (`'ready' | 'queued' | 'failed'`), `queuedJobId`, `jobId`,
  `token`, `collection`, bei `failed` zusätzlich `message`. Bei `ready` sind
  `token` und `collection` die vollständigen serialisierten Objekte. Dazu ein
  `summary` mit `total`, `ready`, `queued`, `failed`.
  [Schlussfolgerung] Der Aufrufer kann aus einem Discover unmittelbar anzeigen,
  was schon da ist — A6 braucht dafür keinen zweiten Aufruf.
- [Fakt] `POST /api/v1/refresh/token` antwortet
  `{ ok, jobId, queueJobId, status }` mit **variablem HTTP-Status**
  (`persistedJob.statusCode`). [Schlussfolgerung] Solange er im 2xx-Bereich
  liegt, sieht unser Client ihn als Erfolg; ein 409 für „läuft schon" würde als
  `PlatformResponseError` ankommen und wäre **kein** Fehler im Sinne der Sache.
  Das ist im Bau zu prüfen und, falls es so ist, hier zu behandeln statt beim
  Aufrufer.
- [Fakt] Die Discover-Route der Plattform hat einen eigenen Contract-Guard und
  antwortet für abgelehnte Contracts mit `discoveryStatus: 'failed'` samt
  `message`. [Schlussfolgerung] Das ist die Env-Allowlist der Plattform als
  Notbremse, **nicht** unser Filter. Beides existiert nebeneinander, und unser
  Filter kommt zuerst — sonst hat der Aufruf die Plattform schon erreicht.
- [Fakt] `isCollectionWhitelisted` aus Paket A4a ist die serverseitige Quelle,
  mit Zwischenspeicher und dokumentiertem Fehlerverhalten (im Zweifel
  verneinen).
- [Fakt] Die Transportschicht (A1) und die Prüfmuster (A3a) stehen:
  `requestPlatform(options, deps)`, `buildListQuery`, `parseOrThrow`-Muster,
  `asPlatformCursor`, `PLATFORM_MAX_LIMIT`.
- [Fakt] Review-Befund 8 (Warteschlange des Nebenläufigkeitsdeckels nicht
  abbrechbar, ungedeckelt) ist offen und laut Ledger **vor A5** fällig, nicht
  vor A3b. [Schlussfolgerung] A3b darf laufen, aber die Discover-Stückelung
  erzeugt erstmals mehrere Aufrufe hintereinander aus einer Anfrage — wenn sich
  dabei zeigt, dass die Warteschlange wächst, ist Befund 8 früher fällig als
  gedacht und das gehört gemeldet.

SCOPE:
1. `src/lib/nft-data-platform/schemas.ts` erweitern — keine neue Datei, damit
   die Rohformen an **einer** Stelle bleiben:
   - `walletInventoryResponseSchema`: `chainIds`, `items`, `pageInfo`. Die
     Elemente tragen Holding-Angaben plus optional das Token; ein Element **ohne**
     Token ist gültig (V2: `token: null` ergibt trotzdem einen Eintrag).
   - `discoverResponseSchema`: `summary` plus `items` mit dem unterschiedenen
     `discoveryStatus`; `token` und `collection` nullbar, `message` optional.
   - `refreshJobResponseSchema`: `jobId`, `queueJobId`, `status`.
   - Pick-Regel und Datumsbehandlung wie in A3a, im Dateikopf schon festgehalten.
2. `src/lib/nft-data-platform/types.ts`: die Typen daraus ableiten (`z.infer`).
3. `src/lib/nft-data-platform/write.ts` — neue Datei, bewusst getrennt von
   `read.ts`, weil hier jeder Aufruf auf der Plattform Arbeit auslöst:
   - `getWalletInventory({ ownerAddress, chainIds?, cursor?, limit? })` — gehört
     fachlich zum Lesen, liegt aber hier, weil es denselben Pfadbaum nutzt und
     im Dateikopf dieselbe Warnung braucht. **Begründung im Kopf festhalten,
     sonst sucht es jemand in `read.ts`.**
   - `discoverTokens(identities)` und `discoverWalletHoldings({ ownerAddress,
     identities })`: **stückeln** zu Blöcken von höchstens 500, leere Liste
     ergibt ein leeres Ergebnis **ohne** Aufruf, und jede Identität läuft vorher
     durch `isCollectionWhitelisted`. Abgelehnte Identitäten werden als
     `discoveryStatus: 'failed'` mit eigener `message` zurückgegeben, nicht
     stillschweigend verschluckt — der Aufrufer muss sehen, dass etwas gefiltert
     wurde.
   - `queueTokenRefresh(identity)`: Filter davor, Read-Datensatz.
   - `queueCollectionRefresh({ chainId, contractAddress })`: Filter davor,
     **Ops**-Datensatz.
   - Jeder Formfehler wird `PlatformResponseError` mit zod-Fundstelle, wie in
     A3a.
4. `src/lib/nft-data-platform/index.ts`: die neuen Methoden und Typen
   exportieren.
5. `src/lib/nft-data-platform/write.test.ts`:
   - **Der wichtigste Test:** eine Identität außerhalb der Whitelist erreicht
     die Plattform nicht — `fetchImpl` wird nicht gerufen, und das Ergebnis
     trägt `discoveryStatus: 'failed'` mit einer Meldung, die den Grund nennt.
   - `queueCollectionRefresh` sendet `x-client-id: alpha-ops`, alle anderen
     `alpha-read`.
   - 501 Identitäten ergeben **zwei** Aufrufe; 500 ergeben einen; null ergeben
     keinen.
   - Das Wallet-Inventar blättert: zweiter Aufruf trägt den `nextCursor` des
     ersten im Pfad und liefert andere Elemente.
   - `chainIds` wird kommasepariert übergeben, nicht als Mehrfachparameter.
   - Ein Inventar-Element ohne Token wird angenommen (V2).
   - Eine Antwort mit Zusatzfeldern wird angenommen, eine ohne `summary`
     abgewiesen.
6. Dateikopf nach `docs/kommentar-standard.md`. Im Kopf von `write.ts` die
   Pfad-Falle aus CONTEXT ausdrücklich festhalten, mit Belegstelle.

NICHT:
- Eine Route anfassen. A5, A6 und A4b sind die Aufrufer; A3b stellt nur die
  Methoden.
- `refreshQueued` in der Detailroute auf `true` setzen. Das ist A7b-Nacharbeit
  und braucht die Entscheidung, ob ein Detailaufruf überhaupt einen Refresh
  auslösen soll — eine Frage an V22, nicht an A3b.
- Den Whitelist-Filter abschalten oder umgehen, auch nicht über einen
  Parameter. Wer eine Ausnahme braucht, braucht eine Entscheidung.
- Eine eigene Fehlerklasse für „Collection nicht freigegeben" einführen. Das ist
  kein Fehler der Plattform, sondern ein Ergebnis unserer Prüfung, und es gehört
  in die Antwort, nicht in einen Wurf.
- Die Env-Allowlist der Plattform nachbauen. Sie ist deren Notbremse.
- Stückelung parallel senden. Nacheinander: der Nebenläufigkeitsdeckel ist für
  gleichzeitige **Anfragen** gedacht, nicht dafür, dass eine Anfrage ihn alleine
  füllt (Review-Befund 8 ist offen).
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Eine neue Quelldatei, eine
neue Testdatei, zwei erweiterte Dateien, ein Export. Der Umfang steckt in der
Stückelung und im Filter, nicht in der Zahl der Methoden.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, der
  Tabelle Pfad → Zugangsdatensatz in umgesetzter Form, dem Ergebnis des
  Stückelungstests, und der Feststellung, ob `refresh/token` einen
  nicht-2xx-Status für „läuft schon" liefert.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Der Pfad des Wallet-Inventars verhält sich anders als in CONTEXT beschrieben:
  **anhalten und melden.** Dann ist die Erhebung falsch, und A5 hängt ebenfalls
  daran.
- `refresh/token` antwortet für „läuft schon" mit einem Status außerhalb 2xx:
  melden und hier behandeln, nicht beim Aufrufer. Ein laufender Auftrag ist
  kein Fehler.
- Die Stückelung lässt die Warteschlange des Deckels wachsen: melden. Dann ist
  Review-Befund 8 vor A3b fällig und nicht erst vor A5.
- Ein Schema lässt sich nur mit `any` schreiben: anhalten. Dann ist die Form
  unklar, nicht die Typisierung das Problem.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
Mit A3b wird `refreshQueued` in der Detailroute erstmals wahr werden können —
das schließt die Hälfte von V5, die heute nichts bewirkt (Ledger-Eintrag vom
27.10.2026). Ob ein **Detailaufruf** einen Refresh auslösen darf, ist dabei
eine eigene Entscheidung: er läuft im Anfragepfad des Nutzers und zählt gegen
dasselbe Fensterlimit (V22).
Danach: A5 (Wallet-Route plus `/api/user/nfts`, davor Review-Befund 8), A6
(braucht E1), A9, A11 (braucht den Aufrufzahl-Beleg), A4b/A4c (brauchen den
unvereinten Plattform-Branch).
