export const initCitySearch = ({
  cityForm,
  cityInput,
  cityResults,
  cityStatus,
  onSelect,
}) => {
  let lastCitySearch = 0;
  let cachedResults = [];
  let cachedQuery = "";
  let searchTimer = null;

  const setCityStatus = (text, isError = false) => {
    cityStatus.textContent = text;
    cityStatus.style.color = isError ? "#ffb4b4" : "var(--muted)";
  };

  const clearCityResults = () => {
    cityResults.innerHTML = "";
  };

  const toLocation = (result) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const labelParts = (result.display_name || "").split(",").slice(0, 4);
    const label = labelParts.join(", ").trim() || "Unnamed location";

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return { label, lat, lon };
  };

  const applyCityResult = (result) => {
    const location = toLocation(result);
    if (!location) {
      return;
    }
    cityInput.value = location.label;
    setCityStatus("Location selected.");
    clearCityResults();
    onSelect(location);
  };

  const renderCityResults = (results) => {
    clearCityResults();

    results.forEach((result) => {
      const location = toLocation(result);
      if (!location) {
        return;
      }

      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = location.label;
      button.addEventListener("click", () => {
        applyCityResult(result);
      });

      li.appendChild(button);
      cityResults.appendChild(li);
    });
  };

  const searchCity = async ({ selectFirst = false } = {}) => {
    const query = cityInput.value.trim();

    if (!query) {
      setCityStatus("Enter a city name.", true);
      return;
    }

    if (query === cachedQuery && cachedResults.length) {
      if (selectFirst) {
        applyCityResult(cachedResults[0]);
        return;
      }
      setCityStatus(
        `Found ${cachedResults.length} match${cachedResults.length === 1 ? "" : "es"}.`
      );
      renderCityResults(cachedResults);
      return;
    }

    const now = Date.now();
    if (now - lastCitySearch < 900) {
      setCityStatus("Searching...");
      if (searchTimer) {
        clearTimeout(searchTimer);
      }
      searchTimer = setTimeout(() => {
        searchCity({ selectFirst });
      }, 300);
      return;
    }

    lastCitySearch = now;
    setCityStatus("Searching Austrian cities...");
    clearCityResults();

    try {
      const params = new URLSearchParams({
        format: "json",
        limit: "5",
        countrycodes: "at",
        q: query,
        addressdetails: "1",
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`Search failed (${response.status}).`);
      }

      const results = await response.json();
      if (!results.length) {
        setCityStatus("No matches found. Try another name.", true);
        return;
      }

      cachedResults = results;
      cachedQuery = query;

      setCityStatus(
        `Found ${results.length} match${results.length === 1 ? "" : "es"}.`
      );
      if (selectFirst) {
        applyCityResult(results[0]);
        return;
      }
      renderCityResults(results);
    } catch (error) {
      console.error(error);
      setCityStatus(error.message || "Unable to search cities.", true);
    }
  };

  cityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchCity({ selectFirst: true });
  });

  cityInput.addEventListener("input", () => {
    const query = cityInput.value.trim();
    cachedQuery = "";
    cachedResults = [];
    clearCityResults();
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    if (!query || query.length < 2) {
      setCityStatus("Type a city to search.");
      return;
    }
    searchTimer = setTimeout(() => {
      searchCity();
    }, 350);
  });

  return {
    setCityStatus,
    searchCity,
  };
};
