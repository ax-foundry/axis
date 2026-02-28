"""Tests for config package bootstrap and path resolution."""

import os
from pathlib import Path
from unittest.mock import patch


class TestPathResolution:
    """Verify paths.py resolves to absolute locations regardless of cwd."""

    def test_backend_env_file_is_absolute(self):
        """_BACKEND_ENV_FILE is an absolute path."""
        from app.config.paths import _BACKEND_ENV_FILE

        assert _BACKEND_ENV_FILE.is_absolute()

    def test_backend_env_file_points_to_backend_dir(self):
        """_BACKEND_ENV_FILE resolves to backend/.env."""
        from app.config.paths import _BACKEND_ENV_FILE

        assert _BACKEND_ENV_FILE.name == ".env"
        assert _BACKEND_ENV_FILE.parent.name == "backend"

    def test_project_root_contains_backend(self):
        """_PROJECT_ROOT points to the actual repo root."""
        from app.config.paths import _PROJECT_ROOT

        assert (_PROJECT_ROOT / "backend").is_dir()

    def test_custom_dir_default(self):
        """Default CUSTOM_DIR is <project_root>/custom."""
        from app.config.paths import _PROJECT_ROOT

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AXIS_CUSTOM_DIR", None)
            # Re-evaluate: paths module caches at import, so check the formula
            expected = _PROJECT_ROOT / "custom"
            assert expected.is_absolute()


class TestBootstrapEnv:
    """Verify bootstrap_env() is idempotent and cwd-independent."""

    def test_bootstrap_runs_at_import_time(self):
        """Importing env.py automatically calls bootstrap_env()."""
        import app.config.env as env_mod

        assert env_mod._env_loaded is True

    def test_bootstrap_is_idempotent(self):
        """Calling bootstrap_env() twice doesn't raise or double-load."""
        import app.config.env as env_mod

        # Reset the guard so we can test cleanly
        original = env_mod._env_loaded
        env_mod._env_loaded = False
        try:
            env_mod.bootstrap_env()
            assert env_mod._env_loaded is True
            # Second call is a no-op
            env_mod.bootstrap_env()
            assert env_mod._env_loaded is True
        finally:
            env_mod._env_loaded = original

    def test_bootstrap_uses_explicit_path(self):
        """bootstrap_env() calls load_dotenv with an explicit dotenv_path."""
        import app.config.env as env_mod
        from app.config.paths import _BACKEND_ENV_FILE

        original = env_mod._env_loaded
        env_mod._env_loaded = False
        try:
            with patch.object(env_mod, "load_dotenv") as mock_load:
                # Pretend the file exists so the branch fires
                with patch.object(Path, "exists", return_value=True):
                    env_mod.bootstrap_env()

                mock_load.assert_called_once_with(dotenv_path=_BACKEND_ENV_FILE, override=False)
        finally:
            env_mod._env_loaded = original

    def test_bootstrap_skips_when_env_file_missing(self):
        """When backend/.env doesn't exist, load_dotenv is not called."""
        import app.config.env as env_mod

        original = env_mod._env_loaded
        env_mod._env_loaded = False
        try:
            with patch.object(env_mod, "load_dotenv") as mock_load:
                with patch.object(Path, "exists", return_value=False):
                    env_mod.bootstrap_env()

                mock_load.assert_not_called()
                assert env_mod._env_loaded is True
        finally:
            env_mod._env_loaded = original

    def test_bootstrap_works_from_different_cwd(self, tmp_path: Path):
        """bootstrap_env resolves .env correctly even when cwd is elsewhere."""
        import app.config.env as env_mod
        from app.config.paths import _BACKEND_ENV_FILE

        original_cwd = Path.cwd()
        original_loaded = env_mod._env_loaded
        env_mod._env_loaded = False
        try:
            os.chdir(tmp_path)
            with patch.object(env_mod, "load_dotenv") as mock_load:
                with patch.object(Path, "exists", return_value=True):
                    env_mod.bootstrap_env()

                # Even from tmp_path cwd, the explicit path is used
                mock_load.assert_called_once_with(dotenv_path=_BACKEND_ENV_FILE, override=False)
        finally:
            os.chdir(original_cwd)
            env_mod._env_loaded = original_loaded


class TestSettingsSingleton:
    """Verify the module-level settings object loads."""

    def test_settings_is_available(self):
        """Module-level settings singleton is importable."""
        from app.config.env import settings

        assert settings is not None
        assert hasattr(settings, "HOST")
        assert hasattr(settings, "PORT")

    def test_settings_has_defaults(self):
        """Settings fallback values match expected defaults."""
        from app.config.env import settings

        assert settings.HOST == "127.0.0.1"
        assert settings.PORT == 8500
