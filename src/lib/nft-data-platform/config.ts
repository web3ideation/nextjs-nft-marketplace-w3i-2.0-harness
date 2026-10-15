/**
 * Datei: src/lib/nft-data-platform/config.ts
 *
 * Zweck: Server-only Konfiguration für den Zugang zur NFT Data Platform —
 * Basis-URL, zwei Zugangsdatensätze (Read und Ops) und die Transport-Stellwerte
 * (Timeout, Versuche, Nebenläufigkeitsdeckel, Fensterlimit).
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/client.ts
 * - src/lib/nft-data-platform/rate-limit.ts
 * - scripts/dev/platform-smoke.ts
 *
 * Wichtig:
 * - Die Werte werden beim ERSTEN Aufruf gelesen, nicht auf Modulebene. Ein
 *   `throw` im Modulrumpf würde jeden Build ohne Zugangsdaten abbrechen —
 *   dieselbe Falle wie in state/tasks/fix-mongodb-lazy-init.md.
 * - Keine dieser Variablen darf ein `NEXT_PUBLIC_`-Gegenstück bekommen (V14).
 *   Secret und Signatur gehören nie in den Browser-Bundle.
 * - Die Variablennamen sind mit Paket A2 geteilt: `npm run env:check` macht
 *   genau diese Namen flag-abhängig pflichtig. Wer hier umbenennt, benennt dort
 *   mit um.
 */

import { z } from 'zod';

import { PlatformConfigError } from '@/lib/nft-data-platform/errors';

/** Welcher der beiden Zugangsdatensätze aus Entscheidung 14 gemeint ist. */
export type CredentialKind = 'read' | 'ops';

export type PlatformCredentials = {
    clientId: string;
    apiKey: string;
    apiSecret: string;
    /** Fensterlimit dieses Clients laut Vergabe — Startwert, von V34 gemessen. */
    limitPerMinute: number;
    /** Wie viele Anfragen dieses Clients gleichzeitig laufen dürfen. */
    concurrency: number;
};

export type PlatformConfig = {
    baseUrl: string;
    timeoutMs: number;
    maxAttempts: number;
    credentials: Record<CredentialKind, PlatformCredentials>;
};

/**
 * Prüft, ob eine Zeichenkette eine absolute http(s)-URL ist.
 *
 * Bewusst von Hand statt über `z.string().url()`: die zod-Variante akzeptiert
 * auch Schemata wie `file:` und hat zwischen den zod-Hauptversionen den Namen
 * gewechselt.
 *
 * @param value - zu prüfende Zeichenkette
 * @returns true, wenn die Zeichenkette als http- oder https-URL parst
 */
function isAbsoluteHttpUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

const requiredString = z.string().trim().min(1);

const positiveInt = z.coerce.number().int().positive();

/**
 * Liest eine Umgebungsvariable und merkt sich fehlende Namen, statt sofort zu
 * werfen — damit die Fehlermeldung am Ende ALLE fehlenden Namen nennt und nicht
 * nur den ersten. Wer eine Konfiguration nachträgt, will die vollständige Liste.
 *
 * @param name - Name der Umgebungsvariablen
 * @param missing - Sammelliste, in die fehlende Namen geschrieben werden
 * @returns der getrimmte Wert oder null, wenn er fehlt oder leer ist
 */
function readRequired(name: string, missing: string[]): string | null {
    const parsed = requiredString.safeParse(process.env[name]);

    if (!parsed.success) {
        missing.push(name);
        return null;
    }

    return parsed.data;
}

/**
 * Liest eine optionale Zahl aus der Umgebung und fällt auf den Standardwert
 * zurück, wenn sie fehlt oder unbrauchbar ist.
 *
 * @param name - Name der Umgebungsvariablen
 * @param fallback - Wert, der ohne brauchbare Angabe gilt
 * @returns die gelesene positive Ganzzahl oder der Standardwert
 */
function readOptionalPositiveInt(name: string, fallback: number): number {
    const raw = process.env[name];

    if (raw === undefined || raw.trim() === '') {
        return fallback;
    }

    const parsed = positiveInt.safeParse(raw);
    return parsed.success ? parsed.data : fallback;
}

