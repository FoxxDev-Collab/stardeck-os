package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// DB is the global database connection
var DB *sql.DB

// Config holds database configuration
type Config struct {
	Path string
}

// Open initializes the database connection and runs migrations
func Open(cfg Config) error {
	// Ensure directory exists
	dir := filepath.Dir(cfg.Path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return fmt.Errorf("failed to create database directory: %w", err)
	}

	// SQLite connection with optimizations for concurrency:
	// - journal_mode=WAL: Write-Ahead Logging for concurrent reads/writes
	// - busy_timeout=5000: Wait up to 5 seconds if database is locked (fixes SQLITE_BUSY)
	// - synchronous=NORMAL: Safe with WAL mode, better performance
	// - cache_size=-64000: 64MB cache for better read performance
	// - foreign_keys=1: Enable foreign key constraints
	dsn := cfg.Path + "?" +
		"_pragma=foreign_keys(1)&" +
		"_pragma=journal_mode(WAL)&" +
		"_pragma=busy_timeout(5000)&" +
		"_pragma=synchronous(NORMAL)&" +
		"_pragma=cache_size(-64000)"

	var err error
	DB, err = sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool for SQLite
	// SQLite works best with limited connections due to file-level locking
	DB.SetMaxOpenConns(1)        // Single writer for SQLite
	DB.SetMaxIdleConns(1)        // Keep one connection ready
	DB.SetConnMaxLifetime(0)     // Don't close connections due to age

	// Test connection
	if err := DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// Run migrations
	if err := migrate(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}

// Close closes the database connection
func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}

// migrate runs all database migrations
func migrate() error {
	// Create migrations table
	_, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS migrations (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return err
	}

	// Run each migration
	for _, m := range migrations {
		if err := runMigration(m); err != nil {
			return fmt.Errorf("migration %s failed: %w", m.name, err)
		}
	}

	return nil
}

type migration struct {
	name string
	up   string
}

func runMigration(m migration) error {
	// Check if already applied
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM migrations WHERE name = ?", m.name).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil // Already applied
	}

	// Run migration
	if _, err := DB.Exec(m.up); err != nil {
		return err
	}

	// Record migration
	_, err = DB.Exec("INSERT INTO migrations (name) VALUES (?)", m.name)
	return err
}

