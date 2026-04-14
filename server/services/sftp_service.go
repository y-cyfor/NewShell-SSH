package services

import (
	"fmt"
	"io"
	"sync"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SFTPClient struct {
	client *sftp.Client
	conn   *ssh.Client
}

// SFTP connection pool - separate from terminal sessions
var (
	sftpClientPool = make(map[string]*ssh.Client)
	sftpPoolMu     sync.RWMutex
)

func ConnectSFTP(connID string) (*SFTPClient, error) {
	// Use a separate SSH connection for SFTP to avoid conflicts with terminal PTY
	sftpPoolMu.RLock()
	existingClient, exists := sftpClientPool[connID]
	sftpPoolMu.RUnlock()

	var conn *ssh.Client
	var err error

	if exists {
		// Test if connection is still alive
		sess, testErr := existingClient.NewSession()
		if testErr == nil {
			sess.Close()
			conn = existingClient
		} else {
			// Connection is dead, remove from pool
			sftpPoolMu.Lock()
			delete(sftpClientPool, connID)
			sftpPoolMu.Unlock()
			exists = false
		}
	}

	if !exists {
		// Create a new SSH connection specifically for SFTP
		conn, err = GetSSHClient(connID)
		if err != nil {
			return nil, fmt.Errorf("SSH连接失败: %v", err)
		}
		// Store in SFTP pool
		sftpPoolMu.Lock()
		sftpClientPool[connID] = conn
		sftpPoolMu.Unlock()
	}

	// Create SFTP client using the SSH connection
	sftpClient, err := sftp.NewClient(conn)
	if err != nil {
		return nil, fmt.Errorf("SFTP client failed: %v", err)
	}

	return &SFTPClient{client: sftpClient, conn: conn}, nil
}

// CloseSFTPClient closes the SFTP connection for a given connID
func CloseSFTPClient(connID string) {
	sftpPoolMu.Lock()
	defer sftpPoolMu.Unlock()
	if client, ok := sftpClientPool[connID]; ok {
		client.Close()
		delete(sftpClientPool, connID)
	}
}

func (s *SFTPClient) ListDir(path string) ([]FileInfo, error) {
	entries, err := s.client.ReadDir(path)
	if err != nil {
		return nil, err
	}
	var files []FileInfo
	for _, e := range entries {
		files = append(files, FileInfo{
			Name:  e.Name(),
			Size:  e.Size(),
			IsDir: e.IsDir(),
			Mode:  e.Mode().String(),
		})
	}
	return files, nil
}

func (s *SFTPClient) ReadFile(path string) ([]byte, error) {
	f, err := s.client.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}

func (s *SFTPClient) Mkdir(path string) error {
	return s.client.MkdirAll(path)
}

func (s *SFTPClient) Remove(path string) error {
	info, err := s.client.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return s.client.RemoveDirectory(path)
	}
	return s.client.Remove(path)
}

func (s *SFTPClient) Rename(oldpath, newpath string) error {
	return s.client.Rename(oldpath, newpath)
}

func (s *SFTPClient) WriteFile(path string, data []byte) error {
	f, err := s.client.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(data)
	return err
}

// WriteFileStream creates a file for streaming write
func (s *SFTPClient) WriteFileStream(path string) (io.WriteCloser, error) {
	return s.client.Create(path)
}

func (s *SFTPClient) Close() {
	s.client.Close()
}

type FileInfo struct {
	Name  string `json:"name"`
	Size  int64  `json:"size"`
	IsDir bool   `json:"is_dir"`
	Mode  string `json:"mode"`
}
