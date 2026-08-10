"""Filter metadata and data-quality reporting."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import current_user_id
from app.models.schemas import Meta
from app.repositories import meta as repo

router = APIRouter(prefix="/meta", tags=["meta"])

_LABEL_OVERRIDES = {"UPI": "UPI"}


def _options(rows: list[dict]) -> list[dict]:
    return [
        {
            "value": row["value"],
            "label": _LABEL_OVERRIDES.get(row["value"], row["value"].title())
            if row["value"].isupper()
            else row["value"],
            "count": int(row["count"]),
            "colour": row.get("colour"),
        }
        for row in rows
    ]


@router.get("", response_model=Meta)
def get_meta(user_id: int = Depends(current_user_id)) -> dict:
    """Everything the filter bar needs, in one request.

    Bundled deliberately: four separate calls for four dropdowns would mean the
    filter bar renders in pieces, and any one of them failing leaves a control
    silently empty rather than the panel showing an error.
    """
    data = repo.facets(user_id)
    bounds = data["bounds"] or {}
    dq = data["data_quality"]

    return {
        "categories": _options(data["categories"]),
        "merchants": _options(data["merchants"]),
        "statuses": _options(data["statuses"]),
        "payment_methods": _options(data["payment_methods"]),
        "min_date": bounds.get("min_date"),
        "max_date": bounds.get("max_date"),
        "min_amount": bounds.get("min_amount"),
        "max_amount": bounds.get("max_amount"),
        "data_quality": (
            {
                "rows_in_file": dq["rows_in_file"],
                "rows_loaded": dq["rows_loaded"],
                "rows_rejected": dq["rows_rejected"],
                "report": dq["report"],
                "ran_at": dq["ran_at"],
            }
            if dq
            else None
        ),
    }
