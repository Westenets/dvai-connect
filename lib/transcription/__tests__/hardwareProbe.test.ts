import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { probeHardware } from '../hardwareProbe';

const setNavigator = (overrides: Partial<Record<string, unknown>>) => {
    for (const [key, value] of Object.entries(overrides)) {
        Object.defineProperty(globalThis.navigator, key, {
            value,
            configurable: true,
            writable: true,
        });
    }
};

describe('probeHardware', () => {
    let original: Record<string, PropertyDescriptor | undefined>;

    beforeEach(() => {
        original = {
            gpu: Object.getOwnPropertyDescriptor(globalThis.navigator, 'gpu'),
            hardwareConcurrency: Object.getOwnPropertyDescriptor(globalThis.navigator, 'hardwareConcurrency'),
            deviceMemory: Object.getOwnPropertyDescriptor(globalThis.navigator, 'deviceMemory'),
            userAgent: Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent'),
        };
    });

    afterEach(() => {
        for (const [key, desc] of Object.entries(original)) {
            if (desc) Object.defineProperty(globalThis.navigator, key, desc);
        }
    });

    it('recommends whisper-base for desktop with WebGPU + 8 cores + 8GB', () => {
        setNavigator({
            gpu: {} as GPU,
            hardwareConcurrency: 8,
            deviceMemory: 8,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-2');
        expect(result.recommendedModel).toBe('whisper-base');
    });

    it('recommends whisper-tiny for mobile with WebGPU', () => {
        setNavigator({
            gpu: {} as GPU,
            hardwareConcurrency: 6,
            deviceMemory: 4,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-2');
        expect(result.recommendedModel).toBe('whisper-tiny');
    });

    it('returns borderline for desktop without WebGPU but 8+ cores', () => {
        setNavigator({
            gpu: undefined,
            hardwareConcurrency: 8,
            deviceMemory: 8,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        });
        const result = probeHardware();
        expect(result.category).toBe('borderline');
    });

    it('returns definitely-tier-3 for low-spec mobile without WebGPU', () => {
        setNavigator({
            gpu: undefined,
            hardwareConcurrency: 4,
            deviceMemory: 2,
            userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-A105F)',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-3');
    });

    it('defaults to definitely-tier-3 when navigator APIs are missing', () => {
        setNavigator({
            gpu: undefined,
            hardwareConcurrency: undefined,
            deviceMemory: undefined,
            userAgent: 'unknown',
        });
        const result = probeHardware();
        expect(result.category).toBe('definitely-tier-3');
    });
});
