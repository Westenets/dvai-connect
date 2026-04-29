/**
 * Stub for @westenets/dvai-bridge-capacitor.
 *
 * The real package is the Capacitor (iOS/Android native) transport for
 * dvai-bridge. The web app never selects `transport: "capacitor"`, but the
 * compiled dist of @westenets/dvai-bridge-core contains a static import of
 * this module that webpack/Turbopack can't tree-shake. Aliasing to this
 * empty stub satisfies the bundler without pulling in the real (and
 * unpublished, mobile-only) package.
 *
 * If this stub is ever actually invoked at runtime, something is configured
 * wrong — log loudly so it surfaces.
 */

const STUB_ERROR = new Error(
    "[dvai-bridge-capacitor stub] Capacitor transport is not available in the meet web app. " +
        "Set transport: 'auto' or 'msw' in DVAI config.",
);

const handler: ProxyHandler<object> = {
    get(_target, prop) {
        if (prop === Symbol.toPrimitive || prop === "toString" || prop === "then") {
            return undefined;
        }
        throw STUB_ERROR;
    },
};

export default new Proxy({}, handler);
