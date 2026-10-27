// A string is a stroked path; `{ solid }` is a filled path without stroke.
type Part = string | { solid: string };

// Icon paths from Lucide (ISC), plus the assign robot and the stop square.
const ICONS = {
  chevron: ["m6 9 6 6 6-6"],
  brain: [
    "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
    "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
    "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4",
    "M17.599 6.5a3 3 0 0 0 .399-1.375M6.003 5.125A3 3 0 0 0 6.401 6.5M3.477 10.896a4 4 0 0 1 .585-.396M19.938 10.5a4 4 0 0 1 .585.396M6 18a4 4 0 0 1-1.967-.516M19.967 17.484A4 4 0 0 1 18 18",
  ],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z", "M7 11V7a5 5 0 0 1 10 0v4"],
  unlock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z", "M7 11V7a5 5 0 0 1 9.9-1"],
  paperclip: ["m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"],
  arrowUp: ["M12 19V5", "m5 12 7-7 7 7"],
  arrowUpRight: ["M7 7h10v10", "M7 17 17 7"],
  arrowDown: ["M12 5v14", "m19 12-7 7-7-7"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  check: ["M20 6 9 17l-5-5"],
  archive: ["M21 8v13H3V8", "M1 3h22v5H1z", "M10 12h4"],
  unarchive: ["M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", "M4 8v11a2 2 0 0 0 2 2h2", "M20 8v11a2 2 0 0 1-2 2h-2", "m9 15 3-3 3 3", "M12 12v9"],
  pin: ["M12 17v5", "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"],
  search: ["m21 21-4.34-4.34", "M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"],
  plus: ["M12 5v14", "M5 12h14"],
  clock: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z", "M12 6v6l4 2"],
  minimize: ["M6 18h12"],
  fullscreen: ["M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"],
  exitFullscreen: ["M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"],
  pencil: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
  logOut: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
  settings: [
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ],
  refresh: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  thinking: [
    "M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0-1 5 3 3 0 0 0 2 5 3 3 0 0 0 5 1.5A2 2 0 0 0 12 18ZM12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 1 5 3 3 0 0 1-2 5 3 3 0 0 1-5 1.5 2 2 0 0 1-2-1.5ZM12 5v13",
  ],
  terminal: ["m4 17 6-6-6-6M12 19h8"],
  wrench: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"],
  edit: ["M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"],
  bot: ["M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM2 14h2M20 14h2M15 13v2M9 13v2"],
  assignBot: [
    "M5 9h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 9Z",
    "M9 9V6M1 13.5v2M17 13.5v2",
    "M10.2 4.8a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z",
    { solid: "M7.8 13.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" },
    { solid: "M13.2 13.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" },
    "M7 16.4h4",
    "M20 3v6M17 6h6",
  ],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M10 11v6", "M14 11v6"],
  stop: [{ solid: "M9 7h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" }],
} satisfies Record<string, Part[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  /** Names the icon for assistive tech; without it the icon is hidden. */
  label?: string;
}

export function Icon({ name, className = "icon", strokeWidth = 2, label }: IconProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg className={className} viewBox="0 0 24 24" {...a11y}>
      {label && <title>{label}</title>}
      {(ICONS[name] as Part[]).map((part) =>
        typeof part === "string" ? (
          <path key={part} d={part} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={part.solid} d={part.solid} fill="currentColor" />
        ),
      )}
    </svg>
  );
}
