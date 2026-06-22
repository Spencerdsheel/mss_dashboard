from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ResourceCadence(str, Enum):
    REFERENCE = "reference"
    TRANSACTIONAL = "transactional"


@dataclass(frozen=True)
class ShopmetricsResource:
    """A documented Shopmetrics Query API resource.

    Phase 02 only fetches raw vendor rowsets. Transform and persistence begin in
    Phase 03.
    """

    name: str
    dataset_name: str
    cadence: ResourceCadence
    query_specification: str | None = None
    parameter_names: tuple[str, ...] = field(default_factory=tuple)
    include_client_or_form_ids: bool = False
    include_client_ids: bool = False
    include_form_ids: bool = False
    static_parameters: tuple[tuple[str, str], ...] = field(default_factory=tuple)

    def build_parameters(
        self,
        *,
        client_ids: list[int] | None = None,
        form_ids: list[int] | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        campaigns: list[str] | None = None,
    ) -> list[dict[str, str]]:
        params: list[dict[str, str]] = []
        if self.query_specification:
            params.append({"name": "QuerySpecification", "value": self.query_specification})
        if self.include_client_ids:
            params.append({"name": "ClientIDs", "value": join_ids(client_ids)})
        if self.include_form_ids:
            params.append({"name": "FormIDs", "value": join_ids(form_ids)})
        if self.include_client_or_form_ids:
            ids = build_client_or_form_ids(client_ids=client_ids, form_ids=form_ids)
            params.append({"name": "ClientOrFormIDs", "value": ids})
        for name, value in self.static_parameters:
            params.append({"name": name, "value": value})
        if date_from:
            params.append({"name": "DateFrom", "value": date_from})
        if date_to:
            params.append({"name": "DateTo", "value": date_to})
        if campaigns:
            params.append({"name": "Campaigns", "value": ",".join(campaigns)})
        return params

    def build_execute_payload(self, **kwargs: Any) -> dict[str, str]:
        post_body: dict[str, Any] = {
            "action": "exec",
            "dataset": {"datasetname": self.dataset_name},
        }
        params = self.build_parameters(**kwargs)
        if params:
            post_body["parameters"] = params
        return {"post": json.dumps(post_body, separators=(",", ":"))}


def join_ids(ids: list[int] | None) -> str:
    if not ids:
        raise ValueError("At least one ID is required for this resource")
    return ",".join(str(item) for item in ids)


def build_client_or_form_ids(
    *,
    client_ids: list[int] | None,
    form_ids: list[int] | None,
) -> str:
    values: list[str] = []
    for client_id in client_ids or []:
        values.append(str(-abs(client_id)))
    for form_id in form_ids or []:
        values.append(str(form_id))
    if not values:
        raise ValueError("ClientOrFormIDs requires at least one client or form ID")
    return ",".join(values)


CLIENT_ANALYTICS = "/Apps/SM/APIv2/Query/ClientAnalytics/ClientAnalytics"
FORM_ELEMENTS = "/Apps/SM/APIv2/Query/ClientAnalytics/FormElements"


SHOPMETRICS_RESOURCES: tuple[ShopmetricsResource, ...] = (
    ShopmetricsResource(
        name="clients",
        dataset_name="/Apps/SM/APIv2/Query/ClientAnalytics/Clients",
        cadence=ResourceCadence.REFERENCE,
    ),
    ShopmetricsResource(
        name="forms",
        dataset_name="/Apps/SM/APIv2/Query/ClientAnalytics/Forms",
        cadence=ResourceCadence.REFERENCE,
        query_specification="[ClientID][FormID][Title]",
        include_client_ids=True,
    ),
    ShopmetricsResource(
        name="locations",
        dataset_name="/Apps/SM/APIv2/Query/ClientAnalytics/Locations",
        cadence=ResourceCadence.REFERENCE,
        include_client_ids=True,
    ),
    ShopmetricsResource(
        name="client_properties",
        dataset_name="/Apps/SM/APIv2/Query/ClientAnalytics/ClientProperties",
        cadence=ResourceCadence.REFERENCE,
        include_client_ids=True,
    ),
    ShopmetricsResource(
        name="location_property_values",
        dataset_name="/Apps/SM/APIv2/Query/ClientAnalytics/Locations",
        cadence=ResourceCadence.REFERENCE,
        include_client_ids=True,
        static_parameters=(("IsIncludeCustomProperties", "1"),),
    ),
    ShopmetricsResource(
        name="form_elements",
        dataset_name=FORM_ELEMENTS,
        cadence=ResourceCadence.REFERENCE,
        include_form_ids=True,
        static_parameters=(
            ("IsIncludeForms", "1"),
            ("IsIncludeFormElements", "1"),
            ("IsIncludeFormElementsParentSections", "1"),
        ),
    ),
    ShopmetricsResource(
        name="form_question_answers",
        dataset_name=FORM_ELEMENTS,
        cadence=ResourceCadence.REFERENCE,
        include_form_ids=True,
        static_parameters=(
            ("IsIncludeForms", "1"),
            ("IsIncludeFormElements", "1"),
            ("IsIncludeFormQuestionAnswers", "1"),
        ),
    ),
    ShopmetricsResource(
        name="survey_instances",
        dataset_name=CLIENT_ANALYTICS,
        cadence=ResourceCadence.TRANSACTIONAL,
        query_specification="[InstanceID][ProtoSurveyID][Date][Location Store ID][Campaign]",
        include_client_or_form_ids=True,
    ),
    ShopmetricsResource(
        name="survey_instance_questions",
        dataset_name=CLIENT_ANALYTICS,
        cadence=ResourceCadence.TRANSACTIONAL,
        query_specification="[InstanceID][ProtoQuestionID][Question Comment][Pts][Pts Of]",
        include_client_or_form_ids=True,
    ),
    ShopmetricsResource(
        name="survey_instance_question_answers",
        dataset_name=CLIENT_ANALYTICS,
        cadence=ResourceCadence.TRANSACTIONAL,
        query_specification="[InstanceID][ProtoQuestionID][AnswerPos]",
        include_client_or_form_ids=True,
    ),
    ShopmetricsResource(
        name="survey_instance_location_properties",
        dataset_name=CLIENT_ANALYTICS,
        cadence=ResourceCadence.TRANSACTIONAL,
        query_specification="[InstanceID][CustomPropertyID][CustomPropertyValue]",
        include_client_or_form_ids=True,
    ),
    ShopmetricsResource(
        name="survey_instance_attachments",
        dataset_name=CLIENT_ANALYTICS,
        cadence=ResourceCadence.TRANSACTIONAL,
        query_specification="[InstanceID][AttachmentID][AttachmentPosition][AttachmentQuestionID][AttachmentAccessToken]",
        include_client_or_form_ids=True,
    ),
)
