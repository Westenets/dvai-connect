import { SimpleVectorStore, VectorStoreQueryMode } from "llamaindex";
import { db } from "../db";

export async function searchWithLlamaIndex(queryEmbedding: Float32Array, roomName: string, topK = 3) {
    const records = await db.transcripts.where("room_name").equals(roomName).toArray();
    
    // Initialize LlamaIndex in-memory simple vector store
    const store = new SimpleVectorStore();
    
    // Map records to pseudo-nodes
    const nodes = records.map(r => ({
        id_: r.id?.toString() || Math.random().toString(),
        text: `[${r.speaker}]: ${r.text}`,
        embedding: Array.from(r.embedding),
        metadata: { speaker: r.speaker }
    } as any));

    // Wait for the synchronous insert
    await store.add(nodes);

    // Query purely based on embedding
    const result = await store.query({
        queryEmbedding: Array.from(queryEmbedding),
        similarityTopK: topK,
        mode: VectorStoreQueryMode.DEFAULT
    });

    return result.nodes?.map((node, i) => ({
        text: (node as any).text || (node as any).getContent?.() || '',
        score: result.similarities?.[i] || 0,
        id: node.id_
    })) || [];
}
