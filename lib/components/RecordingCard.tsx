'use client';

import React from 'react';
import Link from 'next/link';
import { handleDeleteRecording } from '@/lib/deleteRecording';

interface RecordingCardProps {
    rec: any;
    user: any;
    onDelete?: (id: string) => void;
}

export const RecordingCard: React.FC<RecordingCardProps> = ({ rec, user, onDelete }) => {
    const isOwner = rec.owner?.includes(user?.$id) || rec.started_by?.split('__')[1] === user?.$id;

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleDeleteRecording(rec, user, () => {
            if (onDelete) onDelete(rec.$id);
        });
    };

    return (
        <Link 
            href={`/recordings/${rec.$id}`}
            className="group bg-white dark:bg-[#15202b] p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 hover:border-[#00a8a8] dark:hover:border-[#00a8a8] transition-all hover:shadow-md h-full flex flex-col no-underline text-inherit"
        >
            <div className="relative w-full aspect-video mb-4 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800">
                {rec.thumbnail ? (
                    <img
                        src={rec.thumbnail}
                        alt={rec.room_name}
                        className="w-full h-full object-cover transition-transform scale-105 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <span className="material-symbols-outlined text-4xl">
                            videocam
                        </span>
                    </div>
                )}
                <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded-lg text-[10px] text-white font-semibold">
                    {new Date(rec.$createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                    })}
                    {' - '}
                    {new Date(rec.$createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </div>
            </div>
            
            <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1 truncate leading-tight flex items-center justify-between gap-2 mt-0">
                    <span className="truncate" title={rec.room_name}>{rec.room_name}</span>
                    {isOwner && (
                        <button
                            onClick={handleDelete}
                            className="text-slate-500 hover:text-red-500 transition-colors bg-transparent border-0 p-1 rounded-full cursor-pointer shrink-0"
                            title="Delete recording"
                        >
                            <span className="material-symbols-outlined text-[18px]">
                                delete
                            </span>
                        </button>
                    )}
                </h3>
                <p className="text-[11px] text-slate-500 flex items-center gap-1 opacity-80 my-0">
                    <span className="material-symbols-outlined text-[14px]">
                        person
                    </span>
                    Started by{' '}
                    {rec.started_by?.split('__')[0] === user?.name
                        ? 'You'
                        : rec.started_by?.split('__')[0] || 'Unknown'}
                </p>
            </div>
        </Link>
    );
};
