package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

var auditRepo *database.AuditRepo

// InitAuditRepo initializes the audit repository
func InitAuditRepo() {
	auditRepo = database.NewAuditRepo()
}

// AuditLogger provides methods to log audit events from handlers
type AuditLogger struct {
	repo *database.AuditRepo
}

// NewAuditLogger creates a new audit logger
func NewAuditLogger() *AuditLogger {
	if auditRepo == nil {
		auditRepo = database.NewAuditRepo()
	}
	return &AuditLogger{repo: auditRepo}
}

// Log logs an audit event
func (l *AuditLogger) Log(userID int64, username, action, target string, details interface{}, ipAddress string) {
	if err := l.repo.Log(userID, username, action, target, details, ipAddress); err != nil {
		// Log error but don't fail the request
		// In production, you might want to use a proper logger
	}
}

// LogFromContext logs an audit event using user info from context
func (l *AuditLogger) LogFromContext(c echo.Context, action, target string, details interface{}) {
	user := getUserFromContext(c)
	var userID int64
	var username string
	if user != nil {
		userID = user.ID
		username = user.Username
	}
	l.Log(userID, username, action, target, details, c.RealIP())
}

// Global audit logger instance
var Audit = NewAuditLogger()

// listAuditLogsHandler handles GET /api/audit
func listAuditLogsHandler(c echo.Context) error {
	filter := models.AuditFilter{
		Limit:  50,
		Offset: 0,
	}

	// Parse query parameters
	if limit := c.QueryParam("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 1000 {
			filter.Limit = l
		}
	}
	if offset := c.QueryParam("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			filter.Offset = o
		}
	}
	if userID := c.QueryParam("user_id"); userID != "" {
		if uid, err := strconv.ParseInt(userID, 10, 64); err == nil {
			filter.UserID = &uid
		}
	}
	if action := c.QueryParam("action"); action != "" {
		filter.Action = action
	}
	if actionPrefix := c.QueryParam("action_prefix"); actionPrefix != "" {
		filter.ActionPrefix = actionPrefix
	}
	if startTime := c.QueryParam("start_time"); startTime != "" {
		if t, err := time.Parse(time.RFC3339, startTime); err == nil {
			filter.StartTime = t
		}
	}
	if endTime := c.QueryParam("end_time"); endTime != "" {
		if t, err := time.Parse(time.RFC3339, endTime); err == nil {
			filter.EndTime = t
		}
	}

	logs, total, err := auditRepo.List(filter)
	if err != nil {
		c.Logger().Error("list audit logs error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list audit logs",
		})
	}

	if logs == nil {
		logs = []*models.AuditLog{}
	}

	return c.JSON(http.StatusOK, models.AuditListResponse{
		Logs:   logs,
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	})
}

// getAuditLogHandler handles GET /api/audit/:id
func getAuditLogHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid audit log ID",
		})
	}

	log, err := auditRepo.GetByID(id)
	if err != nil {
		if err == database.ErrNotFound {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "audit log not found",
			})
		}
		c.Logger().Error("get audit log error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get audit log",
		})
	}

	return c.JSON(http.StatusOK, log)
}

// getAuditActionsHandler handles GET /api/audit/actions
func getAuditActionsHandler(c echo.Context) error {
	actions, err := auditRepo.GetActions()
	if err != nil {
		c.Logger().Error("get audit actions error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get audit actions",
		})
	}

	if actions == nil {
		actions = []string{}
	}

	return c.JSON(http.StatusOK, actions)
}

// getAuditStatsHandler handles GET /api/audit/stats
func getAuditStatsHandler(c echo.Context) error {
	// Get stats for the last 24 hours
	now := time.Now()
	dayAgo := now.Add(-24 * time.Hour)

	filter := models.AuditFilter{
		StartTime: dayAgo,
		Limit:     0, // No limit for count
	}

	_, total24h, err := auditRepo.List(filter)
	if err != nil {
		c.Logger().Error("get audit stats error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get audit stats",
		})
	}

	// Get stats for the last 7 days
	weekAgo := now.Add(-7 * 24 * time.Hour)
	filter.StartTime = weekAgo
	_, total7d, err := auditRepo.List(filter)
	if err != nil {
		c.Logger().Error("get audit stats error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get audit stats",
		})
	}

	// Get total count
	filter.StartTime = time.Time{}
	_, totalAll, err := auditRepo.List(filter)
	if err != nil {
		c.Logger().Error("get audit stats error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get audit stats",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"last_24h":  total24h,
		"last_7d":   total7d,
		"all_time":  totalAll,
	})
}
