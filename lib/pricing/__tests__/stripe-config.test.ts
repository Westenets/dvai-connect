import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getStripePriceId,
    requireStripePriceId,
    getTierByStripePriceId,
    __resetTierByPriceIdCache,
} from '../stripe-config';

const ENV_BACKUP: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
    if (!(key in ENV_BACKUP)) ENV_BACKUP[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
}

function restoreEnv() {
    for (const [k, v] of Object.entries(ENV_BACKUP)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    for (const k of Object.keys(ENV_BACKUP)) delete ENV_BACKUP[k];
}

describe('stripe-config', () => {
    beforeEach(() => {
        __resetTierByPriceIdCache();
    });
    afterEach(() => {
        restoreEnv();
        __resetTierByPriceIdCache();
    });

    describe('getStripePriceId', () => {
        it('returns null for free tier', () => {
            setEnv('STRIPE_PRICE_ID_PRO', 'price_pro');
            expect(getStripePriceId('free')).toBeNull();
        });

        it('returns the env value for a paid tier', () => {
            setEnv('STRIPE_PRICE_ID_PRO', 'price_pro_xyz');
            expect(getStripePriceId('pro')).toBe('price_pro_xyz');
        });

        it('returns null for a paid tier without the env var set', () => {
            setEnv('STRIPE_PRICE_ID_PRO', undefined);
            expect(getStripePriceId('pro')).toBeNull();
        });
    });

    describe('requireStripePriceId', () => {
        it('returns the price id when set', () => {
            setEnv('STRIPE_PRICE_ID_BUSINESS', 'price_business_xyz');
            expect(requireStripePriceId('business')).toBe('price_business_xyz');
        });

        it('throws when the env var is missing', () => {
            setEnv('STRIPE_PRICE_ID_BUSINESS', undefined);
            expect(() => requireStripePriceId('business')).toThrow(/STRIPE_PRICE_ID_BUSINESS/);
        });
    });

    describe('getTierByStripePriceId', () => {
        it('reverses the mapping for all paid tiers', () => {
            setEnv('STRIPE_PRICE_ID_PRO_AFRICA', 'price_africa');
            setEnv('STRIPE_PRICE_ID_PRO', 'price_pro');
            setEnv('STRIPE_PRICE_ID_BUSINESS', 'price_biz');
            setEnv('STRIPE_PRICE_ID_ENTERPRISE', 'price_ent');
            expect(getTierByStripePriceId('price_africa')).toBe('pro_africa');
            expect(getTierByStripePriceId('price_pro')).toBe('pro');
            expect(getTierByStripePriceId('price_biz')).toBe('business');
            expect(getTierByStripePriceId('price_ent')).toBe('enterprise');
        });

        it('returns null for an unknown price id (e.g. price rotated without env update)', () => {
            setEnv('STRIPE_PRICE_ID_PRO', 'price_known');
            expect(getTierByStripePriceId('price_unknown_rotated')).toBeNull();
        });

        it('skips tiers without env configured', () => {
            setEnv('STRIPE_PRICE_ID_PRO', 'price_pro');
            setEnv('STRIPE_PRICE_ID_BUSINESS', undefined);
            expect(getTierByStripePriceId('price_pro')).toBe('pro');
            // A price id matching the *missing* env should not crash; just unknown.
            expect(getTierByStripePriceId('')).toBeNull();
        });

        it('caches after first call; reset via __resetTierByPriceIdCache', () => {
            setEnv('STRIPE_PRICE_ID_PRO', 'price_v1');
            expect(getTierByStripePriceId('price_v1')).toBe('pro');
            // Rotate without resetting — cached old mapping still wins
            setEnv('STRIPE_PRICE_ID_PRO', 'price_v2');
            expect(getTierByStripePriceId('price_v2')).toBeNull();
            expect(getTierByStripePriceId('price_v1')).toBe('pro');
            // After explicit reset, new mapping applies
            __resetTierByPriceIdCache();
            expect(getTierByStripePriceId('price_v2')).toBe('pro');
            expect(getTierByStripePriceId('price_v1')).toBeNull();
        });
    });
});
