require("dotenv").config();

const { Pool } = require("pg");

const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    }
  : {
      host: process.env.DB_HOST || process.env.HOST,
      port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
      database: process.env.DB_NAME || process.env.NAME,
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || process.env.PASSWORD,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    };

const hasConnectionInfo = Boolean(
  process.env.DATABASE_URL ||
    (dbConfig.host && dbConfig.database && dbConfig.user)
);

const pool = hasConnectionInfo ? new Pool(dbConfig) : null;
let initPromise = null;

// Initializes the database by creating necessary tables if they do not exist, 
// ensuring that the schema is set up for storing country data and related information. 
// This function is designed to be idempotent and can be safely called multiple times without causing issues.
async function initializeDatabase() {
  if (!pool) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Country (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(160) UNIQUE NOT NULL,
        name VARCHAR(100) UNIQUE NOT NULL,
        officialName TEXT,
        region VARCHAR(100),
        subregion VARCHAR(100),
        borders TEXT,
        longitude DECIMAL(9, 6),
        latitude DECIMAL(9, 6),
        continents TEXT,
        capital TEXT,
        languages TEXT,
        populationNumber BIGINT,
        cca2 VARCHAR(10),
        cca3 VARCHAR(10),
        searchCount INT NOT NULL DEFAULT 1,
        firstSearchedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lastSearchedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_custom BOOLEAN DEFAULT false
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS DetailedCountryInfo (
        countryID INT PRIMARY KEY REFERENCES Country(id) ON DELETE CASCADE,
        currencies TEXT,
        maps TEXT,
        capitalLatitude DECIMAL(9, 6),
        capitalLongitude DECIMAL(9, 6),
        timezones TEXT,
        demonyms TEXT,
        flags TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS AirQuality (
        aqiID SERIAL PRIMARY KEY,
        countryID INT UNIQUE NOT NULL REFERENCES Country(id) ON DELETE CASCADE,
        overallAQI INT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS PollutantMeasurement (
        measurementID SERIAL PRIMARY KEY,
        aqiID INT NOT NULL REFERENCES AirQuality(aqiID) ON DELETE CASCADE,
        pollutantType VARCHAR(50) NOT NULL,
        aqiValue INT,
        concentration DECIMAL(10, 2),
        UNIQUE (aqiID, pollutantType)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Earthquake (
        earthquakeID BIGSERIAL PRIMARY KEY,
        countryID INT NOT NULL REFERENCES Country(id) ON DELETE CASCADE,
        externalEventID TEXT UNIQUE,
        latitude DECIMAL(9, 6),
        longitude DECIMAL(9, 6),
        startTime TIMESTAMPTZ,
        endTime TIMESTAMPTZ,
        magnitude DECIMAL(4, 1),
        place TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Population (
        countryID INT PRIMARY KEY REFERENCES Country(id) ON DELETE CASCADE,
        populationForecast TEXT,
        historicalPopulation TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Weather (
        countryID INT PRIMARY KEY REFERENCES Country(id) ON DELETE CASCADE,
        rainfallMM NUMERIC(8, 2),
        currentTemp NUMERIC(8, 2),
        humidity INT,
        uvIndex NUMERIC(8, 2)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Happiness (
        countryID INT NOT NULL REFERENCES Country(id) ON DELETE CASCADE,
        countryName VARCHAR(100) NOT NULL,
        year INT NOT NULL,
        happinessScore NUMERIC(8, 3),
        PRIMARY KEY (countryID, year)
      )
    `);

    return true;
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

// A helper function to execute a callback with a database client, 
// ensuring that the client is properly released back to the pool after the operation, 
// and that the database is initialized before use. This function abstracts away the connection management and allows for cleaner code when performing database operations.
async function withClient(callback) {
  await initializeDatabase();
  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

// Retrieves detailed information about a country by its slug from the database,
async function getStoredCountryBundle(slug) {
  if (!pool) return null;

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const countryResult = await client.query(
        `
          UPDATE Country
          SET searchCount = searchCount + 1,
              lastSearchedAt = NOW()
          WHERE slug = $1
          RETURNING *
        `,
        [slug]
      );

      const country = countryResult.rows[0];
      if (!country) {
        await client.query("ROLLBACK");
        return null;
      }

      const countryId = country.id;

      const [
        detailedResult,
        airQualityResult,
        pollutantResult,
        earthquakesResult,
        populationResult,
        weatherResult,
        happinessResult,
      ] = await Promise.all([
        client.query("SELECT * FROM DetailedCountryInfo WHERE countryID = $1", [countryId]),
        client.query("SELECT * FROM AirQuality WHERE countryID = $1", [countryId]),
        client.query(
          `
            SELECT pm.*
            FROM PollutantMeasurement pm
            JOIN AirQuality aq ON aq.aqiID = pm.aqiID
            WHERE aq.countryID = $1
            ORDER BY pm.measurementID ASC
          `,
          [countryId]
        ),
        client.query(
          `
            SELECT *
            FROM Earthquake
            WHERE countryID = $1
            ORDER BY startTime DESC NULLS LAST, earthquakeID DESC
          `,
          [countryId]
        ),
        client.query("SELECT * FROM Population WHERE countryID = $1", [countryId]),
        client.query("SELECT * FROM Weather WHERE countryID = $1", [countryId]),
        client.query(
          `
            SELECT *
            FROM Happiness
            WHERE countryID = $1
            ORDER BY year DESC
          `,
          [countryId]
        ),
      ]);

      await client.query("COMMIT");

      return {
        country,
        detailedCountryInfo: detailedResult.rows[0] || null,
        airQuality: airQualityResult.rows[0] || null,
        pollutantMeasurements: pollutantResult.rows,
        earthquakes: earthquakesResult.rows,
        population: populationResult.rows[0] || null,
        weather: weatherResult.rows[0] || null,
        happinessRows: happinessResult.rows,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

// Upserts a country bundle into the database, 
// including the main country data and all related information such as detailed info, air quality, earthquakes, population, weather, and happiness scores.
async function upsertCountryBundle(payload) {
  if (!pool) return false;

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      const countryResult = await client.query(
        `
          INSERT INTO Country (
            slug, name, officialName, region, subregion, borders,
            longitude, latitude, continents, capital, languages,
            populationNumber, cca2, cca3, searchCount, firstSearchedAt, lastSearchedAt
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, 1, NOW(), NOW()
          )
          ON CONFLICT (slug) DO UPDATE
          SET name = EXCLUDED.name,
              officialName = EXCLUDED.officialName,
              region = EXCLUDED.region,
              subregion = EXCLUDED.subregion,
              borders = EXCLUDED.borders,
              longitude = EXCLUDED.longitude,
              latitude = EXCLUDED.latitude,
              continents = EXCLUDED.continents,
              capital = EXCLUDED.capital,
              languages = EXCLUDED.languages,
              populationNumber = EXCLUDED.populationNumber,
              cca2 = EXCLUDED.cca2,
              cca3 = EXCLUDED.cca3,
              lastSearchedAt = NOW()
          RETURNING *
        `,
        [
          payload.slug,
          payload.country.name,
          payload.country.officialName,
          payload.country.region,
          payload.country.subregion,
          payload.country.borders,
          payload.country.longitude,
          payload.country.latitude,
          payload.country.continents,
          payload.country.capital,
          payload.country.languages,
          payload.country.populationNumber,
          payload.country.cca2,
          payload.country.cca3,
        ]
      );

      const country = countryResult.rows[0];
      const countryId = country.id;

      if (payload.detailedCountryInfo) {
        await client.query(
          `
            INSERT INTO DetailedCountryInfo (
              countryID, currencies, maps, capitalLatitude, capitalLongitude, timezones, demonyms, flags
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (countryID) DO UPDATE
            SET currencies = EXCLUDED.currencies,
                maps = EXCLUDED.maps,
                capitalLatitude = EXCLUDED.capitalLatitude,
                capitalLongitude = EXCLUDED.capitalLongitude,
                timezones = EXCLUDED.timezones,
                demonyms = EXCLUDED.demonyms,
                flags = EXCLUDED.flags
          `,
          [
            countryId,
            payload.detailedCountryInfo.currencies,
            payload.detailedCountryInfo.maps,
            payload.detailedCountryInfo.capitalLatitude,
            payload.detailedCountryInfo.capitalLongitude,
            payload.detailedCountryInfo.timezones,
            payload.detailedCountryInfo.demonyms,
            payload.detailedCountryInfo.flags,
          ]
        );
      }

      if (payload.happiness?.length) {
        for (const row of payload.happiness) {
          await client.query(
            `
              INSERT INTO Happiness (countryID, countryName, year, happinessScore)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (countryID, year) DO UPDATE
              SET countryName = EXCLUDED.countryName,
                  happinessScore = EXCLUDED.happinessScore
            `,
            [countryId, row.countryName, row.year, row.happinessScore]
          );
        }
      }

      if (payload.population) {
        await client.query(
          `
            INSERT INTO Population (countryID, populationForecast, historicalPopulation)
            VALUES ($1, $2, $3)
            ON CONFLICT (countryID) DO UPDATE
            SET populationForecast = EXCLUDED.populationForecast,
                historicalPopulation = EXCLUDED.historicalPopulation
          `,
          [
            countryId,
            payload.population.populationForecast,
            payload.population.historicalPopulation,
          ]
        );
      }

      if (payload.weather) {
        await client.query(
          `
            INSERT INTO Weather (countryID, rainfallMM, currentTemp, humidity, uvIndex)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (countryID) DO UPDATE
            SET rainfallMM = EXCLUDED.rainfallMM,
                currentTemp = EXCLUDED.currentTemp,
                humidity = EXCLUDED.humidity,
                uvIndex = EXCLUDED.uvIndex
          `,
          [
            countryId,
            payload.weather.rainfallMM,
            payload.weather.currentTemp,
            payload.weather.humidity,
            payload.weather.uvIndex,
          ]
        );
      }

      let aqiId = null;
      if (payload.airQuality) {
        const airQualityResult = await client.query(
          `
            INSERT INTO AirQuality (countryID, overallAQI)
            VALUES ($1, $2)
            ON CONFLICT (countryID) DO UPDATE
            SET overallAQI = EXCLUDED.overallAQI
            RETURNING aqiID
          `,
          [countryId, payload.airQuality.overallAQI]
        );

        aqiId = airQualityResult.rows[0].aqiid;

        await client.query("DELETE FROM PollutantMeasurement WHERE aqiID = $1", [aqiId]);

        for (const row of payload.airQuality.pollutantMeasurements || []) {
          await client.query(
            `
              INSERT INTO PollutantMeasurement (aqiID, pollutantType, aqiValue, concentration)
              VALUES ($1, $2, $3, $4)
            `,
            [aqiId, row.pollutantType, row.aqiValue, row.concentration]
          );
        }
      }

      await client.query("DELETE FROM Earthquake WHERE countryID = $1", [countryId]);

      for (const row of payload.earthquakes || []) {
        await client.query(
          `
            INSERT INTO Earthquake (
              countryID, externalEventID, latitude, longitude, startTime, endTime, magnitude, place
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (externalEventID) DO NOTHING
          `,
          [
            countryId,
            row.externalEventID,
            row.latitude,
            row.longitude,
            row.startTime,
            row.endTime,
            row.magnitude,
            row.place,
          ]
        );
      }

      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

function isDatabaseEnabled() {
  return Boolean(pool);
}

module.exports = {
  getStoredCountryBundle,
  initializeDatabase,
  isDatabaseEnabled,
  upsertCountryBundle,
  pool,
};
