# pricing.py - Gemini prices in ONE place, used by the chat and the billing dashboard

from datetime import date


def prices_for(day):
    """Price per 1M tokens on a given day: [input, cached input, output, thinking].
    Thinking is billed at the output price. Prices double from Dec 1, 2026."""
    if day >= date(2026, 12, 1):
        return [4.00, 0.20, 20.00, 20.00]
    return [2.00, 0.10, 10.00, 10.00]


def cost_of(day, input_tokens, cached_tokens, output_tokens, thinking_tokens):
    """Dollar cost of one Gemini call. input_tokens = the NOT cached input tokens."""
    prices = prices_for(day)
    tokens = [input_tokens, cached_tokens, output_tokens, thinking_tokens]
    return sum(tokens[i] / 1_000_000 * prices[i] for i in range(4))
