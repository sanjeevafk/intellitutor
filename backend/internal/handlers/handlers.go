package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"tutor-dashboard-backend/internal/middleware"
	"tutor-dashboard-backend/internal/models"
)

type Handler struct {
	DB *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Handler {
	return &Handler{DB: db}
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) ImportStudents(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

func (h *Handler) ListStudents(c *gin.Context) {
	teacherID, ok := middleware.GetTeacherID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing teacher id"})
		return
	}

	rows, err := h.DB.Query(c.Request.Context(), `
		select id::text, teacher_id::text, full_name, current_grade, academic_year, batch_name, created_at
		from students
		where teacher_id = $1
		order by created_at desc
	`, teacherID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query students"})
		return
	}
	defer rows.Close()

	students := make([]models.Student, 0)
	for rows.Next() {
		var s models.Student
		var batch pgtype.Text
		if err := rows.Scan(&s.ID, &s.TeacherID, &s.FullName, &s.CurrentGrade, &s.AcademicYear, &batch, &s.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan students"})
			return
		}
		if batch.Valid {
			batchVal := batch.String
			s.BatchName = &batchVal
		}
		students = append(students, s)
	}
	if rows.Err() != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read students"})
		return
	}

	c.JSON(http.StatusOK, students)
}

func (h *Handler) AddStudentNote(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

func (h *Handler) ListStudentNotes(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

func (h *Handler) UpdateNote(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

func (h *Handler) GenerateWeeklySummaries(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}
