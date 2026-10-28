/**
 * Datei: src/lib/nft-data-platform/schemas.ts
 *
 * Zweck: zod-Schemata für die Leseantworten der NFT Data Platform. Einzige
 * Stelle, an der Rohformen der Plattform vorkommen.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/read.ts
 * - src/lib/nft-data-platform/types.ts (leitet die Typen hieraus ab)
 * - src/lib/nft-data-platform/schemas.test.ts
 *
 * Wichtig:
 * - **Diese Schemata PICKEN, sie prüfen nicht alles ab.** zod wirft unbekannte
 *   Schlüssel standardmäßig weg, und das ist hier genau richtig: fügt die
 *   Plattform ein Feld hinzu, brechen wir nicht; entfernt sie ein Feld, das wir
 *   brauchen, bricht es laut. Ein Schema, das die ganze Antwort nachbaut, wäre
 *   eine zweite Quelle der Wahrheit und würde bei jeder Plattform-Erweiterung
 *   zur Baustelle.
 * - **Es gibt keine `data`-Hülle.** Die Nutzlast liegt flach neben `ok: true`
 *   (`buildApiSuccessResponse`): `{ ok: true, items: [...], pageInfo: {...} }`.
 * - **Datumsfelder sind Zeichenketten, keine `Date`.** Sie gehen durch
 *   `Response.json`, kommen also als ISO-Text an. `z.date()` wäre an jedem
 *   Token gescheitert. Wir prüfen auf nichtleere Zeichenkette und wandeln
 *   nicht um — wer ein `Date` braucht, baut es am Verwendungsort.
 * - **`metadataPayload` wird nicht durchgeprüft.** Das sind beliebige
 *   NFT-Metadaten; ein Schema darüber scheitert am ersten ungewöhnlichen NFT.
 * - Erhoben gegen Plattform-`main` (Prüfstand E5, derzeit `5df7493`):
 *   `packages/db/src/index.ts` (Dokumenttypen), `apps/web/src/lib/token-response.ts`
 *   und `collection-response.ts` (Anreicherung), die Routen unter
 *   `apps/web/src/app/api/v1/`.
 */

import { z } from 'zod';

/**
 * Die Schreibweise, in der die Plattform NFT-Standards liefert: **klein**.
 *
 * `packages/domain/src/index.ts:19` — `z.enum(["erc721", "erc1155"])`. Der
 * Marktplatz schreibt sie dagegen groß: die Detailroute vergleicht
 * `tokenStandard === 'ERC1155'`, `marketplace_items.tokenStandard` kommt
 * großgeschrieben aus TheGraph, und `nft_metadata.contract.contractType`
 * ebenso.
 *
 * **Zwei Schreibweisen für denselben Begriff, und keine Seite ist falsch.** Die
 * Grenze liegt genau hier: Schemata und Lesemethoden sprechen die Form der
 * Plattform, die Mapper übersetzen in die Form des Marktplatzes. Wer das
 * verwechselt, bekommt keinen Typfehler, sondern einen stillen Zweig, der nie
 * greift — ein ERC-721 würde als ERC-1155 behandelt und jede Ownership-Antwort
 * abgewiesen.
 */
export const PLATFORM_STANDARD = {
    erc721: 'erc721',
    erc1155: 'erc1155',
} as const;

/** ISO-Zeitstempel als Text — die Plattform liefert nie `Date`-Objekte. */
const isoTimestamp = z.string().min(1);

/** Hexifizierte ObjectId der Plattform. */
const platformId = z.string().min(1);

/**
 * Seiteninformation jeder Listenantwort.
 *
 * `nextCursor` ist `null`, wenn es keine weitere Seite gibt — `hasMore` und
 * `nextCursor` sind getrennt, weil die Plattform beides getrennt setzt.
 */
export const pageInfoSchema = z.object({
    limit: z.number().int().positive(),
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).nullable(),
});

