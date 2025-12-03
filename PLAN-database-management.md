# Stardeck Database Management System - Implementation Plan

## Overview

Add intelligent database management to Stardeck's container management system. This includes:
- First-run database setup wizard
- Database detection and registry
- Smart deployment options (dedicated vs shared databases)
- Internal networking to avoid port conflicts
- Database dashboard for visibility and management

---

## Phase 1: Database Model & Detection Service

### 1.1 Backend: Database Model

**File: `stardeckos-backend/internal/models/database.go`**

Create new model for tracked databases:

```go
type DatabaseType string

const (
    DatabaseTypePostgreSQL DatabaseType = "postgresql"
    DatabaseTypeMariaDB    DatabaseType = "mariadb"
    DatabaseTypeMySQL      DatabaseType = "mysql"
    DatabaseTypeRedis      DatabaseType = "redis"
    DatabaseTypeMongoDB    DatabaseType = "mongodb"
)

type ManagedDatabase struct {
    ID              string       `json:"id"`
    ContainerID     string       `json:"container_id"`      // Podman container ID
    Name            string       `json:"name"`              // Friendly name
    Type            DatabaseType `json:"type"`              // postgresql, mariadb, etc.
    Version         string       `json:"version"`           // e.g., "16", "10.11"
    InternalHost    string       `json:"internal_host"`     // Container name for internal access
    InternalPort    int          `json:"internal_port"`     // Standard port (5432, 3306, etc.)
    ExternalPort    int          `json:"external_port"`     // Exposed host port (0 if not exposed)
    AdminUser       string       `json:"admin_user"`        // Root/admin username
    AdminPassword   string       `json:"admin_password"`    // Encrypted
    Network         string       `json:"network"`           // Podman network name
    Status          string       `json:"status"`            // running, stopped, error
    IsShared        bool         `json:"is_shared"`         // Available for other apps
    CreatedAt       time.Time    `json:"created_at"`
    UpdatedAt       time.Time    `json:"updated_at"`
    CreatedBy       *int64       `json:"created_by,omitempty"`
}

type DatabaseConnection struct {
    ID           string    `json:"id"`
    DatabaseID   string    `json:"database_id"`   // References ManagedDatabase
    ContainerID  string    `json:"container_id"`  // App container using this DB
    DatabaseName string    `json:"database_name"` // Database within the instance
    Username     string    `json:"username"`      // App-specific user
    Password     string    `json:"password"`      // Encrypted
    CreatedAt    time.Time `json:"created_at"`
}

type CreateDatabaseRequest struct {
    Type         DatabaseType `json:"type" validate:"required"`
    Name         string       `json:"name" validate:"required"`
    Version      string       `json:"version,omitempty"`
    ExposePort   bool         `json:"expose_port"`       // Whether to expose to host
    ExternalPort int          `json:"external_port"`     // Specific port (0 = auto-assign)
    IsShared     bool         `json:"is_shared"`         // Allow other apps to use
    AdminUser    string       `json:"admin_user"`
    AdminPassword string      `json:"admin_password"`
}
```

### 1.2 Backend: Database Migration

**File: `stardeckos-backend/internal/database/database.go`**

Add new migration:

