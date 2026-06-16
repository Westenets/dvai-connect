'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface OrgInput {
    name: string;
    country: string;
    program_name: string;
    tier_override: '' | 'pro_africa' | 'pro' | 'business' | 'enterprise';
    commitment_months: string;
    max_seats: string;
    expires_at: string;
    primary_contact_name: string;
    primary_contact_email: string;
    billing_contact_email: string;
    notes: string;
}

const EMPTY: OrgInput = {
    name: '',
    country: 'IN',
    program_name: '',
    tier_override: '',
    commitment_months: '',
    max_seats: '0',
    expires_at: '',
    primary_contact_name: '',
    primary_contact_email: '',
    billing_contact_email: '',
    notes: '',
};

export function NewOrgForm() {
    const router = useRouter();
    const [f, setF] = useState<OrgInput>(EMPTY);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const update = <K extends keyof OrgInput>(k: K, v: OrgInput[K]) =>
        setF((prev) => ({ ...prev, [k]: v }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const payload = {
                name: f.name.trim(),
                country: f.country.trim().toUpperCase(),
                program_name: f.program_name.trim().toUpperCase(),
                tier_override: f.tier_override || null,
                commitment_months: f.commitment_months ? parseInt(f.commitment_months, 10) : null,
                max_seats: parseInt(f.max_seats || '0', 10),
                expires_at: f.expires_at || null,
                primary_contact_name: f.primary_contact_name.trim() || null,
                primary_contact_email: f.primary_contact_email.trim() || null,
                billing_contact_email: f.billing_contact_email.trim() || null,
                notes: f.notes.trim() || null,
            };
            const res = await fetch('/api/admin/organizations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const body = (await res.json()) as { orgId: string };
            router.push(`/admin/organizations/${body.orgId}`);
        } catch (err: any) {
            setError(err?.message ?? 'Create failed');
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-6 max-w-2xl">
            <Field label="Name *">
                <input
                    type="text"
                    required
                    value={f.name}
                    onChange={(e) => update('name', e.target.value)}
                    className="input"
                />
            </Field>
            <div className="grid grid-cols-2 gap-6">
                <Field label="Country (ISO-3166 alpha-2) *">
                    <input
                        type="text"
                        maxLength={2}
                        required
                        value={f.country}
                        onChange={(e) => update('country', e.target.value)}
                        className="input"
                    />
                </Field>
                <Field label="Program name * (used as signup-code prefix)">
                    <input
                        type="text"
                        required
                        value={f.program_name}
                        onChange={(e) => update('program_name', e.target.value)}
                        className="input"
                        placeholder="SAV"
                    />
                </Field>
            </div>
            <div className="grid grid-cols-2 gap-6">
                <Field label="Tier override">
                    <select
                        value={f.tier_override}
                        onChange={(e) =>
                            update('tier_override', e.target.value as OrgInput['tier_override'])
                        }
                        className="input"
                    >
                        <option value="">(none — members pick at checkout)</option>
                        <option value="pro_africa">Pro (Africa Cohort)</option>
                        <option value="pro">Pro</option>
                        <option value="business">Business</option>
                        <option value="enterprise">Enterprise</option>
                    </select>
                </Field>
                <Field label="Commitment months (optional)">
                    <input
                        type="number"
                        min={0}
                        value={f.commitment_months}
                        onChange={(e) => update('commitment_months', e.target.value)}
                        className="input"
                        placeholder="24"
                    />
                </Field>
            </div>
            <div className="grid grid-cols-2 gap-6">
                <Field label="Max seats (0 = unlimited)">
                    <input
                        type="number"
                        min={0}
                        value={f.max_seats}
                        onChange={(e) => update('max_seats', e.target.value)}
                        className="input"
                    />
                </Field>
                <Field label="Expires at (ISO date, optional)">
                    <input
                        type="datetime-local"
                        value={f.expires_at}
                        onChange={(e) => update('expires_at', e.target.value)}
                        className="input"
                    />
                </Field>
            </div>
            <Field label="Primary contact name">
                <input
                    type="text"
                    value={f.primary_contact_name}
                    onChange={(e) => update('primary_contact_name', e.target.value)}
                    className="input"
                />
            </Field>
            <div className="grid grid-cols-2 gap-6">
                <Field label="Primary contact email">
                    <input
                        type="email"
                        value={f.primary_contact_email}
                        onChange={(e) => update('primary_contact_email', e.target.value)}
                        className="input"
                    />
                </Field>
                <Field label="Billing contact email">
                    <input
                        type="email"
                        value={f.billing_contact_email}
                        onChange={(e) => update('billing_contact_email', e.target.value)}
                        className="input"
                    />
                </Field>
            </div>
            <Field label="Notes">
                <textarea
                    rows={3}
                    value={f.notes}
                    onChange={(e) => update('notes', e.target.value)}
                    className="input"
                />
            </Field>

            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

            <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2.5"
            >
                {busy ? 'Creating…' : 'Create organization'}
            </button>

            <style jsx>{`
                .input {
                    width: 100%;
                    border-radius: 0.5rem;
                    border: 1px solid rgb(203 213 225);
                    background: white;
                    padding: 0.5rem 0.75rem;
                    font-size: 0.875rem;
                }
                :global(.dark) .input {
                    border-color: rgb(51 65 85);
                    background: rgb(15 23 42);
                    color: rgb(248 250 252);
                }
            `}</style>
        </form>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="text-sm font-semibold mb-1">{label}</div>
            {children}
        </label>
    );
}
