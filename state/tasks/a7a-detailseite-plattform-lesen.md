SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a7a-detailseite-plattform-lesen

GOAL:
`/api/nft/detail` bezieht Metadaten, Contract-Angaben und Ownership aus der NFT
Data Platform statt aus `nft_metadata` — hinter dem Flag, mit unveränderter
Antwortform und unveränderten Stats-, Insights- und Listing-Verbindungen.
Prüfbar an: bei Flag aus ist die Antwort **byte-gleich** zu heute · bei Flag an
und erreichbarer Plattform kommen Name, Beschreibung, Bilder, Attribute und
Eigentümer aus der Plattform · bei Flag an und Ausfall liefert die Route den
lokalen Stand und kennzeichnet ihn als möglicherweise veraltet (V32) · der
`blockchain`-Block und `approvalStatus` sind in **allen** Fällen gefüllt wie
heute · `npm run check` endet mit Exit 0.

V-Abdeckung: V4, V6, V31, V27 (Vertragstest des Mappers), V32 (Quellenwahl).

CONTEXT:
- [Fakt] Heutiger Datenfluss der Route (`src/app/api/nft/detail/route.ts`):
  Schritt 1 liest `nft_metadata`; Schritt 2 frischt den Chain-Zustand über
  `blockchainStateSync` auf, wenn er älter als 5 Minuten ist oder
  `refresh=true` gesetzt wurde; Schritt 3 lädt fehlende IPFS-Metadaten über
  `ipfsMetadataLazySync` nach; Schritte 4 bis 6 verbinden `nft_stats`,
  `admin_nft_insights` und das aktive Listing aus `marketplace_items`.
- [Fakt] Die Antwortform, von der **vier** Aufrufer abhängen
  (`useMarketplaceItemDetail.ts`, `CartContext.tsx`, `CartPage.tsx`,
  `UnifiedListingForm.tsx`):
  `{ contractAddress, tokenId, metadata, contract, ownership, blockchain,
  approvalStatus, stats, insights, … }`. `metadata` trägt `name`,
  `description`, `image`, `imageOriginal`, `images`, `imageMeta`,
  `blurDataURL`, `externalUrl`, `animationUrl`, `attributes`. `ownership`
  trägt `tokenStandard`, `ownerAddress`, `ownerBalance`, `holderCount`,
  `totalKnownBalance`, `balances`.
  [Schlussfolgerung] Diese Form bleibt. A7a wechselt die **Quelle**, nicht den
  Vertrag — alles andere wäre eine Änderung an vier Aufrufern und gehört zu A7b.
- [Fakt] Der `blockchain`-Block und `approvalStatus` stammen aus
  `blockchainStateSync`, nicht aus der Plattform; das Migrationsdokument
  schreibt für den Block „otherwise leave conservative nulls". [Fakt]
  Entscheidung **E8 ist offen**. [Schlussfolgerung] A7a lässt den Block
  unangetastet — die Route ruft `blockchainStateSync` weiter, nur nicht mehr als
  Metadatenquelle. Das ist die sichere Richtung und verhindert zugleich den
  Fehlerpfad aus Advisor-Befund 8b.
- [Fakt] **Advisor-Befund 8b, der teuerste Fehler, den dieser Auftrag vermeiden
  muss:** `useMarketplaceItemDetail.ts:202` prüft
  `blockchain.isApprovedForAll === false` und holt die Detailseite dann mit
  `refresh=true` **erneut**. Bliebe der Chain-Block leer, wäre die Bedingung für
  jedes gelistete ERC-1155 dauerhaft wahr: zwei Detailabfragen je Seitenaufruf,
  also sechs Plattform-Aufrufe statt drei, und der `refresh=true`-Pfad erzwingt
  die teuerste Variante. Deshalb ist „Chain-Block bleibt gefüllt" nicht
  Bequemlichkeit, sondern Abnahmekriterium.
- [Fakt] Die Lesemethoden stehen: `getTokenDetail`, `getTokenOwners`,
  `getCollectionDetail` aus `src/lib/nft-data-platform/read.ts` (Paket A3a), alle
  geprüft mit zod, alle über den Read-Zugangsdatensatz.
- [Fakt] Die Fehlerübersetzung steht: `translatePlatformError` aus
  `src/lib/nft-data-platform/view-state.ts` (Paket A8) liefert
  `allowLocalFallback` — das Feld, an dem die Quellenwahl hängt.
- [Fakt] `isPlatformConfigured()` aus `config.ts` (Paket A2) ist `false`, wenn
  das Flag aus **oder** eine Variable fehlt. [Schlussfolgerung] Ein Aufruf
  genügt für die Entscheidung „Plattform oder lokal"; es braucht keine zweite
  Flag-Prüfung.
