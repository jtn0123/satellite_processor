"""OpenTelemetry tracing configuration.

Tracing is opt-in: set OTEL_EXPORTER_OTLP_ENDPOINT to enable.
When no endpoint is configured, tracing is silently disabled.
"""

import logging
import os

logger = logging.getLogger(__name__)


def setup_tracing(app=None) -> None:
    """Initialize OpenTelemetry tracing if an OTLP endpoint is configured."""
    otel_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if not otel_endpoint:
        logger.debug("OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create(
            {
                "service.name": "satellite-processor-api",
                "service.version": os.getenv("BUILD_VERSION", "dev"),
            }
        )

        provider = TracerProvider(resource=resource)
        insecure = otel_endpoint.startswith("http://")
        exporter = OTLPSpanExporter(endpoint=otel_endpoint, insecure=insecure)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Instrument FastAPI
        if app is not None:
            try:
                from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

                FastAPIInstrumentor.instrument_app(app)
                logger.info("OpenTelemetry: FastAPI instrumented")
            except ImportError:
                logger.debug("opentelemetry-instrumentation-fastapi not installed")

        # Instrument Celery
        try:
            from opentelemetry.instrumentation.celery import CeleryInstrumentor

            CeleryInstrumentor().instrument()
            logger.info("OpenTelemetry: Celery instrumented")
        except ImportError:
            logger.debug("opentelemetry-instrumentation-celery not installed")

        logger.info("OpenTelemetry tracing enabled → %s", otel_endpoint)

    except ImportError:
        logger.warning("OpenTelemetry packages not installed — tracing disabled")
    except Exception:
        logger.warning("Failed to initialize OpenTelemetry tracing", exc_info=True)
