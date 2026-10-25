package main

import (
	"fmt"
	"net/netip"
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
	TrustedProxies          []netip.Prefix
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
	if proxies := strings.TrimSpace(os.Getenv("TRUSTED_PROXIES")); proxies != "" {
		for _, value := range strings.Split(proxies, ",") {
			value = strings.TrimSpace(value)
			prefix, err := netip.ParsePrefix(value)
			if err != nil {
				addr, addrErr := netip.ParseAddr(value)
				if addrErr != nil || addr.Zone() != "" {
					return c, fmt.Errorf("TRUSTED_PROXIES must contain comma-separated IP addresses or CIDRs")
				}
				addr = addr.Unmap()
				prefix = netip.PrefixFrom(addr, addr.BitLen())
			}
			c.TrustedProxies = append(c.TrustedProxies, prefix.Masked())
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
