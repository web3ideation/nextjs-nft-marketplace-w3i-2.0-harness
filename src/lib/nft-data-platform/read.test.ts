/**
 * Datei: src/lib/nft-data-platform/read.test.ts
 *
 * Zweck: Belegt die fünf Lesemethoden gegen den eingespeisten Transport aus A1 —
 * Pfad, Zugangsdatensatz, Paginierung, Fehlerform.
 *
 * Wichtig:
 * - **Der Paginierungs-Pflichttest ist der Kern.** Die Plattform ignoriert
 *   unbekannte Abfrageparameter still und antwortet `200` mit einer
 *   ungefilterten ersten Seite. Ein Test auf „Anfrage erfolgreich" würde einen
 *   Client durchlassen, der den Cursor gar nicht mitschickt — und der läge dann
 *   in der Produktion in einer Endlosschleife über Seite eins. Geprüft wird
 *   deshalb zweierlei: der zweite Aufruf trägt den `nextCursor` des ersten im
 *   Pfad, UND die zweite Seite liefert andere Elemente.
 * - Geprüft wird außerdem, dass ein Formfehler als `PlatformResponseError`
 *   ankommt und nicht als zod-Fehler: ein zod-Fehler landet im 500er-Default
 *   der A8-Tabelle und sieht dann wie ein Fehler bei uns aus.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { PlatformTransportDeps } from '@/lib/nft-data-platform/client';
import { resetPlatformConfigCache } from '@/lib/nft-data-platform/config';
import { asPlatformCursor } from '@/lib/nft-data-platform/cursor';
import { PlatformResponseError } from '@/lib/nft-data-platform/errors';
import { resetRateLimitState } from '@/lib/nft-data-platform/rate-limit';
import {
    getCollectionDetail,
    getTokenDetail,
    getTokenOwners,
    listCollections,
    searchEntities,
} from '@/lib/nft-data-platform/read';

const media = {
    kind: 'image',
    cdnUrlOriginal: 'https://cdn.example.test/a.png',
    cdnUrlOptimized: null,
    cdnUrlThumbnail: null,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    durationSec: null,
    status: 'ready',
};

/**
 * Baut ein Token mit der angegebenen Token-ID.
 *
 * @param tokenId - Token-ID, über die sich Seiten unterscheiden lassen
 * @returns Token in Plattform-Form
 */
function makeToken(tokenId: string): Record<string, unknown> {
    return {
        _id: `id-${tokenId}`,
        chainId: 11155111,
        contractAddress: '0xabc',
        tokenId,
        standard: 'erc721',
        name: `Token ${tokenId}`,
        description: null,
        externalUrl: null,
        imageOriginalUrl: null,
        animationOriginalUrl: null,
        audioOriginalUrl: null,
        interactiveOriginalUrl: null,
        supplyQuantity: null,
        metadataStatus: 'ready',
        mediaStatus: 'ready',
        metadataPayload: null,
        attributes: [],
        creator: null,
        media: { image: media, animation: null, audio: null },
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
    };
}

/**
 * Baut eine Collection mit der angegebenen Contract-Adresse.
 *
 * @param contractAddress - Adresse, über die sich Seiten unterscheiden lassen
 * @returns Collection in Plattform-Form
 */
function makeCollection(contractAddress: string): Record<string, unknown> {
    return {
        _id: `id-${contractAddress}`,
        chainId: 11155111,
        contractAddress,
        standard: 'erc721',
        name: `Sammlung ${contractAddress}`,
        symbol: null,
        description: null,
        externalUrl: null,
        imageOriginalUrl: null,
        bannerImageOriginalUrl: null,
        featuredImageOriginalUrl: null,
        totalSupply: null,
        indexedTokenCount: 0,
        holderCount: 0,
        syncStatus: 'idle',
        coverImageSource: 'none',
        recentTokens: [],
        preview: null,
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
    };
}

type Harness = { paths: string[]; clientIds: string[]; deps: PlatformTransportDeps };

/**
 * Baut die eingespeiste Transportumgebung und merkt sich Pfade und Clients.
 *
 * @param bodies - je Aufruf eine Antwort-Nutzlast
 * @returns Sammellisten und die deps
 */
function harness(bodies: unknown[]): Harness {
    const paths: string[] = [];
    const clientIds: string[] = [];
    let index = 0;

    const deps: PlatformTransportDeps = {
        fetchImpl: async (input, init) => {
            const url = new URL(String(input));
            paths.push(`${url.pathname}${url.search}`);
            clientIds.push(new Headers(init?.headers).get('x-client-id') ?? '');

            const body = bodies[index];
            index += 1;

            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        },
        sleepImpl: async () => undefined,
        nowMs: () => 1_750_000_000_000,
        randomUnit: () => 0.5,
    };

    return { paths, clientIds, deps };
}

