# ADR-0002 — Abhängigkeits-Sanierung zurückgestellt, Audit-Schwellwert bleibt `critical`

**Datum:** 2026-09-09
**Status:** Entschieden

## Kontext

Der CI-Schritt „Dependency audit" lautet
`npm audit --omit=dev --audit-level=critical` und läuft **vor** `npm run build`.
Der Schwellwert `critical` wurde am 08.09.2026 während der CI-Reparatur gesetzt —
außerhalb eines Handoff-Vertrags. Er steht seither in keinem ADR, in keinem
Assumption-Ledger und in keiner Zeile von `state/gates.md`. Damit ist er formal
nicht von einer stillen Lockerung zu unterscheiden. Dieses ADR holt die
Entscheidung nach.

Messung vom 09.09.2026:

- `npm audit --omit=dev` meldet „54 vulnerabilities (2 low, 38 moderate, 14 high)".
  **Keine kritische.**
- Ohne `--omit=dev` meldet dieselbe Messung
  „61 vulnerabilities (2 low, 40 moderate, 18 high, 1 critical)".

Daraus folgt: die eine kritische Schwachstelle steckt ausschließlich in
Dev-Abhängigkeiten und erreicht kein Produktionsartefakt. Am 09.09.2026 ist der
Build gelaufen, der Audit-Schritt war also grün.

`npm audit fix --dry-run` am 09.09.2026 meldet
„added 35 packages, removed 96 packages, changed 141 packages". Darunter
`vite 7.3.1 => 8.2.2` (Hauptversionssprung), `vitest 4.0.18 => 4.1.11`,
`viem 2.46.2 => 2.56.3`, `@sentry/* 10.43.0 => 10.74.0` sowie die Entfernung des
gesamten OpenTelemetry-Instrumentierungsbaums unter Sentry.

`@vitest/coverage-v8` ist in `package.json` **exakt** auf `4.0.18` festgelegt,
ohne Caret, weil sein Peer-Range exakt `"vitest": "4.0.18"` verlangt. Ein Bump
von vitest auf `4.1.11` ohne denselben Bump beim Coverage-Provider hat am
08.09.2026 den Fehler
`SyntaxError: The requested module 'vitest/node' does not provide an export named 'BaseCoverageProvider'`
erzeugt und die CI rot gemacht.

`npm audit fix` ist in diesem Repo also kein Patch, sondern ein Umbau des
Abhängigkeitsbaums.

## Optionen

1. **`npm audit fix` jetzt ausführen** — beseitigt in einem Lauf den größten Teil
   der 54 Befunde. Bezahlt wird das mit einem Umbau von 141 geänderten, 96
   entfernten und 35 neuen Paketen in einem einzigen Schritt. Drei Risikopunkte:
   der vite-Hauptversionssprung (7 → 8, unbekannte Bruchstellen im Build- und
   Testpfad), der vitest-Bump gegen den exakten Coverage-Pin (bekannter,
   bereits einmal eingetretener CI-Ausfall), und `viem`, das direkt unter
   Wallet-Signatur und Contract-Aufrufen sitzt — für den Kaufpfad existiert
   **keine** E2E-Abdeckung, ein Regress dort fiele erst im Betrieb auf.
2. **Einzelne Pakete gezielt anheben** (`axios`, `undici`, `form-data`, `hono`,
   `h3`) — kleinerer Eingriff pro Schritt, jeder Bump einzeln prüfbar. Die
   genannten Pakete liegen aber überwiegend als transitive Abhängigkeiten im
   Baum; ein gezieltes Anheben verlangt Overrides im Lockfile, die an den
   Auflösungsregeln der Elternpakete vorbei erzwungen werden. Das erzeugt einen
   Zustand, den kein `npm install` aus `package.json` reproduziert, und
   verschiebt die eigentliche Sanierung nur in eine schwerer zu lesende Form.
   Zudem senkt es die Befundzahl, ohne die drei Risikopunkte aus Option 1 zu
   berühren — die stecken in `vite`, `vitest` und `viem`, nicht in diesen fünf.
3. **Zurückstellen und den Schwellwert `critical` belassen** — der Audit bleibt
   als Gate scharf gegen genau die Klasse, die ein Produktionsartefakt erreichen
   könnte. Die 14 High-Befunde bleiben offen und sichtbar, statt in einem
   Sammelbump unbemerkt mit- oder wegverändert zu werden.

## Entscheidung

Option 3: zurückstellen, `--audit-level=critical` bleibt unverändert in
`.github/workflows/ci.yml`.

## Begründung

Die drei Risikopunkte aus Option 1 sind nicht gleichwertig zur behobenen Gefahr.
Kein Befund im Produktionsbaum ist kritisch; die einzige kritische Schwachstelle
liegt in Dev-Abhängigkeiten und wird nicht ausgeliefert. Dem steht ein Eingriff
gegenüber, der den Testrahmen (`vite`/`vitest`) und die Wallet-Schicht (`viem`)
gleichzeitig bewegt — und zwar genau dort, wo die Absicherung am dünnsten ist:
für den Kaufpfad gibt es keine E2E-Abdeckung, die einen Regress in `viem` fangen
würde. Ein Sammelbump ohne diese Abdeckung ist keine Sanierung, sondern eine
Wette.

Der vitest-Bump ist kein theoretisches Risiko: derselbe Schritt hat am
08.09.2026 die CI rot gemacht, weil der Coverage-Provider exakt gepinnt ist. Das
ist der bereits einmal bezahlte Beleg dafür, dass dieser Baum nicht en bloc
angehoben werden kann.

