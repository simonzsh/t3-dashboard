import type { AlertsSetupBody, AlertsTopicBody, AlertTestResult } from "../../../../shared/api.ts";

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

/** A blank server field means the default server. */
export function serverBody(server: string): AlertsSetupBody {
  return server.trim() ? { server: server.trim() } : {};
}

export const topicBody = (topic: string, server: string): AlertsTopicBody => ({ topic: topic.trim(), ...serverBody(server) });
