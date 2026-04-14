package handlers

import (
	"bufio"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"newshell-server/services"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/ssh"
)

// 简单缓存结构
type cacheEntry struct {
	data      map[string]interface{}
	timestamp time.Time
}

var (
	sysinfoCache = make(map[string]cacheEntry)
	cacheMu      sync.RWMutex
	cacheTTL     = 5 * time.Second
)

func init() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		for range ticker.C {
			cacheMu.Lock()
			for key, entry := range sysinfoCache {
				if time.Since(entry.timestamp) > cacheTTL*2 {
					delete(sysinfoCache, key)
				}
			}
			cacheMu.Unlock()
		}
	}()
}

func getCachedSysInfo(connID string) (map[string]interface{}, bool) {
	cacheMu.RLock()
	defer cacheMu.RUnlock()
	if entry, ok := sysinfoCache[connID]; ok {
		if time.Since(entry.timestamp) < cacheTTL {
			return entry.data, true
		}
	}
	return nil, false
}

func setCachedSysInfo(connID string, data map[string]interface{}) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	sysinfoCache[connID] = cacheEntry{data: data, timestamp: time.Now()}
}

func GetSysInfo(c *gin.Context) {
	connID := c.Param("id")

	// 检查缓存（使用不同key避免冲突）
	cacheKey := "basic_" + connID
	cacheMu.RLock()
	if entry, ok := sysinfoCache[cacheKey]; ok {
		if time.Since(entry.timestamp) < cacheTTL {
			cacheMu.RUnlock()
			c.JSON(http.StatusOK, entry.data)
			return
		}
	}
	cacheMu.RUnlock()

	// 获取SSH连接 - 优先复用已有连接
	session, err := services.GetSession(connID)
	if err != nil {
		client, err2 := services.GetOrCreateAgentClient(connID)
		if err2 != nil {
			c.JSON(http.StatusOK, gin.H{"hostname": "未连接", "os": "等待 SSH 连接..."})
			return
		}
		// 使用Agent客户端创建临时session执行命令
		basicCommands := map[string]string{
			"hostname":     "hostname",
			"os":           "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2 || uname -s",
			"uptime":       "uptime -p 2>/dev/null || uptime",
			"cpu":          "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo '0'",
			"mem_used":     "free -m | awk 'NR==2{printf \"%.1f\", $3*100/$2}' 2>/dev/null || echo '0'",
			"mem_total":    "free -m | awk 'NR==2{printf \"%d\", $2}' 2>/dev/null || echo '0'",
			"disk":         "df -h / | awk 'NR==2{print $5}' | tr -d '%'",
			"disk_info":    "df -h / | awk 'NR==2{printf \"%s / %s (%s)\", $3, $2, $5}'",
			"net_rx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2}' 2>/dev/null || echo '0'",
			"net_tx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $10}' 2>/dev/null || echo '0'",
			"disk_details": "df -h --output=target,size,used,avail,pcent 2>/dev/null | head -10 || df -h | head -10",
		}
		result := execWithClient(client, basicCommands)
		cacheMu.Lock()
		sysinfoCache[cacheKey] = cacheEntry{data: result, timestamp: time.Now()}
		cacheMu.Unlock()
		c.JSON(http.StatusOK, result)
		return
	}

	// 并发执行基础信息命令
	info := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup

	commands := map[string]string{
		"hostname":     "hostname",
		"os":           "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2 || uname -s",
		"uptime":       "uptime -p 2>/dev/null || uptime",
		"cpu":          "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo '0'",
		"mem_used":     "free -m | awk 'NR==2{printf \"%.1f\", $3*100/$2}' 2>/dev/null || echo '0'",
		"mem_total":    "free -m | awk 'NR==2{printf \"%d\", $2}' 2>/dev/null || echo '0'",
		"disk":         "df -h / | awk 'NR==2{print $5}' | tr -d '%'",
		"disk_info":    "df -h / | awk 'NR==2{printf \"%s / %s (%s)\", $3, $2, $5}'",
		"net_rx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2}' 2>/dev/null || echo '0'",
		"net_tx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $10}' 2>/dev/null || echo '0'",
		"disk_details": "df -h --output=target,size,used,avail,pcent 2>/dev/null | head -10 || df -h | head -10",
	}

	for key, cmd := range commands {
		wg.Add(1)
		go func(k, c string) {
			defer wg.Done()
			val := execRemote(session, c)
			mu.Lock()
			info[k] = strings.TrimSpace(val)
			mu.Unlock()
		}(key, cmd)
	}
	wg.Wait()

	// 写入缓存
	result := make(map[string]interface{})
	for k, v := range info {
		result[k] = v
	}
	cacheMu.Lock()
	sysinfoCache[cacheKey] = cacheEntry{data: result, timestamp: time.Now()}
	cacheMu.Unlock()

	c.JSON(http.StatusOK, info)
}

