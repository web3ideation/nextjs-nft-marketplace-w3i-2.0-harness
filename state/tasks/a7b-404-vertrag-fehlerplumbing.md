SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a7b-404-vertrag-fehlerplumbing

GOAL:
Ein Token, das die Plattform nicht kennt, erzeugt HTTP 404 mit dem Vertrag aus
V5, und die Oberfläche sagt „wird noch erfasst" statt „gibt es nicht". Prüfbar
an: ein Plattform-404 ergibt `code: "TOKEN_NOT_INDEXED"` samt `refreshQueued`,
`refreshJobId`, `contractAddress`, `tokenId`, `chainId` **in der Antwort** ·
`refreshQueued` ist außerhalb der Diamond-Whitelist **immer** `false` (V33) ·
`UnifiedListingForm` zeigt bei diesem Fall keinen „NFT nicht gefunden"-Text ·
ein `ValidationError` trägt seine Details jetzt ebenfalls bis zum Browser ·
`npm run check` endet mit Exit 0.

V-Abdeckung: V5, V33 (Prüfkriterium), Advisor-Befunde 8c und 8d.

CONTEXT:
- [Fakt] `src/lib/api/responses.ts:183-195` — `createErrorResponse` **hat**
  einen vierten Parameter `metadata?: Record<string, any>` und setzt ihn nur,
  wenn er da ist. [Fakt] `src/lib/api/handler.ts:169` ruft
  `createErrorResponse(error.message, error.statusCode, error.code)` und
  übergibt ihn **nicht**. [Schlussfolgerung] Der Fix ist eine Zeile, und er ist
  rein additiv: `metadata` erscheint nur, wenn ein Fehler `details` trägt.
- [Fakt] **Nebenbefund derselben Zeile:** `ValidationError`
  (`src/lib/api/errors.ts:71-76`) setzt `details: { validation: … }` — und
  verliert sie heute still. Jede Route, die `details` an einen Fehler hängt,
  wirft sie weg. [Schlussfolgerung] Nach diesem Auftrag tragen
  Validierungsfehler ein `metadata`-Feld, das sie vorher nicht hatten. Additiv,
  aber eine sichtbare Änderung an Antworten außerhalb dieses Pakets — gehört in
  den Bericht.
- [Fakt] Entscheidung des Menschen vom 27.10.2026: `handler.ts` reicht `details`
  durch. Verworfen wurden eine eigene `NextResponse` in der Route (weicht von
  `ARCHITECTURE.md` ab und wiederholt sich in A5 und A11) und eine eigene
  Fehlerklasse mit eigenem Zweig (Sonderfall im geteilten Code).
- [Fakt] `NotFoundError` (`src/lib/api/errors.ts:40-45`) nimmt nur eine
  Nachricht, kein `details`. [Schlussfolgerung] Sie muss es annehmen können,
  sonst nützt die durchgereichte `metadata` hier nichts.
- [Fakt] `buildTokenNotIndexedPayload` aus Paket A8 baut den Körper mit genau
  den sechs Feldern aus V5 und setzt `refreshQueued` **immer** `false`, wenn die
  Collection nicht auf der Whitelist steht.
- [Fakt] `isCollectionWhitelisted` aus Paket A4a ist die serverseitige Quelle
  dafür. [Schlussfolgerung] **Hier** ist die Stelle, an der der Filter
  hingehört — nicht in A7a, wo nur gelesen wird (dort korrigiert am 27.10.2026).
- [Fakt] Ein Plattform-404 kommt als `PlatformResponseError` mit
  `httpStatus: 404` an, und `translatePlatformError` übersetzt ihn zu
  `TOKEN_NOT_INDEXED` mit `allowLocalFallback: false`.
  [Schlussfolgerung] Die Route darf im 404-Fall **nicht** auf `nft_metadata`
  zurückfallen: „noch nicht indiziert" ist eine Auskunft, kein Ausfall.
- [Fakt] **Ein Refresh wird in diesem Auftrag nicht ausgelöst.**
  `queueTokenRefresh` gehört zu A3b, die Kopplung an Ereignisse zu A4b.
  [Schlussfolgerung] `refreshQueued` ist vorerst immer `false` und
  `refreshJobId` immer `null`. V5 ist damit **zur Hälfte** erfüllt: der Vertrag
  steht, der Auftrag wird noch nicht gestellt. Das gehört in den Bericht und in
  den Ledger, nicht in eine Fußnote.
- [Fakt] Von den vier Aufrufern der Route behandeln nur zwei einen 404 gesondert:
  `useMarketplaceItemDetail.ts:92-94` fällt auf Wallet-Daten zurück — das ist
  unabhängig vom Grund richtig und **bleibt unverändert** —, und
  `UnifiedListingForm.tsx:307-311` wirft „NFT nicht gefunden. Bitte
  Contract-Adresse und Token-ID prüfen." `CartContext` und `CartPage` prüfen nur
  generisch `!response.ok`. [Schlussfolgerung] Genau **eine** Aufrufer-Änderung
  ist nötig. Entscheidung 6 der Spec sagt: „`404` von der Plattform heißt ‚noch
  nicht indiziert', nicht ‚Token existiert nicht'" — und heute sagt die
  Oberfläche einem Verkäufer das Gegenteil über sein eigenes NFT.

