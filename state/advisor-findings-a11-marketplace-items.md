# Advisor-Bericht: Plan v1 A11 `/api/marketplace/items` aus der Plattform lesen

## Kopf

**Geprüft gegen:**
- `ARCHITECTURE.md` (§4 `apiHandler`, §6 Vitest, §7 relative Imports)
- `state/plan-v1-a11-marketplace-items.md`
- `src/app/api/marketplace/items/route.ts` (Zeilen 1–330 und 330–818 vollständig gelesen)
- `src/lib/redis/shared-cache.ts` und `src/lib/redis/client.ts`
- `src/lib/nft-data-platform/`: `write.ts`, `client.ts` (Schleife ab ~Z. 355–560), `rate-limit.ts`, `errors.ts`, `view-state.ts`, `schemas.ts` (Auszüge), `config.ts` (Auszüge), `mappers/token-detail.ts`
- `src/lib/init-services.ts` (Z. 45–75, Prewarm)
- `src/app/api/nft/detail/route.ts` (Z. 100–285), `src/app/api/collections/route.ts` (Auszüge) und `collections/route.test.ts` (Struktur)
- `src/lib/api/handler.ts`, `src/lib/middleware/rateLimit.ts`, `src/services/blockchain/collection-whitelist.ts`
- Schreiber von `marketplace_items`: `services/marketplace/event-mongodb-sync.ts`, `services/nft-sync/graph-subscription.ts`
- Aufrufer der Route: `useMarketplaceItems.ts`, `app/page.tsx`, `CollectionItemsList.tsx`, `WalletNFTsService.ts`
- Typ `MarketplaceItemsResponse` in `src/types/marketplace/enriched-nft.ts`
- Abnehmer von `metadata.images` und `contract.*`: `NFTCard.tsx`, `utils/nft/scrollItem.ts`
- Spec: V22, V32, V33, V34, Entscheidungen 1 und 14
- `vitest.config.ts`, `docs/environment/ENV_VARIABLES.md`

**Rollengrenze und blinde Flecken:**
- Nur Lesezugriff.
- Kein Zugriff aufs Plattform-Repo. Plattformaussagen stützen sich ausschließlich auf die vom Menschen verifizierten Fakten (Stand `cea0ea4`).
- Nicht gelesen oder nicht geprüft:
  - `state/befund-a11-aufrufzahl.md`, wie vorgegeben nur der Korrekturblock gültig, und der Rest von `plan-v2` §6. Ich habe nur per Suche in `plan-v2` und Spec nachgeschlagen.
  - `NFTImage` und die Bildvarianten-Logik. Befund 5 ist deshalb nur abgeleitet.
  - Reale Mongo-Daten: ob `chainId` je Eintrag gefüllt ist und in welcher Schreibweise Adressen stehen.
  - Produktions-Deployment: ob `REDIS_URL` gesetzt ist, ob ein CDN vor der Route steht, wie viele Instanzen laufen.
  - Das Verhalten der Plattform, wenn ein Token bekannt, aber metadatenmäßig unvollständig ist (`ready` mit leerem `media`).
  - Ob die Plattform doppelte Identitäten im Batch akzeptiert.
  - Ob ein Bündelaufruf im Fensterlimit als 1 zählt. Der Plan führt das selbst als offen.

## Marker-Legende

- **[Fakt]**: im Code belegt.
- **[Schlussfolgerung]**: abgeleitet.
- **[Annahme]**: unbelegte Prämisse.
- **[offene Unsicherheit]**: weder belegt noch widerlegt.
- **[Fakt, entlastend]**: bestätigte Stelle.

---

## Befunde, nach Schwere

### 1. Ein Plattformausfall macht die Übersicht langsam statt „nutzbar“. Der Plan hat dafür keine Grenze. [Fakt + Schlussfolgerung]

- **[Fakt]** Der Client hat Timeout 10 s und `maxAttempts` 3 (`config.ts:217-218`). Bei Timeout, 5xx und Netzfehler gibt es Backoff mit bis zu 250 ms und 500 ms (`client.ts:412-502, 552-556`; `backoffMs` ~Z. 123).
- **[Fakt]** `discoverTokens(identities, deps)` (`write.ts` ~Z. 297) reicht weder `timeoutMs` noch `signal` an `requestPlatform` durch. `PlatformTransportDeps` hat keines von beiden (`client.ts:~75-90`). Die Route kann den Timeout über die geplante Schnittstelle also nicht senken.
- **[Schlussfolgerung]** Im schlechtesten Fall hängt die Übersicht rund 30 s in einem einzigen Discover-Aufruf, bevor `translatePlatformError` greift. Nur Auth-, Config- und 4xx-Fehler scheitern sofort.
- **[Schlussfolgerung]** Der Plan verbietet, degradierte Antworten zu cachen (SCOPE Nr. 2), und hat keinen Ausfall-Merker. Bei einem Ausfall zahlt deshalb **jede** Anfrage die vollen ~30 s. Die Prewarm-Anfrage beim Start und der Warm-up von `app/page.tsx:17` hängen dann ebenfalls so lange.
- **[Fakt]** Der 429-Pfad ist dagegen unkritisch: `client.ts:420-427` wirft sofort, wenn die Wartezeit über dem Timeout liegt, sonst wartet er höchstens 10 s.
- **[Fakt]** Timeout-Wiederholungen sind neue signierte POSTs. Bei schreibendem Discover (Re-Enqueue) addieren sie Last auf der Plattform.
- **Folge:** Der Plan braucht vor dem Bau eine Entscheidung. Möglichkeiten:
  - ein kurzer Timeout und ein Versuch für diese Route, was eine Änderung an `write.ts` oder `requestPlatform` (kleine Option) bedeutet und damit den Umfang berührt;
  - ein Ausfall-Merker im Shared Cache (z. B. 30–60 s „Plattform down, nicht anfragen“);
  - beides.

