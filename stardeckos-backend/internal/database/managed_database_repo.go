package database

import (
	"database/sql"
	"time"

	"github.com/google/uuid"

	"stardeckos-backend/internal/models"
)

// ManagedDatabaseRepo handles managed database operations
type ManagedDatabaseRepo struct {
	db *sql.DB
}

// NewManagedDatabaseRepo creates a new managed database repository
func NewManagedDatabaseRepo() *ManagedDatabaseRepo {
	return &ManagedDatabaseRepo{db: DB}
}

// Create adds a new managed database to the database
func (r *ManagedDatabaseRepo) Create(db *models.ManagedDatabase) error {
	if db.ID == "" {
		db.ID = uuid.New().String()
	}
	db.CreatedAt = time.Now()
	db.UpdatedAt = time.Now()

	_, err := r.db.Exec(`
		INSERT INTO managed_databases (
			id, container_id, name, type, version, image, internal_host, internal_port,
			external_port, admin_user, admin_password, network, volume_name, status,
			is_shared, created_at, updated_at, created_by
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		db.ID, db.ContainerID, db.Name, db.Type, db.Version, db.Image,
		db.InternalHost, db.InternalPort, db.ExternalPort,
		db.AdminUser, db.AdminPassword, db.Network, db.VolumeName,
		db.Status, db.IsShared, db.CreatedAt, db.UpdatedAt, db.CreatedBy,
	)
	return err
}

// GetByID retrieves a managed database by its Stardeck ID
func (r *ManagedDatabaseRepo) GetByID(id string) (*models.ManagedDatabase, error) {
	db := &models.ManagedDatabase{}
	var isShared int
	err := r.db.QueryRow(`
		SELECT id, container_id, name, type, version, image, internal_host, internal_port,
			external_port, admin_user, admin_password, network, volume_name, status,
			is_shared, created_at, updated_at, created_by
		FROM managed_databases WHERE id = ?
	`, id).Scan(
		&db.ID, &db.ContainerID, &db.Name, &db.Type, &db.Version, &db.Image,
		&db.InternalHost, &db.InternalPort, &db.ExternalPort,
		&db.AdminUser, &db.AdminPassword, &db.Network, &db.VolumeName,
		&db.Status, &isShared, &db.CreatedAt, &db.UpdatedAt, &db.CreatedBy,
	)
	if err != nil {
		return nil, err
	}
	db.IsShared = isShared == 1
	return db, nil
}

// GetByContainerID retrieves a managed database by its Podman container ID
func (r *ManagedDatabaseRepo) GetByContainerID(containerID string) (*models.ManagedDatabase, error) {
	db := &models.ManagedDatabase{}
	var isShared int
	err := r.db.QueryRow(`
		SELECT id, container_id, name, type, version, image, internal_host, internal_port,
			external_port, admin_user, admin_password, network, volume_name, status,
			is_shared, created_at, updated_at, created_by
		FROM managed_databases WHERE container_id = ?
	`, containerID).Scan(
		&db.ID, &db.ContainerID, &db.Name, &db.Type, &db.Version, &db.Image,
		&db.InternalHost, &db.InternalPort, &db.ExternalPort,
		&db.AdminUser, &db.AdminPassword, &db.Network, &db.VolumeName,
		&db.Status, &isShared, &db.CreatedAt, &db.UpdatedAt, &db.CreatedBy,
	)
	if err != nil {
		return nil, err
	}
	db.IsShared = isShared == 1
	return db, nil
}

// GetByName retrieves a managed database by its name
func (r *ManagedDatabaseRepo) GetByName(name string) (*models.ManagedDatabase, error) {
	db := &models.ManagedDatabase{}
	var isShared int
	err := r.db.QueryRow(`
		SELECT id, container_id, name, type, version, image, internal_host, internal_port,
			external_port, admin_user, admin_password, network, volume_name, status,
			is_shared, created_at, updated_at, created_by
		FROM managed_databases WHERE name = ?
	`, name).Scan(
		&db.ID, &db.ContainerID, &db.Name, &db.Type, &db.Version, &db.Image,
		&db.InternalHost, &db.InternalPort, &db.ExternalPort,
		&db.AdminUser, &db.AdminPassword, &db.Network, &db.VolumeName,
		&db.Status, &isShared, &db.CreatedAt, &db.UpdatedAt, &db.CreatedBy,
	)
	if err != nil {
		return nil, err
	}
	db.IsShared = isShared == 1
	return db, nil
}

// List retrieves all managed databases
func (r *ManagedDatabaseRepo) List() ([]*models.ManagedDatabase, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, name, type, version, image, internal_host, internal_port,
			external_port, admin_user, admin_password, network, volume_name, status,
			is_shared, created_at, updated_at, created_by
		FROM managed_databases ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var databases []*models.ManagedDatabase
	for rows.Next() {
		db := &models.ManagedDatabase{}
		var isShared int
		err := rows.Scan(
			&db.ID, &db.ContainerID, &db.Name, &db.Type, &db.Version, &db.Image,
			&db.InternalHost, &db.InternalPort, &db.ExternalPort,
			&db.AdminUser, &db.AdminPassword, &db.Network, &db.VolumeName,
			&db.Status, &isShared, &db.CreatedAt, &db.UpdatedAt, &db.CreatedBy,
		)
		if err != nil {
			return nil, err
		}
		db.IsShared = isShared == 1
		databases = append(databases, db)
	}
	return databases, nil
}

// ListByType retrieves all managed databases of a specific type
func (r *ManagedDatabaseRepo) ListByType(dbType models.DatabaseType) ([]*models.ManagedDatabase, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, name, type, version, image, internal_host, internal_port,
			external_port, admin_user, admin_password, network, volume_name, status,
			is_shared, created_at, updated_at, created_by
		FROM managed_databases WHERE type = ? ORDER BY created_at DESC
	`, dbType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var databases []*models.ManagedDatabase
	for rows.Next() {
		db := &models.ManagedDatabase{}
		var isShared int
		err := rows.Scan(
			&db.ID, &db.ContainerID, &db.Name, &db.Type, &db.Version, &db.Image,
			&db.InternalHost, &db.InternalPort, &db.ExternalPort,
			&db.AdminUser, &db.AdminPassword, &db.Network, &db.VolumeName,
			&db.Status, &isShared, &db.CreatedAt, &db.UpdatedAt, &db.CreatedBy,
		)
		if err != nil {
			return nil, err
		}
		db.IsShared = isShared == 1
		databases = append(databases, db)
	}
	return databases, nil
}

// ListShared retrieves all shared managed databases
func (r *ManagedDatabaseRepo) ListShared() ([]*models.ManagedDatabase, error) {
	rows, err := r.db.Query(`
		SELECT id, container_id, name, type, version, image, internal_host, internal_port,
			external_port, admin_user, admin_password, network, volume_name, status,
			is_shared, created_at, updated_at, created_by
		FROM managed_databases WHERE is_shared = 1 ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var databases []*models.ManagedDatabase
	for rows.Next() {
		db := &models.ManagedDatabase{}
		var isShared int
		err := rows.Scan(
			&db.ID, &db.ContainerID, &db.Name, &db.Type, &db.Version, &db.Image,
			&db.InternalHost, &db.InternalPort, &db.ExternalPort,
			&db.AdminUser, &db.AdminPassword, &db.Network, &db.VolumeName,
			&db.Status, &isShared, &db.CreatedAt, &db.UpdatedAt, &db.CreatedBy,
		)
		if err != nil {
			return nil, err
		}
		db.IsShared = isShared == 1
		databases = append(databases, db)
	}
	return databases, nil
}

// ListWithConnectionCount retrieves all databases with their connection counts
func (r *ManagedDatabaseRepo) ListWithConnectionCount() ([]*models.ManagedDatabaseListItem, error) {
	rows, err := r.db.Query(`
		SELECT
			md.id, md.name, md.type, md.version, md.status,
			md.internal_host, md.internal_port, md.external_port,
			md.is_shared, md.created_at,
			COUNT(dc.id) as connection_count
		FROM managed_databases md
		LEFT JOIN database_connections dc ON md.id = dc.database_id
		GROUP BY md.id
		ORDER BY md.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var databases []*models.ManagedDatabaseListItem
	for rows.Next() {
		db := &models.ManagedDatabaseListItem{}
		var isShared int
		err := rows.Scan(
			&db.ID, &db.Name, &db.Type, &db.Version, &db.Status,
			&db.InternalHost, &db.InternalPort, &db.ExternalPort,
			&isShared, &db.CreatedAt, &db.ConnectionCount,
		)
		if err != nil {
			return nil, err
		}
		db.IsShared = isShared == 1
		databases = append(databases, db)
	}
	return databases, nil
}

// Update updates a managed database
func (r *ManagedDatabaseRepo) Update(db *models.ManagedDatabase) error {
	db.UpdatedAt = time.Now()
	_, err := r.db.Exec(`
		UPDATE managed_databases SET
			name = ?, type = ?, version = ?, image = ?, internal_host = ?, internal_port = ?,
			external_port = ?, admin_user = ?, admin_password = ?, network = ?, volume_name = ?,
			status = ?, is_shared = ?, updated_at = ?
		WHERE id = ?
	`,
		db.Name, db.Type, db.Version, db.Image, db.InternalHost, db.InternalPort,
		db.ExternalPort, db.AdminUser, db.AdminPassword, db.Network, db.VolumeName,
		db.Status, db.IsShared, db.UpdatedAt, db.ID,
	)
	return err
}

// UpdateStatus updates only the status of a managed database
func (r *ManagedDatabaseRepo) UpdateStatus(id string, status models.DatabaseStatus) error {
	_, err := r.db.Exec(`
		UPDATE managed_databases SET status = ?, updated_at = ? WHERE id = ?
	`, status, time.Now(), id)
	return err
}

// UpdateContainerID updates the container ID (after recreating the container)
func (r *ManagedDatabaseRepo) UpdateContainerID(id string, containerID string) error {
	_, err := r.db.Exec(`
		UPDATE managed_databases SET container_id = ?, updated_at = ? WHERE id = ?
	`, containerID, time.Now(), id)
	return err
}

// Delete removes a managed database
func (r *ManagedDatabaseRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM managed_databases WHERE id = ?`, id)
	return err
}

// GetUsedExternalPorts returns all external ports currently in use by managed databases
func (r *ManagedDatabaseRepo) GetUsedExternalPorts() ([]int, error) {
	rows, err := r.db.Query(`
		SELECT external_port FROM managed_databases WHERE external_port > 0
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ports []int
	for rows.Next() {
		var port int
		if err := rows.Scan(&port); err != nil {
			return nil, err
		}
		ports = append(ports, port)
	}
	return ports, nil
}

// --- Database Connection methods ---

// CreateConnection creates a new database connection
func (r *ManagedDatabaseRepo) CreateConnection(conn *models.DatabaseConnection) error {
	if conn.ID == "" {
		conn.ID = uuid.New().String()
	}
	conn.CreatedAt = time.Now()

	_, err := r.db.Exec(`
		INSERT INTO database_connections (
			id, database_id, container_id, app_name, database_name, username, password, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		conn.ID, conn.DatabaseID, conn.ContainerID, conn.AppName,
		conn.DatabaseName, conn.Username, conn.Password, conn.CreatedAt,
	)
	return err
}

// GetConnectionByID retrieves a database connection by ID
func (r *ManagedDatabaseRepo) GetConnectionByID(id string) (*models.DatabaseConnection, error) {
	conn := &models.DatabaseConnection{}
	err := r.db.QueryRow(`
		SELECT id, database_id, container_id, app_name, database_name, username, password, created_at
		FROM database_connections WHERE id = ?
	`, id).Scan(
		&conn.ID, &conn.DatabaseID, &conn.ContainerID, &conn.AppName,
		&conn.DatabaseName, &conn.Username, &conn.Password, &conn.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return conn, nil
}

// GetConnectionsByDatabase retrieves all connections for a database
func (r *ManagedDatabaseRepo) GetConnectionsByDatabase(databaseID string) ([]*models.DatabaseConnection, error) {
	rows, err := r.db.Query(`
		SELECT id, database_id, container_id, app_name, database_name, username, password, created_at
		FROM database_connections WHERE database_id = ? ORDER BY created_at DESC
	`, databaseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var connections []*models.DatabaseConnection
	for rows.Next() {
		conn := &models.DatabaseConnection{}
		err := rows.Scan(
			&conn.ID, &conn.DatabaseID, &conn.ContainerID, &conn.AppName,
			&conn.DatabaseName, &conn.Username, &conn.Password, &conn.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		connections = append(connections, conn)
	}
	return connections, nil
}

// GetConnectionsByContainer retrieves all database connections for a container
func (r *ManagedDatabaseRepo) GetConnectionsByContainer(containerID string) ([]*models.DatabaseConnection, error) {
	rows, err := r.db.Query(`
		SELECT id, database_id, container_id, app_name, database_name, username, password, created_at
		FROM database_connections WHERE container_id = ? ORDER BY created_at DESC
	`, containerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var connections []*models.DatabaseConnection
	for rows.Next() {
		conn := &models.DatabaseConnection{}
		err := rows.Scan(
			&conn.ID, &conn.DatabaseID, &conn.ContainerID, &conn.AppName,
			&conn.DatabaseName, &conn.Username, &conn.Password, &conn.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		connections = append(connections, conn)
	}
	return connections, nil
}

// CountConnectionsByDatabase returns the number of connections for a database
func (r *ManagedDatabaseRepo) CountConnectionsByDatabase(databaseID string) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM database_connections WHERE database_id = ?
	`, databaseID).Scan(&count)
	return count, err
}

// DeleteConnection removes a database connection
func (r *ManagedDatabaseRepo) DeleteConnection(id string) error {
	_, err := r.db.Exec(`DELETE FROM database_connections WHERE id = ?`, id)
	return err
}

// DeleteConnectionsByContainer removes all connections for a container
func (r *ManagedDatabaseRepo) DeleteConnectionsByContainer(containerID string) error {
	_, err := r.db.Exec(`DELETE FROM database_connections WHERE container_id = ?`, containerID)
	return err
}

// DeleteConnectionsByDatabase removes all connections for a database
func (r *ManagedDatabaseRepo) DeleteConnectionsByDatabase(databaseID string) error {
	_, err := r.db.Exec(`DELETE FROM database_connections WHERE database_id = ?`, databaseID)
	return err
}
