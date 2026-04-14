import { ExtendedSysInfo } from '../types';

function getBaseUrl(): string {
  return localStorage.getItem('newshell_sync_url') || 'http://localhost:29800';
}

export interface SysInfoWSOptions {
  connId: string;
  interval?: number;
  onData: (data: ExtendedSysInfo) => void;
  onError: (err: string) => void;
  onStatusChange?: (status: 'connected' | 'disconnected' | 'error') => void;
}

export class SysInfoWebSocket {
  private ws: WebSocket | null = null;
  private options: SysInfoWSOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isDestroyed = false;

  constructor(options: SysInfoWSOptions) {
    this.options = options;
    this.connect();
  }

  private connect() {
    if (this.isDestroyed) return;

    const baseUrl = getBaseUrl().replace('http', 'ws');
    const interval = this.options.interval || 5;
    const url = `${baseUrl}/ws/sysinfo/${this.options.connId}?interval=${interval}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.options.onStatusChange?.('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            this.options.onError(data.error);
          } else {
            this.options.onData(data);
          }
        } catch (err) {
          console.error('Failed to parse sysinfo data:', err);
        }
      };

      this.ws.onerror = (event) => {
        console.error('SysInfo WebSocket error:', event);
        this.options.onStatusChange?.('error');
        this.options.onError('系统信息WebSocket连接失败');
      };

      this.ws.onclose = () => {
        this.options.onStatusChange?.('disconnected');
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('Failed to create SysInfo WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.options.onError('系统信息WebSocket重连失败，请刷新页面重试');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  updateInterval(interval: number) {
    this.options.interval = interval;
    // 重新连接以应用新的interval
    this.disconnect();
    this.connect();
  }

  disconnect() {
    this.isDestroyed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

// 便捷函数
export function createSysInfoWS(options: SysInfoWSOptions): SysInfoWebSocket {
  return new SysInfoWebSocket(options);
}
