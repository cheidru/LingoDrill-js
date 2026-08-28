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

- **AudioFile** — uploaded audio file metadata. `derivedFrom` marks a processed copy (see below): hidden from the Audio Library and deleted with its source.
- **SubtitleFile** — text file linked to an audio file
- **SequenceFragment** — time range with `start/end/repeat/speed` + optional subtitle bindings
- **Sequence** — ordered list of `SequenceFragment`s linked to an `AudioFile`
- **FragmentSubtitle** — links a fragment to a character range inside a `SubtitleFile`
- **Fragment** — legacy type kept for backwards compatibility, superseded by `SequenceFragment`

### Processed audio

Trim silence / Normalize volume / Maximize volume write a new WAV, but the sequence does not move: it keeps its id, its label and its place in the original file's sequence list, and only gains `processedAudioId` (plus `processedDuration`) pointing at the new file. So `Sequence.audioId` is the grouping key — which file's list, subtitles and vocabularies it belongs to — while the audio actually played comes from `sequenceAudioId(seq)` in `src/core/domain/sequenceAudio.ts`. Anything loading audio for a sequence must go through that helper.

The processed WAV is stored with `derivedFrom` set to the original file's id, which keeps it out of the Audio Library and deletes it when the original goes. Processing again (trim, then maximize) supersedes the previous copy, which is deleted unless another sequence still plays it.

One consequence: a `.lingodrill` bundle holds exactly one audio file, so exporting from the editor exports the audio currently open and only the sequences that play it; the rest are reported as omitted.

### Subtitle and vocabulary text

A fragment never stores snippet text. `FragmentSubtitle` / `FragmentVocabulary` hold `charStart`/`charEnd` into the one shared `SubtitleFile.content` / `VocabularyFile.content`, and those files are keyed by `audioId` — so every sequence of that audio file reads from the same string. Editing that string therefore moves every binding sitting after the edit, in every sequence.

The editor's Sub / Vocab modal offers "Edit text" alongside plain select-and-bind, but only for the snippet the open fragment is bound to — the textarea holds `content.slice(charStart, charEnd)`, never the whole file, and the button is absent until the fragment has a binding. On save the file becomes "text before + draft + text after", which is exactly the single replaced span `diffText()` reduces to, so all bindings re-base through `rebaseSubtitleBindings()` / `rebaseVocabularyBindings()` in `src/core/domain/textBindings.ts`: the sequence being edited from the live `fragments` state, the rest of the file's sequences straight from storage. Anything else that rewrites one of those files must re-base the same way, or bindings silently slide onto the wrong words.

Two fragments may bind overlapping ranges, and then no re-basing can keep both on their own words — so `findSubtitleOverlap()` / `findVocabularyOverlap()` scan every sequence of the audio file when "Edit text" is clicked, and a hit refuses the edit with a warning naming the sequence it clashed with instead of opening the textarea.

### Background pattern

The page ground is painted by `html` alone — `background-color: var(--color-bg-page)` plus `--bg-ground-image` (`none`, or a gradient mixed from the theme's own primary and accent when `data-bg-ground="gradient"`). The pattern is `html::before` at `z-index: -1`: one black stroke-only SVG tile used as a `mask-image` and tinted with `--color-text`, so a single tile serves all six theme x colour-theme combinations. That z-index puts it after the ground and before every in-flow background, and since cards, rows and modals are opaque, the pattern only shows in the margins.

The consequence to remember: **nothing may paint an opaque background on `html` or `body`** — that is what hides the layer. The neon dark theme's ambient halos are therefore `--bg-ground-image` under `[data-bg-ground="plain"]`, not a `body` background.

The ground colour is `--bg-ground-color`: the chosen `--bg-tint` mixed into `--color-bg-page` at `--bg-tint-strength` (14% light, 16% dark). One hex therefore covers both themes — the same green is pale sage over near-white and deep forest over near-black. Note that `--color-bg-page` itself is never redefined: filled buttons use it as their *text* colour, so tinting it would tint the type inside them.

`BgTint` is the user's own colour, picked with a native colour input in Settings — there is no palette of named tints. What the user does not get to set is how far it carries: `normalizeBgTint()` in `src/utils/settings.ts` keeps the hue but pulls saturation and lightness into the band the mix strength was tuned for (a colour picked as grey stays grey), and the normalised value is what gets stored. Because it is a free colour rather than one of a fixed set, it reaches CSS as a `--bg-tint` custom property set on `<html>` by `applyBgTint()`, not as a `data-` attribute; removing it lets the `:root` default stand and the ground goes back to the theme's own.

All three settings live in `src/utils/settings.ts` (`BgPattern`, `BgGround`, `BgTint`) beside theme and colour theme, and are applied to `<html>` at boot from `App.tsx`. Adding a motif is a `--bg-pattern-<name>` URL and a `[data-bg-pattern="<name>"]::before` rule in `index.css`, plus the name in `AVAILABLE_BG_PATTERNS` and two i18n keys.

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
