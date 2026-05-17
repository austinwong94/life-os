(() => {
  if (window.location.protocol !== "file:") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("devServer") || params.has("noDevRedirect")) return;
  const localUrl = "http://127.0.0.1:5173/index.html";
  fetch(localUrl, { method: "HEAD", mode: "no-cors", cache: "no-store" })
    .then(() => {
      window.location.replace(localUrl);
    })
    .catch(() => {
      // Keep the file version usable when the local server is not running.
    });
})();
