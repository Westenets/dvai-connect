'use client';
import * as React from 'react';
import { Track } from 'livekit-client';
import {
    useMaybeLayoutContext,
    MediaDeviceMenu,
    TrackToggle,
    useRoomContext,
    useIsRecording,
} from '@livekit/components-react';
import styles from '../styles/SettingsMenu.module.css';
import { CameraSettings } from './CameraSettings';
import { MicrophoneSettings } from './MicrophoneSettings';
/**
 * @alpha
 */
export interface SettingsMenuProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * @alpha
 */
export function SettingsMenu(props: SettingsMenuProps) {
    const layoutContext = useMaybeLayoutContext();

    const settings = React.useMemo(() => {
        return {
            media: { camera: true, microphone: true, label: 'Media Devices', speaker: true },
        };
    }, []);

    const tabs = React.useMemo(
        () => Object.keys(settings) as Array<keyof typeof settings>,
        [settings],
    );
    const [activeTab, setActiveTab] = React.useState(tabs[0]);

    return (
        <div className="settings-menu" style={{ width: '100%', position: 'relative' }} {...props}>
            <div className={styles.tabs}>
                {tabs.map(
                    (tab) =>
                        settings[tab] && (
                            <button
                                className={`${styles.tab} lk-button`}
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                aria-pressed={tab === activeTab}
                            >
                                {
                                    // @ts-ignore
                                    settings[tab].label
                                }
                            </button>
                        ),
                )}
            </div>
            <div className="tab-content">
                {activeTab === 'media' && (
                    <>
                        {settings.media && settings.media.camera && (
                            <>
                                <h3>Camera</h3>
                                <section>
                                    <CameraSettings />
                                </section>
                            </>
                        )}
                        {settings.media && settings.media.microphone && (
                            <>
                                <h3>Microphone</h3>
                                <section>
                                    <MicrophoneSettings />
                                </section>
                            </>
                        )}
                        {settings.media && settings.media.speaker && (
                            <>
                                <h3>Speaker & Headphones</h3>
                                <section className="lk-button-group">
                                    <span className="lk-button">Audio Output</span>
                                    <div className="lk-button-group-menu">
                                        <MediaDeviceMenu kind="audiooutput"></MediaDeviceMenu>
                                    </div>
                                </section>
                            </>
                        )}
                    </>
                )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <button
                    className={`lk-button`}
                    onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
                >
                    Close
                </button>
            </div>
        </div>
    );
}
