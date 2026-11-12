/**
 * Datei: src/app/api/collections/route.test.ts
 *
 * Zweck: Belegt die Quellenwahl der Collections-Übersicht — Flag aus,
 * Plattform-Erfolg, Plattform-Ausfall mit Rückfall, fehlender Treffer — und
 * vor allem die **Zahl** der Plattform-Aufrufe.
 *
 * Wichtig:
 * - **Der Test zur Aufrufzahl ist der wichtigste.** Zwölf Collections dürfen
 *   genau einen Aufruf erzeugen, nicht zwölf. Die Listenantwort der Plattform
 *   trägt pro Element schon alles, was die Detailantwort trägt; wer je
 *   Contract einen Detailaufruf baut, bekommt dieselben Daten und das
 *   Zwölffache an Last — und das fällt ohne diesen Test erst unter Last auf.
 * - MongoDB und die Lesemethode der Plattform sind ersetzt. Die Route hat
 *   keine einspeisbare Datenquelle; ihr eine zu geben wäre ein Umbau aller
 *   Routen.
 * - Die Attrappe der Plattform folgt dem **Plattform-Code** (Stand `2812315`),
 *   nicht dem eigenen Schema — am 30.10.2026 war die umgekehrte Reihenfolge
 *   die Ursache dafür, dass zwei falsche Hüllen grün durchliefen.
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const aggregate = vi.fn();
const find = vi.fn();
const listCollections = vi.fn();

vi.mock('@/lib/mongodb', () => ({
    getCollection: vi.fn(async (name: string) => ({
        aggregate: (pipeline: unknown) => ({ toArray: async () => aggregate(name, pipeline) }),
        find: (filter: unknown) => ({ toArray: async () => find(name, filter) }),
    })),
}));

vi.mock('@/lib/nft-data-platform/read', () => ({
    listCollections: (...args: unknown[]) => listCollections(...args),
}));

const { GET } = await import('@/app/api/collections/route');

/** Contract-Adresse in der Schreibweise, die die Plattform liefert. */
const CONTRACT_MIXED = '0xAbCdEf0123456789abcdef0123456789ABCDEF01';
const CONTRACT_LOWER = CONTRACT_MIXED.toLowerCase();

/** Eine Zeile der `marketplace_items`-Aggregation. */
function listedCollection(contractAddress: string) {
    return {
        _id: contractAddress,
        contractAddress,
        itemCount: 3,
        erc721ItemCount: 3,
        erc1155ItemCount: 0,
        erc1155ListedUnits: 0,
        erc1155RemainingUnits: 0,
        partialBuyEnabledCount: 0,
        totalValue: 0,
        averagePrice: null,
        uniqueSellers: ['0xseller'],
        tokenIds: ['1', '2', '3'],
        listings: [],
    };
}

/** Eine Collection, wie `serializeEnrichedCollections` sie liefert. */
function platformCollection(contractAddress: string, overrides: Record<string, unknown> = {}) {
    return {
        _id: '507f1f77bcf86cd799439011',
        chainId: 11155111,
        contractAddress,
        standard: 'erc721',
        name: 'Plattform-Sammlung',
        symbol: 'PLT',
        description: null,
        externalUrl: null,
        imageOriginalUrl: null,
        bannerImageOriginalUrl: null,
        featuredImageOriginalUrl: null,
        totalSupply: '1000',
        indexedTokenCount: 42,
        holderCount: 17,
        syncStatus: 'idle',
        coverImageSource: 'preview',
        recentTokens: [],
        preview: null,
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
        ...overrides,
    };
}

/** Eine Seite der Listenantwort. */
function page(items: unknown[], hasMore = false, nextCursor: string | null = null) {
    return { ok: true, items, pageInfo: { limit: 200, hasMore, nextCursor } };
}

/** Der lokale Rückfallweg: `nft_metadata`-Aggregation mit Name und Symbol. */
function localContractInfo(contractAddress: string) {
    return {
        _id: contractAddress,
        contractName: 'Lokale Sammlung',
        contractSymbol: 'LOC',
        tokenIdCount: 5,
        maxNumericTokenId: 4,
        contractDeclaredSupply: 0,
        totalSupplyUnits: 0,
    };
}

async function callRoute(): Promise<Record<string, unknown>> {
    const response = await GET(new NextRequest('http://localhost/api/collections'));
    const body = await response.json();

    return body.data ?? body;
}

beforeEach(() => {
    // mockReset statt clearAllMocks: clear leert nur die Aufrufliste, nicht
    // die Warteschlange aus mockResolvedValueOnce — ein übrig gebliebener
    // Eintrag des Seitentests lief sonst in den nächsten Test hinein und machte
    // die Aufrufzahl von der Testreihenfolge abhängig. resetAllMocks wäre zu
    // grob: es löscht auch die Implementierung der getCollection-Attrappe, die
    // in der vi.mock-Factory steht und hier nicht neu gesetzt wird.
    aggregate.mockReset();
    find.mockReset();
    listCollections.mockReset();

    aggregate.mockImplementation(async (name: string) => {
        if (name === 'marketplace_items') {
            return [listedCollection(CONTRACT_LOWER)];
        }
        if (name === 'nft_metadata') {
            return [localContractInfo(CONTRACT_LOWER)];
        }

        return [];
    });
    find.mockResolvedValue([]);
    listCollections.mockResolvedValue(page([platformCollection(CONTRACT_MIXED)]));

    delete process.env.NFT_DATA_PLATFORM_ENABLED;
    process.env.NFT_API_BASE_URL = 'https://platform.example.test';
    process.env.NFT_API_READ_CLIENT_ID = 'alpha-read';
    process.env.NFT_API_READ_KEY = 'read-key';
    process.env.NFT_API_READ_SECRET = 'read-secret';
    process.env.NFT_API_OPS_CLIENT_ID = 'alpha-ops';
    process.env.NFT_API_OPS_KEY = 'ops-key';
    process.env.NFT_API_OPS_SECRET = 'ops-secret';
});

