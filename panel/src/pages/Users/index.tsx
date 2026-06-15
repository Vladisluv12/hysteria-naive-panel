import { useState, useEffect, useCallback } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import * as naiveApi from '../../api/naive';
import * as hysteriaApi from '../../api/hysteria';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import { UserTable } from './components/UserTable';
import { CreateUserModal } from './components/CreateUserModal';
import { ExtendModal } from './components/ExtendModal';
import type { NaiveUser, HysteriaUser } from '../../types/api';
import styles from './styles.module.css';

type ProxyType = 'naive' | 'hysteria';
type User = NaiveUser | HysteriaUser;

export function UsersPage() {
  const proxyType = (useParams<'*'>()['*'] || 'naive').split('/')[0] as ProxyType;
  const isNaive = proxyType === 'naive';
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [extendUser, setExtendUser] = useState<{ username: string; expiry: string | null } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [u, config] = await Promise.all([
        isNaive ? naiveApi.listUsers() : hysteriaApi.listUsers(),
        systemApi.getConfig(),
      ]);
      setUsers(u);
      setDomain(config.proxyDomain);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [isNaive, addToast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async (data: { username: string; password: string; expiry: string | null }) => {
    if (isNaive) await naiveApi.createUser(data);
    else await hysteriaApi.createUser(data);
    addToast(`User ${data.username} created`, 'success');
    loadUsers();
  };

  const handleDelete = async (username: string) => {
    try {
      if (isNaive) await naiveApi.deleteUser(username);
      else await hysteriaApi.deleteUser(username);
      addToast(`User ${username} deleted`, 'success');
      loadUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleExtend = async (expiry: string | null) => {
    if (!extendUser) return;
    try {
      if (isNaive) await naiveApi.updateUser(extendUser.username, { expiry });
      else await hysteriaApi.updateUser(extendUser.username, { expiry });
      addToast(`User ${extendUser.username} updated`, 'success');
      setExtendUser(null);
      loadUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Extend failed', 'error');
    }
  };

  const makeLink = (username: string, password: string) => {
    if (isNaive) return `naive+https://${username}:${password}@${domain}:443`;
    return `hysteria2://${password}@${domain}:443?sni=${domain}`;
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Users</h1>
      <div className={styles.subnav}>
        <NavLink to="/users/naive" className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}>NaiveProxy</NavLink>
        <NavLink to="/users/hysteria" className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}>Hysteria2</NavLink>
      </div>
      <div className={styles.toolbar}>
        <span style={{ color: '#888', fontSize: 14 }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
        <button className={styles.addBtn} onClick={() => setShowCreate(true)}>+ Add User</button>
      </div>
      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <UserTable users={users} onExtend={(username, expiry) => setExtendUser({ username, expiry })} onDelete={handleDelete} onCopyLink={makeLink} />
      )}
      {showCreate && <CreateUserModal title={`Add ${isNaive ? 'NaiveProxy' : 'Hysteria2'} User`} onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}
      {extendUser && <ExtendModal username={extendUser.username} currentExpiry={extendUser.expiry} onClose={() => setExtendUser(null)} onSubmit={handleExtend} />}
    </div>
  );
}
