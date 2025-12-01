package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/alliance"
	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
	"stardeckos-backend/internal/templates"
)

var allianceRepo *database.AllianceRepo

// InitAllianceRepo initializes the Alliance repository
func InitAllianceRepo() {
	allianceRepo = database.NewAllianceRepo()
}

// Alliance Status

// getAllianceStatusHandler returns the current Alliance status
func getAllianceStatusHandler(c echo.Context) error {
	status, err := allianceRepo.GetStatus()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get Alliance status: " + err.Error(),
		})
	}
	return c.JSON(http.StatusOK, status)
}

// Provider Management

// listProvidersHandler returns all identity providers
func listProvidersHandler(c echo.Context) error {
	providers, err := allianceRepo.ListProviders()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list providers: " + err.Error(),
		})
	}
	return c.JSON(http.StatusOK, providers)
}

// getProviderHandler returns a specific provider
func getProviderHandler(c echo.Context) error {
	id := c.Param("id")
	provider, err := allianceRepo.GetProvider(id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get provider: " + err.Error(),
		})
	}
	if provider == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Provider not found",
		})
	}
	return c.JSON(http.StatusOK, provider)
}

// createProviderHandler creates a new identity provider
func createProviderHandler(c echo.Context) error {
	var req models.CreateProviderRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	if req.Name == "" || req.Type == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Name and type are required",
		})
	}

	// Serialize config to JSON
	configJSON, err := json.Marshal(req.Config)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid config: " + err.Error(),
		})
	}

	provider := &models.AllianceProvider{
		Name:    req.Name,
		Type:    req.Type,
		Enabled: true,
		Config:  string(configJSON),
	}

	if err := allianceRepo.CreateProvider(provider); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create provider: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionAllianceProviderCreate, req.Name, nil)

	return c.JSON(http.StatusCreated, provider)
}

// updateProviderHandler updates a provider
func updateProviderHandler(c echo.Context) error {
	id := c.Param("id")

	provider, err := allianceRepo.GetProvider(id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get provider: " + err.Error(),
		})
	}
	if provider == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Provider not found",
		})
	}

	var req models.UpdateProviderRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	if req.Name != nil {
		provider.Name = *req.Name
	}
	if req.Enabled != nil {
		provider.Enabled = *req.Enabled
	}
	if req.Config != nil {
		configJSON, err := json.Marshal(req.Config)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid config: " + err.Error(),
			})
		}
		provider.Config = string(configJSON)
	}

	if err := allianceRepo.UpdateProvider(provider); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to update provider: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionAllianceProviderUpdate, provider.Name, nil)

	return c.JSON(http.StatusOK, provider)
}

// deleteProviderHandler deletes a provider
func deleteProviderHandler(c echo.Context) error {
	id := c.Param("id")

	provider, err := allianceRepo.GetProvider(id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get provider: " + err.Error(),
		})
	}
	if provider == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Provider not found",
		})
	}

	// Delete associated users and groups first
	allianceRepo.DeleteUsersByProvider(id)
	allianceRepo.DeleteGroupsByProvider(id)

	if err := allianceRepo.DeleteProvider(id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to delete provider: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionAllianceProviderDelete, provider.Name, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

// testProviderHandler tests provider connectivity
func testProviderHandler(c echo.Context) error {
	id := c.Param("id")

	provider, err := allianceRepo.GetProvider(id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get provider: " + err.Error(),
		})
	}
	if provider == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Provider not found",
		})
	}

	// Test connectivity based on provider type
	switch provider.Type {
	case models.ProviderTypeOIDC:
		return testOIDCProvider(c, provider)
	case models.ProviderTypeLDAP:
		// TODO: Implement LDAP connectivity test
		return c.JSON(http.StatusOK, models.TestProviderResponse{
			Success: true,
			Message: "LDAP connectivity test not yet implemented",
		})
	case models.ProviderTypeSAML:
		// TODO: Implement SAML connectivity test
		return c.JSON(http.StatusOK, models.TestProviderResponse{
			Success: true,
			Message: "SAML connectivity test not yet implemented",
		})
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Unknown provider type",
		})
	}
}

