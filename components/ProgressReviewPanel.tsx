"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useZonedToday } from "@/hooks/useZonedToday";
import { addDays } from "@/lib/dateTime";
import { loadBodyLogs, type BodyLog } from "@/lib/bodyLogs";
import { loadDailyCheckins } from "@/lib/storage";
import { activatePlanProtocol, loadPlanProtocols, protocolSchemaReady } from "@/lib/protocolStorage";
import { resolveProtocol, targetFromKcal } from "@/lib/planProtocol";
import { createTreProtocol } from "@/lib/planPresets";
import { reviewProgress } from "@/lib/progressReview";
import { displayEnergy, displayWeight, type EnergyUnit, type UnitSystem } from "@/lib/preferences";
import type { DailyCheckin, PlanProtocol } from "@/lib/types";

const labels = { maintain:"维持观察", review_intake:"先核对执行与恢复", consider_increase:"可考虑增加摄入", consider_small_decrease:"可考虑小幅减少", recovery_first:"恢复优先", insufficient_data:"数据不足" };
export function ProgressReviewPanel({user,timeZone,energyUnit,unitSystem}:{user:User|null;timeZone:string;energyUnit:EnergyUnit;unitSystem:UnitSystem}) {
  const today=useZonedToday(timeZone); const end=addDays(today,-1);
  const [data,setData]=useState<{logs:BodyLog[];checkins:DailyCheckin[];protocols:PlanProtocol[];ready:boolean}|null>(null);
  const [error,setError]=useState(""); const [date,setDate]=useState(""); const [preview,setPreview]=useState<PlanProtocol|null>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  useEffect(()=>{let active=true;if(!user)return;Promise.all([loadBodyLogs(user,120),loadDailyCheckins(user,addDays(end,-89),end),loadPlanProtocols(user),protocolSchemaReady(user)]).then(([logs,checkins,protocols,ready])=>{if(active){setData({logs,checkins,protocols,ready});setError("");}}).catch(e=>{if(active)setError(e instanceof Error?e.message:"复盘数据读取失败。");});return()=>{active=false;};},[user,end]);
  const protocol=data?resolveProtocol(data.protocols,today):null;
  const review=protocol&&data?reviewProgress(protocol,end,data.logs,data.checkins):null;
  function makePreview(){try{if(!review?.adjustmentKcal||!protocol||!data)return;if(date<=today)throw new Error("请选择未来生效日，保留已记录日期。");const previous=data.protocols.at(-1)!;if(previous.id!==protocol.id)throw new Error("已有未来协议，请先等待生效后复盘，避免重复调整。");setPreview(createTreProtocol({id:crypto.randomUUID(),effectiveFrom:date,cycleAnchorDate:protocol.trainingCycle.anchorDate,timeZone:protocol.timeZone,previous:protocol,target:targetFromKcal(protocol.dailyTarget.kcal+review.adjustmentKcal,protocol.dailyTarget.protein,protocol.dailyTarget.fat),changeReason:review.reasons.join(" ").slice(0,500),evidenceWindow:review.evidenceWindow}));setError("");}catch(e){setError(e instanceof Error?e.message:"预览失败。");}}
  async function apply(){if(!preview||!data||busy)return;setBusy(true);try{const saved=await activatePlanProtocol(preview,user);setData({...data,protocols:[...data.protocols.filter(p=>p.id!==saved.id),saved]});setPreview(null);setMessage(`目标版本 ${saved.version} 已保存，将于 ${saved.effectiveFrom} 生效。`);}catch(e){setError(e instanceof Error?e.message:"保存失败。");}finally{setBusy(false);}}
  return <section className="panel space-y-3 p-4" aria-label="目标回顾"><h2 className="text-lg font-semibold">目标回顾</h2>
    {!user?<p>登录后查看自己的确认记录。</p>:!data&&!error?<p>读取复盘数据中…</p>:!protocol?<p>设置饮食目标并积累记录后，可在这里回顾变化。</p>:null}
    {review&&protocol?<><p>{labels[review.status]} · 截至 {end}</p><p className="text-sm">{review.reasons.join(" ")}</p><p className="text-xs text-muted">记录参考：每7天至少{protocol.reviewRules.minWeightsPerWeek}次体重、{protocol.reviewRules.minIntakeDaysPerWeek}天完整摄入，目标稳定{protocol.reviewRules.stableTargetDays}天；恢复稳定判断至少3天已填恢复和睡眠。体测请尽量在相同晨间条件记录。</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>7天窗口</th><th>均重/样本</th><th>均腰围/样本</th><th>实际摄入均值/天数</th></tr></thead><tbody>{review.windows.map(w=><tr key={w.from}><td className="py-2">{w.from}—{w.to}</td><td>{w.meanWeight==null?"未知":`${displayWeight(w.meanWeight,unitSystem).toFixed(2)} ${unitSystem==="imperial"?"lb":"kg"}`} / {w.weightSamples}</td><td>{w.meanWaist==null?"未知":`${(unitSystem==="imperial"?w.meanWaist/2.54:w.meanWaist).toFixed(1)} ${unitSystem==="imperial"?"in":"cm"}`} / {w.waistSamples}</td><td>{w.meanIntake==null?"未知":`${displayEnergy(w.meanIntake,energyUnit).toFixed(0)} ${energyUnit==="kj"?"kJ":"kcal"}`} / {w.intakeDays}</td></tr>)}</tbody></table></div>
    <p className="text-xs">恢复：{review.recovery==="stable"?"已记录信息支持稳定":review.recovery==="concern"?"需要关注":"未知/信息不足"}；周均下降（正数为减重）：{review.weeklyLoss.length?review.weeklyLoss.map(n=>`${displayWeight(n,unitSystem).toFixed(2)} ${unitSystem==="imperial"?"lb":"kg"}`).join("、"):"暂无有效比较"}</p>
    {review.adjustmentKcal!=null&&protocol.nutrition?<p className="text-sm">候选调整 {displayEnergy(review.adjustmentKcal,energyUnit).toFixed(0)} {energyUnit==="kj"?"kJ":"kcal"}。请到<a className="underline" href="/goals">饮食目标</a>调整数值，预览后确认。</p>:review.adjustmentKcal!=null&&data?.ready?<div className="flex flex-wrap items-end gap-2"><label className="text-xs">新目标生效日<input aria-label="复盘目标生效日" className="field" type="date" min={addDays(today,1)} value={date} onChange={e=>{setDate(e.target.value);setPreview(null);}} /></label><button className="btn-secondary" onClick={makePreview}>预览建议调整</button></div>:null}
    {preview?<div className="rounded border border-line p-3 text-sm"><p>当前 {displayEnergy(protocol.dailyTarget.kcal,energyUnit).toFixed(0)} → {displayEnergy(preview.dailyTarget.kcal,energyUnit).toFixed(0)} {energyUnit==="kj"?"kJ":"kcal"}；蛋白质 {preview.dailyTarget.protein} / 脂肪 {preview.dailyTarget.fat} / 碳水 {preview.dailyTarget.carbs} g，{preview.effectiveFrom} 生效。确认后更新热量目标。</p><button className="btn-primary mt-2" disabled={busy} onClick={apply}>确认应用新目标版本</button></div>:null}</>:null}
    {error?<p role="alert" className="text-sm text-danger">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  </section>;
}
