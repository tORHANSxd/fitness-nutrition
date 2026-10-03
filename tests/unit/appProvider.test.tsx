import type { User } from "@supabase/supabase-js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "@/components/app/AppProvider";
import { builtinFoods } from "@/lib/foods";
import { defaultPreferences } from "@/lib/preferences";
import { loadProfilePreferences } from "@/lib/preferencesStorage";
import { loadFoods, loadPlannerTemplates } from "@/lib/storage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() })
}));

vi.mock("@/lib/preferencesStorage", () => ({
  loadProfilePreferences: vi.fn(),
  saveProfilePreferences: vi.fn()
}));

vi.mock("@/lib/storage", () => ({
  loadFoods: vi.fn(),
  loadPlannerTemplates: vi.fn(),
  savePlannerTemplates: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn()
    }
  })
}));

afterEach(cleanup);

function ProviderState() {
  const { foods, templates, syncState, loadingFoods } = useApp();
  return (
    <div>
      <span>{foods.map((food) => food.name).join(",")}</span>
      <span>{templates.mealTemplates.map((template) => template.name).join(",")}</span>
      <span>{syncState}</span>
      <span>{loadingFoods ? "loading" : "loaded"}</span>
    </div>
  );
}

describe("AppProvider 初始化容错", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("偏好字段缺失时仍展示已加载的用户食物和分餐模板", async () => {
    const user = { id: "user-1" } as User;
    const userFood = {
      ...builtinFoods[0],
      id: "user-food-1",
      userId: user.id,
      name: "用户自定义食物",
      source: "user" as const
    };
    const templates = {
      mealTemplates: [{
        id: "meal-template-1",
        name: "用户分餐模板",
        foods: [{ foodId: userFood.id }],
        createdAt: "2026-08-26T00:00:00.000Z"
      }],
      dayTemplates: []
    };

    vi.mocked(loadFoods).mockResolvedValue([userFood]);
    vi.mocked(loadPlannerTemplates).mockResolvedValue(templates);
    vi.mocked(loadProfilePreferences).mockRejectedValue(
      new Error("Could not find the 'locale' column of 'profiles' in the schema cache")
    );

    render(
      <AppProvider initialUser={user} initialPreferences={defaultPreferences()}>
        <ProviderState />
      </AppProvider>
    );

    expect(await screen.findByText("用户自定义食物")).toBeInTheDocument();
    expect(screen.getByText("用户分餐模板")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("schema-required")).toBeInTheDocument();
      expect(screen.getByText("loaded")).toBeInTheDocument();
    });
  });
});
