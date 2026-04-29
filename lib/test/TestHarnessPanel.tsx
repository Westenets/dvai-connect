'use client';

import * as React from 'react';
import { X, FlaskConical } from 'lucide-react';
import { useMaybeRoomContext } from '@livekit/components-react';
import { runTest, TestResult } from './runIntelligenceTest';
import { MOCK_MEETING_ROOM } from './mockMeeting';
import { searchWithLlamaIndex } from '@/lib/rag/llamaindex';
import { useEmbedder, useGemma } from '@/lib/providers/MeetAIProvider';
import { HumanMessage } from '@langchain/core/messages';
import { db } from '@/lib/db';
import { WebSpeechAdapter } from '@/lib/transcription/adapters/webSpeechAdapter';
import { WhisperLocalAdapter } from '@/lib/transcription/adapters/whisperLocalAdapter';
import type { TranscriberAdapter, Tier } from '@/lib/transcription/types';
import { runFullSmokeSuite } from '@/lib/test/smokeSuite';
import type { SmokeReport, StageResult } from '@/lib/test/smokeSuiteTypes';

type RAGResult = { text: string; score: number; id?: any };

interface RAGSearchResult {
    results: RAGResult[];
    answer: string;
    retrievalMs: number;
    generationMs: number;
}

interface ParticipantSummary {
    speaker: string;
    count: number;
}

export interface TestHarnessSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    onClose: () => void;
}

