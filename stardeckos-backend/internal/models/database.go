package models

import (
	"strconv"
	"time"
)

// DatabaseType represents the type of database engine
type DatabaseType string

const (
	DatabaseTypePostgreSQL DatabaseType = "postgresql"
	DatabaseTypeMariaDB    DatabaseType = "mariadb"
	DatabaseTypeMySQL      DatabaseType = "mysql"
	DatabaseTypeRedis      DatabaseType = "redis"
	DatabaseTypeMongoDB    DatabaseType = "mongodb"
)

// DatabaseStatus represents the state of a database container
type DatabaseStatus string

const (
	DatabaseStatusRunning  DatabaseStatus = "running"
	DatabaseStatusStopped  DatabaseStatus = "stopped"
	DatabaseStatusStarting DatabaseStatus = "starting"
	DatabaseStatusStopping DatabaseStatus = "stopping"
	DatabaseStatusError    DatabaseStatus = "error"
	DatabaseStatusUnknown  DatabaseStatus = "unknown"
)

// ManagedDatabase represents a database instance managed by Stardeck
type ManagedDatabase struct {
	ID            string         `json:"id"`
	ContainerID   string         `json:"container_id"`   // Podman container ID
	Name          string         `json:"name"`           // Friendly name (e.g., "main-postgres")
	Type          DatabaseType   `json:"type"`           // postgresql, mariadb, mysql, redis, mongodb
	Version       string         `json:"version"`        // e.g., "16", "10.11", "8.0"
	Image         string         `json:"image"`          // Full image name (e.g., "postgres:16")
	InternalHost  string         `json:"internal_host"`  // Container name for internal network access
	InternalPort  int            `json:"internal_port"`  // Standard port (5432, 3306, etc.)
	ExternalPort  int            `json:"external_port"`  // Exposed host port (0 if not exposed)
	AdminUser     string         `json:"admin_user"`     // Root/admin username
	AdminPassword string         `json:"admin_password"` // Encrypted password
	Network       string         `json:"network"`        // Podman network name
	VolumeName    string         `json:"volume_name"`    // Podman volume for data persistence
	Status        DatabaseStatus `json:"status"`         // running, stopped, error
	IsShared      bool           `json:"is_shared"`      // Available for other apps to use
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	CreatedBy     *int64         `json:"created_by,omitempty"`
}

// ManagedDatabaseListItem is a lightweight view for listing databases
type ManagedDatabaseListItem struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Type            DatabaseType   `json:"type"`
	Version         string         `json:"version"`
	Status          DatabaseStatus `json:"status"`
	InternalHost    string         `json:"internal_host"`
	InternalPort    int            `json:"internal_port"`
	ExternalPort    int            `json:"external_port"`
	IsShared        bool           `json:"is_shared"`
	ConnectionCount int            `json:"connection_count"`
	CreatedAt       time.Time      `json:"created_at"`
}

// DatabaseConnection represents an app's connection to a database
type DatabaseConnection struct {
	ID           string    `json:"id"`
	DatabaseID   string    `json:"database_id"`   // References ManagedDatabase
	ContainerID  string    `json:"container_id"`  // App container using this DB
	AppName      string    `json:"app_name"`      // Name of the connected app
	DatabaseName string    `json:"database_name"` // Database name within the instance
	Username     string    `json:"username"`      // App-specific user
	Password     string    `json:"password"`      // Encrypted password
	CreatedAt    time.Time `json:"created_at"`
}

// CreateDatabaseRequest represents a request to create a new database
type CreateDatabaseRequest struct {
	Type          DatabaseType `json:"type" validate:"required"`
	Name          string       `json:"name" validate:"required,min=1,max=64"`
	Version       string       `json:"version,omitempty"`       // e.g., "16" for postgres:16
	ExposePort    bool         `json:"expose_port"`             // Whether to expose to host
	ExternalPort  int          `json:"external_port,omitempty"` // Specific port (0 = auto-assign)
	IsShared      bool         `json:"is_shared"`               // Allow other apps to use
	AdminUser     string       `json:"admin_user,omitempty"`    // Custom admin user (defaults vary by DB type)
	AdminPassword string       `json:"admin_password"`          // Required for most DBs
}

// CreateDatabaseConnectionRequest represents a request to connect an app to a database
type CreateDatabaseConnectionRequest struct {
	DatabaseID   string `json:"database_id" validate:"required"`
	ContainerID  string `json:"container_id" validate:"required"`
	DatabaseName string `json:"database_name" validate:"required"` // Name of DB to create within instance
	Username     string `json:"username,omitempty"`                // App-specific user (auto-generated if empty)
	Password     string `json:"password,omitempty"`                // App-specific password (auto-generated if empty)
}

// DatabaseInfo provides detailed information about a database for display
type DatabaseInfo struct {
	ManagedDatabase
	ConnectionString string               `json:"connection_string"` // For external tools
	Connections      []DatabaseConnection `json:"connections"`       // Connected apps
	ContainerStatus  ContainerStatus      `json:"container_status"`  // Podman container status
}

