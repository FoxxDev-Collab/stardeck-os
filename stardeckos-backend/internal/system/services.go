package system

import (
	"bufio"
	"fmt"
	"os/exec"
	"strings"
)

// Service represents a systemd service
type Service struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	LoadState   string `json:"load_state"`   // loaded, not-found, masked
	ActiveState string `json:"active_state"` // active, inactive, failed, activating, deactivating
	SubState    string `json:"sub_state"`    // running, exited, dead, waiting, etc.
	UnitFile    string `json:"unit_file"`
	Enabled     bool   `json:"enabled"`
	Running     bool   `json:"running"`
}

// ServiceDetail contains extended service information
type ServiceDetail struct {
	Service
	MainPID     int      `json:"main_pid"`
	Memory      string   `json:"memory"`
	CPU         string   `json:"cpu"`
	Tasks       int      `json:"tasks"`
	StartedAt   string   `json:"started_at"`
	ExecStart   string   `json:"exec_start"`
	Environment []string `json:"environment"`
}

// ListServices returns all systemd services
func ListServices() ([]Service, error) {
	services := make([]Service, 0)

	// List all services with systemctl
	cmd := exec.Command("systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list services: %w", err)
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// Parse line: UNIT LOAD ACTIVE SUB DESCRIPTION
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		svc := Service{
			Name:        strings.TrimSuffix(fields[0], ".service"),
			LoadState:   fields[1],
			ActiveState: fields[2],
			SubState:    fields[3],
			Running:     fields[2] == "active" && fields[3] == "running",
		}

		// Description is the rest of the line
		if len(fields) > 4 {
			svc.Description = strings.Join(fields[4:], " ")
		}

		services = append(services, svc)
	}

	// Get enabled status for each service
	enabledMap, _ := getEnabledServices()
	for i := range services {
		if enabled, ok := enabledMap[services[i].Name]; ok {
			services[i].Enabled = enabled
		}
	}

	return services, nil
}

// getEnabledServices returns a map of service name to enabled status
func getEnabledServices() (map[string]bool, error) {
	enabled := make(map[string]bool)

	cmd := exec.Command("systemctl", "list-unit-files", "--type=service", "--no-pager", "--no-legend")
	output, err := cmd.Output()
	if err != nil {
		return enabled, err
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			name := strings.TrimSuffix(fields[0], ".service")
			state := fields[1]
			enabled[name] = state == "enabled" || state == "static"
		}
	}

	return enabled, nil
}

// GetService returns detailed information about a service
func GetService(name string) (*ServiceDetail, error) {
	// Add .service suffix if not present
	unitName := name
	if !strings.HasSuffix(name, ".service") {
		unitName = name + ".service"
	}

	// Get service status
	cmd := exec.Command("systemctl", "show", unitName,
		"--property=Id,Description,LoadState,ActiveState,SubState,MainPID,MemoryCurrent,CPUUsageNSec,TasksCurrent,ActiveEnterTimestamp,ExecStart,UnitFileState")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get service info: %w", err)
	}

	detail := &ServiceDetail{}
	detail.Name = name

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := parts[0]
		value := parts[1]

		switch key {
		case "Description":
			detail.Description = value
		case "LoadState":
			detail.LoadState = value
		case "ActiveState":
			detail.ActiveState = value
			detail.Running = value == "active"
		case "SubState":
			detail.SubState = value
			if value == "running" {
				detail.Running = true
			}
		case "MainPID":
			fmt.Sscanf(value, "%d", &detail.MainPID)
		case "MemoryCurrent":
			if value != "[not set]" && value != "" {
				bytes, _ := parseBytes(value)
				detail.Memory = formatBytesHuman(bytes)
			}
		case "CPUUsageNSec":
			if value != "[not set]" && value != "" {
				ns, _ := parseUint64(value)
				detail.CPU = formatCPUTime(ns)
			}
		case "TasksCurrent":
			if value != "[not set]" && value != "" {
				fmt.Sscanf(value, "%d", &detail.Tasks)
			}
		case "ActiveEnterTimestamp":
			detail.StartedAt = value
		case "ExecStart":
			detail.ExecStart = value
		case "UnitFileState":
			detail.Enabled = value == "enabled" || value == "static"
		}
	}

	return detail, nil
}

// ServiceControl performs an action on a service
func ServiceControl(name string, action string) error {
	// Validate action
	validActions := map[string]bool{
		"start":   true,
		"stop":    true,
		"restart": true,
		"reload":  true,
		"enable":  true,
		"disable": true,
	}

	if !validActions[action] {
		return fmt.Errorf("invalid action: %s", action)
	}

	// Add .service suffix if not present
	unitName := name
	if !strings.HasSuffix(name, ".service") {
		unitName = name + ".service"
	}

	// Execute systemctl command
	cmd := exec.Command("systemctl", action, unitName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to %s service: %s - %s", action, err, string(output))
	}

	return nil
}

// Helper functions
func parseBytes(s string) (uint64, error) {
	var value uint64
	_, err := fmt.Sscanf(s, "%d", &value)
	return value, err
}

func parseUint64(s string) (uint64, error) {
	var value uint64
	_, err := fmt.Sscanf(s, "%d", &value)
	return value, err
}

func formatBytesHuman(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func formatCPUTime(nanoseconds uint64) string {
	seconds := nanoseconds / 1_000_000_000
	if seconds < 60 {
		return fmt.Sprintf("%ds", seconds)
	}
	minutes := seconds / 60
	seconds = seconds % 60
	if minutes < 60 {
		return fmt.Sprintf("%dm%ds", minutes, seconds)
	}
	hours := minutes / 60
	minutes = minutes % 60
	return fmt.Sprintf("%dh%dm%ds", hours, minutes, seconds)
}
