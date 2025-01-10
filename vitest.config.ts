import { defineConfig } from 'vite'

export default defineConfig({
    test: {
      forceRerunTriggers : [
        './test/math.yml',
        './test/symbol.yml',
        './test/integration-cases.yml',
        './test/cheat-sheet.toml',
      ],
    }
  });
