package templates

import (
	"encoding/json"
)

// BuiltInTemplate represents a pre-configured stack template
type BuiltInTemplate struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	Category       string            `json:"category"`       // "office", "auth", "monitoring", "dev", "media"
	Icon           string            `json:"icon"`           // Lucide icon name
	ComposeContent string            `json:"compose_content"`
	EnvDefaults    map[string]string `json:"env_defaults"`
	EnvDescriptions map[string]string `json:"env_descriptions"` // Help text for each env var
	RequiredEnvVars []string         `json:"required_env_vars"`
	VolumePaths    map[string]string `json:"volume_paths"`     // Default volume paths
	WebUI          *WebUIConfig      `json:"web_ui,omitempty"`
	AllianceSSO    *SSOConfig        `json:"alliance_sso,omitempty"`
	Requirements   *Requirements     `json:"requirements,omitempty"`
	Tags           []string          `json:"tags"`
}

// WebUIConfig describes the web UI for a template
type WebUIConfig struct {
	Port     int    `json:"port"`
	Path     string `json:"path"`
	Protocol string `json:"protocol"` // http or https
}

// SSOConfig describes SSO integration capabilities
type SSOConfig struct {
	SupportedTiers []int  `json:"supported_tiers"` // 1=forward, 2=headers, 3=oidc, 4=ldap
	OIDCCallback   string `json:"oidc_callback,omitempty"`
	OIDCEnvVars    map[string]string `json:"oidc_env_vars,omitempty"`
	HeaderEnvVars  map[string]string `json:"header_env_vars,omitempty"`
}

// Requirements describes system requirements
type Requirements struct {
	MinRAMMB   int    `json:"min_ram_mb"`
	MinDiskGB  int    `json:"min_disk_gb"`
	MinCPU     int    `json:"min_cpu"`
	Notes      string `json:"notes,omitempty"`
}

// Built-in templates
var builtInTemplates = []BuiltInTemplate{
	CryptPadTemplate,
	AuthentikTemplate,
}

// GetBuiltInTemplates returns all built-in templates
func GetBuiltInTemplates() []BuiltInTemplate {
	return builtInTemplates
}

// GetBuiltInTemplate returns a specific built-in template by ID
func GetBuiltInTemplate(id string) *BuiltInTemplate {
	for _, t := range builtInTemplates {
		if t.ID == id {
			return &t
		}
	}
	return nil
}

// GetBuiltInTemplatesByCategory returns templates in a category
func GetBuiltInTemplatesByCategory(category string) []BuiltInTemplate {
	var result []BuiltInTemplate
	for _, t := range builtInTemplates {
		if t.Category == category {
			result = append(result, t)
		}
	}
	return result
}

// ToJSON serializes a template to JSON
func (t *BuiltInTemplate) ToJSON() ([]byte, error) {
	return json.Marshal(t)
}

