import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { ExtendedSysInfo, ProcessInfo, NetworkInterface, DiskPartition } from '../../types';
import api from '../../services/api';
import { createSysInfoWS, SysInfoWebSocket } from '../../services/sysinfoWS';
import { 
  Cpu, 
  HardDrive, 
  MemoryStick, 
  Activity, 
  Server, 
  Clock, 
  User, 
  Globe,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Wifi,
  WifiOff,
  Loader
} from 'lucide-react';

interface Props {
  connId: string;
}

const REFRESH_OPTIONS = [1, 3, 5, 10, 30];
const PROCESS_LIMIT_OPTIONS = [5, 10, 20];

export function ExtendedSysInfoPanel({ connId }: Props) {
  const [info, setInfo] = useState<ExtendedSysInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshRate, setRefreshRate] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [processSort, setProcessSort] = useState<'memory' | 'cpu'>('memory');
  const [processLimit, setProcessLimit] = useState(5);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'error' | 'connecting'>('disconnected');
  const wsRef = useRef<SysInfoWebSocket | null>(null);

  // 使用useMemo来缓存排序后的进程列表
  const sortedProcesses = useMemo(() => {
    if (!info?.processes) return [];
    return [...info.processes]
      .sort((a, b) => 
        processSort === 'memory' ? b.memory - a.memory : b.cpu_percent - a.cpu_percent
      )
      .slice(0, processLimit);
  }, [info?.processes, processSort, processLimit]);

  useEffect(() => {
    if (!connId) {
      setInfo(null);
      setWsStatus('disconnected');
      return;
    }

    setLoading(true);
    setWsStatus('connecting');

    // 创建WebSocket连接
    const ws = createSysInfoWS({
      connId,
      interval: refreshRate,
      onData: (data) => {
        setInfo(data);
        setError('');
        setLoading(false);
      },
      onError: (err) => {
        setError(err);
        setLoading(false);
        // WebSocket失败时fallback到HTTP轮询
        fetchInfoFallback();
      },
      onStatusChange: (status) => {
        setWsStatus(status);
        if (status === 'disconnected' || status === 'error') {
          // fallback到HTTP轮询
          fetchInfoFallback();
        }
      }
    });

    wsRef.current = ws;

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [connId, refreshRate]);

  // HTTP轮询fallback
  const fetchInfoFallback = useCallback(async () => {
    if (!connId) return;
    try {
      const res = await api.get(`/api/sysinfo/${connId}/extended`);
      setInfo(res.data);
      setError('');
    } catch (err: any) {
      try {
        const basicRes = await api.get(`/api/sysinfo/${connId}`);
        setInfo(basicRes.data);
        setError('');
      } catch (basicErr: any) {
        setError(basicErr.response?.data?.error || '连接未建立');
      }
    }
  }, [connId]);

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const handleSortChange = (sortType: 'memory' | 'cpu') => {
    setProcessSort(sortType);
  };

  const handleLimitChange = (limit: number) => {
    setProcessLimit(limit);
  };

  if (!connId) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2 p-4" style={{ color: 'var(--text-secondary)' }}>
        <Server size={24} strokeWidth={1} />
        <p className="text-xs">选择连接后显示服务器信息</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold bg-clip-text" style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          服务器信息
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
                  onClick={() => {
                    setRefreshRate(r);
                    setShowSettings(false);
                  }}
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
          {/* Status Panel */}
          <StatusPanel info={info} />

          {/* Network Info */}
          <Section
            title="网络信息"
            icon={<Globe size={12} />}
            collapsed={collapsedSections.has('network')}
            onToggle={() => toggleSection('network')}
          >
            <NetworkInfo interfaces={info.network_interfaces} netRx={info.net_rx} netTx={info.net_tx} />
          </Section>

          {/* Disk Info */}
          <Section
            title="磁盘信息"
            icon={<HardDrive size={12} />}
            collapsed={collapsedSections.has('disk')}
            onToggle={() => toggleSection('disk')}
          >
            <DiskInfo partitions={info.disk_partitions} disk={info.disk} diskDetails={info.disk_details} />
          </Section>

          {/* Process List */}
          <Section
            title="进程列表"
            icon={<Activity size={12} />}
            collapsed={collapsedSections.has('processes')}
            onToggle={() => toggleSection('processes')}
          >
            <ProcessList 
              processes={sortedProcesses} 
              sortBy={processSort}
              limit={processLimit}
              onSortChange={handleSortChange}
              onLimitChange={handleLimitChange}
            />
          </Section>
        </div>
      ) : loading ? (
        <div className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>
          加载中...
        </div>
      ) : null}
    </div>
  );
}

