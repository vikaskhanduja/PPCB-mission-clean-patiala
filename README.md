# Mission Clean Patiala Phase 3 - LowDB Edition

A Windows-friendly full-stack prototype for institutional road assessment and action planning. This edition removes SQLite, Sequelize and all native database binaries. Data is stored in `data/db.json` through LowDB.

## Technology
- Frontend: HTML5, CSS3, Bootstrap 5, JavaScript
- Backend: Node.js 22 LTS and Express.js
- Local database: LowDB 7 with JSON file storage
- Authentication: JWT and bcryptjs
- Uploads: Multer

## Included modules
- Animated split landing page
- Institution and PPCB Officer login toggle
- Role-based dashboard
- Assigned road summary
- Road assessment draft
- Unlimited issue/intervention records
- Category master
- Parent issue categories for institutions and mapped subcategory review for PPCB officers
- Browser GPS and manual coordinates
- Evidence photograph upload
- Final assessment submission
- PPCB review table
- Priority, responsible agency and action-status updates
- Mission KPI cards
- Assessment status donut chart and issue category bar chart
- CSV export

## Run locally on Windows CMD
1. Extract the ZIP to a normal folder, preferably `C:\Projects\Mission-Clean-Patiala-LowDB`.
2. Open CMD in that folder.
3. Confirm Node.js 22: `node -v`
4. Copy `.env.example` to `.env`: `copy .env.example .env`
5. Install packages: `npm install`
6. Start: `npm start`
7. Open `http://localhost:3000`

## Demo accounts
- Institution: `institution@mcpatiala.in` / `Institution@123`
- PPCB Officer: `officer@ppcb.gov.in` / `Officer@123`

## Data location
All records are saved in `data/db.json`. To reset demo data, stop the server, delete `data/db.json`, and run `npm start` again.

## Project structure
```
mission-clean-patiala-lowdb/
  server.js
  package.json
  .env.example
  src/
    db.js
    auth.js
    routes.js
  data/
    db.json
  public/
    index.html
    dashboard.html
    css/styles.css
    js/index.js
    js/dashboard.js
  uploads/
```

## Main APIs
- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET /api/institution/details`
- `GET /api/master/categories`
- `GET /api/assessments`
- `POST /api/assessments`
- `POST /api/assessments/:id/issues`
- `POST /api/issues/:id/photos`
- `PATCH /api/assessments/:id/submit`
- `GET /api/admin/issues`
- `PATCH /api/admin/issues/:id`
- `GET /api/admin/export.csv`

## Production note
LowDB is appropriate for local testing, prototypes and demos. For multi-user production deployment, migrate the same entities to PostgreSQL, add migrations, object storage, approved authentication, detailed audit logs, notification services, rate limiting, backup and recovery controls.
