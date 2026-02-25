import pytest
from fastapi.testclient import TestClient


class TestAppStartup:
    """Test that the application starts correctly."""

    def test_app_imports(self):
        """Test that the main app module can be imported."""
        from app.main import app

        assert app is not None

    def test_app_has_routes(self):
        """Test that the app has registered routes."""
        from app.main import app

        assert len(app.routes) > 0


class TestHealthEndpoints:
    """Test basic health/status endpoints."""

    @pytest.fixture
    def client(self):
        """Create a test client."""
        from app.main import app

        return TestClient(app)

    def test_root_endpoint(self, client):
        """Test the root endpoint returns successfully."""
        response = client.get("/")
        assert response.status_code == 200

    def test_ai_status_endpoint(self, client):
        """Test the AI status endpoint."""
        response = client.get("/api/ai/status")
        assert response.status_code == 200
        data = response.json()
        assert "configured" in data
        assert "features" in data


class TestDataEndpoints:
    """Test data-related endpoints."""

    @pytest.fixture
    def client(self):
        """Create a test client."""
        from app.main import app

        return TestClient(app)

    def test_example_dataset_not_found(self, client):
        """Test that requesting a non-existent dataset returns 404."""
        response = client.get("/api/data/example/nonexistent")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data


class TestDatabaseEndpoints:
    """Test database-related endpoints."""

    @pytest.fixture
    def client(self):
        """Create a test client."""
        from app.main import app

        return TestClient(app)

    def test_database_defaults_endpoint(self, client):
        """Test getting database defaults."""
        response = client.get("/api/database/defaults")
        assert response.status_code == 200
        data = response.json()
        assert "has_defaults" in data

    def test_database_stats_endpoint(self, client):
        """Test getting connection stats."""
        response = client.get("/api/database/stats")
        assert response.status_code == 200
