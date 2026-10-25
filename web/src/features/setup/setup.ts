import type { SetupInfo } from "../../../../shared/api.ts";

export interface SetupCopy {
  title: string;
  steps: string[];
  /** Shown with a copy button. */
  command: string | null;
  showPaste: boolean;
  link: { label: string; url: string } | null;
}

export function setupCopy(setup: SetupInfo): SetupCopy {
  switch (setup.reason) {
    case "t3-stopped":
      return {
        title: "T3 Code is not running",
        steps: ["Open the T3 Code app.", "Without the app, run t3 start in a terminal.", "Press Retry."],
        command: null,
        showPaste: false,
        link: null,
      };
    case "t3-missing":
      return {
        title: "Install T3 Code",
        steps: ["The dashboard works with T3 Code on this computer.", "Install T3 Code and open it.", "Press Retry."],
        command: null,
        showPaste: false,
        link: { label: "Get T3 Code", url: setup.installUrl },
      };
    case "token-needed":
      return {
        title: "Paste a T3 Code token",
        steps: ["The dashboard could not create a token on its own.", "Run this command in a terminal.", "Paste its output below."],
        command: setup.issueCommand,
        showPaste: true,
        link: null,
      };
  }
}
