// Rebuild the pinned, public numeric dataset. Does not access application accounts or databases.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const commit = "d15675c27582748307023b7ee7aca2a63fc52756";
const repository = "https://github.com/Sanotsu/china-food-composition-data";
const directory = "json_data_v3_20260825_qwen38max_kimi_k3_fixed_en";
const root = fileURLToPath(new URL("../", import.meta.url));
const categoryMap = {
  谷类及其制品: "主食", 薯类淀粉及其制品: "主食", 干豆类及其制品: "豆类",
  蔬菜类及其制品: "蔬菜", 菌藻类: "蔬菜", 水果类及其制品: "水果", 坚果种子类: "坚果",
  畜肉类及其制品: "肉类", 禽肉类及其制品: "肉类", 蛋类及其制品: "肉类", 鱼虾蟹贝类: "肉类",
  乳类及其制品: "乳制品", 动物油脂类: "食物配料", 植物油: "食物配料", 其他类: "其他",
};
const summaryFields = ["foodCode", "foodName", "englishName", "edible", "energyKCal", "CHO", "dietaryFiber", "protein", "fat"];
async function download(path) {
  const response = await fetch(`https://raw.githubusercontent.com/Sanotsu/china-food-composition-data/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`);
  if (!response.ok) throw new Error(`Download failed: ${path} (${response.status})`);
  const content = await response.text();
  return { path, sha256: createHash("sha256").update(content).digest("hex"), data: JSON.parse(content) };
}

// --source accepts a locally downloaded audit snapshot; otherwise fetch this exact revision.
let files;
const sourceIndex = process.argv.indexOf("--source");
if (sourceIndex >= 0) {
  const snapshot = JSON.parse(await readFile(process.argv[sourceIndex + 1], "utf8"));
  if (snapshot.commit !== commit) throw new Error("Unexpected source revision");
  files = snapshot.files;
} else {
  const response = await fetch(`https://api.github.com/repos/Sanotsu/china-food-composition-data/git/trees/${commit}?recursive=1`);
  if (!response.ok) throw new Error(`GitHub tree request failed (${response.status})`);
  const tree = await response.json();
  const paths = tree.tree.map((file) => file.path).filter((path) => path.startsWith(`${directory}/merged_`) && path.endsWith(".json"));
  paths.push("json_gi_of_foods/glycemic_index_of_foods.json");
  files = [];
  for (let i = 0; i < paths.length; i += 6) files.push(...await Promise.all(paths.slice(i, i + 6).map(download)));
}
files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const nutritionFiles = files.filter((file) => file.path.startsWith(`${directory}/merged_`) && file.path.endsWith(".json"));
const records = [], summaries = [], seen = new Set();
for (const file of nutritionFiles) {
  const group = file.path.slice(`${directory}/merged_`.length, -5);
  const category = categoryMap[group.split("-")[0]];
  if (!category || !Array.isArray(file.data)) throw new Error(`Unexpected category/data: ${file.path}`);
  for (const row of file.data) {
    if (!/^\d{6}x?$/.test(row.foodCode) || !row.foodName || seen.has(row.foodCode)) throw new Error(`Invalid/duplicate food code: ${row.foodCode}`);
    if (Object.values(row).some((value) => typeof value !== "string")) throw new Error(`Non-text nutrient value: ${row.foodCode}`);
    if (summaryFields.some((field) => typeof row[field] !== "string")) throw new Error(`Missing field: ${row.foodCode}`);
    seen.add(row.foodCode);
    records.push({ group, ...row });
    summaries.push({ group, category, ...Object.fromEntries(summaryFields.map((field) => [field, row[field]])) });
  }
}
const gi = files.find((file) => file.path === "json_gi_of_foods/glycemic_index_of_foods.json")?.data;
const giRows = gi?.flatMap((group) => group.list) ?? [];
if (nutritionFiles.length !== 61 || records.length !== 1677 || giRows.length !== 259 || summaries.filter((row) => row.englishName).length !== 1242) throw new Error("Pinned dataset totals do not match");
if (new Set(giRows.map((row) => row.index)).size !== 259 || giRows.some((row) => !Number.isFinite(row.GI) || !row.foodName)) throw new Error("Invalid GI data");
const metadata = {
  repository, commit, directory, foodCount: records.length, categoryCount: nutritionFiles.length,
  englishNameCount: 1242, giCount: giRows.length,
  files: files.map(({ path, sha256, data }) => ({ path, sha256, records: data.length })),
};
const output = {
  "lib/data/china-food-catalog.json": JSON.stringify(summaries),
  "public/data/china-food-composition.json": JSON.stringify({ commit, records }),
  "public/data/china-food-gi.json": JSON.stringify({ commit, groups: gi }),
  "public/data/china-food-source.json": JSON.stringify(metadata, null, 2),
};
const check = process.argv.includes("--check");
for (const [path, content] of Object.entries(output)) {
  const expected = `${content}\n`;
  if (check) {
    if (await readFile(`${root}${path}`, "utf8") !== expected) throw new Error(`Generated file differs: ${path}`);
  } else {
    await mkdir(fileURLToPath(new URL(`../${path.substring(0, path.lastIndexOf("/"))}/`, import.meta.url)), { recursive: true });
    await writeFile(`${root}${path}`, expected, "utf8");
  }
}
console.log(`${check ? "Verified" : "Generated"} ${records.length} foods / ${nutritionFiles.length} categories / ${giRows.length} GI records at ${commit}`);
