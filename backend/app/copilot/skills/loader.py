import json
import logging
from pathlib import Path

from app.copilot.skills.base import SkillMetadata

logger = logging.getLogger("axis.copilot.skills.loader")

# Default skills directory path
DEFAULT_SKILLS_DIR = Path(__file__).parent.parent.parent / "skills"


class SkillLoader:
    """Loads skill definitions from the filesystem.

    Skills are defined in directories with:
    - metadata.json: Skill configuration
    - SKILL.md: Detailed instructions (optional)
    """

    def __init__(self, skills_dir: Path | None = None) -> None:
        """Initialize the skill loader.

        Args:
            skills_dir: Directory containing skill definitions
        """
        self.skills_dir = skills_dir or DEFAULT_SKILLS_DIR

    def discover_skills(self) -> list[SkillMetadata]:
        """Discover all skills in the skills directory.

        Returns:
            List of skill metadata for found skills
        """
        skills = []

        if not self.skills_dir.exists():
            logger.warning(f"Skills directory does not exist: {self.skills_dir}")
            return skills

        for skill_dir in self.skills_dir.iterdir():
            if skill_dir.is_dir():
                metadata = self._load_skill_metadata(skill_dir)
                if metadata:
                    skills.append(metadata)

        logger.info(f"Discovered {len(skills)} skills in {self.skills_dir}")
        return skills

    def _load_skill_metadata(self, skill_dir: Path) -> SkillMetadata | None:
        """Load skill metadata from a skill directory.

        Args:
            skill_dir: Path to the skill directory

        Returns:
            SkillMetadata or None if loading fails
        """
        metadata_file = skill_dir / "metadata.json"

        if not metadata_file.exists():
            logger.debug(f"No metadata.json in {skill_dir}")
            return None

        try:
            with metadata_file.open() as f:
                data = json.load(f)

            metadata = SkillMetadata.from_dict(data)

            # Load optional instructions
            instructions_file = skill_dir / "SKILL.md"
            if instructions_file.exists():
                with instructions_file.open() as f:
                    metadata.instructions = f.read()

            logger.debug(f"Loaded skill: {metadata.name}")
            return metadata

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in {metadata_file}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error loading skill from {skill_dir}: {e}")
            return None

    def load_skill(self, skill_name: str) -> SkillMetadata | None:
        """Load a specific skill by name.

        Args:
            skill_name: Name of the skill to load

        Returns:
            SkillMetadata or None if not found
        """
        skill_dir = self.skills_dir / skill_name

        if not skill_dir.exists():
            logger.warning(f"Skill directory not found: {skill_dir}")
            return None

        return self._load_skill_metadata(skill_dir)
