package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type session struct {
	UserID  int64
	Expires time.Time
}
type Server struct {
	config    Config
	clients   *Clients
	catalog   *ModelCatalog
	store     *Store
	work      sync.Mutex
	sessionMu sync.Mutex
	sessions  map[string]session
	loginMu   sync.Mutex
	logins    map[string][]time.Time
}

func newServer(c Config, store *Store) *Server {
	client := &http.Client{
		Timeout:       30 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
	return &Server{config: c, store: store, clients: &Clients{c, client}, catalog: newModelCatalog(client, c.DataDir), sessions: map[string]session{}, logins: map[string][]time.Time{}}
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) { respond(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/public", s.public)
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("POST /api/logout", s.logout)
	mux.HandleFunc("GET /api/account", s.account)
	mux.HandleFunc("POST /api/sync", s.synchronize)
	mux.HandleFunc("POST /api/key/rotate", s.rotate)
	mux.HandleFunc("GET /v1/models", s.listModels)
	mux.HandleFunc("GET /models", s.listModels)
	mux.HandleFunc("POST /v1/chat/completions", s.proxy)
	mux.HandleFunc("POST /chat/completions", s.proxy)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, problem(404, "not_found", "Endpoint not found")) })
	mux.HandleFunc("/v1/", func(w http.ResponseWriter, r *http.Request) { fail(w, problem(404, "not_found", "Endpoint not found")) })
	mux.HandleFunc("/", s.static)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		if strings.HasPrefix(r.URL.Path, "/api/") || inferencePath(r.URL.Path) {
			w.Header().Set("Cache-Control", "no-store")
		}
		if r.Method != "GET" && r.Method != "HEAD" && !inferencePath(r.URL.Path) {
			origin := r.Header.Get("Origin")
			if origin != "" && origin != s.publicURL(r) {
				fail(w, problem(403, "invalid_origin", "Request origin is not allowed"))
				return
			}
			mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if mediaType != "application/json" {
				fail(w, problem(415, "invalid_content_type", "Use application/json"))
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}

func inferencePath(path string) bool {
	return strings.HasPrefix(path, "/v1/") || path == "/models" || path == "/chat/completions"
}

func (s *Server) publicURL(r *http.Request) string {
	if s.config.PublicURL != "" {
		return s.config.PublicURL
	}
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, err error) {
	var p *Problem
	if !errors.As(err, &p) {
		p = &Problem{500, "internal_error", "Unable to complete request"}
	}
	respond(w, p.Status, map[string]any{"error": map[string]string{"code": p.Code, "message": p.Message}})
}
func decode(w http.ResponseWriter, r *http.Request, value any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return problem(400, "invalid_request", "Invalid request body")
	}
	if d.Decode(&struct{}{}) != io.EOF {
		return problem(400, "invalid_request", "Invalid request body")
	}
	return nil
}
func randomToken() (string, error) {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return hex.EncodeToString(data), nil
}
func generateGatewayKey() (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	return "sk-" + token, nil
}
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func (s *Server) authenticate(r *http.Request) (Account, error) {
	cookie, err := r.Cookie("cursor_session")
	if err != nil {
		return Account{}, problem(401, "unauthorized", "Please sign in")
	}
	s.sessionMu.Lock()
	session, ok := s.sessions[hashToken(cookie.Value)]
	s.sessionMu.Unlock()
	if !ok || !session.Expires.After(time.Now()) {
		return Account{}, problem(401, "unauthorized", "Please sign in")
	}
	a, ok := s.store.snapshot().Accounts[session.UserID]
	if !ok {
		return a, problem(401, "unauthorized", "Please sign in")
	}
	a, err = s.identity(r.Context(), a)
	if err != nil {
		return a, err
	}
	return a, nil
}

func (s *Server) identity(ctx context.Context, a Account) (Account, error) {
	updated, err := s.clients.identity(ctx, a)
	if err != nil && updated.AccessToken == a.AccessToken && updated.RefreshToken == a.RefreshToken {
		return updated, err
	}
	if saveErr := s.store.save(&updated); saveErr != nil {
		return updated, saveErr
	}
	return updated, err
}

