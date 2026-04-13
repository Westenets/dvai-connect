import { useState, useCallback } from 'react';
import { HumanMessage } from '@langchain/core/messages';

export function useMeetingRAG(roomName: string | undefined) {
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
            // 1. Embed query
            setLoadingMessage('Embedding query...');
            const { embedderService } = await import('../embedder');
            const queryEmbedding = await embedderService.embed(query);

            // 2. Retrieve via LlamaIndex
            setLoadingMessage('Searching transcripts...');
            const { searchWithLlamaIndex } = await import('../rag/llamaindex');
            const results = await searchWithLlamaIndex(queryEmbedding, roomName, topK);
            setRetrievedContext(results);

            if (results.length === 0) {
                setAnswer('No relevant transcript context found for this question.');
                return;
            }

            // 3. Generate answer via LLM
            setLoadingMessage('Generating answer...');
            const { llmService } = await import('../llmService');
            await llmService.initialize();
            const model = llmService.getModel();

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
    }, [roomName]);

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
        askQuestion,
        reset,
    };
}
