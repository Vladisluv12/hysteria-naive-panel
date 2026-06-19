import { useState, useEffect, useCallback } from 'react';
import * as bypassApi from '../../api/bypass';
import { useToast } from '../../contexts/ToastContext';
import type { BypassStatus } from '../../types/api';
import styles from './styles.module.css';

export function BypassPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<BypassStatus | null>(null);
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try { setStatus(await bypassApi.getBypass()); }
    catch (err) { addToast(err instanceof Error ? err.message : 'Ошибка загрузки', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleUpdate = async () => {
    try {
      let json: Record<string, string[]> | undefined;
      let cidrs: string[] | undefined;
      try {
        json = JSON.parse(content);
        if (json && !Array.isArray(json)) {
          const arr = Object.values(json).flat() as string[];
          if (arr.length > 0) cidrs = arr;
        }
      } catch {
        cidrs = content.split('\n').map(s => s.trim()).filter(Boolean);
      }
      await bypassApi.updateBypass({ cidrs, source, enabled: true });
      addToast('Список загружен', 'success');
      loadStatus();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Ошибка', 'error');
    }
  };

  const handleClear = async () => {
    try { await bypassApi.clearBypass(); addToast('Список очищен', 'success'); setContent(''); loadStatus(); }
    catch (err) { addToast(err instanceof Error ? err.message : 'Ошибка', 'error'); }
  };

  if (loading) return <div className={styles.loading}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Bypass — прямой трафик</h1>

      <div className={`${styles.card} ${styles.warnCard}`}>
        <div className={styles.cardBody}>
          <strong style={{ color: 'var(--warning)' }}>⚠️ Функция в тестировании</strong>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 6 }}>
            Обязательно проверяйте на своём клиенте перед использованием в продакшне.
          </p>
        </div>
      </div>

      <div className={`${styles.card} ${styles.infoCard}`}>
        <div className={styles.cardBody}>
          <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Зачем это нужно</h3>
          <ul className={styles.tuningExpl}>
            <li>Некоторые сайты (банки, госуслуги) блокируют иностранные IP — трафик к ним пойдёт напрямую.</li>
            <li>Список автоматически подгружается в Hysteria2 как ACL.</li>
          </ul>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleWrap}>
            <div className={`${styles.serviceIcon} ${styles.hy2Icon}`}>H</div>
            <div>
              <h3 className={styles.cardTitle}>Статус ACL для Hy2</h3>
              <div className={styles.cardSubtitle}>/etc/hysteria/bypass-ru.acl</div>
            </div>
          </div>
          <div className={styles.status}>
            <span className={`${styles.dot} ${status?.enabled ? styles.dotGreen : styles.dotGray}`} />
            {status?.enabled ? 'Активен' : 'Выключен'}
          </div>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.infoRows}>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>Сетей в списке</span>
              <span className={styles.infoVal}>{status?.count ?? 0}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>Источник</span>
              <span className={styles.infoVal}>{status?.source || '—'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>Обновлён</span>
              <span className={styles.infoVal}>{status?.updatedAt ? new Date(status.updatedAt).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardBody}>
          <h3 style={{ fontWeight: 600, marginBottom: 10 }}>Загрузить / обновить список</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16 }}>
            Скачайте актуальный список с <a href="https://antifilter.download/" target="_blank" rel="noopener" style={{ color: 'var(--text-accent)' }}>antifilter.download</a> и вставьте JSON ниже.
          </p>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>JSON / список CIDR</label>
            <textarea className={styles.textarea} rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder='{"service.ru": ["1.2.3.0/24", ...]} или ["1.2.3.0/24", ...]' />
            <div className={styles.formHint}>Источник (для заметок)</div>
            <input className={styles.textarea} style={{ minHeight: 0, height: 36 }} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Например: antifilter.download" />
          </div>
          <div className={styles.formActions}>
            <button className={styles.btn} onClick={handleUpdate}>Загрузить и включить</button>
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleClear}>Очистить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
