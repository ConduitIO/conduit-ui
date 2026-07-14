import { Routes, Route, Link } from 'react-router-dom';
import styles from './App.module.css';

// Scaffold app shell. The route split (fleet vs. pipeline detail) is the URL
// contract UI-2/UI-3 build into (design doc Decision 2: "separate views, not one
// component"). Routes are stubs in UI-1 — real views land in later slices.
// Note for UI-7 (embed): client-side routing requires the Go server to serve
// index.html as the fallback for unknown non-API paths under `/`.
function FleetPlaceholder() {
  return (
    <section aria-labelledby="fleet-heading">
      <h2 id="fleet-heading">Pipelines</h2>
      <p className={styles.muted}>
        The fleet view lands in a later slice. Pipelines are created with the CLI, config files, or
        MCP — this UI observes and operates them, it does not author them.
      </p>
    </section>
  );
}

function PipelineDetailPlaceholder() {
  return (
    <section aria-labelledby="detail-heading">
      <h2 id="detail-heading">Pipeline</h2>
      <p className={styles.muted}>
        Pipeline detail, graph, and live record flow land in later slices.
      </p>
    </section>
  );
}

export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          Conduit
        </Link>
      </header>
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<FleetPlaceholder />} />
          <Route path="/pipelines/:id" element={<PipelineDetailPlaceholder />} />
        </Routes>
      </main>
    </div>
  );
}
