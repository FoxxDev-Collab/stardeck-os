package database

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"stardeckos-backend/internal/models"
)

// ContainerRepo handles container database operations
type ContainerRepo struct {
	db *sql.DB
}

// NewContainerRepo creates a new container repository
func NewContainerRepo() *ContainerRepo {
	return &ContainerRepo{db: DB}
}

// Create adds a new container to the database
func (r *ContainerRepo) Create(c *models.Container) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	c.CreatedAt = time.Now()
	c.UpdatedAt = time.Now()

	_, err := r.db.Exec(`
		INSERT INTO containers (
			id, container_id, name, image, status, compose_file, compose_path,
			has_web_ui, web_ui_port, web_ui_path, icon, auto_start,
			created_at, updated_at, created_by, labels, metadata
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		c.ID, c.ContainerID, c.Name, c.Image, c.Status, c.ComposeFile, c.ComposePath,
		c.HasWebUI, c.WebUIPort, c.WebUIPath, c.Icon, c.AutoStart,
		c.CreatedAt, c.UpdatedAt, c.CreatedBy, c.Labels, c.Metadata,
	)
	return err
}

// GetByID retrieves a container by its Stardeck ID
func (r *ContainerRepo) GetByID(id string) (*models.Container, error) {
	c := &models.Container{}
	var hasWebUI, autoStart int
	err := r.db.QueryRow(`
		SELECT id, container_id, name, image, status, compose_file, compose_path,
			has_web_ui, web_ui_port, web_ui_path, icon, auto_start,
			created_at, updated_at, created_by, labels, metadata
		FROM containers WHERE id = ?
	`, id).Scan(
		&c.ID, &c.ContainerID, &c.Name, &c.Image, &c.Status, &c.ComposeFile, &c.ComposePath,
		&hasWebUI, &c.WebUIPort, &c.WebUIPath, &c.Icon, &autoStart,
		&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy, &c.Labels, &c.Metadata,
	)
	if err != nil {
		return nil, err
	}
	c.HasWebUI = hasWebUI == 1
	c.AutoStart = autoStart == 1
	return c, nil
}

// GetByContainerID retrieves a container by its Podman container ID
func (r *ContainerRepo) GetByContainerID(containerID string) (*models.Container, error) {
	c := &models.Container{}
	var hasWebUI, autoStart int
	err := r.db.QueryRow(`
		SELECT id, container_id, name, image, status, compose_file, compose_path,
			has_web_ui, web_ui_port, web_ui_path, icon, auto_start,
			created_at, updated_at, created_by, labels, metadata
		FROM containers WHERE container_id = ?
	`, containerID).Scan(
		&c.ID, &c.ContainerID, &c.Name, &c.Image, &c.Status, &c.ComposeFile, &c.ComposePath,
		&hasWebUI, &c.WebUIPort, &c.WebUIPath, &c.Icon, &autoStart,
		&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy, &c.Labels, &c.Metadata,
	)
	if err != nil {
		return nil, err
	}
	c.HasWebUI = hasWebUI == 1
	c.AutoStart = autoStart == 1
	return c, nil
}

// GetByName retrieves a container by its name
func (r *ContainerRepo) GetByName(name string) (*models.Container, error) {
	c := &models.Container{}
	var hasWebUI, autoStart int
	err := r.db.QueryRow(`
		SELECT id, container_id, name, image, status, compose_file, compose_path,
			has_web_ui, web_ui_port, web_ui_path, icon, auto_start,
			created_at, updated_at, created_by, labels, metadata
		FROM containers WHERE name = ?
	`, name).Scan(
		&c.ID, &c.ContainerID, &c.Name, &c.Image, &c.Status, &c.ComposeFile, &c.ComposePath,
		&hasWebUI, &c.WebUIPort, &c.WebUIPath, &c.Icon, &autoStart,
		&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy, &c.Labels, &c.Metadata,
	)
	if err != nil {
		return nil, err
	}
	c.HasWebUI = hasWebUI == 1
	c.AutoStart = autoStart == 1
	return c, nil
}

// List retrieves all containers
func (r *ContainerRepo) List() ([]models.Container, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, name, image, status, compose_file, compose_path,
			has_web_ui, web_ui_port, web_ui_path, icon, auto_start,
			created_at, updated_at, created_by, labels, metadata
		FROM containers ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var containers []models.Container
	for rows.Next() {
		var c models.Container
		var hasWebUI, autoStart int
		if err := rows.Scan(
			&c.ID, &c.ContainerID, &c.Name, &c.Image, &c.Status, &c.ComposeFile, &c.ComposePath,
			&hasWebUI, &c.WebUIPort, &c.WebUIPath, &c.Icon, &autoStart,
			&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy, &c.Labels, &c.Metadata,
		); err != nil {
			return nil, err
		}
		c.HasWebUI = hasWebUI == 1
		c.AutoStart = autoStart == 1
		containers = append(containers, c)
	}

	return containers, nil
}

// Update updates a container in the database
func (r *ContainerRepo) Update(c *models.Container) error {
	c.UpdatedAt = time.Now()
	_, err := r.db.Exec(`
		UPDATE containers SET
			container_id = ?, name = ?, image = ?, status = ?,
			compose_file = ?, compose_path = ?,
			has_web_ui = ?, web_ui_port = ?, web_ui_path = ?,
			icon = ?, auto_start = ?, updated_at = ?,
			labels = ?, metadata = ?
		WHERE id = ?
	`,
		c.ContainerID, c.Name, c.Image, c.Status,
		c.ComposeFile, c.ComposePath,
		c.HasWebUI, c.WebUIPort, c.WebUIPath,
		c.Icon, c.AutoStart, c.UpdatedAt,
		c.Labels, c.Metadata, c.ID,
	)
	return err
}

// UpdateStatus updates just the status of a container
func (r *ContainerRepo) UpdateStatus(id string, status models.ContainerStatus) error {
	_, err := r.db.Exec(`
		UPDATE containers SET status = ?, updated_at = ? WHERE id = ?
	`, status, time.Now(), id)
	return err
}

// Delete removes a container from the database
func (r *ContainerRepo) Delete(id string) error {
	_, err := r.db.Exec("DELETE FROM containers WHERE id = ?", id)
	return err
}

// DeleteByContainerID removes a container by its Podman ID
func (r *ContainerRepo) DeleteByContainerID(containerID string) error {
	_, err := r.db.Exec("DELETE FROM containers WHERE container_id = ?", containerID)
	return err
}

// ListWithWebUI returns containers that have web UIs
func (r *ContainerRepo) ListWithWebUI() ([]models.Container, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, name, image, status, compose_file, compose_path,
			has_web_ui, web_ui_port, web_ui_path, icon, auto_start,
			created_at, updated_at, created_by, labels, metadata
		FROM containers WHERE has_web_ui = 1 ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var containers []models.Container
	for rows.Next() {
		var c models.Container
		var hasWebUI, autoStart int
		if err := rows.Scan(
			&c.ID, &c.ContainerID, &c.Name, &c.Image, &c.Status, &c.ComposeFile, &c.ComposePath,
			&hasWebUI, &c.WebUIPort, &c.WebUIPath, &c.Icon, &autoStart,
			&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy, &c.Labels, &c.Metadata,
		); err != nil {
			return nil, err
		}
		c.HasWebUI = hasWebUI == 1
		c.AutoStart = autoStart == 1
		containers = append(containers, c)
	}

	return containers, nil
}

// ListAutoStart returns containers that should auto-start
func (r *ContainerRepo) ListAutoStart() ([]models.Container, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, name, image, status, compose_file, compose_path,
			has_web_ui, web_ui_port, web_ui_path, icon, auto_start,
			created_at, updated_at, created_by, labels, metadata
		FROM containers WHERE auto_start = 1 ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var containers []models.Container
	for rows.Next() {
		var c models.Container
		var hasWebUI, autoStart int
		if err := rows.Scan(
			&c.ID, &c.ContainerID, &c.Name, &c.Image, &c.Status, &c.ComposeFile, &c.ComposePath,
			&hasWebUI, &c.WebUIPort, &c.WebUIPath, &c.Icon, &autoStart,
			&c.CreatedAt, &c.UpdatedAt, &c.CreatedBy, &c.Labels, &c.Metadata,
		); err != nil {
			return nil, err
		}
		c.HasWebUI = hasWebUI == 1
		c.AutoStart = autoStart == 1
		containers = append(containers, c)
	}

	return containers, nil
}

// TemplateRepo handles template database operations
type TemplateRepo struct {
	db *sql.DB
}

// NewTemplateRepo creates a new template repository
func NewTemplateRepo() *TemplateRepo {
	return &TemplateRepo{db: DB}
}

// Create adds a new template to the database
func (r *TemplateRepo) Create(t *models.Template) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	t.CreatedAt = time.Now()
	t.UpdatedAt = time.Now()

	_, err := r.db.Exec(`
		INSERT INTO templates (
			id, name, description, author, version, compose_content,
			env_defaults, volume_hints, tags, created_at, updated_at, usage_count
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		t.ID, t.Name, t.Description, t.Author, t.Version, t.ComposeContent,
		t.EnvDefaults, t.VolumeHints, t.Tags, t.CreatedAt, t.UpdatedAt, t.UsageCount,
	)
	return err
}

