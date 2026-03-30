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

function getSlugFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

async function loadCountry() {
  const statusEl = document.getElementById("countryStatus");
  const reportEl = document.getElementById("countryReport");

  if (!statusEl || !reportEl) return;

  const slug = getSlugFromPath();
  if (!slug) {
    statusEl.textContent = "No country specified.";
    return;
  }

  try {
    statusEl.textContent = "Loading country…";

    const res = await fetch("/data/countries.json");
    if (!res.ok) throw new Error("Failed to load data");

    const countries = await res.json();

    const match = countries.find((c) => c.slug === slug);

    if (!match) {
      statusEl.innerHTML =
        'Country not found. Try searching again from the bar above or go back to the <a href="/" class="text-zinc-200 underline">landing page</a>.';
      reportEl.classList.add("hidden");
      return;
    }

    renderCountry(match);
    statusEl.textContent = "";
    reportEl.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Something went wrong while loading the country.";
  }
}

function renderCountry(country) {
  const nameEl = document.getElementById("countryName");
  const regionEl = document.getElementById("countryRegion");
  const metaEl = document.getElementById("countryMeta");
  const flagEl = document.getElementById("countryFlag");
  const overviewEl = document.getElementById("countryOverview");
  const funFactsEl = document.getElementById("countryFunFacts");
  const statsGridEl = document.getElementById("statsGrid");

  if (!nameEl) return;

  nameEl.textContent = country.name;
  regionEl.textContent = country.region || "";

  const metaBits = [];
  if (country.capital) metaBits.push(`Capital: ${country.capital}`);
  if (typeof country.populationMillions === "number") {
    metaBits.push(`Population: ~${country.populationMillions.toLocaleString()}M`);
  }
  if (country.languages?.length) {
    metaBits.push(`Languages: ${country.languages.join(", ")}`);
  }
  metaEl.textContent = metaBits.join(" • ");

  flagEl.textContent = country.flagEmoji || "";

  overviewEl.textContent = country.shortOverview || "";

  funFactsEl.innerHTML = "";
  (country.funFacts || []).forEach((fact) => {
    const li = document.createElement("li");
    li.textContent = fact;
    funFactsEl.appendChild(li);
  });

  const stats = [
    {
      label: "Population",
      value:
        typeof country.populationMillions === "number"
          ? `${country.populationMillions.toLocaleString()} million`
          : "—",
    },
    {
      label: "Area",
      value:
        typeof country.areaKm2 === "number"
          ? `${country.areaKm2.toLocaleString()} km²`
          : "—",
    },
    {
      label: "GDP (approx.)",
      value:
        typeof country.gdpUsdBillions === "number"
          ? `$${country.gdpUsdBillions.toLocaleString()}B`
          : "—",
    },
    {
      label: "Currency",
      value: country.currency || "—",
    },
    {
      label: "Region",
      value: country.region || "—",
    },
    {
      label: "Languages",
      value: country.languages?.join(", ") || "—",
    },
  ];

  statsGridEl.innerHTML = "";
  stats.forEach((s) => {
    const card = document.createElement("article");
    card.className =
      "rounded-2xl bg-zinc-900/70 p-4 ring-1 ring-white/10 flex flex-col gap-1";

    const label = document.createElement("div");
    label.className = "text-xs font-medium uppercase tracking-wide text-zinc-400";
    label.textContent = s.label;

    const value = document.createElement("div");
    value.className = "text-sm font-semibold text-zinc-50";
    value.textContent = s.value;

    card.appendChild(label);
    card.appendChild(value);
    statsGridEl.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const topForm = document.getElementById("topSearchForm");
  const topInput = document.getElementById("topCountryQuery");

  if (topForm && topInput) {
    topForm.addEventListener("submit", (e) => {
      e.preventDefault();
      goToCountry(topInput.value);
    });
  }

  if (topInput) {
    const slug = getSlugFromPath();
    if (slug) {
      const humanGuess = slug.replace(/-/g, " ");
      topInput.value = humanGuess;
    }
  }

  loadCountry();
});

