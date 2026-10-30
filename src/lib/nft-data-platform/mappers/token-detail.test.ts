/**
 * Datei: src/lib/nft-data-platform/mappers/token-detail.test.ts
 *
 * Zweck: Vertragstest des Detail-Mappers (V27).
 *
 * Wichtig:
 * - Der Block „Was die Überlagerung NICHT enthält" ist der wichtigste. Ein
 *   `blockchain`-Feld in der Überlagerung würde den lokalen Chain-Zustand
 *   verdecken, `isApprovedForAll` wäre dauerhaft falsch, und
 *   `useMarketplaceItemDetail` holte jede ERC-1155-Detailseite ein zweites Mal
 *   mit `refresh=true` — sechs Plattform-Aufrufe statt drei (Advisor-Befund 8b).
 *   Der Test nagelt die Abwesenheit fest, nicht nur die Anwesenheit.
 */

import { describe, expect, it } from 'vitest';

import {
    buildTokenDetailOverlay,
    mapPlatformOwnersToBalances,
    mapPlatformTokenToMetadata,
} from '@/lib/nft-data-platform/mappers/token-detail';
import type {
    PlatformCollection,
    PlatformToken,
    PlatformTokenOwnersResponse,
} from '@/lib/nft-data-platform/types';

/**
 * Baut ein Medien-Asset.
 *
 * @param overrides - Felder, die abweichen sollen
 * @returns Medien-Asset in Plattform-Form
 */
function asset(overrides: Partial<NonNullable<PlatformToken['media']['image']>> = {}) {
    return {
        kind: 'image',
        cdnUrlOriginal: 'https://cdn.example.test/o.png',
        cdnUrlOptimized: 'https://cdn.example.test/o.webp',
        cdnUrlThumbnail: 'https://cdn.example.test/t.webp',
        mimeType: 'image/png',
        width: 1200,
        height: 800,
        durationSec: null,
        status: 'ready',
        ...overrides,
    };
}

/**
 * Baut ein Token.
 *
 * @param overrides - Felder, die abweichen sollen
 * @returns Token in Plattform-Form
 */
function token(overrides: Partial<PlatformToken> = {}): PlatformToken {
    return {
        _id: 'tok1',
        chainId: 11155111,
        contractAddress: '0xAbC',
        tokenId: '7',
        standard: 'erc721',
        name: 'Affe Nummer sieben',
        description: 'Ein Affe.',
        externalUrl: 'https://example.test/7',
        imageOriginalUrl: 'ipfs://bafy/7.png',
        animationOriginalUrl: null,
        audioOriginalUrl: null,
        interactiveOriginalUrl: null,
        supplyQuantity: null,
        metadataStatus: 'ready',
        mediaStatus: 'ready',
        metadataPayload: { name: 'Affe Nummer sieben' },
        attributes: [{ trait_type: 'Fell', value: 'braun' }],
        creator: null,
        media: { image: asset(), animation: null, audio: null },
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
        ...overrides,
    };
}

/**
 * Baut eine Collection.
 *
 * @returns Collection in Plattform-Form
 */
function collection(): PlatformCollection {
    return {
        _id: 'col1',
        chainId: 11155111,
        contractAddress: '0xAbC',
        standard: 'erc721',
        name: 'Affensammlung',
        symbol: 'APE',
        description: null,
        externalUrl: null,
        imageOriginalUrl: null,
        bannerImageOriginalUrl: null,
        featuredImageOriginalUrl: null,
        totalSupply: '100',
        indexedTokenCount: 100,
        holderCount: 40,
        syncStatus: 'idle',
        coverImageSource: 'preview-token',
        recentTokens: [],
        preview: null,
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
    };
}

const pageInfo = { limit: 50, hasMore: false, nextCursor: null };

/**
 * Baut eine ERC-721-Ownership-Antwort.
 *
 * @param ownerAddress - Eigentümer
 * @returns Ownership-Antwort
 */
function erc721Owners(ownerAddress: string): PlatformTokenOwnersResponse {
    return {
        ok: true,
        standard: 'erc721',
        items: [
            {
                chainId: 11155111,
                contractAddress: '0xAbC',
                tokenId: '7',
                ownerAddress,
                updatedAt: '2026-10-02T10:00:00.000Z',
            },
        ],
        pageInfo,
    };
}

