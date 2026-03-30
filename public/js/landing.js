function slugifyCountryQuery(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function goToCountry(query) {
  const slug = slugifyCountryQuery(query);
  if (!slug) return;
  window.location.href = `/country/${encodeURIComponent(slug)}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("countrySearchForm");
  const input = document.getElementById("countryQuery");

  if (input) input.focus();

  if (form && input) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      goToCountry(input.value);
    });
  }

  document.querySelectorAll(".suggestion-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute("data-suggest");
      goToCountry(value);
    });
  });
});

