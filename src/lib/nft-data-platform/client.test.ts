/**
 * Datei: src/lib/nft-data-platform/client.test.ts
 *
 * Zweck: Belegt das Verhalten des Transports gegen einen eingespeisten fetch —
 * Wiederholung mit frischer Signatur, die vier unterscheidbaren Fehlerzustände,
 * das Rate-Limit-Budget und den Nebenläufigkeitsdeckel.
 *
 * Wichtig:
 * - Was hier grün ist, belegt die MECHANIK. V11 verlangt zusätzlich einen Lauf
 *   gegen eine echte Instanz (Entscheidung E3, `npm run platform:smoke`). Dieser
 *   Test ersetzt ihn nicht und behauptet das auch nicht.
 * - Der Kern der 409-Prüfung ist nicht der Statuscode, sondern dass sich
 *   Signatur UND Zeitstempel zwischen den Versuchen unterscheiden. Ein Test, der
 *   nur "am Ende kam 200" prüft, würde einen Client mit wiederverwendeter
 *   Signatur durchlassen, solange die Plattform gnädig ist.
 * - Uhr, Zufall, fetch und Wartezeit sind eingespeist. Der Test wartet nie
 *   wirklich; er prüft, DASS gewartet worden wäre.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { requestPlatform, type PlatformTransportDeps } from '@/lib/nft-data-platform/client';
import { resetPlatformConfigCache } from '@/lib/nft-data-platform/config';
import {
    PlatformAuthError,
    PlatformRateLimitError,
    PlatformResponseError,
    PlatformUnavailableError,
} from '@/lib/nft-data-platform/errors';
import { getRateLimitSnapshot, resetRateLimitState } from '@/lib/nft-data-platform/rate-limit';

const FROZEN_NOW_MS = 1_750_000_000_000;

type RecordedCall = {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
};

/** Gesammelte Anfragen und Wartezeiten eines Testlaufs. */
type Harness = {
    calls: RecordedCall[];
    sleeps: number[];
    deps: PlatformTransportDeps;
};

/**
 * Liest die Header eines fetch-Aufrufs in ein einfaches Objekt.
 *
 * @param init - zweites Argument von fetch
 * @returns Header als Objekt mit kleingeschriebenen Namen
 */
function readHeaders(init: RequestInit | undefined): Record<string, string> {
    const raw = init?.headers;

    if (raw === undefined) {
        return {};
    }

    const result: Record<string, string> = {};
    new Headers(raw).forEach((value, key) => {
        result[key.toLowerCase()] = value;
    });

    return result;
}

/**
 * Baut eine Antwort der Plattform in deren Fehlerform.
 *
 * @param status - Statuscode
 * @param code - Wert des Feldes `error`
 * @returns Response mit dem passenden Body
 */
function failure(status: number, code: string): Response {
    return new Response(JSON.stringify({ ok: false, error: code, message: 'Testfall' }), { status });
}

/**
 * Baut eine Erfolgsantwort, optional mit Rate-Limit-Headern.
 *
 * @param body - JSON-Body
 * @param rateLimit - Werte für x-ratelimit-limit und -remaining
 * @returns Response mit Status 200
 */
function success(body: unknown, rateLimit?: { limit: number; remaining: number }): Response {
    const headers = new Headers({ 'content-type': 'application/json' });

    if (rateLimit !== undefined) {
        headers.set('x-ratelimit-limit', String(rateLimit.limit));
        headers.set('x-ratelimit-remaining', String(rateLimit.remaining));
    }

    return new Response(JSON.stringify(body), { status: 200, headers });
}

/**
 * Baut die eingespeiste Umgebung: fetch gibt die übergebenen Antworten in
 * Reihenfolge zurück, sleep zählt nur mit, Uhr und Zufall stehen fest.
 *
 * @param outcomes - je Versuch eine Antwort oder ein zu werfender Fehler
 * @returns Sammelobjekte und die deps für requestPlatform
 */
function harness(outcomes: Array<Response | Error>): Harness {
    const calls: RecordedCall[] = [];
    const sleeps: number[] = [];
    let index = 0;

    const deps: PlatformTransportDeps = {
        fetchImpl: async (input, init) => {
            calls.push({
                url: String(input),
                method: init?.method ?? 'GET',
                headers: readHeaders(init),
                body: typeof init?.body === 'string' ? init.body : null,
            });

            const outcome = outcomes[index];
            index += 1;

            if (outcome === undefined) {
                throw new Error(`Kein Testfall für Versuch ${index} hinterlegt`);
            }

            if (outcome instanceof Error) {
                throw outcome;
            }

            return outcome;
        },
        sleepImpl: async (ms) => {
            sleeps.push(ms);
        },
        nowMs: () => FROZEN_NOW_MS,
        randomUnit: () => 0.5,
    };

    return { calls, sleeps, deps };
}

