package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestResponsesProxyRoutesSelectedModelsAndPreservesSearchResults(t *testing.T) {
	response := `{"id":"resp-search","object":"response","status":"completed","output":[{"type":"web_search_call","status":"completed"},{"type":"message","content":[{"type":"output_text","text":"Search answer","annotations":[{"type":"url_citation","url":"https://example.com/source","title":"Source"}]}]}],"usage":{"input_tokens":120,"output_tokens":40,"input_tokens_details":{"cached_tokens":80}}}`
	stream := "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"Search answer\"}\n\nevent: response.completed\ndata: " + response + "\n\n"
	input := json.RawMessage(`[{"role":"user","content":[{"type":"input_text","text":"Search query"}]}]`)
	tools := json.RawMessage(`[{"type":"web_search","filters":{"allowed_domains":["example.com"]}}]`)
	upstreamCalls := 0
	var forwardedModel string
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("unexpected Sub2API control request")
		w.WriteHeader(500)
	}, func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		username, password, ok := r.BasicAuth()
		wantUserAgent := "codex_vscode/0.162.0-alpha.17.2 (Mac OS 27.0.1; arm64) unknown (VS Code; 26.1007.21434)"
		if r.URL.Path != "/v1/responses" || r.Header.Get("x-bf-vk") != "internal-bifrost-key" || r.Header.Get("User-Agent") != wantUserAgent || r.Header.Get("x-bf-eh-user-agent") != wantUserAgent || !ok || username != "internal-admin" || password != "internal-password" {
			t.Error("Responses request used the wrong endpoint or client-controlled credentials")
		}
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if err := json.Unmarshal(body["model"], &forwardedModel); err != nil {
			t.Error(err)
			return
		}
		if !bytes.Equal(body["input"], input) || !bytes.Equal(body["tools"], tools) || string(body["include"]) != `["web_search_call.action.sources"]` || string(body["prompt_cache_key"]) != `"cache-id"` || string(body["cached_content"]) != `"cachedContents/test-cache"` {
			t.Error("Responses input, search settings, citations or cache settings were altered")
		}
		if body["fallbacks"] != nil || body["provider"] != nil || body["api_key"] != nil {
			t.Error("client-controlled upstream routing survived")
		}
		if string(body["stream"]) == "true" {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte(stream))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(response))
	})
	a := activeAccount()
	a.Bindings = []Binding{
		{Provider: "sub-openai", Models: []string{"test-model"}},
		{Provider: "sub-claude", Models: []string{"budget-model"}},
		{Provider: "sub-grok", Models: []string{"grok-model"}},
		{Provider: "sub-gemini", Models: []string{"gemini-model"}},
	}
	setModelsDev(t, s, testModelData)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	request := func(path, token string, body []byte) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", path, bytes.NewReader(body))
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Origin", "https://cursor.example")
		r.Header.Set("User-Agent", "codex_vscode/0.162.0-alpha.17.2 (Mac OS 27.0.1; arm64) unknown (VS Code; 26.1007.21434)")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("x-bf-vk", "untrusted-key")
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		return w
	}
	for _, path := range []string{"/v1/responses", "/responses"} {
		for _, token := range []string{"", "invalid-key", a.VirtualKey} {
			if w := request(path, token, []byte(`{"model":"test-model"}`)); w.Code != 401 {
				t.Fatalf("invalid public credential accepted on %s: %d", path, w.Code)
			}
		}
		if w := request(path, a.GatewayKey, []byte(`{"model":"unowned-model"}`)); w.Code != 403 || upstreamCalls != 0 {
			t.Fatalf("unselected model reached Responses upstream on %s", path)
		}
		for _, body := range []string{
			`{"model":"test-model","reasoning":{"effort":"unsupported"}}`,
			`{"model":"test-model","reasoning":{"effort":42}}`,
			`{"model":"test-model","reasoning":"invalid"}`,
		} {
			if w := request(path, a.GatewayKey, []byte(body)); w.Code != 400 || upstreamCalls != 0 {
				t.Fatalf("invalid reasoning reached Responses upstream on %s", path)
			}
		}
	}
	for _, path := range []string{"/v1/responses", "/responses"} {
		for _, binding := range a.Bindings {
			for _, streaming := range []bool{false, true} {
				body, err := json.Marshal(map[string]any{
					"model": binding.Models[0], "input": input, "tools": tools, "stream": streaming,
					"include": []string{"web_search_call.action.sources"}, "prompt_cache_key": "cache-id", "cached_content": "cachedContents/test-cache",
					"fallbacks": []string{"untrusted"}, "provider": "untrusted", "api_key": "untrusted",
				})
				if err != nil {
					t.Fatal(err)
				}
				w := request(path, a.GatewayKey, body)
				want, contentType := response, "application/json"
				if streaming {
					want, contentType = stream, "text/event-stream"
				}
				if w.Code != 200 || w.Body.String() != want || w.Header().Get("Content-Type") != contentType || w.Header().Get("X-Accel-Buffering") != "no" || w.Header().Get("Cache-Control") != "no-store" || (streaming && !w.Flushed) {
					t.Fatalf("Responses search output, citations or usage changed on %s: %d %s", path, w.Code, w.Body.String())
				}
				if forwardedModel != binding.Provider+"/"+binding.Models[0] {
					t.Fatalf("Responses model routed to another source provider: %s", forwardedModel)
				}
			}
		}
	}
}

