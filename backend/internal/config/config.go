package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port              int
	DatabaseURL       string
	SupabaseURL       string
	SupabaseIssuer    string
	SupabaseAudiences []string
	SupabaseJWTSecret string
}

func Load() (Config, error) {
	cfg := Config{}

	portStr := getenv("PORT", "8080")
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return cfg, err
	}

	cfg.Port = port
	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	cfg.SupabaseURL = os.Getenv("SUPABASE_URL")
	cfg.SupabaseIssuer = os.Getenv("SUPABASE_ISSUER")
	cfg.SupabaseJWTSecret = os.Getenv("SUPABASE_JWT_SECRET")

	audienceStr := getenv("SUPABASE_AUDIENCE", "authenticated")
	cfg.SupabaseAudiences = parseCSV(audienceStr)

	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if cfg.SupabaseURL == "" {
		return cfg, errors.New("SUPABASE_URL is required")
	}
	if len(cfg.SupabaseAudiences) == 0 {
		return cfg, errors.New("SUPABASE_AUDIENCE must include at least one value")
	}

	return cfg, nil
}

func getenv(key, fallback string) string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	return val
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}
