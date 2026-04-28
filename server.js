const express = require("express");
const path = require("path");
require("dotenv").config();
const {
  getCountryDetails,
  listCountries,
  searchCountries,
} = require("./src/countryData");
const { initializeDatabase, isDatabaseEnabled } = require("./src/db");

const app = express();
const PORT = Number(process.env.APP_PORT || 3000);
const APP_HOST = process.env.APP_HOST || "127.0.0.1";

// static files
app.use(express.static(path.join(__dirname, "public")));

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

module.exports = app;
