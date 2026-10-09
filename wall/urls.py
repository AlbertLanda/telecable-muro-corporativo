from django.urls import path
from . import views

urlpatterns = [
    path('panel/',views.dashboard,name='dashboard'),
    path('panel/biblioteca/',views.library,name='library'),
    path('panel/contenido/nuevo/',views.content_edit,name='content_new'),
    path('panel/contenido/<int:pk>/',views.content_edit,name='content_edit'),
    path('panel/cumpleanos/nuevo/',views.birthday_edit,name='birthday_new'),
    path('panel/cumpleanos/<int:pk>/',views.birthday_edit,name='birthday_edit'),
    path('panel/quitar/<str:kind>/<int:pk>/',views.delete_entry,name='delete_entry'),
    path('panel/publicar/',views.publish_draft,name='publish'),
    path('panel/publicaciones/',views.history,name='history'),
    path('panel/publicaciones/<int:pk>/recuperar/',views.restore,name='restore'),
    path('panel/vista-previa/',views.preview,name='preview'),
    path('panel/pantallas/',views.displays,name='displays'),
    path('panel/pantallas/<int:pk>/acceso/',views.display_action,name='display_action'),
    path('panel/archivo/<uuid:asset_id>/',views.editor_media,name='editor_media'),
    path('tv/<str:token>/',views.tv,name='tv'),
    path('tv/<str:token>/manifest/',views.tv_manifest,name='tv_manifest'),
    path('tv/<str:token>/archivo/<uuid:asset_id>/',views.tv_media,name='tv_media'),
]
