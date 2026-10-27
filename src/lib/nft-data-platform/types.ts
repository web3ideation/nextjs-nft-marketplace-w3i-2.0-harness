/**
 * Datei: src/lib/nft-data-platform/types.ts
 *
 * Zweck: Die Typen der Plattform-Leseformen — **abgeleitet** aus den Schemata,
 * nicht von Hand gepflegt.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/read.ts
 * - ab A5/A7a/A9/A11 die Mapper der migrierten Routen
 *
 * Wichtig:
 * - Jeder Typ hier ist ein `z.infer` über ein Schema aus `schemas.ts`. Ein von
 *   Hand gepflegter Zwilling wäre eine zweite Quelle der Wahrheit, und die
 *   beiden würden auseinanderlaufen — erfahrungsgemäß an dem Feld, das gerade
 *   wichtig ist.
 * - Diese Typen sind die **Innenform** der Client-Schicht. Was die Routen nach
 *   außen geben, entsteht in den Mappern (A5, A7a, A9, A11) und behält die
 *   bestehenden Frontend-Verträge.
 */

import type { z } from 'zod';

import type {
    collectionDetailResponseSchema,
    collectionListResponseSchema,
    collectionPreviewSchema,
    collectionRecentTokenSchema,
    erc1155BalanceSchema,
    erc721OwnerSchema,
    mediaAssetSchema,
    pageInfoSchema,
    platformCollectionSchema,
    platformTokenSchema,
    searchResponseSchema,
    tokenCreatorSchema,
    tokenDetailResponseSchema,
    tokenOwnersResponseSchema,
} from '@/lib/nft-data-platform/schemas';

export type PlatformPageInfo = z.infer<typeof pageInfoSchema>;
export type PlatformMediaAsset = z.infer<typeof mediaAssetSchema>;
export type PlatformTokenCreator = z.infer<typeof tokenCreatorSchema>;
export type PlatformToken = z.infer<typeof platformTokenSchema>;
export type PlatformCollection = z.infer<typeof platformCollectionSchema>;
export type PlatformCollectionRecentToken = z.infer<typeof collectionRecentTokenSchema>;
export type PlatformCollectionPreview = z.infer<typeof collectionPreviewSchema>;
export type PlatformErc721Owner = z.infer<typeof erc721OwnerSchema>;
export type PlatformErc1155Balance = z.infer<typeof erc1155BalanceSchema>;

export type PlatformTokenDetailResponse = z.infer<typeof tokenDetailResponseSchema>;
export type PlatformTokenOwnersResponse = z.infer<typeof tokenOwnersResponseSchema>;
export type PlatformCollectionListResponse = z.infer<typeof collectionListResponseSchema>;
export type PlatformCollectionDetailResponse = z.infer<typeof collectionDetailResponseSchema>;
export type PlatformSearchResponse = z.infer<typeof searchResponseSchema>;

/** Was eine Suche durchsuchen soll. Standard der Plattform ist `tokens`. */
export type PlatformSearchEntity = 'tokens' | 'collections' | 'all';

/**
 * Eine Seite aus einer Liste, wie die Lesemethoden sie zurückgeben.
 *
 * Trägt den Cursor als Markentyp weiter, damit ein Aufrufer ihn nicht aus einer
 * beliebigen Zeichenkette bilden kann.
 */
export type PlatformPage<T> = {
    items: T[];
    pageInfo: PlatformPageInfo;
};
