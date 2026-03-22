'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Share2 } from 'lucide-react';
import {
    WhatsappShareButton,
    EmailShareButton,
    LinkedinShareButton,
    TwitterShareButton,
    TelegramShareButton,
} from 'react-share';
import { SocialIcon } from 'react-social-icons';
import { toast } from 'react-hot-toast';

interface ShareRecordingModalProps {
    isOpen: boolean;
    onClose: () => void;
    recordingUrl: string;
    roomName: string;
}

export const ShareRecordingModal: React.FC<ShareRecordingModalProps> = ({ 
    isOpen, 
    onClose, 
    recordingUrl,
    roomName 
}) => {
    const [isCopying, setIsCopying] = useState(false);

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(recordingUrl);
            setIsCopying(true);
            toast.success('Video link copied to clipboard');
            setTimeout(() => setIsCopying(false), 2000);
        } catch (err) {
            toast.error('Failed to copy link');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <Share2 size={20} className="text-[#00a8a8]" />
                        <h2 className="text-slate-900 dark:text-slate-100 text-xl font-semibold">
                            Share Recording
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-[40px] h-[40px] border-0 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 flex items-center justify-center cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </header>

                {/* Body */}
                <div className="p-6 space-y-6">
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Share the video recording of <span className="font-bold text-slate-900 dark:text-slate-100">{roomName}</span> with others.
                        </p>
                        
                        {/* Share Link */}
                        <div className="space-y-3 pt-2">
                            <span className="text-slate-700 dark:text-slate-300 text-sm font-medium">
                                Video URL
                            </span>
                            <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg group">
                                <div className="flex-1 truncate">
                                    <p className="text-slate-600 dark:text-slate-400 text-sm font-mono truncate">
                                        {recordingUrl}
                                    </p>
                                </div>
                                <button
                                    onClick={handleCopyLink}
                                    className="flex items-center gap-1.5 border-0 bg-[#00a8a8] hover:bg-[#00a8a8]/90 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-semibold cursor-pointer shrink-0"
                                >
                                    {isCopying ? <Check size={16} /> : <Copy size={16} />}
                                    {isCopying ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>

                        {/* Platforms */}
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                            <p className="text-slate-500 dark:text-slate-400 text-xs tracking-wider font-semibold mb-3">
                                Share via other platforms
                            </p>
                            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x">
                                <div className="snap-start shrink-0">
                                    <TelegramShareButton
                                        url={recordingUrl}
                                        title={`Check out the recording for: ${roomName}`}
                                    >
                                        <SocialIcon
                                            network="telegram"
                                            style={{ height: 40, width: 40 }}
                                        />
                                    </TelegramShareButton>
                                </div>
                                <div className="snap-start shrink-0">
                                    <WhatsappShareButton
                                        url={recordingUrl}
                                        title={`Check out the recording for: ${roomName}`}
                                    >
                                        <SocialIcon
                                            network="whatsapp"
                                            style={{ height: 40, width: 40 }}
                                        />
                                    </WhatsappShareButton>
                                </div>
                                <div className="snap-start shrink-0">
                                    <TwitterShareButton
                                        url={recordingUrl}
                                        title={`Check out the recording for: ${roomName}`}
                                    >
                                        <SocialIcon
                                            network="x"
                                            style={{ height: 40, width: 40 }}
                                        />
                                    </TwitterShareButton>
                                </div>
                                <div className="snap-start shrink-0">
                                    <LinkedinShareButton url={recordingUrl}>
                                        <SocialIcon
                                            network="linkedin"
                                            style={{ height: 40, width: 40 }}
                                        />
                                    </LinkedinShareButton>
                                </div>
                                <div className="snap-start shrink-0">
                                    <EmailShareButton 
                                        url={recordingUrl}
                                        subject={`Recording for ${roomName}`}
                                        body="Hi, check out this recording from our meeting."
                                    >
                                        <SocialIcon
                                            network="email"
                                            style={{ height: 40, width: 40 }}
                                        />
                                    </EmailShareButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <footer className="bg-slate-50 dark:bg-slate-900/50 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-slate-400 text-[10px] text-center italic">
                        Anyone with this link will be able to view the raw video file.
                    </p>
                </footer>
            </div>
        </div>
    );
};
