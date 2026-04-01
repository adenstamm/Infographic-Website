require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    host: process.env.HOST,
    port: process.env.PORT,
    database: process.env.NAME,
    user: process.env.USER,
    password: process.env.PASSWORD
});

console.log('Start');

async function importCountries() {
    const url = 'https://restcountries.com/v3.1/all?fields=name,region,subregion,latlng,continents,capital,languages,population';

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        console.log(data)

        for (const country of data) {
            const name = country.name.common;
            const region = country.region || null;
            const subregion = country.subregion || null;
            const latitude = country.latlng[0] || null;
            const longitude = country.latlng[1] || null;
            const continents = country.continents ? country.continents.join(', ') : null;
            const capital = country.capital ? country.capital[0] : null;
            const languages = country.languages ? Object.values(country.languages).join(', ') : null;
            const population = country.population || null;

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

async function importDetailedCountryInfo() {
  const url = 'https://restcountries.com/v3.1/all?fields=name,currencies,maps,capitalInfo,timezones,demonyms,flags';

  try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      //console.log(data)

      for (const country of data) {
          const name = country.name.common;
          const currencies = country.currencies ? Object.keys(country.currencies).join(', ') : null;
          const googleMapsLink = country.maps && country.maps.googleMaps ? country.maps.googleMaps : null;
          const capitalLatitude = country.capitalInfo && country.capitalInfo.latlng ? country.capitalInfo.latlng[0] : null
          const timezones = country.timezones ? country.timezones.join(', ') : null;
          const demonyms = country.demonyms ? Object.values(country.demonyms).map(d => d.m).join(', ') : null;
          const flags = country.flags.png || null;
          
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

async function importAQData() {
  const resultingQuery = await client.query('SELECT id, latitude, longitude FROM Country');
  const countryRows = resultingQuery.rows;

  for (const country of countryRows) {
    const countryId = country.id;
    const latitude = country.latitude;
    const longitude = country.longitude;

    if (latitude === null || longitude === null) {
      console.error(`Skipping country ID ${countryId} due to missing latitude or longitude`);
      continue;
    }

    const url = `https://api.api-ninjas.com/v1/airquality?lat=${latitude}&lon=${longitude}`;

    const response = await fetch(url, {
      headers: { 'X-Api-Key': process.env.AQAPIKEY }
    });

    if (!response.ok) {
      console.error(`Failed to fetch AQ data for country ID ${countryId}: ${response.status} ${response.statusText}`);
      continue;
    }

    const data = await response.json();
    //console.log(data);

    const totalAQI = data.overall_aqi;

    const firstResult = await client.query(
      'INSERT INTO AirQuality (countryId, overallAQI) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING aqiID',
      [countryId, totalAQI]
    );

    if (firstResult.rows[0] === undefined) {
      console.error(`Failed to insert AQ data for country ID ${countryId}`);
      continue;
    }
    else {
      const airQualityId = firstResult.rows[0].aqiid;
      const listOfPollutants = ['CO', 'NO2', 'O3', 'SO2', 'PM2.5', 'PM10'];

      for (const pollutant of listOfPollutants) {
        const concentration = data[pollutant].concentration !== undefined ? data[pollutant].concentration : null;
        const individualAQIValue = data[pollutant].aqi !== undefined ? data[pollutant].aqi : null;

        await client.query(
          'INSERT INTO PollutantMeasurement (aqiId, pollutantType, aqiValue, concentration) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [airQualityId, pollutant, individualAQIValue, concentration]
        );
      }
    }
  }
}

async function importPopulationData() {
  const resultingQuery = await client.query('SELECT name FROM Country');
  const countryRows = resultingQuery.rows;

  for (const country of countryRows) {
    const countryName = country.name;
    const url = `https://api.api-ninjas.com/v1/population?country=${encodeURIComponent(countryName)}`;

    const response = await fetch(url, {
      headers: { 'X-Api-Key': process.env.AQAPIKEY }
    });

    if (!response.ok) {
      console.error(`Failed to fetch population data for ${countryName}: ${response.status} ${response.statusText}`);
      continue;
    }

    const data = await response.json();
    console.log(data);

    if (data.length === 0) {
      console.error(`No population data found for ${countryName}`);
      continue;
    }
    
    const historicalPopulation = data.historical_population ? data.historical_population.map(obj => `${obj.year}: ${obj.population}`).join(', ') : null;
    const populationForecast = data.population_forecast ? data.population_forecast.map(obj => `${obj.year}: ${obj.population}`).join(', ') : null;

    await client.query(
      'INSERT INTO Population (countryName, populationForecast, historicalPopulation) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [countryName, populationForecast, historicalPopulation]
    );
  }

}



async function main() {
  await client.connect();

  await importCountries();
  await importDetailedCountryInfo();
  console.log('Data import complete for countries and detailed country info');

  //await importAQData();
  //await importPopulationData();

  await client.end();
}

main();