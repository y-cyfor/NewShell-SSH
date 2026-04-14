package services

import (
	"bufio"
	"fmt"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
)

type SysInfoCollector struct {
	connID   string
	session  *ssh.Session
	stdout   *bufio.Scanner
	data     map[string]interface{}
	dataMu   sync.RWMutex
	lastCPU  CPUStats
	interval int
	onData   func(data map[string]interface{})
	running  bool
	stopChan chan struct{}
}

type CPUStats struct {
	User   int64
	Nice   int64
	Sys    int64
	Idle   int64
	IOWait int64
	Total  int64
}

func NewSysInfoCollector(sshClient *ssh.Client, connID string, interval int, onData func(data map[string]interface{})) (*SysInfoCollector, error) {
	sess, err := sshClient.NewSession()
	if err != nil {
		return nil, fmt.Errorf("创建监控session失败: %v", err)
	}

	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		return nil, fmt.Errorf("获取stdout失败: %v", err)
	}

	stderr, err := sess.StderrPipe()
	if err != nil {
		sess.Close()
		return nil, fmt.Errorf("获取stderr失败: %v", err)
	}

	// Write script to temp file and execute it
	scriptContent := `#!/bin/bash
INTERVAL=${1:-5}
while true; do
  echo "===SYSINFO_START==="
  read cpu user nice sys idle iowait irq softirq steal guest < /proc/stat
  echo "CPU_STAT:${user}:${nice}:${sys}:${idle}:${iowait}"
  awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf "MEM:%d:%d\n",t,a}' /proc/meminfo
  awk '{printf "LOAD:%s:%s:%s\n",$1,$2,$3}' /proc/loadavg
  echo "HOST:$(hostname)"
  echo "OS:$(grep PRETTY_NAME /etc/os-release 2>/dev/null | sed 's/PRETTY_NAME=//;s/"//g' || uname -s)"
  echo "UPTIME:$(uptime -p 2>/dev/null || uptime)"
  df -h --output=target,size,used,avail,pcent 2>/dev/null | awk 'NR>1{printf "DISK:%s:%s:%s:%s:%s\n",$1,$2,$3,$4,$5}'
  awk 'NR>2 && !/:lo/{gsub(/:/,"",$1); printf "NET:%s:%d:%d\n",$1,$2,$10}' /proc/net/dev
  ps -eo pid,comm,%mem,%cpu,rss --sort=-%mem --no-headers 2>/dev/null | head -20 | awk '{printf "PROC:%s:%s:%s:%s:%s\n",$1,$2,$3,$4,$5}'
  echo "===SYSINFO_END==="
  sleep "$INTERVAL"
done
`

	// Write script to remote temp file
	writeSess, err := sshClient.NewSession()
	if err != nil {
		sess.Close()
		return nil, fmt.Errorf("创建写session失败: %v", err)
	}
	writeSess.Run(fmt.Sprintf("cat > /tmp/newshell_sysinfo.sh << 'EOF'\n%s\nEOF", scriptContent))
	writeSess.Close()

	fmt.Printf("[SysInfoCollector] Starting script for %s with interval %d\n", connID, interval)

	if err := sess.Start(fmt.Sprintf("bash /tmp/newshell_sysinfo.sh %d", interval)); err != nil {
		sess.Close()
		return nil, fmt.Errorf("启动采集脚本失败: %v", err)
	}

	// Log stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			fmt.Printf("[SysInfoCollector STDERR %s] %s\n", connID, scanner.Text())
		}
	}()

	collector := &SysInfoCollector{
		connID:   connID,
		session:  sess,
		stdout:   bufio.NewScanner(stdout),
		data:     make(map[string]interface{}),
		interval: interval,
		onData:   onData,
		stopChan: make(chan struct{}),
	}

	go collector.readLoop()

	return collector, nil
}

