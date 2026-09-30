# STATUS.md

Einzige Quelle für Phasenstand und Scope des Harness. `CLAUDE.md` und
`ARCHITECTURE.md` verweisen hierher statt den Stand zu duplizieren
(siehe `state/memory-map.md`).

## Aktuelle Phase

Die Harness-Adaption ist mit Phase 3 abgeschlossen. Laufend ist die inhaltliche
Arbeit: die Anbindung der NFT Data Platform nach
`state/plan-v1-plattform-integration.md` (Pakete A0–A10). Der Abbau der
Altpfade ist bewusst getrennt und hinter eigenen Toren:
`state/plan-v1-abbau-altpfade.md` (R0–R4).

Stand 25.09.2026: Spec v4 liegt vor, Plan v1 liegt in zwei Dateien vor, die
drei Auflagen aus Plan v1 Abschnitt 1 sind abgearbeitet (Iteration 0). Nächstes
Arbeitspaket ist **A1 — Transport und Signierung**, als Handoff-Vertrag unter
`state/tasks/`.

Ein Advisor-Pass (`architecture-advisor`) auf Plan v1 ist **nicht** gelaufen.
Die beiden Plandateien tragen zwar je ein `GO_MIT_AUFLAGEN` im Kopf, aber keinen
Nachweis, wer es vergeben hat. Wer das nachholen will, tut es vor A3 — ab dort
werden Datenformen festgeschrieben.

## Erledigt

- Phase 1: Harness-Skelett angelegt (`state/tasks/harness-phase1-skelett.md`).
- Phase 2a: `npm run check` auf grün gebracht (`state/tasks/harness-phase2a-check-gruen.md`).
- Phase 2b: `CLAUDE.md` um den Arbeitsrahmen des Harness ergänzt,
  `ARCHITECTURE.md` neu angelegt (nur belegte Konventionen), diese Datei
  angelegt (`state/tasks/harness-phase2b-anweisungsdokumente.md`).
- Phase 2c: CI-Job `build-test` → `check`, CI ruft `npm run check` statt
  Einzelschritte, Secret-Gate (`scripts/check-secrets.mjs`) in der Kette,
  gitleaks als CI-Schritt (Version gepinnt, kein Historien-Scan — begründet in
  `docs/adr/0001-kein-historien-scan.md`). Beide neuen Gates kalibriert in
  `state/gates.md` (`state/tasks/harness-phase2c-gates-scharf.md`).
- Branch Protection auf `main` gesetzt und mit Gegentest belegt — Zeile
  „Branch Protection" in `state/gates.md`.
- MongoDB-Client verzögert initialisiert, Build läuft ohne Zugangsdaten
  (`state/tasks/fix-mongodb-lazy-init.md`).
- Phase 3a: Abhängigkeits-Sanierung als belegte Entscheidung zurückgestellt
  (`docs/adr/0002-abhaengigkeiten-zurueckgestellt.md`), Dependency-Audit als
  Gate (`state/tasks/harness-phase3a-betriebsreife.md`).
- Phase 3b: Doku-Audit, Befunde in `state/repo-audit-befunde.md`; nur Klasse A
  behoben (`state/tasks/harness-phase3b-doku-sanierung.md`).

## Offen

- Doku-Befunde der Klasse B (Anweisungsdokumente, Gate-Lücken, tote Verweise
  in Altdokumenten) und die nicht geprüften Dokumente: siehe
  `state/repo-audit-befunde.md`.
- Zurückgestellte Abhängigkeits-Sanierung, Vorbehalt vor Produktivbetrieb:
  offen geführt in `state/assumption-ledger.md`.
- Rotation der mit Commit `b6e0ca8` exponierten Zugangsdaten — offen geführt
  in `state/assumption-ledger.md`.
- Fachlicher Scope (was am Marktplatz selbst gebaut wird): siehe
  `specs/marktplatz-fertigstellung.md` — Ziel, V-Aussagen, Nicht-Ziele,
  Constraints, offene Fragen stehen dort, nicht hier.
- Vorbedingungen für die Plattform-Anbindung (Paket A0): Zugangsdaten
  `alpha-read` und `alpha-ops`, ausgehende IPs für die Allowlist, erreichbare
  Plattform-Instanz, Prüfstand-Commit (V37). Ohne sie ist V11 (409/200) nicht
  abnehmbar; die Pakete selbst sind baubar. Einzelheiten im Plan, Abschnitt 3.
- Entscheidungen E1 (Befüllung des Rückfallwegs `nft_metadata`) und E2
  (Stabilitätszeitraum vor dem Abbau) sind offen und tragen die Tore T1/T2 des
  Abbauplans — definiert in `state/plan-v1-plattform-integration.md`
  Abschnitt 9. E3 (Prüfweg der Integrationstests) ist entschieden.
- Betriebliche Detailliste (Hardening, Observability, Reliability): siehe
  `docs/development/PROJECT_CHECKLIST.md`.
