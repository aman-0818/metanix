from django.urls import path
from . import views
from .views import user_llm_usage_dashboard, admin_llm_usage_dashboard
app_name = 'accounts'

urlpatterns = [
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('session/', views.SessionStatusView.as_view(), name='session-status'),
    path('azure/authorize/', views.AzureAuthorizeView.as_view(), name='azure-authorize'),
    path('azure/token/', views.AzureTokenView.as_view(), name='azure-token'),
    path('azure/logout/', views.AzureLogoutView.as_view(), name='azure-logout'),
    path('users/', views.UserListView.as_view(), name='user-list'),
    path('users/<int:pk>/', views.UserDetailView.as_view(), name='user-detail'),
    path('me/', views.get_current_user, name='current-user'),
]
urlpatterns += [
    path("usage/me/", user_llm_usage_dashboard),
    path("usage/admin/", admin_llm_usage_dashboard),
]
