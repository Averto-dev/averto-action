# Security Policy

## Supported versions

Only the moving `v1` tag and the latest immutable `v1.x.y` release of
`Averto-dev/averto-action` are supported.

## Reporting a vulnerability

Please report security issues privately to Averto. Do not open a public GitHub
issue for vulnerabilities in this Action or the Averto platform.

Include:

- affected Action tag or commit SHA;
- a minimal reproduction workflow when possible;
- impact (token exposure, repository access, false gate outcomes, etc.).

We will acknowledge receipt and coordinate a fix and disclosure timeline.

## Scope notes

- This Action exchanges GitHub OIDC for a short-lived Averto token. It must not
  require an Averto API key in GitHub secrets.
- Do not use `pull_request_target` with this Action.
- Fork pull requests must not receive elevated trust from Averto.
