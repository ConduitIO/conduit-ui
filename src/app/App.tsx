import { Routes, Route, Link } from 'react-router-dom';
import styles from './App.module.css';
import { FleetView } from '../features/fleet/FleetView';

// Scaffold app shell. The route split (fleet vs. pipeline detail) is the URL
// contract UI-2/UI-3 build into (design doc Decision 2: "separate views, not one
// component"). The fleet view (UI-2) is live at `/`; pipeline detail is still a
// stub until UI-3.
// Note for UI-7 (embed): client-side routing requires the Go server to serve
// index.html as the fallback for unknown non-API paths under `/`.
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
          <Route path="/" element={<FleetView />} />
          <Route path="/pipelines/:id" element={<PipelineDetailPlaceholder />} />
        </Routes>
      </main>
    </div>
  );
}
