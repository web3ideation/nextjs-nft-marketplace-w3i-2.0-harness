/**
 * Datei: src/lib/nft-data-platform/cursor.ts
 *
 * Zweck: Cursor-Paginierung gegen die NFT Data Platform — der Cursor als
 * undurchsichtiger Wert, und der Umgang mit dem Umfangsdeckel der Plattform.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/read.ts
 * - ab A3b die Wallet- und Discover-Methoden
 *
 * Wichtig:
 * - **Der Cursor ist undurchsichtig.** Die Plattform kodiert base64url über
 *   `{ updatedAt, id }` (`apps/web/src/lib/cursor-pagination.ts`), aber das ist
 *   ihr Implementierungsdetail. Wer ihn dekodiert, bindet sich daran und bricht,
 *   sobald die Plattform ihre Sortierung ändert — ohne dass sie ihren Vertrag
 *   gebrochen hätte. Deshalb ein Markentyp: ein Cursor kommt aus einer Antwort
 *   und geht in die nächste Anfrage, dazwischen passiert nichts mit ihm.
 * - **Die Plattform deckelt `limit` still.** Serverseitig steht
 *   `z.coerce.number().int().positive().max(200).default(50)` — ein Wunsch über
 *   200 wird nicht abgewiesen, sondern gekappt. `[Schlussfolgerung]` Ein
 *   Aufrufer, der 500 anfragt und 200 bekommt, hält den Rest für nicht
 *   existent. Deshalb kappt `resolveLimit` hier sichtbar und meldet es, statt
 *   die Täuschung an die Plattform weiterzureichen.
 * - Die Zeichenkette `page` kommt in diesem Modul und in der ganzen
 *   Client-Schicht nicht vor (V13). Die Plattform kennt keine Seitenzahlen.
 */

import { logger } from '@/lib/logger';

/** Größte Seitengröße, die die Plattform ausliefert. Darüber kappt sie still. */
export const PLATFORM_MAX_LIMIT = 200;

/** Seitengröße, die die Plattform ohne Angabe verwendet. */
export const PLATFORM_DEFAULT_LIMIT = 50;

declare const cursorBrand: unique symbol;

/**
 * Cursor der Plattform. Markentyp, damit keine beliebige Zeichenkette
 * hineingerät — ein Cursor stammt immer aus `pageInfo.nextCursor`.
 */
export type PlatformCursor = string & { readonly [cursorBrand]: true };

/**
 * Nimmt den `nextCursor` einer Antwort als Cursor an.
 *
 * @param value - Wert aus `pageInfo.nextCursor`
 * @returns der Cursor, oder null wenn die Antwort keinen weiteren Teil hat
 */
export function asPlatformCursor(value: string | null): PlatformCursor | null {
    if (value === null || value.trim() === '') {
        return null;
    }

    return value as PlatformCursor;
}

/**
 * Bringt einen gewünschten Umfang auf das, was die Plattform liefert.
 *
 * Kappt sichtbar und protokolliert — die Plattform würde still kappen, und
 * dann sieht eine halbe Seite wie eine vollständige aus.
 *
 * @param desired - gewünschte Seitengröße, oder undefined für den Standardwert
 * @returns die Seitengröße, die tatsächlich angefragt wird
 */
export function resolveLimit(desired?: number): number {
    if (desired === undefined) {
        return PLATFORM_DEFAULT_LIMIT;
    }

    if (!Number.isInteger(desired) || desired < 1) {
        logger.warn(
            { desired, used: PLATFORM_DEFAULT_LIMIT },
            'nft_data_platform_limit_invalid'
        );
        return PLATFORM_DEFAULT_LIMIT;
    }

    if (desired > PLATFORM_MAX_LIMIT) {
        logger.warn(
            { desired, used: PLATFORM_MAX_LIMIT },
            'nft_data_platform_limit_capped'
        );
        return PLATFORM_MAX_LIMIT;
    }

    return desired;
}

/**
 * Baut die Abfragezeichenkette einer Listenanfrage.
 *
 * Nimmt nur Werte auf, die gesetzt sind — ein leerer Parameter würde von der
 * Plattform still ignoriert und täuschte im Protokoll eine Filterung vor.
 *
 * @param params - Cursor, Umfang und weitere einwertige Parameter
 * @returns Abfragezeichenkette mit führendem `?`, oder die leere Zeichenkette
 */
export function buildListQuery(params: {
    cursor?: PlatformCursor | null;
    limit?: number;
    extra?: Record<string, string | number | undefined>;
}): string {
    const search = new URLSearchParams();

    search.set('limit', String(resolveLimit(params.limit)));

    if (params.cursor !== undefined && params.cursor !== null) {
        search.set('cursor', params.cursor);
    }

    for (const [key, value] of Object.entries(params.extra ?? {})) {
        if (value !== undefined && String(value).trim() !== '') {
            search.set(key, String(value));
        }
    }

    const query = search.toString();
    return query === '' ? '' : `?${query}`;
}
