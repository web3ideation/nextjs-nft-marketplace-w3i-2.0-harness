/**
 * Datei: src/lib/nft-data-platform/schemas.test.ts
 *
 * Zweck: Belegt das Pick-Verhalten der Schemata und die Formentscheidungen, die
 * aus dem Plattform-Code erhoben sind.
 *
 * Wichtig:
 * - Die ersten beiden Fälle sind die wichtigsten und bilden ein Paar: ein
 *   **zusätzliches** Feld darf nicht brechen, ein **fehlendes** gebrauchtes Feld
 *   muss brechen. Fällt der erste, wird jede Plattform-Erweiterung zum Ausfall;
 *   fällt der zweite, bemerken wir eine Vertragsänderung erst, wenn eine Ansicht
 *   leer bleibt.
 * - `metadataPayload` und `attributes` werden absichtlich nicht durchgeprüft.
 *   Der Test mit dem verschachtelten Unsinn ist kein Spaß, sondern die Erinnerung
 *   daran, warum: echte NFT-Metadaten sehen so aus.
 */

import { describe, expect, it } from 'vitest';

import {
    collectionListResponseSchema,
    mediaAssetSchema,
    pageInfoSchema,
    platformCollectionSchema,
    platformTokenSchema,
    searchResponseSchema,
    tokenDetailResponseSchema,
    tokenOwnersResponseSchema,
} from '@/lib/nft-data-platform/schemas';

/** Ein Medien-Asset, wie die Plattform es liefert. */
const media = {
    kind: 'image',
    cdnUrlOriginal: 'https://cdn.example.test/a.png',
    cdnUrlOptimized: 'https://cdn.example.test/a.webp',
    cdnUrlThumbnail: 'https://cdn.example.test/a-thumb.webp',
    mimeType: 'image/png',
    width: 1000,
    height: 1000,
    durationSec: null,
    status: 'ready',
};

/** Ein Token, wie `serializeEnrichedTokens` es liefert. */
const token = {
    _id: '507f1f77bcf86cd799439011',
    chainId: 11155111,
    contractAddress: '0xabc',
    tokenId: '7',
    standard: 'ERC721',
    name: 'Testtoken',
    description: null,
    externalUrl: null,
    imageOriginalUrl: 'ipfs://bafy/1.png',
    animationOriginalUrl: null,
    audioOriginalUrl: null,
    interactiveOriginalUrl: null,
    supplyQuantity: null,
    metadataStatus: 'ready',
    mediaStatus: 'ready',
    metadataPayload: { name: 'Testtoken', attributes: [] },
    attributes: [{ trait_type: 'Farbe', value: 'rot' }],
    creator: { name: 'Jemand', address: null, source: 'metadata.creator' },
    media: { image: media, animation: null, audio: null },
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
};

/** Eine Collection, wie `serializeEnrichedCollections` sie liefert. */
const collection = {
    _id: '507f1f77bcf86cd799439012',
    chainId: 11155111,
    contractAddress: '0xabc',
    standard: 'ERC721',
    name: 'Testsammlung',
    symbol: 'TST',
    description: null,
    externalUrl: null,
    imageOriginalUrl: null,
    bannerImageOriginalUrl: null,
    featuredImageOriginalUrl: null,
    totalSupply: '100',
    indexedTokenCount: 42,
    holderCount: 17,
    syncStatus: 'idle',
    coverImageSource: 'recent-tokens',
    recentTokens: [
        { tokenId: '1', name: 'Eins', mediaStatus: 'ready', updatedAt: '2026-10-02T10:00:00.000Z', image: media },
    ],
    preview: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
};

const pageInfo = { limit: 50, hasMore: false, nextCursor: null };

describe('Pick-Verhalten — das Paar, auf dem alles ruht', () => {
    it('nimmt eine Antwort mit zusätzlichen Feldern an und wirft sie weg', () => {
        const parsed = platformTokenSchema.safeParse({
            ...token,
            // Felder, die die Plattform morgen hinzufügen könnte.
            rarityScore: 0.42,
            experimentalFlag: true,
            nested: { whatever: [1, 2, 3] },
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data).not.toHaveProperty('rarityScore');
            expect(parsed.data).not.toHaveProperty('experimentalFlag');
            expect(parsed.data.tokenId).toBe('7');
        }
    });

    it('weist eine Antwort ohne ein gebrauchtes Feld laut ab', () => {
        const { media: _entfernt, ...ohneMedien } = token;
        const parsed = platformTokenSchema.safeParse(ohneMedien);

        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues.some((issue) => issue.path.includes('media'))).toBe(true);
        }
    });
});

describe('Datumsfelder', () => {
    it('erwartet Zeichenketten, nicht Date — die Plattform liefert JSON', () => {
        expect(platformTokenSchema.safeParse(token).success).toBe(true);
        expect(platformTokenSchema.safeParse({ ...token, updatedAt: new Date() }).success).toBe(false);
    });

    it('weist einen leeren Zeitstempel ab', () => {
        expect(platformTokenSchema.safeParse({ ...token, createdAt: '' }).success).toBe(false);
    });
});

