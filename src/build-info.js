export const APP_VERSION = '0.3.12-dev';
export const BUILD_INFO = Object.freeze({
  version: APP_VERSION,
  sourceCommit: import.meta.env?.VITE_BUILD_COMMIT || 'unknown',
  sourceDirty: import.meta.env?.VITE_BUILD_DIRTY ?? null,
});