// execWithClient 使用SSH客户端执行命令并返回结果
func execWithClient(client *ssh.Client, commands map[string]string) map[string]interface{} {
	info := make(map[string]interface{})
	var mu sync.Mutex
	var wg sync.WaitGroup

	for key, cmd := range commands {
		wg.Add(1)
		go func(k, c string) {
			defer wg.Done()
			val := execWithSSHClient(client, c)
			mu.Lock()
			info[k] = strings.TrimSpace(val)
			mu.Unlock()
		}(key, cmd)
	}
	wg.Wait()
	return info
}

// execWithSSHClient 使用SSH客户端执行单个命令
func execWithSSHClient(client *ssh.Client, cmd string) string {
	sess, err := client.NewSession()
	if err != nil {
		return "N/A"
	}
	defer sess.Close()

	output, err := sess.Output(cmd)
	if err != nil {
		return "N/A"
	}
	return strings.TrimSpace(string(output))
}

// execExtendedWithClient 使用SSH客户端执行扩展信息采集
func execExtendedWithClient(client *ssh.Client) map[string]interface{} {
	commands := map[string]string{
		"hostname":     "hostname",
		"os":           "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2 || uname -s",
		"uptime":       "uptime -p 2>/dev/null || uptime",
		"cpu":          "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo '0'",
		"mem_used":     "free -m | awk 'NR==2{printf \"%.1f\", $3*100/$2}' 2>/dev/null || echo '0'",
		"mem_total":    "free -m | awk 'NR==2{printf \"%d\", $2}' 2>/dev/null || echo '0'",
		"loadavg":      "cat /proc/loadavg | awk '{print $1,$2,$3}'",
		"disk_info":    "df -h / | awk 'NR==2{printf \"%s / %s (%s)\", $3, $2, $5}'",
		"disk":         "df -h / | awk 'NR==2{print $5}' | tr -d '%'",
		"disk_details": "df -h --output=target,size,used,avail,pcent 2>/dev/null | head -10 || df -h | head -10",
		"net_rx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2}' 2>/dev/null || echo '0'",
		"net_tx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $10}' 2>/dev/null || echo '0'",
		"net_stats":    "cat /proc/net/dev | grep -v 'lo' | grep ':' | awk '{print $1,$2,$10}'",
		"partition":    "df -h --output=target,size,used,avail,pcent 2>/dev/null | tail -n +2",
		"processes":    "ps -eo pid,comm,%mem,%cpu,rss --sort=-%mem --no-headers 2>/dev/null | head -20 | awk '{printf \"%s:%s:%s:%s:%s\\n\",$1,$2,$3,$4,$5}'",
	}

	results := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for key, cmd := range commands {
		wg.Add(1)
		go func(k, c string) {
			defer wg.Done()
			val := execWithSSHClient(client, c)
			mu.Lock()
			results[k] = strings.TrimSpace(val)
			mu.Unlock()
		}(key, cmd)
	}
	wg.Wait()

	// 组装响应
	info := make(map[string]interface{})
	info["hostname"] = results["hostname"]
	info["os"] = results["os"]
	info["uptime"] = results["uptime"]
	info["cpu"] = results["cpu"]
	info["mem_used"] = results["mem_used"]
	info["mem_total"] = results["mem_total"]
	info["disk_info"] = results["disk_info"]
	info["disk"] = results["disk"]
	info["disk_details"] = results["disk_details"]
	info["net_rx"] = results["net_rx"]
	info["net_tx"] = results["net_tx"]

	// 负载平均值
	loadAvg := results["loadavg"]
	if loadAvg != "N/A" {
		parts := strings.Fields(loadAvg)
		if len(parts) >= 3 {
			info["load_average"] = []float64{parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])}
		}
	}

	// 网络接口
	networkInterfaces := []map[string]interface{}{}
	netStats := results["net_stats"]
	if netStats != "N/A" {
		for _, line := range strings.Split(netStats, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				networkInterfaces = append(networkInterfaces, map[string]interface{}{
					"name":     strings.TrimSuffix(parts[0], ":"),
					"rx_total": parseNumber(parts[1], 0),
					"tx_total": parseNumber(parts[2], 0),
					"rx_speed": 0,
					"tx_speed": 0,
				})
			}
		}
	}
	info["network_interfaces"] = networkInterfaces

	// 磁盘分区
	diskPartitions := []map[string]interface{}{}
	partitionInfo := results["partition"]
	if partitionInfo != "N/A" {
		for _, line := range strings.Split(partitionInfo, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 5 {
				diskPartitions = append(diskPartitions, map[string]interface{}{
					"mount_point": parts[0],
					"size":        parseNumber(parts[1], 0),
					"used":        parseNumber(parts[2], 0),
					"available":   parseNumber(parts[3], 0),
					"use_percent": parseFloat(strings.TrimSuffix(parts[4], "%")),
				})
			}
		}
	}
	info["disk_partitions"] = diskPartitions

	// 进程列表
	processes := []map[string]interface{}{}
	processInfo := results["processes"]
	if processInfo != "N/A" {
		for _, line := range strings.Split(processInfo, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 5 {
				processes = append(processes, map[string]interface{}{
					"pid":            parseNumber(parts[0], 0),
					"name":           parts[1],
					"user":           "unknown",
					"cpu_percent":    parseFloat(parts[2]),
					"memory_percent": parseFloat(parts[3]),
					"memory":         parseNumber(parts[4], 0) * 1024,
					"command":        parts[1],
				})
			}
		}
	}
	info["processes"] = processes

	return info
}

