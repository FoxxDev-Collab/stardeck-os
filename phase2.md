# Stardeck Phase 2 Implementation Plan

## Overview

**Focus:** Container management with Podman  
**Goal:** Transform Stardeck into a container desktop OS where deployed containers appear as desktop applications  
**Principle:** Infrastructure as desktop, not app marketplace

---

## Core Concept

Users deploy containers via compose files or direct configuration. Each container with a web UI becomes a desktop app, accessible through the Stardeck proxy without exposing ports externally.

```
User provides compose.yml â†’ 
Stardeck deploys to Podman (localhost only) â†’ 
Icon appears on desktop â†’ 
Click opens proxied web UI in window
```

---

## Phase 2 Modules

### 1. Podman Integration

Core interface to Podman container runtime.

**Functionality:**
- Container lifecycle (create, start, stop, restart, remove)
- Image management (pull, list, remove)
- Volume management (create, inspect, remove)
- Network management (create, inspect, remove)
- Compose support (via podman-compose or native)
- Resource monitoring per container
- Log streaming (real-time)

**Implementation:**
- Go Podman library: `github.com/containers/podman/v4/pkg/bindings`
- Fallback to CLI wrapper if bindings insufficient
- Support both rootless and rootful modes

**System Requirements Check:**
- Verify Podman installed
- Check version compatibility (4.0+)
- Validate user permissions (rootless capability)

---

### 2. Container Manager Application

Main desktop window for container operations.

**Tabs:**

#### Installed Tab
- List view with columns:
  - Name, Status, Uptime, CPU%, Memory, Actions
- Expandable rows showing:
  - Ports, volumes, networks, environment
- Quick actions: Start, Stop, Restart, Remove, Logs, Settings
- Bulk operations (select multiple, action)
- Search and filter

#### Deploy Tab
Three deployment methods:

**A. Import Compose File**
- Upload from file system
- Paste YAML content
- Import from URL
- Git repository support (future)

**B. Quick Deploy**
- Image name input with tag
- Port mappings (visual editor)
- Volume mounts (visual editor)
- Environment variables
- Resource limits

**C. Templates**
- User-saved configurations
- Import/export templates
- Community templates (optional, Phase 3+)

#### Browser Tab
- Navigate local filesystem
- Select directories for volume mounts
- Create new directories
- View permissions and ownership
- Restricted to safe base paths

---

### 3. Compose Configuration Editor

Parse compose files and provide visual editing interface.

**Parser:**
- Load docker-compose.yml or podman-compose.yml
- Extract: services, volumes, networks, secrets, configs
- Validate syntax and structure
- Show warnings for unsupported features

**Visual Editor:**

```
Service Configuration
â”œâ”€â”€ General (name, image, restart policy)
â”œâ”€â”€ Environment Variables (key-value editor)
â”œâ”€â”€ Ports (internal:external mapping, protocol)
â”œâ”€â”€ Volumes (mount editor with file browser)
â”œâ”€â”€ Networks (select/create)
â”œâ”€â”€ Dependencies (depends_on)
â”œâ”€â”€ Resources (CPU, memory limits)
â”œâ”€â”€ Health Check (optional)
â””â”€â”€ Labels (metadata, including Stardeck-specific)
```

**Round-trip:**
- Edit visually â†’ updates YAML
- Edit YAML â†’ updates visual form
- Preserve comments and formatting where possible

---

### 4. Monaco Code Editor Integration

Professional code editing for compose files.

**Features:**
- Syntax highlighting (YAML)
- Auto-completion (compose keys, image names)
- Validation (schema checking)
- Linting (best practices)
- Multi-file editing (compose + .env)
- Find and replace
- Diff view (compare versions)

**Libraries:**
- `@monaco-editor/react` for Next.js integration
- Custom YAML language server for compose-specific validation

**Actions:**
- Save (update compose file)
- Validate (check syntax and logic)
- Format (prettify YAML)
- Revert (undo changes)
- Deploy (save and restart containers)

---

### 5. Environment Variables Manager

Secure handling of configuration and secrets.

**Interface:**

