import { getBaseUrl } from './api';
import { LocalSkill } from '../types';

const BASE = () => getBaseUrl();

// Local skills
export async function getLocalSkills(): Promise<LocalSkill[]> {
  try {
    const res = await fetch(`${BASE()}/api/agent/skills/installed`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function toggleSkill(name: string, enabled: boolean) {
  const res = await fetch(`${BASE()}/api/agent/skills/${name}/toggle`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return res.json();
}

export async function uninstallSkill(name: string) {
  const res = await fetch(`${BASE()}/api/agent/skills/${name}`, { method: 'DELETE' });
  return res.json();
}

export async function importSkill(file: File): Promise<{ status: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE()}/api/agent/skills/import`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '导入失败');
  }

  return res.json();
}
