package handlers

import (
	"net/http"

	"newshell-server/models"

	"github.com/gin-gonic/gin"
)

func PullSync(c *gin.Context) {
	userID := c.GetString("userID")
	connections, err := models.GetConnections(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if connections == nil {
		connections = []models.Connection{}
	}
	c.JSON(http.StatusOK, gin.H{"connections": connections})
}

func PushSync(c *gin.Context) {
	var req struct {
		Connections []models.Connection `json:"connections"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")
	for i := range req.Connections {
		req.Connections[i].UserID = userID
		existing, _ := models.GetConnection(req.Connections[i].ID)
		if existing != nil {
			models.UpdateConnection(&req.Connections[i])
		} else {
			models.CreateConnection(&req.Connections[i])
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "synced", "count": len(req.Connections)})
}
