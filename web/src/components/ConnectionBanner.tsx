import type { ConnectionStatus } from "../../../shared/api.ts";

export function ConnectionBanner({ connection, sseDown }: { connection: ConnectionStatus | null; sseDown: boolean }) {
  const messages: string[] = [];
  if (sseDown) messages.push("Connexion au dashboard perdue. Reconnexion en cours…");
  if (connection && connection.t3 !== "live") {
    const label = connection.t3 === "connecting" ? "Connexion à T3 Code en cours…" : "T3 Code est hors ligne.";
    messages.push(connection.error ? `${label} ${connection.error}` : label);
  }
  if (connection?.protocolMismatch) {
    messages.push(`Version de protocole T3 Code inattendue${connection.serverVersion ? ` (serveur ${connection.serverVersion})` : ""}. Certaines actions peuvent échouer.`);
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
