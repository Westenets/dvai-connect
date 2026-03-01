'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { account } from '@/lib/appwrite';
import { ID, AppwriteException } from 'appwrite';

export default function LoginPage() {
  const router = useRouter();
  const { user, checkSession } = useAuth();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegistering) {
        await account.create(ID.unique(), email, password, name || undefined);
        // Automatically log in after registration
        await account.createEmailPasswordSession(email, password);
      } else {
        await account.createEmailPasswordSession(email, password);
      }

      await checkSession();
      router.push('/');
    } catch (err: any) {
      if (err instanceof AppwriteException) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#f5f7f8] dark:bg-[#101922] font-['Inter',_sans-serif] min-h-screen flex flex-col antialiased">
      {/* Navbar (Simplified for Login Context) */}
      <header className="flex items-center justify-between px-6 py-4 w-full absolute top-0 left-0 z-10">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <div className="size-8 text-[#258cf4] flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">videocam</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">VideoConf</h2>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {isRegistering ? 'Already have an account?' : 'New to VideoConf?'}
          </span>
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError(null);
            }}
            className="text-[#258cf4] text-sm font-bold hover:underline"
          >
            {isRegistering ? 'Log In' : 'Sign Up'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center p-4 relative overflow-hidden">
        {/* Abstract Background Pattern */}
        <div
          className="absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 50%, rgba(37, 140, 244, 0.08) 0%, transparent 25%), radial-gradient(circle at 85% 30%, rgba(37, 140, 244, 0.08) 0%, transparent 25%)',
          }}
        ></div>

        {/* Login Card */}
        <div className="w-full max-w-[440px] bg-white dark:bg-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 z-10 overflow-hidden border border-slate-100 dark:border-slate-700">
          <div className="p-8 sm:p-10 flex flex-col gap-6">
            {/* Header */}
            <div className="text-center mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                {isRegistering ? 'Create your account' : 'Welcome back'}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-base">
                {isRegistering
                  ? 'Sign up to start your video meetings'
                  : 'Log in to start your video meetings'}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-200">
                {error}
              </div>
            )}

            {/* Email Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isRegistering && (
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-sm font-semibold text-slate-700 dark:text-slate-300"
                    htmlFor="name"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <input
                      className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-[#258cf4]/20 focus:border-[#258cf4] transition-all placeholder:text-slate-400"
                      id="name"
                      name="name"
                      placeholder="Jane Doe"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={isRegistering}
                    />
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                      person
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label
                  className="text-sm font-semibold text-slate-700 dark:text-slate-300"
                  htmlFor="email"
                >
                  Email address
                </label>
                <div className="relative">
                  <input
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-[#258cf4]/20 focus:border-[#258cf4] transition-all placeholder:text-slate-400"
                    id="email"
                    name="email"
                    placeholder="name@company.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                    mail
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label
                    className="text-sm font-semibold text-slate-700 dark:text-slate-300"
                    htmlFor="password"
                  >
                    Password
                  </label>
                  {!isRegistering && (
                    <a
                      className="text-xs font-medium text-[#258cf4] hover:text-[#258cf4]/80"
                      href="#"
                    >
                      Forgot password?
                    </a>
                  )}
                </div>
                <div className="relative">
                  <input
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-[#258cf4]/20 focus:border-[#258cf4] transition-all placeholder:text-slate-400"
                    id="password"
                    name="password"
                    placeholder={isRegistering ? 'Create a strong password' : 'Enter your password'}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                    lock
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full h-11 bg-[#258cf4] text-white font-bold rounded-lg hover:bg-[#258cf4]/90 focus:ring-4 focus:ring-[#258cf4]/30 transition-all text-sm shadow-md shadow-[#258cf4]/20 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Please wait...' : isRegistering ? 'Sign Up' : 'Log In'}
              </button>
            </form>
          </div>

          {/* Footer Area */}
          <div className="bg-slate-50 dark:bg-slate-700/30 px-8 py-4 text-center border-t border-slate-100 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
              <button
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError(null);
                }}
                className="text-[#258cf4] font-bold hover:underline bg-transparent border-none cursor-pointer"
              >
                {isRegistering ? 'Log in instead' : 'Sign up for free'}
              </button>
            </p>
          </div>
        </div>

        {/* Mobile Footer Links */}
        <div className="sm:hidden mt-8 text-center text-xs text-slate-400">
          <a className="hover:text-slate-600 dark:hover:text-slate-300 mx-2" href="#">
            Privacy
          </a>
          <a className="hover:text-slate-600 dark:hover:text-slate-300 mx-2" href="#">
            Terms
          </a>
          <a className="hover:text-slate-600 dark:hover:text-slate-300 mx-2" href="#">
            Help
          </a>
        </div>
      </main>
    </div>
  );
}
