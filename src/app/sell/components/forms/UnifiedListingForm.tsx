'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useChainId } from 'wagmi';
import { getAddress, isAddress } from 'viem';
import { AggregatedNFT } from '@/types/core/core-nft-modern';
import { useMarketplaceContracts, useMarketplaceFees } from '@/hooks/marketplace';
import { useERC20 } from '@/hooks/tokens';
import { useForm } from '@/hooks';
import { ExtendedCurrencySelector } from '@/components/marketplace';
import OptimizedNFTImage from '@/components/nft/OptimizedNFTImage';
import { ZERO_ADDRESS, getTokenConfig, isNativeETH } from '@/config/tokens';
import { useListingFlow } from '@/app/sell/contexts/ListingFlowContext';
import { resolveNftImageUrl, devLog } from '@/utils';

export type ListingMode = 'sale' | 'trade' | 'hybrid';

interface UnifiedListingFormProps {
    selectedNFT: AggregatedNFT | null;
    isFullyApproved?: boolean;
    isWhitelisted?: boolean;
    whitelistStatus?: 'not-started' | 'checking' | 'done' | 'failed';
    approvalStatus?: 'not-started' | 'checking' | 'done' | 'failed';
    onSubmit: (data: {
        mode: ListingMode;
        price?: string;
        currency?: string; // Changed to string (address)
        targetNFT?: AggregatedNFT;
        targetCollection?: string;
        tradeType?: 'specific' | 'collection' | 'open';
        description: string;
        erc1155Quantity?: string;
        partialBuyEnabled?: boolean;
        buyerWhitelistEnabled?: boolean;
        allowedBuyers?: string[];
    }) => void;
}

