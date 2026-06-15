import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/Modal';
import styles from '../styles.module.css';

const EXPIRY_OPTIONS = [
  { value: '', label: 'Unlimited' },
  { value: '1d', label: '1 day' }, { value: '3d', label: '3 days' }, { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' }, { value: '365d', label: '365 days' },
];

interface CreateUserModalProps {
  title: string;
  onClose: () => void;
  onSubmit: (data: { username: string; password: string; expiry: string | null }) => Promise<void>;
}

export function CreateUserModal({ title, onClose, onSubmit }: CreateUserModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onSubmit({ username, password, expiry: expiry || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.field}>
          <label className={styles.label}>Username</label>
          <input className={styles.input} type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Password</label>
          <input className={styles.input} type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Expiry</label>
          <select className={styles.select} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXPIRY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <button className={styles.submitBtn} type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create User'}</button>
      </form>
    </Modal>
  );
}
