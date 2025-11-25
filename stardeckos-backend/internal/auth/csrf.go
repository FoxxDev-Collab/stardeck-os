package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// CSRFProtection provides CSRF token generation and validation
type CSRFProtection struct {
	mu     sync.RWMutex
	tokens map[string]*csrfToken
}

type csrfToken struct {
	token     string
	createdAt time.Time
	userID    int64
}

// NewCSRFProtection creates a new CSRF protection instance
func NewCSRFProtection() *CSRFProtection {
	csrf := &CSRFProtection{
		tokens: make(map[string]*csrfToken),
	}
	go csrf.cleanup()
	return csrf
}

// GenerateToken generates a new CSRF token for a user
func (c *CSRFProtection) GenerateToken(userID int64) string {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Generate random token
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)

	// Hash for storage key
	hash := sha256.Sum256([]byte(token))
	key := hex.EncodeToString(hash[:])

	c.tokens[key] = &csrfToken{
		token:     token,
		createdAt: time.Now(),
		userID:    userID,
	}

	return token
}

// ValidateToken validates a CSRF token
func (c *CSRFProtection) ValidateToken(token string, userID int64) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	hash := sha256.Sum256([]byte(token))
	key := hex.EncodeToString(hash[:])

	t, exists := c.tokens[key]
	if !exists {
		return false
	}

	// Check if token is expired (1 hour)
	if time.Since(t.createdAt) > time.Hour {
		return false
	}

	// Validate user ID matches
	return t.userID == userID
}

// InvalidateToken invalidates a CSRF token (e.g., on logout)
func (c *CSRFProtection) InvalidateToken(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	hash := sha256.Sum256([]byte(token))
	key := hex.EncodeToString(hash[:])
	delete(c.tokens, key)
}

// cleanup removes expired tokens periodically
func (c *CSRFProtection) cleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for key, token := range c.tokens {
			if now.Sub(token.createdAt) > time.Hour {
				delete(c.tokens, key)
			}
		}
		c.mu.Unlock()
	}
}

// Middleware returns an Echo middleware that validates CSRF tokens
// for state-changing requests (POST, PUT, DELETE, PATCH)
func (c *CSRFProtection) Middleware(authSvc *Service) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(ctx echo.Context) error {
			// Skip CSRF check for safe methods
			method := ctx.Request().Method
			if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
				return next(ctx)
			}

			// Skip CSRF for login endpoint (user doesn't have token yet)
			path := ctx.Path()
			if strings.HasSuffix(path, "/auth/login") {
				return next(ctx)
			}

			// Get user from context (requires auth middleware to run first)
			user, ok := ctx.Get("user").(*struct {
				ID int64
			})

			// If no user in context, check if this is a public endpoint
			if !ok || user == nil {
				// For endpoints that require auth, the auth middleware will handle this
				return next(ctx)
			}

			// Get CSRF token from header
			csrfToken := ctx.Request().Header.Get("X-CSRF-Token")
			if csrfToken == "" {
				// Also check the form field
				csrfToken = ctx.FormValue("_csrf")
			}

			if csrfToken == "" {
				return ctx.JSON(http.StatusForbidden, map[string]string{
					"error": "CSRF token required",
				})
			}

			if !c.ValidateToken(csrfToken, user.ID) {
				return ctx.JSON(http.StatusForbidden, map[string]string{
					"error": "invalid CSRF token",
				})
			}

			return next(ctx)
		}
	}
}

// Global CSRF protection instance
var CSRF = NewCSRFProtection()
