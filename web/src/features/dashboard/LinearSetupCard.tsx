import { KEY_PATH, KEY_URL } from "../settings/linearSettings.ts";
import { LinearKeyForm } from "../settings/LinearKeyForm.tsx";

export function LinearSetupCard({ refused, onConnected }: { refused: boolean; onConnected: () => void }) {
  return (
    <section className="linear-card" aria-labelledby="linear-setup-title">
      <h2 id="linear-setup-title">Connect Linear to see the issues assigned to you</h2>
      {refused && <p className="error">Linear refused the saved key. Create a new key and connect again.</p>}
      <p>
        Create a key in Linear: <strong>{KEY_PATH.join(" → ")}</strong>.
      </p>
      <a href={KEY_URL} target="_blank" rel="noreferrer">
        Open Linear security settings
      </a>
      <LinearKeyForm button="Connect" onSaved={onConnected} />
      <small>The key stays on this computer. The dashboard never shows it again.</small>
    </section>
  );
}
