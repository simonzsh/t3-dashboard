import type { AlertTestResult } from "../../../../shared/api.ts";

export interface SetupStep {
  text: string;
  links?: { label: string; url: string }[];
}

export const SETUP_STEPS: SetupStep[] = [
  {
    text: "Install the ntfy app on your phone:",
    links: [
      { label: "App Store", url: "https://apps.apple.com/app/ntfy/id1625396347" },
      { label: "Google Play", url: "https://play.google.com/store/apps/details?id=io.heckel.ntfy" },
    ],
  },
  { text: "Press Set up. The dashboard creates a private topic." },
  { text: "In the ntfy app, press + and Subscribe to that topic." },
];

export function testMessage(result: AlertTestResult["result"]): string {
  switch (result) {
    case "ok":
      return "Test alert sent. Check your phone.";
    case "refused":
      return "The alert server refused the test. Check the server and the topic.";
    case "unreachable":
      return "The dashboard could not reach the alert server.";
  }
}

// The topic is the only secret: anyone who reads it can subscribe. Show the generated prefix and a short tail.
export function maskedTopic(topic: string): string {
  const prefix = topic.startsWith("t3-dashboard-") ? "t3-dashboard-" : "";
  return `${prefix}••••${topic.slice(-4)}`;
}
