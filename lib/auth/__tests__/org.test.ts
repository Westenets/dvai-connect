import { describe, it, expect } from 'vitest';
import { generateSignupCode } from '../org';

describe('generateSignupCode', () => {
    it('produces codes starting with the uppercased program name', () => {
        const code = generateSignupCode('sav');
        expect(code.startsWith('SAV-')).toBe(true);
    });

    it('produces unique codes across calls', () => {
        const codes = new Set<string>();
        for (let i = 0; i < 100; i++) {
            codes.add(generateSignupCode('TEST'));
        }
        // With 6 bytes of crypto random (48 bits), 100 codes have an astronomically
        // small collision probability.
        expect(codes.size).toBe(100);
    });

    it('produces URL-safe characters only', () => {
        const code = generateSignupCode('PAIN');
        // Allowed: A-Z, 0-9, hyphen
        expect(code).toMatch(/^[A-Z0-9-]+$/);
    });

    it('handles mixed-case program names by uppercasing', () => {
        const code = generateSignupCode('BaM');
        expect(code.startsWith('BAM-')).toBe(true);
    });
});

/**
 * Note: the database-touching functions (getOrgByCode, getOrgByTeamId,
 * reserveSignupSeat) are intentionally not tested here. They require an
 * actual Appwrite project running and tests would either need
 * Testcontainers or mocking the node-appwrite SDK at a fragile boundary.
 * Coverage for the org happy path comes from:
 *   1. The signup-with-code integration test in PR 3c (against a staging
 *      Appwrite project).
 *   2. Manual QA per the spec §10 acceptance criteria.
 */
