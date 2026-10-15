/**
 * Datei: src/lib/nft-data-platform/client.ts
 *
 * Zweck: Server-only Transport zur NFT Data Platform. Signiert jede Anfrage neu,
 * wiederholt sie nach Regeln, normalisiert Fehler und hält das Fensterlimit ein.
 * Kennt keinen einzigen fachlichen Endpunkt — die typisierten Methoden und die
 * DTO-Prüfung kommen in Paket A3.
 *
 * Wird aufgerufen von:
 * - src/lib/nft-data-platform/client.test.ts
 * - scripts/dev/platform-smoke.ts
 * - ab A3 die typisierten Endpunkt-Methoden, ab A5 die migrierten Routen
 *
 * Wichtig:
 * - SERVER ONLY. Kein Browser-Code ruft das hier auf (V10). Das Modul liest
 *   Secrets aus der Umgebung; landet es im Client-Bundle, sind sie öffentlich.
 * - Die Rückgabe ist `data: unknown`, mit Absicht kein Generic. Ein
 *   `requestPlatform<T>` würde eine Typkenntnis behaupten, die auf dieser
 *   Schicht nicht existiert, und wäre im Rumpf nur mit einem `as T` einzulösen.
 *   Geprüft wird die Form in A3 mit zod.
 * - Ein Client-Objekt, zwei Zugangsdatensätze, Auswahl je Aufruf über
 *   `credentials` (Empfehlung P8 des Plans). Lesen, Discover und Token-Refresh
 *   laufen über 'read', die Collection-Registrierung über 'ops' (V15).
 * - Jeder Versuch signiert NEU. Es gibt keinen Pfad, auf dem eine Signatur ein
 *   zweites Mal gesendet wird (V11).
 * - Die Falle beim Wiederholen: der Zeitstempel hat Sekundenauflösung. Zwei
 *   Versuche derselben Anfrage innerhalb einer Sekunde ergäben dieselbe
 *   kanonische Zeichenkette, damit dieselbe Signatur — und der Replay-Schutz
 *   der Plattform antwortete garantiert mit 409. Deshalb ist der Zeitstempel je
 *   Anfrage streng monoton: er ist mindestens eine Sekunde höher als der des
 *   vorigen Versuchs, auch wenn die Uhr noch nicht weiter ist. Ein Zeitstempel,
 *   der wenige Sekunden vorausliegt, ist zulässig — die Plattform erlaubt 300
 *   Sekunden Abweichung in BEIDE Richtungen (AUTH_MAX_TIMESTAMP_SKEW_SEC,
 *   `isTimestampFresh` rechnet mit Math.abs). Warten wäre die Alternative und
 *   wäre teurer, ohne sicherer zu sein.
 * - Der Nebenläufigkeits-Platz wird freigegeben, sobald die Antwort-Header da
 *   sind, nicht erst nach dem Lesen des Bodys und niemals über einen Backoff
 *   hinweg. Ein Platz, der während der Wartezeit belegt bleibt, verwandelt den
 *   Deckel in eine Bremse für alle anderen.
 */

import { logger } from '@/lib/logger';
import { getPlatformConfig, type CredentialKind, type PlatformCredentials } from '@/lib/nft-data-platform/config';
import {
    normalizePlatformFailure,
    PlatformRateLimitError,
    PlatformResponseError,
    PlatformTimeoutError,
    PlatformUnavailableError,
    type PlatformError,
} from '@/lib/nft-data-platform/errors';
import {
    acquireSlot,
    getRateLimitWaitMs,
    markWindowExhausted,
    recordRateLimitHeaders,
    recordRequestSent,
} from '@/lib/nft-data-platform/rate-limit';
import { buildAuthHeaders } from '@/lib/nft-data-platform/signing';

/** Basiswartezeit des Backoffs. */
const BACKOFF_BASE_MS = 250;

/** Obergrenze einer einzelnen Wartezeit, damit ein Aufruf nicht unbegrenzt hängt. */
const BACKOFF_CAP_MS = 4_000;

export type PlatformRequestOptions = {
    method: 'GET' | 'POST';
    /** Pfad ab der Basis-URL, inklusive Query, z. B. `/api/v1/search?q=foo`. */
    path: string;
    /** Welcher Zugangsdatensatz gilt — 'read' zum Lesen, 'ops' zum Registrieren. */
    credentials: CredentialKind;
    /** Wird als JSON gesendet. Fehlt er, geht ein leerer Body raus. */
    body?: unknown;
    /** Überschreibt den Timeout aus der Konfiguration. */
    timeoutMs?: number;
    /** Abbruchsignal des Aufrufers; wird vom Timeout getrennt behandelt. */
    signal?: AbortSignal;
};

