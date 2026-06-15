import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/Modal';
import styles from '../styles.module.css';

const EXTEND_OPTIONS = [
  { value: '', label: 'Unlimited (remove expiry)' },
  { value: '1d', label: '1 day' }, { value: '3d', label: '3 days' }, { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' }, { value: '365d', label: '365 days' },
];

interface ExtendModalProps {
  username: string;
  currentExpiry: string | null;
  onClose: () => void;
  onSubmit: (expiry: string | null) => Promise<void>;
}

export function ExtendModal({ username, currentExpiry, onClose, onSubmit }: ExtendModalProps) {
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onSubmit(expiry || null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Extend: ${username}`} onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.field}>
          <label className={styles.label}>Current expiry</label>
          <div style={{ color: '#e0e0e0', fontSize: 14, padding: '4px 0' }}>{currentExpiry ?? 'Unlimited'}</div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>New expiry</label>
          <select className={styles.select} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXTEND_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <button className={styles.submitBtn} type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
      </form>
    </Modal>
  );
}
