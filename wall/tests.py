import copy
import io
import re
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

    def test_birthday_photo_is_private_until_published_and_snapshot_is_immutable(self):
        self.post.delete()  # This photo is used only by the birthday.
        person = Birthday.objects.create(wall=self.wall,name='Persona de prueba',day=6,month=10,
                                         photo=self.asset,greeting='¡Gracias por ser parte del equipo!')
        url = reverse('tv_media',args=[self.screen.token,self.asset.pk])
        self.assertEqual(Client().get(url).status_code,404)
        first = publish(self.editor,0)
        self.assertIn(self.asset,first.assets.all())
        self.assertEqual(self.live()['birthdays'][0]['photo_url'],url)
        self.assertEqual(Client().head(url).status_code,200)
        person.photo=None;person.greeting='Otra dedicatoria';person.save()
        self.assertEqual(self.live()['birthdays'][0]['greeting'],'¡Gracias por ser parte del equipo!')
        self.assertEqual(self.live()['birthdays'][0]['photo_url'],url)
        publish(self.editor,0)
        self.assertIsNone(self.live()['birthdays'][0]['photo_url'])
        self.assertEqual(Client().head(url).status_code,200)  # Old TVs can finish their card.

    def test_birthday_form_accepts_optional_image_and_rejects_video_or_long_greeting(self):
        data={'revision':0,'name':'Persona de prueba','department':'Operaciones','day':26,'month':9,
              'photo':str(self.asset.pk),'greeting':'Un gran año para ti.','enabled':'on'}
        self.assertTrue(BirthdayForm(data).is_valid())
        self.assertEqual(self.client.post('/panel/cumpleanos/nuevo/',data).status_code,302)
        person=Birthday.objects.get(name='Persona de prueba')
        self.assertEqual(person.photo_id,self.asset.pk)
        self.wall.refresh_from_db();self.assertEqual(self.wall.revision,1)
        self.assertEqual(self.live()['version'],0)
        self.assertFalse(BirthdayForm(dict(data,photo=str(self.video.pk))).is_valid())
        person.photo=self.video
        with self.assertRaises(ValidationError):person.full_clean()
        self.assertFalse(BirthdayForm(dict(data,greeting='x'*181)).is_valid())
        self.assertTrue(BirthdayForm(dict(data,photo='',greeting='')).is_valid())

    def test_individual_birthday_preview_does_not_change_date_or_publication(self):
        person=Birthday.objects.create(wall=self.wall,name='Tarjeta </script><script>alert(1)</script>',
                                       day=26,month=9,enabled=False,photo=self.asset,greeting='Un nuevo año.')
        url=reverse('birthday_preview',args=[person.pk])
        self.assertEqual(Client().get(url).status_code,302)
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(url).status_code,403)
        self.client.force_login(self.editor)
        response=self.client.get(url)
        self.assertEqual(response.status_code,200)
        data=response.context['bootstrap']['manifest']
        self.assertTrue(data['preview'])
        self.assertEqual(response.context['bootstrap']['poll_url'],reverse('birthday_preview_manifest',args=[person.pk]))
        self.assertEqual(data['contents'],[]);self.assertEqual(len(data['birthdays']),1)
        self.assertTrue(data['birthdays'][0]['is_today'])
        self.assertEqual(data['birthdays'][0]['photo_url'],reverse('editor_media',args=[self.asset.pk]))
        self.assertNotContains(response,'</script><script>alert(1)</script>')
        person.refresh_from_db();self.wall.refresh_from_db()
        self.assertEqual((person.day,person.month,person.enabled),(26,9,False))
        self.assertEqual(self.wall.revision,0);self.assertEqual(Publication.objects.count(),0)

    def test_missing_birthday_photo_does_not_replace_live_publication(self):
        first=publish(self.editor,0)
        missing=Asset.objects.create(title='Foto ausente',kind='image',file='missing.jpg',size=10,
                                     content_type='image/jpeg',created_by=self.editor)
        person=Birthday.objects.create(wall=self.wall,name='Persona de prueba',day=26,month=9,photo=missing)
        with self.assertRaises(ValidationError):publish(self.editor,0)
        self.wall.refresh_from_db();self.assertEqual(self.wall.current_publication_id,first.pk)
        self.assertRedirects(self.client.get(reverse('birthday_preview',args=[person.pk])),
                             reverse('birthday_edit',args=[person.pk]),fetch_redirect_response=False)

    def test_old_birthday_publications_remain_compatible_and_repeat_each_year(self):
        data,_=snapshot(self.wall)
        data['birthdays']=[{'id':1,'name':'Persona de prueba','department':'TI','day':26,'month':9}]
        first=Publication.objects.create(wall=self.wall,number=1,draft_revision=0,snapshot=data,published_by=self.editor)
        restored=publish(self.editor,0,restore=first.pk)
        for year in [2026,2027]:
            at_midnight=datetime(year,9,26,5,0,tzinfo=dt_timezone.utc)
            before=manifest(restored.snapshot,2,lambda pk:'/asset/'+pk,now=at_midnight-timedelta(minutes=1))
            today=manifest(restored.snapshot,2,lambda pk:'/asset/'+pk,now=at_midnight)
            after=manifest(restored.snapshot,2,lambda pk:'/asset/'+pk,now=at_midnight+timedelta(days=1))
            self.assertFalse(before['birthdays'][0]['is_today'])
            self.assertTrue(today['birthdays'][0]['is_today'])
            self.assertFalse(after['birthdays'][0]['is_today'])
            self.assertIsNone(today['birthdays'][0]['photo_url'])
            self.assertEqual(today['birthdays'][0]['greeting'],'')

    def test_preview_and_panel_templates_render(self):
        for url in ['/panel/','/panel/biblioteca/','/panel/contenido/nuevo/','/panel/cumpleanos/nuevo/','/panel/publicaciones/','/panel/vista-previa/']:
            self.assertEqual(self.client.get(url).status_code,200,url)
        response = self.client.get('/panel/vista-previa/')
        self.assertContains(response,'muro-bootstrap')
        self.assertContains(response,'draft-0')
        self.assertNotContains(response,'{% static')
        self.assertEqual(self.live()['version'],0)

    def test_live_previews_refresh_saved_changes_without_publishing(self):
        first = publish(self.editor,0)
        draft_url, live_url = reverse('preview_manifest'), reverse('published_preview_manifest')
        initial = self.client.get(draft_url)
        etag = initial['ETag']
        self.assertEqual(self.client.get(draft_url,HTTP_IF_NONE_MATCH=etag).status_code,304)
        self.assertIn('no-store',initial['Cache-Control'])
        data = {'revision':0,'kind':'image','title':'Cambio guardado','asset':self.asset.pk,
                'duration_seconds':16,'sort_order':10,'enabled':'on'}
        self.assertEqual(self.client.post(reverse('content_edit',args=[self.post.pk]),data).status_code,302)
        changed = self.client.get(draft_url,HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(changed.status_code,200)
        self.assertEqual(changed.json()['contents'][0]['title'],'Cambio guardado')
        self.assertEqual(self.client.get(live_url).json()['contents'][0]['title'],'Titular original')
        self.assertEqual(self.live()['version'],first.number)
        publish(self.editor,1)
        self.assertEqual(self.client.get(live_url).json()['contents'][0]['title'],'Cambio guardado')
        self.assertEqual(self.client.get(reverse('preview')).context['bootstrap']['poll_url'],draft_url)
        live_page = self.client.get(reverse('published_preview'))
        self.assertEqual(live_page.context['bootstrap']['poll_url'],live_url)
        self.assertFalse(live_page.context['bootstrap']['manifest']['preview'])
        self.assertNotContains(live_page,self.screen.token)

    def test_preview_polling_permissions_and_birthday_refresh(self):
        person = Birthday.objects.create(wall=self.wall,name='Persona',day=26,month=9,enabled=False)
        birthday_url = reverse('birthday_preview_manifest',args=[person.pk])
        urls = [reverse('preview_manifest'),reverse('published_preview'),reverse('published_preview_manifest'),birthday_url]
        anonymous = Client()
        for url in urls:
            self.assertEqual(anonymous.get(url).status_code,302)
        self.client.force_login(self.viewer)
        for url in urls:
            self.assertEqual(self.client.get(url).status_code,403)
        self.client.force_login(self.editor)
        first = self.client.get(birthday_url)
        person.greeting='Nueva dedicatoria';person.save()
        second = self.client.get(birthday_url,HTTP_IF_NONE_MATCH=first['ETag'])
        self.assertEqual(second.status_code,200)
        self.assertEqual(second.json()['birthdays'][0]['greeting'],'Nueva dedicatoria')
        self.assertTrue(second.json()['birthdays'][0]['is_today'])
        self.assertFalse(Birthday.objects.get(pk=person.pk).enabled)
        for url in urls:
            self.assertEqual(self.client.post(url).status_code,405)

    def test_tv_etag_updates_and_revocation_are_checked_before_not_modified(self):
        url = reverse('tv_manifest',args=[self.screen.token])
        anonymous = Client()
        initial = anonymous.get(url)
        unchanged = anonymous.get(url,HTTP_IF_NONE_MATCH=initial['ETag'])
        self.assertEqual(unchanged.status_code,304)
        self.assertEqual(unchanged.content,b'')
        publish(self.editor,0)
        changed = anonymous.get(url,HTTP_IF_NONE_MATCH=initial['ETag'])
        self.assertEqual(changed.status_code,200)
        self.assertEqual(changed.json()['version'],1)
        self.screen.active=False;self.screen.save()
        self.assertEqual(anonymous.get(url,HTTP_IF_NONE_MATCH=changed['ETag']).status_code,404)

    def test_guided_dashboard_matches_saved_draft_after_restore(self):
        self.assertFalse(self.client.get(reverse('dashboard')).context['draft_matches_live'])
        first=publish(self.editor,0)
        self.assertTrue(self.client.get(reverse('dashboard')).context['draft_matches_live'])
        self.post.title='Otro mensaje';self.post.save()
        publish(self.editor,0)
        self.assertTrue(self.client.get(reverse('dashboard')).context['draft_matches_live'])
        publish(self.editor,0,restore=first.pk)
        response=self.client.get(reverse('dashboard'))
        self.assertFalse(response.context['draft_matches_live'])
        self.assertContains(response,'Borrador pendiente de publicar')
        # The publication state comes from the saved draft, not invalid POST values.
        response=self.client.post(reverse('dashboard'),{'revision':0,'name':'Ajuste inválido'})
        self.assertFalse(response.context['draft_matches_live'])

    def test_library_shortcuts_preselect_compatible_assets_without_saving(self):
        count=Content.objects.count()
        response=self.client.get(reverse('content_new'),{'asset':str(self.video.pk)})
        self.assertEqual(response.context['form']['kind'].value(),'video')
        self.assertEqual(str(response.context['form']['asset'].value()),str(self.video.pk))
        response=self.client.get(reverse('birthday_new'),{'asset':str(self.asset.pk)})
        self.assertEqual(str(response.context['form']['photo'].value()),str(self.asset.pk))
        for value in [str(self.video.pk),'invalid-uuid']:
            response=self.client.get(reverse('birthday_new'),{'asset':value})
            self.assertEqual(response.status_code,200)
            self.assertIsNone(response.context['form']['photo'].value())
        self.assertEqual(Content.objects.count(),count)
        self.assertEqual(Publication.objects.count(),0)

    def test_invalid_draft_has_recoverable_preview_error(self):
        first=publish(self.editor,0)
        missing=Asset.objects.create(title='No disponible',kind='image',file='missing-guided.jpg',size=10,
                                    content_type='image/jpeg',created_by=self.editor)
        self.post.asset=missing;self.post.save()
        response=self.client.get(reverse('preview_manifest'))
        self.assertEqual(response.status_code,422)
        self.assertIn('Falta el archivo',response.json()['error'])
        self.assertRedirects(self.client.get(reverse('preview')),reverse('dashboard'),fetch_redirect_response=False)
        response=self.client.get(reverse('dashboard'))
        self.assertContains(response,'Falta el archivo')
        self.assertEqual(self.live()['version'],first.number)

    def test_tv_requires_active_capability_and_only_sees_published_assets(self):
        outsider = Client()
        self.assertEqual(outsider.get('/tv/not-a-valid-token/').status_code,404)
        self.assertEqual(outsider.get(reverse('editor_media',args=[self.asset.pk])).status_code,302)
        url = reverse('tv_media',args=[self.screen.token,self.asset.pk])
        self.assertEqual(outsider.get(url).status_code,404)
        publish(self.editor,0)
        response = outsider.get(url)
        self.assertEqual(response.status_code,200)
        # Consume the stream so Django's test client closes it with its own
        # request_finished handling; closing directly breaks the test transaction.
        self.assertGreater(len(b''.join(response.streaming_content)),0)
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

    @override_settings(ALLOWED_HOSTS=['127.0.0.1', 'localhost', 'muro.example.test'], CSRF_TRUSTED_ORIGINS=[])
    def test_login_and_logout_forms_with_csrf_for_both_roles(self):
        # Exercise the actual forms; force_login() bypasses this browser flow.
        for user in [self.editor, self.admin]:
            for host, secure in [('127.0.0.1:8000', False), ('localhost:8000', False), ('muro.example.test', True)]:
                with self.subTest(user=user.username, host=host):
                    browser = Client(enforce_csrf_checks=True)
                    transport = {'HTTP_HOST': host, 'secure': secure}
                    login_page = browser.get('/cuentas/entrar/?next=/panel/', **transport)
                    self.assertEqual(login_page.status_code, 200)
                    self.assertEqual(login_page['Referrer-Policy'], 'same-origin')
                    token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', login_page.content.decode()).group(1)
                    origin = ('https://' if secure else 'http://') + host
                    response = browser.post('/cuentas/entrar/', {
                        'username': user.username, 'password': 'only-for-tests',
                        'csrfmiddlewaretoken': token, 'next': '/panel/',
                    }, HTTP_ORIGIN=origin, **transport)
                    self.assertRedirects(response, '/panel/', fetch_redirect_response=False)
                    self.assertEqual(browser.session['_auth_user_id'], str(user.pk))
                    panel = browser.get('/panel/', **transport)
                    self.assertEqual(panel.status_code, 200)
                    self.assertEqual(browser.get('/panel/pantallas/', **transport).status_code, 200 if user.is_superuser else 403)
                    token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', panel.content.decode()).group(1)
                    response = browser.post('/cuentas/salir/', {'csrfmiddlewaretoken': token}, HTTP_ORIGIN=origin, **transport)
                    self.assertEqual(response.status_code, 302)
                    self.assertNotIn('_auth_user_id', browser.session)

    @override_settings(ALLOWED_HOSTS=['127.0.0.1'], CSRF_TRUSTED_ORIGINS=[])
    def test_login_still_rejects_null_foreign_origins_and_missing_token(self):
        for origin, include_token in [('null', True), ('https://untrusted.example', True), ('http://127.0.0.1:8000', False)]:
            with self.subTest(origin=origin, include_token=include_token):
                browser = Client(enforce_csrf_checks=True)
                page = browser.get('/cuentas/entrar/', HTTP_HOST='127.0.0.1:8000')
                data = {'username': self.editor.username, 'password': 'only-for-tests'}
                if include_token:
                    data['csrfmiddlewaretoken'] = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', page.content.decode()).group(1)
                response = browser.post('/cuentas/entrar/', data, HTTP_HOST='127.0.0.1:8000', HTTP_ORIGIN=origin)
                self.assertEqual(response.status_code, 403)
                self.assertNotIn('_auth_user_id', browser.session)

    @override_settings(ALLOWED_HOSTS=['muro.example.test'], CSRF_TRUSTED_ORIGINS=[])
    def test_https_login_checks_referer_when_origin_is_absent(self):
        for referer in [None, 'https://untrusted.example/login/', 'https://muro.example.test/cuentas/entrar/']:
            with self.subTest(referer=referer):
                browser = Client(enforce_csrf_checks=True)
                page = browser.get('/cuentas/entrar/', HTTP_HOST='muro.example.test', secure=True)
                token = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', page.content.decode()).group(1)
                headers = {'HTTP_REFERER': referer} if referer else {}
                response = browser.post('/cuentas/entrar/', {
                    'username': self.editor.username, 'password': 'only-for-tests', 'csrfmiddlewaretoken': token,
                }, HTTP_HOST='muro.example.test', secure=True, **headers)
                expected = 302 if referer == 'https://muro.example.test/cuentas/entrar/' else 403
                self.assertEqual(response.status_code, expected)

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
