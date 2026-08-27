# Task Warden

Task Warden is a browser app for tracking work on a project board.

Each project is one `.tw.json` file. In Chrome or Edge the app opens that file on disk and writes changes back to it. In Safari you upload a file to open it and download to save. There is no sign-in and no server required for normal use.

The file is plain JSON, so a local editor or agent can change the same project file. After external edits, use **Reload** if the project is already open.

## What’s in this repo

| Path | Role |
|------|------|
| `frontend/` | The app (Angular) |
| `docs/` | How to run, build, deploy, and how the code is laid out |
| `examples/` | Sample `.tw.json` |

Start with [docs/README.md](./docs/README.md) to run or ship a build.