### 2. `ready` heißt nicht „vollständig“. Die Überlagerung kann bessere lokale Werte durch leere ersetzen. [Fakt + Schlussfolgerung]

- **[Fakt]** `mapPlatformTokenToMetadata` liefert `name: token.name` (nullable) und `image: ''`, wenn alle drei Medien-URLs `null` sind (`mappers/token-detail.ts` `pickDisplayImage`, Kommentar „Ein Token in Verarbeitung hat alle drei `null`“).
- **[Fakt]** `mapPlatformToContract` bekommt im Plan nur Token und Collection, also `balances = {}`. Das Ergebnis hat `owner: null`, `ownerBalance: null`, `tokenURI: null` und kein `totalSupply`. Bei `collection: null` auch `name` und `symbol: null` (`token-detail.ts`, `mapPlatformToContract`).
- **[Fakt]** Der Mongo-`contract` der Liste trägt `owner`, `tokenURI`, `totalSupply` und mehr (`EnrichedNFTDocument.contract`, `enriched-nft.ts`). Die Liste liest sie in `utils/nft/scrollItem.ts:82-84, 143-145`.
- **[Schlussfolgerung]** „`contract` je Karte überlagern“ ersetzt den lokalen Block im Wortlaut durch einen ärmeren. Das widerspricht „Feldnamen unverändert“ im Geist. Zudem überschreibt `ready` mit `name: null` oder leerem Bild einen vorhandenen lokalen Wert.
- **[Annahme]** Der Plan nimmt stillschweigend an, dass ein `ready`-Eintrag anzeigefertig ist. Ob die Plattform `ready` auch für Token mit `mediaStatus: processing` liefert, ist ungeprüft. Der Code (`view-state.ts` kennt `token-without-collection`) legt das nahe.
- **Folge:** Feldweise überlagern statt Blockersatz, d. h. lokalen Wert behalten, wenn der Plattformwert `null` oder leer ist. Dann ist festzulegen, ob so ein Eintrag `staleWarning` auslöst. Das gehört in den Mapper-Vertrag und die Mapper-Tests.

### 3. Die Drosselung (SCOPE Nr. 3) hat kein Schlüsseldesign und trägt mit der vorhandenen Schnittstelle nicht wie beschrieben. [Fakt + Schlussfolgerung]

- **[Fakt, entlastend]** Die Schnittstelle hat TTL je Schlüssel: `setSharedCacheValue(key, value, ttlSeconds)` (`shared-cache.ts` ~Z. 59-78). Die ESCALATE-Bedingung „kein Ablauf je Schlüssel“ trifft damit nicht zu.
- **[Fakt]** Der Plan nennt keinen Schlüssel. Es gibt kein `mget` und kein `NX`.
  - Variante je Identität: bis zu 100 `get` pro Anfrage (mit `enableAutoPipelining` in `client.ts` tragbar, aber ein Zusatzpfad).
  - Variante mit einem Set-Schlüssel: Read-Modify-Write ohne Atomarität, und die TTL gilt für den ganzen Schlüssel statt je Identität.
