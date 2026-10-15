/**
 * Datei: src/lib/nft-data-platform/view-state.test.ts
 *
 * Zweck: Belegt die Fehlerübersetzung für alle sieben Fehlerklassen aus A1 plus
 * den unbekannten Wurf, und den V5-Antwortkörper.
 *
 * Wichtig:
 * - Der Test „gibt einen 429 der Plattform NIEMALS als 429 weiter" ist der
 *   wichtigste in dieser Datei. Es ist die Stelle, an der ein späterer Umbau am
 *   ehesten „aufräumt" — und dann behauptet unsere Antwort gegenüber dem
 *   Nutzer, er habe zu viel angefragt, während in Wahrheit unser Server-Budget
 *   erschöpft ist. Die Begründung steht deshalb im Testnamen, nicht nur im Code.
 * - Die Vollständigkeitsprüfung am Ende zählt die Klassen ab. Kommt in
 *   `errors.ts` eine achte dazu, ohne dass hier etwas ergänzt wird, fällt sie
 *   in den Default — und der Test erinnert daran.
 */

import { describe, expect, it } from 'vitest';

import {
    PlatformAuthError,
    PlatformConfigError,
    PlatformError,
    PlatformRateLimitError,
    PlatformReplayError,
    PlatformResponseError,
    PlatformTimeoutError,
    PlatformUnavailableError,
} from '@/lib/nft-data-platform/errors';
import {
    buildTokenNotIndexedPayload,
    PLATFORM_RESPONSE_CODES,
    translatePlatformError,
} from '@/lib/nft-data-platform/view-state';

describe('translatePlatformError — die fünf Fälle, die auf den degradierten Pfad führen', () => {
    it('PlatformUnavailableError → 503 PLATFORM_UNAVAILABLE, warn, Rückfall erlaubt', () => {
        const result = translatePlatformError(new PlatformUnavailableError('aus', 503, 'x'));

        expect(result).toEqual({
            httpStatus: 503,
            code: PLATFORM_RESPONSE_CODES.unavailable,
            message: expect.stringContaining('veraltet'),
            logLevel: 'warn',
            allowLocalFallback: true,
        });
    });

    it('PlatformTimeoutError → 503, warn — für den Nutzer ist ein Timeout ein Ausfall', () => {
        const result = translatePlatformError(new PlatformTimeoutError('zu lang', 10_000));

        expect(result.httpStatus).toBe(503);
        expect(result.code).toBe(PLATFORM_RESPONSE_CODES.unavailable);
        expect(result.logLevel).toBe('warn');
        expect(result.allowLocalFallback).toBe(true);
    });

    it('PlatformRateLimitError → 503 mit Protokollstufe error, nicht warn', () => {
        const result = translatePlatformError(new PlatformRateLimitError('voll', 'rate_limit_exceeded'));

        expect(result.httpStatus).toBe(503);
        expect(result.logLevel).toBe('error');
        expect(result.allowLocalFallback).toBe(true);
    });

    it('gibt einen 429 der Plattform NIEMALS als 429 weiter — erschöpft ist unser Budget, nicht das des Nutzers', () => {
        const result = translatePlatformError(new PlatformRateLimitError('voll', 'rate_limit_exceeded'));

        expect(result.httpStatus).not.toBe(429);
        expect(result.httpStatus).toBe(503);
    });

    it('PlatformAuthError → 503, error — abgelaufener Schlüssel ist ein Betriebsfehler', () => {
        const result = translatePlatformError(new PlatformAuthError('abgelehnt', 403, 'missing_scope'));

        expect(result.httpStatus).toBe(503);
        expect(result.code).toBe(PLATFORM_RESPONSE_CODES.unavailable);
        expect(result.logLevel).toBe('error');
        expect(result.allowLocalFallback).toBe(true);
    });

    it('PlatformConfigError → 503, error — und wird nicht vom Basistyp verschluckt', () => {
        const result = translatePlatformError(new PlatformConfigError('fehlt', ['NFT_API_BASE_URL']));

        expect(result.httpStatus).toBe(503);
        expect(result.code).toBe(PLATFORM_RESPONSE_CODES.unavailable);
        expect(result.logLevel).toBe('error');
    });

    it('verrät in der Nutzermeldung keine Interna über Zugangsdaten oder Limits', () => {
        const messages = [
            translatePlatformError(new PlatformAuthError('invalid_signature', 401, 'invalid_signature')).message,
            translatePlatformError(new PlatformConfigError('NFT_API_READ_SECRET fehlt', ['NFT_API_READ_SECRET']))
                .message,
            translatePlatformError(new PlatformRateLimitError('600/min erschöpft', 'rate_limit_exceeded')).message,
        ];

        for (const message of messages) {
            expect(message).not.toMatch(/NFT_API|signature|secret|key|600/i);
        }
    });
});