// testOIDCProvider tests OIDC provider connectivity
func testOIDCProvider(c echo.Context, provider *models.AllianceProvider) error {
	// Parse OIDC config
	oidcConfig, err := database.ParseOIDCConfig(provider.Config)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, models.TestProviderResponse{
			Success: false,
			Message: "Failed to parse OIDC configuration",
			Details: err.Error(),
		})
	}

	// Try to initialize OIDC provider
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = alliance.InitOIDCProvider(ctx, oidcConfig)
	if err != nil {
		return c.JSON(http.StatusOK, models.TestProviderResponse{
			Success: false,
			Message: "Failed to connect to OIDC provider",
			Details: err.Error(),
		})
	}

	// Successfully connected
	return c.JSON(http.StatusOK, models.TestProviderResponse{
		Success: true,
		Message: fmt.Sprintf("Successfully connected to OIDC provider at %s", oidcConfig.IssuerURL),
		Details: "Provider discovery endpoint is accessible and configuration is valid",
	})
}

// Client Management

// listClientsHandler returns all registered clients
func listClientsHandler(c echo.Context) error {
	providerID := c.QueryParam("provider_id")

	var clients []models.AllianceClient
	var err error

	if providerID != "" {
		clients, err = allianceRepo.ListClientsByProvider(providerID)
	} else {
		clients, err = allianceRepo.ListClients()
	}

	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list clients: " + err.Error(),
		})
	}
	return c.JSON(http.StatusOK, clients)
}

// getClientHandler returns a specific client
func getClientHandler(c echo.Context) error {
	id := c.Param("id")
	client, err := allianceRepo.GetClient(id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get client: " + err.Error(),
		})
	}
	if client == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Client not found",
		})
	}
	return c.JSON(http.StatusOK, client)
}

// createClientHandler creates a new OIDC/SAML client
func createClientHandler(c echo.Context) error {
	var req models.CreateClientRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	if req.ProviderID == "" || req.AppName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Provider ID and app name are required",
		})
	}

	// Verify provider exists
	provider, err := allianceRepo.GetProvider(req.ProviderID)
	if err != nil || provider == nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid provider ID",
		})
	}

	// Generate client credentials
	clientID := generateClientID()
	clientSecret := generateClientSecret()

	redirectURIsJSON, _ := json.Marshal(req.RedirectURIs)
	scopesJSON, _ := json.Marshal(req.Scopes)

	client := &models.AllianceClient{
		ProviderID:   req.ProviderID,
		ContainerID:  req.ContainerID,
		AppName:      req.AppName,
		ClientID:     clientID,
		ClientSecret: clientSecret, // TODO: Encrypt this
		RedirectURIs: string(redirectURIsJSON),
		Scopes:       string(scopesJSON),
		SSOTier:      req.SSOTier,
		Config:       "{}",
	}

	if err := allianceRepo.CreateClient(client); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create client: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionAllianceClientCreate, req.AppName, nil)

	return c.JSON(http.StatusCreated, client)
}

// deleteClientHandler deletes a client
func deleteClientHandler(c echo.Context) error {
	id := c.Param("id")

	client, err := allianceRepo.GetClient(id)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get client: " + err.Error(),
		})
	}
	if client == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Client not found",
		})
	}

	if err := allianceRepo.DeleteClient(id); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to delete client: " + err.Error(),
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionAllianceClientDelete, client.AppName, nil)

	return c.JSON(http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

// User Management

// listAllianceUsersHandler returns all federated users
func listAllianceUsersHandler(c echo.Context) error {
	providerID := c.QueryParam("provider_id")

	var users []models.AllianceUser
	var err error

	if providerID != "" {
		users, err = allianceRepo.ListUsersByProvider(providerID)
	} else {
		users, err = allianceRepo.ListUsers()
	}

	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list users: " + err.Error(),
		})
	}
	return c.JSON(http.StatusOK, users)
}