SCOPE:
1. `src/lib/api/handler.ts`: im `ApiError`-Zweig `error.details` als vierten
   Parameter übergeben. `details` ist `unknown`, `metadata` erwartet ein Objekt
   — also verengen, nicht zusichern: nur ein nicht-null Objekt, das kein Array
   ist, wird übergeben, sonst `undefined`. Kommentar dazu, warum das
   Durchreichen vorher fehlte und was es jetzt zusätzlich sichtbar macht.
2. `src/lib/api/errors.ts`: `NotFoundError` nimmt ein optionales `details`
   entgegen und gibt es an `ApiError` weiter. Signatur bleibt
   rückwärtskompatibel (zweiter Parameter, optional).
3. `src/app/api/nft/detail/route.ts`: im Plattform-Pfad den 404 vom Ausfall
   trennen. Bei `code === PLATFORM_RESPONSE_CODES.notIndexed`:
   - `isCollectionWhitelisted(normalizedAddress)` befragen,
   - `buildTokenNotIndexedPayload({ contractAddress, tokenId, chainId,
     isWhitelisted, refreshJobId: null })`,
   - `NotFoundError` mit dieser Nutzlast werfen; **kein** Rückfall auf
     `nft_metadata`.
   Die übrigen Fehlerfälle bleiben, wie A7a sie gebaut hat.
4. `src/app/sell/components/forms/UnifiedListingForm.tsx`: den 404-Zweig
   unterscheiden. Trägt der Körper `code: 'TOKEN_NOT_INDEXED'`, lautet die
   Meldung, dass das NFT noch erfasst wird und es in Kürze erneut versucht
   werden kann — **nicht**, dass es nicht existiert. Ohne diesen Code bleibt die
   alte Meldung, denn dann ist es tatsächlich ein Eingabefehler.
5. Tests:
   - `src/lib/api/handler.test.ts` (neu): ein `ApiError` mit `details` ergibt
     `metadata` in der Antwort · ohne `details` **kein** `metadata`-Feld
     (Rückwärtskompatibilität) · `details` als Zeichenkette oder Array wird
     nicht übergeben.
   - `src/app/api/nft/detail/route.test.ts` (erweitern): Plattform-404 mit
     Collection **auf** der Whitelist → 404, `code: 'TOKEN_NOT_INDEXED'`,
     `refreshQueued: false`, `refreshJobId: null`, alle sechs Felder vorhanden ·
     Plattform-404 **außerhalb** der Whitelist → `refreshQueued: false` (V33) ·
     Plattform-404 löst **keinen** Rückfall auf `nft_metadata` aus (der lokale
     Name erscheint nicht in der Antwort).
6. Dateikopf-Ergänzungen, wo sich der Zweck verschiebt.

NICHT:
- `queueTokenRefresh` aufrufen oder einen Refresh auslösen. A3b und A4b.
- `useMarketplaceItemDetail.ts`, `CartContext.tsx` oder `CartPage.tsx` anfassen.
  Der Wallet-Rückfall im Hook ist unabhängig vom Grund richtig; die anderen zwei
  behandeln 404 nicht gesondert.
- Die Fehlerhülle `{ success, error, code, metadata }` umbauen. Vier Felder
  bleiben vier Felder.
- `apiTooManyRequests` oder den `RateLimitError`-Zweig anfassen.
- Das `as any` an den Rückgaben in `handler.ts` entfernen. Altbestand, eigener
  Auftrag — und ein Umbau der Rückgabetypen des Handlers berührt jede Route.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Zwei geänderte Dateien im
geteilten API-Code (je wenige Zeilen), eine geänderte Route, eine geänderte
Komponente, eine neue Testdatei, eine erweiterte.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, dem
  404-Antwortkörper im Wortlaut, und der ausdrücklichen Feststellung, dass V5
  nur zur Hälfte erfüllt ist (Vertrag ja, Auftragsstellung nein) samt
  Ledger-Eintrag.
- Der Hinweis, dass Validierungsfehler ab jetzt ein `metadata`-Feld tragen.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Eine bestehende Route oder ein Test hängt daran, dass `metadata` **nicht**
  erscheint: anhalten und melden. Dann ist das Durchreichen nicht additiv und
  die Entscheidung ist neu zu treffen.
- Der Whitelist-Aufruf in der Detailroute erzeugt messbar Last (eine RPC-Lesung
  je 404): melden. Der Zwischenspeicher aus A4a soll das abfangen; tut er es
  nicht, ist die Frist falsch gewählt.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
A7c — Chain- und Approval-Block, hängt an E8.
Parallel: A9 (Collections), A11 (Übersicht, mit Aufrufzahl-Beleg vorab), A3b
(Wallet, Discover, Refresh) — und erst mit A3b wird `refreshQueued` wahr werden
können.
