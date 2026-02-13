"""Tests for circuit breaker pattern."""

from app.circuit_breaker import CircuitBreaker, CircuitBreakerOpen, CircuitState


def test_circuit_starts_closed():
    cb = CircuitBreaker(name="test", failure_threshold=3, recovery_timeout=1.0)
    assert cb.state == CircuitState.CLOSED
    assert cb.allow_request() is True


def test_circuit_opens_after_threshold():
    cb = CircuitBreaker(name="test", failure_threshold=3, recovery_timeout=60.0)
    for _ in range(3):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.allow_request() is False


def test_circuit_resets_on_success():
    cb = CircuitBreaker(name="test", failure_threshold=3, recovery_timeout=60.0)
    cb.record_failure()
    cb.record_failure()
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.allow_request() is True


def test_circuit_half_open_after_timeout():
    import time
    cb = CircuitBreaker(name="test", failure_threshold=2, recovery_timeout=0.1)
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    time.sleep(0.15)
    assert cb.state == CircuitState.HALF_OPEN
    assert cb.allow_request() is True


def test_circuit_breaker_open_exception():
    exc = CircuitBreakerOpen("s3")
    assert "s3" in str(exc)
    assert exc.breaker_name == "s3"
