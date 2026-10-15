/**
 * MEDBIOHIM production API gateway.
 *
 * This Worker exposes the production API hostname while forwarding requests to
 * the currently deployed Shadow API through a Cloudflare service binding.
 * It intentionally does not duplicate application secrets or bypass the
 * upstream authentication, CORS, rate limiting, Supabase RLS, or route policy.
 *
 * This is an operational compatibility gateway, NOT an independent production
 * application deployment. The upstream health response therefore continues to
 * report mode=shadow until the full application bundle and secret bindings can
 * be deployed independently and accepted.
 */
export default {
  async fetch(request, env) {
    const upstreamRequest = new Request(request);
    const response = await env.MEDBIOHIM_UPSTREAM.fetch(upstreamRequest);
    const headers = new Headers(response.headers);
    headers.set("x-medbiohim-api-gateway", "production");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
