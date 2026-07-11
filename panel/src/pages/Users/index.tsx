import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import * as naiveApi from '../../api/naive';
import * as hysteriaApi from '../../api/hysteria';
import * as mieruApi from '../../api/mieru';
import * as vlessApi from '../../api/vless';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import { UserTable } from './components/UserTable';
import { CreateUserModal } from './components/CreateUserModal';
import { ExtendModal } from './components/ExtendModal';
import type { NaiveUser, HysteriaUser, UserTraffic } from '../../types/api';
import styles from './styles.module.css';

type ProxyType = 'naive' | 'hysteria' | 'mieru' | 'vless';
type User = NaiveUser | HysteriaUser;

const API_MAP = {
  naive: naiveApi,
  hysteria: hysteriaApi,
  mieru: mieruApi,
  vless: vlessApi,
};

const TRAFFIC_KEY = {
  naive: 'naive',
  hysteria: 'hy2',
  mieru: 'mieru',
  vless: 'vless',
} as const;

export function UsersPage() {
  const proxyType = (useParams<'*'>()['*'] || 'naive').split('/')[0] as ProxyType;
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [domain, setDomain] = useState('');
  const [port, setPort] = useState(443);
  const [mieruPort, setMieruPort] = useState(443);
  const [vlessPort, setVlessPort] = useState(443);
  const [vlessPbk, setVlessPbk] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [extendUser, setExtendUser] = useState<{ username: string; expiry: string | null } | null>(null);
  const [trafficByUser, setTrafficByUser] = useState<Record<string, UserTraffic>>({});
  const [overflows, setOverflows] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const api = API_MAP[proxyType];
      const [u, config] = await Promise.all([
        api.listUsers(),
        systemApi.getConfig(),
      ]);
      setUsers(u.users);
      setDomain(config.domain || '');
      setPort(config.port);
      setMieruPort(config.mieruPort || config.port);
      setVlessPort(config.vlessPort || config.port);
      setVlessPbk(config.vlessRealityPublicKey || '');

      try {
        const traffic = await systemApi.getTraffic();
        const pu = traffic?.perUser?.[TRAFFIC_KEY[proxyType]]?.users;
        if (pu) setTrafficByUser(pu);
      } catch { /* traffic not critical */ }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [proxyType, addToast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    const el = pageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => {
      const content = el.querySelector(`.${styles.tableWrap}`);
      if (!content) return;
      const contentBottom = content.getBoundingClientRect().bottom;
      const toolbarH = 48;
      setOverflows(contentBottom > window.innerHeight - toolbarH);
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener('resize', check);
    check();
    return () => { ro.disconnect(); window.removeEventListener('resize', check); };
  }, [users]);

  const handleCreate = async (data: { username: string; password: string; nickname: string; expiry: string | null }) => {
    const api = API_MAP[proxyType];
    const res = await api.createUser({ ...data, expireDays: undefined });
    if (!res.success) throw new Error(res.message || 'Create failed');
    addToast(`User ${data.nickname || data.username} created`, 'success');
    loadUsers();
  };

  const handleDelete = async (username: string) => {
    try {
      const api = API_MAP[proxyType];
      await api.deleteUser(username);
      addToast(`User ${username} deleted`, 'success');
      loadUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleExtend = async (expiry: string | null) => {
    if (!extendUser) return;
    try {
      const api = API_MAP[proxyType];
      const expireDays = expiry ? parseInt(expiry) || 0 : 0;
      const res = await api.updateUser(extendUser.username, { expireDays });
      if (!res.success) throw new Error(res.message || 'Extend failed');
      addToast(`User ${extendUser.username} updated`, 'success');
      setExtendUser(null);
      loadUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Extend failed', 'error');
    }
  };

  const makeLink = (u: User) => {
    if (proxyType === 'naive') return `naive+https://${encodeURIComponent(u.username)}:${encodeURIComponent(u.password)}@${domain}:${port}#easy-xray-naive`;
    if (proxyType === 'hysteria') return `hysteria2://${encodeURIComponent(u.username)}:${encodeURIComponent(u.password)}@${domain}:${port}?sni=${domain}&insecure=0#easy-xray-hys`;
    if (proxyType === 'mieru') return `mierus://${encodeURIComponent(u.username)}:${encodeURIComponent(u.password)}@${domain}?profile=default&port=${mieruPort}&protocol=TCP&multiplexing=MULTIPLEXING_HIGH`;
    if (proxyType === 'vless') {
      const vuuid = u.uuid || '';
      return `vless://${encodeURIComponent(vuuid)}@${domain}:${vlessPort}?encryption=none&security=reality&sni=${domain}&fp=chrome&type=xhttp&path=/xhttp&mode=packet-up&noGRPCHeader=true&xmux.maxConcurrency=32-64&pbk=${vlessPbk}#${encodeURIComponent(u.nickname || u.username)}`;
    }
    return '';
  };

  const proxyLabel = { naive: 'NaiveProxy', hysteria: 'Hysteria2', mieru: 'mieru', vless: 'VLESS' }[proxyType];

  return (
    <div className={styles.page} ref={pageRef}>
      <h1 className={styles.title}>Users</h1>
      <div className={styles.subnav}>
        <NavLink to="/users/naive" className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}>NaiveProxy</NavLink>
        <NavLink to="/users/hysteria" className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}>Hysteria2</NavLink>
        <NavLink to="/users/mieru" className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}>mieru</NavLink>
        <NavLink to="/users/vless" className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}>VLESS</NavLink>
      </div>
      {overflows && (
        <div className={styles.toolbar}>
          <span style={{ color: '#888', fontSize: 14 }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
          <button className={styles.btn} onClick={() => setShowCreate(true)}>+ Добавить пользователя</button>
        </div>
      )}
      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <UserTable users={users} trafficByUser={trafficByUser} onExtend={(username, expiry) => setExtendUser({ username, expiry })} onDelete={handleDelete} onCopyLink={makeLink} />
      )}
      <div className={styles.toolbar} style={{ marginTop: overflows ? 0 : 16, display: overflows ? 'none' : undefined }}>
        <span style={{ color: '#888', fontSize: 14 }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
        <button className={styles.btn} onClick={() => setShowCreate(true)}>+ Добавить пользователя</button>
      </div>
      {showCreate && <CreateUserModal title={`Add ${proxyLabel} User`} onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}
      {extendUser && <ExtendModal username={extendUser.username} currentExpiry={extendUser.expiry} onClose={() => setExtendUser(null)} onSubmit={handleExtend} />}
    </div>
  );
}
