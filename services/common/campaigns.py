"""Shared campaign template definitions.

Single source of truth for all tenant campaign configs.
Imported by both:
  - services/api/routes/client_api.py  (mock API server)
  - scripts/seed_multi_tenant_test_data.py  (DB seeder)

Each slot answer is a 2-tuple: (text: str, is_success: bool).
The seeder adds a third element (count weight) locally but that is
not part of the canonical shape stored here.

P1.4: English vocabulary only, no Shopmetrics vendor strings in labels.
"""

from __future__ import annotations

import hashlib

LABATT_TENANT_ID = "tenant_labatt"

# P1.4: Labatt fixed 3-slot campaign (English)
LABATT_CAMPAIGN: dict = {
    "slots": [
        {
            "title": "Standee Messi",
            "question": "Did you leave the Messi Standee assembled in B4?",
            "answers": [
                ("Installed in B4 position", True),
                ("Installed elsewhere", True),
                ("Assembled in backroom", True),
                ("Given to an employee", False),
                ("Refused", False),
                ("Store closed", False),
                ("Not targeted", False),
            ],
        },
        {
            "title": "Flying Fish Display",
            "question": "Did you leave the Presentoir Flying Fish assembled in 360?",
            "answers": [
                ("Installed in 360 position", True),
                ("Installed elsewhere", True),
                ("Assembled in backroom", True),
                ("Not targeted", False),
                ("Given to an employee", False),
                ("Refused", False),
                ("Store closed", False),
            ],
        },
        {
            "title": "Stock / Supply",
            "question": "Did you stock the display?",
            "answers": [
                ("Fully stocked", True),
                ("Partially stocked", True),
                ("Not stocked", False),
                ("Not targeted", False),
                ("Not assembled", False),
                ("Refused", False),
                ("Store closed", False),
            ],
        },
    ],
    "target": 450,
}

# P1.4: English campaign templates for synthetic tenants (1–4 install slots each)
CAMPAIGN_TEMPLATES: list[dict] = [
    {
        "slots": [
            {
                "title": "Endcap Display",
                "question": "Was the endcap display installed?",
                "answers": [
                    ("Installed correctly", True),
                    ("Installed elsewhere", True),
                    ("Refused", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
            {
                "title": "Shelf Talkers",
                "question": "Were shelf talkers placed?",
                "answers": [
                    ("All placed", True),
                    ("Some placed", True),
                    ("None placed", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
        ],
        "target": 400,
    },
    {
        "slots": [
            {
                "title": "POS Poster",
                "question": "Was the POS poster displayed?",
                "answers": [
                    ("Displayed at entrance", True),
                    ("Displayed at register", True),
                    ("Not displayed", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
            {
                "title": "Sample Station",
                "question": "Was the sample station active?",
                "answers": [
                    ("Active all day", True),
                    ("Active partial", True),
                    ("Not active", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
            {
                "title": "Branded Cooler",
                "question": "Was the branded cooler stocked?",
                "answers": [
                    ("Fully stocked", True),
                    ("Partially stocked", True),
                    ("Empty", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
        ],
        "target": 350,
    },
    {
        "slots": [
            {
                "title": "Window Cling",
                "question": "Was the window cling applied?",
                "answers": [
                    ("Applied front window", True),
                    ("Applied side window", True),
                    ("Not applied", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
            {
                "title": "Floor Decal",
                "question": "Was the floor decal placed?",
                "answers": [
                    ("Placed at entrance", True),
                    ("Placed at aisle", True),
                    ("Not placed", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
            {
                "title": "Counter Display",
                "question": "Was the counter display set up?",
                "answers": [
                    ("Set up", True),
                    ("Partially set up", True),
                    ("Not set up", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
            {
                "title": "Receipt Promo",
                "question": "Was the receipt promo active?",
                "answers": [
                    ("Active", True),
                    ("Printer issue", False),
                    ("Not active", False),
                    ("Store closed", False),
                    ("Not targeted", False),
                ],
            },
        ],
        "target": 500,
    },
]


def get_campaign_for_tenant(tenant_id: str, index: int) -> dict:
    """Return the canonical campaign config for a tenant.

    Labatt always gets LABATT_CAMPAIGN (fixed 3-slot campaign).
    All other tenants get a template selected by (index % len(templates)).

    The returned dict has "slots" (list of slot dicts) and "target" (int).
    Each slot has "title", "question", and "answers" (list of (text, is_success) tuples).

    NOTE: The client_api mock also injects "weights" into the returned dict
    for synthetic tenants; that is added by the caller after this function
    returns and is NOT part of the canonical template shape.
    """
    if tenant_id == LABATT_TENANT_ID:
        return LABATT_CAMPAIGN
    return CAMPAIGN_TEMPLATES[index % len(CAMPAIGN_TEMPLATES)]


def synthetic_template_index(tenant_id: str) -> int:
    """Stable index into CAMPAIGN_TEMPLATES for a synthetic (non-Labatt) tenant.

    This is the SINGLE source of truth for synthetic template selection. Both
    the mock API server (services/api/routes/client_api.py) and the DB seeder
    (scripts/seed_multi_tenant_test_data.py) must select via this function so a
    tenant's seeded baseline always matches the campaign the mock serves and the
    config ingestion derives. Do not select by list position/index — that
    diverges between the two paths.
    """
    return int(hashlib.md5(tenant_id.encode()).hexdigest(), 16) % len(CAMPAIGN_TEMPLATES)


def get_campaign_by_tenant_hash(tenant_id: str) -> dict:
    """Select a template using a stable MD5 hash of the tenant ID.

    Used by the mock API server where an RNG-based index is not available
    at template-selection time (only PRNG weights vary per tenant).
    Labatt always returns LABATT_CAMPAIGN.
    """
    if tenant_id == LABATT_TENANT_ID:
        return LABATT_CAMPAIGN
    return CAMPAIGN_TEMPLATES[synthetic_template_index(tenant_id)]
