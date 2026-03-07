'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Copy, Check, UserPlus } from 'lucide-react';
import {
    WhatsappShareButton,
    EmailShareButton,
    LinkedinShareButton,
    TwitterShareButton,
    TelegramShareButton,
    FacebookMessengerShareButton,
} from 'react-share';
import { SocialIcon } from 'react-social-icons';
import { toast } from 'react-hot-toast';
import { databases } from './appwrite';
import { ID, Query } from 'appwrite';
import { useAuth } from '@/components/AuthProvider';

interface Contact {
    $id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    dvai_id?: string;
    phone?: string;
}

interface InviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    roomName: string;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, roomName }) => {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [isInviting, setIsInviting] = useState<string | null>(null);

    const meetingLink = useMemo(() => {
        if (typeof window === 'undefined') return '';
        return `${window.location.origin}/rooms/${roomName}`;
    }, [roomName]);

    const fetchContacts = React.useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await databases.listDocuments('dvai-connect', 'contacts', [
                Query.equal('userid', user.$id),
                Query.limit(50), // Increase limit slightly to show more
                Query.orderDesc('$createdAt'), // Show newest first
            ]);
            setContacts(response.documents as unknown as Contact[]);
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    // Fetch contacts from Appwrite
    useEffect(() => {
        if (isOpen && user) {
            fetchContacts();
        }
    }, [isOpen, user, fetchContacts]);

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(meetingLink);
            setIsCopying(true);
            toast.success('Link copied to clipboard');
            setTimeout(() => setIsCopying(false), 2000);
        } catch (err) {
            toast.error('Failed to copy link');
        }
    };

    const handleInvite = async (email: string, name?: string, contactId?: string) => {
        setIsInviting(email);
        try {
            const response = await fetch('/api/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user?.$id || '',
                },
                body: JSON.stringify({
                    email,
                    name: name || email.split('@')[0],
                    meetingLink,
                    roomName,
                    inviterName: user?.name,
                    contactId, // Pass if existing contact
                }),
            });

            if (response.ok) {
                toast.success(`Invite sent to ${email}`);
                // Refresh contacts to show the newly added one immediately
                await fetchContacts();
                setSearchQuery(''); // Clear search query after success
            } else {
                toast.error('Failed to send invite');
            }
        } catch (error) {
            toast.error('Error sending invite');
            console.error(error);
        } finally {
            setIsInviting(null);
        }
    };

    const filteredContacts = contacts.filter(
        (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.email.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const isNewEmail =
        searchQuery.includes('@') &&
        !contacts.some((c) => c.email.toLowerCase() === searchQuery.toLowerCase());

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-slate-900 dark:text-slate-100 text-xl font-semibold">
                        Add people
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-[40px] h-[40px] border-0 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 flex items-center justify-center"
                    >
                        <X size={20} />
                    </button>
                </header>

                {/* Body */}
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto lk-scrollbar">
                    {/* Search / Invite by Email */}
                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-slate-700 dark:text-slate-300 text-sm font-medium mb-1.5 block">
                                Invite by email
                            </span>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                                    <Search size={18} />
                                </div>
                                <input
                                    className="block w-full pl-10 pr-3 py-3 bg-slate-50 dark:bg-slate-800 border-none ring-1 ring-slate-200 dark:ring-slate-700 rounded-lg focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-sm transition-all"
                                    placeholder="Enter name or email"
                                    type="email"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </label>

                        {/* Contacts List */}
                        <div className="space-y-1 max-h-[20vh] overflow-y-auto lk-scrollbar">
                            {filteredContacts.map((contact) => (
                                <div
                                    key={contact.$id}
                                    className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                                            {contact.avatarUrl ? (
                                                <img
                                                    src={contact.avatarUrl}
                                                    alt={contact.name}
                                                    className="w-full h-full object-cover rounded-full"
                                                />
                                            ) : (
                                                <img
                                                    src={`https://ui-avatars.com/api/?name=${contact.name}&length=1&background=random`}
                                                    alt={contact.name}
                                                    className="w-full h-full object-cover rounded-full"
                                                />
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <p className="text-slate-900 dark:text-slate-100 text-sm font-medium m-0">
                                                {contact.name}
                                            </p>
                                            <p className="text-slate-500 text-xs m-0">
                                                {contact.email}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleInvite(contact.email, contact.name, contact.$id)
                                        }
                                        disabled={isInviting === contact.email}
                                        className="text-white border-0 bg-[#00a8a8] hover:bg-[#00a8a8]/90 text-sm font-semibold px-3 py-1 rounded disabled:opacity-50"
                                    >
                                        {isInviting === contact.email ? 'Sending...' : 'Invite'}
                                    </button>
                                </div>
                            ))}

                            {/* New Email Suggestion */}
                            {isNewEmail && (
                                <div className="flex items-center justify-between p-3 border-t border-slate-100 dark:border-slate-800 mt-2 bg-primary/5 dark:bg-primary/10 rounded-lg">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                            <UserPlus className="text-primary" size={20} />
                                        </div>
                                        <p className="text-slate-800 dark:text-slate-200 text-sm leading-tight">
                                            Add <span className="font-bold">"{searchQuery}"</span>{' '}
                                            to contacts and invite
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleInvite(searchQuery)}
                                        disabled={isInviting === searchQuery}
                                        className="shrink-0 border-0 bg-[#00a8a8] hover:bg-[#00a8a8]/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {isInviting === searchQuery ? 'Sending...' : 'Invite'}
                                    </button>
                                </div>
                            )}

                            {!isLoading &&
                                filteredContacts.length === 0 &&
                                !isNewEmail &&
                                searchQuery && (
                                    <p className="text-center py-4 text-slate-500 text-sm">
                                        No contacts found
                                    </p>
                                )}
                        </div>
                    </div>

                    <hr className="border-slate-100 dark:border-slate-800" />

                    {/* Share Link */}
                    <div className="space-y-3">
                        <span className="text-slate-700 dark:text-slate-300 text-sm font-medium">
                            Share meeting link
                        </span>
                        <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg group">
                            <div className="flex-1 truncate">
                                <p className="text-slate-600 dark:text-slate-400 text-sm font-mono truncate">
                                    {meetingLink}
                                </p>
                            </div>
                            <button
                                onClick={handleCopyLink}
                                className="flex items-center gap-1.5 border-0 bg-[#00a8a8] hover:bg-[#00a8a8]/90 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-semibold"
                            >
                                {isCopying ? <Check size={16} /> : <Copy size={16} />}
                                {isCopying ? 'Copied' : 'Copy link'}
                            </button>
                        </div>
                    </div>

                    {/* Platforms */}
                    <div className="pt-2">
                        <p className="text-slate-500 dark:text-slate-400 text-xs tracking-wider font-semibold mb-3 px-1">
                            Share via other platforms
                        </p>
                        <div className="flex gap-4 overflow-x-auto pb-4 lk-scrollbar snap-x">
                            <div className="snap-start shrink-0">
                                <TelegramShareButton
                                    url={meetingLink}
                                    title={`Join my meeting: ${roomName}`}
                                >
                                    <SocialIcon
                                        network="telegram"
                                        style={{ height: 40, width: 40 }}
                                    />
                                </TelegramShareButton>
                            </div>
                            <div className="snap-start shrink-0">
                                <WhatsappShareButton
                                    url={meetingLink}
                                    title={`Join my meeting: ${roomName}`}
                                >
                                    <SocialIcon
                                        network="whatsapp"
                                        style={{ height: 40, width: 40 }}
                                    />
                                </WhatsappShareButton>
                            </div>
                            <div className="snap-start shrink-0">
                                <TwitterShareButton
                                    url={meetingLink}
                                    title={`Join my meeting: ${roomName}`}
                                >
                                    <SocialIcon
                                        network="x"
                                        style={{ height: 40, width: 40 }}
                                    />
                                </TwitterShareButton>
                            </div>
                            <div className="snap-start shrink-0">
                                <LinkedinShareButton url={meetingLink}>
                                    <SocialIcon
                                        network="linkedin"
                                        style={{ height: 40, width: 40 }}
                                    />
                                </LinkedinShareButton>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <footer className="bg-slate-50 dark:bg-slate-900/50 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-slate-400 text-xs text-center">
                        Only people invited or with the link can join the meeting.
                    </p>
                </footer>
            </div>
        </div>
    );
};