beforeEach(() => {
    process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
    process.env.NFT_API_BASE_URL = 'https://platform.example.test';
    process.env.NFT_API_READ_CLIENT_ID = 'alpha-read';
    process.env.NFT_API_READ_KEY = 'read-key';
    process.env.NFT_API_READ_SECRET = 'read-secret';
    process.env.NFT_API_OPS_CLIENT_ID = 'alpha-ops';
    process.env.NFT_API_OPS_KEY = 'ops-key';
    process.env.NFT_API_OPS_SECRET = 'ops-secret';

    resetPlatformConfigCache();
    resetRateLimitState();
});

describe('getTokenDetail', () => {
    it('ruft den Token-Pfad und gibt das geprüfte Token zurück', async () => {
        const { paths, clientIds, deps } = harness([{ ok: true, token: makeToken('7') }]);

        const token = await getTokenDetail(
            { chainId: 11155111, contractAddress: '0xabc', tokenId: '7' },
            deps
        );

        expect(paths[0]).toBe('/api/v1/tokens/11155111/0xabc/7');
        expect(clientIds[0]).toBe('alpha-read');
        expect(token.tokenId).toBe('7');
        expect(token.media.image?.cdnUrlOriginal).toBe('https://cdn.example.test/a.png');
    });

    it('meldet einen Formfehler als PlatformResponseError, nicht als zod-Fehler', async () => {
        const kaputt = makeToken('7');
        delete kaputt.media;
        const { deps } = harness([{ ok: true, token: kaputt }]);

        await expect(
            getTokenDetail({ chainId: 11155111, contractAddress: '0xabc', tokenId: '7' }, deps)
        ).rejects.toBeInstanceOf(PlatformResponseError);
    });

    it('nennt die Fundstelle in der Meldung, statt nur "falsche Form"', async () => {
        const kaputt = makeToken('7');
        delete kaputt.media;
        const { deps } = harness([{ ok: true, token: kaputt }]);

        await expect(
            getTokenDetail({ chainId: 11155111, contractAddress: '0xabc', tokenId: '7' }, deps)
        ).rejects.toThrow(/media/);
    });
});

describe('getTokenOwners', () => {
    it('unterscheidet erc721 und erc1155 am standard — die Plattform schreibt KLEIN', async () => {
        const { deps } = harness([
            {
                ok: true,
                standard: 'erc1155',
                items: [
                    {
                        chainId: 11155111,
                        contractAddress: '0xabc',
                        tokenId: '7',
                        ownerAddress: '0xdef',
                        balance: '3',
                        updatedAt: '2026-10-02T10:00:00.000Z',
                    },
                ],
                pageInfo: { limit: 50, hasMore: false, nextCursor: null },
            },
        ]);

        const owners = await getTokenOwners(
            { chainId: 11155111, contractAddress: '0xabc', tokenId: '7' },
            {},
            deps
        );

        expect(owners.standard).toBe('erc1155');
        if (owners.standard === 'erc1155') {
            expect(owners.items[0].balance).toBe('3');
        }
    });

    it('sendet den Standard-Umfang mit, statt ihn der Plattform zu überlassen', async () => {
        const { paths, deps } = harness([
            { ok: true, standard: 'erc721', items: [], pageInfo: { limit: 50, hasMore: false, nextCursor: null } },
        ]);

        await getTokenOwners({ chainId: 11155111, contractAddress: '0xabc', tokenId: '7' }, {}, deps);

        expect(paths[0]).toContain('limit=50');
    });
});

