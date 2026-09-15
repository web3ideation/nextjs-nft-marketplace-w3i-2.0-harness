# Spec: Marktplatz-Fertigstellung

Stand: 14.09.2026 (v4)
Erhoben gegen: Marktplatz `wolf3i/nextjs-nft-marketplace-w3i-2.0-harness` main `3a62833` (dazu der ungemergte Branch `harness/lizenz-und-notice`) · NFT Data Platform `NiklasHoffmann/NFT-Data-Platform` main `7915b52` · Contracts `web3ideation/ideation-market-w3i` main `1a4dcfe` · MultiSig `web3ideation/multisig-wallet-w3i` main · Niklas' Antworten vom 11.09.2026 (Betrieb, Staging, Allowlist).
Evidenz-Marker: `[Fakt]` belegt · `[Schlussfolgerung]` abgeleitet · `[Annahme]` ungeprüft · `[offene Unsicherheit]` ungeklärt · `[Bestand]` gilt heute und bleibt · `[in Umsetzung]` Auftrag läuft.
V-Nummern sind stabile IDs: V1–V29 aus v2, V30–V60 aus v3, V61–V64 neu in v4. Es wird nicht umnummeriert. Kürzel W und P verweisen auf `claude/offene-fragen.md`; Aufgaben ohne V-Nummer stehen in `claude/todo.md`.

**Zwei Systeme.** Die **NFT Data Platform** ist ein eigenständiges Projekt, das Niklas pflegt und das auch andere Anwendungen nutzen können; sie wird hier nicht geändert. Das **Marktplatz-Repo** ist unseres. Jede Zeile dieser Spec beschreibt Verhalten des Marktplatzes; wo die Plattform erwähnt wird, ist es Voraussetzung oder Schnittstelle.

**Ziel in einem Satz:** Der Marktplatz ist funktional vollständig, bezieht seine NFT-Daten über die NFT Data Platform, lässt keine nicht kaufbaren Listings unbemerkt stehen und ist chain-neutral konfiguriert, sodass er als interne Alpha auf Sepolia laufen kann und die spätere Go-Live-Chain keine Codeänderung erzwingt.

---

## Problem & Nutzer

**1. Der lesende Datenbezug mischt vier Quellen in denselben Pfaden.** `[Fakt]` TheGraph für Listings, lokale MongoDB-Lesemodelle für angereicherte NFT-Daten, Alchemy und Moralis für Wallet-Discovery, dazu direkte Chain- und IPFS-Nachladelogik.

- `src/app/api/wallet/nfts/route.ts`: `discoverNFTsViaAlchemy()` ab Zeile 491, Moralis-Fallback, `source`-Union in Zeile 36
- `src/app/api/user/nfts/sync/route.ts`: Discovery über Alchemy, eigene IPFS-Gateway-Umschreibung
- `src/app/api/nft/detail/route.ts`: liest `nft_metadata` zuerst, frischt veraltete Daten synchron aus der Chain auf
- `src/app/api/collections/route.ts`: aggregiert aus `marketplace_items`, Metadaten aus `nft_metadata`

`[Schlussfolgerung]` Der Marktplatz trägt die Verantwortung für NFT-Datenqualität selbst, obwohl es dafür ein eigenes System gibt.

**2. Nicht kaufbare Listings bleiben unbemerkt.** `[Fakt]` Vor dem Listen wird nur `createListing` simuliert (`useMarketplaceListing.ts`), nie `purchaseListing`. `useMarketplacePurchase.ts` sendet per `writeContractAsync` mit festem `gas: 500000`, ohne `simulateContract`, erkennt einen Revert erst am Receipt (Zeile 173) und schreibt ihn per `devLog.error` nur in die Browser-Konsole. `[Fakt, Contract]` Ein Kauf zahlt atomar Innovation-Fee → Royalty → Verkäufer. Lehnt ein Empfänger die Zahlung ab, revertet jeder Kauf dieses Listings, und `cleanListing` kann es nicht entfernen (Constraints).

**3. Live-Updates hängen an einem offenen Browser-Tab.** `[Fakt, von Niklas benannt, im Repo bestätigt]` `revalidateTag` und `broadcastMarketplaceEvent` werden nur in `src/app/api/events/marketplace/route.ts` aufgerufen. Diese Route wird ausschließlich per `fetch` aus `src/services/marketplace/event-listener.ts` gefüttert, also aus dem Browser. Der Worker (`src/services/nft-sync/*`) ruft keines von beidem. `[Fakt]` `nft-stats-updated` ist in `src/types/core/events.ts` mit Helfern, Type Guard und `WindowEventMap` ausgebaut, dispatched wird aber `nftStatsUpdate` in `src/contexts/marketplace-items/MarketplaceItemsEvents.ts`; `onStatsUpdate` hat außerhalb seines Moduls keinen Aufrufer; `NFTStatsContext` hört nicht auf window-Events, sondern nutzt ein eigenes Handler-Array (`NFTStatsEvents.ts`).

**4. Feature-Lücken aus dem Backlog.** Lazy Minting, Mobile, Fiat-Ramp, Bot-Schutz, Medienwiedergabe, 1inch-Reste, ERC20-Liste. Stand je Punkt in `claude/todo-abgleich-altliste.md`.

**5. Öffentliches Repo mit offenen Rechts- und Sicherheitsfragen.** `[Fakt]` Das Repo ist ohne Anmeldung klonbar, samt Historie. Die in `b6e0ca8` aus der Doku entfernten Zugangsdaten stehen weiter in der Historie. `[in Umsetzung]` `LICENSE` und `NOTICE` liegen korrigiert auf `harness/lizenz-und-notice`. `[Fakt]` Repo-Verweise zeigen auf `NiklasHoffmann/…`, `web3ideation/nextjs-…` und den Platzhalter `yourusername`.

**Nutzer** `[Fakt, docs/architecture/ROLES_AND_PERMISSIONS.md]` Acht Akteure: Visitor, User, Admin auf App-Ebene; Seller, Buyer, MultiSig Owner, Diamond Owner auf Chain-Ebene; Worker als Prozess. Betroffen sind Visitor und User (lesende Ansichten), Seller (Prüfung beim Listen), Buyer (Schutz vor nicht kaufbaren Listings), Admin (gemeldete Listings, Plattform-Abmeldungen), Diamond Owner (Force-Cancel, Whitelist). `[Schlussfolgerung]` Lazy Minting bringt einen neunten Akteur: den **Herausgeber**, der eine Collection mit eigenem Contract betreibt und deren Mint über unsere Oberfläche anbietet. In `ROLES_AND_PERMISSIONS.md` fehlt er.

**Nicht das Problem:** Die bestehenden Schreibpfade (Listen, Kaufen, Stornieren, Governance) laufen direkt gegen den Diamond und bleiben. Neu kommen Aufrufe bestehender Contract-Funktionen hinzu (V42, V63), Aufrufe an Herausgeber-Contracts (Gruppe G) und an den Mock-Swap auf Sepolia (V48).

---

## Entschieden (vor dem Plan geklärt)

Quellen: 1–9 aus `docs/api/nft-data-platform-marketplace-migration.md`, Abschnitt „Repository-Level Decisions", gegen eine laufende Plattform-Instanz verifiziert am 03.09.2026. 10–12 Scope-Schnitt vom 11.09.2026. 13–33 Wolfgangs Entscheidungen und Niklas' Antworten vom 11.09. bis 14.09.2026.

