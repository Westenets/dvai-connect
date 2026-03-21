import { useState, useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent, RemoteParticipant, LocalParticipant } from 'livekit-client';

export interface CaptionLineData {
    utteranceId: string;
    text: string;
    isFinal: boolean;
    speakerName: string;
    timestamp: number;
}

export function useReceiveCaptions() {
    const [captions, setCaptions] = useState<CaptionLineData[]>([]);
    const room = useRoomContext();

    useEffect(() => {
        if (!room) return;

        const handleDataReceived = (payload: Uint8Array, participant?: RemoteParticipant | LocalParticipant, kind?: any, topic?: string) => {
            if (topic !== 'transcription') return;

            try {
                const decoder = new TextDecoder();
                const data = JSON.parse(decoder.decode(payload));
                
                if (data.utteranceId && data.text !== undefined) {
                    const speakerName = participant?.name || participant?.identity || 'Unknown';
                    console.log(`[RECEIVE] from ${speakerName}: id: ${data.utteranceId}, isFinal: ${data.isFinal}, text: "${data.text}"`);
                    
                    setCaptions(prev => {
                        const newCaptions = [...prev];
                        const existingIndex = newCaptions.findIndex(c => c.utteranceId === data.utteranceId);
                        
                        if (existingIndex >= 0) {
                            newCaptions[existingIndex] = {
                                ...newCaptions[existingIndex],
                                text: data.text,
                                // Prevent downgrading to isFinal=false if already true (shouldn't happen, but just in case)
                                isFinal: newCaptions[existingIndex].isFinal || data.isFinal,
                                timestamp: Date.now()
                            };
                        } else {
                            newCaptions.push({
                                utteranceId: data.utteranceId,
                                text: data.text,
                                isFinal: data.isFinal,
                                speakerName,
                                timestamp: Date.now()
                            });
                        }
                        
                        return newCaptions.slice(-10); // maintain max 10 to avoid memory leak
                    });
                }
            } catch (e) {
                console.error('Failed to parse transcription data payload', e);
            }
        };

        room.on(RoomEvent.DataReceived, handleDataReceived);
        return () => {
            room.off(RoomEvent.DataReceived, handleDataReceived);
        };
    }, [room]);

    return captions;
}