/**
 * Baut eine ERC-1155-Ownership-Antwort.
 *
 * @param rows - Adresse und Guthaben je Zeile
 * @returns Ownership-Antwort
 */
function erc1155Owners(rows: Array<[string, string]>): PlatformTokenOwnersResponse {
    return {
        ok: true,
        standard: 'erc1155',
        items: rows.map(([ownerAddress, balance]) => ({
            chainId: 11155111,
            contractAddress: '0xAbC',
            tokenId: '7',
            ownerAddress,
            balance,
            updatedAt: '2026-10-02T10:00:00.000Z',
        })),
        pageInfo,
    };
}

describe('Was die Überlagerung NICHT enthält (Advisor-Befund 8b)', () => {
    it('trägt kein blockchain-Feld — der lokale Chain-Zustand darf nicht verdeckt werden', () => {
        const overlay = buildTokenDetailOverlay({
            token: token(),
            owners: erc721Owners('0xDEF'),
            collection: collection(),
        });

        expect(overlay).not.toHaveProperty('blockchain');
        expect(overlay).not.toHaveProperty('approvalStatus');
    });

    it('überlagert genau vier Felder und keines mehr', () => {
        const overlay = buildTokenDetailOverlay({
            token: token(),
            owners: erc721Owners('0xDEF'),
            collection: collection(),
        });

        expect(Object.keys(overlay).sort()).toEqual(
            ['metadata', 'contract', 'ownershipBalances', 'metadataFetchVersion'].sort()
        );
    });

    it('setzt metadataFetchVersion hoch genug, dass die Route kein IPFS nachlädt (V4)', () => {
        const overlay = buildTokenDetailOverlay({
            token: token(),
            owners: erc721Owners('0xDEF'),
            collection: collection(),
        });

        expect(overlay.metadataFetchVersion).toBeGreaterThanOrEqual(2);
    });
});

describe('Metadaten und Medien (V31)', () => {
    it('nimmt das optimierte Bild, wenn es da ist', () => {
        const metadata = mapPlatformTokenToMetadata(token());

        expect(metadata.image).toBe('https://cdn.example.test/o.webp');
        expect(metadata.imageOriginal).toBe('https://cdn.example.test/o.png');
        expect(metadata.images).toEqual({
            original: 'https://cdn.example.test/o.png',
            optimized: 'https://cdn.example.test/o.webp',
            thumbnail: 'https://cdn.example.test/t.webp',
        });
    });

    it('fällt auf das Original zurück, wenn nur das da ist', () => {
        const metadata = mapPlatformTokenToMetadata(
            token({ media: { image: asset({ cdnUrlOptimized: null, cdnUrlThumbnail: null }), animation: null, audio: null } })
        );

        expect(metadata.image).toBe('https://cdn.example.test/o.png');
    });

    it('ergibt eine leere Zeichenkette, wenn alle drei fehlen — ein Zustand, kein Fehler', () => {
        const metadata = mapPlatformTokenToMetadata(
            token({
                media: {
                    image: asset({ cdnUrlOriginal: null, cdnUrlOptimized: null, cdnUrlThumbnail: null, status: 'pending' }),
                    animation: null,
                    audio: null,
                },
            })
        );

        expect(metadata.image).toBe('');
        expect(metadata.images.original).toBeNull();
    });

    it('verkraftet ein Token ohne Bild', () => {
        const metadata = mapPlatformTokenToMetadata(
            token({ media: { image: null, animation: null, audio: null } })
        );

        expect(metadata.image).toBe('');
        expect(metadata.imageMeta).toEqual({ width: null, height: null, mimeType: null });
    });

    it('nutzt keine ipfs://-URL als Bildquelle — nur CDN-URLs (V31)', () => {
        const metadata = mapPlatformTokenToMetadata(token());

        expect(metadata.image).not.toContain('ipfs://');
        expect(metadata.imageOriginal).not.toContain('ipfs://');
    });

    it('reicht Attribute unverändert durch, statt sie umzuformen', () => {
        const metadata = mapPlatformTokenToMetadata(token());

        expect(metadata.attributes).toEqual([{ trait_type: 'Fell', value: 'braun' }]);
    });

    it('macht aus einer fehlenden Beschreibung eine leere Zeichenkette wie der lokale Pfad', () => {
        const metadata = mapPlatformTokenToMetadata(token({ description: null }));

        expect(metadata.description).toBe('');
    });

    it('erfindet keinen blurDataURL', () => {
        expect(mapPlatformTokenToMetadata(token()).blurDataURL).toBeNull();
    });
});

