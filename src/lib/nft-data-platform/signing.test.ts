/**
 * Datei: src/lib/nft-data-platform/signing.test.ts
 *
 * Zweck: Belegt die Signierung gegen die Referenz der Plattform.
 *
 * Wichtig:
 * - Die erwarteten Signaturen unten sind FESTE WERTE, nicht im Test
 *   nachgerechnet. Ein Test, der die Signatur mit derselben Funktion bildet,
 *   die er prüfen soll, prüft nur, dass zwei Aufrufe gleich ausgehen — er
 *   würde eine falsche kanonische Zeichenkette mitmachen. Die Werte stammen aus
 *   der Formel der Plattform (packages/security/src/index.ts, Commit 5dda8c7),
 *   ausgerechnet mit node:crypto außerhalb dieses Codes.
 * - Wer sie ändern muss, hat entweder die Regel gebrochen oder die Plattform
 *   hat sie geändert. Beides ist ein Halt, kein Nachziehen der Zahlen.
 */

import { describe, expect, it } from 'vitest';

import {
    buildAuthHeaders,
    canonicalizeSignedRequest,
    createRequestSignature,
    currentTimestampSeconds,
    PLATFORM_AUTH_HEADERS,
    sha256Hex,
} from '@/lib/nft-data-platform/signing';

/** SHA-256 der leeren Zeichenkette — steht bei jedem GET in der Signatur. */
const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const GET_CASE = {
    method: 'GET',
    path: '/api/v1/tokens/11155111/0xabc?cursor=x',
    body: '',
    timestamp: '1750000000',
    secret: 'test-secret-read',
    signature: '05ed4c6a8c2382454303e70a51cae23d0062b4b712e85c3cd270fac96e0521ff',
} as const;

const POST_CASE = {
    method: 'POST',
    path: '/api/v1/refresh/token',
    body: '{"chainId":11155111,"contractAddress":"0xabc","tokenId":"7"}',
    bodyHash: '3d0c45b435bdfba02e76316aef91e7695a5d19aea05f9595376e5ba64ca62eda',
    timestamp: '1750000001',
    secret: 'test-secret-ops',
    signature: 'e2b510dfa9114af10f06a403f8367e3f6f3fe8989fffe88def0806da51f0fa84',
} as const;

describe('sha256Hex', () => {
    it('hasht die leere Zeichenkette statt sie zu überspringen', () => {
        expect(sha256Hex('')).toBe(EMPTY_BODY_HASH);
    });
});

describe('canonicalizeSignedRequest', () => {
    it('baut vier Zeilen in fester Reihenfolge', () => {
        const canonical = canonicalizeSignedRequest({
            method: GET_CASE.method,
            path: GET_CASE.path,
            body: GET_CASE.body,
            timestamp: GET_CASE.timestamp,
        });

        expect(canonical).toBe(
            `GET\n/api/v1/tokens/11155111/0xabc?cursor=x\n${EMPTY_BODY_HASH}\n1750000000`
        );
        expect(canonical.split('\n')).toHaveLength(4);
    });

    it('nimmt den Query-Teil in den signierten Pfad auf', () => {
        const withQuery = canonicalizeSignedRequest({
            method: 'GET',
            path: '/api/v1/search?q=foo',
            body: '',
            timestamp: '1750000000',
        });
        const withoutQuery = canonicalizeSignedRequest({
            method: 'GET',
            path: '/api/v1/search',
            body: '',
            timestamp: '1750000000',
        });

        expect(withQuery).not.toBe(withoutQuery);
        expect(withQuery.split('\n')[1]).toBe('/api/v1/search?q=foo');
    });

    it('schreibt die Methode groß', () => {
        const lower = canonicalizeSignedRequest({
            method: 'get',
            path: '/api/v1/x',
            body: '',
            timestamp: '1',
        });

        expect(lower.split('\n')[0]).toBe('GET');
    });

    it('hasht den Body, statt ihn wörtlich einzusetzen', () => {
        const canonical = canonicalizeSignedRequest({
            method: POST_CASE.method,
            path: POST_CASE.path,
            body: POST_CASE.body,
            timestamp: POST_CASE.timestamp,
        });

        expect(canonical.split('\n')[2]).toBe(POST_CASE.bodyHash);
        expect(canonical).not.toContain('contractAddress');
    });
});

