import { severityOf } from "./meter.ts";

interface Props {
  /** 0..100. */
  percent: number;
  /** The text a screen reader gets; the tooltip repeats it. */
  label: string;
  /** Where a tick sits on the track, 0..100. */
  tick?: number | null;
}

export function Meter({ percent, label, tick }: Props) {
  const width = Math.round(Math.min(100, Math.max(0, percent)));
  return (
    <div className={`meter ${severityOf(percent)}`} role="img" aria-label={label} data-tooltip={label}>
      <span className="meter-fill" style={{ width: `${width}%` }} aria-hidden="true" />
      {tick != null && <span className="meter-tick" style={{ left: `${tick}%` }} aria-hidden="true" />}
    </div>
  );
}
