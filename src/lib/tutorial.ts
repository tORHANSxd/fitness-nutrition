export const TUTORIAL_VERSION = 1;
export const TUTORIAL_EVENT = "nutritrain:tutorial-action";
export type TutorialAction = "food-added" | "food-weight-changed" | "food-lock-changed" | "meal-lock-changed" | "plan-saved" | "goal-saved" | "intake-opened" | "intake-saved";
export function tutorialAction(action: TutorialAction) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TUTORIAL_EVENT, { detail: action }));
}
export interface TutorialStep {
  title: string;
  description: string;
  route: string;
  selector: string;
  action?: TutorialAction;
  interaction?: { event: "input" | "click"; selector: string };
}
export const tutorialChapters: { id: string; title: string; description: string; steps: TutorialStep[] }[] = [
  { id: "meals", title: "安排第一餐", description: "选食物、填重量、锁定分量", steps: [
    { title: "选一项准备吃的食物", description: "点击“添加食物”，搜索并选择一项。自己的食物优先显示；需要更多选择时，可勾选食物成分表。", route: "/today", selector: '[data-tour="meal-add"]', action: "food-added" },
    { title: "填入实际准备的重量", description: "修改克重后，点击输入框外查看营养变化。带皮或带骨称重时，可勾选“换算可食部”。", route: "/today", selector: '[data-tour="food-amount"]', action: "food-weight-changed" },
    { title: "试试重量旁的锁", description: "点击锁图标切换状态。锁定后，自动调整会保留这项分量；手动填写克重也会自动锁定。若整餐已锁定，请先解锁整餐。", route: "/today", selector: '[data-tour="food-lock"]', action: "food-lock-changed" },
    { title: "也可以锁定整餐", description: "点击“锁定整餐”试一次。锁定的餐次不会参与自动调整，需要时再点一次解锁。", route: "/today", selector: '[data-tour="meal-lock"]', action: "meal-lock-changed" },
    { title: "保存这份餐食安排", description: "确认分量后点击“保存计划”。这里保存的是准备吃的内容；吃完后，在“每日记录”中确认实际摄入。", route: "/today", selector: '[data-tour="plan-save"]', action: "plan-saved" },
  ] },
  { id: "goals", title: "设置饮食目标", description: "选择目标并查看计算结果", steps: [
    { title: "选择适合自己的目标方式", description: "可以直接填写每日碳水、蛋白质和脂肪，也可以按身体数据计算。填好后先预览，确认无误再保存；已有目标可以跳过。", route: "/goals", selector: '[aria-label="饮食目标设置"]', action: "goal-saved" },
  ] },
  { id: "records", title: "记录每天的变化", description: "实际饮食、训练和身体数据", steps: [
    { title: "吃完后，记下一餐", description: "点击“按计划吃了”核对分量，或点击“记录食物或饮料”单独添加。请记录真实吃过的内容；尚未进食可以跳过。", route: "/records?tab=intake", selector: '[data-tour="intake-start"]', action: "intake-opened" },
    { title: "核对实际摄入再保存", description: "这里可以修改吃下的重量、增减食物并填写时间。点击“保存饮食记录”后，这一餐才会计入实际摄入。", route: "/records?tab=intake", selector: '[data-tour="intake-editor"]', action: "intake-saved" },
    { title: "训练由你自己记录", description: "训练当天添加训练组，填写动作、重量和次数，再保存。未完成的组可以保留为空；无需预先创建训练计划。", route: "/records?tab=training", selector: '[aria-label="记录分类"]' },
    { title: "身体数据在这里更新", description: "称重后填写当天体重，需要时补充围度。只填写实际测量过的数据，趋势页会根据保存的记录显示变化。", route: "/records?tab=body", selector: '[aria-label="记录分类"]' },
  ] },
  { id: "foods", title: "管理自己的食物", description: "搜索、常用食物与自行添加", steps: [
    { title: "搜索一种常吃的食物", description: "在搜索框输入名称，再结合分类或来源筛选。星标可以把食物加入常用，下一次安排餐食时更容易找到。", route: "/resources", selector: '[aria-label="搜索食物"]', interaction: { event: "input", selector: '[aria-label="搜索食物"]' } },
    { title: "打开添加食物", description: "找不到合适的食物时，点击“添加食物”。如果已经有同款食物，也可以直接编辑已有条目。", route: "/resources", selector: '[data-tour="food-create"]', interaction: { event: "click", selector: '[data-tour="food-create"]' } },
    { title: "按每 100 g 的标示填写", description: "填写名称、分类和三大营养素，热量会自动计算。实际包装数据优先；没有要新增的食物时，关闭窗口即可。", route: "/resources", selector: '[data-tour="food-create"]' },
  ] },
  { id: "progress", title: "查看趋势与历史", description: "回看身体变化和每天的记录", steps: [
    { title: "切换一种趋势", description: "点击“饮食计划”或“训练记录”查看历史。身体变化可以切换指标，空白日期表示没有记录。", route: "/progress", selector: '[aria-label="进度分类"]', interaction: { event: "click", selector: '[aria-label="进度分类"] a' } },
    { title: "从日历找到某一天", description: "选择日期，就能查看当天的饮食和训练记录。日常从“今日饮食”开始，补记过去的数据时再到日历查找。", route: "/calendar", selector: '#main-content' },
  ] },
];
