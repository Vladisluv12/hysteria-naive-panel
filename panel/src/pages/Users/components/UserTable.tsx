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
  onExtend: (username: string, currentExpiry: string | null) => void;
  onDelete: (username: string) => void;
  onCopyLink: (username: string, password: string) => string;
}

function getDaysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function getBadge(daysLeft: number | null): { label: string; cls: string } {
  if (daysLeft === null) return { label: 'Бессрочно', cls: styles.badgeMuted };
  if (daysLeft < 0) return { label: 'Истёк', cls: styles.badgeDanger };
  if (daysLeft === 0) return { label: 'Менее суток', cls: styles.badgeWarn };
  return { label: `${daysLeft} дн.`, cls: styles.badgeOk };
}

export function UserTable({ users, onExtend, onDelete, onCopyLink }: UserTableProps) {
  const list = Array.isArray(users) ? users : [];

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={styles.th}>Логин</th>
            <th className={styles.th}>Пароль</th>
            <th className={styles.th}>Ссылка подключения</th>
            <th className={styles.th}>Создан</th>
            <th className={styles.th}>Срок</th>
            <th className={styles.th}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {list.map((u) => {
            const daysLeft = getDaysLeft(u.expiry);
            const badge = getBadge(daysLeft);
            return (
              <tr key={u.username} className={`${styles.tr} ${u.expired ? styles.trExpired : ''}`}>
                <td className={`${styles.td} ${styles.tdUsername}`}>{u.username}</td>
                <td className={styles.td}>{u.password}</td>
                <td className={`${styles.td} ${styles.tdLink}`}>
                  <div className={styles.linkRow}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{onCopyLink(u.username, u.password).slice(0, 40)}...</span>
                    <CopyButton text={onCopyLink(u.username, u.password)} />
                  </div>
                </td>
                <td className={styles.td}>{u.created}</td>
                <td className={styles.td}><span className={`${styles.badge} ${badge.cls}`}>{badge.label}</span></td>
                <td className={styles.td}>
                  <div className={styles.actions}>
                    <button className={`${styles.smallBtn} ${styles.extendBtn}`} onClick={() => onExtend(u.username, u.expiry)}>Продлить</button>
                    <button className={`${styles.smallBtn} ${styles.deleteBtn}`} onClick={() => onDelete(u.username)}>Удалить</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
