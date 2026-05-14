"use client";

import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");

  return (
    <main
      style={{
        background: "#09090b",
        color: "white",
        minHeight: "100vh",
        fontFamily: "Arial",
        padding: "24px"
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto"
        }}
      >
        <h1
          style={{
            fontSize: "42px",
            fontWeight: "bold"
          }}
        >
          SahamAI
        </h1>

        <p
          style={{
            color: "#a1a1aa",
            marginTop: "10px"
          }}
        >
          AI Stock Analysis Assistant
        </p>

        <div
          style={{
            marginTop: "40px",
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "20px",
            padding: "20px",
            minHeight: "400px"
          }}
        >
          <p style={{ color: "#71717a" }}>
            Ask about Indonesian stocks...
          </p>
        </div>

        <div
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "12px"
          }}
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Analyze BBRI..."
            style={{
              flex: 1,
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: "14px",
              padding: "16px",
              color: "white",
              outline: "none"
            }}
          />

          <button
            style={{
              background: "white",
              color: "black",
              border: "none",
              borderRadius: "14px",
              padding: "16px 20px",
              fontWeight: "bold"
            }}
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
                                        }
