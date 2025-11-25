package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/auth"
	"stardeckos-backend/internal/database"
)

var authService *auth.Service

// InitAuthService initializes the auth service (call after database is ready)
func InitAuthService() {
	authService = auth.NewService()
}

// login handles POST /api/auth/login
func loginHandler(c echo.Context) error {
	var req auth.LoginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Username == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "username and password are required",
		})
	}

	// Get client info
	ipAddress := c.RealIP()
	userAgent := c.Request().UserAgent()

	resp, err := authService.Login(req, ipAddress, userAgent)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrInvalidCredentials):
			return c.JSON(http.StatusUnauthorized, map[string]string{
				"error": "invalid username or password",
			})
		case errors.Is(err, auth.ErrUserDisabled):
			return c.JSON(http.StatusForbidden, map[string]string{
				"error": "user account is disabled",
			})
		case errors.Is(err, auth.ErrAuthMethodDisabled):
			return c.JSON(http.StatusForbidden, map[string]string{
				"error": "authentication method is disabled",
			})
		default:
			c.Logger().Error("login error: ", err)
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "authentication failed",
			})
		}
	}

	// Set token in cookie (HttpOnly for security)
	cookie := &http.Cookie{
		Name:     "session_token",
		Value:    resp.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   c.Request().TLS != nil, // Secure if HTTPS
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(resp.ExpiresAt.Sub(resp.User.CreatedAt).Seconds()),
	}
	c.SetCookie(cookie)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"user":       resp.User,
		"token":      resp.Token,
		"expires_at": resp.ExpiresAt,
	})
}

// logout handles POST /api/auth/logout
func logoutHandler(c echo.Context) error {
	token := getTokenFromRequest(c)
	if token == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "no session token",
		})
	}

	if err := authService.Logout(token); err != nil {
		if errors.Is(err, database.ErrSessionNotFound) {
			// Session already gone, that's fine
		} else {
			c.Logger().Error("logout error: ", err)
		}
	}

	// Clear cookie
	cookie := &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	}
	c.SetCookie(cookie)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "logged out successfully",
	})
}

// refreshToken handles POST /api/auth/refresh
func refreshTokenHandler(c echo.Context) error {
	token := getTokenFromRequest(c)
	if token == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{
			"error": "no session token",
		})
	}

	session, err := authService.RefreshToken(token)
	if err != nil {
		if errors.Is(err, database.ErrSessionNotFound) || errors.Is(err, database.ErrSessionExpired) {
			return c.JSON(http.StatusUnauthorized, map[string]string{
				"error": "session expired or invalid",
			})
		}
		c.Logger().Error("refresh token error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to refresh session",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"expires_at": session.ExpiresAt,
	})
}

// getCurrentUser handles GET /api/auth/me
func getCurrentUser(c echo.Context) error {
	token := getTokenFromRequest(c)
	if token == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{
			"error": "not authenticated",
		})
	}

	user, session, err := authService.ValidateToken(token)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{
			"error": "session expired or invalid",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"user":       user,
		"session":    session,
	})
}

// getUserSessions handles GET /api/auth/sessions
func getUserSessions(c echo.Context) error {
	user := getUserFromContext(c)
	if user == nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{
			"error": "not authenticated",
		})
	}

	sessions, err := authService.GetUserSessions(user.ID)
	if err != nil {
		c.Logger().Error("get sessions error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get sessions",
		})
	}

	return c.JSON(http.StatusOK, sessions)
}

// revokeSession handles DELETE /api/auth/sessions/:id
func revokeSession(c echo.Context) error {
	user := getUserFromContext(c)
	if user == nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{
			"error": "not authenticated",
		})
	}

	sessionID, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid session ID",
		})
	}

	// Verify the session belongs to this user (unless admin)
	sessions, _ := authService.GetUserSessions(user.ID)
	found := false
	for _, s := range sessions {
		if s.ID == sessionID {
			found = true
			break
		}
	}

	if !found && user.Role != "admin" {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": "cannot revoke another user's session",
		})
	}

	if err := authService.RevokeSession(sessionID); err != nil {
		c.Logger().Error("revoke session error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to revoke session",
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "session revoked",
	})
}

// getTokenFromRequest extracts the session token from the request
func getTokenFromRequest(c echo.Context) string {
	// Try Authorization header first
	authHeader := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}

	// Try cookie
	cookie, err := c.Cookie("session_token")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}
