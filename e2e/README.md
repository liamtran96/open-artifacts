# Browser lifecycle tests

Playwright tests for the runtime bridge and editor lifecycle live here, per the implementation plan's verification strategy. The matrix is defined in `playwright.config.ts` from decision 0001.

Slice 1 adds the first tests once the HTML and React examples exist. Until then `pnpm e2e` passes with no tests.
