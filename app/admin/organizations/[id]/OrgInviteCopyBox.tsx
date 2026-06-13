'use client';
import { useState } from 'react';

export function OrgInviteCopyBox({ url, code }: { url: string; code: string }) {
    const [copied, setCopied] = useState<'url' | 'code' | null>(null);
    const copy = async (value: string, which: 'url' | 'code') => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(which);
            setTimeout(() => setCopied(null), 1500);
        } catch {
            // ignore
        }
    };
    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    readOnly
                    value={url}
                    className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono"
                />
                <button
                    type="button"
                    onClick={() => copy(url, 'url')}
                    className="rounded-md bg-slate-900 dark:bg-emerald-500 text-white dark:text-slate-900 px-3 py-2 text-xs font-semibold"
                >
                    {copied === 'url' ? 'Copied' : 'Copy URL'}
                </button>
            </div>
            <div className="flex gap-2">
                <input
                    readOnly
                    value={code}
                    className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono"
                />
                <button
                    type="button"
                    onClick={() => copy(code, 'code')}
                    className="rounded-md bg-slate-900 dark:bg-emerald-500 text-white dark:text-slate-900 px-3 py-2 text-xs font-semibold"
                >
                    {copied === 'code' ? 'Copied' : 'Copy code'}
                </button>
            </div>
        </div>
    );
}
