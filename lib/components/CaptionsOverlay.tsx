import React from 'react';
import { useReceiveCaptions } from '../hooks/useReceiveCaptions';
import { CaptionLine } from './CaptionLine';
import { useAuth } from '@/components/AuthProvider';

export const CaptionsOverlay = () => {
    const captions = useReceiveCaptions();
    const { user } = useAuth();

    // Keep only the latest 3 active transcriptions
    const latestCaptions = captions.slice(-3);

    const prefs = user?.prefs as Record<string, any>;
    const captionSizeIdx = prefs?.captionSize ?? 1;
    const textSizeClass = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'][captionSizeIdx];

    if (latestCaptions.length === 0) return null;

    return (
        <div className="absolute bottom-[60px] md:bottom-[100px] left-0 right-0 flex justify-center pointer-events-none mb-2 z-10 transition-all duration-300">
            <div className="bg-black/70 backdrop-blur-md rounded-lg p-4 max-w-2xl w-full flex flex-col justify-end overflow-hidden pointer-events-auto shadow-lg border border-white/5 min-h-[84px] sm:min-h-[96px] max-h-[30vh]">
                {latestCaptions.map((caption) => (
                    <CaptionLine
                        key={caption.utteranceId}
                        speakerName={caption.speakerName}
                        text={caption.text}
                        isFinal={caption.isFinal}
                        textSizeClass={textSizeClass}
                    />
                ))}
            </div>
        </div>
    );
};
