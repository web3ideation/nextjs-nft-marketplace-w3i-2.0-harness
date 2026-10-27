/**
 * Datei: src/app/api/nft/detail/route.test.ts
 *
 * Zweck: Belegt die Quellenwahl der Detailroute — Flag aus, Plattform-Erfolg,
 * Plattform-Ausfall mit Rückfall, Formfehler ohne Rückfall — und die Zahl der
 * Plattform-Aufrufe.
 *
 * Wichtig:
 * - MongoDB, `blockchainStateSync`, `ipfsMetadataLazySync` und die
 *   Lesemethoden der Plattform sind ersetzt. Die Route hat keine einspeisbare
 *   Datenquelle, und ihr eine zu geben wäre ein Umbau aller Routen — das
 *   Ersetzen der Module ist hier der kleinere Eingriff.
 * - **Der Test zur Aufrufzahl ist der wichtigste.** Drei Plattform-Aufrufe je
 *   Detailanfrage sind das Performance-Budget dieser Route (V22), und sie
 *   verdreifachen sich über ihre vier Aufrufer — `CartPage` ruft sie für jede
 *   Warenkorbposition gleichzeitig. Eine vierte Abfrage, versehentlich
 *   hinzugefügt, fällt sonst erst unter Last auf.
 * - **Der Test zum `blockchain`-Block ist der zweitwichtigste.** Bliebe er im
 *   Plattform-Pfad leer, holte `useMarketplaceItemDetail` jede
 *   ERC-1155-Detailseite ein zweites Mal mit `refresh=true` — sechs
 *   Plattform-Aufrufe statt drei (Advisor-Befund 8b).
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findOne = vi.fn();
const aggregate = vi.fn();
const syncNFTState = vi.fn();
const ensureMetadata = vi.fn();
const getTokenDetail = vi.fn();
const getTokenOwners = vi.fn();
const getCollectionDetail = vi.fn();

vi.mock('@/lib/mongodb', () => ({
    getCollection: vi.fn(async (name: string) => ({
        findOne: (filter: unknown) => findOne(name, filter),
        aggregate: () => ({ toArray: async () => aggregate(name) }),
    })),
}));

vi.mock('@/services/nft-sync/blockchain-state-sync', () => ({
    blockchainStateSync: { syncNFTState: (...args: unknown[]) => syncNFTState(...args) },
}));

vi.mock('@/services/nft-sync/ipfs-metadata-lazy-sync', () => ({
    ipfsMetadataLazySync: { ensureMetadata: (...args: unknown[]) => ensureMetadata(...args) },
}));

vi.mock('@/lib/nft-data-platform/read', () => ({
    getTokenDetail: (...args: unknown[]) => getTokenDetail(...args),
    getTokenOwners: (...args: unknown[]) => getTokenOwners(...args),
    getCollectionDetail: (...args: unknown[]) => getCollectionDetail(...args),
}));

const { GET } = await import('@/app/api/nft/detail/route');

/** Lokaler `nft_metadata`-Stand, inklusive Chain-Block. */
const localNft = {
    contractAddress: '0xabc',
    tokenId: '7',
    metadataFetchVersion: 2,
    metadata: { name: 'Lokaler Name', description: 'lokal', image: 'ipfs://lokal.png' },
    contract: { name: 'Lokale Sammlung', symbol: 'LOC', contractType: 'ERC721', owner: '0xlokal' },
    ownershipBalances: { '0xlokal': 1 },
    blockchain: {
        owner: '0xlokal',
        approved: '0x1107eb26d47a5bf88e9a9f97cbc7ea38c3e1d7ec',
        isApprovedForAll: true,
        lastSyncedAt: new Date(),
    },
};

const platformToken = {
    _id: 'tok1',
    chainId: 11155111,
    contractAddress: '0xabc',
    tokenId: '7',
    standard: 'ERC721',
    name: 'Plattform-Name',
    description: 'von der Plattform',
    externalUrl: null,
    imageOriginalUrl: 'ipfs://roh.png',
    animationOriginalUrl: null,
    audioOriginalUrl: null,
    interactiveOriginalUrl: null,
    supplyQuantity: null,
    metadataStatus: 'ready',
    mediaStatus: 'ready',
    metadataPayload: null,
    attributes: [],
    creator: null,
    media: {
        image: {
            kind: 'image',
            cdnUrlOriginal: 'https://cdn.example.test/o.png',
            cdnUrlOptimized: 'https://cdn.example.test/o.webp',
            cdnUrlThumbnail: null,
            mimeType: 'image/png',
            width: 10,
            height: 10,
            durationSec: null,
            status: 'ready',
        },
        animation: null,
        audio: null,
    },
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
};

