package models

import "time"

// ContainerStatus represents the state of a container
type ContainerStatus string

const (
	ContainerStatusCreated    ContainerStatus = "created"
	ContainerStatusRunning    ContainerStatus = "running"
	ContainerStatusPaused     ContainerStatus = "paused"
	ContainerStatusRestarting ContainerStatus = "restarting"
	ContainerStatusRemoving   ContainerStatus = "removing"
	ContainerStatusExited     ContainerStatus = "exited"
	ContainerStatusDead       ContainerStatus = "dead"
	ContainerStatusUnknown    ContainerStatus = "unknown"
)

// Container represents a managed container in Stardeck
type Container struct {
	ID           string          `json:"id"`            // Stardeck internal UUID
	ContainerID  string          `json:"container_id"`  // Podman container ID
	Name         string          `json:"name"`          // User-friendly name
	Image        string          `json:"image"`         // image:tag
	Status       ContainerStatus `json:"status"`        // Current container status
	ComposeFile  string          `json:"compose_file"`  // Path or content of compose file
	ComposePath  string          `json:"compose_path"`  // Directory containing compose files
	HasWebUI     bool            `json:"has_web_ui"`    // Whether container has a web UI
	WebUIPort    int             `json:"web_ui_port"`   // Internal port for web UI
	WebUIPath    string          `json:"web_ui_path"`   // Path prefix for web UI (e.g., "/", "/admin")
	Icon         string          `json:"icon"`          // Icon URL (legacy, use IconLight/IconDark)
	IconLight    string          `json:"icon_light"`    // Icon URL for light theme
	IconDark     string          `json:"icon_dark"`     // Icon URL for dark theme
	AutoStart    bool            `json:"auto_start"`    // Start on system boot
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	CreatedBy    *int64          `json:"created_by,omitempty"` // User ID who created
	Labels       string          `json:"labels"`               // JSON key-value pairs
	Metadata     string          `json:"metadata"`             // JSON Stardeck-specific data
}

// ContainerListItem is a lightweight view for listing containers
type ContainerListItem struct {
	ID          string          `json:"id"`
	ContainerID string          `json:"container_id"`
	Name        string          `json:"name"`
	Image       string          `json:"image"`
	Status      ContainerStatus `json:"status"`
	HasWebUI    bool            `json:"has_web_ui"`
	Icon        string          `json:"icon"`
	IconLight   string          `json:"icon_light"`
	IconDark    string          `json:"icon_dark"`
	CreatedAt   time.Time       `json:"created_at"`
	Uptime      string          `json:"uptime,omitempty"`
	Ports       []PortMapping   `json:"ports,omitempty"`
}

// PortMapping represents a container port mapping
type PortMapping struct {
	HostIP        string `json:"host_ip,omitempty"`
	HostPort      int    `json:"host_port"`
	ContainerPort int    `json:"container_port"`
	Protocol      string `json:"protocol"` // tcp, udp
}

// VolumeMount represents a volume mount configuration
type VolumeMount struct {
	Source   string `json:"source"`    // Host path or volume name
	Target   string `json:"target"`    // Container path
	ReadOnly bool   `json:"read_only"` // Mount as read-only
	Type     string `json:"type"`      // bind, volume, tmpfs
}

// ContainerStats represents real-time container statistics
type ContainerStats struct {
	ContainerID string  `json:"container_id"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryUsed  int64   `json:"memory_used"`
	MemoryLimit int64   `json:"memory_limit"`
	MemoryPct   float64 `json:"memory_percent"`
	NetworkRx   int64   `json:"network_rx"`
	NetworkTx   int64   `json:"network_tx"`
	BlockRead   int64   `json:"block_read"`
	BlockWrite  int64   `json:"block_write"`
	PIDs        int     `json:"pids"`
}

// ContainerMetrics represents historical metrics for a container
type ContainerMetrics struct {
	ID          int64     `json:"id"`
	ContainerID string    `json:"container_id"`
	Timestamp   time.Time `json:"timestamp"`
	CPUPercent  float64   `json:"cpu_percent"`
	MemoryUsed  int64     `json:"memory_used"`
	MemoryLimit int64     `json:"memory_limit"`
	NetworkRx   int64     `json:"network_rx"`
	NetworkTx   int64     `json:"network_tx"`
	BlockRead   int64     `json:"block_read"`
	BlockWrite  int64     `json:"block_write"`
}

// CreateContainerRequest represents the request body for creating a container
type CreateContainerRequest struct {
	Name         string            `json:"name" validate:"required,min=1,max=64"`
	Image        string            `json:"image" validate:"required"`
	Ports        []PortMapping     `json:"ports,omitempty"`
	Volumes      []VolumeMount     `json:"volumes,omitempty"`
	Environment  map[string]string `json:"environment,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
	RestartPolicy string           `json:"restart_policy,omitempty"` // no, always, on-failure, unless-stopped
	HasWebUI     bool              `json:"has_web_ui"`
	WebUIPort    int               `json:"web_ui_port,omitempty"`
	WebUIPath    string            `json:"web_ui_path,omitempty"`
	Icon         string            `json:"icon,omitempty"`
	IconLight    string            `json:"icon_light,omitempty"`
	IconDark     string            `json:"icon_dark,omitempty"`
	AutoStart    bool              `json:"auto_start"`
	CPULimit     float64           `json:"cpu_limit,omitempty"`     // CPU cores limit
	MemoryLimit  int64             `json:"memory_limit,omitempty"`  // Memory limit in bytes
	NetworkMode  string            `json:"network_mode,omitempty"`  // bridge, host, none, container:<name|id>
	Hostname     string            `json:"hostname,omitempty"`
	User         string            `json:"user,omitempty"`          // User to run as
	WorkDir      string            `json:"workdir,omitempty"`       // Working directory
	Entrypoint   []string          `json:"entrypoint,omitempty"`
	Command      []string          `json:"command,omitempty"`
}

