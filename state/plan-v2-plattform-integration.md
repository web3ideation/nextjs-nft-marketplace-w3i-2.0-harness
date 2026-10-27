<!-- Ziel-Pfad im Repo: state/plan-v2-plattform-integration.md -->
# Plan v2 — Anbindung der NFT Data Platform (Gruppen A und B)

Stand: 13.10.2026 · Ergebnis des Advisor-Passes vom 13.10.2026.
**Vorgänger:** `state/plan-v1-plattform-integration.md` (eingefroren, nicht mehr ändern).
**Befunde:** `state/advisor-findings-plattform-integration.md` (Urteil: *Nicht freigegeben*, 20 Befunde,
Nachtrag des Auftraggebers mit einem Widerspruch).
**Gegenstück:** `state/plan-v1-abbau-altpfade.md` — berührt von Befund 9, siehe E6.

Evidenz-Marker: `[Fakt]` belegt · `[Schlussfolgerung]` abgeleitet · `[Annahme]` ungeprüft ·
`[offene Frage]` ungeklärt.

> **Was v2 gegenüber v1 ändert.** Alle 20 Befunde sind übernommen (Befund 2a mit korrigierter
> Fundstellenliste, siehe Nachtrag der Findings-Datei). Die vier substanziellen Änderungen:
> ein Paket kam hinzu (A11, `/api/marketplace/items`), zwei Pakete wurden geteilt (A4 → A4a/b/c,
> A7 → A7a/b/c), A8 wurde auf einen Vertrag reduziert und **vor** A5 gezogen, und fünf neue
> Entscheidungen (E4–E8) sind als offen markiert, statt sie im Zuschnitt vorwegzunehmen.
> `[Schlussfolgerung]` Der Zielumfang ist unverändert; was sich geändert hat, ist der Schnitt.

---

## 1. Ergebnis des Passes und Stand der Umsetzung

Das Urteil des Advisors lautet `NICHT_FREIGEGEBEN` — ausdrücklich über den **Plantext** von v1, nicht
über die Richtung und nicht über den gebauten A1-Code. Fünf Stellen hätten einen Baudurchgang nach v1
ins Falsche laufen lassen: ein fehlendes Paket (Befund 9), zwei zu große Pakete (Befunde 2, 8), ein
nicht erfasster Hauptlesepfad (Befund 5), ein Flag an einem Ort, der es nicht tragen kann (Befund 4).

Dieser Plan heilt alle fünf. Ein zweiter Pass ist nicht vorgesehen. Von den fünf neuen
Entscheidungen sind **E4, E5, E6 und E7 am 13.10.2026 getroffen** (Abschnitt 6); offen bleibt E8,
das nur A7c blockiert, sowie E1 (fällig vor A6) und E2 (fällig vor Tor T1).

| Paket | Stand (15.10.2026) |
|---|---|
| A0 Vorbedingungen | teilweise erfüllt; Prüfstand entschieden (E5), Zugangsdaten und Allowlist offen |
| A1 Transport und Signierung | **gebaut und committet** (`4bcdd68`). V11 offen (E3) |
| A2 Konfiguration, Flag, Startprüfung | **gebaut und committet** (`77d072d`) |
| A8 Zustandsmodell, Fehlerübersetzung | **gebaut und committet** (`2d4bb01`) |
| Korrekturrunde nach Code-Review | **committet** (`ca8c588`) — vier kritische Befunde an der Nahtstelle von asynchroner Reihenfolge und Fehlerweitergabe |
| A3a Cursor, DTO-Basis, Token/Collection | **nächstes Paket** |
| alle übrigen | offen, Zuschnitt in diesem Plan |

`[Fakt]` Der Code der drei gebauten Pakete ist am 15.10.2026 durch `code-reviewer` geprüft worden
(Urteil: freigegeben mit Hinweisen, vier kritische Befunde mit Vorbedingung). Die vier sind behoben,
fünf weitere aus der Liste „darf mitlaufen" gleich mit. Offen geblieben sind Befunde 8, 10, 11 und
14 des Reviews sowie die beiden `.env`-Templates — geführt in `state/assumption-ledger.md`.

---

## 2. Zielbild in einem Satz

Unverändert gegenüber v1: Alle NFT-Daten (Token, Collection, Ownership, Suche, Wallet-Inventar)
kommen über eine server-only Client-Schicht aus der NFT Data Platform; TheGraph bleibt alleinige
Listing-Quelle; die lokale MongoDB behält Stats, Interaktionen, Insights — und bis auf Weiteres den
Rückfallweg `nft_metadata` (V32).

`[Schlussfolgerung]` Befund 9 zeigt, dass v1 dieses Zielbild selbst nicht einlöste: die
meistbesuchte Ansicht hätte ihre Metadaten nach A1–A10 weiter aus `nft_metadata` bezogen. **A11
schließt die Lücke** (E6, entschieden 13.10.2026); das Zielbild bleibt damit so stehen, wie es hier
steht.

---

## 3. Vorbedingungen (Paket A0, kein Code)

| Was | Bei | Blockiert |
|---|---|---|
| Zugangsdaten `alpha-read` und `alpha-ops` je Umgebung | Niklas | A10, Smoke-Lauf |
| Ausgehende IPs der Alpha für die IP-Allowlist melden | Wolfgang | Smoke-Lauf |
| Lokale Plattform-Instanz lauffähig | Wolfgang | Smoke-Lauf, Integrationsläufe |
| ~~Prüfstand-Commit festlegen (V37)~~ → E5 | — | **entschieden 13.10.2026: `5dda8c7`** |
| Referenzimplementierung der Signierung | — | **erfüllt**, siehe v1 Abschnitt 3 |
| **Worker läuft in der Alpha garantiert (V62)** | Wolfgang | Entscheidung zu P9 in A4b/A4c |

**Neu gegenüber v1, Befund 1:** Die Blockadeliste des Prüfstands umfasst jetzt **A4** und enthält
zusätzlich eine Leseaufgabe. `[Fakt]` Der gebaute A1 hat vier Dinge aus Plattform-Commit `5dda8c7`
übernommen, nicht nur die Signierungsregel: die Form der Fehlerantwort (`{ ok, error, message }`, Code
im Feld `error`), die vollständige Codeliste, die Platzierung der `x-ratelimit-*`-Header nur an
authentifizierten Antworten samt fehlendem `Retry-After`, und den Replay-Schlüssel
`clientId + signature + canonicalPayload`. `[Schlussfolgerung]` Fällt die Festlegung auf `7915b52`,
sind Fehlertaxonomie und Rate-Limit-Mechanik von A1 mitbetroffen — also V34 und das Fehlerverhalten,
auf dem alle späteren Routen ihre Zustände aufbauen. `[Fakt]` E5 ist am 13.10.2026 auf genau diesen
Stand `5dda8c7` gefallen; die Nachlese entfällt damit, und A1 steht auf dem gültigen Prüfstand.
Die Abweichung zur Spec, die weiter `7915b52` pinnt, ist dort nachzutragen.

**Neu, Befund 16:** V62 ist Vorbedingung, nicht Nebensache. `[Fakt]` Die Empfehlung zu P9 koppelt die
Registrierung an den Worker und verwirft sich selbst, „wenn der Worker in der Zielumgebung nicht
garantiert läuft". Genau das ist V62 (Gruppe C). v1 führte diese Abhängigkeit nicht.

---

