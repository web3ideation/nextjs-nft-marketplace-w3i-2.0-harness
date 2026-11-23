SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a11` sein (von `main` abgezweigt; existiert er nicht,
anlegen). Danach `npm run check` laufen lassen (erwartet: Exit 0). Ist er rot,
anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

ÜBERHOLT (19.11.2026) — NICHT BAUEN: Dieser Vertrag ist Plan v1 und durch den Advisor-Pass
ersetzt. Gültig sind `state/plan-v2-a11-marketplace-items.md` und die Verträge
`state/tasks/a11a-items-ueberlagerung.md` und `state/tasks/a11b-items-schutz.md`.

## TASK: a11-marketplace-items-plattform-lesen

GOAL:
`/api/marketplace/items` bezieht die **Anzeige-Metadaten** (`metadata`,
`contract`) der Token auf der gelieferten Seite aus der Plattform statt aus dem
`nft_metadata`-`$lookup`. Prüfbar an: eine Anfrage der Übersicht erzeugt
**höchstens einen** `discoverTokens`-Aufruf, unabhängig von der Zahl der Karten
(bis 100) · ein Treffer im Antwort-Cache und ein ausgeschaltetes Flag erzeugen
**null** Aufrufe · bei Ausfall der Plattform oder bei Token, die sie nicht als
`ready` liefert, bleibt die Übersicht nutzbar und trägt `staleWarning: true`
(V32) · die Feldnamen von `items[]` bleiben unverändert ·
`npm run check` endet mit Exit 0.

V-Abdeckung: Zielbild Abschnitt 2 des Plans (Übersicht), V32 für den
Rückfallweg, V22 für die Aufrufzahl.

CONTEXT:
- [Fakt] E6 (`state/plan-v2-plattform-integration.md`, Abschnitt 6) ist am
  19.11.2026 korrigiert: die Aufrufzahl ist **kein** Hindernis.
  `POST /api/v1/tokens/discover` nimmt bis zu 500
  `(chainId, contractAddress, tokenId)` und liefert bekannte Token als
  `discoveryStatus: 'ready'` mit `token` **und** `collection` in der Anreicherung
  der Detailroute (`docs/nft-api.md` der Plattform; Prüfstand `cea0ea4`, E5).
  Der Befund `state/befund-a11-aufrufzahl.md` ist widerrufen — nicht als
  Grundlage lesen, nur die Korrektur oben darin.
- [Fakt] Unser Client hat den Aufruf schon: `discoverTokens(identities)` in
  `src/lib/nft-data-platform/write.ts` (stückelt auf `DISCOVER_BATCH_LIMIT = 500`,
  filtert vorher gegen die Diamond-Whitelist, abgelehnte Identitäten kommen als
  `failed` zurück). Antwortform: `discoverResponseSchema` in `schemas.ts`.
  Mapper für Token und Contract gibt es seit A7a:
  `mapPlatformTokenToMetadata`, `mapPlatformToContract` in
  `src/lib/nft-data-platform/mappers/token-detail.ts` — **diese** nutzen, kein
  zweiter Mapper daneben.
- [Fakt] Die Route entscheidet **in MongoDB**, welche Token auf die Seite
  kommen: `marketplace_items` filtern, `$lookup` auf `nft_metadata` (Zeile
  ~270), `$lookup` auf Insights und Stats, `metadataFilters` (Zeile ~544:
  Suche, Kategorie, Rarität, Tags), `$sort`, `$skip`, `$limit`
  (`src/app/api/marketplace/items/route.ts`). `metadata` und `contract` der
  Antwort kommen aus `$nftData.metadata` und `$nftData.contract` (Zeilen
  ~427–428).
  [Schlussfolgerung] Die Plattform kann die **Auswahl** nicht übernehmen —
  Suche über `metadata.name`/`description`/`contract.name` und die Sortierung
  nach Name (`sortName`, Zeile ~484) laufen auf `nft_metadata`. Sie kann nur die
  **Anzeigewerte der schon gewählten Seite** liefern. Das ist dasselbe
  Überlagerungsmuster wie in A9 und A7a: lokal auswählen, von der Plattform
  überlagern.
- [Schlussfolgerung] **Das widerspricht E6 an einer Stelle:** E6 sagt „die
  Freitextsuche gehört zu A11". Mit Überlagerung stimmt das nicht — die Suche
  bleibt lokal. Eine Suche über die Plattform (`GET /api/v1/search?q=`) wäre ein
  anderer Pfad mit anderer Semantik (Gesamtbestand statt aktive Listings,
  keine Preis-/Verkäuferfilter) und ist eine Entscheidung, keine Umsetzung.
  Folge für R3: der `$lookup` auf `nft_metadata` bleibt, solange Suche und
  Namenssortierung darauf laufen. R3 kann nur die **Anzeigerolle** abbauen, nicht
  die Quelle. → FOLGT.
- [Fakt] `discoverTokens` ist **schreibend** für Unbekanntes: je fehlendem Token
  ein `refresh-token`-Job mit `forceMetadata: true`, je Contract ein
  RPC-Bytecode-Check (Plattform `apps/web/src/app/api/v1/tokens/discover/route.ts`).
  Die Job-ID ist deterministisch; ein laufender Job wird nicht doppelt angelegt,
  ein `failed`-Job und wegen `forceMetadata` auch ein `completed`-Job werden bei
  **jedem** Aufruf neu eingereiht (`packages/queue/src/index.ts`,
  `shouldReenqueueExistingJob`). [Schlussfolgerung] Ein Token, das nie `ready`
  wird, löst bei jedem Seitenaufruf neue Arbeit auf der Plattform aus. Das ist
  der Hauptrisikopunkt dieses Pakets.
- [Fakt] Bei einer **deaktivierten** Collection antwortet Discover je Eintrag
  `failed` mit Meldung und reiht nichts ein; bereits indizierte Token kommen
  weiter als `ready` (Plattform `4da567a`, #22).
- [Fakt] Die Route hat einen Antwort-Cache für die Standardansicht
  (`MARKETPLACE_DEFAULT_RESPONSE_CACHE_KEY`, 15 s, Zeilen ~41–43, ~175, ~790).
  [Schlussfolgerung] Er begrenzt die Standardansicht auf rund vier
  Plattform-Aufrufe je Minute. Alle anderen Anfragen (andere Seite, Filter,
  Sortierung) gehen ungecacht durch und kosten je einen Aufruf.
- [Fakt] Alle Plattform-Aufrufe teilen den `alpha-read`-Topf mit 600 je Minute
  (Spec, Entscheidung 14). [Annahme] Ein Bündelaufruf zählt als **ein** Aufruf —
  ungeprüft. → ESCALATE.
- [Fakt] Das Muster für Tor, Fehlerübersetzung und Hüllfelder steht in
  `src/app/api/nft/detail/route.ts` (Zeilen ~127–195: `isPlatformConfigured()`,
  `translatePlatformError`, `dataSource`, `staleWarning`) und in
  `src/app/api/collections/route.ts` (A9). Die Kette ist die Chain-ID aus
  `getChainConfig().chain.id` (Detailroute, Zeile ~131); die Detailroute liest
  `listing.chainId` (Zeile ~479). [offene Unsicherheit] Ob `marketplace_items`
  die `chainId` je Eintrag verlässlich trägt, ist am Datenbestand/Code zu
  belegen, bevor sie als Identität dient; sonst die konfigurierte Kette.
- [Fakt] Die Route ist 780+ Zeilen mit durchgehend `any` (Pipelines, Dokumente).
  [Schlussfolgerung] Altbestand nach der Geltungsgrenze in `CLAUDE.md`: **kein
  neues** `any`, bestehendes nicht aufräumen.
- [Fakt] `src/hooks/marketplace/useMarketplaceItems.ts` und
  `src/app/nft/[…]/components/CollectionItemsList.tsx` stehen im Plan unter
  „Berührt". [Schlussfolgerung] Bei unveränderter Antwortform ist dort **nichts**
  zu ändern; nur lesen und bestätigen. `src/lib/init-services.ts` (Vorwärmung)
  steht ebenfalls dort: prüfen, ob die Vorwärmung den Standard-Antwort-Cache mit
  rein lokalen Werten füllt — wenn ja, melden, nicht ändern.

SCOPE:
1. `src/lib/nft-data-platform/mappers/marketplace-items.ts` — neue Datei:
   - `buildItemOverlayMap(discoverItems)` → `Map<string, ItemOverlay>`,
     Schlüssel `chainId:contractAddress(klein):tokenId`.
   - Nur Einträge mit `discoveryStatus === 'ready'` und gesetztem `token` kommen
     in die Karte. `ItemOverlay` trägt genau `metadata` und `contract` in der
     Form der Antwort, gebaut mit `mapPlatformTokenToMetadata` und
     `mapPlatformToContract`. Nichts weiter — kein Preis, keine Stats, keine
     Insights.
   - Gibt zusätzlich die Liste der **nicht** überlagerten Schlüssel zurück
     (`queued`, `failed`, ohne Treffer), die der Route für das Auslassen und
     `staleWarning` dient.
2. `src/app/api/marketplace/items/route.ts`, **nach** dem Aggregationslauf und
   **vor** dem Schreiben in den Antwort-Cache:
   - Hinter `isPlatformConfigured()` die Identitäten der gelieferten `items`
     sammeln, die Auslassliste (Nr. 3) abziehen, **einen** `discoverTokens`-
     Aufruf, Überlagerung der `metadata` und `contract` je Karte.
   - Karte ohne Überlagerung behält ihre lokalen Werte; die Antwort trägt dann
     `staleWarning: true`. `dataSource: 'platform'` wenn der Aufruf gelang,
     sonst `'local-fallback'`.
   - Fehlerbehandlung über `translatePlatformError`. Wie in A9: `allowLocalFallback:
     false` führt **nicht** zum Werfen, die Übersicht bleibt nutzbar.
     Abweichung von der Detailseite im Kommentar begründen.
   - **Nicht in den Antwort-Cache schreiben**, wenn `staleWarning` wahr ist —
     sonst hält sich eine degradierte Antwort 15 s.
   - `dataSource` und `staleWarning` neben `items`, `pagination`, `filters`.
   - Die lokalen `$lookup`s auf `nft_metadata` bleiben vollständig; sie sind
     Auswahlgrundlage (Suche, Name) und Rückfallweg. Entfernt wird hier nichts.
3. **Drosselung gegen das Neu-Einreihen:** Identitäten, die ein Discover-Aufruf
   **nicht** als `ready` zurückgab, werden für `DISCOVER_RETRY_PAUSE_MS`
   (benannte Konstante mit Begründung, Startwert zehn Minuten) im gemeinsamen
   Cache (`src/lib/redis/shared-cache`) vermerkt und beim nächsten Aufruf **nicht**
   erneut angefragt. Sie behalten ihre lokalen Werte und lösen `staleWarning` aus.
   Ein Ausfall des gemeinsamen Caches heißt: ohne Drosselung weiterfahren und
   `logger.warn`, nicht scheitern.
4. Tests:
   - `src/lib/nft-data-platform/mappers/marketplace-items.test.ts` (neu): nur
     `ready` mit `token` kommt in die Karte · Schlüssel kleingeschrieben ·
     `queued`, `failed`, `ready` ohne `token` landen in der Auslassliste ·
     leere Eingabe ergibt leere Karte.
   - `src/app/api/marketplace/items/route.test.ts` (neu oder erweitert; zuerst
     prüfen, ob es einen gibt): **der wichtigste Test** — eine Seite mit
     zwanzig und eine mit hundert Karten erzeugen **je einen**
     `discoverTokens`-Aufruf · Antwort-Cache-Treffer erzeugt null · Flag aus
     erzeugt null und `dataSource: 'local-fallback'` · Plattformausfall ergibt
     200 mit lokalen Werten und `staleWarning: true` · eine Karte, die die
     Plattform als `queued` liefert, behält ihren lokalen Namen · ein zweiter
     Aufruf innerhalb der Pause fragt die `queued`-Identität **nicht** erneut ·
     eine Antwort mit `staleWarning: true` wird nicht in den Antwort-Cache
     geschrieben · Suche und Namenssortierung liefern unverändert die lokale
     Auswahl.
5. Dateikopf der Route: woher `metadata` und `contract` jetzt kommen, ein Satz
   zur Aufrufzahl mit Belegstelle (Discover-Route der Plattform, Prüfstand
   `cea0ea4`), und ein Satz, warum Suche und Namenssortierung lokal bleiben.

NICHT:
- Die Suche oder die Namenssortierung auf die Plattform legen. Entscheidung, siehe
  FOLGT.
- Den `$lookup` auf `nft_metadata`, Insights oder Stats entfernen. R3 im
  Abbauplan; geht erst nach der Entscheidung zur Suche.
- Für jede Karte einen Detailaufruf machen.
- `discoverTokens` für Token aufrufen, die **nicht** auf der gelieferten Seite
  stehen (kein Vorabladen weiterer Seiten, keine Gesamtbestandsabfragen).
- Die Route umbauen, `any` aufräumen oder `devLog`-Zeilen entfernen.
- `useMarketplaceItems.ts`, `CollectionItemsList.tsx`, `init-services.ts`
  ändern. Nur lesen und im Bericht bestätigen.
- Eine eigene Retry-Logik gegen `429` neben der Client-Schicht aus A1/V34
  einbauen.
- Committen oder pushen ohne ausdrückliche Freigabe.

FOLGT:
- **E6-Rest: die Suche.** Entscheidung, ob die Freitextsuche dauerhaft über
  `nft_metadata` läuft (dann bleibt R3 auf die Anzeigerolle beschränkt und das
  Zielbild in Abschnitt 2 des Plans ist enger zu formulieren) oder auf
  `GET /api/v1/search` wandert (anderer Pfad, anderer Umfang). Ohne diese
  Entscheidung ist E6 nur halb abgeschlossen. Ablage: neuer Eintrag in
  `state/plan-v2-plattform-integration.md`, Abschnitt 6.
- **Fensterzählung messen:** im Smoke-Lauf (A10) `x-ratelimit-remaining` vor und
  nach einem Discover-Aufruf mit mehreren Einträgen vergleichen.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Eine neue Mapper-Datei, zwei
Testdateien, eine geänderte Route. Der Umfang steckt in Drosselung und
Rückfallweg, nicht in der Zahl der Felder. Sprengt die Drosselung (Nr. 3) den
Rahmen, abspalten und melden — A11 darf dann **nicht** ohne sie ausgeliefert
werden.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, der
  **gemessenen** Aufrufzahl aus dem Test (nicht der erwarteten), Liste der Felder,
  die jetzt aus der Plattform kommen, und der ausdrücklichen Feststellung, was
  lokal geblieben ist (Auswahl, Suche, Sortierung, Insights, Stats, Preise).
- Befund zu `init-services.ts` (füllt die Vorwärmung den Standard-Cache?) und zur
  `chainId` je Listing.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- `marketplace_items` trägt keine verlässliche `chainId` je Eintrag und die
  konfigurierte Kette ist nicht sicher die richtige: anhalten.
- Der gemeinsame Cache ist für die Drosselung nicht geeignet (Schnittstelle passt
  nicht, kein Ablauf je Schlüssel): melden, keine eigene Ablage in MongoDB oder
  im Prozessspeicher daneben bauen — im Mehrinstanzbetrieb wäre sie wirkungslos.
- Der Test zeigt mehr als einen Discover-Aufruf für eine Seite von hundert Karten:
  anhalten, die Stückelung ist falsch.
- Die Antwortform müsste sich ändern, damit die Plattformwerte hineinpassen:
  anhalten. Die Oberfläche hängt an den Feldnamen.
- Im Smoke-Lauf zählt ein Bündelaufruf als *n* statt als einer: A11 steht dann
  neu zur Entscheidung (100 Karten wären ein Sechstel des Minutenbudgets je
  Anfrage).
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

Vor dem Bau: dieser Auftrag hat eine schreibende Wirkung auf dem Lesepfad der
meistbesuchten Ansicht. Ein Advisor-Pass (Skill `advisor-pass`,
`architecture-advisor`) gehört vor die Übergabe, ein Reviewer-Pass
(`code-reviewer`) danach.
