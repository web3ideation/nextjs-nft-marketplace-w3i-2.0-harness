/**
 * Datei: src/lib/nft-data-platform/read.ts
 *
 * Zweck: Die typisierten Lesezugriffe auf die NFT Data Platform — Token,
 * Ownership, Collections, Suche. Jede Methode signiert über den Transport aus
 * A1, prüft die Antwort mit ihrem Schema und gibt geprüfte Typen zurück.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/read.test.ts
 * - ab A7a, A9 und A11 die migrierten Routen
 *
 * Wichtig:
 * - **Hier endet `unknown`.** `requestPlatform` gibt bewusst `data: unknown`
 *   zurück; dieses Modul ist die Stelle, an der daraus ein geprüfter Typ wird.
 *   Ab hier gilt: wer Plattform-Daten will, nimmt eine dieser Methoden. Der
 *   Grep auf `requestPlatform(` außerhalb von `src/lib/nft-data-platform/` muss
 *   leer bleiben (V12).
 * - **Ein Formfehler wird zu `PlatformResponseError`**, nicht zu einem nackten
 *   zod-Fehler. Ein zod-Fehler würde im 500er-Default der A8-Tabelle landen und
 *   als „interner Fehler bei uns" erscheinen, obwohl die Plattform etwas
 *   Unerwartetes geschickt hat — das gehört auf 502 `PLATFORM_RESPONSE_INVALID`.
 * - **Ein `404` wird hier nicht umgedeutet.** Er kommt als
 *   `PlatformResponseError` mit `httpStatus: 404` aus `normalizePlatformFailure`
 *   und wird von `translatePlatformError` zu `TOKEN_NOT_INDEXED`. Wer das hier
 *   vorwegnimmt, hat die Entscheidung an zwei Orten.
 * - Alle Methoden laufen über den **Read**-Zugangsdatensatz. Der Ops-Datensatz
 *   ist für die Collection-Registrierung in A3b (V15).
 * - Adressen und Mengen bleiben Zeichenketten, wie die Plattform sie liefert.
 *   Keine Normalisierung auf Kleinschreibung hier: das wäre eine fachliche
 *   Entscheidung und gehört in die Mapper.
 */

import { requestPlatform, type PlatformTransportDeps } from '@/lib/nft-data-platform/client';
import { buildListQuery, type PlatformCursor } from '@/lib/nft-data-platform/cursor';
import { PlatformResponseError } from '@/lib/nft-data-platform/errors';
import {
    collectionDetailResponseSchema,
    collectionListResponseSchema,
    searchResponseSchema,
    tokenDetailResponseSchema,
    tokenOwnersResponseSchema,
} from '@/lib/nft-data-platform/schemas';
import type {
    PlatformCollection,
    PlatformCollectionListResponse,
    PlatformSearchEntity,
    PlatformSearchResponse,
    PlatformToken,
    PlatformTokenOwnersResponse,
} from '@/lib/nft-data-platform/types';
import type { z } from 'zod';

/** Identität eines Tokens auf einer Chain. */
export type TokenIdentity = {
    chainId: number;
    contractAddress: string;
    tokenId: string;
};

/** Identität einer Collection auf einer Chain. */
export type CollectionIdentity = {
    chainId: number;
    contractAddress: string;
};

type ListOptions = {
    cursor?: PlatformCursor | null;
    limit?: number;
};

/**
 * Prüft eine Rohantwort gegen ein Schema und wirft bei Abweichung einen
 * Plattform-Fehler mit Fundstelle.
 *
 * Die Fundstelle ist der Punkt: „Antwort hat nicht die erwartete Form" schickt
 * einen Menschen auf die Suche, `items.0.media.image.cdnUrlOriginal: expected
 * string, received number` nicht.
 *
 * @param schema - zod-Schema der erwarteten Form
 * @param data - Rohantwort aus requestPlatform
 * @param endpoint - Pfad für die Fehlermeldung
 * @returns die geprüfte Antwort
 * @throws PlatformResponseError wenn die Form abweicht
 */
function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown, endpoint: string): z.infer<T> {
    const parsed = schema.safeParse(data);

    if (parsed.success) {
        return parsed.data;
    }

    const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(Wurzel)'}: ${issue.message}`)
        .join(' · ');

    throw new PlatformResponseError(
        `Antwort von ${endpoint} hat nicht die erwartete Form — ${issues}`,
        null,
        null
    );
}

