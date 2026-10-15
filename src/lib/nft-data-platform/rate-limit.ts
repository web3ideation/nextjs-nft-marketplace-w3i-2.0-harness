/**
 * Datei: src/lib/nft-data-platform/rate-limit.ts
 *
 * Zweck: Zwei Bremsen vor dem Fensterlimit der NFT Data Platform, getrennt je
 * Zugangsdatensatz: ein mitgeführtes Budget aus den Antwort-Headern (V34) und
 * ein Nebenläufigkeitsdeckel als Warteschlange.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/client.ts
 * - src/lib/nft-data-platform/client.test.ts
 *
 * Wichtig:
 * - Die Plattform hängt `x-ratelimit-limit` und `x-ratelimit-remaining` NUR an
 *   Antworten, deren Authentifizierung durchlief (apps/web/src/lib/api-auth.ts,
 *   Zeilen 170 und 232). Ein 429 trägt sie nicht, ein `Retry-After` setzt die
 *   Plattform nirgends. Die Auslastung ist deshalb nur aus Erfolgsantworten
 *   messbar, und die Wartezeit nach einem 429 muss der Client selbst bestimmen.
 * - Daraus folgt die Gewichtung: der Deckel ist die Hauptmaßnahme, der Backoff
 *   der Notnagel. Wer erst am 429 merkt, dass das Fenster voll ist, hat die
 *   Anfrage schon verloren.
 * - Warum 8 gleichzeitige Anfragen für `read`: 600 pro Minute sind 10 pro
 *   Sekunde. Bei 8 gleichzeitigen müsste jede einzelne unter 800 ms liegen, um
 *   das Fenster überhaupt zu füllen. Der Deckel bremst also erst, wenn die
 *   Plattform ohnehin langsamer antwortet als das Limit erlaubt — und genau dann
 *   soll er bremsen. Für `ops` (30/min) ist 2 die entsprechende Größe.
 * - Die Zählung der Plattform läuft in festen 60-Sekunden-Fenstern (Spec V34).
 *   An der Fenstergrenze sind kurzzeitig bis 1200 Anfragen möglich, danach ein
 *   harter Stopp. Der Deckel allein verhindert das nicht — er macht es nur
 *   unwahrscheinlich. Deshalb zusätzlich die Sperre bis zur nächsten
 *   Fenstergrenze, sobald ein 429 aufgetreten ist.
 * - Der Zustand liegt im Prozess. Läuft die App in mehreren Instanzen, zählt
 *   jede für sich; das echte Limit gilt aber je Client über alle Instanzen.
 *   Das ist bewusst offen gelassen: die Messung aus V34 soll erst zeigen, ob es
 *   ein Problem ist, bevor ein gemeinsamer Zähler dazukommt. Web und Worker
 *   sind dabei schon heute zwei Prozesse mit demselben `read`-Datensatz, es ist
 *   also kein Sonderfall — geführt in `state/assumption-ledger.md` (13.10.2026).
 * - Deshalb zählt dieses Modul zusätzlich die EIGENEN gesendeten Anfragen im
 *   laufenden Fenster (`sentInWindow`). Das ist die Gegenprobe zu `remaining`:
 *   `remaining` ist die globale Wahrheit über alle Instanzen, `sentInWindow` der
 *   eigene Anteil. Fällt `remaining` schneller als `sentInWindow` steigt, ist
 *   ein anderer Prozess laut — ohne die Gegenzahl sind die beiden Fälle nicht
 *   zu unterscheiden, und V34 wäre nach dem Umschalten nicht auswertbar.
 *   Gezählt werden **Versuche**, nicht Erfolge, weil die Plattform ebenfalls
 *   Versuche zählt.
 */

import { logger } from '@/lib/logger';
import type { CredentialKind } from '@/lib/nft-data-platform/config';

/** Länge des Zählfensters der Plattform in Millisekunden. */
const WINDOW_MS = 60_000;

/** Sicherheitsabstand, damit wir nicht auf die Millisekunde der Grenze treffen. */
const WINDOW_EDGE_MARGIN_MS = 250;

