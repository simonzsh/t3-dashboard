import type { ConnectionStatus } from "../../../../shared/api.ts";
import { Loader } from "../../ui/index.ts";

export function ConnectionBanner({ connection, sseDown }: { connection: ConnectionStatus | null; sseDown: boolean }) {
  const messages: Array<{ text: string; retrying: boolean }> = [];
  if (sseDown) messages.push({ text: "Dashboard connection lost. Reconnecting…", retrying: true });
  if (connection && connection.t3 !== "live") {
    const label = connection.t3 === "connecting" ? "Connecting to T3 Code…" : "T3 Code is offline.";
    messages.push({ text: connection.error ? `${label} ${connection.error}` : label, retrying: connection.t3 === "connecting" });
  }
  if (connection?.protocolMismatch) {
    messages.push({ text: `Unexpected T3 Code protocol version${connection.serverVersion ? ` (server ${connection.serverVersion})` : ""}. Some actions may fail.`, retrying: false });
  }
  if (messages.length === 0) return null;
  return (
    <div className="banner" role="alert">
      {messages.map((m) => (
        <div key={m.text} className="banner-line">
          {m.retrying && <Loader inline label="Reconnecting" />}
          {m.text}
        </div>
      ))}
    </div>
  );
}
