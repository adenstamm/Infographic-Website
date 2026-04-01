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
      console.log(data)

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



async function main() {
  await client.connect();

  await importCountries();
  await importDetailedCountryInfo();

  await client.end();
}

main();