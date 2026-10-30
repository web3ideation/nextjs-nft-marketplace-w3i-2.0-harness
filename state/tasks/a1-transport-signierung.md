SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a1-transport-signierung

GOAL:
Eine server-only Transportschicht zur NFT Data Platform, die signiert, wiederholt
und Fehler normalisiert — ohne einen einzigen fachlichen Endpunkt zu kennen.
Prüfbar an: `src/lib/nft-data-platform/signing.ts` erzeugt für einen bekannten
Vektor dieselbe Signatur wie die Referenz der Plattform · jede Wiederholung trägt
einen neuen Zeitstempel und eine neue Signatur, nie dieselbe zweimal · `409
replayed_request`, `429`, `503` und Timeout sind vier unterscheidbare Zustände,
nicht ein gemeinsamer Fehler · die Nebenläufigkeit ist gedeckelt und das
Rate-Limit-Budget wird je Zugangsdatensatz mitgeführt · `npm run check` endet mit
Exit 0.

V-Abdeckung: V10, V11 (nur Mechanik, siehe ESCALATE), V15, V16, V34.

CONTEXT:
- [Fakt] Die Signierungsregel ist belegt, nicht geraten. Referenz im lokalen
  Plattform-Workspace `../NFT Data Platform`, Commit `5dda8c7`:
  `packages/security/src/index.ts` (`canonicalizeSignedRequest`,
  `createRequestSignature`, `isTimestampFresh`) und `scripts/hmac-request.ts`
  als vollständiges Aufrufbeispiel. Regel:
  `HMAC-SHA256(secret, [METHOD, pathname+search, sha256hex(body), timestampSek].join("\n"))`,
  hex-kodiert, Header `x-client-id`, `x-api-key`, `x-signature`, `x-timestamp`.
- [Fakt] Der leere Body wird als leere Zeichenkette gehasht, nicht übersprungen —
  `sha256hex("")` steht auch bei GET in der kanonischen Zeichenkette
  (`hmac-request.ts`, `normalizeBody` gibt `""` zurück).
- [Fakt] `isTimestampFresh` akzeptiert Sekunden **und** Millisekunden
  (`rawTimestamp > 10_000_000_000 ? ms : s*1000`). Die Referenz sendet Sekunden.
  Wir senden Sekunden, weil das der belegte Pfad ist.
- [Fakt] Der Replay-Schutz greift über `clientId + signature + canonicalPayload`
  mit TTL `authMaxTimestampSkewSec + 5` (`apps/web/src/lib/api-auth.ts:338-344`).
  Eine wortgleich wiederholte Anfrage ist deshalb innerhalb des Fensters immer
  ein `409`, unabhängig davon, ob sie ein Timeout oder ein Proxy ausgelöst hat.
- [Fakt] Die Fehlerantwort der Plattform hat die Form
  `{ ok: false, error: <code>, message?: <text> }` (`apps/web/src/lib/api-response.ts:19-38`).
  Der Code steht im Feld `error`, nicht in `code`.
- [Fakt] Die Codes lauten `missing_auth_headers` (401), `invalid_api_key` (401),
  `ip_not_allowed` (403), `stale_timestamp` (401), `invalid_signature` (401),
  `missing_scope` (403), `replayed_request` (409),
  `replay_guard_backend_unavailable` (503), `rate_limit_backend_unavailable` (503),
  `rate_limit_exceeded` (429), `internal_server_error` (500)
  (`apps/web/src/lib/api-auth.ts`, Zeilen 254–402).
- [Fakt] **`x-ratelimit-limit` und `x-ratelimit-remaining` hängen nur an
  Antworten, deren Authentifizierung durchlief** — an der Erfolgsantwort und an
  einem 500 aus dem Handler (`api-auth.ts:170`, `:232`). Ein `429`, `409` oder
  `403` aus `buildFailureResponse` trägt sie **nicht**. Ein `Retry-After` setzt
  die Plattform nirgends.
