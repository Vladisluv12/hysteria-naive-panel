import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as aclApi from '../../api/acl';
import { useToast } from '../../contexts/ToastContext';
import type { AclConfig } from '../../types/api';
import styles from './styles.module.css';

export function AclPage() {
  const { addToast } = useToast();
  const [acl, setAcl] = useState<AclConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [enabled, setEnabled] = useState(false);
  const [blockDomains, setBlockDomains] = useState('');
  const [blockGeosite, setBlockGeosite] = useState<string[]>([]);
  const [blockGeoip, setBlockGeoip] = useState<string[]>([]);
  const [directAll, setDirectAll] = useState(true);

  const [geositeList, setGeositeList] = useState<string[]>([]);
  const [geoipList, setGeoipList] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [geoUpdating, setGeoUpdating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [aclData, geositeData, geoipData] = await Promise.all([
        aclApi.getAcl(),
        aclApi.getGeositeList(),
        aclApi.getGeoipList(),
      ]);
      setAcl(aclData);
      setEnabled(aclData.enabled);
      setBlockDomains((aclData.blockDomains || []).join('\n'));
      setBlockGeosite(aclData.blockGeosite || []);
      setBlockGeoip(aclData.blockGeoip || []);
      setDirectAll(aclData.directAll);
      setGeositeList(geositeData.categories || []);
      setGeoipList(geoipData.countries || []);
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
      const domains = blockDomains.split('\n').map(d => d.trim()).filter(Boolean);
      const result = await aclApi.updateAcl({
        enabled,
        blockDomains: domains,
        blockGeosite,
        blockGeoip,
        directAll,
      });
      setAcl(result);
      addToast('ACL сохранён', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGeoUpdate = async () => {
    setGeoUpdating(true);
    try {
      await aclApi.geoUpdate();
      addToast('Geoip/geosite датасеты обновлены', 'success');
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Ошибка загрузки датасетов', 'error');
    } finally {
      setGeoUpdating(false);
    }
  };

  const toggleGeosite = (cat: string) => {
    setBlockGeosite(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleGeoip = (country: string) => {
    setBlockGeoip(prev =>
      prev.includes(country) ? prev.filter(c => c !== country) : [...prev, country]
    );
  };

  if (loading) return <div className={styles.loading}>Загрузка...</div>;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>ACL — блокировка сайтов</h1>
        <button className={`${styles.btn} ${styles.btnOutline} ${styles.btnSm}`} onClick={loadData}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Обновить
        </button>
      </div>

      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardBody}>
          <div className={styles.toggleRow}>
            <label className={styles.toggle}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className={styles.toggleSlider} />
            </label>
            <span className={styles.toggleLabel}>
              {enabled ? 'ACL включён' : 'ACL выключен'}
            </span>
          </div>
          <div className={styles.geoInfo}>
            <span className={`${styles.dot} ${acl?.geoSetsExist ? styles.dotGreen : styles.dotGray}`} />
            Geoip/geosite датасеты: {acl?.geoSetsExist ? 'загружены' : 'не загружены'}
          </div>
        </div>
      </div>

      <div className={styles.cardsRow}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Блокировка доменов</h3>
          </div>
          <div className={styles.cardBody}>
            <p className={styles.tuningDesc}>
              По одному домену на строку. Без http://, без портов. Пример: <code>vk.com</code>
            </p>
            <div className={styles.formGroup}>
              <textarea
                className={styles.formInput}
                rows={6}
                value={blockDomains}
                onChange={(e) => setBlockDomains(e.target.value)}
                placeholder="vk.com&#10;instagram.com&#10;facebook.com"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Настройки</h3>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.formGroup} style={{ marginBottom: 12 }}>
              <label className={styles.checkItem} style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={directAll}
                  onChange={(e) => setDirectAll(e.target.checked)}
                />
                direct(all) — весь остальной трафик напрямую
              </label>
            </div>
            <div className={styles.infoRow} style={{ paddingBottom: 8, borderBottom: 'none' }}>
              <span className={styles.infoKey}>Файл ACL</span>
              <span className={`${styles.infoVal} ${styles.mono}`}>/etc/hysteria/acl.rules</span>
            </div>
            <div className={styles.infoRow} style={{ paddingBottom: 8, borderBottom: 'none' }}>
              <span className={styles.infoKey}>Последнее обновление</span>
              <span className={`${styles.infoVal} ${styles.mono}`}>{acl?.updatedAt ? new Date(acl.updatedAt).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Блокировка Geosite категорий</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.checkGrid}>
            {geositeList.map(cat => (
              <label key={cat} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={blockGeosite.includes(cat)}
                  onChange={() => toggleGeosite(cat)}
                />
                {cat}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Блокировка Geoip стран</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.checkGrid}>
            {geoipList.map(country => (
              <label key={country} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={blockGeoip.includes(country)}
                  onChange={() => toggleGeoip(country)}
                />
                {country.toUpperCase()}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Bypass CIDR (read-only)</h3>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.bypassPreview}>
            {(acl?.bypassCidrs || []).length > 0
              ? acl!.bypassCidrs!.slice(0, 30).join(', ')
              : 'Нет bypass CIDR'}
            {(acl?.bypassCidrs || []).length > 30 ? ` ... ещё ${acl!.bypassCidrs!.length - 30}` : ''}
          </div>
          <Link to="/bypass" className={styles.bypassLink} style={{ display: 'inline-block', marginTop: 8 }}>
            Редактировать на странице Bypass →
          </Link>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.cardBody}>
          <div className={styles.formActions} style={{ gap: 10 }}>
            <button className={`${styles.btn} ${styles.btnShiny}`} onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить ACL'}
            </button>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={handleGeoUpdate} disabled={geoUpdating}>
              {geoUpdating ? 'Загрузка...' : 'Обновить geoip/geosite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
