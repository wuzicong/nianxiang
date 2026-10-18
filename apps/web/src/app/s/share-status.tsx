export function ShareStatus({ title, body }: { title: string; body: string }) {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>
        <a href="/">念册 · Memora</a>
      </p>
      <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>{body}</p>
    </main>
  );
}
