"""Domain errors.

Services raise these; the API layer translates them into status codes. Keeping
them free of HTTP means the business rules stay testable without a request, and
a rule can be reused from a CLI or a worker without dragging FastAPI along.
"""

from __future__ import annotations


class DomainError(Exception):
    """Base class. ``code`` is a stable string the frontend can switch on —
    matching on human-readable messages breaks the moment the copy is edited."""

    status_code: int = 400
    code: str = "domain_error"

    def __init__(self, message: str, **details):
        super().__init__(message)
        self.message = message
        self.details = details

    def to_payload(self) -> dict:
        return {"code": self.code, "message": self.message, "details": self.details}


class NotFound(DomainError):
    status_code = 404
    code = "not_found"


class InsufficientBalance(DomainError):
    """409, not 400.

    The request is perfectly well-formed; it conflicts with current state. A
    400 would tell the client to fix its payload, which is the wrong advice —
    the same request succeeds once the balance is high enough.
    """

    status_code = 409
    code = "insufficient_balance"


class RewardUnavailable(DomainError):
    """409. The reward exists but cannot be redeemed right now — withdrawn
    from the catalogue, or out of stock."""

    status_code = 409
    code = "reward_unavailable"


class InvalidRequest(DomainError):
    status_code = 400
    code = "invalid_request"
