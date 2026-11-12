/**
 * Datei: src/lib/nft-data-platform/write.test.ts
 *
 * Zweck: Belegt das Wallet-Inventar und die vier Aufrufe mit Wirkung — Pfad,
 * Zugangsdatensatz, Stückelung, und vor allem den Whitelist-Filter davor.
 *
 * Wichtig:
 * - **Der wichtigste Test ist der, bei dem nichts passiert.** Eine Identität
 *   außerhalb der Diamond-Whitelist darf die Plattform nicht erreichen (V33) —
 *   geprüft wird deshalb nicht „die Antwort trägt failed", sondern dass
 *   `fetchImpl` gar nicht gerufen wurde. Eine Prüfung auf das Ergebnis allein
 *   wäre grün, wenn die Plattform selbst mit `failed` antwortet; dann hätte der
 *   Aufruf sie aber schon gekostet und die Collection registriert.
 * - **Die Pfad-Falle ist mitgeprüft.** Der Plattform-Routenbaum heißt
 *   `owners/wallets/[chainId]`, trägt dort aber die Eigentümer-Adresse. Der Test
 *   nagelt den erwarteten Pfad im Wortlaut fest, damit ein Umbau nach dem
 *   Ordnernamen auffliegt und nicht erst als 404 in der Produktion.
 * - **Ein Inventar-Eintrag ohne indiziertes Token muss durchkommen** (V2). Das
 *   ist die Zeile, die ein strengeres Schema verschluckt hätte — genau die
 *   Token, die noch auf das Indexing warten.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformTransportDeps } from '@/lib/nft-data-platform/client';
import { resetPlatformConfigCache } from '@/lib/nft-data-platform/config';
import { asPlatformCursor } from '@/lib/nft-data-platform/cursor';
import { PlatformResponseError } from '@/lib/nft-data-platform/errors';
import { resetRateLimitState } from '@/lib/nft-data-platform/rate-limit';

const isCollectionWhitelisted = vi.fn();

vi.mock('@/services/blockchain/collection-whitelist', () => ({
    isCollectionWhitelisted: (...args: unknown[]) => isCollectionWhitelisted(...args),
}));

const {
    DISCOVER_BATCH_LIMIT,
    discoverTokens,
    discoverWalletHoldings,
    getWalletInventory,
    queueCollectionRefresh,
    queueTokenRefresh,
} = await import('@/lib/nft-data-platform/write');

type Harness = {
    paths: string[];
    clientIds: string[];
    bodies: unknown[];
    deps: PlatformTransportDeps;
};

/**
 * Baut die eingespeiste Transportumgebung und merkt sich Pfade, Clients und
 * gesendete Körper.
 *
 * @param responses - je Aufruf eine Antwort-Nutzlast
 * @param status - HTTP-Status der Antworten; die Refresh-Endpunkte antworten 202
 * @returns Sammellisten und die deps
 */
function harness(responses: unknown[], status = 200): Harness {
    const paths: string[] = [];
    const clientIds: string[] = [];
    const bodies: unknown[] = [];
    let index = 0;

    const deps: PlatformTransportDeps = {
        fetchImpl: async (input, init) => {
            const url = new URL(String(input));
            paths.push(`${url.pathname}${url.search}`);
            clientIds.push(new Headers(init?.headers).get('x-client-id') ?? '');
            bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);

            const body = responses[index];
            index += 1;

            return new Response(JSON.stringify(body), {
                status,
                headers: { 'content-type': 'application/json' },
            });
        },
        sleepImpl: async () => undefined,
        nowMs: () => 1_750_000_000_000,
        randomUnit: () => 0.5,
    };

    return { paths, clientIds, bodies, deps };
}

/**
 * Baut eine Identität mit der angegebenen Token-ID.
 *
 * @param tokenId - Token-ID
 * @param contractAddress - Contract-Adresse, Standardwert `0xabc`
 * @returns Identität in der Eingabeform
 */
function identity(tokenId: string, contractAddress = '0xabc') {
    return { chainId: 11155111, contractAddress, tokenId };
}

/**
 * Baut ein Element des Wallet-Inventars in Plattform-Form.
 *
 * Ohne indiziertes Token — das ist der Fall aus V2, der durchkommen muss.
 *
 * @param tokenId - Token-ID, ueber die sich Seiten unterscheiden lassen
 * @returns Element in Plattform-Form
 */
