const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { parse } = require("csv-parse/sync");
const {
  getStoredCountryBundle,
  isDatabaseEnabled,
  upsertCountryBundle,
} = require("./db");

const HAPPINESS_CSV_PATH = path.join(__dirname, "..", "csv", "happiness.csv");

const REST_COUNTRY_FIELDS = [
  "name",
  "altSpellings",
  "cca2",
  "cca3",
  "region",
  "subregion",
  "latlng",
  "continents",
  "capital",
  "languages",
  "population",
  "borders",
  "currencies",
  "maps",
  "capitalInfo",
  "timezones",
  "demonyms",
  "flags",
].join(",");

const ROUTE_ALIASES = {
  usa: "United States",
  "united-states-of-america": "United States",
  uk: "United Kingdom",
  britain: "United Kingdom",
  "great-britain": "United Kingdom",
  czechia: "Czech Republic",
  eswatini: "Swaziland",
  taiwan: "Taiwan Province of China",
  "cote-divoire": "Ivory Coast",
  "cote-d-ivoire": "Ivory Coast",
  "republic-of-korea": "South Korea",
};

const REST_LOOKUP_ALIASES = {
  "Czech Republic": ["Czechia"],
  "Ivory Coast": ["Cote d'Ivoire", "Côte d'Ivoire"],
  Swaziland: ["Eswatini"],
  "Taiwan Province of China": ["Taiwan"],
  "South Korea": ["Korea", "Korea, Republic of"],
  Turkey: ["Turkiye", "Türkiye"],
  "United States": ["United States of America"],
};

const metadataCache = new Map();

