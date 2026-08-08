const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Stages a newly uploaded file into Git tracking if Git is initialized.
 * @param {string} relativeOrAbsolutePath - Path to uploaded image file.
 */
function stageUploadedFile(relativeOrAbsolutePath) {
  try {
    const backendRoot = path.join(__dirname, '..');
    let targetPath = relativeOrAbsolutePath;

    if (path.isAbsolute(relativeOrAbsolutePath)) {
      targetPath = path.relative(backendRoot, relativeOrAbsolutePath);
    }

    const fullPath = path.join(backendRoot, targetPath);
    if (!fs.existsSync(fullPath)) return;

    // Run git add asynchronously without blocking API response
    exec(`git add "${targetPath}"`, { cwd: backendRoot }, (error, stdout, stderr) => {
      if (error) {
        // Git repo might not be initialized yet, log warning silently
        return;
      }
      console.log(`📸 Product image staged for Git tracking: ${targetPath}`);
    });
  } catch (err) {
    // Ignore non-fatal git errors
  }
}

module.exports = {
  stageUploadedFile,
};
