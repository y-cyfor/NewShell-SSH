package handlers

import (
	"net/http"

	"newshell-server/crypto_util"
	"newshell-server/models"

	"github.com/gin-gonic/gin"
)

var encKey []byte

func SetEncryptionKey(key string) {
	encKey = crypto_util.DeriveKey(key)
}

func GetConnections(c *gin.Context) {
	userID := c.GetString("userID")
	connections, err := models.GetConnections(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if connections == nil {
		connections = []models.Connection{}
	}
	c.JSON(http.StatusOK, connections)
}

func CreateConnection(c *gin.Context) {
	var conn models.Connection
	if err := c.ShouldBindJSON(&conn); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Encrypt sensitive fields
	if encKey != nil {
		if conn.Password != "" {
			if enc, err := crypto_util.Encrypt(conn.Password, encKey); err == nil {
				conn.Password = enc
			}
		}
		if conn.PrivateKey != "" {
			if enc, err := crypto_util.Encrypt(conn.PrivateKey, encKey); err == nil {
				conn.PrivateKey = enc
			}
		}
		if conn.Passphrase != "" {
			if enc, err := crypto_util.Encrypt(conn.Passphrase, encKey); err == nil {
				conn.Passphrase = enc
			}
		}
	}

	if err := models.CreateConnection(&conn); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, conn)
}

func UpdateConnection(c *gin.Context) {
	id := c.Param("id")
	var conn models.Connection
	if err := c.ShouldBindJSON(&conn); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	conn.ID = id

	// Encrypt sensitive fields
	if encKey != nil {
		if conn.Password != "" {
			if enc, err := crypto_util.Encrypt(conn.Password, encKey); err == nil {
				conn.Password = enc
			}
		}
		if conn.PrivateKey != "" {
			if enc, err := crypto_util.Encrypt(conn.PrivateKey, encKey); err == nil {
				conn.PrivateKey = enc
			}
		}
		if conn.Passphrase != "" {
			if enc, err := crypto_util.Encrypt(conn.Passphrase, encKey); err == nil {
				conn.Passphrase = enc
			}
		}
	}

	if err := models.UpdateConnection(&conn); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, conn)
}

func DeleteConnection(c *gin.Context) {
	id := c.Param("id")
	if err := models.DeleteConnection(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
