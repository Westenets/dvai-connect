import { describe, it, expect } from 'vitest';
import { isPaidUser } from '../subscription';

describe('isPaidUser', () => {
    it('returns false in v1 (no payment system yet)', () => {
        expect(isPaidUser()).toBe(false);
    });
});