const platformOwners = {
    ok: true as const,
    standard: 'ERC721' as const,
    items: [
        {
            chainId: 11155111,
            contractAddress: '0xabc',
            tokenId: '7',
            ownerAddress: '0xPLATTFORM',
            updatedAt: '2026-10-02T10:00:00.000Z',
        },
    ],
    pageInfo: { limit: 50, hasMore: false, nextCursor: null },
};

const platformCollection = {
    _id: 'col1',
    chainId: 11155111,
    contractAddress: '0xabc',
    standard: 'ERC721',
    name: 'Plattform-Sammlung',
    symbol: 'PLT',
    description: null,
    externalUrl: null,
    imageOriginalUrl: null,
    bannerImageOriginalUrl: null,
    featuredImageOriginalUrl: null,
    totalSupply: null,
    indexedTokenCount: 1,
    holderCount: 1,
    syncStatus: 'idle',
    coverImageSource: 'none',
    recentTokens: [],
    preview: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
};

/**
 * Baut eine Anfrage an die Route.
 *
 * @returns NextRequest auf die Detailroute
 */
function detailRequest(): NextRequest {
    return new NextRequest('http://localhost:3000/api/nft/detail?contractAddress=0xAbC&tokenId=7');
}

/**
 * Ruft die Route und liest die Nutzlast.
 *
 * @returns geparster Antwortkörper
 */
async function callRoute(): Promise<Record<string, unknown>> {
    const response = await GET(detailRequest());
    const envelope = (await response.json()) as { success: boolean; data?: Record<string, unknown> };

    // apiSuccess huellt die Nutzlast in { success, data } — die vier Aufrufer
    // der Route lesen ebenfalls response.data, nicht die Wurzel.
    return envelope.data ?? { success: envelope.success };
}

beforeEach(() => {
    vi.clearAllMocks();

    findOne.mockImplementation(async (name: string) => (name === 'nft_metadata' ? localNft : null));
    aggregate.mockResolvedValue([]);
    syncNFTState.mockResolvedValue(undefined);
    ensureMetadata.mockResolvedValue(undefined);
    getTokenDetail.mockResolvedValue(platformToken);
    getTokenOwners.mockResolvedValue(platformOwners);
    getCollectionDetail.mockResolvedValue(platformCollection);

    delete process.env.NFT_DATA_PLATFORM_ENABLED;
    process.env.NFT_API_BASE_URL = 'https://platform.example.test';
    process.env.NFT_API_READ_CLIENT_ID = 'alpha-read';
    process.env.NFT_API_READ_KEY = 'read-key-123456';
    process.env.NFT_API_READ_SECRET = 'read-secret';
    process.env.NFT_API_OPS_CLIENT_ID = 'alpha-ops';
    process.env.NFT_API_OPS_KEY = 'ops-key-123456';
    process.env.NFT_API_OPS_SECRET = 'ops-secret';
});

afterEach(() => {
    delete process.env.NFT_DATA_PLATFORM_ENABLED;
});

describe('Flag aus — der heutige Weg, unverändert', () => {
    it('ruft keinen Plattform-Endpunkt', async () => {
        const body = await callRoute();

        expect(getTokenDetail).not.toHaveBeenCalled();
        expect(getTokenOwners).not.toHaveBeenCalled();
        expect(getCollectionDetail).not.toHaveBeenCalled();
        expect(body.dataSource).toBe('local-fallback');
        expect(body.staleWarning).toBe(false);
    });

    it('liefert die lokalen Metadaten', async () => {
        const body = await callRoute();
        const metadata = body.metadata as Record<string, unknown>;

        expect(metadata.name).toBe('Lokaler Name');
    });
});

