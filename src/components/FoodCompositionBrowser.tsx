"use client";

import { useEffect, useMemo, useState } from "react";
import {
  chinaFoodCatalog, chinaFoodId, chinaFoodSource, chinaFoodToFoodItem, chinaFoodUnavailableReason,
  chinaCompositionFoods, getChinaFoodSummary, loadChinaFoodRecords, loadChinaGiGroups, matchesFoodSearch,
  type ChinaFoodRecord, type ChinaGiGroup,
} from "@/lib/chinaFoodComposition";
import { FoodPagination, useFoodPage } from "@/components/FoodPagination";

const nutrientLabels: Record<string, string> = {
  edible: "可食部 %", water: "水分 g", energyKCal: "原表能量 kcal", energyKJ: "原表能量 kJ",
  protein: "蛋白质 g", fat: "脂肪 g", CHO: "总碳水 g", dietaryFiber: "膳食纤维 g", cholesterol: "胆固醇 mg", ash: "灰分 g",
  vitaminA: "维生素 A μg", carotene: "胡萝卜素 μg", retinol: "视黄醇 μg", thiamin: "硫胺素 mg", riboflavin: "核黄素 mg",
  niacin: "烟酸 mg", vitaminC: "维生素 C mg", vitaminETotal: "维生素 E 总量 mg", vitaminE1: "维生素 E α-E mg",
  vitaminE2: "维生素 E (β+γ)-E mg", vitaminE3: "维生素 E δ-E mg", Ca: "钙 mg", P: "磷 mg", K: "钾 mg", Na: "钠 mg",
  Mg: "镁 mg", Fe: "铁 mg", Zn: "锌 mg", Se: "硒 μg", Cu: "铜 mg", Mn: "锰 mg",
};

