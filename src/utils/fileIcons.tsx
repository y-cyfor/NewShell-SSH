import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFolder,
  faFile,
  faFileAlt,
  faFileCode,
  faFilePdf,
  faFileImage,
  faFileArchive,
  faFileAudio,
  faFileVideo,
  faFileExcel,
  faFileWord,
  faFilePowerpoint,
  faDatabase,
  faCog,
  faLock,
  faKey,
  faCertificate,
  faList,
  faTerminal,
  faBox,
  faCube,
  IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import React from 'react';

// 文件扩展名到图标的映射
const FILE_ICON_MAP: Record<string, IconDefinition> = {
  // 文本文件
  'txt': faFileAlt,
  'md': faFileAlt,
  'markdown': faFileAlt,
  'log': faFileAlt,
  
  // 代码文件
  'js': faFileCode,
  'jsx': faFileCode,
  'ts': faFileCode,
  'tsx': faFileCode,
  'py': faFileCode,
  'go': faFileCode,
  'java': faFileCode,
  'php': faFileCode,
  'c': faFileCode,
  'cpp': faFileCode,
  'h': faFileCode,
  'cs': faFileCode,
  'rb': faFileCode,
  'rs': faFileCode,
  'swift': faFileCode,
  'kt': faFileCode,
  'scala': faFileCode,
  'html': faFileCode,
  'htm': faFileCode,
  'css': faFileCode,
  'scss': faFileCode,
  'less': faFileCode,
  'vue': faFileCode,
  'svelte': faFileCode,
  
  // 配置文件
  'json': faList,
  'yaml': faList,
  'yml': faList,
  'xml': faList,
  'toml': faList,
  'ini': faList,
  'conf': faCog,
  'config': faCog,
  'env': faLock,
  
  // Shell脚本
  'sh': faTerminal,
  'bash': faTerminal,
  'zsh': faTerminal,
  'fish': faTerminal,
  'bat': faTerminal,
  'cmd': faTerminal,
  'ps1': faTerminal,
  
  // 数据库文件
  'sql': faDatabase,
  'db': faDatabase,
  'sqlite': faDatabase,
  'sqlite3': faDatabase,
  'mdb': faDatabase,
  
  // 容器和虚拟化
  'dockerfile': faBox,
  'docker-compose.yml': faBox,
  'docker-compose.yaml': faBox,
  'containerfile': faBox,
  
  // 文档文件
  'pdf': faFilePdf,
  'doc': faFileWord,
  'docx': faFileWord,
  'xls': faFileExcel,
  'xlsx': faFileExcel,
  'ppt': faFilePowerpoint,
  'pptx': faFilePowerpoint,
  
  // 图片文件
  'jpg': faFileImage,
  'jpeg': faFileImage,
  'png': faFileImage,
  'gif': faFileImage,
  'svg': faFileImage,
  'webp': faFileImage,
  'ico': faFileImage,
  
  // 压缩文件
  'zip': faFileArchive,
  'rar': faFileArchive,
  '7z': faFileArchive,
  'tar': faFileArchive,
  'gz': faFileArchive,
  'bz2': faFileArchive,
  
  // 音频文件
  'mp3': faFileAudio,
  'wav': faFileAudio,
  'flac': faFileAudio,
  'aac': faFileAudio,
  'ogg': faFileAudio,
  
  // 视频文件
  'mp4': faFileVideo,
  'avi': faFileVideo,
  'mkv': faFileVideo,
  'mov': faFileVideo,
  'wmv': faFileVideo,
  
  // 可执行文件
  'exe': faCog,
  'msi': faCog,
  'app': faCog,
  'deb': faCog,
  'rpm': faCog,
  'dmg': faCog,
  
  // 密钥和证书
  'pem': faKey,
  'key': faKey,
  'crt': faCertificate,
  'cert': faCertificate,
  'cer': faCertificate,
  
  // 3D和模型
  'obj': faCube,
  'fbx': faCube,
  'gltf': faCube,
  'glb': faCube,
};

// 文件名到图标的映射
const FILENAME_ICON_MAP: Record<string, IconDefinition> = {
  'dockerfile': faBox,
  'makefile': faCog,
  'rakefile': faCog,
  'gemfile': faCog,
  'cargo.toml': faCog,
  'package.json': faList,
  'composer.json': faList,
  '.gitignore': faLock,
  '.dockerignore': faLock,
  '.env': faLock,
  'readme.md': faFileAlt,
  'license': faFileAlt,
  'changelog': faFileAlt,
};

