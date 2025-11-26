package system

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"stardeckos-backend/internal/models"
)

// PodmanService provides operations for Podman container management
type PodmanService struct{}

// NewPodmanService creates a new PodmanService
func NewPodmanService() *PodmanService {
	return &PodmanService{}
}

// podmanCmd executes a podman command and returns the output
func (p *PodmanService) podmanCmd(ctx context.Context, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "podman", args...)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("podman error: %s", string(exitErr.Stderr))
		}
		return nil, err
	}
	return output, nil
}

// CheckPodman verifies Podman is installed and returns version info
func (p *PodmanService) CheckPodman(ctx context.Context) (string, error) {
	output, err := p.podmanCmd(ctx, "version", "--format", "json")
	if err != nil {
		return "", fmt.Errorf("podman not available: %w", err)
	}

	var version struct {
		Client struct {
			Version string `json:"Version"`
		} `json:"Client"`
	}
	if err := json.Unmarshal(output, &version); err != nil {
		return "", err
	}

	return version.Client.Version, nil
}

// podmanContainer represents the JSON output from podman ps
type podmanContainer struct {
	ID      string   `json:"Id"`
	Names   []string `json:"Names"`
	Image   string   `json:"Image"`
	State   string   `json:"State"`
	Status  string   `json:"Status"`
	Created int64    `json:"Created"` // Unix timestamp
	Ports   []struct {
		HostIP        string `json:"host_ip"`
		HostPort      int    `json:"host_port"`
		ContainerPort int    `json:"container_port"`
		Protocol      string `json:"protocol"`
	} `json:"Ports"`
	Labels map[string]string `json:"Labels"`
	Mounts []struct {
		Type        string `json:"Type"`
		Source      string `json:"Source"`
		Destination string `json:"Destination"`
		RW          bool   `json:"RW"`
	} `json:"Mounts"`
}

// ListContainers returns all containers (running and stopped)
func (p *PodmanService) ListContainers(ctx context.Context) ([]models.ContainerListItem, error) {
	output, err := p.podmanCmd(ctx, "ps", "-a", "--format", "json")
	if err != nil {
		return nil, err
	}

	var containers []podmanContainer
	if err := json.Unmarshal(output, &containers); err != nil {
		return nil, fmt.Errorf("failed to parse container list: %w", err)
	}

	result := make([]models.ContainerListItem, 0, len(containers))
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
		}

		ports := make([]models.PortMapping, 0, len(c.Ports))
		for _, port := range c.Ports {
			ports = append(ports, models.PortMapping{
				HostIP:        port.HostIP,
				HostPort:      port.HostPort,
				ContainerPort: port.ContainerPort,
				Protocol:      port.Protocol,
			})
		}

		// Check for Stardeck labels
		hasWebUI := false
		icon := ""
		if c.Labels != nil {
			if val, ok := c.Labels["stardeck.webui"]; ok && val == "true" {
				hasWebUI = true
			}
			if val, ok := c.Labels["stardeck.icon"]; ok {
				icon = val
			}
		}

		result = append(result, models.ContainerListItem{
			ContainerID: c.ID,
			Name:        name,
			Image:       c.Image,
			Status:      mapPodmanStatus(c.State),
			HasWebUI:    hasWebUI,
			Icon:        icon,
			Ports:       ports,
			Uptime:      c.Status,
		})
	}

	return result, nil
}

// mapPodmanStatus maps Podman state strings to our ContainerStatus type
func mapPodmanStatus(state string) models.ContainerStatus {
	switch strings.ToLower(state) {
	case "created":
		return models.ContainerStatusCreated
	case "running":
		return models.ContainerStatusRunning
	case "paused":
		return models.ContainerStatusPaused
	case "restarting":
		return models.ContainerStatusRestarting
	case "removing":
		return models.ContainerStatusRemoving
	case "exited":
		return models.ContainerStatusExited
	case "dead":
		return models.ContainerStatusDead
	default:
		return models.ContainerStatusUnknown
	}
}

