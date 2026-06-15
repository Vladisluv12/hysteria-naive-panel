import { useState, useEffect, useCallback } from 'react';
import * as bypassApi from '../../api/bypass';
import { useToast } from '../../contexts/ToastContext';
import type { BypassStatus } from '../../types/api';
import styles from './styles.module.css';

export function BypassPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<BypassStatus | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const s = await bypassApi.getBypass();
      setStatus(s);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleUpdate = async () => {
    try {
      await bypassApi.updateBypass({ content });
      addToast('Bypass list updated', 'success');
      loadStatus();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleClear = async () => {
    try {
      await bypassApi.clearBypass();
      addToast('Bypass cleared', 'success');
      loadStatus();
      setContent('');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Clear failed', 'error');
    }
  };

  if (loading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Bypass (Split Tunneling)</h1>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Status</h2>
        <div className={styles.statusRow}>
          <span className={styles.label}>Enabled</span>
          <span className={status?.enabled ? styles.enabled : styles.disabled}>{status?.enabled ? 'Yes' : 'No'}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>Entries</span>
          <span className={styles.value}>{status?.entries ?? 0}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>File</span>
          <span className={styles.value}>{status?.file ?? '—'}</span>
        </div>
      </div>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Update List</h2>
        <textarea className={styles.textarea} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste JSON with CIDR list..." />
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={handleUpdate}>Upload & Enable</button>
          <button className={styles.actionBtnDanger} onClick={handleClear}>Clear Bypass</button>
        </div>
      </div>
      <div className={styles.warning}>This feature is in active testing. Always verify on your client before using in production.</div>
    </div>
  );
}
