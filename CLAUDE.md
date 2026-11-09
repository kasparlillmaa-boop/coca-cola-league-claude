# Project notes

## Deployment
- This app runs on Railway, not on the local computer.
- It is deployed automatically from the `main` branch of this GitHub repo.

## Database
- The database is a Railway PostgreSQL database.
- It is available only through the `DATABASE_URL` environment variable on Railway.
- Do not set up a local database or a local server.

## Workflow
- Before every push, run `npm run build` to make sure the app builds.
- After each finished task, commit and push to GitHub so that Railway deploys the new version.
