import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Top-level crash guard. Any uncaught render-time error anywhere in the app
 * previously took down the entire webview to a blank white screen with no way
 * to recover except restarting the whole POS. This boundary catches it and
 * offers a reload, so a single bad component can never brick the terminal.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Best-effort console trace; the UI itself stays usable.
    console.error("Unhandled UI crash:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
    // Fallback if reload is somehow blocked (e.g. mid-print dialog).
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            background: "#0f172a",
            color: "#f8fafc",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            padding: "24px",
          }}
        >
          <h1 style={{ fontSize: "20px", margin: 0 }}>Something went wrong</h1>
          <p style={{ margin: 0, color: "#94a3b8", maxWidth: "480px" }}>
            The screen hit an unexpected error and was stopped to protect your data.
            Your orders and database are safe — reloading will bring everything back.
          </p>
          <pre
            style={{
              maxHeight: "160px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              color: "#ef4444",
              fontSize: "12px",
              maxWidth: "640px",
              background: "#1e293b",
              padding: "12px",
              borderRadius: "8px",
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 28px",
              borderRadius: "8px",
              border: "none",
              background: "#4f46e5",
              color: "white",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