func (s *Server) public(w http.ResponseWriter, r *http.Request) {
	var data struct {
		SiteName         string `json:"site_name"`
		TurnstileEnabled bool   `json:"turnstile_enabled"`
		TurnstileSiteKey string `json:"turnstile_site_key"`
		TencentEnabled   bool   `json:"tencent_captcha_enabled"`
		TencentAppID     string `json:"tencent_captcha_app_id"`
		AliyunEnabled    bool   `json:"aliyun_captcha_enabled"`
	}
	if err := s.clients.call(r.Context(), s.config.SubURL, "/api/v1/settings/public", "GET", "", nil, &data, false); err != nil {
		fail(w, err)
		return
	}
	respond(w, 200, data)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	s.loginMu.Lock()
	now := time.Now()
	for address, times := range s.logins {
		if len(times) == 0 || now.Sub(times[len(times)-1]) >= time.Minute {
			delete(s.logins, address)
		}
	}
	attempts := []time.Time{}
	for _, t := range s.logins[host] {
		if now.Sub(t) < time.Minute {
			attempts = append(attempts, t)
		}
	}
	limited := len(attempts) >= 10
	if !limited {
		s.logins[host] = append(attempts, now)
	}
	s.loginMu.Unlock()
	if limited {
		fail(w, problem(429, "rate_limited", "Too many login attempts. Try again later"))
		return
	}
	var input LoginRequest
	if err := decode(w, r, &input); err != nil {
		fail(w, err)
		return
	}
	s.work.Lock()
	defer s.work.Unlock()
	t, err := s.clients.login(r.Context(), input)
	if err != nil {
		fail(w, err)
		return
	}
	if t.Requires2FA {
		respond(w, 200, map[string]any{"requires_2fa": true, "temp_token": t.TempToken})
		return
	}
	if t.User.ID == 0 || t.AccessToken == "" {
		fail(w, problem(502, "upstream_response", "Invalid login response"))
		return
	}
	a := s.store.snapshot().Accounts[t.User.ID]
	a.User = t.User
	a.AccessToken = t.AccessToken
	a.RefreshToken = t.RefreshToken
	a.TokenExpires = time.Now().Add(time.Duration(max(t.ExpiresIn, 60)) * time.Second)
	a, err = s.clients.sync(r.Context(), a)
	if err != nil {
		fail(w, err)
		return
	}
	if err := s.store.save(&a); err != nil {
		fail(w, err)
		return
	}
	token, err := randomToken()
	if err != nil {
		fail(w, err)
		return
	}
	s.sessionMu.Lock()
	for key, session := range s.sessions {
		if !session.Expires.After(now) {
			delete(s.sessions, key)
		}
	}
	s.sessions[hashToken(token)] = session{a.User.ID, time.Now().Add(24 * time.Hour)}
	s.sessionMu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "cursor_session", Value: token, Path: "/", HttpOnly: true, Secure: strings.HasPrefix(s.publicURL(r), "https://"), SameSite: http.SameSiteStrictMode, MaxAge: 86400})
	s.accountResponse(w, r, a)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("cursor_session"); err == nil {
		s.sessionMu.Lock()
		delete(s.sessions, hashToken(cookie.Value))
		s.sessionMu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: "cursor_session", Value: "", Path: "/", HttpOnly: true, Secure: strings.HasPrefix(s.publicURL(r), "https://"), SameSite: http.SameSiteStrictMode, MaxAge: -1})
	respond(w, 200, map[string]bool{"ok": true})
}

func (s *Server) accountResponse(w http.ResponseWriter, r *http.Request, a Account) {
	respond(w, 200, map[string]any{
		"user":                a.User,
		"key":                 a.GatewayKey,
		"base_url":            s.publicURL(r) + "/v1",
		"bindings":            a.Bindings,
		"source_keys":         a.SourceKeys,
		"selected_source_ids": a.SelectedSourceIDs,
		"models":              s.catalog.models(r.Context(), a, s.config.LimitContextToFirstTier),
		"synced_at":           a.SyncedAt,
	})
}
func (s *Server) account(w http.ResponseWriter, r *http.Request) {
	s.work.Lock()
	defer s.work.Unlock()
	a, err := s.authenticate(r)
	if err != nil {
		fail(w, err)
		return
	}
	keys, err := s.clients.keys(r.Context(), a)
	if err != nil {
		fail(w, err)
		return
	}
	a.SourceKeys = keySummaries(keys, a.User.ID)
	s.accountResponse(w, r, a)
}
func (s *Server) synchronize(w http.ResponseWriter, r *http.Request) {
	s.work.Lock()
	defer s.work.Unlock()
	a, err := s.authenticate(r)
	if err != nil {
		fail(w, err)
		return
	}
	var input struct {
		KeyIDs []int64 `json:"key_ids"`
	}
	if err := decode(w, r, &input); err != nil {
		fail(w, err)
		return
	}
	keys, err := s.clients.keys(r.Context(), a)
	if err != nil {
		fail(w, err)
		return
	}
	summaries := keySummaries(keys, a.User.ID)
	seen := map[int64]bool{}
	for _, id := range input.KeyIDs {
		found := false
		for _, key := range summaries {
			if key.ID == id && key.Usable {
				found = true
				break
			}
		}
		if !found || seen[id] {
			fail(w, problem(400, "invalid_source_key", "Select active keys belonging to your account"))
			return
		}
		seen[id] = true
	}
	a.SelectedSourceIDs = input.KeyIDs
	if a.SelectedSourceIDs == nil {
		a.SelectedSourceIDs = []int64{}
	}
	a, err = s.clients.sync(r.Context(), a)
	if err != nil {
		fail(w, err)
		return
	}
	if err := s.store.save(&a); err != nil {
		fail(w, err)
		return
	}
	s.accountResponse(w, r, a)
}

func (s *Server) rotate(w http.ResponseWriter, r *http.Request) {
	s.work.Lock()
	defer s.work.Unlock()
	a, err := s.authenticate(r)
	if err != nil {
		fail(w, err)
		return
	}
	if a.VirtualID == "" {
		fail(w, problem(409, "no_key", "No aggregate key exists yet"))
		return
	}
	value, err := generateGatewayKey()
	if err != nil {
		fail(w, err)
		return
	}
	a.GatewayKey = value
	if err := s.store.save(&a); err != nil {
		fail(w, err)
		return
	}
	s.accountResponse(w, r, a)
}

func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && r.Method != "HEAD" {
		w.WriteHeader(405)
		return
	}
	file := filepath.Join(s.config.WebDir, filepath.Clean("/"+r.URL.Path))
	if info, err := os.Stat(file); err == nil && !info.IsDir() {
		http.ServeFile(w, r, file)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/assets/") {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.config.WebDir, "index.html"))
}
