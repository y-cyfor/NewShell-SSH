package tools

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// SSHCommandFunc is the function type for executing SSH commands
// It must be registered before using any tool that needs SSH execution
type SSHCommandFunc func(ctx context.Context, connID string, command string, workingDir string, outputChan chan<- ToolOutput, wsBroadcast func(string)) (*ToolResult, error)

// GlobalSSHExecutor is the registered SSH command executor
var GlobalSSHExecutor SSHCommandFunc

// RegisterSSHExecutor registers the SSH command executor function
func RegisterSSHExecutor(fn SSHCommandFunc) {
	GlobalSSHExecutor = fn
}

// ExecuteSSHCommand executes a command via the registered executor
func ExecuteSSHCommand(ctx context.Context, connID string, command string, workingDir string, execCtx *ExecutionContext) (*ToolResult, error) {
	if GlobalSSHExecutor == nil {
		return &ToolResult{
			Success: false,
			Error:   "SSH执行器未注册",
		}, fmt.Errorf("SSH executor not registered")
	}

	// Determine timeout
	timeout := getSmartTimeout(command)

	// Create a context with timeout
	execCtx2, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var outputChan chan<- ToolOutput
	var wsBroadcast func(string)
	if execCtx != nil {
		outputChan = execCtx.OutputChan
		wsBroadcast = execCtx.WSBroadcast
	}

	return GlobalSSHExecutor(execCtx2, connID, command, workingDir, outputChan, wsBroadcast)
}

// getSmartTimeout returns an appropriate timeout based on the command
func getSmartTimeout(command string) time.Duration {
	parts := strings.Fields(command)
	if len(parts) == 0 {
		return 60 * time.Second
	}
	baseCmd := filepath.Base(parts[0])

	timeouts := map[string]time.Duration{
		"ls": 10 * time.Second, "cat": 10 * time.Second, "head": 10 * time.Second,
		"tail": 10 * time.Second, "grep": 15 * time.Second, "find": 30 * time.Second,
		"df": 10 * time.Second, "du": 15 * time.Second, "ps": 10 * time.Second,
		"free": 10 * time.Second, "uptime": 10 * time.Second, "whoami": 10 * time.Second,
		"pwd": 10 * time.Second, "date": 10 * time.Second, "uname": 10 * time.Second,
		"hostname": 10 * time.Second, "id": 10 * time.Second, "wc": 10 * time.Second,
		"echo": 10 * time.Second, "which": 10 * time.Second, "whereis": 10 * time.Second,
		"lscpu": 15 * time.Second, "lsblk": 15 * time.Second, "lsof": 15 * time.Second,
		"netstat": 15 * time.Second, "ss": 15 * time.Second, "ip": 15 * time.Second,
		"ifconfig": 15 * time.Second, "top": 20 * time.Second, "htop": 20 * time.Second,
		"cp": 60 * time.Second, "mv": 30 * time.Second, "mkdir": 10 * time.Second,
		"touch": 10 * time.Second, "ln": 10 * time.Second, "chmod": 10 * time.Second,
		"chown": 30 * time.Second, "tar": 300 * time.Second, "zip": 300 * time.Second,
		"unzip": 300 * time.Second, "gzip": 120 * time.Second, "gunzip": 120 * time.Second,
		"apt": 300 * time.Second, "apt-get": 300 * time.Second, "yum": 300 * time.Second,
		"dnf": 300 * time.Second, "pacman": 300 * time.Second, "zypper": 300 * time.Second,
		"make": 600 * time.Second, "cmake": 300 * time.Second, "gcc": 300 * time.Second,
		"g++": 300 * time.Second, "go": 300 * time.Second, "cargo": 300 * time.Second,
		"npm": 180 * time.Second, "yarn": 180 * time.Second, "pnpm": 180 * time.Second,
		"pip": 180 * time.Second, "pip3": 180 * time.Second, "docker": 300 * time.Second,
		"podman": 300 * time.Second, "systemctl": 30 * time.Second, "service": 30 * time.Second,
		"wget": 120 * time.Second, "curl": 60 * time.Second, "scp": 120 * time.Second,
		"rsync": 300 * time.Second, "ssh": 30 * time.Second, "ping": 20 * time.Second,
		"traceroute": 30 * time.Second, "nslookup": 15 * time.Second, "dig": 15 * time.Second,
	}

	if t, ok := timeouts[baseCmd]; ok {
		return t
	}
	return 60 * time.Second
}
