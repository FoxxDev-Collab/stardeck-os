package system

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

// StardeckDataNetwork is the internal network for database communication
const StardeckDataNetwork = "stardeck-data"

// DatabaseImages maps common image name patterns to database types
var DatabaseImages = map[string]models.DatabaseType{
	"postgres":   models.DatabaseTypePostgreSQL,
	"postgresql": models.DatabaseTypePostgreSQL,
	"mariadb":    models.DatabaseTypeMariaDB,
	"mysql":      models.DatabaseTypeMySQL,
	"redis":      models.DatabaseTypeRedis,
	"mongo":      models.DatabaseTypeMongoDB,
	"mongodb":    models.DatabaseTypeMongoDB,
}

// PortRanges defines the port allocation ranges for each database type
var PortRanges = map[models.DatabaseType]struct{ Start, End int }{
	models.DatabaseTypePostgreSQL: {5432, 5499},
	models.DatabaseTypeMariaDB:    {3306, 3399},
	models.DatabaseTypeMySQL:      {3306, 3399},
	models.DatabaseTypeRedis:      {6379, 6449},
	models.DatabaseTypeMongoDB:    {27017, 27099},
}

// DatabaseService manages database containers
type DatabaseService struct {
	podman *PodmanService
	repo   *database.ManagedDatabaseRepo
}

// NewDatabaseService creates a new DatabaseService
func NewDatabaseService(podman *PodmanService) *DatabaseService {
	return &DatabaseService{
		podman: podman,
		repo:   database.NewManagedDatabaseRepo(),
	}
}

// defaultContext returns a context with a reasonable timeout
func defaultContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Minute)
}

// IsDatabaseImage checks if an image name corresponds to a known database type
func (s *DatabaseService) IsDatabaseImage(imageName string) (models.DatabaseType, bool) {
	// Normalize image name: remove registry prefix and tag
	name := imageName
	if idx := strings.LastIndex(name, "/"); idx != -1 {
		name = name[idx+1:]
	}
	if idx := strings.Index(name, ":"); idx != -1 {
		name = name[:idx]
	}
	name = strings.ToLower(name)

	for pattern, dbType := range DatabaseImages {
		if strings.Contains(name, pattern) {
			return dbType, true
		}
	}
	return "", false
}

// EnsureDataNetwork creates the stardeck-data network if it doesn't exist
func (s *DatabaseService) EnsureDataNetwork() error {
	ctx, cancel := defaultContext()
	defer cancel()

	networks, err := s.podman.ListNetworks(ctx)
	if err != nil {
		return fmt.Errorf("failed to list networks: %w", err)
	}

	// Check if network already exists
	for _, net := range networks {
		if net.Name == StardeckDataNetwork {
			return nil
		}
	}

	// Create the network
	err = s.podman.CreateNetwork(ctx, &models.CreateNetworkRequest{
		Name:     StardeckDataNetwork,
		Driver:   "bridge",
		Internal: false, // Apps need to reach databases
		Subnet:   "172.30.0.0/16",
		Gateway:  "172.30.0.1",
		Labels: map[string]string{
			"stardeck.managed": "true",
			"stardeck.purpose": "database-network",
		},
	})
	if err != nil {
		return fmt.Errorf("failed to create data network: %w", err)
	}

	return nil
}

// GetNextAvailablePort finds the next available port in the range for a database type
func (s *DatabaseService) GetNextAvailablePort(dbType models.DatabaseType) (int, error) {
	portRange, ok := PortRanges[dbType]
	if !ok {
		return 0, fmt.Errorf("unknown database type: %s", dbType)
	}

	// Get used ports from database
	usedPorts, err := s.repo.GetUsedExternalPorts()
	if err != nil {
		return 0, fmt.Errorf("failed to get used ports: %w", err)
	}

	// Create a set of used ports for O(1) lookup
	usedSet := make(map[int]bool)
	for _, port := range usedPorts {
		usedSet[port] = true
	}

	// Also check ports used by other containers via Podman
	ctx, cancel := defaultContext()
	defer cancel()

	containers, err := s.podman.ListContainers(ctx)
	if err == nil {
		for _, c := range containers {
			for _, p := range c.Ports {
				usedSet[p.HostPort] = true
			}
		}
	}

	// Find the first available port in range
	for port := portRange.Start; port <= portRange.End; port++ {
		if !usedSet[port] {
			return port, nil
		}
	}

	return 0, fmt.Errorf("no available ports in range %d-%d for %s", portRange.Start, portRange.End, dbType)
}

