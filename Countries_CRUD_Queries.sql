--- SELECT QUERY ---
-- user wants to see the most populated countries
-- where English is recognized as an official language
-- SELECT name, continents, capital, populationnumber, languages
-- FROM country
-- WHERE languages ILIKE '%English%'
-- ORDER BY populationnumber DESC NULLS LAST;

--- SELECT QUERY ---
-- user is looking for a country in europe with a population > 100,000
-- and has an above average air quality rating
-- SELECT name, subregion, capital, languages, populationnumber, overallaqi from country
-- JOIN airquality ON country.id = airquality.countryid
-- WHERE populationnumber > 100000
-- AND overallaqi > (SELECT AVG(overallaqi) FROM airquality)
-- AND region = 'Europe'
-- ORDER BY overallaqi DESC NULLS LAST;

--- INSERT QUERY ---
-- If a new country starts to be recognized, we can add the new country
-- INSERT INTO country (name, region, subregion, longitude, latitude, continents, capital, languages, populationnumber)
-- VALUES ('Bougainville', 'Oceania', 'Melanesia', '155.385', '-6.244', 'Oceania', 'Buka', 'English, Tok Pisin', '367093');

-- See insert results
-- SELECT * FROM country WHERE name = 'Bougainville';

--- UPDATE QUERY ---
-- updating airquality for a specific country to newer information
-- UPDATE airquality
-- SET overallaqi = '41' 
-- WHERE countryid = (SELECT id FROM country WHERE name = 'United States');

-- see update results
-- SELECT name, overallaqi FROM country
-- JOIN airquality ON airquality.countryid = country.id
-- WHERE name = 'United States';


--- DELETE QUERY ---
-- DELETE FROM country
-- WHERE name = 'Bougainville';


-- See insert results
-- SELECT * FROM country WHERE name = 'Bougainville';