var migrations = []migration{
	{
		name: "001_create_users",
		up: `
			CREATE TABLE users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT NOT NULL UNIQUE,
				display_name TEXT NOT NULL,
				email TEXT,
				password_hash TEXT,
				role TEXT NOT NULL DEFAULT 'viewer',
				auth_type TEXT NOT NULL DEFAULT 'local',
				realm_id INTEGER,
				system_uid TEXT,
				disabled INTEGER NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				last_login DATETIME,
				FOREIGN KEY (realm_id) REFERENCES realms(id) ON DELETE SET NULL
			);
			CREATE INDEX idx_users_username ON users(username);
			CREATE INDEX idx_users_realm_id ON users(realm_id);
		`,
	},
	{
		name: "002_create_sessions",
		up: `
			CREATE TABLE sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				token_hash TEXT NOT NULL UNIQUE,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				expires_at DATETIME NOT NULL,
				ip_address TEXT,
				user_agent TEXT,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);
			CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
			CREATE INDEX idx_sessions_user_id ON sessions(user_id);
			CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
		`,
	},
	{
		name: "003_create_audit_logs",
		up: `
			CREATE TABLE audit_logs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
				user_id INTEGER,
				username TEXT,
				action TEXT NOT NULL,
				target TEXT,
				details TEXT,
				ip_address TEXT,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
			);
			CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
			CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
			CREATE INDEX idx_audit_logs_action ON audit_logs(action);
		`,
	},
	{
		name: "004_create_settings",
		up: `
			CREATE TABLE settings (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
			-- Default settings
			INSERT INTO settings (key, value) VALUES
				('auth.local_enabled', 'true'),
				('auth.pam_enabled', 'true'),
				('session.timeout_minutes', '60'),
				('session.max_per_user', '5');
		`,
	},
	{
		name: "005_create_realms",
		up: `
			CREATE TABLE realms (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL UNIQUE,
				display_name TEXT NOT NULL,
				type TEXT NOT NULL,
				enabled INTEGER NOT NULL DEFAULT 1,
				config TEXT NOT NULL DEFAULT '{}',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
			CREATE INDEX idx_realms_name ON realms(name);
			CREATE INDEX idx_realms_type ON realms(type);
		`,
	},
	{
		name: "006_create_groups",
		up: `
			CREATE TABLE groups (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL UNIQUE,
				display_name TEXT NOT NULL,
				description TEXT,
				realm_id INTEGER,
				system_gid TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (realm_id) REFERENCES realms(id) ON DELETE CASCADE
			);
			CREATE INDEX idx_groups_name ON groups(name);
			CREATE INDEX idx_groups_realm_id ON groups(realm_id);
		`,
	},
	{
		name: "007_create_user_groups",
		up: `
			CREATE TABLE user_groups (
				user_id INTEGER NOT NULL,
				group_id INTEGER NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (user_id, group_id),
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
			);
			CREATE INDEX idx_user_groups_user_id ON user_groups(user_id);
			CREATE INDEX idx_user_groups_group_id ON user_groups(group_id);
		`,
	},
	{
		name: "008_create_permissions",
		up: `
			CREATE TABLE permissions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				code TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				description TEXT,
				category TEXT NOT NULL
			);
			CREATE INDEX idx_permissions_code ON permissions(code);
			CREATE INDEX idx_permissions_category ON permissions(category);
			
			-- Insert default permissions
			INSERT INTO permissions (code, name, description, category) VALUES
				('users.view', 'View Users', 'View user list and details', 'users'),
				('users.create', 'Create Users', 'Create new users', 'users'),
				('users.edit', 'Edit Users', 'Modify user properties', 'users'),
				('users.delete', 'Delete Users', 'Remove users', 'users'),
				('groups.view', 'View Groups', 'View group list and details', 'groups'),
				('groups.create', 'Create Groups', 'Create new groups', 'groups'),
				('groups.edit', 'Edit Groups', 'Modify group properties', 'groups'),
				('groups.delete', 'Delete Groups', 'Remove groups', 'groups'),
				('realms.view', 'View Realms', 'View realm list and details', 'realms'),
				('realms.create', 'Create Realms', 'Create new authentication realms', 'realms'),
				('realms.edit', 'Edit Realms', 'Modify realm properties', 'realms'),
				('realms.delete', 'Delete Realms', 'Remove realms', 'realms'),
				('services.view', 'View Services', 'View service list and status', 'services'),
				('services.control', 'Control Services', 'Start, stop, restart services', 'services'),
				('processes.view', 'View Processes', 'View running processes', 'processes'),
				('processes.kill', 'Kill Processes', 'Terminate processes', 'processes'),
				('system.view', 'View System Info', 'View system information and resources', 'system'),
				('system.reboot', 'Reboot System', 'Reboot the system', 'system'),
				('updates.view', 'View Updates', 'View available updates', 'updates'),
				('updates.apply', 'Apply Updates', 'Install system updates', 'updates');
		`,
	},
	{
		name: "009_create_group_permissions",
		up: `
			CREATE TABLE group_permissions (
				group_id INTEGER NOT NULL,
				permission_id INTEGER NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (group_id, permission_id),
				FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
				FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
			);
			CREATE INDEX idx_group_permissions_group_id ON group_permissions(group_id);
			CREATE INDEX idx_group_permissions_permission_id ON group_permissions(permission_id);
		`,
	},
	{
		name: "010_add_user_type",
		up: `
			-- Add user_type column to users table
			ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'system';

			-- Create index on user_type for efficient filtering
			CREATE INDEX idx_users_user_type ON users(user_type);

			-- Update existing users: PAM users with admin role become system users
			-- Local users with admin role also become system users
			-- Everyone else defaults to 'system' for backward compatibility
			-- In production, you may want to manually set web users
		`,
	},
	{
		name: "011_create_containers",
		up: `
			CREATE TABLE containers (
				id TEXT PRIMARY KEY,
				container_id TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				image TEXT NOT NULL,
				status TEXT DEFAULT 'created',
				compose_file TEXT,
				compose_path TEXT,
				has_web_ui INTEGER DEFAULT 0,
				web_ui_port INTEGER,
				web_ui_path TEXT DEFAULT '/',
				icon TEXT,
				auto_start INTEGER DEFAULT 1,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
				labels TEXT,
				metadata TEXT
			);
			CREATE INDEX idx_containers_container_id ON containers(container_id);
			CREATE INDEX idx_containers_name ON containers(name);
			CREATE INDEX idx_containers_status ON containers(status);
		`,
	},
	{
		name: "012_create_podman_volumes",
		up: `
			CREATE TABLE podman_volumes (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				driver TEXT DEFAULT 'local',
				mount_point TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				labels TEXT
			);
			CREATE INDEX idx_podman_volumes_name ON podman_volumes(name);
		`,
	},
	{
		name: "013_create_volume_containers",
		up: `
			CREATE TABLE volume_containers (
				volume_id TEXT NOT NULL,
				container_id TEXT NOT NULL,
				PRIMARY KEY (volume_id, container_id),
				FOREIGN KEY (volume_id) REFERENCES podman_volumes(id) ON DELETE CASCADE,
				FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
			);
		`,
	},
	{
		name: "014_create_podman_networks",
		up: `
			CREATE TABLE podman_networks (
				id TEXT PRIMARY KEY,
				network_id TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				driver TEXT DEFAULT 'bridge',
				subnet TEXT,
				gateway TEXT,
				internal INTEGER DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				labels TEXT
			);
			CREATE INDEX idx_podman_networks_name ON podman_networks(name);
		`,
	},
	{
		name: "015_create_templates",
		up: `
			CREATE TABLE templates (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				author TEXT,
				version TEXT,
				compose_content TEXT NOT NULL,
				env_defaults TEXT,
				volume_hints TEXT,
				tags TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				usage_count INTEGER DEFAULT 0
			);
			CREATE INDEX idx_templates_name ON templates(name);
		`,
	},
	{
		name: "016_create_container_metrics",
		up: `
			CREATE TABLE container_metrics (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				container_id TEXT NOT NULL,
				timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
				cpu_percent REAL,
				memory_used INTEGER,
				memory_limit INTEGER,
				network_rx INTEGER,
				network_tx INTEGER,
				block_read INTEGER,
				block_write INTEGER,
				FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
			);
			CREATE INDEX idx_container_metrics_container_time ON container_metrics(container_id, timestamp);
		`,
	},
	{
		name: "017_create_container_env_vars",
		up: `
			CREATE TABLE container_env_vars (
				id TEXT PRIMARY KEY,
				container_id TEXT NOT NULL,
				key TEXT NOT NULL,
				value TEXT NOT NULL,
				is_secret INTEGER DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE CASCADE
			);
			CREATE UNIQUE INDEX idx_container_env_container_key ON container_env_vars(container_id, key);
		`,
	},
	{
		name: "018_add_container_themed_icons",
		up: `
			ALTER TABLE containers ADD COLUMN icon_light TEXT;
			ALTER TABLE containers ADD COLUMN icon_dark TEXT;
		`,
	},
	{
		name: "019_create_user_preferences",
		up: `
			CREATE TABLE user_preferences (
				user_id INTEGER PRIMARY KEY,
				preferences TEXT NOT NULL DEFAULT '{}',
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);
		`,
	},
	{
		name: "020_create_stacks",
		up: `
			CREATE TABLE IF NOT EXISTS stacks (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				compose_content TEXT NOT NULL,
				env_content TEXT,
				path TEXT,
				status TEXT DEFAULT 'stopped',
				container_count INTEGER DEFAULT 0,
				running_count INTEGER DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
			);
			CREATE INDEX IF NOT EXISTS idx_stacks_name ON stacks(name);
			CREATE INDEX IF NOT EXISTS idx_stacks_status ON stacks(status);
		`,
	},
	// Phase 3: Starfleet Alliance tables
	{
		name: "021_create_alliance_providers",
		up: `
			CREATE TABLE alliance_providers (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				type TEXT NOT NULL,
				enabled INTEGER DEFAULT 1,
				is_managed INTEGER DEFAULT 0,
				container_id TEXT REFERENCES containers(id) ON DELETE SET NULL,
				config TEXT NOT NULL DEFAULT '{}',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
			CREATE INDEX idx_alliance_providers_type ON alliance_providers(type);
			CREATE INDEX idx_alliance_providers_enabled ON alliance_providers(enabled);
		`,
	},
	{
		name: "022_create_alliance_clients",
		up: `
			CREATE TABLE alliance_clients (
				id TEXT PRIMARY KEY,
				provider_id TEXT NOT NULL REFERENCES alliance_providers(id) ON DELETE CASCADE,
				container_id TEXT REFERENCES containers(id) ON DELETE SET NULL,
				app_name TEXT NOT NULL,
				client_id TEXT NOT NULL,
				client_secret TEXT,
				redirect_uris TEXT,
				scopes TEXT,
				sso_tier INTEGER DEFAULT 1,
				config TEXT DEFAULT '{}',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
			CREATE INDEX idx_alliance_clients_provider ON alliance_clients(provider_id);
			CREATE INDEX idx_alliance_clients_container ON alliance_clients(container_id);
		`,
	},
	{
		name: "023_create_alliance_users",
		up: `
			CREATE TABLE alliance_users (
				id TEXT PRIMARY KEY,
				provider_id TEXT NOT NULL REFERENCES alliance_providers(id) ON DELETE CASCADE,
				external_id TEXT NOT NULL,
				username TEXT NOT NULL,
				email TEXT,
				display_name TEXT,
				groups TEXT DEFAULT '[]',
				local_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
				last_sync DATETIME,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(provider_id, external_id)
			);
			CREATE INDEX idx_alliance_users_provider ON alliance_users(provider_id);
			CREATE INDEX idx_alliance_users_username ON alliance_users(username);
			CREATE INDEX idx_alliance_users_local ON alliance_users(local_user_id);
		`,
	},
	{
		name: "024_create_alliance_groups",
		up: `
			CREATE TABLE alliance_groups (
				id TEXT PRIMARY KEY,
				provider_id TEXT NOT NULL REFERENCES alliance_providers(id) ON DELETE CASCADE,
				external_id TEXT NOT NULL,
				name TEXT NOT NULL,
				description TEXT,
				local_group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
				last_sync DATETIME,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(provider_id, external_id)
			);
			CREATE INDEX idx_alliance_groups_provider ON alliance_groups(provider_id);
			CREATE INDEX idx_alliance_groups_name ON alliance_groups(name);
			CREATE INDEX idx_alliance_groups_local ON alliance_groups(local_group_id);
		`,
	},
	{
		name: "025_create_alliance_settings",
		up: `
			INSERT OR IGNORE INTO settings (key, value) VALUES
				('alliance.enabled', 'false'),
				('alliance.default_provider', ''),
				('alliance.auto_provision_users', 'true'),
				('alliance.sync_groups', 'true'),
				('alliance.header_prefix', 'X-Remote-');
		`,
	},
}
