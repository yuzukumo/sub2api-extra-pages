package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const testModelData = `{
  "openai":{"models":{
    "test-model":{"reasoning_options":[{"type":"effort","values":["low","high","future-effort"]}],"modalities":{"input":["text","image"],"output":["text"]},"limit":{"context":1200,"output":300}},
    "unowned-model":{"reasoning_options":[{"type":"effort","values":["none"]}]}
  }},
  "anthropic":{"models":{"budget-model":{"reasoning_options":[{"type":"budget_tokens","min":1024}],"limit":{"context":2400}}}},
  "xai":{"models":{"grok-model":{"reasoning_options":[{"type":"effort","values":["medium","xhigh"]}],"limit":{"context":4800}}}},
  "google":{"models":{"gemini-model":{"reasoning_options":[{"type":"effort","values":["minimal","high"]}],"modalities":{"input":["text","image"]},"limit":{"context":9600,"output":600}}}}
}`

func setModelsDev(t *testing.T, s *Server, data string) {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(data))
	}))
	t.Cleanup(upstream.Close)
	s.catalog = newModelCatalog(upstream.Client(), "")
	s.catalog.endpoint = upstream.URL
}

func TestCatalogUsesProviderEffortEnumsAndDefaultLevelsWithoutExpandingPermissions(t *testing.T) {
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(testModelData))
	}))
	defer upstream.Close()
	c := newModelCatalog(upstream.Client(), "")
	c.endpoint = upstream.URL
	if models := c.models(context.Background(), Account{}, false); len(models) != 0 || calls.Load() != 0 {
		t.Fatal("an account without selected keys fetched or received models")
	}
	a := Account{Bindings: []Binding{
		{Provider: "sub-grok", Models: []string{"grok-model"}},
		{Provider: "sub-openai", Models: []string{"openai/test-model", "missing-model"}},
		{Provider: "sub-claude", Models: []string{"budget-model"}},
		{Provider: "sub-gemini", Models: []string{"gemini-model", "google/gemini-model"}},
	}}
	want := []Model{
		{ID: "budget-model", Provider: "sub-claude", Efforts: []string{"low", "medium", "high"}, EffortSource: "default", ContextWindow: 2400},
		{ID: "gemini-model", Provider: "sub-gemini", Efforts: []string{"minimal", "high"}, EffortSource: "models.dev", ContextWindow: 9600, MaxOutputTokens: 600, SupportsVision: true},
		{ID: "google/gemini-model", Provider: "sub-gemini", Efforts: []string{"minimal", "high"}, EffortSource: "models.dev", ContextWindow: 9600, MaxOutputTokens: 600, SupportsVision: true},
		{ID: "grok-model", Provider: "sub-grok", Efforts: []string{"medium", "xhigh"}, EffortSource: "models.dev", ContextWindow: 4800},
		{ID: "missing-model", Provider: "sub-openai", Efforts: []string{"low", "medium", "high"}, EffortSource: "default"},
		{ID: "openai/test-model", Provider: "sub-openai", Efforts: []string{"low", "high", "future-effort"}, EffortSource: "models.dev", ContextWindow: 1200, MaxOutputTokens: 300, SupportsVision: true},
	}
	got := c.models(context.Background(), a, false)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("model metadata differs from its sources\ngot %#v\nwant %#v", got, want)
	}
	got[len(got)-1].Efforts[0] = "mutated"
	if !reflect.DeepEqual(c.models(context.Background(), a, false), want) || calls.Load() != 1 {
		t.Fatal("catalog was mutated by a caller or downloaded for every request")
	}
}

func TestCatalogLimitsContextToFirstPricingTierOnlyWhenEnabled(t *testing.T) {
	data := `{"openai":{"models":{
		"tiered-model":{"limit":{"context":10000},"cost":{"tiers":[{"tier":{"type":"context","size":6000}},{"tier":{"type":"tokens","size":50}},{"tier":{"type":"context","size":2000}}]}},
		"short-model":{"limit":{"context":1000},"cost":{"tiers":[{"tier":{"type":"context","size":2000}}]}},
		"flat-model":{"limit":{"context":8000}},
		"invalid-tier-model":{"limit":{"context":7000},"cost":{"tiers":[{"tier":{"type":"context","size":0}},{"tier":{"type":"context","size":-100}}]}}
	}}}`
	a := Account{Bindings: []Binding{{Provider: "sub-openai", Models: []string{"tiered-model", "short-model", "flat-model", "invalid-tier-model"}}}}
	for _, enabled := range []bool{false, true} {
		t.Run(map[bool]string{false: "disabled", true: "enabled"}[enabled], func(t *testing.T) {
			s := testServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
			setModelsDev(t, s, data)
			models := s.catalog.models(context.Background(), a, enabled)
			want := []int{8000, 7000, 1000, 10000}
			if len(models) != len(want) {
				t.Fatal("context policy changed the available model list")
			}
			if enabled {
				want[3] = 2000
			}
			for i, model := range models {
				if model.ContextWindow != want[i] {
					t.Fatalf("%s context = %d, want %d", model.ID, model.ContextWindow, want[i])
				}
			}
		})
	}
}