## 4. Paketschnitt

Jedes Paket = ein Handoff-Vertrag unter `state/tasks/` = ein Baudurchgang plus höchstens eine
Korrekturrunde, mit eigenständig prüfbarem Artefakt. Paket-IDs aus v1 bleiben stabil; geteilte Pakete
bekommen Buchstaben, neue Pakete die nächste freie Nummer.

### A1 — Transport und Signierung · `gebaut und committet`
**Deckt:** V10, V11 (nur Mechanik), V15, V16 (zweite Hälfte durch A2 nachgeholt), V34
**Liegt in:** `src/lib/nft-data-platform/`, `scripts/dev/platform-smoke.ts`, Vertrag
`state/tasks/a1-transport-signierung.md`

**Korrektur der Abdeckung, Befund 18.** `[Fakt]` V16 verlangt zwei Dinge: synchrone Systemuhr **und**
„ein Monitoring-Alarm auf Uhrdrift existiert". A1 erkennt `stale_timestamp` und wiederholt es nicht;
einen Alarm gibt es nicht. `[Schlussfolgerung]` V16 ist zur Hälfte offen. Der fehlende Teil ist klein
(Auswertung auf `PlatformAuthError` mit `platformCode === 'stale_timestamp'` auf Warnstufe) und wird
A2 zugeordnet, weil A2 ohnehin die Betriebsvariablen anfasst. `[Fakt]` **Erledigt mit A2**
(`77d072d`): `stale_timestamp` erzeugt `logger.error` mit dem eigenen Ereignisnamen
`nft_data_platform_clock_drift`. Die Ledger-Zeile vom 13.10.2026 ist damit aufgelöst. `[Fakt]` Der
Code-Review fand an derselben Stelle eine Fehlalarm-Quelle: lief die Timeout-Uhr schon während der
Wartezeit im Deckel, konnte der Zeitstempel ablaufen und den Alarm auslösen, obwohl die Uhr stimmt.
Behoben in `ca8c588`.

**Nachzutragende Lücke, Befund 7.** `[Fakt]` Budget und Nebenläufigkeitsdeckel liegen im Prozess; das
Fensterlimit gilt je Client über alle Instanzen. `[Fakt]` Web und Worker sind zwei Prozesse mit
demselben `read`-Datensatz, und der Worker wird ab A4b Plattform-Aufrufer. `[Schlussfolgerung]` Ab
A4b erlauben sich zwei Prozesse je acht gleichzeitige Anfragen, also sechzehn. Das ist kein
Mehrinstanz-Sonderfall, sondern Normalbetrieb. Gegenmittel ist **nicht** ein gemeinsamer Zähler vor
dem Umschalten, sondern Messbarkeit: die **eigene** Zahl gesendeter Anfragen im laufenden Fenster
mitprotokollieren, neben `remaining`. Ohne diese Gegenzahl ist ein zu schnell fallendes Restbudget
nicht von „ein anderer Aufrufer ist laut" zu unterscheiden, und V34 ist nach dem Umschalten nicht
auswertbar. Eine Zeile, zugeordnet an A2. Im Ledger geführt.

### A2 — Konfiguration, Flag, Startprüfung
**Deckt:** V14, V64, zweite Hälfte von V16, Messzeile aus Befund 7
**Hängt an:** E4 — `[Fakt]` **entschieden 13.10.2026**, serverseitig in
`src/lib/nft-data-platform/config.ts`. Der Vertrag ist damit schreibbar:
`state/tasks/a2-konfiguration-flag-startpruefung.md`.

**Inhalt:** Flag für die Plattform-Nutzung; die sieben Pflichtvariablen aus A1
(`NFT_API_BASE_URL`, `NFT_API_READ_CLIENT_ID|KEY|SECRET`, `NFT_API_OPS_CLIENT_ID|KEY|SECRET`) und die
**sechs optionalen** (`NFT_API_TIMEOUT_MS`, `NFT_API_MAX_ATTEMPTS`,
`NFT_API_READ_LIMIT_PER_MINUTE|_CONCURRENCY`, `NFT_API_OPS_LIMIT_PER_MINUTE|_CONCURRENCY`) in
Templates und `docs/environment/ENV_VARIABLES.md`; V64 (`REDIS_SSE_CHANNEL`) mit; Uhrdrift-Warnung;
eigene Fensterzählung im Protokoll.

**Korrektur gegenüber v1, Befund 15:** dreizehn Namen, nicht sieben. v1 nannte nur die
Zugangsdaten — die vier Stellwerte und die zwei Deckel sind beim Bau von A1 dazugekommen,
ausdrücklich damit die Messung aus V34 sie ohne Codeänderung korrigieren kann.

**Korrektur gegenüber v1, Befund 14 — die Startprüfung prüft am falschen Ort.** `[Fakt]`
`scripts/check-env.js` liest die Werte aus einer **Datei** (`.env.local` bzw.
`.env.production.local`) und bricht ab, wenn die Datei fehlt; `process.env` wird für die geprüften
Variablen nirgends gelesen. `[Fakt]` Im Zielbetrieb injiziert der Hoster die Variablen in den
Prozess, eine solche Datei existiert dort nicht. `[Schlussfolgerung]` `npm run env:check:prod`
scheitert in der Zielumgebung vor der ersten Prüfung — die Prüfung wirkt genau da nicht, wo V14 sie
verlangt. Dasselbe trifft V64, das „in jeder ausgerollten Umgebung explizit gesetzt" verlangt.
`[Fakt]` Zusätzlich ist `env:check` in keiner blockierenden Kette: `npm run check` enthält es nicht,
und `state/gates.md` hat keine Zeile dazu.

**Empfehlung zu E4:** Die Pflichtprüfung dort ansiedeln, wo die Konfiguration ohnehin validiert wird
— `src/lib/nft-data-platform/config.ts` wirft beim ersten Aufruf mit der vollständigen Liste
fehlender Namen — und `check-env.js` auf das beschränken, was es kann: eine Entwicklerhilfe gegen
vergessene lokale Variablen. Das Flag wohnt dann serverseitig neben den Variablen, die es bedingt.
Begründung in E4.

**Prüfbar:** Flag an und Variable fehlt → der erste Plattform-Aufruf scheitert mit einer Meldung, die
alle fehlenden Namen nennt (bereits so gebaut, `config.ts`); Flag aus → kein Plattform-Aufruf und
keine Pflichtvariable; `npm run check` Exit 0; neue Zeile in `state/gates.md` (Artefakt A-3).

### A3 — Normalisierung, DTOs, Cursor · **geteilt in A3a und A3b, 15.10.2026**

**Warum geteilt.** `[Fakt]` A3 umfasste zehn typisierte Endpunkt-Methoden
(`getTokenDetail`, `getTokenOwners`, `getWalletInventory`, `listCollections`,
`getCollectionDetail`, `searchEntities`, `discoverTokens`, `discoverWalletHoldings`,
`queueTokenRefresh`, `queueCollectionRefresh`), ebenso viele zod-Schemata und den Pflichttest
„zweite Seite ≠ erste Seite". `[Schlussfolgerung]` Das ist kein Baudurchgang plus eine
Korrekturrunde. Es ist dieselbe Zuschnittfrage, die der Advisor bei A4 und A7 gefunden hat
(Befunde 2 und 8) — hier vorher gestellt statt hinterher. Zusätzlich sind die DTO-Formen das, worauf
**alle** späteren Routen aufsetzen: stimmt die Hälfte der Schemata nicht, ist die Korrekturrunde
eine zweite Bauphase.

