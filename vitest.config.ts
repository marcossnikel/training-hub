import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default environment stays node so the pure-engine `src/lib/*.test.ts`
    // suites are unaffected. Component tests opt into jsdom per-file via a
    // `// @vitest-environment jsdom` pragma at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" -> "src/*" path alias so `@/lib/...`
      // imports resolve in tests. String "@" only matches "@/..." requests,
      // never scoped packages.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resolves this marker to an empty module for the server graph and
      // an error module for Client Components. Vitest executes the server graph.
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)
      ),
    },
  },
});
