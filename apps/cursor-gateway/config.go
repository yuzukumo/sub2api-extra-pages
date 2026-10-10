package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	Address                 string
	DataDir                 string
	WebDir                  string
	PublicURL               string
	SubURL                  string
	BifrostURL              string
	BifrostUsername         string
	BifrostPassword         string
	LimitContextToFirstTier bool
}

func loadConfig() (Config, error) {
	contextPolicy := env("LIMIT_CONTEXT_TO_FIRST_TIER", "true")
	if contextPolicy != "false" && contextPolicy != "true" {
		return Config{}, fmt.Errorf("LIMIT_CONTEXT_TO_FIRST_TIER must be true or false")
	}
	c := Config{
		Address:                 env("LISTEN_ADDR", ":3000"),
		DataDir:                 env("DATA_DIR", "/app/data"),
		WebDir:                  env("WEB_DIR", "/app/web"),
		PublicURL:               strings.TrimRight(os.Getenv("PUBLIC_URL"), "/"),
		SubURL:                  strings.TrimRight(env("SUB2API_URL", "http://sub2api:8080"), "/"),
		BifrostURL:              strings.TrimRight(env("BIFROST_URL", "http://sub2apiextra-cursorgateway-bifrost:8080"), "/"),
		BifrostUsername:         env("BIFROST_USERNAME", "admin"),
		BifrostPassword:         env("BIFROST_PASSWORD", "cursor-gateway-internal"),
		LimitContextToFirstTier: contextPolicy == "true",
	}
	for _, value := range []string{c.PublicURL, c.SubURL, c.BifrostURL} {
		if value == "" {
			continue
		}
		u, err := url.Parse(value)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return c, fmt.Errorf("invalid service URL")
		}
	}
	return c, nil
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
