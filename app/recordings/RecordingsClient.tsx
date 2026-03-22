'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { databases } from '@/lib/appwrite';
import { Query } from 'appwrite';
import { Header } from '@/lib/components/Header';
import { Footer } from '@/lib/components/Footer';
import { RecordingCard } from '@/lib/components/RecordingCard';
import { handleDeleteRecording } from '@/lib/deleteRecording';
import toast from 'react-hot-toast';
import { CustomDateRangePicker } from '@/lib/components/CustomDateRangePicker';
import { DateRange } from 'react-day-picker';

interface RecordingsClientProps {
    user: any;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function RecordingsClient({ user }: RecordingsClientProps) {
    const router = useRouter();
    const [recordings, setRecordings] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<'tile' | 'table'>('tile');
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [sort, setSort] = useState<'latest' | 'oldest' | 'name'>('latest');
    const [pageSize, setPageSize] = useState(25);
    const [currentPage, setCurrentPage] = useState(1);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth < 768) {
                setView('tile');
            }
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const fetchRecordings = async () => {
        if (!user?.$id) return;
        setIsLoading(true);
        try {
            const queries = [
                Query.contains('participant_ids', user.$id),
                Query.limit(pageSize),
                Query.offset((currentPage - 1) * pageSize),
            ];

            if (search) {
                queries.push(Query.contains('room_name', search));
            }

            const startDateIso = dateRange?.from
                ? new Date(dateRange.from.setHours(0, 0, 0, 0)).toISOString()
                : null;
            const endDateIso = dateRange?.to
                ? new Date(dateRange.to.setHours(23, 59, 59, 999)).toISOString()
                : null;

            if (startDateIso) {
                queries.push(Query.greaterThanEqual('$createdAt', startDateIso));
            }
            if (endDateIso) {
                queries.push(Query.lessThanEqual('$createdAt', endDateIso));
            }

            if (sort === 'latest') {
                queries.push(Query.orderDesc('$createdAt'));
            } else if (sort === 'oldest') {
                queries.push(Query.orderAsc('$createdAt'));
            } else if (sort === 'name') {
                queries.push(Query.orderAsc('room_name'));
            }

            const response = await databases.listDocuments('dvai-connect', 'recordings', queries);
            setRecordings(response.documents);
            setTotal(response.total);
        } catch (error) {
            console.error('Failed to fetch recordings:', error);
            toast.error('Failed to load recordings.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentPage(1); // Reset to first page on filter change
            fetchRecordings();
        }, 300); // Deborce refresh
        return () => clearTimeout(timer);
    }, [search, sort, pageSize, dateRange]);

    useEffect(() => {
        fetchRecordings();
    }, [currentPage]);

    const totalPages = Math.ceil(total / pageSize);

    const handleBack = () => {
        router.back();
    };

    const onDelete = (id: string) => {
        setRecordings((prev) => prev.filter((r) => r.$id !== id));
        setTotal((prev) => prev - 1);
    };

    return (
        <div className="bg-[#f5f7f8] dark:bg-[#101922] min-h-screen flex flex-col font-['Inter',sans-serif] text-slate-900 dark:text-slate-100">
            <Header isMobile={isMobile} />

            <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 md:p-12">
                {/* Functional Header Section */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8 bg-white dark:bg-[#15202b] p-4 md:p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button
                            onClick={handleBack}
                            className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 p-2 rounded-full border-0 cursor-pointer flex items-center justify-center transition-colors"
                            title="Go Back"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <h1 className="text-xl md:text-2xl font-bold">Recordings</h1>
                    </div>

                    <div className="flex flex-col xl:flex-row items-center gap-4 w-full md:w-auto flex-1 md:justify-end">
                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto flex-1 md:max-w-3xl">
                            <div className="relative w-full sm:flex-1">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] z-10 transition-colors">
                                    filter_list
                                </span>
                                <input
                                    type="text"
                                    placeholder="Filter by room name..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#00a8a8] text-sm md:text-base outline-none transition-all placeholder:text-slate-400"
                                />
                            </div>

                            <div className="w-full sm:w-72">
                                <CustomDateRangePicker value={dateRange} onChange={setDateRange} />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <select
                                value={sort}
                                onChange={(e) => setSort(e.target.value as any)}
                                className="h-10 px-3 py-2 bg-slate-50 dark:bg-slate-800 dark:text-white border-0 rounded-xl text-sm focus:ring-2 focus:ring-[#00a8a8] outline-none cursor-pointer flex-1 sm:flex-none appearance-none"
                            >
                                <option value="latest">Latest First</option>
                                <option value="oldest">Oldest First</option>
                                <option value="name">Name (A-Z)</option>
                            </select>

                            {!isMobile && (
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-px">
                                    <button
                                        onClick={() => setView('tile')}
                                        className={`p-1.5 rounded-l-lg border-0 cursor-pointer transition-all ${
                                            view === 'tile'
                                                ? 'bg-white dark:bg-slate-700 shadow-sm text-[#00a8a8]'
                                                : 'text-slate-100 bg-white dark:bg-slate-700'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            grid_view
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => setView('table')}
                                        className={`p-1.5 rounded-r-lg border-0 cursor-pointer transition-all ${
                                            view === 'table'
                                                ? 'bg-white dark:bg-slate-700 shadow-sm text-[#00a8a8]'
                                                : 'text-slate-100 bg-white dark:bg-slate-700'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[20px]">
                                            view_list
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content Section */}
                <div className="min-h-[400px]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-4">
                            <div className="w-10 h-10 border-4 border-[#00a8a8] border-t-transparent rounded-full animate-spin"></div>
                            <p>Loading your recordings...</p>
                        </div>
                    ) : recordings.length > 0 ? (
                        view === 'tile' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {recordings.map((rec) => (
                                    <RecordingCard
                                        key={rec.$id}
                                        rec={rec}
                                        user={user}
                                        onDelete={onDelete}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-[#15202b] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/50">
                                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                                    Preview
                                                </th>
                                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                                    Room Name
                                                </th>
                                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                                    Started By
                                                </th>
                                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                                    Date & Time
                                                </th>
                                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {recordings.map((rec) => (
                                                <tr
                                                    key={rec.$id}
                                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="w-20 aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                                            {rec.thumbnail ? (
                                                                <img
                                                                    src={rec.thumbnail}
                                                                    alt=""
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                                    <span className="material-symbols-outlined text-sm">
                                                                        videocam
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 font-medium truncate max-w-[200px]">
                                                        {rec.room_name}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-500">
                                                        {rec.started_by?.split('__')[0] ===
                                                        user?.name
                                                            ? 'You'
                                                            : rec.started_by?.split('__')[0] ||
                                                              'Unknown'}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-500">
                                                        <div>
                                                            {new Date(
                                                                rec.$createdAt,
                                                            ).toLocaleDateString()}
                                                        </div>
                                                        <div className="text-xs opacity-75">
                                                            {new Date(
                                                                rec.$createdAt,
                                                            ).toLocaleTimeString([], {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <a
                                                                href={rec.recording_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-[#00a8a8] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors no-underline"
                                                                title="Watch"
                                                            >
                                                                <span className="material-symbols-outlined">
                                                                    play_circle
                                                                </span>
                                                            </a>
                                                            {(rec.owner?.includes(user?.$id) ||
                                                                rec.started_by?.split('__')[1] ===
                                                                    user?.$id) && (
                                                                <button
                                                                    onClick={() =>
                                                                        handleDeleteRecording(
                                                                            rec,
                                                                            user,
                                                                            () => onDelete(rec.$id),
                                                                        )
                                                                    }
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 border-0 cursor-pointer transition-colors"
                                                                    title="Delete"
                                                                >
                                                                    <span className="material-symbols-outlined text-[18px]">
                                                                        delete
                                                                    </span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="bg-white dark:bg-[#15202b] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-20 text-center">
                            <div className="size-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
                                <span className="material-symbols-outlined text-[48px]">
                                    movie_off
                                </span>
                            </div>
                            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300">
                                No recordings found
                            </h3>
                            <p className="text-slate-500 dark:text-slate-500 max-w-sm mx-auto mt-2">
                                {search || dateRange?.from
                                    ? "We couldn't find any recordings matching your active filters."
                                    : "You haven't made any recordings yet."}
                            </p>
                            {(search || dateRange?.from) && (
                                <button
                                    onClick={() => {
                                        setSearch('');
                                        setDateRange(undefined);
                                    }}
                                    className="mt-6 px-6 py-2 bg-[#00a8a8] text-white rounded-full border-0 font-semibold cursor-pointer transition-all hover:bg-[#008888] active:scale-95 shadow-lg shadow-[#00a8a8]/20"
                                >
                                    Clear All Filters
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Pagination Control Section */}
                {total > 0 && (
                    <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-6 bg-white dark:bg-[#15202b] p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-4 text-sm text-slate-500 order-2 md:order-1">
                            <span className="dark:text-slate-100">
                                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                                {Math.min(currentPage * pageSize, total)} of {total} entries
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="hidden sm:inline dark:text-slate-100">
                                    per page:
                                </span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="px-2 py-1 bg-slate-100 dark:bg-slate-800 dark:text-white border-0 rounded-lg text-sm focus:ring-2 focus:ring-[#00a8a8] outline-none cursor-pointer"
                                >
                                    {PAGE_SIZE_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 order-1 md:order-2">
                            <button
                                disabled={currentPage === 1 || isLoading}
                                onClick={() => setCurrentPage((p) => p - 1)}
                                className="size-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-[#00a8a8] dark:text-slate-100 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border-0 transition-all"
                            >
                                <span className="material-symbols-outlined">chevron_left</span>
                            </button>

                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    // Simple pagination logic for first few pages
                                    let pageNum = i + 1;
                                    if (totalPages > 5 && currentPage > 3) {
                                        pageNum = currentPage - 3 + i + 1;
                                    }
                                    if (pageNum > totalPages) return null;

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`size-10 rounded-full border-0 flex items-center justify-center text-sm font-semibold transition-all cursor-pointer ${
                                                currentPage === pageNum
                                                    ? 'bg-[#00a8a8] text-white shadow-md'
                                                    : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                                {totalPages > 5 && currentPage < totalPages - 2 && (
                                    <>
                                        <span className="px-2 text-slate-400">...</span>
                                        <button
                                            onClick={() => setCurrentPage(totalPages)}
                                            className="size-10 rounded-full border-0 flex items-center justify-center text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                        >
                                            {totalPages}
                                        </button>
                                    </>
                                )}
                            </div>

                            <button
                                disabled={currentPage === totalPages || isLoading}
                                onClick={() => setCurrentPage((p) => p + 1)}
                                className="size-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-[#00a8a8] dark:text-white hover:text-white disabled:opacity-30 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed border-0 transition-all font-bold"
                            >
                                <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                        </div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
