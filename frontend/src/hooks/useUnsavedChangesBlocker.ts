import { useCallback, useContext, useEffect } from "react";
import { UNSAFE_NavigationContext as NavigationContext } from "react-router-dom";

/** Warn on browser refresh/close and block in-app React Router navigation. */
export function useUnsavedChangesBlocker(
  when: boolean,
  message = "You have unsaved changes. Leave without saving?"
) {
  const { navigator } = useContext(NavigationContext);

  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);

  const confirmLeave = useCallback(() => window.confirm(message), [message]);

  useEffect(() => {
    if (!when) return;

    const nav = navigator as typeof navigator & {
      push: (...args: Parameters<typeof navigator.push>) => void;
      replace: (...args: Parameters<typeof navigator.replace>) => void;
    };

    const push = nav.push.bind(nav);
    const replace = nav.replace.bind(nav);

    nav.push = (...args: Parameters<typeof navigator.push>) => {
      if (confirmLeave()) push(...args);
    };
    nav.replace = (...args: Parameters<typeof navigator.replace>) => {
      if (confirmLeave()) replace(...args);
    };

    return () => {
      nav.push = push;
      nav.replace = replace;
    };
  }, [when, navigator, confirmLeave]);
}
