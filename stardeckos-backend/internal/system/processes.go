package system

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// Process represents a running process
type Process struct {
	PID         int     `json:"pid"`
	PPID        int     `json:"ppid"`
	Name        string  `json:"name"`
	Command     string  `json:"command"`
	User        string  `json:"user"`
	State       string  `json:"state"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryBytes uint64  `json:"memory_bytes"`
	MemoryMB    float64 `json:"memory_mb"`
	Threads     int     `json:"threads"`
	StartTime   int64   `json:"start_time"`
}

// getSystemUptime returns system uptime in seconds
func getSystemUptime() (float64, error) {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0, err
	}
	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return 0, fmt.Errorf("invalid uptime format")
	}
	return strconv.ParseFloat(fields[0], 64)
}

// getClockTicks returns the system clock ticks per second (usually 100)
func getClockTicks() int64 {
	// On most Linux systems, this is 100 (USER_HZ)
	return 100
}

// ListProcesses returns a list of all running processes
func ListProcesses() ([]Process, error) {
	processes := make([]Process, 0)

	// Read /proc directory
	procDir, err := os.Open("/proc")
	if err != nil {
		return nil, fmt.Errorf("failed to open /proc: %w", err)
	}
	defer procDir.Close()

	entries, err := procDir.Readdirnames(-1)
	if err != nil {
		return nil, fmt.Errorf("failed to read /proc: %w", err)
	}

	// Get system info for CPU calculation
	pageSize := os.Getpagesize()
	uptime, _ := getSystemUptime()
	clkTck := getClockTicks()

	for _, entry := range entries {
		// Skip non-numeric entries (not PIDs)
		pid, err := strconv.Atoi(entry)
		if err != nil {
			continue
		}

		proc, err := getProcessInfo(pid, pageSize, uptime, clkTck)
		if err != nil {
			// Process may have exited, skip it
			continue
		}

		processes = append(processes, *proc)
	}

	return processes, nil
}

func getProcessInfo(pid int, pageSize int, uptime float64, clkTck int64) (*Process, error) {
	procPath := filepath.Join("/proc", strconv.Itoa(pid))

	// Read /proc/[pid]/stat
	statData, err := os.ReadFile(filepath.Join(procPath, "stat"))
	if err != nil {
		return nil, err
	}

	proc := &Process{PID: pid}

	// Parse stat file - format: pid (comm) state ppid ...
	statStr := string(statData)

	// Find the command name between parentheses (can contain spaces)
	start := strings.Index(statStr, "(")
	end := strings.LastIndex(statStr, ")")
	if start == -1 || end == -1 {
		return nil, fmt.Errorf("invalid stat format")
	}

	proc.Name = statStr[start+1 : end]

	// Parse the rest of the fields after the closing parenthesis
	rest := strings.Fields(statStr[end+2:])
	if len(rest) < 22 {
		return nil, fmt.Errorf("not enough fields in stat")
	}

	proc.State = rest[0]
	proc.PPID, _ = strconv.Atoi(rest[1])
	proc.Threads, _ = strconv.Atoi(rest[17])

	// CPU time: utime (field 13) + stime (field 14) in clock ticks
	// Fields are 0-indexed after the command, so utime=11, stime=12
	utime, _ := strconv.ParseInt(rest[11], 10, 64)
	stime, _ := strconv.ParseInt(rest[12], 10, 64)
	totalTime := utime + stime

	// Start time (in clock ticks since boot) - field 21 (0-indexed: 19)
	startTime, _ := strconv.ParseInt(rest[19], 10, 64)
	proc.StartTime = startTime

	// Calculate CPU percentage
	// Process uptime in seconds = system_uptime - (starttime / clk_tck)
	processUptime := uptime - (float64(startTime) / float64(clkTck))
	if processUptime > 0 {
		// CPU % = (total_time / clk_tck) / process_uptime * 100
		proc.CPUPercent = (float64(totalTime) / float64(clkTck)) / processUptime * 100
		// Cap at reasonable value and round
		if proc.CPUPercent > 100 {
			proc.CPUPercent = 100
		}
	}

	// Memory (rss is in pages) - field 23 (0-indexed: 21)
	rss, _ := strconv.ParseInt(rest[21], 10, 64)
	proc.MemoryBytes = uint64(rss) * uint64(pageSize)
	proc.MemoryMB = float64(proc.MemoryBytes) / (1024 * 1024)

	// Get user from /proc/[pid]/status
	statusData, err := os.ReadFile(filepath.Join(procPath, "status"))
	if err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(statusData)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "Uid:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					uid, _ := strconv.Atoi(fields[1])
					proc.User = getUserName(uid)
				}
				break
			}
		}
	}

	// Get full command line from /proc/[pid]/cmdline
	cmdlineData, err := os.ReadFile(filepath.Join(procPath, "cmdline"))
	if err == nil {
		// cmdline uses null bytes as separators
		cmdline := strings.ReplaceAll(string(cmdlineData), "\x00", " ")
		proc.Command = strings.TrimSpace(cmdline)
		if proc.Command == "" {
			proc.Command = "[" + proc.Name + "]"
		}
	}

	return proc, nil
}

// getUserName converts UID to username
func getUserName(uid int) string {
	// Read /etc/passwd to find username
	data, err := os.ReadFile("/etc/passwd")
	if err != nil {
		return strconv.Itoa(uid)
	}

	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Split(line, ":")
		if len(fields) >= 3 {
			if u, _ := strconv.Atoi(fields[2]); u == uid {
				return fields[0]
			}
		}
	}

	return strconv.Itoa(uid)
}

// KillProcess sends a signal to a process
func KillProcess(pid int, signal syscall.Signal) error {
	// Validate PID
	if pid <= 0 {
		return fmt.Errorf("invalid PID: %d", pid)
	}

	// Check if process exists
	procPath := filepath.Join("/proc", strconv.Itoa(pid))
	if _, err := os.Stat(procPath); os.IsNotExist(err) {
		return fmt.Errorf("process %d does not exist", pid)
	}

	// Send signal
	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("failed to find process: %w", err)
	}

	err = process.Signal(signal)
	if err != nil {
		return fmt.Errorf("failed to send signal: %w", err)
	}

	return nil
}

// GetProcess returns info for a single process
func GetProcess(pid int) (*Process, error) {
	pageSize := os.Getpagesize()
	uptime, _ := getSystemUptime()
	clkTck := getClockTicks()
	return getProcessInfo(pid, pageSize, uptime, clkTck)
}
