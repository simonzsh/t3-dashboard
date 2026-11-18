import { useContext } from "react";
import { RobotVisibilityContext } from "../../lib/robotPreference.ts";
import { Loader } from "../../ui/index.ts";
import { PendingBubble } from "./PendingBubble.tsx";
import { WorkingRobot } from "./WorkingRobot.tsx";
import type { PendingMessage } from "./pending.ts";

export function TurnStart({ pending, threadId, thinking }: { pending: PendingMessage[]; threadId: string; thinking: boolean }) {
  const showRobot = useContext(RobotVisibilityContext);

  return (
    <>
      {pending.map((message) => <PendingBubble key={message.id} message={message} threadId={threadId} />)}
      {thinking && (
        <div className="working-row">
          {showRobot ? <WorkingRobot thinking /> : <Loader inline label="Thinking" />}
          <span role={showRobot ? "status" : undefined}>Thinking…</span>
        </div>
      )}
    </>
  );
}
