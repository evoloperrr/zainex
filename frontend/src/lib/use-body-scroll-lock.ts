"use client";

import { useEffect } from "react";

/**
 * Locks background scroll while a modal is open.
 *
 * Plain `overflow: hidden` on <body> does not actually stop touch
 * scrolling behind a fixed overlay on iOS Safari, which is what caused
 * the "double scroll" feel (the modal's own content scrolling while the
 * page underneath also scrolled). Pinning body to `position: fixed` at
 * the current scroll offset blocks that background scroll completely,
 * then the scroll position is restored on close.
 *
 * globals.css also has an unconditional `overflow-y: auto !important`
 * on html/body, which would otherwise silently win over a plain
 * `element.style.overflow = "hidden"` assignment (a stylesheet
 * `!important` always beats a non-important inline style, even though
 * inline styles normally take priority). Every property below is set
 * with `setProperty(..., "important")` so the lock actually holds.
 */
function lockProperty(
  element: HTMLElement,
  property: string,
  value: string,
): string {
  const previous =
    element.style.getPropertyValue(property);

  element.style.setProperty(
    property,
    value,
    "important",
  );

  return previous;
}

function restoreProperty(
  element: HTMLElement,
  property: string,
  previousValue: string,
): void {
  if (previousValue) {
    element.style.setProperty(
      property,
      previousValue,
    );
  }
  else {
    element.style.removeProperty(property);
  }
}

export function useBodyScrollLock(
  active: boolean,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    const scrollY = window.scrollY;

    const body = document.body;
    const html = document.documentElement;

    const previous = {
      position: lockProperty(
        body,
        "position",
        "fixed",
      ),
      top: lockProperty(
        body,
        "top",
        `-${scrollY}px`,
      ),
      left: lockProperty(body, "left", "0"),
      right: lockProperty(body, "right", "0"),
      width: lockProperty(
        body,
        "width",
        "100%",
      ),
      overflow: lockProperty(
        body,
        "overflow",
        "hidden",
      ),
      htmlOverflow: lockProperty(
        html,
        "overflow",
        "hidden",
      ),
    };

    return () => {
      restoreProperty(
        body,
        "position",
        previous.position,
      );

      restoreProperty(
        body,
        "top",
        previous.top,
      );

      restoreProperty(
        body,
        "left",
        previous.left,
      );

      restoreProperty(
        body,
        "right",
        previous.right,
      );

      restoreProperty(
        body,
        "width",
        previous.width,
      );

      restoreProperty(
        body,
        "overflow",
        previous.overflow,
      );

      restoreProperty(
        html,
        "overflow",
        previous.htmlOverflow,
      );

      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
