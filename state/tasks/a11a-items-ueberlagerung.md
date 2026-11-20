SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a11a` sein (von `main` abgezweigt; existiert er nicht,
anlegen). Danach `npm run check` laufen lassen (erwartet: Exit 0). Ist er rot,
anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a11a-items-ueberlagerung

GOAL:
`/api/marketplace/items` überlagert die Anzeigewerte (`metadata`, `contract.name`,
`contract.symbol`) der gelieferten Seite aus der Plattform, **feldweise**, mit
**höchstens einem** `discoverTokens`-Aufruf je Anfrage, kurzer Zeitgrenze und lokalem
Rückfall. Prüfbar an: eine Seite mit 20 und eine mit 100 Karten erzeugen **je einen**
`discoverTokens`-Aufruf · Flag aus und `platformOverlay=false` erzeugen **null** ·
Plattformausfall ergibt 200 mit lokalen Werten und `staleWarning: true` · ein Feld, das die
Plattform leer oder `null` liefert, lässt den lokalen Wert stehen · `owner`, `tokenURI`,
`totalSupply` bleiben lokal · `npm run check` endet mit Exit 0.

**Dieses Paket wird nicht ausgeliefert, bevor A11b steht.** Das Flag bleibt aus.

V-Abdeckung: Zielbild Abschnitt 2 (Übersicht), V32 (Rückfallweg), V22 (Aufrufzahl).

CONTEXT:
- [Fakt] Maßgeblich ist `state/plan-v2-a11-marketplace-items.md` (Advisor-Pass vom 19.11.2026,
  Vorschläge vom Menschen bestätigt), dort Abschnitte 2–4, 8, 9, 11. Befunde in
  `state/advisor-findings-a11-marketplace-items.md`. v1
  (`state/tasks/a11-marketplace-items-plattform-lesen.md`) ist überholt, nur noch Verlauf.
- [Fakt] `POST /api/v1/tokens/discover` (Plattform `cea0ea4`): bis 500 Identitäten, bekannte
  Token als `ready` mit `token` und `collection`, unbekannte als eingereihter Job. Unser Client:
  `discoverTokens` in `src/lib/nft-data-platform/write.ts` (stückelt, filtert vorher gegen die
  Diamond-Whitelist). Mapper aus A7a: `mapPlatformTokenToMetadata`, `mapPlatformToContract` in
  `mappers/token-detail.ts`.
- [Fakt] Die Route wählt, filtert und sortiert in MongoDB (`$lookup` auf `nft_metadata`,
  `metadataFilters`, `sortName`) und liefert `metadata` und `contract` aus `$nftData`
  (`src/app/api/marketplace/items/route.ts`, Zeilen ~270, ~427–428, ~484, ~544).
  [Schlussfolgerung] Überlagert wird **nach** `$limit`, nur für die schon gewählte Seite. Suche
  und Namenssortierung bleiben lokal.
- [Fakt, Advisor] `ready` heißt nicht anzeigefertig: `mapPlatformTokenToMetadata` liefert
  `name: null` und `image: ''`, wenn die Plattform noch keine Medien hat;
  `mapPlatformToContract` ohne Guthaben liefert `owner`, `ownerBalance`, `tokenURI: null` und
  kein `totalSupply`. Die Liste liest diese Felder in `utils/nft/scrollItem.ts:82-84, 143-145`.
  [Schlussfolgerung] Ein Blockersatz würde bessere lokale Werte durch ärmere ersetzen. Deshalb
  feldweise.
- [Fakt, Advisor] Der Client wartet bei Timeout, 5xx und Netzfehler bis zu 3 × 10 s (`config.ts`:
  `timeoutMs`, `maxAttempts`); jeder Versuch ist ein **neuer signierter POST**, bei Discover also
  neue schreibende Last (`client.ts:412–556`). `timeoutMs` gibt es schon je Anfrage in
  `PlatformRequestOptions` (`client.ts:76`); `maxAttempts` kommt nur aus der Konfiguration
  (`client.ts:412, 465, 498, 552`). `discoverTokens(identities, deps)` reicht keine Option durch.
- [Fakt] Die Identität kommt aus der Pipeline: `resolvedContractAddress` und `resolvedTokenId`
  (`$toString`). `item.tokenId` bleibt im Originaltyp. Beide Schreiber setzen `chainId` hart auf
  Sepolia (`event-mongodb-sync.ts:~31`, `graph-subscription.ts:~212-223`); Altdokumente tragen sie
  womöglich nicht. [Fakt] Die Detailroute nimmt `getChainConfig().chain.id`
  (`nft/detail/route.ts:~131`).
- [Fakt, Advisor] Aufrufer der Route: `useMarketplaceItems.ts:242`, `app/page.tsx:17`,
  `init-services.ts:59` (Vorwärmung), `CollectionItemsList.tsx:52`, und
  `src/contexts/wallet-nfts/WalletNFTsService.ts:624` (`limit=100`, nutzt nur Listing-Felder).
  Letzterer braucht die Überlagerung **nicht**.
- [Fakt] `MarketplaceItemsResponse` (`src/types/marketplace/enriched-nft.ts:227`) kennt `dataSource`
  und `staleWarning` nicht. [Schlussfolgerung] Ein Objektliteral mit den Feldern ist ein
  Excess-Property-Fehler, `npm run check` würde rot.
- [Fakt] Muster für Tor, Fehlerübersetzung und Hüllfelder: `src/app/api/nft/detail/route.ts`
  (~127–195) und `src/app/api/collections/route.ts` (A9). Test-Vorlage:
  `src/app/api/collections/route.test.ts` (mockt `@/lib/mongodb` und die Plattform-Lesemethode,
  prüft „genau EINEN Aufruf"). Es gibt noch keine `route.test.ts` unter `items/`.
- [Fakt] Die Route ist 780+ Zeilen mit durchgehend `any`. [Schlussfolgerung] Altbestand nach der
  Geltungsgrenze in `CLAUDE.md`: **kein neues** `any`, bestehendes nicht aufräumen.
- [Annahme] Ein Bündelaufruf zählt im Fensterlimit als **einer**. Ungeprüft, siehe ESCALATE.

SCOPE:
1. `src/lib/nft-data-platform/client.ts`: `maxAttempts?: number` in `PlatformRequestOptions`,
   statt `config.maxAttempts` verwendet, wenn gesetzt (alle vier Stellen). Test in
   `client.test.ts`: ein Versuch bei `maxAttempts: 1`, auch bei 5xx und Timeout.
2. `src/lib/nft-data-platform/write.ts`: `discoverTokens(identities, deps?, options?)` mit
   `options: { timeoutMs?: number; maxAttempts?: number; signal?: AbortSignal }`, durchgereicht an
   `requestPlatform`. **Dritter** Parameter, damit bestehende Aufrufer unverändert bleiben. Test in
   `write.test.ts`.
3. `src/lib/nft-data-platform/mappers/marketplace-items.ts` — neu:
   - `buildItemOverlayMap(requestedKeys, discoverItems)` → `{ overlays, notOverlaid }`.
     Schlüssel `chainId:contractAddress(klein):tokenId` (Zeichenkette unverändert).
     `overlays` nur für `discoveryStatus === 'ready'` mit gesetztem `token`; `notOverlaid` =
     jeder **angefragte** Schlüssel ohne Überlagerung (`queued`, `failed`, `ready` ohne `token`,
     nicht in der Antwort). Deshalb bekommt die Funktion die angefragten Schlüssel.
   - `applyItemOverlay(item, overlay)` (rein): `metadata` feldweise — ein Feld der Plattform
     ersetzt das lokale nur bei brauchbarem Wert (nicht `null`, nicht leer); `contract` **nur**
     `name` und `symbol`, alles andere (`owner`, `tokenURI`, `totalSupply`, …) bleibt lokal.
   - Mit den Mappern aus A7a bauen, kein zweiter Mapper.
4. `src/app/api/marketplace/items/route.ts`, **nach** dem Aggregationslauf, **vor** dem Schreiben
   in den Antwort-Cache:
   - Tor: `isPlatformConfigured()` und Anfrageparameter `platformOverlay !== 'false'`.
   - Identitäten aus `resolvedContractAddress` und `resolvedTokenId`, Kette
     `getChainConfig().chain.id`; ein Eintrag mit abweichender `chainId` wird ausgelassen und
     zählt als nicht überlagert. **Deduplizieren** vor dem Aufruf.
   - **Ein** `discoverTokens`-Aufruf mit `{ timeoutMs: 3000, maxAttempts: 1 }`; die Werte als
     benannte Konstanten mit Begründung.
   - Fehler über `translatePlatformError`; auch bei `allowLocalFallback: false` **nicht**
     werfen, sondern 200 mit lokalen Werten und `staleWarning: true` (Abweichung von der
     Detailseite im Kommentar begründen, `PlatformResponseError` bleibt auf Stufe `error`).
   - `dataSource` (`'platform' | 'local-fallback'`) und `staleWarning` neben `items`,
     `pagination`, `filters`. `staleWarning` ist wahr, wenn mindestens eine Karte **gar nicht**
     überlagert werden konnte oder der Aufruf scheiterte; ein lokal gebliebenes **Feld** löst es
     **nicht** aus.
   - **Vorläufige Cache-Regel (A11b ersetzt sie):** eine Antwort mit `staleWarning: true` wird
     nicht in den Antwort-Cache geschrieben.
   - Die lokalen `$lookup`s bleiben vollständig.
5. `src/types/marketplace/enriched-nft.ts`: `dataSource?` und `staleWarning?` an
   `MarketplaceItemsResponse['data']`.
6. `src/contexts/wallet-nfts/WalletNFTsService.ts:624`: Aufruf um `&platformOverlay=false`
   ergänzen. Nur diese Zeile.
7. Tests:
   - `mappers/marketplace-items.test.ts` (neu): nur `ready` mit `token` überlagert · Schlüssel
     klein · `queued`, `failed`, `ready` ohne `token` und nicht Geantwortetes landen in
     `notOverlaid` · `name: null` und leeres Bild lassen den lokalen Wert stehen · `contract`
     überlagert nur `name` und `symbol` · leere Eingabe.
   - `src/app/api/marketplace/items/route.test.ts` (neu; Vorlage
     `collections/route.test.ts`; zu mocken: `dev-services-auto-start`, `shared-cache`,
     `isCollectionWhitelisted`, `getDatabase`; `includeFilters=false` oder `vi.resetModules`
     wegen des Prozess-`filterOptionsCache`): **der wichtigste Test** — 20 und 100 Karten ergeben
     **je einen** `discoverTokens`-Aufruf · doppelte Identitäten werden einmal gesendet ·
     `platformOverlay=false` und Flag aus ergeben null Aufrufe und `local-fallback` · Ausfall
     ergibt 200, lokale Werte, `staleWarning: true` · `queued` behält den lokalen Namen · Antwort
     mit `staleWarning` wird nicht gecacht · Aufruf trägt `timeoutMs: 3000, maxAttempts: 1`.
     Suche und Namenssortierung: **Struktur-Test** der gebauten Pipeline (`$match` auf
     `metadata.name`, `$sort` auf `sortName`) — kein Verhaltenstest, das ist mit gemocktem
     `aggregate` nicht möglich.
8. Dateikopf der Route: woher `metadata` und `contract.name/symbol` jetzt kommen, die Aufrufzahl
   mit Belegstelle (Plattform-Discover-Route, Prüfstand `cea0ea4`), warum Suche und
   Namenssortierung lokal bleiben, und dass der Test die Zahl der `discoverTokens`-Aufrufe misst,
   nicht HTTP-Anfragen.

NICHT:
- Drosselung, Ausfall-Merker, Überlagerungs-Cache oder die endgültige Cache-Semantik. Das ist
  A11b.
- Die Suche oder die Namenssortierung auf die Plattform legen. E6-Rest, offen.
- Den `$lookup` auf `nft_metadata`, Insights oder Stats entfernen (R3 im Abbauplan).
- Je Karte einen Detailaufruf machen, oder `discoverTokens` für Token außerhalb der gelieferten
  Seite rufen.
- `owner`, `tokenURI`, `totalSupply` aus der Plattform füllen.
- Die Route umbauen, `any` aufräumen oder `devLog`-Zeilen entfernen.
- `useMarketplaceItems.ts`, `CollectionItemsList.tsx`, `init-services.ts` ändern.
- Das Flag einschalten.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Neu: eine Mapper-Datei, zwei Testdateien;
geändert: `client.ts`, `write.ts`, Route, Typdatei, eine Zeile im Wallet-Dienst. Wird der
Umfang größer, an der Stelle anhalten und melden, nicht A11b vorwegnehmen.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht: Exit-Code von `npm run check`, Zahl neuer Tests, die **gemessene** Zahl der
  `discoverTokens`-Aufrufe (ausdrücklich als Aufrufstelle, nicht als HTTP-Zahl), Liste der
  Felder, die jetzt aus der Plattform kommen, und was bewusst lokal blieb (Auswahl, Suche,
  Sortierung, Insights, Stats, Preise, `owner`, `tokenURI`, `totalSupply`).
- Befund zur `chainId` je Listing im Code (Schreiber), soweit ohne Datenzugriff möglich.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Der Test zeigt mehr als einen `discoverTokens`-Aufruf für 100 Karten: anhalten, die Stückelung
  oder die Aufrufstelle ist falsch.
- Die Antwortform von `items[]` müsste sich ändern, damit die Plattformwerte hineinpassen:
  anhalten.
- Die Änderung an `requestPlatform` berührt mehr als die vier `maxAttempts`-Stellen oder lässt
  A1-Tests kippen: anhalten, nicht die Tests anpassen.
- Der Route-Test verlangt einen Umbau der Route (keine einspeisbare Datenquelle): anhalten.
  Der Advisor hielt einen Umbau für nicht nötig.
- Beim ersten Lauf gegen eine echte Instanz (A10) zählt ein Bündelaufruf als *n* statt als
  einer, oder Discover liefert 403 (fehlender Scope `refresh:token`): A11 steht neu zur
  Entscheidung.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
- **A11b** — `state/tasks/a11b-items-schutz.md`. Drosselung, Ausfall-Merker,
  Überlagerungs-Cache, Cache-Semantik. Ohne A11b darf A11a nicht ausgeliefert werden.
- **E6-Rest, die Suche** — Entscheidung in `state/plan-v2-plattform-integration.md`,
  Abschnitt 6.
- Reviewer-Pass (`code-reviewer`) nach dem Bau.
