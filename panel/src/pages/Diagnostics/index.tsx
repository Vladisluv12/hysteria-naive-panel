import { useState, useEffect } from 'react';
import * as diagApi from '../../api/diagnostics';
import { useToast } from '../../contexts/ToastContext';
import styles from './styles.module.css';

type Tab = 'caddy' | 'hysteria' | 'mieru' | 'vless' | 'ports' | 'config';

export function DiagnosticsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('caddy');
  const [logs, setLogs] = useState('');
  const [ports, setPorts] = useState('');
  const [config, setConfig] = useState('');
  const [caddyfile, setCaddyfile] = useState('');
  const [mieruConfig, setMieruConfig] = useState('');
  const [vlessConfig, setVlessConfig] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        if (tab === 'caddy' || tab === 'hysteria' || tab === 'mieru' || tab === 'vless') {
          const kind = tab === 'caddy' ? 'caddy' : tab === 'hysteria' ? 'hysteria' : tab;
          const res = await diagApi.getLogs(kind);
          setLogs(res.output);
        } else if (tab === 'ports') {
          const res = await diagApi.getPorts();
          setPorts(res.output);
        } else if (tab === 'config') {
          const [hyRes, caddyRes, mieruRes, vlessRes] = await Promise.all([
            diagApi.getHysteriaConfig(),
            diagApi.getCaddyfile(),
            diagApi.getMieruConfig().catch(() => ({ exists: false, output: '—' })),
            diagApi.getVlessConfig().catch(() => ({ exists: false, output: '—' })),
          ]);
          setConfig(hyRes.output);
          setCaddyfile(caddyRes.output);
          setMieruConfig(mieruRes.output);
          setVlessConfig(vlessRes.output);
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
    { key: 'mieru', label: 'mieru' },
    { key: 'vless', label: 'VLESS' },
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
          {(tab === 'caddy' || tab === 'hysteria' || tab === 'mieru' || tab === 'vless') && (
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
            <>
              <div className={styles.card}>
                <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Caddyfile (NaiveProxy)</h3></div>
                <div className={styles.cardBody}>
                  <pre className={styles.logBox}>{caddyfile || '—'}</pre>
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Hysteria2 config</h3></div>
                <div className={styles.cardBody}>
                  <pre className={styles.logBox}>{config || '—'}</pre>
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHeader}><h3 className={styles.cardTitle}>mieru config</h3></div>
                <div className={styles.cardBody}>
                  <pre className={styles.logBox}>{mieruConfig || '—'}</pre>
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardHeader}><h3 className={styles.cardTitle}>VLESS (Xray) config</h3></div>
                <div className={styles.cardBody}>
                  <pre className={styles.logBox}>{vlessConfig || '—'}</pre>
                </div>
              </div>
            </>
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