**Gemeinsam für beide:** Cursor-Paginierung durchgängig, die Zeichenkette `page` kommt im Client
nicht vor, Filter einwertig mit Ausnahme `chainIds` am Wallet-Endpunkt, Freitextsuche nur über
`/api/v1/search?q=`. Prüfstand `5dda8c7` (E5).
**Testpfad:** `src/lib/nft-data-platform/*.test.ts` — `vitest.config.ts` erfasst nur `src/**`.

**Verschärfung, Befund 20:** v1 prüfte „Routencode kennt keine Rohfeldnamen" per Grep auf zwei
Namen. Zwei Namen sind eine Stichprobe. Neues Kriterium, gültig ab A3b: **der Grep auf
`requestPlatform(` außerhalb von `src/lib/nft-data-platform/` ist leer.** Dann kann kein
Routencode an Rohformen kommen, unabhängig von Feldnamen.

#### A3a — Cursor, DTO-Basis, Token und Collection
**Deckt:** V12, V13 (Leseteil) · **Hängt an:** E5
**Baut:** `src/lib/nft-data-platform/types.ts` (Basis plus Token-/Collection-Formen),
`cursor.ts`, die Methoden `getTokenDetail`, `getTokenOwners`, `listCollections`,
`getCollectionDetail`, `searchEntities`
**Warum dieser Schnitt:** genau das, was **A7a** und **A9** brauchen. Die Cursor-Grundlage liegt
hier, weil jede Liste sie braucht und sie nur einmal stimmen muss.
**Pflichttest:** zweite Seite enthält andere Elemente als die erste — die Plattform ignoriert
unbekannte Parameter still und antwortet `200` mit einer ungefilterten ersten Seite, ein Test auf
„Anfrage erfolgreich" belegt also nichts.

#### A3b — Wallet, Discover, Refresh
**Deckt:** V12, V13 (Schreib- und Inventarteil) · **Hängt an:** E5, A3a
**Baut:** `getWalletInventory`, `discoverTokens`, `discoverWalletHoldings`, `queueTokenRefresh`,
`queueCollectionRefresh` samt ihren Formen
**Warum getrennt:** das ist, was **A5**, **A6** und **A4b** brauchen, und es sind die Methoden mit
Nebenwirkung — Discover und Refresh lösen auf der Plattform Arbeit aus. Sie gehören hinter den
Whitelist-Filter aus A4a, nicht davor.
**Besonderheit:** `queueCollectionRefresh` läuft über den **Ops**-Zugangsdatensatz, alles andere
über Read (V15).

### A8 — Zustandsmodell und Fehlerübersetzung · **vorgezogen vor A5**
**Deckt:** V32 (Vertragsteil) · **ID bleibt A8**, die Position ändert sich
**Baut:** `src/lib/nft-data-platform/view-state.ts` — zwei Typen und eine Übersetzungsfunktion

**Warum vorgezogen, Befund 10.** v1 stellte A8 als Merge-Schicht ans Ende mit der Begründung, sie
brauche A7 als ersten Nutzer, sonst werde sie auf Vorrat entworfen. `[Fakt]` A5, A7 und A9 bauen
aber je einen eigenen Mapper auf die bestehenden Frontend-Verträge, und die Zusammenführung von
Listing, NFT-Daten und lokalen Stats existiert im Repo schon: `src/utils/nft/scrollItem.ts`
(`mapEnrichedNFTToScrollItem`, `mapWalletNFTToScrollItem`, `mapWalletNFTToFilterableItem`) — eine
Datei, die v1 nicht nennt. `[Schlussfolgerung]` Ein `composeMarketplaceCard()` wäre eine **dritte**
Abbildungsschicht für denselben Zweck: Routen-Mapper → Composer → `scrollItem`-Mapper. Was wirklich
fehlt, ist kein View-Composer, sondern ein Vertrag: welche Zustände es gibt und welcher
Plattform-Fehler zu welcher Antwort führt. Das ist zwei Typen und eine Funktion, gegen die sieben
Fehlerklassen aus A1 unit-prüfbar — kein Vorratsbau, und Voraussetzung jeder Routen-DoD.

**Zustände, vollständig:** Listing ohne Token · Holding ohne Token · Token ohne Collection ·
`TOKEN_NOT_INDEXED` mit `refreshQueued` · `PLATFORM_UNAVAILABLE` · Rückfall aus lokaler Quelle,
als möglicherweise veraltet gekennzeichnet.

