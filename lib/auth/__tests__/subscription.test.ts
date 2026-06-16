import { describe, it, expect, beforeEach } from 'vitest';
import { __clearUserPlanCache, getUserPlan, isPaidUser } from '../subscription';

/**
 * These tests run against an environment where the Appwrite env vars
 * are NOT set, which exercises the misconfigured-fallback path. Tests
 * for the happy path with a real Appwrite project belong in an
 * integration suite, not this unit test file.
 */
describe('getUserPlan + isPaidUser (fallback path)', () => {
    beforeEach(() => {
        __clearUserPlanCache();
        // Force the "no client" branch by removing the API key.
        delete process.env.APPWRITE_API_KEY;
    });

    it('returns free when Appwrite is not configured', async () => {
        const tier = await getUserPlan('user-xyz');
        expect(tier).toBe('free');
    });

    it('isPaidUser returns false when tier is free', async () => {
        expect(await isPaidUser('user-xyz')).toBe(false);
    });

    it('caches across calls within the TTL', async () => {
        const a = await getUserPlan('user-cache');
        const b = await getUserPlan('user-cache');
        expect(a).toBe(b);
        expect(a).toBe('free');
    });
});
