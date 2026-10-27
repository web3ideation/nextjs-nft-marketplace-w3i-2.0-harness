/**
 * Datei: src/lib/api/handler.test.ts
 *
 * Zweck: Belegt, dass `apiHandler` das `details`-Feld eines Fehlers als
 * `metadata` ausliefert — und dass das rein additiv ist.
 *
 * Wichtig:
 * - Die Rückwärtskompatibilität ist der eigentliche Gegenstand. Diese Datei
 *   gehört zum geteilten API-Code, den **jede** Route benutzt. Ein Fehler ohne
 *   `details` muss weiterhin eine Antwort **ohne** `metadata`-Feld ergeben;
 *   sonst ändert dieser Auftrag die Form jeder Fehlerantwort im Projekt.
 * - Dass `ValidationError` seine Details ab jetzt mitliefert, ist Folge
 *   derselben Zeile und beabsichtigt: sie gingen vorher still verloren.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { ApiError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { apiHandler } from '@/lib/api/handler';

/**
 * Ruft einen Handler, der den übergebenen Fehler wirft, und liest die Antwort.
 *
 * @param error - der zu werfende Fehler
 * @returns Status und geparster Antwortkörper
 */
async function callThrowing(error: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const handler = apiHandler(async () => {
        throw error;
    });

    const response = await handler(new NextRequest('http://localhost:3000/api/test'));

    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('Rückwärtskompatibilität — gilt für jede Route', () => {
    it('liefert ohne details KEIN metadata-Feld', async () => {
        const { status, body } = await callThrowing(new NotFoundError('weg'));

        expect(status).toBe(404);
        expect(body).not.toHaveProperty('metadata');
        expect(body).toMatchObject({ success: false, error: 'weg', code: 'NOT_FOUND' });
    });

    it('lässt die vier Felder der Fehlerhülle unverändert', async () => {
        const { body } = await callThrowing(new ApiError('kaputt', 500, 'BOOM'));

        expect(Object.keys(body).sort()).toEqual(['code', 'error', 'success'].sort());
    });
});

describe('details werden durchgereicht', () => {
    it('liefert ein Objekt aus details als metadata', async () => {
        const { status, body } = await callThrowing(
            new NotFoundError('Dieses NFT ist noch nicht erfasst.', {
                code: 'TOKEN_NOT_INDEXED',
                refreshQueued: false,
                refreshJobId: null,
                contractAddress: '0xabc',
                tokenId: '7',
                chainId: 11155111,
            })
        );

        expect(status).toBe(404);
        expect(body.metadata).toEqual({
            code: 'TOKEN_NOT_INDEXED',
            refreshQueued: false,
            refreshJobId: null,
            contractAddress: '0xabc',
            tokenId: '7',
            chainId: 11155111,
        });
    });

    it('liefert die Validierungsfehler mit, die vorher still verloren gingen', async () => {
        const { body } = await callThrowing(new ValidationError('ungültig', { tokenId: 'fehlt' }));

        expect(body.metadata).toEqual({ validation: { tokenId: 'fehlt' } });
    });
});

describe('Was NICHT als metadata durchgeht', () => {
    it('lässt eine Zeichenkette weg, statt sie als metadata zu senden', async () => {
        const { body } = await callThrowing(new NotFoundError('weg', 'nur ein Text'));

        expect(body).not.toHaveProperty('metadata');
    });

    it('lässt ein Array weg — metadata ist ein Objekt, kein Behälter', async () => {
        const { body } = await callThrowing(new NotFoundError('weg', [1, 2, 3]));

        expect(body).not.toHaveProperty('metadata');
    });

    it('lässt null weg', async () => {
        const { body } = await callThrowing(new NotFoundError('weg', null));

        expect(body).not.toHaveProperty('metadata');
    });
});

describe('Fremde Würfe', () => {
    it('übersetzt einen gewöhnlichen Error zu 500, ohne metadata', async () => {
        const { status, body } = await callThrowing(new Error('unerwartet'));

        expect(status).toBe(500);
        expect(body.code).toBe('INTERNAL_SERVER_ERROR');
        expect(body).not.toHaveProperty('metadata');
    });
});
