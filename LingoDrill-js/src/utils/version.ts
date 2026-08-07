// utils/version.ts
//
// Single source for the version string shown in the About menu. Kept separate
// from package.json's version, which npm rewrites on publish and which nothing
// in the built bundle can read without a build-time define.

export const APP_VERSION = "0.0.01"
