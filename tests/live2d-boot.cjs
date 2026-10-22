const { app } = require("electron");
if (!process.env.PET_TEST_DATA) throw new Error("Isolated test data required");
app.setPath("userData", process.env.PET_TEST_DATA);
require("../src/main");
