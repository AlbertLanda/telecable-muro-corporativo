from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path
from django.views.generic import RedirectView
from . import health

handler500 = 'muro.health.server_error'

urlpatterns = [
    path('health/live/', health.live, name='health_live'),
    path('health/ready/', health.ready, name='health_ready'),
    path('', RedirectView.as_view(pattern_name='dashboard', permanent=False)),
    path('admin/', admin.site.urls),
    path('cuentas/entrar/', auth_views.LoginView.as_view(template_name='wall/login.html'), name='login'),
    path('cuentas/salir/', auth_views.LogoutView.as_view(), name='logout'),
    path('', include('wall.urls')),
]
