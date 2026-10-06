import calendar
import secrets
import uuid
from datetime import date
from pathlib import Path
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


def asset_path(instance, filename):
    return f'assets/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


def display_token():
    return secrets.token_urlsafe(32)


class Asset(models.Model):
    KINDS = [('image','Imagen'),('video','Video MP4'),('audio','Audio')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField('Nombre', max_length=120)
    kind = models.CharField(max_length=10, choices=KINDS)
    file = models.FileField(upload_to=asset_path)
    content_type = models.CharField(max_length=80)
    size = models.PositiveBigIntegerField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} · {self.get_kind_display()}'


class Wall(models.Model):
    name = models.CharField('Nombre del muro', max_length=80, default='Somos Telecable')
    welcome_title = models.CharField('Titular de bienvenida', max_length=100, default='La conexión más importante somos nosotros.')
    welcome_body = models.CharField('Texto de bienvenida', max_length=180, default='Historias y momentos que nos acercan.')
    ticker = models.CharField('Mensaje inferior', max_length=220, default='Conectando oportunidades.')
    interval_minutes = models.PositiveSmallIntegerField('Minutos de muro entre videos', default=15, choices=[(1,'1 minuto'),(5,'5 minutos'),(10,'10 minutos'),(15,'15 minutos')])
    videos_per_turn = models.CharField('Videos por turno', max_length=5, choices=[('one','Un video'),('all','Toda la lista')], default='all')
    quiz_enabled = models.BooleanField('Mostrar reto de palabras', default=True)
    qr_enabled = models.BooleanField('Mostrar QR de Telecable', default=True)
    music = models.ForeignKey(Asset, verbose_name='Música de fondo', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    revision = models.PositiveIntegerField(default=0)
    current_publication = models.ForeignKey('Publication', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        permissions = [('edit_wall','Editar contenido del muro'),('publish_wall','Publicar y recuperar versiones del muro'),('manage_displays','Administrar enlaces de pantallas')]

    def clean(self):
        if self.music_id and self.music.kind != 'audio':
            raise ValidationError({'music':'Selecciona un archivo de audio.'})

    def __str__(self):
        return self.name


class Content(models.Model):
    KINDS = [('image','Imagen / anuncio'),('video','Video'),('message','Mensaje'),('event','Evento'),('recognition','Reconocimiento')]
    wall = models.ForeignKey(Wall, on_delete=models.CASCADE, related_name='contents')
    kind = models.CharField('Tipo de contenido', max_length=16, choices=KINDS)
    title = models.CharField('Título', max_length=100)
    body = models.CharField('Texto de apoyo', max_length=250, blank=True)
    asset = models.ForeignKey(Asset, verbose_name='Archivo', on_delete=models.PROTECT, null=True, blank=True)
    event_at = models.DateTimeField('Fecha y hora del evento', null=True, blank=True)
    location = models.CharField('Lugar del evento', max_length=100, blank=True)
    duration_seconds = models.PositiveSmallIntegerField('Segundos por imagen o mensaje', default=16, validators=[MinValueValidator(8),MaxValueValidator(120)])
    sort_order = models.PositiveSmallIntegerField('Orden (menor aparece primero)', default=10)
    enabled = models.BooleanField('Incluir al publicar', default=True)
    starts_at = models.DateTimeField('Mostrar desde', null=True, blank=True)
    ends_at = models.DateTimeField('Retirar el', null=True, blank=True)

    class Meta:
        ordering = ['sort_order','pk']

    def clean(self):
        errors = {}
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            errors['ends_at'] = 'La fecha de retiro debe ser posterior al inicio.'
        if self.kind in ('image','video') and (not self.asset_id or self.asset.kind != self.kind):
            errors['asset'] = 'Selecciona un archivo del mismo tipo que el contenido.'
        if self.kind not in ('image','video') and self.asset_id:
            errors['asset'] = 'Este tipo utiliza texto; deja el archivo vacío.'
        if self.kind == 'event' and not self.event_at:
            errors['event_at'] = 'Indica cuándo será el evento.'
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return self.title


class Birthday(models.Model):
    wall = models.ForeignKey(Wall, on_delete=models.CASCADE, related_name='birthdays')
    name = models.CharField('Nombre', max_length=80)
    department = models.CharField('Área', max_length=80, blank=True)
    day = models.PositiveSmallIntegerField('Día', validators=[MinValueValidator(1),MaxValueValidator(31)])
    month = models.PositiveSmallIntegerField('Mes', choices=[(i,calendar.month_name[i]) for i in range(1,13)])
    enabled = models.BooleanField('Incluir al publicar', default=True)

    class Meta:
        ordering = ['month','day','name']

    def clean(self):
        try:
            date(2000, self.month, self.day)
        except (ValueError,TypeError):
            raise ValidationError('Selecciona un día y mes válidos.')


class Publication(models.Model):
    wall = models.ForeignKey(Wall, on_delete=models.CASCADE, related_name='publications')
    number = models.PositiveIntegerField()
    draft_revision = models.PositiveIntegerField()
    snapshot = models.JSONField()
    assets = models.ManyToManyField(Asset, related_name='publications')
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    restored_from = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-number']
        constraints = [models.UniqueConstraint(fields=['wall','number'], name='unique_wall_publication')]


class Display(models.Model):
    wall = models.ForeignKey(Wall, on_delete=models.CASCADE, related_name='displays')
    name = models.CharField('Nombre de la pantalla', max_length=100)
    token = models.CharField(max_length=64, default=display_token, unique=True, editable=False)
    active = models.BooleanField('Acceso habilitado', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