- [Fakt] Die Medien liegen im `media`-Block der Plattform als `cdnUrlOriginal`,
  `cdnUrlOptimized`, `cdnUrlThumbnail` (je `string | null`), dazu `width`,
  `height`, `mimeType` (V31).
  [Schlussfolgerung] Daraus lassen sich `image`, `imageOriginal`, `images` und
  `imageMeta` ohne `buildNFTImageVariants` füllen — die lokale Variantenbildung
  bleibt aber für den Rückfallweg nötig (V32) und wird **nicht** entfernt. Ihr
  Abbau ist R3 im Abbauplan.
- [Fakt] **Korrektur zu Plan v2:** Dort steht bei A7a „Deckt … V33
  (Prüfkriterium aus A4a)". [Schlussfolgerung] Das ist hier falsch verortet. Ein
  lesender Token-Abruf registriert nichts auf der Plattform — nur Discover und
  Refresh tun das. A7a löst keinen Refresh aus und braucht den Whitelist-Filter
  daher nicht. Das V33-Kriterium gehört zu **A7b**, wo bei einem 404 ein Refresh
  in Erwägung gezogen wird. Diese Korrektur ist in Plan v2 nachzutragen.
- [Fakt] Eine Detailseite löst drei Plattform-Aufrufe aus (Token, Owner,
  Collection). [Fakt] Advisor-Befund 6: `/api/nft/detail` hat vier Aufrufer, und
  `CartPage.tsx:379-396` ruft sie in `items.map()` innerhalb eines
  `Promise.all` — ein Warenkorb mit zwanzig Positionen also zwanzigmal
  gleichzeitig. [Schlussfolgerung] Die Zahl der Plattform-Aufrufe je
  Anfragepfad ist zu messen und in A10 zu protokollieren (V22), nicht zu
  schätzen.

SCOPE:
1. `src/lib/nft-data-platform/mappers/token-detail.ts` — neue Datei, reine
   Abbildung ohne I/O:
   - `mapPlatformTokenToDetailMetadata(token)` → der `metadata`-Teil der
     Antwortform. Bilder **ausschließlich** aus dem `media`-Block:
     `image` = `cdnUrlOptimized ?? cdnUrlOriginal`, `imageOriginal` =
     `cdnUrlOriginal`, `images` = die drei Varianten, `imageMeta` aus `width`,
     `height`, `mimeType`. `blurDataURL` bleibt `null` — die Plattform liefert
     keinen.
   - `mapPlatformCollectionToContract(collection, fallbackAddress)` → der
     `contract`-Teil (`name`, `symbol`, `address`, `tokenURI`). `tokenURI`
     kommt aus dem Token (`metadataUriResolved` ist in A3a nicht gepickt — wenn
     gebraucht, dort ergänzen und begründen, nicht hier improvisieren).
   - `mapPlatformOwnersToOwnership(owners, requestedOwnerAddress)` → der
     `ownership`-Teil. Bei ERC-721 ein Eigentümer mit Guthaben 1, bei ERC-1155
     die Guthaben-Zeilen zu `balances` und `totalKnownBalance`.
     `holderCount` aus der Zahl der Zeilen.
   - Jede Funktion mit explizitem Rückgabetyp; keine `any`, keine Zusicherung.
2. `src/app/api/nft/detail/route.ts` — Quellenwahl, so klein wie möglich:
   - Vor Schritt 1: `isPlatformConfigured()`. Falsch → **unveränderter**
     heutiger Pfad, Zeile für Zeile.
   - Wahr → die drei Plattform-Aufrufe parallel (`Promise.all`), Ergebnis durch
     die Mapper, `nft_metadata` **nicht** gelesen.
   - Schlägt ein Plattform-Aufruf fehl: `translatePlatformError`. Bei
     `allowLocalFallback` → heutiger Pfad **und** ein Feld
     `dataSource: 'local-fallback'` plus `staleWarning: true` in der Antwort.
     Ohne Rückfall-Erlaubnis → den übersetzten Fehler werfen.
   - Bei Erfolg `dataSource: 'platform'`. Neue Felder, keine geänderten — die
     vier Aufrufer sehen sonst eine andere Form.
   - Schritte 2 und 4 bis 6 bleiben **unverändert**: `blockchainStateSync`,
     `nft_stats`, `admin_nft_insights`, Listing.
   - `ipfsMetadataLazySync` wird im Plattform-Pfad **nicht** aufgerufen (V4:
     kein synchrones Nachladen aus Chain oder IPFS). Im Rückfallpfad bleibt es.
3. `src/lib/nft-data-platform/mappers/token-detail.test.ts` — Vertragstest des
   Mappers (V27):
   - ERC-721: ein Eigentümer, `ownerBalance` 1, `holderCount` 1.
   - ERC-1155: drei Guthaben-Zeilen → `balances` mit drei Einträgen,
     `totalKnownBalance` als Summe, `holderCount` 3.
   - Medien: nur `cdnUrlOriginal` gesetzt → `image` fällt darauf zurück.
   - Medien: alle drei `null` → `image` ist leer, **kein** Wurf.
   - Attribute und `metadataPayload` werden durchgereicht, nicht umgeformt.
   - Der angefragte `ownerAddress` landet in `ownership.ownerAddress`, auch
     wenn er nicht unter den Eigentümern ist (die Oberfläche fragt so).
