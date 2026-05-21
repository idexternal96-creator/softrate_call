const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const rootEnvPath = [
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '.env'),
].find((candidate) => fs.existsSync(candidate));

dotenv.config(rootEnvPath ? { path: rootEnvPath } : undefined);

module.exports = { rootEnvPath };
