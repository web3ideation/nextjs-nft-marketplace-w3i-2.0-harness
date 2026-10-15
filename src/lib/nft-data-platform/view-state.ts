/**
 * Datei: src/lib/nft-data-platform/view-state.ts
 *
 * Zweck: Der Vertrag zwischen den Plattform-Fehlern aus `errors.ts` und dem,
 * was unsere Routen antworten — plus die Liste der Datenzustände, die eine
 * Ansicht zeigen kann. Kein Mapper, keine Abbildung von Daten: nur die
 * Entscheidung, welcher Fehler welche Antwort wird.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/view-state.test.ts
 * - ab A5/A7a/A9/A11 jede migrierte Route, als einzige Stelle, an der ein
 *   Plattform-Fehler in eine HTTP-Antwort übersetzt wird
 *
 * Wichtig:
 * - **Die Übersetzung ist Daten, kein Wurf.** Die Funktion gibt ein Objekt
 *   zurück, aus dem die Route ihre Antwort baut. Eine `ApiError`-Unterklasse
 *   wäre der falsche Weg: `src/lib/api/handler.ts` reicht `details` nicht an
 *   die Antwort durch, die V5-Felder kämen also nie beim Browser an.
 * - Fünf der sieben Fehlerklassen führen auf **dieselbe** Nutzeraussage und
 *   unterscheiden sich nur in der Protokollstufe. Das ist Absicht: der Nutzer
 *   soll nicht lernen, welche unserer Zugangsdaten gerade abgelaufen sind, der
 *   Betrieb soll es sofort sehen.
 * - Die Tabelle, verbindlich aus `state/plan-v2-plattform-integration.md`
 *   (Paket A8):
 *
 *   | Fehler aus A1              | HTTP | code                      | Protokoll | Rückfall |
 *   |----------------------------|------|---------------------------|-----------|----------|
 *   | PlatformUnavailableError   | 503  | PLATFORM_UNAVAILABLE      | warn      | ja       |
 *   | PlatformTimeoutError       | 503  | PLATFORM_UNAVAILABLE      | warn      | ja       |
 *   | PlatformRateLimitError     | 503  | PLATFORM_UNAVAILABLE      | error     | ja       |
 *   | PlatformAuthError          | 503  | PLATFORM_UNAVAILABLE      | error     | ja       |
 *   | PlatformConfigError        | 503  | PLATFORM_UNAVAILABLE      | error     | ja       |
 *   | PlatformReplayError        | 500  | INTERNAL_ERROR            | error     | nein     |
 *   | PlatformResponseError      | 502  | PLATFORM_RESPONSE_INVALID | error     | nein     |
 *   | davon: httpStatus 404      | 404  | TOKEN_NOT_INDEXED         | debug     | nein     |
 *   | anderer PlatformError      | 503  | PLATFORM_UNAVAILABLE      | error     | ja       |
 *   | unbekannter Wurf           | 500  | INTERNAL_ERROR            | error     | nein     |
 *
 * - **Ein `429` der Plattform wird NIE als `429` weitergegeben.** Erschöpft ist
 *   unser Budget, nicht das des Nutzers; die Antwort wäre eine falsche Aussage
 *   über ihn. Das ist die Stelle, an der ein späterer Umbau am ehesten
 *   „aufräumt" — der Test dazu trägt die Begründung im Namen.
 * - `PlatformReplayError` nach allen Versuchen ist ein Fehler bei **uns**, keine
 *   Störung der Plattform: der Client hat eine Signatur wiederverwendet. Daher
 *   500 und kein Rückfall, der das Problem verdecken würde.
 */

import {
    isPlatformError,
    PlatformAuthError,
    PlatformConfigError,
    PlatformRateLimitError,
    PlatformReplayError,
    PlatformResponseError,
    PlatformTimeoutError,
    PlatformUnavailableError,
    PLATFORM_UNAVAILABLE,
} from '@/lib/nft-data-platform/errors';

/** Codes, die unsere Routen nach außen geben. Stabil, Oberfläche für das Frontend. */
export const PLATFORM_RESPONSE_CODES = {
    unavailable: PLATFORM_UNAVAILABLE,
    responseInvalid: 'PLATFORM_RESPONSE_INVALID',
    notIndexed: 'TOKEN_NOT_INDEXED',
    internal: 'INTERNAL_ERROR',
} as const;