1. **Hybrid, nicht API-only.** TheGraph bleibt alleinige Quelle für Listings. Die Plattform übernimmt Token, Collections, Wallet-Inventar, Suche. Die lokale MongoDB behält Likes, Ratings, Watchlist, persönliche Notizen, Cart-Zustand und Admin-Insights.
2. **Die internen `/api/*`-Routen bleiben als serverseitige Fassade.** Namen und Antwortstruktur bleiben stabil, damit der Quellenwechsel für Contexts und Komponenten unsichtbar ist.
3. **Kein Browser-Code ruft die Plattform direkt.** Alle Aufrufe sind HMAC-signiert und damit serverseitig.
4. **Rohdaten der Plattform werden in einer server-only Client-Schicht normalisiert,** bevor Routencode sie auf bestehende Frontend-Verträge abbildet.
5. **`/api/collections` bleibt eine Ansicht gelisteter Collections,** kein globales Verzeichnis.
6. **`404` von der Plattform heißt „noch nicht indiziert",** nicht „Token existiert nicht".
7. **Rollout über ein Feature-Flag** `NFT_DATA_PLATFORM_ENABLED`.
8. **Der Marktplatz bekommt nur die Scopes, die er braucht:** `collections:read`, `tokens:read`, `owners:read`, `search:read`, `refresh:token`, `refresh:collection`. Nicht `reindex:write`, nicht `admin:read`, nicht `refresh:media`. `[Fakt]` Gegen die Routen geprüft: beide Discover-Endpunkte verlangen einen Read-Scope plus `refresh:token`, `refresh/collection` verlangt nur `refresh:collection` (`withAuthenticatedRoute([...])`).
9. **Integrationstests laufen gegen eine lokale Plattform-Instanz.** `[Fakt]` `docker compose` startet dabei nur Mongo, Redis und MinIO; Web und Worker laufen aus dem Plattform-Workspace (`npm run db:init`, `npm run dev:web`, `npm run dev:worker`).
10. **Scope-Schnitt.** Nicht Teil dieser Spec: Centralized Bot, Chain-Entscheidung, EUR-Fee-Logging, Token-Listen-Evaluierung.
11. **Lazy Minting ist Teil der Spec, zugeschnitten:** Der Marktplatz definiert Adapter und baut die Oberfläche; Contracts liegen bei den Herausgebern (24).
12. **Contract- und Subgraph-Änderungen werden hier spezifiziert, nicht gebaut.**
13. **Wallet-Inventar über Plattform-Indexing, Frische über Push.** Die Plattform liest die Blockchain für die registrierten Collections selbst; zusätzlich meldet der Marktplatz neue Listings, Käufe und Mints aktiv (V30). Push allein reicht nicht, weil die Wallet-Discover-Route die Token-IDs als Eingabe verlangt (Constraints).
14. **Zwei Plattform-Clients je Umgebung.** `alpha-read` mit `collections:read`, `tokens:read`, `owners:read`, `search:read`, `refresh:token` und 600 Anfragen pro Minute; `alpha-ops` mit `refresh:collection` und 30 pro Minute. Beide mit eigenen Zugangsdaten und IP-Allowlist, vergeben je Umgebung; Alpha-Zugangsdaten gelten nicht für Produktion. Die 600 sind ein Startwert, den Niklas in der Alpha mitmisst, bevor er festgeschrieben wird (V34).
15. **Lazy Minting ohne Merkle.** Weder Mint-Whitelists noch die `BuyerWhitelistFacet` werden auf Merkle-Beweise umgebaut. Die Adapter lassen Beweise als späteren Zusatz zu (V45). Nice-to-have in `claude/todo.md`.
16. **ERC20-Dummy-Liste** aus ETH und den fünf Sepolia-Mocks (V51). Die bestehende Liste taugt für die Alpha nicht (V52). Die echte Liste liefert Wolfgang später.
17. **„Powered by 1inch" ist Pflicht**, wo 1inch genutzt wird, in der Oberfläche und im `NOTICE`. Die Freigabe durch 1inch holt Stefan ein; bis dahin bleibt 1inch aus dem `NOTICE` heraus (V49, V58).
18. **Keine Swap-/DEX-Seite, keine ERC20-Cards.** Der Swap bleibt eingebettet in Kauf und Cart. Einen Utility-ERC20 gibt es nicht.
19. **TheGraph bleibt Listing-Quelle.** Keine Subgraph-Kostenschätzung in dieser Spec.
20. **Rechteinhaberin ist die Ideation Port UG (haftungsbeschränkt), Lizenz bleibt MIT.** Niklas ist damit einverstanden. „web3 ideation" ist der alte Firmenname, „NFT Ideation" der alte interne Name.
21. **Repo-Heimat ist der Firmen-Account**, der von `web3ideation` in `ideationport` umbenannt wird. Der Umzug läuft; der Zielname des Repos steht noch nicht fest (`claude/todo.md`). Die Plattform zieht nach Fertigstellung des Marktplatzes ebenfalls dorthin.
22. **Force-Cancel ist kein Blocker.** Die MultiSig führt über `custom_call` beliebige Aufrufe aus, also auch `cancelListing` als Diamond-Owner (V42).
23. **Aufteilung der Pflege.** Marktplatz: wir, im Firmen-Account. Plattform: Niklas, von ihm bestätigt; Betrieb, Accounts und RPC liegen bei ihm, Accounts ziehen auf Firmen-Mailadressen um. Plattform-Aufgaben (Zugangsdaten, Instanzen, Indexing-Betrieb) gehen an ihn und stehen unter Constraints als Voraussetzungen.
24. **Lazy Minting: Nutzer minten über unsere Oberfläche direkt am Contract des Herausgebers.** Unser Diamond ist am Mint nicht beteiligt. Der Marktplatz kann Herausgebern deshalb keine Schnittstelle vorschreiben, sondern braucht Adapter je Contract-Typ (V43). Keine signierten Gutscheine in dieser Fassung (Nicht-Ziele).
25. **Der Marktplatz verdient an Mints mit, und der Herausgeber zahlt.** Erste Wahl ist ein Gebühren- oder Referral-Feld im Contract des Herausgebers, in das unsere Adresse eingetragen wird; zweite Wahl ist eine vertragliche Provision, abgerechnet über die von uns gesendeten Mint-Transaktionen. Ein Aufschlag beim Käufer ist nur Rückfall, wenn mit einem Herausgeber keine Provision zustande kommt, und läuft dann als ein atomarer Batch (V61). Platzhalter: **1 % des Mint-Preises; der Satz ist nicht beschlossen** (`claude/todo.md`). Begründung: Der Käufer kann meist direkt beim Herausgeber minten; mit Aufschlag wären wir der teuerste Weg zum selben Token.
26. **Gescheiterte Käufe werden gemeldet, in der Admin-Ansicht gezeigt und von Hand storniert.** Nichts wird automatisch ausgeblendet oder storniert.
27. **Testweg: interne Alpha gegen eine eigene Alpha-Instanz der Plattform.** Niklas setzt beide Alpha-Instanzen auf, Plattform und Marktplatz, auf seinem VPS mit Coolify. Die Plattform-Instanz bekommt eigene Datenbank und eigenen Redis-SSE-Channel und startet leer; der Backfill läuft über einen Refresh je Collection.
28. **Der Registrierungsaufruf ist das Tor zum Indexing.** `POST /api/v1/refresh/collection` legt die Collection an, ermittelt den Deploy-Block und setzt sie auf `active`; genau das ist die Bedingung, unter der der Plattform-Worker sie indiziert. Die Env-Allowlist der Plattform ist leer voreingestellt und bedeutet dann „kein Filter"; sie bleibt eine Notbremse für Kostenprobleme. Der Marktplatz registriert ausschließlich Collections der Diamond-Whitelist und koppelt die Registrierung an den Vollzug der Freigabe (V63). Das entspricht Niklas' Wunsch: unsere Freigabe ist faktisch das Tor, ohne Abstimmung zwischen zwei Häusern. *Ersetzt die Zwischenaussage vom 11.09., Indexing sei kein Self-Service.*
29. **Ein Sepolia-Diamond für Alpha und bestehende Instanz.** `[Fakt]` Im Contract-Repo gibt es auf Sepolia genau ein Diamond-Deployment, `0x1107eb26d47a5bf88e9a9f97cbc7ea38c3e1d7ec`, und genau diese Adresse steht in `src/config/networks.ts`; Subgraph und Contract-Backend sind fertig. Mainnet ist nicht deployt. Alpha und bestehende Instanz teilen damit den Chain-Zustand: Eine Collection, die für die Alpha auf die Whitelist kommt, ist sofort auch in der bestehenden Instanz sichtbar. Auf Sepolia ohne echtes Geld vertretbar; ein zweites Deployment ist kein Ziel.
30. **Diamond-Owner.** Auf Sepolia liegen die Owner-Rechte bei Wolfgang und Niklas. Auf Mainnet wird der Owner die Mainnet-MultiSig, über die Stefan, Niklas und Wolfgang verfügen. Die Admin-Ansicht muss deshalb beide Wege können: direkter Owner-Aufruf und MultiSig-Vorschlag (V42).
31. **Wiederholungsversuche gegen die Plattform brauchen eine frische Signatur.** Die Signierung ist Single-Use; Wiederholungen ohne neue Signatur enden in `409 replayed_request`, auch die, die ein Proxy oder ein Timeout auslöst. Das ist Pflichttest (V11).
32. **Meldeweg zur Plattform:** Issue im Plattform-Repo, je Collection Chain-ID und Contract-Adresse, Sammelmeldungen als eine Liste, ein Arbeitstag Vorlauf, ab einigen tausend Token vorher ansprechen. Abmeldungen über denselben Weg, bis die Plattform eine Abschalt-Schnittstelle hat.
33. **Beide Alpha-Instanzen und die Alpha-Zugangsdaten sind Voraussetzung, keine Aufgabe dieser Spec.** Der Alpha-Start hängt an ihrem Aufsetzen.

