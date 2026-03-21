import React, { useEffect, useState } from 'react';

interface CaptionLineProps {
    speakerName: string;
    text: string;
    isFinal: boolean;
    textSizeClass?: string;
}

export const CaptionLine = React.memo(({ speakerName, text, isFinal, textSizeClass = 'text-sm' }: CaptionLineProps) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Trigger purely for entrance animation
        const frame = requestAnimationFrame(() => {
            setMounted(true);
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <div 
            className={`transition-all duration-300 ease-out transform
                ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
                ${isFinal ? 'opacity-100' : 'opacity-70'}
                text-white ${textSizeClass} mb-1 last:mb-0
            `}
        >
            <span className="font-semibold text-emerald-400 mr-2 drop-shadow-sm">
                {speakerName}:
            </span>
            <span className="drop-shadow-sm leading-relaxed">{text}</span>
        </div>
    );
});
