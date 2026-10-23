# Lost & Found

A campus lost-and-found portal. Students and staff report what they lost or found, reports are matched automatically, owners claim items with proof only they would know, and an admin verifies the claim before the handover.

## Features

**For students and staff**
- **Report lost or found items** with category chips, quick date picks, location suggestions, keyword tags, a live preview and drag-and-drop photo upload.
- **Automatic matching** scores every new report against the other side (category, shared words, location, timing) and links strong matches straight away, in either order.
- **Notifications** in the app and by email when a match is found and when an item is returned.
- **Claim with proof**: review a match side by side, then claim it, or reject it with "Not mine" so the pair is never suggested again.
- **Browse found items**: everything unclaimed, with descriptions hidden so only the real owner can describe them. Claim straight from the listing.
- **My reports**: progress tracker (Reported → Matched → Claimed → Returned), status filters, search, and withdrawing a report you no longer need.
- **Dashboard** with stats, active reports, recent activity, a leaderboard of top finders and recent finds.
- **Settings**: edit your name, change your password, choose light, dark or system theme, and see your impact.

**For admins**
- Overview with KPIs, a 14-day chart of reports, a category breakdown, top locations and the leaderboard.
- Match review with the owner's proof, then approve the return or reject the match.
- Every report, with filters, search and pagination, plus **Find owner**, which ranks lost reports for any found item.
- CSV export of lost or found reports.

**Across the app**
- ⌘K / Ctrl K command menu, and ⌘J / Ctrl J to switch theme.
- Light and dark themes, responsive down to phone width, and support for reduced-motion settings.

## Tech stack

| Part | Built with |
|---|---|
| Backend | Node.js, Express 5, MongoDB with Mongoose, JWT auth, bcrypt, Multer (uploads), Nodemailer |
| Frontend | Plain HTML, CSS and JavaScript (no build step), Inter and Cal Sans fonts, a bundled subset of [Lucide](https://lucide.dev) icons |

## Getting started

### Quick start (no MongoDB needed)

On Windows, install [Node.js](https://nodejs.org) and double-click `START.bat` (see `HOW-TO-RUN.txt`). On any system you can also run `npm install` and then `npm run local` in `backend/`.

This starts a built-in MongoDB (downloaded on the first run), adds the demo data and opens http://localhost:5000. Data is kept in `backend/.local-db`; delete that folder to start fresh.

### With your own MongoDB

You need Node.js 18 or newer and a MongoDB server.

1. **Configure** `backend/.env`:

   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017/lostfound
   JWT_SECRET=a-long-random-string
   EMAIL_USER=you@gmail.com          # optional: Gmail account that sends emails
   EMAIL_PASS=your-gmail-app-password # optional: without these, emails are printed to the console
   FRONTEND_URL=http://localhost:5000 # optional: used for links in emails
   ```

2. **Install and start** (the backend serves the API and the frontend on port 5000):

   ```bash
   cd backend
   npm install
   npm run seed     # optional: demo users and reports
   npm start
   ```

   Open http://localhost:5000.

   To serve the frontend separately instead, run `python3 dev-server.py` in `frontend/` and open http://localhost:8080.

### Demo accounts

After `npm run seed`, the login page has one-click demo buttons. Every demo account's password is `demo1234`.

| Account | Email |
|---|---|
| Student with an open match and a pending claim | `aarav@demo.local` |
| Admin | `admin@demo.local` |

`npm run seed -- --clear` removes all demo data.

### Creating an admin

Sign-up only creates student and staff accounts. To create an admin, or promote an existing user to admin, run:

```bash
cd backend
npm run create-admin -- admin@college.edu a-strong-password "Admin Name"
```

## Deploying to Netlify

The repo is set up for Netlify (`netlify.toml`): `frontend/` is published as static files, and the Express backend runs as one Netlify Function (`netlify/functions/api.js`) that serves `/api/*` and `/uploads/*`. Uploaded photos are stored in Netlify Blobs.

1. Create a MongoDB Atlas cluster. Allow access from anywhere (`0.0.0.0/0`), because Netlify Functions have no fixed IPs.
2. Set these environment variables on the Netlify site: `MONGODB_URI`, `JWT_SECRET`, and optionally `EMAIL_USER`, `EMAIL_PASS` and `FRONTEND_URL`.
3. Install the backend dependencies (`cd backend && npm install`), then deploy from the project root:

   ```bash
   netlify deploy --prod --no-build --dir frontend --functions netlify/functions
   ```

To add demo data to the hosted database, run `MONGODB_URI="<atlas uri>" npm run seed` in `backend/`.

## Project structure

```
backend/
  server.js            Express app and routes
  controllers/         auth, lost, found, admin, stats, notifications
  models/              User, LostItem, FoundItem, Notification
  utils/matchHelper.js scoring and matching
  scripts/             seed.js, createAdmin.js
frontend/
  index.html           landing page
  *.html               app pages (dashboard, history, browse, lost, found, profile, admin)
  css/style.css        design system (light and dark themes)
  js/core.js           shared helpers: theme, API client, toasts, modals
  js/app.js            signed-in shell: sidebar, notifications, ⌘K menu
  js/*.js              one script per page
```

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `GET` / `PUT /api/auth/me`, `PUT /api/auth/password` |
| Lost items | `GET /api/lost/my`, `POST /api/lost`, `GET /api/lost/:id/match`, `POST /api/lost/:id/claim`, `POST /api/lost/:id/reject-match`, `DELETE /api/lost/:id` |
| Found items | `GET /api/found/my`, `GET /api/found/browse`, `POST /api/found`, `POST /api/found/:id/claim`, `DELETE /api/found/:id` |
| Notifications | `GET /api/notifications`, `PUT /api/notifications/read`, `PUT /api/notifications/:id/read` |
| Stats | `GET /api/stats/public`, `GET /api/stats/leaderboard` |
| Admin | `GET /api/admin/stats`, `/analytics`, `/matches`, `/items`, `/export`, `/found/:id/candidates`, `POST /api/admin/match`, `PUT /api/admin/approve/:foundId`, `PUT /api/admin/reject/:foundId` |
