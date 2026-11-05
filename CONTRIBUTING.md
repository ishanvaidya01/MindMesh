# Contributing to MindMesh

Thanks for your interest in improving MindMesh. This guide covers the development workflow,
coding expectations, and pull request process.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). For security
issues, use the process in [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Getting started

1. Fork the repository and clone your fork.
2. Follow the setup steps in the [README](README.md): start PostgreSQL and Redis, install the
   backend dependencies, apply migrations, and install the frontend dependencies.
3. Create a focused branch from `main`, for example `feat/room-timer` or `fix/ws-reconnect`.

## Development workflow

- Keep changes scoped to the problem described in the linked issue.
- Do not commit `.env` files, API keys, database files, `node_modules`, or build output.
- Preserve the existing project structure and naming conventions.
- Add or update documentation when behaviour, configuration, or APIs change.
- Do not modify generated files or lockfiles unless the change requires it.

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py check
python manage.py runserver
```

Celery tasks require a worker and Redis:

```bash
celery -A mindmesh worker -l info
# Windows: celery -A mindmesh worker -l info --pool=solo
```

### Frontend

```bash
cd frontend
npm install
npm run lint
npm run build
npm run dev
```

## Testing

The repository does not currently include an automated test suite. Before opening a pull
request:

1. Run `python manage.py check` in `backend/`.
2. Run `npm run lint` and `npm run build` in `frontend/`.
3. Exercise the affected flow manually. For room changes, test with a host and at least one
   student session in separate browsers.

If you add automated tests, include the command needed to run them in the README and this
guide.

## Commit messages

Use clear, imperative commit messages. Conventional Commits prefixes are preferred but not
required:

```text
feat: add host pause control
fix: recompute leaderboard after reconnect
docs: clarify local Redis setup
```

Keep unrelated changes in separate commits.

## Pull requests

- Describe the problem and the approach, and link the related issue when one exists.
- Include reproduction or verification steps for bug fixes.
- Note any schema migrations, new environment variables, or API changes.
- Keep the pull request focused; split large changes where practical.
- Make sure the checks above pass and there are no secrets in the diff.

Reviewers may ask for changes. Please keep discussion constructive and on topic.

## Reporting bugs and requesting features

Use the issue templates in `.github/ISSUE_TEMPLATE/`. Include the version or commit, operating
system, steps to reproduce, expected behaviour, and relevant logs with secrets removed.
