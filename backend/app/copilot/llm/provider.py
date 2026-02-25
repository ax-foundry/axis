import logging
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from pydantic_ai import Agent
from pydantic_ai.models import Model

from app.config import settings

logger = logging.getLogger("axis.copilot.llm")


class LLMProviderType(StrEnum):
    """Supported LLM providers."""

    OPENAI = "openai"
    ANTHROPIC = "anthropic"


@dataclass
class LLMConfig:
    """Configuration for an LLM instance."""

    provider: LLMProviderType
    model: str
    temperature: float = 0.7
    max_tokens: int = 4096


# Default model configurations by provider
DEFAULT_MODELS: dict[LLMProviderType, str] = {
    LLMProviderType.OPENAI: "gpt-4o",
    LLMProviderType.ANTHROPIC: "claude-3-5-sonnet-20241022",
}


class LLMProvider:
    """Unified LLM provider with streaming and thought callback support.

    Provides a consistent interface for working with different LLM providers
    (OpenAI, Anthropic) and integrates with the thought streaming system.
    """

    def __init__(
        self,
        provider: LLMProviderType | str = LLMProviderType.OPENAI,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> None:
        """Initialize the LLM provider.

        Args:
            provider: LLM provider to use (openai or anthropic)
            model: Model name to use (defaults to provider's recommended model)
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
        """
        if isinstance(provider, str):
            provider = LLMProviderType(provider)

        self.provider = provider
        self.model = model or DEFAULT_MODELS[provider]
        self.temperature = temperature
        self.max_tokens = max_tokens

        self._model: Model | None = None
        self._verify_configuration()

    def _verify_configuration(self) -> None:
        """Verify that the provider is properly configured."""
        if self.provider == LLMProviderType.OPENAI:
            if not settings.openai_api_key and not settings.gateway_api_key:
                logger.warning("OpenAI API key not configured")
        elif self.provider == LLMProviderType.ANTHROPIC and not settings.anthropic_api_key:
            logger.warning("Anthropic API key not configured")

    def _get_model(self) -> Model:
        """Get or create the pydantic-ai model instance."""
        if self._model is not None:
            return self._model

        if self.provider == LLMProviderType.OPENAI:
            from pydantic_ai.models.openai import OpenAIModel
            from pydantic_ai.providers.openai import OpenAIProvider

            api_key = settings.gateway_api_key or settings.openai_api_key
            base_url = settings.openai_api_base

            if not api_key:
                raise ValueError("OpenAI API key not configured")

            # Create OpenAI provider with credentials
            oai_provider = OpenAIProvider(
                api_key=api_key,
                base_url=base_url if base_url else None,
            )
            self._model = OpenAIModel(
                self.model,
                provider=oai_provider,
            )

        elif self.provider == LLMProviderType.ANTHROPIC:
            from pydantic_ai.models.anthropic import AnthropicModel
            from pydantic_ai.providers.anthropic import AnthropicProvider

            api_key = settings.anthropic_api_key

            if not api_key:
                raise ValueError("Anthropic API key not configured")

            # Create Anthropic provider with credentials
            ant_provider = AnthropicProvider(api_key=api_key)
            self._model = AnthropicModel(
                self.model,
                provider=ant_provider,
            )

        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

        logger.info(f"Created LLM model: {self.provider.value}/{self.model}")
        return self._model

    def create_agent(
        self,
        system_prompt: str,
        result_type: type[Any] | None = None,
        tools: list[Any] | None = None,
    ) -> Agent[Any, Any]:
        """Create a pydantic-ai Agent with the configured model.

        Args:
            system_prompt: System prompt for the agent
            result_type: Expected result type (for structured output)
            tools: List of tools the agent can use

        Returns:
            Configured Agent instance
        """
        model = self._get_model()

        agent_kwargs: dict[str, Any] = {
            "model": model,
            "system_prompt": system_prompt,
        }

        if result_type is not None:
            agent_kwargs["output_type"] = result_type

        if tools:
            agent_kwargs["tools"] = tools

        agent = Agent(**agent_kwargs)

        return agent

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        on_token: Callable[[str], None] | None = None,
    ) -> str:
        """Generate a response from the LLM.

        Args:
            prompt: User prompt/message
            system_prompt: Optional system prompt
            on_token: Optional callback for streaming tokens

        Returns:
            Generated response text
        """
        agent = self.create_agent(system_prompt or "You are a helpful AI assistant.")

        result = await agent.run(prompt)
        return result.output

    async def generate_structured(
        self,
        prompt: str,
        result_type: type[Any],
        system_prompt: str | None = None,
    ) -> Any:
        """Generate a structured response from the LLM.

        Args:
            prompt: User prompt/message
            result_type: Pydantic model for the expected response
            system_prompt: Optional system prompt

        Returns:
            Parsed response of the specified type
        """
        agent = self.create_agent(
            system_prompt or "You are a helpful AI assistant.",
            result_type=result_type,
        )

        result = await agent.run(prompt)
        return result.output

    @classmethod
    def is_configured(cls, provider: LLMProviderType | str) -> bool:
        """Check if a provider is configured with valid credentials.

        Args:
            provider: Provider to check

        Returns:
            True if the provider has valid credentials
        """
        if isinstance(provider, str):
            provider = LLMProviderType(provider)

        if provider == LLMProviderType.OPENAI:
            return bool(settings.openai_api_key or settings.gateway_api_key)
        elif provider == LLMProviderType.ANTHROPIC:
            return bool(settings.anthropic_api_key)

        return False

    @classmethod
    def get_configured_providers(cls) -> list[LLMProviderType]:
        """Get list of providers that are properly configured.

        Returns:
            List of configured provider types
        """
        configured = []
        for provider in LLMProviderType:
            if cls.is_configured(provider):
                configured.append(provider)
        return configured

    @classmethod
    def get_default_provider(cls) -> LLMProviderType | None:
        """Get the default configured provider.

        Prefers OpenAI if both are configured.

        Returns:
            Default provider type, or None if none configured
        """
        configured = cls.get_configured_providers()
        if not configured:
            return None

        # Prefer OpenAI for compatibility
        if LLMProviderType.OPENAI in configured:
            return LLMProviderType.OPENAI
        return configured[0]