```
Variable List
â”œâ”€â”€ Name (editable)
â”œâ”€â”€ Value (editable, masked if secret)
â”œâ”€â”€ Type (Plain, Secret, Template)
â”œâ”€â”€ Source (compose, .env, manual)
â””â”€â”€ Actions (edit, delete, toggle visibility)
```

**Features:**
- Mark variables as secrets (encrypted storage)
- Import from .env files
- Export to .env
- Template variables:
  - `${HOSTNAME}` â†’ server hostname
  - `${STARDECK_IP}` â†’ server IP
  - `${TIMESTAMP}` â†’ deployment time
- Validation (warn if undefined variables referenced)
- Bulk edit mode

**Security:**
- Secrets encrypted at rest (SQLite encrypted column)
- Display masked by default (â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢)
- Toggle visibility per-secret
- Audit log for secret access

---

### 6. Volume Management

Visual interface for persistent storage.

**Volume List:**
- Name, driver, mount point, size, containers using
- Actions: Inspect, Backup, Remove

**Mount Editor:**
- Source path (host) with file browser
- Target path (container)
- Read-only toggle
- SELinux label options (Z, z)
- Create on deploy toggle

**File Browser:**
- Tree view of allowed directories
  - `/var/lib/stardeck/volumes/` (recommended)
  - `/home/<user>/` (user home)
  - Custom paths (admin configurable)
- Create directory in-place
- View permissions
- Cannot modify files (browser only)

**Backup/Restore:**
- Export volume to tar.gz
- Import volume from archive
- Scheduled backups (Phase 3+)

---

### 7. Network Management

Container networking configuration.

**Network List:**
- Name, driver, subnet, containers attached
- Default networks: podman (default), host, none
- Custom networks

**Network Editor:**
- Name
- Driver (bridge, host, macvlan)
- Subnet and gateway (optional)
- IPv6 toggle
- Internal network toggle (no external access)

**Service Discovery:**
- Containers on same network can resolve by name
- DNS configuration options

---

### 8. Web UI Proxy System

Serve container web interfaces through Stardeck.

**Architecture:**

```
Container (localhost:3000) 
         â†“
Go Backend (/api/proxy/:container_id/*)
         â†“
Frontend (Desktop Window with iframe)
```

**Backend Proxy:**

```go
// Verify container ownership and web UI enabled
func ProxyContainer(c echo.Context) error {
    containerID := c.Param("container_id")
    
    // Security checks
    container := db.GetContainer(containerID)
    if !container.HasWebUI || !userCanAccess(container) {
        return ErrForbidden
    }
    
    // Proxy to localhost port
    target := fmt.Sprintf("http://localhost:%d", container.Port)
    proxy := httputil.NewSingleHostReverseProxy(target)
    proxy.ServeHTTP(c.Response(), c.Request())
}
```

**Security:**
- Only proxy to containers managed by Stardeck
- Only localhost ports
- User must have permission to access container
- Rate limiting per user
- Audit logging

**WebSocket Support:**
- Upgrade HTTP connections to WebSocket
- Proxy WebSocket traffic transparently
- Essential for real-time apps (Grafana, terminal emulators)

---

### 9. Desktop Application Icons

Containers with web UIs appear as desktop apps.

**Icon Generation:**
- Container label: `stardeck.icon=grafana` (matches icon library)
- Custom icon upload support
- Favicon fetch from running service
- Default icon based on image name

**Desktop Integration:**
- Icon appears when container is running
- Icon grayed out when stopped
- Click opens window with proxied UI
- Right-click menu:
  - Open
  - Restart
  - View Logs
  - Settings
  - Remove

**Window State:**
- Remember position and size per container
- Multiple windows for same container (optional)
- Minimize to dock

---

### 10. Container Templates

Save and reuse configurations.

**Template Structure:**

```json
{
  "id": "monitoring-stack",
  "name": "Monitoring Stack",
  "description": "Grafana + Prometheus + Loki",
  "author": "user@local",
  "version": "1.0.0",
  "compose": "base64-encoded-compose-file",
  "env_defaults": {
    "ADMIN_PASSWORD": "",
    "RETENTION_DAYS": "30"
  },
  "volumes": [
    {
      "name": "grafana-data",
      "suggested_path": "/var/lib/stardeck/volumes/grafana"
    }
  ],
  "created_at": "2025-01-15T00:00:00Z"
}
```

