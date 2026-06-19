import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './styles.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.mustChangePassword) {
        navigate('/settings');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.bg}>
        <div className={`${styles.orb} ${styles.orb1}`} />
        <div className={`${styles.orb} ${styles.orb2}`} />
        <div className={`${styles.orb} ${styles.orb3}`} />
      </div>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>R</div>
          <div>
            <div className={styles.logoTitle}>RIXXX Panel</div>
            <div className={styles.logoSub}>Naive + Hysteria2</div>
          </div>
        </div>
        <div className={styles.heading}>Welcome back</div>
        <div className={styles.desc}>Sign in to your proxy panel</div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-username">Username</label>
            <input
              id="login-username"
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
        <div className={styles.hint}>Default: admin / admin</div>
      </form>
    </div>
  );
}
