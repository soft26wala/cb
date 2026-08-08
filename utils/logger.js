const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });

const logInfo = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[INFO] [${timestamp}] ${message}`);
};

const logError = (message, err) => {
  const timestamp = new Date().toISOString();
  console.error(`[ERROR] [${timestamp}] ${message}`, err || '');
};

module.exports = {
  accessLogStream,
  logInfo,
  logError,
};
