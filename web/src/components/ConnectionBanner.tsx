import type { ConnectionStatus } from "../../../shared/api.ts";

export function ConnectionBanner({ connection, sseDown }: { connection: ConnectionStatus | null; sseDown: boolean }) {
  const messages: string[] = [];
  if (sseDown) messages.push("Dashboard connection lost. Reconnecting…");
  if (connection && connection.t3 !== "live") {
    const label = connection.t3 === "connecting" ? "Connecting to T3 Code…" : "T3 Code is offline.";
    messages.push(connection.error ? `${label} ${connection.error}` : label);
  }
  if (connection?.protocolMismatch) {
    messages.push(`Unexpected T3 Code protocol version${connection.serverVersion ? ` (server ${connection.serverVersion})` : ""}. Some actions may fail.`);
  }
  if (messages.length === 0) return null;
  return (
    <div className="banner" role="alert">
      {messages.map((m) => (
        <div key={m}>{m}</div>
      ))}
    </div>
  );
}
