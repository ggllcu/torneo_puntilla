// Admin check against the Worker secret ADMIN_TOKEN (only importable inside the Worker).
import type { AstroCookies } from "astro";
import { env } from "cloudflare:workers";
import { ADMIN_COOKIE, isAdminToken } from "./admin";

export const adminSecret = (): string | undefined => (env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;

export const isAdmin = (cookies: AstroCookies): boolean => isAdminToken(cookies.get(ADMIN_COOKIE)?.value, adminSecret());
