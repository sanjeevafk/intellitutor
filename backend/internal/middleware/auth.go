package middleware

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const TeacherIDKey contextKey = "teacher_id"

// Claims matches key Supabase JWT fields we care about.
type Claims struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

type Validator struct {
	supabaseURL string
	client      *http.Client
	issuer      string
	audiences   []string
	jwtSecret   []byte
	cache       jwksCache
}

type jwksCache struct {
	mu        sync.RWMutex
	keys      map[string]any
	expiresAt time.Time
}

type jwksResponse struct {
	Keys []jwkKey `json:"keys"`
}

type jwkKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	Crv string `json:"crv"`
	N   string `json:"n"`
	E   string `json:"e"`
	X   string `json:"x"`
	Y   string `json:"y"`
	K   string `json:"k"`
}

func NewValidator(supabaseURL, issuer string, audiences []string, jwtSecret string) (*Validator, error) {
	if supabaseURL == "" {
		return nil, errors.New("supabase URL is required")
	}
	baseURL := normalizeSupabaseURL(supabaseURL)
	if issuer == "" {
		issuer = baseURL + "/auth/v1"
	}
	if len(audiences) == 0 {
		audiences = []string{"authenticated"}
	}
	return &Validator{
		supabaseURL: baseURL,
		issuer:      issuer,
		audiences:   audiences,
		jwtSecret:   []byte(jwtSecret),
		client:      &http.Client{Timeout: 5 * time.Second},
		cache: jwksCache{
			keys: make(map[string]any),
		},
	}, nil
}

func (v *Validator) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}

		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		claims := &Claims{}

		parser := jwt.NewParser(
			jwt.WithValidMethods([]string{
				jwt.SigningMethodRS256.Alg(),
				jwt.SigningMethodES256.Alg(),
				jwt.SigningMethodHS256.Alg(),
			}),
			jwt.WithIssuer(v.issuer),
		)

		token, err := parser.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (any, error) {
			alg := token.Method.Alg()
			kid, _ := token.Header["kid"].(string)
			switch alg {
			case jwt.SigningMethodHS256.Alg():
				return v.getHMACKey(c.Request.Context(), kid)
			case jwt.SigningMethodRS256.Alg(), jwt.SigningMethodES256.Alg():
				if kid == "" {
					return nil, errors.New("token missing kid header")
				}
				return v.getKey(c.Request.Context(), kid)
			default:
				return nil, fmt.Errorf("unsupported signing method: %s", alg)
			}
		})
		if err != nil || token == nil || !token.Valid {
			log.Printf("auth failure: %v", err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		if !v.audienceAllowed(claims.Audience) {
			log.Printf("auth failure: audience mismatch (expected=%v got=%v)", v.audiences, []string(claims.Audience))
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		teacherID := claims.Subject
		if teacherID == "" {
			log.Printf("auth failure: token missing subject")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token missing subject"})
			return
		}

		c.Set(string(TeacherIDKey), teacherID)
		c.Next()
	}
}

func (v *Validator) getKey(ctx context.Context, kid string) (any, error) {
	v.cache.mu.RLock()
	key, ok := v.cache.keys[kid]
	exp := v.cache.expiresAt
	v.cache.mu.RUnlock()

	if ok && time.Now().Before(exp) {
		return key, nil
	}

	return v.refreshKeys(ctx, kid)
}

func (v *Validator) refreshKeys(ctx context.Context, kid string) (any, error) {
	v.cache.mu.Lock()
	defer v.cache.mu.Unlock()

	if key, ok := v.cache.keys[kid]; ok && time.Now().Before(v.cache.expiresAt) {
		return key, nil
	}

	url := v.supabaseURL + "/auth/v1/certs"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return v.fallbackStaleKey(kid, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return v.fallbackStaleKey(kid, errors.New("failed to fetch JWKS"))
	}

	var payload jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}

	keys := make(map[string]any)
	for _, k := range payload.Keys {
		if k.Kid == "" {
			continue
		}
		switch k.Kty {
		case "RSA":
			if k.N == "" || k.E == "" {
				continue
			}
			pub, err := parseRSAPublicKey(k.N, k.E)
			if err != nil {
				continue
			}
			keys[k.Kid] = pub
		case "EC":
			if k.X == "" || k.Y == "" {
				continue
			}
			pub, err := parseECPublicKey(k.Crv, k.X, k.Y)
			if err != nil {
				continue
			}
			keys[k.Kid] = pub
		case "oct":
			if k.K == "" {
				continue
			}
			secret, err := base64.RawURLEncoding.DecodeString(k.K)
			if err != nil {
				continue
			}
			keys[k.Kid] = secret
		}
	}

	if len(keys) == 0 {
		return v.fallbackStaleKey(kid, errors.New("no valid JWKS keys found"))
	}

	v.cache.keys = keys
	v.cache.expiresAt = time.Now().Add(1 * time.Hour)

	key, ok := v.cache.keys[kid]
	if !ok {
		return v.fallbackStaleKey(kid, errors.New("kid not found in JWKS"))
	}
	return key, nil
}