**Template Operations:**
- Save current configuration as template
- Deploy from template (prompts for variables)
- Edit template
- Export template (JSON file)
- Import template (JSON file)
- Share template (copy to clipboard as JSON)

**No Marketplace:**
- No central repository
- No ratings or reviews
- No automated discovery
- Users share templates as files manually

---

## Data Models

### Container

```
Container
â”œâ”€â”€ ID                  (uuid, Stardeck-internal)
â”œâ”€â”€ ContainerID         (podman container ID)
â”œâ”€â”€ Name                (user-friendly name)
â”œâ”€â”€ Image               (image:tag)
â”œâ”€â”€ Status              (running, stopped, created, exited, error)
â”œâ”€â”€ ComposeFile         (path or content)
â”œâ”€â”€ ComposePath         (directory containing compose and related files)
â”œâ”€â”€ HasWebUI            (bool)
â”œâ”€â”€ WebUIPort           (int, internal port)
â”œâ”€â”€ WebUIPath           (string, e.g., "/", "/admin")
â”œâ”€â”€ Icon                (string, icon identifier or path)
â”œâ”€â”€ AutoStart           (bool)
â”œâ”€â”€ CreatedAt           (timestamp)
â”œâ”€â”€ UpdatedAt           (timestamp)
â”œâ”€â”€ CreatedBy           (user ID)
â”œâ”€â”€ Labels              (JSON, key-value pairs)
â””â”€â”€ Metadata            (JSON, Stardeck-specific data)
```

### Volume

```
Volume
â”œâ”€â”€ ID                  (uuid)
â”œâ”€â”€ Name                (volume name)
â”œâ”€â”€ Driver              (local, nfs, etc.)
â”œâ”€â”€ MountPoint          (host path)
â”œâ”€â”€ Containers          ([]string, container IDs using this volume)
â”œâ”€â”€ CreatedAt           (timestamp)
â””â”€â”€ Labels              (JSON)
```

### Network

```
Network
â”œâ”€â”€ ID                  (uuid)
â”œâ”€â”€ NetworkID           (podman network ID)
â”œâ”€â”€ Name                (network name)
â”œâ”€â”€ Driver              (bridge, host, etc.)
â”œâ”€â”€ Subnet              (CIDR notation)
â”œâ”€â”€ Gateway             (IP address)
â”œâ”€â”€ Internal            (bool)
â”œâ”€â”€ CreatedAt           (timestamp)
â””â”€â”€ Labels              (JSON)
```

### Template

```
Template
â”œâ”€â”€ ID                  (uuid)
â”œâ”€â”€ Name                (template name)
â”œâ”€â”€ Description         (string)
â”œâ”€â”€ Author              (user ID or name)
â”œâ”€â”€ Version             (semver)
â”œâ”€â”€ ComposeContent      (text, full compose file)
â”œâ”€â”€ EnvDefaults         (JSON, default env vars)
â”œâ”€â”€ VolumeHints         (JSON, suggested volume paths)
â”œâ”€â”€ Tags                ([]string, for filtering)
â”œâ”€â”€ CreatedAt           (timestamp)
â”œâ”€â”€ UpdatedAt           (timestamp)
â””â”€â”€ UsageCount          (int, how many times deployed)
```

### ContainerMetrics (time-series)

```
ContainerMetrics
â”œâ”€â”€ ContainerID         (reference)
â”œâ”€â”€ Timestamp           (timestamp)
â”œâ”€â”€ CPUPercent          (float)
â”œâ”€â”€ MemoryUsed          (int64, bytes)
â”œâ”€â”€ MemoryLimit         (int64, bytes)
â”œâ”€â”€ NetworkRx           (int64, bytes)
â”œâ”€â”€ NetworkTx           (int64, bytes)
â”œâ”€â”€ BlockRead           (int64, bytes)
â””â”€â”€ BlockWrite          (int64, bytes)
```

---

## Database Schema Additions

