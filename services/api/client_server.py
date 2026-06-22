"""Client API Server — standalone entry point.

Usage:
    python -m services.api.client_server
    python -m services.api.client_server --port 8020

Provides two endpoints that mimic the Shopmetrics API:
    POST /oauth/connect/token
    POST /api/v2/execute
"""

from __future__ import annotations

import argparse
import sys

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Client API Server")
    parser.add_argument("--port", type=int, default=8020, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()

    # Initialize tenant states from DB before starting the server
    from services.api.routes.client_api import init_tenant_states

    try:
        init_tenant_states()
    except Exception as exc:
        print(f"Warning: Failed to initialize tenant states: {exc}", file=sys.stderr)
        print("Server will start but tenant lookups may fail.", file=sys.stderr)

    from fastapi import FastAPI
    from services.api.routes.client_api import router

    app = FastAPI(title="Client API Server")
    app.include_router(router)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
