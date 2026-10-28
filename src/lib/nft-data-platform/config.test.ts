/**
 * Datei: src/lib/nft-data-platform/config.test.ts
 *
 * Zweck: Belegt das Flag und die Pflichtprüfung — die verbindliche Stelle für
 * V14, nachdem Entscheidung E4 sie von `scripts/check-env.js` hierher verlegt
 * hat.
 *
 * Wichtig:
 * - Der wichtigste Fall ist der dritte Block: das Flag ist streng. `'TRUE'`,
 *   `'yes'`, `'on'` und ein Leerstring gelten als AUS. Ein Flag, das bei einem
 *   Tippfehler „an" bedeutet, stellt eine Datenquelle scharf, die niemand
 *   scharf stellen wollte — und zwar in der Umgebung, in der der Tippfehler
 *   steht, nicht auf dem Rechner, auf dem jemand hinsieht.
 * - Die Tests räumen die Umgebung nach jedem Fall auf. Ohne das färbt ein Fall
 *   auf den nächsten ab, und `getPlatformConfig()` speichert zwischen.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    getPlatformConfig,
    isPlatformConfigured,
    isPlatformEnabled,
    resetPlatformConfigCache,
} from '@/lib/nft-data-platform/config';
import { PlatformConfigError } from '@/lib/nft-data-platform/errors';

const REQUIRED = [
    'NFT_API_BASE_URL',
    'NFT_API_READ_CLIENT_ID',
    'NFT_API_READ_KEY',
    'NFT_API_READ_SECRET',
    'NFT_API_OPS_CLIENT_ID',
    'NFT_API_OPS_KEY',
    'NFT_API_OPS_SECRET',
] as const;

const ALL_PLATFORM_VARS = [
    ...REQUIRED,
    'NFT_DATA_PLATFORM_ENABLED',
    'NFT_API_TIMEOUT_MS',
    'NFT_API_MAX_ATTEMPTS',
    'NFT_API_READ_LIMIT_PER_MINUTE',
    'NFT_API_READ_CONCURRENCY',
    'NFT_API_OPS_LIMIT_PER_MINUTE',
    'NFT_API_OPS_CONCURRENCY',
] as const;

/**
 * Setzt alle Pflichtvariablen auf brauchbare Werte.
 *
 * @returns nichts
 */
function setAllRequired(): void {
    process.env.NFT_API_BASE_URL = 'https://platform.example.test';
    process.env.NFT_API_READ_CLIENT_ID = 'alpha-read';
    process.env.NFT_API_READ_KEY = 'read-key';
    process.env.NFT_API_READ_SECRET = 'read-secret';
    process.env.NFT_API_OPS_CLIENT_ID = 'alpha-ops';
    process.env.NFT_API_OPS_KEY = 'ops-key';
    process.env.NFT_API_OPS_SECRET = 'ops-secret';
}

beforeEach(() => {
    for (const name of ALL_PLATFORM_VARS) {
        delete process.env[name];
    }
    resetPlatformConfigCache();
});

afterEach(() => {
    for (const name of ALL_PLATFORM_VARS) {
        delete process.env[name];
    }
    resetPlatformConfigCache();
});

describe('isPlatformEnabled', () => {
    it('ist an bei "true"', () => {
        process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
        expect(isPlatformEnabled()).toBe(true);
    });

    it('ist an bei "1"', () => {
        process.env.NFT_DATA_PLATFORM_ENABLED = '1';
        expect(isPlatformEnabled()).toBe(true);
    });

    it('ist aus, wenn die Variable fehlt', () => {
        expect(isPlatformEnabled()).toBe(false);
    });

    it.each(['TRUE', 'True', 'yes', 'on', 'ja', '2', '', ' true '])(
        'ist aus bei %o — ein Flag, das Tippfehler als "an" liest, ist schlimmer als keins',
        (value) => {
            process.env.NFT_DATA_PLATFORM_ENABLED = value;
            expect(isPlatformEnabled()).toBe(false);
        }
    );
});

