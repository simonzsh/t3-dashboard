import { providerKind } from "../agents.ts";

// Hand-drawn marks (a starburst and a six-petal knot) so no brand asset is bundled.
const RAYS = [0, 32, 70, 105, 140, 180, 215, 250, 290, 325];

export function ProviderIcon({ provider }: { provider: string }) {
  const kind = providerKind(provider);
  const label = kind === "claude" ? "Claude" : kind === "codex" ? "Codex" : provider;
  return (
    <svg className={`provider-icon ${kind}`} viewBox="0 0 24 24" role="img" aria-label={label}>
      <title>{label}</title>
      {kind === "claude" && (
        <g stroke="#d97757" strokeWidth="2.4" strokeLinecap="round">
          {RAYS.map((a) => (
            <line key={a} x1="12" y1="3" x2="12" y2="8.5" transform={`rotate(${a} 12 12)`} />
          ))}
        </g>
      )}
      {kind === "codex" && (
        <g fill="none" stroke="currentColor" strokeWidth="1.7">
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse key={a} cx="12" cy="7" rx="3.3" ry="5" transform={`rotate(${a} 12 12)`} />
          ))}
        </g>
      )}
      {kind === "other" && <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="2" />}
    </svg>
  );
}
