import { useState, useCallback } from 'react';
import { HumanMessage } from '@langchain/core/messages';
import { useEmbedder, useGemma } from '@/lib/providers/MeetAIProvider';

export function useMeetingRAG(roomName: string | undefined) {
    const { service: embedder } = useEmbedder();
    const { service: gemma, status: gemmaStatus } = useGemma();

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [answer, setAnswer] = useState('');
    const [retrievedContext, setRetrievedContext] = useState<any[]>([]);

    const askQuestion = useCallback(async (query: string, topK = 5) => {
        if (!roomName || !query.trim()) return;

        setIsLoading(true);
        setAnswer('');
        setRetrievedContext([]);

        try {
            // 1. Embed query — embedder lazy-inits the worker on first call.
            setLoadingMessage('Embedding query...');
            const queryEmbedding = await embedder.embed(query);

            // 2. Retrieve via LlamaIndex
            setLoadingMessage('Searching transcripts...');
            const { searchWithLlamaIndex } = await import('../rag/llamaindex');
            const results = await searchWithLlamaIndex(queryEmbedding, roomName, topK);
            setRetrievedContext(results);

            if (results.length === 0) {
                setAnswer('No relevant transcript context found for this question.');
                return;
            }

            // 3. Generate answer via LLM. The gemmaStatus from the provider
            // will show real-time download/load progress while initialize()
            // runs — UI components can render a progress bar from it.
            setLoadingMessage('Generating answer...');
            await gemma.initialize();
            const model = gemma.getModel();

            const context = results.map(r => r.text).join('\n');
            const prompt = `Based on the following meeting transcript excerpts, answer the user's question. If the answer is not in the context, say so.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;
            const res = await model.invoke([new HumanMessage(prompt)]);
            setAnswer((res.content as string).trim());
        } catch (e: any) {
            console.error('[RAG] Error:', e);
            setAnswer(`Error: ${e.message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [roomName, embedder, gemma]);

    const reset = useCallback(() => {
        setAnswer('');
        setRetrievedContext([]);
        setLoadingMessage('');
    }, []);

    return {
        isLoading,
        loadingMessage,
        answer,
        retrievedContext,
        // Expose Gemma load status so the UI can show a progress bar during
        // the first model download (~1.5GB). Embedder is small enough that
        // the spinner from `isLoading` covers it.
        gemmaStatus,
        askQuestion,
        reset,
    };
}
