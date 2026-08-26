import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migrations = [
  ["20260607124646_fitness_system_v2_schema.sql", "7e35d75763e97aafdc034335d5f70af9"],
  ["20260607134724_allow_food_weight_basis_none.sql", "579904c5681d48eada805718770e52b2"],
  ["20260607141007_add_daily_checkin_dynamic_target.sql", "25dc12fa3fd389368bdadad7e9516369"],
  ["20260724093227_food_ingredient_category.sql", "d342a4cd597bbd28cca8931bee08d470"],
  ["20260825234027_global_preferences.sql", "2ad17331aae7ff3ab472abbaff0e657b"],
];

const migrationDirectory = fileURLToPath(
  new URL("../supabase/migrations/", import.meta.url),
);

let failed = false;

for (const [fileName, expectedHash] of migrations) {
  const filePath = `${migrationDirectory}${fileName}`;

  try {
    const sql = (await readFile(filePath, "utf8"))
      .replace(/\r\n/g, "\n")
      .replace(/\n+$/, "");
    const actualHash = createHash("md5").update(sql).digest("hex");
    const matches = actualHash === expectedHash;

    console.log(`${matches ? "OK" : "MISMATCH"} ${fileName} ${actualHash}`);
    failed ||= !matches;
  } catch (error) {
    console.error(`MISSING ${fileName}`, error);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
