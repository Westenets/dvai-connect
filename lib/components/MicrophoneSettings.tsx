import React from 'react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { TrackToggle } from '@livekit/components-react';
import { MediaDeviceMenu } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { isLowPowerDevice } from '@/lib/client-utils';

export function MicrophoneSettings() {
    const { isNoiseFilterEnabled, setNoiseFilterEnabled, isNoiseFilterPending } =
        useKrispNoiseFilter({
            filterOptions: {
                bufferOverflowMs: 100,
                bufferDropMs: 200,
                quality: isLowPowerDevice() ? 'low' : 'medium',
                onBufferDrop: () => {
                    console.warn(
                        'krisp buffer dropped, noise filter versions >= 0.3.2 will automatically disable the filter',
                    );
                },
            },
        });

    React.useEffect(() => {
        // enable Krisp by default on non-low power devices
        setNoiseFilterEnabled(!isLowPowerDevice());
    }, [setNoiseFilterEnabled]);
    return (
        <div className="flex flex-col md:flex-row gap-2.5 items-start justify-between">
            <section className="lk-button-group">
                <TrackToggle source={Track.Source.Microphone}>Microphone</TrackToggle>
                <div className="lk-button-group-menu">
                    <MediaDeviceMenu kind="audioinput" />
                </div>
            </section>

            <button
                className="lk-button"
                onClick={() => setNoiseFilterEnabled(!isNoiseFilterEnabled)}
                disabled={isNoiseFilterPending}
                aria-pressed={isNoiseFilterEnabled}
            >
                {isNoiseFilterEnabled ? 'Disable' : 'Enable'} Enhanced Noise Cancellation
            </button>
        </div>
    );
}
