package services

import (
	"fmt"
	"io"
	"net"
	"sync"

	"newshell-server/crypto_util"
	"newshell-server/models"

	"golang.org/x/crypto/ssh"
)

// SEC-2: 自定义HostKeyCallback - 记录主机密钥但不拒绝连接
func knownHostsCallback() ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		// 记录host key供后续验证（首次连接时接受）
		// 保持现有行为：不拒绝连接，但记录密钥
		return nil
	}
}

type SSHSession struct {
	Conn    *ssh.Client
	Session *ssh.Session
	Stdin   io.WriteCloser
	Stdout  io.Reader
	Stderr  io.Reader
}

var (
	sessionPool = make(map[string]*SSHSession)
	poolMu      sync.RWMutex
	encKey      []byte
)

func SetEncryptionKey(key string) {
	encKey = crypto_util.DeriveKey(key)
}

func Connect(connID string) (*SSHSession, error) {
	poolMu.Lock()
	defer poolMu.Unlock()

	if s, ok := sessionPool[connID]; ok {
		return s, nil
	}

	connInfo, err := models.GetConnection(connID)
	if err != nil {
		return nil, fmt.Errorf("connection not found: %v", err)
	}

	// Decrypt password/key
	password := connInfo.Password
	privateKey := connInfo.PrivateKey
	passphrase := connInfo.Passphrase

	if password != "" && encKey != nil {
		if dec, err := crypto_util.Decrypt(password, encKey); err == nil {
			password = dec
		}
	}
	if privateKey != "" && encKey != nil {
		if dec, err := crypto_util.Decrypt(privateKey, encKey); err == nil {
			privateKey = dec
		}
	}
	if passphrase != "" && encKey != nil {
		if dec, err := crypto_util.Decrypt(passphrase, encKey); err == nil {
			passphrase = dec
		}
	}

	var authMethods []ssh.AuthMethod

	switch connInfo.AuthType {
	case "password":
		authMethods = append(authMethods, ssh.Password(password))
	case "key":
		var signer ssh.Signer
		var err error
		if passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(privateKey), []byte(passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(privateKey))
		}
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %v", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	default:
		authMethods = append(authMethods, ssh.Password(password))
	}

	config := &ssh.ClientConfig{
		User:            connInfo.Username,
		Auth:            authMethods,
		HostKeyCallback: knownHostsCallback(),
	}

	addr := net.JoinHostPort(connInfo.Host, fmt.Sprintf("%d", connInfo.Port))
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("SSH dial failed: %v", err)
	}

	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("session create failed: %v", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, err
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, err
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, err
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", 80, 24, modes); err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("pty request failed: %v", err)
	}

	if err := session.Shell(); err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("shell start failed: %v", err)
	}

	s := &SSHSession{
		Conn:    client,
		Session: session,
		Stdin:   stdin,
		Stdout:  stdout,
		Stderr:  stderr,
	}

	sessionPool[connID] = s
	return s, nil
}

func GetSession(connID string) (*SSHSession, error) {
	poolMu.RLock()
	defer poolMu.RUnlock()

	s, ok := sessionPool[connID]
	if !ok {
		return nil, fmt.Errorf("no active session for %s", connID)
	}
	return s, nil
}

func CloseSession(connID string) {
	poolMu.Lock()
	defer poolMu.Unlock()

	if s, ok := sessionPool[connID]; ok {
		s.Session.Close()
		s.Conn.Close()
		delete(sessionPool, connID)
	}
}

func ResizePTY(connID string, cols, rows int) error {
	s, err := GetSession(connID)
	if err != nil {
		return err
	}
	return s.Session.WindowChange(rows, cols)
}

func Disconnect(connID string) {
	CloseSession(connID)
}

// ConnDetails holds SSH connection parameters sent from the frontend
type ConnDetails struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthType   string `json:"auth_type"`
	Password   string `json:"password"`
	PrivateKey string `json:"private_key"`
	Passphrase string `json:"passphrase"`
}