// DetectedDatabase represents an unmanaged database container found during scanning
type DetectedDatabase struct {
	ContainerID   string       `json:"container_id"`
	ContainerName string       `json:"container_name"`
	Type          DatabaseType `json:"type"`
	Image         string       `json:"image"`
	Status        string       `json:"status"`
	Ports         []PortMapping `json:"ports"`
}

// AdoptDatabaseRequest represents a request to adopt an existing database container
type AdoptDatabaseRequest struct {
	ContainerID   string `json:"container_id" validate:"required"`
	Name          string `json:"name" validate:"required"`
	AdminUser     string `json:"admin_user,omitempty"`
	AdminPassword string `json:"admin_password,omitempty"`
	IsShared      bool   `json:"is_shared"`
}

// DatabaseDefaults contains default configuration for each database type
type DatabaseDefaults struct {
	Image       string `json:"image"`
	Port        int    `json:"port"`
	AdminUser   string `json:"admin_user"`
	DataPath    string `json:"data_path"` // Path inside container for data
	EnvUser     string `json:"env_user"`  // Environment variable for user
	EnvPassword string `json:"env_password"`
	EnvDatabase string `json:"env_database"`
}

// GetDatabaseDefaults returns default configuration for a database type
func GetDatabaseDefaults(dbType DatabaseType, version string) DatabaseDefaults {
	defaults := map[DatabaseType]DatabaseDefaults{
		DatabaseTypePostgreSQL: {
			Image:       "postgres",
			Port:        5432,
			AdminUser:   "postgres",
			DataPath:    "/var/lib/postgresql/data",
			EnvUser:     "POSTGRES_USER",
			EnvPassword: "POSTGRES_PASSWORD",
			EnvDatabase: "POSTGRES_DB",
		},
		DatabaseTypeMariaDB: {
			Image:       "mariadb",
			Port:        3306,
			AdminUser:   "root",
			DataPath:    "/var/lib/mysql",
			EnvUser:     "MARIADB_USER",
			EnvPassword: "MARIADB_ROOT_PASSWORD",
			EnvDatabase: "MARIADB_DATABASE",
		},
		DatabaseTypeMySQL: {
			Image:       "mysql",
			Port:        3306,
			AdminUser:   "root",
			DataPath:    "/var/lib/mysql",
			EnvUser:     "MYSQL_USER",
			EnvPassword: "MYSQL_ROOT_PASSWORD",
			EnvDatabase: "MYSQL_DATABASE",
		},
		DatabaseTypeRedis: {
			Image:       "redis",
			Port:        6379,
			AdminUser:   "",
			DataPath:    "/data",
			EnvUser:     "",
			EnvPassword: "", // Redis uses requirepass in config or REDIS_PASSWORD
			EnvDatabase: "",
		},
		DatabaseTypeMongoDB: {
			Image:       "mongo",
			Port:        27017,
			AdminUser:   "root",
			DataPath:    "/data/db",
			EnvUser:     "MONGO_INITDB_ROOT_USERNAME",
			EnvPassword: "MONGO_INITDB_ROOT_PASSWORD",
			EnvDatabase: "MONGO_INITDB_DATABASE",
		},
	}

	d := defaults[dbType]
	if version != "" {
		d.Image = d.Image + ":" + version
	} else {
		// Default versions
		switch dbType {
		case DatabaseTypePostgreSQL:
			d.Image = d.Image + ":16"
		case DatabaseTypeMariaDB:
			d.Image = d.Image + ":10.11"
		case DatabaseTypeMySQL:
			d.Image = d.Image + ":8.0"
		case DatabaseTypeRedis:
			d.Image = d.Image + ":7"
		case DatabaseTypeMongoDB:
			d.Image = d.Image + ":7"
		}
	}

	return d
}

// GetConnectionString generates a connection string for the database
func (db *ManagedDatabase) GetConnectionString(dbName string, internal bool) string {
	host := db.InternalHost
	port := db.InternalPort
	if !internal && db.ExternalPort > 0 {
		host = "localhost"
		port = db.ExternalPort
	}

	switch db.Type {
	case DatabaseTypePostgreSQL:
		return "postgresql://" + db.AdminUser + ":" + db.AdminPassword + "@" + host + ":" + itoa(port) + "/" + dbName
	case DatabaseTypeMariaDB, DatabaseTypeMySQL:
		return "mysql://" + db.AdminUser + ":" + db.AdminPassword + "@" + host + ":" + itoa(port) + "/" + dbName
	case DatabaseTypeRedis:
		if db.AdminPassword != "" {
			return "redis://:" + db.AdminPassword + "@" + host + ":" + itoa(port)
		}
		return "redis://" + host + ":" + itoa(port)
	case DatabaseTypeMongoDB:
		return "mongodb://" + db.AdminUser + ":" + db.AdminPassword + "@" + host + ":" + itoa(port)
	default:
		return ""
	}
}

func itoa(i int) string {
	return strconv.Itoa(i)
}

// Audit action constants for databases
const (
	ActionDatabaseCreate     = "database.create"
	ActionDatabaseDelete     = "database.delete"
	ActionDatabaseStart      = "database.start"
	ActionDatabaseStop       = "database.stop"
	ActionDatabaseAdopt      = "database.adopt"
	ActionDatabaseConnect    = "database.connect"
	ActionDatabaseDisconnect = "database.disconnect"
)
