# Task Warden

Task Warden is a browser app for tracking work on a project board.

Each project is one `.tw.json` file on disk. You open or create that file in Chrome or Edge, edit the board in the page, and the app writes changes back to the same file. There is no sign-in and no server required for normal use.

The file format is plain JSON so other tools (editors, scripts, agents) can read or change the same project file. After external edits, use **Reload** in the app if the project is already open.

## What’s in this repo

| Path | Role |
|------|------|
| `frontend/` | The app (Angular) |
| `docs/` | How to run, build, deploy, and how the code is laid out |
| `examples/` | Sample `.tw.json` |
| `backend/` | Empty Java scaffold (not used by the app today) |

Start with [docs/README.md](./docs/README.md) to run or ship a build.
