/**
 * Datei: src/app/api/nft/detail/route.ts
 *
 * Zweck: GET /api/nft/detail?contractAddress=...&tokenId=... — die Datengrundlage
 * der NFT-Detailseite.
 *
 * Datenstrategie, zwei Pfade seit Paket A7a:
 *
 * **Plattform-Pfad** (`isPlatformConfigured()` wahr): Name, Beschreibung,
 * Bilder, Attribute, Contract-Angaben und Guthaben kommen aus der NFT Data
 * Platform — drei Aufrufe (Token, Eigentümer, Collection), parallel. Kein
 * synchrones Nachladen aus Chain oder IPFS (V4).
 *
 * **Rückfallpfad** (Flag aus, Variable fehlt, oder Plattform nicht
 * ansprechbar): der bisherige Weg über `nft_metadata` samt
 * `ipfsMetadataLazySync`. Die Antwort trägt dann `dataSource:
 * 'local-fallback'` und `staleWarning: true` (V32).
 *
 * **In beiden Pfaden gleich:** der `blockchain`-Block und `approvalStatus`
 * stammen aus `blockchainStateSync` (5-Minuten-Frist, on demand), die Stats aus
 * `nft_stats`, die Insights aus `admin_nft_insights`, das Listing aus
 * `marketplace_items`.
 *
 * Wichtig:
 * - **Warum `nft_metadata` auch im Plattform-Pfad gelesen wird.**
 *   `blockchainStateSync.syncNFTState` schreibt den Chain-Zustand nach
 *   `nft_metadata`, und die Route liest ihn von dort. Die Plattform liefert
 *   diesen Zustand nicht. Würde der Plattform-Pfad `nft_metadata` auslassen,
 *   wäre `blockchain.isApprovedForAll` dauerhaft `false` — und
 *   `useMarketplaceItemDetail` holt die Detailseite dann für jedes gelistete
 *   ERC-1155 ein zweites Mal mit `refresh=true`: sechs Plattform-Aufrufe statt
 *   drei (Advisor-Befund 8b). Gelesen wird `nft_metadata` also weiter, aber
 *   **nicht mehr als Metadatenquelle**.
 * - **Die Antwortform ist unverändert.** Vier Aufrufer hängen daran
 *   (`useMarketplaceItemDetail`, `CartContext`, `CartPage`,
 *   `UnifiedListingForm`). Der Plattform-Pfad legt eine Überlagerung in der
 *   Form eines `nft_metadata`-Dokuments über den lokalen Stand; die
 *   nachgelagerte Logik läuft unverändert. Neu sind ausschließlich zwei
 *   zusätzliche Felder, `dataSource` und `staleWarning`.
 * - **Der 404-Vertrag aus V5** (Paket A7b): Kennt die Plattform das Token nicht,
 *   antwortet die Route mit 404 und `code: 'TOKEN_NOT_INDEXED'` samt
 *   `refreshQueued`, `refreshJobId`, `contractAddress`, `tokenId`, `chainId`.
 *   Das ist eine **Auskunft, kein Ausfall** — deshalb ausdrücklich kein
 *   Rückfall auf `nft_metadata`. `refreshQueued` ist dabei bis Paket A3b immer
 *   `false`: der Vertrag steht, die Auftragsstellung fehlt noch.
 * - **Hier sitzt der Whitelist-Filter** (V33), nicht im Lesepfad. Außerhalb der
 *   Diamond-Whitelist darf kein Refresh entstehen, sonst zieht ein
 *   Seitenaufruf eine fremde Collection ins Indexing. Ein lesender Abruf
 *   registriert nichts und braucht den Filter deshalb nicht.
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, getQueryParam, BadRequestError, NotFoundError } from '@/lib/api';
import { getCollection } from '@/lib/mongodb';
import { isPlatformConfigured } from '@/lib/nft-data-platform/config';
import { buildTokenDetailOverlay } from '@/lib/nft-data-platform/mappers/token-detail';
import { getCollectionDetail, getTokenDetail, getTokenOwners } from '@/lib/nft-data-platform/read';
import { buildTokenNotIndexedPayload, PLATFORM_RESPONSE_CODES, translatePlatformError } from '@/lib/nft-data-platform/view-state';
import { isCollectionWhitelisted } from '@/services/blockchain/collection-whitelist';
import type { TokenDetailOverlay } from '@/lib/nft-data-platform/mappers/token-detail';
import { getChainConfig } from '@/services/blockchain/rpc-config';
import { blockchainStateSync } from '@/services/nft-sync/blockchain-state-sync';
import { ipfsMetadataLazySync } from '@/services/nft-sync/ipfs-metadata-lazy-sync';
import { devLog } from '@/utils';
import { buildNFTImageVariants } from '@/utils/nft/image-variants';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const REQUIRED_METADATA_FETCH_VERSION = 2;

export const GET = apiHandler(async (request: NextRequest) => {
    const startTime = Date.now();

    const contractAddress = getQueryParam(request, 'contractAddress');
    const tokenId = getQueryParam(request, 'tokenId');
    const forceRefresh = getQueryParam(request, 'refresh') === 'true';
    const ownerAddressParam = getQueryParam(request, 'ownerAddress');

    if (!contractAddress || !tokenId) {
        throw new BadRequestError('Missing contractAddress or tokenId');
    }

    const normalizedAddress = contractAddress.toLowerCase();
    const normalizedOwnerAddress = ownerAddressParam && /^0x[a-fA-F0-9]{40}$/.test(ownerAddressParam)
        ? ownerAddressParam.toLowerCase()
        : null;

    // Step 1: Get from nft_metadata
    const nftMetadata = await getCollection('nft_metadata');
    let nft = await nftMetadata.findOne({ contractAddress: normalizedAddress, tokenId });

    // Step 2: Check if blockchain state is stale or force refresh
    const BLOCKCHAIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const blockchainStale =
        forceRefresh ||
        !nft?.blockchain?.lastSyncedAt ||
        (Date.now() - nft.blockchain.lastSyncedAt.getTime() > BLOCKCHAIN_CACHE_TTL);

    if (blockchainStale) {
        devLog.info(`🔄 [NFT Detail] Blockchain state stale, syncing...`);
        devLog.info(`   Contract: ${contractAddress}`);
        devLog.info(`   TokenId: ${tokenId}`);
        devLog.info(`   Reason: ${!nft ? 'NFT not in DB' : forceRefresh ? 'Force refresh' : !nft.blockchain?.lastSyncedAt ? 'Never synced' : 'Stale (>5min)'}`);

        await blockchainStateSync.syncNFTState(
            contractAddress,
            tokenId,
            process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS
        );

        // Refetch after sync
        nft = await nftMetadata.findOne({ contractAddress: normalizedAddress, tokenId });

        devLog.info(`   ✅ After sync - approved: ${nft?.blockchain?.approved || 'NULL'}`);
        devLog.info(`   ✅ After sync - isApprovedForAll: ${nft?.blockchain?.isApprovedForAll || false}`);
    } else if (nft?.blockchain) {
        devLog.info(`✅ [NFT Detail] Using cached blockchain state (age: ${Math.round((Date.now() - nft.blockchain.lastSyncedAt.getTime()) / 1000)}s)`);
        devLog.info(`   Approved: ${nft.blockchain.approved || 'NULL'}`);
        devLog.info(`   IsApprovedForAll: ${nft.blockchain.isApprovedForAll || false}`);
    }

    // Step 2b: Plattform-Pfad (Paket A7a). Liegt VOR Schritt 3, weil ein
    // erfolgreicher Plattform-Abruf das Nachladen aus IPFS erübrigt (V4).
    let overlay: TokenDetailOverlay | null = null;
    let dataSource: 'platform' | 'local-fallback' = 'local-fallback';
    let staleWarning = false;

    if (isPlatformConfigured()) {
        const chainId = getChainConfig().chain.id;
        const identity = { chainId, contractAddress: normalizedAddress, tokenId };

        try {
            // Drei Aufrufe, parallel. Die Zahl ist das Performance-Budget dieser
            // Route (V22) und in A10 zu protokollieren — eine vierte Abfrage
            // hier verdreifacht sich über die vier Aufrufer der Route.
            const [token, owners, collection] = await Promise.all([
                getTokenDetail(identity),
                getTokenOwners(identity),
                getCollectionDetail({ chainId, contractAddress: normalizedAddress }),
            ]);

            overlay = buildTokenDetailOverlay({ token, owners, collection });
            dataSource = 'platform';
        } catch (error) {
            const failure = translatePlatformError(error);

            logger[failure.logLevel](
                {
                    contractAddress: normalizedAddress,
                    tokenId,
                    code: failure.code,
                    allowLocalFallback: failure.allowLocalFallback,
                },
                'nft_detail_platform_read_failed'
            );

            // V5: Die Plattform kennt das Token nicht. Das ist eine Auskunft,
            // kein Ausfall — also kein Rückfall auf nft_metadata, sondern ein
            // 404 mit den sechs Feldern, aus denen die Oberfläche „wird noch
            // erfasst" machen kann.
            if (failure.code === PLATFORM_RESPONSE_CODES.notIndexed) {
                // V33: Außerhalb der Diamond-Whitelist darf kein Refresh
                // entstehen, sonst zieht ein Seitenaufruf eine fremde
                // Collection ins Indexing. Der Filter aus A4a ist genau hier
                // nötig — nicht im Lesepfad, der nichts registriert.
                const isWhitelisted = await isCollectionWhitelisted(normalizedAddress);

                throw new NotFoundError(
                    'Dieses NFT ist noch nicht erfasst.',
                    buildTokenNotIndexedPayload({
                        contractAddress: normalizedAddress,
                        tokenId,
                        chainId,
                        isWhitelisted,
                        // Kein Auftrag: queueTokenRefresh gehört zu A3b, die
                        // Kopplung an Ereignisse zu A4b. Bis dahin ist
                        // refreshQueued immer false — der Vertrag steht, die
                        // Auftragsstellung fehlt noch.
                        refreshJobId: null,
                    }),
                    PLATFORM_RESPONSE_CODES.notIndexed
                );
            }

            if (!failure.allowLocalFallback) {
                // Kein Rückfall: wir wissen nicht, was wir bekommen haben. Eine
                // lokale Antwort würde den Fehler in gültig aussehende Daten
                // verwandeln.
                throw error;
            }

            // Rückfall auf den lokalen Stand, sichtbar gekennzeichnet (V32).
            staleWarning = true;
        }
    }

    // Step 3: Lazy-load or refresh IPFS metadata when missing/legacy
    const localFetchVersion = typeof nft?.metadataFetchVersion === 'number' ? nft.metadataFetchVersion : 0;
    const metadataFetchVersion = overlay !== null ? overlay.metadataFetchVersion : localFetchVersion;
    const needsMetadataRefresh = overlay === null
        && (!nft?.metadata?.name || metadataFetchVersion < REQUIRED_METADATA_FETCH_VERSION);

    if (needsMetadataRefresh) {
        devLog.info(`📡 [NFT Detail] IPFS metadata missing, lazy-loading...`);
        if (metadataFetchVersion < REQUIRED_METADATA_FETCH_VERSION) {
            devLog.info(`   Reason: Legacy metadata version ${metadataFetchVersion} < ${REQUIRED_METADATA_FETCH_VERSION}`);
        }
        await ipfsMetadataLazySync.ensureMetadata(contractAddress, tokenId);
        // Refetch after metadata fetch
        nft = await nftMetadata.findOne({ contractAddress: normalizedAddress, tokenId });
    }

    // Step 4: Join with stats
    const nftStats = await getCollection('nft_stats');
    const stats = await nftStats.findOne({ contractAddress: normalizedAddress, tokenId });

    // Step 5: Get insights (item-specific OR collection-wide)
    const insightsCollection = await getCollection('admin_nft_insights');
    const insightsCandidates = await insightsCollection.aggregate([
        {
            $match: {
                $expr: {
                    $eq: [
                        { $toLower: '$contractAddress' },
                        normalizedAddress
                    ]
                },
                $or: [
                    { tokenId },
                    { tokenId: null },
                    { tokenId: '' },
                    { tokenId: { $exists: false } }
                ]
            }
        },
        {
            $addFields: {
                isItemSpecific: { $cond: [{ $eq: ['$tokenId', tokenId] }, 1, 0] }
            }
        },
        { $sort: { isItemSpecific: -1, updatedAt: -1, createdAt: -1 } },
        { $limit: 1 }
    ]).toArray();
    const insights = insightsCandidates[0] || null;

    // Step 6: Get marketplace listing (if any)
    const marketplaceItems = await getCollection('marketplace_items');
    const listing = await marketplaceItems.findOne({
        contractAddress: normalizedAddress,
        tokenId,
        active: true
    });

    // Prepare response
    // Im Plattform-Pfad kommen Bildvarianten fertig aus dem media-Block (V31);
    // buildNFTImageVariants bleibt für den Rückfallpfad nötig (V32, Abbau in R3).
    const metadataImageSource = overlay !== null
        ? overlay.metadata.imageOriginal ?? overlay.metadata.image
        : nft?.metadata?.imageOriginal || nft?.metadata?.image || '';
    const computedVariants = overlay !== null
        ? overlay.metadata.images
        : metadataImageSource ? buildNFTImageVariants(metadataImageSource) : {};
    const localOwnershipBalances = nft?.ownershipBalances && typeof nft.ownershipBalances === 'object'
        ? Object.entries(nft.ownershipBalances as Record<string, unknown>)
            .reduce<Record<string, number>>((acc, [address, value]) => {
                const parsed = typeof value === 'number'
                    ? value
                    : typeof value === 'string'
                        ? parseInt(value, 10)
                        : NaN;

                if (/^0x[a-f0-9]{40}$/i.test(address) && Number.isFinite(parsed) && parsed > 0) {
                    acc[address.toLowerCase()] = parsed;
                }

                return acc;
            }, {})
        : {};
    const ownershipBalances = overlay !== null ? overlay.ownershipBalances : localOwnershipBalances;

    const tokenStandard = overlay !== null
        ? overlay.contract.contractType
        : nft?.contract?.contractType || listing?.tokenStandard || null;
    const effectiveOwnershipBalances = { ...ownershipBalances };
    const overlayOwner = overlay?.contract.owner ?? null;
    const contractOwner = overlayOwner !== null
        ? overlayOwner.toLowerCase()
        : typeof nft?.contract?.owner === 'string' ? nft.contract.owner.toLowerCase() : null;

    if (tokenStandard === 'ERC1155') {
        const contractOwnerBalance = typeof nft?.contract?.ownerBalance === 'number' && Number.isFinite(nft.contract.ownerBalance)
            ? Math.max(nft.contract.ownerBalance, 0)
            : null;

        if (contractOwner && contractOwnerBalance !== null && contractOwnerBalance > 0) {
            effectiveOwnershipBalances[contractOwner] = Math.max(
                effectiveOwnershipBalances[contractOwner] || 0,
                contractOwnerBalance
            );
        }
    }

    const topHolderEntry = Object.entries(effectiveOwnershipBalances)
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
    const topHolderAddress = topHolderEntry?.[0] || null;

    const resolvedDisplayOwner = tokenStandard === 'ERC1155'
        ? (
            (normalizedOwnerAddress && (effectiveOwnershipBalances[normalizedOwnerAddress] || 0) > 0
                ? normalizedOwnerAddress
                : null)
            || (contractOwner && (effectiveOwnershipBalances[contractOwner] || 0) > 0 ? contractOwner : null)
            || topHolderAddress
            || contractOwner
            || (typeof nft?.blockchain?.owner === 'string' ? nft.blockchain.owner.toLowerCase() : null)
        )
        : (typeof nft?.blockchain?.owner === 'string'
            ? nft.blockchain.owner
            : (typeof nft?.contract?.owner === 'string' ? nft.contract.owner : null));

    const ownerBalanceFromMap = normalizedOwnerAddress
        ? effectiveOwnershipBalances[normalizedOwnerAddress] ?? null
        : null;

    const ownerHolderCount = Object.keys(effectiveOwnershipBalances).length;
    const totalKnownBalance = Object.values(effectiveOwnershipBalances)
        .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

    const displayOwnerBalance = resolvedDisplayOwner
        ? effectiveOwnershipBalances[resolvedDisplayOwner] ?? null
        : null;

    const resolvedOwnerBalance = tokenStandard === 'ERC1155'
        ? (ownerBalanceFromMap ?? displayOwnerBalance ?? nft?.contract?.ownerBalance ?? null)
        : (nft?.contract?.ownerBalance ?? null);
    const metadataExternalUrl = typeof (nft?.metadata as any)?.externalUrl === 'string'
        ? (nft?.metadata as any)?.externalUrl
        : (typeof (nft?.metadata as any)?.external_url === 'string' ? (nft?.metadata as any)?.external_url : null);
    const metadataAnimationUrl = typeof (nft?.metadata as any)?.animationUrl === 'string'
        ? (nft?.metadata as any)?.animationUrl
        : (typeof (nft?.metadata as any)?.animation_url === 'string' ? (nft?.metadata as any)?.animation_url : null);
    const resolvedMetadata = overlay !== null ? overlay.metadata : nft?.metadata ? {
        ...nft.metadata,
        imageOriginal: nft.metadata.imageOriginal || metadataImageSource || null,
        images: nft.metadata.images || computedVariants,
        imageMeta: nft.metadata.imageMeta || {
            width: null,
            height: null,
            mimeType: null,
        },
        blurDataURL: nft.metadata.blurDataURL || null,
        externalUrl: metadataExternalUrl,
        animationUrl: metadataAnimationUrl,
    } : {
        name: `NFT #${tokenId}`,
        description: '',
        image: '',
        imageOriginal: null,
        images: {},
        imageMeta: {
            width: null,
            height: null,
            mimeType: null,
        },
        blurDataURL: null,
        attributes: []
    };

    const response = {
        contractAddress: normalizedAddress,
        tokenId,

        // IPFS metadata (cached forever)
        metadata: resolvedMetadata,

        // Contract info
        contract: overlay !== null ? { ...overlay.contract } : nft?.contract || {
            name: null,
            symbol: null,
            address: contractAddress,
            tokenURI: null
        },

        ownership: {
            tokenStandard,
            ownerAddress: normalizedOwnerAddress,
            ownerBalance: resolvedOwnerBalance,
            holderCount: ownerHolderCount,
            totalKnownBalance,
            balances: effectiveOwnershipBalances,
        },

        // Blockchain state (cached 5min)
        blockchain: nft?.blockchain || {
            owner: null,
            approved: null,
            isApprovedForAll: false,
            lastSyncedAt: null
        },

        // Approval Status Helper (for UI)
        approvalStatus: {
            hasTokenApproval: nft?.blockchain?.approved &&
                nft.blockchain.approved !== '0x0000000000000000000000000000000000000000',
            hasOperatorApproval: nft?.blockchain?.isApprovedForAll || false,
            isApprovedForMarketplace: (
                (nft?.blockchain?.approved &&
                    nft.blockchain.approved.toLowerCase() === process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS?.toLowerCase()) ||
                nft?.blockchain?.isApprovedForAll
            ),
            approvedAddress: nft?.blockchain?.approved || null,
            marketplaceAddress: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || null
        },

        // Stats (real-time)
        stats: stats || {
            viewCount: 0,
            likeCount: 0,
            watchlistCount: 0,
            averageRating: 0,
            ratingCount: 0
        },

        // Insights (admin-managed) with compatibility mapping
        insights: insights ? {
            ...insights,
            customTitle: insights.customTitle || insights.title || null,
            description: insights.description || (Array.isArray(insights.descriptions) ? insights.descriptions[0] : null) || null,
            descriptions: Array.isArray(insights.descriptions)
                ? insights.descriptions
                : (Array.isArray(insights.cardDescriptions) ? insights.cardDescriptions : []),
            cardDescriptions: Array.isArray(insights.cardDescriptions)
                ? insights.cardDescriptions
                : (Array.isArray(insights.descriptions) ? insights.descriptions : []),
            projectDescriptions: insights.projectDescriptions || insights.specificDescriptions || null,
            specificDescriptions: insights.specificDescriptions || insights.projectDescriptions || null
        } : null,

        // Marketplace listing (if listed) - with ALL v2 fields
        marketplace: listing ? {
            // Core
            listingId: listing.listingId,
            isListed: listing.active,
            active: listing.active,

            // Pricing (v1 & v2)
            price: listing.price || listing.priceTotal,
            priceTotal: listing.priceTotal,
            unitPrice: listing.unitPrice,

            // Parties
            seller: listing.seller,
            buyer: listing.buyer || null,

            // Swap Data
            desiredContractAddress: listing.desiredContractAddress || listing.desiredTokenAddress,
            desiredTokenAddress: listing.desiredTokenAddress,
            desiredTokenId: listing.desiredTokenId,
            desiredErc1155Quantity: listing.desiredErc1155Quantity,

            // v2 Fields
            tokenStandard: listing.tokenStandard,
            listingType: listing.listingType,
            status: listing.status,
            currency: listing.currency,

            // ERC1155
            erc1155QuantityListed: listing.erc1155QuantityListed,
            remainingQuantity: listing.remainingQuantity,

            // Advanced
            buyerWhitelistEnabled: listing.buyerWhitelistEnabled,
            partialBuyEnabled: listing.partialBuyEnabled,
            feeRate: listing.feeRate,

            // Chain & Timestamps
            chainId: listing.chainId,
            createdAt: listing.createdAt,
            syncedAt: listing.syncedAt
        } : null,

        // Metadata
        cached: !blockchainStale,
        loadTime: Date.now() - startTime,

        // Quellenkennzeichnung (A7a, V32). Neue Felder, keine geaenderten —
        // die vier Aufrufer der Route sehen sonst eine andere Form.
        dataSource,
        staleWarning
    };

    // Normalize contract ownerBalance for UI to the selected owner in ERC1155 mode.
    if (response.contract) {
        response.contract.ownerBalance = resolvedOwnerBalance;
        response.contract.ownershipBalances = effectiveOwnershipBalances;
        response.contract.holderCount = ownerHolderCount;
        if (tokenStandard === 'ERC1155') {
            response.contract.owner = resolvedDisplayOwner;
        }
    }

    if (response.blockchain && tokenStandard === 'ERC1155') {
        response.blockchain.owner = resolvedDisplayOwner;
    }

    // View count is tracked via POST /api/nft/stats to avoid double counting

    const apiResponse = apiSuccess(response);
    apiResponse.headers.set('Cache-Control', 'no-store, max-age=0');
    return apiResponse;
});
