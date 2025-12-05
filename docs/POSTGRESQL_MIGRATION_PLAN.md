# Stardeck OS - PostgreSQL Native Database Migration Plan

## Executive Summary

This document outlines the architectural migration from SQLite to native PostgreSQL 16 for Stardeck OS. The migration enforces STIG-compliant security requirements including mandatory two-disk deployment with database storage on a separate drive.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary Database | PostgreSQL 16 | Production-ready, STIG compliant, native RHEL support |
| Other Databases | Container-based | Flexibility for apps requiring MySQL/MariaDB/MongoDB/Redis |
| Isolation Model | Separate databases per app | Better isolation, easier backup/restore |
| Connection Pooling | PgBouncer | Lightweight, high-performance, production-proven |
| Management UI | pgAdmin 4 | Native container with Stardeck proxy support |
| External PG Support | Yes | Enterprise option during install |
| Disk Requirement | 2 disks minimum | STIG compliance (database on non-boot drive) |

---

## Phase 1: Install Script & Infrastructure

### 1.1 Disk Detection and Validation

The install script must:
1. Detect all available block devices
2. Identify the boot disk (mounted at `/`)
3. Require a secondary disk for PostgreSQL data
4. Fail installation if only 1 disk is present

```bash
# Disk detection logic
- lsblk to enumerate disks
- Filter out boot disk, loop devices, optical drives
- Require user confirmation or auto-select secondary disk
- Support pre-configured disk via environment variable
```

### 1.2 PostgreSQL Installation Options

**Option A: Fresh Install (Default)**
- Install PostgreSQL 16 from RHEL/Rocky AppStream
- Configure data directory on secondary disk
- Set up PgBouncer for connection pooling
- Create `stardeck` database and admin user
- Store credentials securely

**Option B: External PostgreSQL**
- Prompt for connection details
- Test connection before proceeding
- Create `stardeck` database if not exists
- Store connection string

### 1.3 Directory Structure

```
/opt/stardeck/                    # Application binaries
├── stardeckos                    # Main binary
├── pgbouncer.ini                 # PgBouncer config (if local PG)
└── scripts/                      # Utility scripts

/var/lib/stardeck/                # Application data (boot disk)
├── certs/                        # TLS certificates
├── stacks/                       # Docker compose files
├── backups/                      # Database backup staging
└── config/                       # Configuration files
    └── database.conf             # Encrypted DB credentials

/var/lib/pgsql/16/data/           # PostgreSQL data (SECONDARY DISK)
├── base/                         # Database files
├── pg_wal/                       # Write-ahead logs
└── postgresql.conf               # PostgreSQL configuration

/var/run/pgbouncer/               # PgBouncer runtime
└── pgbouncer.sock                # Unix socket
```

### 1.4 Install Script Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Installation Start                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Check Prerequisites                                      │
│     - Root privileges                                        │
│     - RHEL/Rocky Linux 8/9                                   │
│     - SELinux status                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Disk Detection & Validation                              │
│     - Enumerate block devices                                │
│     - Identify boot disk                                     │
│     - Find secondary disk(s)                                 │
│     - FAIL if only 1 disk                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Database Setup Choice                                    │
│     [1] Install PostgreSQL locally (recommended)             │
│     [2] Connect to existing PostgreSQL server                │
└─────────────────────────────────────────────────────────────┘
                    │                       │
        ┌───────────┘                       └───────────┐
        ▼                                               ▼
┌───────────────────────┐               ┌───────────────────────┐
│  Local PostgreSQL     │               │  External PostgreSQL  │
│  - Format/mount disk  │               │  - Get connection URL │
│  - Install PG 16      │               │  - Test connection    │
│  - Configure data dir │               │  - Create stardeck DB │
│  - Install PgBouncer  │               │  - Store credentials  │
│  - Create admin user  │               └───────────────────────┘
└───────────────────────┘                           │
        │                                           │
        └──────────────────┬────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Stardeck Application Install                             │
