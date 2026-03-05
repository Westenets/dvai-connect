'use client';

import * as React from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <html lang="en">
            <body className="bg-[#f5f7f8] dark:bg-[#101922] font-sans antialiased text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center min-h-screen">
                <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700">
                    <h2 className="text-2xl font-bold mb-4">A critical error occurred</h2>
                    <p className="text-slate-500 mb-6">Something went completely wrong.</p>
                    <button
                        onClick={() => reset()}
                        className="px-6 py-2.5 bg-[#258cf4] text-white font-bold rounded-lg hover:bg-[#258cf4]/90 transition-all text-sm"
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
