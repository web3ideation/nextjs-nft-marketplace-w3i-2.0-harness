<!-- Ziel-Pfad im Repo: state/gates.md -->
# Objective Gates — nextjs-nft-marketplace-w3i-2.0

Jedes objektive (nicht-menschliche) Gate, das im Projekt läuft, mit
Kalibrierung: mindestens ein bekannter Fall, der es auslöst (rot), und
einer, der es nicht auslöst (grün). Ohne Kalibrierung ist ein Gate ein
ungeprüftes Versprechen.

| Gate | Datei | Prüft | Rot-Fall (bekannt) | Grün-Fall (bekannt) |
|---|---|---|---|---|
| Doku-Gate | `scripts/check-docs.mjs` | Doku-Verweise auf Dateien/Pfade und Versionsangaben gegen den echten Repo-Stand | 08.09.2026, vor Phase 2a: 3 Befunde — `CLAUDE.md:56` (`NextResponse.json` als vermeintlicher Dateipfad, Falschtreffer), `README.md:437` (Verweis auf nicht existierendes `src/lib/config.ts`), `CLAUDE.md:33` (Versionsnummer 20.19.0 dupliziert außerhalb der Paketdatei) | 08.09.2026, nach Phase 2a: „Keine Befunde" — README.md und CLAUDE.md korrigiert, `check-docs-ignore:`-Kommentar für den `NextResponse.json`-Falschtreffer gesetzt |
| Regel-Gate | `scripts/check-rules.mjs` | Registrierte Projektregeln gegen den Repo-Stand | noch offen — es existiert noch keine registrierte Regel, ein Rot-Fall ist damit noch nicht erzeugbar | 08.09.2026: Exit 0 mit „Keine Regeln registriert" (leerer Harness) |
| Vertrags-Gate | `scripts/check-contract.mjs` | Handoff-Verträge unter `state/tasks/` auf Vollständigkeit/Konsistenz | noch offen | 08.09.2026: „1 Vertrag/Verträge geprüft, keine Befunde" über `state/tasks/harness-phase1-skelett.md` |
| Secret-Gate | `scripts/check-secrets.mjs` | Ob eine getrackte Datei auf `.env.local` oder `.env.<irgendwas>.local` passt (reine Dateinamensprüfung über `git ls-files`, kein Inhaltsscan) | 08.09.2026, echter Gegentest: leere `.env.test.local` angelegt und mit `git add -f` getrackt → Exit 1, „✗ 1 Befund(e) — lokale Umgebungsdatei(en) unter Versionskontrolle: - .env.test.local (entfernen mit: git rm --cached .env.test.local)". Danach `git rm --cached` + Datei gelöscht | 08.09.2026: „✓ 794 getrackte Dateien geprüft, keine lokale Umgebungsdatei getrackt." → Exit 0 (Normalzustand des Repos; `.env` und die `.template`-Dateien sind absichtlich getrackt und lösen bewusst nicht aus) |
| gitleaks | `.github/workflows/ci.yml` (Schritt „Secret scan (gitleaks)"), Image `zricethezav/gitleaks:v8.30.1` | Secret-Muster im Arbeitsbaum (`detect --source /repo --no-git --redact`). Bewusst **kein** Historien-Scan — siehe `docs/adr/0001-kein-historien-scan.md`. **Wer einen Fund hier einträgt, zitiert den Fundwert NICHT** — der Scanner läuft über diese Datei und schlägt auf das Zitat genauso an wie auf das Original (belegt am 28.10.2026, siehe Log) | 08.09.2026, Positivkontrolle: Datei `gitleaks-probe.tmp.txt` mit AWS-förmigem Testmuster im Repo-Wurzelverzeichnis → Exit 1, „leaks found: 1", RuleID `aws-access-token`, Entropy 3.684184. Eine Kopie derselben Datei unter `node_modules/` wurde **nicht** gemeldet → gitignorierte Pfade sind außerhalb des Scans, der CI-Lauf nach `npm ci` verhält sich also wie der lokale. Beide Proben danach gelöscht | 08.09.2026, erster echter Lauf über das unveränderte Repo: „scan completed in 8.41s / no leaks found" → Exit 0. **Keine `.gitleaks.toml` nötig**: weder `.env` noch `.env.local.template`/`.env.production.template` haben ausgelöst, es wurde daher keine Allowlist auf Verdacht angelegt |
| Commit-Guard | Regel 1 (Hook), Zeile 150 | Commit/Push-Zugriff auf geteilte Dateien und Freigabe-/Frischefenster-Pflicht | 08.09.2026, drei belegte Fälle: (1) Bash-Zugriff auf geteilte `.claude/settings.json` via `git status && echo --- && git diff -- .claude/settings.json` → „commit-guard: Bash-Zugriff auf geteilte .claude/settings.json blockiert."; (2) `git commit`/`push` ohne `state/freigabe-commit.md` → „git commit/push ohne Freigabe-Datei (state/freigabe-commit.md) verweigert."; (3) Freigabe älter als 10 Minuten → „ist X Minuten alt (Frischefenster 10 Minuten)" [Annahme: Wortlaut aus dem Quelltext, am 08.09.2026 vom Menschen bestätigt ausgelöst; exakte Meldung beim nächsten Auftreten aus der Sitzung übernehmen] | 08.09.2026: `git add state/reibung.md && git commit …` mit frischer Freigabe → Commit `b119f6a`, Freigabedatei danach verbraucht |
| Branch Protection | keine Repo-Datei — GitHub-Ruleset auf `main` (Settings → Rules → Rulesets) | Ob direkt auf `main` gepusht werden kann und ob der Required Status Check `check` grün sein muss, bevor gemergt wird | 09.09.2026, echter Gegentest: leerer Commit direkt auf `main`, dann `git push` → abgewiesen. Wörtlich: `error: GH013: Repository rule violations found for refs/heads/main` · `- Changes must be made through a pull request.` · `- Required status check "check" is expected.` · `! [remote rejected] main -> main (push declined due to repository rule violations)`. Der Testcommit blieb lokal und wurde mit `git reset --hard origin/main` verworfen | 09.09.2026: Pull Request #1 (`harness/phase1-skelett` → `main`, 16 Commits) mit grünem `check` gemergt → Merge-Commit `e15db1d`. Erster Merge durchs Tor |
| Dependency-Audit | `.github/workflows/ci.yml` (Schritt „Dependency audit"), läuft **vor** `npm run build` | Bekannte Schwachstellen im Produktions-Abhängigkeitsbaum: `npm audit --omit=dev --audit-level=critical`. Der Schwellwert `critical` ist eine **bewusste Entscheidung**, keine Lockerung — Begründung, verworfene Optionen und Revisionsbedingung in `docs/adr/0002-abhaengigkeiten-zurueckgestellt.md` | 09.09.2026, echter Gegentest: derselbe Lauf mit abgesenktem Schwellwert, `npm audit --omit=dev --audit-level=high` → **Exit 1**, Zusammenfassung wörtlich: „54 vulnerabilities (2 low, 38 moderate, 14 high)". Die CI-Datei wurde dafür **nicht** geändert, der Schwellwert nur auf der Kommandozeile abgesenkt | 09.09.2026: `npm audit --omit=dev --audit-level=critical` → **Exit 0**, identische Zusammenfassung „54 vulnerabilities (2 low, 38 moderate, 14 high)" — **keine kritische**, deshalb grün. Ohne `--omit=dev` meldet dieselbe Messung „61 vulnerabilities (2 low, 40 moderate, 18 high, 1 critical)" → die eine kritische steckt ausschließlich in Dev-Abhängigkeiten und erreicht kein Produktionsartefakt. Am 09.09.2026 ist der Build in der CI gelaufen, der Audit-Schritt war also grün |
| Plattform-Startprüfung | `src/lib/nft-data-platform/config.ts` (`getPlatformConfig`), kalibriert durch `src/lib/nft-data-platform/config.test.ts` — läuft in `npm run check` über `test:run` | Ob bei eingeschaltetem Flag alle sieben Plattform-Pflichtvariablen gesetzt sind, und ob das Flag streng gelesen wird. **Dies ist der verbindliche Nachweis für V14**, nicht `npm run env:check` — Begründung in Entscheidung E4 (`state/plan-v2-plattform-integration.md` Abschnitt 6) | 15.10.2026, echter Testlauf: Flag an, `NFT_API_BASE_URL`, `NFT_API_READ_SECRET` und `NFT_API_OPS_KEY` entfernt → `PlatformConfigError` mit `missingVariables` genau diesen drei Namen (Test „nennt ALLE fehlenden Namen auf einmal, nicht nur den ersten"). Zweiter Rot-Fall: `NFT_API_BASE_URL=file:///etc/passwd` → Wurf mit dem Variablennamen in der Meldung. Dritter: `NFT_API_READ_KEY='   '` → gilt als fehlend | 15.10.2026, derselbe Lauf: Flag an und alle sieben gesetzt → Konfiguration wird geliefert, `isPlatformConfigured()` true. Flag aus bei vollständig gesetzten Variablen → Wurf mit leerer `missingVariables` und `isPlatformConfigured()` false (der degradierte Pfad braucht genau das). `npx vitest run src/lib/nft-data-platform` → 69 Tests grün, davon 22 in `config.test.ts` |
| `npm run env:check` | `scripts/check-env.js` | **Kein Gate, Entwicklerhilfe.** Prüft die Variablen einer lokalen **Datei** (`.env.local` bzw. `.env.production.local`), seit 15.10.2026 mit einer bedingten Gruppe: ist `NFT_DATA_PLATFORM_ENABLED` in dieser Datei an, sind die sieben Plattform-Variablen Pflicht; `REDIS_SSE_CHANNEL` ist unbedingt Pflicht (V64); ein `NEXT_PUBLIC_`-Spiegel einer `NFT_API_*`-Variablen ist ein Fehler (V14) | 15.10.2026, Beobachtung in dieser Arbeitskopie: `npm run env:check` → Exit 1 mit „.env.local not found!" — **das Skript bricht ab, bevor es eine einzige Variable geprüft hat**. Genau das ist die Geltungsgrenze aus Advisor-Befund 14: in einer Umgebung, in der der Hoster die Variablen in den Prozess injiziert, existiert diese Datei nicht. Ein Rot-Fall der bedingten Gruppe selbst ist hier **nicht erzeugt** worden, weil dafür eine `.env.local` angelegt werden müsste und jeder Zugriff auf `.env*` durch die Deny-Rules blockiert ist | **noch offen** — ein grüner Lauf setzt eine vorhandene `.env.local` voraus. Bewusst nicht in `npm run check` aufgenommen: in der CI gibt es keine solche Datei, das Gate wäre dauerhaft rot. Deshalb steht der verbindliche Nachweis eine Zeile höher |

## Kalibrierungs-Log

Neue Kalibrierungs-Nachweise hier ergänzen (Datum, Gate, Beobachtung),
nicht die Tabelle oben stillschweigend überschreiben.

- 08.09.2026 — Doku-Gate: Rot-Kalibrierung aus der Phase-1-Baseline
  (`state/phase1-check-baseline.txt`) übernommen, drei Befunde behoben
  (README.md:437, CLAUDE.md:56, CLAUDE.md:33). Grün-Fall durch erneuten
  Lauf von `node scripts/check-docs.mjs` nach den Korrekturen belegt.
  Regel-Gate bleibt ohne Rot-Fall, da noch keine Regel registriert ist —
  vermerkt statt erfunden. Vertrags-Gate-Rot-Fall und Commit-Guard-
  Frischefenster-Wortlaut bleiben offen bzw. als Annahme markiert, bis sie
  real ausgelöst und aus der Sitzung übernommen werden.

- 08.09.2026 — Phase 2c: Secret-Gate (`scripts/check-secrets.mjs`) neu in die
  `check`-Kette aufgenommen, direkt nach dem Vertrags-Gate. Rot-Fall durch einen
  echten Gegentest belegt (erzwungen getrackte `.env.test.local`), nicht durch
  Annahme. gitleaks als CI-Schritt ergänzt und **vor** dem Einbau einmal lokal
  gefahren: über das unveränderte Repo grün, kein Befund in `.env` oder den
  `.template`-Dateien — deshalb ausdrücklich keine Allowlist und keine
  `.gitleaks.toml`. Dass der grüne Lauf kein Falsch-Grün ist, wurde mit einer
  Positivkontrolle geprüft (Testmuster wird gefunden). Der CI-Jobname heißt ab
  jetzt `check` statt `build-test`, damit der Required Status Check denselben
  Namen trägt wie die Prüfkette. Branch Protection selbst ist noch offen — sie
  wird vom Menschen im Browser gesetzt, der Gegentest dazu gehört danach hierher.

- 09.09.2026 — Branch Protection: Ruleset für `main` im GitHub-Browser gesetzt
  (Require pull request, Require status checks to pass mit `check`, Require
  branches to be up to date, Restrict deletions, Block force pushes;
  Enforcement aktiv, Bypass-Liste leer). Die Wirksamkeit wurde nicht am
  Formular abgelesen, sondern durch einen Gegentest belegt: der Push eines
  leeren Commits auf `main` wurde abgewiesen, und die Meldung nannte beide
  Regeln namentlich. Damit ist zugleich belegt, dass `check` tatsächlich als
  Required Status Check eingetragen ist und nicht nur die Checkbox gesetzt war
  — der Fall, in dem eine Regel beschriftet, aber wirkungslos ist. Grün-Fall
  ist der Merge von Pull Request #1.
  Besonderheit gegenüber allen anderen Gates dieser Tabelle: dieses Gate liegt
  nicht im Repo. Es steht nur in den GitHub-Einstellungen, taucht in keinem
  Diff auf, kommt bei einem Klon nicht mit und lässt sich von jedem mit
  Admin-Rechten stillschweigend ändern. Sein Zustand ist nur durch
  Wiederholung des Gegentests prüfbar. Ob und in welchem Abstand das geschehen
  soll, ist offen.
- 09.09.2026 — Phase 3a: Dependency-Audit als achtes Gate in die Tabelle
  aufgenommen. Er lief seit dem 08.09.2026 in der CI, stand aber in keiner
  Zeile dieser Datei — ein laufendes Gate ohne Kalibrierung. Grün-Fall aus dem
  CI-Schwellwert `critical` (Exit 0), Rot-Fall durch einen echten Gegentest mit
  abgesenktem Schwellwert `high` (Exit 1) belegt, nicht durch Annahme. Beide
  Läufe melden dieselbe Zusammenfassung — der Unterschied liegt allein im
  Schwellwert, nicht im Befundstand. Damit ist belegt, dass das Gate bei einem
  kritischen Befund im Produktionsbaum auslösen würde und nicht bloß deshalb
  grün ist, weil es nichts prüft. Die CI-Datei wurde dafür nicht angefasst; der
  Schwellwert selbst ist in `docs/adr/0002-abhaengigkeiten-zurueckgestellt.md`
  als Entscheidung belegt, samt der ausdrücklichen Feststellung, dass die 14
  High-Befunde damit nicht für harmlos erklärt sind.

- 15.10.2026 — Paket A2: Zwei Zeilen ergänzt, und zwar absichtlich zwei statt
  einer. Die **Plattform-Startprüfung** (`getPlatformConfig`) ist der
  verbindliche Nachweis für V14 und vollständig kalibriert — Rot und Grün
  stammen aus einem echten Lauf von `config.test.ts` (22 Tests), nicht aus
  einer Annahme. `npm run env:check` steht daneben als **Nicht-Gate**, weil
  Advisor-Befund 14 belegt hat, dass es eine Datei prüft und in der
  Zielumgebung deshalb nichts aussagt; sein Rot-Fall in dieser Arbeitskopie
  („.env.local not found", Abbruch vor der ersten Prüfung) führt genau das vor.
  Der Rot-Fall der neuen bedingten Gruppe ist **nicht** erzeugt und als offen
  vermerkt, statt ihn zu behaupten: dafür müsste eine `.env.local` angelegt
  werden, und jeder Zugriff auf `.env*` ist durch die Deny-Rules blockiert.
  Wer das nachholen will, legt lokal eine `.env.local` mit
  `NFT_DATA_PLATFORM_ENABLED=true` und einer fehlenden `NFT_API_*`-Variablen
  an, fährt `npm run env:check` und trägt den Wortlaut hier ein.

- 28.10.2026 — gitleaks, **erster echter Rot-Fall und erster Grün-Nachweis**
  (bisher war nur eine absichtliche Probe kalibriert). Zwei Läufe, und der
  zweite ist der interessante.

  **Rot, Lauf 1** (PR #8, Job 122868365906): fünf Befunde, alle RuleID
  `generic-api-key`, alle in Testdateien der Plattform-Schicht — viermal ein
  Wert, der an `NFT_API_OPS_KEY` zugewiesen wurde (Entropie 3.664498) in
  `src/app/api/nft/detail/route.test.ts`, `…/config.test.ts`,
  `…/read.test.ts`, `…/client.test.ts`, dazu einmal ein an `apiKey`
  zugewiesener Wert (Entropie 3.750000) in `…/signing.test.ts`. Exit 1,
  „leaks found: 5". **Keiner war ein Secret** — erfundene Attrappen; die Regel
  schlägt auf den Variablennamen plus Entropie an, nicht auf echte Herkunft.

  **Behoben durch Entschärfen der Attrappen, nicht durch eine Allowlist.** Die
  Werte sind jetzt sieben bis acht Zeichen lang mit Entropie um 2,8 und liegen
  damit unter Längen- und Entropieschwelle der Regel. Eine `.gitleaks.toml` mit
  einer Ausnahme für Testdateien wäre der bequemere Weg gewesen und hätte das
  Gate dauerhaft geschwächt: sie würde auch ein echtes Leck in einer Testdatei
  durchlassen. Die Entscheidung von Phase 2c, **keine** Allowlist auf Verdacht
  anzulegen, bleibt unangetastet.

  **Grün für die Testdateien, Lauf 2** (Job 122880365928): die fünf Befunde
  sind weg. Damit ist die offene Unsicherheit des ersten Eintrags aufgelöst —
  lokal war sie nicht prüfbar, weil der Docker-Daemon auf dem
  Entwicklungsrechner nicht lief.

  **Rot, Lauf 2, aus eigener Hand:** derselbe Lauf meldete zwei neue Befunde —
  in **dieser Datei**, Zeilen 96 und 101. Der erste Eintrag hatte die
  Fundwerte **wörtlich zitiert**, um den Vorfall zu dokumentieren. Entropie und
  Regel sind dieselben; dem Scanner ist gleichgültig, dass der Wert in einem
  Protokoll steht und nicht in Code.

  **Die Lehre, und sie ist allgemein:** Einen Secret-Scanner-Befund zu
  dokumentieren, indem man ihn zitiert, löst den Scanner erneut aus. Ein
  Kalibrierungs-Log braucht Regel, Entropie, Datei, Zeile und Ursache — den
  Wortlaut des Fundes braucht es nicht, und er ist genau der Teil, der wieder
  anschlägt. Dieser Eintrag nennt deshalb keinen einzigen Fundwert mehr.
  `[Schlussfolgerung]` Dieselbe Falle steht jedem bevor, der einen künftigen
  Fund hier einträgt — deshalb steht sie oben in der Zeile zu gitleaks als
  Hinweis, nicht nur hier im Log.