/**
 * Medien-Asset der Plattform. Quelle für V31.
 *
 * Die drei `cdnUrl*`-Felder sind der einzige erlaubte Weg zu einem Bild; weder
 * Routencode noch Browser ruft `/api/media` der Plattform. Alle drei können
 * `null` sein, solange die Verarbeitung läuft — das ist kein Fehler, sondern
 * ein Zustand (`status`).
 */
export const mediaAssetSchema = z.object({
    kind: z.string().min(1),
    cdnUrlOriginal: z.string().min(1).nullable(),
    cdnUrlOptimized: z.string().min(1).nullable(),
    cdnUrlThumbnail: z.string().min(1).nullable(),
    mimeType: z.string().min(1).nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    durationSec: z.number().nullable(),
    status: z.string().min(1),
});

/** Aus dem Metadaten-Payload abgeleiteter Urheber. Geraten, nicht autoritativ. */
export const tokenCreatorSchema = z
    .object({
        name: z.string().nullable(),
        address: z.string().nullable(),
        source: z.string(),
    })
    .nullable();

/**
 * Token in der Form, die `serializeEnrichedTokens` liefert.
 *
 * `attributes` bleibt eine Liste beliebiger Einträge: Attribute sind
 * Freitext-Daten aus dem Metadaten-Payload, und ein strengeres Schema würde
 * echte NFTs abweisen.
 */
export const platformTokenSchema = z.object({
    _id: platformId,
    chainId: z.number().int(),
    contractAddress: z.string().min(1),
    tokenId: z.string().min(1),
    standard: z.string().min(1),
    name: z.string().nullable(),
    description: z.string().nullable(),
    externalUrl: z.string().nullable(),
    imageOriginalUrl: z.string().nullable(),
    animationOriginalUrl: z.string().nullable(),
    audioOriginalUrl: z.string().nullable(),
    interactiveOriginalUrl: z.string().nullable(),
    supplyQuantity: z.string().nullable(),
    metadataStatus: z.string().min(1),
    mediaStatus: z.string().min(1),
    metadataPayload: z.record(z.string(), z.unknown()).nullable(),
    attributes: z.array(z.unknown()),
    creator: tokenCreatorSchema,
    media: z.object({
        image: mediaAssetSchema.nullable(),
        animation: mediaAssetSchema.nullable(),
        audio: mediaAssetSchema.nullable(),
    }),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
});

/** Verkürzter Token in der `recentTokens`-Liste einer Collection. */
export const collectionRecentTokenSchema = z.object({
    tokenId: z.string().min(1),
    name: z.string().nullable(),
    mediaStatus: z.string().min(1),
    updatedAt: isoTimestamp,
    image: mediaAssetSchema.nullable(),
});

/** Vorschau-Token einer Collection, vom Worker gepflegt. */
export const collectionPreviewSchema = z
    .object({
        tokenId: z.string().min(1),
        name: z.string().nullable(),
        mediaStatus: z.string().min(1),
        image: mediaAssetSchema.nullable(),
        animation: mediaAssetSchema.nullable(),
        audio: mediaAssetSchema.nullable(),
    })
    .nullable();

/**
 * Collection in der Form, die `serializeEnrichedCollections` liefert.
 *
 * `indexedTokenCount` und `holderCount` pflegt der Worker auf dem Dokument —
 * sie sind ein Lesewert, keine Aggregation zur Anfragezeit. `coverImageSource`
 * sagt, woher das angezeigte Bild stammt, und ist für die Anzeige brauchbarer
 * als die Bild-URL allein.
 */
export const platformCollectionSchema = z.object({
    _id: platformId,
    chainId: z.number().int(),
    contractAddress: z.string().min(1),
    standard: z.string().min(1),
    name: z.string().nullable(),
    symbol: z.string().nullable(),
    description: z.string().nullable(),
    externalUrl: z.string().nullable(),
    imageOriginalUrl: z.string().nullable(),
    bannerImageOriginalUrl: z.string().nullable(),
    featuredImageOriginalUrl: z.string().nullable(),
    totalSupply: z.string().nullable(),
    indexedTokenCount: z.number().int(),
    holderCount: z.number().int(),
    syncStatus: z.string().min(1),
    coverImageSource: z.string().min(1),
    recentTokens: z.array(collectionRecentTokenSchema),
    preview: collectionPreviewSchema,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
});

