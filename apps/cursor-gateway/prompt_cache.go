package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func prepareOpenAICache(body map[string]json.RawMessage, headers http.Header, userID int64, model string) error {
	var cacheKey string
	if raw, ok := body["prompt_cache_key"]; ok {
		if err := json.Unmarshal(raw, &cacheKey); err != nil {
			return problem(400, "invalid_request", "Invalid prompt cache key")
		}
	}
	var metadata map[string]json.RawMessage
	if raw, ok := body["client_metadata"]; ok {
		if err := json.Unmarshal(raw, &metadata); err != nil {
			return problem(400, "invalid_request", "Invalid client metadata")
		}
	}
	if metadata == nil {
		metadata = map[string]json.RawMessage{}
	}
	if strings.TrimSpace(cacheKey) == "" {
		for _, name := range []string{"session-id", "session_id", "conversation_id", "x-session-affinity", "x-session-id", "x-opencode-session", "x-conversation-id"} {
			if value := strings.TrimSpace(headers.Get(name)); value != "" {
				cacheKey = value
				break
			}
		}
		if cacheKey == "" {
			_ = json.Unmarshal(metadata["session_id"], &cacheKey)
		}
		if strings.TrimSpace(cacheKey) == "" {
			cacheKey = derivePromptCacheKey(body, userID, model)
		}
		body["prompt_cache_key"], _ = json.Marshal(cacheKey)
	}
	var sessionID string
	_ = json.Unmarshal(metadata["session_id"], &sessionID)
	if strings.TrimSpace(sessionID) == "" {
		metadata["session_id"], _ = json.Marshal(cacheKey)
	}
	body["client_metadata"], _ = json.Marshal(metadata)
	return nil
}

func derivePromptCacheKey(body map[string]json.RawMessage, userID int64, model string) string {
	type message struct {
		Role    string          `json:"role"`
		Content json.RawMessage `json:"content"`
	}
	seed := struct {
		UserID       int64           `json:"user_id"`
		Model        string          `json:"model"`
		Instructions json.RawMessage `json:"instructions,omitempty"`
		Tools        json.RawMessage `json:"tools,omitempty"`
		Prefix       []message       `json:"prefix,omitempty"`
		FirstUser    json.RawMessage `json:"first_user,omitempty"`
	}{UserID: userID, Model: model, Instructions: body["instructions"], Tools: body["tools"]}
	var input []message
	if json.Unmarshal(body["input"], &input) == nil {
		for _, item := range input {
			if item.Role == "user" {
				seed.FirstUser = item.Content
				break
			}
			if item.Role == "system" || item.Role == "developer" {
				seed.Prefix = append(seed.Prefix, item)
			}
		}
	} else {
		seed.FirstUser = body["input"]
	}
	data, _ := json.Marshal(seed)
	return "cursor_" + hashToken(string(data))
}
