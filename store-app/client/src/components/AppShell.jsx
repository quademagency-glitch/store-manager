import { ProductTourProvider } from './ProductTour';
import MainLayout from './MainLayout';

/**
 * The signed-in chrome: the sidebar, the nav, and the product tour that points
 * at them.
 *
 * This exists to give those two a single lazy boundary. App.jsx used to import
 * both eagerly to build the authenticated route's element, which put the whole
 * app shell, MainLayout, its icon set and the tour, into the entry chunk.
 * Everyone paid to download and parse it, including the people on /signup and
 * /login who by definition are not signed in and will never render it.
 *
 * Composed here rather than lazily importing each one separately because
 * ProductTourProvider is a named export and MainLayout is its only consumer:
 * one default-exported wrapper is less machinery than two lazy() calls with
 * .then(m => ({ default: m.X })) adapters.
 */
export default function AppShell() {
  return (
    <ProductTourProvider>
      <MainLayout />
    </ProductTourProvider>
  );
}
