import type { SetupInfo } from "../../../../shared/api.ts";

export interface SetupStep {
  text: string;
  /** Shown under the step, with a copy button. */
  command?: string;
}

export interface SetupCopy {
  title: string;
  /** One sentence under the title: what is wrong. */
  lede: string;
  steps: SetupStep[];
  showPaste: boolean;
  link: { label: string; url: string } | null;
}

export function setupCopy(setup: SetupInfo): SetupCopy {
  switch (setup.reason) {
    case "t3-stopped":
      return {
        title: "T3 Code is not running",
        lede: "The dashboard cannot reach T3 Code on this computer.",
        steps: [{ text: "Open the T3 Code app, or start it in a terminal.", command: setup.startCommand }, { text: "Press Retry." }],
        showPaste: false,
        link: { label: "Not installed? Get T3 Code", url: setup.installUrl },
      };
    case "t3-missing":
      return {
        title: "Install T3 Code",
        lede: "The dashboard runs on top of T3 Code, on this computer.",
        steps: [{ text: "Install T3 Code in a terminal, or get the app.", command: setup.installCommand }, { text: "Start T3 Code, then press Retry." }],
        showPaste: false,
        link: { label: "Get the T3 Code app", url: setup.installUrl },
      };
    case "token-needed":
      return {
        title: "Connect to T3 Code",
        lede: "The dashboard could not create its access token by itself.",
        steps: [{ text: "Run this command in a terminal.", command: setup.issueCommand }, { text: "Paste its output below." }],
        showPaste: true,
        link: null,
      };
  }
}
