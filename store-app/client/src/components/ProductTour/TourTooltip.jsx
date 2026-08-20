import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTour } from './ProductTourProvider';

/** Gap between the highlighted element and the tooltip, in px. */
const OFFSET = 14;
/** Keep the tooltip this far from the viewport edge. */
const MARGIN = 12;
const TOOLTIP_WIDTH = 320;

/**
 * How long to keep looking for a step's target before giving up on it.
 *
 * Not paranoia padding: most targets sit inside a collapsed sidebar section,
 * and MainLayout only opens that section in response to the step becoming
 * active. So on nearly every step the element genuinely does not exist for
 * the first frame or two, and a single failed query would skip the whole
 * tour in one go.
 */
const TARGET_TIMEOUT_MS = 700;

function measure(target) {
  const rect = target.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer the side with more room. The sidebar lives on the left, so in
  // practice this almost always resolves to `right`; the flip matters for
  // narrow windows and for any future target on the right-hand side.
  const placement = rect.right + OFFSET + TOOLTIP_WIDTH + MARGIN <= vw ? 'right' : 'left';

  const left = placement === 'right'
    ? rect.right + OFFSET
    : Math.max(MARGIN, rect.left - OFFSET - TOOLTIP_WIDTH);

  // Vertically centred on the target, then clamped inside the viewport. The
  // clamp is why the caret is positioned separately below, once the card is
  // pushed away from centre, an arrow fixed to its middle points at nothing.
  const rawTop = rect.top + rect.height / 2;

  return {
    placement,
    left,
    anchorY: rawTop,
    highlight: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    viewportHeight: vh,
  };
}

export default function TourTooltip() {
  const { step, stepIndex, stepCount, isFirstStep, isLastStep, next, prev, endTour, skipStep } = useTour();

  const cardRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const [cardHeight, setCardHeight] = useState(0);

  const stepId = step?.id;

  // Find the target for this step, retrying while the sidebar section that
  // owns it opens. Gives up, and skips the step, after TARGET_TIMEOUT_MS.
  useEffect(() => {
    if (!stepId) return undefined;

    let frame = null;
    let cancelled = false;
    const deadline = Date.now() + TARGET_TIMEOUT_MS;
    setLayout(null);

    const look = () => {
      if (cancelled) return;

      const target = document.querySelector(`[data-tour-step="${stepId}"]`);
      // offsetParent is null for anything `display: none`, which is how the
      // sidebar hides collapsed sections and the off-canvas mobile rail.
      if (target && target.offsetParent !== null) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        setLayout(measure(target));
        return;
      }

      if (Date.now() > deadline) {
        skipStep();
        return;
      }
      frame = requestAnimationFrame(look);
    };

    look();

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [stepId, skipStep]);

  // Keep the highlight glued to the target while the page moves under it.
  useEffect(() => {
    if (!stepId || !layout) return undefined;

    const reposition = () => {
      const target = document.querySelector(`[data-tour-step="${stepId}"]`);
      if (target && target.offsetParent !== null) setLayout(measure(target));
    };

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [stepId, layout]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [stepId, layout]);

  // Move focus into the card so the tour is keyboard-operable from the moment
  // it opens, rather than leaving focus wherever the page happened to have it.
  useEffect(() => {
    if (layout && cardRef.current) cardRef.current.focus({ preventScroll: true });
  }, [layout, stepId]);

  if (!step || !layout) return null;

  const top = Math.min(
    Math.max(MARGIN, layout.anchorY - cardHeight / 2),
    Math.max(MARGIN, layout.viewportHeight - cardHeight - MARGIN),
  );
  // The caret tracks the target, not the card, so it still points at the
  // right thing after the card has been clamped away from centre.
  const caretTop = Math.min(Math.max(16, layout.anchorY - top), Math.max(16, cardHeight - 16));

  return createPortal(
    <div className="tour-layer" role="presentation">
      {/* One element does both jobs: the ring around the target, and, via a
          viewport-swallowing spread, the dimmed backdrop over everything
          else. Two stacked elements would need their geometry kept in sync. */}
      <div
        className="tour-spotlight"
        style={{
          top: `${layout.highlight.top}px`,
          left: `${layout.highlight.left}px`,
          width: `${layout.highlight.width}px`,
          height: `${layout.highlight.height}px`,
        }}
      />

      <div
        ref={cardRef}
        className={`tour-card tour-card--${layout.placement}`}
        style={{ top: `${top}px`, left: `${layout.left}px`, width: `${TOOLTIP_WIDTH}px` }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-card-title"
        aria-describedby="tour-card-body"
        tabIndex={-1}
      >
        <span className="tour-caret" style={{ top: `${caretTop}px` }} aria-hidden="true" />

        <div className="tour-card-head">
          <span className="tour-counter">{stepIndex + 1} of {stepCount}</span>
          <button type="button" className="tour-skip" onClick={endTour}>Skip tour</button>
        </div>

        <h3 className="tour-card-title" id="tour-card-title">{step.title}</h3>
        <p className="tour-card-body" id="tour-card-body">{step.body}</p>

        <div className="tour-progress" aria-hidden="true">
          {Array.from({ length: stepCount }, (_, i) => (
            <span key={i} className={`tour-pip ${i === stepIndex ? 'is-current' : ''} ${i < stepIndex ? 'is-done' : ''}`} />
          ))}
        </div>

        <div className="tour-card-actions">
          <button
            type="button"
            className="tour-btn tour-btn--ghost"
            onClick={prev}
            disabled={isFirstStep}
          >
            Previous
          </button>
          <button type="button" className="tour-btn tour-btn--primary" onClick={next}>
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
