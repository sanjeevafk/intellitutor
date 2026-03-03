package models

import "time"

type Teacher struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type Student struct {
	ID           string    `json:"id"`
	TeacherID    string    `json:"teacher_id"`
	FullName     string    `json:"full_name"`
	CurrentGrade int       `json:"current_grade"`
	AcademicYear string    `json:"academic_year"`
	BatchName    *string   `json:"batch_name,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type StudentNote struct {
	ID        string    `json:"id"`
	StudentID string    `json:"student_id"`
	TeacherID string    `json:"teacher_id"`
	Content   string    `json:"content"`
	Tag       *string   `json:"tag,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type WeeklySummary struct {
	ID          string    `json:"id"`
	StudentID   string    `json:"student_id"`
	TeacherID   string    `json:"teacher_id"`
	WeekStart   time.Time `json:"week_start"`
	SummaryText string    `json:"summary_text"`
	GeneratedAt time.Time `json:"generated_at"`
}

type MonthlyReport struct {
	ID          string    `json:"id"`
	StudentID   string    `json:"student_id"`
	TeacherID   string    `json:"teacher_id"`
	Month       time.Time `json:"month"`
	ReportText  string    `json:"report_text"`
	GeneratedAt time.Time `json:"generated_at"`
}

type ScheduleSlot struct {
	ID                  string    `json:"id"`
	TeacherID           string    `json:"teacher_id"`
	DayOfWeek           int       `json:"day_of_week"`
	StartTime           string    `json:"start_time"`
	EndTime             string    `json:"end_time"`
	BatchOrStudentLabel string    `json:"batch_or_student_label"`
	CreatedAt           time.Time `json:"-"`
}
