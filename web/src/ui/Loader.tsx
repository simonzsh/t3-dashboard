// The dashboard logo, breathing.
const RAYS = [0, 32, 70, 105, 140, 180, 215, 250, 290, 325];

export function Loader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {RAYS.map((angle) => (
          <line key={angle} x1="12" y1="3" x2="12" y2="8.5" transform={`rotate(${angle} 12 12)`} />
        ))}
      </svg>
    </div>
  );
}
