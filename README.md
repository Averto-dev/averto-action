# Averto GitHub Action

This JavaScript Action exchanges GitHub OIDC for a repository-bound, short-lived
Averto token. It never needs an Averto secret and does not execute repository
scripts. The Averto GitHub App must already be installed for the repository.

```yaml
name: Averto
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  averto:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - id: averto
        uses: Averto-dev/averto-action@v1
```

SARIF upload is optional. Add it only when the repository has GitHub code
scanning enabled (GitHub Advanced Security / Code Security on private repos).
Keep Averto gate failures separate from SARIF upload failures.

```yaml
permissions:
  contents: read
  actions: read
  id-token: write
  security-events: write

# after the averto step:
- if: >-
    always() && steps.averto.outputs.sarif-path != '' &&
    (github.event_name != 'pull_request' ||
     github.event.pull_request.head.repo.full_name == github.repository)
  uses: github/codeql-action/upload-sarif@88585263c0627ee42c0e1c5143a112c8d6f4aa18 # v4.38.2
  with:
    sarif_file: ${{ steps.averto.outputs.sarif-path }}
```

For staging proofs, pass Averto’s staging API and audience:

```yaml
- id: averto
  uses: Averto-dev/averto-action@v1.0.0-rc.1
  with:
    api-url: https://stage-platform.averto.dev
    audience: stage.averto.dev
```

Infrastructure, quota, and service errors produce logical exit code `3` and a
successful step by default. Set `fail-closed: true` only when the organization
intentionally wants those failures to block delivery.

Development:

```bash
npm ci
npm test
npm run check
npm run build
```

`dist/` is committed because Actions execute the bundled JavaScript directly.
