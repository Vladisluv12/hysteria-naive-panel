import { useState, useEffect, type FormEvent } from 'react';
import * as authApi from '../../api/auth';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import type { VersionInfo } from '../../types/api';
import styles from './styles.module.css';

export function SettingsPage() {
  const { addToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [changeError, setChangeError] = useState('');

  useEffect(() => {
    systemApi.getVersion().then(setVersion).catch(() => {});
  }, []);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setChangeError('');
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      addToast('Password changed successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Change Password</h2>
        <form onSubmit={handleChangePassword}>
          {changeError && <div className={styles.error}>{changeError}</div>}
          <div className={styles.field}>
            <label className={styles.label}>Current Password</label>
            <input
              className={styles.input}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>New Password</label>
            <input
              className={styles.input}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <button className={styles.submitBtn} type="submit">
            Change Password
          </button>
        </form>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Panel Info</h2>
        <div className={styles.info}>
          <div>Version: {version?.version ?? 'Loading...'}</div>
        </div>
      </div>
    </div>
  );
}
