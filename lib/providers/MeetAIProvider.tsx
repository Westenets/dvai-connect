"use client";

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { embedderService } from "../embedder";
import { llmService } from "../llmService";
import type { AIServiceStatus } from "../aiServiceStatus";

/**
 * MeetAIProvider — reactive view onto the two on-device AI service singletons.
 *
 * Architecture:
 *   - The actual AI work (model loading, inference) lives in the
 *     `embedderService` and `llmService` module-level singletons.
 *   - Non-React consumers (lib/db.ts, lib/intelligencePipeline.ts) keep using
 *     those singletons imperatively — no behavior change.
 *   - This provider subscribes to each service's StatusEmitter and mirrors
 *     `{ state, progress, error }` into React state so any component can
 *     render loading bars, error toasts, or "ready" badges without polling.
 *
 * The provider is dumb glue: it owns no model state, just the latest snapshot
 * of each service's status. Killing the provider has no effect on running
 * inference.
 */

export interface ServiceContext {
    /** The underlying service singleton — lets you call .embed/.initialize/.unload imperatively. */
    service: typeof embedderService;
    /** Reactive lifecycle status (idle / loading / ready / error / unloaded). */
    status: AIServiceStatus;
}

export interface GemmaContext {
    service: typeof llmService;
    status: AIServiceStatus;
}

export interface MeetAIContextValue {
    embedder: ServiceContext;
    gemma: GemmaContext;
}

const MeetAIContext = createContext<MeetAIContextValue | null>(null);

export interface MeetAIProviderProps {
    children: ReactNode;
}

export function MeetAIProvider({ children }: MeetAIProviderProps) {
    const [embedderStatus, setEmbedderStatus] = useState<AIServiceStatus>(
        () => embedderService.getStatus(),
    );
    const [gemmaStatus, setGemmaStatus] = useState<AIServiceStatus>(
        () => llmService.getStatus(),
    );

    useEffect(() => {
        const unsubEmbedder = embedderService.status.subscribe(setEmbedderStatus);
        const unsubGemma = llmService.status.subscribe(setGemmaStatus);
        return () => {
            unsubEmbedder();
            unsubGemma();
        };
    }, []);

    const value = useMemo<MeetAIContextValue>(
        () => ({
            embedder: { service: embedderService, status: embedderStatus },
            gemma: { service: llmService, status: gemmaStatus },
        }),
        [embedderStatus, gemmaStatus],
    );

    return <MeetAIContext.Provider value={value}>{children}</MeetAIContext.Provider>;
}

export function useMeetAI(): MeetAIContextValue {
    const ctx = useContext(MeetAIContext);
    if (!ctx) {
        throw new Error("useMeetAI must be used within a <MeetAIProvider>.");
    }
    return ctx;
}

/** Sugar — equivalent to `useMeetAI().embedder`. */
export function useEmbedder(): ServiceContext {
    return useMeetAI().embedder;
}

/** Sugar — equivalent to `useMeetAI().gemma`. */
export function useGemma(): GemmaContext {
    return useMeetAI().gemma;
}
