'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import * as React from 'react';

// Map routes to levels to determine transition direction
const getRouteLevel = (path: string): number => {
    if (!path) return 0;
    if (path === '/') return 0;
    if (path.startsWith('/login')) return 1;
    if (path.startsWith('/rooms/')) return 1;
    if (path === '/settings') return 1;
    if (path.startsWith('/settings/')) return 2;
    return 0;
};

export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [prevPath, setPrevPath] = React.useState<string>(pathname);
    const [direction, setDirection] = React.useState<number>(1);

    // Track the direction based on route depth
    React.useMemo(() => {
        if (prevPath !== pathname) {
            const prevLevel = getRouteLevel(prevPath);
            const currentLevel = getRouteLevel(pathname);

            if (currentLevel > prevLevel) {
                setDirection(1);
            } else if (currentLevel < prevLevel) {
                setDirection(-1);
            } else {
                setDirection(pathname.length > prevPath.length ? 1 : -1);
            }
            setPrevPath(pathname);
        }
    }, [pathname, prevPath]);

    const variants = {
        enter: (dir: number) => ({
            x: dir > 0 ? '100%' : '-100%',
            opacity: 0,
        }),
        center: {
            x: 0,
            opacity: 1,
            zIndex: 1,
        },
        exit: (dir: number) => ({
            x: dir > 0 ? '-100%' : '100%',
            opacity: 0,
            zIndex: 0,
        }),
    };

    return (
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
                key={pathname}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                    x: {
                        duration: 0.4,
                        ease: [0.22, 1, 0.36, 1], // easeOutQuart: starts fast, slows down elegantly
                    },
                    opacity: {
                        duration: 0.3,
                        ease: 'linear',
                    },
                }}
                className="w-full h-full flex flex-col overflow-hidden"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
