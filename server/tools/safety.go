package tools

import (
	"encoding/json"
	"regexp"
	"sync"
)

// DangerousPattern defines a pattern for detecting dangerous commands
type DangerousPattern struct {
	Pattern *regexp.Regexp
	Reason  string
	Level   string // "critical" | "warning"
}

// customPatternJSON is used for parsing custom patterns from JSON
type customPatternJSON struct {
	Pattern string `json:"pattern"`
	Reason  string `json:"reason"`
	Level   string `json:"level"`
}

// SafetyChecker checks commands for dangerous patterns
type SafetyChecker struct {
	predefined []DangerousPattern
	custom     []DangerousPattern
	mu         sync.RWMutex
}

// Global safety checker instance
var GlobalSafetyChecker = NewSafetyChecker()

// NewSafetyChecker creates a safety checker with predefined patterns
func NewSafetyChecker() *SafetyChecker {
	return &SafetyChecker{
		predefined: predefinedPatterns,
	}
}

// predefinedPatterns is the default set of dangerous command patterns
var predefinedPatterns = []DangerousPattern{
	{regexp.MustCompile(`rm\s+(-[a-z]*r[a-z]*|--recursive)\s*/`), "递归删除根目录", "critical"},
	{regexp.MustCompile(`rm\s+(-[a-z]*r[a-z]*|--recursive)\s*~`), "递归删除用户主目录", "critical"},
	{regexp.MustCompile(`mkfs[\.\s]`), "格式化磁盘分区", "critical"},
	{regexp.MustCompile(`dd\s+.*of=/dev/`), "直接写入磁盘设备", "critical"},
	{regexp.MustCompile(`>\s*/dev/sd[a-z]`), "重定向到磁盘设备", "critical"},
	{regexp.MustCompile(`shutdown|reboot|halt|poweroff|init\s+[06]`), "关机/重启系统", "warning"},
	{regexp.MustCompile(`chmod\s+(-R\s+)?777`), "设置过于宽松的权限(777)", "warning"},
	{regexp.MustCompile(`iptables\s+(-F|--flush)`), "清空防火墙规则", "warning"},
	{regexp.MustCompile(`crontab\s+-r`), "删除所有定时任务", "warning"},
	{regexp.MustCompile(`userdel|groupdel`), "删除用户/用户组", "warning"},
	{regexp.MustCompile(`passwd\s+root`), "修改root密码", "warning"},
	{regexp.MustCompile(`:\(\)\{.*\|.*&\};:`), "Fork炸弹", "critical"},
	{regexp.MustCompile(`curl.*\|\s*(ba)?sh`), "远程脚本直接执行", "warning"},
	{regexp.MustCompile(`wget.*\|\s*(ba)?sh`), "远程脚本直接执行", "warning"},
	{regexp.MustCompile(`chmod\s+.*\+s`), "设置SUID/SGID权限", "warning"},
	{regexp.MustCompile(`>\s*/etc/`), "重定向到系统配置目录", "warning"},
}

// Check tests a command against all dangerous patterns
// Returns: isDangerous, reason, level
func (sc *SafetyChecker) Check(command string) (bool, string, string) {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	for _, p := range sc.predefined {
		if p.Pattern.MatchString(command) {
			return true, p.Reason, p.Level
		}
	}

	for _, p := range sc.custom {
		if p.Pattern.MatchString(command) {
			return true, p.Reason, p.Level
		}
	}

	return false, "", ""
}

// SetCustomPatterns updates the custom dangerous patterns
func (sc *SafetyChecker) SetCustomPatterns(patterns []DangerousPattern) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.custom = patterns
}

// GetPredefinedPatterns returns the predefined dangerous patterns
func (sc *SafetyChecker) GetPredefinedPatterns() []DangerousPattern {
	return predefinedPatterns
}

// ParseCustomPatterns parses custom patterns from JSON string
func ParseCustomPatterns(jsonStr string) []DangerousPattern {
	if jsonStr == "" || jsonStr == "[]" {
		return nil
	}

	var customs []customPatternJSON
	if err := json.Unmarshal([]byte(jsonStr), &customs); err != nil {
		return nil
	}

	var patterns []DangerousPattern
	for _, c := range customs {
		re, err := regexp.Compile(c.Pattern)
		if err != nil {
			continue
		}
		level := c.Level
		if level == "" {
			level = "warning"
		}
		patterns = append(patterns, DangerousPattern{
			Pattern: re,
			Reason:  c.Reason,
			Level:   level,
		})
	}
	return patterns
}
