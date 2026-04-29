import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../hardwareProbe', () => ({
    probeHardware: vi.fn(),
}));
vi.mock('../benchmark', () => ({
    runCapabilityBenchmark: vi.fn(),
}));
vi.mock('@/lib/auth/subscription', () => ({
    isPaidUser: vi.fn(),
}));

import { selectStrategy, _resetStrategyCache } from '../strategy';
import { probeHardware } from '../hardwareProbe';
import { runCapabilityBenchmark } from '../benchmark';
import { isPaidUser } from '@/lib/auth/subscription';

describe('selectStrategy', () => {
    beforeEach(() => {
        _resetStrategyCache();
        vi.clearAllMocks();
        if (typeof localStorage !== 'undefined') localStorage.clear();
    });

    it('returns Tier 2 with whisper-base when probe says definitely-tier-2 (no benchmark)', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: 'webgpu desktop',
            fingerprint: 'a',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('local-whisper');
        expect(result.model).toBe('whisper-base');
        expect(result.source).toBe('static-probe');
        expect(runCapabilityBenchmark).not.toHaveBeenCalled();
    });

    it('returns Tier 3 directly when probe says definitely-tier-3 (no benchmark download)', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-3',
            reasoning: 'low spec',
            fingerprint: 'b',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('web-speech');
        expect(result.source).toBe('static-probe');
        expect(runCapabilityBenchmark).not.toHaveBeenCalled();
    });

    it('runs benchmark when probe is borderline', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'borderline',
            recommendedModel: 'whisper-tiny',
            reasoning: 'cpu only desktop',
            fingerprint: 'c',
        });
        (isPaidUser as any).mockReturnValue(false);
        (runCapabilityBenchmark as any).mockResolvedValue({
            realtimeFactor: 2.0,
            recommendedTier: 'local-whisper',
            recommendedModel: 'whisper-tiny',
            inferenceMs: 2500,
            audioLengthMs: 5000,
        });
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('local-whisper');
        expect(result.source).toBe('benchmark');
    });

    it('falls back to Tier 3 when benchmark fails the realtime test', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'borderline',
            recommendedModel: 'whisper-tiny',
            reasoning: '',
            fingerprint: 'd',
        });
        (isPaidUser as any).mockReturnValue(false);
        (runCapabilityBenchmark as any).mockResolvedValue({
            realtimeFactor: 0.5,
            recommendedTier: 'web-speech',
            inferenceMs: 10000,
            audioLengthMs: 5000,
        });
        const result = await selectStrategy({ pref: 'auto' });
        expect(result.tier).toBe('web-speech');
    });

    it('refuses Tier 1 (cloud) when isPaidUser is false', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'e',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'cloud' });
        expect(result.tier).toBe('local-whisper');
        expect(result.reasoning).toMatch(/paid/i);
    });

    it('honors Tier 1 (cloud) when isPaidUser is true', async () => {
        (isPaidUser as any).mockReturnValue(true);
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'f',
        });
        const result = await selectStrategy({ pref: 'cloud' });
        expect(result.tier).toBe('cloud');
        expect(result.source).toBe('paid-cloud-pref');
    });

    it('honors user override "basic" → Tier 3 regardless of hardware', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'g',
        });
        (isPaidUser as any).mockReturnValue(false);
        const result = await selectStrategy({ pref: 'basic' });
        expect(result.tier).toBe('web-speech');
        expect(result.source).toBe('user-override');
    });

    it('caches result in localStorage and reuses on next call', async () => {
        (probeHardware as any).mockReturnValue({
            category: 'definitely-tier-2',
            recommendedModel: 'whisper-base',
            reasoning: '',
            fingerprint: 'h',
        });
        (isPaidUser as any).mockReturnValue(false);
        await selectStrategy({ pref: 'auto' });
        const second = await selectStrategy({ pref: 'auto' });
        expect(second.source).toBe('cache');
    });
});
