import { useState, useCallback } from 'react';
import { embedderService } from '../embedder';
import { searchWithLlamaIndex } from '../rag/llamaindex';
import { searchWithWorker } from '../rag/worker';

export type RAGMode = 'llamaindex' | 'worker';

export function useMeetingRAG(roomName: string | undefined, defaultMode: RAGMode = 'worker') {
    const [mode, setMode] = useState<RAGMode>(defaultMode);
    const [isLoading, setIsLoading] = useState(false);
    const [retrievedContext, setRetrievedContext] = useState<any[]>([]);
    
    const askQuestion = useCallback(async (userQuery: string, topK = 3) => {
        if (!roomName || !userQuery.trim()) return;
        
        setIsLoading(true);
        try {
            // 1. Generate query embedding
            const t0Embed = performance.now();
            const queryEmbedding = await embedderService.embed(userQuery);
            const t1Embed = performance.now();
            console.log(`[RAG Benchmarking] Embedding generation took ${(t1Embed - t0Embed).toFixed(2)}ms`);

            // 2. Perform Retrieval based on mode
            const t0Search = performance.now();
            let results: any[] = [];
            
            if (mode === 'llamaindex') {
                results = await searchWithLlamaIndex(queryEmbedding, roomName, topK);
            } else {
                results = await searchWithWorker(queryEmbedding, roomName, topK);
            }
            
            const t1Search = performance.now();
            console.log(`[RAG Benchmarking] ${mode.toUpperCase()} search & retrieval took ${(t1Search - t0Search).toFixed(2)}ms for ${results.length} results`);
            
            setRetrievedContext(results);
            return results;
            
            // Note: For a full RAG system, the next step would be passing this context + query to the LLM.
        } catch (e) {
            console.error('[RAG Benchmarking] Error retrieving context', e);
        } finally {
            setIsLoading(false);
        }
    }, [roomName, mode]);

    const toggleMode = () => {
        setMode(prev => prev === 'llamaindex' ? 'worker' : 'llamaindex');
    };

    return {
        mode,
        setMode,
        toggleMode,
        isLoading,
        askQuestion,
        retrievedContext
    };
}
