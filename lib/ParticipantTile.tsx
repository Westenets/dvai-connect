import * as React from 'react';
import type { Participant } from 'livekit-client';
import { Track } from 'livekit-client';
import type { ParticipantClickEvent, TrackReferenceOrPlaceholder } from '@livekit/components-core';
import { isTrackReference, isTrackReferencePinned } from '@livekit/components-core';
import { ConnectionQualityIndicator } from '@livekit/components-react';
import { ParticipantName } from '@livekit/components-react';
import { TrackMutedIndicator } from '@livekit/components-react';
import {
    ParticipantContext,
    TrackRefContext,
    useEnsureTrackRef,
    useFeatureContext,
    useMaybeLayoutContext,
    useMaybeParticipantContext,
    useMaybeTrackRefContext,
} from '@livekit/components-react';
import { FocusToggle } from '@livekit/components-react';
import { ParticipantPlaceholder } from '@livekit/components-react';
import { LockLockedIcon, ScreenShareIcon } from '@livekit/components-react';
import { VideoTrack } from '@livekit/components-react';
import { AudioTrack } from '@livekit/components-react';
import { useParticipantTile } from '@livekit/components-react';
import { useIsEncrypted } from '@livekit/components-react';
import { useParticipantAttribute } from '@livekit/components-react';
import { usePalette } from 'react-palette';

/**
 * The `ParticipantContextIfNeeded` component only creates a `ParticipantContext`
 * if there is no `ParticipantContext` already.
 * @example
 * ```tsx
 * <ParticipantContextIfNeeded participant={trackReference.participant}>
 *  ...
 * </ParticipantContextIfNeeded>
 * ```
 * @public
 */
export function ParticipantContextIfNeeded(
    props: React.PropsWithChildren<{
        participant?: Participant;
    }>,
) {
    const hasContext = !!useMaybeParticipantContext();
    return props.participant && !hasContext ? (
        <ParticipantContext.Provider value={props.participant}>
            {props.children}
        </ParticipantContext.Provider>
    ) : (
        <>{props.children}</>
    );
}

/**
 * Only create a `TrackRefContext` if there is no `TrackRefContext` already.
 * @internal
 */
export function TrackRefContextIfNeeded(
    props: React.PropsWithChildren<{
        trackRef?: TrackReferenceOrPlaceholder;
    }>,
) {
    const hasContext = !!useMaybeTrackRefContext();
    return props.trackRef && !hasContext ? (
        <TrackRefContext.Provider value={props.trackRef}>{props.children}</TrackRefContext.Provider>
    ) : (
        <>{props.children}</>
    );
}

/** @public */
export interface ParticipantTileProps extends React.HTMLAttributes<HTMLDivElement> {
    /** The track reference to display. */
    trackRef?: TrackReferenceOrPlaceholder;
    disableSpeakingIndicator?: boolean;
    onParticipantClick?: (event: ParticipantClickEvent) => void;
}

/**
 * The `ParticipantTile` component is the base utility wrapper for displaying a visual representation of a participant.
 * This component can be used as a child of the `TrackLoop` component or by passing a track reference as property.
 *
 * @example Using the `ParticipantTile` component with a track reference:
 * ```tsx
 * <ParticipantTile trackRef={trackRef} />
 * ```
 * @example Using the `ParticipantTile` component as a child of the `TrackLoop` component:
 * ```tsx
 * <TrackLoop>
 *  <ParticipantTile />
 * </TrackLoop>
 * ```
 * @public
 */
