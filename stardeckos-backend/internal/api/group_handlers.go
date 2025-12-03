package api

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/auth"
	"stardeckos-backend/internal/database"
	"stardeckos-backend/internal/models"
)

var groupRepo *database.GroupRepo

// InitGroupRepo initializes the group repository
func InitGroupRepo() {
	groupRepo = database.NewGroupRepo()
}

// listGroupsHandler handles GET /api/groups
func listGroupsHandler(c echo.Context) error {
	groups, err := groupRepo.List()
	if err != nil {
		c.Logger().Error("list groups error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list groups",
		})
	}

	return c.JSON(http.StatusOK, groups)
}

// createGroupHandler handles POST /api/groups
func createGroupHandler(c echo.Context) error {
	var req models.CreateGroupRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Validate required fields
	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "name is required",
		})
	}
	if req.DisplayName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "display name is required",
		})
	}

	// Check if group exists
	exists, _ := groupRepo.ExistsByName(req.Name)
	if exists {
		return c.JSON(http.StatusConflict, map[string]string{
			"error": "group already exists",
		})
	}

	group := &models.Group{
		Name:        req.Name,
		DisplayName: req.DisplayName,
		Description: req.Description,
		RealmID:     req.RealmID,
	}

	// Create system group if requested
	if req.SyncToSystem {
		pamAuth := auth.NewPAMAuth()
		if err := pamAuth.CreateSystemGroup(req.Name); err != nil {
			c.Logger().Error("create system group error: ", err)
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "failed to create system group",
			})
		}
		// Get the GID
		groups, err := pamAuth.GetSystemGroups()
		if err == nil {
			for _, sg := range groups {
				if sg.Name == req.Name {
					group.SystemGID = &sg.GID
					break
				}
			}
		}
	}

	if err := groupRepo.Create(group); err != nil {
		c.Logger().Error("create group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to create group",
		})
	}

	return c.JSON(http.StatusCreated, group)
}

// getGroupHandler handles GET /api/groups/:id
func getGroupHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid group ID",
		})
	}

	group, err := groupRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrGroupNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "group not found",
			})
		}
		c.Logger().Error("get group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get group",
		})
	}

	return c.JSON(http.StatusOK, group)
}

// updateGroupHandler handles PUT /api/groups/:id
func updateGroupHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid group ID",
		})
	}

	// Get existing group
	group, err := groupRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrGroupNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "group not found",
			})
		}
		c.Logger().Error("get group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get group",
		})
	}

	var req models.UpdateGroupRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Apply updates
	if req.DisplayName != nil {
		group.DisplayName = *req.DisplayName
	}
	if req.Description != nil {
		group.Description = *req.Description
	}

	if err := groupRepo.Update(group); err != nil {
		c.Logger().Error("update group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to update group",
		})
	}

	return c.JSON(http.StatusOK, group)
}

// deleteGroupHandler handles DELETE /api/groups/:id
func deleteGroupHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid group ID",
		})
	}

	// Get group to check if it's synced to system
	group, err := groupRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrGroupNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "group not found",
			})
		}
		c.Logger().Error("get group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get group",
		})
	}

	// Delete from database first
	if err := groupRepo.Delete(id); err != nil {
		c.Logger().Error("delete group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to delete group",
		})
	}

	// Delete system group if it was synced
	if group.SystemGID != nil {
		pamAuth := auth.NewPAMAuth()
		_ = pamAuth.DeleteSystemGroup(group.Name) // Best effort
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "group deleted",
	})
}

// addGroupMembersHandler handles POST /api/groups/:id/members
func addGroupMembersHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid group ID",
		})
	}

	var req models.AddGroupMembersRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Verify group exists
	group, err := groupRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, database.ErrGroupNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{
				"error": "group not found",
			})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get group",
		})
	}

	// Add each user
	for _, userID := range req.UserIDs {
		if err := groupRepo.AddMember(id, userID); err != nil {
			c.Logger().Error("add group member error: ", err)
			continue
		}

		// If group is synced to system, add to system group too
		if group.SystemGID != nil {
			user, err := userRepo.GetByID(userID)
			if err == nil && user.AuthType == models.AuthTypePAM {
				pamAuth := auth.NewPAMAuth()
				_ = pamAuth.AddUserToGroup(user.Username, group.Name)
			}
		}
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "members added",
	})
}

// removeGroupMemberHandler handles DELETE /api/groups/:id/members/:userId
func removeGroupMemberHandler(c echo.Context) error {
	groupID, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid group ID",
		})
	}

	userID, err := parseID(c.Param("userId"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid user ID",
		})
	}

	// Get group to check if synced
	group, err := groupRepo.GetByID(groupID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get group",
		})
	}

	// Remove from database
	if err := groupRepo.RemoveMember(groupID, userID); err != nil {
		c.Logger().Error("remove group member error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to remove member",
		})
	}

	// If group is synced to system, remove from system group too
	if group.SystemGID != nil {
		user, err := userRepo.GetByID(userID)
		if err == nil && user.AuthType == models.AuthTypePAM {
			pamAuth := auth.NewPAMAuth()
			_ = pamAuth.RemoveUserFromGroup(user.Username, group.Name)
		}
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "member removed",
	})
}

// listGroupMembersHandler handles GET /api/groups/:id/members
func listGroupMembersHandler(c echo.Context) error {
	id, err := parseID(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid group ID",
		})
	}

	members, err := groupRepo.GetMembers(id)
	if err != nil {
		c.Logger().Error("list group members error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list members",
		})
	}

	return c.JSON(http.StatusOK, members)
}

// listSystemGroupsHandler handles GET /api/system/groups
func listSystemGroupsHandler(c echo.Context) error {
	pamAuth := auth.NewPAMAuth()
	groups, err := pamAuth.GetSystemGroups()
	if err != nil {
		c.Logger().Error("list system groups error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to list system groups",
		})
	}

	return c.JSON(http.StatusOK, groups)
}

// addSystemGroupMemberHandler handles POST /api/system/groups/:name/members
func addSystemGroupMemberHandler(c echo.Context) error {
	groupName := c.Param("name")
	if groupName == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "group name required",
		})
	}

	var req struct {
		Username string `json:"username"`
	}
	if err := c.Bind(&req); err != nil || req.Username == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "username required",
		})
	}

	pamAuth := auth.NewPAMAuth()
	if err := pamAuth.AddUserToGroup(req.Username, groupName); err != nil {
		c.Logger().Error("add user to system group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to add user to group: " + err.Error(),
		})
	}

	// Audit log
	adminUser := c.Get("user").(*models.User)
	logAudit(adminUser, models.ActionGroupAddMember, groupName, map[string]interface{}{
		"username":     req.Username,
		"system_group": true,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "user added to group",
	})
}

// removeSystemGroupMemberHandler handles DELETE /api/system/groups/:name/members/:username
func removeSystemGroupMemberHandler(c echo.Context) error {
	groupName := c.Param("name")
	username := c.Param("username")

	if groupName == "" || username == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "group name and username required",
		})
	}

	pamAuth := auth.NewPAMAuth()
	if err := pamAuth.RemoveUserFromGroup(username, groupName); err != nil {
		c.Logger().Error("remove user from system group error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to remove user from group: " + err.Error(),
		})
	}

	// Audit log
	adminUser := c.Get("user").(*models.User)
	logAudit(adminUser, models.ActionGroupRemoveMember, groupName, map[string]interface{}{
		"username":     username,
		"system_group": true,
	})

	return c.JSON(http.StatusOK, map[string]string{
		"message": "user removed from group",
	})
}
