package alliance

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"stardeckos-backend/internal/models"
)

// OIDCClient wraps the go-oidc provider for OIDC authentication
type OIDCClient struct {
	provider     *oidc.Provider
	oauth2Config *oauth2.Config
	verifier     *oidc.IDTokenVerifier
	config       *models.OIDCConfig
}

// UserInfo represents user information extracted from OIDC claims
type UserInfo struct {
	Subject     string
	Username    string
	Email       string
	DisplayName string
	Groups      []string
}

// InitOIDCProvider initializes an OIDC provider client
func InitOIDCProvider(ctx context.Context, config *models.OIDCConfig) (*OIDCClient, error) {
	if config.IssuerURL == "" {
		return nil, fmt.Errorf("issuer URL is required")
	}
	if config.ClientID == "" {
		return nil, fmt.Errorf("client ID is required")
	}

	// Create context with timeout for provider initialization
	initCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Initialize OIDC provider
	provider, err := oidc.NewProvider(initCtx, config.IssuerURL)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize OIDC provider: %w", err)
	}

	// Set default scopes if not provided
	scopes := config.Scopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email"}
	}

	// Configure OAuth2
	oauth2Config := &oauth2.Config{
		ClientID:     config.ClientID,
		ClientSecret: config.ClientSecret,
		RedirectURL:  config.RedirectURI,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	// Create ID token verifier
	verifier := provider.Verifier(&oidc.Config{
		ClientID: config.ClientID,
	})

	return &OIDCClient{
		provider:     provider,
		oauth2Config: oauth2Config,
		verifier:     verifier,
		config:       config,
	}, nil
}

// GetAuthURL generates the authorization URL for OIDC login
func (c *OIDCClient) GetAuthURL(state string) string {
	// If no state provided, generate a random one
	if state == "" {
		state = generateState()
	}
	return c.oauth2Config.AuthCodeURL(state)
}

// ExchangeCode exchanges an authorization code for tokens
func (c *OIDCClient) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	exchangeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	token, err := c.oauth2Config.Exchange(exchangeCtx, code)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code: %w", err)
	}
	return token, nil
}

// ValidateToken validates an ID token and returns the raw token
func (c *OIDCClient) ValidateToken(ctx context.Context, rawIDToken string) (*oidc.IDToken, error) {
	validateCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	idToken, err := c.verifier.Verify(validateCtx, rawIDToken)
	if err != nil {
		return nil, fmt.Errorf("failed to verify ID token: %w", err)
	}
	return idToken, nil
}

// GetUserInfo extracts user information from an ID token
func (c *OIDCClient) GetUserInfo(ctx context.Context, idToken *oidc.IDToken) (*UserInfo, error) {
	// Extract all claims
	var claims map[string]interface{}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("failed to extract claims: %w", err)
	}

	userInfo := &UserInfo{
		Subject: idToken.Subject,
	}

	// Extract username using configured claim (default: preferred_username)
	usernameClaim := c.config.UsernameClaim
	if usernameClaim == "" {
		usernameClaim = "preferred_username"
	}
	if username, ok := claims[usernameClaim].(string); ok {
		userInfo.Username = username
	} else if username, ok := claims["email"].(string); ok {
		// Fallback to email if preferred_username not available
		userInfo.Username = username
	} else {
		userInfo.Username = idToken.Subject
	}

	// Extract email using configured claim (default: email)
	emailClaim := c.config.EmailClaim
	if emailClaim == "" {
		emailClaim = "email"
	}
	if email, ok := claims[emailClaim].(string); ok {
		userInfo.Email = email
	}

	// Extract display name from common claims
	if name, ok := claims["name"].(string); ok {
		userInfo.DisplayName = name
	} else if given, ok := claims["given_name"].(string); ok {
		if family, ok := claims["family_name"].(string); ok {
			userInfo.DisplayName = given + " " + family
		} else {
			userInfo.DisplayName = given
		}
	} else {
		userInfo.DisplayName = userInfo.Username
	}

	// Extract groups using configured claim (default: groups)
	groupsClaim := c.config.GroupsClaim
	if groupsClaim == "" {
		groupsClaim = "groups"
	}
	if groups, ok := claims[groupsClaim].([]interface{}); ok {
		userInfo.Groups = make([]string, 0, len(groups))
		for _, g := range groups {
			if group, ok := g.(string); ok {
				userInfo.Groups = append(userInfo.Groups, group)
			}
		}
	}

	return userInfo, nil
}

// GetUserInfoFromToken is a convenience method that validates and extracts user info in one call
func (c *OIDCClient) GetUserInfoFromToken(ctx context.Context, rawIDToken string) (*UserInfo, error) {
	idToken, err := c.ValidateToken(ctx, rawIDToken)
	if err != nil {
		return nil, err
	}
	return c.GetUserInfo(ctx, idToken)
}

// RefreshToken refreshes an OAuth2 token
func (c *OIDCClient) RefreshToken(ctx context.Context, refreshToken string) (*oauth2.Token, error) {
	refreshCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tokenSource := c.oauth2Config.TokenSource(refreshCtx, &oauth2.Token{
		RefreshToken: refreshToken,
	})

	token, err := tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
	}
	return token, nil
}

// GetConfig returns the OIDC configuration
func (c *OIDCClient) GetConfig() *models.OIDCConfig {
	return c.config
}

// generateState generates a random state parameter for OAuth2 flow
func generateState() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}
