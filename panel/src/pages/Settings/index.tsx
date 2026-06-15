import { useState, useEffect, type FormEvent } from 'react';
import * as authApi from '../../api/auth';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import type { VersionInfo } from '../../types/api';
import styles from './styles.module.css';

type Platform = 'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux';

interface ClientInfo {
  platform: Platform;
  name: string;
  tag: string;
}

const CLIENTS: ClientInfo[] = [
  { platform: 'iOS', name: 'Karing / Shadowrocket', tag: 'Рекомендуем' },
  { platform: 'Android', name: 'NekoBox / Karing', tag: '' },
  { platform: 'Windows', name: 'Karing / NekoRay / v2rayN / Hiddify', tag: '' },
  { platform: 'macOS', name: 'Karing / Hiddify', tag: '' },
  { platform: 'Linux', name: 'hysteria CLI', tag: '' },
];

export function SettingsPage() {
  const { addToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [changeError, setChangeError] = useState('');

  useEffect(() => {
    systemApi.getVersion().then(setVersion).catch(() => {});
  }, []);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setChangeError('');
    if (newPassword !== confirmPassword) {
      setChangeError('Пароли не совпадают');
      return;
    }
    if (newPassword.length < 6) {
      setChangeError('Новый пароль минимум 6 символов');
      return;
    }
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      addToast('Пароль успешно изменён', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Ошибка смены пароля');
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Настройки</h1>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Смена пароля панели</h3>
          </div>
          <div className={styles.cardBody}>
            {changeError && <div className={styles.error}>{changeError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Текущий пароль</label>
              <input className={styles.formInput} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Новый пароль</label>
              <input className={styles.formInput} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Подтвердите пароль</label>
              <input className={styles.formInput} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <div className={styles.formActions}>
              <button className={styles.btn} onClick={handleChangePassword}>Сохранить пароль</button>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Информация о панели</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.infoRows}>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>Версия</span>
                <span className={styles.infoVal}>{version?.version ?? '—'}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>Автор</span>
                <span className={styles.infoVal}>RIXXX</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>Стек</span>
                <span className={styles.infoVal}>NaiveProxy + Hysteria2</span>
              </div>
            </div>
            <div className={styles.supportBtns}>
              <a className={`${styles.btn} ${styles.btnFull} ${styles.btnTg}`} href="https://t.me/rixxx_channel" target="_blank" rel="noopener">Подписывайся в Telegram</a>
            </div>
          </div>
        </div>

        <div className={`${styles.card} ${styles.clientsCard}`}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Клиентские приложения</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.clientsList}>
              {CLIENTS.map((c) => (
                <div key={c.platform + c.name} className={styles.clientItem}>
                  <span className={`${styles.clientPlatform} ${styles[c.platform.toLowerCase()]}`}>{c.platform}</span>
                  <span className={styles.clientName}>{c.name}{c.tag && <span className={styles.clientTag}>{c.tag}</span>}</span>
                </div>
              ))}
            </div>
            <div className={styles.clientNote}>
              Формат ссылок:<br />
              <code>naive+https://LOGIN:PASSWORD@your.domain.com:443</code><br />
              <code>hysteria2://PASSWORD@your.domain.com:443?sni=your.domain.com</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
