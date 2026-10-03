"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface Shortcuts {
  recent: string[];
  favorites: string[];
}
const empty: Shortcuts = { recent: [], favorites: [] };
const FoodShortcutsContext = createContext({
  ...empty,
  remember: (_id: string) => {},
  toggleFavorite: (_id: string) => {},
});

export function FoodShortcutsProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [value, setValue] = useState<Shortcuts>(empty);
  const key = `nutritrain:food-shortcuts:${userId}`;
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? "null");
      const list = (v: unknown) =>
        Array.isArray(v)
          ? v.filter((id): id is string => typeof id === "string").slice(0, 100)
          : [];
      setValue({
        recent: list(data?.recent),
        favorites: list(data?.favorites),
      });
    } catch {
      setValue(empty);
    }
  }, [key]);
  function update(transform: (current: Shortcuts) => Shortcuts) {
    setValue((current) => {
      const next = transform(current);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Shortcuts still work in memory. */
      }
      return next;
    });
  }
  return (
    <FoodShortcutsContext.Provider
      value={{
        ...value,
        remember: (id) =>
          update((current) => ({
            ...current,
            recent: [id, ...current.recent.filter((item) => item !== id)].slice(
              0,
              20,
            ),
          })),
        toggleFavorite: (id) =>
          update((current) => ({
            ...current,
            favorites: current.favorites.includes(id)
              ? current.favorites.filter((item) => item !== id)
              : [...current.favorites, id],
          })),
      }}
    >
      {children}
    </FoodShortcutsContext.Provider>
  );
}

export const useFoodShortcuts = () => useContext(FoodShortcutsContext);