- [Schlussfolgerung] Daraus folgt der Zuschnitt von V34: Die Auslastung ist nur
  aus Erfolgsantworten messbar, und die Wartezeit nach einem `429` lässt sich
  nicht von der Antwort ablesen. Der Client muss sie selbst bestimmen. Das macht
  den Nebenläufigkeitsdeckel zur Hauptmaßnahme und den Backoff zum Notnagel:
  wer erst am `429` merkt, dass das Fenster voll ist, hat schon verloren.
- [Fakt] Die Plattform zählt in festen 60-Sekunden-Fenstern je Client in Redis
  (Spec V34). An der Fenstergrenze sind kurzzeitig bis 1200 Anfragen möglich,
  danach harter Stopp. Grenzen laut Entscheidung 14: `alpha-read` 600/min,
  `alpha-ops` 30/min.
- [Fakt] `vitest.config.ts` erfasst `src/**/*.test.{ts,tsx}`. Tests liegen neben
  der Quelle. Der in Plan v1 genannte Pfad `tests/unit/…` würde nicht laufen.
- [Fakt] `src/lib/api/errors.ts` führt eine `ApiError`-Hierarchie mit
  `statusCode`, `code`, `details`. Sie beschreibt Fehler **unserer** Routen
  gegenüber dem Browser.
- [Schlussfolgerung] Die Plattform-Fehler sind eine andere Achse: sie beschreiben,
  was der Upstream gesagt hat. Sie erben deshalb **nicht** von `ApiError` — sonst
  wandert ein `429` der Plattform ungefiltert als `429` an unseren Browser und
  behauptet, der Nutzer habe zu viel angefragt. Die Übersetzung in einen
  Routen-Fehler ist Sache der aufrufenden Route (A5–A9), nicht des Transports.
- [Fakt] `zod` liegt in `package.json` (`^4.2.1`) und ist die Hausvorgabe für
  alles, was von außen kommt.
- [Annahme] Die Signierungsmechanik ist zwischen Plattform-Commit `5dda8c7` und
  dem in der Spec gepinnten `7915b52` unverändert. Geführt in
  `state/assumption-ledger.md` (25.09.2026). Für A1 tragfähig, weil die Regel in
  beiden Ständen aus derselben Datei kommt; für A3 nicht.

SCOPE:
1. `src/lib/nft-data-platform/config.ts` — verzögerte, mit zod validierte
   Konfiguration. Variablen, ausschließlich serverseitig, kein `NEXT_PUBLIC_`:
   `NFT_API_BASE_URL` · `NFT_API_READ_CLIENT_ID`, `NFT_API_READ_KEY`,
   `NFT_API_READ_SECRET` · `NFT_API_OPS_CLIENT_ID`, `NFT_API_OPS_KEY`,
   `NFT_API_OPS_SECRET`. Gelesen beim ersten Aufruf, nicht auf Modulebene —
   sonst bricht der Build ohne Zugangsdaten (dieselbe Falle wie
   `state/tasks/fix-mongodb-lazy-init.md`). Fehlt eine Variable, wirft der
   **erste Aufruf** mit einer Meldung, die den Variablennamen nennt.
2. `src/lib/nft-data-platform/signing.ts` — reine Funktionen, kein I/O:
   `canonicalizeSignedRequest`, `createRequestSignature`, `buildAuthHeaders`.
   Namen und Semantik der Referenz folgen, damit ein Abgleich möglich bleibt.
3. `src/lib/nft-data-platform/errors.ts` — `PlatformError` als Basis mit
   `httpStatus`, `platformCode`, `retryable`; davon
   `PlatformAuthError` (401/403, nie wiederholen — eine neue Signatur ändert an
   einem fehlenden Scope nichts), `PlatformReplayError` (409),
   `PlatformRateLimitError` (429), `PlatformUnavailableError` (503 und
   Netzfehler), `PlatformTimeoutError`, `PlatformResponseError` (alles andere).
   Dazu `normalizePlatformFailure(status, body)`, die das Feld `error` der
   Antwort auswertet und bei unlesbarem Body nicht selbst wirft.
