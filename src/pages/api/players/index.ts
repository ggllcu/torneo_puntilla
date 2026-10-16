import type { APIRoute } from "astro";
import { json } from "../../../lib/push-api";
import { loadPlayers } from "../../../lib/push-db";
import { db } from "../../../lib/push-env";

export const prerender = false;

export const GET: APIRoute = async () => json(await loadPlayers(db()));
