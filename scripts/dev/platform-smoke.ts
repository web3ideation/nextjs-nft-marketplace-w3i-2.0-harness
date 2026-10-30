/**
 * Datei: scripts/dev/platform-smoke.ts
 *
 * Zweck: Fährt V11 gegen eine erreichbare NFT Data Platform — dieselbe
 * signierte Anfrage zweimal (erwartet 200, dann 409 replayed_request), danach
 * eine korrekt neu signierte Wiederholung (erwartet 200).
 *
 * Wird aufgerufen von:
 * - `npm run platform:smoke` (von Hand, nicht von npm run check)
 *
 * Wichtig:
 * - Dieses Skript ist ABSICHTLICH nicht Teil von `npm run check`. Nach
 *   Entscheidung E3 (state/plan-v1-plattform-integration.md, Abschnitt 9) prüft
 *   die CI gegen einen Mock; der Lauf gegen eine echte Instanz braucht
 *   Zugangsdaten, eine laufende Instanz und die IP in der Allowlist.
 * - Fehlen die Zugangsdaten, bricht es mit Exit 1 ab und sagt ausdrücklich,
 *   dass V11 damit UNGEPRÜFT bleibt. Es meldet nie Erfolg, weil nichts zu tun
 *   war — genau diese Art stiller Erfolg ist der Grund, warum V11 überhaupt
 *   Pflichttest ist.
 * - Es signiert hier von Hand statt über requestPlatform, weil der Client
 *   dieselbe Signatur nicht zweimal senden KANN. Das ist der Punkt: das Skript
 *   muss die verbotene Sache tun, um zu belegen, dass die Plattform sie ablehnt.
 * - Gelesen wird `GET /api/v1/collections` — nebenwirkungsfrei, braucht nur
 *   `collections:read` und antwortet auch bei leerem Index mit 200.
 */

import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: join(process.cwd(), '.env.local') });

import { requestPlatform } from '@/lib/nft-data-platform/client';
import { getPlatformConfig, type PlatformConfig } from '@/lib/nft-data-platform/config';
import { isPlatformError, PlatformConfigError } from '@/lib/nft-data-platform/errors';
import { buildAuthHeaders, currentTimestampSeconds } from '@/lib/nft-data-platform/signing';

/** Nebenwirkungsfreier Leseendpunkt, der nur collections:read braucht. */
const SMOKE_PATH = '/api/v1/collections?limit=1';

/**
 * Fehlerform der Plattform: der Code steht im Feld `error`.
 *
 * Über zod statt über eine Typzusicherung — was von außen kommt, wird geprüft,
 * nicht behauptet.
 */
const errorBodySchema = z.object({ error: z.string().min(1).optional() });

type StepResult = { label: string; passed: boolean; detail: string };

const results: StepResult[] = [];

/**
 * Hält ein Prüfergebnis fest und gibt es sofort aus.
 *
 * @param label - was geprüft wurde
 * @param passed - ob es der Erwartung entsprach
 * @param detail - beobachtetes Ergebnis im Klartext
 * @returns nichts
 */
function record(label: string, passed: boolean, detail: string): void {
    results.push({ label, passed, detail });
    console.log(`${passed ? 'OK  ' : 'FEHL'} ${label} — ${detail}`);
}

/**
 * Sendet eine Anfrage mit exakt den übergebenen Headern, ohne neu zu signieren.
 *
 * @param url - vollständige Ziel-URL
 * @param headers - fertige Header, inklusive Signatur
 * @returns Status und der Fehlercode aus dem Body, wenn vorhanden
 */
async function sendRaw(url: string, headers: Record<string, string>): Promise<{ status: number; code: string | null }> {
    const response = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
    const text = await response.text();

    let code: string | null = null;
    try {
        const parsed = errorBodySchema.safeParse(JSON.parse(text));
        code = parsed.success ? (parsed.data.error ?? null) : null;
    } catch {
        code = null;
    }

    return { status: response.status, code };
}

