import logging

from app.copilot.skills.base import BaseSkill, SkillMetadata
from app.copilot.skills.loader import SkillLoader

logger = logging.getLogger("axis.copilot.skills.registry")

# Global registry instance
_registry_instance: "SkillRegistry | None" = None


class SkillRegistry:
    """Singleton registry for managing copilot skills.

    Handles skill discovery, registration, and access.
    """

    def __init__(self) -> None:
        """Initialize the skill registry."""
        self._skills: dict[str, BaseSkill] = {}
        self._metadata: dict[str, SkillMetadata] = {}
        self._loader = SkillLoader()
        self._initialized = False

    @classmethod
    def get_instance(cls) -> "SkillRegistry":
        """Get the singleton registry instance.

        Returns:
            The global SkillRegistry instance
        """
        global _registry_instance
        if _registry_instance is None:
            _registry_instance = cls()
            _registry_instance.initialize()
        return _registry_instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (for testing)."""
        global _registry_instance
        _registry_instance = None

    def initialize(self) -> None:
        """Initialize the registry by discovering and loading skills."""
        if self._initialized:
            return

        logger.info("Initializing skill registry...")

        # Discover filesystem-defined skills
        discovered = self._loader.discover_skills()
        for metadata in discovered:
            self._metadata[metadata.name] = metadata

        # Register built-in skills
        self._register_builtin_skills()

        self._initialized = True
        logger.info(f"Registry initialized with {len(self._skills)} skills")

    def _register_builtin_skills(self) -> None:
        """Register the built-in skill implementations."""
        from app.copilot.skills.builtin.analyze import AnalyzeSkill
        from app.copilot.skills.builtin.compare import CompareSkill
        from app.copilot.skills.builtin.evaluate import EvaluateSkill
        from app.copilot.skills.builtin.query import QuerySkill
        from app.copilot.skills.builtin.summarize import SummarizeSkill

        builtin_skills = [
            EvaluateSkill(),
            CompareSkill(),
            AnalyzeSkill(),
            QuerySkill(),
            SummarizeSkill(),
        ]

        for skill in builtin_skills:
            self.register(skill)
            # Merge with any filesystem metadata
            if skill.name in self._metadata:
                # Filesystem metadata takes precedence for instructions
                fs_meta = self._metadata[skill.name]
                if fs_meta.instructions:
                    skill._metadata.instructions = fs_meta.instructions

    def register(self, skill: BaseSkill) -> None:
        """Register a skill.

        Args:
            skill: Skill instance to register
        """
        self._skills[skill.name] = skill
        if skill.name not in self._metadata:
            self._metadata[skill.name] = skill.metadata
        logger.debug(f"Registered skill: {skill.name}")

    def unregister(self, skill_name: str) -> None:
        """Unregister a skill.

        Args:
            skill_name: Name of the skill to unregister
        """
        if skill_name in self._skills:
            del self._skills[skill_name]
            logger.debug(f"Unregistered skill: {skill_name}")

    def get_skill(self, skill_name: str) -> BaseSkill | None:
        """Get a skill by name.

        Args:
            skill_name: Name of the skill

        Returns:
            Skill instance or None if not found
        """
        return self._skills.get(skill_name)

    def get_metadata(self, skill_name: str) -> SkillMetadata | None:
        """Get skill metadata by name.

        Args:
            skill_name: Name of the skill

        Returns:
            Skill metadata or None if not found
        """
        return self._metadata.get(skill_name)

    def list_skills(self) -> list[BaseSkill]:
        """List all registered skills.

        Returns:
            List of skill instances
        """
        return list(self._skills.values())

    def list_metadata(self) -> list[SkillMetadata]:
        """List metadata for all known skills.

        Returns:
            List of skill metadata
        """
        return list(self._metadata.values())

    def find_skills_by_tag(self, tag: str) -> list[BaseSkill]:
        """Find skills with a specific tag.

        Args:
            tag: Tag to search for

        Returns:
            List of matching skills
        """
        return [skill for skill in self._skills.values() if tag in skill.metadata.tags]

    def find_skills_by_query(self, query: str) -> list[BaseSkill]:
        """Find skills relevant to a query (simple keyword matching).

        Args:
            query: Search query

        Returns:
            List of potentially relevant skills
        """
        query_lower = query.lower()
        results = []

        for skill in self._skills.values():
            # Check name, description, and tags
            if (
                query_lower in skill.name.lower()
                or query_lower in skill.metadata.description.lower()
                or any(query_lower in tag.lower() for tag in skill.metadata.tags)
            ):
                results.append(skill)

        return results
