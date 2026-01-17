"""
OpenAI LLM provider implementation.
"""

import os

from openai import OpenAI

from ..config import get_config
from .base import LLMProvider, LLMResponse, Message


class OpenAIProvider(LLMProvider):
    """OpenAI API provider using the official OpenAI SDK."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        """
        Initialize the OpenAI provider.

        Args:
            api_key: Optional API key. If not provided, reads from OPENAI_API_KEY env var.
            model: Optional model name. If not provided, uses config or defaults to gpt-4o.
        """
        config = get_config()

        # Get API key - prefer explicit, then env var
        if api_key:
            self._api_key = api_key
        else:
            self._api_key = os.environ.get("OPENAI_API_KEY")
            if not self._api_key:
                raise ValueError(
                    "OpenAI API key not found. Set OPENAI_API_KEY environment variable."
                )

        # Get model - prefer explicit, then config (if provider is openai), then default
        if model:
            self._model = model
        elif config.llm_provider == "openai":
            self._model = config.llm_model
        else:
            self._model = "gpt-4o"

        self._client = OpenAI(api_key=self._api_key)

    @property
    def name(self) -> str:
        return "openai"

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
        Generate a response using OpenAI's Chat Completions API.

        Args:
            messages: List of conversation messages.
            system_prompt: Optional system prompt.
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature (0-2 for OpenAI).

        Returns:
            LLMResponse with the generated content.
        """
        # Convert messages to OpenAI format
        openai_messages = []

        # Add system prompt as first message if provided
        if system_prompt:
            openai_messages.append({"role": "system", "content": system_prompt})

        # Add conversation messages
        for msg in messages:
            if msg.role in ("user", "assistant", "system"):
                openai_messages.append({"role": msg.role, "content": msg.content})

        # Clamp temperature to OpenAI's valid range (0-2)
        temperature = max(0.0, min(2.0, temperature))

        # Make API call
        response = self._client.chat.completions.create(
            model=self._model,
            messages=openai_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        # Extract content
        content = response.choices[0].message.content or ""

        # Build usage dict if available
        usage = None
        if response.usage:
            usage = {
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            }

        return LLMResponse(
            content=content,
            model=response.model,
            usage=usage,
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
        Generate a response using OpenAI with an image input (vision).

        Args:
            prompt: The text prompt to accompany the image.
            image_base64: Base64-encoded image data.
            image_media_type: MIME type of the image.
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature.

        Returns:
            LLMResponse with the generated content.
        """
        # Build the data URL for the image
        data_url = f"data:{image_media_type};base64,{image_base64}"

        # Build message with image in OpenAI's vision format
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": data_url,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ]

        # Use a vision-capable model
        # gpt-4o and gpt-4-turbo support vision natively
        vision_model = self._model
        if "gpt-4o" not in vision_model and "gpt-4-turbo" not in vision_model:
            # Fall back to gpt-4o for vision if current model doesn't support it
            vision_model = "gpt-4o"

        # Clamp temperature to OpenAI's valid range (0-2)
        temperature = max(0.0, min(2.0, temperature))

        response = self._client.chat.completions.create(
            model=vision_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        # Extract content
        content = response.choices[0].message.content or ""

        # Build usage dict if available
        usage = None
        if response.usage:
            usage = {
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            }

        return LLMResponse(
            content=content,
            model=response.model,
            usage=usage,
            raw_response=response,
        )
