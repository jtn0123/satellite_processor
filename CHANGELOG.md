## [1.16.2](https://github.com/jtn0123/satellite_processor/compare/v1.16.1...v1.16.2) (2026-02-22)


### Bug Fixes

* UX polish — image error placeholder enhancement ([#203](https://github.com/jtn0123/satellite_processor/issues/203)) ([a93f5b8](https://github.com/jtn0123/satellite_processor/commit/a93f5b881fa23b118f2ef232e641f24f73feff0d)), closes [#14](https://github.com/jtn0123/satellite_processor/issues/14) [#55](https://github.com/jtn0123/satellite_processor/issues/55)

## [1.16.1](https://github.com/jtn0123/satellite_processor/compare/v1.16.0...v1.16.1) (2026-02-22)


### Bug Fixes

* security hardening — shared frame path validation & API key warning ([#202](https://github.com/jtn0123/satellite_processor/issues/202)) ([83dfae8](https://github.com/jtn0123/satellite_processor/commit/83dfae8a8f693b231b6500f4e9e388c541300b69)), closes [#5](https://github.com/jtn0123/satellite_processor/issues/5) [#50](https://github.com/jtn0123/satellite_processor/issues/50)

# [1.16.0](https://github.com/jtn0123/satellite_processor/compare/v1.15.6...v1.16.0) (2026-02-22)


### Features

* Live View proxy-through mode — show latest satellite imagery without local fetch ([#201](https://github.com/jtn0123/satellite_processor/issues/201)) ([1787a4a](https://github.com/jtn0123/satellite_processor/commit/1787a4aa265e4c4b2e04f826016e2ebfcc1b9426))

## [1.15.6](https://github.com/jtn0123/satellite_processor/compare/v1.15.5...v1.15.6) (2026-02-22)


### Bug Fixes

* add no-cache headers on HTML and CORS on static assets ([#200](https://github.com/jtn0123/satellite_processor/issues/200)) ([2137dff](https://github.com/jtn0123/satellite_processor/commit/2137dffb48f834f644f0e0edc09b75497c430283))

## [1.15.5](https://github.com/jtn0123/satellite_processor/compare/v1.15.4...v1.15.5) (2026-02-22)


### Bug Fixes

* streaming ZIP downloads to prevent OOM ([#198](https://github.com/jtn0123/satellite_processor/issues/198)) ([6705f4f](https://github.com/jtn0123/satellite_processor/commit/6705f4fcc3b2f59e637c2fef80e8c777c65d8ec9))

## [1.15.4](https://github.com/jtn0123/satellite_processor/compare/v1.15.3...v1.15.4) (2026-02-22)


### Bug Fixes

* backend cleanup — pagination, TODO removal, tests ([#197](https://github.com/jtn0123/satellite_processor/issues/197)) ([4f3eb36](https://github.com/jtn0123/satellite_processor/commit/4f3eb3657555cd6e3003b94e591866ff2cae2d3a))

## [1.15.3](https://github.com/jtn0123/satellite_processor/compare/v1.15.2...v1.15.3) (2026-02-22)


### Bug Fixes

* Live View empty state & error toast dedup ([#199](https://github.com/jtn0123/satellite_processor/issues/199)) ([4bc71f4](https://github.com/jtn0123/satellite_processor/commit/4bc71f4a460235c053822ef7ff9ac04ffa3df63e))

## [1.15.2](https://github.com/jtn0123/satellite_processor/compare/v1.15.1...v1.15.2) (2026-02-22)


### Bug Fixes

* wire Settings defaults to routers (dead code fix) ([#196](https://github.com/jtn0123/satellite_processor/issues/196)) ([fa8ea57](https://github.com/jtn0123/satellite_processor/commit/fa8ea577a61ebb12685e4e321fd9296e3e397a39))

## [1.15.1](https://github.com/jtn0123/satellite_processor/compare/v1.15.0...v1.15.1) (2026-02-22)


### Bug Fixes

* resolve dependency security vulnerabilities ([#195](https://github.com/jtn0123/satellite_processor/issues/195)) ([a384b61](https://github.com/jtn0123/satellite_processor/commit/a384b61b275d7ee1ab3020aca347c627beeace36)), closes [hi#severity](https://github.com/hi/issues/severity)

# [1.15.0](https://github.com/jtn0123/satellite_processor/compare/v1.14.0...v1.15.0) (2026-02-22)


### Features

* expand integration E2E — websocket, image rendering, delete, animation pipeline, API errors, settings, theme ([#192](https://github.com/jtn0123/satellite_processor/issues/192)) ([30b53e5](https://github.com/jtn0123/satellite_processor/commit/30b53e5b2a96e5efbae6c4a9d2947f8e75e794ac))

# [1.14.0](https://github.com/jtn0123/satellite_processor/compare/v1.13.1...v1.14.0) (2026-02-22)


### Features

* expand integration E2E suite (v2) ([#190](https://github.com/jtn0123/satellite_processor/issues/190)) ([8e5043d](https://github.com/jtn0123/satellite_processor/commit/8e5043dccee4e476d8f0d9005bcef02237b57bdf))

## [1.13.1](https://github.com/jtn0123/satellite_processor/compare/v1.13.0...v1.13.1) (2026-02-21)


### Bug Fixes

* upgrade Pillow 12.1.0 → 12.1.1 (CVE-2026-25990) + IP logging privacy notes ([#187](https://github.com/jtn0123/satellite_processor/issues/187)) ([526d6a3](https://github.com/jtn0123/satellite_processor/commit/526d6a323b1827838c334b78f7a4b7203f675ca0))

# [1.13.0](https://github.com/jtn0123/satellite_processor/compare/v1.12.0...v1.13.0) (2026-02-21)


### Features

* wide event logging, error collection endpoint & dashboard ([#185](https://github.com/jtn0123/satellite_processor/issues/185)) ([4f0dba8](https://github.com/jtn0123/satellite_processor/commit/4f0dba8ab03d4f3a2e59feffc9319bd2b85f2fc4))

# [1.12.0](https://github.com/jtn0123/satellite_processor/compare/v1.11.12...v1.12.0) (2026-02-20)


### Features

* wire errorReporter into all error surfaces ([#183](https://github.com/jtn0123/satellite_processor/issues/183)) ([0a42892](https://github.com/jtn0123/satellite_processor/commit/0a4289239725b9584e9e56937cada57ddd597214))

## [1.11.12](https://github.com/jtn0123/satellite_processor/compare/v1.11.11...v1.11.12) (2026-02-20)


### Bug Fixes

* raise coverage gates and annotate low-value test files ([#41](https://github.com/jtn0123/satellite_processor/issues/41), [#43](https://github.com/jtn0123/satellite_processor/issues/43)) ([#179](https://github.com/jtn0123/satellite_processor/issues/179)) ([97804a1](https://github.com/jtn0123/satellite_processor/commit/97804a1d737fc0456f37d69ca691e86ca64f1b22)), closes [#42](https://github.com/jtn0123/satellite_processor/issues/42)

## [1.11.11](https://github.com/jtn0123/satellite_processor/compare/v1.11.10...v1.11.11) (2026-02-20)


### Bug Fixes

* Batch 5 UX polish — empty states, mobile filters, touch targets, API consistency ([#178](https://github.com/jtn0123/satellite_processor/issues/178)) ([b477b64](https://github.com/jtn0123/satellite_processor/commit/b477b648ce690a18ca8054a71bf983d0b4260fa8)), closes [#25](https://github.com/jtn0123/satellite_processor/issues/25)

## [1.11.10](https://github.com/jtn0123/satellite_processor/compare/v1.11.9...v1.11.10) (2026-02-20)


### Bug Fixes

* Batch 4 — Backend Robustness & Error Handling ([#177](https://github.com/jtn0123/satellite_processor/issues/177)) ([d44ac67](https://github.com/jtn0123/satellite_processor/commit/d44ac67aff046f42206b02dc33a093ef7c11ece5))

## [1.11.9](https://github.com/jtn0123/satellite_processor/compare/v1.11.8...v1.11.9) (2026-02-20)


### Bug Fixes

* Batch 3 — Accessibility & UX Polish ([#176](https://github.com/jtn0123/satellite_processor/issues/176)) ([2ee8b0a](https://github.com/jtn0123/satellite_processor/commit/2ee8b0a9765d62c3ea9f0bf735c33c77ee3ad788)), closes [#39](https://github.com/jtn0123/satellite_processor/issues/39)

## [1.11.8](https://github.com/jtn0123/satellite_processor/compare/v1.11.7...v1.11.8) (2026-02-20)


### Bug Fixes

* Batch 2 — High-Impact Polish ([#175](https://github.com/jtn0123/satellite_processor/issues/175)) ([927754e](https://github.com/jtn0123/satellite_processor/commit/927754e0d25b66fdb2f373e399f1c4781b6fb9fe)), closes [Hi#Impact](https://github.com/Hi/issues/Impact) [hi#impact](https://github.com/hi/issues/impact) [#8](https://github.com/jtn0123/satellite_processor/issues/8) [#14](https://github.com/jtn0123/satellite_processor/issues/14) [#17](https://github.com/jtn0123/satellite_processor/issues/17) [#22](https://github.com/jtn0123/satellite_processor/issues/22) [#24](https://github.com/jtn0123/satellite_processor/issues/24) [#56](https://github.com/jtn0123/satellite_processor/issues/56) [#9](https://github.com/jtn0123/satellite_processor/issues/9) [#10](https://github.com/jtn0123/satellite_processor/issues/10)

## [1.11.7](https://github.com/jtn0123/satellite_processor/compare/v1.11.6...v1.11.7) (2026-02-20)


### Bug Fixes

* batch 1 critical & high-value fixes ([#174](https://github.com/jtn0123/satellite_processor/issues/174)) ([064d5e4](https://github.com/jtn0123/satellite_processor/commit/064d5e4062567eb28f8c910f46cccd45a4f6d8ff)), closes [1/#2](https://github.com/jtn0123/satellite_processor/issues/2) [#13](https://github.com/jtn0123/satellite_processor/issues/13) [45/#21](https://github.com/jtn0123/satellite_processor/issues/21) [#5](https://github.com/jtn0123/satellite_processor/issues/5) [#30](https://github.com/jtn0123/satellite_processor/issues/30) [#50](https://github.com/jtn0123/satellite_processor/issues/50) [#23](https://github.com/jtn0123/satellite_processor/issues/23)

## [1.11.6](https://github.com/jtn0123/satellite_processor/compare/v1.11.5...v1.11.6) (2026-02-19)


### Bug Fixes

* 24-bug comprehensive sweep (round 3) ([#171](https://github.com/jtn0123/satellite_processor/issues/171)) ([1d9ae07](https://github.com/jtn0123/satellite_processor/commit/1d9ae072c015ee05c8f58ca620adc1194512a42b))

## [1.11.5](https://github.com/jtn0123/satellite_processor/compare/v1.11.4...v1.11.5) (2026-02-19)


### Bug Fixes

* 10 production bugs + API contract validation ([#170](https://github.com/jtn0123/satellite_processor/issues/170)) ([ab7aa2a](https://github.com/jtn0123/satellite_processor/commit/ab7aa2a6b73d7bcbf1381ee2be78e0afbab3f15c))

## [1.11.4](https://github.com/jtn0123/satellite_processor/compare/v1.11.3...v1.11.4) (2026-02-19)


### Bug Fixes

* 40-item bug & polish sweep ([#169](https://github.com/jtn0123/satellite_processor/issues/169)) ([6e5a8a9](https://github.com/jtn0123/satellite_processor/commit/6e5a8a9c7589e5f5e1ed500f87786330025c9fa6))

## [1.11.3](https://github.com/jtn0123/satellite_processor/compare/v1.11.2...v1.11.3) (2026-02-19)


### Bug Fixes

* bug sweep — mobile nav, live view, fetch, and 10+ fixes ([#168](https://github.com/jtn0123/satellite_processor/issues/168)) ([ab585a0](https://github.com/jtn0123/satellite_processor/commit/ab585a0cc60b87f28278eaab1505df68810cfdff))

## [1.11.2](https://github.com/jtn0123/satellite_processor/compare/v1.11.1...v1.11.2) (2026-02-19)


### Bug Fixes

* **ci:** holistic SonarQube coverage pipeline fix ([#167](https://github.com/jtn0123/satellite_processor/issues/167)) ([24f3885](https://github.com/jtn0123/satellite_processor/commit/24f38854512ab4aff6e98fd03cd4cf8dcb933520))

## [1.11.1](https://github.com/jtn0123/satellite_processor/compare/v1.11.0...v1.11.1) (2026-02-19)


### Bug Fixes

* **ci:** add core coverage upload and carry forward coverage across skipped tests ([#165](https://github.com/jtn0123/satellite_processor/issues/165)) ([a66f844](https://github.com/jtn0123/satellite_processor/commit/a66f84422267b6cf739434716a117bd6b18a49af))

# [1.11.0](https://github.com/jtn0123/satellite_processor/compare/v1.10.0...v1.11.0) (2026-02-18)


### Bug Fixes

* correct Live View fetch field names and mobile layout ([#158](https://github.com/jtn0123/satellite_processor/issues/158)) ([72875d2](https://github.com/jtn0123/satellite_processor/commit/72875d2666ad2319884d4841e9c2d2fdc30af7e9))


### Features

* monitor mode + smart fetch ([#157](https://github.com/jtn0123/satellite_processor/issues/157)) ([052d160](https://github.com/jtn0123/satellite_processor/commit/052d16011b7c1acbd9d45b278d360f84205e4bc6))

# [1.10.0](https://github.com/jtn0123/satellite_processor/compare/v1.9.0...v1.10.0) (2026-02-18)


### Bug Fixes

* use self-hosted runner for Portainer deploy and remove [skip ci] from release commits ([#151](https://github.com/jtn0123/satellite_processor/issues/151)) ([b27ddbe](https://github.com/jtn0123/satellite_processor/commit/b27ddbef57cf8eee615c6e3b968ba51d769e744f))


### Features

* progressive disclosure — frame actions, lazy loading, batch bar ([#156](https://github.com/jtn0123/satellite_processor/issues/156)) ([3c02af3](https://github.com/jtn0123/satellite_processor/commit/3c02af317b8ce2365814d17ffcca4046f8d7cc23))

# [1.9.0](https://github.com/jtn0123/satellite_processor/compare/v1.8.0...v1.9.0) (2026-02-18)


### Features

* mobile bottom nav + responsive polish ([#147](https://github.com/jtn0123/satellite_processor/issues/147)) ([1b11f6c](https://github.com/jtn0123/satellite_processor/commit/1b11f6cb3ac776e87e7aead7684da809812a93ec))

# [1.8.0](https://github.com/jtn0123/satellite_processor/compare/v1.7.2...v1.8.0) (2026-02-18)


### Features

* one-click Fetch Latest + simplified quick fetch mode ([#144](https://github.com/jtn0123/satellite_processor/issues/144)) ([47aa8d9](https://github.com/jtn0123/satellite_processor/commit/47aa8d989e729e6ae495fcbffb5b124ac1c7f7e1))

## [1.7.2](https://github.com/jtn0123/satellite_processor/compare/v1.7.1...v1.7.2) (2026-02-18)


### Bug Fixes

* Live View polish + comprehensive fetch/live testing ([#143](https://github.com/jtn0123/satellite_processor/issues/143)) ([148eab4](https://github.com/jtn0123/satellite_processor/commit/148eab4966f5523ae2c60a9f738b25ff8be51864))

## [1.7.1](https://github.com/jtn0123/satellite_processor/compare/v1.7.0...v1.7.1) (2026-02-18)


### Bug Fixes

* resolve all SonarQube issues + inline sonar pipeline ([#141](https://github.com/jtn0123/satellite_processor/issues/141)) ([4d71953](https://github.com/jtn0123/satellite_processor/commit/4d71953accd5cfcf972a1a703a8be8507864b0e0))

# [1.7.0](https://github.com/jtn0123/satellite_processor/compare/v1.6.2...v1.7.0) (2026-02-18)


### Features

* Phase 3 — production hardening ([#137](https://github.com/jtn0123/satellite_processor/issues/137)) ([2b03e7d](https://github.com/jtn0123/satellite_processor/commit/2b03e7d2e6b1efbedebd1a6ee3c4c7f4b42746ff))

## [1.6.2](https://github.com/jtn0123/satellite_processor/compare/v1.6.1...v1.6.2) (2026-02-18)


### Bug Fixes

* resolve SonarQube issues — a11y, code smells, test assertions ([#136](https://github.com/jtn0123/satellite_processor/issues/136)) ([91016a0](https://github.com/jtn0123/satellite_processor/commit/91016a05db0120a28c864bdfb94692a968061a71))

## [1.6.1](https://github.com/jtn0123/satellite_processor/compare/v1.6.0...v1.6.1) (2026-02-18)


### Bug Fixes

* phase 1 quick wins — coverage upload, npm audit, test assertions, system info cache, API memory limit ([#134](https://github.com/jtn0123/satellite_processor/issues/134)) ([2e5d7eb](https://github.com/jtn0123/satellite_processor/commit/2e5d7eb938e67c4880d17a5601c638983d5bb902))

# [1.6.0](https://github.com/jtn0123/satellite_processor/compare/v1.5.0...v1.6.0) (2026-02-18)


### Features

* Live View Polish — Batch A (stale warnings, job names, fetch progress, band availability) ([#133](https://github.com/jtn0123/satellite_processor/issues/133)) ([3f8c045](https://github.com/jtn0123/satellite_processor/commit/3f8c0459ce9e28ecc5552fc3d3e6d981401737f2))
* **live:** frame comparison, catalog loading, pinch-to-zoom, metadata toggle ([#132](https://github.com/jtn0123/satellite_processor/issues/132)) ([a88d1c0](https://github.com/jtn0123/satellite_processor/commit/a88d1c0e9722d4080fcdb82c2e0b1dd097e1ac5e))

# [1.5.0](https://github.com/jtn0123/satellite_processor/compare/v1.4.2...v1.5.0) (2026-02-17)


### Features

* GOES tabs polish — hidden tabs, MapTab fixes, dashboard optimization, GapsTab backfill ([#131](https://github.com/jtn0123/satellite_processor/issues/131)) ([3be3557](https://github.com/jtn0123/satellite_processor/commit/3be3557b9e09253a28a2ad92dba44becb60d40b5))

## [1.4.2](https://github.com/jtn0123/satellite_processor/compare/v1.4.1...v1.4.2) (2026-02-17)


### Bug Fixes

* add /api/download endpoint for serving data files (images, thumbnails) ([#130](https://github.com/jtn0123/satellite_processor/issues/130)) ([5c2f75a](https://github.com/jtn0123/satellite_processor/commit/5c2f75a711fb102663d6c1613489e4ec8c286017))

## [1.4.1](https://github.com/jtn0123/satellite_processor/compare/v1.4.0...v1.4.1) (2026-02-17)


### Bug Fixes

* Debug run bugs — settings, stale jobs, gaps, rate limiting, pagination, partial status ([#128](https://github.com/jtn0123/satellite_processor/issues/128)) ([c040d13](https://github.com/jtn0123/satellite_processor/commit/c040d13dd8153c209fb0c2631e3b93e071ebb037))

# [1.4.0](https://github.com/jtn0123/satellite_processor/compare/v1.3.0...v1.4.0) (2026-02-17)


### Bug Fixes

* critical bugs + Live tab polish ([#126](https://github.com/jtn0123/satellite_processor/issues/126)) ([91a4c67](https://github.com/jtn0123/satellite_processor/commit/91a4c67a547a8b5e10bcb297f1c6da5458c0c4bd))


### Features

* Dynamic Availability + Preview Thumbnails + Medium Polish ([#127](https://github.com/jtn0123/satellite_processor/issues/127)) ([b342a3c](https://github.com/jtn0123/satellite_processor/commit/b342a3c337cc2666d754becb4b4c0b3e0b116f9e))

# [1.3.0](https://github.com/jtn0123/satellite_processor/compare/v1.2.0...v1.3.0) (2026-02-17)


### Features

* add Quick Compare floating bar, mobile bottom sheet filters, swipe tabs, and pull-to-refresh ([#125](https://github.com/jtn0123/satellite_processor/issues/125)) ([6232019](https://github.com/jtn0123/satellite_processor/commit/6232019cc198ac08a433790a355b00b4b8846f6c))

# [1.2.0](https://github.com/jtn0123/satellite_processor/compare/v1.1.1...v1.2.0) (2026-02-17)


### Features

* Tab Consolidation (12→7) + Overview Dashboard + Live Tab Enhancement ([#124](https://github.com/jtn0123/satellite_processor/issues/124)) ([c91486b](https://github.com/jtn0123/satellite_processor/commit/c91486b228a631d68737d0038c08b90b7bdb0336))

## [1.1.1](https://github.com/jtn0123/satellite_processor/compare/v1.1.0...v1.1.1) (2026-02-17)


### Bug Fixes

* prevent crash from changelog endpoint IndexError in Docker ([2542c08](https://github.com/jtn0123/satellite_processor/commit/2542c08e3a9ebe892156e10e98ec1e9dc65d6689))

# [1.1.0](https://github.com/jtn0123/satellite_processor/compare/v1.0.2...v1.1.0) (2026-02-17)


### Features

* GOES fetch overhaul — catalog API, 3-step wizard, band/sector pickers, progress bar ([#123](https://github.com/jtn0123/satellite_processor/issues/123)) ([0b5eaa0](https://github.com/jtn0123/satellite_processor/commit/0b5eaa08ba9134dd388ce91e8ac147d5a33a0f66))

## [1.0.2](https://github.com/jtn0123/satellite_processor/compare/v1.0.1...v1.0.2) (2026-02-17)


### Bug Fixes

* resolve all remaining SonarQube frontend issues ([#120](https://github.com/jtn0123/satellite_processor/issues/120)) ([a746bc2](https://github.com/jtn0123/satellite_processor/commit/a746bc208c3ab38087caef6c64847af696a92d0d))

## [1.0.1](https://github.com/jtn0123/satellite_processor/compare/v1.0.0...v1.0.1) (2026-02-16)


### Bug Fixes

* resolve remaining SonarQube leftovers ([#119](https://github.com/jtn0123/satellite_processor/issues/119)) ([a195fb2](https://github.com/jtn0123/satellite_processor/commit/a195fb2711b74ff2f7a9a2dea77f669e1d03a641))

# 1.0.0 (2026-02-16)


### Bug Fixes

* add missing Alembic migration for composites table ([#85](https://github.com/jtn0123/satellite_processor/issues/85)) ([a7f98a7](https://github.com/jtn0123/satellite_processor/commit/a7f98a789e6707b7797e9393dfcef4ad7804bf8a))
* add missing Alembic migration for jobs.name column ([#84](https://github.com/jtn0123/satellite_processor/issues/84)) ([194d4de](https://github.com/jtn0123/satellite_processor/commit/194d4de347e1a217de7912ce04f3ee11614c4260))
* add missing path_validation utility module ([ef08ab3](https://github.com/jtn0123/satellite_processor/commit/ef08ab395de09aef9b64cece2359ebd6c6206815))
* add missing tasks/helpers module causing fetch tab error ([#93](https://github.com/jtn0123/satellite_processor/issues/93)) ([5cc5e86](https://github.com/jtn0123/satellite_processor/commit/5cc5e86be11f10129bbbeb5979f5e598eacf0fed))
* add retry logic to entrypoint and try/except to migration for concurrent container startup ([42eadc3](https://github.com/jtn0123/satellite_processor/commit/42eadc314177e848d23f09bcc4dff6c0c9f211aa))
* add UTC timezone to parsed scan times for tz-aware comparison ([7fc3b21](https://github.com/jtn0123/satellite_processor/commit/7fc3b21d06618c051343a7e31259c7dbcd82f252))
* append Z to naive datetime strings so browser doesn't reinterpret as local time ([378d170](https://github.com/jtn0123/satellite_processor/commit/378d17052cd2d4101851d5c046f39e2f3183d8d6))
* append Z to naive datetime strings so browser doesn't reinterpret as local time ([#73](https://github.com/jtn0123/satellite_processor/issues/73)) ([ff162fc](https://github.com/jtn0123/satellite_processor/commit/ff162fc0218ec18ae1c4472778bab023c39002fa))
* architecture improvements — consistent responses, settings to DB ([#90](https://github.com/jtn0123/satellite_processor/issues/90)) ([3673822](https://github.com/jtn0123/satellite_processor/commit/36738221033bdcc1e4a83303b8b561a7b52e16ea))
* backend quality improvements — deduplicate helpers, fix security & bugs ([#89](https://github.com/jtn0123/satellite_processor/issues/89)) ([0e77498](https://github.com/jtn0123/satellite_processor/commit/0e77498636d596392e5621189410e256e90d8a6a))
* comprehensive improvements from audit (28 items) ([#88](https://github.com/jtn0123/satellite_processor/issues/88)) ([a5abed9](https://github.com/jtn0123/satellite_processor/commit/a5abed9fac53a1f29311b886ebbdb8cf366a5f4f))
* configurable frame cap handling with improved status reporting ([#98](https://github.com/jtn0123/satellite_processor/issues/98)) ([71091f7](https://github.com/jtn0123/satellite_processor/commit/71091f7872798353e71a1b82f3422c84a2adc2f4))
* dark mode card backgrounds not applying ([#76](https://github.com/jtn0123/satellite_processor/issues/76)) ([133a009](https://github.com/jtn0123/satellite_processor/commit/133a0091f0cba4a0091bb58aea63849298390783))
* dashboard crash — API response shape mismatch ([#81](https://github.com/jtn0123/satellite_processor/issues/81)) ([a9bf87a](https://github.com/jtn0123/satellite_processor/commit/a9bf87ac6100c7a214c5040e4b891f90622fedd8))
* Dashboard UI regressions — missing sections and job card styling ([#99](https://github.com/jtn0123/satellite_processor/issues/99)) ([6c06a01](https://github.com/jtn0123/satellite_processor/commit/6c06a012959d11546299134a5f4a11104af303a4))
* datetime timezone mismatch causing 500 on GOES fetch ([#42](https://github.com/jtn0123/satellite_processor/issues/42)) ([c7f11b8](https://github.com/jtn0123/satellite_processor/commit/c7f11b8b3125b2d7f568eb6d6284a17001f73c8b))
* defensive coding audit — Browse crash, null guards, 469 tests ([2dfb26b](https://github.com/jtn0123/satellite_processor/commit/2dfb26ba14a21efd3d87bec4f514daea240b3df0))
* downsample FullDisk NetCDF to prevent OOM (4GB → 500MB) ([#78](https://github.com/jtn0123/satellite_processor/issues/78)) ([3988c82](https://github.com/jtn0123/satellite_processor/commit/3988c824e976a11e8c5dafb577b7ea2959bce1dc))
* enable git credentials for semantic-release push ([d5da7b0](https://github.com/jtn0123/satellite_processor/commit/d5da7b04bca5169f7c3cf7c0500000cfbf451d56))
* entrypoint passes command through for worker container ([#31](https://github.com/jtn0123/satellite_processor/issues/31)) ([5d33811](https://github.com/jtn0123/satellite_processor/commit/5d33811f5147c3f8aa92363a22167cceb327ef60))
* handle shorter Docker paths in sys.path.insert ([e0bb22a](https://github.com/jtn0123/satellite_processor/commit/e0bb22ab78b30ef06cbc150760e65ba9703284fa))
* install semantic-release plugins at repo root ([56a9de5](https://github.com/jtn0123/satellite_processor/commit/56a9de5551d69e68992a0d8c428affc6606d758d))
* make jobs.name migration idempotent for existing databases ([3405bb2](https://github.com/jtn0123/satellite_processor/commit/3405bb281979f3868c888ee47db2d04dc8f125e8))
* make migrations idempotent for create_all() race ([#86](https://github.com/jtn0123/satellite_processor/issues/86)) ([e40ba6e](https://github.com/jtn0123/satellite_processor/commit/e40ba6efda48f2794c1b05db42e45c6e195263bf))
* mark GOES fetch jobs as failed when 0 frames found instead of false success ([9525c53](https://github.com/jtn0123/satellite_processor/commit/9525c53c960ab464ac504a3b2234ec17c189dc9c))
* mark partial GOES downloads as failed (only full downloads succeed) ([b193ca5](https://github.com/jtn0123/satellite_processor/commit/b193ca5a59a1eb57172c4289f773cf022b700126))
* nginx injects API key header on proxied requests (defense in depth) ([ed6486d](https://github.com/jtn0123/satellite_processor/commit/ed6486d6014526fd27888a5ed299742987523ac0))
* register animation task, fix WS auth, fix data dir permissions ([#87](https://github.com/jtn0123/satellite_processor/issues/87)) ([fdb8447](https://github.com/jtn0123/satellite_processor/commit/fdb844785b612187f7cd1b86a352adeb304a988c))
* remaining 7 audit items ([#91](https://github.com/jtn0123/satellite_processor/issues/91)) ([7d9e830](https://github.com/jtn0123/satellite_processor/commit/7d9e830feaabe9b753cc29f991738870f72f5097))
* remove unused CheckCircle import ([12c80c9](https://github.com/jtn0123/satellite_processor/commit/12c80c9ef907bdd3a9ddfd140640cf2ed460ab9a))
* replace abstract CSS classes with explicit dark mode classes in Dashboard ([#100](https://github.com/jtn0123/satellite_processor/issues/100)) ([d1405ce](https://github.com/jtn0123/satellite_processor/commit/d1405cebb2d9d75733158a03d134668bf6cf4f01))
* resolve 16 bugs from web modernization audit ([02169a5](https://github.com/jtn0123/satellite_processor/commit/02169a5450cef2b43fb86e32326277d9dfcc58db))
* resolve all 60 findings from Audit [#7](https://github.com/jtn0123/satellite_processor/issues/7) ([#155](https://github.com/jtn0123/satellite_processor/issues/155)-[#214](https://github.com/jtn0123/satellite_processor/issues/214)) ([#24](https://github.com/jtn0123/satellite_processor/issues/24)) ([111a686](https://github.com/jtn0123/satellite_processor/commit/111a686e824f05f75a561709307ae6630c18b1d0)), closes [#193](https://github.com/jtn0123/satellite_processor/issues/193)
* resolve all open SonarQube issues ([#38](https://github.com/jtn0123/satellite_processor/issues/38)) ([a43e256](https://github.com/jtn0123/satellite_processor/commit/a43e25665f924835f28f5c0fe6424d70094dd457)), closes [hi#complexity](https://github.com/hi/issues/complexity)
* resolve all SonarQube issues ([#41](https://github.com/jtn0123/satellite_processor/issues/41)) ([6364b0c](https://github.com/jtn0123/satellite_processor/commit/6364b0cb6b9d89dd0881256e2c7bcaf3bb5aac3f))
* Second audit pass — 20 bug fixes + orphaned improvements ([#6](https://github.com/jtn0123/satellite_processor/issues/6)) ([53cc27c](https://github.com/jtn0123/satellite_processor/commit/53cc27cf918e79c59c409ddb99e2bdd1b755e1f8)), closes [#2](https://github.com/jtn0123/satellite_processor/issues/2) [#7](https://github.com/jtn0123/satellite_processor/issues/7) [#7](https://github.com/jtn0123/satellite_processor/issues/7) [#8](https://github.com/jtn0123/satellite_processor/issues/8) [#9](https://github.com/jtn0123/satellite_processor/issues/9) [#10](https://github.com/jtn0123/satellite_processor/issues/10)
* set task_default_queue to match task_routes (default not celery) ([a5fea40](https://github.com/jtn0123/satellite_processor/commit/a5fea40ef8ad3faa871459cd8175fc092b12edae))
* SonarQube chunk 5 — cognitive complexity + remaining majors ([#30](https://github.com/jtn0123/satellite_processor/issues/30)) ([477d1a3](https://github.com/jtn0123/satellite_processor/commit/477d1a3191666937674baf38d6b2ff33a6ff5f4a))
* SonarQube cleanup — critical + major issues ([#27](https://github.com/jtn0123/satellite_processor/issues/27)) ([565e90e](https://github.com/jtn0123/satellite_processor/commit/565e90edde44b6d14c04af940765db72ef46f9cb)), closes [#6](https://github.com/jtn0123/satellite_processor/issues/6)
* SonarQube cleanup batch 2 — form labels, array keys, code quality ([#28](https://github.com/jtn0123/satellite_processor/issues/28)) ([9cd114b](https://github.com/jtn0123/satellite_processor/commit/9cd114b3a94e56ab3acf2f08d88f568d5d1fd734)), closes [#11](https://github.com/jtn0123/satellite_processor/issues/11) [#7](https://github.com/jtn0123/satellite_processor/issues/7) [#95](https://github.com/jtn0123/satellite_processor/issues/95)
* SonarQube cleanup batch 3 — criticals, blockers, accessibility ([#29](https://github.com/jtn0123/satellite_processor/issues/29)) ([fbc67cc](https://github.com/jtn0123/satellite_processor/commit/fbc67cca9ad9173969323eab5a4757f5fdc0117b)), closes [#28](https://github.com/jtn0123/satellite_processor/issues/28) [#8-10](https://github.com/jtn0123/satellite_processor/issues/8-10) [#16-17](https://github.com/jtn0123/satellite_processor/issues/16-17)
* SonarQube critical/blocker fixes + CI coverage pipeline ([69e070d](https://github.com/jtn0123/satellite_processor/commit/69e070dc528d3dfed9e8089f9533f249bcec2576))
* SonarQube full cleanup, shared Modal, 4 CI shards, 595 tests ([#115](https://github.com/jtn0123/satellite_processor/issues/115)) ([94de875](https://github.com/jtn0123/satellite_processor/commit/94de87578f7e5274c8c6dbd840d44be9403cf157))
* UI polish batch 2 — 14 issues addressed ([#25](https://github.com/jtn0123/satellite_processor/issues/25)) ([f8fdb8f](https://github.com/jtn0123/satellite_processor/commit/f8fdb8fb8183717a37d7550e3fccd9e0d820ceb9)), closes [#6](https://github.com/jtn0123/satellite_processor/issues/6) [#17](https://github.com/jtn0123/satellite_processor/issues/17) [#18](https://github.com/jtn0123/satellite_processor/issues/18) [#24](https://github.com/jtn0123/satellite_processor/issues/24)
* **ui:** Comprehensive UI/UX audit — 20 fixes ([#101](https://github.com/jtn0123/satellite_processor/issues/101)) ([c110519](https://github.com/jtn0123/satellite_processor/commit/c110519f532bfa346786380bbc73defbbe5cadc7))
* update sonarqube workflow for workflow_run trigger ([43dd3ef](https://github.com/jtn0123/satellite_processor/commit/43dd3ef686175c347943ca75ad168cb226dd4427))
* update test datetimes to UTC-aware to match goes_fetcher changes ([2e1de77](https://github.com/jtn0123/satellite_processor/commit/2e1de777c74b67b53b36365fe5f1b07be4a0d33c))
* UX polish, GOES fetch DB bug, bump to v1.4.1 ([#74](https://github.com/jtn0123/satellite_processor/issues/74)) ([e381496](https://github.com/jtn0123/satellite_processor/commit/e3814963e24e6a9813efa9928fd6e1ef038c7fac))
* WebSocket 403 errors and GOES fetch FK violation ([#75](https://github.com/jtn0123/satellite_processor/issues/75)) ([76c5b7f](https://github.com/jtn0123/satellite_processor/commit/76c5b7fcbb571ea6169d37761bab1686b7ca0fab)), closes [#76](https://github.com/jtn0123/satellite_processor/issues/76)
* worker stability — prevent OOM on large GOES fetches ([#77](https://github.com/jtn0123/satellite_processor/issues/77)) ([94b9c17](https://github.com/jtn0123/satellite_processor/commit/94b9c179a910f48f2b8059ba68e97ee4ccc57401))


### Features

* add Conventional Commits + semantic-release ([#116](https://github.com/jtn0123/satellite_processor/issues/116)) ([c69a6cb](https://github.com/jtn0123/satellite_processor/commit/c69a6cb477e6dcc8674e8d58eb16eba0f03e1d85))
* add CSS transitions & animations using Tailwind v4 features ([#70](https://github.com/jtn0123/satellite_processor/issues/70)) ([d098900](https://github.com/jtn0123/satellite_processor/commit/d0989009099aa5ba42d8b1ca264ef6b5dcea8cce))
* add issue details to SonarQube PR comment (capped at 20) ([d64f5ab](https://github.com/jtn0123/satellite_processor/commit/d64f5ab9f15380ddf44626d4315125d0e48f15aa))
* add v2.2.0 changelog entry ([4cb5f21](https://github.com/jtn0123/satellite_processor/commit/4cb5f210ed6a16597eb96601393815b954a2f811))
* Animation Studio + Interactive Crop Tool (Phase 2) ([#33](https://github.com/jtn0123/satellite_processor/issues/33)) ([11b2ddd](https://github.com/jtn0123/satellite_processor/commit/11b2dddcbd4631f2ccd65453162b969f8f44c6c6))
* Animation UX Overhaul ([#92](https://github.com/jtn0123/satellite_processor/issues/92)) ([00c883e](https://github.com/jtn0123/satellite_processor/commit/00c883eba5b14ff7ea68037e53f5b6e7eb31c8d8))
* animation/timelapse player for collections ([#83](https://github.com/jtn0123/satellite_processor/issues/83)) ([8e896de](https://github.com/jtn0123/satellite_processor/commit/8e896de359b6cf27132e16cf22746b8325fd5cc3))
* Audit [#3](https://github.com/jtn0123/satellite_processor/issues/3) — security, API, cleanup, UX (53 findings) ([#15](https://github.com/jtn0123/satellite_processor/issues/15)) ([a2073c9](https://github.com/jtn0123/satellite_processor/commit/a2073c9863155d27a4ba8cc329acd6e1f52fd2b4))
* Audit [#4](https://github.com/jtn0123/satellite_processor/issues/4) — critical fixes + remaining cleanup (37 findings) ([#16](https://github.com/jtn0123/satellite_processor/issues/16)) ([4cd0128](https://github.com/jtn0123/satellite_processor/commit/4cd0128bbcd82ed2baf4285058e22a734332df08)), closes [77/#90](https://github.com/jtn0123/satellite_processor/issues/90) [78/#79](https://github.com/jtn0123/satellite_processor/issues/79) [#81](https://github.com/jtn0123/satellite_processor/issues/81) [#82](https://github.com/jtn0123/satellite_processor/issues/82) [#85](https://github.com/jtn0123/satellite_processor/issues/85) [#86](https://github.com/jtn0123/satellite_processor/issues/86) [#87](https://github.com/jtn0123/satellite_processor/issues/87) [#88](https://github.com/jtn0123/satellite_processor/issues/88) [#89](https://github.com/jtn0123/satellite_processor/issues/89) [#92](https://github.com/jtn0123/satellite_processor/issues/92) [#94](https://github.com/jtn0123/satellite_processor/issues/94) [#98](https://github.com/jtn0123/satellite_processor/issues/98) [#56](https://github.com/jtn0123/satellite_processor/issues/56) [#57](https://github.com/jtn0123/satellite_processor/issues/57) [#63](https://github.com/jtn0123/satellite_processor/issues/63) [#64](https://github.com/jtn0123/satellite_processor/issues/64) [#84](https://github.com/jtn0123/satellite_processor/issues/84) [#93](https://github.com/jtn0123/satellite_processor/issues/93) [#95](https://github.com/jtn0123/satellite_processor/issues/95) [#35](https://github.com/jtn0123/satellite_processor/issues/35) [#66](https://github.com/jtn0123/satellite_processor/issues/66) [#67](https://github.com/jtn0123/satellite_processor/issues/67) [#68](https://github.com/jtn0123/satellite_processor/issues/68) [#69](https://github.com/jtn0123/satellite_processor/issues/69) [#59](https://github.com/jtn0123/satellite_processor/issues/59) [#62](https://github.com/jtn0123/satellite_processor/issues/62) [#96](https://github.com/jtn0123/satellite_processor/issues/96)
* boost testing coverage — new backend endpoint tests, frontend unit tests, E2E specs, CI integration job ([#94](https://github.com/jtn0123/satellite_processor/issues/94)) ([7bb5b23](https://github.com/jtn0123/satellite_processor/commit/7bb5b231e4533ea81bada795334706525d0695a8))
* Core processor overhaul — refactor, lint, architecture ([#20](https://github.com/jtn0123/satellite_processor/issues/20)) ([a5b92d8](https://github.com/jtn0123/satellite_processor/commit/a5b92d886cdabf1d8eb007ce75ecdd443a3327be)), closes [#4](https://github.com/jtn0123/satellite_processor/issues/4) [77/#90](https://github.com/jtn0123/satellite_processor/issues/90) [78/#79](https://github.com/jtn0123/satellite_processor/issues/79) [#81](https://github.com/jtn0123/satellite_processor/issues/81) [#82](https://github.com/jtn0123/satellite_processor/issues/82) [#85](https://github.com/jtn0123/satellite_processor/issues/85) [#86](https://github.com/jtn0123/satellite_processor/issues/86) [#87](https://github.com/jtn0123/satellite_processor/issues/87) [#88](https://github.com/jtn0123/satellite_processor/issues/88) [#89](https://github.com/jtn0123/satellite_processor/issues/89) [#92](https://github.com/jtn0123/satellite_processor/issues/92) [#94](https://github.com/jtn0123/satellite_processor/issues/94) [#98](https://github.com/jtn0123/satellite_processor/issues/98) [#56](https://github.com/jtn0123/satellite_processor/issues/56) [#57](https://github.com/jtn0123/satellite_processor/issues/57) [#63](https://github.com/jtn0123/satellite_processor/issues/63) [#64](https://github.com/jtn0123/satellite_processor/issues/64) [#84](https://github.com/jtn0123/satellite_processor/issues/84) [#93](https://github.com/jtn0123/satellite_processor/issues/93) [#95](https://github.com/jtn0123/satellite_processor/issues/95) [#35](https://github.com/jtn0123/satellite_processor/issues/35) [#66](https://github.com/jtn0123/satellite_processor/issues/66) [#67](https://github.com/jtn0123/satellite_processor/issues/67) [#68](https://github.com/jtn0123/satellite_processor/issues/68) [#69](https://github.com/jtn0123/satellite_processor/issues/69) [#59](https://github.com/jtn0123/satellite_processor/issues/59) [#62](https://github.com/jtn0123/satellite_processor/issues/62) [#96](https://github.com/jtn0123/satellite_processor/issues/96)
* GOES Auto-Fetch & Gap Detection ([#22](https://github.com/jtn0123/satellite_processor/issues/22)) ([3059eec](https://github.com/jtn0123/satellite_processor/commit/3059eec0abd770288003a8ea752e8939300bafb7))
* GOES Data Management System (Phase 1) ([#32](https://github.com/jtn0123/satellite_processor/issues/32)) ([a095d47](https://github.com/jtn0123/satellite_processor/commit/a095d472ed38344b01d78d6b9ccd33e720e83497))
* Image Viewer, Frame Gallery & Compare Mode ([#82](https://github.com/jtn0123/satellite_processor/issues/82)) ([ba61dcf](https://github.com/jtn0123/satellite_processor/commit/ba61dcf614283818c95a953d9d84c09bc30bf77a))
* Job robustness — cancel, delete+files, stale detection, bulk delete, live log fix ([#80](https://github.com/jtn0123/satellite_processor/issues/80)) ([bde46f1](https://github.com/jtn0123/satellite_processor/commit/bde46f182b52a8c58e1e7e37e55fb98ce83a414c))
* Live View, Map Overlay, Band Composites, Comparison Mode & Theme Toggle ([#35](https://github.com/jtn0123/satellite_processor/issues/35)) ([9a5a9ad](https://github.com/jtn0123/satellite_processor/commit/9a5a9adf7b19fa83d762b01f55a7eaa35eeae05a))
* major UX improvements - README, band info, share links, webhooks ([#97](https://github.com/jtn0123/satellite_processor/issues/97)) ([1ef4895](https://github.com/jtn0123/satellite_processor/commit/1ef48955ff496baa3d779154aaa1a6b20a96674e))
* per-sector resolution limits (FullDisk 4K, Meso 2K) ([#79](https://github.com/jtn0123/satellite_processor/issues/79)) ([552aa04](https://github.com/jtn0123/satellite_processor/commit/552aa045591121cb9bab83b2702b26318a2ec235))
* Performance + Security — streaming uploads, DB indexes, validation, rate limiting ([#8](https://github.com/jtn0123/satellite_processor/issues/8)) ([15a884a](https://github.com/jtn0123/satellite_processor/commit/15a884a748cd62b45bf450a0a4e7823eaf8e0671)), closes [11-#15](https://github.com/11-/issues/15)
* Performance, security, and API polish ([#10](https://github.com/jtn0123/satellite_processor/issues/10)) ([bff2f66](https://github.com/jtn0123/satellite_processor/commit/bff2f6651f0effecfee5615a2f22705343488238)), closes [#9](https://github.com/jtn0123/satellite_processor/issues/9) [#16](https://github.com/jtn0123/satellite_processor/issues/16) [#17](https://github.com/jtn0123/satellite_processor/issues/17) [11-#15](https://github.com/11-/issues/15)
* Phase 3 - Navigation improvements and toast notification system ([#40](https://github.com/jtn0123/satellite_processor/issues/40)) ([2cabe93](https://github.com/jtn0123/satellite_processor/commit/2cabe93cb80c7701e60a18abd6680a5419bd1d35))
* Phase 3 — React frontend with dark satellite theme ([f7708b9](https://github.com/jtn0123/satellite_processor/commit/f7708b9bbd85b1d5c037c0be29f018a29fb0bcf0))
* responsive & mobile polish with Tailwind v4 ([#72](https://github.com/jtn0123/satellite_processor/issues/72)) ([d432511](https://github.com/jtn0123/satellite_processor/commit/d432511b943c762bd721d5d09f65685a1f5f4777))
* testing overhaul — fix core tests, coverage tracking, edge case tests, more frontend/E2E tests ([#7](https://github.com/jtn0123/satellite_processor/issues/7)) ([4c08ef7](https://github.com/jtn0123/satellite_processor/commit/4c08ef7edbc307d8d3ed006b174dd9f7e27fb819))
* UI polish — dark mode, mobile nav, dashboard widgets, gallery, presets, downloads, shortcuts ([#23](https://github.com/jtn0123/satellite_processor/issues/23)) ([03c6a87](https://github.com/jtn0123/satellite_processor/commit/03c6a87b89a21d211aa8507cfed9e15d121a9434))
* UX & Performance improvements (Phase 2) ([#39](https://github.com/jtn0123/satellite_processor/issues/39)) ([6a2f93a](https://github.com/jtn0123/satellite_processor/commit/6a2f93a7a9391b8f7e395f3598a9a43f59adc482))
* v1.1.0 — version footer, tests, satellite availability ([#47](https://github.com/jtn0123/satellite_processor/issues/47)) ([abf3e24](https://github.com/jtn0123/satellite_processor/commit/abf3e2486f38ff502c117a1f3504bac99cd127b5))
* v1.2.0 — comprehensive improvements across all 15 areas ([#48](https://github.com/jtn0123/satellite_processor/issues/48)) ([cd31c60](https://github.com/jtn0123/satellite_processor/commit/cd31c60f148b175a0f84b7e26a9144d7cebea3b3)), closes [#12](https://github.com/jtn0123/satellite_processor/issues/12) [#11](https://github.com/jtn0123/satellite_processor/issues/11) [#8](https://github.com/jtn0123/satellite_processor/issues/8) [#5](https://github.com/jtn0123/satellite_processor/issues/5) [#4](https://github.com/jtn0123/satellite_processor/issues/4) [#3](https://github.com/jtn0123/satellite_processor/issues/3) [#1](https://github.com/jtn0123/satellite_processor/issues/1) [#15](https://github.com/jtn0123/satellite_processor/issues/15) [#14](https://github.com/jtn0123/satellite_processor/issues/14) [#13](https://github.com/jtn0123/satellite_processor/issues/13) [#9](https://github.com/jtn0123/satellite_processor/issues/9) [#7](https://github.com/jtn0123/satellite_processor/issues/7) [#6](https://github.com/jtn0123/satellite_processor/issues/6) [#2](https://github.com/jtn0123/satellite_processor/issues/2) [#1](https://github.com/jtn0123/satellite_processor/issues/1) [#3](https://github.com/jtn0123/satellite_processor/issues/3) [#4](https://github.com/jtn0123/satellite_processor/issues/4) [#6](https://github.com/jtn0123/satellite_processor/issues/6) [#7](https://github.com/jtn0123/satellite_processor/issues/7) [#8](https://github.com/jtn0123/satellite_processor/issues/8) [#9](https://github.com/jtn0123/satellite_processor/issues/9) [#10](https://github.com/jtn0123/satellite_processor/issues/10) [#13](https://github.com/jtn0123/satellite_processor/issues/13) [#14](https://github.com/jtn0123/satellite_processor/issues/14) [#15](https://github.com/jtn0123/satellite_processor/issues/15) [#16-20](https://github.com/jtn0123/satellite_processor/issues/16-20)
* v1.3.0 — light mode + job panel with live logs ([#64](https://github.com/jtn0123/satellite_processor/issues/64)) ([4446c37](https://github.com/jtn0123/satellite_processor/commit/4446c37d7887358f017e601e8f344f96f661bda3))
* version display in footer with build SHA — v2.1.0 ([fef75af](https://github.com/jtn0123/satellite_processor/commit/fef75afb9d85082e07d1843b27ddd34fe040eace))
* visual polish with Tailwind v4 utilities ([#71](https://github.com/jtn0123/satellite_processor/issues/71)) ([93ddc38](https://github.com/jtn0123/satellite_processor/commit/93ddc3850c1c365bc3a60758e479e25057eed217))


### Performance Improvements

* add content-visibility, container queries, and lazy image loading ([#69](https://github.com/jtn0123/satellite_processor/issues/69)) ([347ccbd](https://github.com/jtn0123/satellite_processor/commit/347ccbd6a2b784230a973ff5d56b87522db11e7b))
* Redis caching, DB indexes, CD pipeline, frontend optimization ([#95](https://github.com/jtn0123/satellite_processor/issues/95)) ([9b5ae0e](https://github.com/jtn0123/satellite_processor/commit/9b5ae0efa84ae42ff0142171ca4cbc8ad653ab25))
