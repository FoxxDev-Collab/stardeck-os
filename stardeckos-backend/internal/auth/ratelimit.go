package auth

import (
	"net/http"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// RateLimiter provides rate limiting for login attempts
type RateLimiter struct {
	mu       sync.RWMutex
	attempts map[string]*attemptInfo
	// Configuration
	maxAttempts int
	window      time.Duration
	blockTime   time.Duration
}

type attemptInfo struct {
	count     int
	firstTry  time.Time
	blockedAt time.Time
}

// NewRateLimiter creates a new rate limiter
// maxAttempts: max login attempts within the window
// window: time window for counting attempts
// blockTime: how long to block after exceeding max attempts
func NewRateLimiter(maxAttempts int, window, blockTime time.Duration) *RateLimiter {
	rl := &RateLimiter{
		attempts:    make(map[string]*attemptInfo),
		maxAttempts: maxAttempts,
		window:      window,
		blockTime:   blockTime,
	}
	// Start cleanup goroutine
	go rl.cleanup()
	return rl
}

// DefaultRateLimiter creates a rate limiter with sensible defaults
// 5 attempts per 15 minutes, blocked for 15 minutes after exceeding
func DefaultRateLimiter() *RateLimiter {
	return NewRateLimiter(5, 15*time.Minute, 15*time.Minute)
}

// Allow checks if the given key (IP address) is allowed to attempt login
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	info, exists := rl.attempts[key]

	if !exists {
		// First attempt
		rl.attempts[key] = &attemptInfo{
			count:    1,
			firstTry: now,
		}
		return true
	}

	// Check if blocked
	if !info.blockedAt.IsZero() {
		if now.Sub(info.blockedAt) < rl.blockTime {
			return false
		}
		// Block expired, reset
		info.count = 1
		info.firstTry = now
		info.blockedAt = time.Time{}
		return true
	}

	// Check if window expired
	if now.Sub(info.firstTry) > rl.window {
		// Window expired, reset
		info.count = 1
		info.firstTry = now
		return true
	}

	// Within window
	info.count++
	if info.count > rl.maxAttempts {
		info.blockedAt = now
		return false
	}

	return true
}

// RecordSuccess resets the attempt count for successful login
func (rl *RateLimiter) RecordSuccess(key string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	delete(rl.attempts, key)
}

// GetRemainingAttempts returns the remaining attempts for a key
func (rl *RateLimiter) GetRemainingAttempts(key string) int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	info, exists := rl.attempts[key]
	if !exists {
		return rl.maxAttempts
	}

	// Check if blocked
	if !info.blockedAt.IsZero() {
		if time.Since(info.blockedAt) < rl.blockTime {
			return 0
		}
		return rl.maxAttempts
	}

	// Check if window expired
	if time.Since(info.firstTry) > rl.window {
		return rl.maxAttempts
	}

	remaining := rl.maxAttempts - info.count
	if remaining < 0 {
		return 0
	}
	return remaining
}

// GetBlockedUntil returns when the block expires, or zero time if not blocked
func (rl *RateLimiter) GetBlockedUntil(key string) time.Time {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	info, exists := rl.attempts[key]
	if !exists {
		return time.Time{}
	}

	if info.blockedAt.IsZero() {
		return time.Time{}
	}

	blockedUntil := info.blockedAt.Add(rl.blockTime)
	if time.Now().After(blockedUntil) {
		return time.Time{}
	}

	return blockedUntil
}

// cleanup removes expired entries periodically
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for key, info := range rl.attempts {
			// Remove if both window and block have expired
			windowExpired := now.Sub(info.firstTry) > rl.window
			blockExpired := info.blockedAt.IsZero() || now.Sub(info.blockedAt) > rl.blockTime
			if windowExpired && blockExpired {
				delete(rl.attempts, key)
			}
		}
		rl.mu.Unlock()
	}
}

// Middleware returns an Echo middleware that rate limits requests
func (rl *RateLimiter) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			key := c.RealIP()

			if !rl.Allow(key) {
				blockedUntil := rl.GetBlockedUntil(key)
				retryAfter := int(time.Until(blockedUntil).Seconds())
				if retryAfter < 1 {
					retryAfter = 1
				}

				c.Response().Header().Set("Retry-After", string(rune(retryAfter)))
				return c.JSON(http.StatusTooManyRequests, map[string]interface{}{
					"error":         "too many login attempts",
					"retry_after":   retryAfter,
					"blocked_until": blockedUntil.Format(time.RFC3339),
				})
			}

			return next(c)
		}
	}
}

// Global rate limiter instance
var LoginRateLimiter = DefaultRateLimiter()
