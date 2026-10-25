// The dashboard logo, breathing.
const RAYS = [0, 32, 70, 105, 140, 180, 215, 250, 290, 325];

/** `inline`: small, in the text color, for a line of text instead of a whole area. */
export function Loader({ label = "Loading", inline = false }: { label?: string; inline?: boolean }) {
  return (
    <div className={inline ? "loader inline" : "loader"} role="status" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {RAYS.map((angle) => (
          <line key={angle} x1="12" y1="3" x2="12" y2="8.5" transform={`rotate(${angle} 12 12)`} />
        ))}
      </svg>
    </div>
  );
}
