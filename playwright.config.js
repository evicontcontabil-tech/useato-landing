// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/* Landing de um arquivo só: nada de servidor, nada de baseURL — os testes abrem o `index.html`
   por `file://`. Chromium basta: o que se verifica é o contrato com o pixel e a navegação, não
   compatibilidade entre motores. */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