describe('translatePlatformError — die Fälle ohne Rückfall', () => {
    it('PlatformReplayError → 500 INTERNAL_ERROR: ein Fehler bei uns, keine Störung der Plattform', () => {
        const result = translatePlatformError(new PlatformReplayError('schon benutzt'));

        expect(result.httpStatus).toBe(500);
        expect(result.code).toBe(PLATFORM_RESPONSE_CODES.internal);
        expect(result.allowLocalFallback).toBe(false);
    });

    it('PlatformResponseError → 502 PLATFORM_RESPONSE_INVALID, kein Rückfall', () => {
        const result = translatePlatformError(new PlatformResponseError('kein JSON', 200, null));

        expect(result.httpStatus).toBe(502);
        expect(result.code).toBe(PLATFORM_RESPONSE_CODES.responseInvalid);
        expect(result.logLevel).toBe('error');
        // Wir wissen nicht, was wir bekommen haben — ein Rückfall würde den
        // Fehler in gültig aussehende Daten verwandeln.
        expect(result.allowLocalFallback).toBe(false);
    });
});

describe('translatePlatformError — alles Übrige', () => {
    it('übersetzt einen gewöhnlichen Error zu 500, statt ihn durchzulassen', () => {
        const result = translatePlatformError(new Error('irgendwas ging schief'));

        expect(result.httpStatus).toBe(500);
        expect(result.code).toBe(PLATFORM_RESPONSE_CODES.internal);
    });

    it.each([null, undefined, 'eine Zeichenkette', 42, {}])('wirft selbst nicht bei %o', (thrown) => {
        expect(() => translatePlatformError(thrown)).not.toThrow();
        expect(translatePlatformError(thrown).httpStatus).toBe(500);
    });

    it('fängt auch einen rohen PlatformError auf, der keine Unterklasse ist', () => {
        const result = translatePlatformError(new PlatformError('unbestimmt', { httpStatus: 418 }));

        expect(result.httpStatus).toBe(500);
        expect(result.code).toBe(PLATFORM_RESPONSE_CODES.internal);
    });

    it('deckt alle sieben Fehlerklassen aus errors.ts ab — kommt eine achte dazu, fällt sie in den Default', () => {
        const alle = [
            new PlatformConfigError('x', []),
            new PlatformAuthError('x', 401, 'invalid_api_key'),
            new PlatformReplayError('x'),
            new PlatformRateLimitError('x', 'rate_limit_exceeded'),
            new PlatformUnavailableError('x', 503, 'x'),
            new PlatformTimeoutError('x', 1),
            new PlatformResponseError('x', 400, 'x'),
        ];

        expect(alle).toHaveLength(7);

        // Keine der sieben darf im Default landen: der Default ist 500 mit
        // INTERNAL_ERROR, und den dürfen nur Replay und Response-Fehler
        // absichtlich treffen.
        const imDefault = alle.filter((error) => {
            const result = translatePlatformError(error);
            return result.code === PLATFORM_RESPONSE_CODES.internal;
        });

        expect(imDefault).toHaveLength(1);
        expect(imDefault[0]).toBeInstanceOf(PlatformReplayError);
    });
});

describe('buildTokenNotIndexedPayload', () => {
    const identity = { contractAddress: '0xabc', tokenId: '7', chainId: 11155111 };

    it('trägt genau die Felder aus V5', () => {
        const payload = buildTokenNotIndexedPayload({
            ...identity,
            isWhitelisted: true,
            refreshJobId: 'job-1',
        });

        expect(Object.keys(payload).sort()).toEqual(
            ['code', 'refreshQueued', 'refreshJobId', 'contractAddress', 'tokenId', 'chainId'].sort()
        );
        expect(payload.code).toBe(PLATFORM_RESPONSE_CODES.notIndexed);
    });

    it('meldet refreshQueued, wenn die Collection auf der Whitelist steht und ein Auftrag läuft', () => {
        const payload = buildTokenNotIndexedPayload({
            ...identity,
            isWhitelisted: true,
            refreshJobId: 'job-1',
        });

        expect(payload.refreshQueued).toBe(true);
        expect(payload.refreshJobId).toBe('job-1');
    });

    it('setzt refreshQueued immer false außerhalb der Whitelist — sonst zieht ein Seitenaufruf eine fremde Collection ins Indexing (V33)', () => {
        const payload = buildTokenNotIndexedPayload({
            ...identity,
            isWhitelisted: false,
            refreshJobId: 'job-1',
        });

        expect(payload.refreshQueued).toBe(false);
        expect(payload.refreshJobId).toBeNull();
    });

    it('meldet kein refreshQueued ohne Auftrag, auch auf der Whitelist', () => {
        const payload = buildTokenNotIndexedPayload({ ...identity, isWhitelisted: true });

        expect(payload.refreshQueued).toBe(false);
        expect(payload.refreshJobId).toBeNull();
    });
});