// podmanInspect represents detailed container information
type podmanInspect struct {
	ID      string `json:"Id"`
	Created string `json:"Created"`
	Name    string `json:"Name"`
	State   struct {
		Status     string `json:"Status"`
		Running    bool   `json:"Running"`
		Paused     bool   `json:"Paused"`
		Restarting bool   `json:"Restarting"`
		OOMKilled  bool   `json:"OOMKilled"`
		Dead       bool   `json:"Dead"`
		Pid        int    `json:"Pid"`
		ExitCode   int    `json:"ExitCode"`
		Error      string `json:"Error"`
		StartedAt  string `json:"StartedAt"`
		FinishedAt string `json:"FinishedAt"`
	} `json:"State"`
	Config struct {
		Hostname   string            `json:"Hostname"`
		User       string            `json:"User"`
		Env        []string          `json:"Env"`
		Cmd        []string          `json:"Cmd"`
		Image      string            `json:"Image"`
		WorkingDir string            `json:"WorkingDir"`
		Entrypoint []string          `json:"Entrypoint"`
		Labels     map[string]string `json:"Labels"`
	} `json:"Config"`
	HostConfig struct {
		RestartPolicy struct {
			Name              string `json:"Name"`
			MaximumRetryCount int    `json:"MaximumRetryCount"`
		} `json:"RestartPolicy"`
		PortBindings map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string `json:"HostPort"`
		} `json:"PortBindings"`
		Binds       []string `json:"Binds"`
		NetworkMode string   `json:"NetworkMode"`
		Memory      int64    `json:"Memory"`
		NanoCpus    int64    `json:"NanoCpus"`
	} `json:"HostConfig"`
	Mounts []struct {
		Type        string `json:"Type"`
		Source      string `json:"Source"`
		Destination string `json:"Destination"`
		RW          bool   `json:"RW"`
	} `json:"Mounts"`
	NetworkSettings struct {
		Networks map[string]struct {
			IPAddress string `json:"IPAddress"`
			Gateway   string `json:"Gateway"`
			MacAddr   string `json:"MacAddress"`
		} `json:"Networks"`
	} `json:"NetworkSettings"`
}

// InspectContainer returns detailed information about a container
func (p *PodmanService) InspectContainer(ctx context.Context, containerID string) (*podmanInspect, error) {
	output, err := p.podmanCmd(ctx, "inspect", containerID, "--format", "json")
	if err != nil {
		return nil, err
	}

	var containers []podmanInspect
	if err := json.Unmarshal(output, &containers); err != nil {
		return nil, fmt.Errorf("failed to parse container inspect: %w", err)
	}

	if len(containers) == 0 {
		return nil, fmt.Errorf("container not found: %s", containerID)
	}

	return &containers[0], nil
}

