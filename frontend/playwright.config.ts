import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const python = process.env.LIGOU_PYTHON ?? (process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python');
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1,
  timeout: 30000, expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: `${existsSync(python) ? '"'+python+'"' : 'python'} -m uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8000`, url: 'http://127.0.0.1:8000/api/health', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  ],
});