- **[Fakt]** Ein Redis-Ausfall ist über diese Schnittstelle **nicht erkennbar**. `get` und `set` verschlucken jeden Fehler und fallen still auf eine Prozess-`Map` zurück (`shared-cache.ts` ~Z. 39-41, ~68-72). Der Plantext „Ausfall des Shared Cache heißt: ohne Drosselung weiterfahren und `logger.warn`“ ist so nicht umsetzbar. Es gibt keinen Fehlerpfad, den man abfangen könnte. Entweder man nimmt die stille Per-Prozess-Drosselung hin oder man erweitert die Schnittstelle (nicht im SCOPE).
- **[Fakt]** `REDIS_URL` ist optional, ohne Redis fällt man auf Speicher zurück (`ENV_VARIABLES.md:68`). Ohne Redis ist der „gemeinsame“ Cache pro Prozess. Das widerspricht der ESCALATE-Zeile („im Mehrinstanzbetrieb wirkungslos“), ohne dass der Plan prüft, ob Produktion Redis hat. **[offene Unsicherheit]**
- **[Fakt]** Der lokale Fallback ruft bei **jedem** `get` `cleanupLocalCache()` auf (Scan über bis zu 5000 Einträge, `shared-cache.ts` ~Z. 46). Bei 100 Einzelschlüsseln pro Anfrage sind das bis zu ~500k Iterationen. Es skaliert, aber der Plan sollte das Schlüsselmodell danach wählen.
- **[Fakt]** `discoverTokens` gibt für durch **unseren** Whitelist-Filter abgelehnte Identitäten `failed` zurück (`write.ts` `partitionByWhitelist`/`rejectedItem`). Der Plan drosselt „was nicht `ready` zurückkam“. Diese Einträge würden mitgedrosselt, obwohl nie ein Plattformaufruf entstand.
  - Nicht gelistete Collections lösen dann **dauerhaft** `staleWarning` aus.
  - Ein transienter Whitelist-Lesefehler ohne Altstand liefert eine leere Menge (`collection-whitelist.ts` ~Z. 220-236). Das vergiftet **alle** Identitäten für 10 Minuten.
  - **Folge:** Pause nur für Einträge, die die Plattform tatsächlich (`queued`/`failed`) beantwortet hat. Filter-Ablehnungen davon trennen. Dazu muss `rejectedItem` unterscheidbar bleiben (die Meldung `NOT_WHITELISTED_MESSAGE` ist die einzige Marke, fragil).
- **[Fakt, entlastend]** Die Identitäten kommen aus **unserer** DB (`marketplace_items`), nicht aus Nutzereingaben. Ein anonymer Aufrufer kann keine beliebigen Token zum Discover bringen, nur das Fenster über Seite, Filter und `isListed=false` verschieben. Die Arbeit auf der Plattform ist damit durch die Zahl der `marketplace_items`-Dokumente begrenzt. Mit funktionierender Pause ist das höchstens eine Neu-Einreihung je Identität und 10 min.
- **[Schlussfolgerung]** Hungern: Ein Token, das dauerhaft nicht `ready` wird, behält lokale Werte und `staleWarning` auf unbestimmte Zeit. Das ist eine Anzeigequalität, aber kein Funktionsausfall. Ein Token, das nach der Pause `ready` wird, überlagert beim nächsten Anfragen nach Ablauf. Es gibt keinen Trigger dazwischen, und die Verzögerung beträgt bis zu 10 min. Vertretbar, aber im Plan nicht benannt.
- **[Schlussfolgerung]** Race: GET-dann-SET ohne Atomarität. Zwei parallele Anfragen fragen dieselbe Identität an. Wegen deterministischer Job-IDs ist das für laufende Jobs harmlos, für `completed` nicht (Re-Enqueue). Klein, aber real.

### 4. Der Verstärkungsweg ist nicht das Einreihen, sondern das gemeinsame 600er-Budget. Die Drosselung deckt ihn nicht ab. [Fakt + Schlussfolgerung]

- **[Fakt]** Die Route ist öffentlich. Sie nutzt `apiHandler` mit Standard `LENIENT` = 120 Anfragen/min (`handler.ts:~114-116`, `rateLimit.ts:~57`).
- **[Fakt]** Der Limit-Schlüssel ist Route + erste `x-forwarded-for`-IP + **User-Agent** (`rateLimit.ts:~66-77`). Ein Aufrufer rotiert den User-Agent trivial. Die Begrenzung ist schwach.
- **[Fakt]** Nur die Standardansicht ist gecacht (Plan CONTEXT und `route.ts:~160-180`). Jede andere Variante (andere Seite, `sortBy`, `seller`, `contractAddress`, `limit` 1–100) geht ungecacht durch und kostet einen Discover-Aufruf für die **`ready`**-Token, denn nur Nicht-`ready` werden pausiert.
- **[Schlussfolgerung]** Ein Aufrufer kann mit wechselnden Parametern das gemeinsame `alpha-read`-Budget (600/min, Spec Entscheidung 14) leerlaufen lassen. Dadurch bekommen Detailseite (3 Aufrufe je Besuch, `nft/detail/route.ts:~140-150`), A4b-Push und A6 ein 429/503. Das ist ein Denial-of-Budget-Pfad gegen die eigene Plattformanbindung.
- **[Fakt]** Der Plan nimmt das als gegeben hin („kosten je einen Aufruf“), erklärt aber nicht, warum es akzeptabel ist.
- **Folge:** Vor dem Bau klären, ob ein kleiner, parameterunabhängiger Ergebnis-Cache nötig ist. Das kann ein Overlay-Cache pro Seitenidentitätsmenge sein, z. B. Schlüssel = Hash der sortierten Identitäten, TTL 15–60 s. Der würde zugleich die Pause tragen (ein `get`/`set` je Anfrage statt je Identität) und die Zählung „ein Aufruf je Seite“ stabilisieren. Das wäre eine Entscheidung des Planautors, nicht meine Umschreibung.

