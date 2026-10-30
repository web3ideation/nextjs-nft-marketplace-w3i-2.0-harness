SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a3a-cursor-dto-token-collection

GOAL:
Typisierte, mit zod geprüfte Lesezugriffe auf Token, Collections, Ownership und
Suche — mit Cursor-Paginierung, die nachweislich blättert. Prüfbar an: kein
Aufrufer außerhalb von `src/lib/nft-data-platform/` ruft `requestPlatform`
direkt · eine Antwort mit unbekannten Zusatzfeldern wird **nicht** abgewiesen ·
eine Antwort, in der ein gebrauchtes Feld fehlt, wird **laut** abgewiesen · die
zweite Seite enthält andere Elemente als die erste · `npm run check` endet mit
Exit 0.

V-Abdeckung: V12, V13 (Leseteil). Der Schreib- und Inventarteil ist A3b.

CONTEXT:
- [Fakt] Prüfstand ist die Plattform-`main`, derzeit `5df7493` (Entscheidung E5,
  **korrigiert** am 27.10.2026 — die erste Fassung hatte einen unvereinten
  Feature-Branch für den Plattform-Stand gehalten). Im Datenpfad ist `main`
  identisch mit dem von der Spec gepinnten `7915b52`.
- [Fakt] Erfolgsantworten haben die Form `{ ok: true, ...payload }`
  (`apps/web/src/lib/api-response.ts`, `buildApiSuccessResponse`). Es gibt
  **keine** `data`-Hülle — die Nutzlast liegt flach neben `ok`.
- [Fakt] Listen-Nutzlasten tragen `items` und `pageInfo: { limit, hasMore,
  nextCursor }` (`apps/web/src/app/api/v1/collections/route.ts:58-65`).
- [Fakt] Der Cursor ist base64url über `{ updatedAt, id }`
  (`apps/web/src/lib/cursor-pagination.ts`, `encodeUpdatedAtCursor`).
  [Schlussfolgerung] Für uns ist er eine **undurchsichtige Zeichenkette**. Wer
  ihn dekodiert, bindet sich an ein Implementierungsdetail der Plattform, das
  sich ohne Vertragsbruch ändern kann.
- [Fakt] `limit` wird serverseitig als `z.coerce.number().int().positive().max(200).default(50)`
  geparst (Owners-Route Zeile 19-22, Collections analog).
  [Schlussfolgerung] Werte über 200 werden **nicht** abgewiesen, sondern
  gedeckelt. Ein Client, der 500 anfragt und 200 bekommt, hält den Rest für
  nicht existent — der Client muss den Deckel selbst kennen.
- [Fakt] Die Token-Form ist `TokenDocument` mit hexifizierten ObjectIds plus
  zwei abgeleiteten Feldern: `creator` (`{ name, address, source } | null`,
  aus dem Metadaten-Payload geraten) und `media: { image, animation, audio }`,
  je ein serialisiertes `MediaAssetDocument` oder `null`
  (`apps/web/src/lib/token-response.ts`, `packages/db/src/index.ts:100-132`).
- [Fakt] Der Medien-Block trägt `cdnUrlOriginal`, `cdnUrlOptimized`,
  `cdnUrlThumbnail` (je `string | null`), dazu `mimeType`, `width`, `height`,
  `durationSec`, `status` (`packages/db/src/index.ts:163-184`). Das ist die
  Quelle für V31; weder Routencode noch Browser ruft `/api/media`.
- [Fakt] `metadataPayload` ist `Record<string, unknown> | null` — beliebige
  NFT-Metadaten. [Schlussfolgerung] Dieses Feld wird **nicht** durchgeprüft;
  ein Schema, das es validiert, bricht am ersten ungewöhnlichen NFT.
- [Fakt] Datumsfelder (`createdAt`, `updatedAt`, `lastMetadataFetchAt`, …)
  gehen durch `Response.json`, kommen also als ISO-**Zeichenketten** an, nicht
  als `Date`.
