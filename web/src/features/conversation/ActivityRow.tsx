import { useContext } from "react";
import { RobotVisibilityContext } from "../../lib/robotPreference.ts";
import { Icon, Loader, STATUS_ICONS } from "../../ui/index.ts";
import { WorkingRobot } from "./WorkingRobot.tsx";

const ACTIVITY = {
  thinking: { text: "Thinking…", label: "Thinking" },
  background: { text: "Running in the background…", label: "Background activity" },
  waiting: { text: "Waiting for your reply", label: "Waiting for your reply" },
};

export function ActivityRow({ activity }: { activity: keyof typeof ACTIVITY }) {
  const showRobot = useContext(RobotVisibilityContext);
  const { text, label } = ACTIVITY[activity];
  const waiting = activity === "waiting";
  const indicator = waiting ? <Icon name={STATUS_ICONS.waiting} className="waiting-icon" /> : <Loader inline label={label} />;

  return (
    <div className="working-row">
      {showRobot
        ? <WorkingRobot background={activity === "background"} thinking={activity === "thinking"} waiting={waiting} />
        : indicator}
      <span role={showRobot || waiting ? "status" : undefined}>{text}</span>
    </div>
  );
}
