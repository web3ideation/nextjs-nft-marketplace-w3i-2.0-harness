/**
 * Datei: src/lib/nft-data-platform/write.ts
 *
 * Zweck: Wallet-Inventar lesen und die vier Aufrufe mit Wirkung auf der
 * Plattform auslösen — zwei Discover-Wege, zwei Refresh-Wege. Jeder davon legt
 * dort Arbeit an und kann eine Collection ins Indexing ziehen.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/write.test.ts
 * - ab A5 und A6 die Wallet-Routen, ab A4b der Push-Pfad im Worker
 *
 * Wichtig:
 * - **Warum getrennt von `read.ts`.** Dort löst kein Aufruf etwas aus; hier
 *   schon. Die Trennung ist keine Ordnungsliebe: wer in `read.ts` arbeitet,
 *   muss nicht an Kosten bei Niklas denken, wer hier arbeitet, immer.
 *   `getWalletInventory` ist fachlich ein Lesezugriff und liegt trotzdem hier,
 *   weil es denselben Pfadbaum nutzt und dieselbe Pfad-Falle unten teilt —
 *   wer es in `read.ts` sucht, findet den Hinweis dort nicht.
 * - **Die Pfad-Falle, belegt am Plattform-Code.** Der Ordner
 *   `apps/web/src/app/api/v1/owners/wallets/[chainId]/` heißt `[chainId]`,
 *   enthält aber die **Eigentümer-Adresse**: der Pfadparameter wird dort als
 *   `ownerAddress` an `loadWalletInventory` übergeben, und die Chains kommen
 *   kommasepariert als Query-Parameter `chainIds`. Wer den Routenbaum liest und
 *   daraus eine URL baut, bekommt auf jeden Wallet-Aufruf einen 404. Richtig
 *   ist: `GET /api/v1/owners/wallets/{ownerAddress}?chainIds=1,2`.
 * - **Der Whitelist-Filter steht vor jedem Aufruf mit Wirkung** (V33). Schon
 *   ein Token-Refresh registriert die Collection auf der Plattform. Abgelehnte
 *   Identitäten werden als `discoveryStatus: 'failed'` mit eigener Meldung
 *   zurückgegeben, **nicht** stillschweigend verschluckt — der Aufrufer muss
 *   sehen, dass gefiltert wurde, sonst wartet er auf ein Indexing, das niemand
 *   angestoßen hat.
 * - **Zwei Filter nebeneinander, und das ist richtig so.** Die Plattform hat
 *   ihre eigene Env-Allowlist als Notbremse und antwortet für abgelehnte
 *   Contracts selbst mit `discoveryStatus: 'failed'`. Unser Filter kommt
 *   zuerst — sonst hat der Aufruf die Plattform schon erreicht, und genau das
 *   soll er nicht.
 * - **Gestückelt wird hier, nicht beim Aufrufer.** Beide Discover-Endpunkte
 *   nehmen 1 bis 500 Identitäten. Eine Liste mit 700 darf nicht zu einem
 *   Validierungsfehler der Plattform führen, und eine leere Liste nicht zu
 *   einem Aufruf. Die Blöcke gehen **nacheinander** raus: der
 *   Nebenläufigkeitsdeckel aus A1 ist dafür gedacht, gleichzeitige Anfragen zu
 *   bremsen, nicht dafür, dass eine einzelne Anfrage ihn allein füllt
 *   (Review-Befund 8 ist offen).
 * - `queueCollectionRefresh` ist der **einzige** Aufruf über den
 *   Ops-Zugangsdatensatz — so steht es in V15 und im Vertrag dieses Pakets.
 * - **Ein schon laufender Auftrag ist kein Fehler.** [Fakt]
 *   `resolveQueueBackedJobHttpStatus`
 *   (`apps/web/src/services/jobs/queue-job-service.ts`) gibt `202` für
 *   `queued` **und** `running` und `200` für alles Übrige — also immer 2xx.
 *   [Schlussfolgerung] „läuft schon" kommt hier als Erfolg mit
 *   `status: 'running'` an und braucht keinen Sonderzweig. Nur der Wert in
 *   `status` unterscheidet die Fälle, nicht der HTTP-Status.
 * - **[offene Frage] Diese Aufteilung kann beim ersten echten Lauf 403 geben.**
 *   Am Plattform-Code erhoben: `hasRequiredScopes`
 *   (`packages/security/src/index.ts:116`) verlangt **alle** aufgezählten
 *   Scopes (`requiredScopes.every(...)`), und die drei Endpunkte unten fordern
 *   `refresh:token` mit:
 *     `POST /api/v1/tokens/discover`         → `tokens:read` + `refresh:token`
 *     `POST /api/v1/owners/wallets/discover` → `owners:read` + `refresh:token`
 *     `POST /api/v1/refresh/token`           → `refresh:token`
 *     `POST /api/v1/refresh/collection`      → `refresh:collection`
 *   V15 sagt, `refresh:collection` sei der einzige Scope, den `alpha-read`
 *   nicht hat. Der Zuschnitt der Plattform-Seite sagt etwas anderes:
 *   „`alpha-read` bekommt die `:read`-Scopes, `alpha-ops` zusätzlich
 *   `refresh:*`" (`todo/findings-indexing-alpha.md`, Punkt 6) — und die
 *   Vergabe der Alpha-Clients ist dort ausdrücklich **noch offen**.
 *   [Schlussfolgerung] Trifft der Plattform-Zuschnitt zu, antworten die ersten
 *   drei mit `403 missing_scope`, was bei uns als `PlatformAuthError` ankommt
 *   und nach der A8-Tabelle als 503 mit `logger.error` sichtbar wird — laut,
 *   nicht still. Die Entscheidung gehört zu A10 (Zugangsdaten); zu ändern ist
 *   dann je Methode **ein** `credentials`-Feld. Vorher nichts umstellen: 30
 *   Anfragen je Minute über den Ops-Datensatz wären für einen Wallet-Aufruf der
 *   falsche Deckel.
 */

