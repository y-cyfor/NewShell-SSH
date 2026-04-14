import { useState } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { Connection } from '../../types';
import { X, Server } from 'lucide-react';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

interface Props {
  connection?: Connection;
  onClose: () => void;
}

export function AddConnectionModal({ connection, onClose }: Props) {
  const { addConnection, updateConnection } = useConnectionStore();
  const isEdit = !!connection;

  const [form, setForm] = useState({
    name: connection?.name || '',
    host: connection?.host || '',
    port: connection?.port || 22,
    username: connection?.username || '',
    auth_type: connection?.auth_type || 'password' as const,
    password: connection?.password || '',
    private_key: connection?.private_key || '',
    passphrase: connection?.passphrase || '',
    group_name: connection?.group_name || '默认分组',
    remark: connection?.remark || '',
    color: connection?.color || COLORS[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.host || !form.username) return;

    if (isEdit && connection) {
      updateConnection(connection.id, form);
    } else {
      addConnection(form);
    }
    onClose();
  };

  const inputStyle = {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="w-full max-w-md rounded-xl shadow-2xl animate-fade-in overflow-hidden"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-gradient)' }}>
              <Server size={15} style={{ color: '#fff' }} />
            </div>
            <span className="font-semibold text-sm">{isEdit ? '编辑连接' : '添加连接'}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 transition-all" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>服务器名称 *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: 生产环境-Web01" className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all"
              style={{ ...inputStyle, borderColor: 'var(--border)', '--focus-ring': 'var(--accent-subtle-border)' } as React.CSSProperties} required />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>主机地址 *</label>
              <input type="text" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="IP 或域名" className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all" style={inputStyle} required />
            </div>
            <div className="w-20">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>端口</label>
              <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all" style={inputStyle} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>用户名 *</label>
            <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="root" className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all" style={inputStyle} required />
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>认证方式</label>
            <select value={form.auth_type} onChange={(e) => setForm({ ...form, auth_type: e.target.value as any })}
              className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle}>
              <option value="password">密码认证</option>
              <option value="key">密钥认证</option>
            </select>
          </div>

          {form.auth_type === 'password' ? (
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>密码</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="SSH 密码" className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all" style={inputStyle} />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>私钥内容</label>
                <textarea value={form.private_key} onChange={(e) => setForm({ ...form, private_key: e.target.value })}
                  placeholder="粘贴私钥内容" rows={4} className="w-full px-3 py-2 rounded text-sm outline-none resize-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>私钥口令 (如有)</label>
                <input type="password" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all" style={inputStyle} />
              </div>
            </>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>分组</label>
              <input type="text" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                placeholder="默认分组" className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>颜色</label>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                    style={{ background: c, borderColor: form.color === c ? '#fff' : 'transparent', boxShadow: form.color === c ? '0 0 8px rgba(255,255,255,0.3)' : 'none' }} />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>备注</label>
            <input type="text" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })}
              placeholder="可选备注信息" className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 transition-all" style={inputStyle} />
          </div>

          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>取消</button>
            <button type="submit" className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--accent-gradient)', color: '#fff', boxShadow: 'var(--shadow-md)' }}>{isEdit ? '更新' : '添加'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