export type PlatformTransportDeps = {
    fetchImpl?: typeof fetch;
    sleepImpl?: (ms: number) => Promise<void>;
    nowMs?: () => number;
    /** Liefert eine Zahl in [0,1) für den Jitter. In Tests festgenagelt. */
    randomUnit?: () => number;
};

export type PlatformResult = {
    /** Geparster JSON-Body. Form ungeprüft — das macht A3 mit zod. */
    data: unknown;
    status: number;
    /** Wie viele Versuche es gebraucht hat. 1 heißt: beim ersten Mal. */
    attempts: number;
};

/** Ergebnis eines einzelnen Sendeversuchs — Antwort oder Transportfehler. */
type AttemptOutcome = { ok: true; response: Response } | { ok: false; error: PlatformError };

/**
 * Wartet die angegebene Zeit ab.
 *
 * @param ms - Wartezeit in Millisekunden
 * @returns Promise, das nach der Wartezeit erfüllt wird
 */
function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Berechnet die Wartezeit vor dem nächsten Versuch: exponentiell mit vollem
 * Jitter, nach oben gedeckelt.
 *
 * Voller Jitter statt fester Staffelung, damit mehrere gleichzeitig gebremste
 * Anfragen nicht gemeinsam zur selben Millisekunde wieder anklopfen.
 *
 * @param attempt - Nummer des gerade gescheiterten Versuchs, ab 1
 * @param randomUnit - Zufallszahl in [0,1)
 * @returns Wartezeit in Millisekunden
 */
function backoffMs(attempt: number, randomUnit: () => number): number {
    const ceiling = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
    return Math.round(ceiling * randomUnit());
}

/**
 * Serialisiert den Body genau so, wie er gesendet und signiert wird.
 *
 * Signatur und Übertragung müssen dieselbe Zeichenkette sehen. Würde der Body
 * zweimal serialisiert, könnten sich Schlüsselreihenfolge oder Zahlenformat
 * unterscheiden und die Signatur wäre ungültig.
 *
 * @param body - beliebiger Wert oder undefined
 * @returns JSON-Zeichenkette, oder die leere Zeichenkette ohne Body
 */
function serializeBody(body: unknown): string {
    if (body === undefined) {
        return '';
    }

    return JSON.stringify(body) ?? '';
}

/**
 * Bestimmt den Zeitstempel dieses Versuchs — mindestens eine Sekunde nach dem
 * vorigen, damit die Signatur sich unterscheidet.
 *
 * @param nowMs - aktuelle Zeit in Millisekunden
 * @param previous - Zeitstempel des vorigen Versuchs, oder null beim ersten
 * @returns Unix-Sekunden als Zeichenkette
 */
function nextTimestampSeconds(nowMs: number, previous: string | null): string {
    const currentSeconds = Math.floor(nowMs / 1000);

    if (previous === null) {
        return currentSeconds.toString();
    }

    return Math.max(currentSeconds, Number(previous) + 1).toString();
}

/**
 * Liest die Antwort als JSON, ohne bei kaputtem Body zu werfen.
 *
 * @param response - Antwort der Plattform
 * @returns geparster Wert und ob der Body überhaupt JSON war
 */
async function readJsonBody(
    response: Response
): Promise<{ value: unknown; parsed: boolean; readFailed: boolean }> {
    let text: string;

    try {
        text = await response.text();
    } catch {
        // Das Lesen selbst kann scheitern: Verbindungsabbruch mitten im Body,
        // oder das Timeout-Signal feuert nach den Headern. Ohne diesen Zweig
        // flöge der Fehler am ganzen Normalisierungs- und Wiederholungsapparat
        // vorbei und käme beim Aufrufer als unbekannter Wurf an — also als 500
        // ohne Rückfall, obwohl es ein gewöhnlicher Ausfall ist.
        return { value: null, parsed: false, readFailed: true };
    }

    if (text.trim() === '') {
        return { value: null, parsed: true, readFailed: false };
    }

    try {
        return { value: JSON.parse(text), parsed: true, readFailed: false };
    } catch {
        return { value: null, parsed: false, readFailed: false };
    }
}

