package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"slices"
	"time"
)

type bifrostKey struct {
	ID      string   `json:"id,omitempty"`
	Name    string   `json:"name"`
	Value   string   `json:"value"`
	Models  []string `json:"models"`
	Weight  float64  `json:"weight"`
	Enabled bool     `json:"enabled"`
}
type virtualProvider struct {
	Provider string   `json:"provider"`
	KeyIDs   []string `json:"key_ids"`
	Models   []string `json:"allowed_models"`
	Weight   float64  `json:"weight"`
}
type virtualRequest struct {
	Name                  string            `json:"name"`
	Active                bool              `json:"is_active"`
	AllProviders          bool              `json:"allow_all_providers"`
	Providers             []virtualProvider `json:"provider_configs"`
	DisableContentLogging bool              `json:"disable_content_logging"`
}
type virtualResponse struct {
	Virtual struct {
		ID    string          `json:"id"`
		Value json.RawMessage `json:"value"`
	} `json:"virtual_key"`
}

func secretValue(raw json.RawMessage) (string, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err == nil && value != "" {
		return value, nil
	}
	var secret struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &secret); err != nil || secret.Value == "" {
		return "", problem(502, "bifrost_response", "Bifrost did not return a key value")
	}
	return secret.Value, nil
}

func (c *Clients) ensureProvider(ctx context.Context, provider string) error {
	var existing struct {
		Network     map[string]json.RawMessage `json:"network_config"`
		Concurrency json.RawMessage            `json:"concurrency_and_buffer_size"`
		Custom      json.RawMessage            `json:"custom_provider_config"`
	}
	err := c.bifrost(ctx, "/api/providers/"+provider, "GET", nil, &existing)
	if err == nil {
		var baseURL string
		var private bool
		_ = json.Unmarshal(existing.Network["base_url"], &baseURL)
		_ = json.Unmarshal(existing.Network["allow_private_network"], &private)
		if baseURL == c.config.SubURL && private {
			return nil
		}
		if existing.Network == nil {
			return problem(502, "bifrost_response", "Bifrost did not return a provider configuration")
		}
		existing.Network["base_url"], _ = json.Marshal(c.config.SubURL)
		existing.Network["allow_private_network"] = json.RawMessage("true")
		input := map[string]any{"network_config": existing.Network, "concurrency_and_buffer_size": existing.Concurrency, "custom_provider_config": existing.Custom}
		return c.bifrost(ctx, "/api/providers/"+provider, "PUT", input, nil)
	}
	p, ok := err.(*Problem)
	if !ok || p.Status != 404 {
		return err
	}
	base := "openai"
	if provider == "sub-claude" {
		base = "anthropic"
	}
	input := map[string]any{
		"provider": provider,
		"network_config": map[string]any{
			"base_url":                           c.config.SubURL,
			"allow_private_network":              true,
			"default_request_timeout_in_seconds": 600,
		},
		"custom_provider_config": map[string]any{
			"base_provider_type": base,
			"allowed_requests": map[string]bool{
				"responses":        true,
				"responses_stream": true,
			},
		},
	}
	return c.bifrost(ctx, "/api/providers", "POST", input, nil)
}

