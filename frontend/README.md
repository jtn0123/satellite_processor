# Satellite Processor — Frontend

React 18 + TypeScript + Vite + TailwindCSS frontend for the satellite image processor.

## Architecture

```
frontend/
├── src/
│   ├── api/           # Axios client configuration
│   ├── components/    # Reusable UI components
│   │   ├── GoesData/  # GOES satellite data tabs (Browse, Fetch, Live, Map, etc.)
│   │   ├── Jobs/      # Job list & monitoring components
│   │   ├── Processing/# Image processing form & preset manager
│   │   ├── System/    # System monitoring (DonutChart, SystemMonitor)
│   │   ├── Upload/    # File upload dropzone
│   │   └── VideoPlayer/ # Video playback component
│   ├── hooks/         # Custom React hooks (useApi, useDebounce, useFocusTrap, etc.)
│   ├── pages/         # Route-level page components
│   ├── test/          # Unit tests (Vitest + happy-dom)
│   └── utils/         # Utility functions (toast, formatting)
├── e2e/               # Playwright end-to-end tests
├── nginx.conf         # Production Nginx config (SPA + API proxy)
└── vite.config.ts     # Vite build configuration
```

**Key patterns:**
- **Lazy loading**: All page components are `React.lazy()` loaded for code splitting
- **React Query**: All API state is managed via `@tanstack/react-query` with configurable `staleTime`/`gcTime`
- **WebSocket**: Real-time job progress updates via `/ws/status` and `/ws/jobs/{id}`
- **Custom hooks**: `useDebounce`, `useFocusTrap`, `useHotkeys`, `usePageTitle` for shared logic
- **Memoized components**: `FrameCard` and other list items use `React.memo` for render performance

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm test              # Unit tests (Vitest)
npx playwright test   # E2E tests
```

## Build

```bash
npm run build
```

Output goes to `dist/`, served by Nginx in production.

## API Usage Examples

The frontend communicates with the backend API. Here are key endpoints:

### Health Check
```bash
curl http://localhost:8000/api/health/version
```

### List GOES Frames
```bash
curl "http://localhost:8000/api/goes/frames?page=1&limit=50&satellite=GOES-16&sort=capture_time&order=desc"
```

### Fetch GOES Data
```bash
curl -X POST http://localhost:8000/api/goes/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "satellite": "GOES-19",
    "sector": "CONUS",
    "band": "C02",
    "start_time": "2025-01-01T00:00:00Z",
    "end_time": "2025-01-01T01:00:00Z"
  }'
```

### Get Latest Frame (Live View)
```bash
curl "http://localhost:8000/api/goes/latest?satellite=GOES-16&sector=CONUS&band=C02"
```

### Create Composite
```bash
curl -X POST http://localhost:8000/api/goes/composites \
  -H "Content-Type: application/json" \
  -d '{
    "recipe": "true_color",
    "satellite": "GOES-16",
    "sector": "CONUS",
    "capture_time": "2025-01-01T12:00:00Z"
  }'
```

### List Jobs
```bash
curl http://localhost:8000/api/jobs
```

### Upload Image
```bash
curl -X POST http://localhost:8000/api/images/upload \
  -F "file=@image.nc"
```

### System Status
```bash
curl http://localhost:8000/api/system/status
```

### Coverage Gap Analysis
```bash
curl "http://localhost:8000/api/goes/gaps?satellite=GOES-16&band=C02&expected_interval=10"
```
