package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/models"
)

// StripAuthHeaders middleware removes any client-supplied authentication headers
// This is a security measure to prevent header injection attacks
func StripAuthHeaders() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Remove any authentication headers that a client might try to inject
			c.Request().Header.Del("X-Remote-User")
			c.Request().Header.Del("X-Remote-Email")
			c.Request().Header.Del("X-Remote-Name")
			c.Request().Header.Del("X-Remote-Groups")
			c.Request().Header.Del("X-Remote-Display-Name")
			c.Request().Header.Del("X-Forwarded-User")
			c.Request().Header.Del("X-Forwarded-Email")
			c.Request().Header.Del("X-Auth-Request-User")
			c.Request().Header.Del("X-Auth-Request-Email")

			return next(c)
		}
	}
}

// InjectAuthHeaders middleware injects user identity headers after session validation
// This is used for SSO Tier 2 (trusted headers) to pass user identity to applications
// Must be used after RequireAuth middleware
func InjectAuthHeaders() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			user, ok := c.Get(ContextKeyUser).(*models.User)
			if !ok || user == nil {
				// No authenticated user, skip header injection
				return next(c)
			}

			// Inject username
			c.Request().Header.Set("X-Remote-User", user.Username)

			// Inject email if available
			if user.Email != "" {
				c.Request().Header.Set("X-Remote-Email", user.Email)
			}

			// Inject display name
			displayName := user.Username
			if user.DisplayName != "" {
				displayName = user.DisplayName
			}
			c.Request().Header.Set("X-Remote-Name", displayName)
			c.Request().Header.Set("X-Remote-Display-Name", displayName)

			// Inject groups (for PAM users, we could fetch system groups)
			// For now, just inject the role as a group
			groups := []string{string(user.Role)}
			groupsJSON, _ := json.Marshal(groups)
			c.Request().Header.Set("X-Remote-Groups", string(groupsJSON))

			// Also set some common alternative header names for compatibility
			c.Request().Header.Set("X-Forwarded-User", user.Username)
			if user.Email != "" {
				c.Request().Header.Set("X-Forwarded-Email", user.Email)
			}
			c.Request().Header.Set("X-Auth-Request-User", user.Username)
			if user.Email != "" {
				c.Request().Header.Set("X-Auth-Request-Email", user.Email)
			}

			return next(c)
		}
	}
}

// ForwardAuthMiddleware validates session and returns 401 if not authenticated
// This is used for SSO Tier 1 (forward auth) where a proxy checks authentication
// before allowing access to an application
func ForwardAuthMiddleware(authSvc *Service) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			token := getTokenFromRequest(c)
			if token == "" {
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "authentication required",
				})
			}

			user, session, err := authSvc.ValidateToken(token)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "invalid or expired session",
				})
			}

			// Store user and session in context
			c.Set(ContextKeyUser, user)
			c.Set(ContextKeySession, session)

			// For forward auth, we typically return 200 OK with user headers
			// The proxy can then use these headers or just check the 200 status
			return c.JSON(http.StatusOK, map[string]interface{}{
				"authenticated": true,
				"username":      user.Username,
				"email":         user.Email,
			})
		}
	}
}

// ProxyAuthHandler is an endpoint handler for forward auth proxy pattern
// It checks if the user is authenticated and returns appropriate status
func ProxyAuthHandler(authSvc *Service) echo.HandlerFunc {
	return func(c echo.Context) error {
		token := getTokenFromRequest(c)
		if token == "" {
			// Not authenticated - return 401
			c.Response().Header().Set("WWW-Authenticate", "Bearer realm=\"Stardeck OS\"")
			return c.NoContent(http.StatusUnauthorized)
		}

		user, _, err := authSvc.ValidateToken(token)
		if err != nil {
			// Invalid token - return 401
			c.Response().Header().Set("WWW-Authenticate", "Bearer realm=\"Stardeck OS\"")
			return c.NoContent(http.StatusUnauthorized)
		}

		// Authenticated - inject headers and return 200
		c.Response().Header().Set("X-Remote-User", user.Username)
		if user.Email != "" {
			c.Response().Header().Set("X-Remote-Email", user.Email)
		}

		displayName := user.Username
		if user.DisplayName != "" {
			displayName = user.DisplayName
		}
		c.Response().Header().Set("X-Remote-Name", displayName)
		c.Response().Header().Set("X-Remote-Display-Name", displayName)

		// Inject groups
		groups := []string{string(user.Role)}
		c.Response().Header().Set("X-Remote-Groups", strings.Join(groups, ","))

		return c.NoContent(http.StatusOK)
	}
}

// InjectAllianceUserHeaders injects headers from an Alliance user
// This is used when a user authenticates via an external identity provider
func InjectAllianceUserHeaders(allianceUser *models.AllianceUser) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if allianceUser == nil {
				return next(c)
			}

			// Inject username
			c.Request().Header.Set("X-Remote-User", allianceUser.Username)

			// Inject email if available
			if allianceUser.Email != "" {
				c.Request().Header.Set("X-Remote-Email", allianceUser.Email)
			}

			// Inject display name
			displayName := allianceUser.Username
			if allianceUser.DisplayName != "" {
				displayName = allianceUser.DisplayName
			}
			c.Request().Header.Set("X-Remote-Name", displayName)
			c.Request().Header.Set("X-Remote-Display-Name", displayName)

			// Inject groups from Alliance user
			var groups []string
			if allianceUser.Groups != "" {
				json.Unmarshal([]byte(allianceUser.Groups), &groups)
			}
			if len(groups) > 0 {
				c.Request().Header.Set("X-Remote-Groups", strings.Join(groups, ","))
			}

			// Also set alternative header names for compatibility
			c.Request().Header.Set("X-Forwarded-User", allianceUser.Username)
			if allianceUser.Email != "" {
				c.Request().Header.Set("X-Forwarded-Email", allianceUser.Email)
			}
			c.Request().Header.Set("X-Auth-Request-User", allianceUser.Username)
			if allianceUser.Email != "" {
				c.Request().Header.Set("X-Auth-Request-Email", allianceUser.Email)
			}

			return next(c)
		}
	}
}
