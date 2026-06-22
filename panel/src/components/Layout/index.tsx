import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './styles.module.css';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/install', label: 'Install' },
  { to: '/users', label: 'Users' },
  { to: '/acl', label: 'ACL' },
  { to: '/diagnostics', label: 'Diagnostics' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>R</div>
          <div className={styles.logoText}>
            <div className={styles.logoTitle}>RIXXX Panel</div>
            <div className={styles.logoSub}>Naive + Hysteria2</div>
          </div>
        </div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.linkActive : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.navBottom}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {(user?.username ?? 'A')[0].toUpperCase()}
            </div>
            <div className={styles.userName}>{user?.username}</div>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
