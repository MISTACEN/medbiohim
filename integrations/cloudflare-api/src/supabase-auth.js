const AUTH_TIMEOUT_MS = 5_000;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

/**
 * Validate a bearer token with Supabase Auth over HTTPS.
 * This helper intentionally accepts only the public anon key and returns only
 * canonical identity fields. App roles and user_metadata are not authorization.
 */
export async function authenticateSupabaseRequest(request, env, fetcher = fetch) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    return failure(401, "UNAUTHORIZED", "Missing or invalid Authorization Bearer token");
  }

  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }

  let endpoint;
  try {
    endpoint = new URL("/auth/v1/user", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }

  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + match[1],
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }

  if (response.status === 401 || response.status === 403) {
    return failure(401, "UNAUTHORIZED", "Invalid or expired access token");
  }
  if (!response.ok) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid response");
  }

  if (!payload || typeof payload.id !== "string" || payload.id.trim() === "") {
    return failure(401, "UNAUTHORIZED", "Invalid or expired access token");
  }

  return {
    ok: true,
    user: {
      id: payload.id,
      email: typeof payload.email === "string" ? payload.email : "",
    },
  };
}

/**
 * Revoke a Supabase Auth session using the caller's access token.
 * The service-role key is never used; the caller's token is sent only to
 * the configured HTTPS Supabase Auth endpoint.
 */
export async function logoutSupabaseSession(accessToken, env, fetcher = fetch) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return failure(401, "UNAUTHORIZED", "Missing or invalid Authorization Bearer token");
  }

  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }

  let endpoint;
  try {
    endpoint = new URL("/auth/v1/logout", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }

  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }

  if (response.status === 401 || response.status === 403) {
    return failure(401, "UNAUTHORIZED", "Invalid or expired access token");
  }
  if (!response.ok) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }

  return { ok: true };
}

export async function refreshSupabaseSession(refreshToken, env, fetcher = fetch) {
  const token = String(refreshToken || "").trim();
  if (!token || token.length > 8192) {
    return failure(422, "VALIDATION_ERROR", "refresh_token is required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    endpoint = new URL("/auth/v1/token?grant_type=refresh_token", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + anonKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ refresh_token: token }),
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return failure(401, "AUTH_REFRESH_FAILED", "Could not refresh session");
  }
  if (!response.ok) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid response");
  }
  const user = payload && payload.user && typeof payload.user === "object" ? payload.user : null;
  if (!payload || typeof payload.access_token !== "string" ||
      typeof payload.refresh_token !== "string" || !user ||
      typeof user.id !== "string" || !user.id) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid session");
  }
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const appMeta = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return {
    ok: true,
    data: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in ?? null,
      token_type: payload.token_type || "bearer",
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : null,
        full_name: typeof meta.full_name === "string" ? meta.full_name :
          (typeof meta.name === "string" ? meta.name : null),
        role: typeof appMeta.role === "string" && appMeta.role.trim() ? appMeta.role.trim() : null,
      },
    },
  };
}

export async function recoverSupabasePassword(email, env, fetcher = fetch) {
  const address = String(email || "").trim();
  if (!address || address.length > 254) {
    return failure(422, "VALIDATION_ERROR", "email is required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    const supabase = new URL(baseUrl);
    if (supabase.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
    const appOrigin = new URL(String(env.MEDBIOHIM_APP_ORIGIN || "https://medbiohim.vercel.app"));
    if (appOrigin.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Recovery redirect must use HTTPS");
    }
    endpoint = new URL("/auth/v1/recover", supabase);
    endpoint.searchParams.set("redirect_to", new URL("/auth/callback", appOrigin.origin).toString());
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth or recovery redirect URL is invalid");
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + anonKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: address }),
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status === 429) {
    return failure(429, "RATE_LIMITED", "Too many recovery requests. Try again later.");
  }
  if (response.status >= 500) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }
  // Do not expose whether an email address exists. Supabase 4xx responses are
  // intentionally normalized to the same public success shape as the PHP route.
  return { ok: true, data: { sent: true } };
}

export async function loginSupabaseUser(email, password, env, fetcher = fetch) {
  const address = String(email || "").trim();
  const secret = String(password || "");
  if (!address || !secret || address.length > 254 || secret.length > 1024) {
    return failure(422, "VALIDATION_ERROR", "email and password are required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    endpoint = new URL("/auth/v1/token?grant_type=password", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + anonKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: address, password: secret }),
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return failure(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }
  if (response.status === 429) {
    return failure(429, "RATE_LIMITED", "Too many login attempts. Try again later.");
  }
  if (!response.ok) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid response");
  }
  const user = payload && payload.user && typeof payload.user === "object" ? payload.user : null;
  if (!payload || typeof payload.access_token !== "string" ||
      typeof payload.refresh_token !== "string" || !user ||
      typeof user.id !== "string" || !user.id) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid session");
  }
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const appMeta = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return {
    ok: true,
    data: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in ?? null,
      token_type: payload.token_type || "bearer",
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : address,
        full_name: typeof meta.full_name === "string" ? meta.full_name :
          (typeof meta.name === "string" ? meta.name : null),
        role: typeof appMeta.role === "string" && appMeta.role.trim() ? appMeta.role.trim() : null,
      },
    },
  };
}

