package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"tutor-dashboard-backend/internal/config"
	"tutor-dashboard-backend/internal/db"
	"tutor-dashboard-backend/internal/handlers"
	"tutor-dashboard-backend/internal/middleware"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db error: %v", err)
	}
	defer pool.Close()

	validator, err := middleware.NewValidator(
		cfg.SupabaseURL,
		cfg.SupabaseIssuer,
		cfg.SupabaseAudiences,
		cfg.SupabaseJWTSecret,
	)
	if err != nil {
		log.Fatalf("auth setup error: %v", err)
	}

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	h := handlers.New(pool)

	r.GET("/health", h.Health)

	auth := r.Group("/api/v1")
	auth.Use(validator.Middleware())
	{
		auth.POST("/students/import", h.ImportStudents)
		auth.GET("/students", h.ListStudents)
		auth.POST("/students/:student_id/notes", h.AddStudentNote)
		auth.GET("/students/:student_id/notes", h.ListStudentNotes)
		auth.PUT("/notes/:note_id", h.UpdateNote)
		auth.POST("/summaries/weekly", h.GenerateWeeklySummaries)
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
