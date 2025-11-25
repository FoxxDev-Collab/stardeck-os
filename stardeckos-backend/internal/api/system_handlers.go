package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"stardeckos-backend/internal/system"
)

// getSystemInfoHandler handles GET /api/system/info
func getSystemInfoHandler(c echo.Context) error {
	info, err := system.GetSystemInfo()
	if err != nil {
		c.Logger().Error("get system info error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get system info",
		})
	}

	return c.JSON(http.StatusOK, info)
}

// getResourcesHandler handles GET /api/system/resources
func getResourcesHandler(c echo.Context) error {
	resources, err := system.GetResources()
	if err != nil {
		c.Logger().Error("get resources error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get resources",
		})
	}

	return c.JSON(http.StatusOK, resources)
}

// rebootSystemHandler handles POST /api/system/reboot
func rebootSystemHandler(c echo.Context) error {
	// This is a dangerous operation, just return not implemented for now
	return c.JSON(http.StatusNotImplemented, map[string]string{
		"error": "system reboot not implemented for safety",
	})
}

// ===== Repository Management Handlers =====

// getRepositoriesHandler handles GET /api/repositories
func getRepositoriesHandler(c echo.Context) error {
	repos, err := system.GetRepositories()
	if err != nil {
		c.Logger().Error("get repositories error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get repositories",
		})
	}

	return c.JSON(http.StatusOK, repos)
}

// addRepositoryHandler handles POST /api/repositories
func addRepositoryHandler(c echo.Context) error {
	var repo system.Repository
	if err := c.Bind(&repo); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if err := system.AddRepository(repo); err != nil {
		c.Logger().Error("add repository error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusCreated, map[string]string{
		"message": "repository created successfully",
	})
}

// updateRepositoryHandler handles PUT /api/repositories/:id
func updateRepositoryHandler(c echo.Context) error {
	repoID := c.Param("id")

	var repo system.Repository
	if err := c.Bind(&repo); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	// Ensure ID matches
	repo.ID = repoID

	if err := system.EditRepository(repo); err != nil {
		c.Logger().Error("update repository error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "repository updated successfully",
	})
}

// deleteRepositoryHandler handles DELETE /api/repositories/:id
func deleteRepositoryHandler(c echo.Context) error {
	repoID := c.Param("id")

	if err := system.DeleteRepository(repoID); err != nil {
		c.Logger().Error("delete repository error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "repository deleted successfully",
	})
}

// ===== Package Management Handlers =====

// searchPackagesHandler handles GET /api/packages/search?q=query
func searchPackagesHandler(c echo.Context) error {
	query := c.QueryParam("q")
	if query == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "search query is required",
		})
	}

	results, err := system.SearchPackages(query)
	if err != nil {
		c.Logger().Error("search packages error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to search packages",
		})
	}

	return c.JSON(http.StatusOK, results)
}

// getPackageInfoHandler handles GET /api/packages/:name
func getPackageInfoHandler(c echo.Context) error {
	packageName := c.Param("name")

	pkg, err := system.GetPackageInfo(packageName)
	if err != nil {
		c.Logger().Error("get package info error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to get package info",
		})
	}

	return c.JSON(http.StatusOK, pkg)
}

// installPackagesHandler handles POST /api/packages/install
func installPackagesHandler(c echo.Context) error {
	var req struct {
		Packages []string `json:"packages"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if len(req.Packages) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "no packages specified",
		})
	}

	result, err := system.InstallPackages(req.Packages)
	if err != nil {
		c.Logger().Error("install packages error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, result)
}

// removePackagesHandler handles POST /api/packages/remove
func removePackagesHandler(c echo.Context) error {
	var req struct {
		Packages []string `json:"packages"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if len(req.Packages) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "no packages specified",
		})
	}

	result, err := system.RemovePackages(req.Packages)
	if err != nil {
		c.Logger().Error("remove packages error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, result)
}

// refreshMetadataHandler handles POST /api/metadata/refresh
func refreshMetadataHandler(c echo.Context) error {
	if err := system.RefreshMetadata(); err != nil {
		c.Logger().Error("refresh metadata error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "failed to refresh metadata",
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "metadata refreshed successfully",
	})
}

// ===== Storage Management Handlers =====

// getPartitionTableHandler handles GET /api/storage/partitions/:device
func getPartitionTableHandler(c echo.Context) error {
	device := c.Param("device")
	// Reconstruct device path (e.g., "sda" -> "/dev/sda")
	devicePath := "/dev/" + device

	table, err := system.GetPartitionTable(devicePath)
	if err != nil {
		c.Logger().Error("get partition table error: ", err)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"device":          devicePath,
		"partition_table": table,
	})
}

// createPartitionHandler handles POST /api/storage/partitions
func createPartitionHandler(c echo.Context) error {
	var req system.PartitionRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Device == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "device is required",
		})
	}

	result, err := system.CreatePartition(&req)
	if err != nil {
		c.Logger().Error("create partition error: ", err)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	if !result.Success {
		return c.JSON(http.StatusBadRequest, result)
	}

	return c.JSON(http.StatusCreated, result)
}

// deletePartitionHandler handles DELETE /api/storage/partitions
func deletePartitionHandler(c echo.Context) error {
	var req system.DeletePartitionRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Device == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "device is required",
		})
	}

	if req.Partition < 1 {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "partition number is required",
		})
	}

	result, err := system.DeletePartition(&req)
	if err != nil {
		c.Logger().Error("delete partition error: ", err)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	if !result.Success {
		return c.JSON(http.StatusBadRequest, result)
	}

	return c.JSON(http.StatusOK, result)
}

// formatPartitionHandler handles POST /api/storage/format
func formatPartitionHandler(c echo.Context) error {
	var req system.FormatRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Device == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "device is required",
		})
	}

	if req.FSType == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "filesystem type is required",
		})
	}

	result, err := system.FormatPartition(&req)
	if err != nil {
		c.Logger().Error("format partition error: ", err)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	if !result.Success {
		return c.JSON(http.StatusBadRequest, result)
	}

	return c.JSON(http.StatusOK, result)
}

// mountHandler handles POST /api/storage/mount
func mountHandler(c echo.Context) error {
	var req system.MountRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.Device == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "device is required",
		})
	}

	if req.MountPoint == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "mount point is required",
		})
	}

	result, err := system.MountFilesystem(&req)
	if err != nil {
		c.Logger().Error("mount error: ", err)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	if !result.Success {
		return c.JSON(http.StatusBadRequest, result)
	}

	return c.JSON(http.StatusOK, result)
}

// unmountHandler handles POST /api/storage/unmount
func unmountHandler(c echo.Context) error {
	var req struct {
		MountPoint string `json:"mount_point"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
	}

	if req.MountPoint == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "mount point is required",
		})
	}

	result, err := system.UnmountFilesystem(req.MountPoint)
	if err != nil {
		c.Logger().Error("unmount error: ", err)
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	if !result.Success {
		return c.JSON(http.StatusBadRequest, result)
	}

	return c.JSON(http.StatusOK, result)
}