### 5. „Höchstens ca. 4 Aufrufe/min“ stimmt nur im Normalfall. Und „degradierte Antwort nicht cachen“ hebt den Antwort-Cache gerade im häufigen Teilzustand auf. [Fakt + Schlussfolgerung]

- **[Fakt]** Der Plan setzt `staleWarning: true`, sobald **irgendeine** Karte nicht überlagert ist (SCOPE Nr. 2). Eine dauerhaft pausierte, nicht gelistete oder nie `ready` werdende Karte auf Seite 1 verhindert dann dauerhaft den Cache-Schreibzugriff.
- **[Schlussfolgerung]** In dem Fall gilt für die Standardansicht weder 15 s Cache noch „~4 Aufrufe/min“. Jede Anfrage macht die volle Mongo-Aggregation (mit drei `$lookup`s) und einen Discover für die `ready`-Karten. Das ist ein Rückschritt gegenüber heute. Der Cache war eingeführt worden, um genau diese Kosten zu sparen (Kommentar `init-services.ts:52-54`). Die Prewarm-Anfrage beim Start hilft dann auch nicht.
- **Folge:** Unterscheiden zwischen „Plattform-Ausfall/Fehler“ (nicht cachen oder nur kurz) und „einzelne Karten dauerhaft nicht überlagerbar“ (cachen, ggf. mit `staleWarning` im Cache-Eintrag). Das Plan-Kriterium im GOAL ist sonst mit der Aufrufzahl-Aussage nicht vereinbar.
- **[Fakt]** Die HTTP-Antwort setzt unabhängig davon immer `Cache-Control: public, s-maxage=10, stale-while-revalidate=30` (`route.ts:~811`). Ein CDN oder Proxy würde die degradierte Antwort 10 s plus 30 s SWR trotzdem halten. Der Plan adressiert nur den App-Cache. **[offene Unsicherheit]**, ob ein CDN davor steht. Bei `staleWarning` müsste der Header zurückgenommen oder kurz gesetzt werden.
- **[Fakt]** Der Antwort-Cache (get → Aggregation → set) hat keinen Lock. Die Stampede bei Ablauf gibt es heute schon (N parallele Misses), und sie kommt jetzt mit N Discover-Aufrufen. Das ist nicht neu, aber der Plan misst „Aufrufe/min“ nur für den sequenziellen Fall.
- **[Fakt, entlastend]** Zur Frage, ob die Vorwärmung den Standard-Cache mit rein lokalen Werten füllt: Nein. `prewarmMarketplaceApi` ruft die Route per HTTP auf (`init-services.ts:55-60`) mit exakt der Standard-URL. Sie läuft über denselben Pfad und füllt den Cache mit den überlagerten Werten.
  - Der Aufruf passiert **einmal pro Instanzstart** (`init-services.ts:216-219`), nicht periodisch.
  - Dazu kommt `app/page.tsx:17`, ein Warm-up pro Home-Besuch (Browser, anonym). Es trifft nur die gecachte Standardansicht.
  - Der Plan-Hinweis „wenn ja, melden“ erledigt sich damit zu „nein“. Der Schlüssel (`:v2`) sollte trotzdem auf `:v3` gehoben werden, weil sich die Eintragsform (neue Felder) ändert und Alt-Einträge in Redis sonst bis zu 15 s ohne `dataSource` ausgeliefert werden. Unkritisch, aber billig.

### 6. Zwei weitere Aufrufer der Route fehlen im Plan, einer davon verursacht sinnlose Discover-Last. [Fakt]

- **[Fakt]** `WalletNFTsService.enrichWithMarketplaceData` ruft `/api/marketplace/items?limit=100` (`WalletNFTsService.ts:624`) und nutzt nur Listing-Felder (`marketplace.isListed/price/seller/…`, Z. 636-672). Metadaten und Contract werden nicht gebraucht.
  - Jeder Wallet-Aufruf kostet damit künftig bis zu 100 Identitäten im Discover **ohne Nutzen**. Er ist nicht die Standardansicht (`limit=100`), also ungecacht.
  - Der Aufrufer steht weder in „Berührt“ noch in „NICHT“.
- **[Fakt]** `app/page.tsx:17` (Warm-up) und `CollectionItemsList.tsx:52` (`contractAddress` + `limit=8`) sind Aufrufer. Die Detailseite löst damit jetzt 3 + 1 Plattformaufrufe aus. Der Kommentar in `nft/detail/route.ts:~141-143` hält fest, dass jede weitere Abfrage dort sich über die Aufrufer vervielfacht. Die Doppelzählung gegen den `alpha-read`-Topf (Detail + Items + A4b-Push) ist im Plan nicht quantifiziert.
- **Folge:** Eine Möglichkeit, die Überlagerung gezielt auszuschalten (z. B. `includeMetadata=false` oder Auslassen bei `limit=100` ohne Filter), müsste im Plan entschieden werden, oder `WalletNFTsService` wird bewusst als bekannter Kostenpunkt aufgenommen.

