// Shared theme module: applied first inside <body> on every page to avoid a
// flash of the wrong theme, and reused by settings.html for its theme picker.
const graduratTheme = (() => {
  const STORAGE_KEY = "graduratTheme";

  const getStoredTheme = () => localStorage.getItem(STORAGE_KEY) || "system";

  const applyTheme = (theme) => {
    const effectiveTheme = theme || "system";
    if (effectiveTheme === "light") {
      document.body.classList.add("light-theme");
    } else if (effectiveTheme === "dark") {
      document.body.classList.remove("light-theme");
    } else {
      const prefersLight = window.matchMedia(
        "(prefers-color-scheme: light)",
      ).matches;
      document.body.classList.toggle("light-theme", prefersLight);
    }
    const input = document.querySelector(
      `input[name="theme"][value="${effectiveTheme}"]`,
    );
    if (input) input.checked = true;
  };

  const setTheme = (theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  };

  applyTheme(getStoredTheme());
  window
    .matchMedia("(prefers-color-scheme: light)")
    .addEventListener("change", () => {
      if (getStoredTheme() === "system") applyTheme("system");
    });

  return { getStoredTheme, applyTheme, setTheme };
})();
