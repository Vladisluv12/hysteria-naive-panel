import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast('Copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Failed to copy', 'error');
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? '#2e7d32' : '#3a3a5c',
        border: 'none',
        color: '#fff',
        padding: '4px 10px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
