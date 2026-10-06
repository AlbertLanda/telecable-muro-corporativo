from django.contrib import admin
from .models import Asset, Publication


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False
    def has_change_permission(self, request, obj=None):
        return False
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Publication)
class PublicationAdmin(ReadOnlyAdmin):
    list_display = ['number','created_at','published_by','restored_from']


@admin.register(Asset)
class AssetAdmin(ReadOnlyAdmin):
    list_display = ['title','kind','size','created_at']
