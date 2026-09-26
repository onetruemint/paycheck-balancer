import { useEffect, useState } from 'react';

export type Route = 'home' | 'history' | 'accounts';

const ROUTES: Record<string, Route> = {
  '': 'home',
  '/': 'home',
  '/history': 'history',
  '/accounts': 'accounts',
};

function parse(): Route {
  return ROUTES[location.hash.replace(/^#/, '')] ?? 'home';
}

export function navigate(route: Route) {
  location.hash = route === 'home' ? '/' : `/${route}`;
}

/** Hash routing keeps the app servable from any static host (no SPA fallback needed). */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
