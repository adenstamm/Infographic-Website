// This file contains the JavaScript code for the landing page of the infographic website. 
// It handles the country search functionality, displays suggested countries based on happiness ranking, 
// and manages the visibility of the "Add Country" form.
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

  // These variables are used to toggle the visibility of the "Add Country" form when the button is clicked. The button with ID "toggleAddForm" will show or hide the form with ID "addCountryForm" when clicked.
  const toggleThemeButton = document.getElementById("toggleAddForm");
  const toggleAddForm = document.getElementById("addCountryForm");

  // Check if both the toggle button and the form exist before adding the event listener
  if (toggleThemeButton && toggleAddForm) {
    // Add a click event listener to the toggle button to show or hide the "Add Country" form
    toggleThemeButton.addEventListener("click", () => {
      toggleAddForm.classList.toggle("hidden");
    });
  }

  // Now we want to submit the "Add Country" form when the user fills it out and clicks the submit button. We will send a POST request to the server with the country details.
  const submit = document.getElementById("submitAddCountry");
  const countryNameInput = document.getElementById("newCountryName");

  if (submit && countryNameInput) {
    submit.addEventListener("click", async () => {
      const countryName = countryNameInput.value.trim();

      if (!countryName) {
        alert("Please enter a country name.");
        return;
      }

      try {
        const response = await fetch("/api/countries", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: countryName }),
        });

        if (response.ok) {
          const newCountry = await response.json();
          //alert(`Country "${newCountry.name}" added successfully!`);
          countryNameInput.value = "";
          toggleAddForm.classList.add("hidden");
          window.CountrySearch.goToCountry(newCountry.name);
        } 
        else {
          const errorData = await response.json();
          alert(`Error adding country: ${errorData.error}`);
        }
      } 
      catch (error) {
        console.error("Error adding country:", error);
        alert("An error occurred while adding the country. Please try again.");
      }
    });
  }
});
