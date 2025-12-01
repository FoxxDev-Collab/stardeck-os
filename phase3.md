# Stardeck Phase 3 Implementation Plan

## Overview

**Focus:** Identity Federation (Starfleet Alliance) + Integrated Office Suite
**Goal:** Complete the desktop experience with SSO and productivity applications
**Principle:** One-click deployment of authenticated, collaborative workspaces

---

## Phase 3A: Starfleet Alliance (Identity Federation)

### Concept

Starfleet Alliance is Stardeck's identity federation system. It enables:
- Single Sign-On (SSO) across all deployed applications
- Centralized user management
- Secure authentication via industry standards (OIDC, SAML, LDAP)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      STARFLEET ALLIANCE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐        ┌──────────────────┐                  │
│  │   Stardeck   │◄──────►│ Identity Provider │                  │
│  │   Gateway    │  OIDC  │ (Authentik/       │                  │
│  │              │  SAML  │  Keycloak/LDAP)   │                  │
│  └──────┬───────┘  LDAP  └──────────────────┘                  │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────┐                   │
│  │         Auth Proxy Layer                 │                   │
│  │  • Validates sessions                    │                   │
│  │  • Injects identity headers              │                   │
│  │  • Manages app authentication            │                   │
│  └─────────────────────────────────────────┘                   │
│         │                                                       │
│    ┌────┴────┬─────────┬─────────┬─────────┐                   │
│    ▼         ▼         ▼         ▼         ▼                   │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│ │Crypt │ │Gitea │ │Graf- │ │Jelly │ │ App  │                  │
│ │ Pad  │ │      │ │ ana  │ │ fin  │ │  N   │                  │
│ │ OIDC │ │Header│ │Header│ │Tier1 │ │ ...  │                  │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Identity Provider Options

#### Option 1: Deploy New IdP (Recommended for New Users)

Stardeck can deploy and manage an identity provider:

| Provider | Pros | Cons | Recommended For |
|----------|------|------|-----------------|
| **Authentik** | Modern UI, OIDC/SAML/LDAP, lightweight | Newer project | Most users |
| **Keycloak** | Battle-tested, enterprise features | Heavier (Java) | Enterprise |

#### Option 2: Connect to Existing IdP

For users with existing infrastructure:

| Protocol | Providers | Use Case |
|----------|-----------|----------|
| **OIDC** | Authentik, Keycloak, Auth0, Okta, Azure AD | Modern apps |
| **SAML 2.0** | ADFS, Okta, OneLogin | Enterprise legacy |
| **LDAP** | Active Directory, OpenLDAP, FreeIPA | Traditional enterprise |

### SSO Tier System

Applications receive authentication at different levels based on their capabilities:

#### Tier 1: Forward Auth (Universal)
- Stardeck proxy validates session before forwarding request
- Works with ANY application, zero configuration
- App is unaware of authentication
- **Use case:** Apps with no SSO support (Jellyfin, etc.)

#### Tier 2: Trusted Headers (Enhanced)
- Proxy injects identity headers after authentication:
  - `X-Remote-User`: Username
  - `X-Remote-Email`: Email address
  - `X-Remote-Groups`: Comma-separated group list
  - `X-Remote-Name`: Display name
- App trusts proxy to have authenticated user
- **Use case:** Apps with header auth support (Gitea, Grafana, etc.)

#### Tier 3: Native OIDC (Full Integration)
- App registered as OIDC client in IdP
- Full OAuth2/OIDC flow with tokens
- User context, groups, and permissions flow through
- **Use case:** Apps with native OIDC (CryptPad, Nextcloud, etc.)

#### Tier 4: LDAP Backend
- App queries IdP's LDAP interface
- Traditional username/password auth against IdP
- **Use case:** Legacy apps requiring LDAP

### App Compatibility Database

Stardeck maintains a database of known applications and their SSO capabilities:

```yaml
# /internal/alliance/apps.yaml
apps:
  cryptpad:
    name: "CryptPad"
    sso_tiers: [3, 2, 1]  # Preferred order
    tier3_oidc:
      config_path: "/cryptpad/config/config.js"
      env_vars:
        - CPAD_OIDC_ENABLED=true
        - CPAD_OIDC_ISSUER=${ALLIANCE_ISSUER_URL}
        - CPAD_OIDC_CLIENT_ID=${ALLIANCE_CLIENT_ID}
        - CPAD_OIDC_CLIENT_SECRET=${ALLIANCE_CLIENT_SECRET}
      callback_path: "/api/v2/openid/callback"
    tier2_headers:
      env_vars:
        - CPAD_TRUST_PROXY=true
      headers:
        user: "X-Remote-User"
        email: "X-Remote-Email"

  gitea:
    name: "Gitea"
    sso_tiers: [3, 2, 1]
    tier3_oidc:
      env_vars:
        - GITEA__oauth2__ENABLED=true
        - GITEA__oauth2__JWT_SECRET=${ALLIANCE_CLIENT_SECRET}
      callback_path: "/user/oauth2/${ALLIANCE_PROVIDER}/callback"
    tier2_headers:
      env_vars:
        - GITEA__service__ENABLE_REVERSE_PROXY_AUTHENTICATION=true
        - GITEA__service__REVERSE_PROXY_AUTHENTICATION_USER=X-Remote-User
        - GITEA__service__REVERSE_PROXY_AUTHENTICATION_EMAIL=X-Remote-Email

  grafana:
    name: "Grafana"
    sso_tiers: [3, 2, 1]
    tier3_oidc:
      env_vars:
        - GF_AUTH_GENERIC_OAUTH_ENABLED=true
        - GF_AUTH_GENERIC_OAUTH_CLIENT_ID=${ALLIANCE_CLIENT_ID}
        - GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET=${ALLIANCE_CLIENT_SECRET}
        - GF_AUTH_GENERIC_OAUTH_AUTH_URL=${ALLIANCE_ISSUER_URL}/authorize
        - GF_AUTH_GENERIC_OAUTH_TOKEN_URL=${ALLIANCE_ISSUER_URL}/token
        - GF_AUTH_GENERIC_OAUTH_API_URL=${ALLIANCE_ISSUER_URL}/userinfo
    tier2_headers:
      env_vars:
        - GF_AUTH_PROXY_ENABLED=true
        - GF_AUTH_PROXY_HEADER_NAME=X-Remote-User
        - GF_AUTH_PROXY_HEADER_PROPERTY=username
        - GF_AUTH_PROXY_AUTO_SIGN_UP=true

  jellyfin:
    name: "Jellyfin"
    sso_tiers: [1]  # No native SSO support
    tier1_forward_auth:
      note: "Forward auth only - Jellyfin has no native SSO"
      plugin_available: "jellyfin-plugin-sso (community)"

  nextcloud:
    name: "Nextcloud"
    sso_tiers: [3, 4, 2, 1]
    tier3_oidc:
      post_deploy_commands:
        - "occ app:enable user_oidc"
        - "occ config:app:set user_oidc..."
    tier4_ldap:
      post_deploy_commands:
        - "occ app:enable user_ldap"
        - "occ ldap:create-empty-config"

  # Default for unknown apps
  _default:
    sso_tiers: [1]
    tier1_forward_auth:
      enabled: true
```

### API Structure

```
/api/alliance
├── /status                     # Alliance status (enabled, provider info)
├── /providers
│   ├── GET /                   # List configured providers
│   ├── POST /                  # Add provider (OIDC/SAML/LDAP config)
│   ├── GET /:id                # Provider details
│   ├── PUT /:id                # Update provider
│   ├── DELETE /:id             # Remove provider
│   └── POST /:id/test          # Test connection
├── /clients
│   ├── GET /                   # List registered app clients
│   ├── POST /                  # Register new client (for app)
│   ├── GET /:id                # Client details
│   ├── PUT /:id                # Update client
│   └── DELETE /:id             # Remove client
├── /users
│   ├── GET /                   # List federated users
│   ├── POST /sync              # Sync users from IdP
│   └── GET /:id                # User details + group memberships
├── /groups
│   ├── GET /                   # List federated groups
│   └── POST /sync              # Sync groups from IdP
└── /deploy
    ├── POST /authentik         # Deploy Authentik container
    ├── POST /keycloak          # Deploy Keycloak container
    └── GET /templates          # Get IdP deployment templates
```

### Permission Matrix