4. `src/lib/nft-data-platform/rate-limit.ts` — zwei Dinge, je Zugangsdatensatz
   getrennt:
   - ein Budget, gefüttert aus `x-ratelimit-limit`/`-remaining` der
     Erfolgsantworten, mit Protokollierung der Auslastung (V34),
   - ein Nebenläufigkeitsdeckel als Warteschlange. Startwerte: 8 gleichzeitige
     Anfragen für `read`, 2 für `ops`. Begründung im Dateikopf: 600/min sind
     10/s; bei 8 gleichzeitigen Anfragen müsste jede unter 800 ms liegen, um das
     Fenster zu füllen — der Deckel bremst also erst, wenn die Plattform ohnehin
     langsam ist. Für `ops` (30/min) ist 2 die entsprechende Größe.
     Beide Werte sind über die Konfiguration überschreibbar, damit die Messung
     aus V34 sie später korrigieren kann, ohne den Code anzufassen.
5. `src/lib/nft-data-platform/client.ts` — eine Funktion
   `requestPlatform(options, deps?)` mit explizitem `credentials: 'read' | 'ops'`
   (Empfehlung P8 des Plans, bewusst kein zweites Client-Objekt). Sie gibt
   `data: unknown` zurück, **keinen Generic**: ein `requestPlatform<T>` würde an
   dieser Schicht eine Typkenntnis behaupten, die erst A3 mit zod herstellt, und
   wäre im Rumpf nur über ein `as T` einzulösen — verboten nach `CLAUDE.md`.
   `deps` speist `fetch`, `sleep` und `now` ein, damit die Tests ohne Netz und
   ohne echte Wartezeit laufen. Verhalten:
   - signiert je Versuch **neu**: neuer Zeitstempel, neue Signatur,
   - Timeout über `AbortSignal.timeout`, Standardwert in der Konfiguration,
   - höchstens drei Versuche; wiederholt wird bei `409 replayed_request`,
     `429`, `503`, Timeout und Netzfehler, **nicht** bei 401/403 und nicht bei
     4xx aus dem Handler,
   - Backoff exponentiell mit vollem Jitter; bei `429` zusätzlich das Budget
     für das laufende Fenster als erschöpft markieren,
   - Antwort wird als JSON gelesen; ein nicht-JSON-Body führt zu
     `PlatformResponseError`, nicht zu einem Absturz,
   - kein Logging von `x-api-key`, Secret oder Signatur. Protokolliert werden
     Methode, Pfad, Status, Versuch, Dauer und Restbudget.
6. `src/lib/nft-data-platform/index.ts` — benannte Exporte der öffentlichen
   Oberfläche. Kein Barrel, das nur weiterreicht: die Datei existiert, damit
   `credentials` und die Fehlerklassen aus einem Ort kommen.
7. Tests, neben der Quelle:
   - `signing.test.ts`: kanonische Zeichenkette Zeichen für Zeichen; Signatur
     gegen einen aus der Referenz nachgerechneten Vektor; leerer Body bei GET;
     `search`-Teil im Pfad enthalten; zwei Aufrufe in derselben Sekunde mit
     demselben Zeitstempel ergeben dieselbe Signatur, mit verschiedenem
     Zeitstempel verschiedene.
   - `client.test.ts` gegen einen einspeisbaren `fetch`: 200 · 409 dann 200,
     mit der Zusicherung **dass sich Signatur und Zeitstempel zwischen den
     Versuchen unterschieden haben** (das ist V11s Kern, nicht der Statuscode) ·
     429 führt zu Wartezeit und nicht zu sofortiger Wiederholung · 503 endet als
     `PlatformUnavailableError` · Timeout wird neu signiert · 401 wird **nicht**
     wiederholt · `x-ratelimit-remaining` landet im Budget · der Deckel lässt
     nicht mehr als die erlaubte Zahl gleichzeitig laufen.
