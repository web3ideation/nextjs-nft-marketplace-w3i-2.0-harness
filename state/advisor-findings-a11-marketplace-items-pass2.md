# Architecture-Advisor, zweiter Pass: A11a und A11b

## Kopf

**Geprüft gegen:**
- `ARCHITECTURE.md`
- `state/advisor-findings-a11-marketplace-items.md` (erster Pass)
- `state/plan-v2-a11-marketplace-items.md`
- `state/tasks/a11a-items-ueberlagerung.md` und `state/tasks/a11b-items-schutz.md`
- Code:
  - `src/lib/nft-data-platform/client.ts`, `write.ts`, `schemas.ts`, `view-state.ts`, `mappers/token-detail.ts`
  - `src/lib/redis/shared-cache.ts`, `src/lib/redis/client.ts`
  - `src/app/api/marketplace/items/route.ts` (Z. 1–200 und 700–818; die Pipeline Z. 200–700 nur teilweise)
  - `src/app/api/collections/route.ts` (Vorbild A9), `src/lib/api/responses.ts`
  - `src/types/marketplace/enriched-nft.ts`
  - `src/contexts/wallet-nfts/WalletNFTsService.ts`
  - `scripts/check-contract.mjs`, `scripts/check-rules.mjs`, `scripts/check-docs.mjs`
  - `docs/kommentar-standard.md`, `state/assumption-ledger.md`

**Rollengrenze:** Nur Lesen. Ich habe nichts geschrieben, nichts ausgeführt (kein `npm run check`, keine Tests) und den Plan nicht umgeschrieben.

**Blinde Flecken:**
- **Kein Zugriff auf das Plattform-Repo.** Ob `ready` bei laufender Medienverarbeitung vorkommt, ob die Plattform doppelte Identitäten akzeptiert und ob sie Adresse und `tokenId` normalisiert, bleibt ungeprüft.
- **Keine Produktionsdaten.** Unbekannt sind `REDIS_URL`, die Zahl der Instanzen, ein CDN vor der Route, `chainId` in Altdokumenten und die Zahl nie `ready` werdender Token.
- **Route nur teilweise gelesen.** Die Pipeline-Zeilen ~270, ~427–428, ~484 und ~544 (`$nftData`) habe ich nicht verifiziert.
- **Nicht gelesen:**
  - `.claude/skills/handoff-vertrag/SKILL.md`. Für das Vertragsformat habe ich nur die Marker in `check-contract.mjs` geprüft.
  - `eslint.config.mjs`.
  - Der Deploy-Weg: Ob `main` automatisch ausgeliefert wird, ist unbekannt (Dockerfile und `nixpacks.toml` existieren).

## Marker-Legende

- **[Fakt]** am Code oder Text belegt.
- **[Schlussfolgerung]** aus Fakten abgeleitet.
- **[Annahme]** ungeprüft.
- **[offene Unsicherheit]** ohne Zugriff nicht entscheidbar.
- **[Fakt, entlastend]** geprüft und in Ordnung.

## Erster Pass: Punkt 1–7