// CreateDatabase creates a new managed database container
func (s *DatabaseService) CreateDatabase(req *models.CreateDatabaseRequest, userID *int64) (*models.ManagedDatabase, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	// Ensure the data network exists
	if err := s.EnsureDataNetwork(); err != nil {
		return nil, err
	}

	// Get defaults for this database type
	defaults := models.GetDatabaseDefaults(req.Type, req.Version)

	// Generate container name
	containerName := fmt.Sprintf("stardeck-db-%s", req.Name)

	// Determine external port
	var externalPort int
	if req.ExposePort {
		if req.ExternalPort > 0 {
			externalPort = req.ExternalPort
		} else {
			var err error
			externalPort, err = s.GetNextAvailablePort(req.Type)
			if err != nil {
				return nil, err
			}
		}
	}

	// Set admin user
	adminUser := req.AdminUser
	if adminUser == "" {
		adminUser = defaults.AdminUser
	}

	// Generate password if not provided
	adminPassword := req.AdminPassword
	if adminPassword == "" {
		adminPassword = generateSecurePassword(24)
	}

	// Create volume for data persistence
	volumeName := fmt.Sprintf("%s-data", containerName)
	err := s.podman.CreateVolume(ctx, &models.CreateVolumeRequest{
		Name: volumeName,
		Labels: map[string]string{
			"stardeck.managed":       "true",
			"stardeck.database":      req.Name,
			"stardeck.database.type": string(req.Type),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create volume: %w", err)
	}

	// Build environment variables
	env := make(map[string]string)
	switch req.Type {
	case models.DatabaseTypePostgreSQL:
		env["POSTGRES_USER"] = adminUser
		env["POSTGRES_PASSWORD"] = adminPassword
		env["POSTGRES_DB"] = "postgres"
	case models.DatabaseTypeMariaDB:
		env["MARIADB_ROOT_PASSWORD"] = adminPassword
		if adminUser != "root" {
			env["MARIADB_USER"] = adminUser
			env["MARIADB_PASSWORD"] = adminPassword
		}
	case models.DatabaseTypeMySQL:
		env["MYSQL_ROOT_PASSWORD"] = adminPassword
		if adminUser != "root" {
			env["MYSQL_USER"] = adminUser
			env["MYSQL_PASSWORD"] = adminPassword
		}
	case models.DatabaseTypeRedis:
		// Redis uses a different approach - can set password via command
		if adminPassword != "" {
			env["REDIS_PASSWORD"] = adminPassword
		}
	case models.DatabaseTypeMongoDB:
		env["MONGO_INITDB_ROOT_USERNAME"] = adminUser
		env["MONGO_INITDB_ROOT_PASSWORD"] = adminPassword
	}

	// Build port mappings
	var ports []models.PortMapping
	if externalPort > 0 {
		ports = append(ports, models.PortMapping{
			HostPort:      externalPort,
			ContainerPort: defaults.Port,
			Protocol:      "tcp",
		})
	}

	// Build volume mounts
	volumes := []models.VolumeMount{
		{
			Source:   volumeName,
			Target:   defaults.DataPath,
			Type:     "volume",
			ReadOnly: false,
		},
	}

	// Build container create request
	createReq := &models.CreateContainerRequest{
		Name:          containerName,
		Image:         defaults.Image,
		Ports:         ports,
		Volumes:       volumes,
		Environment:   env,
		NetworkMode:   StardeckDataNetwork,
		RestartPolicy: "unless-stopped",
		AutoStart:     true,
		Labels: map[string]string{
			"stardeck.managed":       "true",
			"stardeck.database":      req.Name,
			"stardeck.database.type": string(req.Type),
		},
	}

	// Handle Redis command for password
	if req.Type == models.DatabaseTypeRedis && adminPassword != "" {
		createReq.Command = []string{"redis-server", "--requirepass", adminPassword}
	}

	// Create the container
	containerID, err := s.podman.CreateContainer(ctx, createReq)
	if err != nil {
		// Cleanup volume on failure
		_ = s.podman.RemoveVolume(ctx, volumeName, false)
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	// Start the container
	if err := s.podman.StartContainer(ctx, containerID); err != nil {
		// Cleanup on failure
		_ = s.podman.RemoveContainer(ctx, containerID, true)
		_ = s.podman.RemoveVolume(ctx, volumeName, false)
		return nil, fmt.Errorf("failed to start container: %w", err)
	}

	// Create database record
	db := &models.ManagedDatabase{
		ContainerID:   containerID,
		Name:          req.Name,
		Type:          req.Type,
		Version:       req.Version,
		Image:         defaults.Image,
		InternalHost:  containerName,
		InternalPort:  defaults.Port,
		ExternalPort:  externalPort,
		AdminUser:     adminUser,
		AdminPassword: adminPassword,
		Network:       StardeckDataNetwork,
		VolumeName:    volumeName,
		Status:        models.DatabaseStatusRunning,
		IsShared:      req.IsShared,
		CreatedBy:     userID,
	}

	if err := s.repo.Create(db); err != nil {
		// Container is running but we couldn't save to DB - log but don't fail
		// The container can be adopted later
		return nil, fmt.Errorf("failed to save database record: %w", err)
	}

	return db, nil
}

// DetectDatabaseContainers scans running containers for database instances
func (s *DatabaseService) DetectDatabaseContainers() ([]*models.DetectedDatabase, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	containers, err := s.podman.ListContainers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	// Get already managed database container IDs
	managedDBs, err := s.repo.List()
	if err != nil {
		return nil, fmt.Errorf("failed to list managed databases: %w", err)
	}

	managedIDs := make(map[string]bool)
	for _, db := range managedDBs {
		managedIDs[db.ContainerID] = true
	}

	var detected []*models.DetectedDatabase
	for _, c := range containers {
		// Skip if already managed
		if managedIDs[c.ContainerID] {
			continue
		}

		// Check if this is a database image
		dbType, isDB := s.IsDatabaseImage(c.Image)
		if !isDB {
			continue
		}

		detected = append(detected, &models.DetectedDatabase{
			ContainerID:   c.ContainerID,
			ContainerName: c.Name,
			Type:          dbType,
			Image:         c.Image,
			Status:        string(c.Status),
			Ports:         c.Ports,
		})
	}

	return detected, nil
}

// AdoptDatabase brings an existing database container under Stardeck management
func (s *DatabaseService) AdoptDatabase(req *models.AdoptDatabaseRequest, userID *int64) (*models.ManagedDatabase, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	// Get container details
	containers, err := s.podman.ListContainers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	var container *models.ContainerListItem
	for _, c := range containers {
		if c.ContainerID == req.ContainerID || c.Name == req.ContainerID {
			container = &c
			break
		}
	}

	if container == nil {
		return nil, fmt.Errorf("container not found: %s", req.ContainerID)
	}

	// Check if already managed
	existing, err := s.repo.GetByContainerID(container.ContainerID)
	if err == nil && existing != nil {
		return nil, fmt.Errorf("database already managed: %s", existing.Name)
	}

	// Determine database type
	dbType, ok := s.IsDatabaseImage(container.Image)
	if !ok {
		return nil, fmt.Errorf("not a recognized database image: %s", container.Image)
	}

	// Get defaults for this type
	defaults := models.GetDatabaseDefaults(dbType, "")

	// Determine external port from container
	var externalPort int
	for _, p := range container.Ports {
		if p.ContainerPort == defaults.Port {
			externalPort = p.HostPort
			break
		}
	}

	// Extract version from image tag
	version := ""
	if idx := strings.Index(container.Image, ":"); idx != -1 {
		version = container.Image[idx+1:]
	}

	// Create database record
	db := &models.ManagedDatabase{
		ContainerID:   container.ContainerID,
		Name:          req.Name,
		Type:          dbType,
		Version:       version,
		Image:         container.Image,
		InternalHost:  container.Name,
		InternalPort:  defaults.Port,
		ExternalPort:  externalPort,
		AdminUser:     req.AdminUser,
		AdminPassword: req.AdminPassword,
		Network:       StardeckDataNetwork,
		Status:        models.DatabaseStatus(container.Status),
		IsShared:      req.IsShared,
		CreatedBy:     userID,
	}

	if err := s.repo.Create(db); err != nil {
		return nil, fmt.Errorf("failed to save database record: %w", err)
	}

	return db, nil
}

// StartDatabase starts a managed database container
func (s *DatabaseService) StartDatabase(id string) error {
	ctx, cancel := defaultContext()
	defer cancel()

	db, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("database not found: %w", err)
	}

	if err := s.podman.StartContainer(ctx, db.ContainerID); err != nil {
		return fmt.Errorf("failed to start container: %w", err)
	}

	return s.repo.UpdateStatus(id, models.DatabaseStatusRunning)
}

// StopDatabase stops a managed database container
func (s *DatabaseService) StopDatabase(id string) error {
	ctx, cancel := defaultContext()
	defer cancel()

	db, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("database not found: %w", err)
	}

	if err := s.podman.StopContainer(ctx, db.ContainerID, 30); err != nil {
		return fmt.Errorf("failed to stop container: %w", err)
	}

	return s.repo.UpdateStatus(id, models.DatabaseStatusStopped)
}

// DeleteDatabase removes a managed database and its container
func (s *DatabaseService) DeleteDatabase(id string, removeVolume bool) error {
	ctx, cancel := defaultContext()
	defer cancel()

	db, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("database not found: %w", err)
	}

	// Stop and remove container
	_ = s.podman.StopContainer(ctx, db.ContainerID, 10)
	if err := s.podman.RemoveContainer(ctx, db.ContainerID, true); err != nil {
		// Log but continue - container might already be removed
	}

	// Remove volume if requested
	if removeVolume && db.VolumeName != "" {
		if err := s.podman.RemoveVolume(ctx, db.VolumeName, false); err != nil {
			// Log but continue
		}
	}

	// Remove database record
	return s.repo.Delete(id)
}

