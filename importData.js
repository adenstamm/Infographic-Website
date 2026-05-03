require('dotenv').config();
const { Client } = require('pg');

// Necessary imports for CSV parsing
const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Create a new client instance
const client = new Client({
    host: process.env.HOST,
    port: process.env.PORT,
    database: process.env.NAME,
    user: process.env.USER,
    password: process.env.PASSWORD
});

console.log('Start');

/******************************************************************************
This function fetches data from the REST Countries API and inserts it into the 
'Country' entity/table in the PostgreSQL database. It retrieves various fields such as:
- name
- region
- subregion
- latitude
- longitude
- continents
- capital
- languages
- population
The function uses parameterized queries to prevent SQL injection and handles 
potential errors during the fetch or database insertion process.
*******************************************************************************/
async function importCountries() {
  // URL necessary for fetching the REST Country API data given specific fields in the URL
  const url = 'https://restcountries.com/v3.1/all?fields=name,region,subregion,latlng,continents,capital,languages,population';

  try {
    // Go ahead and fetch the response given the desired URL
    const res = await fetch(url);

    // First, just check if the response is invalid
    // If this is the case, throw an error
    if (!res.ok) {
        throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);
    }

    // Otherwise, response is valid and we can collect the country data given from the JSON response
    const data = await res.json();
    console.log(data)

    for (const country of data) {
      // Extract all the necessary attributes needed to populate the table
      // If any of the attributes are missing, we can just set them to null in the database
      const name = country.name.common;
      const region = country.region || null;
      const subregion = country.subregion || null;
      const latitude = country.latlng[0] || null;
      const longitude = country.latlng[1] || null;
      const continents = country.continents ? country.continents.join(', ') : null;
      const capital = country.capital ? country.capital[0] : null;
      const languages = country.languages ? Object.values(country.languages).join(', ') : null;
      const population = country.population || null;

      // Go ahead and INSERT the country data into the Country table in the database
      // with its corresponding query parameters.
      await client.query(
        'INSERT INTO Country (name, region, subregion, latitude, longitude, continents, capital, languages, populationNumber) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING',
          [name, region, subregion, latitude, longitude, continents, capital, languages, population]
      );
    }
  }
    catch (err) {
      console.error('Error importing data:', err);
  }
}

/******************************************************************************
This function fetches data from the REST Countries API and inserts it into the 
'DetailedCountryInfo' entity/table in the PostgreSQL database. It retrieves various fields such as:
- name
- currencies
- maps
- capitalInfo
- timezones
- demonyms
- flags
The function is evidently the same as the previous one, although it just
retrieves some additional data for the end user to take a look at
The function still uses parameterized queries to prevent SQL injection and handles 
potential errors during the fetch or database insertion process.
*******************************************************************************/
async function importDetailedCountryInfo() {
  // URL necessary for fetching the REST Country API data given specific fields in the URL
  const url = 'https://restcountries.com/v3.1/all?fields=name,currencies,maps,capitalInfo,timezones,demonyms,flags';

  try {
    // Go ahead and fetch the response given the desired URL
    const res = await fetch(url);

    // First, just check if the response is invalid
    // If this is the case, throw an error
    if (!res.ok) {
      throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);
    }

    // Otherwise, response is valid and we can collect the country data given from the JSON response
    const data = await res.json();
    //console.log(data)

    for (const country of data) {
      // Extract all the necessary attributes needed to populate the table
      // If any of the attributes are missing, we can just set them to null in the database
      const name = country.name.common;
      const currencies = country.currencies ? Object.keys(country.currencies).join(', ') : null;
      const googleMapsLink = country.maps && country.maps.googleMaps ? country.maps.googleMaps : null;
      const capitalLatitude = country.capitalInfo && country.capitalInfo.latlng ? country.capitalInfo.latlng[0] : null
      const timezones = country.timezones ? country.timezones.join(', ') : null;
      const demonyms = country.demonyms ? Object.values(country.demonyms).map(d => d.m).join(', ') : null;
      const flags = country.flags.png || null;
      
      // Go ahead and INSERT the country data into the DetailedCountryInfo table in the database
      // with its corresponding query parameters.
      await client.query(
        'INSERT INTO DetailedCountryInfo (countryName, currencies, maps, capitalInfo, timezones, demonyms, flags) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
          [name, currencies, googleMapsLink, capitalLatitude, timezones, demonyms, flags]
      );
    }
  }
    catch (err) {
      console.error('Error importing data:', err);
  }
}