### 7. Die Ränder der Überlagerungs-These sind größer als im Plan beschrieben. [Fakt + Schlussfolgerung]

- **[Fakt]** Auswahl und Sortierung laufen vollständig auf Mongo-Feldern: `$match` auf `metadata.name`, `metadata.description`, `contract.name`, `contract.symbol` (Suche), `sortName` = `$nftData.metadata.name` (Sortierung). Das steht im Aggregationsteil von `route.ts`, nach dem `$lookup` auf `nft_metadata`. Insights und Stats laufen auf anderen Collections.
- **[Schlussfolgerung]** Die Inkonsistenz ist real und **größer** als „Suche bleibt lokal“:
  - Sortierung nach Name und Suchtreffer folgen dem lokalen Namen, die Karte zeigt den Plattformnamen. Weicht er ab, passt ein Treffer nicht zum Suchbegriff, oder die Reihenfolge wirkt unsortiert.
  - Karten ohne lokales `nft_metadata`-Dokument haben `sortName = ''` und sind über Suche **unauffindbar**, obwohl die Plattform einen Namen liefert. Das sind genau die Token, die die Migration bedienen soll.
  - Folge: Die Sync-Dienste (IPFS Lazy-Sync, Image-Enrichment) müssen weiterlaufen, sonst veraltet der Suchindex. Der Plan sagt nur, `$lookup` bleibt. Das Risiko „Rückfallweg altert“ steht schon in `plan-v2:~740`.
- **[Fakt]** Spec Entscheidung 1 weist der Plattform die Suche zu („Die Plattform übernimmt Token, Collections, Wallet-Inventar, Suche“). V32 lässt die Suche als einziges Element ausdrücklich „eingeschränkt“ zu. Der Plan stellt den Widerspruch zu E6 korrekt dar, aber der Widerspruch betrifft auch `sortBy=name` und `contract.name/symbol`, nicht nur die Freitextsuche.
- **[Fakt, entlastend]** Das Muster „lokal wählen, von der Plattform überlagern“ ist dasselbe wie in `collections/route.ts` (Dateikopf Z. 8-17) und `nft/detail/route.ts` (`buildTokenDetailOverlay`). Der Plan weicht dort nicht ab. Die Kategorie-, Raritäts- und Tag-Filter laufen auf Insights (lokal, gewollt) und sind nicht betroffen.
- **Folge:** Die Zielbild-Formulierung in `plan-v2` Abschnitt 2 muss enger werden (der Plan sagt das selbst unter FOLGT). Zusätzlich ist „Suche/Name-Sortierung lokal“ als bewusste, dokumentierte Abweichung von V32/Entscheidung 1 zu führen, nicht als reine Folge.

### 8. Identität: Der Plan prüft `chainId` je Eintrag, aber nicht die Normalisierung. [Fakt + offene Unsicherheit]

- **[Fakt]** Beide Schreiber setzen `chainId` hartcodiert auf Sepolia: `event-mongodb-sync.ts:~31` (`11155111`) und `graph-subscription.ts:~212-223` (`const chainId = 11155111`, plus `listing.chainId` im Filter). `event-mongodb-sync.ts` setzt `chainId` im Dokument, `graph-subscription.ts` auch (`listing.chainId`). Ältere Dokumente können es fehlen haben. **[offene Unsicherheit]**, weil kein Datenzugriff.
- **[Schlussfolgerung]** `getChainConfig().chain.id` (wie `nft/detail/route.ts:~131` und `collections`) ist der konsistente, billigere Weg. Der Plan hat beide Optionen offen und ESCALATE „anhalten“. Besser vorab festlegen: konfigurierte Kette, Dokumente mit abweichender `chainId` auslassen.
- **[Fakt]** Der Pipeline-Output behält `resolvedContractAddress` und `resolvedTokenId` (`$toString`) als Felder. Nur `contractAddress` wird auf `resolvedContractAddress` gesetzt, `tokenId` bleibt im Originaltyp (`route.ts` `$addFields`). Als Identität sollen `resolvedContractAddress` und `resolvedTokenId` dienen, nicht `item.tokenId`. Im Plan ist das nicht festgelegt.
- **[Fakt]** `partitionByWhitelist` verlangt `ADDRESS_PATTERN` (40 Hex). Ungültige Adressen werden mit `logger.warn` abgelehnt und als `failed` zurückgegeben (`collection-whitelist.ts:~253-271`). Sie fallen also **nicht** still durchs Raster, solange der Mapper `failed` in die Auslassliste nimmt, wie geplant.
- **[Lücke im Planvertrag]** Die Funktion `buildItemOverlayMap(discoverItems)` bekommt nur die Antwort. „Ohne Treffer“ (angefragt, aber nicht in der Antwort) lässt sich daraus **nicht** bilden. Entweder die angefragten Schlüssel als zweiten Parameter übergeben, oder die Route berechnet die Differenz. So steht es im Plan nicht.
- **[offene Unsicherheit]** Doppelte Identitäten: `isListed=false` und Mehrfach-Listings desselben Tokens erzeugen Duplikate im Batch. Der Plan nennt keine Deduplizierung. Ob die Plattform Duplikate akzeptiert, ist unbekannt.
- **[offene Unsicherheit]** Ob die Plattform `contractAddress` und `tokenId` in der Antwort normalisiert (Checksum, führende Nullen), ist ungeprüft. Der Plan lowercased den Schlüssel, vergleicht `tokenId` aber unverändert.

