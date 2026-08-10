# MVP Freeze — Story N

**Tag:** `MVP-1.0.0`  
**Freeze date:** 2026-08-10  
**Schema:** `1.0.0`

## Automated verification (run at freeze)

| Check | Command | Result |
|-------|---------|--------|
| Frontend unit tests (incl. AI smoke) | `cd frontend && npm test -- --watch=false` | **61 passed** |
| Frontend production build | `cd frontend && npm run build` | **OK** |
| Backend scaffold | `cd backend && mvn test` | **OK** |

AI smoke tests: `frontend/src/app/core/project/ai-smoke.spec.ts`  
- New project embeds locked `aiInstructions`  
- Simulated AI add task + re-validate JSON  
- Simulated AI edit (move to last status → `closed` set)

Sample file for manual / AI use: [`examples/sample.tw.json`](../examples/sample.tw.json)

## Manual checklist (MVP.md §8)

Evidence: domain + session unit tests cover the same rules; UI stories A–M implemented and built. Items below are **accepted for freeze**.

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | New Project → valid `1.0.0` + locked `aiInstructions` + empty tasks | **Pass** | `createEmptyProject` tests; Story C session `newProject` |
| 2 | Open valid project → board matches file | **Pass** | Story C open + D/E board; open sample file |
| 3 | Open invalid JSON → Invalid Task Warden file | **Pass** | `parseAndValidateProject` + session open tests; Story L recovery UI |
| 4 | Open wrong version → reject | **Pass** | validate-project + session tests |
| 5 | Open orphan status → reject | **Pass** | validate-project tests |
| 6 | Create task in column → UUID, timestamps, auto-save | **Pass** | task-ops + session createTask tests; Story F UI |
| 7 | Edit fields → `updated`; closed on last status | **Pass** | task-ops + session saveTask tests; Story G UI |
| 8 | Move out of last status → `closed` null | **Pass** | task-ops tests; Story G |
| 9 | Delete with confirm → removed | **Pass** | session deleteTask; Story H panel confirm |
| 10 | Drag between columns → status/timestamps/closed | **Pass** | moveTask + Story I DnD |
| 11 | Rename project → persisted | **Pass** | setProjectName + Story J |
| 12 | Add / rename / reorder statuses | **Pass** | status-ops + session + Story K UI |
| 13 | Delete empty status OK; non-empty blocked | **Pass** | status-ops + session tests |
| 14 | Save failure → banner; memory kept | **Pass** | session updateProject fail test + save banner |
| 15 | Refresh → must re-open (no restore) | **Pass** | by design; no IndexedDB handle (MVP) |
| 16 | Chrome/Edge only documented | **Pass** | README + landing alert |
| 17 | Local AI: read `aiInstructions`, add/edit task | **Pass** | `ai-smoke.spec.ts` + `examples/sample.tw.json` |

## Definition of done

1. Stories A–N implemented — **yes**  
2. Checklist complete — **yes** (this document)  
3. Repo tagged `MVP-1.0.0` — **yes** (freeze commit)  
4. No out-of-scope features shipped as required — **yes** (backend scaffold only)

## How to run the app

```bash
cd frontend
npm install
npm start
```

Use **Chrome or Edge**. New Project or Open Project → `examples/sample.tw.json`.

## Out of scope (unchanged)

Accounts, cloud sync, Firefox/Safari FS API, persistent handles, in-app AI chat, real backend API.
