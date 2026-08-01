from django.db.models import Sum
from django.utils import timezone
from datetime import timedelta
from admin_portal.models import LLMUsageLog


def get_user_usage_summary(user, days=30):
    since = timezone.now() - timedelta(days=days)

    qs = LLMUsageLog.objects.filter(user=user, created_at__gte=since)

    totals = qs.aggregate(
        total_tokens=Sum("total_tokens"),
        total_cost=Sum("cost_usd"),
        prompt_tokens=Sum("prompt_tokens"),
        completion_tokens=Sum("completion_tokens"),
    )

    by_provider = (
        qs.values("provider")
        .annotate(
            total_tokens=Sum("total_tokens"),
            total_cost=Sum("cost_usd"),
        )
        .order_by("-total_tokens")
    )

    by_model = (
        qs.values("model")
        .annotate(
            total_tokens=Sum("total_tokens"),
            total_cost=Sum("cost_usd"),
        )
        .order_by("-total_tokens")
    )

    return {
        "totals": totals,
        "by_provider": list(by_provider),
        "by_model": list(by_model),
    }