func execRemote(session *services.SSHSession, cmd string) string {
	sess, err := session.Conn.NewSession()
	if err != nil {
		return "N/A"
	}
	defer sess.Close()

	output, err := sess.Output(cmd)
	if err != nil {
		return "N/A"
	}
	return strings.TrimSpace(string(output))
}

func GetSysInfoStream(c *gin.Context) {
	connID := c.Param("id")

	// 获取SSH连接
	var sshClient *ssh.Client
	session, err := services.GetSession(connID)
	if err != nil {
		client, err2 := services.GetOrCreateAgentClient(connID)
		if err2 != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "SSH not connected"})
			return
		}
		sshClient = client
	} else {
		sshClient = session.Conn
	}

	// Stream system info via a long-running SSH command
	sess, err := sshClient.NewSession()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Cannot create session"})
		return
	}
	defer sess.Close()

	stdout, err := sess.StdoutPipe()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Cannot get stdout"})
		return
	}

	// Use vmstat for continuous monitoring
	sess.Start("vmstat 2")

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming not supported"})
		return
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(c.Writer, "data: %s\n\n", line)
		flusher.Flush()
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Sysinfo stream error: %v", err)
	}
}

// GetServerConfig 获取服务器配置信息
func GetServerConfig(c *gin.Context) {
	connID := c.Param("id")

	session, err := services.GetSession(connID)
	if err != nil {
		client, err2 := services.GetOrCreateAgentClient(connID)
		if err2 != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "连接未建立"})
			return
		}
		config := make(map[string]interface{})
		config["cpu_cores"] = parseNumber(execWithSSHClient(client, "nproc"), 1)
		config["memory_total"] = parseNumber(execWithSSHClient(client, "free -m | awk 'NR==2{print $2}'"), 0)
		config["os"] = execWithSSHClient(client, "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2 || uname -s")
		config["kernel"] = execWithSSHClient(client, "uname -r")
		config["hostname"] = execWithSSHClient(client, "hostname")
		config["updated_at"] = fmt.Sprintf("%d", time.Now().Unix())
		c.JSON(http.StatusOK, config)
		return
	}

	config := make(map[string]interface{})

	// 获取CPU核心数
	cpuCores := execRemote(session, "nproc")
	config["cpu_cores"] = parseNumber(cpuCores, 1)

	// 获取内存总量 (MB)
	memTotal := execRemote(session, "free -m | awk 'NR==2{print $2}'")
	config["memory_total"] = parseNumber(memTotal, 0)

	// 获取操作系统
	osInfo := execRemote(session, "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2 || uname -s")
	config["os"] = osInfo

	// 获取内核版本
	kernel := execRemote(session, "uname -r")
	config["kernel"] = kernel

	// 获取主机名
	hostname := execRemote(session, "hostname")
	config["hostname"] = hostname

	// 更新时间
	config["updated_at"] = fmt.Sprintf("%d", time.Now().Unix())

	c.JSON(http.StatusOK, config)
}