// CryptPadTemplate is the Stardeck Office (CryptPad) template
var CryptPadTemplate = BuiltInTemplate{
	ID:          "stardeck-office",
	Name:        "Stardeck Office",
	Description: "End-to-end encrypted office suite with documents, spreadsheets, presentations, kanban boards, and more. Powered by CryptPad.",
	Category:    "office",
	Icon:        "file-text",
	ComposeContent: `version: "3.8"

services:
  cryptpad:
    image: docker.io/cryptpad/cryptpad:latest
    container_name: stardeck-office
    hostname: cryptpad
    environment:
      - CPAD_MAIN_DOMAIN=${CRYPTPAD_DOMAIN:-localhost}
      - CPAD_SANDBOX_DOMAIN=${CRYPTPAD_SANDBOX_DOMAIN:-sandbox.localhost}
      - CPAD_HTTP_UNSAFE_ORIGIN=${CRYPTPAD_UNSAFE_ORIGIN:-true}
      - CPAD_ADMIN_EMAIL=${ADMIN_EMAIL:-admin@localhost}
      - CPAD_TELEMETRY=${TELEMETRY:-false}
      - CPAD_INSTALL_ONLYOFFICE=${INSTALL_ONLYOFFICE:-false}
    volumes:
      - cryptpad_blob:/cryptpad/blob
      - cryptpad_block:/cryptpad/block
      - cryptpad_data:/cryptpad/data
      - cryptpad_datastore:/cryptpad/datastore
      - cryptpad_config:/cryptpad/config
    ports:
      - "${CRYPTPAD_PORT:-3001}:3000"
    restart: unless-stopped
    labels:
      - "stardeck.app=office"
      - "stardeck.name=Stardeck Office"
      - "stardeck.icon=file-text"
      - "stardeck.webui=true"
      - "stardeck.webui.port=3000"

volumes:
  cryptpad_blob:
  cryptpad_block:
  cryptpad_data:
  cryptpad_datastore:
  cryptpad_config:
`,
	EnvDefaults: map[string]string{
		"CRYPTPAD_DOMAIN":         "localhost",
		"CRYPTPAD_SANDBOX_DOMAIN": "sandbox.localhost",
		"CRYPTPAD_PORT":           "3001",
		"CRYPTPAD_UNSAFE_ORIGIN":  "true",
		"ADMIN_EMAIL":             "",
		"TELEMETRY":               "false",
		"INSTALL_ONLYOFFICE":      "false",
	},
	EnvDescriptions: map[string]string{
		"CRYPTPAD_DOMAIN":         "Main domain for CryptPad (e.g., office.example.com)",
		"CRYPTPAD_SANDBOX_DOMAIN": "Sandbox domain for CryptPad security isolation",
		"CRYPTPAD_PORT":           "Port to expose CryptPad on the host",
		"CRYPTPAD_UNSAFE_ORIGIN":  "Allow HTTP origin (set to false for production with HTTPS)",
		"ADMIN_EMAIL":             "Administrator email address",
		"TELEMETRY":               "Enable anonymous telemetry",
		"INSTALL_ONLYOFFICE":      "Install OnlyOffice for better MS Office compatibility",
	},
	RequiredEnvVars: []string{"ADMIN_EMAIL"},
	VolumePaths: map[string]string{
		"cryptpad_blob":      "/var/lib/stardeck/office/blob",
		"cryptpad_block":     "/var/lib/stardeck/office/block",
		"cryptpad_data":      "/var/lib/stardeck/office/data",
		"cryptpad_datastore": "/var/lib/stardeck/office/datastore",
		"cryptpad_config":    "/var/lib/stardeck/office/config",
	},
	WebUI: &WebUIConfig{
		Port:     3000,
		Path:     "/",
		Protocol: "http",
	},
	AllianceSSO: &SSOConfig{
		SupportedTiers: []int{1, 2, 3}, // Forward auth, headers, OIDC
		OIDCCallback:   "/api/v2/openid/callback",
		OIDCEnvVars: map[string]string{
			"CPAD_OIDC_ENABLED":       "true",
			"CPAD_OIDC_ISSUER":        "${ALLIANCE_ISSUER_URL}",
			"CPAD_OIDC_CLIENT_ID":     "${ALLIANCE_CLIENT_ID}",
			"CPAD_OIDC_CLIENT_SECRET": "${ALLIANCE_CLIENT_SECRET}",
		},
	},
	Requirements: &Requirements{
		MinRAMMB:  512,
		MinDiskGB: 2,
		MinCPU:    1,
		Notes:     "Lightweight office suite. Storage grows with usage.",
	},
	Tags: []string{"office", "documents", "collaboration", "encrypted", "privacy"},
}