export type RateLimitSnapshot = {
    /** Zuletzt gemeldetes Fensterlimit, oder null wenn noch nichts gemeldet wurde. */
    limit: number | null;
    /** Zuletzt gemeldetes Restbudget. */
    remaining: number | null;
    /** Wann das gemeldet wurde. */
    observedAtMs: number | null;
    /** Bis wann keine Anfrage gesendet werden darf, oder null. */
    blockedUntilMs: number | null;
    /** Wie viele Anfragen dieses Datensatzes gerade laufen. */
    active: number;
    /** Wie viele auf einen Platz warten. */
    queued: number;
    /** Eigene gesendete Versuche im laufenden 60-Sekunden-Fenster. */
    sentInWindow: number;
};

type CredentialState = {
    limit: number | null;
    remaining: number | null;
    observedAtMs: number | null;
    blockedUntilMs: number | null;
    active: number;
    waiters: Array<() => void>;
    sentInWindow: number;
    /** Beginn des Fensters, in dem `sentInWindow` gezählt wird. */
    windowStartMs: number | null;
};

function createState(): CredentialState {
    return {
        limit: null,
        remaining: null,
        observedAtMs: null,
        blockedUntilMs: null,
        active: 0,
        waiters: [],
        sentInWindow: 0,
        windowStartMs: null,
    };
}

const states: Record<CredentialKind, CredentialState> = {
    read: createState(),
    ops: createState(),
};

/**
 * Liest eine Header-Zahl, ohne bei Unsinn zu werfen.
 *
 * @param raw - Header-Wert oder null
 * @returns die Zahl, oder null wenn der Header fehlt oder keine Zahl ist
 */
