SCHRITT 0: Arbeitsverzeichnis ausgeben und gegen das im Auftrag genannte
Zielverzeichnis prüfen. Bei Abweichung: abbrechen, melden, nichts ändern.
Danach: `git status` und `git branch -vv` zeigen, Branch muss
`feat/plattform-anbindung-a11b` sein. **Voraussetzung: A11a ist auf `main` gemergt** —
der Branch wird von `main` abgezweigt; fehlen `mappers/marketplace-items.ts` oder die
Option `maxAttempts` in `client.ts`, anhalten und melden. Danach `npm run check` laufen
lassen (erwartet: Exit 0). Ist er rot, anhalten und melden.

Zielverzeichnis: C:\Users\hoffm\Programming\nextjs-nft-marketplace-w3i-2.0-harness

## TASK: a11b-items-schutz

GOAL:
Die Überlagerung aus A11a schützt die Plattform und das gemeinsame `alpha-read`-Budget:
ein Ausfall-Merker verhindert Anfragen, solange die Plattform nicht antwortet · eine Drosselung
verhindert, dass ein nie `ready` werdendes Token bei jedem Seitenaufruf neue Arbeit auslöst ·
ein Überlagerungs-Cache je Seitenmenge macht die Aufrufzahl unabhängig von Sortierung und Filter
· der Antwort-Cache unterscheidet „Plattformfehler" von „einzelne Karte nicht überlagerbar".
Prüfbar an: derselbe Seiteninhalt unter anderer Sortierung erzeugt **keinen** zweiten Discover
innerhalb von 30 s · eine `queued`-Identität wird innerhalb der Pause **nicht** erneut
angefragt · bei gesetztem Ausfall-Merker geht **kein** Plattformaufruf raus · eine Ablehnung
durch unseren Whitelist-Filter wird **nicht** pausiert · `npm run check` endet mit Exit 0.

**Mit A11b ist A11 ausgeliefert** (Flag-Umschalten selbst ist A10, nicht dieses Paket).

V-Abdeckung: V22 (Budget), V32 (Rückfallweg), V34 (Auslastung).

CONTEXT:
- [Fakt] Maßgeblich ist `state/plan-v2-a11-marketplace-items.md`, Abschnitte 4–7 und 12.
  Befunde: `state/advisor-findings-a11-marketplace-items.md`, Nr. 1, 3, 4, 5, 12.
- [Fakt, Advisor] `src/lib/redis/shared-cache.ts` hat
  `getSharedCacheValue<T>(key)`, `setSharedCacheValue<T>(key, value, ttlSeconds)` und
  `deleteSharedCacheValue(key)`. Es gibt **kein** `mget`, kein `NX`, und es verschluckt jeden
  Redis-Fehler und fällt still auf eine Prozess-`Map` zurück. [Schlussfolgerung] Es gibt keinen
  Fehlerpfad, den man abfangen könnte; **kein** `logger.warn` für „Cache-Ausfall" bauen.
  Ohne Redis wirkt jede Drosselung je Prozess — akzeptiert.
- [Fakt, Advisor] Der lokale Fallback ruft bei **jedem** `get` ein `cleanupLocalCache()` auf
  (Scan über bis zu 5000 Einträge). [Schlussfolgerung] Bei einem `get` je Identität (bis 100 je
  Anfrage) skaliert das, ist aber der Grund, den Überlagerungs-Cache je Seitenmenge **zuerst**
  zu prüfen.
- [Fakt] Discover reiht für unbekannte Token einen `refresh-token`-Job mit `forceMetadata: true`
  ein; ein `failed`-Job und wegen `forceMetadata` auch ein `completed`-Job werden bei **jedem**
  Aufruf neu eingereiht (Plattform `packages/queue/src/index.ts`,
  `shouldReenqueueExistingJob`, Stand `cea0ea4`). Deaktivierte Collections liefern je Eintrag
  `failed` mit Meldung und reihen nichts ein.
