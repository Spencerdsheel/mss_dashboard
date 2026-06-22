"""Shopmetrics ingestion package."""

from .extractor import ShopmetricsExtractor
from .resources import SHOPMETRICS_RESOURCES, ShopmetricsResource

__all__ = ["SHOPMETRICS_RESOURCES", "ShopmetricsExtractor", "ShopmetricsResource"]
