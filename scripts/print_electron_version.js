const electron = require('electron');
const app = electron.app || (electron.default && electron.default.app);

if (app) {
  app.whenReady().then(() => {
    console.log(JSON.stringify({
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8,
      arch: process.arch,
      platform: process.platform
    }, null, 2));
    app.exit(0);
  });
} else {
  console.log(JSON.stringify({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    arch: process.arch,
    platform: process.platform,
    directKeys: Object.keys(electron)
  }, null, 2));
  process.exit(0);
}
