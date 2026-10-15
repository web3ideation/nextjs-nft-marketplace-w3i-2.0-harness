/**
 * Datei: src/lib/nft-data-platform/rate-limit.test.ts
 *
 * Zweck: Belegt den Nebenläufigkeitsdeckel direkt, nicht über den Client.
 *
 * Wichtig:
 * - Der erste Block ist der Grund, warum diese Datei existiert. Der
 *   Deckel-Test in `client.test.ts` trennt jede Freigabe durch ein
 *   `setTimeout(0)`, also durch einen Makrotask — und genau diese Trennung
 *   verdeckt den Fehler, den der Code-Review gefunden hat: die erste Fassung
 *   zählte bei der Freigabe herunter und weckte dann, sodass zwischen
 *   Herunterzählen und dem Hochzählen des Geweckten ein Microtask lag, in dem
 *   `active` zu niedrig war. Wer in dieses Fenster fiel, überschritt den Deckel.
 *   Hier wird im **selben** Microtask nachgefragt.
 * - Zweiter Punkt: der alte Test prüfte `peak <= 2`. Damit wäre auch eine
 *   Implementierung grün, die fälschlich auf eins serialisiert. Hier steht
 *   `toBe`, nicht `toBeLessThanOrEqual`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    acquireSlot,
    getRateLimitSnapshot,
    markWindowExhausted,
    recordRequestSent,
    resetRateLimitState,
} from '@/lib/nft-data-platform/rate-limit';

beforeEach(() => {
    resetRateLimitState();
});

afterEach(() => {
    resetRateLimitState();
});

describe('acquireSlot — Platzübergabe statt Freigabe (Review-Befund 1)', () => {
    it('überschreitet den Deckel nicht, wenn im selben Microtask nach der Freigabe nachgefragt wird', async () => {
        const releaseA = await acquireSlot('read', 1);
        expect(getRateLimitSnapshot('read').active).toBe(1);

        // Warter anmelden, ohne auf ihn zu warten.
        let bHeld = false;
        const pendingB = acquireSlot('read', 1).then((release) => {
            bHeld = true;
            return release;
        });

        expect(getRateLimitSnapshot('read').queued).toBe(1);

        // Freigeben und SOFORT nachfragen — kein await, kein Timer dazwischen.
        releaseA();
        const pendingC = acquireSlot('read', 1);

        // Der Platz gehoert jetzt B. C muss warten, nicht einruecken.
        expect(getRateLimitSnapshot('read').active).toBe(1);

        const releaseB = await pendingB;
        expect(bHeld).toBe(true);
        expect(getRateLimitSnapshot('read').active).toBe(1);

        releaseB();
        const releaseC = await pendingC;
        expect(getRateLimitSnapshot('read').active).toBe(1);

        releaseC();
        expect(getRateLimitSnapshot('read').active).toBe(0);
        expect(getRateLimitSnapshot('read').queued).toBe(0);
    });

    it('nutzt den Deckel voll aus, statt zu serialisieren', async () => {
        const a = await acquireSlot('read', 3);
        const b = await acquireSlot('read', 3);
        const c = await acquireSlot('read', 3);

        expect(getRateLimitSnapshot('read').active).toBe(3);

        a();
        b();
        c();

        expect(getRateLimitSnapshot('read').active).toBe(0);
    });

    it('gibt bei doppeltem Aufruf nur einen Platz frei', async () => {
        const release = await acquireSlot('read', 2);
        await acquireSlot('read', 2);

        release();
        release();
        release();

        expect(getRateLimitSnapshot('read').active).toBe(1);
    });

    it('trennt read und ops', async () => {
        await acquireSlot('read', 1);
        await acquireSlot('ops', 1);

        expect(getRateLimitSnapshot('read').active).toBe(1);
        expect(getRateLimitSnapshot('ops').active).toBe(1);
    });

    it('behält die zuerst gesetzte Kapazität und meldet eine Abweichung', async () => {
        const a = await acquireSlot('read', 1);

        // Zweiter Aufruf mit anderer Kapazität darf den Deckel nicht aufweichen.
        let bHeld = false;
        void acquireSlot('read', 5).then(() => {
            bHeld = true;
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(bHeld).toBe(false);
        expect(getRateLimitSnapshot('read').active).toBe(1);

        a();
    });
});

describe('resetRateLimitState — weckt Warter (Review-Befund 12)', () => {
    it('lässt keinen Warter hängen, der sonst den nächsten Testfall blockiert', async () => {
        await acquireSlot('read', 1);

        let geweckt = false;
        void acquireSlot('read', 1).then(() => {
            geweckt = true;
        });

        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(geweckt).toBe(false);

        resetRateLimitState();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        // Ohne das Wecken hielte der Warter per Closure das alte Zustandsobjekt
        // und würde nie erfüllt — ein Testfall, der einen Warter hinterlässt,
        // ließe den nächsten hängen statt rot werden.
        expect(geweckt).toBe(true);
    });
});

describe('Fensterzählung und Sperre', () => {
    const now = 1_750_000_000_000;

    it('zählt im Fenster und beginnt an der Grenze neu', () => {
        expect(recordRequestSent('read', now)).toBe(1);
        expect(recordRequestSent('read', now + 1_000)).toBe(2);
        expect(recordRequestSent('read', now + 60_000)).toBe(1);
    });

    it('sperrt bis zur nächsten Fenstergrenze, weil die Antwort keine Wartezeit nennt', () => {
        const blockedUntil = markWindowExhausted('read', now);

        expect(blockedUntil).toBeGreaterThan(now);
        expect(blockedUntil - now).toBeLessThanOrEqual(60_250);
        expect(getRateLimitSnapshot('read').remaining).toBe(0);
    });
});
