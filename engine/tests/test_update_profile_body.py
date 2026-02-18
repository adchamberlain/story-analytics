"""
Regression test: update_profile must accept JSON body, not query params.

Bug: The `name` parameter on PUT /auth/me was declared as `name: str | None = None`
without a Pydantic model, so FastAPI treated it as a query parameter. JSON body
from the frontend was silently ignored, making profile name updates a no-op.
Fix: Wrapped in an UpdateProfileRequest Pydantic model so it reads from JSON body.
"""

import inspect

import pytest


@pytest.mark.unit
class TestUpdateProfileBody:
    def test_update_profile_accepts_body_model(self):
        """The update_profile endpoint should accept a Pydantic model body, not bare params."""
        from api.routers.auth import update_profile

        sig = inspect.signature(update_profile)
        params = list(sig.parameters.keys())
        # The first parameter should be a Pydantic model (body), not a bare 'name' string
        assert "name" not in params, "name should be wrapped in a Pydantic model, not a bare query param"
        assert "body" in params, "should accept a 'body' parameter (Pydantic model)"

    def test_update_profile_request_model_exists(self):
        """The UpdateProfileRequest model should exist and have a name field."""
        from api.routers.auth import UpdateProfileRequest

        model = UpdateProfileRequest(name="Alice")
        assert model.name == "Alice"

        model_none = UpdateProfileRequest()
        assert model_none.name is None
