(function () {
  if (window.__glIaWidget) return;
  window.__glIaWidget = true;
  var s = document.currentScript;
  var base = (s && s.getAttribute("data-base")) || "https://gpslinkusa.com";
  var hash = s && s.getAttribute("data-hash");

  function mount(color, name) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.title = name || "Asistente IA";
    btn.setAttribute("aria-label", name || "Asistente IA");
    btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></svg>';
    btn.style.cssText = "position:fixed;right:20px;bottom:90px;width:58px;height:58px;border-radius:50%;border:0;background:" + color + ";box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;z-index:99998;display:flex;align-items:center;justify-content:center;padding:0";
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;right:20px;bottom:160px;width:min(380px,calc(100vw - 40px));height:min(600px,calc(100vh - 190px));border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.3);z-index:99999;display:none;background:#fff";
    var frame;
    btn.onclick = function () {
      if (!frame) {
        frame = document.createElement("iframe");
        frame.src = base + "/asistente?embed=1";
        frame.style.cssText = "width:100%;height:100%;border:0";
        frame.allow = "clipboard-write";
        box.appendChild(frame);
      }
      box.style.display = box.style.display === "none" ? "block" : "none";
    };
    document.body.appendChild(box);
    document.body.appendChild(btn);
  }

  function start() {
    if (!hash) return mount((s && s.getAttribute("data-color")) || "#0F4C5C");
    fetch(base + "/api/ia/web/session", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_api_hash: hash }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.enabled) mount(d.color || "#0F4C5C", d.name); })
      .catch(function () {});
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
