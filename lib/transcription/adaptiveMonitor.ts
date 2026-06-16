/**
 * AdaptiveMonitor — watches the gap between captured audio and
 * transcribed audio during a meeting. If transcription falls behind
 * by `thresholdSec` for `consecutive` consecutive samples, fires
 * onDemote so the strategy selector can swap to a lower-cost tier.
 *
 * Fires at most once per session. If the user manually re-promotes
 * tiers via settings, a new monitor instance is created — the
 * one-shot semantics are intentional to avoid demotion churn.
 */

export interface AdaptiveMonitorOptions {
    /** Lag threshold in seconds. Default 5. */
    thresholdSec?: number;
    /** Number of consecutive laggy samples required to fire. Default 3. */
    consecutive?: number;
    /** How often to evaluate the lag in ms. Default 2000. */
    checkIntervalMs?: number;
    /** Called once when demotion criteria met. */
    onDemote: (info: { lagSec: number; samples: number }) => void;
}

export class AdaptiveMonitor {
    private opts: Required<Omit<AdaptiveMonitorOptions, 'onDemote'>> &
        Pick<AdaptiveMonitorOptions, 'onDemote'>;
    private audioSec = 0;
    private transcribedSec = 0;
    private consecutiveLaggy = 0;
    private fired = false;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(options: AdaptiveMonitorOptions) {
        this.opts = {
            thresholdSec: options.thresholdSec ?? 5,
            consecutive: options.consecutive ?? 3,
            checkIntervalMs: options.checkIntervalMs ?? 2000,
            onDemote: options.onDemote,
        };
    }

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), this.opts.checkIntervalMs);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Adds N seconds of audio captured since last call. */
    recordAudio(seconds: number): void {
        this.audioSec += seconds;
    }

    /** Adds N seconds of audio confirmed transcribed since last call. */
    recordTranscribed(seconds: number): void {
        this.transcribedSec += seconds;
    }

    private tick(): void {
        if (this.fired) return;
        const lag = this.audioSec - this.transcribedSec;
        if (lag >= this.opts.thresholdSec) {
            this.consecutiveLaggy++;
            if (this.consecutiveLaggy >= this.opts.consecutive) {
                this.fired = true;
                this.opts.onDemote({ lagSec: lag, samples: this.consecutiveLaggy });
            }
        } else {
            this.consecutiveLaggy = 0;
        }
    }
}
