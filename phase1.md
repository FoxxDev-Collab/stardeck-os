# Stardeck Phase 1 Implementation Plan

## Project Overview

**Name:** Stardeck (Star Deck OS)  
**Description:** Web-based server management desktop for enterprise Linux  
**Target OS:** Rocky Linux 10 (RHEL-compatible)  
**Aesthetic:** Cassette futurism / Starware-inspired interface

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (static export) + Custom Shadcn theme |
| Backend | Go + Echo framework |
| Database | SQLite (embedded) |
| Real-time | WebSockets |
| Deployment | Single binary with embedded frontend |

---

## Phase 1 Modules

### 1. Desktop Shell

The core interface - a web-based window manager.

- Draggable, resizable windows
- Window state (minimize, maximize, close)
- Z-index management (focus handling)
- App dock / launcher bar
- Desktop icons for system tools
- Session persistence (layout saved per user)

### 2. Authentication & User Management

Multi-user support with role-based access.

- Login screen with Starware aesthetic
- User accounts (create, edit, delete, disable)
- Roles: Admin, Operator, Viewer
- Password policy (complexity, expiration)
- Session management
  - Configurable timeout
  - Concurrent session limits
  - Active session list with revocation
- Secure password storage (Argon2)

### 3. System Resources

Real-time monitoring of server health.

- CPU usage (per-core and aggregate)
- Memory usage (used, cached, available)
- Disk I/O
- Network throughput (per interface)
- System uptime and load average
- WebSocket-driven updates (no polling)

### 4. Process Management

View and control running processes.

- Process list with columns (PID, user, CPU%, MEM%, command)
- Sort and filter
- Kill process (with confirmation)
- Process detail view

### 5. Service Management

Systemd service control.

- List all services (running, stopped, failed)
- Start / Stop / Restart / Enable / Disable
- Service status and logs (journalctl)
- Filter by state

### 6. Update Management

DNF package update interface.

- Check for available updates
- View update details (package, version, changelog)
- Apply selected updates
- Apply all updates
- Update progress with real-time output
- Update history log

### 7. Storage Overview

Disk and filesystem visibility.

- Physical disks and partitions
- Mount points with usage
- Filesystem type and options
- LVM overview (VGs, LVs) - read-only
- SMART status (if available)

---

## Data Models

### User
- ID, username, display name
- Password hash, salt
- Role
- Created, updated, last login
- Disabled flag

### Session
- ID, user ID
- Token hash
- Created, expires
- IP address, user agent

### Audit Log
- ID, timestamp
- User ID
- Action type
- Target (resource affected)
- Details (JSON)

---

## API Structure

```
/api
├── /auth
│   ├── POST /login
│   ├── POST /logout
│   └── POST /refresh
├── /users
│   ├── GET /
│   ├── POST /
│   ├── GET /:id
│   ├── PUT /:id
│   └── DELETE /:id
├── /system
│   ├── GET /resources (WebSocket upgrade)
│   ├── GET /info
│   └── POST /reboot
├── /processes
│   ├── GET /
│   └── DELETE /:pid
├── /services
│   ├── GET /
│   ├── GET /:name
│   └── POST /:name/:action
├── /updates
│   ├── GET /available
│   ├── POST /apply
│   └── GET /history
└── /storage
    ├── GET /disks
    ├── GET /mounts
    └── GET /lvm
```

---

## Frontend Structure

```
/app
├── /login
├── /desktop
│   ├── Shell (window manager)
│   ├── Dock (app launcher)
│   └── Desktop (icon grid)
└── /apps (window contents)
    ├── /system-monitor
    ├── /user-manager
    ├── /process-manager
    ├── /service-manager
    ├── /update-manager
    └── /storage-viewer
```

---

## Security Requirements

- TLS only (HTTPS enforced)
- Secure cookie flags (HttpOnly, Secure, SameSite)
- CSRF protection
- Rate limiting on auth endpoints
- Input validation on all endpoints
- Audit logging for all state-changing actions
- SELinux context for binary and data paths
- Firewalld service definition

---

## Deployment

### Install Script Responsibilities

1. Check prerequisites (Rocky Linux 10, root)
2. Create stardeck user and group
3. Create directories (/opt/stardeck, /var/lib/stardeck)
4. Download/copy binary
5. Generate self-signed TLS cert (or prompt for existing)
6. Initialize SQLite database
7. Create initial admin user (interactive)
8. Install systemd service
9. Configure firewalld
10. Start service

### File Layout

```
/opt/stardeck/
├── stardeck (binary)
└── certs/
    ├── server.crt
    └── server.key

/var/lib/stardeck/
├── stardeck.db (SQLite)
└── logs/
```

---

## Milestones

| Milestone | Deliverable |
|-----------|-------------|
| M1 | Project scaffolding, build pipeline, embedded static serving |
| M2 | Desktop shell (window manager, dock, layout persistence) |
| M3 | Auth system (login, sessions, user CRUD) |
| M4 | System resources (real-time monitoring) |
| M5 | Process manager |
| M6 | Service manager |
| M7 | Update manager |
| M8 | Storage viewer |
| M9 | Install script and packaging |
| M10 | Testing, hardening, documentation |

---

## Out of Scope (Phase 1)

- Container management (Phase 2)
- Multi-node clustering (Phase 3)
- OpenSCAP integration (Phase 4)
- VM management
- Network configuration
- Firewall rule management
