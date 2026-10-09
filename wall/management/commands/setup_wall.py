from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from wall.services import get_wall


class Command(BaseCommand):
    help = 'Crea el muro y el grupo Editores de Imagen; no crea contraseñas ni publica contenido.'

    def handle(self,*args,**options):
        get_wall()
        group,_ = Group.objects.get_or_create(name='Editores de Imagen')
        group.permissions.set(Permission.objects.filter(content_type__app_label='wall',codename__in=['edit_wall','publish_wall']))
        self.stdout.write(self.style.SUCCESS('Muro y grupo Editores de Imagen preparados.'))