func TestRemovedChatEndpointsDoNotReachUpstream(t *testing.T) {
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("removed endpoint reached Sub2API")
		w.WriteHeader(500)
	}, func(w http.ResponseWriter, r *http.Request) {
		t.Error("removed endpoint reached Bifrost")
		w.WriteHeader(500)
	})
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}}
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/v1/chat/completions", "/chat/completions", "/cursor/v1/chat/completions"} {
		r := httptest.NewRequest("POST", path, strings.NewReader(`{"model":"test-model","messages":[{"role":"user","content":"Hello"}]}`))
		r.Header.Set("Authorization", "Bearer "+a.GatewayKey)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		if w.Code < 400 {
			t.Fatalf("removed endpoint still accepts inference on %s", path)
		}
	}
}

func TestInferenceProxyPreservesUpstreamErrors(t *testing.T) {
	response := `{"error":{"code":"rate_limit_exceeded","message":"Try again later"}}`
	nativeResponse := `{"type":"error","error":{"type":"rate_limit_error","message":"Try again later"}}`
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		if r.URL.Path == "/anthropic/v1/messages" {
			_, _ = w.Write([]byte(nativeResponse))
		} else {
			_, _ = w.Write([]byte(response))
		}
	})
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-claude", Models: []string{"budget-model"}}}
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/v1/responses", "/responses", "/v1/messages", "/messages"} {
		r := httptest.NewRequest("POST", path, strings.NewReader(`{"model":"budget-model","input":"Search query","tools":[{"type":"web_search"}]}`))
		r.Header.Set("Authorization", "Bearer "+a.GatewayKey)
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		want := response
		if strings.HasSuffix(path, "/messages") {
			want = nativeResponse
		}
		if w.Code != http.StatusTooManyRequests || w.Body.String() != want {
			t.Fatalf("upstream error was hidden: %d %s", w.Code, w.Body.String())
		}
	}
}

