# BriteTrack LMS

## Project Overview
BriteTrack LMS is a web-based Learning Management System (LMS) with role-based access for administrators, students, and parents. The platform is built using React for the frontend, Supabase for authentication, storage, and database, and is deployed on Vercel.

## Key Components
- **Technical Specifications:** Role-based authentication, feature access, and implementation details for frontend and backend.
- **User Journeys and Flows:** Progressive lesson unlocking, Zoom integration, notifications, and parent-student management.
- **Database Schema:** Supabase tables, relationships, RLS policies, functions, triggers, and storage buckets.
- **Edge Cases and Decision Points:** Handling user, course, lesson, Zoom, notification, and progress edge cases.
- **Scalable Architecture:** Frontend structure, backend API, database scaling, integration, and DevOps.

## Implementation Approach
The project follows a phased strategy:
1. **MVP (1-100 Users):** Core user management, basic course/lesson functionality, progress tracking, notifications.
2. **Growth (100-1,000 Users):** Enhanced Zoom, advanced progress, reporting, performance.
3. **Scale (1,000-10,000 Users):** Caching, DB optimizations, mobile, integrations.
4. **Enterprise (10,000+ Users):** Sharding, analytics, native mobile, enterprise features.

## Next Steps
1. Review detailed documentation in `/Documentation`
2. Prioritize MVP features
3. Set up development environment (Supabase, Vercel)
4. Implement core user management
5. Develop basic course and lesson features

## Technology Stack
- **Frontend:** React, Next.js, Tailwind CSS
- **Backend:** Node.js (Express, Mongoose planned for future API), Supabase
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage
- **Deployment:** Vercel
- **CI/CD:** GitHub Actions
- **API Integration:** Zoom OAuth API

## Setup Instructions
1. Clone the repository:
   ```bash
   git clone https://github.com/baisethomas/britetrack-lms.git
   cd britetrack-lms
   ```
2. Install dependencies for frontend and backend:
   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```
3. Set up environment variables (see `.env.example` in each directory).
4. Start the development servers:
   - Frontend: `npm run dev` (in `frontend`)
   - Backend: `npm run dev` (in `backend`)

## Running Locally
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:5000](http://localhost:5000) (planned)

## Testing
- Run tests with `npm test` in each directory.
- Lint and format code with `npm run lint` and `npm run format`.

## Deployment
- CI/CD is set up with GitHub Actions (`.github/workflows`).
- Deploy frontend to Vercel (recommended).
- Backend deployment: configure as needed (Heroku, Render, etc.).

## Contribution Guidelines
- Fork the repo and create a feature branch.
- Follow code style guidelines (ESLint, Prettier).
- Write tests for new features.
- Submit a pull request with a clear description.

## License
MIT

## Documentation Structure
- `Documentation/technical_specifications.md` - Role specifications
- `Documentation/user_journeys_and_flows.md` - User journeys
- `Documentation/database_schema.md` - Database design
- `Documentation/edge_cases_and_decisions.md` - Edge cases
- `Documentation/scalable_architecture.md` - Architecture
- `Documentation/todo.md` - Implementation checklist

For more details, see the `/Documentation` folder and the executive summary in `Documentation/LMS Implementation Plan - Executive Summary.md`. 