function inventoryItem(tokenId: string): Record<string, unknown> {
    return {
        standard: 'erc721',
        chainId: 11155111,
        contractAddress: '0xabc',
        tokenId,
        ownerAddress: '0xowner',
        updatedAt: '2026-10-02T10:00:00.000Z',
        token: null,
        collection: null,
    };
}

/**
 * Baut ein Element der Discover-Antwort in Plattform-Form.
 *
 * @param tokenId - Token-ID
 * @param discoveryStatus - Zustand der Identität
 * @returns Element in Plattform-Form
 */
function discoverItem(tokenId: string, discoveryStatus: string): Record<string, unknown> {
    return {
        chainId: 11155111,
        contractAddress: '0xabc',
        tokenId,
        discoveryStatus,
        queuedJobId: discoveryStatus === 'queued' ? `job-${tokenId}` : null,
        jobId: discoveryStatus === 'queued' ? `job-${tokenId}` : null,
        token: null,
        collection: null,
    };
}

/**
 * Baut eine Discover-Antwort über die übergebenen Elemente.
 *
 * @param items - Elemente in Plattform-Form
 * @returns Antwort in Plattform-Form
 */
function discoverResponse(items: Record<string, unknown>[]): Record<string, unknown> {
    return {
        ok: true,
        summary: {
            total: items.length,
            ready: items.filter((item) => item.discoveryStatus === 'ready').length,
            queued: items.filter((item) => item.discoveryStatus === 'queued').length,
            failed: items.filter((item) => item.discoveryStatus === 'failed').length,
        },
        items,
    };
}

/** Auftragsantwort der Refresh-Endpunkte. */
const refreshBody = { ok: true, jobId: 'job-1', queueJobId: 'queue-1', status: 'queued' };

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
    isCollectionWhitelisted.mockReset();
    isCollectionWhitelisted.mockResolvedValue(true);
});

describe('getWalletInventory', () => {
    it('setzt die Eigentuemer-Adresse in den Pfad und die Chains als eine Liste daneben', async () => {
        const { paths, clientIds, deps } = harness([
            {
                ok: true,
                chainIds: [1, 11155111],
                items: [],
                pageInfo: { nextCursor: null, hasMore: false, limit: 50 },
            },
        ]);

        await getWalletInventory(
            { ownerAddress: '0xowner', chainIds: [1, 11155111], limit: 50 },
            deps
        );

        // Der Ordner der Plattform heisst [chainId] und traegt die Adresse.
        expect(paths[0]).toBe('/api/v1/owners/wallets/0xowner?limit=50&chainIds=1%2C11155111');
        expect(clientIds[0]).toBe('alpha-read');
    });

    it('nimmt eine Holding-Zeile ohne indiziertes Token an, statt sie zu verschlucken', async () => {
        const { deps } = harness([
            {
                ok: true,
                chainIds: [11155111],
                items: [
                    {
                        standard: 'erc721',
                        chainId: 11155111,
                        contractAddress: '0xabc',
                        tokenId: '7',
                        ownerAddress: '0xowner',
                        updatedAt: '2026-10-02T10:00:00.000Z',
                        token: null,
                        collection: null,
                    },
                ],
                pageInfo: { nextCursor: null, hasMore: false, limit: 50 },
            },
        ]);

        const result = await getWalletInventory({ ownerAddress: '0xowner' }, deps);

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.tokenId).toBe('7');
        expect(result.items[0]?.token).toBeNull();
    });

    it('blaettert: der zweite Aufruf traegt den nextCursor des ersten und liefert andere Elemente', async () => {
        const { paths, deps } = harness([
            {
                ok: true,
                chainIds: [11155111],
                items: [inventoryItem('7')],
                pageInfo: { nextCursor: 'cur-2', hasMore: true, limit: 1 },
            },
            {
                ok: true,
                chainIds: [11155111],
                items: [inventoryItem('8')],
                pageInfo: { nextCursor: null, hasMore: false, limit: 1 },
            },
        ]);

        const first = await getWalletInventory({ ownerAddress: '0xowner', limit: 1 }, deps);
        const second = await getWalletInventory(
            {
                ownerAddress: '0xowner',
                limit: 1,
                cursor: asPlatformCursor(first.pageInfo.nextCursor),
            },
            deps
        );

        // Ohne den Cursor antwortet die Plattform 200 mit Seite eins — eine
        // Pruefung auf "Aufruf erfolgreich" wuerde eine Endlosschleife durchlassen.
        expect(paths[0]).not.toContain('cursor=');
        expect(paths[1]).toContain('cursor=cur-2');
        expect(first.items[0]?.tokenId).toBe('7');
        expect(second.items[0]?.tokenId).toBe('8');
    });

    it('nimmt die verkuerzte Collection des Inventars an — nicht die vollstaendige', async () => {
        // Das Inventar legt `buildWalletCollectionSummary` bei: ohne
        // totalSupply, holderCount, coverImageSource, recentTokens, preview und
        // createdAt. Ein Schema auf die vollstaendige Collection haette genau
        // die Zeilen abgewiesen, deren Collection schon indiziert ist — und die
        // ohne Collection durchgelassen. Also ein Fehlerbild, das mit
        // fortschreitender Indizierung schlimmer wird.
        const { deps } = harness([
            {
                ok: true,
                chainIds: [11155111],
                items: [
                    {
                        ...inventoryItem('7'),
                        collection: {
                            _id: '507f1f77bcf86cd799439012',
                            chainId: 11155111,
                            contractAddress: '0xabc',
                            standard: 'erc721',
                            name: 'Testsammlung',
                            symbol: 'TST',
                            description: null,
                            externalUrl: null,
                            imageOriginalUrl: null,
                            bannerImageOriginalUrl: null,
                            featuredImageOriginalUrl: null,
                            animationOriginalUrl: null,
                            audioOriginalUrl: null,
                            interactiveOriginalUrl: null,
                            indexedTokenCount: 42,
                            syncStatus: 'idle',
                            updatedAt: '2026-10-02T10:00:00.000Z',
                        },
                    },
                ],
                pageInfo: { nextCursor: null, hasMore: false, limit: 50 },
            },
        ]);

        const result = await getWalletInventory({ ownerAddress: '0xowner' }, deps);

        expect(result.items[0]?.collection?.name).toBe('Testsammlung');
        expect(result.items[0]?.collection?.indexedTokenCount).toBe(42);
    });

    it('nimmt Zusatzfelder an, statt an einer Erweiterung der Plattform zu brechen', async () => {
        const { deps } = harness([
            {
                ok: true,
                chainIds: [11155111],
                items: [{ ...inventoryItem('7'), unbekanntesFeld: 'spaeter dazugekommen' }],
                pageInfo: { nextCursor: null, hasMore: false, limit: 50 },
            },
        ]);

        const result = await getWalletInventory({ ownerAddress: '0xowner' }, deps);

        expect(result.items).toHaveLength(1);
    });

    it('meldet einen Formfehler als PlatformResponseError mit Fundstelle', async () => {
        const { deps } = harness([{ ok: true, chainIds: [11155111], items: [{}] }]);

        await expect(getWalletInventory({ ownerAddress: '0xowner' }, deps)).rejects.toBeInstanceOf(
            PlatformResponseError
        );
    });
});