func TestMessagesProxyPreservesNativeToolHistoryThinkingSearchAndUsage(t *testing.T) {
	fields := map[string]json.RawMessage{
		"system":        json.RawMessage(`[{"type":"text","text":"Complete the task","cache_control":{"type":"ephemeral"}}]`),
		"messages":      json.RawMessage(`[{"role":"user","content":"Inspect the project"},{"role":"assistant","content":[{"type":"thinking","thinking":"Inspect first","signature":"opaque-signature"},{"type":"tool_use","id":"tool-1","name":"inspect","input":{}}]},{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool-1","content":"Project inspected"}]}]`),
		"thinking":      json.RawMessage(`{"type":"adaptive","display":"summarized"}`),
		"output_config": json.RawMessage(`{"effort":"high","format":{"type":"json_schema","schema":{"type":"object"}}}`),
		"tools":         json.RawMessage(`[{"name":"inspect","input_schema":{"type":"object"}},{"type":"web_search_20250305","name":"web_search","max_uses":2}]`),
		"max_tokens":    json.RawMessage(`2048`),
	}
	response := `{"id":"msg-test","type":"message","role":"assistant","content":[{"type":"text","text":"Search answer","citations":[{"type":"web_search_result_location","url":"https://example.com/source","title":"Source","cited_text":"Evidence"}]}],"stop_reason":"end_turn","usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":80}}`
	stream := "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tool-next\",\"name\":\"inspect\",\"input\":{}}}\n\n" +
		"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{}\"}}\n\n" +
		"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":20,\"cache_read_input_tokens\":80}}\n\n" +
		"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
	upstreamCalls := 0
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("unexpected Sub2API control request")
		w.WriteHeader(500)
	}, func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		username, password, ok := r.BasicAuth()
		wantUserAgent := "codex_vscode/0.162.0-alpha.17.2 (Mac OS 27.0.1; arm64) unknown (VS Code; 26.1007.21434)"
		if r.URL.Path != "/anthropic/v1/messages" || r.Header.Get("x-bf-vk") != "internal-bifrost-key" || r.Header.Get("User-Agent") != wantUserAgent || r.Header.Get("x-bf-eh-user-agent") != wantUserAgent || !ok || username != "internal-admin" || password != "internal-password" || r.Header.Get("x-api-key") != "" {
			t.Error("native Messages used the wrong route or client-controlled credentials")
		}
		if r.Header.Get("anthropic-version") != "2023-06-01" || !slices.Equal(r.Header.Values("anthropic-beta"), []string{"test-beta-a", "test-beta-b"}) {
			t.Error("native Messages lost its API version or beta headers")
		}
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if string(body["model"]) != `"sub-claude/budget-model"` || body["fallbacks"] != nil || body["provider"] != nil || body["api_key"] != nil || body["reasoning"] != nil {
			t.Error("native Messages changed the source model or injected foreign settings")
		}
		for name, want := range fields {
			if !bytes.Equal(body[name], want) {
				t.Errorf("native Messages changed %s", name)
			}
		}
		if string(body["stream"]) == "true" {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte(stream))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(response))
	})
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-claude", Models: []string{"budget-model"}}}
	setModelsDev(t, s, testModelData)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	request := func(path, authorization, apiKey, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", path, strings.NewReader(body))
		r.Header.Set("Authorization", authorization)
		r.Header.Set("x-api-key", apiKey)
		r.Header.Set("Origin", "https://cursor.example")
		r.Header.Set("User-Agent", "codex_vscode/0.162.0-alpha.17.2 (Mac OS 27.0.1; arm64) unknown (VS Code; 26.1007.21434)")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("x-bf-vk", "untrusted-key")
		r.Header.Set("anthropic-version", "2023-06-01")
		r.Header.Add("anthropic-beta", "test-beta-a")
		r.Header.Add("anthropic-beta", "test-beta-b")
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		return w
	}
	for _, path := range []string{"/v1/messages", "/messages"} {
		for _, token := range []string{"", "invalid-key", a.VirtualKey} {
			if w := request(path, "", token, `{"model":"budget-model"}`); w.Code != 401 || upstreamCalls != 0 {
				t.Fatalf("invalid native Messages credential accepted on %s: %d", path, w.Code)
			}
		}
		if w := request(path, "Bearer invalid-key", a.GatewayKey, `{"model":"budget-model"}`); w.Code != 401 || upstreamCalls != 0 {
			t.Fatal("API key overrode invalid explicit Authorization")
		}
		if w := request(path, "", a.GatewayKey, `{"model":"unselected-model"}`); w.Code != 403 || upstreamCalls != 0 {
			t.Fatal("unselected model reached native Messages upstream")
		}
		for _, settings := range []string{`{"effort":"unsupported"}`, `{"effort":42}`, `"invalid"`} {
			if w := request(path, "", a.GatewayKey, `{"model":"budget-model","output_config":`+settings+`}`); w.Code != 400 || upstreamCalls != 0 {
				t.Fatal("invalid native effort reached upstream")
			}
		}
	}
	if w := request("/responses", "", a.GatewayKey, `{"model":"budget-model"}`); w.Code != 401 || upstreamCalls != 0 {
		t.Fatal("native API key authentication leaked into the Responses endpoint")
	}
	for _, path := range []string{"/v1/messages", "/messages"} {
		for _, streaming := range []bool{false, true} {
			body := map[string]any{"model": "budget-model", "stream": streaming, "fallbacks": []string{"untrusted"}, "provider": "untrusted", "api_key": "untrusted"}
			for name, value := range fields {
				body[name] = value
			}
			data, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			for _, authorization := range []string{"", "Bearer " + a.GatewayKey} {
				w := request(path, authorization, a.GatewayKey, string(data))
				want, contentType := response, "application/json"
				if streaming {
					want, contentType = stream, "text/event-stream"
				}
				if w.Code != 200 || w.Body.String() != want || w.Header().Get("Content-Type") != contentType || w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("X-Accel-Buffering") != "no" || (streaming && !w.Flushed) {
					t.Fatalf("native tools, citations, usage or stream changed on %s: %d %s", path, w.Code, w.Body.String())
				}
			}
		}
	}
	if upstreamCalls != 8 {
		t.Fatalf("native Messages requests did not reach upstream: %d", upstreamCalls)
	}
}