- [Fakt] Die Ownership-Antwort trägt `standard` auf oberster Ebene neben
  `items` und `pageInfo`
  (`apps/web/src/app/api/v1/owners/[chainId]/[contractAddress]/[tokenId]/route.ts:76-80`).
  [Schlussfolgerung] Welche Form `items` hat, hängt vom `standard` ab: bei
  ERC-721 höchstens ein Eigentümer-Dokument, bei ERC-1155 Guthaben-Zeilen. Das
  gehört in den Typ, nicht in eine Fußnote.
- [Fakt] Die Plattform ignoriert unbekannte Abfrageparameter **still** und
  antwortet `200` mit einer ungefilterten ersten Seite (Plan v1/v2, A3).
  [Schlussfolgerung] Ein Test, der nur „Anfrage erfolgreich" prüft, belegt
  nichts.
- [Fakt] Der Transport steht: `requestPlatform(options, deps)` aus Paket A1
  gibt `data: unknown` zurück, bewusst ohne Generic. Die Formprüfung ist genau
  diese Aufgabe hier.
- [Fakt] `zod` liegt in `package.json` (`^4.2.1`).

SCOPE:
1. `src/lib/nft-data-platform/cursor.ts` — Cursor als undurchsichtiger Wert:
   ein Markentyp `PlatformCursor`, eine Funktion zum Anhängen an eine
   Abfragezeichenkette, und `PLATFORM_MAX_LIMIT = 200` samt einer Funktion, die
   einen gewünschten Umfang auf den Deckel bringt und das **meldet**, statt
   stillschweigend weniger zu liefern. Begründung im Dateikopf: die Plattform
   deckelt still, und ein Aufrufer, der 500 anfragt und 200 bekommt, hält den
   Rest für nicht existent.
2. `src/lib/nft-data-platform/schemas.ts` — zod-Schemata für die Leseformen:
   Erfolgs-Hülle (`ok: true` plus Nutzlast), `pageInfo`, Medien-Asset, Token,
   Collection, Ownership-Antwort (unterschieden nach `standard`), Suchantwort.
   **Leitregel, im Dateikopf festzuhalten: die Schemata PICKEN, sie prüfen
   nicht alles ab.** zod wirft unbekannte Schlüssel ab, und genau das ist hier
   richtig: fügt die Plattform ein Feld hinzu, brechen wir nicht; entfernt sie
   ein Feld, das wir brauchen, bricht es laut. `metadataPayload` bleibt
   ungeprüft (`z.record(z.string(), z.unknown()).nullable()`).
   Datumsfelder sind Zeichenketten, nicht `Date`.
3. `src/lib/nft-data-platform/types.ts` — die aus den Schemata **abgeleiteten**
   Typen (`z.infer`), nicht von Hand gepflegte Zwillinge. Namensschema
   `Platform*` wie im Migrationsdokument.
4. `src/lib/nft-data-platform/read.ts` — die fünf Methoden, jede mit
   `credentials: 'read'`:
   `getTokenDetail({ chainId, contractAddress, tokenId })` ·
   `getTokenOwners({ chainId, contractAddress, tokenId, cursor?, limit? })` ·
   `listCollections({ cursor?, limit? })` ·
   `getCollectionDetail({ chainId, contractAddress })` ·
   `searchEntities({ query, cursor?, limit? })`.
   Jede prüft die Antwort mit ihrem Schema und wirft bei Formabweichung einen
   `PlatformResponseError` mit der zod-Fundstelle in der Meldung — nicht einen
   nackten zod-Fehler, sonst landet er im 500er-Default der A8-Tabelle.
   Ein `404` der Plattform bleibt ein `PlatformResponseError` mit
   `httpStatus: 404`; A8 übersetzt ihn zu `TOKEN_NOT_INDEXED`. Hier **nichts**
   umdeuten.