// CreateContainer creates a new container
func (p *PodmanService) CreateContainer(ctx context.Context, req *models.CreateContainerRequest) (string, error) {
	args := []string{"create", "--name", req.Name}

	// Add port mappings
	for _, port := range req.Ports {
		portArg := fmt.Sprintf("%d:%d", port.HostPort, port.ContainerPort)
		if port.HostIP != "" {
			portArg = fmt.Sprintf("%s:%s", port.HostIP, portArg)
		}
		if port.Protocol != "" && port.Protocol != "tcp" {
			portArg = fmt.Sprintf("%s/%s", portArg, port.Protocol)
		}
		args = append(args, "-p", portArg)
	}

	// Add volume mounts
	for _, vol := range req.Volumes {
		volArg := fmt.Sprintf("%s:%s", vol.Source, vol.Target)
		if vol.ReadOnly {
			volArg += ":ro"
		}
		args = append(args, "-v", volArg)
	}

	// Add environment variables
	for key, value := range req.Environment {
		args = append(args, "-e", fmt.Sprintf("%s=%s", key, value))
	}

	// Add labels
	for key, value := range req.Labels {
		args = append(args, "--label", fmt.Sprintf("%s=%s", key, value))
	}

	// Add Stardeck labels
	if req.HasWebUI {
		args = append(args, "--label", "stardeck.webui=true")
		if req.WebUIPort > 0 {
			args = append(args, "--label", fmt.Sprintf("stardeck.webui.port=%d", req.WebUIPort))
		}
		if req.WebUIPath != "" {
			args = append(args, "--label", fmt.Sprintf("stardeck.webui.path=%s", req.WebUIPath))
		}
	}
	if req.Icon != "" {
		args = append(args, "--label", fmt.Sprintf("stardeck.icon=%s", req.Icon))
	}

	// Restart policy
	if req.RestartPolicy != "" {
		args = append(args, "--restart", req.RestartPolicy)
	}

	// Resource limits
	if req.CPULimit > 0 {
		args = append(args, "--cpus", fmt.Sprintf("%.2f", req.CPULimit))
	}
	if req.MemoryLimit > 0 {
		args = append(args, "--memory", fmt.Sprintf("%d", req.MemoryLimit))
	}

	// Network mode
	if req.NetworkMode != "" {
		args = append(args, "--network", req.NetworkMode)
	}

	// Hostname
	if req.Hostname != "" {
		args = append(args, "--hostname", req.Hostname)
	}

	// User
	if req.User != "" {
		args = append(args, "--user", req.User)
	}

	// Working directory
	if req.WorkDir != "" {
		args = append(args, "--workdir", req.WorkDir)
	}

	// Entrypoint
	if len(req.Entrypoint) > 0 {
		args = append(args, "--entrypoint", strings.Join(req.Entrypoint, " "))
	}

	// Image
	args = append(args, req.Image)

	// Command
	if len(req.Command) > 0 {
		args = append(args, req.Command...)
	}

	output, err := p.podmanCmd(ctx, args...)
	if err != nil {
		return "", err
	}

	containerID := strings.TrimSpace(string(output))
	return containerID, nil
}

// StartContainer starts a stopped container
func (p *PodmanService) StartContainer(ctx context.Context, containerID string) error {
	_, err := p.podmanCmd(ctx, "start", containerID)
	return err
}

