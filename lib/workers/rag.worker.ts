self.onmessage = (e: MessageEvent) => {
    const { queryEmbedding, records, topK } = e.data;

    if (!queryEmbedding || !records || !records.length) {
        self.postMessage({ results: [] });
        return;
    }

    try {
        const results = [];
        const qLen = queryEmbedding.length;

        // Pre-compute query norm
        let qNorm = 0;
        for (let j = 0; j < qLen; j++) qNorm += queryEmbedding[j] * queryEmbedding[j];
        qNorm = Math.sqrt(qNorm);

        if (qNorm === 0) {
            self.postMessage({ results: [] });
            return;
        }

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const emb = record.embedding;
            if (!emb || emb.length !== qLen) continue; // skip dimension mismatches

            let dot = 0, eNorm = 0;
            for (let j = 0; j < qLen; j++) {
                dot += queryEmbedding[j] * emb[j];
                eNorm += emb[j] * emb[j];
            }
            eNorm = Math.sqrt(eNorm);

            // Cosine similarity: dot(a,b) / (||a|| * ||b||)
            const score = eNorm > 0 ? dot / (qNorm * eNorm) : 0;

            results.push({
                text: `[${record.speaker}]: ${record.text}`,
                score,
                id: record.id
            });
        }

        // Sort descending by cosine similarity
        results.sort((a, b) => b.score - a.score);

        self.postMessage({ results: results.slice(0, topK || 3) });
    } catch (e: any) {
        console.error('RAG Worker Error', e);
        self.postMessage({ error: e.message });
    }
};
