import { Loader } from "../../ui/index.ts";

/** A settings row while its data loads or failed to load: the title stays, a small loader holds the controls slot. */
export function SettingsRowPending({ title, error }: { title: string; error?: string | false }) {
  return (
    <div className="settings-row">
      <span>{title}</span>
      <span className="linear-controls">{error ? <span className="linear-status muted">{error}</span> : <Loader inline label={`Loading ${title}`} />}</span>
    </div>
  );
}
