<!-- Ziel-Pfad im Repo: state/plan-v1-plattform-integration.md -->
# Plan v1 — Anbindung der NFT Data Platform (Gruppen A und B)

Stand: 15.09.2026 · Erarbeitet gegen `specs/marktplatz-fertigstellung.md` v4 (14.09.2026),
`docs/api/nft-data-platform-marketplace-migration.md` (Marktplatz-Seite 27.08.2026,
Plattform-Seite 03.09.2026), `ARCHITECTURE.md`, `docs/STATUS.md`,
`state/repo-audit-befunde.md`, `state/assumption-ledger.md`.

Evidenz-Marker: `[Fakt]` belegt · `[Schlussfolgerung]` abgeleitet · `[Annahme]` ungeprüft ·
`[offene Frage]` ungeklärt.

> **Provenienz dieser Datei, Vermerk vom 13.10.2026.** `[Fakt]` Diese Datei wurde am 25.09.2026
> **in sich** überarbeitet, bevor irgendein Advisor-Pass gelaufen war: Abschnitt 9 (E1–E3) kam
> hinzu, die Auflage 3 wurde umgeschrieben, in Abschnitt 3 kamen der A0-Nachtrag und die offene
> Frage zum Prüfstand-Commit dazu, in A1 und A3 wurde der Testpfad korrigiert, in A2 die
> V64-Empfehlung angenommen, A-4 entschieden. `[Fakt]` Die Fassung vor dieser Überarbeitung liegt
> in keiner Git-Historie — die Datei war bis Commit `8b91020` nicht getrackt.
> `[Schlussfolgerung]` Damit ist für diese eine Überarbeitung nicht belegbar, was sie verändert
> hat; das verstößt gegen Punkt 9 von `.claude/skills/advisor-pass/SKILL.md` und ist nur noch als
> Vermerk heilbar, nicht als Beleg. Geführt in `state/assumption-ledger.md`.
> **Ab hier gilt der Skill wieder buchstäblich:** diese Datei bleibt von jetzt an unverändert, der
> Pass schreibt `state/advisor-findings-plattform-integration.md`, und das Ergebnis ist
> `state/plan-v2-plattform-integration.md`. Was dort anders ist als hier, ist die Wirkung des
> Passes — und diesmal nachprüfbar.

> **Erhebungsgrenze dieses Plans.** `[Fakt]` Er entstand aus der Projektwissens-Suche über das
> synchronisierte Repo, nicht aus vollständig gelesenen Dateien. Jede Datei-, Zeilen- und
> Vollständigkeitsangabe unten ist deshalb als Ausgangspunkt zu behandeln, nicht als Inventar.
> Der erste Schritt jedes Pakets ist „Ist-Zustand lesen" (Regel 2 aus
> `.claude/skills/handoff-vertrag/SKILL.md`). Wo dieser Plan eine Grep-Prüfung verlangt, ersetzt
> sie eine Behauptung, die hier bewusst nicht aufgestellt wird.

---

## 1. Ergebnis der Prüfung

`GO_MIT_AUFLAGEN`

Der Zielumfang ist durch Spec v4 gedeckt und deckt sich mit `ARCHITECTURE.md`. Drei Auflagen
stehen vor dem ersten Handoff-Vertrag:

1. **Vorrang klären.** `[Fakt]` `docs/api/nft-data-platform-marketplace-migration.md` trägt einen
   eigenen „PR-Ready Delivery Plan" mit sieben PRs, erhoben am 27.08./03.09.2026. `[Fakt]` Spec v4
   vom 14.09.2026 enthält V30–V34 und V63 (Push-Meldungen, Medien-Block, Whitelist-Filter,
   Registrierung, Rate-Limit-Auswertung), die in diesem PR-Plan **nicht** vorkommen.
   `[Schlussfolgerung]` Wer Claude Code den PR-Plan gibt, verliert diese sechs V-Aussagen
   stillschweigend. → Artefakt A-1 (Kopfzeile im Migrationsdokument).
