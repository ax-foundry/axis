"""Shared pytest fixtures and early setup.

``bootstrap_env()`` is called at collection time so that ``os.environ`` is
populated from ``backend/.env`` before any test or fixture imports config
modules.
"""

from app.config.env import bootstrap_env

bootstrap_env()