// StopContainer stops a running container
func (p *PodmanService) StopContainer(ctx context.Context, containerID string, timeout int) error {
	args := []string{"stop"}
	if timeout > 0 {
		args = append(args, "-t", strconv.Itoa(timeout))
	}
	args = append(args, containerID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RestartContainer restarts a container
func (p *PodmanService) RestartContainer(ctx context.Context, containerID string, timeout int) error {
	args := []string{"restart"}
	if timeout > 0 {
		args = append(args, "-t", strconv.Itoa(timeout))
	}
	args = append(args, containerID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RemoveContainer removes a container
func (p *PodmanService) RemoveContainer(ctx context.Context, containerID string, force bool) error {
	args := []string{"rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, containerID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// GetContainerLogs streams container logs
func (p *PodmanService) GetContainerLogs(ctx context.Context, containerID string, tail int, follow bool) (io.ReadCloser, error) {
	args := []string{"logs"}
	if tail > 0 {
		args = append(args, "--tail", strconv.Itoa(tail))
	}
	if follow {
		args = append(args, "-f")
	}
	args = append(args, "--timestamps", containerID)

	cmd := exec.CommandContext(ctx, "podman", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	// Return a combined reader that also handles cleanup
	return &logReader{
		reader: stdout,
		cmd:    cmd,
	}, nil
}

type logReader struct {
	reader io.ReadCloser
	cmd    *exec.Cmd
}

func (l *logReader) Read(p []byte) (int, error) {
	return l.reader.Read(p)
}

func (l *logReader) Close() error {
	l.reader.Close()
	return l.cmd.Wait()
}

// GetContainerStats gets real-time stats for a container
func (p *PodmanService) GetContainerStats(ctx context.Context, containerID string) (*models.ContainerStats, error) {
	output, err := p.podmanCmd(ctx, "stats", containerID, "--no-stream", "--format", "json")
	if err != nil {
		return nil, err
	}

	var stats []struct {
		ContainerID string `json:"ContainerID"`
		Name        string `json:"Name"`
		CPUPerc     string `json:"CPU"`
		MemUsage    string `json:"MemUsage"`
		MemPerc     string `json:"Mem"`
		NetIO       string `json:"NetIO"`
		BlockIO     string `json:"BlockIO"`
		PIDs        string `json:"PIDs"`
	}
	if err := json.Unmarshal(output, &stats); err != nil {
		return nil, fmt.Errorf("failed to parse stats: %w", err)
	}

	if len(stats) == 0 {
		return nil, fmt.Errorf("no stats available for container: %s", containerID)
	}

	s := stats[0]
	result := &models.ContainerStats{
		ContainerID: containerID,
	}

	// Parse CPU percentage (e.g., "2.5%")
	result.CPUPercent = parsePercentage(s.CPUPerc)

	// Parse memory (e.g., "100MiB / 1GiB")
	result.MemoryUsed, result.MemoryLimit = parseMemoryUsage(s.MemUsage)
	result.MemoryPct = parsePercentage(s.MemPerc)

	// Parse network I/O (e.g., "1.2kB / 3.4kB")
	result.NetworkRx, result.NetworkTx = parseIOStats(s.NetIO)

	// Parse block I/O
	result.BlockRead, result.BlockWrite = parseIOStats(s.BlockIO)

	// Parse PIDs
	result.PIDs, _ = strconv.Atoi(s.PIDs)

	return result, nil
}

// parsePercentage parses a percentage string like "2.5%" into a float64
func parsePercentage(s string) float64 {
	s = strings.TrimSuffix(s, "%")
	val, _ := strconv.ParseFloat(s, 64)
	return val
}

// parseMemoryUsage parses memory usage strings like "100MiB / 1GiB"
func parseMemoryUsage(s string) (used, limit int64) {
	parts := strings.Split(s, "/")
	if len(parts) == 2 {
		used = parsePodmanBytes(strings.TrimSpace(parts[0]))
		limit = parsePodmanBytes(strings.TrimSpace(parts[1]))
	}
	return
}

// parseIOStats parses I/O stats strings like "1.2kB / 3.4kB"
func parseIOStats(s string) (rx, tx int64) {
	parts := strings.Split(s, "/")
	if len(parts) == 2 {
		rx = parsePodmanBytes(strings.TrimSpace(parts[0]))
		tx = parsePodmanBytes(strings.TrimSpace(parts[1]))
	}
	return
}

// parsePodmanBytes parses byte strings like "1.2kB", "100MiB", "1GiB"
func parsePodmanBytes(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "--" || s == "" {
		return 0
	}

	multipliers := map[string]int64{
		"B":   1,
		"kB":  1000,
		"KB":  1000,
		"KiB": 1024,
		"MB":  1000 * 1000,
		"MiB": 1024 * 1024,
		"GB":  1000 * 1000 * 1000,
		"GiB": 1024 * 1024 * 1024,
		"TB":  1000 * 1000 * 1000 * 1000,
		"TiB": 1024 * 1024 * 1024 * 1024,
	}

	for suffix, mult := range multipliers {
		if strings.HasSuffix(s, suffix) {
			numStr := strings.TrimSuffix(s, suffix)
			val, _ := strconv.ParseFloat(numStr, 64)
			return int64(val * float64(mult))
		}
	}

	// Try parsing as plain number
	val, _ := strconv.ParseInt(s, 10, 64)
	return val
}

// Image operations

// podmanImage represents a container image
type podmanImage struct {
	ID         string   `json:"Id"`
	Repository string   `json:"Repository,omitempty"`
	Tag        string   `json:"Tag,omitempty"`
	RepoTags   []string `json:"RepoTags"`
	Size       int64    `json:"Size"`
	Created    int64    `json:"Created"`
	Containers int      `json:"Containers"`
}

// ListImages returns all container images
func (p *PodmanService) ListImages(ctx context.Context) ([]models.Image, error) {
	output, err := p.podmanCmd(ctx, "images", "--format", "json")
	if err != nil {
		return nil, err
	}

	var images []podmanImage
	if err := json.Unmarshal(output, &images); err != nil {
		return nil, fmt.Errorf("failed to parse image list: %w", err)
	}

	result := make([]models.Image, 0, len(images))
	for _, img := range images {
		repo := img.Repository
		tag := img.Tag
		if len(img.RepoTags) > 0 {
			parts := strings.Split(img.RepoTags[0], ":")
			if len(parts) == 2 {
				repo = parts[0]
				tag = parts[1]
			}
		}

		result = append(result, models.Image{
			ID:         img.ID,
			Repository: repo,
			Tag:        tag,
			Size:       img.Size,
			Created:    time.Unix(img.Created, 0),
			Containers: img.Containers,
		})
	}

	return result, nil
}

// PullImage pulls an image from a registry
func (p *PodmanService) PullImage(ctx context.Context, image string) error {
	_, err := p.podmanCmd(ctx, "pull", image)
	return err
}

// RemoveImage removes an image
func (p *PodmanService) RemoveImage(ctx context.Context, imageID string, force bool) error {
	args := []string{"rmi"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, imageID)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// Volume operations

// ListVolumes returns all Podman volumes
func (p *PodmanService) ListVolumes(ctx context.Context) ([]models.Volume, error) {
	output, err := p.podmanCmd(ctx, "volume", "ls", "--format", "json")
	if err != nil {
		return nil, err
	}

	var volumes []struct {
		Name       string            `json:"Name"`
		Driver     string            `json:"Driver"`
		MountPoint string            `json:"Mountpoint"`
		CreatedAt  string            `json:"CreatedAt"`
		Labels     map[string]string `json:"Labels"`
		Scope      string            `json:"Scope"`
		Options    map[string]string `json:"Options"`
	}
	if err := json.Unmarshal(output, &volumes); err != nil {
		return nil, fmt.Errorf("failed to parse volume list: %w", err)
	}

	result := make([]models.Volume, 0, len(volumes))
	for _, v := range volumes {
		createdAt, _ := time.Parse(time.RFC3339, v.CreatedAt)
		result = append(result, models.Volume{
			Name:       v.Name,
			Driver:     v.Driver,
			MountPoint: v.MountPoint,
			CreatedAt:  createdAt,
			Labels:     v.Labels,
			Scope:      v.Scope,
			Options:    v.Options,
		})
	}

	return result, nil
}

// CreateVolume creates a new volume
func (p *PodmanService) CreateVolume(ctx context.Context, req *models.CreateVolumeRequest) error {
	args := []string{"volume", "create"}

	if req.Driver != "" {
		args = append(args, "--driver", req.Driver)
	}

	for key, value := range req.Labels {
		args = append(args, "--label", fmt.Sprintf("%s=%s", key, value))
	}

	for key, value := range req.Options {
		args = append(args, "--opt", fmt.Sprintf("%s=%s", key, value))
	}

	args = append(args, req.Name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RemoveVolume removes a volume
func (p *PodmanService) RemoveVolume(ctx context.Context, name string, force bool) error {
	args := []string{"volume", "rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// Network operations

// ListNetworks returns all Podman networks
func (p *PodmanService) ListNetworks(ctx context.Context) ([]models.Network, error) {
	output, err := p.podmanCmd(ctx, "network", "ls", "--format", "json")
	if err != nil {
		return nil, err
	}

	var networks []struct {
		ID        string            `json:"Id"`
		Name      string            `json:"Name"`
		Driver    string            `json:"Driver"`
		Labels    map[string]string `json:"Labels"`
		Internal  bool              `json:"Internal"`
		IPv6      bool              `json:"IPv6"`
		CreatedAt string            `json:"Created"`
		Subnets   []struct {
			Subnet  string `json:"Subnet"`
			Gateway string `json:"Gateway"`
		} `json:"Subnets"`
	}
	if err := json.Unmarshal(output, &networks); err != nil {
		return nil, fmt.Errorf("failed to parse network list: %w", err)
	}

	result := make([]models.Network, 0, len(networks))
	for _, n := range networks {
		createdAt, _ := time.Parse(time.RFC3339, n.CreatedAt)
		subnet := ""
		gateway := ""
		if len(n.Subnets) > 0 {
			subnet = n.Subnets[0].Subnet
			gateway = n.Subnets[0].Gateway
		}
		result = append(result, models.Network{
			ID:        n.ID,
			Name:      n.Name,
			Driver:    n.Driver,
			Subnet:    subnet,
			Gateway:   gateway,
			Internal:  n.Internal,
			IPv6:      n.IPv6,
			Labels:    n.Labels,
			CreatedAt: createdAt,
		})
	}

	return result, nil
}

// CreateNetwork creates a new network
func (p *PodmanService) CreateNetwork(ctx context.Context, req *models.CreateNetworkRequest) error {
	args := []string{"network", "create"}

	if req.Driver != "" {
		args = append(args, "--driver", req.Driver)
	}

	if req.Subnet != "" {
		args = append(args, "--subnet", req.Subnet)
	}

	if req.Gateway != "" {
		args = append(args, "--gateway", req.Gateway)
	}

	if req.Internal {
		args = append(args, "--internal")
	}

	if req.IPv6 {
		args = append(args, "--ipv6")
	}

	for key, value := range req.Labels {
		args = append(args, "--label", fmt.Sprintf("%s=%s", key, value))
	}

	args = append(args, req.Name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// RemoveNetwork removes a network
func (p *PodmanService) RemoveNetwork(ctx context.Context, name string, force bool) error {
	args := []string{"network", "rm"}
	if force {
		args = append(args, "-f")
	}
	args = append(args, name)
	_, err := p.podmanCmd(ctx, args...)
	return err
}

// Exec runs a command inside a container
func (p *PodmanService) Exec(ctx context.Context, containerID string, cmd []string, interactive bool) ([]byte, error) {
	args := []string{"exec"}
	if interactive {
		args = append(args, "-it")
	}
	args = append(args, containerID)
	args = append(args, cmd...)

	return p.podmanCmd(ctx, args...)
}

// StreamLogs streams logs to a channel (for WebSocket)
func (p *PodmanService) StreamLogs(ctx context.Context, containerID string, tail int, logChan chan<- models.ContainerLog) error {
	args := []string{"logs", "-f", "--timestamps"}
	if tail > 0 {
		args = append(args, "--tail", strconv.Itoa(tail))
	}
	args = append(args, containerID)

	cmd := exec.CommandContext(ctx, "podman", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	// Read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			ts, msg := parseLogLine(line)
			logChan <- models.ContainerLog{
				Timestamp: ts,
				Stream:    "stdout",
				Message:   msg,
			}
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			ts, msg := parseLogLine(line)
			logChan <- models.ContainerLog{
				Timestamp: ts,
				Stream:    "stderr",
				Message:   msg,
			}
		}
	}()

	return cmd.Wait()
}

// parseLogLine parses a timestamp-prefixed log line
func parseLogLine(line string) (time.Time, string) {
	// Format: 2024-01-15T12:34:56.789Z message
	if len(line) > 30 {
		tsStr := line[:30]
		ts, err := time.Parse(time.RFC3339Nano, tsStr)
		if err == nil {
			return ts, strings.TrimSpace(line[30:])
		}
	}
	return time.Now(), line
}

// CheckPodmanCompose checks if podman-compose is available
func (p *PodmanService) CheckPodmanCompose(ctx context.Context) bool {
	cmd := exec.CommandContext(ctx, "podman-compose", "version")
	err := cmd.Run()
	return err == nil
}

// InstallPackage installs a package via dnf and streams output
func (p *PodmanService) InstallPackage(ctx context.Context, packageName string, outputChan chan<- string) error {
	cmd := exec.CommandContext(ctx, "sudo", "dnf", "install", "-y", packageName)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}

	// Read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			outputChan <- scanner.Text()
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			outputChan <- scanner.Text()
		}
	}()

	return cmd.Wait()
}

// PauseContainer pauses a running container
func (p *PodmanService) PauseContainer(ctx context.Context, containerID string) error {
	_, err := p.podmanCmd(ctx, "pause", containerID)
	return err
}

// UnpauseContainer unpauses a paused container
func (p *PodmanService) UnpauseContainer(ctx context.Context, containerID string) error {
	_, err := p.podmanCmd(ctx, "unpause", containerID)
	return err
}

// Compose operations

// ComposeUp deploys a compose stack
func (p *PodmanService) ComposeUp(ctx context.Context, projectDir string, projectName string, outputChan chan<- string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "up", "-d")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start compose up: %w", err)
	}

	// Read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	// Read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	return cmd.Wait()
}

// ComposeDown stops and removes a compose stack
func (p *PodmanService) ComposeDown(ctx context.Context, projectDir string, projectName string, removeVolumes bool, outputChan chan<- string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "down")
	if removeVolumes {
		args = append(args, "-v")
	}

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start compose down: %w", err)
	}

	// Read output
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	return cmd.Wait()
}

// ComposeStop stops a compose stack (without removing)
func (p *PodmanService) ComposeStop(ctx context.Context, projectDir string, projectName string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "stop")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir
	return cmd.Run()
}

// ComposeStart starts a stopped compose stack
func (p *PodmanService) ComposeStart(ctx context.Context, projectDir string, projectName string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "start")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir
	return cmd.Run()
}

// ComposeRestart restarts a compose stack
func (p *PodmanService) ComposeRestart(ctx context.Context, projectDir string, projectName string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "restart")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir
	return cmd.Run()
}

// ComposePull pulls images for a compose stack
func (p *PodmanService) ComposePull(ctx context.Context, projectDir string, projectName string, outputChan chan<- string) error {
	args := []string{"-f", projectDir + "/docker-compose.yml"}
	if projectName != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "pull")

	cmd := exec.CommandContext(ctx, "podman-compose", args...)
	cmd.Dir = projectDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start compose pull: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			if outputChan != nil {
				outputChan <- scanner.Text()
			}
		}
	}()

	return cmd.Wait()
}