// listAllianceGroupsHandler returns all federated groups
func listAllianceGroupsHandler(c echo.Context) error {
	providerID := c.QueryParam("provider_id")

	var groups []models.AllianceGroup
	var err error

	if providerID != "" {
		groups, err = allianceRepo.ListGroupsByProvider(providerID)
	} else {
		groups, err = allianceRepo.ListGroups()
	}

	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to list groups: " + err.Error(),
		})
	}
	return c.JSON(http.StatusOK, groups)
}

// syncUsersHandler triggers a user sync from the IdP
func syncUsersHandler(c echo.Context) error {
	var req models.SyncUsersRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	// TODO: Implement actual sync based on provider type (OIDC, LDAP, SAML)
	// For now, return a placeholder response
	result := models.SyncResult{
		Added:   0,
		Updated: 0,
		Removed: 0,
		Errors:  []string{"Sync not yet implemented"},
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionAllianceUserSync, req.ProviderID, nil)

	return c.JSON(http.StatusOK, result)
}

// Built-in Templates

// listBuiltInTemplatesHandler returns all built-in templates
func listBuiltInTemplatesHandler(c echo.Context) error {
	category := c.QueryParam("category")

	var templateList []templates.BuiltInTemplate
	if category != "" {
		templateList = templates.GetBuiltInTemplatesByCategory(category)
	} else {
		templateList = templates.GetBuiltInTemplates()
	}

	return c.JSON(http.StatusOK, templateList)
}

// getBuiltInTemplateHandler returns a specific built-in template
func getBuiltInTemplateHandler(c echo.Context) error {
	id := c.Param("id")
	template := templates.GetBuiltInTemplate(id)
	if template == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Template not found",
		})
	}
	return c.JSON(http.StatusOK, template)
}