describe('Flag an, Plattform antwortet', () => {
    beforeEach(() => {
        process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
    });

    it('nimmt Metadaten und Contract-Angaben von der Plattform', async () => {
        const body = await callRoute();
        const metadata = body.metadata as Record<string, unknown>;
        const contract = body.contract as Record<string, unknown>;

        expect(body.dataSource).toBe('platform');
        expect(body.staleWarning).toBe(false);
        expect(metadata.name).toBe('Plattform-Name');
        expect(contract.name).toBe('Plattform-Sammlung');
    });

    it('nutzt ausschließlich CDN-URLs als Bildquelle (V31)', async () => {
        const body = await callRoute();
        const metadata = body.metadata as Record<string, unknown>;

        expect(metadata.image).toBe('https://cdn.example.test/o.webp');
        expect(String(metadata.image)).not.toContain('ipfs://');
    });

    it('lädt keine IPFS-Metadaten nach (V4)', async () => {
        await callRoute();

        expect(ensureMetadata).not.toHaveBeenCalled();
    });

    it('löst genau DREI Plattform-Aufrufe aus — das Budget dieser Route (V22)', async () => {
        await callRoute();

        const aufrufe =
            getTokenDetail.mock.calls.length +
            getTokenOwners.mock.calls.length +
            getCollectionDetail.mock.calls.length;

        expect(aufrufe).toBe(3);
    });

    it('lässt den blockchain-Block und approvalStatus gefüllt (Advisor-Befund 8b)', async () => {
        const body = await callRoute();
        const blockchain = body.blockchain as Record<string, unknown>;
        const approvalStatus = body.approvalStatus as Record<string, unknown>;

        // Bliebe isApprovedForAll falsch, holte useMarketplaceItemDetail jede
        // ERC-1155-Detailseite ein zweites Mal mit refresh=true.
        expect(blockchain.isApprovedForAll).toBe(true);
        expect(blockchain.approved).toBe('0x1107eb26d47a5bf88e9a9f97cbc7ea38c3e1d7ec');
        expect(approvalStatus.hasOperatorApproval).toBe(true);
    });

    it('überspringt den Chain-Sync nicht, wenn der lokale Stand veraltet ist', async () => {
        // Der Plattform-Pfad darf den Chain-Zustand nicht als erledigt
        // betrachten: die Plattform liefert ihn nicht, und ein leerer Block
        // löst die ERC-1155-Doppelabfrage aus (Advisor-Befund 8b).
        findOne.mockImplementation(async (name: string) =>
            name === 'nft_metadata'
                ? { ...localNft, blockchain: { ...localNft.blockchain, lastSyncedAt: new Date(0) } }
                : null
        );

        await callRoute();

        expect(syncNFTState).toHaveBeenCalledTimes(1);
    });

    it('synchronisiert bei frischem Stand nicht erneut', async () => {
        await callRoute();

        expect(syncNFTState).not.toHaveBeenCalled();
    });

    it('übernimmt die Guthaben aus der Ownership-Antwort, kleingeschrieben', async () => {
        const body = await callRoute();
        const ownership = body.ownership as Record<string, unknown>;
        const balances = ownership.balances as Record<string, number>;

        expect(balances).toHaveProperty('0xplattform');
        expect(balances['0xplattform']).toBe(1);
    });
});

describe('Flag an, Plattform fällt aus', () => {
    beforeEach(() => {
        process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
    });

    it('fällt auf den lokalen Stand zurück und kennzeichnet ihn (V32)', async () => {
        const { PlatformUnavailableError } = await import('@/lib/nft-data-platform/errors');
        getTokenDetail.mockRejectedValue(new PlatformUnavailableError('aus', 503, null));

        const body = await callRoute();
        const metadata = body.metadata as Record<string, unknown>;

        expect(body.dataSource).toBe('local-fallback');
        expect(body.staleWarning).toBe(true);
        expect(metadata.name).toBe('Lokaler Name');
    });

    it('bleibt im Ausfall nutzbar — Antwort mit Stats und Listing statt Fehlerseite', async () => {
        const { PlatformTimeoutError } = await import('@/lib/nft-data-platform/errors');
        getTokenOwners.mockRejectedValue(new PlatformTimeoutError('zu lang', 10_000));

        const body = await callRoute();

        expect(body.staleWarning).toBe(true);
        expect(body).toHaveProperty('stats');
        expect(body).toHaveProperty('blockchain');
    });

    it('fällt bei einer unverständlichen Antwort NICHT zurück', async () => {
        const { PlatformResponseError } = await import('@/lib/nft-data-platform/errors');
        getTokenDetail.mockRejectedValue(new PlatformResponseError('kein JSON', 502, null));

        // Kein Rückfall: wir wissen nicht, was wir bekommen haben, und eine
        // lokale Antwort würde den Fehler in gültig aussehende Daten verwandeln.
        await expect(callRoute()).resolves.toMatchObject({ success: false });
    });
});