// 获取图标颜色
function getIconColor(fileName: string, isDirectory: boolean): string {
  if (isDirectory) {
    return '#f59e0b'; // 黄色文件夹
  }
  
  const lowerName = fileName.toLowerCase();
  
  // 代码文件
  if (lowerName.match(/\.(js|jsx|ts|tsx|py|go|java|php|c|cpp|h|cs|rb|rs|swift|kt|scala|vue|svelte)$/)) {
    return '#3b82f6'; // 蓝色
  }
  
  // 配置文件
  if (lowerName.match(/\.(json|yaml|yml|xml|toml|ini|conf|config|env)$/)) {
    return '#8b5cf6'; // 紫色
  }
  
  // 文档文件
  if (lowerName.match(/\.(md|txt|pdf|doc|docx|xls|xlsx|ppt|pptx)$/)) {
    return '#10b981'; // 绿色
  }
  
  // 图片文件
  if (lowerName.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/)) {
    return '#f97316'; // 橙色
  }
  
  // 压缩文件
  if (lowerName.match(/\.(zip|rar|7z|tar|gz|bz2)$/)) {
    return '#ef4444'; // 红色
  }
  
  // 可执行文件
  if (lowerName.match(/\.(exe|msi|app|deb|rpm|dmg)$/)) {
    return '#6366f1'; // 靛蓝色
  }
  
  // Shell脚本
  if (lowerName.match(/\.(sh|bash|zsh|fish|bat|cmd|ps1)$/)) {
    return '#14b8a6'; // 青色
  }
  
  // 数据库文件
  if (lowerName.match(/\.(sql|db|sqlite|sqlite3|mdb)$/)) {
    return '#f43f5e'; // 玫红色
  }
  
  return '#64748b'; // 默认灰色
}

export function getFileIcon(fileName: string, isDirectory: boolean = false, size: number = 16): React.ReactNode {
  const icon = isDirectory ? faFolder : (FILENAME_ICON_MAP[fileName.toLowerCase()] || FILE_ICON_MAP[fileName.split('.').pop()?.toLowerCase() || ''] || faFile);
  const color = getIconColor(fileName, isDirectory);
  
  // 将数字大小转换为FontAwesome支持的格式
  let sizeProp: 'xs' | 'sm' | 'lg' | '1x' | '2x' | '3x' | '4x' | '5x' | '6x' | '7x' | '8x' | '9x' | '10x' | undefined;
  if (size <= 10) sizeProp = 'xs';
  else if (size <= 14) sizeProp = 'sm';
  else if (size <= 20) sizeProp = '1x';
  else if (size <= 28) sizeProp = 'lg';
  else sizeProp = '2x';
  
  return <FontAwesomeIcon icon={icon} size={sizeProp} style={{ color, width: `${size}px`, height: `${size}px` }} />;
}

export function getFileType(fileName: string, isDirectory: boolean = false): string {
  if (isDirectory) {
    return '文件夹';
  }

  const lowerName = fileName.toLowerCase();
  
  // 检查文件名映射
  if (FILENAME_ICON_MAP[lowerName]) {
    const typeMap: Record<string, string> = {
      'dockerfile': 'Docker',
      'makefile': 'Makefile',
      'rakefile': 'Ruby',
      'gemfile': 'Ruby',
      'cargo.toml': 'Rust',
      'package.json': 'JSON',
      'composer.json': 'PHP',
      '.gitignore': 'Git',
      '.dockerignore': 'Docker',
      '.env': 'Environment',
      'readme.md': '文档',
      'license': '许可证',
      'changelog': '更新日志',
    };
    return typeMap[lowerName] || '文件';
  }
  
  // 提取扩展名
  const dotIndex = lowerName.lastIndexOf('.');
  if (dotIndex > 0) {
    const ext = lowerName.substring(dotIndex + 1);
    const typeMap: Record<string, string> = {
      'txt': '文本',
      'md': 'Markdown',
      'js': 'JavaScript',
      'jsx': 'React',
      'ts': 'TypeScript',
      'tsx': 'React',
      'py': 'Python',
      'go': 'Go',
      'java': 'Java',
      'php': 'PHP',
      'c': 'C',
      'cpp': 'C++',
      'h': 'C/C++',
      'cs': 'C#',
      'rb': 'Ruby',
      'rs': 'Rust',
      'swift': 'Swift',
      'kt': 'Kotlin',
      'scala': 'Scala',
      'html': 'HTML',
      'htm': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'less': 'LESS',
      'vue': 'Vue',
      'svelte': 'Svelte',
      'json': 'JSON',
      'yaml': 'YAML',
      'yml': 'YAML',
      'xml': 'XML',
      'toml': 'TOML',
      'ini': 'INI',
      'conf': '配置',
      'config': '配置',
      'env': '环境变量',
      'sh': 'Shell',
      'bash': 'Bash',
      'zsh': 'Zsh',
      'fish': 'Fish',
      'bat': '批处理',
      'cmd': '命令',
      'ps1': 'PowerShell',
      'sql': 'SQL',
      'db': '数据库',
      'sqlite': 'SQLite',
      'pdf': 'PDF',
      'doc': 'Word',
      'docx': 'Word',
      'xls': 'Excel',
      'xlsx': 'Excel',
      'ppt': 'PowerPoint',
      'pptx': 'PowerPoint',
      'jpg': 'JPEG',
      'jpeg': 'JPEG',
      'png': 'PNG',
      'gif': 'GIF',
      'svg': 'SVG',
      'zip': 'ZIP',
      'rar': 'RAR',
      '7z': '7-Zip',
      'tar': 'TAR',
      'gz': 'GZIP',
      'mp3': 'MP3',
      'wav': 'WAV',
      'mp4': 'MP4',
      'avi': 'AVI',
      'mkv': 'MKV',
      'exe': '可执行文件',
      'msi': '安装包',
      'pem': 'PEM证书',
      'key': '密钥',
      'crt': '证书',
    };
    return typeMap[ext] || ext.toUpperCase();
  }
  
  return '文件';
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
