import copy
import io
import tempfile
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path
from PIL import Image
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from .forms import AssetForm, BirthdayForm, ContentForm
from .models import Asset, Birthday, Content, Display, Publication, Wall
from .services import manifest, publish, snapshot


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PublishingTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media = tempfile.TemporaryDirectory()
        cls.media_override = override_settings(MEDIA_ROOT=cls.media.name)
        cls.media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.media_override.disable()
        cls.media.cleanup()

    @classmethod
    def setUpTestData(cls):
        call_command('setup_wall',stdout=io.StringIO())
        cls.wall = Wall.objects.get(pk=1)
        users = get_user_model()
        cls.editor = users.objects.create_user('editor',password='only-for-tests')
        cls.editor.groups.add(Group.objects.get(name='Editores de Imagen'))
        cls.viewer = users.objects.create_user('viewer',password='only-for-tests')
        cls.admin = users.objects.create_superuser('admin','admin@example.test','only-for-tests')
        cls.screen = Display.objects.create(wall=cls.wall,name='TV de pruebas')
        image = io.BytesIO()
        Image.new('RGB',(20,20),'green').save(image,format='PNG')
        cls.asset = Asset.objects.create(title='Foto',kind='image',file=SimpleUploadedFile('foto.png',image.getvalue()),size=len(image.getvalue()),content_type='image/png',created_by=cls.editor)
        movie = (Path(__file__).resolve().parents[1]/'piloto/assets/demo-1.mp4').read_bytes()
        cls.video = Asset.objects.create(title='Clip',kind='video',file=SimpleUploadedFile('clip.mp4',movie),size=len(movie),content_type='video/mp4',created_by=cls.editor)
        cls.post = Content.objects.create(wall=cls.wall,kind='image',title='Titular original',asset=cls.asset)

    def setUp(self):
        self.client.force_login(self.editor)

    def live(self):
        return self.client.get(reverse('tv_manifest',args=[self.screen.token])).json()

    def test_login_permissions_and_editor_cannot_manage_ti(self):
        anonymous = Client()
        self.assertEqual(anonymous.get('/panel/').status_code,302)
        self.client.force_login(self.viewer)
        for url in ['/panel/','/panel/biblioteca/','/panel/publicaciones/','/panel/pantallas/']:
            self.assertEqual(self.client.get(url).status_code,403)
        self.assertEqual(self.client.post('/panel/publicar/',{'revision':0}).status_code,403)
        self.client.force_login(self.editor)
        self.assertEqual(self.client.get('/panel/pantallas/').status_code,403)
        self.assertEqual(self.client.get('/panel/').status_code,200)

    def test_draft_is_invisible_until_publish_and_old_snapshot_stays_immutable(self):
        self.assertEqual(self.live()['version'],0)
        first = publish(self.editor,0)
        self.assertEqual(self.live()['contents'][0]['title'],'Titular original')
        self.post.title = 'Nuevo titular';self.post.save()
        self.assertEqual(self.live()['contents'][0]['title'],'Titular original')
        second = publish(self.editor,0)
        self.assertEqual(self.live()['version'],2)
        self.assertEqual(self.live()['contents'][0]['title'],'Nuevo titular')
        first.refresh_from_db()
        self.assertEqual(first.snapshot['contents'][0]['title'],'Titular original')
        self.assertGreater(second.number,first.number)

    def test_stale_revision_does_not_publish(self):
        with self.assertRaises(ValidationError):
            publish(self.editor,999)
        self.assertEqual(Publication.objects.count(),0)

    def test_recovery_creates_new_version_and_keeps_draft(self):
        first = publish(self.editor,0)
        self.post.title = 'Cambios sin publicar';self.post.save()
        second = publish(self.editor,0,restore=first.pk)
        self.assertEqual(second.restored_from_id,first.pk)
        self.assertEqual(self.live()['contents'][0]['title'],'Titular original')
        self.post.refresh_from_db();self.assertEqual(self.post.title,'Cambios sin publicar')

    def test_schedule_and_lima_birthdays_change_manifest_without_publish(self):
        now = datetime(2026,10,7,2,0,tzinfo=dt_timezone.utc)  # 6 October in Lima
        self.post.starts_at = now+timedelta(hours=1)
        self.post.ends_at = now+timedelta(hours=2)
        self.post.save()
        Birthday.objects.create(wall=self.wall,name='Persona de prueba',day=6,month=10)
        data,_ = snapshot(self.wall)
        before = manifest(data,1,lambda pk:'/asset/'+pk,now=now)
        during = manifest(data,1,lambda pk:'/asset/'+pk,now=now+timedelta(hours=1))
        after = manifest(data,1,lambda pk:'/asset/'+pk,now=now+timedelta(hours=2))
        self.assertFalse(before['contents']);self.assertEqual(len(during['contents']),1);self.assertFalse(after['contents'])
        self.assertTrue(before['birthdays'][0]['is_today'])
        self.assertNotEqual(before['signature'],during['signature'])
        next_day = manifest(data,1,lambda pk:'/asset/'+pk,now=now+timedelta(days=1))
        self.assertNotEqual(before['signature'],next_day['signature'])
        self.assertFalse(next_day['birthdays'][0]['is_today'])

    def test_preview_and_panel_templates_render(self):
        for url in ['/panel/','/panel/biblioteca/','/panel/contenido/nuevo/','/panel/cumpleanos/nuevo/','/panel/publicaciones/','/panel/vista-previa/']:
            self.assertEqual(self.client.get(url).status_code,200,url)
        response = self.client.get('/panel/vista-previa/')
        self.assertContains(response,'muro-bootstrap')
        self.assertContains(response,'draft-0')
        self.assertNotContains(response,'{% static')
        self.assertEqual(self.live()['version'],0)

    def test_tv_requires_active_capability_and_only_sees_published_assets(self):
        outsider = Client()
        self.assertEqual(outsider.get('/tv/not-a-valid-token/').status_code,404)
        self.assertEqual(outsider.get(reverse('editor_media',args=[self.asset.pk])).status_code,302)
        url = reverse('tv_media',args=[self.screen.token,self.asset.pk])
        self.assertEqual(outsider.get(url).status_code,404)
        publish(self.editor,0)
        response = outsider.get(url)
        self.assertEqual(response.status_code,200);response.close()
        draft_url = reverse('tv_media',args=[self.screen.token,self.video.pk])
        self.assertEqual(outsider.get(draft_url).status_code,404)
        self.screen.active=False;self.screen.save()
        self.assertEqual(outsider.get(url).status_code,404)

    def test_historical_media_keeps_playing_and_supports_ranges(self):
        self.post.kind='video';self.post.asset=self.video;self.post.save()
        publish(self.editor,0)
        self.post.delete();publish(self.editor,0)
        url = reverse('tv_media',args=[self.screen.token,self.video.pk])
        response = Client().get(url,HTTP_RANGE='bytes=4-7')
        self.assertEqual(response.status_code,206)
        self.assertEqual(b''.join(response.streaming_content),b'ftyp')
        self.assertEqual(response['Content-Length'],'4')
        suffix = Client().get(url,HTTP_RANGE='bytes=-10')
        self.assertEqual(len(b''.join(suffix.streaming_content)),10)
        invalid = Client().get(url,HTTP_RANGE='bytes=9999999-')
        self.assertEqual(invalid.status_code,416)
        head = Client().head(url,HTTP_RANGE='bytes=0-9')
        self.assertEqual(head.status_code,206);self.assertEqual(head.content,b'');self.assertEqual(head['Content-Length'],'10')

    def test_upload_rejects_html_and_malformed_images(self):
        for kind,filename in [('image','script.png'),('video','script.mp4'),('audio','script.mp3')]:
            form=AssetForm({'title':'Archivo','kind':kind},{'file':SimpleUploadedFile(filename,b'<script>alert(1)</script>')})
            self.assertFalse(form.is_valid())

    def test_upload_persists_and_uses_opaque_path(self):
        image=io.BytesIO();Image.new('RGB',(2,2)).save(image,format='PNG')
        response=self.client.post('/panel/biblioteca/',{'title':'Foto guardada','kind':'image','file':SimpleUploadedFile('mi-foto.png',image.getvalue())})
        self.assertEqual(response.status_code,302)
        saved=Asset.objects.get(title='Foto guardada')
        self.assertNotIn('mi-foto',saved.file.name)
        self.assertTrue(saved.file.storage.exists(saved.file.name))
        self.assertEqual(self.live()['version'],0)

    def test_saving_content_increments_revision_and_rejects_stale_editor(self):
        data={'revision':0,'kind':'message','title':'Mensaje guardado','duration_seconds':16,'sort_order':1,'enabled':'on'}
        self.assertEqual(self.client.post('/panel/contenido/nuevo/',data).status_code,302)
        self.wall.refresh_from_db();self.assertEqual(self.wall.revision,1)
        response=self.client.post('/panel/contenido/nuevo/',data)
        self.assertEqual(response.status_code,200)
        self.assertContains(response,'Otra persona guardó cambios')
        self.assertEqual(Content.objects.filter(title='Mensaje guardado').count(),1)

    def test_form_validation_for_asset_types_and_dates(self):
        form=ContentForm({'revision':0,'kind':'video','title':'Mal tipo','asset':str(self.asset.pk),'duration_seconds':16,'sort_order':1})
        self.assertFalse(form.is_valid());self.assertIn('asset',form.errors)
        form=BirthdayForm({'revision':0,'name':'Día inválido','day':31,'month':2})
        self.assertFalse(form.is_valid())
        self.assertTrue(BirthdayForm({'revision':0,'name':'Día bisiesto','day':29,'month':2}).is_valid())

    def test_settings_stay_in_draft_and_stale_settings_cannot_overwrite(self):
        first = publish(self.editor, 0)
        data = {'revision': 0, 'name': 'Muro actualizado', 'welcome_title': 'Bienvenidos',
                'welcome_body': 'Nuestro equipo', 'ticker': 'Noticias de Telecable',
                'interval_minutes': 5, 'videos_per_turn': 'all', 'qr_enabled': 'on'}
        self.assertEqual(self.client.post('/panel/', data).status_code, 302)
        self.wall.refresh_from_db()
        self.assertEqual(self.wall.revision, 1)
        self.assertEqual(self.wall.name, 'Muro actualizado')
        self.assertEqual(self.live()['config']['name'], first.snapshot['config']['name'])
        data['name'] = 'Cambio desde un formulario antiguo'
        response = self.client.post('/panel/', data)
        self.assertContains(response, 'Otra persona guardó cambios')
        self.wall.refresh_from_db()
        self.assertEqual(self.wall.name, 'Muro actualizado')
        publish(self.editor, 1)
        self.assertEqual(self.live()['config']['name'], 'Muro actualizado')

    def test_post_csrf_and_safe_methods(self):
        strict=Client(enforce_csrf_checks=True);strict.force_login(self.editor)
        self.assertEqual(strict.post('/panel/publicar/',{'revision':0}).status_code,403)
        self.assertEqual(self.client.get('/panel/publicar/').status_code,405)

    def test_publish_failure_does_not_replace_previous_live_version(self):
        previous=publish(self.editor,0)
        bad=Content.objects.create(wall=self.wall,kind='video',title='Sin archivo')
        with self.assertRaises(ValidationError):
            publish(self.editor,0)
        self.wall.refresh_from_db()
        self.assertEqual(self.wall.current_publication_id,previous.pk)
        self.assertEqual(Publication.objects.count(),1)

    def test_ti_can_create_and_revoke_display(self):
        self.client.force_login(self.admin)
        self.assertEqual(self.client.post('/panel/pantallas/',{'name':'TV Recepción'}).status_code,302)
        display=Display.objects.get(name='TV Recepción');old=display.token
        self.assertEqual(self.client.get('/panel/pantallas/').status_code,200)
        self.client.post(reverse('display_action',args=[display.pk]),{'action':'rotate'})
        display.refresh_from_db();self.assertNotEqual(display.token,old)
        self.assertEqual(Client().get(reverse('tv',args=[old])).status_code,404)

    def test_content_is_escaped_and_user_cannot_inject_bootstrap_script(self):
        self.post.title='</script><script>alert(1)</script>';self.post.save()
        response=self.client.get('/panel/vista-previa/')
        self.assertNotContains(response,'</script><script>alert(1)</script>')
        self.assertContains(response,r'\u003C/script\u003E')
