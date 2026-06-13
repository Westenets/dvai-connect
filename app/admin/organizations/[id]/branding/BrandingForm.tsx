'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ID } from 'appwrite';
import { storage } from '@/lib/appwrite';

const BRANDING_BUCKET_ID =
    process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID || 'mvc-files';

interface BrandingFields {
    logoUrl?: string;
    darkLogoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    customDomain?: string;
    loginScreenCopy?: string;
    emailFromName?: string;
    emailFromAddress?: string;
}

export function BrandingForm({
    orgId,
    initial,
}: {
    orgId: string;
    initial: BrandingFields;
}) {
    const router = useRouter();
    const [fields, setFields] = useState<BrandingFields>(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const update = <K extends keyof BrandingFields>(k: K, v: BrandingFields[K]) =>
        setFields((prev) => ({ ...prev, [k]: v }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setSaved(false);
        try {
            const res = await fetch(`/api/admin/organizations/${encodeURIComponent(orgId)}/branding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setSaved(true);
            router.refresh();
            setTimeout(() => setSaved(false), 2000);
        } catch (err: any) {
            setError(err?.message ?? 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-6 max-w-3xl">
            <Field label="Logo (light bg)" hint="Recommended: 200×60 PNG with transparent background. Upload to your Appwrite bucket or paste any public URL.">
                <LogoInput
                    value={fields.logoUrl ?? ''}
                    onChange={(v) => update('logoUrl', v)}
                />
            </Field>
            <Field label="Logo (dark bg)" hint="Optional — defaults to the light logo if blank.">
                <LogoInput
                    value={fields.darkLogoUrl ?? ''}
                    onChange={(v) => update('darkLogoUrl', v)}
                />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Primary color (hex)">
                    <ColorInput
                        value={fields.primaryColor ?? ''}
                        onChange={(v) => update('primaryColor', v)}
                    />
                </Field>
                <Field label="Accent color (hex)">
                    <ColorInput
                        value={fields.accentColor ?? ''}
                        onChange={(v) => update('accentColor', v)}
                    />
                </Field>
            </div>

            <Field label="Custom domain" hint="Enterprise only. DNS verification is deferred — enter the host you'll use; we won't switch traffic yet.">
                <input
                    type="text"
                    value={fields.customDomain ?? ''}
                    onChange={(e) => update('customDomain', e.target.value)}
                    className="input"
                    placeholder="meet.your-co.com"
                />
            </Field>

            <Field label="Login screen copy" hint="Optional — short string shown on the login page for users of this org.">
                <textarea
                    rows={3}
                    value={fields.loginScreenCopy ?? ''}
                    onChange={(e) => update('loginScreenCopy', e.target.value)}
                    className="input"
                    placeholder="Welcome back to ACME Health. Sign in with your work email."
                />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Email from name">
                    <input
                        type="text"
                        value={fields.emailFromName ?? ''}
                        onChange={(e) => update('emailFromName', e.target.value)}
                        className="input"
                        placeholder="ACME Health Meetings"
                    />
                </Field>
                <Field label="Email from address">
                    <input
                        type="email"
                        value={fields.emailFromAddress ?? ''}
                        onChange={(e) => update('emailFromAddress', e.target.value)}
                        className="input"
                        placeholder="meetings@your-co.com"
                    />
                </Field>
            </div>

            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            {saved && <div className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</div>}

            <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2.5"
            >
                {busy ? 'Saving…' : 'Save branding'}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="text-sm font-semibold mb-1">{label}</div>
            {hint && <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">{hint}</div>}
            {children}
        </label>
    );
}

function LogoInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const upload = async (file: File) => {
        setUploading(true);
        setError(null);
        try {
            const created = await storage.createFile(BRANDING_BUCKET_ID, ID.unique(), file);
            const url = storage.getFileView(BRANDING_BUCKET_ID, created.$id).toString();
            onChange(url);
        } catch (err: any) {
            setError(err?.message ?? 'Upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                {value && (
                    <img
                        src={value}
                        alt="logo preview"
                        className="h-10 max-w-[160px] object-contain rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2"
                    />
                )}
                <input
                    type="url"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="input"
                    placeholder="https://your-cdn.com/logo.png"
                />
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs whitespace-nowrap hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                    {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(f);
                    }}
                />
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <style jsx>{`
                .input {
                    flex: 1;
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
        </div>
    );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center gap-3">
            <input
                type="color"
                value={value || '#10b981'}
                onChange={(e) => onChange(e.target.value)}
                className="w-12 h-10 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
            />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="input"
                placeholder="#10b981"
            />
            <style jsx>{`
                .input {
                    flex: 1;
                    border-radius: 0.5rem;
                    border: 1px solid rgb(203 213 225);
                    background: white;
                    padding: 0.5rem 0.75rem;
                    font-size: 0.875rem;
                    font-family: ui-monospace, monospace;
                }
                :global(.dark) .input {
                    border-color: rgb(51 65 85);
                    background: rgb(15 23 42);
                    color: rgb(248 250 252);
                }
            `}</style>
        </div>
    );
}
