/**
 * Returns true if the current user has a paid subscription that grants
 * access to cloud features (Tier 1 STT, re-transcription).
 *
 * This is a v1 stub that returns false unconditionally. Problem #5
 * (Stripe + Appwrite subscription system) will replace this with a
 * real check against Appwrite subscription state. Single chokepoint by
 * design — swap is one file.
 */
export function isPaidUser(): boolean {
    return false;
}