---

## Gewünschtes Verhalten

Bauform je Aussage: Auslöser → erwartete Antwort → statt was heute passiert. `[Bestand]` fordert keine Änderung.

### A. Datenquellen

- **V1** `[neu]` Ist das Flag an, beantwortet `/api/wallet/nfts` eine Anfrage ohne einen einzigen ausgehenden Aufruf an Alchemy oder Moralis. Heute: `discoverNFTsViaAlchemy()` mit Moralis-Fallback. Voraussetzung: die Collections der Diamond-Whitelist sind an der Plattform registriert und indiziert (V33, V63). `[Schlussfolgerung]` Die Wallet-Ansicht zeigt danach nur NFTs aus registrierten Collections statt allem, was Alchemy findet. Das passt dazu, dass nur diese Collections handelbar sind; das Migrationsdokument nennt die Plattform „ownership-first" und keinen universellen Wallet-Crawler.
- **V2** `[Bestand]` `/api/wallet/nfts` liefert weiterhin die Hülle `success`, `data`, `total` und dieselben `WalletNFT`-Feldnamen.
- **V3** `[neu]` Liefert die Plattform ein Holding mit `token: null`, gibt die Route trotzdem einen Eintrag mit Contract-Adresse und tokenId zurück, und `hasMarketplaceData` stammt allein aus dem Listing-Join.
- **V4** `[neu]` `/api/nft/detail` liest den Token aus der Plattform statt aus `nft_metadata` und lädt weder Chain noch IPFS synchron nach.
- **V5** `[neu]` Ist ein Token nicht indiziert, antwortet `/api/nft/detail` mit HTTP 404 und `code: "TOKEN_NOT_INDEXED"` sowie `refreshQueued`, `refreshJobId`, `contractAddress`, `tokenId`, `chainId`. Für Token einer Collection, die nicht auf der Diamond-Whitelist steht, ist `refreshQueued` immer `false` (V33).
- **V6** `[neu]` Owner und Balance stammen aus dem Ownership-Endpunkt, nie aus der Token-Antwort; die trägt kein Owner-Feld.
- **V7** `[neu]` `/api/collections` bezieht Collection-Metadaten aus der Plattform; die Menge der angezeigten Contracts kommt weiter aus aktiven Listings.
- **V8** `[Bestand]` Listing-Daten kommen ausschließlich aus TheGraph.
- **V9** `[Bestand]` Likes, Ratings, Watchlist, Notizen, Cart und Admin-Insights bleiben in der lokalen MongoDB.
- **V30** `[neu]` Ein neues Listing aus TheGraph löst genau einen `POST /api/v1/tokens/discover` für den Token aus; Kauf, Stornierung und Transfer lösen `POST /api/v1/refresh/token` aus. Prüfbar: Nach einem Listing-Event enthält das Aufrufprotokoll des Clients einen Discover mit dieser Token-Identität. Heute: kein Aufruf. `[Fakt]` Ohne Indexing und Metadata-Sweep bewegt sich das Lesemodell der Plattform nur bei Discover-/Refresh-Aufrufen oder TTL-Revalidierung beim Lesen.
- **V31** `[neu]` Bilder, Animation und Audio kommen als CDN-URLs aus dem `media`-Block der Plattform (`image`, `animation`, `audio`, je mit `cdnUrlOriginal`, `cdnUrlOptimized`, `cdnUrlThumbnail`). Weder Routencode noch Browser ruft `/api/media` der Plattform auf. `[Fakt]` `/api/media` ist nicht HMAC-geschützt, sondern je IP begrenzt (`PUBLIC_READ_RATE_LIMIT_PER_MINUTE`, Standard 180); alle Serveranfragen des Marktplatzes kämen von einer IP.
- **V32** `[neu]` Antwortet die Plattform nicht oder mit 503, bleiben Übersicht, Detailseite und Kauf nutzbar: Listings aus TheGraph, Metadaten aus dem Rückfallweg `nft_metadata`, als möglicherweise veraltet gekennzeichnet. Wallet-Ansicht und Suche dürfen eingeschränkt sein, zeigen dann aber eine eigene Meldung mit Code `PLATFORM_UNAVAILABLE` statt eines generischen Fehlers. `[Fakt]` Bei Ausfall von Redis oder des Rate-Limit-Backends antwortet jede `/api/v1`-Route der Plattform mit 503 (`replay_guard_backend_unavailable`, `rate_limit_backend_unavailable`); das ist dort Absicht.
- **V33** `[neu]` Jede Collection der Diamond-Whitelist (`getWhitelistedCollections`) ist an der Plattform registriert; für keine andere Collection löst der Marktplatz Registrierung, Discover oder Refresh aus. Prüfbar: Ein Aufruf von `/api/nft/detail` mit einer beliebigen fremden Contract-Adresse erzeugt keinen Plattform-Aufruf mit `refresh:token`. Heute: keine Registrierung, kein Filter. `[Fakt]` Mit leerer `CHAIN_INDEXING_COLLECTION_ALLOWLIST` indiziert der Plattform-Worker jede Collection mit `syncStatus: "active"` und bekanntem `deployBlock` (`listCollectionsForAutoIndexing`, `packages/db/src/index.ts`); leer ist die Voreinstellung. `[Fakt]` Schon ein Token-Refresh registriert die Collection des Tokens (`handleRefreshToken` → `ensureCollectionRegistration`, `apps/worker/src/jobs/processors.ts`). `[Schlussfolgerung]` Ohne den Filter könnte jeder Aufruf einer beliebigen Detail-URL eine fremde Collection ins Indexing ziehen und dort RPC-Kosten erzeugen.
- **V63** `[neu]` Wird eine Collection auf die Diamond-Whitelist gesetzt (`CollectionAddedToWhitelist`, `CollectionWhitelistFacet.sol:17`), ruft der Marktplatz innerhalb eines Worker-Zyklus `POST /api/v1/refresh/collection` mit Chain-ID und Adresse dieser Collection auf, genau einmal. Wird eine Collection entfernt (`CollectionRemovedFromWhitelist`, Zeile 20), erscheint sie in der Admin-Ansicht unter „Abmeldung an Plattform ausstehend" mit Chain-ID und Adresse zum Kopieren, bis ein Admin sie als gemeldet markiert. Heute: nichts von beidem. `[Fakt]` Die Plattform kennt den Status `disabled` im Schema, setzt ihn aber nirgends; Niklas baut die Abschaltung in beide Richtungen, bis dahin führt er Abmeldungen von Hand nach. Wiederanschalten ist dort kein neuer Backfill, sondern ein Aufholen der Pause. `[offene Frage]` P9 (Event-Listener oder Aufruf aus der Admin-Oberfläche).

### B. Plattform-Client

