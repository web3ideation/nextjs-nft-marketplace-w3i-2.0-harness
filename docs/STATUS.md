# STATUS.md

Einzige Quelle für Phasenstand und Scope des Harness. `CLAUDE.md` und
`ARCHITECTURE.md` verweisen hierher statt den Stand zu duplizieren
(siehe `state/memory-map.md`).

## Aktuelle Phase

Die Harness-Adaption ist mit Phase 3 abgeschlossen. Laufend ist die inhaltliche
Arbeit: die Anbindung der NFT Data Platform nach
**`state/plan-v2-plattform-integration.md`** (Pakete A0–A11). Der Abbau der
Altpfade ist bewusst getrennt und hinter eigenen Toren:
`state/plan-v1-abbau-altpfade.md` (R0–R4).

Stand 13.10.2026: Spec v4 liegt vor. Die Kette ist vollständig durchlaufen —
Plan v1 (`state/plan-v1-plattform-integration.md`, eingefroren), Advisor-Pass
(`state/advisor-findings-plattform-integration.md`, Urteil `NICHT_FREIGEGEBEN`
über den Plantext, 20 Befunde), Plan v2
(`state/plan-v2-plattform-integration.md`). **Plan v2 ist der gültige Plan.**

Paket **A1 — Transport und Signierung** ist gebaut
(`src/lib/nft-data-platform/`, `npm run check` Exit 0, 43 Tests); V11 bleibt
offen bis zum Smoke-Lauf gegen eine echte Instanz. Der Pass hat den Zuschnitt
aller übrigen Pakete geändert: A4 → A4a/A4b/A4c, A7 → A7a/A7b/A7c, A8 von
hinten nach vorn gezogen und auf einen Vertrag reduziert, A11 neu
(`/api/marketplace/items`).

**Vor dem nächsten Baudurchgang sind zwei Entscheidungen fällig**, die keinen
Code brauchen: E4 (Ort des Feature-Flags, blockiert A2) und E5
(Prüfstand-Commit V37, blockiert A3 bis A11). Beide in Plan v2 Abschnitt 6.

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
- Offene Entscheidungen, alle in `state/plan-v2-plattform-integration.md`
  Abschnitt 6: **E4** Ort des Feature-Flags (blockiert A2) · **E5**
  Prüfstand-Commit V37 (blockiert A3–A11) · **E6** `/api/marketplace/items`
  und die Suche (blockiert A9, A11; berührt R3 des Abbauplans) · **E7**
  `/api/user/nfts` (blockiert A5) · **E8** Chain- und Approval-Block
  (blockiert A7c) · **E1** Befüllung des Rückfallwegs — jetzt fällig **vor A6**
  statt vor Tor T2, und um einen dritten Weg erweitert · **E2**
  Stabilitätszeitraum, jetzt mit Messgrößen. **E3** (Prüfweg der
  Integrationstests) ist entschieden.
- Betriebliche Detailliste (Hardening, Observability, Reliability): siehe
  `docs/development/PROJECT_CHECKLIST.md`.