func (c *SysInfoCollector) readLoop() {
	c.running = true
	currentData := make(map[string]interface{})
	inBatch := false
	lineCount := 0

	for c.running && c.stdout.Scan() {
		line := strings.TrimSpace(c.stdout.Text())
		lineCount++

		if lineCount <= 5 {
			fmt.Printf("[SysInfoCollector %s] line %d: %q\n", c.connID, lineCount, line)
		}

		if line == "===SYSINFO_START===" {
			currentData = make(map[string]interface{})
			inBatch = true
			continue
		}

		if line == "===SYSINFO_END===" && inBatch {
			if cpuData, ok := currentData["cpu_raw"].(CPUStats); ok {
				cpuPercent := c.calculateCPUPercent(cpuData)
				currentData["cpu"] = fmt.Sprintf("%.1f", cpuPercent)
			}

			if memTotal, ok := currentData["mem_total"].(int64); ok && memTotal > 0 {
				if memAvailable, ok := currentData["mem_available"].(int64); ok {
					currentData["mem_used"] = fmt.Sprintf("%.1f", float64(memTotal-memAvailable)/float64(memTotal)*100)
				}
			}

			c.dataMu.Lock()
			c.data = currentData
			c.dataMu.Unlock()

			fmt.Printf("[SysInfoCollector %s] Batch complete, keys: %v\n", c.connID, getKeys(currentData))

			if c.onData != nil {
				result := c.GetData()
				fmt.Printf("[SysInfoCollector %s] Sending data with keys: %v\n", c.connID, getKeys(result))
				c.onData(result)
			}

			inBatch = false
			continue
		}

		if inBatch {
			c.parseLine(line, currentData)
		}
	}

	fmt.Printf("[SysInfoCollector %s] readLoop ended, total lines: %d, error: %v\n", c.connID, lineCount, c.stdout.Err())
	c.running = false
}

func (c *SysInfoCollector) parseLine(line string, data map[string]interface{}) {
	if !strings.Contains(line, ":") {
		return
	}

	parts := strings.SplitN(line, ":", 2)
	if len(parts) < 2 {
		return
	}

	prefix := parts[0]
	value := parts[1]

	switch prefix {
	case "CPU_STAT":
		fields := strings.Split(value, ":")
		if len(fields) >= 5 {
			stats := CPUStats{
				User:   parseInt64(fields[0]),
				Nice:   parseInt64(fields[1]),
				Sys:    parseInt64(fields[2]),
				Idle:   parseInt64(fields[3]),
				IOWait: parseInt64(fields[4]),
			}
			stats.Total = stats.User + stats.Nice + stats.Sys + stats.Idle + stats.IOWait
			data["cpu_raw"] = stats
		}

	case "MEM":
		fields := strings.Split(value, ":")
		if len(fields) >= 2 {
			data["mem_total"] = parseInt64(fields[0])
			data["mem_available"] = parseInt64(fields[1])
		}

	case "LOAD":
		fields := strings.Split(value, ":")
		if len(fields) >= 3 {
			data["load_1"] = parseFloat64(fields[0])
			data["load_5"] = parseFloat64(fields[1])
			data["load_15"] = parseFloat64(fields[2])
		}

	case "HOST":
		data["hostname"] = strings.TrimSpace(value)

	case "OS":
		data["os"] = strings.TrimSpace(value)

	case "UPTIME":
		data["uptime"] = strings.TrimSpace(value)

	case "DISK":
		fields := strings.Split(value, ":")
		if len(fields) >= 5 {
			disk := map[string]interface{}{
				"mount_point": fields[0],
				"size":        fields[1],
				"used":        fields[2],
				"available":   fields[3],
				"use_percent": strings.TrimSuffix(fields[4], "%"),
			}

			disks, ok := data["disks"].([]map[string]interface{})
			if !ok {
				disks = []map[string]interface{}{}
			}
			disks = append(disks, disk)
			data["disks"] = disks

			if fields[0] == "/" {
				data["disk"] = strings.TrimSuffix(fields[4], "%")
				data["disk_info"] = fmt.Sprintf("%s / %s (%s%%)", fields[2], fields[1], fields[4])
			}
		}

	case "NET":
		fields := strings.Split(value, ":")
		if len(fields) >= 3 {
			net := map[string]interface{}{
				"name":     fields[0],
				"rx_total": parseInt64(fields[1]),
				"tx_total": parseInt64(fields[2]),
			}

			nets, ok := data["networks"].([]map[string]interface{})
			if !ok {
				nets = []map[string]interface{}{}
			}
			nets = append(nets, net)
			data["networks"] = nets

			if strings.HasPrefix(fields[0], "eth") || strings.HasPrefix(fields[0], "ens") || strings.HasPrefix(fields[0], "enp") {
				if _, exists := data["net_rx"]; !exists {
					data["net_rx"] = fields[1]
					data["net_tx"] = fields[2]
				}
			}
		}

	case "PROC":
		fields := strings.Split(value, ":")
		if len(fields) >= 5 {
			proc := map[string]interface{}{
				"pid":            parseInt64(fields[0]),
				"name":           fields[1],
				"memory_percent": parseFloat64(fields[2]),
				"cpu_percent":    parseFloat64(fields[3]),
				"memory":         parseInt64(fields[4]) * 1024, // KB to bytes
			}

			procs, ok := data["processes"].([]map[string]interface{})
			if !ok {
				procs = []map[string]interface{}{}
			}
			procs = append(procs, proc)
			data["processes"] = procs
		}
	}
}

