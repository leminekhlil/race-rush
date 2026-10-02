/**
 * Resolves a public asset path. Portable builds (static hosts that only serve web media types) store binary
 * assets with an extra `.mp4` suffix: bytes are fetched as ArrayBuffers, so the served content type is irrelevant.
 */
const PORTABLE = import.meta.env.VITE_PORTABLE_ASSETS === '1';

export const assetUrl = (path: string): string => new URL(PORTABLE ? path.replace(/\.(glb|ibl|m4a)$/, '.$1.mp4') : path, document.baseURI).href;
