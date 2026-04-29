import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdaptiveMonitor } from '../adaptiveMonitor';

describe('AdaptiveMonitor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('does not fire demotion when buffer stays under threshold', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote });
        m.start();
        m.recordAudio(4);
        m.recordTranscribed(4);
        vi.advanceTimersByTime(3000);
        expect(onDemote).not.toHaveBeenCalled();
        m.stop();
    });

    it('fires demotion after 3 consecutive lag samples above threshold', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote, checkIntervalMs: 1000 });
        m.start();
        for (let i = 0; i < 3; i++) {
            m.recordAudio(10);
            m.recordTranscribed(1);
            vi.advanceTimersByTime(1000);
        }
        expect(onDemote).toHaveBeenCalledTimes(1);
        m.stop();
    });

    it('resets counter when a sample comes back under threshold', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote, checkIntervalMs: 1000 });
        m.start();
        // Two laggy samples (cumulative: audio=10/transcribed=1 lag=9; then audio=20/transcribed=2 lag=18)
        m.recordAudio(10); m.recordTranscribed(1);
        vi.advanceTimersByTime(1000);
        m.recordAudio(10); m.recordTranscribed(1);
        vi.advanceTimersByTime(1000);
        // Recovery: transcribe enough to close the gap (transcribed: 2 + 25 = 27, audio = 20 → lag = -7)
        m.recordTranscribed(25);
        vi.advanceTimersByTime(1000);
        // Two more laggy samples after recovery — should NOT fire because counter reset.
        // After tick: audio=30 transcribed=28 → lag=2 (under threshold)... need bigger lag.
        m.recordAudio(20); m.recordTranscribed(1);
        vi.advanceTimersByTime(1000);
        // audio=50, transcribed=29 → lag=21 (consecutiveLaggy=1)
        m.recordAudio(20); m.recordTranscribed(1);
        vi.advanceTimersByTime(1000);
        // audio=70, transcribed=30 → lag=40 (consecutiveLaggy=2)
        expect(onDemote).not.toHaveBeenCalled();
        m.stop();
    });

    it('only fires once per session even if lag persists', () => {
        const onDemote = vi.fn();
        const m = new AdaptiveMonitor({ thresholdSec: 5, consecutive: 3, onDemote, checkIntervalMs: 1000 });
        m.start();
        for (let i = 0; i < 10; i++) {
            m.recordAudio(10);
            m.recordTranscribed(1);
            vi.advanceTimersByTime(1000);
        }
        expect(onDemote).toHaveBeenCalledTimes(1);
        m.stop();
    });
});