│     - Create directories                                     │
│     - Copy binary                                            │
│     - Install systemd services                               │
│     - Configure firewall                                     │
│     - Store database credentials                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. First-Run Database Migration                             │
│     - Run schema migrations                                  │
│     - Create admin user                                      │
│     - Insert default settings                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Optional: pgAdmin Setup                                  │
│     - Deploy pgAdmin container                               │
│     - Configure reverse proxy                                │
│     - Add to Stardeck apps                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Installation Complete                     │
└─────────────────────────────────────────────────────────────┘
```

### 1.5 PostgreSQL Configuration (STIG-Aligned)

```ini
# postgresql.conf optimizations
listen_addresses = 'localhost'          # Only local connections
port = 5432
max_connections = 200                   # Leave room for apps
shared_buffers = 256MB                  # Adjust based on RAM
effective_cache_size = 768MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1                  # SSD optimized
effective_io_concurrency = 200          # SSD optimized

# Security settings (STIG)
ssl = on
ssl_cert_file = '/var/lib/stardeck/certs/server.crt'
ssl_key_file = '/var/lib/stardeck/certs/server.key'
password_encryption = scram-sha-256
log_connections = on
log_disconnections = on
log_statement = 'ddl'                   # Log schema changes
```

### 1.6 PgBouncer Configuration

```ini
[databases]
stardeck = host=localhost port=5432 dbname=stardeck
* = host=localhost port=5432

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
server_round_robin = 1
ignore_startup_parameters = extra_float_digits
```

---

## Phase 2: Database Layer Migration

### 2.1 Driver Change

Replace SQLite driver with PostgreSQL:

```go
// Before (SQLite)
import _ "modernc.org/sqlite"

// After (PostgreSQL)
import _ "github.com/lib/pq"
// Or use pgx for better performance:
import _ "github.com/jackc/pgx/v5/stdlib"
```

### 2.2 Connection Pool Configuration

```go
type Config struct {
    Host     string
    Port     int
    Database string
    User     string
    Password string
    SSLMode  string
    PoolSize int
}

func Open(cfg Config) error {
    dsn := fmt.Sprintf(
        "host=%s port=%d dbname=%s user=%s password=%s sslmode=%s",
        cfg.Host, cfg.Port, cfg.Database, cfg.User, cfg.Password, cfg.SSLMode,
    )

    var err error
    DB, err = sql.Open("pgx", dsn)
    if err != nil {
        return err
    }

    // PostgreSQL connection pool settings
    DB.SetMaxOpenConns(25)           // Match PgBouncer pool
    DB.SetMaxIdleConns(10)           // Keep connections warm
    DB.SetConnMaxLifetime(5 * time.Minute)
    DB.SetConnMaxIdleTime(1 * time.Minute)

    return DB.Ping()
}
```

### 2.3 SQL Syntax Changes

| SQLite | PostgreSQL |
|--------|------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` or `BIGSERIAL` |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT NOW()` |
| `INTEGER` (boolean) | `BOOLEAN` |
| `TEXT` | `TEXT` or `VARCHAR(n)` |
| `?` (placeholder) | `$1, $2, $3...` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `REPLACE INTO` | `INSERT ... ON CONFLICT DO UPDATE` |

### 2.4 Migration File Structure

Create separate PostgreSQL migration files:

```
stardeckos-backend/internal/database/
├── database.go              # Connection management
├── migrations.go            # Migration runner
└── migrations/
    ├── 001_create_users.sql
    ├── 002_create_sessions.sql
    ├── ...
    └── 027_app_databases.sql  # New: app database tracking
```

### 2.5 Key Migration Conversions

```sql
-- Example: 001_create_users.sql (PostgreSQL version)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    password_hash TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    auth_type VARCHAR(50) NOT NULL DEFAULT 'local',
    user_type VARCHAR(50) NOT NULL DEFAULT 'system',
    realm_id INTEGER REFERENCES realms(id) ON DELETE SET NULL,
    system_uid VARCHAR(255),
    disabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_realm_id ON users(realm_id);
CREATE INDEX idx_users_user_type ON users(user_type);
```

---

## Phase 3: App Database Auto-Provisioning

### 3.1 New Database Model

```sql
-- 027_app_databases.sql
CREATE TABLE app_databases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name VARCHAR(255) NOT NULL,
    container_id VARCHAR(255),
    database_name VARCHAR(63) NOT NULL UNIQUE,  -- PG limit: 63 chars
    username VARCHAR(63) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,                 -- Encrypted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ,
    size_bytes BIGINT DEFAULT 0,
    connection_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_app_databases_container ON app_databases(container_id);
CREATE INDEX idx_app_databases_active ON app_databases(is_active);

