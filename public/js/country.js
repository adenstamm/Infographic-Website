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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== "") node.textContent = text;
  return node;
}

function sectionCard(title) {
  const section = el("section", "rounded-3xl bg-zinc-900/60 p-7 ring-1 ring-white/10");
  const h = el("h2", "text-sm font-semibold uppercase tracking-wider text-zinc-300", title);
  const body = el("div", "mt-4");
  section.appendChild(h);
  section.appendChild(body);
  return { section, body };
}

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

    if (!match || !match.country) {
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

function renderCountry(record) {
  const c = record.country;
  const d = record.detailedCountryInfo;
  const aq = record.airQuality;
  const quakes = record.earthquakes || [];
  const pop = record.population;
  const wx = record.weather;
  const happy = record.happiness || [];

  const nameEl = document.getElementById("countryName");
  const regionEl = document.getElementById("countryRegion");
  const metaEl = document.getElementById("countryMeta");
  const flagImg = document.getElementById("countryFlagImg");
  const statsGridEl = document.getElementById("statsGrid");
  const entitySections = document.getElementById("entitySections");

  if (!nameEl || !statsGridEl || !entitySections) return;

  nameEl.textContent = c.name;
  regionEl.textContent = [c.region, c.subregion].filter(Boolean).join(" · ");

  const metaBits = [];
  metaBits.push(`ID ${c.id}`);
  if (c.continents) metaBits.push(c.continents);
  if (c.capital) metaBits.push(`Capital: ${c.capital}`);
  metaEl.textContent = metaBits.join(" · ");

  if (flagImg && d?.flags) {
    flagImg.src = d.flags;
    flagImg.alt = `Flag of ${c.name}`;
    flagImg.classList.remove("hidden");
  } else if (flagImg) {
    flagImg.removeAttribute("src");
    flagImg.classList.add("hidden");
  }

  const stats = [
    { label: "Population", value: typeof c.populationNumber === "number" ? c.populationNumber.toLocaleString() : "—" },
    { label: "Country center (lat, lng)", value: `${c.latitude}, ${c.longitude}` },
    { label: "Capital coords (lat, lng)", value: d ? `${d.capitalLatitude}, ${d.capitalLongitude}` : "—" },
    { label: "Languages", value: c.languages || "—" },
    { label: "Borders", value: c.borders || "—" },
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

  if (d) {
    const { section, body } = sectionCard("Detailed country info");
    const p1 = el("p", "text-sm leading-6 text-zinc-300");
    p1.appendChild(document.createTextNode("Timezones: "));
    p1.appendChild(el("span", "text-zinc-200", d.timezones));
    const p2 = el("p", "mt-2 text-sm leading-6 text-zinc-300");
    p2.appendChild(document.createTextNode("Demonyms: "));
    p2.appendChild(el("span", "text-zinc-200", d.demonyms));
    const p3 = el("p", "mt-3 text-sm");
    const link = el("a", "font-medium text-emerald-400 underline decoration-emerald-400/40 hover:text-emerald-300", "Open map (OpenStreetMap)");
    link.href = d.maps;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    p3.appendChild(link);
    body.appendChild(p1);
    body.appendChild(p2);
    body.appendChild(p3);
    entitySections.appendChild(section);
  }

  if (aq) {
    const { section, body } = sectionCard("Air quality");
    body.appendChild(
      el(
        "p",
        "mb-4 text-sm text-zinc-300",
        `Overall AQI: ${aq.overallAQI} (aqiID ${aq.aqiID}, countryID ${aq.countryID}) — mock composite for prototype.`
      )
    );
    const pm = aq.pollutantMeasurements || [];
    if (pm.length) {
      body.appendChild(
        buildTable(
          ["measurementID", "aqiID", "aqiValue", "pollutantType", "concentration"],
          pm.map((m) => [m.measurementID, m.aqiID, m.aqiValue, m.pollutantType, m.concentration])
        )
      );
    } else {
      body.appendChild(el("p", "text-sm text-zinc-500", "No pollutant measurements."));
    }
    entitySections.appendChild(section);
  }

  {
    const { section, body } = sectionCard("Earthquakes (sample events)");
    if (quakes.length) {
      body.appendChild(
        buildTable(
          ["earthquakeID", "latitude", "longitude", "startTime", "endTime"],
          quakes.map((q) => [q.earthquakeID, q.latitude, q.longitude, q.startTime, q.endTime])
        )
      );
    } else {
      body.appendChild(el("p", "text-sm text-zinc-500", "No earthquake rows for this country in mock data."));
    }
    entitySections.appendChild(section);
  }

  if (pop) {
    const { section, body } = sectionCard("Population (1:1)");
    body.appendChild(el("h3", "text-xs font-semibold uppercase tracking-wide text-zinc-400", "Forecast"));
    body.appendChild(el("p", "mt-2 text-sm leading-6 text-zinc-300", pop.populationForecast));
    body.appendChild(el("h3", "mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400", "Historical"));
    body.appendChild(el("p", "mt-2 text-sm leading-6 text-zinc-300", pop.historicalPopulation));
    entitySections.appendChild(section);
  }

  if (wx) {
    const { section, body } = sectionCard("Weather (1:1)");
    const ul = el("ul", "list-inside list-disc space-y-2 text-sm text-zinc-300");
    ul.appendChild(el("li", "", `Annual rainfall (mock mm): ${wx.rainfall}`));
    ul.appendChild(el("li", "", `Average temperature (mock °C): ${wx.avgTemp}`));
    ul.appendChild(
      el(
        "li",
        "",
        `Historical climate index (mock): ${wx.historicalClimate} — in the schema this is INT; here it represents years of baseline climate record for the prototype.`
      )
    );
    body.appendChild(ul);
    entitySections.appendChild(section);
  }

  if (happy.length) {
    const sorted = [...happy].sort((a, b) => b.year - a.year);
    const { section, body } = sectionCard("Happiness (past years — mock scores)");
    body.appendChild(
      buildTable(
        ["year", "happinessScore", "countryCode", "countryName"],
        sorted.map((h) => [h.year, h.happinessScore, h.countryCode, h.countryName])
      )
    );
    entitySections.appendChild(section);
  }
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
