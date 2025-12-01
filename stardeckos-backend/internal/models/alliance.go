package models

import "time"

// ProviderType represents the type of identity provider
type ProviderType string

const (
	ProviderTypeOIDC ProviderType = "oidc"
	ProviderTypeSAML ProviderType = "saml"
	ProviderTypeLDAP ProviderType = "ldap"
)

// SSOTier represents the level of SSO integration for an app
type SSOTier int

const (
	SSOTierForwardAuth SSOTier = 1 // Proxy validates session, blocks/allows access
	SSOTierHeaders     SSOTier = 2 // Inject user identity via trusted headers
	SSOTierOIDC        SSOTier = 3 // Native OIDC integration with app
	SSOTierLDAP        SSOTier = 4 // App uses IdP's LDAP interface
)

// AllianceProvider represents an identity provider configuration
type AllianceProvider struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Type        ProviderType `json:"type"`
	Enabled     bool         `json:"enabled"`
	IsManaged   bool         `json:"is_managed"`   // Deployed by Stardeck
	ContainerID *string      `json:"container_id"` // If managed, reference to container
	Config      string       `json:"config"`       // JSON configuration
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

// OIDCConfig holds OIDC provider configuration
type OIDCConfig struct {
	IssuerURL     string   `json:"issuer_url"`
	ClientID      string   `json:"client_id"`
	ClientSecret  string   `json:"client_secret,omitempty"` // Encrypted at rest
	RedirectURI   string   `json:"redirect_uri"`
	Scopes        []string `json:"scopes"`
	UsernameClaim string   `json:"username_claim,omitempty"` // Default: preferred_username
	EmailClaim    string   `json:"email_claim,omitempty"`    // Default: email
	GroupsClaim   string   `json:"groups_claim,omitempty"`   // Default: groups
}

// LDAPConfig holds LDAP provider configuration
type LDAPConfig struct {
	URL            string `json:"url"`              // ldap://host:389 or ldaps://host:636
	BindDN         string `json:"bind_dn"`          // Service account DN
	BindPassword   string `json:"bind_password"`    // Encrypted at rest
	BaseDN         string `json:"base_dn"`          // Search base
	UserFilter     string `json:"user_filter"`      // e.g., (uid=%s)
	GroupFilter    string `json:"group_filter"`     // e.g., (memberOf=%s)
	UserAttr       string `json:"user_attr"`        // Username attribute (uid, sAMAccountName)
	EmailAttr      string `json:"email_attr"`       // Email attribute (mail)
	DisplayAttr    string `json:"display_attr"`     // Display name attribute (cn, displayName)
	GroupMemberAttr string `json:"group_member_attr"` // Group membership attribute
	UseTLS         bool   `json:"use_tls"`
	SkipVerify     bool   `json:"skip_verify"`      // Skip TLS cert verification
}

// SAMLConfig holds SAML provider configuration
type SAMLConfig struct {
	EntityID    string `json:"entity_id"`
	MetadataURL string `json:"metadata_url,omitempty"`
	MetadataXML string `json:"metadata_xml,omitempty"` // Raw metadata if URL not available
	Certificate string `json:"certificate,omitempty"`  // IdP signing certificate
	ACSURL      string `json:"acs_url"`                // Assertion Consumer Service URL
}

