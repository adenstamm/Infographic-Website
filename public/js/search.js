(function () {
  function slugifyCountryQuery(input) {
    return String(input || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
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

  async function fetchCountryList(options) {
    const params = new URLSearchParams();
    const config = options || {};

    if (config.q) params.set("q", config.q);
    if (config.limit) params.set("limit", String(config.limit));
    if (config.sort) params.set("sort", config.sort);

    const endpoint = params.toString() ? `/api/countries?${params}` : "/api/countries";
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error("Failed to load countries");
    }

    const payload = await response.json();
    return Array.isArray(payload.countries) ? payload.countries : [];
  }

  async function ensureCountryDatalist(datalistId) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return [];

    const countries = await fetchCountryList({ limit: 250 });
    datalist.innerHTML = "";

    countries.forEach((country) => {
      const option = document.createElement("option");
      option.value = country.name;
      datalist.appendChild(option);
    });

    return countries;
  }

  window.CountrySearch = {
    ensureCountryDatalist,
    fetchCountryList,
    goToCountry,
    slugifyCountryQuery,
  };
})();