func TestCursorResponsesDiscoveryPreservesToolHistoryAndStreamState(t *testing.T) {
	input := json.RawMessage(`[{"role":"user","content":"Inspect the project"},{"type":"reasoning","id":"rs-test","summary":[],"encrypted_content":"opaque-state"},{"type":"message","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"I will inspect the project"}]},{"type":"function_call","call_id":"call-test","name":"inspect","arguments":"{}"},{"type":"function_call_output","call_id":"call-test","output":"Project inspected"}]`)
	stream := "event: response.output_item.added\ndata: {\"type\":\"response.output_item.added\",\"output_index\":1,\"item\":{\"type\":\"function_call\",\"id\":\"fc-test\",\"call_id\":\"call-next\",\"name\":\"verify\",\"arguments\":\"\"}}\n\nevent: response.function_call_arguments.delta\ndata: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":1,\"delta\":\"{}\"}\n\nevent: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"output\":[{\"type\":\"reasoning\",\"encrypted_content\":\"next-state\"},{\"type\":\"message\",\"role\":\"assistant\",\"phase\":\"commentary\",\"content\":[{\"type\":\"output_text\",\"text\":\"I will verify the result\"}]},{\"type\":\"function_call\",\"call_id\":\"call-next\",\"name\":\"verify\",\"arguments\":\"{}\"}],\"usage\":{\"input_tokens\":100,\"output_tokens\":20,\"input_tokens_details\":{\"cached_tokens\":80}}}}\n\n"
	upstreamCalls := 0
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("unexpected Sub2API control request")
		w.WriteHeader(500)
	}, func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		if r.URL.Path != "/v1/responses" {
			t.Errorf("Cursor discovery selected a lossy Chat conversion: %s", r.URL.Path)
		}
		var body struct {
			Model     string          `json:"model"`
			Input     json.RawMessage `json:"input"`
			Store     bool            `json:"store"`
			Reasoning struct {
				Effort string `json:"effort"`
			} `json:"reasoning"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if !bytes.Equal(body.Input, input) || body.Store {
			t.Error("assistant phase, reasoning state or tool history changed")
		}
		if body.Model != "sub-openai/test-model" && body.Model != "sub-grok/grok-model" && body.Model != "sub-gemini/gemini-model" {
			t.Error("model used the wrong source provider")
		}
		if body.Model == "sub-openai/test-model" && body.Reasoning.Effort != "xhigh" {
			t.Error("native Responses lost the default OpenAI effort")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(stream))
	})
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}, {Provider: "sub-grok", Models: []string{"grok-model"}}, {Provider: "sub-gemini", Models: []string{"gemini-model"}}}
	setModelsDev(t, s, testModelData)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	for _, prefix := range []string{"/v1", ""} {
		r := httptest.NewRequest("GET", prefix+"/models", nil)
		r.Header.Set("Authorization", "Bearer "+a.GatewayKey)
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		var catalog struct {
			Data []struct {
				ID       string   `json:"id"`
				APITypes []string `json:"api_types"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &catalog); err != nil || w.Code != 200 || len(catalog.Data) != 3 {
			t.Fatalf("model discovery failed: %d %s", w.Code, w.Body.String())
		}
		for _, model := range catalog.Data {
			if !slices.Equal(model.APITypes, []string{"responses"}) {
				t.Fatalf("Cursor would use Chat conversion for %s", model.ID)
			}
			body, err := json.Marshal(map[string]any{"model": model.ID, "input": input, "stream": true, "store": false, "tools": []map[string]string{{"type": "function", "name": "verify"}}})
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest("POST", prefix+"/"+model.APITypes[0], bytes.NewReader(body))
			r.Header.Set("Authorization", "Bearer "+a.GatewayKey)
			w := httptest.NewRecorder()
			s.routes().ServeHTTP(w, r)
			if w.Code != 200 || w.Body.String() != stream || !w.Flushed {
				t.Fatalf("Cursor lost native tool events, phase, reasoning state or cache usage: %d %s", w.Code, w.Body.String())
			}
		}
	}
	if upstreamCalls != 6 {
		t.Fatalf("discovered models did not reach Responses: %d calls", upstreamCalls)
	}
}