// Removes diacritics and other Unicode marks for more consistent comparisons and slug generation
function stripDiacritics(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Generates URL-friendly slugs from country names, e.g. "Côte d'Ivoire" -> "cote-divoire"
function slugifyCountryName(input) {
  return stripDiacritics(input)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Normalizes country names for consistent comparisons, e.g. "Côte d'Ivoire" -> "cote divoire"
function normalizeComparableName(input) {
  return stripDiacritics(input)
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Formats the currencies object from REST Countries into a readable string, e.g. "Euro (EUR), US Dollar (USD)"
function formatCurrencies(currencies) {
  if (!currencies || typeof currencies !== "object") return null;

  return Object.entries(currencies)
    .map(([code, details]) => {
      if (!details?.name) return code;
      return `${details.name} (${code})`;
    })
    .join(", ");
}

// Formats the demonyms object from REST Countries into a readable string, e.g. "French, Frenchman"
function formatDemonyms(demonyms) {
  if (!demonyms || typeof demonyms !== "object") return null;

  return [...new Set(Object.values(demonyms).map((entry) => entry?.m).filter(Boolean))].join(", ");
}

// Joins array values into a string or returns a single value, ensuring empty or null values become null
// E.g. ["Paris"] -> "Paris", ["Berlin", "Munich"] -> "Berlin, Munich", [] -> null, null -> null
function joinValues(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || null;
  if (value == null || value === "") return null;
  return String(value);
}

// Loads the happiness dataset from the CSV file, 
// normalizes and ranks the records, 
// and builds lookup maps for efficient access
function loadCountryDataset() {
  const fileContent = fs.readFileSync(HAPPINESS_CSV_PATH, "utf8");
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const countries = records
    .map((record) => {
      const countryName = String(record.country || "").trim();
      const year = Number.parseInt(record.year, 10);
      const happinessScore = Number.parseFloat(record.happiness);

      return {
        countryName,
        normalizedName: normalizeComparableName(countryName),
        slug: slugifyCountryName(countryName),
        year: Number.isFinite(year) ? year : null,
        happinessScore: Number.isFinite(happinessScore) ? happinessScore : null,
      };
    })
    .filter((record) => record.countryName);

  const rankedByHappiness = [...countries].sort((a, b) => {
    const scoreDelta = (b.happinessScore ?? -Infinity) - (a.happinessScore ?? -Infinity);
    if (scoreDelta !== 0) return scoreDelta;
    return a.countryName.localeCompare(b.countryName);
  });

  const rankBySlug = new Map(
    rankedByHappiness.map((record, index) => [record.slug, index + 1])
  );

  const totalCountries = countries.length;
  const bySlug = new Map();

  countries.forEach((record) => {
    bySlug.set(record.slug, {
      ...record,
      rank: rankBySlug.get(record.slug) ?? null,
      countryCount: totalCountries,
    });
  });

  const alphabetical = [...bySlug.values()].sort((a, b) =>
    a.countryName.localeCompare(b.countryName)
  );

  return {
    alphabetical,
    rankedByHappiness: rankedByHappiness.map((record) => bySlug.get(record.slug)),
    bySlug,
  };
}

const dataset = loadCountryDataset();

// Extracts a summary of the country record for listing and search results, 
// omitting detailed metadata and external data to keep the payload lightweight
function summarizeCountry(record) {
  return {
    slug: record.slug,
    name: record.countryName,
    year: record.year,
    happinessScore: record.happinessScore,
    rank: record.rank,
    countryCount: record.countryCount,
  };
}

// Clamps the limit parameter to a reasonable range to prevent excessive data processing and potential abuse
function clampLimit(limit, fallback = 25) {
  const parsedLimit = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsedLimit)) return fallback;
  return Math.max(1, Math.min(parsedLimit, 250));
}

// Lists countries with optional sorting by happiness and limiting the number of results,
function listCountries({ limit, sort } = {}) {
  const safeLimit = clampLimit(limit, dataset.alphabetical.length);
  const source =
    String(sort || "").toLowerCase() === "happiness"
      ? dataset.rankedByHappiness
      : dataset.alphabetical;

  return source.slice(0, safeLimit).map(summarizeCountry);
}

// Resolves a country record by slug or name, 
// checking for direct matches and route aliases to ensure flexible lookups
function resolveCountryRecord(slugOrName) {
  const slug = slugifyCountryName(slugOrName);
  if (!slug) return null;

  const directMatch = dataset.bySlug.get(slug);
  if (directMatch) return directMatch;

  const aliasTarget = ROUTE_ALIASES[slug];
  if (!aliasTarget) return null;

  return dataset.bySlug.get(slugifyCountryName(aliasTarget)) ?? null;
}

// Scores how well a country record matches the search query based on various criteria,
// including exact slug match, alias match, normalized name match, and partial matches, 
// to enable relevant search results even with imperfect queries
function scoreSearchMatch(record, normalizedQuery, querySlug, aliasTarget) {
  if (!normalizedQuery && !querySlug) return 0;
  if (record.slug === querySlug) return 100;
  if (aliasTarget && record.countryName === aliasTarget) return 95;
  if (record.normalizedName === normalizedQuery) return 90;
  if (record.normalizedName.startsWith(normalizedQuery)) return 75;
  if (record.slug.startsWith(querySlug)) return 70;
  if (record.normalizedName.includes(normalizedQuery)) return 55;
  if (record.slug.includes(querySlug)) return 45;
  return 0;
}

// Searches for countries matching the query, scoring and ranking results based on relevance to the query, 
function searchCountries(query, { limit } = {}) {
  const safeLimit = clampLimit(limit, 10);
  const normalizedQuery = normalizeComparableName(query);
  const querySlug = slugifyCountryName(query);
  const aliasTarget = ROUTE_ALIASES[querySlug] || null;

  if (!normalizedQuery && !querySlug) {
    return listCountries({ limit: safeLimit });
  }

  return dataset.alphabetical
    .map((record) => ({
      record,
      score: scoreSearchMatch(record, normalizedQuery, querySlug, aliasTarget),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.record.countryName.localeCompare(b.record.countryName);
    })
    .slice(0, safeLimit)
    .map(({ record }) => summarizeCountry(record));
}

// Fetches JSON data from a URL with support for custom headers and timeout,
function fetchJson(url, { headers, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "http:" ? http : https;

    const request = transport.request(
      parsedUrl,
      {
        method: "GET",
        headers,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`)
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Request timed out"));
    });
    request.end();
  });
}

// Builds a list of candidate names to query the REST Countries API, including the original name and any known aliases, 
// to improve the chances of finding a match even if the input name differs from the official name
function buildLookupCandidates(countryName) {
  return [countryName, ...(REST_LOOKUP_ALIASES[countryName] || [])];
}

// Scores how well a REST Countries API candidate matches the target country name and the originally requested name,
function scoreRestCountryCandidate(candidate, targetName, requestedName) {
  const target = normalizeComparableName(targetName);
  const requested = normalizeComparableName(requestedName);
  const comparableNames = [
    candidate?.name?.common,
    candidate?.name?.official,
    ...(candidate?.altSpellings || []),
  ]
    .filter(Boolean)
    .map(normalizeComparableName);

  let score = 0;

  comparableNames.forEach((name) => {
    if (name === target) score = Math.max(score, 100);
    else if (name === requested) score = Math.max(score, 95);
    else if (name.startsWith(target)) score = Math.max(score, 85);
    else if (name.includes(target)) score = Math.max(score, 75);
    else if (name.startsWith(requested)) score = Math.max(score, 65);
  });

  return score;
}

// Queries the REST Countries API for a country matching the requested name,
async function requestRestCountry(requestedName, targetName) {
  try {
    const payload = await fetchJson(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(
        requestedName
      )}?fields=${REST_COUNTRY_FIELDS}`
    );

    if (!Array.isArray(payload) || payload.length === 0) return null;

    let bestMatch = payload[0];
    let bestScore = scoreRestCountryCandidate(payload[0], targetName, requestedName);

    payload.slice(1).forEach((candidate) => {
      const candidateScore = scoreRestCountryCandidate(candidate, targetName, requestedName);
      if (candidateScore > bestScore) {
        bestMatch = candidate;
        bestScore = candidateScore;
      }
    });

    return bestMatch;
  } catch (error) {
    console.error(`REST Countries lookup failed for ${requestedName}:`, error.message);
    return null;
  }
}

// Fetches country metadata from the REST Countries API, using caching to avoid redundant requests,
async function fetchCountryMetadata(countryName) {
  if (metadataCache.has(countryName)) {
    return metadataCache.get(countryName);
  }

  const fetchPromise = (async () => {
    const lookupCandidates = buildLookupCandidates(countryName);

    for (const candidateName of lookupCandidates) {
      const candidate = await requestRestCountry(candidateName, countryName);
      if (candidate) return candidate;
    }

    return null;
  })();

  metadataCache.set(countryName, fetchPromise);
  const metadata = await fetchPromise;

  if (!metadata) metadataCache.delete(countryName);
  return metadata;
}

function getPopulationApiKey() {
  return process.env.POPULATIONAPIKEY || process.env.AQAPIKEY || null;
}

// Fetches population data from the API Ninjas Population API, including historical population and forecasts, and formats it into a readable structure
async function fetchPopulation(countryName) {
  const apiKey = getPopulationApiKey();
  if (!apiKey) return null;

  try {
    const data = await fetchJson(
      `https://api.api-ninjas.com/v1/population?country=${encodeURIComponent(countryName)}`,
      {
        headers: { "X-Api-Key": apiKey },
      }
    );

    const source = Array.isArray(data) ? data[0] : data;
    if (!source) return null;

    const historicalPopulation = Array.isArray(source.historical_population)
      ? source.historical_population
          .map((row) => `${row.year}: ${row.population}`)
          .join(", ")
      : null;

    const populationForecast = Array.isArray(source.population_forecast)
      ? source.population_forecast
          .map((row) => `${row.year}: ${row.population}`)
          .join(", ")
      : null;

    if (!historicalPopulation && !populationForecast) return null;

    return {
      populationForecast,
      historicalPopulation,
    };
  } catch (error) {
    console.error(`Population lookup failed for ${countryName}:`, error.message);
    return null;
  }
}

// Fetches current weather data from the WeatherAPI, including rainfall, temperature, humidity, and UV index, based on the country's latitude and longitude, and formats it into a readable structure
async function fetchWeather(latitude, longitude, countryName) {
  const apiKey = process.env.WEATHERAPIKEY;
  if (!apiKey || latitude == null || longitude == null) return null;

  try {
    const data = await fetchJson(
      `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${latitude},${longitude}`
    );

    return {
      countryName,
      rainfallMM:
        data?.current?.precip_mm == null ? null : Number(data.current.precip_mm),
      currentTemp:
        data?.current?.temp_c == null ? null : Number(data.current.temp_c),
      humidity: data?.current?.humidity == null ? null : Number(data.current.humidity),
      uvIndex: data?.current?.uv == null ? null : Number(data.current.uv),
    };
  } catch (error) {
    console.error(`Weather lookup failed for ${countryName}:`, error.message);
    return null;
  }
}

// Fetches current air quality data from the API Ninjas Air Quality API, 
// including overall AQI and pollutant-specific measurements, 
// based on the country's latitude and longitude, and formats it into a readable structure
async function fetchAirQuality(latitude, longitude, countryName) {
  const apiKey = process.env.AQAPIKEY;
  if (!apiKey || latitude == null || longitude == null) return null;

  try {
    const data = await fetchJson(
      `https://api.api-ninjas.com/v1/airquality?lat=${latitude}&lon=${longitude}`,
      {
        headers: { "X-Api-Key": apiKey },
      }
    );

    const pollutantKeys = ["CO", "NO2", "O3", "SO2", "PM2.5", "PM10"];
    const pollutantMeasurements = pollutantKeys
      .map((key) => ({
        pollutantType: key,
        aqiValue:
          data?.[key]?.aqi == null ? null : Number(data[key].aqi),
        concentration:
          data?.[key]?.concentration == null ? null : Number(data[key].concentration),
      }))
      .filter(
        (row) => row.aqiValue != null || row.concentration != null
      );

    if (data?.overall_aqi == null && pollutantMeasurements.length === 0) return null;

    return {
      countryName,
      overallAQI:
        data?.overall_aqi == null ? null : Number(data.overall_aqi),
      pollutantMeasurements,
    };
  } catch (error) {
    console.error(`Air quality lookup failed for ${countryName}:`, error.message);
    return null;
  }
}

// Fetches recent significant earthquakes from the USGS Earthquake API based on the country's latitude and longitude,
// including details such as magnitude, location, and time, and formats it into a readable structure
async function fetchEarthquakes(latitude, longitude, countryName) {
  if (latitude == null || longitude == null) return [];

  try {
    const data = await fetchJson(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${latitude}&longitude=${longitude}&maxradiuskm=200&starttime=2014-01-01&minmagnitude=5`
    );

    return Array.isArray(data?.features)
      ? data.features.slice(0, 20).map((feature) => ({
          externalEventID: feature.id || null,
          latitude:
            feature?.geometry?.coordinates?.[1] == null
              ? null
              : Number(feature.geometry.coordinates[1]),
          longitude:
            feature?.geometry?.coordinates?.[0] == null
              ? null
              : Number(feature.geometry.coordinates[0]),
          startTime: feature?.properties?.time
            ? new Date(feature.properties.time).toISOString()
            : null,
          endTime: feature?.properties?.updated
            ? new Date(feature.properties.updated).toISOString()
            : null,
          magnitude:
            feature?.properties?.mag == null ? null : Number(feature.properties.mag),
          place: feature?.properties?.place || null,
        }))
      : [];
  } catch (error) {
    console.error(`Earthquake lookup failed for ${countryName}:`, error.message);
    return [];
  }
}

// Builds the happiness data rows for a country, including historical records if available, and ensures the most recent data is listed first
function buildHappinessRows(record) {
  const rows = dataset.rankedByHappiness
    .filter((row) => row.slug === record.slug)
    .map((row) => ({
      countryName: row.countryName,
      year: row.year,
      happinessScore: row.happinessScore,
      rank: row.rank,
      countryCount: row.countryCount,
    }));

  return rows.length
    ? rows.sort((a, b) => (b.year || 0) - (a.year || 0))
    : [
        {
          countryName: record.countryName,
          year: record.year,
          happinessScore: record.happinessScore,
          rank: record.rank,
          countryCount: record.countryCount,
        },
      ];
}

// Maps the country record, REST Countries metadata, and external data into a structured payload for the frontend,
function mapCountryPayload(record, metadata, extras) {
  const capitalCoordinates = metadata?.capitalInfo?.latlng || [];
  const countryCoordinates = metadata?.latlng || [];

  const country = {
    name: metadata?.name?.common || record.countryName,
    officialName: metadata?.name?.official || null,
    region: metadata?.region || null,
    subregion: metadata?.subregion || null,
    latitude: countryCoordinates[0] ?? null,
    longitude: countryCoordinates[1] ?? null,
    continents: joinValues(metadata?.continents),
    capital: joinValues(metadata?.capital),
    languages: metadata?.languages ? Object.values(metadata.languages).join(", ") : null,
    borders: joinValues(metadata?.borders),
    populationNumber: metadata?.population ?? null,
    cca2: metadata?.cca2 || null,
    cca3: metadata?.cca3 || null,
  };

  const detailedCountryInfo = metadata
    ? {
        countryName: country.name,
        currencies: formatCurrencies(metadata.currencies),
        maps: metadata.maps?.openStreetMaps || metadata.maps?.googleMaps || null,
        capitalLatitude: capitalCoordinates[0] ?? null,
        capitalLongitude: capitalCoordinates[1] ?? null,
        timezones: joinValues(metadata.timezones),
        demonyms: formatDemonyms(metadata.demonyms),
        flags: metadata.flags?.png || metadata.flags?.svg || null,
      }
    : null;

  return {
    slug: record.slug,
    metadataAvailable: Boolean(metadata),
    source: "live",
    country,
    detailedCountryInfo,
    happiness: buildHappinessRows(record),
    population: extras.population || null,
    weather: extras.weather || null,
    airQuality: extras.airQuality || null,
    earthquakes: extras.earthquakes || [],
    cache: null,
  };
}

// Maps the stored country bundle from the database into the structured payload format expected by the frontend, 
// ensuring that all fields are properly typed and formatted, and that the source is indicated as "database"
function mapStoredBundle(bundle) {
  const country = bundle.country;
  const detailed = bundle.detailedCountryInfo;

  return {
    slug: country.slug,
    metadataAvailable: true,
    source: "database",
    country: {
      name: country.name,
      officialName: country.officialname,
      region: country.region,
      subregion: country.subregion,
      latitude: country.latitude == null ? null : Number(country.latitude),
      longitude: country.longitude == null ? null : Number(country.longitude),
      continents: country.continents,
      capital: country.capital,
      languages: country.languages,
      borders: country.borders,
      populationNumber:
        country.populationnumber == null ? null : Number(country.populationnumber),
      cca2: country.cca2,
      cca3: country.cca3,
    },
    detailedCountryInfo: detailed
      ? {
          countryName: country.name,
          currencies: detailed.currencies,
          maps: detailed.maps,
          capitalLatitude:
            detailed.capitallatitude == null ? null : Number(detailed.capitallatitude),
          capitalLongitude:
            detailed.capitallongitude == null ? null : Number(detailed.capitallongitude),
          timezones: detailed.timezones,
          demonyms: detailed.demonyms,
          flags: detailed.flags,
        }
      : null,
    happiness: bundle.happinessRows.map((row) => ({
      countryName: row.countryname,
      year: row.year,
      happinessScore:
        row.happinessscore == null ? null : Number(row.happinessscore),
      rank: null,
      countryCount: null,
    })),
    population: bundle.population
      ? {
          populationForecast: bundle.population.populationforecast,
          historicalPopulation: bundle.population.historicalpopulation,
        }
      : null,
    weather: bundle.weather
      ? {
          rainfallMM:
            bundle.weather.rainfallmm == null ? null : Number(bundle.weather.rainfallmm),
          currentTemp:
            bundle.weather.currenttemp == null ? null : Number(bundle.weather.currenttemp),
          humidity:
            bundle.weather.humidity == null ? null : Number(bundle.weather.humidity),
          uvIndex:
            bundle.weather.uvindex == null ? null : Number(bundle.weather.uvindex),
        }
      : null,
    airQuality: bundle.airQuality
      ? {
          overallAQI:
            bundle.airQuality.overallaqi == null ? null : Number(bundle.airQuality.overallaqi),
          pollutantMeasurements: bundle.pollutantMeasurements.map((row) => ({
            measurementID: row.measurementid,
            pollutantType: row.pollutanttype,
            aqiValue: row.aqivalue == null ? null : Number(row.aqivalue),
            concentration:
              row.concentration == null ? null : Number(row.concentration),
          })),
        }
      : null,
    earthquakes: bundle.earthquakes.map((row) => ({
      earthquakeID: row.earthquakeid,
      externalEventID: row.externaleventid,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      startTime: row.starttime,
      endTime: row.endtime,
      magnitude: row.magnitude == null ? null : Number(row.magnitude),
      place: row.place,
    })),
    cache: {
      searchCount: country.searchcount,
      firstSearchedAt: country.firstsearchedat,
      lastSearchedAt: country.lastsearchedat,
    },
  };
}

// Retrieves detailed information about a country by its slug,
async function getCountryDetails(slug) {
  const record = resolveCountryRecord(slug);
  if (!record) return null;

  if (isDatabaseEnabled()) {
    try {
      const stored = await getStoredCountryBundle(record.slug);
      if (stored) return mapStoredBundle(stored);
    } catch (error) {
      console.error(`Failed to read stored country ${record.slug}:`, error.message);
    }
  }

  const metadata = await fetchCountryMetadata(record.countryName);
  const latitude = metadata?.latlng?.[0] ?? null;
  const longitude = metadata?.latlng?.[1] ?? null;

  const [population, weather, airQuality, earthquakes] = await Promise.all([
    fetchPopulation(record.countryName),
    fetchWeather(latitude, longitude, record.countryName),
    fetchAirQuality(latitude, longitude, record.countryName),
    fetchEarthquakes(latitude, longitude, record.countryName),
  ]);

  const payload = mapCountryPayload(record, metadata, {
    population,
    weather,
    airQuality,
    earthquakes,
  });

  if (isDatabaseEnabled() && metadata) {
    try {
      await upsertCountryBundle(payload);
    } catch (error) {
      console.error(`Failed to store country ${record.slug}:`, error.message);
    }
  }

  return payload;
}

module.exports = {
  getCountryDetails,
  listCountries,
  searchCountries,
  slugifyCountryName,
};
