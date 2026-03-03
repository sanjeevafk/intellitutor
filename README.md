# Tutor Dashboard

This is a web application for managing tutors and students.

## Project Structure

- `frontend/`: Next.js frontend application
- `backend/`: Go backend API
- `supabase/`: Supabase configuration

## Getting Started

### Prerequisites

- Node.js and npm
- Go
- Docker (for Supabase)

### Installation

1.  **Frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

2.  **Backend:**
    ```bash
    cd backend
    go run ./cmd/api
    ```

### Environment Variables

Create a `.env.local` file in the `frontend` directory by copying `.env.local.example`.

Create a `.env` file in the `backend` directory by copying `.env.example`.

Fill in the necessary environment variables for your Supabase project.

## Features

- User authentication
- Tutor and student management
- Dashboard for viewing and managing data