afterEach(() => {
    delete process.env.NFT_DATA_PLATFORM_ENABLED;
});

describe('Flag aus — der heutige Weg, unverändert', () => {
    it('ruft die Plattform nicht und meldet local-fallback', async () => {
        const body = await callRoute();

        expect(listCollections).not.toHaveBeenCalled();
        expect(body.dataSource).toBe('local-fallback');
        expect(body.staleWarning).toBe(false);
    });

    it('liefert den lokalen Namen', async () => {
        const body = await callRoute();
        const collections = body.collections;

        expect(Array.isArray(collections) && collections[0].contractName).toBe('Lokale Sammlung');
    });
});

describe('Aufrufzahl — der Kern dieses Pakets', () => {
    beforeEach(() => {
        process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
    });

    it('erzeugt für zwölf Collections genau EINEN Plattform-Aufruf', async () => {
        const contracts = Array.from({ length: 12 }, (_, i) =>
            `0x${String(i).padStart(40, '0')}`
        );

        aggregate.mockImplementation(async (name: string) => {
            if (name === 'marketplace_items') {
                return contracts.map((address) => listedCollection(address));
            }
            if (name === 'nft_metadata') {
                return contracts.map((address) => localContractInfo(address));
            }

            return [];
        });
        listCollections.mockResolvedValue(page(contracts.map((address) => platformCollection(address))));

        const body = await callRoute();

        expect(listCollections).toHaveBeenCalledTimes(1);
        expect(body.dataSource).toBe('platform');
    });

    it('holt bei hasMore genau eine zweite Seite, nie eine dritte', async () => {
        listCollections
            .mockResolvedValueOnce(page([platformCollection(CONTRACT_MIXED)], true, 'cursor-2'))
            .mockResolvedValueOnce(page([platformCollection('0xzweite')], true, 'cursor-3'))
            .mockResolvedValueOnce(page([platformCollection('0xdritte')], true, 'cursor-4'));

        await callRoute();

        expect(listCollections).toHaveBeenCalledTimes(2);
    });

    it('hört nach der ersten Seite auf, wenn hasMore falsch ist', async () => {
        await callRoute();

        expect(listCollections).toHaveBeenCalledTimes(1);
    });

    it('fordert den Höchstumfang an, statt in kleinen Seiten zu blättern', async () => {
        await callRoute();

        expect(listCollections).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
    });
});

describe('Plattform-Pfad — die Felder', () => {
    beforeEach(() => {
        process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
    });

    it('findet den Treffer trotz abweichender Schreibweise der Adresse', async () => {
        const body = await callRoute();
        const collections = body.collections;

        expect(Array.isArray(collections) && collections[0].contractName).toBe('Plattform-Sammlung');
        expect(body.staleWarning).toBe(false);
    });

    it('nimmt Name, Symbol und Umfang aus der Plattform', async () => {
        const body = await callRoute();
        const collections = body.collections;
        const first = Array.isArray(collections) ? collections[0] : null;

        expect(first.contractName).toBe('Plattform-Sammlung');
        expect(first.contractSymbol).toBe('PLT');
        expect(first.totalSupply).toBe(1000);
    });

    it('trägt holderCount und indexedTokenCount als neue Felder, ohne uniqueOwners zu ändern', async () => {
        const body = await callRoute();
        const collections = body.collections;
        const first = Array.isArray(collections) ? collections[0] : null;

        expect(first.holderCount).toBe(17);
        expect(first.indexedTokenCount).toBe(42);
        expect(first.uniqueOwners).toBe(1);
    });
});

describe('Rückfallweg (V32)', () => {
    beforeEach(() => {
        process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
    });

    it('antwortet bei einem Ausfall mit 200, lokalen Namen und staleWarning', async () => {
        listCollections.mockRejectedValue(new Error('platform down'));

        const response = await GET(new NextRequest('http://localhost/api/collections'));
        const body = await response.json();
        const data = body.data ?? body;
        const collections = data.collections;

        expect(response.status).toBe(200);
        expect(data.staleWarning).toBe(true);
        expect(data.dataSource).toBe('local-fallback');
        expect(Array.isArray(collections) && collections[0].contractName).toBe('Lokale Sammlung');
    });

    it('behält den lokalen Namen und setzt staleWarning, wenn ein Contract fehlt', async () => {
        listCollections.mockResolvedValue(page([platformCollection('0xeinganzandererContract')]));

        const body = await callRoute();
        const collections = body.collections;

        expect(body.dataSource).toBe('platform');
        expect(body.staleWarning).toBe(true);
        expect(Array.isArray(collections) && collections[0].contractName).toBe('Lokale Sammlung');
    });
});