export async function registerSupabaseUser(email, password, fullName, env, fetcher = fetch) {
  const address = String(email || "").trim();
  const secret = String(password || "");
  const name = String(fullName || "").trim();
  if (name.length < 2 || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ||
      address.length > 254 || secret.length < 8 || secret.length > 1024) {
    return failure(422, "VALIDATION_ERROR", "A valid email, password of at least 8 characters, and name are required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    endpoint = new URL("/auth/v1/signup", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + anonKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: address, password: secret, data: { full_name: name, name } }),
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status === 429) {
    return failure(429, "RATE_LIMITED", "Too many registration attempts. Try again later.");
  }
  if (response.status >= 400 && response.status < 500) {
    return failure(422, "AUTH_REGISTER_FAILED", "Registration could not be completed");
  }
  if (!response.ok) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid response");
  }
  const user = payload && payload.user && typeof payload.user === "object" ? payload.user : null;
  if (!user || typeof user.id !== "string" || !user.id) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid registration response");
  }
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const appMeta = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return {
    ok: true,
    data: {
      access_token: typeof payload.access_token === "string" ? payload.access_token : null,
      refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
      expires_in: payload.expires_in ?? null,
      token_type: payload.token_type || "bearer",
      needs_email_confirm: !payload.access_token,
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : address,
        full_name: typeof meta.full_name === "string" ? meta.full_name :
          (typeof meta.name === "string" ? meta.name : name),
        role: typeof appMeta.role === "string" && appMeta.role.trim() ? appMeta.role.trim() : null,
      },
    },
  };
}

/**
 * Read the caller's profile bundle using their own JWT + the public anon key.
 * No service-role credential is accepted or used. Each table query remains
 * subject to Supabase grants and RLS; unavailable optional profile data falls
 * back to the PHP handler's minimal identity bundle.
 */
export async function getSupabaseProfileBundle(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, query) {
    try {
      const endpoint = new URL("/rest/v1/" + table, base);
      for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
      const response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: {
          apikey: anonKey,
          authorization: "Bearer " + token,
          accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const payload = await response.json();
      return Array.isArray(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  const profileRows = await rows("users", {
    select: "id,full_name,email,avatar_url,course_number,semester",
    id: "eq." + identity.user.id,
    limit: "1",
  });
  const profile = profileRows?.[0] || null;
  const roleRows = await rows("user_roles", {
    select: "roles(code)",
    user_id: "eq." + identity.user.id,
  });
  const roles = (roleRows || [])
    .map((item) => Array.isArray(item.roles) ? item.roles[0]?.code : item.roles?.code)
    .filter((code) => typeof code === "string" && code.trim() !== "");

  const membershipRows = await rows("group_memberships", {
    select: "group_id,role_in_group,is_active,groups(id,code,name,course_number,admission_year,is_active)",
    user_id: "eq." + identity.user.id,
    is_active: "eq.true",
  });
  const groups = (membershipRows || []).flatMap((membership) => {
    const groupValue = membership && membership.groups;
    const group = Array.isArray(groupValue) ? groupValue[0] : groupValue;
    if (!group || group.is_active === false) return [];
    return [{
      id: group.id ?? membership.group_id ?? null,
      code: group.code ?? null,
      name: group.name ?? null,
      course_number: group.course_number ?? null,
      admission_year: group.admission_year ?? null,
      role_in_group: membership.role_in_group ?? null,
      is_active: membership.is_active === true,
    }];
  });

  const course = profile?.course_number == null ? null : Number(profile.course_number);
  const semester = profile?.semester == null ? null : Number(profile.semester);
  const currentGroup = groups.find((group) =>
    course !== null && group.course_number != null && Number(group.course_number) === course
  ) || groups[0] || null;

  const user = {
    id: identity.user.id,
    full_name: typeof profile?.full_name === "string" ? profile.full_name : null,
    email: typeof profile?.email === "string" ? profile.email : identity.user.email,
    avatar_url: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
    group_id: currentGroup?.id ?? null,
    group_name: currentGroup?.name ?? null,
    group_code: currentGroup?.code ?? null,
    course_number: Number.isFinite(course) ? course : null,
    semester: Number.isFinite(semester) ? semester : null,
  };
  return {
    ok: true,
    data: {
      user,
      roles,
      groups,
      current_group: currentGroup,
      course: user.course_number,
      semester: user.semester,
    },
  };
}