/**
 * Wandelt einen Fehler aus `fetch` in einen Plattform-Fehler.
 *
 * Unterscheidet drei Fälle, die sonst als ein "irgendwas ging schief"
 * zusammenfallen würden: der Aufrufer hat abgebrochen (kein Plattform-Fehler,
 * wird durchgereicht), der Timeout lief ab, oder das Netz war weg.
 *
 * @param error - gefangener Wert aus fetch
 * @param timeoutMs - konfigurierter Timeout, für die Meldung
 * @param callerAborted - ob das Signal des Aufrufers abgebrochen wurde
 * @returns der passende Plattform-Fehler
 * @throws den ursprünglichen Fehler, wenn der Aufrufer abgebrochen hat
 */
function toTransportError(error: unknown, timeoutMs: number, callerAborted: boolean): PlatformError {
    if (callerAborted) {
        throw error;
    }

    const isAbort = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

    if (isAbort) {
        return new PlatformTimeoutError(`Plattform antwortet nicht innerhalb von ${timeoutMs} ms`, timeoutMs);
    }

    const detail = error instanceof Error ? error.message : 'unbekannter Netzfehler';
    return new PlatformUnavailableError(`Plattform nicht erreichbar (${detail})`, null, null);
}

/**
 * Verbindet den Timeout mit einem optionalen Abbruchsignal des Aufrufers.
 *
 * Bewusst von Hand statt über `AbortSignal.any`: die Methode existiert zur
 * Laufzeit (Node ab 20.3), aber nicht in den TypeScript-Libs dieses Projekts.
 * Sie zu nutzen hieße, `lib` in der tsconfig anzuheben — eine
 * Build-Konfigurationsänderung für fünf Zeilen Ersatz.
 *
 * @param timeoutMs - Timeout dieses Versuchs
 * @param callerSignal - Abbruchsignal des Aufrufers, falls vorhanden
 * @returns das zu verwendende Signal und eine Aufräumfunktion
 */
function combineWithTimeout(
    timeoutMs: number,
    callerSignal: AbortSignal | undefined
): { signal: AbortSignal; dispose: () => void } {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    if (callerSignal === undefined) {
        return { signal: timeoutSignal, dispose: () => undefined };
    }

    const controller = new AbortController();

    const forwardTimeout = (): void => controller.abort(timeoutSignal.reason);
    const forwardCaller = (): void => controller.abort(callerSignal.reason);

    if (timeoutSignal.aborted) {
        forwardTimeout();
    } else if (callerSignal.aborted) {
        forwardCaller();
    } else {
        timeoutSignal.addEventListener('abort', forwardTimeout, { once: true });
        callerSignal.addEventListener('abort', forwardCaller, { once: true });
    }

    // Ohne das Abmelden sammelt ein langlebiges Aufrufer-Signal mit jedem
    // Versuch einen weiteren Zuhörer an.
    return {
        signal: controller.signal,
        dispose: () => {
            timeoutSignal.removeEventListener('abort', forwardTimeout);
            callerSignal.removeEventListener('abort', forwardCaller);
        },
    };
}

/**
 * Sendet genau einen signierten Versuch und gibt den Platz im
 * Nebenläufigkeitsdeckel sofort wieder frei.
 *
 * **Reihenfolge ist hier der ganze Punkt:** erst der Platz, dann Zeitstempel,
 * Signatur und Timeout-Uhr. Die erste Fassung hatte es umgekehrt, und das war
 * falsch an genau der Stelle, für die der Deckel gebaut ist — sobald er bremst
 * (also wenn die Plattform langsam ist), lief die Timeout-Uhr während der
 * Wartezeit mit. Bei einer Wartezeit über dem Timeout bekam `fetch` ein schon
 * abgebrochenes Signal, und der Fehler behauptete „Plattform antwortet nicht
 * innerhalb von 10000 ms", obwohl nie eine Anfrage rausging. Bei über 300
 * Sekunden Wartezeit wäre zusätzlich der mitgeschleppte Zeitstempel abgelaufen
 * und hätte den Uhrdrift-Alarm aus V16 ausgelöst — ein Fehlalarm auf dem Kanal,
 * der die Uhr überwacht.
 *
 * @param params - alles, was für diesen einen Versuch nötig ist
 * @returns Antwort oder Transportfehler, nie ein Wurf außer bei Abbruch
 */