// GetByID retrieves a template by ID
func (r *TemplateRepo) GetByID(id string) (*models.Template, error) {
	t := &models.Template{}
	err := r.db.QueryRow(`
		SELECT id, name, description, author, version, compose_content,
			env_defaults, volume_hints, tags, created_at, updated_at, usage_count
		FROM templates WHERE id = ?
	`, id).Scan(
		&t.ID, &t.Name, &t.Description, &t.Author, &t.Version, &t.ComposeContent,
		&t.EnvDefaults, &t.VolumeHints, &t.Tags, &t.CreatedAt, &t.UpdatedAt, &t.UsageCount,
	)
	if err != nil {
		return nil, err
	}
	return t, nil
}

// List retrieves all templates
func (r *TemplateRepo) List() ([]models.Template, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, author, version, compose_content,
			env_defaults, volume_hints, tags, created_at, updated_at, usage_count
		FROM templates ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []models.Template
	for rows.Next() {
		var t models.Template
		if err := rows.Scan(
			&t.ID, &t.Name, &t.Description, &t.Author, &t.Version, &t.ComposeContent,
			&t.EnvDefaults, &t.VolumeHints, &t.Tags, &t.CreatedAt, &t.UpdatedAt, &t.UsageCount,
		); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}

	return templates, nil
}

