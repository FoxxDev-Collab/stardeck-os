# Stardeck OS - Development TODO

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

## In Progress

### Phase 2B: Container Management
- [ ] M2B.1: Podman integration (list, create, start, stop, remove)
- [ ] M2B.2: Container Manager UI (basic list and actions)
- [ ] M2B.3: Compose parser and validator
- [ ] M2B.4: Visual config editor (ports, volumes, env vars)
- [ ] M2B.5: Monaco code editor integration
- [ ] M2B.6: File browser component
- [ ] M2B.7: Environment variable manager with secrets
- [ ] M2B.8: Podman volume and network management
- [ ] M2B.9: Web UI proxy system
- [ ] M2B.10: Desktop icon integration
- [ ] M2B.11: Template system
- [ ] M2B.12: Real-time logs and stats
- [ ] M2B.13: Testing with complex multi-container apps
- [ ] M2B.14: Documentation and user guide

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
- [ ] Systemd service file
- [ ] RPM packaging
- [ ] Production build configuration
- [ ] Backup/restore utilities

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