/**
 * Baut den Zugangsdatensatz für eine der beiden Rollen.
 *
 * @param kind - 'read' oder 'ops'
 * @param missing - Sammelliste für fehlende Variablennamen
 * @returns der Datensatz, oder null wenn eine Pflichtvariable fehlt
 */
function readCredentials(kind: CredentialKind, missing: string[]): PlatformCredentials | null {
    const prefix = kind === 'read' ? 'NFT_API_READ' : 'NFT_API_OPS';

    const clientId = readRequired(`${prefix}_CLIENT_ID`, missing);
    const apiKey = readRequired(`${prefix}_KEY`, missing);
    const apiSecret = readRequired(`${prefix}_SECRET`, missing);

    if (clientId === null || apiKey === null || apiSecret === null) {
        return null;
    }

    // Startwerte aus Entscheidung 14 der Spec: read 600/min, ops 30/min.
    // Der Nebenläufigkeitsdeckel ist so gewählt, dass er erst greift, wenn die
    // Plattform ohnehin langsam antwortet — Begründung in rate-limit.ts.
    const defaults = kind === 'read' ? { limit: 600, concurrency: 8 } : { limit: 30, concurrency: 2 };

    return {
        clientId,
        apiKey,
        apiSecret,
        limitPerMinute: readOptionalPositiveInt(`${prefix}_LIMIT_PER_MINUTE`, defaults.limit),
        concurrency: readOptionalPositiveInt(`${prefix}_CONCURRENCY`, defaults.concurrency),
    };
}

let cached: PlatformConfig | null = null;

/**
 * Liefert die Plattform-Konfiguration und legt sie beim ersten Aufruf an.
 *
 * @returns die geprüfte Konfiguration
 * @throws PlatformConfigError wenn eine Pflichtvariable fehlt oder die
 *   Basis-URL keine absolute http(s)-URL ist. Die Meldung nennt die Namen.
 */
export function getPlatformConfig(): PlatformConfig {
    if (cached !== null) {
        return cached;
    }

    const missing: string[] = [];
    const baseUrl = readRequired('NFT_API_BASE_URL', missing);
    const read = readCredentials('read', missing);
    const ops = readCredentials('ops', missing);

    if (missing.length > 0) {
        throw new PlatformConfigError(
            `NFT Data Platform ist nicht konfiguriert. Fehlende Umgebungsvariablen: ${missing.join(', ')}.`,
            missing
        );
    }

    if (baseUrl === null || read === null || ops === null) {
        // Nicht erreichbar: `missing` wäre dann nicht leer. Der Zweig existiert,
        // damit der Typecheck ohne Non-null-Assertion durchläuft.
        throw new PlatformConfigError(
            'NFT Data Platform ist nicht konfiguriert.',
            missing
        );
    }

    if (!isAbsoluteHttpUrl(baseUrl)) {
        throw new PlatformConfigError(
            `NFT_API_BASE_URL ist keine absolute http(s)-URL: ${baseUrl}`,
            ['NFT_API_BASE_URL']
        );
    }

    cached = {
        // Ohne den Schrägstrich am Ende wegzuschneiden entstehen Pfade mit `//`,
        // und die kanonische Zeichenkette der Signatur nutzt den Pfad wörtlich.
        baseUrl: baseUrl.replace(/\/+$/, ''),
        timeoutMs: readOptionalPositiveInt('NFT_API_TIMEOUT_MS', 10_000),
        maxAttempts: readOptionalPositiveInt('NFT_API_MAX_ATTEMPTS', 3),
        credentials: { read, ops },
    };

    return cached;
}

/**
 * Wirft die zwischengespeicherte Konfiguration weg.
 *
 * Gedacht für Tests, die mit unterschiedlichen Umgebungen laufen. Im laufenden
 * Betrieb gibt es keinen Grund, die Konfiguration zu wechseln.
 *
 * @returns nichts
 */
export function resetPlatformConfigCache(): void {
    cached = null;
}

/**
 * Sagt, ob die Konfiguration vollständig ist, ohne zu werfen.
 *
 * Gedacht für Aufrufer, die einen degradierten Pfad haben und deshalb keinen
 * Fehler brauchen, sondern eine Entscheidung (V32).
 *
 * @returns true, wenn getPlatformConfig() ohne Fehler durchläuft
 */
export function isPlatformConfigured(): boolean {
    try {
        getPlatformConfig();
        return true;
    } catch {
        return false;
    }
}
