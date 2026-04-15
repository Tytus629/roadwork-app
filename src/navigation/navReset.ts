// src/navigation/navReset.ts
// Helper for navigating from nested navigators (like tabs) to root stack screens

export function replaceToRoot(navigation: any, routeName: string) {
  // Try parent navigator first (tabs -> root stack), fallback to current
  const nav = navigation?.getParent?.() ?? navigation;
  try {
    nav.replace(routeName);
  } catch {
    navigation.replace(routeName);
  }
}
