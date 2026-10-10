package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Clients struct {
	config Config
	http   *http.Client
}
type envelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Reason  string          `json:"reason"`
	Data    json.RawMessage `json:"data"`
}
type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	User         User   `json:"user"`
	Requires2FA  bool   `json:"requires_2fa"`
	TempToken    string `json:"temp_token"`
}
type LoginRequest struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token,omitempty"`
	TencentTicket  string `json:"tencent_captcha_ticket,omitempty"`
	TencentRandstr string `json:"tencent_captcha_randstr,omitempty"`
	TempToken      string `json:"temp_token,omitempty"`
	TotpCode       string `json:"totp_code,omitempty"`
}

func (c *Clients) call(ctx context.Context, base, path, method, token string, body, output any, admin bool) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, base+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if admin {
		req.SetBasicAuth(c.config.BifrostUsername, c.config.BifrostPassword)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return problem(502, "upstream_unavailable", "Unable to reach upstream service")
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return problem(502, "upstream_response", "Unable to read upstream response")
	}
	if resp.StatusCode >= 400 {
		status := resp.StatusCode
		if status >= 500 {
			status = 502
		}
		return problem(status, "upstream_rejected", fmt.Sprintf("Upstream request rejected (%d)", resp.StatusCode))
	}
	if !admin {
		var e envelope
		if err := json.Unmarshal(data, &e); err != nil {
			return problem(502, "upstream_response", "Invalid sub2api response")
		}
		if e.Code != 0 {
			return problem(400, "upstream_rejected", "Sub2API rejected the request")
		}
		data = e.Data
	}
	if output == nil {
		return nil
	}
	if err := json.Unmarshal(data, output); err != nil {
		return problem(502, "upstream_response", "Invalid upstream response")
	}
	return nil
}

func (c *Clients) login(ctx context.Context, input LoginRequest) (Tokens, error) {
	var result Tokens
	path := "/api/v1/auth/login"
	if input.TempToken != "" {
		path = "/api/v1/auth/login/2fa"
	}
	err := c.call(ctx, c.config.SubURL, path, "POST", "", input, &result, false)
	return result, err
}

func (c *Clients) identity(ctx context.Context, a Account) (Account, error) {
	if !a.TokenExpires.After(time.Now().Add(time.Minute)) && a.RefreshToken != "" {
		var t Tokens
		if err := c.call(ctx, c.config.SubURL, "/api/v1/auth/refresh", "POST", "", map[string]string{"refresh_token": a.RefreshToken}, &t, false); err != nil {
			return a, err
		}
		a.AccessToken = t.AccessToken
		a.RefreshToken = t.RefreshToken
		a.TokenExpires = time.Now().Add(time.Duration(t.ExpiresIn) * time.Second)
	}
	var user User
	if err := c.call(ctx, c.config.SubURL, "/api/v1/auth/me", "GET", a.AccessToken, nil, &user, false); err != nil {
		return a, err
	}
	if user.ID != a.User.ID || user.Status != "active" {
		return a, problem(401, "session_expired", "Please sign in again")
	}
	a.User = user
	return a, nil
}

func (c *Clients) keys(ctx context.Context, a Account) ([]SourceKey, error) {
	result := []SourceKey{}
	for page := 1; ; page++ {
		var response struct {
			Items []SourceKey `json:"items"`
			Pages int         `json:"pages"`
		}
		if err := c.call(ctx, c.config.SubURL, fmt.Sprintf("/api/v1/keys?page=%d&page_size=100", page), "GET", a.AccessToken, nil, &response, false); err != nil {
			return nil, err
		}
		result = append(result, response.Items...)
		if page >= response.Pages {
			return result, nil
		}
		if page >= 100 {
			return nil, problem(400, "too_many_keys", "Too many source keys")
		}
	}
}

func (c *Clients) models(ctx context.Context, key string) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.config.SubURL+"/v1/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("x-api-key", key)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, problem(502, "upstream_unavailable", "Unable to read model list")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, problem(502, "model_listing_failed", "Unable to read source key model list")
	}
	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&result); err != nil {
		return nil, err
	}
	models := []string{}
	for _, m := range result.Data {
		if m.ID != "" {
			models = append(models, m.ID)
		}
	}
	return models, nil
}

func (c *Clients) bifrost(ctx context.Context, path, method string, body, output any) error {
	return c.call(ctx, c.config.BifrostURL, path, method, "", body, output, true)
}
