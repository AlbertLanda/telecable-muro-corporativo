from getpass import getpass
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError


class Command(BaseCommand):
    help = 'Crea un editor con contraseña interactiva; no cambia usuarios existentes.'

    def add_arguments(self,parser):
        parser.add_argument('username')

    def handle(self,*args,**options):
        user_model = get_user_model()
        if user_model.objects.filter(username=options['username']).exists():
            raise CommandError('Ese usuario ya existe; gestiona su acceso desde /admin/.')
        try:
            group = Group.objects.get(name='Editores de Imagen')
        except Group.DoesNotExist:
            raise CommandError('Ejecuta primero: python manage.py setup_wall')
        password = getpass('Contraseña del editor: ')
        if password != getpass('Repite la contraseña: '):
            raise CommandError('Las contraseñas no coinciden.')
        user = user_model(username=options['username'])
        try:
            validate_password(password,user)
        except ValidationError as error:
            raise CommandError(' '.join(error.messages))
        user.set_password(password)
        user.save()
        user.groups.add(group)
        self.stdout.write(self.style.SUCCESS('Editor creado. Puede entrar en /panel/.'))
