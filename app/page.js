export default function Home() {
  return (
    <main
      style={{
        background: "#09090b",
        color: "white",
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        fontFamily: "Arial"
      }}
    >
      <h1
        style={{
          fontSize: "48px",
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
    </main>
  );
}
