/**
 * Shared status types and a tiny pub/sub primitive used by AI service
 * singletons (LLMService, EmbedderService) to publish lifecycle events
 * (idle → loading → ready / error) into the React tree via MeetAIProvider.
 *
 * Non-React consumers (db.ts, intelligencePipeline.ts) ignore this and
 * keep using the imperative service API. The emitter is purely additive.
 */

export type AIServiceState = 'idle' | 'loading' | 'ready' | 'error' | 'unloaded';

export interface AIServiceProgress {
    text: string;
    /** 0..1 fraction; -1 when indeterminate. */
    progress: number;
    timeElapsed?: number;
}

export interface AIServiceStatus {
    state: AIServiceState;
    progress?: AIServiceProgress;
    error?: Error;
}

export type StatusSubscriber = (status: AIServiceStatus) => void;

/**
 * Minimal, dependency-free observable. Subscribers receive the current
 * status immediately on subscribe(), then every emit() thereafter.
 */
export class StatusEmitter {
    private subs = new Set<StatusSubscriber>();
    private current: AIServiceStatus = { state: 'idle' };

    subscribe(cb: StatusSubscriber): () => void {
        this.subs.add(cb);
        // Replay current state so late subscribers don't see "idle" forever.
        try {
            cb(this.current);
        } catch (err) {
            console.warn('[AIServiceStatus] subscriber threw on initial replay:', err);
        }
        return () => {
            this.subs.delete(cb);
        };
    }

    emit(status: AIServiceStatus): void {
        this.current = status;
        for (const cb of this.subs) {
            try {
                cb(status);
            } catch (err) {
                console.warn('[AIServiceStatus] subscriber threw on emit:', err);
            }
        }
    }

    /** Snapshot accessor for non-reactive consumers. */
    get(): AIServiceStatus {
        return this.current;
    }
}