func TestModelListingAggregatesSelectedKeysWithoutAdministratorSetup(t *testing.T) {
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"test-model"}}, {Provider: "sub-claude", Models: []string{"budget-model"}}, {Provider: "sub-grok", Models: []string{"grok-model"}}}
	setModelsDev(t, s, testModelData)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/v1/models", "/models"} {
		r := httptest.NewRequest("GET", path, nil)
		r.Header.Set("Authorization", "Bearer gateway-key")
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		var result struct {
			Data []struct {
				ID            string   `json:"id"`
				ContextWindow int      `json:"context_window"`
				APITypes      []string `json:"api_types"`
				Capabilities  struct {
					ContextLength     int      `json:"context_length"`
					OutputModalities  []string `json:"output_modalities"`
					SupportsToolUse   bool     `json:"supports_tool_use"`
					SupportsStreaming bool     `json:"supports_streaming"`
					SupportsReasoning bool     `json:"supports_reasoning"`
					SupportsVision    bool     `json:"supports_vision"`
					MaxOutputTokens   int      `json:"max_output_tokens"`
					ReasoningEffort   []string `json:"reasoning_effort"`
				} `json:"capabilities"`
				Thinking struct {
					Levels []string `json:"levels"`
				} `json:"thinking"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if w.Code != 200 || len(result.Data) != 3 || result.Data[0].ID != "budget-model" || result.Data[1].ID != "grok-model" || result.Data[2].ID != "test-model" {
			t.Fatal("listing exposed an unselected model or required an admin catalog")
		}
		if !slices.Equal(result.Data[0].Thinking.Levels, []string{"low", "medium", "high"}) || !slices.Equal(result.Data[1].Thinking.Levels, []string{"medium", "xhigh"}) || !slices.Equal(result.Data[2].Thinking.Levels, []string{"low", "high", "future-effort"}) || result.Data[2].ContextWindow != 1200 {
			t.Fatal("listing lost sourced capabilities or default levels")
		}
		for _, model := range result.Data {
			capabilities := model.Capabilities
			apiType := "responses"
			if model.ID == "budget-model" {
				apiType = "anthropic_messages"
			}
			if !slices.Equal(model.APITypes, []string{apiType}) || !capabilities.SupportsToolUse || !capabilities.SupportsStreaming || !slices.Contains(capabilities.OutputModalities, "text") {
				t.Fatal("model discovery cannot identify the gateway's supported inference protocol")
			}
			if !capabilities.SupportsReasoning || !slices.Equal(capabilities.ReasoningEffort, model.Thinking.Levels) || capabilities.ContextLength != model.ContextWindow {
				t.Fatal("model discovery lost reasoning or context metadata")
			}
		}
		if !result.Data[2].Capabilities.SupportsVision || result.Data[2].Capabilities.MaxOutputTokens != 300 || result.Data[0].Capabilities.SupportsVision {
			t.Fatal("model discovery lost sourced vision or output limits")
		}
	}
}

func TestContextPolicyAppliesToBothCursorDiscoveryAndAccountModelList(t *testing.T) {
	a := activeAccount()
	a.Bindings = []Binding{{Provider: "sub-openai", Models: []string{"tiered-model"}}}
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/auth/me" {
			jsonResponse(w, map[string]any{"code": 0, "data": a.User})
			return
		}
		jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": []SourceKey{}, "pages": 1}})
	}, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	setModelsDev(t, s, `{"openai":{"models":{"tiered-model":{"limit":{"context":10000},"cost":{"tiers":[{"tier":{"type":"context","size":2000}}]}}}}}`)
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	for _, enabled := range []bool{false, true} {
		s.config.LimitContextToFirstTier = enabled
		want := 10000
		if enabled {
			want = 2000
		}
		for _, path := range []string{"/v1/models", "/models", "/api/account"} {
			r := sessionRequest(s, "GET", path, "")
			r.Header.Set("Authorization", "Bearer gateway-key")
			w := httptest.NewRecorder()
			s.routes().ServeHTTP(w, r)
			var result struct {
				Data []struct {
					ContextWindow int `json:"context_window"`
					Capabilities  struct {
						ContextLength int `json:"context_length"`
					} `json:"capabilities"`
				} `json:"data"`
				Models []Model `json:"models"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if w.Code != 200 {
				t.Fatalf("%s returned %d", path, w.Code)
			}
			if path == "/api/account" {
				if len(result.Models) != 1 || result.Models[0].ContextWindow != want {
					t.Fatal("account model context ignores pricing policy")
				}
			} else if len(result.Data) != 1 || result.Data[0].ContextWindow != want || result.Data[0].Capabilities.ContextLength != want {
				t.Fatal("Cursor model context ignores pricing policy")
			}
		}
	}
}

