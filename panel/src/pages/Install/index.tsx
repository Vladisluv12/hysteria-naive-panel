import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import styles from './styles.module.css';

type InstallType = 'naive' | 'hysteria' | 'both';

const STEP_MAP: Record<string, string> = {
  'STEP:1': 'Installing prerequisites...',
  'STEP:2': 'Downloading binaries...',
  'STEP:3': 'Configuring services...',
  'STEP:4': 'Setting up firewall...',
  'STEP:5': 'Starting services...',
  'STEP:DONE': 'Installation complete!',
};

export function InstallPage() {
  const [selected, setSelected] = useState<InstallType | null>(null);
  const [installing, setInstalling] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const { messages, connected, send } = useWebSocket('');

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!installing) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    if (lastMsg.step && STEP_MAP[lastMsg.step]) setCurrentStep(STEP_MAP[lastMsg.step]);
    if (lastMsg.step === 'STEP:DONE' || lastMsg.type === 'error') setInstalling(false);
  }, [messages, installing]);

  const handleStart = () => {
    if (!selected || !connected) return;
    setInstalling(true);
    setCurrentStep('Starting...');
    send({ type: `install_${selected}`, ...(selected === 'both' ? { services: ['naive', 'hysteria'] } : {}) });
  };

  const types: { key: InstallType; label: string; desc: string }[] = [
    { key: 'naive', label: 'NaiveProxy', desc: 'HTTPS forward proxy via Caddy' },
    { key: 'hysteria', label: 'Hysteria2', desc: 'High-speed QUIC proxy' },
    { key: 'both', label: 'Both', desc: 'NaiveProxy + Hysteria2' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Installation</h1>
      {!installing ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Select proxy type</h2>
          <div className={styles.options}>
            {types.map((t) => (
              <button key={t.key} className={`${styles.optionBtn} ${selected === t.key ? styles.optionBtnSelected : ''}`} onClick={() => setSelected(t.key)}>
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <button className={styles.startBtn} disabled={!selected || !connected} onClick={handleStart}>Start Installation</button>
          {!connected && <div className={styles.progress} style={{ color: '#ef5350', marginTop: 12 }}>WebSocket not connected. Make sure the panel server is running.</div>}
        </div>
      ) : (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{currentStep}</h2>
          <div className={styles.log}>
            {messages.map((msg, i) => {
              let cls = styles.logEntry;
              if (msg.type === 'error') cls = styles.logError;
              else if (msg.step === 'STEP:DONE') cls = styles.logSuccess;
              else if (msg.step) cls = styles.logStep;
              return <div key={i} className={cls}>{msg.message || msg.step || JSON.stringify(msg)}</div>;
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