// SyncDatabaseStatuses updates database statuses from Podman
func (s *DatabaseService) SyncDatabaseStatuses() error {
	ctx, cancel := defaultContext()
	defer cancel()

	databases, err := s.repo.List()
	if err != nil {
		return fmt.Errorf("failed to list databases: %w", err)
	}

	containers, err := s.podman.ListContainers(ctx)
	if err != nil {
		return fmt.Errorf("failed to list containers: %w", err)
	}

	// Create map of container statuses
	containerStatus := make(map[string]models.ContainerStatus)
	for _, c := range containers {
		containerStatus[c.ContainerID] = c.Status
	}

	// Update each database status
	for _, db := range databases {
		var newStatus models.DatabaseStatus

		if status, ok := containerStatus[db.ContainerID]; ok {
			switch status {
			case models.ContainerStatusRunning:
				newStatus = models.DatabaseStatusRunning
			case models.ContainerStatusExited, models.ContainerStatusCreated:
				newStatus = models.DatabaseStatusStopped
			default:
				newStatus = models.DatabaseStatusUnknown
			}
		} else {
			// Container not found
			newStatus = models.DatabaseStatusError
		}

		if newStatus != db.Status {
			_ = s.repo.UpdateStatus(db.ID, newStatus)
		}
	}

	return nil
}