```sql
-- Containers
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
    created_by TEXT REFERENCES users(id),
    labels TEXT, -- JSON
    metadata TEXT -- JSON
);

-- Volumes
CREATE TABLE volumes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    driver TEXT DEFAULT 'local',
    mount_point TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    labels TEXT -- JSON
);

-- Volume usage tracking
CREATE TABLE volume_containers (
    volume_id TEXT REFERENCES volumes(id),
    container_id TEXT REFERENCES containers(id),
    PRIMARY KEY (volume_id, container_id)
);

-- Networks
CREATE TABLE networks (
    id TEXT PRIMARY KEY,
    network_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    driver TEXT DEFAULT 'bridge',
    subnet TEXT,
    gateway TEXT,
    internal INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    labels TEXT -- JSON
);

-- Templates
CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    author TEXT,
    version TEXT,
    compose_content TEXT NOT NULL,
    env_defaults TEXT, -- JSON
    volume_hints TEXT, -- JSON
    tags TEXT, -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    usage_count INTEGER DEFAULT 0
);

-- Container metrics (rolling 24h window)
CREATE TABLE container_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id TEXT REFERENCES containers(id),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cpu_percent REAL,
    memory_used INTEGER,
    memory_limit INTEGER,
    network_rx INTEGER,
    network_tx INTEGER,
    block_read INTEGER,
    block_write INTEGER
);

CREATE INDEX idx_metrics_container_time ON container_metrics(container_id, timestamp);

-- Environment variables (encrypted secrets)
CREATE TABLE container_env_vars (
    id TEXT PRIMARY KEY,
    container_id TEXT REFERENCES containers(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL, -- encrypted if is_secret=1
    is_secret INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_env_container_key ON container_env_vars(container_id, key);
```

---

## API Structure

```
/api
â”œâ”€â”€ /containers
â”‚   â”œâ”€â”€ GET /                        # List all containers
â”‚   â”œâ”€â”€ POST /                       # Create/deploy container
â”‚   â”œâ”€â”€ GET /:id                     # Container details
â”‚   â”œâ”€â”€ PUT /:id                     # Update container config
â”‚   â”œâ”€â”€ DELETE /:id                  # Remove container
â”‚   â”œâ”€â”€ POST /:id/start              # Start container
â”‚   â”œâ”€â”€ POST /:id/stop               # Stop container
â”‚   â”œâ”€â”€ POST /:id/restart            # Restart container
â”‚   â”œâ”€â”€ GET /:id/logs                # Stream logs (WebSocket upgrade)
â”‚   â”œâ”€â”€ GET /:id/stats               # Real-time stats (WebSocket)
â”‚   â”œâ”€â”€ GET /:id/metrics             # Historical metrics
â”‚   â”œâ”€â”€ GET /:id/compose             # Get compose file
â”‚   â”œâ”€â”€ PUT /:id/compose             # Update compose file
â”‚   â””â”€â”€ GET /:id/proxy/*             # Proxy web UI requests
â”œâ”€â”€ /images
â”‚   â”œâ”€â”€ GET /                        # List images
â”‚   â”œâ”€â”€ POST /pull                   # Pull image
â”‚   â”œâ”€â”€ DELETE /:id                  # Remove image
â”‚   â””â”€â”€ GET /:id/inspect             # Image details
â”œâ”€â”€ /volumes
â”‚   â”œâ”€â”€ GET /                        # List volumes
â”‚   â”œâ”€â”€ POST /                       # Create volume
â”‚   â”œâ”€â”€ GET /:id                     # Volume details
â”‚   â”œâ”€â”€ DELETE /:id                  # Remove volume
â”‚   â”œâ”€â”€ POST /:id/backup             # Export volume
â”‚   â””â”€â”€ POST /:id/restore            # Import volume
â”œâ”€â”€ /networks
â”‚   â”œâ”€â”€ GET /                        # List networks
â”‚   â”œâ”€â”€ POST /                       # Create network
â”‚   â”œâ”€â”€ GET /:id                     # Network details
â”‚   â””â”€â”€ DELETE /:id                  # Remove network
â”œâ”€â”€ /templates
â”‚   â”œâ”€â”€ GET /                        # List templates
â”‚   â”œâ”€â”€ POST /                       # Create template
â”‚   â”œâ”€â”€ GET /:id                     # Template details
â”‚   â”œâ”€â”€ PUT /:id                     # Update template
â”‚   â”œâ”€â”€ DELETE /:id                  # Delete template
â”‚   â”œâ”€â”€ POST /:id/deploy             # Deploy from template
â”‚   â”œâ”€â”€ POST /import                 # Import template file
â”‚   â””â”€â”€ GET /:id/export              # Export template file
â”œâ”€â”€ /compose
â”‚   â”œâ”€â”€ POST /parse                  # Parse compose file, return config
â”‚   â”œâ”€â”€ POST /validate               # Validate compose file
â”‚   â””â”€â”€ POST /deploy                 # Deploy from compose content
â””â”€â”€ /filesystem
    â”œâ”€â”€ GET /browse                  # Browse directories (query: path)
    â”œâ”€â”€ POST /mkdir                  # Create directory
    â””â”€â”€ GET /info                    # File/directory info
```

