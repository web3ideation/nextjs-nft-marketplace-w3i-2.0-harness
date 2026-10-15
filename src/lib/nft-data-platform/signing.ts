/**
 * Datei: src/lib/nft-data-platform/signing.ts
 *
 * Zweck: HMAC-Signierung der Anfragen an die NFT Data Platform. Reine
 * Funktionen, kein I/O, keine Konfiguration — damit sie gegen die Referenz der
 * Plattform Zeichen für Zeichen prüfbar sind.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/client.ts
 * - src/lib/nft-data-platform/signing.test.ts
 *
 * Wichtig:
 * - Die Regel ist nicht erfunden, sondern aus der Plattform übernommen:
 *   `packages/security/src/index.ts` (canonicalizeSignedRequest,
 *   createRequestSignature), Aufrufbeispiel `scripts/hmac-request.ts`.
 *   Belegt gegen Plattform-Commit 5dda8c7.
 * - Die kanonische Zeichenkette ist
 *   `[METHOD, pathname+search, sha256hex(body), timestamp].join("\n")`.
 *   Vier Zeilen, Reihenfolge fest. Jede Abweichung ergibt `invalid_signature`.
 * - Der LEERE Body wird gehasht, nicht übersprungen: auch ein GET trägt
 *   `sha256hex("")` in Zeile drei. Das ist die häufigste Fehlerquelle beim
 *   Nachbauen.
 * - Der Zeitstempel ist in SEKUNDEN. Die Plattform akzeptiert auch
 *   Millisekunden, aber Sekunden sind der belegte Pfad der Referenz.
 * - Die Signierung ist Single-Use. Jede Wiederholung braucht einen neuen
 *   Zeitstempel und damit eine neue Signatur (V11). Wer eine Signatur
 *   zwischenspeichert, baut den 409 ein.
 */

import { createHash, createHmac } from 'node:crypto';

/** Header-Namen der Plattform, aus packages/security/src/index.ts. */
export const PLATFORM_AUTH_HEADERS = {
    clientId: 'x-client-id',
    apiKey: 'x-api-key',
    signature: 'x-signature',
    timestamp: 'x-timestamp',
} as const;

export type SignedRequestParts = {
    /** HTTP-Methode; wird für die kanonische Zeichenkette großgeschrieben. */
    method: string;
    /** Pfad inklusive Query, also `pathname + search` — nicht die ganze URL. */
    path: string;
    /** Body als Zeichenkette, bei GET die leere Zeichenkette. */
    body: string;
    /** Unix-Zeitstempel in Sekunden, als Zeichenkette. */
    timestamp: string;
};

/**
 * Bildet den SHA-256-Hash einer Zeichenkette als Hex.
 *
 * @param input - zu hashende Zeichenkette (auch die leere)
 * @returns 64 Hex-Zeichen
 */
export function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

/**
 * Baut die kanonische Zeichenkette, über die signiert wird.
 *
 * @param parts - Methode, Pfad mit Query, Body, Zeitstempel
 * @returns die vierzeilige kanonische Zeichenkette
 */
export function canonicalizeSignedRequest(parts: SignedRequestParts): string {
    return [parts.method.toUpperCase(), parts.path, sha256Hex(parts.body), parts.timestamp].join('\n');
}

/**
 * Signiert eine kanonische Zeichenkette mit dem Secret des Clients.
 *
 * @param payload - Ergebnis von canonicalizeSignedRequest
 * @param secret - API-Secret des Clients
 * @returns HMAC-SHA256 als 64 Hex-Zeichen
 */
export function createRequestSignature(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Erzeugt einen Unix-Zeitstempel in Sekunden als Zeichenkette.
 *
 * @param nowMs - aktuelle Zeit in Millisekunden; einspeisbar für Tests
 * @returns Sekunden seit Epoche, ohne Nachkommastellen
 */
export function currentTimestampSeconds(nowMs: number = Date.now()): string {
    return Math.floor(nowMs / 1000).toString();
}

/**
 * Baut die vier Auth-Header für eine konkrete Anfrage.
 *
 * Signiert bei jedem Aufruf neu. Es gibt bewusst keine Möglichkeit, ein
 * fertiges Header-Set wiederzuverwenden — genau das erzeugt den 409.
 *
 * @param params - Anfrageteile plus Zugangsdaten
 * @returns Header-Objekt mit x-client-id, x-api-key, x-signature, x-timestamp
 */
export function buildAuthHeaders(params: {
    method: string;
    path: string;
    body: string;
    timestamp: string;
    credentials: { clientId: string; apiKey: string; apiSecret: string };
}): Record<string, string> {
    const canonicalPayload = canonicalizeSignedRequest({
        method: params.method,
        path: params.path,
        body: params.body,
        timestamp: params.timestamp,
    });

    return {
        [PLATFORM_AUTH_HEADERS.clientId]: params.credentials.clientId,
        [PLATFORM_AUTH_HEADERS.apiKey]: params.credentials.apiKey,
        [PLATFORM_AUTH_HEADERS.signature]: createRequestSignature(canonicalPayload, params.credentials.apiSecret),
        [PLATFORM_AUTH_HEADERS.timestamp]: params.timestamp,
    };
}