- **V10** `[Bestand]` Kein Browser-Code ruft `/api/v1/*` direkt.
- **V11** `[neu]` Ein Wiederholungsversuch signiert mit frischem Zeitstempel neu, statt dieselbe Anfrage erneut zu senden; `409 replayed_request` gilt nicht als endgültiger Fehler, `429` wird davon unterschieden behandelt. Pflichttest gegen die lokale Plattform-Instanz: dieselbe signierte Anfrage zweimal gesendet ergibt beim zweiten Mal 409; eine korrekt neu signierte Wiederholung ergibt 200. Der Test deckt auch Wiederholungen ab, die ein Timeout auslöst. `[Fakt]` Die Signierung ist Single-Use; Niklas nennt das den ersten Stolperstein hinter TLS und Traefik.
- **V12** `[neu]` Jede Listen- und Suchabfrage nutzt den Cursor der Plattform. Die Zeichenkette `page` kommt als Abfrageparameter im Client nicht vor.
- **V13** `[neu]` Ein Test belegt, dass eine zweite Seite andere Elemente liefert als die erste. Grund: die Plattform ignoriert unbekannte Parameter still und liefert `200` mit der ersten Seite; ein falsch geschriebener Client sähe sonst gesund aus.
- **V14** `[neu]` `NFT_API_BASE_URL` und zwei Zugangsdatensätze (Client-ID, Key, Secret für Read und für Ops) existieren nur serverseitig, ohne `NEXT_PUBLIC_`-Spiegel. `npm run env:check` schlägt fehl, wenn das Flag an ist und eine dieser Variablen fehlt. `[Fakt]` `scripts/check-env.js` prüft heute keine davon. Die Zugangsdaten werden je Umgebung vergeben; die der Alpha gelten nicht für Produktion.
- **V15** `[neu]` Der Marktplatz nutzt genau die zwei Clients aus Entscheidung 14, nie den Bootstrap-Client. Die Client-Schicht wählt je Aufruf den Datensatz: Lesen, Discover und Token-Refresh über Read, Collection-Registrierung über Ops. Ein Aufruf, der `reindex:write`, `admin:read` oder `refresh:media` bräuchte, scheitert und wird nicht durch eine Erweiterung der Scopes gelöst. `[Fakt]` Ein Werkzeug zum Anlegen weiterer Clients fehlt der Plattform; die Clients legt Niklas an. `[offene Frage]` P8.
- **V16** `[neu]` Die Systemuhr des Marktplatz-Hosts läuft synchron; die Plattform weist Anfragen ab, deren Zeitstempel mehr als 300 Sekunden abweicht (`AUTH_MAX_TIMESTAMP_SKEW_SEC`). Ein Monitoring-Alarm auf Uhrdrift existiert.
- **V34** `[neu]` Der Client wertet `x-ratelimit-limit` und `x-ratelimit-remaining` aus und protokolliert die Auslastung je Client, sodass die Startwerte aus Entscheidung 14 messbar werden. Ein `429` führt zu Backoff, nicht zu sofortiger Wiederholung. Die Nebenläufigkeit des Clients ist so begrenzt, dass an einer Fenstergrenze nicht das Doppelte des Limits gesendet wird. `[Fakt]` Die Plattform zählt in festen 60-Sekunden-Fenstern je Client in Redis; an der Fenstergrenze sind kurzzeitig bis 1200 Anfragen möglich, danach kommt ein harter Stopp.

### C. Betriebsreife

Quelle für V17–V23: die offenen Punkte in `docs/development/PROJECT_CHECKLIST.md`.

- **V17** `[neu]` Backup- und Restore-Plan ist dokumentiert und einmal durchgespielt.
- **V18** `[neu]` Background-Jobs haben Retry mit Backoff und melden dauerhaftes Scheitern an das Monitoring.
- **V19** `[neu]` Die MongoDB-Index-Strategie ist dokumentiert und angewandt.
- **V20** `[neu]` Die Migrations-Strategie ist dokumentiert und einmal getestet.
- **V21** `[neu]` Für jede externe Abhängigkeit ist dokumentiert, was bei Ausfall passiert. Für die Plattform konkretisiert durch V32.
- **V22** `[neu]` Je Route existiert ein Performance-Budget, und `npm run bench:api` prüft dagegen.
- **V23** `[neu]` Der Release- und Versionierungs-Workflow ist dokumentiert.
- **V35** `[neu]` Das Laden eines Routen-Moduls startet keinen Hintergrunddienst. Prüfbar: das Log von `next build` enthält keine Zeile `Auto-starting NFT Sync Service`; Hintergrunddienste starten nur über `instrumentation.ts` beziehungsweise den Worker, gesteuert über `APP_RUNTIME_ROLE`. `POST {action:'start'}` bleibt als manueller Weg. `[Fakt]` `src/app/api/marketplace/sync/route.ts:14–40` startet den Dienst per `setImmediate` auf Modulebene; der Guard in Zeile 16 ist wirkungslos. `[Fakt, Git-Historie]` Die Route kam mit `aa78bcd`, die Rollentrennung `47ffa8a` hat sie nicht angefasst; laut Niklas nicht gewollt.
- **V36** `[neu]` Zwei prüfbare Teile. (a) Ein Listing-Ereignis, das der Worker verarbeitet, erreicht einen verbundenen SSE-Client, ohne dass ein Browser `/api/events/marketplace` gefüttert hat. Heute: nur bei offenem Tab (Problem 3). `[Fakt, Niklas]` `broadcastMarketplaceEvent` funktioniert aus dem Worker (Redis-Publish), wird von dort nur nie aufgerufen. (b) Für Stats-Updates gibt es genau einen Ereignispfad: der in `src/types/core/events.ts` definierte Name und der dispatchte Name sind identisch, und mindestens ein Listener ist angeschlossen; oder die toten Teile (`nft-stats-updated`-Helfer, `onStatsUpdate`) sind entfernt. Für jede Schreibstelle auf `nft_metadata`, `marketplace_items` und `nft_stats` ist festgelegt, ob sie invalidiert oder mit dokumentierter TTL lebt. `[Fakt, Niklas]` Dass der Worker keine React-Context-Caches invalidiert, ist Absicht und bleibt.
- **V62** `[neu]` Die Alpha-Umgebung läuft mit Web und Worker: `/api/health` meldet `APP_RUNTIME_ROLE` `all`, oder es laufen zwei Prozesse mit `web` und `worker`. Prüfbar: Ein neues Listing erscheint in der Übersicht, ohne dass ein Browser-Tab offen war. `[Fakt]` Die Rollenumschaltung existiert (`instrumentation.ts`, `src/lib/init-services.ts`, `src/app/api/health/route.ts`). `[Fakt, Niklas]` Eine Instanz, die nur die App ausliefert, hat keine Listings und damit keinen Sell-Flow.
- **V64** `[neu]` `REDIS_SSE_CHANNEL` ist in jeder ausgerollten Umgebung explizit gesetzt und trägt den Umgebungsnamen; `npm run env:check` schlägt fehl, wenn die Variable fehlt. Heute: Vorgabewert `marketplace:sse:events` (`src/services/sse/broadcast.ts:18`). `[Schlussfolgerung]` Teilen Alpha und bestehende Instanz ein Redis und nutzen beide den Vorgabewert, kreuzen sich ihre Event-Ströme; die Plattform trennt ihre Channels aus demselben Grund.

### D. Qualität

- **V24** `[Bestand seit 08.09.2026]` `npm run check` endet mit Exit 0.
- **V25** `[neu]` `vitest.config.ts` trägt eine Coverage-Schwelle, und die CI wird rot, wenn sie unterschritten wird.
- **V26** `[neu]` Geänderter Code enthält kein neues `any`. Der Altbestand ist ausgenommen.
- **V27** `[neu]` Für jede migrierte Route existiert ein Integrationstest, für jeden Mapper ein Vertragstest.
- **V37** `[neu]` Der Plattform-Stand, gegen den Integrations- und Vertragstests laufen, ist als Commit festgehalten. Ein Versionssprung ist eine eigene Änderung mit grünem Testlauf. `[Fakt]` Die Plattform hat keine CI: kein `.github/`, vier Unit-Test-Dateien, vier Smoke-Skripte, die eine laufende Instanz brauchen. `[Fakt, Niklas]` Angekündigt sind Redis-Response-Cache, schlankere Listen-Antworten und ein Text-Index für die Suche; jeder davon kann Antwortformen ändern.

### E. Chain und Go-Live

