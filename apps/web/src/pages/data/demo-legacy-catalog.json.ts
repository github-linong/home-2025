import type { APIRoute } from "astro";
import { buildDemoLegacyCatalog, jsonCatalogResponse } from "../../lib/sortCatalogs";

export const prerender = true;

export const GET: APIRoute = async () => {
  return jsonCatalogResponse(await buildDemoLegacyCatalog());
};
