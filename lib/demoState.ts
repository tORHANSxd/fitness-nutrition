import { builtinFoods } from "@/lib/foods";
import { createDefaultMeals } from "@/lib/nutrition";
import type { MealPlan, UserProfile } from "@/lib/types";

export const defaultProfile: UserProfile = {
  sex: "male",
  age: 28,
  heightCm: 175,
  weightKg: 75,
  activityFactor: 1.45,
  exerciseKcal: 350,
  proteinPerKg: 1.2,
  bodyTypeFactor: 2.5,
  workoutType: "legs",
  trainingTime: "afternoon",
  planDate: new Date().toISOString().slice(0, 10)
};

export function createStarterMeals(profile: UserProfile): MealPlan[] {
  const meals = createDefaultMeals(profile);
  return meals.map((meal) => {
    if (meal.id === "breakfast") {
      return {
        ...meal,
        entries: [
          {
            id: crypto.randomUUID(),
            foodId: "public-oats-raw",
            grams: 60,
            locked: false,
            minGrams: 40,
            maxGrams: 100
          },
          {
            id: crypto.randomUUID(),
            foodId: "public-whey",
            grams: 25,
            locked: false,
            minGrams: 20,
            maxGrams: 40
          }
        ]
      };
    }
    if (meal.id === "lunch") {
      return {
        ...meal,
        entries: [
          {
            id: crypto.randomUUID(),
            foodId: "public-rice-cooked",
            grams: 200,
            locked: false,
            minGrams: 100,
            maxGrams: 400
          },
          {
            id: crypto.randomUUID(),
            foodId: "public-chicken-breast-cooked",
            grams: 160,
            locked: false,
            minGrams: 100,
            maxGrams: 260
          },
          {
            id: crypto.randomUUID(),
            foodId: "public-broccoli-cooked",
            grams: 180,
            locked: false,
            minGrams: 100,
            maxGrams: 350
          }
        ]
      };
    }
    if (meal.id === "pre-workout") {
      return {
        ...meal,
        entries: [
          {
            id: crypto.randomUUID(),
            foodId: "public-banana-raw",
            grams: 120,
            locked: false,
            minGrams: 80,
            maxGrams: 180
          }
        ]
      };
    }
    return {
      ...meal,
      entries: [
        {
          id: crypto.randomUUID(),
          foodId: "public-salmon-cooked",
          grams: 150,
          locked: false,
          minGrams: 100,
          maxGrams: 240
        },
        {
          id: crypto.randomUUID(),
          foodId: "public-sweet-potato-cooked",
          grams: 220,
          locked: false,
          minGrams: 120,
          maxGrams: 380
        }
      ]
    };
  });
}

export const defaultFoods = builtinFoods;

