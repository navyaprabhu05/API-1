require("dotenv").config();
const app = require("./index");
const PORT = 3000;

app.listen(PORT, () => {
  console.log(`✅ Local API running at http://localhost:${PORT}`);
});
