<!-- Ziel-Pfad im Repo: state/plan-v2-a11-marketplace-items.md -->
# Plan v2 — A11 `/api/marketplace/items` aus der Plattform lesen

Stand: 19.11.2026 · Ergebnis des Advisor-Passes vom 19.11.2026.
**Vorgänger:** `state/plan-v1-a11-marketplace-items.md` (eingefroren, nicht mehr ändern).
**Befunde:** `state/advisor-findings-a11-marketplace-items.md` (Urteil: *Nicht freigegeben*,
12 Befunde, davon sieben vor Baubeginn zu klären).
Evidenz-Marker: `[Fakt]` belegt · `[Schlussfolgerung]` abgeleitet · `[Annahme]` ungeprüft ·
`[offene Frage]` ungeklärt · `[Vorschlag]` Entscheidung steht beim Menschen.

**Status:** Entschieden am 19.11.2026 — alle `[Vorschlag]`-Punkte vom Menschen bestätigt
(„genau so wie du es vorschlägst"). Die Suche (Abschnitt 10) bleibt offen und blockiert
nichts. Verträge: `state/tasks/a11a-items-ueberlagerung.md`, `state/tasks/a11b-items-schutz.md`.
Danach kurzer zweiter Advisor-Pass nur gegen die geänderten Stellen.

**Berichtigung beim Schreiben der Verträge (19.11.2026):** `[Fakt]` `timeoutMs` gibt es schon je
Anfrage in `PlatformRequestOptions` (`client.ts:76`); es fehlt nur `maxAttempts`, das heute aus
`config.maxAttempts` kommt (`client.ts:412`). Die Option in Abschnitt 4 sitzt deshalb in
`PlatformRequestOptions`, nicht in `PlatformTransportDeps`. `[Fakt]` `WalletNFTsService` liegt
unter `src/contexts/wallet-nfts/`, nicht unter `src/services/`.

---

## 1. Was der Pass am Plan v1 verändert

Die Richtung bleibt: lokal auswählen, von der Plattform überlagern, ein `discoverTokens`-Aufruf
je Anfrage. Neu ist der Zuschnitt und der Inhalt von fünf Stellen, die v1 anders oder gar nicht
beschrieb:

| v1 sagte | Befund | v2 |
|---|---|---|
| `contract` je Karte überlagern | 2: ersetzt `owner`, `tokenURI`, `totalSupply` durch `null`; `ready` heißt nicht „anzeigefertig" | **feldweise** überlagern (Abschnitt 3) |
| Ausfall des gemeinsamen Caches → `logger.warn`, weiterfahren | 3: `shared-cache.ts` verschluckt Fehler und fällt still auf eine Prozess-`Map`; es gibt keinen Fehlerpfad | Zeile entfällt; Per-Prozess-Drosselung ist akzeptiert, Redis-Frage geführt (Abschnitt 5) |
| ein Plattformausfall = 200 mit `staleWarning` | 1: Client hat 10 s Timeout × 3 Versuche, `discoverTokens` reicht keine Grenze durch — bis ~30 s Wartezeit | kurze Grenze **und** Ausfall-Merker (Abschnitt 4) |
| degradierte Antwort nie cachen | 5: eine einzige dauerhaft nicht überlagerbare Karte hebt den Antwort-Cache der Standardansicht auf | „Plattformfehler" und „einzelne Karte" getrennt (Abschnitt 6) |
| ein Aufruf je Anfrage genügt als Budgetaussage | 4: Aufrufer kann mit wechselnden Parametern das 600er-Budget leerlaufen lassen | Überlagerungs-Cache je Seitenmenge (A11b) |

---

## 2. Zuschnitt — zwei Baudurchgänge

`[Fakt, Advisor]` Mapper, Route, Typ, Drosselung, Ausfall-Merker und zwei Testdateien sprengen
„ein Baudurchgang plus eine Korrekturrunde". v1 nannte die Abspaltung der Drosselung selbst
als Option.

- **A11a — Überlagerung.** Mapper, Überlagerung in der Route, Typänderung, Fehlerpfad mit
  kurzer Grenze, Aufrufzahl-Test.
- **A11b — Schutz.** Drosselung gegen Neu-Einreihen, Ausfall-Merker, Überlagerungs-Cache je
  Seitenmenge, Cache-Semantik.

**Tor:** A11a darf nicht ohne A11b **ausgeliefert** werden. Beide bleiben hinter dem
Feature-Flag; das Flag geht erst an, wenn beide gebaut und geprüft sind. `[Schlussfolgerung]`
Zwischen A11a und A11b entsteht dadurch kein Betriebszustand, nur ein Zwischenstand im
Arbeitsbaum.

---

## 3. Überlagerungsvertrag (Befund 2) — `[Vorschlag]`

- Überlagert wird **feldweise**: ein Feld der Plattform ersetzt das lokale nur, wenn es einen
  brauchbaren Wert trägt (nicht `null`, nicht leer). Sonst bleibt der lokale Wert.
- `metadata`: `name`, `description`, `image` (und Varianten) aus `mapPlatformTokenToMetadata`.
- `contract`: **nur** `name` und `symbol`. `owner`, `tokenURI`, `totalSupply` und alles weitere
  bleiben lokal — `utils/nft/scrollItem.ts:82-84, 143-145` liest sie.
- `staleWarning` wird wahr, wenn eine Karte **gar nicht** überlagert werden konnte (`queued`,
  `failed`, pausiert, ohne Treffer) oder der Aufruf scheiterte. Ein einzelnes Feld, das lokal
  blieb, löst es **nicht** aus.
- `[offene Frage]` Ob die Plattform `ready` auch für Token mit laufender Medienverarbeitung
  liefert. Der feldweise Rückfall macht das unschädlich; belegt ist es nicht.

---

## 4. Ausfall und Latenz (Befund 1) — `[Vorschlag]`

`[Fakt, Advisor]` Der Client wartet bei Timeout, 5xx und Netzfehler bis zu 3 × 10 s; ein
Timeout-Wiederholen sendet einen **neuen** signierten POST, bei schreibendem Discover also neue
Last. Nur 429 ist unkritisch (`client.ts:420-427`).

- **Kleine, additive Option** `maxAttempts` in `PlatformRequestOptions` (`timeoutMs` gibt es
  dort schon) und ein dritter, optionaler Parameter `options` an `discoverTokens`. Die Route
  nimmt **3 s und einen Versuch**. Das ist eine Änderung an A1/A3b-Code und wird im Vertrag
  ausdrücklich in den SCOPE genommen, mit Test.
- **Ausfall-Merker** im gemeinsamen Cache: bei **jedem gescheiterten Aufruf**, auch bei einem
  `PlatformResponseError` (Entscheidung 20.11.2026, zweiter Advisor-Pass Befund 4), wird
  `platform:items-overlay:down` für 60 s gesetzt; solange er steht, ruft die
  Route die Plattform nicht an und antwortet lokal mit `staleWarning: true`. Auth-Fehler
  (403, fehlender Scope — `write.ts` nennt das selbst als offen) gehören dazu, sonst schreibt
  jede Anfrage einen `error`-Log.
- `[Schlussfolgerung]` Der Merker funktioniert auch ohne Redis, dann je Prozess.

---

## 5. Drosselung (Befund 3) — `[Vorschlag]`

- Schlüssel **je Identität**: `platform:discover:pause:<chainId>:<adresse klein>:<tokenId>`,
  TTL `DISCOVER_RETRY_PAUSE_MS` (Startwert zehn Minuten, begründet in der Konstante).
  `[Fakt, Advisor]` Es gibt kein `mget`; mit `enableAutoPipelining` sind bis zu 100 `get` je
  Anfrage tragbar. Der Überlagerungs-Cache aus Abschnitt 7 senkt die Zahl der Anfragen, die
  überhaupt so weit kommen.
- Pausiert werden **nur** Einträge, die die **Plattform** mit `queued` oder `failed`
  beantwortet hat. **Nicht** pausiert werden Ablehnungen durch unseren Whitelist-Filter: sonst
  lösen nicht gelistete Collections dauerhaft `staleWarning` aus, und ein vorübergehender
  Whitelist-Lesefehler (liefert eine leere Menge) vergiftet **alle** Identitäten zehn Minuten.
  Dafür exportiert `write.ts` ein Unterscheidungsmerkmal (`isRejectedByWhitelist(item)`) statt
  die Meldung als Zeichenkette zu vergleichen. Das ist eine additive Änderung im SCOPE von A11b.
- Die ESCALATE-/Fehlerpfad-Zeile „Ausfall des gemeinsamen Caches → `logger.warn`" aus v1
  **entfällt**. `[Fakt, Advisor]` `shared-cache.ts` verschluckt Fehler; ein Fehlerpfad existiert
  nicht. Akzeptiert ist: ohne Redis wirkt die Drosselung je Prozess.
- `[offene Frage]` Hat die Produktion `REDIS_URL` gesetzt, und wie viele Instanzen laufen?
  Davon hängt ab, ob „gemeinsam" wörtlich stimmt (`ENV_VARIABLES.md:68`: optional). Vor dem
  Umschalten zu klären, nicht vor dem Bau.
- `[Schlussfolgerung]` Hungern: ein Token, das nach der Pause `ready` wird, erscheint bis zu
  zehn Minuten später überlagert. Das steht im Dateikopf der Route.

---

## 6. Cache-Semantik (Befund 5) — `[Vorschlag]`

- **Plattformfehler** (Ausfall-Merker gesetzt oder Aufruf gescheitert): Antwort wird **nicht**
  in den Antwort-Cache geschrieben, und `Cache-Control` wird auf kurz/aus gesetzt
  (`route.ts:~811` setzt sonst immer `s-maxage=10, stale-while-revalidate=30`).
- **Einzelne Karte nicht überlagerbar:** Antwort **wird** gecacht, `staleWarning: true` steht im
  Cache-Eintrag. Sonst hebt eine dauerhaft nicht überlagerbare Karte auf Seite 1 den 15-s-Cache
  und die Vorwärmung auf — ein Rückschritt gegenüber heute.
- Cache-Schlüssel von `:v2` auf `:v3`, weil sich die Eintragsform ändert.
- `[offene Frage]` Steht ein CDN vor der Route? Bestimmt, ob der Header wirkt.
- `[Fakt, Advisor, entlastend]` Die Vorwärmung (`init-services.ts:55-60`) ruft die Route per
  HTTP auf und füllt den Cache mit überlagerten Werten. Die v1-Sorge „füllt sie mit rein
  lokalen Werten" erledigt sich mit **nein**.

---

## 7. Budgetschutz (Befund 4) — `[Vorschlag]`

`[Fakt, Advisor]` Die Route ist öffentlich, `apiHandler` begrenzt mit `LENIENT` (120/min) nach
Route + IP + **User-Agent** — ein Aufrufer rotiert den User-Agent. Nur die Standardansicht ist
gecacht; jede andere Parameterkombination kostet einen Discover für die `ready`-Token.
`[Schlussfolgerung]` Das gemeinsame `alpha-read`-Budget (600/min) wird so zum Angriffsziel;
Detailseite (3 Aufrufe je Besuch), A4b-Push und A6 bekämen 429.

- **Überlagerungs-Cache je Seitenmenge:** Schlüssel = Hash der **sortierten**
  Identitätsmenge, TTL 30 s, Wert = die Überlagerungskarte. Parameterunabhängig: dieselbe
  Seitenmenge unter anderer Sortierung oder anderem Filter trifft denselben Eintrag.
- `[Annahme]` 30 s sind für die Anzeige von Metadaten unkritisch; nicht gemessen.
- Das schwache Limit der Route selbst ist **nicht** Gegenstand von A11 und wird als eigener
  Ledger-Eintrag geführt.
- A11 wird in die Fensterzählung von A10 aufgenommen (Befund 12): `x-ratelimit-remaining` vor
  und nach einem Discover-Aufruf mit mehreren Einträgen. Der Zähler des Clients ist je Prozess
  (`rate-limit.ts:~19-23`); Web und Worker zählen getrennt.

---

## 8. Umfang und Aufrufer (Befunde 6, 9) — `[Vorschlag]`

- **`WalletNFTsService.enrichWithMarketplaceData`** ruft `/api/marketplace/items?limit=100`
  (`WalletNFTsService.ts:624`) und nutzt nur Listing-Felder. Ohne Eingriff kostet jeder
  Wallet-Aufruf bis zu 100 Identitäten im Discover **ohne Nutzen**, ungecacht. Vorschlag: die
  Route nimmt `platformOverlay=false` an und überspringt dann die Überlagerung; der Dienst
  setzt den Parameter. Eine Zeile im Dienst, damit sie im SCOPE von A11a steht.
- **Typdatei** `src/types/marketplace/enriched-nft.ts` kommt in den SCOPE: `dataSource` und
  `staleWarning` als optionale Felder von `MarketplaceItemsResponse['data']`. Sonst ist ein
  Objektliteral mit den neuen Feldern ein Excess-Property-Fehler, und `npm run check` wird rot.
- `[Fakt, Advisor]` Kein UI-Code liest `staleWarning`. V32 verlangt die Kennzeichnung; für die
  Übersicht ist sie serverseitig vorhanden, für Nutzer unsichtbar. **Als Lücke zu V32
  vermerkt, nicht in A11 gelöst.**
- `useMarketplaceItems.ts` und `MarketplaceItemsCache.ts` cachen clientseitig; eine degradierte
  Seite 1 überlebt dort ohne Kennzeichnung. Nebenwirkung, kein Blocker.

---

## 9. Identität (Befund 8) — `[Vorschlag]`

- Quelle der Identität: `resolvedContractAddress` und `resolvedTokenId` der Pipeline, **nicht**
  `item.tokenId` (bleibt im Originaltyp).
- Kette: `getChainConfig().chain.id`, wie Detailroute und `/api/collections`. Einträge mit
  abweichender `chainId` werden ausgelassen und als nicht überlagert gezählt.
  `[Fakt, Advisor]` Beide Schreiber setzen `chainId` hart auf Sepolia
  (`event-mongodb-sync.ts:~31`, `graph-subscription.ts:~212-223`); Altdokumente können sie
  nicht tragen (`[offene Unsicherheit]`, kein Datenzugriff).
- **Deduplizieren** vor dem Aufruf (Mehrfach-Listings desselben Tokens, `isListed=false`).
- Mapper-Signatur: `buildItemOverlayMap(requestedKeys, discoverItems)` — „angefragt, aber nicht
  geantwortet" ist aus der Antwort allein nicht zu bilden.
- Schlüssel: Adresse klein, `tokenId` als Zeichenkette unverändert.
  `[offene Unsicherheit]` Ob die Plattform beides in der Antwort normalisiert.

---

## 10. Die Suche — weiter offen, jetzt größer beschrieben (Befund 7)

`[Fakt, Advisor]` Der Widerspruch zu E6 betrifft nicht nur die Freitextsuche, sondern auch
`sortBy=name` und `contract.name`/`symbol` im Suchfilter: alle laufen auf `nft_metadata`.

- Sortierung und Treffer folgen dem **lokalen** Namen, die Karte zeigt den **Plattform**-Namen.
  Weicht er ab, passt ein Treffer nicht zum Suchbegriff.
- Karten ohne lokales `nft_metadata`-Dokument haben `sortName = ''` und sind über die Suche
  **unauffindbar** — genau die Token, die die Migration bedienen soll.
- Die Sync-Dienste (IPFS-Lazy-Sync, Bild-Anreicherung) müssen weiterlaufen, sonst altert der
  Suchindex (`plan-v2-plattform-integration.md:~740`).
- `[Fakt]` Spec Entscheidung 1 weist der Plattform die Suche zu; V32 lässt sie als einziges
  Element „eingeschränkt" zu. „Suche und Namenssortierung lokal" ist deshalb eine **bewusste,
  zu dokumentierende Abweichung von V32 und Entscheidung 1**, keine bloße Folge.

**Entscheidung offen** (E6-Rest, `plan-v2-plattform-integration.md`, Abschnitt 6): dauerhaft
lokal, oder über `GET /api/v1/search`. A11a und A11b sind davon **nicht** blockiert — beide
lassen die Suche lokal.

---

## 11. Was mitläuft

- Tests ehrlich benennen: gemessen wird die Zahl der `discoverTokens`-Aufrufe (Aufrufstelle),
  nicht HTTP-Anfragen; die Stückelung deckt `write.test.ts` ab. „Suche/Namenssortierung
  unverändert lokal" ist mit gemocktem `aggregate` nur als **Struktur-Test** der Pipeline
  prüfbar (`$match` auf `metadata.name`, `$sort` auf `sortName`), nicht als Verhalten.
  `[Fakt, Advisor, entlastend]` Vorlage und Infrastruktur sind da (`collections/route.test.ts`);
  ein Umbau der Route ist **nicht** nötig. Zusätzlicher Mockaufwand: `dev-services-auto-start`,
  `filterOptionsCache` (`includeFilters=false` oder `vi.resetModules`), `shared-cache`,
  `isCollectionWhitelisted`.
- Kommentar zum Fehlerpfad: `PlatformResponseError` (auch ein Formfehler aus `parseOrThrow`) ist
  `allowLocalFallback: false`, wird hier aber **nicht** geworfen — konsistent mit A9, begründet
  im Code, Protokollstufe `error` bleibt.
- Bis zu zehn Minuten Verzögerung, bis ein pausiertes Token wieder überlagert wird: im
  Dateikopf nennen.

---

## 12. Neue Annahmen und offene Fragen

| Nr. | Aussage | Wo geführt |
|---|---|---|
| 1 | Ein Bündelaufruf zählt im Fensterlimit als **einer** | A10, Smoke-Lauf (`assumption-ledger.md`) |
| 2 | Produktion hat `REDIS_URL`; Zahl der Instanzen | vor dem Umschalten |
| 3 | Ein CDN steht vor der Route (oder nicht) | vor dem Umschalten |
| 4 | 30 s Überlagerungs-Cache sind für die Anzeige unkritisch | A11b-Test, Beobachtung |
| 5 | `ready` ist bei laufender Medienverarbeitung möglich | feldweiser Rückfall macht es unschädlich |
| 6 | Die Plattform akzeptiert doppelte Identitäten im Batch | durch Deduplizierung umgangen |
| 7 | `LENIENT`-Limit der Route ist durch User-Agent-Wechsel umgehbar | eigener Ledger-Eintrag, nicht A11 |

---

## 13. Abhängigkeiten und Reihenfolge

- A11a hängt an E5 (entschieden, `cea0ea4`) und der Entscheidung der Punkte oben; **nicht** an
  E6-Rest.
- A11b hängt an A11a.
- Danach: kurzer zweiter Advisor-Pass gegen die Verträge (nur geänderte Stellen), Reviewer-Pass
  nach dem Bau (`code-reviewer`).
- Die Verträge ersetzen `state/tasks/a11-marketplace-items-plattform-lesen.md`; diese Datei
  bleibt als Stand von v1 stehen und bekommt einen Verweis auf v2.
