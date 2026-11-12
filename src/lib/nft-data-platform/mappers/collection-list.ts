/**
 * Datei: src/lib/nft-data-platform/mappers/collection-list.ts
 *
 * Zweck: Bildet eine Seite Plattform-Collections auf die Felder ab, die
 * `/api/collections` heute aus `nft_metadata` zusammensetzt — Name, Symbol,
 * Vorschaubilder, Umfang. Reine Abbildung, kein I/O.
 *
 * Wird aufgerufen von:
 * - src/app/api/collections/route.ts
 * - src/lib/nft-data-platform/mappers/collection-list.test.ts
 *
 * Wichtig:
 * - **Eine Überlagerung, kein neuer Antwortaufbau** — dasselbe Vorgehen wie in
 *   `token-detail.ts`. Die Route setzt ihre Antwort aus vier Quellen zusammen
 *   (`marketplace_items`, `nft_metadata`, `nft_stats`, `admin_nft_insights`);
 *   nur die zweite hat auf der Plattform ein Gegenstück. Dieser Mapper liefert
 *   deshalb genau die Felder dieser einen Quelle, die Route legt sie über den
 *   lokalen Stand, und alles andere läuft unverändert weiter.
 * - **Der Schlüssel ist kleingeschrieben.** Die Plattform liefert die
 *   Contract-Adresse in ihrer eigenen Schreibweise, der Marktplatz normalisiert
 *   durchgehend klein (`normalizedContractAddress` in der Aggregation). Ohne
 *   die Kleinschreibung hier findet die Route für eine prüfsummen-codierte
 *   Adresse keinen Treffer — und fällt still auf den lokalen Namen zurück,
 *   statt laut zu scheitern.
 * - **`uniqueOwners` wird NICHT auf `holderCount` umgelegt.** `uniqueOwners`
 *   ist heute die Zahl verschiedener Verkäufer mit gelisteten Objekten
 *   (`uniqueSellers` als `$addToSet` über das Verkäuferfeld), `holderCount` die
 *   Zahl der Halter. Zwei verschiedene Größen. Eine stille Bedeutungsänderung
 *   an einer Zahl, die in der Oberfläche steht, wäre schlimmer als ein zweites
 *   Feld — `holderCount` kommt deshalb neu dazu, statt etwas zu ersetzen.
 * - **Bilder ausschließlich aus den CDN-Adressen** (V31): `cdnUrlOptimized`,
 *   `cdnUrlOriginal`, `cdnUrlThumbnail`, in dieser Reihenfolge. Weder hier noch
 *   im Browser wird `/api/media` der Plattform gerufen.
 */

import type { PlatformCollection } from '@/lib/nft-data-platform/types';

/** Höchstzahl der Vorschaubilder je Collection — so viele zeigt die Ansicht. */
const MAX_PREVIEW_IMAGES = 4;

/**
 * Die Felder einer Collection, die aus der Plattform kommen.
 *
 * Bewusst knapp: kein Preis, keine soziale Zahl, keine Insight. Für die hat die
 * Plattform kein Gegenstück, und ein Feld mehr in diesem Typ wäre eine
 * Einladung, es doch zu füllen.
 */
export type CollectionOverlay = {
    contractName: string | null;
    contractSymbol: string | null;
    /** Bis zu vier anzeigbare CDN-Adressen, in Anzeigereihenfolge. */
    previewImages: string[];
    /** Gesamtzahl der Token laut Contract. `null`, wenn der Contract sie nicht nennt. */
    totalSupply: number | null;
    /** Zahl der Halter. Neu — ersetzt `uniqueOwners` nicht, siehe Dateikopf. */
    holderCount: number;
    /** Zahl der bei der Plattform indizierten Token dieser Collection. */
    indexedTokenCount: number;
};

/** Bild-Asset in der Form, die `preview` und `recentTokens` beilegen. */
type MediaAssetLike = {
    cdnUrlOptimized: string | null;
    cdnUrlOriginal: string | null;
    cdnUrlThumbnail: string | null;
};

