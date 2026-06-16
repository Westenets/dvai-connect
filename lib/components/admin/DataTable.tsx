/**
 * Minimal vendored data table for the admin panel. Server-rendered;
 * accepts already-sorted/filtered rows and renders them with optional
 * column-level formatters. Per-row actions render in a trailing
 * "Actions" column.
 *
 * Why not TanStack Table v8 directly: it's a great library but it's
 * client-only and the admin pages we're shipping are server-rendered
 * (data fetched in the page component). When we add client-side
 * filtering / column-sort, we can swap this for TanStack Table
 * without touching the page-level data fetches.
 */

import type { ReactNode } from 'react';

export interface Column<T> {
    key: string;
    header: string;
    /** Cell renderer. Defaults to `String(row[key])`. */
    render?: (row: T) => ReactNode;
    align?: 'left' | 'center' | 'right';
    /** Use a smaller text style for less-emphasized columns. */
    muted?: boolean;
}

interface Props<T> {
    columns: Array<Column<T>>;
    rows: T[];
    /** Stable id for each row. Used as React key. */
    rowKey: (row: T) => string;
    /** Optional trailing "Actions" column. */
    actions?: (row: T) => ReactNode;
    /** Shown when rows is empty. */
    emptyState?: ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, actions, emptyState }: Props<T>) {
    if (rows.length === 0) {
        return (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {emptyState ?? 'Nothing here yet.'}
            </div>
        );
    }
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                    <tr>
                        {columns.map((c) => (
                            <th
                                key={c.key}
                                className={
                                    'px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap ' +
                                    (c.align === 'right'
                                        ? 'text-right'
                                        : c.align === 'center'
                                          ? 'text-center'
                                          : 'text-left')
                                }
                            >
                                {c.header}
                            </th>
                        ))}
                        {actions && (
                            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                                Actions
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((row) => (
                        <tr
                            key={rowKey(row)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                            {columns.map((c) => {
                                const value = c.render
                                    ? c.render(row)
                                    : ((row as any)[c.key] ?? '');
                                return (
                                    <td
                                        key={c.key}
                                        className={
                                            'px-4 py-3 whitespace-nowrap ' +
                                            (c.align === 'right'
                                                ? 'text-right'
                                                : c.align === 'center'
                                                  ? 'text-center'
                                                  : 'text-left') +
                                            (c.muted
                                                ? ' text-slate-500 dark:text-slate-400 text-xs'
                                                : ' text-slate-900 dark:text-slate-100')
                                        }
                                    >
                                        {value}
                                    </td>
                                );
                            })}
                            {actions && (
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    {actions(row)}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

export function formatRelative(iso: string | null | undefined): string {
    if (!iso) return '—';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const now = Date.now();
    const sec = Math.floor((now - then) / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
}
