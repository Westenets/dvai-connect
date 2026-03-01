import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#f5f7f8] dark:bg-[#101922] font-['Inter',_sans-serif]">
      <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-700">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">404 - Not Found</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Could not find the requested resource.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-2.5 bg-[#258cf4] text-white font-bold rounded-lg hover:bg-[#258cf4]/90 transition-all text-sm shadow-md shadow-[#258cf4]/20"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
