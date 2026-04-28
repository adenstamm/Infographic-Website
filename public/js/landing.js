document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("countrySearchForm");
  const input = document.getElementById("countryQuery");
  const suggestionRoot = document.getElementById("suggestionChips");

  if (input) input.focus();

  if (form && input) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      window.CountrySearch.goToCountry(input.value);
    });
  }

  if (window.CountrySearch) {
    window.CountrySearch.ensureCountryDatalist("countryOptions").catch(() => {});
  }

  if (suggestionRoot && window.CountrySearch) {
    window.CountrySearch
      .fetchCountryList({ sort: "happiness", limit: 5 })
      .then((countries) => {
        suggestionRoot.innerHTML = "";

        countries.forEach((country) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className =
            "suggestion-chip rounded-full bg-zinc-900 px-4 py-2 text-sm text-zinc-200 ring-1 ring-white/10 transition hover:bg-zinc-800";
          button.textContent = country.name;
          button.addEventListener("click", () => {
            window.CountrySearch.goToCountry(country.name);
          });
          suggestionRoot.appendChild(button);
        });
      })
      .catch(() => {
        suggestionRoot.innerHTML = "";
      });
  }
});