// GetExtendedSysInfo 获取扩展系统信息（并发执行+缓存）
func GetExtendedSysInfo(c *gin.Context) {
	connID := c.Param("id")

	// 检查缓存
	if cached, ok := getCachedSysInfo(connID); ok {
		c.JSON(http.StatusOK, cached)
		return
	}

	// 获取SSH连接 - 优先复用已有连接
	session, err := services.GetSession(connID)
	if err != nil {
		// 终端未连接，尝试创建独立连接
		client, err2 := services.GetOrCreateAgentClient(connID)
		if err2 != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "连接未建立"})
			return
		}
		// 使用Agent客户端执行
		info := execExtendedWithClient(client)
		setCachedSysInfo(connID, info)
		c.JSON(http.StatusOK, info)
		return
	}

	// 使用map存储结果，每个字段对应一个key
	results := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup

	// 定义需要并发执行的命令
	commands := map[string]string{
		"hostname":     "hostname",
		"os":           "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2 || uname -s",
		"uptime":       "uptime -p 2>/dev/null || uptime",
		"cpu":          "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo '0'",
		"mem_used":     "free -m | awk 'NR==2{printf \"%.1f\", $3*100/$2}' 2>/dev/null || echo '0'",
		"mem_total":    "free -m | awk 'NR==2{printf \"%d\", $2}' 2>/dev/null || echo '0'",
		"loadavg":      "cat /proc/loadavg | awk '{print $1,$2,$3}'",
		"disk_info":    "df -h / | awk 'NR==2{printf \"%s / %s (%s)\", $3, $2, $5}'",
		"disk":         "df -h / | awk 'NR==2{print $5}' | tr -d '%'",
		"disk_details": "df -h --output=target,size,used,avail,pcent 2>/dev/null | head -10 || df -h | head -10",
		"net_rx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2}' 2>/dev/null || echo '0'",
		"net_tx":       "cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $10}' 2>/dev/null || echo '0'",
		"net_stats":    "cat /proc/net/dev | grep -v 'lo' | grep ':' | awk '{print $1,$2,$10}'",
		"partition":    "df -h --output=target,size,used,avail,pcent 2>/dev/null | tail -n +2",
	}

	// 获取limit参数
	limit := c.DefaultQuery("limit", "20")
	processCmd := fmt.Sprintf("ps aux --sort=-%%mem | head -%d | awk '{print $2,$11,$4,$3,$6}'",
		parseNumber(limit, 20))
	commands["processes"] = processCmd

	// 并发执行所有命令
	for key, cmd := range commands {
		wg.Add(1)
		go func(k, c string) {
			defer wg.Done()
			val := execRemote(session, c)
			mu.Lock()
			results[k] = strings.TrimSpace(val)
			mu.Unlock()
		}(key, cmd)
	}
	wg.Wait()

	// 组装响应
	info := make(map[string]interface{})
	info["hostname"] = results["hostname"]
	info["os"] = results["os"]
	info["uptime"] = results["uptime"]
	info["cpu"] = results["cpu"]
	info["mem_used"] = results["mem_used"]
	info["mem_total"] = results["mem_total"]
	info["disk_info"] = results["disk_info"]
	info["disk"] = results["disk"]
	info["disk_details"] = results["disk_details"]
	info["net_rx"] = results["net_rx"]
	info["net_tx"] = results["net_tx"]

	// 负载平均值
	loadAvg := results["loadavg"]
	if loadAvg != "N/A" {
		parts := strings.Fields(loadAvg)
		if len(parts) >= 3 {
			info["load_average"] = []float64{parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])}
		}
	}

	// 网络接口
	networkInterfaces := []map[string]interface{}{}
	netStats := results["net_stats"]
	if netStats != "N/A" {
		for _, line := range strings.Split(netStats, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				networkInterfaces = append(networkInterfaces, map[string]interface{}{
					"name":     strings.TrimSuffix(parts[0], ":"),
					"rx_total": parseNumber(parts[1], 0),
					"tx_total": parseNumber(parts[2], 0),
					"rx_speed": 0,
					"tx_speed": 0,
				})
			}
		}
	}
	info["network_interfaces"] = networkInterfaces

	// 磁盘分区
	diskPartitions := []map[string]interface{}{}
	partitionInfo := results["partition"]
	if partitionInfo != "N/A" {
		for _, line := range strings.Split(partitionInfo, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 5 {
				diskPartitions = append(diskPartitions, map[string]interface{}{
					"mount_point": parts[0],
					"size":        parseNumber(parts[1], 0),
					"used":        parseNumber(parts[2], 0),
					"available":   parseNumber(parts[3], 0),
					"use_percent": parseFloat(strings.TrimSuffix(parts[4], "%")),
				})
			}
		}
	}
	info["disk_partitions"] = diskPartitions

	// 进程列表
	processes := []map[string]interface{}{}
	processInfo := results["processes"]
	if processInfo != "N/A" {
		for _, line := range strings.Split(processInfo, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 5 {
				processes = append(processes, map[string]interface{}{
					"pid":            parseNumber(parts[0], 0),
					"name":           parts[1],
					"user":           "unknown",
					"cpu_percent":    parseFloat(parts[2]),
					"memory_percent": parseFloat(parts[3]),
					"memory":         parseNumber(parts[4], 0) * 1024,
					"command":        parts[1],
				})
			}
		}
	}
	info["processes"] = processes

	// 写入缓存
	setCachedSysInfo(connID, info)

	c.JSON(http.StatusOK, info)
}

