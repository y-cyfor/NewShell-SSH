import { useState, useEffect, useRef } from 'react';
import { LocalSkill } from '../../types';
import { getLocalSkills, toggleSkill, uninstallSkill, importSkill } from '../../services/skillService';
import { Upload, Trash2, ToggleLeft, ToggleRight, Package, FileArchive, Loader } from 'lucide-react';

export function SkillMarketPanel() {
  const [localSkills, setLocalSkills] = useState<LocalSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLocalSkills();
  }, []);

  const loadLocalSkills = async () => {
    setLoading(true);
    try {
      const skills = await getLocalSkills();
      setLocalSkills(skills);
    } catch {
      setLocalSkills([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('请选择 ZIP 格式的文件');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    setError('');
    try {
      await importSkill(file);
      await loadLocalSkills();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await toggleSkill(name, enabled);
      await loadLocalSkills();
    } catch (err: any) {
      setError(err.message || '操作失败');
    }
  };

  const handleUninstall = async (name: string) => {
    try {
      await uninstallSkill(name);
      await loadLocalSkills();
    } catch (err: any) {
      setError(err.message || '卸载失败');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Package size={14} /> Skill 管理
      </h3>

      {/* Import section */}
      <div className="p-3 rounded" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>导入 Skill</div>
        <p className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)' }}>
          选择 Skill 的 ZIP 压缩包导入。导入后文件将复制到程序目录（~/.newshell/skills/），原始文件可安全删除。
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs"
            style={{ background: 'var(--accent)', color: '#fff', opacity: importing ? 0.5 : 1 }}
          >
            {importing ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
            {importing ? '导入中...' : '选择 ZIP 文件'}
          </button>
          <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            <FileArchive size={10} /> 仅支持 .zip 格式
          </div>
        </div>
      </div>

      {error && (
        <div className="p-2 rounded text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
          {error}
        </div>
      )}

      {/* Installed skills list */}
      <div>
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
          已安装 ({localSkills.length})
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Loader size={14} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : localSkills.length === 0 ? (
          <div className="text-center py-8 text-xs" style={{ color: 'var(--text-secondary)' }}>
            暂无已安装的Skill，请导入ZIP文件
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {localSkills.map(skill => (
              <div key={skill.name} className="flex items-center gap-3 p-2 rounded"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                <span className="text-lg">{skill.icon || '📦'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{skill.name}</div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{skill.description}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>v{skill.version} · {skill.source}</div>
                </div>
                <button onClick={() => handleToggle(skill.name, !skill.enabled)}
                  className="p-1 rounded" title={skill.enabled ? '禁用' : '启用'}
                  style={{ color: skill.enabled ? '#22c55e' : 'var(--text-secondary)' }}>
                  {skill.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                <button onClick={() => handleUninstall(skill.name)}
                  className="p-1 rounded" title="卸载" style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