2. **Reihenfolge korrigieren.** Das Migrationsdokument stellt die Wallet-Migration an den Anfang
   („highest-value migration area"). `[Fakt]` Ohne Indexing bewegt sich das Lesemodell der
   Plattform nur bei Discover-/Refresh-Aufrufen oder TTL-Revalidierung (Spec, V30). `[Fakt]` Schon
   ein Token-Refresh registriert die Collection des Tokens auf der Plattform
   (`handleRefreshToken` → `ensureCollectionRegistration`, V33). `[Schlussfolgerung]` Die
   Wallet-Migration ohne vorherige Leitplanken liefert leere Ansichten *und* der erste Aufruf einer
   beliebigen Detail-URL kann eine fremde Collection ins Indexing ziehen und dort RPC-Kosten
   erzeugen. Der Whitelist-Filter (V33) ist deshalb **Voraussetzung, nicht Aufräumarbeit**.
3. **Prüfweg der Integrationstests entscheiden.** `[erledigt 25.09.2026]` Siehe Abschnitt 9,
   Entscheidung E3. `[Fakt]` Plan v1 verwies hier auf ein „unten", das es nicht gab: E1, E2 und E3
   waren in beiden Plänen sechsmal referenziert und nirgends definiert. Abschnitt 9 schließt die
   Lücke.

---

## 2. Zielbild in einem Satz

Alle NFT-Daten (Token, Collection, Ownership, Suche, Wallet-Inventar) kommen über eine
server-only Client-Schicht aus der NFT Data Platform; TheGraph bleibt alleinige Listing-Quelle;
die lokale MongoDB behält Stats, Interaktionen, Insights — und bis auf Weiteres den Rückfallweg
`nft_metadata` (V32).

---

## 3. Vorbedingungen (Paket A0, kein Code)

| Was | Bei | Blockiert |
|---|---|---|
| Zugangsdaten `alpha-read` und `alpha-ops` je Umgebung | Niklas | A1, A2 |
| Ausgehende IPs der Alpha für die IP-Allowlist melden | Wolfgang | A1 |
| Lokale Plattform-Instanz lauffähig (Mongo, Redis, MinIO per `docker compose`; Web und Worker aus dem Plattform-Workspace) | Wolfgang (lokal) | A1, alle Integrationstests |
| Plattform-Commit als Prüfstand festhalten (V37) | Wolfgang | A1 |
| ~~Referenzimplementierung der Signierung~~ — **erfüllt**, siehe Nachtrag | Niklas | — |

`[Fakt]` Alle vier Zeilen stehen so in `specs/marktplatz-fertigstellung.md`, Abschnitt
„Voraussetzungen außerhalb dieses Repos".

**Nachtrag 25.09.2026 — A0 ist teilweise erfüllt.** `[Fakt]` Die Signierungs-Referenz liegt lesbar
im lokalen Plattform-Workspace: `packages/security/src/index.ts` (`canonicalizeSignedRequest`,
`createRequestSignature`, `isTimestampFresh`) und `scripts/hmac-request.ts` als vollständiges
Aufrufbeispiel. Die kanonische Regel ist damit belegt und nicht mehr zu erfragen: HMAC-SHA256 über
`[METHOD, pathname+search, sha256hex(body), timestampSekunden].join("\n")`, Header `x-client-id`,
`x-api-key`, `x-signature` (hex, 64 Zeichen), `x-timestamp`; die Plattform akzeptiert Sekunden und
Millisekunden (`isTimestampFresh`). `[Schlussfolgerung]` A1 ist damit **baubar und unit-prüfbar**,
ohne dass Zugangsdaten vorliegen. Nicht abnehmbar bleibt allein der Live-Lauf für V11 (409/200) —
der braucht laufende Instanz, Zugangsdaten und IP-Allowlist. Er ist deshalb aus der A1-DoD gelöst
und in E3 geregelt.

**`[offene Frage]` Welcher Commit ist der Prüfstand (V37)?** `[Fakt]` Spec v4 pinnt die Plattform
auf `7915b52`; der lokale Plattform-Workspace steht auf `5dda8c7` („docs: document the indexing
gate and the collection off switch"). `[Schlussfolgerung]` Ein Mapper, der gegen den falschen Stand
gebaut wird, bricht beim ersten Live-Lauf. Gehört nach A0, blockiert A1 nicht (die Signierung ist in
beiden Ständen dieselbe), blockiert aber A3 und A5–A9.

---

## 4. Paketschnitt

Jedes Paket = ein Handoff-Vertrag unter `state/tasks/` = ein Baudurchgang plus höchstens eine
Korrekturrunde, mit eigenständig prüfbarem Artefakt.

### A1 — Transport und Signierung
**Deckt:** V10, V11, V15, V16, V34
**Baut:** `src/lib/nft-data-platform/client.ts`, `errors.ts` (Transport-Teil)
**Inhalt:** HMAC-Signierung über `x-client-id`, `x-api-key`, `x-signature`, `x-timestamp`;
Wiederholung signiert **neu** statt zu wiederholen; `409 replayed_request` ≠ endgültiger Fehler;
`429` mit Backoff, davon unterschieden; `503` als `PLATFORM_UNAVAILABLE`; Timeout; Auswertung von
`x-ratelimit-limit`/`-remaining` je Client; Nebenläufigkeitsdeckel unter dem Fensterlimit.
Zwei Zugangsdatensätze: Lesen/Discover/Token-Refresh über Read, Collection-Registrierung über Ops
(P8).
**[EMPFEHLUNG] zu P8:** ein Client-Objekt, zwei Zugangsdatensätze, Auswahl am Aufrufpunkt über
einen expliziten Parameter `credentials: 'read' | 'ops'` — nicht zwei Client-Klassen. Begründung:
Signierung, Backoff, Fehlernormalisierung und Rate-Limit-Protokoll sind identisch; zwei Klassen
verdoppeln genau den Teil, der am ehesten falsch wird. Verwerfen, sobald ein dritter
Zugangsdatensatz mit anderem Transportverhalten dazukommt.
**Prüfbar:** dieselbe signierte Anfrage zweimal → 409; korrekt neu signierte Wiederholung → 200;
Timeout-Wiederholung ebenfalls neu signiert. Unit-Test `src/lib/nft-data-platform/signing.test.ts`
gegen einen Mock-Transport, Live-Lauf über das Smoke-Skript aus E3.

**Korrektur 25.09.2026 zum Testpfad.** `[Fakt]` `vitest.config.ts` setzt
`include: ["src/**/*.test.{ts,tsx}"]`. `[Schlussfolgerung]` Der in Plan v1 genannte Pfad
`tests/unit/…` wäre von `npm run test:run` nie ausgeführt worden — ein Test, der nur deshalb nicht
rot wird, weil er nicht läuft. Tests liegen neben der Quelle unter `src/lib/nft-data-platform/`.
Gilt ebenso für A3.

### A2 — Konfiguration, Flag, Startprüfung
**Deckt:** V14, Entscheidung 7
**Berührt:** `src/config/app.config.ts`, `scripts/check-env.js`, `.env.local.template`,
`.env.production.template`, `docs/environment/ENV_VARIABLES.md`
**Inhalt:** `FEATURES.NFT_DATA_PLATFORM_ENABLED`; `NFT_API_BASE_URL` plus zwei Zugangsdatensätze
ausschließlich serverseitig, kein `NEXT_PUBLIC_`-Spiegel; `npm run env:check` schlägt fehl, wenn
das Flag an ist und eine der Variablen fehlt.
`[Fakt]` `scripts/check-env.js` prüft heute `MONGODB_URI`, `JWT_SECRET`,
`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_MARKETPLACE_ADDRESS` und in `production`
zusätzlich `NEXT_PUBLIC_SUBGRAPH_V2_URL`; die Prüfung ist eine feste Liste ohne Bedingungen.
`[Schlussfolgerung]` Für eine flag-abhängige Pflichtprüfung muss die Listenstruktur um eine
bedingte Gruppe erweitert werden — das ist eine Strukturänderung an `check-env.js`, keine
zusätzliche Zeile.
**[EMPFEHLUNG]:** V64 (`REDIS_SSE_CHANNEL` als Pflichtvariable) in **diesem** Paket mitnehmen,
weil dieselbe Struktur gebraucht wird und ein zweites Paket dieselbe Datei erneut umbaut.
Verwerfen, wenn Wolfgang die Gruppen A/B und C strikt getrennt abnehmen will.
**`[entschieden 25.09.2026]` Angenommen** — V64 läuft in A2 mit.
**Prüfbar:** `npm run env:check` rot bei Flag an und fehlender Variable, grün bei Flag aus.

### A3 — Normalisierung, DTOs, Cursor
**Deckt:** V12, V13, Entscheidung 4
**Baut:** `src/lib/nft-data-platform/types.ts`, Normalisierung in `client.ts`, typisierte Methoden
(`getTokenDetail`, `getTokenOwners`, `getWalletInventory`, `listCollections`,
`getCollectionDetail`, `searchEntities`, `discoverTokens`, `discoverWalletHoldings`,
`queueTokenRefresh`, `queueCollectionRefresh`)
**Inhalt:** Die in `docs/api/nft-data-platform-marketplace-migration.md` beschriebenen
`Platform*`-DTOs; Cursor-Paginierung durchgängig; die Zeichenkette `page` kommt im Client nicht vor;
Filter sind einwertig, Ausnahme `chainIds` am Wallet-Endpunkt; Freitextsuche nur über
`/api/v1/search?q=`.
`[Fakt]` Die Plattform ignoriert unbekannte Parameter still und antwortet `200` mit einer
ungefilterten ersten Seite. `[Schlussfolgerung]` Ein Test, der nur „Anfrage erfolgreich" prüft,
belegt nichts. Pflicht: zweite Seite enthält andere Elemente als die erste.
**Prüfbar:** `src/lib/nft-data-platform/pagination.test.ts` (Pfad: siehe Korrektur in A1);
Routencode kennt keine
Rohfeldnamen der Plattform (Grep auf `metadataUriResolved`, `pageInfo` außerhalb von
`src/lib/nft-data-platform/`).

### A4 — Leitplanken: Whitelist-Filter, Registrierung, Push
**Deckt:** V30, V33, V63
**Inhalt:** (a) Quelle der Wahrheit für „registrierungsfähig" ist die Diamond-Whitelist
(`getWhitelistedCollections`); jeder Registrierungs-, Discover- und Refresh-Aufruf wird dagegen
gefiltert. (b) Neues Listing aus TheGraph → genau ein `POST /api/v1/tokens/discover`; Kauf,
Stornierung, Transfer → `POST /api/v1/refresh/token`. (c) `CollectionAddedToWhitelist` →
genau ein `POST /api/v1/refresh/collection`; `CollectionRemovedFromWhitelist` → Eintrag
„Abmeldung an Plattform ausstehend" in der Admin-Ansicht.
**[EMPFEHLUNG] zu P9:** Kopplung im Worker an den bestehenden Event-Pfad
(`src/services/nft-sync/index.ts` hört bereits über WebSocket auf Marktplatz-Ereignisse), plus
ein Admin-Knopf als Nachzieh-Weg. Begründung: die Registrierung an den Vollzug der Freigabe zu
koppeln ist genau das, was V63 verlangt; ein reiner Admin-Knopf verschiebt die Kopplung auf
Disziplin. Verwerfen, wenn der Worker in der Zielumgebung nicht garantiert läuft — dann ist der
Admin-Weg der einzige verlässliche.
**Warum vor A5:** `[Schlussfolgerung]` siehe Auflage 2 oben. Ohne (a) ist eine fremde Collection
einen Seitenaufruf weit davon entfernt, auf Niklas' Kosten indiziert zu werden.
**Prüfbar:** Aufruf von `/api/nft/detail` mit einer fremden Contract-Adresse erzeugt keinen
Plattform-Aufruf mit `refresh:token`; nach einem Listing-Ereignis steht genau ein Discover mit
dieser Token-Identität im Aufrufprotokoll.

### A5 — `/api/wallet/nfts`
**Deckt:** V2, V3, V6 · **Berührt:** `src/app/api/wallet/nfts/route.ts`,
`src/lib/nft-data-platform/mappers/wallet.ts` (neu), `src/contexts/wallet-nfts/WalletNFTsService.ts`
**Inhalt:** Lesen aus `GET /api/v1/owners/wallets/:ownerAddress`, Mehr-Chain über `chainIds`;
Listing-Join aus `marketplace_items`, Stats-Join aus `nft_stats`; Abbildung auf die bestehende
`WalletNFT`-Hülle (`success`, `data`, `total`); `token: null` ergibt trotzdem einen Eintrag mit
Contract-Adresse und tokenId, `hasMarketplaceData` allein aus dem Listing-Join; `owner`/`balance`
aus der Holding-Zeile, nie aus der Token-Antwort.
`[Fakt]` Die Route führt heute zwei Caches (`walletNftsResponseCache` in-memory plus
Shared-Cache) und einen `source`-Parameter (`auto` | `alchemy` | `moralis` | `blockchain`) sowie
`skipPersist`. `[Schlussfolgerung]` Der Cache-Schlüssel enthält `source` und `skipPersist`; wird
`source` bedeutungslos, muss der Schlüssel mit, sonst liefern alte Schlüssel weiter alte Antworten.
Das gehört in den Scope dieses Pakets, nicht in den Abbau.

### A6 — `/api/user/nfts/sync`
**Deckt:** Entscheidung 13 · **Berührt:** `src/app/api/user/nfts/sync/route.ts`
**Inhalt:** Aus der Metadaten-Pipeline wird Orchestrierung: authentifizierte Wallet wie heute,
bekannte Token-Identitäten sammeln, `POST /api/v1/owners/wallets/discover` (1–500 Identitäten je
Aufruf), Antwort unterscheidet `discover queued` / `already indexed` / `upstream unavailable`
(`discoveryTriggered`, `discoveryJobId`, `source`, `indexingState`). Keine Metadaten aus Chain
oder IPFS mehr in dieser Route.
`[Fakt]` Die Discover-Route verlangt die Token-IDs als Eingabe. `[Schlussfolgerung]` Die Route
kann nur melden, was der Marktplatz schon kennt (Listings, frühere Holdings) — sie ist kein
Wallet-Crawler-Ersatz. Das ist in der Oberfläche als dritter Zustand zu zeigen (A8), nicht in
dieser Route zu kaschieren.

### A7 — `/api/nft/detail`
**Deckt:** V4, V5, V6, V31 · **Berührt:** `src/app/api/nft/detail/route.ts`,
`src/lib/nft-data-platform/mappers/token-detail.ts` (neu),
`src/hooks/marketplace/useMarketplaceItemDetail.ts`
**Inhalt:** Token aus der Plattform statt aus `nft_metadata`; Ownership über den
Ownership-Endpunkt; Collection aus der Collection-Antwort; kein synchrones Nachladen aus Chain
oder IPFS. Nicht indiziert → HTTP 404 mit `code: "TOKEN_NOT_INDEXED"`, `refreshQueued`,
`refreshJobId`, `contractAddress`, `tokenId`, `chainId`; außerhalb der Diamond-Whitelist ist
`refreshQueued` immer `false`. Medien ausschließlich als CDN-URLs aus dem `media`-Block
(`cdnUrlOriginal`, `cdnUrlOptimized`, `cdnUrlThumbnail`); weder Routencode noch Browser ruft
`/api/media` der Plattform.
`[Fakt]` Die Route ruft heute `blockchainStateSync` (5-Minuten-TTL) und
`ipfsMetadataLazySync.ensureMetadata()` auf und liest `nft_metadata` als ersten Schritt.
`[Schlussfolgerung]` Eine Detailseite löst künftig drei Plattform-Aufrufe aus (Token, Owner,
Collection); bei 600 Anfragen pro Minute sind das rund 200 Detailaufrufe pro Minute — das ist der
enge Punkt im Rate-Limit und gehört in das Performance-Budget (V22).
**Nicht hier:** die lokalen Bild-Varianten (`buildNFTImageVariants`) abbauen — solange
`nft_metadata` Rückfallweg ist (V32), werden sie dort gebraucht. → Abbauplan, R3.

### A8 — Merge-Schicht, Karten, Zustände
**Deckt:** V32 (Anzeigeteil), UI-Zustandsmodell aus dem Migrationsdokument
**Baut:** `src/services/marketplace/marketplace-view-composer.ts` mit
`composeMarketplaceCard()`, `composeMarketplaceDetail()`, `composeWalletNFT()` — je drei
getrennte Eingaben: Listing, normalisierte Plattform-DTOs, lokale Stats/Insights.
**Inhalt:** Zustände explizit: Listing ohne Token, Holding ohne Token, Token ohne Collection,
`TOKEN_NOT_INDEXED`, `refreshQueued`, `PLATFORM_UNAVAILABLE`. Bei Ausfall bleiben Übersicht,
Detailseite und Kauf nutzbar (Listings aus TheGraph, Metadaten aus dem Rückfallweg, sichtbar als
möglicherweise veraltet); Wallet und Suche zeigen `PLATFORM_UNAVAILABLE` statt eines generischen
Fehlers.
`[Schlussfolgerung]` Der degradierte Pfad ist kein eigenes Paket: die Quellenwahl gehört in jede
migrierte Route (A5–A7, A9) als DoD, die *Anzeige* gehört hierher. Wird er als Schlussphase
geplant, entsteht genau die Ausbaustufe, die `CLAUDE.md` als DoD-Verstoß führt.

### A9 — `/api/collections` und Suche
**Deckt:** V7, Entscheidung 5 · **Berührt:** `src/app/api/collections/route.ts`,
`src/contexts/collections/CollectionsService.ts`,
`src/lib/nft-data-platform/mappers/collection.ts` (neu)
**Inhalt:** Welche Contracts angezeigt werden, kommt weiter aus aktiven Listings; Name, Symbol,
`preview`, `recentTokens`, `indexedTokenCount`, `holderCount` kommen aus der Collection-Antwort
statt aus einer `nft_metadata`-Aggregation. Suche über `/api/v1/search?q=`, nicht über einen
`search`-Parameter an der Token-Liste.

### A10 — Abnahme und Umschalten
**Deckt:** V38 · kein Code, Nachweisarbeit.
Stufe 1 bei leerem Index: Signierung, 409-Test, 429-Verhalten, degradierter Pfad, Registrierung.
Stufe 2 nach Niklas' Backfill-Meldung: Wallet-Ansicht, Detailseite, Sell-Flow, Kaufpfad.
Erst danach Flag an in der Produktion.

---

## 5. Abhängigkeiten

```
A0 ──► A1 ──► A2 ──► A3 ──► A4 ──┬──► A5 ──► A6
                                 ├──► A7 ──► A8
                                 └──► A9
A5, A6, A7, A8, A9 ──► A10 ──► Flag an ──► Abbauplan R2/R3
```

`[Schlussfolgerung]` A5–A7 und A9 sind nach A4 parallelisierbar, A8 nicht — die Merge-Schicht
braucht mindestens A7 als ersten Nutzer, sonst wird sie auf Vorrat entworfen (YAGNI).

---

## 6. Was dieser Plan ausdrücklich nicht enthält

| Nicht enthalten | Warum |
|---|---|
| Löschen von Altpfaden | Eigener Plan (`state/plan-v1-abbau-altpfade.md`), eigenes Tor: erst nach Flag an und Abnahme |
| `nft_metadata` abbauen | Nicht-Ziel der Spec, Rückfallweg für V32 |
| V35 (Hintergrunddienst startet beim Laden eines Routen-Moduls, `src/app/api/marketplace/sync/route.ts:14–40`) | Gruppe C, eigener Befund, berührt den Datenpfad nicht |
| V39–V42 Kaufsicherheit, Gruppe F | Anderer Problemkreis derselben Spec |
| Änderungen an der Plattform | Nicht-Ziel: eigenes Projekt bei Niklas |
| Likes, Ratings, Watchlist migrieren | Nicht-Ziel der Spec |

---

## 7. Risiken, die dieser Plan trägt

| Risiko | Wirkung | Gegenmittel im Plan |
|---|---|---|
| Fremde Collection wird durch einen Seitenaufruf ins Indexing gezogen | RPC-Kosten bei Niklas, ungewollte Registrierung | A4 vor A5–A9 |
| Angekündigte Plattform-Änderungen (Cache, schlankere Listen, Text-Index) ändern Antwortformen | Mapper brechen | A0 pinnt den Plattform-Commit (V37), A3 kapselt Rohformen |
| Still ignorierte Parameter täuschen grüne Tests vor | Falsche Daten sehen gesund aus | A3, Pflichttest „zweite Seite ≠ erste Seite" |
| Detailseite × drei Aufrufe trifft das Fensterlimit | `429` unter Last | A1 (Backoff, Nebenläufigkeitsdeckel), A7 (Performance-Budget) |
| Rückfallweg `nft_metadata` altert nach dem Umschalten | V32 wird formal erfüllt, faktisch wertlos | Entscheidung E1 |

---

## 8. Artefakte, die vor dem ersten Vertrag entstehen

- **A-1** Kopfzeile in `docs/api/nft-data-platform-marketplace-migration.md`: „Endpunkt- und
  Vertragsdetails gelten; der Abschnitt *PR-Ready Delivery Plan* ist durch
  `specs/marktplatz-fertigstellung.md` v4 und `state/plan-v1-plattform-integration.md` überholt."
  Grund: zwei Reihenfolgen im Repo, von denen eine sechs V-Aussagen nicht kennt.
- **A-2** ADR-Entwurf „Rückfallweg `nft_metadata` nach dem Umschalten" — nur, wenn E1 auf
  Cache-Through fällt (neue Schreibrichtung = Architekturentscheidung, gehört nicht still in Code).
- **A-3** Zeile in `state/gates.md` für `npm run env:check` in seiner neuen, flag-abhängigen Form.
- **A-4** `[entschieden 25.09.2026]` Ablage für Befunde: kein neues `state/findings.md`. Annahmen
  und offene Punkte gehen nach `state/assumption-ledger.md`, Arbeitspakete als eigene
  `state/tasks/*.md`, Doku-Drift nach `state/repo-audit-befunde.md`. Begründung: alle drei Dateien
  existieren und werden gepflegt; eine vierte Ablage verteilt die Wahrheit auf mehr Orte, als sich
  nachziehen lassen.

---

## 9. Entscheidungen E1–E3

`[Fakt]` Plan v1 verwies an sechs Stellen auf E1, E2 und E3 — in Auflage 3, in der Risikotabelle,
in Artefakt A-2 sowie im Abbauplan in den Toren T1/T2, in R2 und in R3 — ohne sie irgendwo zu
definieren. Dieser Abschnitt ist nachgetragen (25.09.2026) und ist die Quelle für beide Pläne.

### E3 — Prüfweg der Integrationstests · `entschieden 25.09.2026`

**Entscheidung:** Die CI prüft gegen einen Mock-Transport, nie gegen eine echte Instanz. Der Lauf
gegen die laufende Plattform ist ein Skript, das ein Mensch ausführt und dessen Ergebnis in A10
protokolliert wird.

Was daraus folgt, verbindlich für A1, A3, A5–A9:

- Die CI bleibt ohne Netzzugang und ohne Plattform-Zugangsdaten grün. Kein CI-Secret, keine
  Runner-IP in der Allowlist, keine Abhängigkeit von der Verfügbarkeit der Alpha.
- Unit-Tests prüfen gegen bekannte Vektoren und einen einspeisbaren Transport: kanonische
  Zeichenkette und Signatur, frische Signatur bei jeder Wiederholung, `409 replayed_request` als
  nicht-endgültiger Fehler, `429` mit Backoff davon unterschieden, `503` als
  `PLATFORM_UNAVAILABLE`, Timeout, Auswertung von `x-ratelimit-*`, Nebenläufigkeitsdeckel.
- Das Smoke-Skript (`npm run platform:smoke`, Paket A1) fährt V11 gegen eine erreichbare Instanz:
  dieselbe signierte Anfrage zweimal → 409, korrekt neu signierte Wiederholung → 200. Es ist
  **kein** Teil von `npm run check` und bricht ohne Zugangsdaten mit einer klaren Meldung ab,
  statt zu behaupten, es sei nichts zu prüfen.
- `[Schlussfolgerung]` Ein grünes `npm run check` belegt für A1 die Signaturmechanik und das
  Fehlerverhalten, **nicht** V11. V11 gilt erst mit einem protokollierten Smoke-Lauf als erfüllt.
  Diese Grenze steht in der A1-DoD, damit sie nicht später als Versäumnis gelesen wird.
- Verworfen: CI gegen die Alpha (macht die CI von einer externen Instanz abhängig und legt
  Zugangsdaten in die CI) und Plattform per `docker compose` in der CI (voller Lauf, aber langsam
  und an den Prüfstand-Commit gebunden, der laut A0 noch offen ist).

### E2 — Stabilitätszeitraum vor dem Abbau · `offen`

**Frage:** Wie lange muss das Flag in der Produktion an und unauffällig sein, bevor R2 den
Rückfallweg über das Flag aufgibt und R3/R4 die lokale Anreicherung abbauen?

**Entscheider:** Wolfgang. **Fällig:** vor Tor T1 (R2), spätestens vor T2.
**Blockiert jetzt nichts** — A1 bis A10 laufen unabhängig davon.
`[Schlussfolgerung]` Ohne eine genannte Zahl ist „stabil" im Abbauplan eine Ermessensfrage, und
Ermessen entscheidet im Zweifel für das Aufräumen. Deshalb eine Zahl, kein Gefühl.

### E1 — Befüllung des Rückfallwegs nach dem Umschalten · `offen`

**Frage:** Bleibt `nft_metadata` nach dem Umschalten beschreibbar, oder friert es ein?

`[Schlussfolgerung]` Entfernt R3 alle Schreibpfade, hält V32 dem Wortlaut nach („als möglicherweise
veraltet gekennzeichnet"), altert der Rückfallweg aber ab dem Umschalttag monoton — bei einem
Ausfall in sechs Monaten zeigt er sechs Monate alte Daten für alles, was seither neu ist, und für
neue Token gar nichts.

Zwei vertretbare Wege:

- **(a) Cache-Through.** Jeder erfolgreiche Plattform-Read schreibt die normalisierten Felder nach
  `nft_metadata`. Der Rückfallweg bleibt so frisch wie das, was tatsächlich angesehen wurde.
  Preis: eine neue Schreibrichtung im Datenmodell — das ist eine Architekturentscheidung und
  gehört als ADR ins Repo, nicht still in einen Mapper (Artefakt A-2).
- **(b) Einfrieren mit Alterungsgrenze.** Keine Schreibpfade mehr. Dazu gehört dann zwingend eine
  Grenze: überschreitet der Stand eines Dokuments das gesetzte Alter, wird es nicht mehr als
  Rückfall angezeigt, sondern es gilt `PLATFORM_UNAVAILABLE`. Ohne diese Grenze verwandelt sich
  der Rückfallweg irgendwann von „veraltet" in „falsch".

**Entscheider:** Wolfgang. **Fällig:** vor Tor T2 (R3/R4). **Blockiert jetzt nichts**, wirkt aber
auf A8: das Anzeigemodell muss den Zustand „Rückfall, möglicherweise veraltet" ohnehin können.
