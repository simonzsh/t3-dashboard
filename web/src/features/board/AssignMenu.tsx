import { useState } from "react";
import { createPortal } from "react-dom";
import type { DashboardProject, DashboardProvider, LinearIssue } from "../../../../shared/api.ts";
import { Button, Icon, IconButton } from "../../ui/index.ts";
import { NewThreadDialog } from "../new-thread/NewThreadDialog.tsx";

interface Props {
  issue: LinearIssue;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  onAssigned: (threadId: string) => void;
  onShowDesk: () => void;
}

// Opens the New Agent dialog on the issue; the portal keeps it clear of the board's scroll boxes.
export function AssignMenu({ issue, projects, providers, onAssigned, onShowDesk }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div className="assign">
      {done ? (
        <span className="confirm">
          <span role="img" aria-label="Session created" title="Session created">
            <Icon name="check" strokeWidth={2.2} />
          </span>
          <Button variant="link" onClick={onShowDesk}>
            View on Desk
          </Button>
        </span>
      ) : (
        <IconButton label="Assign to an agent" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="assignBot" strokeWidth={1.8} />
        </IconButton>
      )}
      {open &&
        createPortal(
          <NewThreadDialog
            issue={issue}
            projects={projects}
            providers={providers}
            onClose={() => setOpen(false)}
            onCreated={(threadId) => {
              setOpen(false);
              setDone(true);
              onAssigned(threadId);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
