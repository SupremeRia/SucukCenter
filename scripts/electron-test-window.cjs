// Source and packaged tests must wait for the real main window, never drive the splash.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
module.exports.mainWindow = async function mainWindow(app) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (!page.url().startsWith('file:') || !page.url().includes('/index.html')) continue;
      const native = await app.browserWindow(page);
      if (await native.evaluate((w) => w.isVisible())) return page;
    }
    await delay(100);
  }
  throw new Error('Ana uygulama penceresi hazırlık süresinde açılmadı.');
};
