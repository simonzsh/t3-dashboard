// The app mark: four windows, one active. Same tiles as the favicon (scripts/icons.ts).
const TILES = [
  { x: 112, y: 112, opacity: 1 },
  { x: 272, y: 112, opacity: 0.35 },
  { x: 112, y: 272, opacity: 0.35 },
  { x: 272, y: 272, opacity: 0.65 },
];

export function Logo({ className = "logo" }: { className?: string }) {
  return (
    <svg className={className} viewBox="104 104 304 304" aria-hidden="true">
      {TILES.map(({ x, y, opacity }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="128" height="128" rx="30" fill="currentColor" opacity={opacity} />
      ))}
    </svg>
  );
}