// AllianceClient represents an app registered as an OIDC/SAML client
type AllianceClient struct {
	ID           string    `json:"id"`
	ProviderID   string    `json:"provider_id"`
	ContainerID  *string   `json:"container_id,omitempty"` // App container if applicable
	AppName      string    `json:"app_name"`               // Friendly app name
	ClientID     string    `json:"client_id"`
	ClientSecret string    `json:"client_secret,omitempty"` // Encrypted at rest
	RedirectURIs string    `json:"redirect_uris"`           // JSON array
	Scopes       string    `json:"scopes"`                  // JSON array
	SSOTier      SSOTier   `json:"sso_tier"`
	Config       string    `json:"config"`  // JSON: app-specific SSO config
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// AllianceUser represents a user synced from an identity provider
type AllianceUser struct {
	ID          string    `json:"id"`
	ProviderID  string    `json:"provider_id"`
	ExternalID  string    `json:"external_id"`  // ID in the IdP
	Username    string    `json:"username"`
	Email       string    `json:"email,omitempty"`
	DisplayName string    `json:"display_name,omitempty"`
	Groups      string    `json:"groups"`    // JSON array of group names
	LocalUserID *int64    `json:"local_user_id,omitempty"` // Linked Stardeck user
	LastSync    time.Time `json:"last_sync"`
	CreatedAt   time.Time `json:"created_at"`
}

// AllianceGroup represents a group synced from an identity provider
type AllianceGroup struct {
	ID           string    `json:"id"`
	ProviderID   string    `json:"provider_id"`
	ExternalID   string    `json:"external_id"` // ID in the IdP
	Name         string    `json:"name"`
	Description  string    `json:"description,omitempty"`
	LocalGroupID *int64    `json:"local_group_id,omitempty"` // Linked Stardeck group
	LastSync     time.Time `json:"last_sync"`
	CreatedAt    time.Time `json:"created_at"`
}

// AllianceStatus represents the current state of Starfleet Alliance
type AllianceStatus struct {
	Enabled        bool              `json:"enabled"`
	ProviderCount  int               `json:"provider_count"`
	ClientCount    int               `json:"client_count"`
	UserCount      int               `json:"user_count"`
	GroupCount     int               `json:"group_count"`
	ActiveProvider *AllianceProvider `json:"active_provider,omitempty"`
}

// CreateProviderRequest represents the request to create a provider
type CreateProviderRequest struct {
	Name   string       `json:"name" validate:"required,min=1,max=64"`
	Type   ProviderType `json:"type" validate:"required,oneof=oidc saml ldap"`
	Config interface{}  `json:"config" validate:"required"` // OIDCConfig, LDAPConfig, or SAMLConfig
}

// UpdateProviderRequest represents the request to update a provider
type UpdateProviderRequest struct {
	Name    *string     `json:"name,omitempty"`
	Enabled *bool       `json:"enabled,omitempty"`
	Config  interface{} `json:"config,omitempty"`
}

// CreateClientRequest represents the request to register an app as a client
type CreateClientRequest struct {
	ProviderID   string   `json:"provider_id" validate:"required"`
	ContainerID  *string  `json:"container_id,omitempty"`
	AppName      string   `json:"app_name" validate:"required,min=1,max=64"`
	RedirectURIs []string `json:"redirect_uris" validate:"required"`
	Scopes       []string `json:"scopes,omitempty"`
	SSOTier      SSOTier  `json:"sso_tier,omitempty"`
}

// DeployIdPRequest represents the request to deploy a managed IdP
type DeployIdPRequest struct {
	Type          string `json:"type" validate:"required,oneof=authentik keycloak"` // authentik or keycloak
	AdminEmail    string `json:"admin_email" validate:"required,email"`
	AdminPassword string `json:"admin_password" validate:"required,min=8"`
	Domain        string `json:"domain,omitempty"` // Optional custom domain
}

// TestProviderRequest represents the request to test IdP connectivity
type TestProviderRequest struct {
	Username string `json:"username,omitempty"` // For LDAP bind test
	Password string `json:"password,omitempty"` // For LDAP bind test
}

// TestProviderResponse represents the result of a provider connectivity test
type TestProviderResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// SyncUsersRequest represents the request to sync users from IdP
type SyncUsersRequest struct {
	ProviderID string `json:"provider_id" validate:"required"`
	FullSync   bool   `json:"full_sync"` // If true, removes users not in IdP
}

// SyncResult represents the result of a sync operation
type SyncResult struct {
	Added   int      `json:"added"`
	Updated int      `json:"updated"`
	Removed int      `json:"removed"`
	Errors  []string `json:"errors,omitempty"`
}

// AppCompatibility represents SSO compatibility info for a known app
type AppCompatibility struct {
	ImagePattern string   `json:"image_pattern"` // Regex to match image name
	AppName      string   `json:"app_name"`
	SupportedTiers []SSOTier `json:"supported_tiers"`

	// Tier 2: Header configuration
	Tier2Headers *HeaderConfig `json:"tier2_headers,omitempty"`

	// Tier 3: OIDC configuration
	Tier3OIDC *OIDCAppConfig `json:"tier3_oidc,omitempty"`

	// Tier 4: LDAP configuration
	Tier4LDAP *LDAPAppConfig `json:"tier4_ldap,omitempty"`

	Notes string `json:"notes,omitempty"`
}

// HeaderConfig defines how to configure trusted headers for an app
type HeaderConfig struct {
	UserHeader   string            `json:"user_header"`   // Header name for username
	EmailHeader  string            `json:"email_header"`  // Header name for email
	GroupsHeader string            `json:"groups_header"` // Header name for groups
	EnvVars      map[string]string `json:"env_vars"`      // Env vars to set on container
}

// OIDCAppConfig defines how to configure OIDC for an app
type OIDCAppConfig struct {
	CallbackPath string            `json:"callback_path"` // e.g., /oauth/callback
	EnvVars      map[string]string `json:"env_vars"`      // Env vars with ${ALLIANCE_*} placeholders
	ConfigFile   string            `json:"config_file,omitempty"` // Config file to modify
	PostDeploy   []string          `json:"post_deploy,omitempty"` // Commands to run after deploy
}

// LDAPAppConfig defines how to configure LDAP for an app
type LDAPAppConfig struct {
	EnvVars    map[string]string `json:"env_vars"`
	ConfigFile string            `json:"config_file,omitempty"`
	PostDeploy []string          `json:"post_deploy,omitempty"`
}

// Audit action constants for Alliance
const (
	ActionAllianceProviderCreate = "alliance.provider.create"
	ActionAllianceProviderUpdate = "alliance.provider.update"
	ActionAllianceProviderDelete = "alliance.provider.delete"
	ActionAllianceProviderDeploy = "alliance.provider.deploy"
	ActionAllianceClientCreate   = "alliance.client.create"
	ActionAllianceClientUpdate   = "alliance.client.update"
	ActionAllianceClientDelete   = "alliance.client.delete"
	ActionAllianceUserSync       = "alliance.user.sync"
	ActionAllianceGroupSync      = "alliance.group.sync"
)