/** Eigentümer-Zeile eines ERC-721-Tokens. */
export const erc721OwnerSchema = z.object({
    chainId: z.number().int(),
    contractAddress: z.string().min(1),
    tokenId: z.string().min(1),
    ownerAddress: z.string().min(1),
    updatedAt: isoTimestamp,
});

/** Guthaben-Zeile eines ERC-1155-Tokens. */
export const erc1155BalanceSchema = z.object({
    chainId: z.number().int(),
    contractAddress: z.string().min(1),
    tokenId: z.string().min(1),
    ownerAddress: z.string().min(1),
    balance: z.string().min(1),
    updatedAt: isoTimestamp,
});

/**
 * Hüllt eine Nutzlast in die Erfolgsform der Plattform.
 *
 * @param payload - Schema der flachen Nutzlast
 * @returns Schema, das `ok: true` plus die Nutzlast erwartet
 */
function successEnvelope<T extends z.ZodRawShape>(payload: T) {
    return z.object({ ok: z.literal(true), ...payload });
}

/** `GET /api/v1/tokens/:chainId/:contract/:tokenId` */
export const tokenDetailResponseSchema = successEnvelope({ token: platformTokenSchema });

/**
 * `GET /api/v1/owners/:chainId/:contract/:tokenId`
 *
 * `standard` steht auf oberster Ebene, und davon hängt die Form von `items` ab:
 * bei ERC-721 höchstens eine Eigentümer-Zeile, bei ERC-1155 Guthaben-Zeilen.
 * Deshalb ein unterschiedener Verbund und keine Liste „irgendwas davon".
 */
export const tokenOwnersResponseSchema = z.discriminatedUnion('standard', [
    z.object({
        ok: z.literal(true),
        standard: z.literal(PLATFORM_STANDARD.erc721),
        items: z.array(erc721OwnerSchema),
        pageInfo: pageInfoSchema,
    }),
    z.object({
        ok: z.literal(true),
        standard: z.literal(PLATFORM_STANDARD.erc1155),
        items: z.array(erc1155BalanceSchema),
        pageInfo: pageInfoSchema,
    }),
]);

/** `GET /api/v1/collections` */
export const collectionListResponseSchema = successEnvelope({
    items: z.array(platformCollectionSchema),
    pageInfo: pageInfoSchema,
});

/** `GET /api/v1/collections/:chainId/:contract` */
export const collectionDetailResponseSchema = successEnvelope({
    collection: platformCollectionSchema,
});

/**
 * `GET /api/v1/search?q=…`
 *
 * Drei Betriebsarten über `entity`: `tokens` (Standard), `collections`, `all`.
 * Bei `all` trägt jedes Element ein eigenes `entity`-Feld — die Plattform
 * mischt dort beide Formen in einer Liste.
 */
export const searchResponseSchema = z.union([
    successEnvelope({
        query: z.string(),
        entity: z.literal('tokens'),
        items: z.array(platformTokenSchema),
        pageInfo: pageInfoSchema,
    }),
    successEnvelope({
        query: z.string(),
        entity: z.literal('collections'),
        items: z.array(platformCollectionSchema),
        pageInfo: pageInfoSchema,
    }),
    successEnvelope({
        query: z.string(),
        entity: z.literal('all'),
        items: z.array(
            z.union([
                z.object({ entity: z.literal('token') }).and(platformTokenSchema),
                z.object({ entity: z.literal('collection') }).and(platformCollectionSchema),
            ])
        ),
        pageInfo: pageInfoSchema,
    }),
]);