func TestInferenceKeepsRotatedTokensWhenIdentityOrKeySyncFails(t *testing.T) {
	for _, failingPath := range []string{"/api/v1/auth/me", "/api/v1/keys"} {
		t.Run(failingPath, func(t *testing.T) {
			a := activeAccount()
			a.TokenExpires = time.Now().Add(-time.Minute)
			a.RefreshToken = "old-refresh"
			a.SyncedAt = time.Now().Add(-time.Minute)
			refreshes := 0
			failed := false
			s := testServer(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/v1/auth/refresh" {
					refreshes++
					var input struct {
						RefreshToken string `json:"refresh_token"`
					}
					if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.RefreshToken != "old-refresh" || refreshes > 1 {
						t.Error("retried a consumed refresh token")
					}
					jsonResponse(w, map[string]any{"code": 0, "data": Tokens{AccessToken: "new-access", RefreshToken: "new-refresh", ExpiresIn: 3600}})
					return
				}
				if r.Header.Get("Authorization") != "Bearer new-access" {
					t.Error("request did not use refreshed credentials")
				}
				if r.URL.Path == failingPath && !failed {
					failed = true
					w.WriteHeader(503)
					return
				}
				if r.URL.Path == "/api/v1/auth/me" {
					jsonResponse(w, map[string]any{"code": 0, "data": a.User})
					return
				}
				jsonResponse(w, map[string]any{"code": 0, "data": map[string]any{"items": []SourceKey{}, "pages": 1}})
			}, func(w http.ResponseWriter, r *http.Request) {
				t.Error("account without selected keys changed Bifrost")
				w.WriteHeader(500)
			})
			if err := s.store.save(&a); err != nil {
				t.Fatal(err)
			}
			for _, want := range []int{http.StatusBadGateway, http.StatusOK} {
				r := httptest.NewRequest("GET", "/v1/models", nil)
				r.Header.Set("Authorization", "Bearer gateway-key")
				w := httptest.NewRecorder()
				s.routes().ServeHTTP(w, r)
				if w.Code != want {
					t.Fatalf("inference returned %d, want %d", w.Code, want)
				}
				stored := s.store.snapshot().Accounts[a.User.ID]
				if stored.AccessToken != "new-access" || stored.RefreshToken != "new-refresh" || refreshes != 1 {
					t.Fatal("transient upstream failure lost rotated credentials")
				}
			}
		})
	}
}