| Endpoint | Viewer | Operator | Admin |
|----------|--------|----------|-------|
| GET /alliance/status | ✓ | ✓ | ✓ |
| GET /alliance/providers | ✓ | ✓ | ✓ |
| POST/PUT/DELETE /alliance/providers | ✗ | ✗ | ✓ |
| GET /alliance/clients | ✓ | ✓ | ✓ |
| POST/PUT/DELETE /alliance/clients | ✗ | ✗ | ✓ |
| GET /alliance/users | ✓ | ✓ | ✓ |
| POST /alliance/users/sync | ✗ | ✓ | ✓ |
| POST /alliance/deploy/* | ✗ | ✗ | ✓ |

### Database Schema

```sql
-- Identity Providers
CREATE TABLE alliance_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'oidc', 'saml', 'ldap'
    enabled INTEGER DEFAULT 1,
    is_managed INTEGER DEFAULT 0,  -- Deployed by Stardeck
    container_id TEXT REFERENCES containers(id),  -- If managed
    config TEXT NOT NULL,  -- JSON: endpoints, credentials, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OIDC/SAML Clients (apps registered with IdP)
CREATE TABLE alliance_clients (
    id TEXT PRIMARY KEY,
    provider_id TEXT REFERENCES alliance_providers(id),
    container_id TEXT REFERENCES containers(id),  -- App container
    client_id TEXT NOT NULL,
    client_secret TEXT,  -- Encrypted
    redirect_uris TEXT,  -- JSON array
    scopes TEXT,  -- JSON array
    sso_tier INTEGER DEFAULT 1,
    config TEXT,  -- JSON: app-specific SSO config
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Federated Users (synced from IdP)
CREATE TABLE alliance_users (
    id TEXT PRIMARY KEY,
    provider_id TEXT REFERENCES alliance_providers(id),
    external_id TEXT NOT NULL,  -- ID in IdP
    username TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    groups TEXT,  -- JSON array of group names
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, external_id)
);

-- Federated Groups
CREATE TABLE alliance_groups (
    id TEXT PRIMARY KEY,
    provider_id TEXT REFERENCES alliance_providers(id),
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, external_id)
);
```

### Frontend Structure

```
/app/alliance/
├── page.tsx                    # Starfleet Alliance dashboard
├── setup/
│   └── page.tsx               # Setup wizard
├── providers/
│   ├── page.tsx               # Provider management
│   └── [id]/
│       └── page.tsx           # Provider details/config
├── clients/
│   └── page.tsx               # App client management
├── users/
│   └── page.tsx               # Federated users view
└── components/
    ├── AllianceStatus.tsx     # Status card
    ├── ProviderCard.tsx       # Provider display
    ├── ProviderWizard.tsx     # Add provider wizard
    ├── DeployIdPWizard.tsx    # Deploy Authentik/Keycloak
    ├── ClientList.tsx         # Registered clients
    ├── ClientConfig.tsx       # Client SSO configuration
    ├── UserSync.tsx           # User sync controls
    └── SSOTierBadge.tsx       # Visual tier indicator
```

### Setup Wizard Flow

```
┌─────────────────────────────────────────────────────────────┐
│              STARFLEET ALLIANCE SETUP                       │
│                                                             │
│  Welcome to Starfleet Alliance! This wizard will help you   │
│  set up Single Sign-On for your Stardeck applications.      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  How would you like to proceed?                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ◉ Deploy a new Identity Provider                     │   │
│  │   Stardeck will install and configure an IdP for you │   │
│  │   • Authentik (Recommended)                          │   │
│  │   • Keycloak                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ○ Connect to existing Identity Provider              │   │
│  │   Use your existing authentication infrastructure    │   │
│  │   • OIDC (OpenID Connect)                           │   │
│  │   • SAML 2.0                                        │   │
│  │   • LDAP / Active Directory                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ○ Skip for now                                       │   │
│  │   Continue using local authentication only           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                              [Continue →]                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 3B: Stardeck Office (CryptPad Integration)

### Concept

CryptPad is Stardeck's official office suite. It provides:
- End-to-end encrypted documents, spreadsheets, presentations
- Real-time collaboration
- Zero-knowledge architecture (server cannot read documents)
- Lightweight and fast

### CryptPad Features

| Application | Purpose | Icon |
|-------------|---------|------|
| Rich Text | Documents, reports | 📄 |
| Sheet | Spreadsheets | 📊 |
| Slide | Presentations | 📽️ |
| Code | Programming, Markdown | 💻 |
| Kanban | Project boards | 📋 |
| Whiteboard | Diagrams, drawing | 🖼️ |
| Form | Surveys, registration | 📝 |
| Poll | Quick votes | 🗳️ |

### Deployment Stack

```yaml
# Stardeck Office Stack (CryptPad)
version: "3.8"

services:
  cryptpad:
    image: cryptpad/cryptpad:latest
    container_name: stardeck-office
    environment:
      - CPAD_MAIN_DOMAIN=${STARDECK_DOMAIN}
      - CPAD_SANDBOX_DOMAIN=sandbox.${STARDECK_DOMAIN}
      - CPAD_HTTP_UNSAFE_ORIGIN=true  # Handled by Stardeck proxy
      - CPAD_ADMIN_EMAIL=${ADMIN_EMAIL}
      # SSO (when Alliance enabled)
      - CPAD_OIDC_ENABLED=${ALLIANCE_ENABLED:-false}
      - CPAD_OIDC_ISSUER=${ALLIANCE_ISSUER_URL:-}
      - CPAD_OIDC_CLIENT_ID=${ALLIANCE_CLIENT_ID:-}
      - CPAD_OIDC_CLIENT_SECRET=${ALLIANCE_CLIENT_SECRET:-}
    volumes:
      - cryptpad_blob:/cryptpad/blob
      - cryptpad_block:/cryptpad/block
      - cryptpad_data:/cryptpad/data
      - cryptpad_datastore:/cryptpad/datastore
      - cryptpad_config:/cryptpad/config
    ports:
      - "127.0.0.1:3001:3000"
    restart: unless-stopped
    labels:
      - "stardeck.app=office"
      - "stardeck.name=Stardeck Office"
      - "stardeck.icon=file-text"
      - "stardeck.webui=true"
      - "stardeck.webui.port=3000"
      - "stardeck.alliance.tier=3"
      - "stardeck.alliance.oidc=true"

volumes:
  cryptpad_blob:
  cryptpad_block:
  cryptpad_data:
  cryptpad_datastore:
  cryptpad_config:
```

### Desktop Integration

When CryptPad is deployed, Stardeck creates desktop shortcuts:

```typescript
// Desktop icons for CryptPad applications
const cryptpadApps = [
  {
    id: "office-docs",
    icon: <FileText className="w-8 h-8" />,
    label: "Documents",
    href: "/proxy/stardeck-office/pad/",
    description: "Rich text documents",
    color: "text-blue-500",
  },
  {
    id: "office-sheets",
    icon: <Table className="w-8 h-8" />,
    label: "Spreadsheets",
    href: "/proxy/stardeck-office/sheet/",
    description: "Spreadsheets and data",
    color: "text-green-500",
  },
  {
    id: "office-slides",
    icon: <Presentation className="w-8 h-8" />,
    label: "Presentations",
    href: "/proxy/stardeck-office/slide/",
    description: "Slide presentations",
    color: "text-orange-500",
  },
  {
    id: "office-kanban",
    icon: <Kanban className="w-8 h-8" />,
    label: "Kanban",
    href: "/proxy/stardeck-office/kanban/",
    description: "Project boards",
    color: "text-purple-500",
  },
  {
    id: "office-drive",
    icon: <FolderOpen className="w-8 h-8" />,
    label: "CryptDrive",
    href: "/proxy/stardeck-office/drive/",
    description: "All your files",
    color: "text-amber-500",
  },
];
```

### One-Click Install Flow

```
┌─────────────────────────────────────────────────────────────┐
│              INSTALL STARDECK OFFICE                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  📄 📊 📽️ 💻 📋 🖼️                                    │ │
│  │                                                       │ │
│  │  Stardeck Office (powered by CryptPad)               │ │
│  │                                                       │ │
│  │  End-to-end encrypted collaboration suite:           │ │
│  │  • Documents, Spreadsheets, Presentations            │ │
│  │  • Kanban boards, Whiteboards, Forms                 │ │
│  │  • Real-time collaboration                           │ │
│  │  • Zero-knowledge encryption                         │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Configuration:                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Admin Email: [admin@example.com          ]            │ │
│  │                                                       │ │
│  │ ☑ Enable Starfleet Alliance SSO                      │ │
│  │   Users will log in with their Alliance credentials   │ │
│  │                                                       │ │
│  │ Storage Location: [/var/lib/stardeck/office    ] [📁]│ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Requirements: ~512MB RAM, ~1GB disk                        │
│                                                             │
│              [Cancel]              [Install →]              │
└─────────────────────────────────────────────────────────────┘
```

### API Endpoints

```
/api/office
├── GET /status                 # Office suite status
├── POST /install               # Install CryptPad
├── POST /uninstall             # Remove CryptPad
├── GET /config                 # Get configuration
├── PUT /config                 # Update configuration
└── POST /backup                # Backup office data
```

---

## Phase 3C: App Bundles (Future Enhancement)

Pre-configured application bundles for common use cases:

### Collaboration Bundle
- CryptPad (Office)
- Element (Chat/Video via Matrix)
- Outline or BookStack (Wiki/Documentation)

### Developer Bundle
- Gitea (Git hosting)
- Drone CI (CI/CD)
- Registry (Container registry)

### Media Bundle
- Jellyfin (Media server)
- Sonarr/Radarr (Media management)
- Transmission (Downloads)

### Monitoring Bundle
- Grafana (Dashboards)
- Prometheus (Metrics)
- Loki (Logs)

*Note: Bundles are Phase 3C scope, not initial Phase 3 delivery.*

---

## Implementation Milestones

| Milestone | Deliverable |
|-----------|-------------|
| **Phase 3A: Starfleet Alliance** |
| M3A.1 | Alliance database schema and models |
| M3A.2 | OIDC client library integration |
| M3A.3 | Provider management API (CRUD) |
| M3A.4 | Deploy IdP feature (Authentik stack) |
| M3A.5 | Auth proxy middleware (header injection) |
| M3A.6 | App compatibility database |
| M3A.7 | Client registration API |
| M3A.8 | User/group sync from IdP |
| M3A.9 | Alliance setup wizard UI |
| M3A.10 | Provider configuration UI |
| M3A.11 | Client management UI |
| M3A.12 | SSO tier auto-configuration |
| **Phase 3B: Stardeck Office** |
| M3B.1 | CryptPad stack template |
| M3B.2 | Office install/uninstall API |
| M3B.3 | Desktop icon integration |
| M3B.4 | Alliance SSO integration |
| M3B.5 | Office install wizard UI |
| M3B.6 | Proxy configuration for CryptPad |
| M3B.7 | Backup/restore functionality |

---

## Dependencies

### Go Packages

```
github.com/coreos/go-oidc/v3    # OIDC client
golang.org/x/oauth2             # OAuth2 flows
github.com/go-ldap/ldap/v3      # LDAP client
github.com/crewjam/saml         # SAML support (optional)
```

### Frontend Packages

```
# Existing packages should suffice
# Monaco editor already installed for YAML editing
```

### System Requirements

For Authentik deployment:
- 2GB+ RAM available
- PostgreSQL container (bundled)
- Redis container (bundled)

For CryptPad:
- 512MB RAM
- 1GB+ disk space

---

## Security Considerations

### Token Security
- All tokens encrypted at rest
- Client secrets never logged
- Secure token refresh flows

### Proxy Security
- Header injection only after auth validation
- Prevent header spoofing from clients
- Rate limiting on auth endpoints

### IdP Communication
- TLS required for all IdP communication
- Certificate validation
- Secure redirect URI validation

---

## Testing Strategy

### Unit Tests
- OIDC flow handling
- Token encryption/decryption
- Header injection logic
- App compatibility matching

### Integration Tests
- Full OIDC flow with test IdP
- Authentik deployment and configuration
- CryptPad deployment with SSO
- User sync from LDAP

### End-to-End Tests
- Setup wizard completion
- Deploy IdP → Configure → Login flow
- App deployment with auto-SSO
- Multi-app SSO session sharing

---

## Migration Notes

Phase 3 is additive - no breaking changes to Phase 1/2:

- Existing auth system remains functional
- Alliance is optional (can skip setup)
- Containers without SSO continue working
- New menu items:
  - "Starfleet Alliance" in Server Management
  - "Office" on desktop (when installed)
- Database migrations add new tables only
