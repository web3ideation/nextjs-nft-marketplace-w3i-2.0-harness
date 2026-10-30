<!-- Ziel-Pfad im Repo: state/plan-v1-abbau-altpfade.md -->
# Plan v1 — Abbau der Altpfade nach der Plattform-Anbindung

Stand: 15.09.2026 · Gegenstück zu `state/plan-v1-plattform-integration.md`.
Evidenz-Marker wie dort. **E1, E2 und E3 sind dort in Abschnitt 9 definiert** (nachgetragen am
25.09.2026; in Plan v1 waren sie referenziert, aber nirgends erklärt). E3 ist entschieden, E1 und
E2 sind offen und tragen die Tore T1 und T2 dieses Plans.

> **Erhebungsgrenze.** `[Fakt]` Die Kandidatenliste unten stammt aus der Suche über das
> synchronisierte Repo, nicht aus einem vollständigen Grep-Lauf. Deshalb beginnt der Plan mit
> Paket **R0 (Inventar)**: kein Löschen ohne belegte Fundstellenliste. Jede Zeile in Abschnitt 4
> ist bis dahin `[Annahme]`.

---

## 1. Ergebnis der Prüfung

`GO_MIT_AUFLAGEN` für R0 und R1 · `HUMAN_DECISION_REQUIRED` für R2 und R3.

Begründung in einem Satz: Solange das Feature-Flag der einzige Rückweg ist, ist das Löschen des
Altpfads das Aufgeben dieses Rückwegs — und das ist eine Rollout-Entscheidung, keine Aufräumarbeit.

---

## 2. Drei Regeln, die den ganzen Plan bestimmen

1. **`nft_metadata` wird nicht gelöscht.** `[Fakt]` Ausdrückliches Nicht-Ziel der Spec:
   Rückfallweg bei Plattform-Ausfall (V32); der Abbau ist ein eigener Schritt nach dem Umschalten.
   Alles unten betrifft **Code, Skripte, Variablen und Doku**, nicht die Collection.
2. **Alchemy bleibt, Moralis geht.** `[Fakt]` Alchemy erscheint im Repo in zwei völlig
   verschiedenen Rollen: als NFT-Discovery-API (`discoverNFTsViaAlchemy`, `fetchFromAlchemy` in
   `src/app/api/wallet/nfts/route.ts`, Discovery in `src/app/api/user/nfts/sync/route.ts`) **und**
   als RPC-/WebSocket-Anbieter (`NEXT_PUBLIC_ALCHEMY_URL_WSS`, `ALCHEMY_URL_WSS`,
   `NEXT_PUBLIC_SEPOLIA_RPC_URL`, genutzt vom Event-Listener in `src/services/nft-sync/index.ts`
   und von `ipfs-metadata-lazy-sync`). `[Schlussfolgerung]` Ein Abbau, der „Alchemy raus" als
   Vorgabe bekommt, legt die Live-Aktualisierung der Listings lahm. Nur die **erste** Rolle endet.
   Moralis hat nur die erste Rolle (`MORALIS_API_KEY`, `MORALIS_CHAIN`) und verschwindet ganz.
3. **Erst Nachweis, dann Löschung.** Ein Löschpaket führt keine Verhaltensänderung ein. Findet
   sich beim Löschen eine Verhaltenslücke, ist das ein Befund für den Integrationsplan, kein
   Anlass, im Abbaupaket zu bauen.

---

## 3. Tore

| Tor | Bedingung | Gibt frei |
|---|---|---|
| T0 | — | R0, R1 |
| T1 | Flag an in der Alpha, V38 Stufe 2 abgenommen | R2 |
| T2 | Entscheidung E1 (Befüllung des Rückfallwegs, Integrationsplan Abschnitt 9) getroffen **und** Flag in der Produktion an, stabil über den in E2 gesetzten Zeitraum | R3, R4 |
| T3 | Eigene Spec-Ergänzung | Abbau von `nft_metadata` selbst — nicht Teil dieses Plans |

---

## 4. Pakete

