function showCatalogWarnings(issues) {
  console.warn("Spiel-Diagnose:", issues);
  const { hostname, protocol, search } = window.location;
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (!localHost || !["http:", "https:"].includes(protocol) || !new URLSearchParams(search).has("debug")) return;

  let notice = document.querySelector(".catalog-warnings");
  if (!notice) {
    notice = document.createElement("details");
    notice.className = "catalog-warnings";
    notice.append(document.createElement("summary"), document.createElement("ul"));
    document.body.appendChild(notice);
  }
  const title = notice.querySelector("summary");
  const list = notice.querySelector("ul");
  issues.forEach((issue) => {
    const item = document.createElement("li");
    item.textContent = issue;
    list.appendChild(item);
  });
  title.textContent = `${list.children.length} Hinweise – Details anzeigen`;
}
