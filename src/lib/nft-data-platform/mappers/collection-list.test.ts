/**
 * Datei: src/lib/nft-data-platform/mappers/collection-list.test.ts
 *
 * Zweck: Belegt die Abbildung einer Plattform-Collection auf die Felder, die
 * `/api/collections` anzeigt — Schlüssel, Bildvorrang, Umfang.
 *
 * Wichtig:
 * - Die Attrappen folgen dem **Plattform-Code**, nicht dem eigenen Schema. Am
 *   30.10.2026 war genau das die Ursache dafür, dass zwei falsche Hüllen grün
 *   durchliefen: die Attrappen folgten dem Schema, also belegte grün nichts.
 * - Der Test zum kleingeschriebenen Schlüssel ist der wichtigste. Ein Treffer,
 *   der ausbleibt, fällt nicht als Fehler auf — die Route zeigt dann still den
 *   lokalen Namen weiter.
 */

import { describe, expect, it } from 'vitest';
import { buildCollectionOverlayMap } from '@/lib/nft-data-platform/mappers/collection-list';
import type { PlatformCollection } from '@/lib/nft-data-platform/types';

/** Bild-Asset mit frei setzbaren CDN-Adressen. */
function asset(overrides: Partial<PlatformCollection['recentTokens'][number]['image']> = {}) {
    return {
        kind: 'image',
        cdnUrlOriginal: 'https://cdn.example.test/original.png',
        cdnUrlOptimized: 'https://cdn.example.test/optimized.webp',
        cdnUrlThumbnail: 'https://cdn.example.test/thumb.webp',
        mimeType: 'image/png',
        width: 512,
        height: 512,
        durationSec: null,
        status: 'ready',
        ...overrides,
    };
}

