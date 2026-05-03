// This file contains the JavaScript code for the country search functionality on the infographic website.
// It includes functions to slugify country names, navigate to country pages, 
// fetch country lists from the API, and populate datalists for search suggestions.
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

  // Helper Function to navigate to the country page based on the user's search query. 
  // It takes the user's input, slugifies it, and then redirects the browser to the corresponding country page URL.
  function goToCountry(query) {
    const slug = slugifyCountryQuery(query);
    if (!slug) return;
    window.location.href = `/country/${encodeURIComponent(slug)}`;
  }

  // Function to fetch a list of countries from the server based on optional search parameters. 
  // It constructs the API endpoint URL with query parameters for searching, sorting, and limiting the results. 
  // The function then makes a fetch request to the server and returns the list of countries in JSON format.
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

  // Function to ensure that the datalist element for country search suggestions is populated with the list of countries. 
  // It fetches the list of countries from the server and creates option elements for each country, 
  // which are then appended to the datalist. 
  // This allows the browser to show autocomplete suggestions when the user types in the search input.
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
