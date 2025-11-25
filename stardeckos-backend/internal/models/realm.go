package models

import "time"

// RealmType represents the type of authentication realm
type RealmType string

const (
	RealmTypeLocal RealmType = "local" // Local Stardeck users
	RealmTypeLDAP  RealmType = "ldap"  // LDAP/Active Directory
	RealmTypePAM   RealmType = "pam"   // Linux PAM (system users)
	RealmTypeOIDC  RealmType = "oidc"  // OpenID Connect
	RealmTypeSAML  RealmType = "saml"  // SAML 2.0
)

// Realm represents an authentication domain/realm for multi-tenant organization
type Realm struct {
	ID          int64       `json:"id"`
	Name        string      `json:"name"`
	DisplayName string      `json:"display_name"`
	Type        RealmType   `json:"type"`
	Enabled     bool        `json:"enabled"`
	Config      RealmConfig `json:"config"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// RealmConfig holds realm-specific configuration
type RealmConfig struct {
	// LDAP/AD Configuration
	LDAPServer       string `json:"ldap_server,omitempty"`
	LDAPPort         int    `json:"ldap_port,omitempty"`
	LDAPBaseDN       string `json:"ldap_base_dn,omitempty"`
	LDAPBindDN       string `json:"ldap_bind_dn,omitempty"`
	LDAPBindPassword string `json:"ldap_bind_password,omitempty"`
	LDAPUserFilter   string `json:"ldap_user_filter,omitempty"`
	LDAPGroupFilter  string `json:"ldap_group_filter,omitempty"`
	LDAPUseTLS       bool   `json:"ldap_use_tls,omitempty"`

	// OIDC Configuration
	OIDCIssuer       string `json:"oidc_issuer,omitempty"`
	OIDCClientID     string `json:"oidc_client_id,omitempty"`
	OIDCClientSecret string `json:"oidc_client_secret,omitempty"`
	OIDCRedirectURI  string `json:"oidc_redirect_uri,omitempty"`

	// SAML Configuration
	SAMLEntityID    string `json:"saml_entity_id,omitempty"`
	SAMLMetadataURL string `json:"saml_metadata_url,omitempty"`
	SAMLCertificate string `json:"saml_certificate,omitempty"`

	// General Settings
	DefaultRole     Role `json:"default_role,omitempty"`
	AutoCreateUsers bool `json:"auto_create_users,omitempty"`
	SyncGroups      bool `json:"sync_groups,omitempty"`
}

// CreateRealmRequest represents the request body for creating a realm
type CreateRealmRequest struct {
	Name        string      `json:"name" validate:"required,min=3,max=32"`
	DisplayName string      `json:"display_name" validate:"required,min=1,max=64"`
	Type        RealmType   `json:"type" validate:"required"`
	Enabled     bool        `json:"enabled"`
	Config      RealmConfig `json:"config"`
}

// UpdateRealmRequest represents the request body for updating a realm
type UpdateRealmRequest struct {
	DisplayName *string      `json:"display_name,omitempty"`
	Enabled     *bool        `json:"enabled,omitempty"`
	Config      *RealmConfig `json:"config,omitempty"`
}

// RealmStats represents statistics for a realm
type RealmStats struct {
	RealmID      int64 `json:"realm_id"`
	UserCount    int   `json:"user_count"`
	GroupCount   int   `json:"group_count"`
	SessionCount int   `json:"session_count"`
}