import { logger } from '@/lib/logger';
import { requestPlatform, type PlatformTransportDeps } from '@/lib/nft-data-platform/client';
import { buildListQuery, type PlatformCursor } from '@/lib/nft-data-platform/cursor';
import { PlatformResponseError } from '@/lib/nft-data-platform/errors';
import {
    discoverResponseSchema,
    refreshJobResponseSchema,
    walletInventoryResponseSchema,
} from '@/lib/nft-data-platform/schemas';
import type {
    PlatformDiscoverItem,
    PlatformDiscoverResponse,
    PlatformRefreshJobResponse,
    PlatformWalletInventoryResponse,
} from '@/lib/nft-data-platform/types';
import { isCollectionWhitelisted } from '@/services/blockchain/collection-whitelist';
import type { z } from 'zod';

/** Größte Zahl Identitäten je Discover-Aufruf, von der Plattform vorgegeben. */
export const DISCOVER_BATCH_LIMIT = 500;

/** Meldung, die eine durch unseren Filter abgelehnte Identität trägt. */
const NOT_WHITELISTED_MESSAGE =
    'Collection steht nicht auf der Diamond-Whitelist — kein Discover und kein Refresh ausgelöst.';

export type TokenIdentityInput = {
    chainId: number;
    contractAddress: string;
    tokenId: string;
};

/**
 * Prüft eine Rohantwort gegen ein Schema und wirft bei Abweichung einen
 * Plattform-Fehler mit Fundstelle.
 *
 * Gleiche Begründung wie in `read.ts`: ein nackter zod-Fehler landet im
 * 500er-Default der A8-Tabelle und sieht dann wie ein Fehler bei uns aus.
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
 * Zerlegt eine Liste in Blöcke, die die Plattform annimmt.
 *
 * @param items - beliebig lange Liste
 * @param size - Blockgröße
 * @returns Liste von Blöcken; bei leerer Eingabe eine leere Liste
 */
function chunk<T>(items: readonly T[], size: number): T[][] {
    const blocks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        blocks.push(items.slice(index, index + size));
    }

    return blocks;
}

/**
 * Baut das Ergebnis für eine Identität, die unser Filter abgelehnt hat.
 *
 * Als `failed` mit eigener Meldung, nicht als Lücke: der Aufrufer soll sehen,
 * dass gefiltert wurde, statt auf ein Indexing zu warten, das niemand
 * angestoßen hat.
 *
 * @param identity - abgelehnte Identität
 * @returns Eintrag in der Form, die die Plattform für Ablehnungen verwendet
 */