// Status Panel Component
function StatusPanel({ info }: { info: ExtendedSysInfo }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <div className="text-xs space-y-2">
        {/* Load Average */}
        {info.load_average && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <Activity size={12} />
              <span>负载</span>
            </div>
            <span style={{ color: 'var(--text-primary)' }}>
              {info.load_average[0].toFixed(2)} / {info.load_average[1].toFixed(2)} / {info.load_average[2].toFixed(2)}
            </span>
          </div>
        )}

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

        {/* System Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Server size={12} />
            <span>系统</span>
          </div>
          <span style={{ color: 'var(--text-primary)' }}>{info.os || 'N/A'}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <Clock size={12} />
            <span>运行</span>
          </div>
          <span style={{ color: 'var(--text-primary)' }}>{info.uptime || 'N/A'}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <User size={12} />
            <span>主机</span>
          </div>
          <span style={{ color: 'var(--text-primary)' }}>{info.hostname || 'N/A'}</span>
        </div>
      </div>
    </div>
  );
}

// Network Info Component
function NetworkInfo({ interfaces, netRx, netTx }: { 
  interfaces?: NetworkInterface[]; 
  netRx?: string; 
  netTx?: string;
}) {
  if (!interfaces || interfaces.length === 0) {
    return (
      <div className="text-xs py-2" style={{ color: 'var(--text-secondary)' }}>
        <div className="flex items-center justify-between">
          <span>接收</span>
          <span>{formatBytes(netRx || '0')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>发送</span>
          <span>{formatBytes(netTx || '0')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <table className="w-full">
        <thead>
          <tr style={{ color: 'var(--text-secondary)' }}>
            <th className="text-left py-1">网卡</th>
            <th className="text-right py-1">上行</th>
            <th className="text-right py-1">下行</th>
          </tr>
        </thead>
        <tbody>
          {interfaces.map((iface) => (
            <tr key={iface.name}>
              <td className="py-1">{iface.name}</td>
              <td className="text-right py-1" style={{ color: 'var(--success)' }}>
                {formatSpeed(iface.tx_speed)}
              </td>
              <td className="text-right py-1" style={{ color: 'var(--accent)' }}>
                {formatSpeed(iface.rx_speed)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Disk Info Component
function DiskInfo({ partitions, disk, diskDetails }: {
  partitions?: DiskPartition[];
  disk?: string;
  diskDetails?: string;
}) {
  if (!partitions || partitions.length === 0) {
    return (
      <div className="text-xs py-2" style={{ color: 'var(--text-secondary)' }}>
        <div className="flex items-center justify-between">
          <span>根分区</span>
          <span>{diskDetails || `${disk}%`}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-xs space-y-2">
      {partitions.map((partition) => (
        <div key={partition.mount_point}>
          <div className="flex items-center justify-between mb-1">
            <span>{partition.mount_point}</span>
            <span style={{ color: partition.use_percent > 80 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {partition.use_percent}%
            </span>
          </div>
          <ProgressBar
            icon={null}
            label={`${formatBytes(partition.used.toString())} / ${formatBytes(partition.size.toString())}`}
            value={partition.use_percent}
            color={partition.use_percent > 80 ? 'var(--danger)' : partition.use_percent > 60 ? 'var(--warning)' : 'var(--success)'}
          />
        </div>
      ))}
    </div>
  );
}

// Process List Component - 修复版
function ProcessList({ 
  processes, 
  sortBy, 
  limit,
  onSortChange,
  onLimitChange
}: { 
  processes: ProcessInfo[]; 
  sortBy: string;
  limit: number;
  onSortChange: (sort: 'memory' | 'cpu') => void;
  onLimitChange: (limit: number) => void;
}) {
  if (processes.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-end mb-2">
          <LimitSelector limit={limit} onLimitChange={onLimitChange} />
        </div>
        <div className="text-xs py-2 text-center" style={{ color: 'var(--text-secondary)' }}>
          无进程数据
        </div>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <div className="flex items-center justify-end mb-2">
        <LimitSelector limit={limit} onLimitChange={onLimitChange} />
      </div>
      <table className="w-full table-fixed">
        <thead>
          <tr style={{ color: 'var(--text-secondary)' }}>
            <th className="text-left py-1 w-14">PID</th>
            <th className="text-left py-1 w-24">进程名</th>
            <th 
              className="text-right py-1 cursor-pointer hover:opacity-80 select-none"
              onClick={() => onSortChange('memory')}
              style={{ 
                color: sortBy === 'memory' ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: sortBy === 'memory' ? 'bold' : 'normal'
              }}
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                内存
                {sortBy === 'memory' && <ArrowDown size={10} />}
              </span>
            </th>
            <th 
              className="text-right py-1 cursor-pointer hover:opacity-80 select-none"
              onClick={() => onSortChange('cpu')}
              style={{ 
                color: sortBy === 'cpu' ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: sortBy === 'cpu' ? 'bold' : 'normal'
              }}
            >
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                CPU
                {sortBy === 'cpu' && <ArrowDown size={10} />}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {processes.map((proc) => (
            <tr key={proc.pid}>
              <td className="py-1 w-14">{proc.pid}</td>
              <td className="py-1 w-24 truncate" title={proc.command}>
                {proc.name}
              </td>
              <td className="text-right py-1 whitespace-nowrap">
                {formatBytes(proc.memory.toString())}
              </td>
              <td className="text-right py-1 whitespace-nowrap" style={{ 
                color: proc.cpu_percent > 50 ? 'var(--danger)' : 
                       proc.cpu_percent > 20 ? 'var(--warning)' : 'var(--text-primary)'
              }}>
                {proc.cpu_percent.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Sort Buttons Component
function SortButtons({ sortBy, onSortChange }: { sortBy: string; onSortChange: (sort: 'memory' | 'cpu') => void }) {
  return (
    <div className="flex gap-1">
      <button
        onClick={() => onSortChange('memory')}
        className="text-xs px-2 py-0.5 rounded"
        style={{
          background: sortBy === 'memory' ? 'var(--accent)' : 'var(--bg-tertiary)',
          color: sortBy === 'memory' ? '#fff' : 'var(--text-secondary)',
        }}
      >
        内存
      </button>
      <button
        onClick={() => onSortChange('cpu')}
        className="text-xs px-2 py-0.5 rounded"
        style={{
          background: sortBy === 'cpu' ? 'var(--accent)' : 'var(--bg-tertiary)',
          color: sortBy === 'cpu' ? '#fff' : 'var(--text-secondary)',
        }}
      >
        CPU
      </button>
    </div>
  );
}

// Limit Selector Component
function LimitSelector({ limit, onLimitChange }: { limit: number; onLimitChange: (limit: number) => void }) {
  return (
    <select
      value={limit}
      onChange={(e) => onLimitChange(Number(e.target.value))}
      className="text-xs px-1 py-0.5 rounded"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
    >
      {PROCESS_LIMIT_OPTIONS.map((n) => (
        <option key={n} value={n}>{n}条</option>
      ))}
    </select>
  );
}

// Section Component
function Section({ 
  title, 
  icon, 
  collapsed, 
  onToggle, 
  children 
}: { 
  title: string; 
  icon: React.ReactNode; 
  collapsed: boolean; 
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2.5 text-xs font-medium rounded-t-lg"
        style={{ color: 'var(--text-secondary)' }}
      >
        <div className="flex items-center gap-1.5">
          {icon}
          <span>{title}</span>
        </div>
        <div>
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </div>
      </button>
      {!collapsed && (
        <div className="px-2 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

// Progress Bar Component
function ProgressBar({ icon, label, value, color }: { icon: React.ReactNode | null; label: string; value: number; color: string }) {
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
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clampedValue}%`, background: `linear-gradient(90deg, ${color}, ${color}dd)` }}
        />
      </div>
    </div>
  );
}

// Utility functions
function formatBytes(bytes: string | number): string {
  const b = typeof bytes === 'string' ? parseInt(bytes) || 0 : bytes;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
}
