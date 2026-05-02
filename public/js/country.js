// This function extracts the country slug from the URL path. 
// For example, if the URL is "/countries/france", it will return "france". 
// If the URL does not match this pattern, it returns an empty string.
function getSlugFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

// Helper function to create an element with optional class and text content
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== "") node.textContent = text;
  return node;
}

// This function creates a styled section card with a title and a body.
function sectionCard(title) {
  const section = el("section", "rounded-3xl bg-zinc-900/60 p-7 ring-1 ring-white/10");
  const h = el("h2", "text-sm font-semibold uppercase tracking-wider text-zinc-300", title);
  const body = el("div", "mt-4");

  section.appendChild(h);
  section.appendChild(body);
  return { section, body };
}

// This function builds a table element given an array of headers and an array of rows.
function buildTable(headers, rows) {
  const wrap = el("div", "overflow-x-auto rounded-xl ring-1 ring-white/10");
  const table = el("table", "w-full min-w-[28rem] text-left text-sm text-zinc-300");
  const thead = el("thead", "border-b border-white/10 bg-zinc-900/80");
  const trh = el("tr");

  headers.forEach((h) => {
    const th = el("th", "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400", h);
    trh.appendChild(th);
  });

  thead.appendChild(trh);

  const tbody = el("tbody", "divide-y divide-white/10");

  rows.forEach((cells) => {
    const tr = el("tr", "hover:bg-white/[0.03]");
    cells.forEach((c) => {
      const td = el("td", "px-3 py-2 align-top");
      td.textContent = c == null ? "—" : String(c);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// This function formats a number with commas and optional decimal places. 
// If the input is not a valid number, it returns an em dash.
function formatNumber(value, options) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, options);
}

// This function formats latitude and longitude coordinates to three decimal places. 
// If the inputs are not valid numbers, it returns an em dash.
function formatCoordinates(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "—";
  return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}

// This function formats a date-time string into a more readable format.
// If the input is not a valid date, it returns the original value as a string.
function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

// Needed function to load the country details when the page is accessed. 
// It fetches the country data from the server and renders it on the page. 
// It also handles the case where the country is not found or when there is an error during loading.
async function loadCountry() {
  const statusEl = document.getElementById("countryStatus");
  const reportEl = document.getElementById("countryReport");
  const topInput = document.getElementById("topCountryQuery");

  if (!statusEl || !reportEl) return;

  const slug = getSlugFromPath();
  if (!slug) {
    statusEl.textContent = "No country specified.";
    return;
  }

  try {
    statusEl.textContent = "Loading country...";

    const res = await fetch(`/api/countries/${encodeURIComponent(slug)}`);
    if (res.status === 404) {
      statusEl.innerHTML =
        'Country not found. Try searching again from the bar above or go back to the <a href="/" class="text-zinc-200 underline">landing page</a>.';
      reportEl.classList.add("hidden");
      return;
    }

    if (!res.ok) throw new Error("Failed to load data");

    const match = await res.json();
    renderCountry(match);

    if (topInput) {
      topInput.value = match.country?.name || match.happiness?.countryName || "";
    }

    if (match.metadataAvailable) {
      statusEl.textContent = "";
    } else {
      statusEl.textContent = "Showing available data. Some live country details could not be fetched.";
    }

    reportEl.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Something went wrong while loading the country.";
  }
}

// Necessary function to render the country details on the page. 
// It takes the country data as input and updates the DOM elements accordingly. 
// It also handles the display of various sections such as detailed info, happiness report, population, weather, air quality, earthquakes, and cache info. 
// If the country is a custom country loaded from the database, it shows options to edit or delete the country.
function renderCountry(record) {
  const c = record.country;
  const d = record.detailedCountryInfo;
  const happy = Array.isArray(record.happiness) ? record.happiness : [];
  const latestHappy = happy[0] || null;
  const cacheInfo = record.cache;

  const nameEl = document.getElementById("countryName");
  const regionEl = document.getElementById("countryRegion");
  const metaEl = document.getElementById("countryMeta");
  const flagImg = document.getElementById("countryFlagImg");
  const statsGridEl = document.getElementById("statsGrid");
  const entitySections = document.getElementById("entitySections");

  if (!nameEl || !statsGridEl || !entitySections) return;

  const displayName = c?.name || latestHappy?.countryName || "Country";
  document.title = `${displayName} | Country Explorer`;

  nameEl.textContent = displayName;
  regionEl.textContent =
    [c?.region, c?.subregion].filter(Boolean).join(" · ") || "World Happiness dataset";

  const metaBits = [];
  if (c?.continents) metaBits.push(c.continents);
  if (c?.capital) metaBits.push(`Capital: ${c.capital}`);
  if (typeof latestHappy?.rank === "number" && typeof latestHappy?.countryCount === "number") {
    metaBits.push(`Happiness rank: #${latestHappy.rank} of ${latestHappy.countryCount}`);
  }
  if (record.source === "database") metaBits.push("Loaded from database");
  if (record.source === "live") metaBits.push("Fresh lookup");
  metaEl.textContent = metaBits.join(" · ");

  if (flagImg && d?.flags) {
    flagImg.src = d.flags;
    flagImg.alt = `Flag of ${displayName}`;
    flagImg.classList.remove("hidden");
  } else if (flagImg) {
    flagImg.removeAttribute("src");
    flagImg.classList.add("hidden");
  }

  const stats = [
    {
      label: "Happiness score",
      value:
        typeof latestHappy?.happinessScore === "number"
          ? formatNumber(latestHappy.happinessScore, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            })
          : "—",
    },
    { label: "Report year", value: latestHappy?.year ?? "—" },
    {
      label: "World rank",
      value:
        typeof latestHappy?.rank === "number" && typeof latestHappy?.countryCount === "number"
          ? `#${latestHappy.rank} / ${latestHappy.countryCount}`
          : "—",
    },
    { label: "Population", value: formatNumber(c?.populationNumber) },
    { label: "Country center (lat, lng)", value: formatCoordinates(c?.latitude, c?.longitude) },
    { label: "Capital coords (lat, lng)", value: formatCoordinates(d?.capitalLatitude, d?.capitalLongitude) },
    { label: "Languages", value: c?.languages || "—" },
    { label: "Borders", value: c?.borders || "—" },
    { label: "Currencies", value: d?.currencies || "—" },
  ];

  statsGridEl.innerHTML = "";
  stats.forEach((s) => {
    const card = el("article", "flex flex-col gap-1 rounded-2xl bg-zinc-900/70 p-4 ring-1 ring-white/10");
    card.appendChild(el("div", "text-xs font-medium uppercase tracking-wide text-zinc-400", s.label));
    card.appendChild(el("div", "text-sm font-semibold text-zinc-50", s.value));
    statsGridEl.appendChild(card);
  });

  entitySections.innerHTML = "";

  if (d || c?.officialName) {
    const { section, body } = sectionCard("Detailed country info");
    const details = [
      ["Official name", c?.officialName],
      ["Timezones", d?.timezones],
      ["Demonyms", d?.demonyms],
      ["Capital", c?.capital],
      ["Region", [c?.region, c?.subregion].filter(Boolean).join(", ") || null],
    ];

    details.forEach(([label, value]) => {
      if (!value) return;
      const paragraph = el("p", "text-sm leading-6 text-zinc-300");
      paragraph.appendChild(document.createTextNode(`${label}: `));
      paragraph.appendChild(el("span", "text-zinc-200", value));
      body.appendChild(paragraph);
    });

    if (d?.maps) {
      const mapRow = el("p", "mt-3 text-sm");
      const link = el(
        "a",
        "font-medium text-emerald-400 underline decoration-emerald-400/40 hover:text-emerald-300",
        "Open map (OpenStreetMap)"
      );
      link.href = d.maps;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      mapRow.appendChild(link);
      body.appendChild(mapRow);
    }

    entitySections.appendChild(section);
  }

  if (happy.length) {
    const { section, body } = sectionCard("World Happiness Report");
    const summary = el(
      "p",
      "mb-4 text-sm leading-6 text-zinc-300",
      `${latestHappy.countryName} has a recorded happiness score of ${formatNumber(latestHappy.happinessScore, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })} for ${latestHappy.year}.`
    );
    body.appendChild(summary);
    body.appendChild(
      buildTable(
        ["country", "year", "happiness score", "world rank"],
        happy.map((row) => [
          row.countryName,
          row.year ?? "—",
          typeof row.happinessScore === "number"
            ? formatNumber(row.happinessScore, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })
            : "—",
          typeof row.rank === "number" ? `#${row.rank}` : "—",
        ])
      )
    );
    body.appendChild(
      el("p", "mt-4 text-xs text-zinc-500", "Source: csv/happiness.csv")
    );
    entitySections.appendChild(section);
  }

  if (record.population) {
    const { section, body } = sectionCard("Population");
    if (record.population.populationForecast) {
      body.appendChild(el("h3", "text-xs font-semibold uppercase tracking-wide text-zinc-400", "Forecast"));
      body.appendChild(el("p", "mt-2 text-sm leading-6 text-zinc-300", record.population.populationForecast));
    }
    if (record.population.historicalPopulation) {
      body.appendChild(el("h3", "mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400", "Historical"));
      body.appendChild(el("p", "mt-2 text-sm leading-6 text-zinc-300", record.population.historicalPopulation));
    }
    entitySections.appendChild(section);
  }

  if (record.weather) {
    const { section, body } = sectionCard("Weather");
    body.appendChild(
      buildTable(
        ["rainfall (mm)", "current temp (C)", "humidity", "uv index"],
        [[
          record.weather.rainfallMM ?? "—",
          record.weather.currentTemp ?? "—",
          record.weather.humidity ?? "—",
          record.weather.uvIndex ?? "—",
        ]]
      )
    );
    entitySections.appendChild(section);
  }

  if (record.airQuality) {
    const { section, body } = sectionCard("Air Quality");
    body.appendChild(
      el(
        "p",
        "mb-4 text-sm text-zinc-300",
        `Overall AQI: ${record.airQuality.overallAQI ?? "—"}`
      )
    );

    if (record.airQuality.pollutantMeasurements?.length) {
      body.appendChild(
        buildTable(
          ["pollutant", "aqi", "concentration"],
          record.airQuality.pollutantMeasurements.map((row) => [
            row.pollutantType,
            row.aqiValue ?? "—",
            row.concentration ?? "—",
          ])
        )
      );
    }

    entitySections.appendChild(section);
  }

  if (record.earthquakes?.length) {
    const { section, body } = sectionCard("Earthquakes");
    body.appendChild(
      buildTable(
        ["magnitude", "place", "start", "updated", "lat", "lng"],
        record.earthquakes.map((row) => [
          row.magnitude ?? "—",
          row.place || "—",
          formatDateTime(row.startTime),
          formatDateTime(row.endTime),
          row.latitude ?? "—",
          row.longitude ?? "—",
        ])
      )
    );
    entitySections.appendChild(section);
  }

  if (cacheInfo) {
    const { section, body } = sectionCard("Search Cache");
    const rows = [
      ["Storage", "PostgreSQL cache"],
      ["Times searched", cacheInfo.searchCount ?? "—"],
      ["First searched", cacheInfo.firstSearchedAt ? new Date(cacheInfo.firstSearchedAt).toLocaleString() : "—"],
      ["Last searched", cacheInfo.lastSearchedAt ? new Date(cacheInfo.lastSearchedAt).toLocaleString() : "—"],
    ];
    body.appendChild(buildTable(["field", "value"], rows));
    entitySections.appendChild(section);
  }

  // We only want to show the editing and deleting options if this is a custom country loaded from the database, since live lookups cannot be modified or deleted by users.
  if (c?.is_custom) {
    const buttonForEditing = el("button", "mt-6 rounded-full bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500", "Edit country");
    const buttonForDeleting = el("button", "mt-3 rounded-full bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500", "Delete country");

    const buttonWrapper = el("div", "flex flex-col items-start");
    buttonWrapper.appendChild(buttonForEditing);
    buttonWrapper.appendChild(buttonForDeleting);
    entitySections.appendChild(buttonWrapper);

    buttonForEditing.addEventListener("click", () => {
      const newName = prompt("Enter a new name for this country:", displayName);

      if (newName && newName.trim() && newName.trim() !== displayName) {
        fetch(`/api/countries/${c.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newName.trim() }),
        })
          .then((res) => {
            if (!res.ok) {
              return res.json().then((data) => {
                throw new Error(data.error || "Failed to update country");
              });
            }
            return res.json();
          })
          .then((updatedCountry) => {
            alert(`Country renamed to "${updatedCountry.name}" successfully!`);
            window.CountrySearch.goToCountry(updatedCountry.name);
          })
          .catch((error) => {
            alert(`Error updating country: ${error.message}`);
          });
      }
    });

    buttonForDeleting.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this country?")) {
        // Implementation for deleting the country
        if(!confirm("This action cannot be undone. Do you really want to proceed?")) {
          return;
        }
        
        fetch(`/api/countries/${c.id}`, {
          method: "DELETE",
        })
          .then((res) => {
            if (!res.ok) {
              return res.json().then((data) => {
                throw new Error(data.error || "Failed to delete country");
              });
            }
            return res.json();
          })
          .then(() => {
            alert(`Country "${displayName}" deleted successfully!`);
            window.location.href = "/"; // Redirect to the landing page after deletion
          })
          .catch((error) => {
            alert(`Error deleting country: ${error.message}`);
          });
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const topForm = document.getElementById("topSearchForm");
  const topInput = document.getElementById("topCountryQuery");

  if (topForm && topInput) {
    topForm.addEventListener("submit", (e) => {
      e.preventDefault();
      window.CountrySearch.goToCountry(topInput.value);
    });
  }

  if (topInput && window.CountrySearch) {
    window.CountrySearch.ensureCountryDatalist("topCountryOptions").catch(() => {});
  }

  if (topInput && !topInput.value) {
    const slug = getSlugFromPath();
    if (slug) {
      const humanGuess = slug.replace(/-/g, " ");
      topInput.value = humanGuess;
    }
  }

  loadCountry();
});
