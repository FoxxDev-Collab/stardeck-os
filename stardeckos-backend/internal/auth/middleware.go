package auth

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/models"
)

// Context keys for storing user data
const (
	ContextKeyUser    = "user"
	ContextKeySession = "session"
)

// RequireAuth middleware checks for valid authentication
func RequireAuth(authSvc *Service) echo.MiddlewareFunc {
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

			// Store user and session in context for handlers
			c.Set(ContextKeyUser, user)
			c.Set(ContextKeySession, session)

			return next(c)
		}
	}
}

// RequireRole middleware checks for specific user roles
// Must be used after RequireAuth
func RequireRole(roles ...models.Role) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			user, ok := c.Get(ContextKeyUser).(*models.User)
			if !ok || user == nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "authentication required",
				})
			}

			// Check if user's role is in allowed roles
			for _, role := range roles {
				if user.Role == role {
					return next(c)
				}
			}

			return c.JSON(http.StatusForbidden, map[string]string{
				"error": "insufficient permissions",
			})
		}
	}
}

// RequireAdmin is a convenience middleware that requires admin role
func RequireAdmin() echo.MiddlewareFunc {
	return RequireRole(models.RoleAdmin)
}

// RequireOperatorOrAdmin requires operator or admin role
func RequireOperatorOrAdmin() echo.MiddlewareFunc {
	return RequireRole(models.RoleAdmin, models.RoleOperator)
}

// RequireWheelOrRoot middleware checks if the user is in the wheel group or is root
// This is specifically for user/group management operations on the actual system
func RequireWheelOrRoot(authSvc *Service) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			user, ok := c.Get(ContextKeyUser).(*models.User)
			if !ok || user == nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "authentication required",
				})
			}

			// For PAM users, check actual system groups
			if user.AuthType == models.AuthTypePAM {
				pamAuth := NewPAMAuth()
				if !pamAuth.IsAdmin(user.Username) {
					return c.JSON(http.StatusForbidden, map[string]string{
						"error": "requires wheel group membership or root access",
					})
				}
				// User is a PAM admin, allow access
				return next(c)
			}

			// For local users, require admin role
			if user.Role != models.RoleAdmin {
				return c.JSON(http.StatusForbidden, map[string]string{
					"error": "requires administrator privileges",
				})
			}

			return next(c)
		}
	}
}

// RequireAdminOrPAMAdmin middleware checks if the user is an admin (either by role or PAM group)
// This replaces the old RequireSystemUser middleware
func RequireAdminOrPAMAdmin(authSvc *Service) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			user, ok := c.Get(ContextKeyUser).(*models.User)
			if !ok || user == nil {
				return c.JSON(http.StatusUnauthorized, map[string]string{
					"error": "authentication required",
				})
			}

			// Check if user is a PAM admin
			if user.AuthType == models.AuthTypePAM {
				pamAuth := NewPAMAuth()
				if pamAuth.IsAdmin(user.Username) {
					return next(c)
				}
			}

			// Check if user has admin role
			if user.Role == models.RoleAdmin {
				return next(c)
			}

			return c.JSON(http.StatusForbidden, map[string]string{
				"error": "requires administrator privileges",
			})
		}
	}
}

// OptionalAuth middleware attempts to authenticate but doesn't require it
// Sets user in context if authenticated, otherwise continues without user
func OptionalAuth(authSvc *Service) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			token := getTokenFromRequest(c)
			if token != "" {
				user, session, err := authSvc.ValidateToken(token)
				if err == nil {
					c.Set(ContextKeyUser, user)
					c.Set(ContextKeySession, session)
				}
			}
			return next(c)
		}
	}
}

// getTokenFromRequest extracts the session token from the request
func getTokenFromRequest(c echo.Context) string {
	// Try Authorization header first (Bearer token)
	authHeader := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}

	// Try cookie
	cookie, err := c.Cookie("session_token")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	// Try query parameter (useful for image/file URLs that can't use headers)
	if token := c.QueryParam("token"); token != "" {
		return token
	}

	return ""
}

// GetUserFromContext retrieves the authenticated user from the context
func GetUserFromContext(c echo.Context) *models.User {
	user, ok := c.Get(ContextKeyUser).(*models.User)
	if !ok {
		return nil
	}
	return user
}

// GetSessionFromContext retrieves the current session from the context
func GetSessionFromContext(c echo.Context) *models.Session {
	session, ok := c.Get(ContextKeySession).(*models.Session)
	if !ok {
		return nil
	}
	return session
}
