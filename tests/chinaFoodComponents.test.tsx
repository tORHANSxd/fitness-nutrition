import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoodPickerDialog } from "@/components/FoodPickerDialog";
import { FoodCompositionBrowser } from "@/components/FoodCompositionBrowser";
import { builtinFoods } from "@/lib/foods";
import { chinaFoodSource } from "@/lib/chinaFoodComposition";

afterEach(() => vi.unstubAllGlobals());

describe("large food catalog UI", () => {
  it("pages the picker and searches the whole catalog before selecting by stable ID", () => {
    const onSelect = vi.fn();
    render(<FoodPickerDialog open foods={builtinFoods} onSelect={onSelect} onClose={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText(/第 2 \/ /)).toBeInTheDocument();
    expect(screen.getByLabelText("包含中国食物成分表")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("包含中国食物成分表"));
    fireEvent.change(screen.getByLabelText("搜索食物"), { target: { value: "031101" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByText("黄豆［大豆］"));
    expect(onSelect).toHaveBeenCalledWith("public-cfcd6-031101");
    fireEvent.change(screen.getByLabelText("搜索食物"), { target: { value: "219037" } });
    expect(screen.getByText("没有符合条件的食物。")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("搜索食物"), { target: { value: "" } });
    expect(screen.getByText(/第 1 \/ /)).toBeInTheDocument();
  });

  it("retains incomplete records in the reference browser and exposes GI search", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("china-food-gi")
      ? { commit: chinaFoodSource.commit, groups: [{ foodGroup: "糖类", list: [{ index: 1, foodName: "葡萄糖", GI: 100 }] }] }
      : { commit: "incorrect", records: [] } })));
    render(<FoodCompositionBrowser />);
    const details = screen.getByText(/中国食物成分表 · 全部/).closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    fireEvent.change(await screen.findByLabelText("成分表数据完整性"), { target: { value: "reference" } });
    expect(screen.getByText(/找到 328 条记录/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("搜索成分表"), { target: { value: "219037" } });
    fireEvent.click(screen.getByRole("button", { name: /蜂胶液/ }));
    expect(screen.getByText(/仅供查阅；补全可信数据/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("食物数据版本不一致"));
    fireEvent.click(screen.getByRole("button", { name: "GI 参考" }));
    expect(await screen.findByText("GI 100")).toBeInTheDocument();
  });
});
