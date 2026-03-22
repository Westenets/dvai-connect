import { db } from '../db';

export function searchWithWorker(queryEmbedding: Float32Array, roomName: string, topK = 3): Promise<any[]> {
    return new Promise(async (resolve, reject) => {
        try {
            const records = await db.transcripts.where("room_name").equals(roomName).toArray();
            const worker = new Worker(new URL('../workers/rag.worker.ts', import.meta.url), { type: 'module' });
            
            worker.onmessage = (e) => {
                worker.terminate();
                if (e.data.error) {
                    reject(new Error(e.data.error));
                } else {
                    resolve(e.data.results);
                }
            };
            
            worker.onerror = (e) => {
                worker.terminate();
                reject(new Error(e.message));
            };
            
            worker.postMessage({ queryEmbedding, records, topK });
        } catch (err) {
            reject(err);
        }
    });
}