export function TestHarnessSidebar({ onClose, style, className, ...props }: TestHarnessSidebarProps) {
    const room = useMaybeRoomContext();
    const roomName = room?.name || '';
    const { service: embedder } = useEmbedder();
    const { service: gemma, status: gemmaStatus } = useGemma();

    const [testResult, setTestResult] = React.useState<TestResult | null>(null);
    const [isTesting, setIsTesting] = React.useState(false);
    const [participantCheck, setParticipantCheck] = React.useState<ParticipantSummary[]>([]);
    const [isCheckingDB, setIsCheckingDB] = React.useState(false);
    const [ragQuery, setRagQuery] = React.useState('');
    const [ragLoading, setRagLoading] = React.useState(false);
    const [ragResult, setRagResult] = React.useState<RAGSearchResult | null>(null);

    // Tier test state
    const [tierTestRunning, setTierTestRunning] = React.useState(false);
    const [tierTestResults, setTierTestResults] = React.useState<
        Record<string, { ok: boolean; latencyMs?: number; error?: string }>
    >({});

    // Smoke suite state
    const [smokeRunning, setSmokeRunning] = React.useState(false);
    const [smokeStages, setSmokeStages] = React.useState<StageResult[]>([]);
    const [smokeReport, setSmokeReport] = React.useState<SmokeReport | null>(null);
    const [smokeIncludeMic, setSmokeIncludeMic] = React.useState(false);
    const [smokeSkipPipeline, setSmokeSkipPipeline] = React.useState(false);

    const handleRunTest = React.useCallback(async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await runTest();
            setTestResult(result);
        } catch (e) {
            console.error('[TestHarness] runTest failed:', e);
        } finally {
            setIsTesting(false);
        }
    }, []);

    const handleCheckParticipants = React.useCallback(async () => {
        if (!roomName) {
            console.warn('[TestHarness] No room name available.');
            return;
        }
        setIsCheckingDB(true);
        console.log(`[TestHarness] Checking DB transcripts for room: "${roomName}"`);
        try {
            const rows = await db.transcripts.where('room_name').equals(roomName).toArray();
            const speakerMap: Record<string, number> = {};
            for (const row of rows) {
                speakerMap[row.speaker] = (speakerMap[row.speaker] || 0) + 1;
            }
            const summary = Object.entries(speakerMap).map(([speaker, count]) => ({ speaker, count }));
            setParticipantCheck(summary);
            console.log(`[TestHarness] ${rows.length} total rows, ${summary.length} speakers:`, summary);
        } catch (e) {
            console.error('[TestHarness] DB check failed:', e);
        } finally {
            setIsCheckingDB(false);
        }
    }, [roomName]);

    const handleRagSearch = React.useCallback(async () => {
        if (!ragQuery.trim()) return;
        const queryRoom = roomName || MOCK_MEETING_ROOM;
        setRagLoading(true);
        setRagResult(null);
        try {
            console.log(`[TestHarness] Embedding query: "${ragQuery}" (room: "${queryRoom}")`);
            const queryEmbedding = await embedder.embed(ragQuery);

            // 1. Retrieve relevant context
            const t0 = performance.now();
            const results = await searchWithLlamaIndex(queryEmbedding, queryRoom, 5);
            const retrievalMs = Math.round(performance.now() - t0);
            console.log(`[TestHarness] RAG retrieval done in ${retrievalMs}ms, ${results.length} results.`);

            // 2. Generate answer from context via LLM
            let answer = '';
            let generationMs = 0;
            if (results.length > 0) {
                const context = results.map(r => r.text).join('\n');
                const prompt = `Based on the following meeting transcript excerpts, answer the user's question. If the answer is not in the context, say so.\n\nContext:\n${context}\n\nQuestion: ${ragQuery}\n\nAnswer:`;

                const t1 = performance.now();
                await gemma.initialize();
                const model = gemma.getModel();
                const res = await model.invoke([new HumanMessage(prompt)]);
                answer = (res.content as string).trim();
                generationMs = Math.round(performance.now() - t1);
                console.log(`[TestHarness] RAG answer generated in ${generationMs}ms.`);
            }

            setRagResult({ results, answer, retrievalMs, generationMs });
        } catch (e) {
            console.error('[TestHarness] RAG search error:', e);
        } finally {
            setRagLoading(false);
        }
    }, [ragQuery, roomName]);

    const runSmokeSuite = React.useCallback(async () => {
        setSmokeRunning(true);
        setSmokeStages([]);
        setSmokeReport(null);
        try {
            const report = await runFullSmokeSuite({
                includeMicTier: smokeIncludeMic,
                skipAiPipeline: smokeSkipPipeline,
                onProgress: (stage) => {
                    setSmokeStages((prev) => [...prev, stage]);
                },
            });
            setSmokeReport(report);
        } catch (err) {
            console.error('[TestHarness] smoke suite error', err);
        } finally {
            setSmokeRunning(false);
        }
    }, [smokeIncludeMic, smokeSkipPipeline]);

    const downloadSmokeReport = React.useCallback(() => {
        if (!smokeReport) return;
        const blob = new Blob([JSON.stringify(smokeReport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date(smokeReport.timestamp).toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `dvai-smoke-${ts}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [smokeReport]);

    const runTierTest = React.useCallback(async () => {
        setTierTestRunning(true);
        setTierTestResults({});
        let stream: MediaStream | null = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err: any) {
            setTierTestResults({
                _setup: { ok: false, error: `Mic permission denied: ${err?.message ?? 'unknown'}` },
            });
            setTierTestRunning(false);
            return;
        }
        // Skip cloud — requires paid plan. Webspeech + local-whisper are free.
        const adapters: Array<{ name: Tier; build: () => TranscriberAdapter }> = [
            { name: 'web-speech', build: () => new WebSpeechAdapter() },
            { name: 'local-whisper', build: () => new WhisperLocalAdapter() },
        ];
        const out: typeof tierTestResults = {};
        for (const { name, build } of adapters) {
            const adapter = build();
            const t0 = performance.now();
            try {
                const latency = await new Promise<number>((resolve, reject) => {
                    const timeout = setTimeout(
                        () => reject(new Error('no transcript in 20s')),
                        20000,
                    );
                    adapter.onTranscript(() => {
                        clearTimeout(timeout);
                        resolve(performance.now() - t0);
                    });
                    adapter.start(stream!, 'test-user').catch(reject);
                });
                out[name] = { ok: true, latencyMs: Math.round(latency) };
            } catch (err: any) {
                out[name] = { ok: false, error: err?.message ?? 'unknown' };
            } finally {
                try {
                    await adapter.stop();
                } catch {}
            }
            setTierTestResults({ ...out });
        }
        stream.getTracks().forEach((t) => t.stop());
        setTierTestRunning(false);
    }, []);

    return (
        <aside
            className={`w-96 border-l bg-(--lk-bg) border-white/10 flex flex-col h-full z-20 shadow-xl overflow-y-auto ${className || ''}`}
            style={style}
            {...props}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                    <FlaskConical size={18} className="text-violet-400" />
                    <h2 className="text-white text-base font-bold">AI Test Harness</h2>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-transparent border-0">
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 font-mono text-xs">

                {/* === Section 1: Multi-Participant DB Check === */}
                <section>
                    <SectionLabel>Multi-Participant Check</SectionLabel>
                    <p className="text-slate-500 text-[10px] mb-2 leading-relaxed">
                        Join from 2 browsers, click Sim Transcript in both, then check if both speakers appear in DB.
                        {roomName ? <> Checking room: <span className="text-slate-300">&quot;{roomName}&quot;</span>.</> : ' (no room detected)'}
                    </p>
                    <button
                        onClick={handleCheckParticipants}
                        disabled={isCheckingDB || !roomName}
                        className="w-full py-2 px-3 rounded-lg border-0 font-bold uppercase tracking-widest text-[10px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: '#1e3a8a', color: '#93c5fd' }}
                    >
                        {isCheckingDB ? 'Checking...' : 'Check DB Speakers'}
                    </button>
                    {participantCheck.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                            {participantCheck.map(({ speaker, count }) => (
                                <div key={speaker} className="flex justify-between items-center bg-slate-800/60 rounded-md px-3 py-2">
                                    <span className="text-slate-300 truncate">{speaker}</span>
                                    <span className="text-emerald-400 font-bold ml-2 shrink-0">{count} chunks</span>
                                </div>
                            ))}
                            <p className={`mt-1 font-bold text-[10px] ${participantCheck.length >= 2 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                {participantCheck.length >= 2
                                    ? `${participantCheck.length} participants found — multi-capture working!`
                                    : 'Only 1 participant. Ensure second browser is also sim-transcribing.'}
                            </p>
                        </div>
                    )}
                </section>

                <Divider />

                {/* === Section 2: AI Pipeline Test === */}
                <section>
                    <SectionLabel>AI Pipeline Test</SectionLabel>
                    <p className="text-slate-500 text-[10px] mb-2 leading-relaxed">
                        Injects 30 mock utterances, runs LLM extraction (may take several minutes), validates outputs.
                    </p>
                    <button
                        onClick={handleRunTest}
                        disabled={isTesting}
                        className="w-full py-2 px-3 rounded-lg border-0 font-bold uppercase tracking-widest text-[10px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: isTesting ? '#4c1d95' : '#7c3aed', color: '#fff' }}
                    >
                        {isTesting ? 'Running Pipeline Test...' : 'Run AI Pipeline Test'}
                    </button>

                    {testResult && (
                        <div className="mt-3 flex flex-col gap-2">
                            <div className={`rounded-lg px-3 py-2 font-bold text-[10px] border ${testResult.passed ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400' : 'bg-red-900/30 border-red-500/30 text-red-400'}`}>
                                {testResult.passed ? 'PASSED' : 'FAILED'} — {testResult.durationMs}ms
                                {!testResult.passed && (
                                    <ul className="mt-1 pl-3 list-disc text-red-300 font-normal">
                                        {testResult.failures.map((f, i) => <li key={i}>{f}</li>)}
                                    </ul>
                                )}
                            </div>
                            <OutputBlock label="Summary" content={testResult.summary} />
                            <OutputBlock label="Action Items" content={testResult.actionItems} />
                            <OutputBlock label="Questions" content={testResult.questions} />
                        </div>
                    )}
                </section>

                <Divider />

                {/* === Section 3: RAG Search (LlamaIndex) === */}
                <section>
                    <SectionLabel>RAG Search</SectionLabel>
                    <p className="text-slate-500 text-[10px] mb-2 leading-relaxed">
                        Semantic search over transcripts using LlamaIndex + DvAI embeddings. Searches {roomName ? `"${roomName}"` : 'test room'}.
                    </p>
                    <div className="flex gap-2">
                        <input
                            value={ragQuery}
                            onChange={e => setRagQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleRagSearch()}
                            placeholder="e.g. What was assigned to Alex?"
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-[11px] outline-none focus:border-violet-500"
                        />
                        <button
                            onClick={handleRagSearch}
                            disabled={ragLoading || !ragQuery.trim()}
                            className="px-3 py-2 rounded-lg border-0 font-bold text-[10px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            style={{ background: ragLoading ? '#334155' : '#0d9488', color: '#fff' }}
                        >
                            {ragLoading ? '...' : 'Go'}
                        </button>
                    </div>

                    {ragResult && (
                        <div className="mt-3 flex flex-col gap-3">
                            {/* LLM Answer */}
                            {ragResult.answer ? (
                                <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg px-3 py-2">
                                    <div className="text-[9px] font-bold uppercase tracking-wider mb-1 text-indigo-400">
                                        Answer ({ragResult.generationMs}ms)
                                    </div>
                                    <div className="text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                                        {ragResult.answer}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[10px] text-slate-600 italic">No relevant context found.</p>
                            )}

                            {/* Retrieved Context */}
                            {ragResult.results.length > 0 && (
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-wider mb-1 text-slate-500">
                                        Retrieved Context ({ragResult.results.length} chunks, {ragResult.retrievalMs}ms)
                                    </div>
                                    {ragResult.results.map((r, i) => (
                                        <div key={i} className="mb-1 pb-1 border-b border-white/5 last:border-0 last:mb-0 last:pb-0">
                                            <div className="text-[9px] text-slate-600">Score: {r.score.toFixed(4)}</div>
                                            <div className="text-[10px] text-slate-500 leading-relaxed">
                                                {r.text.slice(0, 150)}{r.text.length > 150 ? '...' : ''}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </section>

                <Divider />

                {/* === Section 4: Transcription Tier Test === */}
                <section>
                    <SectionLabel>Transcription Tier Test</SectionLabel>
                    <p className="text-slate-500 text-[10px] mb-2 leading-relaxed">
                        Tries each transcription tier against your live mic.
                        Reports time-to-first-transcript for each. Cloud tier
                        is skipped (paid). Speak naturally for 5–10s after
                        clicking.
                    </p>
                    <button
                        onClick={runTierTest}
                        disabled={tierTestRunning}
                        className="w-full py-2 px-3 rounded-lg border-0 font-bold uppercase tracking-widest text-[10px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: tierTestRunning ? '#374151' : '#0891b2', color: '#fff' }}
                    >
                        {tierTestRunning ? 'Testing tiers…' : 'Run Tier Test'}
                    </button>
                    {Object.keys(tierTestResults).length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                            {Object.entries(tierTestResults).map(([tier, r]) => (
                                <div
                                    key={tier}
                                    className="flex justify-between items-center bg-slate-800/60 rounded-md px-3 py-2"
                                >
                                    <span className="text-slate-300">{tier}</span>
                                    {r.ok ? (
                                        <span className="text-emerald-400 font-bold">
                                            {r.latencyMs}ms first
                                        </span>
                                    ) : (
                                        <span className="text-red-400 text-[10px] truncate ml-2">
                                            {r.error}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <Divider />

                {/* === Section 5: Full Smoke Suite === */}
                <section>
                    <SectionLabel>Full Smoke Suite</SectionLabel>
                    <p className="text-slate-500 text-[10px] mb-2 leading-relaxed">
                        Runs every AI subsystem in sequence (embedder, Gemma,
                        ingest, RAG, optional pipeline). Captures latency +
                        heap deltas, applies device-class thresholds.
                    </p>
                    <div className="flex flex-col gap-1.5 mb-2">
                        <label className="flex items-center gap-2 text-slate-400 text-[10px]">
                            <input
                                type="checkbox"
                                checked={smokeIncludeMic}
                                onChange={(e) => setSmokeIncludeMic(e.target.checked)}
                                disabled={smokeRunning}
                            />
                            Include live-mic transcription tier check
                        </label>
                        <label className="flex items-center gap-2 text-slate-400 text-[10px]">
                            <input
                                type="checkbox"
                                checked={smokeSkipPipeline}
                                onChange={(e) => setSmokeSkipPipeline(e.target.checked)}
                                disabled={smokeRunning}
                            />
                            Skip full AI pipeline (faster)
                        </label>
                    </div>
                    <button
                        onClick={runSmokeSuite}
                        disabled={smokeRunning}
                        className="w-full py-2 px-3 rounded-lg border-0 font-bold uppercase tracking-widest text-[10px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: smokeRunning ? '#374151' : '#be185d', color: '#fff' }}
                    >
                        {smokeRunning ? 'Running smoke suite…' : 'Run Full Smoke Suite'}
                    </button>

                    {smokeStages.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1">
                            {smokeStages.map((s, idx) => {
                                const color =
                                    s.status === 'pass'
                                        ? 'text-emerald-400'
                                        : s.status === 'warn'
                                            ? 'text-yellow-400'
                                            : s.status === 'fail'
                                                ? 'text-red-400'
                                                : 'text-slate-500';
                                const heap = s.deltaHeapBytes
                                    ? ` ΔΉ ${(s.deltaHeapBytes / (1024 * 1024)).toFixed(1)}MB`
                                    : '';
                                return (
                                    <div
                                        key={`${s.name}-${idx}`}
                                        className="flex justify-between items-start bg-slate-800/60 rounded-md px-3 py-2"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-slate-300 text-[11px]">{s.name}</span>
                                            {s.message && (
                                                <span className="text-slate-500 text-[9px] mt-0.5 max-w-[180px] truncate">
                                                    {s.message}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`${color} font-bold text-[10px] text-right`}>
                                            {s.status.toUpperCase()}
                                            <br />
                                            <span className="text-slate-400 font-normal">
                                                {s.durationMs > 0 ? `${Math.round(s.durationMs)}ms` : '—'}
                                                {heap}
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {smokeReport && (
                        <div className="mt-3 flex flex-col gap-2">
                            <div
                                className={`rounded-lg px-3 py-2 font-bold text-[10px] border ${
                                    smokeReport.overall === 'pass'
                                        ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400'
                                        : smokeReport.overall === 'pass-with-warnings'
                                            ? 'bg-yellow-900/30 border-yellow-500/30 text-yellow-400'
                                            : 'bg-red-900/30 border-red-500/30 text-red-400'
                                }`}
                            >
                                {smokeReport.overall.toUpperCase()} — total {Math.round(smokeReport.durationMs)}ms
                            </div>
                            <button
                                onClick={downloadSmokeReport}
                                className="py-1.5 px-3 rounded-lg border border-slate-700 text-slate-300 text-[10px] hover:bg-slate-800 transition-colors"
                            >
                                Download JSON Report
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </aside>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <h3 className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-2">{children}</h3>;
}

function Divider() {
    return <div className="border-t border-white/8" />;
}

function OutputBlock({ label, content }: { label: string; content: string }) {
    if (!content) return null;
    return (
        <div>
            <div className="text-[10px] font-bold text-slate-400 mb-1">{label}</div>
            <div className="bg-slate-800 rounded-lg px-3 py-2 text-[10px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                {content}
            </div>
        </div>
    );
}
