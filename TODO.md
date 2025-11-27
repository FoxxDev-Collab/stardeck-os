# Stardeck OS - Development TODO

---

## Build & Deployment Guide

### Prerequisites (Build Machine)
- Node.js 18+ and npm
- Go 1.21+
- Git

### Prerequisites (Target Server)
- Rocky Linux 10 (or compatible RHEL-based distro)
- Podman (for container management)
- Firewalld (optional, for automatic firewall config)

### Quick Build Commands

```bash
# Clean previous builds
make clean

# Full production build (frontend + backend)
make build

# Create deployment package
make package
# Creates: stardeck-<version>.tar.gz
```

### Development Mode

```bash
# Terminal 1: Frontend dev server (hot reload)
make dev-frontend
# Runs on http://localhost:3000

# Terminal 2: Backend dev server
make dev-backend
# Runs on http://localhost:8080

# Frontend proxies API requests to backend automatically
```

### Production Deployment

**Option 1: Manual Deploy**
```bash
# Transfer package to server
scp stardeck-*.tar.gz root@<server-ip>:/tmp/

# SSH to server and install
ssh root@<server-ip>
cd /tmp
tar -xzf stardeck-*.tar.gz
bash install.sh
```

**Option 2: Makefile Deploy**
```bash
make deploy VM=<server-ip> USER=root
```

### What the Install Script Does
1. Creates `/opt/stardeck/` (binary location)
2. Creates `/var/lib/stardeck/` (data, database, certs)
3. Installs systemd service (`stardeck.service`)
4. Opens firewall port 443
5. Enables and starts the service

### Post-Installation
- Access: `https://<server-ip>`
- Default login: `admin` / `admin`
- **Change the password immediately!**

### Service Management
```bash
systemctl status stardeck
systemctl restart stardeck
journalctl -u stardeck -f
```

### Important Notes
- The Go binary embeds the frontend at **compile time** via `go:embed`
- After any frontend changes, you **must rebuild the backend** for changes to take effect
- The version in the package name comes from `git describe --tags --always --dirty`
- Commit changes or create a tag for clean version names

### Directory Structure (Installed)
```
/opt/stardeck/
└── stardeckos          # Main binary

/var/lib/stardeck/
├── stardeck.db         # SQLite database
└── certs/              # TLS certificates (auto-generated)
```

---

## Completed

### Backend
- [x] Go + Echo server setup
- [x] SQLite database with migrations
- [x] User repository (CRUD)
- [x] Session management with token hashing
- [x] PAM authentication (Linux system users)
- [x] Local account authentication (Argon2id)
- [x] Auth middleware (RequireAuth, RequireRole, RequireWheelOrRoot)
- [x] System resources API (CPU, memory, disk, network, load avg)
- [x] Per-core CPU stats
- [x] Network I/O stats
- [x] Process listing API (list all processes from /proc)
- [x] Process kill API (send signals to processes)
- [x] Service listing API (systemctl list-units)
- [x] Service detail API (systemctl show)
- [x] Service control API (start/stop/restart/reload/enable/disable)
- [x] Storage disks API (lsblk)
- [x] Storage mounts API (df)
- [x] Storage LVM API (vgs/lvs/pvs)
- [x] Package updates available API (dnf check-update)
- [x] Package update apply API (dnf update)
- [x] Package update history API (dnf history)
- [x] **NEW: Repository management (add/edit/delete DNF repos)**
- [x] **NEW: Package search API (dnf search)**
- [x] **NEW: Package installation API (dnf install)**
- [x] **NEW: Package removal API (dnf remove)**
- [x] **NEW: Metadata refresh API (dnf makecache)**
- [x] **NEW: Wheel/Root authorization middleware for user management**
- [x] **NEW: System user/group integration (useradd, usermod, groupadd, etc.)**
- [x] **NEW: Realm/Domain management system (LDAP/AD/OIDC/SAML hooks)**
- [x] **NEW: Group management with system group sync**
- [x] **NEW: Granular permissions system**
- [x] **NEW: User-group membership management**
- [x] **NEW: File Browser API (list, read, write, create, delete, rename, copy)**
- [x] **NEW: File upload/download endpoints (up to 100MB)**
- [x] **NEW: File permission management (chmod, chown)**
- [x] **NEW: Storage partition management API (create, format, delete partitions)**
- [x] **NEW: Storage mount/unmount API**
- [x] **NEW: Device validation for secure storage operations**

