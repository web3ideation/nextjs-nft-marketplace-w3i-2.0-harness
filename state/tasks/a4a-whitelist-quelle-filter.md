SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a1` sein. Danach `npm run check` laufen lassen
(erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a4a-whitelist-quelle-filter

GOAL:
Eine serverseitige Quelle für die Diamond-Whitelist und eine Filterfunktion, die
jeder Discover-, Refresh- und Detail-Pfad vor einem Plattform-Aufruf befragen
kann. Prüfbar an: eine Adresse außerhalb einer eingespeisten Whitelist ergibt
`false`, unabhängig von Groß- und Kleinschreibung · ein zweiter Aufruf innerhalb
der Frist liest **nicht** erneut von der Chain · nach Ablauf der Frist schon ·
schlägt die Lesung fehl und es gibt einen letzten bekannten Stand, wird dieser
geliefert und als veraltet protokolliert · gibt es keinen, antwortet der Filter
**verneinend** und protokolliert auf Fehlerstufe · `npm run check` endet mit
Exit 0.

V-Abdeckung: V33 (Filterteil). Die Push-Kopplung ist A4b, Registrierung und
Admin-Zustand sind A4c.

CONTEXT:
- [Fakt] Advisor-Befund 2(a): Eine serverseitige Lesung der Whitelist existiert
  **nicht**. `getWhitelistedCollections` kommt in vier Client-Dateien vor —
  `src/hooks/marketplace/useMarketplaceData.ts`,
  `src/app/admin/marketplace/page.tsx`,
  `src/app/admin/components/multisig/MarketplaceGovernanceSidebar.tsx`,
  `src/app/admin/components/multisig/TransactionBuilder.tsx` — alle als
  wagmi-Reads im Browser. Dazu die ABI-Definition in
  `src/config/abis/getter-facet.ts`.
- [Fakt] Die ABI trägt beides: `getWhitelistedCollections()` → `address[]` und
  `isCollectionWhitelisted(address)` → `bool`
  (`src/config/abis/getter-facet.ts:148-170`).
  [Schlussfolgerung] Die Einzelabfrage wäre ein RPC-Aufruf **je Prüfung**; die
  Listenabfrage ist einer je Frist. Für einen Filter, der vor jedem
  Detail-Aufruf steht, ist nur die Liste tragbar.
- [Fakt] Es gibt ein Hausmuster für serverseitige Chain-Lesungen:
  `src/services/blockchain/rpc-config.ts` mit `createRobustPublicClient()`,
  `createFallbackClientEntries()`, `executeWithFallback()`, mehreren Endpunkten
  und einer Abkühlung nach Rate-Limit (`markRpcEndpointRateLimited`).
  [Fakt] `src/app/api/marketplace/facets/route.ts:8-14` verdrahtet Adresse und
  RPC-URL dagegen hart im Dateikopf. [Schlussfolgerung] Das ist der Weg, den
  dieser Auftrag **nicht** geht — sonst entsteht ein vierter Client mit eigenem
  Fehlerverhalten.
- [Fakt] Die Marktplatz-Adresse steht in `NEXT_PUBLIC_MARKETPLACE_ADDRESS` und
  ist in `scripts/check-env.js` Pflichtvariable. Sie ist öffentlich, der
  `NEXT_PUBLIC_`-Präfix ist hier also kein Verstoß gegen V14 — anders als bei
  den Plattform-Zugangsdaten.
- [Fakt] Advisor-Befund 2(a), zweiter Teil: Ohne Zwischenspeicher liegt vor
  **jedem** Discover-, Refresh- und Detail-Aufruf eine RPC-Lesung.
  [Schlussfolgerung] Das verlagert die Kosten nur von Niklas' RPC auf unseren,
  statt sie zu vermeiden.
- [Fakt] Die Invalidierung des Zwischenspeichers hängt an den Ereignissen
  `CollectionAddedToWhitelist` und `CollectionRemovedFromWhitelist`, die der
  bestehende Event-Pfad **nicht** hört und strukturell nicht hören kann
  (Advisor-Befund 2(b)); das kommt erst mit A4c.
  [Schlussfolgerung] Bis dahin trägt eine Frist (TTL). Das ist zu dokumentieren,
  nicht zu verschweigen: in der Zeit zwischen einer Whitelist-Änderung und dem
  Ablauf der Frist ist unsere Antwort falsch.
- [Fakt] Web und Worker sind zwei Prozesse (`APP_RUNTIME_ROLE`).
  [Schlussfolgerung] Ein prozesslokaler Zwischenspeicher bedeutet eine
  RPC-Lesung je Prozess je Frist. Das ist tragbar und einfach; ein geteilter
  Zwischenspeicher über Redis brächte einen zweiten Invalidierungspfad, den A4c
  ohnehin ersetzt. Bewusst prozesslokal — anders als beim Rate-Limit-Budget ist
  hier keine Obergrenze zu teilen, nur ein Leseergebnis.
- [Fakt] Die Chain liefert Adressen in Prüfsummen-Schreibweise, die
  Marktplatz-Daten tragen sie teils klein. [Schlussfolgerung] Ein Vergleich ohne
  Normalisierung ergibt stillschweigend `false` für eine Collection, die auf der
  Whitelist steht — und damit genau den Fehler, den der Filter verhindern soll,
  nur in die andere Richtung.
- [Fakt] V33 begründet den Filter mit Kosten bei Niklas: schon ein
  Token-Refresh registriert die Collection auf der Plattform.

SCOPE:
1. `src/services/blockchain/collection-whitelist.ts` — neue Datei:
   - `isCollectionWhitelisted(contractAddress, deps?): Promise<boolean>` — die
     Funktion, die jeder Aufrufpfad befragt. Vergleich **kleingeschrieben**.
   - `getWhitelistedCollections(deps?): Promise<ReadonlySet<string>>` — die
     Liste, kleingeschrieben, aus dem Zwischenspeicher oder frisch.
   - `invalidateWhitelistCache(): void` — für A4c und für Tests.
   - `getWhitelistCacheState()` — Momentaufnahme für Diagnose und Tests:
     Zahl der Einträge, Zeitpunkt der Lesung, ob der Stand veraltet ist.
   - Gelesen wird über `executeWithFallback` aus
     `src/services/blockchain/rpc-config.ts` und `GETTER_FACET_ABI`. Kein
     eigener `createPublicClient`.
   - Frist über `MARKETPLACE_WHITELIST_TTL_MS`, Standardwert 60000. Im
     Dateikopf begründen: eine Minute ist kurz genug, dass eine Freigabe
     zeitnah wirkt, und lang genug, dass eine Detailseiten-Welle nicht je
     Aufruf liest.
2. **Das Fehlerverhalten ist die wichtigste Entscheidung dieses Pakets** und
   gehört ausführlich in den Dateikopf:
   - Lesung schlägt fehl, **letzter bekannter Stand vorhanden**: diesen
     ausliefern, auf Warnstufe protokollieren, Frist nicht verlängern (nächster
     Aufruf versucht es erneut). Ein veralteter Stand ist besser als keiner.
   - Lesung schlägt fehl, **kein letzter Stand**: `isCollectionWhitelisted`
     antwortet `false`, auf **Fehlerstufe** protokollieren. Begründung: der
     Filter existiert, um Kosten bei Niklas zu vermeiden (V33). Im Zweifel
     verneinen heißt, dass legitime Discover-Aufrufe ausbleiben — sichtbar und
     behebbar. Im Zweifel bejahen heißt, dass fremde Collections indiziert
     werden — unsichtbar und nicht rückholbar.
   - Die Whitelist ist **leer**: kein Fehler, aber auf Warnstufe
     protokollieren. Eine leere Liste und eine fehlgeschlagene Lesung sehen für
     den Aufrufer gleich aus, und das darf im Protokoll nicht so sein.
3. `src/services/blockchain/collection-whitelist.test.ts`:
   - Prüfsummen-Adresse auf der Whitelist, kleingeschrieben abgefragt → `true`,
     und umgekehrt.
   - Adresse außerhalb → `false`.
   - Zweiter Aufruf innerhalb der Frist liest nicht erneut (Zähler auf dem
     eingespeisten Leser).
   - Nach Ablauf der Frist liest er erneut.
   - `invalidateWhitelistCache()` erzwingt eine Lesung.
   - Lesefehler mit vorhandenem Stand → alter Stand, Frist nicht verlängert.
   - Lesefehler ohne Stand → `false`.
   - Leere Whitelist → `false` für alles, ohne Wurf.
   - Eine ungültige Eingabe (kein `0x`-Präfix, falsche Länge) → `false`, ohne
     RPC-Aufruf. Begründung im Testnamen: eine kaputte Adresse ist kein Grund,
     die Chain zu fragen.
4. Dateikopf nach `docs/kommentar-standard.md`.

NICHT:
- Die vier bestehenden Client-Aufrufe von `getWhitelistedCollections` anfassen.
  Sie laufen im Browser und bleiben, bis jemand sie braucht — eine
  Zusammenlegung ist ein eigener Auftrag.
- `src/app/api/marketplace/facets/route.ts` aufräumen, auch wenn dort Adresse
  und RPC-URL hart stehen. Eigener Befund, eigener Auftrag.
- Discover- oder Refresh-Aufrufe auslösen. Das ist A4b, und es hängt zusätzlich
  an A3b.
- Die Whitelist-Ereignisse abonnieren oder den Event-Pfad erweitern. Das ist
  A4c und berührt den Pfad, an dem die Live-Aktualisierung der Listings hängt.
- Einen Admin-Zustand oder ein Schema anlegen. A4c, mit eigener
  Schema-Entscheidung.
- Einen geteilten Zwischenspeicher über Redis bauen.
- Eine Route anfassen. A4a hat noch keinen Aufrufer außer den Tests — der erste
  echte Aufrufer ist A7a.
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Eine neue Quelldatei, eine
neue Testdatei. Klein — der Umfang steckt im Fehlerverhalten, nicht in der Zahl
der Zeilen.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht mit: Exit-Code von `npm run check`, Zahl der neuen Tests, dem
  gewählten Fristwert samt Begründung, und der Fehlerverhaltens-Tabelle
  (Lesefehler mit Stand, ohne Stand, leere Liste) in umgesetzter Form.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- `executeWithFallback` passt nicht auf eine einfache `readContract`-Lesung
  (etwa weil es eine andere Signatur erwartet): melden, **nicht** einen eigenen
  Client bauen. Dann ist das Hausmuster das Problem und das ist ein eigener
  Befund.
- `NEXT_PUBLIC_MARKETPLACE_ADDRESS` fehlt oder ist keine gültige Adresse:
  Verhalten wie „Lesung schlägt fehl, kein Stand" — `false` und Fehlerstufe.
  Nicht raten, nicht hart verdrahten.
- Es stellt sich heraus, dass die Whitelist pro Chain verschieden ist und die
  Funktion eine `chainId` braucht: anhalten und melden. Die Spec geht von einem
  Sepolia-Diamond aus (Entscheidung 29), aber das ist eine Annahme über die
  Zukunft, keine über heute.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
A7a, A9 und A11 — die ersten echten Aufrufer des Filters. A3b (Wallet,
Discover, Refresh) liegt ebenfalls dahinter.
Offen und von diesem Auftrag unberührt: E8 (blockiert A7c), E1 (vor A6), E2
(vor Tor T1), die V63-Prämisse auf dem unvereinten Plattform-Branch (vor
A4b/A4c) und Review-Befund 8 (vor A5).
