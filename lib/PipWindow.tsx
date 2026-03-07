'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface PipWindowProps {
    children: React.ReactNode;
    pipWindow: Window;
    onClose: () => void;
}

/**
 * A component that renders its children into an existing Document Picture-in-Picture window.
 */
export function PipWindow({ children, pipWindow, onClose }: PipWindowProps) {
    useEffect(() => {
        if (!pipWindow) return;

        // 1. Copy styles from the main document to the PiP window
        const allStyles = Array.from(document.styleSheets);
        allStyles.forEach((styleSheet) => {
            try {
                if (styleSheet.cssRules) {
                    const newStyle = pipWindow.document.createElement('style');
                    Array.from(styleSheet.cssRules).forEach((rule) => {
                        newStyle.appendChild(pipWindow.document.createTextNode(rule.cssText));
                    });
                    pipWindow.document.head.appendChild(newStyle);
                } else if (styleSheet.href) {
                    const newLink = pipWindow.document.createElement('link');
                    newLink.rel = 'stylesheet';
                    newLink.href = styleSheet.href;
                    pipWindow.document.head.appendChild(newLink);
                }
            } catch (e) {
                // Handle cross-origin styles
                if (styleSheet.href) {
                    const newLink = pipWindow.document.createElement('link');
                    newLink.rel = 'stylesheet';
                    newLink.href = styleSheet.href;
                    pipWindow.document.head.appendChild(newLink);
                }
            }
        });

        // 2. Copy CSS variables from the main document
        const sourceElement = document.documentElement;
        const targetElement = pipWindow.document.documentElement;

        // Copy classes and dataset from the root element
        targetElement.className = sourceElement.className;
        Object.assign(targetElement.dataset, sourceElement.dataset);

        // Copy computed styles (includes all variables)
        const computedStyles = window.getComputedStyle(sourceElement);
        Array.from(computedStyles).forEach((key) => {
            if (key.startsWith('--')) {
                targetElement.style.setProperty(key, computedStyles.getPropertyValue(key));
            }
        });

        // 3. Set body classes and styles for consistent UI
        pipWindow.document.body.className = document.body.className;
        pipWindow.document.body.style.backgroundColor = getComputedStyle(
            document.body,
        ).backgroundColor;
        pipWindow.document.body.style.margin = '0';
        pipWindow.document.body.style.padding = '0';
        pipWindow.document.body.style.height = '100vh';
        pipWindow.document.body.style.overflow = 'hidden';

        const handleUnload = () => {
            onClose();
        };

        pipWindow.addEventListener('pagehide', handleUnload);
        pipWindow.addEventListener('unload', handleUnload);

        return () => {
            pipWindow.removeEventListener('pagehide', handleUnload);
            pipWindow.removeEventListener('unload', handleUnload);
            // Window closure is handled by the parent
        };
    }, [pipWindow, onClose]);

    // Render the children into the PiP window using a portal
    return createPortal(children, pipWindow.document.body);
}