func (c *Clients) sync(ctx context.Context, a Account) (Account, error) {
	keys, err := c.keys(ctx, a)
	if err != nil {
		return a, err
	}
	a.SourceKeys = keySummaries(keys, a.User.ID)
	type discoveredKey struct {
		key    SourceKey
		models []string
	}
	discovered := []discoveredKey{}
	bindings := []Binding{}
	seen := map[string]bool{}
	for _, k := range keys {
		if !slices.Contains(a.SelectedSourceIDs, k.ID) || !eligibleKey(k, a.User.ID, time.Now()) {
			continue
		}
		models, err := c.models(ctx, k.Key)
		if err != nil {
			return a, err
		}
		for _, id := range models {
			if seen[id] {
				return a, problem(409, "duplicate_model", "Multiple source keys expose the same model. Keep one active key per model")
			}
			seen[id] = true
		}
		discovered = append(discovered, discoveredKey{k, models})
	}
	for _, item := range discovered {
		k, models := item.key, item.models
		provider := providerName(k.Group.Platform)
		if err := c.ensureProvider(ctx, provider); err != nil {
			return a, err
		}
		input := bifrostKey{Name: fmt.Sprintf("cursor-user-%d-key-%d", a.User.ID, k.ID), Value: k.Key, Models: models, Weight: 1, Enabled: true}
		path := "/api/providers/" + provider + "/keys"
		method := "POST"
		var existing struct {
			Keys []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"keys"`
		}
		if err := c.bifrost(ctx, path, "GET", nil, &existing); err != nil {
			return a, err
		}
		for _, key := range existing.Keys {
			if key.Name == input.Name {
				path += "/" + url.PathEscape(key.ID)
				method = "PUT"
				break
			}
		}
		var output struct {
			ID string `json:"id"`
		}
		if err := c.bifrost(ctx, path, method, input, &output); err != nil {
			return a, err
		}
		if output.ID == "" {
			return a, problem(502, "bifrost_response", "Bifrost did not return a provider key ID")
		}
		bindings = append(bindings, Binding{SourceID: k.ID, Name: k.Name, Group: k.Group.Name, Provider: provider, BifrostID: output.ID, Models: models})
	}
	providers := []virtualProvider{}
	for _, provider := range []string{"sub-openai", "sub-claude", "sub-grok"} {
		ids := []string{}
		models := []string{}
		for _, b := range bindings {
			if b.Provider == provider {
				ids = append(ids, b.BifrostID)
				models = append(models, b.Models...)
			}
		}
		if len(ids) > 0 {
			providers = append(providers, virtualProvider{provider, ids, models, 1})
		}
	}
	if len(bindings) == 0 && a.VirtualID == "" {
		a.Bindings = bindings
		a.SyncedAt = time.Now()
		return a, nil
	}
	input := virtualRequest{Name: fmt.Sprintf("cursor-user-%d", a.User.ID), Active: len(bindings) > 0, Providers: providers, DisableContentLogging: true}
	if a.VirtualID == "" {
		var existing struct {
			Keys []struct {
				ID    string          `json:"id"`
				Name  string          `json:"name"`
				Value json.RawMessage `json:"value"`
			} `json:"virtual_keys"`
		}
		if err := c.bifrost(ctx, "/api/governance/virtual-keys", "GET", nil, &existing); err != nil {
			return a, err
		}
		for _, key := range existing.Keys {
			if key.Name != input.Name {
				continue
			}
			value, err := secretValue(key.Value)
			if err != nil {
				return a, err
			}
			a.VirtualID = key.ID
			a.VirtualKey = value
			break
		}
	}
	path := "/api/governance/virtual-keys"
	method := "POST"
	if a.VirtualID != "" {
		path += "/" + url.PathEscape(a.VirtualID)
		method = "PUT"
	}
	var output virtualResponse
	if err := c.bifrost(ctx, path, method, input, &output); err != nil {
		return a, err
	}
	if a.VirtualID == "" {
		a.VirtualID = output.Virtual.ID
		value, err := secretValue(output.Virtual.Value)
		if err != nil {
			return a, err
		}
		a.VirtualKey = value
		if a.VirtualKey == "" || a.VirtualID == "" {
			return a, problem(502, "bifrost_response", "Bifrost did not return a virtual key")
		}
	}
	for _, old := range a.Bindings {
		if !slices.ContainsFunc(bindings, func(b Binding) bool { return b.BifrostID == old.BifrostID }) {
			if err := c.bifrost(ctx, "/api/providers/"+old.Provider+"/keys/"+url.PathEscape(old.BifrostID), "DELETE", nil, nil); err != nil {
				p, ok := err.(*Problem)
				if !ok || p.Status != 404 {
					return a, err
				}
			}
		}
	}
	if a.GatewayKey == "" {
		value, err := generateGatewayKey()
		if err != nil {
			return a, err
		}
		a.GatewayKey = value
	}
	a.Bindings = bindings
	a.SyncedAt = time.Now()
	return a, nil
}