### 9. `MarketplaceItemsResponse` und die Cache-Typen sind betroffen, stehen aber nicht im SCOPE. [Fakt]

- **[Fakt]** `route.ts:~751` typisiert `response` als `MarketplaceItemsResponse['data']`. Das Interface kennt weder `dataSource` noch `staleWarning` (`enriched-nft.ts`, Interface-Block `MarketplaceItemsResponse`).
- **[Schlussfolgerung]** Ein Objektliteral mit diesen zusätzlichen Feldern ist ein Excess-Property-Fehler, `npm run check` wird rot. Der Plan verbietet „neues `any`“. Er muss die Typdatei in den SCOPE nehmen: zwei optionale Felder, und die Clients (`MarketplaceItemsCache`, `MarketplaceItemsService`) verwenden den Typ mit.
- **[Fakt]** Kein UI-Code liest `staleWarning` (Suche liefert nur API-Routen und Tests). Die Kennzeichnung „möglicherweise veraltet“ (V32) ist damit für die Übersicht serverseitig vorhanden, aber für Nutzer unsichtbar. Der Plan („nur lesen und bestätigen“) bestätigt das nur, benennt es aber nicht als Lücke zu V32.
- **[Fakt]** `useMarketplaceItems.ts` und `MarketplaceItemsCache.ts` cachen die Antwort clientseitig (`cacheContext.setCache`). Eine degradierte Seite 1 überlebt dort ohne Kennzeichnung. Das ist Nebenwirkung, kein Blocker.

### 10. Testbarkeit: machbar ohne Routenumbau, aber die geplanten Aussagen sind teils schwächer, als der Plan klingt. [Fakt + Schlussfolgerung]

- **[Fakt, entlastend]** Es gibt eine Vorlage: `collections/route.test.ts` mockt `@/lib/mongodb` mit `aggregate` über `vi.mock` (Z. ~25-36) und `@/lib/nft-data-platform/read`. Es testet dort schon „genau EINEN Plattform-Aufruf für zwölf Collections“ (Z. 177). Die Infrastruktur (Vitest, jsdom, Alias `@`, `vitest.config.ts`) reicht. Ein Umbau der 780-Zeilen-Route ist **nicht** nötig.
- **[Fakt]** Es gibt noch keine `route.test.ts` für `items/` (Glob). Der Plan sagt „zuerst prüfen“, das ist erledigt: neu.
- **[Schlussfolgerung]** Zusätzlicher Aufwand beim Mocken der Route:
  - `import '@/lib/dev-services-auto-start'` hat einen Seiteneffekt (Route Z. ~108) und muss gemockt werden.
  - Das Modul hat einen Prozess-`filterOptionsCache`, also entweder `includeFilters=false` oder `vi.resetModules`.
  - Die Route nutzt `collection.aggregate().toArray()`, `countDocuments` und `distinct` auf mehreren Collections. Der Mock muss alle liefern.
  - `NODE_ENV=test` schaltet die Debug-Doppelaggregation ab (`isDebugMode`), das ist gut.
  - `shared-cache` und `isCollectionWhitelisted` sind zu mocken.
- **[Schlussfolgerung]** „Ein `discoverTokens`-Aufruf für 20 und für 100 Karten“ misst, wenn `discoverTokens` gemockt wird (wie in `collections`), die **Aufrufstelle**, nicht die HTTP-Anfragen. Die Stückelung (`DISCOVER_BATCH_LIMIT`) ist schon in `write.test.ts` abgedeckt. Der Bericht sollte nicht „gemessene Aufrufzahl“ als HTTP-Zahl ausgeben, sondern als Zahl der `discoverTokens`-Aufrufe benennen.
- **[Schlussfolgerung]** „Suche und Namenssortierung liefern unverändert die lokale Auswahl“ ist mit gemocktem `aggregate` **nicht** als Verhalten prüfbar, die Pipeline läuft nicht. Prüfbar ist nur, dass die gebaute Pipeline `$match` auf `metadata.name` und `$sort` auf `sortName` enthält. Das ist ein Struktur-Test und schwächer als die Formulierung im Plan.
- **Zuschnitt:** Ein Baudurchgang plus eine Korrekturrunde ist mit Mapper, Route, Drosselung, Ausfall-Merker, Typänderung und zwei Testdateien **knapp bis unrealistisch**. Den Umfang trägt die Drosselung (Befunde 3 bis 5), und die ist heute unterspezifiziert. Siehe „Nächster Schritt“.

