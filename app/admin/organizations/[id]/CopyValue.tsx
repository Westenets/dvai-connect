'use client';
import { useState } from 'react';

/**
 * Tiny copy-to-clipboard pill used in admin pages where we want to
 * show a Stripe id, env var value, signup code, etc. without making
 * the user select-and-copy by hand. Falls back silently if the
 * clipboard API isn't available.
 */
export function CopyValue({ value, label }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(value);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                } catch {
                    // no-op
                }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-mono hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Click to copy"
        >
            <span className="truncate max-w-[260px]">{label ?? value}</span>
            <span className="text-emerald-500">{copied ? '✓' : '⧉'}</span>
        </button>
    );
}
