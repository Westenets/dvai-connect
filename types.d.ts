// Ambient module declarations for side-effect imports that TypeScript
// otherwise can't resolve type-only. Next 16.2.x is strict about
// untyped side-effect imports during `next build`.

/**
 * @livekit/components-styles@1.2.0 ships its `./prefabs` subpath with
 * a broken `exports.types` pointer (`index.scss.d.ts` — note the
 * `.scss`), while the actual file on disk is `index.css.d.ts`. The
 * runtime CSS import works (Next routes it through the CSS pipeline),
 * but the TS resolver fails type-check. Shim it as a side-effect-only
 * module so the type check passes without touching the upstream
 * package.
 */
declare module '@livekit/components-styles/prefabs';
