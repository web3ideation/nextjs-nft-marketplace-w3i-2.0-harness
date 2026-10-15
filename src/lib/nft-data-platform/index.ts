/**
 * Datei: src/lib/nft-data-platform/index.ts
 *
 * Zweck: Öffentliche Oberfläche der Transportschicht zur NFT Data Platform.
 *
 * Wird aufgerufen von:
 * - scripts/dev/platform-smoke.ts
 * - ab A3 die typisierten Endpunkt-Methoden, ab A5 die migrierten Routen
 *
 * Wichtig:
 * - Das ist kein Barrel, das ein ganzes Verzeichnis weiterreicht (verboten nach
 *   CLAUDE.md). Aufgezählt ist genau das, was Aufrufer außerhalb dieses Ordners
 *   brauchen: die eine Anfragefunktion, die Fehlerklassen zum Unterscheiden und
 *   die Konfigurationsprüfung für den degradierten Pfad.
 * - Nicht exportiert und damit ordnerintern: `signing.ts` und `rate-limit.ts`.
 *   Wer von außen selbst signiert, umgeht den Replay-Schutz und den Deckel.
 */

export { requestPlatform } from '@/lib/nft-data-platform/client';
export type {
    PlatformRequestOptions,
    PlatformResult,
    PlatformTransportDeps,
} from '@/lib/nft-data-platform/client';

export {
    getPlatformConfig,
    isPlatformConfigured,
    isPlatformEnabled,
    resetPlatformConfigCache,
} from '@/lib/nft-data-platform/config';
export type { CredentialKind, PlatformConfig, PlatformCredentials } from '@/lib/nft-data-platform/config';

export {
    isPlatformError,
    PLATFORM_UNAVAILABLE,
    PlatformAuthError,
    PlatformConfigError,
    PlatformError,
    PlatformRateLimitError,
    PlatformReplayError,
    PlatformResponseError,
    PlatformTimeoutError,
    PlatformUnavailableError,
} from '@/lib/nft-data-platform/errors';

export { getRateLimitSnapshot } from '@/lib/nft-data-platform/rate-limit';
export type { RateLimitSnapshot } from '@/lib/nft-data-platform/rate-limit';
