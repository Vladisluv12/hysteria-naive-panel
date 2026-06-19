import { useState, useEffect } from 'react';
import * as diagApi from '../../api/diagnostics';
import { useToast } from '../../contexts/ToastContext';
import styles from './styles.module.css';

type Tab = 'caddy' | 'hysteria' | 'ports' | 'config';

export function DiagnosticsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('caddy');
  const [logs, setLogs] = useState('');
  const [ports, setPorts] = useState('');
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        if (tab === 'caddy' || tab === 'hysteria') {
          const res = await diagApi.getLogs(tab);
          setLogs(res.output);
        } else if (tab === 'ports') {
          const res = await diagApi.getPorts();
          setPorts(res.output);
        } else if (tab === 'config') {
          const res = await diagApi.getHysteriaConfig();
          setConfig(res.output);
        }
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
                <pre className={styles.logBox}>{logs || 'Нет логов'}</pre>
              </div>
            </div>
          )}
          {tab === 'ports' && (
            <div className={styles.card}>
              <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Порты и сервисы</h3></div>
              <div className={styles.cardBody}>
                <pre className={styles.logBox}>{ports || 'Нет данных'}</pre>
              </div>
            </div>
          )}
          {tab === 'config' && (
            <div className={styles.card}>
              <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Активный конфиг Hysteria2</h3></div>
              <div className={styles.cardBody}>
                <pre className={styles.logBox}>{config || '—'}</pre>
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
