'use client';

import React from 'react';

export const Footer: React.FC = () => {
    return (
        <footer className="text-center py-4 text-slate-400 dark:text-slate-600 text-sm mt-auto">
            <p>
                © {new Date().getFullYear()}{' '}
                <a 
                    href="https://deepvoiceai.co" 
                    rel="noopener" 
                    target="_blank"
                    className="hover:text-[#00a8a8] transition-colors"
                >
                    Deep Voice AI Limited
                </a>
                . All rights reserved.
            </p>
        </footer>
    );
};
