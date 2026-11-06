import { LOGO_TILES } from "./Logo.tsx";

// The logo: a wave runs across its tiles, from the active one to the opposite corner.

/** `inline`: small, in the text color, for a line of text instead of a whole area. */
export function Loader({ label = "Loading", inline = false }: { label?: string; inline?: boolean }) {
  return (
    <div className={inline ? "loader inline" : "loader"} role="status" aria-label={label}>
      <svg viewBox="112 112 288 288" aria-hidden="true">
        {LOGO_TILES.map(({ x, y, opacity, wave }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="128" height="128" rx="30" opacity={opacity} className={`wave-${wave}`} />
        ))}
      </svg>
    </div>
  );
}
