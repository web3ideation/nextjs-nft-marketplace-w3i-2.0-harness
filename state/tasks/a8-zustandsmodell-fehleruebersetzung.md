SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a8-zustandsmodell-fehleruebersetzung

GOAL:
Ein Vertrag, den jede migrierte Route gegen sich prüfen lassen kann: welche
Datenzustände es gibt, und welcher Plattform-Fehler zu welcher Antwort führt.
Prüfbar an: für **alle sieben** Fehlerklassen aus A1 und für den
„nicht indiziert"-Fall liefert eine Funktion genau eine Antwortform mit Status,
Code, Protokollstufe · ein unbekannter Wurf landet nicht ungefiltert beim
Browser, sondern als interner Fehler · der Grep auf eine Fehlerklasse aus
`errors.ts` außerhalb von `src/lib/nft-data-platform/` ist leer, sobald die
Routen migriert sind (hier nur vorbereitet) · `npm run check` endet mit Exit 0.

V-Abdeckung: V32 (Vertragsteil). V5 wird **vorbereitet**, nicht erfüllt — die
Route dazu ist A7b.

CONTEXT:
- [Fakt] Plan v2 zieht A8 von hinten nach vorn und reduziert es auf einen
  Vertrag (`state/plan-v2-plattform-integration.md`, Paket A8). Begründung aus
  Advisor-Befund 10: A5, A7 und A9 bauen je einen eigenen Mapper, und die
  Zusammenführung von Listing, NFT-Daten und lokalen Stats existiert im Repo
  schon in `src/utils/nft/scrollItem.ts` (`mapEnrichedNFTToScrollItem`,
  `mapWalletNFTToScrollItem`, `mapWalletNFTToFilterableItem`). Ein
  `composeMarketplaceCard()` wäre eine **dritte** Abbildungsschicht für
  denselben Zweck. [Schlussfolgerung] Was fehlt, ist kein View-Composer,
  sondern ein Vertrag.