describe('getPlatformConfig — Flag aus', () => {
    it('wirft, auch wenn alle Variablen gesetzt sind', () => {
        setAllRequired();

        expect(() => getPlatformConfig()).toThrow(PlatformConfigError);
    });

    it('nennt keine fehlenden Variablen, weil keine fehlt', () => {
        setAllRequired();

        try {
            getPlatformConfig();
            expect.unreachable('getPlatformConfig hätte werfen müssen');
        } catch (error) {
            expect(error).toBeInstanceOf(PlatformConfigError);
            if (error instanceof PlatformConfigError) {
                expect(error.missingVariables).toEqual([]);
                expect(error.message).toContain('NFT_DATA_PLATFORM_ENABLED');
            }
        }
    });

    it('lässt isPlatformConfigured() falsch werden — der degradierte Pfad braucht genau das', () => {
        setAllRequired();

        expect(isPlatformConfigured()).toBe(false);
    });
});

describe('getPlatformConfig — Flag an', () => {
    beforeEach(() => {
        process.env.NFT_DATA_PLATFORM_ENABLED = 'true';
    });

    it('liefert die Konfiguration, wenn alles gesetzt ist', () => {
        setAllRequired();

        const config = getPlatformConfig();

        expect(config.baseUrl).toBe('https://platform.example.test');
        expect(config.credentials.read.clientId).toBe('alpha-read');
        expect(config.credentials.ops.clientId).toBe('alpha-ops');
        expect(isPlatformConfigured()).toBe(true);
    });

    it('nennt ALLE fehlenden Namen auf einmal, nicht nur den ersten', () => {
        setAllRequired();
        delete process.env.NFT_API_READ_SECRET;
        delete process.env.NFT_API_OPS_KEY;
        delete process.env.NFT_API_BASE_URL;

        try {
            getPlatformConfig();
            expect.unreachable('getPlatformConfig hätte werfen müssen');
        } catch (error) {
            expect(error).toBeInstanceOf(PlatformConfigError);
            if (error instanceof PlatformConfigError) {
                expect([...error.missingVariables].sort()).toEqual(
                    ['NFT_API_BASE_URL', 'NFT_API_OPS_KEY', 'NFT_API_READ_SECRET'].sort()
                );
            }
        }
    });

    it('behandelt eine leere Variable wie eine fehlende', () => {
        setAllRequired();
        process.env.NFT_API_READ_KEY = '   ';

        try {
            getPlatformConfig();
            expect.unreachable('getPlatformConfig hätte werfen müssen');
        } catch (error) {
            expect(error).toBeInstanceOf(PlatformConfigError);
            if (error instanceof PlatformConfigError) {
                expect(error.missingVariables).toContain('NFT_API_READ_KEY');
            }
        }
    });

    it('weist eine Basis-URL ohne http(s) ab', () => {
        setAllRequired();
        process.env.NFT_API_BASE_URL = 'file:///etc/passwd';

        expect(() => getPlatformConfig()).toThrow(/NFT_API_BASE_URL/);
    });

    it('schneidet den Schrägstrich am Ende der Basis-URL weg', () => {
        setAllRequired();
        process.env.NFT_API_BASE_URL = 'https://platform.example.test///';

        expect(getPlatformConfig().baseUrl).toBe('https://platform.example.test');
    });

    it('nimmt die Standardwerte der Stellwerte, wenn sie fehlen', () => {
        setAllRequired();

        const config = getPlatformConfig();

        expect(config.timeoutMs).toBe(10_000);
        expect(config.maxAttempts).toBe(3);
        expect(config.credentials.read.limitPerMinute).toBe(600);
        expect(config.credentials.read.concurrency).toBe(8);
        expect(config.credentials.ops.limitPerMinute).toBe(30);
        expect(config.credentials.ops.concurrency).toBe(2);
    });

    it('lässt die Stellwerte überschreiben — dafür sind sie da (V34)', () => {
        setAllRequired();
        process.env.NFT_API_READ_CONCURRENCY = '4';
        process.env.NFT_API_READ_LIMIT_PER_MINUTE = '300';

        const config = getPlatformConfig();

        expect(config.credentials.read.concurrency).toBe(4);
        expect(config.credentials.read.limitPerMinute).toBe(300);
    });

    it('ignoriert einen unbrauchbaren Stellwert statt ihn zu übernehmen', () => {
        setAllRequired();
        process.env.NFT_API_READ_CONCURRENCY = 'acht';

        expect(getPlatformConfig().credentials.read.concurrency).toBe(8);
    });
});