describe('listCollections — Paginierung (Pflichttest)', () => {
    it('trägt den nextCursor der ersten Seite in die zweite Anfrage UND liefert andere Elemente', async () => {
        const { paths, deps } = harness([
            {
                ok: true,
                items: [makeCollection('0xaaa')],
                pageInfo: { limit: 50, hasMore: true, nextCursor: 'CURSOR-SEITE-2' },
            },
            {
                ok: true,
                items: [makeCollection('0xbbb')],
                pageInfo: { limit: 50, hasMore: false, nextCursor: null },
            },
        ]);

        const erste = await listCollections({}, deps);
        expect(erste.items[0].contractAddress).toBe('0xaaa');
        expect(erste.pageInfo.hasMore).toBe(true);

        const cursor = asPlatformCursor(erste.pageInfo.nextCursor);
        expect(cursor).not.toBeNull();

        const zweite = await listCollections({ cursor }, deps);

        // Erstens: der Cursor ist tatsächlich mitgegangen. Ohne diese Zusicherung
        // wäre ein Client grün, der ihn weglässt — die Plattform ignoriert
        // unbekannte Parameter still und liefert wieder Seite eins.
        expect(paths[1]).toContain('cursor=CURSOR-SEITE-2');

        // Zweitens: die zweite Seite ist eine andere.
        expect(zweite.items[0].contractAddress).toBe('0xbbb');
        expect(zweite.items[0].contractAddress).not.toBe(erste.items[0].contractAddress);
        expect(zweite.pageInfo.nextCursor).toBeNull();
    });

    it('schickt keinen Cursor-Parameter, wenn keiner da ist', async () => {
        const { paths, deps } = harness([
            { ok: true, items: [], pageInfo: { limit: 50, hasMore: false, nextCursor: null } },
        ]);

        await listCollections({}, deps);

        expect(paths[0]).not.toContain('cursor');
    });

    it('kappt einen Umfang über dem Deckel der Plattform auf 200', async () => {
        const { paths, deps } = harness([
            { ok: true, items: [], pageInfo: { limit: 200, hasMore: false, nextCursor: null } },
        ]);

        await listCollections({ limit: 500 }, deps);

        expect(paths[0]).toContain('limit=200');
        expect(paths[0]).not.toContain('limit=500');
    });

    it('fällt bei einem unbrauchbaren Umfang auf den Standardwert zurück', async () => {
        const { paths, deps } = harness([
            { ok: true, items: [], pageInfo: { limit: 50, hasMore: false, nextCursor: null } },
        ]);

        await listCollections({ limit: 0 }, deps);

        expect(paths[0]).toContain('limit=50');
    });
});

describe('getCollectionDetail', () => {
    it('ruft den Collection-Pfad und gibt die geprüfte Collection zurück', async () => {
        const { paths, deps } = harness([{ ok: true, collection: makeCollection('0xabc') }]);

        const collection = await getCollectionDetail({ chainId: 11155111, contractAddress: '0xabc' }, deps);

        expect(paths[0]).toBe('/api/v1/collections/11155111/0xabc');
        expect(collection.indexedTokenCount).toBe(0);
    });
});

describe('searchEntities', () => {
    it('läuft über /api/v1/search mit q, nicht über einen search-Parameter an einer Liste', async () => {
        const { paths, deps } = harness([
            {
                ok: true,
                query: 'affe',
                entity: 'tokens',
                items: [makeToken('7')],
                pageInfo: { limit: 50, hasMore: false, nextCursor: null },
            },
        ]);

        const result = await searchEntities({ query: 'affe' }, deps);

        expect(paths[0]).toContain('/api/v1/search?');
        expect(paths[0]).toContain('q=affe');
        expect(result.entity).toBe('tokens');
    });

    it('gibt die Betriebsart mit, wenn eine gewählt ist', async () => {
        const { paths, deps } = harness([
            {
                ok: true,
                query: 'affe',
                entity: 'all',
                items: [],
                pageInfo: { limit: 50, hasMore: false, nextCursor: null },
            },
        ]);

        await searchEntities({ query: 'affe', entity: 'all' }, deps);

        expect(paths[0]).toContain('entity=all');
    });

    it('lässt einen leeren Zusatzparameter weg, statt ihn leer zu senden', async () => {
        const { paths, deps } = harness([
            {
                ok: true,
                query: 'affe',
                entity: 'tokens',
                items: [],
                pageInfo: { limit: 50, hasMore: false, nextCursor: null },
            },
        ]);

        await searchEntities({ query: 'affe', entity: undefined }, deps);

        expect(paths[0]).not.toContain('entity=');
    });
});

describe('Alle Lesemethoden nutzen den Read-Zugangsdatensatz (V15)', () => {
    it('sendet nie den Ops-Client', async () => {
        const { clientIds, deps } = harness([
            { ok: true, token: makeToken('7') },
            { ok: true, collection: makeCollection('0xabc') },
            { ok: true, items: [], pageInfo: { limit: 50, hasMore: false, nextCursor: null } },
        ]);

        await getTokenDetail({ chainId: 1, contractAddress: '0xabc', tokenId: '7' }, deps);
        await getCollectionDetail({ chainId: 1, contractAddress: '0xabc' }, deps);
        await listCollections({}, deps);

        expect(clientIds).toEqual(['alpha-read', 'alpha-read', 'alpha-read']);
        expect(clientIds).not.toContain('alpha-ops');
    });
});