async function sendOnce(params: {
    url: URL;
    canonicalPath: string;
    method: 'GET' | 'POST';
    bodyString: string;
    /** Wird NACH dem Platz aufgerufen; hält die Monotonie der Schleife fest. */
    nextTimestamp: () => string;
    /** Wird NACH dem Platz aufgerufen, kurz vor dem Senden. */
    onSending: () => void;
    credentialKind: CredentialKind;
    credentials: PlatformCredentials;
    timeoutMs: number;
    callerSignal: AbortSignal | undefined;
    doFetch: typeof fetch;
}): Promise<AttemptOutcome> {
    const release = await acquireSlot(params.credentialKind, params.credentials.concurrency);

    try {
        const timestamp = params.nextTimestamp();

        const headers: Record<string, string> = {
            accept: 'application/json',
            ...buildAuthHeaders({
                method: params.method,
                path: params.canonicalPath,
                body: params.bodyString,
                timestamp,
                credentials: params.credentials,
            }),
        };

        if (params.bodyString !== '') {
            headers['content-type'] = 'application/json';
        }

        const { signal, dispose } = combineWithTimeout(params.timeoutMs, params.callerSignal);
        params.onSending();

        try {
            const response = await params.doFetch(params.url, {
                method: params.method,
                headers,
                body: params.bodyString === '' ? undefined : params.bodyString,
                signal,
                cache: 'no-store',
            });

            return { ok: true, response };
        } catch (error) {
            return {
                ok: false,
                error: toTransportError(error, params.timeoutMs, params.callerSignal?.aborted === true),
            };
        } finally {
            dispose();
        }
    } finally {
        release();
    }
}

/**
 * Sendet eine signierte Anfrage an die NFT Data Platform, mit Wiederholung,
 * Backoff, Nebenläufigkeitsdeckel und normalisierten Fehlern.
 *
 * @param options - Methode, Pfad, Zugangsdatensatz, optional Body und Timeout
 * @param deps - einspeisbare Umgebung für Tests (fetch, sleep, now, random)
 * @returns geparster Body, Statuscode und Zahl der Versuche
 * @throws PlatformError in einer der Ausprägungen aus errors.ts — der
 *   Regelfall. Zwei Ausnahmen, bewusst: der Abbruch durch `options.signal`
 *   wird roh durchgereicht (der Aufrufer wollte es so, das ist kein
 *   Plattform-Fehler), und ein nicht serialisierbarer `body` wirft den
 *   `TypeError` aus `JSON.stringify`, bevor überhaupt etwas gesendet wird.
 */
