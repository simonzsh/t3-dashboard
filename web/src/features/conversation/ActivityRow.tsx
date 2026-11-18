import { useContext } from "react";
import { RobotVisibilityContext } from "../../lib/robotPreference.ts";
import { Loader } from "../../ui/index.ts";
import { WorkingRobot } from "./WorkingRobot.tsx";

export function ActivityRow({ background = false }: { background?: boolean }) {
  const showRobot = useContext(RobotVisibilityContext);

  return (
    <div className="working-row">
      {showRobot
        ? <WorkingRobot background={background} thinking={!background} />
        : <Loader inline label={background ? "Background activity" : "Thinking"} />}
      <span role={showRobot ? "status" : undefined}>{background ? "Running in the background…" : "Thinking…"}</span>
    </div>
  );
}
