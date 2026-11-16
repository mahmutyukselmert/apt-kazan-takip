import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const generatedPath = resolve("dist/server/wrangler.json");
const deployPath = resolve("dist/server/wrangler.cloudflare.json");
const config = JSON.parse(await readFile(generatedPath, "utf8"));

config.name = "semaapt-gaz-takip";
config.workers_dev = true;
config.preview_urls = false;
config.vars = { ...(config.vars || {}), AUTH_REQUIRED: "true" };
config.d1_databases = [
  {
    binding: "DB",
    database_name: "apartman-kazan-db",
    database_id: "e6ff9605-38aa-46de-afee-158dd5f3f665",
  },
];

await writeFile(deployPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Cloudflare deployment config prepared: ${deployPath}`);
