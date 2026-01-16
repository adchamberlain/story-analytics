"""
Claude LLM provider implementation.
"""

import anthropic

from ..config import get_config
from .base import LLMProvider, LLMResponse, Message


class ClaudeProvider(LLMProvider):
    """Claude API provider using Anthropic SDK."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        config = get_config()
        self._api_key = api_key or config.llm_api_key
        self._model = model or config.llm_model
        self._client = anthropic.Anthropic(api_key=self._api_key)

    @property
    def name(self) -> str:
        return "claude"

    @property
    def model(self) -> str:
        return self._model

    def generate(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Generate a response using Claude.

        Args:
            messages: List of conversation messages.
            system_prompt: Optional system prompt.
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature.

        Returns:
            LLMResponse with the generated content.
        """
        # Convert messages to Anthropic format
        anthropic_messages = []
        for msg in messages:
            if msg.role in ("user", "assistant"):
                anthropic_messages.append({"role": msg.role, "content": msg.content})

        # Build request kwargs
        kwargs = {
            "model": self._model,
            "max_tokens": max_tokens,
            "messages": anthropic_messages,
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        if temperature is not None:
            kwargs["temperature"] = temperature

        # Make API call
        response = self._client.messages.create(**kwargs)

        # Extract content
        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        return LLMResponse(
            content=content,
            model=response.model,
            usage={
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
            raw_response=response,
        )

    def generate_with_image(
        self,
        prompt: str,
        image_base64: str,
        image_media_type: str = "image/png",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> LLMResponse:
        """
        Generate a response using Claude with an image input.

        Args:
            prompt: The text prompt to accompany the image.
            image_base64: Base64-encoded image data.
            image_media_type: MIME type of the image.
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature.

        Returns:
            LLMResponse with the generated content.
        """
        # Build message with image
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image_media_type,
                            "data": image_base64,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ]

        response = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
        )

        # Extract content
        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        return LLMResponse(
            content=content,
            model=response.model,
            usage={
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
            raw_response=response,
        )


def get_provider() -> LLMProvider:
    """Factory function to get the configured LLM provider."""
    config = get_config()
    provider_name = config.llm_provider

    if provider_name == "claude":
        return ClaudeProvider()
    else:
        raise ValueError(f"Unknown LLM provider: {provider_name}")