function rejectedItem(identity: TokenIdentityInput): PlatformDiscoverItem {
    return {
        chainId: identity.chainId,
        contractAddress: identity.contractAddress,
        tokenId: identity.tokenId,
        discoveryStatus: 'failed',
        queuedJobId: null,
        jobId: null,
        token: null,
        collection: null,
        message: NOT_WHITELISTED_MESSAGE,
    };
}

/**
 * Teilt Identitäten in zugelassene und abgelehnte.
 *
 * @param identities - zu prüfende Identitäten
 * @returns zugelassene Identitäten und die Ergebniseinträge der abgelehnten
 */
async function partitionByWhitelist(
    identities: readonly TokenIdentityInput[]
): Promise<{ allowed: TokenIdentityInput[]; rejected: PlatformDiscoverItem[] }> {
    const allowed: TokenIdentityInput[] = [];
    const rejected: PlatformDiscoverItem[] = [];

    for (const identity of identities) {
        if (await isCollectionWhitelisted(identity.contractAddress)) {
            allowed.push(identity);
            continue;
        }

        rejected.push(rejectedItem(identity));
    }

    if (rejected.length > 0) {
        logger.warn(
            { rejected: rejected.length, allowed: allowed.length },
            'nft_data_platform_discover_filtered'
        );
    }

    return { allowed, rejected };
}

/**
 * Führt die Antworten mehrerer Blöcke und die abgelehnten Einträge zusammen.
 *
 * Die Zusammenfassung wird neu gerechnet, nicht addiert: die abgelehnten
 * Einträge haben die Plattform nie erreicht und stehen in keiner ihrer
 * Zusammenfassungen.
 *
 * @param responses - Antworten der einzelnen Blöcke
 * @param rejected - Einträge, die unser Filter abgelehnt hat
 * @returns eine Antwort über alle Identitäten
 */
function mergeDiscoverResponses(
    responses: readonly PlatformDiscoverResponse[],
    rejected: readonly PlatformDiscoverItem[]
): PlatformDiscoverResponse {
    const items = [...responses.flatMap((response) => response.items), ...rejected];

    return {
        ok: true,
        summary: {
            total: items.length,
            ready: items.filter((item) => item.discoveryStatus === 'ready').length,
            queued: items.filter((item) => item.discoveryStatus === 'queued').length,
            failed: items.filter((item) => item.discoveryStatus === 'failed').length,
        },
        items,
    };
}

/**
 * Liest das Inventar einer Wallet, cursor-paginiert, optional über mehrere
 * Chains.
 *
 * **Der Pfad ist nicht der, den der Routenbaum der Plattform vermuten lässt** —
 * siehe Dateikopf. Die Eigentümer-Adresse steht im Pfad, die Chains stehen als
 * kommaseparierter Query-Parameter daneben.
 *
 * @param params - Eigentümer, optionale Chain-Liste, Cursor, Umfang
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns eine Seite des Inventars samt Seiteninformation
 */
export async function getWalletInventory(
    params: {
        ownerAddress: string;
        chainIds?: readonly number[];
        cursor?: PlatformCursor | null;
        limit?: number;
    },
    deps?: PlatformTransportDeps
): Promise<PlatformWalletInventoryResponse> {
    const base = `/api/v1/owners/wallets/${params.ownerAddress}`;
    const path = `${base}${buildListQuery({
        cursor: params.cursor,
        limit: params.limit,
        // Kommasepariert, nicht als Mehrfachparameter: die Plattform liest
        // `searchParams.get("chainIds")` und spaltet selbst.
        extra: { chainIds: params.chainIds?.join(',') },
    })}`;

    const { data } = await requestPlatform({ method: 'GET', path, credentials: 'read' }, deps);

    return parseOrThrow(walletInventoryResponseSchema, data, base);
}

/**
 * Meldet Token-Identitäten zum Indexing an.
 *
 * Filtert zuerst gegen die Diamond-Whitelist, stückelt dann auf Blöcke von
 * höchstens 500 und sendet sie nacheinander.
 *
 * @param identities - Token-Identitäten, beliebig viele
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns eine Antwort über alle Identitäten, abgelehnte als `failed`
 */
