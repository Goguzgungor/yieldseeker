import LivingNetwork from "./_components/LivingNetwork";

// The Living Network is a fully client-rendered, live dashboard (force-graph +
// SSE + Freighter). Render the client component from this server page.
export default function Home() {
  return <LivingNetwork />;
}