- **V28** `[neu formuliert]` Die Go-Live-Chain ist Konfiguration, kein Code: Diamond-Adresse, Default-Chain, Subgraph-URL, Token-Listen, 1inch-Verfügbarkeit und Onramp-Netze hängen an einer Chain-ID. `npm run env:check` schlägt fehl, wenn für die konfigurierte Default-Chain die Diamond-Adresse der Nullplatzhalter ist. `[Fakt]` `NETWORK_CONFIG["1"].NftMarketplace` ist der Nullplatzhalter; `NETWORK_CONFIG` kennt `31337`, `11155111` und `1`; `wagmi.ts` bietet zusätzlich Polygon und Base an. `[Fakt]` Sepolia zeigt auf das einzige Deployment `0x1107eb…` (Entscheidung 29). Beim Wechsel auf die Go-Live-Chain werden Collection- und Währungs-Whitelist dort neu gesetzt; das ist Governance, nicht Code.
- **V29** `[in Umsetzung]` Die in `b6e0ca8` aus der Doku entfernten Zugangsdaten sind rotiert: MongoDB-Atlas-Passwort, Alchemy-, Infura-, Subgraph- und Google-Key. Niklas rotiert und stellt die Accounts auf Firmen-Mailadressen um. `[Fakt]` Das Repo ist öffentlich, die Werte stehen in der Historie, und der Umzug in den Firmen-Account nimmt die Historie mit; ADR 0001 schließt einen Historien-Scan aus. Rotation ist der einzige Schutz.
- **V38** `[neu]` Bevor die Produktion auf Plattform-Daten umschaltet (Flag an), ist die Alpha in zwei Stufen abgenommen, beide gegen die Alpha-Instanz der Plattform hinter Traefik mit IP-Allowlist und TLS. Stufe 1, solange der Index leer ist: Signierung, 409-Test (V11), 429-Verhalten, Degradierter Pfad (V32), Registrierung (V63). Stufe 2, nachdem Niklas den Backfill gemeldet hat: Wallet-Ansicht, Detailseite, Sell-Flow, Kaufpfad. `[Schlussfolgerung, Niklas-Analyse]` Lokal nicht prüfbar: Forwarded-Header hinter Traefik, TLS, echte Latenz.

### F. Kaufsicherheit

- **V39** `[neu]` Beim Anlegen eines Listings prüft die Oberfläche, ob ein Kauf zum aktuellen Zustand durchginge: Innovation-Fee, Royalty und Verkäufer-Auszahlung in der Listing-Währung, dazu `IdeationMarket__RoyaltyFeeExceedsProceeds`. Scheitert die Prüfung, sieht der Verkäufer die Ursache in Klartext, bevor das Listing live geht oder live bleibt. Heute: nur `createListing` wird simuliert. `[offene Frage]` P1.
- **V40** `[neu]` Der Kaufpfad simuliert `purchaseListing` mit der Wallet des Käufers, bevor er sendet. Scheitert die Simulation, geht keine Transaktion raus, und der Käufer sieht den dekodierten Grund. Heute: `writeContractAsync` mit festem `gas: 500000`, danach „The NFT may have been sold, removed, or the price changed".
- **V41** `[neu]` Scheitert eine Kauf-Simulation oder revertet ein Kauf on-chain, meldet der Client `listingId`, `chainId`, dekodierten Grund und Tx-Hash an einen Marktplatz-Endpunkt; die Meldung landet in der lokalen MongoDB. Die Anzeige für Nutzer ändert sich nicht (Entscheidung 26). Heute: 0 Treffer für `flagged`, `flagListing`, `reportListing`.
- **V42** `[neu]` Die Admin-Ansicht zeigt gemeldete Listings mit Anzahl und letzter Ursache und bietet zwei Aktionen: `cleanListing` aus der verbundenen Wallet, ohne Berechtigung nötig, wirksam nur bei verlorenem Eigentum, fehlender Approval oder entfernter Collection; und Force-Cancel über `cancelListing(listingId)`. Ist `owner()` des Diamond ein Contract, erzeugt Force-Cancel einen MultiSig-Vorschlag über `custom_call` mit vorbefüllter Calldata; ist `owner()` die verbundene Wallet, wird direkt gesendet. `[Fakt, Contract]` `cleanListing` revertet sonst mit `IdeationMarket__StillApproved`; `cancelListing` darf der Diamond-Owner für jedes Listing. `[Fakt]` `custom_call` existiert (`WalletOperationBuilder.tsx`, `TransactionType.Other`), `MultisigWallet.sol` führt `Other` per `to.call{value}(data)` aus. `[Fakt, Entscheidung 30]` Sepolia: Owner-Rechte bei Wolfgang und Niklas; Mainnet: MultiSig.

### G. Lazy Minting

- **V43** `[neu]` Eine Adapterdokumentation legt je Contract-Typ eines Herausgebers fest: woran die Oberfläche den Typ erkennt, wie sie Preis, Währung, Menge, Zeitraum und die Berechtigung einer Adresse liest, wie der Mint-Aufruf gebaut wird, welche Events und Fehler zu erwarten sind und über welches Feld die Provision fließt (V61). Adapter sind Konfiguration plus Code je Typ; kein Herausgeber muss seinen Contract für uns ändern. Heute: nichts; im Contract-Repo gibt es keinen Entwurf (0 Treffer für `lazy`, `merkle`, `voucher`). `[offene Frage]` P3, P7.
- **V44** `[neu]` Ein Nutzer mintet über die Oberfläche direkt am Contract des Herausgebers; die Transaktion geht von seiner Wallet aus, damit Whitelists und Limits je Wallet des Herausgebers greifen. Die Oberfläche zeigt Mint-Preis und unsere Provision getrennt an und bietet den Mint nur an, wenn die Collection auf der Diamond-Whitelist steht, ein Adapter den Contract erkennt und der Provisionsweg der Collection konfiguriert ist (V61). Sonst kein Mint-Knopf, mit Begründung.
- **V45** `[neu]` Whitelist ohne Merkle: Vor dem Mint liest der Adapter, ob die verbundene Wallet minten darf, und die Oberfläche bietet den Mint nur dann an. Merkle-Beweise sind nicht Teil dieser Fassung; ein Adapter kann sie später ergänzen, ohne bestehende Adapter zu ändern. `[Schlussfolgerung]` Eine on-chain gespeicherte Liste kostet je Adresse gut 20.000 Gas; das trägt bei kleinen Listen, nicht bei Tausenden Adressen.
- **V46** `[neu]` Nach einem Mint über die Oberfläche ist der neue Token ohne manuelles Zutun in Wallet- und Detailansicht sichtbar: Die Oberfläche kennt Contract und Token-ID aus dem Receipt und meldet sie per Discover (V30).
- **V47** `[neu]` Oberfläche und Adapter sind ohne echten Herausgeber-Contract testbar. `[offene Frage]` P3.
- **V61** `[neu]` Der Provisionsweg ist je Collection konfiguriert, mit genau einem von drei Werten, und der Satz ist ein konfigurierter Prozentwert (Platzhalter 1 %, Entscheidung 25). `herausgeber-contract`: Der Adapter liest vor dem Mint, dass unsere Adresse als Gebühren- oder Referral-Empfänger eingetragen ist; ist sie es nicht, wird kein Mint angeboten, mit Hinweis für den Admin. `vertrag`: Kein on-chain Anteil; der Marktplatz speichert Tx-Hash, Collection, Token-ID und gezahlten Preis jeder über ihn gesendeten Mint-Transaktion als Abrechnungsgrundlage. `kaeufer-aufschlag` (nur Rückfall): Provisionsüberweisung an unsere Adresse und Mint gehen als ein atomarer Batch (EIP-5792, `useSendCalls` aus wagmi); entweder beides oder nichts. Kann die Wallet keinen Batch, sieht der Käufer vorab, dass zwei Bestätigungen nötig sind, und der Mint wird erst nach bestätigter Provision gesendet. `[Fakt, Recherche 11.09.2026]` Gängige Drop-Contracts haben ein solches Feld: SeaDrop führt Gebühr in Basispunkten und erlaubte Gebührenempfänger, Zora zahlt eine Belohnung an eine beim Mint angegebene Referral-Adresse. `[Fakt]` `wagmi ^2.19.5` steht in `package.json`. `[offene Frage]` P7.

### H. Zahlung und Währungen