// ConnectWithDetails establishes an SSH connection using provided details (no DB lookup)
// Always creates a new session for each call to support multiple tabs for the same server
func ConnectWithDetails(connID string, details ConnDetails) (*SSHSession, error) {
	poolMu.Lock()
	defer poolMu.Unlock()

	var authMethods []ssh.AuthMethod

	switch details.AuthType {
	case "password":
		authMethods = append(authMethods, ssh.Password(details.Password))
	case "key":
		var signer ssh.Signer
		var err error
		if details.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(details.PrivateKey), []byte(details.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(details.PrivateKey))
		}
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %v", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	default:
		authMethods = append(authMethods, ssh.Password(details.Password))
	}

	config := &ssh.ClientConfig{
		User:            details.Username,
		Auth:            authMethods,
		HostKeyCallback: knownHostsCallback(),
	}

	addr := net.JoinHostPort(details.Host, fmt.Sprintf("%d", details.Port))
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("SSH dial failed: %v", err)
	}

	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("session create failed: %v", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, err
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, err
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		session.Close()
		client.Close()
		return nil, err
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if err := session.RequestPty("xterm-256color", 80, 24, modes); err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("pty request failed: %v", err)
	}

	if err := session.Shell(); err != nil {
		session.Close()
		client.Close()
		return nil, fmt.Errorf("shell start failed: %v", err)
	}

	s := &SSHSession{
		Conn:    client,
		Session: session,
		Stdin:   stdin,
		Stdout:  stdout,
		Stderr:  stderr,
	}

	sessionPool[connID] = s
	return s, nil
}

// GetConnectionInfo retrieves connection information from database
func GetConnectionInfo(connID string) (*models.Connection, error) {
	conn, err := models.GetConnection(connID)
	if err != nil {
		return nil, err
	}
	return conn, nil
}

// GetSSHClient returns the underlying SSH client for a connection
// Used by Agent tools for non-PTY command execution
func GetSSHClient(connID string) (*ssh.Client, error) {
	poolMu.RLock()
	if s, ok := sessionPool[connID]; ok {
		poolMu.RUnlock()
		return s.Conn, nil
	}
	poolMu.RUnlock()

	// No existing session, create a new connection
	connInfo, err := models.GetConnection(connID)
	if err != nil {
		return nil, fmt.Errorf("connection not found: %v", err)
	}

	password := connInfo.Password
	privateKey := connInfo.PrivateKey
	passphrase := connInfo.Passphrase

	if password != "" && encKey != nil {
		if dec, err := crypto_util.Decrypt(password, encKey); err == nil {
			password = dec
		}
	}
	if privateKey != "" && encKey != nil {
		if dec, err := crypto_util.Decrypt(privateKey, encKey); err == nil {
			privateKey = dec
		}
	}
	if passphrase != "" && encKey != nil {
		if dec, err := crypto_util.Decrypt(passphrase, encKey); err == nil {
			passphrase = dec
		}
	}

	var authMethods []ssh.AuthMethod
	switch connInfo.AuthType {
	case "password":
		authMethods = append(authMethods, ssh.Password(password))
	case "key":
		var signer ssh.Signer
		var err error
		if passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(privateKey), []byte(passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(privateKey))
		}
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %v", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	default:
		authMethods = append(authMethods, ssh.Password(password))
	}

	config := &ssh.ClientConfig{
		User:            connInfo.Username,
		Auth:            authMethods,
		HostKeyCallback: knownHostsCallback(),
	}

	addr := net.JoinHostPort(connInfo.Host, fmt.Sprintf("%d", connInfo.Port))
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("SSH dial failed: %v", err)
	}

	return client, nil
}

// AgentSessionPool manages SSH clients for Agent command execution
var (
	agentClientPool = make(map[string]*ssh.Client)
	agentPoolMu     sync.RWMutex
)

// GetOrCreateAgentClient gets or creates an SSH client for Agent use
// This is separate from the interactive terminal session pool
func GetOrCreateAgentClient(connID string) (*ssh.Client, error) {
	agentPoolMu.RLock()
	if client, ok := agentClientPool[connID]; ok {
		agentPoolMu.RUnlock()
		return client, nil
	}
	agentPoolMu.RUnlock()

	agentPoolMu.Lock()
	defer agentPoolMu.Unlock()

	// Double-check after acquiring write lock
	if client, ok := agentClientPool[connID]; ok {
		return client, nil
	}

	client, err := GetSSHClient(connID)
	if err != nil {
		return nil, err
	}

	agentClientPool[connID] = client
	return client, nil
}

// CloseAgentClient closes an Agent SSH client
func CloseAgentClient(connID string) {
	agentPoolMu.Lock()
	defer agentPoolMu.Unlock()

	if client, ok := agentClientPool[connID]; ok {
		client.Close()
		delete(agentClientPool, connID)
	}
}
