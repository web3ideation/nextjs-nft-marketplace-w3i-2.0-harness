/**
 * Datei: src/lib/nft-data-platform/errors.ts
 *
 * Zweck: Fehlerklassen für den Verkehr mit der NFT Data Platform und die
 * Normalisierung einer Fehlerantwort in genau eine dieser Klassen.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/client.ts
 * - src/lib/nft-data-platform/config.ts
 * - später die migrierten Routen (A5–A9), die diese Fehler in eigene
 *   HTTP-Antworten übersetzen
 *
 * Wichtig:
 * - Diese Klassen erben ABSICHTLICH nicht von `ApiError` aus src/lib/api/errors.ts.
 *   Ein `ApiError` beschreibt, was wir unserem Browser antworten; ein
 *   `PlatformError` beschreibt, was der Upstream gesagt hat. Würde ein `429` der
 *   Plattform als `ApiError(429)` durchgereicht, behauptete unsere Antwort, der
 *   Nutzer habe zu viel angefragt — dabei hat unser Server-Client das Limit
 *   ausgeschöpft. Die Übersetzung ist Sache der aufrufenden Route.
 * - `retryable` heißt: eine NEU SIGNIERTE Wiederholung kann anders ausgehen.
 *   Bei 401/403 kann sie es nicht — ein fehlender Scope wird durch eine frische
 *   Signatur nicht mehr.
 */

import { z } from 'zod';

/** Stabiler Code für den degradierten Pfad (V32, A8). */
export const PLATFORM_UNAVAILABLE = 'PLATFORM_UNAVAILABLE' as const;

/**
 * Basisklasse aller Plattform-Fehler.
 *
 * `platformCode` ist der Wert, den die Plattform im Feld `error` geschickt hat
 * (z. B. `replayed_request`), nicht unser eigener Code.
 */
export class PlatformError extends Error {
    public readonly httpStatus: number | null;
    public readonly platformCode: string | null;
    public readonly retryable: boolean;

    constructor(
        message: string,
        options: { httpStatus?: number | null; platformCode?: string | null; retryable?: boolean } = {}
    ) {
        super(message);
        this.name = 'PlatformError';
        this.httpStatus = options.httpStatus ?? null;
        this.platformCode = options.platformCode ?? null;
        this.retryable = options.retryable ?? false;
    }
}

/** Eine Pflicht-Umgebungsvariable fehlt oder ist unbrauchbar. */
export class PlatformConfigError extends PlatformError {
    public readonly missingVariables: readonly string[];

    constructor(message: string, missingVariables: readonly string[] = []) {
        super(message, { retryable: false });
        this.name = 'PlatformConfigError';
        this.missingVariables = missingVariables;
    }
}

/**
 * 401 oder 403: Header fehlen, Schlüssel unbekannt, IP nicht erlaubt,
 * Zeitstempel zu alt, Signatur falsch oder Scope fehlt.
 *
 * Nicht wiederholbar. Ausnahme mit Absicht: `stale_timestamp` wird vom Client
 * ebenfalls nicht wiederholt — wenn unsere Uhr um mehr als 300 Sekunden
 * abweicht (V16), hilft ein zweiter Versuch nicht, sondern nur ein Alarm.
 */
export class PlatformAuthError extends PlatformError {
    constructor(message: string, httpStatus: number, platformCode: string | null) {
        super(message, { httpStatus, platformCode, retryable: false });
        this.name = 'PlatformAuthError';
    }
}

/**
 * 409 `replayed_request`: dieselbe Signatur wurde im Replay-Fenster schon
 * benutzt. Kein endgültiger Fehler (V11) — eine neu signierte Wiederholung ist
 * der vorgesehene Weg.
 */
export class PlatformReplayError extends PlatformError {
    constructor(message: string) {
        super(message, { httpStatus: 409, platformCode: 'replayed_request', retryable: true });
        this.name = 'PlatformReplayError';
    }
}