// UpdateContainerRequest represents the request body for updating a container
type UpdateContainerRequest struct {
	Name       *string           `json:"name,omitempty"`
	HasWebUI   *bool             `json:"has_web_ui,omitempty"`
	WebUIPort  *int              `json:"web_ui_port,omitempty"`
	WebUIPath  *string           `json:"web_ui_path,omitempty"`
	Icon       *string           `json:"icon,omitempty"`
	IconLight  *string           `json:"icon_light,omitempty"`
	IconDark   *string           `json:"icon_dark,omitempty"`
	AutoStart  *bool             `json:"auto_start,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
}

// AdoptContainerRequest represents a request to adopt an existing container into Stardeck
type AdoptContainerRequest struct {
	ContainerID string `json:"container_id" validate:"required"` // Podman container ID or name
	HasWebUI    bool   `json:"has_web_ui"`
	WebUIPort   int    `json:"web_ui_port,omitempty"`  // Host port for web UI
	WebUIPath   string `json:"web_ui_path,omitempty"`  // Path prefix (default: "/")
	Icon        string `json:"icon,omitempty"`         // Icon URL (legacy)
	IconLight   string `json:"icon_light,omitempty"`   // Icon URL for light theme
	IconDark    string `json:"icon_dark,omitempty"`    // Icon URL for dark theme
	AutoStart   bool   `json:"auto_start,omitempty"`   // Auto-start on boot
}

// DeployComposeRequest represents a compose file deployment request
type DeployComposeRequest struct {
	Content     string            `json:"content" validate:"required"`     // YAML content
	ProjectName string            `json:"project_name,omitempty"`          // Compose project name
	Environment map[string]string `json:"environment,omitempty"`           // Environment variables
	Path        string            `json:"path,omitempty"`                  // Path to store compose file
}

// Image represents a container image
type Image struct {
	ID          string    `json:"id"`
	Repository  string    `json:"repository"`
	Tag         string    `json:"tag"`
	Size        int64     `json:"size"`
	Created     time.Time `json:"created"`
	Containers  int       `json:"containers"` // Number of containers using this image
}

// PullImageRequest represents a request to pull an image
type PullImageRequest struct {
	Image string `json:"image" validate:"required"` // image:tag or full URL
}

// Volume represents a Podman volume
type Volume struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	MountPoint string            `json:"mount_point"`
	CreatedAt  time.Time         `json:"created_at"`
	Labels     map[string]string `json:"labels,omitempty"`
	Scope      string            `json:"scope"`
	Options    map[string]string `json:"options,omitempty"`
}

// CreateVolumeRequest represents a request to create a volume
type CreateVolumeRequest struct {
	Name    string            `json:"name" validate:"required"`
	Driver  string            `json:"driver,omitempty"`
	Labels  map[string]string `json:"labels,omitempty"`
	Options map[string]string `json:"options,omitempty"`
}

// Network represents a Podman network
type Network struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Driver    string            `json:"driver"`
	Subnet    string            `json:"subnet,omitempty"`
	Gateway   string            `json:"gateway,omitempty"`
	Internal  bool              `json:"internal"`
	IPv6      bool              `json:"ipv6"`
	Labels    map[string]string `json:"labels,omitempty"`
	CreatedAt time.Time         `json:"created_at"`
}

// CreateNetworkRequest represents a request to create a network
type CreateNetworkRequest struct {
	Name     string            `json:"name" validate:"required"`
	Driver   string            `json:"driver,omitempty"`
	Subnet   string            `json:"subnet,omitempty"`
	Gateway  string            `json:"gateway,omitempty"`
	Internal bool              `json:"internal"`
	IPv6     bool              `json:"ipv6"`
	Labels   map[string]string `json:"labels,omitempty"`
}

// Template represents a saved container configuration
type Template struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Author         string    `json:"author"`
	Version        string    `json:"version"`
	ComposeContent string    `json:"compose_content"`
	EnvDefaults    string    `json:"env_defaults"`  // JSON
	VolumeHints    string    `json:"volume_hints"`  // JSON
	Tags           string    `json:"tags"`          // JSON array
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	UsageCount     int       `json:"usage_count"`
}

// CreateTemplateRequest represents a request to create a template
type CreateTemplateRequest struct {
	Name           string            `json:"name" validate:"required"`
	Description    string            `json:"description,omitempty"`
	Version        string            `json:"version,omitempty"`
	ComposeContent string            `json:"compose_content" validate:"required"`
	EnvDefaults    map[string]string `json:"env_defaults,omitempty"`
	VolumeHints    []VolumeHint      `json:"volume_hints,omitempty"`
	Tags           []string          `json:"tags,omitempty"`
}

// VolumeHint provides guidance for volume configuration during template deployment
type VolumeHint struct {
	Name          string `json:"name"`
	SuggestedPath string `json:"suggested_path"`
	Description   string `json:"description,omitempty"`
	Required      bool   `json:"required"`
}

// DeployTemplateRequest represents a request to deploy from a template
type DeployTemplateRequest struct {
	ProjectName string            `json:"project_name,omitempty"`
	Environment map[string]string `json:"environment,omitempty"`
	Volumes     map[string]string `json:"volumes,omitempty"` // volume name -> host path
}

// ContainerEnvVar represents an environment variable for a container
type ContainerEnvVar struct {
	ID          string    `json:"id"`
	ContainerID string    `json:"container_id"`
	Key         string    `json:"key"`
	Value       string    `json:"value"`
	IsSecret    bool      `json:"is_secret"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ContainerLog represents a log entry from a container
type ContainerLog struct {
	Timestamp time.Time `json:"timestamp"`
	Stream    string    `json:"stream"` // stdout, stderr
	Message   string    `json:"message"`
}

// StackStatus represents the state of a stack
type StackStatus string

const (
	StackStatusActive    StackStatus = "active"
	StackStatusPartial   StackStatus = "partial"
	StackStatusStopped   StackStatus = "stopped"
	StackStatusError     StackStatus = "error"
	StackStatusDeploying StackStatus = "deploying"
)

// Stack represents a compose-based stack deployment
type Stack struct {
	ID             string      `json:"id"`
	Name           string      `json:"name"`
	Description    string      `json:"description"`
	ComposeContent string      `json:"compose_content"`
	Status         StackStatus `json:"status"`
	ContainerCount int         `json:"container_count"`
	RunningCount   int         `json:"running_count"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
	CreatedBy      *int64      `json:"created_by,omitempty"`
	EnvContent     string      `json:"env_content,omitempty"`
	Path           string      `json:"path"`
}

// StackListItem is a lightweight view for listing stacks
type StackListItem struct {
	ID             string      `json:"id"`
	Name           string      `json:"name"`
	Description    string      `json:"description"`
	Status         StackStatus `json:"status"`
	ContainerCount int         `json:"container_count"`
	RunningCount   int         `json:"running_count"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
}

// StackContainer represents a container belonging to a stack
type StackContainer struct {
	Name    string          `json:"name"`
	Service string          `json:"service"`
	Status  ContainerStatus `json:"status"`
	Image   string          `json:"image"`
	Ports   []PortMapping   `json:"ports,omitempty"`
}

// CreateStackRequest represents the request to create a stack
type CreateStackRequest struct {
	Name           string `json:"name" validate:"required,min=1,max=64"`
	Description    string `json:"description,omitempty"`
	ComposeContent string `json:"compose_content" validate:"required"`
	EnvContent     string `json:"env_content,omitempty"`
	Deploy         bool   `json:"deploy"`
}

// UpdateStackRequest represents the request to update a stack
type UpdateStackRequest struct {
	Name           *string `json:"name,omitempty"`
	Description    *string `json:"description,omitempty"`
	ComposeContent *string `json:"compose_content,omitempty"`
	EnvContent     *string `json:"env_content,omitempty"`
}

// Audit action constants for containers
const (
	ActionContainerCreate  = "container.create"
	ActionContainerStart   = "container.start"
	ActionContainerStop    = "container.stop"
	ActionContainerRestart = "container.restart"
	ActionContainerRemove  = "container.remove"
	ActionContainerUpdate  = "container.update"
	ActionImagePull        = "image.pull"
	ActionImageRemove      = "image.remove"
	ActionTemplateCreate   = "template.create"
	ActionTemplateDelete   = "template.delete"
	ActionTemplateDeploy   = "template.deploy"
	ActionVolumCreate      = "volume.create"
	ActionVolumeRemove     = "volume.remove"
	ActionNetworkCreate    = "network.create"
	ActionNetworkRemove    = "network.remove"
	ActionStackCreate      = "stack.create"
	ActionStackUpdate      = "stack.update"
	ActionStackDelete      = "stack.delete"
	ActionStackDeploy      = "stack.deploy"
	ActionStackStop        = "stack.stop"
)
