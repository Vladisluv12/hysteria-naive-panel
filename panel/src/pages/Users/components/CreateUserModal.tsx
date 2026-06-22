import { useState, useEffect, type FormEvent } from 'react';
import { Modal } from '../../../components/Modal';
import styles from '../styles.module.css';

const EXPIRY_OPTIONS = [
  { value: '', label: 'Бессрочно' },
  { value: '1d', label: '1 день' }, { value: '3d', label: '3 дня' }, { value: '7d', label: '7 дней' },
  { value: '14d', label: '14 дней' }, { value: '30d', label: '30 дней' }, { value: '90d', label: '90 дней' },
  { value: '180d', label: '180 дней' }, { value: '365d', label: '365 дней' },
];

function randomString(len: number) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) result += chars[arr[i] % chars.length];
  return result;
}

interface CreateUserModalProps {
  title: string;
  isNaive: boolean;
  onClose: () => void;
  onSubmit: (data: { username: string; password: string; expiry: string | null }) => Promise<void>;
}

export function CreateUserModal({ title, isNaive, onClose, onSubmit }: CreateUserModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isNaive) {
      setUsername(randomString(16));
      setPassword(randomString(32));
    }
  }, [isNaive]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await onSubmit({ username, password, expiry: expiry || null }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Ошибка создания'); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Логин</label>
          <input className={styles.formInput} type="text" value={username} onChange={(e) => setUsername(e.target.value)} readOnly={!isNaive} autoFocus />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Пароль</label>
          <input className={styles.formInput} type="text" value={password} onChange={(e) => setPassword(e.target.value)} readOnly={!isNaive} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Срок действия</label>
          <select className={styles.formSelect} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className={styles.formActions}>
          <button className={styles.btn} type="submit" disabled={loading}>{loading ? 'Создание...' : 'Создать'}</button>
        </div>
      </form>
    </Modal>
  );
}