- **V48** `[neu]` 1inch-Quote und -Swap laufen nur auf Chains, die 1inch unterstützt. Auf Sepolia läuft derselbe Pfad gegen `MockFixedRateSwap` (`0xD10fCDDFc8C8e455aF3808dc769c53772a0dab90`, `quoteExactInput`, `swapExactInput`); auf allen anderen Chains blendet die Oberfläche den Swap aus und sagt, warum. `[Fakt]` Der Code reicht `chainId` ungeprüft an 1inch durch. `[Fakt]` Der Mock-Swap ist auf Sepolia deployt, mit befüllten Paaren zwischen ETH und den fünf Mocks aus V51 (`broadcast/DeployMockSwap.s.sol/11155111`). `[Fakt, 07.09.2026]` 1inch unterstützt keine Testnets.
- **V49** `[neu]` Wo ein 1inch-Quote oder -Swap angezeigt wird (heute `BuyNowModal`, `CartPage`), steht sichtbar „Powered by 1inch", und das `NOTICE` nennt 1inch. Beim Mock-Swap nicht. Beides erst mit der Freigabe durch 1inch, die Stefan einholt; bis dahin ist der 1inch-Pfad in der Alpha nicht erreichbar (Sepolia hat ihn ohnehin nicht). `[Fakt]` Heute keine Attribution.
- **V50** `[neu]` Der Kaufpfad mit Swap ist automatisiert getestet, ohne echtes Geld zu bewegen. `[offene Frage]` P4.
- **V51** `[neu]` Die Quell-Token-Liste des Käufer-Swaps kommt aus genau einer Konfigurationsstelle, als Dummy gekennzeichnet; der Austausch gegen die echte Liste ist eine Datenänderung ohne Codeänderung. Dummy-Inhalt für Sepolia:

  | Token | Adresse | Dezimalen |
  |---|---|---|
  | ETH (nativ) | `0x0000000000000000000000000000000000000000` | 18 |
  | MockERC20_18 | `0xC740Ee33A12c21Fa7F3cdd426D6051e16EaB456e` | 18 |
  | MockUSDC_6 | `0xEaefa01B8c4c8126226A8B2DA2cF6Eb0E5B0bD26` | 6 |
  | MockWBTC_8 | `0xB1A8786Fd1bBDB7F56f8cEa78A77897a0Aa9fAb2` | 8 |
  | MockEURS_2 | `0xe06E78AB6314993FCa9106536aecfE4284aA791a` | 2 |
  | MockUSDTLike_6 | `0xd11Db19892F8c9C89A03Ba6EFD636795cbBc0d74` | 6 |

  `[Fakt]` Alle fünf Mocks sind auf Sepolia deployt (`broadcast/DeployMocksAndMint.s.sol/11155111`), `mint(address,uint256)` ist ohne Berechtigung aufrufbar, der Mock-Swap hat Paare zwischen allen sechs. Tester versorgen sich selbst. `[Fakt]` Heute enthält der Sepolia-Eintrag in `src/config/tokens.ts` die offiziellen Sepolia-Adressen von WETH, USDC und DAI plus vier Mocks; für WETH, USDC und DAI hat der Mock-Swap keine Paare. `[Annahme]` Die Deploys sind auf Sepolia noch aktiv.
- **V52** `[neu]` Auf jeder Chain bietet die Währungsauswahl beim Listen nur Token an, die auf dieser Chain existieren; auf Sepolia genau die Dummy-Liste. Die On-Chain-Whitelist (`getAllowedCurrencies`) bleibt die Autorität. `[Fakt]` `ExtendedCurrencySelector.tsx` zeigt auf Testnets alle 76 Mainnet-Token „als Vorschau" plus die Testnet-Token. `[Fakt]` `DiamondInit.sol` setzt 76 feste Mainnet-Adressen (ETH plus 75 ERC20) auf die Whitelist, ohne Chain-Unterscheidung. `[Schlussfolgerung]` Wurde der Sepolia-Diamond so initialisiert, gelten dort 75 Adressen als erlaubt, hinter denen kein Token steht; ein Listing darin wäre nicht kaufbar, V39 fängt es. `[offene Unsicherheit]` On-Chain-Stand der Sepolia-Währungs-Whitelist ungeprüft (`claude/todo.md`).
- **V53** `[neu]` Aus Wallet- oder Kaufansicht startet ein Nutzer einen Fiat-Kauf (Onramp) oder -Verkauf (Offramp) über ein eingebettetes Anbieter-Widget. Sitzungen oder Signaturen entstehen serverseitig; kein geheimer Schlüssel im Browser. Anbieter, Schlüssel und unterstützte Chains sind Konfiguration; auf nicht unterstützten Chains ist die Funktion ausgeblendet. In der Alpha läuft sie im Testmodus des Anbieters. `[Fakt, 07.09.2026]` Heute 0 Treffer für `moonpay`, `transak`, `onramp`, `offramp`. `[offene Frage]` W4; Vorlage `claude/recherche-fiat-onramp.md`.

### I. Oberfläche

- **V54** `[neu]` Kaufpfad (Übersicht → Detail → Kauf), Listing-Pfad und Wallet-Ansicht sind bei 360 px Breite ohne horizontales Scrollen bedienbar. `playwright.config.ts` hat mindestens ein Mobile-Projekt, und die E2E-Tests des Kaufpfads laufen dort grün. `[Fakt]` Heute kein `projects`-Eintrag; `BuyNowModal.tsx` enthält keine Breakpoint-Klasse.
- **V55** `[neu]` Ein Audio-NFT spielt auf der Detailseite im Audio-Player, ein Video-NFT im Video-Player. Die Erkennung läuft über den Medientyp, nicht über das Feld, in dem die URL steht. `[Fakt]` `page.tsx:211–212` setzt `videoUrl` und `audioUrl` hart auf `null`, der `<audio>`-Block in `MediaSection.tsx` ist damit tot; `getMediaType()` wird nur re-exportiert. `[Fakt, Plattform]` Der `media`-Block trennt `image`, `animation` und `audio`. Kein neues Modal.
- **V56** `[neu]` Öffentlich erreichbare schreibende Endpunkte ohne Wallet-Signatur verlangen einen serverseitig geprüften Bot-Schutz-Nachweis; der Melde-Endpunkt aus V41 gehört dazu. `[Fakt]` Heute IP-Rate-Limiting (`src/lib/middleware/rateLimit.ts`), kein Captcha. `[offene Frage]` P5.

### J. Repo und Recht

- **V57** `[in Umsetzung]` `LICENSE` ist der unveränderte MIT-Text mit der Zeile `Copyright (c) 2025-2026 Ideation Port UG (haftungsbeschränkt)`, und `package.json` trägt `"license": "MIT"` bei weiterhin `"private": true`. `[Fakt]` Erster Commit `bb0387c` vom 09.09.2025; der Platzhalter nannte „2024 NextJS NFT Marketplace" und stammte nicht aus einer fremden Vorlage. Umgesetzt auf `harness/lizenz-und-notice`, ungemergt.
- **V58** `[in Umsetzung]` Ein `NOTICE` im Wurzelverzeichnis nennt die direkten Produktionsabhängigkeiten mit Lizenz und Repository, dazu The Graph und die NFT Data Platform, und weist unter `sharp` auf die mitinstallierten `@img/sharp-libvips-*`-Pakete unter `LGPL-3.0-or-later` hin. 1inch kommt mit V49 dazu. Die Begründung für libvips steht in `state/assumption-ledger.md` mit dem Vorbehalt, sie vor jeder Weitergabe eines Images an Dritte neu zu bewerten.
- **V59** `[neu]` Kein Verweis im Repo zeigt mehr auf `NiklasHoffmann/nextjs-…`, `web3ideation/nextjs-…`, `wolf3i/…` oder den Platzhalter `yourusername`; alle zeigen auf das Repo im Firmen-Account `ideationport`. Ausgenommen `docs/CHANGELOG.md` (Historie) und `state/repo-audit-befunde.md` (Befundtext). Wird erst nach dem Umzug umgesetzt, sonst zeigen die Links auf einen Pfad, den es noch nicht gibt. `[Fakt]` Betroffen: `README.md:157` und `:466`, `docs/development/README.md:62`, `docs/development/setup.md:18`, `:669`, `:670`, `MigrationBanner.tsx:74`.
- **V60** `[neu]` Die Klasse-B-Befunde in `state/repo-audit-befunde.md` sind behoben oder mit Begründung zurückgestellt.