-- Track connection strings per environment variable
CREATE TABLE app_database_env_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_database_id UUID REFERENCES app_databases(id) ON DELETE CASCADE,
    env_var_name VARCHAR(255) NOT NULL,  -- e.g., DATABASE_URL, POSTGRES_URI
    format VARCHAR(50) NOT NULL DEFAULT 'postgresql',  -- postgresql, jdbc, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Auto-Detection Logic

When a container is created, detect database requirements:

```go
// Database requirement detection patterns
var dbEnvPatterns = []struct {
    pattern     string
    connFormat  string
}{
    {"DATABASE_URL", "postgresql"},
    {"POSTGRES_URL", "postgresql"},
    {"POSTGRES_URI", "postgresql"},
    {"POSTGRES_CONNECTION", "postgresql"},
    {"DB_CONNECTION", "postgresql"},
    {"JDBC_DATABASE_URL", "jdbc"},
    {"SPRING_DATASOURCE_URL", "jdbc"},
}

func DetectDatabaseRequirement(envVars map[string]string) *DatabaseRequirement {
    for _, pattern := range dbEnvPatterns {
        if _, exists := envVars[pattern.pattern]; exists {
            return &DatabaseRequirement{
                EnvVar: pattern.pattern,
                Format: pattern.connFormat,
            }
        }
    }
    return nil
}
```

### 3.3 Provisioning Service

```go
type AppDatabaseService struct {
    db       *sql.DB
    pgConn   *sql.DB  // Admin connection to PostgreSQL
    crypto   *CryptoService
}

// ProvisionDatabase creates a new database and user for an app
func (s *AppDatabaseService) ProvisionDatabase(ctx context.Context, req ProvisionRequest) (*AppDatabase, error) {
    // 1. Generate secure credentials
    dbName := sanitizeDBName(fmt.Sprintf("app_%s", req.AppName))
    username := sanitizeDBName(fmt.Sprintf("stardeck_%s", req.AppName))
    password := generateSecurePassword(32)

    // 2. Create PostgreSQL user
    _, err := s.pgConn.ExecContext(ctx, fmt.Sprintf(
        "CREATE USER %s WITH PASSWORD '%s'",
        pq.QuoteIdentifier(username),
        password,
    ))
    if err != nil {
        return nil, fmt.Errorf("failed to create user: %w", err)
    }

    // 3. Create database
    _, err = s.pgConn.ExecContext(ctx, fmt.Sprintf(
        "CREATE DATABASE %s OWNER %s",
        pq.QuoteIdentifier(dbName),
        pq.QuoteIdentifier(username),
    ))
    if err != nil {
        return nil, fmt.Errorf("failed to create database: %w", err)
    }

    // 4. Restrict permissions
    _, err = s.pgConn.ExecContext(ctx, fmt.Sprintf(
        "REVOKE ALL ON DATABASE %s FROM PUBLIC",
        pq.QuoteIdentifier(dbName),
    ))

    // 5. Store in Stardeck's tracking table
    appDB := &AppDatabase{
        ID:           uuid.New(),
        AppName:      req.AppName,
        ContainerID:  req.ContainerID,
        DatabaseName: dbName,
        Username:     username,
        Password:     s.crypto.Encrypt(password),
    }

    // ... insert into app_databases table

    return appDB, nil
}

// GetConnectionString returns the appropriate connection string format
func (s *AppDatabaseService) GetConnectionString(appDB *AppDatabase, format string) string {
    password := s.crypto.Decrypt(appDB.Password)

    switch format {
    case "jdbc":
        return fmt.Sprintf(
            "jdbc:postgresql://localhost:5432/%s?user=%s&password=%s",
            appDB.DatabaseName, appDB.Username, password,
        )
    default: // postgresql
        return fmt.Sprintf(
            "postgresql://%s:%s@localhost:5432/%s",
            appDB.Username, password, appDB.DatabaseName,
        )
    }
}
```

### 3.4 Container Creation Integration

```go
// In container creation handler
func (h *ContainerHandler) CreateContainer(c *gin.Context) {
    var req CreateContainerRequest
    // ... parse request

    // Check for database requirements
    if dbReq := DetectDatabaseRequirement(req.Environment); dbReq != nil {
        // Provision database
        appDB, err := h.appDBService.ProvisionDatabase(ctx, ProvisionRequest{
            AppName:     req.Name,
            ContainerID: "", // Will be set after container creation
        })
        if err != nil {
            // Handle error
        }

        // Inject connection string into environment
        connStr := h.appDBService.GetConnectionString(appDB, dbReq.Format)
        req.Environment[dbReq.EnvVar] = connStr
    }

    // Continue with container creation...
}
```