describe('createRequestSignature', () => {
    it('trifft den festen Vektor eines GET ohne Body', () => {
        const canonical = canonicalizeSignedRequest({
            method: GET_CASE.method,
            path: GET_CASE.path,
            body: GET_CASE.body,
            timestamp: GET_CASE.timestamp,
        });

        expect(createRequestSignature(canonical, GET_CASE.secret)).toBe(GET_CASE.signature);
    });

    it('trifft den festen Vektor eines POST mit Body', () => {
        const canonical = canonicalizeSignedRequest({
            method: POST_CASE.method,
            path: POST_CASE.path,
            body: POST_CASE.body,
            timestamp: POST_CASE.timestamp,
        });

        expect(createRequestSignature(canonical, POST_CASE.secret)).toBe(POST_CASE.signature);
    });

    it('liefert 64 Hex-Zeichen — die Länge, die die Plattform prüft', () => {
        const signature = createRequestSignature('beliebig', 'secret');

        expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('ergibt mit anderem Secret eine andere Signatur', () => {
        const canonical = canonicalizeSignedRequest({
            method: 'GET',
            path: '/api/v1/x',
            body: '',
            timestamp: '1750000000',
        });

        expect(createRequestSignature(canonical, 'a')).not.toBe(createRequestSignature(canonical, 'b'));
    });
});

describe('currentTimestampSeconds', () => {
    it('gibt Sekunden, nicht Millisekunden', () => {
        expect(currentTimestampSeconds(1_750_000_000_123)).toBe('1750000000');
    });

    it('schneidet ab, statt zu runden', () => {
        expect(currentTimestampSeconds(1_750_000_000_999)).toBe('1750000000');
    });
});

describe('buildAuthHeaders', () => {
    const credentials = {
        clientId: 'alpha-read',
        apiKey: 'key-123456789012',
        apiSecret: GET_CASE.secret,
    };

    it('setzt genau die vier Header der Plattform', () => {
        const headers = buildAuthHeaders({
            method: GET_CASE.method,
            path: GET_CASE.path,
            body: GET_CASE.body,
            timestamp: GET_CASE.timestamp,
            credentials,
        });

        expect(Object.keys(headers).sort()).toEqual(
            [
                PLATFORM_AUTH_HEADERS.apiKey,
                PLATFORM_AUTH_HEADERS.clientId,
                PLATFORM_AUTH_HEADERS.signature,
                PLATFORM_AUTH_HEADERS.timestamp,
            ].sort()
        );
    });

    it('signiert mit demselben Ergebnis wie der feste Vektor', () => {
        const headers = buildAuthHeaders({
            method: GET_CASE.method,
            path: GET_CASE.path,
            body: GET_CASE.body,
            timestamp: GET_CASE.timestamp,
            credentials,
        });

        expect(headers[PLATFORM_AUTH_HEADERS.signature]).toBe(GET_CASE.signature);
        expect(headers[PLATFORM_AUTH_HEADERS.timestamp]).toBe(GET_CASE.timestamp);
        expect(headers[PLATFORM_AUTH_HEADERS.clientId]).toBe('alpha-read');
    });

    it('trägt das Secret nirgends in die Header', () => {
        const headers = buildAuthHeaders({
            method: GET_CASE.method,
            path: GET_CASE.path,
            body: GET_CASE.body,
            timestamp: GET_CASE.timestamp,
            credentials,
        });

        expect(Object.values(headers)).not.toContain(GET_CASE.secret);
    });

    it('ergibt bei verschiedenem Zeitstempel verschiedene Signaturen', () => {
        const base = {
            method: GET_CASE.method,
            path: GET_CASE.path,
            body: GET_CASE.body,
            credentials,
        };

        const first = buildAuthHeaders({ ...base, timestamp: '1750000000' });
        const second = buildAuthHeaders({ ...base, timestamp: '1750000001' });

        expect(first[PLATFORM_AUTH_HEADERS.signature]).not.toBe(second[PLATFORM_AUTH_HEADERS.signature]);
    });

    it('ergibt bei gleichem Zeitstempel dieselbe Signatur — der Grund für den monotonen Zeitstempel im Client', () => {
        const base = {
            method: GET_CASE.method,
            path: GET_CASE.path,
            body: GET_CASE.body,
            timestamp: '1750000000',
            credentials,
        };

        expect(buildAuthHeaders(base)[PLATFORM_AUTH_HEADERS.signature]).toBe(
            buildAuthHeaders(base)[PLATFORM_AUTH_HEADERS.signature]
        );
    });
});