export const ParticipantTile: (
    props: ParticipantTileProps & React.RefAttributes<HTMLDivElement>,
) => React.ReactNode = /* @__PURE__ */ React.forwardRef<HTMLDivElement, ParticipantTileProps>(
    function ParticipantTile(
        {
            trackRef,
            children,
            onParticipantClick,
            disableSpeakingIndicator,
            ...htmlProps
        }: ParticipantTileProps,
        ref,
    ) {
        const trackReference = useEnsureTrackRef(trackRef);

        const { elementProps } = useParticipantTile<HTMLDivElement>({
            htmlProps,
            disableSpeakingIndicator,
            onParticipantClick,
            trackRef: trackReference,
        });
        const isEncrypted = useIsEncrypted(trackReference.participant);
        const layoutContext = useMaybeLayoutContext();

        const autoManageSubscription = useFeatureContext()?.autoSubscription;
        const handRaised = useParticipantAttribute('handRaised', {
            participant: trackReference.participant,
        });
        const emoji = useParticipantAttribute('emoji', {
            participant: trackReference.participant,
        });

        const handleSubscribe = React.useCallback(
            (subscribed: boolean) => {
                if (
                    trackReference.source &&
                    !subscribed &&
                    layoutContext &&
                    layoutContext.pin.dispatch &&
                    isTrackReferencePinned(trackReference, layoutContext.pin.state)
                ) {
                    layoutContext.pin.dispatch({ msg: 'clear_pin' });
                }
            },
            [trackReference, layoutContext],
        );

        const metadataStr = trackReference.participant.metadata;
        const metadata = React.useMemo(() => {
            if (!metadataStr) return null;
            try {
                return JSON.parse(metadataStr);
            } catch (e) {
                return null;
            }
        }, [metadataStr]);

        const { data, loading, error } = usePalette(metadata?.avatarUrl || null);

        return (
            <div ref={ref} style={{ position: 'relative' }} {...elementProps}>
                <TrackRefContextIfNeeded trackRef={trackReference}>
                    <ParticipantContextIfNeeded participant={trackReference.participant}>
                        {emoji && (
                            <div className="absolute top-2 right-2 z-10 pointer-events-none">
                                <picture>
                                    <source
                                        srcSet={`https://fonts.gstatic.com/s/e/notoemoji/latest/${emoji}/512.webp`}
                                        type="image/webp"
                                    />
                                    <img
                                        src={`https://fonts.gstatic.com/s/e/notoemoji/latest/${emoji}/512.gif`}
                                        alt="reaction"
                                        width="40"
                                        height="40"
                                    />
                                </picture>
                            </div>
                        )}
                        {handRaised === 'true' && (
                            <div className="absolute top-2 left-2 z-10 pointer-events-none">
                                <span
                                    className="material-symbols-outlined ml-0.5 text-4xl! animate-wave"
                                    style={{
                                        fontVariationSettings: '"FILL" 1',
                                        color: '#ffd500',
                                    }}
                                >
                                    back_hand
                                </span>
                            </div>
                        )}
                        {children ?? (
                            <>
                                {isTrackReference(trackReference) &&
                                (trackReference.publication?.kind === 'video' ||
                                    trackReference.source === Track.Source.Camera ||
                                    trackReference.source === Track.Source.ScreenShare) ? (
                                    <VideoTrack
                                        trackRef={trackReference}
                                        onSubscriptionStatusChanged={handleSubscribe}
                                        manageSubscription={autoManageSubscription}
                                    />
                                ) : (
                                    isTrackReference(trackReference) && (
                                        <AudioTrack
                                            trackRef={trackReference}
                                            onSubscriptionStatusChanged={handleSubscribe}
                                        />
                                    )
                                )}
                                <div className="lk-participant-placeholder">
                                    {metadata?.avatarUrl ? (
                                        <div
                                            className="w-full h-full flex flex-col gap-4 items-center justify-center"
                                            style={{
                                                background:
                                                    data?.muted &&
                                                    data?.lightMuted &&
                                                    data?.darkMuted
                                                        ? `radial-gradient(circle, ${data.muted}, ${data.darkMuted})`
                                                        : 'transparent',
                                            }}
                                        >
                                            <img
                                                src={metadata.avatarUrl}
                                                className="w-[200px] h-[200px] rounded-full"
                                                alt=""
                                            />
                                        </div>
                                    ) : (
                                        <ParticipantPlaceholder />
                                    )}
                                </div>
                                <div className="lk-participant-metadata">
                                    <div className="lk-participant-metadata-item">
                                        {trackReference.source === Track.Source.Camera ? (
                                            <>
                                                {isEncrypted && (
                                                    <LockLockedIcon
                                                        style={{ marginRight: '0.25rem' }}
                                                    />
                                                )}
                                                <TrackMutedIndicator
                                                    trackRef={{
                                                        participant: trackReference.participant,
                                                        source: Track.Source.Microphone,
                                                    }}
                                                    show={'muted'}
                                                ></TrackMutedIndicator>
                                                <ParticipantName />
                                                {/* {handRaised === 'true' && (
                                                    <span
                                                        className="material-symbols-outlined ml-0.5 text-[16px]! animate-wave"
                                                        style={{
                                                            fontVariationSettings: '"FILL" 1',
                                                            color: '#ffd500',
                                                        }}
                                                    >
                                                        back_hand
                                                    </span>
                                                )} */}
                                            </>
                                        ) : (
                                            <>
                                                <ScreenShareIcon
                                                    style={{ marginRight: '0.25rem' }}
                                                />
                                                <ParticipantName>&apos;s screen</ParticipantName>
                                            </>
                                        )}
                                    </div>
                                    <ConnectionQualityIndicator className="lk-participant-metadata-item" />
                                </div>
                            </>
                        )}
                        <FocusToggle trackRef={trackReference} />
                    </ParticipantContextIfNeeded>
                </TrackRefContextIfNeeded>
            </div>
        );
    },
);
