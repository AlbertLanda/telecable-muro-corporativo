import warnings
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from django import forms
from django.conf import settings
from .models import Asset, Birthday, Content, Display, Wall


class RevisionForm(forms.ModelForm):
    revision = forms.IntegerField(widget=forms.HiddenInput)

    @property
    def sections(self):
        return [{'title':title,'description':description,'fields':[self[name] for name in names]}
                for title,description,names in self.field_groups]


class WallForm(RevisionForm):
    field_groups = [
        ('Identidad y mensajes','Textos que acompañan la programación del muro.', ['name','ticker','welcome_title','welcome_body']),
        ('Reproducción y módulos','Define cómo se alternan los contenidos.', ['interval_minutes','videos_per_turn','music','quiz_enabled','qr_enabled']),
    ]
    class Meta:
        model = Wall
        fields = ['name','welcome_title','welcome_body','ticker','interval_minutes','videos_per_turn','quiz_enabled','qr_enabled','music']
        help_texts = {
            'name':'Se muestra en el encabezado de las pantallas.',
            'ticker':'Mensaje que recorre la franja inferior del muro.',
            'welcome_title':'Aparece cuando no hay anuncios ni celebraciones del día para mostrar.',
            'welcome_body':'Acompaña al titular de bienvenida.',
            'interval_minutes':'Tiempo de anuncios entre turnos de video. No controla la actualización de publicaciones.',
            'videos_per_turn':'Un video por turno o todos los videos incluidos, según su orden.',
            'music':'Selecciona audio de Biblioteca. El sonido se activa desde las opciones de cada TV.',
            'quiz_enabled':'Intercala un reto cuya respuesta se revela automáticamente.',
            'qr_enabled':'Muestra el código que abre telecable.pe desde un celular.',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['music'].queryset = Asset.objects.filter(kind='audio')


class ContentForm(RevisionForm):
    field_groups = [
        ('1. Prepara el anuncio','Elige el formato y el mensaje que verá el equipo.', ['kind','title','body','asset','event_at','location']),
        ('2. Define cuándo se muestra','Las fechas usan la hora de Lima.', ['starts_at','ends_at','duration_seconds','sort_order','enabled']),
    ]
    class Meta:
        model = Content
        fields = ['kind','title','body','asset','event_at','location','duration_seconds','sort_order','enabled','starts_at','ends_at']
        widgets = {**{name: forms.DateTimeInput(format='%Y-%m-%dT%H:%M', attrs={'type':'datetime-local'}) for name in ['event_at','starts_at','ends_at']},'body':forms.Textarea(attrs={'rows':3})}
        help_texts = {
            'kind':'Para fotografías de eventos pasados, elige Imagen / anuncio. Evento crea una tarjeta con fecha y lugar.',
            'title':'Titular visible en el muro. En videos, identifica el clip durante la reproducción.',
            'body':'Opcional. Acompaña a la imagen, mensaje, evento o reconocimiento.',
            'asset':'Selecciona un archivo de Biblioteca del mismo tipo. Subirlo por sí solo no lo muestra en las TV.',
            'event_at':'Fecha del encuentro. Para retirarlo después, completa también «Retirar el».',
            'location':'Ejemplo: sala de capacitación o sede central.',
            'starts_at':'Vacío: disponible al publicar. Con fecha futura: espera hasta ese momento.',
            'ends_at':'Vacío: permanece disponible. Con fecha: se retira automáticamente al llegar esa hora.',
            'duration_seconds':'De 8 a 120 segundos por tarjeta. Los videos se reproducen completos.',
            'sort_order':'Usa 10, 20, 30… para dejar espacio entre anuncios. Los videos tienen su propio turno.',
            'enabled':'Desmárcalo para excluirlo de la siguiente publicación conservándolo en el borrador.',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['asset'].queryset = Asset.objects.exclude(kind='audio')


class BirthdayForm(RevisionForm):
    field_groups = [
        ('1. Registra a la persona','Se guarda una sola vez y se celebra cada año.', ['name','department','day','month']),
        ('2. Personaliza su tarjeta','La imagen y la dedicatoria se muestran juntas el día indicado.', ['photo','greeting','enabled']),
    ]
    class Meta:
        model = Birthday
        fields = ['name','department','day','month','photo','greeting','enabled']
        widgets = {'greeting':forms.Textarea(attrs={'rows':3,'maxlength':180})}
        help_texts = {
            'name':'Nombre que aparecerá en la tarjeta y en el listado de próximos cumpleaños.',
            'department':'Opcional. Área o equipo al que pertenece.',
            'photo':'Opcional. Sube primero la foto a Biblioteca. Se muestra completa; una foto individual se verá mejor a distancia.',
            'greeting':'Opcional, hasta 180 caracteres. Si lo dejas vacío, el muro mostrará una felicitación del equipo.',
            'day':'Se repite cada año, según la fecha de Lima. No se necesita el año de nacimiento.',
            'month':'La tarjeta completa aparece únicamente en el día y mes registrados.',
            'enabled':'Incluye esta persona al publicar. Puedes preparar todos los cumpleaños con anticipación.',
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['month'].choices = [(i,n) for i,n in enumerate(['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],1)]
        self.fields['photo'].queryset = Asset.objects.filter(kind='image')


class DisplayForm(forms.ModelForm):
    class Meta:
        model = Display
        fields = ['name']


class AssetForm(forms.Form):
    title = forms.CharField(label='Nombre del archivo', max_length=120, help_text='Un nombre fácil de encontrar, por ejemplo: Encuentro de equipo · octubre.')
    kind = forms.ChoiceField(label='Tipo', choices=Asset.KINDS)
    file = forms.FileField(label='Archivo', help_text='Imagen JPG/PNG/WebP (15 MB), video MP4 (250 MB) o audio MP3/WAV (50 MB). Para TV, utiliza video H.264 con audio AAC.')

    def clean(self):
        data = super().clean()
        upload, kind = data.get('file'), data.get('kind')
        if not upload or not kind:
            return data
        limit = {'image':settings.MAX_IMAGE_BYTES,'video':settings.MAX_VIDEO_BYTES,'audio':settings.MAX_AUDIO_BYTES}[kind]
        if not upload.size or upload.size > limit:
            raise forms.ValidationError(f'El archivo debe tener contenido y no superar {limit // 1024 // 1024} MB.')
        try:
            if kind == 'image':
                with warnings.catch_warnings():
                    warnings.simplefilter('error', Image.DecompressionBombWarning)
                    image = Image.open(upload)
                    if image.format not in ('JPEG','PNG','WEBP') or image.width * image.height > 25_000_000:
                        raise forms.ValidationError('Usa JPG, PNG o WebP de hasta 25 megapíxeles.')
                    fmt = image.format
                    image.verify()
                extension, mime = {'JPEG':('.jpg','image/jpeg'),'PNG':('.png','image/png'),'WEBP':('.webp','image/webp')}[fmt]
            else:
                header = upload.read(32)
                extension = Path(upload.name).suffix.lower()
                if kind == 'video':
                    if extension != '.mp4' or header[4:8] != b'ftyp':
                        raise forms.ValidationError('Selecciona un MP4 válido. No se convierte el códec automáticamente.')
                    mime = 'video/mp4'
                elif extension == '.mp3' and (header.startswith(b'ID3') or (len(header)>1 and header[0] == 255 and header[1] & 224 == 224)):
                    mime = 'audio/mpeg'
                elif extension == '.wav' and header[:4] == b'RIFF' and header[8:12] == b'WAVE':
                    mime = 'audio/wav'
                else:
                    raise forms.ValidationError('Selecciona audio MP3 o WAV válido.')
            upload.name = 'archivo' + extension
            data['content_type'] = mime
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise forms.ValidationError('No se pudo validar la imagen; utiliza otro archivo.')
        finally:
            upload.seek(0)
        return data
