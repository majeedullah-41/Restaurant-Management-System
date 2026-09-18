import React from "react";
import ReactDOM from "react-dom/client";
import "@wdio/tauri-plugin";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/toast";

// The ErrorBoundary is the outermost React component so a crash anywhere in
// the tree (including providers) shows the recovery screen instead of a blank
// white webview.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