8. `scripts/dev/platform-smoke.ts` plus npm-Skript `platform:smoke`: fährt V11
   gegen eine erreichbare Instanz — dieselbe signierte Anfrage zweimal (409),
   danach korrekt neu signiert (200). **Nicht** Teil von `npm run check`. Fehlen
   Zugangsdaten, bricht es mit der Liste der fehlenden Variablennamen ab und
   sagt ausdrücklich, dass V11 damit ungeprüft bleibt — es meldet nie Erfolg,
   weil nichts zu tun war.
9. Dateikopf nach `docs/kommentar-standard.md` in jeder neuen Datei, mit dem
   Hinweis „server-only" dort, wo er gilt.

NICHT:
- Fachliche Endpunkt-Methoden (`getTokenDetail`, `discoverTokens`, …) oder
  `Platform*`-DTOs. Das ist A3 und braucht den geklärten Prüfstand-Commit.
- Das Feature-Flag `FEATURES.NFT_DATA_PLATFORM_ENABLED`, `scripts/check-env.js`,
  `.env.local.template`, `.env.production.template` oder
  `docs/environment/ENV_VARIABLES.md`. Das ist A2 — dieselben Variablennamen,
  aber eine andere Prüfung.
- Eine bestehende Route anfassen. A1 hat noch keinen Aufrufer, und das ist
  richtig so.
- Den Bootstrap-Client der Plattform verwenden (V15), auch nicht für den
  Smoke-Lauf.
- Ein zweites Client-Objekt je Zugangsdatensatz.
- Scopes erweitern, wenn ein Aufruf an `missing_scope` scheitert. Der Aufruf ist
  dann falsch, nicht der Scope.
- Retry-Logik in eine Abhängigkeit auslagern. Kein neues Paket.
- `npm audit fix` oder Abhängigkeiten anfassen (ADR-0002).
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Sechs neue Quelldateien,
zwei Testdateien, ein Skript, eine Zeile in `package.json`. Keine bestehende
Datei außer `package.json` wird geändert.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, dem
  gewählten Nebenläufigkeitsdeckel samt Begründung, und der ausdrücklichen
  Feststellung, welche V-Aussagen damit belegt sind und welche nicht.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- **V11 ist mit diesem Auftrag nicht erfüllt.** Belegt wird die Mechanik gegen
  einen Mock; der Lauf gegen eine echte Instanz ist nach Entscheidung E3 ein
  Skript, das ein Mensch ausführt. Wer den Auftrag abnimmt, nimmt V11 nicht ab.
  Geführt in `state/assumption-ledger.md` (25.09.2026).
- Weicht die Signierungsregel im gepinnten Prüfstand-Commit von `5dda8c7` ab:
  anhalten und melden. Dann ist die Annahme oben widerlegt und A3 hängt.
- Stellt sich beim Bauen heraus, dass ein fachlicher Endpunkt gebraucht wird, um
  irgendetwas zu prüfen: anhalten. Das ist der Zuschnitt-Fehler, den dieser
  Vertrag vermeiden soll, und kein Anlass, A3 vorzuziehen.
- `npm run check` wird rot: Befunde melden, nicht durch Anpassen der Tests oder
  durch `any` grün machen.

FOLGT:
A2 — Konfiguration, Flag, Startprüfung. Nutzt dieselben Variablennamen wie
Punkt 1 dieses Auftrags und macht sie in `npm run env:check` flag-abhängig
pflichtig; nimmt V64 (`REDIS_SSE_CHANNEL`) mit (entschieden 25.09.2026).
Offen und vor A3 fällig: der Prüfstand-Commit (V37) und der nachzuholende
Advisor-Pass auf Plan v1.