// 辅助函数
func parseNumber(s string, defaultValue int) int {
	s = strings.TrimSpace(s)
	if s == "" || s == "N/A" {
		return defaultValue
	}
	val := 0
	fmt.Sscanf(s, "%d", &val)
	if val == 0 {
		return defaultValue
	}
	return val
}

func parseFloat(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" || s == "N/A" {
		return 0
	}
	val := 0.0
	fmt.Sscanf(s, "%f", &val)
	return val
}

// SysInfoCollectorCache 采集器缓存
var (
	collectorCache = make(map[string]*services.SysInfoCollector)
	collectorMu    sync.RWMutex
)

// SysInfoWS WebSocket推送系统信息
func SysInfoWS(c *gin.Context) {
	connID := c.Param("id")
	intervalStr := c.DefaultQuery("interval", "5")
	interval := 5
	fmt.Sscanf(intervalStr, "%d", &interval)
	if interval < 1 {
		interval = 1
	}

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("SysInfo WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	log.Printf("[SysInfoWS] Connected for connID: %s, interval: %d", connID, interval)

	// 获取SSH连接 - 优先使用已有session，否则创建独立连接
	var sshClient *ssh.Client

	// 先尝试复用已有终端连接
	if session, err := services.GetSession(connID); err == nil {
		sshClient = session.Conn
	} else {
		// 终端未连接，使用Agent连接池创建独立连接
		client, err2 := services.GetOrCreateAgentClient(connID)
		if err2 != nil {
			log.Printf("[SysInfoWS] SSH connection failed for %s: %v", connID, err2)
			ws.WriteJSON(map[string]interface{}{
				"error": fmt.Sprintf("SSH连接失败: %v", err2),
			})
			return
		}
		sshClient = client
	}

	// 检查是否已有采集器
	collectorMu.RLock()
	existingCollector, hasExisting := collectorCache[connID]
	collectorMu.RUnlock()

	// 如果已有采集器且在运行，先停止
	if hasExisting && existingCollector != nil {
		existingCollector.Stop()
	}

	// 创建新的采集器
	collector, err := services.NewSysInfoCollector(sshClient, connID, interval, func(data map[string]interface{}) {
		ws.WriteJSON(data)
	})
	if err != nil {
		log.Printf("[SysInfoWS] Collector creation failed for %s: %v", connID, err)
		ws.WriteJSON(map[string]interface{}{
			"error": fmt.Sprintf("创建采集器失败: %v", err),
		})
		return
	}

	// 缓存采集器
	collectorMu.Lock()
	collectorCache[connID] = collector
	collectorMu.Unlock()

	defer func() {
		collector.Stop()
		collectorMu.Lock()
		delete(collectorCache, connID)
		collectorMu.Unlock()
	}()

	// 等待WebSocket关闭
	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			break
		}
	}
}