// GetDatabaseInfo retrieves detailed database information
func (s *DatabaseService) GetDatabaseInfo(id string) (*models.DatabaseInfo, error) {
	ctx, cancel := defaultContext()
	defer cancel()

	db, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("database not found: %w", err)
	}

	connections, err := s.repo.GetConnectionsByDatabase(id)
	if err != nil {
		connections = []*models.DatabaseConnection{}
	}

	// Get container status from Podman
	containers, _ := s.podman.ListContainers(ctx)
	var containerStatus models.ContainerStatus = models.ContainerStatusUnknown
	for _, c := range containers {
		if c.ContainerID == db.ContainerID {
			containerStatus = c.Status
			break
		}
	}

	info := &models.DatabaseInfo{
		ManagedDatabase:  *db,
		ConnectionString: db.GetConnectionString("", true),
		Connections:      make([]models.DatabaseConnection, len(connections)),
		ContainerStatus:  containerStatus,
	}

	for i, conn := range connections {
		info.Connections[i] = *conn
	}

	return info, nil
}

// generateSecurePassword creates a cryptographically secure random password
func generateSecurePassword(length int) string {
	bytes := make([]byte, length/2)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to a less secure but functional password
		return "changeme123!"
	}
	return hex.EncodeToString(bytes)
}
