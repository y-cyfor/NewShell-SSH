package services

import (
	"log"
	"sync"
)

// AgentTerminalBroadcaster is a function that broadcasts data to the agent terminal WebSocket
type AgentTerminalBroadcaster func(sessionID string, data string)

var (
	agentTerminalBroadcasters = make(map[string]AgentTerminalBroadcaster)
	broadcasterMu             sync.RWMutex
)

// RegisterAgentTerminalBroadcaster registers a broadcaster for a session
func RegisterAgentTerminalBroadcaster(sessionID string, fn AgentTerminalBroadcaster) {
	broadcasterMu.Lock()
	defer broadcasterMu.Unlock()
	agentTerminalBroadcasters[sessionID] = fn
	log.Printf("[AgentTerminal] Registered broadcaster for session: %s", sessionID)
}

// UnregisterAgentTerminalBroadcaster removes a broadcaster for a session
func UnregisterAgentTerminalBroadcaster(sessionID string) {
	broadcasterMu.Lock()
	defer broadcasterMu.Unlock()
	delete(agentTerminalBroadcasters, sessionID)
	log.Printf("[AgentTerminal] Unregistered broadcaster for session: %s", sessionID)
}

// BroadcastToAgentTerminal sends data to the agent terminal WebSocket
func BroadcastToAgentTerminal(sessionID string, data string) {
	broadcasterMu.RLock()
	fn, ok := agentTerminalBroadcasters[sessionID]
	broadcasterMu.RUnlock()

	log.Printf("[AgentTerminal] Broadcast to session %s, found=%v, data_len=%d", sessionID, ok, len(data))
	if ok {
		fn(sessionID, data)
	} else {
		log.Printf("[AgentTerminal] WARNING: No broadcaster found for session %s, registered sessions: %v", sessionID, getRegisteredSessions())
	}
}

func getRegisteredSessions() []string {
	broadcasterMu.RLock()
	defer broadcasterMu.RUnlock()
	sessions := make([]string, 0, len(agentTerminalBroadcasters))
	for k := range agentTerminalBroadcasters {
		sessions = append(sessions, k)
	}
	return sessions
}