beforeEach(() => {
    process.env.NFT_API_BASE_URL = 'https://platform.example.test';
    process.env.NFT_API_READ_CLIENT_ID = 'alpha-read';
    process.env.NFT_API_READ_KEY = 'read-key-123456';
    process.env.NFT_API_READ_SECRET = 'read-secret';
    process.env.NFT_API_OPS_CLIENT_ID = 'alpha-ops';
    process.env.NFT_API_OPS_KEY = 'ops-key-123456';
    process.env.NFT_API_OPS_SECRET = 'ops-secret';
    process.env.NFT_API_READ_CONCURRENCY = '2';
    process.env.NFT_API_MAX_ATTEMPTS = '3';

    resetPlatformConfigCache();
    resetRateLimitState();
});

describe('requestPlatform — Erfolgsfall', () => {
    it('signiert, sendet und gibt den geparsten Body zurück', async () => {
        const { calls, deps } = harness([success({ ok: true, data: { tokenId: '7' } })]);

        const result = await requestPlatform(
            { method: 'GET', path: '/api/v1/tokens/11155111/0xabc', credentials: 'read' },
            deps
        );

        expect(result.attempts).toBe(1);
        expect(result.status).toBe(200);
        expect(result.data).toEqual({ ok: true, data: { tokenId: '7' } });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('https://platform.example.test/api/v1/tokens/11155111/0xabc');
        expect(calls[0].headers['x-client-id']).toBe('alpha-read');
        expect(calls[0].headers['x-api-key']).toBe('read-key-123456');
        expect(calls[0].headers['x-signature']).toMatch(/^[a-f0-9]{64}$/);
        expect(calls[0].headers['x-timestamp']).toBe('1750000000');
    });

    it('sendet bei GET keinen Body und keinen content-type', async () => {
        const { calls, deps } = harness([success({ ok: true })]);

        await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        expect(calls[0].body).toBeNull();
        expect(calls[0].headers['content-type']).toBeUndefined();
    });

    it('sendet bei POST genau die signierte Body-Zeichenkette', async () => {
        const { calls, deps } = harness([success({ ok: true })]);

        await requestPlatform(
            {
                method: 'POST',
                path: '/api/v1/refresh/token',
                credentials: 'read',
                body: { chainId: 11155111, contractAddress: '0xabc', tokenId: '7' },
            },
            deps
        );

        expect(calls[0].body).toBe('{"chainId":11155111,"contractAddress":"0xabc","tokenId":"7"}');
        expect(calls[0].headers['content-type']).toBe('application/json');
    });

    it('wählt für ops den zweiten Zugangsdatensatz', async () => {
        const { calls, deps } = harness([success({ ok: true })]);

        await requestPlatform(
            { method: 'POST', path: '/api/v1/refresh/collection', credentials: 'ops', body: { chainId: 1 } },
            deps
        );

        expect(calls[0].headers['x-client-id']).toBe('alpha-ops');
        expect(calls[0].headers['x-api-key']).toBe('ops-key-123456');
    });

    it('nimmt die Query in den signierten Pfad, nicht nur in die URL', async () => {
        const { calls, deps } = harness([success({ ok: true }), success({ ok: true })]);

        await requestPlatform({ method: 'GET', path: '/api/v1/search?q=foo', credentials: 'read' }, deps);
        await requestPlatform({ method: 'GET', path: '/api/v1/search?q=bar', credentials: 'read' }, deps);

        expect(calls[0].headers['x-signature']).not.toBe(calls[1].headers['x-signature']);
    });
});