func (v *Validator) fallbackStaleKey(kid string, cause error) (any, error) {
	const staleGrace = 5 * time.Minute
	if len(v.cache.keys) == 0 {
		return nil, cause
	}
	if time.Now().After(v.cache.expiresAt.Add(staleGrace)) {
		return nil, cause
	}
	key, ok := v.cache.keys[kid]
	if !ok {
		return nil, cause
	}
	log.Printf("auth warning: using stale JWKS key for kid=%s due to error: %v", kid, cause)
	return key, nil
}

func (v *Validator) getHMACKey(ctx context.Context, kid string) ([]byte, error) {
	if len(v.jwtSecret) > 0 {
		return v.jwtSecret, nil
	}
	if kid == "" {
		return nil, errors.New("missing HMAC key")
	}
	key, err := v.getKey(ctx, kid)
	if err != nil {
		return nil, err
	}
	secret, ok := key.([]byte)
	if !ok {
		return nil, errors.New("invalid HMAC key type")
	}
	return secret, nil
}

func (v *Validator) audienceAllowed(aud jwt.ClaimStrings) bool {
	if len(v.audiences) == 0 {
		return true
	}
	if len(aud) == 0 {
		return false
	}
	for _, expected := range v.audiences {
		for _, actual := range aud {
			if actual == expected {
				return true
			}
		}
	}
	return false
}

func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nStr)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eStr)
	if err != nil {
		return nil, err
	}

	n := new(big.Int).SetBytes(nBytes)
	eInt := new(big.Int).SetBytes(eBytes)
	if eInt.Sign() == 0 {
		return nil, errors.New("invalid exponent")
	}
	if eInt.BitLen() > 31 {
		return nil, errors.New("exponent too large")
	}

	e := int(eInt.Int64())
	if e > math.MaxInt32 {
		return nil, errors.New("exponent overflow")
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

func parseECPublicKey(crv, xStr, yStr string) (*ecdsa.PublicKey, error) {
	if crv == "" {
		crv = "P-256"
	}
	if crv != "P-256" && crv != "secp256r1" {
		return nil, errors.New("unsupported EC curve")
	}

	xBytes, err := base64.RawURLEncoding.DecodeString(xStr)
	if err != nil {
		return nil, err
	}
	yBytes, err := base64.RawURLEncoding.DecodeString(yStr)
	if err != nil {
		return nil, err
	}

	x := new(big.Int).SetBytes(xBytes)
	y := new(big.Int).SetBytes(yBytes)
	curve := elliptic.P256()
	if !curve.IsOnCurve(x, y) {
		return nil, errors.New("invalid EC public key")
	}

	return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
}

func normalizeSupabaseURL(raw string) string {
	url := strings.TrimSpace(raw)
	url = strings.TrimRight(url, "/")
	url = strings.TrimSuffix(url, "/auth/v1")
	return url
}

func GetTeacherID(c *gin.Context) (string, bool) {
	val, ok := c.Get(string(TeacherIDKey))
	if !ok {
		return "", false
	}
	teacherID, ok := val.(string)
	return teacherID, ok
}
