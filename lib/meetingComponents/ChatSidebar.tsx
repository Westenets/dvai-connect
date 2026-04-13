'use client';

import * as React from 'react';
import { X, Send, Paperclip, FileText, MessageSquare } from 'lucide-react';
import { useMaybeRoomContext, useLocalParticipant } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ingestChatMessage, type ChatMessage } from '@/lib/db';
import { storage } from '@/lib/appwrite';
import { ID } from 'appwrite';
import { playMessageSound } from '@/lib/sound';

const CHAT_TOPIC = 'chat';
const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID || 'mvc-files';
const MAX_NOTIFICATIONS = 5;

interface ChatNotification {
    id: string;
    sender: string;
    text: string;
    msgDbId?: number;
    timestamp: number;
}

export interface ChatSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    onClose: () => void;
    isOpen?: boolean;
    onOpenChat?: () => void;
}

export function ChatSidebar({ onClose, isOpen = false, onOpenChat, style, className, ...props }: ChatSidebarProps) {
    const room = useMaybeRoomContext();
    const { localParticipant } = useLocalParticipant();
    const [inputText, setInputText] = React.useState('');
    const [isUploading, setIsUploading] = React.useState(false);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);
    const messageRefsMap = React.useRef<Map<number, HTMLDivElement>>(new Map());
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const ingestedIdsRef = React.useRef(new Set<string>());
    const isOpenRef = React.useRef(isOpen);
    const [notifications, setNotifications] = React.useState<ChatNotification[]>([]);

    // Keep ref in sync
    React.useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

    // Clear notifications when chat opens
    React.useEffect(() => {
        if (isOpen) setNotifications([]);
    }, [isOpen]);

    const roomName = room?.name || '';

    // Load chat history from DB
    const dbMessages = useLiveQuery(
        () => roomName ? db.chat_messages.where('room_name').equals(roomName).sortBy('timestamp') : [],
        [roomName]
    ) || [];

    // Auto-scroll to bottom
    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [dbMessages.length]);

    const senderName = React.useMemo(() => {
        return localParticipant?.name || localParticipant?.identity || 'You';
    }, [localParticipant]);

    // Show notification for a remote message when chat is closed
    const showNotification = React.useCallback((sender: string, text: string, msgDbId?: number) => {
        playMessageSound();
        if (isOpenRef.current) return; // Chat is visible, no toast needed

        setNotifications(prev => {
            if (prev.length >= MAX_NOTIFICATIONS) return prev; // Cap at 5
            return [...prev, {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                sender,
                text: text || '(media)',
                msgDbId,
                timestamp: Date.now(),
            }];
        });
    }, []);

    const dismissNotification = React.useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const handleNotificationClick = React.useCallback((notif: ChatNotification) => {
        dismissNotification(notif.id);
        onOpenChat?.();
        // Scroll to the message after chat opens
        if (notif.msgDbId) {
            setTimeout(() => {
                const el = messageRefsMap.current.get(notif.msgDbId!);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Brief highlight
                el?.classList.add('ring-2', 'ring-[#00a8a8]');
                setTimeout(() => el?.classList.remove('ring-2', 'ring-[#00a8a8]'), 2000);
            }, 150);
        }
    }, [dismissNotification, onOpenChat]);

    // Receive messages from other participants
    React.useEffect(() => {
        if (!room) return;

        const handleData = async (payload: Uint8Array, participant: any, _kind: any, topic?: string) => {
            if (topic !== CHAT_TOPIC) return;
            try {
                const data = JSON.parse(new TextDecoder().decode(payload));
                if (data.type !== 'chat_message') return;
                if (ingestedIdsRef.current.has(data.id)) return;
                ingestedIdsRef.current.add(data.id);

                const msgDbId = await ingestChatMessage({
                    room_name: roomName,
                    sender: data.sender,
                    text: data.text || '',
                    timestamp: data.timestamp,
                    media_url: data.media_url,
                    media_type: data.media_type,
                    media_name: data.media_name,
                });

                // Show notification for remote messages
                if (data.sender !== senderName) {
                    showNotification(data.sender, data.text, typeof msgDbId === 'number' ? msgDbId : undefined);
                }
            } catch { /* ignore malformed */ }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => { room.off(RoomEvent.DataReceived, handleData); };
    }, [room, roomName, senderName, showNotification]);

    const sendMessage = React.useCallback(async (text: string, media?: { url: string; type: string; name: string }) => {
        if (!room || !roomName || (!text.trim() && !media)) return;

        const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const timestamp = Date.now();

        const payload = {
            type: 'chat_message',
            id: msgId,
            text: text.trim(),
            sender: senderName,
            timestamp,
            ...(media && { media_url: media.url, media_type: media.type, media_name: media.name }),
        };

        room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(payload)),
            { topic: CHAT_TOPIC },
        );

        ingestedIdsRef.current.add(msgId);

        await ingestChatMessage({
            room_name: roomName,
            sender: senderName,
            text: text.trim(),
            timestamp,
            media_url: media?.url,
            media_type: media?.type,
            media_name: media?.name,
        });

        setInputText('');
    }, [room, roomName, senderName]);

    const handleSend = () => {
        if (inputText.trim()) sendMessage(inputText);
    };

    const handleFileUpload = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !room) return;

        setIsUploading(true);
        try {
            const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file);
            const url = storage.getFileView(BUCKET_ID, uploaded.$id).toString();
            const type = file.type.startsWith('image/') ? 'image' : 'file';
            await sendMessage('', { url, type, name: file.name });
        } catch (err) {
            console.error('[Chat] File upload failed:', err);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [room, sendMessage]);

    const isLocal = (msg: ChatMessage) => msg.sender === senderName;

    return (
        <>
            {/* Notification toasts (rendered outside sidebar, always visible) */}
            {notifications.length > 0 && (
                <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '340px' }}>
                    {notifications.map(notif => (
                        <div
                            key={notif.id}
                            className="pointer-events-auto bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-3 shadow-2xl shadow-black/30 cursor-pointer hover:bg-slate-800/95 transition-all animate-in slide-in-from-right"
                            onClick={() => handleNotificationClick(notif)}
                        >
                            <div className="flex items-start gap-3">
                                <div className="size-8 rounded-full bg-[#00a8a8]/20 flex items-center justify-center shrink-0 mt-0.5">
                                    <MessageSquare size={14} className="text-[#00a8a8]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-[#00a8a8]">{notif.sender}</p>
                                    <p className="text-xs text-slate-300 truncate mt-0.5">{notif.text}</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                                    className="text-slate-500 hover:text-white bg-transparent border-0 p-0.5 cursor-pointer shrink-0"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Sidebar */}
            <aside
                className={`w-96 border-l bg-(--lk-bg) border-white/10 flex flex-col h-full z-20 shadow-xl ${className || ''}`}
                style={style}
                {...props}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                    <h2 className="text-white text-base font-bold">Chat</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-transparent border-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {dbMessages.length === 0 && (
                        <p className="text-center text-slate-500 text-xs mt-10">No messages yet. Say hello!</p>
                    )}
                    {dbMessages.map((msg, i) => (
                        <div
                            key={msg.id || i}
                            ref={el => { if (el && msg.id) messageRefsMap.current.set(msg.id, el); }}
                            className={`flex flex-col transition-all rounded-xl ${isLocal(msg) ? 'items-end' : 'items-start'}`}
                        >
                            <span className="text-[10px] text-slate-500 mb-0.5 px-1">
                                {msg.sender} &middot; {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                                isLocal(msg)
                                    ? 'bg-[#00a8a8] text-white rounded-br-sm'
                                    : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                            }`}>
                                {msg.text && <p>{msg.text}</p>}
                                {msg.media_url && msg.media_type === 'image' && (
                                    <img
                                        src={msg.media_url}
                                        alt={msg.media_name || 'Image'}
                                        className="mt-1.5 rounded-lg max-w-full max-h-48 object-cover cursor-pointer"
                                        onClick={() => window.open(msg.media_url, '_blank')}
                                    />
                                )}
                                {msg.media_url && msg.media_type === 'file' && (
                                    <a
                                        href={msg.media_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1.5 flex items-center gap-2 text-xs text-white underline opacity-80 hover:opacity-100"
                                    >
                                        <FileText size={14} />
                                        {msg.media_name || 'Download file'}
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-white/10 shrink-0">
                    <div className="flex items-center gap-2">
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="text-slate-400 hover:text-white transition-colors bg-transparent border-0 p-1.5 cursor-pointer disabled:opacity-50"
                            title="Attach file"
                        >
                            {isUploading ? (
                                <div className="size-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Paperclip size={18} />
                            )}
                        </button>
                        <input
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            placeholder="Type a message..."
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-[#00a8a8]"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputText.trim()}
                            className="text-[#00a8a8] hover:text-[#00a8a8]/80 transition-colors bg-transparent border-0 p-1.5 cursor-pointer disabled:opacity-30"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