describe('requestPlatform — 409 replayed_request (V11, Mechanik)', () => {
    it('wiederholt und trägt dabei eine ANDERE Signatur und einen anderen Zeitstempel', async () => {
        const { calls, deps } = harness([failure(409, 'replayed_request'), success({ ok: true })]);

        const result = await requestPlatform(
            { method: 'GET', path: '/api/v1/tokens/1/0xabc', credentials: 'read' },
            deps
        );

        expect(result.attempts).toBe(2);
        expect(calls).toHaveLength(2);
        expect(calls[0].headers['x-timestamp']).not.toBe(calls[1].headers['x-timestamp']);
        expect(calls[0].headers['x-signature']).not.toBe(calls[1].headers['x-signature']);
    });

    it('erhöht den Zeitstempel auch bei stehender Uhr — sonst ist die Wiederholung wieder ein 409', async () => {
        const { calls, deps } = harness([failure(409, 'replayed_request'), success({ ok: true })]);

        await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        expect(calls[0].headers['x-timestamp']).toBe('1750000000');
        expect(calls[1].headers['x-timestamp']).toBe('1750000001');
    });

    it('gibt nach erschöpften Versuchen den 409 als Fehler heraus', async () => {
        const { calls, deps } = harness([
            failure(409, 'replayed_request'),
            failure(409, 'replayed_request'),
            failure(409, 'replayed_request'),
        ]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toMatchObject({ name: 'PlatformReplayError', httpStatus: 409 });
        expect(calls).toHaveLength(3);
    });

    it('behandelt einen 409 mit anderem Code nicht als Replay und wiederholt ihn nicht', async () => {
        const { calls, deps } = harness([failure(409, 'some_other_conflict')]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toBeInstanceOf(PlatformResponseError);
        expect(calls).toHaveLength(1);
    });
});

describe('requestPlatform — 429 gegen 409 unterschieden', () => {
    it('wartet vor der Wiederholung, statt sofort erneut zu senden', async () => {
        const { sleeps, deps } = harness([failure(429, 'rate_limit_exceeded'), success({ ok: true })]);

        const result = await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        expect(result.attempts).toBe(2);
        expect(sleeps.length).toBeGreaterThan(0);
        expect(Math.max(...sleeps)).toBeGreaterThan(0);
    });

    it('sperrt das Fenster bis zur nächsten Grenze, weil die Antwort keine Wartezeit nennt', async () => {
        const { deps } = harness([failure(429, 'rate_limit_exceeded'), success({ ok: true })]);

        await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        const snapshot = getRateLimitSnapshot('read');
        expect(snapshot.blockedUntilMs).not.toBeNull();
    });

    it('endet nach erschöpften Versuchen als PlatformRateLimitError, nicht als Replay-Fehler', async () => {
        const { deps } = harness([
            failure(429, 'rate_limit_exceeded'),
            failure(429, 'rate_limit_exceeded'),
            failure(429, 'rate_limit_exceeded'),
        ]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toBeInstanceOf(PlatformRateLimitError);
    });

    it('sperrt read und ops getrennt', async () => {
        const { deps } = harness([
            failure(429, 'rate_limit_exceeded'),
            failure(429, 'rate_limit_exceeded'),
            failure(429, 'rate_limit_exceeded'),
        ]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toBeInstanceOf(PlatformRateLimitError);

        expect(getRateLimitSnapshot('read').blockedUntilMs).not.toBeNull();
        expect(getRateLimitSnapshot('ops').blockedUntilMs).toBeNull();
    });
});

describe('requestPlatform — 503 und Netzfehler', () => {
    it('meldet einen 503 als PlatformUnavailableError', async () => {
        const { deps } = harness([
            failure(503, 'replay_guard_backend_unavailable'),
            failure(503, 'replay_guard_backend_unavailable'),
            failure(503, 'rate_limit_backend_unavailable'),
        ]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toBeInstanceOf(PlatformUnavailableError);
    });

    it('trägt den stabilen Code für den degradierten Pfad', async () => {
        const { deps } = harness([failure(503, 'x'), failure(503, 'x'), failure(503, 'x')]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toMatchObject({ code: 'PLATFORM_UNAVAILABLE' });
    });

    it('behandelt einen Netzfehler wie einen Ausfall und wiederholt ihn', async () => {
        const { calls, deps } = harness([new TypeError('fetch failed'), success({ ok: true })]);

        const result = await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        expect(result.attempts).toBe(2);
        expect(calls).toHaveLength(2);
    });
});

describe('requestPlatform — Timeout', () => {
    it('wiederholt nach einem Timeout mit frischer Signatur', async () => {
        const abortError = new Error('The operation was aborted due to timeout');
        abortError.name = 'TimeoutError';
        const { calls, deps } = harness([abortError, success({ ok: true })]);

        const result = await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        expect(result.attempts).toBe(2);
        expect(calls[0].headers['x-signature']).not.toBe(calls[1].headers['x-signature']);
    });

    it('meldet einen dauerhaften Timeout als PlatformTimeoutError', async () => {
        const abortError = new Error('aborted');
        abortError.name = 'TimeoutError';
        const { deps } = harness([abortError, abortError, abortError]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toMatchObject({ name: 'PlatformTimeoutError', retryable: true });
    });
});

describe('requestPlatform — was nicht wiederholt wird', () => {
    it('wiederholt einen 401 nicht, weil eine neue Signatur daran nichts ändert', async () => {
        const { calls, deps } = harness([failure(401, 'invalid_signature')]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toBeInstanceOf(PlatformAuthError);
        expect(calls).toHaveLength(1);
    });

    it('wiederholt einen fehlenden Scope nicht', async () => {
        const { calls, deps } = harness([failure(403, 'missing_scope')]);

        await expect(
            requestPlatform({ method: 'POST', path: '/api/v1/reindex', credentials: 'read', body: {} }, deps)
        ).rejects.toMatchObject({ name: 'PlatformAuthError', platformCode: 'missing_scope' });
        expect(calls).toHaveLength(1);
    });

    it('wiederholt einen zu alten Zeitstempel nicht, sondern meldet ihn', async () => {
        const { calls, deps } = harness([failure(401, 'stale_timestamp')]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toMatchObject({ platformCode: 'stale_timestamp' });
        expect(calls).toHaveLength(1);
    });
});

describe('requestPlatform — kaputte Antworten', () => {
    it('meldet einen 200 mit Nicht-JSON-Body als Fehler statt abzustürzen', async () => {
        const { deps } = harness([new Response('<html>Traefik</html>', { status: 200 })]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toBeInstanceOf(PlatformResponseError);
    });

    it('verkraftet einen Fehler ohne lesbaren Body', async () => {
        const { deps } = harness([new Response('kein json', { status: 400 })]);

        await expect(
            requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps)
        ).rejects.toMatchObject({ httpStatus: 400, platformCode: null });
    });

    it('nimmt einen leeren Body als null hin', async () => {
        const { deps } = harness([new Response('', { status: 200 })]);

        const result = await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        expect(result.data).toBeNull();
    });
});

describe('requestPlatform — Rate-Limit-Budget (V34)', () => {
    it('übernimmt limit und remaining aus der Erfolgsantwort', async () => {
        const { deps } = harness([success({ ok: true }, { limit: 600, remaining: 597 })]);

        await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        const snapshot = getRateLimitSnapshot('read');
        expect(snapshot.limit).toBe(600);
        expect(snapshot.remaining).toBe(597);
        expect(snapshot.observedAtMs).toBe(FROZEN_NOW_MS);
    });

    it('bleibt ohne die Header unbeschrieben, statt einen Wert zu erfinden', async () => {
        const { deps } = harness([success({ ok: true })]);

        await requestPlatform({ method: 'GET', path: '/api/v1/x', credentials: 'read' }, deps);

        expect(getRateLimitSnapshot('read').limit).toBeNull();
    });
});

describe('requestPlatform — Nebenläufigkeitsdeckel', () => {
    it('lässt nie mehr gleichzeitig laufen als erlaubt', async () => {
        let active = 0;
        let peak = 0;
        const release: Array<() => void> = [];

        const deps: PlatformTransportDeps = {
            fetchImpl: async () => {
                active += 1;
                peak = Math.max(peak, active);

                await new Promise<void>((resolve) => {
                    release.push(resolve);
                });

                active -= 1;
                return success({ ok: true });
            },
            sleepImpl: async () => undefined,
            nowMs: () => FROZEN_NOW_MS,
            randomUnit: () => 0.5,
        };

        // NFT_API_READ_CONCURRENCY ist im Test auf 2 gesetzt.
        const pending = [0, 1, 2, 3].map((index) =>
            requestPlatform({ method: 'GET', path: `/api/v1/x/${index}`, credentials: 'read' }, deps)
        );

        // Warteschlange abarbeiten: jede freigegebene Anfrage macht einen Platz
        // frei, in den die nächste einrücken darf.
        for (let step = 0; step < 4; step += 1) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 0);
            });
            const next = release.shift();
            if (next !== undefined) {
                next();
            }
        }

        await Promise.all(pending);

        expect(peak).toBeLessThanOrEqual(2);
        expect(getRateLimitSnapshot('read').active).toBe(0);
        expect(getRateLimitSnapshot('read').queued).toBe(0);
    });
});