### 11. Fehlerpfad `translatePlatformError`: erreichbar, mit einer Nebenwirkung. [Fakt, entlastend + Schlussfolgerung]

- **[Fakt, entlastend]** „Ausfall → 200 mit `staleWarning`“ ist mit `translatePlatformError` erreichbar. Für Unavailable, Timeout, RateLimit, Auth und Config gilt `allowLocalFallback: true` (`view-state.ts` ~Z. 150-200). Das Muster „kein Werfen, auch bei `allowLocalFallback: false`“ ist wie in `collections/route.ts:~514-516` begründbar.
- **[Fakt]** `PlatformResponseError` (und damit jeder Zod-Formfehler aus `parseOrThrow` in `write.ts`) ist `allowLocalFallback: false`. Mit dem A9-Muster wird es **trotzdem** zu 200 + `staleWarning`. Das ist konsistent, aber ein Schemafehler bei Discover bleibt dann hinter `staleWarning` versteckt. Die Protokollstufe `error` bleibt (richtig). Der Plan sollte den Kommentar im Code festschreiben.
- **[Fakt]** Der Fehlerstatus 403 (fehlender Scope) ist beim Discover nicht ausgeschlossen. `write.ts` (Dateikopf, „[offene Frage] Diese Aufteilung kann beim ersten echten Lauf 403 geben“) nennt das selbst. Die Spec Entscheidung 14 gibt `alpha-read` `tokens:read` und `refresh:token`, der Plattform-Zuschnitt widerspricht möglicherweise. Tritt das ein, schreibt **jede** Übersicht-Anfrage einen `error`-Log, der Antwort-Cache greift nie (Befund 5), und es gibt keinen Ausfall-Merker (Befund 1). Das ist kein Plan-Fehler, aber ein Grund, den Ausfall-Merker auch für Auth-Fehler vorzusehen. **[offene Unsicherheit]**

### 12. Doppelzählung und Budgetaussage. [Annahme + Fakt]

- **[Annahme, vom Plan selbst benannt]** „Bündelaufruf = 1 Aufruf im Fensterlimit.“ Das bleibt ungeprüft. Der Plan stellt es korrekt auf ESCALATE und FOLGT (Messung in A10).
- **[Fakt]** `rate-limit.ts` zählt eigene Sendeversuche (`recordRequestSent`), die Zählung der Plattform ist die globale Wahrheit. Der Client-Zustand ist je Prozess (`rate-limit.ts:~19-23`, Zustand im Prozess).
- **[Schlussfolgerung]** Mit mehreren Instanzen, Web und Worker zählt jeder für sich. Die zusätzliche Last aus A11 (Befunde 4 und 6) ist in den Ledger-Einträgen noch nicht erfasst. Vor dem Smoke-Lauf wäre eine Zeile im Plan sinnvoll, die A11 ausdrücklich in die Messung A10 einbezieht.

---

## Entlastende Befunde im Überblick

- **[Fakt, entlastend]** Mapper für Token und Contract existieren (`mapPlatformTokenToMetadata`, `mapPlatformToContract`). Kein zweiter Mapper nötig, Plan richtig.
- **[Fakt, entlastend]** `discoverTokens` stückelt auf 500 und filtert **vor** dem Aufruf gegen die Whitelist (V33). Abgelehnte Identitäten kommen als `failed` zurück, nicht verschluckt (`write.ts`, `partitionByWhitelist`).
- **[Fakt, entlastend]** Das Whitelist-Lesen ist im Speicher mit TTL 60 s gecacht und wirft nie (`collection-whitelist.ts:63, 172-237`). 20–100 sequenzielle `isCollectionWhitelisted`-Aufrufe sind billig, nur der erste pro 60 s liest Chain.
- **[Fakt, entlastend]** `isPlatformConfigured()` und das Flag sind als Tor etabliert (`nft/detail/route.ts:~130`, `collections`). Das Muster ist im Plan richtig übernommen.
- **[Fakt, entlastend]** Die Identitäten kommen aus der DB, nicht aus Nutzereingaben. Es gibt keinen Injektionspfad für beliebige Token (siehe Befund 3).
- **[Fakt, entlastend]** Der Plan will nichts Bestehendes entfernen, keine neue Dependency, keine zweite Retry-Logik. Das passt zu `ARCHITECTURE.md` (§4, `apiHandler` bleibt, kein handgerolltes try/catch um die Route; die Plattform-Fehler werden wie in A9 in der Route lokal abgefangen und übersetzt, das ist dort schon etabliert).
- **[Fakt, entlastend]** Die Route-Test-Infrastruktur existiert (Befund 10). Relative Imports (§7) sind im Plan nicht vorgesehen.
- **[Fakt, entlastend]** `staleWarning` und `dataSource` sind im Muster der Schwester-Routen vorbelegt. Für Verbraucher ändert sich nichts an den Feldnamen von `items[]`, solange der Blockersatz aus Befund 2 vermieden wird.

