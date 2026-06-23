"""Tests for services/ingestion/transform.py — tiny rowset → visits/photos."""

import pytest

from services.ingestion.transform import (
    DashboardPhoto,
    DashboardVisit,
    TransformContext,
    transform_shopmetrics_rowsets,
)


def _minimal_rowsets():
    """A tiny hand-built rowset with 1 visit and 1 photo attachment."""
    return {
        "locations": [
            {
                "StoreID": "LOC-001",
                "Name": "Test Store Montreal",
                "Address": "123 Rue Test",
                "City": "Montreal",
            }
        ],
        "form_question_answers": [
            {"QuestionID": 88701, "Position": 1, "Text": "John Doe"},
            {"QuestionID": 88702, "Position": 1, "Text": "Installed in B4 position"},
            {"QuestionID": 88702, "Position": 2, "Text": "Installed elsewhere"},
            {"QuestionID": 88703, "Position": 1, "Text": "Installed in 360 position"},
            {"QuestionID": 88703, "Position": 2, "Text": "Not targeted"},
            {"QuestionID": 88704, "Position": 1, "Text": "Fully stocked"},
            {"QuestionID": 88704, "Position": 2, "Text": "Not targeted"},
            {"QuestionID": 88705, "Position": 1, "Text": "Some comment"},
            {"QuestionID": 88706, "Position": 1, "Text": "Overall notes here"},
        ],
        "survey_instances": [
            {
                "InstanceID": "SURV-001",
                "Location Store ID": "LOC-001",
                "Date": "2026-03-15",
            }
        ],
        "survey_instance_question_answers": [
            {"InstanceID": "SURV-001", "ProtoQuestionID": 88702, "AnswerPos": 1},
            {"InstanceID": "SURV-001", "ProtoQuestionID": 88703, "AnswerPos": 1},
            {"InstanceID": "SURV-001", "ProtoQuestionID": 88704, "AnswerPos": 1},
        ],
        "survey_instance_questions": [
            {"InstanceID": "SURV-001", "ProtoQuestionID": 88701, "Question Comment": "John Doe"},
            {"InstanceID": "SURV-001", "ProtoQuestionID": 88706, "Question Comment": "Overall notes here"},
        ],
        "survey_instance_attachments": [
            {
                "InstanceID": "SURV-001",
                "AttachmentID": "ATT-001",
                "AttachmentAccessToken": "tok-abc",
                "AttachmentPosition": 1,
            },
        ],
    }


class TestTransformVisits:
    def test_yields_visits_from_rowset(self):
        rowsets = _minimal_rowsets()
        ctx = TransformContext(tenant_id="tenant_test", project_id="proj_test")
        result = transform_shopmetrics_rowsets(rowsets, ctx)

        assert len(result.visits) >= 1
        visit = result.visits[0]
        assert isinstance(visit, DashboardVisit)

    def test_tenant_id_stamped_on_visits(self):
        rowsets = _minimal_rowsets()
        ctx = TransformContext(tenant_id="tenant_xyz", project_id="proj_abc")
        result = transform_shopmetrics_rowsets(rowsets, ctx)

        for v in result.visits:
            assert v.tenant_id == "tenant_xyz"
            assert v.project_id == "proj_abc"

    def test_install_answer_text_passes_through(self):
        """Guard against Bug B: install values should be the form answer text, not collapsed."""
        rowsets = _minimal_rowsets()
        ctx = TransformContext(tenant_id="tenant_test", project_id="proj_test")
        result = transform_shopmetrics_rowsets(rowsets, ctx)

        visit = next(v for v in result.visits if v.survey_id == "SURV-001")
        assert visit.install1 == "Installed in B4 position"
        assert visit.install2 == "Installed in 360 position"
        assert visit.install3 == "Fully stocked"

    def test_store_info_from_location(self):
        rowsets = _minimal_rowsets()
        ctx = TransformContext(tenant_id="tenant_test", project_id="proj_test")
        result = transform_shopmetrics_rowsets(rowsets, ctx)
        visit = next(v for v in result.visits if v.survey_id == "SURV-001")
        assert visit.store_name == "Test Store Montreal"
        assert visit.city == "Montreal"
        assert visit.address == "123 Rue Test"

    def test_survey_id_preserved(self):
        rowsets = _minimal_rowsets()
        result = transform_shopmetrics_rowsets(rowsets)
        assert any(v.survey_id == "SURV-001" for v in result.visits)


class TestTransformPhotos:
    def test_yields_photos_from_attachments(self):
        rowsets = _minimal_rowsets()
        ctx = TransformContext(tenant_id="tenant_test", project_id="proj_test")
        result = transform_shopmetrics_rowsets(rowsets, ctx)

        assert len(result.photos) >= 1
        photo = result.photos[0]
        assert isinstance(photo, DashboardPhoto)
        assert photo.tenant_id == "tenant_test"
        assert photo.project_id == "proj_test"
        assert photo.survey_id == "SURV-001"
        assert "AttachmentID=ATT-001" in photo.url

    def test_photo_kind_assigned_by_position(self):
        rowsets = _minimal_rowsets()
        result = transform_shopmetrics_rowsets(rowsets)
        photo = result.photos[0]
        assert photo.kind == "STOREFRONT"


class TestExtraNormalizedVisit:
    def test_labatt_gets_extra_survey_id(self):
        rowsets = _minimal_rowsets()
        ctx = TransformContext(tenant_id="tenant_labatt")
        result = transform_shopmetrics_rowsets(rowsets, ctx)
        assert any(v.survey_id == "1737162" for v in result.visits)

    def test_non_labatt_does_not_get_extra_survey_id(self):
        rowsets = _minimal_rowsets()
        ctx = TransformContext(tenant_id="tenant_other")
        result = transform_shopmetrics_rowsets(rowsets, ctx)
        assert not any(v.survey_id == "1737162" for v in result.visits)