func TestCatalogColdFailureUsesDefaultLevelsAndRetriesLater(t *testing.T) {
	for _, response := range []struct {
		name   string
		status int
		body   string
	}{{"unavailable", 503, ""}, {"invalid", 200, "{"}, {"empty", 200, "{}"}} {
		t.Run(response.name, func(t *testing.T) {
			var calls atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.WriteHeader(response.status)
				_, _ = w.Write([]byte(response.body))
			}))
			defer upstream.Close()
			c := newModelCatalog(upstream.Client(), "")
			c.endpoint = upstream.URL
			a := Account{Bindings: []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}}
			want := []Model{{ID: "test-model", Provider: "sub-openai", Efforts: []string{"low", "medium", "high"}, EffortSource: "default"}}
			for range 2 {
				if got := c.models(context.Background(), a, false); !reflect.DeepEqual(got, want) {
					t.Fatal("missing source data prevented the default reasoning selector")
				}
			}
			if calls.Load() != 3 {
				t.Fatal("a failed sync must stop after its initial attempt and two retries")
			}
			c.attemptedAt = time.Now().Add(-2 * time.Hour)
			_ = c.models(context.Background(), a, false)
			if calls.Load() != 3 {
				t.Fatal("a failed sync was retried before the next three-hour interval")
			}
			c.attemptedAt = time.Now().Add(-3*time.Hour - time.Minute)
			_ = c.models(context.Background(), a, false)
			if calls.Load() != 6 {
				t.Fatal("failed catalog download was never retried")
			}
		})
	}
}

func TestCatalogCacheSurvivesRestartAndKeepsStaleDataWhenRefreshFails(t *testing.T) {
	var calls atomic.Int32
	var unavailable atomic.Bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if unavailable.Load() {
			w.WriteHeader(503)
			return
		}
		_, _ = w.Write([]byte(testModelData))
	}))
	defer upstream.Close()
	dir := t.TempDir()
	c := newModelCatalog(upstream.Client(), dir)
	c.endpoint = upstream.URL
	a := Account{Bindings: []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}}
	want := c.models(context.Background(), a, false)
	if want[0].EffortSource != "models.dev" {
		t.Fatal("initial catalog download failed")
	}
	cachePath := filepath.Join(dir, "models-dev.json")
	if _, err := os.Stat(cachePath); err != nil {
		t.Fatal(err)
	}
	unavailable.Store(true)
	restarted := newModelCatalog(upstream.Client(), dir)
	restarted.endpoint = upstream.URL
	if !reflect.DeepEqual(restarted.models(context.Background(), a, false), want) || calls.Load() != 1 {
		t.Fatal("fresh persisted metadata was discarded on restart")
	}
	stale := time.Now().Add(-3*time.Hour - time.Minute)
	if err := os.Chtimes(cachePath, stale, stale); err != nil {
		t.Fatal(err)
	}
	staleCatalog := newModelCatalog(upstream.Client(), dir)
	staleCatalog.endpoint = upstream.URL
	if !reflect.DeepEqual(staleCatalog.models(context.Background(), a, false), want) || calls.Load() != 4 {
		t.Fatal("stale metadata was discarded or not refreshed")
	}
	unavailable.Store(false)
	staleCatalog.attemptedAt = stale
	_ = staleCatalog.models(context.Background(), a, false)
	_ = staleCatalog.models(context.Background(), a, false)
	if calls.Load() != 5 {
		t.Fatal("a recovered catalog did not resume normal caching")
	}
}

func TestCatalogSuccessfulRetryStopsRemainingAttempts(t *testing.T) {
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(503)
			return
		}
		_, _ = w.Write([]byte(testModelData))
	}))
	defer upstream.Close()
	c := newModelCatalog(upstream.Client(), "")
	c.endpoint = upstream.URL
	a := Account{Bindings: []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}}
	if models := c.models(context.Background(), a, false); models[0].EffortSource != "models.dev" || calls.Load() != 2 {
		t.Fatal("a recovered download did not stop retrying")
	}
	_ = c.models(context.Background(), a, false)
	if calls.Load() != 2 {
		t.Fatal("successful retry was not cached")
	}
}

func TestCatalogBackgroundSyncRunsWithoutUserRequestsAndStopsOnCancellation(t *testing.T) {
	requested := make(chan struct{}, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested <- struct{}{}
		_, _ = w.Write([]byte(testModelData))
	}))
	defer upstream.Close()
	c := newModelCatalog(upstream.Client(), "")
	c.endpoint = upstream.URL
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stopped := make(chan struct{})
	go func() {
		c.run(ctx)
		close(stopped)
	}()
	select {
	case <-requested:
	case <-time.After(time.Second):
		t.Fatal("background worker waited for an inference request before syncing")
	}
	a := Account{Bindings: []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}}
	if c.models(context.Background(), a, false)[0].EffortSource != "models.dev" {
		t.Fatal("background sync did not update request metadata")
	}
	cancel()
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("background worker did not stop on shutdown")
	}
}

func TestCatalogConcurrentRequestsShareOneSnapshot(t *testing.T) {
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(testModelData))
	}))
	defer upstream.Close()
	c := newModelCatalog(upstream.Client(), "")
	c.endpoint = upstream.URL
	a := Account{Bindings: []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}}
	var workers sync.WaitGroup
	for range 8 {
		workers.Go(func() {
			if models := c.models(context.Background(), a, false); len(models) != 1 || models[0].EffortSource != "models.dev" {
				t.Error("concurrent request lost model capabilities")
			}
		})
	}
	workers.Wait()
	if calls.Load() != 1 {
		t.Fatal("concurrent requests downloaded the same catalog repeatedly")
	}
}
