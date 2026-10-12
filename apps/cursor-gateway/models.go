package main

import "time"

type User struct {
	ID       int64   `json:"id"`
	Email    string  `json:"email"`
	Username string  `json:"username"`
	Role     string  `json:"role"`
	Status   string  `json:"status"`
	Balance  float64 `json:"balance"`
}

type SourceKey struct {
	ID        int64      `json:"id"`
	UserID    int64      `json:"user_id"`
	Key       string     `json:"key"`
	Name      string     `json:"name"`
	Status    string     `json:"status"`
	ExpiresAt *time.Time `json:"expires_at"`
	Group     *struct {
		ID             int64   `json:"id"`
		Name           string  `json:"name"`
		Platform       string  `json:"platform"`
		Status         string  `json:"status"`
		RateMultiplier float64 `json:"rate_multiplier"`
	} `json:"group"`
}

type Model struct {
	ID                    string   `json:"id"`
	Provider              string   `json:"provider"`
	Efforts               []string `json:"efforts"`
	EffortSource          string   `json:"effort_source"`
	ContextWindow         int      `json:"context_window"`
	ContextWindowOverride int      `json:"context_window_override,omitempty"`
	MaxOutputTokens       int      `json:"max_output_tokens"`
	SupportsVision        bool     `json:"supports_vision"`
}

type Binding struct {
	SourceID  int64    `json:"source_id"`
	Name      string   `json:"name"`
	Group     string   `json:"group"`
	Provider  string   `json:"provider"`
	BifrostID string   `json:"bifrost_id"`
	Models    []string `json:"models"`
}

type Account struct {
	User              User                            `json:"user"`
	AccessToken       string                          `json:"access_token"`
	RefreshToken      string                          `json:"refresh_token"`
	TokenExpires      time.Time                       `json:"token_expires"`
	VirtualID         string                          `json:"virtual_id"`
	VirtualKey        string                          `json:"virtual_key"`
	GatewayKey        string                          `json:"gateway_key"`
	Bindings          []Binding                       `json:"bindings"`
	SelectedSourceIDs []int64                         `json:"selected_source_ids"`
	SourceKeys        []KeySummary                    `json:"source_keys"`
	SyncedAt          time.Time                       `json:"synced_at"`
	ContextOverrides  map[string]ModelContextOverride `json:"context_overrides,omitempty"`
}

type ModelContextOverride struct {
	ContextWindow int       `json:"context_window"`
	MissingSince  time.Time `json:"missing_since,omitempty"`
}

func reconcileContextOverrides(a *Account, now time.Time) bool {
	if len(a.ContextOverrides) == 0 {
		return false
	}
	available := map[string]bool{}
	for _, binding := range a.Bindings {
		for _, id := range binding.Models {
			available[id] = true
		}
	}
	changed := false
	for id, setting := range a.ContextOverrides {
		if !setting.MissingSince.IsZero() && !now.Before(setting.MissingSince.Add(14*24*time.Hour)) {
			delete(a.ContextOverrides, id)
			changed = true
			continue
		}
		if available[id] && !setting.MissingSince.IsZero() {
			setting.MissingSince = time.Time{}
		} else if !available[id] && setting.MissingSince.IsZero() {
			setting.MissingSince = now
		} else {
			continue
		}
		a.ContextOverrides[id] = setting
		changed = true
	}
	return changed
}

type KeySummary struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	Group          string  `json:"group"`
	Provider       string  `json:"provider"`
	Status         string  `json:"status"`
	Usable         bool    `json:"usable"`
	RateMultiplier float64 `json:"rate_multiplier"`
}

func keySummaries(keys []SourceKey, userID int64) []KeySummary {
	result := []KeySummary{}
	for _, key := range keys {
		if key.UserID != userID {
			continue
		}
		summary := KeySummary{ID: key.ID, Name: key.Name, Status: key.Status, Usable: eligibleKey(key, userID, time.Now())}
		if key.Group != nil {
			summary.Group = key.Group.Name
			summary.Provider = providerName(key.Group.Platform)
			summary.RateMultiplier = key.Group.RateMultiplier
		}
		result = append(result, summary)
	}
	return result
}

type State struct {
	Accounts map[int64]Account `json:"accounts"`
}

type Problem struct {
	Status  int
	Code    string
	Message string
}

func (p *Problem) Error() string                     { return p.Message }
func problem(status int, code, message string) error { return &Problem{status, code, message} }

func providerName(platform string) string {
	switch platform {
	case "openai":
		return "sub-openai"
	case "anthropic":
		return "sub-claude"
	case "grok":
		return "sub-grok"
	case "gemini":
		return "sub-gemini"
	}
	return ""
}

func eligibleKey(k SourceKey, userID int64, now time.Time) bool {
	return k.UserID == userID && k.Key != "" && k.Status == "active" && k.Group != nil && k.Group.Status == "active" && providerName(k.Group.Platform) != "" && (k.ExpiresAt == nil || k.ExpiresAt.After(now))
}