```go
{
    name: "026_create_managed_databases",
    up: `
        CREATE TABLE managed_databases (
            id TEXT PRIMARY KEY,
            container_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            version TEXT,
            internal_host TEXT NOT NULL,
            internal_port INTEGER NOT NULL,
            external_port INTEGER DEFAULT 0,
            admin_user TEXT,
            admin_password TEXT,
            network TEXT DEFAULT 'stardeck-data',
            status TEXT DEFAULT 'stopped',
            is_shared INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_managed_databases_type ON managed_databases(type);
        CREATE INDEX idx_managed_databases_container ON managed_databases(container_id);

        CREATE TABLE database_connections (
            id TEXT PRIMARY KEY,
            database_id TEXT NOT NULL REFERENCES managed_databases(id) ON DELETE CASCADE,
            container_id TEXT NOT NULL,
            database_name TEXT NOT NULL,
            username TEXT,
            password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_db_connections_database ON database_connections(database_id);
        CREATE INDEX idx_db_connections_container ON database_connections(container_id);
    `,
},
```

### 1.3 Backend: Database Repository

**File: `stardeckos-backend/internal/database/database_repo.go`**

```go
type DatabaseRepo struct{}

func (r *DatabaseRepo) Create(db *models.ManagedDatabase) error
func (r *DatabaseRepo) GetByID(id string) (*models.ManagedDatabase, error)
func (r *DatabaseRepo) GetByContainerID(containerID string) (*models.ManagedDatabase, error)
func (r *DatabaseRepo) List() ([]*models.ManagedDatabase, error)
func (r *DatabaseRepo) ListByType(dbType models.DatabaseType) ([]*models.ManagedDatabase, error)
func (r *DatabaseRepo) ListShared() ([]*models.ManagedDatabase, error)
func (r *DatabaseRepo) Update(db *models.ManagedDatabase) error
func (r *DatabaseRepo) UpdateStatus(id string, status string) error
func (r *DatabaseRepo) Delete(id string) error

func (r *DatabaseRepo) CreateConnection(conn *models.DatabaseConnection) error
func (r *DatabaseRepo) GetConnectionsByDatabase(databaseID string) ([]*models.DatabaseConnection, error)
func (r *DatabaseRepo) GetConnectionsByContainer(containerID string) ([]*models.DatabaseConnection, error)
func (r *DatabaseRepo) DeleteConnection(id string) error
```

### 1.4 Backend: Database Detection Service

**File: `stardeckos-backend/internal/system/database_service.go`**

Service to detect and manage database containers:

```go
var databaseImages = map[string]models.DatabaseType{
    "postgres":     models.DatabaseTypePostgreSQL,
    "postgresql":   models.DatabaseTypePostgreSQL,
    "mariadb":      models.DatabaseTypeMariaDB,
    "mysql":        models.DatabaseTypeMySQL,
    "redis":        models.DatabaseTypeRedis,
    "mongo":        models.DatabaseTypeMongoDB,
    "mongodb":      models.DatabaseTypeMongoDB,
}

var defaultPorts = map[models.DatabaseType]int{
    models.DatabaseTypePostgreSQL: 5432,
    models.DatabaseTypeMariaDB:    3306,
    models.DatabaseTypeMySQL:      3306,
    models.DatabaseTypeRedis:      6379,
    models.DatabaseTypeMongoDB:    27017,
}

type DatabaseService struct {
    podman *PodmanService
    repo   *database.DatabaseRepo
}

func (s *DatabaseService) DetectDatabaseContainers() ([]*models.ManagedDatabase, error)
func (s *DatabaseService) IsDatabaseImage(imageName string) (models.DatabaseType, bool)
func (s *DatabaseService) CreateDatabase(req *models.CreateDatabaseRequest, userID int64) (*models.ManagedDatabase, error)
func (s *DatabaseService) GetNextAvailablePort(dbType models.DatabaseType) (int, error)
func (s *DatabaseService) EnsureDataNetwork() error
func (s *DatabaseService) GetConnectionString(db *models.ManagedDatabase, dbName string) string
```

---

## Phase 2: Database API Handlers

### 2.1 Backend: Database Handlers

**File: `stardeckos-backend/internal/api/database_handlers.go`**

```go
// GET /api/databases - List all managed databases
func (h *Handler) ListDatabases(c echo.Context) error

// GET /api/databases/:id - Get database details
func (h *Handler) GetDatabase(c echo.Context) error

// POST /api/databases - Create a new database
func (h *Handler) CreateDatabase(c echo.Context) error

// DELETE /api/databases/:id - Remove database
func (h *Handler) DeleteDatabase(c echo.Context) error

// POST /api/databases/:id/start - Start database container
func (h *Handler) StartDatabase(c echo.Context) error

// POST /api/databases/:id/stop - Stop database container
func (h *Handler) StopDatabase(c echo.Context) error

// GET /api/databases/:id/connections - List app connections
func (h *Handler) ListDatabaseConnections(c echo.Context) error

// POST /api/databases/:id/databases - Create database within instance
func (h *Handler) CreateDatabaseInstance(c echo.Context) error

// GET /api/databases/detect - Scan for unmanaged database containers
func (h *Handler) DetectDatabases(c echo.Context) error

// POST /api/databases/adopt/:container_id - Adopt existing database container
func (h *Handler) AdoptDatabase(c echo.Context) error
```

### 2.2 Backend: Route Registration

**File: `stardeckos-backend/internal/api/routes.go`**

Add to route setup:

```go
// Database management routes
databases := api.Group("/databases")
databases.GET("", h.ListDatabases, authMiddleware)
databases.GET("/detect", h.DetectDatabases, authMiddleware, adminMiddleware)
databases.POST("", h.CreateDatabase, authMiddleware, adminMiddleware)
databases.GET("/:id", h.GetDatabase, authMiddleware)
databases.DELETE("/:id", h.DeleteDatabase, authMiddleware, adminMiddleware)
databases.POST("/:id/start", h.StartDatabase, authMiddleware, adminMiddleware)
databases.POST("/:id/stop", h.StopDatabase, authMiddleware, adminMiddleware)
databases.GET("/:id/connections", h.ListDatabaseConnections, authMiddleware)
databases.POST("/:id/databases", h.CreateDatabaseInstance, authMiddleware, adminMiddleware)
databases.POST("/adopt/:container_id", h.AdoptDatabase, authMiddleware, adminMiddleware)
```

---

## Phase 3: First-Run Database Wizard

### 3.1 Frontend: Database Setup Welcome

**File: `stardeckos-frontend/components/database-welcome.tsx`**

Component shown when Container Manager is first accessed with no databases:

```tsx
interface DatabaseWelcomeProps {
  onCreateDatabase: () => void;
  onSkip: () => void;
}

export function DatabaseWelcome({ onCreateDatabase, onSkip }: DatabaseWelcomeProps) {
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <Database className="w-16 h-16 mx-auto text-accent mb-4" />
        <CardTitle>Set Up Your First Database</CardTitle>
        <CardDescription>
          Many apps require a database. Setting one up now makes deploying apps easier later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Database type cards: PostgreSQL, MariaDB, MySQL */}
        <div className="grid grid-cols-3 gap-4">
          <DatabaseTypeCard type="postgresql" popular />
          <DatabaseTypeCard type="mariadb" />
          <DatabaseTypeCard type="mysql" />
        </div>

        <div className="bg-muted/50 p-4 rounded-lg">
          <h4 className="font-medium mb-2">Why set up a database now?</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Apps can share databases, saving resources</li>
            <li>• No port conflicts - internal networking handles it</li>
            <li>• Easy connection strings for your apps</li>
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
        <Button onClick={onCreateDatabase}>
          <Plus className="w-4 h-4 mr-2" />
          Create Database
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### 3.2 Frontend: Database Creation Dialog

**File: `stardeckos-frontend/components/database-create-dialog.tsx`**

Multi-step dialog for creating a database:

```tsx
interface CreateDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateDatabaseDialog({ open, onOpenChange, onSuccess }: CreateDatabaseDialogProps) {
  const [step, setStep] = useState<'type' | 'config' | 'deploy'>('type');
  const [dbType, setDbType] = useState<DatabaseType>('postgresql');
  const [config, setConfig] = useState({
    name: '',
    version: '',
    exposePort: false,
    isShared: true,
    adminPassword: generatePassword(),
  });

  // Step 1: Choose database type (PostgreSQL, MariaDB, MySQL)
  // Step 2: Configure (name, version, expose port, shared)
  // Step 3: Deploy with progress (WebSocket streaming)
}
```

---

## Phase 4: Database Tab in Container Manager

### 4.1 Frontend: Databases Tab Component

**File: `stardeckos-frontend/components/databases-tab.tsx`**

New tab for Container Manager showing all databases:

```tsx
interface DatabasesTabProps {
  token: string;
  isAdmin: boolean;
}

export function DatabasesTab({ token, isAdmin }: DatabasesTabProps) {
  const [databases, setDatabases] = useState<ManagedDatabase[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header with Create button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Managed Databases</h3>
          <p className="text-sm text-muted-foreground">
            Database instances available for your applications
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Database
          </Button>
        )}
      </div>

      {/* Database Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {databases.map(db => (
          <DatabaseCard
            key={db.id}
            database={db}
            onSelect={() => setSelectedDatabase(db.id)}
          />
        ))}
      </div>

      {/* Empty state with DatabaseWelcome */}
      {databases.length === 0 && (
        <DatabaseWelcome
          onCreateDatabase={() => setShowCreateDialog(true)}
          onSkip={() => {}}
        />
      )}

      {/* Database details sheet */}
      <DatabaseDetailsSheet
        databaseId={selectedDatabase}
        onClose={() => setSelectedDatabase(null)}
      />

      <CreateDatabaseDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={fetchDatabases}
      />
    </div>
  );
}
```

### 4.2 Frontend: Database Card Component

**File: `stardeckos-frontend/components/database-card.tsx`**

Individual database display card:

```tsx
interface DatabaseCardProps {
  database: ManagedDatabase;
  onSelect: () => void;
}

