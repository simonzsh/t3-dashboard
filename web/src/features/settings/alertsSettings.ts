import type { AlertTestResult } from "../../../../shared/api.ts";

export const SETUP_STEPS = [
  "Install the ntfy app on your phone (App Store or Google Play).",
  "Press Set up. The dashboard creates a private topic.",
  "In the ntfy app, press + and Subscribe to that topic.",
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
