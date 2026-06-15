import { useState, useEffect } from 'react';
import * as diagApi from '../../api/diagnostics';
import { useToast } from '../../contexts/ToastContext';
import type { LogEntry } from '../../types/api';
import styles from './styles.module.css';

type Tab = 'caddy' | 'hysteria' | 'ports' | 'config';

interface PortInfo { port: number; protocol: string; process: string; }
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
        if (tab === 'caddy' || tab === 'hysteria') setLogs(await diagApi.getLogs(tab));
        else if (tab === 'ports') setPorts(await diagApi.getPorts());
        else if (tab === 'config') setConfig(await diagApi.getHysteriaConfig());
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Ошибка загрузки', 'error');
      } finally { setLoading(false); }
    };
    load();
  }, [tab, addToast]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'caddy', label: 'Caddy' },
    { key: 'hysteria', label: 'Hysteria' },
    { key: 'ports', label: 'Порты' },
    { key: 'config', label: 'Конфиг' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Диагностика</h1>

      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className={styles.loading}>Загрузка...</div> : (
        <>
          {(tab === 'caddy' || tab === 'hysteria') && (
            <div className={styles.card}>
              <div className={styles.cardBody}>
                <div className={styles.logBox}>
                  {logs.map((e, i) => <div key={i} className={styles.logLine}>{e.line}</div>)}
                  {logs.length === 0 && <span className={styles.muted}>Нет логов</span>}
                </div>
              </div>
            </div>
          )}
          {tab === 'ports' && (
            <div className={styles.card}>
              <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Порты и сервисы</h3></div>
              <div className={styles.cardBody}>
                <div className={styles.logBox}>
                  {ports.map((p, i) => <div key={i}>{p.port}/{p.protocol} — {p.process}</div>)}
                </div>
              </div>
            </div>
          )}
          {tab === 'config' && (
            <div className={styles.card}>
              <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Активный конфиг Hysteria2</h3></div>
              <div className={styles.cardBody}>
                <div className={styles.logBox}>{config?.raw ?? '—'}</div>
              </div>
            </div>
          )}
        </>
      )}

      <div className={styles.card}>
        <div className={styles.cardBody}>
          <div className={styles.helpSection}>
            <h3 className={styles.helpTitle}>CLI-инструменты на сервере:</h3>
            <ul className={styles.helpList}>
              <li><code>bash update.sh --status</code> — полный статус системы</li>
              <li><code>sudo bash update.sh --repair</code> — перегенерировать конфиги</li>
              <li><code>bash update.sh</code> — обновить панель</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