---

## Frontend Structure

```
/app/desktop/apps/containers/
â”œâ”€â”€ page.tsx                         # Container Manager main window
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ ContainerList.tsx            # Installed tab
â”‚   â”œâ”€â”€ DeployWizard.tsx             # Deploy tab
â”‚   â”‚   â”œâ”€â”€ ComposeImport.tsx
â”‚   â”‚   â”œâ”€â”€ QuickDeploy.tsx
â”‚   â”‚   â””â”€â”€ TemplateSelector.tsx
â”‚   â”œâ”€â”€ FileBrowser.tsx              # File system browser
â”‚   â”œâ”€â”€ ComposeEditor.tsx            # Monaco editor wrapper
â”‚   â”œâ”€â”€ ConfigEditor.tsx             # Visual config editor
â”‚   â”œâ”€â”€ EnvVarManager.tsx            # Environment variables
â”‚   â”œâ”€â”€ VolumeEditor.tsx             # Volume mount editor
â”‚   â”œâ”€â”€ NetworkSelector.tsx          # Network configuration
â”‚   â”œâ”€â”€ ResourceLimits.tsx           # CPU/memory limits
â”‚   â”œâ”€â”€ ContainerDetail.tsx          # Detailed view
â”‚   â”œâ”€â”€ LogViewer.tsx                # Real-time logs
â”‚   â”œâ”€â”€ StatsMonitor.tsx             # Real-time stats graphs
â”‚   â””â”€â”€ TemplateManager.tsx          # Template CRUD
â””â”€â”€ [id]/
    â””â”€â”€ page.tsx                     # Per-container window with proxy
```

---

## Security Considerations

### Proxy Security

- **Whitelist only:** Only proxy to containers in database
- **Localhost only:** Never proxy to external addresses
- **User authorization:** Verify user can access container
- **Rate limiting:** Prevent abuse
- **Audit logging:** Log all proxy access
- **CSP headers:** Set Content-Security-Policy appropriately

### Secret Management

- **Encryption at rest:** Use AES-256 for secrets in database
- **Masked display:** Show â€¢â€¢â€¢â€¢â€¢â€¢â€¢ by default
- **Secure transmission:** TLS for all API calls
- **No logging:** Never log secret values
- **Access audit:** Log who accessed which secrets

### Podman Permissions

- **Rootless mode preferred:** Run Podman as non-root user
- **SELinux contexts:** Proper labels for volumes
- **Resource limits:** Enforce CPU/memory caps
- **Network isolation:** Use internal networks where possible

### File System Access

- **Path restrictions:** Only allow browsing safe directories
- **Read-only:** File browser cannot modify files
- **Symlink checking:** Prevent symlink attacks
- **Permission validation:** Check ownership before mount

---

## User Workflows

### Deploy a Simple Container

1. Open Container Manager
2. Click "Deploy" tab
3. Select "Quick Deploy"
4. Enter image name: `nginx:latest`
5. Add port: `8080 â†’ 80`
6. Click "Deploy"
7. Icon appears on desktop
8. Click icon â†’ Nginx welcome page in window

### Deploy from Compose

1. Open Container Manager
2. Click "Deploy" tab
3. Select "Import Compose"
4. Upload `docker-compose.yml`
5. Review parsed configuration
6. Edit environment variables (set admin password)
7. Select volume paths via file browser
8. Enable "Create desktop icon"
9. Click "Deploy"
10. Watch progress in real-time
11. Icons appear on desktop for each service with web UI

