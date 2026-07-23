# Best practices

## Model selection

Choose a model based on the task, context length, response speed, and price. Complete compatibility testing before changing models in production.

## Request reliability

- Set appropriate connection and response timeouts.
- Retry only requests that are safe to repeat.
- Use exponential backoff for rate-limit responses.
- Record request identifiers for troubleshooting.

## Credential security

> Never store complete access tokens in browser code, public logs, or source repositories.

Load access tokens on the server from environment variables or a secrets manager, and rotate them regularly based on their scope of use.