describe('discoverTokens', () => {
    it('erreicht die Plattform nicht, wenn die Collection nicht freigegeben ist', async () => {
        isCollectionWhitelisted.mockResolvedValue(false);
        const { paths, deps } = harness([]);

        const result = await discoverTokens([identity('7')], deps);

        expect(paths).toHaveLength(0);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.discoveryStatus).toBe('failed');
        expect(result.items[0]?.message).toMatch(/Whitelist/);
        expect(result.summary).toEqual({ total: 1, ready: 0, queued: 0, failed: 1 });
    });

    it('sendet nur die freigegebenen Identitaeten und fuehrt die abgelehnten daneben', async () => {
        isCollectionWhitelisted.mockImplementation(async (address: string) => address === '0xabc');
        const { paths, bodies, deps } = harness([discoverResponse([discoverItem('7', 'queued')])]);

        const result = await discoverTokens([identity('7'), identity('8', '0xfremd')], deps);

        expect(paths).toEqual(['/api/v1/tokens/discover']);
        expect(bodies[0]).toEqual({ items: [identity('7')] });
        expect(result.items).toHaveLength(2);
        expect(result.summary).toEqual({ total: 2, ready: 0, queued: 1, failed: 1 });
    });

    it('ruft bei leerer Liste gar nicht an', async () => {
        const { paths, deps } = harness([]);

        const result = await discoverTokens([], deps);

        expect(paths).toHaveLength(0);
        expect(result.items).toHaveLength(0);
        expect(result.summary.total).toBe(0);
    });

    it('sendet genau 500 Identitaeten in einem Aufruf — der Deckel ist einschliesslich', async () => {
        const identities = Array.from({ length: DISCOVER_BATCH_LIMIT }, (_, index) =>
            identity(String(index))
        );
        const { paths, bodies, deps } = harness([discoverResponse([])]);

        await discoverTokens(identities, deps);

        expect(paths).toHaveLength(1);
        expect((bodies[0] as { items: unknown[] }).items).toHaveLength(DISCOVER_BATCH_LIMIT);
    });

    it('weist eine Antwort ohne summary ab, statt eine leere Zusammenfassung zu erfinden', async () => {
        const { deps } = harness([{ ok: true, items: [] }]);

        await expect(discoverTokens([identity('7')], deps)).rejects.toBeInstanceOf(
            PlatformResponseError
        );
    });

    it('stueckelt auf Bloecke von hoechstens 500, statt die Plattform abzuweisen', async () => {
        const identities = Array.from({ length: DISCOVER_BATCH_LIMIT + 100 }, (_, index) =>
            identity(String(index))
        );
        const { paths, bodies, deps } = harness([
            discoverResponse([]),
            discoverResponse([]),
        ]);

        await discoverTokens(identities, deps);

        expect(paths).toHaveLength(2);
        expect((bodies[0] as { items: unknown[] }).items).toHaveLength(DISCOVER_BATCH_LIMIT);
        expect((bodies[1] as { items: unknown[] }).items).toHaveLength(100);
    });
});