export type PlatformResponseCode =
    (typeof PLATFORM_RESPONSE_CODES)[keyof typeof PLATFORM_RESPONSE_CODES];

export type PlatformFailureResponse = {
    /** Status, den unsere Route sendet — nicht der der Plattform. */
    httpStatus: number;
    code: PlatformResponseCode;
    /** Für den Nutzer, ohne Interna über Zugangsdaten oder Limits. */
    message: string;
    /** Mit welcher Stufe der Betrieb das sehen soll. */
    logLevel: 'debug' | 'warn' | 'error';
    /**
     * Darf die Route auf die lokale Quelle zurückfallen (V32)?
     *
     * Bei `PLATFORM_RESPONSE_INVALID` nein: wir wissen nicht, was wir bekommen
     * haben, und ein Rückfall würde den Fehler in gültig aussehende Daten
     * verwandeln.
     */
    allowLocalFallback: boolean;
};

/** Zustand, in dem ein Element für die Anzeige steckt. */
export type ViewDataState =
    | { kind: 'complete' }
    /** Listing aus TheGraph vorhanden, Token bei der Plattform nicht. */
    | { kind: 'listing-without-token' }
    /** Wallet-Holding vorhanden, Token bei der Plattform nicht. */
    | { kind: 'holding-without-token' }
    /** Token da, Collection-Antwort fehlt oder ist leer. */
    | { kind: 'token-without-collection' }
    /** Plattform kennt das Token nicht; `refreshQueued` sagt, ob ein Auftrag läuft. */
    | { kind: 'not-indexed'; refreshQueued: boolean }
    /** Plattform nicht ansprechbar; `fallbackUsed` sagt, ob lokal geliefert wurde. */
    | { kind: 'platform-unavailable'; fallbackUsed: boolean };

/** Antwortkörper für V5 — ein Token, das die Plattform noch nicht kennt. */
export type TokenNotIndexedPayload = {
    code: typeof PLATFORM_RESPONSE_CODES.notIndexed;
    refreshQueued: boolean;
    refreshJobId: string | null;
    contractAddress: string;
    tokenId: string;
    chainId: number;
};

const FALLBACK_MESSAGE =
    'Die NFT-Daten sind gerade nicht abrufbar. Angezeigte Angaben können veraltet sein.';

/**
 * Übersetzt einen beliebigen gefangenen Wert in die Antwortform unserer Routen.
 *
 * Nimmt `unknown` und nicht `PlatformError`, damit ein unerwarteter Wurf hier
 * landen kann statt ungefiltert beim Browser. Wirft selbst nie.
 *
 * Die Reihenfolge der Prüfungen ist bedeutsam, an zwei Stellen: der 404-Fall
 * steht vor der allgemeinen `PlatformResponseError`-Prüfung (er ist eine
 * Unterform davon), und die Blattklassen stehen vor dem abschließenden
 * `isPlatformError`-Zweig. Letzterer fängt eine künftige achte Fehlerklasse auf
 * und behandelt sie als Ausfall mit Rückfall, statt sie in den 500er-Default
 * fallen zu lassen — ein neuer Plattform-Fehler ist wahrscheinlicher ein
 * Ausfall als ein Programmierfehler bei uns.
 *
 * @param error - gefangener Wert, beliebigen Typs
 * @returns Status, Code, Meldung, Protokollstufe und Rückfall-Erlaubnis
 */
