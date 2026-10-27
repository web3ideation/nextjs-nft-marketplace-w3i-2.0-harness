/**
 * API Handler Wrapper
 * 
 * Standardized API route handler with:
 * - Automatic error handling
 * - Middleware support
 * - Type-safe responses
 * - Request logging
 * - CORS handling
 * 
 * @example
 * ```typescript
 * export const GET = apiHandler(
 *   async (req) => {
 *     const data = await fetchData();
 *     return createSuccessResponse(data);
 *   },
 *   { middleware: [withAuth] }
 * );
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, RateLimitError } from './errors';

/**
 * Bringt das `details`-Feld eines Fehlers in die Form, die
 * `createErrorResponse` als `metadata` ausliefert.
 *
 * Verengung statt Zusicherung: `details` ist `unknown`, und ein Array oder ein
 * nackter Wert hat in einem Metadaten-Objekt nichts zu suchen — er würde im
 * Browser als `metadata: [...]` oder `metadata: "text"` ankommen und jeden
 * Leser überraschen. Was nicht passt, wird weggelassen, nicht umgeformt.
 *
 * @param details - das `details`-Feld eines ApiError
 * @returns ein Objekt für `metadata`, oder undefined
 */
function toErrorMetadata(details: unknown): Record<string, unknown> | undefined {
    return isPlainObject(details) ? details : undefined;
}

/**
 * Echter Type Guard für ein einfaches Objekt.
 *
 * Als Prädikat formuliert, damit keine Typzusicherung nötig ist: `unknown` wird
 * durch die Prüfung selbst verengt, nicht durch ein `as`.
 *
 * @param value - beliebiger Wert
 * @returns true, wenn der Wert ein Objekt und kein Array ist
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
import { apiTooManyRequests, createErrorResponse } from './responses';
import { logger } from '../logger';
import { rateLimit, RATE_LIMIT_CONFIG, type RateLimitConfig } from '../middleware/rateLimit';

export type ApiHandler<T = any> = (req: NextRequest) => Promise<NextResponse<T> | NextResponse>;

export type Middleware = (req: NextRequest) => Promise<void | NextResponse>;

export interface ApiHandlerOptions {
    /**
     * Middleware functions to run before handler
     */
    middleware?: Middleware[];

    /**
     * Require authentication (adds withAuth middleware)
     */
    auth?: boolean;

    /**
     * Require admin authentication (adds withAdmin middleware)
     */
    admin?: boolean;

    /**
     * Rate limit configuration (default: lenient). Set to false to disable.
     */
    rateLimit?: RateLimitConfig | false;

    /**
     * Enable CORS for this route
     */
    cors?: boolean | {
        origin?: string | string[];
        methods?: string[];
        headers?: string[];
    };

    /**
     * Log requests (default: true in development)
     */
    logging?: boolean;
}

/**
 * Wraps an API handler with standardized error handling and middleware
 */
export function apiHandler<T = any>(
    handler: ApiHandler<T>,
    options: ApiHandlerOptions = {}
): ApiHandler<T> {
    const {
        middleware = [],
        auth = false,
        admin = false,
        cors = false,
        logging = process.env.NODE_ENV === 'development',
        rateLimit: rateLimitConfig,
    } = options;

    const resolvedRateLimit = rateLimitConfig === undefined
        ? (admin ? RATE_LIMIT_CONFIG.STRICT : auth ? RATE_LIMIT_CONFIG.STANDARD : RATE_LIMIT_CONFIG.LENIENT)
        : rateLimitConfig;

    return async (req: NextRequest): Promise<NextResponse<T>> => {
        const startTime = Date.now();

        try {
            // Logging
            if (logging) {
                logger.info({
                    method: req.method,
                    path: req.nextUrl.pathname,
                }, 'api request');
            }

            // Build middleware chain
            const middlewareChain: Middleware[] = [];

            // Auto-add auth/admin middleware
            if (admin) {
                const { withAdmin } = await import('../middleware/auth');
                middlewareChain.push(withAdmin);
            } else if (auth) {
                const { withAuth } = await import('../middleware/auth');
                middlewareChain.push(withAuth);
            }

            if (resolvedRateLimit !== false) {
                middlewareChain.push(async (request) => {
                    await rateLimit(request, resolvedRateLimit);
                });
            }

            middlewareChain.push(...middleware);

            // Run middleware
            for (const mw of middlewareChain) {
                const result = await mw(req);
                // If middleware returns a response, return it immediately
                if (result instanceof NextResponse) {
                    return result as any;
                }
            }

            // Execute handler
            const response = await handler(req);

            // Add CORS headers if enabled
            if (cors) {
                addCorsHeaders(response, cors);
            }

            // Log success
            if (logging) {
                const duration = Date.now() - startTime;
                logger.info({
                    method: req.method,
                    path: req.nextUrl.pathname,
                    status: response.status,
                    durationMs: duration,
                }, 'api response');
            }

            return response as any;
        } catch (error) {
            // Log error
            if (logging) {
                const duration = Date.now() - startTime;
                logger.error({
                    method: req.method,
                    path: req.nextUrl.pathname,
                    durationMs: duration,
                    error,
                }, 'api error');
            }

            // Handle RateLimitError explicitly for Retry-After header
            if (error instanceof RateLimitError) {
                return apiTooManyRequests(error.message, error.retryAfter) as any;
            }

            // Handle ApiError instances
            if (error instanceof ApiError) {
                // `details` wurde bis Paket A7b nicht durchgereicht, obwohl
                // `createErrorResponse` einen vierten Parameter dafür hat. Folge:
                // jede Route, die Felder an einen Fehler hängt, verlor sie still —
                // auch `ValidationError`, das seine Validierungsfehler in
                // `details` legt. Rein additiv: `metadata` erscheint nur, wenn ein
                // Fehler `details` trägt.
                return createErrorResponse(
                    error.message,
                    error.statusCode,
                    error.code,
                    toErrorMetadata(error.details)
                ) as any;
            }

            // Handle unknown errors
            logger.error({ error }, 'unexpected api error');
            return createErrorResponse(
                'An unexpected error occurred',
                500,
                'INTERNAL_SERVER_ERROR'
            ) as any;
        }
    };
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(
    response: NextResponse,
    cors: boolean | { origin?: string | string[]; methods?: string[]; headers?: string[] }
): void {
    if (cors === true) {
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    } else if (typeof cors === 'object') {
        if (cors.origin) {
            const origin = Array.isArray(cors.origin) ? cors.origin.join(', ') : cors.origin;
            response.headers.set('Access-Control-Allow-Origin', origin);
        }
        if (cors.methods) {
            response.headers.set('Access-Control-Allow-Methods', cors.methods.join(', '));
        }
        if (cors.headers) {
            response.headers.set('Access-Control-Allow-Headers', cors.headers.join(', '));
        }
    }
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export function createOptionsHandler(cors?: ApiHandlerOptions['cors']): ApiHandler {
    return async () => {
        const response = new NextResponse(null, { status: 204 });
        if (cors) {
            addCorsHeaders(response, cors);
        }
        return response as any;
    };
}
