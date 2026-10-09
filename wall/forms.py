import warnings
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from django import forms
from django.conf import settings
from .models import Asset, Birthday, Content, Display, Wall


class RevisionForm(forms.ModelForm):
    revision = forms.IntegerField(widget=forms.HiddenInput)


class WallForm(RevisionForm):
    class Meta:
        model = Wall
        fields = ['name','welcome_title','welcome_body','ticker','interval_minutes','videos_per_turn','quiz_enabled','qr_enabled','music']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['music'].queryset = Asset.objects.filter(kind='audio')


class ContentForm(RevisionForm):
    class Meta:
        model = Content
        fields = ['kind','title','body','asset','event_at','location','duration_seconds','sort_order','enabled','starts_at','ends_at']
        widgets = {name: forms.DateTimeInput(format='%Y-%m-%dT%H:%M', attrs={'type':'datetime-local'}) for name in ['event_at','starts_at','ends_at']}
        help_texts = {'starts_at':'Opcional. Hora de Lima.','ends_at':'Opcional. Se retira automáticamente después de publicar.','duration_seconds':'Los videos siempre terminan completos.','asset':'Para imágenes y videos. Sube primero el archivo en Biblioteca.'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['asset'].queryset = Asset.objects.exclude(kind='audio')


class BirthdayForm(RevisionForm):
    class Meta:
        model = Birthday
        fields = ['name','department','day','month','enabled']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['month'].choices = [(i,n) for i,n in enumerate(['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],1)]


class DisplayForm(forms.ModelForm):
    class Meta:
        model = Display
        fields = ['name']


class AssetForm(forms.Form):
    title = forms.CharField(label='Nombre del archivo', max_length=120)
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
