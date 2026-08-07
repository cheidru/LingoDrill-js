// app/components/helpTopics.ts
//
// The Help window's table of contents. Kept out of HelpMocks.tsx so that file
// exports nothing but components.

export type HelpTopic =
  | "library"
  | "sequences"
  | "editor"
  | "player"
  | "favourites"
  | "settings"
  | "about"

/* `width` is the width each mock is laid out at before it is scaled into the
   shot frame. `marks` is how many `data-help` badges it carries, and drives the
   explanation list — so a mock and its copy cannot fall out of step. */
export const HELP_TOPICS: { key: HelpTopic; width: number; marks: number }[] = [
  { key: "library", width: 600, marks: 6 },
  { key: "sequences", width: 620, marks: 6 },
  { key: "editor", width: 640, marks: 7 },
  { key: "player", width: 720, marks: 7 },
  { key: "favourites", width: 620, marks: 4 },
  { key: "settings", width: 620, marks: 7 },
  { key: "about", width: 560, marks: 4 },
]
