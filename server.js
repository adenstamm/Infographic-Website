const express = require("express");
const path = require("path");
require("dotenv").config();
const {
  getCountryDetails,
  listCountries,
  searchCountries,
} = require("./src/countryData");
const { initializeDatabase, isDatabaseEnabled, pool } = require("./src/db");

const app = express();
const PORT = Number(process.env.APP_PORT || 3000);
const APP_HOST = process.env.APP_HOST || "127.0.0.1";

// static files
app.use(express.static(path.join(__dirname, "public")));
// Needed to add this line for middleware to parse JSON bodies
app.use(express.json());

app.get("/api/countries", (req, res) => {
    const query = String(req.query.q || "").trim();
    const sort = String(req.query.sort || "").trim();
    const limit = req.query.limit;

    const countries = query
        ? searchCountries(query, { limit })
        : listCountries({ limit, sort });

    res.json({ countries });
});

app.get("/api/countries/:slug", async (req, res) => {
    // Check if the country is a custom country created by the user in the database. 
    // If it is, return the custom country details with metadataAvailable set to false and source set to "database". 
    // If it is not a custom country, proceed to fetch the country details as usual.
    if (isDatabaseEnabled()) {
        try {
            const result = await pool.query(
                "SELECT * FROM Country WHERE slug = $1 AND is_custom = true",
                [req.params.slug]
            );
            if (result.rows.length > 0) {
                const c = result.rows[0];
                return res.json({
                    slug: c.slug,
                    metadataAvailable: false,
                    source: "database",
                    country: { name: c.name, id: c.id, is_custom: true },
                    detailedCountryInfo: null,
                    happiness: [],
                    population: null,
                    weather: null,
                    airQuality: null,
                    earthquakes: [],
                    cache: null,
                });
            }
        } catch (error) {
            console.error("Error checking custom country:", error.message);
        }
    }

    const country = await getCountryDetails(req.params.slug);

    if (!country) {
        return res.status(404).json({ error: "Country not found" });
    }

    res.json(country);
});

// route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/country/:slug", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "country.html"));
});

if (require.main === module) {
    if (isDatabaseEnabled()) {
        initializeDatabase().catch((error) => {
            console.error("Failed to initialize database cache:", error.message);
        });
    }

    app.listen(PORT, APP_HOST, () => {
        console.log(`Server running on http://${APP_HOST}:${PORT}`);
    });
}

app.post("/api/countries", async (req, res) => {
    // Users create a new country by sending a POST request to /api/countries with a JSON body containing the country name, e.g., { "name": "New Country" }
    // They are able to give their country a name, but all other details (population, area, etc.) 
    // are set to default values (e.g., population: 0, area: 0).
    const { name } = req.body;

    // Basic error handling: check if the name is provided
    if (!name) {
        return res.status(400).json({ error: "Country name is required" });
    }

    try {
        // Insert the new country into the database with default values
        const resultingQuery = await pool.query(
            "INSERT INTO Country (name, slug, region, continents, languages, is_custom) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [name, name.toLowerCase().replace(/\s+/g, "-"),"Unknown", "Unknown", "Unknown", true]
        );
        // Return the newly created country details in the response
        res.json(resultingQuery.rows[0]);

    } catch (error) {
        console.error("Error creating country:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.put("/api/countries/:id", async (req, res) => {
    // Users update an existing country by sending a PUT request to /api/countries/:id with a JSON body containing the fields they want to update, e.g., { "population": 1000000 }
    const { id } = req.params;
    const { name } = req.body;

    // Basic error handling: check if the name is provided
    if (!name) {
        return res.status(400).json({ error: "Country name is required" });
    }

    try {
        // Update the country in the database with the provided values
        const resultingQuery = await pool.query(
            "UPDATE Country SET name = $1, slug = $2 WHERE id = $3 RETURNING *",
            [name, name.toLowerCase().replace(/\s+/g, "-"), id]
        );
        // Check if the country was found and updated
        if (resultingQuery.rowCount === 0) {
            return res.status(404).json({ error: "Country not found" });
        }
        // Return the updated country details in the response
        res.json(resultingQuery.rows[0]);

    } catch (error) {
        console.error("Error updating country:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.delete("/api/countries/:id", async (req, res) => {
    // Users delete a country by sending a DELETE request to /api/countries/:id
    const { id } = req.params;

    try {
        // Delete the country from the database
        const resultingQuery = await pool.query(
            "DELETE FROM Country WHERE id = $1 RETURNING *",
            [id]
        );
        // Check if the country was found and deleted
        if (resultingQuery.rowCount === 0) {
            return res.status(404).json({ error: "Country not found" });
        }
        // Return a success message in the response
        res.json({ message: "Country deleted successfully" });

    } catch (error) {
        console.error("Error deleting country:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = app;
