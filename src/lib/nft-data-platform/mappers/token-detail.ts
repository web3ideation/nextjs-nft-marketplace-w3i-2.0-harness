/**
 * Datei: src/lib/nft-data-platform/mappers/token-detail.ts
 *
 * Zweck: Bildet die Plattform-Antworten auf die Form ab, die
 * `/api/nft/detail` schon heute konsumiert — Metadaten, Contract-Angaben und
 * Guthaben. Reine Abbildung, kein I/O.
 *
 * Wird aufgerufen von:
 * - src/app/api/nft/detail/route.ts
 * - src/lib/nft-data-platform/mappers/token-detail.test.ts
 *
 * Wichtig:
 * - **Warum eine Überlagerung und kein neuer Antwortaufbau.** Die Detailroute
 *   setzt ihre Antwort über rund 160 Zeilen zusammen: Guthaben, Top-Holder,
 *   angezeigter Eigentümer, Nachbearbeitung von `contract.ownerBalance`. Vier
 *   Aufrufer hängen an der Form. Diesen Aufbau im Plattform-Pfad nachzubauen
 *   hieße, ihn zweimal zu haben — und die beiden würden auseinanderlaufen. Also
 *   erzeugt dieser Mapper ein Objekt in der Form eines `nft_metadata`-Dokuments,
 *   die Route legt es über den lokalen Stand, und die bestehende Logik läuft
 *   unverändert weiter.
 * - **Der `blockchain`-Block gehört NICHT dazu.** `blockchainStateSync` schreibt
 *   ihn nach `nft_metadata`, und die Route liest ihn von dort. Die Plattform
 *   liefert diesen Zustand nicht (Migrationsdokument: „conservative nulls").
 *   Würde die Überlagerung ihn mit abdecken, wäre `isApprovedForAll` dauerhaft
 *   falsch — und `useMarketplaceItemDetail` holt die Detailseite dann für jedes
 *   gelistete ERC-1155 ein zweites Mal mit `refresh=true` (Advisor-Befund 8b).
 *   Deshalb überlagert dieser Mapper ausschließlich `metadata`, `contract` und
 *   `ownershipBalances`.
 * - **Bilder ausschließlich aus dem `media`-Block** (V31): `cdnUrlOriginal`,
 *   `cdnUrlOptimized`, `cdnUrlThumbnail`. Weder hier noch im Browser wird
 *   `/api/media` der Plattform gerufen, und `buildNFTImageVariants` wird im
 *   Plattform-Pfad nicht gebraucht — im Rückfallpfad bleibt es nötig (V32).
 */

import { PLATFORM_STANDARD } from '@/lib/nft-data-platform/schemas';
import type {
    PlatformCollection,
    PlatformToken,
    PlatformTokenOwnersResponse,
} from '@/lib/nft-data-platform/types';

/**
 * Übersetzt die Standard-Schreibweise der Plattform in die des Marktplatzes.
 *
 * Die Plattform liefert `erc721` klein, die Detailroute vergleicht
 * `tokenStandard === 'ERC1155'`, und `marketplace_items.tokenStandard` kommt
 * großgeschrieben aus TheGraph. **Hier liegt die Grenze zwischen den beiden
 * Welten.** Ohne diese Übersetzung greift der ERC-1155-Zweig der Route nie, und
 * zwar ohne Typfehler und ohne Fehlermeldung — der angezeigte Eigentümer wäre
 * bei jedem ERC-1155 der falsche.
 *
 * @param standard - Standard in der Schreibweise der Plattform
 * @returns Standard in der Schreibweise des Marktplatzes
 */
function toMarketplaceStandard(standard: string): string {
    return standard.toUpperCase();
}

/** Bildvarianten in der Form, die die Detailroute erwartet. */
export type DetailImageVariants = {
    original: string | null;
    optimized: string | null;
    thumbnail: string | null;
};

/** Metadatenteil der Detailantwort. */
export type DetailMetadataOverlay = {
    name: string | null;
    description: string;
    image: string;
    imageOriginal: string | null;
    images: DetailImageVariants;
    imageMeta: { width: number | null; height: number | null; mimeType: string | null };
    blurDataURL: null;
    externalUrl: string | null;
    animationUrl: string | null;
    attributes: unknown[];
};

/** Contract-Teil der Detailantwort, soweit die Plattform ihn füllt. */
export type DetailContractOverlay = {
    name: string | null;
    symbol: string | null;
    address: string;
    contractType: string;
    tokenURI: null;
    owner: string | null;
    ownerBalance: number | null;
};

/**
 * Überlagerung in der Form eines `nft_metadata`-Dokuments.
 *
 * Trägt mit Absicht **kein** `blockchain` — siehe Dateikopf.
 */
export type TokenDetailOverlay = {
    metadata: DetailMetadataOverlay;
    contract: DetailContractOverlay;
    ownershipBalances: Record<string, number>;
    metadataFetchVersion: number;
};

/**
 * Version, die der Route sagt: diese Metadaten sind frisch, kein Nachladen.
 *
 * Die Route lädt IPFS-Metadaten nach, wenn `metadataFetchVersion` unter ihrer
 * Anforderung liegt. Im Plattform-Pfad darf das nicht passieren (V4: kein
 * synchrones Nachladen aus Chain oder IPFS), deshalb ein Wert, der die
 * Anforderung sicher erfüllt.
 */
const PLATFORM_METADATA_FETCH_VERSION = 999;

