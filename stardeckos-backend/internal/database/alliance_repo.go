package database

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"stardeckos-backend/internal/models"
)

// AllianceRepo handles Alliance database operations
type AllianceRepo struct{}

// NewAllianceRepo creates a new Alliance repository
func NewAllianceRepo() *AllianceRepo {
	return &AllianceRepo{}
}

// Provider operations

// CreateProvider creates a new identity provider
func (r *AllianceRepo) CreateProvider(provider *models.AllianceProvider) error {
	if provider.ID == "" {
		provider.ID = uuid.New().String()
	}
	provider.CreatedAt = time.Now()
	provider.UpdatedAt = time.Now()

	_, err := DB.Exec(`
		INSERT INTO alliance_providers (id, name, type, enabled, is_managed, container_id, config, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, provider.ID, provider.Name, provider.Type, provider.Enabled, provider.IsManaged,
		provider.ContainerID, provider.Config, provider.CreatedAt, provider.UpdatedAt)
	return err
}

// GetProvider retrieves a provider by ID
func (r *AllianceRepo) GetProvider(id string) (*models.AllianceProvider, error) {
	var p models.AllianceProvider
	var containerID sql.NullString
	err := DB.QueryRow(`
		SELECT id, name, type, enabled, is_managed, container_id, config, created_at, updated_at
		FROM alliance_providers WHERE id = ?
	`, id).Scan(&p.ID, &p.Name, &p.Type, &p.Enabled, &p.IsManaged, &containerID,
		&p.Config, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if containerID.Valid {
		p.ContainerID = &containerID.String
	}
	return &p, err
}

// ListProviders returns all providers
func (r *AllianceRepo) ListProviders() ([]models.AllianceProvider, error) {
	rows, err := DB.Query(`
		SELECT id, name, type, enabled, is_managed, container_id, config, created_at, updated_at
		FROM alliance_providers ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var providers []models.AllianceProvider
	for rows.Next() {
		var p models.AllianceProvider
		var containerID sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.Enabled, &p.IsManaged, &containerID,
			&p.Config, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		if containerID.Valid {
			p.ContainerID = &containerID.String
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

// ListEnabledProviders returns only enabled providers
func (r *AllianceRepo) ListEnabledProviders() ([]models.AllianceProvider, error) {
	rows, err := DB.Query(`
		SELECT id, name, type, enabled, is_managed, container_id, config, created_at, updated_at
		FROM alliance_providers WHERE enabled = 1 ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var providers []models.AllianceProvider
	for rows.Next() {
		var p models.AllianceProvider
		var containerID sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.Enabled, &p.IsManaged, &containerID,
			&p.Config, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		if containerID.Valid {
			p.ContainerID = &containerID.String
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

// UpdateProvider updates a provider
func (r *AllianceRepo) UpdateProvider(provider *models.AllianceProvider) error {
	provider.UpdatedAt = time.Now()
	_, err := DB.Exec(`
		UPDATE alliance_providers
		SET name = ?, type = ?, enabled = ?, is_managed = ?, container_id = ?, config = ?, updated_at = ?
		WHERE id = ?
	`, provider.Name, provider.Type, provider.Enabled, provider.IsManaged,
		provider.ContainerID, provider.Config, provider.UpdatedAt, provider.ID)
	return err
}

// DeleteProvider deletes a provider
func (r *AllianceRepo) DeleteProvider(id string) error {
	_, err := DB.Exec("DELETE FROM alliance_providers WHERE id = ?", id)
	return err
}

// CountProviders returns the number of providers
func (r *AllianceRepo) CountProviders() (int, error) {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM alliance_providers").Scan(&count)
	return count, err
}

// Client operations

// CreateClient creates a new OIDC/SAML client
func (r *AllianceRepo) CreateClient(client *models.AllianceClient) error {
	if client.ID == "" {
		client.ID = uuid.New().String()
	}
	client.CreatedAt = time.Now()
	client.UpdatedAt = time.Now()

	_, err := DB.Exec(`
		INSERT INTO alliance_clients (id, provider_id, container_id, app_name, client_id, client_secret, redirect_uris, scopes, sso_tier, config, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, client.ID, client.ProviderID, client.ContainerID, client.AppName, client.ClientID,
		client.ClientSecret, client.RedirectURIs, client.Scopes, client.SSOTier,
		client.Config, client.CreatedAt, client.UpdatedAt)
	return err
}

// GetClient retrieves a client by ID
func (r *AllianceRepo) GetClient(id string) (*models.AllianceClient, error) {
	var c models.AllianceClient
	var containerID sql.NullString
	err := DB.QueryRow(`
		SELECT id, provider_id, container_id, app_name, client_id, client_secret, redirect_uris, scopes, sso_tier, config, created_at, updated_at
		FROM alliance_clients WHERE id = ?
	`, id).Scan(&c.ID, &c.ProviderID, &containerID, &c.AppName, &c.ClientID,
		&c.ClientSecret, &c.RedirectURIs, &c.Scopes, &c.SSOTier, &c.Config,
		&c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if containerID.Valid {
		c.ContainerID = &containerID.String
	}
	return &c, err
}

// GetClientByContainerID retrieves a client by container ID
func (r *AllianceRepo) GetClientByContainerID(containerID string) (*models.AllianceClient, error) {
	var c models.AllianceClient
	var cID sql.NullString
	err := DB.QueryRow(`
		SELECT id, provider_id, container_id, app_name, client_id, client_secret, redirect_uris, scopes, sso_tier, config, created_at, updated_at
		FROM alliance_clients WHERE container_id = ?
	`, containerID).Scan(&c.ID, &c.ProviderID, &cID, &c.AppName, &c.ClientID,
		&c.ClientSecret, &c.RedirectURIs, &c.Scopes, &c.SSOTier, &c.Config,
		&c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if cID.Valid {
		c.ContainerID = &cID.String
	}
	return &c, err
}

// ListClients returns all clients
func (r *AllianceRepo) ListClients() ([]models.AllianceClient, error) {
	rows, err := DB.Query(`
		SELECT id, provider_id, container_id, app_name, client_id, client_secret, redirect_uris, scopes, sso_tier, config, created_at, updated_at
		FROM alliance_clients ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var clients []models.AllianceClient
	for rows.Next() {
		var c models.AllianceClient
		var containerID sql.NullString
		if err := rows.Scan(&c.ID, &c.ProviderID, &containerID, &c.AppName, &c.ClientID,
			&c.ClientSecret, &c.RedirectURIs, &c.Scopes, &c.SSOTier, &c.Config,
			&c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if containerID.Valid {
			c.ContainerID = &containerID.String
		}
		clients = append(clients, c)
	}
	return clients, rows.Err()
}

// ListClientsByProvider returns clients for a specific provider
func (r *AllianceRepo) ListClientsByProvider(providerID string) ([]models.AllianceClient, error) {
	rows, err := DB.Query(`
		SELECT id, provider_id, container_id, app_name, client_id, client_secret, redirect_uris, scopes, sso_tier, config, created_at, updated_at
		FROM alliance_clients WHERE provider_id = ? ORDER BY created_at DESC
	`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var clients []models.AllianceClient
	for rows.Next() {
		var c models.AllianceClient
		var containerID sql.NullString
		if err := rows.Scan(&c.ID, &c.ProviderID, &containerID, &c.AppName, &c.ClientID,
			&c.ClientSecret, &c.RedirectURIs, &c.Scopes, &c.SSOTier, &c.Config,
			&c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if containerID.Valid {
			c.ContainerID = &containerID.String
		}
		clients = append(clients, c)
	}
	return clients, rows.Err()
}

// UpdateClient updates a client
func (r *AllianceRepo) UpdateClient(client *models.AllianceClient) error {
	client.UpdatedAt = time.Now()
	_, err := DB.Exec(`
		UPDATE alliance_clients
		SET provider_id = ?, container_id = ?, app_name = ?, client_id = ?, client_secret = ?, redirect_uris = ?, scopes = ?, sso_tier = ?, config = ?, updated_at = ?
		WHERE id = ?
	`, client.ProviderID, client.ContainerID, client.AppName, client.ClientID,
		client.ClientSecret, client.RedirectURIs, client.Scopes, client.SSOTier,
		client.Config, client.UpdatedAt, client.ID)
	return err
}

// DeleteClient deletes a client
func (r *AllianceRepo) DeleteClient(id string) error {
	_, err := DB.Exec("DELETE FROM alliance_clients WHERE id = ?", id)
	return err
}

// CountClients returns the number of clients
func (r *AllianceRepo) CountClients() (int, error) {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM alliance_clients").Scan(&count)
	return count, err
}

// User operations

// CreateUser creates or updates an alliance user
func (r *AllianceRepo) CreateUser(user *models.AllianceUser) error {
	if user.ID == "" {
		user.ID = uuid.New().String()
	}
	user.CreatedAt = time.Now()
	user.LastSync = time.Now()

	_, err := DB.Exec(`
		INSERT INTO alliance_users (id, provider_id, external_id, username, email, display_name, groups, local_user_id, last_sync, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(provider_id, external_id) DO UPDATE SET
			username = excluded.username,
			email = excluded.email,
			display_name = excluded.display_name,
			groups = excluded.groups,
			last_sync = excluded.last_sync
	`, user.ID, user.ProviderID, user.ExternalID, user.Username, user.Email,
		user.DisplayName, user.Groups, user.LocalUserID, user.LastSync, user.CreatedAt)
	return err
}

// GetUser retrieves a user by ID
func (r *AllianceRepo) GetUser(id string) (*models.AllianceUser, error) {
	var u models.AllianceUser
	var localUserID sql.NullInt64
	err := DB.QueryRow(`
		SELECT id, provider_id, external_id, username, email, display_name, groups, local_user_id, last_sync, created_at
		FROM alliance_users WHERE id = ?
	`, id).Scan(&u.ID, &u.ProviderID, &u.ExternalID, &u.Username, &u.Email,
		&u.DisplayName, &u.Groups, &localUserID, &u.LastSync, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if localUserID.Valid {
		u.LocalUserID = &localUserID.Int64
	}
	return &u, err
}

// GetUserByExternalID retrieves a user by provider and external ID
func (r *AllianceRepo) GetUserByExternalID(providerID, externalID string) (*models.AllianceUser, error) {
	var u models.AllianceUser
	var localUserID sql.NullInt64
	err := DB.QueryRow(`
		SELECT id, provider_id, external_id, username, email, display_name, groups, local_user_id, last_sync, created_at
		FROM alliance_users WHERE provider_id = ? AND external_id = ?
	`, providerID, externalID).Scan(&u.ID, &u.ProviderID, &u.ExternalID, &u.Username, &u.Email,
		&u.DisplayName, &u.Groups, &localUserID, &u.LastSync, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if localUserID.Valid {
		u.LocalUserID = &localUserID.Int64
	}
	return &u, err
}

// ListUsers returns all alliance users
func (r *AllianceRepo) ListUsers() ([]models.AllianceUser, error) {
	rows, err := DB.Query(`
		SELECT id, provider_id, external_id, username, email, display_name, groups, local_user_id, last_sync, created_at
		FROM alliance_users ORDER BY username
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.AllianceUser
	for rows.Next() {
		var u models.AllianceUser
		var localUserID sql.NullInt64
		if err := rows.Scan(&u.ID, &u.ProviderID, &u.ExternalID, &u.Username, &u.Email,
			&u.DisplayName, &u.Groups, &localUserID, &u.LastSync, &u.CreatedAt); err != nil {
			return nil, err
		}
		if localUserID.Valid {
			u.LocalUserID = &localUserID.Int64
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// ListUsersByProvider returns users for a specific provider
func (r *AllianceRepo) ListUsersByProvider(providerID string) ([]models.AllianceUser, error) {
	rows, err := DB.Query(`
		SELECT id, provider_id, external_id, username, email, display_name, groups, local_user_id, last_sync, created_at
		FROM alliance_users WHERE provider_id = ? ORDER BY username
	`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.AllianceUser
	for rows.Next() {
		var u models.AllianceUser
		var localUserID sql.NullInt64
		if err := rows.Scan(&u.ID, &u.ProviderID, &u.ExternalID, &u.Username, &u.Email,
			&u.DisplayName, &u.Groups, &localUserID, &u.LastSync, &u.CreatedAt); err != nil {
			return nil, err
		}
		if localUserID.Valid {
			u.LocalUserID = &localUserID.Int64
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// UpdateAllianceUser updates an alliance user's information
func (r *AllianceRepo) UpdateAllianceUser(user *models.AllianceUser) error {
	_, err := DB.Exec(`
		UPDATE alliance_users
		SET username = ?, email = ?, display_name = ?, groups = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, user.Username, user.Email, user.DisplayName, user.Groups, user.ID)
	return err
}

// LinkLocalUser links an alliance user to a local Stardeck user
func (r *AllianceRepo) LinkLocalUser(allianceUserID string, localUserID int64) error {
	_, err := DB.Exec(`
		UPDATE alliance_users SET local_user_id = ? WHERE id = ?
	`, localUserID, allianceUserID)
	return err
}

// DeleteUser deletes an alliance user
func (r *AllianceRepo) DeleteUser(id string) error {
	_, err := DB.Exec("DELETE FROM alliance_users WHERE id = ?", id)
	return err
}

// DeleteUsersByProvider deletes all users for a provider
func (r *AllianceRepo) DeleteUsersByProvider(providerID string) error {
	_, err := DB.Exec("DELETE FROM alliance_users WHERE provider_id = ?", providerID)
	return err
}

// CountUsers returns the number of alliance users
func (r *AllianceRepo) CountUsers() (int, error) {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM alliance_users").Scan(&count)
	return count, err
}

// Group operations

// CreateGroup creates or updates an alliance group
func (r *AllianceRepo) CreateGroup(group *models.AllianceGroup) error {
	if group.ID == "" {
		group.ID = uuid.New().String()
	}
	group.CreatedAt = time.Now()
	group.LastSync = time.Now()

	_, err := DB.Exec(`
		INSERT INTO alliance_groups (id, provider_id, external_id, name, description, local_group_id, last_sync, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(provider_id, external_id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			last_sync = excluded.last_sync
	`, group.ID, group.ProviderID, group.ExternalID, group.Name, group.Description,
		group.LocalGroupID, group.LastSync, group.CreatedAt)
	return err
}

// GetGroup retrieves a group by ID
func (r *AllianceRepo) GetGroup(id string) (*models.AllianceGroup, error) {
	var g models.AllianceGroup
	var localGroupID sql.NullInt64
	err := DB.QueryRow(`
		SELECT id, provider_id, external_id, name, description, local_group_id, last_sync, created_at
		FROM alliance_groups WHERE id = ?
	`, id).Scan(&g.ID, &g.ProviderID, &g.ExternalID, &g.Name, &g.Description,
		&localGroupID, &g.LastSync, &g.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if localGroupID.Valid {
		g.LocalGroupID = &localGroupID.Int64
	}
	return &g, err
}

// ListGroups returns all alliance groups
func (r *AllianceRepo) ListGroups() ([]models.AllianceGroup, error) {
	rows, err := DB.Query(`
		SELECT id, provider_id, external_id, name, description, local_group_id, last_sync, created_at
		FROM alliance_groups ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []models.AllianceGroup
	for rows.Next() {
		var g models.AllianceGroup
		var localGroupID sql.NullInt64
		if err := rows.Scan(&g.ID, &g.ProviderID, &g.ExternalID, &g.Name, &g.Description,
			&localGroupID, &g.LastSync, &g.CreatedAt); err != nil {
			return nil, err
		}
		if localGroupID.Valid {
			g.LocalGroupID = &localGroupID.Int64
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

// ListGroupsByProvider returns groups for a specific provider
func (r *AllianceRepo) ListGroupsByProvider(providerID string) ([]models.AllianceGroup, error) {
	rows, err := DB.Query(`
		SELECT id, provider_id, external_id, name, description, local_group_id, last_sync, created_at
		FROM alliance_groups WHERE provider_id = ? ORDER BY name
	`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []models.AllianceGroup
	for rows.Next() {
		var g models.AllianceGroup
		var localGroupID sql.NullInt64
		if err := rows.Scan(&g.ID, &g.ProviderID, &g.ExternalID, &g.Name, &g.Description,
			&localGroupID, &g.LastSync, &g.CreatedAt); err != nil {
			return nil, err
		}
		if localGroupID.Valid {
			g.LocalGroupID = &localGroupID.Int64
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

// LinkLocalGroup links an alliance group to a local Stardeck group
func (r *AllianceRepo) LinkLocalGroup(allianceGroupID string, localGroupID int64) error {
	_, err := DB.Exec(`
		UPDATE alliance_groups SET local_group_id = ? WHERE id = ?
	`, localGroupID, allianceGroupID)
	return err
}

// DeleteGroup deletes an alliance group
func (r *AllianceRepo) DeleteGroup(id string) error {
	_, err := DB.Exec("DELETE FROM alliance_groups WHERE id = ?", id)
	return err
}

// DeleteGroupsByProvider deletes all groups for a provider
func (r *AllianceRepo) DeleteGroupsByProvider(providerID string) error {
	_, err := DB.Exec("DELETE FROM alliance_groups WHERE provider_id = ?", providerID)
	return err
}

// CountGroups returns the number of alliance groups
func (r *AllianceRepo) CountGroups() (int, error) {
	var count int
	err := DB.QueryRow("SELECT COUNT(*) FROM alliance_groups").Scan(&count)
	return count, err
}

// GetStatus returns the current Alliance status
func (r *AllianceRepo) GetStatus() (*models.AllianceStatus, error) {
	status := &models.AllianceStatus{}

	// Check if enabled
	settingsRepo := NewSettingsRepo()
	enabled, _ := settingsRepo.Get("alliance.enabled")
	status.Enabled = enabled == "true"

	// Count providers
	providerCount, err := r.CountProviders()
	if err != nil {
		return nil, err
	}
	status.ProviderCount = providerCount

	// Count clients
	clientCount, err := r.CountClients()
	if err != nil {
		return nil, err
	}
	status.ClientCount = clientCount

	// Count users
	userCount, err := r.CountUsers()
	if err != nil {
		return nil, err
	}
	status.UserCount = userCount

	// Count groups
	groupCount, err := r.CountGroups()
	if err != nil {
		return nil, err
	}
	status.GroupCount = groupCount

	// Get default provider if set
	defaultProviderID, _ := settingsRepo.Get("alliance.default_provider")
	if defaultProviderID != "" {
		provider, err := r.GetProvider(defaultProviderID)
		if err == nil && provider != nil {
			status.ActiveProvider = provider
		}
	}

	return status, nil
}

// Helper to parse OIDC config from JSON
func ParseOIDCConfig(configJSON string) (*models.OIDCConfig, error) {
	var config models.OIDCConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return nil, err
	}
	return &config, nil
}

// Helper to parse LDAP config from JSON
func ParseLDAPConfig(configJSON string) (*models.LDAPConfig, error) {
	var config models.LDAPConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return nil, err
	}
	return &config, nil
}

// Helper to parse SAML config from JSON
func ParseSAMLConfig(configJSON string) (*models.SAMLConfig, error) {
	var config models.SAMLConfig
	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return nil, err
	}
	return &config, nil
}
