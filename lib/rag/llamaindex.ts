import { SimpleVectorStore, VectorStoreQueryMode, Settings, TextNode } from "llamaindex";
import { db } from "../db";

/**
 * LlamaIndex requires Settings.embedModel to be set, even when we
 * supply pre-computed embeddings. We provide a no-op embedder that
 * satisfies the type contract without doing any actual work.
 *
 * Note: The embedModel getter throws if unset, so we assign unconditionally.
 * Wrapped in try/catch for SSR safety (llamaindex may not fully load on server).
 */
try {
    Settings.embedModel = {
        getTextEmbedding: async () => [],
        getQueryEmbedding: async () => [],
        getTextEmbeddings: async () => [],
        embedBatchSize: 512,
    } as any;
} catch { /* SSR or module load failure — safe to ignore, RAG only runs client-side */ }

export async function searchWithLlamaIndex(queryEmbedding: Float32Array, roomName: string, topK = 5) {
    // Fetch both transcripts and chat messages for the room
    const [transcripts, chatMessages] = await Promise.all([
        db.transcripts.where("room_name").equals(roomName).toArray(),
        db.chat_messages.where("room_name").equals(roomName).toArray(),
    ]);

    // Initialize LlamaIndex in-memory simple vector store
    const store = new SimpleVectorStore();

    // Build a lookup map so we can retrieve nodes by ID after querying
    const nodeMap = new Map<string, TextNode>();

    // Map transcripts to TextNode instances
    const transcriptNodes = transcripts
        .filter(r => r.embedding && r.embedding.length > 0)
        .map(r => {
            const id = `t-${r.id?.toString() || Math.random().toString()}`;
            const node = new TextNode({
                id_: id,
                text: `[${r.speaker}]: ${r.text}`,
                metadata: { speaker: r.speaker, source: 'transcript' },
            });
            node.embedding = Array.from(r.embedding);
            nodeMap.set(id, node);
            return node;
        });

    // Map chat messages to TextNode instances
    const chatNodes = chatMessages
        .filter(m => m.embedding && m.embedding.length > 0 && m.text)
        .map(m => {
            const id = `c-${m.id?.toString() || Math.random().toString()}`;
            const node = new TextNode({
                id_: id,
                text: `[Chat - ${m.sender}]: ${m.text}`,
                metadata: { sender: m.sender, source: 'chat' },
            });
            node.embedding = Array.from(m.embedding);
            nodeMap.set(id, node);
            return node;
        });

    const nodes = [...transcriptNodes, ...chatNodes];

    if (nodes.length === 0) return [];

    await store.add(nodes);

    // Query purely based on embedding
    const result = await store.query({
        queryEmbedding: Array.from(queryEmbedding),
        similarityTopK: topK,
        mode: VectorStoreQueryMode.DEFAULT,
    });

    // SimpleVectorStore returns ids + similarities but not always populated nodes.
    // Map the returned IDs back to our node objects.
    const ids = result.ids || [];
    const similarities = result.similarities || [];

    return ids.map((id, i) => {
        const node = nodeMap.get(id);
        return {
            text: node?.text || '',
            score: similarities[i] || 0,
            id,
        };
    }).filter(r => r.text);
}
