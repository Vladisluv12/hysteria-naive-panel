import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/Modal';
import styles from '../styles.module.css';

const EXTEND_OPTIONS = [
  { value: '', label: 'Бессрочно (убрать срок)' },
  { value: '1d', label: '1 день' }, { value: '3d', label: '3 дня' }, { value: '7d', label: '7 дней' },
  { value: '14d', label: '14 дней' }, { value: '30d', label: '30 дней' }, { value: '90d', label: '90 дней' },
  { value: '180d', label: '180 дней' }, { value: '365d', label: '365 дней' },
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
    e.preventDefault(); setError(''); setLoading(true);
    try { await onSubmit(expiry || null); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={`Продлить: ${username}`} onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Текущий срок</label>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, padding: '4px 0' }}>{currentExpiry ?? 'Бессрочно'}</div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Новый срок</label>
          <select className={styles.formSelect} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXTEND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className={styles.formActions}>
          <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  );
}