/** Collection in der Form, die `serializeEnrichedCollections` liefert. */
function makeCollection(overrides: Partial<PlatformCollection> = {}): PlatformCollection {
    return {
        _id: '507f1f77bcf86cd799439011',
        chainId: 11155111,
        contractAddress: '0xAbCdEf0123456789abcdef0123456789ABCDEF01',
        standard: 'erc721',
        name: 'Testsammlung',
        symbol: 'TST',
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

/** Ein `recentTokens`-Eintrag mit eigenem Bild. */
function recentToken(tokenId: string, image: PlatformCollection['recentTokens'][number]['image']) {
    return {
        tokenId,
        name: `Token ${tokenId}`,
        mediaStatus: 'ready',
        updatedAt: '2026-10-02T10:00:00.000Z',
        image,
    };
}

describe('buildCollectionOverlayMap — Schlüssel', () => {
    it('schreibt die Contract-Adresse klein', () => {
        const overlays = buildCollectionOverlayMap([makeCollection()]);

        expect(overlays.has('0xabcdef0123456789abcdef0123456789abcdef01')).toBe(true);
        expect(overlays.has('0xAbCdEf0123456789abcdef0123456789ABCDEF01')).toBe(false);
    });

    it('ergibt für eine leere Liste eine leere Karte', () => {
        expect(buildCollectionOverlayMap([]).size).toBe(0);
    });
});

describe('buildCollectionOverlayMap — Bilder', () => {
    it('nimmt optimiert vor Original vor Vorschaubild', () => {
        const overlays = buildCollectionOverlayMap([
            makeCollection({
                preview: {
                    tokenId: '1',
                    name: 'Vorschau',
                    mediaStatus: 'ready',
                    image: asset(),
                    animation: null,
                    audio: null,
                },
            }),
        ]);

        expect(overlays.get('0xabcdef0123456789abcdef0123456789abcdef01')?.previewImages).toEqual([
            'https://cdn.example.test/optimized.webp',
        ]);
    });

    it('weicht auf das Original aus, wenn die optimierte Fassung fehlt', () => {
        const overlays = buildCollectionOverlayMap([
            makeCollection({
                recentTokens: [recentToken('1', asset({ cdnUrlOptimized: null }))],
            }),
        ]);

        expect(overlays.get('0xabcdef0123456789abcdef0123456789abcdef01')?.previewImages).toEqual([
            'https://cdn.example.test/original.png',
        ]);
    });

    it('überspringt ein recentToken ohne Medien, statt einen leeren Eintrag zu führen', () => {
        const overlays = buildCollectionOverlayMap([
            makeCollection({
                recentTokens: [
                    recentToken('1', null),
                    recentToken('2', asset({ cdnUrlOptimized: 'https://cdn.example.test/zwei.webp' })),
                ],
            }),
        ]);

        expect(overlays.get('0xabcdef0123456789abcdef0123456789abcdef01')?.previewImages).toEqual([
            'https://cdn.example.test/zwei.webp',
        ]);
    });

    it('überspringt ein Asset, dessen drei CDN-Adressen alle fehlen', () => {
        const inVerarbeitung = asset({
            cdnUrlOptimized: null,
            cdnUrlOriginal: null,
            cdnUrlThumbnail: null,
            status: 'pending',
        });

        const overlays = buildCollectionOverlayMap([
            makeCollection({ recentTokens: [recentToken('1', inVerarbeitung)] }),
        ]);

        expect(overlays.get('0xabcdef0123456789abcdef0123456789abcdef01')?.previewImages).toEqual([]);
    });

    it('liefert höchstens vier Bilder, auch bei sechs recentTokens', () => {
        const overlays = buildCollectionOverlayMap([
            makeCollection({
                preview: {
                    tokenId: '0',
                    name: 'Vorschau',
                    mediaStatus: 'ready',
                    image: asset({ cdnUrlOptimized: 'https://cdn.example.test/p.webp' }),
                    animation: null,
                    audio: null,
                },
                recentTokens: [1, 2, 3, 4, 5, 6].map((n) =>
                    recentToken(String(n), asset({ cdnUrlOptimized: `https://cdn.example.test/${n}.webp` }))
                ),
            }),
        ]);

        expect(overlays.get('0xabcdef0123456789abcdef0123456789abcdef01')?.previewImages).toHaveLength(4);
    });

    it('stellt das Vorschaubild vor die recentTokens', () => {
        const overlays = buildCollectionOverlayMap([
            makeCollection({
                preview: {
                    tokenId: '0',
                    name: 'Vorschau',
                    mediaStatus: 'ready',
                    image: asset({ cdnUrlOptimized: 'https://cdn.example.test/p.webp' }),
                    animation: null,
                    audio: null,
                },
                recentTokens: [recentToken('1', asset({ cdnUrlOptimized: 'https://cdn.example.test/1.webp' }))],
            }),
        ]);

        expect(overlays.get('0xabcdef0123456789abcdef0123456789abcdef01')?.previewImages).toEqual([
            'https://cdn.example.test/p.webp',
            'https://cdn.example.test/1.webp',
        ]);
    });
});

describe('buildCollectionOverlayMap — Umfang', () => {
    it('nimmt totalSupply des Contracts, nicht den Indexstand', () => {
        const overlay = buildCollectionOverlayMap([
            makeCollection({ totalSupply: '1000', indexedTokenCount: 42 }),
        ]).get('0xabcdef0123456789abcdef0123456789abcdef01');

        expect(overlay?.totalSupply).toBe(1000);
        expect(overlay?.indexedTokenCount).toBe(42);
    });

    it('ergibt null, wenn der Contract keinen Umfang nennt — nicht den Indexstand', () => {
        const overlay = buildCollectionOverlayMap([
            makeCollection({ totalSupply: null, indexedTokenCount: 42 }),
        ]).get('0xabcdef0123456789abcdef0123456789abcdef01');

        expect(overlay?.totalSupply).toBeNull();
    });

    it('ergibt null statt einer falschen Zahl, wenn totalSupply die Zahlengrenze überschreitet', () => {
        const overlay = buildCollectionOverlayMap([
            makeCollection({ totalSupply: '115792089237316195423570985008687907853269984665640564039457584007913129639935' }),
        ]).get('0xabcdef0123456789abcdef0123456789abcdef01');

        expect(overlay?.totalSupply).toBeNull();
    });
});

describe('buildCollectionOverlayMap — Felder', () => {
    it('reicht holderCount durch, ohne uniqueOwners zu berühren', () => {
        const overlay = buildCollectionOverlayMap([makeCollection({ holderCount: 17 })]).get(
            '0xabcdef0123456789abcdef0123456789abcdef01'
        );

        expect(overlay?.holderCount).toBe(17);
        expect(Object.keys(overlay ?? {})).not.toContain('uniqueOwners');
    });

    it('trägt keinen Preis und keine soziale Zahl', () => {
        const overlay = buildCollectionOverlayMap([makeCollection()]).get(
            '0xabcdef0123456789abcdef0123456789abcdef01'
        );

        expect(Object.keys(overlay ?? {}).sort()).toEqual([
            'contractName',
            'contractSymbol',
            'holderCount',
            'indexedTokenCount',
            'previewImages',
            'totalSupply',
        ]);
    });
});
