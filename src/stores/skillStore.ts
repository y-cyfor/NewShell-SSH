import { create } from 'zustand';
import { LocalSkill } from '../types';
import { getLocalSkills, toggleSkill, uninstallSkill } from '../services/skillService';

interface SkillState {
  localSkills: LocalSkill[];
  loading: boolean;
  loadLocalSkills: () => Promise<void>;
  toggleSkill: (name: string, enabled: boolean) => Promise<void>;
  uninstallSkill: (name: string) => Promise<void>;
}

export const useSkillStore = create<SkillState>((set) => ({
  localSkills: [],
  loading: false,

  loadLocalSkills: async () => {
    set({ loading: true });
    try {
      const skills = await getLocalSkills();
      set({ localSkills: skills });
    } catch {
      set({ localSkills: [] });
    } finally {
      set({ loading: false });
    }
  },

  toggleSkill: async (name, enabled) => {
    await toggleSkill(name, enabled);
    set((state) => ({
      localSkills: state.localSkills.map(s => s.name === name ? { ...s, enabled } : s),
    }));
  },

  uninstallSkill: async (name) => {
    await uninstallSkill(name);
    set((state) => ({
      localSkills: state.localSkills.filter(s => s.name !== name),
    }));
  },
}));