// GetExtendedSysInfoV2 新版系统信息接口（使用collector）
func GetExtendedSysInfoV2(c *gin.Context) {
	connID := c.Param("id")
	limit := c.DefaultQuery("limit", "20")

	// 检查缓存
	if cached, ok := getCachedSysInfo(connID); ok {
		c.JSON(http.StatusOK, cached)
		return
	}

	// 获取SSH连接
	var sshClient *ssh.Client
	session, err := services.GetSession(connID)
	if err != nil {
		client, err2 := services.GetOrCreateAgentClient(connID)
		if err2 != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "连接未建立"})
			return
		}
		sshClient = client
	} else {
		sshClient = session.Conn
	}

	// 使用单次采集
	sess, err := sshClient.NewSession()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建session失败"})
		return
	}
	defer sess.Close()

	// 构建一次性采集脚本
	script := fmt.Sprintf(`
		echo "===SYSINFO_START==="
		read cpu user nice sys idle iowait irq softirq steal guest < /proc/stat
		echo "CPU_STAT:${user}:${nice}:${sys}:${idle}:${iowait}"
		awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf "MEM:%%d:%%d\n",t,a}' /proc/meminfo
		awk '{printf "LOAD:%%s:%%s:%%s\n",$1,$2,$3}' /proc/loadavg
		echo "HOST:$(hostname)"
		echo "OS:$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"'"'"'"'"' -f2 || uname -s)"
		echo "UPTIME:$(uptime -p 2>/dev/null || uptime)"
		df -h --output=target,size,used,avail,pcent 2>/dev/null | awk 'NR>1{printf "DISK:%%s:%%s:%%s:%%s:%%s\n",$1,$2,$3,$4,$5}'
		awk 'NR>2 && !/:lo/{gsub(/:/,"",$1); printf "NET:%%s:%%d:%%d\n",$1,$2,$10}' /proc/net/dev
		ps -eo pid,comm,%%mem,%%cpu,rss --sort=-%%mem --no-headers 2>/dev/null | head -%s | awk '{printf "PROC:%%s:%%s:%%s:%%s:%%s\n",$1,$2,$3,$4,$5}'
		echo "===SYSINFO_END==="
	`, limit)

	output, err := sess.Output(fmt.Sprintf("bash -c '%s'", script))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("执行采集脚本失败: %v", err)})
		return
	}

	// 解析输出
	info := make(map[string]interface{})
	processes := []map[string]interface{}{}
	diskPartitions := []map[string]interface{}{}
	networkInterfaces := []map[string]interface{}{}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "===SYSINFO_START===" || line == "===SYSINFO_END===" {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) < 2 {
			continue
		}

		prefix := parts[0]
		value := parts[1]

		switch prefix {
		case "CPU_STAT":
			fields := strings.Split(value, ":")
			if len(fields) >= 5 {
				user, _ := strconv.ParseInt(fields[0], 10, 64)
				nice, _ := strconv.ParseInt(fields[1], 10, 64)
				sys, _ := strconv.ParseInt(fields[2], 10, 64)
				idle, _ := strconv.ParseInt(fields[3], 10, 64)
				iowait, _ := strconv.ParseInt(fields[4], 10, 64)
				total := user + nice + sys + idle + iowait
				if total > 0 {
					info["cpu"] = fmt.Sprintf("%.1f", float64(total-idle)/float64(total)*100)
				} else {
					info["cpu"] = "0"
				}
			}
		case "MEM":
			fields := strings.Split(value, ":")
			if len(fields) >= 2 {
				total, _ := strconv.ParseInt(fields[0], 10, 64)
				available, _ := strconv.ParseInt(fields[1], 10, 64)
				info["mem_total"] = fmt.Sprintf("%d", total/1024)
				if total > 0 {
					info["mem_used"] = fmt.Sprintf("%.1f", float64(total-available)/float64(total)*100)
				}
			}
		case "LOAD":
			fields := strings.Split(value, ":")
			if len(fields) >= 3 {
				load1, _ := strconv.ParseFloat(fields[0], 64)
				load5, _ := strconv.ParseFloat(fields[1], 64)
				load15, _ := strconv.ParseFloat(fields[2], 64)
				info["load_average"] = []float64{load1, load5, load15}
			}
		case "HOST":
			info["hostname"] = strings.TrimSpace(value)
		case "OS":
			info["os"] = strings.TrimSpace(value)
		case "UPTIME":
			info["uptime"] = strings.TrimSpace(value)
		case "DISK":
			fields := strings.Split(value, ":")
			if len(fields) >= 5 {
				diskPartitions = append(diskPartitions, map[string]interface{}{
					"mount_point": fields[0],
					"size":        parseSizeToKB(fields[1]),
					"used":        parseSizeToKB(fields[2]),
					"available":   parseSizeToKB(fields[3]),
					"use_percent": parseFloat(strings.TrimSuffix(fields[4], "%")),
				})
				if fields[0] == "/" {
					info["disk"] = strings.TrimSuffix(fields[4], "%")
					info["disk_info"] = fmt.Sprintf("%s / %s (%s)", fields[2], fields[1], fields[4])
				}
			}
		case "NET":
			fields := strings.Split(value, ":")
			if len(fields) >= 3 {
				rxTotal, _ := strconv.ParseInt(fields[1], 10, 64)
				txTotal, _ := strconv.ParseInt(fields[2], 10, 64)
				networkInterfaces = append(networkInterfaces, map[string]interface{}{
					"name":     fields[0],
					"rx_total": rxTotal,
					"tx_total": txTotal,
					"rx_speed": 0,
					"tx_speed": 0,
				})
				if strings.HasPrefix(fields[0], "eth") || strings.HasPrefix(fields[0], "ens") || strings.HasPrefix(fields[0], "enp") {
					if _, ok := info["net_rx"]; !ok {
						info["net_rx"] = fmt.Sprintf("%d", rxTotal)
						info["net_tx"] = fmt.Sprintf("%d", txTotal)
					}
				}
			}
		case "PROC":
			fields := strings.Split(value, ":")
			if len(fields) >= 5 {
				pid, _ := strconv.Atoi(fields[0])
				memPercent, _ := strconv.ParseFloat(fields[2], 64)
				cpuPercent, _ := strconv.ParseFloat(fields[3], 64)
				rssKB, _ := strconv.ParseInt(fields[4], 10, 64)
				processes = append(processes, map[string]interface{}{
					"pid":            pid,
					"name":           fields[1],
					"user":           "unknown",
					"cpu_percent":    cpuPercent,
					"memory_percent": memPercent,
					"memory":         rssKB * 1024,
					"command":        fields[1],
				})
			}
		}
	}

	info["processes"] = processes
	info["disk_partitions"] = diskPartitions
	info["network_interfaces"] = networkInterfaces

	// 写入缓存
	setCachedSysInfo(connID, info)

	c.JSON(http.StatusOK, info)
}

func parseSizeToKB(size string) int {
	size = strings.TrimSpace(size)
	if size == "" {
		return 0
	}

	multiplier := 1
	if strings.HasSuffix(size, "G") {
		multiplier = 1024 * 1024
		size = strings.TrimSuffix(size, "G")
	} else if strings.HasSuffix(size, "M") {
		multiplier = 1024
		size = strings.TrimSuffix(size, "M")
	} else if strings.HasSuffix(size, "K") {
		multiplier = 1
		size = strings.TrimSuffix(size, "K")
	} else if strings.HasSuffix(size, "T") {
		multiplier = 1024 * 1024 * 1024
		size = strings.TrimSuffix(size, "T")
	}

	val, err := strconv.ParseFloat(size, 64)
	if err != nil {
		return 0
	}
	return int(val * float64(multiplier))
}
