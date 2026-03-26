import type { Metric } from 'web-vitals';

function sendToAnalytics(metric: Metric) {
  // Log to console in development, could be sent to an analytics endpoint in production
  if (import.meta.env.DEV) {
    const formatted =
      metric.name === 'CLS' ? metric.value.toFixed(3) : `${metric.value.toFixed(1)}ms`;
    console.log(`[Web Vitals] ${metric.name}: ${formatted} (${metric.rating})`);
  }
}

export async function reportWebVitals() {
  const { onCLS, onFCP, onLCP, onTTFB, onINP } = await import('web-vitals');
  onCLS(sendToAnalytics);
  onFCP(sendToAnalytics);
  onLCP(sendToAnalytics);
  onTTFB(sendToAnalytics);
  onINP(sendToAnalytics);
}
