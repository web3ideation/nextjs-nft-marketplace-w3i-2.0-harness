/**
 * Datei: src/services/blockchain/collection-whitelist.test.ts
 *
 * Zweck: Belegt den Whitelist-Filter und sein Fehlerverhalten.
 *
 * Wichtig:
 * - Das Abnahmekriterium dieses Pakets ist **hier** und nicht an einer Route.
 *   Plan v1 wollte A4 daran prüfen, dass ein Aufruf von `/api/nft/detail` mit
 *   fremder Adresse keinen `refresh:token` erzeugt — zu diesem Zeitpunkt ruft
 *   diese Route aber überhaupt keinen Plattform-Endpunkt, das Kriterium wäre
 *   also auch bei einem Paket erfüllt, das nichts gebaut hat (Advisor-Befund 3).
 * - Der wichtigste Block ist „Fehlerverhalten". Dort steckt die Entscheidung
 *   dieses Moduls: im Zweifel verneinen. Wer die Richtung umdreht, dreht die
 *   Folge um — von „ein Discover bleibt aus, sichtbar" zu „eine fremde
 *   Collection landet im Index, unsichtbar".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    getWhitelistCacheState,
    getWhitelistedCollections,
    invalidateWhitelistCache,
    isCollectionWhitelisted,
} from '@/services/blockchain/collection-whitelist';

/** Adresse in Prüfsummen-Schreibweise, wie die Chain sie liefert. */
const CHECKSUMMED = '0x1107Eb26D47A5bF88E9a9F97cbC7EA38c3E1D7EC';
const LOWERCASE = CHECKSUMMED.toLowerCase();
const FREMD = '0x00000000000000000000000000000000deadbeef';

/**
 * Baut eine Lesequelle, die mitzählt, wie oft sie befragt wurde.
 *
 * @param behaviour - je Aufruf eine Liste oder ein zu werfender Fehler
 * @returns Lesequelle und Zähler
 */
function reader(behaviour: Array<readonly string[] | Error>): {
    read: () => Promise<readonly string[]>;
    calls: () => number;
} {
    let index = 0;

    return {
        read: async () => {
            const current = behaviour[Math.min(index, behaviour.length - 1)];
            index += 1;

            if (current instanceof Error) {
                throw current;
            }

            return current;
        },
        calls: () => index,
    };
}

beforeEach(() => {
    invalidateWhitelistCache();
    process.env.MARKETPLACE_WHITELIST_TTL_MS = '60000';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    invalidateWhitelistCache();
    delete process.env.MARKETPLACE_WHITELIST_TTL_MS;
    vi.restoreAllMocks();
});

describe('Normalisierung — der Fehler, der still in die andere Richtung geht', () => {
    it('findet eine Prüfsummen-Adresse, wenn klein geschrieben gefragt wird', async () => {
        const { read } = reader([[CHECKSUMMED]]);

        await expect(isCollectionWhitelisted(LOWERCASE, { readWhitelist: read })).resolves.toBe(true);
    });

    it('findet eine klein gespeicherte Adresse, wenn in Prüfsummen-Form gefragt wird', async () => {
        const { read } = reader([[LOWERCASE]]);

        await expect(isCollectionWhitelisted(CHECKSUMMED, { readWhitelist: read })).resolves.toBe(true);
    });

    it('verneint eine Adresse außerhalb der Whitelist', async () => {
        const { read } = reader([[CHECKSUMMED]]);

        await expect(isCollectionWhitelisted(FREMD, { readWhitelist: read })).resolves.toBe(false);
    });

    it('überspringt einen unbrauchbaren Eintrag der Chain, statt daran zu scheitern', async () => {
        const { read } = reader([['nicht-eine-adresse', CHECKSUMMED]]);

        const whitelist = await getWhitelistedCollections({ readWhitelist: read });

        expect(whitelist.size).toBe(1);
        expect(whitelist.has(LOWERCASE)).toBe(true);
    });

    it('fragt bei einer kaputten Adresse nicht die Chain — das ist kein Grund für einen RPC-Aufruf', async () => {
        const { read, calls } = reader([[CHECKSUMMED]]);

        await expect(isCollectionWhitelisted('0xabc', { readWhitelist: read })).resolves.toBe(false);
        await expect(isCollectionWhitelisted('', { readWhitelist: read })).resolves.toBe(false);
        expect(calls()).toBe(0);
    });
});