5. `src/lib/nft-data-platform/index.ts` — die neuen Methoden und Typen
   exportieren.
6. Tests neben der Quelle:
   - `schemas.test.ts`: eine Antwort mit **zusätzlichen** Feldern wird
     angenommen und die Zusatzfelder fallen weg · eine Antwort ohne ein
     gebrauchtes Feld wird abgewiesen · `metadataPayload` mit tief
     verschachteltem Unsinn wird angenommen · Datumsfelder bleiben
     Zeichenketten · ein Medien-Block ohne CDN-URLs ergibt `null`-Werte, nicht
     einen Fehler.
   - `read.test.ts` gegen den eingespeisten Transport aus A1: je Methode ein
     Erfolgsfall mit geprüftem Pfad und Zugangsdatensatz · **Pflichttest zur
     Paginierung: zweite Seite enthält andere Elemente als die erste**, geprüft
     daran, dass der zweite Aufruf den `nextCursor` des ersten im Pfad trägt und
     andere `items` zurückgibt · ein Umfang über 200 wird gedeckelt und das
     gemeldet · eine Antwort mit fehlendem Feld ergibt `PlatformResponseError`,
     nicht einen zod-Fehler.
7. Dateikopf nach `docs/kommentar-standard.md` in jeder neuen Datei.

NICHT:
- `getWalletInventory`, `discoverTokens`, `discoverWalletHoldings`,
  `queueTokenRefresh`, `queueCollectionRefresh`. Das ist **A3b**, und es liegt
  hinter A4a, weil Discover und Refresh auf der Plattform Arbeit auslösen.
- Den Cursor dekodieren oder seinen Inhalt auswerten.
- `metadataPayload` oder `attributes` inhaltlich validieren. Attribute sind eine
  Liste, mehr prüfen wir nicht.
- Eine Route anfassen. A3a hat noch keinen Aufrufer außer den Tests.
- Einen Zwischenspeicher einbauen. Der gehört in die Routen beziehungsweise in
  die E1-Entscheidung, nicht in die Client-Schicht.
- Die A1-Transportschicht ändern: keine neuen Fehlerklassen, kein anderer
  Backoff, kein anderer Deckel.
- Von Hand gepflegte Typen neben den Schemata. Eine Quelle, abgeleitete Typen.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Vier neue Quelldateien,
zwei neue Testdateien, ein Export. Fünf Methoden, nicht zehn — das war der
Grund für die Teilung in A3a und A3b.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, der
  Liste der geprüften Felder je Schema, und dem Ergebnis des
  Paginierungs-Pflichttests.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Eine der fünf Antwortformen weicht im Plattform-Code von diesem Vertrag ab:
  anhalten und melden. Der Vertrag ist gegen `main` erhoben; weicht er ab, hat
  sich die Plattform bewegt, und das betrifft dann auch A7a und A9.
- Ein Schema lässt sich nur mit `any` oder einer Typzusicherung schreiben:
  anhalten. Dann ist die Form unklar und nicht die Typisierung das Problem.
- Der Paginierungs-Pflichttest lässt sich gegen den Mock nicht sinnvoll bauen,
  weil die zweite Seite nur von echten Daten abhängt: melden, nicht durch einen
  Test ersetzen, der bloß „Anfrage erfolgreich" prüft. Genau diese Fehlerform
  ist der Grund für den Pflichttest.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
A4a — serverseitige Whitelist-Quelle und Filter, die echte Voraussetzung aller
Routen. Danach A3b (Wallet, Discover, Refresh) sowie A7a, A9 und A11, die nach
A3a parallelisierbar sind.
Offen: E8 (blockiert A7c), E1 (fällig vor A6), E2 (vor Tor T1), die
V63-Prämisse auf dem unvereinten Plattform-Branch (fällig vor A4b/A4c) und
Review-Befund 8 (fällig vor A5).