// GetStackContainers returns containers belonging to a compose project
func (p *PodmanService) GetStackContainers(ctx context.Context, projectName string) ([]models.StackContainer, error) {
	// List containers with the compose project label
	output, err := p.podmanCmd(ctx, "ps", "-a", "--format", "json",
		"--filter", fmt.Sprintf("label=com.docker.compose.project=%s", projectName))
	if err != nil {
		return nil, err
	}

	var containers []podmanContainer
	if err := json.Unmarshal(output, &containers); err != nil {
		return nil, fmt.Errorf("failed to parse container list: %w", err)
	}

	result := make([]models.StackContainer, 0, len(containers))
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
		}

		service := ""
		if c.Labels != nil {
			if val, ok := c.Labels["com.docker.compose.service"]; ok {
				service = val
			}
		}

		ports := make([]models.PortMapping, 0, len(c.Ports))
		for _, port := range c.Ports {
			ports = append(ports, models.PortMapping{
				HostIP:        port.HostIP,
				HostPort:      port.HostPort,
				ContainerPort: port.ContainerPort,
				Protocol:      port.Protocol,
			})
		}

		result = append(result, models.StackContainer{
			Name:    name,
			Service: service,
			Status:  mapPodmanStatus(c.State),
			Image:   c.Image,
			Ports:   ports,
		})
	}

	return result, nil
}
