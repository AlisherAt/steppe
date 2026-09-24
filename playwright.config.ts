import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    env: {
      STEPPE_E2E: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_PROVIDER: 'seatable',
      SEATABLE_API_TOKEN: '',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      KICKS_API_KEY: '',
      ADDITIONAL_SOURCES_JSON: '[]',
      CRON_SECRET: 'steppe-test-only-not-a-production-secret',
    },
    timeout: 120000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