/**
 * Holt ein Token samt Medien-Block und abgeleitetem Urheber.
 *
 * @param identity - Chain, Contract, Token-ID
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns das geprüfte Token
 * @throws PlatformResponseError mit httpStatus 404, wenn die Plattform das
 *   Token nicht kennt — A8 übersetzt das zu TOKEN_NOT_INDEXED
 */
export async function getTokenDetail(
    identity: TokenIdentity,
    deps?: PlatformTransportDeps
): Promise<PlatformToken> {
    const path = `/api/v1/tokens/${identity.chainId}/${identity.contractAddress}/${identity.tokenId}`;
    const { data } = await requestPlatform({ method: 'GET', path, credentials: 'read' }, deps);

    return parseOrThrow(tokenDetailResponseSchema, data, path).token;
}

/**
 * Holt die Eigentümer eines Tokens.
 *
 * Die Form der Liste hängt vom Standard ab — bei ERC-721 höchstens ein
 * Eigentümer, bei ERC-1155 Guthaben-Zeilen. Der Rückgabetyp ist deshalb ein
 * unterschiedener Verbund und der Aufrufer muss `standard` auswerten.
 *
 * @param identity - Chain, Contract, Token-ID
 * @param options - Cursor und Umfang
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns Standard, Eigentümer beziehungsweise Guthaben, Seiteninformation
 */
export async function getTokenOwners(
    identity: TokenIdentity,
    options: ListOptions = {},
    deps?: PlatformTransportDeps
): Promise<PlatformTokenOwnersResponse> {
    const base = `/api/v1/owners/${identity.chainId}/${identity.contractAddress}/${identity.tokenId}`;
    const path = `${base}${buildListQuery(options)}`;
    const { data } = await requestPlatform({ method: 'GET', path, credentials: 'read' }, deps);

    return parseOrThrow(tokenOwnersResponseSchema, data, base);
}

/**
 * Listet Collections, cursor-paginiert.
 *
 * @param options - Cursor und Umfang
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns eine Seite Collections samt Seiteninformation
 */
export async function listCollections(
    options: ListOptions = {},
    deps?: PlatformTransportDeps
): Promise<PlatformCollectionListResponse> {
    const base = '/api/v1/collections';
    const path = `${base}${buildListQuery(options)}`;
    const { data } = await requestPlatform({ method: 'GET', path, credentials: 'read' }, deps);

    return parseOrThrow(collectionListResponseSchema, data, base);
}

/**
 * Holt eine Collection samt Vorschau und jüngsten Token.
 *
 * @param identity - Chain und Contract
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns die geprüfte Collection
 */
export async function getCollectionDetail(
    identity: CollectionIdentity,
    deps?: PlatformTransportDeps
): Promise<PlatformCollection> {
    const path = `/api/v1/collections/${identity.chainId}/${identity.contractAddress}`;
    const { data } = await requestPlatform({ method: 'GET', path, credentials: 'read' }, deps);

    return parseOrThrow(collectionDetailResponseSchema, data, path).collection;
}

/**
 * Freitextsuche über Token, Collections oder beides.
 *
 * Läuft ausschließlich über `/api/v1/search?q=` — nicht über einen
 * `search`-Parameter an einer Liste (V13). Bei `entity: 'all'` trägt jedes
 * Element ein eigenes `entity`-Feld, die Plattform mischt dort beide Formen.
 *
 * @param params - Suchbegriff, Betriebsart, Cursor, Umfang
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns die geprüfte Suchantwort
 */
export async function searchEntities(
    params: { query: string; entity?: PlatformSearchEntity } & ListOptions,
    deps?: PlatformTransportDeps
): Promise<PlatformSearchResponse> {
    const base = '/api/v1/search';
    const path = `${base}${buildListQuery({
        cursor: params.cursor,
        limit: params.limit,
        extra: { q: params.query, entity: params.entity },
    })}`;
    const { data } = await requestPlatform({ method: 'GET', path, credentials: 'read' }, deps);

    return parseOrThrow(searchResponseSchema, data, base);
}
