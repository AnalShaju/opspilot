# OpsPilot — AI Incident Commander

Hackathon app: frontend + backend + DeepSeek incident agent.

The production **simulator is a separate project**. This app talks to it over HTTP.

## Architecture

```
Frontend
   ↓
Next.js API (/api/incidents/...)
   ↓
Incident Service
   ↓
DeepSeek Incident Agent
   ↓
Controlled Tools (getLogs, getDeployments, ...)
   ↓
Simulator (SIMULATOR_URL)
```

Human approval is required before any rollback.

## Environment

Copy `.env.example` → `.env.local`:

```env
DEEPSEEK_API_KEY=your_key
SIMULATOR_URL=http://localhost:3001
USE_MOCK_SIMULATOR=false
```

Set `USE_MOCK_SIMULATOR=true` only when the simulator is offline (local fake data).

## Run

```bash
# Terminal 1 — teammate simulator
# (in the simulator project)
npm run start   # typically :3001

# Terminal 2 — OpsPilot
npm install
npm run dev     # :3000
```

Open http://localhost:3000

## Demo flow

1. Reset / fail Payment Service in the simulator
2. Open OpsPilot overview → **Investigate Incident**
3. DeepSeek calls tools and returns root cause + rollback recommendation
4. Click **Approve & Fix**
5. Backend rolls back via simulator and verifies health
6. Incident resolves → report available

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/demo/bootstrap` | Ensure demo incident exists |
| GET/POST | `/api/incidents` | List / create |
| GET | `/api/incidents/:id` | Get one |
| POST | `/api/incidents/:id/investigate` | DeepSeek tool-calling investigation |
| POST | `/api/incidents/:id/approve` | Human approval → rollback → verify |
| GET | `/api/incidents/:id/report` | Structured report |

## Tools (AI-readable only)

- `getServices` → `GET /services`
- `getLogs` → `GET /logs`
- `getMetrics` → `GET /metrics`
- `getDeployments` → `GET /deployments`
- `getPreviousIncidents` → `GET /incidents`

## Remediation (human-approved only)

- `rollbackDeployment(version)` → `POST /actions/rollback`
- `verifyHealth()` → `GET /health`

## Test

```bash
npm run test:api
```

## Safety

- `DEEPSEEK_API_KEY` is server-only
- Browser never calls rollback directly
- AI cannot invent remediations outside allowlisted `rollback`
- AI output is validated before storage
