# Rule: Service Boundary (thin REST handlers)

The REST API layer and the Shopmetrics/ingestion layer are **separate services**. Keep them
that way so the API stays fast, testable, and free of provider coupling.

## Must

- REST route handlers (`services/api/routes/*`) stay **thin**: parse/authorize → call a
  repository or domain function → shape the response. No business logic in the handler.
- Ingestion (`services/ingestion/*`) is the only place that talks to the Shopmetrics provider
  (`client.py`, `extractor.py`, `resources.py`).
- Cross-service work (a refresh) is dispatched via Celery (`tasks.py`), not run inline in a
  request handler.

## Must not

- REST handlers must **not** import Shopmetrics HTTP/OAuth/ingestion modules
  (`client.py`, `extractor.py`, `transform.py`, etc.).
- `transform.py` must never call the live API — it transforms already-extracted rowsets only.

## Verify

`grep` the REST route modules for imports of `services.ingestion.client` /
`...extractor` / `...transform` → there should be none.