describe('Guthaben', () => {
    it('gibt bei ERC721 genau einen Eigentümer mit Guthaben 1', () => {
        const balances = mapPlatformOwnersToBalances(erc721Owners('0xDEF'));

        expect(balances).toEqual({ '0xdef': 1 });
    });

    it('schreibt Adressen klein, damit der Vergleich in der Route trägt', () => {
        const balances = mapPlatformOwnersToBalances(erc721Owners('0xAbCdEf'));

        expect(Object.keys(balances)).toEqual(['0xabcdef']);
    });

    it('summiert bei ERC1155 nichts, sondern führt die Zeilen', () => {
        const balances = mapPlatformOwnersToBalances(
            erc1155Owners([
                ['0xaaa', '5'],
                ['0xbbb', '3'],
                ['0xccc', '1'],
            ])
        );

        expect(balances).toEqual({ '0xaaa': 5, '0xbbb': 3, '0xccc': 1 });
    });

    it('überspringt eine unlesbare Menge, statt die Detailseite zu leeren', () => {
        const balances = mapPlatformOwnersToBalances(
            erc1155Owners([
                ['0xaaa', '5'],
                ['0xbbb', 'viele'],
                ['0xccc', '0'],
            ])
        );

        expect(balances).toEqual({ '0xaaa': 5 });
    });

    it('verkraftet eine leere Eigentümerliste', () => {
        const balances = mapPlatformOwnersToBalances(erc1155Owners([]));

        expect(balances).toEqual({});
    });
});

describe('Contract-Teil', () => {
    it('nimmt Name und Symbol aus der Collection', () => {
        const overlay = buildTokenDetailOverlay({
            token: token(),
            owners: erc721Owners('0xDEF'),
            collection: collection(),
        });

        expect(overlay.contract.name).toBe('Affensammlung');
        expect(overlay.contract.symbol).toBe('APE');
    });

    it('verkraftet eine fehlende Collection — Token ohne Collection ist ein benannter Zustand', () => {
        const overlay = buildTokenDetailOverlay({
            token: token(),
            owners: erc721Owners('0xDEF'),
            collection: null,
        });

        expect(overlay.contract.name).toBeNull();
        expect(overlay.contract.symbol).toBeNull();
        expect(overlay.contract.address).toBe('0xAbC');
    });

    it('schreibt contractType GROSS — die Route vergleicht gegen ERC1155, die Plattform liefert klein', () => {
        const overlay = buildTokenDetailOverlay({
            token: token({ standard: 'erc1155' }),
            owners: erc1155Owners([['0xaaa', '2']]),
            collection: collection(),
        });

        expect(overlay.contract.contractType).toBe('ERC1155');
    });

    it('setzt Eigentümer und Guthaben auf den größten Halter', () => {
        const overlay = buildTokenDetailOverlay({
            token: token({ standard: 'erc1155' }),
            owners: erc1155Owners([
                ['0xaaa', '2'],
                ['0xbbb', '9'],
                ['0xccc', '4'],
            ]),
            collection: collection(),
        });

        expect(overlay.contract.owner).toBe('0xbbb');
        expect(overlay.contract.ownerBalance).toBe(9);
    });

    it('lässt Eigentümer null, wenn niemand ein Guthaben hat', () => {
        const overlay = buildTokenDetailOverlay({
            token: token({ standard: 'erc1155' }),
            owners: erc1155Owners([]),
            collection: collection(),
        });

        expect(overlay.contract.owner).toBeNull();
        expect(overlay.contract.ownerBalance).toBeNull();
    });

    it('rät keine tokenURI — das Feld ist in A3a nicht gepickt', () => {
        const overlay = buildTokenDetailOverlay({
            token: token(),
            owners: erc721Owners('0xDEF'),
            collection: collection(),
        });

        expect(overlay.contract.tokenURI).toBeNull();
    });
});
