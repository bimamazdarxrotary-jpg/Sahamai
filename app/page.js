"use client";

import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");

  async function sendMessage() {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message
      })
    });

    const text = await res.text();

    setResponse(text);
  }

  return (
    <main
      style={{
        background: "#09090b",
        color: "white",
        minHeight: "100vh",
        padding: "24px",
        fontFamily: "Arial"
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto"
        }}
      >
        <h1 style={{ fontSize: "42px" }}>
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
            marginTop: "30px",
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "20px",
            padding: "20px",
            minHeight: "300px",
            whiteSpace: "pre-wrap"
          }}
        >
          {response || "Ask about Indonesian stocks..."}
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "20px"
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
              color: "white"
            }}
          />

          <button
            onClick={sendMessage}
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
