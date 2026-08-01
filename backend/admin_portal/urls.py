from django.urls import path
from . import views

urlpatterns = [
    # Dashboard
    path('dashboard/stats/', views.admin_dashboard_stats, name='admin-dashboard-stats'),

    # Admin — User management
    path('users/', views.admin_user_list, name='admin-users'),
    path('users/search/', views.admin_user_search, name='admin-user-search'),
    path('users/sync/', views.admin_user_sync, name='admin-user-sync'),
    path('users/<int:user_id>/', views.admin_user_toggle, name='admin-user-toggle'),
    path('users/<int:user_id>/permissions/', views.manage_user_permissions, name='user-permissions'),

    # LLM Providers (admin)
    path('llm-providers/', views.get_llm_providers, name='llm-providers'),
    path('llm-providers/create/', views.create_llm_provider, name='create-llm-provider'),
    path('llm-providers/<int:provider_id>/', views.update_llm_provider, name='update-llm-provider'),

    # API Key Management (encrypted storage — admin only)
    path('api-keys/', views.api_key_status, name='api-key-status'),
    path('api-keys/<int:provider_id>/set/', views.api_key_set, name='api-key-set'),
    path('api-keys/<int:provider_id>/delete/', views.api_key_delete, name='api-key-delete'),
    path('api-keys/<int:provider_id>/verify/', views.api_key_verify, name='api-key-verify'),
    path('api-keys/migrate/', views.api_key_migrate_from_env, name='api-key-migrate'),

    # Conversations
    path('conversations/', views.ConversationListView.as_view(), name='conversations'),
    path('conversations/<int:pk>/', views.ConversationDetailView.as_view(), name='conversation-detail'),

    # Projects & Saved Prompts (sidebar organization)
    path('projects/', views.ProjectListView.as_view(), name='projects'),
    path('projects/<int:pk>/', views.ProjectDetailView.as_view(), name='project-detail'),
    path('saved-prompts/', views.SavedPromptListView.as_view(), name='saved-prompts'),
    path('saved-prompts/<int:pk>/', views.SavedPromptDetailView.as_view(), name='saved-prompt-detail'),

    # Chat
    path('chat/', views.ChatView.as_view(), name='chat'),
    path('chat/stream/', views.ChatStreamView.as_view(), name='chat-stream'),
    path('chat/retheme/', views.RethemeView.as_view(), name='chat-retheme'),
    path('messages/<int:message_id>/pptx-status/', views.message_pptx_status, name='message-pptx-status'),
    path('conversations/<int:conversation_id>/export-status/', views.conversation_export_status, name='conversation-export-status'),
    path('messages/<int:message_id>/export/', views.export_message_direct, name='export-message-direct'),

    # Documents
    path('documents/upload/', views.upload_document, name='upload-document'),
    path('documents/', views.list_documents, name='list-documents'),
    path('documents/<int:doc_id>/', views.document_status, name='document-status'),

    # User — own stats & permissions
    path('stats/', views.dashboard_stats, name='user-stats'),
    path('permissions/me/', views.my_permissions, name='my-permissions'),
    path('usage/me/', views.my_usage_stats, name='my-usage'),

    # Admin — usage & logs
    path('usage/admin/', views.admin_usage_stats, name='admin-usage'),
    path('usage/analytics/', views.admin_usage_analytics, name='admin-usage-analytics'),
    path('logs/sign-in/', views.get_sign_in_logs, name='sign-in-logs'),
    path('logs/audit/', views.get_audit_logs, name='audit-logs'),
    path('logs/stats/', views.get_log_stats, name='log-stats'),
    path('logs/llm/', views.get_llm_usage_logs, name='llm-usage-logs'),

    # Document Converter
    path('converter/access/', views.converter_check_access, name='converter-access'),
    path('converter/formats/', views.converter_formats, name='converter-formats'),
    path('converter/outputs/', views.converter_get_outputs, name='converter-outputs'),
    path('converter/convert/', views.converter_convert, name='converter-convert'),
    path('converter/<int:job_id>/status/', views.converter_status, name='converter-status'),
    path('converter/history/', views.converter_history, name='converter-history'),
    path('converter/<int:job_id>/download/', views.converter_download, name='converter-download'),
    path('converter/<int:job_id>/', views.converter_delete, name='converter-delete'),
]
