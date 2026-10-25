package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

const modelSyncInterval = 3 * time.Hour

type modelSpec struct {
	CanonicalModelID string `json:"canonical_model_id"`
	Type             string `json:"type"`
	Reasoning        *bool  `json:"reasoning"`
	ReasoningOptions []struct {
		Type   string   `json:"type"`
		Values []string `json:"values"`
	} `json:"reasoning_options"`
	Limit struct {
		Context int `json:"context"`
		Output  int `json:"output"`
	} `json:"limit"`
	Modalities struct {
		Input []string `json:"input"`
	} `json:"modalities"`
	Cost struct {
		Tiers []struct {
			Tier struct {
				Type string `json:"type"`
				Size int    `json:"size"`
			} `json:"tier"`
		} `json:"tiers"`
	} `json:"cost"`
}

func (m modelSpec) contextWindow(limitToFirstTier bool) int {
	window := m.Limit.Context
	if !limitToFirstTier {
		return window
	}
	for _, tier := range m.Cost.Tiers {
		if tier.Tier.Type == "context" && tier.Tier.Size > 0 && tier.Tier.Size < window {
			window = tier.Tier.Size
		}
	}
	return window
}

type modelsDevData map[string]struct {
	Models map[string]modelSpec `json:"models"`
}

func (data modelsDevData) lookup(id string, providers []string) (modelSpec, string) {
	if provider, name, ok := strings.Cut(id, "/"); ok {
		if spec, found := data[provider].Models[name]; found {
			return spec, spec.author(provider)
		}
	}
	for _, provider := range providers {
		if spec, ok := data[provider].Models[id]; ok {
			return spec, spec.author(provider)
		}
	}
	return modelSpec{}, ""
}

func (m modelSpec) author(provider string) string {
	if author, _, ok := strings.Cut(m.CanonicalModelID, "/"); ok {
		return author
	}
	return provider
}

type ModelCatalog struct {
	mu          sync.Mutex
	http        *http.Client
	endpoint    string
	path        string
	data        modelsDevData
	fetchedAt   time.Time
	attemptedAt time.Time
}

func newModelCatalog(client *http.Client, dir string) *ModelCatalog {
	c := &ModelCatalog{http: client, endpoint: "https://models.dev/api.json?type=all"}
	if dir == "" {
		return c
	}
	c.path = filepath.Join(dir, "models-dev.json")
	data, err := os.ReadFile(c.path)
	var catalog modelsDevData
	if err != nil || json.Unmarshal(data, &catalog) != nil || len(catalog) == 0 {
		return c
	}
	c.data = catalog
	if info, err := os.Stat(c.path); err == nil {
		c.fetchedAt = info.ModTime()
	}
	return c
}

func (c *ModelCatalog) snapshot(ctx context.Context) modelsDevData {
	c.mu.Lock()
	defer c.mu.Unlock()
	if time.Since(c.fetchedAt) < modelSyncInterval || time.Since(c.attemptedAt) < modelSyncInterval {
		return c.data
	}
	c.attemptedAt = time.Now()
	for range 3 {
		data, next, ok := c.download(ctx)
		if !ok {
			if ctx.Err() != nil {
				break
			}
			continue
		}
		c.data = next
		c.fetchedAt = time.Now()
		if c.path != "" {
			if err := os.WriteFile(c.path+".tmp", data, 0600); err == nil {
				_ = os.Rename(c.path+".tmp", c.path)
			}
		}
		return c.data
	}
	slog.Warn("models.dev sync failed after three attempts, keeping cached metadata until next sync")
	return c.data
}

func (c *ModelCatalog) download(ctx context.Context) ([]byte, modelsDevData, bool) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", c.endpoint, nil)
	if err != nil {
		return nil, nil, false
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, nil, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, nil, false
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (16<<20)+1))
	var next modelsDevData
	if err != nil || len(data) > 16<<20 || json.Unmarshal(data, &next) != nil || len(next) == 0 {
		return nil, nil, false
	}
	return data, next, true
}

func (c *ModelCatalog) run(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		c.snapshot(ctx)
		c.mu.Lock()
		next := c.fetchedAt.Add(modelSyncInterval)
		if c.attemptedAt.After(c.fetchedAt) {
			next = c.attemptedAt.Add(modelSyncInterval)
		}
		c.mu.Unlock()
		timer := time.NewTimer(time.Until(next))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (c *ModelCatalog) models(ctx context.Context, a Account, limitToFirstTier bool) []Model {
	result := []Model{}
	if len(a.Bindings) == 0 {
		return result
	}
	data := c.snapshot(ctx)
	providers := append([]string{"openai", "anthropic", "xai", "google"}, slices.Sorted(maps.Keys(data))...)
	for _, b := range a.Bindings {
		for _, id := range b.Models {
			spec, author := data.lookup(id, providers)
			isOpenAI := author == "openai" || (author == "" && strings.HasPrefix(strings.TrimPrefix(id, "openai/"), "gpt-"))
			m := Model{
				ID: id, Provider: b.Provider, IsOpenAI: isOpenAI, Efforts: []string{"low", "medium", "high"}, EffortSource: "default",
				ContextWindow: spec.contextWindow(limitToFirstTier), MaxOutputTokens: spec.Limit.Output,
				SupportsVision: slices.Contains(spec.Modalities.Input, "image"),
			}
			if setting, ok := a.ContextOverrides[id]; ok && setting.ContextWindow > 0 && (setting.MissingSince.IsZero() || time.Now().Before(setting.MissingSince.Add(14*24*time.Hour))) {
				m.ContextWindow = setting.ContextWindow
				m.ContextWindowOverride = setting.ContextWindow
			}
			for _, option := range spec.ReasoningOptions {
				if option.Type == "effort" && len(option.Values) > 0 {
					m.Efforts = slices.Clone(option.Values)
					m.EffortSource = "models.dev"
					break
				}
			}
			if spec.Type == "image" || (m.IsOpenAI && spec.Reasoning != nil && !*spec.Reasoning) {
				m.Efforts = []string{}
				m.EffortSource = "models.dev"
			}
			if m.IsOpenAI && len(m.Efforts) > 0 {
				if slices.Contains(m.Efforts, "xhigh") {
					m.InjectedEffort = "xhigh"
				}
				if setting, ok := a.EffortOverrides[id]; ok && (setting.MissingSince.IsZero() || time.Now().Before(setting.MissingSince.Add(14*24*time.Hour))) && (setting.Effort == "" || slices.Contains(m.Efforts, setting.Effort)) {
					m.InjectedEffort = setting.Effort
					m.EffortOverride = &setting.Effort
				}
			}
			result = append(result, m)
		}
	}
	slices.SortFunc(result, func(a, b Model) int { return strings.Compare(a.ID, b.ID) })
	return result
}