---

## Urteil: **Nicht freigegeben**

Die Richtung stimmt. Das Überlagerungsmuster ist konsistent mit A9 und A7a, der Aufrufzähler „ein Bündelaufruf“ ist belegt, und die Testbarkeit ist ohne Routenumbau gegeben. Der Plan ist aber an den Stellen, an denen er selbst „Hauptrisikopunkt“ sagt (Drosselung, Rückfallweg), unterspezifiziert. Er enthält außerdem Aussagen, die nach Code nicht gelten. Gemeint sind der Redis-Ausfall als Fehlerpfad, „~4 Aufrufe/min“ und „degradiert nicht cachen“.

### Vor Baubeginn zu klären

1. **Ausfall und Latenz (Befund 1):** Wie begrenzt die Route die Wartezeit? Kleine Option für Timeout und Versuche (berührt `write.ts` oder `client.ts`, also nicht im SCOPE) und/oder ein Ausfall-Merker im Shared Cache. Auth-Fehler (403) einschließen.
2. **Überlagerungsvertrag (Befund 2):** feldweise statt Blockersatz. Regel für `ready` mit `name: null`, leerem Bild oder `collection: null`. Festlegen, ob solche Karten `staleWarning` auslösen.
3. **Drosselung (Befund 3):**
   - Schlüsselmodell: je Identität oder je Seiten-Identitätsmenge.
   - Nur echte Plattform-Antworten pausieren, nicht die Whitelist-Ablehnungen.
   - Die Fehlerpfad-Zeile „Cache-Ausfall → `logger.warn`“ streichen oder die Schnittstelle erweitern.
   - Prüfen, ob Produktion Redis hat, sonst Aussage zur Mehrinstanz korrigieren.
4. **Budgetschutz (Befund 4):** Entscheiden, ob ein parameterunabhängiger Overlay-Cache nötig ist. Ohne ihn gilt die Verstärkung auf das 600er-Budget unverändert, und der Plan muss sie als akzeptiertes Risiko benennen.
5. **Cache-Semantik (Befund 5):** „degradiert“ in „Plattformfehler“ und „einzelne Karten nicht überlagerbar“ aufteilen. `Cache-Control` bei `staleWarning` anpassen. Cache-Schlüssel auf `:v3`.
6. **Umfang (Befunde 6, 9):** `WalletNFTsService` (`limit=100`) entscheiden. Typdatei `enriched-nft.ts` in den SCOPE nehmen.
7. **Identität (Befund 8):** Identität aus `resolvedContractAddress` und `resolvedTokenId`, Kette aus `getChainConfig()`, Deduplizierung, Mapper-Signatur für „ohne Treffer“.

### Dürfen mitlaufen

- Zielbild-Formulierung eingrenzen und die Suche als bewusste Abweichung dokumentieren (Befund 7). Das steht schon unter FOLGT.
- Testbeschreibung ehrlich benennen: Zahl der `discoverTokens`-Aufrufe statt HTTP-Zahl, Pipeline-Struktur-Test statt Verhaltenstest (Befund 10).
- Kommentar zu `allowLocalFallback: false` ohne Werfen (Befund 11).
- Fensterzählung messen in A10 und A11 dort ausdrücklich aufnehmen (Befund 12).
- `staleWarning` ohne UI als Lücke zu V32 vermerken (Befund 9).
- Verzögerung bis zu 10 min, bis ein pausiertes Token wieder überlagert wird, im Dateikopf nennen (Befund 3).

## Nächster sinnvoller Schritt

Plan v2 schreiben, der die sieben „Vor Baubeginn“-Punkte entscheidet. Der Rückfallweg (Ausfall-Merker plus Timeout) und die Drosselung sind dabei ein gemeinsamer Entwurf, kein Nachtrag. Danach gehört A11 wegen des Umfangs in zwei Baudurchgänge:
- **A11a:** Mapper, Overlay in der Route, Typ, Fehlerpfad, Aufrufzahl-Test.
- **A11b:** Drosselung und Ausfall-Merker.

Das Plan-Budget nennt eine Abspaltung der Drosselung selbst als Option. A11 darf nicht ohne A11b ausgeliefert werden. Danach erneuter Advisor-Pass, kurz, nur gegen die geänderten Stellen.