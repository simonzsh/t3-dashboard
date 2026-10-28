// The Desk logo: a wave runs across its windows, from the active one to the opposite corner.
const TILES = [
  { x: 112, y: 112, opacity: 1, wave: 0 },
  { x: 272, y: 112, opacity: 0.35, wave: 1 },
  { x: 112, y: 272, opacity: 0.35, wave: 1 },
  { x: 272, y: 272, opacity: 0.65, wave: 2 },
];

/** `inline`: small, in the text color, for a line of text instead of a whole area. */
export function Loader({ label = "Loading", inline = false }: { label?: string; inline?: boolean }) {
  return (
    <div className={inline ? "loader inline" : "loader"} role="status" aria-label={label}>
      <svg viewBox="112 112 288 288" aria-hidden="true">
        {TILES.map(({ x, y, opacity, wave }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="128" height="128" rx="30" opacity={opacity} className={`wave-${wave}`} />
        ))}
      </svg>
    </div>
  );
}
