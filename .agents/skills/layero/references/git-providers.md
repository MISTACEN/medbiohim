# Git providers

Layero connects repositories from five providers. All of them are connected
the same way — in the dashboard: **Создать проект → Импорт из репозитория**,
then choose the provider, the repository and the branch. The production branch
defaults to `main`.

| provider | how it authorizes | webhooks |
|---|---|---|
| GitHub | GitHub App — access to the selected repositories is granted at login | yes, HMAC-SHA256 signature |
| GitVerse | personal access token (PAT), GitHub-compatible API | yes |
| GitLab | personal token | yes |
| GitFlic | personal token | yes |
| SourceCraft | personal token | no — a new version is started by a deploy from the dashboard or the CLI |

## What happens on push

```
git push → provider webhook → Layero creates a deploy with the commit SHA
        → the builder clones, installs dependencies, builds
        → artifacts go to storage, the environment is switched
```

- A push to `main` (the production branch) — a build and **auto-promote to
  production**: the new deploy becomes what visitors see at the project
  address.
- A push to any other branch — a **preview environment** with its own
  address. This is the only way to get an isolated "just to look" version:
  for direct CLI uploads the `--branch` flag is ignored.
- A connected repository does not get in the way of the CLI:
  `npx layero@latest deploy --prod` on such a project targets the production
  environment.

## Limitations

- GitVerse has no pull-request previews and no commit statuses yet; the
  webhook signature is not verified, and the repository is cloned in full.
- SourceCraft has no webhooks: a push by itself does not start a deploy.
- A self-hosted Git instance cannot be connected — the client's address is
  not in the platform allowlist.

More about GitHub: <https://docs.layero.ru/deploys/github>.