function parseHeaderInt(raw: string | null): number | null {
    if (raw === null || raw.trim() === '') {
        return null;
    }

    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Zählt einen eigenen Sendeversuch im laufenden Fenster.
 *
 * Das Fenster läuft in denselben festen 60-Sekunden-Schritten wie das der
 * Plattform (abgeleitet aus der Systemuhr, V16), damit die eigene Zahl und das
 * gemeldete `remaining` sich auf dasselbe Fenster beziehen. Beim Wechsel der
 * Fenstergrenze beginnt die Zählung bei eins, nicht bei null — der Versuch, der
 * den Wechsel auslöst, gehört ins neue Fenster.
 *
 * @param kind - betroffener Zugangsdatensatz
 * @param nowMs - aktuelle Zeit; einspeisbar für Tests
 * @returns die Zahl der Versuche im laufenden Fenster, diesen eingeschlossen
 */
export function recordRequestSent(kind: CredentialKind, nowMs: number = Date.now()): number {
    const state = states[kind];
    const windowStart = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;

    if (state.windowStartMs !== windowStart) {
        state.windowStartMs = windowStart;
        state.sentInWindow = 0;
    }

    state.sentInWindow += 1;
    return state.sentInWindow;
}

/**
 * Übernimmt die Rate-Limit-Header einer Erfolgsantwort in das Budget und
 * protokolliert die Auslastung (V34).
 *
 * @param kind - welcher Zugangsdatensatz geantwortet hat
 * @param headers - Header der Antwort
 * @param nowMs - aktuelle Zeit; einspeisbar für Tests
 * @returns nichts
 */
export function recordRateLimitHeaders(kind: CredentialKind, headers: Headers, nowMs: number = Date.now()): void {
    const limit = parseHeaderInt(headers.get('x-ratelimit-limit'));
    const remaining = parseHeaderInt(headers.get('x-ratelimit-remaining'));

    if (limit === null && remaining === null) {
        return;
    }

    const state = states[kind];
    state.limit = limit ?? state.limit;
    state.remaining = remaining ?? state.remaining;
    state.observedAtMs = nowMs;

    // Sobald wieder Budget gemeldet wird, ist eine frühere Sperre gegenstandslos.
    if (remaining !== null && remaining > 0) {
        state.blockedUntilMs = null;
    }

    if (state.limit !== null && state.remaining !== null) {
        const used = state.limit - state.remaining;
        const usedShare = state.limit === 0 ? 0 : used / state.limit;

        logger.debug(
            {
                credentials: kind,
                limit: state.limit,
                remaining: state.remaining,
                usedShare,
                sentInWindow: state.sentInWindow,
            },
            'nft_data_platform_rate_limit'
        );

        // Ab 80 Prozent ist die Messung aus V34 eine Warnung wert: dann liegt
        // der Startwert 600 zu niedrig oder ein Aufrufer fragt zu oft.
        if (usedShare >= 0.8) {
            logger.warn(
                {
                    credentials: kind,
                    limit: state.limit,
                    remaining: state.remaining,
                    usedShare,
                    sentInWindow: state.sentInWindow,
                },
                'nft_data_platform_rate_limit_high'
            );
        }
    }
}

/**
 * Sperrt den Zugangsdatensatz bis zur nächsten Fenstergrenze, nachdem ein 429
 * aufgetreten ist.
 *
 * Die Grenze wird gerechnet, nicht abgelesen: die Plattform schickt bei einem
 * 429 weder Restbudget noch `Retry-After`. Grundlage ist die synchrone
 * Systemuhr (V16) und das feste 60-Sekunden-Fenster.
 *
 * @param kind - betroffener Zugangsdatensatz
 * @param nowMs - aktuelle Zeit; einspeisbar für Tests
 * @returns der Zeitpunkt, bis zu dem gesperrt ist
 */
export function markWindowExhausted(kind: CredentialKind, nowMs: number = Date.now()): number {
    const nextBoundary = Math.ceil(nowMs / WINDOW_MS) * WINDOW_MS + WINDOW_EDGE_MARGIN_MS;
    const state = states[kind];

    state.remaining = 0;
    state.blockedUntilMs = nextBoundary;

    logger.warn(
        { credentials: kind, blockedForMs: nextBoundary - nowMs },
        'nft_data_platform_rate_limit_exhausted'
    );

    return nextBoundary;
}

/**
 * Sagt, wie lange vor dem nächsten Versuch gewartet werden muss.
 *
 * @param kind - betroffener Zugangsdatensatz
 * @param nowMs - aktuelle Zeit; einspeisbar für Tests
 * @returns Wartezeit in Millisekunden, 0 wenn nicht gesperrt
 */
export function getRateLimitWaitMs(kind: CredentialKind, nowMs: number = Date.now()): number {
    const blockedUntilMs = states[kind].blockedUntilMs;

    if (blockedUntilMs === null || blockedUntilMs <= nowMs) {
        return 0;
    }

    return blockedUntilMs - nowMs;
}

/**
 * Belegt einen Platz im Nebenläufigkeitsdeckel und gibt die Freigabefunktion
 * zurück.
 *
 * Die Freigabe ist idempotent: zweimal aufgerufen gibt sie nur einen Platz
 * frei. Ohne das würde ein doppeltes `finally` den Deckel aufweichen.
 *
 * @param kind - betroffener Zugangsdatensatz
 * @param capacity - erlaubte Zahl gleichzeitiger Anfragen
 * @returns Funktion, die den Platz freigibt
 */
export async function acquireSlot(kind: CredentialKind, capacity: number): Promise<() => void> {
    const state = states[kind];

    if (state.active >= capacity) {
        await new Promise<void>((resolve) => {
            state.waiters.push(resolve);
        });
    }

    state.active += 1;
    let released = false;

    return function release(): void {
        if (released) {
            return;
        }

        released = true;
        state.active -= 1;

        const next = state.waiters.shift();
        if (next !== undefined) {
            next();
        }
    };
}

/**
 * Liefert den aktuellen Zustand eines Zugangsdatensatzes.
 *
 * @param kind - betroffener Zugangsdatensatz
 * @returns Momentaufnahme von Budget und Warteschlange
 */
export function getRateLimitSnapshot(kind: CredentialKind): RateLimitSnapshot {
    const state = states[kind];

    return {
        limit: state.limit,
        remaining: state.remaining,
        observedAtMs: state.observedAtMs,
        blockedUntilMs: state.blockedUntilMs,
        active: state.active,
        queued: state.waiters.length,
        sentInWindow: state.sentInWindow,
    };
}

/**
 * Setzt den Zustand beider Zugangsdatensätze zurück.
 *
 * Gedacht für Tests. Im laufenden Betrieb gibt es keinen Grund, ein Budget zu
 * vergessen.
 *
 * @returns nichts
 */
export function resetRateLimitState(): void {
    states.read = createState();
    states.ops = createState();
}
