from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram
from prometheus_fastapi_instrumentator import PrometheusFastApiInstrumentator

# Custom metrics

ingestion_duration_seconds = Histogram(
    "ingestion_duration_seconds",
    "Time spent running tenant ingestion",
    labelnames=["tenant_id", "status"],
)

active_tenants_total = Gauge(
    "active_tenants_total",
    "Total number of active tenants",
)

cache_hits_total = Counter(
    "cache_hits_total",
    "Total number of cache hits",
    labelnames=["endpoint"],
)

cache_misses_total = Counter(
    "cache_misses_total",
    "Total number of cache misses",
    labelnames=["endpoint"],
)

jwt_blacklist_size = Gauge(
    "jwt_blacklist_size",
    "Current number of blacklisted JWT tokens",
)


def setup_metrics(app) -> None:
    """Configure Prometheus metrics for the FastAPI app."""
    PrometheusFastApiInstrumentator().instrument(app).expose(app, endpoint="/metrics")