Dazu kommt der Zeitpunkt: die anstehende Datenquellen-Migration fasst den
Abhängigkeitsbaum ohnehin an. Ihn jetzt umzubauen und dort ein zweites Mal
bedeutet, zwei Bewegungen zu bezahlen und im Fehlerfall nicht zuordnen zu
können, welche davon den Regress verursacht hat.

**Was diese Entscheidung ausdrücklich nicht behauptet:** Sie sagt **nicht**, dass
die 14 High-Befunde harmlos sind. Sie sagt, dass sie zu diesem Zeitpunkt nicht
blind behoben werden. Die Befunde bleiben offen, gezählt und im
Assumption-Ledger als Vorbehalt geführt.

Damit der Schwellwert nicht als stille Lockerung stehen bleibt, ist der
Dependency-Audit ab sofort mit Rot- und Grün-Fall in `state/gates.md` geführt.
Der Rot-Fall ist mit einem echten Gegentest belegt
(`npm audit --omit=dev --audit-level=high` → Exit 1), nicht mit einer Annahme.

**Revidieren, wenn:** ein Befund im Produktionsbaum (`--omit=dev`) den Rang
`critical` erreicht, **oder** die Datenquellen-Migration den Abhängigkeitsbaum
ohnehin anfasst — dann fällt der Sammelbump mit einer Bewegung zusammen, die
ohnehin geprüft werden muss. Vorbedingung für Option 1 in beiden Fällen: eine
E2E-Abdeckung des Kaufpfads, und der Coverage-Provider wird im selben Schritt
wie `vitest` angehoben.

---

## Nachtrag, 29.10.2026 — die Revisionsbedingung ist eingetreten

`[Fakt]` Der CI-Lauf von PR #8 (Job 123036704469) meldete im Produktionsbaum
**zwei kritische Befunde**: `@sentry/nextjs` (Middleware-Bypass bei Nutzung der
Tunnel-Route, GHSA-mchm-gjx6-7h55) und `next` mit vier Advisories, darunter eine
unauthentifizierte Remote-Code-Ausführung in der Image-Optimization-API
(GHSA-2464-fhr4-w9xw) sowie zwei Cache-Poisoning-Befunde, die **ausdrücklich
selbst gehostete Anwendungen** nennen (GHSA-4jqv-mc3x-m676,
GHSA-mcj8-r9mp-w47p). Damit ist die erste Revisionsbedingung dieser ADR erfüllt,
wörtlich: „ein Befund im Produktionsbaum (`--omit=dev`) erreicht den Rang
`critical`".

`[Fakt]` Die Lage hat sich **ohne Änderung am Lockfile** verschoben. Am
15.10.2026 ergab dieselbe Messung 54 Befunde mit 14 high und keinem kritischen;
am 28.10.2026 waren es 67 mit 26 high und 2 critical. Die Advisory-Datenbank ist
weitergelaufen, nicht der Abhängigkeitsbaum.

**Was getan wurde — und was ausdrücklich nicht.** `[Fakt]` Behoben durch zwei
**gezielte** Aktualisierungen: `next` von 15.5.25 auf 15.5.28 und
`@sentry/nextjs` von 10.43.0 auf 10.75.2. Beide Ziele liegen **innerhalb** der
schon deklarierten Bereiche `^15.5.25` und `^10.43.0`; es war also eine
Lockfile-Aktualisierung, kein Versionssprung und keine Migration.
`[Fakt]` **Nicht** ausgeführt wurde `npm audit fix --force`, das `wagmi@3.7.9`
als Breaking Change und `next` auf 16.x gehoben hätte. `[Fakt]` **Nicht**
geändert wurde der Schwellwert des Gates; `critical` bleibt die Grenze.

`[Schlussfolgerung]` Die Option-1-Vorbedingung dieser ADR — eine E2E-Abdeckung
des Kaufpfads vor einem Sammelbump — war hier nicht einschlägig, weil kein
Sammelbump stattfand. Sie gilt unverändert für den noch offenen Rest.

**Eine Fehldiagnose auf dem Weg, als Warnung festgehalten.** `[Fakt]`
`npm audit` fasst die betroffenen Bereiche über alle Advisories eines Pakets
zusammen und meldete für `next` den Bereich `9.3.4-canary.0 - 16.3.0-preview.10`;
`npm view next version` nennt zusätzlich die global neueste Version (16.4.3).
Aus beidem zusammen entstand zunächst die Diagnose „der Fix verlangt einen
Major-Sprung auf 16". `[Fakt]` Pro Advisory betrachtet ist die höchste
verwundbare Version `15.5.27`, behoben also in `15.5.28`.
`[Schlussfolgerung]` Die zusammengefasste Bereichsangabe von `npm audit` ist
kein Hinweis darauf, welcher Sprung nötig ist. Wer sie so liest, plant eine
Migration, wo eine Patch-Version genügt. Die verwertbare Angabe steht je
Advisory in `via[].range` der JSON-Ausgabe.

**Was offen bleibt:** `[Fakt]` 53 Befunde im Produktionsbaum, davon **25 high**
und keiner kritisch. Die Zurückstellung dieser ADR beruhte auf **14** high; die
Zahl hat sich seither fast verdoppelt, ohne Zutun. Der prominenteste Befund ist
`sharp` mit geerbten libvips-CVEs (GHSA-f88m-g3jw-g9cj) — also genau der Pfad,
der die Bildoptimierung auf dem VPS fährt. `[Schlussfolgerung]` Die zweite
Revisionsbedingung („die Datenquellen-Migration fasst den Abhängigkeitsbaum
ohnehin an") ist weiterhin der vorgesehene Anlass für den Sammelbump. Dieser
Nachtrag erledigt die kritischen Befunde, nicht die Zurückstellung.
