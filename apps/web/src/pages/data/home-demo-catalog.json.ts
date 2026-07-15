import type { APIRoute } from "astro";
import { buildHomeDemoCatalog, jsonCatalogResponse } from "../../lib/sortCatalogs";

export const prerender = true;

export const GET: APIRoute = async () => {
  return jsonCatalogResponse(await buildHomeDemoCatalog());
};
