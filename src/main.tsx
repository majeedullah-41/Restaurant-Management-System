import React from "react";
import ReactDOM from "react-dom/client";
import "@wdio/tauri-plugin";
import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";
import { AuthProvider } from "./lib/auth";
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
