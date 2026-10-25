package main

import (
	"net/netip"
	"slices"
	"testing"
)

func TestLoadConfigTrustedProxies(t *testing.T) {
	for _, test := range []struct {
		value string
		want  []string
	}{
		{"", nil},
		{"  ", nil},
		{"127.0.0.1, ::1, 10.9.0.7/24", []string{"127.0.0.1/32", "::1/128", "10.9.0.0/24"}},
		{"::ffff:127.0.0.1, fd00:9::/64", []string{"127.0.0.1/32", "fd00:9::/64"}},
	} {
		t.Run(test.value, func(t *testing.T) {
			t.Setenv("TRUSTED_PROXIES", test.value)
			config, err := loadConfig()
			if err != nil {
				t.Fatal(err)
			}
			var want []netip.Prefix
			for _, value := range test.want {
				want = append(want, netip.MustParsePrefix(value))
			}
			if !slices.Equal(config.TrustedProxies, want) {
				t.Fatalf("trusted proxies = %v, want %v", config.TrustedProxies, want)
			}
		})
	}
	for _, value := range []string{"proxy.example", "10.9.0.0/99", "10.9.0.1,", ",10.9.0.1", "fe80::1%eth0"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("TRUSTED_PROXIES", value)
			if _, err := loadConfig(); err == nil {
				t.Fatal("invalid trusted proxy configuration was accepted")
			}
		})
	}
}

func TestLoadConfigContextPricingPolicy(t *testing.T) {
	for _, value := range []string{"", "false", "true", "0", "1", "invalid"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("LIMIT_CONTEXT_TO_FIRST_TIER", value)
			config, err := loadConfig()
			if value != "" && value != "true" && value != "false" {
				if err == nil {
					t.Fatal("invalid pricing policy was accepted")
				}
				return
			}
			if err != nil || config.LimitContextToFirstTier != (value != "false") {
				t.Fatalf("policy %q parsed incorrectly, enabled %t, error %v", value, config.LimitContextToFirstTier, err)
			}
		})
	}
}
