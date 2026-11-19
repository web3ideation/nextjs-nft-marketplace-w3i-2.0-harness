<!-- Ziel-Pfad im Repo: state/anfrage-plattform-token-buendel.md -->
# Anfrage an die Plattform-Seite — Token-Bündel für die Marktplatz-Übersicht (E6, Weg a)

Stand: 19.11.2026 · **Entwurf, nicht versendet.** Belegt durch
`state/befund-a11-aufrufzahl.md` (Plattform-Stand `4da567a`).
Evidenz-Marker: `[Fakt]` belegt · `[Schlussfolgerung]` abgeleitet · `[Annahme]` ungeprüft.

---

## 1. Worum es geht, in drei Sätzen

Die Marktplatz-Übersicht zeigt je Seite 20 Karten (bis zu 100), und jede Karte braucht die
Plattform-Metadaten eines **bestimmten** Tokens. Die Plattform kann heute Token nur einzeln
(`GET /api/v1/tokens/:chainId/:contract/:tokenId`) oder als gefilterte Liste liefern — nicht
als gewählte Menge. Ohne Bündel kostet eine Seite 20 Aufrufe aus einem Topf von 600 je Minute.

## 2. Was gebraucht wird

Eine **lesende** Route, die eine Liste von Token-Identitäten annimmt und die zugehörigen
Token in einem Aufruf liefert.

**Vorschlag A (bevorzugt): `POST /api/v1/tokens/batch`**

```json
{
  "tokens": [
    { "chainId": 11155111, "contractAddress": "0x…", "tokenId": "42" }
  ]
}
```

- Obergrenze je Aufruf: **100** Einträge (entspricht dem größten Seitenumfang der Übersicht).
- Antwort in der Form der bestehenden Listen: `{ items: PlatformToken[], … }`, jedes Element
  mit **derselben** Anreicherung wie die Detailroute (`serializeEnrichedTokens`).
- **Unbekannte Token fehlen in `items`**, ohne den Aufruf scheitern zu lassen. Der Aufrufer
  vergleicht selbst und fällt für die fehlenden auf den Rückfallweg zurück.
- Reihenfolge der Antwort ist unerheblich; der Aufrufer ordnet über
  `(chainId, contractAddress, tokenId)` zu.
- Scope: `tokens:read`, also dieselben Zugangsdaten wie die Einzelroute (`alpha-read`).

**Vorschlag B (Alternative): Filter an der Listenroute**

`GET /api/v1/tokens?chainId=…&contractAddress=…&tokenId=1&tokenId=2&…`

Das wäre eine kleinere Änderung (`tokenListQuerySchema` plus Filterbau in
`buildTokenFilterQuery`), hat aber eine Längengrenze der URL. `[Schlussfolgerung]` Bei 100
Token-IDs je Contract sind das rund 700–1 000 Zeichen, also tragbar; über mehrere Contracts
hinweg trägt es nicht, weil die Route genau einen `contractAddress` kennt. Die Übersicht
mischt aber Collections — dann wären es wieder k Aufrufe. **Deshalb A.**

## 3. Warum nichts Vorhandenes passt

`[Fakt]` aus dem Befund, Abschnitt 2:

| Weg | Warum nicht |
|---|---|
| `GET /api/v1/tokens` | Kein Filter auf Token-IDs; `limit` max. 200 |
| `findTokensByIds` | Bündelt, aber über MongoDB-`ObjectId`; an keiner `v1`-Route |
| `GET /api/v1/search` | Ein `queryText` je Anfrage, ein Treffer je Token |
| Je Contract eine Liste holen | Greift bei Collections mit mehr als 200 Token zu kurz, degradiert still |

## 4. Was der Marktplatz zusagt

- Der Marktplatz ruft die Route nur mit Token auf, die er **selbst als aktives Listing**
  kennt. Es sind keine Suchläufe über den Gesamtbestand.
- Ein Aufruf je Seitenaufruf der Übersicht. `[Schlussfolgerung]` Bei 600 Anfragen je Minute
  und einem Aufruf je Seite bleibt Platz für Detailseiten, Wallet-Ansicht und Worker-Push
  (siehe Advisor-Befund 6d: alle teilen sich den 600er-Topf).
- Nebenläufigkeit und Backoff bei `429` wie in V34.
- Kein Umgehen der Lücke im Marktplatz: Bis die Route da ist, ruht A11, und die Übersicht
  liest weiter aus `nft_metadata`.

## 5. Fragen an die Plattform-Seite

1. **A oder B?** Oder ein dritter Weg, der die Aufrufzahl ebenso senkt?
2. **Obergrenze:** reichen 100 je Aufruf, und zählt ein Bündelaufruf im Fensterlimit als
   **ein** Aufruf oder als *n*? `[Annahme]` Ein Aufruf. Das ist für die Rechnung wesentlich
   und bisher ungeprüft.
3. **Zeitplan:** Wann ist das realistisch, und auf welchem Commit steht es dann? V37 verlangt
   einen festgehaltenen Prüfstand (siehe E5).
4. **Anreicherung:** Bleibt `serializeEnrichedTokens` auch im Bündel der Normalfall, oder wird
   gekürzt (Kosten)?

## 6. Folgen für den Plan

| Ausgang | Folge |
|---|---|
| Route kommt | A11 wird vertragsreif, R3 bleibt gültig |
| Route kommt nicht oder zu spät | E6 neu entscheiden: Weg (c), `nft_metadata` bleibt dauerhaft Quelle der Übersicht; R3-Zeile fällt, Zielbild in Abschnitt 2 des Plans wird enger formuliert |
| Keine Antwort bis zu einem Stichtag | Stichtag setzt der Entscheider; ohne Stichtag blockiert A11 offen |

Nicht blockiert, solange das offen ist: A5, A6, A7c, A4b/A4c.

## 7. Was diese Anfrage nicht entscheidet

Die Richtung von E6. Sie macht Weg (a) entscheidungsreif, ersetzt aber nicht die Freigabe.
**Entscheider:** Wolfgang, oder wer die Entscheidung laut Nachricht vom 19.11.2026 selbst
treffen darf.