---

## Nicht-Ziele

| Nicht-Ziel | Begründung |
|---|---|
| Plattform-Code ändern | Eigenes Projekt bei Niklas, auch von anderen Anwendungen genutzt (Entscheidung 23). Lücken dort (Abschalt-Schnittstelle, Cache, Listen, Text-Index) baut er; wir umgehen sie nicht im Marktplatz. |
| Redesign der Oberfläche | Das bestehende GUI bleibt; neue Oberflächen nur für die Funktionen dieser Spec, im bestehenden Stil. |
| Contract- oder Subgraph-Änderungen bauen | Eigene Repos, andere Vertrauensgrenze, eigener Freigabeweg. |
| Zweites Sepolia-Deployment für die Alpha | Nicht nötig, kein Produktions-Contract, von dem zu trennen wäre (Entscheidung 29). |
| Eigener Router- oder Mint-Proxy-Contract für Lazy Minting | Bricht, sobald der Herausgeber-Contract den Absender prüft; neuer Contract-Code mit Audit-Bedarf. |
| Gutschein-basiertes Lazy Minting (signierte Voucher aus dem Backend eines Herausgebers) | Braucht je Herausgeber dessen API-Anbindung; eigenes Vorhaben je Fall. Die Adapter lassen es später zu. |
| Merkle-Beweise, für Mint-Whitelists wie für die `BuyerWhitelistFacet` | Entscheidung 15; Nice-to-have in `claude/todo.md`. |
| Provision vom Käufer als Regelfall | Entscheidung 25; nur Rückfall (V61). |
| Centralized Bot; automatisches Ausblenden oder Stornieren gemeldeter Listings | Entscheidung 26. Melde-Endpunkt und Admin-Ansicht sind so angelegt, dass ein Bot sie später mitnutzen kann. |
| Chain-Entscheidung | Wird nicht hier getroffen; V28 macht sie zur Konfigurationsfrage. |
| EUR-Fee-Logging; Token-Listen-Evaluierung; Subgraph-Kostenschätzung | Scope-Schnitt vom 11.09.2026. |
| Swap-/DEX-Seite, ERC20-Cards | Entscheidung 18. |
| Freigabe durch 1inch einholen; Onramp-Vertrag schließen; Satz der Provision festlegen | Liegen bei Stefan beziehungsweise beim Team; externe Vorbedingungen. |
| Likes, Ratings, Watchlist in die Plattform migrieren | Marktplatz-eigene Daten ohne Nutzen für dieses Ziel. |
| `nft_metadata` löschen | Rückfallweg bei Plattform-Ausfall (V32); Abbau ist ein eigener Schritt nach dem Umschalten. |
| Die bestehenden `any` sanieren; Tests für `src/app/history-towers/` | Altbestand beziehungsweise Modul ohne Bezug zum Datenpfad. |
| Doku und LICENSE anderer Repos (Contracts, Subgraph, Plattform, Legacy-NFT) | Betrifft andere Repos; die Schwester-Repos tragen noch den alten Namen (`claude/todo.md`). |
| `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`; SPDX-Kopfzeilen in Quelldateien | Kein Bedarf für dieses Ziel; eigener Punkt, falls externe Beiträge erwartet werden. |
| Repo-Umzug und Umbenennung des Firmen-Accounts | Macht Wolfgang parallel; die Spec setzt ihn voraus (V59). |

---

## Constraints

### Stack und Arbeitsweise

- `[Fakt]` Stack unverändert: Next.js 15 (App Router), React 18.3.1, TypeScript 5.4.5, MongoDB, wagmi 2 und viem 2, Node ≥ 20.19.
- `[Fakt]` Jede Route läuft über `apiHandler()`; kein handgeschriebenes try/catch mit `NextResponse`.
- `[Fakt]` Keine relativen Imports, keine Imports aus `archive/` oder `*.deprecated`; von ESLint durchgesetzt.
- `[Fakt]` Jede Änderung über eigenen Branch, PR und grünes `npm run check`; Branch Protection auf `main` ist scharf. Nach dem Repo-Umzug ist sie zu prüfen (`claude/todo.md`).
- `[Fakt]` Das Repo ist öffentlich; ADR 0001 schließt einen Historien-Scan mit gitleaks aus.

### Schnittstelle zur NFT Data Platform (unverändert hinzunehmen)

- `[Fakt]` HMAC-signierte Anfragen über `x-client-id`, `x-api-key`, `x-signature`, `x-timestamp`; Signatur Single-Use; Zeitversatz höchstens 300 Sekunden.
- `[Fakt]` Rate-Limit je Client in festen 60-Sekunden-Fenstern in Redis; an der Fenstergrenze bis zum Doppelten möglich. Bei Ausfall des Rate-Limit-Backends werden authentifizierte Anfragen abgelehnt (503), nicht durchgewinkt. Öffentliche Reads getrennt je IP mit 180.
- `[Fakt]` `POST /api/v1/owners/wallets/discover` verlangt `ownerAddress` plus 1 bis 500 Token-Identitäten; `GET /api/v1/owners/wallets/…` liest aus der Plattform-Datenbank. Ohne Indexing kennt die Plattform nur Token, die jemand gemeldet oder aufgefrischt hat.
- `[Fakt]` Indexing: Worker tickt alle 30 s, bis zu 10 Collections je Tick (älteste zuerst, Round-Robin), höchstens 2000 Blöcke je Durchgang, also rund 4000 Blöcke pro Minute und Collection bei bis zu zehn aktiven. Sepolia: Contract einen Monat alt etwa eine Stunde Block-Scan, sechs Monate etwa fünf bis sechs Stunden; nachgerechnet, in sich stimmig. Metadaten- und Medienanreicherung je Token kommt dazu, ungemessen, bei großen Collections dominierend. Erstregistrierung einer unbekannten Collection ist der teure Vorgang und fällt je Collection einmal an.
- `[Fakt]` Identische Refresh-Anfragen werden zu einem Job dedupliziert; veraltete Datensätze lösen je Zeitfenster höchstens eine Aktualisierung aus; die Abnahme der Plattform-Worker gegen den RPC-Anbieter ist unabhängig von unserem Limit begrenzt. Lesepfade blockieren nie auf Chain-IO.
- `[Fakt]` Der Status `disabled` ist im Schema, wird aber nirgends gesetzt; Abschaltung in beide Richtungen ist angekündigt.
- `[Fakt]` Antworten sind wegen HMAC und Replay-Schutz nicht per CDN oder Proxy cachebar; Listen-Antworten tragen den vollen `metadataPayload`; die Suche läuft ohne Text-Index. Alle drei sollen sich ändern (V37).
- `[Fakt]` Chain-Registry der Plattform: 1, 10, 137, 8453, 42161, 7777777, 11155111, 84532, 80002; je Chain eine `RPC_URL_<chainId>`. RPC: Alchemy, Infura als Reserve, heute kostenlose Pläne.
- `[Fakt]` Betrieb heute auf Niklas' VPS mit Coolify, ohne Backup. Vor dem Mainnet-Deploy eigener skalierbarer VPS mit Backup, S3 zu AWS oder Cloudflare.
- `[Fakt]` Lokal startet `docker compose` nur Mongo, Redis und MinIO; Web und Worker per `npm`. Nicht lokal prüfbar: Traefik-Header, TLS, echte Latenz.

### Chain und Contracts