- [Fakt, Advisor] `discoverTokens` gibt für Identitäten, die **unser** Whitelist-Filter
  abgelehnt hat, ebenfalls `failed` zurück (`write.ts`, `partitionByWhitelist`, `rejectedItem`,
  Meldung `NOT_WHITELISTED_MESSAGE`). [Schlussfolgerung] Würde man „alles ohne `ready`"
  pausieren, löste eine nicht gelistete Collection dauerhaft `staleWarning` aus, und ein
  vorübergehender Whitelist-Lesefehler (liefert eine leere Menge, `collection-whitelist.ts:~220-236`)
  vergiftete **alle** Identitäten zehn Minuten lang.
- [Fakt, Advisor] Fehlerklassen und `allowLocalFallback` stehen in
  `src/lib/nft-data-platform/view-state.ts` (`translatePlatformError`): Ratenlimit, Auth,
  Config, Timeout, Unavailable → `allowLocalFallback: true`; `PlatformResponseError`,
  `PlatformReplayError` → `false`.
- [Fakt, Advisor] Die Route setzt `Cache-Control: public, s-maxage=10, stale-while-revalidate=30`
  **immer** (`route.ts:~811`). Der Antwort-Cache der Standardansicht
  (`MARKETPLACE_DEFAULT_RESPONSE_CACHE_KEY = 'marketplace:items:default-response:v2'`, 15 s)
  wird in A11a vorläufig bei `staleWarning` nicht geschrieben. [Schlussfolgerung] Das hebt ihn
  schon bei **einer** dauerhaft nicht überlagerbaren Karte auf Seite 1 auf — ein Rückschritt
  gegenüber heute. Hier wird die Regel getrennt.
- [Fakt, Advisor, entlastend] Die Vorwärmung (`init-services.ts:55-60`) ruft die Route per HTTP
  auf und füllt den Cache mit überlagerten Werten. Nichts zu ändern.
- [Fakt, Advisor] Die Route ist öffentlich; `apiHandler` begrenzt mit `LENIENT` (120/min) nach
  Route + IP + **User-Agent** — durch Wechsel des User-Agents umgehbar. Das ist **nicht**
  Gegenstand dieses Pakets, sondern ein eigener Ledger-Eintrag.
- [Annahme] 30 s Überlagerungs-Cache sind für die Anzeige von Metadaten unkritisch. Nicht
  gemessen.
- [offene Unsicherheit] Hat die Produktion `REDIS_URL` gesetzt und wie viele Instanzen laufen?
  Ein CDN vor der Route? Beides bestimmt, wie weit Drosselung und `Cache-Control` tragen. Nicht
  vor dem Bau zu klären, aber im Bericht und im Ledger zu führen.

SCOPE:
1. `src/lib/nft-data-platform/write.ts`: `isRejectedByWhitelist(item)` exportieren — ein
   Unterscheidungsmerkmal für durch **unseren** Filter abgelehnte Einträge, **nicht** der
   Vergleich der Meldung als Zeichenkette im Aufrufer. Dafür `rejectedItem` ein internes
   Kennzeichen setzen lassen oder die Erkennung an einer Stelle bündeln. Der bestehende Vertrag
   von `discoverTokens` (Antwortform) bleibt unverändert. Test in `write.test.ts`.
