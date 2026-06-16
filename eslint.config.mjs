// Flat ESLint config — Next.js 16 removed `next lint`, so the
// `pnpm lint` script now invokes the `eslint` binary directly and
// reads this file.
//
// `eslint-config-next` v16 ships as a `Linter.Config[]` array
// (the modern flat-config shape), so we spread it and append our
// own ignore patterns / overrides.

import nextConfig from 'eslint-config-next';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
    {
        ignores: [
            '.next/**',
            'out/**',
            'dist/**',
            'build/**',
            'node_modules/**',
            'public/**',
            'coverage/**',
            'next-env.d.ts',
            '*.tsbuildinfo',
        ],
    },
    ...nextConfig,
    {
        // Flat-config scopes rules to plugins declared in the SAME
        // config object. eslint-config-next loads these plugins in
        // its own entries; we re-declare them here so the rule
        // overrides below are recognized.
        plugins: {
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
        },
        // eslint-plugin-react@7.37.5 (transitive of eslint-config-next)
        // calls `context.getFilename()` during React-version auto-detect.
        // Pin the version explicitly so that codepath is skipped — it
        // mattered for the failed ESLint 10 attempt, harmless on 9.
        settings: {
            react: { version: '19.2.4' },
        },
        rules: {
            // React 19's eslint-plugin-react-hooks introduces a batch of
            // advisory rules (set-state-in-effect, set-state-in-render,
            // immutability, preserve-manual-memoization) that fire on
            // patterns common in pre-19 code. Demote to warn so they
            // surface as TODOs without blocking CI. Genuine correctness
            // rules like react-hooks/rules-of-hooks stay errors.
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/set-state-in-render': 'warn',
            'react-hooks/preserve-manual-memoization': 'warn',
            'react-hooks/immutability': 'warn',
            // Decorative JSX entities (apostrophes in copy, etc.) — the
            // strict-mode escape suggestion is noise, not safety.
            'react/no-unescaped-entities': 'off',
            // Anonymous one-off components are fine; don't gate CI on them.
            'react/display-name': 'warn',
        },
    },
];
