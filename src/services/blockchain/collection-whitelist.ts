/**
 * Datei: src/services/blockchain/collection-whitelist.ts
 *
 * Zweck: Serverseitige Quelle für die Diamond-Whitelist und der Filter, den
 * jeder Discover-, Refresh- und Detail-Pfad vor einem Plattform-Aufruf befragt
 * (V33).
 *
 * Wird aufgerufen von:
 * - src/services/blockchain/collection-whitelist.test.ts
 * - ab A7a, A9 und A11 die migrierten Routen
 * - ab A4b der Push-Pfad im Worker
 *
 * Wichtig:
 * - **Warum das überhaupt existiert.** Schon ein Token-Refresh registriert die
 *   Collection des Tokens auf der NFT Data Platform und zieht sie ins Indexing
 *   (V33). Ohne diesen Filter ist eine fremde Collection einen Seitenaufruf
 *   weit davon entfernt, auf Niklas' RPC-Kosten indiziert zu werden. Vorher
 *   existierte die Whitelist nur als wagmi-Read im Browser, also genau dort, wo
 *   ein Server-Pfad sie nicht fragen kann.
 * - **Liste statt Einzelabfrage.** Die ABI trägt beides, aber
 *   `isCollectionWhitelisted(address)` wäre ein RPC-Aufruf je Prüfung. Für einen
 *   Filter, der vor jedem Detail-Aufruf steht, ist nur
 *   `getWhitelistedCollections()` tragbar: einer je Frist.
 * - **Vergleich kleingeschrieben.** Die Chain liefert Prüfsummen-Schreibweise,
 *   Marktplatz-Daten tragen Adressen teils klein. Ein Vergleich ohne
 *   Normalisierung ergäbe still `false` für eine Collection, die auf der
 *   Whitelist steht — derselbe Fehler, nur in die andere Richtung.
 * - **Das Fehlerverhalten ist die eigentliche Entscheidung dieses Moduls:**
 *
 *   | Lage | Antwort | Protokoll |
 *   |---|---|---|
 *   | Lesung gelungen | die gelesene Liste | debug |
 *   | Lesung gelungen, Liste leer | leere Liste, alles `false` | **warn** |
 *   | Lesung gescheitert, letzter Stand vorhanden | der alte Stand | **warn** |
 *   | Lesung gescheitert, kein Stand | leere Liste, alles `false` | **error** |
 *
 *   Im Zweifel wird **verneint**. Begründung: verneinen heißt, dass legitime
 *   Discover-Aufrufe ausbleiben — sichtbar und behebbar. Bejahen heißt, dass
 *   fremde Collections indiziert werden — unsichtbar und nicht rückholbar.
 *   Eine leere Liste und eine gescheiterte Lesung sehen für den Aufrufer gleich
 *   aus; im Protokoll dürfen sie das nicht.
 * - **Die Frist ist ein Übergang.** Richtig wäre eine Invalidierung bei
 *   `CollectionAddedToWhitelist` und `CollectionRemovedFromWhitelist`. Der
 *   bestehende Event-Pfad hört diese Ereignisse nicht und kann es strukturell
 *   nicht (Advisor-Befund 2b) — das kommt mit A4c. Bis dahin gilt: zwischen
 *   einer Whitelist-Änderung und dem Ablauf der Frist ist unsere Antwort
 *   falsch. Eine Minute ist kurz genug, dass eine Freigabe zeitnah wirkt, und
 *   lang genug, dass eine Detailseiten-Welle nicht je Aufruf liest.
 * - **Prozesslokal, mit Absicht.** Web und Worker lesen je einmal pro Frist.
 *   Ein geteilter Zwischenspeicher über Redis brächte einen zweiten
 *   Invalidierungspfad, den A4c ohnehin ersetzt. Anders als beim
 *   Rate-Limit-Budget ist hier keine Obergrenze zu teilen, nur ein
 *   Leseergebnis.
 */

import type { PublicClient } from 'viem';

import { GETTER_FACET_ABI } from '@/config/abis/getter-facet';
import { logger } from '@/lib/logger';
import { executeWithFallback } from '@/services/blockchain/rpc-config';

