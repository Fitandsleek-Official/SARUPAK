# API overview

Base URL (local Phase 5.2): `http://localhost:4003/v1`

Health identity: `GET /health` → `{ status, service: "sarupak-api", version, phase, port, expectedDevPort }`

Auth: `Authorization: Bearer <accessToken>` after register/login.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Public |
| POST | `/auth/register` | `{ email, password, displayName? }` |
| POST | `/auth/login` | `{ email, password }` |
| GET | `/auth/me` | Current user |
| POST | `/projects` | Create project + empty timeline |
| GET | `/projects` | List owned projects |
| GET | `/projects/:id` | Get project |
| PATCH | `/projects/:id` | Update / autosave (`createSnapshot`) |
| DELETE | `/projects/:id` | Delete project |
| GET | `/projects/:id/snapshots` | List snapshots |
| POST | `/projects/:id/snapshots/:snapshotId/recover` | Restore timeline |
| GET | `/projects/:projectId/media` | List media |
| POST | `/projects/:projectId/media` | Multipart field `file` |
| DELETE | `/projects/:projectId/media/:assetId` | Delete media + storage object |
| GET | `/projects/:projectId/jobs` | Job status list |
| GET | `/jobs/:jobId` | Single job |

All project/media/job routes enforce user ownership.
