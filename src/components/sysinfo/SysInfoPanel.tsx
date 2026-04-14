import { useEffect, useState, useRef } from 'react';
import { SysInfo } from '../../types';
import api from '../../services/api';
import { Cpu, HardDrive, MemoryStick, Activity, Server } from 'lucide-react';

interface Props {
  connId: string;
}

const REFRESH_OPTIONS = [1, 3, 5, 10, 30];

export function SysInfoPanel({ connId }: Props) {
  const [info, setInfo] = useState<SysInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshRate, setRefreshRate] = useState(
    parseInt(localStorage.getItem('newshell_sysinfo_refresh') || '5')
  );
  const [showSettings, setShowSettings] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchInfo = async () => {
    if (!connId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/sysinfo/${connId}`);
      setInfo(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || '连接未建立');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!connId) {
      setInfo(null);
      return;
    }
    fetchInfo();
    timerRef.current = setInterval(fetchInfo, refreshRate * 1000);
    return () => clearInterval(timerRef.current);
  }, [connId, refreshRate]);

  const handleRefreshChange = (rate: number) => {
    setRefreshRate(rate);
    localStorage.setItem('newshell_sysinfo_refresh', rate.toString());
    setShowSettings(false);
  };

  if (!connId) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2" style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
        <Server size={24} strokeWidth={1} />
        <p className="text-xs">选择连接后显示系统信息</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3" style={{ background: 'var(--bg-secondary)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          系统信息
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
          >
            {refreshRate}s
          </button>
          {showSettings && (
            <div className="flex gap-1">
              {REFRESH_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRefreshChange(r)}
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: r === refreshRate ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: r === refreshRate ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {r}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs p-2 rounded mb-3" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {info ? (
        <div className="space-y-3">
          {/* System */}
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              <Server size={12} style={{ color: 'var(--accent)' }} />
              <span className="font-medium">{info.hostname || 'N/A'}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>{info.os || 'N/A'}</div>
            <div style={{ color: 'var(--text-secondary)' }}>运行: {info.uptime || 'N/A'}</div>
          </div>

          {/* CPU */}
          <ProgressBar
            icon={<Cpu size={12} />}
            label="CPU"
            value={parseFloat(info.cpu) || 0}
            color="var(--accent)"
          />

          {/* Memory */}
          <ProgressBar
            icon={<MemoryStick size={12} />}
            label={`内存 ${info.mem_total ? `(${info.mem_total}MB)` : ''}`}
            value={parseFloat(info.mem_used) || 0}
            color="var(--success)"
          />

          {/* Disk */}
          <ProgressBar
            icon={<HardDrive size={12} />}
            label="磁盘"
            value={parseFloat(info.disk) || 0}
            color={parseFloat(info.disk) > 80 ? 'var(--danger)' : 'var(--warning)' }
          />

          {/* Network */}
          <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Activity size={12} />
            <span>RX: {formatBytes(info.net_rx)}</span>
            <span>TX: {formatBytes(info.net_tx)}</span>
          </div>
        </div>
      ) : loading ? (
        <div className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>
          加载中...
        </div>
      ) : null}
    </div>
  );
}

function ProgressBar({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          {icon}
          <span>{label}</span>
        </div>
        <span style={{ color: clampedValue > 80 ? 'var(--danger)' : 'var(--text-primary)' }}>
          {clampedValue.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clampedValue}%`, background: color }}
        />
      </div>
    </div>
  );
}

function formatBytes(bytes: string): string {
  const b = parseInt(bytes) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