export function FoodCompositionDetails({ foodId }: { foodId: string }) {
  const summary = getChinaFoodSummary(foodId);
  const [state, setState] = useState<{ foodId: string; record?: ChinaFoodRecord; error?: string }>({ foodId });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadChinaFoodRecords().then((records) => {
      const record = records.find((row) => chinaFoodId(row.foodCode) === foodId);
      if (active) setState(record ? { foodId, record } : { foodId, error: "没有找到该食物的原始记录。" });
    }).catch((error) => { if (active) setState({ foodId, error: error instanceof Error ? error.message : "读取失败。" }); });
    return () => { active = false; };
  }, [foodId, attempt]);
  if (!summary) return null;
  const record = state.foodId === foodId ? state.record : undefined;
  const error = state.foodId === foodId ? state.error : undefined;
  const food = chinaFoodToFoodItem(summary);
  const sourcePath = `json_data_v3_20260825_qwen38max_kimi_k3_fixed_en/merged_${summary.group}.json`;
  return (
    <section className="rounded-lg border border-line bg-panel/40 p-3 text-sm" aria-label={`${summary.foodName}成分详情`}>
      <h3 className="font-semibold text-ink">{summary.foodName} · {summary.foodCode}</h3>
      {summary.englishName ? <p className="mt-1 break-words text-xs text-muted">{summary.englishName}</p> : null}
      <p className="mt-1 text-xs text-muted">{summary.group} · 每 100g 可食部，按食物名称所示状态称量；可食部比例不再乘入营养值。</p>
      <p className="mt-2 text-xs text-muted">以下为原始成分表，不随个人覆盖值改变。— / 空白 / un 保留为未知；Tr 表示微量，配餐计算近似为 0；* 为原表标记。</p>
      <p className={`my-2 text-xs ${food ? "text-muted" : "text-warning"}`}>
        {food ? `配餐使用：净碳水 ${food.carbsPer100g}g（总碳水 − 膳食纤维），按 4/4/9 估算 ${food.kcalPer100g} kcal；原表能量单独保留。` : `${chinaFoodUnavailableReason(summary)}，仅供查阅；补全可信数据后可另存为自定义食物。`}
      </p>
      {record ? (
        <>
          <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(nutrientLabels).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2 border-b border-line py-1.5 text-xs">
                <dt className="text-muted">{label}</dt><dd className="tabular-nums text-ink">{record[key] || "未提供"}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">原表备注：{record.remark || "无"}</p>
        </>
      ) : error ? <p role="alert" className="text-xs text-danger">{error} <button type="button" className="btn-secondary min-h-11" onClick={() => { setState({ foodId }); setAttempt((value) => value + 1); }}>重试</button></p>
        : <p role="status" className="text-xs text-muted">正在读取原始营养成分…</p>}
      <a className="mt-3 inline-block text-xs text-accent-text underline" href={`${chinaFoodSource.repository}/blob/${chinaFoodSource.commit}/${sourcePath.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer">查看数据来源</a>
    </section>
  );
}

function CompositionRecords() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [availability, setAvailability] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(chinaFoodCatalog.map((row) => row.group))], []);
  const visible = useMemo(() => chinaFoodCatalog.filter((row) => (!group || row.group === group)
    && matchesFoodSearch({ id: chinaFoodId(row.foodCode), name: row.foodName }, search)
    && (availability === "all" || Boolean(chinaFoodUnavailableReason(row)) === (availability === "reference"))), [search, group, availability]);
  const pagination = useFoodPage(visible, JSON.stringify([search, group, availability]), 30);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="field w-full" aria-label="搜索成分表" placeholder="名称、英文名或食物代码" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="field w-full" aria-label="成分表原始分类" value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="">全部 61 个原始分类</option>{groups.map((name) => <option key={name}>{name}</option>)}
        </select>
        <select className="field w-full" aria-label="成分表数据完整性" value={availability} onChange={(event) => setAvailability(event.target.value)}>
          <option value="all">全部记录</option><option value="usable">可用于配餐</option><option value="reference">数据待补全</option>
        </select>
      </div>
      <p className="text-xs text-muted" role="status">找到 {visible.length} 条记录。可用食物已加入上方食物库和配餐选择器。</p>
      {selectedId ? <FoodCompositionDetails key={selectedId} foodId={selectedId} /> : null}
      <ul className="divide-y divide-line">
        {pagination.items.map((row) => <li key={row.foodCode}>
          <button type="button" className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-sm" onClick={() => setSelectedId(chinaFoodId(row.foodCode))}>
            <span className="break-words text-ink">{row.foodName} <span className="text-xs text-muted">{row.foodCode}</span></span>
            <span className={`text-xs ${chinaFoodUnavailableReason(row) ? "text-warning" : "text-muted"}`}>{chinaFoodUnavailableReason(row) ? "数据待补全 · 查看" : "查看完整成分"}</span>
          </button>
        </li>)}
      </ul>
      <FoodPagination {...pagination} />
    </div>
  );
}

function GiRecords() {
  const [groups, setGroups] = useState<ChinaGiGroup[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    loadChinaGiGroups().then((data) => { if (active) setGroups(data); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "读取失败。"); });
    return () => { active = false; };
  }, [attempt]);
  const rows = useMemo(() => (groups ?? []).flatMap((group) => group.list.map((row) => ({ ...row, group: group.foodGroup }))).filter((row) => row.foodName.includes(search.trim()) || row.group.includes(search.trim())), [groups, search]);
  const pagination = useFoodPage(rows, search, 30);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">完整保留 259 条 GI 参考值及名称中的原表标记。GI 表没有食物代码，按原始名称单独查询，未与同名营养记录自动匹配。</p>
      <input className="field w-full" aria-label="搜索 GI" placeholder="搜索 GI 食物名称或分类" value={search} onChange={(event) => setSearch(event.target.value)} />
      {!groups && !error ? <p role="status">正在读取 GI 数据…</p> : null}
      {error ? <p role="alert">{error} <button type="button" className="btn-secondary min-h-11" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>重试</button></p> : null}
      {groups ? <p className="text-xs text-muted" role="status">找到 {rows.length} 条 GI 记录</p> : null}
      <ul className="divide-y divide-line">{pagination.items.map((row) => <li key={row.index} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
        <span className="break-words">{row.foodName} <span className="text-xs text-muted">{row.group}</span></span><span className="shrink-0 tabular-nums">GI {row.GI}</span>
      </li>)}</ul>
      <FoodPagination {...pagination} />
    </div>
  );
}

export function FoodCompositionBrowser() {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState("foods");
  return (
    <details className="panel mt-4 p-4" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer font-semibold text-ink">中国食物成分表 · 全部 {chinaFoodSource.foodCount} 条营养记录 / {chinaFoodSource.giCount} 条 GI</summary>
      {expanded ? <div className="mt-3 space-y-3">
        <p className="text-sm text-muted">已接入 {chinaCompositionFoods.length} 条可配餐食物；其余 {chinaFoodCatalog.length - chinaCompositionFoods.length} 条缺少净碳水计算所需数据，保留原文供查阅。</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary min-h-11" aria-pressed={tab === "foods"} onClick={() => setTab("foods")}>营养成分</button>
          <button type="button" className="btn-secondary min-h-11" aria-pressed={tab === "gi"} onClick={() => setTab("gi")}>GI 参考</button>
        </div>
        {tab === "foods" ? <CompositionRecords /> : <GiRecords />}
        <p className="text-xs text-muted">来源：<a className="underline" href={chinaFoodSource.repository} target="_blank" rel="noreferrer">Sanotsu / 中国食物成分表第 6 版</a>，2026-09-08 修正版。源数据为书籍转录，可能有误；婴幼儿食品未收录。原仓库声明用于个人学习研究，未提供明确商用许可。</p>
      </div> : null}
    </details>
  );
}