### Frontend
- [x] Login page with auth
- [x] Dashboard wired to real data
- [x] System Monitor wired to real data
- [x] Process Manager wired to real data
- [x] Service Manager wired to real data
- [x] Storage Manager wired to real data (upgraded from Storage Viewer)
- [x] RPM Manager wired to real data (renamed from Update Manager)
- [x] User Manager wired to real data
- [x] All ESLint errors fixed
- [x] Production build successful
- [x] **NEW: Group Manager UI (Stardeck & System groups)**
- [x] **NEW: Realm Manager UI (multi-realm authentication)**
- [x] **NEW: Desktop-style dashboard with app icons**
- [x] **NEW: System Tray (CPU, RAM, Disk stats in top bar)**
- [x] **NEW: Settings page (taskbar position, tray config, theme, desktop)**
- [x] **NEW: Colored icons with toggle in settings**
- [x] **NEW: File Browser UI (breadcrumb nav, context menus, dialogs)**
- [x] **NEW: RPM Manager UI (3 tabs: Updates/Packages/Repositories)**
- [x] **NEW: Repository CRUD interface**
- [x] **NEW: Package search and installation UI**
- [x] **NEW: Selective package update interface**
- [x] **NEW: Storage Manager UI with partition management (create, format, delete)**
- [x] **NEW: Mount/unmount controls for filesystems**
- [x] **NEW: LVM volume groups and logical volumes display**

### Phase 2A: Network Manager (Completed)
- [x] M2A.1: Network interfaces API (list, details, stats)
- [x] M2A.2: Firewall API (zones, rules, services, ports via firewalld)
- [x] M2A.3: Routes and DNS API
- [x] M2A.4: Network Manager UI (interfaces tab)
- [x] M2A.5: Firewall UI (zones, rules editor)
- [x] M2A.6: Routes and connections UI

### Phase 2B: Container Management (Completed)
- [x] M2B.1: Podman integration (list, create, start, stop, remove, inspect)
- [x] M2B.2: Container Manager UI (5-tab interface: Containers, Images, Volumes, Networks, Stacks)
- [x] M2B.3: Compose parser and validator (YAML-based stacks)
- [x] M2B.4: Visual config editor (dedicated container creation page with ports, volumes, env vars)
- [x] M2B.5: Monaco code editor integration (YAML editor for stacks)
- [x] M2B.6: Docker Hub image search and browse
- [x] M2B.7: Environment variable manager with .env import/export
- [x] M2B.8: Podman volume and network management (enhanced with full volume type support, storage location config)
- [x] M2B.9: Port usage tracking (shows which containers use which ports)
- [x] M2B.10: Enhanced port selector with common presets and conflict detection
- [x] M2B.11: Container stats charts (CPU, memory, network I/O with sparklines)
- [x] M2B.12: Real-time logs with search, filtering, and download
- [x] M2B.13: Container terminal (WebSocket-based shell access)
- [x] M2B.14: Image browser (pull, search, delete images)
- [x] M2B.15: Stack deployment (create, deploy, start, stop, delete compose stacks)
- [x] M2B.16: Web UI proxy system (iframe containers with web interfaces)
- [x] M2B.17: Desktop icon integration (add running containers to desktop)
- [x] M2B.18: Container template system (save/load container configurations)
- [x] M2B.19: Adopt container feature (bring existing containers into Stardeck)
- [x] M2B.20: Rootful/rootless Podman auto-detection
- [x] M2B.21: Admin-only container control (start/stop/restart restricted)
- [ ] M2B.22: Testing with complex multi-container apps
- [ ] M2B.23: Documentation and user guide

---

### Troubleshooting Required

#### Background Image Upload (Settings Page)
**Issue**: Background image upload returns 400 error
**Status**: Code fix implemented but not yet verified working

**Root Cause Identified**:
1. Original code used wrong path `/backgrounds` (web users restricted to `/home/<username>/`)
2. Original code passed path as query param instead of form data

**Fixes Applied** (in `app/settings/page.tsx`):
- Changed path to `/home/${user.username}/backgrounds`
- Path sent as form data via `formData.append("path", backgroundsPath)`
- Directory auto-created via `/api/files/mkdir` before upload
- Added uploaded backgrounds gallery for easy selection

