import type { APIRoute } from "astro";
import { buildBlogSortCatalog, jsonCatalogResponse } from "../../lib/sortCatalogs";

export const prerender = true;

export const GET: APIRoute = async () => {
  return jsonCatalogResponse(await buildBlogSortCatalog());
};
