# Contributing

This Action is developed primarily in the Averto monorepo under
`integrations/github-action/` and published to `Averto-dev/averto-action`.

## Local checks

From `integrations/github-action/`:

```bash
npm ci
npm run check
npm test
npm run build
git diff --exit-code -- dist
```

`dist/` is committed because GitHub Actions runs the bundled JavaScript.

## Pull requests

1. Keep changes scoped to the Action contract (OIDC exchange, polling, outputs,
   logical exit codes, and documentation).
2. Update tests with behaviour changes.
3. Rebuild `dist/` and include it in the same commit.
4. Do not introduce Averto API keys or long-lived credentials.

## Releases

Semantic tags (`v1.0.0`, `v1.0.1`, …) are immutable. The moving `v1` tag is
updated only after staging proof for that release.