export async function discoverTokens(
    identities: readonly TokenIdentityInput[],
    deps?: PlatformTransportDeps
): Promise<PlatformDiscoverResponse> {
    const { allowed, rejected } = await partitionByWhitelist(identities);
    const path = '/api/v1/tokens/discover';
    const responses: PlatformDiscoverResponse[] = [];

    for (const block of chunk(allowed, DISCOVER_BATCH_LIMIT)) {
        const { data } = await requestPlatform(
            { method: 'POST', path, credentials: 'read', body: { items: block } },
            deps
        );

        responses.push(parseOrThrow(discoverResponseSchema, data, path));
    }

    return mergeDiscoverResponses(responses, rejected);
}

/**
 * Meldet die Holdings einer Wallet zum Indexing an.
 *
 * Die Plattform kann nur erfassen, was wir ihr nennen — sie ist kein
 * Wallet-Crawler. Was der Marktplatz nicht kennt, kommt hier auch nicht an;
 * das ist in der Oberfläche als eigener Zustand zu zeigen (A6), nicht hier zu
 * kaschieren.
 *
 * @param params - Eigentümer und seine Token-Identitäten
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns eine Antwort über alle Identitäten, abgelehnte als `failed`
 */
export async function discoverWalletHoldings(
    params: { ownerAddress: string; identities: readonly TokenIdentityInput[] },
    deps?: PlatformTransportDeps
): Promise<PlatformDiscoverResponse> {
    const { allowed, rejected } = await partitionByWhitelist(params.identities);
    const path = '/api/v1/owners/wallets/discover';
    const responses: PlatformDiscoverResponse[] = [];

    for (const block of chunk(allowed, DISCOVER_BATCH_LIMIT)) {
        const { data } = await requestPlatform(
            {
                method: 'POST',
                path,
                credentials: 'read',
                body: { ownerAddress: params.ownerAddress, items: block },
            },
            deps
        );

        responses.push(parseOrThrow(discoverResponseSchema, data, path));
    }

    return mergeDiscoverResponses(responses, rejected);
}

/**
 * Stellt einen Auftrag, ein Token neu zu erfassen.
 *
 * @param identity - Token-Identität
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns der angelegte Auftrag, oder null wenn die Collection nicht
 *   freigegeben ist — **kein Wurf**: eine nicht freigegebene Collection ist das
 *   Ergebnis unserer Prüfung, kein Fehler der Plattform
 */
export async function queueTokenRefresh(
    identity: TokenIdentityInput,
    deps?: PlatformTransportDeps
): Promise<PlatformRefreshJobResponse | null> {
    if (!(await isCollectionWhitelisted(identity.contractAddress))) {
        logger.warn(
            { contractAddress: identity.contractAddress, tokenId: identity.tokenId },
            'nft_data_platform_token_refresh_filtered'
        );
        return null;
    }

    const path = '/api/v1/refresh/token';
    const { data } = await requestPlatform(
        { method: 'POST', path, credentials: 'read', body: identity },
        deps
    );

    return parseOrThrow(refreshJobResponseSchema, data, path);
}

/**
 * Stellt einen Auftrag, eine Collection neu zu erfassen.
 *
 * Der **einzige** Aufruf über den Ops-Zugangsdatensatz: `refresh:collection`
 * ist der einzige Scope, den `alpha-read` nicht hat (V15).
 *
 * @param identity - Chain und Contract
 * @param deps - einspeisbare Transportumgebung für Tests
 * @returns der angelegte Auftrag, oder null wenn die Collection nicht
 *   freigegeben ist
 */
export async function queueCollectionRefresh(
    identity: { chainId: number; contractAddress: string },
    deps?: PlatformTransportDeps
): Promise<PlatformRefreshJobResponse | null> {
    if (!(await isCollectionWhitelisted(identity.contractAddress))) {
        logger.warn(
            { contractAddress: identity.contractAddress },
            'nft_data_platform_collection_refresh_filtered'
        );
        return null;
    }

    const path = '/api/v1/refresh/collection';
    const { data } = await requestPlatform(
        { method: 'POST', path, credentials: 'ops', body: identity },
        deps
    );

    return parseOrThrow(refreshJobResponseSchema, data, path);
}
