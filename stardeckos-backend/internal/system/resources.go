package system

import (
	"bufio"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// SystemResources contains real-time system metrics
type SystemResources struct {
	CPU     CPUInfo     `json:"cpu"`
	Memory  MemoryInfo  `json:"memory"`
	Disk    DiskInfo    `json:"disk"`
	Network NetworkInfo `json:"network"`
	LoadAvg LoadAverage `json:"load_avg"`
	Uptime  int64       `json:"uptime"` // seconds
}

// CPUInfo contains CPU usage information
type CPUInfo struct {
	UsagePercent float64   `json:"usage_percent"`
	Cores        int       `json:"cores"`
	Model        string    `json:"model"`
	PerCore      []float64 `json:"per_core"`
}

// NetworkInfo contains network I/O information
type NetworkInfo struct {
	BytesRecv   uint64 `json:"bytes_recv"`
	BytesSent   uint64 `json:"bytes_sent"`
	PacketsRecv uint64 `json:"packets_recv"`
	PacketsSent uint64 `json:"packets_sent"`
}

// MemoryInfo contains memory usage information
type MemoryInfo struct {
	Total     uint64 `json:"total"`
	Used      uint64 `json:"used"`
	Available uint64 `json:"available"`
	Cached    uint64 `json:"cached"`
}

// DiskInfo contains disk usage information for root filesystem
type DiskInfo struct {
	Total     uint64 `json:"total"`
	Used      uint64 `json:"used"`
	Available uint64 `json:"available"`
}

// LoadAverage contains system load averages
type LoadAverage struct {
	Load1  float64 `json:"load_1"`
	Load5  float64 `json:"load_5"`
	Load15 float64 `json:"load_15"`
}

// GetResources collects current system resource usage
func GetResources() (*SystemResources, error) {
	resources := &SystemResources{}

	// Get CPU info
	cpu, err := getCPUInfo()
	if err == nil {
		resources.CPU = *cpu
	}

	// Get memory info
	mem, err := getMemoryInfo()
	if err == nil {
		resources.Memory = *mem
	}

	// Get disk info
	disk, err := getDiskInfo()
	if err == nil {
		resources.Disk = *disk
	}

	// Get network info
	net, err := getNetworkInfo()
	if err == nil {
		resources.Network = *net
	}

	// Get load average
	load, err := getLoadAverage()
	if err == nil {
		resources.LoadAvg = *load
	}

	// Get uptime
	resources.Uptime = getUptime()

	return resources, nil
}

func getCPUInfo() (*CPUInfo, error) {
	cpu := &CPUInfo{
		Cores:   runtime.NumCPU(),
		PerCore: make([]float64, 0),
	}

	// Get CPU model from /proc/cpuinfo
	data, err := os.ReadFile("/proc/cpuinfo")
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "model name") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					cpu.Model = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}

	// Get CPU usage from /proc/stat
	stat, err := os.ReadFile("/proc/stat")
	if err == nil {
		lines := strings.Split(string(stat), "\n")
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) < 5 {
				continue
			}

			// Overall CPU
			if fields[0] == "cpu" {
				user, _ := strconv.ParseFloat(fields[1], 64)
				nice, _ := strconv.ParseFloat(fields[2], 64)
				system, _ := strconv.ParseFloat(fields[3], 64)
				idle, _ := strconv.ParseFloat(fields[4], 64)
				total := user + nice + system + idle
				if total > 0 {
					cpu.UsagePercent = ((total - idle) / total) * 100
				}
			}

			// Per-core CPU (cpu0, cpu1, etc.)
			if strings.HasPrefix(fields[0], "cpu") && fields[0] != "cpu" {
				user, _ := strconv.ParseFloat(fields[1], 64)
				nice, _ := strconv.ParseFloat(fields[2], 64)
				system, _ := strconv.ParseFloat(fields[3], 64)
				idle, _ := strconv.ParseFloat(fields[4], 64)
				total := user + nice + system + idle
				if total > 0 {
					usage := ((total - idle) / total) * 100
					cpu.PerCore = append(cpu.PerCore, usage)
				}
			}
		}
	}

	return cpu, nil
}