**Verification Steps**:
1. Rebuild frontend: `cd stardeckos-frontend && npm run build`
2. Copy to backend: `cp -r out/* ../stardeckos-backend/frontend_dist/`
3. **CRITICAL**: Rebuild Go backend to embed new frontend: `cd stardeckos-backend && go build -mod=vendor -o stardeckos .`
4. Restart the stardeckos service/process
5. Test upload - server logs should show `POST /api/files/upload` (no query param)

**Note**: The Go binary uses `go:embed` to embed frontend files at compile time. Simply rebuilding the frontend is NOT enough - the backend must also be recompiled.

---

### Backend Features
- [ ] LDAP/AD integration implementation (hooks ready, needs connector)
- [ ] OIDC/SAML integration implementation (hooks ready, needs connector)
- [ ] Permission-based access control (models ready, needs enforcement layer)

### Frontend Enhancements
- [ ] Error handling improvements
- [ ] Real-time data refresh indicators
- [ ] User-to-group assignment UI in User Manager
- [ ] Permission assignment UI in Group Manager
- [ ] Theme color customization (UI ready, needs CSS variable integration)

## Planned

### Backend Features
- [ ] Audit logging (tables exist, needs implementation)
- [ ] Role-to-permission mapping
- [ ] LDAP directory sync service
- [ ] Active Directory integration
- [ ] OIDC provider integration (Keycloak, Auth0, etc.)
- [ ] SAML 2.0 provider integration

### Frontend Features
- [x] Settings page (completed)
- [x] Theme persistence via localStorage (completed)
- [ ] Session management UI
- [ ] Audit log viewer
- [ ] Permission matrix editor
- [ ] Realm configuration wizard
- [ ] LDAP connection tester
- [ ] Group membership bulk import
- [ ] File editor (edit files in browser with syntax highlighting)

### Security
- [ ] Rate limiting on login
- [ ] CSRF protection
- [ ] Session timeout configuration
- [ ] Multi-factor authentication (MFA)
- [ ] API key management for service accounts

### DevOps
- [x] Systemd service file (`scripts/stardeck.service`)
- [x] Production build configuration (Makefile with build/package/deploy)
- [x] Install script (`scripts/install.sh`)
- [x] TLS certificate auto-generation
- [ ] RPM packaging (.spec file)
- [ ] Backup/restore utilities
- [ ] Prometheus metrics endpoint

---

## Architecture Notes

### User Management Authorization
**IMPORTANT**: Only users in the `wheel` group (or `sudo` group on Debian-based systems) and the `root` user can manage users, groups, and realms. This is enforced via the `RequireWheelOrRoot` middleware which:
- For PAM users: Checks actual Linux group membership via `getent` and system calls
- For local users: Requires `admin` role
- Applies to all `/api/users`, `/api/groups`, and `/api/realms` endpoints

### Realm Management System
The realm system supports multi-tenant authentication with the following realm types:
- **local**: Stardeck internal users (SQLite-backed)
- **pam**: Linux PAM integration (system users)
- **ldap**: LDAP/Active Directory (hooks ready)
- **oidc**: OpenID Connect (hooks ready)
- **saml**: SAML 2.0 (hooks ready)

Each realm can have its own configuration for auto-provisioning, group sync, and default roles.

### Granular Permissions
Permission system is in place with categories:
- `users.*` - User management permissions
- `groups.*` - Group management permissions
- `realms.*` - Realm management permissions
- `services.*` - Service control permissions
- `processes.*` - Process management permissions
- `system.*` - System operations permissions
- `updates.*` - Update management permissions

Groups can be assigned permissions, and users inherit permissions from their groups. This provides flexibility beyond simple role-based access control.

### System Integration
- Groups can be synced to Linux system groups (with GID tracking)
- Users can be created as both Stardeck users and Linux system users simultaneously
- PAM authentication validates against actual system credentials
- All system operations require proper sudo/wheel privileges

### RPM Manager
The RPM Manager provides comprehensive package management capabilities:
- **Updates Tab**: View available updates with security badges, selective update installation, metadata refresh
- **Packages Tab**: Search packages across repositories, multi-select installation, package details
- **Repositories Tab**: Full CRUD for DNF repository configuration (/etc/yum.repos.d/)
- All repository and package operations require wheel/root privileges
- Supports baseurl, mirrorlist, metalink repository configurations
- GPG key management and repository enable/disable