### R0 — Inventar (kein Löschen)
**Artefakt:** `state/abbau-inventar.md` — je Kandidat: Pfad, Art (toter Code / Legacy-Zweig /
Variable / Doku), Referenzen laut Grep, Zuordnung zu R1–R4, Belegzeile.
**Pflicht-Greps:** `alchemy`, `moralis`, `Alchemy`, `Moralis` (case-insensitive) ·
`nft_metadata` · `ipfsMetadataLazySync` · `blockchainStateSync` · `discoverNFTsVia` ·
`skipPersist` · `source=` an `/api/wallet/nfts` · `archive/` · `.deprecated` ·
`@deprecated` · `metadataFetchVersion` · `buildNFTImageVariants`.
**Grund:** `[Fakt]` `state/repo-audit-befunde.md` dokumentiert bereits einen Fall, in dem eine Doku
eine Datei als „removed" führte, die es noch gab. `[Schlussfolgerung]` In diesem Repo ist die
Annahme „das nutzt niemand mehr" nachweislich schon einmal falsch gewesen.

### R1 — Toter Bestand (unabhängig vom Flag, Tor T0)
Kandidaten, jeder erst nach Nachweis aus R0:

| Kandidat | Beleg | Status |
|---|---|---|
| `src/services/nft-sync/archive/deprecated/metadata-sync.ts.deprecated` | `[Fakt]` Datei existiert; `[Fakt]` ESLint verbietet Imports aus `archive/` und `*.deprecated` | löschbar, wenn R0 null Referenzen zeigt |
| `src/app/api/marketplace/nft/[contractAddress]/[tokenId]/route.ts` | `[Fakt]` Kopfkommentar: „⚠️ DEPRECATED: Use /api/nft/detail instead", liest `marketplace_items` + `$lookup nft_metadata` | löschbar nur, wenn kein Frontend-Aufruf existiert — `[offene Frage]` |
| `scripts/production/sync-marketplace-data.js` | `[Fakt]` schreibt `nft_metadata` aus Chain-Lesungen und `marketplace_items`; dieselbe Aufgabe übernimmt künftig die Plattform | `[Annahme]` nicht mehr betrieben — vor dem Löschen bei Niklas rückfragen, ob das Skript in einer Umgebung noch läuft |
| Tote Ereignis-Teile aus V36 (b) (`nft-stats-updated`-Helfer, `onStatsUpdate`) | `[Fakt]` in der Spec als „oder die toten Teile sind entfernt" geführt | gehört zu V36, hier nur als Berührungspunkt vermerkt, **nicht** mitnehmen |

**Nicht in R1:** `src/app/api/marketplace/sync/route.ts`. `[Fakt]` Die Route startet den
Hintergrunddienst per `setImmediate` auf Modulebene, der Guard ist wirkungslos, laut Niklas nicht
gewollt (V35) — und `state/tasks/harness-phase3b-doku-sanierung.md` führt sie ausdrücklich als
„nicht anfassen, Antwort des abgebenden Entwicklers steht aus". Eigener Befund, eigener Weg.

### R2 — Legacy-Zweige in den migrierten Routen (Tor T1)
Was hier fällt, ist der Code, den das Flag heute noch erreichbar hält:

- `src/app/api/wallet/nfts/route.ts`: `discoverNFTsViaAlchemy`, `discoverNFTsViaMoralis`,
  `fetchFromAlchemy`, `fetchFromMoralis`, `normalizeIdentifiers`, der Hybrid-Merge, die
  `source`-Union (`auto` | `alchemy` | `moralis` | `blockchain`), die Persistenz-Anreicherung
  (`upsertNFTMetadata`-Aufrufe in dieser Route).
- `src/app/api/user/nfts/sync/route.ts`: `discoverNFTsWithFallback` samt Alchemy-, Moralis- und
  Known-Contracts-Kette, die eigene IPFS-Gateway-Umschreibung.
- `src/contexts/wallet-nfts/WalletNFTsService.ts`: Annahmen über Legacy-Quellen; die öffentliche
  `WalletNFT`-Form bleibt (V2).

`[Schlussfolgerung]` Mit diesem Paket endet die Möglichkeit, durch Ausschalten des Flags auf den
alten Weg zurückzufallen. Ab hier trägt allein V32 die Ausfallsicherheit. Deshalb Tor T1 und
Entscheidung E2.
**DoD zusätzlich:** `source` und `skipPersist` als Eingaben entweder entfernt oder als
wirkungslose Altlast dokumentiert — und in beiden Fällen aus den Cache-Schlüsseln heraus.

