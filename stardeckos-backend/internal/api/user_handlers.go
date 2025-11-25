package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/auth"
	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

var userRepo *database.UserRepo

// InitUserRepo initializes the user repository
func InitUserRepo() {
	userRepo = database.NewUserRepo()
}

// listUsersHandler handles GET /api/users
func listUsersHandler(c echo.Context) error {
	users, err := userRepo.List()
	if err != nil {
		c.Logger().Error("list users error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list users",
		})
	}

	return c.JSON(http.StatusOK, users)
}

// createUserHandler handles POST /api/users
func createUserHandler(c echo.Context) error {
	var req models.CreateUserRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Validate required fields
	if req.Username == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "username is required",
		})
	}
	if req.Password == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "password is required",
		})
	}
	if len(req.Password) < 8 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "password must be at least 8 characters",
		})
	}

	// Check if username exists
	exists, _ := userRepo.ExistsByUsername(req.Username)
	if exists {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "username already exists",
		})
	}

	// Hash password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.Logger().Error("hash password error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to create user",
		})
	}

	// Set defaults
	role := req.Role
	if role == "" {
		role = models.RoleViewer
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Username
	}

	userType := req.UserType
	if userType == "" {
		userType = models.UserTypeWeb // Default to web user for safety
	}

	user := &models.User{
		Username:     req.Username,
		DisplayName:  displayName,
		PasswordHash: passwordHash,
		UserType:     userType,
		Role:         role,
		AuthType:     models.AuthTypeLocal,
	}

	if err := userRepo.Create(user); err != nil {
		c.Logger().Error("create user error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to create user",
		})
	}

	// Log user creation
	Audit.LogFromContext(c, models.ActionUserCreate, user.Username, map[string]interface{}{
		"user_id":  user.ID,
		"username": user.Username,
		"role":     user.Role,
	})

	return c.JSON(http.StatusCreated, user)
}

// getUserHandler handles GET /api/users/:id
func getUserHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid user ID",
		})
	}

	user, err := userRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrUserNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "user not found",
			})
		}
		c.Logger().Error("get user error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get user",
		})
	}

	return c.JSON(http.StatusOK, user)
}

// updateUserHandler handles PUT /api/users/:id
func updateUserHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid user ID",
		})
	}

	// Get existing user
	user, err := userRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrUserNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "user not found",
			})
		}
		c.Logger().Error("get user error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get user",
		})
	}

	var req models.UpdateUserRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Apply updates
	if req.DisplayName != nil {
		user.DisplayName = *req.DisplayName
	}
	if req.UserType != nil {
		user.UserType = *req.UserType
	}
	if req.Role != nil {
		user.Role = *req.Role
	}
	if req.Disabled != nil {
		user.Disabled = *req.Disabled
	}
	if req.Password != nil && *req.Password != "" {
		if len(*req.Password) < 8 {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "password must be at least 8 characters",
			})
		}
		passwordHash, err := auth.HashPassword(*req.Password)
		if err != nil {
			c.Logger().Error("hash password error: ", err)
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "failed to update user",
			})
		}
		user.PasswordHash = passwordHash
	}

	if err := userRepo.Update(user); err != nil {
		c.Logger().Error("update user error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to update user",
		})
	}

	// Log user update
	Audit.LogFromContext(c, models.ActionUserUpdate, user.Username, map[string]interface{}{
		"user_id":  user.ID,
		"username": user.Username,
	})

	return c.JSON(http.StatusOK, user)
}

// deleteUserHandler handles DELETE /api/users/:id
func deleteUserHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid user ID",
		})
	}

	// Prevent self-deletion
	currentUser := getUserFromContext(c)
	if currentUser != nil && currentUser.ID == id {
		return c.JSON(http.StatusForbidden, map[string]string{
			"error": "cannot delete your own account",
		})
	}

	// Get user info before deletion for audit logging
	targetUser, _ := userRepo.GetByID(id)

	if err := userRepo.Delete(id); err != nil {
		if errors.Is(err, database.ErrUserNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "user not found",
			})
		}
		c.Logger().Error("delete user error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to delete user",
		})
	}

	// Log user deletion
	targetUsername := ""
	if targetUser != nil {
		targetUsername = targetUser.Username
	}
	Audit.LogFromContext(c, models.ActionUserDelete, targetUsername, map[string]interface{}{
		"user_id":  id,
		"username": targetUsername,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "user deleted",
	})
}

// Helper functions

func parseID(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}

func getUserFromContext(c echo.Context) *models.User {
	user, ok := c.Get("user").(*models.User)
	if !ok {
		return nil
	}
	return user
}
