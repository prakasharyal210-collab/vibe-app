const appJson = require("./app.json");
const base = appJson.expo;

module.exports = {
  expo: {
    ...base,
    newArchEnabled: true,
    plugins: [
      ...base.plugins,
    ],
  },
};
