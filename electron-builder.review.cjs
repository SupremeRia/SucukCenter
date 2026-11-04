const config = require('./package.json').build;
module.exports = {
  ...config,
  appId: 'com.sucukcenter.review-test',
  productName: 'SucukCenterReview',
  directories: { output: 'review-builds/runtime-test' },
  files: [
    ...config.files,
    'dist-electron/tests/review-main.js',
    'dist-electron/tests/splash-probe.js',
  ],
  extraMetadata: { main: 'dist-electron/tests/review-main.js' },
};
