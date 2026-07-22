import { useState } from 'react';
import { isApiUnauthenticated } from '../../api/authStatus';
import styles from './NoAuthBanner.module.css';

// Persistent (not opt-in) warning that operate actions (start/stop) are
// reachable by anyone who can reach this API — there's no auth gate to bypass
// today, so gating the UI alone would be false comfort. Per-tab dismiss is
// fine (useState, not localStorage): the risk doesn't go away, but a user who
// has seen it once in this tab shouldn't have it pinned on every view.
export function NoAuthBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !isApiUnauthenticated()) return null;

  return (
    <div className={styles.banner} role="status">
      <span>No auth configured — anyone who can reach this API can start or stop pipelines.</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
