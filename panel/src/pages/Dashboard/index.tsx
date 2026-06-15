import { useState, useEffect, useCallback } from 'react';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import type { SystemStatus, TrafficData } from '../../types/api';
import styles from './styles.module.css';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatPackets(packets: number): string {
  if (packets === 0) return '0';
  if (packets >= 1000000) return `${(packets / 1000000).toFixed(1)}M`;
  if (packets >= 1000) return `${(packets / 1000).toFixed(1)}K`;
  return String(packets);
}

export function DashboardPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        systemApi.getStatus(),
        systemApi.getTraffic(),
      ]);
      setStatus(s);
      setTraffic(t);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleServiceAction = async (kind: string, action: string) => {
    try {
      await systemApi.serviceAction(kind, action);
      addToast(`${action} ${kind} — success`, 'success');
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  if (loading) return <div className={styles.loading}>Loading...</div>;

  const caddyActive = status?.caddy === 'active';
  const hy2Active = status?.hysteria === 'active';

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      <div className={styles.cardsRow}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={`${styles.serviceIcon} ${styles.naive}`}>N</div>
              <div>
                <h3 className={styles.cardTitle}>NaiveProxy</h3>
                <div className={styles.cardSubtitle}>TCP/443 · Caddy</div>
              </div>
            </div>
            <div className={styles.status}>
              <span className={`${styles.dot} ${caddyActive ? styles.dotGreen : styles.dotGray}`} />
              {status?.caddy ?? '—'}
            </div>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.installed}>
              <div className={styles.stats}>
                <div>
                  <div className={styles.statLabel}>Пользователей</div>
                  <div className={styles.statValue}>—</div>
                </div>
              </div>
              <div className={styles.buttons}>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => handleServiceAction('caddy', 'start')}>Старт</button>
                <button className={`${styles.btn} ${styles.btnWarning}`} onClick={() => handleServiceAction('caddy', 'restart')}>Рестарт</button>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleServiceAction('caddy', 'stop')}>Стоп</button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={`${styles.serviceIcon} ${styles.hy2}`}>H</div>
              <div>
                <h3 className={styles.cardTitle}>Hysteria2</h3>
                <div className={styles.cardSubtitle}>UDP/443 · QUIC</div>
              </div>
            </div>
            <div className={styles.status}>
              <span className={`${styles.dot} ${hy2Active ? styles.dotGreen : styles.dotGray}`} />
              {status?.hysteria ?? '—'}
            </div>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.installed}>
              <div className={styles.stats}>
                <div>
                  <div className={styles.statLabel}>Пользователей</div>
                  <div className={styles.statValue}>—</div>
                </div>
              </div>
              <div className={styles.buttons}>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => handleServiceAction('hysteria', 'start')}>Старт</button>
                <button className={`${styles.btn} ${styles.btnWarning}`} onClick={() => handleServiceAction('hysteria', 'restart')}>Рестарт</button>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleServiceAction('hysteria', 'stop')}>Стоп</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${styles.card} ${styles.trafficCard}`}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Трафик</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.trafficGrid}>
            <div className={styles.trafficGroup}>
              <div className={styles.trafficTitle}>Caddy (NaiveProxy)</div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>IN</span>
                <span className={styles.trafficValue}>{traffic?.caddy ? formatBytes(traffic.caddy.bytesIn) : '—'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>OUT</span>
                <span className={styles.trafficValue}>{traffic?.caddy ? formatBytes(traffic.caddy.bytesOut) : '—'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>Connections</span>
                <span className={styles.trafficValue}>{traffic?.caddy?.connections ?? '—'}</span>
              </div>
            </div>
            <div className={styles.trafficGroup}>
              <div className={styles.trafficTitle}>Hysteria2</div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>IN</span>
                <span className={styles.trafficValue}>{traffic?.hysteria ? formatPackets(traffic.hysteria.packetsIn) : '—'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>OUT</span>
                <span className={styles.trafficValue}>{traffic?.hysteria ? formatPackets(traffic.hysteria.packetsOut) : '—'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>Connections</span>
                <span className={styles.trafficValue}>{traffic?.hysteria?.connections ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
