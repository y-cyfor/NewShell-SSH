package services

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"strings"
	"sync"

	"newshell-server/tools"

	"golang.org/x/crypto/ssh"
)

// InitSSHExecutor registers the SSH command executor with the tools package
func InitSSHExecutor() {
	tools.RegisterSSHExecutor(executeSSHCommandImpl)
}

// executeSSHCommandImpl is the actual SSH command execution implementation
func executeSSHCommandImpl(ctx context.Context, connID string, command string, workingDir string,
	outputChan chan<- tools.ToolOutput, wsBroadcast func(string)) (*tools.ToolResult, error) {

	log.Printf("[SSH] Executing: %s, wsBroadcast nil: %v", command, wsBroadcast == nil)

	// Get or create SSH client
	client, err := GetOrCreateAgentClient(connID)
	if err != nil {
		return &tools.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("SSH连接失败: %v", err),
		}, err
	}

	// Broadcast command header to terminal
	if wsBroadcast != nil {
		wsBroadcast(fmt.Sprintf("\r\n\x1b[33m$ %s\x1b[0m\r\n", command))
	}

	// Create a new session for each command (non-PTY)
	session, err := client.NewSession()
	if err != nil {
		return &tools.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("创建SSH会话失败: %v", err),
		}, err
	}
	defer session.Close()

	// Build the full command
	fullCmd := command
	if workingDir != "" {
		fullCmd = fmt.Sprintf("cd '%s' && %s", workingDir, command)
	}

	// Set up output pipes
	stdout, err := session.StdoutPipe()
	if err != nil {
		return &tools.ToolResult{Success: false, Error: err.Error()}, err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return &tools.ToolResult{Success: false, Error: err.Error()}, err
	}

	// Start the command
	if err := session.Start(fullCmd); err != nil {
		return &tools.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("启动命令失败: %v", err),
		}, err
	}

	// Collect output with WaitGroup to ensure all output is captured
	var output strings.Builder
	var wg sync.WaitGroup
	var mu sync.Mutex

	// Stream stdout
	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text() + "\r\n"
			mu.Lock()
			output.WriteString(line)
			mu.Unlock()
			if outputChan != nil {
				outputChan <- tools.ToolOutput{Chunk: line}
			}
			if wsBroadcast != nil {
				wsBroadcast(line)
			}
		}
	}()

	// Stream stderr
	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text() + "\r\n"
			mu.Lock()
			output.WriteString(line)
			mu.Unlock()
			if outputChan != nil {
				outputChan <- tools.ToolOutput{Chunk: line}
			}
			if wsBroadcast != nil {
				wsBroadcast("\x1b[31m" + line + "\x1b[0m")
			}
		}
	}()

	// Wait for command completion
	done := make(chan error, 1)
	go func() {
		done <- session.Wait()
	}()

	select {
	case err := <-done:
		// Wait for all output goroutines to finish
		wg.Wait()

		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*ssh.ExitError); ok {
				exitCode = exitErr.ExitStatus()
			} else {
				exitCode = -1
			}
		}

		result := &tools.ToolResult{
			Success:  exitCode == 0,
			Output:   output.String(),
			ExitCode: exitCode,
		}
		if exitCode != 0 {
			result.Error = fmt.Sprintf("命令执行失败，退出码: %d", exitCode)
		}

		if wsBroadcast != nil {
			if exitCode == 0 {
				wsBroadcast(fmt.Sprintf("\r\n\x1b[32m✓ 命令完成 (退出码: %d)\x1b[0m\r\n", exitCode))
			} else {
				wsBroadcast(fmt.Sprintf("\r\n\x1b[31m✗ 命令失败 (退出码: %d)\x1b[0m\r\n", exitCode))
			}
		}

		return result, nil

	case <-ctx.Done():
		session.Signal(ssh.SIGKILL)
		wg.Wait()
		return &tools.ToolResult{
			Success: false,
			Output:  output.String(),
			Error:   "命令被取消或超时",
		}, ctx.Err()
	}
}
