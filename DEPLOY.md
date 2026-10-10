# Render Deployment

Create a Render web service for this repository with:

- Build Command: `bash build.sh`
- Start Command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Set these environment variables:

- `DATABASE_URL`: the connection URL for the Render PostgreSQL database. The backend accepts `postgres://` and `postgresql://` URLs and converts them for psycopg2.
- `PYTHON_VERSION`: `3.13.7`
- `NODE_VERSION`: `26.7.0`
- `ALLOWED_ORIGINS`: the deployed frontend origin, such as `https://your-service.onrender.com`. Multiple origins may be comma-separated. The local default is `http://localhost:5173`.

The API creates the SQLite database by default for local development. In production, set `DATABASE_URL` to PostgreSQL.
