import { describe,expect,it } from "vitest";
import { actualTotals, actualCoverageKnown, confirmMealEvent, emptyActualV3, normalizeActualV3, parseMealEvent } from "@/lib/actualIntake";
import { builtinFoods } from "@/lib/foods";
import { parseDailyCheckinActual } from "@/lib/storageDocuments";
import { actualFastingMinutes } from "@/lib/eatingSchedule";
import { aggregateHeatmap } from "@/lib/heatmap";
const food={...builtinFoods[0],name:"合成测试食品"};
const meal={id:"meal-1",name:"测试餐",ratio:1,locked:false,entries:[{id:"entry-1",foodId:food.id,grams:100,locked:false}]};
describe("actual intake V3",()=>{
  it("N10 freezes food and quantity independently of later plan/library edits",()=>{const m=structuredClone(meal);const f=structuredClone(food);const event=confirmMealEvent(m,new Map([[f.id,f]]),{id:"event-1",timeZone:"Asia/Shanghai"});const initial=structuredClone(event);m.entries[0].grams=999;f.proteinPer100g=999;expect(event).toEqual(initial);expect(event.startedAt).toBeUndefined();});
  it("D02 retains V2 all-day totals and unknown times without fabricating events",()=>{const legacy=parseDailyCheckinActual({kcal:1800,protein:100,carbs:200,fat:60},{},"2026-01-01");expect(legacy.version).toBe(2);if(legacy.version!==2)throw Error();const v3=emptyActualV3(legacy);expect(v3.mealEvents).toEqual([]);expect(actualTotals(v3)).toEqual(legacy.totalsSnapshot);expect(actualFastingMinutes([],[])).toBeNull();expect(aggregateHeatmap([{date:"2026-01-01",completed:true,actual:v3,target:{kcal:0,protein:0,carbs:0,fat:0}}],"kcal").positiveTotal).toBe(1800);});
  it("D04 counts unknown caloric drinks as incomplete even if the day is confirmed",()=>{const e=parseMealEvent({id:"drink",timeZone:"Asia/Shanghai",actualFoodEntries:[],containsCalories:true,entryMethod:"estimated",note:"无法量化的饮料"});const a=normalizeActualV3({...emptyActualV3(),intakeComplete:true,mealEvents:[e]});expect(actualCoverageKnown(a)).toBe(false);});
  it("derives totals and calorie flags from events, ignoring tampered compatibility foods",()=>{const event=confirmMealEvent(meal,new Map([[food.id,food]]),{id:"e",timeZone:"Asia/Shanghai"});const a=normalizeActualV3({...emptyActualV3(),intakeComplete:true,mealEvents:[{...event,containsCalories:false}],foods:[{foodId:"fake",grams:999,totals:{kcal:9999}}]});expect(a.mealEvents[0].containsCalories).toBe(true);expect(a.foods[0].foodId).toBe(food.id);expect(actualTotals(a).protein).toBe(food.proteinPer100g);expect(actualCoverageKnown(a)).toBe(true);});
  it("D12 refuses unknown documents, duplicate events, Infinity and oversized notes",()=>{const e=confirmMealEvent(meal,new Map([[food.id,food]]),{id:"e",timeZone:"Asia/Shanghai"});expect(()=>normalizeActualV3({...emptyActualV3(),mealEvents:[e,e]})).toThrow();expect(()=>normalizeActualV3({...emptyActualV3(),bmrKcal:Infinity})).toThrow();expect(()=>parseMealEvent({...e,note:"x".repeat(501)})).toThrow();expect(()=>parseDailyCheckinActual({version:99,secretFutureField:1},{},"2026-01-01")).toThrow();});
});
