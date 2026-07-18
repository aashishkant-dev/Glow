import { defineConfig, devices } from '@playwright/test';

/**
 * TEACHING: defineConfig() is where you tell Playwright HOW to run tests.
 * baseURL: every page.goto('/foo') becomes baseURL + '/foo'
 * testDir: where Playwright looks for test files
 */
export default defineConfig({
  testDir: './tests',

  // How long one full test can take before it's killed
  timeout: 30_000,

  // How long one expect() call can wait for a condition to be true
  expect: { timeout: 10_000 },

  // Run tests in parallel across files (each file = its own worker)
  fullyParallel: true,

  // In CI, fail fast if a test fails (no retries wasted on broken deploys)
  forbidOnly: !!process.env.CI,

  // Retry failed tests once in CI — flaky network is real
  retries: process.env.CI ? 1 : 0,

  // One worker in CI (free GitHub runners are single-core), unlimited locally
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],                          // prints each test result to terminal
    ['html', { open: 'never' }],       // saves HTML report to playwright-report/
  ],

  use: {
    /**
     * TEACHING: baseURL is read from the PLAYWRIGHT_BASE_URL env var.
     * In CI this is https://glow.vercel.app
     * Locally run: PLAYWRIGHT_BASE_URL=http://localhost:8081 npx playwright test
     */
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://glow.vercel.app',

    // Capture a screenshot on every test failure — great for debugging
    screenshot: 'only-on-failure',

    // Record a video on first retry — helps diagnose flaky tests
    video: 'on-first-retry',

    // Record DOM snapshots on failure (viewable in HTML report)
    trace: 'on-first-retry',
  },

  projects: [
    {
      /**
       * TEACHING: "projects" = browsers to test against.
       * We use chromium only in CI to keep it fast.
       * Add { name: 'firefox', use: { ...devices['Desktop Firefox'] } } to expand.
       */
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