2. `src/lib/nft-data-platform/items-overlay-guard.ts` — neu, kapselt alles Zustandsbehaftete
   (Route bleibt lesbar):
   - **Ausfall-Merker:** `isPlatformMarkedDown()` / `markPlatformDown()`, Schlüssel
     `platform:items-overlay:down`, TTL 60 s (benannte Konstante, begründet). Gesetzt, wenn
     `translatePlatformError(...)` `allowLocalFallback: true` meldet (Ratenlimit, Auth, Config,
     Timeout, Unavailable). Ein `PlatformResponseError` setzt ihn **nicht** (Formfehler ist kein
     Ausfall; er bleibt auf Stufe `error` im Log).
   - **Drosselung je Identität:** Schlüssel
     `platform:discover:pause:<chainId>:<adresse klein>:<tokenId>`, TTL
     `DISCOVER_RETRY_PAUSE_MS` (Startwert zehn Minuten, begründet). `filterPaused(keys)` und
     `markPaused(keys)`. Pausiert wird **nur**, was die **Plattform** mit `queued` oder
     `failed` beantwortet hat; Ablehnungen durch den eigenen Whitelist-Filter
     (`isRejectedByWhitelist`) und Einträge ohne Antwort **nicht**.
   - **Überlagerungs-Cache je Seitenmenge:** Schlüssel =
     Hash der **sortierten** Identitätsschlüssel, `platform:items-overlay:page:v1:<hash>`,
     TTL 30 s (benannte Konstante). Wert: die Überlagerungskarte aus A11a in
     JSON-tauglicher Form (`overlays` und `notOverlaid`).
3. `src/app/api/marketplace/items/route.ts`, Reihenfolge der Prüfungen vor dem Aufruf:
   Überlagerungs-Cache der Seitenmenge (Treffer → **null** Aufrufe) → Ausfall-Merker gesetzt
   (→ **null** Aufrufe, lokal, `staleWarning: true`) → pausierte Identitäten abziehen → ein
   `discoverTokens`-Aufruf mit den Optionen aus A11a → Antwort in Überlagerungs-Cache schreiben
   → `markPaused` für `queued`/`failed` der Plattform. Bei Fehler: `markPaused` **nicht**, aber
   `markPlatformDown` nach der Regel oben.
4. **Cache-Semantik** (ersetzt die vorläufige Regel aus A11a):
   - **Plattformfehler** (Aufruf gescheitert oder Ausfall-Merker gesetzt): Antwort **nicht** in
     den Antwort-Cache, und `Cache-Control` auf kurz bzw. `no-store` setzen statt
     `s-maxage=10, stale-while-revalidate=30`.
   - **Einzelne Karte nicht überlagerbar:** Antwort **wird** gecacht, `staleWarning: true` im
     Cache-Eintrag.
   - Cache-Schlüssel der Standardansicht auf `…:v3`.
5. Dateikopf der Route und des Guards: bis zu zehn Minuten Verzögerung, bis ein pausiertes Token
   wieder überlagert wird · ohne Redis wirken Merker, Pause und Cache je Prozess · das
   `LENIENT`-Limit der Route ist durch User-Agent-Wechsel umgehbar und hier nicht gelöst.
6. `state/assumption-ledger.md`: Einträge für (a) Bündelaufruf zählt als ein Aufruf — vor
   A10-Stufe-1 messen · (b) Produktion hat `REDIS_URL`, Zahl der Instanzen, CDN · (c) `LENIENT`-
   Limit umgehbar, öffentliche Route verstärkt auf das `alpha-read`-Budget · (d) 30 s
   Überlagerungs-Cache unkritisch · (e) `staleWarning` wird von keiner Oberfläche gelesen (Lücke
   zu V32). Je Eintrag Vorbehalt und Fälligkeit, Format der vorhandenen Zeilen.
7. Tests:
   - `items-overlay-guard.test.ts` (neu): Merker setzen/lesen/ablaufen · Pause je Identität ·
     `filterPaused` lässt Nicht-Pausierte durch · Schlüssel unabhängig von der Reihenfolge der
     Identitäten · Hash stabil.
   - `route.test.ts` (aus A11a erweitern): dieselbe Seitenmenge unter anderer Sortierung →
     **ein** Aufruf in Summe · Cache-Treffer → null · `queued`-Identität wird beim zweiten
     Aufruf innerhalb der Pause nicht angefragt · Whitelist-Ablehnung wird **nicht** pausiert ·
     Merker gesetzt → null Aufrufe, `staleWarning: true`, `Cache-Control` ohne `s-maxage` ·
     Plattformfehler → Antwort nicht im Antwort-Cache · einzelne nicht überlagerbare Karte →
     Antwort **im** Antwort-Cache mit `staleWarning: true` · Schlüssel `…:v3`.

