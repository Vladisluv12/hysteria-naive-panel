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

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Caddy (NaiveProxy)</div>
          <div className={`${styles.cardValue} ${status?.caddy === 'active' ? styles.statusActive : styles.statusInactive}`}>
            {status?.caddy ?? '...'}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Hysteria2</div>
          <div className={`${styles.cardValue} ${status?.hysteria === 'active' ? styles.statusActive : styles.statusInactive}`}>
            {status?.hysteria ?? '...'}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Server IP</div>
          <div className={styles.cardValue} style={{ fontSize: 18 }}>
            {status?.serverIp ?? '...'}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Traffic</h2>
        {traffic?.caddy && (
          <>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Caddy IN</span>
              <span className={styles.trafficValue}>{formatBytes(traffic.caddy.bytesIn)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Caddy OUT</span>
              <span className={styles.trafficValue}>{formatBytes(traffic.caddy.bytesOut)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Caddy connections</span>
              <span className={styles.trafficValue}>{traffic.caddy?.connections ?? 0}</span>
            </div>
          </>
        )}
        {traffic?.hysteria && (
          <>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Hy2 IN</span>
              <span className={styles.trafficValue}>{formatPackets(traffic.hysteria.packetsIn)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Hy2 OUT</span>
              <span className={styles.trafficValue}>{formatPackets(traffic.hysteria.packetsOut)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Hy2 connections</span>
              <span className={styles.trafficValue}>{traffic.hysteria.connections}</span>
            </div>
          </>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('caddy', 'start')}>Start Caddy</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('caddy', 'stop')}>Stop Caddy</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('caddy', 'restart')}>Restart Caddy</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('hysteria', 'start')}>Start Hy2</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('hysteria', 'stop')}>Stop Hy2</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('hysteria', 'restart')}>Restart Hy2</button>
        </div>
      </div>
    </div>
  );
}