// deployBuiltInTemplateHandler deploys a built-in template as a stack
func deployBuiltInTemplateHandler(c echo.Context) error {
	id := c.Param("id")
	template := templates.GetBuiltInTemplate(id)
	if template == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Template not found",
		})
	}

	var req struct {
		Name        string            `json:"name"`
		Environment map[string]string `json:"environment"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request: " + err.Error(),
		})
	}

	// Use template name if not provided
	stackName := req.Name
	if stackName == "" {
		stackName = template.ID
	}

	// Merge environment defaults with provided values
	env := make(map[string]string)
	for k, v := range template.EnvDefaults {
		env[k] = v
	}
	for k, v := range req.Environment {
		env[k] = v
	}

	// Generate secrets if not provided
	if template.ID == "authentik" {
		if env["PG_PASS"] == "" {
			env["PG_PASS"] = generateSecret(32)
		}
		if env["AUTHENTIK_SECRET_KEY"] == "" {
			env["AUTHENTIK_SECRET_KEY"] = generateSecret(64)
		}
	}

	// Validate required env vars
	for _, required := range template.RequiredEnvVars {
		if env[required] == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Missing required environment variable: " + required,
			})
		}
	}

	// Build .env content
	envContent := ""
	for k, v := range env {
		envContent += k + "=" + v + "\n"
	}

	// Check if stack already exists
	existing, _ := stackRepo.GetByName(stackName)
	if existing != nil {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "Stack with this name already exists",
		})
	}

	// Create stack directory and write files
	dir, err := ensureStackDir(stackName)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	if err := writeComposeFiles(dir, template.ComposeContent, envContent); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	user := c.Get("user").(*models.User)

	stack := &models.Stack{
		Name:           stackName,
		Description:    template.Description,
		ComposeContent: template.ComposeContent,
		EnvContent:     envContent,
		Status:         models.StackStatusStopped,
		Path:           dir,
		CreatedBy:      &user.ID,
	}

	if err := stackRepo.Create(stack); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to create stack: " + err.Error(),
		})
	}

	logAudit(user, models.ActionStackCreate, stackName, map[string]interface{}{
		"template": template.ID,
	})

	// Auto-start the stack after creation
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	if err := podmanService.ComposeStart(ctx, stack.Path, stack.Name); err != nil {
		// Stack created but failed to start - return partial success
		return c.JSON(http.StatusCreated, map[string]interface{}{
			"stack":   stack,
			"warning": "Stack created but failed to start: " + err.Error(),
			"status":  "created_not_started",
		})
	}

	// Update status to active
	stackRepo.UpdateStatus(stack.ID, models.StackStatusActive)
	stack.Status = models.StackStatusActive

	logAudit(user, models.ActionStackDeploy, stackName, map[string]interface{}{
		"template": template.ID,
	})

	return c.JSON(http.StatusCreated, map[string]interface{}{
		"stack":  stack,
		"status": "deployed_and_started",
	})
}

// Helper functions

func generateClientID() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func generateClientSecret() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func generateSecret(length int) string {
	bytes := make([]byte, length)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)[:length]
}

// OIDC State Management - in-memory store for pending authentication flows
// In production, this should be backed by Redis or the database
var oidcStateStore = make(map[string]*OIDCStateEntry)

type OIDCStateEntry struct {
	ProviderID string
	CreatedAt  time.Time
	ReturnURL  string
}

// Clean up expired state entries (call periodically)
func cleanupOIDCStates() {
	expiry := 10 * time.Minute
	now := time.Now()
	for state, entry := range oidcStateStore {
		if now.Sub(entry.CreatedAt) > expiry {
			delete(oidcStateStore, state)
		}
	}
}

// oidcLoginHandler initiates the OIDC authentication flow
func oidcLoginHandler(c echo.Context) error {
	providerID := c.Param("id")
	returnURL := c.QueryParam("return_url")
	if returnURL == "" {
		returnURL = "/"
	}

	// Get provider
	provider, err := allianceRepo.GetProvider(providerID)
	if err != nil || provider == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Provider not found",
		})
	}

	if !provider.Enabled {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Provider is disabled",
		})
	}

	if provider.Type != models.ProviderTypeOIDC {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Provider does not support OIDC login",
		})
	}

	// Parse OIDC config
	oidcConfig, err := database.ParseOIDCConfig(provider.Config)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to parse provider configuration",
		})
	}

	// Initialize OIDC client
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	oidcClient, err := alliance.InitOIDCProvider(ctx, oidcConfig)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to initialize OIDC provider: " + err.Error(),
		})
	}

	// Generate state
	stateBytes := make([]byte, 32)
	rand.Read(stateBytes)
	state := hex.EncodeToString(stateBytes)

	// Store state
	cleanupOIDCStates() // Cleanup old entries
	oidcStateStore[state] = &OIDCStateEntry{
		ProviderID: providerID,
		CreatedAt:  time.Now(),
		ReturnURL:  returnURL,
	}

	// Get authorization URL
	authURL := oidcClient.GetAuthURL(state)

	return c.Redirect(http.StatusFound, authURL)
}

// oidcCallbackHandler handles the OIDC callback after authentication
func oidcCallbackHandler(c echo.Context) error {
	code := c.QueryParam("code")
	state := c.QueryParam("state")
	errorParam := c.QueryParam("error")
	errorDesc := c.QueryParam("error_description")

	// Handle error response from IdP
	if errorParam != "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error":       errorParam,
			"description": errorDesc,
		})
	}

	if code == "" || state == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Missing code or state parameter",
		})
	}

	// Validate state
	stateEntry, ok := oidcStateStore[state]
	if !ok {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid or expired state",
		})
	}
	delete(oidcStateStore, state) // Remove used state

	// Check state expiry (10 minutes)
	if time.Since(stateEntry.CreatedAt) > 10*time.Minute {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "State has expired",
		})
	}

	// Get provider
	provider, err := allianceRepo.GetProvider(stateEntry.ProviderID)
	if err != nil || provider == nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Provider not found",
		})
	}

	// Parse OIDC config
	oidcConfig, err := database.ParseOIDCConfig(provider.Config)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to parse provider configuration",
		})
	}

	// Initialize OIDC client
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	oidcClient, err := alliance.InitOIDCProvider(ctx, oidcConfig)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to initialize OIDC provider",
		})
	}

	// Exchange code for tokens
	token, err := oidcClient.ExchangeCode(ctx, code)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Failed to exchange code: " + err.Error(),
		})
	}

	// Extract ID token
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "No ID token in response",
		})
	}

	// Get user info from token
	userInfo, err := oidcClient.GetUserInfoFromToken(ctx, rawIDToken)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to get user info: " + err.Error(),
		})
	}

	// Find or create Alliance user
	allianceUser, err := allianceRepo.GetUserByExternalID(stateEntry.ProviderID, userInfo.Subject)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Database error",
		})
	}

	groupsJSON, _ := json.Marshal(userInfo.Groups)

	if allianceUser == nil {
		// Create new Alliance user
		allianceUser = &models.AllianceUser{
			ProviderID:  stateEntry.ProviderID,
			ExternalID:  userInfo.Subject,
			Username:    userInfo.Username,
			Email:       userInfo.Email,
			DisplayName: userInfo.DisplayName,
			Groups:      string(groupsJSON),
		}
		if err := allianceRepo.CreateUser(allianceUser); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "Failed to create user",
			})
		}
	} else {
		// Update existing user info
		allianceUser.Username = userInfo.Username
		allianceUser.Email = userInfo.Email
		allianceUser.DisplayName = userInfo.DisplayName
		allianceUser.Groups = string(groupsJSON)
		allianceRepo.UpdateAllianceUser(allianceUser)
	}

	// Create a Stardeck session for the Alliance user
	// Check if there's a linked local user
	if allianceUser.LocalUserID != nil {
		// User has a linked local account - create session for that account
		userRepo := database.NewUserRepo()
		localUser, err := userRepo.GetByID(*allianceUser.LocalUserID)
		if err == nil && localUser != nil {
			// Create session using the session repo
			sessionRepo := database.NewSessionRepo()
			sessionToken, _, err := sessionRepo.Create(localUser.ID, "", "Alliance Auth: "+provider.Name, 24*time.Hour)
			if err != nil {
				return c.JSON(http.StatusInternalServerError, map[string]string{
					"error": "Failed to create session",
				})
			}

			// Update last login
			userRepo.UpdateLastLogin(localUser.ID)

			// Return with session token
			return c.JSON(http.StatusOK, map[string]interface{}{
				"status":        "authenticated",
				"token":         sessionToken,
				"user":          localUser,
				"alliance_user": allianceUser,
				"return_url":    stateEntry.ReturnURL,
			})
		}
	}

	// No linked local user - return Alliance user info
	// Frontend can prompt for account linking or auto-provision
	return c.JSON(http.StatusOK, map[string]interface{}{
		"status":        "alliance_auth_success",
		"alliance_user": allianceUser,
		"return_url":    stateEntry.ReturnURL,
		"needs_linking": true,
	})
}

// linkAllianceUserHandler links an Alliance user to a local Stardeck account
func linkAllianceUserHandler(c echo.Context) error {
	allianceUserID := c.Param("id")

	var req struct {
		LocalUserID int64 `json:"local_user_id"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Invalid request",
		})
	}

	// Get Alliance user
	allianceUser, err := allianceRepo.GetUser(allianceUserID)
	if err != nil || allianceUser == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "Alliance user not found",
		})
	}

	// Verify local user exists
	userRepo := database.NewUserRepo()
	localUser, err := userRepo.GetByID(req.LocalUserID)
	if err != nil || localUser == nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Local user not found",
		})
	}

	// Link accounts
	if err := allianceRepo.LinkLocalUser(allianceUserID, req.LocalUserID); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to link accounts",
		})
	}

	user := c.Get("user").(*models.User)
	logAudit(user, models.ActionAllianceUserSync, allianceUser.Username, map[string]interface{}{
		"local_user_id":    req.LocalUserID,
		"alliance_user_id": allianceUserID,
		"action":           "link",
	})

	return c.JSON(http.StatusOK, map[string]string{
		"status": "linked",
	})
}
