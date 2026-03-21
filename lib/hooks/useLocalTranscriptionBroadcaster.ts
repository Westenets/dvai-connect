import { useEffect, useRef } from 'react';
import { useRoomContext, useLocalParticipant, useRemoteParticipants } from '@livekit/components-react';

export function useLocalTranscriptionBroadcaster() {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();
    
    const isCcNeeded = remoteParticipants.some((p: any) => p.attributes?.ccEnabled === 'true');
    const isMicEnabled = localParticipant.isMicrophoneEnabled;
    const shouldRunBroadcaster = isCcNeeded && isMicEnabled;

    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        let isCleanedUp = false;

        if (!shouldRunBroadcaster) {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) {
                    console.error('Error stopping speech recognition', e);
                }
                recognitionRef.current = null;
            }
            return;
        }
        
        if (recognitionRef.current) return;

        const SpeechRecognitionComp = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionComp) {
            console.warn('Browser does not support SpeechRecognition');
            return;
        }

        const recognition = new SpeechRecognitionComp();
        recognition.continuous = false;
        recognition.interimResults = true;

        let sessionId = Math.random().toString(36).substring(2, 9);

        recognition.onresult = (event: any) => {
            if (isCleanedUp) return;
            const encoder = new TextEncoder();
            
            let fullTranscript = '';
            let anyFinal = false;
            
            for (let i = 0; i < event.results.length; ++i) {
                fullTranscript += event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    anyFinal = true;
                }
            }
            
            const utteranceId = `${localParticipant.identity}-${sessionId}`;
            
            const payload = {
                utteranceId,
                text: fullTranscript,
                isFinal: anyFinal
            };
            
            const data = encoder.encode(JSON.stringify(payload));
            room.localParticipant.publishData(data, { topic: 'transcription' });
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
        };

        recognition.onend = () => {
            if (!isCleanedUp) {
                try {
                    sessionId = Math.random().toString(36).substring(2, 9);
                    recognition.start();
                } catch (e) {
                    console.error('Failed to restart recognition', e);
                }
            }
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch (e) {
            console.error('Failed to start speech recognition', e);
        }

        return () => {
            isCleanedUp = true;
            if (recognitionRef.current === recognition) {
                try {
                    recognition.stop();
                } catch (e) {
                    console.error('Error stopping speech recognition on cleanup', e);
                }
                recognitionRef.current = null;
            }
        };
    }, [shouldRunBroadcaster, localParticipant.identity, room.localParticipant]);
}
