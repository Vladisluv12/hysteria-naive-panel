import { useState, useEffect, useCallback } from 'react';
import * as tuningApi from '../../api/tuning';
import { useToast } from '../../contexts/ToastContext';
import type { TuningStatus } from '../../types/api';
import styles from './styles.module.css';

export function TuningPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<TuningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await tuningApi.getStatus();
      setStatus(s);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await tuningApi.applyTuning();
      addToast('Tuning applied successfully', 'success');
      loadStatus();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Apply failed', 'error');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Network Tuning</h1>
      <div className={styles.section}>
        <div className={styles.statusRow}>
          <span>BBR congestion control</span>
          <span className={status?.bbr ? styles.enabled : styles.disabled}>{status?.bbr ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div className={styles.statusRow}>
          <span>UDP buffer optimization</span>
          <span className={status?.udpBuffers ? styles.enabled : styles.disabled}>{status?.udpBuffers ? 'Enabled' : 'Disabled'}</span>
        </div>
        <button className={styles.applyBtn} onClick={handleApply} disabled={applying}>
          {applying ? 'Applying...' : 'Apply Tuning'}
        </button>
      </div>
    </div>
  );
}
