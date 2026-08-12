/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { TOUR_STEPS, TOUR_COMPLETED_KEY } from './tourSteps';
import TourTooltip from './TourTooltip';

const TourContext = createContext(null);

function readCompleted() {
  try {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  } catch {
    // Private mode / storage disabled. Treat as "not yet seen" but never
    // throw — the tour is a nicety and must not take the app down with it.
    return false;
  }
}

function writeCompleted() {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
  } catch {
    // As above: if we can't remember, the worst case is offering it again.
  }
}

/**
 * The tour auto-starts only where there is a sidebar to point at. Below the
 * layout breakpoint the rail is off-canvas, and ambushing someone on a phone
 * with a tour of a menu they cannot see is worse than not running it. The
 * "Take a tour" button still works there — MainLayout opens the mobile menu
 * for the duration.
 */
const AUTOSTART_MIN_WIDTH = 1024;

export function ProductTourProvider({ children }) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(readCompleted);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const finish = useCallback(() => {
    setIsActive(false);
    setStepIndex(0);
    setHasCompleted(true);
    writeCompleted();
  }, []);

  /**
   * Advance, or finish if there is nowhere left to go.
   *
   * Written against `stepIndex` from the closure rather than a `setStepIndex`
   * updater, because finishing has side effects (localStorage) and React may
   * invoke an updater more than once. Every caller is an event handler or an
   * effect, so the closed-over index is current.
   */
  const advance = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      finish();
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex, finish]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  /**
   * Called by the tooltip when a step's target cannot be found — either the
   * nav item is behind a permission this user lacks, or it simply is not
   * rendered. Moves on rather than stalling the tour on an invisible anchor.
   *
   * Running out of steps this way still counts as finishing: the alternative
   * is auto-starting again on the next load and dead-ending in the same
   * place, forever, for anyone whose role hides the last few items.
   */
  const skipStep = advance;
  const next = advance;

  // Auto-start for anyone who has not seen it. The delay lets the shell mount
  // and the first route settle, so the tooltip measures a stable layout rather
  // than one mid-reflow.
  useEffect(() => {
    if (hasCompleted || isActive) return undefined;
    if (typeof window !== 'undefined' && window.innerWidth < AUTOSTART_MIN_WIDTH) return undefined;

    const timer = setTimeout(() => setIsActive(true), 900);
    return () => clearTimeout(timer);
  }, [hasCompleted, isActive]);

  // Escape ends the tour, the same as "Skip tour".
  useEffect(() => {
    if (!isActive) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, finish, next, prev]);

  const step = isActive ? TOUR_STEPS[stepIndex] : null;

  const value = useMemo(
    () => ({
      isActive,
      hasCompleted,
      step,
      stepIndex,
      stepCount: TOUR_STEPS.length,
      isFirstStep: stepIndex === 0,
      isLastStep: stepIndex === TOUR_STEPS.length - 1,
      startTour,
      next,
      prev,
      skipStep,
      endTour: finish,
    }),
    [isActive, hasCompleted, step, stepIndex, startTour, next, prev, skipStep, finish],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {isActive && <TourTooltip />}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a ProductTourProvider');
  }
  return context;
}
