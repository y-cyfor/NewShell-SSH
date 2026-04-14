import { Terminal, IMarker } from '@xterm/xterm';

// 正则表达式模式
const PATTERNS = {
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  url: /https?:\/\/[^\s<>"']+/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
};

interface HighlightMatch {
  type: 'ip' | 'url' | 'email';
  start: number;
  end: number;
  text: string;
  line: number;
  column: number;
}

export class TerminalHighlighter {
  private terminal: Terminal;
  private markers: IMarker[] = [];
  private isActive: boolean = true;
  
  constructor(terminal: Terminal) {
    this.terminal = terminal;
    this.setupHighlighting();
  }
  
  private setupHighlighting() {
    // 监听终端数据写入
    this.terminal.parser.registerOscHandler(8, (data) => {
      // 处理OSC 8超链接序列（如果终端支持）
      return true;
    });
    
    // 自定义处理输出
    const originalWrite = this.terminal.write.bind(this.terminal);
    this.terminal.write = (data: string, callback?: () => void) => {
      if (this.isActive) {
        this.processOutput(data);
      }
      return originalWrite(data, callback);
    };
  }
  
  private processOutput(data: string) {
    // 简单实现：只处理新行
    if (!data.includes('\n') && !data.includes('\r')) {
      return;
    }
    
    // 清除旧的标记
    this.clearMarkers();
    
    // 获取当前可见行
    const buffer = this.terminal.buffer.active;
    const viewportHeight = this.terminal.rows;
    
    for (let i = 0; i < Math.min(buffer.length, viewportHeight); i++) {
      const line = buffer.getLine(i);
      if (line) {
        const text = line.translateToString(true);
        const matches = this.findMatchesInLine(text, i);
        
        for (const match of matches) {
          this.highlightMatch(match);
        }
      }
    }
  }
  
  private findMatchesInLine(text: string, lineNumber: number): HighlightMatch[] {
    const matches: HighlightMatch[] = [];
    let match;
    
    // IP地址匹配
    PATTERNS.ip.lastIndex = 0;
    while ((match = PATTERNS.ip.exec(text)) !== null) {
      matches.push({
        type: 'ip',
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        line: lineNumber,
        column: match.index,
      });
    }
    
    // URL匹配
    PATTERNS.url.lastIndex = 0;
    while ((match = PATTERNS.url.exec(text)) !== null) {
      matches.push({
        type: 'url',
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        line: lineNumber,
        column: match.index,
      });
    }
    
    // 邮箱匹配
    PATTERNS.email.lastIndex = 0;
    while ((match = PATTERNS.email.exec(text)) !== null) {
      matches.push({
        type: 'email',
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        line: lineNumber,
        column: match.index,
      });
    }
    
    return matches;
  }
  
  private highlightMatch(match: HighlightMatch) {
    // 由于xterm.js的装饰API限制，我们使用简单的方法
    // 在实际应用中，可以使用更复杂的装饰系统
  }
  
  private clearMarkers() {
    for (const marker of this.markers) {
      marker.dispose();
    }
    this.markers = [];
  }
  
  setActive(active: boolean) {
    this.isActive = active;
    if (!active) {
      this.clearMarkers();
    }
  }
  
  dispose() {
    this.isActive = false;
    this.clearMarkers();
  }
}

// 辅助函数：在终端中插入高亮标记
export function insertHighlight(terminal: Terminal, text: string, type: 'ip' | 'url' | 'email') {
  // 使用xterm.js的颜色转义序列来高亮文本
  const colors: Record<string, string> = {
    ip: '\x1b[34m', // 蓝色
    url: '\x1b[32m', // 绿色
    email: '\x1b[35m', // 紫色
  };
  
  const reset = '\x1b[0m';
  const color = colors[type] || colors.ip;
  
  terminal.write(`${color}${text}${reset}`);
}

// 辅助函数：处理终端输出并高亮匹配项
// Quick pre-check: only run regexes if data contains potential match characters
export function highlightTerminalOutput(terminal: Terminal, data: string): string {
  // Skip if data is too short to contain IPs, URLs, or emails
  if (data.length < 7 || (!data.includes('.') && !data.includes('@'))) {
    return data;
  }

  let result = data;

  // IP地址高亮
  result = result.replace(PATTERNS.ip, (match) => {
    return `\x1b[34m${match}\x1b[0m`;
  });

  // URL高亮
  result = result.replace(PATTERNS.url, (match) => {
    return `\x1b[32m${match}\x1b[0m`;
  });

  // 邮箱高亮
  result = result.replace(PATTERNS.email, (match) => {
    return `\x1b[35m${match}\x1b[0m`;
  });

  return result;
}