---

## Phase 4: pgAdmin Integration & Backup System

### 4.1 pgAdmin Container Setup

```yaml
# pgAdmin deployment configuration
name: pgadmin
image: dpage/pgadmin4:latest
environment:
  PGADMIN_DEFAULT_EMAIL: "${ADMIN_EMAIL}"
  PGADMIN_DEFAULT_PASSWORD: "${ADMIN_PASSWORD}"
  PGADMIN_CONFIG_SERVER_MODE: "False"
  PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: "False"
volumes:
  - pgadmin-data:/var/lib/pgadmin
ports:
  - "5050:80"  # Or use Stardeck proxy
network:
  - stardeck-internal
```

### 4.2 Auto-Configure pgAdmin Server

On pgAdmin deployment, auto-register the local PostgreSQL:

```json
// servers.json (auto-generated)
{
    "Servers": {
        "1": {
            "Name": "Stardeck PostgreSQL",
            "Group": "Local",
            "Host": "host.containers.internal",
            "Port": 5432,
            "MaintenanceDB": "stardeck",
            "Username": "stardeck_admin",
            "SSLMode": "prefer",
            "PassFile": "/pgadmin4/pgpass"
        }
    }
}
```

### 4.3 Backup System

```go
type BackupService struct {
    pgConn      *sql.DB
    backupDir   string
    retention   int // days
}

// BackupDatabase creates a pg_dump backup
func (s *BackupService) BackupDatabase(ctx context.Context, dbName string) (*Backup, error) {
    timestamp := time.Now().Format("20060102_150405")
    filename := fmt.Sprintf("%s_%s.sql.gz", dbName, timestamp)
    filepath := path.Join(s.backupDir, filename)

    cmd := exec.CommandContext(ctx,
        "pg_dump",
        "-h", "localhost",
        "-U", "stardeck_admin",
        "-d", dbName,
        "-Fc",  // Custom format (compressed)
        "-f", filepath,
    )

    if err := cmd.Run(); err != nil {
        return nil, fmt.Errorf("backup failed: %w", err)
    }

    // Record backup in database
    backup := &Backup{
        ID:           uuid.New(),
        DatabaseName: dbName,
        Filename:     filename,
        Size:         getFileSize(filepath),
        CreatedAt:    time.Now(),
    }

    return backup, nil
}

// RestoreDatabase restores from a backup
func (s *BackupService) RestoreDatabase(ctx context.Context, backupID uuid.UUID, targetDB string) error {
    // 1. Get backup record
    // 2. Terminate connections to target DB
    // 3. Drop and recreate target DB
    // 4. Run pg_restore
    // 5. Re-grant permissions
}

// Scheduled backup job
func (s *BackupService) ScheduleBackups(cron string) {
    // Run daily backups of all app databases
    // Clean up backups older than retention period
}
```

### 4.4 Backup API Endpoints

```
/api/databases/:id/backup          POST   Create backup
/api/databases/:id/backups         GET    List backups
/api/databases/:id/backups/:bid    GET    Download backup
/api/databases/:id/restore         POST   Restore from backup
```

---

## Phase 5: Database Lifecycle Management

### 5.1 Deletion Flow

```
User clicks "Delete App" →
  Check if app has provisioned database →
    If yes:
      Show modal:
        ┌─────────────────────────────────────────────┐
        │  Delete Application Database?               │
        │                                             │
        │  App "myapp" has a provisioned database:    │
        │  • Database: app_myapp                      │
        │  • Size: 45 MB                              │
        │  • Created: 2024-01-15                      │
        │                                             │
        │  ○ Delete database permanently              │
        │  ○ Keep database (can be reconnected)       │
        │  ○ Create backup before deleting            │
        │                                             │
        │  [Cancel]              [Confirm Deletion]   │
        └─────────────────────────────────────────────┘
```

### 5.2 Orphaned Database Management

```go
// Find databases without associated containers
func (s *AppDatabaseService) FindOrphanedDatabases(ctx context.Context) ([]AppDatabase, error) {
    return s.repo.FindWhere(ctx, "container_id IS NULL OR container_id NOT IN (SELECT container_id FROM containers)")
}

// Cleanup UI shows orphaned databases with options:
// - Reconnect to existing container
// - Export and delete
// - Delete permanently
```

