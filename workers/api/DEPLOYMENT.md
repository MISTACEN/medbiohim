# Cloudflare API deployment

The production Worker is deployed from this directory by Cloudflare Workers Builds.

## Pipeline

1. Install dependencies with npm.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Deploy with `npx wrangler deploy`.

The build watches the `main` branch in `MISTACEN/medbiohim`. Keep production secrets in Cloudflare Worker settings; never commit credentials here.

Required runtime secrets are documented at the top of `wrangler.toml`. Production traffic must not be switched to a new implementation until deployment and endpoint smoke tests pass.
