import { getBaseUrl } from './api';
import { Connection } from '../types';

export interface WSConnectMessage {
  type: 'connect';
  host: string;
  port: number;
  username: string;
  auth_type: string;
  password?: string;
  private_key?: string;
  passphrase?: string;
}

export function createTerminalWS(
  connId: string,
  connDetails: Connection,
  onMessage: (data: string) => void,
  onConnected: () => void,
  onError: (err: string) => void
): WebSocket {
  const wsUrl = getBaseUrl().replace('http', 'ws') + `/ws/terminal/${connId}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  let hasConnected = false;

  ws.onopen = () => {
    // Send connection details as first message
    const connectMsg: WSConnectMessage = {
      type: 'connect',
      host: connDetails.host,
      port: connDetails.port,
      username: connDetails.username,
      auth_type: connDetails.auth_type,
      password: connDetails.password || '',
      private_key: connDetails.private_key || '',
      passphrase: connDetails.passphrase || '',
    };
    ws.send(JSON.stringify(connectMsg));
  };

  ws.onmessage = (event) => {
    let raw: string;
    if (typeof event.data === 'string') {
      raw = event.data;
    } else if (event.data instanceof ArrayBuffer) {
      raw = new TextDecoder().decode(event.data);
    } else {
      return;
    }

    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'connected') {
        hasConnected = true;
        onConnected();
      } else if (msg.type === 'output' && typeof msg.data === 'string') {
        onMessage(msg.data);
      } else if (msg.type === 'error') {
        onError(msg.data);
        onMessage(`\r\n\x1b[31m${msg.data}\x1b[0m\r\n`);
      }
    } catch {
      onMessage(raw);
    }
  };

  ws.onerror = (err) => {
    onError('WebSocket connection error');
  };

  ws.onclose = () => {
    if (!hasConnected) {
      onError('Connection closed before established');
    }
    onMessage('\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
  };

  return ws;
}

export function sendInput(ws: WebSocket, data: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data }));
  }
}

export function sendResize(ws: WebSocket, cols: number, rows: number) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  }
}
