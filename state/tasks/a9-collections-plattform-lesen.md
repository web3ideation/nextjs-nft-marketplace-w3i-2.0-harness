SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a9` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a9-collections-plattform-lesen

GOAL:
`/api/collections` bezieht Name, Symbol, Vorschaubilder und Umfang einer
Collection aus der Plattform statt aus einer `nft_metadata`-Aggregation. Prüfbar
an: ein Seitenaufruf der Collections-Ansicht erzeugt **einen** Plattform-Aufruf,
unabhängig von der Zahl der Collections · bei Ausfall bleibt die Ansicht
nutzbar und ist als möglicherweise veraltet gekennzeichnet (V32) · die
Feldnamen der Antwort bleiben unverändert, denn `CollectionsService` reicht sie
unverändert als `Collection[]` weiter · `npm run check` endet mit Exit 0.

V-Abdeckung: V7, V27. V32 für den Rückfallweg.

CONTEXT:
- [Fakt] E6 ist am 13.10.2026 entschieden: die Freitextsuche gehört zu **A11**,
  nicht zu A9. Befund 17 des Advisors ist damit hier erledigt — dieser Auftrag
  fasst keine Suche an. `CollectionsService.ts` übergibt ohnehin keinen
  Suchbegriff.
- [Fakt] **Der Aufrufzahl-Beleg, erhoben am Plattform-Code (Stand `2812315`),
  nicht aus dem Migrationsdokument:**
  `apps/web/src/app/api/v1/collections/route.ts` ruft
  `serializeEnrichedCollections` — **dieselbe** Funktion, die auch die
  Detailroute über `serializeEnrichedCollection` benutzt
  (`apps/web/src/lib/collection-response.ts`, Zeilen 12 und 22).
  [Schlussfolgerung] Die Listenantwort trägt pro Element schon alles, was die
  Detailantwort trägt: `preview`, bis zu sechs `recentTokens`,
  `indexedTokenCount`, `holderCount`. **Ein** Aufruf mit `limit=200` liefert
  also die Metadaten für bis zu 200 Collections. Kein Ausfächern in N
  Detailaufrufe — das ist der Unterschied zwischen einem Aufruf je Seitenaufruf
  und zwölf.
- [Fakt] Dieselbe Datei zeigt: die Listenroute nimmt **nur** `limit` und
  `cursor` (`collectionListQuerySchema`). Es gibt **keinen** Filter nach
  Contract-Adresse und keinen nach `chainId`. [Schlussfolgerung] Gefiltert wird
  hier, nicht dort: welche Contracts angezeigt werden, kommt weiter aus den
  aktiven Listings in `marketplace_items`, und die Plattformliste wird lokal
  dagegen abgeglichen. Wer stattdessen je Contract einen Detailaufruf macht,
  baut genau die Aufrufzahl ein, die A11 noch belegen muss.
- [Fakt] Der Umfang ist gedeckelt: `resolveLimit` kappt bei 200
  (`src/lib/nft-data-platform/cursor.ts`), und die Plattform indiziert nur
  registrierte Collections. [Schlussfolgerung] Ein harter Deckel von **zwei**
  Seiten (400 Collections) liegt für die Alpha weit jenseits des Bestands und
  macht die Aufrufzahl beweisbar statt geschätzt. Wird er erreicht, ist das ein
  Protokolleintrag und kein stilles Abschneiden.
- [Fakt] `src/contexts/collections/CollectionsService.ts` nimmt
  `data.data.collections` und gibt sie **unverändert** als `Collection[]`
  zurück; das Interface steht in derselben Datei (Zeilen 12-53).
  [Schlussfolgerung] Die Antwortform ist der Vertrag. Ein umbenanntes Feld ist
  kein Mapping-Detail, sondern eine kaputte Ansicht.
- [Fakt] `uniqueOwners` ist heute die Zahl **verschiedener Verkäufer mit
  gelisteten Objekten** (`uniqueSellers` als `$addToSet` über das
  Verkäuferfeld), nicht die Zahl der Halter. Die Plattform liefert
  `holderCount`, also etwas anderes. [Schlussfolgerung] `uniqueOwners` wird
  **nicht** auf `holderCount` umgelegt. Das wäre eine stille
  Bedeutungsänderung an einer Zahl, die in der Oberfläche steht. `holderCount`
  kommt als **neues** Feld dazu.
- [Fakt] `totalSupply` wird heute über drei Wege erraten: aus den Insights, aus
  `contract.totalSupply`, und bei reinen ERC-1155-Collections aus der höchsten
  numerischen Token-ID plus eins (`inferredItemsFromMaxTokenId`).
  [Schlussfolgerung] Die Plattform hat `totalSupply` und `indexedTokenCount`
  als materialisierte Werte. Der Vorrang ist im Mapper festzulegen und zu
  kommentieren, sonst springt eine angezeigte Zahl beim Umschalten ohne
  nachvollziehbaren Grund.
- [Fakt] Die Route liest vier Collections: `marketplace_items` (welche
  Contracts, Preise, Stückzahlen), `nft_metadata` (Name, Symbol, Umfang,
  Vorschaubilder), `nft_stats` (soziale Zahlen), `admin_nft_insights`
  (Kategorie, Rarität). [Schlussfolgerung] Nur der **zweite** Block gehört zur
  Plattform. Die anderen drei haben auf der Plattform kein Gegenstück und
  bleiben unangetastet.
- [Fakt] `collection_stats` existiert als Zugriffsfunktion
  (`src/lib/mongodb.ts`, re-exportiert in `src/lib/index.ts`) und hat **keinen
  einzigen Aufrufer** unter `src/` oder `scripts/`. Das ist die von Plan v2
  verlangte Ist-Zustand-Klärung: die Collection kommt im Plan nicht vor, weil
  sie im Code nicht vorkommt. [Schlussfolgerung] Das ist ein Befund für den
  **Abbauplan** (toter Zugriffspfad), nicht für A9. Hier nur festhalten, nicht
  löschen — ein Löschpaket führt keine Verhaltensänderung ein, und dieser
  Auftrag ist kein Löschpaket.
- [Fakt] Die Route arbeitet durchgehend mit `any` (Pipelines, Dokumente in den
  Schleifen, der `catch`-Zweig), 580 Zeilen. [Schlussfolgerung] Altbestand nach
  der Geltungsgrenze in `CLAUDE.md`. Dieser Auftrag fügt **kein neues** `any`
  hinzu und räumt das bestehende **nicht** auf — ein Umbau der Route wäre ein
  eigener Auftrag und würde die eine Änderung unprüfbar machen, auf die es hier
  ankommt.
- [Fakt] Das Muster für den Rückfallweg steht in
  `src/app/api/nft/detail/route.ts` (A7a/A7b, Abschnitt „Step 2b"):
  `isPlatformConfigured()` als Tor, `translatePlatformError` für die
  Übersetzung, `dataSource` und `staleWarning` in der Antwort.
  [Schlussfolgerung] Hier dasselbe Muster, nicht ein zweites daneben.

SCOPE:
1. `src/lib/nft-data-platform/mappers/collection-list.ts` — neue Datei, wie
   `mappers/token-detail.ts` in A7a:
   - `buildCollectionOverlayMap(collections)` → `Map<string, CollectionOverlay>`,
     Schlüssel ist die **kleingeschriebene** Contract-Adresse (die Plattform
     liefert sie in ihrer eigenen Schreibweise, der Marktplatz normalisiert
     durchgehend klein).
   - `CollectionOverlay` trägt genau die Felder, die die Plattform ersetzt:
     `contractName`, `contractSymbol`, `previewImages` (bis zu vier, aus
     `preview` zuerst, dann `recentTokens`), `totalSupply`, `holderCount`,
     `indexedTokenCount`. Nichts weiter — kein Preis, keine soziale Zahl.
   - Der Vorrang für `totalSupply` im Kommentar begründen.
   - Bilder: die CDN-Adressen der Plattform in der Reihenfolge
     `cdnUrlOptimized`, `cdnUrlOriginal`, `cdnUrlThumbnail`; ein Element ohne
     brauchbare Adresse wird übersprungen, nicht als leere Zeichenkette
     geführt.
2. `src/app/api/collections/route.ts`:
   - Hinter `isPlatformConfigured()` **einen** Aufruf
     `listCollections({ limit: PLATFORM_MAX_LIMIT })`, bei `pageInfo.hasMore`
     höchstens **eine** weitere Seite über den Cursor. Deckel als benannte
     Konstante mit Begründung; wird er erreicht, `logger.warn` mit der Zahl
     geholter Collections.
   - Die Überlagerung ersetzt im Abschlussblock die Werte aus
     `contractInfoMap` und `metadataMap` — **nur** diese. Für eine
     Contract-Adresse ohne Treffer in der Plattformliste bleibt der lokale Wert
     stehen und die Antwort trägt `staleWarning: true`.
   - `dataSource` (`'platform' | 'local-fallback'`) und `staleWarning`
     (`boolean`) in der Antwort, neben `collections`, `count`, `timestamp`.
   - `holderCount` und `indexedTokenCount` als neue Felder je Collection.
     `uniqueOwners` bleibt, was es ist.
   - Fehlerbehandlung über `translatePlatformError`. Ein
     `allowLocalFallback: false` führt **nicht** zum Werfen: anders als die
     Detailseite zeigt die Übersicht viele Collections, und ein Formfehler der
     Plattform darf nicht die ganze Ansicht nehmen (V32 nennt die Übersicht
     ausdrücklich als „bleibt nutzbar"). Protokollstufe aus der Übersetzung,
     `staleWarning: true`, lokale Werte. **Diese Abweichung von der Detailseite
     im Kommentar begründen.**
   - Die beiden lokalen `nft_metadata`-Blöcke bleiben vollständig stehen; sie
     sind ab jetzt der Rückfallweg. Entfernt werden sie im Abbauplan (R3),
     nicht hier.
3. `src/lib/nft-data-platform/index.ts`: nichts Neues nötig, wenn
   `listCollections` schon exportiert ist. Prüfen, nicht doppelt exportieren.
4. Tests:
   - `src/lib/nft-data-platform/mappers/collection-list.test.ts` (neu):
     Schlüssel wird kleingeschrieben · Bildvorrang · höchstens vier Bilder ·
     ein `recentToken` ohne Medien wird übersprungen · `totalSupply`-Vorrang ·
     leere Liste ergibt eine leere Map.
   - `src/app/api/collections/route.test.ts` (neu): **der wichtigste Test** —
     zwölf Collections in den Listings erzeugen **einen**
     `listCollections`-Aufruf · bei `hasMore` genau einen zweiten, nie einen
     dritten · ein Ausfall der Plattform ergibt 200 mit `staleWarning: true`
     und den lokalen Namen · ein Contract ohne Plattform-Treffer behält seinen
     lokalen Namen und setzt `staleWarning` · bei ausgeschaltetem Flag wird die
     Plattform nicht gerufen und `dataSource` ist `local-fallback`.
5. Dateikopf-Ergänzung in der Route: woher die Metadaten jetzt kommen, und der
   Aufrufzahl-Beleg in einem Satz mit Belegstelle.

NICHT:
- Eine Suche einbauen oder einen `search`-Parameter annehmen. E6: das ist A11.
- `uniqueOwners` auf `holderCount` umlegen.
- Die Route umbauen, die Pipelines umschreiben, `any` aufräumen oder
  `devLog`-Zeilen entfernen. Altbestand.
- Die lokalen `nft_metadata`-Blöcke löschen. Das ist R3 im Abbauplan und
  braucht erst den Beleg, dass der Plattform-Pfad trägt.
- `collection_stats` anfassen oder die tote Zugriffsfunktion entfernen. Befund
  für den Abbauplan, hier nur notiert.
- Je Collection einen Detailaufruf machen. Der Beleg in CONTEXT sagt, dass es
  einen Listenaufruf braucht; N Aufrufe wären genau der Fehler, den A11 noch
  belegen muss.
- `admin_nft_insights` oder `nft_stats` anfassen. Kein Gegenstück auf der
  Plattform.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Eine neue Mapper-Datei,
zwei neue Testdateien, eine geänderte Route. Der Umfang steckt im Deckel und im
Rückfallweg, nicht in der Zahl der Felder.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, der
  **gemessenen** Aufrufzahl aus dem Test (nicht der erwarteten), der Liste der
  Felder, die jetzt aus der Plattform kommen, und der ausdrücklichen
  Feststellung, welche Felder bewusst lokal geblieben sind.
- Der Hinweis, dass die Antwort zwei neue Felder (`holderCount`,
  `indexedTokenCount`) und zwei Hüllfelder (`dataSource`, `staleWarning`)
  trägt.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Die Plattformliste liefert für einen Contract aus den aktiven Listings keinen
  Treffer, obwohl er registriert sein müsste: melden, nicht durch einen
  Detailaufruf heilen. Dann ist die Registrierung lückenhaft, und das ist ein
  Befund für A10, kein Mapping-Problem.
- `pageInfo.hasMore` ist auch nach der zweiten Seite wahr: melden. Dann ist der
  Bestand größer als angenommen und der Deckel die falsche Antwort — dann
  braucht A9 einen Filter auf der Plattformseite, also eine Anfrage an Niklas.
- Die Antwortform müsste sich ändern, damit die Plattformwerte hineinpassen:
  anhalten. `CollectionsService` reicht sie unverändert weiter, und die
  Oberfläche hängt an den Feldnamen.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
A11 — `/api/marketplace/items`. Der Aufrufzahl-Beleg aus diesem Vertrag gilt
dort **nicht**: die Übersicht zeigt zwanzig **Token**, nicht zwanzig
Collections. Das ist vor dem A11-Vertrag eigens zu belegen (E6).
Offen: A5 (davor Review-Befund 8), A6 (braucht E1), A7c (braucht E8),
A4b/A4c (brauchen den unvereinten Plattform-Branch), A10.
