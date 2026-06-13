import { describe, it, expect } from 'vitest';
import { AFRICA_COMMITMENT_MONTHS } from '../commitment';

describe('Africa commitment', () => {
    it('locks AFRICA_COMMITMENT_MONTHS at 24', () => {
        // Lock value is referenced in the cost analysis, spec, and the
        // Customer Portal Africa configuration in stripe-setup-2026-06-13.mjs.
        // If we ever change this, update those callers in lockstep.
        expect(AFRICA_COMMITMENT_MONTHS).toBe(24);
    });
});
