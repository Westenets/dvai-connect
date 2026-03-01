'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#f5f7f8] dark:bg-[#101922] font-['Inter',_sans-serif]">
      <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-700">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
          Something went wrong!
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">An unexpected error has occurred.</p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-2.5 bg-[#258cf4] text-white font-bold rounded-lg hover:bg-[#258cf4]/90 transition-all text-sm shadow-md shadow-[#258cf4]/20"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-all text-sm"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
