from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path('', RedirectView.as_view(pattern_name='dashboard', permanent=False)),
    path('admin/', admin.site.urls),
    path('cuentas/entrar/', auth_views.LoginView.as_view(template_name='wall/login.html'), name='login'),
    path('cuentas/salir/', auth_views.LogoutView.as_view(), name='logout'),
    path('', include('wall.urls')),
]