/******************************************************************************
This function fetches data from the API Ninjas Air Quality API and inserts it into the
'AirQuality' and 'PollutantMeasurement' entities/tables in the PostgreSQL database. It retrieves various fields such as:
- overallAQi
- pollutantType
- aqiValue
- concentration
The function first queries the Country table to get the latitude and longitude for each country, 
then uses those coordinates to fetch the air quality data. It handles potential errors during 
the fetch or database insertion process and ensures that only valid data is inserted into the database.
 ******************************************************************************/
async function importAQData() {
  // First, we need to query the Country table to extrapolate the latitude and longitude for each country
  const resultingQuery = await client.query('SELECT id, latitude, longitude FROM Country');
  const countryRows = resultingQuery.rows;

  // Now, for each country row returned, we want to extract the data
  // and place it into the API call to the API Ninjas Air Quality API 
  // to get the air quality data for that country
  for (const country of countryRows) {
    const countryId = country.id;
    const latitude = country.latitude;
    const longitude = country.longitude;

    // If either latitude or longitude is missing, we cannot fetch the air quality data for that country, so we skip it
    if (latitude === null || longitude === null) {
      console.error(`Skipping country ID ${countryId} due to missing latitude or longitude`);
      continue;
    }

    // URL necessary for fetching the API Ninjas Air Quality API data given the latitude and longitude of the country
    const url = `https://api.api-ninjas.com/v1/airquality?lat=${latitude}&lon=${longitude}`;

    const response = await fetch(url, {
      headers: { 'X-Api-Key': process.env.AQAPIKEY }
    });

    // If the response is not valid, log an error and skip to the next country
    if (!response.ok) {
      console.error(`Failed to fetch AQ data for country ID ${countryId}: ${response.status} ${response.statusText}`);
      continue;
    }

    // Otherwise, response is valid and we can collect the air quality data given from the JSON response
    const data = await response.json();
    //console.log(data);

    const totalAQI = data.overall_aqi;

    // Now, we can insert the overall AQI data into the AirQuality table and get the generated aqiID for that entry
    const firstResult = await client.query(
      'INSERT INTO AirQuality (countryId, overallAQI) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING aqiID',
      [countryId, totalAQI]
    );

    // If the insert failed and we did not get an aqiID back, log an error and skip to the next country
    if (firstResult.rows[0] === undefined) {
      console.error(`Failed to insert AQ data for country ID ${countryId}`);
      continue;
    }
    else {
      // Otherwise, we have the aqiID for the overall AQI entry we just inserted, 
      // and we can now insert the individual pollutant measurements into the 'PollutantMeasurement' table
      const airQualityId = firstResult.rows[0].aqiid;
      const listOfPollutants = ['CO', 'NO2', 'O3', 'SO2', 'PM2.5', 'PM10'];

      // For each individual pollutant, we want to extract the concentration 
      // and AQI value (if they exist) and insert them into the 'PollutantMeasurement' 
      // table with the corresponding aqiID and pollutant type
      for (const pollutant of listOfPollutants) {
        const concentration = data[pollutant].concentration !== undefined ? data[pollutant].concentration : null;
        const individualAQIValue = data[pollutant].aqi !== undefined ? data[pollutant].aqi : null;

        // Go ahead and INSERT the pollutant measurement data into the PollutantMeasurement table in the database
        // with its corresponding query parameters.
        await client.query(
          'INSERT INTO PollutantMeasurement (aqiId, pollutantType, aqiValue, concentration) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [airQualityId, pollutant, individualAQIValue, concentration]
        );
      }
    }
  }
}

/*************************8******************************************************
This function fetches data from the API Ninjas Population API and inserts it into the
'Population' entity/table in the PostgreSQL database. It retrieves various fields such as:
- populationForecast
- historicalPopulation
The function first queries the Country table to get the name of each country, 
then uses that name to fetch the population data. It handles potential errors during 
the fetch or database insertion process and ensures that only valid data is inserted into the database.
********************************************************************************/
async function importPopulationData() {
  // First, we need to query the Country table to extrapolate the name for each country
  const resultingQuery = await client.query('SELECT name FROM Country');
  const countryRows = resultingQuery.rows;

  // For each country row returned, we want to extract the name
  // and place it into the API call to the API Ninjas Population API 
  // to get the population data for that country
  for (const country of countryRows) {
    const countryName = country.name;

    // URL necessary for fetching the API Ninjas Population API data given the name of the country
    const url = `https://api.api-ninjas.com/v1/population?country=${encodeURIComponent(countryName)}`;

    const response = await fetch(url, {
      headers: { 'X-Api-Key': process.env.AQAPIKEY }
    });

    // If the response is not valid, log an error and skip to the next country
    if (!response.ok) {
      console.error(`Failed to fetch population data for ${countryName}: ${response.status} ${response.statusText}`);
      continue;
    }

    // Otherwise, response is valid and we can collect the population data given from the JSON response
    const data = await response.json();
    console.log(data);

    // If the data array is empty, it means no population data 
    // was found for that country, so we log an error and skip to the next country
    if (data.length === 0) {
      console.error(`No population data found for ${countryName}`);
      continue;
    }
    
    // We can go ahead and extract the historical population and population forecast data from the response
    // We want to format the historical population and population forecast data as strings where each entry 
    // is in the format "year: population" and entries are separated by commas
    const historicalPopulation = data.historical_population ? data.historical_population.map(obj => `${obj.year}: ${obj.population}`).join(', ') : null;
    const populationForecast = data.population_forecast ? data.population_forecast.map(obj => `${obj.year}: ${obj.population}`).join(', ') : null;

    // Go ahead and INSERT the population data into the Population table in the database
    // with its corresponding query parameters.
    await client.query(
      'INSERT INTO Population (countryName, populationForecast, historicalPopulation) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [countryName, populationForecast, historicalPopulation]
    );
  }

}