export function DatabaseCard({ database, onSelect }: DatabaseCardProps) {
  return (
    <Card className="cursor-pointer hover:border-accent/50 transition-colors" onClick={onSelect}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DatabaseIcon type={database.type} className="w-8 h-8" />
            <div>
              <CardTitle className="text-base">{database.name}</CardTitle>
              <CardDescription className="text-xs">
                {database.type} {database.version}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={database.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Internal</span>
            <code className="text-xs">{database.internal_host}:{database.internal_port}</code>
          </div>
          {database.external_port > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">External</span>
              <code className="text-xs">localhost:{database.external_port}</code>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Connections</span>
            <span>{database.connection_count || 0} apps</span>
          </div>
        </div>
        {database.is_shared && (
          <Badge variant="outline" className="mt-2">
            <Share2 className="w-3 h-3 mr-1" />
            Shared
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
```

### 4.3 Frontend: Database Details Sheet

**File: `stardeckos-frontend/components/database-details-sheet.tsx`**

Slide-out panel showing database details, connections, and management options:

```tsx
export function DatabaseDetailsSheet({ databaseId, onClose }: DatabaseDetailsSheetProps) {
  // Tabs: Overview, Connections, Logs, Settings
  // Shows: Connection string, connected apps, create new database button
}
```

---

## Phase 5: Smart App Deployment Integration

### 5.1 Frontend: Database Selector for Container Create

**File: Modify `stardeckos-frontend/app/container-create/page.tsx`**

Add database connection option when deploying apps that need databases:

```tsx
// New component for selecting database during container creation
interface DatabaseSelectorProps {
  requiredType?: DatabaseType;  // From image inspection
  onSelect: (database: ManagedDatabase | null, newDbName: string) => void;
}

function DatabaseSelector({ requiredType, onSelect }: DatabaseSelectorProps) {
  const [availableDatabases, setAvailableDatabases] = useState<ManagedDatabase[]>([]);
  const [mode, setMode] = useState<'existing' | 'new' | 'external'>('existing');

  return (
    <div className="space-y-4">
      <RadioGroup value={mode} onValueChange={setMode}>
        <RadioGroupItem value="existing">
          Use existing database
        </RadioGroupItem>
        <RadioGroupItem value="new">
          Create dedicated database
        </RadioGroupItem>
        <RadioGroupItem value="external">
          External database (provide connection string)
        </RadioGroupItem>
      </RadioGroup>

      {mode === 'existing' && (
        <Select onValueChange={(dbId) => { /* select database */ }}>
          {availableDatabases.filter(db => db.is_shared).map(db => (
            <SelectItem key={db.id} value={db.id}>
              {db.name} ({db.type} {db.version})
            </SelectItem>
          ))}
        </Select>
      )}

      {mode === 'new' && (
        <CreateDatabaseInline type={requiredType} />
      )}

      {mode === 'external' && (
        <Input placeholder="postgresql://user:pass@host:5432/db" />
      )}
    </div>
  );
}
```

### 5.2 Backend: Auto-Inject Database Environment Variables

When creating a container with a database connection, auto-inject:
- `DATABASE_URL`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Database-specific vars (e.g., `POSTGRES_*`, `MYSQL_*`)

---

## Phase 6: Internal Networking

### 6.1 Backend: Stardeck Data Network

**File: `stardeckos-backend/internal/system/database_service.go`**

```go
const StardeckDataNetwork = "stardeck-data"

func (s *DatabaseService) EnsureDataNetwork() error {
    networks, err := s.podman.ListNetworks()
    if err != nil {
        return err
    }

    for _, net := range networks {
        if net.Name == StardeckDataNetwork {
            return nil // Already exists
        }
    }

    // Create internal network for database traffic
    return s.podman.CreateNetwork(&models.CreateNetworkRequest{
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
}
```

### 6.2 Auto-Connect Containers to Data Network

When creating database containers or apps that use databases:
1. Ensure `stardeck-data` network exists
2. Connect container to the network
3. Use container name as hostname for internal access

---

## Phase 7: Port Conflict Prevention

### 7.1 Backend: Smart Port Allocation

**File: `stardeckos-backend/internal/system/database_service.go`**

```go
var portRanges = map[models.DatabaseType]struct{ start, end int }{
    models.DatabaseTypePostgreSQL: {5432, 5499},
    models.DatabaseTypeMariaDB:    {3306, 3399},
    models.DatabaseTypeMySQL:      {3306, 3399},
    models.DatabaseTypeRedis:      {6379, 6399},
    models.DatabaseTypeMongoDB:    {27017, 27099},
}

func (s *DatabaseService) GetNextAvailablePort(dbType models.DatabaseType) (int, error) {
    portRange := portRanges[dbType]
    usedPorts := s.getUsedPorts()

    for port := portRange.start; port <= portRange.end; port++ {
        if !usedPorts[port] {
            return port, nil
        }
    }
    return 0, fmt.Errorf("no available ports in range %d-%d", portRange.start, portRange.end)
}
```

---

## Phase 8: Container Manager Integration

### 8.1 Frontend: Add Databases Tab

**File: Modify `stardeckos-frontend/app/container-manager/page.tsx`**

Add "Databases" tab to the existing TabsList:

```tsx
<TabsTrigger value="databases" className="gap-2">
  <Database className="w-4 h-4" /> Databases
</TabsTrigger>

// ...

<TabsContent value="databases" className="space-y-4">
  <DatabasesTab token={token || ""} isAdmin={isAdmin} />
</TabsContent>
```

---

## Implementation Order

1. **Phase 1**: Database model, migration, repository (backend foundation)
2. **Phase 2**: API handlers and routes (backend API)
3. **Phase 3**: First-run wizard component (frontend entry point)
4. **Phase 4**: Databases tab and cards (frontend management)
5. **Phase 5**: Container create integration (smart deployment)
6. **Phase 6**: Internal networking (stardeck-data network)
7. **Phase 7**: Port allocation logic (conflict prevention)
8. **Phase 8**: Container Manager integration (tie it together)

---

## Database Images Reference

| Type       | Image              | Default Port | Environment Variables |
|------------|--------------------|--------------|-----------------------|
| PostgreSQL | `postgres:16`      | 5432         | POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB |
| MariaDB    | `mariadb:10.11`    | 3306         | MARIADB_ROOT_PASSWORD, MARIADB_DATABASE, MARIADB_USER |
| MySQL      | `mysql:8.0`        | 3306         | MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER |
| Redis      | `redis:7`          | 6379         | (none, optional REDIS_PASSWORD) |
| MongoDB    | `mongo:7`          | 27017        | MONGO_INITDB_ROOT_USERNAME, MONGO_INITDB_ROOT_PASSWORD |

---

## Testing Checklist

- [ ] Create PostgreSQL database via wizard
- [ ] Create MariaDB database via wizard
- [ ] Database appears in Databases tab
- [ ] Start/stop database from UI
- [ ] Deploy app with existing database connection
- [ ] Deploy app with new dedicated database
- [ ] Verify internal networking works (app can reach DB by name)
- [ ] Verify no port conflicts when creating multiple databases
- [ ] Adopt unmanaged database container
- [ ] Delete database and verify cleanup