- [Fakt] Advisor-Befund 11: A1 liefert sieben unterscheidbare Fehlerklassen
  (`PlatformConfigError`, `PlatformAuthError`, `PlatformReplayError`,
  `PlatformRateLimitError`, `PlatformUnavailableError`, `PlatformTimeoutError`,
  `PlatformResponseError`), Plan v1 nannte Zustände für drei.
  [Schlussfolgerung] Vier wären als unbehandelte Ausnahme in `apiHandler`
  gelandet, also als HTTP 500 `INTERNAL_ERROR`, und V32 („statt eines
  generischen Fehlers") hätte für sie keine Deckung.
- [Fakt] Nur `PlatformUnavailableError` trägt den stabilen Code
  `PLATFORM_UNAVAILABLE` (`src/lib/nft-data-platform/errors.ts`).
- [Fakt] Die Übersetzung ist laut Kopfkommentar von `errors.ts` ausdrücklich
  „Sache der aufrufenden Route (A5–A9)". [Schlussfolgerung] Ohne eine
  gemeinsame Funktion trifft jede Route diese Entscheidung neu, und vier
  Routen treffen sie vier Mal unterschiedlich.
- [Fakt] Die verbindliche Tabelle steht in `state/plan-v2-plattform-integration.md`,
  Paket A8. Sie ist **Vorgabe dieses Auftrags**, nicht neu zu erfinden:
  `PlatformUnavailableError`, `PlatformTimeoutError`, `PlatformRateLimitError`,
  `PlatformAuthError` und `PlatformConfigError` → **503**
  `PLATFORM_UNAVAILABLE`, unterschieden nur in der Protokollstufe ·
  `PlatformReplayError` → **500** `INTERNAL_ERROR` (ein Fehler bei uns, keine
  Störung der Plattform) · `PlatformResponseError` → **502**
  `PLATFORM_RESPONSE_INVALID`, **kein** Rückfall · Plattform-404 → **404**
  `TOKEN_NOT_INDEXED` mit `refreshQueued`.
- [Schlussfolgerung] Fünf der sieben Klassen führen auf dieselbe Nutzeraussage
  und unterscheiden sich nur im Protokoll. Das ist Absicht: der Nutzer soll
  nicht lernen, welche unserer Zugangsdaten gerade abgelaufen sind, der Betrieb
  soll es sofort sehen.
- [Fakt] `src/lib/api/errors.ts` führt die `ApiError`-Hierarchie mit
  `statusCode`, `code`, `details`; `src/lib/api/handler.ts:169` reicht
  `details` **nicht** an die Antwort durch (Advisor-Befund 8c).
  [Schlussfolgerung] Dieser Auftrag baut die Übersetzung als **Daten**
  (ein Objekt mit Status, Code, Meldung, Protokollstufe), nicht als
  `ApiError`-Unterklasse. Wer die Fehlerplumbing erweitert, tut das in A7b —
  sonst wächst A8 in geteilten Code hinein, den vier Routen benutzen.
- [Fakt] V32 verlangt: bei Ausfall bleiben Übersicht, Detailseite und Kauf
  nutzbar, Metadaten aus dem Rückfallweg, **sichtbar als möglicherweise
  veraltet**; Wallet und Suche zeigen `PLATFORM_UNAVAILABLE` statt eines
  generischen Fehlers.

SCOPE:
1. `src/lib/nft-data-platform/view-state.ts` — neue Datei, zwei Typen und eine
   Funktion, nichts weiter:
   - `PLATFORM_RESPONSE_CODES` als `as const`-Objekt mit den vier Codes
     (`PLATFORM_UNAVAILABLE`, `PLATFORM_RESPONSE_INVALID`, `TOKEN_NOT_INDEXED`,
     `INTERNAL_ERROR`) plus abgeleiteter Typ.
   - `PlatformFailureResponse` — `httpStatus`, `code`, `message` (für den
     Nutzer, ohne Interna), `logLevel` (`'debug' | 'warn' | 'error'`),
     `allowLocalFallback: boolean`. Das letzte Feld ist der Kern: bei
     `PLATFORM_RESPONSE_INVALID` ist es `false`, weil wir nicht wissen, was wir
     bekommen haben — in allen `PLATFORM_UNAVAILABLE`-Fällen `true`.
   - `translatePlatformError(error: unknown): PlatformFailureResponse` nach der
     Tabelle aus CONTEXT. Nimmt `unknown`, nicht `PlatformError`: ein
     unbekannter Wurf muss hier landen können und wird zu 500
     `INTERNAL_ERROR`. Reihenfolge der Prüfungen so, dass
     `PlatformConfigError` **vor** einer allgemeinen `PlatformError`-Prüfung
     greift (es erbt davon).
   - `ViewDataState` als unterschiedener Verbund über die sechs Zustände aus
     Plan v2: `complete`, `listing-without-token`, `holding-without-token`,
     `token-without-collection`, `not-indexed` (mit `refreshQueued: boolean`),
     `platform-unavailable` (mit `fallbackUsed: boolean`).
   - `TokenNotIndexedPayload` plus `buildTokenNotIndexedPayload(...)` mit genau
     den Feldern aus V5: `code`, `refreshQueued`, `refreshJobId`,
     `contractAddress`, `tokenId`, `chainId`. `refreshQueued` ist **immer**
     `false`, wenn die Collection außerhalb der Diamond-Whitelist liegt — der
     Aufrufer übergibt das als Parameter, die Whitelist-Lesung selbst ist A4a.
2. `src/lib/nft-data-platform/view-state.test.ts`:
   - je einen Fall für **alle sieben** Fehlerklassen, der Status, Code,
     Protokollstufe und `allowLocalFallback` prüft.
   - ein `new Error('irgendwas')` → 500 `INTERNAL_ERROR`, und ein
     `undefined`/`null`-Wurf ebenso: die Funktion darf selbst nie werfen.
   - `PlatformRateLimitError` ergibt **nicht** 429. Eigener Test mit Begründung
     im Testnamen — das ist die Stelle, an der ein späterer Umbau am ehesten
     „aufräumt" und damit eine falsche Aussage an den Browser schickt.
   - `PlatformResponseError` ergibt `allowLocalFallback: false`.
   - `buildTokenNotIndexedPayload` mit Whitelist-Flag an und aus.
3. `src/lib/nft-data-platform/index.ts`: die neue Oberfläche benannt
   exportieren.
4. Dateikopf nach `docs/kommentar-standard.md`, mit der Tabelle als Kommentar
   in der Datei — wer die Funktion liest, soll die Entscheidung sehen, ohne
   Plan v2 aufzuschlagen.

NICHT:
- Eine Route anfassen. A8 hat noch keinen Aufrufer, und das ist richtig: es ist
  ein Vertrag, kein Vorratsbau.
- `src/lib/api/errors.ts`, `handler.ts` oder `responses.ts` erweitern. Die
  fehlende `details`-Durchreichung ist Advisor-Befund 8c und gehört zu A7b.
- Eine `ApiError`-Unterklasse für Plattform-Fehler bauen. Die Begründung dagegen
  steht im Kopf von `errors.ts` und gilt weiter.
- `src/utils/nft/scrollItem.ts` anfassen oder ersetzen. Die Entscheidung, ob
  diese Schicht bleibt, gehört zu A5/A7a, wenn ein Mapper daneben steht.
- Einen View-Composer (`composeMarketplaceCard`, `composeWalletNFT`) bauen. Plan
  v2 hat ihn aus genau dem Grund gestrichen, dass er eine dritte
  Abbildungsschicht wäre.
- Die Zustandsliste erweitern. Sechs Zustände, mehr nicht — jeder weitere
  braucht einen Aufrufer, der ihn belegt.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Eine neue Quelldatei, eine
neue Testdatei, ein Export. Klein und absichtlich klein.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, und der
  Tabelle in ihrer umgesetzten Form, damit sie gegen Plan v2 abgeglichen werden
  kann.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Die Tabelle aus Plan v2 lässt sich nicht widerspruchsfrei umsetzen, weil zwei
  Klassen dieselbe Antwort und dieselbe Protokollstufe bekommen müssten:
  melden, nicht stillschweigend zusammenlegen. Dann ist eine Klasse aus A1
  überflüssig, und das ist ein Befund über A1, keine Entscheidung in A8.
- Es stellt sich heraus, dass eine Route die Übersetzung nicht als Daten
  brauchen kann, sondern als Wurf: anhalten. Dann ist der Zuschnitt falsch und
  A8 gehört doch in die Fehlerplumbing (A7b).
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
A3 — Normalisierung, DTOs, Cursor (Prüfstand `5dda8c7`, E5 entschieden). Danach
A4a — serverseitige Whitelist-Quelle, die echte Voraussetzung aller Routen.
Offen: E8 (blockiert A7c), E1 (fällig vor A6), E2 (vor Tor T1). Die Spec pinnt
nach E5 noch `7915b52` — eigener, kleiner Nachtrag.
