import { Routes, Route, Link } from 'react-router-dom';
import styles from './App.module.css';
import { FleetView } from '../features/fleet/FleetView';
import { PipelineDetail } from '../features/detail/PipelineDetail';

// Scaffold app shell. The route split (fleet vs. pipeline detail) is the URL
// contract the slices build into (design doc Decision 2: "separate views, not one
// component"). The fleet view (UI-2) is live at `/`; the pipeline detail view
// (UI-3) is live at `/pipelines/:id`.
// Note for UI-7 (embed): client-side routing requires the Go server to serve
// index.html as the fallback for unknown non-API paths under `/`.
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
          <Route path="/pipelines/:id" element={<PipelineDetail />} />
        </Routes>
      </main>
    </div>
  );
}
