import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { AbacusState, AbacusStore } from "./store.js";

const StoreContext = createContext<AbacusStore | null>(null);

export function AbacusStoreProvider({
  store,
  children,
}: {
  store: AbacusStore;
  children: ReactNode;
}) {
  return <StoreContext value={store}>{children}</StoreContext>;
}

/** Read a slice of the window's state; re-renders only when that slice changes. */
export function useAbacus<T>(selector: (state: AbacusState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useAbacus must be used inside AbacusStoreProvider");
  return useStore(store, selector);
}