NICHT:
- Das `LENIENT`-Limit der Route ändern oder eine eigene Ratenbegrenzung daneben bauen.
- `shared-cache.ts` erweitern oder einen Fehlerpfad dafür erfinden. Eigene Ablage in MongoDB
  oder im Prozessspeicher **neben** dem gemeinsamen Cache bauen: im Mehrinstanzbetrieb wirkungslos.
- Alles ohne `ready` pausieren, oder Ablehnungen des Whitelist-Filters pausieren.
- Die Suche, die Namenssortierung, den `$lookup` oder die Pipeline anfassen.
- Die Vorwärmung (`init-services.ts`) ändern.
- Eine UI-Kennzeichnung für `staleWarning` bauen (Lücke zu V32, im Ledger geführt).
- Das Flag einschalten (A10).
- Committen oder pushen ohne ausdrückliche Freigabe.

BUDGET:
Ein Baudurchgang plus höchstens eine Korrekturrunde. Neu: Guard-Datei mit Test; geändert:
Route, `write.ts`, `route.test.ts`, Ledger. Sprengt die Cache-Semantik (Nr. 4) den Rahmen, den
Rest ausliefern und Nr. 4 als eigene Korrekturrunde melden — die Pausen-Logik (Nr. 2/3) darf
**nicht** fehlen.

OUTPUT:
- Die Dateien aus SCOPE im Arbeitsbaum, unkommittet.
- Kurzbericht: Exit-Code von `npm run check`, Zahl neuer Tests, die **gemessene** Zahl der
  `discoverTokens`-Aufrufe in den Szenarien (Aufrufstelle, nicht HTTP), die gewählten Werte
  der drei Konstanten mit Begründung, und die ausdrückliche Feststellung, was ohne Redis nur je
  Prozess wirkt.
- Beim Stagen ausschließlich explizite Pfade, nie `-A` oder `.`.
- Kein Commit ohne Freigabe. Für den Commit den Skill `git-flow` nutzen.

ESCALATE:
- Die Schnittstelle von `shared-cache.ts` reicht für den Hash-Schlüssel oder die TTL nicht:
  anhalten, nicht die Schnittstelle erweitern.
- `isRejectedByWhitelist` lässt sich nicht ohne Änderung der Antwortform von `discoverTokens`
  bauen: anhalten.
- Ein bestehender A11a-Test kippt durch die neue Reihenfolge der Prüfungen: Befund melden,
  nicht den Test anpassen, bis klar ist, ob die Reihenfolge oder der Test falsch ist.
- Der Überlagerungs-Cache liefert veraltete Überlagerungen nach einem erfolgreichen Refresh
  (Anzeige hängt hinter der Plattform): melden; 30 s sind eine Annahme, keine Messung.
- Die Antwort-Cache-Regel (Nr. 4) widerspricht dem bestehenden Test der Standardansicht:
  anhalten und melden.
- `npm run check` wird rot: Befunde melden, nicht durch `any` grün machen.

FOLGT:
- **A10, Stufe 1** — Fensterzählung messen: `x-ratelimit-remaining` vor und nach einem
  Discover-Aufruf mit mehreren Einträgen; A11 in die Messung aufnehmen.
- **Zweiter Advisor-Pass** gegen A11a/A11b (nur geänderte Stellen) vor dem Bau, **Reviewer-Pass**
  (`code-reviewer`) nach dem Bau.
- **E6-Rest, die Suche** — Entscheidung in `state/plan-v2-plattform-integration.md`,
  Abschnitt 6.
- **Eigener Ledger-Eintrag/Auftrag:** das `LENIENT`-Limit der öffentlichen Route.
