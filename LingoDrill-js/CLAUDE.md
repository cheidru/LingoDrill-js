# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server (Vite)
npm run build      # TypeScript check + Vite production build
npm run lint       # ESLint
npm run preview    # preview production build locally
npm run deploy     # build + publish to GitHub Pages (gh-pages -d dist)
```

There is no test framework in this project.

## Architecture

LingoDrill is a React + Vite + TypeScript SPA for language learning via audio fragment drilling. It is deployed to GitHub Pages at `/LingoDrill-js` (basename is hardcoded in `App.tsx`).

### Layers

```
src/core/          — pure domain types and interfaces (no React, no browser APIs)
src/infrastructure/ — browser API implementations (IndexedDB, Web Audio, HTML Audio)
src/app/           — React hooks, context, components
src/pages/         — top-level page components (one per route)
src/utils/         — stateless utility functions
```

### Routes (defined in `src/app/App.tsx`)

| Path | Page | Purpose |
|---|---|---|
| `/` | `LibraryPage` | Upload/select audio files |
| `/file/:id/sequences` | `FragmentLibraryPage` | List and manage sequences |
| `/file/:id/editor` | `FragmentEditorPage` | Create/edit a sequence |
| `/file/:id/editor/:seqId` | `FragmentEditorPage` | Edit existing sequence |
| `/file/:id/player/:seqId` | `SequencePlayerPage` | Play back a sequence |

### Domain types (`src/core/domain/types.ts`)

- **AudioFile** — uploaded audio file metadata
- **SubtitleFile** — text file linked to an audio file
- **SequenceFragment** — time range with `start/end/repeat/speed` + optional subtitle bindings
- **Sequence** — ordered list of `SequenceFragment`s linked to an `AudioFile`
- **FragmentSubtitle** — links a fragment to a character range inside a `SubtitleFile`
- **Fragment** — legacy type kept for backwards compatibility, superseded by `SequenceFragment`

### Dual audio engine

`useAudioEngine` (`src/app/hooks/useAudioEngine.ts`) manages two engines in parallel:

- **`HtmlAudioEngine`** (`src/infrastructure/audio/htmlAudioEngine.ts`) — wraps `HTMLAudioElement`. Used for whole-file playback. Loads instantly via an Object URL (no decode needed).
- **`WebAudioEngine`** (`src/infrastructure/audio/webAudioEngine.ts`) — wraps `Web Audio API`. Used for fragment playback (precise start/end, repeat, speed). Requires a decoded `AudioBuffer`.

On `loadById`, the HTML engine loads first so playback is immediately available. The Web Audio engine decodes in the background via **chunked decode** (`src/infrastructure/audio/chunkedDecode.ts`), splitting the file into ~30s byte slices with watchdog timeouts to avoid mobile OOM crashes. The decoded `AudioBuffer` is cached in memory keyed by file id. `isReady` becomes true after HTML load; `isFragmentsReady` becomes true after Web Audio decode completes.

`activeEngineRef` tracks which engine is currently driving playback (`"html"` or `"web"`). Calling `playFragment()` switches to `"web"`; calling `play()` switches back to `"html"`.

### Shared audio state

`AudioEngineProvider` (`src/app/contexts/AudioEngineContext.tsx`) wraps the whole app and exposes a single `AudioEngineContextType` combining the engine state with the audio file library. All pages access it via `useSharedAudioEngine()`.

The audio file library is managed by `useAudioLibrary` (`src/app/hooks/useAudioLibrary.ts`) and sequences/subtitles by `useSequences` / `useSubtitles` hooks — all backed by IndexedDB.

### Persistence (IndexedDB)

Database: `"language-trainer"` (current version: 4), opened in `src/infrastructure/indexeddb/db.ts`.

Object stores: `audioMeta`, `audioBlobs`, `subtitleFiles`, `fragments`, `sequences`, `waveformCache`.

Each domain concept has its own storage class in `src/infrastructure/indexeddb/`.

### Bundle format

Export/import of a full dataset as a `.lingodrill` file (JSON with base64-encoded audio). Implemented in `src/core/bundle/exportBundle.ts` and `importBundle.ts`. Contains: manifest (version, audio metadata, waveform data, sequences, subtitle files) + optional base64 audio.