func TestProxyDefaultsOnlyUnspecifiedOpenAIEffortAndPreservesSettings(t *testing.T) {
	type requestBody struct {
		Model     string `json:"model"`
		Reasoning struct {
			Effort  string `json:"effort"`
			Summary string `json:"summary"`
		} `json:"reasoning"`
	}
	var forwarded []requestBody
	s := testServer(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, func(w http.ResponseWriter, r *http.Request) {
		var body requestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		forwarded = append(forwarded, body)
		jsonResponse(w, map[string]string{"id": "completion"})
	})
	setModelsDev(t, s, testModelData)
	a := activeAccount()
	a.Bindings = []Binding{
		{Provider: "sub-openai", Models: []string{"test-model", "missing-model"}},
		{Provider: "sub-claude", Models: []string{"budget-model"}},
		{Provider: "sub-grok", Models: []string{"grok-model"}},
		{Provider: "sub-gemini", Models: []string{"gemini-model"}},
	}
	if err := s.store.save(&a); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, input, model, effort, summary string
	}{
		{"omitted", `{"model":"test-model"}`, "sub-openai/test-model", "xhigh", ""},
		{"empty response effort", `{"model":"test-model","reasoning":{"effort":""}}`, "sub-openai/test-model", "xhigh", ""},
		{"null response effort", `{"model":"test-model","reasoning":{"effort":null}}`, "sub-openai/test-model", "xhigh", ""},
		{"preserve summary", `{"model":"test-model","reasoning":{"summary":"auto"}}`, "sub-openai/test-model", "xhigh", "auto"},
		{"missing metadata", `{"model":"missing-model"}`, "sub-openai/missing-model", "xhigh", ""},
		{"explicit response effort", `{"model":"test-model","reasoning":{"effort":"future-effort"}}`, "sub-openai/test-model", "future-effort", ""},
		{"explicit effort without metadata", `{"model":"missing-model","reasoning":{"effort":"medium"}}`, "sub-openai/missing-model", "medium", ""},
		{"Claude default", `{"model":"budget-model"}`, "sub-claude/budget-model", "", ""},
		{"Grok default", `{"model":"grok-model"}`, "sub-grok/grok-model", "", ""},
		{"Grok explicit effort", `{"model":"grok-model","reasoning":{"effort":"xhigh"}}`, "sub-grok/grok-model", "xhigh", ""},
		{"Gemini default", `{"model":"gemini-model"}`, "sub-gemini/gemini-model", "", ""},
		{"Gemini explicit effort", `{"model":"gemini-model","reasoning":{"effort":"minimal"}}`, "sub-gemini/gemini-model", "minimal", ""},
	}
	for _, path := range []string{"/v1/responses", "/responses"} {
		for _, tc := range cases {
			t.Run(path+"/"+tc.name, func(t *testing.T) {
				before := len(forwarded)
				r := httptest.NewRequest("POST", path, strings.NewReader(tc.input))
				r.Header.Set("Authorization", "Bearer gateway-key")
				w := httptest.NewRecorder()
				s.routes().ServeHTTP(w, r)
				if w.Code != 200 || len(forwarded) != before+1 {
					t.Fatalf("reasoning request failed %d %s", w.Code, w.Body.String())
				}
				got := forwarded[before]
				if got.Model != tc.model || got.Reasoning.Effort != tc.effort || got.Reasoning.Summary != tc.summary {
					t.Fatalf("wrong reasoning or model forwarded: %#v", got)
				}
			})
		}
	}
}
