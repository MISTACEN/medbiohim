const APP_ORIGIN = "https://medbiohim.vercel.app";

document.querySelectorAll("[data-path]").forEach((control) => {
  control.addEventListener("click", () => {
    const path = control.getAttribute("data-path") || "/";
    if (!path.startsWith("/") || path.startsWith("//")) return;
    chrome.tabs.create({ url: new URL(path, APP_ORIGIN).toString() });
  });
});