/** 429: Fensterlimit des Clients erschöpft. Wiederholbar, aber erst nach Wartezeit. */
export class PlatformRateLimitError extends PlatformError {
    constructor(message: string, platformCode: string | null) {
        super(message, { httpStatus: 429, platformCode, retryable: true });
        this.name = 'PlatformRateLimitError';
    }
}

/**
 * 5xx oder Netzfehler: die Plattform ist nicht ansprechbar.
 *
 * Trägt zusätzlich den stabilen Code `PLATFORM_UNAVAILABLE`, weil der
 * degradierte Pfad (V32) und die Anzeige (A8) daran hängen.
 */
export class PlatformUnavailableError extends PlatformError {
    public readonly code = PLATFORM_UNAVAILABLE;

    constructor(message: string, httpStatus: number | null, platformCode: string | null) {
        super(message, { httpStatus, platformCode, retryable: true });
        this.name = 'PlatformUnavailableError';
    }
}

/** Die Anfrage lief in den Timeout. Wiederholbar — mit frischer Signatur. */
export class PlatformTimeoutError extends PlatformError {
    public readonly timeoutMs: number;

    constructor(message: string, timeoutMs: number) {
        super(message, { retryable: true });
        this.name = 'PlatformTimeoutError';
        this.timeoutMs = timeoutMs;
    }
}

/**
 * Alles Übrige: ein 4xx, das keine der obigen Klassen trifft, oder eine Antwort,
 * die kein JSON ist. Nicht wiederholbar — die Anfrage selbst ist falsch.
 */
export class PlatformResponseError extends PlatformError {
    constructor(message: string, httpStatus: number | null, platformCode: string | null) {
        super(message, { httpStatus, platformCode, retryable: false });
        this.name = 'PlatformResponseError';
    }
}

/**
 * Prüft, ob ein unbekannter Wert ein Plattform-Fehler ist.
 *
 * @param error - beliebiger gefangener Wert
 * @returns true, wenn es sich um einen PlatformError handelt
 */
export function isPlatformError(error: unknown): error is PlatformError {
    return error instanceof PlatformError;
}

/**
 * Form der Fehlerantwort der Plattform.
 *
 * Belegt gegen apps/web/src/lib/api-response.ts (buildApiErrorResponse):
 * `{ ok: false, error: <code>, message?: <text> }`. Der Code steht im Feld
 * `error` — nicht in `code`, wie man erwarten würde.
 */
const platformFailureBodySchema = z.object({
    error: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
});

/**
 * Übersetzt eine Fehlerantwort der Plattform in genau eine Fehlerklasse.
 *
 * Wirft selbst nie: ein unlesbarer oder fremder Body führt zu einem Fehler mit
 * `platformCode: null`, nicht zu einem zweiten Absturz an der Stelle, an der
 * gerade der erste behandelt wird.
 *
 * @param httpStatus - Statuscode der Antwort
 * @param body - bereits geparster Body, oder null wenn er nicht lesbar war
 * @returns der passende PlatformError
 */
export function normalizePlatformFailure(httpStatus: number, body: unknown): PlatformError {
    const parsed = platformFailureBodySchema.safeParse(body);
    const platformCode = parsed.success ? (parsed.data.error ?? null) : null;
    const upstreamMessage = parsed.success ? parsed.data.message : undefined;
    const detail = upstreamMessage ?? `HTTP ${httpStatus}`;
    const label = platformCode === null ? detail : `${platformCode}: ${detail}`;

    if (httpStatus === 401 || httpStatus === 403) {
        return new PlatformAuthError(`Plattform lehnt die Anfrage ab (${label})`, httpStatus, platformCode);
    }

    if (httpStatus === 409 && platformCode === 'replayed_request') {
        return new PlatformReplayError(`Signatur bereits verwendet (${label})`);
    }

    if (httpStatus === 429) {
        return new PlatformRateLimitError(`Fensterlimit erschöpft (${label})`, platformCode);
    }

    if (httpStatus >= 500) {
        return new PlatformUnavailableError(`Plattform nicht ansprechbar (${label})`, httpStatus, platformCode);
    }

    return new PlatformResponseError(`Plattform antwortet mit Fehler (${label})`, httpStatus, platformCode);
}
