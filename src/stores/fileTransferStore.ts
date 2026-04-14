import { create } from 'zustand';
import api from '../services/api';

export interface TransferTask {
  id: string;
  type: 'upload' | 'download';
  fileName: string;
  filePath: string;
  localPath?: string;
  totalSize: number;
  transferred: number;
  speed: number;
  status: 'pending' | 'transferring' | 'paused' | 'completed' | 'error' | 'waiting';
  error?: string;
  startTime: number;
  connId: string;
  savePath?: string; // 用户指定的保存路径
  blobUrl?: string;
}

interface FileTransferState {
  transfers: TransferTask[];
  downloadQueue: string[]; // 等待下载的任务队列
  addTransfer: (task: Omit<TransferTask, 'id' | 'startTime' | 'speed' | 'status'>) => string;
  updateTransfer: (id: string, updates: Partial<TransferTask>) => void;
  removeTransfer: (id: string) => void;
  pauseTransfer: (id: string) => void;
  resumeTransfer: (id: string) => void;
  uploadFile: (connId: string, targetPath: string, file: File) => Promise<void>;
  downloadFile: (connId: string, filePath: string, savePath?: string) => void;
  processQueue: () => void;
  getActiveDownloads: () => TransferTask[];
}

function generateId(): string {
  return `transfer-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 9)}`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
}

function getConcurrentLimit(): number {
  try {
    const stored = localStorage.getItem('newshell_download_settings');
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.concurrentDownloads || 0;
    }
  } catch {}
  return 0;
}

function getSpeedLimit(): number {
  try {
    const stored = localStorage.getItem('newshell_download_settings');
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.downloadSpeedLimit || 0;
    }
  } catch {}
  return 0;
}

