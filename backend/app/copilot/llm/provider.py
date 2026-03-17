import logging
from enum import StrEnum

from pydantic_ai.models import Model

from app.config.env import settings

logger = logging.getLogger("axis.copilot.llm")


class LLMProviderType(StrEnum):
    """Supported LLM providers."""

    OPENAI = "openai"
    ANTHROPIC = "anthropic"


# Default model configurations by provider
class DEFAULT_MODELS(StrEnum):
    """Default model names by provider."""

    OPENAI = "gpt-5.2"
    ANTHROPIC = "claude-sonnet-4-6"


class LLMProvider:
    """Credential-aware pydantic-ai model factory.

    Reads API keys from settings, constructs the correct pydantic-ai Model
    instance, and caches it for the lifetime of the object. Use _get_model()
    to obtain a Model for passing to a pydantic-ai Agent.
    """

    def __init__(
        self,
        provider: LLMProviderType | str = LLMProviderType.OPENAI,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> None:
        """Initialize with provider type, optional model override, and generation params."""
        if isinstance(provider, str):
            provider = LLMProviderType(provider)

        self.provider = provider
        self.model = model or DEFAULT_MODELS[provider.name].value
        self.temperature = temperature
        self.max_tokens = max_tokens

        self._model: Model | None = None
        self._verify_configuration()

    def _verify_configuration(self) -> None:
        if self.provider == LLMProviderType.OPENAI:
            if not settings.openai_api_key and not settings.gateway_api_key:
                logger.warning("OpenAI API key not configured")
        elif self.provider == LLMProviderType.ANTHROPIC and not settings.anthropic_api_key:
            logger.warning("Anthropic API key not configured")

    def _get_model(self) -> Model:
        """Get or create the pydantic-ai model instance (cached)."""
        if self._model is not None:
            return self._model

        if self.provider == LLMProviderType.OPENAI:
            from pydantic_ai.models.openai import OpenAIModel
            from pydantic_ai.providers.openai import OpenAIProvider

            api_key = settings.gateway_api_key or settings.openai_api_key
            if not api_key:
                raise ValueError("OpenAI API key not configured")

            self._model = OpenAIModel(
                self.model,
                provider=OpenAIProvider(
                    api_key=api_key,
                    base_url=settings.openai_api_base or None,
                ),
            )

        elif self.provider == LLMProviderType.ANTHROPIC:
            from pydantic_ai.models.anthropic import AnthropicModel
            from pydantic_ai.providers.anthropic import AnthropicProvider

            api_key = settings.anthropic_api_key
            if not api_key:
                raise ValueError("Anthropic API key not configured")

            self._model = AnthropicModel(
                self.model,
                provider=AnthropicProvider(api_key=api_key),
            )

        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

        logger.info("Created LLM model: %s/%s", self.provider.value, self.model)
        return self._model

    @classmethod
    def is_configured(cls, provider: LLMProviderType | str) -> bool:
        """Check if a provider has valid credentials."""
        if isinstance(provider, str):
            provider = LLMProviderType(provider)
        if provider == LLMProviderType.OPENAI:
            return bool(settings.openai_api_key or settings.gateway_api_key)
        if provider == LLMProviderType.ANTHROPIC:
            return bool(settings.anthropic_api_key)
        return False

    @classmethod
    def get_configured_providers(cls) -> list[LLMProviderType]:
        """Return all providers that have valid credentials."""
        return [p for p in LLMProviderType if cls.is_configured(p)]

    @classmethod
    def get_default_provider(cls) -> LLMProviderType | None:
        """Return the default configured provider (prefers OpenAI)."""
        configured = cls.get_configured_providers()
        if not configured:
            return None
        if LLMProviderType.OPENAI in configured:
            return LLMProviderType.OPENAI
        return configured[0]