export function translatePlatformError(error: unknown): PlatformFailureResponse {
    // Die 404-Zeile der Tabelle. Sie fehlte in der ersten Fassung, und das
    // verwaiste `'debug'` in der logLevel-Union war der Beleg dafür: ein
    // Protokoll-Niveau ohne Produzenten. Folge war, dass ein nicht indiziertes
    // Token über PlatformResponseError zu 502 PLATFORM_RESPONSE_INVALID wurde —
    // ohne Rückfall, statt zu V5. Die Prüfung steht vor der allgemeinen
    // PlatformResponseError-Prüfung, weil 404 eine Unterform davon ist.
    if (error instanceof PlatformResponseError && error.httpStatus === 404) {
        return {
            httpStatus: 404,
            code: PLATFORM_RESPONSE_CODES.notIndexed,
            message: 'Dieses NFT ist noch nicht erfasst.',
            logLevel: 'debug',
            // Kein Rückfall: „noch nicht indiziert" ist kein Ausfall, sondern
            // eine Auskunft. Der Aufrufer baut daraus den V5-Antwortkörper mit
            // buildTokenNotIndexedPayload().
            allowLocalFallback: false,
        };
    }

    if (error instanceof PlatformResponseError) {
        return {
            httpStatus: 502,
            code: PLATFORM_RESPONSE_CODES.responseInvalid,
            message: 'Die NFT-Daten konnten nicht gelesen werden.',
            logLevel: 'error',
            // Kein Rückfall: eine unverständliche Antwort darf nicht als
            // gültige lokale Antwort weiterleben.
            allowLocalFallback: false,
        };
    }

    if (error instanceof PlatformReplayError) {
        return {
            httpStatus: 500,
            code: PLATFORM_RESPONSE_CODES.internal,
            message: 'Interner Fehler bei der Datenabfrage.',
            logLevel: 'error',
            allowLocalFallback: false,
        };
    }

    if (error instanceof PlatformRateLimitError) {
        return {
            httpStatus: 503,
            code: PLATFORM_RESPONSE_CODES.unavailable,
            message: FALLBACK_MESSAGE,
            // error, nicht warn: unser Budget ist erschöpft, das ist ein
            // Betriebszustand, den jemand sehen muss.
            logLevel: 'error',
            allowLocalFallback: true,
        };
    }

    if (error instanceof PlatformAuthError || error instanceof PlatformConfigError) {
        return {
            httpStatus: 503,
            code: PLATFORM_RESPONSE_CODES.unavailable,
            message: FALLBACK_MESSAGE,
            // error: abgelaufener Schlüssel, IP nicht in der Allowlist,
            // fehlender Scope, Uhrdrift oder eine fehlende Variable. Alles
            // Betriebsfehler, die ohne Zutun nicht verschwinden.
            logLevel: 'error',
            allowLocalFallback: true,
        };
    }

    if (error instanceof PlatformTimeoutError || error instanceof PlatformUnavailableError) {
        return {
            httpStatus: 503,
            code: PLATFORM_RESPONSE_CODES.unavailable,
            message: FALLBACK_MESSAGE,
            logLevel: 'warn',
            allowLocalFallback: true,
        };
    }

    // Auffangnetz für eine künftige Fehlerklasse aus errors.ts, die hier noch
    // keinen Zweig hat. Als Ausfall behandelt, nicht als internen Fehler: ein
    // neuer PlatformError beschreibt mit hoher Wahrscheinlichkeit eine Störung
    // beim Upstream, und ein Rückfall ist dann besser als eine Fehlerseite.
    // Protokollstufe error, damit die Lücke auffällt und geschlossen wird.
    if (isPlatformError(error)) {
        return {
            httpStatus: 503,
            code: PLATFORM_RESPONSE_CODES.unavailable,
            message: FALLBACK_MESSAGE,
            logLevel: 'error',
            allowLocalFallback: true,
        };
    }

    return {
        httpStatus: 500,
        code: PLATFORM_RESPONSE_CODES.internal,
        message: 'Interner Fehler bei der Datenabfrage.',
        logLevel: 'error',
        allowLocalFallback: false,
    };
}

/**
 * Baut den Antwortkörper für ein noch nicht indiziertes Token (V5).
 *
 * `refreshQueued` ist **immer** false, wenn die Collection außerhalb der
 * Diamond-Whitelist liegt: dann darf gar kein Refresh ausgelöst werden, sonst
 * zieht ein Seitenaufruf eine fremde Collection ins Indexing (V33). Die
 * Whitelist-Lesung selbst gehört nach A4a, hier kommt sie als Parameter.
 *
 * @param params - Token-Identität, Whitelist-Zugehörigkeit, optionale Job-ID
 * @returns der Antwortkörper mit genau den Feldern aus V5
 */
export function buildTokenNotIndexedPayload(params: {
    contractAddress: string;
    tokenId: string;
    chainId: number;
    isWhitelisted: boolean;
    refreshJobId?: string | null;
}): TokenNotIndexedPayload {
    const refreshQueued = params.isWhitelisted && typeof params.refreshJobId === 'string';

    return {
        code: PLATFORM_RESPONSE_CODES.notIndexed,
        refreshQueued,
        refreshJobId: refreshQueued ? (params.refreshJobId ?? null) : null,
        contractAddress: params.contractAddress,
        tokenId: params.tokenId,
        chainId: params.chainId,
    };
}