- `[Fakt]` Ein Sepolia-Diamond `0x1107eb…`, ein Subgraph; Mainnet nicht deployt (Entscheidung 29). Owner-Rechte auf Sepolia bei Wolfgang und Niklas; auf Mainnet MultiSig (Entscheidung 30).
- `[Fakt, Contract]` `cleanListing(listingId)` ist ohne Berechtigung aufrufbar, löscht aber nur bei entfernter Collection, verlorenem Eigentum oder Balance oder fehlender Approval; sonst Revert `IdeationMarket__StillApproved`. `cancelListing` darf der Diamond-Owner für jedes Listing.
- `[Fakt, Contract]` Auszahlung beim Kauf atomar: Innovation-Fee → Royalty (ERC-2981; entfällt bei Empfänger `address(0)`) → Verkäufer.
- `[Fakt, Contract]` Collection-Whitelist: `addWhitelistedCollection`, `removeWhitelistedCollection`, Batch-Varianten, alle `onlyOwner`; Events `CollectionAddedToWhitelist(address)` und `CollectionRemovedFromWhitelist(address)`. Währungs-Whitelist über `CurrencyWhitelistFacet`, initial von `DiamondInit.sol` mit 76 Mainnet-Adressen gefüllt, ohne Chain-Unterscheidung.
- `[Fakt]` Buyer-Whitelist schreibt Adressen einzeln on-chain, höchstens 300 je Transaktion (`buyerWhitelistMaxBatchSize`).
- `[Schlussfolgerung]` Eine Detailseite löst drei Plattform-Aufrufe aus (Token, Owner, Collection). Bei 600 pro Minute sind das rund 200 Detailaufrufe pro Minute; die Übersicht kommt mit ein bis zwei Aufrufen aus, nicht mit einem je Karte.

### Voraussetzungen außerhalb dieses Repos

| Was | Bei | Blockiert |
|---|---|---|
| Keys aus `b6e0ca8` rotieren, Accounts auf Firmen-Mail | Niklas (läuft) | V29 |
| Alpha-Instanz der Plattform mit eigener Datenbank und eigenem Redis-Channel; Zugangsdaten `alpha-read` und `alpha-ops`; Referenzimplementierung der Signierung | Niklas | V14, V15, V38 |
| Alpha-Instanz des Marktplatzes auf Niklas' VPS, mit Web und Worker | Niklas (Aufsetzen), wir (Konfiguration) | V38, V62, V64 |
| Ausgehende IPs der Alpha für die IP-Allowlist melden | Wolfgang | V15 |
| Collections der Diamond-Whitelist als ein Issue im Plattform-Repo melden, ein Arbeitstag Vorlauf | Wolfgang | V33, V38 Stufe 2 |
| Rückmeldung, dass der Backfill durch ist | Niklas | V38 Stufe 2 |
| Abschalt-Schnittstelle für Collections | Niklas (angekündigt) | V63 vollständig; bis dahin manuell |
| Sepolia-Mocks auf der Währungs-Whitelist des Diamond setzen oder bestätigen | Diamond-Owner Sepolia | V51, V52 |
| Herausgeber-Contract als erstes Adapter-Ziel | offen | Gruppe G produktiv |
| Satz der Provision | Team | V61 im Go-Live |
| Freigabe „Powered by 1inch" | Stefan | V49 |
| Onramp-Anbieter, Vertrag, Schlüssel | Team (W4) | V53 |
| Repo-Umzug in `ideationport`, Zielname des Repos | Wolfgang (läuft) | V59 |
| Bezahlter RPC-Plan; Plattform-Umzug auf eigenen VPS mit Backup | Niklas | Go-Live |

### Bekannte Risiken

| Risiko | Wirkung | Gegenmittel |
|---|---|---|
| Zugangsdaten aus der Historie noch gültig | Zugriff auf Datenbank, Verbrauch fremder Kontingente | V29 |
| Plattform ohne CI, ohne Backup, an einer Person | Regressionen und Ausfälle schlagen in den Shop durch | V32, V37, Plattform-Umzug vor Mainnet |
| Kostenloser RPC-Plan reicht für Indexing plus Erstregistrierung nicht | Backfill stockt, Stufe 2 der Alpha verzögert | Niklas wechselt auf bezahlten Plan; Collections gesammelt melden |
| Angekündigte Plattform-Änderungen (Cache, Listen, Text-Index) ändern Antwortformen | Mapper brechen | V37, Vertragstests |
| Alpha und bestehende Instanz teilen Chain-Zustand | Whitelist-Änderungen der Alpha sofort überall sichtbar | Entscheidung 29, bewusst hingenommen |
| Sepolia-Währungs-Whitelist enthält Mainnet-Adressen | Listings in Währungen, die niemand zahlen kann | V52, V39 |
| Missbrauch des Melde-Endpunkts | Rauschen in der Admin-Ansicht | V41, V56 |
| Herausgeber-Contract zahlt die Provision nicht | Einnahmeverlust | V61 prüft vor dem Mint, P7 |
| Wallet ohne Batch-Unterstützung beim Käufer-Aufschlag | Zwei Bestätigungen, Abbruch nach der ersten möglich | V61: Provision zuerst, Mint danach |
| Festfenster-Limit | 429 bei Lastspitzen | V34 |
| Onramp-Anbieter nimmt eine kleine UG nicht, oder unsere Rolle ist regulatorisch unklar | V53 nicht lieferbar | W4, `claude/recherche-fiat-onramp.md` |

---

## Offene Fragen

Wortlaut und Empfehlungen in `claude/offene-fragen.md`. Der Advisor-Pass bekommt diese Stellen als Fokus.

- **An Wolfgang:** W4 Onramp-Anbieter (Team) · W6 Zeitpunkt der Abhängigkeits-Sanierung (ADR 0002) · W7 Go-Live-Zeitpunkt
- **An Niklas:** nichts offen
- **Im Plan zu klären:** P1 Mechanik der Listing-Prüfung (Bündel-Simulation oder Storno-Angebot) · P3 Ort der Adapterdokumentation und Test-Double · P4 Swap-Test gegen Fork oder Mock · P5 Bot-Schutz-Anbieter und Endpunktliste · P7 Nachweis der Provision je Contract-Typ · P8 zwei Zugangsdatensätze in der Client-Schicht · P9 Kopplung der Registrierung: Event-Listener auf `CollectionAddedToWhitelist` oder Aufruf aus der Admin-Oberfläche nach dem Vollzug
- **Offene Unsicherheiten:** `getCollection` in `src/lib/mongodb.ts` verwirft das Promise von `getClientPromise()` · `scripts/check-env.js` prüft `NEXT_PUBLIC_SUBGRAPH_V2_URL`, `apolloClient.ts` liest `NEXT_PUBLIC_SUBGRAPH_URL` · On-Chain-Stand der Sepolia-Währungs-Whitelist · Konstruktor-Owner des Sepolia-Diamond `0xE8dF60a9…` ist als Adresse belegt, nicht als MultiSig oder EOA

---

## Änderungsnachweis

- 09.09.2026: Entscheidungen 8 und 9, V15, V16 und Constraint-Zeilen ergänzt nach Erhebung im Plattform-Repo.
- 11.09.2026, v3: Scope-Schnitt (10–12), Backlog als Gruppen F bis J, Niklas' Agent-Analysen nachgeprüft (V30–V38), Contract- und MultiSig-Quellen ausgewertet, Wolfgangs Entscheidungen 13–23. Ab hier stabile V-Nummern.
- 11.09.2026, v3.1: Entscheidungen 24–28 (Lazy Minting, Provision, gemeldete Käufe, Testweg, Indexing-Umfang).
- 14.09.2026, v4: Niklas' Antworten zu Betrieb, Staging und Allowlist eingearbeitet. Entscheidung 28 in der ursprünglichen Lesart wiederhergestellt (Registrierung ist das Tor, Env-Allowlist ist Notbremse) und um die Kopplung an den Whitelist-Vollzug erweitert; die Zwischenaussage „kein Self-Service" ist überholt. Neu: Entscheidungen 29–33 (ein Sepolia-Diamond, Owner, Single-Use-Signatur, Meldeweg, Alpha-Instanzen als Voraussetzung); V61 Provisionsweg, V62 Worker in der Alpha, V63 Kopplung Registrierung, V64 Redis-Channel je Umgebung. Problem 3 (Live-Updates nur bei offenem Tab) neu benannt, V36 danach präzisiert. V14, V15, V38, V42 auf zwei Clients, zwei Abnahmestufen und beide Owner-Wege umgestellt. V43, V44 von „Schnittstelle, die ein Contract erfüllen muss" auf Adapter je Contract-Typ umgestellt. V57, V58 als in Umsetzung markiert, V59 auf `ideationport` umgestellt. Zwei zwischenzeitlich angenommene Punkte (zweites Deployment auf einer Chain, eigener Subgraph für die Alpha) nach Prüfung im Contract-Repo verworfen. Plattform-Seite und Marktplatz-Seite durchgehend getrennt.
