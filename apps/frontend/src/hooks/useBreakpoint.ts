import { useState, useEffect } from 'react';

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

type Breakpoint = keyof typeof breakpoints;

export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= breakpoints[breakpoint];
  });

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${breakpoints[breakpoint]}px)`);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return matches;
}