/** Standardfrist des Zwischenspeichers. */
const DEFAULT_TTL_MS = 60_000;

/**
 * Kürzeste Pause zwischen zwei gescheiterten Leseversuchen.
 *
 * Ohne diese Pause würde jeder Aufruf während eines RPC-Ausfalls einen neuen
 * Versuch auslösen — unter Last also ein Hämmern auf einen Endpunkt, der
 * ohnehin nicht antwortet. Die Pause ist kürzer als die Frist, damit eine
 * Erholung schnell wirkt.
 */
const FAILURE_RETRY_PAUSE_MS = 5_000;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export type WhitelistDeps = {
    /** Lesequelle, einspeisbar für Tests. Standard ist die Chain-Lesung. */
    readWhitelist?: () => Promise<readonly string[]>;
    nowMs?: () => number;
};

export type WhitelistCacheState = {
    /** Zahl der Adressen im Stand, oder null wenn noch nie gelesen wurde. */
    size: number | null;
    /** Wann der Stand gelesen wurde. */
    readAtMs: number | null;
    /** Ob die letzte Lesung gescheitert ist. */
    lastReadFailed: boolean;
};

type CacheEntry = {
    addresses: ReadonlySet<string>;
    readAtMs: number;
};

let cache: CacheEntry | null = null;
let lastReadFailed = false;
let retryNotBeforeMs = 0;

/**
 * Liest die Frist aus der Umgebung.
 *
 * Beim Aufruf gelesen, nicht auf Modulebene: ein Modul, das beim Import
 * Umgebung auswertet, lässt sich in Tests nicht umstellen und bricht Builds
 * ohne Konfiguration.
 *
 * @returns Frist in Millisekunden
 */