### R3 — Lokale Anreicherung (Tor T2)
- `src/services/nft-sync/ipfs-metadata-lazy-sync.ts` — `[Fakt]` liest `tokenURI`/`uri` über viem,
  holt Metadaten über `https://ipfs.io/ipfs/`, schreibt `nft_metadata`.
- `blockchainStateSync` im Detailpfad (`src/app/api/nft/detail/route.ts`) — `[Fakt]` 5-Minuten-TTL
  plus On-Demand-Sync.
- `$lookup nft_metadata` als **Metadatenquelle** in `src/app/api/marketplace/items/route.ts` und
  die `nft_metadata`-Aggregation in `src/app/api/collections/route.ts`.
- Schreibpfade in `src/lib/db/nft-metadata.ts`; `nft_metadata.isListed`-Fortschreibung in
  `src/services/marketplace/event-mongodb-sync.ts` (`[Fakt]` laut
  `docs/architecture/REALTIME_UPDATE_FLOW.md`) — Listing-Wahrheit ist TheGraph, die Spiegelung im
  Metadaten-Dokument ist danach eine zweite Wahrheit ohne Nutzen.

**Der Haken, der E1 nötig macht:** `[Schlussfolgerung]` Entfernt R3 alle Schreibpfade auf
`nft_metadata`, dann friert der Rückfallweg auf dem Stand des Umschaltens ein und altert ab da
monoton. V32 wäre dem Wortlaut nach erfüllt („als möglicherweise veraltet gekennzeichnet"), dem
Zweck nach aber immer weniger. Zwei Wege, beide vertretbar — siehe E1 (Cache-Through gegen
Einfrieren mit Alterungsgrenze), Integrationsplan Abschnitt 9.

### R4 — Variablen, Templates, Doku (Tor T2, mit R3 in einem PR)
- **Entfernen:** `MORALIS_API_KEY`, `MORALIS_CHAIN` aus `.env.local.template`,
  `.env.production.template`, `docs/environment/ENV_VARIABLES.md`, `docs/environment/README.md`.
- **Behalten, aber umwidmen:** alle `ALCHEMY_*`/`INFURA_*`-Variablen — Rolle ist ab dann
  ausschließlich RPC und WebSocket (Regel 2 oben). Die Doku muss das sagen, sonst löscht sie beim
  nächsten Aufräumen jemand mit.
- **Nachziehen:** `docs/api/routes.md`, `docs/api/README.md`,
  `docs/architecture/REALTIME_UPDATE_FLOW.md`, `README.md` sowie das in
  `src/app/api/nft/detail/route.ts` als Quelle der Datenstrategie zitierte
  `DATA_SYNC_ARCHITECTURE.md` (`[offene Frage]` Pfad in R0 bestimmen — der Kommentar nennt nur den
  Dateinamen).
- `[Fakt]` `npm run check` enthält `node scripts/check-docs.mjs`. `[Schlussfolgerung]` Doku und
  Löschung gehören in denselben PR, sonst ist die Kette rot und der Abbau wirkt wie ein Fehler.

---

## 5. Was ausdrücklich stehen bleibt

| Bleibt | Warum |
|---|---|
| `nft_metadata` als Lesepfad | V32, Nicht-Ziel der Spec |
| `nft_stats`, `user_likes`, `user_watchlist`, `user_ratings`, `personal_notes`, `admin_nft_insights` | V9, marktplatzeigene Daten |
| `src/services/nft-sync/graph-subscription.ts`, `src/config/apolloClient.ts` | Listing-Quelle; Apollo bleibt auf Subgraph beschränkt und wird **nicht** für Plattform-Reads erweitert |
| `src/app/api/marketplace/listing/[contractAddress]/[tokenId]/route.ts`, `src/app/api/nft/stats/route.ts`, `src/app/api/user/interactions/route.ts` | Laut Migrationsdokument bereits auf der Ziel-Verantwortung |
| Alchemy/Infura als RPC- und WSS-Anbieter | Event-Listener, Wallet-Interaktion, Chain-Lesungen außerhalb des NFT-Datenpfads |
| `src/app/history-towers/` | Nicht-Ziel der Spec |

---

## 6. Reihenfolge

```
T0 ─► R0 ─► R1
                 ┌─ T1 (Flag an Alpha + V38 Stufe 2) ─► R2
                 └─ T2 (E1 entschieden + Produktion stabil) ─► R3 + R4 (ein PR)
```
