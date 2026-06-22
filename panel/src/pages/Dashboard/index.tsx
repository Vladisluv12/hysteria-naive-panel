import { useState, useEffect, useCallback } from 'react';
import * as systemApi from '../../api/system';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { SystemStatus, TrafficResponse } from '../../types/api';
import styles from './styles.module.css';

export function DashboardPage() {
  const { mustChangePassword } = useAuth();
  const { addToast } = useToast();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [traffic, setTraffic] = useState<TrafficResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        systemApi.getStatus(),
        systemApi.getTraffic().catch(() => null),
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

  if (!status?.installed) {
    if (loading) return <div className={styles.loading}>Loading...</div>;
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.card}>
          <div className={styles.cardBody} style={{ textAlign: 'center', padding: '40px 20px' }}>
            <h3 style={{ marginBottom: 12 }}>Прокси не установлены</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
              Перейдите на страницу <strong>Install</strong> для установки.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className={styles.loading}>Loading...</div>;

  const caddyActive = status.naive?.active ?? false;
  const hy2Active = status.hy2?.active ?? false;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      {mustChangePassword && (
        <div style={{
          background: 'var(--warning-bg)',
          border: '1px solid var(--warning)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          marginBottom: 16,
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
        }}>
          <strong>Внимание:</strong> Вы используете пароль по умолчанию. Смените его на странице{' '}
          <a href="/settings" style={{ color: 'var(--accent-bright)', textDecoration: 'underline' }}>Settings</a>.
        </div>
      )}

      <div className={styles.cardsRow}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <div className={`${styles.serviceIcon} ${styles.naive}`}>N</div>
              <div>
                <h3 className={styles.cardTitle}>NaiveProxy</h3>
                <div className={styles.cardSubtitle}>TCP/{status.port} · Caddy</div>
              </div>
            </div>
            <div className={styles.status}>
              <span className={`${styles.dot} ${caddyActive ? styles.dotGreen : styles.dotGray}`} />
              {caddyActive ? 'active' : (status.naive ? 'inactive' : '—')}
            </div>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.installed}>
              <div className={styles.stats}>
                <div>
                  <div className={styles.statLabel}>Пользователей</div>
                  <div className={styles.statValue}>{status.naive?.usersCount ?? '—'}</div>
                </div>
              </div>
              <div className={styles.buttons}>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => handleServiceAction('naive', 'start')}>Старт</button>
                <button className={`${styles.btn} ${styles.btnWarning}`} onClick={() => handleServiceAction('naive', 'restart')}>Рестарт</button>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleServiceAction('naive', 'stop')}>Стоп</button>
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
                <div className={styles.cardSubtitle}>UDP/{status.port} · QUIC</div>
              </div>
            </div>
            <div className={styles.status}>
              <span className={`${styles.dot} ${hy2Active ? styles.dotGreen : styles.dotGray}`} />
              {hy2Active ? 'active' : (status.hy2 ? 'inactive' : '—')}
            </div>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.installed}>
              <div className={styles.stats}>
                <div>
                  <div className={styles.statLabel}>Пользователей</div>
                  <div className={styles.statValue}>{status.hy2?.usersCount ?? '—'}</div>
                </div>
              </div>
              <div className={styles.buttons}>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => handleServiceAction('hy2', 'start')}>Старт</button>
                <button className={`${styles.btn} ${styles.btnWarning}`} onClick={() => handleServiceAction('hy2', 'restart')}>Рестарт</button>
                <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleServiceAction('hy2', 'stop')}>Стоп</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${styles.card} ${styles.trafficCard}`}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Информация о сервере</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.trafficGrid}>
            <div className={styles.trafficGroup}>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>Домен</span>
                <span className={styles.trafficValue}>{status.domain || '—'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>Сервер IP</span>
                <span className={styles.trafficValue}>{status.serverIp || '—'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>Email</span>
                <span className={styles.trafficValue}>{status.email || '—'}</span>
              </div>
            </div>
            <div className={styles.trafficGroup}>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>Архитектура</span>
                <span className={styles.trafficValue}>{status.arch || '—'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>NaiveProxy</span>
                <span className={styles.trafficValue}>{status.stack?.naive ? '✓' : '✗'}</span>
              </div>
              <div className={styles.trafficRow}>
                <span className={styles.trafficLabel}>Hysteria2</span>
                <span className={styles.trafficValue}>{status.stack?.hy2 ? '✓' : '✗'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {traffic && (
        <div className={`${styles.card} ${styles.trafficCard}`}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Трафик</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.trafficGrid}>
              <div className={styles.trafficGroup}>
                <div className={styles.trafficTitle}>NaiveProxy (TCP)</div>
                <div className={styles.trafficRow}>
                  <span className={styles.trafficLabel}>RX (загрузка)</span>
                  <span className={styles.trafficValue}>{traffic.perProto?.naive?.rxFormatted || '0 B'}</span>
                </div>
                <div className={styles.trafficRow}>
                  <span className={styles.trafficLabel}>TX (отдача)</span>
                  <span className={styles.trafficValue}>{traffic.perProto?.naive?.txFormatted || '0 B'}</span>
                </div>
                <div className={styles.trafficRow}>
                  <span className={styles.trafficLabel}>Активных</span>
                  <span className={styles.trafficValue}>{traffic.connections?.naive ?? '—'}</span>
                </div>
                {traffic.perUser?.naive?.users && Object.entries(traffic.perUser.naive.users).map(([user, u]) => (
                  <div key={user} className={styles.trafficRow}>
                    <span className={styles.trafficLabel}>{user}</span>
                    <span className={styles.trafficValue}>{u.totalFormatted}</span>
                  </div>
                ))}
              </div>
              <div className={styles.trafficGroup}>
                <div className={styles.trafficTitle}>Hysteria2 (UDP)</div>
                <div className={styles.trafficRow}>
                  <span className={styles.trafficLabel}>RX (загрузка)</span>
                  <span className={styles.trafficValue}>{traffic.perProto?.hy2?.rxFormatted || '0 B'}</span>
                </div>
                <div className={styles.trafficRow}>
                  <span className={styles.trafficLabel}>TX (отдача)</span>
                  <span className={styles.trafficValue}>{traffic.perProto?.hy2?.txFormatted || '0 B'}</span>
                </div>
                <div className={styles.trafficRow}>
                  <span className={styles.trafficLabel}>Активных</span>
                  <span className={styles.trafficValue}>{traffic.connections?.hy2 ?? '—'}</span>
                </div>
                {traffic.perUser?.hy2?.users && Object.entries(traffic.perUser.hy2.users).map(([user, u]) => (
                  <div key={user} className={styles.trafficRow}>
                    <span className={styles.trafficLabel}>{user}</span>
                    <span className={styles.trafficValue}>{u.totalFormatted}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
