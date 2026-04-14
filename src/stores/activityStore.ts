import { create } from 'zustand';

type ActivityIcon = 'servers' | 'ai';

interface ActivityState {
  activeIcon: ActivityIcon;
  setActiveIcon: (icon: ActivityIcon) => void;
  toggleIcon: (icon: ActivityIcon) => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activeIcon: 'servers',
  
  setActiveIcon: (icon: ActivityIcon) => {
    set({ activeIcon: icon });
  },
  
  toggleIcon: (icon: ActivityIcon) => {
    const current = get().activeIcon;
    if (current === icon) {
      // 如果点击当前激活的图标，则切换到服务器列表
      set({ activeIcon: 'servers' });
    } else {
      set({ activeIcon: icon });
    }
  },
}));
