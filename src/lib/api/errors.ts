/**
 * API Error Classes
 * 
 * Custom error classes für besseres Error Handling
 */

export class ApiError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code?: string,
        public details?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export class BadRequestError extends ApiError {
    constructor(message: string = 'Bad Request', details?: unknown) {
        super(message, 400, 'BAD_REQUEST', details);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends ApiError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends ApiError {
    constructor(message: string = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends ApiError {
    /**
     * @param message - Meldung für den Nutzer
     * @param details - zusätzliche Felder, die in der Antwort als `metadata`
     *   erscheinen. Gebraucht für V5: ein nicht indiziertes Token antwortet mit
     *   404 und trägt `code: 'TOKEN_NOT_INDEXED'`, `refreshQueued`,
     *   `refreshJobId`, `contractAddress`, `tokenId`, `chainId`.
     * @param code - überschreibt den Standardcode `NOT_FOUND`
     */
    constructor(message: string = 'Not Found', details?: unknown, code: string = 'NOT_FOUND') {
        super(message, 404, code, details);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends ApiError {
    constructor(message: string = 'Conflict', details?: unknown) {
        super(message, 409, 'CONFLICT', details);
        this.name = 'ConflictError';
    }
}

export class ValidationError extends ApiError {
    constructor(message: string = 'Validation Failed', public validationErrors?: Record<string, string>) {
        super(message, 422, 'VALIDATION_ERROR', { validation: validationErrors });
        this.name = 'ValidationError';
    }
}

export class RateLimitError extends ApiError {
    constructor(message: string = 'Too Many Requests', public retryAfter?: number) {
        super(message, 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
        this.name = 'RateLimitError';
    }
}

export class InternalError extends ApiError {
    constructor(message: string = 'Internal Server Error', error?: unknown) {
        super(
            message,
            500,
            'INTERNAL_ERROR',
            process.env.NODE_ENV === 'development' ? error : undefined
        );
        this.name = 'InternalError';
    }
}

// ===== ERROR HANDLER HELPER =====

export function isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An unknown error occurred';
}

export function getErrorStatus(error: unknown): number {
    if (isApiError(error)) {
        return error.statusCode;
    }
    return 500;
}
