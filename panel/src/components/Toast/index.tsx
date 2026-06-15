import { useToast } from '../../contexts/ToastContext';
import styles from './styles.module.css';

const typeClass: Record<string, string> = {
  success: styles.success,
  error: styles.error,
  info: styles.info,
};

export function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${typeClass[t.type]}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