// Update updates a template
func (r *TemplateRepo) Update(t *models.Template) error {
	t.UpdatedAt = time.Now()
	_, err := r.db.Exec(`
		UPDATE templates SET
			name = ?, description = ?, author = ?, version = ?, compose_content = ?,
			env_defaults = ?, volume_hints = ?, tags = ?, updated_at = ?
		WHERE id = ?
	`,
		t.Name, t.Description, t.Author, t.Version, t.ComposeContent,
		t.EnvDefaults, t.VolumeHints, t.Tags, t.UpdatedAt, t.ID,
	)
	return err
}

// Delete removes a template
func (r *TemplateRepo) Delete(id string) error {
	_, err := r.db.Exec("DELETE FROM templates WHERE id = ?", id)
	return err
}

// IncrementUsage increments the usage count
func (r *TemplateRepo) IncrementUsage(id string) error {
	_, err := r.db.Exec(`
		UPDATE templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?
	`, time.Now(), id)
	return err
}

// ContainerMetricsRepo handles container metrics database operations
type ContainerMetricsRepo struct {
	db *sql.DB
}

// NewContainerMetricsRepo creates a new metrics repository
func NewContainerMetricsRepo() *ContainerMetricsRepo {
	return &ContainerMetricsRepo{db: DB}
}