describe('discoverWalletHoldings', () => {
    it('sendet Eigentuemer und Identitaeten an den Wallet-Discover-Pfad', async () => {
        const { paths, bodies, clientIds, deps } = harness([
            discoverResponse([discoverItem('7', 'ready')]),
        ]);

        const result = await discoverWalletHoldings(
            { ownerAddress: '0xowner', identities: [identity('7')] },
            deps
        );

        expect(paths).toEqual(['/api/v1/owners/wallets/discover']);
        expect(bodies[0]).toEqual({ ownerAddress: '0xowner', items: [identity('7')] });
        expect(clientIds[0]).toBe('alpha-read');
        expect(result.summary).toEqual({ total: 1, ready: 1, queued: 0, failed: 0 });
    });

    it('filtert auch hier vor dem Aufruf', async () => {
        isCollectionWhitelisted.mockResolvedValue(false);
        const { paths, deps } = harness([]);

        const result = await discoverWalletHoldings(
            { ownerAddress: '0xowner', identities: [identity('7')] },
            deps
        );

        expect(paths).toHaveLength(0);
        expect(result.items[0]?.discoveryStatus).toBe('failed');
    });
});

describe('queueTokenRefresh', () => {
    it('stellt den Auftrag ueber den Read-Datensatz', async () => {
        const { paths, bodies, clientIds, deps } = harness([refreshBody]);

        const job = await queueTokenRefresh(identity('7'), deps);

        expect(paths).toEqual(['/api/v1/refresh/token']);
        expect(bodies[0]).toEqual(identity('7'));
        expect(clientIds[0]).toBe('alpha-read');
        expect(job?.jobId).toBe('job-1');
    });

    it('nimmt "laeuft schon" als Erfolg an — 202 mit status running ist kein Fehler', async () => {
        const { deps } = harness(
            [{ ok: true, jobId: 'job-1', queueJobId: 'queue-1', status: 'running' }],
            202
        );

        const job = await queueTokenRefresh(identity('7'), deps);

        expect(job?.status).toBe('running');
    });

    it('gibt null zurueck und ruft nicht an, wenn die Collection nicht freigegeben ist', async () => {
        isCollectionWhitelisted.mockResolvedValue(false);
        const { paths, deps } = harness([]);

        const job = await queueTokenRefresh(identity('7'), deps);

        expect(job).toBeNull();
        expect(paths).toHaveLength(0);
    });
});

describe('queueCollectionRefresh', () => {
    it('ist der einzige Aufruf ueber den Ops-Datensatz — refresh:collection fehlt alpha-read', async () => {
        const { paths, clientIds, deps } = harness([refreshBody]);

        const job = await queueCollectionRefresh({ chainId: 11155111, contractAddress: '0xabc' }, deps);

        expect(paths).toEqual(['/api/v1/refresh/collection']);
        expect(clientIds[0]).toBe('alpha-ops');
        expect(job?.status).toBe('queued');
    });

    it('gibt null zurueck und ruft nicht an, wenn die Collection nicht freigegeben ist', async () => {
        isCollectionWhitelisted.mockResolvedValue(false);
        const { paths, deps } = harness([]);

        const job = await queueCollectionRefresh(
            { chainId: 11155111, contractAddress: '0xabc' },
            deps
        );

        expect(job).toBeNull();
        expect(paths).toHaveLength(0);
    });
});