| # | Punkt (erster Pass) | Umgesetzt | Fundstelle im Vertrag | Rest |
|---|---|---|---|---|
| 1 | Ausfall und Latenz | **ja, mit Lücke** | A11a SCOPE 1, 2, 4 (3 s, 1 Versuch). A11b SCOPE 2 und 3 (Merker 60 s, Auth/Config/RateLimit/Timeout/Unavailable). | Befund 4: Formfehler setzt keinen Merker. |
| 2 | Überlagerungsvertrag | **ja** | A11a SCOPE 3 (feldweise, `contract` nur `name`/`symbol`). SCOPE 4 (`staleWarning`-Regel). | Befund 8: Feldliste und Bildgruppe fehlen. Befund 1: Fall „Überlagerung bewusst aus" fehlt. |
| 3 | Drosselung | **ja** | A11b SCOPE 1 (`isRejectedByWhitelist`), SCOPE 2 (Schlüssel je Identität, nur Plattform-`queued`/`failed`). CONTEXT: Fehlerpfad-Zeile gestrichen. | Redis-Frage bewusst ins Ledger verschoben (A11b SCOPE 6b), vertretbar. Befund 7: TTL-Einheit. |
| 4 | Budgetschutz | **teilweise** | A11b SCOPE 2 (Seitenmengen-Cache, Hash der sortierten Schlüssel, 30 s) und SCOPE 3. | Befund 5: `staleWarning` bei Treffer und Pause. Befund 6: JSON-Form des Cache-Werts. |
| 5 | Cache-Semantik | **teilweise** | A11b SCOPE 4 (Plattformfehler vs. einzelne Karte, `:v3`). A11a SCOPE 4 (vorläufige Regel). | Befunde 1, 2, 3, 4: Widersprüche und Lücken (siehe unten). |
| 6 | Umfang und Aufrufer | **ja** | A11a SCOPE 5 (Typ), SCOPE 6 (Wallet-Zeile). | Befund 2: `platformOverlay` fehlt in `isDefaultBrowseQuery`. |
| 7 | Identität | **ja** | A11a SCOPE 3 (`buildItemOverlayMap(requestedKeys, …)`) und SCOPE 4 (`resolved*`, `getChainConfig`, Dedup). | Befund 5 betrifft die Folgen für `staleWarning`. |

## Neue Befunde, nach Schwere