function resolveTtlMs(): number {
    const raw = process.env.MARKETPLACE_WHITELIST_TTL_MS;

    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_TTL_MS;
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

/**
 * Bringt eine Adresse auf die Vergleichsform.
 *
 * @param value - Adresse in beliebiger Schreibweise
 * @returns kleingeschriebene Adresse, oder null wenn sie keine ist
 */
function normalizeAddress(value: string): string | null {
    const trimmed = value.trim();
    return ADDRESS_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Liest die Whitelist über das Hausmuster für Chain-Lesungen.
 *
 * Nutzt `executeWithFallback` aus `rpc-config.ts` — mehrere Endpunkte,
 * Abkühlung nach Rate-Limit — statt einen eigenen Client zu bauen.
 *
 * @returns Adressen, wie die Chain sie liefert
 * @throws Error wenn die Marktplatz-Adresse fehlt oder keine Adresse ist
 */
async function readWhitelistFromChain(): Promise<readonly string[]> {
    const configured = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS?.trim();

    if (!configured || normalizeAddress(configured) === null) {
        throw new Error(
            `NEXT_PUBLIC_MARKETPLACE_ADDRESS fehlt oder ist keine Adresse: ${configured ?? '(nicht gesetzt)'}`
        );
    }

    const marketplaceAddress = configured as `0x${string}`;

    return executeWithFallback(async (client: PublicClient) =>
        client.readContract({
            address: marketplaceAddress,
            abi: GETTER_FACET_ABI,
            functionName: 'getWhitelistedCollections',
        })
    );
}

/**
 * Liefert die Whitelist, aus dem Zwischenspeicher oder frisch gelesen.
 *
 * Wirft nie: eine gescheiterte Lesung ohne vorherigen Stand ergibt die leere
 * Menge. Der Aufrufer soll entscheiden können, nicht einen Fehler behandeln
 * müssen — und die leere Menge bedeutet an jeder Aufrufstelle dasselbe wie
 * „nicht freigegeben".
 *
 * @param deps - einspeisbare Lesequelle und Uhr für Tests
 * @returns kleingeschriebene Adressen der freigegebenen Collections
 */
export async function getWhitelistedCollections(
    deps: WhitelistDeps = {}
): Promise<ReadonlySet<string>> {
    const now = deps.nowMs ?? Date.now;
    const read = deps.readWhitelist ?? readWhitelistFromChain;
    const nowMs = now();

    if (cache !== null && nowMs - cache.readAtMs < resolveTtlMs()) {
        return cache.addresses;
    }

    if (lastReadFailed && nowMs < retryNotBeforeMs && cache !== null) {
        return cache.addresses;
    }

    try {
        const raw = await read();
        const addresses = new Set<string>();

        for (const entry of raw) {
            const normalized = normalizeAddress(entry);

            if (normalized === null) {
                logger.warn({ entry }, 'marketplace_whitelist_entry_invalid');
                continue;
            }

            addresses.add(normalized);
        }

        cache = { addresses, readAtMs: nowMs };
        lastReadFailed = false;
        retryNotBeforeMs = 0;

        if (addresses.size === 0) {
            // Eine leere Whitelist ist kein Fehler — aber sie sieht für den
            // Aufrufer genauso aus wie eine gescheiterte Lesung, und das darf
            // im Protokoll nicht so sein.
            logger.warn({}, 'marketplace_whitelist_empty');
        } else {
            logger.debug({ size: addresses.size }, 'marketplace_whitelist_loaded');
        }

        return addresses;
    } catch (error) {
        lastReadFailed = true;
        retryNotBeforeMs = nowMs + Math.min(FAILURE_RETRY_PAUSE_MS, resolveTtlMs());

        const detail = error instanceof Error ? error.message : String(error);

        if (cache !== null) {
            // Ein veralteter Stand ist besser als keiner. Die Lesezeit wird
            // NICHT erneuert, damit der nächste Aufruf nach der Pause wieder
            // versucht, frisch zu lesen.
            logger.warn(
                { error: detail, size: cache.addresses.size, ageMs: nowMs - cache.readAtMs },
                'marketplace_whitelist_read_failed_serving_stale'
            );

            return cache.addresses;
        }

        // Kein Stand: verneinen. Der Filter existiert, um Kosten bei Niklas zu
        // vermeiden — im Zweifel lieber ein ausbleibender Discover-Aufruf als
        // eine fremde Collection im Index.
        logger.error({ error: detail }, 'marketplace_whitelist_unavailable');

        return new Set<string>();
    }
}

/**
 * Sagt, ob eine Collection auf der Diamond-Whitelist steht.
 *
 * Die Funktion, die jeder Discover-, Refresh- und Detail-Pfad vor einem
 * Plattform-Aufruf befragt.
 *
 * @param contractAddress - Adresse der Collection, Schreibweise beliebig
 * @param deps - einspeisbare Lesequelle und Uhr für Tests
 * @returns true nur, wenn die Adresse nachweislich freigegeben ist
 */
export async function isCollectionWhitelisted(
    contractAddress: string,
    deps: WhitelistDeps = {}
): Promise<boolean> {
    const normalized = normalizeAddress(contractAddress);

    if (normalized === null) {
        // Eine kaputte Adresse ist kein Grund, die Chain zu fragen.
        logger.warn({ contractAddress }, 'marketplace_whitelist_query_invalid_address');
        return false;
    }

    const whitelist = await getWhitelistedCollections(deps);
    return whitelist.has(normalized);
}

/**
 * Wirft den Zwischenspeicher weg.
 *
 * Gedacht für A4c — dort löst ein `CollectionAddedToWhitelist`- oder
 * `CollectionRemovedFromWhitelist`-Ereignis die Invalidierung aus und ersetzt
 * damit die Frist — und für Tests.
 *
 * @returns nichts
 */
export function invalidateWhitelistCache(): void {
    cache = null;
    lastReadFailed = false;
    retryNotBeforeMs = 0;
}

/**
 * Liefert den Zustand des Zwischenspeichers für Diagnose und Tests.
 *
 * @param nowMs - aktuelle Zeit; einspeisbar für Tests
 * @returns Größe, Lesezeitpunkt und ob die letzte Lesung scheiterte
 */
export function getWhitelistCacheState(nowMs: number = Date.now()): WhitelistCacheState {
    void nowMs;

    return {
        size: cache === null ? null : cache.addresses.size,
        readAtMs: cache === null ? null : cache.readAtMs,
        lastReadFailed,
    };
}