// Save stores container metrics
func (r *ContainerMetricsRepo) Save(m *models.ContainerMetrics) error {
	m.Timestamp = time.Now()
	_, err := r.db.Exec(`
		INSERT INTO container_metrics (
			container_id, timestamp, cpu_percent, memory_used, memory_limit,
			network_rx, network_tx, block_read, block_write
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		m.ContainerID, m.Timestamp, m.CPUPercent, m.MemoryUsed, m.MemoryLimit,
		m.NetworkRx, m.NetworkTx, m.BlockRead, m.BlockWrite,
	)
	return err
}

// GetRecent retrieves recent metrics for a container
func (r *ContainerMetricsRepo) GetRecent(containerID string, hours int) ([]models.ContainerMetrics, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, timestamp, cpu_percent, memory_used, memory_limit,
			network_rx, network_tx, block_read, block_write
		FROM container_metrics
		WHERE container_id = ? AND timestamp > datetime('now', '-' || ? || ' hours')
		ORDER BY timestamp ASC
	`, containerID, hours)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []models.ContainerMetrics
	for rows.Next() {
		var m models.ContainerMetrics
		if err := rows.Scan(
			&m.ID, &m.ContainerID, &m.Timestamp, &m.CPUPercent, &m.MemoryUsed, &m.MemoryLimit,
			&m.NetworkRx, &m.NetworkTx, &m.BlockRead, &m.BlockWrite,
		); err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}

	return metrics, nil
}

// Cleanup removes old metrics (older than specified hours)
func (r *ContainerMetricsRepo) Cleanup(retentionHours int) error {
	_, err := r.db.Exec(`
		DELETE FROM container_metrics
		WHERE timestamp < datetime('now', '-' || ? || ' hours')
	`, retentionHours)
	return err
}

// ContainerEnvVarRepo handles container environment variable operations
type ContainerEnvVarRepo struct {
	db *sql.DB
}

// NewContainerEnvVarRepo creates a new env var repository
func NewContainerEnvVarRepo() *ContainerEnvVarRepo {
	return &ContainerEnvVarRepo{db: DB}
}

// Save stores or updates an environment variable
func (r *ContainerEnvVarRepo) Save(e *models.ContainerEnvVar) error {
	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	e.UpdatedAt = time.Now()
	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now()
	}

	_, err := r.db.Exec(`
		INSERT INTO container_env_vars (id, container_id, key, value, is_secret, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(container_id, key) DO UPDATE SET
			value = excluded.value,
			is_secret = excluded.is_secret,
			updated_at = excluded.updated_at
	`,
		e.ID, e.ContainerID, e.Key, e.Value, e.IsSecret, e.CreatedAt, e.UpdatedAt,
	)
	return err
}

// GetByContainerID retrieves all env vars for a container
func (r *ContainerEnvVarRepo) GetByContainerID(containerID string) ([]models.ContainerEnvVar, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, key, value, is_secret, created_at, updated_at
		FROM container_env_vars WHERE container_id = ? ORDER BY key
	`, containerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var envVars []models.ContainerEnvVar
	for rows.Next() {
		var e models.ContainerEnvVar
		var isSecret int
		if err := rows.Scan(
			&e.ID, &e.ContainerID, &e.Key, &e.Value, &isSecret, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		e.IsSecret = isSecret == 1
		envVars = append(envVars, e)
	}

	return envVars, nil
}

// Delete removes an environment variable
func (r *ContainerEnvVarRepo) Delete(id string) error {
	_, err := r.db.Exec("DELETE FROM container_env_vars WHERE id = ?", id)
	return err
}

// DeleteByContainerID removes all env vars for a container
func (r *ContainerEnvVarRepo) DeleteByContainerID(containerID string) error {
	_, err := r.db.Exec("DELETE FROM container_env_vars WHERE container_id = ?", containerID)
	return err
}

// Helper function to convert map to JSON string
func mapToJSON(m map[string]string) string {
	if m == nil {
		return "{}"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// Helper function to convert slice to JSON string
func sliceToJSON(s []string) string {
	if s == nil {
		return "[]"
	}
	b, _ := json.Marshal(s)
	return string(b)
}
