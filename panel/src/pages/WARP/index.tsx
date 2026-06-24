import { useState, useEffect, useCallback, useMemo } from 'react';
import * as warpApi from '../../api/warp';
import { useToast } from '../../contexts/ToastContext';
import styles from './styles.module.css';

const DEFAULT_DOMAINS = [
  // IP detection services
  'icanhazip.com',
  'ipinfo.io',
  'ip-api.com',
  'checkip.amazonaws.com',
  'whatismyipaddress.com',
  // Google (except YouTube)
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'googleusercontent.com',
  'ggpht.com',
  'googletagmanager.com',
  'googleadservices.com',
  'doubleclick.net',
  'withgoogle.com',
  'googlehosted.com',
  'appspot.com',
  'cloudfunctions.net',
  'run.app',
  'firebaseio.com',
  'firebaseapp.com',
  'web.app',
];

const DEFAULT_CIDRS = [
  // IP detection service IPs
  '104.16.132.229',
  '104.16.133.229',
  '172.64.139.179',
  '172.64.140.34',
  '34.117.59.0/24',
  '108.61.164.0/24',
];

export function WarpPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warpActive, setWarpActive] = useState(false);
  const [warpOn, setWarpOn] = useState(false);
  const [warpIp, setWarpIp] = useState('');
  const [realIp, setRealIp] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [domains, setDomains] = useState('');
  const [cidrs, setCidrs] = useState('');
  const [previewTab, setPreviewTab] = useState<'domains' | 'cidrs'>('domains');

  const loadData = useCallback(async () => {
    try {
      const [status, config] = await Promise.all([
        warpApi.getWarpStatus().catch(() => null),
        warpApi.getWarpConfig().catch(() => null),
      ]);

      if (status) {
        setWarpActive(status.active);
        setWarpOn(status.warpOn);
        setWarpIp(status.warpIp || '');
        setRealIp(status.realIp || '');
      }

      if (config) {
        setEnabled(config.enabled);
        setDomains((config.domains || []).join('\n'));
        setCidrs((config.cidrs || []).join('\n'));
      } else {
        setDomains(DEFAULT_DOMAINS.join('\n'));
        setCidrs(DEFAULT_CIDRS.join('\n'));
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Ошибка загрузки', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const domainList = domains.split('\n').map(d => d.trim()).filter(Boolean);
      const cidrList = cidrs.split('\n').map(c => c.trim()).filter(Boolean);

      await warpApi.updateWarpConfig({
        enabled,
        domains: domainList,
        cidrs: cidrList,
      });

      addToast('WARP конфиг сохранён', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleServiceAction = async (action: string) => {
    try {
      await warpApi.warpAction(action);
      addToast(`WARP ${action} — success`, 'success');
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const handleResetDefaults = () => {
    setDomains(DEFAULT_DOMAINS.join('\n'));
    setCidrs(DEFAULT_CIDRS.join('\n'));
    addToast('Сброшено к значениям по умолчанию', 'success');
  };

  const domainPreview = useMemo(() => {
    const list = domains.split('\n').map(d => d.trim()).filter(Boolean);
    if (list.length === 0) return '(пусто)';
    return list.map(d => `ip rule add to ${d} lookup 100 priority 100`).join('\n');
  }, [domains]);

  const cidrPreview = useMemo(() => {
    const list = cidrs.split('\n').map(c => c.trim()).filter(Boolean);
    if (list.length === 0) return '(пусто)';
    return list.map(c => `ip rule add to ${c} lookup 100 priority 100`).join('\n');
  }, [cidrs]);

  if (loading) return <div className={styles.loading}>Загрузка...</div>;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>WARP — Cloudflare</h1>
        <button className={`${styles.btn} ${styles.btnOutline} ${styles.btnSm}`} onClick={loadData}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Обновить
        </button>
      </div>

      {/* Status + Toggle */}
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardBody}>
          <div className={styles.toggleRow}>
            <label className={styles.toggle}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className={styles.toggleSlider} />
            </label>
            <span className={styles.toggleLabel}>
              {enabled ? 'WARP включён' : 'WARP выключен'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            <div className={styles.statusRow} style={{ border: 'none', padding: 0 }}>
              <span className={styles.statusLabel}>Сервис</span>
              <span className={`${styles.statusValue} ${warpActive ? styles.active : styles.inactive}`}>
                {warpActive ? 'active' : 'inactive'}
              </span>
            </div>
            <div className={styles.statusRow} style={{ border: 'none', padding: 0 }}>
              <span className={styles.statusLabel}>WARP</span>
              <span className={`${styles.statusValue} ${warpOn ? styles.active : styles.inactive}`}>
                {warpOn ? 'on' : 'off'}
              </span>
            </div>
            <div className={styles.statusRow} style={{ border: 'none', padding: 0 }}>
              <span className={styles.statusLabel}>WARP IP</span>
              <span className={styles.statusValue}>{warpIp || '—'}</span>
            </div>
            <div className={styles.statusRow} style={{ border: 'none', padding: 0 }}>
              <span className={styles.statusLabel}>Real IP</span>
              <span className={styles.statusValue}>{realIp || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Service control */}
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Управление сервисом</h3>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => handleServiceAction('start')}>Старт</button>
            <button className={`${styles.btn} ${styles.btnWarning}`} onClick={() => handleServiceAction('restart')}>Рестарт</button>
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => handleServiceAction('stop')}>Стоп</button>
          </div>
          <p className={styles.tuningDesc} style={{ marginTop: 12 }}>
            Сервис: <code>warp.service</code> · Интерфейс: <code>warp</code>
          </p>
        </div>
      </div>

      {/* Domains */}
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Домены (через WARP)</h3>
        </div>
        <div className={styles.cardBody}>
          <p className={styles.tuningDesc}>
            По одному домену на строку. Трафик к этим доменам будет идти через Cloudflare WARP.
          </p>
          <div className={styles.formGroup}>
            <textarea
              className={styles.formInput}
              rows={10}
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="google.com&#10;ipinfo.io&#10;icanhazip.com"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* CIDRs */}
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>IP CIDR (через WARP)</h3>
        </div>
        <div className={styles.cardBody}>
          <p className={styles.tuningDesc}>
            CIDR-адреса для маршрутизации через WARP. По одному на строку.
          </p>
          <div className={styles.formGroup}>
            <textarea
              className={styles.formInput}
              rows={6}
              value={cidrs}
              onChange={(e) => setCidrs(e.target.value)}
              placeholder="104.16.132.229&#10;34.117.59.0/24"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Предпросмотр правил</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${previewTab === 'domains' ? styles.tabActive : ''}`}
              onClick={() => setPreviewTab('domains')}
            >
              Домены
            </button>
            <button
              className={`${styles.tab} ${previewTab === 'cidrs' ? styles.tabActive : ''}`}
              onClick={() => setPreviewTab('cidrs')}
            >
              CIDR
            </button>
          </div>
          <pre className={styles.aclPreview}>
            {previewTab === 'domains' ? domainPreview : cidrPreview}
          </pre>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.card}>
        <div className={styles.cardBody}>
          <div className={styles.formActions} style={{ gap: 10 }}>
            <button className={`${styles.btn} ${styles.btnShiny}`} onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={handleResetDefaults}>
              Сбросить к умолчанию
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