**Fehlerübersetzung — die Tabelle, die v1 fehlte (Befund 11).** `[Fakt]` A1 liefert sieben
Fehlerklassen, v1 nannte Zustände für drei. `[Schlussfolgerung]` Vier wären als unbehandelte
Ausnahme in `apiHandler` gelandet, also als HTTP 500 `INTERNAL_ERROR` — und V32 („statt eines
generischen Fehlers") hätte für vier von sieben Fällen keine Deckung. Verbindlich ab hier:

| `PlatformError` aus A1 | Antwort unserer Route | `code` | Anzeige | Protokoll |
|---|---|---|---|---|
| `PlatformUnavailableError` | 503 | `PLATFORM_UNAVAILABLE` | degradierter Pfad, als veraltet gekennzeichnet | `warn` |
| `PlatformTimeoutError` | 503 | `PLATFORM_UNAVAILABLE` | wie oben — für den Nutzer ist ein Timeout ein Ausfall | `warn` |
| `PlatformRateLimitError` | 503 | `PLATFORM_UNAVAILABLE` | wie oben; **nie** 429 weitergeben — erschöpft ist unser Budget, nicht das des Nutzers | `error` |
| `PlatformAuthError` | 503 | `PLATFORM_UNAVAILABLE` | wie oben | `error` — Betriebsfehler; bei `stale_timestamp` zusätzlich Uhrdrift-Alarm (V16) |
| `PlatformConfigError` | 503 | `PLATFORM_UNAVAILABLE` | wie oben | `error` — Flag an, Variable fehlt |
| `PlatformReplayError` nach allen Versuchen | 500 | `INTERNAL_ERROR` | generische Fehlerseite | `error` — das ist ein Fehler bei **uns**, keine Störung der Plattform |
| `PlatformResponseError` | 502 | `PLATFORM_RESPONSE_INVALID` | Fehlerseite, **kein** Rückfall — wir wissen nicht, was wir bekommen haben | `error` |
| Plattform antwortet `404` (kein Fehler der Klasse) | 404 | `TOKEN_NOT_INDEXED` | „wird indiziert", mit `refreshQueued` | `debug` |

`[Schlussfolgerung]` Fünf der sieben Klassen führen auf dieselbe Nutzeraussage und unterscheiden sich
nur im Protokoll. Das ist Absicht: der Nutzer soll nicht lernen, welche unserer Zugangsdaten gerade
abgelaufen sind, der Betrieb soll es sofort sehen.

**Prüfbar:** Unit-Tests über alle sieben Klassen plus den 404-Fall; danach berührt keine Route die
Fehlerklassen direkt, sondern nur diese Funktion (Grep).

### A4a — Serverseitige Whitelist-Quelle und Filter
**Deckt:** V33 (Filterteil) · **Hängt an:** E5
**Warum zuerst, unverändert aus v1:** `[Fakt]` Schon ein Token-Refresh registriert die Collection
des Tokens auf der Plattform. `[Schlussfolgerung]` Ohne Filter ist eine fremde Collection einen
Seitenaufruf weit davon entfernt, auf Niklas' Kosten indiziert zu werden. Der Advisor hat diese
Reihenfolge-Auflage ausdrücklich bestätigt.

**Was v1 übersah, Befund 2(a).** `[Fakt]` Eine serverseitige Lesung der Diamond-Whitelist existiert
nicht. `getWhitelistedCollections` erscheint in vier Client-Dateien plus der ABI-Definition:
`src/hooks/marketplace/useMarketplaceData.ts`, `src/app/admin/marketplace/page.tsx`,
`src/app/admin/components/multisig/MarketplaceGovernanceSidebar.tsx`,
`src/app/admin/components/multisig/TransactionBuilder.tsx`, ABI in
`src/config/abis/getter-facet.ts`. Alle vier sind wagmi-Reads im Browser.
`[Fakt]` Serverseitige Chain-Lesungen sind im Repo üblich (`src/lib/blockchain/wallet-nfts.ts`,
`src/app/api/marketplace/facets/route.ts`) — nur nicht für die Whitelist.
`[Schlussfolgerung]` A4a ist nicht „filtern", sondern zuerst „Lesequelle bauen": serverseitige
Lesung plus Zwischenspeicher. Ohne Zwischenspeicher liegt vor jedem Discover-, Refresh- und
Detail-Aufruf eine RPC-Lesung — das verlagert die Kosten nur von Niklas' RPC auf unseren. Mit
Zwischenspeicher braucht es eine Invalidierungsregel, und die hängt an den Ereignissen aus A4c.
Bis A4c steht, gilt eine TTL als Invalidierung; das ist zu dokumentieren, nicht zu verschweigen.

**Prüfbar — und das ist neu (Befund 3).** `[Fakt]` v1 wollte A4 daran prüfen, dass ein Aufruf von
`/api/nft/detail` mit fremder Adresse keinen `refresh:token` erzeugt. `[Fakt]` Zum Zeitpunkt von A4
ruft diese Route überhaupt keinen Plattform-Endpunkt — die Plattform-Aufrufe entstehen erst in A7.
`[Schlussfolgerung]` Das Kriterium wäre trivial erfüllt, auch wenn A4 nichts gebaut hätte: ein
Abnahmekriterium, das nicht rot werden kann, belegt nichts. Genau die Fehlerform, die v1 für die
still ignorierten Plattform-Parameter selbst beschreibt. **Neues Kriterium:** die Filterfunktion
gibt für eine Adresse außerhalb einer eingespeisten Whitelist `false` zurück, und der
Discover-/Refresh-Aufrufpfad ruft `requestPlatform` nachweislich nicht auf — prüfbar über die
einspeisbaren `deps` aus `src/lib/nft-data-platform/client.ts`. Das V33-Kriterium bleibt zusätzlich
und wandert in die DoD von A7a.

### A4b — Push-Kopplung an die bestehenden Ereignisse
**Deckt:** V30 · **Hängt an:** E5, Entscheidung zu P9 (V62)
**Inhalt:** Neues Listing aus TheGraph → genau ein `POST /api/v1/tokens/discover`; Kauf,
Stornierung, Transfer → `POST /api/v1/refresh/token`. Jeder Aufruf durch den Filter aus A4a.
`[Fakt]` Die sechs Ereignisse, an die gekoppelt wird, abonniert `src/services/nft-sync/index.ts`
bereits. Das ist der Teil der P9-Empfehlung, der ohne Umbau des Ereignis-Modells funktioniert.
**Prüfbar:** nach einem Listing-Ereignis steht genau ein Discover mit dieser Token-Identität im
Aufrufprotokoll; eine fremde Collection erzeugt keinen Aufruf.

### A4c — Whitelist-Ereignisse, Registrierung, Admin-Zustand
**Deckt:** V63 · **Hängt an:** E5, Entscheidung zu P9 (V62), Schema-Entscheidung (siehe unten)
**Inhalt:** `CollectionAddedToWhitelist` → genau ein `POST /api/v1/refresh/collection` (Ops-Client);
`CollectionRemovedFromWhitelist` → Eintrag „Abmeldung an Plattform ausstehend" in der Admin-Ansicht,
bis ein Admin ihn als gemeldet markiert. Plus Admin-Knopf als Nachzieh-Weg.

**Warum eigenes Paket, Befund 2(b) und 2(c).** `[Fakt]` Der bestehende Event-Pfad kann diese
Ereignisse nicht hören: `src/services/marketplace/event-listener.ts` beobachtet
`MARKETPLACE_EVENT_ABI = [...IDEATION_MARKET_FACET_ABI, ...BUYER_WHITELIST_FACET_ABI]` — die
`CollectionWhitelistFacet`-ABI fehlt; dazu kommen eine harte `supportedEvents`-Liste, eine feste
Callback-Registratur und eine getypte Ereignis-Union. `[Fakt]` Die beiden Ereignisse existieren im
Repo nur als ABI-Einträge in `src/config/abis/collection-whitelist-facet.ts`.
`[Schlussfolgerung]` Das sind fünf Stellen in drei Dateien plus die Typunion — eine Erweiterung des
Ereignis-Modells an genau dem Pfad, an dem die Live-Aktualisierung der Listings hängt. Eigener
Baudurchgang, eigenes Risiko.
`[Fakt]` Für den Admin-Zustand gibt es keinen Speicherort: keine der dreizehn vorhandenen
Collections trägt Registrierungs- oder Abmeldezustände. `[Schlussfolgerung]` A4c enthält eine
**Schema-Entscheidung** (neue Collection oder Feld in `admin_config`) samt Index in
`src/lib/db/setup-indexes.ts` und Nachtrag in `docs/database/`. Eine Schema-Änderung rutscht nicht
stillschweigend in ein Paket; sie gehört vor den Vertrag entschieden.

**Zusätzlich aus dem Nachtrag der Findings:** zwei weitere Oberflächen zeigen die Whitelist
(`MarketplaceGovernanceSidebar`, `TransactionBuilder`). Ob sie den neuen Zustand mit anzeigen
müssen, gehört in den „Ist-Zustand lesen"-Schritt von A4c.

### A5 — Wallet-Lesepfad
**Deckt:** V1, V2, V3, V6, V27 · **Hängt an:** E5, E7
**Berührt:** `src/app/api/wallet/nfts/route.ts`, `src/app/api/user/nfts/route.ts` (siehe E7),
`src/lib/nft-data-platform/mappers/wallet.ts` (neu),
`src/contexts/wallet-nfts/WalletNFTsService.ts`

**Was v1 übersah, Befund 5.** `[Fakt]` Der Hauptlesepfad der Wallet-Ansicht ist nicht
`/api/wallet/nfts`. `src/contexts/wallet-nfts/WalletNFTsService.ts` ruft zuerst
`fetchWalletNFTsFromDb`, das `/api/user/nfts?walletAddress=…` lädt; liefert die Datenbank Treffer,
endet der Vorgang dort. `[Fakt]` `/api/user/nfts` liest ausschließlich `nft_metadata` und bezeichnet
sich selbst als „Fast endpoint - no external API calls, reads from MongoDB only". `[Fakt]`
`/api/wallet/nfts` wird nur in drei Nebenfällen gerufen: Rückfall bei leerer Datenbank,
Lückenprüfung alle 180 Sekunden, Hintergrund-Persistenz. `[Schlussfolgerung]` A5 nach v1 hätte den
Nebenweg migriert: V1 wäre erfüllbar, V2/V3 als **sichtbares** Verhalten nicht. Dazu entstünde eine
Mischquelle — Rückfallpfad aus der Plattform, Hauptpfad lokal, zusammengeführt in
`mergeDbSnapshotWithDiscoveredIdentifiers` — ohne Regel, welche Quelle bei Widerspruch gewinnt. → E7.

**Neu in der Abdeckung, Befund 16:** **V1** gehört in die DoD. `[Fakt]` V1 ist das eigentliche
Abnahmekriterium: „Ist das Flag an, beantwortet `/api/wallet/nfts` eine Anfrage ohne einen einzigen
ausgehenden Aufruf an Alchemy oder Moralis." `[Schlussfolgerung]` Ohne V1 in der DoD ist A5
abnehmbar, während der Alchemy-Zweig in derselben Route weiterläuft — er fällt erst in R2 des
Abbauplans. **V27** ebenso: Integrationstest je migrierter Route, Vertragstest je Mapper.

**Aus v1 übernommen und vom Advisor bestätigt:** Der Cache-Schlüssel enthält `source` und
`skipPersist` (`buildWalletCacheKey`), und der darüberliegende Cache liegt in Redis — überlebt also
einen Neustart. Wird `source` bedeutungslos, muss der Schlüssel mit, sonst liefern alte Schlüssel
weiter alte Antworten.

### A6 — `/api/user/nfts/sync`
**Deckt:** Entscheidung 13, V27 · **Hängt an:** E5, **E1**
**Inhalt:** Aus der Metadaten-Pipeline wird Orchestrierung: bekannte Token-Identitäten sammeln,
`POST /api/v1/owners/wallets/discover` (1–500 je Aufruf), Antwort unterscheidet `discover queued` /
`already indexed` / `upstream unavailable`.

**Warum E1 vorher fällig ist, Befund 12.** `[Fakt]` Diese Route ist heute ein Schreiber von
`nft_metadata` (`upsertNFTMetadata`, `updateNFTOwnership`) und wird vom Wallet-Pfad regelmäßig
angestoßen. `[Fakt]` `/api/user/nfts` und `/api/marketplace/items` lesen `nft_metadata`.
`[Schlussfolgerung]` Mit A6 versiegt eine der Hauptschreibrichtungen auf den Rückfallweg — in
Gruppe A, lange vor Tor T2 des Abbauplans und vor der E1-Entscheidung, die genau diese Frage regeln
soll. v1 behandelte das Altern des Rückfallwegs ausschließlich als Folge des Abbaus. Tatsächlich
beginnt es, sobald das Flag an ist. **Kleinere Variante:** A6 behält bis zur E1-Entscheidung einen
schmalen Schreibpfad (Identitäten und Eigentum, ohne Metadaten) — dokumentiert, nicht stillschweigend.

### A7a — Detailseite: Token, Collection, Medien
**Deckt:** V4, V6, V31, V27, V33 (Prüfkriterium aus A4a) · **Hängt an:** E5, A8, A4a
**Inhalt:** Token aus der Plattform statt aus `nft_metadata`; Ownership über den
Ownership-Endpunkt; Collection aus der Collection-Antwort; Medien ausschließlich als CDN-URLs aus
dem `media`-Block (`cdnUrlOriginal`, `cdnUrlOptimized`, `cdnUrlThumbnail`) — weder Routencode noch
Browser ruft `/api/media` der Plattform. **Der Chain-Block bleibt unverändert:** die Route ruft
`blockchainStateSync` weiter, nur nicht mehr als Metadatenquelle. Begründung in A7c und E8.

### A7b — 404-Vertrag, Fehlerplumbing, Aufrufer
**Deckt:** V5 · **Hängt an:** A7a, A8
**Inhalt:** Nicht indiziert → HTTP 404 mit `code: "TOKEN_NOT_INDEXED"`, `refreshQueued`,
`refreshJobId`, `contractAddress`, `tokenId`, `chainId`; außerhalb der Whitelist ist `refreshQueued`
immer `false`.

**Warum eigenes Paket, Befund 8(c) und 8(d).** `[Fakt]` `NotFoundError` nimmt nur eine Nachricht,
kein `details`; `src/lib/api/handler.ts:169` ruft
`createErrorResponse(error.message, error.statusCode, error.code)` und übergibt den vierten
Parameter `metadata` nicht — `details` aus `ApiError` fällt weg. `[Schlussfolgerung]` Die V5-Felder
erreichen den Browser auf dem vorgesehenen Weg („throw einen typisierten Fehler") **nicht**. Entweder
wird `src/lib/api/{errors,handler,responses}.ts` erweitert — eine Datei, die alle Routen teilen und
die in v1 bei keinem Paket stand — oder die Route gibt eine eigene Antwort zurück, was gegen die
Konvention streift. Das ist eine Entscheidung über geteilten Code, kein Nebenschritt einer
Routen-Migration.
`[Fakt]` Dazu kommen vier Aufrufer, nicht einer: `useMarketplaceItemDetail.ts`, `CartContext.tsx`,
`CartPage.tsx`, `UnifiedListingForm.tsx`. `[Fakt]` Letzterer übersetzt HTTP 404 heute in „NFT nicht
gefunden. Bitte Contract-Adresse und Token-ID prüfen." `[Fakt]` Entscheidung 6 der Spec sagt das
Gegenteil: 404 heißt „noch nicht indiziert", nicht „existiert nicht". `[Schlussfolgerung]` Ohne
diesen Aufrufer mitzuändern sagt die Oberfläche einem Verkäufer, sein eigenes NFT existiere nicht.

### A7c — Chain- und Approval-Block
**Deckt:** Berührt V39/V40 · **Hängt an:** E8
**Inhalt:** Entscheidung und Umsetzung dazu, woher `approvalStatus` künftig kommt.

**Warum das nicht in A7a gehört, Befund 8(a) und 8(b).** `[Fakt]` Die heutige Route liefert aus dem
Chain-Block einen eigenen Abschnitt `approvalStatus` (`hasTokenApproval`, `hasOperatorApproval`,
`isApprovedForMarketplace`), gefüllt aus `blockchainStateSync`. `[Fakt]` Verbraucher sind
`useMarketplaceItemDetail.ts`, die Sell-Strecke (`UnifiedListingForm.tsx` liest `blockchain.owner`
als Eigentümer) und die Warnung „No marketplace approval" in `InvalidListingWarning.tsx`. `[Fakt]`
Das Migrationsdokument zieht die Konsequenz offen: „otherwise leave conservative nulls".
`[Schlussfolgerung]` A7 nach v1 hätte dem Kaufschutz- und Verkaufspfad die Datengrundlage entzogen —
während V39/V40 gerade eine Verstärkung dieser Prüfung fordern.
`[Fakt]` Schlimmer: `useMarketplaceItemDetail.ts:202` prüft `blockchain.isApprovedForAll === false`
und holt die Detailseite dann mit `refresh=true` erneut. `[Schlussfolgerung]` Mit „conservative
nulls" ist diese Bedingung für jedes gelistete ERC1155 dauerhaft wahr: zwei Detailabfragen je
Seitenaufruf, also sechs Plattform-Aufrufe statt drei, und der `refresh=true`-Pfad erzwingt die
teuerste Variante. Ein belegter Fehlerpfad, keine Befürchtung.

### A9 — `/api/collections` und Suche
**Deckt:** V7, V27 · **Hängt an:** E5, E6 (Suche)
**Inhalt:** Welche Contracts angezeigt werden, kommt weiter aus aktiven Listings; Name, Symbol,
`preview`, `recentTokens`, `indexedTokenCount`, `holderCount` aus der Collection-Antwort statt aus
einer `nft_metadata`-Aggregation.

**Offener Punkt, Befund 17.** `[Fakt]` Die Freitextsuche liegt heute **nicht** in
`/api/collections`, sondern als `search`-Parameter an `/api/marketplace/items` und an
`/api/user/nfts`; `CollectionsService.ts` übergibt keinen Suchbegriff. `[Schlussfolgerung]` Die
Suche, die A9 migrieren will, hat in `/api/collections` keinen Aufrufer; die Suche, die Nutzer
benutzen, hängt an Routen, die v1 nicht anfasst. Entweder gehört sie zu A11, oder A9 benennt, welche
Suche gemeint ist. → E6.
**Ist-Zustand lesen:** die Rolle von `collection_stats` klären — die Collection existiert und kommt
im Plan nicht vor.

### A11 — `/api/marketplace/items` · **neu, Befund 9**
**Deckt:** das Zielbild aus Abschnitt 2 · **Hängt an:** E5, **E6**
**Berührt:** `src/app/api/marketplace/items/route.ts`, `src/hooks/marketplace/useMarketplaceItems.ts`,
`src/lib/init-services.ts` (Vorwärmung), `src/app/nft/[…]/components/CollectionItemsList.tsx`

`[Fakt]` Die Marktplatz-Übersicht lädt aus `/api/marketplace/items`; diese Route holt ihre Metadaten
per `$lookup` aus `nft_metadata` und ihre Stats aus `nft_stats`. `[Fakt]` In v1 kommt die Route in
keinem Paket vor. `[Schlussfolgerung]` Die meistbesuchte Ansicht hätte nach A1–A10 weiter aus
`nft_metadata` gelesen — das Zielbild wäre formal erreicht und faktisch nicht.

`[Fakt]` Der Abbauplan will genau diese Quelle entfernen (R3: „`$lookup nft_metadata` als
Metadatenquelle in `src/app/api/marketplace/items/route.ts`") und verbietet sich dabei jede
Verhaltensänderung („Ein Löschpaket führt keine Verhaltensänderung ein").
`[Schlussfolgerung]` Zwischen beiden Plänen steht damit ein Schritt, den keiner von beiden ausführen
darf. Das ist nicht aufschiebbar bis nach dem Umschalten. → E6.

**Wenn A11 gebaut wird, ist die offene Frage nicht das Mapping, sondern die Aufrufzahl:** eine
Übersicht mit zwanzig Karten darf nicht zwanzig Plattform-Aufrufe erzeugen. Die Spec behauptet, ein
bis zwei Aufrufe genügten; v1 übernahm das ungeprüft. Das ist im Vertrag zu belegen, bevor gebaut
wird.

### A10 — Abnahme und Umschalten
**Deckt:** V38, V22 · kein Code, Nachweisarbeit
Stufe 1 bei leerem Index: Signierung, 409-Test (Smoke-Lauf), 429-Verhalten, degradierter Pfad,
Registrierung. Stufe 2 nach Niklas' Backfill-Meldung: Wallet-Ansicht, Detailseite, Sell-Flow,
Kaufpfad. Erst danach Flag an in der Produktion.

**Neu, Befund 20:** Ablageort ist `state/abnahme-plattform-integration.md`. v1 verwies von zwei
Stellen auf A10, ohne eine Datei zu nennen — ein Nachweis ohne Ablageort ist in drei Wochen nicht
auffindbar.

**Neu, Befund 6 — das Performance-Budget (V22) gehört hierher und ist neu zu rechnen.** `[Fakt]` v1
rechnete: drei Plattform-Aufrufe je Detailseite, 600/min ⇒ rund 200 Detailaufrufe pro Minute. Fünf
Posten korrigieren das nach unten:

1. `[Fakt]` `/api/nft/detail` hat **vier** Aufrufer. In `CartPage.tsx` geschieht das in `items.map()`
   innerhalb eines `Promise.all` — ein Warenkorb mit zwanzig Positionen löst zwanzig Detailabfragen
   gleichzeitig aus, nach A7 also bis zu sechzig Plattform-Aufrufe aus **einer** Nutzeraktion.
2. `[Fakt]` Jeder Versuch ist eine Anfrage: `maxAttempts` ist 3, wiederholt wird bei 409, 429, 503,
   Timeout und Netzfehler. Das Fensterlimit zählt Versuche, nicht logische Aufrufe.
3. `[Schlussfolgerung]` Der Deckel liegt je Prozess, das Limit je Client — ab A4b zwei Prozesse.
4. `[Fakt]` Übersicht, Wallet, Suche und der Worker-Push teilen denselben 600er-Topf: `alpha-read`
   trägt `collections:read`, `tokens:read`, `owners:read`, `search:read` **und** `refresh:token`.
   v1 behandelte die Detailseite als Alleinnutzer.
5. `[Schlussfolgerung]` Die ERC1155-Schleife aus A7c verdoppelt Detailaufrufe genau dann, wenn der
   Chain-Block wegfällt.

`[Schlussfolgerung]` Ein tragfähiges Budget zählt Plattform-Aufrufe **je Anfragepfad** — Übersicht,
Detail, Cart-Anreicherung, Wallet, Suche, Sell-Suche, Worker-Push — und setzt sie gegen 600/min. V22
verlangt ohnehin ein Budget je Route. `npm run bench:api` müsste dafür nicht Latenz, sondern
Aufrufzahl messen.

---

## 5. Abhängigkeiten

```
A1 ✔ ──► A2 ✔ ──► A8 ✔ ──► A3a ──┬──► A4a ──┬──► A3b ──► A4b
                                  │          └──► A4c (Schema)
                                  │
                                  ├──► A7a ──► A7b ──► A7c (E8)
                                  ├──► A9 (E6)
                                  └──► A11 (E6)

A3b ──► A5 (E7) ──► A6 (E1)

A5, A6, A7a-c, A9, A11 ──► A10 ──► Flag an ──► Abbauplan R2/R3
```

Stand 15.10.2026: A1, A2 und A8 sind gebaut und committet, dazu eine Korrekturrunde nach dem
Code-Review (`ca8c588`). Nächstes Paket ist A3a.

Änderungen gegenüber v1: A8 ist von hinten nach vorn gewandert und Voraussetzung für alle Routen;
A4 ist in drei Pakete zerfallen, von denen nur A4a Voraussetzung für die Routen ist; A11 ist neu;
A7 ist in drei Pakete zerfallen, die aufeinander folgen; A3 ist in A3a und A3b geteilt
(15.10.2026), wobei A3b hinter A4a liegt, weil Discover und Refresh Nebenwirkungen auf der
Plattform haben und nicht vor dem Whitelist-Filter laufen dürfen.

`[Schlussfolgerung]` A4a, A7a, A9 und A11 sind nach A3a parallelisierbar. A5 und A6 hängen
zusätzlich an A3b, A3b hängt an A4a. A4b und A4c dürfen nachrücken: ohne sie wird der Index träger,
aber keine fremde Collection gezogen — das verhindert A4a allein.

---

## 6. Offene Entscheidungen

E1, E2 und E3 stammen aus v1 Abschnitt 9. E3 ist entschieden und unverändert gültig. E1 und E2 sind
überarbeitet. E4 bis E8 sind neu aus dem Pass.

### E3 — Prüfweg der Integrationstests · `entschieden 25.09.2026, unverändert`
CI gegen Mock-Transport, Live-Lauf als Skript (`npm run platform:smoke`), Ergebnis in A10
protokolliert. Ein grünes `npm run check` belegt V11 nicht.

### E4 — Ort des Feature-Flags und der Startprüfung · `entschieden 13.10.2026`
**Entscheidung: serverseitig in `src/lib/nft-data-platform/config.ts`.** Das Flag wohnt neben den
Variablen, die es bedingt; die Pflichtprüfung liegt an derselben Stelle; `check-env.js` bleibt
Entwicklerhilfe gegen vergessene lokale Variablen und ist **nicht** der Nachweis für V14.
`app.config.ts` wird nicht angefasst. Begründung unten.
**Frage:** Wohnt das Flag serverseitig neben der Plattform-Konfiguration, oder in
`src/config/app.config.ts`?
`[Fakt]` `app.config.ts` ist ein `as const`-Objekt mit literalen Booleans, liest keine
Umgebungsvariable, wird über `src/config/index.ts` re-exportiert und von drei **Client**-Komponenten
gelesen (`SellPage.tsx`, `sell/listing/page.tsx`, `sell/check-listing/page.tsx`, alle mit
`'use client'`). `[Schlussfolgerung]` Ein aus `process.env` gelesenes Flag ist dort im Browser
`undefined`, also still `false` — genau dort, wo niemand hinsieht. Mit `NEXT_PUBLIC_`-Präfix
verstößt es gegen V14 und wird zur Buildzeit eingebacken. Zusätzlich macht `as const` aus `false`
einen Literaltyp, womit `if (FEATURES.X)` für TypeScript toter Code ist.
**Empfehlung:** serverseitig, in `src/lib/nft-data-platform/config.ts`, neben den Variablen, die es
bedingt; `isPlatformConfigured()` existiert dort schon für genau diesen Zweck. Die Pflichtprüfung
liegt an derselben Stelle, und `check-env.js` bleibt Entwicklerhilfe (Befund 14: es liest Dateien,
nicht die Prozessumgebung, und scheitert in der Zielumgebung vor der ersten Prüfung).
### E5 — Prüfstand-Commit (V37) · `entschieden 13.10.2026`
**Entscheidung: `5dda8c7`, der lokale Stand.** Damit ist der gebaute A1 gegen den gültigen
Prüfstand erhoben, und die vier Annahmen aus Abschnitt 3 brauchen keine Nachlese. Die
Ledger-Zeile vom 13.10.2026 zur zu engen Prüfstand-Grenze bleibt als historischer Stand stehen;
ihr Vorbehalt ist mit dieser Entscheidung erledigt, nicht widerlegt.
`[Schlussfolgerung]` Spec v4 pinnt weiter `7915b52`. Diese Abweichung ist in der Spec
nachzutragen, sonst zeigen Spec und Plan auf verschiedene Stände — eigener, kleiner Schritt.
**Frage:** `7915b52` (Spec v4) oder `5dda8c7` (lokaler Workspace)?
`[Fakt]` Der gebaute A1 ist gegen `5dda8c7` erhoben, und zwar in vier Punkten über die Signierung
hinaus (Abschnitt 3). `[offene Unsicherheit]` Welcher Stand der jüngere ist, ist hier nicht belegt.
`[Fakt]` Die Commit-Botschaft des lokalen Stands lautet „docs: document the indexing gate and the
collection off switch". `[Fakt]` Genau dieses Thema trägt Entscheidung 28 und V63 der Spec.
`[Schlussfolgerung]` Eine Festlegung auf `7915b52` könnte hinter die Dokumentation zurückfallen, auf
der zwei Spec-Entscheidungen beruhen. Die Richtung ist deshalb nicht beliebig.
### E6 — `/api/marketplace/items` und die Suche · `entschieden 13.10.2026`
**Entscheidung: A11 wird gebaut.** Die Übersicht bezieht ihre Metadaten künftig aus der
Plattform; die R3-Zeile des Abbauplans bleibt damit gültig und bekommt ihren Ersatz. Vor dem
A11-Vertrag ist zu belegen, dass eine Übersicht mit zwanzig Karten mit ein bis zwei
Plattform-Aufrufen auskommt — die Spec behauptet das, v1 übernahm es ungeprüft, und ohne Beleg
ist A11 der Ort, an dem das Fensterlimit zuerst reißt. Die Freitextsuche (Befund 17) gehört
damit zu A11, nicht zu A9.
**Frage:** Bekommt die Übersicht ein Migrationspaket (A11), oder bleibt `nft_metadata` dauerhaft
ihre Metadatenquelle?
`[Schlussfolgerung]` Bei „bleibt lokal" fällt A11, und die R3-Zeile des Abbauplans muss fallen —
sonst entfernt R3 eine Quelle ohne Ersatz. Dann ist das Zielbild in Abschnitt 2 enger zu formulieren.

### E7 — `/api/user/nfts` · `entschieden 13.10.2026`
**Entscheidung: in A5 mitmigrieren.** Damit ist der sichtbare Wallet-Pfad wirklich migriert und
V2/V3 gelten ohne Einschränkung. A5 wächst um eine Route, die heute reine MongoDB-Lesung ist;
eine Regel für die Mischquelle in `mergeDbSnapshotWithDiscoveredIdentifiers` wird dadurch
überflüssig, weil beide Pfade dieselbe Quelle haben.
**Frage:** Mitmigrieren, oder bewusst lokale Quelle bleiben?
`[Schlussfolgerung]` Bei „bleibt lokal" braucht es eine Regel, welche Quelle in
`mergeDbSnapshotWithDiscoveredIdentifiers` bei Widerspruch gewinnt, und V2/V3 gelten dann nur für
den Lückenpfad — was in der Spec nachzutragen wäre. Bei „mitmigrieren" wächst A5 um eine Route, die
heute reine MongoDB-Lesung ist.
**Entscheider:** Wolfgang.

### E8 — Chain- und Approval-Block der Detailseite · `offen, blockiert A7c, nicht A7a`
**Frage:** Bleibt `blockchainStateSync` als Quelle von `approvalStatus`, oder wandert die
Approval-Prüfung zu V39/V40 (Gruppe F)?
`[Schlussfolgerung]` Solange die Frage offen ist, behält A7a den Chain-Block unverändert. Das ist
die sichere Richtung: sie hält den Kaufschutz- und Verkaufspfad funktionsfähig und verhindert die
ERC1155-Verdopplungsschleife. Ein Abbau ohne Ersatz wäre die unsichere.
**Entscheider:** Wolfgang, zusammen mit dem Zuschnitt von Gruppe F.

### E1 — Befüllung des Rückfallwegs · `offen, fällig vor A6` *(war: vor T2)*
**Frage:** Bleibt `nft_metadata` nach dem Umschalten beschreibbar, oder friert es ein?
**Vorverlegt, Befund 12:** A6 entzieht dem Rückfallweg eine Hauptschreibrichtung, und zwar in
Gruppe A — nicht erst mit R3. Der Rückfallweg beginnt zu altern, sobald das Flag an ist.

Drei Wege, nicht zwei:

- **(a) Cache-Through.** Jeder erfolgreiche Plattform-Read schreibt die normalisierten Felder nach
  `nft_metadata`. Preis: neue Schreibrichtung im Datenmodell, ADR-pflichtig (Artefakt A-2).
- **(b) Einfrieren mit Alterungsgrenze.** Keine Schreibpfade mehr; überschreitet ein Dokument das
  gesetzte Alter, gilt `PLATFORM_UNAVAILABLE` statt Rückfall.
- **(c) stale-while-error, neu aus Befund 13.** `[Fakt]` `src/lib/redis/shared-cache.ts` wird
  bereits von `/api/wallet/nfts` und `/api/marketplace/items` genutzt, letztere mit versionierten
  Schlüsseln und TTL. `[Schlussfolgerung]` Jede erfolgreiche Plattform-Antwort landet dort; bei
  `PLATFORM_UNAVAILABLE` wird die letzte bekannte ausgeliefert und als veraltet gekennzeichnet.
  Erfüllt V32 wörtlich und zweckgemäß, hat in der TTL eine natürliche Alterungsgrenze, braucht
  **keine** Architekturentscheidung zum Datenmodell (A-2 entfällt) und nutzt einen vorhandenen
  Helfer. Grenze, ehrlich benannt: trägt nur, was kürzlich angesehen wurde, und überlebt kein
  Redis-Leeren — ein Puffer gegen Minuten und Stunden, nicht gegen Tage.

**Was allen drei Wegen fehlt, Befund 13.** `[Fakt]` `nft_metadata` enthält auch den Chain-Block
(`blockchain.owner`, `approved`, `isApprovedForAll`, `ownerBalance`), befüllt von
`blockchain-state-sync.ts`. `[Fakt]` Die Plattform liefert diesen Zustand nicht. `[Schlussfolgerung]`
Kein Weg befüllt ihn; Weg (a) würde ihn überschreiben, wenn der Mapper das ganze Dokument schreibt.
Damit verliert der Rückfallweg genau den Teil, den V32 für „Kauf bleibt nutzbar" braucht. **E1 muss
den Chain-Block ausdrücklich ausnehmen oder seinen Befüller behalten.**
**Entscheider:** Wolfgang.

### E2 — Stabilitätszeitraum vor dem Abbau · `offen, fällig vor Tor T1`
**Frage:** unverändert — wie lange muss das Flag in der Produktion an und unauffällig sein?
**Ergänzt, Befund 13:** Eine Zahl allein genügt nicht; „unauffällig" ist ohne Messgröße ebenso
Ermessen. Zu nennen sind Zeitraum **und** Grenzwerte dreier Größen, die A1 protokolliert oder
protokollieren kann: Anteil der Antworten mit `PLATFORM_UNAVAILABLE`, Zahl der 429-Sperren je Tag,
Anteil `TOKEN_NOT_INDEXED` an Detailaufrufen.
**Entscheider:** Wolfgang.

---

## 7. Was dieser Plan ausdrücklich nicht enthält

| Nicht enthalten | Warum |
|---|---|
| Löschen von Altpfaden | Eigener Plan (`state/plan-v1-abbau-altpfade.md`), eigenes Tor: erst nach Flag an und Abnahme. **Berührt von E6** |
| `nft_metadata` abbauen | Nicht-Ziel der Spec, Rückfallweg für V32 |
| V35 (Hintergrunddienst startet beim Laden eines Routen-Moduls) | Gruppe C, eigener Befund |
| V62 (Worker in der Alpha) | Gruppe C — aber **Vorbedingung** dieses Plans, siehe Abschnitt 3 |
| V39–V42 Kaufsicherheit, Gruppe F | Anderer Problemkreis — **berührt von E8** |
| Änderungen an der Plattform | Nicht-Ziel: eigenes Projekt bei Niklas |
| Likes, Ratings, Watchlist migrieren | Nicht-Ziel der Spec |
| Ein gemeinsamer Rate-Limit-Zähler über Prozesse | Nicht vor dem Umschalten nötig; die Messbarkeit der Abweichung ist es (A2) |

---

## 8. Risiken

| Risiko | Wirkung | Gegenmittel im Plan |
|---|---|---|
| Fremde Collection wird durch einen Seitenaufruf ins Indexing gezogen | RPC-Kosten bei Niklas, ungewollte Registrierung | A4a vor allen Routen, mit scharfem Kriterium |
| Prüfstand-Commit falsch gewählt | Mapper **und** Fehlertaxonomie von A1 brechen | E5 mit Nachlese der vier A1-Annahmen |
| Still ignorierte Parameter täuschen grüne Tests vor | Falsche Daten sehen gesund aus | A3, Pflichttest „zweite Seite ≠ erste Seite" |
| Fensterlimit wird überschritten | 429 unter Last, degradierte Ansichten | A1 (Deckel, Backoff), A2 (eigene Fensterzählung), A10 (Budget je Pfad) |
| Zwei Prozesse zählen getrennt | bis 16 gleichzeitige Anfragen statt 8 | A2, Messbarkeit; bewusst getragen, im Ledger |
| Rückfallweg altert ab A6, nicht erst ab R3 | V32 formal erfüllt, faktisch wertlos | E1 vor A6 |
| Chain-Block fällt weg | Kaufschutz und Sell-Flow ohne Datengrundlage, ERC1155-Aufrufe verdoppelt | A7a behält ihn, E8 entscheidet |
| Übersicht bleibt auf `nft_metadata` | Zielbild formal erreicht, faktisch nicht | A11, E6 |
| Vier von sieben Fehlerklassen werden HTTP 500 | V32 ohne Deckung, Betriebsfehler unsichtbar | A8, Fehlerübersetzungstabelle |

---

## 9. Artefakte

- **A-1** Kopfzeile im Migrationsdokument — `[Fakt]` **erledigt**, belegt in
  `docs/api/nft-data-platform-marketplace-migration.md` Zeilen 3–14. (v1 führte sie noch als offen.)
- **A-2** ADR „Rückfallweg `nft_metadata` nach dem Umschalten" — nur bei E1 (a). Bei (b) oder (c)
  entfällt er.
- **A-3** Zeile in `state/gates.md` für die Startprüfung in ihrer neuen Form — offen, mit A2.
- **A-4** Ablage für Befunde — `[Fakt]` **entschieden und eingehalten**: Annahmen in
  `state/assumption-ledger.md`, Doku-Drift in `state/repo-audit-befunde.md`, Arbeitspakete in
  `state/tasks/`. Keine vierte Ablage.
- **A-5** neu: `state/abnahme-plattform-integration.md` als Ablageort für A10 und den Smoke-Lauf.
- **A-6** neu: Schema-Entscheidung für den Admin-Zustand aus A4c — als ADR oder als Zeile in
  `docs/database/`, vor dem A4c-Vertrag.

---

## 10. Nächster sinnvoller Schritt

E4 und E5 einholen — beide brauchen keinen Code und bestimmen alles Weitere. Mit E4 ist der
A2-Vertrag schreibbar; A8 hängt an keiner offenen Entscheidung und wäre der erste Baudurchgang, der
ohne Rückfrage starten könnte. A4a folgt unmittelbar, sobald E5 steht.
