import { useEffect, useRef, useState } from 'react';

interface WsMessage {
  type: string;
  step?: string;
  message?: string;
  error?: string;
  status?: string;
  service?: string;
}

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
    const ws = new WebSocket(`${protocol}//${host}${url}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      } catch { /* ignore invalid JSON */ }
    };
    return () => ws.close();
  }, [url]);

  const send = (data: unknown) => { wsRef.current?.send(JSON.stringify(data)); };

  return { messages, connected, send };
}