/**
 * Wählt die beste anzeigbare Bild-URL aus dem Medien-Block.
 *
 * Reihenfolge: optimiert, dann Original, dann Vorschaubild. Ein Token in
 * Verarbeitung hat alle drei `null` — das ist ein Zustand, kein Fehler, und
 * ergibt die leere Zeichenkette wie im lokalen Pfad.
 *
 * @param media - Medien-Block des Tokens
 * @returns anzeigbare URL oder die leere Zeichenkette
 */
function pickDisplayImage(media: PlatformToken['media']): string {
    const image = media.image;

    if (image === null) {
        return '';
    }

    return image.cdnUrlOptimized ?? image.cdnUrlOriginal ?? image.cdnUrlThumbnail ?? '';
}

/**
 * Bildet den Metadatenteil ab.
 *
 * @param token - geprüftes Token der Plattform
 * @returns Metadatenteil in der Form der Detailantwort
 */
export function mapPlatformTokenToMetadata(token: PlatformToken): DetailMetadataOverlay {
    const image = token.media.image;
    const animation = token.media.animation;

    return {
        name: token.name,
        description: token.description ?? '',
        image: pickDisplayImage(token.media),
        imageOriginal: image?.cdnUrlOriginal ?? null,
        images: {
            original: image?.cdnUrlOriginal ?? null,
            optimized: image?.cdnUrlOptimized ?? null,
            thumbnail: image?.cdnUrlThumbnail ?? null,
        },
        imageMeta: {
            width: image?.width ?? null,
            height: image?.height ?? null,
            mimeType: image?.mimeType ?? null,
        },
        // Die Plattform liefert keinen Platzhalter-Farbwert. Null statt eines
        // erfundenen Werts: ein falscher Blur ist schlechter als keiner.
        blurDataURL: null,
        externalUrl: token.externalUrl,
        animationUrl: animation?.cdnUrlOriginal ?? token.animationOriginalUrl,
        attributes: token.attributes,
    };
}

/**
 * Bildet die Guthaben aus der Ownership-Antwort ab.
 *
 * Bei ERC-721 ein Eigentümer mit Guthaben 1 — die Route rechnet mit Zahlen, und
 * „ein Token, ein Eigentümer" ist genau eins. Bei ERC-1155 die gemeldeten
 * Guthaben; nicht lesbare Mengen werden übersprungen statt den Aufruf zu
 * kippen, denn eine kaputte Zeile darf eine Detailseite nicht leeren.
 *
 * @param owners - geprüfte Ownership-Antwort der Plattform
 * @returns Guthaben je kleingeschriebener Adresse
 */
export function mapPlatformOwnersToBalances(
    owners: PlatformTokenOwnersResponse
): Record<string, number> {
    const balances: Record<string, number> = {};

    if (owners.standard === PLATFORM_STANDARD.erc721) {
        for (const entry of owners.items) {
            balances[entry.ownerAddress.toLowerCase()] = 1;
        }

        return balances;
    }

    for (const entry of owners.items) {
        const parsed = Number(entry.balance);

        if (!Number.isFinite(parsed) || parsed <= 0) {
            continue;
        }

        balances[entry.ownerAddress.toLowerCase()] = parsed;
    }

    return balances;
}

/**
 * Bildet den Contract-Teil ab und setzt Eigentümer und Guthaben auf den
 * größten Halter.
 *
 * Der größte Halter ist das, was die Route im ERC-1155-Fall als angezeigten
 * Eigentümer verwendet. Die Auswahl hier zu treffen hält die Route unverändert.
 *
 * @param params - Token, Collection und die abgebildeten Guthaben
 * @returns Contract-Teil in der Form der Detailantwort
 */
export function mapPlatformToContract(params: {
    token: PlatformToken;
    collection: PlatformCollection | null;
    balances: Record<string, number>;
}): DetailContractOverlay {
    const entries = Object.entries(params.balances);
    const topHolder = entries.sort((a, b) => b[1] - a[1])[0];

    return {
        name: params.collection?.name ?? null,
        symbol: params.collection?.symbol ?? null,
        address: params.token.contractAddress,
        // Großgeschrieben: die Route vergleicht gegen 'ERC1155'.
        contractType: toMarketplaceStandard(params.token.standard),
        // Die Plattform pickt `metadataUriResolved` in A3a nicht. Null statt
        // eines geratenen Werts; wer die URI braucht, ergänzt das Schema in A3a
        // und begründet es dort.
        tokenURI: null,
        owner: topHolder?.[0] ?? null,
        ownerBalance: topHolder?.[1] ?? null,
    };
}

/**
 * Baut die vollständige Überlagerung für die Detailroute.
 *
 * @param params - Token, Ownership-Antwort und Collection der Plattform
 * @returns Überlagerung ohne `blockchain` — der bleibt lokal
 */
export function buildTokenDetailOverlay(params: {
    token: PlatformToken;
    owners: PlatformTokenOwnersResponse;
    collection: PlatformCollection | null;
}): TokenDetailOverlay {
    const balances = mapPlatformOwnersToBalances(params.owners);

    return {
        metadata: mapPlatformTokenToMetadata(params.token),
        contract: mapPlatformToContract({
            token: params.token,
            collection: params.collection,
            balances,
        }),
        ownershipBalances: balances,
        metadataFetchVersion: PLATFORM_METADATA_FETCH_VERSION,
    };
}
