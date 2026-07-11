"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ color: "#666" }}>An unexpected error occurred.</p>
          <button onClick={reset} style={{ padding: "0.5rem 1.5rem", borderRadius: "0.375rem", border: "1px solid #ddd", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