export async function requestPlatform(
    options: PlatformRequestOptions,
    deps: PlatformTransportDeps = {}
): Promise<PlatformResult> {
    const config = getPlatformConfig();
    const credentials = config.credentials[options.credentials];

    const doFetch = deps.fetchImpl ?? fetch;
    const sleep = deps.sleepImpl ?? defaultSleep;
    const now = deps.nowMs ?? Date.now;
    const randomUnit = deps.randomUnit ?? Math.random;

    const timeoutMs = options.timeoutMs ?? config.timeoutMs;
    const bodyString = serializeBody(options.body);

    // Ein Pfad ohne führenden Schrägstrich würde beim Zusammensetzen im
    // Hostnamen landen (`https://platform.exampleapi/v1`) — und die Anfrage
    // ginge an einen fremden Host, nicht an einen falschen Pfad.
    if (!options.path.startsWith('/')) {
        throw new PlatformResponseError(
            `Pfad muss mit "/" beginnen, erhalten: ${options.path}`,
            null,
            null
        );
    }

    // Über die URL gehen, damit der signierte Pfad genau der ist, den der Server
    // sieht — inklusive normalisierter Mehrfach-Schrägstriche und Query.
    const url = new URL(`${config.baseUrl}${options.path}`);
    const canonicalPath = `${url.pathname}${url.search}`;

    let timestamp: string | null = null;
    let lastError: PlatformError = new PlatformUnavailableError(
        'Plattform-Anfrage ohne Ergebnis beendet',
        null,
        null
    );

    /**
     * Nächster Zeitstempel, streng monoton über die Versuche dieser Anfrage.
     * Wird von `sendOnce` erst nach dem Platz im Deckel aufgerufen, damit die
     * Signatur nicht schon während der Wartezeit altert.
     */
    const nextTimestamp = (): string => {
        timestamp = nextTimestampSeconds(now(), timestamp);
        return timestamp;
    };

    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
        const rateLimitWaitMs = getRateLimitWaitMs(options.credentials, now());

        if (rateLimitWaitMs > 0) {
            // Eine Sperre bis zur Fenstergrenze kann knapp eine Minute dauern.
            // Eine Web-Anfrage so lange hängen zu lassen ist schlechter, als
            // sofort den degradierten Pfad zu nehmen — A8 hält genau dafür
            // `allowLocalFallback: true` bereit.
            if (rateLimitWaitMs > timeoutMs) {
                throw new PlatformRateLimitError(
                    `Fensterlimit erschöpft, Wartezeit ${rateLimitWaitMs} ms über dem Budget von ${timeoutMs} ms`,
                    'rate_limit_exceeded'
                );
            }

            await sleep(rateLimitWaitMs);
        }

        const startedAt = now();

        const outcome = await sendOnce({
            url,
            canonicalPath,
            method: options.method,
            bodyString,
            nextTimestamp,
            // Gezählt wird unmittelbar vor dem Senden und nach dem Platz: die
            // Plattform zählt Versuche, und ein Versuch, der in der
            // Warteschlange steckt, hat ihr Fenster noch nicht belastet.
            onSending: () => {
                recordRequestSent(options.credentials, now());
            },
            credentialKind: options.credentials,
            credentials,
            timeoutMs,
            callerSignal: options.signal,
            doFetch,
        });

        if (!outcome.ok) {
            lastError = outcome.error;
            logger.warn(
                {
                    credentials: options.credentials,
                    method: options.method,
                    path: canonicalPath,
                    attempt,
                    durationMs: now() - startedAt,
                    error: lastError.name,
                },
                'nft_data_platform_request_failed'
            );

            if (attempt === config.maxAttempts) {
                throw lastError;
            }

            await sleep(backoffMs(attempt, randomUnit));
            continue;
        }

        const { response } = outcome;
        recordRateLimitHeaders(options.credentials, response.headers, now());
        const body = await readJsonBody(response);

        if (body.readFailed) {
            // Der Body brach beim Lesen ab. Behandelt wie ein Ausfall, nicht wie
            // eine kaputte Antwort: wir haben nichts bekommen, nicht etwas
            // Unverständliches — also wiederholbar und mit Rückfall.
            lastError = new PlatformUnavailableError(
                `Antwort der Plattform brach beim Lesen ab (HTTP ${response.status})`,
                response.status,
                null
            );

            logger.warn(
                {
                    credentials: options.credentials,
                    method: options.method,
                    path: canonicalPath,
                    attempt,
                    status: response.status,
                },
                'nft_data_platform_body_read_failed'
            );

            if (attempt === config.maxAttempts) {
                throw lastError;
            }

            await sleep(backoffMs(attempt, randomUnit));
            continue;
        }

        logger.debug(
            {
                credentials: options.credentials,
                method: options.method,
                path: canonicalPath,
                attempt,
                status: response.status,
                durationMs: now() - startedAt,
            },
            'nft_data_platform_request'
        );

        if (response.ok) {
            if (!body.parsed) {
                throw new PlatformResponseError(
                    'Plattform antwortet mit Status 2xx, aber der Body ist kein JSON',
                    response.status,
                    null
                );
            }

            return { data: body.value, status: response.status, attempts: attempt };
        }

        lastError = normalizePlatformFailure(response.status, body.value);

        if (response.status === 429) {
            markWindowExhausted(options.credentials, now());
        }

        // Zweite Hälfte von V16: der Alarm auf Uhrdrift. Eigene Fehlerstufe und
        // eigener Ereignisname, damit eine Überwachung darauf ansetzen kann —
        // im Debug-Rauschen wäre es kein Alarm. Eine Wiederholung hilft hier
        // nicht (siehe errors.ts), ein gestellter Server-Zeitstempel schon.
        if (lastError.platformCode === 'stale_timestamp') {
            logger.error(
                {
                    credentials: options.credentials,
                    sentTimestamp: timestamp,
                    maxSkewSeconds: 300,
                    path: canonicalPath,
                },
                'nft_data_platform_clock_drift'
            );
        }

        if (!lastError.retryable || attempt === config.maxAttempts) {
            throw lastError;
        }

        await sleep(backoffMs(attempt, randomUnit));
    }

    // Nicht erreichbar: die Schleife wirft oder kehrt zurück. Der Zweig hält den
    // Typecheck ohne Non-null-Assertion zufrieden.
    throw lastError;
}