export const useFileTransferStore = create<FileTransferState>((set, get) => ({
  transfers: [],
  downloadQueue: [],

  addTransfer: (task) => {
    const id = generateId();
    const newTask: TransferTask = {
      ...task,
      id,
      startTime: Date.now(),
      speed: 0,
      status: 'pending',
    };
    set((state) => ({ transfers: [...state.transfers, newTask] }));
    return id;
  },

  updateTransfer: (id, updates) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  },

  removeTransfer: (id) => {
    set((state) => {
      const transfer = state.transfers.find(t => t.id === id);
      if (transfer?.blobUrl) {
        URL.revokeObjectURL(transfer.blobUrl);
      }
      return { 
        transfers: state.transfers.filter((t) => t.id !== id),
        downloadQueue: state.downloadQueue.filter(qid => qid !== id),
      };
    });
  },

  pauseTransfer: (id) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id && t.status === 'transferring'
          ? { ...t, status: 'paused' as const }
          : t
      ),
    }));
  },

  resumeTransfer: (id) => {
    set((state) => ({
      transfers: state.transfers.map((t) =>
        t.id === id && t.status === 'paused'
          ? { ...t, status: 'transferring' as const }
          : t
      ),
    }));
  },

  getActiveDownloads: () => {
    return get().transfers.filter(t => 
      t.type === 'download' && t.status === 'transferring'
    );
  },

  processQueue: () => {
    const { transfers, downloadQueue, updateTransfer } = get();
    const concurrentLimit = getConcurrentLimit();
    const activeDownloads = transfers.filter(t => 
      t.type === 'download' && t.status === 'transferring'
    );
    
    // 如果没有限制或活跃下载数小于限制，开始下一个下载
    const canStart = concurrentLimit === 0 || activeDownloads.length < concurrentLimit;

    if (canStart && downloadQueue.length > 0) {
      const nextId = downloadQueue[0];
      const nextTask = transfers.find(t => t.id === nextId);

      if (nextTask && nextTask.status === 'waiting') {
        set((state) => ({
          downloadQueue: state.downloadQueue.slice(1),
        }));
        // Use setTimeout to break the call stack and prevent recursion
        setTimeout(() => {
          executeDownload(nextTask.id, nextTask.connId, nextTask.filePath, nextTask.savePath);
        }, 0);
      }
    }
  },

  uploadFile: async (connId, targetPath, file) => {
    const { addTransfer, updateTransfer } = get();
    const transferId = addTransfer({
      type: 'upload',
      fileName: file.name,
      filePath: `${targetPath}/${file.name}`,
      totalSize: file.size,
      transferred: 0,
      connId,
    });

    updateTransfer(transferId, { status: 'transferring' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', targetPath);

      await api.post(`/api/files/${connId}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const transferred = progressEvent.loaded;
          const total = progressEvent.total || file.size;
          const transfer = get().transfers.find(t => t.id === transferId);
          const elapsed = transfer ? (Date.now() - transfer.startTime) / 1000 : 1;
          const speed = elapsed > 0 ? transferred / elapsed : 0;

          updateTransfer(transferId, {
            transferred,
            totalSize: total,
            speed,
            status: 'transferring',
          });
        },
      });

      updateTransfer(transferId, {
        transferred: file.size,
        status: 'completed',
        speed: 0,
      });
    } catch (error: any) {
      updateTransfer(transferId, {
        status: 'error',
        error: error.response?.data?.error || error.message || '上传失败',
        speed: 0,
      });
    }
  },

  downloadFile: (connId, filePath, savePath) => {
    const { addTransfer, transfers, downloadQueue, processQueue } = get();
    const fileName = filePath.split('/').pop() || 'download';
    const concurrentLimit = getConcurrentLimit();
    const activeDownloads = transfers.filter(t => 
      t.type === 'download' && t.status === 'transferring'
    );
    
    const transferId = addTransfer({
      type: 'download',
      fileName,
      filePath,
      totalSize: 0,
      transferred: 0,
      connId,
      savePath,
    });

    // 检查是否需要加入队列等待
    const shouldQueue = concurrentLimit > 0 && activeDownloads.length >= concurrentLimit;
    
    if (shouldQueue) {
      // 加入等待队列
      get().updateTransfer(transferId, { status: 'waiting' });
      set((state) => ({ downloadQueue: [...state.downloadQueue, transferId] }));
      // 触发事件让UI展开
      window.dispatchEvent(new CustomEvent('downloadStarted', { detail: { transferId } }));
    } else {
      // 直接开始下载
      executeDownload(transferId, connId, filePath, savePath);
    }
  },
}));

// 实际执行下载的函数
async function executeDownload(
  transferId: string,
  connId: string,
  filePath: string,
  savePath?: string
) {
  const { updateTransfer, processQueue } = useFileTransferStore.getState();
  const fileName = filePath.split('/').pop() || 'download';
  
  updateTransfer(transferId, { status: 'transferring' });
  
  // 触发下载事件
  window.dispatchEvent(new CustomEvent('downloadStarted', { detail: { transferId } }));

  try {
    const startTime = Date.now();
    let lastTransferred = 0;
    let speedLimitStartTime = Date.now();
    
    const blob = await new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${api.defaults.baseURL || ''}/api/files/${connId}/download?path=${encodeURIComponent(filePath)}`;
      
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      
      const token = localStorage.getItem('newshell_sync_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          const transferred = e.loaded;
          const total = e.total;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? transferred / elapsed : 0;

          updateTransfer(transferId, {
            transferred,
            totalSize: total,
            speed,
            status: 'transferring',
          });

          // 限速处理
          const speedLimit = getSpeedLimit() * 1024; // 转换为 bytes/s
          if (speedLimit > 0) {
            const elapsedSinceLast = (Date.now() - speedLimitStartTime) / 1000;
            if (elapsedSinceLast >= 1) {
              const currentSpeed = (transferred - lastTransferred) / elapsedSinceLast;
              if (currentSpeed > speedLimit) {
                const delayMs = ((transferred - lastTransferred) / speedLimit - elapsedSinceLast) * 1000;
                if (delayMs > 0) {
                  // 这里只是更新显示速度，实际限速由浏览器控制
                }
                speedLimitStartTime = Date.now();
                lastTransferred = transferred;
              }
            }
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`下载失败: HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.ontimeout = () => reject(new Error('下载超时'));
      xhr.timeout = 60000;

      xhr.send();
    });

    // 创建下载链接
    const blobUrl = URL.createObjectURL(blob);
    const fullFileName = savePath ? `${savePath}/${fileName}` : fileName;
    
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fullFileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 100);

    updateTransfer(transferId, {
      transferred: blob.size,
      totalSize: blob.size,
      status: 'completed',
      speed: 0,
      blobUrl: blobUrl,
    });

    // 处理队列中的下一个下载
    processQueue();

  } catch (error: any) {
    updateTransfer(transferId, {
      status: 'error',
      error: error.message || '下载失败',
      speed: 0,
    });
    
    // 即使失败也处理队列
    processQueue();
  }
}

export { formatSpeed };
