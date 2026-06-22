from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .client import ShopmetricsClient
from .resources import SHOPMETRICS_RESOURCES, ResourceCadence, ShopmetricsResource


RawRowset = list[dict[str, Any]]


@dataclass(frozen=True)
class ExtractorRequest:
    client_ids: list[int]
    form_ids: list[int] | None = None
    date_from: str | None = None
    date_to: str | None = None
    campaigns: list[str] | None = None
    include_reference: bool = True
    include_transactional: bool = True


class ShopmetricsExtractor:
    """Fetches raw Shopmetrics rowsets in documented dependency order."""

    def __init__(
        self,
        client: ShopmetricsClient,
        resources: tuple[ShopmetricsResource, ...] = SHOPMETRICS_RESOURCES,
    ) -> None:
        self.client = client
        self.resources = resources

    def pull(self, request: ExtractorRequest) -> dict[str, RawRowset]:
        rowsets: dict[str, RawRowset] = {}
        for resource in self._selected_resources(request):
            payload = resource.build_execute_payload(
                client_ids=request.client_ids,
                form_ids=request.form_ids,
                date_from=request.date_from if resource.cadence == ResourceCadence.TRANSACTIONAL else None,
                date_to=request.date_to if resource.cadence == ResourceCadence.TRANSACTIONAL else None,
                campaigns=request.campaigns if resource.cadence == ResourceCadence.TRANSACTIONAL else None,
            )
            response = self.client.execute(payload)
            rowsets[resource.name] = extract_first_rowset(response)
        return rowsets

    def _selected_resources(self, request: ExtractorRequest) -> list[ShopmetricsResource]:
        selected: list[ShopmetricsResource] = []
        for resource in self.resources:
            if resource.cadence == ResourceCadence.REFERENCE and request.include_reference:
                selected.append(resource)
            if resource.cadence == ResourceCadence.TRANSACTIONAL and request.include_transactional:
                selected.append(resource)
        return selected


def extract_first_rowset(response: dict[str, Any]) -> RawRowset:
    dataset = response.get("dataset")
    if not isinstance(dataset, dict):
        return []
    data = dataset.get("data")
    if not isinstance(data, list) or not data:
        return []
    first = data[0]
    if not isinstance(first, list):
        return []
    return [row for row in first if isinstance(row, dict)]
