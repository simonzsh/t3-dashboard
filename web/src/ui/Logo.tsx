// The app mark: four windows, one active. `wave` is the order in which the Loader lights them.
export const LOGO_TILES = [
  { x: 112, y: 112, opacity: 1, wave: 0 },
  { x: 272, y: 112, opacity: 0.35, wave: 1 },
  { x: 112, y: 272, opacity: 0.35, wave: 1 },
  { x: 272, y: 272, opacity: 0.65, wave: 2 },
];

export function Logo() {
  return (
    <svg className="logo" viewBox="104 104 304 304" aria-hidden="true">
      {LOGO_TILES.map(({ x, y, opacity }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="128" height="128" rx="30" fill="currentColor" opacity={opacity} />
      ))}
    </svg>
  );
}
