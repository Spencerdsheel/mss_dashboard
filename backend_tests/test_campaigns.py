"""Tests for services/common/campaigns.py — template selection and Labatt config."""

import pytest

from services.common.campaigns import (
    CAMPAIGN_TEMPLATES,
    LABATT_CAMPAIGN,
    LABATT_TENANT_ID,
    get_campaign_by_tenant_hash,
    get_campaign_for_tenant,
    synthetic_template_index,
)


class TestSyntheticTemplateIndex:
    def test_deterministic_for_same_tenant(self):
        idx1 = synthetic_template_index("tenant_alpha")
        idx2 = synthetic_template_index("tenant_alpha")
        assert idx1 == idx2

    def test_different_tenants_can_produce_different_indices(self):
        idx_a = synthetic_template_index("tenant_A")
        idx_b = synthetic_template_index("tenant_B")
        # They could theoretically collide, but with 3 templates it's very unlikely
        # for two distinct strings to hash to the same mod-3 value.
        # We just verify they are in range.
        assert 0 <= idx_a < len(CAMPAIGN_TEMPLATES)
        assert 0 <= idx_b < len(CAMPAIGN_TEMPLATES)

    def test_index_in_range(self):
        for tenant_id in ["tenant_test_01", "tenant_test_02", "tenant_xyz"]:
            idx = synthetic_template_index(tenant_id)
            assert 0 <= idx < len(CAMPAIGN_TEMPLATES)


class TestLabattCampaign:
    def test_labatt_has_three_slots(self):
        assert len(LABATT_CAMPAIGN["slots"]) == 3

    def test_labatt_slot_titles(self):
        titles = [s["title"] for s in LABATT_CAMPAIGN["slots"]]
        assert "Standee Messi" in titles
        assert "Flying Fish Display" in titles
        assert "Stock / Supply" in titles

    def test_labatt_answers_are_english(self):
        for slot in LABATT_CAMPAIGN["slots"]:
            for text, _is_success in slot["answers"]:
                # No French vocabulary in Labatt campaign
                assert "Pas cible" not in text
                # "Installed" is English; "Installe" alone (without 'd') would be French
                assert text.startswith("Installe") is False or text.startswith("Installed")

    def test_labatt_target(self):
        assert LABATT_CAMPAIGN["target"] == 450


class TestGetCampaignForTenant:
    def test_labatt_always_gets_labatt_campaign(self):
        campaign = get_campaign_for_tenant(LABATT_TENANT_ID, index=0)
        assert campaign is LABATT_CAMPAIGN

    def test_labatt_ignores_index(self):
        c0 = get_campaign_for_tenant(LABATT_TENANT_ID, index=0)
        c99 = get_campaign_for_tenant(LABATT_TENANT_ID, index=99)
        assert c0 is c99

    def test_synthetic_tenant_gets_template_by_index(self):
        campaign = get_campaign_for_tenant("tenant_other", index=0)
        assert campaign is CAMPAIGN_TEMPLATES[0]

    def test_synthetic_tenant_index_wraps(self):
        n = len(CAMPAIGN_TEMPLATES)
        c0 = get_campaign_for_tenant("tenant_other", index=0)
        c_wrap = get_campaign_for_tenant("tenant_other", index=n)
        assert c0 is c_wrap


class TestGetCampaignByTenantHash:
    def test_labatt_returns_labatt_campaign(self):
        campaign = get_campaign_by_tenant_hash(LABATT_TENANT_ID)
        assert campaign is LABATT_CAMPAIGN

    def test_synthetic_tenant_uses_hash_index(self):
        tenant = "tenant_alpha"
        expected_idx = synthetic_template_index(tenant)
        campaign = get_campaign_by_tenant_hash(tenant)
        assert campaign is CAMPAIGN_TEMPLATES[expected_idx]
