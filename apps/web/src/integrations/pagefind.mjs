import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const integrationDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(integrationDir, "..", "..");
const pagefindBin = join(projectRoot, "node_modules", "pagefind", "lib", "runner", "bin.cjs");

/**
 * Run Pagefind after Astro static build to index blog post bodies.
 */
export function pagefindIntegration() {
  return {
    name: "pagefind",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const distDir = dir.pathname;
        const glob = "blog/*/index.html";
        try {
          execSync(
            `node "${pagefindBin}" --site "${distDir}" --glob "${glob}" --force-language zh`,
            { stdio: "inherit" }
          );
          logger.info("[pagefind] indexed blog posts");
        } catch (error) {
          logger.error(`[pagefind] indexing failed: ${error.message}`);
          throw error;
        }
      },
    },
  };
}
