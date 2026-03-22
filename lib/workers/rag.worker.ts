self.onmessage = (e: MessageEvent) => {
    const { queryEmbedding, records, topK } = e.data;
    
    if (!queryEmbedding || !records || !records.length) {
        self.postMessage({ results: [] });
        return;
    }

    try {
        const results = [];
        const qLength = queryEmbedding.length;

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const emb = record.embedding;
            let dotProduct = 0;
            
            // Assume normalized embeddings, so dot product == cosine similarity
            for (let j = 0; j < qLength; j++) {
                dotProduct += queryEmbedding[j] * emb[j];
            }
            
            results.push({
                text: `[${record.speaker}]: ${record.text}`,
                score: dotProduct,
                id: record.id
            });
        }
        
        // Sort descending
        results.sort((a, b) => b.score - a.score);
        
        self.postMessage({ results: results.slice(0, topK || 3) });
    } catch (e: any) {
        console.error('RAG Worker Error', e);
        self.postMessage({ error: e.message });
    }
};
