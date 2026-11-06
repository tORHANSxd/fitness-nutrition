import { summarizeFoodQuality, type FoodQualityPortion } from "@/lib/foodNutrition";

export function FoodQualityDetails({ portions, label, partial = false }: { portions: FoodQualityPortion[]; label: string; partial?: boolean }) {
  const summary = summarizeFoodQuality(portions);
  return <details className="rounded-xl border border-line p-4" aria-label={`${label}营养质量`}>
    <summary className="cursor-pointer text-sm font-medium">{label}：蛋白质来源与营养口径</summary>
    <div className="mt-3 space-y-4 text-sm">
      {(partial || summary.missingFoods > 0) && <p className="text-warning">以下仅统计具备食品明细的部分；历史汇总或缺失食品无法补出营养质量数据。</p>}
      <div><p className="font-medium">总蛋白质 {summary.protein.toFixed(1)} g · 查看主要来源</p>
        {summary.protein > 0 && <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">{Object.entries(summary.proteinByCategory).filter(([, grams]) => grams > 0).sort((a, b) => b[1] - a[1]).map(([category, grams]) => <div key={category} className="flex justify-between gap-2"><dt>{category}</dt><dd>{grams.toFixed(1)} g</dd></div>)}</dl>}
        <p className="mt-2 text-muted">先满足全天总量，再看每餐的主要蛋白来源。米饭、豆类、坚果等全部按原克数计入；正餐优先安排乳、蛋、鱼、肉、大豆制品等蛋白来源，以植物为主时搭配豆类与谷物。</p>
        <p className="mt-2 text-muted">胶原或明胶仍计入总量，但不宜作为主要增肌蛋白来源。不设统一“吸收折扣”，也不因吃植物蛋白就自动增加目标。<a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/33599941/" target="_blank" rel="noreferrer">整份饮食研究</a></p>
      </div>
      <div><p className="font-medium">已知膳食纤维 {summary.fiberGrams.toFixed(1)} g{summary.unknownFiberItems > 0 ? ` · ${summary.unknownFiberItems} 项未知，为部分合计` : ""}</p>
        <p className="mt-2 text-muted">{summary.unknownCarbBasisItems > 0 ? `${summary.unknownCarbBasisItems} 项碳水来源口径未标明。` : "已保留各食品的碳水来源口径。"}来源中的总碳水与可利用碳水含义不同，不能统一再减一次纤维。糖醇、阿洛酮糖和抗性淀粉缺少定量资料，未作额外扣减；GI 不代表吸收比例。</p>
      </div>
      <div><p className="font-medium">脂肪质量资料未提供</p><p className="mt-2 text-muted">饱和脂肪、反式脂肪及必需脂肪酸未按零记录。它们属于总脂肪的组成信息；不能按“好坏”增减脂肪克数或额外加罚热量。</p></div>
      <p className="text-xs text-muted">采用来源能量 {summary.sourceEnergyItems} 项，4/4/9 估算 {summary.macroEnergyItems} 项。已有来源能量不再额外添加纤维热量，也不另扣食物热效应。<a className="underline" href="https://www.fao.org/4/y5022e/y5022e05.htm" target="_blank" rel="noreferrer">能量换算依据</a></p>
    </div>
  </details>;
}
