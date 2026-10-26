import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// Added here, not in index.html: the bundler would try to resolve and hash a manifest link.
document.head.append(Object.assign(document.createElement("link"), { rel: "manifest", href: "/manifest.webmanifest" }));
// A fetch handler is what makes Chromium offer the install; the worker itself does nothing.
void navigator.serviceWorker?.register("/sw.js").catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
