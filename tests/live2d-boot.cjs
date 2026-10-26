const { app } = require("electron");
const path = require("node:path");
if (!process.env.PET_TEST_DATA) throw new Error("Isolated test data required");
app.setPath("userData", process.env.PET_TEST_DATA);
require(path.join(process.env.PET_SMOKE_APP || path.join(__dirname, ".."), "src/main.js"));