/**
 * Führt den Smoke-Lauf aus.
 *
 * @returns nichts; setzt den Exit-Code über process.exitCode
 */
async function main(): Promise<void> {
    let platformConfig: PlatformConfig;

    try {
        platformConfig = getPlatformConfig();
    } catch (error) {
        if (error instanceof PlatformConfigError) {
            console.error('\nAbbruch: die NFT Data Platform ist hier nicht konfiguriert.');
            console.error(`Fehlende Umgebungsvariablen: ${error.missingVariables.join(', ')}`);
            console.error('\nV11 (409 bei wiederholter Signatur, 200 bei neu signierter Wiederholung)');
            console.error('bleibt damit UNGEPRÜFT. Die Unit-Tests belegen nur die Mechanik gegen einen Mock.');
            console.error('Vorbedingungen siehe state/plan-v1-plattform-integration.md, Abschnitt 3 (Paket A0).');
            process.exitCode = 1;
            return;
        }

        throw error;
    }

    const credentials = platformConfig.credentials.read;
    const url = `${platformConfig.baseUrl}${SMOKE_PATH}`;
    const canonicalPath = new URL(url).pathname + new URL(url).search;

    console.log(`\nPrüfstand: ${platformConfig.baseUrl}`);
    console.log(`Client:    ${credentials.clientId}`);
    console.log(`Endpunkt:  GET ${SMOKE_PATH}\n`);

    // Einmal signieren, zweimal senden. Genau das, was der Client nie tut.
    const timestamp = currentTimestampSeconds();
    const headers = {
        accept: 'application/json',
        ...buildAuthHeaders({
            method: 'GET',
            path: canonicalPath,
            body: '',
            timestamp,
            credentials,
        }),
    };

    const first = await sendRaw(url, headers);
    record(
        'Erster Versuch mit frischer Signatur ergibt 200',
        first.status === 200,
        `Status ${first.status}${first.code === null ? '' : ` (${first.code})`}`
    );

    if (first.status !== 200) {
        console.error('\nDer erste Versuch ist schon gescheitert. Der 409-Test ist damit ohne Aussage.');
        console.error('Häufige Ursachen: IP nicht in der Allowlist (403 ip_not_allowed), falsches Secret');
        console.error('(401 invalid_signature), Uhrdrift über 300 Sekunden (401 stale_timestamp).');
        process.exitCode = 1;
        return;
    }

    const second = await sendRaw(url, headers);
    record(
        'Dieselbe Signatur ein zweites Mal ergibt 409 replayed_request',
        second.status === 409 && second.code === 'replayed_request',
        `Status ${second.status}${second.code === null ? '' : ` (${second.code})`}`
    );

    try {
        const resigned = await requestPlatform({ method: 'GET', path: SMOKE_PATH, credentials: 'read' });
        record(
            'Korrekt neu signierte Wiederholung ergibt 200',
            resigned.status === 200,
            `Status ${resigned.status} nach ${resigned.attempts} Versuch(en)`
        );
    } catch (error) {
        record(
            'Korrekt neu signierte Wiederholung ergibt 200',
            false,
            isPlatformError(error) ? `${error.name}: ${error.message}` : String(error)
        );
    }

    const failed = results.filter((result) => !result.passed);

    console.log('');
    if (failed.length === 0) {
        console.log(`V11 belegt gegen ${platformConfig.baseUrl} — ${results.length} von ${results.length} Prüfungen bestanden.`);
        console.log('Ergebnis in state/plan-v1-plattform-integration.md, Paket A10, protokollieren.');
        return;
    }

    console.error(`V11 NICHT belegt: ${failed.length} von ${results.length} Prüfungen gescheitert.`);
    process.exitCode = 1;
}

main().catch((error: unknown) => {
    console.error('[platform:smoke] abgebrochen', error);
    process.exitCode = 1;
});
