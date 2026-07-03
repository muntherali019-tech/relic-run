import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { isWeb } from "./lib/platform.js";
import "./styles.css";

// Offline support (production website only): the shell + assets are cached by
// public/sw.js so quizzes from the offline bank work with no connection. The
// Capacitor app skips this — its assets ship inside the APK.
if (import.meta.env.PROD && isWeb() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
