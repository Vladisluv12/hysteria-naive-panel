import { useState, useEffect } from 'react';
import * as diagApi from '../../api/diagnostics';
import { useToast } from '../../contexts/ToastContext';
import type { LogEntry } from '../../types/api';
import styles from './styles.module.css';

type Tab = 'caddy' | 'hysteria' | 'ports' | 'config';

interface PortInfo {
  port: number;
  protocol: string;
  process: string;
}

type HysteriaConfig = { raw: string };

export function DiagnosticsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('caddy');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [config, setConfig] = useState<HysteriaConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        if (tab === 'caddy' || tab === 'hysteria') {
          const l = await diagApi.getLogs(tab);
          setLogs(l);
        } else if (tab === 'ports') {
          const p = await diagApi.getPorts();
          setPorts(p);
        } else if (tab === 'config') {
          const c = await diagApi.getHysteriaConfig();
          setConfig(c);
        }
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tab, addToast]);

  const tabLabels: { key: Tab; label: string }[] = [
    { key: 'caddy', label: 'Caddy Logs' },
    { key: 'hysteria', label: 'Hysteria Logs' },
    { key: 'ports', label: 'Ports' },
    { key: 'config', label: 'Hy2 Config' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Diagnostics</h1>

      <div className={styles.tabs}>
        {tabLabels.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.section}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : tab === 'caddy' || tab === 'hysteria' ? (
          <div className={styles.logs}>
            {logs.map((entry, i) => (
              <div key={i} className={styles.logLine}>
                {entry.line}
              </div>
            ))}
            {logs.length === 0 && <div className={styles.loading}>No logs</div>}
          </div>
        ) : tab === 'ports' ? (
          <div className={styles.ports}>
            {ports.map((p, i) => (
              <div key={i}>
                {p.port}/{p.protocol} — {p.process}
              </div>
            ))}
          </div>
        ) : tab === 'config' ? (
          <div className={styles.configPre}>{config?.raw ?? 'No data'}</div>
        ) : null}
      </div>

      <div className={styles.hint}>
        <strong>CLI tools:</strong><br />
        <code className={styles.hintCode}>bash update.sh --status</code> — system status<br />
        <code className={styles.hintCode}>sudo bash update.sh --repair</code> — regenerate configs<br />
        <code className={styles.hintCode}>sudo bash update.sh --repair --dry-run</code> — preview repair
      </div>
    </div>
  );
}
