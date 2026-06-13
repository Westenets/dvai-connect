/**
 * Browser stub for Node's `fs/promises`.
 *
 * @dvai-bridge/core@4.0.2 imports `fs/promises` statically for license file
 * reading on Node hosts. The browser bundle never reaches those code paths
 * (the runtime selects a transport that doesn't touch the filesystem), but
 * Turbopack/webpack still try to resolve the import at build time.
 *
 * This stub satisfies the bundler. If any function ever IS called at
 * runtime, it throws — that would mean the bridge is misconfigured (running
 * a Node-only code path in a browser).
 */

const NEVER = (name: string) => () => {
    throw new Error(
        `[node-fs-promises stub] fs/promises.${name} was called at runtime in a ` +
            `browser bundle. This indicates the bridge is taking a Node-only code path ` +
            `(license file loading, etc.) on the web. Set DVAI_LICENSE_TOKEN or use ` +
            `licenseToken (inline JWT) instead of licenseKeyPath.`,
    );
};

export const readFile = NEVER('readFile');
export const writeFile = NEVER('writeFile');
export const stat = NEVER('stat');
export const access = NEVER('access');
export const mkdir = NEVER('mkdir');
export const readdir = NEVER('readdir');
export const unlink = NEVER('unlink');
export const rm = NEVER('rm');
export const open = NEVER('open');
export const realpath = NEVER('realpath');

export default {
    readFile, writeFile, stat, access, mkdir, readdir, unlink, rm, open, realpath,
};