describe('Zwischenspeicher', () => {
    it('liest innerhalb der Frist nicht erneut', async () => {
        const { read, calls } = reader([[CHECKSUMMED]]);
        const nowMs = () => 1_000_000;

        await isCollectionWhitelisted(LOWERCASE, { readWhitelist: read, nowMs });
        await isCollectionWhitelisted(LOWERCASE, { readWhitelist: read, nowMs });
        await isCollectionWhitelisted(FREMD, { readWhitelist: read, nowMs });

        expect(calls()).toBe(1);
    });

    it('liest nach Ablauf der Frist erneut', async () => {
        const { read, calls } = reader([[CHECKSUMMED], [CHECKSUMMED, FREMD]]);
        let clock = 1_000_000;

        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });
        expect(calls()).toBe(1);

        clock += 60_001;
        const zweite = await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        expect(calls()).toBe(2);
        expect(zweite.size).toBe(2);
    });

    it('erzwingt nach invalidateWhitelistCache eine Lesung — der Weg, den A4c nimmt', async () => {
        const { read, calls } = reader([[CHECKSUMMED]]);
        const nowMs = () => 1_000_000;

        await getWhitelistedCollections({ readWhitelist: read, nowMs });
        expect(calls()).toBe(1);

        invalidateWhitelistCache();
        await getWhitelistedCollections({ readWhitelist: read, nowMs });

        expect(calls()).toBe(2);
    });

    it('meldet den Zustand für die Diagnose', async () => {
        expect(getWhitelistCacheState().size).toBeNull();

        const { read } = reader([[CHECKSUMMED]]);
        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => 1_000_000 });

        const state = getWhitelistCacheState();
        expect(state.size).toBe(1);
        expect(state.readAtMs).toBe(1_000_000);
        expect(state.lastReadFailed).toBe(false);
    });
});

describe('Fehlerverhalten — im Zweifel verneinen', () => {
    it('liefert bei gescheiterter Lesung den letzten bekannten Stand', async () => {
        const { read } = reader([[CHECKSUMMED], new Error('RPC weg')]);
        let clock = 1_000_000;

        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        clock += 60_001;
        const nachAusfall = await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        expect(nachAusfall.has(LOWERCASE)).toBe(true);
        expect(getWhitelistCacheState().lastReadFailed).toBe(true);
    });

    it('erneuert die Lesezeit des alten Stands nicht, damit der nächste Versuch wieder liest', async () => {
        const { read } = reader([[CHECKSUMMED], new Error('RPC weg')]);
        let clock = 1_000_000;

        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        clock += 60_001;
        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        expect(getWhitelistCacheState().readAtMs).toBe(1_000_000);
    });

    it('hämmert während eines Ausfalls nicht auf den Endpunkt', async () => {
        const { read, calls } = reader([[CHECKSUMMED], new Error('RPC weg')]);
        let clock = 1_000_000;

        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });
        clock += 60_001;
        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });
        const nachErstemFehler = calls();

        // Mehrere Aufrufe unmittelbar danach dürfen keinen neuen Versuch
        // auslösen — unter Last wäre das ein Hämmern auf einen Endpunkt, der
        // ohnehin nicht antwortet.
        clock += 100;
        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });
        clock += 100;
        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        expect(calls()).toBe(nachErstemFehler);
    });

    it('verneint, wenn die Lesung scheitert und es keinen Stand gibt', async () => {
        const { read } = reader([new Error('RPC weg')]);

        await expect(isCollectionWhitelisted(LOWERCASE, { readWhitelist: read })).resolves.toBe(false);
    });

    it('wirft dabei nicht — der Aufrufer soll entscheiden, nicht einen Fehler behandeln', async () => {
        const { read } = reader([new Error('RPC weg')]);

        const whitelist = await getWhitelistedCollections({ readWhitelist: read });

        expect(whitelist.size).toBe(0);
    });

    it('verneint bei leerer Whitelist alles, ohne zu werfen', async () => {
        const { read } = reader([[]]);

        await expect(isCollectionWhitelisted(LOWERCASE, { readWhitelist: read })).resolves.toBe(false);
        expect(getWhitelistCacheState().size).toBe(0);
        expect(getWhitelistCacheState().lastReadFailed).toBe(false);
    });

    it('unterscheidet leere Liste von gescheiterter Lesung im Zustand', async () => {
        const leer = reader([[]]);
        await getWhitelistedCollections({ readWhitelist: leer.read });
        expect(getWhitelistCacheState()).toMatchObject({ size: 0, lastReadFailed: false });

        invalidateWhitelistCache();

        const kaputt = reader([new Error('RPC weg')]);
        await getWhitelistedCollections({ readWhitelist: kaputt.read });
        expect(getWhitelistCacheState()).toMatchObject({ size: null, lastReadFailed: true });
    });
});

describe('Frist aus der Umgebung', () => {
    it('nimmt einen gesetzten Wert', async () => {
        process.env.MARKETPLACE_WHITELIST_TTL_MS = '1000';
        const { read, calls } = reader([[CHECKSUMMED], [CHECKSUMMED]]);
        let clock = 1_000_000;

        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });
        clock += 1_001;
        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        expect(calls()).toBe(2);
    });

    it('fällt bei unbrauchbarem Wert auf den Standardwert zurück, statt gar nicht zu speichern', async () => {
        process.env.MARKETPLACE_WHITELIST_TTL_MS = 'eine Minute';
        const { read, calls } = reader([[CHECKSUMMED]]);
        let clock = 1_000_000;

        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });
        clock += 30_000;
        await getWhitelistedCollections({ readWhitelist: read, nowMs: () => clock });

        expect(calls()).toBe(1);
    });
});