func (c *SysInfoCollector) calculateCPUPercent(current CPUStats) float64 {
	if c.lastCPU.Total == 0 {
		c.lastCPU = current
		return 0
	}

	totalDiff := current.Total - c.lastCPU.Total
	idleDiff := current.Idle - c.lastCPU.Idle

	c.lastCPU = current

	if totalDiff == 0 {
		return 0
	}

	return float64(totalDiff-idleDiff) / float64(totalDiff) * 100
}

func (c *SysInfoCollector) GetData() map[string]interface{} {
	c.dataMu.RLock()
	defer c.dataMu.RUnlock()

	result := make(map[string]interface{})
	for k, v := range c.data {
		result[k] = v
	}

	// 转换数据结构为前端期望的格式
	info := make(map[string]interface{})
	info["hostname"] = getString(result, "hostname", "unknown")
	info["os"] = getString(result, "os", "unknown")
	info["uptime"] = getString(result, "uptime", "unknown")
	info["cpu"] = getString(result, "cpu", "0")
	info["mem_used"] = getString(result, "mem_used", "0")
	info["mem_total"] = fmt.Sprintf("%d", getInt64(result, "mem_total", 0)/1024) // KB to MB
	info["disk"] = getString(result, "disk", "0")
	info["disk_info"] = getString(result, "disk_info", "unknown")
	info["net_rx"] = getString(result, "net_rx", "0")
	info["net_tx"] = getString(result, "net_tx", "0")

	// 负载平均值
	if load1, ok := result["load_1"].(float64); ok {
		info["load_average"] = []float64{
			load1,
			getFloat64(result, "load_5", 0),
			getFloat64(result, "load_15", 0),
		}
	}

	// 磁盘分区
	if disks, ok := result["disks"].([]map[string]interface{}); ok {
		partitions := []map[string]interface{}{}
		for _, disk := range disks {
			partitions = append(partitions, disk)
		}
		info["disk_partitions"] = partitions
	}

	// 网络接口
	if nets, ok := result["networks"].([]map[string]interface{}); ok {
		interfaces := []map[string]interface{}{}
		for _, net := range nets {
			interfaces = append(interfaces, map[string]interface{}{
				"name":     getString(net, "name", ""),
				"rx_total": getInt64(net, "rx_total", 0),
				"tx_total": getInt64(net, "tx_total", 0),
				"rx_speed": 0,
				"tx_speed": 0,
			})
		}
		info["network_interfaces"] = interfaces
	}

	// 进程列表
	if procs, ok := result["processes"].([]map[string]interface{}); ok {
		processes := []map[string]interface{}{}
		for _, proc := range procs {
			processes = append(processes, map[string]interface{}{
				"pid":            getInt64(proc, "pid", 0),
				"name":           getString(proc, "name", ""),
				"user":           "unknown",
				"cpu_percent":    getFloat64(proc, "cpu_percent", 0),
				"memory_percent": getFloat64(proc, "memory_percent", 0),
				"memory":         getInt64(proc, "memory", 0),
				"command":        getString(proc, "name", ""),
			})
		}
		info["processes"] = processes
	}

	return info
}

func getKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func (c *SysInfoCollector) Stop() {
	c.running = false
	c.session.Close()
	close(c.stopChan)
}

func parseInt64(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	val, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0
	}
	return val
}

func parseFloat64(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	val, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return val
}

func getString(m map[string]interface{}, key string, defaultVal string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return defaultVal
}

func getInt64(m map[string]interface{}, key string, defaultVal int64) int64 {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case int64:
			return val
		case float64:
			return int64(val)
		case string:
			if i, err := strconv.ParseInt(val, 10, 64); err == nil {
				return i
			}
		}
	}
	return defaultVal
}

func getFloat64(m map[string]interface{}, key string, defaultVal float64) float64 {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case float64:
			return val
		case int64:
			return float64(val)
		case string:
			if f, err := strconv.ParseFloat(val, 64); err == nil {
				return f
			}
		}
	}
	return defaultVal
}