### Edit Running Container

1. Desktop â†’ right-click container icon â†’ "Settings"
2. Modify environment variables
3. Click "Save & Restart"
4. Container restarts with new config

### View Logs

1. Desktop â†’ right-click container icon â†’ "Logs"
2. Log viewer window opens
3. Real-time streaming logs
4. Search and filter
5. Download logs as text file

### Create Template

1. Container Manager â†’ select deployed container
2. Click "Save as Template"
3. Enter template name and description
4. Specify which env vars should be prompted on deploy
5. Save
6. Template available in Deploy tab

---

## Milestones

| Milestone | Deliverable |
|-----------|-------------|
| M2.1 | Podman integration (list, create, start, stop, remove) |
| M2.2 | Container Manager UI (basic list and actions) |
| M2.3 | Compose parser and validator |
| M2.4 | Visual config editor (ports, volumes, env vars) |
| M2.5 | Monaco code editor integration |
| M2.6 | File browser component |
| M2.7 | Environment variable manager with secrets |
| M2.8 | Volume and network management |
| M2.9 | Web UI proxy system |
| M2.10 | Desktop icon integration |
| M2.11 | Template system |
| M2.12 | Real-time logs and stats |
| M2.13 | Testing with complex multi-container apps |
| M2.14 | Documentation and user guide |

---

## Dependencies

### Go Packages

```
github.com/containers/podman/v4/pkg/bindings
github.com/compose-spec/compose-go
github.com/gorilla/websocket (already in Phase 1)
gopkg.in/yaml.v3
```

### Frontend Packages

```
@monaco-editor/react
yaml (for client-side parsing)
react-resizable-panels (for split views)
recharts (for stats graphs, if not already included)
```

### System Requirements

- Podman 4.0+
- podman-compose (optional, if not using Go compose library)
- Container storage driver (overlay2 or overlay)

---

## Testing Strategy

### Unit Tests

- Compose parser (various valid/invalid inputs)
- Proxy security checks
- Secret encryption/decryption
- Path validation (file browser)

### Integration Tests

- Deploy simple container (nginx)
- Deploy from compose (multi-container stack)
- Volume persistence across container restart
- Network connectivity between containers
- Proxy web UI access
- Template save and deploy

### End-to-End Tests

- Full user workflow: import compose â†’ configure â†’ deploy â†’ access UI
- Container lifecycle: start â†’ stop â†’ restart â†’ remove
- Resource monitoring accuracy
- Log streaming reliability

### Security Tests

- Attempt to proxy external URL (should fail)
- Attempt to browse restricted paths (should fail)
- Verify secret masking in UI
- Verify secret encryption in database
- Test rate limiting on proxy endpoints

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Container list load | <500ms for 50 containers |
| Compose parse | <1s for 100-line file |
| Proxy latency | <50ms overhead |
| Log streaming | <100ms delay |
| Stats update | Real-time (1s refresh) |
| File browser | <1s for 1000 files |

---

## Documentation Requirements

### User Guide

- Getting started with containers
- Deploying your first container
- Working with compose files
- Managing secrets and environment variables
- Volume management best practices
- Troubleshooting common issues

### Developer Guide

- Podman integration architecture
- Adding new container management features
- Extending the proxy system
- Template format specification

### API Documentation

- OpenAPI/Swagger spec for all container endpoints
- WebSocket protocol documentation
- Proxy behavior and limitations

---

## Migration from Phase 1

Phase 2 is additive - no breaking changes to Phase 1:

- Existing system management features remain unchanged
- New "Container Manager" app appears in desktop
- New API endpoints under `/api/containers`, etc.
- Database schema additions (new tables)
- Optional: suggest Podman installation if not present

---

## Future Considerations (Phase 3+)

- Container orchestration (Docker Swarm-like)
- Auto-scaling based on metrics
- Container health monitoring and auto-restart
- Image build from Dockerfile
- Registry management (private registry)
- Container migration between nodes
- Backup scheduling for volumes
- Community template marketplace (optional)