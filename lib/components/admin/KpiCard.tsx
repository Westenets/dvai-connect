/**
 * KPI card for the admin overview dashboard.
 *
 * Vendored Tremor-style; intentionally no external deps. If we ever
 * adopt the Tremor library wholesale we can swap this one component
 * out without touching the consuming pages.
 */
interface Props {
    label: string;
    value: string;
    /** Subtle line under the value, e.g. trend or context. */
    sublabel?: string;
    /** Tone — affects accent color used for value emphasis. */
    tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}

const TONE_CLASS: Record<NonNullable<Props['tone']>, string> = {
    neutral: 'text-slate-900 dark:text-slate-100',
    positive: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
};

export function KpiCard({ label, value, sublabel, tone = 'neutral' }: Props) {
    return (
        <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-5">
            <div className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-2">
                {label}
            </div>
            <div className={`text-3xl font-semibold tabular-nums ${TONE_CLASS[tone]}`}>{value}</div>
            {sublabel && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">{sublabel}</div>
            )}
        </div>
    );
}
