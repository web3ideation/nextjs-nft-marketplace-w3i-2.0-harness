<!-- Ziel-Pfad im Repo: state/advisor-findings-plattform-integration.md -->
# Advisor-Pass — Plan v1 „Anbindung der NFT Data Platform" (Pakete A0–A10)

> **Herkunft dieser Datei.** Bericht des Subagenten `architecture-advisor`, gelaufen am 13.10.2026
> in frischem Kontext mit ausschließlich lesenden Werkzeugen (Read, Grep, Glob). Der Bericht steht
> unten **unverändert**. Der Abschnitt „Nachtrag des Auftraggebers" am Ende ist nicht Teil des
> Berichts; er hält fest, was ich nach Erhalt selbst gegengeprüft habe — einschließlich eines
> Zählfehlers im Bericht.

---

## Kopf

**Datum:** 13.10.2026
**Prüfgegenstand:** `state/plan-v1-plattform-integration.md` (eingefroren, Stand 15.09.2026 mit Nachträgen vom 25.09.2026 und Provenienz-Vermerk vom 13.10.2026)
**Arbeitsverzeichnis:** `C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness` — stimmt mit dem im Auftrag genannten Zielverzeichnis überein. Die Angabe stammt aus der Umgebungsinformation der Sitzung, nicht aus einem `pwd`-Aufruf; ich habe kein Bash-Recht (siehe Rollengrenze).

**Gelesene Quellen:**

- `.claude/skills/advisor-pass/SKILL.md` (Verfahren, verbindlich)
- `state/plan-v1-plattform-integration.md` (vollständig), `state/plan-v1-abbau-altpfade.md` (Abschnitte 1–6, nur als Kontext)
- `specs/marktplatz-fertigstellung.md` v4 (vollständig, 304 Zeilen)
- `docs/api/nft-data-platform-marketplace-migration.md` (Kopf, Abschnittsverzeichnis, Abschnitte 3–5 im Detail: Zeilen 1–60, 437–606)
- `ARCHITECTURE.md`, `CLAUDE.md` (Projekt- und globale Fassung), `docs/STATUS.md`
- `state/assumption-ledger.md`, `state/repo-audit-befunde.md`
- `state/tasks/a1-transport-signierung.md` (Handoff-Vertrag des gebauten Pakets)
- Gebauter A1-Code als **Annahmenquelle für A2–A10**, nicht als Review-Gegenstand: `src/lib/nft-data-platform/{config,signing,rate-limit,errors,client,index}.ts`, `scripts/dev/platform-smoke.ts` (Aufrufstelle), `package.json`
- Code, den der Plan anfassen will: `src/app/api/wallet/nfts/route.ts`, `src/app/api/user/nfts/sync/route.ts`, `src/app/api/user/nfts/route.ts`, `src/app/api/nft/detail/route.ts`, `src/app/api/collections/route.ts`, `src/app/api/marketplace/items/route.ts`, `src/contexts/wallet-nfts/WalletNFTsService.ts`, `src/contexts/collections/CollectionsService.ts`, `src/hooks/marketplace/{useMarketplaceItemDetail,useMarketplaceData,useMarketplaceListing}.ts`, `src/services/marketplace/event-listener.ts`, `src/services/nft-sync/index.ts`, `src/lib/api/{errors,handler,responses}.ts`, `src/config/{app.config,abis/*}.ts`, `src/utils/nft/scrollItem.ts`, `src/app/cart/components/CartPage.tsx`, `src/contexts/CartContext.tsx`, `src/app/sell/components/forms/UnifiedListingForm.tsx`, `src/app/admin/marketplace/page.tsx`, `scripts/check-env.js`, `vitest.config.ts`

**Rollengrenze und blinde Flecken.** Mir stehen ausschließlich `Read`, `Grep` und `Glob` zur Verfügung: kein Schreibrecht, kein Bash, kein Git, kein Netz. Daraus folgen Prüfgrenzen, die ich benenne, statt sie zu verschweigen:

1. **Kein Testlauf, kein Build, kein `npm run check`.** Jede Aussage über grün/rot ist aus Dateien erschlossen, nicht gemessen. Insbesondere konnte ich nicht prüfen, ob die A1-Tests tatsächlich laufen (nur, dass `vitest.config.ts:13` ihr Verzeichnis erfasst).
2. **Kein Zugriff auf die NFT Data Platform und keinen Plattform-Workspace.** Alle Aussagen über Plattform-Verhalten sind Zitate aus `specs/marktplatz-fertigstellung.md`, `docs/api/nft-data-platform-marketplace-migration.md` und den `[Fakt]`-Zeilen in `state/tasks/a1-transport-signierung.md`. Ich konnte **nicht** verifizieren, ob `7915b52` älter oder jünger als `5dda8c7` ist, ob die Signierungsregel zwischen beiden Ständen gleich ist, oder ob die DTO-Formen noch stimmen. Befund 1 ist deshalb bewusst als Entscheidungsbedarf formuliert, nicht als Tatsache.
3. **Kein Git.** Ich kann weder Historie noch Branch-Zustand noch die Behauptung des Provenienz-Vermerks („bis Commit `8b91020` nicht getrackt") überprüfen.
4. **Keine Laufzeitbeobachtung.** Zahl der Instanzen in der Alpha, tatsächliche Aufrufraten, Cache-Trefferquoten: unbekannt. Die Rechnung in Befund 6 ist eine Struktur-, keine Lastmessung.
5. **Kein vollständiges Inventar.** Ich habe die vier Zielrouten und ihre Aufrufer gelesen, aber nicht alle 52 `route.ts` unter `src/app/api/`. Wo ich „kein weiterer Aufrufer" sage, steht dahinter ein Grep über `src/**`, nicht eine Lektüre.

**Nicht Gegenstand dieses Passes:** die Qualität des A1-Codes (das ist `code-reviewer`), die Richtigkeit der Spec-Ziele (das ist die Spec), der Abbauplan (eigener Gegenstand) — Letzterer wird nur dort zitiert, wo er eine Lücke **im Integrationsplan** sichtbar macht.

---

## Marker-Legende

- `[Fakt]` — in Code oder Dokument an genannter Stelle belegt
- `[Fakt, entlastend]` — belegt, und es bestätigt eine Annahme oder Entscheidung des Plans
- `[Schlussfolgerung]` — aus belegten Fakten abgeleitet; die Fakten stehen dabei
- `[Annahme]` — unbelegte Prämisse von Spec oder Plan, die ich als solche markiere
- `[offene Unsicherheit]` — weder belegt noch widerlegt, meist wegen der Rollengrenze

---

## Befunde, nach Schwere sortiert

### Befund 1 — Die Prüfstand-Grenze (V37) trägt nicht, wie der Plan sie zieht: A1 hat mehr als die Signierung aus dem Plattform-Stand übernommen · Schwere: hoch

`[Fakt]` Der Plan erklärt in `state/plan-v1-plattform-integration.md:96–100`: der offene Prüfstand-Commit „blockiert A1 nicht (die Signierung ist in beiden Ständen dieselbe), blockiert aber A3 und A5–A9". `[Fakt]` `state/assumption-ledger.md:15` führt dieselbe Grenze: belegt nur gegen `5dda8c7`, „für Paket A1 tragfähig, für A3 und A5–A9 **nicht**".

`[Fakt]` Der gebaute A1 hat aber deutlich mehr aus dem Plattform-Stand übernommen als die Signierungsregel. Belegt im Handoff-Vertrag `state/tasks/a1-transport-signierung.md:42–60` und im Code:

- die Form der Fehlerantwort `{ ok, error, message }` samt der Besonderheit, dass der Code im Feld `error` steht (`src/lib/nft-data-platform/errors.ts:146–156`, Vertrag Zeile 42–44, Quelle `apps/web/src/lib/api-response.ts:19-38`);
- die vollständige Codeliste (`replayed_request`, `rate_limit_exceeded`, `replay_guard_backend_unavailable`, …) als Grundlage der Klassenzuordnung (`errors.ts:169–193`, Vertrag Zeile 45–50, Quelle `api-auth.ts:254–402`);
- die Aussage, dass `x-ratelimit-limit`/`-remaining` **nur** an authentifizierten Antworten hängen und dass es kein `Retry-After` gibt (`src/lib/nft-data-platform/rate-limit.ts:13–20`, Vertrag Zeile 51–55, Quelle `api-auth.ts:170`, `:232`) — daraus leitet A1 die gesamte Gewichtung „Deckel ist Hauptmaßnahme, Backoff ist Notnagel" ab;
- den Replay-Schutz über `clientId + signature + canonicalPayload` mit TTL `skew+5` (Vertrag Zeile 38–41), woraus der streng monotone Zeitstempel in `src/lib/nft-data-platform/client.ts:152–160` folgt.

`[Schlussfolgerung]` Wird der Prüfstand nachträglich auf `7915b52` festgelegt, ist nicht nur A3 betroffen, sondern auch die **Fehlertaxonomie und die Rate-Limit-Mechanik von A1** — also V34 und das Fehlerverhalten, auf dem A5–A9 ihre Zustände aufbauen. Die Grenze „A1 ist unabhängig" war zum Zeitpunkt des Plans richtig (da war A1 nur Signierung) und ist durch den tatsächlichen Bau überholt.

`[Fakt]` Zusätzlich fehlt **A4** in der Blockadeliste (`plan-v1:100`: „blockiert aber A3 und A5–A9"). A4 ruft drei Plattform-Endpunkte auf und wertet deren Antworten aus (`plan-v1:174–177`: `POST /api/v1/tokens/discover`, `/api/v1/refresh/token`, `/api/v1/refresh/collection`), und A6 verlässt sich auf Antwortfelder `discoveryJobId`, `indexingState` (`plan-v1:206–210`, Migrationsdokument `docs/api/nft-data-platform-marketplace-migration.md:490–495`). `[Schlussfolgerung]` A4 ist genauso stand-abhängig wie A5–A9 und gehört in dieselbe Blockade.

`[offene Unsicherheit]` Welcher der beiden Stände der jüngere ist, konnte ich nicht feststellen (kein Git, kein Plattform-Workspace). `[Fakt]` Die Commit-Botschaft des lokalen Stands lautet „docs: document the indexing gate and the collection off switch" (`plan-v1:97`). `[Fakt]` Genau dieses Thema — Registrierung als Tor zum Indexing, leere Env-Allowlist als Notbremse, `disabled`-Status vorhanden aber ungesetzt — trägt Entscheidung 28 und V63 der Spec (`specs/marktplatz-fertigstellung.md:70`, `:98`). `[Schlussfolgerung]` Es ist zu prüfen, ob eine Festlegung auf `7915b52` hinter die Dokumentation zurückfällt, auf der zwei Spec-Entscheidungen beruhen. Die Richtung der Festlegung ist damit nicht beliebig, sondern selbst eine inhaltliche Frage.

**Was daraus folgt:** vor A3 **und** A4 festlegen; der Festlegung ist eine Nachprüfung der vier oben genannten A1-Annahmen gegen den gewählten Stand beizugeben (das ist eine Leseaufgabe, kein Umbau). Die ESCALATE-Zeile des A1-Vertrags (`state/tasks/a1-transport-signierung.md:193–195`) deckt nur die Signierungsregel ab, nicht Fehlerform, Codeliste und Header-Platzierung.

---

### Befund 2 — A4 ist kein Paket, sondern drei: die serverseitige Whitelist-Quelle fehlt vollständig, der Event-Pfad kennt die Whitelist-Ereignisse nicht, und der Admin-Zustand braucht Persistenz · Schwere: hoch

Der Plan macht A4 (V30, V33, V63) zur Voraussetzung für A5–A9 (`plan-v1:170–188`, Auflage 2 in `:48–55`) und veranschlagt es als **ein** Paket im Sinne der Zuschnitt-Heuristik (`plan-v1:106–107`). Drei getrennte Befunde dagegen:

**(a) Es gibt keine serverseitige Lesung der Diamond-Whitelist.** `[Fakt]` `getWhitelistedCollections` erscheint im Code genau zweimal, beide Male als wagmi-Read in Client-Komponenten: `src/hooks/marketplace/useMarketplaceData.ts:76–83` (Datei trägt `"use client"` in Zeile 11) und `src/app/admin/marketplace/page.tsx:62–65`. `[Fakt]` `isCollectionWhitelisted` ebenso: `src/hooks/marketplace/useMarketplaceData.ts:45–55` und `src/hooks/marketplace/useMarketplaceListing.ts:340–343`. `[Fakt]` Die ABI-Einträge liegen vor (`src/config/abis/getter-facet.ts:149`, `:166`). `[Fakt, Korrektur zur Vorannahme des Auftrags]` Der Ort ist `src/app/admin/marketplace/page.tsx`, nicht `src/app/admin/components/multisig/`; die Substanz der Vorannahme bestätigt sich. `[Fakt]` Serverseitige Chain-Lesungen sind im Repo möglich und üblich (`src/lib/blockchain/wallet-nfts.ts:123`, `src/app/api/marketplace/facets/route.ts:11–17`, `src/app/api/admin/system/health/route.ts:125–130`) — nur eben nicht für die Whitelist.

`[Schlussfolgerung]` A4(a) ist nicht „jeder Aufruf wird gegen `getWhitelistedCollections` gefiltert" (`plan-v1:172–174`), sondern zuerst: eine neue serverseitige Lesequelle bauen, inklusive Zwischenspeicher und Invalidierung. Ohne Zwischenspeicher liegt vor **jedem** Discover/Refresh/Detail-Aufruf eine RPC-Lesung — das verlagert die Kosten nur von Niklas' RPC auf unseren; mit Zwischenspeicher braucht es eine Invalidierungsregel, und die hängt an genau den Ereignissen aus (b). Der Plan sagt zu beidem nichts.

**(b) Der bestehende Event-Pfad hört die Whitelist-Ereignisse nicht und kann sie strukturell nicht hören.** `[Fakt]` Die Empfehlung zu P9 (`plan-v1:178–183`) begründet die Kopplung damit, dass „`src/services/nft-sync/index.ts` bereits über WebSocket auf Marktplatz-Ereignisse hört". Das stimmt — aber auf eine feste, geschlossene Menge: `[Fakt]` `src/services/nft-sync/index.ts:94–108` abonniert sechs Ereignisnamen als getypte Union; `[Fakt]` `src/services/marketplace/event-listener.ts:46–49` beobachtet `MARKETPLACE_EVENT_ABI = [...IDEATION_MARKET_FACET_ABI, ...BUYER_WHITELIST_FACET_ABI]` — die `CollectionWhitelistFacet`-ABI ist **nicht** enthalten; `[Fakt]` `event-listener.ts:534–543` filtert zusätzlich über eine harte `supportedEvents`-Liste ohne `CollectionAddedToWhitelist`; `[Fakt]` die Callback-Registratur `event-listener.ts:147–154` ist ebenfalls eine feste Liste. `[Fakt]` Die Ereignisse existieren nur in der ABI-Datei: `src/config/abis/collection-whitelist-facet.ts:24` (`CollectionAddedToWhitelist`) und `:30` (`CollectionRemovedFromWhitelist`); ein Grep über das ganze Repo findet außerhalb von ABI, Spec und Plan keinen weiteren Treffer.

`[Schlussfolgerung]` A4(c) berührt fünf Stellen in drei Dateien plus die Typunion in `src/types/marketplace/contract-events.ts` (vgl. die Struktur in `:24`, `:226`, `:253`) — eine Erweiterung des Ereignis-Modells, nicht ein Abonnement. Das ist machbar, aber es ist ein eigener Baudurchgang mit eigenem Risiko (der Event-Listener ist der Pfad, an dem die Live-Aktualisierung der Listings hängt).

**(c) Der Admin-Zustand „Abmeldung an Plattform ausstehend" braucht einen Speicherort, den es nicht gibt.** `[Fakt]` V63 verlangt, die entfernte Collection erscheint in der Admin-Ansicht „bis ein Admin sie als gemeldet markiert" (`specs/marktplatz-fertigstellung.md:98`); der Plan übernimmt das (`plan-v1:176–177`). `[Fakt]` Ein Grep über alle `getCollection('…')`/`collection('…')`-Aufrufe unter `src/**/*.ts` ergibt die vorhandenen Collections: `nft_metadata`, `marketplace_items`, `nft_stats`, `admin_nft_insights`, `admin_sessions`, `admin_config`, `collection_stats`, `user_carts`, `user_likes`, `user_ratings`, `user_watchlist`, `user_personal_notes`, `game_scores`. Keine davon trägt Registrierungs- oder Abmeldezustände. `[Schlussfolgerung]` A4(c) enthält eine Schema-Entscheidung (neue Collection oder Feld in `admin_config`) samt Index-Eintrag in `src/lib/db/setup-indexes.ts` und Nachtrag in `docs/database/`. Eine Schema-Änderung ist nach `.claude/skills/advisor-pass/SKILL.md:23–26` genau der Fall, der nicht stillschweigend in ein Paket rutscht.

**Zuschnitt-Urteil zu A4:** `[Schlussfolgerung]` A4 ist in der vorliegenden Form zu groß für „ein Baudurchgang plus höchstens eine Korrekturrunde" (`CLAUDE.md`, Zuschnitt-Heuristik). Vorschlag für v2: **A4a** serverseitige Whitelist-Quelle plus Filterfunktion (eigenständig prüfbar: Filterfunktion mit Unit-Test, Lesequelle mit Mock-Transport); **A4b** Push-Kopplung Discover/Refresh an die bestehenden sechs Ereignisse (V30); **A4c** Whitelist-Ereignisse plus Registrierung plus Admin-Zustand (V63). Reihenfolge: A4a ist die echte Voraussetzung für A5–A9; A4b und A4c dürfen danach parallel laufen oder nachrücken, weil ohne sie nur der Index träger wird, aber keine fremde Collection gezogen wird.

---

### Befund 3 — Die Prüfbarkeit von A4 ist zum Zeitpunkt von A4 leer: das Abnahmekriterium kann nicht rot werden · Schwere: hoch

`[Fakt]` A4s Prüfkriterium lautet: „Aufruf von `/api/nft/detail` mit einer fremden Contract-Adresse erzeugt keinen Plattform-Aufruf mit `refresh:token`" (`plan-v1:186–188`, identisch in V33, `specs/marktplatz-fertigstellung.md:97`). `[Fakt]` `/api/nft/detail` ruft zum Zeitpunkt von A4 keinen Plattform-Endpunkt auf: die Route liest `nft_metadata`, `blockchainStateSync` und `ipfsMetadataLazySync` (`src/app/api/nft/detail/route.ts:49–96`), und die Plattform-Aufrufe entstehen erst in A7 (`plan-v1:216–226`). `[Fakt]` Die Abhängigkeitskette setzt A4 **vor** A5–A9 (`plan-v1:269–272`).

`[Schlussfolgerung]` Das Kriterium ist bei der Abnahme von A4 trivial erfüllt — es wäre auch erfüllt, wenn A4 gar nichts gebaut hätte. Ein Abnahmekriterium, das nicht scheitern kann, belegt nichts; das ist dieselbe Fehlerform, die der Plan für die stillen Parameter der Plattform selbst beschreibt („ein Test, der nur ‚Anfrage erfolgreich' prüft, belegt nichts", `plan-v1:163–164`).

**Was daraus folgt:** A4 braucht ein Kriterium, das ohne A7 scharf ist — etwa: die Filterfunktion gibt für eine Adresse außerhalb einer eingespeisten Whitelist `false` zurück und der Discover-/Refresh-Aufrufpfad ruft `requestPlatform` nachweislich nicht auf (prüfbar über die einspeisbaren `deps` aus `src/lib/nft-data-platform/client.ts:324–334`). Das V33-Kriterium bleibt zusätzlich, wandert aber in die DoD von A7.

---

### Befund 4 — Das Feature-Flag ist an einem Ort geplant, der es nicht tragen kann: `FEATURES` ist literal getypt und wird in Client-Komponenten importiert · Schwere: hoch

`[Fakt]` A2 soll `FEATURES.NFT_DATA_PLATFORM_ENABLED` in `src/config/app.config.ts` anlegen (`plan-v1:135–137`; die Vorlage dafür steht im Migrationsdokument `docs/api/nft-data-platform-marketplace-migration.md:744`). `[Fakt]` `src/config/app.config.ts:33–45` ist ein `as const`-Objekt mit vier literalen Booleans und liest keine einzige Umgebungsvariable. `[Fakt]` Es wird über `src/config/index.ts:18` re-exportiert und in Client-Komponenten verwendet: `src/app/sell/components/SellPage.tsx:52`, `src/app/sell/listing/page.tsx:31`, `src/app/sell/check-listing/page.tsx:35`.

`[Schlussfolgerung]` Drei Folgen, die der Plan nicht nennt:

1. Ein Flag, das aus `process.env.NFT_DATA_PLATFORM_ENABLED` gelesen wird, steht in einem client-importierten Modul. Ohne `NEXT_PUBLIC_`-Präfix ist es im Browser `undefined` — also still `false`, und zwar genau dort, wo niemand hinsieht. Mit `NEXT_PUBLIC_` verstößt es gegen V14 (`specs/marktplatz-fertigstellung.md:106`: „ohne `NEXT_PUBLIC_`-Spiegel") und wird zudem zur Buildzeit eingebacken.
2. `as const` macht aus dem Wert den Literaltyp. `if (FEATURES.X)` mit `false` ist für TypeScript toter Code; sobald das Flag aus der Umgebung kommt, muss die `as const`-Zusage für dieses Feld fallen — eine Änderung an einer Datei, die drei Sell-Komponenten lesen.
3. Es gibt im Repo bereits einen tragfähigen, **serverseitigen** Ort: `isPlatformConfigured()` aus `src/lib/nft-data-platform/config.ts:216–223`, ausdrücklich „gedacht für Aufrufer, die einen degradierten Pfad haben" (ebd. Zeile 210–212).

**Was daraus folgt:** Vor A2 entscheiden, ob das Flag serverseitig neben der Plattform-Konfiguration wohnt (`src/lib/nft-data-platform/config.ts`, zusammen mit den Variablen, die es bedingt) oder in `app.config.ts`. Ersteres ist die kleinere Änderung und hält V14 ein; Letzteres braucht eine begründete Ausnahme. Diese Frage ist vor dem ersten A2-Handoff zu klären, weil sie den Ort und damit die ganze Paketgrenze bestimmt.

---

### Befund 5 — Der Wallet-Hauptpfad läuft nicht über `/api/wallet/nfts`: A5 migriert den Nebenweg · Schwere: hoch

`[Fakt]` A5 migriert `/api/wallet/nfts` und nennt als berührte Dateien die Route, einen neuen Mapper und `src/contexts/wallet-nfts/WalletNFTsService.ts` (`plan-v1:190–192`).

`[Fakt]` Der tatsächliche Lesepfad der Wallet-Ansicht ist „DB-first" und geht über eine **andere** Route:

- `src/contexts/wallet-nfts/WalletNFTsService.ts:443–505`: Schritt 1 ist `fetchWalletNFTsFromDb`, und wenn die Datenbank Treffer liefert, endet der Vorgang dort (Zeile 499–504).
- `src/contexts/wallet-nfts/WalletNFTsService.ts:354–376`: `fetchWalletNFTsFromDb` ruft `/api/user/nfts?walletAddress=…`.
- `src/app/api/user/nfts/route.ts:1–6`, `:29` und `:…getCollection('nft_metadata')`: diese Route liest ausschließlich `nft_metadata` („Fast endpoint - no external API calls, reads from MongoDB only").
- `/api/wallet/nfts` wird nur in drei Nebenfällen aufgerufen: als Rückfall, wenn die Datenbank leer ist (`WalletNFTsService.ts:509–520`), als „discovery gap check" alle 180 Sekunden (`:193–205`, `:473–497`) und als Hintergrund-Persistenz (`:207–231`).

`[Schlussfolgerung]` Nach A5 beantwortet `/api/wallet/nfts` seine Anfragen aus der Plattform — die Wallet-Ansicht zeigt aber im Normalfall weiter `nft_metadata`. V1 (`specs/marktplatz-fertigstellung.md:85`, „ohne einen einzigen ausgehenden Aufruf an Alchemy oder Moralis") ist damit erfüllbar; V2/V3 als sichtbares Verhalten sind es nicht, solange `/api/user/nfts` unberührt bleibt. Der Plan nennt `/api/user/nfts` an keiner Stelle — ein Grep über `plan-v1` und `plan-v1-abbau-altpfade` findet die Route nur als Namensbestandteil von `/api/user/nfts/sync`.

`[Schlussfolgerung]` Zusätzlich entsteht eine Mischquelle, die niemand entschieden hat: nach A5 liefert der Rückfall-/Lückenpfad Plattform-Daten, der Hauptpfad lokale Daten, und `mergeDbSnapshotWithDiscoveredIdentifiers` (`WalletNFTsService.ts:234–259`) führt beide zusammen. Welche Quelle bei Widerspruch gewinnt, steht nirgends.

**Was daraus folgt:** `/api/user/nfts` gehört ausdrücklich in A5 — entweder als mitmigrierte Route oder mit der belegten Entscheidung, dass sie vorläufig lokale Quelle bleibt und der Plattform-Pfad nur den Lückenfall bedient. Beides ist vertretbar; stillschweigend ist es nicht.

---

### Befund 6 — Die Rechnung „600 Anfragen = 200 Detailaufrufe pro Minute" trägt als Budget nicht; fünf Posten fehlen · Schwere: hoch

`[Fakt]` Der Plan nennt als Performance-Budget (V22): drei Plattform-Aufrufe je Detailseite, „bei 600 Anfragen pro Minute sind das rund 200 Detailaufrufe pro Minute" (`plan-v1:229–231`; Herkunft: `specs/marktplatz-fertigstellung.md:248`). Fünf belegte Posten, die diese Rechnung nach unten korrigieren:

**(a) `/api/nft/detail` hat vier Aufrufer, nicht einen.** `[Fakt]` Der Plan führt nur `src/hooks/marketplace/useMarketplaceItemDetail.ts` (`plan-v1:217–219`). Tatsächlich rufen die Route zusätzlich auf: `src/contexts/CartContext.tsx:324`, `src/app/cart/components/CartPage.tsx:396` und `src/app/sell/components/forms/UnifiedListingForm.tsx:302–305`. `[Fakt]` In `CartPage.tsx:379–396` geschieht das in `items.map(...)` innerhalb eines `Promise.all` — ein Warenkorb mit zwanzig Positionen löst zwanzig Detailabfragen gleichzeitig aus, nach A7 also bis zu sechzig Plattform-Aufrufe aus einer Nutzeraktion.

**(b) Jeder Versuch ist eine Anfrage.** `[Fakt]` `src/lib/nft-data-platform/config.ts:189` setzt `maxAttempts` auf 3; `src/lib/nft-data-platform/client.ts:351–434` wiederholt bei 409, 429, 503, Timeout und Netzfehler. `[Schlussfolgerung]` Das Fensterlimit zählt Versuche, nicht logische Aufrufe. Eine schlechte Minute verbraucht bis zum Dreifachen.

**(c) Der Deckel liegt je Prozess, das Limit je Client.** Siehe Befund 7.

**(d) Übersicht, Wallet, Suche und der Worker teilen dasselbe Budget.** `[Fakt]` Entscheidung 14 vergibt `alpha-read` mit 600/min für `collections:read`, `tokens:read`, `owners:read`, `search:read` **und** `refresh:token` (`specs/marktplatz-fertigstellung.md:56`, bestätigt in Entscheidung 8, `:50`). `[Fakt]` A1 bildet das so ab: Budget und Deckel liegen je Zugangsdatensatz, nicht je Aufrufzweck (`src/lib/nft-data-platform/rate-limit.ts:74–77`). `[Schlussfolgerung]` Die Push-Meldungen aus A4 (Discover bei jedem neuen Listing, Refresh bei Kauf/Storno/Transfer, `plan-v1:174–176`) fallen in denselben 600er-Topf wie die Detailseiten. Eine Listing-Welle und eine Lastspitze auf Detailseiten treffen sich; die Rechnung des Plans behandelt die Detailseite als Alleinnutzer.

**(e) Ein bestehender Pfad verdoppelt Detailaufrufe genau dann, wenn A7 die Chain-Daten weglässt.** Siehe Befund 8(b).

**Antwort auf die gestellte Frage:** Nein, die Rechnung hält nicht. Sie ist eine Obergrenze für die Detailseite in Isolation. `[Schlussfolgerung]` Ein tragfähiges Budget zählt Plattform-Aufrufe **je Anfragepfad** (Übersicht, Detail, Cart-Anreicherung, Wallet, Suche, Sell-Suche, Worker-Push) und setzt sie gegen 600/min; V22 verlangt ohnehin ein Budget je Route (`specs/marktplatz-fertigstellung.md:120`), und `npm run bench:api` (`package.json:27`) müsste dafür nicht Latenz, sondern Aufrufzahl messen. Das ist in v2 als Pflichtzeile in A7 und A10 zu verankern, nicht als Nebensatz.

---

### Befund 7 — Das Rate-Limit über mehrere Prozesse ist keine spätere Frage: web und worker laufen schon heute getrennt · Schwere: hoch

`[Fakt]` A1 führt Budget und Nebenläufigkeitsdeckel im Prozess und hält das ausdrücklich fest: „Der Zustand liegt im Prozess. Läuft die App in mehreren Instanzen, zählt jede für sich; das echte Limit gilt aber je Client über alle Instanzen. Das ist bewusst offen gelassen: die Messung aus V34 soll erst zeigen, ob es ein Problem ist" (`src/lib/nft-data-platform/rate-limit.ts:31–34`). `[Fakt]` Der Plan erwähnt das Thema nirgends; die Risikotabelle nennt nur „Detailseite × drei Aufrufe trifft das Fensterlimit → A1 (Backoff, Nebenläufigkeitsdeckel)" (`plan-v1:300`).

`[Fakt]` Es sind bereits zwei Prozesse vorgesehen, nicht erst bei Skalierung: `CLAUDE.md`, Abschnitt „Runtime roles: web vs. worker" — ein Web-Prozess und ein Worker-Prozess aus demselben Image, gesteuert über `APP_RUNTIME_ROLE`; V62 verlangt für die Alpha ausdrücklich beides (`specs/marktplatz-fertigstellung.md:124`). `[Fakt]` Der Worker ist nach A4 ein Plattform-Aufrufer (`plan-v1:178–180`: Kopplung im Worker an den bestehenden Event-Pfad), und zwar mit demselben `read`-Datensatz (Befund 6(d)).

`[Schlussfolgerung]` Die Aufteilung des 600er-Fensters auf mindestens zwei unkoordinierte Zähler ist damit kein hypothetischer Mehrinstanz-Fall, sondern der Normalbetrieb ab A4. Beide Prozesse erlauben sich je bis zu acht gleichzeitige Anfragen (`src/lib/nft-data-platform/config.ts:131`), also sechzehn statt acht.

**Reicht V34 zur Erkennung?** `[Schlussfolgerung]` Teilweise, und nur mit einer Ergänzung. `x-ratelimit-remaining` ist die globale Wahrheit des Fensters über alle Instanzen; es wird in `recordRateLimitHeaders` übernommen und protokolliert (`src/lib/nft-data-platform/rate-limit.ts:103–139`). Was nicht protokolliert wird, ist die **eigene** Zahl gesendeter Anfragen im laufenden Fenster. `[Schlussfolgerung]` Ohne diese Gegenzahl ist ein zu schnell fallendes Restbudget nicht von „ein anderer Aufrufer ist laut" zu unterscheiden; mit ihr wird die Differenz direkt sichtbar. Das ist eine kleine, klar abgegrenzte Ergänzung (eine Zählung je Fenster, mitgeloggt neben `remaining`) und gehört als Zeile in A2 oder A4b — nicht als „sehen wir dann".

**Antwort auf die gestellte Frage:** Es ist eine Lücke vor dem Umschalten, aber eine mit kleinem Gegenmittel. Ein gemeinsamer Zähler (Redis liegt vor, `src/lib/redis/shared-cache.ts` wird von zwei Routen genutzt) ist **nicht** vor dem Umschalten nötig; die Messbarkeit der Abweichung ist es, sonst ist V34 nach dem Umschalten nicht auswertbar und die 600 bleiben eine Zahl ohne Beleg.

---

### Befund 8 — A7 ist zu groß und hat zwei unbenannte Fehlerpfade: Chain-Zustand und Approval verschwinden, der 404-Vertrag passt nicht durch die Fehlerplumbing · Schwere: hoch

**(a) Der Chain-Zustand fällt weg, und vier Verbraucher hängen daran.** `[Fakt]` A7 fordert „kein synchrones Nachladen aus Chain oder IPFS" (`plan-v1:220–222`). `[Fakt]` Das Migrationsdokument zieht die Konsequenz offen: für den `blockchain`-Block „no direct chain read here; fill only from platform detail if the platform exposes that state, otherwise leave conservative nulls" (`docs/api/nft-data-platform-marketplace-migration.md:565`). `[Fakt]` Die heutige Route liefert aus diesem Block einen eigenen Abschnitt `approvalStatus` mit `hasTokenApproval`, `hasOperatorApproval`, `isApprovedForMarketplace` (`src/app/api/nft/detail/route.ts:274–286`), gefüllt aus `blockchainStateSync` (`:59–69`). `[Fakt]` Verbraucher: `src/hooks/marketplace/useMarketplaceItemDetail.ts:265–269`, die Sell-Strecke (`src/app/sell/components/forms/UnifiedListingForm.tsx:332` liest `blockchain.owner` als Eigentümer), und die Warnung „No marketplace approval" (`src/app/nft/[contractAddress]/[tokenId]/components/InvalidListingWarning.tsx:54`). `[Schlussfolgerung]` A7 in der geplanten Form entzieht dem Kaufschutz- und Verkaufspfad seine Datengrundlage. Der Plan nennt das nicht; die Spec fordert in V39/V40 (Gruppe F, `specs:143–144`) gerade eine **Verstärkung** dieser Prüfung.

**(b) Daraus folgt eine Schleife, die Aufrufe verdoppelt.** `[Fakt]` `src/hooks/marketplace/useMarketplaceItemDetail.ts:199–216`: ist ein Listing ERC1155 und `blockchain.isApprovedForAll === false`, holt der Hook die Detailseite ein zweites Mal mit `refresh=true`. `[Fakt]` Die heutige Route setzt bei fehlendem Dokument genau diesen Wert auf `false` (`src/app/api/nft/detail/route.ts:267–272`). `[Schlussfolgerung]` Mit „conservative nulls" ist die Bedingung für jedes gelistete ERC1155 dauerhaft wahr: zwei Detailabfragen je Seitenaufruf, also sechs Plattform-Aufrufe statt drei, und der `refresh=true`-Pfad erzwingt zusätzlich die teuerste Variante. Das ist ein belegter Fehlerpfad, nicht eine Befürchtung.

**(c) Der 404-Vertrag aus V5 passt nicht durch die bestehende Fehlerplumbing.** `[Fakt]` V5 verlangt HTTP 404 mit `code: "TOKEN_NOT_INDEXED"` plus `refreshQueued`, `refreshJobId`, `contractAddress`, `tokenId`, `chainId` (`specs/marktplatz-fertigstellung.md:89`; Plan `:221–224`). `[Fakt]` `src/lib/api/errors.ts:40–45`: `NotFoundError` nimmt nur eine Nachricht, kein `details`. `[Fakt]` `src/lib/api/handler.ts:169` ruft `createErrorResponse(error.message, error.statusCode, error.code)` — der vierte Parameter `metadata` von `createErrorResponse` (`src/lib/api/responses.ts:183–194`) wird nicht durchgereicht, `details` aus `ApiError` (`errors.ts:7–12`) fällt weg. `[Schlussfolgerung]` Die V5-Felder erreichen den Browser auf dem vorgesehenen Weg („throw einen typisierten Fehler", `ARCHITECTURE.md:60–64`) nicht. Entweder wird `src/lib/api/{errors,handler,responses}.ts` erweitert — eine Datei, die alle Routen teilen, und keine davon steht in A7s „Berührt"-Liste — oder die Route gibt eine eigene `NextResponse` mit Status 404 zurück, was `apiHandler` zwar zulässt (`handler.ts:125`), aber gegen die Konvention in `ARCHITECTURE.md:62` streift.

**(d) Ein 404 der Plattform liest sich für den Nutzer heute als „gibt's nicht".** `[Fakt]` `UnifiedListingForm.tsx:307–311` übersetzt HTTP 404 in „NFT nicht gefunden. Bitte Contract-Adresse und Token-ID prüfen." `[Fakt]` Entscheidung 6 der Spec sagt das Gegenteil: „`404` von der Plattform heißt ‚noch nicht indiziert', nicht ‚Token existiert nicht'" (`specs:48`). `[Schlussfolgerung]` A7 muss diesen Aufrufer mitändern, sonst sagt die Oberfläche einem Verkäufer, sein eigenes NFT existiere nicht.

**Zuschnitt-Urteil zu A7:** `[Schlussfolgerung]` A7 enthält in der vorliegenden Fassung: Token-Mapper, Ownership-Aufruf, Collection-Aufruf, Medien-Block (V31), `chainId`-Auflösung (Migrationsdokument `:533`), 404-Vertrag samt Erweiterung der geteilten Fehlerplumbing, Quellenwahl plus Rückfallweg (V32-DoD, `plan-v1:245–247`), Erhalt oder begründeter Abbau von `approvalStatus`, und vier Aufrufer. Das ist kein Baudurchgang plus eine Korrekturrunde. Vorschlag für v2: **A7a** Token/Collection/Medien plus Mapper hinter dem Flag, mit unverändertem Chain-Block (die Route ruft `blockchainStateSync` weiter, nur nicht mehr als Metadatenquelle); **A7b** 404-Vertrag plus Fehlerplumbing plus die vier Aufrufer; **A7c** Entscheidung und Umsetzung zum Chain-/Approval-Block. A7c ist dabei möglicherweise gar kein Plattform-Thema, sondern gehört zu V39/V40.

---

### Befund 9 — Dem Plan fehlt ein Paket: `/api/marketplace/items` ist die Metadatenquelle der Übersicht und kommt in A5–A9 nicht vor · Schwere: hoch

`[Fakt]` Der Zielsatz des Plans lautet: „Alle NFT-Daten (Token, Collection, Ownership, Suche, Wallet-Inventar) kommen über eine server-only Client-Schicht aus der NFT Data Platform" (`plan-v1:65–68`). `[Fakt]` Die Pakete A5–A9 berühren `/api/wallet/nfts`, `/api/user/nfts/sync`, `/api/nft/detail`, `/api/collections` (`plan-v1:190`, `:205`, `:217`, `:250`). `[Fakt]` Die Marktplatz-Übersicht lädt aus `/api/marketplace/items` (`src/app/page.tsx:17`, `src/hooks/marketplace/useMarketplaceItems.ts:242`, Vorwärmung in `src/lib/init-services.ts:59`, Collection-Teilliste in `src/app/nft/[contractAddress]/[tokenId]/components/CollectionItemsList.tsx:52`, Wallet-Anreicherung in `src/contexts/wallet-nfts/WalletNFTsService.ts:624`). `[Fakt]` Diese Route holt ihre Metadaten per `$lookup` aus `nft_metadata` (`src/app/api/marketplace/items/route.ts:268–271`) und ihre Stats aus `nft_stats` (`:376–379`).

`[Schlussfolgerung]` Die meistbesuchte Ansicht des Marktplatzes bezieht ihre NFT-Daten nach vollständiger Umsetzung von A1–A10 weiterhin aus `nft_metadata`. Das ist entweder eine bewusste Entscheidung — dann gehört sie als Zeile in Abschnitt 6 („Was dieser Plan ausdrücklich nicht enthält", `plan-v1:280–289`) mit Begründung — oder eine Lücke. Belegt ist, dass es eine Lücke ist, denn:

`[Fakt]` Der Abbauplan sieht vor, genau diese Quelle zu entfernen: R3 nennt „`$lookup nft_metadata` als **Metadatenquelle** in `src/app/api/marketplace/items/route.ts` und die `nft_metadata`-Aggregation in `src/app/api/collections/route.ts`" (`state/plan-v1-abbau-altpfade.md:106–107`). `[Fakt]` Derselbe Plan verbietet sich, dabei etwas zu bauen: „Ein Löschpaket führt keine Verhaltensänderung ein" (`:38–40`).

`[Schlussfolgerung]` Damit steht in zwei Plänen zusammen ein Schritt, den keiner von beiden ausführen darf: `/api/marketplace/items` soll seine Metadatenquelle verlieren, ohne dass ein Paket die Ersatzquelle baut. Entweder bekommt der Integrationsplan ein Paket für `/api/marketplace/items` (dann ist auch zu klären, wie die Übersicht mit ein bis zwei Plattform-Aufrufen auskommt und nicht mit einem je Karte — die Spec behauptet das in `:248`, der Plan übernimmt es ungeprüft), oder die R3-Zeile fällt und `nft_metadata` bleibt dauerhaft die Metadatenquelle der Übersicht. Beides ist eine Entscheidung, keine Ausführungsfrage.

---

### Befund 10 — A8 ist in sich widersprüchlich: der degradierte Pfad wird viermal gebaut und einmal ersetzt, und die Merge-Schicht hat neben den Mappern keine eigene Aufgabe · Schwere: mittel-hoch

`[Fakt]` A8 soll `src/services/marketplace/marketplace-view-composer.ts` mit `composeMarketplaceCard()`, `composeMarketplaceDetail()`, `composeWalletNFT()` bauen (`plan-v1:237–239`) und ist „nicht parallelisierbar — die Merge-Schicht braucht mindestens A7 als ersten Nutzer, sonst wird sie auf Vorrat entworfen (YAGNI)" (`plan-v1:275–276`). `[Fakt]` Gleichzeitig: „Der degradierte Pfad ist kein eigenes Paket: die Quellenwahl gehört in jede migrierte Route (A5–A7, A9) als DoD, die *Anzeige* gehört hierher" (`plan-v1:245–247`).

`[Schlussfolgerung]` Beides zusammen heißt: A5, A6, A7 und A9 bauen je ihre Quellenwahl **und** je ihre Antwortform für die Ausfallzustände, denn die Ausfallzustände müssen in der Antwort stehen, damit die Anzeige sie zeigen kann. A8 kommt danach und vereinheitlicht die Anzeige. Das ist kein Widerspruch, solange „Quellenwahl" und „Anzeige" wirklich trennbar sind — aber:

`[Fakt]` A5, A7 und A9 bauen bereits je einen Mapper, der die normalisierten Plattform-DTOs auf die bestehenden Frontend-Verträge abbildet: `mappers/wallet.ts` (`plan-v1:192`), `mappers/token-detail.ts` (`:218`), `mappers/collection.ts` (`:252`), mit vollständigen Abbildungstabellen im Migrationsdokument (`:455–478`, `:545–571`). `[Fakt]` Die Zusammenführung von Listing, NFT-Daten und lokalen Stats in Ansichtsmodelle existiert im Repo heute schon, an anderer Stelle: `src/utils/nft/scrollItem.ts:14` (`mapEnrichedNFTToScrollItem`), `:166` (`mapWalletNFTToScrollItem`), `:246` (`mapWalletNFTToFilterableItem`). Der Plan nennt diese Datei nicht.

`[Schlussfolgerung]` `composeMarketplaceCard()` / `composeWalletNFT()` wären damit eine **dritte** Abbildungsschicht für denselben Zweck: Routen-Mapper → Composer → `scrollItem`-Mapper. Das ist die unnötige Komplexität, nach der ich suchen soll. Entweder ersetzt A8 `scrollItem.ts` (dann gehört die Datei in A8s „Berührt"-Liste und A8 ist größer als beschrieben), oder A8 schrumpft auf das, was wirklich neu ist: **ein** gemeinsames Zustandsmodell für die Ausfall- und Indexing-Zustände samt der Übersetzungsregel von `PlatformError` nach Antwortfeld — und das ist eine Datei in `src/lib/`, kein View-Composer in `src/services/`.

**Antwort auf die gestellte Frage:** Der Widerspruch ist echt, liegt aber nicht dort, wo er vermutet wurde. Dass jede Route ihre Quellenwahl selbst trifft, ist richtig und nicht zu ersetzen. Falsch ist die Erwartung, dass A8 danach noch etwas Substanzielles abbildet, was die Routen-Mapper nicht schon getan haben. Empfehlung für v2: A8 auf das Zustandsmodell plus die Fehlerübersetzung reduzieren, es **vor** A5 festlegen (es ist ein Vertrag, kein Vorratsbau: zwei Typen und eine Übersetzungsfunktion, prüfbar mit Unit-Tests gegen die sieben Fehlerklassen), und die Anzeige-Arbeit je Ansicht in A5/A7/A9 belassen.

---

### Befund 11 — Die Zustandsliste des degradierten Pfads deckt nur drei der sieben Fehlerklassen ab, die A1 liefert · Schwere: mittel-hoch

`[Fakt]` A8 nennt die Zustände: „Listing ohne Token, Holding ohne Token, Token ohne Collection, `TOKEN_NOT_INDEXED`, `refreshQueued`, `PLATFORM_UNAVAILABLE`" (`plan-v1:240–241`). `[Fakt]` A1 liefert sieben unterscheidbare Fehlerklassen: `PlatformConfigError`, `PlatformAuthError`, `PlatformReplayError`, `PlatformRateLimitError`, `PlatformUnavailableError`, `PlatformTimeoutError`, `PlatformResponseError` (`src/lib/nft-data-platform/errors.ts:54–134`). `[Fakt]` Nur `PlatformUnavailableError` trägt den stabilen Code `PLATFORM_UNAVAILABLE` (`:105–112`). `[Fakt]` Die Übersetzung in einen Routen-Fehler ist ausdrücklich „Sache der aufrufenden Route (A5–A9)" (`src/lib/nft-data-platform/errors.ts:13–19`, Vertrag `state/tasks/a1-transport-signierung.md:70–74`).

`[Schlussfolgerung]` Vier Zustände haben im Plan keinen Platz und landen damit absehbar als unbehandelte Ausnahme in `apiHandler`, also als HTTP 500 mit `INTERNAL_ERROR`:

- **Timeout nach drei Versuchen** (`PlatformTimeoutError`) — für den Nutzer identisch mit einem Ausfall, müsste also `PLATFORM_UNAVAILABLE` werden, tut es aber nicht automatisch, weil die Klasse den Code nicht trägt.
- **429 nach drei Versuchen** (`PlatformRateLimitError`) — unser Budget ist erschöpft, nicht das des Nutzers. Als 429 weitergegeben wäre die Aussage falsch (genau die Begründung aus `errors.ts:16–18`); als 500 ist sie nutzlos.
- **401/403** (`PlatformAuthError`) — abgelaufener Schlüssel, IP nicht in der Allowlist, fehlender Scope, oder Uhrdrift (`stale_timestamp`, ebd. Zeile 68–70). In der Alpha hinter Traefik mit IP-Allowlist ist das der wahrscheinlichste Betriebsfehler überhaupt (`specs:139`: Forwarded-Header und TLS sind lokal nicht prüfbar).
- **`PlatformConfigError`** — Flag an, Variable fehlt. `[Fakt]` Die Konfiguration wirft beim ersten Aufruf (`src/lib/nft-data-platform/config.ts:151–182`), also zur Laufzeit in der ersten Anfrage, nicht beim Start. `[Fakt]` `npm run env:check` ist nicht Teil von `npm run check` (`package.json:44` enthält lint, typecheck, check-docs, check-rules, check-contract, check-secrets, test:run — kein `env:check`) und läuft in der CI nicht. `[Schlussfolgerung]` Die Startprüfung aus A2 schützt genau dann nicht, wenn sie gebraucht wird: bei einer Umgebung, in der niemand sie ausgeführt hat.

**Was daraus folgt:** Eine Pflichtzeile in v2 — welcher `PlatformError` auf welche Antwort unserer Routen führt, mit Default. Ohne diese Tabelle hat V32 („statt eines generischen Fehlers", `specs:96`) für vier von sieben Fällen keine Deckung.

---

### Befund 12 — A6 entzieht dem Rückfallweg seinen Befüller, bevor E1 entschieden ist · Schwere: mittel-hoch

`[Fakt]` A6 macht aus `/api/user/nfts/sync` eine Orchestrierung: „Keine Metadaten aus Chain oder IPFS mehr in dieser Route" (`plan-v1:206–210`). `[Fakt]` Diese Route ist heute ein Schreiber von `nft_metadata`: „POST: Sync wallet NFTs to nft_metadata collection" (`src/app/api/user/nfts/sync/route.ts:1–8`), mit `upsertNFTMetadata` und `updateNFTOwnership` (`:16–20`). `[Fakt]` Sie wird vom Wallet-Pfad regelmäßig angestoßen (`src/contexts/wallet-nfts/WalletNFTsService.ts:261–273`, `:275–303`). `[Fakt]` `/api/user/nfts` (der Wallet-Hauptpfad, Befund 5) und `/api/marketplace/items` (die Übersicht, Befund 9) lesen `nft_metadata`.

`[Schlussfolgerung]` Mit A6 versiegt eine der Hauptschreibrichtungen auf `nft_metadata` — und zwar in Gruppe A, lange vor Tor T2 und vor der E1-Entscheidung, die genau diese Frage regeln soll (`plan-v1:363–384`, Tor T2 in `state/plan-v1-abbau-altpfade.md:50`). Der Plan behandelt das Altern des Rückfallwegs ausschließlich als Folge des **Abbaus** (Risikozeile `plan-v1:301`: „Rückfallweg `nft_metadata` altert nach dem Umschalten"), nicht als Folge von A6. Für neu erworbene Token gibt es ab A6 keinen Befüller mehr; der Rückfallweg beginnt zu altern, sobald das Flag an ist, nicht erst mit R3.

**Was daraus folgt:** E1 ist nicht „blockiert jetzt nichts" (`plan-v1:383`), sondern fällig **vor A6** — oder A6 behält bis zur E1-Entscheidung einen schmalen Schreibpfad (Identitäten und Eigentum ohne Metadaten), was zu dokumentieren ist. Letzteres halte ich für die kleinere Änderung.

---

### Befund 13 — E1 ist nicht vollständig: es fehlt ein dritter Weg, und beiden genannten Wegen fehlt der Chain-Teil derselben Collection · Schwere: mittel

**Zum fehlenden dritten Weg.** `[Fakt]` E1 stellt zwei Wege gegenüber: (a) Cache-Through, jeder erfolgreiche Plattform-Read schreibt normalisierte Felder nach `nft_metadata`, Preis: neue Schreibrichtung, ADR-pflichtig (`plan-v1:374–377`); (b) Einfrieren mit Alterungsgrenze (`:378–381`).

`[Fakt]` Es gibt im Repo einen dritten Mechanismus für genau dieses Problem, der weder eine neue Schreibrichtung ins Datenmodell einführt noch einfriert: einen geteilten Antwort-Zwischenspeicher mit TTL. `src/lib/redis/shared-cache.ts` wird bereits von `src/app/api/wallet/nfts/route.ts:6` und `src/app/api/marketplace/items/route.ts:31` genutzt; die Items-Route führt dafür versionierte Schlüssel mit TTL (`src/app/api/marketplace/items/route.ts:38–43`). `[Schlussfolgerung]` Variante **(c) „stale-while-error" auf den normalisierten Plattform-Antworten**: jede erfolgreiche Plattform-Antwort landet unter einem versionierten Schlüssel im geteilten Cache; bei `PLATFORM_UNAVAILABLE` wird die letzte bekannte Antwort ausgeliefert und als möglicherweise veraltet gekennzeichnet. Das erfüllt V32 wörtlich und zweckgemäß, hat eine natürliche Alterungsgrenze (die TTL), erfordert **keine** Architekturentscheidung zum Datenmodell (Artefakt A-2 entfällt), und nutzt einen vorhandenen Helfer statt eines neuen Pfads. Grenze dieser Variante, ehrlich benannt: sie trägt nur, was in letzter Zeit angesehen wurde, und sie überlebt kein Redis-Leeren — damit ist sie ein Puffer gegen Minuten und Stunden, nicht gegen Tage. Eine Entscheidung zwischen (a), (b) und (c) ist eine Abwägung von Ausfalldauer gegen Komplexität, und die lässt sich nur mit (c) auf dem Tisch treffen.

**Zum fehlenden Chain-Teil.** `[Fakt]` `nft_metadata` enthält nicht nur Metadaten, sondern auch den Chain-Block, aus dem `blockchain.owner`, `approved`, `isApprovedForAll` und `ownerBalance` kommen (`src/app/api/nft/detail/route.ts:266–286`; Befüller `src/services/nft-sync/blockchain-state-sync.ts`). `[Fakt]` E1 spricht ausschließlich von „normalisierten Feldern" aus Plattform-Reads (`plan-v1:374–375`). `[Fakt]` Die Plattform liefert diesen Zustand nach Lage der Dokumente nicht (`docs/api/nft-data-platform-marketplace-migration.md:565`: conservative nulls). `[Schlussfolgerung]` Keiner der beiden E1-Wege befüllt den Chain-Teil; Weg (a) würde ihn sogar überschreiben, wenn der Mapper das ganze Dokument schreibt. Damit verliert der Rückfallweg genau den Teil, den V32 für „Kauf bleibt nutzbar" braucht (Approval-Prüfung). E1 muss den Chain-Block ausdrücklich ausnehmen oder seinen Befüller behalten.

**Zu E2.** `[Fakt]` E2 fragt nach einem Zeitraum und begründet: „Ohne eine genannte Zahl ist ‚stabil' im Abbauplan eine Ermessensfrage" (`plan-v1:360–361`). `[Schlussfolgerung]` Eine Zahl allein genügt nicht: „unauffällig" ist ohne Messgröße ebenso Ermessen. Prüfbar wäre es mit drei Größen, die A1 bereits protokolliert oder protokollieren kann (`src/lib/nft-data-platform/rate-limit.ts:125–137`, `src/lib/nft-data-platform/client.ts:375–409`): Anteil der Antworten mit `PLATFORM_UNAVAILABLE`, Zahl der `429`-Sperren je Tag, Anteil `TOKEN_NOT_INDEXED` an Detailaufrufen. E2 sollte Zeitraum **und** Grenzwerte dieser drei nennen, sonst ist es eine Zahl ohne Messung.

---

### Befund 14 — A2 ist strukturell größer als „eine bedingte Gruppe", weil `check-env.js` Dateien prüft und nicht die Prozessumgebung · Schwere: mittel

`[Fakt]` Der Plan erkennt eine Strukturänderung („keine zusätzliche Zeile", `plan-v1:143–145`) und belegt die feste Liste (`scripts/check-env.js:43–57`). `[Fakt, entlastend]` Das stimmt genau so: `criticalVars` ist eine Liste ohne Bedingungen, und die Prüffunktion läuft sie flach durch (`:131–174`).

`[Fakt]` Nicht erkannt ist die Datenquelle: `checkEnvironment` liest die Werte aus einer **Datei** (`.env.local` bzw. `.env.production.local`, `:31–34`, `:105–121`) und bricht ab, wenn die Datei fehlt (`:109–116`). `process.env` wird an keiner Stelle für die zu prüfenden Variablen gelesen. `[Schlussfolgerung]` Zwei Folgen:

1. Der Zustand des Flags, von dem die neue Pflichtgruppe abhängen soll, muss aus derselben Datei kommen — in einer Umgebung, in der Variablen vom Hoster in den Prozess injiziert werden (Railway/Coolify-Modell, `CLAUDE.md`, Abschnitt „Deployment / process model"), existiert diese Datei nicht, und `npm run env:check:prod` scheitert vor der ersten Prüfung. Die Prüfung hat damit genau da keine Wirkung, wo V14 sie verlangt.
2. Dieselbe Falle trifft V64 (`REDIS_SSE_CHANNEL`), das A2 mitnehmen soll (`plan-v1:146–149`). Die Spec verlangt „in jeder ausgerollten Umgebung explizit gesetzt" (`specs:125`) — eine Dateiprüfung belegt das für eine ausgerollte Umgebung nicht.

`[Fakt]` Dazu kommt: `env:check` ist in keiner blockierenden Kette. `package.json:44` (`check`) enthält es nicht; ein Grep über `state/gates.md` findet keine Zeile dazu (Artefakt A-3 des Plans, `:313`, ist also noch offen und nicht bloß eine Formalie).

**Was daraus folgt:** A2 braucht eine Entscheidung zur Quelle (Datei, Prozessumgebung oder beides) und einen Ort, an dem die Prüfung wirklich greift. Die naheliegende, kleine Lösung: die Pflichtprüfung dort ansiedeln, wo die Konfiguration ohnehin validiert wird (`src/lib/nft-data-platform/config.ts:151–182` wirft bereits mit allen fehlenden Namen) und `check-env.js` auf das beschränken, was es kann — eine Entwicklerhilfe gegen vergessene lokale Variablen.

---

### Befund 15 — Die Variablenliste von A2 ist seit A1 unvollständig · Schwere: niedrig-mittel

`[Fakt]` A2 nennt „`NFT_API_BASE_URL` plus zwei Zugangsdatensätze" (`plan-v1:137–139`), ebenso V14 (`specs:106`). `[Fakt]` Der gebaute A1 liest zusätzlich vier optionale Variablen: `NFT_API_TIMEOUT_MS`, `NFT_API_MAX_ATTEMPTS` (`src/lib/nft-data-platform/config.ts:188–189`) sowie `NFT_API_READ_LIMIT_PER_MINUTE`/`_CONCURRENCY` und `NFT_API_OPS_LIMIT_PER_MINUTE`/`_CONCURRENCY` (`:137–138`) — ausdrücklich, damit die Messung aus V34 die Startwerte ohne Codeänderung korrigieren kann (`state/tasks/a1-transport-signierung.md:111–112`). `[Schlussfolgerung]` A2s Arbeit an `.env.local.template`, `.env.production.template` und `docs/environment/ENV_VARIABLES.md` umfasst sieben Pflicht- und sechs optionale Namen, nicht sieben. Kleine Korrektur, aber genau die Art von Drift, die die Templates unbrauchbar macht.

---

### Befund 16 — V1, V22, V27 und V62 fehlen in der Abdeckungsrechnung des Plans · Schwere: mittel

Geprüft habe ich die Behauptung, der Plan decke V2–V7, V10–V16, V30–V34, V38 und V63.

`[Fakt, entlastend]` Die genannten Zuordnungen stimmen und sind in der Spec wiederzufinden: V2/V3 → A5 (`plan-v1:191`, `specs:86–87`); V4/V5/V6/V31 → A7 (`:217`, `specs:88–90`, `:95`); V7 → A9 (`:250`, `specs:91`); V10/V11/V15/V16/V34 → A1 (`:110`, `specs:102–109`); V12/V13 → A3 (`:153`, `specs:104–105`); V14 → A2 (`:134`, `specs:106`); V30/V33/V63 → A4 (`:171`, `specs:94`, `:97–98`); V32 → A8 plus Routen-DoD (`:236`, `specs:96`); V38 → A10 (`:259`, `specs:139`).

Vier Lücken:

1. `[Fakt]` **V1 kommt im Plan nicht vor.** Die Abdeckungsliste von A5 nennt V2, V3, V6 (`plan-v1:191`). V1 ist das eigentliche Abnahmekriterium der Wallet-Migration: „Ist das Flag an, beantwortet `/api/wallet/nfts` eine Anfrage ohne einen einzigen ausgehenden Aufruf an Alchemy oder Moralis" (`specs:85`). `[Schlussfolgerung]` Ohne V1 in der A5-DoD kann A5 abgenommen werden, während der Alchemy-Zweig weiterläuft — er ist in derselben Route (`src/app/api/wallet/nfts/route.ts:823`, `:919–924`) und wird laut Abbauplan erst in R2 entfernt (`state/plan-v1-abbau-altpfade.md:86–89`).
2. `[Fakt]` **V27 fehlt.** „Für jede migrierte Route existiert ein Integrationstest, für jeden Mapper ein Vertragstest" (`specs:132`). Der Plan nennt Tests nur für A1 und A3 (`:124–125`, `:165`). `[Schlussfolgerung]` A5–A7 und A9 haben keine Testzeile in ihrer DoD, obwohl sie die Mapper bauen, deren Vertragstests V27 verlangt — und obwohl E3 den Mock-Transport genau dafür bereitstellt (`plan-v1:336–341`).
3. `[Fakt]` **V22 ist nur als Nebensatz vorhanden** („gehört in das Performance-Budget (V22)", `:231`), nicht als Paketergebnis. Siehe Befund 6.
4. `[Fakt]` **V62 ist Voraussetzung von A4, erscheint aber nirgends.** A4s Empfehlung zu P9 koppelt die Registrierung an den Worker und benennt die Bedingung selbst: „Verwerfen, wenn der Worker in der Zielumgebung nicht garantiert läuft" (`plan-v1:181–183`). `[Fakt]` Genau das ist V62 (`specs:124`), Gruppe C, nicht Teil dieses Plans (`plan-v1:286` schließt nur V35 ausdrücklich aus, V62 gar nicht). `[Schlussfolgerung]` Die Entscheidung über P9 hängt an einem Sachverhalt, den dieser Plan nicht herstellt und nicht als Vorbedingung führt. Die Abhängigkeitskette (`plan-v1:268–273`) zeigt ihn nicht.

---

### Befund 17 — A9 setzt eine Suche voraus, deren Oberfläche im Plan nicht vorkommt · Schwere: niedrig-mittel

`[Fakt]` A9 enthält „Suche über `/api/v1/search?q=`, nicht über einen `search`-Parameter an der Token-Liste" (`plan-v1:255–256`), gestützt auf V12/V13 (`specs:104–105`). `[Fakt]` Die heutige Freitextsuche liegt nicht in `/api/collections`, sondern als `search`-Parameter an `/api/marketplace/items` (`src/app/api/marketplace/items/route.ts:14`, Nutzung über `src/hooks/marketplace/useMarketplaceItems.ts:242`) und an `/api/user/nfts` (`src/app/api/user/nfts/route.ts:47–48`). `[Fakt]` `src/contexts/collections/CollectionsService.ts:71–75` ruft `/api/collections?includeInsights=…` und übergibt keinen Suchbegriff.

`[Schlussfolgerung]` A9 migriert Collection-Metadaten (das ist gedeckt und sinnvoll), aber die Suche, die es mitnimmt, hat in `/api/collections` keinen Aufrufer. Die Suche, die Nutzer benutzen, hängt an Routen, die der Plan nicht anfasst (Befund 9). Entweder gehört die Suche zu dem fehlenden Paket, oder A9 nennt, welche Suche gemeint ist.

---

### Befund 18 — V16 ist mit A1 nicht abgedeckt, der Plan führt es aber als gedeckt · Schwere: niedrig-mittel

`[Fakt]` A1 „deckt V10, V11, V15, V16, V34" (`plan-v1:110`); der Handoff-Vertrag wiederholt das (`state/tasks/a1-transport-signierung.md:22`) und schränkt ausdrücklich nur V11 ein (`:189–192`). `[Fakt]` V16 lautet: „Die Systemuhr des Marktplatz-Hosts läuft synchron; die Plattform weist Anfragen ab, deren Zeitstempel mehr als 300 Sekunden abweicht. **Ein Monitoring-Alarm auf Uhrdrift existiert.**" (`specs:108`). `[Fakt]` Im gebauten A1 findet sich dazu ein Kommentar — „wenn unsere Uhr um mehr als 300 Sekunden abweicht (V16), hilft ein zweiter Versuch nicht, sondern nur ein Alarm" (`src/lib/nft-data-platform/errors.ts:68–70`) — und die Konsequenz, `stale_timestamp` nicht zu wiederholen; einen Alarm gibt es nicht. `[Schlussfolgerung]` Der zweite Satz von V16 ist offen. Er ist klein (eine Auswertung auf `PlatformAuthError` mit `platformCode === 'stale_timestamp'` an eine Warnstufe), aber er muss jemandem zugeordnet sein, sonst gilt V16 später als abgenommen, obwohl der Teil fehlt, der im Betrieb den Unterschied macht. Analog zur V11-Zeile im Assumption Ledger (`state/assumption-ledger.md:16`) gehört das dort hinein oder in A2.

---

### Befund 19 — Entlastende Befunde: was ich geprüft und in Ordnung gefunden habe

`[Fakt, entlastend]` **Auflage 1 ist erledigt und belegt.** Das Migrationsdokument trägt die Kopfzeile aus Artefakt A-1 wörtlich, mit Datum und Begründung (`docs/api/nft-data-platform-marketplace-migration.md:3–14`). Abschnitt 8 des Plans (`:307–310`) listet sie noch als zu erstellen — das ist nur Nachzieharbeit in v2.

`[Fakt, entlastend]` **Die Korrektur zum Testpfad trägt.** `vitest.config.ts:13` setzt `include: ['src/**/*.test.{ts,tsx}']`; die A1-Tests liegen entsprechend neben der Quelle (`src/lib/nft-data-platform/signing.test.ts`, `client.test.ts`). Der im ursprünglichen Plan genannte Pfad `tests/unit/…` wäre tatsächlich nie gelaufen.

`[Fakt, entlastend]` **E3 ist konsistent umgesetzt.** Das Smoke-Skript existiert (`scripts/dev/platform-smoke.ts`), hat ein eigenes npm-Skript (`package.json:28`) und ist nicht Teil von `npm run check` (`package.json:44`) — genau wie E3 es vorschreibt (`plan-v1:342–345`). Die Grenze „grünes `npm run check` belegt V11 nicht" ist zusätzlich im Assumption Ledger geführt (`state/assumption-ledger.md:16`).

`[Fakt, entlastend]` **Die Empfehlung zu P8 trägt und ist umgesetzt.** Ein Client-Objekt, zwei Zugangsdatensätze, Auswahl je Aufruf über `credentials` (`src/lib/nft-data-platform/client.ts:65–77`, `:324–329`); getrennte Budgets und Deckel je Datensatz (`src/lib/nft-data-platform/rate-limit.ts:74–77`). Die Begründung des Plans („zwei Klassen verdoppeln genau den Teil, der am ehesten falsch wird", `:119–122`) hält der Prüfung stand; der Bootstrap-Client ist nirgends erreichbar (V15).

`[Fakt, entlastend]` **A5s Cache-Befund ist richtig und vollständig genug.** Die Route führt tatsächlich zwei Caches und einen `source`/`skipPersist`-abhängigen Schlüssel: `walletNftsResponseCache` (`src/app/api/wallet/nfts/route.ts:449`), Schlüsselbau `buildWalletCacheKey(walletAddress, source, skipPersist)` (`:452–455`), geteilter Cache darüber (`:457–458`, `:785–788`). Die Schlussfolgerung „wird `source` bedeutungslos, muss der Schlüssel mit" (`plan-v1:200–202`) ist belegt — und der geteilte Cache liegt in Redis, überlebt also einen Neustart, was die Dringlichkeit noch erhöht.

`[Fakt, entlastend]` **A7s Befund zur heutigen Route trifft zu.** `blockchainStateSync` mit 5-Minuten-TTL (`src/app/api/nft/detail/route.ts:53–69`), `ipfsMetadataLazySync.ensureMetadata()` (`:88–96`), `nft_metadata` als erster Schritt (`:49–50`) — alles wie beschrieben.

`[Fakt, entlastend]` **Die Reihenfolge-Auflage (A4 vor A5–A9) ist sachlich richtig begründet.** Dass ein Token-Refresh die Collection registriert und dass die leere Env-Allowlist der Plattform „kein Filter" bedeutet, steht belegt in der Spec (`specs:97`, Entscheidung 28 in `:70`). Die Umkehr der Reihenfolge gegenüber dem Migrationsdokument ist damit gedeckt — meine Einwände betreffen die Größe von A4 (Befund 2) und die Prüfbarkeit (Befund 3), nicht die Reihenfolge.

`[Fakt, entlastend]` **A-4 (Ablage der Befunde) ist eine gute Entscheidung und wird auch eingehalten.** Annahmen stehen in `state/assumption-ledger.md` (fünf Einträge mit Datum, Fundstelle, Status), Doku-Drift in `state/repo-audit-befunde.md`, Arbeitspakete in `state/tasks/`. Keine vierte Ablage entstanden.

`[Fakt, entlastend]` **Die Selbstkritik des Plans ist belastbar und nicht kosmetisch.** Der Provenienz-Vermerk (`plan-v1:12–24`) benennt den Verstoß gegen Punkt 9 des Skills, und `state/assumption-ledger.md:17` führt „die Pläne sind ungeprüfte Selbstauskunft" als offene Annahme. `docs/STATUS.md:20–23` sagt dasselbe. Das ist genau die Art Buchführung, die diesen Pass überhaupt erst sinnvoll macht — und sie hat mich in diesem Durchgang mehrfach zum richtigen Prüfpunkt geführt.

`[Fakt, entlastend]` **Die Abgrenzung in Abschnitt 6 ist sauber belegt.** V35 mit Belegstelle (`src/app/api/marketplace/sync/route.ts:14–40`, bestätigt in `specs:122`), V39–V42 als anderer Problemkreis, Plattform-Änderungen als Nicht-Ziel (`specs`, Nicht-Ziele-Tabelle). Einzige Lücke dort ist V62 (Befund 16).

---

### Befund 20 — Nachrangiges, das mitlaufen darf

`[Fakt]` **A3s Grep-Kriterium ist eng.** „Routencode kennt keine Rohfeldnamen der Plattform (Grep auf `metadataUriResolved`, `pageInfo`…)" (`plan-v1:165–168`). `[Schlussfolgerung]` Zwei Namen sind eine Stichprobe, nicht ein Kriterium. Belastbarer: der Grep auf `requestPlatform(` außerhalb von `src/lib/nft-data-platform/` muss leer sein, sobald A3 die typisierten Methoden stellt — dann kann kein Routencode mehr an Rohformen kommen, unabhängig von Feldnamen.

`[Fakt]` **A10 ist als Nachweisarbeit beschrieben, aber ohne Ablageort.** „kein Code, Nachweisarbeit" mit zwei Stufen (`plan-v1:258–262`). Die Smoke-Lauf-Protokollierung aus E3 (`:343–347`) und die V11-Zeile im Ledger (`state/assumption-ledger.md:16`) verweisen beide auf A10, A10 selbst benennt keine Datei. `[Schlussfolgerung]` Ein Nachweis ohne Ablageort ist in drei Wochen nicht mehr auffindbar; ein Abnahmeprotokoll unter `state/` genügt.

`[Fakt]` **Die Rolle von `collection_stats` ist ungeklärt.** `src/lib/mongodb.ts` kennt eine Collection `collection_stats`, die in `docs/database/`-Nähe nirgends im Plan auftaucht, obwohl A9 Collection-Daten umstellt. `[offene Unsicherheit]` Ob sie noch befüllt wird, habe ich nicht geprüft. Gehört in den „Ist-Zustand lesen"-Schritt von A9.

---

## Zuordnung zu den sechs benannten Unsicherheiten

| Frage | Antwort in Kurzform | Befunde |
|---|---|---|
| 1. Prüfstand-Grenze (V37) | Trägt nicht wie gezogen: A1 hat Fehlerform, Codeliste und Header-Verhalten des Stands übernommen; A4 fehlt in der Blockadeliste; die Richtung der Festlegung ist selbst inhaltlich | 1 |
| 2. A4 als Voraussetzung | Vorannahme bestätigt (Ort korrigiert); A4 ist drei Pakete, nicht eines — serverseitige Whitelist-Quelle, Event-Erweiterung, Admin-Persistenz. A4a bleibt Voraussetzung, A4b/A4c dürfen nachrücken | 2, 3 |
| 3. A8 Merge-Schicht | Widerspruch ist echt, liegt aber anders: Quellenwahl je Route ist richtig; A8 hat neben den Routen-Mappern und `scrollItem.ts` keine eigene Abbildungsaufgabe. Reduzieren auf Zustandsmodell + Fehlerübersetzung, und das **vor** A5 | 10, 11 |
| 4. Rate-Limit über Instanzen | Lücke, und zwar bereits ab A4 im Normalbetrieb (web + worker, derselbe `read`-Datensatz). V34 erkennt sie nur mit einer Ergänzung: eigene Fensterzählung neben `remaining` protokollieren. Gemeinsamer Zähler nicht vor dem Umschalten nötig | 7, 6(c)(d) |
| 5. E1/E2 vollständig? | Nein. Ein dritter Weg fehlt (stale-while-error auf dem vorhandenen geteilten Cache, ohne neue Schreibrichtung und ohne ADR). Beiden genannten Wegen fehlt der Chain-Teil derselben Collection. E2 braucht Messgrößen, nicht nur eine Zahl. Zusätzlich ist E1 früher fällig als gedacht (A6) | 13, 12 |
| 6. Detailseite × drei Aufrufe | Rechnung hält nicht: vier Aufrufer statt einem, Cart-Schleife, bis zu drei Versuche je Aufruf, gemeinsames Budget mit Übersicht/Wallet/Suche/Worker, plus eine Verdopplungsschleife bei ERC1155 | 6, 8(a)(b) |

---

## Urteil

**Nicht freigegeben.**

Begründung, und zwar ausdrücklich als Urteil über den **Plantext**, nicht als Stopp für die Arbeit: Der Zielumfang ist durch Spec v4 gedeckt, die Reihenfolge-Auflage ist sachlich richtig, die Entscheidung zu P8 trägt, E3 ist konsistent umgesetzt, und A1 liegt so im Baum, dass A2 unmittelbar anschließen könnte. Was dem Plan fehlt, ist nicht die Richtung, sondern die Deckung an fünf Stellen, an denen ein Baudurchgang nach Plan v1 ins Falsche laufen würde: ein Paket fehlt ganz (Befund 9), zwei Pakete sind substanziell zu groß (Befunde 2 und 8), der Hauptlesepfad der Wallet-Ansicht ist nicht erfasst (Befund 5), und der Ort des Feature-Flags trägt nicht (Befund 4). Keine dieser Stellen ist durch Nacharbeit im Code zu heilen — sie bestimmen den Zuschnitt.

**Vor Umsetzungsbeginn zu klären** (Reihenfolge ist Vorschlag):

1. **Befund 4** — Ort des Feature-Flags. Blockiert A2 unmittelbar; ohne Entscheidung ist der erste A2-Handoff nicht schreibbar.
2. **Befund 14, 15** — Quelle und Umfang der Startprüfung. Gehört in dieselbe Entscheidung wie 4.
3. **Befund 1** — Prüfstand-Commit festlegen **und** die vier A1-Annahmen gegen den gewählten Stand nachlesen. Blockiert A3 und A4; eine Leseaufgabe, kein Umbau.
4. **Befund 2, 3** — A4 in A4a/A4b/A4c schneiden, Abnahmekriterium von A4a scharf stellen, Speicherort für den Admin-Zustand entscheiden (Schema-Entscheidung).
5. **Befund 9** — entscheiden, ob `/api/marketplace/items` ein Paket bekommt oder dauerhaft lokale Metadatenquelle bleibt. Hängt mit der R3-Zeile des Abbauplans zusammen und ist deshalb nicht aufschiebbar bis nach dem Umschalten.
6. **Befund 5** — `/api/user/nfts` in A5 aufnehmen oder als bewusst lokal bleibend festschreiben, inklusive Regel für die Mischquelle.
7. **Befund 10, 11** — A8 auf Zustandsmodell plus Fehlerübersetzungstabelle reduzieren und **vor** A5 festlegen; die Tabelle „welcher `PlatformError` wird welche Antwort" ist Voraussetzung jeder Routen-DoD.
8. **Befund 8** — A7 schneiden und die Entscheidung über den Chain-/Approval-Block treffen (Erhalt in A7a, oder Zuordnung zu V39/V40).
9. **Befund 12, 13** — E1 vor A6 entscheiden, dabei den dritten Weg und den Chain-Teil mitbewerten.

**Darf mitlaufen** (gehört in Plan v2, blockiert aber keinen Start):

- Befund 6 — Performance-Budget je Anfragepfad; fällig als Pflichtzeile in A7 und A10, nicht vor A2.
- Befund 7 — eigene Fensterzählung mitprotokollieren; eine Zeile in A2 oder A4b, fällig vor dem Umschalten (A10), nicht vor A3.
- Befund 16 — V1, V22, V27, V62 in die Abdeckungs- und Abhängigkeitsrechnung nachtragen; V27 als Testzeile in die DoD von A5–A7 und A9.
- Befund 17 — Klärung, welche Suche A9 meint.
- Befund 18 — V16-Alarm zuordnen oder als offene Annahme führen.
- Befund 20 — A3-Grep-Kriterium verschärfen, A10 einen Ablageort geben, `collection_stats` im Ist-Zustand von A9 mitlesen.
- Befund 19 — Abschnitt 8 des Plans um den Vermerk ergänzen, dass A-1 erledigt ist.

Dieses Urteil ist keine Aussage über den gebauten A1-Code; den habe ich ausdrücklich nicht geprüft (das ist `code-reviewer`). Es ist auch keine Freigabe zum Bauen ohne Reviewer danach — ein Advisor-Pass prüft, ob der Weg trägt, nicht ob das Ziel richtig ist.

---

## Nächster sinnvoller Schritt

Die neun Punkte der Liste „vor Umsetzungsbeginn" in `state/plan-v2-plattform-integration.md` einarbeiten — konkret: den Paketschnitt auf A4a/A4b/A4c und A7a/A7b/A7c umstellen, ein Paket für `/api/marketplace/items` plus `/api/user/nfts` aufnehmen oder diese beiden Routen mit Begründung in Abschnitt 6 verschieben, A8 vor A5 ziehen und auf Zustandsmodell plus Fehlerübersetzungstabelle reduzieren, und die Blockadezeile zum Prüfstand auf A1-Annahmen, A3, A4 und A5–A9 erweitern.

Danach, und erst danach, die beiden Entscheidungen einholen, die keinen Code brauchen, aber alles Weitere bestimmen: der Prüfstand-Commit (Befund 1, bei Niklas) und der Ort des Feature-Flags (Befund 4, bei Wolfgang). Mit beidem auf dem Tisch ist A2 als Handoff-Vertrag schreibbar; A4a kann unmittelbar danach folgen, weil es außer der Transportschicht nichts aus der Plattform braucht.

Zwei Zeilen gehören zusätzlich in `state/assumption-ledger.md`, bevor die Arbeit weiterläuft: V16 ist mit A1 nur zur Hälfte erfüllt (Befund 18), und der Prozess-lokale Rate-Limit-Zustand ist ab A4 eine bekannte, bewusst getragene Lücke mit benanntem Erkennungsweg (Befund 7). Beide sind klein genug, um vergessen zu werden, und groß genug, um im Betrieb wehzutun.

---

## Nachtrag des Auftraggebers, 13.10.2026

Nicht Teil des Berichts. Der Bericht oben bleibt als historischer Stand unverändert, auch dort, wo
ich ihm unten widerspreche.

**Gegengeprüft und bestätigt** (jeweils eigener Grep, nicht aus dem Bericht übernommen):

- Befund 5: `src/contexts/wallet-nfts/WalletNFTsService.ts:359` ruft `/api/user/nfts`, und
  `src/app/api/user/nfts/route.ts:4–5` beschreibt sich selbst als „from cached nft_metadata ·
  Fast endpoint - no external API calls, reads from MongoDB only", `:71` liest die Collection.
  Der Hauptlesepfad der Wallet-Ansicht ist damit tatsächlich nicht Gegenstand von A5.
- Befund 9: `src/app/api/marketplace/items/route.ts:271` enthält `from: 'nft_metadata'` im
  `$lookup`; `src/app/page.tsx:17` und `src/hooks/marketplace/useMarketplaceItems.ts:242` laden
  daraus. Bestätigt.
- Befund 4: alle drei `FEATURES`-Importeure tragen `'use client'`
  (`src/app/sell/components/SellPage.tsx`, `src/app/sell/listing/page.tsx`,
  `src/app/sell/check-listing/page.tsx`). Bestätigt.
- Befund 8(b): `src/hooks/marketplace/useMarketplaceItemDetail.ts:202` prüft
  `isApprovedForAll === false`, `:207` holt die Detailseite mit `refresh=true` erneut. Bestätigt.
- Befund 8(c): `src/lib/api/handler.ts:169` ruft
  `createErrorResponse(error.message, error.statusCode, error.code)` — der vierte Parameter wird
  nicht übergeben. Bestätigt. (Nebenbei sichtbar: dieselbe Zeile endet auf `as any`. Altbestand,
  nicht Gegenstand dieses Passes.)

**Widerspruch, Befund 2(a) — Zählfehler.** `[Fakt]` Der Bericht sagt, `getWhitelistedCollections`
erscheine „genau zweimal". Ein Grep über `src/` findet es in **fünf** Dateien:
`src/hooks/marketplace/useMarketplaceData.ts`, `src/app/admin/marketplace/page.tsx`,
`src/app/admin/components/multisig/MarketplaceGovernanceSidebar.tsx`,
`src/app/admin/components/multisig/TransactionBuilder.tsx` und `src/config/abis/getter-facet.ts`
(ABI-Definition). Die beiden Multisig-Komponenten hat der Bericht übersehen — und mit ihnen die
„Korrektur zur Vorannahme des Auftrags", die er in demselben Absatz anbringt: die ursprüngliche
Angabe `src/app/admin/components/multisig/` war nicht falsch, sondern unvollständig, genau wie
seine eigene. `[Schlussfolgerung]` Die **Substanz** von Befund 2(a) bleibt unberührt: alle vier
Fundstellen außerhalb der ABI sind Client-Komponenten, eine serverseitige Lesung der Whitelist
existiert nicht. Der Befund ist gültig, seine Zählung nicht. Für den Zuschnitt von A4a ändert sich
nichts; für den Umfang von A4c möglicherweise doch, weil zwei weitere Oberflächen die Whitelist
anzeigen.

**Folge für Plan v2:** alle Befunde werden übernommen, Befund 2(a) mit der korrigierten
Fundstellenliste. Nicht übernommen wird die Reihenfolge-Empfehlung des Berichts im Punkt
„Nächster sinnvoller Schritt", die v2 vor den beiden menschlichen Entscheidungen schreiben will:
Die Entscheidung zum Flag-Ort (Befund 4) bestimmt den Zuschnitt von A2, und der Prüfstand-Commit
(Befund 1) bestimmt, ob A3 und A4 überhaupt schreibbar sind. v2 hält beide deshalb als
ausdrücklich offene Punkte, statt sie vorwegzunehmen.
