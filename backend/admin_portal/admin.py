from django.contrib import admin
from .models import LLMUsageLog


@admin.register(LLMUsageLog)
class LLMUsageLogAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "provider",
        "model",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "cost_usd",
        "latency_ms",
        "created_at",
    )
    list_filter = ("provider", "model", "created_at")
    search_fields = ("user__username", "model")
    ordering = ("-created_at",)
