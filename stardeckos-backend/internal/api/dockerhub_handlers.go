package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/labstack/echo/v4"
)

// DockerHub API response structures
type dockerHubSearchResponse struct {
	Count   int                  `json:"count"`
	Results []dockerHubImageInfo `json:"results"`
}

type dockerHubImageInfo struct {
	RepoName         string `json:"repo_name"`
	ShortDescription string `json:"short_description"`
	StarCount        int    `json:"star_count"`
	PullCount        int64  `json:"pull_count"`
	RepoOwner        string `json:"repo_owner"`
	IsOfficial       bool   `json:"is_official"`
	IsAutomated      bool   `json:"is_automated"`
}

// searchDockerHubHandler proxies Docker Hub image search requests
func searchDockerHubHandler(c echo.Context) error {
	query := c.QueryParam("query")
	if query == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "query parameter is required",
		})
	}

	pageSize := c.QueryParam("page_size")
	if pageSize == "" {
		pageSize = "10"
	}

	// Build Docker Hub API URL
	dockerHubURL := fmt.Sprintf(
		"https://hub.docker.com/v2/search/repositories/?query=%s&page_size=%s",
		url.QueryEscape(query),
		pageSize,
	)

	// Make request to Docker Hub
	resp, err := http.Get(dockerHubURL)
	if err != nil {
		c.Logger().Error("Docker Hub API error: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to search Docker Hub",
		})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.Logger().Error("Docker Hub API returned status: ", resp.StatusCode)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Docker Hub API error",
		})
	}

	// Read and parse response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.Logger().Error("Failed to read Docker Hub response: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to read Docker Hub response",
		})
	}

	var searchResp dockerHubSearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		c.Logger().Error("Failed to parse Docker Hub response: ", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "Failed to parse Docker Hub response",
		})
	}

	// Return the results
	return c.JSON(http.StatusOK, searchResp)
}