### 1. Der Fall „Überlagerung bewusst aus" ist undefiniert, und die vorläufige A11a-Regel macht ihn zum Rückschritt. [Fakt + Schlussfolgerung]
- **[Fakt]** A11a SCOPE 4 setzt `staleWarning` wahr, wenn „mindestens eine Karte gar nicht überlagert werden konnte". Der Test „Flag aus / `platformOverlay=false` → `local-fallback`" sagt nichts zu `staleWarning` (A11a GOAL und SCOPE 7).
- **[Fakt]** A11b Nr. 4 kennt nur zwei Fälle: Plattformfehler und einzelne Karte. Der Fall „nie versucht" fehlt.
- **[Fakt, Vorbild]** `collections/route.ts:478-479` startet mit `dataSource = 'local-fallback'` und `staleWarning = false`.
- **[Schlussfolgerung]**
  - Wörtlich gelesen ist bei Flag aus jede Karte „nicht überlagert", also `staleWarning: true`.
  - Mit der vorläufigen Regel („`staleWarning` → nicht in den Antwort-Cache", A11a SCOPE 4) fällt der 15-s-Cache der Standardansicht im Flag-aus-Zustand weg.
  - Jeder Wallet-Aufruf mit `platformOverlay=false` trüge zudem eine Warnung.
- **[Fakt]** A11b SCHRITT 0 verlangt A11a „auf `main` gemergt". A11a nennt sich zugleich „nicht ausgeliefert". Ob `main` sofort deployt, ist **[offene Unsicherheit]**.
- **[Schlussfolgerung]** Sicher ist nur: Der Flag-aus-Pfad muss ab dem Merge dem heutigen Verhalten entsprechen.
- **Vorschlag, Entscheidung beim Menschen:** Bei Flag aus oder `platformOverlay=false` gilt `staleWarning: false`, die Antwort ist cachebar, und die Regel steht in beiden Verträgen.

### 2. `isDefaultBrowseQuery` kennt `platformOverlay` nicht, und das schlägt auf den Standard-Cache durch. [Fakt]
- **[Fakt]** `route.ts:~145-171` baut die Bedingung ohne `platformOverlay`. Bei Treffer liefert Z. 175–193 den Cache zurück, bei Miss schreibt Z. 790 ihn.
- **[Schlussfolgerung]**
  - `?platformOverlay=false` mit sonst unveränderten Standardparametern schreibt bei Miss eine nicht überlagerte Antwort unter den Schlüssel der Standardansicht (15 s).
  - Umgekehrt liefert derselbe Aufruf bei Treffer überlagerte Daten, obwohl er sie abgelehnt hat.
  - Der Wallet-Dienst ist nicht betroffen (`limit=100` ist nicht Standard). Jeder fremde Aufrufer ist es.
- Weder A11a noch A11b nennen das. Entweder kommt `platformOverlay !== 'false'` in die Bedingung, oder bei Überspringen wird nicht in den Standard-Cache geschrieben.

### 3. Der A11a-Test „`staleWarning` wird nicht gecacht" widerspricht A11b Nr. 4, und die A11b-ESCALATE-Zeile verbietet seine Anpassung. [Fakt]
- **[Fakt]**
  - A11a SCOPE 7 testet: „Antwort mit `staleWarning` wird nicht gecacht".
  - A11b Nr. 4 verlangt: „Einzelne Karte nicht überlagerbar → Antwort wird gecacht".
  - A11b ESCALATE sagt bei Kollision mit einem Test der Standardansicht „anhalten und melden" und bei einem kippenden A11a-Test „nicht anpassen".
- **[Schlussfolgerung]** Der Test muss durch Design ersetzt werden. Ein vertragstreuer Bauagent hält an, und das kostet die Korrekturrunde. A11b SCOPE 7 sollte den Test ausdrücklich als „ersetzt" nennen, und ESCALATE sollte nur für unerwartete Kollisionen gelten.

### 4. Ein dauerhafter `PlatformResponseError` (Formfehler) wird weder gedrosselt noch gecacht. [Fakt + Schlussfolgerung]
- **[Fakt]**
  - A11b SCOPE 2: Ein `PlatformResponseError` setzt den Merker nicht.
  - A11b Nr. 4: „Aufruf gescheitert" wird nicht in den Antwort-Cache geschrieben.
  - Kein `markPaused` bei Fehler (SCOPE 3).
  - `view-state.ts:153-163` gibt `allowLocalFallback: false` und `logLevel: 'error'` zurück.
- **[Schlussfolgerung]** Nach einer Schema-Änderung der Plattform gilt für jede nicht gecachte Anfrage:
  - Sie ruft Discover wieder auf (dreisekündiger Aufruf mit Re-Enqueue-Last).
  - Sie schreibt einen `error`-Log.
  - Die Standardansicht verliert ihren Cache dauerhaft.
- Das ist dieselbe Mechanik, die der Merker für Auth-Fehler verhindern soll (Plan v2 §4). Entscheidung nötig, zum Beispiel Merker auch für Formfehler mit kurzer TTL.

### 5. Die `staleWarning`-Berechnung bei Seitenmengen-Treffer und Pause ist nicht festgelegt. [Fakt + Schlussfolgerung]
- **[Fakt]**
  - A11a SCOPE 3: `notOverlaid` sind die „angefragten" Schlüssel ohne Überlagerung.
  - A11b SCOPE 2: Der Cache-Wert enthält `overlays` und `notOverlaid`.
  - A11b SCOPE 3: Pausierte Identitäten werden vor dem Aufruf abgezogen.
  - Plan v2 §3: „pausiert" löst `staleWarning` aus.
- **[Schlussfolgerung]** Drei Fälle bleiben offen:
  - **Pausierte Schlüssel:** Werden `requestedKeys` erst nach dem Pausenabzug übergeben, fehlen sie in `notOverlaid`. `staleWarning` wäre dann fälschlich falsch.
  - **Chain-Abweichler:** Sie stehen weder im Schlüsselsatz noch im Hash (A11a SCOPE 4: „zählen als nicht überlagert"). Bei Treffer und Miss ergäbe sich unterschiedliches `staleWarning`.
  - **Treffer bei gesetztem Merker:** Ob das ein „Plattformfehler" nach Nr. 4 ist, bleibt offen. Die Reihenfolge in SCOPE 3 legt „nein" nahe, und das ist auch sinnvoll.
- **Vorschlag:**
  - `requestedKeys` sind die volle, deduplizierte Menge.
  - Pause und Chain-Abweichung werden je Anfrage zu `notOverlaid` addiert und nicht aus dem Cache gelesen.
  - Der Cache-Wert enthält nur die Auskunft der Plattform.
  - „Plattformfehler" bedeutet nur: Merker-Zweig nach Miss oder `catch`.

### 6. Die JSON-Form des Cache-Werts ist offen, und kein Test fängt den Fehler. [Fakt + Schlussfolgerung]
- **[Fakt]** A11a SCOPE 3 nennt den Rückgabetyp von `buildItemOverlayMap` nicht („`overlays` nur für …"). A11b SCOPE 2 sagt nur „JSON-tauglicher Form". `setSharedCacheValue` ruft `JSON.stringify` auf (`shared-cache.ts:~59-64`).
- **[Schlussfolgerung]**
  - Eine `Map` oder ein `Set` serialisiert zu `{}`.
  - Der Treffer bestünde dann aus leeren Überlagerungen, ohne Fehler und mit `staleWarning` aus der falschen Quelle.
- **[Fakt]** Der A11a-Routentest mockt `shared-cache` (A11a SCOPE 7). A11b SCOPE 7 nennt für den Guard-Test keinen Round-Trip. Der Fehler bliebe also unentdeckt.
- **Vorschlag:**
  - A11a legt Plain-Object und Array als Typ fest.
  - Der Guard-Test läuft mit dem echten `shared-cache`. Ohne `REDIS_URL` greift der Prozess-Fallback (`redis/client.ts:24`).
  - Mock-Rückgaben `undefined` zählen als Miss (`== null`).

### 7. Die TTL-Einheit der Konstanten ist ein stiller Fehlerpfad. [Fakt + Schlussfolgerung]
- **[Fakt]**
  - `DISCOVER_RETRY_PAUSE_MS` ist eine Millisekunden-Konstante (A11b SCOPE 2). `setSharedCacheValue` nimmt ganze Sekunden und ruft `redis.set(..., 'EX', ttl)` auf.
  - Ein Fehler dort wird verschluckt, und der Wert landet nur im Prozess-Map (`shared-cache.ts:~68-72`).
  - `getSharedCacheValue` gibt bei Redis-Miss `null` zurück, ohne den lokalen Speicher zu prüfen (`shared-cache.ts:~35-37`).
- **[Schlussfolgerung]** Eine nicht ganzzahlige Sekundenzahl macht Pause oder Merker bei vorhandenem Redis unwirksam, ohne Meldung. Mit `Math.ceil` wie in `route.ts:42` und einem Test auf ganzzahlige TTL ist das erledigt.

### 8. „Feldweise" ohne Feldliste. [Fakt + Schlussfolgerung]
- **[Fakt]** `DetailMetadataOverlay` hat zehn Felder (`token-detail.ts:67-78`). Dazu gehören `blurDataURL: null`, `attributes: []`, die Objekte `images` und `imageMeta` sowie `animationUrl` und `externalUrl`. Plan v2 §3 nennt nur „`name`, `description`, `image` (und Varianten)". A11a SCOPE 3 hat keine Liste, und „nicht leer" ist für Objekte nicht definiert.
- **[Schlussfolgerung]**
  - Ein Mischzustand wäre möglich: `image` aus der Plattform, `images.thumbnail` lokal.
  - Eine Liste, in der `image`, `images` und `imageMeta` als Einheit gelten, löst das.
  - Sie begrenzt zugleich die Größe des Cache-Werts (bis zu 100 Karten, **[Annahme]** nicht gemessen).

### 9. Die Prüfreihenfolge in A11b SCOPE 3 ist konsistent, aber unvollständig formuliert. [Schlussfolgerung]
- **[Fakt]** Die Liste beginnt mit „Überlagerungs-Cache". Das Tor, die Identitätsbildung, die Dedup und die Chain-Filterung (A11a SCOPE 4) stehen davor, weil der Hash sie braucht. Das steht nicht da.
- **Antwort auf die Reihenfolgefrage:** Seitenmenge vor Merker ist gewollt und sinnvoll. Im Ausfall liefert ein Treffer bis zu 30 s alte, bessere Daten ohne Aufruf.
- **Antwort auf die Frage nach pausierten oder `ready` gewordenen Identitäten im Treffer:** Der Treffer liefert bis zu 30 s Stand von vor dem Wechsel. Das ist unkritisch (**[Annahme]** 30 s, im Ledger geführt). Befund 5 regelt die `staleWarning`-Folge.
- **Klein:** `signal` in `discoverTokens`-Options (A11a SCOPE 2) hat keinen Verbraucher. Das ist harmlos, weil `PlatformRequestOptions.signal` existiert (`client.ts:78`). Eine Option ohne Aufrufer ist unnötige Oberfläche.

### 10. Ohne Redis kann der lokale Fallback den Merker und Seitenmengen-Einträge verdrängen. [Fakt + offene Unsicherheit]
- **[Fakt]** `LOCAL_CACHE_MAX_ENTRIES = 5000`, die Verdrängung folgt kleinstem `expiresAt` (`shared-cache.ts:8-34`).
- **[Schlussfolgerung]** Bei mehr als 5000 Pausenschlüsseln (600 s) fliegen zuerst Merker (60 s) und Seitenmengen-Einträge (30 s) raus. Dazu kommt ein Sortieren von 5000 Einträgen bei jedem Überlauf.
- **[offene Unsicherheit]** Die Zahl der Token, die nie `ready` werden, ist unbekannt. Das gilt nur ohne Redis. Es gehört in Ledger-Eintrag (b).

### 11. Kleinigkeiten zu Ledger und Kommentarstandard. [Fakt]
- **[Fakt]** Die Ledger-Spalten sind `Datum | Annahme | Fundstelle | Status | Aufgelöst am` (`assumption-ledger.md:9-10`). Der Vertrag verlangt „Vorbehalt und Fälligkeit" je Eintrag (A11b SCOPE 6), und dafür gibt es keine Spalten. Beides gehört in den Annahmetext, die Spalte „Aufgelöst am" bleibt leer.
- **[Fakt]** `docs/kommentar-standard.md` verlangt für jede neue Datei den Kopf mit `Datei`, `Zweck`, `Wird aufgerufen von` und `Wichtig`. Die Verträge nennen den Kopf nur für Route und Guard. Mapper-Datei und Testdateien fehlen. Kein Skript prüft das.

## Beantwortung der konkreten Prüfpunkte

- **(a) Optionen: unproblematisch.**
  - **[Fakt, entlastend]** `config.maxAttempts` steht in `client.ts` exakt an den vier genannten Stellen: Z. 412, 465, 498, 552.
  - **[Fakt, entlastend]** Der 429-Pfad (Z. 420–427) nutzt nur `timeoutMs`, und `markWindowExhausted` bleibt unberührt.
  - **[Fakt]** Bei `timeoutMs: 3000` wirft ein Rate-Limit-Warten über 3 s sofort `PlatformRateLimitError`. Das ist konsistent mit dem Merker.
  - **[Fakt, entlastend]** `client.test.ts` enthält kein `maxAttempts`.
  - **[Fakt, entlastend]** `discoverTokens` hat keinen Produktionsaufrufer, nur 7 Aufrufe mit zwei Parametern in `write.test.ts:337-397`. Ein dritter optionaler Parameter bricht nichts. Einziger Randfall: `maxAttempts ≤ 0` ließe die Schleife leer laufen, daher mit `Math.max(1, …)` abfangen.
- **(b) `isRejectedByWhitelist`: ohne Änderung der Antwortform baubar.**
  - **[Fakt, entlastend]** `rejectedItem` baut lokale Objekte. Sie werden **nach** `parseOrThrow` mit den geparsten Antworten gemischt (`write.ts:289-303`, `mergeDiscoverResponses`). Ein Kennzeichen läuft also nie durch zod.
  - **[Fakt]** `discoverItemSchema` (`schemas.ts:425-435`) hat kein `message`-Verbot und kein `.strict()`.
  - **[Schlussfolgerung]** Ein zusätzliches Objektfeld würde das Schema nicht verletzen. Es würde aber den abgeleiteten Typ `PlatformDiscoverItem` als Excess-Property verletzen. Sauberer sind eine `WeakSet`-Mitgliedschaft oder ein Symbol-Schlüssel.
  - **[Schlussfolgerung]** Die Prüfung muss auf den rohen Antwortobjekten erfolgen, bevor der Mapper sie kopiert.
- **(c) `shared-cache.ts`: das Schlüsselmodell trägt, mit Befunden 6, 7 und 10.**
  - **[Fakt]** Die Granularität ist Sekunden, und die Werte laufen über `JSON.stringify`.
  - **[Fakt]** Redis hat `enableAutoPipelining` (`redis/client.ts:31`). Bis zu 100 `get` je Miss sind tragbar.
  - **[Fakt]** Ohne Redis scannt jeder `get` bis zu 5000 Einträge. Das ist als Miss-Pfad akzeptabel, weil der Seitenmengen-Cache zuerst geprüft wird.
  - **[Fakt, entlastend]** Das Whitelist-Lesen ist 60 s gecacht (`collection-whitelist.ts:63`). Die sequenziellen Prüfungen in `partitionByWhitelist` sind billig, und sie liegen außerhalb des 3-s-Timeouts.
- **(d) Cache-Semantik gegen die Route.**
  - **[Fakt, entlastend]** Die Zeilen stimmen: Z. 40–43 (Schlüssel), 175 (Lesen), 790 (Schreiben), 813 (`Cache-Control`; die Vertragsangabe ~811 ist mit „~" hinnehmbar).
  - **[Fakt, entlastend]** Der Treffer-Pfad setzt `Cache-Control` zusätzlich in Z. 190.
  - **[Fakt, entlastend]** `apiSuccess` gibt ein `NextResponse` zurück (`responses.ts:27-35`). `headers.set` ist schon in Gebrauch (Z. 190, 813), der Header ist also überschreibbar.
  - **[Schlussfolgerung]** „Plattformfehler" und „einzelne Karte" sind im Code sauber trennbar, wenn die Route ein explizites `platformFailed`-Flag führt. Dann greifen die Befunde 4 und 5.
- **(e) Typ- und Check-Risiko: gering.**
  - **[Fakt, entlastend]** `MarketplaceItemsResponse['data']` (`enriched-nft.ts:227-249`) ist ein reines Interface ohne Index-Signatur. Zwei optionale Felder genügen, damit das Objektliteral in Z. 751 typgerecht bleibt.
  - **[Fakt, entlastend]** `check-rules.mjs` hat keine Regeln (`regeln = []`). `check-contract.mjs` prüft nur `SCHRITT 0` und die acht Marker, und beide Verträge haben alle. `check-docs.mjs` prüft für `state/*.md` nur Datum gegen „Stand dieser Fassung:", und das steht in keinem Vertrag.
  - **[Fakt, entlastend]** Das Repo-Muster nach `ARCHITECTURE.md` §7 (nur `@/`-Importe) wird in den Verträgen nicht verletzt.
- **(f) Wallet-Zeile: stimmt.**
  - **[Fakt, entlastend]** `WalletNFTsService.ts:624` ist `fetch('/api/marketplace/items?limit=100')`. In den Tests gibt es keine Treffer auf `marketplace/items` oder `limit=100`, also prüft keiner die URL exakt.
- **(g) Rest.**
  - **[Fakt, entlastend]** `src/lib/nft-data-platform/` hat schon `client.ts`, `write.ts`, `view-state.ts` und `mappers/`. `write.ts` importiert bereits aus `@/services/...`. Der Guard-Ort (`items-overlay-guard.ts`) verletzt `ARCHITECTURE.md` nicht. §1 gibt keine weitere Ordnerkonvention vor.
  - **Ledger:** siehe Befund 11.

## Entlastende Befunde (zusätzlich zu (a)–(g))

- **[Fakt, entlastend]** Plan v2 und beide Verträge sind sich in Zuschnitt, Konstanten und Fehlerklassen einig. Plan v2 §4 und A11b SCOPE 2 meinen dasselbe mit „Unavailable, Timeout, Auth, Config, RateLimit" und `allowLocalFallback: true`. Das `isPlatformError`-Auffangnetz (`view-state.ts:~215-222`) fällt auch unter `true`.
- **[Fakt, entlastend]** Der Fehlerpfad „nicht werfen, auch bei `allowLocalFallback: false`" folgt dem A9-Muster und ist im Vertrag begründet (A11a SCOPE 4; `collections/route.ts:37-38, 514-516`).
- **[Fakt, entlastend]** Die Cache-Schlüssel-Hebung auf `:v3` ist in A11b gesetzt. Der Zwischenzustand A11a mit `:v2` und neuer Eintragsform ist für höchstens 15 s unkritisch.
- **[Schlussfolgerung, entlastend]** Der Zuschnitt trägt, solange die Befunde 1–6 vorher als Textkorrekturen eingearbeitet sind:
  - A11b ist realistisch in einem Durchgang plus einer Korrekturrunde.
  - A11a ist knapp, weil `route.test.ts` die erste Route-Testinfrastruktur für die 780-Zeilen-Route aufsetzt.
  - Die BUDGET-Klausel in A11b (Nr. 4 als eigene Runde melden, die Pausenlogik darf nicht fehlen) ist ein tragfähiges Ventil.

## Zuschnitt A11a/A11b: Widersprüche untereinander

- **Prüfreihenfolge in der Route:** A11a (Tor → Identitäten → Dedup → ein Aufruf → Fehler) und A11b (Cache → Merker → Pause → Aufruf) sind ohne Widerspruch erweiterbar. Der Text von A11b SCOPE 3 muss das Tor und die Identitätsbildung davor ausdrücklich nennen (Befund 9).
- **Vorläufige gegen endgültige Cache-Regel:** Widerspruch zwischen A11a-Test und A11b-ESCALATE (Befund 3). Der Rückschritt im Flag-aus-Zustand wirkt schon ab A11a (Befund 1).
- **Test-Erweiterungen:** A11b erweitert die A11a-`route.test.ts` ohne Konflikt, abgesehen von Befund 3 und dem Mock von `shared-cache` (Befund 6).

## Urteil: **Freigegeben mit Hinweisen**

Alle sieben Punkte des ersten Passes sind in den Verträgen umgesetzt, nicht nur im Plan v2 erwähnt. Das gilt auch dort, wo der Code die Vertragsannahmen bestätigt (Optionen, `isRejectedByWhitelist`, Zeilen, Typ, Wallet-Zeile). Die neuen Befunde sind Textlücken und Widersprüche zwischen den Verträgen. Keiner ist eine Architekturabweichung. Mehrere müssen aber vor dem jeweiligen Baubeginn bereinigt sein, sonst kostet die eine Korrekturrunde.

### Vor Baubeginn

**Vor A11a** (jeweils eine Zeile im Vertrag):
1. Befund 1: Definition `staleWarning`/`dataSource` bei Flag aus und `platformOverlay=false`. Der Flag-aus-Pfad muss dem heutigen Verhalten entsprechen, weil A11a auf `main` gemergt wird.
2. Befund 2: `platformOverlay` in `isDefaultBrowseQuery` aufnehmen, oder bei Überspringen nicht in den Standard-Cache schreiben.
3. Befund 6, erster Teil: Rückgabetyp von `buildItemOverlayMap` als Plain-Object bzw. Array festlegen.
4. Befund 8: Feldliste mit der Bildgruppe `image`/`images`/`imageMeta` als Einheit.

**Vor A11b** (vor dem A11b-Schritt 0, nach dem A11a-Merge):
5. Befund 3: den A11a-Test explizit als „ersetzt" nennen und ESCALATE angleichen.
6. Befund 4: Entscheidung des Menschen zum Formfehler, zum Beispiel Merker mit kurzer TTL.
7. Befund 5: Regel für `requestedKeys` voll, Pause und Chain-Abweichung je Anfrage, und die Definition von „Plattformfehler".

### Darf mitlaufen

- Befund 6, zweiter Teil: Round-Trip-Test des Guards ohne Mock von `shared-cache`.
- Befund 7: Sekunden-Umrechnung mit `Math.ceil` und ein Test auf ganzzahlige TTL.
- Befund 9: `signal` aus den Options streichen oder begründen. Reihenfolge-Text vervollständigen.
- Befund 10: Ledger (b) um das Verdrängungsrisiko ohne Redis erweitern.
- Befund 11: Ledger-Spalten und Dateiköpfe.
- `maxAttempts` mit `Math.max(1, …)` absichern.

## Nächster sinnvoller Schritt

Die Textkorrekturen 1–4 in `state/tasks/a11a-items-ueberlagerung.md` einarbeiten und die Entscheidung zu Befund 4 beim Menschen einholen. Dann A11a bauen und mit dem Reviewer-Pass (`code-reviewer`) prüfen. Die Korrekturen 5–7 in `state/tasks/a11b-items-schutz.md` stehen vor A11b-Schritt 0. Einen dritten Advisor-Pass braucht es nicht. Ein Blick auf die geänderten Zeilen genügt.
---

## Nachtrag 20.11.2026

Der Bericht oben bleibt als historischer Stand unverändert stehen.

- **Entscheidung zu Befund 4 (Mensch, 20.11.2026):** Der Ausfall-Merker wird bei **jedem**
  gescheiterten Discover-Aufruf gesetzt, auch bei einem `PlatformResponseError`, 60 s wie bei
  den anderen Fehlern. Das `error`-Log bleibt.
- **Eingearbeitet in `state/tasks/a11a-items-ueberlagerung.md`:** Befund 1 (Flag aus und
  `platformOverlay=false`: `staleWarning: false`, cachebar), 2 (`platformOverlay` in
  `isDefaultBrowseQuery`), 6 (Plain-Object statt `Map`), 8 (Feldliste, Bildgruppe als Einheit),
  9 (`signal` gestrichen), `maxAttempts` mit `Math.max(1, …)`, Dateiköpfe.
- **Eingearbeitet in `state/tasks/a11b-items-schutz.md`:** Befund 3 (vorläufiger A11a-Test wird
  ersetzt, ESCALATE-Ausnahme), 4 (Merker auch bei Formfehlern), 5 (`requestedKeys` voll, Pause
  und Chain-Abweichler je Anfrage, Definition „Plattformfehler"), 6 (Round-Trip mit dem echten
  `shared-cache`), 7 (TTL in ganzen Sekunden), 9 (vollständige Prüfreihenfolge), 10 und 11
  (Ledger-Format, Verdrängungsrisiko ohne Redis, Dateiköpfe).
- **Nicht geprüft, nur eingearbeitet:** Die Korrekturen sind Textänderungen an den Verträgen und
  nicht gegen Code gebaut. Ein dritter Advisor-Pass ist laut Bericht nicht nötig; der
  Reviewer-Pass nach dem Bau prüft sie am Code.
