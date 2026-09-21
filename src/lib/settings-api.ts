/** Account settings + identity linking (one account for Google/VK/email) */
import { api } from "./api";

export type LinkedIdentity = {
  id: string;
  provider: string;
  provider_label: string;
  email?: string | null;
  name?: string | null;
  can_unlink?: boolean;
  last_sign_in_at?: string | null;
};

export type AccountSettings = {
  user: Record<string, unknown>;
  identities: LinkedIdentity[];
  providers_available: Array<{
    id: string;
    label: string;
    region: string;
    enabled: boolean;
    linkable?: boolean;
  }>;
  preferences: Record<string, unknown>;
  sync: Record<string, unknown>;
};

export async function getAccountSettings() {
  return api<AccountSettings>("/settings/account");
}
export async function updateAccountProfile(patch: {
  full_name?: string;
  email?: string;
  avatar_url?: string;
}) {
  return api<AccountSettings>("/settings/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
export async function changeAccountPassword(password: string) {
  return api<{ changed: boolean }>("/settings/password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}
export async function startLinkIdentity(provider: string, redirect_to?: string) {
  return api<{ url: string; provider: string; mode?: string }>("/settings/identities/link", {
    method: "POST",
    body: JSON.stringify({ provider, redirect_to }),
  });
}
export async function unlinkIdentity(identity_id: string) {
  return api<AccountSettings>("/settings/identities/unlink", {
    method: "POST",
    body: JSON.stringify({ identity_id }),
  });
}
export async function saveAccountPreferences(prefs: Record<string, unknown>) {
  return api<{ preferences: Record<string, unknown> }>("/settings/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
}
