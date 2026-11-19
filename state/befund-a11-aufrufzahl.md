<!-- Ziel-Pfad im Repo: state/befund-a11-aufrufzahl.md -->
# Befund — Aufrufzahl der Marktplatz-Übersicht (E6, vor dem A11-Vertrag)

Stand: 13.11.2026 · Erhoben am Plattform-Code, nicht am Migrationsdokument.
Evidenz-Marker wie im Plan: `[Fakt]` belegt · `[Schlussfolgerung]` abgeleitet ·
`[Annahme]` ungeprüft.

**Auftrag:** E6 (`state/plan-v2-plattform-integration.md`, Abschnitt 6) verlangt vor dem
A11-Vertrag den Beleg, „dass eine Übersicht mit zwanzig Karten mit ein bis zwei
Plattform-Aufrufen auskommt — die Spec behauptet das, v1 übernahm es ungeprüft, und ohne
Beleg ist A11 der Ort, an dem das Fensterlimit zuerst reißt."

**Ergebnis in einem Satz:** Die Behauptung ist **widerlegt**. Die Plattform hat keinen
Endpunkt, der eine gewählte Menge von Token in einem Aufruf liefert.

---

## 1. Welcher Stand gelesen wurde

`[Fakt]` Gelesen gegen `origin/main` des Plattform-Repos, Commit **`4da567a`**
(„feat(platform): add a collection off switch, a worker heartbeat and a discover guard",
#22, 07.11.2026). Nicht gegen den dortigen Arbeitsbaum: der steht auf dem Branch
`fix/shell-env-precedence` (`d3643fb`).

`[Fakt]` `4da567a` liegt **fünf Commits** hinter dem Stand, gegen den die Pakete A3b und A9
gelesen haben (`2812315`); `2812315` ist Vorfahr von `origin/main`.

`[Schlussfolgerung]` Das ist ein Beleg für den V37-Punkt, nicht nur eine Fußnote: E5 pinnt
einen **Zweig** („die Plattform-`main`"), kein Commit. Dadurch stehen im Marktplatz-Code
drei verschiedene Stände als Belegzeile — `5dda8c7` in `signing.ts`, `5df7493` und
`2812315` in `schemas.ts`. V37 verlangt aber „als Commit festgehalten" und einen
Versionssprung als eigene Änderung mit grünem Testlauf. Zu entscheiden, nicht hier zu
reparieren.

---

## 2. Der Befund

`[Fakt]` Vier Wege wurden geprüft, keiner liefert eine gewählte Menge von Token:

| Weg | Fundstelle (`origin/main`) | Befund |
|---|---|---|
| `GET /api/v1/tokens` | `apps/web/src/app/api/v1/tokens/route.ts`, `tokenListQuerySchema` | nimmt `chainId`, `contractAddress`, `metadataStatus`, `mediaStatus`, `traitType`, `traitValue`, `cursor`, `limit` (max 200) — **kein Filter auf Token-IDs** |
| `listTokens` | `packages/db/src/index.ts:1453`, Filterbau in `buildTokenFilterQuery:2226` | dieselbe Lücke eine Ebene tiefer; `tokenId` kommt im Filter nicht vor. Sortierung `updatedAt: -1, _id: -1` |
| `findTokensByIds` | `packages/db/src/index.ts:1336` | existiert und kann bündeln — aber über **MongoDB-ObjectIds** (`_id: { $in: … }`), nicht über `(contract, tokenId)`. Hängt an keiner `v1`-Route, dient intern der Collection-Vorschau (`apps/web/src/lib/collection-response.ts:39`) |
| `GET /api/v1/search` | `apps/web/src/app/api/v1/search/route.ts`, `buildTokenSearchQuery:2275` | `queryText` matcht **einen** Wert je Anfrage gegen Name, Beschreibung, `tokenId` und Attribute — also eine Anfrage je Token, kein Bündel |

`[Fakt]` Die Listenroute reicht dieselbe Anreicherung aus wie die Detailroute
(`serializeEnrichedTokens`). `[Schlussfolgerung]` Das Problem ist **nicht** der Inhalt der
Antwort und nicht das Mapping — es ist allein die **Auswahl**.

---

## 3. Was ein Detailaufruf je Karte kostet

| Größe | Wert | Fundstelle |
|---|---|---|
| Token je Seite der Übersicht | 20 (Vorgabe), max. 100 | `src/app/api/marketplace/items/route.ts:122` |
| Limit `alpha-read` | 600 Anfragen/Minute (Startwert) | Spec, Entscheidung 14 |
| Zählweise der Plattform | feste 60-Sekunden-Fenster je Client, danach harter Stopp | V34 |

`[Schlussfolgerung]` Ein Detailaufruf je Karte ergibt **20 Aufrufe je Seitenaufruf**, also
rund **30 Seitenaufrufe je Minute für den gesamten Shop** — und das ohne die drei Aufrufe
der Detailseite und den einen der Collections-Übersicht. Bei `limit=100` verbraucht eine
**einzelne** Anfrage ein Sechstel des Minutenbudgets. Das ist genau die Stelle, an der das
Fensterlimit zuerst reißt; E6 hat das richtig vermutet.

---

## 4. Die drei Wege, mit ihren Folgen

**(a) Bündel-Endpunkt bei Niklas anfragen.** Eine Liste von `(chainId, contractAddress,
tokenId)` in einem Aufruf, oder ein `tokenIds`-Filter auf der Listenroute. `[Fakt]` Die
Spec führt „Plattform-Code ändern" als Nicht-Ziel mit der Begründung: „Lücken dort
(Abschalt-Schnittstelle, Cache, Listen, Text-Index) baut er; wir umgehen sie nicht im
Marktplatz." `[Schlussfolgerung]` Das ist der Weg, den die Spec selbst vorzeichnet. A11
ruht bis dahin; A5, A6, A7c und A4b/A4c hängen nicht daran.

**(b) Je distinktem Contract einen Listenaufruf.** `contractAddress`-Filter plus
`limit=200`, lokale Zuordnung. Kosten sind dann k Aufrufe statt 20, k = Zahl verschiedener
Collections auf der Seite, nach oben durch die Diamond-Whitelist begrenzt.
`[Fakt]` `listTokens` sortiert nach `updatedAt` absteigend und paginiert.
`[Schlussfolgerung]` Bei einer Collection mit mehr als 200 indizierten Token kann der
gelistete Token außerhalb der ersten Seite liegen; dann greift der Rückfall auf
`nft_metadata` mit `staleWarning` — degradiert, nicht kaputt, aber **still** und umso
häufiger, je größer die Collection. Das ist ein Umgehen der Lücke im Sinne des Nicht-Ziels.

**(c) A11 fallen lassen.** `nft_metadata` bleibt dauerhaft Metadatenquelle der Übersicht.
`[Fakt]` E6 nennt die Folgen selbst: die R3-Zeile des Abbauplans muss fallen, sonst
entfernt R3 eine Quelle ohne Ersatz, und das Zielbild in Abschnitt 2 des Plans ist enger zu
formulieren.

---

## 5. Was dieser Befund nicht entscheidet

Die Richtung. Sie berührt eine externe Partei (a), ein ausdrückliches Nicht-Ziel der Spec
(b) und das Zielbild zweier Pläne (c) — also nichts, was aus dem Code folgt.

**Entscheider:** Wolfgang.

---

## 6. Nebenbefund, nicht Teil des Auftrags

`[Fakt]` `origin/main` trägt seit `4da567a` (#22) eine Abschalt-Schnittstelle für
Collections, einen Worker-Heartbeat und einen Discover-Guard. `[Schlussfolgerung]` V63
wartete ausdrücklich auf die Abschalt-Schnittstelle („Niklas baut die Abschaltung in beide
Richtungen, bis dahin führt er Abmeldungen von Hand nach"), und der Heartbeat berührt V62,
die Vorbedingung von A4b/A4c. Beides ist vor dem A4c-Vertrag am Plattform-Code
nachzulesen — hier nur vermerkt, nicht geprüft.