describe('metadataPayload und attributes bleiben ungeprüft', () => {
    it('nimmt tief verschachtelten Unsinn an — so sehen echte NFT-Metadaten aus', () => {
        const parsed = platformTokenSchema.safeParse({
            ...token,
            metadataPayload: {
                properties: { files: [{ uri: 'x', type: 'model/gltf' }], category: 'vr' },
                '': null,
                '0': [[[{ deep: true }]]],
            },
            attributes: ['nur ein Text', 42, null, { trait_type: 'x' }],
        });

        expect(parsed.success).toBe(true);
    });

    it('nimmt metadataPayload als null an', () => {
        expect(platformTokenSchema.safeParse({ ...token, metadataPayload: null }).success).toBe(true);
    });
});

describe('Medien-Block (V31)', () => {
    it('nimmt ein Asset ohne CDN-URLs an — das ist ein Zustand, kein Fehler', () => {
        const parsed = mediaAssetSchema.safeParse({
            ...media,
            cdnUrlOriginal: null,
            cdnUrlOptimized: null,
            cdnUrlThumbnail: null,
            status: 'pending',
        });

        expect(parsed.success).toBe(true);
    });

    it('nimmt alle drei Medienarten als null an', () => {
        const parsed = platformTokenSchema.safeParse({
            ...token,
            media: { image: null, animation: null, audio: null },
        });

        expect(parsed.success).toBe(true);
    });
});

describe('pageInfo', () => {
    it('nimmt nextCursor als null an', () => {
        expect(pageInfoSchema.safeParse(pageInfo).success).toBe(true);
    });

    it('weist ein limit von 0 ab', () => {
        expect(pageInfoSchema.safeParse({ ...pageInfo, limit: 0 }).success).toBe(false);
    });
});

describe('Erfolgs-Hülle', () => {
    it('erwartet die Nutzlast flach neben ok, nicht in einer data-Hülle', () => {
        expect(tokenDetailResponseSchema.safeParse({ ok: true, token }).success).toBe(true);
        expect(tokenDetailResponseSchema.safeParse({ ok: true, data: { token } }).success).toBe(false);
    });

    it('weist ok: false ab — Fehlerantworten gehen durch normalizePlatformFailure', () => {
        expect(tokenDetailResponseSchema.safeParse({ ok: false, token }).success).toBe(false);
    });
});

describe('Ownership — die Form hängt am standard', () => {
    it('erwartet bei ERC721 Eigentümer-Zeilen ohne balance', () => {
        const parsed = tokenOwnersResponseSchema.safeParse({
            ok: true,
            standard: 'ERC721',
            items: [
                {
                    chainId: 11155111,
                    contractAddress: '0xabc',
                    tokenId: '7',
                    ownerAddress: '0xdef',
                    updatedAt: '2026-10-02T10:00:00.000Z',
                },
            ],
            pageInfo,
        });

        expect(parsed.success).toBe(true);
    });

    it('erwartet bei ERC1155 ein balance-Feld', () => {
        const base = {
            chainId: 11155111,
            contractAddress: '0xabc',
            tokenId: '7',
            ownerAddress: '0xdef',
            updatedAt: '2026-10-02T10:00:00.000Z',
        };

        expect(
            tokenOwnersResponseSchema.safeParse({ ok: true, standard: 'ERC1155', items: [base], pageInfo }).success
        ).toBe(false);
        expect(
            tokenOwnersResponseSchema.safeParse({
                ok: true,
                standard: 'ERC1155',
                items: [{ ...base, balance: '3' }],
                pageInfo,
            }).success
        ).toBe(true);
    });

    it('weist einen unbekannten standard ab', () => {
        expect(
            tokenOwnersResponseSchema.safeParse({ ok: true, standard: 'ERC404', items: [], pageInfo }).success
        ).toBe(false);
    });
});

describe('Collection und Liste', () => {
    it('nimmt eine Collection mit Vorschau und jüngsten Token an', () => {
        expect(platformCollectionSchema.safeParse(collection).success).toBe(true);
    });

    it('nimmt eine leere Liste an — kein Treffer ist kein Fehler', () => {
        expect(collectionListResponseSchema.safeParse({ ok: true, items: [], pageInfo }).success).toBe(true);
    });

    it('verlangt die vom Worker gepflegten Zählwerte', () => {
        const { holderCount: _weg, ...ohneZaehler } = collection;
        expect(platformCollectionSchema.safeParse(ohneZaehler).success).toBe(false);
    });
});

describe('Suche — drei Betriebsarten', () => {
    it('nimmt entity=tokens mit Token-Elementen an', () => {
        const parsed = searchResponseSchema.safeParse({
            ok: true,
            query: 'test',
            entity: 'tokens',
            items: [token],
            pageInfo,
        });

        expect(parsed.success).toBe(true);
    });

    it('nimmt entity=collections mit Collection-Elementen an', () => {
        const parsed = searchResponseSchema.safeParse({
            ok: true,
            query: 'test',
            entity: 'collections',
            items: [collection],
            pageInfo,
        });

        expect(parsed.success).toBe(true);
    });

    it('nimmt bei entity=all beide Formen in einer Liste an, je mit eigenem entity-Feld', () => {
        const parsed = searchResponseSchema.safeParse({
            ok: true,
            query: 'test',
            entity: 'all',
            items: [
                { entity: 'token', ...token },
                { entity: 'collection', ...collection },
            ],
            pageInfo,
        });

        expect(parsed.success).toBe(true);
    });

    it('weist bei entity=all ein Element ohne entity-Feld ab', () => {
        const parsed = searchResponseSchema.safeParse({
            ok: true,
            query: 'test',
            entity: 'all',
            items: [token],
            pageInfo,
        });

        expect(parsed.success).toBe(false);
    });
});