### Storage Manager
The Storage Manager provides disk and partition management capabilities:
- **Physical Disks**: View all block devices with model, size, type (SSD/HDD)
- **Partitions**: Create, format (ext4, xfs, swap, vfat), and delete partitions
- **Mount Points**: View mounted filesystems with usage bars, mount/unmount controls
- **LVM**: Display volume groups, logical volumes, and physical volumes
- All partition operations require admin/operator role
- Device validation prevents operations on invalid or dangerous paths
- Protected mounts (/, /boot) cannot be unmounted from UI

### Container Manager (Phase 2B - In Progress)
The Container Manager provides comprehensive Podman container orchestration:

**Backend Features**:
- **Podman Integration**: Full container lifecycle management (list, create, start, stop, restart, pause, unpause, remove)
- **Container Inspection**: Detailed container metadata and runtime information
- **Image Management**: Pull, list, and remove container images
- **Volume Management**:
    - Create, list, and remove Podman volumes
    - Bind mounts aggregation API (view all bind mounts across containers)
    - Full support for both Podman volumes and bind mounts in container creation
- **Network Management**: List Podman networks and connections
- **Stack Management**: Docker Compose/Podman Compose file deployment
- **WebSocket Terminals**: Real-time shell access to running containers
- **Streaming Logs**: Live container log streaming with search and filtering
- **Port Tracking**: API endpoint to query which containers use which ports
- **Docker Hub Proxy**: Backend proxy for Docker Hub image searches (avoids CORS)

**Frontend Features**:
- **5-Tab Interface**:
  - **Containers**: List all containers with status, stats, and quick actions
  - **Images**: Browse images with pull/delete capabilities, Docker Hub search
  - **Volumes**: Two-section view with Bind Mounts and Podman Volumes, create volume dialog
  - **Networks**: View network configurations
  - **Stacks**: Deploy and manage multi-container applications via compose files

- **Elite Components**:
  - **ContainerStatsChart**: Real-time CPU/memory/network monitoring with sparklines and trend indicators
  - **ContainerTerminal**: WebSocket-based shell with full terminal emulation
  - **ContainerLogs**: Streaming logs with search, filter by level (error/warn/info), download capability
  - **ImageBrowser**: Search Docker Hub, pull images, view local image repository
  - **StacksTab**: YAML editor for compose files with deployment streaming

- **Enhanced Container Creation** (Dedicated Page):
  - **Docker Hub Integration**: Live search and browse Docker Hub images with star counts, pull counts, official/automated badges
  - **Port Management**: 
    - Common port presets (HTTP, HTTPS, databases)
    - Real-time port conflict detection
    - Hover tooltips showing which container uses each port
    - Visual indicators for ports already in use
  - **Volume Management**:
    - Volume type selector (Podman Volume vs Bind Mount)
    - Podman volumes (recommended): managed storage with better isolation and portability
    - Bind mounts: direct host directory access for config files or shared data
    - Dropdown to select from existing volumes
    - Auto-creation of named volumes during container deployment
    - Read-only mount option
  - **Environment Variables**: Add individually or import/export .env files
  - **Advanced Settings**: CPU/memory limits, custom commands, entrypoints, working directory, user, hostname
  - **5-Tab Configuration**: Basic, Ports, Volumes, Environment, Advanced

- **Reusable Components**:
  - **PortSelector**: Intelligent port mapping with usage tracking and conflict warnings
  - Extensible for use in other parts of the application

**Container Features**:
- System user authentication required (not web-only users)
- Admin role required for create/delete operations
- Operator+ role for start/stop/restart operations
- All system users can view containers and stats
- Container metadata enrichment from SQLite database (web UI flags, custom icons)
- **Storage Configuration**: Admin can configure Podman's storage location (graphroot) for using alternate drives

**Completed Recently**:
- Web UI proxy system (iframe integration for containerized web apps)
- Desktop icon integration (add containers as desktop shortcuts)
- Container template system (save/load common configurations)
- Adopt container feature (bring existing Podman containers into Stardeck)
- Rootful/rootless Podman auto-detection
- Admin-only container control enforcement

**Remaining Tasks**:
- Multi-container application testing and optimization
- Container backup/export functionality