// AuthentikTemplate is the managed identity provider template
var AuthentikTemplate = BuiltInTemplate{
	ID:          "authentik",
	Name:        "Authentik",
	Description: "Modern identity provider with SSO, MFA, and user management. Supports OIDC, SAML, LDAP, and SCIM.",
	Category:    "auth",
	Icon:        "shield-check",
	ComposeContent: `version: "3.8"

services:
  postgresql:
    image: docker.io/library/postgres:15-alpine
    container_name: authentik-postgresql
    environment:
      - POSTGRES_PASSWORD=${PG_PASS:-authentik}
      - POSTGRES_USER=authentik
      - POSTGRES_DB=authentik
    volumes:
      - authentik_db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U authentik"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: docker.io/library/redis:7-alpine
    container_name: authentik-redis
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - authentik_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  server:
    image: ghcr.io/goauthentik/server:latest
    container_name: authentik-server
    command: server
    environment:
      - AUTHENTIK_REDIS__HOST=redis
      - AUTHENTIK_POSTGRESQL__HOST=postgresql
      - AUTHENTIK_POSTGRESQL__USER=authentik
      - AUTHENTIK_POSTGRESQL__NAME=authentik
      - AUTHENTIK_POSTGRESQL__PASSWORD=${PG_PASS:-authentik}
      - AUTHENTIK_SECRET_KEY=${AUTHENTIK_SECRET_KEY}
      - AUTHENTIK_ERROR_REPORTING__ENABLED=${ERROR_REPORTING:-false}
      - AUTHENTIK_BOOTSTRAP_EMAIL=${ADMIN_EMAIL}
      - AUTHENTIK_BOOTSTRAP_PASSWORD=${ADMIN_PASSWORD}
    volumes:
      - authentik_media:/media
      - authentik_templates:/templates
    ports:
      - "${AUTHENTIK_PORT:-9000}:9000"
      - "${AUTHENTIK_HTTPS_PORT:-9443}:9443"
    depends_on:
      - postgresql
      - redis
    restart: unless-stopped
    labels:
      - "stardeck.app=authentik"
      - "stardeck.name=Authentik"
      - "stardeck.icon=shield-check"
      - "stardeck.webui=true"
      - "stardeck.webui.port=9000"

  worker:
    image: ghcr.io/goauthentik/server:latest
    container_name: authentik-worker
    command: worker
    environment:
      - AUTHENTIK_REDIS__HOST=redis
      - AUTHENTIK_POSTGRESQL__HOST=postgresql
      - AUTHENTIK_POSTGRESQL__USER=authentik
      - AUTHENTIK_POSTGRESQL__NAME=authentik
      - AUTHENTIK_POSTGRESQL__PASSWORD=${PG_PASS:-authentik}
      - AUTHENTIK_SECRET_KEY=${AUTHENTIK_SECRET_KEY}
      - AUTHENTIK_ERROR_REPORTING__ENABLED=${ERROR_REPORTING:-false}
    volumes:
      - authentik_media:/media
      - authentik_templates:/templates
      - authentik_certs:/certs
    depends_on:
      - postgresql
      - redis
    restart: unless-stopped

volumes:
  authentik_db:
  authentik_redis:
  authentik_media:
  authentik_templates:
  authentik_certs:
`,
	EnvDefaults: map[string]string{
		"PG_PASS":              "",
		"AUTHENTIK_SECRET_KEY": "",
		"ADMIN_EMAIL":          "",
		"ADMIN_PASSWORD":       "",
		"AUTHENTIK_PORT":       "9000",
		"AUTHENTIK_HTTPS_PORT": "9443",
		"ERROR_REPORTING":      "false",
	},
	EnvDescriptions: map[string]string{
		"PG_PASS":              "PostgreSQL password (auto-generated if empty)",
		"AUTHENTIK_SECRET_KEY": "Secret key for encryption (auto-generated if empty)",
		"ADMIN_EMAIL":          "Initial admin user email",
		"ADMIN_PASSWORD":       "Initial admin user password",
		"AUTHENTIK_PORT":       "HTTP port for Authentik",
		"AUTHENTIK_HTTPS_PORT": "HTTPS port for Authentik",
		"ERROR_REPORTING":      "Enable anonymous error reporting to Authentik",
	},
	RequiredEnvVars: []string{"ADMIN_EMAIL", "ADMIN_PASSWORD"},
	VolumePaths: map[string]string{
		"authentik_db":        "/var/lib/stardeck/authentik/db",
		"authentik_redis":     "/var/lib/stardeck/authentik/redis",
		"authentik_media":     "/var/lib/stardeck/authentik/media",
		"authentik_templates": "/var/lib/stardeck/authentik/templates",
		"authentik_certs":     "/var/lib/stardeck/authentik/certs",
	},
	WebUI: &WebUIConfig{
		Port:     9000,
		Path:     "/",
		Protocol: "http",
	},
	Requirements: &Requirements{
		MinRAMMB:  2048,
		MinDiskGB: 5,
		MinCPU:    2,
		Notes:     "Requires PostgreSQL and Redis. Initial setup may take a few minutes.",
	},
	Tags: []string{"auth", "sso", "oidc", "saml", "ldap", "identity", "mfa"},
}