func getNetworkInfo() (*NetworkInfo, error) {
	net := &NetworkInfo{}

	// Read from /proc/net/dev
	data, err := os.ReadFile("/proc/net/dev")
	if err != nil {
		return net, err
	}

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		// Skip header lines
		if strings.Contains(line, "|") || strings.TrimSpace(line) == "" {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}

		// Skip loopback
		iface := strings.TrimSuffix(fields[0], ":")
		if iface == "lo" {
			continue
		}

		// Accumulate stats from all interfaces
		bytesRecv, _ := strconv.ParseUint(fields[1], 10, 64)
		packetsRecv, _ := strconv.ParseUint(fields[2], 10, 64)
		bytesSent, _ := strconv.ParseUint(fields[9], 10, 64)
		packetsSent, _ := strconv.ParseUint(fields[10], 10, 64)

		net.BytesRecv += bytesRecv
		net.PacketsRecv += packetsRecv
		net.BytesSent += bytesSent
		net.PacketsSent += packetsSent
	}

	return net, nil
}

func getDiskInfo() (*DiskInfo, error) {
	disk := &DiskInfo{}

	// Use df command to get disk usage for root filesystem
	cmd := exec.Command("df", "-B1", "/")
	output, err := cmd.Output()
	if err != nil {
		return disk, err
	}

	lines := strings.Split(string(output), "\n")
	if len(lines) >= 2 {
		fields := strings.Fields(lines[1])
		if len(fields) >= 4 {
			disk.Total, _ = strconv.ParseUint(fields[1], 10, 64)
			disk.Used, _ = strconv.ParseUint(fields[2], 10, 64)
			disk.Available, _ = strconv.ParseUint(fields[3], 10, 64)
		}
	}

	return disk, nil
}

func getMemoryInfo() (*MemoryInfo, error) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return nil, err
	}
	defer file.Close()

	mem := &MemoryInfo{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		value, _ := strconv.ParseUint(fields[1], 10, 64)
		value *= 1024 // Convert from kB to bytes

		switch fields[0] {
		case "MemTotal:":
			mem.Total = value
		case "MemAvailable:":
			mem.Available = value
		case "Cached:":
			mem.Cached = value
		}
	}

	mem.Used = mem.Total - mem.Available

	return mem, nil
}

func getLoadAverage() (*LoadAverage, error) {
	data, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return nil, err
	}

	fields := strings.Fields(string(data))
	if len(fields) < 3 {
		return nil, nil
	}

	load := &LoadAverage{}
	load.Load1, _ = strconv.ParseFloat(fields[0], 64)
	load.Load5, _ = strconv.ParseFloat(fields[1], 64)
	load.Load15, _ = strconv.ParseFloat(fields[2], 64)

	return load, nil
}

func getUptime() int64 {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}

	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return 0
	}

	uptime, _ := strconv.ParseFloat(fields[0], 64)
	return int64(uptime)
}

// SystemInfo contains static system information
type SystemInfo struct {
	Hostname     string    `json:"hostname"`
	OS           string    `json:"os"`
	Kernel       string    `json:"kernel"`
	Architecture string    `json:"architecture"`
	CPUModel     string    `json:"cpu_model"`
	CPUCores     int       `json:"cpu_cores"`
	BootTime     time.Time `json:"boot_time"`
	IP           string    `json:"ip"`
}

// GetSystemInfo returns static system information
func GetSystemInfo() (*SystemInfo, error) {
	info := &SystemInfo{
		Architecture: runtime.GOARCH,
		CPUCores:     runtime.NumCPU(),
	}

	// Hostname
	info.Hostname, _ = os.Hostname()

	// Kernel version
	data, err := os.ReadFile("/proc/version")
	if err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 3 {
			info.Kernel = fields[2]
		}
	}

	// OS release
	osRelease, err := os.ReadFile("/etc/os-release")
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(osRelease)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "PRETTY_NAME=") {
				info.OS = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), "\"")
				break
			}
		}
	}

	// CPU model
	cpuinfo, err := os.ReadFile("/proc/cpuinfo")
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(cpuinfo)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "model name") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					info.CPUModel = strings.TrimSpace(parts[1])
					break
				}
			}
		}
	}

	// Boot time from uptime
	uptime := getUptime()
	if uptime > 0 {
		info.BootTime = time.Now().Add(-time.Duration(uptime) * time.Second)
	}

	// Get primary IP address
	cmd := exec.Command("hostname", "-I")
	output, err := cmd.Output()
	if err == nil {
		ips := strings.Fields(string(output))
		if len(ips) > 0 {
			info.IP = ips[0]
		}
	}

	return info, nil
}
