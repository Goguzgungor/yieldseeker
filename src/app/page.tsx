export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>YieldSeeker · Stellar</h1>
      <p>YieldSeeker backend — API only for now.</p>
      <ul>
        <li>
          <code>GET /api/position</code> — current position
        </li>
        <li>
          <code>GET /api/scan</code> — latest pool scan
        </li>
        <li>
          <code>GET /api/activity</code> — recent activity log
        </li>
        <li>
          <code>GET /api/events</code> — live SSE stream
        </li>
      </ul>
    </main>
  );
}
