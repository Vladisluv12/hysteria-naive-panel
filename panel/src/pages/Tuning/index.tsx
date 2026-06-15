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
    try { setStatus(await tuningApi.getStatus()); }
    catch (err) { addToast(err instanceof Error ? err.message : 'Ошибка загрузки', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleApply = async () => {
    setApplying(true);
    try { await tuningApi.applyTuning(); addToast('Тюнинг применён', 'success'); loadStatus(); }
    catch (err) { addToast(err instanceof Error ? err.message : 'Ошибка', 'error'); }
    finally { setApplying(false); }
  };

  if (loading) return <div className={styles.loading}>Загрузка...</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Сетевой тюнинг</h1>

      <div className={`${styles.card} ${styles.infoCard}`}>
        <div className={styles.cardBody}>
          <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Что это и зачем?</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 10 }}>
            Оптимизация сетевых параметров ядра Linux для максимальной производительности прокси-сервера.
          </p>
          <ul className={styles.tuningExpl}>
            <li><strong>BBR</strong> — алгоритм контроля перегрузки от Google. Лучше чем cubic для сетей с потерями.</li>
            <li><strong>fq</strong> — справедливая очередь (Fair Queue). Работает вместе с BBR.</li>
            <li><strong>UDP буферы</strong> — увеличение размера буферов для Hysteria2 (QUIC).</li>
            <li><strong>TCP Fast Open</strong> — ускорение установки TCP-соединений.</li>
            <li><strong>conntrack</strong> — увеличение лимита отслеживаемых соединений.</li>
          </ul>
        </div>
      </div>

      <div className={styles.cardsRow}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={`${styles.serviceIcon} ${styles.naiveIcon}`}>T</div>
              <div>
                <h3 className={styles.cardTitle}>TCP / BBR</h3>
                <div className={styles.cardSubtitle}>Управление перегрузкой</div>
              </div>
            </div>
            <div className={styles.status}>
              <span className={`${styles.dot} ${status?.bbr ? styles.dotGreen : styles.dotGray}`} />
              {status?.bbr ? 'Включено' : 'Выключено'}
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={`${styles.serviceIcon} ${styles.hy2Icon}`}>U</div>
              <div>
                <h3 className={styles.cardTitle}>UDP буферы</h3>
                <div className={styles.cardSubtitle}>Оптимизация QUIC</div>
              </div>
            </div>
            <div className={styles.status}>
              <span className={`${styles.dot} ${status?.udpBuffers ? styles.dotGreen : styles.dotGray}`} />
              {status?.udpBuffers ? 'Включено' : 'Выключено'}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardBody} style={{ textAlign: 'center' }}>
          <h3 style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Применить оптимизации</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 16 }}>
            Применяет BBR + fq, увеличивает UDP-буферы, включает TCP Fast Open и поднимает лимиты conntrack.
          </p>
          <button className={`${styles.btn} ${styles.btnLg}`} onClick={handleApply} disabled={applying}>
            {applying ? 'Применяем...' : 'Применить тюнинг'}
          </button>
        </div>
      </div>
    </div>
  );
}
