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
- [x] **NEW: Wheel/Root authorization middleware for user management**
- [x] **NEW: System user/group integration (useradd, usermod, groupadd, etc.)**
- [x] **NEW: Realm/Domain management system (LDAP/AD/OIDC/SAML hooks)**
- [x] **NEW: Group management with system group sync**
- [x] **NEW: Granular permissions system**
- [x] **NEW: User-group membership management**
- [x] **NEW: File Browser API (list, read, write, create, delete, rename, copy)**
- [x] **NEW: File upload/download endpoints (up to 100MB)**
- [x] **NEW: File permission management (chmod, chown)**

### Frontend
- [x] Login page with auth
- [x] Dashboard wired to real data
- [x] System Monitor wired to real data
- [x] Process Manager wired to real data
- [x] Service Manager wired to real data
- [x] Storage Viewer wired to real data
- [x] Update Manager wired to real data
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

## In Progress

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