4. `src/app/api/nft/detail/route.test.ts` — Routentest mit eingespeistem
   Transport:
   - Flag aus → kein Plattform-Aufruf, Antwortform wie heute.
   - Flag an, Erfolg → `dataSource: 'platform'`, Metadaten aus der Plattform,
     `blockchain` **gefüllt**.
   - Flag an, `PLATFORM_UNAVAILABLE` → `dataSource: 'local-fallback'`,
     `staleWarning: true`, Antwort weiter nutzbar (V32).
   - Flag an, `PlatformResponseError` → Fehler, **kein** Rückfall.
   - **Abnahmekriterium zu Befund 8b:** im Plattform-Pfad ist
     `blockchain.isApprovedForAll` nicht `undefined` und nicht dauerhaft
     `false`, wenn der Chain-Zustand es anders sagt.
   - Zahl der Plattform-Aufrufe je Anfrage ist **drei** — als Zahl geprüft,
     damit eine vierte Abfrage auffällt.
5. Dateikopf nach `docs/kommentar-standard.md`; den Kopf der Route anpassen, die
   „Data Strategy" dort beschreibt den alten Weg.

NICHT:
- Den 404-Vertrag aus V5 (`TOKEN_NOT_INDEXED`, `refreshQueued`, `refreshJobId`)
  bauen. Das ist **A7b**, und es braucht eine Entscheidung über die geteilte
  Fehlerplumbing (`src/lib/api/handler.ts` reicht `details` nicht durch,
  Advisor-Befund 8c).
- Die vier Aufrufer anfassen, auch nicht `UnifiedListingForm.tsx`, das einen 404
  heute als „NFT nicht gefunden" übersetzt. A7b.
- Den `blockchain`-Block oder `approvalStatus` abbauen oder umbauen. E8 ist
  offen, A7c entscheidet.
- `buildNFTImageVariants` oder `ipfsMetadataLazySync` entfernen. Rückfallweg,
  Abbau ist R3.
- `nft_metadata` als Rückfallquelle entfernen (V32, Nicht-Ziel der Spec).
- Den Whitelist-Filter aus A4a einbauen. Siehe CONTEXT: A7a löst keinen Refresh
  aus und braucht ihn nicht. Wer ihn hier einbaut, erzeugt einen RPC-Aufruf je
  Detailseite ohne Gegenwert.
- Die Antwortform erweitern über `dataSource` und `staleWarning` hinaus.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Eine neue Mapper-Datei,
zwei neue Testdateien, eine geänderte Route. Der Umfang steckt in der
Quellenwahl und darin, die bestehende Form nicht zu verletzen — nicht in der
Zahl der Zeilen.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, der
  Abbildungstabelle Plattform-Feld → Antwortfeld, der gemessenen Zahl der
  Plattform-Aufrufe je Detailanfrage, und der ausdrücklichen Feststellung, dass
  `blockchain` und `approvalStatus` im Plattform-Pfad gefüllt sind.
- Die Korrektur zu Plan v2 (V33 gehört zu A7b, nicht zu A7a) als Änderung an
  `state/plan-v2-plattform-integration.md` mitliefern.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Die Antwortform lässt sich aus den Plattform-Daten nicht ohne Verlust füllen —
  etwa weil ein Feld fehlt, von dem ein Aufrufer abhängt: **anhalten und
  melden**. Nicht ein Feld erfinden und nicht einen Aufrufer „nebenbei"
  anpassen. Genau an dieser Stelle entscheidet sich, ob A7b größer wird.
- `metadataUriResolved` oder ein anderes in A3a nicht gepicktes Feld wird
  gebraucht: melden. Das Schema in A3a ergänzen ist richtig, aber es ist eine
  Änderung an einem Vertrag, auf dem A9 und A11 ebenfalls aufsetzen.
- Der Routentest lässt sich nicht ohne MongoDB bauen: melden. Dann ist zu
  entscheiden, ob die Route eine einspeisbare Datenquelle bekommt — das wäre
  ein eigener Auftrag und berührt alle Routen.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
A7b — 404-Vertrag, Fehlerplumbing, die vier Aufrufer, und das V33-Kriterium.
A7c — Chain- und Approval-Block, hängt an E8.
Parallel möglich: A9 (Collections), A11 (Übersicht, mit dem Aufrufzahl-Beleg
vorab), A3b (Wallet, Discover, Refresh).
Offen: E1 (vor A6), E2 (vor Tor T1), V63-Prämisse (vor A4b/A4c), Review-Befund 8
(vor A5).