export function UnifiedListingForm({ selectedNFT, whitelistStatus = 'not-started', approvalStatus = 'not-started', onSubmit }: UnifiedListingFormProps) {
    const [mode, setMode] = useState<ListingMode>('sale');
    const [selectedTargetNFT, setSelectedTargetNFT] = useState<AggregatedNFT | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [targetSearchError, setTargetSearchError] = useState<string | null>(null);
    const TRADE_SPECIFIC_ONLY = true;
    const chainId = useChainId();
    const { setProgressStep } = useListingFlow();
    const isErc1155 = selectedNFT?.tokenStandard === 'ERC1155';
    const availableQuantity = selectedNFT?.balance ? parseInt(selectedNFT.balance, 10) : undefined;

    // Sync progressStep with whitelist/approval status
    useEffect(() => {
        if (!selectedNFT) {
            setProgressStep('select');
            return;
        }

        // Whitelist check is running
        if (whitelistStatus === 'checking') {
            setProgressStep('whitelist');
            return;
        }

        // Whitelist failed - stay at select
        if (whitelistStatus === 'failed') {
            setProgressStep('select');
            return;
        }

        // Approval check is running
        if (whitelistStatus === 'done' && approvalStatus === 'checking') {
            setProgressStep('approval');
            return;
        }

        // Approval failed - stay at select
        if (approvalStatus === 'failed') {
            setProgressStep('select');
            return;
        }

        // Both checks successful - form is active
        if (whitelistStatus === 'done' && approvalStatus === 'done') {
            setProgressStep('form');
            return;
        }
    }, [selectedNFT, whitelistStatus, approvalStatus, setProgressStep]);

    // Get marketplace address and dynamic fees
    const { marketplaceAddress } = useMarketplaceContracts();
    const { calculateFees, innovationFeePercentage, royaltyFeePercentage } = useMarketplaceFees({
        marketplaceAddress,
        contractAddress: selectedNFT?.contractAddress,
        tokenId: selectedNFT?.tokenId
    });

    // Form management with useForm hook
    const form = useForm({
        initialValues: {
            price: '',
            priceMode: 'gross' as 'gross' | 'net', // gross = Brutto (Käufer zahlt), net = Netto (Seller erhält)
            erc1155PriceInputMode: 'total' as 'total' | 'unit',
            currency: ZERO_ADDRESS as string, // Default: ETH (zero address)
            tradeType: 'specific' as 'specific' | 'collection' | 'open',
            targetContractAddress: '',
            targetTokenId: '',
            targetCollection: '',
            description: '',
            erc1155Quantity: '1',
            partialBuyEnabled: false,
            buyerWhitelistEnabled: false,
            buyerWhitelistAddresses: ''
        },
        validate: (values) => {
            const errors: Record<string, string> = {};

            // Validierung basierend auf dem Modus
            if (mode === 'sale' || mode === 'hybrid') {
                if (!values.price || parseFloat(values.price) <= 0) {
                    errors.price = 'Bitte geben Sie einen gültigen Preis ein';
                }
            }

            if (mode === 'trade' || mode === 'hybrid') {
                if (values.tradeType === 'specific' && !selectedTargetNFT) {
                    errors.targetContractAddress = 'Bitte wählen Sie den gewünschten NFT aus';
                }
                if (values.tradeType === 'collection' && !values.targetCollection.trim()) {
                    errors.targetCollection = 'Bitte geben Sie die Collection an';
                }
            }

            if (!values.description.trim()) {
                errors.description = 'Bitte fügen Sie eine Beschreibung hinzu';
            }

            if (isErc1155) {
                const qty = parseInt(values.erc1155Quantity || '0', 10);
                if (!qty || qty <= 0) {
                    errors.erc1155Quantity = 'Bitte geben Sie eine gueltige Menge ein';
                }
                if (availableQuantity !== undefined && qty > availableQuantity) {
                    errors.erc1155Quantity = `Maximal verfuegbar: ${availableQuantity}`;
                }
            }

            if (values.buyerWhitelistEnabled) {
                const addressTokens = values.buyerWhitelistAddresses
                    .split(/[\s,]+/)
                    .map((value) => value.trim())
                    .filter(Boolean);

                if (addressTokens.length === 0) {
                    errors.buyerWhitelistAddresses = 'Bitte mindestens eine Wallet-Adresse angeben';
                } else {
                    const invalid = addressTokens.filter((address) => !isAddress(address));
                    if (invalid.length > 0) {
                        errors.buyerWhitelistAddresses = 'Mindestens eine Adresse ist ungueltig';
                    }
                }
            }

            return errors;
        },
        onSubmit: async (values) => {
            if (!selectedNFT) {
                alert('Bitte wählen Sie zuerst einen NFT aus');
                return;
            }

            const isSaleFlow = mode === 'sale' || mode === 'hybrid';
            const rawInputPrice = isSaleFlow ? parseFloat(values.price || '0') : 0;

            if (isSaleFlow && (!Number.isFinite(rawInputPrice) || rawInputPrice <= 0)) {
                alert('Bitte geben Sie einen gültigen Preis ein');
                return;
            }

            const quantity = isErc1155
                ? parseInt(values.erc1155Quantity || '0', 10)
                : 1;

            const effectiveQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

            const totalInputPrice = isSaleFlow
                ? (isErc1155 && values.erc1155PriceInputMode === 'unit'
                    ? rawInputPrice * effectiveQuantity
                    : rawInputPrice)
                : 0;

            const totalFeeRate = innovationFeePercentage + royaltyFeePercentage;
            const grossPriceForListing = values.priceMode === 'net'
                ? totalInputPrice / (1 - totalFeeRate)
                : totalInputPrice;

            const submissionPrice = isSaleFlow
                ? grossPriceForListing.toString()
                : undefined;

            // ERC20 Token Approval check (WETH, USDC, DAI)
            const isERC20 = values.currency !== ZERO_ADDRESS;
            if (isERC20 && submissionPrice) {
                const needsApproval = !hasEnoughAllowance(submissionPrice);
                if (needsApproval) {
                    try {
                        await approve(); // Unlimited approval
                        // Wait a bit for approval to be confirmed
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (error) {
                        devLog.error('Token approval failed:', error);
                        alert('Token approval failed. Please try again.');
                        return;
                    }
                }
            }

            // Im Netto-Modus: Brutto-Preis für Contract verwenden
            const rawAddresses = values.buyerWhitelistAddresses
                .split(/[\s,]+/)
                .map((value) => value.trim())
                .filter(Boolean);
            const allowedBuyers = values.buyerWhitelistEnabled
                ? Array.from(new Set(rawAddresses.map((address) => getAddress(address))))
                : [];

            const effectiveTradeType = (mode === 'trade' || mode === 'hybrid')
                ? 'specific'
                : undefined;

            if ((mode === 'trade' || mode === 'hybrid') && effectiveTradeType === 'specific' && !selectedTargetNFT) {
                alert('Bitte wählen Sie einen gewünschten NFT aus.');
                return;
            }

            onSubmit({
                mode,
                price: submissionPrice,
                currency: (mode === 'sale' || mode === 'hybrid') ? values.currency : undefined,
                targetNFT: (mode === 'trade' || mode === 'hybrid') ? selectedTargetNFT || undefined : undefined,
                targetCollection: values.targetCollection || undefined,
                tradeType: effectiveTradeType,
                description: values.description,
                erc1155Quantity: isErc1155 ? values.erc1155Quantity : undefined,
                partialBuyEnabled: isErc1155 && (mode === 'sale' || mode === 'hybrid') ? values.partialBuyEnabled : false,
                buyerWhitelistEnabled: values.buyerWhitelistEnabled,
                allowedBuyers
            });
        }
    });

    // Get token config for selected currency
    const selectedTokenConfig = useMemo(() => {
        if (isNativeETH(form.values.currency)) return null;

        // Try to find token config (including mock tokens for development)
        const tokens = ['WETH', 'USDC', 'DAI', 'MOCK_ERC20', 'MOCK_WBTC', 'MOCK_EURS', 'MOCK_USDT'] as const;
        for (const tokenSymbol of tokens) {
            const config = getTokenConfig(chainId, tokenSymbol);
            if (config?.address.toLowerCase() === form.values.currency.toLowerCase()) {
                return config;
            }
        }
        return null;
    }, [form.values.currency, chainId]);

    const targetPreviewImage = useMemo(() => {
        const rawImage = selectedTargetNFT?.meta?.image?.trim();
        if (!rawImage) return '/media/custom-nft-3.jpg';
        return resolveNftImageUrl(rawImage, '/media/custom-nft-3.jpg');
    }, [selectedTargetNFT?.meta?.image]);

    // Generic ERC20 Hook for approval check (works with any token)
    const {
        hasEnoughAllowance,
        approve,
        balance: tokenBalance
    } = useERC20({
        tokenAddress: selectedTokenConfig?.address as `0x${string}` | undefined,
        spenderAddress: marketplaceAddress,
        decimals: selectedTokenConfig?.decimals || 18
    });

    const searchNFT = async () => {
        if (!form.values.targetContractAddress || !form.values.targetTokenId) return;

        setIsSearching(true);
        setTargetSearchError(null);

        try {
            if (!isAddress(form.values.targetContractAddress)) {
                throw new Error('Ungültige Contract-Adresse.');
            }

            let normalizedTokenId = '';
            try {
                normalizedTokenId = BigInt(form.values.targetTokenId.trim()).toString();
            } catch {
                throw new Error('Ungültige Token-ID. Bitte eine ganze Zahl eingeben.');
            }

            const normalizedContract = getAddress(form.values.targetContractAddress);

            const response = await fetch(
                `/api/nft/detail?contractAddress=${encodeURIComponent(normalizedContract)}&tokenId=${encodeURIComponent(normalizedTokenId)}`,
                { cache: 'no-store' }
            );

            if (!response.ok) {
                if (response.status === 404) {
                    // Zwei verschiedene Lagen hinter demselben Statuscode, und
                    // die Verwechslung wäre teuer: trägt die Antwort
                    // TOKEN_NOT_INDEXED, existiert das NFT sehr wohl — die
                    // Plattform hat es nur noch nicht erfasst. Einem Verkäufer
                    // zu sagen, sein eigenes NFT gebe es nicht, schickt ihn auf
                    // die Suche nach einem Fehler, den er nicht gemacht hat
                    // (Entscheidung 6 der Spec).
                    const body = await response.json().catch(() => null);

                    if (body?.code === 'TOKEN_NOT_INDEXED') {
                        throw new Error(
                            'Dieses NFT wird noch erfasst. Bitte in einigen Minuten erneut versuchen.'
                        );
                    }

                    throw new Error('NFT nicht gefunden. Bitte Contract-Adresse und Token-ID prüfen.');
                }
                throw new Error(`Suche fehlgeschlagen (HTTP ${response.status}).`);
            }

            const result = await response.json();
            const nftData = result?.success ? result.data : result;

            if (!nftData?.contractAddress || !nftData?.tokenId) {
                throw new Error('NFT-Daten unvollständig zurückgegeben.');
            }

            const targetNft: AggregatedNFT = {
                key: `${nftData.contractAddress}-${nftData.tokenId}`,
                contractAddress: nftData.contractAddress as `0x${string}`,
                tokenId: String(nftData.tokenId),
                listed: !!nftData.marketplace?.isListed,
                tokenStandard: nftData.marketplace?.tokenStandard === 'ERC1155' ? 'ERC1155' : 'ERC721',
                core: {
                    contractAddress: nftData.contractAddress as `0x${string}`,
                    tokenId: String(nftData.tokenId),
                    tokenURI: nftData.contract?.tokenURI || null,
                    name: nftData.contract?.name || nftData.metadata?.name || `NFT #${nftData.tokenId}`,
                    owner: (nftData.blockchain?.owner || null) as `0x${string}` | null,
                    symbol: nftData.contract?.symbol || null,
                    contractName: nftData.contract?.name || null,
                    contractSymbol: nftData.contract?.symbol || null,
                    totalSupply: nftData.contract?.totalSupply || null
                },
                meta: {
                    name: nftData.metadata?.name || `NFT #${nftData.tokenId}`,
                    description: nftData.metadata?.description || '',
                    image: nftData.metadata?.image || '/media/custom-nft-3.jpg',
                    attributes: nftData.metadata?.attributes || [],
                    animationUrl: nftData.metadata?.animationUrl || undefined,
                    externalUrl: nftData.metadata?.externalUrl || undefined
                },
                lastUpdated: Date.now(),
                sources: {
                    blockchain: true,
                    metadata: true,
                    marketplace: !!nftData.marketplace,
                    social: false,
                    insights: false
                }
            };

            setSelectedTargetNFT(targetNft);
            form.setFieldValue('targetContractAddress', normalizedContract);
            form.setFieldValue('targetTokenId', normalizedTokenId);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Fehler bei der NFT-Suche.';
            setTargetSearchError(message);
            setSelectedTargetNFT(null);
            devLog.error('Error searching NFT:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Gebühren berechnen (nur für Verkauf/Hybrid) - dynamisch vom Contract
    // Unterstützt Brutto (Käufer zahlt) und Netto (Seller erhält) Modi
    const parsedInputPrice = parseFloat(form.values.price || '0');
    const parsedErc1155Quantity = parseInt(form.values.erc1155Quantity || '0', 10);
    const effectiveQuantity = Number.isFinite(parsedErc1155Quantity) && parsedErc1155Quantity > 0
        ? parsedErc1155Quantity
        : 1;

    const effectiveInputPrice = Number.isFinite(parsedInputPrice) && parsedInputPrice > 0
        ? (isErc1155 && (mode === 'sale' || mode === 'hybrid') && form.values.erc1155PriceInputMode === 'unit'
            ? parsedInputPrice * effectiveQuantity
            : parsedInputPrice)
        : 0;

    const effectiveInputPriceString = effectiveInputPrice > 0 ? effectiveInputPrice.toString() : '0';

    const fees = effectiveInputPrice > 0
        ? (() => {
            const inputPrice = effectiveInputPrice;
            const totalFeeRate = innovationFeePercentage + royaltyFeePercentage;

            if (form.values.priceMode === 'net') {
                // Netto-Modus: Eingegebener Preis = Was Seller erhält
                // Brutto-Preis = Netto / (1 - feeRate)
                const netPrice = inputPrice;
                const grossPrice = netPrice / (1 - totalFeeRate);
                const marketplaceFee = grossPrice * innovationFeePercentage;
                const royaltyFee = grossPrice * royaltyFeePercentage;

                return {
                    grossPrice,
                    marketplaceFee,
                    royaltyFee,
                    totalFees: marketplaceFee + royaltyFee,
                    youReceive: netPrice,
                    marketplaceFeePercentage: innovationFeePercentage * 100,
                    royaltyFeePercentage: royaltyFeePercentage * 100
                };
            } else {
                // Brutto-Modus: Eingegebener Preis = Was Käufer zahlt
                const grossPrice = inputPrice;
                const fees = calculateFees(grossPrice);
                return { ...fees, grossPrice };
            }
        })()
        : { grossPrice: 0, marketplaceFee: 0, royaltyFee: 0, totalFees: 0, youReceive: 0, marketplaceFeePercentage: 0, royaltyFeePercentage: 0 };

    return (
        <form onSubmit={form.handleSubmit} className="space-y-6">
            {!selectedNFT && (
                <div className="text-center py-8 text-gray-500">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="mt-2">Wählen Sie einen NFT aus, um fortzufahren</p>
                </div>
            )}

            {selectedNFT && (
                <>
                    {/* Listing-Modus Auswahl */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Wie möchten Sie Ihren NFT anbieten?
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* Verkaufen */}
                            <button
                                type="button"
                                onClick={() => setMode('sale')}
                                className={`relative rounded-lg border-2 p-4 transition-all ${mode === 'sale'
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-blue-300 bg-white'
                                    }`}
                            >
                                <div className="flex flex-col items-center text-center">
                                    <div className={`rounded-full p-2.5 mb-2 ${mode === 'sale' ? 'bg-blue-600' : 'bg-gray-100'}`}>
                                        <svg className={`w-6 h-6 ${mode === 'sale' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                        </svg>
                                    </div>
                                    <span className={`text-sm font-semibold ${mode === 'sale' ? 'text-blue-900' : 'text-gray-700'}`}>
                                        Verkaufen
                                    </span>
                                    <span className="text-xs text-gray-500 mt-1">Gegen Geld</span>
                                </div>
                                {mode === 'sale' && (
                                    <div className="absolute top-2 right-2">
                                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                            </button>

                            {/* Tauschen */}
                            <button
                                type="button"
                                onClick={() => setMode('trade')}
                                className={`relative rounded-lg border-2 p-4 transition-all ${mode === 'trade'
                                    ? 'border-green-500 bg-green-50'
                                    : 'border-gray-200 hover:border-green-300 bg-white'
                                    }`}
                            >
                                <div className="flex flex-col items-center text-center">
                                    <div className={`rounded-full p-2.5 mb-2 ${mode === 'trade' ? 'bg-green-600' : 'bg-gray-100'}`}>
                                        <svg className={`w-6 h-6 ${mode === 'trade' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                    </div>
                                    <span className={`text-sm font-semibold ${mode === 'trade' ? 'text-green-900' : 'text-gray-700'}`}>
                                        Tauschen
                                    </span>
                                    <span className="text-xs text-gray-500 mt-1">Gegen NFT</span>
                                </div>
                                {mode === 'trade' && (
                                    <div className="absolute top-2 right-2">
                                        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                            </button>

                            {/* Hybrid */}
                            <button
                                type="button"
                                onClick={() => setMode('hybrid')}
                                className={`relative rounded-lg border-2 p-4 transition-all ${mode === 'hybrid'
                                    ? 'border-purple-500 bg-purple-50'
                                    : 'border-gray-200 hover:border-purple-300 bg-white'
                                    }`}
                            >
                                <div className="flex flex-col items-center text-center">
                                    <div className={`rounded-full p-2.5 mb-2 ${mode === 'hybrid' ? 'bg-purple-600' : 'bg-gray-100'}`}>
                                        <svg className={`w-6 h-6 ${mode === 'hybrid' ? 'text-white' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                        </svg>
                                    </div>
                                    <span className={`text-sm font-semibold ${mode === 'hybrid' ? 'text-purple-900' : 'text-gray-700'}`}>
                                        Hybrid
                                    </span>
                                    <span className="text-xs text-gray-500 mt-1">NFT + Geld</span>
                                </div>
                                {mode === 'hybrid' && (
                                    <div className="absolute top-2 right-2">
                                        <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Preis-Sektion (für Verkauf und Hybrid) */}
                    {(mode === 'sale' || mode === 'hybrid') && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                </svg>
                                Preis {mode === 'hybrid' && '(zusätzlich zum NFT)'}
                            </h3>

                            {/* Currency Selection */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Zahlungsmethode *
                                </label>
                                <ExtendedCurrencySelector
                                    value={form.values.currency}
                                    onChange={(currency) => form.setFieldValue('currency', currency)}
                                />
                                {form.values.currency !== ZERO_ADDRESS && selectedTokenConfig && (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>{selectedTokenConfig.symbol} Balance: {parseFloat(tokenBalance).toFixed(selectedTokenConfig.decimals === 6 ? 2 : 4)} {selectedTokenConfig.symbol}</span>
                                    </div>
                                )}
                            </div>

                            {/* Price Mode Selection (Brutto/Netto) */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Preisangabe *
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => form.setFieldValue('priceMode', 'gross')}
                                        className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${form.values.priceMode === 'gross'
                                                ? 'border-blue-500 bg-blue-50 text-blue-900'
                                                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300'
                                            }`}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                            <span>Brutto-Preis</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">Käufer zahlt</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => form.setFieldValue('priceMode', 'net')}
                                        className={`flex-1 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${form.values.priceMode === 'net'
                                                ? 'border-green-500 bg-green-50 text-green-900'
                                                : 'border-gray-300 bg-white text-gray-700 hover:border-green-300'
                                            }`}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>Netto-Preis</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">Sie erhalten</div>
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    {form.values.priceMode === 'gross'
                                        ? 'Geben Sie den Endpreis ein, den der Käufer zahlt. Gebühren werden automatisch abgezogen.'
                                        : 'Geben Sie den Betrag ein, den Sie nach Abzug aller Gebühren erhalten möchten.'
                                    }
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {form.values.priceMode === 'gross' ? 'Verkaufspreis (Brutto)' : 'Gewünschter Betrag (Netto)'} *
                                </label>

                                {isErc1155 && (mode === 'sale' || mode === 'hybrid') && (
                                    <div className="mb-3 grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => form.setFieldValue('erc1155PriceInputMode', 'total')}
                                            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${form.values.erc1155PriceInputMode === 'total'
                                                ? 'border-purple-500 bg-purple-50 text-purple-900'
                                                : 'border-gray-300 bg-white text-gray-700 hover:border-purple-300'
                                                }`}
                                        >
                                            Gesamtpreis
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => form.setFieldValue('erc1155PriceInputMode', 'unit')}
                                            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${form.values.erc1155PriceInputMode === 'unit'
                                                ? 'border-purple-500 bg-purple-50 text-purple-900'
                                                : 'border-gray-300 bg-white text-gray-700 hover:border-purple-300'
                                                }`}
                                        >
                                            Preis pro Einheit
                                        </button>
                                    </div>
                                )}

                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.0001"
                                        {...form.getFieldProps('price')}
                                        className={`w-full rounded-lg border ${form.hasError('price') ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                                        placeholder="0.00"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                                        {form.values.currency === ZERO_ADDRESS ? 'ETH' : (selectedTokenConfig?.symbol || 'WETH')}
                                    </div>
                                </div>
                                {form.hasError('price') && (
                                    <p className="mt-1 text-sm text-red-600">{form.getFieldError('price')}</p>
                                )}

                                {isErc1155 && (mode === 'sale' || mode === 'hybrid') && form.values.price && parseFloat(form.values.price) > 0 && (
                                    <p className="mt-2 text-xs text-purple-700">
                                        {form.values.erc1155PriceInputMode === 'unit'
                                            ? `Gesamtpreis (${effectiveQuantity} × ${form.values.price}): ${effectiveInputPrice.toFixed(4)} ${form.values.currency === ZERO_ADDRESS ? 'ETH' : (selectedTokenConfig?.symbol || 'WETH')}`
                                            : `Stückpreis (gesamt ÷ ${effectiveQuantity}): ${(effectiveInputPrice / effectiveQuantity).toFixed(4)} ${form.values.currency === ZERO_ADDRESS ? 'ETH' : (selectedTokenConfig?.symbol || 'WETH')}`}
                                    </p>
                                )}

                                {/* ERC20 Token Approval Warning */}
                                {form.values.currency !== ZERO_ADDRESS && effectiveInputPrice > 0 && !hasEnoughAllowance(effectiveInputPriceString) && (
                                    <div className="mt-2 flex items-start gap-2 text-xs text-orange-700 bg-orange-50 px-3 py-2 rounded-lg border border-orange-200">
                                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span>{selectedTokenConfig?.symbol || 'Token'} approval required. You will be asked to approve {selectedTokenConfig?.symbol || 'token'} spending before listing.</span>
                                    </div>
                                )}

                                {/* Gebühren-Übersicht */}
                                {effectiveInputPrice > 0 && (
                                    <div className="mt-3 p-3 bg-white rounded-lg border border-blue-200 text-xs space-y-1">
                                        {form.values.priceMode === 'net' && (
                                            <div className="flex justify-between text-gray-900 font-semibold pb-1 mb-1 border-b border-gray-200">
                                                <span>Listing-Preis (Brutto):</span>
                                                <span>{fees.grossPrice.toFixed(4)} {form.values.currency === ZERO_ADDRESS ? 'ETH' : (selectedTokenConfig?.symbol || 'WETH')}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-gray-600">
                                            <span>Marketplace-Gebühr ({(innovationFeePercentage * 100).toFixed(2)}%):</span>
                                            <span>-{fees.marketplaceFee.toFixed(4)} {form.values.currency === ZERO_ADDRESS ? 'ETH' : (selectedTokenConfig?.symbol || 'WETH')}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-600">
                                            <span>Royalty-Gebühr ({(royaltyFeePercentage * 100).toFixed(2)}%):</span>
                                            <span>-{fees.royaltyFee.toFixed(4)} {form.values.currency === ZERO_ADDRESS ? 'ETH' : (selectedTokenConfig?.symbol || 'WETH')}</span>
                                        </div>
                                        <div className="border-t border-gray-200 pt-1 mt-2 flex justify-between font-semibold text-gray-900">
                                            <span>Sie erhalten (Netto):</span>
                                            <span className="text-green-600">{fees.youReceive.toFixed(4)} {form.values.currency === ZERO_ADDRESS ? 'ETH' : (selectedTokenConfig?.symbol || 'WETH')}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {isErc1155 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                ERC1155 Menge
                            </h3>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Menge zum Listen *
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    {...form.getFieldProps('erc1155Quantity')}
                                    className={`w-full rounded-lg border ${form.hasError('erc1155Quantity') ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500`}
                                    placeholder={availableQuantity ? `Max ${availableQuantity}` : '1'}
                                />
                                {availableQuantity !== undefined && (
                                    <p className="mt-1 text-xs text-gray-600">Verfuegbar: {availableQuantity}</p>
                                )}
                                {form.hasError('erc1155Quantity') && (
                                    <p className="mt-1 text-sm text-red-600">{form.getFieldError('erc1155Quantity')}</p>
                                )}
                            </div>
                            {(mode === 'sale' || mode === 'hybrid') && (
                                <label className="flex items-center gap-3 text-sm font-medium text-purple-900">
                                    <input
                                        type="checkbox"
                                        checked={form.values.partialBuyEnabled}
                                        onChange={(event) => form.setFieldValue('partialBuyEnabled', event.target.checked)}
                                        className="h-4 w-4 text-purple-600 border-purple-300 focus:ring-purple-500"
                                    />
                                    Teilkauf fuer ERC1155 erlauben
                                </label>
                            )}
                        </div>
                    )}

                    {/* Tausch-Sektion (für Tausch und Hybrid) */}
                    {(mode === 'trade' || mode === 'hybrid') && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                                NFT-Tausch {mode === 'hybrid' && '(zusätzlich zum Preis)'}
                            </h3>

                            {/* Trade Type Selection */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Was suchen Sie?
                                </label>
                                <div className="space-y-2">
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="specific"
                                            checked={form.values.tradeType === 'specific'}
                                            onChange={(e) => form.setFieldValue('tradeType', e.target.value as any)}
                                            className="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-700">Bestimmter NFT</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="collection"
                                            checked={form.values.tradeType === 'collection'}
                                            onChange={(e) => form.setFieldValue('tradeType', e.target.value as any)}
                                            disabled={TRADE_SPECIFIC_ONLY}
                                            className="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                                        />
                                        <span className={`ml-2 text-sm ${TRADE_SPECIFIC_ONLY ? 'text-gray-400' : 'text-gray-700'}`}>
                                            Beliebiger NFT aus Collection {TRADE_SPECIFIC_ONLY ? '(vorerst deaktiviert)' : ''}
                                        </span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            value="open"
                                            checked={form.values.tradeType === 'open'}
                                            onChange={(e) => form.setFieldValue('tradeType', e.target.value as any)}
                                            disabled={TRADE_SPECIFIC_ONLY}
                                            className="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                                        />
                                        <span className={`ml-2 text-sm ${TRADE_SPECIFIC_ONLY ? 'text-gray-400' : 'text-gray-700'}`}>
                                            Offen für Angebote {TRADE_SPECIFIC_ONLY ? '(vorerst deaktiviert)' : ''}
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Specific NFT */}
                            {form.values.tradeType === 'specific' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Contract Address
                                        </label>
                                        <input
                                            type="text"
                                            {...form.getFieldProps('targetContractAddress')}
                                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                            placeholder="0x..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Token ID
                                        </label>
                                        <input
                                            type="text"
                                            {...form.getFieldProps('targetTokenId')}
                                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                            placeholder="1"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={searchNFT}
                                        disabled={isSearching || !form.values.targetContractAddress || !form.values.targetTokenId}
                                        className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
                                    >
                                        {isSearching ? 'Suche...' : 'NFT suchen'}
                                    </button>

                                    {targetSearchError && (
                                        <p className="text-sm text-red-600">{targetSearchError}</p>
                                    )}

                                    {selectedTargetNFT && (
                                        <div className="mt-2 p-3 bg-white border border-green-200 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 relative">
                                                    <OptimizedNFTImage
                                                        imageUrl={targetPreviewImage}
                                                        tokenId={String(selectedTargetNFT.tokenId)}
                                                        alt={selectedTargetNFT.meta?.name || 'NFT'}
                                                        className="object-cover"
                                                        fill={true}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">
                                                        {selectedTargetNFT.meta?.name || `NFT #${selectedTargetNFT.tokenId}`}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {selectedTargetNFT.core.contractName || selectedTargetNFT.contractAddress}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedTargetNFT(null)}
                                                    className="text-gray-400 hover:text-gray-600"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Collection */}
                            {form.values.tradeType === 'collection' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Collection Address
                                    </label>
                                    <input
                                        type="text"
                                        {...form.getFieldProps('targetCollection')}
                                        className={`w-full rounded-lg border ${form.hasError('targetCollection') ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500`}
                                        placeholder="0x..."
                                    />
                                    {form.hasError('targetCollection') && (
                                        <p className="mt-1 text-sm text-red-600">{form.getFieldError('targetCollection')}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Beschreibung (für alle Modi) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Beschreibung *
                        </label>
                        <textarea
                            {...form.getFieldProps('description')}
                            rows={4}
                            className={`w-full rounded-lg border ${form.hasError('description') ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                            placeholder={
                                mode === 'sale'
                                    ? 'Warum verkaufen Sie diesen NFT?'
                                    : mode === 'trade'
                                        ? 'Beschreiben Sie Ihre Tauschbedingungen...'
                                        : 'Beschreiben Sie Ihr Angebot...'
                            }
                        />
                        {form.hasError('description') && (
                            <p className="mt-1 text-sm text-red-600">{form.getFieldError('description')}</p>
                        )}
                    </div>

                    {/* Buyer Whitelist */}
                    <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <input
                                type="checkbox"
                                checked={form.values.buyerWhitelistEnabled}
                                onChange={(event) => {
                                    const enabled = event.target.checked;
                                    form.setFieldValue('buyerWhitelistEnabled', enabled);
                                    if (!enabled) {
                                        form.setFieldValue('buyerWhitelistAddresses', '');
                                    }
                                }}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Buyer-Whitelist aktivieren
                        </label>
                        <p className="mt-1 text-xs text-gray-500">
                            Nur die angegebenen Wallets koennen dieses Listing kaufen.
                        </p>

                        {form.values.buyerWhitelistEnabled && (
                            <div className="mt-3">
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Wallet-Adressen (eine pro Zeile oder getrennt durch Kommas)
                                </label>
                                <textarea
                                    {...form.getFieldProps('buyerWhitelistAddresses')}
                                    rows={3}
                                    className={`w-full rounded-lg border ${form.hasError('buyerWhitelistAddresses') ? 'border-red-300' : 'border-gray-300'} px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                                    placeholder="0xabc...\n0xdef..."
                                />
                                {form.hasError('buyerWhitelistAddresses') && (
                                    <p className="mt-1 text-xs text-red-600">{form.getFieldError('buyerWhitelistAddresses')}</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={whitelistStatus !== 'done' || approvalStatus === 'checking' || !form.isValid}
                        className={`w-full px-6 py-3 rounded-lg text-white font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 ${whitelistStatus !== 'done' || approvalStatus === 'checking' || !form.isValid
                            ? 'bg-gray-400 cursor-not-allowed'
                            : mode === 'sale'
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : mode === 'trade'
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-purple-600 hover:bg-purple-700'
                            }`}
                    >
                        {whitelistStatus === 'failed' ? (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Collection nicht whitelisted
                            </>
                        ) : whitelistStatus === 'checking' ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                Prüfe Whitelist...
                            </>
                        ) : approvalStatus === 'checking' ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                Prüfe Approval...
                            </>
                        ) : approvalStatus === 'failed' ? (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                {mode === 'sale' && 'Approve & List for Sale'}
                                {mode === 'trade' && 'Approve & Create Trade Offer'}
                                {mode === 'hybrid' && 'Approve & Create Hybrid Offer'}
                            </>
                        ) : (
                            <>
                                {mode === 'sale' && 'Listing erstellen'}
                                {mode === 'trade' && 'Tausch-Angebot erstellen'}
                                {mode === 'hybrid' && 'Hybrid-Angebot erstellen'}
                            </>
                        )}
                    </button>
                </>
            )}
        </form>
    );
}