/**
 * Wählt die beste anzeigbare Adresse eines Bild-Assets.
 *
 * Reihenfolge: optimiert, dann Original, dann Vorschaubild. Ein Asset in
 * Verarbeitung hat alle drei `null`; das ist ein Zustand, kein Fehler, und
 * ergibt hier `null` statt einer leeren Zeichenkette — eine leere Zeichenkette
 * in `previewImages` würde die Ansicht als Bild behandeln und ein kaputtes
 * `<img>` zeigen.
 *
 * @param asset - Bild-Asset oder `null`
 * @returns anzeigbare Adresse oder `null`
 */
function pickImageUrl(asset: MediaAssetLike | null): string | null {
    if (asset === null) {
        return null;
    }

    return asset.cdnUrlOptimized ?? asset.cdnUrlOriginal ?? asset.cdnUrlThumbnail ?? null;
}

/**
 * Sammelt bis zu vier Vorschaubilder einer Collection.
 *
 * Zuerst das vom Worker gepflegte `preview`-Bild, danach die `recentTokens` in
 * ihrer gelieferten Reihenfolge. Ein Element ohne brauchbare Adresse wird
 * übersprungen, nicht als leerer Eintrag geführt: die Ansicht zählt die Länge
 * von `previewImages`, und ein Platzhalter würde dort als vorhandenes Bild
 * mitzählen.
 *
 * @param collection - Collection der Plattform
 * @returns bis zu vier anzeigbare Adressen
 */
function collectPreviewImages(collection: PlatformCollection): string[] {
    const urls: string[] = [];

    const previewUrl = pickImageUrl(collection.preview?.image ?? null);
    if (previewUrl !== null) {
        urls.push(previewUrl);
    }

    for (const token of collection.recentTokens) {
        if (urls.length >= MAX_PREVIEW_IMAGES) {
            break;
        }

        const url = pickImageUrl(token.image);
        if (url !== null && !urls.includes(url)) {
            urls.push(url);
        }
    }

    return urls.slice(0, MAX_PREVIEW_IMAGES);
}

/**
 * Bestimmt den anzuzeigenden Umfang einer Collection.
 *
 * **Vorrang: `totalSupply` vor `indexedTokenCount`.** Begründung: `totalSupply`
 * ist die Angabe des Contracts, also das, was es gibt; `indexedTokenCount` ist
 * das, was die Plattform bisher erfasst hat, und steigt während des Backfills
 * weiter an. Wer den Indexstand anzeigt, zeigt eine Zahl, die sich ohne
 * Zutun des Herausgebers ändert — und die während der Alpha systematisch zu
 * klein ist. `indexedTokenCount` bleibt trotzdem im Overlay, als eigenes Feld:
 * die Lücke zwischen beiden ist für den Betrieb interessant.
 *
 * Die Plattform liefert `totalSupply` als Zeichenkette, weil ein ERC-1155-Wert
 * die Zahlengrenze von JavaScript überschreiten kann. Die Route erwartet eine
 * Zahl. Was sich nicht verlustfrei umwandeln lässt, ergibt `null` statt einer
 * falschen Zahl.
 *
 * @param collection - Collection der Plattform
 * @returns Umfang als Zahl oder `null`
 */
function resolveTotalSupply(collection: PlatformCollection): number | null {
    if (collection.totalSupply === null) {
        return null;
    }

    const parsed = Number(collection.totalSupply);

    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
}

/**
 * Baut die Nachschlagekarte für eine Seite Plattform-Collections.
 *
 * @param collections - Collections einer oder mehrerer Seiten
 * @returns Karte von kleingeschriebener Contract-Adresse auf Überlagerung
 */
export function buildCollectionOverlayMap(
    collections: readonly PlatformCollection[]
): Map<string, CollectionOverlay> {
    const overlays = new Map<string, CollectionOverlay>();

    for (const collection of collections) {
        const key = collection.contractAddress.toLowerCase();

        overlays.set(key, {
            contractName: collection.name,
            contractSymbol: collection.symbol,
            previewImages: collectPreviewImages(collection),
            totalSupply: resolveTotalSupply(collection),
            holderCount: collection.holderCount,
            indexedTokenCount: collection.indexedTokenCount,
        });
    }

    return overlays;
}
