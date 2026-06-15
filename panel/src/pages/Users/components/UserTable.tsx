import { Badge } from '../../../components/Badge';
import { CopyButton } from '../../../components/CopyButton';
import styles from '../styles.module.css';

interface User {
  username: string;
  password: string;
  expiry: string | null;
  expired: boolean;
  created: string;
}

interface UserTableProps {
  users: User[];
  domain: string;
  onExtend: (username: string, currentExpiry: string | null) => void;
  onDelete: (username: string) => void;
  onCopyLink: (username: string, password: string) => string;
}

function getDaysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(-1, days);
}

export function UserTable({ users, domain, onExtend, onDelete, onCopyLink }: UserTableProps) {
  return (
    <table className={styles.table}>
      <thead className={styles.tableHead}>
        <tr>
          <th className={styles.th}>Username</th>
          <th className={styles.th}>Expiry</th>
          <th className={styles.th}>Created</th>
          <th className={styles.th}>Link</th>
          <th className={styles.th}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const daysLeft = getDaysLeft(u.expiry);
          return (
            <tr key={u.username} className={`${styles.tr} ${u.expired ? styles.trExpired : ''}`}>
              <td className={styles.td}>{u.username}</td>
              <td className={styles.td}><Badge daysLeft={daysLeft} /></td>
              <td className={styles.td}>{u.created}</td>
              <td className={styles.td}>
                <div className={styles.linkRow}>
                  <span className={styles.linkText}>{onCopyLink(u.username, u.password).slice(0, 40)}...</span>
                  <CopyButton text={onCopyLink(u.username, u.password)} />
                </div>
              </td>
              <td className={styles.td}>
                <div className={styles.actions}>
                  <button className={`${styles.smallBtn} ${styles.extendBtn}`} onClick={() => onExtend(u.username, u.expiry)}>Extend</button>
                  <button className={`${styles.smallBtn} ${styles.deleteBtn}`} onClick={() => onDelete(u.username)}>Delete</button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