---

## Phase 6: Frontend Updates

### 6.1 New UI Components

1. **Database Dashboard** (`/databases`)
   - List all app databases
   - Show size, connection count, last access
   - Quick actions: backup, connect pgAdmin, delete

2. **Container Creation Enhancement**
   - Auto-detect database requirement
   - Show "Database will be provisioned" message
   - Option to use existing database

3. **pgAdmin Integration**
   - "Open in pgAdmin" button on database cards
   - Auto-login via Stardeck SSO (future)

4. **Backup Management**
   - Schedule configuration
   - Backup history per database
   - One-click restore

### 6.2 Settings Page Additions

```
Settings → Database
├── PostgreSQL Connection Status
├── Connection Pool Stats (from PgBouncer)
├── Storage Usage (data disk)
├── Backup Schedule
│   ├── Enabled: [toggle]
│   ├── Schedule: [daily/weekly/custom cron]
│   └── Retention: [7/14/30/90 days]
└── pgAdmin
    ├── Status: Running/Stopped
    └── [Open pgAdmin] [Restart]
```

---

## Implementation Order

### Sprint 1: Foundation (Install Script + DB Layer)
- [ ] Disk detection and validation logic
- [ ] PostgreSQL 16 installation automation
- [ ] PgBouncer setup and configuration
- [ ] Database driver migration (SQLite → PostgreSQL)
- [ ] Migration file conversion

### Sprint 2: App Provisioning
- [ ] App database detection logic
- [ ] Database/user provisioning service
- [ ] Container creation integration
- [ ] Connection string injection

### Sprint 3: Management
- [ ] pgAdmin container integration
- [ ] Backup service implementation
- [ ] Scheduled backup jobs
- [ ] Restore functionality

### Sprint 4: UI & Polish
- [ ] Database dashboard
- [ ] Container creation UX updates
- [ ] Backup management UI
- [ ] Settings page updates
- [ ] Deletion workflow with confirmation

---

## Migration Path for Existing Installations

For users upgrading from SQLite version:

1. **Pre-upgrade backup**: Export SQLite database
2. **Run migration script**:
   - Install PostgreSQL on secondary disk
   - Import data from SQLite → PostgreSQL
   - Update Stardeck configuration
3. **Verify**: Run health checks
4. **Cleanup**: Archive SQLite file

```bash
# Migration script outline
./stardeck-migrate-pg.sh
  --sqlite-path /var/lib/stardeck/stardeck.db
  --pg-data-disk /dev/sdb
  --skip-backup  # Optional, not recommended
```

---

## Security Considerations

1. **Credential Storage**: All passwords encrypted at rest using AES-256-GCM
2. **Network Isolation**: PostgreSQL only listens on localhost
3. **User Separation**: Each app gets dedicated PostgreSQL user
4. **Audit Logging**: All database operations logged
5. **STIG Compliance**:
   - Data on separate disk (SRG-OS-000480)
   - SSL/TLS for connections
   - Strong password policy
   - Connection logging enabled

---

## Files to Create/Modify

### New Files
- `scripts/install-pg.sh` - PostgreSQL installation script
- `scripts/stardeck-migrate-pg.sh` - Migration from SQLite
- `internal/database/postgres.go` - PostgreSQL connection management
- `internal/database/migrations/*.sql` - PostgreSQL migrations
- `internal/services/app_database_service.go` - App DB provisioning
- `internal/services/backup_service.go` - Backup/restore
- `internal/api/app_database_handlers.go` - API endpoints

### Modified Files
- `scripts/install.sh` - Complete rewrite
- `internal/database/database.go` - Driver change
- `internal/api/container_handlers.go` - Add DB provisioning
- `internal/api/routes.go` - New endpoints
- Frontend: Multiple components for new UI

---

## Questions for Further Refinement

1. **Disk formatting**: Should install script auto-format secondary disk or require pre-formatted?
2. **Encryption at rest**: Use LUKS for PostgreSQL data directory?
3. **HA/Replication**: Future support for PostgreSQL streaming replication?
4. **Resource limits**: Per-database connection limits or shared pool?
5. **Multi-tenancy**: Should different Stardeck users have isolated databases?
