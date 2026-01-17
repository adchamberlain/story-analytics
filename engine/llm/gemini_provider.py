"""
Google Gemini LLM provider implementation using Google Generative AI SDK.
"""

import os
import time
from typing import Any

import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

from ..config import get_config
from .base import LLMProvider, LLMResponse, Message


class GeminiProvider(LLMProvider):
    """Google Gemini API provider using the official Google AI SDK."""

    # Default models
    DEFAULT_MODEL = "gemini-1.5-pro"
    VISION_MODEL = "gemini-1.5-pro"  # Also supports vision

    # Rate limit retry settings
    MAX_RETRIES = 3
    RETRY_DELAY = 2  # seconds

    def __init__(self, api_key: str | None = None, model: str | None = None):
        """
        Initialize the Gemini provider.

        Args:
            api_key: Optional API key. If not provided, reads from GOOGLE_API_KEY env var.
            model: Optional model name. If not provided, uses config or defaults to gemini-1.5-pro.
        """
        config = get_config()

        # Try multiple environment variable names for API key
        self._api_key = api_key
        if not self._api_key:
            # Check config first, then fall back to common env var names
            try:
                self._api_key = config.llm_api_key
            except ValueError:
                pass

        if not self._api_key:
            self._api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get(
                "GEMINI_API_KEY"
            )

        if not self._api_key:
            raise ValueError(
                "Google API key not found. Set GOOGLE_API_KEY or GEMINI_API_KEY "
                "environment variable, or configure in engine_config.yaml"
            )

        # Configure the SDK
        genai.configure(api_key=self._api_key)

        # Get model - prefer explicit, then config (if provider is gemini), then default
        if model:
            self._model = model
        elif config.llm_provider == "gemini":
            self._model = config.llm_model
        else:
            self._model = self.DEFAULT_MODEL

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def model(self) -> str:
        return self._model

    def _clamp_temperature(self, temperature: float) -> float:
        """
        Clamp temperature to Gemini's valid range (0-1).

        Args:
            temperature: Requested temperature value.

        Returns:
            Temperature clamped to [0, 1] range.
        """
        return max(0.0, min(1.0, temperature))

    def _handle_rate_limit(self, attempt: int) -> None:
        """
        Handle rate limiting with exponential backoff.

        Args:
            attempt: Current retry attempt number (0-indexed).
        """
        delay = self.RETRY_DELAY * (2**attempt)
        time.sleep(delay)

    def _get_safety_settings(self) -> list[dict[str, str]]:
        """
        Get safety settings configured to be permissive for dashboard generation.

        Returns:
            List of safety setting dictionaries.
        """
        return [
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_ONLY_HIGH",
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_ONLY_HIGH",
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_ONLY_HIGH",
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_ONLY_HIGH",
            },
        ]

    def generate(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Generate a response using Gemini.

        Args:
            messages: List of conversation messages.
            system_prompt: Optional system prompt.
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature (0-1 for Gemini).

        Returns:
            LLMResponse with the generated content.
        """
        # Create generation config
        generation_config = genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=self._clamp_temperature(temperature),
        )

        # Create model with system instruction if provided
        model_kwargs: dict[str, Any] = {
            "model_name": self._model,
            "generation_config": generation_config,
            "safety_settings": self._get_safety_settings(),
        }
        if system_prompt:
            model_kwargs["system_instruction"] = system_prompt

        model = genai.GenerativeModel(**model_kwargs)

        # Convert messages to Gemini format
        # Gemini uses "user" and "model" (not "assistant")
        gemini_history = []
        for msg in messages[:-1]:  # All except the last message
            if msg.role == "system":
                # System messages are handled via system_instruction
                continue
            role = "model" if msg.role == "assistant" else "user"
            gemini_history.append({"role": role, "parts": [{"text": msg.content}]})

        # Start chat with history
        chat = model.start_chat(history=gemini_history)

        # Get the last message to send
        last_message = messages[-1].content if messages else ""

        # Handle rate limits with retry logic
        last_exception = None
        for attempt in range(self.MAX_RETRIES):
            try:
                response = chat.send_message(last_message)

                # Check if response was blocked
                if not response.candidates:
                    block_reason = getattr(
                        response.prompt_feedback, "block_reason", "Unknown"
                    )
                    raise ValueError(
                        f"Response blocked by Gemini safety filters: {block_reason}"
                    )

                # Extract content
                content = response.text

                # Build usage dict if available
                usage = None
                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    usage = {
                        "input_tokens": getattr(
                            response.usage_metadata, "prompt_token_count", 0
                        ),
                        "output_tokens": getattr(
                            response.usage_metadata, "candidates_token_count", 0
                        ),
                    }

                return LLMResponse(
                    content=content,
                    model=self._model,
                    usage=usage,
                    raw_response=response,
                )

            except google_exceptions.ResourceExhausted as e:
                # Rate limit hit - retry with backoff
                last_exception = e
                if attempt < self.MAX_RETRIES - 1:
                    self._handle_rate_limit(attempt)
                continue

            except google_exceptions.GoogleAPIError as e:
                # Other API errors - don't retry
                raise RuntimeError(f"Gemini API error: {e}") from e

        # If we get here, all retries failed
        raise RuntimeError(
            f"Gemini rate limit exceeded after {self.MAX_RETRIES} retries: {last_exception}"
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
        Generate a response using Gemini with an image input.

        This is used for QA validation of generated dashboards.

        Args:
            prompt: The text prompt to accompany the image.
            image_base64: Base64-encoded image data.
            image_media_type: MIME type of the image.
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature.

        Returns:
            LLMResponse with the generated content.
        """
        # Create generation config
        generation_config = genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=self._clamp_temperature(temperature),
        )

        # Use vision-capable model
        vision_model = self.VISION_MODEL
        model = genai.GenerativeModel(
            model_name=vision_model,
            generation_config=generation_config,
            safety_settings=self._get_safety_settings(),
        )

        # Create image part
        image_part = {
            "inline_data": {
                "mime_type": image_media_type,
                "data": image_base64,
            }
        }

        # Handle rate limits with retry logic
        last_exception = None
        for attempt in range(self.MAX_RETRIES):
            try:
                # Generate response with image and text
                response = model.generate_content([image_part, prompt])

                # Check if response was blocked
                if not response.candidates:
                    block_reason = getattr(
                        response.prompt_feedback, "block_reason", "Unknown"
                    )
                    raise ValueError(
                        f"Response blocked by Gemini safety filters: {block_reason}"
                    )

                # Extract content
                content = response.text

                # Build usage dict if available
                usage = None
                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    usage = {
                        "input_tokens": getattr(
                            response.usage_metadata, "prompt_token_count", 0
                        ),
                        "output_tokens": getattr(
                            response.usage_metadata, "candidates_token_count", 0
                        ),
                    }

                return LLMResponse(
                    content=content,
                    model=vision_model,
                    usage=usage,
                    raw_response=response,
                )

            except google_exceptions.ResourceExhausted as e:
                # Rate limit hit - retry with backoff
                last_exception = e
                if attempt < self.MAX_RETRIES - 1:
                    self._handle_rate_limit(attempt)
                continue

            except google_exceptions.GoogleAPIError as e:
                raise RuntimeError(f"Gemini API error: {e}") from e

        raise RuntimeError(
            f"Gemini rate limit exceeded after {self.MAX_RETRIES} retries: {last_exception}"
        )