/******************************************************************************
This function fetches data from the USGS Earthquake API and inserts it into the
'Earthquake' entity/table in the PostgreSQL database. It retrieves various fields such as:
- magnitude
- place
- startTime
- endTime
- latitude
- longitude
The function first queries the Country table to get the latitude and longitude for each country, 
then uses those coordinates to fetch the earthquake data. It handles potential errors during 
the fetch or database insertion process and ensures that only valid data is inserted into the database.
*******************************************************************************/
async function importEarthquakeData() {
  // First, we need to query the Country table to extrapolate the latitude and longitude for each country
  const resultingQuery = await client.query('SELECT id, latitude, longitude FROM Country');
  const countryRows = resultingQuery.rows;

  // For each country row returned, we want to extract the latitude and longitude
  // and place it into the API call to the USGS Earthquake API 
  // to get the earthquake data for that country
  for (const country of countryRows) {
    const countryId = country.id;
    const latitude = country.latitude;
    const longitude = country.longitude;
    
    // If either latitude or longitude is missing, we cannot fetch the earthquake data for that country, so we skip it
    if (latitude === null || longitude === null) {
      console.error(`Skipping country ID ${countryId} due to missing latitude or longitude`);
      continue;
    }

    // URL necessary for fetching the USGS Earthquake API data given the latitude and longitude of the country
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${latitude}&longitude=${longitude}&maxradiuskm=200&starttime=2014-01-01&endtime=2026-04-03&minmagnitude=5`;
    
    const response = await fetch(url);
    
    // If the response is not valid, log an error and skip to the next country
    if (!response.ok) {
      console.error(`Failed to fetch earthquake data for country ID ${countryId}: ${response.status} ${response.statusText}`);
      continue;
    }

    // Otherwise, response is valid and we can collect the earthquake data given from the JSON response
    const data = await response.json();
    console.log(data);

    // The earthquake data is returned as an array of earthquake events in the 'features' field of the response
    // For each earthquake event, we want to extract the magnitude, place, start time, end time, latitude, and longitude
    for (const feature of data.features) {
      const magnitude = data.features && data.features.length > 0 ? feature.properties.mag : null;
      const place = data.features && data.features.length > 0 ? feature.properties.place : null;

      // For these components, we want to convert the times to their corresponding timestamp in ISO format
      const startTime = data.features && data.features.length > 0 ? new Date(feature.properties.time).toISOString() : null;
      const endTime = data.features && data.features.length > 0 ? new Date(feature.properties.updated).toISOString() : null;

      const actualLatitude = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates[1] : null;
      const actualLongitude = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates[0] : null;

      // Go ahead and INSERT the earthquake data into the Earthquake table in the database
      // with its corresponding query parameters.
      await client.query(
        'INSERT INTO Earthquake (countryID, latitude, longitude, startTime, endTime, magnitude, place) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
        [countryId, actualLatitude, actualLongitude, startTime, endTime, magnitude, place]
      );
    }
  }
}

/******************************************************************************
This function fetches data from the WeatherAPI and inserts it into the
'Weather' entity/table in the PostgreSQL database. It retrieves various fields such as:
- currentTemp
- humidity
- uvIndex
- rainfallMM
The function first queries the Country table to get the latitude and longitude for each country, 
then uses those coordinates to fetch the weather data. It handles potential errors during 
the fetch or database insertion process and ensures that only valid data is inserted into the database.
*******************************************************************************/
async function importWeatherData() {
  // First, we need to query the Country table to extrapolate the latitude and longitude for each country
  const resultingQuery = await client.query('SELECT name, latitude, longitude FROM Country');
  const countryRows = resultingQuery.rows;

  // For each country row returned, we want to extract the name, latitude, and longitude
  // and place the latitude and longitude into the API call to the WeatherAPI 
  // to get the weather data for that country
  for (const country of countryRows) {
    const countryName = country.name;
    const latitude = country.latitude;
    const longitude = country.longitude;

    // If either latitude or longitude is missing, we cannot fetch the weather data for that country, so we skip it
    if (latitude === null || longitude === null) {
      console.error(`Skipping ${countryName} due to missing latitude or longitude`);
      continue;
    }
    
    // URL necessary for fetching the WeatherAPI data given the latitude and longitude of the country
    const url = `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHERAPIKEY}&q=${latitude},${longitude}`;
    
    const response = await fetch(url);

    // If the response is not valid, log an error and skip to the next country
    if (!response.ok) {
      console.error(`Failed to fetch weather data for ${countryName}: ${response.status} ${response.statusText}`);
      continue;
    }

    // Otherwise, response is valid and we can collect the weather data given from the JSON response
    const data = await response.json();
    console.log(data);
    
    // We can go ahead and extract the current temperature, humidity, UV index, and rainfall in millimeters from the response
    const currentTempCelcius = data.current && data.current.temp_c !== undefined ? data.current.temp_c : null;
    const humidity = data.current && data.current.humidity !== undefined ? data.current.humidity : null;
    const uvIndex = data.current && data.current.uv !== undefined ? data.current.uv : null;
    const rainfallMM = data.current && data.current.precip_mm !== undefined ? data.current.precip_mm : null;

    // Go ahead and INSERT the weather data into the Weather table in the database
    // with its corresponding query parameters.
    await client.query(
      'INSERT INTO Weather (countryName, rainfallMM, currentTemp, humidity, uvIndex) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [countryName, rainfallMM, currentTempCelcius, humidity, uvIndex]
    );

  }
}

/******************************************************************************
This function fetches data from the World Happiness Report API and inserts it into the
'Happiness' entity/table in the PostgreSQL database. It retrieves various fields such as:
- happinessScore
- year
The function is reading from a local CSV file containing the happiness data for each country and year, 
then uses that data to insert into the database. It handles potential errors during
the file reading or database insertion process and ensures that only valid data is inserted into the database.
*******************************************************************************/
async function importHappinessData() {
  // Read the CSV file containing the happiness data for each country and year
  // and parse the data using the csv-parse library to extract the 
  // country name, year, and happiness score for each entry
  const fileContent = fs.readFileSync('./csv/happiness.csv', 'utf8');
  const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
  });

  // For each record in the parsed CSV data, we want to extract the country name, year, and happiness score
  // and insert that data into the Happiness table in the database
  for (const record of records) {
    const countryName = record['country'];
    const year = parseInt(record['year']);
    const happinessScore = parseFloat(record['happiness']);

    // Before we can insert the happiness data into the database, we need to query the Country table 
    // to get the corresponding country ID for the country name in the happiness data
    const countryIdResult = await client.query('SELECT id FROM Country WHERE name = $1', [countryName]);

    // If the query did not return any rows, it means there is no country in the Country 
    // table with the name from the happiness data, so we log an error and skip to the next record
    if (countryIdResult.rows.length === 0) {
      console.error(`No country found with name ${countryName} for happiness data`);
      continue;
    }

    // Otherwise, we have the country ID for the country name in the happiness data, 
    // and we can go ahead and insert the happiness data into the Happiness table
    const countryId = countryIdResult.rows[0].id;

    // Go ahead and INSERT the happiness data into the Happiness table in the database
    // with its corresponding query parameters.
    await client.query(
      'INSERT INTO Happiness (countryID, countryName, year, happinessScore) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [countryId, countryName, year, happinessScore]
    );
  }
}

/******************************************************************************
This is the main function that orchestrates the data import process. 
- Firstly, it connects to the PostgreSQL database. 
- Then, it sequentially calls the individual data import functions for each entity/table.
- Finally, it simply closes the database connection. 
The function ensures that all data import operations are completed before ending the connection and logs a message upon completion.
*******************************************************************************/
async function main() {
  await client.connect();

  await importCountries(); 
  await importDetailedCountryInfo(); 
  console.log('Data import complete for countries and detailed country info');

  await importAQData(); 
  await importPopulationData(); 

  await importWeatherData();  
  await importHappinessData(); 
  await importEarthquakeData();

  await client.end();
}

main();